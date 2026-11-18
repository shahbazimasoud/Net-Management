import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Eye,
  Filter,
  Globe,
  KeyRound,
  Laptop,
  Lock,
  LogIn,
  LogOut,
  Monitor,
  Network,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
  Terminal,
  User,
  UserCheck,
  Users,
  X,
  XCircle,
  Calendar,
} from 'lucide-react';
import {
  LoginAuditAuthMethod,
  LoginAuditOutcome,
  UserLoginAuditEvent,
  UserLoginAuditSummary,
  UserLoginReportsResponse,
} from '../../types';
import {
  getCommsUserPresenceMeta,
  resolvePresenceFromState,
  useCommsPresenceMap,
} from '../../services/commsPresence';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface UserLoginReportsSectionProps {
  isLightMode?: boolean;
  isEn?: boolean;
  isRtl?: boolean;
  loginReports: UserLoginReportsResponse | null;
  isLoading?: boolean;
  loadError?: string | null;
  selectedTimeframe: 'all' | '1h' | '24h' | '7d' | '30d';
  isWithinTimeframe: (iso: string) => boolean;
  formatDateTime: (iso: string) => string;
  formatDateOnly: (iso: string) => string;
  onRefresh: () => void;
  onExportCsv: (events: UserLoginAuditEvent[]) => void;
}

type LoginViewMode = 'user_summary' | 'timeline';

