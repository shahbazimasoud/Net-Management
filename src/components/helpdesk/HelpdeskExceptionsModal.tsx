import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldBan,
  Plus,
  Search,
  Globe,
  User,
  UserCheck,
  Users,
  MoreVertical,
  Edit3,
  Power,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Building2,
  Server,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  Check,
  X,
} from 'lucide-react';
import { HelpdeskExceptionRule, HelpdeskExceptionRuleType } from '../../types';
import {
  HelpdeskConnectionPayload,
  HelpdeskEndpointIdentitySnapshot,
  HelpdeskExceptionAdCatalog,
  createHelpdeskException,
  deleteHelpdeskException,
  fetchHelpdeskExceptions,
  inspectHelpdeskEndpointForExceptions,
  updateHelpdeskException,
} from '../../services/api';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { DeleteConfirmModal, DeleteGenericTarget } from '../DeleteConfirmModal';

export interface HelpdeskExceptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  isLightMode: boolean;
  isEn: boolean;
  canManage: boolean;
  activeTargetIp?: string;
  activeProtocol?: 'auto' | 'winrm_https' | 'winrm_http' | 'smb_rpc' | 'ssh';
  activeCustomPort?: string;
  activeUsername?: string;
  activePassword?: string;
  activeJeaConfigName?: string;
  activeLoggedInUser?: string;
  onRulesChanged?: (rules: HelpdeskExceptionRule[]) => void;
}

const RULE_TYPE_META: Record<
  HelpdeskExceptionRuleType,
  {
    labelEn: string;
    labelFa: string;
    placeholderEn: string;
    placeholderFa: string;
    badgeCls: string;
    badgeLightCls: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  ip: {
    labelEn: 'IP / CIDR / Range / Hostname',
    labelFa: 'آدرس IP / ساب‌نت CIDR / رنج / نام سیستم',
    placeholderEn: 'e.g. 192.168.10.50 or 10.20.0.0/24 or 192.168.1.10-192.168.1.25',
    placeholderFa: 'مثال: 192.168.10.50 یا 10.20.0.0/24 یا 192.168.1.10-192.168.1.25',
    badgeCls: 'bg-sky-500/15 text-sky-300 border-sky-500/35',
    badgeLightCls: 'bg-sky-50 text-sky-700 border-sky-200',
    icon: Globe,
  },
  local_user: {
    labelEn: 'Local User Account',
    labelFa: 'کاربر لوکال سیستم (Local User)',
    placeholderEn: 'e.g. ceo_local or WorkstationAdmin',
    placeholderFa: 'مثال: ceo_local یا نام کاربر محلی سیستم',
    badgeCls: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
    badgeLightCls: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: User,
  },
  ad_user: {
    labelEn: 'Active Directory User',
    labelFa: 'کاربر اکتیو دایرکتوری (AD User)',
    placeholderEn: 'e.g. a.ahmadi or CORP\\a.ahmadi',
    placeholderFa: 'مثال: a.ahmadi یا CORP\\a.ahmadi',
    badgeCls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/35',
    badgeLightCls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: UserCheck,
  },
  ad_group: {
    labelEn: 'Active Directory Group',
    labelFa: 'گروه اکتیو دایرکتوری (AD Group)',
    placeholderEn: 'e.g. Executive_Board or Domain Admins',
    placeholderFa: 'مثال: Executive_Board یا Domain Admins',
    badgeCls: 'bg-rose-500/15 text-rose-300 border-rose-500/35',
    badgeLightCls: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: Users,
  },
};

