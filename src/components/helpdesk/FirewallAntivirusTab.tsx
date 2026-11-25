import React, { useMemo, useState } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Flame,
  Play,
  Square,
  RefreshCw,
  Plus,
  Search,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Info,
  KeyRound,
} from 'lucide-react';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { DeleteConfirmModal, DeleteGenericTarget } from '../DeleteConfirmModal';

export interface FirewallAntivirusTabProps {
  isLightMode: boolean;
  isEn: boolean;
  targetIp: string;
  canExecuteActions: boolean;
  data: any | null;
  loading: boolean;
  error: string | null;
  actionResult: any | null;
  actionError: string | null;
  disabledInSessionIds: string[];
  busyKey: string | null;
  onClearActionBanner: () => void;
  onRefresh: () => void;
  onControlAntivirus: (params: {
    productId: string;
    productName: string;
    serviceName?: string;
    action: 'start' | 'stop' | 'restart' | 'enable_realtime' | 'disable_realtime';
    unlockPassword?: string;
  }) => Promise<void>;
  onToggleFirewallProfile: (params: {
    profile: 'Domain' | 'Private' | 'Public' | 'All' | 'UFW' | 'Firewalld';
    enabled: boolean;
  }) => Promise<void>;
  onCreateFirewallRule: (params: {
    displayName: string;
    direction: 'Inbound' | 'Outbound';
    action: 'Allow' | 'Block';
    protocol: 'TCP' | 'UDP' | 'Any' | 'ICMPv4' | 'ICMPv6';
    localPort?: string;
    remotePort?: string;
    remoteAddress?: string;
    program?: string;
    profiles: Array<'Domain' | 'Private' | 'Public'>;
    description?: string;
  }) => Promise<boolean>;
  onManageFirewallRule: (params: {
    ruleName: string;
    displayName: string;
    action: 'enable' | 'disable' | 'allow' | 'block' | 'delete';
  }) => Promise<void>;
}

const RULES_PAGE_SIZE = 25;

