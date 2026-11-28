import React from 'react';
import { ShieldOff, ShieldAlert, ArrowRight, ArrowLeft } from 'lucide-react';

export function isHelpdeskTimeoutError(errorText?: string | null): boolean {
  if (!errorText) return false;
  return /timed?\s*out|etimedout|timeout|deadline\s*exceeded|زمان\s*انتظار|تایم[\s‌_-]*اوت|اتمام\s*زمان|عدم\s*پاسخ.*زمان/i.test(
    String(errorText)
  );
}

export interface TimeoutAntivirusHintProps {
  errorText?: string | null;
  isEn: boolean;
  isLightMode: boolean;
  canViewSecurityAv: boolean;
  canControlAntivirus: boolean;
  isAlreadyOnSecurityTab?: boolean;
  onGoToAntivirus?: () => void;
  compact?: boolean;
}

export const TimeoutAntivirusHint: React.FC<TimeoutAntivirusHintProps> = ({
  errorText,
  isEn,
  isLightMode,
  canViewSecurityAv,
  canControlAntivirus,
  isAlreadyOnSecurityTab = false,
  onGoToAntivirus,
  compact = false,
}) => {
  if (!canViewSecurityAv || !isHelpdeskTimeoutError(errorText)) {
    return null;
  }

  const NavArrow = isEn ? ArrowRight : ArrowLeft;
  const showButton = !isAlreadyOnSecurityTab && Boolean(onGoToAntivirus);

  return (
    <div
      className={`mt-2 rounded-lg border flex flex-wrap items-center justify-between gap-2 ${
        compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
      } ${
        isLightMode
          ? 'bg-amber-50 border-amber-300 text-amber-950'
          : 'bg-amber-950/45 border-amber-500/45 text-amber-100'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {canControlAntivirus ? (
          <ShieldOff className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        ) : (
          <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        )}
        <span className="font-medium break-words">
          {isAlreadyOnSecurityTab
            ? isEn
              ? "Tip: If stopping/starting Antivirus times out, enter the vendor's Uninstall/Stop Password (if password-protected), check Self-Defense / Tamper Protection policies, or try WinRM (5985/5986)."
              : 'راهنما: اگر توقف یا راه‌اندازی آنتی‌ویروس با تایم‌اوت مواجه شد، در صورت فعال بودن رمز حفاظتی (Stop/Tamper Password) آن را وارد کنید، تنظیمات Self-Defense را بررسی نمایید یا از WinRM استفاده کنید.'
            : canControlAntivirus
            ? isEn
              ? "Tip: Due to this timeout, it is recommended to temporarily turn off the endpoint's Antivirus and retry."
              : 'پیشنهاد: به دلیل تایم‌اوت، بهتر است موقتاً آنتی‌ویروس سیستم را خاموش کنید و دوباره تلاش نمایید.'
            : isEn
            ? "Tip: This timeout may be caused by the endpoint's Antivirus (disabling it requires action permission)."
            : 'پیشنهاد: تایم‌اوت ممکن است ناشی از آنتی‌ویروس سیستم باشد (خاموش کردن آن نیازمند مجوز اجرایی است).'}
        </span>
      </div>

      {showButton && (
        <button
          type="button"
          onClick={onGoToAntivirus}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
            canControlAntivirus
              ? 'bg-amber-600 hover:bg-amber-500 text-white'
              : isLightMode
              ? 'bg-white border border-amber-400 text-amber-900 hover:bg-amber-100'
              : 'bg-slate-900 border border-amber-500/50 text-amber-200 hover:bg-amber-500/20'
          }`}
        >
          <span>
            {canControlAntivirus
              ? isEn
                ? 'Go to Antivirus'
                : 'رفتن به صفحه آنتی‌ویروس'
              : isEn
              ? 'View Antivirus'
              : 'مشاهده صفحه آنتی‌ویروس'}
          </span>
          <NavArrow className="w-3.5 h-3.5 shrink-0" />
        </button>
      )}
    </div>
  );
};
