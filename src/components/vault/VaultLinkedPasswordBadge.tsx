import React from 'react';
import { Link2, Unlink, ShieldCheck } from 'lucide-react';

export interface VaultLinkedPasswordBadgeProps {
  vaultItemId: string;
  vaultItemName?: string;
  onUnlink: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
  subtitle?: string;
  compact?: boolean;
  className?: string;
}

export const VaultLinkedPasswordBadge: React.FC<VaultLinkedPasswordBadgeProps> = ({
  vaultItemId,
  vaultItemName,
  onUnlink,
  isLightMode = false,
  isEn = false,
  subtitle,
  compact = false,
  className = '',
}) => {
  const displayName = vaultItemName?.trim() || (isEn ? `Item #${vaultItemId.substring(0, 8)}` : `آیتم #${vaultItemId.substring(0, 8)}`);

  return (
    <div
      className={`w-full rounded-lg border transition-all select-none ${className} ${
        isLightMode
          ? 'bg-cyan-50/90 border-cyan-300 text-slate-800 shadow-xs'
          : 'bg-cyan-950/35 border-cyan-500/40 text-slate-100 shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`p-1 rounded-md shrink-0 ${
              isLightMode ? 'bg-cyan-100 text-cyan-700' : 'bg-cyan-500/20 text-cyan-300'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
          </div>

          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span
              className={`text-[11px] font-medium shrink-0 ${
                isLightMode ? 'text-slate-600' : 'text-slate-400'
              }`}
            >
              {isEn ? '🔗 Linked to Vault:' : '🔗 متصل به ولت:'}
            </span>

            <span
              className={`text-xs font-semibold truncate max-w-[150px] sm:max-w-[210px] font-mono ${
                isLightMode ? 'text-cyan-800' : 'text-cyan-300'
              }`}
              title={vaultItemName || vaultItemId}
            >
              {displayName}
            </span>

            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-mono shrink-0 border ${
                isLightMode
                  ? 'bg-cyan-100/70 border-cyan-200 text-cyan-800'
                  : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
              }`}
            >
              {isEn ? 'Dynamic Secret' : 'رمز پویا'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onUnlink}
          title={
            isEn
              ? 'Unlink from vault and enter password manually'
              : 'قطع اتصال از ولت و ورود دستی رمز عبور'
          }
          className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-medium transition cursor-pointer ${
            isLightMode
              ? 'bg-white hover:bg-rose-50 text-rose-700 border-rose-300 hover:border-rose-400 shadow-xs'
              : 'bg-slate-900/70 hover:bg-rose-950/40 text-rose-300 border-rose-500/30 hover:border-rose-500/50'
          }`}
        >
          <Unlink className="w-3 h-3 text-rose-400" />
          <span>{isEn ? 'Unlink' : 'قطع اتصال'}</span>
        </button>
      </div>

      {!compact && (
        <div
          className={`px-3 py-1 border-t text-[10px] flex items-center gap-1.5 ${
            isLightMode
              ? 'border-cyan-200/60 bg-cyan-100/30 text-cyan-800'
              : 'border-cyan-500/20 bg-cyan-950/20 text-cyan-300/80'
          }`}
        >
          <ShieldCheck className="w-3 h-3 shrink-0 text-cyan-400" />
          <span className="truncate">
            {subtitle ||
              (isEn
                ? 'Password dynamically resolves live at connect time; auto-updates on vault change.'
                : 'رمز عبور در زمان اتصال مستقیماً از ولت خوانده شده و با ویرایش در ولت خودکار همگام می‌شود.')}
          </span>
        </div>
      )}
    </div>
  );
};