export const FirewallAntivirusTab: React.FC<FirewallAntivirusTabProps> = ({
  isLightMode,
  isEn,
  targetIp,
  canExecuteActions,
  data,
  loading,
  error,
  actionResult,
  actionError,
  disabledInSessionIds,
  busyKey,
  onClearActionBanner,
  onRefresh,
  onControlAntivirus,
  onToggleFirewallProfile,
  onCreateFirewallRule,
  onManageFirewallRule,
}) => {
  // Password-protected AV Stop prompt state (kept strictly in component RAM, cleared right after submit)
  const [stopPromptAv, setStopPromptAv] = useState<{
    id: string;
    productName: string;
    serviceName: string;
    isMicrosoftDefender: boolean;
    supportsPasswordStop: boolean;
  } | null>(null);
  const [avStopPassword, setAvStopPassword] = useState('');
  const [showAvStopPassword, setShowAvStopPassword] = useState(false);

  // Firewall Rules filter / pagination / creation drawer state
  const [ruleSearch, setRuleSearch] = useState('');
  const [ruleDirFilter, setRuleDirFilter] = useState<'all' | 'Inbound' | 'Outbound'>('all');
  const [ruleActionFilter, setRuleActionFilter] = useState<'all' | 'Allow' | 'Block'>('all');
  const [ruleStateFilter, setRuleStateFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [rulePage, setRulePage] = useState(1);

  const [showCreateRule, setShowCreateRule] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleDir, setNewRuleDir] = useState<'Inbound' | 'Outbound'>('Inbound');
  const [newRuleAction, setNewRuleAction] = useState<'Allow' | 'Block'>('Allow');
  const [newRuleProto, setNewRuleProto] = useState<'TCP' | 'UDP' | 'Any' | 'ICMPv4' | 'ICMPv6'>('TCP');
  const [newRuleLocalPort, setNewRuleLocalPort] = useState('');
  const [newRuleRemotePort, setNewRuleRemotePort] = useState('');
  const [newRuleRemoteAddr, setNewRuleRemoteAddr] = useState('');
  const [newRuleProgram, setNewRuleProgram] = useState('');
  const [newRuleProfiles, setNewRuleProfiles] = useState<Array<'Domain' | 'Private' | 'Public'>>([
    'Domain',
    'Private',
    'Public',
  ]);
  const [newRuleDesc, setNewRuleDesc] = useState('');
  const [deleteRuleTarget, setDeleteRuleTarget] = useState<{
    ruleName: string;
    displayName: string;
    modalTarget: DeleteGenericTarget;
  } | null>(null);

  const surfaceBg = isLightMode
    ? 'bg-white border-slate-200'
    : 'bg-slate-900/75 border-slate-800';
  const subSurfaceBg = isLightMode
    ? 'bg-slate-50 border-slate-200'
    : 'bg-slate-950/70 border-slate-800';
  const textPrimary = isLightMode ? 'text-slate-900' : 'text-slate-100';
  const textMuted = isLightMode ? 'text-slate-600' : 'text-slate-400';
  const inputCls = isLightMode
    ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-sky-500'
    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-sky-400';

  const avProducts: any[] = useMemo(
    () => (Array.isArray(data?.antivirus?.products) ? data.antivirus.products : []),
    [data]
  );
  const fwProfiles: any[] = useMemo(
    () => (Array.isArray(data?.firewall?.profiles) ? data.firewall.profiles : []),
    [data]
  );
  const thirdPartyFirewalls: any[] = useMemo(
    () => (Array.isArray(data?.firewall?.thirdPartyFirewalls) ? data.firewall.thirdPartyFirewalls : []),
    [data]
  );
  const fwRules: any[] = useMemo(
    () => (Array.isArray(data?.firewall?.rules) ? data.firewall.rules : []),
    [data]
  );

  // Determine items requiring urgent re-enable attention!
  const disabledAvNeedsAttention = useMemo(() => {
    return avProducts.filter((av) => {
      if (av.enabled) return false;
      // If Defender is passively managed by an active 3rd-party AV AND wasn't manually stopped in this session, it's expected
      if (av.isPassiveMode && !disabledInSessionIds.includes(`av:${av.id}`)) return false;
      return true;
    });
  }, [avProducts, disabledInSessionIds]);

  const disabledFwProfilesNeedAttention = useMemo(() => {
    return fwProfiles.filter((p) => {
      if (p.enabled) return false;
      if (p.supersededByThirdParty && !disabledInSessionIds.includes(`fw:${p.name}`)) return false;
      return true;
    });
  }, [fwProfiles, disabledInSessionIds]);

  const hasUrgentSecurityAlert =
    disabledAvNeedsAttention.length > 0 ||
    disabledFwProfilesNeedAttention.length > 0 ||
    Boolean(data?.antivirus?.unprotectedWarning);

  const filteredRules = useMemo(() => {
    const q = ruleSearch.trim().toLowerCase();
    return fwRules.filter((r) => {
      if (ruleDirFilter !== 'all' && r.direction !== ruleDirFilter) return false;
      if (ruleActionFilter !== 'all' && r.action !== ruleActionFilter) return false;
      if (ruleStateFilter === 'enabled' && !r.enabled) return false;
      if (ruleStateFilter === 'disabled' && r.enabled) return false;
      if (!q) return true;
      return (
        String(r.displayName || '').toLowerCase().includes(q) ||
        String(r.name || '').toLowerCase().includes(q) ||
        String(r.localPort || '').toLowerCase().includes(q) ||
        String(r.remoteAddress || '').toLowerCase().includes(q) ||
        String(r.program || '').toLowerCase().includes(q) ||
        String(r.group || '').toLowerCase().includes(q)
      );
    });
  }, [fwRules, ruleSearch, ruleDirFilter, ruleActionFilter, ruleStateFilter]);

  const totalRulePages = Math.max(1, Math.ceil(filteredRules.length / RULES_PAGE_SIZE));
  const clampedPage = Math.min(Math.max(1, rulePage), totalRulePages);
  const paginatedRules = useMemo(() => {
    const start = (clampedPage - 1) * RULES_PAGE_SIZE;
    return filteredRules.slice(start, start + RULES_PAGE_SIZE);
  }, [filteredRules, clampedPage]);

  const handleConfirmStopAv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stopPromptAv) return;
    const pw = avStopPassword;
    const target = stopPromptAv;
    setAvStopPassword('');
    setShowAvStopPassword(false);
    setStopPromptAv(null);
    await onControlAntivirus({
      productId: target.id,
      productName: target.productName,
      serviceName: target.serviceName,
      action: target.isMicrosoftDefender ? 'disable_realtime' : 'stop',
      unlockPassword: pw || undefined,
    });
  };

  const handleSubmitNewRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleName.trim()) return;
    const ok = await onCreateFirewallRule({
      displayName: newRuleName.trim(),
      direction: newRuleDir,
      action: newRuleAction,
      protocol: newRuleProto,
      localPort: newRuleLocalPort.trim() || undefined,
      remotePort: newRuleRemotePort.trim() || undefined,
      remoteAddress: newRuleRemoteAddr.trim() || undefined,
      program: newRuleProgram.trim() || undefined,
      profiles: newRuleProfiles.length > 0 ? newRuleProfiles : ['Domain', 'Private', 'Public'],
      description: newRuleDesc.trim() || undefined,
    });
    if (ok) {
      setNewRuleName('');
      setNewRuleLocalPort('');
      setNewRuleRemotePort('');
      setNewRuleRemoteAddr('');
      setNewRuleProgram('');
      setNewRuleDesc('');
      setShowCreateRule(false);
    }
  };

  const toggleProfileCheckbox = (prof: 'Domain' | 'Private' | 'Public') => {
    setNewRuleProfiles((prev) =>
      prev.includes(prof) ? prev.filter((p) => p !== prof) : [...prev, prof]
    );
  };

  // Accurate busyKey matchers aligned with HelpDeskView handlers:
  // - av:${productId}:${action}
  // - fw:profile:${profile}
  // - fw:rule:create
  // - fw:rule:${ruleName}:${action}
  const getAvBusyAction = (productId: string): string | null => {
    if (!busyKey) return null;
    const prefix = `av:${productId}:`;
    return busyKey.startsWith(prefix) ? busyKey.slice(prefix.length) : null;
  };

  const isFwAllBusy = busyKey === 'fw:profile:All';
  const isFwProfileBusy = (profileName: string): boolean =>
    Boolean(busyKey && (busyKey === `fw:profile:${profileName}` || isFwAllBusy));
  const isFwCreateBusy = busyKey === 'fw:rule:create';
  const getFwRuleBusyAction = (ruleName: string): string | null => {
    if (!busyKey) return null;
    const prefix = `fw:rule:${ruleName}:`;
    return busyKey.startsWith(prefix) ? busyKey.slice(prefix.length) : null;
  };

  const activeBusyDescription = useMemo(() => {
    if (!busyKey) return null;
    if (busyKey.startsWith('av:')) {
      const parts = busyKey.split(':');
      const action = parts[parts.length - 1];
      const prodId = parts.slice(1, -1).join(':');
      const matchedAv = avProducts.find((a) => String(a.id) === prodId);
      const name = matchedAv?.productName || (isEn ? 'Antivirus' : 'آنتی‌ویروس');
      if (action === 'stop' || action === 'disable_realtime') {
        return isEn
          ? `Stopping / disabling ${name} on ${targetIp || 'endpoint'}... Please wait.`
          : `در حال توقف / غیرفعال‌سازی ${name} روی سیستم کاربر... لطفاً شکیبا باشید.`;
      }
      if (action === 'restart') {
        return isEn
          ? `Restarting ${name} service on ${targetIp || 'endpoint'}...`
          : `در حال ری‌استارت سرویس ${name} روی سیستم کاربر...`;
      }
      return isEn
        ? `Starting / enabling ${name} on ${targetIp || 'endpoint'}... Please wait.`
        : `در حال راه‌اندازی / فعال‌سازی ${name} روی سیستم کاربر... لطفاً شکیبا باشید.`;
    }
    if (busyKey.startsWith('fw:profile:')) {
      const prof = busyKey.slice('fw:profile:'.length);
      const targetLabel =
        prof === 'All'
          ? isEn
            ? 'all Firewall profiles'
            : 'تمام پروفایل‌های فایروال'
          : isEn
          ? `Firewall profile (${prof})`
          : `پروفایل فایروال (${prof})`;
      return isEn
        ? `Updating ${targetLabel} on ${targetIp || 'endpoint'}... Please wait.`
        : `در حال تغییر وضعیت ${targetLabel} روی سیستم کاربر... لطفاً شکیبا باشید.`;
    }
    if (busyKey === 'fw:rule:create') {
      return isEn
        ? 'Creating new Firewall rule on endpoint... Please wait.'
        : 'در حال ثبت رول جدید فایروال روی سیستم کاربر...';
    }
    if (busyKey.startsWith('fw:rule:')) {
      return isEn
        ? 'Applying Firewall rule change on endpoint... Please wait.'
        : 'در حال اعمال تغییر روی رول فایروال...';
    }
    return isEn ? 'Executing security operation...' : 'در حال اجرای عملیات امنیتی...';
  }, [busyKey, avProducts, isEn, targetIp]);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className={`rounded-xl border p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 ${surfaceBg}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`p-2.5 rounded-xl border shrink-0 ${
              hasUrgentSecurityAlert
                ? isLightMode
                  ? 'bg-rose-50 border-rose-300 text-rose-600'
                  : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                : isLightMode
                ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
            }`}
          >
            {hasUrgentSecurityAlert ? (
              <ShieldAlert className="w-5 h-5" />
            ) : (
              <ShieldCheck className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className={`text-base font-bold truncate ${textPrimary}`}>
                {isEn
                  ? 'Endpoint Firewall & Antivirus Protection'
                  : 'مدیریت فایروال ویندوز و آنتی‌ویروس‌های نصب‌شده'}
              </h2>
              <FieldInfoTooltip
                isEn={isEn}
                isLightMode={isLightMode}
                fieldName={isEn ? 'Firewall & Antivirus Overview' : 'پایش فایروال و آنتی‌ویروس'}
                whatIsIt={
                  isEn
                    ? 'Inspects active Windows Firewall profiles/rules alongside Microsoft Defender and only the 3rd-party Antivirus products actually installed on the endpoint.'
                    : 'وضعیت پروفایل‌ها و قوانین فایروال ویندوز، آنتی‌ویروس مایکروسافت و صرفاً آنتی‌ویروس‌های معروفی که واقعاً روی سیستم نصب شده‌اند (مانند ESET، Symantec، McAfee، Kaspersky و...) را نمایش و کنترل می‌کند.'
                }
                whyIsItNeeded={
                  isEn
                    ? 'Allows quick troubleshooting of blocked ports or false-positive AV blocks while highlighting disabled protection in vivid red/amber so it is always re-enabled.'
                    : 'برای عیب‌یابی سریع پورت‌های بسته یا توقف موقت آنتی‌ویروس هنگام تست، همراه با هشدار رنگی واضح در صورت غیرفعال بودن حفاظت تا حتماً دوباره فعال شود.'
                }
                practicalExample={
                  isEn
                    ? 'Open TCP 8080 Inbound or temporarily stop Symantec with its unlock password'
                    : 'باز کردن پورت TCP 8080 در فایروال یا توقف موقت Symantec با وارد کردن رمز حفاظتی'
                }
              />
            </div>
            <div className={`text-xs flex flex-wrap items-center gap-2 mt-0.5 ${textMuted}`}>
              <span>
                {data?.hostname ? `${data.hostname} (${data.targetIp})` : targetIp || (isEn ? 'No host connected' : 'سیستمی متصل نیست')}
              </span>
              {data && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {isEn
                      ? `${avProducts.length} Installed AV`
                      : `${avProducts.length} آنتی‌ویروس نصب‌شده`}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {isEn
                      ? `${data.firewall?.totalRules ?? 0} Firewall Rules (${data.firewall?.enabledRules ?? 0} active)`
                      : `${data.firewall?.totalRules ?? 0} رول فایروال (${data.firewall?.enabledRules ?? 0} فعال)`}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 transition whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{isEn ? 'Refresh Security Status' : 'بروزرسانی وضعیت امنیت'}</span>
        </button>
      </div>

      {/* Active Operation Progress Banner */}
      {activeBusyDescription && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 flex items-center gap-3 text-xs font-semibold ${
            isLightMode
              ? 'bg-sky-50 border-sky-300 text-sky-900'
              : 'bg-sky-950/50 border-sky-500/45 text-sky-200'
          }`}
        >
          <Loader2 className="w-4 h-4 text-sky-500 animate-spin shrink-0" />
          <span className="break-words">{activeBusyDescription}</span>
        </div>
      )}

      {/* Action Feedback Banners */}
      {actionResult && (
        <div
          className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 text-xs ${
            actionResult.success
              ? isLightMode
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-emerald-500/10 border-emerald-500/35 text-emerald-200'
              : isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-rose-500/10 border-rose-500/35 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {actionResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            )}
            <span className="break-words font-medium">
              {isEn ? actionResult.message : actionResult.messageFa || actionResult.message}
            </span>
          </div>
          <button
            type="button"
            onClick={onClearActionBanner}
            className="p-1 opacity-70 hover:opacity-100 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div
          className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 text-xs ${
            isLightMode
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="break-words">{actionError}</span>
          </div>
          <button
            type="button"
            onClick={onClearActionBanner}
            className="p-1 opacity-70 hover:opacity-100 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div
          className={`rounded-xl border p-4 flex items-start gap-3 text-xs ${
            isLightMode
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-rose-500/10 border-rose-500/40 text-rose-200'
          }`}
        >
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <div className="font-bold">
              {isEn ? 'Failed to Inspect Firewall & Antivirus' : 'خطا در دریافت اطلاعات فایروال و آنتی‌ویروس'}
            </div>
            <div className="break-words">{error}</div>
          </div>
        </div>
      )}

      {/* URGENT RE-ENABLE SAFETY WARNING BANNER whenever any AV or Firewall is Disabled */}
      {data && hasUrgentSecurityAlert && (
        <div
          className={`rounded-xl border-2 p-4 space-y-3 ${
            isLightMode
              ? 'bg-rose-50 border-rose-500 text-rose-950'
              : 'bg-rose-950/70 border-rose-500 text-rose-100'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <ShieldOff className="w-5 h-5 text-rose-500 shrink-0" />
              <div>
                <div className="text-sm font-bold text-rose-600 dark:text-rose-300">
                  {isEn
                    ? 'Security Protection Disabled — Remember to Re-Enable!'
                    : 'هشدار مهم امنیتی: حفاظت آنتی‌ویروس یا فایروال غیرفعال است — فراموش نکنید دوباره فعال کنید!'}
                </div>
                <p className={`text-xs mt-0.5 ${isLightMode ? 'text-rose-800' : 'text-rose-200/90'}`}>
                  {isEn
                    ? 'Leaving endpoint antivirus or firewall disabled exposes the workstation to malware and lateral movement. Re-enable protection immediately after finishing troubleshooting.'
                    : 'غیرفعال ماندن آنتی‌ویروس یا فایروال سیستم کاربر را در برابر باج‌افزار و نفوذ آسیب‌پذیر می‌کند. بلافاصله پس از اتمام بررسی، با دکمه‌های زیر حفاظت را مجدداً فعال کنید.'}
                </p>
              </div>
            </div>

            {canExecuteActions && (
              <div className="flex flex-wrap items-center gap-2">
                {disabledAvNeedsAttention.map((av) => {
                  const bKey = `av:${av.id}`;
                  const avBusyAction = getAvBusyAction(av.id);
                  const isAvLoading = avBusyAction !== null;
                  return (
                    <button
                      key={bKey}
                      type="button"
                      disabled={isAvLoading || Boolean(busyKey)}
                      onClick={() =>
                        onControlAntivirus({
                          productId: av.id,
                          productName: av.productName,
                          serviceName: av.serviceName,
                          action: av.isMicrosoftDefender ? 'enable_realtime' : 'start',
                        })
                      }
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      {isAvLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isAvLoading
                          ? isEn
                            ? `Enabling ${av.vendor}...`
                            : `در حال فعال‌سازی ${av.vendor}...`
                          : isEn
                          ? `Re-Enable ${av.vendor}`
                          : `فعال‌سازی مجدد ${av.vendor}`}
                      </span>
                    </button>
                  );
                })}
                {disabledFwProfilesNeedAttention.length > 0 && (() => {
                  const targetProfile =
                    disabledFwProfilesNeedAttention.length === 1
                      ? (disabledFwProfilesNeedAttention[0].name as any)
                      : 'All';
                  const isReEnableFwBusy = isFwProfileBusy(targetProfile) || isFwAllBusy;
                  return (
                    <button
                      type="button"
                      disabled={isReEnableFwBusy || Boolean(busyKey)}
                      onClick={() =>
                        onToggleFirewallProfile({
                          profile: targetProfile,
                          enabled: true,
                        })
                      }
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      {isReEnableFwBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isReEnableFwBusy
                          ? isEn
                            ? 'Re-Enabling Firewall...'
                            : 'در حال فعال‌سازی فایروال...'
                          : isEn
                          ? 'Re-Enable Firewall'
                          : 'فعال‌سازی مجدد فایروال'}
                      </span>
                    </button>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading / Empty State */}
      {loading && !data && (
        <div className={`rounded-xl border p-12 text-center space-y-3 ${surfaceBg}`}>
          <Loader2 className="w-8 h-8 mx-auto text-sky-500 animate-spin" />
          <div className={`text-xs font-medium ${textMuted}`}>
            {isEn
              ? 'Querying Windows Firewall profiles/rules, Microsoft Defender, and installed 3rd-party Antivirus engines...'
              : 'در حال دریافت وضعیت پروفایل‌ها و رول‌های فایروال، آنتی‌ویروس ویندوز و آنتی‌ویروس‌های نصب‌شده روی سیستم...'}
          </div>
        </div>
      )}

      {!loading && !data && !error && (
        <div className={`rounded-xl border p-10 text-center space-y-3 ${surfaceBg}`}>
          <Shield className="w-10 h-10 mx-auto text-sky-500 opacity-80" />
          <h3 className={`text-sm font-bold ${textPrimary}`}>
            {isEn ? 'Ready to Inspect Endpoint Security & Firewall' : 'آماده بررسی فایروال و آنتی‌ویروس سیستم کاربر'}
          </h3>
          <p className={`text-xs max-w-xl mx-auto ${textMuted}`}>
            {isEn
              ? 'Connect to a workstation above or click Refresh Security Status to view installed antivirus products, control protection services, and manage Windows Firewall profiles and rules.'
              : 'پس از اتصال به سیستم کاربر، لیست آنتی‌ویروس‌های نصب‌شده، وضعیت فایروال ویندوز و ابزار مدیریت و نوشتن رول‌های فایروال در اینجا نمایش داده می‌شود.'}
          </p>
        </div>
      )}

      {data && (
        <>
          {/* ================================================================= */}
          {/* SECTION 1: INSTALLED ANTIVIRUS ENGINES (ONLY INSTALLED PRODUCTS!) */}
          {/* ================================================================= */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-sky-500" />
                <h3 className={`text-sm font-bold ${textPrimary}`}>
                  {isEn ? 'Installed Antivirus & Endpoint Protection' : 'آنتی‌ویروس‌های نصب‌شده روی سیستم'}
                </h3>
                <span className={`text-xs ${textMuted}`}>
                  ({isEn ? 'Only installed products shown' : 'صرفاً محصولات نصب‌شده نمایش داده می‌شوند'})
                </span>
              </div>
              {data.antivirus?.hasActiveThirdPartyAv && (
                <div className={`text-xs flex items-center gap-1.5 ${isLightMode ? 'text-sky-700' : 'text-sky-300'}`}>
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isEn
                      ? 'Active 3rd-party AV detected — Microsoft Defender automatically switches to Passive/Off mode.'
                      : 'آنتی‌ویروس جانبی فعال تشخیص داده شد — آنتی‌ویروس مایکروسافت به‌صورت خودکار غیرفعال/غیرمتمرکز می‌شود.'}
                  </span>
                </div>
              )}
            </div>

            {avProducts.length === 0 ? (
              <div
                className={`rounded-xl border-2 p-5 flex items-center gap-3 text-xs ${
                  isLightMode
                    ? 'bg-rose-50 border-rose-400 text-rose-900'
                    : 'bg-rose-950/50 border-rose-500/70 text-rose-200'
                }`}
              >
                <ShieldOff className="w-5 h-5 text-rose-500 shrink-0" />
                <span>
                  {isEn
                    ? 'No active antivirus engine was detected on this endpoint!'
                    : 'هیچ آنتی‌ویروسی روی این سیستم شناسایی نشد!'}
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {avProducts.map((av) => {
                  const bKey = `av:${av.id}`;
                  const busyAction = getAvBusyAction(av.id);
                  const isBusy = busyAction !== null;
                  const wasDisabledInSession = disabledInSessionIds.includes(bKey);
                  const isDisabledAlert = !av.enabled && (!av.isPassiveMode || wasDisabledInSession);
                  const isPassive = !av.enabled && av.isPassiveMode && !wasDisabledInSession;

                  // Prominent visual color transition when disabled vs active vs passive!
                  const cardClasses = isDisabledAlert
                    ? isLightMode
                      ? 'bg-rose-50 border-2 border-rose-500 text-rose-950'
                      : 'bg-rose-950/60 border-2 border-rose-500 text-rose-50'
                    : isPassive
                    ? isLightMode
                      ? 'bg-slate-50 border border-slate-300 text-slate-800'
                      : 'bg-slate-900/60 border border-slate-700 text-slate-200'
                    : isLightMode
                    ? 'bg-emerald-50/45 border border-emerald-300 text-slate-900'
                    : 'bg-emerald-950/20 border border-emerald-500/40 text-slate-100';

                  const showStopFormHere = stopPromptAv?.id === av.id;

                  return (
                    <div
                      key={av.id}
                      className={`rounded-xl p-4 sm:p-5 space-y-4 transition-colors ${cardClasses} ${
                        isBusy ? 'ring-2 ring-sky-500/60' : ''
                      }`}
                    >
                      {/* Top Row: Title + Clear State Indicator */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`p-2.5 rounded-xl border shrink-0 ${
                              isDisabledAlert
                                ? isLightMode
                                  ? 'bg-rose-100 border-rose-300 text-rose-600'
                                  : 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                                : isPassive
                                ? isLightMode
                                  ? 'bg-slate-200 border-slate-300 text-slate-600'
                                  : 'bg-slate-800 border-slate-700 text-slate-400'
                                : isLightMode
                                ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                                : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                            }`}
                          >
                            {isDisabledAlert ? (
                              <ShieldOff className="w-5 h-5" />
                            ) : isPassive ? (
                              <Shield className="w-5 h-5" />
                            ) : (
                              <ShieldCheck className="w-5 h-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold truncate">{av.productName}</div>
                            <div className={`text-xs flex flex-wrap items-center gap-2 mt-0.5 ${textMuted}`}>
                              <span>{av.vendor}</span>
                              {av.version && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums">v{av.version}</span>
                                </>
                              )}
                              {av.serviceName && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono">{av.serviceName}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status Text Label (no hue-only, explicit label) */}
                        <div
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 shrink-0 ${
                            isDisabledAlert
                              ? isLightMode
                                ? 'bg-rose-600 border-rose-600 text-white'
                                : 'bg-rose-600 border-rose-500 text-white'
                              : isPassive
                              ? isLightMode
                                ? 'bg-slate-200 border-slate-300 text-slate-700'
                                : 'bg-slate-800 border-slate-700 text-slate-300'
                              : isLightMode
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-emerald-600/90 border-emerald-500 text-white'
                          }`}
                        >
                          {isDisabledAlert ? (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>{isEn ? 'DISABLED — RE-ENABLE!' : 'غیرفعال — دوباره فعال کنید!'}</span>
                            </>
                          ) : isPassive ? (
                            <span>{isEn ? 'Passive (3rd-Party Active)' : 'غیرفعال خودکار (آنتی‌ویروس جایگزین)'}</span>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isEn ? 'Active & Protecting' : 'فعال و محافظت برقرار'}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* High-Visibility Reminder Box inside card when disabled */}
                      {isDisabledAlert && (
                        <div
                          className={`rounded-lg border px-3 py-2 text-xs flex items-center gap-2 font-semibold ${
                            isLightMode
                              ? 'bg-amber-50 border-amber-300 text-amber-900'
                              : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                          }`}
                        >
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                          <span>
                            {wasDisabledInSession
                              ? isEn
                                ? 'You stopped/disabled this Antivirus in this session — remember to start it again once finished!'
                                : 'این آنتی‌ویروس در همین نشست متوقف/غیرفعال شد — پس از اتمام کار حتماً آن را دوباره روشن کنید!'
                              : isEn
                              ? 'Protection is currently turned OFF on this endpoint!'
                              : 'محافظت این آنتی‌ویروس روی سیستم کاربر خاموش است!'}
                          </span>
                        </div>
                      )}

                      {/* Product Specific Details */}
                      <div
                        className={`rounded-lg border p-3 text-xs grid grid-cols-2 sm:grid-cols-3 gap-2.5 ${subSurfaceBg}`}
                      >
                        <div>
                          <div className={`text-[11px] ${textMuted}`}>{isEn ? 'Service State' : 'وضعیت سرویس'}</div>
                          <div className="font-mono font-semibold mt-0.5">
                            {av.serviceRunning
                              ? isEn
                                ? 'Running'
                                : 'در حال اجرا'
                              : isEn
                              ? 'Stopped'
                              : 'متوقف'}
                          </div>
                        </div>
                        <div>
                          <div className={`text-[11px] ${textMuted}`}>{isEn ? 'Definitions' : 'آپدیت امضاها'}</div>
                          <div className="font-mono font-semibold mt-0.5">
                            {av.definitionsUpToDate === true
                              ? isEn
                                ? 'Up-to-date'
                                : 'به‌روز'
                              : av.definitionsUpToDate === false
                              ? isEn
                                ? 'Out-of-date'
                                : 'نیاز به آپدیت'
                              : av.details?.antivirusSignatureAge !== null &&
                                av.details?.antivirusSignatureAge !== undefined
                              ? `${av.details.antivirusSignatureAge}d ago`
                              : '—'}
                          </div>
                        </div>
                        <div>
                          <div className={`text-[11px] ${textMuted}`}>
                            {av.isMicrosoftDefender
                              ? isEn
                                ? 'Tamper Protection'
                                : 'محافظت دستکاری (Tamper)'
                              : isEn
                              ? 'Password-Protected Stop'
                              : 'توقف با رمز حفاظتی'}
                          </div>
                          <div className="font-mono font-semibold mt-0.5">
                            {av.isMicrosoftDefender
                              ? av.tamperProtected
                                ? isEn
                                  ? 'Locked (ON)'
                                  : 'فعال (قفل)'
                                : isEn
                                ? 'Off'
                                : 'خاموش'
                              : av.supportsPasswordStop
                              ? isEn
                                ? 'Supported'
                                : 'پشتیبانی می‌شود'
                              : isEn
                              ? 'Service Control'
                              : 'کنترل سرویس'}
                          </div>
                        </div>
                      </div>

                      {av.isMicrosoftDefender && av.details && (
                        <div className={`text-[11px] flex flex-wrap gap-x-4 gap-y-1 ${textMuted}`}>
                          <span>
                            {isEn ? 'Mode:' : 'حالت:'}{' '}
                            <strong className={textPrimary}>{av.details.amRunningMode || 'Normal'}</strong>
                          </span>
                          <span>
                            {isEn ? 'Signature:' : 'نسخه دیتابیس:'}{' '}
                            <strong className={`font-mono ${textPrimary}`}>
                              {av.details.antivirusSignatureVersion || '—'}
                            </strong>
                          </span>
                          {av.details.quickScanAge !== null && av.details.quickScanAge !== undefined && (
                            <span className="font-mono tabular-nums">
                              {isEn ? `Quick Scan: ${av.details.quickScanAge}d ago` : `آخرین اسکن سریع: ${av.details.quickScanAge} روز پیش`}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Action Buttons */}
                      {canExecuteActions && av.canControl && (
                        <div className="space-y-3 pt-1">
                          {isBusy && (
                            <div
                              className={`rounded-lg border px-3 py-2 text-xs font-semibold flex items-center gap-2 ${
                                isLightMode
                                  ? 'bg-sky-50 border-sky-300 text-sky-900'
                                  : 'bg-sky-950/50 border-sky-500/45 text-sky-200'
                              }`}
                            >
                              <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin shrink-0" />
                              <span>
                                {busyAction === 'stop' || busyAction === 'disable_realtime'
                                  ? isEn
                                    ? 'Stopping / pausing Antivirus protection... Please wait.'
                                    : 'در حال توقف آنتی‌ویروس... لطفاً صبر کنید.'
                                  : busyAction === 'restart'
                                  ? isEn
                                    ? 'Restarting Antivirus service... Please wait.'
                                    : 'در حال ری‌استارت سرویس آنتی‌ویروس... لطفاً صبر کنید.'
                                  : isEn
                                  ? 'Starting / enabling Antivirus protection... Please wait.'
                                  : 'در حال راه‌اندازی و فعال‌سازی آنتی‌ویروس... لطفاً صبر کنید.'}
                              </span>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-2">
                            {!av.enabled ? (
                              <button
                                type="button"
                                disabled={isBusy || Boolean(busyKey)}
                                onClick={() =>
                                  onControlAntivirus({
                                    productId: av.id,
                                    productName: av.productName,
                                    serviceName: av.serviceName,
                                    action: av.isMicrosoftDefender ? 'enable_realtime' : 'start',
                                  })
                                }
                                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                              >
                                {busyAction === 'start' || busyAction === 'enable_realtime' ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Play className="w-3.5 h-3.5" />
                                )}
                                <span>
                                  {busyAction === 'start' || busyAction === 'enable_realtime'
                                    ? isEn
                                      ? 'Starting...'
                                      : 'در حال راه‌اندازی...'
                                    : av.isMicrosoftDefender
                                    ? isEn
                                      ? 'Enable Real-Time Protection'
                                      : 'فعال‌سازی آنتی‌ویروس ویندوز'
                                    : isEn
                                    ? 'Start Antivirus'
                                    : 'راه‌اندازی آنتی‌ویروس (Start)'}
                                </span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy || Boolean(busyKey)}
                                onClick={() => {
                                  setAvStopPassword('');
                                  setShowAvStopPassword(false);
                                  setStopPromptAv({
                                    id: av.id,
                                    productName: av.productName,
                                    serviceName: av.serviceName,
                                    isMicrosoftDefender: Boolean(av.isMicrosoftDefender),
                                    supportsPasswordStop: Boolean(av.supportsPasswordStop),
                                  });
                                }}
                                className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                              >
                                {busyAction === 'stop' || busyAction === 'disable_realtime' ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Square className="w-3.5 h-3.5" />
                                )}
                                <span>
                                  {busyAction === 'stop' || busyAction === 'disable_realtime'
                                    ? isEn
                                      ? 'Stopping...'
                                      : 'در حال توقف...'
                                    : av.isMicrosoftDefender
                                    ? isEn
                                      ? 'Pause / Disable Real-Time'
                                      : 'توقف موقت حفاظت لحظه‌ای'
                                    : isEn
                                    ? 'Stop Antivirus'
                                    : 'توقف آنتی‌ویروس (Stop)'}
                                </span>
                              </button>
                            )}

                            {!av.isMicrosoftDefender && av.serviceName && (
                              <button
                                type="button"
                                disabled={isBusy || Boolean(busyKey)}
                                onClick={() =>
                                  onControlAntivirus({
                                    productId: av.id,
                                    productName: av.productName,
                                    serviceName: av.serviceName,
                                    action: 'restart',
                                  })
                                }
                                className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                                  isLightMode
                                    ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                                    : 'bg-slate-950 border-slate-700 text-slate-200 hover:bg-slate-800'
                                }`}
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'restart' ? 'animate-spin' : ''}`} />
                                <span>
                                  {busyAction === 'restart'
                                    ? isEn
                                      ? 'Restarting...'
                                      : 'در حال ری‌استارت...'
                                    : isEn
                                    ? 'Restart Service'
                                    : 'ری‌استارت'}
                                </span>
                              </button>
                            )}
                          </div>

                          {/* Inline Optional Password Stop Form */}
                          {showStopFormHere && (
                            <form
                              onSubmit={handleConfirmStopAv}
                              className={`rounded-lg border p-3 space-y-2.5 ${
                                isLightMode
                                  ? 'bg-amber-50 border-amber-300 text-slate-900'
                                  : 'bg-slate-950 border-amber-500/40 text-slate-100'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-300">
                                  <KeyRound className="w-3.5 h-3.5 shrink-0" />
                                  <span>
                                    {stopPromptAv.isMicrosoftDefender
                                      ? isEn
                                        ? 'Confirm Pausing Microsoft Defender Real-Time Protection'
                                        : 'تایید توقف موقت آنتی‌ویروس مایکروسافت'
                                      : isEn
                                      ? 'Confirm Stopping Antivirus (Optional Unlock Password)'
                                      : 'تایید توقف آنتی‌ویروس (رمز توقف در صورت نیاز)'}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setStopPromptAv(null)}
                                  className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {!stopPromptAv.isMicrosoftDefender && (
                                <div className="space-y-1">
                                  <label className={`block text-[11px] ${textMuted}`}>
                                    {isEn
                                      ? 'Antivirus / Tamper Protection Password (leave blank if no password is configured on endpoint):'
                                      : 'رمز توقف / رمز محافظت آنتی‌ویروس (اگر روی آنتی‌ویروس رمز گذاشته نشده، خالی بگذارید):'}
                                  </label>
                                  <div className="relative">
                                    <input
                                      type={showAvStopPassword ? 'text' : 'password'}
                                      value={avStopPassword}
                                      onChange={(e) => setAvStopPassword(e.target.value)}
                                      dir="ltr"
                                      autoComplete="off"
                                      placeholder={isEn ? 'Optional AV unload/stop password...' : 'رمز حفاظتی آنتی‌ویروس (اختیاری)...'}
                                      className={`w-full px-3 py-1.5 pr-8 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setShowAvStopPassword((v) => !v)}
                                      className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 cursor-pointer"
                                    >
                                      {showAvStopPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setStopPromptAv(null)}
                                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                                    isLightMode
                                      ? 'bg-white border-slate-300 text-slate-700'
                                      : 'bg-slate-900 border-slate-700 text-slate-300'
                                  }`}
                                >
                                  {isEn ? 'Cancel' : 'انصراف'}
                                </button>
                                <button
                                  type="submit"
                                  disabled={isBusy}
                                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                >
                                  {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                                  <span>{isEn ? 'Confirm Stop / Disable' : 'تایید و توقف آنتی‌ویروس'}</span>
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* SECTION 2: WINDOWS FIREWALL PROFILES & 3RD-PARTY FIREWALL         */}
          {/* ================================================================= */}
          <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-500" />
                <h3 className={`text-sm font-bold ${textPrimary}`}>
                  {data.osFamily === 'linux'
                    ? isEn
                      ? 'Linux Host Firewall Profiles'
                      : 'پروفایل فایروال سیستم لینوکس'
                    : isEn
                    ? 'Windows Firewall Profiles (Domain, Private, Public)'
                    : 'پروفایل‌های فایروال ویندوز (Domain / Private / Public)'}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {thirdPartyFirewalls.map((fw, idx) => (
                  <span
                    key={`${fw.name}-${idx}`}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                      fw.enabled
                        ? isLightMode
                          ? 'bg-sky-50 border-sky-200 text-sky-800'
                          : 'bg-sky-500/15 border-sky-500/35 text-sky-200'
                        : isLightMode
                        ? 'bg-slate-100 border-slate-200 text-slate-600'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    {fw.name} ({fw.enabled ? (isEn ? 'Active Firewall' : 'فایروال فعال') : isEn ? 'Off' : 'خاموش'})
                  </span>
                ))}

                {canExecuteActions && fwProfiles.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    {fwProfiles.some((p) => !p.enabled) && (
                      <button
                        type="button"
                        disabled={isFwAllBusy || Boolean(busyKey)}
                        onClick={() => onToggleFirewallProfile({ profile: 'All', enabled: true })}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        {isFwAllBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isFwAllBusy
                            ? isEn
                              ? 'Enabling All...'
                              : 'در حال فعال‌سازی...'
                            : isEn
                            ? 'Enable All Profiles'
                            : 'فعال‌سازی همه پروفایل‌ها'}
                        </span>
                      </button>
                    )}
                    {fwProfiles.some((p) => p.enabled) && (
                      <button
                        type="button"
                        disabled={isFwAllBusy || Boolean(busyKey)}
                        onClick={() => onToggleFirewallProfile({ profile: 'All', enabled: false })}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                          isLightMode
                            ? 'bg-white border-rose-300 text-rose-700 hover:bg-rose-50'
                            : 'bg-slate-950 border-rose-500/40 text-rose-300 hover:bg-rose-500/10'
                        }`}
                      >
                        {isFwAllBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ShieldOff className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isFwAllBusy
                            ? isEn
                              ? 'Disabling All...'
                              : 'در حال خاموش کردن...'
                            : isEn
                            ? 'Disable All'
                            : 'خاموش کردن همه'}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {data.firewall?.supersededByThirdPartyFirewall && (
              <div
                className={`rounded-lg border px-3.5 py-2.5 text-xs flex items-center gap-2 ${
                  isLightMode
                    ? 'bg-sky-50 border-sky-200 text-sky-900'
                    : 'bg-sky-500/10 border-sky-500/30 text-sky-200'
                }`}
              >
                <Info className="w-4 h-4 text-sky-500 shrink-0" />
                <span>
                  {isEn
                    ? 'Windows Firewall is currently turned off because an active 3rd-party security suite firewall is managing network filtering.'
                    : 'فایروال پیش‌فرض ویندوز به دلیل فعال بودن فایروال نرم‌افزار امنیتی نصب‌شده (مانند ESET / Symantec / McAfee) به‌طور خودکار غیرفعال شده است.'}
                </span>
              </div>
            )}

            {fwProfiles.length === 0 ? (
              <div className={`text-xs py-4 text-center ${textMuted}`}>
                {isEn ? 'No firewall profile information returned.' : 'اطلاعات پروفایل فایروال دریافت نشد.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {fwProfiles.map((prof) => {
                  const fKey = `fw:${prof.name}`;
                  const isBusy = isFwProfileBusy(prof.name);
                  const sessionOff = disabledInSessionIds.includes(fKey);
                  const isDangerOff = !prof.enabled && (!prof.supersededByThirdParty || sessionOff);

                  return (
                    <div
                      key={prof.name}
                      className={`rounded-xl border p-4 space-y-3 transition-colors ${
                        isBusy ? 'ring-2 ring-sky-500/60 ' : ''
                      }${
                        prof.enabled
                          ? isLightMode
                            ? 'bg-emerald-50/40 border-emerald-300'
                            : 'bg-emerald-950/20 border-emerald-500/35'
                          : isDangerOff
                          ? isLightMode
                            ? 'bg-rose-50 border-2 border-rose-500'
                            : 'bg-rose-950/60 border-2 border-rose-500'
                          : subSurfaceBg
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {isBusy ? (
                            <Loader2 className="w-4 h-4 text-sky-500 animate-spin shrink-0" />
                          ) : prof.enabled ? (
                            <Lock className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <Unlock className={`w-4 h-4 shrink-0 ${isDangerOff ? 'text-rose-500' : 'text-slate-400'}`} />
                          )}
                          <span className={`text-sm font-bold ${textPrimary}`}>{prof.name}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            prof.enabled
                              ? 'bg-emerald-600 text-white'
                              : isDangerOff
                              ? 'bg-rose-600 text-white'
                              : isLightMode
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {prof.enabled
                            ? isEn
                              ? 'ON'
                              : 'روشن'
                            : prof.supersededByThirdParty && !sessionOff
                            ? isEn
                              ? '3rd-Party Managed'
                              : 'مدیریت جانبی'
                            : isEn
                            ? 'OFF — Re-Enable!'
                            : 'خاموش — فعال کنید!'}
                        </span>
                      </div>

                      <div className={`text-xs space-y-1 ${textMuted}`}>
                        <div className="flex justify-between">
                          <span>{isEn ? 'Inbound Default:' : 'ورودی پیش‌فرض:'}</span>
                          <span className={`font-mono font-semibold ${textPrimary}`}>
                            {prof.defaultInboundAction}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>{isEn ? 'Outbound Default:' : 'خروجی پیش‌فرض:'}</span>
                          <span className={`font-mono font-semibold ${textPrimary}`}>
                            {prof.defaultOutboundAction}
                          </span>
                        </div>
                      </div>

                      {canExecuteActions && (
                        <button
                          type="button"
                          disabled={isBusy || Boolean(busyKey)}
                          onClick={() =>
                            onToggleFirewallProfile({
                              profile: prof.name as any,
                              enabled: !prof.enabled,
                            })
                          }
                          className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-60 ${
                            prof.enabled
                              ? isLightMode
                                ? 'bg-white border border-rose-300 text-rose-700 hover:bg-rose-50'
                                : 'bg-slate-950 border border-rose-500/40 text-rose-300 hover:bg-rose-500/15'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          }`}
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : prof.enabled ? (
                            <ShieldOff className="w-3.5 h-3.5" />
                          ) : (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {isBusy
                              ? prof.enabled
                                ? isEn
                                  ? `Turning Off ${prof.name}...`
                                  : `در حال غیرفعال‌سازی ${prof.name}...`
                                : isEn
                                ? `Turning On ${prof.name}...`
                                : `در حال فعال‌سازی ${prof.name}...`
                              : prof.enabled
                              ? isEn
                                ? `Turn Off ${prof.name}`
                                : `غیرفعال کردن ${prof.name}`
                              : isEn
                              ? `Turn On ${prof.name}`
                              : `فعال‌سازی ${prof.name}`}
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* SECTION 3: FIREWALL RULES TABLE & CREATE RULE BUILDER             */}
          {/* ================================================================= */}
          <div className={`rounded-xl border overflow-hidden ${surfaceBg}`}>
            <div className="p-4 sm:p-5 border-b border-slate-500/20 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn ? 'Firewall Rules (Inbound & Outbound)' : 'مدیریت قوانین فایروال (ورودی و خروجی)'}
                  </h3>
                  <p className={`text-xs mt-0.5 ${textMuted}`}>
                    {isEn
                      ? `Showing ${filteredRules.length} of ${fwRules.length} loaded rules (${data.firewall?.totalRules ?? fwRules.length} total on endpoint).`
                      : `نمایش ${filteredRules.length} از ${fwRules.length} رول بارگذاری‌شده (کل رول‌های سیستم: ${data.firewall?.totalRules ?? fwRules.length}).`}
                  </p>
                </div>

                {canExecuteActions && (
                  <button
                    type="button"
                    onClick={() => setShowCreateRule((v) => !v)}
                    className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                  >
                    {showCreateRule ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>{isEn ? 'New Firewall Rule' : 'نوشتن رول جدید فایروال'}</span>
                  </button>
                )}
              </div>

              {/* Create Firewall Rule Form */}
              {showCreateRule && canExecuteActions && (
                <form
                  onSubmit={handleSubmitNewRule}
                  className={`rounded-xl border p-4 space-y-3.5 ${subSurfaceBg}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <Plus className="w-4 h-4 text-sky-500" />
                      <span>{isEn ? 'Create New Firewall Rule' : 'تعریف رول جدید فایروال روی سیستم'}</span>
                      <FieldInfoTooltip
                        isEn={isEn}
                        isLightMode={isLightMode}
                        fieldName={isEn ? 'Create Windows Firewall Rule' : 'ساخت رول جدید فایروال'}
                        whatIsIt={
                          isEn
                            ? 'Creates a live Windows Defender Firewall rule (Inbound or Outbound) allowing or blocking specific ports, IPs, or applications.'
                            : 'یک قانون جدید (Allow یا Block) روی فایروال سیستم برای باز کردن یا بستن پورت، آدرس IP یا یک برنامه خاص ایجاد می‌کند.'
                        }
                        whyIsItNeeded={
                          isEn
                            ? 'Opens required service ports (e.g., ERP, POS, printer sharing, RDP) or immediately blocks suspicious remote IPs without full RDP access.'
                            : 'باز کردن پورت نرم‌افزارهای سازمانی یا مسدودسازی سریع دسترسی‌های غیرمجاز بدون نیاز به ریموت زدن به دسکتاپ کاربر.'
                        }
                        practicalExample={
                          isEn
                            ? 'Name: Allow App Port 8443 · Inbound · Allow · TCP · LocalPort: 8443'
                            : 'نام: Allow App 8443 · ورودی (Inbound) · مجاز (Allow) · TCP · پورت: 8443'
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                        {isEn ? 'Rule Display Name *' : 'نام رول فایروال *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={newRuleName}
                        onChange={(e) => setNewRuleName(e.target.value)}
                        placeholder={isEn ? 'e.g. Allow ERP Client Port 8443' : 'مثال: Allow ERP Client Port 8443'}
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                      />
                    </div>

                    <div>
                      <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                        {isEn ? 'Direction' : 'جهت ترافیک'}
                      </label>
                      <select
                        value={newRuleDir}
                        onChange={(e) => setNewRuleDir(e.target.value as any)}
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                      >
                        <option value="Inbound">{isEn ? 'Inbound (Incoming)' : 'ورودی (Inbound)'}</option>
                        <option value="Outbound">{isEn ? 'Outbound (Outgoing)' : 'خروجی (Outbound)'}</option>
                      </select>
                    </div>

                    <div>
                      <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                        {isEn ? 'Action' : 'نوع عملیات (باز/بسته)'}
                      </label>
                      <select
                        value={newRuleAction}
                        onChange={(e) => setNewRuleAction(e.target.value as any)}
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                      >
                        <option value="Allow">{isEn ? 'Allow (Open)' : 'باز کردن / مجاز (Allow)'}</option>
                        <option value="Block">{isEn ? 'Block (Close)' : 'بستن / مسدود (Block)'}</option>
                      </select>
                    </div>

                    <div>
                      <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                        {isEn ? 'Protocol' : 'پروتکل'}
                      </label>
                      <select
                        value={newRuleProto}
                        onChange={(e) => setNewRuleProto(e.target.value as any)}
                        dir="ltr"
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                      >
                        <option value="TCP">TCP</option>
                        <option value="UDP">UDP</option>
                        <option value="Any">Any</option>
                        <option value="ICMPv4">ICMPv4 (Ping)</option>
                        <option value="ICMPv6">ICMPv6</option>
                      </select>
                    </div>

                    <div>
                      <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                        {isEn ? 'Local Port(s)' : 'پورت مبدا/محلی (Local Port)'}
                      </label>
                      <input
                        type="text"
                        value={newRuleLocalPort}
                        onChange={(e) => setNewRuleLocalPort(e.target.value)}
                        dir="ltr"
                        disabled={newRuleProto !== 'TCP' && newRuleProto !== 'UDP'}
                        placeholder="e.g. 80, 443 or 8000-8010"
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none disabled:opacity-50 ${inputCls}`}
                      />
                    </div>

                    <div>
                      <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                        {isEn ? 'Remote Port(s)' : 'پورت مقصد (Remote Port)'}
                      </label>
                      <input
                        type="text"
                        value={newRuleRemotePort}
                        onChange={(e) => setNewRuleRemotePort(e.target.value)}
                        dir="ltr"
                        disabled={newRuleProto !== 'TCP' && newRuleProto !== 'UDP'}
                        placeholder="Any or e.g. 443"
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none disabled:opacity-50 ${inputCls}`}
                      />
                    </div>

                    <div>
                      <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                        {isEn ? 'Remote IP / CIDR (Optional)' : 'آدرس IP / ساب‌نت مقابل (اختیاری)'}
                      </label>
                      <input
                        type="text"
                        value={newRuleRemoteAddr}
                        onChange={(e) => setNewRuleRemoteAddr(e.target.value)}
                        dir="ltr"
                        placeholder="Any or 192.168.10.0/24"
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                        {isEn ? 'Program Path (Optional)' : 'مسیر فایل اجرایی برنامه (اختیاری)'}
                      </label>
                      <input
                        type="text"
                        value={newRuleProgram}
                        onChange={(e) => setNewRuleProgram(e.target.value)}
                        dir="ltr"
                        placeholder="e.g. C:\Program Files\MyApp\app.exe"
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                      />
                    </div>

                    <div>
                      <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                        {isEn ? 'Profiles' : 'پروفایل‌ها'}
                      </label>
                      <div className="flex items-center gap-2 pt-1">
                        {(['Domain', 'Private', 'Public'] as const).map((p) => {
                          const checked = newRuleProfiles.includes(p);
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => toggleProfileCheckbox(p)}
                              className={`px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer ${
                                checked
                                  ? 'bg-sky-600 border-sky-600 text-white'
                                  : isLightMode
                                  ? 'bg-white border-slate-300 text-slate-700'
                                  : 'bg-slate-900 border-slate-700 text-slate-300'
                              }`}
                            >
                              {p}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                        {isEn ? 'Description (Optional)' : 'توضیحات (اختیاری)'}
                      </label>
                      <input
                        type="text"
                        value={newRuleDesc}
                        onChange={(e) => setNewRuleDesc(e.target.value)}
                        placeholder={isEn ? 'Ticket / reason note' : 'شماره تیکت یا علت ایجاد'}
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateRule(false)}
                      className={`px-3.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-700'
                          : 'bg-slate-900 border-slate-700 text-slate-300'
                      }`}
                    >
                      {isEn ? 'Cancel' : 'انصراف'}
                    </button>
                    <button
                      type="submit"
                      disabled={isFwCreateBusy || Boolean(busyKey) || !newRuleName.trim()}
                      className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      {isFwCreateBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isFwCreateBusy
                          ? isEn
                            ? 'Creating Rule...'
                            : 'در حال ثبت رول...'
                          : isEn
                          ? 'Create Firewall Rule'
                          : 'ثبت رول فایروال'}
                      </span>
                    </button>
                  </div>
                </form>
              )}

              {/* Search & Filter Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Direction */}
                  <div className={`flex items-center gap-1 p-1 rounded-lg border ${subSurfaceBg}`}>
                    {(
                      [
                        { id: 'all', en: 'All Dir', fa: 'همه جهت‌ها' },
                        { id: 'Inbound', en: 'Inbound', fa: 'ورودی' },
                        { id: 'Outbound', en: 'Outbound', fa: 'خروجی' },
                      ] as const
                    ).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setRuleDirFilter(d.id);
                          setRulePage(1);
                        }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition ${
                          ruleDirFilter === d.id
                            ? 'bg-sky-600 text-white'
                            : isLightMode
                            ? 'text-slate-600 hover:text-slate-900'
                            : 'text-slate-400 hover:text-slate-100'
                        }`}
                      >
                        {isEn ? d.en : d.fa}
                      </button>
                    ))}
                  </div>

                  {/* Action */}
                  <div className={`flex items-center gap-1 p-1 rounded-lg border ${subSurfaceBg}`}>
                    {(
                      [
                        { id: 'all', en: 'All Actions', fa: 'همه' },
                        { id: 'Allow', en: 'Allow', fa: 'مجاز (Allow)' },
                        { id: 'Block', en: 'Block', fa: 'مسدود (Block)' },
                      ] as const
                    ).map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setRuleActionFilter(a.id);
                          setRulePage(1);
                        }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition ${
                          ruleActionFilter === a.id
                            ? 'bg-sky-600 text-white'
                            : isLightMode
                            ? 'text-slate-600 hover:text-slate-900'
                            : 'text-slate-400 hover:text-slate-100'
                        }`}
                      >
                        {isEn ? a.en : a.fa}
                      </button>
                    ))}
                  </div>

                  {/* State */}
                  <div className={`flex items-center gap-1 p-1 rounded-lg border ${subSurfaceBg}`}>
                    {(
                      [
                        { id: 'all', en: 'All States', fa: 'همه وضعیت‌ها' },
                        { id: 'enabled', en: 'Enabled', fa: 'فعال' },
                        { id: 'disabled', en: 'Disabled', fa: 'غیرفعال' },
                      ] as const
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setRuleStateFilter(s.id);
                          setRulePage(1);
                        }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition ${
                          ruleStateFilter === s.id
                            ? 'bg-sky-600 text-white'
                            : isLightMode
                            ? 'text-slate-600 hover:text-slate-900'
                            : 'text-slate-400 hover:text-slate-100'
                        }`}
                      >
                        {isEn ? s.en : s.fa}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
                  <input
                    type="text"
                    value={ruleSearch}
                    onChange={(e) => {
                      setRuleSearch(e.target.value);
                      setRulePage(1);
                    }}
                    placeholder={isEn ? 'Search rule name, port, IP...' : 'جستجوی نام رول، پورت، IP...'}
                    className={`w-full pl-9 pr-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                  />
                </div>
              </div>
            </div>

            {/* Rules Table */}
            {filteredRules.length === 0 ? (
              <div className={`p-8 text-center text-xs ${textMuted}`}>
                {isEn
                  ? 'No firewall rules match the current filter.'
                  : 'رول فایروالی با فیلتر انتخاب‌شده یافت نشد.'}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead
                      className={
                        isLightMode
                          ? 'bg-slate-100 text-slate-700 border-b border-slate-200'
                          : 'bg-slate-950/90 text-slate-400 border-b border-slate-800'
                      }
                    >
                      <tr>
                        <th className={`px-3.5 py-2.5 font-semibold ${isEn ? 'text-left' : 'text-right'}`}>
                          {isEn ? 'Rule Name' : 'نام رول'}
                        </th>
                        <th className={`px-3.5 py-2.5 font-semibold ${isEn ? 'text-left' : 'text-right'}`}>
                          {isEn ? 'Direction' : 'جهت'}
                        </th>
                        <th className={`px-3.5 py-2.5 font-semibold ${isEn ? 'text-left' : 'text-right'}`}>
                          {isEn ? 'Action' : 'عملیات'}
                        </th>
                        <th className={`px-3.5 py-2.5 font-semibold ${isEn ? 'text-left' : 'text-right'}`}>
                          {isEn ? 'Protocol / Port' : 'پروتکل / پورت'}
                        </th>
                        <th className={`px-3.5 py-2.5 font-semibold ${isEn ? 'text-left' : 'text-right'}`}>
                          {isEn ? 'Remote Address' : 'آدرس مقابل'}
                        </th>
                        <th className={`px-3.5 py-2.5 font-semibold ${isEn ? 'text-left' : 'text-right'}`}>
                          {isEn ? 'Status' : 'وضعیت'}
                        </th>
                        {canExecuteActions && (
                          <th className="px-3.5 py-2.5 font-semibold text-center">
                            {isEn ? 'Controls' : 'کنترل رول'}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-500/15">
                      {paginatedRules.map((rule) => {
                        const busyRuleAction = getFwRuleBusyAction(rule.name);
                        const isBusy = busyRuleAction !== null;
                        return (
                          <tr
                            key={rule.name}
                            className={`transition ${
                              isLightMode ? 'hover:bg-slate-100/70' : 'hover:bg-slate-800/40'
                            } ${!rule.enabled ? 'opacity-65' : ''}`}
                          >
                            <td className="px-3.5 py-2.5 max-w-[280px]">
                              <div className={`font-semibold break-words ${textPrimary}`}>{rule.displayName}</div>
                              {(rule.group || (rule.program && rule.program !== 'Any')) && (
                                <div className={`text-[11px] truncate ${textMuted}`} dir="ltr">
                                  {rule.program && rule.program !== 'Any' ? rule.program : rule.group}
                                </div>
                              )}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 font-medium">
                                {rule.direction === 'Inbound' ? (
                                  <ArrowDownLeft className="w-3.5 h-3.5 text-sky-500" />
                                ) : (
                                  <ArrowUpRight className="w-3.5 h-3.5 text-indigo-500" />
                                )}
                                <span>
                                  {rule.direction === 'Inbound'
                                    ? isEn
                                      ? 'Inbound'
                                      : 'ورودی'
                                    : isEn
                                    ? 'Outbound'
                                    : 'خروجی'}
                                </span>
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <span
                                className={`font-bold ${
                                  rule.action === 'Allow'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {rule.action === 'Allow'
                                  ? isEn
                                    ? 'Allow'
                                    : 'مجاز (Allow)'
                                  : isEn
                                  ? 'Block'
                                  : 'مسدود (Block)'}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 font-mono tabular-nums whitespace-nowrap" dir="ltr">
                              {rule.protocol}
                              {rule.localPort && rule.localPort !== 'Any' ? ` : ${rule.localPort}` : ''}
                            </td>
                            <td className={`px-3.5 py-2.5 font-mono text-[11px] max-w-[180px] truncate ${textMuted}`} dir="ltr">
                              {rule.remoteAddress || 'Any'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <span
                                className={`font-semibold ${
                                  rule.enabled
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : isLightMode
                                    ? 'text-slate-500'
                                    : 'text-slate-400'
                                }`}
                              >
                                {rule.enabled ? (isEn ? 'Enabled' : 'فعال') : isEn ? 'Disabled' : 'غیرفعال'}
                              </span>
                            </td>
                            {canExecuteActions && (
                              <td className="px-3.5 py-2.5 whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isBusy || Boolean(busyKey)}
                                    onClick={() =>
                                      onManageFirewallRule({
                                        ruleName: rule.name,
                                        displayName: rule.displayName,
                                        action: rule.enabled ? 'disable' : 'enable',
                                      })
                                    }
                                    className={`px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer disabled:opacity-50 ${
                                      rule.enabled
                                        ? isLightMode
                                          ? 'bg-white border-amber-300 text-amber-800 hover:bg-amber-50'
                                          : 'bg-slate-950 border-amber-500/40 text-amber-300 hover:bg-amber-500/10'
                                        : isLightMode
                                        ? 'bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                                        : 'bg-slate-950 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10'
                                    }`}
                                    title={rule.enabled ? (isEn ? 'Disable rule' : 'بستن / غیرفعال کردن رول') : isEn ? 'Enable rule' : 'باز کردن / فعال‌سازی رول'}
                                  >
                                    {busyRuleAction === 'enable' || busyRuleAction === 'disable' ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : rule.enabled ? (
                                      isEn ? 'Disable' : 'غیرفعال'
                                    ) : isEn ? (
                                      'Enable'
                                    ) : (
                                      'فعال'
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isBusy || Boolean(busyKey)}
                                    onClick={() =>
                                      onManageFirewallRule({
                                        ruleName: rule.name,
                                        displayName: rule.displayName,
                                        action: rule.action === 'Allow' ? 'block' : 'allow',
                                      })
                                    }
                                    className={`px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer disabled:opacity-50 ${
                                      rule.action === 'Allow'
                                        ? isLightMode
                                          ? 'bg-white border-rose-300 text-rose-700 hover:bg-rose-50'
                                          : 'bg-slate-950 border-rose-500/40 text-rose-300 hover:bg-rose-500/10'
                                        : isLightMode
                                        ? 'bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                                        : 'bg-slate-950 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10'
                                    }`}
                                    title={rule.action === 'Allow' ? (isEn ? 'Switch to Block' : 'تبدیل به مسدود (Block)') : isEn ? 'Switch to Allow' : 'تبدیل به مجاز (Allow)'}
                                  >
                                    {busyRuleAction === 'allow' || busyRuleAction === 'block' ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : rule.action === 'Allow' ? (
                                      isEn ? 'Block' : 'بستن'
                                    ) : isEn ? (
                                      'Allow'
                                    ) : (
                                      'باز کردن'
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isBusy || Boolean(busyKey)}
                                    onClick={() =>
                                      setDeleteRuleTarget({
                                        ruleName: rule.name,
                                        displayName: rule.displayName,
                                        modalTarget: {
                                          type: 'generic',
                                          id: rule.name,
                                          name: rule.displayName,
                                          category: isEn ? 'Windows Firewall Rule' : 'رول فایروال ویندوز',
                                          description: `${rule.direction} / ${rule.action} / ${rule.protocol}:${rule.localPort}`,
                                        },
                                      })
                                    }
                                    className={`p-1 rounded border text-rose-500 cursor-pointer disabled:opacity-50 ${
                                      isLightMode
                                        ? 'bg-white border-slate-200 hover:bg-rose-50'
                                        : 'bg-slate-950 border-slate-700 hover:bg-rose-500/10'
                                    }`}
                                    title={isEn ? 'Delete Firewall Rule' : 'حذف رول'}
                                  >
                                    {busyRuleAction === 'delete' ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalRulePages > 1 && (
                  <div className="px-4 py-3 border-t border-slate-500/20 flex items-center justify-between text-xs">
                    <span className={`font-mono tabular-nums ${textMuted}`}>
                      {isEn
                        ? `Page ${clampedPage} of ${totalRulePages}`
                        : `صفحه ${clampedPage} از ${totalRulePages}`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={clampedPage <= 1}
                        onClick={() => setRulePage((p) => Math.max(1, p - 1))}
                        className={`p-1.5 rounded-lg border disabled:opacity-40 cursor-pointer ${
                          isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'
                        }`}
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={clampedPage >= totalRulePages}
                        onClick={() => setRulePage((p) => Math.min(totalRulePages, p + 1))}
                        className={`p-1.5 rounded-lg border disabled:opacity-40 cursor-pointer ${
                          isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'
                        }`}
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Standard Firewall Rule Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(deleteRuleTarget)}
        onClose={() => setDeleteRuleTarget(null)}
        target={deleteRuleTarget?.modalTarget || null}
        onConfirm={() => {
          if (deleteRuleTarget) {
            onManageFirewallRule({
              ruleName: deleteRuleTarget.ruleName,
              displayName: deleteRuleTarget.displayName,
              action: 'delete',
            });
          }
        }}
        isLightMode={isLightMode}
      />
    </div>
  );
};
