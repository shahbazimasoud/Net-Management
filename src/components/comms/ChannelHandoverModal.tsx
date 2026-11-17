import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  FileJson,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { CommsHandoverSummaryResponse } from '../../types';
import { fetchChannelHandover } from '../../services/commsApi';
import { useModalDock } from '../../context/ModalDockContext';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

const HANDOVER_MODAL_ID = 'comms-channel-handover-modal';

export interface HandoverModalTriggerDetail {
  channelId: string;
  channelName?: string;
}

export function dispatchOpenChannelHandover(detail: HandoverModalTriggerDetail): void {
  if (typeof window === 'undefined' || !detail.channelId) return;
  window.dispatchEvent(
    new CustomEvent<HandoverModalTriggerDetail>('nettop-open-channel-handover', {
      detail,
    })
  );
}

export interface ChannelHandoverModalProps {
  isEn: boolean;
  isLightMode: boolean;
  isRtl: boolean;
}

export const ChannelHandoverModal: React.FC<ChannelHandoverModalProps> = ({
  isEn,
  isLightMode,
  isRtl,
}) => {
  const { dockModal, undockModal } = useModalDock();
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [channelLabel, setChannelLabel] = useState('');
  const [windowLimit, setWindowLimit] = useState<number>(150);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [handover, setHandover] = useState<CommsHandoverSummaryResponse | null>(null);
  const [copiedMd, setCopiedMd] = useState(false);

  const loadReport = useCallback(
    async (targetChannelId: string, limitVal: number) => {
      if (!targetChannelId) return;
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetchChannelHandover(targetChannelId, { limit: limitVal });
        setHandover(res);
      } catch (err: any) {
        setErrorMsg(
          isEn
            ? err?.message || 'Failed to generate RBAC shift handover report.'
            : err?.errorFa || err?.message || 'خطا در تولید گزارش تحویل شیفت.'
        );
      } finally {
        setLoading(false);
      }
    },
    [isEn]
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<HandoverModalTriggerDetail>)?.detail;
      if (!detail?.channelId) return;
      setChannelId(detail.channelId);
      setChannelLabel(detail.channelName || detail.channelId);
      setHandover(null);
      setCopiedMd(false);
      setIsOpen(true);
      undockModal(HANDOVER_MODAL_ID);
      void loadReport(detail.channelId, windowLimit);
    };
    window.addEventListener('nettop-open-channel-handover', handler as EventListener);
    return () =>
      window.removeEventListener('nettop-open-channel-handover', handler as EventListener);
  }, [loadReport, undockModal, windowLimit]);

  const handleClose = () => {
    setIsOpen(false);
    setHandover(null);
    undockModal(HANDOVER_MODAL_ID);
  };

  const handleMinimize = () => {
    setIsOpen(false);
    dockModal({
      id: HANDOVER_MODAL_ID,
      labelEn: channelLabel ? `Handover (${channelLabel})` : 'Shift Handover',
      labelFa: channelLabel ? `گزارش شیفت (${channelLabel})` : 'گزارش تحویل شیفت',
      category: 'tools',
      onRestore: () => setIsOpen(true),
      onClose: () => {
        setIsOpen(false);
        setHandover(null);
      },
    });
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const activeMarkdown = handover ? (isEn ? handover.markdownEn : handover.markdown) : '';

  const handleCopyMarkdown = () => {
    if (!activeMarkdown || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(activeMarkdown)
      .then(() => {
        setCopiedMd(true);
        setTimeout(() => setCopiedMd(false), 1800);
      })
      .catch(() => {});
  };

  const triggerDownload = (content: string, ext: 'md' | 'json', mime: string) => {
    if (!handover) return;
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shift-handover-${handover.channelId}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div
        className={`flex flex-col border shadow-2xl overflow-hidden transition-all ${
          isMaximized
            ? 'w-full h-full rounded-xl'
            : 'w-full max-w-4xl max-h-full rounded-2xl'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-slate-900 border-slate-700/80 text-slate-100'
        }`}
      >
        {/* Header with Mandatory 3 Controls */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/75 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`p-2 rounded-xl border shrink-0 ${
                isLightMode
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                  : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
              }`}
            >
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate">
                {isEn
                  ? 'Shift & Incident Handover Export'
                  : 'گزارش تحویل شیفت و خلاصه رخداد کانال'}
              </h3>
              <p className="text-[11px] opacity-75 truncate">
                {handover
                  ? isEn
                    ? handover.channelNameEn || handover.channelName
                    : handover.channelName
                  : channelLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <FieldInfoTooltip
              title={isEn ? 'RBAC-Filtered Handover Export' : 'گزارش‌گیری امن مطابق RBAC'}
              whatIsIt={
                isEn
                  ? 'Compiles participants, permitted device/server references, ChatOps probes, scrubbed snippets, and approval tickets into a Markdown or JSON report.'
                  : 'خلاصه مشارکت‌کنندگان، تجهیزات مجاز، تست‌های شبکه، اسنیپت‌های پاکسازی‌شده و تیکت‌های تایید را در قالب Markdown یا JSON استخراج می‌کند.'
              }
              whyNeeded={
                isEn
                  ? 'Accelerates SOC/NOC shift transitions while strictly excluding any restricted devices, servers, approvals, or secrets outside the caller RBAC policy.'
                  : 'تحویل شیفت مهندسان شبکه را تسریع کرده و همزمان از نشت اطلاعات تجهیزات یا تیکت‌های خارج از سطح دسترسی کاربر جلوگیری می‌کند.'
              }
              practicalExample={
                isEn
                  ? 'Export the last 150 thread messages at shift end as a Markdown brief for the incoming engineer.'
                  : 'خروجی گرفتن از ۱۵۰ پیام اخیر کانال در پایان شیفت برای تحویل به مهندس شیفت بعدی.'
              }
              isEn={isEn}
              isLightMode={isLightMode}
            />
            <ModalHeaderControls
              isMaximized={isMaximized}
              onMaximizeToggle={() => setIsMaximized((v) => !v)}
              onMinimize={handleMinimize}
              onClose={handleClose}
              isLightMode={isLightMode}
              isEn={isEn}
            />
          </div>
        </div>

        {/* Controls Bar */}
        <div
          className={`px-4 py-2.5 border-b flex items-center justify-between gap-2 flex-wrap shrink-0 ${
            isLightMode ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-950/40 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold opacity-80">
              {isEn ? 'Message Window:' : 'بازه پیام‌ها:'}
            </span>
            <select
              value={windowLimit}
              onChange={(e) => {
                const next = Number(e.target.value) || 150;
                setWindowLimit(next);
                void loadReport(channelId, next);
              }}
              className={`px-2 py-1 rounded-lg border text-xs outline-none ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-900'
                  : 'bg-slate-950 border-white/15 text-slate-100'
              }`}
            >
              <option value={50}>{isEn ? 'Last 50 messages' : '۵۰ پیام اخیر'}</option>
              <option value={150}>{isEn ? 'Last 150 messages' : '۱۵۰ پیام اخیر'}</option>
              <option value={200}>{isEn ? 'Last 200 messages' : '۲۰۰ پیام اخیر'}</option>
            </select>
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadReport(channelId, windowLimit)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition ${
                isLightMode
                  ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                  : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{isEn ? 'Refresh' : 'تازه‌سازی'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!handover}
              onClick={handleCopyMarkdown}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition disabled:opacity-45 ${
                isLightMode
                  ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
                  : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-100'
              }`}
            >
              {copiedMd ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>
                {copiedMd
                  ? isEn
                    ? 'Copied'
                    : 'کپی شد'
                  : isEn
                  ? 'Copy Markdown'
                  : 'کپی Markdown'}
              </span>
            </button>

            <button
              type="button"
              disabled={!handover}
              onClick={() =>
                triggerDownload(activeMarkdown, 'md', 'text/markdown;charset=utf-8')
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer transition disabled:opacity-45"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isEn ? 'Download .md' : 'دانلود .md'}</span>
            </button>

            <button
              type="button"
              disabled={!handover}
              onClick={() =>
                triggerDownload(
                  JSON.stringify(handover, null, 2),
                  'json',
                  'application/json;charset=utf-8'
                )
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition disabled:opacity-45 ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                  : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
              }`}
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>.json</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar space-y-3">
          {loading && !handover ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-xs opacity-75">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              <span>
                {isEn
                  ? 'Compiling RBAC-filtered shift handover report...'
                  : 'در حال گردآوری گزارش تحویل شیفت با فیلتر RBAC...'}
              </span>
            </div>
          ) : errorMsg ? (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          ) : handover ? (
            <>
              {/* Security & RBAC Notice */}
              <div
                className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 flex-wrap ${
                  isLightMode
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>
                    {isEn
                      ? 'Zero-Leak RBAC Projection active: Restricted devices, servers, approvals, and scrubbed secrets are excluded.'
                      : 'فیلتر امنیتی Zero-Leak فعال است: تجهیزات، سرورها و تیکت‌های خارج از دسترسی و اسرار پاکسازی‌شده در این گزارش افشا نمی‌شوند.'}
                  </span>
                </div>
                {handover.stats.restrictedItemsRedactedCount > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                      isLightMode
                        ? 'bg-amber-100 border-amber-300 text-amber-900'
                        : 'bg-amber-500/20 border-amber-500/35 text-amber-200'
                    }`}
                  >
                    {isEn
                      ? `${handover.stats.restrictedItemsRedactedCount} restricted item(s) redacted`
                      : `${handover.stats.restrictedItemsRedactedCount} مورد محدودشده فیلتر شد`}
                  </span>
                )}
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                {[
                  {
                    label: isEn ? 'Messages' : 'پیام‌ها',
                    val: handover.stats.totalMessagesEvaluated,
                  },
                  {
                    label: isEn ? 'Participants' : 'اعضا',
                    val: handover.stats.participantCount,
                  },
                  {
                    label: isEn ? 'Entities' : 'تجهیزات',
                    val: handover.stats.permittedMentionsCount,
                  },
                  {
                    label: isEn ? 'Diagnostics' : 'تست شبکه',
                    val: handover.stats.diagnosticsCount,
                  },
                  {
                    label: isEn ? 'Snippets' : 'اسنیپت‌ها',
                    val: handover.stats.snippetsCount,
                  },
                  {
                    label: isEn ? 'Approvals' : 'تیکت تایید',
                    val: handover.stats.approvalsCount,
                  },
                ].map((k) => (
                  <div
                    key={k.label}
                    className={`px-3 py-2 rounded-xl border ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-slate-950/60 border-white/10'
                    }`}
                  >
                    <div className="text-[10.5px] opacity-75 truncate">{k.label}</div>
                    <div className="text-base font-extrabold tabular-nums mt-0.5">{k.val}</div>
                  </div>
                ))}
              </div>

              {/* Markdown Preview */}
              <div
                className={`rounded-xl border p-3.5 font-mono text-xs leading-relaxed whitespace-pre-wrap overflow-x-auto ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-200 text-slate-800'
                    : 'bg-slate-950 border-slate-800 text-slate-200'
                }`}
              >
                {activeMarkdown}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
};
