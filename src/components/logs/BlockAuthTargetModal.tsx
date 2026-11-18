import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Ban,
  Clock,
  Globe,
  RefreshCw,
  ShieldAlert,
  UserX,
  AlertTriangle,
} from 'lucide-react';
import { AuthBlockTargetType, AuthBlocklistEntry } from '../../types';
import { blockAuthTargetApi } from '../../services/api';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface BlockAuthTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
  isRtl?: boolean;
  initialTargetType?: AuthBlockTargetType;
  initialTargetValue?: string;
  lockTarget?: boolean;
  onBlocked: (entry: AuthBlocklistEntry) => void;
}

const DURATION_PRESETS: Array<{
  id: string;
  minutes: number | null;
  labelEn: string;
  labelFa: string;
}> = [
  { id: 'permanent', minutes: null, labelEn: 'Permanent (Until Unblocked)', labelFa: 'دائمی (تا رفع مسدودی دستی)' },
  { id: '60', minutes: 60, labelEn: '1 Hour', labelFa: '۱ ساعت' },
  { id: '1440', minutes: 1440, labelEn: '24 Hours', labelFa: '۲۴ ساعت (۱ روز)' },
  { id: '10080', minutes: 10080, labelEn: '7 Days', labelFa: '۷ روز (۱ هفته)' },
  { id: '43200', minutes: 43200, labelEn: '30 Days', labelFa: '۳۰ روز (۱ ماه)' },
];

