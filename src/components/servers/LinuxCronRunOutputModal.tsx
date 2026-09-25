import React, { useState } from 'react';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Copy,
  Check,
} from 'lucide-react';
import { LinuxCronJob, LinuxCronExecutionResult } from '../../types';

interface LinuxCronRunOutputModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: LinuxCronJob | null;
  result: LinuxCronExecutionResult | null;
  loading: boolean;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const LinuxCronRunOutputModal: React.FC<LinuxCronRunOutputModalProps> = ({
  isOpen,
  onClose,
  job,
  result,
  loading,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen || (!job && !result && !loading)) return null;

  const handleCopy = () => {
    const textToCopy = `${result?.stdout || ''}\n${result?.stderr || ''}`.trim();
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[99999] flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm ${
        isLightMode ? 'bg-slate-900/40' : 'bg-black/60'
      }`}
    >
      <div
        className={`w-full flex flex-col transition-all duration-200 border rounded-xl shadow-2xl overflow-hidden ${
          isMaximized ? 'h-full max-h-full rounded-none' : 'max-h-[85vh] max-w-3xl'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* MODAL HEADER */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3 border-b select-none shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold flex items-center gap-2">
                <span>{isEn ? 'Manual Cron Execution Result' : 'نتیجه اجرای دستی کرون‌جاب'}</span>
                {job?.user && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    user: {job.user}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 font-mono truncate max-w-md">
                {job?.command || result?.command}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Minimize' : 'کوچک‌نمایی'}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                  : 'border-slate-800 text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام‌صفحه') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                  : 'border-slate-800 text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-red-600 hover:bg-red-50'
                  : 'border-slate-800 text-red-400 hover:bg-red-500/10'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-mono text-xs">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Clock className="w-8 h-8 text-cyan-400 animate-spin" />
              <span className="font-sans text-sm">
                {isEn ? 'Executing command on remote server via SSH...' : 'در حال اجرای دستور روی سرور لینوکس از طریق SSH...'}
              </span>
            </div>
          ) : result ? (
            <>
              {/* Status Header */}
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between ${
                  result.success
                    ? isLightMode
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
                    : isLightMode
                    ? 'bg-red-50 border-red-200 text-red-900'
                    : 'bg-red-950/30 border-red-800/60 text-red-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {result.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                  )}
                  <div>
                    <span className="font-bold text-xs">
                      {result.success
                        ? isEn
                          ? 'Execution Succeeded'
                          : 'دستور با موفقیت کامل اجرا شد'
                        : isEn
                        ? 'Command Execution Returned Non-Zero Exit Code'
                        : 'دستور با خطا یا کد خروج غیر صفر مواجه شد'}
                    </span>
                    <span className="ml-2 font-mono text-[11px] opacity-80">
                      (exit code: {result.exitCode})
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-mono opacity-80">
                    {result.durationMs}ms
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="p-1 rounded hover:bg-black/10 transition cursor-pointer"
                    title={isEn ? 'Copy output' : 'کپی خروجی'}
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Output Content */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>{isEn ? 'Terminal Console Output:' : 'خروجی کنسول ترمینال:'}</span>
                </div>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs overflow-x-auto min-h-[160px] max-h-[380px] overflow-y-auto whitespace-pre-wrap select-text">
                  {result.stdout ? (
                    <span className="text-emerald-400">{result.stdout}</span>
                  ) : result.stderr ? (
                    <span className="text-red-400">{result.stderr}</span>
                  ) : (
                    <span className="text-slate-500 italic">
                      {isEn ? '(Command executed without any console output)' : '(دستور بدون چاپ هیچ خروجی متنی در کنسول پایان یافت)'}
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* MODAL FOOTER */}
        <div
          className={`flex items-center justify-end px-4 sm:px-6 py-3 border-t shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
              isLightMode
                ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'border-slate-700 text-slate-300 hover:bg-white/5'
            }`}
          >
            {isEn ? 'Close' : 'بستن'}
          </button>
        </div>
      </div>
    </div>
  );
};
