import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  Lock,
  Router,
  Server,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { CommsProjectedApprovalCard } from '../../types';
import { decideApprovalRequestApi } from '../../services/approvalApi';

export interface ApprovalChatCardProps {
  card?: CommsProjectedApprovalCard;
  isEn: boolean;
  isLightMode: boolean;
  isSelf?: boolean;
  compact?: boolean;
  onDecided?: () => void;
}

export function dispatchOpenApprovalTicket(approvalId: string): void {
  if (typeof window === 'undefined' || !approvalId) return;
  window.dispatchEvent(
    new CustomEvent<{ approvalId: string }>('nettop-comms-open-approval', {
      detail: { approvalId },
    })
  );
}

function getStatusBadgeMeta(status: string | undefined, isEn: boolean, isLightMode: boolean) {
  switch (status) {
    case 'approved':
      return {
        label: isEn ? 'Approved' : 'تایید شده',
        icon: CheckCircle2,
        cls: isLightMode
          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
          : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300',
      };
    case 'executed':
      return {
        label: isEn ? 'Executed' : 'اجرا شده',
        icon: CheckCircle2,
        cls: isLightMode
          ? 'bg-cyan-50 border-cyan-200 text-cyan-800'
          : 'bg-cyan-500/15 border-cyan-500/35 text-cyan-300',
      };
    case 'rejected':
      return {
        label: isEn ? 'Rejected' : 'رد شده',
        icon: XCircle,
        cls: isLightMode
          ? 'bg-rose-50 border-rose-200 text-rose-800'
          : 'bg-rose-500/15 border-rose-500/35 text-rose-300',
      };
    case 'expired':
      return {
        label: isEn ? 'Expired' : 'منقضی شده',
        icon: Clock,
        cls: isLightMode
          ? 'bg-slate-100 border-slate-300 text-slate-700'
          : 'bg-white/10 border-white/15 text-slate-300',
      };
    case 'cancelled':
      return {
        label: isEn ? 'Cancelled' : 'لغو شده',
        icon: XCircle,
        cls: isLightMode
          ? 'bg-slate-100 border-slate-300 text-slate-600'
          : 'bg-white/10 border-white/15 text-slate-400',
      };
    default:
      return {
        label: isEn ? 'Pending' : 'در انتظار تایید',
        icon: Clock,
        cls: isLightMode
          ? 'bg-amber-50 border-amber-200 text-amber-800'
          : 'bg-amber-500/15 border-amber-500/35 text-amber-300',
      };
  }
}

