import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Play,
  RefreshCw,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  ActionApprovalRequest,
  ApprovalGatePayload,
  ApprovalRiskLevel,
  ApprovalTargetEntityType,
} from '../../types';
import { useLanguage } from '../../i18n';
import { useModalDock } from '../../context/ModalDockContext';
import { ModalHeaderControls } from './ModalHeaderControls';
import { FieldInfoTooltip } from './FieldInfoTooltip';
import { fetchApprovalById, submitApprovalRequest } from '../../services/approvalApi';
import { ApprovalGateResolution, emitApprovalNotice } from '../../utils/approvalGateBridge';

const GATE_MODAL_ID = 'approval-gate-modal';

interface ApprovalGateModalProps {
  isOpen: boolean;
  payload: ApprovalGatePayload | null;
  onResolve: (resolution: ApprovalGateResolution) => void;
  onCloseVisual: () => void;
  onRestoreVisual: () => void;
  onNavigateToApprovals?: (approvalId?: string) => void;
  isLightMode?: boolean;
}

function formatRemainingWindow(expiresAtIso: string, isEn: boolean, nowMs = Date.now()): string {
  const diffMs = Date.parse(expiresAtIso) - nowMs;
  if (!Number.isFinite(diffMs) || diffMs <= 0) return isEn ? 'Expired' : 'منقضی‌شده';
  const totalSec = Math.floor(diffMs / 1000);
  if (totalSec < 60) {
    return isEn ? `${totalSec}s left` : `${totalSec} ثانیه باقی‌مانده`;
  }
  const totalMin = Math.floor(totalSec / 60);
  const remSec = totalSec % 60;
  if (totalMin < 60) {
    return isEn
      ? `${totalMin}m ${String(remSec).padStart(2, '0')}s left`
      : `${totalMin} دقیقه و ${remSec} ثانیه`;
  }
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return isEn ? `${hrs}h ${mins}m left` : `${hrs} ساعت و ${mins} دقیقه باقی‌مانده`;
}

