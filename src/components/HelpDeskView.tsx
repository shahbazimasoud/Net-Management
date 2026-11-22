import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Headphones,
  ShieldCheck,
  Cpu,
  HardDrive,
  Activity,
  Network,
  Printer,
  RefreshCw,
  Search,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Globe,
  Play,
  RotateCcw,
  Trash2,
  FileCode2,
  Copy,
  Check,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Layers,
  Eraser,
  Server,
} from 'lucide-react';
import { AccessPolicy } from '../types';
import { AuthUser } from '../context/AuthContext';
import { isUserSuperAdmin } from '../utils/rbac';
import {
  fetchHelpdeskStatus,
  fetchHelpdeskEndpointHealth,
  fetchHelpdeskNetworkSnapshot,
  runHelpdeskNetworkProbe,
  executeHelpdeskNetworkAction,
  fetchHelpdeskPrinterStatus,
  executeHelpdeskPrinterAction,
  HelpdeskConnectionPayload,
} from '../services/api';
import { FieldInfoTooltip } from './common/FieldInfoTooltip';
import { useModalDock } from '../context/ModalDockContext';

interface HelpDeskViewProps {
  isLightMode: boolean;
  isEn: boolean;
  effectivePolicy?: AccessPolicy | null;
  currentUser?: AuthUser | null;
}

type HelpdeskSubTab = 'health' | 'network' | 'printers' | 'architecture';

interface CircularGaugeProps {
  value: number;
  label: string;
  primaryText: string;
  secondaryText: string;
  isLightMode: boolean;
  size?: number;
}

