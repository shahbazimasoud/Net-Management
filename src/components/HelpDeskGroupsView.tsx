import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Users,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Search,
  FolderTree,
  Calendar,
  Clock,
  UserCheck,
  Building2,
  Mail,
  Server,
  Monitor,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  Eraser,
  Copy,
  Check,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronRight,
  ChevronLeft,
  History,
  FileText,
  Download,
  Printer,
  ClipboardCopy,
  Trash2,
  RotateCcw,
  RefreshCw,
  ArrowUpRight,
  Layers,
  GitBranch,
  FileCode2,
  X,
} from 'lucide-react';
import { AccessPolicy } from '../types';
import { AuthUser } from '../context/AuthContext';
import { isUserDomainAdmin, isUserSuperAdmin } from '../utils/rbac';
import { isTabAllowed } from '../services/settingsStorage';
import { FieldInfoTooltip } from './common/FieldInfoTooltip';
import { TimeoutAntivirusHint } from './helpdesk/TimeoutAntivirusHint';
import {
  HelpdeskGroupSubTab,
  getHelpdeskGroupRamSnapshot,
  subscribeHelpdeskGroupRam,
  patchHelpdeskGroupRamSnapshot,
  bindHelpdeskGroupRamOwner,
  wipeHelpdeskGroupRamSession,
  revokeDelegatedGroupCredential,
  hasActiveHelpdeskGroupAuth,
  exportGroupCredentialForUserHandoff,
  runHelpdeskGroupSearch,
  runHelpdeskGroupInspect,
} from '../services/helpdeskGroupRamSession';
import {
  handoffUserInspectionFromGroupSession,
  runHelpdeskUserInspect,
} from '../services/helpdeskUserRamSession';
import {
  HelpdeskGroupHistoryItem,
  HelpdeskGroupHistoryResponse,
  HelpdeskGroupMemberEntry,
  fetchHelpdeskStatus,
  fetchHelpdeskGroupHistory,
  deleteHelpdeskGroupHistoryItem,
  clearHelpdeskGroupHistory,
} from '../services/api';

