import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Clock,
  Info,
  Layers,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  AccessPolicy,
  ActiveDirectoryConfig,
  ApprovalEligibleCandidate,
  ApprovalStageApproverTargetType,
  ApprovalWorkflowStageApproverRef,
  ApprovalWorkflowStageConfig,
  LocalGroup,
  LocalUser,
} from '../../types';
import { fetchEligibleApproversApi } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface ApprovalChainBuilderProps {
  stages: ApprovalWorkflowStageConfig[];
  onChange: (stages: ApprovalWorkflowStageConfig[]) => void;
  requireApprovalCount: number;
  isEn: boolean;
  isLightMode: boolean;
  liveLocalUsers?: LocalUser[];
  liveLocalGroups?: LocalGroup[];
  liveAdConfig?: ActiveDirectoryConfig;
  currentPolicy?: AccessPolicy | null;
}

const TTL_PRESETS = [
  { minutes: 30, labelEn: '30m', labelFa: '۳۰ دقیقه' },
  { minutes: 60, labelEn: '1h', labelFa: '۱ ساعت' },
  { minutes: 240, labelEn: '4h', labelFa: '۴ ساعت' },
  { minutes: 1440, labelEn: '24h', labelFa: '۲۴ ساعت' },
  { minutes: 4320, labelEn: '72h', labelFa: '۷۲ ساعت' },
];

