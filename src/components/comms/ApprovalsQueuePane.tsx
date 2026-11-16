import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  User,
  XCircle,
} from 'lucide-react';
import {
  ActionApprovalRequest,
  ApprovalQueueSummary,
  ApprovalRequestStatus,
  ApprovalRiskLevel,
  ApprovalTargetEntityType,
  ApprovalTargetOption,
} from '../../types';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { useModalDock } from '../../context/ModalDockContext';
import { isUserSuperAdmin } from '../../utils/rbac';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import {
  cancelApprovalRequestApi,
  decideApprovalRequestApi,
  fetchApprovalRequests,
  fetchApprovalTargets,
  markApprovalExecutedApi,
  submitApprovalRequest,
} from '../../services/approvalApi';
import { ActiveTab } from '../Sidebar';

interface ApprovalsQueuePaneProps {
  isLightMode?: boolean;
  liveRevision?: number;
  initialFocusApprovalId?: string | null;
  onNavigateToTab?: (tab: ActiveTab) => void;
  onSummaryChange?: (summary: ApprovalQueueSummary) => void;
}

const REQUEST_MODAL_ID = 'comms-new-approval-request-modal';

const DEFAULT_SUMMARY: ApprovalQueueSummary = {
  pending: 0,
  approved: 0,
  rejected: 0,
  expired: 0,
  executed: 0,
  cancelled: 0,
  myPendingRequests: 0,
};

function formatRemainingWindow(expiresAtIso: string, isEn: boolean): string {
  const diffMs = Date.parse(expiresAtIso) - Date.now();
  if (diffMs <= 0) return isEn ? 'Expired' : 'منقضی‌شده';
  const totalMin = Math.floor(diffMs / 60_000);
  if (totalMin < 60) {
    return isEn ? `${totalMin}m left` : `${totalMin} دقیقه باقی‌مانده`;
  }
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return isEn ? `${hrs}h ${mins}m left` : `${hrs} ساعت و ${mins} دقیقه باقی‌مانده`;
}

