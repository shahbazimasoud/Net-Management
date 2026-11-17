import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  CheckCircle2,
  FileCode2,
  GitCompare,
  Hash,
  MessageSquare,
  Router,
  ScrollText,
  Search,
  Send,
  Server,
  ShieldCheck,
  Terminal,
  User,
} from 'lucide-react';
import {
  ApprovalRiskLevel,
  ApprovalTargetEntityType,
  CommsChannel,
  CommsSeverity,
  CommsSnippetSharePayload,
} from '../../types';
import {
  fetchCommsChannels,
  shareChannelApproval,
  shareChannelSnippet,
} from '../../services/commsApi';
import { useModalDock } from '../../context/ModalDockContext';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

const SHARE_TO_CHAT_MODAL_ID = 'comms-share-snippet-modal';

export interface ShareApprovalToChatDraft {
  approvalId: string;
  requestedAction: string;
  targetEntityType: ApprovalTargetEntityType | string;
  targetEntityId: string;
  targetEntityName?: string | null;
  riskLevel: ApprovalRiskLevel;
  status: string;
  commandPreview?: string | null;
}

export function dispatchShareToTeamChat(payload: CommsSnippetSharePayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<CommsSnippetSharePayload>('nettop-open-share-to-chat', {
      detail: payload,
    })
  );
}

export function dispatchShareApprovalToTeamChat(payload: ShareApprovalToChatDraft): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ShareApprovalToChatDraft>('nettop-open-share-approval-to-chat', {
      detail: payload,
    })
  );
}

export interface ShareToChatModalProps {
  isEn: boolean;
  isLightMode: boolean;
  isRtl: boolean;
  onShared?: (channelName: string) => void;
}