const CircularGauge: React.FC<CircularGaugeProps> = ({
  value,
  label,
  primaryText,
  secondaryText,
  isLightMode,
  size = 124,
}) => {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);

  const strokeColor =
    clamped >= 85 ? '#e11d48' : clamped >= 65 ? '#d97706' : '#0ea5e9';
  const stateLabelColor =
    clamped >= 85
      ? isLightMode
        ? 'text-rose-700'
        : 'text-rose-400'
      : clamped >= 65
      ? isLightMode
        ? 'text-amber-700'
        : 'text-amber-400'
      : isLightMode
      ? 'text-sky-700'
      : 'text-sky-400';

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={isLightMode ? '#e2e8f0' : '#1e293b'}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.45s cubic-bezier(0.16, 1, 0.3, 1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-xl font-bold font-mono tabular-nums ${stateLabelColor}`}>
            {clamped.toFixed(1)}%
          </span>
          <span className={`text-[11px] font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
            {label}
          </span>
        </div>
      </div>
      <div className={`mt-2.5 text-xs font-semibold font-mono tabular-nums ${isLightMode ? 'text-slate-900' : 'text-slate-100'}`}>
        {primaryText}
      </div>
      <div className={`text-[11px] truncate max-w-[200px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
        {secondaryText}
      </div>
    </div>
  );
};

const PROCESS_PALETTE = [
  '#0ea5e9', // sky
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#64748b', // slate (others)
];

export const HelpDeskView: React.FC<HelpDeskViewProps> = ({
  isLightMode,
  isEn,
  effectivePolicy,
  currentUser,
}) => {
  const { dockModal, undockModal } = useModalDock();
  const isSuper = isUserSuperAdmin(currentUser, effectivePolicy);

  // RBAC permissions (also double-checked by backend on every request)
  const canRunDiagnostics = Boolean(
    isSuper || (effectivePolicy?.canViewHelpdesk !== false && effectivePolicy?.canRunHelpdeskDiagnostics === true)
  );
  const canExecuteActions = Boolean(
    isSuper || (canRunDiagnostics && effectivePolicy?.canExecuteHelpdeskActions === true)
  );

  // Ephemeral On-Demand Session State (NEVER stored in localStorage or DB!)
  const [targetIp, setTargetIp] = useState('');
  const [protocol, setProtocol] = useState<'auto' | 'winrm_https' | 'winrm_http' | 'ssh'>('auto');
  const [customPort, setCustomPort] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [jeaConfigName, setJeaConfigName] = useState('');
  const [showAdvancedConn, setShowAdvancedConn] = useState(false);

  // Active sub-workspace tab
  const [activeSubTab, setActiveSubTab] = useState<HelpdeskSubTab>('health');

  // Guardrail status & JEA templates from backend
  const [rateLimit, setRateLimit] = useState<{
    windowMinutes: number;
    maxWriteActions: number;
    maxDistinctHosts: number;
    usedWriteActions: number;
    remainingWriteActions: number;
    distinctHostsUsed: number;
    isFrozen: boolean;
    freezeUntilIso: string | null;
  } | null>(null);
  const [jeaTemplates, setJeaTemplates] = useState<{
    jeaConfigName: string;
    roleCapabilityScript: string;
    registerSessionScript: string;
  } | null>(null);

  // JEA / GPO Hardening Modal (Universal Modal Rule 7)
  const [isJeaModalOpen, setIsJeaModalOpen] = useState(false);
  const [isJeaModalMaximized, setIsJeaModalMaximized] = useState(false);
  const [copiedJeaKey, setCopiedJeaKey] = useState<string | null>(null);

  // Module 1: Health & Processes state
  const [healthData, setHealthData] = useState<any | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [processSearch, setProcessSearch] = useState('');
  const [processSort, setProcessSort] = useState<'cpu' | 'memory' | 'name'>('cpu');
  const [donutMetric, setDonutMetric] = useState<'cpu' | 'memory'>('cpu');
  const [selectedProcessPid, setSelectedProcessPid] = useState<number | null>(null);

  // Module 2: Network Diagnostics & Safe Reset state
  const [networkData, setNetworkData] = useState<any | null>(null);
  const [loadingNetwork, setLoadingNetwork] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [probeType, setProbeType] = useState<'ping' | 'port' | 'dns'>('ping');
  const [probeTarget, setProbeTarget] = useState('8.8.8.8');
  const [probePort, setProbePort] = useState('443');
  const [loadingProbe, setLoadingProbe] = useState(false);
  const [probeResult, setProbeResult] = useState<any | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [runningNetAction, setRunningNetAction] = useState<string | null>(null);
  const [netActionResult, setNetActionResult] = useState<any | null>(null);

  // Module 3: Printers & Print Spooler state
  const [printerData, setPrinterData] = useState<any | null>(null);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [printerError, setPrinterError] = useState<string | null>(null);
  const [runningSpoolerAction, setRunningSpoolerAction] = useState<string | null>(null);
  const [spoolerActionResult, setSpoolerActionResult] = useState<any | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchHelpdeskStatus()
      .then((res) => {
        if (!mounted) return;
        if (res.rateLimit) setRateLimit(res.rateLimit);
        if (res.jeaTemplates) setJeaTemplates(res.jeaTemplates);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const buildPayload = (): HelpdeskConnectionPayload | null => {
    const cleanIp = targetIp.trim();
    const cleanUser = username.trim();
    if (!cleanIp) {
      const msg = isEn
        ? 'Enter a target workstation IP address or hostname first.'
        : 'ابتدا آدرس IP یا نام سیستم کاربر را وارد کنید.';
      setHealthError(msg);
      return null;
    }
    if (!cleanUser || !password) {
      const msg = isEn
        ? 'Enter ephemeral session username and password (kept in memory only).'
        : 'نام کاربری و رمز عبور موقت نشست را وارد کنید (فقط در حافظه موقت نگهداری می‌شود).';
      setHealthError(msg);
      return null;
    }
    const portNum = customPort.trim() ? Number(customPort.trim()) : undefined;
    return {
      targetIp: cleanIp,
      protocol,
      port: portNum && Number.isInteger(portNum) ? portNum : undefined,
      username: cleanUser,
      password,
      jeaConfigName: jeaConfigName.trim() || undefined,
    };
  };

  const handleClearSession = () => {
    setTargetIp('');
    setUsername('');
    setPassword('');
    setJeaConfigName('');
    setCustomPort('');
    setHealthData(null);
    setHealthError(null);
    setNetworkData(null);
    setNetworkError(null);
    setProbeResult(null);
    setProbeError(null);
    setNetActionResult(null);
    setPrinterData(null);
    setPrinterError(null);
    setSpoolerActionResult(null);
    setSelectedProcessPid(null);
  };

  const handleInspectHealth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    setLoadingHealth(true);
    setHealthError(null);
    try {
      const res = await fetchHelpdeskEndpointHealth(payload);
      setHealthData(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setHealthData(null);
      setHealthError(err?.message || (isEn ? 'Failed to inspect endpoint.' : 'خطا در اتصال و دریافت وضعیت سیستم.'));
    } finally {
      setLoadingHealth(false);
    }
  };

  const handleInspectNetwork = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setLoadingNetwork(true);
    setNetworkError(null);
    try {
      const res = await fetchHelpdeskNetworkSnapshot(payload);
      setNetworkData(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setNetworkData(null);
      setNetworkError(err?.message || (isEn ? 'Failed to inspect endpoint network.' : 'خطا در دریافت اطلاعات شبکه سیستم کاربر.'));
    } finally {
      setLoadingNetwork(false);
    }
  };

  const handleRunProbe = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    setLoadingProbe(true);
    setProbeError(null);
    try {
      const res = await runHelpdeskNetworkProbe({
        ...payload,
        probeType,
        probeTarget: probeTarget.trim(),
        probePort: probeType === 'port' ? Number(probePort) : undefined,
      });
      setProbeResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setProbeResult(null);
      setProbeError(err?.message || (isEn ? 'Diagnostic probe failed.' : 'تست عیب‌یابی با خطا مواجه شد.'));
    } finally {
      setLoadingProbe(false);
    }
  };

  const handleSafeNetworkAction = async (action: 'network_flush_dns' | 'network_renew_ip') => {
    const payload = buildPayload();
    if (!payload) return;
    setRunningNetAction(action);
    setNetworkError(null);
    setNetActionResult(null);
    try {
      const res = await executeHelpdeskNetworkAction({ ...payload, action });
      setNetActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setNetworkError(err?.message || (isEn ? 'Safe network action failed.' : 'اجرای عملیات امن شبکه ناموفق بود.'));
    } finally {
      setRunningNetAction(null);
    }
  };

  const handleInspectPrinters = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setLoadingPrinters(true);
    setPrinterError(null);
    try {
      const res = await fetchHelpdeskPrinterStatus(payload);
      setPrinterData(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setPrinterData(null);
      setPrinterError(err?.message || (isEn ? 'Failed to inspect printers.' : 'خطا در دریافت وضعیت پرینترها و Spooler.'));
    } finally {
      setLoadingPrinters(false);
    }
  };

  const handleSpoolerAction = async (action: 'spooler_restart' | 'spooler_clear_queue') => {
    const payload = buildPayload();
    if (!payload) return;
    setRunningSpoolerAction(action);
    setPrinterError(null);
    setSpoolerActionResult(null);
    try {
      const res = await executeHelpdeskPrinterAction({ ...payload, action });
      setSpoolerActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      // Re-fetch real printer/spooler state after remediation
      try {
        const refreshed = await fetchHelpdeskPrinterStatus(payload);
        setPrinterData(refreshed.data);
      } catch {}
    } catch (err: any) {
      setPrinterError(err?.message || (isEn ? 'Print Spooler action failed.' : 'اجرای عملیات روی سرویس Spooler ناموفق بود.'));
    } finally {
      setRunningSpoolerAction(null);
    }
  };

  const handleConnectCurrentTab = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (activeSubTab === 'network') {
      await handleInspectNetwork();
    } else if (activeSubTab === 'printers') {
      await handleInspectPrinters();
    } else {
      setActiveSubTab('health');
      await handleInspectHealth();
    }
  };

  // Filtered & sorted process list for Module 1
  const filteredProcesses = useMemo(() => {
    const list: any[] = Array.isArray(healthData?.processes) ? healthData.processes : [];
    const q = processSearch.trim().toLowerCase();
    const filtered = q
      ? list.filter(
          (p) =>
            String(p.name || '').toLowerCase().includes(q) ||
            String(p.pid || '').includes(q) ||
            String(p.status || '').toLowerCase().includes(q)
        )
      : list;
    return [...filtered].sort((a, b) => {
      if (processSort === 'memory') return (b.memoryMb || 0) - (a.memoryMb || 0);
      if (processSort === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
      return (b.cpuPercent || 0) - (a.cpuPercent || 0) || (b.memoryMb || 0) - (a.memoryMb || 0);
    });
  }, [healthData, processSearch, processSort]);

  // Top 6 Process Donut segments (SVG circular distribution chart)
  const processDonutSegments = useMemo(() => {
    const list: any[] = Array.isArray(healthData?.processes) ? healthData.processes : [];
    if (list.length === 0) return [];
    const sorted = [...list].sort((a, b) =>
      donutMetric === 'cpu'
        ? (b.cpuPercent || 0) - (a.cpuPercent || 0)
        : (b.memoryPercent || 0) - (a.memoryPercent || 0)
    );
    const top6 = sorted.slice(0, 6);
    const totalUsed = top6.reduce(
      (sum, p) => sum + (donutMetric === 'cpu' ? Number(p.cpuPercent) || 0 : Number(p.memoryPercent) || 0),
      0
    );
    const overallUsed =
      donutMetric === 'cpu'
        ? Number(healthData?.cpu?.usagePercent) || totalUsed
        : Number(healthData?.memory?.usedPercent) || totalUsed;
    const denominator = Math.max(100, overallUsed, totalUsed);

    let cumulative = 0;
    const segments = top6.map((p, idx) => {
      const val = donutMetric === 'cpu' ? Number(p.cpuPercent) || 0 : Number(p.memoryPercent) || 0;
      const pct = Math.max(0, (val / denominator) * 100);
      const startPct = cumulative;
      cumulative += pct;
      return {
        pid: p.pid as number,
        name: String(p.name),
        rawVal: val,
        memoryMb: Number(p.memoryMb) || 0,
        pct,
        startPct,
        color: PROCESS_PALETTE[idx % (PROCESS_PALETTE.length - 1)],
      };
    });

    const otherVal = Math.max(0, overallUsed - totalUsed);
    if (otherVal > 0.2) {
      const otherPct = (otherVal / denominator) * 100;
      segments.push({
        pid: -1,
        name: isEn ? 'Other Processes' : 'سایر پروسس‌ها',
        rawVal: Number(otherVal.toFixed(1)),
        memoryMb: 0,
        pct: otherPct,
        startPct: cumulative,
        color: PROCESS_PALETTE[6],
      });
    }
    return segments;
  }, [healthData, donutMetric, isEn]);

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedJeaKey(key);
      setTimeout(() => setCopiedJeaKey(null), 2000);
    } catch {}
  };

  const handleMinimizeJeaModal = () => {
    dockModal({
      id: 'modal-helpdesk-jea-hardening',
      labelEn: 'HelpDesk JEA & GPO Hardening',
      labelFa: 'اسکریپت امن‌سازی JEA و GPO هلپ‌دسک',
      badge: 'JEA',
      category: 'system',
      onRestore: () => {
        undockModal('modal-helpdesk-jea-hardening');
        setIsJeaModalOpen(true);
      },
      onClose: () => {
        undockModal('modal-helpdesk-jea-hardening');
        setIsJeaModalOpen(false);
      },
    });
    setIsJeaModalOpen(false);
  };

  // Surface styling tokens (60-30-10 discipline, single-level hairline elevation)
  const surfaceBg = isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/75 border-slate-800';
  const subSurfaceBg = isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800';
  const textPrimary = isLightMode ? 'text-slate-900' : 'text-slate-100';
  const textMuted = isLightMode ? 'text-slate-600' : 'text-slate-400';
  const inputCls = isLightMode
    ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-sky-500'
    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-sky-400';

  const isAnyLoading = loadingHealth || loadingNetwork || loadingPrinters;

  const phase1Roadmap = [
    {
      num: '01',
      status: 'live' as const,
      titleEn: 'Read-Only Endpoint Health & Visual Process Telemetry',
      titleFa: 'مشاهده سلامت سیستم و وضعیت گرافیکی پروسس‌ها (فقط‌خواندنی)',
      descEn: 'Live CPU/RAM/Disk radial gauges, interactive process resource donut + progress bars, uptime, active user, Defender & Firewall status.',
      descFa: 'نمایش دایره‌ای و پراگرسی CPU، RAM، دیسک و پروسس‌های پرمصرف، Uptime، کاربر فعال و وضعیت آنتی‌ویروس و فایروال.',
    },
    {
      num: '02',
      status: 'live' as const,
      titleEn: 'Endpoint-Side Network Diagnostics & Safe Reset',
      titleFa: 'عیب‌یابی شبکه از داخل سیستم کاربر + ریست امن',
      descEn: 'Live NIC/DNS/Gateway/Proxy inspection, endpoint-originated Ping/TCP Port/DNS tests, plus allowlisted Flush DNS & Renew DHCP IP.',
      descFa: 'بررسی کارت شبکه، DNS، Gateway و Proxy، اجرای Ping/Port/DNS از داخل کلاینت به همراه دکمه‌های ثابت Flush DNS و Renew IP.',
    },
    {
      num: '03',
      status: 'live' as const,
      titleEn: 'Printer Queue Inspection & Print Spooler Repair',
      titleFa: 'تعمیر پرینتر و مدیریت صف پرینت (محدود فقط به Spooler)',
      descEn: 'Inspect Print Spooler service, installed printers, and stuck print jobs; execute isolated Spooler restart or queue clear.',
      descFa: 'مشاهده سرویس Spooler، پرینترهای نصب‌شده و صف گیرکرده پرینت با امکان ری‌استارت Spooler یا پاک‌سازی ایمن صف.',
    },
    {
      num: '04',
      status: 'planned' as const,
      titleEn: 'Recent Event Viewer Critical & Error Collector',
      titleFa: 'مشاهده خطاهای اخیر Event Viewer (فقط‌خواندنی)',
      descEn: 'Read recent System/Application critical crashes and BSOD indicators without interactive remote desktop login.',
      descFa: 'خواندن آخرین خطاهای Critical/Error ویندوز بدون نیاز به لاگین روی سیستم کاربر.',
    },
    {
      num: '05',
      status: 'planned' as const,
      titleEn: 'Controlled User-Space Process Termination',
      titleFa: 'بستن کنترل‌شده برنامه‌های کاربری هنگ‌کرده',
      descEn: 'Terminate strictly non-system hung user apps (Chrome, Excel, Outlook) with step-up audit trail.',
      descFa: 'بستن صرفاً برنامه‌های کاربری غیرسیستمی (مثل کروم/اکسل) با ثبت کامل در لاگ ممیزی.',
    },
    {
      num: '06',
      status: 'planned' as const,
      titleEn: 'Confined User Temp Folder Cleanup',
      titleFa: 'پاک‌سازی ایمن پوشه Temp کاربر',
      descEn: 'Hard-confined cleanup limited strictly to temporary cache paths when Drive C runs low.',
      descFa: 'پاک‌سازی محدود و ایمن پوشه فایل‌های موقت بدون دسترسی حذف به سایر مسیرها.',
    },
    {
      num: '07',
      status: 'planned' as const,
      titleEn: 'One-Click Group Policy Refresh (gpupdate /force)',
      titleFa: 'اعمال فوری Group Policy با دکمه ثابت',
      descEn: 'Trigger parameterless policy refresh on domain-joined workstations.',
      descFa: 'اجرای بدون پارامتر gpupdate /force جهت اعمال سریع پالیسی‌های دامین.',
    },
    {
      num: '08',
      status: 'planned' as const,
      titleEn: 'Active Directory Account Unlock & Lockout Source',
      titleFa: 'عملیات سریع Active Directory (Unlock و بررسی علت قفل)',
      descEn: 'Inspect lockout state, password expiry, and unlock accounts via LDAPS with RBAC approval.',
      descFa: 'مشاهده وضعیت قفل اکانت، تاریخ انقضای رمز و باز کردن قفل اکانت با کنترل دسترسی RBAC.',
    },
  ];

  return (
    <div className="space-y-6 pb-8" dir={isEn ? 'ltr' : 'rtl'}>
      {/* Page Header — Clean Top Contract */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Headphones className="w-6 h-6 text-teal-500 shrink-0" />
            <h1 className={`text-xl font-bold tracking-tight ${textPrimary}`}>
              {isEn ? 'Agentless Endpoint HelpDesk' : 'هلپ‌دسک بدون‌ایجنت سیستم کاربران (HelpDesk)'}
            </h1>
          </div>
          <p className={`mt-1 text-xs ${textMuted}`}>
            {isEn
              ? 'On-Demand Single-Host Support · Phase 1 (Modules 1–3 Active) · Zero Stored Endpoint Credentials · Anti-Ransomware Allowlisted Execution'
              : 'پشتیبانی لحظه‌ای تک‌سیستمی بدون لیست ثابت · فاز ۱ (موارد ۱ تا ۳ فعال) · بدون ذخیره رمز روی سرور · اجرای صرفاً دستورات ثابت ضدباج‌افزار'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {rateLimit && (
            <div
              className={`px-3 py-2 rounded-lg border text-xs font-mono tabular-nums flex items-center gap-2 ${
                rateLimit.isFrozen
                  ? 'border-rose-500/50 bg-rose-500/10 text-rose-500'
                  : surfaceBg
              }`}
            >
              <ShieldCheck className={`w-4 h-4 ${rateLimit.isFrozen ? 'text-rose-500' : 'text-emerald-500'}`} />
              <span className={textPrimary}>
                {isEn
                  ? `Write Quota: ${rateLimit.remainingWriteActions}/${rateLimit.maxWriteActions} · Hosts: ${rateLimit.distinctHostsUsed}/${rateLimit.maxDistinctHosts}`
                  : `سهمیه تعمیر امن: ${rateLimit.remainingWriteActions}/${rateLimit.maxWriteActions} · سیستم‌ها: ${rateLimit.distinctHostsUsed}/${rateLimit.maxDistinctHosts}`}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsJeaModalOpen(true)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
              isLightMode
                ? 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5 text-teal-500" />
            <span>{isEn ? 'Windows JEA / GPO Hardening' : 'اسکریپت امن‌سازی JEA / GPO'}</span>
          </button>
        </div>
      </div>

      {/* On-Demand Single-Host Connection Bar (Zero Pre-Populated Endpoint List!) */}
      <form
        onSubmit={handleConnectCurrentTab}
        className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Server className="w-4 h-4 text-sky-500" />
            <span className={textPrimary}>
              {isEn ? 'On-Demand Target Workstation Session' : 'اتصال لحظه‌ای به سیستم کاربر (بدون لیست از پیش ثبت‌شده)'}
            </span>
            <FieldInfoTooltip
              isEn={isEn}
              isLightMode={isLightMode}
              fieldName={isEn ? 'On-Demand Single-Host Connection' : 'اتصال لحظه‌ای تک‌سیستمی'}
              whatIsIt={
                isEn
                  ? 'Connects directly to a single workstation IP on demand via WinRM HTTPS/HTTP or SSH without storing endpoint inventory or static passwords.'
                  : 'به صورت لحظه‌ای از طریق WinRM HTTPS/HTTP یا SSH فقط به یک سیستم کاربر متصل می‌شود و هیچ IP یا رمز عبوری را در دیتابیس ذخیره نمی‌کند.'
              }
              whyNeeded={
                isEn
                  ? 'Prevents the panel from holding a persistent fleet credential database and eliminates mass lateral-movement risk.'
                  : 'مانع از نگهداری رمزهای ثابت کلاینت‌ها در سرور پنل شده و ریسک انتشار باج‌افزار یا حمله گروهی را به حداقل می‌رساند.'
              }
              example={
                isEn
                  ? 'IP: 192.168.10.45 · Protocol: Auto · User: CORP\\helpdesk_svc'
                  : 'مثال IP: 192.168.10.45 · پروتکل: Auto · نام کاربری: CORP\\helpdesk_svc'
              }
            />
          </div>

          <div className={`text-[11px] flex items-center gap-3 ${textMuted}`}>
            <span>{isEn ? 'Credentials stay in RAM only' : 'رمز عبور فقط در حافظه موقت می‌ماند'}</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setShowAdvancedConn((v) => !v)}
              className="text-sky-500 hover:underline font-medium cursor-pointer"
            >
              {showAdvancedConn
                ? isEn
                  ? 'Hide JEA / Port'
                  : 'بستن تنظیمات JEA / پورت'
                : isEn
                ? 'JEA Endpoint / Port'
                : 'تنظیم JEA / پورت دلخواه'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          {/* Target IP */}
          <div className="lg:col-span-3">
            <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
              {isEn ? 'Target Workstation IP / Hostname' : 'آدرس IP یا نام سیستم کاربر'}
            </label>
            <input
              type="text"
              dir="ltr"
              value={targetIp}
              onChange={(e) => setTargetIp(e.target.value)}
              placeholder="192.168.10.45"
              className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none transition ${inputCls}`}
              required
            />
          </div>

          {/* Protocol */}
          <div className="lg:col-span-2">
            <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
              {isEn ? 'Protocol' : 'پروتکل اتصال'}
            </label>
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as any)}
              className={`w-full px-3 py-2 rounded-lg border text-xs outline-none transition ${inputCls}`}
            >
              <option value="auto">{isEn ? 'Auto (5986 → 5985 → 22)' : 'خودکار (5986 → 5985 → 22)'}</option>
              <option value="winrm_https">WinRM HTTPS (5986)</option>
              <option value="winrm_http">WinRM HTTP (5985)</option>
              <option value="ssh">OpenSSH / Linux (22)</option>
            </select>
          </div>

          {/* Ephemeral Username */}
          <div className="lg:col-span-2">
            <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
              {isEn ? 'Session Username' : 'نام کاربری نشست'}
            </label>
            <input
              type="text"
              dir="ltr"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="CORP\helpdesk"
              className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none transition ${inputCls}`}
              required
            />
          </div>

          {/* Ephemeral Password */}
          <div className="lg:col-span-3">
            <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
              {isEn ? 'Session Password (Ephemeral)' : 'رمز عبور موقت نشست'}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none transition pe-9 ${inputCls}`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className={`absolute top-1/2 -translate-y-1/2 end-2.5 p-1 ${textMuted} hover:text-sky-500 cursor-pointer`}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Primary Action + Wipe */}
          <div className="lg:col-span-2 flex items-center gap-2">
            <button
              type="submit"
              disabled={!canRunDiagnostics || isAnyLoading}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition whitespace-nowrap cursor-pointer"
            >
              {isAnyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
              <span>{isEn ? 'Connect & Inspect' : 'اتصال و پایش'}</span>
            </button>
            <button
              type="button"
              onClick={handleClearSession}
              title={isEn ? 'Wipe session credentials & results from memory' : 'پاک‌سازی فوری IP، رمز و نتایج از حافظه'}
              className={`p-2 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {showAdvancedConn && (
          <div className={`pt-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-3 ${isLightMode ? 'border-slate-200' : 'border-slate-800'}`}>
            <div>
              <label className={`block text-xs font-medium mb-1 ${textMuted}`}>
                {isEn ? 'Custom Windows JEA Endpoint Name (Optional)' : 'نام JEA Endpoint محدودشده ویندوز (اختیاری)'}
              </label>
              <input
                type="text"
                dir="ltr"
                value={jeaConfigName}
                onChange={(e) => setJeaConfigName(e.target.value)}
                placeholder="HelpDeskSafeJEA"
                className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
              />
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1 ${textMuted}`}>
                {isEn ? 'Custom Port Override (Optional)' : 'پورت دلخواه (اختیاری)'}
              </label>
              <input
                type="number"
                dir="ltr"
                min={1}
                max={65535}
                value={customPort}
                onChange={(e) => setCustomPort(e.target.value)}
                placeholder="5986 / 5985 / 22"
                className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
              />
            </div>
          </div>
        )}
      </form>

      {/* Segmented Workspace Navigation Tabs (Interactive Controls) */}
      <div
        className={`flex flex-wrap items-center gap-1 p-1 rounded-xl border ${
          isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}
      >
        {[
          {
            id: 'health' as HelpdeskSubTab,
            icon: Cpu,
            labelEn: '01. System Health & Processes',
            labelFa: '۱. سلامت سیستم و پروسس‌ها',
          },
          {
            id: 'network' as HelpdeskSubTab,
            icon: Network,
            labelEn: '02. Endpoint Network & Safe Reset',
            labelFa: '۲. عیب‌یابی شبکه و ریست امن',
          },
          {
            id: 'printers' as HelpdeskSubTab,
            icon: Printer,
            labelEn: '03. Printers & Spooler Repair',
            labelFa: '۳. پرینترها و تعمیر Spooler',
          },
          {
            id: 'architecture' as HelpdeskSubTab,
            icon: Layers,
            labelEn: 'Phase 1 Plan & Anti-Ransomware Guards',
            labelFa: 'جمع‌بندی فاز ۱ و معماری ضدباج‌افزار',
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                active
                  ? isLightMode
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'bg-slate-800 text-white shadow-xs'
                  : isLightMode
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? 'text-sky-500' : ''}`} />
              <span>{isEn ? tab.labelEn : tab.labelFa}</span>
            </button>
          );
        })}
      </div>

      {/* =================================================================== */}
      {/* TAB 1: SYSTEM HEALTH & LIVE VISUAL PROCESS TELEMETRY                */}
      {/* =================================================================== */}
      {activeSubTab === 'health' && (
        <div className="space-y-6">
          {healthError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 flex items-start gap-3 text-xs text-rose-500">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold">
                  {isEn ? 'Endpoint Connection / Telemetry Error' : 'خطا در اتصال یا دریافت وضعیت سیستم کاربر'}
                </div>
                <div className={isLightMode ? 'text-rose-800' : 'text-rose-200'}>{healthError}</div>
              </div>
            </div>
          )}

          {!healthData && !loadingHealth && (
            <div className={`rounded-xl border p-10 text-center space-y-3 ${surfaceBg}`}>
              <Cpu className="w-10 h-10 mx-auto text-sky-500 opacity-80" />
              <h2 className={`text-base font-bold ${textPrimary}`}>
                {isEn ? 'Ready for Live Endpoint Health Inspection' : 'آماده پایش لحظه‌ای سلامت و پروسس‌های سیستم کاربر'}
              </h2>
              <p className={`text-xs max-w-xl mx-auto ${textMuted}`}>
                {isEn
                  ? 'Enter the user workstation IP and ephemeral credentials above, then click "Connect & Inspect". Live CPU, RAM, Disk radial gauges, security posture, and interactive process rings will populate directly from the endpoint.'
                  : 'آدرس IP سیستم کاربر و مشخصات ورود موقت را در نوار بالا وارد کرده و دکمه «اتصال و پایش» را بزنید. نمودارهای دایره‌ای CPU، RAM، دیسک، وضعیت امنیت و نمای گرافیکی پروسس‌ها به صورت مستقیم و واقعی از سیستم کاربر خوانده می‌شود.'}
              </p>
            </div>
          )}

          {loadingHealth && (
            <div className={`rounded-xl border p-10 text-center space-y-3 ${surfaceBg}`}>
              <Loader2 className="w-8 h-8 mx-auto text-sky-500 animate-spin" />
              <div className={`text-sm font-semibold ${textPrimary}`}>
                {isEn
                  ? `Connecting to ${targetIp} and sampling live CPU, memory, disk & process telemetry...`
                  : `در حال اتصال به ${targetIp} و خواندن لحظه‌ای وضعیت CPU، RAM، دیسک و پروسس‌ها...`}
              </div>
            </div>
          )}

          {healthData && !loadingHealth && (
            <>
              {/* Endpoint Identity & Security Strip */}
              <div className={`rounded-xl border p-4 sm:p-5 ${surfaceBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h2 className={`text-base font-bold ${textPrimary}`}>
                      {healthData.hostname}
                      <span className={`ms-2 text-xs font-mono font-normal ${textMuted}`}>
                        ({healthData.targetIp})
                      </span>
                    </h2>
                    <div className={`text-xs mt-0.5 flex flex-wrap items-center gap-2 ${textMuted}`}>
                      <span>{healthData.osName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{healthData.protocolUsed.toUpperCase()}:{healthData.portUsed}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {isEn ? 'User' : 'کاربر فعال'}: <strong className={textPrimary}>{healthData.loggedInUser || '-'}</strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {isEn ? 'Uptime' : 'زمان روشن بودن'}: {healthData.uptimeText}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInspectHealth()}
                    disabled={loadingHealth}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold hover:border-sky-500 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-sky-500" />
                    <span>{isEn ? 'Refresh Live Data' : 'بروزرسانی زنده'}</span>
                  </button>
                </div>

                {/* 3 Crisp Circular Radial Gauges (CPU, RAM, Primary Disk) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-6">
                  <CircularGauge
                    value={healthData.cpu?.usagePercent ?? 0}
                    label="CPU"
                    primaryText={`${healthData.cpu?.cores ?? 1}C / ${healthData.cpu?.logicalProcessors ?? 1}T`}
                    secondaryText={healthData.cpu?.modelName || (isEn ? 'Processor' : 'پردازنده')}
                    isLightMode={isLightMode}
                  />
                  <CircularGauge
                    value={healthData.memory?.usedPercent ?? 0}
                    label="RAM"
                    primaryText={`${healthData.memory?.usedGb ?? 0} / ${healthData.memory?.totalGb ?? 0} GB`}
                    secondaryText={`${isEn ? 'Free' : 'آزاد'}: ${healthData.memory?.freeGb ?? 0} GB`}
                    isLightMode={isLightMode}
                  />
                  <CircularGauge
                    value={healthData.disks?.[0]?.usedPercent ?? 0}
                    label={healthData.disks?.[0]?.drive || 'Disk'}
                    primaryText={
                      healthData.disks?.[0]
                        ? `${healthData.disks[0].usedGb} / ${healthData.disks[0].totalGb} GB`
                        : '-'
                    }
                    secondaryText={
                      healthData.disks?.[0]
                        ? `${isEn ? 'Free' : 'فضای خالی'}: ${healthData.disks[0].freeGb} GB (${healthData.disks[0].fileSystem || '-'})`
                        : isEn
                        ? 'No fixed disk reported'
                        : 'دیسکی گزارش نشد'
                    }
                    isLightMode={isLightMode}
                  />
                </div>

                {/* Security Posture & Mounted Disks Split */}
                <div className={`pt-4 border-t grid grid-cols-1 lg:grid-cols-2 gap-6 ${isLightMode ? 'border-slate-200' : 'border-slate-800'}`}>
                  {/* Mounted Volumes Progress Bars */}
                  <div className="space-y-3">
                    <div className={`text-xs font-bold flex items-center gap-2 ${textPrimary}`}>
                      <HardDrive className="w-4 h-4 text-sky-500" />
                      <span>{isEn ? 'Storage Volumes Health' : 'وضعیت فضای درایوهای دیسک'}</span>
                    </div>
                    <div className="space-y-2.5">
                      {(healthData.disks || []).map((d: any) => {
                        const pct = Math.max(0, Math.min(100, Number(d.usedPercent) || 0));
                        const barClr =
                          pct >= 90 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-sky-500';
                        return (
                          <div key={d.drive} className="space-y-1">
                            <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                              <span className={`font-semibold ${textPrimary}`}>
                                {d.drive} {d.label ? `(${d.label})` : ''}
                              </span>
                              <span className={textMuted}>
                                {d.usedGb} / {d.totalGb} GB · {isEn ? 'Free' : 'خالی'} {d.freeGb} GB ({pct}%)
                              </span>
                            </div>
                            <div className={`h-2 w-full rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                              <div className={`h-full rounded-full transition-all ${barClr}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Endpoint Security Posture */}
                  <div className="space-y-3">
                    <div className={`text-xs font-bold flex items-center gap-2 ${textPrimary}`}>
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      <span>{isEn ? 'Antivirus & Firewall Posture' : 'وضعیت آنتی‌ویروس و فایروال سیستم'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className={`p-3 rounded-lg border ${subSurfaceBg}`}>
                        <div className={textMuted}>{healthData.security?.antivirusName || 'Antivirus'}</div>
                        <div className={`mt-1 font-bold flex items-center gap-1.5 ${
                          healthData.security?.antivirusEnabled === true
                            ? 'text-emerald-500'
                            : healthData.security?.antivirusEnabled === false
                            ? 'text-rose-500'
                            : textMuted
                        }`}>
                          {healthData.security?.antivirusEnabled === true ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isEn ? 'Enabled' : 'فعال'}</span>
                            </>
                          ) : healthData.security?.antivirusEnabled === false ? (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>{isEn ? 'Disabled' : 'غیرفعال'}</span>
                            </>
                          ) : (
                            <span>{isEn ? 'N/A' : 'نامشخص'}</span>
                          )}
                        </div>
                        {healthData.security?.signatureUpdated && (
                          <div className={`text-[11px] font-mono mt-1 ${textMuted}`}>
                            {isEn ? 'Sig' : 'آپدیت'}: {healthData.security.signatureUpdated}
                          </div>
                        )}
                      </div>

                      <div className={`p-3 rounded-lg border ${subSurfaceBg}`}>
                        <div className={textMuted}>{isEn ? 'Windows / Host Firewall' : 'فایروال سیستم'}</div>
                        <div className="mt-1.5 space-y-1 font-mono text-[11px]">
                          {[
                            { k: 'Domain', v: healthData.security?.firewallDomain },
                            { k: 'Private', v: healthData.security?.firewallPrivate },
                            { k: 'Public', v: healthData.security?.firewallPublic },
                          ].map((fw) => (
                            <div key={fw.k} className="flex items-center justify-between">
                              <span className={textMuted}>{fw.k}</span>
                              <span
                                className={
                                  fw.v === true
                                    ? 'text-emerald-500 font-semibold'
                                    : fw.v === false
                                    ? 'text-rose-500 font-semibold'
                                    : textMuted
                                }
                              >
                                {fw.v === true ? 'ON' : fw.v === false ? 'OFF' : 'N/A'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* VISUAL PROCESS MONITOR — Interactive Circular Donut + Dual Progress Bars */}
              <div className={`rounded-xl border p-4 sm:p-5 space-y-5 ${surfaceBg}`}>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h3 className={`text-sm font-bold ${textPrimary}`}>
                      {isEn
                        ? `Live Process Monitor (${healthData.totalProcessCount} active processes)`
                        : `مانیتورینگ گرافیکی پروسس‌های سیستم (${healthData.totalProcessCount} پروسس فعال)`}
                    </h3>
                    <p className={`text-xs ${textMuted}`}>
                      {isEn
                        ? 'Visual circular resource distribution paired with per-process CPU & RAM progress meters (Read-Only).'
                        : 'نمایش دایره‌ای سهم مصرف منابع همراه با نوار پراگرس CPU و RAM برای هر پروسس (فقط‌خواندنی).'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-2.5 ${textMuted}`} />
                      <input
                        type="text"
                        value={processSearch}
                        onChange={(e) => setProcessSearch(e.target.value)}
                        placeholder={isEn ? 'Filter process or PID...' : 'جستجوی پروسس یا PID...'}
                        className={`ps-8 pe-3 py-1.5 rounded-lg border text-xs outline-none w-48 ${inputCls}`}
                      />
                    </div>

                    <div
                      className={`flex items-center gap-1 p-0.5 rounded-lg border text-xs ${
                        isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      {(
                        [
                          { id: 'cpu', label: 'CPU' },
                          { id: 'memory', label: 'RAM' },
                          { id: 'name', label: isEn ? 'Name' : 'نام' },
                        ] as const
                      ).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setProcessSort(s.id);
                            if (s.id === 'cpu' || s.id === 'memory') setDonutMetric(s.id);
                          }}
                          className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                            processSort === s.id
                              ? isLightMode
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'bg-slate-800 text-white'
                              : textMuted
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Split Layout: Circular Process Distribution Ring + Dual Progress Bar Grid */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                  {/* Left/Start: Interactive Circular Process Resource Donut */}
                  <div className={`xl:col-span-4 rounded-xl border p-4 space-y-4 ${subSurfaceBg}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${textPrimary}`}>
                        {donutMetric === 'cpu'
                          ? isEn
                            ? 'CPU Share by Top Processes'
                            : 'سهم دایره‌ای مصرف CPU پروسس‌ها'
                          : isEn
                          ? 'RAM Share by Top Processes'
                          : 'سهم دایره‌ای مصرف حافظه (RAM)'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setDonutMetric('cpu')}
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                            donutMetric === 'cpu' ? 'bg-sky-600 text-white' : textMuted
                          }`}
                        >
                          CPU
                        </button>
                        <button
                          type="button"
                          onClick={() => setDonutMetric('memory')}
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                            donutMetric === 'memory' ? 'bg-indigo-600 text-white' : textMuted
                          }`}
                        >
                          RAM
                        </button>
                      </div>
                    </div>

                    {/* SVG Donut Ring */}
                    <div className="flex justify-center py-2">
                      <div className="relative w-44 h-44">
                        <svg viewBox="0 0 180 180" className="w-full h-full -rotate-90">
                          <circle
                            cx="90"
                            cy="90"
                            r="70"
                            fill="none"
                            stroke={isLightMode ? '#e2e8f0' : '#1e293b'}
                            strokeWidth="20"
                          />
                          {processDonutSegments.map((seg) => {
                            const C = 2 * Math.PI * 70;
                            const segLen = (seg.pct / 100) * C;
                            const offset = -((seg.startPct / 100) * C);
                            const isSelected = selectedProcessPid === seg.pid;
                            return (
                              <circle
                                key={`${seg.pid}-${seg.name}`}
                                cx="90"
                                cy="90"
                                r="70"
                                fill="none"
                                stroke={seg.color}
                                strokeWidth={isSelected ? 24 : 20}
                                strokeDasharray={`${segLen} ${C}`}
                                strokeDashoffset={offset}
                                className="cursor-pointer transition-all"
                                opacity={selectedProcessPid && !isSelected ? 0.35 : 0.95}
                                onClick={() =>
                                  setSelectedProcessPid((cur) => (cur === seg.pid ? null : seg.pid))
                                }
                              />
                            );
                          })}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
                          <span className={`text-xl font-bold font-mono tabular-nums ${textPrimary}`}>
                            {donutMetric === 'cpu'
                              ? `${Number(healthData.cpu?.usagePercent || 0).toFixed(1)}%`
                              : `${Number(healthData.memory?.usedPercent || 0).toFixed(1)}%`}
                          </span>
                          <span className={`text-[11px] ${textMuted}`}>
                            {donutMetric === 'cpu'
                              ? isEn
                                ? 'Total CPU'
                                : 'کل مصرف CPU'
                              : isEn
                              ? 'Total RAM'
                              : 'کل مصرف RAM'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Interactive Legend */}
                    <div className="space-y-1.5">
                      {processDonutSegments.map((seg) => {
                        const isSelected = selectedProcessPid === seg.pid;
                        return (
                          <button
                            key={`leg-${seg.pid}-${seg.name}`}
                            type="button"
                            onClick={() =>
                              setSelectedProcessPid((cur) => (cur === seg.pid ? null : seg.pid))
                            }
                            className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded-md text-xs transition cursor-pointer ${
                              isSelected
                                ? isLightMode
                                  ? 'bg-sky-50 text-sky-900 font-semibold'
                                  : 'bg-sky-500/15 text-sky-200 font-semibold'
                                : isLightMode
                                ? 'hover:bg-slate-200/60'
                                : 'hover:bg-slate-800/70'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-xs shrink-0"
                                style={{ backgroundColor: seg.color }}
                              />
                              <span className={`truncate font-mono ${textPrimary}`}>{seg.name}</span>
                            </div>
                            <span className={`font-mono tabular-nums shrink-0 ${textMuted}`}>
                              {donutMetric === 'cpu'
                                ? `${seg.rawVal.toFixed(1)}%`
                                : seg.memoryMb > 0
                                ? `${seg.memoryMb.toFixed(0)} MB`
                                : `${seg.rawVal.toFixed(1)}%`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right/End: High-Density Process Progress Bars Table */}
                  <div className="xl:col-span-8 overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className={`border-b text-start ${isLightMode ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
                          <th className="py-2 px-2.5 font-semibold text-start">PID</th>
                          <th className="py-2 px-2.5 font-semibold text-start">{isEn ? 'Process' : 'نام پروسس'}</th>
                          <th className="py-2 px-2.5 font-semibold text-start w-44">{isEn ? 'CPU Load' : 'مصرف CPU'}</th>
                          <th className="py-2 px-2.5 font-semibold text-start w-44">{isEn ? 'Memory (RAM)' : 'مصرف RAM'}</th>
                          <th className="py-2 px-2.5 font-semibold text-end">{isEn ? 'Threads' : 'تردها'}</th>
                          <th className="py-2 px-2.5 font-semibold text-end">{isEn ? 'State' : 'وضعیت'}</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                        {filteredProcesses.map((proc: any) => {
                          const cpuVal = Math.max(0, Math.min(100, Number(proc.cpuPercent) || 0));
                          const memVal = Math.max(0, Math.min(100, Number(proc.memoryPercent) || 0));
                          const isHighlighted = selectedProcessPid === proc.pid;
                          const cpuBarClr =
                            cpuVal >= 50 ? 'bg-rose-500' : cpuVal >= 20 ? 'bg-amber-500' : 'bg-sky-500';
                          const memBarClr =
                            memVal >= 35 ? 'bg-rose-500' : memVal >= 15 ? 'bg-amber-500' : 'bg-indigo-500';

                          return (
                            <tr
                              key={`${proc.pid}-${proc.name}`}
                              onClick={() =>
                                setSelectedProcessPid((cur) => (cur === proc.pid ? null : proc.pid))
                              }
                              className={`cursor-pointer transition-colors ${
                                isHighlighted
                                  ? isLightMode
                                    ? 'bg-sky-50'
                                    : 'bg-sky-500/15'
                                  : isLightMode
                                  ? 'hover:bg-slate-50'
                                  : 'hover:bg-slate-800/40'
                              }`}
                            >
                              <td className={`py-2.5 px-2.5 font-mono tabular-nums ${textMuted}`}>
                                {proc.pid}
                              </td>
                              <td className={`py-2.5 px-2.5 font-mono font-semibold ${textPrimary}`}>
                                {proc.name}
                              </td>
                              <td className="py-2.5 px-2.5">
                                <div className="flex items-center gap-2">
                                  <div className={`flex-1 h-2 rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                                    <div
                                      className={`h-full rounded-full ${cpuBarClr}`}
                                      style={{ width: `${Math.max(cpuVal > 0 ? 3 : 0, cpuVal)}%` }}
                                    />
                                  </div>
                                  <span className={`w-11 text-end font-mono tabular-nums ${textPrimary}`}>
                                    {cpuVal.toFixed(1)}%
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-2.5">
                                <div className="flex items-center gap-2">
                                  <div className={`flex-1 h-2 rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                                    <div
                                      className={`h-full rounded-full ${memBarClr}`}
                                      style={{ width: `${Math.max(memVal > 0 ? 3 : 0, memVal)}%` }}
                                    />
                                  </div>
                                  <span className={`w-16 text-end font-mono tabular-nums ${textPrimary}`}>
                                    {Number(proc.memoryMb || 0).toFixed(0)} MB
                                  </span>
                                </div>
                              </td>
                              <td className={`py-2.5 px-2.5 text-end font-mono tabular-nums ${textMuted}`}>
                                {proc.threads}
                              </td>
                              <td
                                className={`py-2.5 px-2.5 text-end font-medium ${
                                  String(proc.status).toLowerCase().includes('not')
                                    ? 'text-rose-500'
                                    : 'text-emerald-500'
                                }`}
                              >
                                {proc.status}
                              </td>
                            </tr>
                          );
                        })}
                        {filteredProcesses.length === 0 && (
                          <tr>
                            <td colSpan={6} className={`py-6 text-center ${textMuted}`}>
                              {isEn ? 'No processes match your filter.' : 'هیچ پروسسی با این فیلتر پیدا نشد.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: ENDPOINT-SIDE NETWORK DIAGNOSTICS & SAFE RESET               */}
      {/* =================================================================== */}
      {activeSubTab === 'network' && (
        <div className="space-y-6">
          {networkError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 flex items-start gap-3 text-xs text-rose-500">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className={isLightMode ? 'text-rose-800' : 'text-rose-200'}>{networkError}</span>
            </div>
          )}

          {netActionResult && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-emerald-500">
                <CheckCircle2 className="w-4 h-4" />
                <span>{isEn ? netActionResult.message : netActionResult.messageFa}</span>
              </div>
              {netActionResult.rawOutput && (
                <pre
                  dir="ltr"
                  className={`p-3 rounded-lg border font-mono text-[11px] overflow-x-auto ${subSurfaceBg} ${textPrimary}`}
                >
                  {netActionResult.rawOutput}
                </pre>
              )}
            </div>
          )}

          {/* Action Toolbar: Load Snapshot + Allowlisted Safe Network Resets */}
          <div className={`rounded-xl border p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 ${surfaceBg}`}>
            <div>
              <h2 className={`text-sm font-bold ${textPrimary}`}>
                {isEn ? 'Endpoint Network Stack & Allowlisted Safe Resets' : 'وضعیت شبکه سیستم کاربر و ریست‌های امن مجاز'}
              </h2>
              <p className={`text-xs ${textMuted}`}>
                {isEn
                  ? 'Inspect adapters, DNS, Gateway & Proxy or run fixed safe actions (Flush DNS / Renew IP) with zero arbitrary shell.'
                  : 'بررسی کارت شبکه، DNS، Gateway و Proxy یا اجرای دکمه‌های ثابت و ایمن (Flush DNS و Renew IP) بدون دسترسی ترمینال آزاد.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleInspectNetwork}
                disabled={!canRunDiagnostics || loadingNetwork}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
              >
                {loadingNetwork ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>{isEn ? 'Inspect Network Stack' : 'دریافت وضعیت شبکه'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSafeNetworkAction('network_flush_dns')}
                disabled={!canExecuteActions || runningNetAction !== null}
                title={
                  !canExecuteActions
                    ? isEn
                      ? 'Requires canExecuteHelpdeskActions permission'
                      : 'نیازمند مجوز canExecuteHelpdeskActions در Access Policy'
                    : undefined
                }
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition disabled:opacity-50 cursor-pointer ${
                  isLightMode
                    ? 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700'
                }`}
              >
                {runningNetAction === 'network_flush_dns' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : !canExecuteActions ? (
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5 text-teal-500" />
                )}
                <span>Flush DNS</span>
              </button>

              <button
                type="button"
                onClick={() => handleSafeNetworkAction('network_renew_ip')}
                disabled={!canExecuteActions || runningNetAction !== null}
                title={
                  !canExecuteActions
                    ? isEn
                      ? 'Requires canExecuteHelpdeskActions permission'
                      : 'نیازمند مجوز canExecuteHelpdeskActions در Access Policy'
                    : undefined
                }
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition disabled:opacity-50 cursor-pointer ${
                  isLightMode
                    ? 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700'
                }`}
              >
                {runningNetAction === 'network_renew_ip' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : !canExecuteActions ? (
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <Network className="w-3.5 h-3.5 text-sky-500" />
                )}
                <span>Renew DHCP IP</span>
              </button>
            </div>
          </div>

          {/* Endpoint-Side Live Probe Console (Ping / TCP Port / DNS FROM INSIDE the User's PC!) */}
          <form onSubmit={handleRunProbe} className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex items-center gap-2 text-sm font-bold">
              <Globe className="w-4 h-4 text-sky-500" />
              <span className={textPrimary}>
                {isEn
                  ? 'Endpoint-Side Diagnostic Probe (Executes FROM Inside User Workstation)'
                  : 'تست عیب‌یابی شبکه از داخل خود سیستم کاربر (Ping / Port / DNS)'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-3">
                <label className={`block text-xs font-medium mb-1 ${textMuted}`}>
                  {isEn ? 'Probe Type' : 'نوع تست'}
                </label>
                <select
                  value={probeType}
                  onChange={(e) => setProbeType(e.target.value as any)}
                  className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="ping">{isEn ? 'ICMP Ping (4 packets)' : 'پینگ ICMP (۴ بسته)'}</option>
                  <option value="port">{isEn ? 'TCP Port Connectivity' : 'تست باز بودن پورت TCP'}</option>
                  <option value="dns">{isEn ? 'DNS Resolution Lookup' : 'تست ترجمه نام DNS'}</option>
                </select>
              </div>

              <div className={probeType === 'port' ? 'sm:col-span-5' : 'sm:col-span-7'}>
                <label className={`block text-xs font-medium mb-1 ${textMuted}`}>
                  {isEn ? 'Destination Host / IP / Domain' : 'آدرس مقصد (IP یا دامنه)'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={probeTarget}
                  onChange={(e) => setProbeTarget(e.target.value)}
                  placeholder="8.8.8.8 / dc01.corp.local / google.com"
                  className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                  required
                />
              </div>

              {probeType === 'port' && (
                <div className="sm:col-span-2">
                  <label className={`block text-xs font-medium mb-1 ${textMuted}`}>
                    {isEn ? 'TCP Port' : 'پورت TCP'}
                  </label>
                  <input
                    type="number"
                    dir="ltr"
                    min={1}
                    max={65535}
                    value={probePort}
                    onChange={(e) => setProbePort(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                    required
                  />
                </div>
              )}

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={!canRunDiagnostics || loadingProbe}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {loadingProbe ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isEn ? 'Run Probe' : 'اجرای تست'}</span>
                </button>
              </div>
            </div>

            {probeError && (
              <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-xs text-rose-500">
                {probeError}
              </div>
            )}

            {probeResult && (
              <div className={`p-4 rounded-xl border space-y-3 ${subSurfaceBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div
                    className={`font-bold flex items-center gap-2 ${
                      probeResult.success ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {probeResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    <span>{isEn ? probeResult.summary : probeResult.summaryFa}</span>
                  </div>
                  <span className={`font-mono text-[11px] ${textMuted}`}>
                    {probeResult.targetIp} → {probeResult.probeTarget}
                    {probeResult.probePort ? `:${probeResult.probePort}` : ''}
                  </span>
                </div>

                {Array.isArray(probeResult.records) && probeResult.records.length > 0 && (
                  <div className={`text-xs font-mono space-y-1 ${textPrimary}`}>
                    {probeResult.records.map((rec: string, i: number) => (
                      <div key={i}>{rec}</div>
                    ))}
                  </div>
                )}

                {probeResult.rawOutput && (
                  <pre
                    dir="ltr"
                    className={`p-3 rounded-lg border font-mono text-[11px] overflow-x-auto max-h-56 ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
                    }`}
                  >
                    {probeResult.rawOutput}
                  </pre>
                )}
              </div>
            )}
          </form>

          {/* Network Adapters & Proxy Table */}
          {networkData && (
            <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className={`text-sm font-bold ${textPrimary}`}>
                  {isEn
                    ? `Active Network Adapters & Proxy (${networkData.hostname})`
                    : `کارت‌های شبکه فعال و وضعیت Proxy (${networkData.hostname})`}
                </h3>
                <div className={`text-xs ${textMuted}`}>
                  {isEn ? 'System Proxy' : 'پروکسی سیستم'}:{' '}
                  <strong className={networkData.proxy?.enabled ? 'text-amber-500' : 'text-emerald-500'}>
                    {networkData.proxy?.enabled
                      ? `${isEn ? 'ENABLED' : 'فعال'} (${networkData.proxy.server || '-'})`
                      : isEn
                      ? 'Direct (No Proxy)'
                      : 'مستقیم (غیرفعال)'}
                  </strong>
                  <span className="mx-2" aria-hidden="true">·</span>
                  <span className="font-mono">ARP Neighbors: {networkData.arpSummaryCount}</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className={`border-b text-start ${isLightMode ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
                      <th className="py-2 px-2.5 text-start">{isEn ? 'Adapter' : 'نام کارت شبکه'}</th>
                      <th className="py-2 px-2.5 text-start">{isEn ? 'Status / Speed' : 'وضعیت / سرعت'}</th>
                      <th className="py-2 px-2.5 text-start">IPv4</th>
                      <th className="py-2 px-2.5 text-start">Gateway</th>
                      <th className="py-2 px-2.5 text-start">DNS</th>
                      <th className="py-2 px-2.5 text-start">MAC / DHCP</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                    {(networkData.adapters || []).map((a: any, i: number) => (
                      <tr key={`${a.name}-${i}`}>
                        <td className="py-2.5 px-2.5">
                          <div className={`font-semibold ${textPrimary}`}>{a.name}</div>
                          <div className={`text-[11px] ${textMuted}`}>{a.description}</div>
                        </td>
                        <td className="py-2.5 px-2.5 font-mono">
                          <span className={a.status === 'Up' ? 'text-emerald-500 font-semibold' : 'text-rose-500'}>
                            {a.status}
                          </span>
                          <span className={`ms-1.5 ${textMuted}`}>{a.linkSpeed}</span>
                        </td>
                        <td className={`py-2.5 px-2.5 font-mono ${textPrimary}`}>
                          {(a.ipv4Addresses || []).join(', ') || '-'}
                        </td>
                        <td className={`py-2.5 px-2.5 font-mono ${textMuted}`}>
                          {(a.defaultGateways || []).join(', ') || '-'}
                        </td>
                        <td className={`py-2.5 px-2.5 font-mono ${textMuted}`}>
                          {(a.dnsServers || []).join(', ') || '-'}
                        </td>
                        <td className={`py-2.5 px-2.5 font-mono text-[11px] ${textMuted}`}>
                          <div>{a.macAddress || '-'}</div>
                          <div>DHCP: {a.dhcpEnabled === true ? 'Yes' : a.dhcpEnabled === false ? 'Static' : '-'}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: PRINTERS & PRINT SPOOLER REPAIR (Strictly Scoped to Spooler) */}
      {/* =================================================================== */}
      {activeSubTab === 'printers' && (
        <div className="space-y-6">
          {printerError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 flex items-start gap-3 text-xs text-rose-500">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className={isLightMode ? 'text-rose-800' : 'text-rose-200'}>{printerError}</span>
            </div>
          )}

          {spoolerActionResult && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-1 text-xs">
              <div className="flex items-center gap-2 font-bold text-emerald-500">
                <CheckCircle2 className="w-4 h-4" />
                <span>{isEn ? spoolerActionResult.message : spoolerActionResult.messageFa}</span>
              </div>
              {spoolerActionResult.rawOutput && (
                <div className={`font-mono text-[11px] ${textMuted}`}>{spoolerActionResult.rawOutput}</div>
              )}
            </div>
          )}

          {/* Spooler Control Bar */}
          <div className={`rounded-xl border p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 ${surfaceBg}`}>
            <div>
              <h2 className={`text-sm font-bold ${textPrimary}`}>
                {isEn ? 'Print Spooler Service & Queue Repair' : 'مدیریت سرویس Print Spooler و صف پرینت'}
              </h2>
              <p className={`text-xs ${textMuted}`}>
                {isEn
                  ? 'Strictly confined to the Print Spooler service and C:\\Windows\\System32\\spool\\PRINTERS queue files.'
                  : 'عملیات صرفاً محدود به سرویس Print Spooler و پاک‌سازی فایل‌های صف گیرکرده پرینت (بدون دسترسی به سایر سرویس‌ها).'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleInspectPrinters}
                disabled={!canRunDiagnostics || loadingPrinters}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
              >
                {loadingPrinters ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>{isEn ? 'Inspect Printers & Queue' : 'بررسی پرینترها و صف'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSpoolerAction('spooler_restart')}
                disabled={!canExecuteActions || runningSpoolerAction !== null}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition disabled:opacity-50 cursor-pointer ${
                  isLightMode
                    ? 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700'
                }`}
              >
                {runningSpoolerAction === 'spooler_restart' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : !canExecuteActions ? (
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5 text-teal-500" />
                )}
                <span>{isEn ? 'Restart Print Spooler' : 'ری‌استارت Print Spooler'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSpoolerAction('spooler_clear_queue')}
                disabled={!canExecuteActions || runningSpoolerAction !== null}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
              >
                {runningSpoolerAction === 'spooler_clear_queue' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : !canExecuteActions ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{isEn ? 'Clear Stuck Queue & Restart' : 'پاک‌سازی صف گیرکرده و ری‌استارت'}</span>
              </button>
            </div>
          </div>

          {!printerData && !loadingPrinters && (
            <div className={`rounded-xl border p-10 text-center space-y-3 ${surfaceBg}`}>
              <Printer className="w-10 h-10 mx-auto text-teal-500 opacity-80" />
              <div className={`text-sm font-bold ${textPrimary}`}>
                {isEn ? 'No Printer Data Loaded Yet' : 'اطلاعات پرینتر هنوز دریافت نشده است'}
              </div>
              <p className={`text-xs max-w-lg mx-auto ${textMuted}`}>
                {isEn
                  ? 'Enter a workstation IP & credentials above and click "Inspect Printers & Queue" to see live Print Spooler health, installed printers, and stuck documents.'
                  : 'پس از وارد کردن IP و مشخصات ورود در بالا، روی «بررسی پرینترها و صف» کلیک کنید تا وضعیت سرویس Spooler، پرینترهای نصب‌شده و اسناد گیرکرده در صف نمایش داده شود.'}
              </p>
            </div>
          )}

          {printerData && (
            <div className="space-y-6">
              {/* Spooler Service Status Strip */}
              <div className={`rounded-xl border p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs ${surfaceBg}`}>
                <div>
                  <div className={textMuted}>{isEn ? 'Service' : 'نام سرویس'}</div>
                  <div className={`mt-1 font-bold font-mono ${textPrimary}`}>
                    {printerData.spooler?.displayName} ({printerData.spooler?.serviceName})
                  </div>
                </div>
                <div>
                  <div className={textMuted}>{isEn ? 'State' : 'وضعیت اجرا'}</div>
                  <div
                    className={`mt-1 font-bold ${
                      String(printerData.spooler?.status).toLowerCase() === 'running' ||
                      String(printerData.spooler?.status).toLowerCase() === 'active'
                        ? 'text-emerald-500'
                        : 'text-rose-500'
                    }`}
                  >
                    {printerData.spooler?.status}
                  </div>
                </div>
                <div>
                  <div className={textMuted}>{isEn ? 'Startup / PID' : 'نوع اجرا / PID'}</div>
                  <div className={`mt-1 font-mono tabular-nums ${textPrimary}`}>
                    {printerData.spooler?.startType} {printerData.spooler?.pid ? `· PID ${printerData.spooler.pid}` : ''}
                  </div>
                </div>
                <div>
                  <div className={textMuted}>{isEn ? 'Printers / Active Jobs' : 'تعداد پرینتر / صف فعلی'}</div>
                  <div className={`mt-1 font-bold font-mono tabular-nums ${textPrimary}`}>
                    {(printerData.printers || []).length} / {(printerData.jobs || []).length}
                  </div>
                </div>
              </div>

              {/* Installed Printers Table */}
              <div className={`rounded-xl border p-4 sm:p-5 space-y-3 ${surfaceBg}`}>
                <h3 className={`text-sm font-bold ${textPrimary}`}>
                  {isEn ? 'Installed Printers' : 'پرینترهای نصب‌شده روی سیستم کاربر'}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className={`border-b text-start ${isLightMode ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
                        <th className="py-2 px-2.5 text-start">{isEn ? 'Printer Name' : 'نام پرینتر'}</th>
                        <th className="py-2 px-2.5 text-start">{isEn ? 'Port / IP' : 'پورت / IP'}</th>
                        <th className="py-2 px-2.5 text-start">{isEn ? 'Driver' : 'درایور'}</th>
                        <th className="py-2 px-2.5 text-start">{isEn ? 'Status' : 'وضعیت'}</th>
                        <th className="py-2 px-2.5 text-end">{isEn ? 'Jobs' : 'تعداد کار'}</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                      {(printerData.printers || []).map((pr: any, idx: number) => (
                        <tr key={`${pr.name}-${idx}`}>
                          <td className={`py-2.5 px-2.5 font-semibold ${textPrimary}`}>
                            {pr.name}
                            {pr.isDefault && (
                              <span className="ms-2 text-[11px] text-sky-500 font-normal">
                                ({isEn ? 'Default' : 'پیش‌فرض'})
                              </span>
                            )}
                          </td>
                          <td className={`py-2.5 px-2.5 font-mono ${textMuted}`}>{pr.portName || '-'}</td>
                          <td className={`py-2.5 px-2.5 ${textMuted}`}>{pr.driverName || '-'}</td>
                          <td
                            className={`py-2.5 px-2.5 font-semibold ${
                              String(pr.status).toLowerCase().includes('offline') ||
                              String(pr.status).toLowerCase().includes('stop')
                                ? 'text-rose-500'
                                : 'text-emerald-500'
                            }`}
                          >
                            {pr.status}
                          </td>
                          <td className={`py-2.5 px-2.5 text-end font-mono tabular-nums ${textPrimary}`}>
                            {pr.jobCount}
                          </td>
                        </tr>
                      ))}
                      {(printerData.printers || []).length === 0 && (
                        <tr>
                          <td colSpan={5} className={`py-6 text-center ${textMuted}`}>
                            {isEn ? 'No printers installed on this workstation.' : 'هیچ پرینتری روی این سیستم نصب نشده است.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Active Print Queue Table */}
              <div className={`rounded-xl border p-4 sm:p-5 space-y-3 ${surfaceBg}`}>
                <h3 className={`text-sm font-bold ${textPrimary}`}>
                  {isEn ? 'Live Print Queue Jobs' : 'صف لحظه‌ای اسناد در انتظار پرینت'}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className={`border-b text-start ${isLightMode ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
                        <th className="py-2 px-2.5 text-start">ID</th>
                        <th className="py-2 px-2.5 text-start">{isEn ? 'Printer' : 'پرینتر'}</th>
                        <th className="py-2 px-2.5 text-start">{isEn ? 'Document' : 'سند'}</th>
                        <th className="py-2 px-2.5 text-start">{isEn ? 'Owner' : 'کاربر'}</th>
                        <th className="py-2 px-2.5 text-start">{isEn ? 'Status' : 'وضعیت'}</th>
                        <th className="py-2 px-2.5 text-end">{isEn ? 'Size (KB)' : 'حجم (KB)'}</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                      {(printerData.jobs || []).map((job: any) => (
                        <tr key={`${job.printerName}-${job.id}`}>
                          <td className={`py-2.5 px-2.5 font-mono tabular-nums ${textMuted}`}>{job.id}</td>
                          <td className={`py-2.5 px-2.5 font-semibold ${textPrimary}`}>{job.printerName}</td>
                          <td className={`py-2.5 px-2.5 ${textPrimary}`}>{job.documentName}</td>
                          <td className={`py-2.5 px-2.5 font-mono ${textMuted}`}>{job.owner}</td>
                          <td className="py-2.5 px-2.5 text-amber-500 font-semibold">{job.status}</td>
                          <td className={`py-2.5 px-2.5 text-end font-mono tabular-nums ${textMuted}`}>
                            {job.sizeKb}
                          </td>
                        </tr>
                      ))}
                      {(printerData.jobs || []).length === 0 && (
                        <tr>
                          <td colSpan={6} className={`py-6 text-center ${textMuted}`}>
                            {isEn ? 'Print queue is clean (0 stuck jobs).' : 'صف پرینت کاملاً خالی است (۰ سند گیرکرده).'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: PHASE 1 SUMMARY & ANTI-RANSOMWARE SECURITY ARCHITECTURE      */}
      {/* =================================================================== */}
      {activeSubTab === 'architecture' && (
        <div className="space-y-6">
          {/* Anti-Ransomware Active Controls Summary */}
          <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className={`text-sm font-bold ${textPrimary}`}>
                  {isEn
                    ? 'Active Anti-Ransomware & Zero-Trust Endpoint Safeguards'
                    : 'لایه‌های حفاظتی فعال ضدباج‌افزار در ماژول هلپ‌دسک'}
                </h2>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {isEn
                    ? 'Engineered so the HelpDesk module cannot be abused for mass lateral movement or arbitrary script execution.'
                    : 'طراحی‌شده به نحوی که ماژول هلپ‌دسک تحت هیچ شرایطی قابل سوءاستفاده برای پخش گروهی باج‌افزار یا اجرای دستور دلخواه نباشد.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsJeaModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold transition cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>{isEn ? 'Get Windows JEA / GPO Script' : 'دریافت اسکریپت JEA و GPO ویندوز'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {[
                {
                  titleEn: 'Single-Host Only (Zero Bulk)',
                  titleFa: 'اجرای صرفاً تک‌سیستمی (بدون Bulk)',
                  descEn: 'Every endpoint API accepts exactly one validated IP; batch/fleet push is disabled at the protocol layer.',
                  descFa: 'هر درخواست فقط یک IP اعتبارسنجی‌شده می‌پذیرد و هیچ امکان اجرای گروهی روی کلاینت‌ها وجود ندارد.',
                },
                {
                  titleEn: 'Hardcoded Allowlist (No Free Shell)',
                  titleFa: 'لیست سفید ثابت (بدون ترمینال آزاد)',
                  descEn: 'Zero arbitrary command or script input; only fixed read-only collectors and safe FlushDNS/Renew/Spooler actions.',
                  descFa: 'ورودی دستور یا اسکریپت آزاد کاملاً مسدود است؛ فقط دستورات ثابت پایش و ریست امن DNS/Spooler اجرا می‌شوند.',
                },
                {
                  titleEn: 'Ephemeral Zero-Storage Credentials',
                  titleFa: 'رمز عبور صرفاً در حافظه موقت',
                  descEn: 'Session credentials are never saved in PostgreSQL, LocalStorage, or logs and are wiped on Clear Session.',
                  descFa: 'هیچ رمز عبوری در دیتابیس، لوکال‌استوریج یا لاگ ذخیره نمی‌شود و با دکمه پاک‌سازی فوراً از RAM حذف می‌گردد.',
                },
                {
                  titleEn: 'Rate-Limit Circuit Breaker + Audit',
                  titleFa: 'مدارقطع‌کن نرخ عملیات + لاگ ممیزی',
                  descEn: 'Caps write actions to 6 ops across max 3 distinct endpoints per 5 minutes and logs every call to PostgreSQL.',
                  descFa: 'حداکثر ۶ عملیات تغییردهنده روی حداکثر ۳ سیستم در هر ۵ دقیقه، همراه با ثبت کامل در Audit Logs.',
                },
              ].map((card) => (
                <div key={card.titleEn} className={`p-4 rounded-xl border space-y-1.5 ${subSurfaceBg}`}>
                  <div className={`font-bold ${textPrimary}`}>{isEn ? card.titleEn : card.titleFa}</div>
                  <p className={`leading-relaxed ${textMuted}`}>{isEn ? card.descEn : card.descFa}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 8-Item Phase 1 Engineered Roadmap Grid */}
          <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
            <div>
              <h3 className={`text-sm font-bold ${textPrimary}`}>
                {isEn
                  ? 'Phase 1 Low-Risk Agentless Roadmap (Items 1–3 Implemented · Items 4–8 Queued)'
                  : 'نقشه راه مهندسی‌شده فاز ۱ بدون ایجنت (موارد ۱ تا ۳ پیاده‌سازی‌شده · موارد ۴ تا ۸ در صف توسعه)'}
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {phase1Roadmap.map((item) => (
                <div key={item.num} className={`p-4 rounded-xl border space-y-1.5 ${subSurfaceBg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-bold ${textPrimary}`}>
                      {item.num}. {isEn ? item.titleEn : item.titleFa}
                    </span>
                    <span
                      className={`text-[11px] font-semibold shrink-0 ${
                        item.status === 'live' ? 'text-emerald-500' : textMuted
                      }`}
                    >
                      {item.status === 'live'
                        ? isEn
                          ? 'Active'
                          : 'فعال'
                        : isEn
                        ? 'Phase 1 Next'
                        : 'مرحله بعدی فاز ۱'}
                    </span>
                  </div>
                  <p className={`text-xs leading-relaxed ${textMuted}`}>
                    {isEn ? item.descEn : item.descFa}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* WINDOWS JEA & GPO HARDENING MODAL (Universal Modal Rule 7)          */}
      {/* =================================================================== */}
      {isJeaModalOpen &&
        createPortal(
          <div
            dir={isEn ? 'ltr' : 'rtl'}
            className="fixed top-0 left-0 right-0 bottom-8 z-[9999] flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 sm:p-5"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsJeaModalOpen(false);
            }}
          >
            <div
              className={`flex flex-col overflow-hidden border shadow-2xl transition-all ${
                isJeaModalMaximized ? 'w-full h-full rounded-xl' : 'w-full max-w-3xl max-h-[88vh] rounded-2xl'
              } ${
                isLightMode
                  ? 'bg-slate-50 border-slate-200 text-slate-900'
                  : 'bg-slate-950 border-slate-800 text-slate-100'
              }`}
            >
              {/* Header with Mandatory 3 Controls */}
              <div
                className={`flex items-center justify-between gap-3 px-5 py-3.5 border-b shrink-0 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <ShieldCheck className="w-5 h-5 text-teal-500 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold truncate">
                      {isEn
                        ? 'Windows JEA (Just Enough Administration) & GPO Firewall Hardening'
                        : 'اسکریپت امن‌سازی Windows JEA و قفل فایروال WinRM (ضدباج‌افزار)'}
                    </h3>
                    <p className={`text-[11px] truncate ${textMuted}`}>
                      {isEn
                        ? 'Locks workstations so WinRM only permits Phase 1 read-only + DNS/Spooler cmdlets from your panel IP.'
                        : 'سیستم‌های کاربران را طوری قفل می‌کند که WinRM فقط دستورات فاز ۱ را و صرفاً از IP سرور پنل بپذیرد.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleMinimizeJeaModal}
                    className={`p-1.5 rounded-lg border transition cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                    title={isEn ? 'Minimize' : 'مینیمایز'}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsJeaModalMaximized((v) => !v)}
                    className={`p-1.5 rounded-lg border transition cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                    title={isJeaModalMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام‌صفحه') : isEn ? 'Fullscreen' : 'تمام‌صفحه'}
                  >
                    {isJeaModalMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsJeaModalOpen(false)}
                    className={`p-1.5 rounded-lg border transition cursor-pointer ${
                      isLightMode
                        ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                        : 'bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border-rose-500/30'
                    }`}
                    title={isEn ? 'Close' : 'بستن'}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">
                      {isEn ? 'Step 1: JEA Role Capability File (.psrc)' : 'مرحله ۱: فایل محدودسازی دستورات مجاز JEA (.psrc)'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText('psrc', jeaTemplates?.roleCapabilityScript || '')}
                      className="flex items-center gap-1 text-xs font-semibold text-sky-500 hover:underline cursor-pointer"
                    >
                      {copiedJeaKey === 'psrc' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedJeaKey === 'psrc' ? (isEn ? 'Copied' : 'کپی شد') : isEn ? 'Copy' : 'کپی'}</span>
                    </button>
                  </div>
                  <pre
                    dir="ltr"
                    className={`p-3.5 rounded-xl border font-mono text-[11px] overflow-x-auto ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
                    }`}
                  >
                    {jeaTemplates?.roleCapabilityScript || ''}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">
                      {isEn
                        ? 'Step 2: Register JEA Session & Restrict WinRM Port 5986 to Panel IP'
                        : 'مرحله ۲: ثبت Endpoint محدود JEA و محدودسازی فایروال پورت 5986 به IP پنل'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText('pssc', jeaTemplates?.registerSessionScript || '')}
                      className="flex items-center gap-1 text-xs font-semibold text-sky-500 hover:underline cursor-pointer"
                    >
                      {copiedJeaKey === 'pssc' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedJeaKey === 'pssc' ? (isEn ? 'Copied' : 'کپی شد') : isEn ? 'Copy' : 'کپی'}</span>
                    </button>
                  </div>
                  <pre
                    dir="ltr"
                    className={`p-3.5 rounded-xl border font-mono text-[11px] overflow-x-auto ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
                    }`}
                  >
                    {jeaTemplates?.registerSessionScript || ''}
                  </pre>
                </div>
              </div>

              <div
                className={`flex items-center justify-end px-5 py-3 border-t shrink-0 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setIsJeaModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer"
                >
                  {isEn ? 'Close' : 'بستن'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