export const BlockAuthTargetModal: React.FC<BlockAuthTargetModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  isLightMode = false,
  isEn = false,
  isRtl = false,
  initialTargetType = 'ip',
  initialTargetValue = '',
  lockTarget = false,
  onBlocked,
}) => {
  const [targetType, setTargetType] = useState<AuthBlockTargetType>(initialTargetType);
  const [targetValue, setTargetValue] = useState<string>(initialTargetValue);
  const [durationId, setDurationId] = useState<string>('permanent');
  const [reason, setReason] = useState<string>('');
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTargetType(initialTargetType);
      setTargetValue(initialTargetValue);
      setDurationId('permanent');
      setReason('');
      setErrorMsg(null);
    }
  }, [isOpen, initialTargetType, initialTargetValue]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTarget = targetValue.trim();
    if (!cleanTarget) {
      setErrorMsg(
        targetType === 'ip'
          ? isEn
            ? 'Please enter an IPv4 or IPv6 address to block.'
            : 'لطفاً آدرس IPv4 یا IPv6 مورد نظر را وارد کنید.'
          : isEn
          ? 'Please enter a username to block.'
          : 'لطفاً نام کاربری مورد نظر را وارد کنید.'
      );
      return;
    }

    const preset = DURATION_PRESETS.find((d) => d.id === durationId) || DURATION_PRESETS[0];
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await blockAuthTargetApi({
        targetType,
        targetValue: cleanTarget,
        reason: reason.trim(),
        durationMinutes: preset.minutes,
      });

      if (res?.success && res?.entry) {
        onBlocked(res.entry as AuthBlocklistEntry);
        onClose();
      } else {
        setErrorMsg(
          isEn
            ? res?.error || 'Failed to apply block rule.'
            : res?.message || res?.error || 'خطا در ثبت مسدودیت.'
        );
      }
    } catch (err: any) {
      setErrorMsg(
        err?.message || (isEn ? 'Failed to block target.' : 'خطا در برقراری ارتباط با سرور برای مسدودسازی.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed top-0 left-0 right-0 bottom-8 z-[9999] modal-glass-backdrop flex items-center justify-center p-3 sm:p-5"
    >
      <div
        className={`border rounded-2xl flex flex-col shadow-2xl overflow-hidden transition-all ${
          isMaximized ? 'w-full h-full max-w-none max-h-full' : 'w-full max-w-lg max-h-[88vh]'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header with Rule 7 Controls */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between gap-3 shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-500 border border-rose-500/30 shrink-0">
              {targetType === 'ip' ? <Globe className="w-5 h-5" /> : <UserX className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className={`text-sm sm:text-base font-bold truncate ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                {isEn ? 'Block Login Access (IP / User)' : 'مسدودسازی دسترسی ورود (IP / کاربر)'}
              </h3>
              <p className={`text-[11px] truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Enforced immediately at Auth Gateway & active sessions'
                  : 'اعمال فوری در درگاه ورود و قطع نشست‌های فعال کاربر'}
              </p>
            </div>
          </div>

          <ModalHeaderControls
            isLightMode={isLightMode}
            isEn={isEn}
            isMaximized={isMaximized}
            onMaximizeToggle={() => setIsMaximized((v) => !v)}
            onMinimize={onMinimize}
            onClose={onClose}
          />
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1 custom-scrollbar">
            {/* Warning Notice */}
            <div
              className={`p-3 rounded-xl border flex items-start gap-2.5 leading-relaxed ${
                isLightMode
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                {isEn
                  ? 'Once blocked, this user or IP will be prevented from signing in and any active WebSocket/session tokens will be invalidated. You can restore access anytime from the "Blocked Users & IPs" tab.'
                  : 'پس از مسدودسازی، امکان ورود مجدد این کاربر یا آدرس IP به پنل قطع شده و نشست‌های فعال آن نامعتبر می‌شوند. در هر زمان می‌توانید از صفحه «کاربران و IPهای مسدودشده» آن را از مسدودی خارج کنید.'}
              </span>
            </div>

            {errorMsg && (
              <div
                className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-medium ${
                  isLightMode
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                }`}
              >
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Target Type Switch */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label className={`font-bold ${isLightMode ? 'text-slate-700' : 'text-slate-200'}`}>
                  {isEn ? 'Block Target Type' : 'نوع هدف مسدودسازی'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  title={isEn ? 'Target Type (IP vs User)' : 'نوع هدف (آدرس IP یا نام کاربری)'}
                  whatIsIt={
                    isEn
                      ? 'Choose whether to blacklist a specific client IP address or a specific user account.'
                      : 'انتخاب بین مسدود کردن یک آدرس IP مشخص یا مسدود کردن یک حساب کاربری مشخص (محلی یا اکتیو دایرکتوری).'
                  }
                  whyIsItNeeded={
                    isEn
                      ? 'IP blocking stops attacks from a compromised host across any username; user blocking revokes panel access for a specific identity regardless of IP.'
                      : 'مسدودسازی IP مانع ورود از یک سیستم مشکوک با هر نام کاربری می‌شود و مسدودسازی کاربر دسترسی آن حساب را از هر کجا قطع می‌کند.'
                  }
                  example={isEn ? 'IP: 192.168.50.22 | User: j.karimi' : 'IP: 192.168.50.22 | کاربر: s.karimi'}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={lockTarget}
                  onClick={() => setTargetType('ip')}
                  className={`py-2.5 px-3 rounded-xl border font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-65 disabled:cursor-not-allowed ${
                    targetType === 'ip'
                      ? 'bg-rose-600 text-white border-rose-500 shadow-md'
                      : isLightMode
                      ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  <span>{isEn ? 'IP Address' : 'آدرس IP'}</span>
                </button>
                <button
                  type="button"
                  disabled={lockTarget}
                  onClick={() => setTargetType('user')}
                  className={`py-2.5 px-3 rounded-xl border font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-65 disabled:cursor-not-allowed ${
                    targetType === 'user'
                      ? 'bg-rose-600 text-white border-rose-500 shadow-md'
                      : isLightMode
                      ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                  }`}
                >
                  <UserX className="w-4 h-4" />
                  <span>{isEn ? 'Username' : 'نام کاربری (User)'}</span>
                </button>
              </div>
            </div>

            {/* Target Value */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label className={`font-bold ${isLightMode ? 'text-slate-700' : 'text-slate-200'}`}>
                  {targetType === 'ip'
                    ? isEn
                      ? 'Source IP Address (IPv4 / IPv6)'
                      : 'آدرس IP مبدا (IPv4 / IPv6)'
                    : isEn
                    ? 'Username (Local or Active Directory)'
                    : 'نام کاربری (محلی یا اکتیو دایرکتوری)'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  title={targetType === 'ip' ? (isEn ? 'IPv4 / IPv6 Address' : 'آدرس IP') : (isEn ? 'Username Identifier' : 'شناسه کاربر')}
                  whatIsIt={
                    targetType === 'ip'
                      ? isEn
                        ? 'Exact IPv4 or IPv6 address evaluated against incoming login requests.'
                        : 'آدرس دقیق IPv4 یا IPv6 که در درخواست‌های ورود به پنل بررسی می‌شود.'
                      : isEn
                      ? 'Exact login username (also covers UPN user@domain and DOMAIN\\user variants).'
                      : 'نام کاربری که ورود آن به سیستم ممنوع می‌شود (شامل قالب‌های user@domain و DOMAIN\\user).'
                  }
                  whyIsItNeeded={
                    isEn
                      ? 'Evaluated directly inside PostgreSQL-backed auth routes before issuing tokens.'
                      : 'پیش از صدور توکن JWT در درگاه احراز هویت سرور به‌صورت قطعی بررسی می‌گردد.'
                  }
                  example={targetType === 'ip' ? '10.10.25.44' : 's.karimi'}
                />
              </div>
              <input
                type="text"
                dir="ltr"
                readOnly={lockTarget}
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder={targetType === 'ip' ? 'e.g. 192.168.10.55' : 'e.g. j.doe'}
                className={`w-full px-3.5 py-2.5 rounded-xl border font-mono text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/50 ${
                  lockTarget ? 'opacity-80 cursor-not-allowed' : ''
                } ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                    : 'bg-slate-900 border-slate-700 text-white placeholder:text-slate-500'
                }`}
              />
            </div>

            {/* Block Duration */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label className={`font-bold flex items-center gap-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-200'}`}>
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>{isEn ? 'Block Duration' : 'مدت زمان مسدودسازی'}</span>
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  title={isEn ? 'Block Duration' : 'مدت زمان مسدودیت'}
                  whatIsIt={
                    isEn
                      ? 'Choose whether the block stays active permanently until manually removed or expires automatically.'
                      : 'تعیین دائمی بودن مسدودسازی تا زمان رفع دستی یا انقضای خودکار پس از مدت معین.'
                  }
                  whyIsItNeeded={
                    isEn
                      ? 'Allows temporary cooling-off periods for suspicious IPs or permanent revocation for compromised accounts.'
                      : 'امکان مسدودی موقت برای IPهای مشکوک یا مسدودی دائمی برای حساب‌های غیرمجاز را فراهم می‌کند.'
                  }
                  example={isEn ? '24 Hours or Permanent' : '۲۴ ساعت یا دائمی'}
                />
              </div>
              <select
                value={durationId}
                onChange={(e) => setDurationId(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500/50 ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-900'
                    : 'bg-slate-900 border-slate-700 text-white'
                }`}
              >
                {DURATION_PRESETS.map((preset) => (
                  <option
                    key={preset.id}
                    value={preset.id}
                    className={isLightMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}
                  >
                    {isEn ? preset.labelEn : preset.labelFa}
                  </option>
                ))}
              </select>
            </div>

            {/* Security Reason */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label className={`font-bold ${isLightMode ? 'text-slate-700' : 'text-slate-200'}`}>
                  {isEn ? 'Reason / Security Note (Optional)' : 'دلیل و شرح امنیتی (اختیاری)'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  title={isEn ? 'Block Reason' : 'دلیل مسدودسازی'}
                  whatIsIt={
                    isEn
                      ? 'Audit justification stored alongside this blacklist rule and shown in blocked history.'
                      : 'توضیح مدیریتی و امنیتی که در پرونده مسدودی و لاگ‌های ممیزی ثبت می‌شود.'
                  }
                  whyIsItNeeded={
                    isEn
                      ? 'Helps other administrators understand why access was revoked before deciding to unblock it later.'
                      : 'به سایر مدیران کمک می‌کند پیش از رفع مسدودی، علت اصلی اعمال محدودیت را بدانند.'
                  }
                  example={isEn ? 'Repeated unauthorized SSH / login attempts from unknown subnet' : 'تلاش مکرر ناموفق برای ورود از رنج IP ناشناس'}
                />
              </div>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  isEn
                    ? 'e.g. Suspicious login activity / Compromised workstation / Offboarded user...'
                    : 'مثال: فعالیت ورود مشکوک / تلاش مکرر ناموفق / پایان همکاری کاربر...'
                }
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs resize-none focus:outline-none focus:ring-2 focus:ring-rose-500/50 ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                    : 'bg-slate-900 border-slate-700 text-white placeholder:text-slate-500'
                }`}
              />
            </div>
          </div>

          {/* Footer */}
          <div
            className={`px-5 py-3.5 border-t flex items-center justify-end gap-2 shrink-0 ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                  : 'bg-white/10 hover:bg-white/20 text-slate-200'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/25 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{isEn ? 'Blocking...' : 'در حال مسدودسازی...'}</span>
                </>
              ) : (
                <>
                  <Ban className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Confirm & Block Access' : 'تایید و مسدود کردن'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
