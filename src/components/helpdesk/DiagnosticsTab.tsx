import React, { useMemo, useState } from 'react';
import {
  Stethoscope,
  Play,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  ArrowUpRight,
  ArrowUpLeft,
  Download,
  SlidersHorizontal,
  Network,
  HardDrive,
  Cpu,
  Clock,
} from 'lucide-react';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { DIAGNOSTIC_CHECK_CATALOG } from './DiagnosticsConfigModal';
import { HelpdeskDiagnosticCheckId } from '../../services/api';
import { HelpdeskSubTab } from '../../services/helpdeskRamSession';

interface DiagnosticsTabProps {
  isLightMode: boolean;
  isEn: boolean;
  targetIp: string;
  canRunDiagnostics: boolean;
  data: any | null;
  loading: boolean;
  error: string | null;
  selectedChecks: HelpdeskDiagnosticCheckId[];
  onOpenConfigModal: () => void;
  onRunQuickSelected: () => void;
  onJumpToSection: (tab: HelpdeskSubTab, sectionId: string) => void;
}

export const DiagnosticsTab: React.FC<DiagnosticsTabProps> = ({
  isLightMode,
  isEn,
  targetIp,
  canRunDiagnostics,
  data,
  loading,
  error,
  selectedChecks,
  onOpenConfigModal,
  onRunQuickSelected,
  onJumpToSection,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'issues' | 'passed'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'network' | 'system_storage' | 'hardware_perf'>('all');

  const surfaceBg = isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800';
  const subSurfaceBg = isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800';
  const textPrimary = isLightMode ? 'text-slate-900' : 'text-slate-100';
  const textMuted = isLightMode ? 'text-slate-600' : 'text-slate-400';

  const iconMap = useMemo(() => {
    const map = new Map<string, React.ComponentType<{ className?: string }>>();
    for (const item of DIAGNOSTIC_CHECK_CATALOG) {
      map.set(item.id, item.icon);
    }
    return map;
  }, []);

  const checks: any[] = Array.isArray(data?.checks) ? data.checks : [];

  const filteredChecks = useMemo(() => {
    return checks.filter((chk) => {
      if (categoryFilter !== 'all' && chk.category !== categoryFilter) return false;
      if (statusFilter === 'issues' && chk.status !== 'fail' && chk.status !== 'warn') return false;
      if (statusFilter === 'passed' && chk.status !== 'pass' && chk.status !== 'info') return false;
      return true;
    });
  }, [checks, categoryFilter, statusFilter]);

  const handleExportCsv = () => {
    if (!checks.length) return;
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = [
      'Check ID',
      'Category',
      'Title',
      'Status',
      'Summary',
      'Recommendation',
      'Metrics',
      'Duration (ms)',
    ];
    const rows = checks.map((c) => [
      c.id,
      c.category,
      isEn ? c.titleEn : c.titleFa,
      isEn ? c.statusLabelEn : c.statusLabelFa,
      isEn ? c.summaryEn : c.summaryFa,
      isEn ? c.recommendationEn : c.recommendationFa,
      (c.metrics || []).map((m: any) => `${isEn ? m.labelEn : m.labelFa}: ${m.value}`).join(' | '),
      c.durationMs,
    ]);
    const csv = '\uFEFF' + [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `helpdesk-diagnostics-${data?.hostname || targetIp || 'endpoint'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const JumpArrow = isEn ? ArrowUpRight : ArrowUpLeft;

  return (
    <div className="space-y-6">
      {/* Top Diagnostics Control Banner */}
      <div className={`rounded-2xl border p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 ${surfaceBg}`}>
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl border ${
                isLightMode
                  ? 'bg-sky-50 border-sky-200 text-sky-600'
                  : 'bg-sky-500/15 border-sky-500/30 text-sky-400'
              }`}
            >
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className={`text-base font-bold ${textPrimary}`}>
                  {isEn
                    ? 'Interactive Troubleshooting & Root-Cause Diagnostics'
                    : 'دیاگنوستیگ جامع و عیب‌یابی سریع سیستم کاربر'}
                </h2>
                <FieldInfoTooltip
                  title={isEn ? 'Endpoint Diagnostics' : 'دیاگنوستیگ هوشمند'}
                  whatIsIt={
                    isEn
                      ? 'Runs 13 customizable live checks (IP/DNS, Gateway, Link Speed, Routes, Proxy, Internet, VPN, OS Drive/Temp/Recycle Bin, Windows Integrity, Last Update, Drivers, CPU/RAM, Top Apps) and gives one-click jump buttons to fix each finding.'
                      : '۱۳ بررسی کلیدی شامل شبکه، اینترنت، پروکسی، VPN، فضای درایو C و سطل زباله، سلامت فایل‌های ویندوز، تاریخ آخرین آپدیت، درایورها، CPU/RAM و برنامه‌های پرمصرف را به‌صورت یکجا اجرا می‌کند.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Eliminates manual tab hunting: pinpoint the issue in seconds and jump straight to the exact section that fixes it.'
                      : 'به‌جای گشتن در تب‌های متعدد، در چند ثانیه ریشه مشکل را نمایش داده و با دکمه اختصاصی هر بخش مستقیماً به همان صفحه برای رفع مشکل هدایت می‌شوید.'
                  }
                  example={
                    isEn
                      ? 'Click "Start Diagnostics" → adjust checkmarks if needed → inspect findings → click Jump to Fix.'
                      : 'روی «شروع دیاگنوستیک» کلیک کنید ← تیک‌ها را در صورت نیاز تنظیم کنید ← نتیجه را ببینید و مستقیم به بخش اصلاح بروید.'
                  }
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>
              <p className={`text-xs mt-0.5 ${textMuted}`}>
                {isEn
                  ? `${selectedChecks.length} of 13 diagnostic checks active · Click "Start Diagnostics" to customize checks and inspect the endpoint.`
                  : `${selectedChecks.length} از ۱۳ بررسی انتخاب شده · با زدن «شروع دیاگنوستیک» می‌توانید موارد بررسی را کم یا زیاد کرده و اسکن را اجرا کنید.`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={!canRunDiagnostics || loading}
            onClick={onOpenConfigModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>
              {loading
                ? isEn
                  ? 'Running Checks...'
                  : 'در حال دیاگ گرفتن...'
                : isEn
                ? 'Start Diagnostics'
                : 'شروع دیاگنوستیک (انتخاب و اجرا)'}
            </span>
          </button>

          {data && (
            <>
              <button
                type="button"
                disabled={!canRunDiagnostics || loading}
                onClick={onRunQuickSelected}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition disabled:opacity-50 cursor-pointer ${
                  isLightMode
                    ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 text-sky-500 ${loading ? 'animate-spin' : ''}`} />
                <span>{isEn ? 'Re-run Selected' : 'اجرای مجدد'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                  isLightMode
                    ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                }`}
              >
                <Download className="w-3.5 h-3.5 text-emerald-500" />
                <span>CSV</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 flex items-start gap-3 text-xs overflow-hidden">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0 flex-1">
            <div className="font-bold text-rose-500">
              {isEn ? 'Diagnostics Execution Failed' : 'خطا در اجرای دیاگنوستیک'}
            </div>
            <div className={`break-words ${isLightMode ? 'text-rose-800' : 'text-rose-200'}`}>{error}</div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className={`rounded-2xl border p-12 text-center space-y-3 ${surfaceBg}`}>
          <Loader2 className="w-9 h-9 mx-auto text-sky-500 animate-spin" />
          <div className={`text-sm font-bold ${textPrimary}`}>
            {isEn
              ? `Running ${selectedChecks.length} live troubleshooting checks on ${targetIp}...`
              : `در حال اجرای ${selectedChecks.length} بررسی عیب‌یابی زنده روی سیستم ${targetIp}...`}
          </div>
          <p className={`text-xs max-w-lg mx-auto ${textMuted}`}>
            {isEn
              ? 'Inspecting IP/DNS, gateway ping, link speed, routing table, proxy, internet reachability, VPN, C: drive & Recycle Bin, Windows integrity, last update, drivers, CPU/RAM, and heavy processes.'
              : 'در حال بررسی IP/DNS، پینگ گیت‌وی، سرعت لینک شبکه، روت‌ها، پروکسی، اینترنت، VPN، فضای درایو ویندوز و سطل زباله، سلامت ویندوز، آخرین آپدیت، درایورها و منابع مصرفی...'}
          </p>
        </div>
      )}

      {/* Empty Ready State */}
      {!data && !loading && (
        <div className={`rounded-2xl border p-10 text-center space-y-4 ${surfaceBg}`}>
          <div
            className={`w-14 h-14 mx-auto rounded-2xl border flex items-center justify-center ${
              isLightMode ? 'bg-sky-50 border-sky-200 text-sky-600' : 'bg-sky-500/10 border-sky-500/30 text-sky-400'
            }`}
          >
            <Stethoscope className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-xl mx-auto">
            <h3 className={`text-base font-bold ${textPrimary}`}>
              {isEn
                ? 'Ready for Guided Endpoint Troubleshooting'
                : 'آماده شروع عیب‌یابی مرحله‌به‌مرحله و سریع سیستم کاربر'}
            </h3>
            <p className={`text-xs leading-relaxed ${textMuted}`}>
              {isEn
                ? 'Click "Start Diagnostics" to review all 13 pre-selected checks (customize checkboxes as needed) and run a comprehensive live diagnosis with direct fix shortcuts to every HelpDesk module.'
                : 'روی «شروع دیاگنوستیک» کلیک کنید تا پنجره انتخاب موارد (که همگی به صورت پیش‌فرض تیک خورده‌اند) باز شود. پس از اجرا، وضعیت هر بخش با جزئیات دقیق و دکمه ورود مستقیم به قسمت رفع مشکل نمایش داده می‌شود.'}
            </p>
          </div>
          <button
            type="button"
            disabled={!canRunDiagnostics}
            onClick={onOpenConfigModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>{isEn ? 'Configure & Start Diagnostics' : 'انتخاب موارد و شروع دیاگنوستیک'}</span>
          </button>
        </div>
      )}

      {/* Results View */}
      {data && !loading && (
        <>
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className={`rounded-xl border p-4 ${surfaceBg}`}>
              <div className={`text-[11px] font-medium ${textMuted}`}>
                {isEn ? 'Endpoint & Duration' : 'سیستم و زمان اجرا'}
              </div>
              <div className={`text-sm font-bold truncate mt-1 ${textPrimary}`} title={data.hostname}>
                {data.hostname || data.targetIp}
              </div>
              <div className={`text-[11px] font-mono mt-0.5 flex items-center gap-1 ${textMuted}`}>
                <Clock className="w-3 h-3" />
                <span>{((Number(data.totalDurationMs) || 0) / 1000).toFixed(1)}s</span>
                <span>·</span>
                <span>{String(data.protocolUsed || '').toUpperCase()}</span>
              </div>
            </div>

            <div className={`rounded-xl border p-4 ${surfaceBg}`}>
              <div className={`text-[11px] font-medium ${textMuted}`}>
                {isEn ? 'Items Inspected' : 'کل موارد بررسی‌شده'}
              </div>
              <div className={`text-2xl font-bold font-mono tabular-nums mt-1 ${textPrimary}`}>
                {data.summary?.totalChecked ?? checks.length}
              </div>
            </div>

            <div className={`rounded-xl border p-4 ${surfaceBg}`}>
              <div className={`text-[11px] font-medium ${textMuted}`}>
                {isEn ? 'Healthy / Passed' : 'سالم (Passed)'}
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-emerald-500">
                {data.summary?.passed ?? 0}
              </div>
            </div>

            <div className={`rounded-xl border p-4 ${surfaceBg}`}>
              <div className={`text-[11px] font-medium ${textMuted}`}>
                {isEn ? 'Warnings / Notices' : 'هشدار / نیازمند توجه'}
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-amber-500">
                {data.summary?.warnings ?? 0}
              </div>
            </div>

            <div className={`rounded-xl border p-4 ${surfaceBg}`}>
              <div className={`text-[11px] font-medium ${textMuted}`}>
                {isEn ? 'Critical Issues Found' : 'خطا و مشکل یافت‌شده'}
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-rose-500">
                {data.summary?.failures ?? 0}
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className={`rounded-xl border p-3 flex flex-wrap items-center justify-between gap-3 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all' as const, en: `All (${checks.length})`, fa: `همه (${checks.length})` },
                {
                  id: 'issues' as const,
                  en: `Issues & Warnings (${(data.summary?.failures || 0) + (data.summary?.warnings || 0)})`,
                  fa: `خطاها و هشدارها (${(data.summary?.failures || 0) + (data.summary?.warnings || 0)})`,
                },
                {
                  id: 'passed' as const,
                  en: `Healthy (${(data.summary?.passed || 0) + (data.summary?.infoOnly || 0)})`,
                  fa: `موارد سالم (${(data.summary?.passed || 0) + (data.summary?.infoOnly || 0)})`,
                },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    statusFilter === st.id
                      ? 'bg-sky-600 text-white'
                      : isLightMode
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {isEn ? st.en : st.fa}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all' as const, en: 'All Categories', fa: 'همه بخش‌ها', icon: Stethoscope },
                { id: 'network' as const, en: 'Network & VPN', fa: 'شبکه و VPN', icon: Network },
                { id: 'system_storage' as const, en: 'Storage, OS & Updates', fa: 'دیسک، ویندوز و آپدیت', icon: HardDrive },
                { id: 'hardware_perf' as const, en: 'Drivers & Performance', fa: 'درایورها و منابع', icon: Cpu },
              ].map((cat) => {
                const CatIcon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                      categoryFilter === cat.id
                        ? isLightMode
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-slate-100 border-slate-100 text-slate-900'
                        : isLightMode
                        ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <CatIcon className="w-3.5 h-3.5" />
                    <span>{isEn ? cat.en : cat.fa}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Diagnostic Cards Grid */}
          {filteredChecks.length === 0 ? (
            <div className={`rounded-xl border p-8 text-center text-xs ${surfaceBg} ${textMuted}`}>
              {isEn ? 'No diagnostic checks match the active filters.' : 'هیچ موردی مطابق فیلتر انتخابی نیست.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filteredChecks.map((chk) => {
                const CardIcon = iconMap.get(chk.id) || Stethoscope;
                const statusBadgeStyle =
                  chk.status === 'pass'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                    : chk.status === 'warn'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                    : chk.status === 'fail'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                    : 'border-sky-500/40 bg-sky-500/10 text-sky-500';

                const borderAccent =
                  chk.status === 'fail'
                    ? isLightMode
                      ? 'border-rose-300 bg-white'
                      : 'border-rose-500/40 bg-slate-900/90'
                    : chk.status === 'warn'
                    ? isLightMode
                      ? 'border-amber-300 bg-white'
                      : 'border-amber-500/40 bg-slate-900/90'
                    : surfaceBg;

                const StatusIcon =
                  chk.status === 'pass'
                    ? CheckCircle2
                    : chk.status === 'warn'
                    ? AlertTriangle
                    : chk.status === 'fail'
                    ? AlertCircle
                    : Info;

                return (
                  <div
                    key={chk.id}
                    className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-xs transition min-w-0 overflow-hidden ${borderAccent}`}
                  >
                    <div className="space-y-3.5 min-w-0">
                      {/* Card Header */}
                      <div className="flex flex-wrap items-start justify-between gap-2.5 min-w-0">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <div
                            className={`p-2 rounded-xl border shrink-0 mt-0.5 ${
                              isLightMode
                                ? 'bg-slate-50 border-slate-200 text-sky-600'
                                : 'bg-slate-950 border-slate-800 text-sky-400'
                            }`}
                          >
                            <CardIcon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className={`text-sm font-bold leading-snug break-words ${textPrimary}`}>
                              {isEn ? chk.titleEn : chk.titleFa}
                            </h3>
                            <div className={`text-[11px] font-mono mt-0.5 ${textMuted}`}>
                              {chk.durationMs} ms
                            </div>
                          </div>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold shrink-0 max-w-full truncate ${statusBadgeStyle}`}
                          title={String(isEn ? chk.statusLabelEn : chk.statusLabelFa)}
                        >
                          <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{isEn ? chk.statusLabelEn : chk.statusLabelFa}</span>
                        </span>
                      </div>

                      {/* Primary Human-Readable Summary */}
                      <p className={`text-xs leading-relaxed break-words ${textPrimary}`}>
                        {isEn ? chk.summaryEn : chk.summaryFa}
                      </p>

                      {/* Key Metrics Strip */}
                      {Array.isArray(chk.metrics) && chk.metrics.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {chk.metrics.map((m: any, mIdx: number) => {
                            const valColor =
                              m.tone === 'fail'
                                ? 'text-rose-500'
                                : m.tone === 'warn'
                                ? 'text-amber-500'
                                : m.tone === 'ok'
                                ? 'text-emerald-500'
                                : textPrimary;
                            return (
                              <div key={mIdx} className={`rounded-xl border px-3 py-2 min-w-0 ${subSurfaceBg}`}>
                                <div className={`text-[10px] truncate ${textMuted}`}>
                                  {isEn ? m.labelEn : m.labelFa}
                                </div>
                                <div
                                  dir="ltr"
                                  className={`text-xs font-bold font-mono truncate mt-0.5 ${valColor}`}
                                  title={m.value}
                                >
                                  {m.value}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Detailed Highlights List */}
                      {Array.isArray(chk.highlights) && chk.highlights.length > 0 && (
                        <div className={`rounded-xl border divide-y overflow-hidden ${subSurfaceBg} ${isLightMode ? 'divide-slate-200' : 'divide-slate-800'}`}>
                          {chk.highlights.map((hl: any, hIdx: number) => (
                            <div key={hIdx} className="px-3 py-2 flex items-center justify-between gap-3 text-xs min-w-0">
                              <div className="min-w-0 flex-1">
                                <div dir="ltr" className={`font-mono font-semibold truncate ${textPrimary}`} title={hl.primary}>
                                  {hl.primary}
                                </div>
                                {hl.secondary && (
                                  <div dir="ltr" className={`text-[11px] truncate ${textMuted}`} title={hl.secondary}>
                                    {hl.secondary}
                                  </div>
                                )}
                              </div>
                              {hl.badge && (
                                <span
                                  dir="ltr"
                                  title={String(hl.badge)}
                                  className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold shrink-0 max-w-[45%] truncate ${
                                    hl.badgeTone === 'fail'
                                      ? 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                                      : hl.badgeTone === 'warn'
                                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                                      : hl.badgeTone === 'ok'
                                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                                      : 'border-slate-500/30 bg-slate-500/10 text-slate-400'
                                  }`}
                                >
                                  {hl.badge}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Footer: Troubleshooting Advice + Exact Tab/Section Jump Button */}
                    <div
                      className={`pt-3 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 min-w-0 ${
                        isLightMode ? 'border-slate-200' : 'border-slate-800'
                      }`}
                    >
                      <p className={`text-[11px] leading-relaxed break-words min-w-0 flex-1 ${textMuted}`}>
                        {isEn ? chk.recommendationEn : chk.recommendationFa}
                      </p>
                      {chk.jumpTarget && (
                        <button
                          type="button"
                          onClick={() => onJumpToSection(chk.jumpTarget.tab, chk.jumpTarget.sectionId)}
                          className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 cursor-pointer ${
                            chk.status === 'fail' || chk.status === 'warn'
                              ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-xs'
                              : isLightMode
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
                          }`}
                        >
                          <span>{isEn ? chk.jumpTarget.labelEn : chk.jumpTarget.labelFa}</span>
                          <JumpArrow className="w-3.5 h-3.5 shrink-0" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
