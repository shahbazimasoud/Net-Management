import React, { useCallback, useEffect, useState } from 'react';
import { Clock, Play, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { ApprovalExecutionGrant } from '../../types';
import { useLanguage } from '../../i18n';
import { fetchActiveJitGrants, revokeJitGrantApi } from '../../services/approvalApi';
import { FieldInfoTooltip } from './FieldInfoTooltip';

interface ActiveJitPassBarProps {
  entityType?: 'device' | 'server' | 'all';
  entityId?: string;
  isLightMode?: boolean;
  onLaunchGrant?: (grant: ApprovalExecutionGrant) => void;
}

function formatGrantCountdown(expiresAtIso: string, isEn: boolean, nowMs: number): string {
  const diffMs = Date.parse(expiresAtIso) - nowMs;
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return isEn ? 'Expired' : 'منقضی';
  }
  const totalSec = Math.floor(diffMs / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const ActiveJitPassBar: React.FC<ActiveJitPassBarProps> = ({
  entityType = 'all',
  entityId,
  isLightMode = false,
  onLaunchGrant,
}) => {
  const { isEn, isRtl } = useLanguage();
  const [grants, setGrants] = useState<ApprovalExecutionGrant[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadGrants = useCallback(
    async (forceRefresh = false) => {
      try {
        const list = await fetchActiveJitGrants({
          entityType: entityType === 'all' ? undefined : entityType,
          entityId: entityId || undefined,
          status: 'active',
          forceRefresh,
        });
        const now = Date.now();
        setGrants(
          (list || []).filter(
            (g) => g.status === 'active' && Date.parse(g.expiresAt) > now
          )
        );
      } catch {
        // Ignore silent background polling errors
      }
    },
    [entityType, entityId]
  );

  useEffect(() => {
    loadGrants(false);
    const handleEvent = () => {
      loadGrants(true);
    };
    window.addEventListener('nettop-jit-grants-updated', handleEvent);
    const pollId = setInterval(() => {
      loadGrants(false);
    }, 30_000);
    return () => {
      window.removeEventListener('nettop-jit-grants-updated', handleEvent);
      clearInterval(pollId);
    };
  }, [loadGrants]);

  useEffect(() => {
    if (grants.length === 0) return;
    setNowMs(Date.now());
    const id = setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      setGrants((prev) =>
        prev.filter((g) => g.status === 'active' && Date.parse(g.expiresAt) > current)
      );
    }, 1000);
    return () => clearInterval(id);
  }, [grants.length]);

  const handleRevoke = async (grant: ApprovalExecutionGrant) => {
    if (revokingId) return;
    setRevokingId(grant.id);
    setErrorMsg(null);
    try {
      await revokeJitGrantApi(
        grant.id,
        isEn ? 'Revoked by administrator from quick JIT bar' : 'لغو دستی از نوار دسترسی موقت JIT'
      );
      setGrants((prev) => prev.filter((g) => g.id !== grant.id));
      window.dispatchEvent(new CustomEvent('nettop-jit-grants-updated'));
    } catch (err: any) {
      setErrorMsg(
        err?.message || (isEn ? 'Failed to revoke JIT pass' : 'خطا در لغو دسترسی موقت')
      );
    } finally {
      setRevokingId(null);
    }
  };

  if (grants.length === 0 && !errorMsg) return null;

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`rounded-xl border px-3.5 py-2.5 flex flex-col gap-2 text-xs ${
        isLightMode
          ? 'bg-emerald-50/75 border-emerald-200 text-slate-900'
          : 'bg-emerald-950/25 border-emerald-500/35 text-slate-100'
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 font-bold">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>
            {isEn
              ? `Active JIT Access Passes (${grants.length})`
              : `پاس‌های دسترسی موقت فعال (${grants.length})`}
          </span>
          <FieldInfoTooltip
            title={isEn ? 'Time-Limited JIT Access Pass' : 'پاس دسترسی موقت (JIT Pass)'}
            infoWhatEn="An authorized temporary execution window issued after final multi-stage approval. Interactive sessions remain open and reconnectable until expiry or revocation."
            infoWhatFa="مجوز دسترسی زمان‌دار صادرشده پس از تایید نهایی مراحل که تا پایان زمان اعتبار یا لغو دستی، امکان ورود و اتصال مجدد را فراهم می‌کند."
            infoWhyEn="Balances operational convenience (e.g. reconnecting SSH/RDP or browsing SFTP) with strict automatic session termination when TTL ends."
            infoWhyFa="توازن میان سهولت کار عملیاتی (مانند اتصال مجدد SSH/RDP یا SFTP) و قطع خودکار نشست‌ها به محض اتمام مهلت زمانی."
            infoExampleEn="SSH Terminal Pass on Prod-Core-01 — 42:15 remaining (Revoke ends active WS/RDP immediately)."
            infoExampleFa="پاس ترمینال SSH روی سرور عملیات — ۴۲ دقیقه باقی‌مانده (با دکمه لغو نشست فعال فوراً قطع می‌شود)."
            isEn={isEn}
            isLightMode={isLightMode}
          />
        </div>
        {errorMsg && (
          <span className="inline-flex items-center gap-1 text-[11px] text-rose-500 font-semibold">
            <ShieldAlert className="w-3.5 h-3.5" />
            {errorMsg}
          </span>
        )}
      </div>

      <div className="flex flex-col divide-y divide-emerald-500/15">
        {grants.map((g) => {
          const countdown = formatGrantCountdown(g.expiresAt, isEn, nowMs);
          const actionTitle = isEn
            ? g.actionLabelEn || g.actionKey
            : g.actionLabelFa || g.actionKey;
          return (
            <div
              key={g.id}
              className="py-1.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 flex-wrap"
            >
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="font-semibold truncate max-w-[200px]">
                  {g.targetEntityName || g.targetEntityId}
                </span>
                <span className="opacity-40">·</span>
                <span className={isLightMode ? 'text-emerald-800 font-medium' : 'text-emerald-300 font-medium'}>
                  {actionTitle}
                </span>
                <span className="opacity-40">·</span>
                <span className={`font-mono text-[11px] ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                  {g.requesterFullName || g.requesterUsername}
                  {g.useCount > 0 ? ` (${isEn ? `Uses: ${g.useCount}` : `استفاده: ${g.useCount}`})` : ''}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono text-[11px] font-bold tabular-nums ${
                    isLightMode
                      ? 'bg-white border-emerald-300 text-emerald-800'
                      : 'bg-slate-900/90 border-emerald-500/40 text-emerald-300'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  {countdown}
                </span>

                {onLaunchGrant && g.executionMode === 'jit_session' && (
                  <button
                    type="button"
                    onClick={() => onLaunchGrant(g)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>{isEn ? 'Open' : 'ورود'}</span>
                  </button>
                )}

                {g.canRevoke && (
                  <button
                    type="button"
                    disabled={revokingId === g.id}
                    onClick={() => handleRevoke(g)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer disabled:opacity-50 ${
                      isLightMode
                        ? 'bg-white border-rose-300 text-rose-700 hover:bg-rose-50'
                        : 'bg-rose-950/40 border-rose-500/40 text-rose-300 hover:bg-rose-500/20'
                    }`}
                  >
                    <XCircle className="w-3 h-3" />
                    <span>{isEn ? 'Revoke' : 'لغو'}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
