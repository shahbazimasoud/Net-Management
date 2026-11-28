import React, { useState, useEffect, useCallback } from 'react';
import {
  Megaphone,
  CheckCircle2,
  MailOpen,
  Clock,
  RefreshCw,
  AlertCircle,
  Users,
} from 'lucide-react';
import {
  CommsAnnouncementReadReceipt,
  CommsAnnouncementSummary,
} from '../../types';
import { useLanguage } from '../../i18n';
import {
  fetchAnnouncementReceipts,
  fetchSentAnnouncements,
} from '../../services/commsApi';
import { appDataCache } from '../../services/dataCache';
import { SafeRichMessageContent } from './SafeRichMessageContent';

interface AnnouncementTrackerPaneProps {
  isLightMode: boolean;
  liveRevision: number;
  onOpenComposeAnnouncement?: () => void;
}

export const AnnouncementTrackerPane: React.FC<AnnouncementTrackerPaneProps> = ({
  isLightMode,
  liveRevision,
  onOpenComposeAnnouncement,
}) => {
  const { isEn, isRtl } = useLanguage();

  const optimisticList = appDataCache.getOptimistic<CommsAnnouncementSummary[]>(
    'comms:announcements:sent'
  );
  const [announcements, setAnnouncements] = useState<CommsAnnouncementSummary[]>(
    optimisticList || []
  );
  const [listLoading, setListLoading] = useState<boolean>(!optimisticList);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(
    optimisticList?.[0]?.messageId || null
  );

  const [selectedSummary, setSelectedSummary] = useState<CommsAnnouncementSummary | null>(null);
  const [receipts, setReceipts] = useState<CommsAnnouncementReadReceipt[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadAnnouncements = useCallback(
    async (forceRefresh = false) => {
      if (announcements.length === 0) setListLoading(true);
      setErrorMsg(null);
      try {
        const list = await fetchSentAnnouncements(forceRefresh);
        setAnnouncements(list);
        setSelectedMsgId((prev) => {
          if (prev && list.some((a) => a.messageId === prev)) return prev;
          return list[0]?.messageId || null;
        });
      } catch (err: any) {
        setErrorMsg(
          err?.message ||
            (isEn ? 'Failed to load sent announcements' : 'خطا در دریافت فهرست اطلاعیه‌ها')
        );
      } finally {
        setListLoading(false);
      }
    },
    [announcements.length, isEn]
  );

  const loadReceipts = useCallback(
    async (messageId: string, forceRefresh = false) => {
      setReceiptsLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetchAnnouncementReceipts(messageId, forceRefresh);
        setSelectedSummary(res.announcement);
        setReceipts(res.recipients || []);
      } catch (err: any) {
        setErrorMsg(
          err?.message ||
            (isEn ? 'Failed to load recipient receipts' : 'خطا در دریافت وضعیت مطالعه گیرندگان')
        );
      } finally {
        setReceiptsLoading(false);
      }
    },
    [isEn]
  );

  useEffect(() => {
    loadAnnouncements(liveRevision > 0);
  }, [liveRevision]);

  useEffect(() => {
    if (selectedMsgId) {
      loadReceipts(selectedMsgId, liveRevision > 0);
    } else {
      setSelectedSummary(null);
      setReceipts([]);
    }
  }, [selectedMsgId, liveRevision]);

  const formatTime = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(isEn ? 'en-US' : 'fa-IR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {errorMsg && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-2 rounded-xl border text-xs ${
            isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </span>
          <button
            type="button"
            onClick={() => loadAnnouncements(true)}
            className="text-xs underline cursor-pointer"
          >
            {isEn ? 'Retry' : 'تلاش مجدد'}
          </button>
        </div>
      )}

      <div
        className={`flex-1 grid grid-cols-1 lg:grid-cols-12 rounded-2xl border overflow-hidden min-h-[540px] ${
          isLightMode
            ? 'bg-white border-slate-200 shadow-xs'
            : 'bg-slate-900/70 border-white/10'
        }`}
      >
        {/* Left: Dispatched Announcements List */}
        <aside
          className={`lg:col-span-5 xl:col-span-4 border-b lg:border-b-0 ${
            isRtl ? 'lg:border-l' : 'lg:border-r'
          } ${
            isLightMode ? 'border-slate-200 bg-slate-50/60' : 'border-white/10 bg-slate-950/35'
          } flex flex-col`}
        >
          <div
            className={`px-4 py-3 border-b flex items-center justify-between ${
              isLightMode ? 'border-slate-200' : 'border-white/10'
            }`}
          >
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-indigo-500" />
              <h3 className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                {isEn ? 'Sent Announcements' : 'اطلاعیه‌های ارسال‌شده'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => loadAnnouncements(true)}
              className={`p-1.5 rounded-lg border cursor-pointer transition ${
                isLightMode
                  ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                  : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-300'
              }`}
              title={isEn ? 'Refresh' : 'تازه‌سازی'}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-200/70 dark:divide-white/5">
            {listLoading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-16 rounded-xl animate-pulse ${
                      isLightMode ? 'bg-slate-200/70' : 'bg-white/5'
                    }`}
                  />
                ))}
              </div>
            ) : announcements.length === 0 ? (
              <div className="p-8 text-center">
                <Megaphone
                  className={`w-9 h-9 mx-auto mb-2.5 ${
                    isLightMode ? 'text-slate-300' : 'text-slate-600'
                  }`}
                />
                <p
                  className={`text-xs mb-3 ${
                    isLightMode ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  {isEn
                    ? 'No official announcements have been dispatched yet.'
                    : 'هنوز هیچ اطلاعیه رسمی ارسال نشده است.'}
                </p>
                {onOpenComposeAnnouncement && (
                  <button
                    type="button"
                    onClick={onOpenComposeAnnouncement}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
                  >
                    {isEn ? 'Send Announcement' : 'ارسال اولین اطلاعیه'}
                  </button>
                )}
              </div>
            ) : (
              announcements.map((ann) => {
                const active = ann.messageId === selectedMsgId;
                const readPct =
                  ann.totalRecipients > 0
                    ? Math.round((ann.readCount / ann.totalRecipients) * 100)
                    : 0;
                return (
                  <button
                    key={ann.messageId}
                    type="button"
                    onClick={() => setSelectedMsgId(ann.messageId)}
                    className={`w-full text-start px-4 py-3 transition cursor-pointer ${
                      active
                        ? isLightMode
                          ? 'bg-indigo-50'
                          : 'bg-indigo-500/15'
                        : isLightMode
                        ? 'hover:bg-slate-100/80'
                        : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span
                        className={`text-xs font-bold truncate ${
                          isLightMode ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {isEn ? ann.titleEn || ann.title : ann.title}
                      </span>
                      <span
                        className={`text-[11px] font-mono tabular-nums shrink-0 ${
                          isLightMode ? 'text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        {formatTime(ann.createdAt)}
                      </span>
                    </div>

                    <div
                      className={`flex items-center gap-2 text-[11px] tabular-nums mb-1.5 ${
                        isLightMode ? 'text-slate-600' : 'text-slate-400'
                      }`}
                    >
                      <span>
                        {isEn ? 'Read' : 'مطالعه‌شده'}: {ann.readCount}/{ann.totalRecipients}
                      </span>
                      {ann.requiresAcknowledgment && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {isEn ? 'Ack' : 'تاییدیه'}: {ann.acknowledgedCount}/{ann.totalRecipients}
                          </span>
                        </>
                      )}
                    </div>

                    <div
                      className={`h-1.5 rounded-full overflow-hidden ${
                        isLightMode ? 'bg-slate-200' : 'bg-white/10'
                      }`}
                    >
                      <div
                        className="h-full bg-indigo-600 transition-all"
                        style={{ width: `${readPct}%` }}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right: Per-Recipient Read & Acknowledgment Audit Table */}
        <section className="lg:col-span-7 xl:col-span-8 flex flex-col">
          {!selectedSummary ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Users
                className={`w-10 h-10 mb-3 ${
                  isLightMode ? 'text-slate-300' : 'text-slate-600'
                }`}
              />
              <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Select an announcement to inspect live per-user read & acknowledgment receipts.'
                  : 'یک اطلاعیه را انتخاب کنید تا وضعیت مطالعه و تاییدیه تک‌تک گیرندگان نمایش داده شود.'}
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto custom-scrollbar">
              {/* Announcement Overview */}
              <div
                className={`pb-4 border-b flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                  isLightMode ? 'border-slate-200' : 'border-white/10'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <h3
                    dir={selectedSummary.subjectDir || 'auto'}
                    className={`text-base font-bold ${
                      selectedSummary.subjectAlign === 'right'
                        ? 'text-right'
                        : selectedSummary.subjectAlign === 'left'
                        ? 'text-left'
                        : selectedSummary.subjectAlign === 'center'
                        ? 'text-center'
                        : selectedSummary.subjectDir === 'rtl'
                        ? 'text-right'
                        : selectedSummary.subjectDir === 'ltr'
                        ? 'text-left'
                        : ''
                    } ${isLightMode ? 'text-slate-900' : 'text-white'}`}
                  >
                    {isEn ? selectedSummary.titleEn || selectedSummary.title : selectedSummary.title}
                  </h3>
                  {selectedSummary.bodyHtml ? (
                    <SafeRichMessageContent
                      html={selectedSummary.bodyHtml}
                      dir={selectedSummary.bodyDir}
                      align={selectedSummary.bodyAlign}
                      isLightMode={isLightMode}
                      className="mt-1.5"
                    />
                  ) : (
                    <p
                      dir={selectedSummary.bodyDir || 'auto'}
                      className={`text-xs mt-1 whitespace-pre-wrap ${
                        selectedSummary.bodyAlign === 'right'
                          ? 'text-right'
                          : selectedSummary.bodyAlign === 'left'
                          ? 'text-left'
                          : selectedSummary.bodyAlign === 'center'
                          ? 'text-center'
                          : ''
                      } ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}
                    >
                      {selectedSummary.body}
                    </p>
                  )}
                </div>
                <div
                  className={`flex items-center gap-4 text-xs tabular-nums shrink-0 ${
                    isLightMode ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  <div>
                    <div className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'Read' : 'مطالعه'}
                    </div>
                    <div className="text-base font-bold font-mono">
                      {selectedSummary.readCount}/{selectedSummary.totalRecipients}
                    </div>
                  </div>
                  {selectedSummary.requiresAcknowledgment && (
                    <div>
                      <div className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isEn ? 'Acknowledged' : 'تایید رسمی'}
                      </div>
                      <div className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {selectedSummary.acknowledgedCount}/{selectedSummary.totalRecipients}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* High-Density Receipts Table */}
              <div
                className={`rounded-xl border overflow-hidden ${
                  isLightMode ? 'border-slate-200' : 'border-white/10'
                }`}
              >
                <table className="w-full text-xs">
                  <thead
                    className={
                      isLightMode
                        ? 'bg-slate-50 text-slate-600 border-b border-slate-200'
                        : 'bg-white/5 text-slate-400 border-b border-white/10'
                    }
                  >
                    <tr>
                      <th className="text-start px-3.5 py-2.5 font-semibold">
                        {isEn ? 'Recipient' : 'گیرنده'}
                      </th>
                      <th className="text-start px-3.5 py-2.5 font-semibold">
                        {isEn ? 'Role' : 'نقش'}
                      </th>
                      <th className="text-start px-3.5 py-2.5 font-semibold">
                        {isEn ? 'Read Status' : 'وضعیت مطالعه'}
                      </th>
                      <th className="text-start px-3.5 py-2.5 font-semibold">
                        {isEn ? 'Acknowledgment Receipt' : 'تاییدیه دریافت'}
                      </th>
                    </tr>
                  </thead>
                  <tbody
                    className={`divide-y ${
                      isLightMode ? 'divide-slate-100' : 'divide-white/5'
                    }`}
                  >
                    {receiptsLoading && receipts.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                          {isEn ? 'Loading receipts...' : 'در حال دریافت فهرست...'}
                        </td>
                      </tr>
                    ) : (
                      receipts.map((rec) => (
                        <tr
                          key={rec.notificationId}
                          className={
                            isLightMode ? 'hover:bg-slate-50/70' : 'hover:bg-white/[0.03]'
                          }
                        >
                          <td className="px-3.5 py-2.5">
                            <div
                              className={`font-semibold ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {rec.fullName || rec.recipientUsername}
                            </div>
                            <div
                              className={`text-[11px] font-mono ${
                                isLightMode ? 'text-slate-500' : 'text-slate-400'
                              }`}
                            >
                              {rec.recipientUsername}
                            </div>
                          </td>
                          <td
                            className={`px-3.5 py-2.5 ${
                              isLightMode ? 'text-slate-600' : 'text-slate-300'
                            }`}
                          >
                            {rec.role || '—'}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono tabular-nums">
                            {rec.isRead ? (
                              <span
                                className={`inline-flex items-center gap-1.5 ${
                                  isLightMode ? 'text-indigo-700' : 'text-indigo-300'
                                }`}
                              >
                                <MailOpen className="w-3.5 h-3.5" />
                                <span>{formatTime(rec.readAt)}</span>
                              </span>
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1.5 ${
                                  isLightMode ? 'text-slate-400' : 'text-slate-500'
                                }`}
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>{isEn ? 'Unread' : 'خوانده‌نشده'}</span>
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono tabular-nums">
                            {rec.acknowledgedAt ? (
                              <span
                                className={`inline-flex items-center gap-1.5 font-semibold ${
                                  isLightMode ? 'text-emerald-700' : 'text-emerald-400'
                                }`}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{formatTime(rec.acknowledgedAt)}</span>
                              </span>
                            ) : selectedSummary.requiresAcknowledgment ? (
                              <span
                                className={isLightMode ? 'text-amber-700' : 'text-amber-400'}
                              >
                                {isEn ? 'Pending' : 'در انتظار تایید'}
                              </span>
                            ) : (
                              <span className={isLightMode ? 'text-slate-400' : 'text-slate-500'}>
                                {isEn ? 'Not required' : 'الزامی نیست'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
