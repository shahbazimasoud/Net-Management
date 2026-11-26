import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  UserCog,
  UserCheck,
  Search,
  Lock,
  Unlock,
  KeyRound,
  Mail,
  Phone,
  Smartphone,
  Building2,
  Briefcase,
  MapPin,
  Clock,
  ShieldCheck,
  Database,
  Server,
  HardDrive,
  RefreshCw,
  Eye,
  EyeOff,
  Eraser,
  Copy,
  Check,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Users,
  FolderTree,
  Calendar,
  Hash,
  Archive,
  Forward,
  Info,
  ChevronRight,
  ChevronLeft,
  History,
  FileText,
  Download,
  Printer,
  ClipboardCopy,
  Trash2,
  RotateCcw,
  BarChart3,
  Activity,
  ArrowUpRight,
  X,
} from 'lucide-react';
import { AccessPolicy } from '../types';
import { AuthUser } from '../context/AuthContext';
import { isUserDomainAdmin, isUserSuperAdmin } from '../utils/rbac';
import { isTabAllowed } from '../services/settingsStorage';
import { FieldInfoTooltip } from './common/FieldInfoTooltip';
import { TimeoutAntivirusHint } from './helpdesk/TimeoutAntivirusHint';
import {
  HelpdeskUserSubTab,
  getHelpdeskUserRamSnapshot,
  subscribeHelpdeskUserRam,
  patchHelpdeskUserRamSnapshot,
  bindHelpdeskUserRamOwner,
  wipeHelpdeskUserRamSession,
  stopHelpdeskUserPrefetch,
  resolveHintedExchangeHost,
  runHelpdeskUserInspect,
  runHelpdeskUserMailboxRefresh,
  runHelpdeskUserUnlock,
} from '../services/helpdeskUserRamSession';
import {
  handoffGroupInspectionFromUserSession,
  runHelpdeskGroupInspect,
} from '../services/helpdeskGroupRamSession';
import {
  HelpdeskUserHistoryItem,
  HelpdeskUserHistoryResponse,
  fetchHelpdeskStatus,
  fetchHelpdeskUserHistory,
  deleteHelpdeskUserHistoryItem,
  clearHelpdeskUserHistory,
} from '../services/api';

interface HelpDeskUsersViewProps {
  isLightMode: boolean;
  isEn: boolean;
  effectivePolicy?: AccessPolicy | null;
  currentUser?: AuthUser | null;
  onNavigateToEndpointHelpdesk?: () => void;
  onNavigateToGroupHelpdesk?: () => void;
}

