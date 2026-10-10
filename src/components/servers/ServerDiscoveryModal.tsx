import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Radar,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Play,
  Square,
  Server,
  Terminal,
  Monitor,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Search,
  Filter,
  Layers,
  KeyRound,
  Shield,
  Clock,
  Zap,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  Info,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  Plus,
  HelpCircle,
  Hash,
  Sliders,
} from 'lucide-react';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { VaultPasswordPickerModal } from '../vault/VaultPasswordPickerModal';
import { RemoteServer } from '../../types';

export interface DiscoveredPortDetail {
  port: number;
  service: string;
  banner?: string;
  state: 'open' | 'closed' | 'filtered';
}

export interface DiscoveredHostItem {
  ip: string;
  hostname: string | null;
  osType: 'linux' | 'windows' | 'hybrid' | 'unknown';
  osDetail: string;
  openPorts: number[];
  portDetails: DiscoveredPortDetail[];
  latencyMs: number;
  alreadyInFleet: boolean;
  existingServerId?: string | null;
  existingServerName?: string | null;
  discoveredAt: string;
  isRefusedOnly?: boolean;
}

export interface ServerDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onServerAdded: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

const COMMON_SUBNET_PRESETS = [
  { label: '192.168.1.0/24', value: '192.168.1.0/24' },
  { label: '172.16.0.0/16', value: '172.16.0.0/16' },
  { label: '10.10.0.0/16', value: '10.10.0.0/16' },
  { label: '172.16.0.0/20', value: '172.16.0.0/20' },
  { label: '127.0.0.1 (Localhost)', value: '127.0.0.1' },
];

const SERVER_CATEGORIES = [
  'Infrastructure',
  'Database',
  'Kubernetes',
  'Web / App',
  'Monitoring',
  'Active Directory',
  'General',
];

