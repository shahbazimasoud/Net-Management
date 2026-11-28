import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Cable,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Eraser,
  ExternalLink,
  History,
  Info,
  Layers,
  Loader2,
  Monitor,
  Network,
  PlugZap,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  Waypoints,
  X,
} from 'lucide-react';
import { AccessPolicy } from '../types';
import { AuthUser } from '../context/AuthContext';
import { isUserDomainAdmin, isUserSuperAdmin } from '../utils/rbac';
import { isTabAllowed } from '../services/settingsStorage';
import { FieldInfoTooltip } from './common/FieldInfoTooltip';
import {
  HelpdeskSwitchLocatorHistoryItem,
  HelpdeskSwitchLocatorHistoryResponse,
  clearHelpdeskSwitchLocatorHistory,
  deleteHelpdeskSwitchLocatorHistoryItem,
  fetchHelpdeskStatus,
  fetchHelpdeskSwitchLocatorHistory,
} from '../services/api';
import {
  HelpdeskSwitchLocatorSubTab,
  bindHelpdeskSwitchLocatorRamOwner,
  detectClientQueryKind,
  getHelpdeskSwitchLocatorRamSnapshot,
  patchHelpdeskSwitchLocatorRamSnapshot,
  runHelpdeskSwitchLocate,
  subscribeHelpdeskSwitchLocatorRam,
  wipeHelpdeskSwitchLocatorRamSession,
} from '../services/helpdeskSwitchLocatorRamSession';

interface HelpDeskSwitchLocatorViewProps {
  isLightMode: boolean;
  isEn: boolean;
  effectivePolicy?: AccessPolicy | null;
  currentUser?: AuthUser | null;
  onNavigateToDevices?: () => void;
  onInspectSwitchPorts?: (switchId: string) => void;
  onConnectSwitchTerminal?: (switchId: string, port?: string) => void;
}

function formatDateDisplay(iso: string | null | undefined, isEn: boolean): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  try {
    return d.toLocaleString(isEn ? 'en-US' : 'fa-IR', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d.toISOString().replace('T', ' ').slice(0, 16);
  }
}

