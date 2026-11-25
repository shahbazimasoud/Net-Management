import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  UserCog,
  UserCheck,
  UserX,
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
  ShieldAlert,
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
} from 'lucide-react';
import { AccessPolicy } from '../types';
import { AuthUser } from '../context/AuthContext';
import { isUserDomainAdmin, isUserSuperAdmin } from '../utils/rbac';
import { FieldInfoTooltip } from './common/FieldInfoTooltip';
import { TimeoutAntivirusHint } from './helpdesk/TimeoutAntivirusHint';
import {
  HelpdeskUserSubTab,
  getHelpdeskUserRamSnapshot,
  subscribeHelpdeskUserRam,
  patchHelpdeskUserRamSnapshot,
  bindHelpdeskUserRamOwner,
  wipeHelpdeskUserRamSession,
  runHelpdeskUserInspect,
  runHelpdeskUserMailboxRefresh,
  runHelpdeskUserUnlock,
} from '../services/helpdeskUserRamSession';
import { fetchHelpdeskStatus } from '../services/api';

interface HelpDeskUsersViewProps {
  isLightMode: boolean;
  isEn: boolean;
  effectivePolicy?: AccessPolicy | null;
  currentUser?: AuthUser | null;
  onNavigateToEndpointHelpdesk?: () => void;
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

export const HelpDeskUsersView: React.FC<HelpDeskUsersViewProps> = ({
  isLightMode,
  isEn,
  effectivePolicy,
  currentUser,
  onNavigateToEndpointHelpdesk,
}) => {
  const ram = useSyncExternalStore(subscribeHelpdeskUserRam, getHelpdeskUserRamSnapshot);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');

  // Bind session owner so user switch cleanly wipes any sensitive RAM state
  useEffect(() => {
    bindHelpdeskUserRamOwner(currentUser?.id || currentUser?.username || null);
  }, [currentUser?.id, currentUser?.username]);

  // Fetch HelpDesk RBAC/rate-limit status on mount
  useEffect(() => {
    fetchHelpdeskStatus()
      .then((res) => {
        if (res?.rateLimit) {
          patchHelpdeskUserRamSnapshot({ rateLimit: res.rateLimit });
        }
      })
      .catch(() => {});
  }, []);

  // Reset inline confirm whenever target user changes or finishes unlocking
  useEffect(() => {
    setConfirmUnlock(false);
  }, [ram.userData?.profile.samAccountName, ram.unlockResult]);

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

  const handleSubmitInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canInspectUsers) return;
    await runHelpdeskUserInspect();
  };

  const handleInspectRelatedPerson = async (samOrDn: string) => {
    if (!samOrDn || !canInspectUsers) return;
    await runHelpdeskUserInspect(samOrDn);
    patchHelpdeskUserRamSnapshot({ activeSubTab: 'overview' });
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

  const subTabs: Array<{
    id: HelpdeskUserSubTab;
    labelEn: string;
    labelFa: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string | number | null;
    alert?: boolean;
  }> = [
    {
      id: 'overview',
      labelEn: 'Profile, Role & Contact Info',
      labelFa: 'پروفایل سازمانی و راه‌های ارتباطی',
      icon: UserCheck,
      badge: null,
    },
    {
      id: 'security',
      labelEn: 'Password, Lockout & Security',
      labelFa: 'رمز عبور، قفل اکانت و امنیت',
      icon: data?.security.accountLocked ? Lock : KeyRound,
      badge: data?.security.accountLocked
        ? isEn
          ? 'LOCKED'
          : 'قفل‌شده'
        : data?.security.passwordExpired
        ? isEn
          ? 'EXPIRED'
          : 'منقضی'
        : null,
      alert: Boolean(data?.security.accountLocked || data?.security.passwordExpired),
    },
    {
      id: 'mailbox',
      labelEn: 'Mailbox Size & Exchange Quota',
      labelFa: 'حجم میل‌باکس و سهمیه Exchange',
      icon: Mail,
      badge:
        data?.mailbox.usedPercent !== null && data?.mailbox.usedPercent !== undefined
          ? `${data.mailbox.usedPercent}%`
          : null,
      alert: Boolean(
        data?.mailbox.usedPercent !== null &&
          data?.mailbox.usedPercent !== undefined &&
          data.mailbox.usedPercent >= 90
      ),
    },
    {
      id: 'groups',
      labelEn: 'AD Groups & OU Directory',
      labelFa: 'گروه‌های اکتیو دایرکتوری و ساختار OU',
      icon: FolderTree,
      badge: data?.groups ? data.groups.length : null,
    },
  ];

  const NavArrow = isEn ? ChevronRight : ChevronLeft;

  return (
    <div className="space-y-4 pb-8 max-w-[1600px] mx-auto">
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
              disabled={!canInspectUsers || ram.loading}
              className="flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-semibold transition whitespace-nowrap cursor-pointer"
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
                      ? 'FQDN or IP of your on-premises Microsoft Exchange server for live mailbox usage queries.'
                      : 'نام دامنه یا آدرس IP سرور مایکروسافت Exchange جهت استعلام زنده حجم استفاده شده میل‌باکس.'
                  }
                  whyNeeded={
                    isEn
                      ? 'AD alone stores quota limits but not live TotalItemSize; this tells the panel which Exchange server to query via Remote PowerShell (auto-discovered from homeMDB when possible).'
                      : 'اکتیو دایرکتوری فقط سقف سهمیه را دارد اما حجم مصرفی لحظه‌ای از طریق Exchange PowerShell دریافت می‌شود (در صورت امکان از homeMDB خودکار کشف می‌شود).'
                  }
                  example="mail.corp.local or 192.168.10.25"
                />
              </label>
              <input
                type="text"
                dir="ltr"
                value={ram.exchangeServer}
                onChange={(e) => patchHelpdeskUserRamSnapshot({ exchangeServer: e.target.value })}
                placeholder={isEn ? 'Auto-discover from homeMDB' : 'شناسایی خودکار از homeMDB'}
                className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none transition ${inputCls}`}
              />
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

      {/* Pre-Connection Empty State */}
      {!data && !ram.loading && !ram.error && (
        <div className={`rounded-xl border p-8 sm:p-12 text-center space-y-4 ${surfaceBg}`}>
          <div
            className={`w-14 h-14 mx-auto rounded-2xl border flex items-center justify-center ${
              isLightMode
                ? 'bg-teal-50 border-teal-200 text-teal-600'
                : 'bg-teal-950/40 border-teal-500/30 text-teal-400'
            }`}
          >
            <UserCog className="w-7 h-7" />
          </div>
          <div className="max-w-xl mx-auto space-y-1.5">
            <h2 className={`text-base font-bold ${textPrimary}`}>
              {isEn
                ? 'Enter a Domain Username Above to Inspect Profile, Lockout & Mailbox'
                : 'برای بررسی پروفایل، وضعیت قفل، رمز عبور و حجم میل‌باکس، نام کاربری را در بالا وارد کنید'}
            </h2>
            <p className={`text-xs leading-relaxed ${textMuted}`}>
              {isEn
                ? 'Unlike Agentless Endpoint HelpDesk (which targets a workstation IP), this workspace inspects the user account directly in Active Directory and Exchange — displaying full name, job title, department, all extensions and mobile numbers, email aliases, password expiration, lockout release, and live mailbox storage usage.'
                : 'در این بخش برخلاف هلپ‌دسک سیستم (که با IP به کامپیوتر وصل می‌شود)، مستقیماً کاربر را در اکتیو دایرکتوری و Exchange بررسی می‌کنید: نام کامل، سمت سازمانی، دپارتمان، تمام شماره‌های داخلی و موبایل، آدرس‌های ایمیل، تاریخ تغییر و انقضای پسورد، رفع قفل اکانت (Unlock) و حجم مصرفی میل‌باکس.'}
            </p>
          </div>
        </div>
      )}

      {/* Loading Skeleton Banner */}
      {ram.loading && (
        <div className={`rounded-xl border p-6 flex items-center justify-center gap-3 text-xs ${surfaceBg}`}>
          <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
          <span className={`font-medium ${textPrimary}`}>
            {isEn
              ? 'Querying Active Directory, password policy & Exchange mailbox statistics...'
              : 'در حال استعلام اطلاعات کاربر از اکتیو دایرکتوری، سیاست رمز و آمار میل‌باکس Exchange...'}
          </span>
        </div>
      )}

      {/* Sub-Tabs Navigation + Content */}
      {data && !ram.loading && (
        <>
          <div className="flex flex-wrap gap-2">
            {subTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = ram.activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => patchHelpdeskUserRamSnapshot({ activeSubTab: tab.id })}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                    isActive
                      ? 'bg-teal-600 border-teal-500 text-white shadow-sm'
                      : isLightMode
                      ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                      : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isActive
                        ? 'text-white'
                        : tab.alert
                        ? 'text-rose-500'
                        : 'text-teal-500'
                    }`}
                  />
                  <span>{isEn ? tab.labelEn : tab.labelFa}</span>
                  {tab.badge !== null && tab.badge !== undefined && (
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : tab.alert
                          ? 'bg-rose-500/15 text-rose-500'
                          : isLightMode
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => runHelpdeskUserInspect()}
              className={`ms-auto flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition cursor-pointer ${
                isLightMode
                  ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5 text-teal-500" />
              <span>{isEn ? 'Refresh All' : 'بروزرسانی کامل'}</span>
            </button>
          </div>

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
                      : surfaceBg
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${
                          data.security.accountLocked
                            ? 'bg-rose-500/15 border-rose-500/35 text-rose-500'
                            : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-500'
                        }`}
                      >
                        {data.security.accountLocked ? (
                          <Lock className="w-5 h-5" />
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
                            : isEn
                            ? 'Account Lockout Status: Unlocked (Normal)'
                            : 'وضعیت اکانت: باز و بدون قفل (Unlocked)'}
                        </h3>
                        <p className={`text-xs mt-0.5 ${textMuted}`}>
                          {data.security.accountLocked
                            ? isEn
                              ? `Locked at ${formatDateDisplay(data.security.lockedAt, true)} · Failed logins: ${data.security.badPwdCount}`
                              : `زمان قفل شدن: ${formatDateDisplay(data.security.lockedAt, false)} · تلاش ناموفق: ${data.security.badPwdCount}`
                            : isEn
                            ? 'No active lockout timer on this domain account.'
                            : 'در حال حاضر هیچ قفل امنیتی روی این اکانت دامین فعال نیست.'}
                        </p>
                      </div>
                    </div>

                    {/* Two-step Unlock Action */}
                    {canUnlockAccount && (data.security.accountLocked || data.security.badPwdCount > 0) && (
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
                                ? 'Reset Lockout State'
                                : 'بازنشانی شمارنده قفل'}
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

                  {/* Lockout & Bad Password Counters */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className={`rounded-lg border p-3 ${subSurfaceBg}`}>
                      <div className={`text-[11px] mb-1 ${textMuted}`}>
                        {isEn ? 'Bad Password Count' : 'تعداد رمز اشتباه (BadPwd)'}
                      </div>
                      <div className={`text-sm font-mono font-bold tabular-nums ${textPrimary}`}>
                        {data.security.badPwdCount}
                        {data.security.domainPolicy.lockoutThreshold
                          ? ` / ${data.security.domainPolicy.lockoutThreshold}`
                          : ''}
                      </div>
                    </div>
                    <div className={`rounded-lg border p-3 ${subSurfaceBg}`}>
                      <div className={`text-[11px] mb-1 ${textMuted}`}>
                        {isEn ? 'Last Bad Password' : 'آخرین تلاش ناموفق'}
                      </div>
                      <div className={`text-xs font-mono ${textPrimary}`}>
                        {formatDateDisplay(data.security.badPasswordTime, isEn)}
                      </div>
                    </div>
                    <div className={`rounded-lg border p-3 ${subSurfaceBg}`}>
                      <div className={`text-[11px] mb-1 ${textMuted}`}>
                        {isEn ? 'Lockout Timestamp' : 'زمان دقیق قفل شدن'}
                      </div>
                      <div className={`text-xs font-mono ${textPrimary}`}>
                        {data.security.lockedAt ? formatDateDisplay(data.security.lockedAt, isEn) : '-'}
                      </div>
                    </div>
                  </div>
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
                  <input
                    type="text"
                    dir="ltr"
                    value={ram.exchangeServer}
                    onChange={(e) => patchHelpdeskUserRamSnapshot({ exchangeServer: e.target.value })}
                    placeholder={
                      data.mailbox.serverName ||
                      data.mailbox.exchangeHostUsed ||
                      'mail.corp.local'
                    }
                    className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none transition ${inputCls}`}
                  />
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
                  {filteredGroups.map((grp, idx) => (
                    <div
                      key={`${grp.dn}-${idx}`}
                      className={`rounded-lg border p-3 flex items-start justify-between gap-2 ${subSurfaceBg}`}
                    >
                      <div className="min-w-0">
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
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`text-xs py-6 text-center ${textMuted}`}>
                  {isEn ? 'No matching groups found.' : 'هیچ گروهی با این عبارت یافت نشد.'}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