export const UserLoginReportsSection: React.FC<UserLoginReportsSectionProps> = ({
  isLightMode = false,
  isEn = false,
  isRtl = false,
  loginReports,
  isLoading = false,
  loadError = null,
  selectedTimeframe,
  isWithinTimeframe,
  formatDateTime,
  formatDateOnly,
  onRefresh,
  onExportCsv,
}) => {
  const presenceState = useCommsPresenceMap();

  const [viewMode, setViewMode] = useState<LoginViewMode>('user_summary');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState<string>('all');
  const [selectedAuthMethod, setSelectedAuthMethod] = useState<string>('all');
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('all');
  const [activeUsername, setActiveUsername] = useState<string>('');

  // Pagination for timeline
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Inspection modal state (Rule 7 compliant)
  const [inspectedEvent, setInspectedEvent] = useState<UserLoginAuditEvent | null>(null);
  const [isModalMaximized, setIsModalMaximized] = useState(false);
  const [isModalMinimized, setIsModalMinimized] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const rawEvents = useMemo(() => loginReports?.events || [], [loginReports]);

  // Distinct usernames for filter dropdown
  const availableUsers = useMemo(() => {
    const set = new Set<string>();
    rawEvents.forEach((ev) => {
      if (ev.username) set.add(ev.username);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawEvents]);

  // Apply client-side filters in real-time cleanly (respecting timeframe, outcome, authMethod, user, search)
  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rawEvents.filter((ev) => {
      if (!isWithinTimeframe(ev.timestamp)) return false;
      if (selectedUserFilter !== 'all' && ev.username.toLowerCase() !== selectedUserFilter.toLowerCase()) {
        return false;
      }
      if (selectedOutcome !== 'all') {
        if (selectedOutcome === 'failed_or_blocked') {
          if (ev.outcome !== 'login_failed' && ev.outcome !== 'login_blocked') return false;
        } else if (ev.outcome !== selectedOutcome) {
          return false;
        }
      }
      if (selectedAuthMethod !== 'all' && ev.authMethod !== selectedAuthMethod) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        ev.username,
        ev.fullName,
        ev.role,
        ev.ipAddress,
        ev.browserLabel,
        ev.browserName,
        ev.osLabel,
        ev.osName,
        ev.action,
        ev.details,
        ev.rawUserAgent,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rawEvents, searchQuery, selectedOutcome, selectedAuthMethod, selectedUserFilter, selectedTimeframe, isWithinTimeframe]);

  // Re-aggregate filtered user summaries from filteredEvents so counts & IPs & browsers reflect active filters truthfully
  const userSummaries = useMemo<UserLoginAuditSummary[]>(() => {
    const map = new Map<
      string,
      {
        username: string;
        fullName: string;
        role: string;
        userType: 'local' | 'ad' | 'unknown';
        totalLogins: number;
        failedAttempts: number;
        blockedAttempts: number;
        twoFactorChallenges: number;
        trustedBypassCount: number;
        logoutCount: number;
        totalEvents: number;
        firstLoginAt: string | null;
        lastLoginAt: string | null;
        lastEventAt: string;
        lastFailedAt: string | null;
        lastIp: string;
        lastBrowser: string;
        lastOs: string;
        lastDeviceType: string;
        lastUserAgent: string;
        lastAuthMethod: LoginAuditAuthMethod;
        lastOutcome: LoginAuditOutcome;
        lastAction: string;
        ipMap: Map<string, { ip: string; count: number; successCount: number; failedCount: number; lastSeenAt: string }>;
        browserMap: Map<string, { label: string; browserName: string; osLabel: string; deviceType: string; count: number; lastSeenAt: string }>;
        authMethodsSet: Set<LoginAuditAuthMethod>;
        events: UserLoginAuditEvent[];
      }
    >();

    for (const ev of filteredEvents) {
      const key = ev.username.toLowerCase();
      let entry = map.get(key);
      if (!entry) {
        entry = {
          username: ev.username,
          fullName: ev.fullName || ev.username,
          role: ev.role,
          userType: ev.userType,
          totalLogins: 0,
          failedAttempts: 0,
          blockedAttempts: 0,
          twoFactorChallenges: 0,
          trustedBypassCount: 0,
          logoutCount: 0,
          totalEvents: 0,
          firstLoginAt: null,
          lastLoginAt: null,
          lastEventAt: ev.timestamp,
          lastFailedAt: null,
          lastIp: ev.ipAddress,
          lastBrowser: ev.browserLabel,
          lastOs: ev.osLabel,
          lastDeviceType: ev.deviceType,
          lastUserAgent: ev.rawUserAgent,
          lastAuthMethod: ev.authMethod,
          lastOutcome: ev.outcome,
          lastAction: ev.action,
          ipMap: new Map(),
          browserMap: new Map(),
          authMethodsSet: new Set(),
          events: [],
        };
        map.set(key, entry);
      }

      entry.events.push(ev);
      entry.totalEvents += 1;
      entry.authMethodsSet.add(ev.authMethod);

      const evMs = new Date(ev.timestamp).getTime();
      if (evMs > new Date(entry.lastEventAt).getTime()) {
        entry.lastEventAt = ev.timestamp;
        entry.lastIp = ev.ipAddress;
        entry.lastBrowser = ev.browserLabel;
        entry.lastOs = ev.osLabel;
        entry.lastDeviceType = ev.deviceType;
        entry.lastUserAgent = ev.rawUserAgent;
        entry.lastAuthMethod = ev.authMethod;
        entry.lastOutcome = ev.outcome;
        entry.lastAction = ev.action;
      }

      if (ev.outcome === 'login_success') {
        entry.totalLogins += 1;
        if (ev.trustedBypass) entry.trustedBypassCount += 1;
        if (!entry.lastLoginAt || evMs > new Date(entry.lastLoginAt).getTime()) {
          entry.lastLoginAt = ev.timestamp;
          entry.lastIp = ev.ipAddress;
          entry.lastBrowser = ev.browserLabel;
          entry.lastOs = ev.osLabel;
          entry.lastDeviceType = ev.deviceType;
          entry.lastUserAgent = ev.rawUserAgent;
        }
        if (!entry.firstLoginAt || evMs < new Date(entry.firstLoginAt).getTime()) {
          entry.firstLoginAt = ev.timestamp;
        }
      } else if (ev.outcome === 'login_failed') {
        entry.failedAttempts += 1;
        if (!entry.lastFailedAt || evMs > new Date(entry.lastFailedAt).getTime()) {
          entry.lastFailedAt = ev.timestamp;
        }
      } else if (ev.outcome === 'login_blocked') {
        entry.blockedAttempts += 1;
        if (!entry.lastFailedAt || evMs > new Date(entry.lastFailedAt).getTime()) {
          entry.lastFailedAt = ev.timestamp;
        }
      } else if (ev.outcome === '2fa_challenge') {
        entry.twoFactorChallenges += 1;
      } else if (ev.outcome === 'logout') {
        entry.logoutCount += 1;
      }

      const ipKey = ev.ipAddress || 'Unknown';
      let ipObj = entry.ipMap.get(ipKey);
      if (!ipObj) {
        ipObj = { ip: ipKey, count: 0, successCount: 0, failedCount: 0, lastSeenAt: ev.timestamp };
        entry.ipMap.set(ipKey, ipObj);
      }
      ipObj.count += 1;
      if (ev.outcome === 'login_success') ipObj.successCount += 1;
      if (ev.outcome === 'login_failed' || ev.outcome === 'login_blocked') ipObj.failedCount += 1;
      if (evMs > new Date(ipObj.lastSeenAt).getTime()) ipObj.lastSeenAt = ev.timestamp;

      const bKey = `${ev.browserLabel} | ${ev.osLabel}`;
      let bObj = entry.browserMap.get(bKey);
      if (!bObj) {
        bObj = {
          label: ev.browserLabel,
          browserName: ev.browserName,
          osLabel: ev.osLabel,
          deviceType: ev.deviceType,
          count: 0,
          lastSeenAt: ev.timestamp,
        };
        entry.browserMap.set(bKey, bObj);
      }
      bObj.count += 1;
      if (evMs > new Date(bObj.lastSeenAt).getTime()) bObj.lastSeenAt = ev.timestamp;
    }

    return Array.from(map.values())
      .map((u) => ({
        username: u.username,
        fullName: u.fullName,
        role: u.role,
        userType: u.userType,
        accountStatus: 'active',
        totalLogins: u.totalLogins,
        failedAttempts: u.failedAttempts,
        blockedAttempts: u.blockedAttempts,
        twoFactorChallenges: u.twoFactorChallenges,
        trustedBypassCount: u.trustedBypassCount,
        logoutCount: u.logoutCount,
        totalEvents: u.totalEvents,
        firstLoginAt: u.firstLoginAt,
        lastLoginAt: u.lastLoginAt,
        lastEventAt: u.lastEventAt,
        lastFailedAt: u.lastFailedAt,
        lastIp: u.lastIp,
        lastBrowser: u.lastBrowser,
        lastOs: u.lastOs,
        lastDeviceType: u.lastDeviceType,
        lastUserAgent: u.lastUserAgent,
        lastAuthMethod: u.lastAuthMethod,
        lastOutcome: u.lastOutcome,
        lastAction: u.lastAction,
        ips: Array.from(u.ipMap.values()).sort(
          (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
        ),
        browsers: Array.from(u.browserMap.values()).sort(
          (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
        ),
        authMethods: Array.from(u.authMethodsSet),
      }))
      .sort((a, b) => {
        const aTime = new Date(a.lastLoginAt || a.lastEventAt).getTime();
        const bTime = new Date(b.lastLoginAt || b.lastEventAt).getTime();
        return bTime - aTime;
      });
  }, [filteredEvents]);

  // Keep active selected user valid
  useEffect(() => {
    if (userSummaries.length > 0 && (!activeUsername || !userSummaries.some((u) => u.username === activeUsername))) {
      setActiveUsername(userSummaries[0].username);
    } else if (userSummaries.length === 0 && activeUsername) {
      setActiveUsername('');
    }
  }, [userSummaries, activeUsername]);

  // Reset timeline pagination on filter change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedOutcome, selectedAuthMethod, selectedUserFilter, selectedTimeframe, viewMode]);

  const activeUserSummary = useMemo(() => {
    if (!userSummaries.length) return null;
    return userSummaries.find((u) => u.username === activeUsername) || userSummaries[0];
  }, [userSummaries, activeUsername]);

  const activeUserEvents = useMemo(() => {
    if (!activeUserSummary) return [];
    return filteredEvents.filter(
      (ev) => ev.username.toLowerCase() === activeUserSummary.username.toLowerCase()
    );
  }, [filteredEvents, activeUserSummary]);

  // Pagination for timeline
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const paginatedEvents = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredEvents.slice(start, start + pageSize);
  }, [filteredEvents, page, pageSize]);

  // Derived KPI totals for active filter
  const kpiStats = useMemo(() => {
    const successfulLogins = filteredEvents.filter((e) => e.outcome === 'login_success').length;
    const failedOrBlocked = filteredEvents.filter(
      (e) => e.outcome === 'login_failed' || e.outcome === 'login_blocked'
    ).length;
    const uniqueLoggedInUsers = userSummaries.filter((u) => u.totalLogins > 0).length;
    const uniqueIps = new Set(
      filteredEvents.map((e) => e.ipAddress).filter((ip) => ip && ip !== 'Unknown')
    ).size;
    const uniqueBrowsers = new Set(
      filteredEvents.map((e) => e.browserLabel).filter((b) => b && b !== 'Unknown')
    ).size;

    return {
      successfulLogins,
      failedOrBlocked,
      uniqueLoggedInUsers,
      uniqueUsersTotal: userSummaries.length,
      uniqueIps,
      uniqueBrowsers,
    };
  }, [filteredEvents, userSummaries]);

  const formatExactDateAndTime = (iso?: string | null) => {
    if (!iso) return isEn ? 'Never' : 'ثبت نشده';
    try {
      const d = new Date(iso);
      return d.toLocaleString(isEn ? 'en-US' : 'fa-IR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const renderDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'mobile':
        return <Smartphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
      case 'tablet':
        return <Tablet className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
      case 'api_client':
        return <Terminal className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      default:
        return <Monitor className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    }
  };

  const getDeviceTypeLabel = (deviceType: string) => {
    if (deviceType === 'mobile') return isEn ? 'Mobile' : 'موبایل';
    if (deviceType === 'tablet') return isEn ? 'Tablet' : 'تبلت';
    if (deviceType === 'api_client') return isEn ? 'CLI / API Client' : 'کلاینت CLI / API';
    if (deviceType === 'desktop') return isEn ? 'Desktop' : 'دسکتاپ';
    return isEn ? 'Unknown' : 'نامشخص';
  };

  const getOutcomeBadge = (outcome: LoginAuditOutcome, trustedBypass?: boolean) => {
    switch (outcome) {
      case 'login_success':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${
              isLightMode
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
            }`}
          >
            <LogIn className="w-3 h-3" />
            <span>
              {trustedBypass
                ? isEn
                  ? 'Login (Trusted 2FA)'
                  : 'ورود موفق (دستگاه مورداعتماد)'
                : isEn
                ? 'Login Success'
                : 'ورود موفق'}
            </span>
          </span>
        );
      case 'login_failed':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${
              isLightMode
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
            }`}
          >
            <XCircle className="w-3 h-3" />
            <span>{isEn ? 'Failed Login' : 'ورود ناموفق'}</span>
          </span>
        );
      case 'login_blocked':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${
              isLightMode
                ? 'bg-amber-50 text-amber-800 border-amber-300'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
            }`}
          >
            <ShieldAlert className="w-3 h-3" />
            <span>{isEn ? 'Blocked' : 'مسدود شده'}</span>
          </span>
        );
      case '2fa_challenge':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${
              isLightMode
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
            }`}
          >
            <KeyRound className="w-3 h-3" />
            <span>{isEn ? '2FA Challenge' : 'درخواست کد ۲ مرحله‌ای'}</span>
          </span>
        );
      case 'logout':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
              isLightMode
                ? 'bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-slate-500/15 text-slate-300 border-slate-500/30'
            }`}
          >
            <LogOut className="w-3 h-3" />
            <span>{isEn ? 'Logout' : 'خروج از پنل'}</span>
          </span>
        );
    }
  };

  const getAuthMethodBadge = (method: LoginAuditAuthMethod) => {
    switch (method) {
      case 'ad':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
              isLightMode
                ? 'bg-sky-50 text-sky-700 border-sky-200'
                : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
            }`}
          >
            <Globe className="w-3 h-3" />
            <span>{isEn ? 'Active Directory' : 'اکتیو دایرکتوری'}</span>
          </span>
        );
      case '2fa':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
              isLightMode
                ? 'bg-purple-50 text-purple-700 border-purple-200'
                : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
            }`}
          >
            <ShieldCheck className="w-3 h-3" />
            <span>{isEn ? '2FA Verified' : 'تایید دو مرحله‌ای'}</span>
          </span>
        );
      case 'trusted_device':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
              isLightMode
                ? 'bg-teal-50 text-teal-700 border-teal-200'
                : 'bg-teal-500/15 text-teal-300 border-teal-500/30'
            }`}
          >
            <Laptop className="w-3 h-3" />
            <span>{isEn ? 'Trusted Device' : 'دستگاه مورداعتماد'}</span>
          </span>
        );
      default:
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${
              isLightMode
                ? 'bg-slate-100 text-slate-700 border-slate-200'
                : 'bg-white/5 text-slate-300 border-white/10'
            }`}
          >
            <Shield className="w-3 h-3" />
            <span>{isEn ? 'Local DB' : 'دیتابیس محلی'}</span>
          </span>
        );
    }
  };

  const renderPresenceIndicator = (username: string) => {
    const status = resolvePresenceFromState(presenceState, [username]);
    const meta = getCommsUserPresenceMeta(status, isEn, { isLightMode });
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${meta.badgeClass}`}
        title={meta.label}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
        <span>{meta.label}</span>
      </span>
    );
  };

  const hasFilters =
    Boolean(searchQuery.trim()) ||
    selectedOutcome !== 'all' ||
    selectedAuthMethod !== 'all' ||
    selectedUserFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedOutcome('all');
    setSelectedAuthMethod('all');
    setSelectedUserFilter('all');
  };

  return (
    <div className="space-y-4">
      {/* KPI Strip Specific to User Logins & Sessions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl audit-glass-panel border border-white/10 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
              {isEn ? 'Successful Logins' : 'کل ورودهای موفق'}
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              <LogIn className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-black font-mono tabular-nums ${isLightMode ? 'text-emerald-700' : 'text-emerald-400'}`}>
              {kpiStats.successfulLogins}
            </span>
            <span className={`text-[11px] font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'verified sessions' : 'ورود تاییدشده'}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl audit-glass-panel border border-white/10 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
              {isEn ? 'Users Who Logged In' : 'کاربران واردشده'}
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-black font-mono tabular-nums ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
              {kpiStats.uniqueLoggedInUsers}
            </span>
            <span className={`text-[11px] font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? `of ${kpiStats.uniqueUsersTotal} accounts` : `از ${kpiStats.uniqueUsersTotal} شناسه`}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl audit-glass-panel border border-white/10 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
              {isEn ? 'Unique Client IPs & Browsers' : 'آی‌پی‌ها و مرورگرهای یکتا'}
            </span>
            <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
              <Globe className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-black font-mono tabular-nums ${isLightMode ? 'text-cyan-700' : 'text-cyan-400'}`}>
              {kpiStats.uniqueIps}
            </span>
            <span className={`text-[11px] font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? `IPs • ${kpiStats.uniqueBrowsers} browsers` : `آی‌پی • ${kpiStats.uniqueBrowsers} مرورگر`}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl audit-glass-panel border border-white/10 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
              {isEn ? 'Failed & Blocked Attempts' : 'تلاش‌های ناموفق و مسدود'}
            </span>
            <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/20">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-black font-mono tabular-nums ${isLightMode ? 'text-rose-700' : 'text-rose-400'}`}>
              {kpiStats.failedOrBlocked}
            </span>
            <span className={`text-[11px] font-medium ${isLightMode ? 'text-rose-600/80' : 'text-rose-400/80'}`}>
              {isEn ? 'security events' : 'هشدار امنیتی'}
            </span>
          </div>
        </div>
      </div>

      {/* Sub-toolbar: View Switcher + Filters */}
      <div className="flex flex-col xl:flex-row gap-3 items-stretch xl:items-center justify-between p-3.5 rounded-2xl audit-glass-panel border border-white/10">
        {/* View Switcher */}
        <div className={`flex items-center gap-1.5 p-1 rounded-xl border flex-wrap ${isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-black/25 border-white/5'}`}>
          <button
            type="button"
            onClick={() => setViewMode('user_summary')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              viewMode === 'user_summary'
                ? 'bg-indigo-600 text-white shadow-md'
                : isLightMode
                ? 'text-slate-700 hover:bg-white'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{isEn ? 'By User Report' : 'گزارش به تفکیک کاربر'}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-white font-mono">
              {userSummaries.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('timeline')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              viewMode === 'timeline'
                ? 'bg-indigo-600 text-white shadow-md'
                : isLightMode
                ? 'text-slate-700 hover:bg-white'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{isEn ? 'All Login Events' : 'تاریخچه کامل رویدادها'}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-white font-mono">
              {filteredEvents.length}
            </span>
          </button>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-2 flex-wrap flex-1 xl:justify-end">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 text-slate-400 ltr:left-3 rtl:right-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isEn
                  ? 'Search username, IP, browser, OS...'
                  : 'جستجو نام کاربری، IP، مرورگر، سیستم‌عامل...'
              }
              className={`w-full text-xs py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ltr:pl-9 ltr:pr-8 rtl:pr-9 rtl:pl-8 ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                  : 'bg-black/20 hover:bg-black/30 focus:bg-black/30 border-white/10 text-white placeholder:text-slate-400'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute top-1/2 -translate-y-1/2 text-slate-400 hover:text-white ltr:right-2.5 rtl:left-2.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={selectedUserFilter}
            onChange={(e) => setSelectedUserFilter(e.target.value)}
            className={`text-xs py-2 px-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-900'
                : 'bg-black/20 border-white/10 text-white'
            }`}
          >
            <option value="all" className={isLightMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
              {isEn ? 'All Users' : 'همه کاربران'}
            </option>
            {availableUsers.map((u) => (
              <option key={u} value={u} className={isLightMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
                {u}
              </option>
            ))}
          </select>

          <select
            value={selectedOutcome}
            onChange={(e) => setSelectedOutcome(e.target.value)}
            className={`text-xs py-2 px-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-900'
                : 'bg-black/20 border-white/10 text-white'
            }`}
          >
            <option value="all" className={isLightMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
              {isEn ? 'All Outcomes' : 'همه وضعیت‌ها'}
            </option>
            <option value="login_success" className={isLightMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
              {isEn ? 'Successful Logins' : 'ورودهای موفق'}
            </option>
            <option value="failed_or_blocked" className={isLightMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
              {isEn ? 'Failed & Blocked' : 'ورودهای ناموفق / مسدود'}
            </option>
            <option value="2fa_challenge" className={isLightMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
              {isEn ? '2FA Challenges' : 'احراز دو مرحله‌ای'}
            </option>
            <option value="logout" className={isLightMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
              {isEn ? 'Logouts' : 'خروج از سیستم'}
            </option>
          </select>

          <select
            value={selectedAuthMethod}
            onChange={(e) => setSelectedAuthMethod(e.target.value)}
            className={`text-xs py-2 px-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-900'
                : 'bg-black/20 border-white/10 text-white'
            }`}
          >
            <option value="all" className={isLightMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
              {isEn ? 'All Auth Methods' : 'همه روش‌های احراز هویت'}
            </option>
            <option value="local" className={isLightMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
              {isEn ? 'Local Database' : 'دیتابیس محلی'}
            </option>
            <option value="ad" className={isLightMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
              {isEn ? 'Active Directory' : 'اکتیو دایرکتوری'}
            </option>
            <option value="2fa" className={isLightMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
              {isEn ? 'Two-Factor Auth' : 'تایید دو مرحله‌ای'}
            </option>
            <option value="trusted_device" className={isLightMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
              {isEn ? 'Trusted Device' : 'دستگاه مورداعتماد'}
            </option>
          </select>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-2.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/25 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>{isEn ? 'Reset' : 'پاک کردن فیلتر'}</span>
            </button>
          )}

          {isModalMinimized && inspectedEvent && (
            <button
              type="button"
              onClick={() => setIsModalMinimized(false)}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>
                {isEn
                  ? `Restore: ${inspectedEvent.username}`
                  : `بازگردانی جزئیات: ${inspectedEvent.username}`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Authentic Error or Loading Banners */}
      {loadError && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs ${
            isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer shrink-0"
          >
            {isEn ? 'Retry' : 'تلاش مجدد'}
          </button>
        </div>
      )}

      {isLoading && !loginReports ? (
        <div className="p-12 text-center audit-glass-panel rounded-2xl border border-white/10 space-y-3">
          <RefreshCw className="w-8 h-8 mx-auto text-indigo-400 animate-spin" />
          <p className={`text-xs font-medium ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
            {isEn
              ? 'Loading authentic user login and session telemetry from database...'
              : 'در حال دریافت گزارشات واقعی ورود و نشست کاربران از دیتابیس...'}
          </p>
        </div>
      ) : viewMode === 'user_summary' ? (
        /* VIEW 1: PER-USER AGGREGATED LOGIN SUMMARY (SPLIT VIEW) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column (5 cols): Users List */}
          <div className="lg:col-span-5 audit-glass-panel rounded-2xl border border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h2 className={`text-xs font-bold flex items-center gap-2 ${isLightMode ? 'text-slate-800' : 'text-white'}`}>
                <Users className="w-4 h-4 text-indigo-400" />
                <span>{isEn ? 'Accounts with Login Telemetry' : 'کاربران دارای گزارش ورود'}</span>
              </h2>
              <span className={`text-[11px] font-mono ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {userSummaries.length} {isEn ? 'users' : 'کاربر'}
              </span>
            </div>

            <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1 custom-scrollbar">
              {userSummaries.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Users className="w-9 h-9 mx-auto opacity-30 mb-2" />
                  <p className="text-xs">
                    {isEn
                      ? 'No user login telemetry matched current filters.'
                      : 'گزارش ورودی مطابق با فیلتر فعلی یافت نشد.'}
                  </p>
                </div>
              ) : (
                userSummaries.map((u) => {
                  const isActive = activeUserSummary?.username === u.username;
                  return (
                    <div
                      key={u.username}
                      onClick={() => setActiveUsername(u.username)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer audit-card-item ${
                        isActive
                          ? 'active shadow-lg'
                          : isLightMode
                          ? 'bg-white border-slate-200 hover:border-slate-300'
                          : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/5 hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0">
                            {u.username.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`font-bold text-sm font-mono truncate ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                                {u.username}
                              </span>
                              {renderPresenceIndicator(u.username)}
                            </div>
                            <span className={`text-[11px] block truncate mt-0.5 ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                              {u.fullName !== u.username ? `${u.fullName} • ` : ''}
                              {u.role}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 tabular-nums">
                            {u.totalLogins} {isEn ? 'logins' : 'ورود'}
                          </span>
                          {u.failedAttempts + u.blockedAttempts > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 text-rose-500 border border-rose-500/30 tabular-nums">
                              {u.failedAttempts + u.blockedAttempts} {isEn ? 'failed' : 'ناموفق'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={`mt-2.5 pt-2 border-t flex items-center justify-between gap-2 text-[11px] flex-wrap ${isLightMode ? 'border-slate-200 text-slate-600' : 'border-white/5 text-slate-400'}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-cyan-500">{u.lastIp}</span>
                          <span>•</span>
                          <span className="truncate">{u.lastBrowser}</span>
                        </div>
                        <span className="font-mono text-[10px] tabular-nums shrink-0">
                          {formatDateTime(u.lastLoginAt || u.lastEventAt)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column (7 cols): Detailed User Login Telemetry */}
          <div className="lg:col-span-7 audit-glass-panel rounded-2xl border border-white/10 p-5 space-y-5">
            {activeUserSummary ? (
              <>
                {/* User Identity Header */}
                <div
                  className={`p-4 rounded-xl border flex items-center justify-between gap-4 flex-wrap ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-black/25 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white font-bold text-base shadow-md shrink-0">
                      {activeUserSummary.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className={`text-base font-bold font-mono ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                          {activeUserSummary.username}
                        </h2>
                        {renderPresenceIndicator(activeUserSummary.username)}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            activeUserSummary.userType === 'ad'
                              ? isLightMode
                                ? 'bg-sky-50 text-sky-700 border-sky-200'
                                : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                              : isLightMode
                              ? 'bg-slate-200 text-slate-700 border-slate-300'
                              : 'bg-white/10 text-slate-300 border-white/10'
                          }`}
                        >
                          {activeUserSummary.userType === 'ad'
                            ? isEn
                              ? 'Active Directory'
                              : 'اکتیو دایرکتوری'
                            : activeUserSummary.userType === 'local'
                            ? isEn
                              ? 'Local Account'
                              : 'کاربر محلی'
                            : isEn
                            ? 'Auth Attempt'
                            : 'تلاش احراز هویت'}
                        </span>
                      </div>
                      <p className={`text-xs mt-1 ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                        {activeUserSummary.fullName !== activeUserSummary.username ? `${activeUserSummary.fullName} • ` : ''}
                        {activeUserSummary.role}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className={`text-[10px] block ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isEn ? 'First Login' : 'نخستین ورود'}
                      </span>
                      <span className={`font-mono font-semibold ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                        {formatExactDateAndTime(activeUserSummary.firstLoginAt)}
                      </span>
                    </div>
                    <div className={`h-7 w-px ${isLightMode ? 'bg-slate-200' : 'bg-white/10'}`} />
                    <div>
                      <span className={`text-[10px] block ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isEn ? 'Latest Login' : 'آخرین ورود'}
                      </span>
                      <span className={`font-mono font-semibold ${isLightMode ? 'text-emerald-700' : 'text-emerald-400'}`}>
                        {formatExactDateAndTime(activeUserSummary.lastLoginAt)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Counters Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-white border-slate-200' : 'bg-white/[0.03] border-white/10'}`}>
                    <span className={`text-[10px] block ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'Total Logins' : 'تعداد دفعات ورود'}
                    </span>
                    <span className={`text-lg font-black font-mono tabular-nums ${isLightMode ? 'text-emerald-700' : 'text-emerald-400'}`}>
                      {activeUserSummary.totalLogins}
                    </span>
                  </div>
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-white border-slate-200' : 'bg-white/[0.03] border-white/10'}`}>
                    <span className={`text-[10px] block ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'Failed / Blocked' : 'تلاش ناموفق / مسدود'}
                    </span>
                    <span className={`text-lg font-black font-mono tabular-nums ${isLightMode ? 'text-rose-700' : 'text-rose-400'}`}>
                      {activeUserSummary.failedAttempts + activeUserSummary.blockedAttempts}
                    </span>
                  </div>
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-white border-slate-200' : 'bg-white/[0.03] border-white/10'}`}>
                    <span className={`text-[10px] block ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'Distinct IPs Used' : 'تعداد IP یکتا'}
                    </span>
                    <span className={`text-lg font-black font-mono tabular-nums ${isLightMode ? 'text-cyan-700' : 'text-cyan-400'}`}>
                      {activeUserSummary.ips.length}
                    </span>
                  </div>
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-white border-slate-200' : 'bg-white/[0.03] border-white/10'}`}>
                    <span className={`text-[10px] block ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'Logouts Recorded' : 'خروج ثبت‌شده'}
                    </span>
                    <span className={`text-lg font-black font-mono tabular-nums ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                      {activeUserSummary.logoutCount}
                    </span>
                  </div>
                </div>

                {/* IP Addresses & Browsers / OS Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* IPs used */}
                  <div className={`p-3.5 rounded-xl border space-y-2.5 ${isLightMode ? 'bg-slate-50/70 border-slate-200' : 'bg-black/20 border-white/10'}`}>
                    <div className="flex items-center justify-between">
                      <h3 className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-slate-800' : 'text-white'}`}>
                        <Network className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{isEn ? 'Source IP Addresses' : 'آدرس‌های IP مورد استفاده'}</span>
                      </h3>
                      <span className={`text-[10px] font-mono ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {activeUserSummary.ips.length}
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar">
                      {activeUserSummary.ips.map((ipItem) => (
                        <div
                          key={ipItem.ip}
                          className={`px-2.5 py-2 rounded-lg border flex items-center justify-between gap-2 text-xs ${
                            isLightMode ? 'bg-white border-slate-200' : 'bg-white/[0.03] border-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`font-mono font-bold truncate ${isLightMode ? 'text-slate-900' : 'text-cyan-300'}`}>
                              {ipItem.ip}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(ipItem.ip, `ip-${ipItem.ip}`)}
                              className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-cyan-400 cursor-pointer"
                              title={isEn ? 'Copy IP' : 'کپی IP'}
                            >
                              {copiedId === `ip-${ipItem.ip}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`font-mono text-[11px] font-bold block tabular-nums ${isLightMode ? 'text-slate-800' : 'text-white'}`}>
                              {ipItem.successCount} {isEn ? 'ok' : 'موفق'}
                              {ipItem.failedCount > 0 ? ` / ${ipItem.failedCount} ${isEn ? 'fail' : 'خطا'}` : ''}
                            </span>
                            <span className={`text-[10px] font-mono block ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                              {formatDateTime(ipItem.lastSeenAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Browsers & OS used */}
                  <div className={`p-3.5 rounded-xl border space-y-2.5 ${isLightMode ? 'bg-slate-50/70 border-slate-200' : 'bg-black/20 border-white/10'}`}>
                    <div className="flex items-center justify-between">
                      <h3 className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-slate-800' : 'text-white'}`}>
                        <Monitor className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{isEn ? 'Browsers, OS & Devices' : 'مرورگرها، سیستم‌عامل و دستگاه‌ها'}</span>
                      </h3>
                      <span className={`text-[10px] font-mono ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {activeUserSummary.browsers.length}
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar">
                      {activeUserSummary.browsers.map((bItem, idx) => (
                        <div
                          key={`${bItem.label}-${bItem.osLabel}-${idx}`}
                          className={`px-2.5 py-2 rounded-lg border flex items-center justify-between gap-2 text-xs ${
                            isLightMode ? 'bg-white border-slate-200' : 'bg-white/[0.03] border-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {renderDeviceIcon(bItem.deviceType)}
                            <div className="min-w-0">
                              <span className={`font-semibold block truncate ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                                {bItem.label}
                              </span>
                              <span className={`text-[10px] block truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                {bItem.osLabel} • {getDeviceTypeLabel(bItem.deviceType)}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`font-mono text-[11px] font-bold block tabular-nums ${isLightMode ? 'text-indigo-700' : 'text-indigo-300'}`}>
                              {bItem.count}×
                            </span>
                            <span className={`text-[10px] font-mono block ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                              {formatDateOnly(bItem.lastSeenAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Selected User's Chronological Login History Table */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-slate-800' : 'text-white'}`}>
                      <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                      <span>
                        {isEn
                          ? `Login & Session History (${activeUserEvents.length})`
                          : `تاریخچه ورود و خروج کاربر (${activeUserEvents.length} رویداد)`}
                      </span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => onExportCsv(activeUserEvents)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition ${
                        isLightMode
                          ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                          : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200'
                      }`}
                    >
                      <Download className="w-3 h-3 text-emerald-400" />
                      <span>{isEn ? 'Export User CSV' : 'خروجی CSV کاربر'}</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-left rtl:text-right border-collapse text-xs audit-table">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-300 font-semibold">
                          <th className="py-2.5 px-3">{isEn ? 'Date & Time' : 'تاریخ و ساعت'}</th>
                          <th className="py-2.5 px-3">{isEn ? 'Outcome' : 'وضعیت'}</th>
                          <th className="py-2.5 px-3">{isEn ? 'Method' : 'روش'}</th>
                          <th className="py-2.5 px-3">{isEn ? 'IP Address' : 'آدرس IP'}</th>
                          <th className="py-2.5 px-3">{isEn ? 'Browser & OS' : 'مرورگر و سیستم‌عامل'}</th>
                          <th className="py-2.5 px-3 text-center">{isEn ? 'Inspect' : 'جزئیات'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {activeUserEvents.slice(0, 50).map((ev) => (
                          <tr key={ev.id} className="hover:bg-white/[0.03] transition">
                            <td className={`py-2.5 px-3 font-mono text-[11px] whitespace-nowrap tabular-nums ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                              {formatExactDateAndTime(ev.timestamp)}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {getOutcomeBadge(ev.outcome, ev.trustedBypass)}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {getAuthMethodBadge(ev.authMethod)}
                            </td>
                            <td className={`py-2.5 px-3 font-mono text-[11px] whitespace-nowrap ${isLightMode ? 'text-cyan-700 font-semibold' : 'text-cyan-300'}`}>
                              {ev.ipAddress}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-1.5">
                                {renderDeviceIcon(ev.deviceType)}
                                <div className="min-w-0">
                                  <span className={`font-semibold block truncate max-w-[160px] ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                                    {ev.browserLabel}
                                  </span>
                                  <span className={`text-[10px] block truncate max-w-[160px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                    {ev.osLabel}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setInspectedEvent(ev);
                                  setIsModalMinimized(false);
                                }}
                                className={`p-1.5 rounded-lg transition cursor-pointer ${
                                  isLightMode
                                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                    : 'bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white'
                                }`}
                                title={isEn ? 'Inspect full login telemetry' : 'مشاهده جزئیات کامل'}
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-16 text-center text-slate-400">
                <User className="w-10 h-10 mx-auto opacity-30 mb-2" />
                <p className="text-xs">
                  {isEn
                    ? 'Select a user from the left panel to inspect their IP addresses, browsers, login counts, and timestamps.'
                    : 'برای مشاهده آی‌پی‌ها، مرورگرها، تعداد دفعات و ساعت ورود، یک کاربر را از ستون کناری انتخاب کنید.'}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* VIEW 2: FULL CHRONOLOGICAL TIMELINE TABLE */
        <div className="audit-glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-lg">
          <div className="p-4 bg-white/[0.03] border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <LogIn className="w-4 h-4 text-emerald-400" />
              <h2 className={`text-xs md:text-sm font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                {isEn
                  ? 'Chronological User Authentication & Session Events'
                  : 'دفتر وقایع ورود، احراز هویت و خروج کاربران'}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-mono ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                {filteredEvents.length} {isEn ? 'events' : 'رویداد'}
              </span>
              <button
                type="button"
                onClick={() => onExportCsv(filteredEvents)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                  isLightMode
                    ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200'
                }`}
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isEn ? 'Export CSV' : 'خروجی CSV'}</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left rtl:text-right border-collapse text-xs audit-table">
              <thead>
                <tr className="border-b border-white/10 text-slate-300 font-semibold">
                  <th className="py-3 px-3.5">{isEn ? 'Date & Time' : 'تاریخ و ساعت'}</th>
                  <th className="py-3 px-3.5">{isEn ? 'User' : 'کاربر'}</th>
                  <th className="py-3 px-3.5">{isEn ? 'Outcome' : 'نتیجه'}</th>
                  <th className="py-3 px-3.5">{isEn ? 'Auth Method' : 'روش احراز هویت'}</th>
                  <th className="py-3 px-3.5">{isEn ? 'Client IP' : 'آدرس IP'}</th>
                  <th className="py-3 px-3.5">{isEn ? 'Browser / OS / Device' : 'مرورگر / سیستم‌عامل / دستگاه'}</th>
                  <th className="py-3 px-3.5 text-center">{isEn ? 'Inspect' : 'جزئیات'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginatedEvents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <LogIn className="w-8 h-8 opacity-40" />
                        <span className="text-sm">
                          {isEn ? 'No login events found matching criteria.' : 'رویداد ورودی با این مشخصات یافت نشد.'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedEvents.map((ev) => (
                    <tr key={ev.id} className="hover:bg-white/[0.03] transition">
                      <td className={`py-3 px-3.5 font-mono text-[11px] whitespace-nowrap tabular-nums ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                        {formatExactDateAndTime(ev.timestamp)}
                      </td>
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-bold font-mono ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                            {ev.username}
                          </span>
                          {renderPresenceIndicator(ev.username)}
                        </div>
                        <span className={`text-[10px] block truncate max-w-[180px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {ev.fullName !== ev.username ? `${ev.fullName} • ` : ''}
                          {ev.role}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        {getOutcomeBadge(ev.outcome, ev.trustedBypass)}
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        {getAuthMethodBadge(ev.authMethod)}
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <span className={`font-mono font-semibold ${isLightMode ? 'text-cyan-700' : 'text-cyan-300'}`}>
                            {ev.ipAddress}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(ev.ipAddress, `tbl-ip-${ev.id}`)}
                            className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-cyan-400 cursor-pointer"
                            title={isEn ? 'Copy IP' : 'کپی IP'}
                          >
                            {copiedId === `tbl-ip-${ev.id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-2">
                          {renderDeviceIcon(ev.deviceType)}
                          <div className="min-w-0">
                            <span className={`font-semibold block truncate max-w-[200px] ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                              {ev.browserLabel}
                            </span>
                            <span className={`text-[10px] block truncate max-w-[200px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                              {ev.osLabel} • {getDeviceTypeLabel(ev.deviceType)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setInspectedEvent(ev);
                            setIsModalMinimized(false);
                          }}
                          className={`p-1.5 rounded-lg transition cursor-pointer ${
                            isLightMode
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              : 'bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white'
                          }`}
                          title={isEn ? 'Inspect full login record' : 'مشاهده جزئیات کامل'}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {filteredEvents.length > 0 && (
            <div
              className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t text-xs ${
                isLightMode
                  ? 'bg-slate-50 border-slate-200 text-slate-600'
                  : 'bg-black/25 border-white/10 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-3">
                <span>
                  {isEn
                    ? `Showing ${Math.min((page - 1) * pageSize + 1, filteredEvents.length)}–${Math.min(page * pageSize, filteredEvents.length)} of ${filteredEvents.length} records`
                    : `نمایش ${Math.min((page - 1) * pageSize + 1, filteredEvents.length)} تا ${Math.min(page * pageSize, filteredEvents.length)} از مجموع ${filteredEvents.length} رکورد`}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] opacity-75">{isEn ? 'Per page:' : 'در صفحه:'}</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className={`py-1 px-2 rounded-lg border text-xs cursor-pointer ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-800'
                        : 'bg-slate-900 border-white/10 text-white'
                    }`}
                  >
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(1)}
                  disabled={page <= 1}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-30 ${
                    isLightMode
                      ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
                  }`}
                >
                  «
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-30 ${
                    isLightMode
                      ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
                  }`}
                >
                  ‹
                </button>
                <span
                  className={`px-3 py-1 rounded-lg font-mono font-bold text-xs ${
                    isLightMode
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  }`}
                >
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-30 ${
                    isLightMode
                      ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
                  }`}
                >
                  ›
                </button>
                <button
                  type="button"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-30 ${
                    isLightMode
                      ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
                  }`}
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* LOGIN EVENT FORENSIC INSPECTION MODAL (Rule 7 Compliant Portal + Footer Clearance + 3 Controls + FieldInfoTooltip) */}
      {inspectedEvent &&
        !isModalMinimized &&
        createPortal(
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="fixed top-0 left-0 right-0 bottom-8 z-[9999] modal-glass-backdrop flex items-center justify-center p-3 sm:p-5"
          >
            <div
              className={`border rounded-2xl flex flex-col shadow-2xl overflow-hidden transition-all ${
                isModalMaximized
                  ? 'w-full h-full max-w-none max-h-full'
                  : 'w-full max-w-2xl max-h-[88vh]'
              } ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-900'
                  : 'bg-slate-950 border-slate-800 text-slate-100'
              }`}
            >
              {/* Modal Header */}
              <div
                className={`px-5 py-4 border-b flex items-center justify-between gap-3 shrink-0 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 shrink-0">
                    <LogIn className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className={`text-sm sm:text-base font-bold truncate ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn
                        ? `Login Telemetry — ${inspectedEvent.username}`
                        : `گزارش ممیزی ورود — ${inspectedEvent.username}`}
                    </h3>
                    <p className={`text-[11px] font-mono truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {inspectedEvent.id} • {formatExactDateAndTime(inspectedEvent.timestamp)}
                    </p>
                  </div>
                </div>

                <ModalHeaderControls
                  isLightMode={isLightMode}
                  isEn={isEn}
                  isMaximized={isModalMaximized}
                  onMaximizeToggle={() => setIsModalMaximized((v) => !v)}
                  onMinimize={() => setIsModalMinimized(true)}
                  onClose={() => {
                    setInspectedEvent(null);
                    setIsModalMinimized(false);
                    setIsModalMaximized(false);
                  }}
                />
              </div>

              {/* Modal Body */}
              <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1 custom-scrollbar">
                {/* Summary Status Strip */}
                <div
                  className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/70 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {getOutcomeBadge(inspectedEvent.outcome, inspectedEvent.trustedBypass)}
                    {getAuthMethodBadge(inspectedEvent.authMethod)}
                    {renderPresenceIndicator(inspectedEvent.username)}
                  </div>
                  <span className={`font-mono text-[11px] ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                    {inspectedEvent.target}
                  </span>
                </div>

                {/* Forensic Fields Grid with 3-Part FieldInfoTooltip */}
                <div
                  className={`grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-4 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[11px] font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isEn ? 'Username & Role' : 'نام کاربری و نقش'}
                      </span>
                    </div>
                    <span className={`font-bold font-mono block ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {inspectedEvent.username}
                    </span>
                    <span className={`text-[11px] block ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                      {inspectedEvent.fullName !== inspectedEvent.username ? `${inspectedEvent.fullName} — ` : ''}
                      {inspectedEvent.role}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[11px] font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isEn ? 'Client Source IP' : 'آدرس IP مبدا کلاینت'}
                      </span>
                      <FieldInfoTooltip
                        isEn={isEn}
                        isLightMode={isLightMode}
                        title={isEn ? 'Client Source IP' : 'آدرس IP مبدا'}
                        whatIsIt={
                          isEn
                            ? 'The network IP address resolved by the auth gateway when this login request reached the backend.'
                            : 'آدرس IP شبکه کلاینت که هنگام ارسال درخواست احراز هویت در درگاه سرور ثبت شده است.'
                        }
                        whyIsItNeeded={
                          isEn
                            ? 'Detects logins from unfamiliar subnets, VPN exits, or brute-force attempts.'
                            : 'برای شناسایی ورود از رنج‌های مشکوک، بررسی مبدا اتصال و ردگیری حملات رمز عبور حیاتی است.'
                        }
                        example="192.168.10.45 / 10.20.30.12"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-bold text-sm ${isLightMode ? 'text-cyan-700' : 'text-cyan-300'}`}>
                        {inspectedEvent.ipAddress}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(inspectedEvent.ipAddress, 'modal-ip')}
                        className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-cyan-400 cursor-pointer"
                      >
                        {copiedId === 'modal-ip' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[11px] font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isEn ? 'Browser & Operating System' : 'مرورگر و سیستم‌عامل'}
                      </span>
                      <FieldInfoTooltip
                        isEn={isEn}
                        isLightMode={isLightMode}
                        title={isEn ? 'Parsed Browser & OS' : 'اطلاعات مرورگر و سیستم‌عامل'}
                        whatIsIt={
                          isEn
                            ? 'Human-readable browser family, major version, operating system, and device form factor extracted from User-Agent.'
                            : 'نام و نسخه مرورگر، سیستم‌عامل و نوع دستگاه استخراج‌شده از هدر User-Agent.'
                        }
                        whyIsItNeeded={
                          isEn
                            ? 'Helps spot unexpected browsers, automated scripts, or mobile sessions accessing admin privileges.'
                            : 'به تشخیص استفاده از اسکریپت‌های خودکار یا دستگاه‌های ناشناس در دسترسی‌های مدیریتی کمک می‌کند.'
                        }
                        example="Google Chrome 131 • Windows 10/11 • Desktop"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      {renderDeviceIcon(inspectedEvent.deviceType)}
                      <span className={`font-semibold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                        {inspectedEvent.browserLabel} — {inspectedEvent.osLabel}
                      </span>
                    </div>
                    <span className={`text-[10px] block mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'Device Class:' : 'نوع دستگاه:'} {getDeviceTypeLabel(inspectedEvent.deviceType)}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[11px] font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isEn ? 'Audit Action & Exact Time' : 'عنوان رویداد و زمان دقیق'}
                      </span>
                    </div>
                    <span className={`font-semibold block ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {inspectedEvent.action}
                    </span>
                    <span className={`font-mono text-[11px] block mt-0.5 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                      {formatExactDateAndTime(inspectedEvent.timestamp)}
                    </span>
                  </div>
                </div>

                {/* Full Audit Details */}
                <div>
                  <h4 className={`text-xs font-bold mb-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    {isEn ? 'Gateway Audit Description' : 'شرح ثبت‌شده در درگاه احراز هویت'}
                  </h4>
                  <div
                    className={`p-3 rounded-xl border leading-relaxed ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-800'
                        : 'bg-slate-900/70 border-slate-800 text-slate-200'
                    }`}
                  >
                    {inspectedEvent.details || inspectedEvent.action}
                  </div>
                </div>

                {/* Raw User-Agent Header */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <h4 className={`text-xs font-bold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                        {isEn ? 'Raw HTTP User-Agent Header' : 'رشته خام هدر User-Agent'}
                      </h4>
                      <FieldInfoTooltip
                        isEn={isEn}
                        isLightMode={isLightMode}
                        title={isEn ? 'Raw User-Agent' : 'هدر خام User-Agent'}
                        whatIsIt={
                          isEn
                            ? 'Unmodified HTTP User-Agent string captured at login time.'
                            : 'مقدار کامل و دست‌نخورده هدر User-Agent ارسال‌شده از مرورگر یا کلاینت کاربر هنگام ورود.'
                        }
                        whyIsItNeeded={
                          isEn
                            ? 'Essential for digital forensics when verifying exact browser engine builds or scripted clients.'
                            : 'برای بررسی دقیق نسخه موتور مرورگر یا تشخیص ابزارهای خودکار در تحلیل‌های امنیتی کاربرد دارد.'
                        }
                        example="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0"
                      />
                    </div>
                    {inspectedEvent.rawUserAgent && (
                      <button
                        type="button"
                        onClick={() => handleCopy(inspectedEvent.rawUserAgent, 'modal-ua')}
                        className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {copiedId === 'modal-ua' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{isEn ? 'Copy User-Agent' : 'کپی User-Agent'}</span>
                      </button>
                    )}
                  </div>
                  <pre
                    className={`p-3 rounded-xl font-mono text-[11px] overflow-x-auto whitespace-pre-wrap border ${
                      isLightMode
                        ? 'bg-slate-100 border-slate-200 text-slate-800'
                        : 'bg-black/60 border-slate-800 text-emerald-300'
                    }`}
                  >
                    {inspectedEvent.rawUserAgent || (isEn ? '(Not supplied by client)' : '(توسط کلاینت ارسال نشده)')}
                  </pre>
                </div>
              </div>

              {/* Modal Footer */}
              <div
                className={`px-5 py-3.5 border-t flex items-center justify-end gap-2 shrink-0 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setInspectedEvent(null);
                    setIsModalMinimized(false);
                    setIsModalMaximized(false);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    isLightMode
                      ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
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
