import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Mail,
  Bell,
  Clock,
  UserCheck,
  Building2,
  Copy,
  CheckCircle2,
  Send,
  Calendar,
  AlertCircle,
  ShieldAlert
} from 'lucide-react';

interface AlertRecipientsModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemTitle: string;
  itemType?: 'license' | 'contract';
  ownerEmail?: string;
  ownerName?: string;
  department?: string;
  notifyEmails?: string[];
  alertDays?: number[];
  endDate?: string;
  isLightMode?: boolean;
  isEn?: boolean;
  onSendTestAlert?: () => Promise<void> | void;
  isSendingTest?: boolean;
}

export const AlertRecipientsModal: React.FC<AlertRecipientsModalProps> = ({
  isOpen,
  onClose,
  itemTitle,
  itemType = 'license',
  ownerEmail,
  ownerName,
  department,
  notifyEmails = [],
  alertDays = [60, 30, 15, 7, 1],
  endDate,
  isLightMode = false,
  isEn = true,
  onSendTestAlert,
  isSendingTest = false,
}) => {
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEmail(text);
    setTimeout(() => {
      setCopiedEmail(null);
    }, 2000);
  };

  const allRecipients = Array.from(
    new Set([...(ownerEmail ? [ownerEmail] : []), ...notifyEmails.filter(Boolean)])
  );

  const handleCopyAll = () => {
    if (allRecipients.length === 0) return;
    handleCopy(allRecipients.join(', '));
  };

  const getDaysLeft = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      const target = new Date(dateStr).getTime();
      const now = new Date().getTime();
      return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  };

  const daysLeft = getDaysLeft(endDate);

  return createPortal(
    <div
      className="fixed inset-0 z-[999990] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md modal-backdrop-blur"
      data-modal-backdrop="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`w-full max-w-xl max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate">
                {isEn ? 'Notification & Expiry Alert Recipients' : 'گیرندگان هشدارهای انقضا و اعلان‌ها'}
              </h2>
              <p className="text-xs text-slate-400 truncate mt-0.5" title={itemTitle}>
                {itemTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {allRecipients.length > 0 && (
              <button
                type="button"
                onClick={handleCopyAll}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 transition-colors cursor-pointer"
                title={isEn ? 'Copy all recipient email addresses' : 'کپی تمام آدرس‌های ایمیل'}
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{isEn ? 'Copy All Emails' : 'کپی همه ایمیل‌ها'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-600'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-white'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Status summary banner */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
              daysLeft !== null && daysLeft <= 0
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : daysLeft !== null && daysLeft <= 30
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : isLightMode
                ? 'bg-sky-50 border-sky-200 text-sky-800'
                : 'bg-sky-950/40 border-sky-800/50 text-sky-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              <span>
                {endDate ? (
                  <>
                    <strong className="font-semibold">{isEn ? 'Expiry Date:' : 'تاریخ سررسید:'}</strong>{' '}
                    <span className="font-mono">{endDate}</span>
                    {daysLeft !== null && (
                      <span className="ml-2 font-bold">
                        ({daysLeft < 0 ? (isEn ? 'Expired' : 'منقضی شده') : isEn ? `${daysLeft} days remaining` : `${daysLeft} روز مانده`})
                      </span>
                    )}
                  </>
                ) : (
                  <span>{isEn ? 'No expiration date configured.' : 'تاریخ انقضایی تنظیم نشده است.'}</span>
                )}
              </span>
            </div>

            <span className="font-mono font-bold text-xs shrink-0">
              {allRecipients.length} {isEn ? (allRecipients.length === 1 ? 'recipient' : 'recipients') : 'گیرنده فعال'}
            </span>
          </div>

          {/* Section 1: Primary Responsible Person / Owner */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isEn ? 'Primary Owner & Department' : 'مسئول مستقیم و واحد سازمانی'}</span>
            </h3>

            {ownerEmail || ownerName || department ? (
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-xs sm:text-sm text-slate-200">
                      {ownerName || (isEn ? 'Designated Owner' : 'مسئول پرونده')}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {isEn ? 'Primary Contact' : 'مسئول اصلی'}
                    </span>
                  </div>
                  {department && (
                    <p className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-slate-500" />
                      <span>{department}</span>
                    </p>
                  )}
                  {ownerEmail && (
                    <p className="text-xs font-mono text-sky-400 flex items-center gap-1">
                      <Mail className="w-3 h-3 text-sky-500" />
                      <span>{ownerEmail}</span>
                    </p>
                  )}
                </div>

                {ownerEmail && (
                  <button
                    type="button"
                    onClick={() => handleCopy(ownerEmail)}
                    className={`p-2 rounded-lg border transition-colors cursor-pointer shrink-0 ${
                      copiedEmail === ownerEmail
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : isLightMode
                        ? 'bg-white hover:bg-slate-100 text-slate-600 border-slate-300'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                    title={isEn ? 'Copy email' : 'کپی ایمیل'}
                  >
                    {copiedEmail === ownerEmail ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic p-3 rounded-lg border border-dashed border-slate-800">
                {isEn ? 'No primary owner contact specified.' : 'مسئول یا ایمیل مستقیمی ثبت نشده است.'}
              </p>
            )}
          </div>

          {/* Section 2: Configured Alert Notification Emails */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-sky-400" />
              <span>{isEn ? 'Notification Dispatch List (Email)' : 'فهرست ایمیل‌های دریافت‌کننده هشدار'}</span>
            </h3>

            {notifyEmails.length === 0 ? (
              <div
                className={`p-4 rounded-xl border text-center text-xs ${
                  isLightMode ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-slate-950/40 border-slate-800 text-slate-400'
                }`}
              >
                <AlertCircle className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                <p>
                  {isEn
                    ? 'No secondary alert emails added to this record. Alerts will only be routed to the primary owner if an email exists.'
                    : 'هیچ ایمیل دیگری در لیست هشدار ثبت نشده است. اعلان‌ها صرفاً به ایمیل مسئول اصلی (در صورت وجود) ارسال خواهد شد.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {notifyEmails.map((email, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-colors ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center font-bold text-xs shrink-0">
                        {i + 1}
                      </div>
                      <span className="font-mono text-slate-200 truncate select-all">{email}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopy(email)}
                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer shrink-0 ${
                        copiedEmail === email
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : isLightMode
                          ? 'bg-white hover:bg-slate-100 text-slate-600 border-slate-300'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                      }`}
                      title={isEn ? 'Copy email' : 'کپی ایمیل'}
                    >
                      {copiedEmail === email ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Notification Milestones & Daemon */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              <span>{isEn ? 'Automated Notification Milestones' : 'زمان‌بندی و مراحل ارسال هشدار'}</span>
            </h3>

            <div
              className={`p-3.5 rounded-xl border space-y-2.5 text-xs ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <p className="text-slate-400 leading-relaxed">
                {isEn
                  ? 'System background daemon automatically evaluates contract & license validity every day and sends email alerts at the following intervals before expiration:'
                  : 'دیمن پس‌زمینه سامانه به‌صورت روزانه وضعیت اعتبار را پایش کرده و در مقاطع زمانی زیر قبل از تاریخ انقضا، ایمیل هشدار ارسال می‌کند:'}
              </p>

              <div className="flex items-center gap-2 flex-wrap">
                {alertDays.map((days) => (
                  <span
                    key={days}
                    className="px-2.5 py-1 rounded-lg font-mono font-bold text-xs bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1"
                  >
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span>{isEn ? `${days} days before` : `${days} روز مانده`}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`px-5 py-3 border-t flex items-center justify-between gap-3 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}
        >
          {onSendTestAlert && allRecipients.length > 0 ? (
            <button
              type="button"
              onClick={onSendTestAlert}
              disabled={isSendingTest}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isSendingTest
                  ? isEn
                    ? 'Sending...'
                    : 'در حال ارسال...'
                  : isEn
                  ? 'Dispatch Test Alert'
                  : 'ارسال هشدار آزمایشی'}
              </span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
              isLightMode
                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            {isEn ? 'Close' : 'بستن'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