export const ServerDiscoveryModal: React.FC<ServerDiscoveryModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  onServerAdded,
  isLightMode = false,
  isEn = true,
}) => {
  // Modal window states
  const [isMaximized, setIsMaximized] = useState(false);

  // Scan input states
  const [ipRangeInput, setIpRangeInput] = useState('192.168.1.0/24');
  const [selectedPorts, setSelectedPorts] = useState<number[]>([22, 3389]);
  const [timeoutMs, setTimeoutMs] = useState(800);
  const [concurrency, setConcurrency] = useState(300);

  // Execution states
  const [isScanning, setIsScanning] = useState(false);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [progressRequested, setProgressRequested] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressScanned, setProgressScanned] = useState(0);
  const [progressFound, setProgressFound] = useState(0);
  const [scanStartTime, setScanStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [discoveredHosts, setDiscoveredHosts] = useState<DiscoveredHostItem[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [validationBanner, setValidationBanner] = useState<{
    en: string;
    fa: string;
    requested?: number;
    limit?: number;
  } | null>(null);

  // Filtering & Selection states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOs, setFilterOs] = useState<'all' | 'linux' | 'windows' | 'new_only' | 'refused'>('all');
  const [showRefusedOnly, setShowRefusedOnly] = useState(false);
  const [selectedIps, setSelectedIps] = useState<Set<string>>(new Set());
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  // SSE EventSource reference
  const eventSourceRef = useRef<EventSource | null>(null);

  // Enrollment Dialog states
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [enrollTargets, setEnrollTargets] = useState<DiscoveredHostItem[]>([]);
  const [enrollName, setEnrollName] = useState('');
  const [enrollOsType, setEnrollOsType] = useState<'linux' | 'windows'>('linux');
  const [enrollPort, setEnrollPort] = useState(22);
  const [enrollUser, setEnrollUser] = useState('root');
  const [enrollPassword, setEnrollPassword] = useState('');
  const [enrollShowPassword, setEnrollShowPassword] = useState(false);
  const [enrollCategory, setEnrollCategory] = useState('Infrastructure');
  const [enrollPromptOnConnect, setEnrollPromptOnConnect] = useState(false);
  const [enrollSaveToVault, setEnrollSaveToVault] = useState(false);
  const [isSubmittingEnroll, setIsSubmittingEnroll] = useState(false);
  const [enrollSuccessToast, setEnrollSuccessToast] = useState<string | null>(null);

  // Vault picker modal state
  const [isVaultPickerOpen, setIsVaultPickerOpen] = useState(false);

  // Elapsed time timer
  useEffect(() => {
    let timer: any;
    if (isScanning && scanStartTime) {
      timer = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - scanStartTime) / 1000));
      }, 500);
    }
    return () => clearInterval(timer);
  }, [isScanning, scanStartTime]);

  // Clean up SSE stream on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Filtered hosts (Hook must be called unconditionally before any early returns)
  const filteredHosts = useMemo(() => {
    return discoveredHosts.filter((host) => {
      // ECONNREFUSED-only hosts are hidden by default unless showRefusedOnly is true or filter is set to 'refused'
      if (!showRefusedOnly && host.isRefusedOnly && filterOs !== 'refused') {
        return false;
      }

      // OS filter
      if (filterOs === 'linux' && host.osType !== 'linux') return false;
      if (filterOs === 'windows' && host.osType !== 'windows') return false;
      if (filterOs === 'new_only' && host.alreadyInFleet) return false;
      if (filterOs === 'refused' && !host.isRefusedOnly) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchIp = host.ip.toLowerCase().includes(q);
        const matchHost = host.hostname?.toLowerCase().includes(q);
        const matchDetail = host.osDetail.toLowerCase().includes(q);
        return matchIp || matchHost || matchDetail;
      }
      return true;
    });
  }, [discoveredHosts, filterOs, searchQuery, showRefusedOnly]);

  // Toggle port checkbox
  const handleTogglePort = (port: number) => {
    setSelectedPorts((prev) =>
      prev.includes(port) ? prev.filter((p) => p !== port) : [...prev, port]
    );
  };

  // Start Discovery scan via live chunked SSE stream
  const handleStartDiscovery = () => {
    if (!ipRangeInput.trim()) {
      setScanError(
        isEn
          ? 'Please enter an IP range, subnet (CIDR) or IP list.'
          : 'لطفاً رنج آی‌پی، ساب‌نت یا آدرس را وارد کنید.'
      );
      return;
    }

    if (selectedPorts.length === 0) {
      setScanError(
        isEn
          ? 'Please select at least one port to probe.'
          : 'حداقل یک پورت برای پویش انتخاب کنید.'
      );
      return;
    }

    // Abort and close any existing active EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsScanning(true);
    setScanError(null);
    setValidationBanner(null);
    setDiscoveredHosts([]);
    setSelectedIps(new Set());
    setProgressScanned(0);
    setProgressTotal(0);
    setProgressRequested(0);
    setProgressFound(0);
    setScanStartTime(Date.now());
    setElapsedSeconds(0);

    const queryParams = new URLSearchParams({
      ipRange: ipRangeInput.trim(),
      ports: selectedPorts.join(','),
      timeoutMs: String(timeoutMs),
      concurrency: String(concurrency),
    });

    const es = new EventSource(`/api/remote-servers/discover/stream?${queryParams.toString()}`);
    eventSourceRef.current = es;

    es.addEventListener('start', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.scanId) setActiveScanId(data.scanId);
        if (typeof data.requested === 'number') setProgressRequested(data.requested);
        if (typeof data.total === 'number') setProgressTotal(data.total);
      } catch {}
    });

    es.addEventListener('progress', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.scanId) setActiveScanId(data.scanId);
        if (typeof data.requested === 'number') setProgressRequested(data.requested);
        if (typeof data.total === 'number') setProgressTotal(data.total);
        if (typeof data.scanned === 'number') setProgressScanned(data.scanned);
        if (typeof data.found === 'number') setProgressFound(data.found);
        if (typeof data.elapsed === 'number') setElapsedSeconds(data.elapsed);
      } catch {}
    });

    es.addEventListener('host', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.host) {
          setDiscoveredHosts((prev) => {
            if (prev.some((h) => h.ip === data.host.ip)) return prev;
            return [...prev, data.host];
          });
          setProgressFound((prev) => prev + 1);
        }
      } catch {}
    });

    es.addEventListener('complete', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.results && Array.isArray(data.results)) {
          setDiscoveredHosts(data.results);
        }
        if (typeof data.total === 'number') setProgressTotal(data.total);
        if (typeof data.scanned === 'number') setProgressScanned(data.scanned);
      } catch {}
      es.close();
      eventSourceRef.current = null;
      setIsScanning(false);
    });

    es.addEventListener('error', (e: any) => {
      try {
        if (e.data) {
          const errData = JSON.parse(e.data);
          const msgEn = errData.error || 'Discovery scan failed';
          const msgFa = errData.errorFa || errData.error || 'خطا در اجرای اسکن دیسکاوری';
          setScanError(isEn ? msgEn : msgFa);
          if (errData.requested || errData.limit) {
            setValidationBanner({
              en: msgEn,
              fa: msgFa,
              requested: errData.requested,
              limit: errData.limit,
            });
          }
        } else {
          setScanError(
            isEn ? 'Connection to discovery stream was closed.' : 'اتصال به استریم دیسکاوری قطع شد.'
          );
        }
      } catch {
        setScanError(
          isEn ? 'Stream error during discovery scan.' : 'خطای استریم در حین اسکن دیسکاوری.'
        );
      }
      es.close();
      eventSourceRef.current = null;
      setIsScanning(false);
    });

    es.onerror = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsScanning(false);
    };
  };

  // Abort Discovery Scan
  const handleAbortDiscovery = async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (activeScanId) {
      try {
        await fetch('/api/remote-servers/discover/abort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scanId: activeScanId }),
        });
      } catch {
        // ignore
      }
    }
    setIsScanning(false);
  };

  // Copy IP to clipboard
  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  // Toggle selection
  const handleToggleSelect = (ip: string) => {
    setSelectedIps((prev) => {
      const next = new Set(prev);
      if (next.has(ip)) next.delete(ip);
      else next.add(ip);
      return next;
    });
  };

  // Select all or deselect all
  const handleSelectAllNew = () => {
    const newHosts = discoveredHosts.filter((h) => !h.alreadyInFleet);
    if (selectedIps.size === newHosts.length) {
      setSelectedIps(new Set());
    } else {
      setSelectedIps(new Set(newHosts.map((h) => h.ip)));
    }
  };

  // Open single host enrollment dialog
  const handleOpenSingleEnroll = (host: DiscoveredHostItem) => {
    setEnrollTargets([host]);
    setEnrollName(
      host.hostname ? host.hostname.split('.')[0] : `Server-${host.ip.replace(/\./g, '-')}`
    );
    const isWin = host.osType === 'windows';
    setEnrollOsType(isWin ? 'windows' : 'linux');
    setEnrollPort(isWin ? 3389 : 22);
    setEnrollUser(isWin ? 'Administrator' : 'root');
    setEnrollPassword('');
    setEnrollCategory('Infrastructure');
    setEnrollPromptOnConnect(false);
    setEnrollSaveToVault(false);
    setEnrollModalOpen(true);
  };

  // Open bulk enrollment dialog
  const handleOpenBulkEnroll = () => {
    const targets = discoveredHosts.filter(
      (h) => selectedIps.has(h.ip) && !h.alreadyInFleet
    );
    if (targets.length === 0) return;

    setEnrollTargets(targets);
    // If all targets are windows, default to windows; otherwise linux
    const allWin = targets.every((t) => t.osType === 'windows');
    setEnrollOsType(allWin ? 'windows' : 'linux');
    setEnrollPort(allWin ? 3389 : 22);
    setEnrollUser(allWin ? 'Administrator' : 'root');
    setEnrollPassword('');
    setEnrollCategory('Infrastructure');
    setEnrollPromptOnConnect(false);
    setEnrollSaveToVault(false);
    setEnrollName(isEn ? 'Discovered Fleet Batch' : 'دسته سرورهای کشف‌شده');
    setEnrollModalOpen(true);
  };

  // Handle Vault selection
  const handleVaultPasswordSelected = (pwd: string, usr?: string) => {
    setEnrollPassword(pwd);
    if (usr) setEnrollUser(usr);
    setIsVaultPickerOpen(false);
  };

  // Save / Enroll server(s) to PostgreSQL fleet
  const handleConfirmEnroll = async () => {
    if (enrollTargets.length === 0) return;

    setIsSubmittingEnroll(true);
    try {
      if (enrollTargets.length === 1) {
        const target = enrollTargets[0];
        const isWin = enrollOsType === 'windows';
        const cleanUser = enrollUser.trim();
        const payload: any = {
          name: enrollName.trim() || `Server-${target.ip}`,
          ip: target.ip,
          os_type: enrollOsType,
          server_type: enrollOsType,
          ssh_port: isWin ? 22 : enrollPort,
          ssh_username: isWin ? '' : (cleanUser || 'root'),
          ssh_user: isWin ? '' : (cleanUser || 'root'),
          ssh_password: isWin ? '' : enrollPassword,
          win_protocol: 'rdp',
          win_port: isWin ? enrollPort : 3389,
          win_username: isWin ? (cleanUser || 'Administrator') : 'Administrator',
          win_user: isWin ? (cleanUser || 'Administrator') : 'Administrator',
          win_password: isWin ? enrollPassword : '',
          win_domain: '',
          rdp_security: 'any',
          category: enrollCategory,
          environment: 'Production',
          tags: ['discovered', enrollOsType],
          prompt_password_on_connect: enrollPromptOnConnect,
        };

        const res = await fetch('/api/remote-servers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || (isEn ? 'Failed to add server' : 'خطا در ثبت سرور'));
        }

        // Save secret to vault if requested
        if (enrollSaveToVault && enrollPassword) {
          try {
            await fetch('/api/vault', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: `${payload.name} (${target.ip})`,
                username: enrollUser,
                password: enrollPassword,
                category: 'Servers',
                target_host: target.ip,
                notes: `Auto-saved from Discovery scanner for ${payload.name}`,
              }),
            });
          } catch {
            // ignore vault save error
          }
        }

        // Mark target as alreadyInFleet in local list
        setDiscoveredHosts((prev) =>
          prev.map((h) =>
            h.ip === target.ip
              ? {
                  ...h,
                  alreadyInFleet: true,
                  existingServerName: payload.name,
                  existingServerId: data.server?.id,
                }
              : h
          )
        );

        setEnrollSuccessToast(
          isEn
            ? `Successfully enrolled ${payload.name} (${target.ip}) into ${enrollOsType.toUpperCase()} fleet!`
            : `سرور ${payload.name} (${target.ip}) با موفقیت به ناوگان سرورهای ${enrollOsType === 'windows' ? 'ویندوز' : 'لینوکس'} اضافه شد!`
        );
      } else {
        // Bulk enrollment
        const isWin = enrollOsType === 'windows';
        const cleanUser = enrollUser.trim();
        const serversPayload = enrollTargets.map((t) => ({
          name: t.hostname ? t.hostname.split('.')[0] : `Server-${t.ip.replace(/\./g, '-')}`,
          ip: t.ip,
          os_type: enrollOsType,
          server_type: enrollOsType,
          ssh_port: isWin ? 22 : enrollPort,
          ssh_username: isWin ? '' : (cleanUser || 'root'),
          ssh_user: isWin ? '' : (cleanUser || 'root'),
          ssh_password: isWin ? '' : enrollPassword,
          win_protocol: 'rdp',
          win_port: isWin ? enrollPort : 3389,
          win_username: isWin ? (cleanUser || 'Administrator') : 'Administrator',
          win_user: isWin ? (cleanUser || 'Administrator') : 'Administrator',
          win_password: isWin ? enrollPassword : '',
          win_domain: '',
          rdp_security: 'any',
          category: enrollCategory,
          environment: 'Production',
          tags: ['discovered', 'bulk', enrollOsType],
          prompt_password_on_connect: enrollPromptOnConnect,
        }));

        const res = await fetch('/api/remote-servers/discover/bulk-add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ servers: serversPayload }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(
            data.error || (isEn ? 'Failed to bulk enroll servers' : 'خطا در ثبت گروهی سرورها')
          );
        }

        const enrolledIpSet = new Set(enrollTargets.map((t) => t.ip));
        setDiscoveredHosts((prev) =>
          prev.map((h) =>
            enrolledIpSet.has(h.ip)
              ? {
                  ...h,
                  alreadyInFleet: true,
                  existingServerName: `Server-${h.ip}`,
                }
              : h
          )
        );

        setSelectedIps(new Set());
        setEnrollSuccessToast(
          isEn
            ? `Successfully enrolled ${data.count} servers into ${enrollOsType.toUpperCase()} fleet!`
            : `${data.count} سرور با موفقیت به ناوگان سرورهای ${enrollOsType === 'windows' ? 'ویندوز' : 'لینوکس'} اضافه شدند!`
        );
      }

      onServerAdded();
      setEnrollModalOpen(false);
      setTimeout(() => setEnrollSuccessToast(null), 4000);
    } catch (err: any) {
      alert(err.message || (isEn ? 'Failed to enroll server' : 'خطا در افزودن سرور'));
    } finally {
      setIsSubmittingEnroll(false);
    }
  };

  // Statistics
  const linuxCount = discoveredHosts.filter((h) => h.osType === 'linux').length;
  const windowsCount = discoveredHosts.filter((h) => h.osType === 'windows').length;
  const hybridCount = discoveredHosts.filter(
    (h) => h.osType === 'hybrid' || h.osType === 'unknown'
  ).length;
  const inFleetCount = discoveredHosts.filter((h) => h.alreadyInFleet).length;
  const newNodesCount = discoveredHosts.filter((h) => !h.alreadyInFleet).length;
  const refusedOnlyCount = discoveredHosts.filter((h) => h.isRefusedOnly).length;

  if (!isOpen) return null;

  return createPortal(
    <div
      id="server-discovery-modal-overlay"
      className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in select-none"
    >
      <div
        id="server-discovery-modal-window"
        className={`w-full flex flex-col shadow-2xl border transition-all duration-200 overflow-hidden ${
          isMaximized
            ? 'h-full max-w-none max-h-none rounded-none'
            : 'max-w-5xl h-[88vh] max-h-[850px] rounded-2xl'
        } ${
          isLightMode
            ? 'bg-slate-50 text-slate-800 border-slate-300 shadow-slate-400/40'
            : 'bg-slate-950 text-slate-100 border-slate-800 shadow-[0_20px_60px_rgba(0,0,0,0.85)]'
        }`}
      >
        {/* ========================================================= */}
        {/* Modal Header */}
        {/* ========================================================= */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3.5 border-b shrink-0 ${
            isLightMode
              ? 'border-slate-200 bg-white shadow-xs'
              : 'border-slate-800/90 bg-slate-900/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
              <Radar className={`w-5 h-5 ${isScanning ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold tracking-tight glow-text-cyan">
                  {isEn
                    ? 'Server Discovery & Fleet Scanner'
                    : 'شناسایی و پویش خودکار سرورهای شبکه'}
                </h3>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-semibold ${
                    isScanning
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse'
                      : discoveredHosts.length > 0
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : isLightMode
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {isScanning
                    ? isEn
                      ? 'Scanning Range...'
                      : 'در حال پویش...'
                    : `${discoveredHosts.length} ${isEn ? 'Nodes Found' : 'سرور کشف‌شده'}`}
                </span>
                <FieldInfoTooltip
                  title={isEn ? 'Server Discovery' : 'دیسکاوری سرورهای ریموت'}
                  whatIsIt={
                    isEn
                      ? 'Automated multi-threaded TCP socket sweep that scans subnets for Linux (SSH) and Windows (RDP/SMB) server services.'
                      : 'موتور پویش چندنخی سوکت که رنج آی‌پی را برای شناسایی سرورهای لینوکس (SSH) و ویندوز (RDP/SMB) اسکن می‌کند.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Quickly onboards large IP pools into the enterprise fleet without manual single-host typing.'
                      : 'ثبت سریع و خودکار تجهیزات و سرورهای متعدد بدون نیاز به وارد کردن دستی تک‌تک آدرس‌ها.'
                  }
                  example={
                    isEn
                      ? '192.168.1.0/24 or 10.0.0.10 - 10.0.0.80'
                      : '192.168.1.0/24 یا 10.0.0.10 - 10.0.0.80'
                  }
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>
              <p
                className={`text-[11px] ${
                  isLightMode ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                {isEn
                  ? 'Active multi-threaded socket probe with authentic OS classification, port banner analysis, and Vault enrollment.'
                  : 'پویش واقعی سوکت با تشخیص هوشمند لینوکس/ویندوز، تحلیل بنر پورت‌ها و اتصال مستقیم به والت رمزها.'}
              </p>
            </div>
          </div>

          {/* Triple Window Controls (Close, Minimize, Fullscreen) */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onMinimize}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-300'
              }`}
              title={isEn ? 'Minimize to Dock' : 'مینیمایز به نوار داک پایین'}
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-300'
              }`}
              title={
                isMaximized
                  ? isEn
                    ? 'Exit Fullscreen'
                    : 'خروج از تمام‌صفحه'
                  : isEn
                  ? 'Fullscreen'
                  : 'تمام‌صفحه'
              }
            >
              {isMaximized ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-red-50 text-slate-400 hover:text-red-500'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-red-400'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* Toast Notification */}
        {/* ========================================================= */}
        {enrollSuccessToast && (
          <div className="bg-emerald-500/15 border-b border-emerald-500/30 px-5 py-2.5 flex items-center justify-between text-xs text-emerald-400 font-medium animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{enrollSuccessToast}</span>
            </div>
            <button
              onClick={() => setEnrollSuccessToast(null)}
              className="text-emerald-400/80 hover:text-emerald-300 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ========================================================= */}
        {/* Modal Body Container */}
        {/* ========================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar">
          {/* Scan Parameters Box */}
          <div
            className={`p-4 rounded-xl border space-y-3.5 ${
              isLightMode
                ? 'bg-white border-slate-200 shadow-xs'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              {/* IP Range Input */}
              <div className="md:col-span-6 space-y-1">
                <div className="flex items-center justify-between">
                  <label
                    className={`block text-xs font-semibold ${
                      isLightMode ? 'text-slate-700' : 'text-slate-300'
                    }`}
                  >
                    {isEn ? 'Target IP Range / Subnet / CIDR' : 'محدوده رنج آی‌پی، ساب‌نت یا CIDR'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Target IP Range' : 'رنج آی‌پی مقصد'}
                    whatIsIt={
                      isEn
                        ? 'IPv4 notation supporting CIDR (e.g. 192.168.1.0/24), range (10.0.0.1-50), or comma-separated lists.'
                        : 'فرمت‌های IPv4 شامل CIDR (مثل 192.168.1.0/24)، محدوده (10.0.0.1-50) یا لیست با کاما.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Defines which network segment will be probed for active Linux and Windows compute nodes.'
                        : 'مشخص‌کننده بخشی از شبکه که برای یافتن سرورهای فعال مورد پویش قرار می‌گیرد.'
                    }
                    example="192.168.1.0/24, 10.0.0.1-100"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={ipRangeInput}
                    onChange={(e) => setIpRangeInput(e.target.value)}
                    disabled={isScanning}
                    placeholder="e.g. 172.16.0.0/16 or 10.10.0.0/16 or 192.168.1.0/24"
                    className={`w-full px-3 py-2 text-xs font-mono rounded-lg border focus:outline-none transition ${
                      isLightMode
                        ? 'bg-slate-50 text-slate-900 border-slate-300 focus:border-cyan-500 focus:bg-white'
                        : 'bg-slate-950 text-cyan-300 border-slate-700 focus:border-cyan-400'
                    }`}
                  />
                  {/* Subnet sizes helper hint */}
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1">
                    <span>
                      {isEn
                        ? 'Sizes: /24 (256 IPs / 254 hosts) • /20 (4,096 IPs) • /16 (65,536 IPs max)'
                        : 'سایزها: /24 (۲۵۶ آی‌پی / ۲۵۴ هاست) • /20 (۴٬۰۹۶ آی‌پی) • /16 (حداکثر ۶۵٬۵۳۶ آی‌پی)'}
                    </span>
                    <span className="text-cyan-400 font-semibold">
                      {isEn ? 'Max: 65,536 IPs' : 'حداکثر ۶۵٬۵۳۶ آی‌پی'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Timeout & Concurrency Sliders */}
              <div className="md:col-span-3 grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label
                      className={`block text-[11px] font-medium truncate ${
                        isLightMode ? 'text-slate-600' : 'text-slate-400'
                      }`}
                    >
                      {isEn ? 'Timeout' : 'تایم‌اوت'}
                    </label>
                    <span className="text-[10px] font-mono text-cyan-400 font-bold">{timeoutMs}ms</span>
                  </div>
                  <input
                    type="range"
                    min={300}
                    max={3000}
                    step={50}
                    value={timeoutMs}
                    onChange={(e) => setTimeoutMs(Number(e.target.value))}
                    disabled={isScanning}
                    className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                  />
                  <div className="flex justify-between text-[9px] font-mono text-slate-500">
                    <span>300ms</span>
                    <span>3s</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label
                      className={`block text-[11px] font-medium truncate ${
                        isLightMode ? 'text-slate-600' : 'text-slate-400'
                      }`}
                    >
                      {isEn ? 'Threads' : 'نخ‌ها'}
                    </label>
                    <span className="text-[10px] font-mono text-cyan-400 font-bold">{concurrency}</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={500}
                    step={25}
                    value={concurrency}
                    onChange={(e) => setConcurrency(Number(e.target.value))}
                    disabled={isScanning}
                    className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                  />
                  <div className="flex justify-between text-[9px] font-mono text-slate-500">
                    <span>50</span>
                    <span>500</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Scan / Abort */}
              <div className="md:col-span-3 flex items-center gap-2">
                {!isScanning ? (
                  <button
                    type="button"
                    onClick={handleStartDiscovery}
                    className="flex-1 py-2 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-md shadow-cyan-600/30 transition active:scale-95 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{isEn ? 'Start Discovery' : 'شروع پویش و شناسایی'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleAbortDiscovery}
                    className="flex-1 py-2 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/30 transition active:scale-95 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>{isEn ? 'Stop Scan' : 'توقف اسکن'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Presets and Port Filters Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-dashed border-slate-700/30">
              {/* Presets */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`text-[10px] font-medium mr-1 ${
                    isLightMode ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  {isEn ? 'Presets:' : 'پیش‌فرض‌ها:'}
                </span>
                {COMMON_SUBNET_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setIpRangeInput(preset.value)}
                    disabled={isScanning}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition cursor-pointer border ${
                      ipRangeInput === preset.value
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 font-bold'
                        : isLightMode
                        ? 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                        : 'bg-white/5 hover:bg-white/10 text-slate-400 border-white/10'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Target Service Ports */}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-[10px] font-medium mr-1 ${
                    isLightMode ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  {isEn ? 'Ports:' : 'پورت‌ها:'}
                </span>
                {[
                  { port: 22, label: 'SSH (22)', os: 'Linux' },
                  { port: 3389, label: 'RDP (3389)', os: 'Win' },
                  { port: 445, label: 'SMB (445)', os: 'Win' },
                  { port: 5985, label: 'WinRM (5985)', os: 'Win' },
                ].map((item) => {
                  const isChecked = selectedPorts.includes(item.port);
                  return (
                    <label
                      key={item.port}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer select-none transition ${
                        isChecked
                          ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                          : isLightMode
                          ? 'bg-slate-100 text-slate-400 border-slate-200'
                          : 'bg-slate-900 text-slate-500 border-slate-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleTogglePort(item.port)}
                        disabled={isScanning}
                        className="accent-cyan-500 rounded text-xs cursor-pointer"
                      />
                      <span>{item.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Range Rejected Banner */}
          {validationBanner && (
            <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs">
                  <AlertCircle className="w-4.5 h-4.5 text-amber-400 shrink-0" />
                  <span>{isEn ? 'IP Range Rejected (Exceeds Limit or Invalid)' : 'محدوده آی‌پی رد شد (فراتر از سقف مجاز یا نامعتبر)'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setValidationBanner(null)}
                  className="text-amber-400/80 hover:text-amber-200 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs leading-relaxed text-amber-200">
                {isEn ? validationBanner.en : validationBanner.fa}
              </p>
              {validationBanner.requested && validationBanner.limit && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono pt-1 text-amber-300">
                  <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/30">
                    {isEn ? 'Requested:' : 'آدرس‌های درخواستی:'} {validationBanner.requested.toLocaleString()} IPs
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/30">
                    {isEn ? 'Max Cap:' : 'سقف مجاز:'} {validationBanner.limit.toLocaleString()} IPs (/16)
                  </span>
                  <span className="text-amber-400/90 text-[10px]">
                    {isEn ? 'Tip: Split large blocks like 10.0.0.0/8 into 10.X.0.0/16 subnets.' : 'راهنما: بلوک‌های بزرگ مانند 10.0.0.0/8 را به ساب‌نت‌های 10.X.0.0/16 تقسیم کنید.'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Scan Error Alert */}
          {scanError && !validationBanner && (
            <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{scanError}</span>
            </div>
          )}

          {/* Progress / Status Banner */}
          {(isScanning || progressScanned > 0) && (
            <div
              className={`p-3.5 rounded-xl border space-y-2 animate-in fade-in ${
                isScanning
                  ? isLightMode
                    ? 'bg-cyan-50/70 border-cyan-200 text-cyan-900'
                    : 'bg-cyan-950/30 border-cyan-500/30 text-cyan-200'
                  : isLightMode
                  ? 'bg-slate-100 border-slate-200 text-slate-800'
                  : 'bg-slate-900/60 border-slate-800 text-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between text-xs font-mono gap-2">
                <div className="flex items-center gap-2">
                  {isScanning ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>
                    {isScanning
                      ? isEn
                        ? `Probing IP range in progress (${elapsedSeconds}s elapsed)...`
                        : `در حال پویش فعال رنج آی‌پی (${elapsedSeconds} ثانیه)...`
                      : isEn
                      ? `Scan finished in ${elapsedSeconds}s`
                      : `پویش در ${elapsedSeconds} ثانیه پایان یافت`}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  {progressRequested > 0 && progressRequested !== progressTotal && (
                    <span className="text-slate-400">
                      {isEn ? 'Requested:' : 'درخواستی:'} {progressRequested.toLocaleString()}
                    </span>
                  )}
                  <span>
                    {isEn ? 'Scanned:' : 'پویش‌شده:'}{' '}
                    <strong className="text-cyan-400 font-bold">{progressScanned.toLocaleString()}</strong> /{' '}
                    {progressTotal > 0 ? progressTotal.toLocaleString() : '?'} IPs
                  </span>
                  <span className="text-emerald-400 font-bold">
                    {isEn ? 'Found:' : 'یافت‌شده:'} {discoveredHosts.length}
                  </span>
                </div>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500 transition-all duration-300"
                  style={{
                    width: `${
                      progressTotal > 0
                        ? Math.min(100, Math.round((progressScanned / progressTotal) * 100))
                        : isScanning
                        ? 30
                        : 100
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Summary Metric Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div
              className={`p-2.5 rounded-xl border flex items-center gap-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                  {isEn ? 'Total Discovered' : 'کل شناسایی‌شده'}
                </div>
                <div className="text-base font-bold font-mono text-cyan-400">
                  {discoveredHosts.length}
                </div>
              </div>
            </div>

            <div
              className={`p-2.5 rounded-xl border flex items-center gap-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                <Terminal className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                  {isEn ? 'Linux Nodes' : 'سرورهای لینوکس'}
                </div>
                <div className="text-base font-bold font-mono text-teal-400">{linuxCount}</div>
              </div>
            </div>

            <div
              className={`p-2.5 rounded-xl border flex items-center gap-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Monitor className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                  {isEn ? 'Windows Nodes' : 'سرورهای ویندوز'}
                </div>
                <div className="text-base font-bold font-mono text-indigo-400">{windowsCount}</div>
              </div>
            </div>

            <div
              className={`p-2.5 rounded-xl border flex items-center gap-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                  {isEn ? 'New for Fleet' : 'آماده ثبت جدید'}
                </div>
                <div className="text-base font-bold font-mono text-emerald-400">
                  {newNodesCount}
                </div>
              </div>
            </div>

            <div
              className={`p-2.5 rounded-xl border flex items-center gap-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                  {isEn ? 'Already in Fleet' : 'ثبت‌شده در ناوگان'}
                </div>
                <div className="text-base font-bold font-mono text-purple-400">
                  {inFleetCount}
                </div>
              </div>
            </div>
          </div>

          {/* Filter Bar & Bulk Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isEn ? 'Search IP or hostname...' : 'جستجوی آی‌پی یا نام هاست...'}
                  className={`pl-8 pr-3 py-1.5 text-xs rounded-xl border focus:outline-none ${
                    isLightMode
                      ? 'bg-white text-slate-800 border-slate-300 focus:border-cyan-500'
                      : 'bg-slate-900 text-slate-200 border-slate-800 focus:border-cyan-400'
                  }`}
                />
              </div>

              {/* Filter Tabs */}
              <div
                className={`flex items-center p-0.5 rounded-xl border text-xs ${
                  isLightMode
                    ? 'bg-white border-slate-300'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setFilterOs('all')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                    filterOs === 'all'
                      ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isEn ? 'All' : 'همه'} ({discoveredHosts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterOs('linux')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                    filterOs === 'linux'
                      ? 'bg-teal-500/20 text-teal-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isEn ? 'Linux' : 'لینوکس'} ({linuxCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterOs('windows')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                    filterOs === 'windows'
                      ? 'bg-indigo-500/20 text-indigo-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isEn ? 'Windows' : 'ویندوز'} ({windowsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterOs('new_only')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                    filterOs === 'new_only'
                      ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isEn ? 'New Nodes' : 'فقط جدید'} ({newNodesCount})
                </button>
                {refusedOnlyCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterOs('refused');
                      setShowRefusedOnly(true);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                      filterOs === 'refused'
                        ? 'bg-amber-500/20 text-amber-300 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isEn ? 'Refused / Closed' : 'پورت‌های بسته'} ({refusedOnlyCount})
                  </button>
                )}
              </div>

              {/* Refused-only visibility toggle */}
              {refusedOnlyCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowRefusedOnly((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-mono border transition cursor-pointer flex items-center gap-1.5 ${
                    showRefusedOnly
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                      : isLightMode
                      ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-600'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-400'
                  }`}
                  title={isEn ? 'Toggle ECONNREFUSED hosts' : 'تغییر وضعیت نمایش هاست‌های پورت بسته'}
                >
                  <Shield className="w-3 h-3 text-amber-400" />
                  <span>
                    {showRefusedOnly
                      ? isEn
                        ? 'Hide Refused'
                        : 'مخفی‌سازی پورت‌های بسته'
                      : isEn
                      ? `Show Refused (${refusedOnlyCount})`
                      : `نمایش پورت‌های بسته (${refusedOnlyCount})`}
                  </span>
                </button>
              )}
            </div>

            {/* Bulk Action Button */}
            <div className="flex items-center gap-2">
              {newNodesCount > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllNew}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                    isLightMode
                      ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                  }`}
                >
                  {selectedIps.size === newNodesCount
                    ? isEn
                      ? 'Deselect All'
                      : 'لغو انتخاب همه'
                    : isEn
                    ? 'Select All New'
                    : 'انتخاب همه جدیدها'}
                </button>
              )}

              {selectedIps.size > 0 && (
                <button
                  type="button"
                  onClick={handleOpenBulkEnroll}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-500/30 transition active:scale-95 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {isEn
                      ? `Add Selected (${selectedIps.size}) to Fleet`
                      : `افزودن ${selectedIps.size} سرور انتخاب‌شده به ناوگان`}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Discovered Hosts Table */}
          <div
            className={`rounded-xl border overflow-hidden ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            {filteredHosts.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto">
                  <Radar className="w-6 h-6" />
                </div>
                <div className="text-sm font-bold">
                  {discoveredHosts.length === 0
                    ? isEn
                      ? 'No Discovery Scan Performed Yet'
                      : 'هنوز پویشی انجام نشده است'
                    : isEn
                    ? 'No Hosts Matching Filter'
                    : 'هیچ میزبانی با فیلتر فعلی همخوانی ندارد'}
                </div>
                <p
                  className={`text-xs max-w-md mx-auto ${
                    isLightMode ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  {discoveredHosts.length === 0
                    ? isEn
                      ? 'Enter your subnet (e.g. 192.168.1.0/24) above and click "Start Discovery" to scan for active compute nodes.'
                      : 'رنج ساب‌نت خود را در کادر بالا وارد کرده و روی «شروع پویش و شناسایی» کلیک نمایید.'
                    : isEn
                    ? 'Try clearing your search query or switching the OS filter tabs.'
                    : 'جستجو را پاک کنید یا تب فیلتر را تغییر دهید.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr
                      className={`border-b text-[11px] font-bold uppercase tracking-wider ${
                        isLightMode
                          ? 'border-slate-200 bg-slate-50 text-slate-600'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400'
                      }`}
                    >
                      <th className="py-3 px-3.5 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={
                            newNodesCount > 0 && selectedIps.size === newNodesCount
                          }
                          onChange={handleSelectAllNew}
                          className="accent-cyan-500 rounded cursor-pointer"
                        />
                      </th>
                      <th className="py-3 px-3.5">{isEn ? 'Host / IP' : 'آدرس آی‌پی / هاست'}</th>
                      <th className="py-3 px-3.5">{isEn ? 'Detected OS' : 'سیستم‌عامل'}</th>
                      <th className="py-3 px-3.5">{isEn ? 'Open Ports' : 'پورت‌های باز'}</th>
                      <th className="py-3 px-3.5">{isEn ? 'Latency' : 'تاخیر پاسخ'}</th>
                      <th className="py-3 px-3.5">{isEn ? 'Fleet Status' : 'وضعیت ناوگان'}</th>
                      <th className="py-3 px-3.5 text-right">{isEn ? 'Action' : 'عملیات'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 font-sans">
                    {filteredHosts.map((host) => {
                      const isSelected = selectedIps.has(host.ip);
                      const isLinux = host.osType === 'linux';
                      const isWindows = host.osType === 'windows';

                      return (
                        <tr
                          key={host.ip}
                          className={`transition-colors ${
                            isSelected
                              ? 'bg-cyan-500/10'
                              : isLightMode
                              ? 'hover:bg-slate-50'
                              : 'hover:bg-slate-800/40'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-3 px-3.5 text-center">
                            {!host.alreadyInFleet ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelect(host.ip)}
                                className="accent-cyan-500 rounded cursor-pointer"
                              />
                            ) : (
                              <span className="text-slate-600">•</span>
                            )}
                          </td>

                          {/* IP & Hostname */}
                          <td className="py-3 px-3.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs tracking-wide">
                                {host.ip}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyIp(host.ip)}
                                className="text-slate-400 hover:text-cyan-400 p-0.5 rounded cursor-pointer"
                                title={isEn ? 'Copy IP' : 'کپی آی‌پی'}
                              >
                                {copiedIp === host.ip ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                            {host.hostname && (
                              <div
                                className={`text-[11px] truncate max-w-[200px] ${
                                  isLightMode ? 'text-slate-500' : 'text-slate-400'
                                }`}
                              >
                                {host.hostname}
                              </div>
                            )}
                          </td>

                          {/* Detected OS Badge */}
                          <td className="py-3 px-3.5">
                            <div className="flex items-center gap-1.5">
                              {host.isRefusedOnly ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                  <Shield className="w-3.5 h-3.5" />
                                  <span>{isEn ? 'ALIVE (CLOSED)' : 'فعال (بسته)'}</span>
                                </span>
                              ) : isLinux ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-teal-500/15 text-teal-400 border border-teal-500/30">
                                  <Terminal className="w-3.5 h-3.5" />
                                  <span>Linux</span>
                                </span>
                              ) : isWindows ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                                  <Monitor className="w-3.5 h-3.5" />
                                  <span>Windows</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                  <HelpCircle className="w-3.5 h-3.5" />
                                  <span>{host.osType.toUpperCase()}</span>
                                </span>
                              )}
                            </div>
                            <div
                              className={`text-[10px] mt-0.5 truncate max-w-[220px] ${
                                isLightMode ? 'text-slate-500' : 'text-slate-400'
                              }`}
                              title={host.osDetail}
                            >
                              {host.osDetail}
                            </div>
                          </td>

                          {/* Open Ports */}
                          <td className="py-3 px-3.5">
                            {host.isRefusedOnly ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                                {isEn ? 'Closed (RST Refused)' : 'بسته (پاسخ RST)'}
                              </span>
                            ) : host.openPorts.length === 0 ? (
                              <span className="text-[10px] text-slate-500 italic font-mono">-</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {host.openPorts.map((p) => {
                                  const isSsh = p === 22;
                                  const isRdp = p === 3389;
                                  return (
                                    <span
                                      key={p}
                                      className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border ${
                                        isSsh
                                          ? 'bg-teal-500/10 text-teal-300 border-teal-500/30'
                                          : isRdp
                                          ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                                          : isLightMode
                                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                                          : 'bg-slate-800 text-slate-300 border-slate-700'
                                      }`}
                                    >
                                      {p}
                                      {isSsh ? '/ssh' : isRdp ? '/rdp' : ''}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </td>

                          {/* Latency */}
                          <td className="py-3 px-3.5">
                            <span
                              className={`inline-flex items-center gap-1 font-mono text-xs font-semibold ${
                                host.latencyMs < 20
                                  ? 'text-emerald-400'
                                  : host.latencyMs < 100
                                  ? 'text-amber-400'
                                  : 'text-red-400'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  host.latencyMs < 20
                                    ? 'bg-emerald-400'
                                    : host.latencyMs < 100
                                    ? 'bg-amber-400'
                                    : 'bg-red-400'
                                }`}
                              />
                              {host.latencyMs} ms
                            </span>
                          </td>

                          {/* Fleet Status */}
                          <td className="py-3 px-3.5">
                            {host.alreadyInFleet ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                <CheckCircle2 className="w-3 h-3 text-purple-400" />
                                <span>{isEn ? 'Enrolled' : 'عضو ناوگان'}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                <span>{isEn ? 'New Host' : 'سرور جدید'}</span>
                              </span>
                            )}
                          </td>

                          {/* Action Button */}
                          <td className="py-3 px-3.5 text-right">
                            {host.alreadyInFleet ? (
                              <span
                                className={`text-[11px] italic ${
                                  isLightMode ? 'text-slate-400' : 'text-slate-500'
                                }`}
                              >
                                {host.existingServerName || (isEn ? 'In Inventory' : 'در لیست')}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenSingleEnroll(host)}
                                className="px-3 py-1 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs transition active:scale-95 cursor-pointer inline-flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" />
                                <span>{isEn ? 'Add to Fleet' : 'افزودن به ناوگان'}</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* Modal Footer */}
        {/* ========================================================= */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3 border-t shrink-0 ${
            isLightMode
              ? 'border-slate-200 bg-white'
              : 'border-slate-800/90 bg-slate-900/80'
          }`}
        >
          <div
            className={`text-xs ${
              isLightMode ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            {isEn
              ? 'Real-time multi-threaded TCP scanner • Zero fake telemetry'
              : 'پویش همزمان چندنخی سوکت • داده‌های صددرصد واقعی و زنده'}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
              }`}
            >
              {isEn ? 'Close' : 'بستن'}
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* Nested Enrollment & Credential Modal (z-[999995]) */}
      {/* ========================================================= */}
      {enrollModalOpen && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in select-none">
          <div
            className={`w-full max-w-lg rounded-2xl border shadow-2xl p-5 space-y-4 ${
              isLightMode
                ? 'bg-white text-slate-800 border-slate-300 shadow-xl'
                : 'bg-slate-950 text-slate-100 border-slate-800 shadow-2xl'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b pb-3 border-slate-700/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">
                    {enrollTargets.length === 1
                      ? isEn
                        ? `Add Server to Fleet (${enrollTargets[0].ip})`
                        : `افزودن سرور به ناوگان (${enrollTargets[0].ip})`
                      : isEn
                      ? `Bulk Enroll ${enrollTargets.length} Servers`
                      : `افزودن گروهی ${enrollTargets.length} سرور`}
                  </h4>
                  <p
                    className={`text-[11px] ${
                      isLightMode ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    {isEn
                      ? 'Configure access credentials or pick from Password Vault'
                      : 'مشخصات اتصال را وارد کنید یا رمز را از والت انتخاب نمایید'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnrollModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-3.5 text-xs">
              {/* Server Name (for single) */}
              {enrollTargets.length === 1 && (
                <div>
                  <label className="block font-semibold mb-1">
                    {isEn ? 'Server Name / Label' : 'نام یا عنوان سرور'}
                  </label>
                  <input
                    type="text"
                    value={enrollName}
                    onChange={(e) => setEnrollName(e.target.value)}
                    placeholder="e.g. Web-Gateway-01"
                    className={`w-full px-3 py-1.5 rounded-lg border focus:outline-none ${
                      isLightMode
                        ? 'bg-slate-50 text-slate-900 border-slate-300 focus:border-cyan-500'
                        : 'bg-slate-900 text-slate-100 border-slate-700 focus:border-cyan-400'
                    }`}
                  />
                </div>
              )}

              {/* OS Type Selector */}
              <div>
                <label className="block font-semibold mb-1">
                  {isEn ? 'Operating System & Protocol' : 'سیستم‌عامل و پروتکل ارتباطی'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEnrollOsType('linux');
                      setEnrollPort(22);
                      if (enrollUser === 'Administrator') setEnrollUser('root');
                    }}
                    className={`py-2 px-3 rounded-xl border flex items-center justify-center gap-2 font-bold cursor-pointer transition ${
                      enrollOsType === 'linux'
                        ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 shadow-xs'
                        : isLightMode
                        ? 'bg-slate-100 text-slate-600 border-slate-200'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    <Terminal className="w-4 h-4" />
                    <span>Linux (SSH - Port 22)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEnrollOsType('windows');
                      setEnrollPort(3389);
                      if (enrollUser === 'root') setEnrollUser('Administrator');
                    }}
                    className={`py-2 px-3 rounded-xl border flex items-center justify-center gap-2 font-bold cursor-pointer transition ${
                      enrollOsType === 'windows'
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-xs'
                        : isLightMode
                        ? 'bg-slate-100 text-slate-600 border-slate-200'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    <Monitor className="w-4 h-4" />
                    <span>Windows (RDP - Port 3389)</span>
                  </button>
                </div>
              </div>

              {/* Category & Port */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold mb-1">
                    {isEn ? 'Category' : 'دسته‌بندی'}
                  </label>
                  <select
                    value={enrollCategory}
                    onChange={(e) => setEnrollCategory(e.target.value)}
                    className={`w-full px-2.5 py-1.5 rounded-lg border focus:outline-none cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-50 text-slate-800 border-slate-300'
                        : 'bg-slate-900 text-slate-200 border-slate-700'
                    }`}
                  >
                    {SERVER_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    {isEn ? 'Connection Port' : 'پورت اتصال'}
                  </label>
                  <input
                    type="number"
                    value={enrollPort}
                    onChange={(e) => setEnrollPort(Number(e.target.value))}
                    className={`w-full px-3 py-1.5 rounded-lg border font-mono focus:outline-none ${
                      isLightMode
                        ? 'bg-slate-50 text-slate-900 border-slate-300'
                        : 'bg-slate-900 text-slate-100 border-slate-700'
                    }`}
                  />
                </div>
              </div>

              {/* Username */}
              <div>
                <label className="block font-semibold mb-1">
                  {isEn ? 'Username' : 'نام کاربری'}
                </label>
                <input
                  type="text"
                  value={enrollUser}
                  onChange={(e) => setEnrollUser(e.target.value)}
                  placeholder={enrollOsType === 'windows' ? 'Administrator' : 'root'}
                  className={`w-full px-3 py-1.5 rounded-lg border focus:outline-none ${
                    isLightMode
                      ? 'bg-slate-50 text-slate-900 border-slate-300 focus:border-cyan-500'
                      : 'bg-slate-900 text-slate-100 border-slate-700 focus:border-cyan-400'
                  }`}
                />
              </div>

              {/* Password & Vault Selection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold">
                    {isEn ? 'Password / Key' : 'گذرواژه / کلید ورود'}
                  </label>
                  {/* Pick from Vault Button */}
                  <button
                    type="button"
                    onClick={() => setIsVaultPickerOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer"
                  >
                    <KeyRound className="w-3 h-3" />
                    <span>{isEn ? 'Pick from Vault' : 'انتخاب از والت رمزها'}</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={enrollShowPassword ? 'text' : 'password'}
                    value={enrollPassword}
                    onChange={(e) => setEnrollPassword(e.target.value)}
                    placeholder={
                      isEn
                        ? 'Enter password or pick from vault...'
                        : 'رمز عبور را وارد کنید یا از والت بردارید...'
                    }
                    className={`w-full pl-3 pr-9 py-1.5 rounded-lg border focus:outline-none font-mono ${
                      isLightMode
                        ? 'bg-slate-50 text-slate-900 border-slate-300 focus:border-cyan-500'
                        : 'bg-slate-900 text-slate-100 border-slate-700 focus:border-cyan-400'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setEnrollShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {enrollShowPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Checkboxes: Prompt on connect / Save to vault */}
              <div className="space-y-1.5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-400">
                  <input
                    type="checkbox"
                    checked={enrollPromptOnConnect}
                    onChange={(e) => setEnrollPromptOnConnect(e.target.checked)}
                    className="accent-cyan-500 rounded cursor-pointer"
                  />
                  <span>
                    {isEn
                      ? 'Prompt password on connect (zero server-side stored password)'
                      : 'درخواست رمز هنگام اتصال (عدم ذخیره رمز در پایگاه داده سرور)'}
                  </span>
                </label>

                {enrollPassword && (
                  <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-400">
                    <input
                      type="checkbox"
                      checked={enrollSaveToVault}
                      onChange={(e) => setEnrollSaveToVault(e.target.checked)}
                      className="accent-cyan-500 rounded cursor-pointer"
                    />
                    <span>
                      {isEn
                        ? 'Also save these credentials into the encrypted Password Vault'
                        : 'ذخیره‌سازی این اطلاعات در والت رمزهای عبور رمزنگاری‌شده'}
                    </span>
                  </label>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-700/40">
              <button
                type="button"
                onClick={() => setEnrollModalOpen(false)}
                disabled={isSubmittingEnroll}
                className={`px-4 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                  isLightMode
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                onClick={handleConfirmEnroll}
                disabled={isSubmittingEnroll}
                className="px-5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-md shadow-cyan-600/30 transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isSubmittingEnroll ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{isEn ? 'Enrolling...' : 'در حال ثبت...'}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Confirm & Add to Fleet' : 'تایید و ثبت در ناوگان'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* Vault Password Picker Modal (z-[999999]) */}
      {/* ========================================================= */}
      {isVaultPickerOpen && (
        <VaultPasswordPickerModal
          isOpen={isVaultPickerOpen}
          onClose={() => setIsVaultPickerOpen(false)}
          onSelectPassword={handleVaultPasswordSelected}
          targetHost={enrollTargets[0]?.ip || ''}
          isLightMode={isLightMode}
          isEn={isEn}
          zIndex={999999}
        />
      )}
    </div>,
    document.body
  );
};