export const ApprovalsQueuePane: React.FC<ApprovalsQueuePaneProps> = ({
  isLightMode = false,
  liveRevision = 0,
  initialFocusApprovalId = null,
  onNavigateToTab,
  onSummaryChange,
}) => {
  const { isEn, isRtl } = useLanguage();
  const { user, effectivePolicy } = useAuth();
  const { dockModal, undockModal } = useModalDock();

  const isSuperAdmin = isUserSuperAdmin(user, effectivePolicy);
  const canApprove = isSuperAdmin || Boolean(effectivePolicy?.canApproveActions);

  const [statusFilter, setStatusFilter] = useState<'all' | ApprovalRequestStatus>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'mine'>(canApprove ? 'all' : 'mine');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [items, setItems] = useState<ActionApprovalRequest[]>([]);
  const [summary, setSummary] = useState<ApprovalQueueSummary>(DEFAULT_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const [selectedId, setSelectedId] = useState<string | null>(initialFocusApprovalId);
  const [decisionNote, setDecisionNote] = useState('');
  const [executionNote, setExecutionNote] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  // New Approval / JIT Request Modal
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newModalMaximized, setNewModalMaximized] = useState(false);
  const [targets, setTargets] = useState<ApprovalTargetOption[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);

  const [reqTargetType, setReqTargetType] = useState<ApprovalTargetEntityType>('device');
  const [reqTargetId, setReqTargetId] = useState('');
  const [reqTargetCustomName, setReqTargetCustomName] = useState('');
  const [reqAction, setReqAction] = useState('');
  const [reqRisk, setReqRisk] = useState<ApprovalRiskLevel>('high');
  const [reqTtlMinutes, setReqTtlMinutes] = useState<number>(60);
  const [reqReason, setReqReason] = useState('');
  const [reqCommands, setReqCommands] = useState('');
  const [submittingNew, setSubmittingNew] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 220);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (initialFocusApprovalId) {
      setSelectedId(initialFocusApprovalId);
    }
  }, [initialFocusApprovalId]);

  const loadApprovals = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) setRefreshing(true);
      else if (items.length === 0) setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetchApprovalRequests({
          status: statusFilter,
          scope: canApprove ? scopeFilter : 'mine',
          q: debouncedQuery,
          forceRefresh,
        });
        setItems(res.items || []);
        const nextSummary = res.summary || DEFAULT_SUMMARY;
        setSummary(nextSummary);
        onSummaryChange?.(nextSummary);
        setSelectedId((prev) => {
          if (prev && (res.items || []).some((x) => x.id === prev)) return prev;
          return res.items?.[0]?.id || null;
        });
      } catch (err: any) {
        setErrorMsg(
          err?.message ||
            (isEn ? 'Failed to load approval queue' : 'خطا در بارگذاری صف تاییدیه‌ها')
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [statusFilter, scopeFilter, debouncedQuery, canApprove, isEn, onSummaryChange]
  );

  useEffect(() => {
    loadApprovals(liveRevision > 0);
  }, [statusFilter, scopeFilter, debouncedQuery, liveRevision]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) || null,
    [items, selectedId]
  );

  useEffect(() => {
    setDecisionNote('');
    setExecutionNote('');
    setFeedbackMsg(null);
  }, [selectedId]);

  const openNewRequestModal = async () => {
    undockModal(REQUEST_MODAL_ID);
    setModalError(null);
    setNewModalOpen(true);
    if (targets.length === 0) {
      setTargetsLoading(true);
      try {
        const list = await fetchApprovalTargets();
        setTargets(list);
        const firstDevice = list.find((t) => t.entityType === reqTargetType);
        if (firstDevice) setReqTargetId(firstDevice.id);
      } catch {}
      setTargetsLoading(false);
    }
  };

  const handleMinimizeNewModal = () => {
    setNewModalOpen(false);
    dockModal({
      id: REQUEST_MODAL_ID,
      labelEn: 'New Approval Request',
      labelFa: 'ثبت درخواست تایید',
      category: 'system',
      onRestore: () => setNewModalOpen(true),
      onClose: () => setNewModalOpen(false),
    });
  };

  const handleCloseNewModal = () => {
    setNewModalOpen(false);
    undockModal(REQUEST_MODAL_ID);
  };

  const filteredTargets = useMemo(
    () =>
      targets.filter((t) =>
        reqTargetType === 'device' || reqTargetType === 'bulk_config' || reqTargetType === 'firewall'
          ? t.entityType === 'device'
          : reqTargetType === 'server'
          ? t.entityType === 'server'
          : false
      ),
    [targets, reqTargetType]
  );

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    const chosen = targets.find((t) => t.id === reqTargetId);
    const resolvedId = reqTargetId.trim() || reqTargetCustomName.trim() || reqTargetType;
    const resolvedName =
      chosen?.name || reqTargetCustomName.trim() || resolvedId;

    if (!reqAction.trim() || !reqReason.trim()) {
      setModalError(
        isEn
          ? 'Action title and change justification are required.'
          : 'عنوان عملیات درخواستی و دلیل/توجیه فنی تغییر الزامی است.'
      );
      return;
    }

    setSubmittingNew(true);
    try {
      const created = await submitApprovalRequest({
        targetEntityType: reqTargetType,
        targetEntityId: resolvedId,
        targetEntityName: resolvedName,
        requestedAction: reqAction.trim(),
        riskLevel: reqRisk,
        reason: reqReason.trim(),
        commandPreview: reqCommands.trim() || undefined,
        ttlMinutes: reqTtlMinutes,
      });
      setReqAction('');
      setReqReason('');
      setReqCommands('');
      setReqTargetCustomName('');
      setNewModalOpen(false);
      undockModal(REQUEST_MODAL_ID);
      setSelectedId(created.id);
      setFeedbackMsg({
        type: 'success',
        text: isEn
          ? 'Approval request submitted and dispatched to IT managers.'
          : 'درخواست تایید ثبت شد و به‌صورت زنده برای تاییدکنندگان ارسال گردید.',
      });
      await loadApprovals(true);
    } catch (err: any) {
      setModalError(
        err?.message || (isEn ? 'Failed to submit approval request' : 'ثبت درخواست ناموفق بود')
      );
    } finally {
      setSubmittingNew(false);
    }
  };

  const handleDecide = async (decision: 'approved' | 'rejected') => {
    if (!selectedItem || actionBusy) return;
    setActionBusy(true);
    setFeedbackMsg(null);
    try {
      const updated = await decideApprovalRequestApi(
        selectedItem.id,
        decision,
        decisionNote.trim() || undefined
      );
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setFeedbackMsg({
        type: 'success',
        text:
          decision === 'approved'
            ? isEn
              ? 'Change request approved cleanly and audit logged.'
              : 'درخواست تغییر تایید شد و در ممیزی امنیتی ثبت گردید.'
            : isEn
            ? 'Change request rejected cleanly and requester notified.'
            : 'درخواست رد شد و به درخواست‌کننده اطلاع‌رسانی گردید.',
      });
      await loadApprovals(true);
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err?.message || (isEn ? 'Decision failed' : 'ثبت تصمیم با خطا مواجه شد'),
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleMarkExecuted = async () => {
    if (!selectedItem || actionBusy) return;
    setActionBusy(true);
    setFeedbackMsg(null);
    try {
      const updated = await markApprovalExecutedApi(
        selectedItem.id,
        executionNote.trim() || undefined
      );
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setFeedbackMsg({
        type: 'success',
        text: isEn
          ? 'Execution logged and JIT ticket sealed.'
          : 'گزارش اجرای عملیات ثبت و تیکت تایید بسته شد.',
      });
      await loadApprovals(true);
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err?.message || (isEn ? 'Failed to record execution' : 'ثبت اجرا ناموفق بود'),
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedItem || actionBusy) return;
    setActionBusy(true);
    setFeedbackMsg(null);
    try {
      const updated = await cancelApprovalRequestApi(selectedItem.id);
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setFeedbackMsg({
        type: 'success',
        text: isEn ? 'Request cancelled.' : 'درخواست با موفقیت لغو شد.',
      });
      await loadApprovals(true);
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err?.message || (isEn ? 'Cancel failed' : 'لغو درخواست ناموفق بود'),
      });
    } finally {
      setActionBusy(false);
    }
  };

  const getStatusMeta = (st: ApprovalRequestStatus) => {
    switch (st) {
      case 'approved':
        return {
          icon: CheckCircle2,
          labelEn: 'Approved (Active JIT)',
          labelFa: 'تایید شده (آماده اجرا)',
          textClass: isLightMode ? 'text-emerald-700' : 'text-emerald-400',
        };
      case 'executed':
        return {
          icon: Check,
          labelEn: 'Executed',
          labelFa: 'اجرا شده',
          textClass: isLightMode ? 'text-indigo-700' : 'text-indigo-400',
        };
      case 'rejected':
        return {
          icon: XCircle,
          labelEn: 'Rejected',
          labelFa: 'رد شده',
          textClass: isLightMode ? 'text-rose-700' : 'text-rose-400',
        };
      case 'expired':
        return {
          icon: Clock,
          labelEn: 'Expired',
          labelFa: 'منقضی شده',
          textClass: isLightMode ? 'text-slate-600' : 'text-slate-400',
        };
      case 'cancelled':
        return {
          icon: Ban,
          labelEn: 'Cancelled',
          labelFa: 'لغو شده',
          textClass: isLightMode ? 'text-slate-500' : 'text-slate-400',
        };
      case 'pending':
      default:
        return {
          icon: AlertTriangle,
          labelEn: 'Pending Approval',
          labelFa: 'در انتظار تایید',
          textClass: isLightMode ? 'text-amber-700' : 'text-amber-400',
        };
    }
  };

  const getRiskMeta = (risk: ApprovalRiskLevel) => {
    if (risk === 'critical') {
      return {
        labelEn: 'Critical Risk',
        labelFa: 'ریسک بحرانی',
        cls: isLightMode ? 'text-rose-700' : 'text-rose-400',
      };
    }
    if (risk === 'medium') {
      return {
        labelEn: 'Medium Risk',
        labelFa: 'ریسک متوسط',
        cls: isLightMode ? 'text-cyan-700' : 'text-cyan-400',
      };
    }
    return {
      labelEn: 'High Risk',
      labelFa: 'ریسک بالا',
      cls: isLightMode ? 'text-amber-700' : 'text-amber-400',
    };
  };

  const surfaceCls = isLightMode
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-slate-900/70 border-white/10 text-slate-100';

  const inputCls = isLightMode
    ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white'
    : 'bg-slate-950/60 border-white/15 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500';

  const isOwnRequest = (item: ActionApprovalRequest) => {
    const u = (user?.username || '').trim().toLowerCase();
    return (
      (item.requesterUsername || '').trim().toLowerCase() === u ||
      (item.requesterUserId || '').trim().toLowerCase() === (user?.id || '').trim().toLowerCase()
    );
  };

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      {/* Top Toolbar & Summary Strip */}
      <div className={`rounded-2xl border p-4 flex flex-col gap-4 ${surfaceCls}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold truncate">
                  {isEn
                    ? 'Two-Step Approval & Change Authorization Queue'
                    : 'صف تایید دو مرحله‌ای عملیات حساس و تغییرات شبکه'}
                </h3>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  title={isEn ? 'Four-Eyes Governance' : 'کنترل دو مرحله‌ای (Four-Eyes)'}
                  infoWhatEn="Central encrypted approval workflow for high-risk network CLI changes, server interventions, and privileged updates."
                  infoWhatFa="جریان تایید متمرکز و رمزنگاری‌شده برای دستورات پرریسک شبکه، سرورها و تغییرات حساس امنیتی پیش از اجرا."
                  infoWhyEn="Prevents accidental production outages and creates a verifiable audit trail linking requester, commands, approver, and execution."
                  infoWhyFa="از اعمال تغییرات ناخواسته در محیط عملیاتی جلوگیری کرده و زنجیره ممیزی کامل میان درخواست‌کننده، تاییدکننده و زمان اجرا ثبت می‌کند."
                  infoExampleEn="Operator submits template change -> IT Manager approves for 60 min -> Operator executes and seals ticket."
                  infoExampleFa="کارشناس درخواست تغییر را ثبت می‌کند -> مدیر IT برای ۶۰ دقیقه تایید می‌کند -> کارشناس اجرا و تیکت را می‌بندد."
                />
              </div>
              <div
                className={`text-xs mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums ${
                  isLightMode ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                <span>
                  {isEn ? `Pending: ${summary.pending}` : `در انتظار تایید: ${summary.pending}`}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {isEn ? `Approved: ${summary.approved}` : `تایید شده: ${summary.approved}`}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {isEn ? `Executed: ${summary.executed}` : `اجرا شده: ${summary.executed}`}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {isEn ? `Rejected/Expired: ${summary.rejected + summary.expired}` : `رد یا منقضی: ${summary.rejected + summary.expired}`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2 shrink-0">
            <div className="relative w-48 sm:w-56">
              <Search
                className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 ${
                  isRtl ? 'right-3' : 'left-3'
                } text-slate-400`}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isEn ? 'Search requests...' : 'جستجو در عنوان یا تجهیز...'}
                className={`w-full py-1.5 rounded-lg border text-xs outline-none ${
                  isRtl ? 'pr-8 pl-3' : 'pl-8 pr-3'
                } ${inputCls}`}
              />
            </div>

            <button
              type="button"
              onClick={() => loadApprovals(true)}
              disabled={refreshing}
              className={`p-2 rounded-lg border text-xs cursor-pointer transition ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-300'
              }`}
              title={isEn ? 'Refresh' : 'تازه‌سازی'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={openNewRequestModal}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold whitespace-nowrap cursor-pointer transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isEn ? 'New Approval Request' : 'ثبت درخواست تایید'}</span>
            </button>
          </div>
        </div>

        {/* Status Filter Segmented Controls + Scope Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-200/70 dark:border-white/10">
          <div className="flex items-center gap-1 flex-wrap">
            {(
              [
                { id: 'all', labelEn: 'All', labelFa: 'همه' },
                { id: 'pending', labelEn: `Pending (${summary.pending})`, labelFa: `در انتظار (${summary.pending})` },
                { id: 'approved', labelEn: `Approved (${summary.approved})`, labelFa: `تایید شده (${summary.approved})` },
                { id: 'executed', labelEn: `Executed (${summary.executed})`, labelFa: `اجرا شده (${summary.executed})` },
                { id: 'rejected', labelEn: 'Rejected', labelFa: 'رد شده' },
                { id: 'expired', labelEn: 'Expired', labelFa: 'منقضی' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition ${
                  statusFilter === f.id
                    ? isLightMode
                      ? 'bg-slate-900 text-white'
                      : 'bg-indigo-600 text-white'
                    : isLightMode
                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {isEn ? f.labelEn : f.labelFa}
              </button>
            ))}
          </div>

          {canApprove && (
            <div className="flex items-center gap-1 p-1 rounded-lg border border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setScopeFilter('all')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                  scopeFilter === 'all'
                    ? 'bg-indigo-600 text-white'
                    : isLightMode
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {isEn ? 'All Organization' : 'کل سازمان'}
              </button>
              <button
                type="button"
                onClick={() => setScopeFilter('mine')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                  scopeFilter === 'mine'
                    ? 'bg-indigo-600 text-white'
                    : isLightMode
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {isEn ? 'Submitted by Me' : 'درخواست‌های من'}
              </button>
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => loadApprovals(true)}
            className="underline font-semibold cursor-pointer"
          >
            {isEn ? 'Retry' : 'تلاش مجدد'}
          </button>
        </div>
      )}

      {/* Main Master-Detail Grid */}
      <div className={`flex-1 grid grid-cols-1 lg:grid-cols-12 rounded-2xl border overflow-hidden min-h-[460px] ${surfaceCls}`}>
        {/* Left List */}
        <div
          className={`lg:col-span-5 border-b lg:border-b-0 ${
            isRtl ? 'lg:border-l' : 'lg:border-r'
          } border-slate-200 dark:border-white/10 flex flex-col min-h-[280px]`}
        >
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-slate-200/70 dark:bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <ShieldCheck className={`w-10 h-10 mb-3 ${isLightMode ? 'text-slate-300' : 'text-slate-600'}`} />
              <h4 className="text-sm font-bold mb-1">
                {isEn ? 'No approval requests found' : 'درخواست تاییدی یافت نشد'}
              </h4>
              <p className={`text-xs max-w-xs mb-4 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Submit a two-step change approval request when preparing high-risk router, firewall, or server actions.'
                  : 'برای عملیات حساس روی تجهیزات شبکه یا سرورها می‌توانید درخواست تایید دو مرحله‌ای ثبت کنید.'}
              </p>
              <button
                type="button"
                onClick={openNewRequestModal}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
              >
                {isEn ? 'Submit First Request' : 'ثبت اولین درخواست'}
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-white/5">
              {items.map((item) => {
                const st = getStatusMeta(item.status);
                const StIcon = st.icon;
                const risk = getRiskMeta(item.riskLevel);
                const active = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full text-start p-3.5 transition cursor-pointer flex flex-col gap-1.5 ${
                      active
                        ? isLightMode
                          ? 'bg-indigo-50/90'
                          : 'bg-indigo-500/15'
                        : isLightMode
                        ? 'hover:bg-slate-50'
                        : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold truncate">{item.requestedAction}</span>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold shrink-0 ${st.textClass}`}>
                        <StIcon className="w-3.5 h-3.5" />
                        <span>{isEn ? st.labelEn : st.labelFa}</span>
                      </span>
                    </div>

                    <div className={`text-[11px] truncate ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                      {item.targetEntityName || item.targetEntityId}
                      {' · '}
                      <span className={risk.cls}>{isEn ? risk.labelEn : risk.labelFa}</span>
                    </div>

                    <div
                      className={`flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums ${
                        isLightMode ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      <span className="truncate">
                        {item.requesterUsername} · {new Date(item.createdAt).toLocaleDateString(isEn ? 'en-US' : 'fa-IR')}
                      </span>
                      {item.status === 'pending' || item.status === 'approved' ? (
                        <span>{formatRemainingWindow(item.expiresAt, isEn)}</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Detail Inspection & Decision Pane */}
        <div className="lg:col-span-7 flex flex-col p-5 overflow-y-auto custom-scrollbar">
          {!selectedItem ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <Terminal className={`w-9 h-9 mb-2.5 ${isLightMode ? 'text-slate-300' : 'text-slate-600'}`} />
              <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Select an approval request to inspect commands, audit context, and submit a decision.'
                  : 'یک درخواست را از فهرست انتخاب کنید تا جزئیات دستورات، دلیل فنی و گزینه‌های تایید/رد نمایش داده شود.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {feedbackMsg && (
                <div
                  className={`p-3 rounded-xl border text-xs font-medium ${
                    feedbackMsg.type === 'success'
                      ? isLightMode
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : isLightMode
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {feedbackMsg.text}
                </div>
              )}

              {/* Header */}
              <div className="pb-4 border-b border-slate-200 dark:border-white/10 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h4 className="text-base font-bold">{selectedItem.requestedAction}</h4>
                    <div
                      className={`text-xs mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono tabular-nums ${
                        isLightMode ? 'text-slate-600' : 'text-slate-400'
                      }`}
                    >
                      <span>ID: {selectedItem.id}</span>
                      <span aria-hidden="true">·</span>
                      <span className={getRiskMeta(selectedItem.riskLevel).cls}>
                        {isEn
                          ? getRiskMeta(selectedItem.riskLevel).labelEn
                          : getRiskMeta(selectedItem.riskLevel).labelFa}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {selectedItem.targetEntityType}:{' '}
                        <strong className={isLightMode ? 'text-slate-900' : 'text-white'}>
                          {selectedItem.targetEntityName || selectedItem.targetEntityId}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {(() => {
                    const st = getStatusMeta(selectedItem.status);
                    const StIcon = st.icon;
                    return (
                      <div className={`flex items-center gap-1.5 text-xs font-bold ${st.textClass}`}>
                        <StIcon className="w-4 h-4" />
                        <span>{isEn ? st.labelEn : st.labelFa}</span>
                      </div>
                    );
                  })()}
                </div>

                <div
                  className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${
                    isLightMode ? 'text-slate-600' : 'text-slate-400'
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    <span>
                      {isEn ? 'Requester:' : 'درخواست‌کننده:'}{' '}
                      <strong className={isLightMode ? 'text-slate-900' : 'text-white'}>
                        {selectedItem.requesterFullName || selectedItem.requesterUsername}
                      </strong>
                    </span>
                  </span>
                  <span className="font-mono tabular-nums">
                    {isEn ? 'Created:' : 'زمان ثبت:'}{' '}
                    {new Date(selectedItem.createdAt).toLocaleString(isEn ? 'en-US' : 'fa-IR')}
                  </span>
                  <span className="font-mono tabular-nums">
                    {isEn ? 'Expires:' : 'انقضا:'}{' '}
                    {new Date(selectedItem.expiresAt).toLocaleString(isEn ? 'en-US' : 'fa-IR')}
                  </span>
                </div>
              </div>

              {/* Reason / Justification */}
              <div className="space-y-1.5">
                <div className="text-xs font-bold">
                  {isEn ? 'Operational Justification' : 'توجیه فنی و علت درخواست'}
                </div>
                <p
                  className={`p-3.5 rounded-xl border text-xs leading-relaxed whitespace-pre-wrap ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-800'
                      : 'bg-slate-950/50 border-white/10 text-slate-200'
                  }`}
                >
                  {selectedItem.reason}
                </p>
              </div>

              {/* Encrypted-at-Rest Command Preview */}
              {selectedItem.commandPreview && (
                <div className="space-y-1.5">
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-cyan-500" />
                    <span>
                      {isEn ? 'Planned Commands / Change Payload (AES-256-GCM Encrypted)' : 'فرامین و جزییات تغییر (رمزنگاری‌شده AES-256-GCM)'}
                    </span>
                  </div>
                  <pre
                    className={`p-3.5 rounded-xl border text-xs font-mono overflow-x-auto whitespace-pre-wrap ${
                      isLightMode
                        ? 'bg-slate-900 border-slate-800 text-emerald-300'
                        : 'bg-black/60 border-white/10 text-emerald-300'
                    }`}
                    dir="ltr"
                  >
                    {selectedItem.commandPreview}
                  </pre>
                </div>
              )}

              {/* Decision & Execution Record if decided */}
              {selectedItem.approverUsername && (
                <div
                  className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-700'
                      : 'bg-white/5 border-white/10 text-slate-300'
                  }`}
                >
                  <div>
                    <strong>{isEn ? 'Reviewed by:' : 'بررسی توسط:'}</strong>{' '}
                    {selectedItem.approverUsername}
                    {selectedItem.decidedAt && (
                      <span className="font-mono tabular-nums opacity-80">
                        {' · '}
                        {new Date(selectedItem.decidedAt).toLocaleString(isEn ? 'en-US' : 'fa-IR')}
                      </span>
                    )}
                  </div>
                  {selectedItem.decisionNote && (
                    <div>
                      <strong>{isEn ? 'Manager Note:' : 'یادداشت تاییدکننده:'}</strong>{' '}
                      {selectedItem.decisionNote}
                    </div>
                  )}
                  {selectedItem.executedAt && (
                    <div className="font-mono tabular-nums">
                      <strong>{isEn ? 'Executed:' : 'زمان اجرا:'}</strong>{' '}
                      {new Date(selectedItem.executedAt).toLocaleString(isEn ? 'en-US' : 'fa-IR')}
                      {selectedItem.executedBy ? ` (${selectedItem.executedBy})` : ''}
                      {selectedItem.executionNote ? ` — ${selectedItem.executionNote}` : ''}
                    </div>
                  )}
                </div>
              )}

              {/* Manager Approval Actions (When Pending) */}
              {selectedItem.status === 'pending' && canApprove && (
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-slate-950/40 border-white/10'
                  }`}
                >
                  <label className="block text-xs font-bold">
                    {isEn ? 'Approver Decision Note (Optional)' : 'توضیحات یا شرط مدیر برای تایید/رد (اختیاری)'}
                  </label>
                  <input
                    type="text"
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    placeholder={
                      isEn
                        ? 'e.g. Verified maintenance window; keep console rollback open'
                        : 'مثلاً: پنجره تعمیراتی تایید شد؛ پس از اجرا خروجی بررسی شود'
                    }
                    className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                  />
                  <div className="flex items-center flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => handleDecide('approved')}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Approve Request' : 'تایید و صدور مجوز'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => handleDecide('rejected')}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Reject Request' : 'رد درخواست'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Execute / Close JIT Window (When Approved) */}
              {selectedItem.status === 'approved' && (
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    isLightMode
                      ? 'bg-emerald-50/70 border-emerald-200'
                      : 'bg-emerald-950/20 border-emerald-500/30'
                  }`}
                >
                  <div className="text-xs font-bold">
                    {isEn
                      ? 'Approved Execution Window — Complete Action & Seal Ticket'
                      : 'مجوز صادر شد — ثبت گزارش اجرا و بستن تیکت'}
                  </div>
                  <input
                    type="text"
                    value={executionNote}
                    onChange={(e) => setExecutionNote(e.target.value)}
                    placeholder={
                      isEn
                        ? 'Execution result / verification summary (optional)'
                        : 'خلاصه نتیجه اجرا و بررسی نهایی (اختیاری)'
                    }
                    className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                  />
                  <div className="flex items-center flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={handleMarkExecuted}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Confirm Execution Complete' : 'ثبت اتمام اجرا'}</span>
                    </button>

                    {onNavigateToTab &&
                      (selectedItem.targetEntityType === 'device' ||
                        selectedItem.targetEntityType === 'server' ||
                        selectedItem.targetEntityType === 'bulk_config') && (
                        <button
                          type="button"
                          onClick={() =>
                            onNavigateToTab(
                              selectedItem.targetEntityType === 'server'
                                ? 'remote-servers'
                                : 'devices'
                            )
                          }
                          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                              : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                          }`}
                        >
                          <Server className="w-3.5 h-3.5" />
                          <span>
                            {selectedItem.targetEntityType === 'server'
                              ? isEn
                                ? 'Open Remote Servers'
                                : 'رفتن به سرورهای ریموت'
                              : isEn
                              ? 'Open Devices Inventory'
                              : 'رفتن به تجهیزات شبکه'}
                          </span>
                        </button>
                      )}
                  </div>
                </div>
              )}

              {/* Requester Cancel Action */}
              {selectedItem.status === 'pending' && (isOwnRequest(selectedItem) || isSuperAdmin) && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={handleCancel}
                    className={`px-3.5 py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                        : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-300'
                    }`}
                  >
                    {isEn ? 'Cancel Pending Request' : 'لغو درخواست'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* NEW APPROVAL REQUEST MODAL (MODAL_GUIDELINES.md Compliant) */}
      {newModalOpen &&
        createPortal(
          <div className="fixed top-0 left-0 right-0 bottom-8 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <form
              onSubmit={handleCreateSubmit}
              className={`border rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
                newModalMaximized
                  ? 'w-full h-full max-w-none max-h-none'
                  : 'w-full max-w-2xl max-h-[90vh]'
              } ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-900'
                  : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              <div
                className={`px-5 py-3.5 border-b flex items-center justify-between gap-2 shrink-0 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-sm font-bold truncate">
                    {isEn
                      ? 'Submit Two-Step Change Approval Request'
                      : 'ثبت درخواست تایید دو مرحله‌ای عملیات حساس'}
                  </span>
                </div>
                <ModalHeaderControls
                  isEn={isEn}
                  isLightMode={isLightMode}
                  isMaximized={newModalMaximized}
                  onMaximizeToggle={() => setNewModalMaximized((p) => !p)}
                  onMinimize={handleMinimizeNewModal}
                  onClose={handleCloseNewModal}
                />
              </div>

              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                {modalError && (
                  <div
                    className={`p-3 rounded-xl border text-xs ${
                      isLightMode
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {modalError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">
                      {isEn ? 'Target Scope / Domain' : 'حوزه عملیات'}
                    </label>
                    <select
                      value={reqTargetType}
                      onChange={(e) => {
                        const next = e.target.value as ApprovalTargetEntityType;
                        setReqTargetType(next);
                        const match = targets.find((t) =>
                          next === 'server' ? t.entityType === 'server' : t.entityType === 'device'
                        );
                        setReqTargetId(match?.id || '');
                      }}
                      className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${inputCls}`}
                    >
                      <option value="device">{isEn ? 'Network Device (Switch/Router)' : 'تجهیز شبکه (سوئیچ / روتر)'}</option>
                      <option value="server">{isEn ? 'Remote Server (Linux / Windows)' : 'سرور ریموت (لینوکس / ویندوز)'}</option>
                      <option value="bulk_config">{isEn ? 'Bulk Configuration Job' : 'پیکربندی گروهی تجهیزات'}</option>
                      <option value="firewall">{isEn ? 'Firewall / ACL Policy Change' : 'تغییر فایروال / قوانین دسترسی'}</option>
                      <option value="backup">{isEn ? 'Disaster Recovery / Restore' : 'بازیابی بکاپ / عملیات DR'}</option>
                      <option value="rbac">{isEn ? 'RBAC / Security Policy Change' : 'تغییر پالیسی امنیتی و دسترسی'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5">
                      {isEn ? 'Target Asset' : 'تجهیز یا سرور مقصد'}
                    </label>
                    {filteredTargets.length > 0 ? (
                      <select
                        value={reqTargetId}
                        onChange={(e) => setReqTargetId(e.target.value)}
                        disabled={targetsLoading}
                        className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${inputCls}`}
                      >
                        <option value="">
                          {targetsLoading
                            ? isEn ? 'Loading inventory...' : 'در حال دریافت موجودی...'
                            : isEn ? '-- Select target --' : '-- انتخاب تجهیز --'}
                        </option>
                        {filteredTargets.map((opt) => (
                          <option key={`${opt.entityType}-${opt.id}`} value={opt.id}>
                            {opt.name} {opt.subtitle ? `(${opt.subtitle})` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={reqTargetCustomName}
                        onChange={(e) => setReqTargetCustomName(e.target.value)}
                        placeholder={isEn ? 'e.g. Core Cluster / Production DR' : 'مثلاً: پالیسی دسترسی یا سرویس هدف'}
                        className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${inputCls}`}
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    {isEn ? 'Requested Action Title' : 'عنوان عملیات درخواستی'}
                  </label>
                  <input
                    type="text"
                    required
                    value={reqAction}
                    onChange={(e) => setReqAction(e.target.value)}
                    placeholder={
                      isEn
                        ? 'e.g. Apply Core BGP Peer Update / Restart Nginx Service'
                        : 'مثلاً: اعمال تغییرات VLAN ترانک هسته / بازنشانی سرویس فایروال'
                    }
                    className={`w-full px-3.5 py-2 rounded-xl border text-xs outline-none ${inputCls}`}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">
                      {isEn ? 'Risk Severity' : 'سطح ریسک تغییر'}
                    </label>
                    <select
                      value={reqRisk}
                      onChange={(e) => setReqRisk(e.target.value as ApprovalRiskLevel)}
                      className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${inputCls}`}
                    >
                      <option value="medium">{isEn ? 'Medium Risk' : 'ریسک متوسط'}</option>
                      <option value="high">{isEn ? 'High Risk' : 'ریسک بالا'}</option>
                      <option value="critical">{isEn ? 'Critical Production Impact' : 'ریسک بحرانی (توقف احتمالی سرویس)'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5">
                      {isEn ? 'Approval JIT Window (TTL)' : 'بازه اعتبار مجوز (TTL)'}
                    </label>
                    <select
                      value={reqTtlMinutes}
                      onChange={(e) => setReqTtlMinutes(Number(e.target.value))}
                      className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${inputCls}`}
                    >
                      <option value={15}>{isEn ? '15 Minutes (Urgent)' : '۱۵ دقیقه (اضطراری)'}</option>
                      <option value={30}>{isEn ? '30 Minutes' : '۳۰ دقیقه'}</option>
                      <option value={60}>{isEn ? '60 Minutes (Standard)' : '۶۰ دقیقه (استاندارد)'}</option>
                      <option value={240}>{isEn ? '4 Hours (Maintenance Window)' : '۴ ساعت (پنجره تعمیراتی)'}</option>
                      <option value={1440}>{isEn ? '24 Hours' : '۲۴ ساعت'}</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    {isEn ? 'Operational Justification & Rollback Plan' : 'دلیل فنی تغییر و برنامه بازگشت (Rollback)'}
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={reqReason}
                    onChange={(e) => setReqReason(e.target.value)}
                    placeholder={
                      isEn
                        ? 'Explain why this change is needed, expected impact, and rollback steps...'
                        : 'علت نیاز به این تغییر، دامنه اثرگذاری و روش بازگشت در صورت خطا را شرح دهید...'
                    }
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs outline-none ${inputCls}`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    {isEn ? 'Exact CLI Commands / Diff Payload (Optional, Encrypted at Rest)' : 'دستورات خط فرمان یا جزییات دقیق تغییر (اختیاری - ذخیره رمزنگاری‌شده)'}
                  </label>
                  <textarea
                    rows={4}
                    value={reqCommands}
                    onChange={(e) => setReqCommands(e.target.value)}
                    dir="ltr"
                    placeholder={'interface GigabitEthernet1/0/24\n switchport trunk allowed vlan add 120'}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono outline-none ${inputCls}`}
                  />
                </div>
              </div>

              <div
                className={`px-5 py-3.5 border-t flex items-center justify-end gap-2 shrink-0 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <button
                  type="button"
                  onClick={handleCloseNewModal}
                  className={`px-4 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={submittingNew}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {submittingNew
                    ? isEn ? 'Submitting...' : 'در حال ثبت...'
                    : isEn ? 'Submit for Approval' : 'ارسال جهت تایید مدیر'}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </div>
  );
};
