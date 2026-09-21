import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Sliders,
  AlertTriangle,
  Copy,
  Zap,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { LinuxProcessMetric } from '../../types/remoteServer';

interface ProcessActionModalsProps {
  contextMenu: {
    visible: boolean;
    x: number;
    y: number;
    process: LinuxProcessMetric | null;
  };
  onCloseContextMenu: () => void;
  onKillProcess: (pid: number, signal: 'SIGTERM' | 'SIGKILL', command: string) => void;
  onOpenRenice: (proc: LinuxProcessMetric) => void;
  reniceDialog: {
    isOpen: boolean;
    process: LinuxProcessMetric | null;
    niceValue: number;
    loading: boolean;
  };
  setReniceDialog: React.Dispatch<
    React.SetStateAction<{
      isOpen: boolean;
      process: LinuxProcessMetric | null;
      niceValue: number;
      loading: boolean;
    }>
  >;
  onApplyRenice: () => void;
  isEn: boolean;
  isLightMode: boolean;
}

export const ProcessActionModals: React.FC<ProcessActionModalsProps> = ({
  contextMenu,
  onCloseContextMenu,
  onKillProcess,
  onOpenRenice,
  reniceDialog,
  setReniceDialog,
  onApplyRenice,
  isEn,
  isLightMode,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click or escape
  useEffect(() => {
    if (!contextMenu.visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseContextMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseContextMenu();
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu.visible, onCloseContextMenu]);

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    onCloseContextMenu();
  };

  return (
    <>
      {/* ======================================================== */}
      {/* PROCESS CONTEXT MENU (PORTAL) */}
      {/* ======================================================== */}
      {contextMenu.visible &&
        contextMenu.process &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              top: Math.min(contextMenu.y, window.innerHeight - 240),
              left: Math.min(contextMenu.x, window.innerWidth - 220),
            }}
            className={`fixed z-[9999] w-56 rounded-xl border shadow-2xl p-1.5 text-xs font-mono select-none animate-in fade-in zoom-in-95 duration-100 ${
              isLightMode
                ? 'bg-white border-slate-200 text-slate-800 shadow-slate-400/20'
                : 'bg-slate-900 border-slate-700 text-slate-100 shadow-black/60'
            }`}
          >
            {/* Header / PID preview */}
            <div className="px-2.5 py-1.5 border-b border-white/5 flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-bold text-cyan-400 truncate max-w-[120px]">
                PID {contextMenu.process.pid}
              </span>
              <span className="text-[10px] text-slate-400">{contextMenu.process.user}</span>
            </div>

            <div className="py-1 space-y-0.5">
              {/* Terminate Process (SIGTERM 15) */}
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.process) {
                    onKillProcess(contextMenu.process.pid, 'SIGTERM', contextMenu.process.command);
                  }
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition cursor-pointer ${
                  isLightMode
                    ? 'hover:bg-amber-50 text-amber-700'
                    : 'hover:bg-amber-500/15 text-amber-300'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-bold">{isEn ? 'Terminate (SIGTERM)' : 'خاتمه نرم (SIGTERM)'}</span>
                  <span className="text-[10px] text-slate-400">{isEn ? 'Signal 15 (Graceful exit)' : 'سیگنال ۱۵ - خروج عادی'}</span>
                </div>
              </button>

              {/* Force Kill Process (SIGKILL 9) */}
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.process) {
                    onKillProcess(contextMenu.process.pid, 'SIGKILL', contextMenu.process.command);
                  }
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition cursor-pointer ${
                  isLightMode
                    ? 'hover:bg-rose-50 text-rose-700'
                    : 'hover:bg-rose-500/15 text-rose-400'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-bold">{isEn ? 'Force Kill (SIGKILL)' : 'توقف اجباری (SIGKILL)'}</span>
                  <span className="text-[10px] text-slate-400">{isEn ? 'Signal 9 (Immediate stop)' : 'سیگنال ۹ - بستن بلادرنگ'}</span>
                </div>
              </button>

              {/* Renice / Priority adjustment */}
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.process) {
                    onOpenRenice(contextMenu.process);
                  }
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition cursor-pointer ${
                  isLightMode
                    ? 'hover:bg-cyan-50 text-cyan-800'
                    : 'hover:bg-cyan-500/15 text-cyan-300'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-bold">{isEn ? 'Change Priority (Renice)' : 'تغییر اولویت (Renice)'}</span>
                  <span className="text-[10px] text-slate-400">{isEn ? 'Adjust nice scheduling' : 'تنظیم ضریب پردازش'}</span>
                </div>
              </button>

              <div className="border-t border-white/5 my-1" />

              {/* Copy PID */}
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.process) {
                    copyToClipboard(String(contextMenu.process.pid));
                  }
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition cursor-pointer ${
                  isLightMode ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-white/5 text-slate-300'
                }`}
              >
                <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{isEn ? 'Copy PID' : 'کپی شناسه PID'}</span>
              </button>

              {/* Copy Full Command */}
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.process) {
                    copyToClipboard(contextMenu.process.command);
                  }
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition cursor-pointer ${
                  isLightMode ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-white/5 text-slate-300'
                }`}
              >
                <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{isEn ? 'Copy Command' : 'کپی متن دستور'}</span>
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* ======================================================== */}
      {/* RENICE PRIORITY DIALOG (PORTAL) */}
      {/* ======================================================== */}
      {reniceDialog.isOpen &&
        reniceDialog.process &&
        createPortal(
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div
              className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden font-mono text-xs ${
                isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
              }`}
            >
              {/* Dialog Header */}
              <div
                className={`px-5 py-3.5 border-b flex items-center justify-between ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/60 border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span>{isEn ? 'Change Process Priority (renice)' : 'تغییر اولویت پردازش (renice)'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReniceDialog((prev) => ({ ...prev, isOpen: false }))}
                  className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Dialog Body */}
              <div className="p-5 space-y-4 font-sans">
                {/* Process Details */}
                <div
                  className={`p-3 rounded-xl border text-xs font-mono space-y-1.5 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">{isEn ? 'Process PID:' : 'شناسه پردازش:'}</span>
                    <span className="font-bold text-cyan-400">{reniceDialog.process.pid}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">{isEn ? 'Owner User:' : 'مالک پردازش:'}</span>
                    <span className="text-slate-200">{reniceDialog.process.user}</span>
                  </div>
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-slate-400 shrink-0">{isEn ? 'Command:' : 'دستور:'}</span>
                    <span className="text-slate-300 truncate max-w-[240px] text-right font-mono text-[11px]">
                      {reniceDialog.process.command}
                    </span>
                  </div>
                </div>

                {/* Nice Value Slider & Display */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-300">
                      {isEn ? 'Nice Scheduling Value (-20 to +19):' : 'مقدار اولویت نایس (-۲۰ تا +۱۹):'}
                    </label>
                    <span
                      className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                        reniceDialog.niceValue < 0
                          ? 'bg-rose-500/20 text-rose-400'
                          : reniceDialog.niceValue === 0
                          ? 'bg-slate-800 text-slate-200'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      {reniceDialog.niceValue > 0 ? `+${reniceDialog.niceValue}` : reniceDialog.niceValue}
                      {reniceDialog.niceValue < 0
                        ? ` (${isEn ? 'High Priority' : 'اولویت بالا'})`
                        : reniceDialog.niceValue === 0
                        ? ` (${isEn ? 'Normal' : 'عادی'})`
                        : ` (${isEn ? 'Low/Idle' : 'اولویت کم'})`}
                    </span>
                  </div>

                  <input
                    type="range"
                    min={-20}
                    max={19}
                    step={1}
                    value={reniceDialog.niceValue}
                    onChange={(e) =>
                      setReniceDialog((prev) => ({ ...prev, niceValue: Number(e.target.value) }))
                    }
                    className="w-full accent-cyan-400 cursor-pointer"
                  />

                  <div className="flex justify-between text-[10px] font-mono text-slate-400">
                    <span>-20 ({isEn ? 'Highest Priority' : 'بالاترین اولویت'})</span>
                    <span>0 ({isEn ? 'Default' : 'پیش‌فرض'})</span>
                    <span>+19 ({isEn ? 'Lowest Priority' : 'پایین‌ترین اولویت'})</span>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-slate-400 font-mono">
                    {isEn ? 'Quick Presets:' : 'مقادیر پرکاربرد:'}
                  </span>
                  <div className="grid grid-cols-4 gap-2 font-mono text-xs">
                    {[
                      { val: -10, label: isEn ? 'High (-10)' : 'بالا (-۱۰)' },
                      { val: 0, label: isEn ? 'Normal (0)' : 'عادی (۰)' },
                      { val: 10, label: isEn ? 'Low (+10)' : 'کم (+۱۰)' },
                      { val: 19, label: isEn ? 'Idle (+19)' : 'حداقل (+۱۹)' },
                    ].map((p) => (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => setReniceDialog((prev) => ({ ...prev, niceValue: p.val }))}
                        className={`py-1 rounded border text-center transition cursor-pointer ${
                          reniceDialog.niceValue === p.val
                            ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400'
                            : isLightMode
                            ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                            : 'border-slate-700 hover:bg-white/5 text-slate-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Dialog Footer */}
              <div
                className={`px-5 py-3 border-t flex items-center justify-end gap-2 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setReniceDialog((prev) => ({ ...prev, isOpen: false }))}
                  className={`px-3 py-1.5 rounded-lg border transition cursor-pointer font-sans text-xs ${
                    isLightMode
                      ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                      : 'border-slate-700 text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>

                <button
                  type="button"
                  disabled={reniceDialog.loading}
                  onClick={onApplyRenice}
                  className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5 font-sans text-xs"
                >
                  {reniceDialog.loading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>{isEn ? 'Apply Priority (Renice)' : 'اعمال اولویت پردازش'}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