export const ApprovalChatCard: React.FC<ApprovalChatCardProps> = ({
  card,
  isEn,
  isLightMode,
  isSelf = false,
  compact = false,
  onDecided,
}) => {
  const [noteOpen, setNoteOpen] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');
  const [submitting, setSubmitting] = useState<'approved' | 'rejected' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [localDoneMsg, setLocalDoneMsg] = useState<string | null>(null);

  if (!card) return null;

  if (card.accessRestricted) {
    return (
      <div
        className={`mt-2 rounded-xl border flex items-start gap-2 ${
          compact ? 'px-2.5 py-2 text-[11px]' : 'px-3 py-2.5 text-xs'
        } ${
          isSelf
            ? 'bg-black/20 border-white/20 text-white/90'
            : isLightMode
            ? 'bg-slate-100 border-slate-300 text-slate-700'
            : 'bg-slate-950/70 border-amber-500/30 text-amber-200'
        }`}
      >
        <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-90" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="font-bold">
            {isEn ? 'RBAC Restricted Approval Ticket' : 'تیکت تایید محدودشده (RBAC)'}
          </div>
          <p className="opacity-90 leading-relaxed">
            {isEn
              ? card.restrictionMessageEn ||
                'Access Restricted: Your RBAC policy does not permit inspecting this approval ticket.'
              : card.restrictionMessageFa ||
                'عدم دسترسی RBAC: پالیسی دسترسی شما اجازه مشاهده این تیکت تایید را نمی‌دهد.'}
          </p>
        </div>
      </div>
    );
  }

  const statusMeta = getStatusBadgeMeta(card.status, isEn, isLightMode);
  const StatusIcon = statusMeta.icon;
  const riskIsCritical = card.riskLevel === 'critical';

  const handleDecide = async (decision: 'approved' | 'rejected') => {
    if (submitting) return;
    setSubmitting(decision);
    setActionError(null);
    setLocalDoneMsg(null);
    try {
      await decideApprovalRequestApi(
        card.approvalId,
        decision,
        decisionNote.trim() || undefined
      );
      setNoteOpen(false);
      setDecisionNote('');
      setLocalDoneMsg(
        decision === 'approved'
          ? isEn
            ? 'Stage approved'
            : 'مرحله تایید ثبت شد'
          : isEn
          ? 'Ticket rejected'
          : 'درخواست رد شد'
      );
      onDecided?.();
    } catch (err: any) {
      setActionError(
        err?.message ||
          (isEn ? 'Failed to submit approval decision' : 'خطا در ثبت تصمیم تایید')
      );
    } finally {
      setSubmitting(null);
    }
  };

  const handleOpenEntity = () => {
    if (!card.canOpenEntity || !card.targetEntityId) return;
    if (card.targetEntityType !== 'device' && card.targetEntityType !== 'server') return;
    window.dispatchEvent(
      new CustomEvent('nettop-comms-open-entity', {
        detail: {
          entityType: card.targetEntityType,
          entityId: card.targetEntityId,
          action: card.targetEntityType === 'server' ? 'terminal' : 'view',
          name: card.targetEntityName || card.targetEntityId,
        },
      })
    );
  };

  return (
    <div
      className={`mt-2 rounded-xl border overflow-hidden ${
        compact ? 'text-[11px]' : 'text-xs'
      } ${
        isSelf
          ? 'bg-slate-950/65 border-white/20 text-slate-100'
          : isLightMode
          ? 'bg-white border-slate-200 text-slate-800 shadow-xs'
          : 'bg-slate-950/80 border-white/15 text-slate-100'
      }`}
    >
      {/* Header strip */}
      <div
        className={`flex items-center justify-between gap-2 flex-wrap px-2.5 py-2 border-b ${
          isSelf
            ? 'bg-white/5 border-white/15'
            : isLightMode
            ? 'bg-slate-50 border-slate-200'
            : 'bg-white/[0.03] border-white/10'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {riskIsCritical ? (
            <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          )}
          <span className="font-bold truncate">
            {card.requestedAction || (isEn ? 'Action Approval' : 'تایید عملیات')}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${
              riskIsCritical
                ? isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                : card.riskLevel === 'high'
                ? isLightMode
                  ? 'bg-orange-50 border-orange-200 text-orange-700'
                  : 'bg-orange-500/15 border-orange-500/30 text-orange-300'
                : isLightMode
                ? 'bg-sky-50 border-sky-200 text-sky-700'
                : 'bg-sky-500/15 border-sky-500/30 text-sky-300'
            }`}
          >
            {card.riskLevel === 'critical'
              ? isEn
                ? 'Critical'
                : 'بحرانی'
              : card.riskLevel === 'high'
              ? isEn
                ? 'High Risk'
                : 'ریسک بالا'
              : isEn
              ? 'Medium'
              : 'متوسط'}
          </span>

          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${statusMeta.cls}`}
          >
            <StatusIcon className="w-3 h-3 shrink-0" />
            <span>{statusMeta.label}</span>
          </span>
        </div>
      </div>

      {/* Metadata & Preview */}
      <div className="p-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] opacity-90">
          <span className="inline-flex items-center gap-1 font-medium">
            {card.targetEntityType === 'server' ? (
              <Server className="w-3 h-3 text-cyan-400 shrink-0" />
            ) : (
              <Router className="w-3 h-3 text-indigo-400 shrink-0" />
            )}
            <span>{card.targetEntityName || card.targetEntityId}</span>
            {card.targetEntityIp && (
              <span className="font-mono opacity-80">({card.targetEntityIp})</span>
            )}
          </span>

          <span className="inline-flex items-center gap-1">
            <User className="w-3 h-3 opacity-75 shrink-0" />
            <span>{card.requesterFullName || card.requesterUsername}</span>
          </span>

          <span className="font-mono tabular-nums opacity-80">
            {isEn
              ? `Stage ${card.currentStageOrder || 1}/${card.totalStages || 1}`
              : `مرحله ${card.currentStageOrder || 1} از ${card.totalStages || 1}`}
          </span>
        </div>

        {card.reason && (
          <p className="text-[11px] opacity-85 leading-relaxed line-clamp-2">
            {card.reason}
          </p>
        )}

        {card.commandPreview && (
          <div
            dir="ltr"
            className={`rounded-lg border px-2 py-1.5 font-mono text-[10.5px] overflow-x-auto whitespace-pre-wrap break-all ${
              isSelf
                ? 'bg-black/35 border-white/15 text-emerald-200'
                : isLightMode
                ? 'bg-slate-900 border-slate-700 text-emerald-300'
                : 'bg-black/50 border-white/10 text-emerald-300'
            }`}
          >
            <div className="flex items-center gap-1 text-[9.5px] uppercase tracking-wider opacity-70 mb-0.5">
              <Terminal className="w-2.5 h-2.5" />
              <span>{isEn ? 'Command Preview' : 'پیش‌نمایش دستور'}</span>
            </div>
            {card.commandPreview}
          </div>
        )}

        {actionError && (
          <div
            className={`px-2 py-1.5 rounded-lg border text-[10.5px] flex items-center gap-1.5 ${
              isLightMode
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {localDoneMsg && (
          <div
            className={`px-2 py-1 rounded-lg border text-[10.5px] flex items-center gap-1.5 ${
              isLightMode
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{localDoneMsg}</span>
          </div>
        )}

        {/* Inline RBAC & Four-Eyes gated Approve/Reject */}
        {card.canActOnCurrentStage && card.status === 'pending' && (
          <div className="space-y-1.5 pt-1 border-t border-white/10">
            {noteOpen && (
              <input
                type="text"
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder={
                  isEn
                    ? 'Optional decision note...'
                    : 'توضیح اختیاری برای تایید یا رد...'
                }
                className={`w-full px-2 py-1 rounded-lg border text-[11px] outline-none ${
                  isSelf || !isLightMode
                    ? 'bg-slate-900 border-white/20 text-white placeholder:text-slate-400'
                    : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                }`}
              />
            )}
            <div className="flex items-center justify-between gap-1.5 flex-wrap">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={Boolean(submitting)}
                  onClick={() => handleDecide('approved')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold cursor-pointer transition disabled:opacity-50"
                >
                  <Check className="w-3 h-3" />
                  <span>
                    {submitting === 'approved'
                      ? isEn
                        ? 'Approving...'
                        : 'در حال تایید...'
                      : isEn
                      ? 'Approve'
                      : 'تایید'}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(submitting)}
                  onClick={() => handleDecide('rejected')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold cursor-pointer transition disabled:opacity-50"
                >
                  <X className="w-3 h-3" />
                  <span>
                    {submitting === 'rejected'
                      ? isEn
                        ? 'Rejecting...'
                        : 'در حال رد...'
                      : isEn
                      ? 'Reject'
                      : 'رد درخواست'}
                  </span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setNoteOpen((v) => !v)}
                className="text-[10px] underline opacity-80 hover:opacity-100 cursor-pointer"
              >
                {noteOpen
                  ? isEn
                    ? 'Hide note'
                    : 'بستن توضیح'
                  : isEn
                  ? '+ Note'
                  : '+ افزودن توضیح'}
              </button>
            </div>
          </div>
        )}

        {/* Footer navigation links */}
        <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
          <span className="font-mono text-[10px] opacity-65 truncate">
            {card.approvalId}
          </span>
          <div className="flex items-center gap-1.5">
            {card.canOpenEntity &&
              (card.targetEntityType === 'device' || card.targetEntityType === 'server') && (
                <button
                  type="button"
                  onClick={handleOpenEntity}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-medium cursor-pointer transition ${
                    isSelf
                      ? 'bg-white/10 hover:bg-white/20 border-white/20 text-white'
                      : isLightMode
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                      : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
                  }`}
                >
                  <span>{isEn ? 'Inspect Target' : 'مشاهده تجهیز'}</span>
                  <ArrowUpRight className="w-2.5 h-2.5" />
                </button>
              )}
            <button
              type="button"
              onClick={() => dispatchOpenApprovalTicket(card.approvalId)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold cursor-pointer transition ${
                isSelf
                  ? 'bg-indigo-500/35 hover:bg-indigo-500/50 border-indigo-300/40 text-white'
                  : isLightMode
                  ? 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700'
                  : 'bg-indigo-500/15 hover:bg-indigo-500/25 border-indigo-500/35 text-indigo-300'
              }`}
            >
              <span>{isEn ? 'Open in Approvals' : 'باز کردن در صف تایید'}</span>
              <ArrowUpRight className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