export const HelpDeskSwitchLocatorView: React.FC<HelpDeskSwitchLocatorViewProps> = ({
  isLightMode,
  isEn,
  effectivePolicy,
  currentUser,
  onNavigateToDevices,
  onInspectSwitchPorts,
  onConnectSwitchTerminal,
}) => {
  const ram = useSyncExternalStore(
    subscribeHelpdeskSwitchLocatorRam,
    getHelpdeskSwitchLocatorRamSnapshot
  );

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showUnreachable, setShowUnreachable] = useState(false);
  const [camSearch, setCamSearch] = useState('');
  const [arpSearch, setArpSearch] = useState('');

  // History sub-tab state (backed by PostgreSQL helpdesk_switch_locator_history)
  const [historyScope, setHistoryScope] = useState<'all' | 'own'>('own');
  const [historyItems, setHistoryItems] = useState<HelpdeskSwitchLocatorHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyStats, setHistoryStats] = useState<
    HelpdeskSwitchLocatorHistoryResponse['stats'] | null
  >(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(15);
  const [historySearch, setHistorySearch] = useState('');
  const [historySearchInput, setHistorySearchInput] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<
    'all' | 'success' | 'not_found' | 'failed'
  >('all');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'ipv4' | 'mac'>('all');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyHistoryId, setBusyHistoryId] = useState<string | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  // Bind session owner cleanly
  useEffect(() => {
    bindHelpdeskSwitchLocatorRamOwner(currentUser?.id || currentUser?.username || null);
  }, [currentUser?.id, currentUser?.username]);

  // Fetch initial rateLimit badge safely on mount
  useEffect(() => {
    let active = true;
    fetchHelpdeskStatus()
      .then((res) => {
        if (active && res?.rateLimit) {
          patchHelpdeskSwitchLocatorRamSnapshot({ rateLimit: res.rateLimit });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // RBAC capabilities
  const isSuper = isUserSuperAdmin(currentUser, effectivePolicy);
  const isDomAdmin = isUserDomainAdmin(currentUser);
  const hasFull = isSuper || isDomAdmin;
  const canAccessLocator =
    hasFull ||
    (effectivePolicy?.canViewHelpdeskSwitchLocator !== undefined
      ? effectivePolicy.canViewHelpdeskSwitchLocator === true
      : effectivePolicy?.canViewHelpdesk === true &&
        effectivePolicy?.canRunHelpdeskDiagnostics === true) ||
    isTabAllowed('helpdesk-switch-locator', effectivePolicy || undefined, currentUser);

  const queryKind = useMemo(() => detectClientQueryKind(ram.targetInput), [ram.targetInput]);

  // Consistent theme styling tokens matching HelpDeskUsersView
  const surfaceBg = isLightMode
    ? 'bg-white border-slate-200 shadow-sm'
    : 'bg-slate-900/90 border-slate-800 shadow-lg';
  const subSurfaceBg = isLightMode
    ? 'bg-slate-50 border-slate-200'
    : 'bg-slate-950/70 border-slate-800';
  const inputCls = isLightMode
    ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-teal-500'
    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-teal-500';
  const textPrimary = isLightMode ? 'text-slate-900' : 'text-slate-100';
  const textSecondary = isLightMode ? 'text-slate-600' : 'text-slate-300';
  const textMuted = isLightMode ? 'text-slate-500' : 'text-slate-400';

  const handleCopy = (val: string, key: string) => {
    if (!val) return;
    navigator.clipboard?.writeText(val).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1500);
  };

  const loadLocatorHistory = useCallback(
    async (overrides?: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: 'all' | 'success' | 'not_found' | 'failed';
      queryType?: 'all' | 'ipv4' | 'mac';
    }) => {
      setLoadingHistory(true);
      setHistoryError(null);
      try {
        const res = await fetchHelpdeskSwitchLocatorHistory({
          page: overrides?.page ?? historyPage,
          pageSize: overrides?.pageSize ?? historyPageSize,
          search: overrides?.search ?? historySearch,
          status: overrides?.status ?? historyStatusFilter,
          queryType: overrides?.queryType ?? historyTypeFilter,
        });
        setHistoryScope(res.scope || 'own');
        setHistoryItems(res.items || []);
        setHistoryTotal(res.total || 0);
        setHistoryStats(res.stats || null);
      } catch (err: any) {
        setHistoryError(err?.message || 'Failed to load lookup history');
      } finally {
        setLoadingHistory(false);
      }
    },
    [historyPage, historyPageSize, historySearch, historyStatusFilter, historyTypeFilter]
  );

  useEffect(() => {
    if (ram.activeSubTab === 'history' && canAccessLocator) {
      loadLocatorHistory();
    }
  }, [ram.activeSubTab, canAccessLocator, loadLocatorHistory]);

  const handleSubmitLocate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canAccessLocator || ram.loading) return;
    if (ram.activeSubTab === 'history') {
      patchHelpdeskSwitchLocatorRamSnapshot({ activeSubTab: 'overview' });
    }
    const res = await runHelpdeskSwitchLocate();
    if (res && ram.activeSubTab === 'history') {
      loadLocatorHistory({ page: 1 });
    }
  };

  const handleDeleteHistoryItem = async (id: string) => {
    setBusyHistoryId(id);
    setHistoryNotice(null);
    try {
      await deleteHelpdeskSwitchLocatorHistoryItem(id);
      setHistoryNotice({
        ok: true,
        text: isEn ? 'Lookup history record removed.' : 'رکورد تاریخچه با موفقیت حذف شد.',
      });
      await loadLocatorHistory();
    } catch (err: any) {
      setHistoryNotice({
        ok: false,
        text: err?.message || (isEn ? 'Delete failed' : 'خطا در حذف ردیف'),
      });
    } finally {
      setBusyHistoryId(null);
    }
  };

  const handleClearAllHistory = async () => {
    setBusyHistoryId('ALL');
    setHistoryNotice(null);
    try {
      const res = await clearHelpdeskSwitchLocatorHistory();
      setConfirmClearHistory(false);
      setHistoryNotice({
        ok: true,
        text: isEn
          ? `Cleared ${res.clearedCount} lookup history records.`
          : `${res.clearedCount} رکورد تاریخچه ردیابی پاک‌سازی شد.`,
      });
      setHistoryPage(1);
      await loadLocatorHistory({ page: 1 });
    } catch (err: any) {
      setHistoryNotice({
        ok: false,
        text: err?.message || (isEn ? 'Failed to clear history' : 'خطا در پاک‌سازی تاریخچه'),
      });
    } finally {
      setBusyHistoryId(null);
    }
  };

  const handleExportHistoryCsv = () => {
    if (historyItems.length === 0) return;
    const headers = [
      'CheckedAt',
      'TargetQuery',
      'QueryType',
      'ResolvedIP',
      'ResolvedMAC',
      'EndpointHostname',
      'MacSource',
      'Vendor',
      'SwitchName',
      'SwitchIP',
      'EdgePort',
      'VLAN',
      'Status',
      'ReasonCode',
      'Strategy',
      'ScannedSwitches',
      'ActiveSwitches',
      'DurationMs',
      'Operator',
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = historyItems.map((it) =>
      [
        it.checkedAt,
        it.targetQuery,
        it.queryType,
        it.resolvedIp,
        it.resolvedMac,
        it.endpointHostname,
        it.macSource,
        it.vendorName,
        it.matchedSwitchName,
        it.matchedSwitchIp,
        it.matchedPort,
        it.vlan,
        it.status,
        it.reasonCode,
        it.traceStrategyUsed,
        it.switchesScannedCount,
        it.switchesActiveCount,
        it.durationMs,
        it.actorName,
      ]
        .map(esc)
        .join(',')
    );
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `switch-locator-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRelocateFromHistory = async (item: HelpdeskSwitchLocatorHistoryItem) => {
    const macCandidate =
      detectClientQueryKind(item.resolvedMac || '') === 'mac'
        ? item.resolvedMac
        : detectClientQueryKind(item.targetQuery || '') === 'mac'
        ? item.targetQuery
        : '';
    if (!macCandidate) return;
    patchHelpdeskSwitchLocatorRamSnapshot({
      targetInput: macCandidate,
      activeSubTab: 'overview',
    });
    await runHelpdeskSwitchLocate({ targetQuery: macCandidate });
  };

  const tracker = ram.data?.tracker || null;
  const edge = tracker?.finalEdgePort || null;
  const hops = tracker?.pathHops || [];
  const camEntries = tracker?.camEntries || [];
  const arpEntries = tracker?.arpEntries || [];
  const unreachable = tracker?.unreachableSwitches || [];
  const reasonCode = tracker?.reasonCode;

  const filteredCamEntries = useMemo(() => {
    const q = camSearch.trim().toLowerCase();
    if (!q) return camEntries;
    return camEntries.filter(
      (c) =>
        c.switchName.toLowerCase().includes(q) ||
        c.switchIp.toLowerCase().includes(q) ||
        c.port.toLowerCase().includes(q) ||
        String(c.vlan || '').toLowerCase().includes(q) ||
        String(c.peerDeviceName || '').toLowerCase().includes(q)
    );
  }, [camEntries, camSearch]);

  const filteredArpEntries = useMemo(() => {
    const q = arpSearch.trim().toLowerCase();
    if (!q) return arpEntries;
    return arpEntries.filter(
      (a) =>
        a.switchName.toLowerCase().includes(q) ||
        a.switchIp.toLowerCase().includes(q) ||
        a.ip.toLowerCase().includes(q) ||
        a.mac.toLowerCase().includes(q) ||
        a.interface.toLowerCase().includes(q)
    );
  }, [arpEntries, arpSearch]);

  const sourceMeta = (() => {
    const src = ram.data?.endpointMacSource;
    if (src === 'direct_mac') {
      return {
        label: isEn ? 'Direct MAC Query' : 'استعلام مستقیم MAC',
        cls: isLightMode
          ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
          : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
      };
    }
    if (src === 'endpoint_live') {
      return {
        label: isEn ? 'Endpoint Live NIC Probe' : 'خوانده‌شده زنده از کارت شبکه',
        cls: isLightMode
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
          : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      };
    }
    if (src === 'client_cached') {
      return {
        label: isEn ? 'Selected NIC Adapter' : 'کارت شبکه انتخابی اپراتور',
        cls: isLightMode
          ? 'bg-teal-50 text-teal-800 border-teal-200'
          : 'bg-teal-500/10 text-teal-300 border-teal-500/30',
      };
    }
    return {
      label: isEn ? 'L3 Switch ARP Resolution' : 'کشف مک از جدول ARP سوئیچ/روتر',
      cls: isLightMode
        ? 'bg-sky-50 text-sky-800 border-sky-200'
        : 'bg-sky-500/10 text-sky-300 border-sky-500/30',
    };
  })();

  const subTabs: Array<{
    id: HelpdeskSwitchLocatorSubTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: string | number | null;
  }> = [
    {
      id: 'overview',
      label: isEn ? 'Switch Port & Access Edge' : 'پورت سوئیچ و پورت اکسس',
      icon: Cable,
      badge: edge ? edge.port : null,
    },
    {
      id: 'path',
      label: isEn ? 'Physical Network Path' : 'مسیر فیزیکی شبکه',
      icon: Waypoints,
      badge: hops.length > 0 ? hops.length : null,
    },
    {
      id: 'cam_arp',
      label: isEn ? 'Switch CAM & L3 ARP Tables' : 'جداول CAM و ARP سوئیچ‌ها',
      icon: Layers,
      badge: camEntries.length + arpEntries.length > 0 ? camEntries.length + arpEntries.length : null,
    },
    {
      id: 'history',
      label: isEn ? 'Lookup History' : 'تاریخچه ردیابی‌ها',
      icon: History,
      badge: historyStats?.totalLookups ?? null,
    },
  ];

  // RBAC Fail-Closed Screen
  if (!canAccessLocator) {
    return (
      <div
        className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-12"
        dir={isEn ? 'ltr' : 'rtl'}
      >
        <div className={`rounded-2xl border p-8 text-center max-w-2xl mx-auto space-y-3 ${surfaceBg}`}>
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className={`text-lg font-bold ${textPrimary}`}>
            {isEn
              ? 'Access Denied — Physical Switch Port & Network Path Locator'
              : 'عدم دسترسی — ردیاب پورت سوئیچ و مسیر شبکه'}
          </h2>
          <p className={`text-xs leading-relaxed ${textMuted}`}>
            {isEn
              ? 'Your active RBAC policy does not grant permission to access Switch Port & Path Locator (canViewHelpdeskSwitchLocator). Please contact your system administrator to request access.'
              : 'پالیسی دسترسی فعلی شما فاقد مجوز ورود و ردیابی پورت سوئیچ (canViewHelpdeskSwitchLocator) است. در صورت نیاز با مدیر سیستم تماس بگیرید.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-6 pb-10"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Waypoints className="w-6 h-6 text-teal-500 shrink-0" />
            <h1 className={`text-xl font-bold tracking-tight ${textPrimary}`}>
              {isEn
                ? 'Physical Switch Port & Network Path Locator'
                : 'ردیاب پورت سوئیچ و مسیر فیزیکی شبکه (HelpDesk)'}
            </h1>
          </div>
          <p className={`mt-1 text-xs ${textMuted}`}>
            {isEn
              ? 'Manual MAC Address Lookup · Live Switch CAM & Reverse ARP Correlation · Hop-by-Hop Switch Trace via SSH (Zero SNMP / Zero Stored Credentials)'
              : 'ردیابی دستی فقط بر اساس مک آدرس (MAC) · استعلام زنده جدول CAM و ARP در کل سوئیچ‌های شبکه · نمایش مسیر فیزیکی گام‌به‌گام'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {ram.rateLimit && (
            <div
              className={`px-3 py-2 rounded-lg border text-xs font-mono tabular-nums flex items-center gap-2 ${
                ram.rateLimit.isFrozen
                  ? 'border-rose-500/50 bg-rose-500/10 text-rose-500'
                  : surfaceBg
              }`}
            >
              <ShieldCheck
                className={`w-4 h-4 ${
                  ram.rateLimit.isFrozen ? 'text-rose-500' : 'text-emerald-500'
                }`}
              />
              <span className={textPrimary}>
                {isEn
                  ? `Action Quota: ${ram.rateLimit.remainingWriteActions}/${ram.rateLimit.maxWriteActions}`
                  : `سهمیه عملیات مجاز: ${ram.rateLimit.remainingWriteActions}/${ram.rateLimit.maxWriteActions}`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Top On-Demand Target MAC Locator Card */}
      <form
        onSubmit={handleSubmitLocate}
        className={`rounded-xl border p-4 sm:p-5 space-y-4 overflow-hidden ${surfaceBg}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold min-w-0">
            <Cable className="w-4 h-4 text-teal-500 shrink-0" />
            <span className={`truncate ${textPrimary}`}>
              {isEn
                ? 'On-Demand Target MAC Locator'
                : 'ردیابی لحظه‌ای پورت سوئیچ بر اساس مک آدرس (MAC Locator)'}
            </span>
            <FieldInfoTooltip
              isEn={isEn}
              isLightMode={isLightMode}
              fieldName={isEn ? 'Manual MAC Switch Port Locator' : 'ردیاب پورت سوئیچ بر اساس MAC'}
              whatIsIt={
                isEn
                  ? 'Accepts any manually entered target MAC address and traces its live CAM table entry hop-by-hop across authorized network switches, plus reverse ARP lookup on L3 switches/routers.'
                  : 'مک آدرس وارد شده را دریافت کرده و بدون نیاز به هم‌سابنت بودن یا دسترسی مستقیم به سیستم کاربر، پورت اکسس، VLAN، مسیر فیزیکی گام‌به‌گام و در صورت وجود IP مرتبط در جدول ARP را در تمام سوئیچ‌های مجاز پیدا می‌کند.'
              }
              whyNeeded={
                isEn
                  ? 'Because switch CAM tables operate at Layer 2 across all VLANs regardless of IP subnet boundaries, tracing directly by MAC finds the exact physical port reliably anywhere in the switching fabric.'
                  : 'از آنجا که سوئیچ‌ها در لایه ۲ بر اساس مک آدرس عمل می‌کنند (حتی اگر سیستم در سابنت دیگری باشد)، ردیابی مستقیم با MAC دقیق‌ترین و سریع‌ترین روش کشف پورت فیزیکی در کل شبکه است.'
              }
              example={
                isEn
                  ? 'Supported formats: 00:50:56:A1:22:34  or  00-50-56-A1-22-34  or  0050.56a1.2234'
                  : 'فرمت‌های مجاز: 00:50:56:A1:22:34  یا  00-50-56-A1-22-34  یا  0050.56a1.2234'
              }
            />
          </div>

          <div className={`text-[11px] flex flex-wrap items-center gap-2 ${textMuted}`}>
            <span>
              {isEn
                ? 'Layer-2 Switch CAM Trace (Works Across All Subnets & VLANs)'
                : 'ردیابی مستقیم لایه ۲ در تمام سابنت‌ها و VLANها بدون نیاز به رمز سیستم'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          {/* Target MAC Address Only */}
          <div className="lg:col-span-5 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className={`block text-xs font-medium ${textMuted}`}>
                {isEn ? 'Target MAC Address' : 'مک آدرس هدف (MAC Address)'}
              </label>
              {queryKind !== 'empty' && (
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold uppercase ${
                    queryKind === 'mac'
                      ? isLightMode
                        ? 'bg-teal-100 text-teal-700'
                        : 'bg-teal-500/20 text-teal-300'
                      : isLightMode
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {queryKind === 'mac'
                    ? 'MAC'
                    : queryKind === 'ipv4_disallowed'
                    ? isEn
                      ? 'IPv4 Disabled — Enter MAC'
                      : 'ورود IP مجاز نیست — مک بزنید'
                    : isEn
                    ? 'Invalid MAC'
                    : 'مک نامعتبر'}
                </span>
              )}
            </div>
            <input
              type="text"
              dir="ltr"
              value={ram.targetInput}
              onChange={(e) => patchHelpdeskSwitchLocatorRamSnapshot({ targetInput: e.target.value })}
              placeholder="00:50:56:A1:22:34  or  0050.56a1.2234"
              className={`w-full min-w-0 px-3 py-2 rounded-lg border text-xs font-mono outline-none transition ${inputCls}`}
              required
            />
          </div>

          {/* Switch Trace Strategy */}
          <div className="lg:col-span-3 min-w-0">
            <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
              {isEn ? 'Switch Trace Strategy' : 'استراتژی اسکن سوئیچ‌ها'}
            </label>
            <select
              value={ram.traceMode}
              onChange={(e) =>
                patchHelpdeskSwitchLocatorRamSnapshot({
                  traceMode: e.target.value === 'full_parallel' ? 'full_parallel' : 'fast_hop',
                })
              }
              className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
            >
              <option value="fast_hop">
                {isEn ? 'Fast Hop-by-Hop (Recommended)' : 'سریع گام‌به‌گام (پیشنهادی)'}
              </option>
              <option value="full_parallel">
                {isEn ? 'Full Parallel (All Switches)' : 'اسکن کامل موازی همه سوئیچ‌ها'}
              </option>
            </select>
          </div>

          {/* Bypass Cache Toggle */}
          <div className="lg:col-span-2 min-w-0">
            <label
              className={`h-[34px] px-3 rounded-lg border flex items-center gap-2 cursor-pointer text-xs ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-700'
                  : 'bg-slate-950 border-slate-700 text-slate-200'
              }`}
            >
              <input
                type="checkbox"
                checked={ram.forceRefresh}
                onChange={(e) =>
                  patchHelpdeskSwitchLocatorRamSnapshot({ forceRefresh: e.target.checked })
                }
                className="rounded border-slate-400 text-teal-600 focus:ring-teal-500 shrink-0"
              />
              <span className="truncate">
                {isEn ? 'Live SSH (No Cache)' : 'اسکن زنده (بدون کش)'}
              </span>
            </label>
          </div>

          {/* Primary Action + Wipe */}
          <div className="md:col-span-2 lg:col-span-2 min-w-0 flex items-center gap-2">
            <button
              type="submit"
              disabled={!canAccessLocator || ram.loading || queryKind !== 'mac'}
              className="flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition whitespace-nowrap cursor-pointer"
            >
              {ram.loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Search className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">{isEn ? 'Locate Port' : 'ردیابی پورت'}</span>
            </button>
            <button
              type="button"
              onClick={() => wipeHelpdeskSwitchLocatorRamSession()}
              title={
                isEn
                  ? 'Wipe MAC query & results from RAM'
                  : 'پاک‌سازی فوری مک آدرس و نتایج از حافظه موقت'
              }
              aria-label={isEn ? 'Wipe session' : 'پاک‌سازی نشست'}
              className={`shrink-0 h-[34px] w-[34px] flex items-center justify-center rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Recent Lookups in RAM Strip */}
        {ram.recentLookups.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className={`text-[11px] font-medium ${textMuted}`}>
              {isEn ? 'Recent in RAM:' : 'ردیابی‌های اخیر (RAM):'}
            </span>
            {ram.recentLookups.map((item) => (
              <button
                key={item.targetQuery}
                type="button"
                disabled={ram.loading}
                onClick={() => {
                  patchHelpdeskSwitchLocatorRamSnapshot({
                    targetInput: item.targetQuery,
                    activeSubTab: 'overview',
                  });
                  void runHelpdeskSwitchLocate({ targetQuery: item.targetQuery });
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-mono transition cursor-pointer disabled:opacity-50 ${
                  ram.data?.targetQuery.toLowerCase() === item.targetQuery.toLowerCase()
                    ? isLightMode
                      ? 'bg-teal-50 border-teal-300 text-teal-800 font-semibold'
                      : 'bg-teal-500/15 border-teal-500/40 text-teal-300 font-semibold'
                    : isLightMode
                    ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    : 'bg-slate-950/60 hover:bg-slate-800 border-slate-800 text-slate-300'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    item.found ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span dir="ltr">{item.targetQuery}</span>
                {item.matchedSwitchName && item.matchedPort && (
                  <span className={textMuted} dir="ltr">
                    · {item.matchedSwitchName} ({item.matchedPort})
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Error / Blocked Alert */}
      {ram.error && (
        <div
          className={`rounded-xl border p-4 flex items-start gap-3 ${
            ram.blockedByException
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-500'
          }`}
        >
          {ram.blockedByException ? (
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 flex-1 space-y-1 text-xs">
            <div className="font-bold">
              {ram.blockedByException
                ? isEn
                  ? 'Target Blocked by HelpDesk Policy / Exception Rule'
                  : 'مسدودسازی توسط پالیسی دسترسی یا قانون استثنائات هلپ‌دسک'
                : isEn
                ? 'Switch Port Locator Error'
                : 'خطا در ردیابی پورت سوئیچ'}
            </div>
            <div className="leading-relaxed">{isEn ? ram.error : ram.errorFa || ram.error}</div>
          </div>
          <button
            type="button"
            onClick={() => patchHelpdeskSwitchLocatorRamSnapshot({ error: null, errorFa: null })}
            className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loaded Target Summary Strip */}
      {ram.data && tracker && (
        <div className={`rounded-xl border p-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 ${surfaceBg}`}>
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${
                edge
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-500'
              }`}
            >
              {edge ? <CheckCircle2 className="w-5 h-5" /> : <Waypoints className="w-5 h-5" />}
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-sm font-bold font-mono ${textPrimary}`} dir="ltr">
                  {ram.data.endpointHostname || ram.data.targetQuery}
                </span>
                <span className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${sourceMeta.cls}`}>
                  {sourceMeta.label}
                </span>
                {tracker.resolvedMac && (
                  <button
                    type="button"
                    onClick={() => handleCopy(tracker.resolvedMac || '', 'summary-mac')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-mono cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-950 border-slate-800 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <span dir="ltr">{tracker.resolvedMac}</span>
                    {copiedKey === 'summary-mac' ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3 opacity-70" />
                    )}
                  </button>
                )}
              </div>
              <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${textMuted}`}>
                <span dir="ltr">IP: {tracker.resolvedIp || ram.data.targetIp || '—'}</span>
                <span>·</span>
                <span>{isEn ? 'Vendor' : 'سازنده'}: {tracker.vendor?.vendor || (isEn ? 'Unknown OUI' : 'نامشخص')}</span>
                <span>·</span>
                <span>
                  {isEn ? 'Switches Scanned' : 'سوئیچ‌های اسکن‌شده'}:{' '}
                  <strong className={textPrimary}>
                    {tracker.switchesActiveCount}/{tracker.switchesScannedCount}
                  </strong>
                </span>
                <span>·</span>
                <span dir="ltr">{tracker.durationMs}ms</span>
              </div>
            </div>
          </div>

          {/* Right RBAC Quick Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={ram.loading}
              onClick={() => void runHelpdeskSwitchLocate({ forceRefresh: true })}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                isLightMode
                  ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                  : 'bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-100'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-teal-500 ${ram.loading ? 'animate-spin' : ''}`} />
              <span>{isEn ? 'Live Rescan' : 'اسکن مجدد زنده'}</span>
            </button>

            {edge && ram.data.rbac.canInspectMatchedSwitchPorts && onInspectSwitchPorts && (
              <button
                type="button"
                onClick={() => onInspectSwitchPorts(edge.switchId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold transition cursor-pointer"
              >
                <Cable className="w-3.5 h-3.5" />
                <span>{isEn ? 'Inspect Switch Ports' : 'بازرسی پورت سوئیچ'}</span>
              </button>
            )}

            {edge && ram.data.rbac.canOpenMatchedSwitchTerminal && onConnectSwitchTerminal && (
              <button
                type="button"
                onClick={() => onConnectSwitchTerminal(edge.switchId, edge.port)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                  isLightMode
                    ? 'bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-800'
                    : 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/30 text-sky-300'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>{isEn ? 'Switch SSH' : 'ترمینال سوئیچ'}</span>
              </button>
            )}

            {ram.data.rbac.canOpenDevicesModule && onNavigateToDevices && (
              <button
                type="button"
                onClick={onNavigateToDevices}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                  isLightMode
                    ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>{isEn ? 'Devices' : 'تجهیزات'}</span>
                <ExternalLink className="w-3 h-3 opacity-60" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Segmented Navigation Tab Bar (Matching Active Directory & User Support HelpDesk) */}
      <div
        className={`flex flex-wrap gap-1.5 p-1.5 rounded-xl border ${
          isLightMode ? 'bg-slate-100/90 border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}
      >
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const active = ram.activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => patchHelpdeskSwitchLocatorRamSnapshot({ activeSubTab: tab.id })}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                active
                  ? 'bg-teal-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-white hover:text-slate-900'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge !== null && tab.badge !== 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
                    active
                      ? 'bg-white/20 text-white'
                      : isLightMode
                      ? 'bg-slate-200 text-slate-700'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Empty State Prompt (when on overview/path/cam_arp and no lookup has run yet) */}
      {!ram.data && !ram.loading && ram.activeSubTab !== 'history' && (
        <div className={`rounded-2xl border p-8 sm:p-10 text-center space-y-4 ${surfaceBg}`}>
          <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-500 flex items-center justify-center mx-auto">
            <Waypoints className="w-7 h-7" />
          </div>
          <div className="max-w-xl mx-auto space-y-1.5">
            <h2 className={`text-base font-bold ${textPrimary}`}>
              {isEn
                ? 'Enter a Target MAC Address Above to Trace Its Switch Port'
                : 'برای ردیابی پورت سوئیچ و مسیر شبکه، مک آدرس را در کادر بالا وارد کنید'}
            </h2>
            <p className={`text-xs leading-relaxed ${textMuted}`}>
              {isEn
                ? 'Enter the target MAC address in any standard notation (AA:BB:CC:DD:EE:FF, AA-BB-CC-DD-EE-FF, or aabb.ccdd.eeff). The locator queries authorized switches via SSH and identifies the physical edge port, VLAN, vendor OUI, and hop-by-hop uplink path.'
                : 'مک آدرس سیستم هدف را به هر یک از فرمت‌های استاندارد وارد کنید تا سامانه از طریق SSH در کل سوئیچ‌های مجاز پورت اکسس دقیق، VLAN، سازنده کارت شبکه و مسیر فیزیکی گام‌به‌گام را نمایش دهد.'}
            </p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {ram.loading && ram.activeSubTab !== 'history' && (
        <div className={`rounded-2xl border p-10 text-center space-y-3 ${surfaceBg}`}>
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-teal-500" />
          <div className={`text-sm font-bold ${textPrimary}`}>
            {isEn
              ? `Tracing physical switch port & network path for ${ram.targetInput}...`
              : `در حال ردیابی پورت سوئیچ و مسیر فیزیکی شبکه برای ${ram.targetInput}...`}
          </div>
          <p className={`text-xs max-w-lg mx-auto ${textMuted}`}>
            {isEn
              ? 'Querying authorized switches via live SSH CLI (MAC & reverse ARP tables) and correlating CDP/LLDP neighbor links...'
              : 'در حال استعلام زنده جدول MAC و ARP از سوئیچ‌های مجاز شبکه از طریق SSH و تحلیل همسایگی CDP/LLDP...'}
          </p>
        </div>
      )}

      {/* TAB 1: Switch Port & Access Edge Overview */}
      {!ram.loading && ram.data && tracker && ram.activeSubTab === 'overview' && (
        <div className="space-y-5">

          {/* Reason-Code Specific Diagnostic Banners */}
          {!edge && reasonCode && reasonCode !== 'found' && (
            <div
              className={`rounded-xl border p-5 flex items-start gap-3 ${
                reasonCode === 'uplink_only'
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-500'
              }`}
            >
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs leading-relaxed">
                <div className="font-bold text-sm">
                  {reasonCode === 'no_switches_in_inventory'
                    ? isEn
                      ? 'No Managed Switches Configured in Inventory'
                      : 'هیچ سوئیچی در تجهیزات شبکه ثبت نشده است'
                    : reasonCode === 'no_switches_in_rbac_scope'
                    ? isEn
                      ? 'No Switches Permitted in Your RBAC Policy Scope'
                      : 'هیچ سوئیچی در محدوده دسترسی RBAC شما مجاز نیست'
                    : reasonCode === 'all_switches_unreachable'
                    ? isEn
                      ? 'All Authorized Switches Were Unreachable Over SSH'
                      : 'امکان برقراری ارتباط SSH با سوئیچ‌های مجاز وجود نداشت'
                    : reasonCode === 'arp_unresolved'
                    ? isEn
                      ? 'MAC Address Could Not Be Resolved for This IP'
                      : 'آدرس MAC برای این IP در شبکه و جدول ARP یافت نشد'
                    : reasonCode === 'uplink_only'
                    ? isEn
                      ? 'MAC Observed Only on Uplink / Trunk Ports So Far'
                      : 'این مک آدرس فقط روی پورت‌های آپ‌لینک / ترانک دیده شد'
                    : isEn
                    ? 'MAC Address Not Found in Authorized Switch CAM Tables'
                    : 'مک آدرس موردنظر در جدول MAC سوئیچ‌های مجاز یافت نشد'}
                </div>
                <p className={textSecondary}>
                  {isEn ? tracker.edgeSummary.explanationEn : tracker.edgeSummary.explanationFa}
                </p>
              </div>
            </div>
          )}

          {/* Hero Connected Edge Port Card */}
          {edge && (
            <div className={`rounded-2xl border p-5 sm:p-6 space-y-5 ${surfaceBg}`}>
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center shrink-0">
                    <PlugZap className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-500">
                      {isEn ? 'Verified Physical Access Edge Port' : 'پورت فیزیکی متصل تاییدشده (Edge Port)'}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-lg font-extrabold font-mono ${textPrimary}`} dir="ltr">
                        {edge.switchName}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-emerald-600 text-white text-xs font-mono font-bold" dir="ltr">
                        {edge.port}
                      </span>
                      {edge.vlan && (
                        <span
                          className={`px-2 py-0.5 rounded-lg border text-xs font-mono font-semibold ${
                            isLightMode
                              ? 'bg-sky-50 border-sky-200 text-sky-800'
                              : 'bg-sky-500/15 border-sky-500/30 text-sky-300'
                          }`}
                          dir="ltr"
                        >
                          VLAN {edge.vlan}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(`${edge.switchName} (${edge.switchIp}) · Port ${edge.port} · VLAN ${edge.vlan || '-'}`, 'edge-badge')
                        }
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {copiedKey === 'edge-badge' ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{isEn ? 'Copy' : 'کپی'}</span>
                      </button>
                    </div>
                    <p className={`text-xs leading-relaxed ${textMuted}`}>
                      {isEn ? tracker.edgeSummary.explanationEn : tracker.edgeSummary.explanationFa}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0 text-xs">
                  <span
                    className={`px-2.5 py-1 rounded-lg border font-mono font-semibold ${
                      tracker.edgeSummary.confidence === 'high'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                        : 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                    }`}
                  >
                    {isEn ? 'Confidence:' : 'اطمینان:'}{' '}
                    {tracker.edgeSummary.confidence.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* 4 KPI Detail Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className={`rounded-xl border p-4 space-y-1 ${subSurfaceBg}`}>
                  <div className={`text-[11px] font-medium ${textMuted}`}>
                    {isEn ? 'Switch & Management IP' : 'سوئیچ و IP مدیریت'}
                  </div>
                  <div className={`text-sm font-bold font-mono truncate ${textPrimary}`} dir="ltr">
                    {edge.switchIp}
                  </div>
                  <div className={`text-[11px] ${textMuted}`}>
                    {edge.switchVendor} {edge.switchModel ? `· ${edge.switchModel}` : ''}
                  </div>
                </div>

                <div className={`rounded-xl border p-4 space-y-1 ${subSurfaceBg}`}>
                  <div className={`text-[11px] font-medium ${textMuted}`}>
                    {isEn ? 'Physical Port & Entry Type' : 'پورت فیزیکی و نوع ثبت'}
                  </div>
                  <div className={`text-sm font-bold font-mono text-emerald-500`} dir="ltr">
                    {edge.port}
                  </div>
                  <div className={`text-[11px] font-mono ${textMuted}`} dir="ltr">
                    VLAN {edge.vlan || '—'} · {edge.type || 'dynamic'}
                  </div>
                </div>

                <div className={`rounded-xl border p-4 space-y-1 ${subSurfaceBg}`}>
                  <div className={`text-[11px] font-medium ${textMuted}`}>
                    {isEn ? 'Resolved MAC & Vendor (OUI)' : 'آدرس MAC و سازنده کارت شبکه'}
                  </div>
                  <div className={`text-sm font-bold font-mono ${textPrimary}`} dir="ltr">
                    {tracker.resolvedMac || '—'}
                  </div>
                  <div className={`text-[11px] truncate ${textMuted}`}>
                    {tracker.vendor?.vendor || (isEn ? 'Unknown Vendor' : 'سازنده نامشخص')}
                  </div>
                </div>

                <div className={`rounded-xl border p-4 space-y-1 ${subSurfaceBg}`}>
                  <div className={`text-[11px] font-medium ${textMuted}`}>
                    {isEn ? 'Uplinks Filtered & Scope' : 'فیلتر آپ‌لینک و گستره اسکن'}
                  </div>
                  <div className={`text-sm font-bold font-mono ${textPrimary}`} dir="ltr">
                    {tracker.edgeSummary.totalSwitchesWithMac}{' '}
                    <span className={`text-xs font-normal ${textMuted}`}>
                      {isEn ? 'switches matched' : 'سوئیچ دارای رکورد'}
                    </span>
                  </div>
                  <div className={`text-[11px] ${textMuted}`}>
                    {isEn
                      ? `${tracker.edgeSummary.uplinksFilteredCount} trunk/uplink filtered`
                      : `${tracker.edgeSummary.uplinksFilteredCount} پورت آپ‌لینک فیلتر شد`}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Physical Network Path (Hop-by-Hop) */}
      {!ram.loading && ram.data && tracker && ram.activeSubTab === 'path' && (
        <div className={`rounded-xl border p-5 space-y-5 ${surfaceBg}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className={`text-sm font-bold flex items-center gap-2 ${textPrimary}`}>
                <Waypoints className="w-4 h-4 text-teal-500" />
                <span>
                  {isEn
                    ? 'End-to-End Physical Network Path (Core → Access Edge → Host)'
                    : 'مسیر فیزیکی شبکه گام‌به‌گام (هسته شبکه ← سوئیچ اکسس ← سیستم کاربر)'}
                </span>
              </h2>
              <p className={`text-xs mt-1 ${textMuted}`}>
                {isEn
                  ? 'Correlated from live switch MAC address tables (CAM) and CDP/LLDP neighbor links.'
                  : 'ترسیم‌شده بر اساس جدول MAC زنده سوئیچ‌ها و لینک‌های همسایگی CDP/LLDP.'}
              </p>
            </div>
            <span className={`text-xs font-mono ${textMuted}`} dir="ltr">
              {tracker.traceStrategyUsed === 'full_parallel' ? 'Full Parallel' : 'Fast Hop-by-Hop'} ·{' '}
              {hops.length} {isEn ? 'hops' : 'گام'}
            </span>
          </div>

          {hops.length === 0 ? (
            <div className={`rounded-xl border p-8 text-center text-xs ${subSurfaceBg} ${textMuted}`}>
              {isEn
                ? 'No switch hops were observed for this MAC/IP inside your permitted switch scope.'
                : 'هیچ گامی از مسیر برای این MAC/IP در سوئیچ‌های مجاز یافت نشد.'}
            </div>
          ) : (
            <div className="space-y-3">
              {hops.map((hop, idx) => (
                <div key={`${hop.switchId}-${hop.port}-${idx}`} className="space-y-2">
                  <div
                    className={`rounded-xl border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${
                      hop.isEdge
                        ? isLightMode
                          ? 'bg-emerald-50/70 border-emerald-300'
                          : 'bg-emerald-500/10 border-emerald-500/40'
                        : subSurfaceBg
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold font-mono shrink-0 ${
                          hop.isEdge
                            ? 'bg-emerald-600 text-white'
                            : 'bg-sky-600/20 text-sky-500 border border-sky-500/30'
                        }`}
                      >
                        {hop.hopNumber}
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-sm font-bold font-mono ${textPrimary}`} dir="ltr">
                            {hop.switchName}
                          </span>
                          <span className={`text-xs font-mono ${textMuted}`} dir="ltr">
                            ({hop.switchIp})
                          </span>
                          {hop.switchRole && (
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase ${
                                isLightMode
                                  ? 'bg-slate-200 text-slate-700'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {hop.switchRole}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              hop.isEdge
                                ? 'bg-emerald-600 text-white'
                                : 'bg-amber-500/15 text-amber-500'
                            }`}
                          >
                            {hop.isEdge
                              ? isEn
                                ? 'Access Edge Port'
                                : 'پورت اکسس نهایی'
                              : isEn
                              ? 'Uplink / Transit'
                              : 'لینک میانی (Uplink)'}
                          </span>
                        </div>
                        <div className={`text-xs font-mono flex flex-wrap items-center gap-3 ${textSecondary}`} dir="ltr">
                          <span>Port: {hop.port}</span>
                          <span>VLAN: {hop.vlan || '—'}</span>
                          {hop.peerDeviceName && (
                            <span className="text-sky-500">
                              Neighbor: {hop.peerDeviceName}
                              {hop.peerPort ? ` (${hop.peerPort})` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {ram.data?.rbac.canInspectMatchedSwitchPorts && onInspectSwitchPorts && (
                        <button
                          type="button"
                          onClick={() => onInspectSwitchPorts(hop.switchId)}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                            isLightMode
                              ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                              : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                          }`}
                        >
                          {isEn ? 'View Ports' : 'پورت‌ها'}
                        </button>
                      )}
                      {ram.data?.rbac.canOpenMatchedSwitchTerminal && onConnectSwitchTerminal && (
                        <button
                          type="button"
                          onClick={() => onConnectSwitchTerminal(hop.switchId, hop.port)}
                          className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold cursor-pointer"
                        >
                          SSH
                        </button>
                      )}
                    </div>
                  </div>

                  {idx < hops.length - 1 && (
                    <div className="flex justify-center">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-mono ${textMuted}`}>
                        {isEn ? <ArrowRight className="w-3.5 h-3.5 rotate-90" /> : <ArrowLeft className="w-3.5 h-3.5 -rotate-90" />}
                        <span>{hops[idx + 1]?.switchName}</span>
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {/* Final Endpoint Target Leaf */}
              {edge && (
                <div className="flex justify-center pt-1">
                  <div
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-mono font-semibold ${
                      isLightMode
                        ? 'bg-teal-50 border-teal-200 text-teal-800'
                        : 'bg-teal-500/10 border-teal-500/30 text-teal-300'
                    }`}
                    dir="ltr"
                  >
                    <Monitor className="w-4 h-4" />
                    <span>
                      Target: {ram.data.endpointHostname || tracker.resolvedIp || ram.data.targetQuery}{' '}
                      ({tracker.resolvedMac || '—'})
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {tracker.pathDiagram && (
            <div className={`rounded-xl border p-3.5 ${subSurfaceBg}`}>
              <div className={`text-[11px] font-semibold mb-1.5 ${textMuted}`}>
                {isEn ? 'CLI Trace Path Summary:' : 'خلاصه متنی مسیر شبکه:'}
              </div>
              <pre
                dir="ltr"
                className={`text-xs font-mono whitespace-pre-wrap break-all ${textPrimary}`}
              >
                {tracker.pathDiagram}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Switch CAM & L3 ARP Tables + Unreachable Diagnostics */}
      {!ram.loading && ram.data && tracker && ram.activeSubTab === 'cam_arp' && (
        <div className="space-y-5">
          {/* CAM Table Card */}
          <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className={`text-sm font-bold flex items-center gap-2 ${textPrimary}`}>
                  <Layers className="w-4 h-4 text-teal-500" />
                  <span>
                    {isEn
                      ? `Observed Switch CAM / MAC Entries (${camEntries.length})`
                      : `رکوردهای جدول MAC سوئیچ‌ها (CAM Table: ${camEntries.length})`}
                  </span>
                </h2>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {isEn
                    ? 'Every switch port where this MAC address appeared, classified automatically into Access Edge vs Uplink/Trunk.'
                    : 'تمامی پورت‌هایی که مک آدرس موردنظر در جدول سوئیچ‌های مجاز روی آن‌ها دیده شده است.'}
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-3 ${textMuted}`} />
                <input
                  type="text"
                  value={camSearch}
                  onChange={(e) => setCamSearch(e.target.value)}
                  placeholder={isEn ? 'Filter switch, port, VLAN...' : 'فیلتر سوئیچ، پورت، VLAN...'}
                  className={`w-full ps-9 pe-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[780px] text-xs border-collapse">
                <thead className={isLightMode ? 'bg-slate-50 text-slate-600' : 'bg-slate-950 text-slate-400'}>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Switch' : 'سوئیچ'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Port' : 'پورت'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">VLAN</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Classification' : 'نوع پورت'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Neighbor / Reason' : 'همسایگی / توضیح'}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                  {filteredCamEntries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={`py-8 text-center ${textMuted}`}>
                        {isEn ? 'No CAM table entries observed.' : 'رکوردی در جدول MAC یافت نشد.'}
                      </td>
                    </tr>
                  ) : (
                    filteredCamEntries.map((c, idx) => (
                      <tr
                        key={`${c.switchId}-${c.port}-${idx}`}
                        className={isLightMode ? 'hover:bg-slate-50/80' : 'hover:bg-slate-800/40'}
                      >
                        <td className="py-2.5 px-3">
                          <div className={`font-semibold ${textPrimary}`} dir="ltr">
                            {c.switchName}
                          </div>
                          <div className={`text-[11px] font-mono ${textMuted}`} dir="ltr">
                            {c.switchIp} · {c.switchVendor}
                          </div>
                        </td>
                        <td className={`py-2.5 px-3 font-mono font-bold ${textPrimary}`} dir="ltr">
                          {c.port}
                        </td>
                        <td className={`py-2.5 px-3 font-mono ${textSecondary}`} dir="ltr">
                          {c.vlan || '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          {c.isFinalEdgePort ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 font-semibold text-[11px]">
                              {isEn ? 'Final Edge Port' : 'پورت اکسس نهایی'}
                            </span>
                          ) : c.isUplink ? (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/30 font-semibold text-[11px]">
                              {isEn ? 'Uplink / Trunk' : 'آپ‌لینک / ترانک'}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-500 border border-sky-500/30 font-semibold text-[11px]">
                              {isEn ? 'Observed Port' : 'مشاهده‌شده'}
                            </span>
                          )}
                        </td>
                        <td className={`py-2.5 px-3 text-[11px] ${textMuted}`}>
                          {c.peerDeviceName ? (
                            <span className="font-mono text-sky-500" dir="ltr">
                              CDP/LLDP: {c.peerDeviceName}
                              {c.peerPort ? ` [${c.peerPort}]` : ''}
                            </span>
                          ) : (
                            c.uplinkReason || '—'
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* L3 ARP Entries Card */}
          <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className={`text-sm font-bold flex items-center gap-2 ${textPrimary}`}>
                  <Network className="w-4 h-4 text-sky-500" />
                  <span>
                    {isEn
                      ? `Observed L3 ARP Table Matches (${arpEntries.length})`
                      : `رکوردهای جدول ARP لایه ۳ (${arpEntries.length})`}
                  </span>
                </h2>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-3 ${textMuted}`} />
                <input
                  type="text"
                  value={arpSearch}
                  onChange={(e) => setArpSearch(e.target.value)}
                  placeholder={isEn ? 'Filter router, IP, MAC...' : 'فیلتر روتر، IP، مک...'}
                  className={`w-full ps-9 pe-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[740px] text-xs border-collapse">
                <thead className={isLightMode ? 'bg-slate-50 text-slate-600' : 'bg-slate-950 text-slate-400'}>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'L3 Device' : 'تجهیز لایه ۳'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">IP</th>
                    <th className="py-2.5 px-3 text-start font-semibold">MAC</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Interface / VLAN' : 'اینترفیس / VLAN'}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                  {filteredArpEntries.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={`py-8 text-center ${textMuted}`}>
                        {isEn ? 'No L3 ARP matches recorded for this trace.' : 'رکورد ARP ای برای این جستجو یافت نشد.'}
                      </td>
                    </tr>
                  ) : (
                    filteredArpEntries.map((a, idx) => (
                      <tr
                        key={`${a.switchId}-${a.ip}-${a.mac}-${idx}`}
                        className={isLightMode ? 'hover:bg-slate-50/80' : 'hover:bg-slate-800/40'}
                      >
                        <td className="py-2.5 px-3">
                          <div className={`font-semibold ${textPrimary}`} dir="ltr">{a.switchName}</div>
                          <div className={`text-[11px] font-mono ${textMuted}`} dir="ltr">{a.switchIp}</div>
                        </td>
                        <td className={`py-2.5 px-3 font-mono ${textPrimary}`} dir="ltr">{a.ip}</td>
                        <td className={`py-2.5 px-3 font-mono ${textPrimary}`} dir="ltr">{a.mac}</td>
                        <td className={`py-2.5 px-3 font-mono ${textSecondary}`} dir="ltr">
                          {a.interface} {a.vlan ? `· VLAN ${a.vlan}` : ''}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Unreachable Switches Diagnostics */}
          {unreachable.length > 0 && (
            <div className={`rounded-xl border p-4 space-y-3 ${surfaceBg}`}>
              <button
                type="button"
                onClick={() => setShowUnreachable((p) => !p)}
                className="w-full flex items-center justify-between text-xs font-bold cursor-pointer"
              >
                <span className="flex items-center gap-2 text-amber-500">
                  <AlertTriangle className="w-4 h-4" />
                  <span>
                    {isEn
                      ? `Unreachable Switches During Scan (${unreachable.length})`
                      : `سوئیچ‌های غیرقابل دسترس در این اسکن (${unreachable.length})`}
                  </span>
                </span>
                <span className={textMuted}>
                  {showUnreachable ? (isEn ? 'Hide' : 'بستن') : isEn ? 'Show Details' : 'مشاهده جزئیات'}
                </span>
              </button>
              {showUnreachable && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                  {unreachable.map((sw) => (
                    <div key={sw.switchId} className={`rounded-lg border p-3 text-xs space-y-1 ${subSurfaceBg}`}>
                      <div className={`font-bold font-mono ${textPrimary}`} dir="ltr">
                        {sw.switchName} ({sw.switchIp})
                      </div>
                      <div className="text-[11px] text-rose-500 break-words">{sw.error}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Lookup History (PostgreSQL-backed, matching HelpDeskUsersView) */}
      {ram.activeSubTab === 'history' && (
        <div className="space-y-4">
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                label: isEn ? 'Total Recorded Lookups' : 'کل ردیابی‌های ثبت‌شده',
                value: historyStats?.totalLookups ?? historyTotal,
                accent: 'text-sky-500',
              },
              {
                label: isEn ? 'Unique IP / MAC Targets' : 'اهداف یکتای بررسی‌شده',
                value: historyStats?.uniqueTargets ?? 0,
                accent: 'text-indigo-500',
              },
              {
                label: isEn ? 'Edge Ports Located' : 'پورت‌های کشف‌شده',
                value: historyStats?.foundCount ?? 0,
                accent: 'text-emerald-500',
              },
              {
                label: isEn ? 'Not Found / Failed' : 'یافت‌نشده / ناموفق',
                value: `${historyStats?.notFoundCount ?? 0} / ${historyStats?.failedCount ?? 0}`,
                accent: 'text-rose-500',
              },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-xl border p-4 ${surfaceBg}`}>
                <div className={`text-[11px] font-medium ${textMuted}`}>{stat.label}</div>
                <div className={`mt-1 text-2xl font-bold font-mono tabular-nums ${stat.accent}`}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn
                      ? 'Switch Port & Network Path Lookup History'
                      : 'تاریخچه ردیابی پورت سوئیچ و مسیر شبکه'}
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${
                      historyScope === 'all'
                        ? isLightMode
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                          : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                        : isLightMode
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    }`}
                  >
                    {historyScope === 'all'
                      ? isEn
                        ? 'All Operators — Full Access'
                        : 'همه اپراتورها (دسترسی کامل)'
                      : isEn
                      ? 'Your Lookups Only'
                      : 'فقط ردیابی‌های شخصی شما'}
                  </span>
                </div>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {historyScope === 'all'
                    ? isEn
                      ? 'Displays all operators’ IP/MAC switch port traces with matched ports, VLANs, and 1-click re-locate.'
                      : 'نمایش تمامی ردیابی‌های انجام‌شده توسط همه کارشناسان همراه با پورت سوئیچ کشف‌شده و ردیابی مجدد فوری.'
                    : isEn
                    ? 'Scoped to switch port lookups you ran yourself — other operators’ lookups remain hidden unless full history permission is granted.'
                    : 'محدود به ردیابی‌هایی که خودتان انجام داده‌اید (نمایش کل سوابق نیازمند مجوز مشاهده همه تاریخچه است).'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadLocatorHistory()}
                  disabled={loadingHistory}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                    isLightMode
                      ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                      : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-sky-500 ${loadingHistory ? 'animate-spin' : ''}`} />
                  <span>{isEn ? 'Refresh' : 'بروزرسانی'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportHistoryCsv}
                  disabled={historyItems.length === 0}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer disabled:opacity-40 ${
                    isLightMode
                      ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                      : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                >
                  <Download className="w-3.5 h-3.5 text-teal-500" />
                  <span>{isEn ? 'Export CSV' : 'خروجی CSV'}</span>
                </button>

                {confirmClearHistory ? (
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busyHistoryId !== null}
                      onClick={handleClearAllHistory}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {busyHistoryId === 'ALL' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isEn ? (
                        'Confirm Clear All'
                      ) : (
                        'تأیید پاک‌سازی تاریخچه'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearHistory(false)}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-700'
                          : 'bg-slate-800 border-slate-700 text-slate-200'
                      }`}
                    >
                      {isEn ? 'Cancel' : 'انصراف'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={(historyStats?.totalLookups ?? historyTotal) === 0 || busyHistoryId !== null}
                    onClick={() => setConfirmClearHistory(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-semibold transition cursor-pointer disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Clear History' : 'پاک‌سازی تاریخچه'}</span>
                  </button>
                )}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setHistoryPage(1);
                setHistorySearch(historySearchInput.trim());
                loadLocatorHistory({ page: 1, search: historySearchInput.trim() });
              }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center"
            >
              <div className="lg:col-span-5 relative">
                <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-3 ${textMuted}`} />
                <input
                  type="text"
                  value={historySearchInput}
                  onChange={(e) => setHistorySearchInput(e.target.value)}
                  placeholder={
                    isEn
                      ? 'Search IP, MAC, switch name, port, VLAN or operator...'
                      : 'جستجو بر اساس IP، MAC، سوئیچ، پورت، VLAN یا اپراتور...'
                  }
                  className={`w-full ps-9 pe-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                />
              </div>

              <div className="lg:col-span-2">
                <select
                  value={historyStatusFilter}
                  onChange={(e) => {
                    const next = e.target.value as 'all' | 'success' | 'not_found' | 'failed';
                    setHistoryStatusFilter(next);
                    setHistoryPage(1);
                    loadLocatorHistory({ page: 1, status: next });
                  }}
                  className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="all">{isEn ? 'All Statuses' : 'همه وضعیت‌ها'}</option>
                  <option value="success">{isEn ? 'Port Located' : 'کشف‌شده'}</option>
                  <option value="not_found">{isEn ? 'Not Found' : 'یافت نشد'}</option>
                  <option value="failed">{isEn ? 'Failed' : 'ناموفق'}</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <select
                  value={historyTypeFilter}
                  onChange={(e) => {
                    const next = e.target.value as 'all' | 'ipv4' | 'mac';
                    setHistoryTypeFilter(next);
                    setHistoryPage(1);
                    loadLocatorHistory({ page: 1, queryType: next });
                  }}
                  className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="all">{isEn ? 'All Input Types' : 'همه نوع ورودی'}</option>
                  <option value="ipv4">IPv4</option>
                  <option value="mac">MAC</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <select
                  value={historyPageSize}
                  onChange={(e) => {
                    const nextSize = Number(e.target.value) || 15;
                    setHistoryPageSize(nextSize);
                    setHistoryPage(1);
                    loadLocatorHistory({ page: 1, pageSize: nextSize });
                  }}
                  className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value={10}>10 {isEn ? 'per page' : 'ردیف'}</option>
                  <option value={15}>15 {isEn ? 'per page' : 'ردیف'}</option>
                  <option value={25}>25 {isEn ? 'per page' : 'ردیف'}</option>
                  <option value={50}>50 {isEn ? 'per page' : 'ردیف'}</option>
                </select>
              </div>

              <div className="lg:col-span-1">
                <button
                  type="submit"
                  className="w-full py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer transition"
                >
                  {isEn ? 'Search' : 'جستجو'}
                </button>
              </div>
            </form>

            {historyNotice && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                  historyNotice.ok
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                }`}
              >
                <span className="font-semibold">{historyNotice.text}</span>
                <button type="button" onClick={() => setHistoryNotice(null)} className="cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {historyError && (
              <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-xs text-rose-500 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{historyError}</span>
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[920px] text-xs border-collapse">
                <thead className={isLightMode ? 'bg-slate-50 text-slate-600' : 'bg-slate-950 text-slate-400'}>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Date & Type' : 'تاریخ و نوع'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Target Input' : 'ورودی هدف'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Resolved IP / MAC' : 'IP و MAC کشف‌شده'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Matched Switch & Port' : 'سوئیچ و پورت اکسس'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Scan & Operator' : 'اسکن و اپراتور'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Status' : 'وضعیت'}</th>
                    <th className="py-2.5 px-3 text-end font-semibold">{isEn ? 'Actions' : 'عملیات'}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                  {loadingHistory && historyItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={`py-8 text-center ${textMuted}`}>
                        <Loader2 className="w-5 h-5 mx-auto animate-spin text-sky-500 mb-2" />
                        <span>{isEn ? 'Loading lookup history...' : 'در حال بارگذاری تاریخچه ردیابی...'}</span>
                      </td>
                    </tr>
                  ) : historyItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={`py-10 text-center ${textMuted}`}>
                        <Clock className="w-7 h-7 mx-auto opacity-50 mb-2" />
                        <div>
                          {isEn
                            ? 'No switch locator history records match your filter.'
                            : 'هیچ سابقه ردیابی با این فیلتر یافت نشد.'}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    historyItems.map((item) => {
                      const isSuccess = item.status === 'success';
                      const isNotFound = item.status === 'not_found';
                      return (
                        <tr
                          key={item.id}
                          className={isLightMode ? 'hover:bg-slate-50/80' : 'hover:bg-slate-800/40'}
                        >
                          <td className={`py-2.5 px-3 font-mono tabular-nums whitespace-nowrap ${textMuted}`}>
                            {formatDateDisplay(item.checkedAt, isEn)}
                            <div className="mt-0.5 text-[10px]">
                              <span
                                className={`px-1.5 py-0.2 rounded font-semibold uppercase ${
                                  item.queryType === 'mac'
                                    ? 'bg-teal-500/15 text-teal-500'
                                    : 'bg-sky-500/15 text-sky-500'
                                }`}
                              >
                                {item.queryType}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className={`font-semibold font-mono text-xs ${textPrimary}`} dir="ltr">
                              {item.targetQuery}
                            </div>
                            {item.endpointHostname && (
                              <div className={`text-[11px] font-mono ${textMuted}`} dir="ltr">
                                {item.endpointHostname}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className={`font-mono text-[11px] ${textPrimary}`} dir="ltr">
                              {item.resolvedMac || '—'}
                            </div>
                            <div className={`font-mono text-[11px] ${textMuted}`} dir="ltr">
                              {item.resolvedIp || '—'}
                              {item.vendorName ? ` · ${item.vendorName}` : ''}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            {item.matchedSwitchName ? (
                              <>
                                <div className={`font-semibold font-mono ${textPrimary}`} dir="ltr">
                                  {item.matchedSwitchName}{' '}
                                  <span className="text-emerald-500">[{item.matchedPort || '—'}]</span>
                                </div>
                                <div className={`text-[11px] font-mono ${textMuted}`} dir="ltr">
                                  {item.matchedSwitchIp}
                                  {item.vlan ? ` · VLAN ${item.vlan}` : ''}
                                </div>
                              </>
                            ) : (
                              <span className={textMuted}>—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className={`font-mono text-[11px] ${textPrimary}`} dir="ltr">
                              {item.switchesActiveCount}/{item.switchesScannedCount} sw · {item.durationMs}ms
                            </div>
                            <div className={`text-[10px] ${textMuted}`}>
                              {isEn ? 'By' : 'توسط'}: {item.actorName || '—'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              title={item.errorMessage || item.reasonCode || undefined}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border whitespace-nowrap ${
                                isSuccess
                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                                  : isNotFound
                                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                                  : 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                              }`}
                            >
                              {isSuccess ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : isNotFound ? (
                                <AlertTriangle className="w-3 h-3" />
                              ) : (
                                <AlertCircle className="w-3 h-3" />
                              )}
                              <span>
                                {isSuccess
                                  ? isEn
                                    ? 'Located'
                                    : 'پیدا شد'
                                  : isNotFound
                                  ? isEn
                                    ? 'Not Found'
                                    : 'یافت نشد'
                                  : isEn
                                  ? 'Failed'
                                  : 'ناموفق'}
                              </span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-end whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {(() => {
                                const canRelocateMac =
                                  detectClientQueryKind(item.resolvedMac || '') === 'mac' ||
                                  detectClientQueryKind(item.targetQuery || '') === 'mac';
                                return (
                                  <button
                                    type="button"
                                    disabled={!canAccessLocator || ram.loading || !canRelocateMac}
                                    onClick={() => void handleRelocateFromHistory(item)}
                                    title={
                                      !canRelocateMac
                                        ? isEn
                                          ? 'No MAC address recorded for this legacy entry'
                                          : 'مک آدرسی برای این رکورد قدیمی ثبت نشده است'
                                        : undefined
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-[11px] font-semibold transition cursor-pointer"
                                  >
                                    <Search className="w-3 h-3" />
                                    <span>{isEn ? 'Re-Locate' : 'ردیابی مجدد'}</span>
                                  </button>
                                );
                              })()}
                              <button
                                type="button"
                                disabled={busyHistoryId !== null}
                                onClick={() => void handleDeleteHistoryItem(item.id)}
                                title={isEn ? 'Delete record' : 'حذف ردیف'}
                                className="p-1.5 rounded-md border border-rose-500/30 hover:bg-rose-500/10 text-rose-500 transition cursor-pointer disabled:opacity-40"
                              >
                                {busyHistoryId === item.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {historyTotal > 0 && (() => {
              const totalHistPages = Math.max(1, Math.ceil(historyTotal / historyPageSize));
              const startIdx = (historyPage - 1) * historyPageSize + 1;
              const endIdx = Math.min(historyPage * historyPageSize, historyTotal);
              return (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                  <div className={textMuted}>
                    {isEn
                      ? `Showing ${startIdx}–${endIdx} of ${historyTotal} lookups`
                      : `نمایش ${startIdx} تا ${endIdx} از ${historyTotal} ردیابی`}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={historyPage <= 1 || loadingHistory}
                      onClick={() => {
                        const p = Math.max(1, historyPage - 1);
                        setHistoryPage(p);
                        loadLocatorHistory({ page: p });
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold disabled:opacity-40 cursor-pointer ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                          : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {isEn ? 'Previous' : 'قبلی'}
                    </button>
                    <span className={`px-2 font-mono text-[11px] ${textSecondary}`}>
                      {historyPage} / {totalHistPages}
                    </span>
                    <button
                      type="button"
                      disabled={historyPage >= totalHistPages || loadingHistory}
                      onClick={() => {
                        const p = Math.min(totalHistPages, historyPage + 1);
                        setHistoryPage(p);
                        loadLocatorHistory({ page: p });
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold disabled:opacity-40 cursor-pointer ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                          : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {isEn ? 'Next' : 'بعدی'}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