export const ApprovalChainBuilder: React.FC<ApprovalChainBuilderProps> = ({
  stages,
  onChange,
  requireApprovalCount,
  isEn,
  isLightMode,
  liveLocalUsers = [],
  liveLocalGroups = [],
  liveAdConfig,
}) => {
  const [eligibleUsers, setEligibleUsers] = useState<ApprovalEligibleCandidate[]>([]);
  const [eligibleGroups, setEligibleGroups] = useState<ApprovalEligibleCandidate[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stageSearchQueries, setStageSearchQueries] = useState<Record<number, string>>({});
  const [showOnlyPrivileged, setShowOnlyPrivileged] = useState(true);

  const buildLocalFallbackCandidates = useCallback(() => {
    const users: ApprovalEligibleCandidate[] = (liveLocalUsers || [])
      .filter((u) => u && u.status !== 'disabled')
      .map((u) => {
        const cleanUser = (u.username || '').toLowerCase().trim();
        const roleLower = (u.role || '').toLowerCase().trim();
        const isSuper =
          cleanUser === 'admin' ||
          roleLower.includes('super admin') ||
          roleLower.includes('administrator');
        return {
          id: u.id,
          rawId: u.id,
          name: u.fullName ? `${u.fullName} (${u.username})` : u.username,
          username: u.username,
          displayName: u.fullName ? `${u.fullName} (${u.username})` : u.username,
          type: 'local_user',
          role: u.role || 'Operator',
          hasApprovalPrivilege: isSuper,
          isSuperAdmin: isSuper,
          email: u.email,
        };
      });

    const adUsers: ApprovalEligibleCandidate[] = (liveAdConfig?.syncedUsers || []).map((au) => {
      const id = au.samAccountName || au.dn || au.email;
      return {
        id,
        rawId: au.dn || id,
        name: au.displayName || au.samAccountName || id,
        username: au.samAccountName || id,
        displayName: au.displayName ? `${au.displayName} (${au.samAccountName || id})` : id,
        type: 'ad_user',
        role: au.title || 'Active Directory User',
        hasApprovalPrivilege: false,
        email: au.email,
      };
    });

    const groups: ApprovalEligibleCandidate[] = (liveLocalGroups || []).map((g) => {
      const isSuperGroup = g.id === 'group-admin' || g.name.toLowerCase().includes('admin');
      return {
        id: g.id,
        rawId: g.id,
        name: g.name,
        displayName: g.name,
        type: 'local_group',
        role: g.description || 'Local Group',
        hasApprovalPrivilege: isSuperGroup,
        isSuperAdmin: isSuperGroup,
        memberCount: Array.isArray(g.memberUserIds) ? g.memberUserIds.length : 0,
      };
    });

    const adGroups: ApprovalEligibleCandidate[] = (liveAdConfig?.syncedGroups || []).map((ag) => ({
      id: ag.dn || ag.cn,
      rawId: ag.dn || ag.cn,
      name: ag.cn,
      displayName: `${ag.cn} (Active Directory)`,
      type: 'ad_group',
      role: 'Active Directory Group',
      hasApprovalPrivilege: false,
      memberCount: typeof ag.memberCount === 'number' ? ag.memberCount : undefined,
    }));

    return {
      users: [...users, ...adUsers],
      groups: [...groups, ...adGroups],
    };
  }, [liveLocalUsers, liveLocalGroups, liveAdConfig]);

  const loadCandidates = useCallback(async () => {
    setIsLoadingCandidates(true);
    setLoadError(null);
    try {
      const res = await fetchEligibleApproversApi();
      if (res?.success) {
        setEligibleUsers(Array.isArray(res.users) ? res.users : []);
        setEligibleGroups(Array.isArray(res.groups) ? res.groups : []);
        return;
      }
      throw new Error('Unexpected response');
    } catch (err: any) {
      const fallback = buildLocalFallbackCandidates();
      setEligibleUsers(fallback.users);
      setEligibleGroups(fallback.groups);
      setLoadError(err?.message || null);
    } finally {
      setIsLoadingCandidates(false);
    }
  }, [buildLocalFallbackCandidates]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const privilegedUserCount = useMemo(
    () => eligibleUsers.filter((u) => u.hasApprovalPrivilege).length,
    [eligibleUsers]
  );
  const privilegedGroupCount = useMemo(
    () => eligibleGroups.filter((g) => g.hasApprovalPrivilege).length,
    [eligibleGroups]
  );

  const normalizeOrder = (list: ApprovalWorkflowStageConfig[]): ApprovalWorkflowStageConfig[] =>
    list.slice(0, 3).map((st, idx) => ({
      ...st,
      stageOrder: idx + 1,
    }));

  const createDefaultStage = (order: number): ApprovalWorkflowStageConfig => ({
    stageOrder: order,
    titleFa:
      order === 1
        ? 'تایید سرپرست عملیات شبکه'
        : order === 2
        ? 'تایید تیم امنیت و کنترل تغییرات'
        : 'تایید نهایی مدیر زیرساخت',
    titleEn:
      order === 1
        ? 'Network Operations Lead Approval'
        : order === 2
        ? 'Security & Change Review'
        : 'Final Infrastructure Executive Sign-Off',
    approverTargetType: 'any_approver',
    approverUserIds: [],
    approverGroupIds: [],
    approverLabels: [],
    ttlMinutes: order === 1 ? 60 : order === 2 ? 240 : 1440,
  });

  const handleAddStage = () => {
    if (stages.length >= 3) return;
    onChange(normalizeOrder([...stages, createDefaultStage(stages.length + 1)]));
  };

  const handleRemoveStage = (index: number) => {
    const next = stages.filter((_, idx) => idx !== index);
    onChange(normalizeOrder(next));
  };

  const handleMoveStage = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= stages.length) return;
    const copy = [...stages];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, moved);
    onChange(normalizeOrder(copy));
  };

  const updateStage = (index: number, patch: Partial<ApprovalWorkflowStageConfig>) => {
    const next = stages.map((st, idx) => (idx === index ? { ...st, ...patch } : st));
    onChange(normalizeOrder(next));
  };

  const applyPreset = (count: 1 | 2 | 3) => {
    const next: ApprovalWorkflowStageConfig[] = [];
    for (let i = 1; i <= count; i++) {
      next.push(createDefaultStage(i));
    }
    onChange(next);
  };

  const toggleCandidateSelection = (
    stageIndex: number,
    candidate: ApprovalEligibleCandidate,
    targetType: 'specific_users' | 'user_groups'
  ) => {
    const stage = stages[stageIndex];
    if (!stage) return;

    if (targetType === 'specific_users') {
      const currentIds = Array.isArray(stage.approverUserIds) ? [...stage.approverUserIds] : [];
      const exists = currentIds.some((id) => id.toLowerCase() === candidate.id.toLowerCase());
      const nextIds = exists
        ? currentIds.filter((id) => id.toLowerCase() !== candidate.id.toLowerCase())
        : [...currentIds, candidate.id];

      const currentLabels = Array.isArray(stage.approverLabels) ? [...stage.approverLabels] : [];
      const nextLabels: ApprovalWorkflowStageApproverRef[] = exists
        ? currentLabels.filter((l) => l.id.toLowerCase() !== candidate.id.toLowerCase())
        : [
            ...currentLabels,
            {
              id: candidate.id,
              name: candidate.displayName || candidate.name,
              username: candidate.username,
              type: candidate.type,
            },
          ];

      updateStage(stageIndex, {
        approverUserIds: nextIds,
        approverLabels: nextLabels,
      });
    } else {
      const currentIds = Array.isArray(stage.approverGroupIds) ? [...stage.approverGroupIds] : [];
      const exists = currentIds.some((id) => id.toLowerCase() === candidate.id.toLowerCase());
      const nextIds = exists
        ? currentIds.filter((id) => id.toLowerCase() !== candidate.id.toLowerCase())
        : [...currentIds, candidate.id];

      const currentLabels = Array.isArray(stage.approverLabels) ? [...stage.approverLabels] : [];
      const nextLabels: ApprovalWorkflowStageApproverRef[] = exists
        ? currentLabels.filter((l) => l.id.toLowerCase() !== candidate.id.toLowerCase())
        : [
            ...currentLabels,
            {
              id: candidate.id,
              name: candidate.displayName || candidate.name,
              type: candidate.type,
            },
          ];

      updateStage(stageIndex, {
        approverGroupIds: nextIds,
        approverLabels: nextLabels,
      });
    }
  };

  const isChainMissingWhileRequired = requireApprovalCount > 0 && stages.length === 0;

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Top Overview & Preset Bar */}
      <div
        className={`p-4 rounded-xl border space-y-3 ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-white/10'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div
              className={`p-2 rounded-lg border shrink-0 ${
                isLightMode
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
              }`}
            >
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h4 className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                  {isEn
                    ? 'Multi-Stage Approval Workflow Chain (1–3 Stages)'
                    : 'طراحی زنجیره تایید چندمرحله‌ای (۱ تا ۳ مرحله متوالی)'}
                </h4>
                <FieldInfoTooltip
                  title={isEn ? 'Approval Workflow Chain' : 'زنجیره تایید چندمرحله‌ای'}
                  whatIsIt={
                    isEn
                      ? 'Defines 1 to 3 sequential approval stages executed in strict order whenever an action marked "Require Approval" in this policy is triggered.'
                      : 'زنجیره‌ای متشکل از ۱ تا ۳ مرحله متوالی که هنگام اجرای هر اکشن با وضعیت «نیازمند تایید» در این پالیسی به ترتیب اجرا می‌شوند.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Enforces dual-control (4-eyes) or multi-tier CAB sign-off before high-risk changes like device deletion, power control, firewall rules, or Write Memory execute.'
                      : 'قبل از اجرای عملیات حساس (حذف تجهیز، خاموش‌کردن سرور، تغییر فایروال یا Write Memory)، تایید لایه‌های سرپرستی و امنیت را اجباری می‌کند.'
                  }
                  practicalExample={
                    isEn
                      ? 'Stage 1: NOC Lead (60m TTL) -> Stage 2: Security Team (240m TTL) -> Stage 3: Super Admin (1440m TTL).'
                      : 'مرحله ۱: سرپرست NOC (۶۰ دقیقه) ← مرحله ۲: تیم امنیت (۴ ساعت) ← مرحله ۳: مدیر ارشد زیرساخت (۲۴ ساعت).'
                  }
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <p
                className={`text-[11px] mt-0.5 tabular-nums ${
                  isLightMode ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                {isEn
                  ? `${requireApprovalCount} Require-Approval rule(s) · ${stages.length}/3 stage(s) configured · ${privilegedUserCount} eligible users · ${privilegedGroupCount} eligible groups`
                  : `${requireApprovalCount} اکشن نیازمند تایید · ${stages.length}/۳ مرحله تعریف‌شده · ${privilegedUserCount} کاربر تاییدکننده · ${privilegedGroupCount} گروه مجاز`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={loadCandidates}
              disabled={isLoadingCandidates}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-900'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white'
              }`}
              title={isEn ? 'Refresh eligible approvers from directory' : 'بروزرسانی فهرست تاییدکنندگان مجاز'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCandidates ? 'animate-spin' : ''}`} />
              <span>{isEn ? 'Refresh Approvers' : 'بروزرسانی تاییدکنندگان'}</span>
            </button>

            <button
              type="button"
              onClick={handleAddStage}
              disabled={stages.length >= 3}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>
                {isEn
                  ? `Add Stage (${stages.length}/3)`
                  : `افزودن مرحله (${stages.length}/۳)`}
              </span>
            </button>
          </div>
        </div>

        {/* Missing Workflow Chain Blocker Alert */}
        {isChainMissingWhileRequired && (
          <div
            className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isLightMode
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-amber-950/35 border-amber-500/40 text-amber-200'
            }`}
          >
            <div className="flex items-start gap-2.5 text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">
                  {isEn
                    ? `Approval Chain Required (${requireApprovalCount} action(s) set to "Require Approval")`
                    : `تعریف زنجیره تایید الزامی است (${requireApprovalCount} اکشن در وضعیت «نیازمند تایید» قرار دارد)`}
                </div>
                <p className="text-[11px] mt-0.5 opacity-90">
                  {isEn
                    ? 'A policy with Require-Approval actions cannot be saved without at least 1 sequential approval stage (1 to 3 stages).'
                    : 'تا زمانی که حداقل ۱ مرحله تایید (۱ تا ۳ مرحله) و تاییدکننده معتبر تعریف نشود، ذخیره پالیسی در سرور مسدود خواهد شد.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => applyPreset(1)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isEn ? 'Add Stage 1 Now' : 'افزودن سریع مرحله ۱'}</span>
            </button>
          </div>
        )}

        {/* Quick Multi-Stage Presets */}
        <div
          className={`pt-2.5 border-t flex items-center justify-between flex-wrap gap-2 ${
            isLightMode ? 'border-slate-200' : 'border-white/10'
          }`}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span className={isLightMode ? 'text-slate-700' : 'text-slate-300'}>
              {isEn ? 'Quick Chain Presets:' : 'الگوهای سریع زنجیره:'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {([
              { count: 1 as const, labelEn: '1 Stage · Single Sign-Off', labelFa: 'تک‌مرحله‌ای · تایید واحد' },
              { count: 2 as const, labelEn: '2 Stages · Lead → Admin', labelFa: 'دومرحله‌ای · سرپرست ← مدیر' },
              { count: 3 as const, labelEn: '3 Stages · Ops → SecOps → Exec', labelFa: 'سه‌مرحله‌ای · عملیات ← امنیت ← ارشد' },
            ]).map((preset) => (
              <button
                key={preset.count}
                type="button"
                onClick={() => applyPreset(preset.count)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                  stages.length === preset.count
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : isLightMode
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-900'
                    : 'bg-slate-900/70 hover:bg-white/10 border-white/10 text-slate-300'
                }`}
              >
                {isEn ? preset.labelEn : preset.labelFa}
              </button>
            ))}
          </div>
        </div>

        {loadError && (
          <div
            className={`p-2 rounded-lg border text-[11px] flex items-center gap-2 ${
              isLightMode
                ? 'bg-slate-100 border-slate-300 text-slate-700'
                : 'bg-slate-900 border-white/10 text-slate-300'
            }`}
          >
            <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>
              {isEn
                ? 'Using local directory snapshot for candidate preview; full validation runs on save.'
                : 'نمایش لیست تاییدکنندگان از حافظه محلی؛ اعتبارسنجی نهایی هنگام ذخیره روی سرور انجام می‌شود.'}
            </span>
          </div>
        )}
      </div>

      {/* Stages List (0..3) */}
      {stages.length === 0 ? (
        <div
          className={`p-8 rounded-xl border text-center space-y-2.5 ${
            isLightMode ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-950/50 border-white/10 text-slate-300'
          }`}
        >
          <ShieldCheck className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="text-xs font-bold">
            {isEn
              ? 'No Approval Workflow Stages Configured'
              : 'هنوز هیچ مرحله تاییدی برای این پالیسی تعریف نشده است'}
          </div>
          <p className={`text-[11px] max-w-lg mx-auto ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
            {isEn
              ? 'Add 1 to 3 sequential stages above if any server or network device action in this policy is configured as "Require Approval".'
              : 'در صورتی که اکشنی در بخش سرورها یا تجهیزات شبکه روی وضعیت «نیازمند تایید» تنظیم شده است، ۱ تا ۳ مرحله متوالی اضافه نمایید.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {stages.map((stage, stageIdx) => {
            const targetType: ApprovalStageApproverTargetType = stage.approverTargetType || 'any_approver';
            const searchQuery = (stageSearchQueries[stageIdx] || '').trim().toLowerCase();
            const candidatesPool = targetType === 'specific_users' ? eligibleUsers : eligibleGroups;
            const selectedIds =
              targetType === 'specific_users'
                ? stage.approverUserIds || []
                : targetType === 'user_groups'
                ? stage.approverGroupIds || []
                : [];
            const selectedIdSet = new Set(selectedIds.map((s) => s.toLowerCase()));

            const filteredPool = candidatesPool.filter((item) => {
              if (showOnlyPrivileged && !item.hasApprovalPrivilege && !selectedIdSet.has(item.id.toLowerCase())) {
                return false;
              }
              if (!searchQuery) return true;
              return (
                item.name?.toLowerCase().includes(searchQuery) ||
                item.displayName?.toLowerCase().includes(searchQuery) ||
                item.username?.toLowerCase().includes(searchQuery) ||
                item.role?.toLowerCase().includes(searchQuery) ||
                item.policyName?.toLowerCase().includes(searchQuery) ||
                item.id?.toLowerCase().includes(searchQuery)
              );
            });

            const missingSelection =
              (targetType === 'specific_users' && selectedIds.length === 0) ||
              (targetType === 'user_groups' && selectedIds.length === 0);

            return (
              <div
                key={`stage-${stageIdx}`}
                className={`p-4 rounded-xl border space-y-4 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/65 border-white/10'
                }`}
              >
                {/* Stage Header */}
                <div
                  className={`flex items-center justify-between gap-2 pb-3 border-b flex-wrap ${
                    isLightMode ? 'border-slate-200' : 'border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white text-xs font-mono font-bold tabular-nums flex items-center justify-center shrink-0">
                      {stageIdx + 1}
                    </span>
                    <div>
                      <div className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                        {isEn
                          ? `Stage ${stageIdx + 1} · ${(stage.titleEn || stage.titleFa || 'Untitled Stage').trim()}`
                          : `مرحله ${stageIdx + 1} · ${(stage.titleFa || stage.titleEn || 'مرحله بدون عنوان').trim()}`}
                      </div>
                      <div className={`text-[10px] tabular-nums ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isEn
                          ? `Order #${stageIdx + 1} of ${stages.length} · TTL ${stage.ttlMinutes || 60} min · Target: ${targetType}`
                          : `ترتیب ${stageIdx + 1} از ${stages.length} · مهلت ${stage.ttlMinutes || 60} دقیقه`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={stageIdx === 0}
                      onClick={() => handleMoveStage(stageIdx, -1)}
                      className={`p-1.5 rounded-lg border transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                        isLightMode
                          ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                      }`}
                      title={isEn ? 'Move Stage Up' : 'انتقال به مرحله قبل'}
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={stageIdx === stages.length - 1}
                      onClick={() => handleMoveStage(stageIdx, 1)}
                      className={`p-1.5 rounded-lg border transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                        isLightMode
                          ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                      }`}
                      title={isEn ? 'Move Stage Down' : 'انتقال به مرحله بعد'}
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveStage(stageIdx)}
                      className={`p-1.5 rounded-lg border transition cursor-pointer ${
                        isLightMode
                          ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                          : 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                      }`}
                      title={isEn ? 'Remove Stage' : 'حذف این مرحله'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Stage Titles & TTL Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label
                      className={`flex items-center text-[11px] font-semibold mb-1 ${
                        isLightMode ? 'text-slate-700' : 'text-slate-300'
                      }`}
                    >
                      <span>{isEn ? 'Stage Title (Persian)' : 'عنوان فارسی مرحله'}</span>
                      <FieldInfoTooltip
                        title={isEn ? 'Persian Stage Title' : 'عنوان فارسی مرحله'}
                        whatIsIt={
                          isEn
                            ? 'Human-readable Persian label shown in the Inbox and Audit Log for this approval step.'
                            : 'نام قابل فهم مرحله به زبان فارسی که در صندوق تایید و گزارش‌های ممیزی نمایش داده می‌شود.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Clarifies organizational sign-off responsibility for Persian-speaking reviewers.'
                            : 'مسئولیت سازمانی این مرحله را برای تاییدکنندگان مشخص می‌کند.'
                        }
                        example={isEn ? 'تایید سرپرست عملیات شبکه' : 'تایید سرپرست عملیات شبکه'}
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </label>
                    <input
                      type="text"
                      value={stage.titleFa || ''}
                      onChange={(e) => updateStage(stageIdx, { titleFa: e.target.value })}
                      placeholder={isEn ? 'e.g. Network Lead Sign-off (FA)' : 'مثلاً: تایید سرپرست عملیات شبکه'}
                      dir="rtl"
                      className={`w-full px-3 py-1.5 rounded-lg text-xs border outline-none transition ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500 focus:bg-white'
                          : 'bg-slate-900 border-white/15 text-white focus:border-indigo-400'
                      }`}
                    />
                  </div>

                  <div>
                    <label
                      className={`flex items-center text-[11px] font-semibold mb-1 ${
                        isLightMode ? 'text-slate-700' : 'text-slate-300'
                      }`}
                    >
                      <span>{isEn ? 'Stage Title (English)' : 'عنوان انگلیسی مرحله'}</span>
                      <FieldInfoTooltip
                        title={isEn ? 'English Stage Title' : 'عنوان انگلیسی مرحله'}
                        whatIsIt={
                          isEn
                            ? 'English stage title shown when the UI language is switched to English and recorded in structured approval logs.'
                            : 'عنوان انگلیسی مرحله برای نمایش در رابط کاربری انگلیسی و ثبت استاندارد در سوابق سیستمی.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Ensures full bilingual audit clarity with zero untranslated labels.'
                            : 'یکپارچگی دوزبانه گزارش‌ها و پیام‌های تایید را تضمین می‌کند.'
                        }
                        example="Network Operations Lead Approval"
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </label>
                    <input
                      type="text"
                      value={stage.titleEn || ''}
                      onChange={(e) => updateStage(stageIdx, { titleEn: e.target.value })}
                      placeholder="e.g. Security & Change Lead Approval"
                      dir="ltr"
                      className={`w-full px-3 py-1.5 rounded-lg text-xs border outline-none transition ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500 focus:bg-white'
                          : 'bg-slate-900 border-white/15 text-white focus:border-indigo-400'
                      }`}
                    />
                  </div>

                  <div>
                    <label
                      className={`flex items-center text-[11px] font-semibold mb-1 ${
                        isLightMode ? 'text-slate-700' : 'text-slate-300'
                      }`}
                    >
                      <span>{isEn ? 'Stage Expiration TTL (Minutes)' : 'مهلت انقضای مرحله (دقیقه)'}</span>
                      <FieldInfoTooltip
                        title={isEn ? 'Stage TTL (Minutes)' : 'مهلت انقضای مرحله (TTL)'}
                        whatIsIt={
                          isEn
                            ? 'Maximum time in minutes a pending approval request stays active at this stage before automatically expiring.'
                            : 'حداکثر مدت زمان مجاز (به دقیقه) برای پاسخ به درخواست در این مرحله پیش از منقضی شدن خودکار.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Prevents stale elevated-action requests from staying open indefinitely and being approved out of context.'
                            : 'از باز ماندن دائمی درخواست‌های حساس و تایید دیرهنگام بدون آگاهی جلوگیری می‌کند.'
                        }
                        example={isEn ? '60 minutes for emergency ops, 1440 for scheduled changes' : '۶۰ دقیقه برای عملیات فوری، ۱۴۴۰ دقیقه برای تغییرات زمان‌بندی‌شده'}
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </label>
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="number"
                          min={1}
                          max={43200}
                          value={stage.ttlMinutes ?? 60}
                          onChange={(e) =>
                            updateStage(stageIdx, {
                              ttlMinutes: Math.max(1, Math.min(43200, Number(e.target.value) || 60)),
                            })
                          }
                          dir="ltr"
                          className={`w-full pl-8 pr-2 py-1.5 rounded-lg text-xs font-mono tabular-nums border outline-none transition ${
                            isLightMode
                              ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500'
                              : 'bg-slate-900 border-white/15 text-white focus:border-indigo-400'
                          }`}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        {TTL_PRESETS.slice(0, 3).map((preset) => (
                          <button
                            key={preset.minutes}
                            type="button"
                            onClick={() => updateStage(stageIdx, { ttlMinutes: preset.minutes })}
                            className={`px-2 py-1.5 rounded-lg text-[10px] font-mono tabular-nums font-bold border transition cursor-pointer ${
                              Number(stage.ttlMinutes) === preset.minutes
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : isLightMode
                                ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                                : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                            }`}
                          >
                            {isEn ? preset.labelEn : preset.labelFa}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Approver Target Type Selector */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label
                      className={`flex items-center text-[11px] font-semibold ${
                        isLightMode ? 'text-slate-700' : 'text-slate-300'
                      }`}
                    >
                      <span>{isEn ? 'Eligible Approvers Target Mode' : 'نحوه تعیین تاییدکنندگان مجاز این مرحله'}</span>
                      <FieldInfoTooltip
                        title={isEn ? 'Stage Approver Target Mode' : 'حالت انتخاب تاییدکنندگان'}
                        whatIsIt={
                          isEn
                            ? 'Selects whether this stage is routed to specific users, specific local/AD security groups, or any active user holding approval authority.'
                            : 'تعیین می‌کند پیام تایید این مرحله به کاربران مشخص، گروه‌های کاربری/اکتیودایرکتوری مشخص یا هر کاربر دارای مجوز تایید ارسال شود.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Ensures only authorized, accountable reviewers receive and can act on requests at this stage.'
                            : 'تضمین می‌کند تنها افراد یا تیم‌های مسئول و دارای مجوز canApproveActions قادر به تایید یا رد درخواست باشند.'
                        }
                        example={isEn ? 'Stage 1: user_groups (NOC Leads) · Stage 2: specific_users (CISO)' : 'مرحله ۱: گروه‌های کاربری (تیم امنیت) · مرحله ۲: کاربران مشخص (مدیر ارشد)'}
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </label>

                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        {
                          type: 'specific_users' as const,
                          icon: UserCheck,
                          labelEn: 'Specific Users',
                          labelFa: 'کاربران مشخص',
                        },
                        {
                          type: 'user_groups' as const,
                          icon: Users,
                          labelEn: 'User Groups',
                          labelFa: 'گروه‌های کاربری',
                        },
                        {
                          type: 'any_approver' as const,
                          icon: ShieldCheck,
                          labelEn: 'Any Approver',
                          labelFa: 'هر تاییدکننده مجاز',
                        },
                      ]).map((opt) => {
                        const OptIcon = opt.icon;
                        const active = targetType === opt.type;
                        return (
                          <button
                            key={opt.type}
                            type="button"
                            onClick={() => updateStage(stageIdx, { approverTargetType: opt.type })}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                              active
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : isLightMode
                                ? 'bg-slate-100 border-slate-300 text-slate-900 hover:bg-slate-200'
                                : 'bg-slate-900/70 border-white/10 text-slate-300 hover:text-white'
                            }`}
                          >
                            <OptIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>{isEn ? opt.labelEn : opt.labelFa}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Approver Multi-Select Panel (for specific_users / user_groups) */}
                  {targetType !== 'any_approver' ? (
                    <div
                      className={`p-3 rounded-xl border space-y-2.5 ${
                        isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/55 border-white/10'
                      }`}
                    >
                      {/* Selected Chips */}
                      {selectedIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedIds.map((selId) => {
                            const matched = candidatesPool.find(
                              (c) =>
                                c.id.toLowerCase() === selId.toLowerCase() ||
                                (c.username && c.username.toLowerCase() === selId.toLowerCase())
                            );
                            const labelFromConfig = (stage.approverLabels || []).find(
                              (l) => l.id.toLowerCase() === selId.toLowerCase()
                            )?.name;
                            const label = matched?.displayName || labelFromConfig || selId;
                            const lacksRight = matched && !matched.hasApprovalPrivilege;

                            return (
                              <span
                                key={selId}
                                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold border ${
                                  lacksRight
                                    ? isLightMode
                                      ? 'bg-rose-50 border-rose-300 text-rose-800'
                                      : 'bg-rose-500/20 border-rose-500/40 text-rose-200'
                                    : isLightMode
                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                                    : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
                                }`}
                              >
                                <span>{label}</span>
                                {lacksRight && (
                                  <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleCandidateSelection(
                                      stageIdx,
                                      matched || {
                                        id: selId,
                                        name: label,
                                        displayName: label,
                                        type: targetType === 'specific_users' ? 'local_user' : 'local_group',
                                        hasApprovalPrivilege: false,
                                      },
                                      targetType
                                    )
                                  }
                                  className="hover:text-rose-500 cursor-pointer"
                                  title={isEn ? 'Remove' : 'حذف'}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {missingSelection && (
                        <div
                          className={`p-2 rounded-lg border text-[11px] flex items-center gap-2 ${
                            isLightMode
                              ? 'bg-amber-50 border-amber-300 text-amber-900'
                              : 'bg-amber-500/15 border-amber-500/35 text-amber-200'
                          }`}
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span>
                            {targetType === 'specific_users'
                              ? isEn
                                ? 'Select at least 1 eligible approver user below.'
                                : 'حداقل یک کاربر دارای مجوز تایید از فهرست زیر انتخاب نمایید.'
                              : isEn
                              ? 'Select at least 1 eligible approver group below.'
                              : 'حداقل یک گروه کاربری دارای مجوز تایید از فهرست زیر انتخاب نمایید.'}
                          </span>
                        </div>
                      )}

                      {/* Search & Privilege Filter Toolbar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={stageSearchQueries[stageIdx] || ''}
                            onChange={(e) =>
                              setStageSearchQueries((prev) => ({
                                ...prev,
                                [stageIdx]: e.target.value,
                              }))
                            }
                            placeholder={
                              targetType === 'specific_users'
                                ? isEn
                                  ? 'Search local or Active Directory users...'
                                  : 'جستجوی کاربران محلی یا اکتیو دایرکتوری...'
                                : isEn
                                ? 'Search local or Active Directory groups...'
                                : 'جستجوی گروه‌های محلی یا اکتیو دایرکتوری...'
                            }
                            className={`w-full pl-8 pr-3 py-1.5 rounded-lg text-xs border outline-none transition ${
                              isLightMode
                                ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                                : 'bg-slate-950 border-white/15 text-white focus:border-indigo-400'
                            }`}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowOnlyPrivileged((p) => !p)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer whitespace-nowrap ${
                            showOnlyPrivileged
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : isLightMode
                              ? 'bg-white border-slate-300 text-slate-900 hover:bg-slate-100'
                              : 'bg-white/5 border-white/10 text-slate-300'
                          }`}
                        >
                          {showOnlyPrivileged
                            ? isEn
                              ? 'Eligible Approvers Only'
                              : 'فقط دارای مجوز تایید'
                            : isEn
                            ? 'Showing All Directory'
                            : 'نمایش کل فهرست'}
                        </button>
                      </div>

                      {/* Candidate List */}
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {filteredPool.length === 0 ? (
                          <div className={`p-4 text-center text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn
                              ? 'No matching candidates found. Toggle filter or grant "Can Approve Actions" privilege in RBAC.'
                              : 'موردی یافت نشد. فیلتر را تغییر دهید یا در تب «صفحات و ابزارها» مجوز «تایید درخواست‌ها» را برای کاربر/گروه فعال کنید.'}
                          </div>
                        ) : (
                          filteredPool.map((candidate) => {
                            const isChecked = selectedIdSet.has(candidate.id.toLowerCase());
                            const isDisabled = !candidate.hasApprovalPrivilege && !isChecked;
                            return (
                              <button
                                key={`${candidate.type}:${candidate.id}`}
                                type="button"
                                disabled={isDisabled}
                                onClick={() => toggleCandidateSelection(stageIdx, candidate, targetType)}
                                className={`w-full flex items-center justify-between gap-2 p-2 rounded-lg border text-left rtl:text-right transition ${
                                  isDisabled
                                    ? isLightMode
                                      ? 'bg-slate-100/70 border-slate-200 text-slate-400 cursor-not-allowed opacity-70'
                                      : 'bg-slate-950/30 border-white/5 text-slate-500 cursor-not-allowed opacity-60'
                                    : isChecked
                                    ? isLightMode
                                      ? 'bg-indigo-50 border-indigo-300 text-indigo-950 cursor-pointer'
                                      : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-100 cursor-pointer'
                                    : isLightMode
                                    ? 'bg-white border-slate-200 text-slate-800 hover:bg-slate-100 cursor-pointer'
                                    : 'bg-slate-950/60 border-white/10 text-slate-200 hover:bg-white/10 cursor-pointer'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                      isChecked
                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                        : isLightMode
                                        ? 'border-slate-300 bg-white'
                                        : 'border-white/20 bg-slate-900'
                                    }`}
                                  >
                                    {isChecked && <Check className="w-3 h-3" />}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold truncate">{candidate.displayName}</div>
                                    <div className={`text-[10px] truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                      {(candidate.type === 'ad_user' || candidate.type === 'ad_group'
                                        ? 'Active Directory'
                                        : isEn
                                        ? 'Local'
                                        : 'محلی') +
                                        (candidate.policyName ? ` · ${candidate.policyName}` : candidate.role ? ` · ${candidate.role}` : '')}
                                    </div>
                                  </div>
                                </div>

                                <span
                                  className={`text-[10px] font-mono font-semibold shrink-0 ${
                                    candidate.hasApprovalPrivilege
                                      ? isLightMode
                                        ? 'text-emerald-700'
                                        : 'text-emerald-400'
                                      : isLightMode
                                      ? 'text-rose-700'
                                      : 'text-rose-400'
                                  }`}
                                >
                                  {candidate.hasApprovalPrivilege
                                    ? candidate.isSuperAdmin
                                      ? isEn
                                        ? 'Super Admin'
                                        : 'مدیر ارشد'
                                      : isEn
                                      ? 'Eligible'
                                      : 'مجاز'
                                    : isEn
                                    ? 'No Approval Right'
                                    : 'فاقد مجوز تایید'}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 flex-wrap ${
                        privilegedUserCount > 0
                          ? isLightMode
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                          : isLightMode
                          ? 'bg-rose-50 border-rose-200 text-rose-900'
                          : 'bg-rose-500/15 border-rose-500/35 text-rose-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>
                          {isEn
                            ? 'Any active user with "Can Approve Actions" or Super Admin authority (excluding the requester) can review this stage.'
                            : 'هر کاربر فعال دارای مجوز «تایید درخواست‌ها» یا مدیر ارشد (به جز درخواست‌کننده) می‌تواند این مرحله را تایید کند.'}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono font-bold tabular-nums">
                        {isEn
                          ? `${privilegedUserCount} active approver(s)`
                          : `${privilegedUserCount} تاییدکننده فعال`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
