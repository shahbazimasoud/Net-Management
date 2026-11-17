import React, { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileCode2,
  FileText,
  GitCompare,
  Lock,
  Router,
  ScrollText,
  Server,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { CommsProjectedEntityCard, CommsProjectedSnippetResult } from '../../types';
import { dispatchOpenMentionedEntity } from './EntityMentionCardList';

export interface SnippetDiffCardProps {
  result?: CommsProjectedSnippetResult;
  isEn: boolean;
  isLightMode: boolean;
  isSelf?: boolean;
  compact?: boolean;
}

function getSourceBadge(
  result: CommsProjectedSnippetResult,
  isEn: boolean
): { label: string; icon: React.ReactNode } {
  switch (result.sourceType) {
    case 'backup_diff':
      return {
        label: isEn ? 'Config / Backup Diff' : 'مقایسه بکاپ و کانفیگ',
        icon: <GitCompare className="w-3.5 h-3.5" />,
      };
    case 'device_log':
      return {
        label: isEn ? 'Device Syslog' : 'لاگ سیستمی تجهیز',
        icon: <ScrollText className="w-3.5 h-3.5" />,
      };
    case 'server_log':
      return {
        label: isEn ? 'Server Audit Log' : 'لاگ عملیات سرور',
        icon: <FileText className="w-3.5 h-3.5" />,
      };
    case 'terminal_output':
    default:
      return {
        label:
          result.platform === 'mikrotik_routeros'
            ? isEn
              ? 'MikroTik CLI Output'
              : 'خروجی ترمینال میکروتیک'
            : result.platform === 'linux_ssh'
            ? isEn
              ? 'Linux SSH Output'
              : 'خروجی ترمینال لینوکس'
            : isEn
            ? 'Cisco CLI Output'
            : 'خروجی ترمینال سیسکو',
        icon: <Terminal className="w-3.5 h-3.5" />,
      };
  }
}

export const SnippetDiffCard: React.FC<SnippetDiffCardProps> = ({
  result,
  isEn,
  isLightMode,
  isSelf = false,
  compact = false,
}) => {
  const lineTotal = (result?.content || '').split('\n').length;
  const [expanded, setExpanded] = useState<boolean>(() => !compact && lineTotal <= 14);
  const [copied, setCopied] = useState(false);

  if (!result) return null;

  // Strict Zero-Leak RBAC Restricted Card
  if (result.accessRestricted) {
    const msg = isEn
      ? result.restrictionMessageEn ||
        'Access Restricted (RBAC): Your policy does not authorize viewing this terminal output, log, or backup diff.'
      : result.restrictionMessageFa ||
        'عدم دسترسی (RBAC): شما مجوز مشاهده خروجی ترمینال، لاگ یا بکاپ این تجهیز/سرور را ندارید.';

    return (
      <div
        className={`mt-2 rounded-xl border px-2.5 py-2 flex items-start gap-2 ${
          isSelf
            ? 'bg-slate-950/35 border-amber-300/40 text-amber-100'
            : isLightMode
            ? 'bg-amber-50 border-amber-200 text-amber-900'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
        }`}
      >
        <div
          className={`p-1 rounded-lg shrink-0 mt-0.5 ${
            isSelf
              ? 'bg-amber-400/20 text-amber-200'
              : isLightMode
              ? 'bg-amber-100 text-amber-700'
              : 'bg-amber-500/20 text-amber-300'
          }`}
        >
          <Lock className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold tracking-tight">
              {isEn ? 'RBAC Protected Snippet' : 'اسنیپت محافظت‌شده (RBAC)'}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded font-mono text-[9.5px] font-semibold ${
                isSelf
                  ? 'bg-amber-300/20 text-amber-100'
                  : isLightMode
                  ? 'bg-amber-200/70 text-amber-900'
                  : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              {getSourceBadge(result, isEn).label}
            </span>
          </div>
          <p className="text-[11px] leading-snug opacity-95 mt-0.5">{msg}</p>
        </div>
      </div>
    );
  }

  const cardContainerCls = isSelf
    ? 'bg-slate-950/40 border-white/20 text-white'
    : isLightMode
    ? 'bg-white border-slate-200 text-slate-900 shadow-xs'
    : 'bg-slate-950/75 border-white/15 text-slate-100';

  const subTextCls = isSelf
    ? 'text-indigo-100/85'
    : isLightMode
    ? 'text-slate-600'
    : 'text-slate-400';

  const pillCls = isSelf
    ? 'bg-white/15 border-white/20 text-white'
    : isLightMode
    ? 'bg-slate-100 border-slate-200 text-slate-700'
    : 'bg-white/5 border-white/15 text-slate-300';

  const actionBtnCls = isSelf
    ? 'bg-white/15 hover:bg-white/25 text-white border-white/25'
    : isLightMode
    ? 'bg-slate-100 hover:bg-indigo-50 text-slate-800 hover:text-indigo-700 border-slate-200 hover:border-indigo-300'
    : 'bg-white/5 hover:bg-indigo-500/20 text-slate-200 hover:text-indigo-200 border-white/15 hover:border-indigo-400/40';

  const { label: badgeLabel, icon: badgeIcon } = getSourceBadge(result, isEn);
  const contentLines = (result.content || '').split('\n');
  const displayLines = expanded ? contentLines : contentLines.slice(0, compact ? 5 : 8);
  const isDiffContent =
    result.sourceType === 'backup_diff' &&
    contentLines.some(
      (l) => l.startsWith('+') || l.startsWith('-') || l.startsWith('@@')
    );

  const handleCopy = () => {
    if (!result.content) return;
    navigator.clipboard.writeText(result.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const openTargetPayload: CommsProjectedEntityCard = {
    entityType: result.sourceEntityType,
    entityId: result.sourceEntityId,
    accessRestricted: false,
    name: result.sourceEntityName,
    ip: result.sourceEntityIp,
    canOpenTerminal: result.canOpenSourceTerminal,
    canOpenPorts: result.canOpenSourceLogs,
    canOpenDeviceView: result.canOpenSourceView,
  };

  return (
    <div
      className={`mt-2 rounded-xl border ${compact ? 'p-2' : 'p-2.5'} text-[11px] ${cardContainerCls}`}
    >
      {/* Top Meta Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-semibold text-[10px] ${
                isSelf
                  ? 'bg-cyan-400/20 border-cyan-300/35 text-cyan-100'
                  : isLightMode
                  ? 'bg-cyan-50 border-cyan-200 text-cyan-800'
                  : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
              }`}
            >
              {badgeIcon}
              <span>{badgeLabel}</span>
            </span>

            {result.diffStats && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-900/90 border border-slate-700 font-mono text-[10px]">
                <span className="text-emerald-400 font-bold">+{result.diffStats.added}</span>
                <span className="text-rose-400 font-bold">-{result.diffStats.removed}</span>
              </span>
            )}

            {Number(result.redactedCount || 0) > 0 && (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium ${
                  isSelf
                    ? 'bg-emerald-400/20 border-emerald-300/40 text-emerald-100'
                    : isLightMode
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                }`}
                title={
                  isEn
                    ? 'Sensitive credentials automatically masked on server before sharing'
                    : 'اطلاعات محرمانه به صورت خودکار پیش از ذخیره در سرور پوشانده شدند'
                }
              >
                <ShieldCheck className="w-3 h-3 shrink-0" />
                <span>
                  {isEn
                    ? `${result.redactedCount} secret(s) scrubbed`
                    : `${result.redactedCount} مورد محرمانه پاکسازی شد`}
                </span>
              </span>
            )}
          </div>

          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold truncate max-w-[260px]">
              {isEn ? result.titleEn || result.title : result.title || result.titleEn}
            </span>
            {result.filePath && (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono text-[10px] truncate max-w-[240px] ${pillCls}`}
              >
                <FileCode2 className="w-3 h-3 shrink-0" />
                <span className="truncate">{result.filePath}</span>
              </span>
            )}
          </div>

          <div className={`mt-0.5 flex items-center gap-1.5 text-[10.5px] ${subTextCls}`}>
            {result.sourceEntityType === 'server' ? (
              <Server className="w-3 h-3 shrink-0" />
            ) : (
              <Router className="w-3 h-3 shrink-0" />
            )}
            <span className="truncate font-medium">
              {result.sourceEntityName || result.sourceEntityId}
            </span>
            {result.sourceEntityIp && (
              <span className="font-mono opacity-90">({result.sourceEntityIp})</span>
            )}
            <span className="opacity-70">•</span>
            <span className="font-mono">
              {result.lineCount || contentLines.length} {isEn ? 'lines' : 'خط'}
            </span>
          </div>
        </div>

        {/* Copy & Collapse Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className={`p-1 rounded-md border text-[10px] cursor-pointer transition ${actionBtnCls}`}
            title={isEn ? 'Copy snippet' : 'کپی متن'}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={`px-1.5 py-1 rounded-md border text-[10px] font-medium flex items-center gap-0.5 cursor-pointer transition ${actionBtnCls}`}
            title={
              expanded
                ? isEn
                  ? 'Collapse snippet'
                  : 'جمع کردن کادر'
                : isEn
                ? 'Expand snippet'
                : 'نمایش کامل'
            }
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                {!compact && <span>{isEn ? 'Hide' : 'بستن'}</span>}
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                {!compact && <span>{isEn ? 'Expand' : 'باز کردن'}</span>}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Monospace Code / Diff Viewer (Always crisp dark console for terminal/code readability) */}
      <div
        dir="ltr"
        className={`mt-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 font-mono text-[10.5px] leading-relaxed overflow-x-auto ${
          expanded ? 'max-h-72 overflow-y-auto custom-scrollbar' : 'max-h-32 overflow-hidden'
        } p-2`}
      >
        {isDiffContent ? (
          <div className="space-y-0.5">
            {displayLines.map((line, i) => {
              const isAdded = line.startsWith('+') && !line.startsWith('+++');
              const isRemoved = line.startsWith('-') && !line.startsWith('---');
              const isHunk = line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++');
              return (
                <div
                  key={i}
                  className={`px-1.5 py-0.2 rounded whitespace-pre-wrap break-all ${
                    isAdded
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : isRemoved
                      ? 'bg-rose-500/20 text-rose-300'
                      : isHunk
                      ? 'text-cyan-300 font-semibold'
                      : 'text-slate-300'
                  }`}
                >
                  {line || ' '}
                </div>
              );
            })}
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-all text-slate-100">
            {displayLines.join('\n')}
          </pre>
        )}

        {!expanded && contentLines.length > displayLines.length && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-1.5 w-full text-center py-1 rounded bg-slate-900 hover:bg-slate-800 text-cyan-300 text-[10px] font-sans font-semibold cursor-pointer transition"
          >
            {isEn
              ? `Show remaining ${contentLines.length - displayLines.length} lines...`
              : `نمایش ${contentLines.length - displayLines.length} خط باقی‌مانده...`}
          </button>
        )}
      </div>

      {result.truncated && (
        <p className={`mt-1 text-[10px] ${subTextCls}`}>
          {isEn
            ? 'Output clipped to maximum safe snippet size.'
            : 'خروجی به حداکثر طول ایمن اشتراک‌گذاری محدود شده است.'}
        </p>
      )}

      {/* RBAC-Gated Jump Actions */}
      {(result.canOpenSourceTerminal || result.canOpenSourceLogs || result.canOpenSourceView) && (
        <div className="mt-2 pt-1.5 border-t border-white/10 flex items-center gap-1.5 flex-wrap">
          {result.canOpenSourceTerminal && (
            <button
              type="button"
              onClick={() => dispatchOpenMentionedEntity(openTargetPayload, 'terminal')}
              className={`px-2 py-1 rounded-md border text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition ${actionBtnCls}`}
            >
              <Terminal className="w-3 h-3" />
              <span>{isEn ? 'Open Terminal' : 'باز کردن ترمینال'}</span>
            </button>
          )}
          {result.canOpenSourceLogs && (
            <button
              type="button"
              onClick={() => dispatchOpenMentionedEntity(openTargetPayload, 'logs' as any)}
              className={`px-2 py-1 rounded-md border text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition ${actionBtnCls}`}
            >
              <ScrollText className="w-3 h-3" />
              <span>
                {result.sourceEntityType === 'server'
                  ? isEn
                    ? 'Audit Logs'
                    : 'لاگ‌های سرور'
                  : isEn
                  ? 'Device Logs'
                  : 'لاگ‌های تجهیز'}
              </span>
            </button>
          )}
          {result.canOpenSourceView && (
            <button
              type="button"
              onClick={() => dispatchOpenMentionedEntity(openTargetPayload, 'view')}
              className={`px-2 py-1 rounded-md border text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition ${actionBtnCls}`}
            >
              {result.sourceEntityType === 'server' ? (
                <Server className="w-3 h-3" />
              ) : (
                <Router className="w-3 h-3" />
              )}
              <span>
                {result.sourceEntityType === 'server'
                  ? isEn
                    ? 'Open Servers'
                    : 'مدیریت سرورها'
                  : isEn
                  ? 'View Device'
                  : 'مشاهده تجهیز'}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