interface HelpDeskGroupsViewProps {
  isLightMode: boolean;
  isEn: boolean;
  effectivePolicy?: AccessPolicy | null;
  currentUser?: AuthUser | null;
  onNavigateToEndpointHelpdesk?: () => void;
  onNavigateToUserHelpdesk?: () => void;
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

function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function scopeLabel(scope: string, isEn: boolean): string {
  switch (scope) {
    case 'Global':
      return isEn ? 'Global' : 'Global (سراسری دامین)';
    case 'DomainLocal':
      return isEn ? 'Domain Local' : 'Domain Local (منابع محلی)';
    case 'Universal':
      return isEn ? 'Universal' : 'Universal (کل فارست)';
    case 'BuiltinLocal':
      return isEn ? 'Built-in Local' : 'Built-in Local (سیستمی)';
    default:
      return scope || (isEn ? 'Unknown' : 'نامشخص');
  }
}

function categoryLabel(cat: string, isEn: boolean): string {
  if (cat === 'Distribution') return isEn ? 'Distribution (Email)' : 'توزیع ایمیل (Distribution)';
  return isEn ? 'Security Group' : 'امنیتی (Security)';
}

export const HelpDeskGroupsView: React.FC<HelpDeskGroupsViewProps> = ({
  isLightMode,
  isEn,
  effectivePolicy,
  currentUser,
  onNavigateToEndpointHelpdesk,
  onNavigateToUserHelpdesk,
}) => {
  const ram = useSyncExternalStore(subscribeHelpdeskGroupRam, getHelpdeskGroupRamSnapshot);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [reinspectBanner, setReinspectBanner] = useState<{ targetGroup: string } | null>(null);

  // Directory Search picker state
  const [showGroupBrowser, setShowGroupBrowser] = useState(false);
  const [browserQuery, setBrowserQuery] = useState('');

  // Members sub-tab filters & add/remove UI
  const [memberViewMode, setMemberViewMode] = useState<
    'all' | 'users' | 'groups' | 'computers' | 'primary' | 'inherited'
  >('all');
  const [memberSearch, setMemberSearch] = useState('');

  // ACL filter
  const [aclSearch, setAclSearch] = useState('');
  const [showInheritedAcls, setShowInheritedAcls] = useState(false);

  // Check History state
  const [historyScope, setHistoryScope] = useState<'all' | 'own'>('own');
  const [historyItems, setHistoryItems] = useState<HelpdeskGroupHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyStats, setHistoryStats] = useState<HelpdeskGroupHistoryResponse['stats'] | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(15);
  const [historySearch, setHistorySearch] = useState('');
  const [historySearchInput, setHistorySearchInput] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [historyActionFilter, setHistoryActionFilter] = useState<
    'all' | 'inspect' | 'add_member' | 'remove_member'
  >('all');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyHistoryId, setBusyHistoryId] = useState<string | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  useEffect(() => {
    bindHelpdeskGroupRamOwner(currentUser?.id || currentUser?.username || null);
  }, [currentUser?.id, currentUser?.username]);

  const isSuper = isUserSuperAdmin(currentUser, effectivePolicy);
  const isDomAdmin = isUserDomainAdmin(currentUser);
  const hasFull = isSuper || isDomAdmin;
  const canInspectGroups =
    hasFull ||
    (effectivePolicy?.canViewHelpdeskGroups !== undefined
      ? effectivePolicy.canViewHelpdeskGroups === true
      : effectivePolicy?.canViewHelpdesk === true &&
        effectivePolicy?.canInspectHelpdeskDomainUsers === true);
  const canManageGroupHistory =
    hasFull ||
    (canInspectGroups &&
      (effectivePolicy?.canUnlockHelpdeskDomainUsers !== undefined
        ? effectivePolicy.canUnlockHelpdeskDomainUsers === true
        : effectivePolicy?.canExecuteHelpdeskActions === true));
  const canViewAllHistory =
    hasFull ||
    (canInspectGroups && effectivePolicy?.canViewAllHelpdeskHistory === true);
  const canOpenUserHelpdesk =
    Boolean(onNavigateToUserHelpdesk) &&
    canInspectGroups &&
    (!effectivePolicy || isTabAllowed('helpdesk-users', effectivePolicy, currentUser));

  const handleInspectUserInHelpdesk = (member: HelpdeskGroupMemberEntry) => {
    if (!canOpenUserHelpdesk || !onNavigateToUserHelpdesk) return;
    const targetUsername = (member.samAccountName || member.email || member.dn || '').trim();
    if (!targetUsername) return;

    const ownerUserId = currentUser?.id || currentUser?.username || ram.ownerUserId || null;
    const creds = exportGroupCredentialForUserHandoff();
    const { canAutoInspect } = handoffUserInspectionFromGroupSession({
      ownerUserId,
      targetUsername,
      adminUsername: creds?.adminUsername || ram.adminUsername,
      adminPassword: creds?.adminPassword || '',
      domainController:
        ram.domainController.trim() || ram.groupData?.connectionInfo?.domainController || '',
      ldapProtocol: ram.ldapProtocol,
      winrmProtocol: ram.winrmProtocol,
    });

    onNavigateToUserHelpdesk();
    if (canAutoInspect) {
      void runHelpdeskUserInspect(targetUsername);
    }
  };

  useEffect(() => {
    fetchHelpdeskStatus()
      .then((res) => {
        if (res?.rateLimit) {
          patchHelpdeskGroupRamSnapshot({ rateLimit: res.rateLimit });
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

  const isDelegatedSession = Boolean(ram.delegatedAuth?.active) && !ram.adminPassword;
  const canUseCurrentCreds = hasActiveHelpdeskGroupAuth(ram);

  useEffect(() => {
    if (isDelegatedSession && showPassword) {
      setShowPassword(false);
    }
  }, [isDelegatedSession, showPassword]);

  useEffect(() => {
    if (ram.pendingCredentialPromptGroup && !canUseCurrentCreds) {
      setReinspectBanner({ targetGroup: ram.pendingCredentialPromptGroup });
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 60);
    }
  }, [ram.pendingCredentialPromptGroup, canUseCurrentCreds]);

  const loadGroupCheckHistory = async (overrides?: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: 'all' | 'success' | 'failed';
    actionType?: 'all' | 'inspect' | 'add_member' | 'remove_member';
  }) => {
    if (!canInspectGroups) return;
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const p = overrides?.page ?? historyPage;
      const ps = overrides?.pageSize ?? historyPageSize;
      const srch = overrides?.search ?? historySearch;
      const st = overrides?.status ?? historyStatusFilter;
      const act = overrides?.actionType ?? historyActionFilter;
      const res = await fetchHelpdeskGroupHistory({
        page: p,
        pageSize: ps,
        search: srch,
        status: st,
        actionType: act,
      });
      setHistoryItems(res.items || []);
      setHistoryTotal(res.total || 0);
      setHistoryStats(res.stats || null);
      if (res.scope) setHistoryScope(res.scope);
    } catch (err: any) {
      setHistoryError(
        err?.message ||
          (isEn ? 'Failed to load AD group check history' : 'خطا در دریافت تاریخچه بررسی گروه‌های دامین')
      );
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (ram.activeSubTab === 'history') {
      loadGroupCheckHistory();
    }
  }, [
    ram.activeSubTab,
    historyPage,
    historyPageSize,
    historySearch,
    historyStatusFilter,
    historyActionFilter,
  ]);

  const handleDeleteHistoryItem = async (id: string) => {
    if (!canManageGroupHistory) return;
    setBusyHistoryId(id);
    setHistoryNotice(null);
    try {
      await deleteHelpdeskGroupHistoryItem(id);
      setHistoryNotice({
        ok: true,
        text: isEn ? 'History record removed.' : 'رکورد تاریخچه با موفقیت حذف شد.',
      });
      await loadGroupCheckHistory();
    } catch (err: any) {
      setHistoryNotice({
        ok: false,
        text: err?.message || (isEn ? 'Delete failed' : 'حذف رکورد ناموفق بود'),
      });
    } finally {
      setBusyHistoryId(null);
    }
  };

  const handleClearHistory = async () => {
    if (!canManageGroupHistory) return;
    setBusyHistoryId('ALL');
    setHistoryNotice(null);
    try {
      const res = await clearHelpdeskGroupHistory();
      setConfirmClearHistory(false);
      setHistoryNotice({
        ok: true,
        text: isEn
          ? `Cleared ${res.clearedCount} history record(s).`
          : `${res.clearedCount} رکورد از تاریخچه پاک‌سازی شد.`,
      });
      await loadGroupCheckHistory({ page: 1 });
    } catch (err: any) {
      setHistoryNotice({
        ok: false,
        text: err?.message || (isEn ? 'Clear failed' : 'پاک‌سازی ناموفق بود'),
      });
    } finally {
      setBusyHistoryId(null);
    }
  };

  const handleReinspectFromHistory = (targetGroup: string, dcHint?: string) => {
    if (!canInspectGroups) return;
    patchHelpdeskGroupRamSnapshot({
      targetGroup,
      ...(dcHint ? { domainController: dcHint } : {}),
    });
    if (canUseCurrentCreds) {
      setReinspectBanner(null);
      patchHelpdeskGroupRamSnapshot({ activeSubTab: 'overview' });
      runHelpdeskGroupInspect(targetGroup);
    } else {
      setReinspectBanner({ targetGroup });
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 60);
    }
  };

  const handleCopy = (key: string, value: string) => {
    if (!value) return;
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
  };

  const handleSubmitInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canInspectGroups) return;
    setReinspectBanner(null);
    await runHelpdeskGroupInspect();
  };

  const handleSearchDirectoryGroups = async () => {
    if (!canInspectGroups) return;
    setShowGroupBrowser(true);
    await runHelpdeskGroupSearch(browserQuery);
  };

  const data = ram.groupData;

  const displayedMembers = useMemo(() => {
    if (!data) return [] as HelpdeskGroupMemberEntry[];
    let pool: HelpdeskGroupMemberEntry[] = [];
    if (memberViewMode === 'primary') {
      pool = data.primaryGroupMembers || [];
    } else if (memberViewMode === 'inherited') {
      pool = data.effectiveInheritedMembers || [];
    } else {
      const combined = [...(data.directMembers || []), ...(data.primaryGroupMembers || [])];
      if (memberViewMode === 'users') {
        pool = combined.filter((m) => m.objectType === 'user');
      } else if (memberViewMode === 'groups') {
        pool = combined.filter((m) => m.objectType === 'group');
      } else if (memberViewMode === 'computers') {
        pool = combined.filter((m) => m.objectType === 'computer');
      } else {
        pool = combined;
      }
    }

    const q = memberSearch.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (m) =>
        m.samAccountName.toLowerCase().includes(q) ||
        m.displayName.toLowerCase().includes(q) ||
        m.cn.toLowerCase().includes(q) ||
        m.department.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.organizationalUnit.toLowerCase().includes(q) ||
        (m.viaGroupCn || '').toLowerCase().includes(q)
    );
  }, [data, memberViewMode, memberSearch]);

  const displayedAcls = useMemo(() => {
    if (!data) return [];
    const q = aclSearch.trim().toLowerCase();
    return data.permissions.aclEntries.filter((ace) => {
      if (!showInheritedAcls && ace.isInherited && !ace.isPrivilegeWrite) return false;
      if (!q) return true;
      return (
        ace.trustee.toLowerCase().includes(q) ||
        ace.rightsLabelEn.toLowerCase().includes(q) ||
        ace.rightsLabelFa.toLowerCase().includes(q)
      );
    });
  }, [data, aclSearch, showInheritedAcls]);

  const buildTicketSummaryText = (): string => {
    if (!data) return '';
    const totalMem =
      data.membershipSummary.totalDirectMembers + data.membershipSummary.totalPrimaryGroupMembers;

    if (isEn) {
      return [
        `=== AD Group Support Dossier (${data.identity.cn}) ===`,
        `SAM Account Name: ${data.identity.samAccountName}`,
        `Scope & Category: ${scopeLabel(data.identity.groupScope, true)} · ${categoryLabel(data.identity.groupCategory, true)}`,
        `Privilege Level: ${data.identity.privilegeLevel.toUpperCase()}${data.identity.adminCount ? ' (AdminSDHolder Protected)' : ''}`,
        `Organizational Unit (OU): ${data.identity.organizationalUnit}`,
        `Distinguished Name: ${data.identity.distinguishedName}`,
        `Created At: ${formatDateDisplay(data.lifecycleAndOwnership.whenCreated, true)}`,
        `Creator / AD Owner: ${data.lifecycleAndOwnership.creatorAccount || data.lifecycleAndOwnership.objectOwner || '-'}`,
        `Managed By: ${data.lifecycleAndOwnership.managedBy?.displayName || '-'}`,
        `Members: ${totalMem} direct/primary (+${data.membershipSummary.totalInheritedUsers} inherited via nested groups)`,
        `Parent Groups (memberOf): ${data.parentGroups.map((p) => p.cn).join(', ') || 'None'}`,
        `Plain-Language Permissions: ${data.permissions.plainSummaryEn}`,
        `Collected: ${formatDateDisplay(data.collectedAt, true)} via ${data.connectionInfo.domainController}`,
      ].join('\n');
    }

    return [
      `=== گزارش پشتیبانی گروه اکتیو دایرکتوری (${data.identity.cn}) ===`,
      `نام سیستمی (SAM): ${data.identity.samAccountName}`,
      `محدوده و نوع گروه: ${scopeLabel(data.identity.groupScope, false)} · ${categoryLabel(data.identity.groupCategory, false)}`,
      `سطح حساسیت: ${data.identity.privilegeLevel}${data.identity.adminCount ? ' (محافظت‌شده AdminSDHolder)' : ''}`,
      `مسیر OU: ${data.identity.organizationalUnit}`,
      `مسیر کامل DN: ${data.identity.distinguishedName}`,
      `تاریخ ساخت: ${formatDateDisplay(data.lifecycleAndOwnership.whenCreated, false)}`,
      `سازنده / مالک آبجکت: ${data.lifecycleAndOwnership.creatorAccount || data.lifecycleAndOwnership.objectOwner || '-'}`,
      `مدیر مسئول (ManagedBy): ${data.lifecycleAndOwnership.managedBy?.displayName || '-'}`,
      `تعداد اعضا: ${totalMem} عضو مستقیم/اصلی (+${data.membershipSummary.totalInheritedUsers} عضو غیرمستقیم از زیرگروه‌ها)`,
      `عضو گروه‌های والد: ${data.parentGroups.map((p) => p.cn).join('، ') || 'ندارد'}`,
      `خلاصه پرمیژن‌ها به زبان ساده: ${data.permissions.plainSummaryFa}`,
      `زمان گزارش: ${formatDateDisplay(data.collectedAt, false)} از دامین کنترلر ${data.connectionInfo.domainController}`,
    ].join('\n');
  };

  const handleDownloadCsvReport = () => {
    if (!data) return;
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows: Array<[string, string]> = [
      ['Report Generated At', formatDateDisplay(data.collectedAt, isEn)],
      ['Group Name (CN)', data.identity.cn],
      ['SAM Account Name', data.identity.samAccountName],
      ['Scope', data.identity.groupScope],
      ['Category', data.identity.groupCategory],
      ['Privilege Level', data.identity.privilegeLevel],
      ['AdminSDHolder Protected', String(data.identity.adminCount)],
      ['Domain', data.identity.domainName],
      ['Domain Controller', `${data.connectionInfo.domainController}:${data.connectionInfo.port} (${data.connectionInfo.method})`],
      ['Organizational Unit', data.identity.organizationalUnit],
      ['Distinguished Name', data.identity.distinguishedName],
      ['Object SID', data.identity.objectSid],
      ['Created At', formatDateDisplay(data.lifecycleAndOwnership.whenCreated, isEn)],
      ['Modified At', formatDateDisplay(data.lifecycleAndOwnership.whenChanged, isEn)],
      ['Creator / Object Owner', data.lifecycleAndOwnership.creatorAccount || data.lifecycleAndOwnership.objectOwner],
      ['Managed By', data.lifecycleAndOwnership.managedBy?.displayName || ''],
      ['Primary Email', data.mailAndExchange.primaryEmail],
      ['Direct Members Count', String(data.membershipSummary.totalDirectMembers)],
      ['Primary Group Members Count', String(data.membershipSummary.totalPrimaryGroupMembers)],
      ['Inherited Members Count', String(data.membershipSummary.totalInheritedUsers)],
      ['Parent Groups', data.parentGroups.map((p) => p.cn).join('; ')],
      ['Plain Summary', isEn ? data.permissions.plainSummaryEn : data.permissions.plainSummaryFa],
      ['Direct Members List', data.directMembers.map((m) => `${m.samAccountName} (${m.objectType})`).join('; ')],
    ];
    const csv = '\uFEFF' + ['Field,Value', ...rows.map(([k, v]) => `${esc(k)},${esc(v)}`)].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ad_group_report_${data.identity.samAccountName || 'group'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJsonReport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), groupInspection: data }, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ad_group_dossier_${data.identity.samAccountName || 'group'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadHtmlReport = () => {
    if (!data) return;
    const dir = isEn ? 'ltr' : 'rtl';
    const lang = isEn ? 'en' : 'fa';
    const title = isEn
      ? `AD Group Support Dossier — ${data.identity.cn}`
      : `گزارش جامع گروه اکتیو دایرکتوری — ${data.identity.cn}`;

    const insightsHtml = data.permissions.insights
      .map(
        (ins) => `
      <div class="insight ${escapeHtml(ins.severity)}">
        <div class="ititle">${escapeHtml(isEn ? ins.titleEn : ins.titleFa)}</div>
        <div class="idesc">${escapeHtml(isEn ? ins.summaryEn : ins.summaryFa)}</div>
        <div class="inote">${escapeHtml(isEn ? ins.howItWorksEn : ins.howItWorksFa)}</div>
      </div>`
      )
      .join('');

    const membersHtml = [...data.directMembers, ...data.primaryGroupMembers]
      .slice(0, 200)
      .map(
        (m) =>
          `<tr><td><code>${escapeHtml(m.samAccountName)}</code></td><td>${escapeHtml(m.displayName)}</td><td>${escapeHtml(
            m.objectType
          )}</td><td>${escapeHtml(m.department || '-')}</td><td>${escapeHtml(m.organizationalUnit)}</td></tr>`
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
    .sheet { max-width: 1000px; margin: 0 auto; background: #fff; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden; }
    .hero { background: linear-gradient(135deg, #0f172a 0%, #0f766e 100%); color: #fff; padding: 24px 28px; }
    .hero h1 { margin: 0 0 6px; font-size: 20px; }
    .hero p { margin: 0; font-size: 12px; opacity: 0.9; }
    .sec { padding: 20px 26px; border-top: 1px solid #e2e8f0; }
    .sec h2 { margin: 0 0 12px; font-size: 14px; color: #0f766e; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; }
    .k { font-size: 11px; color: #64748b; }
    .v { font-size: 13px; font-weight: 600; word-break: break-word; margin-top: 3px; }
    .insight { padding: 10px 14px; border-radius: 10px; margin-bottom: 8px; border: 1px solid #e2e8f0; }
    .insight.critical { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
    .insight.high { background: #fffbeb; border-color: #fde68a; color: #92400e; }
    .insight.medium { background: #eff6ff; border-color: #bfdbfe; color: #1e40af; }
    .insight.info { background: #f8fafc; border-color: #cbd5e1; color: #1e293b; }
    .ititle { font-weight: 700; font-size: 13px; }
    .idesc { font-size: 12px; margin-top: 3px; }
    .inote { font-size: 11px; opacity: 0.8; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 7px 8px; text-align: start; }
    th { background: #f1f5f9; color: #475569; font-size: 11px; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="hero">
      <h1>${escapeHtml(data.identity.cn)} (${escapeHtml(data.identity.samAccountName)})</h1>
      <p>${escapeHtml(scopeLabel(data.identity.groupScope, isEn))} · ${escapeHtml(categoryLabel(data.identity.groupCategory, isEn))} · ${escapeHtml(data.identity.organizationalUnit)}</p>
    </div>
    <div class="sec">
      <h2>${escapeHtml(isEn ? '1. Creation, Ownership & Location' : '۱. زمان ساخت، سازنده و مسیر OU')}</h2>
      <div class="grid">
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Created At' : 'تاریخ ساخت')}</div><div class="v">${escapeHtml(formatDateDisplay(data.lifecycleAndOwnership.whenCreated, isEn))}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Creator / Object Owner' : 'سازنده / مالک آبجکت')}</div><div class="v">${escapeHtml(data.lifecycleAndOwnership.creatorAccount || data.lifecycleAndOwnership.objectOwner || '-')}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Organizational Unit' : 'مسیر OU')}</div><div class="v">${escapeHtml(data.identity.organizationalUnit)}</div></div>
        <div class="card"><div class="k">${escapeHtml(isEn ? 'Managed By' : 'مدیر مسئول')}</div><div class="v">${escapeHtml(data.lifecycleAndOwnership.managedBy?.displayName || '-')}</div></div>
      </div>
    </div>
    <div class="sec">
      <h2>${escapeHtml(isEn ? '2. Plain-Language Permissions' : '۲. پرمیژن‌ها و سطح دسترسی به زبان ساده')}</h2>
      <p style="font-size:13px;font-weight:600;margin-bottom:12px;">${escapeHtml(isEn ? data.permissions.plainSummaryEn : data.permissions.plainSummaryFa)}</p>
      ${insightsHtml}
    </div>
    <div class="sec">
      <h2>${escapeHtml(isEn ? '3. Members List' : '۳. لیست اعضا')}</h2>
      <table>
        <thead><tr><th>SAM</th><th>Name</th><th>Type</th><th>Dept</th><th>OU</th></tr></thead>
        <tbody>${membersHtml}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ad_group_dossier_${data.identity.samAccountName || 'group'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Theme tokens matching HelpDeskUsersView identically
  const surfaceBg = isLightMode
    ? 'bg-white border-slate-200 shadow-sm'
    : 'bg-slate-900/80 border-slate-800 shadow-lg';
  const subCardBg = isLightMode
    ? 'bg-slate-50 border-slate-200'
    : 'bg-slate-950/60 border-slate-800/90';
  const textPrimary = isLightMode ? 'text-slate-900' : 'text-slate-100';
  const textMuted = isLightMode ? 'text-slate-500' : 'text-slate-400';
  const inputCls = isLightMode
    ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white'
    : 'bg-slate-950/80 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-teal-500';

  const tabs: Array<{
    id: HelpdeskGroupSubTab;
    labelEn: string;
    labelFa: string;
    icon: React.FC<{ className?: string }>;
    badge?: string | number | null;
  }> = [
    {
      id: 'overview',
      labelEn: 'Overview, Creator & OU',
      labelFa: 'هویت، سازنده و مسیر OU',
      icon: FolderTree,
    },
    {
      id: 'members',
      labelEn: 'Members & Nested Groups',
      labelFa: 'اعضا و زیرگروه‌ها',
      icon: Users,
      badge: data
        ? data.membershipSummary.totalDirectMembers + data.membershipSummary.totalPrimaryGroupMembers
        : null,
    },
    {
      id: 'permissions',
      labelEn: 'Permissions (Plain Guide)',
      labelFa: 'پرمیژن‌ها و سطح دسترسی (ساده)',
      icon: ShieldCheck,
      badge: data ? data.permissions.insights.length : null,
    },
    {
      id: 'reports',
      labelEn: 'Management Reports',
      labelFa: 'گزارش‌های مدیریتی',
      icon: FileText,
    },
    {
      id: 'history',
      labelEn: 'Check History',
      labelFa: 'تاریخچه بررسی‌ها',
      icon: History,
    },
  ];

  const NavArrow = isEn ? ChevronRight : ChevronLeft;

  const totalMembersDisplay = data
    ? data.membershipSummary.totalDirectMembers + data.membershipSummary.totalPrimaryGroupMembers
    : 0;

  if (!canInspectGroups) {
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
              ? 'Access Denied — Active Directory & Group Support HelpDesk'
              : 'عدم دسترسی — هلپ‌دسک پشتیبانی گروه‌های اکتیو دایرکتوری'}
          </h2>
          <p className={`text-xs leading-relaxed ${textMuted}`}>
            {isEn
              ? 'Your active RBAC policy does not grant permission to access Active Directory & Group Support HelpDesk (canViewHelpdeskGroups). Please contact your system administrator to request access.'
              : 'پالیسی دسترسی فعلی شما فاقد مجوز ورود و استعلام در صفحه پشتیبانی گروه‌های دامین (canViewHelpdeskGroups) است. در صورت نیاز با مدیر سیستم تماس بگیرید.'}
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
            <Users className="w-6 h-6 text-teal-500 shrink-0" />
            <h1 className={`text-xl font-bold tracking-tight ${textPrimary}`}>
              {isEn
                ? 'Active Directory & Group Support HelpDesk'
                : 'هلپ‌دسک پشتیبانی گروه‌های اکتیو دایرکتوری (Group Support)'}
            </h1>
          </div>
          <p className={`mt-1 text-xs ${textMuted}`}>
            {isEn
              ? 'On-Demand Target Group Lookup · Creation Time & Creator · OU Path · Direct, Primary & Nested Members · Plain-Language Permissions Breakdown'
              : 'استعلام لحظه‌ای گروه‌های دامین · تاریخ ساخت و سازنده گروه · مسیر OU · اعضای مستقیم، Primary و زیرگروه‌ها · تشریح شفاف و ساده تمام پرمیژن‌ها و GPOها'}
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

      {/* Top On-Demand Target Group Connection Card */}
      <form
        onSubmit={handleSubmitInspect}
        className={`rounded-xl border p-4 sm:p-5 space-y-4 overflow-hidden ${surfaceBg}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold min-w-0">
            <Shield className="w-4 h-4 text-teal-500 shrink-0" />
            <span className={`truncate ${textPrimary}`}>
              {isEn ? 'On-Demand Target Group' : 'اتصال و استعلام لحظه‌ای گروه دامین (On-Demand Target Group)'}
            </span>
            <FieldInfoTooltip
              isEn={isEn}
              isLightMode={isLightMode}
              fieldName={isEn ? 'On-Demand Target Group' : 'استعلام لحظه‌ای گروه دامین'}
              whatIsIt={
                isEn
                  ? 'Queries Active Directory directly via LDAPS/LDAP and DC Security Logs for a specific domain group using temporary RAM-only credentials.'
                  : 'با دریافت نام گروه هدف و دسترسی دامین، تاریخ ساخت، سازنده، مسیر OU، اعضای کامل و پرمیژن‌های قابل فهم گروه را مستقیماً از AD دریافت می‌کند.'
              }
              whyNeeded={
                isEn
                  ? 'Allows HelpDesk engineers to understand who created a group, where it sits in AD, who its members are, and exactly what permissions someone gains when added to it.'
                  : 'به کارشناسان هلپ‌دسک کمک می‌کند پیش از اضافه کردن یک کاربر به گروه، دقیقاً بدانند گروه کی و توسط چه کسی ساخته شده، چه کسانی عضو آن هستند و چه دسترسی‌هایی اعطا می‌کند.'
              }
              example={
                isEn
                  ? 'Group: Domain Admins or HR-Managers or CN=VPN_Users,OU=Groups,DC=corp,DC=local'
                  : 'نام گروه: Finance-Managers یا Domain Admins یا Remote Desktop Users'
              }
            />
          </div>

          <div className={`text-[11px] flex flex-wrap items-center gap-3 ${textMuted}`}>
            <span>{isEn ? 'Domain credentials stay in RAM only' : 'رمز عبور فقط در حافظه موقت (RAM) می‌ماند'}</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              disabled={!canInspectGroups}
              onClick={() => setShowGroupBrowser((p) => !p)}
              className="text-sky-500 hover:underline font-medium cursor-pointer disabled:opacity-40"
            >
              {showGroupBrowser
                ? isEn
                  ? 'Hide AD Group Browser'
                  : 'بستن مرورگر گروه‌های دامین'
                : isEn
                ? 'Browse / Find AD Groups'
                : 'جستجو در لیست گروه‌های دامین'}
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() =>
                patchHelpdeskGroupRamSnapshot((prev) => ({
                  showAdvancedConn: !prev.showAdvancedConn,
                }))
              }
              className="text-teal-500 hover:underline font-medium cursor-pointer"
            >
              {ram.showAdvancedConn
                ? isEn
                  ? 'Hide DC Options'
                  : 'بستن تنظیمات دامین کنترلر'
                : isEn
                ? 'DC / Protocol Options'
                : 'تنظیم دامین کنترلر و پروتکل'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          {/* Target Group */}
          <div className="lg:col-span-4 min-w-0">
            <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
              {isEn ? 'Target AD Group Name / SAM / DN' : 'نام گروه هدف (Group Name / SAM / DN)'}
            </label>
            <input
              type="text"
              dir="ltr"
              value={ram.targetGroup}
              onChange={(e) => patchHelpdeskGroupRamSnapshot({ targetGroup: e.target.value })}
              placeholder="e.g. Domain Admins  or  Finance-Share-RW  or  CN=..."
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
              onChange={(e) => patchHelpdeskGroupRamSnapshot({ adminUsername: e.target.value })}
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
                type={showPassword && !isDelegatedSession ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                value={ram.adminPassword}
                onChange={(e) => patchHelpdeskGroupRamSnapshot({ adminPassword: e.target.value })}
                placeholder={
                  isDelegatedSession
                    ? isEn
                      ? '•••••••• (RAM session protected)'
                      : '•••••••• (نشست امن موقت)'
                    : '••••••••••••'
                }
                className={`w-full min-w-0 px-3 py-2 rounded-lg border text-xs font-mono outline-none transition pe-9 ${inputCls}`}
                required={!isDelegatedSession}
              />
              <button
                type="button"
                disabled={isDelegatedSession}
                onClick={() => {
                  if (!isDelegatedSession) setShowPassword((p) => !p);
                }}
                title={
                  isDelegatedSession
                    ? isEn
                      ? 'Delegated password is sealed in RAM and cannot be revealed here'
                      : 'رمز منتقل‌شده از صفحه کاربر به صورت امن در RAM قفل شده و قابل نمایش نیست'
                    : showPassword
                    ? isEn
                      ? 'Hide password'
                      : 'مخفی کردن رمز'
                    : isEn
                    ? 'Show password'
                    : 'نمایش رمز'
                }
                className={`absolute top-1/2 -translate-y-1/2 end-2.5 p-1 ${
                  isDelegatedSession
                    ? 'opacity-40 cursor-not-allowed text-teal-500'
                    : `${textMuted} hover:text-teal-500 cursor-pointer`
                }`}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword && !isDelegatedSession ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Connect & Wipe */}
          <div className="md:col-span-2 lg:col-span-2 min-w-0 flex items-center gap-2">
            <button
              type="submit"
              disabled={!canInspectGroups || ram.loading}
              className="flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition whitespace-nowrap cursor-pointer"
            >
              {ram.loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Search className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">{isEn ? 'Connect & Inspect' : 'اتصال و بررسی'}</span>
            </button>
            <button
              type="button"
              onClick={() => wipeHelpdeskGroupRamSession()}
              title={
                isEn
                  ? 'Wipe target group, credentials & results from RAM'
                  : 'پاک‌سازی فوری اطلاعات گروه، رمز و نتایج از حافظه'
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

        {/* Delegated RAM-Only Credential Security Strip */}
        {isDelegatedSession && ram.delegatedAuth && (
          <div
            className={`rounded-lg border px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] ${
              isLightMode
                ? 'bg-teal-50 border-teal-200 text-teal-800'
                : 'bg-teal-500/10 border-teal-500/30 text-teal-300'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="w-4 h-4 text-teal-500 shrink-0" />
              <span className="truncate">
                {isEn
                  ? `Using sealed RAM-only session from User HelpDesk (${ram.delegatedAuth.adminUsername}) — password stays hidden & auto-wipes in 30m or on logout.`
                  : `استفاده از نشست امن موقت صفحه کاربر (${ram.delegatedAuth.adminUsername}) — رمز عبور در RAM مخفی می‌ماند و با خروج یا انقضای ۳۰ دقیقه‌ای پاک می‌شود.`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                revokeDelegatedGroupCredential();
                setTimeout(() => passwordInputRef.current?.focus(), 40);
              }}
              className={`shrink-0 px-2.5 py-1 rounded-md border text-[11px] font-medium transition cursor-pointer ${
                isLightMode
                  ? 'bg-white hover:bg-slate-50 border-teal-300 text-teal-800'
                  : 'bg-slate-900/80 hover:bg-slate-800 border-teal-500/40 text-teal-300'
              }`}
            >
              {isEn ? 'Clear / Enter Different Password' : 'لغو / وارد کردن رمز جدید'}
            </button>
          </div>
        )}

        {/* AD Group Directory Browser / Quick Finder */}
        {showGroupBrowser && (
          <div className={`rounded-xl border p-3.5 space-y-3 ${subCardBg}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Search className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  <span className={textPrimary}>
                    {isEn ? 'Active Directory Group Directory Finder' : 'جستجو و انتخاب گروه از Active Directory'}
                  </span>
                </div>
                <p className={`mt-1 text-[11px] ${textMuted}`}>
                  {isEn
                    ? 'Fill in "Privileged Domain Username" and "Domain Password (Ephemeral)" above first so the Search button is enabled.'
                    : 'برای فعال شدن دکمه جستجو، ابتدا فیلدهای «نام کاربری دامین با سطح دسترسی» (Privileged Domain Username) و «رمز عبور دامین (موقت)» (Domain Password (Ephemeral)) را در کادر بالا تکمیل کنید.'}
                </p>
              </div>
              {ram.searchMeta && (
                <span className={`text-[11px] font-mono ${textMuted}`} dir="ltr">
                  {ram.searchMeta.domainName} ({ram.searchMeta.domainController})
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                dir="ltr"
                value={browserQuery}
                onChange={(e) => setBrowserQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearchDirectoryGroups();
                  }
                }}
                placeholder={
                  isEn
                    ? 'Type part of group name, e.g. vpn, finance, admin (leave empty for top 50 groups)'
                    : 'بخشی از نام گروه را بنویسید (مثلاً admin یا vpn یا خالی بگذارید)'
                }
                className={`flex-1 min-w-[220px] px-3 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
              />
              <button
                type="button"
                disabled={!canInspectGroups || ram.searchingGroups || !canUseCurrentCreds}
                onClick={handleSearchDirectoryGroups}
                className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {ram.searchingGroups ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>{isEn ? 'Search AD Groups' : 'جستجوی گروه‌ها'}</span>
              </button>
            </div>

            {ram.searchError && (
              <div className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                {ram.searchError}
              </div>
            )}

            {ram.searchResults.length > 0 && (
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/30 border border-slate-700/30 rounded-lg">
                {ram.searchResults.map((g) => (
                  <button
                    key={g.distinguishedName}
                    type="button"
                    onClick={() => {
                      setShowGroupBrowser(false);
                      runHelpdeskGroupInspect(g.samAccountName);
                    }}
                    className={`w-full text-start px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs transition cursor-pointer ${
                      isLightMode ? 'hover:bg-sky-50' : 'hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-semibold font-mono ${textPrimary}`}>{g.cn}</span>
                        {g.isPrivileged && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-500 text-[10px] font-semibold">
                            {isEn ? 'Privileged' : 'حساس'}
                          </span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${subCardBg} ${textMuted}`}>
                          {g.groupScope} · {g.groupCategory}
                        </span>
                      </div>
                      <div className={`text-[11px] truncate ${textMuted}`}>
                        {g.organizationalUnit}
                        {g.description ? ` — ${g.description}` : ''}
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-teal-500 shrink-0">
                      {g.memberCountEstimate} {isEn ? 'members' : 'عضو'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Advanced DC / Protocol Options */}
        {ram.showAdvancedConn && (
          <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t ${isLightMode ? 'border-slate-200' : 'border-slate-800'}`}>
            <div>
              <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                {isEn ? 'Domain Controller Host / IP (Optional)' : 'نام یا IP دامین کنترلر (اختیاری)'}
              </label>
              <input
                type="text"
                dir="ltr"
                value={ram.domainController}
                onChange={(e) => patchHelpdeskGroupRamSnapshot({ domainController: e.target.value })}
                placeholder={isEn ? 'Auto-discover PDC via DNS SRV' : 'تشخیص خودکار PDC از طریق DNS SRV'}
                className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
              />
            </div>

            <div>
              <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                {isEn ? 'AD LDAP Transport' : 'پروتکل اتصال AD'}
              </label>
              <select
                value={ram.ldapProtocol}
                onChange={(e) =>
                  patchHelpdeskGroupRamSnapshot({
                    ldapProtocol: e.target.value as 'auto' | 'ldaps' | 'ldap',
                  })
                }
                className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
              >
                <option value="auto">{isEn ? 'Auto (LDAPS 636 -> LDAP 389)' : 'خودکار (LDAPS 636 و سپس LDAP 389)'}</option>
                <option value="ldaps">LDAPS (TLS 636)</option>
                <option value="ldap">LDAP (389)</option>
              </select>
            </div>

            <div>
              <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                {isEn ? 'DC WinRM Protocol (Event Log & GPOs)' : 'پروتکل WinRM برای لاگ رویداد و GPO'}
              </label>
              <select
                value={ram.winrmProtocol}
                onChange={(e) =>
                  patchHelpdeskGroupRamSnapshot({
                    winrmProtocol: e.target.value as any,
                  })
                }
                className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
              >
                <option value="auto">{isEn ? 'Auto (WinRM HTTPS/HTTP)' : 'خودکار (WinRM HTTPS / HTTP)'}</option>
                <option value="winrm_https">WinRM HTTPS (5986)</option>
                <option value="winrm_http">WinRM HTTP (5985)</option>
              </select>
            </div>
          </div>
        )}

        {/* Recent Inspected Groups Strip */}
        {ram.recentGroups.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
            <span className={textMuted}>{isEn ? 'Recent in session:' : 'گروه‌های اخیر این نشست:'}</span>
            {ram.recentGroups.map((rg) => (
              <button
                key={rg.samAccountName}
                type="button"
                onClick={() => runHelpdeskGroupInspect(rg.samAccountName)}
                className={`px-2.5 py-1 rounded-md border font-mono flex items-center gap-1.5 transition cursor-pointer ${
                  rg.isPrivileged
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                    : isLightMode
                    ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <span>{rg.cn}</span>
                <span className="opacity-70">({rg.memberTotal})</span>
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Re-inspect Prompt Banner when credentials were cleared */}
      {reinspectBanner && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-500">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 shrink-0" />
            <span>
              {isEn
                ? `Target group "${reinspectBanner.targetGroup}" selected. Enter Domain Username & Password above and click Connect & Inspect.`
                : `گروه «${reinspectBanner.targetGroup}» انتخاب شد. نام کاربری و رمز عبور ادمین دامین را در بالا وارد کرده و دکمه اتصال و بررسی را بزنید.`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setReinspectBanner(null)}
            className="p-1 hover:opacity-75 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Connection / Lookup Error Banner */}
      {ram.error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 space-y-2">
          <div className="flex items-start gap-2.5 text-rose-500 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold">
                {isEn ? 'Active Directory Group Inspection Error' : 'خطا در استعلام گروه دامین'}
              </div>
              <div className="font-mono break-all opacity-90">{ram.error}</div>
            </div>
          </div>
          <TimeoutAntivirusHint
            errorText={ram.error}
            isEn={isEn}
            isLightMode={isLightMode}
            canViewSecurityAv={Boolean(onNavigateToEndpointHelpdesk)}
            canControlAntivirus={hasFull || Boolean(effectivePolicy?.canExecuteHelpdeskActions)}
            onGoToAntivirus={onNavigateToEndpointHelpdesk}
          />
        </div>
      )}

      {/* Active Group Identity Strip (when loaded) */}
      {data && (
        <div className={`rounded-xl border p-4 sm:p-5 ${surfaceBg}`}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
                  data.identity.privilegeLevel === 'critical'
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-500'
                    : data.identity.privilegeLevel === 'elevated'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-500'
                    : data.identity.privilegeLevel === 'distribution'
                    ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400'
                    : 'bg-teal-500/15 border-teal-500/40 text-teal-500'
                }`}
              >
                {data.identity.privilegeLevel === 'critical' || data.identity.privilegeLevel === 'elevated' ? (
                  <ShieldAlert className="w-6 h-6" />
                ) : (
                  <Users className="w-6 h-6" />
                )}
              </div>

              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={`text-lg font-bold truncate ${textPrimary}`}>{data.identity.cn}</h2>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                      data.identity.privilegeLevel === 'critical'
                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-500'
                        : data.identity.privilegeLevel === 'elevated'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-500'
                        : data.identity.privilegeLevel === 'distribution'
                        ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400'
                        : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500'
                    }`}
                  >
                    {data.identity.privilegeLevel === 'critical'
                      ? isEn
                        ? 'Critical Admin Group'
                        : 'گروه ادمین فوق‌حساس'
                      : data.identity.privilegeLevel === 'elevated'
                      ? isEn
                        ? 'Elevated Access'
                        : 'دسترسی ویژه (Elevated)'
                      : data.identity.privilegeLevel === 'distribution'
                      ? isEn
                        ? 'Distribution List'
                        : 'گروه ایمیل (Distribution)'
                      : isEn
                      ? 'Standard Security'
                      : 'گروه امنیتی استاندارد'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-md text-[11px] border ${subCardBg} ${textMuted}`}>
                    {scopeLabel(data.identity.groupScope, isEn)} · {categoryLabel(data.identity.groupCategory, isEn)}
                  </span>
                  {data.identity.adminCount && (
                    <span className="px-2 py-0.5 rounded-md text-[11px] bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>AdminSDHolder</span>
                    </span>
                  )}
                </div>

                {data.identity.description && (
                  <p className={`text-xs ${textMuted}`}>{data.identity.description}</p>
                )}

                <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] ${textMuted}`}>
                  <span className="flex items-center gap-1 font-mono" dir="ltr">
                    <FolderTree className="w-3.5 h-3.5 text-teal-500" />
                    {data.identity.organizationalUnit}
                  </span>
                  <span className="flex items-center gap-1">
                    <Server className="w-3.5 h-3.5 text-sky-500" />
                    {data.connectionInfo.domainController}:{data.connectionInfo.port} ({data.connectionInfo.method.toUpperCase()})
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => runHelpdeskGroupInspect()}
                disabled={ram.loading}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                  isLightMode
                    ? 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-700'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${ram.loading ? 'animate-spin' : ''}`} />
                <span>{isEn ? 'Refresh' : 'بروزرسانی'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-rendered 5-Tab Bar (Always Visible Like HelpDeskUsersView) */}
      <div
        className={`flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl border ${
          isLightMode ? 'bg-slate-100/90 border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = ram.activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => patchHelpdeskGroupRamSnapshot({ activeSubTab: tab.id })}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                active
                  ? 'bg-teal-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-white hover:text-slate-900'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{isEn ? tab.labelEn : tab.labelFa}</span>
              {tab.badge !== undefined && tab.badge !== null && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
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

      {/* Empty Prompt State when no group loaded and not on history tab */}
      {!data && ram.activeSubTab !== 'history' && (
        <div className={`rounded-xl border p-8 sm:p-10 text-center space-y-3 ${surfaceBg}`}>
          <div className="w-12 h-12 mx-auto rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-500">
            <Users className="w-6 h-6" />
          </div>
          <h3 className={`text-sm font-bold ${textPrimary}`}>
            {isEn
              ? 'Ready to Inspect Any Active Directory Group'
              : 'آماده بررسی اطلاعات کامل هر گروه اکتیو دایرکتوری'}
          </h3>
          <p className={`text-xs max-w-2xl mx-auto leading-relaxed ${textMuted}`}>
            {isEn
              ? 'Enter the target AD group name (or click "Browse / Find AD Groups") along with temporary domain credentials above to view creation time, creator/owner, OU hierarchy, all direct/primary/nested members, and a plain-language explanation of permissions.'
              : 'نام گروه دامین را وارد کنید (یا از «جستجو در لیست گروه‌های دامین» انتخاب نمایید) تا تاریخ و زمان دقیق ساخت، نام سازنده/مالک، مسیر OU، لیست کامل اعضا (مستقیم، Primary و زیرگروه‌ها) و توضیح ساده و قابل فهم تمام پرمیژن‌ها نمایش داده شود.'}
          </p>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 1: OVERVIEW, CREATOR & OU PATH                                  */}
      {/* =================================================================== */}
      {data && ram.activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Top 4 KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Creation Date KPI */}
            <div className={`rounded-xl border p-4 space-y-1.5 ${surfaceBg}`}>
              <div className="flex items-center justify-between text-xs">
                <span className={textMuted}>{isEn ? 'Created At' : 'تاریخ و زمان ساخت'}</span>
                <Calendar className="w-4 h-4 text-sky-500" />
              </div>
              <div className={`text-sm font-bold ${textPrimary}`}>
                {formatDateDisplay(data.lifecycleAndOwnership.whenCreated, isEn)}
              </div>
              <div className={`text-[11px] ${textMuted}`}>
                {data.lifecycleAndOwnership.createdAgeDays !== null
                  ? isEn
                    ? `${data.lifecycleAndOwnership.createdAgeDays} days ago`
                    : `${data.lifecycleAndOwnership.createdAgeDays} روز از ساخت گذشته`
                  : '-'}
              </div>
            </div>

            {/* Creator / Owner KPI */}
            <div className={`rounded-xl border p-4 space-y-1.5 ${surfaceBg}`}>
              <div className="flex items-center justify-between text-xs">
                <span className={textMuted}>
                  {data.lifecycleAndOwnership.creatorSource === 'security_event_log'
                    ? isEn
                      ? 'Created By (Event Log)'
                      : 'سازنده گروه (Event Log)'
                    : isEn
                    ? 'AD Owner / Creator'
                    : 'سازنده / مالک آبجکت (Owner)'}
                </span>
                <UserCheck className="w-4 h-4 text-teal-500" />
              </div>
              <div className={`text-sm font-bold font-mono truncate ${textPrimary}`} dir="ltr">
                {data.lifecycleAndOwnership.creatorAccount ||
                  data.lifecycleAndOwnership.objectOwner ||
                  (isEn ? 'Unavailable' : 'نامشخص')}
              </div>
              <div className={`text-[11px] ${textMuted}`}>
                {data.lifecycleAndOwnership.creatorSource === 'security_event_log'
                  ? isEn
                    ? `Security Log (${data.lifecycleAndOwnership.creatorDc})`
                    : `استخراج‌شده از لاگ امنیتی ${data.lifecycleAndOwnership.creatorDc}`
                  : isEn
                  ? 'Active Directory Owner SID'
                  : 'برگرفته از Owner آبجکت در AD'}
              </div>
            </div>

            {/* OU Location KPI */}
            <div className={`rounded-xl border p-4 space-y-1.5 ${surfaceBg}`}>
              <div className="flex items-center justify-between text-xs">
                <span className={textMuted}>{isEn ? 'Organizational Unit (OU)' : 'واحد سازمانی (OU)'}</span>
                <FolderTree className="w-4 h-4 text-indigo-500" />
              </div>
              <div className={`text-sm font-bold truncate ${textPrimary}`} dir="ltr">
                {data.identity.ouSegments[data.identity.ouSegments.length - 1] ||
                  data.identity.organizationalUnit}
              </div>
              <div className={`text-[11px] truncate ${textMuted}`} dir="ltr">
                {data.identity.organizationalUnit}
              </div>
            </div>

            {/* Members KPI */}
            <div className={`rounded-xl border p-4 space-y-1.5 ${surfaceBg}`}>
              <div className="flex items-center justify-between text-xs">
                <span className={textMuted}>{isEn ? 'Total Members' : 'مجموع اعضای گروه'}</span>
                <Users className="w-4 h-4 text-emerald-500" />
              </div>
              <div className={`text-sm font-bold font-mono ${textPrimary}`}>
                {totalMembersDisplay}{' '}
                <span className={`text-xs font-normal ${textMuted}`}>
                  {isEn ? 'direct/primary' : 'عضو مستقیم/اصلی'}
                </span>
              </div>
              <div className={`text-[11px] ${textMuted}`}>
                {data.nestedChildGroups.length > 0
                  ? isEn
                    ? `${data.nestedChildGroups.length} nested group(s) · +${data.membershipSummary.totalInheritedUsers} inherited`
                    : `${data.nestedChildGroups.length} زیرگروه · +${data.membershipSummary.totalInheritedUsers} عضو غیرمستقیم`
                  : isEn
                  ? `${data.parentGroups.length} parent group(s) (memberOf)`
                  : `عضو در ${data.parentGroups.length} گروه والد`}
              </div>
            </div>
          </div>

          {/* Creator, Lifecycle & Management Details + OU Path Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Creation, Creator, Object Owner & ManagedBy */}
            <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Clock className="w-4 h-4 text-teal-500" />
                  <span className={textPrimary}>
                    {isEn ? 'Creation History, Creator & Ownership' : 'تاریخچه ساخت، سازنده و مالکیت گروه'}
                  </span>
                </div>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  fieldName={isEn ? 'Group Creator & AD Owner' : 'سازنده و مالک گروه در AD'}
                  whatIsIt={
                    isEn
                      ? 'Shows when the group was created (whenCreated), who created it (from Event Log 4727/4731/4754 if retained, or current AD Object Owner), and who is assigned as Managed By.'
                      : 'تاریخ دقیق ساخت گروه، حساب کاربری سازنده (از لاگ امنیتی یا مالک آبجکت AD) و مدیر مسئول گروه (ManagedBy) را نمایش می‌دهد.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Helps verify why a group exists, who authorized it, and who can approve membership changes.'
                      : 'برای پیگیری دلیل ایجاد گروه، پیدا کردن شخص مسئول و گرفتن تاییدیه افزودن اعضای جدید ضروری است.'
                  }
                  example={
                    isEn
                      ? 'Creator/Owner: CORP\\m.shahbazi · Created: 2024-03-14'
                      : 'سازنده/مالک: CORP\\Administrator · مدیر گروه: مدیر واحد IT'
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className={`rounded-lg border p-3 ${subCardBg}`}>
                  <div className={`text-[11px] ${textMuted}`}>{isEn ? 'Created Timestamp' : 'تاریخ و ساعت ساخت'}</div>
                  <div className={`font-semibold mt-1 ${textPrimary}`}>
                    {formatDateDisplay(data.lifecycleAndOwnership.whenCreated, isEn)}
                  </div>
                </div>
                <div className={`rounded-lg border p-3 ${subCardBg}`}>
                  <div className={`text-[11px] ${textMuted}`}>{isEn ? 'Last Modified Timestamp' : 'آخرین تغییر مشخصات'}</div>
                  <div className={`font-semibold mt-1 ${textPrimary}`}>
                    {formatDateDisplay(data.lifecycleAndOwnership.whenChanged, isEn)}
                  </div>
                </div>
                <div className={`rounded-lg border p-3 ${subCardBg}`}>
                  <div className={`text-[11px] ${textMuted}`}>{isEn ? 'Creator / Object Owner' : 'سازنده / مالک فعلی (Owner)'}</div>
                  <div className={`font-semibold font-mono mt-1 break-all ${textPrimary}`} dir="ltr">
                    {data.lifecycleAndOwnership.creatorAccount || data.lifecycleAndOwnership.objectOwner || '-'}
                  </div>
                </div>
                <div className={`rounded-lg border p-3 ${subCardBg}`}>
                  <div className={`text-[11px] ${textMuted}`}>{isEn ? 'AD Object Owner' : 'مالک امنیتی آبجکت در AD'}</div>
                  <div className={`font-semibold font-mono mt-1 break-all ${textPrimary}`} dir="ltr">
                    {data.lifecycleAndOwnership.objectOwner || '-'}
                  </div>
                </div>
              </div>

              <div className={`rounded-lg border p-3 text-[11px] leading-relaxed ${subCardBg} ${textMuted}`}>
                {isEn ? data.lifecycleAndOwnership.creatorNoteEn : data.lifecycleAndOwnership.creatorNoteFa}
              </div>

              {/* ManagedBy Section */}
              <div className={`rounded-lg border p-3.5 space-y-2 ${subCardBg}`}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className={`font-semibold ${textPrimary}`}>
                    {isEn ? 'Assigned Manager (ManagedBy)' : 'مدیر یا مسئول گروه (Managed By)'}
                  </span>
                  {data.lifecycleAndOwnership.managedBy && data.lifecycleAndOwnership.managerCanUpdateMembershipList !== null && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        data.lifecycleAndOwnership.managerCanUpdateMembershipList
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : 'bg-slate-500/15 text-slate-400'
                      }`}
                    >
                      {data.lifecycleAndOwnership.managerCanUpdateMembershipList
                        ? isEn
                          ? 'Can Update Membership List'
                          : 'دارای مجوز تغییر اعضا'
                        : isEn
                        ? 'Read-Only Reference'
                        : 'صرفاً مسئول (بدون مجوز نوشتن)'}
                    </span>
                  )}
                </div>
                {data.lifecycleAndOwnership.managedBy ? (
                  <div className="text-xs space-y-1">
                    <div className={`font-semibold ${textPrimary}`}>
                      {data.lifecycleAndOwnership.managedBy.displayName}{' '}
                      <span className={`font-mono text-[11px] ${textMuted}`} dir="ltr">
                        ({data.lifecycleAndOwnership.managedBy.samAccountName})
                      </span>
                    </div>
                    <div className={`text-[11px] ${textMuted}`}>
                      {[
                        data.lifecycleAndOwnership.managedBy.jobTitle,
                        data.lifecycleAndOwnership.managedBy.department,
                        data.lifecycleAndOwnership.managedBy.email,
                      ]
                        .filter(Boolean)
                        .join(' · ') || data.lifecycleAndOwnership.managedBy.ou}
                    </div>
                  </div>
                ) : (
                  <div className={`text-xs ${textMuted}`}>
                    {isEn ? 'No manager (ManagedBy) assigned in Active Directory.' : 'مدیری در فیلد Managed By برای این گروه تعریف نشده است.'}
                  </div>
                )}
              </div>
            </div>

            {/* OU Location, Breadcrumb & Technical Identifiers */}
            <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <FolderTree className="w-4 h-4 text-indigo-500" />
                  <span className={textPrimary}>
                    {isEn ? 'Organizational Unit (OU) & Identity' : 'موقعیت OU و مشخصات ساختاری گروه'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy('dn', data.identity.distinguishedName)}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] flex items-center gap-1 cursor-pointer ${subCardBg} ${textMuted} hover:text-teal-500`}
                >
                  {copiedKey === 'dn' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{isEn ? 'Copy DN' : 'کپی DN'}</span>
                </button>
              </div>

              {/* Visual OU Hierarchy Breadcrumb */}
              <div className={`rounded-lg border p-3.5 space-y-2 ${subCardBg}`}>
                <div className={`text-[11px] font-medium ${textMuted}`}>
                  {isEn ? 'OU Hierarchy Path' : 'مسیر سلسله‌مراتبی در اکتیو دایرکتوری (OU Path)'}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs" dir="ltr">
                  <span className="px-2 py-1 rounded bg-indigo-500/15 text-indigo-400 font-mono font-semibold">
                    {data.identity.domainName || 'Domain'}
                  </span>
                  {data.identity.ouSegments.map((seg, i) => (
                    <React.Fragment key={`${seg}-${i}`}>
                      <ChevronRight className={`w-3.5 h-3.5 ${textMuted}`} />
                      <span
                        className={`px-2 py-1 rounded border font-mono ${
                          i === data.identity.ouSegments.length - 1
                            ? 'bg-teal-500/15 border-teal-500/40 text-teal-500 font-semibold'
                            : `${surfaceBg} ${textPrimary}`
                        }`}
                      >
                        {seg}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
                <div className={`text-[11px] font-mono break-all pt-1 ${textMuted}`} dir="ltr">
                  DN: {data.identity.distinguishedName}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className={`rounded-lg border p-3 ${subCardBg}`}>
                  <div className={`text-[11px] ${textMuted}`}>{isEn ? 'SAM Account Name' : 'نام سیستمی (SAM)'}</div>
                  <div className={`font-mono font-semibold mt-1 break-all ${textPrimary}`} dir="ltr">
                    {data.identity.samAccountName}
                  </div>
                </div>
                <div className={`rounded-lg border p-3 ${subCardBg}`}>
                  <div className={`text-[11px] ${textMuted}`}>{isEn ? 'Scope & Category' : 'محدوده و نوع گروه'}</div>
                  <div className={`font-semibold mt-1 ${textPrimary}`}>
                    {scopeLabel(data.identity.groupScope, isEn)} · {categoryLabel(data.identity.groupCategory, isEn)}
                  </div>
                </div>
                <div className={`rounded-lg border p-3 ${subCardBg}`}>
                  <div className={`text-[11px] ${textMuted}`}>Object SID</div>
                  <div className={`font-mono text-[11px] mt-1 break-all ${textPrimary}`} dir="ltr">
                    {data.identity.objectSid || '-'}
                  </div>
                </div>
                <div className={`rounded-lg border p-3 ${subCardBg}`}>
                  <div className={`text-[11px] ${textMuted}`}>Object GUID</div>
                  <div className={`font-mono text-[11px] mt-1 break-all ${textPrimary}`} dir="ltr">
                    {data.identity.objectGuid || '-'}
                  </div>
                </div>
              </div>

              {/* Mail / Exchange Distribution summary if mail-enabled */}
              {data.mailAndExchange.isMailEnabled && (
                <div className={`rounded-lg border p-3.5 space-y-1.5 ${subCardBg}`}>
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Mail className="w-3.5 h-3.5 text-sky-500" />
                    <span className={textPrimary}>
                      {isEn ? 'Group Email & Delivery Settings' : 'ایمیل گروه و قوانین ارسال'}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-sky-500" dir="ltr">
                    {data.mailAndExchange.primaryEmail || data.mailAndExchange.mailNickname}
                  </div>
                  <div className={`text-[11px] ${textMuted}`}>
                    {isEn ? data.mailAndExchange.deliveryRestrictionNoteEn : data.mailAndExchange.deliveryRestrictionNoteFa}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Plain-Language Permission Preview Strip */}
          <div
            className={`rounded-xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              data.identity.privilegeLevel === 'critical'
                ? 'border-rose-500/40 bg-rose-500/10'
                : data.identity.privilegeLevel === 'elevated'
                ? 'border-amber-500/40 bg-amber-500/10'
                : surfaceBg
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold">
                <ShieldCheck
                  className={`w-4 h-4 ${
                    data.identity.privilegeLevel === 'critical'
                      ? 'text-rose-500'
                      : data.identity.privilegeLevel === 'elevated'
                      ? 'text-amber-500'
                      : 'text-teal-500'
                  }`}
                />
                <span className={textPrimary}>
                  {isEn ? 'What Does Membership Grant (Quick Summary)' : 'این گروه به زبان ساده چه دسترسی‌هایی می‌دهد؟'}
                </span>
              </div>
              <p className={`text-xs leading-relaxed ${textPrimary}`}>
                {isEn ? data.permissions.plainSummaryEn : data.permissions.plainSummaryFa}
              </p>
            </div>
            <button
              type="button"
              onClick={() => patchHelpdeskGroupRamSnapshot({ activeSubTab: 'permissions' })}
              className="px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <span>{isEn ? 'View Full Permissions' : 'مشاهده کامل پرمیژن‌ها'}</span>
              <NavArrow className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Recent Group Audit Events */}
          <div className={`rounded-xl border p-5 space-y-3 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold">
                <History className="w-4 h-4 text-sky-500" />
                <span className={textPrimary}>
                  {isEn ? 'Recent Domain Controller Security Audit Events (14 Days)' : 'تاریخچه رویدادهای امنیتی تغییر اعضای گروه (۱۴ روز اخیر)'}
                </span>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded border ${subCardBg} ${textMuted}`}>
                {data.auditEventsStatus === 'available'
                  ? isEn
                    ? `${data.auditEvents.length} Events`
                    : `${data.auditEvents.length} رویداد`
                  : data.auditEventsStatus === 'empty'
                  ? isEn
                    ? 'No Recent Events'
                    : 'رویداد جدیدی ثبت نشده'
                  : isEn
                  ? 'Event Log Unavailable'
                  : 'Event Log در دسترس نبود'}
              </span>
            </div>

            <div className={`text-[11px] ${textMuted}`}>
              {isEn ? data.auditEventsNoteEn : data.auditEventsNoteFa}
            </div>

            {data.auditEvents.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className={`border-b text-[11px] ${isLightMode ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
                      <th className="py-2 px-2 text-start">{isEn ? 'Time' : 'زمان'}</th>
                      <th className="py-2 px-2 text-start">{isEn ? 'Event ID' : 'کد رویداد'}</th>
                      <th className="py-2 px-2 text-start">{isEn ? 'Actor' : 'انجام‌دهنده'}</th>
                      <th className="py-2 px-2 text-start">{isEn ? 'Details' : 'شرح رویداد'}</th>
                      <th className="py-2 px-2 text-start">DC</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                    {data.auditEvents.map((ev, i) => (
                      <tr key={`${ev.eventId}-${ev.timestamp}-${i}`}>
                        <td className={`py-2 px-2 whitespace-nowrap ${textMuted}`}>
                          {formatDateDisplay(ev.timestamp, isEn)}
                        </td>
                        <td className="py-2 px-2 font-mono">{ev.eventId}</td>
                        <td className={`py-2 px-2 font-mono ${textPrimary}`} dir="ltr">
                          {ev.actor}
                        </td>
                        <td className={`py-2 px-2 ${textPrimary}`}>
                          {isEn ? ev.summaryEn : ev.summaryFa}
                        </td>
                        <td className={`py-2 px-2 font-mono ${textMuted}`} dir="ltr">
                          {ev.dcHost}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: MEMBERS & NESTED GROUPS                                      */}
      {/* =================================================================== */}
      {data && ram.activeSubTab === 'members' && (
        <div className="space-y-6">
          {/* Member Stats */}
          <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h3 className={`text-sm font-bold flex items-center gap-2 ${textPrimary}`}>
                  <Users className="w-4 h-4 text-teal-500" />
                  <span>{isEn ? 'Group Membership Directory' : 'لیست کامل اعضای گروه و زیرگروه‌ها'}</span>
                </h3>
                <p className={`text-xs mt-1 ${textMuted}`}>
                  {isEn
                    ? `${data.membershipSummary.directUsersCount} users, ${data.membershipSummary.directGroupsCount} nested groups, ${data.membershipSummary.directComputersCount} computers, ${data.membershipSummary.totalPrimaryGroupMembers} primary-group members.`
                    : `${data.membershipSummary.directUsersCount} کاربر، ${data.membershipSummary.directGroupsCount} زیرگروه تو در تو، ${data.membershipSummary.directComputersCount} کامپیوتر و ${data.membershipSummary.totalPrimaryGroupMembers} عضو Primary Group.`}
                </p>
              </div>
            </div>

            {/* Category Filter Chips + Search */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  {
                    id: 'all' as const,
                    en: `All Direct + Primary (${totalMembersDisplay})`,
                    fa: `همه اعضا (${totalMembersDisplay})`,
                  },
                  {
                    id: 'users' as const,
                    en: `Users (${data.membershipSummary.directUsersCount})`,
                    fa: `کاربران (${data.membershipSummary.directUsersCount})`,
                  },
                  {
                    id: 'groups' as const,
                    en: `Nested Groups (${data.membershipSummary.directGroupsCount})`,
                    fa: `زیرگروه‌ها (${data.membershipSummary.directGroupsCount})`,
                  },
                  {
                    id: 'computers' as const,
                    en: `Computers (${data.membershipSummary.directComputersCount})`,
                    fa: `کامپیوترها (${data.membershipSummary.directComputersCount})`,
                  },
                  {
                    id: 'primary' as const,
                    en: `Primary Group RID (${data.membershipSummary.totalPrimaryGroupMembers})`,
                    fa: `اعضای Primary (${data.membershipSummary.totalPrimaryGroupMembers})`,
                  },
                  {
                    id: 'inherited' as const,
                    en: `Inherited via Nested (${data.membershipSummary.totalInheritedUsers})`,
                    fa: `ارث‌بری از زیرگروه‌ها (${data.membershipSummary.totalInheritedUsers})`,
                  },
                ].map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setMemberViewMode(chip.id)}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition cursor-pointer ${
                      memberViewMode === chip.id
                        ? 'bg-sky-600 border-sky-600 text-white'
                        : `${subCardBg} ${textMuted} hover:text-teal-500`
                    }`}
                  >
                    {isEn ? chip.en : chip.fa}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder={isEn ? 'Filter members by name, SAM, dept, OU...' : 'فیلتر اعضا بر اساس نام، دپارتمان، OU...'}
                className={`w-full sm:w-64 px-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
              />
            </div>

            {/* Truncation Notice */}
            {(data.membershipSummary.membersTruncated ||
              data.membershipSummary.primaryMembersTruncated ||
              data.membershipSummary.inheritedTruncated) && (
              <div className="text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                {isEn
                  ? 'Note: Large group results are capped cleanly per query (up to 1000 direct / 250 primary / 350 inherited) for responsive performance.'
                  : 'توجه: برای حفظ سرعت پاسخ‌دهی، نمایش اعضای گروه‌های بسیار بزرگ تا سقف ۱۰۰۰ عضو مستقیم، ۲۵۰ عضو Primary و ۳۵۰ عضو ارث‌بری‌شده محدود شده است.'}
              </div>
            )}

            {/* Members Table */}
            {displayedMembers.length === 0 ? (
              <div className={`rounded-lg border p-6 text-center text-xs ${subCardBg} ${textMuted}`}>
                {isEn
                  ? 'No members found matching this filter.'
                  : 'هیچ عضوی مطابق فیلتر انتخابی یافت نشد.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className={`border-b text-[11px] ${isLightMode ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
                      <th className="py-2 px-2 text-start">{isEn ? 'Member' : 'نام عضو'}</th>
                      <th className="py-2 px-2 text-start">{isEn ? 'Type / Status' : 'نوع و وضعیت'}</th>
                      <th className="py-2 px-2 text-start">{isEn ? 'Department / Title' : 'دپارتمان / سمت'}</th>
                      <th className="py-2 px-2 text-start">{isEn ? 'OU / Source' : 'مسیر OU / منبع'}</th>
                      <th className="py-2 px-2 text-end">{isEn ? 'Action' : 'عملیات'}</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                    {displayedMembers.map((m) => (
                      <tr key={`${m.dn}-${m.viaGroupDn || 'direct'}`}>
                        <td className="py-2.5 px-2">
                          <div className={`font-semibold ${textPrimary}`}>{m.displayName}</div>
                          <div className={`text-[11px] font-mono ${textMuted}`} dir="ltr">
                            {m.samAccountName}
                            {m.email ? ` · ${m.email}` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                m.objectType === 'group'
                                  ? 'bg-indigo-500/15 text-indigo-400'
                                  : m.objectType === 'computer'
                                  ? 'bg-sky-500/15 text-sky-400'
                                  : 'bg-teal-500/15 text-teal-500'
                              }`}
                            >
                              {m.objectType === 'group'
                                ? isEn
                                  ? 'Nested Group'
                                  : 'زیرگروه'
                                : m.objectType === 'computer'
                                ? isEn
                                  ? 'Computer'
                                  : 'کامپیوتر'
                                : isEn
                                ? 'User'
                                : 'کاربر'}
                            </span>
                            {m.accountEnabled === false && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-500/20 text-slate-400">
                                {isEn ? 'Disabled' : 'غیرفعال'}
                              </span>
                            )}
                            {m.accountLocked && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/15 text-rose-500">
                                {isEn ? 'Locked' : 'قفل'}
                              </span>
                            )}
                            {m.isPrimaryGroupMember && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500/15 text-sky-400">
                                Primary
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`py-2.5 px-2 ${textMuted}`}>
                          {[m.jobTitle, m.department].filter(Boolean).join(' · ') || '-'}
                        </td>
                        <td className={`py-2.5 px-2 text-[11px] ${textMuted}`}>
                          <div dir="ltr" className="truncate max-w-xs">
                            {m.organizationalUnit}
                          </div>
                          {m.isInherited && m.viaGroupCn && (
                            <div className="text-indigo-400">
                              {isEn ? `via ${m.viaGroupCn}` : `از طریق زیرگروه ${m.viaGroupCn}`}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-end whitespace-nowrap">
                          {m.objectType === 'group' ? (
                            <button
                              type="button"
                              onClick={() => runHelpdeskGroupInspect(m.dn)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 text-[11px] font-medium cursor-pointer"
                            >
                              <span>{isEn ? 'Inspect Group' : 'بررسی زیرگروه'}</span>
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                          ) : m.objectType === 'user' &&
                            canOpenUserHelpdesk &&
                            Boolean(m.samAccountName || m.email || m.dn) ? (
                            <button
                              type="button"
                              onClick={() => handleInspectUserInHelpdesk(m)}
                              title={
                                isEn
                                  ? `Inspect "${m.displayName || m.samAccountName}" in Active Directory & User Support HelpDesk`
                                  : `مشاهده جزئیات کامل کاربر «${m.displayName || m.samAccountName}» در صفحه پشتیبانی کاربران دامین`
                              }
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition cursor-pointer ${
                                isLightMode
                                  ? 'bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-700'
                                  : 'bg-teal-500/15 hover:bg-teal-500/25 border-teal-500/30 text-teal-400'
                              }`}
                            >
                              <span>User Details</span>
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                          ) : (
                            <span className={textMuted}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Parent Groups (memberOf) */}
          <div className={`rounded-xl border p-5 space-y-3 ${surfaceBg}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold">
                <GitBranch className="w-4 h-4 text-amber-500" />
                <span className={textPrimary}>
                  {isEn
                    ? `Parent Groups (${data.parentGroups.length}) — Rights This Group Inherits`
                    : `گروه‌های والد (${data.parentGroups.length}) — گروه‌هایی که این گروه عضو آن‌هاست`}
                </span>
              </div>
            </div>
            {data.parentGroups.length === 0 ? (
              <div className={`rounded-lg border p-4 text-xs ${subCardBg} ${textMuted}`}>
                {isEn
                  ? 'This group is not nested inside any parent Active Directory group.'
                  : 'این گروه زیرمجموعه هیچ گروه والد دیگری در اکتیو دایرکتوری نیست.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.parentGroups.map((pg) => (
                  <button
                    key={pg.dn}
                    type="button"
                    onClick={() => runHelpdeskGroupInspect(pg.dn)}
                    className={`text-start rounded-lg border p-3.5 space-y-1.5 transition cursor-pointer ${
                      pg.isPrivileged
                        ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15'
                        : `${subCardBg} hover:border-teal-500/50`
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-bold font-mono truncate ${textPrimary}`}>{pg.cn}</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className={pg.isDirect ? 'text-teal-500 font-semibold' : textMuted}>
                        {pg.isDirect
                          ? isEn
                            ? 'Direct Parent'
                            : 'والد مستقیم'
                          : isEn
                          ? 'Transitive Parent'
                          : 'والد غیرمستقیم'}
                      </span>
                      <span>·</span>
                      <span className={textMuted}>{pg.groupScope}</span>
                      {pg.isPrivileged && (
                        <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-500 font-semibold">
                          {isEn ? 'Privileged' : 'حساس'}
                        </span>
                      )}
                    </div>
                    <div className={`text-[11px] truncate ${textMuted}`} dir="ltr">
                      {pg.ou}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: PERMISSIONS & SECURITY IMPACT (HUMAN-READABLE)               */}
      {/* =================================================================== */}
      {data && ram.activeSubTab === 'permissions' && (
        <div className="space-y-6">
          {/* Top Plain-Language Executive Guide */}
          <div
            className={`rounded-xl border p-5 space-y-2 ${
              data.identity.privilegeLevel === 'critical'
                ? 'border-rose-500/50 bg-rose-500/10'
                : data.identity.privilegeLevel === 'elevated'
                ? 'border-amber-500/50 bg-amber-500/10'
                : surfaceBg
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-bold">
              <ShieldCheck className="w-5 h-5 text-teal-500 shrink-0" />
              <span className={textPrimary}>
                {isEn
                  ? 'Human-Readable Summary: What Happens When a User Is Added to This Group?'
                  : 'توضیح ساده و کاربردی: اگر کاربری عضو این گروه شود چه دسترسی‌هایی می‌گیرد؟'}
              </span>
            </div>
            <p className={`text-xs sm:text-sm leading-relaxed ${textPrimary}`}>
              {isEn ? data.permissions.plainSummaryEn : data.permissions.plainSummaryFa}
            </p>
          </div>

          {/* Categorized Permission Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.permissions.insights.map((ins) => {
              const badgeStyle =
                ins.severity === 'critical'
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                  : ins.severity === 'high'
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                  : ins.severity === 'medium'
                  ? 'border-sky-500/40 bg-sky-500/10 text-sky-500'
                  : 'border-teal-500/30 bg-teal-500/10 text-teal-500';

              return (
                <div key={ins.id} className={`rounded-xl border p-4 space-y-2.5 ${surfaceBg}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className={`text-xs sm:text-sm font-bold ${textPrimary}`}>
                      {isEn ? ins.titleEn : ins.titleFa}
                    </h4>
                    {ins.sourceLabel && (
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-mono shrink-0 ${badgeStyle}`}>
                        {ins.sourceLabel}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs leading-relaxed ${textPrimary}`}>
                    {isEn ? ins.summaryEn : ins.summaryFa}
                  </p>
                  <div className={`rounded-lg border p-2.5 text-[11px] leading-relaxed ${subCardBg} ${textMuted}`}>
                    <strong className={textPrimary}>{isEn ? 'How it works: ' : 'نحوه عملکرد: '}</strong>
                    {isEn ? ins.howItWorksEn : ins.howItWorksFa}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Linked GPOs & Password Policies */}
          {(data.permissions.linkedGpos.length > 0 || data.permissions.appliedPasswordPolicies.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {data.permissions.linkedGpos.length > 0 && (
                <div className={`rounded-xl border p-5 space-y-3 ${surfaceBg}`}>
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Layers className="w-4 h-4 text-sky-500" />
                    <span className={textPrimary}>
                      {isEn ? 'Group Policy Objects (GPO) Targeting This Group' : 'پالیسی‌های GPO متصل به این گروه'}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {data.permissions.linkedGpos.map((gpo) => (
                      <div key={gpo.gpoId} className={`rounded-lg border p-3 text-xs space-y-1 ${subCardBg}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-bold ${textPrimary}`}>{gpo.gpoName}</span>
                          <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-500 font-mono text-[10px]">
                            {gpo.permissionLevel}
                          </span>
                        </div>
                        <div className={`text-[11px] ${textMuted}`}>
                          {isEn ? 'Linked OUs: ' : 'مسیرهای اعمال‌شده: '}
                          {gpo.linkedOus.length > 0 ? gpo.linkedOus.join(' , ') : '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.permissions.appliedPasswordPolicies.length > 0 && (
                <div className={`rounded-xl border p-5 space-y-3 ${surfaceBg}`}>
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <KeyRound className="w-4 h-4 text-amber-500" />
                    <span className={textPrimary}>
                      {isEn ? 'Fine-Grained Password Policies (FGPP)' : 'پالیسی‌های اختصاصی رمز عبور (FGPP)'}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {data.permissions.appliedPasswordPolicies.map((pso) => (
                      <div key={pso.name} className={`rounded-lg border p-3 text-xs space-y-1 ${subCardBg}`}>
                        <div className={`font-bold ${textPrimary}`}>{pso.name}</div>
                        <div className={`text-[11px] flex flex-wrap gap-3 ${textMuted}`}>
                          <span>{isEn ? `Min Length: ${pso.minLength ?? '-'}` : `حداقل طول رمز: ${pso.minLength ?? '-'}`}</span>
                          <span>{isEn ? `Lockout Threshold: ${pso.lockoutThreshold ?? '-'}` : `آستانه قفل: ${pso.lockoutThreshold ?? '-'}`}</span>
                          <span>{isEn ? `Max Age: ${pso.maxPasswordAgeDays ?? '-'}d` : `عمر رمز: ${pso.maxPasswordAgeDays ?? '-'} روز`}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AD Object Delegation ACLs (Who can manage/change this group) */}
          <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className={`text-sm font-bold flex items-center gap-2 ${textPrimary}`}>
                  <FileCode2 className="w-4 h-4 text-teal-500" />
                  <span>
                    {isEn
                      ? 'Who Can Manage or Edit This Group? (AD Object ACLs)'
                      : 'چه کسانی اجازه مدیریت، ویرایش یا تغییر اعضای این گروه را دارند؟'}
                  </span>
                </h3>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {isEn
                    ? 'Translated directly from Active Directory nTSecurityDescriptor permissions so anyone can read who has delegation control.'
                    : 'ترجمه مستقیم جدول دسترسی‌های امنیتی گروه (ACL) در اکتیو دایرکتوری به زبان ساده و شفاف.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className={`flex items-center gap-1.5 text-xs cursor-pointer ${textMuted}`}>
                  <input
                    type="checkbox"
                    checked={showInheritedAcls}
                    onChange={(e) => setShowInheritedAcls(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  <span>{isEn ? 'Show Inherited Read ACLs' : 'نمایش دسترسی‌های Read ارث‌بری‌شده'}</span>
                </label>
                <input
                  type="text"
                  value={aclSearch}
                  onChange={(e) => setAclSearch(e.target.value)}
                  placeholder={isEn ? 'Filter trustee or right...' : 'فیلتر کاربر یا نوع دسترسی...'}
                  className={`px-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                />
              </div>
            </div>

            {displayedAcls.length === 0 ? (
              <div className={`rounded-lg border p-4 text-xs ${subCardBg} ${textMuted}`}>
                {isEn
                  ? 'No matching ACL entries found (or toggle "Show Inherited Read ACLs" to view all baseline domain read rules).'
                  : 'موردی با این فیلتر یافت نشد (برای دیدن دسترسی‌های پیش‌فرض Read گزینه بالا را فعال کنید).'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className={`border-b text-[11px] ${isLightMode ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
                      <th className="py-2 px-2 text-start">{isEn ? 'User / Group (Trustee)' : 'شخص یا گروه دارای دسترسی'}</th>
                      <th className="py-2 px-2 text-start">{isEn ? 'Rule' : 'نوع'}</th>
                      <th className="py-2 px-2 text-start">{isEn ? 'Plain-Language Permission' : 'شرح دسترسی به زبان ساده'}</th>
                      <th className="py-2 px-2 text-start">{isEn ? 'Applies To' : 'محدوده اثر'}</th>
                      <th className="py-2 px-2 text-start">{isEn ? 'Source' : 'منشأ'}</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                    {displayedAcls.map((ace, idx) => (
                      <tr key={`${ace.trusteeSid}-${idx}`}>
                        <td className={`py-2 px-2 font-mono font-semibold ${textPrimary}`} dir="ltr">
                          {ace.trustee}
                        </td>
                        <td className="py-2 px-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              ace.accessType === 'Deny'
                                ? 'bg-rose-500/15 text-rose-500'
                                : ace.isPrivilegeWrite
                                ? 'bg-amber-500/15 text-amber-500'
                                : 'bg-emerald-500/15 text-emerald-500'
                            }`}
                          >
                            {ace.accessType}
                          </span>
                        </td>
                        <td className={`py-2 px-2 ${textPrimary}`}>
                          {isEn ? ace.rightsLabelEn : ace.rightsLabelFa}
                        </td>
                        <td className={`py-2 px-2 text-[11px] ${textMuted}`}>
                          {isEn ? ace.scopeNoteEn : ace.scopeNoteFa}
                        </td>
                        <td className={`py-2 px-2 text-[11px] ${textMuted}`}>
                          {ace.isInherited
                            ? isEn
                              ? 'Inherited from OU/Domain'
                              : 'ارث‌بری از OU/دامین'
                            : isEn
                            ? 'Explicit on Group'
                            : 'مستقیم روی گروه'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: MANAGEMENT REPORTS                                           */}
      {/* =================================================================== */}
      {data && ram.activeSubTab === 'reports' && (
        <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className={`text-sm font-bold flex items-center gap-2 ${textPrimary}`}>
                <FileText className="w-4 h-4 text-teal-500" />
                <span>{isEn ? 'Group Audit & Ticket-Ready Dossier' : 'گزارش جامع و خروجی آماده برای تیکت پشتیبانی'}</span>
              </h3>
              <p className={`text-xs mt-0.5 ${textMuted}`}>
                {isEn
                  ? 'Export or copy the full group ownership, OU path, members list, and plain-language permissions.'
                  : 'کپی سریع خلاصه گروه برای ثبت در تیکت یا دانلود گزارش کامل به فرمت HTML، CSV و JSON.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy('ticket_summary', buildTicketSummaryText())}
                className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {copiedKey === 'ticket_summary' ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <ClipboardCopy className="w-3.5 h-3.5" />
                )}
                <span>{isEn ? 'Copy Summary' : 'کپی خلاصه گزارش'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadHtmlReport}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>HTML / Print</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadCsvReport}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${subCardBg} ${textPrimary}`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadJsonReport}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${subCardBg} ${textPrimary}`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>JSON</span>
              </button>
            </div>
          </div>

          <pre
            className={`rounded-xl border p-4 text-xs font-mono whitespace-pre-wrap leading-relaxed ${subCardBg} ${textPrimary}`}
          >
            {buildTicketSummaryText()}
          </pre>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 5: CHECK HISTORY                                                */}
      {/* =================================================================== */}
      {ram.activeSubTab === 'history' && (
        <div className="space-y-4">
          {/* History KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className={`rounded-xl border p-4 ${surfaceBg}`}>
              <div className={`text-[11px] ${textMuted}`}>
                {isEn ? 'Total Group Checks' : 'مجموع استعلام گروه‌ها'}
              </div>
              <div className={`text-lg font-bold font-mono mt-1 ${textPrimary}`}>
                {historyStats?.totalChecks ?? 0}
              </div>
            </div>
            <div className={`rounded-xl border p-4 ${surfaceBg}`}>
              <div className={`text-[11px] ${textMuted}`}>
                {isEn ? 'Unique AD Groups' : 'گروه‌های یکتا'}
              </div>
              <div className={`text-lg font-bold font-mono mt-1 ${textPrimary}`}>
                {historyStats?.uniqueGroups ?? 0}
              </div>
            </div>
            <div className={`rounded-xl border p-4 ${surfaceBg}`}>
              <div className={`text-[11px] ${textMuted}`}>
                {isEn ? 'Privileged Groups Seen' : 'گروه‌های حساس بررسی‌شده'}
              </div>
              <div className="text-lg font-bold font-mono mt-1 text-amber-500">
                {historyStats?.privilegedSeenCount ?? 0}
              </div>
            </div>
            <div className={`rounded-xl border p-4 ${surfaceBg}`}>
              <div className={`text-[11px] ${textMuted}`}>
                {isEn ? 'History Visibility Scope' : 'محدوده نمایش تاریخچه'}
              </div>
              <div className="text-xs font-bold mt-1.5 text-teal-500">
                {historyScope === 'all'
                  ? isEn
                    ? 'All Operators (Admin)'
                    : 'تمام کارشناسان (دسترسی کامل)'
                  : isEn
                  ? 'My Own Checks Only'
                  : 'فقط بررسی‌های خود شما'}
              </div>
            </div>
          </div>

          <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
            {/* Filters & Clear Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={historySearchInput}
                  onChange={(e) => setHistorySearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setHistoryPage(1);
                      setHistorySearch(historySearchInput.trim());
                    }
                  }}
                  placeholder={isEn ? 'Search group, OU, creator...' : 'جستجوی گروه، OU یا سازنده...'}
                  className={`w-56 px-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                />
                <button
                  type="button"
                  onClick={() => {
                    setHistoryPage(1);
                    setHistorySearch(historySearchInput.trim());
                  }}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer"
                >
                  {isEn ? 'Filter' : 'اعمال'}
                </button>
                <select
                  value={historyStatusFilter}
                  onChange={(e) => {
                    setHistoryPage(1);
                    setHistoryStatusFilter(e.target.value as any);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="all">{isEn ? 'All Statuses' : 'همه وضعیت‌ها'}</option>
                  <option value="success">{isEn ? 'Success' : 'موفق'}</option>
                  <option value="failed">{isEn ? 'Failed' : 'ناموفق'}</option>
                </select>
                <select
                  value={historyActionFilter}
                  onChange={(e) => {
                    setHistoryPage(1);
                    setHistoryActionFilter(e.target.value as any);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="all">{isEn ? 'All Actions' : 'همه عملیات'}</option>
                  <option value="inspect">{isEn ? 'Inspect' : 'بررسی گروه'}</option>
                  <option value="add_member">{isEn ? 'Add Member' : 'افزودن عضو'}</option>
                  <option value="remove_member">{isEn ? 'Remove Member' : 'حذف عضو'}</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadGroupCheckHistory()}
                  disabled={loadingHistory}
                  className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 cursor-pointer ${subCardBg} ${textPrimary}`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                  <span>{isEn ? 'Refresh' : 'بروزرسانی'}</span>
                </button>

                {canManageGroupHistory &&
                  (confirmClearHistory ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busyHistoryId === 'ALL'}
                        onClick={handleClearHistory}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer"
                      >
                        {isEn ? 'Confirm Clear' : 'تایید پاک‌سازی'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearHistory(false)}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${subCardBg} ${textMuted}`}
                      >
                        {isEn ? 'Cancel' : 'انصراف'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmClearHistory(true)}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-500 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Clear History' : 'پاک‌سازی تاریخچه'}</span>
                    </button>
                  ))}
              </div>
            </div>

            {historyNotice && (
              <div
                className={`rounded-lg border p-2.5 text-xs ${
                  historyNotice.ok
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                }`}
              >
                {historyNotice.text}
              </div>
            )}

            {historyError && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-500">
                {historyError}
              </div>
            )}

            {loadingHistory && historyItems.length === 0 ? (
              <div className={`p-8 text-center text-xs ${textMuted}`}>
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-teal-500" />
                <span>{isEn ? 'Loading group check history...' : 'در حال بارگذاری تاریخچه بررسی گروه‌ها...'}</span>
              </div>
            ) : historyItems.length === 0 ? (
              <div className={`rounded-lg border p-8 text-center text-xs ${subCardBg} ${textMuted}`}>
                {isEn
                  ? 'No AD group check history entries recorded yet.'
                  : 'هنوز هیچ سابقه بررسی گروهی ثبت نشده است.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className={`border-b text-[11px] ${isLightMode ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
                      <th className="py-2 px-2 text-start">{isEn ? 'Checked At' : 'زمان'}</th>
                      <th className="py-2 px-2 text-start">{isEn ? 'Group' : 'گروه'}</th>
                      <th className="py-2 px-2 text-start">{isEn ? 'OU / Creator' : 'مسیر OU / سازنده'}</th>
                      <th className="py-2 px-2 text-start">{isEn ? 'Action / Members' : 'عملیات / اعضا'}</th>
                      <th className="py-2 px-2 text-start">{isEn ? 'Operator' : 'کارشناس'}</th>
                      <th className="py-2 px-2 text-end">{isEn ? 'Actions' : 'ابزار'}</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                    {historyItems.map((h) => (
                      <tr key={h.id}>
                        <td className={`py-2 px-2 whitespace-nowrap ${textMuted}`}>
                          {formatDateDisplay(h.checkedAt, isEn)}
                        </td>
                        <td className="py-2 px-2">
                          <div className={`font-semibold font-mono ${textPrimary}`}>{h.cn || h.queryTarget}</div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                            <span
                              className={`px-1.5 py-0.2 rounded ${
                                h.status === 'success'
                                  ? 'bg-emerald-500/15 text-emerald-500'
                                  : 'bg-rose-500/15 text-rose-500'
                              }`}
                            >
                              {h.status === 'success' ? (isEn ? 'Success' : 'موفق') : isEn ? 'Failed' : 'ناموفق'}
                            </span>
                            {h.isPrivileged && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-500">
                                {isEn ? 'Privileged' : 'حساس'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`py-2 px-2 text-[11px] ${textMuted}`}>
                          <div dir="ltr" className="truncate max-w-xs">
                            {h.organizationalUnit || '-'}
                          </div>
                          {h.creatorDisplay && (
                            <div dir="ltr" className="text-teal-500/90">
                              {h.creatorDisplay}
                            </div>
                          )}
                        </td>
                        <td className={`py-2 px-2 text-[11px] ${textMuted}`}>
                          <div>
                            {h.actionType === 'add_member'
                              ? isEn
                                ? `Add: ${h.actionTargetMember}`
                                : `افزودن عضو: ${h.actionTargetMember}`
                              : h.actionType === 'remove_member'
                              ? isEn
                                ? `Remove: ${h.actionTargetMember}`
                                : `حذف عضو: ${h.actionTargetMember}`
                              : h.memberCount !== null
                              ? isEn
                                ? `Inspect (${h.memberCount} members)`
                                : `بررسی (${h.memberCount} عضو)`
                              : isEn
                              ? 'Inspect'
                              : 'بررسی'}
                          </div>
                          {h.errorMessage && (
                            <div className="text-rose-500 truncate max-w-xs" title={h.errorMessage}>
                              {h.errorMessage}
                            </div>
                          )}
                        </td>
                        <td className={`py-2 px-2 font-mono ${textPrimary}`}>{h.actorName}</td>
                        <td className="py-2 px-2 text-end whitespace-nowrap">
                          <button
                            type="button"
                            disabled={!canInspectGroups}
                            onClick={() => handleReinspectFromHistory(h.samAccountName || h.queryTarget, h.domainController)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 disabled:opacity-40 text-sky-500 text-[11px] cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>{isEn ? 'Inspect' : 'بررسی مجدد'}</span>
                          </button>
                          {canManageGroupHistory && (
                            <button
                              type="button"
                              disabled={busyHistoryId === h.id}
                              onClick={() => handleDeleteHistoryItem(h.id)}
                              className="inline-flex items-center ms-1.5 p-1 rounded hover:bg-rose-500/15 text-rose-500 cursor-pointer"
                              title={isEn ? 'Delete entry' : 'حذف رکورد'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {historyTotal > historyPageSize && (
              <div className="flex items-center justify-between text-xs pt-2">
                <span className={textMuted}>
                  {isEn
                    ? `Page ${historyPage} of ${Math.max(1, Math.ceil(historyTotal / historyPageSize))} (${historyTotal} records)`
                    : `صفحه ${historyPage} از ${Math.max(1, Math.ceil(historyTotal / historyPageSize))} (${historyTotal} رکورد)`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={historyPage <= 1}
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    className={`px-2.5 py-1 rounded border disabled:opacity-40 cursor-pointer ${subCardBg} ${textPrimary}`}
                  >
                    {isEn ? 'Prev' : 'قبلی'}
                  </button>
                  <button
                    type="button"
                    disabled={historyPage >= Math.ceil(historyTotal / historyPageSize)}
                    onClick={() => setHistoryPage((p) => p + 1)}
                    className={`px-2.5 py-1 rounded border disabled:opacity-40 cursor-pointer ${subCardBg} ${textPrimary}`}
                  >
                    {isEn ? 'Next' : 'بعدی'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