export const ShareToChatModal: React.FC<ShareToChatModalProps> = ({
  isEn,
  isLightMode,
  isRtl,
  onShared,
}) => {
  const { dockModal, undockModal } = useModalDock();
  const [draft, setDraft] = useState<CommsSnippetSharePayload | null>(null);
  const [approvalDraft, setApprovalDraft] = useState<ShareApprovalToChatDraft | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const [channels, setChannels] = useState<CommsChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelSearch, setChannelSearch] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState('');

  const [editableContent, setEditableContent] = useState('');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<CommsSeverity>('info');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sentOk, setSentOk] = useState(false);

  const loadChannelsList = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const list = await fetchCommsChannels(true);
      setChannels(list);
      setSelectedChannelId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id || '';
      });
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          (isEn ? 'Failed to load team chat channels.' : 'خطا در دریافت لیست کانال‌های چت.')
      );
    } finally {
      setChannelsLoading(false);
    }
  }, [isEn]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<CommsSnippetSharePayload>)?.detail;
      if (!detail || !detail.sourceEntityId || !detail.content) return;
      setApprovalDraft(null);
      setDraft(detail);
      setEditableContent(detail.content);
      setNote(detail.note || '');
      setPriority(detail.priority || 'info');
      setErrorMsg(null);
      setSentOk(false);
      setIsOpen(true);
      undockModal(SHARE_TO_CHAT_MODAL_ID);
      void loadChannelsList();
    };
    const approvalHandler = (e: Event) => {
      const detail = (e as CustomEvent<ShareApprovalToChatDraft>)?.detail;
      if (!detail || !detail.approvalId) return;
      setDraft(null);
      setApprovalDraft(detail);
      setEditableContent('');
      setNote('');
      setPriority(
        detail.riskLevel === 'critical'
          ? 'critical'
          : detail.riskLevel === 'high'
          ? 'warning'
          : 'info'
      );
      setErrorMsg(null);
      setSentOk(false);
      setIsOpen(true);
      undockModal(SHARE_TO_CHAT_MODAL_ID);
      void loadChannelsList();
    };
    window.addEventListener('nettop-open-share-to-chat', handler as EventListener);
    window.addEventListener('nettop-open-share-approval-to-chat', approvalHandler as EventListener);
    return () => {
      window.removeEventListener('nettop-open-share-to-chat', handler as EventListener);
      window.removeEventListener(
        'nettop-open-share-approval-to-chat',
        approvalHandler as EventListener
      );
    };
  }, [loadChannelsList, undockModal]);

  const filteredChannels = useMemo(() => {
    const q = channelSearch.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.nameEn || '').toLowerCase().includes(q)
    );
  }, [channels, channelSearch]);

  const handleClose = () => {
    setIsOpen(false);
    setDraft(null);
    setApprovalDraft(null);
    undockModal(SHARE_TO_CHAT_MODAL_ID);
  };

  const handleMinimize = () => {
    setIsOpen(false);
    dockModal({
      id: SHARE_TO_CHAT_MODAL_ID,
      labelEn: approvalDraft
        ? `Share Ticket (${approvalDraft.approvalId})`
        : draft?.sourceEntityName
        ? `Share Snippet (${draft.sourceEntityName})`
        : 'Share to Team Chat',
      labelFa: approvalDraft
        ? `ارجاع تیکت تایید`
        : draft?.sourceEntityName
        ? `ارسال اسنیپت (${draft.sourceEntityName})`
        : 'ارسال به چت تیمی',
      category: 'system',
      onRestore: () => setIsOpen(true),
      onClose: () => {
        setIsOpen(false);
        setDraft(null);
        setApprovalDraft(null);
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!draft && !approvalDraft) || !selectedChannelId || sending) return;
    if (draft && !editableContent.trim()) return;
    setSending(true);
    setErrorMsg(null);
    try {
      if (approvalDraft) {
        await shareChannelApproval(selectedChannelId, {
          approvalId: approvalDraft.approvalId,
          note: note.trim() || undefined,
          priority,
        });
      } else if (draft) {
        await shareChannelSnippet(selectedChannelId, {
          ...draft,
          content: editableContent,
          note: note.trim() || undefined,
          priority,
        });
      }
      const chosen = channels.find((c) => c.id === selectedChannelId);
      const chName = chosen ? (isEn ? chosen.nameEn || chosen.name : chosen.name) : '';
      setSentOk(true);
      onShared?.(chName);
      setTimeout(() => {
        setIsOpen(false);
        setDraft(null);
        setApprovalDraft(null);
        undockModal(SHARE_TO_CHAT_MODAL_ID);
      }, 450);
    } catch (err: any) {
      setErrorMsg(
        isEn
          ? err?.message || 'Failed to share item to Team Chat.'
          : err?.errorFa || err?.message || 'خطا در اشتراک‌گذاری در چت تیمی.'
      );
    } finally {
      setSending(false);
    }
  };

  if (!isOpen || (!draft && !approvalDraft) || typeof document === 'undefined') return null;

  const sourceLabel = approvalDraft
    ? isEn
      ? 'Approval Ticket Card'
      : 'کارت تیکت تایید'
    : draft?.sourceType === 'backup_diff'
    ? isEn
      ? 'Backup / Config Diff'
      : 'مقایسه بکاپ / کانفیگ'
    : draft?.sourceType === 'device_log'
    ? isEn
      ? 'Device Syslog'
      : 'لاگ تجهیز شبکه'
    : draft?.sourceType === 'server_log'
    ? isEn
      ? 'Server Audit Log'
      : 'لاگ سرور'
    : isEn
    ? 'Terminal CLI Output'
    : 'خروجی زنده ترمینال';

  const sourceIcon = approvalDraft ? (
    <ShieldCheck className="w-4 h-4 text-amber-500" />
  ) : draft?.sourceType === 'backup_diff' ? (
    <GitCompare className="w-4 h-4 text-cyan-500" />
  ) : draft?.sourceType === 'device_log' || draft?.sourceType === 'server_log' ? (
    <ScrollText className="w-4 h-4 text-indigo-500" />
  ) : (
    <Terminal className="w-4 h-4 text-emerald-500" />
  );

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div
        className={`flex flex-col border shadow-2xl overflow-hidden transition-all ${
          isMaximized
            ? 'w-full h-full rounded-xl'
            : 'w-full max-w-2xl max-h-full rounded-2xl'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-slate-900 border-slate-700/80 text-slate-100'
        }`}
      >
        {/* Header with mandatory 3 buttons */}
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
              {sourceIcon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold truncate">
                  {approvalDraft
                    ? isEn
                      ? 'Share Approval Ticket to Team Chat'
                      : 'ارجاع تیکت تایید در چت تیمی'
                    : isEn
                    ? 'Share Output to Team Chat'
                    : 'اشتراک‌گذاری خروجی در چت تیمی'}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border shrink-0 ${
                    isLightMode
                      ? 'bg-slate-100 border-slate-300 text-slate-700'
                      : 'bg-white/10 border-white/15 text-slate-200'
                  }`}
                >
                  {sourceLabel}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] opacity-75 mt-0.5 truncate">
                {(approvalDraft?.targetEntityType || draft?.sourceEntityType) === 'server' ? (
                  <Server className="w-3 h-3 shrink-0" />
                ) : (
                  <Router className="w-3 h-3 shrink-0" />
                )}
                <span className="truncate font-medium">
                  {approvalDraft
                    ? approvalDraft.targetEntityName || approvalDraft.targetEntityId
                    : draft?.sourceEntityName || draft?.sourceEntityId}
                </span>
                {draft?.sourceEntityIp && (
                  <span className="font-mono">({draft.sourceEntityIp})</span>
                )}
                {approvalDraft && (
                  <span className="font-mono opacity-80">({approvalDraft.approvalId})</span>
                )}
                {draft?.filePath && (
                  <span className="font-mono truncate inline-flex items-center gap-1">
                    <FileCode2 className="w-3 h-3 shrink-0" />
                    {draft.filePath}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <FieldInfoTooltip
              title={isEn ? 'Zero-Leak RBAC & Secret Scrubbing' : 'حفاظت RBAC و پاکسازی اسرار'}
              whatIsIt={
                isEn
                  ? 'Publishes a read-only code/diff card into a Team Chat channel bound to the source device or server RBAC policy.'
                  : 'کارت خروجی یا تغییرات را با اتصال به سیاست دسترسی RBAC تجهیز/سرور مبدا در کانال چت منتشر می‌کند.'
              }
              whyNeeded={
                isEn
                  ? 'Before saving, the backend masks plaintext passwords, SNMP communities, tokens, and private keys, and hides the card from unauthorized viewers.'
                  : 'سرور پیش از ذخیره، رمزها و کلیدهای محرمانه را به صورت خودکار پاکسازی کرده و برای کاربران غیرمجاز کارت قفل‌شده نمایش می‌دهد.'
              }
              practicalExample={
                isEn
                  ? 'Share Nginx config diff or switch port debug logs with the NOC bridge channel.'
                  : 'اشتراک‌گذاری تغییرات کانفیگ Nginx یا لاگ پورت سوئیچ با کانال عملیات NOC.'
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

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3 flex-1 overflow-y-auto custom-scrollbar">
          {/* Security Notice */}
          <div
            className={`px-3 py-2 rounded-xl border text-xs flex items-center gap-2 ${
              isLightMode
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>
              {isEn
                ? 'Server-side secret scrubbing active: passwords, SNMP strings, tokens, and private keys are automatically masked before delivery. Viewers without RBAC permission will see a restricted lock card.'
                : 'پاکسازی سمت سرور فعال است: رمزهای عبور، کلیدهای SNMP، توکن‌ها و کلیدهای خصوصی پیش از ذخیره به‌صورت خودکار ماسک می‌شوند و تنها کاربران مجاز در RBAC محتوا را می‌بینند.'}
            </span>
          </div>

          {/* Destination Channel Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold">
                {isEn ? 'Target Team Channel / Direct Chat' : 'انتخاب کانال یا گفتگوی مقصد'}
              </label>
              <div className="relative w-48">
                <Search
                  className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 ${
                    isRtl ? 'right-2.5' : 'left-2.5'
                  } text-slate-400`}
                />
                <input
                  type="text"
                  value={channelSearch}
                  onChange={(e) => setChannelSearch(e.target.value)}
                  placeholder={isEn ? 'Filter chats...' : 'جستجوی کانال...'}
                  className={`w-full py-1 ${
                    isRtl ? 'pr-8 pl-2' : 'pl-8 pr-2'
                  } rounded-lg border text-[11px] outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-slate-950 border-slate-700 text-white'
                  }`}
                />
              </div>
            </div>

            <div
              className={`max-h-32 overflow-y-auto custom-scrollbar rounded-xl border p-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              {channelsLoading ? (
                <p className="text-xs text-slate-400 p-2 col-span-2">
                  {isEn ? 'Loading team chats...' : 'در حال بارگذاری کانال‌ها...'}
                </p>
              ) : filteredChannels.length === 0 ? (
                <p className="text-xs text-slate-400 p-2 col-span-2">
                  {isEn
                    ? 'No team channels available. Create a channel or direct chat in Team Communications first.'
                    : 'هیچ کانال یا گفتگویی یافت نشد. ابتدا در مرکز ارتباطات یک گفتگو ایجاد کنید.'}
                </p>
              ) : (
                filteredChannels.map((ch) => {
                  const active = ch.id === selectedChannelId;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => setSelectedChannelId(ch.id)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs text-start cursor-pointer transition ${
                        active
                          ? 'bg-indigo-600 border-indigo-600 text-white font-semibold'
                          : isLightMode
                          ? 'bg-white border-slate-200 text-slate-800 hover:bg-slate-100'
                          : 'bg-white/5 border-transparent text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      {ch.channelType === 'direct' ? (
                        <User className="w-3.5 h-3.5 shrink-0" />
                      ) : ch.channelType === 'group' ? (
                        <Hash className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="truncate">
                        {isEn ? ch.nameEn || ch.name : ch.name}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Note & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold mb-1">
                {isEn ? 'Operator Note (Optional)' : 'توضیح تکمیلی اپراتور (اختیاری)'}
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  isEn
                    ? 'e.g. Check interface CRC errors on uplink before failover...'
                    : 'مثال: بررسی خطاهای اینترفیس و مقایسه تغییرات قبل از اعمال...'
                }
                className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-900'
                    : 'bg-slate-950 border-slate-700 text-white'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                {isEn ? 'Priority' : 'اولویت'}
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as CommsSeverity)}
                className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-900'
                    : 'bg-slate-950 border-slate-700 text-white'
                }`}
              >
                <option value="info">{isEn ? 'Normal' : 'عادی'}</option>
                <option value="warning">{isEn ? 'Warning' : 'هشدار'}</option>
                <option value="critical">{isEn ? 'Critical' : 'بحرانی'}</option>
              </select>
            </div>
          </div>

          {/* Approval Preview OR Editable Snippet / Diff Preview */}
          {approvalDraft ? (
            <div
              className={`rounded-xl border p-3 text-xs space-y-1.5 ${
                isLightMode
                  ? 'bg-slate-50 border-slate-200 text-slate-800'
                  : 'bg-slate-950/70 border-slate-800 text-slate-100'
              }`}
            >
              <div className="font-bold">{approvalDraft.requestedAction}</div>
              <div className="text-[11px] opacity-80 font-mono">
                {approvalDraft.approvalId} · {approvalDraft.status} · {approvalDraft.riskLevel}
              </div>
              {approvalDraft.commandPreview && (
                <pre
                  dir="ltr"
                  className="mt-1 p-2 rounded-lg bg-slate-950 border border-slate-700 text-emerald-300 font-mono text-[11px] overflow-x-auto"
                >
                  {approvalDraft.commandPreview}
                </pre>
              )}
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold">
                  {isEn
                    ? 'Captured Snippet / Diff Preview (Editable before sending)'
                    : 'پیش‌نمایش متن خروجی / تغییرات (قابل ویرایش پیش از ارسال)'}
                </label>
                <span className="text-[10.5px] font-mono opacity-75">
                  {editableContent.split('\n').length} {isEn ? 'lines' : 'خط'}
                </span>
              </div>
              <textarea
                dir="ltr"
                rows={isMaximized ? 14 : 8}
                value={editableContent}
                onChange={(e) => setEditableContent(e.target.value)}
                spellCheck={false}
                className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 font-mono text-[11px] leading-relaxed outline-none focus:border-indigo-500 resize-y"
              />
            </div>
          )}

          {errorMsg && (
            <div
              className={`px-3 py-2 rounded-lg border text-xs flex items-center gap-2 ${
                isLightMode
                  ? 'border-rose-300 bg-rose-50 text-rose-800'
                  : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {sentOk && (
            <div
              className={`px-3 py-2 rounded-lg border text-xs flex items-center gap-2 ${
                isLightMode
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                {isEn ? 'Shared securely to Team Chat.' : 'با موفقیت در چت تیمی به اشتراک گذاشته شد.'}
              </span>
            </div>
          )}

          <div
            className={`flex justify-end gap-2 pt-2 border-t ${
              isLightMode ? 'border-slate-200' : 'border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={handleClose}
              className={`px-4 py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                  : 'bg-white/5 border-white/15 text-slate-200 hover:bg-white/10'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>
            <button
              type="submit"
              disabled={!selectedChannelId || (!approvalDraft && !editableContent.trim()) || sending}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-45 transition"
            >
              <Send className={`w-3.5 h-3.5 ${isRtl ? 'rotate-180' : ''}`} />
              <span>
                {sending
                  ? isEn
                    ? 'Scrubbing & Sending...'
                    : 'در حال پاکسازی و ارسال...'
                  : isEn
                  ? 'Share to Channel'
                  : 'ارسال به چت تیمی'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