export const HelpdeskExceptionsModal: React.FC<HelpdeskExceptionsModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  isLightMode,
  isEn,
  canManage,
  activeTargetIp = '',
  activeProtocol = 'auto',
  activeCustomPort = '',
  activeUsername = '',
  activePassword = '',
  activeJeaConfigName = '',
  activeLoggedInUser = '',
  onRulesChanged,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  // Rules & Server AD Catalog state
  const [rules, setRules] = useState<HelpdeskExceptionRule[]>([]);
  const [serverCanManage, setServerCanManage] = useState<boolean>(canManage);
  const [adCatalog, setAdCatalog] = useState<HelpdeskExceptionAdCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | HelpdeskExceptionRuleType>('all');

  // Create / Edit form
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleType, setRuleType] = useState<HelpdeskExceptionRuleType>('ip');
  const [targetValue, setTargetValue] = useState('');
  const [domainName, setDomainName] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [savingRule, setSavingRule] = useState(false);

  // AD Directory & Live Endpoint Discovery Panel
  const [discoveryTab, setDiscoveryTab] = useState<'live_endpoint' | 'ad_catalog'>('live_endpoint');
  const [adSearch, setAdSearch] = useState('');

  // Live endpoint inspector (volatile RAM only)
  const [probeIp, setProbeIp] = useState(activeTargetIp);
  const [probeProtocol, setProbeProtocol] = useState<'auto' | 'winrm_https' | 'winrm_http' | 'smb_rpc' | 'ssh'>(
    activeProtocol
  );
  const [probePort, setProbePort] = useState(activeCustomPort);
  const [probeUser, setProbeUser] = useState(activeUsername);
  const [probePass, setProbePass] = useState(activePassword);
  const [showProbePass, setShowProbePass] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [probeSnapshot, setProbeSnapshot] = useState<HelpdeskEndpointIdentitySnapshot | null>(null);
  const [quickAddingKey, setQuickAddingKey] = useState<string | null>(null);

  // 3-Dots Portal Row Action Menu state
  const [menuAnchor, setMenuAnchor] = useState<{
    rule: HelpdeskExceptionRule;
    top: number;
    left: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteGenericTarget | null>(null);

  const effectiveCanManage = canManage && serverCanManage;

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchHelpdeskExceptions();
      const loaded = Array.isArray(res.rules) ? res.rules : [];
      setRules(loaded);
      setServerCanManage(Boolean(res.canManage));
      setAdCatalog(res.adCatalog || null);
      onRulesChanged?.(loaded);
    } catch (err: any) {
      setError(
        (isEn ? err?.message : err?.errorFa || err?.message) ||
          (isEn ? 'Failed to load HelpDesk exception rules.' : 'خطا در دریافت لیست استثنائات هلپ‌دسک.')
      );
    } finally {
      setLoading(false);
    }
  }, [isEn, onRulesChanged]);

  useEffect(() => {
    if (!isOpen) return;
    loadRules();
  }, [isOpen, loadRules]);

  // Sync live target props into probe inputs if user hasn't edited them manually
  useEffect(() => {
    if (!isOpen) return;
    if (activeTargetIp && !probeIp) setProbeIp(activeTargetIp);
    if (activeUsername && !probeUser) setProbeUser(activeUsername);
    if (activePassword && !probePass) setProbePass(activePassword);
    setProbeProtocol(activeProtocol);
    if (activeCustomPort && !probePort) setProbePort(activeCustomPort);
  }, [isOpen, activeTargetIp, activeProtocol, activeCustomPort, activeUsername, activePassword]);

  // Close on Escape unless delete confirm is open
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (menuAnchor) {
          setMenuAnchor(null);
        } else if (!deleteTarget) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, menuAnchor, deleteTarget, onClose]);

  // Close 3-dots portal menu on outside click / scroll
  useEffect(() => {
    if (!menuAnchor) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setMenuAnchor(null);
    };
    const handleScroll = () => setMenuAnchor(null);
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [menuAnchor]);

  const resetForm = () => {
    setEditingRuleId(null);
    setRuleType('ip');
    setTargetValue('');
    setDomainName('');
    setDescription('');
    setEnabled(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveCanManage) return;
    const trimmedTarget = targetValue.trim();
    if (!trimmedTarget) {
      setNotice({
        ok: false,
        text: isEn ? 'Please enter a target IP, user, or AD group.' : 'لطفاً مقدار IP، نام کاربر یا گروه اکتیودایرکتوری را وارد کنید.',
      });
      return;
    }

    setSavingRule(true);
    setNotice(null);
    try {
      let nextRules: HelpdeskExceptionRule[];
      if (editingRuleId) {
        const res = await updateHelpdeskException(editingRuleId, {
          ruleType,
          targetValue: trimmedTarget,
          domainName: domainName.trim(),
          description: description.trim(),
          enabled,
        });
        nextRules = rules.map((r) => (r.id === editingRuleId ? res.rule : r));
        setNotice({
          ok: true,
          text: isEn ? 'Exception rule updated.' : 'قانون استثناء با موفقیت به‌روزرسانی شد.',
        });
      } else {
        const res = await createHelpdeskException({
          ruleType,
          targetValue: trimmedTarget,
          domainName: domainName.trim(),
          description: description.trim(),
          enabled,
        });
        nextRules = [res.rule, ...rules];
        setNotice({
          ok: true,
          text: isEn ? 'Exception rule added to HelpDesk blocklist.' : 'قانون جدید به لیست مسدودسازی هلپ‌دسک اضافه شد.',
        });
      }
      setRules(nextRules);
      onRulesChanged?.(nextRules);
      resetForm();
    } catch (err: any) {
      setNotice({
        ok: false,
        text:
          (isEn ? err?.message : err?.errorFa || err?.message) ||
          (isEn ? 'Failed to save exception rule.' : 'ذخیره قانون استثناء ناموفق بود.'),
      });
    } finally {
      setSavingRule(false);
    }
  };

  const handleToggleRuleEnabled = async (rule: HelpdeskExceptionRule) => {
    if (!effectiveCanManage) return;
    setBusyRuleId(rule.id);
    setNotice(null);
    try {
      const res = await updateHelpdeskException(rule.id, { enabled: !rule.enabled });
      const nextRules = rules.map((r) => (r.id === rule.id ? res.rule : r));
      setRules(nextRules);
      onRulesChanged?.(nextRules);
      setNotice({
        ok: true,
        text: res.rule.enabled
          ? isEn
            ? `Enabled rule "${res.rule.targetValue}".`
            : `قانون «${res.rule.targetValue}» فعال شد.`
          : isEn
          ? `Disabled rule "${res.rule.targetValue}".`
          : `قانون «${res.rule.targetValue}» غیرفعال شد.`,
      });
    } catch (err: any) {
      setNotice({
        ok: false,
        text: (isEn ? err?.message : err?.errorFa || err?.message) || (isEn ? 'Update failed.' : 'به‌روزرسانی ناموفق بود.'),
      });
    } finally {
      setBusyRuleId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !effectiveCanManage) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setBusyRuleId(id);
    setNotice(null);
    try {
      await deleteHelpdeskException(id);
      const nextRules = rules.filter((r) => r.id !== id);
      setRules(nextRules);
      onRulesChanged?.(nextRules);
      if (editingRuleId === id) resetForm();
      setNotice({
        ok: true,
        text: isEn ? 'Exception rule deleted.' : 'قانون استثناء با موفقیت حذف شد.',
      });
    } catch (err: any) {
      setNotice({
        ok: false,
        text: (isEn ? err?.message : err?.errorFa || err?.message) || (isEn ? 'Delete failed.' : 'حذف قانون ناموفق بود.'),
      });
    } finally {
      setBusyRuleId(null);
    }
  };

  const handleInspectEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveCanManage) return;
    const ip = probeIp.trim();
    const user = probeUser.trim();
    if (!ip || !user || !probePass) {
      setProbeError(
        isEn
          ? 'Enter Target IP, Admin Username, and Password to inspect live workstation users and AD groups.'
          : 'برای خواندن لیست واقعی کاربران لوکال و گروه‌های اکتیودایرکتوری، آدرس IP، نام کاربری ادمین و رمز عبور را وارد کنید.'
      );
      return;
    }

    setProbing(true);
    setProbeError(null);
    try {
      const payload: HelpdeskConnectionPayload = {
        targetIp: ip,
        protocol: probeProtocol,
        username: user,
        password: probePass,
        ...(probePort.trim() && Number.isFinite(Number(probePort)) ? { customPort: Number(probePort) } : {}),
        ...(activeJeaConfigName.trim() ? { jeaConfigName: activeJeaConfigName.trim() } : {}),
      };
      const res = await inspectHelpdeskEndpointForExceptions(payload);
      setProbeSnapshot(res.snapshot);
    } catch (err: any) {
      setProbeSnapshot(null);
      setProbeError(
        (isEn ? err?.message : err?.errorFa || err?.message) ||
          (isEn ? 'Failed to inspect endpoint identity.' : 'دریافت اطلاعات کاربران و گروه‌های سیستم ناموفق بود.')
      );
    } finally {
      setProbing(false);
    }
  };

  const hasMatchingRule = useCallback(
    (type: HelpdeskExceptionRuleType, value: string, dom = '') => {
      const normVal = value.trim().toLowerCase();
      const normDom = dom.trim().toLowerCase();
      return rules.some(
        (r) =>
          r.ruleType === type &&
          r.targetValue.trim().toLowerCase() === normVal &&
          (r.domainName || '').trim().toLowerCase() === normDom
      );
    },
    [rules]
  );

  const handleQuickAddRule = async (
    type: HelpdeskExceptionRuleType,
    value: string,
    dom = '',
    desc = ''
  ) => {
    if (!effectiveCanManage) return;
    const key = `${type}:${value}:${dom}`;
    if (hasMatchingRule(type, value, dom)) return;
    setQuickAddingKey(key);
    setNotice(null);
    try {
      const res = await createHelpdeskException({
        ruleType: type,
        targetValue: value.trim(),
        domainName: dom.trim(),
        description: desc.trim(),
        enabled: true,
      });
      const nextRules = [res.rule, ...rules];
      setRules(nextRules);
      onRulesChanged?.(nextRules);
      setNotice({
        ok: true,
        text: isEn
          ? `Added block rule for "${res.rule.targetValue}".`
          : `قانون مسدودسازی برای «${res.rule.targetValue}» اضافه شد.`,
      });
    } catch (err: any) {
      setNotice({
        ok: false,
        text: (isEn ? err?.message : err?.errorFa || err?.message) || (isEn ? 'Failed to add rule.' : 'افزودن قانون ناموفق بود.'),
      });
    } finally {
      setQuickAddingKey(null);
    }
  };

  const filteredRules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rules.filter((r) => {
      if (typeFilter !== 'all' && r.ruleType !== typeFilter) return false;
      if (!q) return true;
      return (
        r.targetValue.toLowerCase().includes(q) ||
        (r.domainName || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.createdBy || '').toLowerCase().includes(q)
      );
    });
  }, [rules, searchQuery, typeFilter]);

  const ruleCounts = useMemo(() => {
    let active = 0;
    let ip = 0;
    let local_user = 0;
    let ad_user = 0;
    let ad_group = 0;
    for (const r of rules) {
      if (r.enabled) active++;
      if (r.ruleType === 'ip') ip++;
      else if (r.ruleType === 'local_user') local_user++;
      else if (r.ruleType === 'ad_user') ad_user++;
      else if (r.ruleType === 'ad_group') ad_group++;
    }
    return { total: rules.length, active, ip, local_user, ad_user, ad_group };
  }, [rules]);

  const filteredSyncedAdUsers = useMemo(() => {
    const list = adCatalog?.syncedUsers || [];
    const q = adSearch.trim().toLowerCase();
    if (!q) return list.slice(0, 60);
    return list
      .filter(
        (u) =>
          u.samAccountName.toLowerCase().includes(q) ||
          (u.displayName || '').toLowerCase().includes(q) ||
          (u.department || '').toLowerCase().includes(q)
      )
      .slice(0, 60);
  }, [adCatalog, adSearch]);

  const filteredSyncedAdGroups = useMemo(() => {
    const list = adCatalog?.syncedGroups || [];
    const q = adSearch.trim().toLowerCase();
    if (!q) return list.slice(0, 60);
    return list.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 60);
  }, [adCatalog, adSearch]);

  const openRowMenu = (e: React.MouseEvent<HTMLButtonElement>, rule: HelpdeskExceptionRule) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 190;
    const menuHeight = 148;
    const vw = window.innerWidth;
    const vh = window.innerHeight - 36; // keep above footer
    let left = isEn ? rect.right - menuWidth : rect.left;
    if (left + menuWidth > vw - 12) left = vw - menuWidth - 12;
    if (left < 12) left = 12;
    let top = rect.bottom + 6;
    if (top + menuHeight > vh) {
      top = Math.max(12, rect.top - menuHeight - 6);
    }
    setMenuAnchor({ rule, top, left });
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const modalShellCls = isLightMode
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-slate-950 border-slate-800 text-slate-100';
  const cardSurfaceCls = isLightMode
    ? 'bg-slate-50 border-slate-200'
    : 'bg-slate-900/70 border-slate-800';
  const inputCls = isLightMode
    ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-sky-500'
    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-sky-400';
  const textMuted = isLightMode ? 'text-slate-600' : 'text-slate-400';

  return createPortal(
    <>
      <div
        dir={isEn ? 'ltr' : 'rtl'}
        className={`fixed top-0 left-0 right-0 bottom-8 z-[9999] flex items-center justify-center ${
          isMaximized ? 'p-0' : 'p-3 sm:p-5'
        } ${isLightMode ? 'bg-slate-900/45' : 'bg-black/70'} backdrop-blur-sm`}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className={`flex flex-col overflow-hidden border shadow-2xl transition-all ${modalShellCls} ${
            isMaximized
              ? 'w-full h-full rounded-none border-x-0 border-t-0'
              : 'w-full max-w-[1180px] max-h-full rounded-2xl'
          }`}
        >
          {/* Header */}
          <div
            className={`px-5 py-3.5 border-b flex items-center justify-between gap-3 shrink-0 ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/90 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`p-2 rounded-xl border shrink-0 ${
                  isLightMode
                    ? 'bg-rose-50 border-rose-200 text-rose-600'
                    : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                }`}
              >
                <ShieldBan className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base font-bold truncate">
                    {isEn
                      ? 'HelpDesk Connection Exceptions & Blocklist'
                      : 'مدیریت استثنائات و مسدودسازی اتصال هلپ‌دسک'}
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-mono border ${
                      ruleCounts.active > 0
                        ? isLightMode
                          ? 'bg-rose-50 border-rose-200 text-rose-700'
                          : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                        : isLightMode
                        ? 'bg-slate-100 border-slate-200 text-slate-600'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    {isEn ? `${ruleCounts.active} active / ${ruleCounts.total} total` : `${ruleCounts.active} فعال از ${ruleCounts.total}`}
                  </span>
                </div>
                <p className={`text-xs truncate ${textMuted}`}>
                  {isEn
                    ? 'Block HelpDesk connections to sensitive IPs/subnets, local accounts, Active Directory users, or AD security groups.'
                    : 'جلوگیری از اتصال صفحه هلپ‌دسک به آدرس‌های IP حساس، کاربران لوکال سیستم، کاربران اکتیو دایرکتوری یا گروه‌های AD.'}
                </p>
              </div>
            </div>

            <ModalHeaderControls
              onClose={onClose}
              onMinimize={onMinimize}
              onMaximizeToggle={() => setIsMaximized((m) => !m)}
              isMaximized={isMaximized}
              isLightMode={isLightMode}
              isEn={isEn}
              extraActions={
                <button
                  type="button"
                  onClick={loadRules}
                  disabled={loading}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isLightMode
                      ? 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'
                      : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-300'
                  }`}
                  title={isEn ? 'Refresh exception rules' : 'بروزرسانی لیست استثنائات'}
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              }
            />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
            {!effectiveCanManage && (
              <div
                className={`rounded-xl border px-4 py-3 flex items-center gap-2.5 text-xs ${
                  isLightMode
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                }`}
              >
                <Lock className="w-4 h-4 shrink-0 text-amber-500" />
                <span>
                  {isEn
                    ? 'Read-only view: Your RBAC policy allows viewing active HelpDesk exclusions, but adding, editing, or deleting block rules requires the "Manage HelpDesk Connection Exceptions" capability.'
                    : 'حالت فقط خواندنی: دسترسی فعلی شما فقط امکان مشاهده قوانین مسدودسازی را دارد. برای افزودن، ویرایش یا حذف قوانین، دسترسی «مدیریت استثنائات اتصال هلپ‌دسک» لازم است.'}
                </span>
              </div>
            )}

            {notice && (
              <div
                className={`rounded-xl border px-4 py-2.5 flex items-center justify-between gap-2 text-xs ${
                  notice.ok
                    ? isLightMode
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : isLightMode
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {notice.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                  <span>{notice.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {error && (
              <div
                className={`rounded-xl border px-4 py-3 flex items-center gap-2 text-xs ${
                  isLightMode
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                }`}
              >
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Admin Creation / Edit + Live Endpoint & AD Discovery Grid */}
            {effectiveCanManage && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                {/* Left: Add / Edit Rule Form */}
                <form
                  onSubmit={handleSaveRule}
                  className={`xl:col-span-5 rounded-xl border p-4 space-y-3.5 ${cardSurfaceCls}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <Plus className="w-4 h-4 text-rose-500" />
                      <span>
                        {editingRuleId
                          ? isEn
                            ? 'Edit Exception Rule'
                            : 'ویرایش قانون استثناء'
                          : isEn
                          ? 'Add Connection Block Rule'
                          : 'افزودن قانون مسدودسازی اتصال'}
                      </span>
                    </div>
                    {editingRuleId && (
                      <button
                        type="button"
                        onClick={resetForm}
                        className="text-[11px] font-semibold text-sky-500 hover:underline cursor-pointer"
                      >
                        {isEn ? 'Cancel Edit' : 'انصراف از ویرایش'}
                      </button>
                    )}
                  </div>

                  {/* Rule Type */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <label>{isEn ? 'Exclusion Type' : 'نوع استثناء (هدف مسدودسازی)'}</label>
                      <FieldInfoTooltip
                        isEn={isEn}
                        isLightMode={isLightMode}
                        fieldName={isEn ? 'Exclusion Target Type' : 'نوع هدف مسدودسازی'}
                        whatIsIt={
                          isEn
                            ? 'Choose whether this block rule matches an endpoint IP/CIDR/hostname, a local workstation account, an Active Directory user, or an AD security group.'
                            : 'تعیین می‌کند که قانون مسدودسازی بر اساس آدرس IP/ساب‌نت، حساب کاربری لوکال سیستم، کاربر اکتیودایرکتوری یا عضویت در گروه AD اعمال شود.'
                        }
                        whyIsItNeeded={
                          isEn
                            ? 'Allows blocking executive workstations, finance servers, or domain administrators by identity even when workstation IPs change via DHCP.'
                            : 'به شما اجازه می‌دهد حتی در صورت تغییر IP سیستم با DHCP، سیستم‌های مدیران، حساب‌های حساس یا اعضای گروه‌های خاص دامین را به صورت خودکار از دسترس هلپ‌دسک خارج کنید.'
                        }
                        practicalExample={
                          isEn
                            ? 'IP: 10.10.5.0/24 · Local User: ceo_local · AD User: a.ahmadi · AD Group: Executive_Team'
                            : 'IP: 10.10.5.0/24 · کاربر لوکال: ceo_local · کاربر AD: a.ahmadi · گروه AD: Executive_Team'
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(RULE_TYPE_META) as HelpdeskExceptionRuleType[]).map((typeKey) => {
                        const meta = RULE_TYPE_META[typeKey];
                        const Icon = meta.icon;
                        const active = ruleType === typeKey;
                        return (
                          <button
                            key={typeKey}
                            type="button"
                            onClick={() => setRuleType(typeKey)}
                            className={`px-2.5 py-2 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                              active
                                ? isLightMode
                                  ? 'bg-rose-50 border-rose-400 text-rose-800'
                                  : 'bg-rose-500/15 border-rose-500/50 text-rose-200'
                                : isLightMode
                                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{isEn ? meta.labelEn : meta.labelFa}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Target Value */}
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold">
                      {isEn ? 'Target Value *' : 'مقدار هدف (IP / نام کاربر / نام گروه) *'}
                    </label>
                    <input
                      type="text"
                      value={targetValue}
                      onChange={(e) => setTargetValue(e.target.value)}
                      dir="ltr"
                      placeholder={isEn ? RULE_TYPE_META[ruleType].placeholderEn : RULE_TYPE_META[ruleType].placeholderFa}
                      className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                    />
                  </div>

                  {/* Quick prefill chips from current active HelpDesk session if present */}
                  {(activeTargetIp || activeLoggedInUser) && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className={textMuted}>
                        {isEn ? 'Quick fill from active host:' : 'پر کردن سریع از سیستم فعلی:'}
                      </span>
                      {activeTargetIp && (
                        <button
                          type="button"
                          onClick={() => {
                            setRuleType('ip');
                            setTargetValue(activeTargetIp);
                          }}
                          className={`px-2 py-0.5 rounded border font-mono cursor-pointer ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-sky-700 hover:bg-sky-50'
                              : 'bg-slate-950 border-slate-700 text-sky-300 hover:bg-slate-800'
                          }`}
                        >
                          IP: {activeTargetIp}
                        </button>
                      )}
                      {activeLoggedInUser && (
                        <button
                          type="button"
                          onClick={() => {
                            const hasSlash = activeLoggedInUser.includes('\\');
                            setRuleType(hasSlash ? 'ad_user' : 'local_user');
                            setTargetValue(activeLoggedInUser);
                          }}
                          className={`px-2 py-0.5 rounded border font-mono cursor-pointer ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-indigo-700 hover:bg-indigo-50'
                              : 'bg-slate-950 border-slate-700 text-indigo-300 hover:bg-slate-800'
                          }`}
                        >
                          {activeLoggedInUser}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Optional Domain Filter (shown for AD User / AD Group, or optional for all) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-xs font-semibold">
                        <label>{isEn ? 'Domain Scope (Optional)' : 'محدوده دامین (اختیاری)'}</label>
                        <FieldInfoTooltip
                          isEn={isEn}
                          isLightMode={isLightMode}
                          fieldName={isEn ? 'Optional Domain Scope' : 'فیلتر دامین اکتیودایرکتوری'}
                          whatIsIt={
                            isEn
                              ? 'Restricts an AD user or AD group rule to a specific Active Directory domain (NetBIOS or FQDN).'
                              : 'اعمال قانون کاربر یا گروه اکتیودایرکتوری را به یک دامین خاص (مانند CORP یا corp.local) محدود می‌کند.'
                          }
                          whyIsItNeeded={
                            isEn
                              ? 'Prevents accidental cross-domain matches in multi-domain forests; leave blank to match across any domain.'
                              : 'در محیط‌های چنددامینی مانع تطابق اشتباه نام‌های مشابه در دامین‌های دیگر می‌شود؛ در حالت خالی روی همه دامین‌ها اعمال می‌شود.'
                          }
                          practicalExample={isEn ? 'CORP or corp.local (blank = any)' : 'CORP یا corp.local (خالی = همه دامین‌ها)'}
                        />
                      </div>
                      <input
                        type="text"
                        value={domainName}
                        onChange={(e) => setDomainName(e.target.value)}
                        dir="ltr"
                        disabled={ruleType === 'ip' || ruleType === 'local_user'}
                        placeholder={
                          ruleType === 'ip' || ruleType === 'local_user'
                            ? isEn
                              ? 'N/A for IP / Local'
                              : 'فقط برای AD'
                            : isEn
                            ? 'e.g. corp.local'
                            : 'مثال: corp.local'
                        }
                        className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none disabled:opacity-50 ${inputCls}`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold">
                        {isEn ? 'Rule Status' : 'وضعیت قانون'}
                      </label>
                      <button
                        type="button"
                        onClick={() => setEnabled((v) => !v)}
                        className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold flex items-center justify-between cursor-pointer ${
                          enabled
                            ? isLightMode
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                            : isLightMode
                            ? 'bg-slate-100 border-slate-300 text-slate-600'
                            : 'bg-slate-950 border-slate-700 text-slate-400'
                        }`}
                      >
                        <span>{enabled ? (isEn ? 'Enabled (Blocking)' : 'فعال (مسدودسازی فعال)') : isEn ? 'Disabled' : 'غیرفعال'}</span>
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Description / Reason */}
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold">
                      {isEn ? 'Reason / Note (Optional)' : 'توضیحات / علت استثناء (اختیاری)'}
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={
                        isEn
                          ? 'e.g. Executive laptop — requires explicit approval before HelpDesk access'
                          : 'مثال: سیستم مدیریت ارشد — اتصال از هلپ‌دسک ممنوع است'
                      }
                      className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingRule || !targetValue.trim()}
                    className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    {savingRule ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldBan className="w-4 h-4" />}
                    <span>
                      {editingRuleId
                        ? isEn
                          ? 'Save Rule Changes'
                          : 'ذخیره تغییرات قانون'
                        : isEn
                        ? 'Add HelpDesk Block Rule'
                        : 'ثبت قانون مسدودسازی در هلپ‌دسک'}
                    </span>
                  </button>
                </form>

                {/* Right: Live Target Identity Discovery & Synced AD Directory Picker */}
                <div className={`xl:col-span-7 rounded-xl border p-4 flex flex-col gap-3 ${cardSurfaceCls}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Building2 className="w-4 h-4 text-sky-500" />
                      <span>
                        {isEn
                          ? 'Discover Real Endpoint Local Users & Active Directory Identities'
                          : 'استخراج واقعی کاربران لوکال سیستم، کاربران و گروه‌های اکتیودایرکتوری'}
                      </span>
                      <FieldInfoTooltip
                        isEn={isEn}
                        isLightMode={isLightMode}
                        fieldName={isEn ? 'Endpoint & AD Identity Discovery' : 'شناسایی کاربران لوکال و گروه‌های AD'}
                        whatIsIt={
                          isEn
                            ? 'Queries a target workstation live (via WinRM/SSH) for its local accounts, active logged-in users, AD users, and AD group memberships—or lets you pick from synced AD directory data.'
                            : 'به صورت مستقیم از سیستم هدف (از طریق WinRM/SSH) لیست کاربران لوکال، کاربر لاگین‌شده و گروه‌های اکتیودایرکتوری را می‌خواند یا از لیست همگام‌سازی‌شده AD انتخاب می‌کند.'
                        }
                        whyIsItNeeded={
                          isEn
                            ? 'Ensures exact spelling of SAMAccountNames, local usernames, and AD security groups without guessing or manual typos.'
                            : 'باعث می‌شود دقیقاً نام واقعی یوزرهای لوکال و گروه‌های امنیتی اکتیودایرکتوری همان سیستم را بدون خطای تایپی به لیست مسدودسازی اضافه کنید.'
                        }
                        practicalExample={
                          isEn
                            ? 'Inspect 192.168.10.45 → click "+ Block" beside local user "ceo_local" or AD group "Finance_Managers"'
                            : 'بررسی 192.168.10.45 ← کلیک روی افزودن کنار کاربر لوکال یا گروه Finance_Managers'
                        }
                      />
                    </div>

                    <div
                      className={`inline-flex rounded-lg border p-0.5 text-[11px] font-semibold ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setDiscoveryTab('live_endpoint')}
                        className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                          discoveryTab === 'live_endpoint'
                            ? 'bg-sky-600 text-white'
                            : isLightMode
                            ? 'text-slate-600 hover:text-slate-900'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {isEn ? 'Inspect Live Workstation' : 'استعلام از سیستم هدف'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscoveryTab('ad_catalog')}
                        className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                          discoveryTab === 'ad_catalog'
                            ? 'bg-sky-600 text-white'
                            : isLightMode
                            ? 'text-slate-600 hover:text-slate-900'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span>{isEn ? 'Synced AD Directory' : 'دایرکتوری همگام‌سازی‌شده AD'}</span>
                        {adCatalog && (adCatalog.syncedUsers.length > 0 || adCatalog.syncedGroups.length > 0) && (
                          <span className="px-1.5 py-0.2 rounded-full bg-black/20 text-[10px] font-mono">
                            {adCatalog.syncedUsers.length + adCatalog.syncedGroups.length}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {discoveryTab === 'live_endpoint' ? (
                    <div className="space-y-3">
                      <form onSubmit={handleInspectEndpoint} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <input
                          type="text"
                          value={probeIp}
                          onChange={(e) => setProbeIp(e.target.value)}
                          dir="ltr"
                          placeholder={isEn ? 'Workstation IP (e.g. 192.168.10.45)' : 'آدرس IP سیستم (192.168.10.45)'}
                          className={`sm:col-span-4 px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                        />
                        <select
                          value={probeProtocol}
                          onChange={(e) => setProbeProtocol(e.target.value as any)}
                          dir="ltr"
                          className={`sm:col-span-2 px-2 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                        >
                          <option value="auto">Auto</option>
                          <option value="winrm_https">WinRM HTTPS</option>
                          <option value="winrm_http">WinRM HTTP</option>
                          <option value="smb_rpc">SMB/RPC</option>
                          <option value="ssh">SSH</option>
                        </select>
                        <input
                          type="text"
                          value={probeUser}
                          onChange={(e) => setProbeUser(e.target.value)}
                          dir="ltr"
                          placeholder={isEn ? 'Admin Username' : 'نام کاربری ادمین'}
                          className={`sm:col-span-3 px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                        />
                        <div className="sm:col-span-3 relative">
                          <input
                            type={showProbePass ? 'text' : 'password'}
                            value={probePass}
                            onChange={(e) => setProbePass(e.target.value)}
                            dir="ltr"
                            placeholder={isEn ? 'Password' : 'رمز عبور'}
                            className={`w-full px-2.5 py-1.5 pr-7 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowProbePass((v) => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 cursor-pointer"
                          >
                            {showProbePass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="sm:col-span-12 flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={probePort}
                            onChange={(e) => setProbePort(e.target.value)}
                            dir="ltr"
                            placeholder={isEn ? 'Custom Port (Optional)' : 'پورت دلخواه (اختیاری)'}
                            className={`w-44 px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                          />
                          <button
                            type="submit"
                            disabled={probing}
                            className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                          >
                            {probing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
                            <span>
                              {isEn ? 'Fetch Real Users & AD Groups' : 'خواندن کاربران لوکال و گروه‌های AD'}
                            </span>
                          </button>
                        </div>
                      </form>

                      {probeError && (
                        <div
                          className={`rounded-lg border px-3 py-2 text-xs flex items-center gap-2 ${
                            isLightMode
                              ? 'bg-rose-50 border-rose-200 text-rose-800'
                              : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                          }`}
                        >
                          <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="break-words">{probeError}</span>
                        </div>
                      )}

                      {probeSnapshot ? (
                        <div
                          className={`rounded-xl border p-3 space-y-3 text-xs ${
                            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/90 border-slate-800'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-500/20">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold font-mono">
                                {probeSnapshot.hostname || probeSnapshot.targetIp}
                              </span>
                              {probeSnapshot.partOfDomain && probeSnapshot.domain && (
                                <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 text-[11px] font-mono">
                                  AD: {probeSnapshot.domain}
                                </span>
                              )}
                            </div>
                            <span className={`text-[11px] font-mono ${textMuted}`}>
                              {probeSnapshot.primaryIps.join(', ') || probeSnapshot.targetIp}
                            </span>
                          </div>

                          {/* IPs */}
                          {probeSnapshot.primaryIps.length > 0 && (
                            <div className="space-y-1">
                              <div className={`text-[11px] font-semibold ${textMuted}`}>
                                {isEn ? 'Active IPv4 Addresses (Click to exclude)' : 'آدرس‌های IP فعال سیستم (کلیک برای مسدودسازی)'}
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {probeSnapshot.primaryIps.map((ipVal) => {
                                  const exists = hasMatchingRule('ip', ipVal);
                                  const key = `ip:${ipVal}:`;
                                  return (
                                    <button
                                      key={ipVal}
                                      type="button"
                                      disabled={exists || quickAddingKey === key}
                                      onClick={() =>
                                        handleQuickAddRule(
                                          'ip',
                                          ipVal,
                                          '',
                                          probeSnapshot.hostname ? `Host: ${probeSnapshot.hostname}` : ''
                                        )
                                      }
                                      className={`px-2 py-1 rounded-md border text-[11px] font-mono flex items-center gap-1 transition cursor-pointer disabled:cursor-default ${
                                        exists
                                          ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                                          : isLightMode
                                          ? 'bg-slate-50 border-slate-300 hover:bg-rose-50 hover:border-rose-300'
                                          : 'bg-slate-900 border-slate-700 hover:bg-rose-500/15 hover:border-rose-500/40'
                                      }`}
                                    >
                                      {exists ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 text-rose-500" />}
                                      <span>{ipVal}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Local Users */}
                          <div className="space-y-1">
                            <div className={`text-[11px] font-semibold ${textMuted}`}>
                              {isEn
                                ? `Enabled Local Accounts (${probeSnapshot.localUsers.length})`
                                : `کاربران لوکال فعال سیستم (${probeSnapshot.localUsers.length})`}
                            </div>
                            {probeSnapshot.localUsers.length === 0 ? (
                              <div className={`text-[11px] italic ${textMuted}`}>
                                {isEn ? 'No enabled local accounts returned.' : 'کاربر لوکال فعالی گزارش نشد.'}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                                {probeSnapshot.localUsers.map((lu) => {
                                  const exists = hasMatchingRule('local_user', lu);
                                  const key = `local_user:${lu}:`;
                                  return (
                                    <button
                                      key={lu}
                                      type="button"
                                      disabled={exists || quickAddingKey === key}
                                      onClick={() =>
                                        handleQuickAddRule(
                                          'local_user',
                                          lu,
                                          '',
                                          probeSnapshot.hostname ? `Local account from ${probeSnapshot.hostname}` : ''
                                        )
                                      }
                                      className={`px-2 py-1 rounded-md border text-[11px] font-mono flex items-center gap-1 transition cursor-pointer disabled:cursor-default ${
                                        exists
                                          ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                                          : isLightMode
                                          ? 'bg-amber-50/60 border-amber-200 text-amber-900 hover:bg-rose-50 hover:border-rose-300'
                                          : 'bg-amber-500/10 border-amber-500/25 text-amber-200 hover:bg-rose-500/15 hover:border-rose-500/40'
                                      }`}
                                    >
                                      {exists ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 text-rose-500" />}
                                      <span>{lu}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* AD Users */}
                          <div className="space-y-1">
                            <div className={`text-[11px] font-semibold ${textMuted}`}>
                              {isEn
                                ? `Active Directory Users on Endpoint (${probeSnapshot.adUsers.length})`
                                : `کاربران اکتیودایرکتوری شناسایی‌شده روی سیستم (${probeSnapshot.adUsers.length})`}
                            </div>
                            {probeSnapshot.adUsers.length === 0 ? (
                              <div className={`text-[11px] italic ${textMuted}`}>
                                {isEn ? 'No active AD session user detected.' : 'کاربر اکتیودایرکتوری فعالی روی این سیستم شناسایی نشد.'}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {probeSnapshot.adUsers.map((au) => {
                                  const dom = probeSnapshot.domain || '';
                                  const exists = hasMatchingRule('ad_user', au, dom) || hasMatchingRule('ad_user', au, '');
                                  const key = `ad_user:${au}:${dom}`;
                                  return (
                                    <button
                                      key={au}
                                      type="button"
                                      disabled={exists || quickAddingKey === key}
                                      onClick={() => handleQuickAddRule('ad_user', au, dom)}
                                      className={`px-2 py-1 rounded-md border text-[11px] font-mono flex items-center gap-1 transition cursor-pointer disabled:cursor-default ${
                                        exists
                                          ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                                          : isLightMode
                                          ? 'bg-indigo-50/70 border-indigo-200 text-indigo-900 hover:bg-rose-50 hover:border-rose-300'
                                          : 'bg-indigo-500/10 border-indigo-500/25 text-indigo-200 hover:bg-rose-500/15 hover:border-rose-500/40'
                                      }`}
                                    >
                                      {exists ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 text-rose-500" />}
                                      <span>{au}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* AD Groups */}
                          <div className="space-y-1">
                            <div className={`text-[11px] font-semibold ${textMuted}`}>
                              {isEn
                                ? `Active Directory Groups on Endpoint User (${probeSnapshot.adGroups.length})`
                                : `گروه‌های اکتیودایرکتوری کاربر این سیستم (${probeSnapshot.adGroups.length})`}
                            </div>
                            {probeSnapshot.adGroups.length === 0 ? (
                              <div className={`text-[11px] italic ${textMuted}`}>
                                {isEn
                                  ? 'No Active Directory group memberships returned.'
                                  : 'گروه اکتیودایرکتوری برای این سیستم یا کاربر دریافت نشد.'}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                {probeSnapshot.adGroups.map((grp) => {
                                  const dom = probeSnapshot.domain || '';
                                  const exists =
                                    hasMatchingRule('ad_group', grp, dom) || hasMatchingRule('ad_group', grp, '');
                                  const key = `ad_group:${grp}:${dom}`;
                                  return (
                                    <button
                                      key={grp}
                                      type="button"
                                      disabled={exists || quickAddingKey === key}
                                      onClick={() => handleQuickAddRule('ad_group', grp, dom)}
                                      className={`px-2 py-1 rounded-md border text-[11px] flex items-center gap-1 transition cursor-pointer disabled:cursor-default ${
                                        exists
                                          ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                                          : isLightMode
                                          ? 'bg-rose-50/70 border-rose-200 text-rose-900 hover:bg-rose-100'
                                          : 'bg-rose-500/10 border-rose-500/25 text-rose-200 hover:bg-rose-500/20'
                                      }`}
                                    >
                                      {exists ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 text-rose-500" />}
                                      <span className="font-mono">{grp}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`rounded-xl border border-dashed p-5 text-center text-xs ${textMuted} ${
                            isLightMode ? 'border-slate-300 bg-white/60' : 'border-slate-700 bg-slate-950/40'
                          }`}
                        >
                          {isEn
                            ? 'Enter any workstation IP + admin credentials above to inspect its real local users, logged-in domain user, and Active Directory groups, then add exclusions in one click.'
                            : 'آدرس IP سیستم و اطلاعات ورود ادمین را در بالا وارد کنید تا لیست واقعی کاربران لوکال، کاربر دامین و گروه‌های اکتیودایرکتوری آن سیستم نمایش داده شود و با یک کلیک مسدود گردد.'}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Synced AD Directory Picker */
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
                        <input
                          type="text"
                          value={adSearch}
                          onChange={(e) => setAdSearch(e.target.value)}
                          placeholder={
                            isEn
                              ? 'Search synced Active Directory users or security groups...'
                              : 'جستجو در کاربران و گروه‌های همگام‌سازی‌شده اکتیو دایرکتوری...'
                          }
                          className={`w-full pl-9 pr-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                        />
                      </div>

                      {!adCatalog || (adCatalog.syncedUsers.length === 0 && adCatalog.syncedGroups.length === 0) ? (
                        <div
                          className={`rounded-xl border border-dashed p-5 text-center text-xs ${textMuted} ${
                            isLightMode ? 'border-slate-300 bg-white/60' : 'border-slate-700 bg-slate-950/40'
                          }`}
                        >
                          {isEn
                            ? 'No synced Active Directory catalog is configured in Settings -> Active Directory yet. You can still enter AD users/groups manually or use "Inspect Live Workstation".'
                            : 'هنوز دایرکتوری اکتیو در تنظیمات سیستم همگام‌سازی نشده است. می‌توانید نام کاربر/گروه را دستی وارد کنید یا از تب «استعلام از سیستم هدف» استفاده کنید.'}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
                          {/* AD Users Column */}
                          <div className="space-y-1.5">
                            <div className={`text-[11px] font-bold flex items-center justify-between ${textMuted}`}>
                              <span>{isEn ? 'Synced AD Users' : 'کاربران AD همگام‌سازی‌شده'}</span>
                              <span className="font-mono">{filteredSyncedAdUsers.length}</span>
                            </div>
                            <div className="space-y-1">
                              {filteredSyncedAdUsers.map((u) => {
                                const exists =
                                  hasMatchingRule('ad_user', u.samAccountName, adCatalog.domain) ||
                                  hasMatchingRule('ad_user', u.samAccountName, '');
                                const key = `ad_user:${u.samAccountName}:${adCatalog.domain}`;
                                return (
                                  <div
                                    key={u.samAccountName}
                                    className={`px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 text-xs ${
                                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div className="font-mono font-semibold truncate">{u.samAccountName}</div>
                                      {u.displayName && (
                                        <div className={`text-[11px] truncate ${textMuted}`}>{u.displayName}</div>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      disabled={exists || quickAddingKey === key}
                                      onClick={() =>
                                        handleQuickAddRule(
                                          'ad_user',
                                          u.samAccountName,
                                          adCatalog.domain,
                                          u.displayName || ''
                                        )
                                      }
                                      className={`px-2 py-1 rounded border text-[11px] font-semibold shrink-0 cursor-pointer disabled:opacity-60 ${
                                        exists
                                          ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                                          : 'bg-rose-600 hover:bg-rose-500 border-rose-600 text-white'
                                      }`}
                                    >
                                      {exists ? (isEn ? 'Blocked' : 'مسدود') : isEn ? '+ Exclude' : '+ مسدود'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* AD Groups Column */}
                          <div className="space-y-1.5">
                            <div className={`text-[11px] font-bold flex items-center justify-between ${textMuted}`}>
                              <span>{isEn ? 'Synced AD Groups' : 'گروه‌های AD همگام‌سازی‌شده'}</span>
                              <span className="font-mono">{filteredSyncedAdGroups.length}</span>
                            </div>
                            <div className="space-y-1">
                              {filteredSyncedAdGroups.map((g) => {
                                const exists =
                                  hasMatchingRule('ad_group', g.name, adCatalog.domain) ||
                                  hasMatchingRule('ad_group', g.name, '');
                                const key = `ad_group:${g.name}:${adCatalog.domain}`;
                                return (
                                  <div
                                    key={g.name}
                                    className={`px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 text-xs ${
                                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
                                    }`}
                                  >
                                    <div className="font-mono font-semibold truncate">{g.name}</div>
                                    <button
                                      type="button"
                                      disabled={exists || quickAddingKey === key}
                                      onClick={() => handleQuickAddRule('ad_group', g.name, adCatalog.domain)}
                                      className={`px-2 py-1 rounded border text-[11px] font-semibold shrink-0 cursor-pointer disabled:opacity-60 ${
                                        exists
                                          ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                                          : 'bg-rose-600 hover:bg-rose-500 border-rose-600 text-white'
                                      }`}
                                    >
                                      {exists ? (isEn ? 'Blocked' : 'مسدود') : isEn ? '+ Exclude' : '+ مسدود'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Existing Rules Table & Filter Bar */}
            <div className={`rounded-xl border overflow-hidden ${cardSurfaceCls}`}>
              <div className="p-3.5 border-b border-slate-500/20 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'all', en: `All (${ruleCounts.total})`, fa: `همه (${ruleCounts.total})` },
                      { id: 'ip', en: `IP / Host (${ruleCounts.ip})`, fa: `IP / هاست (${ruleCounts.ip})` },
                      { id: 'local_user', en: `Local User (${ruleCounts.local_user})`, fa: `کاربر لوکال (${ruleCounts.local_user})` },
                      { id: 'ad_user', en: `AD User (${ruleCounts.ad_user})`, fa: `کاربر AD (${ruleCounts.ad_user})` },
                      { id: 'ad_group', en: `AD Group (${ruleCounts.ad_group})`, fa: `گروه AD (${ruleCounts.ad_group})` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setTypeFilter(f.id)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${
                        typeFilter === f.id
                          ? 'bg-sky-600 border-sky-600 text-white'
                          : isLightMode
                          ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {isEn ? f.en : f.fa}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isEn ? 'Filter rules...' : 'جستجو در قوانین...'}
                    className={`w-full pl-9 pr-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                  />
                </div>
              </div>

              {loading && rules.length === 0 ? (
                <div className="p-8 text-center text-xs flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
                  <span>{isEn ? 'Loading HelpDesk exceptions...' : 'در حال بارگذاری قوانین استثناء...'}</span>
                </div>
              ) : filteredRules.length === 0 ? (
                <div className={`p-8 text-center text-xs ${textMuted}`}>
                  {rules.length === 0
                    ? isEn
                      ? 'No HelpDesk connection exceptions are configured yet. All authorized endpoints are reachable.'
                      : 'هنوز هیچ استثنایی برای مسدودسازی ثبت نشده است. تمامی سیستم‌های مجاز از هلپ‌دسک قابل اتصال هستند.'
                    : isEn
                    ? 'No rules match the current filter.'
                    : 'قانونی با فیلتر جستجوی فعلی پیدا نشد.'}
                </div>
              ) : (
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
                          {isEn ? 'Type' : 'نوع قانون'}
                        </th>
                        <th className={`px-3.5 py-2.5 font-semibold ${isEn ? 'text-left' : 'text-right'}`}>
                          {isEn ? 'Blocked Target' : 'مقدار مسدودشده'}
                        </th>
                        <th className={`px-3.5 py-2.5 font-semibold ${isEn ? 'text-left' : 'text-right'}`}>
                          {isEn ? 'Domain' : 'دامین'}
                        </th>
                        <th className={`px-3.5 py-2.5 font-semibold ${isEn ? 'text-left' : 'text-right'}`}>
                          {isEn ? 'Reason / Note' : 'توضیحات'}
                        </th>
                        <th className={`px-3.5 py-2.5 font-semibold ${isEn ? 'text-left' : 'text-right'}`}>
                          {isEn ? 'Status' : 'وضعیت'}
                        </th>
                        <th className={`px-3.5 py-2.5 font-semibold ${isEn ? 'text-left' : 'text-right'}`}>
                          {isEn ? 'Created By' : 'ایجادکننده'}
                        </th>
                        {effectiveCanManage && (
                          <th className="px-3.5 py-2.5 font-semibold text-center w-14">
                            {isEn ? 'Actions' : 'عملیات'}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-500/15">
                      {filteredRules.map((rule) => {
                        const meta = RULE_TYPE_META[rule.ruleType] || RULE_TYPE_META.ip;
                        const Icon = meta.icon;
                        const isBusy = busyRuleId === rule.id;
                        return (
                          <tr
                            key={rule.id}
                            className={`transition ${
                              isLightMode ? 'hover:bg-slate-100/70' : 'hover:bg-slate-800/40'
                            } ${!rule.enabled ? 'opacity-60' : ''}`}
                          >
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${
                                  isLightMode ? meta.badgeLightCls : meta.badgeCls
                                }`}
                              >
                                <Icon className="w-3 h-3 shrink-0" />
                                <span>{isEn ? meta.labelEn : meta.labelFa}</span>
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 font-mono font-bold break-all max-w-[260px]" dir="ltr">
                              {rule.targetValue}
                            </td>
                            <td className={`px-3.5 py-2.5 font-mono whitespace-nowrap ${textMuted}`} dir="ltr">
                              {rule.domainName || '—'}
                            </td>
                            <td className={`px-3.5 py-2.5 max-w-[260px] break-words ${textMuted}`}>
                              {rule.description || '—'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                                  rule.enabled
                                    ? isLightMode
                                      ? 'bg-rose-50 border-rose-200 text-rose-700'
                                      : 'bg-rose-500/15 border-rose-500/35 text-rose-300'
                                    : isLightMode
                                    ? 'bg-slate-100 border-slate-200 text-slate-600'
                                    : 'bg-slate-800 border-slate-700 text-slate-400'
                                }`}
                              >
                                {rule.enabled
                                  ? isEn
                                    ? 'Blocking Active'
                                    : 'مسدود فعال'
                                  : isEn
                                  ? 'Disabled'
                                  : 'غیرفعال'}
                              </span>
                            </td>
                            <td className={`px-3.5 py-2.5 whitespace-nowrap font-mono text-[11px] ${textMuted}`}>
                              {rule.createdBy || 'system'}
                            </td>
                            {effectiveCanManage && (
                              <td className="px-3.5 py-2.5 text-center">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={(e) => openRowMenu(e, rule)}
                                  className={`p-1.5 rounded-lg border transition cursor-pointer disabled:opacity-50 ${
                                    isLightMode
                                      ? 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                                      : 'bg-slate-950 border-slate-700 hover:bg-slate-800 text-slate-200'
                                  }`}
                                  title={isEn ? 'Rule Actions' : 'عملیات قانون'}
                                >
                                  {isBusy ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3-Dots Portal Row Action Menu (Modal Guidelines Section 5) */}
      {menuAnchor &&
        createPortal(
          <div
            ref={menuRef}
            dir={isEn ? 'ltr' : 'rtl'}
            style={{ top: menuAnchor.top, left: menuAnchor.left, width: 190 }}
            className={`fixed z-[1000010] rounded-xl border shadow-2xl p-1.5 space-y-1 text-xs ${
              isLightMode
                ? 'bg-white border-slate-200 text-slate-800'
                : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                const r = menuAnchor.rule;
                setMenuAnchor(null);
                setEditingRuleId(r.id);
                setRuleType(r.ruleType);
                setTargetValue(r.targetValue);
                setDomainName(r.domainName || '');
                setDescription(r.description || '');
                setEnabled(r.enabled);
              }}
              className={`w-full px-2.5 py-2 rounded-lg flex items-center gap-2 transition cursor-pointer ${
                isLightMode ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5 text-sky-500" />
              <span>{isEn ? 'Edit Rule' : 'ویرایش قانون'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const r = menuAnchor.rule;
                setMenuAnchor(null);
                handleToggleRuleEnabled(r);
              }}
              className={`w-full px-2.5 py-2 rounded-lg flex items-center gap-2 transition cursor-pointer ${
                isLightMode ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
              }`}
            >
              <Power className={`w-3.5 h-3.5 ${menuAnchor.rule.enabled ? 'text-amber-500' : 'text-emerald-500'}`} />
              <span>
                {menuAnchor.rule.enabled
                  ? isEn
                    ? 'Disable Rule'
                    : 'غیرفعال کردن قانون'
                  : isEn
                  ? 'Enable Rule'
                  : 'فعال کردن قانون'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                const r = menuAnchor.rule;
                setMenuAnchor(null);
                setDeleteTarget({
                  type: 'generic',
                  id: r.id,
                  name: r.targetValue,
                  category: isEn ? RULE_TYPE_META[r.ruleType].labelEn : RULE_TYPE_META[r.ruleType].labelFa,
                  description: r.description || undefined,
                });
              }}
              className={`w-full px-2.5 py-2 rounded-lg flex items-center gap-2 text-rose-500 transition cursor-pointer ${
                isLightMode ? 'hover:bg-rose-50' : 'hover:bg-rose-500/10'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isEn ? 'Delete Rule' : 'حذف قانون'}</span>
            </button>
          </div>,
          document.body
        )}

      {/* Standard Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        target={deleteTarget}
        onConfirm={handleConfirmDelete}
        isLightMode={isLightMode}
      />
    </>,
    document.body
  );
};
