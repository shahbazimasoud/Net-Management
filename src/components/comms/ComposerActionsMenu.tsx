import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  AtSign,
  Terminal as TerminalIcon,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

export interface ComposerActionsMenuProps {
  isEn: boolean;
  isLightMode: boolean;
  isRtl?: boolean;
  compact?: boolean;
  mentionActive?: boolean;
  slashActive?: boolean;
  disabled?: boolean;
  onOpenMention: () => void;
  onOpenSlash: () => void;
}

export const ComposerActionsMenu: React.FC<ComposerActionsMenuProps> = ({
  isEn,
  isLightMode,
  isRtl = false,
  compact = false,
  mentionActive = false,
  slashActive = false,
  disabled = false,
  onOpenMention,
  onOpenSlash,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const anyActive = open || mentionActive || slashActive;
  const ArrowIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={`${compact ? 'h-8 w-8' : 'h-[38px] w-[38px]'} rounded-lg border flex items-center justify-center cursor-pointer transition disabled:opacity-45 ${
          anyActive
            ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
            : isLightMode
            ? 'bg-white border-slate-300 text-slate-700 hover:border-indigo-400 hover:text-indigo-700'
            : 'bg-slate-900 border-white/15 text-slate-200 hover:border-indigo-400/50 hover:text-indigo-300'
        }`}
        title={
          isEn
            ? 'Tools: Mention (@) & ChatOps (/)'
            : 'ابزارها: منشن (@) و دستورات شبکه (/)'
        }
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Plus
          className={`w-4 h-4 transition-transform duration-150 ${
            open ? 'rotate-45' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute bottom-full mb-1.5 ${
            isRtl ? 'right-0' : 'left-0'
          } z-50 ${compact ? 'w-60' : 'w-64'} rounded-xl border shadow-2xl overflow-hidden ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-900 shadow-slate-300/60'
              : 'bg-slate-900 border-slate-700 text-slate-100 shadow-black/70'
          }`}
        >
          <div
            className={`px-3 py-1.5 border-b text-[10px] font-semibold uppercase tracking-wider ${
              isLightMode
                ? 'bg-slate-50 border-slate-200 text-slate-500'
                : 'bg-slate-950/70 border-white/10 text-slate-400'
            }`}
          >
            {isEn ? 'Insert & Network Tools' : 'ابزارهای سریع گفتگو'}
          </div>

          <div className="p-1.5 flex flex-col gap-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenMention();
              }}
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-start cursor-pointer transition ${
                mentionActive
                  ? isLightMode
                    ? 'bg-indigo-50 text-indigo-800'
                    : 'bg-indigo-500/20 text-indigo-200'
                  : isLightMode
                  ? 'hover:bg-slate-100 text-slate-800'
                  : 'hover:bg-white/10 text-slate-100'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`p-1.5 rounded-lg shrink-0 ${
                    isLightMode
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'bg-indigo-500/15 text-indigo-300'
                  }`}
                >
                  <AtSign className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">
                    {isEn ? 'Mention Entity (@)' : 'ارجاع و منشن (@)'}
                  </div>
                  <div
                    className={`text-[10px] truncate ${
                      isLightMode ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    {isEn
                      ? 'People, devices, ports, or servers'
                      : 'افراد، تجهیزات، پورت‌ها یا سرورها'}
                  </div>
                </div>
              </div>
              <ArrowIcon className="w-3.5 h-3.5 opacity-50 shrink-0" />
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenSlash();
              }}
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-start cursor-pointer transition ${
                slashActive
                  ? isLightMode
                    ? 'bg-cyan-50 text-cyan-800'
                    : 'bg-cyan-500/20 text-cyan-200'
                  : isLightMode
                  ? 'hover:bg-slate-100 text-slate-800'
                  : 'hover:bg-white/10 text-slate-100'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`p-1.5 rounded-lg shrink-0 ${
                    isLightMode
                      ? 'bg-cyan-50 text-cyan-700'
                      : 'bg-cyan-500/15 text-cyan-300'
                  }`}
                >
                  <TerminalIcon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">
                    {isEn ? 'ChatOps Commands (/)' : 'دستورات شبکه ChatOps (/)'}
                  </div>
                  <div
                    className={`text-[10px] truncate ${
                      isLightMode ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    /ping · /mac · /port · /status · /dns
                  </div>
                </div>
              </div>
              <ArrowIcon className="w-3.5 h-3.5 opacity-50 shrink-0" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