export const ApprovalGateModal: React.FC<ApprovalGateModalProps> = ({
  isOpen,
  payload,
  onResolve,
  onCloseVisual,
  onRestoreVisual,
  onNavigateToApprovals,
  isLightMode = false,
}) => {
  const { isEn } = useLanguage();
  const { dockModal, undockModal } = useModalDock();

  const [isMaximized, setIsMaximized] = useState(false);
  const [riskLevel, setRiskLevel] = useState<ApprovalRiskLevel>('high');
  const [ttlMinutes, setTtlMinutes] = useState<number>(60);
  const [reason, setReason] = useState('');
  const [autoExecuteOnApprove, setAutoExecuteOnApprove] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activeTicket, setActiveTicket] = useState<ActionApprovalRequest | null>(null);
  const [pendingTicket, setPendingTicket] = useState<ActionApprovalRequest | null>(null);
  const [forceNewForm, setForceNewForm] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Ensure the caller's Promise resolves at most once
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (!payload) return;
    resolvedRef.current = false;
    setIsMaximized(false);
    setRiskLevel(payload.riskLevel || 'high');
    const firstTtl = payload.stagesPreview?.[0]?.ttlMinutes;
    setTtlMinutes(firstTtl && Number.isFinite(firstTtl) ? firstTtl : 60);
    setReason('');
    setAutoExecuteOnApprove(Boolean(payload.supportsAutoExecute ?? Boolean(payload.actionParams?._httpExecution)));
    setSubmitError(null);
    setActiveTicket(payload.existingApprovedApproval || null);
    setPendingTicket(payload.existingPendingApproval || null);
    setForceNewForm(false);
  }, [payload]);

  useEffect(() => {
    if (!isOpen) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isOpen]);

  const resolveCallerOnce = useCallback(
    (res: ApprovalGateResolution) => {
      if (!resolvedRef.current) {
        resolvedRef.current = true;
        onResolve(res);
      }
    },
    [onResolve]
  );

  const handleClose = useCallback(() => {
    undockModal(GATE_MODAL_ID);
    resolveCallerOnce(
      pendingTicket ? { outcome: 'submitted', approval: pendingTicket } : { outcome: 'cancelled' }
    );
    onCloseVisual();
  }, [undockModal, resolveCallerOnce, pendingTicket, onCloseVisual]);

  const handleMinimize = useCallback(() => {
    // Unblock any awaiting HTTP/WS caller immediately so action spinners do not hang while docked
    resolveCallerOnce(
      pendingTicket ? { outcome: 'submitted', approval: pendingTicket } : { outcome: 'cancelled' }
    );
    onCloseVisual();
    dockModal({
      id: GATE_MODAL_ID,
      labelEn: payload?.actionLabelEn || 'Approval Gate',
      labelFa: payload?.actionLabelFa || 'دروازه تایید عملیات',
      badge: pendingTicket?.id || activeTicket?.id || 'RBAC',
      category: 'system',
      onRestore: () => onRestoreVisual(),
      onClose: () => {
        undockModal(GATE_MODAL_ID);
      },
    });
  }, [
    resolveCallerOnce,
    pendingTicket,
    onCloseVisual,
    dockModal,
    payload,
    activeTicket,
    onRestoreVisual,
    undockModal,
  ]);

  const handleExecuteWithTicket = useCallback(
    (ticket: ActionApprovalRequest) => {
      undockModal(GATE_MODAL_ID);
      resolveCallerOnce({
        outcome: 'execute',
        approvalRequestId: ticket.id,
        approval: ticket,
      });
      onCloseVisual();
    },
    [undockModal, resolveCallerOnce, onCloseVisual]
  );

  const handleRefreshTicketStatus = async () => {
    const targetId = pendingTicket?.id || activeTicket?.id;
    if (!targetId) return;
    setRefreshingStatus(true);
    setSubmitError(null);
    try {
      const updated = await fetchApprovalById(targetId);
      if (updated.status === 'approved') {
        setActiveTicket(updated);
        setPendingTicket(null);
      } else {
        setPendingTicket(updated);
      }
    } catch (err: any) {
      setSubmitError(err?.message || (isEn ? 'Failed to refresh request status' : 'خطا در استعلام وضعیت درخواست'));
    } finally {
      setRefreshingStatus(false);
    }
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payload) return;
    const cleanReason = reason.trim();
    if (!cleanReason) {
      setSubmitError(
        isEn
          ? 'Please enter an operational justification before submitting.'
          : 'لطفاً دلیل و توجیه عملیاتی درخواست را پیش از ارسال وارد کنید.'
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const entityType = (
        ['device', 'server', 'policy', 'backup', 'firewall', 'bulk_config', 'other'].includes(
          String(payload.targetEntityType)
        )
          ? payload.targetEntityType
          : 'device'
      ) as ApprovalTargetEntityType;

      const supportsAuto = Boolean(
        payload.supportsAutoExecute ?? Boolean(payload.actionParams?._httpExecution)
      );
      const effectiveExecutionMode =
        payload.executionMode || (supportsAuto ? 'auto_command' : undefined);

      const created = await submitApprovalRequest({
        targetEntityType: entityType,
        targetEntityId: payload.targetEntityId || 'bulk',
        targetEntityName: payload.targetEntityName || payload.targetEntityId || 'Target',
        actionKey: payload.actionKey,
        requestedAction:
          payload.requestedAction ||
          (isEn ? payload.actionLabelEn : payload.actionLabelFa) ||
          payload.actionKey,
        commandPreview: payload.commandPreview || undefined,
        actionParams: payload.actionParams || undefined,
        reason: cleanReason,
        riskLevel,
        ttlMinutes: Math.min(43200, Math.max(5, Number(ttlMinutes) || 60)),
        ...(effectiveExecutionMode ? { executionMode: effectiveExecutionMode } : {}),
        ...(supportsAuto ? { autoExecuteOnApprove } : {}),
      });

      setPendingTicket(created);
      setForceNewForm(false);

      // Resolve awaiting HTTP/WS caller immediately so the original UI trigger returns cleanly
      resolveCallerOnce({ outcome: 'submitted', approval: created });

      emitApprovalNotice(
        `Approval request ${created.id} submitted to Stage 1 (${created.totalStages || 1} stage(s) required).`,
        `درخواست تایید ${created.id} ثبت و برای مرحله ۱ از ${created.totalStages || 1} ارسال شد.`
      );
    } catch (err: any) {
      setSubmitError(
        err?.message ||
          (isEn ? 'Failed to submit approval request.' : 'خطا در ثبت درخواست تایید.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const formattedActionParams = useMemo(() => {
    if (!payload?.actionParams || typeof payload.actionParams !== 'object') return [];
    const seen = new Set<string>();
    const items: Array<[string, string]> = [];
    const pushEntry = (rawKey: string, rawVal: any) => {
      if (rawVal === undefined || rawVal === null || rawVal === '') return;
      const key = rawKey.trim();
      if (!key || seen.has(key.toLowerCase())) return;
      if (/(password|passwd|secret|token|private_key|passphrase|api_key)/i.test(key)) {
        seen.add(key.toLowerCase());
        items.push([key, '***']);
        return;
      }
      seen.add(key.toLowerCase());
      if (Array.isArray(rawVal)) {
        items.push([key, rawVal.length <= 5 ? rawVal.join(', ') : `${rawVal.length} items`]);
      } else if (typeof rawVal === 'object') {
        const subEntries = Object.entries(rawVal)
          .filter(([sk, sv]) => sv !== undefined && sv !== null && sv !== '' && !seen.has(sk.toLowerCase()))
          .map(([sk, sv]) => `${sk}: ${typeof sv === 'object' ? '...' : String(sv)}`);
        if (subEntries.length > 0) {
          items.push([key, subEntries.join(', ')]);
        }
      } else {
        items.push([key, String(rawVal)]);
      }
    };

    for (const [k, v] of Object.entries(payload.actionParams)) {
      if (k === '_httpExecution' || k === 'approvalRequestId') continue;
      if ((k === 'params' || k === 'updates') && v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [nk, nv] of Object.entries(v)) {
          pushEntry(nk, nv);
        }
      } else {
        pushEntry(k, v);
      }
    }
    return items;
  }, [payload]);

  const supportsAutoExec = Boolean(
    payload?.supportsAutoExecute ?? Boolean(payload?.actionParams?._httpExecution)
  );
  const isJitSessionMode =
    payload?.executionMode === 'jit_session' ||
    activeTicket?.executionMode === 'jit_session' ||
    Boolean(payload?.activeGrant || activeTicket?.activeGrant);

  if (!isOpen || !payload) return null;

  const actionTitle = isEn
    ? payload.actionLabelEn || payload.requestedAction || payload.actionKey
    : payload.actionLabelFa || payload.requestedAction || payload.actionKey;

  const targetName = payload.targetEntityName || payload.targetEntityId || (isEn ? 'Target' : 'هدف');

  const showApprovedReady = Boolean(activeTicket && activeTicket.status === 'approved' && !forceNewForm);
  const showPendingTracker = Boolean(!showApprovedReady && pendingTicket && !forceNewForm);

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[999996] flex items-center justify-center p-4 sm:p-6"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      {/* Backdrop limited strictly above footer (bottom-8) */}
      <div
        className={`absolute inset-0 transition-opacity ${
          isLightMode ? 'bg-slate-900/45 backdrop-blur-[2px]' : 'bg-slate-950/75 backdrop-blur-sm'
        }`}
        onClick={handleClose}
      />

      {/* Modal Window */}
      <div
        className={`relative flex flex-col overflow-hidden shadow-2xl border transition-all duration-200 ${
          isMaximized
            ? 'w-full h-full rounded-xl'
            : 'w-full max-w-2xl max-h-full rounded-2xl'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between gap-3 px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-amber-50/80 border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                showApprovedReady
                  ? isLightMode
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                    : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : isLightMode
                  ? 'bg-amber-100 border-amber-300 text-amber-700'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
              }`}
            >
              {showApprovedReady ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <ShieldAlert className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3
                  className={`text-sm sm:text-base font-black truncate ${
                    isLightMode ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {showApprovedReady
                    ? isEn
                      ? 'Approved Execution Ticket Ready (JIT)'
                      : 'تیکت تاییدشده آماده اجرا (JIT)'
                    : isEn
                    ? 'Policy-Enforced Approval Required'
                    : 'الزام تایید چندمرحله‌ای پیش از اجرا'}
                </h3>
                {payload.policyName && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                      isLightMode
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                    }`}
                  >
                    {payload.policyName}
                  </span>
                )}
              </div>
              <p
                className={`text-xs truncate mt-0.5 ${
                  isLightMode ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                {actionTitle}
              </p>
            </div>
          </div>

          <ModalHeaderControls
            onMaximizeToggle={() => setIsMaximized((prev) => !prev)}
            onMinimize={handleMinimize}
            onClose={handleClose}
            isMaximized={isMaximized}
            isLightMode={isLightMode}
            isEn={isEn}
          />
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Action & Target Summary Card */}
          <div
            className={`p-3.5 rounded-xl border ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/70 border-slate-800'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 text-xs font-bold">
                <Server className="w-4 h-4 text-cyan-500 shrink-0" />
                <span className={isLightMode ? 'text-slate-500' : 'text-slate-400'}>
                  {isEn ? 'Target:' : 'تجهیز / سرور هدف:'}
                </span>
                <span className={isLightMode ? 'text-slate-900' : 'text-white'}>{targetName}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-mono border ${
                    isLightMode
                      ? 'bg-white border-slate-200 text-slate-600'
                      : 'bg-slate-950 border-slate-700 text-slate-300'
                  }`}
                >
                  {payload.targetEntityType}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                    isJitSessionMode
                      ? isLightMode
                        ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                        : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                      : isLightMode
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                  }`}
                >
                  {isJitSessionMode
                    ? isEn
                      ? 'Time-Limited JIT Pass'
                      : 'پاس زمانی (JIT)'
                    : isEn
                    ? 'Auto / Single Command'
                    : 'اجرای خودکار / تک‌عملیاتی'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                    (payload.riskLevel || riskLevel) === 'critical'
                      ? isLightMode
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                      : isLightMode
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {payload.riskLevel || riskLevel}
                </span>
              </div>
            </div>

            {formattedActionParams.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {formattedActionParams.map(([k, v]) => (
                  <span
                    key={k}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border ${
                      isLightMode
                        ? 'bg-white border-slate-200 text-slate-700'
                        : 'bg-slate-950 border-slate-700 text-slate-300'
                    }`}
                  >
                    <span className="opacity-65">{k}:</span>
                    <span className="font-semibold">
                      {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </span>
                  </span>
                ))}
              </div>
            )}

            {payload.commandPreview && (
              <div className="mt-2.5">
                <div
                  className={`flex items-center gap-1.5 text-[11px] font-semibold mb-1 ${
                    isLightMode ? 'text-slate-600' : 'text-slate-400'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5 text-amber-500" />
                  <span>{isEn ? 'Action / Command Preview' : 'پیش‌نمایش عملیات / دستور'}</span>
                </div>
                <pre
                  dir="ltr"
                  className={`p-2.5 rounded-lg text-[11px] font-mono whitespace-pre-wrap break-all border max-h-28 overflow-y-auto ${
                    isLightMode
                      ? 'bg-slate-900 text-emerald-300 border-slate-300'
                      : 'bg-black/60 text-emerald-300 border-slate-800'
                  }`}
                >
                  {payload.commandPreview}
                </pre>
              </div>
            )}
          </div>

          {/* STATE 1: Approved JIT Ticket Ready */}
          {showApprovedReady && activeTicket && (
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isLightMode
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-100'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-black">
                      {isJitSessionMode
                        ? isEn
                          ? `Active Time-Limited JIT Pass Ready (${activeTicket.id})`
                          : `پاس زمانی فعال (JIT Pass) آماده ورود است (${activeTicket.id})`
                        : isEn
                        ? `Authorized Execution Ticket Found (${activeTicket.id})`
                        : `تیکت تاییدشده فعال یافت شد (${activeTicket.id})`}
                    </div>
                    <p className="text-xs opacity-85 mt-0.5">
                      {isJitSessionMode
                        ? isEn
                          ? 'All required approval stages have signed off. Your JIT Pass remains valid across reconnects until the TTL timer expires or an admin revokes it.'
                          : 'تمامی مراحل تایید امضا شده است. این پاس زمانی تا پایان مهلت TTL یا لغو دستی مدیر برای اتصال مجدد نیز معتبر خواهد بود.'
                        : isEn
                        ? 'All required approval stages have signed off. You can execute this protected action immediately using this authorized ticket.'
                        : 'تمامی مراحل زنجیره تایید امضا شده است. هم‌اکنون می‌توانید این عملیات را با استفاده از این تیکت تاییدشده اجرا کنید.'}
                    </p>
                  </div>
                </div>
                <span
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold font-mono tabular-nums flex items-center gap-1 shrink-0 border ${
                    isLightMode
                      ? 'bg-white border-emerald-300 text-emerald-800'
                      : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  {formatRemainingWindow(
                    activeTicket.activeGrant?.expiresAt || activeTicket.expiresAt,
                    isEn,
                    nowMs
                  )}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleExecuteWithTicket(activeTicket)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25 transition cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {isJitSessionMode
                    ? isEn
                      ? 'Launch Authorized Session (JIT Pass)'
                      : 'شروع نشست با پاس زمانی فعال (JIT)'
                    : isEn
                    ? 'Execute Now Using Approved Ticket'
                    : 'اجرای فوری عملیات با تیکت تاییدشده'}
                </button>
                <button
                  type="button"
                  onClick={() => setForceNewForm(true)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {isEn ? 'Submit a Separate Request Instead' : 'ثبت درخواست جدید مجزا'}
                </button>
              </div>
            </div>
          )}

          {/* STATE 2: Pending Multi-Stage Approval Tracker */}
          {showPendingTracker && pendingTicket && (
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isLightMode
                  ? 'bg-amber-50/70 border-amber-300 text-slate-900'
                  : 'bg-amber-500/10 border-amber-500/35 text-slate-100'
              }`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black">
                      {isEn
                        ? `Request ${pendingTicket.id} — Awaiting Decision`
                        : `درخواست ${pendingTicket.id} — در انتظار تایید`}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                        pendingTicket.status === 'rejected'
                          ? 'bg-rose-500/15 text-rose-500 border-rose-500/40'
                          : pendingTicket.status === 'expired'
                          ? 'bg-slate-500/15 text-slate-400 border-slate-500/40'
                          : isLightMode
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {pendingTicket.status === 'pending'
                        ? isEn
                          ? `Stage ${pendingTicket.currentStageOrder || 1}/${pendingTicket.totalStages || 1}`
                          : `مرحله ${pendingTicket.currentStageOrder || 1} از ${pendingTicket.totalStages || 1}`
                        : pendingTicket.status}
                    </span>
                  </div>
                  <p className={`text-xs mt-1 ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                    {isEn
                      ? 'The request has been routed to the assigned stage approvers’ Inbox and Approvals Queue.'
                      : 'این درخواست به صندوق اعلانات و صف تاییدیه مسئولین ذی‌صلاح مرحله فعلی ارسال شده است.'}
                  </p>
                </div>

                <span
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold font-mono tabular-nums flex items-center gap-1 border ${
                    isLightMode
                      ? 'bg-white border-amber-200 text-amber-800'
                      : 'bg-slate-900 border-slate-700 text-amber-300'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  {formatRemainingWindow(pendingTicket.expiresAt, isEn, nowMs)}
                </span>
              </div>

              {/* Multi-stage progress stepper */}
              {Array.isArray(pendingTicket.stages) && pendingTicket.stages.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {pendingTicket.stages.map((st) => {
                    const isStageActive =
                      pendingTicket.status === 'pending' &&
                      st.stageOrder === (pendingTicket.currentStageOrder || 1);
                    const isStageApproved = st.status === 'approved';
                    const isStageRejected = st.status === 'rejected';
                    return (
                      <div
                        key={st.id}
                        className={`p-2.5 rounded-xl border text-xs ${
                          isStageApproved
                            ? isLightMode
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                              : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                            : isStageRejected
                            ? isLightMode
                              ? 'bg-rose-50 border-rose-300 text-rose-900'
                              : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                            : isStageActive
                            ? isLightMode
                              ? 'bg-white border-amber-400 text-slate-900 shadow-sm'
                              : 'bg-slate-900 border-amber-500/60 text-amber-200'
                            : isLightMode
                            ? 'bg-white/70 border-slate-200 text-slate-500'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 font-bold">
                          <span>
                            {isEn ? `Stage ${st.stageOrder}` : `مرحله ${st.stageOrder}`}
                          </span>
                          {isStageApproved && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                        </div>
                        <div className="truncate font-semibold mt-0.5">
                          {isEn ? st.titleEn : st.titleFa}
                        </div>
                        {st.decidedByUsername && (
                          <div className="text-[10px] opacity-80 mt-0.5 truncate">
                            {st.decidedByUsername}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {submitError && (
                <div className="text-xs text-rose-500 font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRefreshTicketStatus}
                    disabled={refreshingStatus}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                        : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingStatus ? 'animate-spin' : ''}`} />
                    {isEn ? 'Check Status / Execute If Approved' : 'استعلام وضعیت / اجرا در صورت تایید'}
                  </button>

                  {onNavigateToApprovals && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = pendingTicket.id;
                        handleClose();
                        onNavigateToApprovals(targetId);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {isEn ? 'Open Approvals Queue' : 'مشاهده در صف تاییدیه‌ها'}
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setForceNewForm(true)}
                  className={`text-xs font-semibold underline-offset-2 hover:underline cursor-pointer ${
                    isLightMode ? 'text-slate-600' : 'text-slate-400'
                  }`}
                >
                  {isEn ? 'Submit New Request' : 'ثبت درخواست جدید'}
                </button>
              </div>
            </div>
          )}

          {/* STATE 3: Submit New Multi-Stage Approval Request */}
          {!showApprovedReady && !showPendingTracker && (
            <form onSubmit={handleSubmitRequest} className="space-y-4">
              {/* Policy Approval Chain Preview */}
              {Array.isArray(payload.stagesPreview) && payload.stagesPreview.length > 0 && (
                <div
                  className={`p-3.5 rounded-xl border space-y-2.5 ${
                    isLightMode ? 'bg-indigo-50/50 border-indigo-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Layers className="w-4 h-4 text-indigo-500" />
                      <span className={isLightMode ? 'text-slate-800' : 'text-slate-200'}>
                        {isEn ? 'Required Multi-Stage Approval Chain' : 'زنجیره تایید مورد نیاز طبق پالیسی'}
                      </span>
                      <FieldInfoTooltip
                        fieldName={isEn ? 'Policy Approval Chain' : 'زنجیره تایید پالیسی'}
                        whatIsIt={
                          isEn
                            ? 'The sequential stages configured in your RBAC Access Policy that must approve this action before execution.'
                            : 'مراحل متوالی تعریف‌شده در پالیسی دسترسی شما که باید پیش از اجرای عملیات تایید شوند.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Enforces Four-Eyes control and segmented escalation so sensitive changes pass authorized oversight.'
                            : 'اعمال کنترل چندچشمی و سلسله‌مراتب تایید امنیتی برای جلوگیری از تغییرات پرریسک بدون نظارت.'
                        }
                        example={
                          isEn
                            ? 'Stage 1: Team Supervisor (30m) -> Stage 2: Security Lead (60m)'
                            : 'مرحله ۱: سرپرست شیفت -> مرحله ۲: مدیر امنیت شبکه'
                        }
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                        isLightMode
                          ? 'bg-white border-indigo-200 text-indigo-700'
                          : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                      }`}
                    >
                      {payload.stagesPreview.length}{' '}
                      {isEn ? 'Stage(s)' : 'مرحله'}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
                    {payload.stagesPreview.map((st, idx) => (
                      <React.Fragment key={st.id}>
                        <div
                          className={`flex-1 min-w-[160px] p-2.5 rounded-xl border text-xs ${
                            isLightMode
                              ? 'bg-white border-slate-200 text-slate-800'
                              : 'bg-slate-950 border-slate-800 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 font-bold">
                            <span className="text-indigo-500">
                              {isEn ? `Stage ${st.stageOrder}` : `مرحله ${st.stageOrder}`}
                            </span>
                            <span className="text-[10px] opacity-70">{st.ttlMinutes}m</span>
                          </div>
                          <div className="font-semibold truncate mt-0.5">
                            {isEn ? st.titleEn : st.titleFa}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] opacity-80 mt-1 truncate">
                            {st.approverTargetType === 'user_groups' ? (
                              <Users className="w-3 h-3 shrink-0" />
                            ) : (
                              <UserCheck className="w-3 h-3 shrink-0" />
                            )}
                            <span className="truncate">
                              {st.approverLabels && st.approverLabels.length > 0
                                ? st.approverLabels.join(', ')
                                : isEn
                                ? 'Any Eligible Approver'
                                : 'هر تاییدکننده مجاز'}
                            </span>
                          </div>
                        </div>
                        {idx < (payload.stagesPreview?.length || 0) - 1 && (
                          <ArrowRight className="w-4 h-4 text-slate-400 self-center hidden sm:block shrink-0" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk & Justification Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    className={`block text-xs font-bold mb-1 ${
                      isLightMode ? 'text-slate-700' : 'text-slate-300'
                    }`}
                  >
                    {isEn ? 'Estimated Risk Level' : 'سطح ریسک عملیات'}
                  </label>
                  <select
                    value={riskLevel}
                    onChange={(e) => setRiskLevel(e.target.value as ApprovalRiskLevel)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-cyan-500'
                    }`}
                  >
                    <option value="medium">{isEn ? 'Medium' : 'متوسط (Medium)'}</option>
                    <option value="high">{isEn ? 'High' : 'بالا (High)'}</option>
                    <option value="critical">{isEn ? 'Critical' : 'بحرانی (Critical)'}</option>
                  </select>
                </div>

                <div>
                  <label
                    className={`block text-xs font-bold mb-1 ${
                      isLightMode ? 'text-slate-700' : 'text-slate-300'
                    }`}
                  >
                    {isEn ? 'Ticket Validity Window (Minutes)' : 'مدت اعتبار تیکت (دقیقه)'}
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={43200}
                    value={ttlMinutes}
                    onChange={(e) => setTtlMinutes(Number(e.target.value) || 60)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-cyan-500'
                    }`}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label
                    className={`text-xs font-bold ${
                      isLightMode ? 'text-slate-700' : 'text-slate-300'
                    }`}
                  >
                    {isEn ? 'Operational Justification *' : 'توجیه فنی و دلیل درخواست *'}
                  </label>
                  <FieldInfoTooltip
                    fieldName={isEn ? 'Operational Justification' : 'توجیه فنی عملیات'}
                    whatIsIt={
                      isEn
                        ? 'A clear business or technical explanation of why this change/session is required right now.'
                        : 'توضیح فنی شفاف درباره علت نیاز به اجرای این عملیات یا نشست در زمان فعلی.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Approvers inspect this note along with the exact command preview before signing Stage 1..N.'
                        : 'تاییدکنندگان مراحل برای بررسی صلاحیت و صدور تاییدیه ابتدا این متن را مطالعه می‌کنند.'
                    }
                    example={
                      isEn
                        ? 'Scheduled change CR-402: Switch port Gi1/0/12 to VLAN 40 for new IP phone.'
                        : 'تغییر برنامه‌ریزی‌شده CR-402: انتقال پورت Gi1/0/12 به VLAN 40 جهت تلفن تحت شبکه.'
                    }
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
                <textarea
                  rows={3}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    isEn
                      ? 'Explain change ticket, incident ID, or maintenance purpose...'
                      : 'شماره تیکت تغییر، علت نگهداری یا توضیحات فنی برای تاییدکنندگان را وارد کنید...'
                  }
                  className={`w-full px-3 py-2.5 rounded-xl border text-xs outline-none resize-y ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
                      : 'bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:border-cyan-500'
                  }`}
                />
              </div>

              {/* Auto-Execute Upon Final Approval Option (Only when signed payload exists) */}
              {supportsAutoExec && (
                <div
                  className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                    isLightMode
                      ? 'bg-indigo-50/60 border-indigo-200 text-slate-800'
                      : 'bg-indigo-950/20 border-indigo-500/30 text-slate-200'
                  }`}
                >
                  <label className="flex items-start gap-2.5 cursor-pointer select-none flex-1">
                    <input
                      type="checkbox"
                      checked={autoExecuteOnApprove}
                      onChange={(e) => setAutoExecuteOnApprove(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded accent-indigo-600 cursor-pointer shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold flex items-center gap-1.5 flex-wrap">
                        <span>
                          {isEn
                            ? 'Execute automatically upon final approval'
                            : 'اجرای خودکار عملیات بلافاصله پس از تایید نهایی'}
                        </span>
                        <FieldInfoTooltip
                          fieldName={
                            isEn ? 'Auto-Execute Payload' : 'اجرای خودکار پس از تایید نهایی'
                          }
                          whatIsIt={
                            isEn
                              ? 'Instructs the backend to run the signed protected operation automatically as soon as the final stage approver signs off.'
                              : 'به سرور دستور می‌دهد بلافاصله پس از امضای مرحله نهایی زنجیره تایید، عملیات امضاشده را به‌صورت خودکار اجرا کند.'
                          }
                          whyNeeded={
                            isEn
                              ? 'Eliminates manual follow-up for transactional actions like saving running-config, power controls, or port toggles during maintenance windows.'
                              : 'نیاز به حضور و کلیک مجدد کاربر پس از تایید مدیران را برای عملیات‌هایی مثل ذخیره کانفیگ یا کنترل پورت‌ها از بین می‌برد.'
                          }
                          example={
                            isEn
                              ? 'Enabled: Stage 2 signs off -> Backend runs Write Memory -> Requester receives output.'
                              : 'فعال: تایید مرحله پایانی -> اجرای خودکار دستور توسط سرور -> ارسال خروجی واقعی برای درخواست‌کننده.'
                          }
                          isEn={isEn}
                          isLightMode={isLightMode}
                        />
                      </div>
                      <p
                        className={`text-[11px] mt-0.5 ${
                          isLightMode ? 'text-slate-600' : 'text-slate-400'
                        }`}
                      >
                        {isEn
                          ? 'If unchecked, an active ticket is granted after final sign-off and can be launched via One-Click Execution.'
                          : 'در صورت غیرفعال بودن، پس از تایید نهایی تیکت فعال صادر می‌شود و می‌توانید با یک کلیک آن را اجرا کنید.'}
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {submitError && (
                <div
                  className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                    isLightMode
                      ? 'bg-rose-50 border-rose-200 text-rose-700'
                      : 'bg-rose-500/10 border-rose-500/35 text-rose-300'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white shadow-lg shadow-amber-600/20 transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submitting
                    ? isEn
                      ? 'Submitting Request...'
                      : 'در حال ارسال درخواست...'
                    : isEn
                    ? 'Submit Approval Request'
                    : 'ارسال درخواست جهت تایید'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