function formatBytesHuman(bytes: number | null | undefined, isEn: boolean): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return isEn ? 'N/A' : 'نامشخص';
  }
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val >= 100 || idx === 0 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)} ${units[idx]}`;
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

function daysBetweenNow(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.ceil((ms - Date.now()) / 86400000);
}

function getInitials(displayName: string, sam: string): string {
  const src = (displayName || sam || 'AD').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PRIVILEGED_AD_GROUP_NAMES = new Set([
  'domain admins',
  'enterprise admins',
  'schema admins',
  'administrators',
  'account operators',
  'server operators',
  'backup operators',
  'dnsadmins',
  'group policy creator owners',
]);

export const HelpDeskUsersView: React.FC<HelpDeskUsersViewProps> = ({
  isLightMode,
  isEn,
  effectivePolicy,
  currentUser,
  onNavigateToEndpointHelpdesk,
  onNavigateToGroupHelpdesk,
}) => {
  const ram = useSyncExternalStore(subscribeHelpdeskUserRam, getHelpdeskUserRamSnapshot);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');
  const [reinspectBanner, setReinspectBanner] = useState<{ targetUsername: string } | null>(null);

  // Check History state (backed by PostgreSQL helpdesk_user_history)
  const [historyScope, setHistoryScope] = useState<'all' | 'own'>('own');
  const [historyItems, setHistoryItems] = useState<HelpdeskUserHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyStats, setHistoryStats] = useState<HelpdeskUserHistoryResponse['stats'] | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(15);
  const [historySearch, setHistorySearch] = useState('');
  const [historySearchInput, setHistorySearchInput] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [historyActionFilter, setHistoryActionFilter] = useState<'all' | 'inspect' | 'unlock'>('all');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyHistoryId, setBusyHistoryId] = useState<string | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  // Bind session owner so user switch cleanly wipes any sensitive RAM state
  useEffect(() => {
    bindHelpdeskUserRamOwner(currentUser?.id || currentUser?.username || null);
  }, [currentUser?.id, currentUser?.username]);

  // RBAC capabilities
  const isSuper = isUserSuperAdmin(currentUser, effectivePolicy);
  const isDomAdmin = isUserDomainAdmin(currentUser);
  const hasFull = isSuper || isDomAdmin;
  const canInspectUsers =
    hasFull ||
    (effectivePolicy?.canViewHelpdesk === true &&
      effectivePolicy?.canInspectHelpdeskDomainUsers === true);
  const canUnlockAccount =
    hasFull ||
    (canInspectUsers && effectivePolicy?.canExecuteHelpdeskActions === true);
  const canViewAllHistory =
    hasFull ||
    (canInspectUsers && effectivePolicy?.canViewAllHelpdeskHistory === true);
  const canOpenGroupHelpdesk =
    Boolean(onNavigateToGroupHelpdesk) &&
    canInspectUsers &&
    (!effectivePolicy || isTabAllowed('helpdesk-groups', effectivePolicy, currentUser));

  const resolveInspectableGroupTarget = (grp: { cn: string; dn: string }): string | null => {
    const dn = String(grp.dn || '').trim();
    if (/^(?:CN|OU)=/i.test(dn) && /DC=/i.test(dn)) {
      return dn;
    }
    const ridMatch = dn.match(/^RID:(\d+)$/i);
    if (ridMatch) {
      const wellKnown: Record<string, string> = {
        '512': 'Domain Admins',
        '513': 'Domain Users',
        '514': 'Domain Guests',
        '515': 'Domain Computers',
        '516': 'Domain Controllers',
      };
      return wellKnown[ridMatch[1]] || null;
    }
    const cn = String(grp.cn || '').trim();
    return cn || null;
  };

  const handleInspectGroupInHelpdesk = (grp: { cn: string; dn: string }) => {
    if (!canOpenGroupHelpdesk || !onNavigateToGroupHelpdesk) return;
    const targetGroup = resolveInspectableGroupTarget(grp);
    if (!targetGroup) return;

    const ownerUserId = currentUser?.id || currentUser?.username || ram.ownerUserId || null;
    const { canAutoInspect } = handoffGroupInspectionFromUserSession({
      ownerUserId,
      targetGroup,
      adminUsername: ram.adminUsername,
      adminPassword: ram.adminPassword,
      domainController:
        ram.domainController.trim() || ram.userData?.connectionInfo?.domainController || '',
      ldapProtocol: ram.ldapProtocol,
      winrmProtocol: ram.winrmProtocol,
    });

    onNavigateToGroupHelpdesk();
    if (canAutoInspect) {
      void runHelpdeskGroupInspect(targetGroup);
    }
  };

  // Fetch HelpDesk RBAC/rate-limit status on mount
  useEffect(() => {
    fetchHelpdeskStatus()
      .then((res) => {
        if (res?.rateLimit) {
          patchHelpdeskUserRamSnapshot({ rateLimit: res.rateLimit });
        }
        if (typeof res?.permissions?.canViewAllHelpdeskHistory === 'boolean') {
          setHistoryScope(res.permissions.canViewAllHelpdeskHistory ? 'all' : 'own');
        } else {
          setHistoryScope(canViewAllHistory ? 'all' : 'own');
        }
      })
      .catch(() => {
        setHistoryScope(canViewAllHistory ? 'all' : 'own');
      });
  }, [canViewAllHistory]);

  // Auto-sync default mail.<domain> (prioritizing public-suffix / user email domain)
  // whenever domain hints or inspected user profile email change and operator hasn't manually overridden it
  const hintedExchangeHost = resolveHintedExchangeHost(ram);
  useEffect(() => {
    if (!ram.exchangeServerEditedManually && hintedExchangeHost && ram.exchangeServer !== hintedExchangeHost) {
      patchHelpdeskUserRamSnapshot({ exchangeServer: hintedExchangeHost });
    }
  }, [hintedExchangeHost, ram.exchangeServerEditedManually, ram.exchangeServer]);

  // Reset inline confirm whenever target user changes or finishes unlocking
  useEffect(() => {
    setConfirmUnlock(false);
  }, [ram.userData?.profile.samAccountName, ram.unlockResult]);

  const loadUserCheckHistory = async (overrides?: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: 'all' | 'success' | 'failed';
    actionType?: 'all' | 'inspect' | 'unlock';
  }) => {
    if (!canInspectUsers) return;
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const p = overrides?.page ?? historyPage;
      const ps = overrides?.pageSize ?? historyPageSize;
      const s = overrides?.search ?? historySearch;
      const st = overrides?.status ?? historyStatusFilter;
      const act = overrides?.actionType ?? historyActionFilter;
      const res = await fetchHelpdeskUserHistory({
        page: p,
        pageSize: ps,
        search: s,
        status: st,
        actionType: act,
      });
      setHistoryItems(Array.isArray(res.items) ? res.items : []);
      setHistoryTotal(Number(res.total || 0));
      setHistoryStats(res.stats || null);
      if (res.scope === 'all' || res.scope === 'own') {
        setHistoryScope(res.scope);
      }
    } catch (err: any) {
      setHistoryError(
        err?.message || (isEn ? 'Failed to load user check history.' : 'خطا در دریافت تاریخچه بررسی کاربران.')
      );
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (ram.activeSubTab === 'history' && canInspectUsers) {
      loadUserCheckHistory();
    }
  }, [ram.activeSubTab, canInspectUsers]);

  // Surface styles matching HelpDeskView
  const surfaceBg = isLightMode
    ? 'bg-white border-slate-200 shadow-sm'
    : 'bg-slate-900/80 border-slate-800';
  const subSurfaceBg = isLightMode
    ? 'bg-slate-50 border-slate-200'
    : 'bg-slate-950/70 border-slate-800';
  const inputCls = isLightMode
    ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-teal-500'
    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-teal-500';
  const textPrimary = isLightMode ? 'text-slate-900' : 'text-slate-100';
  const textSecondary = isLightMode ? 'text-slate-700' : 'text-slate-300';
  const textMuted = isLightMode ? 'text-slate-500' : 'text-slate-400';

  const handleCopy = (value: string, key: string) => {
    if (!value) return;
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1800);
  };

  const handleSubmitInspect = async (e?: React.FormEvent, overrideTarget?: string) => {
    if (e) e.preventDefault();
    if (!canInspectUsers) return;
    setReinspectBanner(null);
    if (ram.activeSubTab === 'history') {
      patchHelpdeskUserRamSnapshot({ activeSubTab: 'overview' });
    }
    await runHelpdeskUserInspect(overrideTarget);
  };

  const handleInspectRelatedPerson = async (samOrDn: string) => {
    if (!samOrDn || !canInspectUsers) return;
    setReinspectBanner(null);
    await runHelpdeskUserInspect(samOrDn);
    patchHelpdeskUserRamSnapshot({ activeSubTab: 'overview' });
  };

  const handleReinspectFromHistory = async (item: HelpdeskUserHistoryItem) => {
    const targetToQuery = item.samAccountName || item.queryTarget;
    if (!targetToQuery) return;
    patchHelpdeskUserRamSnapshot({
      targetUsername: targetToQuery,
      ...(item.domainController ? { domainController: item.domainController } : {}),
      activeSubTab: 'overview',
      error: null,
    });
    if (ram.adminUsername.trim() && ram.adminPassword) {
      setReinspectBanner(null);
      await runHelpdeskUserInspect(targetToQuery);
    } else {
      setReinspectBanner({ targetUsername: targetToQuery });
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 60);
    }
  };

  const handleDeleteUserHistoryItem = async (id: string) => {
    setBusyHistoryId(id);
    setHistoryError(null);
    setHistoryNotice(null);
    try {
      await deleteHelpdeskUserHistoryItem(id);
      setHistoryNotice({
        ok: true,
        text: isEn ? 'Check history record deleted.' : 'ردیف انتخاب‌شده از تاریخچه بررسی حذف شد.',
      });
      await loadUserCheckHistory();
    } catch (err: any) {
      setHistoryError(err?.message || (isEn ? 'Failed to delete record.' : 'حذف ردیف تاریخچه ناموفق بود.'));
    } finally {
      setBusyHistoryId(null);
    }
  };

  const handleClearAllUserHistory = async () => {
    setBusyHistoryId('ALL');
    setConfirmClearHistory(false);
    setHistoryError(null);
    setHistoryNotice(null);
    try {
      const res = await clearHelpdeskUserHistory();
      setHistoryNotice({
        ok: true,
        text: isEn
          ? `Cleared ${res.clearedCount} user check history record(s).`
          : `تعداد ${res.clearedCount} رکورد از تاریخچه بررسی کاربران با موفقیت پاک شد.`,
      });
      await loadUserCheckHistory({ page: 1 });
    } catch (err: any) {
      setHistoryError(err?.message || (isEn ? 'Failed to clear check history.' : 'پاک‌سازی تاریخچه ناموفق بود.'));
    } finally {
      setBusyHistoryId(null);
    }
  };

  const handleExportUserHistoryCsv = () => {
    if (historyItems.length === 0) return;
    const headers = [
      'Checked At',
      'Action',
      'Target Query',
      'SamAccountName',
      'Display Name',
      'Job Title',
      'Department',
      'Primary Email',
      'Domain',
      'Domain Controller',
      'Method',
      'Account Locked',
      'Password Expired',
      'Mailbox Used Bytes',
      'Mailbox Quota Bytes',
      'Mailbox Used %',
      'Status',
      'Operator',
      'Error',
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = historyItems.map((it) =>
      [
        it.checkedAt,
        it.actionType,
        it.queryTarget,
        it.samAccountName,
        it.displayName,
        it.jobTitle,
        it.department,
        it.primaryEmail,
        it.domainName,
        it.domainController,
        it.methodUsed,
        it.accountLocked === null ? '' : String(it.accountLocked),
        it.passwordExpired === null ? '' : String(it.passwordExpired),
        it.mailboxUsedBytes ?? '',
        it.mailboxQuotaBytes ?? '',
        it.mailboxUsedPercent ?? '',
        it.status,
        it.actorName,
        it.errorMessage || '',
      ]
        .map(esc)
        .join(',')
    );
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `helpdesk_user_check_history_p${historyPage}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const data = ram.userData;
  const filteredGroups = useMemo(() => {
    if (!data?.groups) return [];
    const q = groupSearch.trim().toLowerCase();
    if (!q) return data.groups;
    return data.groups.filter(
      (g) => g.cn.toLowerCase().includes(q) || g.dn.toLowerCase().includes(q)
    );
  }, [data?.groups, groupSearch]);

  const pwdDaysRemaining = daysBetweenNow(data?.security.passwordExpiresAt);

  // Real-data diagnostic scorecard & actionable findings for User Reports tab
  const reportSummary = useMemo(() => {
    if (!data) return null;

    let score = 100;
    const findings: Array<{
      id: string;
      severity: 'critical' | 'warning' | 'info' | 'ok';
      titleEn: string;
      titleFa: string;
      detailEn: string;
      detailFa: string;
      targetTab?: HelpdeskUserSubTab;
    }> = [];

    if (!data.security.accountEnabled) {
      score -= 35;
      findings.push({
        id: 'disabled',
        severity: 'critical',
        titleEn: 'AD Account is Disabled',
        titleFa: 'اکانت کاربری غیرفعال (Disabled) است',
        detailEn: 'User cannot sign in to Windows, VPN, or mail until re-enabled by Domain Admin.',
        detailFa: 'کاربر تا زمان فعال‌سازی مجدد در اکتیو دایرکتوری امکان ورود به سیستم، VPN یا ایمیل را ندارد.',
        targetTab: 'security',
      });
    }

    if (data.security.accountExpired) {
      score -= 30;
      findings.push({
        id: 'acc_expired',
        severity: 'critical',
        titleEn: 'AD Account Has Expired',
        titleFa: 'تاریخ اعتبار اکانت به پایان رسیده است',
        detailEn: 'Update Account Expires attribute in Active Directory to restore access.',
        detailFa: 'تاریخ انقضای اکانت (Account Expires) باید در AD تمدید شود.',
        targetTab: 'security',
      });
    }

    if (data.security.accountLocked) {
      score -= 25;
      findings.push({
        id: 'locked',
        severity: 'critical',
        titleEn: 'Account Locked Out',
        titleFa: 'اکانت کاربری قفل شده است (Locked Out)',
        detailEn: `Account locked due to ${data.security.badPwdCount} failed password attempt(s). Use Unlock in Security tab.`,
        detailFa: `اکانت پس از ${data.security.badPwdCount} تلاش ناموفق قفل شده است و از تب امنیت قابل آزادسازی است.`,
        targetTab: 'security',
      });
    } else if (data.security.badPwdCount > 0) {
      score -= 5;
      findings.push({
        id: 'bad_pwd',
        severity: 'warning',
        titleEn: 'Recent Failed Logon Attempts Recorded',
        titleFa: 'تلاش‌های ناموفق ورود ثبت شده است',
        detailEn: `${data.security.badPwdCount} bad password attempt(s) detected on record.`,
        detailFa: `تعداد ${data.security.badPwdCount} بار رمز اشتباه ثبت شده است.`,
        targetTab: 'security',
      });
    }

    if (data.security.passwordExpired) {
      score -= 25;
      findings.push({
        id: 'pwd_expired',
        severity: 'critical',
        titleEn: 'Domain Password is Expired',
        titleFa: 'رمز عبور کاربر منقضی شده است',
        detailEn: 'User must change password before logon or remote authentication succeeds.',
        detailFa: 'کاربر ملزم به تغییر رمز عبور است تا احراز هویت وی مجدداً تایید شود.',
        targetTab: 'security',
      });
    } else if (data.security.mustChangePasswordAtNextLogon) {
      score -= 10;
      findings.push({
        id: 'must_change',
        severity: 'warning',
        titleEn: 'Must Change Password at Next Logon',
        titleFa: 'الزام تغییر رمز در اولین ورود بعدی',
        detailEn: 'Logon via web apps/VPN may fail until the user logs into Windows or resets password interactively.',
        detailFa: 'ورود به سرویس‌های تحت وب یا VPN تا پیش از تغییر تعاملی رمز در ویندوز ممکن است خطا دهد.',
        targetTab: 'security',
      });
    } else if (!data.security.passwordNeverExpires && pwdDaysRemaining !== null && pwdDaysRemaining <= 7) {
      score -= 10;
      findings.push({
        id: 'pwd_soon',
        severity: 'warning',
        titleEn: `Password Expiring in ${pwdDaysRemaining} Day(s)`,
        titleFa: `رمز عبور تا ${pwdDaysRemaining} روز دیگر منقضی می‌شود`,
        detailEn: 'Advise user to update their password proactively to avoid lockout or VPN interruption.',
        detailFa: 'به کاربر اطلاع دهید پیش از انقضا، رمز خود را تغییر دهد تا دسترسی وی قطع نشود.',
        targetTab: 'security',
      });
    }

    const mbxPct = data.mailbox.usedPercent;
    if (data.mailbox.hasMailbox && mbxPct !== null) {
      if (mbxPct >= 92) {
        score -= 20;
        findings.push({
          id: 'mbx_crit',
          severity: 'critical',
          titleEn: `Mailbox Critical (${mbxPct}% Full)`,
          titleFa: `هشدار بحرانی پر شدن میل‌باکس (${mbxPct}٪)`,
          detailEn: 'Mailbox is near or at Prohibit Send/Receive threshold. Archive older items or expand database/user quota.',
          detailFa: 'فضای میل‌باکس به آستانه مسدودسازی نزدیک شده؛ حذف/آرشیو ایمیل‌ها یا افزایش Quota توصیه می‌شود.',
          targetTab: 'mailbox',
        });
      } else if (mbxPct >= 80) {
        score -= 10;
        findings.push({
          id: 'mbx_warn',
          severity: 'warning',
          titleEn: `Mailbox Usage Elevated (${mbxPct}%)`,
          titleFa: `مصرف میل‌باکس بالا است (${mbxPct}٪)`,
          detailEn: 'Consider enabling In-Place Archive or cleaning Recoverable/Deleted Items.',
          detailFa: 'بررسی آیتم‌های حذف‌شده (Dumpster) یا فعال‌سازی آرشیو توصیه می‌شود.',
          targetTab: 'mailbox',
        });
      }
    }

    const privilegedGroups = data.groups.filter((g) =>
      PRIVILEGED_AD_GROUP_NAMES.has(g.cn.trim().toLowerCase())
    );
    if (privilegedGroups.length > 0) {
      findings.push({
        id: 'priv_groups',
        severity: 'info',
        titleEn: `Privileged AD Group Membership (${privilegedGroups.map((g) => g.cn).join(', ')})`,
        titleFa: `عضویت در گروه‌های مدیریتی حساس (${privilegedGroups.map((g) => g.cn).join('، ')})`,
        detailEn: 'Verify least-privilege compliance when handling password/lockout tickets for elevated accounts.',
        detailFa: 'با توجه به سطح دسترسی بالای این حساب، پیش از هر تغییر هویت کاربر را دقیق احراز کنید.',
        targetTab: 'groups',
      });
    }

    if (
      data.contact.internalPhones.length === 0 &&
      data.contact.mobileNumbers.length === 0
    ) {
      score -= 5;
      findings.push({
        id: 'missing_phones',
        severity: 'info',
        titleEn: 'Missing Phone / Mobile Attributes in AD',
        titleFa: 'شماره داخلی یا موبایل در AD ثبت نشده است',
        detailEn: 'No telephoneNumber or mobile value recorded in Active Directory for identity verification.',
        detailFa: 'برای تماس سریع پشتیبانی یا احراز هویت تلفنی، تکمیل شماره داخلی و موبایل در AD پیشنهاد می‌شود.',
        targetTab: 'overview',
      });
    }

    if (findings.length === 0 || findings.every((f) => f.severity === 'ok')) {
      findings.push({
        id: 'all_good',
        severity: 'ok',
        titleEn: 'All Checked Directory & Mailbox Signals Healthy',
        titleFa: 'تمامی شاخص‌های اکانت دامین و میل‌باکس سالم هستند',
        detailEn: 'Account is active, unlocked, password valid, and no storage bottlenecks detected.',
        detailFa: 'حساب فعال و باز است، رمز عبور اعتبار دارد و مشکل بحرانی در پروفایل یا ایمیل مشاهده نشد.',
      });
    }

    const clampedScore = Math.max(0, Math.min(100, score));
    const grade: 'healthy' | 'attention' | 'critical' =
      clampedScore >= 85 ? 'healthy' : clampedScore >= 60 ? 'attention' : 'critical';

    return {
      score: clampedScore,
      grade,
      findings,
      privilegedGroups,
      contactFieldsPresent:
        Number(Boolean(data.contact.primaryEmail)) +
        Number(data.contact.internalPhones.length > 0) +
        Number(data.contact.mobileNumbers.length > 0),
    };
  }, [data, pwdDaysRemaining]);

  const buildTicketSummaryText = (): string => {
    if (!data) return '';
    const pwdLabel = data.security.passwordNeverExpires
      ? isEn
        ? 'Never Expires'
        : 'بدون انقضا'
      : data.security.passwordExpired
      ? isEn
        ? 'EXPIRED'
        : 'منقضی شده'
      : pwdDaysRemaining !== null
      ? isEn
        ? `Valid (${pwdDaysRemaining}d left)`
        : `معتبر (${pwdDaysRemaining} روز مانده)`
      : isEn
      ? 'Active'
      : 'فعال';

    const mbxLabel = data.mailbox.hasMailbox
      ? data.mailbox.totalUsedBytes !== null
        ? `${formatBytesHuman(data.mailbox.totalUsedBytes, isEn)} / ${
            data.mailbox.effectiveQuotaBytes
              ? formatBytesHuman(data.mailbox.effectiveQuotaBytes, isEn)
              : isEn
              ? 'Unlimited'
              : 'نامحدود'
          }${data.mailbox.usedPercent !== null ? ` (${data.mailbox.usedPercent}%)` : ''}`
        : data.mailbox.effectiveQuotaBytes
        ? `${isEn ? 'Quota' : 'سهمیه'}: ${formatBytesHuman(data.mailbox.effectiveQuotaBytes, isEn)}`
        : isEn
        ? 'Provisioned'
        : 'دارای میل‌باکس'
      : isEn
      ? 'No Mailbox'
      : 'بدون میل‌باکس';

    if (isEn) {
      return [
        `=== AD User Support Dossier (${data.profile.samAccountName}) ===`,
        `Full Name: ${data.profile.displayName || '-'}`,
        `Role / Dept: ${[data.profile.jobTitle, data.profile.department, data.profile.company].filter(Boolean).join(' · ') || '-'}`,
        `UPN / Domain: ${data.profile.userPrincipalName || '-'} (${data.connectionInfo.domainName})`,
        `Email: ${data.contact.primaryEmail || '-'}`,
        `Extensions: ${data.contact.internalPhones.join(', ') || '-'}`,
        `Mobiles: ${data.contact.mobileNumbers.join(', ') || '-'}`,
        `Account State: ${data.security.accountEnabled ? 'Enabled' : 'Disabled'} | Lockout: ${data.security.accountLocked ? 'LOCKED' : 'Unlocked'} (BadPwd: ${data.security.badPwdCount})`,
        `Password Last Set: ${formatDateDisplay(data.security.passwordLastSet, true)} | Status: ${pwdLabel}`,
        `Mailbox Usage: ${mbxLabel} | DB: ${data.mailbox.databaseName || '-'}`,
        `AD Groups (${data.groups.length}): ${data.groups.slice(0, 12).map((g) => g.cn).join(', ')}${data.groups.length > 12 ? ' ...' : ''}`,
        `Collected: ${formatDateDisplay(data.collectedAt, true)} via ${data.connectionInfo.domainController}`,
      ].join('\n');
    }

    return [
      `=== گزارش پشتیبانی کاربر دامین (${data.profile.samAccountName}) ===`,
      `نام کامل: ${data.profile.displayName || '-'}`,
      `سمت / دپارتمان: ${[data.profile.jobTitle, data.profile.department, data.profile.company].filter(Boolean).join(' · ') || '-'}`,
      `نام کاربری / دامین: ${data.profile.userPrincipalName || '-'} (${data.connectionInfo.domainName})`,
      `ایمیل اصلی: ${data.contact.primaryEmail || '-'}`,
      `شماره داخلی: ${data.contact.internalPhones.join('، ') || '-'}`,
      `موبایل‌ها: ${data.contact.mobileNumbers.join('، ') || '-'}`,
      `وضعیت حساب: ${data.security.accountEnabled ? 'فعال' : 'غیرفعال'} | قفل اکانت: ${data.security.accountLocked ? 'قفل شده' : 'باز'} (رمز اشتباه: ${data.security.badPwdCount})`,
      `آخرین تغییر رمز: ${formatDateDisplay(data.security.passwordLastSet, false)} | وضعیت رمز: ${pwdLabel}`,
      `حجم میل‌باکس: ${mbxLabel} | دیتابیس: ${data.mailbox.databaseName || '-'}`,
      `تعداد گروه‌های AD (${data.groups.length}): ${data.groups.slice(0, 12).map((g) => g.cn).join('، ')}${data.groups.length > 12 ? ' ...' : ''}`,
      `زمان گزارش: ${formatDateDisplay(data.collectedAt, false)} از دامین کنترلر ${data.connectionInfo.domainController}`,
    ].join('\n');
  };

  const handleDownloadUserCsvReport = () => {
    if (!data) return;
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows: Array<[string, string]> = [
      ['Report Generated At', formatDateDisplay(data.collectedAt, isEn)],
      ['SamAccountName', data.profile.samAccountName],
      ['Display Name', data.profile.displayName],
      ['First Name', data.profile.firstName],
      ['Last Name', data.profile.lastName],
      ['Job Title', data.profile.jobTitle],
      ['Department', data.profile.department],
      ['Company', data.profile.company],
      ['Office', data.profile.office],
      ['Employee ID', data.profile.employeeId || data.profile.employeeNumber],
      ['UPN', data.profile.userPrincipalName],
      ['Domain', data.connectionInfo.domainName],
      ['Domain Controller', `${data.connectionInfo.domainController}:${data.connectionInfo.port} (${data.connectionInfo.method})`],
      ['OU', data.profile.organizationalUnit],
      ['Manager', data.profile.manager?.displayName || ''],
      ['Primary Email', data.contact.primaryEmail],
      ['Email Aliases', data.contact.emailAliases.map((a) => a.address).join('; ')],
      ['Internal Extensions', data.contact.internalPhones.join('; ')],
      ['Mobile Numbers', data.contact.mobileNumbers.join('; ')],
      ['Account Enabled', String(data.security.accountEnabled)],
      ['Account Locked', String(data.security.accountLocked)],
      ['Bad Password Count', String(data.security.badPwdCount)],
      ['Password Last Changed', formatDateDisplay(data.security.passwordLastSet, isEn)],
      ['Password Expires At', data.security.passwordNeverExpires ? 'Never Expires' : formatDateDisplay(data.security.passwordExpiresAt, isEn)],
      ['Password Expired', String(data.security.passwordExpired)],
      ['Last Domain Logon', formatDateDisplay(data.security.lastLogon, isEn)],
      ['Logon Count', String(data.security.logonCount)],
      ['Has Mailbox', String(data.mailbox.hasMailbox)],
      ['Mailbox Database', data.mailbox.databaseName],
      ['Mailbox Server', data.mailbox.exchangeHostUsed || data.mailbox.serverName],
      ['Mailbox Used', data.mailbox.totalUsedBytes !== null ? formatBytesHuman(data.mailbox.totalUsedBytes, isEn) : 'N/A'],
      ['Mailbox Effective Quota', data.mailbox.isUnlimitedQuota ? 'Unlimited' : formatBytesHuman(data.mailbox.effectiveQuotaBytes, isEn)],
      ['Mailbox Usage %', data.mailbox.usedPercent !== null ? `${data.mailbox.usedPercent}%` : 'N/A'],
      ['Mailbox Items', data.mailbox.itemCount !== null ? String(data.mailbox.itemCount) : 'N/A'],
      ['AD Groups Count', String(data.groups.length)],
      ['AD Groups', data.groups.map((g) => g.cn).join('; ')],
    ];
    const csv = '\uFEFF' + ['Field,Value', ...rows.map(([k, v]) => `${esc(k)},${esc(v)}`)].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ad_user_report_${data.profile.samAccountName || 'user'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadUserJsonReport = () => {
    if (!data) return;
    const payload = {
      generatedAt: new Date().toISOString(),
      healthAssessment: reportSummary,
      userInspection: {
        ...data,
        profile: {
          ...data.profile,
          thumbnailPhotoDataUrl: data.profile.thumbnailPhotoDataUrl ? '[omitted-binary-photo]' : null,
        },
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ad_user_dossier_${data.profile.samAccountName || 'user'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadUserHtmlReport = () => {
    if (!data || !reportSummary) return;
    const dir = isEn ? 'ltr' : 'rtl';
    const lang = isEn ? 'en' : 'fa';
    const title = isEn
      ? `AD User Support Dossier — ${data.profile.displayName || data.profile.samAccountName}`
      : `گزارش جامع پشتیبانی کاربر دامین — ${data.profile.displayName || data.profile.samAccountName}`;

    const groupBadges = data.groups
      .map((g) => `<span class="badge">${escapeHtml(g.cn)}</span>`)
      .join(' ');
    const aliasRows = data.contact.emailAliases
      .map(
        (a) =>
          `<li><code>${escapeHtml(a.address)}</code> <strong>(${a.isPrimary ? (isEn ? 'Primary' : 'اصلی') : 'Alias'})</strong></li>`
      )
      .join('');
    const findingRows = reportSummary.findings
      .map(
        (f) => `
        <div class="finding ${escapeHtml(f.severity)}">
          <div class="finding-title">${escapeHtml(isEn ? f.titleEn : f.titleFa)}</div>
          <div class="finding-desc">${escapeHtml(isEn ? f.detailEn : f.detailFa)}</div>
        </div>`
      )
      .join('');

    const html = `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 28px; line-height: 1.55; }
    .sheet { max-width: 980px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15,23,42,0.06); }
    .hero { background: linear-gradient(135deg, #0f172a 0%, #0f766e 100%); color: #ffffff; padding: 26px 30px; display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; }
    .hero h1 { margin: 0 0 6px 0; font-size: 20px; }
    .hero p { margin: 0; opacity: 0.85; font-size: 12px; }
    .score { background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.28); padding: 12px 18px; border-radius: 12px; text-align: center; }
    .score .num { font-size: 26px; font-weight: 800; font-family: monospace; }
    .score .lbl { font-size: 11px; opacity: 0.9; }
    .section { padding: 22px 28px; border-top: 1px solid #e2e8f0; }
    .section h2 { margin: 0 0 14px 0; font-size: 14px; color: #0f766e; text-transform: uppercase; letter-spacing: 0.03em; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 13px; }
    .card .k { font-size: 11px; color: #64748b; margin-bottom: 4px; }
    .card .v { font-size: 13px; font-weight: 600; word-break: break-word; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    .badge { display: inline-block; padding: 3px 9px; margin: 2px; border-radius: 999px; background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 11px; font-family: monospace; }
    .finding { padding: 10px 14px; border-radius: 10px; margin-bottom: 8px; border: 1px solid #e2e8f0; }
    .finding.critical { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
    .finding.warning { background: #fffbeb; border-color: #fde68a; color: #92400e; }
    .finding.info { background: #eff6ff; border-color: #bfdbfe; color: #1e40af; }
    .finding.ok { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
    .finding-title { font-weight: 700; font-size: 13px; }
    .finding-desc { font-size: 12px; margin-top: 2px; opacity: 0.92; }
    .footer { padding: 14px 28px; background: #f1f5f9; font-size: 11px; color: #475569; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
    @media print { body { background: #fff; padding: 0; } .sheet { border: none; box-shadow: none; } }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="hero">
      <div>
        <h1>${escapeHtml(data.profile.displayName || data.profile.samAccountName)}</h1>
        <p>${escapeHtml([data.profile.jobTitle, data.profile.department, data.profile.company].filter(Boolean).join(' · ') || data.profile.samAccountName)}</p>
        <p style="margin-top:4px;font-family:monospace;">@${escapeHtml(data.profile.samAccountName)} · ${escapeHtml(data.profile.userPrincipalName || data.connectionInfo.domainName)}</p>
      </div>
      <div class="score">
        <div class="num">${reportSummary.score}/100</div>
        <div class="lbl">${escapeHtml(isEn ? 'Account Health Score' : 'امتیاز سلامت اکانت')}</div>
      </div>
    </div>

    <div class="section">
      <h2>${escapeHtml(isEn ? '1. Identity & Contact Directory' : '۱. هویت سازمانی و راه‌های ارتباطی')}</h2>
      <div class="grid">
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Full Name' : 'نام کامل')}</div><div class="v">${escapeHtml(data.profile.displayName || '-')}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Job Title / Dept' : 'سمت و دپارتمان')}</div><div class="v">${escapeHtml([data.profile.jobTitle, data.profile.department].filter(Boolean).join(' · ') || '-')}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Office / Employee ID' : 'محل کار / کد پرسنلی')}</div><div class="v">${escapeHtml([data.profile.office, data.profile.employeeId].filter(Boolean).join(' · ') || '-')}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Direct Manager' : 'مدیر مستقیم')}</div><div class="v">${escapeHtml(data.profile.manager?.displayName || '-')}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Internal Extensions' : 'تلفن داخلی')}</div><div class="v" dir="ltr">${escapeHtml(data.contact.internalPhones.join(', ') || '-')}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Mobile Numbers' : 'شماره‌های موبایل')}</div><div class="v" dir="ltr">${escapeHtml(data.contact.mobileNumbers.join(', ') || '-')}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Primary Email' : 'ایمیل اصلی')}</div><div class="v" dir="ltr">${escapeHtml(data.contact.primaryEmail || '-')}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'OU Path' : 'مسیر سازمانی (OU)')}</div><div class="v">${escapeHtml(data.profile.organizationalUnit || '-')}</div></div>
      </div>
      ${aliasRows ? `<ul style="margin:12px 0 0 0;padding-inline-start:18px;font-size:12px;">${aliasRows}</ul>` : ''}
    </div>

    <div class="section">
      <h2>${escapeHtml(isEn ? '2. Security, Lockout & Password Lifecycle' : '۲. امنیت، وضعیت قفل و عمر رمز عبور')}</h2>
      <div class="grid">
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Account Status' : 'فعال بودن اکانت')}</div><div class="v">${escapeHtml(data.security.accountEnabled ? (isEn ? 'Enabled' : 'فعال') : (isEn ? 'Disabled' : 'غیرفعال'))}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Lockout Status' : 'وضعیت قفل (Lockout)')}</div><div class="v">${escapeHtml(data.security.accountLocked ? (isEn ? 'LOCKED OUT' : 'قفل شده') : (isEn ? 'Unlocked' : 'باز'))}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Bad Password Count' : 'تلاش‌های ناموفق')}</div><div class="v">${escapeHtml(data.security.badPwdCount)}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Password Last Changed' : 'آخرین تغییر رمز')}</div><div class="v">${escapeHtml(formatDateDisplay(data.security.passwordLastSet, isEn))}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Password Expiration' : 'تاریخ انقضای رمز')}</div><div class="v">${escapeHtml(data.security.passwordNeverExpires ? (isEn ? 'Never Expires' : 'بدون انقضا') : formatDateDisplay(data.security.passwordExpiresAt, isEn))}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Last Domain Logon' : 'آخرین ورود به دامین')}</div><div class="v">${escapeHtml(formatDateDisplay(data.security.lastLogon, isEn))}</div></div>
      </div>
    </div>

    <div class="section">
      <h2>${escapeHtml(isEn ? '3. Exchange Mailbox & Storage Usage' : '۳. وضعیت میل‌باکس و فضای مصرفی Exchange')}</h2>
      <div class="grid">
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Used Space' : 'فضای استفاده‌شده')}</div><div class="v">${escapeHtml(data.mailbox.totalUsedBytes !== null ? formatBytesHuman(data.mailbox.totalUsedBytes, isEn) : (isEn ? 'Unavailable' : 'نامشخص'))}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Effective Quota' : 'سقف سهمیه مجاز')}</div><div class="v">${escapeHtml(data.mailbox.isUnlimitedQuota ? 'Unlimited' : formatBytesHuman(data.mailbox.effectiveQuotaBytes, isEn))}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Usage Percentage' : 'درصد مصرف')}</div><div class="v">${escapeHtml(data.mailbox.usedPercent !== null ? `${data.mailbox.usedPercent}%` : '-')}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Database / Server' : 'دیتابیس / سرور Exchange')}</div><div class="v" dir="ltr">${escapeHtml([data.mailbox.databaseName, data.mailbox.exchangeHostUsed || data.mailbox.serverName].filter(Boolean).join(' · ') || '-')}</div></div>
      </div>
    </div>

    <div class="section">
      <h2>${escapeHtml(isEn ? '4. Findings & Support Recommendations' : '۴. تحلیل و توصیه‌های پشتیبانی')}</h2>
      ${findingRows}
    </div>

    <div class="section">
      <h2>${escapeHtml(isEn ? `5. AD Group Memberships (${data.groups.length})` : `۵. عضویت گروه‌های اکتیو دایرکتوری (${data.groups.length})`)}</h2>
      <div>${groupBadges || escapeHtml(isEn ? 'None' : 'موردی ثبت نشده')}</div>
    </div>

    <div class="footer">
      <span>${escapeHtml(isEn ? 'Domain Controller:' : 'دامین کنترلر:')} <code>${escapeHtml(data.connectionInfo.domainController)}:${data.connectionInfo.port} (${escapeHtml(data.connectionInfo.method)})</code></span>
      <span>${escapeHtml(isEn ? 'Collected:' : 'زمان جمع‌آوری:')} ${escapeHtml(formatDateDisplay(data.collectedAt, isEn))}</span>
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ad_user_dossier_${data.profile.samAccountName || 'user'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const subTabs: Array<{
    id: HelpdeskUserSubTab;
    labelEn: string;
    labelFa: string;
    icon: React.ComponentType<{ className?: string }>;
    hasAlert?: boolean;
  }> = [
    {
      id: 'overview',
      labelEn: 'Profile, Role & Contact Info',
      labelFa: 'پروفایل سازمانی و راه‌های ارتباطی',
      icon: UserCheck,
    },
    {
      id: 'security',
      labelEn: 'Password, Lockout & Security',
      labelFa: 'رمز عبور، قفل اکانت و امنیت',
      icon: data?.security.accountLocked ? Lock : KeyRound,
      hasAlert: Boolean(data?.security.accountLocked || data?.security.passwordExpired),
    },
    {
      id: 'groups',
      labelEn: 'AD Groups & OU Directory',
      labelFa: 'گروه‌های اکتیو دایرکتوری و ساختار OU',
      icon: FolderTree,
    },
    {
      id: 'mailbox',
      labelEn: 'Mailbox Size & Exchange Quota',
      labelFa: 'حجم میل‌باکس و سهمیه Exchange',
      icon: Mail,
      hasAlert: Boolean(
        data?.mailbox.usedPercent !== null &&
          data?.mailbox.usedPercent !== undefined &&
          data.mailbox.usedPercent >= 90
      ),
    },
    {
      id: 'reports',
      labelEn: 'User Reports & Health Brief',
      labelFa: 'گزارش‌ها و تحلیل سلامت کاربر',
      icon: BarChart3,
    },
    {
      id: 'history',
      labelEn: 'Check History',
      labelFa: 'تاریخچه بررسی‌ها',
      icon: History,
    },
  ];

  const NavArrow = isEn ? ChevronRight : ChevronLeft;

  return (
    <div
      className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-6 pb-10"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <UserCog className="w-6 h-6 text-teal-500 shrink-0" />
            <h1 className={`text-xl font-bold tracking-tight ${textPrimary}`}>
              {isEn
                ? 'Active Directory & User Support HelpDesk'
                : 'هلپ‌دسک پشتیبانی کاربران و اکانت‌های دامین (User Support)'}
            </h1>
          </div>
          <p className={`mt-1 text-xs ${textMuted}`}>
            {isEn
              ? 'On-Demand Target User Lookup · Zero Stored Domain Passwords · Lockout Release, Password Expiry & Live Exchange Mailbox Quota'
              : 'پشتیبانی لحظه‌ای کاربر دامین بدون نیاز به IP سیستم · بدون ذخیره رمز عبور · بررسی پروفایل، وضعیت رمز، رفع قفل اکانت و حجم میل‌باکس'}
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

      {/* Top On-Demand Target User Connection Card */}
      <form
        onSubmit={handleSubmitInspect}
        className={`rounded-xl border p-4 sm:p-5 space-y-4 overflow-hidden ${surfaceBg}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold min-w-0">
            <UserCheck className="w-4 h-4 text-teal-500 shrink-0" />
            <span className={`truncate ${textPrimary}`}>
              {isEn ? 'On-Demand Target User' : 'اتصال و استعلام لحظه‌ای کاربر دامین (On-Demand Target User)'}
            </span>
            <FieldInfoTooltip
              isEn={isEn}
              isLightMode={isLightMode}
              fieldName={isEn ? 'On-Demand Target User' : 'استعلام لحظه‌ای کاربر دامین'}
              whatIsIt={
                isEn
                  ? 'Queries Active Directory directly via LDAPS/LDAP (or WinRM ADSI fallback) and Exchange Server for a single target user using ephemeral domain credentials.'
                  : 'با استفاده از نام کاربری هدف و اعتبارسنجی لحظه‌ای ادمین دامین، اطلاعات کامل اکتیو دایرکتوری، وضعیت پسورد، قفل اکانت و حجم میل‌باکس را مستقیماً دریافت می‌کند.'
              }
              whyNeeded={
                isEn
                  ? 'Enables HelpDesk engineers to inspect user contact numbers, unlock locked accounts, verify password expiration, and check mailbox quotas without needing the workstation IP.'
                  : 'به کارشناسان هلپ‌دسک امکان می‌دهد بدون نیاز به IP سیستم کاربر، شماره‌های تماس، تاریخ انقضای رمز، قفل اکانت و حجم ایمیل کاربر را بررسی و رفع اشکال کنند.'
              }
              example={
                isEn
                  ? 'Target: m.shahbazi or m.shahbazi@corp.local · Admin: CORP\\Administrator'
                  : 'نام کاربری هدف: m.shahbazi یا m.shahbazi@corp.local · ادمین دامین: CORP\\Administrator'
              }
            />
          </div>

          <div className={`text-[11px] flex flex-wrap items-center gap-3 ${textMuted}`}>
            <span>{isEn ? 'Domain credentials stay in RAM only' : 'رمز عبور فقط در حافظه موقت (RAM) می‌ماند'}</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() =>
                patchHelpdeskUserRamSnapshot((prev) => ({
                  showAdvancedConn: !prev.showAdvancedConn,
                }))
              }
              className="text-teal-500 hover:underline font-medium cursor-pointer"
            >
              {ram.showAdvancedConn
                ? isEn
                  ? 'Hide DC / Exchange Options'
                  : 'بستن تنظیمات دامین و میل‌سرور'
                : isEn
                ? 'DC / Exchange Options'
                : 'تنظیم دامین کنترلر / سرور Exchange'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          {/* Target Username (instead of IP) */}
          <div className="lg:col-span-4 min-w-0">
            <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
              {isEn ? 'Target Username / UPN / Email' : 'نام کاربری هدف (Username / UPN / Email)'}
            </label>
            <input
              type="text"
              dir="ltr"
              value={ram.targetUsername}
              onChange={(e) => patchHelpdeskUserRamSnapshot({ targetUsername: e.target.value })}
              placeholder="j.doe  or  CORP\j.doe  or  j.doe@corp.local"
              className={`w-full min-w-0 px-3 py-2 rounded-lg border text-xs font-mono outline-none transition ${inputCls}`}
              required
            />
          </div>

          {/* Ephemeral Domain Admin Username */}
          <div className="lg:col-span-3 min-w-0">
            <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
              {isEn ? 'Privileged Domain Username' : 'نام کاربری دامین با سطح دسترسی'}
            </label>
            <input
              type="text"
              dir="ltr"
              autoComplete="off"
              value={ram.adminUsername}
              onChange={(e) => patchHelpdeskUserRamSnapshot({ adminUsername: e.target.value })}
              placeholder="CORP\Administrator"
              className={`w-full min-w-0 px-3 py-2 rounded-lg border text-xs font-mono outline-none transition ${inputCls}`}
              required
            />
          </div>

          {/* Ephemeral Domain Admin Password */}
          <div className="lg:col-span-3 min-w-0">
            <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
              {isEn ? 'Domain Password (Ephemeral)' : 'رمز عبور دامین (موقت)'}
            </label>
            <div className="relative">
              <input
                ref={passwordInputRef}
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                value={ram.adminPassword}
                onChange={(e) => patchHelpdeskUserRamSnapshot({ adminPassword: e.target.value })}
                placeholder="••••••••••••"
                className={`w-full min-w-0 px-3 py-2 rounded-lg border text-xs font-mono outline-none transition pe-9 ${inputCls}`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className={`absolute top-1/2 -translate-y-1/2 end-2.5 p-1 ${textMuted} hover:text-teal-500 cursor-pointer`}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Primary Action + Wipe */}
          <div className="md:col-span-2 lg:col-span-2 min-w-0 flex items-center gap-2">
            <button
              type="submit"
              disabled={!canInspectUsers || ram.loading || Boolean(ram.prefetchProgress?.active)}
              className="flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition whitespace-nowrap cursor-pointer"
            >
              {ram.loading || ram.prefetchProgress?.active ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Search className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">{isEn ? 'Connect & Inspect' : 'اتصال و پایش'}</span>
            </button>
            <button
              type="button"
              onClick={() => wipeHelpdeskUserRamSession()}
              title={
                isEn
                  ? 'Wipe target user, credentials & results from RAM'
                  : 'پاک‌سازی فوری اطلاعات کاربر، رمز و نتایج از حافظه'
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

        {ram.prefetchProgress?.active && (
          <div
            className={`px-3 py-2 rounded-lg border flex flex-wrap items-center justify-between gap-2 text-xs ${
              isLightMode
                ? 'bg-sky-50 border-sky-200 text-sky-900'
                : 'bg-sky-950/30 border-sky-500/30 text-sky-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin shrink-0" />
              <span>
                {isEn
                  ? `Fetching all tabs sequentially (${ram.prefetchProgress.step}/${ram.prefetchProgress.total}): ${ram.prefetchProgress.labelEn}...`
                  : `در حال دریافت خودکار اطلاعات تب‌ها به ترتیب (${ram.prefetchProgress.step} از ${ram.prefetchProgress.total}): ${ram.prefetchProgress.labelFa}...`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => stopHelpdeskUserPrefetch()}
              className="px-2 py-0.5 rounded border border-sky-500/40 hover:bg-sky-500/15 text-[11px] font-semibold cursor-pointer"
            >
              {isEn ? 'Stop' : 'توقف'}
            </button>
          </div>
        )}

        {/* Collapsible DC & Exchange Server Connection Options */}
        {ram.showAdvancedConn && (
          <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t ${isLightMode ? 'border-slate-200' : 'border-slate-800'}`}>
            <div>
              <label className={`flex items-center gap-1.5 text-xs font-medium mb-1.5 ${textMuted}`}>
                <span>{isEn ? 'Domain Controller Host/IP (Optional)' : 'آدرس دامین کنترلر (اختیاری)'}</span>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  fieldName={isEn ? 'Domain Controller Override' : 'آدرس دامین کنترلر'}
                  whatIsIt={
                    isEn
                      ? 'Optional hostname or IP of a specific Domain Controller.'
                      : 'نام یا آدرس IP یک دامین کنترلر مشخص برای استعلام مستقیم LDAP.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Leave blank to use the panel’s saved AD server or automatic DNS SRV discovery; fill in if querying a specific DC or remote domain.'
                      : 'در صورت خالی ماندن، سیستم به صورت خودکار از تنظیمات AD پنل یا رکورد DNS SRV دامین کنترلر را پیدا می‌کند.'
                  }
                  example="dc01.corp.local or 192.168.10.10"
                />
              </label>
              <input
                type="text"
                dir="ltr"
                value={ram.domainController}
                onChange={(e) => patchHelpdeskUserRamSnapshot({ domainController: e.target.value })}
                placeholder={isEn ? 'Auto-discover via AD config / DNS' : 'شناسایی خودکار (AD / DNS)'}
                className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none transition ${inputCls}`}
              />
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
                {isEn ? 'Directory Protocol' : 'پروتکل دایرکتوری (LDAP)'}
              </label>
              <select
                value={ram.ldapProtocol}
                onChange={(e) =>
                  patchHelpdeskUserRamSnapshot({
                    ldapProtocol: e.target.value as 'auto' | 'ldaps' | 'ldap',
                  })
                }
                className={`w-full px-3 py-2 rounded-lg border text-xs outline-none transition ${inputCls}`}
              >
                <option value="auto">{isEn ? 'Auto (LDAPS 636 → LDAP 389)' : 'خودکار (LDAPS 636 ← LDAP 389)'}</option>
                <option value="ldaps">LDAPS (TLS 636)</option>
                <option value="ldap">LDAP (389)</option>
              </select>
            </div>

            <div>
              <label className={`flex items-center gap-1.5 text-xs font-medium mb-1.5 ${textMuted}`}>
                <span>{isEn ? 'Exchange Server Host/IP (Optional)' : 'سرور Exchange (اختیاری)'}</span>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  fieldName={isEn ? 'Exchange Server Host' : 'آدرس سرور Exchange'}
                  whatIsIt={
                    isEn
                      ? 'FQDN or IP of your on-premises Microsoft Exchange server for live mailbox usage queries. Defaults automatically to mail.<public_domain> or mail.<user_email_domain>.'
                      : 'نام دامنه یا آدرس IP سرور مایکروسافت Exchange جهت استعلام زنده حجم میل‌باکس. به صورت خودکار به mail.<دامنه_عمومی یا دامنه_ایمیل_کاربر> مقداردهی می‌شود.'
                  }
                  whyNeeded={
                    isEn
                      ? 'AD alone stores quota limits but not live TotalItemSize; this tells the panel which Exchange server to query via Remote PowerShell using your public mail subdomain.'
                      : 'اکتیو دایرکتوری فقط سقف سهمیه را دارد اما حجم مصرفی لحظه‌ای از طریق Exchange PowerShell دریافت می‌شود (در دامنه‌های .local داخلی از دامنه عمومی یا ایمیل ثبت‌شده خود کاربر استفاده می‌شود).'
                  }
                  example="mail.company.com or 192.168.10.25"
                />
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  dir="ltr"
                  value={ram.exchangeServer}
                  onChange={(e) =>
                    patchHelpdeskUserRamSnapshot({
                      exchangeServer: e.target.value,
                      exchangeServerEditedManually: e.target.value.trim().length > 0,
                    })
                  }
                  placeholder={hintedExchangeHost || 'mail.company.com'}
                  className={`w-full min-w-0 px-3 py-2 rounded-lg border text-xs font-mono outline-none transition ${inputCls}`}
                />
                {ram.exchangeServerEditedManually && hintedExchangeHost && (
                  <button
                    type="button"
                    onClick={() =>
                      patchHelpdeskUserRamSnapshot({
                        exchangeServer: hintedExchangeHost,
                        exchangeServerEditedManually: false,
                      })
                    }
                    title={isEn ? `Reset to ${hintedExchangeHost}` : `بازگشت به پیش‌فرض ${hintedExchangeHost}`}
                    className={`shrink-0 p-2 rounded-lg border text-xs transition cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
                {isEn ? 'Exchange / WinRM Transport' : 'پروتکل ارتباطی Exchange / WinRM'}
              </label>
              <select
                value={ram.winrmProtocol}
                onChange={(e) =>
                  patchHelpdeskUserRamSnapshot({ winrmProtocol: e.target.value as any })
                }
                className={`w-full px-3 py-2 rounded-lg border text-xs outline-none transition ${inputCls}`}
              >
                <option value="auto">{isEn ? 'Auto (5986 → 5985 → 445)' : 'خودکار (5986 ← 5985 ← 445)'}</option>
                <option value="winrm_https">WinRM HTTPS (5986)</option>
                <option value="winrm_http">WinRM HTTP (5985)</option>
                <option value="smb_rpc">SMB / RPC (445)</option>
              </select>
            </div>
          </div>
        )}

        {/* Recent Inspected Users Strip (RAM-only quick switch) */}
        {ram.recentUsers.length > 0 && (
          <div className={`flex flex-wrap items-center gap-2 pt-2 border-t text-xs ${isLightMode ? 'border-slate-200' : 'border-slate-800'}`}>
            <span className={`text-[11px] font-medium ${textMuted}`}>
              {isEn ? 'Recent in session:' : 'کاربران اخیر این نشست:'}
            </span>
            {ram.recentUsers.map((u) => {
              const isCurrent =
                data?.profile.samAccountName.toLowerCase() === u.samAccountName.toLowerCase();
              return (
                <button
                  key={u.samAccountName}
                  type="button"
                  onClick={() => handleInspectRelatedPerson(u.samAccountName)}
                  disabled={ram.loading}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium transition cursor-pointer ${
                    isCurrent
                      ? isLightMode
                        ? 'bg-teal-50 border-teal-300 text-teal-800'
                        : 'bg-teal-950/50 border-teal-500/40 text-teal-300'
                      : isLightMode
                      ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                      : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      u.accountLocked ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                  />
                  <span>{u.displayName}</span>
                  <span className={`font-mono text-[10px] ${textMuted}`}>({u.samAccountName})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Persistent Active Target User Identity Strip */}
        {data && (
          <div
            className={`rounded-lg border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs ${
              data.security.accountLocked
                ? isLightMode
                  ? 'bg-rose-50/70 border-rose-200'
                  : 'bg-rose-950/25 border-rose-500/35'
                : isLightMode
                ? 'bg-teal-50/70 border-teal-200'
                : 'bg-teal-950/20 border-teal-500/30'
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    !data.security.accountEnabled
                      ? 'bg-slate-400'
                      : data.security.accountLocked
                      ? 'bg-rose-500 animate-pulse'
                      : 'bg-emerald-500'
                  }`}
                />
                <span className={`font-bold ${textPrimary}`}>{data.profile.displayName}</span>
                <span className={`font-mono ${textMuted}`} dir="ltr">
                  @{data.profile.samAccountName}
                </span>
              </div>

              {(data.profile.jobTitle || data.profile.department) && (
                <div className={`flex items-center gap-1.5 ${textSecondary}`}>
                  <Briefcase className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                  <span>
                    {[data.profile.jobTitle, data.profile.department].filter(Boolean).join(' · ')}
                  </span>
                </div>
              )}

              {data.contact.primaryEmail && (
                <div className={`flex items-center gap-1.5 font-mono ${textSecondary}`} dir="ltr">
                  <Mail className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  <span>{data.contact.primaryEmail}</span>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                {data.security.accountLocked ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/15 text-rose-500 font-bold text-[11px]">
                    <Lock className="w-3 h-3" />
                    {isEn ? 'Account Locked Out' : 'اکانت قفل شده است'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500 font-semibold text-[11px]">
                    <Unlock className="w-3 h-3" />
                    {isEn ? 'Unlocked' : 'باز (Unlocked)'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <KeyRound
                  className={`w-3.5 h-3.5 shrink-0 ${
                    data.security.passwordExpired ? 'text-rose-500' : 'text-amber-500'
                  }`}
                />
                <span className={data.security.passwordExpired ? 'text-rose-500 font-semibold' : textSecondary}>
                  {data.security.passwordNeverExpires
                    ? isEn
                      ? 'Pwd: Never Expires'
                      : 'رمز: بدون انقضا'
                    : data.security.passwordExpired
                    ? isEn
                      ? 'Pwd: EXPIRED'
                      : 'رمز: منقضی‌شده'
                    : pwdDaysRemaining !== null
                    ? isEn
                      ? `Pwd: ${pwdDaysRemaining}d left`
                      : `رمز: ${pwdDaysRemaining} روز مانده`
                    : isEn
                    ? 'Pwd: Active'
                    : 'رمز: فعال'}
                </span>
              </div>

              {data.mailbox.hasMailbox && (
                <div className={`flex items-center gap-1.5 font-mono tabular-nums ${textSecondary}`}>
                  <HardDrive className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>
                    {data.mailbox.totalUsedBytes !== null
                      ? `${formatBytesHuman(data.mailbox.totalUsedBytes, isEn)}${
                          data.mailbox.effectiveQuotaBytes
                            ? ` / ${formatBytesHuman(data.mailbox.effectiveQuotaBytes, isEn)} (${data.mailbox.usedPercent ?? 0}%)`
                            : ''
                        }`
                      : data.mailbox.effectiveQuotaBytes
                      ? `${isEn ? 'Quota:' : 'سهمیه:'} ${formatBytesHuman(data.mailbox.effectiveQuotaBytes, isEn)}`
                      : isEn
                      ? 'Mailbox Ready'
                      : 'میل‌باکس فعال'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {data.security.accountLocked && canUnlockAccount && (
                <button
                  type="button"
                  onClick={() => patchHelpdeskUserRamSnapshot({ activeSubTab: 'security' })}
                  className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
                >
                  <Unlock className="w-3 h-3" />
                  <span>{isEn ? 'Go to Unlock' : 'رفع قفل اکانت'}</span>
                </button>
              )}
              <span className={`font-mono text-[11px] ${textMuted}`} dir="ltr">
                {data.connectionInfo.method.toUpperCase()} · {data.connectionInfo.domainController}:{data.connectionInfo.port}
              </span>
            </div>
          </div>
        )}
        {reinspectBanner && (
          <div
            className={`rounded-lg border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs ${
              isLightMode
                ? 'bg-sky-50 border-sky-200 text-sky-900'
                : 'bg-sky-950/35 border-sky-500/40 text-sky-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-sky-500 shrink-0" />
              <span>
                {isEn
                  ? `Target user "${reinspectBanner.targetUsername}" loaded from Check History. Enter your domain admin credentials above and click Connect & Inspect.`
                  : `نام کاربری «${reinspectBanner.targetUsername}» از تاریخچه بارگذاری شد. نام کاربری و رمز ادمین دامین را در کادر بالا وارد کرده و «اتصال و پایش» را بزنید.`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReinspectBanner(null)}
              className="p-1 opacity-75 hover:opacity-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </form>

      {/* Main Inspection Error Banner */}
      {ram.error && (
        <div
          className={`rounded-xl border p-4 space-y-2 ${
            isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-rose-950/35 border-rose-500/40 text-rose-200'
          }`}
        >
          <div className="flex items-start gap-2.5 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="font-bold">
                {isEn ? 'Active Directory Lookup Failed' : 'خطا در استعلام کاربر از اکتیو دایرکتوری'}
              </div>
              <div className="break-words opacity-90">{ram.error}</div>
            </div>
          </div>
          <TimeoutAntivirusHint
            errorText={ram.error}
            isEn={isEn}
            isLightMode={isLightMode}
            canViewSecurityAv={Boolean(onNavigateToEndpointHelpdesk)}
            canControlAntivirus={canUnlockAccount}
            onGoToAntivirus={onNavigateToEndpointHelpdesk}
          />
        </div>
      )}

      {/* Unlock Result / Error Feedback */}
      {ram.unlockResult && (
        <div
          className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 text-xs ${
            ram.unlockResult.unlocked
              ? isLightMode
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-emerald-950/35 border-emerald-500/40 text-emerald-200'
              : isLightMode
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-amber-950/35 border-amber-500/40 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {ram.unlockResult.unlocked ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            <span className="font-medium">
              {isEn ? ram.unlockResult.message : ram.unlockResult.messageFa}
            </span>
          </div>
          <span className={`font-mono text-[11px] shrink-0 ${textMuted}`} dir="ltr">
            {ram.unlockResult.methodUsed}
          </span>
        </div>
      )}

      {ram.unlockError && (
        <div
          className={`rounded-xl border px-4 py-3 flex items-start gap-2.5 text-xs ${
            isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-rose-950/35 border-rose-500/40 text-rose-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <span className="break-words">{ram.unlockError}</span>
        </div>
      )}

      {/* Segmented Workspace Navigation Tabs (Always Visible — Unified Teal Active Theme Matching Group HelpDesk) */}
      <div
        className={`flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl border ${
          isLightMode ? 'bg-slate-100/90 border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}
      >
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const active = ram.activeSubTab === tab.id;
          const isFetchingThisTab =
            (ram.prefetchProgress?.active && ram.prefetchProgress.currentTab === tab.id) ||
            (tab.id === 'overview' && ram.loadingOverview) ||
            (tab.id === 'security' && ram.loadingSecurity) ||
            (tab.id === 'groups' && ram.loadingGroups) ||
            (tab.id === 'mailbox' && ram.mailboxLoading);
          const hasTabData =
            (tab.id === 'overview' && Boolean(data && ram.overviewLoaded)) ||
            (tab.id === 'security' && Boolean(data && ram.securityLoaded)) ||
            (tab.id === 'groups' && Boolean(data && ram.groupsLoaded)) ||
            (tab.id === 'mailbox' && Boolean(data && ram.mailboxLoaded)) ||
            (tab.id === 'reports' && Boolean(data && ram.overviewLoaded));
          const hasAlertDot = Boolean(tab.hasAlert && data);

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                patchHelpdeskUserRamSnapshot({ activeSubTab: tab.id });
                if (
                  tab.id === 'mailbox' &&
                  data &&
                  !ram.prefetchProgress?.active &&
                  !ram.mailboxLoaded &&
                  !ram.mailboxLoading
                ) {
                  runHelpdeskUserMailboxRefresh();
                }
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                hasAlertDot
                  ? active
                    ? 'bg-rose-600 text-white shadow-sm'
                    : isLightMode
                    ? 'bg-rose-50/80 text-rose-700 border border-rose-200 hover:bg-rose-100'
                    : 'bg-rose-950/40 text-rose-300 border border-rose-500/40 hover:bg-rose-950/65'
                  : active
                  ? 'bg-teal-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-white hover:text-slate-900'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              {isFetchingThisTab ? (
                <Loader2 className={`w-3.5 h-3.5 animate-spin ${active ? 'text-white' : 'text-teal-500'}`} />
              ) : (
                <Icon
                  className={`w-3.5 h-3.5 ${
                    active ? 'text-white' : hasAlertDot ? 'text-rose-500' : ''
                  }`}
                />
              )}
              <span>{isEn ? tab.labelEn : tab.labelFa}</span>
              {!isFetchingThisTab && hasAlertDot ? (
                <span
                  className={`w-2 h-2 rounded-full animate-pulse shrink-0 ${
                    active ? 'bg-white' : 'bg-rose-500'
                  }`}
                />
              ) : (
                !isFetchingThisTab &&
                hasTabData && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      active ? 'bg-emerald-300 ring-1 ring-white/40' : 'bg-emerald-500'
                    }`}
                  />
                )
              )}
            </button>
          );
        })}

        {data && (
          <button
            type="button"
            disabled={ram.loading || Boolean(ram.prefetchProgress?.active)}
            onClick={() => runHelpdeskUserInspect()}
            className={`ms-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap cursor-pointer disabled:opacity-50 ${
              isLightMode
                ? 'bg-white hover:bg-slate-50 text-slate-700 shadow-xs'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 shadow-xs'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-500 ${ram.prefetchProgress?.active ? 'animate-spin' : ''}`} />
            <span>{isEn ? 'Refresh All' : 'بروزرسانی'}</span>
          </button>
        )}
      </div>

      {/* Pre-Connection Empty Prompt inside Active Tab Workspace (not shown on History tab) */}
      {ram.activeSubTab !== 'history' && !data && !ram.loading && (
        <div className={`rounded-xl border p-8 sm:p-10 text-center space-y-3 ${surfaceBg}`}>
          <div
            className={`w-12 h-12 mx-auto rounded-2xl border flex items-center justify-center ${
              isLightMode
                ? 'bg-sky-50 border-sky-200 text-sky-600'
                : 'bg-sky-950/40 border-sky-500/30 text-sky-400'
            }`}
          >
            <UserCog className="w-6 h-6" />
          </div>
          <div className="max-w-xl mx-auto space-y-1.5">
            <h2 className={`text-sm font-bold ${textPrimary}`}>
              {ram.activeSubTab === 'overview'
                ? isEn
                  ? 'Enter a Target Username Above to Inspect Profile, Extensions & Mobile Numbers'
                  : 'برای مشاهده نام کامل، سمت، دپارتمان، تلفن داخلی، موبایل‌ها و ایمیل، کاربر هدف را در بالا متصل کنید'
                : ram.activeSubTab === 'security'
                ? isEn
                  ? 'Password Expiry, Lockout Status & Account Unlock'
                  : 'بررسی تاریخ تعویض رمز، وضعیت انقضا و خارج کردن اکانت از حالت قفل (Unlock)'
                : ram.activeSubTab === 'groups'
                ? isEn
                  ? 'Active Directory Group Memberships & OU Structure'
                  : 'مشاهده عضویت گروه‌های اکتیو دایرکتوری و واحد سازمانی کاربر'
                : ram.activeSubTab === 'reports'
                ? isEn
                  ? 'User Support Diagnostic Reports & Printable Dossier'
                  : 'تولید گزارش تحلیلی، چک‌لیست وضعیت سلامت و خروجی چاپی/CSV/HTML کاربر'
                : isEn
                ? 'Exchange Mailbox Capacity & Live Usage Statistics'
                : 'مشاهده حجم کل میل‌باکس، فضای استفاده‌شده و سهمیه‌های سرور Exchange'}
            </h2>
            <p className={`text-xs leading-relaxed ${textMuted}`}>
              {isEn
                ? 'Click Connect & Inspect to load all tabs sequentially (Active Directory profile, password/lockout policy, AD groups, and Exchange mailbox usage using mail.<public_domain> by default).'
                : 'پس از وارد کردن نام کاربری هدف و مشخصات دامین، با زدن «اتصال و پایش» اطلاعات تب‌ها به صورت نوبتی و مرحله‌به‌مرحله بارگذاری می‌شود.'}
            </p>
          </div>
        </div>
      )}

      {/* Initial AD Connection Loading State (before Step 1 data arrives) */}
      {ram.activeSubTab !== 'history' && !data && ram.loading && (
        <div className={`rounded-xl border p-8 flex items-center justify-center gap-3 text-xs ${surfaceBg}`}>
          <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
          <span className={`font-medium ${textPrimary}`}>
            {isEn
              ? 'Step 1/4: Connecting to Active Directory to inspect user profile & contacts...'
              : 'مرحله ۱ از ۴: در حال اتصال به اکتیو دایرکتوری و دریافت مشخصات پروفایل کاربر...'}
          </span>
        </div>
      )}

      {/* Active Connected Tab Workspace */}
      {data && ram.activeSubTab !== 'history' && (
        <>

          {/* ================================================================
              TAB 1: OVERVIEW, ORGANIZATIONAL ROLE & CONTACT NUMBERS / EMAIL
              ================================================================ */}
          {ram.activeSubTab === 'overview' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              {/* Identity Hero + Organization Column */}
              <div className="xl:col-span-7 space-y-4">
                <div className={`rounded-xl border p-5 space-y-5 ${surfaceBg}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Avatar */}
                    {data.profile.thumbnailPhotoDataUrl ? (
                      <img
                        src={data.profile.thumbnailPhotoDataUrl}
                        alt={data.profile.displayName}
                        className="w-16 h-16 rounded-2xl object-cover border border-teal-500/30 shrink-0"
                      />
                    ) : (
                      <div
                        className={`w-16 h-16 rounded-2xl border flex items-center justify-center text-xl font-bold shrink-0 ${
                          isLightMode
                            ? 'bg-teal-50 border-teal-200 text-teal-700'
                            : 'bg-teal-950/40 border-teal-500/30 text-teal-300'
                        }`}
                      >
                        {getInitials(data.profile.displayName, data.profile.samAccountName)}
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className={`text-lg font-bold ${textPrimary}`}>
                          {data.profile.displayName || data.profile.samAccountName}
                        </h2>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            data.security.accountEnabled
                              ? 'bg-emerald-500/15 text-emerald-500'
                              : 'bg-slate-500/20 text-slate-400'
                          }`}
                        >
                          {data.security.accountEnabled
                            ? isEn
                              ? 'Active Account'
                              : 'حساب فعال'
                            : isEn
                            ? 'Disabled Account'
                            : 'حساب غیرفعال'}
                        </span>
                        {data.security.accountLocked && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-500 flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            {isEn ? 'Locked Out' : 'قفل‌شده'}
                          </span>
                        )}
                      </div>

                      <div className={`text-xs flex flex-wrap items-center gap-x-3 gap-y-1 ${textMuted}`}>
                        <span className="font-mono" dir="ltr">
                          {data.profile.samAccountName}
                        </span>
                        {data.profile.userPrincipalName && (
                          <>
                            <span>·</span>
                            <span className="font-mono" dir="ltr">
                              {data.profile.userPrincipalName}
                            </span>
                          </>
                        )}
                      </div>

                      {data.profile.description && (
                        <p className={`text-xs pt-0.5 ${textSecondary}`}>{data.profile.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Full Name Breakdown & Organizational Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                      {
                        label: isEn ? 'Full Name (Display Name)' : 'نام و نام خانوادگی کامل',
                        value: data.profile.displayName,
                        icon: UserCheck,
                      },
                      {
                        label: isEn ? 'First / Last Name' : 'نام / نام خانوادگی تفکیکی',
                        value:
                          [data.profile.firstName, data.profile.middleName, data.profile.lastName]
                            .filter(Boolean)
                            .join(' ') || data.profile.cn,
                        icon: UserCheck,
                      },
                      {
                        label: isEn ? 'Job Title / Position' : 'سمت سازمانی (Job Title)',
                        value: data.profile.jobTitle,
                        icon: Briefcase,
                      },
                      {
                        label: isEn ? 'Department' : 'دپارتمان / واحد سازمانی',
                        value: data.profile.department,
                        icon: Building2,
                      },
                      {
                        label: isEn ? 'Company / Division' : 'سازمان / بخش',
                        value: [data.profile.company, data.profile.division].filter(Boolean).join(' · '),
                        icon: Building2,
                      },
                      {
                        label: isEn ? 'Office / Location' : 'دفتر / محل استقرار',
                        value: data.profile.office,
                        icon: MapPin,
                      },
                      {
                        label: isEn ? 'Employee ID' : 'کد پرسنلی (Employee ID)',
                        value: data.profile.employeeId || data.profile.employeeNumber,
                        icon: Hash,
                        mono: true,
                      },
                      {
                        label: isEn ? 'Organizational Unit (OU)' : 'واحد ساختاری (OU)',
                        value: data.profile.organizationalUnit,
                        icon: FolderTree,
                      },
                      {
                        label: isEn ? 'Domain' : 'دامین',
                        value: data.connectionInfo.domainName,
                        icon: Server,
                        mono: true,
                      },
                    ].map((field, idx) => {
                      const FIcon = field.icon;
                      return (
                        <div key={idx} className={`rounded-lg border p-3 ${subSurfaceBg}`}>
                          <div className={`flex items-center gap-1.5 text-[11px] mb-1 ${textMuted}`}>
                            <FIcon className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                            <span>{field.label}</span>
                          </div>
                          <div
                            className={`text-xs font-semibold break-words ${
                              field.mono ? 'font-mono' : ''
                            } ${field.value ? textPrimary : textMuted}`}
                          >
                            {field.value || (isEn ? 'Not set' : 'ثبت نشده')}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {data.profile.notes && (
                    <div className={`rounded-lg border p-3 text-xs ${subSurfaceBg}`}>
                      <div className={`text-[11px] font-medium mb-1 ${textMuted}`}>
                        {isEn ? 'Directory Notes (info)' : 'توضیحات تکمیلی پروفایل'}
                      </div>
                      <div className={`whitespace-pre-wrap ${textSecondary}`}>{data.profile.notes}</div>
                    </div>
                  )}
                </div>

                {/* Manager & Direct Reports */}
                <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Users className="w-4 h-4 text-indigo-500" />
                    <span className={textPrimary}>
                      {isEn ? 'Reporting Hierarchy (Manager & Direct Reports)' : 'سلسله‌مراتب سازمانی (مدیر مستقیم و زیرمجموعه‌ها)'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Direct Manager */}
                    <div className={`rounded-lg border p-3.5 space-y-2 ${subSurfaceBg}`}>
                      <div className={`text-[11px] font-medium ${textMuted}`}>
                        {isEn ? 'Direct Manager' : 'مدیر مستقیم'}
                      </div>
                      {data.profile.manager ? (
                        <button
                          type="button"
                          onClick={() =>
                            data.profile.manager?.samAccountName &&
                            handleInspectRelatedPerson(data.profile.manager.samAccountName)
                          }
                          disabled={!data.profile.manager.samAccountName}
                          className={`w-full text-start flex items-center justify-between gap-2 rounded-lg p-2 border transition cursor-pointer ${
                            isLightMode
                              ? 'bg-white hover:bg-teal-50 border-slate-200'
                              : 'bg-slate-900 hover:bg-slate-800 border-slate-800'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className={`text-xs font-bold truncate ${textPrimary}`}>
                              {data.profile.manager.displayName}
                            </div>
                            <div className={`text-[11px] truncate ${textMuted}`}>
                              {[data.profile.manager.title, data.profile.manager.department]
                                .filter(Boolean)
                                .join(' · ') || data.profile.manager.samAccountName}
                            </div>
                          </div>
                          {data.profile.manager.samAccountName && (
                            <NavArrow className="w-4 h-4 text-teal-500 shrink-0" />
                          )}
                        </button>
                      ) : (
                        <div className={`text-xs ${textMuted}`}>
                          {isEn ? 'No manager assigned in AD' : 'مدیر مستقیم در اکتیو دایرکتوری ثبت نشده است'}
                        </div>
                      )}
                    </div>

                    {/* Direct Reports */}
                    <div className={`rounded-lg border p-3.5 space-y-2 ${subSurfaceBg}`}>
                      <div className={`text-[11px] font-medium flex items-center justify-between ${textMuted}`}>
                        <span>{isEn ? 'Direct Reports' : 'افراد تحت سرپرستی'}</span>
                        <span className="font-mono">{data.profile.directReports.length}</span>
                      </div>
                      {data.profile.directReports.length > 0 ? (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pe-1">
                          {data.profile.directReports.map((rep, idx) => (
                            <button
                              key={rep.dn || idx}
                              type="button"
                              onClick={() =>
                                rep.samAccountName && handleInspectRelatedPerson(rep.samAccountName)
                              }
                              disabled={!rep.samAccountName}
                              className={`w-full text-start flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 border text-xs transition cursor-pointer ${
                                isLightMode
                                  ? 'bg-white hover:bg-teal-50 border-slate-200'
                                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800'
                              }`}
                            >
                              <div className="min-w-0 truncate">
                                <span className={`font-semibold ${textPrimary}`}>{rep.displayName}</span>
                                {rep.title && (
                                  <span className={`ms-1.5 text-[11px] ${textMuted}`}>· {rep.title}</span>
                                )}
                              </div>
                              {rep.samAccountName && (
                                <NavArrow className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className={`text-xs ${textMuted}`}>
                          {isEn ? 'No direct reports' : 'بدون زیرمجموعه مستقیم'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Numbers & Email Addresses Column */}
              <div className="xl:col-span-5 space-y-4">
                {/* Internal Extensions & Mobile Numbers Card */}
                <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Phone className="w-4 h-4 text-emerald-500" />
                      <span className={textPrimary}>
                        {isEn ? 'Phones, Extensions & Mobile Numbers' : 'شماره‌های تماس داخلی و تمام شماره‌های موبایل'}
                      </span>
                    </div>
                  </div>

                  {/* Internal Extensions */}
                  <div className={`rounded-lg border p-3.5 space-y-2.5 ${subSurfaceBg}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold flex items-center gap-1.5 ${textSecondary}`}>
                        <Phone className="w-3.5 h-3.5 text-sky-500" />
                        {isEn ? 'Internal Extensions / Office Phones' : 'شماره تماس داخلی / تلفن اداری'}
                      </span>
                      <span className={`text-[11px] font-mono ${textMuted}`}>
                        {data.contact.internalPhones.length}
                      </span>
                    </div>
                    {data.contact.internalPhones.length > 0 ? (
                      <div className="space-y-1.5">
                        {data.contact.internalPhones.map((phone, idx) => (
                          <div
                            key={`${phone}-${idx}`}
                            className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${
                              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                            }`}
                          >
                            <span className={`text-xs font-mono font-bold tabular-nums ${textPrimary}`} dir="ltr">
                              {phone}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(phone, `ext-${idx}`)}
                              className={`p-1 rounded hover:bg-teal-500/15 transition cursor-pointer ${textMuted}`}
                              title={isEn ? 'Copy number' : 'کپی شماره'}
                            >
                              {copiedKey === `ext-${idx}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={`text-xs ${textMuted}`}>
                        {isEn
                          ? 'No internal extension or IP phone recorded in AD (telephoneNumber / otherTelephone / ipPhone).'
                          : 'هیچ شماره داخلی یا تلفن اداری در AD ثبت نشده است.'}
                      </div>
                    )}
                  </div>

                  {/* ALL Mobile Numbers */}
                  <div className={`rounded-lg border p-3.5 space-y-2.5 ${subSurfaceBg}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold flex items-center gap-1.5 ${textSecondary}`}>
                        <Smartphone className="w-3.5 h-3.5 text-teal-500" />
                        {isEn ? 'All Registered Mobile Numbers' : 'تمامی شماره‌های موبایل ثبت‌شده (Mobile & OtherMobile)'}
                      </span>
                      <span className={`text-[11px] font-mono ${textMuted}`}>
                        {data.contact.mobileNumbers.length}
                      </span>
                    </div>
                    {data.contact.mobileNumbers.length > 0 ? (
                      <div className="space-y-1.5">
                        {data.contact.mobileNumbers.map((mob, idx) => (
                          <div
                            key={`${mob}-${idx}`}
                            className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${
                              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-xs font-mono font-bold tabular-nums ${textPrimary}`} dir="ltr">
                                {mob}
                              </span>
                              {idx === 0 && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-teal-500/15 text-teal-500">
                                  {isEn ? 'Primary' : 'اصلی'}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopy(mob, `mob-${idx}`)}
                              className={`p-1 rounded hover:bg-teal-500/15 transition cursor-pointer ${textMuted}`}
                              title={isEn ? 'Copy mobile number' : 'کپی شماره موبایل'}
                            >
                              {copiedKey === `mob-${idx}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={`text-xs ${textMuted}`}>
                        {isEn
                          ? 'No mobile numbers recorded in AD (mobile / otherMobile).'
                          : 'هیچ شماره موبایلی در فیلدهای mobile / otherMobile اکتیو دایرکتوری ثبت نشده است.'}
                      </div>
                    )}
                  </div>

                  {/* Additional Phones / Fax / Web */}
                  {(data.contact.homePhones.length > 0 || data.contact.faxNumber || data.contact.webPage) && (
                    <div className={`rounded-lg border p-3 text-xs space-y-1.5 ${subSurfaceBg}`}>
                      {data.contact.homePhones.length > 0 && (
                        <div className="flex justify-between gap-2">
                          <span className={textMuted}>{isEn ? 'Home Phone:' : 'تلفن منزل:'}</span>
                          <span className={`font-mono ${textPrimary}`} dir="ltr">
                            {data.contact.homePhones.join(', ')}
                          </span>
                        </div>
                      )}
                      {data.contact.faxNumber && (
                        <div className="flex justify-between gap-2">
                          <span className={textMuted}>{isEn ? 'Fax:' : 'فکس:'}</span>
                          <span className={`font-mono ${textPrimary}`} dir="ltr">
                            {data.contact.faxNumber}
                          </span>
                        </div>
                      )}
                      {data.contact.webPage && (
                        <div className="flex justify-between gap-2">
                          <span className={textMuted}>{isEn ? 'Web Page:' : 'وب‌سایت:'}</span>
                          <span className={`font-mono truncate ${textPrimary}`} dir="ltr">
                            {data.contact.webPage}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Email Addresses & SMTP Aliases Card */}
                <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Mail className="w-4 h-4 text-sky-500" />
                      <span className={textPrimary}>
                        {isEn ? 'Email Address & SMTP Aliases' : 'آدرس ایمیل اصلی و آدرس‌های جایگزین (Aliases)'}
                      </span>
                    </div>
                    <span className={`text-[11px] font-mono ${textMuted}`}>
                      {data.contact.emailAliases.length}
                    </span>
                  </div>

                  {data.contact.emailAliases.length > 0 ? (
                    <div className="space-y-1.5">
                      {data.contact.emailAliases.map((em, idx) => (
                        <div
                          key={`${em.address}-${idx}`}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                            em.isPrimary
                              ? isLightMode
                                ? 'bg-sky-50/60 border-sky-200'
                                : 'bg-sky-950/25 border-sky-500/35'
                              : isLightMode
                              ? 'bg-slate-50 border-slate-200'
                              : 'bg-slate-950 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-xs font-mono truncate ${textPrimary}`} dir="ltr">
                              {em.address}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-semibold shrink-0 ${
                                em.isPrimary
                                  ? 'bg-sky-500/15 text-sky-500'
                                  : isLightMode
                                  ? 'bg-slate-200 text-slate-700'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {em.isPrimary ? (isEn ? 'Primary SMTP' : 'ایمیل اصلی') : 'Alias'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopy(em.address, `mail-${idx}`)}
                            className={`p-1 rounded hover:bg-sky-500/15 transition cursor-pointer shrink-0 ${textMuted}`}
                            title={isEn ? 'Copy email' : 'کپی ایمیل'}
                          >
                            {copiedKey === `mail-${idx}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`text-xs ${textMuted}`}>
                      {isEn
                        ? 'No email address or proxyAddresses configured for this user in AD.'
                        : 'هیچ آدرس ایمیلی در اکتیو دایرکتوری برای این کاربر ثبت نشده است.'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              TAB 2: PASSWORD EXPIRY, ACCOUNT LOCKOUT & UNLOCK CONTROL
              ================================================================ */}
          {ram.activeSubTab === 'security' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              {/* Account Lockout + Unlock Control */}
              <div className="xl:col-span-6 space-y-4">
                <div
                  className={`rounded-xl border p-5 space-y-4 ${
                    data.security.accountLocked
                      ? isLightMode
                        ? 'bg-rose-50/60 border-rose-300 shadow-sm'
                        : 'bg-rose-950/25 border-rose-500/45'
                      : data.security.lockoutState === 'auto_expired_pending_clear'
                      ? isLightMode
                        ? 'bg-amber-50/60 border-amber-300 shadow-sm'
                        : 'bg-amber-950/25 border-amber-500/45'
                      : surfaceBg
                  }`}
                >
                  {(() => {
                    const thresh = data.security.domainPolicy.lockoutThreshold;
                    const durMin = data.security.domainPolicy.lockoutDurationMinutes;
                    const obsMin = data.security.domainPolicy.lockoutObservationWindowMinutes;
                    const dcList = data.security.dcLockoutBreakdown || [];
                    const lockEvents = data.security.lockoutEvents || [];
                    const latestLockEvt = lockEvents.find((ev) => ev.eventId === 4740);
                    const isExpiredPendingClear = data.security.lockoutState === 'auto_expired_pending_clear';

                    return (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${
                                data.security.accountLocked
                                  ? 'bg-rose-500/15 border-rose-500/35 text-rose-500'
                                  : isExpiredPendingClear
                                  ? 'bg-amber-500/15 border-amber-500/35 text-amber-500'
                                  : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-500'
                              }`}
                            >
                              {data.security.accountLocked ? (
                                <Lock className="w-5 h-5" />
                              ) : isExpiredPendingClear ? (
                                <Clock className="w-5 h-5" />
                              ) : (
                                <Unlock className="w-5 h-5" />
                              )}
                            </div>
                            <div>
                              <h3 className={`text-sm font-bold ${textPrimary}`}>
                                {data.security.accountLocked
                                  ? isEn
                                    ? 'Account is Currently LOCKED OUT'
                                    : 'وضعیت اکانت: قفل شده (Locked Out)'
                                  : isExpiredPendingClear
                                  ? isEn
                                    ? 'Lockout Duration Elapsed (Pending Next Logon Clear)'
                                    : 'زمان قفل به پایان رسیده (در انتظار اولین ورود موفق)'
                                  : isEn
                                  ? 'Account Lockout Status: Unlocked (Normal)'
                                  : 'وضعیت اکانت: باز و بدون قفل (Unlocked)'}
                              </h3>
                              <p className={`text-xs mt-0.5 ${textMuted}`}>
                                {data.security.accountLocked
                                  ? isEn
                                    ? `Locked at ${formatDateDisplay(data.security.lockedAt, true)} · Failed logins: ${data.security.badPwdCount}${
                                        data.security.lockoutRemainingMinutes !== null && data.security.lockoutRemainingMinutes !== undefined
                                          ? ` · Auto-unlocks in ~${data.security.lockoutRemainingMinutes}m`
                                          : ' · Requires Admin Unlock'
                                      }`
                                    : `زمان قفل شدن: ${formatDateDisplay(data.security.lockedAt, false)} · تلاش ناموفق: ${data.security.badPwdCount}${
                                        data.security.lockoutRemainingMinutes !== null && data.security.lockoutRemainingMinutes !== undefined
                                          ? ` · بازشدن خودکار تا حدود ${data.security.lockoutRemainingMinutes} دقیقه`
                                          : ' · نیازمند باز کردن توسط ادمین'
                                      }`
                                  : isExpiredPendingClear
                                  ? isEn
                                    ? `Previous lockout at ${formatDateDisplay(data.security.lockedAt, true)} expired automatically; user can sign in or admin can clear timer now.`
                                    : `قفل قبلی در ${formatDateDisplay(data.security.lockedAt, false)} منقضی شده است؛ کاربر می‌تواند لاگین کند یا تایمر را بازنشانی کنید.`
                                  : thresh === 0
                                  ? isEn
                                    ? `Lockout policy is disabled on this domain (Threshold = 0) · Checked ${Math.max(1, dcList.length)} DC(s)`
                                    : `قفل شدن خودکار در پالیسی این دامین غیرفعال است (آستانه = ۰) · بررسی‌شده روی ${Math.max(1, dcList.length)} دامین کنترلر`
                                  : thresh !== null
                                  ? isEn
                                    ? `Policy: locks after ${thresh} bad attempts (${durMin !== null ? `${durMin}m duration` : 'until admin unlock'}) · Checked ${Math.max(1, dcList.length)} DC(s)`
                                    : `پالیسی فعال: قفل پس از ${thresh} رمز اشتباه (${durMin !== null ? `مدت قفل ${durMin} دقیقه` : 'تا بازشدن توسط ادمین'}) · بررسی‌شده روی ${Math.max(1, dcList.length)} DC`
                                  : isEn
                                  ? `No active lockout on this account · Queried ${Math.max(1, dcList.length)} Domain Controller(s)`
                                  : `در حال حاضر قفل فعالی روی این اکانت وجود ندارد · بررسی‌شده روی ${Math.max(1, dcList.length)} دامین کنترلر`}
                              </p>
                            </div>
                          </div>

                          {/* Two-step Unlock Action */}
                          {canUnlockAccount &&
                            (data.security.accountLocked ||
                              isExpiredPendingClear ||
                              data.security.badPwdCount > 0) && (
                              <div className="flex items-center gap-2 shrink-0">
                                {!confirmUnlock ? (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmUnlock(true)}
                                    disabled={ram.unlocking}
                                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                                      data.security.accountLocked
                                        ? 'bg-rose-600 hover:bg-rose-500 text-white'
                                        : isLightMode
                                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
                                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                                    }`}
                                  >
                                    <Unlock className="w-3.5 h-3.5" />
                                    <span>
                                      {data.security.accountLocked
                                        ? isEn
                                          ? 'Unlock User Account'
                                          : 'خارج کردن از حالت قفل (Unlock)'
                                        : isEn
                                        ? 'Clear Lockout Counter'
                                        : 'پاک‌سازی تایمر و شمارنده قفل'}
                                    </span>
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      disabled={ram.unlocking}
                                      onClick={async () => {
                                        await runHelpdeskUserUnlock();
                                        setConfirmUnlock(false);
                                      }}
                                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold transition cursor-pointer"
                                    >
                                      {ram.unlocking ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Check className="w-3.5 h-3.5" />
                                      )}
                                      <span>
                                        {ram.unlocking
                                          ? isEn
                                            ? 'Unlocking...'
                                            : 'در حال باز کردن...'
                                          : isEn
                                          ? 'Confirm Unlock'
                                          : 'تایید رفع قفل'}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={ram.unlocking}
                                      onClick={() => setConfirmUnlock(false)}
                                      className={`px-2.5 py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                                        isLightMode
                                          ? 'bg-white border-slate-300 text-slate-700'
                                          : 'bg-slate-900 border-slate-700 text-slate-300'
                                      }`}
                                    >
                                      {isEn ? 'Cancel' : 'انصراف'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                        </div>

                        {/* Lockout & Bad Password Telemetry Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className={`rounded-lg border p-3 ${subSurfaceBg}`}>
                            <div className={`text-[11px] mb-1 ${textMuted}`}>
                              {isEn ? 'Bad Password Count' : 'تعداد رمز اشتباه (کل DCها)'}
                            </div>
                            <div className={`text-sm font-mono font-bold tabular-nums ${textPrimary}`}>
                              {data.security.badPwdCount}
                              {thresh !== null && thresh > 0
                                ? ` / ${thresh}`
                                : thresh === 0
                                ? isEn
                                  ? ' (No Limit)'
                                  : ' (بدون سقف)'
                                : ''}
                            </div>
                            {data.security.badPwdSourceDc && (
                              <div className={`text-[10px] font-mono truncate mt-0.5 ${textMuted}`} dir="ltr">
                                @ {data.security.badPwdSourceDc}
                              </div>
                            )}
                          </div>

                          <div className={`rounded-lg border p-3 ${subSurfaceBg}`}>
                            <div className={`text-[11px] mb-1 ${textMuted}`}>
                              {isEn ? 'Last Bad Password' : 'آخرین تلاش ناموفق'}
                            </div>
                            <div className={`text-xs font-mono font-semibold ${textPrimary}`}>
                              {data.security.badPasswordTime
                                ? formatDateDisplay(data.security.badPasswordTime, isEn)
                                : isEn
                                ? 'None recorded'
                                : 'ثبت نشده'}
                            </div>
                          </div>

                          <div className={`rounded-lg border p-3 ${subSurfaceBg}`}>
                            <div className={`text-[11px] mb-1 ${textMuted}`}>
                              {data.security.lockedAt
                                ? isEn
                                  ? 'Lockout Timestamp'
                                  : 'زمان دقیق قفل شدن'
                                : latestLockEvt
                                ? isEn
                                  ? 'Last Lockout (Event 4740)'
                                  : 'آخرین قفل ثبت‌شده (4740)'
                                : isEn
                                ? 'Lockout Timestamp'
                                : 'زمان دقیق قفل شدن'}
                            </div>
                            <div className={`text-xs font-mono font-semibold ${textPrimary}`}>
                              {data.security.lockedAt
                                ? formatDateDisplay(data.security.lockedAt, isEn)
                                : latestLockEvt
                                ? formatDateDisplay(latestLockEvt.timestamp, isEn)
                                : isEn
                                ? 'Not locked'
                                : 'قفل نشده'}
                            </div>
                            {!data.security.lockedAt && latestLockEvt?.callerComputer && (
                              <div className={`text-[10px] font-mono truncate mt-0.5 ${textMuted}`} dir="ltr">
                                {isEn ? 'From:' : 'از:'} {latestLockEvt.callerComputer}
                              </div>
                            )}
                          </div>

                          <div className={`rounded-lg border p-3 ${subSurfaceBg}`}>
                            <div className={`text-[11px] mb-1 ${textMuted}`}>
                              {data.security.accountLocked
                                ? isEn
                                  ? 'Auto-Unlock Timer'
                                  : 'تایمر بازشدن خودکار'
                                : isEn
                                ? 'Policy Threshold / Reset'
                                : 'آستانه قفل / ریست'}
                            </div>
                            <div className={`text-xs font-mono font-semibold ${textPrimary}`}>
                              {data.security.accountLocked
                                ? data.security.lockoutExpiresAt
                                  ? `${formatDateDisplay(data.security.lockoutExpiresAt, isEn)} (~${data.security.lockoutRemainingMinutes ?? 0}m)`
                                  : isEn
                                  ? 'Until Admin Unlock'
                                  : 'تا بازشدن توسط ادمین'
                                : thresh === 0
                                ? isEn
                                  ? 'Lockout Disabled (0)'
                                  : 'غیرفعال (آستانه ۰)'
                                : thresh !== null
                                ? `${thresh} ${isEn ? 'tries' : 'بار'} · ${durMin !== null ? `${durMin}m` : 'Admin'} / ${obsMin !== null ? `${obsMin}m` : '-'}`
                                : isEn
                                ? 'Default Domain Policy'
                                : 'پالیسی پیش‌فرض دامین'}
                            </div>
                          </div>
                        </div>

                        {/* Multi-DC Replication & Per-DC Counter Breakdown */}
                        {dcList.length > 0 && (
                          <div className={`rounded-lg border p-3 space-y-2 ${subSurfaceBg}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className={`text-[11px] font-semibold flex items-center gap-1.5 ${textSecondary}`}>
                                <Server className="w-3.5 h-3.5 text-teal-500" />
                                {isEn
                                  ? `Live Multi-DC Check (${dcList.length} Domain Controller${dcList.length > 1 ? 's' : ''})`
                                  : `بررسی هم‌زمان روی دامین کنترلرها (${dcList.length} سرور DC)`}
                              </span>
                              {data.connectionInfo.pdcEmulator && (
                                <span className={`text-[10px] font-mono ${textMuted}`} dir="ltr">
                                  PDC: {data.connectionInfo.pdcEmulator}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {dcList.map((dc) => (
                                <div
                                  key={dc.dcHost}
                                  className={`px-2.5 py-2 rounded border text-[11px] flex items-center justify-between gap-2 ${
                                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`font-mono font-semibold truncate ${textPrimary}`} dir="ltr">
                                        {dc.dcHost}
                                      </span>
                                      {dc.isPdc && (
                                        <span className="px-1 py-0.5 rounded bg-sky-500/15 text-sky-500 text-[9px] font-bold">
                                          PDC
                                        </span>
                                      )}
                                    </div>
                                    <div className={`text-[10px] ${textMuted}`}>
                                      {isEn ? 'BadPwd:' : 'رمز اشتباه:'}{' '}
                                      <strong className={dc.badPwdCount > 0 ? 'text-amber-500' : textPrimary}>
                                        {dc.badPwdCount}
                                      </strong>
                                      {dc.badPasswordTime
                                        ? ` · ${formatDateDisplay(dc.badPasswordTime, isEn)}`
                                        : ''}
                                    </div>
                                  </div>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                                      dc.accountLocked
                                        ? 'bg-rose-500/15 text-rose-500'
                                        : 'bg-emerald-500/15 text-emerald-500'
                                    }`}
                                  >
                                    {dc.accountLocked
                                      ? isEn
                                        ? 'Locked'
                                        : 'قفل'
                                      : isEn
                                      ? 'Unlocked'
                                      : 'باز'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Recent Lockout, Unlock & Caller Source Events (Security Event Log 4740 / 4767 / 4771 / 4625) */}
                        <div className={`rounded-lg border p-3 space-y-2 ${subSurfaceBg}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={`text-[11px] font-semibold flex items-center gap-1.5 ${textSecondary}`}>
                              <Activity className="w-3.5 h-3.5 text-indigo-500" />
                              {isEn
                                ? 'Recent Lockout & Failed Auth Events (Event ID 4740 / 4767 / 4771 / 4625)'
                                : 'رویدادهای اخیر قفل، رفع قفل و رمز اشتباه (Event ID 4740 / 4767 / 4771 / 4625)'}
                            </span>
                            <span className={`text-[10px] ${textMuted}`}>
                              {isEn ? 'Last 7 days' : '۷ روز گذشته'}
                            </span>
                          </div>

                          {lockEvents.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-[11px] text-start border-collapse">
                                <thead>
                                  <tr className={`border-b ${isLightMode ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
                                    <th className="py-1.5 px-2 font-medium text-start">{isEn ? 'Event' : 'رویداد'}</th>
                                    <th className="py-1.5 px-2 font-medium text-start">{isEn ? 'Time' : 'زمان'}</th>
                                    <th className="py-1.5 px-2 font-medium text-start">{isEn ? 'Caller PC / IP' : 'سیستم / IP مبدأ'}</th>
                                    <th className="py-1.5 px-2 font-medium text-start">{isEn ? 'DC / Actor' : 'دامین کنترلر / عامل'}</th>
                                  </tr>
                                </thead>
                                <tbody className={`divide-y ${isLightMode ? 'divide-slate-200/70' : 'divide-slate-800/70'}`}>
                                  {lockEvents.slice(0, 8).map((ev, idx) => (
                                    <tr key={`${ev.eventId}-${ev.timestamp}-${idx}`}>
                                      <td className="py-1.5 px-2 whitespace-nowrap">
                                        <span
                                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                                            ev.eventId === 4740
                                              ? 'bg-rose-500/15 text-rose-500'
                                              : ev.eventId === 4767
                                              ? 'bg-emerald-500/15 text-emerald-500'
                                              : 'bg-amber-500/15 text-amber-500'
                                          }`}
                                        >
                                          {ev.eventId} ·{' '}
                                          {ev.eventId === 4740
                                            ? isEn
                                              ? 'Locked'
                                              : 'قفل شد'
                                            : ev.eventId === 4767
                                            ? isEn
                                              ? 'Unlocked'
                                              : 'رفع قفل'
                                            : ev.eventId === 4771
                                            ? isEn
                                              ? 'Pre-Auth Fail'
                                              : 'رمز اشتباه'
                                            : isEn
                                            ? 'Logon Fail'
                                            : 'ورود ناموفق'}
                                        </span>
                                      </td>
                                      <td className={`py-1.5 px-2 font-mono whitespace-nowrap ${textPrimary}`}>
                                        {formatDateDisplay(ev.timestamp, isEn)}
                                      </td>
                                      <td className={`py-1.5 px-2 font-mono ${textSecondary}`} dir="ltr">
                                        {[ev.callerComputer, ev.sourceIp].filter(Boolean).join(' · ') || '-'}
                                      </td>
                                      <td className={`py-1.5 px-2 font-mono ${textMuted}`} dir="ltr">
                                        {ev.actor ? `${ev.dcHost} (${ev.actor})` : ev.dcHost}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className={`text-[11px] leading-relaxed ${textMuted}`}>
                              {isEn
                                ? data.security.lockoutEventsNote ||
                                  'No lockout or failed authentication events recorded in Security Event Log.'
                                : data.security.lockoutEventsNoteFa ||
                                  'رویداد قفل یا تلاش ناموفقی در لاگ امنیتی دامین کنترلر ثبت نشده است.'}
                            </p>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Account Lifecycle & Logon Activity */}
                <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Clock className="w-4 h-4 text-sky-500" />
                    <span className={textPrimary}>
                      {isEn ? 'Account Status & Logon Telemetry' : 'وضعیت حساب و سوابق ورود به دامین'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        label: isEn ? 'Account Enabled' : 'فعال بودن اکانت',
                        value: data.security.accountEnabled
                          ? isEn
                            ? 'Enabled'
                            : 'فعال (Enabled)'
                          : isEn
                          ? 'Disabled'
                          : 'غیرفعال (Disabled)',
                      },
                      {
                        label: isEn ? 'Account Expiration' : 'تاریخ انقضای اکانت',
                        value: data.security.accountNeverExpires
                          ? isEn
                            ? 'Never Expires'
                            : 'بدون انقضا (Never)'
                          : formatDateDisplay(data.security.accountExpiresAt, isEn),
                      },
                      {
                        label: isEn ? 'Last Domain Logon' : 'آخرین ورود به دامین',
                        value: formatDateDisplay(data.security.lastLogon, isEn),
                      },
                      {
                        label: isEn ? 'Total Logon Count' : 'تعداد کل ورودها',
                        value: String(data.security.logonCount ?? 0),
                      },
                      {
                        label: isEn ? 'Account Created' : 'تاریخ ایجاد اکانت',
                        value: formatDateDisplay(data.profile.whenCreated, isEn),
                      },
                      {
                        label: isEn ? 'Last AD Modification' : 'آخرین تغییر در AD',
                        value: formatDateDisplay(data.profile.whenChanged, isEn),
                      },
                    ].map((row, i) => (
                      <div key={i} className={`rounded-lg border p-3 ${subSurfaceBg}`}>
                        <div className={`text-[11px] mb-1 ${textMuted}`}>{row.label}</div>
                        <div className={`text-xs font-semibold font-mono ${textPrimary}`}>{row.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Password Last Change, Expiration & Policy Column */}
              <div className="xl:col-span-6 space-y-4">
                <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <KeyRound
                        className={`w-4 h-4 ${
                          data.security.passwordExpired ? 'text-rose-500' : 'text-amber-500'
                        }`}
                      />
                      <span className={textPrimary}>
                        {isEn ? 'Password Age & Expiration Lifecycle' : 'تاریخ تعویض و وضعیت انقضای رمز عبور'}
                      </span>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                        data.security.mustChangePasswordAtNextLogon
                          ? 'bg-amber-500/15 text-amber-500'
                          : data.security.passwordNeverExpires
                          ? 'bg-sky-500/15 text-sky-500'
                          : data.security.passwordExpired
                          ? 'bg-rose-500/15 text-rose-500'
                          : 'bg-emerald-500/15 text-emerald-500'
                      }`}
                    >
                      {data.security.mustChangePasswordAtNextLogon
                        ? isEn
                          ? 'Must Change at Next Logon'
                          : 'الزام به تغییر رمز در ورود بعدی'
                        : data.security.passwordNeverExpires
                        ? isEn
                          ? 'Password Never Expires'
                          : 'رمز هرگز منقضی نمی‌شود'
                        : data.security.passwordExpired
                        ? isEn
                          ? 'PASSWORD EXPIRED'
                          : 'رمز عبور منقضی شده است'
                        : isEn
                        ? 'Password Active / Valid'
                        : 'رمز عبور معتبر و فعال'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className={`rounded-lg border p-3.5 ${subSurfaceBg}`}>
                      <div className={`text-[11px] mb-1 flex items-center gap-1.5 ${textMuted}`}>
                        <Calendar className="w-3.5 h-3.5 text-teal-500" />
                        <span>{isEn ? 'Password Last Changed' : 'آخرین زمان تغییر رمز عبور'}</span>
                      </div>
                      <div className={`text-xs font-bold font-mono ${textPrimary}`}>
                        {data.security.mustChangePasswordAtNextLogon
                          ? isEn
                            ? 'Reset (Must change on logon)'
                            : 'ریست شده (تغییر در اولین ورود)'
                          : formatDateDisplay(data.security.passwordLastSet, isEn)}
                      </div>
                      {data.security.passwordAgeDays !== null && !data.security.mustChangePasswordAtNextLogon && (
                        <div className={`text-[11px] mt-1 ${textMuted}`}>
                          {isEn
                            ? `${data.security.passwordAgeDays} days ago`
                            : `${data.security.passwordAgeDays} روز پیش`}
                        </div>
                      )}
                    </div>

                    <div className={`rounded-lg border p-3.5 ${subSurfaceBg}`}>
                      <div className={`text-[11px] mb-1 flex items-center gap-1.5 ${textMuted}`}>
                        <Clock
                          className={`w-3.5 h-3.5 ${
                            data.security.passwordExpired ? 'text-rose-500' : 'text-amber-500'
                          }`}
                        />
                        <span>{isEn ? 'Password Expiration Date' : 'تاریخ انقضای رمز عبور'}</span>
                      </div>
                      <div
                        className={`text-xs font-bold font-mono ${
                          data.security.passwordExpired ? 'text-rose-500' : textPrimary
                        }`}
                      >
                        {data.security.passwordNeverExpires
                          ? isEn
                            ? 'Never Expires (DONT_EXPIRE_PASSWORD)'
                            : 'بدون انقضا (دائمی)'
                          : formatDateDisplay(data.security.passwordExpiresAt, isEn)}
                      </div>
                      {!data.security.passwordNeverExpires && pwdDaysRemaining !== null && (
                        <div
                          className={`text-[11px] mt-1 font-medium ${
                            pwdDaysRemaining <= 0
                              ? 'text-rose-500'
                              : pwdDaysRemaining <= 7
                              ? 'text-amber-500'
                              : textMuted
                          }`}
                        >
                          {pwdDaysRemaining <= 0
                            ? isEn
                              ? `Expired ${Math.abs(pwdDaysRemaining)} day(s) ago`
                              : `${Math.abs(pwdDaysRemaining)} روز از انقضا گذشته است`
                            : isEn
                            ? `${pwdDaysRemaining} day(s) remaining`
                            : `${pwdDaysRemaining} روز باقی‌مانده تا انقضا`}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Password Age Progress vs Domain Policy */}
                  {!data.security.passwordNeverExpires &&
                    data.security.passwordAgeDays !== null &&
                    data.security.domainPolicy.maxPasswordAgeDays &&
                    data.security.domainPolicy.maxPasswordAgeDays > 0 && (
                      <div className={`rounded-lg border p-3.5 space-y-2 ${subSurfaceBg}`}>
                        <div className="flex justify-between text-xs">
                          <span className={textMuted}>
                            {isEn ? 'Password Lifetime Progress' : 'عمر سپری‌شده رمز عبور نسبت به سیاست دامین'}
                          </span>
                          <span className={`font-mono font-semibold tabular-nums ${textPrimary}`}>
                            {data.security.passwordAgeDays} / {data.security.domainPolicy.maxPasswordAgeDays}{' '}
                            {isEn ? 'days' : 'روز'}
                          </span>
                        </div>
                        <div
                          className={`h-2 rounded-full overflow-hidden ${
                            isLightMode ? 'bg-slate-200' : 'bg-slate-800'
                          }`}
                        >
                          <div
                            className={`h-full rounded-full transition-all ${
                              data.security.passwordExpired
                                ? 'bg-rose-500'
                                : pwdDaysRemaining !== null && pwdDaysRemaining <= 10
                                ? 'bg-amber-500'
                                : 'bg-teal-500'
                            }`}
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  (data.security.passwordAgeDays /
                                    data.security.domainPolicy.maxPasswordAgeDays) *
                                    100
                                )
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                  {/* Effective Domain / Fine-Grained Password Policy */}
                  <div className={`rounded-lg border p-3.5 space-y-2.5 ${subSurfaceBg}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-semibold ${textSecondary}`}>
                        {isEn ? 'Effective Password & Lockout Policy' : 'سیاست رمز عبور و قفل دامین (Policy)'}
                      </span>
                      <span className={`text-[11px] font-mono ${textMuted}`}>
                        {data.security.domainPolicy.source === 'pso'
                          ? `FGPP: ${data.security.domainPolicy.psoName}`
                          : data.security.domainPolicy.domainName}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className={`block text-[10px] ${textMuted}`}>
                          {isEn ? 'Max Password Age' : 'حداکثر عمر رمز'}
                        </span>
                        <span className={`font-mono font-semibold ${textPrimary}`}>
                          {data.security.domainPolicy.maxPasswordAgeDays !== null
                            ? data.security.domainPolicy.maxPasswordAgeDays === 0
                              ? isEn
                                ? 'Never'
                                : 'بدون انقضا'
                              : `${data.security.domainPolicy.maxPasswordAgeDays} ${isEn ? 'd' : 'روز'}`
                            : '-'}
                        </span>
                      </div>
                      <div>
                        <span className={`block text-[10px] ${textMuted}`}>
                          {isEn ? 'Min Length' : 'حداقل طول رمز'}
                        </span>
                        <span className={`font-mono font-semibold ${textPrimary}`}>
                          {data.security.domainPolicy.minPasswordLength ?? '-'}
                        </span>
                      </div>
                      <div>
                        <span className={`block text-[10px] ${textMuted}`}>
                          {isEn ? 'Lockout Threshold' : 'آستانه قفل (تلاش)'}
                        </span>
                        <span className={`font-mono font-semibold ${textPrimary}`}>
                          {data.security.domainPolicy.lockoutThreshold ?? '-'}
                        </span>
                      </div>
                      <div>
                        <span className={`block text-[10px] ${textMuted}`}>
                          {isEn ? 'Lockout Duration' : 'مدت قفل (دقیقه)'}
                        </span>
                        <span className={`font-mono font-semibold ${textPrimary}`}>
                          {data.security.domainPolicy.lockoutDurationMinutes !== null
                            ? `${data.security.domainPolicy.lockoutDurationMinutes}m`
                            : isEn
                            ? 'Until Admin Unlock'
                            : 'تا بازشدن توسط ادمین'}
                        </span>
                      </div>
                      <div>
                        <span className={`block text-[10px] ${textMuted}`}>
                          {isEn ? 'Counter Reset Window' : 'پنجره ریست شمارنده'}
                        </span>
                        <span className={`font-mono font-semibold ${textPrimary}`}>
                          {data.security.domainPolicy.lockoutObservationWindowMinutes !== null
                            ? `${data.security.domainPolicy.lockoutObservationWindowMinutes}m`
                            : '-'}
                        </span>
                      </div>
                      <div>
                        <span className={`block text-[10px] ${textMuted}`}>
                          {isEn ? 'User Can Change Pwd' : 'اجازه تغییر رمز'}
                        </span>
                        <span className={`font-mono font-semibold ${textPrimary}`}>
                          {data.security.userCannotChangePassword
                            ? isEn
                              ? 'Denied'
                              : 'خیر'
                            : isEn
                            ? 'Allowed'
                            : 'بله'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* UAC & SID / GUID Identifiers */}
                <div className={`rounded-xl border p-4 space-y-2.5 ${surfaceBg}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className={`font-semibold ${textSecondary}`}>
                      {isEn ? 'UAC Flags & Security Identifiers' : 'فلگ‌های امنیتی و شناسه‌های اکانت'}
                    </span>
                    <span className={`font-mono text-[11px] ${textMuted}`} dir="ltr">
                      UAC: 0x{data.security.userAccountControl.toString(16).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5" dir="ltr">
                    {data.security.uacFlags.map((flag) => (
                      <span
                        key={flag}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-200 text-slate-700'
                            : 'bg-slate-950 border-slate-800 text-slate-300'
                        }`}
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                  {data.profile.objectSid && (
                    <div className={`text-[11px] font-mono pt-1 ${textMuted}`} dir="ltr">
                      SID: {data.profile.objectSid}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              TAB 3: MAILBOX SIZE & EXCHANGE QUOTA
              ================================================================ */}
          {ram.activeSubTab === 'mailbox' && (
            <div className="space-y-4">
              {/* Inline Exchange Host Retry / Refresh Toolbar */}
              <div className={`rounded-xl border p-4 flex flex-wrap items-end justify-between gap-3 ${surfaceBg}`}>
                <div className="flex-1 min-w-[220px] max-w-md">
                  <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
                    {isEn
                      ? 'Exchange Server Host / IP (for Live Usage Query)'
                      : 'آدرس سرور Exchange (برای دریافت لحظه‌ای حجم استفاده شده)'}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      dir="ltr"
                      value={ram.exchangeServer}
                      onChange={(e) =>
                        patchHelpdeskUserRamSnapshot({
                          exchangeServer: e.target.value,
                          exchangeServerEditedManually: e.target.value.trim().length > 0,
                        })
                      }
                      placeholder={
                        hintedExchangeHost ||
                        data.mailbox.serverName ||
                        data.mailbox.exchangeHostUsed ||
                        'mail.company.com'
                      }
                      className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none transition ${inputCls}`}
                    />
                    {ram.exchangeServerEditedManually && hintedExchangeHost && (
                      <button
                        type="button"
                        onClick={() =>
                          patchHelpdeskUserRamSnapshot({
                            exchangeServer: hintedExchangeHost,
                            exchangeServerEditedManually: false,
                          })
                        }
                        title={isEn ? `Use default ${hintedExchangeHost}` : `استفاده از پیش‌فرض ${hintedExchangeHost}`}
                        className={`shrink-0 p-2 rounded-lg border text-xs transition cursor-pointer ${
                          isLightMode
                            ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                            : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                        }`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={ram.mailboxLoading}
                  onClick={() => runHelpdeskUserMailboxRefresh()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {ram.mailboxLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {ram.mailboxLoading
                      ? isEn
                        ? 'Querying Exchange...'
                        : 'در حال استعلام از Exchange...'
                      : isEn
                      ? 'Refresh Mailbox Stats'
                      : 'استعلام مجدد حجم میل‌باکس'}
                  </span>
                </button>
              </div>

              {(ram.mailboxError || data.mailbox.exchangeStatusMessage) && (
                <div
                  className={`rounded-xl border p-4 space-y-2 text-xs ${
                    isLightMode
                      ? 'bg-amber-50 border-amber-200 text-amber-950'
                      : 'bg-amber-950/30 border-amber-500/35 text-amber-100'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="font-semibold">
                        {isEn ? 'Exchange Connection Notice' : 'گزارش اتصال به سرور Exchange'}
                      </div>
                      <div className="break-words opacity-90">
                        {ram.mailboxError ||
                          (isEn
                            ? data.mailbox.exchangeStatusMessage
                            : data.mailbox.exchangeStatusMessageFa ||
                              data.mailbox.exchangeStatusMessage)}
                      </div>
                    </div>
                  </div>
                  <TimeoutAntivirusHint
                    errorText={ram.mailboxError || data.mailbox.exchangeStatusMessage}
                    isEn={isEn}
                    isLightMode={isLightMode}
                    canViewSecurityAv={Boolean(onNavigateToEndpointHelpdesk)}
                    canControlAntivirus={canUnlockAccount}
                    onGoToAntivirus={onNavigateToEndpointHelpdesk}
                  />
                </div>
              )}

              {/* Storage Quota Summary & Usage Gauge */}
              <div className={`rounded-xl border p-5 space-y-5 ${surfaceBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Mail className="w-5 h-5 text-indigo-500" />
                    <div>
                      <h3 className={`text-sm font-bold ${textPrimary}`}>
                        {isEn ? 'Mailbox Capacity & Storage Usage' : 'ظرفیت کل میل‌باکس و میزان فضای مصرف‌شده'}
                      </h3>
                      <p className={`text-[11px] ${textMuted}`}>
                        {data.mailbox.liveStatsRetrieved
                          ? isEn
                            ? `Live stats collected from Exchange (${data.mailbox.exchangeHostUsed || data.mailbox.serverName})`
                            : `آمار لحظه‌ای دریافت‌شده از سرور Exchange (${data.mailbox.exchangeHostUsed || data.mailbox.serverName})`
                          : data.mailbox.hasMailbox
                          ? isEn
                            ? 'Showing mailbox quota policy stored in Active Directory'
                            : 'نمایش اطلاعات دیتابیس و سهمیه ثبت‌شده در اکتیو دایرکتوری'
                          : isEn
                          ? 'No Exchange mailbox detected for this user'
                          : 'میل‌باکسی برای این کاربر شناسایی نشد'}
                      </p>
                    </div>
                  </div>

                  {data.mailbox.storageLimitStatus && (
                    <span
                      className={`px-2.5 py-1 rounded text-xs font-bold ${
                        /below/i.test(data.mailbox.storageLimitStatus)
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : /warning/i.test(data.mailbox.storageLimitStatus)
                          ? 'bg-amber-500/15 text-amber-500'
                          : 'bg-rose-500/15 text-rose-500'
                      }`}
                    >
                      {data.mailbox.storageLimitStatus}
                    </span>
                  )}
                </div>

                {/* Main Storage KPI Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className={`rounded-lg border p-4 ${subSurfaceBg}`}>
                    <div className={`text-[11px] mb-1 ${textMuted}`}>
                      {isEn ? 'Used Mailbox Space (TotalItemSize)' : 'فضای مصرف‌شده میل‌باکس'}
                    </div>
                    <div className={`text-lg font-bold font-mono tabular-nums ${textPrimary}`}>
                      {data.mailbox.totalUsedBytes !== null
                        ? formatBytesHuman(data.mailbox.totalUsedBytes, isEn)
                        : isEn
                        ? 'Unavailable (Need Exch PS)'
                        : 'نیازمند اتصال Exchange'}
                    </div>
                    {data.mailbox.itemCount !== null && (
                      <div className={`text-[11px] mt-1 font-mono tabular-nums ${textMuted}`}>
                        {data.mailbox.itemCount.toLocaleString()} {isEn ? 'items' : 'آیتم ایمیل'}
                      </div>
                    )}
                  </div>

                  <div className={`rounded-lg border p-4 ${subSurfaceBg}`}>
                    <div className={`text-[11px] mb-1 ${textMuted}`}>
                      {isEn ? 'Effective Total Quota' : 'سقف مجاز کل میل‌باکس (Quota)'}
                    </div>
                    <div className={`text-lg font-bold font-mono tabular-nums ${textPrimary}`}>
                      {data.mailbox.isUnlimitedQuota
                        ? isEn
                          ? 'Unlimited'
                          : 'نامحدود (Unlimited)'
                        : data.mailbox.effectiveQuotaBytes !== null
                        ? formatBytesHuman(data.mailbox.effectiveQuotaBytes, isEn)
                        : '-'}
                    </div>
                    <div className={`text-[11px] mt-1 ${textMuted}`}>
                      {data.mailbox.useDatabaseQuotaDefaults === true
                        ? isEn
                          ? 'Inherited from Database Defaults'
                          : 'تنظیم‌شده از پیش‌فرض دیتابیس'
                        : data.mailbox.useDatabaseQuotaDefaults === false
                        ? isEn
                          ? 'Custom Per-User Quota'
                          : 'سهمیه اختصاصی کاربر'
                        : '-'}
                    </div>
                  </div>

                  <div className={`rounded-lg border p-4 ${subSurfaceBg}`}>
                    <div className={`text-[11px] mb-1 ${textMuted}`}>
                      {isEn ? 'Deleted / Recoverable Items' : 'حجم آیتم‌های حذف‌شده (Dumpster)'}
                    </div>
                    <div className={`text-lg font-bold font-mono tabular-nums ${textPrimary}`}>
                      {data.mailbox.deletedItemsBytes !== null
                        ? formatBytesHuman(data.mailbox.deletedItemsBytes, isEn)
                        : '-'}
                    </div>
                    {data.mailbox.deletedItemCount !== null && (
                      <div className={`text-[11px] mt-1 font-mono tabular-nums ${textMuted}`}>
                        {data.mailbox.deletedItemCount.toLocaleString()} {isEn ? 'deleted items' : 'آیتم حذف‌شده'}
                      </div>
                    )}
                  </div>

                  <div className={`rounded-lg border p-4 ${subSurfaceBg}`}>
                    <div className={`text-[11px] mb-1 ${textMuted}`}>
                      {isEn ? 'Mailbox Database & Server' : 'دیتابیس و سرور میزبان'}
                    </div>
                    <div className={`text-xs font-bold font-mono break-words ${textPrimary}`} dir="ltr">
                      {data.mailbox.databaseName || '-'}
                    </div>
                    <div className={`text-[11px] mt-1 font-mono truncate ${textMuted}`} dir="ltr">
                      {data.mailbox.serverName || '-'}
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                {data.mailbox.totalUsedBytes !== null && data.mailbox.effectiveQuotaBytes && (
                  <div className={`rounded-lg border p-4 space-y-2 ${subSurfaceBg}`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-semibold ${textSecondary}`}>
                        {isEn ? 'Mailbox Storage Consumption' : 'درصد پر شدن میل‌باکس'}
                      </span>
                      <span className={`font-mono font-bold tabular-nums ${textPrimary}`}>
                        {formatBytesHuman(data.mailbox.totalUsedBytes, isEn)} /{' '}
                        {formatBytesHuman(data.mailbox.effectiveQuotaBytes, isEn)} (
                        {data.mailbox.usedPercent ?? 0}%)
                      </span>
                    </div>
                    <div
                      className={`h-3 rounded-full overflow-hidden ${
                        isLightMode ? 'bg-slate-200' : 'bg-slate-800'
                      }`}
                    >
                      <div
                        className={`h-full rounded-full transition-all ${
                          (data.mailbox.usedPercent ?? 0) >= 92
                            ? 'bg-rose-500'
                            : (data.mailbox.usedPercent ?? 0) >= 80
                            ? 'bg-amber-500'
                            : 'bg-indigo-500'
                        }`}
                        style={{ width: `${Math.min(100, data.mailbox.usedPercent ?? 0)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Detailed Exchange Thresholds & Forwarding / Archive */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className={`rounded-lg border p-3.5 ${subSurfaceBg}`}>
                    <div className={`text-[11px] mb-1 ${textMuted}`}>
                      {isEn ? 'Issue Warning Quota' : 'آستانه اخطار (Issue Warning)'}
                    </div>
                    <div className={`text-xs font-mono font-semibold ${textPrimary}`}>
                      {data.mailbox.issueWarningQuotaBytes !== null
                        ? formatBytesHuman(data.mailbox.issueWarningQuotaBytes, isEn)
                        : data.mailbox.isUnlimitedQuota
                        ? 'Unlimited'
                        : '-'}
                    </div>
                  </div>

                  <div className={`rounded-lg border p-3.5 ${subSurfaceBg}`}>
                    <div className={`text-[11px] mb-1 ${textMuted}`}>
                      {isEn ? 'Prohibit Send Quota' : 'محدودیت ارسال ایمیل (Prohibit Send)'}
                    </div>
                    <div className={`text-xs font-mono font-semibold ${textPrimary}`}>
                      {data.mailbox.prohibitSendQuotaBytes !== null
                        ? formatBytesHuman(data.mailbox.prohibitSendQuotaBytes, isEn)
                        : data.mailbox.isUnlimitedQuota
                        ? 'Unlimited'
                        : '-'}
                    </div>
                  </div>

                  <div className={`rounded-lg border p-3.5 ${subSurfaceBg}`}>
                    <div className={`text-[11px] mb-1 ${textMuted}`}>
                      {isEn ? 'Prohibit Send/Receive Quota' : 'توقف کامل ارسال و دریافت (Hard Limit)'}
                    </div>
                    <div className={`text-xs font-mono font-semibold ${textPrimary}`}>
                      {data.mailbox.prohibitSendReceiveQuotaBytes !== null
                        ? formatBytesHuman(data.mailbox.prohibitSendReceiveQuotaBytes, isEn)
                        : data.mailbox.isUnlimitedQuota
                        ? 'Unlimited'
                        : '-'}
                    </div>
                  </div>

                  <div className={`rounded-lg border p-3.5 ${subSurfaceBg}`}>
                    <div className={`text-[11px] mb-1 flex items-center gap-1.5 ${textMuted}`}>
                      <Archive className="w-3.5 h-3.5 text-teal-500" />
                      <span>{isEn ? 'In-Place Archive Mailbox' : 'وضعیت آرشیو (In-Place Archive)'}</span>
                    </div>
                    <div className={`text-xs font-semibold ${textPrimary}`}>
                      {data.mailbox.archiveEnabled
                        ? data.mailbox.archiveUsedBytes !== null && data.mailbox.archiveUsedBytes !== undefined
                          ? `${isEn ? 'Active' : 'فعال'} · ${formatBytesHuman(data.mailbox.archiveUsedBytes, isEn)}`
                          : isEn
                          ? 'Active'
                          : 'فعال'
                        : isEn
                        ? 'Disabled / Not Provisioned'
                        : 'غیرفعال'}
                    </div>
                  </div>

                  <div className={`rounded-lg border p-3.5 ${subSurfaceBg}`}>
                    <div className={`text-[11px] mb-1 flex items-center gap-1.5 ${textMuted}`}>
                      <Forward className="w-3.5 h-3.5 text-amber-500" />
                      <span>{isEn ? 'Mail Forwarding' : 'فوروارد خودکار ایمیل'}</span>
                    </div>
                    <div className={`text-xs font-mono break-words ${textPrimary}`} dir="ltr">
                      {data.mailbox.forwardingSmtpAddress ||
                        data.mailbox.forwardingAddress ||
                        (isEn ? 'None' : 'تنظیم نشده')}
                    </div>
                  </div>

                  <div className={`rounded-lg border p-3.5 ${subSurfaceBg}`}>
                    <div className={`text-[11px] mb-1 flex items-center gap-1.5 ${textMuted}`}>
                      <Database className="w-3.5 h-3.5 text-sky-500" />
                      <span>{isEn ? 'Last Mailbox Logon' : 'آخرین اتصال به میل‌باکس'}</span>
                    </div>
                    <div className={`text-xs font-mono ${textPrimary}`}>
                      {formatDateDisplay(data.mailbox.lastLogonTime, isEn)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              TAB 4: AD GROUPS & DIRECTORY TREE
              ================================================================ */}
          {ram.activeSubTab === 'groups' && (
            <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <FolderTree className="w-4 h-4 text-teal-500" />
                  <span className={textPrimary}>
                    {isEn ? 'Active Directory Group Memberships' : 'گروه‌های امنیتی و توزیعی عضو در اکتیو دایرکتوری'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-mono ${
                      isLightMode ? 'bg-slate-100 text-slate-700' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {data.groups.length}
                  </span>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-3 ${textMuted}`} />
                  <input
                    type="text"
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    placeholder={isEn ? 'Filter groups...' : 'جستجو در گروه‌ها...'}
                    className={`w-full ps-8 pe-3 py-1.5 rounded-lg border text-xs outline-none transition ${inputCls}`}
                  />
                </div>
              </div>

              <div className={`rounded-lg border p-3 text-xs ${subSurfaceBg}`}>
                <div className={`text-[11px] mb-0.5 ${textMuted}`}>
                  {isEn ? 'Distinguished Name (DN)' : 'مسیر کامل در دایرکتوری (Distinguished Name)'}
                </div>
                <div className={`font-mono break-all ${textPrimary}`} dir="ltr">
                  {data.profile.distinguishedName}
                </div>
              </div>

              {filteredGroups.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[520px] overflow-y-auto pe-1">
                  {filteredGroups.map((grp, idx) => {
                    const inspectTarget = resolveInspectableGroupTarget(grp);
                    return (
                      <div
                        key={`${grp.dn}-${idx}`}
                        className={`rounded-lg border p-3 flex items-start justify-between gap-3 ${subSurfaceBg}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold truncate ${textPrimary}`}>{grp.cn}</span>
                            {grp.isPrimary && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-teal-500/15 text-teal-500 shrink-0">
                                {isEn ? 'Primary Group' : 'گروه اصلی'}
                              </span>
                            )}
                          </div>
                          <div className={`text-[11px] font-mono break-all mt-0.5 ${textMuted}`} dir="ltr">
                            {grp.dn}
                          </div>
                        </div>

                        {canOpenGroupHelpdesk && inspectTarget && (
                          <button
                            type="button"
                            onClick={() => handleInspectGroupInHelpdesk(grp)}
                            title={
                              isEn
                                ? `Inspect "${grp.cn}" details in AD Group Support HelpDesk using current session`
                                : `مشاهده جزئیات کامل گروه «${grp.cn}» در صفحه پشتیبانی گروه‌های دامین`
                            }
                            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${
                              isLightMode
                                ? 'bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-700'
                                : 'bg-teal-500/10 hover:bg-teal-500/20 border-teal-500/30 text-teal-400'
                            }`}
                          >
                            <span>{isEn ? 'Group Details' : 'جزئیات گروه'}</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={`text-xs py-6 text-center ${textMuted}`}>
                  {isEn ? 'No matching groups found.' : 'هیچ گروهی با این عبارت یافت نشد.'}
                </div>
              )}
            </div>
          )}
          {/* ================================================================
              TAB 5: USER REPORTS & HEALTH BRIEF
              ================================================================ */}
          {ram.activeSubTab === 'reports' && reportSummary && (
            <div className="space-y-5">
              {/* Executive Report Banner + Export Toolbar */}
              <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-16 h-16 rounded-2xl border-2 flex flex-col items-center justify-center shrink-0 ${
                        reportSummary.grade === 'healthy'
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500'
                          : reportSummary.grade === 'attention'
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-500'
                          : 'bg-rose-500/10 border-rose-500/40 text-rose-500'
                      }`}
                    >
                      <span className="text-xl font-black font-mono tabular-nums leading-none">
                        {reportSummary.score}
                      </span>
                      <span className="text-[10px] font-semibold mt-0.5">/ 100</span>
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className={`text-base font-bold ${textPrimary}`}>
                          {isEn
                            ? `Support Diagnostic Dossier — ${data.profile.displayName || data.profile.samAccountName}`
                            : `گزارش جامع پشتیبانی و سلامت حساب — ${data.profile.displayName || data.profile.samAccountName}`}
                        </h2>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            reportSummary.grade === 'healthy'
                              ? 'bg-emerald-500/15 text-emerald-500'
                              : reportSummary.grade === 'attention'
                              ? 'bg-amber-500/15 text-amber-500'
                              : 'bg-rose-500/15 text-rose-500'
                          }`}
                        >
                          {reportSummary.grade === 'healthy'
                            ? isEn
                              ? 'Healthy'
                              : 'سالم و آماده'
                            : reportSummary.grade === 'attention'
                            ? isEn
                              ? 'Needs Attention'
                              : 'نیازمند بررسی'
                            : isEn
                            ? 'Action Required'
                            : 'نیازمند اقدام فوری'}
                        </span>
                      </div>
                      <p className={`text-xs ${textMuted}`}>
                        {isEn
                          ? `Compiled from live AD (${data.connectionInfo.domainController}) and Exchange telemetry at ${formatDateDisplay(data.collectedAt, true)}`
                          : `تهیه‌شده به‌صورت زنده از دامین کنترلر (${data.connectionInfo.domainController}) و میل‌سرور در ${formatDateDisplay(data.collectedAt, false)}`}
                      </p>
                    </div>
                  </div>

                  {/* Multi-Format Export Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadUserHtmlReport()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>{isEn ? 'HTML Dossier' : 'دانلود گزارش HTML'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownloadUserCsvReport()}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                        isLightMode
                          ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                      }`}
                    >
                      <Download className="w-3.5 h-3.5 text-sky-500" />
                      <span>{isEn ? 'Export CSV' : 'خروجی CSV'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownloadUserJsonReport()}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                        isLightMode
                          ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                      }`}
                    >
                      <Download className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{isEn ? 'JSON' : 'JSON'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopy(buildTicketSummaryText(), 'ticket-summary')}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                        isLightMode
                          ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                      }`}
                    >
                      {copiedKey === 'ticket-summary' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <ClipboardCopy className="w-3.5 h-3.5 text-amber-500" />
                      )}
                      <span>
                        {copiedKey === 'ticket-summary'
                          ? isEn
                            ? 'Copied Brief'
                            : 'کپی شد'
                          : isEn
                          ? 'Copy Ticket Note'
                          : 'کپی خلاصه برای تیکت'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => window.print()}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                        isLightMode
                          ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                      }`}
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-500" />
                      <span>{isEn ? 'Print' : 'چاپ'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 4 Visual Health Dimension Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {/* 1. Password Freshness */}
                <div className={`rounded-xl border p-4 space-y-2.5 ${surfaceBg}`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold flex items-center gap-1.5 ${textSecondary}`}>
                      <KeyRound className="w-4 h-4 text-amber-500" />
                      {isEn ? 'Password Lifecycle' : 'وضعیت عمر رمز عبور'}
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        data.security.passwordExpired
                          ? 'text-rose-500'
                          : data.security.passwordNeverExpires
                          ? 'text-sky-500'
                          : 'text-emerald-500'
                      }`}
                    >
                      {data.security.passwordNeverExpires
                        ? isEn
                          ? 'Permanent'
                          : 'دائمی'
                        : data.security.passwordExpired
                        ? isEn
                          ? 'Expired'
                          : 'منقضی'
                        : pwdDaysRemaining !== null
                        ? `${pwdDaysRemaining}d`
                        : 'OK'}
                    </span>
                  </div>
                  <div className={`h-2 rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                    <div
                      className={`h-full rounded-full ${
                        data.security.passwordExpired
                          ? 'bg-rose-500'
                          : data.security.passwordNeverExpires
                          ? 'bg-sky-500'
                          : pwdDaysRemaining !== null && pwdDaysRemaining <= 7
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{
                        width: data.security.passwordNeverExpires
                          ? '100%'
                          : data.security.passwordExpired
                          ? '100%'
                          : data.security.passwordAgeDays !== null &&
                            data.security.domainPolicy.maxPasswordAgeDays
                          ? `${Math.min(
                              100,
                              Math.round(
                                (data.security.passwordAgeDays /
                                  data.security.domainPolicy.maxPasswordAgeDays) *
                                  100
                              )
                            )}%`
                          : '45%',
                      }}
                    />
                  </div>
                  <div className={`text-[11px] ${textMuted}`}>
                    {isEn ? 'Last set:' : 'آخرین تغییر:'} {formatDateDisplay(data.security.passwordLastSet, isEn)}
                  </div>
                </div>

                {/* 2. Lockout & Failed Attempts Meter */}
                <div className={`rounded-xl border p-4 space-y-2.5 ${surfaceBg}`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold flex items-center gap-1.5 ${textSecondary}`}>
                      <Lock className={`w-4 h-4 ${data.security.accountLocked ? 'text-rose-500' : 'text-teal-500'}`} />
                      {isEn ? 'Lockout Threshold' : 'آستانه قفل اکانت'}
                    </span>
                    <span className={`font-mono font-bold ${data.security.accountLocked ? 'text-rose-500' : textPrimary}`}>
                      {data.security.badPwdCount}
                      {data.security.domainPolicy.lockoutThreshold
                        ? ` / ${data.security.domainPolicy.lockoutThreshold}`
                        : ''}
                    </span>
                  </div>
                  <div className={`h-2 rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                    <div
                      className={`h-full rounded-full ${
                        data.security.accountLocked
                          ? 'bg-rose-500'
                          : data.security.badPwdCount > 0
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{
                        width: data.security.accountLocked
                          ? '100%'
                          : data.security.domainPolicy.lockoutThreshold
                          ? `${Math.min(
                              100,
                              Math.round(
                                (data.security.badPwdCount /
                                  data.security.domainPolicy.lockoutThreshold) *
                                  100
                              )
                            )}%`
                          : data.security.badPwdCount > 0
                          ? '35%'
                          : '8%',
                      }}
                    />
                  </div>
                  <div className={`text-[11px] ${textMuted}`}>
                    {isEn ? 'Total Logons:' : 'تعداد ورود موفق:'} {data.security.logonCount.toLocaleString()}
                  </div>
                </div>

                {/* 3. Mailbox Capacity Meter */}
                <div className={`rounded-xl border p-4 space-y-2.5 ${surfaceBg}`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold flex items-center gap-1.5 ${textSecondary}`}>
                      <HardDrive className="w-4 h-4 text-indigo-500" />
                      {isEn ? 'Mailbox Capacity' : 'ظرفیت میل‌باکس'}
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        (data.mailbox.usedPercent ?? 0) >= 90
                          ? 'text-rose-500'
                          : (data.mailbox.usedPercent ?? 0) >= 75
                          ? 'text-amber-500'
                          : textPrimary
                      }`}
                    >
                      {data.mailbox.usedPercent !== null
                        ? `${data.mailbox.usedPercent}%`
                        : data.mailbox.hasMailbox
                        ? isEn
                          ? 'AD Quota'
                          : 'سهمیه AD'
                        : isEn
                        ? 'None'
                        : 'ندارد'}
                    </span>
                  </div>
                  <div className={`h-2 rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                    <div
                      className={`h-full rounded-full ${
                        (data.mailbox.usedPercent ?? 0) >= 90
                          ? 'bg-rose-500'
                          : (data.mailbox.usedPercent ?? 0) >= 75
                          ? 'bg-amber-500'
                          : 'bg-indigo-500'
                      }`}
                      style={{
                        width: `${
                          data.mailbox.usedPercent !== null
                            ? Math.min(100, Math.max(4, data.mailbox.usedPercent))
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <div className={`text-[11px] truncate ${textMuted}`} dir="ltr">
                    {data.mailbox.totalUsedBytes !== null
                      ? `${formatBytesHuman(data.mailbox.totalUsedBytes, isEn)} / ${formatBytesHuman(data.mailbox.effectiveQuotaBytes, isEn)}`
                      : data.mailbox.effectiveQuotaBytes !== null
                      ? `${isEn ? 'Quota' : 'سهمیه'}: ${formatBytesHuman(data.mailbox.effectiveQuotaBytes, isEn)}`
                      : isEn
                      ? 'No live usage retrieved'
                      : 'آمار زنده دریافت نشده'}
                  </div>
                </div>

                {/* 4. Contact & AD Groups Footprint */}
                <div className={`rounded-xl border p-4 space-y-2.5 ${surfaceBg}`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold flex items-center gap-1.5 ${textSecondary}`}>
                      <Activity className="w-4 h-4 text-sky-500" />
                      {isEn ? 'Directory Footprint' : 'پوشش اطلاعات و گروه‌ها'}
                    </span>
                    <span className={`font-mono font-bold ${textPrimary}`}>
                      {data.groups.length} {isEn ? 'grp' : 'گروه'}
                    </span>
                  </div>
                  <div className={`h-2 rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                    <div
                      className="h-full rounded-full bg-teal-500"
                      style={{ width: `${Math.round((reportSummary.contactFieldsPresent / 3) * 100)}%` }}
                    />
                  </div>
                  <div className={`text-[11px] ${textMuted}`}>
                    {isEn
                      ? `Contacts: ${reportSummary.contactFieldsPresent}/3 · Admin groups: ${reportSummary.privilegedGroups.length}`
                      : `اطلاعات تماس: ${reportSummary.contactFieldsPresent} از ۳ · گروه‌های ادمین: ${reportSummary.privilegedGroups.length}`}
                  </div>
                </div>
              </div>

              {/* Actionable Findings + Structured Executive Report Table */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                <div className={`xl:col-span-5 rounded-xl border p-5 space-y-3 ${surfaceBg}`}>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="w-4 h-4 text-teal-500" />
                    <span className={textPrimary}>
                      {isEn ? 'Automated Diagnostic Findings & Checklist' : 'یافته‌ها و چک‌لیست پیشنهادی پشتیبانی'}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {reportSummary.findings.map((f) => (
                      <div
                        key={f.id}
                        className={`rounded-lg border p-3.5 space-y-1.5 text-xs ${
                          f.severity === 'critical'
                            ? isLightMode
                              ? 'bg-rose-50 border-rose-200 text-rose-900'
                              : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                            : f.severity === 'warning'
                            ? isLightMode
                              ? 'bg-amber-50 border-amber-200 text-amber-900'
                              : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                            : f.severity === 'info'
                            ? isLightMode
                              ? 'bg-sky-50 border-sky-200 text-sky-900'
                              : 'bg-sky-950/30 border-sky-500/40 text-sky-200'
                            : isLightMode
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold">{isEn ? f.titleEn : f.titleFa}</span>
                          {f.targetTab && (
                            <button
                              type="button"
                              onClick={() => patchHelpdeskUserRamSnapshot({ activeSubTab: f.targetTab })}
                              className="px-2 py-0.5 rounded bg-black/10 dark:bg-white/10 hover:bg-black/20 text-[11px] font-semibold cursor-pointer shrink-0"
                            >
                              {isEn ? 'Inspect' : 'مشاهده'}
                            </button>
                          )}
                        </div>
                        <p className="opacity-90 leading-relaxed">{isEn ? f.detailEn : f.detailFa}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Printable Summary Sheet Card */}
                <div className={`xl:col-span-7 rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <FileText className="w-4 h-4 text-sky-500" />
                      <span className={textPrimary}>
                        {isEn ? 'Structured Support Summary Sheet' : 'جدول خلاصه کامل گزارش کاربر'}
                      </span>
                    </div>
                    <span className={`font-mono text-[11px] ${textMuted}`} dir="ltr">
                      {data.profile.samAccountName}@{data.connectionInfo.domainName}
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-xs border-collapse">
                      <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/80'}`}>
                        {[
                          {
                            k: isEn ? 'Full Name & Username' : 'نام کامل و نام کاربری',
                            v: `${data.profile.displayName || '-'} (@${data.profile.samAccountName})`,
                          },
                          {
                            k: isEn ? 'Title / Department / Office' : 'سمت / دپارتمان / دفتر',
                            v:
                              [data.profile.jobTitle, data.profile.department, data.profile.office]
                                .filter(Boolean)
                                .join(' · ') || '-',
                          },
                          {
                            k: isEn ? 'Direct Manager' : 'مدیر مستقیم',
                            v: data.profile.manager
                              ? `${data.profile.manager.displayName}${
                                  data.profile.manager.title ? ` (${data.profile.manager.title})` : ''
                                }`
                              : '-',
                          },
                          {
                            k: isEn ? 'Extensions & Mobile Numbers' : 'شماره داخلی و موبایل‌ها',
                            v:
                              [
                                data.contact.internalPhones.length > 0
                                  ? `${isEn ? 'Ext' : 'داخلی'}: ${data.contact.internalPhones.join(', ')}`
                                  : '',
                                data.contact.mobileNumbers.length > 0
                                  ? `${isEn ? 'Mob' : 'موبایل'}: ${data.contact.mobileNumbers.join(', ')}`
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' | ') || '-',
                          },
                          {
                            k: isEn ? 'Email & Aliases' : 'ایمیل اصلی و جایگزین‌ها',
                            v:
                              data.contact.emailAliases.map((a) => a.address).join(', ') ||
                              data.contact.primaryEmail ||
                              '-',
                          },
                          {
                            k: isEn ? 'Password Last Changed / Expiry' : 'تغییر و انقضای رمز عبور',
                            v: `${formatDateDisplay(data.security.passwordLastSet, isEn)} → ${
                              data.security.passwordNeverExpires
                                ? isEn
                                  ? 'Never Expires'
                                  : 'بدون انقضا'
                                : formatDateDisplay(data.security.passwordExpiresAt, isEn)
                            }`,
                          },
                          {
                            k: isEn ? 'Account Lockout / BadPwd' : 'وضعیت قفل و تلاش ناموفق',
                            v: `${
                              data.security.accountLocked
                                ? isEn
                                  ? 'LOCKED OUT'
                                  : 'قفل شده'
                                : isEn
                                ? 'Unlocked'
                                : 'باز'
                            } (${data.security.badPwdCount} ${isEn ? 'failed' : 'ناموفق'})`,
                          },
                          {
                            k: isEn ? 'Mailbox Usage & Quota' : 'فضای مصرفی و سهمیه میل‌باکس',
                            v: data.mailbox.hasMailbox
                              ? `${
                                  data.mailbox.totalUsedBytes !== null
                                    ? formatBytesHuman(data.mailbox.totalUsedBytes, isEn)
                                    : isEn
                                    ? 'Usage Unavailable'
                                    : 'مصرف نامشخص'
                                } / ${
                                  data.mailbox.isUnlimitedQuota
                                    ? 'Unlimited'
                                    : formatBytesHuman(data.mailbox.effectiveQuotaBytes, isEn)
                                }${
                                  data.mailbox.usedPercent !== null ? ` (${data.mailbox.usedPercent}%)` : ''
                                } · DB: ${data.mailbox.databaseName || '-'}`
                              : isEn
                              ? 'No Mailbox'
                              : 'فاقد میل‌باکس',
                          },
                          {
                            k: isEn ? 'AD Groups & OU' : 'گروه‌ها و مسیر OU',
                            v: `${data.groups.length} ${isEn ? 'group(s)' : 'گروه'} · ${data.profile.organizationalUnit}`,
                          },
                        ].map((row, idx) => (
                          <tr key={idx}>
                            <td className={`py-2.5 px-3 font-medium w-48 sm:w-56 ${textMuted}`}>{row.k}</td>
                            <td className={`py-2.5 px-3 font-semibold break-words ${textPrimary}`}>{row.v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ====================================================================
          TAB 6: USER CHECK HISTORY (SCOPED PER OPERATOR OR FULL ACCESS)
          ==================================================================== */}
      {ram.activeSubTab === 'history' && (
        <div className="space-y-6">
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                label: isEn ? 'Total Recorded Checks' : 'کل بررسی‌های ثبت‌شده',
                value: historyStats?.totalChecks ?? historyTotal,
                accent: 'text-sky-500',
              },
              {
                label: isEn ? 'Unique Domain Users' : 'کاربران یکتای بررسی‌شده',
                value: historyStats?.uniqueUsers ?? 0,
                accent: 'text-indigo-500',
              },
              {
                label: isEn ? 'Successful Lookups' : 'استعلام‌های موفق',
                value: historyStats?.successCount ?? 0,
                accent: 'text-emerald-500',
              },
              {
                label: isEn ? 'Locked Seen / Failed' : 'اکانت قفل‌شده / ناموفق',
                value: `${historyStats?.lockedSeenCount ?? 0} / ${historyStats?.failedCount ?? 0}`,
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

          {/* Search, Filters & Actions Bar */}
          <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn ? 'Target User Inspection & Unlock History' : 'تاریخچه بررسی و پشتیبانی کاربران دامین'}
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
                      ? 'Your Checks Only'
                      : 'فقط بررسی‌های شخصی شما'}
                  </span>
                </div>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {historyScope === 'all'
                    ? isEn
                      ? 'Displays all operators’ target AD user checks, lockout states, mailbox usage snapshots, and 1-click re-inspect (passwords are never stored).'
                      : 'نمایش تمام کاربران بررسی‌شده توسط همه کارشناسان همراه با وضعیت قفل، میل‌باکس و بررسی مجدد فوری (هیچ رمزی ذخیره نمی‌شود).'
                    : isEn
                    ? 'Scoped exclusively to domain users you inspected or unlocked yourself — other operators’ checks stay hidden.'
                    : 'محدود به کاربرانی که خودتان استعلام یا آنلاک کرده‌اید (فقط سوپرادمین یا کاربر دارای مجوز دسترسی همه تاریخچه را می‌بیند).'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadUserCheckHistory()}
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
                  onClick={handleExportUserHistoryCsv}
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

                {canUnlockAccount &&
                  (confirmClearHistory ? (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busyHistoryId !== null}
                        onClick={handleClearAllUserHistory}
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
                      disabled={(historyStats?.totalChecks ?? historyTotal) === 0 || busyHistoryId !== null}
                      onClick={() => setConfirmClearHistory(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-semibold transition cursor-pointer disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Clear History' : 'پاک‌سازی تاریخچه'}</span>
                    </button>
                  ))}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setHistoryPage(1);
                setHistorySearch(historySearchInput.trim());
                loadUserCheckHistory({ page: 1, search: historySearchInput.trim() });
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
                      ? 'Search username, full name, department, email or operator...'
                      : 'جستجو بر اساس نام کاربری، نام کامل، دپارتمان، ایمیل یا اپراتور...'
                  }
                  className={`w-full ps-9 pe-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                />
              </div>

              <div className="lg:col-span-2">
                <select
                  value={historyStatusFilter}
                  onChange={(e) => {
                    const next = e.target.value as 'all' | 'success' | 'failed';
                    setHistoryStatusFilter(next);
                    setHistoryPage(1);
                    loadUserCheckHistory({ page: 1, status: next });
                  }}
                  className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="all">{isEn ? 'All Statuses' : 'همه وضعیت‌ها'}</option>
                  <option value="success">{isEn ? 'Success' : 'موفق'}</option>
                  <option value="failed">{isEn ? 'Failed' : 'ناموفق'}</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <select
                  value={historyActionFilter}
                  onChange={(e) => {
                    const next = e.target.value as 'all' | 'inspect' | 'unlock';
                    setHistoryActionFilter(next);
                    setHistoryPage(1);
                    loadUserCheckHistory({ page: 1, actionType: next });
                  }}
                  className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="all">{isEn ? 'All Actions' : 'همه عملیات‌ها'}</option>
                  <option value="inspect">{isEn ? 'User Inspect' : 'پایش کاربر'}</option>
                  <option value="unlock">{isEn ? 'Account Unlock' : 'رفع قفل اکانت'}</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <select
                  value={historyPageSize}
                  onChange={(e) => {
                    const nextSize = Number(e.target.value) || 15;
                    setHistoryPageSize(nextSize);
                    setHistoryPage(1);
                    loadUserCheckHistory({ page: 1, pageSize: nextSize });
                  }}
                  className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value={10}>10 {isEn ? 'per page' : 'ردیف در صفحه'}</option>
                  <option value={15}>15 {isEn ? 'per page' : 'ردیف در صفحه'}</option>
                  <option value={25}>25 {isEn ? 'per page' : 'ردیف در صفحه'}</option>
                  <option value={50}>50 {isEn ? 'per page' : 'ردیف در صفحه'}</option>
                </select>
              </div>

              <div className="lg:col-span-1 flex items-center gap-1.5">
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

            {/* User Check History Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[900px] text-xs border-collapse">
                <thead className={isLightMode ? 'bg-slate-50 text-slate-600' : 'bg-slate-950 text-slate-400'}>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Date & Time' : 'تاریخ و زمان'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Target Domain User' : 'کاربر دامین هدف'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Role & Email' : 'سمت، دپارتمان و ایمیل'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Security & Mailbox' : 'وضعیت امنیتی و میل‌باکس'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'DC & Operator' : 'دامین کنترلر و اپراتور'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Status' : 'وضعیت'}</th>
                    <th className="py-2.5 px-3 text-end font-semibold">{isEn ? 'Actions' : 'عملیات'}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                  {loadingHistory && historyItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={`py-8 text-center ${textMuted}`}>
                        <Loader2 className="w-5 h-5 mx-auto animate-spin text-sky-500 mb-2" />
                        <span>{isEn ? 'Loading check history...' : 'در حال بارگذاری تاریخچه بررسی‌ها...'}</span>
                      </td>
                    </tr>
                  ) : historyItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={`py-10 text-center ${textMuted}`}>
                        <Clock className="w-7 h-7 mx-auto opacity-50 mb-2" />
                        <div>
                          {isEn
                            ? 'No domain user check history records match your filter.'
                            : 'هیچ سابقه بررسی کاربر با این فیلتر یافت نشد.'}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    historyItems.map((item) => {
                      const isSuccess = item.status === 'success';
                      const sam = item.samAccountName || item.queryTarget;
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
                                  item.actionType === 'unlock'
                                    ? 'bg-amber-500/15 text-amber-500'
                                    : 'bg-sky-500/15 text-sky-500'
                                }`}
                              >
                                {item.actionType === 'unlock'
                                  ? isEn
                                    ? 'Unlock'
                                    : 'آنلاک'
                                  : isEn
                                  ? 'Inspect'
                                  : 'پایش'}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-xs">
                              <span className={textPrimary}>{item.displayName || sam}</span>
                            </div>
                            <div className="inline-flex items-center gap-1 mt-0.5">
                              <span className={`font-mono text-[11px] ${textMuted}`} dir="ltr">
                                @{sam}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(sam, `hist-${item.id}`)}
                                title={isEn ? 'Copy username' : 'کپی نام کاربری'}
                                className={`p-0.5 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700/60 cursor-pointer ${textMuted}`}
                              >
                                {copiedKey === `hist-${item.id}` ? (
                                  <Check className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className={`text-xs truncate max-w-[200px] ${textPrimary}`}>
                              {[item.jobTitle, item.department].filter(Boolean).join(' · ') || '—'}
                            </div>
                            <div className={`text-[11px] font-mono truncate max-w-[210px] ${textMuted}`} dir="ltr">
                              {item.primaryEmail || item.domainName || '—'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap items-center gap-1">
                              {item.accountLocked !== null && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                    item.accountLocked
                                      ? 'bg-rose-500/15 text-rose-500'
                                      : 'bg-emerald-500/15 text-emerald-500'
                                  }`}
                                >
                                  {item.accountLocked
                                    ? isEn
                                      ? 'Locked'
                                      : 'قفل'
                                    : isEn
                                    ? 'Unlocked'
                                    : 'باز'}
                                </span>
                              )}
                              {item.passwordExpired === true && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-500">
                                  {isEn ? 'Pwd Expired' : 'رمز منقضی'}
                                </span>
                              )}
                            </div>
                            {item.mailboxUsedBytes !== null && (
                              <div className={`mt-1 text-[10px] font-mono tabular-nums ${textMuted}`} dir="ltr">
                                {formatBytesHuman(item.mailboxUsedBytes, isEn)}
                                {item.mailboxQuotaBytes
                                  ? ` / ${formatBytesHuman(item.mailboxQuotaBytes, isEn)}`
                                  : ''}
                                {item.mailboxUsedPercent !== null ? ` (${item.mailboxUsedPercent}%)` : ''}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className={`font-mono text-[11px] ${textPrimary}`} dir="ltr">
                              {item.domainController || '—'}
                              {item.portUsed ? `:${item.portUsed}` : ''}
                            </div>
                            <div className={`text-[10px] flex items-center gap-1.5 ${textMuted}`}>
                              <span className="font-mono uppercase">{item.methodUsed}</span>
                              {item.actorName && (
                                <>
                                  <span>·</span>
                                  <span>
                                    {isEn ? 'By' : 'توسط'}: {item.actorName}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              title={item.errorMessage || undefined}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border whitespace-nowrap ${
                                isSuccess
                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                                  : 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                              }`}
                            >
                              {isSuccess ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : (
                                <AlertCircle className="w-3 h-3" />
                              )}
                              <span>
                                {isSuccess ? (isEn ? 'Success' : 'موفق') : isEn ? 'Failed' : 'ناموفق'}
                              </span>
                            </span>
                            {!isSuccess && item.errorMessage && (
                              <div className="mt-0.5 text-[10px] truncate max-w-[160px] text-rose-400">
                                {item.errorMessage}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-end whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={!canInspectUsers}
                                onClick={() => handleReinspectFromHistory(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-[11px] font-semibold transition cursor-pointer"
                              >
                                <Search className="w-3 h-3" />
                                <span>{isEn ? 'Re-Inspect' : 'بررسی مجدد'}</span>
                              </button>
                              {canUnlockAccount && (
                                <button
                                  type="button"
                                  disabled={busyHistoryId !== null}
                                  onClick={() => handleDeleteUserHistoryItem(item.id)}
                                  title={isEn ? 'Delete record' : 'حذف ردیف'}
                                  className="p-1.5 rounded-md border border-rose-500/30 hover:bg-rose-500/10 text-rose-500 transition cursor-pointer disabled:opacity-40"
                                >
                                  {busyHistoryId === item.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {historyTotal > 0 && (() => {
              const totalHistPages = Math.max(1, Math.ceil(historyTotal / historyPageSize));
              const startIdx = (historyPage - 1) * historyPageSize + 1;
              const endIdx = Math.min(historyPage * historyPageSize, historyTotal);
              return (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                  <div className={textMuted}>
                    {isEn
                      ? `Showing ${startIdx}–${endIdx} of ${historyTotal} checks`
                      : `نمایش ${startIdx} تا ${endIdx} از ${historyTotal} بررسی`}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={historyPage <= 1 || loadingHistory}
                      onClick={() => {
                        const p = Math.max(1, historyPage - 1);
                        setHistoryPage(p);
                        loadUserCheckHistory({ page: p });
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
                        loadUserCheckHistory({ page: p });
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
