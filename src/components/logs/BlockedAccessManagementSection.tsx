import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Globe,
  History,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import {
  AuthBlockTargetType,
  AuthBlocklistEntry,
  AuthBlocklistSummary,
} from '../../types';
import { unblockAuthTargetApi } from '../../services/api';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface BlockedAccessManagementSectionProps {
  isLightMode?: boolean;
  isEn?: boolean;
  isRtl?: boolean;
  entries: AuthBlocklistEntry[];
  summary: AuthBlocklistSummary | null;
  isLoading?: boolean;
  loadError?: string | null;
  formatDateTime: (iso: string) => string;
  onRefresh: () => void;
  onOpenAddBlockModal: (targetType?: AuthBlockTargetType, targetValue?: string) => void;
  onUnblocked: (updatedEntry: AuthBlocklistEntry) => void;
  onExportCsv: (entries: AuthBlocklistEntry[]) => void;
  onNavigateBackToLogins?: () => void;
}

type BlocklistStatusFilter = 'active' | 'history' | 'all';
type BlocklistTypeFilter = 'all' | 'ip' | 'user';

export const BlockedAccessManagementSection: React.FC<BlockedAccessManagementSectionProps> = ({
  isLightMode = false,
  isEn = false,
  isRtl = false,
  entries,
  summary,
  isLoading = false,
  loadError = null,
  formatDateTime,
  onRefresh,
  onOpenAddBlockModal,
  onUnblocked,
  onExportCsv,
  onNavigateBackToLogins,
}) => {
  const [statusFilter, setStatusFilter] = useState<BlocklistStatusFilter>('active');
  const [typeFilter, setTypeFilter] = useState<BlocklistTypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Unblock Rule 7 Modal State
  const [entryToUnblock, setEntryToUnblock] = useState<AuthBlocklistEntry | null>(null);
  const [unblockNote, setUnblockNote] = useState('');
  const [isUnblockModalMaximized, setIsUnblockModalMaximized] = useState(false);
  const [isUnblocking, setIsUnblocking] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleCopy = (value: string, id: string) => {
    navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (entries || []).filter((item) => {
      if (statusFilter === 'active' && !item.isActive) return false;
      if (statusFilter === 'history' && item.isActive) return false;
      if (typeFilter !== 'all' && item.targetType !== typeFilter) return false;
      if (!q) return true;
      return [
        item.displayValue,
        item.targetValue,
        item.reason,
        item.blockedBy,
        item.unblockedBy || '',
        item.unblockReason || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [entries, statusFilter, typeFilter, searchQuery]);

  const computedSummary = useMemo(() => {
    if (summary) return summary;
    const active = (entries || []).filter((e) => e.isActive);
    return {
      activeTotal: active.length,
      activeUsers: active.filter((e) => e.targetType === 'user').length,
      activeIps: active.filter((e) => e.targetType === 'ip').length,
      historyTotal: (entries || []).filter((e) => !e.isActive).length,
      totalHitsPrevented: (entries || []).reduce((acc, e) => acc + (e.hitCount || 0), 0),
    };
  }, [entries, summary]);

  const formatExactDateTime = (iso?: string | null) => {
    if (!iso) return isEn ? '—' : '—';
    try {
      return new Date(iso).toLocaleString(isEn ? 'en-US' : 'fa-IR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return formatDateTime(iso);
    }
  };

  const handleConfirmUnblock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryToUnblock) return;
    setIsUnblocking(true);
    setActionFeedback(null);
    try {
      const res = await unblockAuthTargetApi(entryToUnblock.id, unblockNote.trim());
      if (res?.success && res?.entry) {
        const updated = res.entry as AuthBlocklistEntry;
        onUnblocked(updated);
        setActionFeedback({
          type: 'success',
          message: isEn
            ? `${updated.targetType === 'ip' ? 'IP address' : 'User'} "${updated.displayValue}" has been unblocked and can sign in again.`
            : `${updated.targetType === 'ip' ? 'آدرس IP' : 'کاربر'} «${updated.displayValue}» از مسدودی خارج شد و مجدداً امکان ورود دارد.`,
        });
        setEntryToUnblock(null);
        setUnblockNote('');
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn
            ? res?.error || 'Failed to unblock target.'
            : res?.message || 'خطا در رفع مسدودیت.',
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err?.message || (isEn ? 'Failed to unblock target.' : 'خطا در برقراری ارتباط با سرور برای رفع مسدودیت.'),
      });
    } finally {
      setIsUnblocking(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="p-5 rounded-2xl audit-glass-panel border border-white/10 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-rose-500/25 shrink-0">
            <Ban className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className={`text-base sm:text-lg font-bold tracking-tight ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                {isEn ? 'Blocked Users & Source IPs Management' : 'مدیریت کاربران و آدرس‌های IP مسدودشده'}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-rose-500/15 text-rose-500 border border-rose-500/30">
                {computedSummary.activeTotal} {isEn ? 'Active Blocks' : 'مسدودی فعال'}
              </span>
            </div>
            <p className={`text-xs mt-1 max-w-2xl leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
              {isEn
                ? 'Inspect blacklisted users and source IPs blocked from signing in, review blocked attempt counts, add new restrictions, or unblock entries to immediately restore login access.'
                : 'مشاهده فهرست کاربران و آدرس‌های IP مسدودشده، بررسی تعداد تلاش‌های مسدودشده، افزودن مسدودیت جدید یا رفع مسدودی جهت برقراری فوری امکان ورود مجدد.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {onNavigateBackToLogins && (
            <button
              type="button"
              onClick={onNavigateBackToLogins}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                isLightMode
                  ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isEn ? 'User Login Reports' : 'گزارش‌های ورود کاربران'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenAddBlockModal('ip', '')}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/25 flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isEn ? 'Block IP / User' : 'افزودن مسدودیت جدید'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {actionFeedback && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs ${
            actionFeedback.type === 'success'
              ? isLightMode
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
            )}
            <span className="font-semibold">{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="p-1 rounded hover:bg-black/10 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Load Error */}
      {loadError && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs ${
            isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer"
          >
            {isEn ? 'Retry' : 'تلاش مجدد'}
          </button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl audit-glass-panel border border-white/10 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
              {isEn ? 'Active Blocked Users' : 'کاربران مسدود فعال'}
            </span>
            <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/20">
              <UserX className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-black font-mono tabular-nums ${isLightMode ? 'text-rose-700' : 'text-rose-400'}`}>
              {computedSummary.activeUsers}
            </span>
            <span className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'accounts' : 'حساب کاربری'}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl audit-glass-panel border border-white/10 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
              {isEn ? 'Active Blocked IPs' : 'آی‌پی‌های مسدود فعال'}
            </span>
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20">
              <Globe className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-black font-mono tabular-nums ${isLightMode ? 'text-amber-700' : 'text-amber-400'}`}>
              {computedSummary.activeIps}
            </span>
            <span className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'IP addresses' : 'آدرس IP'}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl audit-glass-panel border border-white/10 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
              {isEn ? 'Login Hits Prevented' : 'ورودهای جلوگیری‌شده'}
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-black font-mono tabular-nums ${isLightMode ? 'text-indigo-700' : 'text-indigo-400'}`}>
              {computedSummary.totalHitsPrevented}
            </span>
            <span className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'rejected attempts' : 'تلاش مسدودشده'}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl audit-glass-panel border border-white/10 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
              {isEn ? 'Unblocked & Expired' : 'رفع مسدودی / منقضی'}
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              <History className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-black font-mono tabular-nums ${isLightMode ? 'text-emerald-700' : 'text-emerald-400'}`}>
              {computedSummary.historyTotal}
            </span>
            <span className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'archived rules' : 'سابقه آزادسازی'}
            </span>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col xl:flex-row gap-3 items-stretch xl:items-center justify-between p-3.5 rounded-2xl audit-glass-panel border border-white/10">
        <div className={`flex items-center gap-1.5 p-1 rounded-xl border flex-wrap ${isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-black/25 border-white/5'}`}>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              statusFilter === 'active'
                ? 'bg-rose-600 text-white shadow-md'
                : isLightMode
                ? 'text-slate-700 hover:bg-white'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Ban className="w-3.5 h-3.5" />
            <span>{isEn ? 'Currently Blocked' : 'مسدودی‌های فعال'}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-white font-mono">
              {computedSummary.activeTotal}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              statusFilter === 'history'
                ? 'bg-indigo-600 text-white shadow-md'
                : isLightMode
                ? 'text-slate-700 hover:bg-white'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>{isEn ? 'Unblocked & Expired History' : 'تاریخچه رفع مسدودی'}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-white font-mono">
              {computedSummary.historyTotal}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-md'
                : isLightMode
                ? 'text-slate-700 hover:bg-white'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>{isEn ? 'All' : 'همه'}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-white font-mono">
              {entries.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap flex-1 xl:justify-end">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 text-slate-400 ltr:left-3 rtl:right-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isEn
                  ? 'Search IP, username, reason, operator...'
                  : 'جستجو IP، نام کاربری، دلیل، اپراتور...'
              }
              className={`w-full text-xs py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ltr:pl-9 ltr:pr-8 rtl:pr-9 rtl:pl-8 ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                  : 'bg-black/20 border-white/10 text-white placeholder:text-slate-400'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute top-1/2 -translate-y-1/2 text-slate-400 hover:text-white ltr:right-2.5 rtl:left-2.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as BlocklistTypeFilter)}
            className={`text-xs py-2 px-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
              isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-black/20 border-white/10 text-white'
            }`}
          >
            <option value="all" className={isLightMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
              {isEn ? 'All Targets (IP & User)' : 'همه اهداف (IP و کاربر)'}
            </option>
            <option value="ip" className={isLightMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
              {isEn ? 'IP Addresses Only' : 'فقط آدرس‌های IP'}
            </option>
            <option value="user" className={isLightMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
              {isEn ? 'Users Only' : 'فقط کاربران'}
            </option>
          </select>

          <button
            type="button"
            onClick={() => onExportCsv(filteredEntries)}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              isLightMode
                ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isEn ? 'Export CSV' : 'خروجی CSV'}</span>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              isLightMode
                ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{isEn ? 'Refresh' : 'بروزرسانی'}</span>
          </button>
        </div>
      </div>

      {/* Blocklist Table */}
      <div className="audit-glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left rtl:text-right border-collapse text-xs audit-table">
            <thead>
              <tr className="border-b border-white/10 text-slate-300 font-semibold">
                <th className="py-3 px-3.5">{isEn ? 'Blocked Target' : 'هدف مسدودشده'}</th>
                <th className="py-3 px-3.5">{isEn ? 'Status' : 'وضعیت'}</th>
                <th className="py-3 px-3.5">{isEn ? 'Duration / Expiry' : 'مدت / انقضا'}</th>
                <th className="py-3 px-3.5">{isEn ? 'Reason' : 'دلیل مسدودی'}</th>
                <th className="py-3 px-3.5">{isEn ? 'Blocked By & Date' : 'مسدودکننده و تاریخ'}</th>
                <th className="py-3 px-3.5 text-center">{isEn ? 'Prevented Hits' : 'تلاش‌های مسدودشده'}</th>
                <th className="py-3 px-3.5 text-center">{isEn ? 'Action' : 'عملیات'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ShieldCheck className="w-9 h-9 opacity-35 text-emerald-400" />
                      <span className="text-sm font-medium">
                        {statusFilter === 'active'
                          ? isEn
                            ? 'No users or IP addresses are currently blocked.'
                            : 'در حال حاضر هیچ کاربر یا آدرس IP مسدودشده‌ای وجود ندارد.'
                          : isEn
                          ? 'No matching blocklist records found.'
                          : 'رکوردی در لیست مسدودسازی مطابق فیلتر یافت نشد.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.03] transition">
                    {/* Target */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-1.5 rounded-lg border shrink-0 ${
                            item.targetType === 'ip'
                              ? isLightMode
                                ? 'bg-amber-50 border-amber-200 text-amber-700'
                                : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                              : isLightMode
                              ? 'bg-rose-50 border-rose-200 text-rose-700'
                              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                          }`}
                        >
                          {item.targetType === 'ip' ? (
                            <Globe className="w-3.5 h-3.5" />
                          ) : (
                            <UserX className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              dir="ltr"
                              className={`font-mono font-bold text-xs ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {item.displayValue}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(item.displayValue, item.id)}
                              className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-cyan-400 cursor-pointer"
                              title={isEn ? 'Copy' : 'کپی'}
                            >
                              {copiedId === item.id ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                          <span className={`text-[10px] block ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {item.targetType === 'ip'
                              ? isEn
                                ? 'IP Address'
                                : 'آدرس IP'
                              : isEn
                              ? 'User Account'
                              : 'حساب کاربری'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      {item.isActive ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                            isLightMode
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          <Ban className="w-3 h-3" />
                          <span>{isEn ? 'Blocked' : 'مسدود'}</span>
                        </span>
                      ) : item.status === 'expired' ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                            isLightMode
                              ? 'bg-slate-100 text-slate-700 border-slate-300'
                              : 'bg-slate-500/15 text-slate-300 border-slate-500/30'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          <span>{isEn ? 'Expired' : 'منقضی شده'}</span>
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                            isLightMode
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          }`}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{isEn ? 'Unblocked' : 'رفع مسدودی'}</span>
                        </span>
                      )}
                    </td>

                    {/* Duration */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      {item.expiresAt ? (
                        <div>
                          <span className={`font-mono text-[11px] block tabular-nums ${isLightMode ? 'text-amber-700' : 'text-amber-300'}`}>
                            {formatExactDateTime(item.expiresAt)}
                          </span>
                          <span className={`text-[10px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Temporary' : 'موقت'}
                          </span>
                        </div>
                      ) : (
                        <span className={`font-semibold text-[11px] ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                          {isEn ? 'Permanent' : 'دائمی'}
                        </span>
                      )}
                    </td>

                    {/* Reason */}
                    <td className="py-3 px-3.5 max-w-[220px]">
                      <span
                        className={`block truncate ${isLightMode ? 'text-slate-700' : 'text-slate-200'}`}
                        title={item.reason || ''}
                      >
                        {item.reason || (isEn ? 'Blocked by administrator' : 'مسدودسازی توسط مدیر سیستم')}
                      </span>
                      {!item.isActive && item.unblockedBy && (
                        <span className={`text-[10px] block truncate mt-0.5 ${isLightMode ? 'text-emerald-700' : 'text-emerald-400'}`}>
                          {isEn
                            ? `Unblocked by ${item.unblockedBy}${item.unblockReason ? ` (${item.unblockReason})` : ''}`
                            : `رفع مسدودی توسط ${item.unblockedBy}${item.unblockReason ? ` (${item.unblockReason})` : ''}`}
                        </span>
                      )}
                    </td>

                    {/* Blocked By & Time */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <span className={`font-mono font-semibold block ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                        {item.blockedBy}
                      </span>
                      <span className={`font-mono text-[10px] block tabular-nums ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {formatExactDateTime(item.blockedAt)}
                      </span>
                    </td>

                    {/* Hit Count */}
                    <td className="py-3 px-3.5 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[11px] font-bold tabular-nums ${
                          item.hitCount > 0
                            ? isLightMode
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            : isLightMode
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-white/5 text-slate-400'
                        }`}
                      >
                        {item.hitCount}×
                      </span>
                      {item.lastHitAt && (
                        <span className={`text-[10px] font-mono block mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {formatDateTime(item.lastHitAt)}
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-3.5 text-center whitespace-nowrap">
                      {item.isActive ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEntryToUnblock(item);
                            setUnblockNote('');
                            setIsUnblockModalMaximized(false);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-md shadow-emerald-600/20 inline-flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Unblock' : 'رفع مسدودی'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenAddBlockModal(item.targetType, item.displayValue)}
                          className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer ${
                            isLightMode
                              ? 'bg-slate-100 hover:bg-rose-50 border-slate-300 text-slate-700 hover:text-rose-700 hover:border-rose-300'
                              : 'bg-white/5 hover:bg-rose-500/15 border-white/10 text-slate-300 hover:text-rose-300 hover:border-rose-500/30'
                          }`}
                        >
                          <Ban className="w-3 h-3" />
                          <span>{isEn ? 'Re-Block' : 'مسدودسازی مجدد'}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* UNBLOCK CONFIRMATION MODAL (Rule 7 Compliant Portal + Footer Clearance + 3 Controls + FieldInfoTooltip) */}
      {entryToUnblock &&
        createPortal(
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="fixed top-0 left-0 right-0 bottom-8 z-[9999] modal-glass-backdrop flex items-center justify-center p-3 sm:p-5"
          >
            <div
              className={`border rounded-2xl flex flex-col shadow-2xl overflow-hidden transition-all ${
                isUnblockModalMaximized
                  ? 'w-full h-full max-w-none max-h-full'
                  : 'w-full max-w-md max-h-[88vh]'
              } ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-900'
                  : 'bg-slate-950 border-slate-800 text-slate-100'
              }`}
            >
              {/* Header */}
              <div
                className={`px-5 py-4 border-b flex items-center justify-between gap-3 shrink-0 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 shrink-0">
                    <Unlock className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className={`text-sm font-bold truncate ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn ? 'Confirm Unblock Access' : 'تایید رفع مسدودی و بازگردانی دسترسی'}
                    </h3>
                    <p
                      dir="ltr"
                      className={`text-[11px] font-mono truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}
                    >
                      {entryToUnblock.targetType.toUpperCase()}: {entryToUnblock.displayValue}
                    </p>
                  </div>
                </div>

                <ModalHeaderControls
                  isLightMode={isLightMode}
                  isEn={isEn}
                  isMaximized={isUnblockModalMaximized}
                  onMaximizeToggle={() => setIsUnblockModalMaximized((v) => !v)}
                  onClose={() => setEntryToUnblock(null)}
                />
              </div>

              {/* Form Body */}
              <form onSubmit={handleConfirmUnblock} className="flex-1 flex flex-col min-h-0">
                <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1 custom-scrollbar">
                  <div
                    className={`p-3.5 rounded-xl border leading-relaxed ${
                      isLightMode
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    }`}
                  >
                    {isEn
                      ? `Unblocking "${entryToUnblock.displayValue}" will allow immediate authentication again while retaining this block entry in the security audit history.`
                      : `با رفع مسدودی «${entryToUnblock.displayValue}»، امکان ورود مجدد به پنل بلافاصله فعال می‌شود و سابقه این مسدودیت در تاریخچه ممیزی حفظ خواهد شد.`}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <label className={`font-bold ${isLightMode ? 'text-slate-700' : 'text-slate-200'}`}>
                        {isEn ? 'Unblock Reason / Audit Note (Optional)' : 'توضیح رفع مسدودی (اختیاری)'}
                      </label>
                      <FieldInfoTooltip
                        isEn={isEn}
                        isLightMode={isLightMode}
                        title={isEn ? 'Unblock Audit Note' : 'یادداشت رفع مسدودی'}
                        whatIsIt={
                          isEn
                            ? 'Optional operator explanation logged when lifting a login block.'
                            : 'یادداشت اختیاری که هنگام آزادسازی کاربر یا IP در تاریخچه امنیتی ثبت می‌گردد.'
                        }
                        whyIsItNeeded={
                          isEn
                            ? 'Provides a complete compliance trail showing who approved restoring access and why.'
                            : 'شفافیت کامل در ممیزی امنیتی ایجاد می‌کند که چه‌کسی و به چه دلیلی دسترسی را بازگردانده است.'
                        }
                        example={isEn ? 'Verified with user via IT helpdesk ticket #482' : 'بررسی و تایید هویت کاربر طی تیکت پشتیبانی'}
                      />
                    </div>
                    <textarea
                      rows={3}
                      value={unblockNote}
                      onChange={(e) => setUnblockNote(e.target.value)}
                      placeholder={
                        isEn
                          ? 'e.g. False positive verified / User password reset completed...'
                          : 'مثال: بررسی و تایید هویت کاربر انجام شد / تغییر رمز عبور انجام شد...'
                      }
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-xs resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                          : 'bg-slate-900 border-slate-700 text-white placeholder:text-slate-500'
                      }`}
                    />
                  </div>
                </div>

                <div
                  className={`px-5 py-3.5 border-t flex items-center justify-end gap-2 shrink-0 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setEntryToUnblock(null)}
                    disabled={isUnblocking}
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
                    disabled={isUnblocking}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/25 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    {isUnblocking ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>{isEn ? 'Unblocking...' : 'در حال رفع مسدودی...'}</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Confirm Unblock' : 'تایید و رفع مسدودی'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
