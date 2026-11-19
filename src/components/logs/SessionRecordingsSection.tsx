import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Video,
  Play,
  Download,
  Trash2,
  Lock,
  Unlock,
  Search,
  RefreshCw,
  Terminal,
  Monitor,
  ShieldAlert,
  Settings,
  X,
  Minus,
  Maximize2,
  Minimize2,
  FileText,
  AlertTriangle,
  CheckCircle2,
  HardDrive,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useModalDock } from '../../context/ModalDockContext';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import {
  fetchSessionRecordings,
  downloadSessionRecordingFile,
  setSessionRecordingLegalHold,
  deleteSessionRecording,
  formatBytes,
  formatDurationSeconds,
} from '../../services/sessionRecordingApi';
import { SessionRecordingPlayerModal } from './SessionRecordingPlayerModal';
import type {
  SessionRecordingRecord,
  SessionRecordingSummaryStats,
  SessionRecordingListResponse,
} from '../../types';

interface SessionRecordingsSectionProps {
  isLightMode?: boolean;
  initialServerFilter?: string;
  onConsumeInitialFilter?: () => void;
  onNavigateToSettings?: () => void;
}

export const SessionRecordingsSection: React.FC<SessionRecordingsSectionProps> = ({
  isLightMode = false,
  initialServerFilter = '',
  onConsumeInitialFilter,
  onNavigateToSettings,
}) => {
  const { isEn } = useLanguage();
  const { dockModal, undockModal } = useModalDock();

  const [recordings, setRecordings] = useState<SessionRecordingRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<SessionRecordingSummaryStats>({
    totalCount: 0,
    totalBytes: 0,
    sshCount: 0,
    rdpCount: 0,
    vncCount: 0,
    legalHoldCount: 0,
    highRiskCount: 0,
    transcodingCount: 0,
  });
  const [permissions, setPermissions] = useState<NonNullable<SessionRecordingListResponse['permissions']>>({
    canView: true,
    canPlayback: true,
    canDownload: true,
    canDelete: false,
    canLegalHold: false,
    canManageSettings: false,
  });

  // Filters
  const [search, setSearch] = useState('');
  const [serverFilter, setServerFilter] = useState(initialServerFilter);
  const [protocolFilter, setProtocolFilter] = useState<string>('all');
  const [legalHoldFilter, setLegalHoldFilter] = useState<string>('all');
  const [highRiskOnly, setHighRiskOnly] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Active modals
  const [activePlayerRec, setActivePlayerRec] = useState<SessionRecordingRecord | null>(null);
  const [isPlayerMinimized, setIsPlayerMinimized] = useState(false);

  const [legalHoldTarget, setLegalHoldTarget] = useState<SessionRecordingRecord | null>(null);
  const [legalHoldReason, setLegalHoldReason] = useState('');
  const [legalHoldBusy, setLegalHoldBusy] = useState(false);
  const [legalHoldMaximized, setLegalHoldMaximized] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SessionRecordingRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (initialServerFilter) {
      setServerFilter(initialServerFilter);
      setPage(0);
      onConsumeInitialFilter?.();
    }
  }, [initialServerFilter, onConsumeInitialFilter]);

  const loadRecordings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSessionRecordings({
        protocol: protocolFilter,
        serverId: serverFilter || undefined,
        legalHold: legalHoldFilter,
        highRiskOnly,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        search: search.trim() || undefined,
        page: page + 1,
        pageSize,
      });
      setRecordings(res.items || []);
      setTotal(res.total || 0);
      if (res.summary) setSummary(res.summary);
      if (res.permissions) setPermissions(res.permissions);
    } catch (err: any) {
      setError(
        err?.message ||
          (isEn ? 'Failed to load session recordings archive.' : 'خطا در دریافت لیست آرشیو ضبط جلسات.')
      );
    } finally {
      setLoading(false);
    }
  }, [protocolFilter, serverFilter, legalHoldFilter, highRiskOnly, startDate, endDate, search, page, isEn]);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleOpenPlayer = (rec: SessionRecordingRecord) => {
    setActivePlayerRec(rec);
    setIsPlayerMinimized(false);
    undockModal(`session-recording-player-${rec.id}`);
  };

  const handleMinimizePlayer = () => {
    if (!activePlayerRec) return;
    const rec = activePlayerRec;
    setIsPlayerMinimized(true);
    dockModal({
      id: `session-recording-player-${rec.id}`,
      labelEn: `${rec.protocol.toUpperCase()} Playback: ${rec.serverName}`,
      labelFa: `پخش ${rec.protocol.toUpperCase()}: ${rec.serverName}`,
      badge: rec.protocol.toUpperCase(),
      category: 'system',
      onRestore: () => {
        setActivePlayerRec(rec);
        setIsPlayerMinimized(false);
      },
      onClose: () => {
        setActivePlayerRec(null);
        setIsPlayerMinimized(false);
      },
    });
  };

  const handleQuickDownload = async (
    rec: SessionRecordingRecord,
    format: 'auto' | 'video' | 'raw' | 'cast' | 'txt'
  ) => {
    try {
      const ext =
        format === 'txt'
          ? 'txt'
          : rec.protocol === 'ssh'
          ? 'cast'
          : format === 'raw'
          ? 'guac'
          : rec.videoFormat === 'webm'
          ? 'webm'
          : rec.metadata?.playableVideo
          ? 'mp4'
          : 'guac';
      await downloadSessionRecordingFile(
        rec.id,
        format,
        `${rec.protocol}_${rec.serverName || 'server'}.${ext}`
      );
      showToast('success', isEn ? 'Recording download started.' : 'دانلود فایل ضبط آغاز شد.');
    } catch (err: any) {
      showToast('error', err?.message || (isEn ? 'Download failed.' : 'دانلود با خطا مواجه شد.'));
    }
  };

  const handleConfirmLegalHold = async () => {
    if (!legalHoldTarget) return;
    const enabling = !legalHoldTarget.legalHold;
    if (enabling && legalHoldReason.trim().length < 3) {
      showToast(
        'error',
        isEn ? 'Please enter a reason (min 3 characters) for Legal Hold.' : 'لطفاً علت اعمال قفل ضدحذف را وارد کنید (حداقل ۳ کاراکتر).'
      );
      return;
    }
    setLegalHoldBusy(true);
    try {
      await setSessionRecordingLegalHold(legalHoldTarget.id, enabling, legalHoldReason.trim());
      setLegalHoldTarget(null);
      setLegalHoldReason('');
      showToast(
        'success',
        enabling
          ? isEn
            ? 'Legal Hold enabled. Recording is now protected from manual and automated deletion.'
            : 'قفل ضدحذف فعال شد. این ضبط در برابر حذف دستی و خودکار محافظت می‌شود.'
          : isEn
          ? 'Legal Hold released.'
          : 'قفل ضدحذف برداشته شد.'
      );
      loadRecordings();
    } catch (err: any) {
      showToast('error', err?.message || (isEn ? 'Failed to update Legal Hold.' : 'تغییر وضعیت قفل ضدحذف با خطا مواجه شد.'));
    } finally {
      setLegalHoldBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const res = await deleteSessionRecording(deleteTarget.id);
      setDeleteTarget(null);
      showToast(
        'success',
        isEn
          ? `Recording deleted permanently (${formatBytes(res.freedBytes)} freed).`
          : `فایل ضبط برای همیشه حذف شد (${formatBytes(res.freedBytes)} فضا آزاد گردید).`
      );
      loadRecordings();
    } catch (err: any) {
      showToast('error', err?.message || (isEn ? 'Failed to delete recording.' : 'حذف ضبط با خطا مواجه شد.'));
    } finally {
      setDeleteBusy(false);
    }
  };

  const surface = isLightMode
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-slate-900/70 border-slate-800 text-slate-100';
  const mutedText = isLightMode ? 'text-slate-500' : 'text-slate-400';
  const inputCls = isLightMode
    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white'
    : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-cyan-500';
  const divider = isLightMode ? 'border-slate-200' : 'border-slate-800';
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4" dir={isEn ? 'ltr' : 'rtl'}>
      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className={`border rounded-lg px-4 py-3 ${surface}`}>
          <div className={`text-[11px] flex items-center gap-1.5 ${mutedText}`}>
            <Video className="w-3.5 h-3.5 text-cyan-500" />
            <span>{isEn ? 'Total Recordings' : 'کل جلسات ضبط‌شده'}</span>
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums mt-1">{summary.totalCount}</div>
        </div>

        <div className={`border rounded-lg px-4 py-3 ${surface}`}>
          <div className={`text-[11px] flex items-center gap-1.5 ${mutedText}`}>
            <HardDrive className="w-3.5 h-3.5 text-sky-500" />
            <span>{isEn ? 'Archive Size' : 'حجم کل آرشیو'}</span>
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums mt-1">{formatBytes(summary.totalBytes)}</div>
        </div>

        <div className={`border rounded-lg px-4 py-3 ${surface}`}>
          <div className={`text-[11px] flex items-center gap-1.5 ${mutedText}`}>
            <Terminal className="w-3.5 h-3.5 text-emerald-500" />
            <span>{isEn ? 'SSH / RDP-VNC' : 'SSH / RDP-VNC'}</span>
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums mt-1">
            {summary.sshCount} <span className={`text-xs font-normal ${mutedText}`}>/</span>{' '}
            {(summary.rdpCount || 0) + (summary.vncCount || 0)}
          </div>
        </div>

        <div className={`border rounded-lg px-4 py-3 ${surface}`}>
          <div className={`text-[11px] flex items-center gap-1.5 ${mutedText}`}>
            <Lock className="w-3.5 h-3.5 text-amber-500" />
            <span>{isEn ? 'Legal Hold Locked' : 'قفل ضدحذف فعال'}</span>
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums mt-1">{summary.legalHoldCount}</div>
        </div>

        <div className={`border rounded-lg px-4 py-3 ${surface}`}>
          <div className={`text-[11px] flex items-center gap-1.5 ${mutedText}`}>
            <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
            <span>{isEn ? 'High-Risk Flagged' : 'دارای دستور پرخطر'}</span>
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums mt-1">{summary.highRiskCount}</div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`px-4 py-2 rounded-md border text-xs flex items-center gap-2 ${
            toast.type === 'success'
              ? isLightMode
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className={`border rounded-lg p-3 flex flex-wrap items-center gap-2.5 ${surface}`}>
        <div className="relative flex-1 min-w-[210px]">
          <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 ${isEn ? 'left-2.5' : 'right-2.5'} ${mutedText}`} />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder={
              isEn
                ? 'Search server, operator, IP, or SSH command...'
                : 'جستجوی سرور، کاربر، IP یا دستور SSH...'
            }
            className={`w-full py-1.5 text-xs rounded-md border outline-none ${
              isEn ? 'pl-8 pr-3' : 'pr-8 pl-3'
            } ${inputCls}`}
          />
        </div>

        <select
          value={protocolFilter}
          onChange={(e) => {
            setProtocolFilter(e.target.value);
            setPage(0);
          }}
          className={`px-2.5 py-1.5 text-xs rounded-md border outline-none ${inputCls}`}
        >
          <option value="all">{isEn ? 'All Protocols' : 'همه پروتکل‌ها'}</option>
          <option value="ssh">SSH</option>
          <option value="rdp">RDP</option>
          <option value="vnc">VNC</option>
        </select>

        <select
          value={legalHoldFilter}
          onChange={(e) => {
            setLegalHoldFilter(e.target.value);
            setPage(0);
          }}
          className={`px-2.5 py-1.5 text-xs rounded-md border outline-none ${inputCls}`}
        >
          <option value="all">{isEn ? 'All Retention' : 'همه وضعیت‌های قفل'}</option>
          <option value="true">{isEn ? 'Legal Hold Only' : 'فقط قفل ضدحذف'}</option>
          <option value="false">{isEn ? 'Unlocked Only' : 'بدون قفل'}</option>
        </select>

        <input
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            setPage(0);
          }}
          title={isEn ? 'From Date' : 'از تاریخ'}
          className={`px-2 py-1.5 text-xs font-mono rounded-md border outline-none ${inputCls}`}
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value);
            setPage(0);
          }}
          title={isEn ? 'To Date' : 'تا تاریخ'}
          className={`px-2 py-1.5 text-xs font-mono rounded-md border outline-none ${inputCls}`}
        />

        <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer select-none px-2">
          <input
            type="checkbox"
            checked={highRiskOnly}
            onChange={(e) => {
              setHighRiskOnly(e.target.checked);
              setPage(0);
            }}
            className="accent-rose-500 rounded"
          />
          <span>{isEn ? 'High-Risk' : 'پرخطر'}</span>
        </label>

        {serverFilter && (
          <button
            onClick={() => {
              setServerFilter('');
              setPage(0);
            }}
            className="px-2 py-1 text-[11px] font-mono rounded border border-cyan-500/40 text-cyan-500 flex items-center gap-1"
          >
            <span>{isEn ? 'Server filter active' : 'فیلتر سرور فعال'}</span>
            <X className="w-3 h-3" />
          </button>
        )}

        <div className="flex items-center gap-1.5 ms-auto">
          <button
            onClick={loadRecordings}
            className={`p-1.5 rounded-md border transition-colors ${
              isLightMode ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
            }`}
            title={isEn ? 'Refresh' : 'بروزرسانی'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {onNavigateToSettings && permissions.canManageSettings && (
            <button
              onClick={onNavigateToSettings}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md border flex items-center gap-1.5 transition-colors ${
                isLightMode
                  ? 'border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800'
                  : 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{isEn ? 'Recording Settings' : 'تنظیمات ضبط'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main High-Density Table */}
      <div className={`border rounded-lg overflow-hidden ${surface}`}>
        {loading && recordings.length === 0 ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-cyan-500" />
            <p className={`text-xs ${mutedText}`}>
              {isEn ? 'Loading recorded sessions...' : 'در حال بارگذاری جلسات ضبط‌شده...'}
            </p>
          </div>
        ) : error ? (
          <div className="p-10 text-center">
            <AlertTriangle className="w-7 h-7 text-amber-500 mx-auto mb-2" />
            <p className="text-xs font-medium mb-3">{error}</p>
            <button
              onClick={loadRecordings}
              className="px-3 py-1.5 text-xs rounded bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              {isEn ? 'Retry' : 'تلاش مجدد'}
            </button>
          </div>
        ) : recordings.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Video className={`w-8 h-8 mx-auto ${mutedText}`} />
            <p className="text-sm font-medium">
              {isEn ? 'No session recordings found' : 'هیچ جلسه ضبط‌شده‌ای یافت نشد'}
            </p>
            <p className={`text-xs max-w-md mx-auto ${mutedText}`}>
              {isEn
                ? 'Connect to any host in Remote Servers & Automation Fleet via SSH, RDP, or VNC to automatically capture and archive playback sessions here.'
                : 'با اتصال SSH، RDP یا VNC به هر سرور در بخش Remote Servers، جلسات به صورت خودکار و بدون ایجاد اختلال ضبط شده و در این بخش نمایش داده می‌شوند.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr
                  className={`border-b text-[11px] font-semibold uppercase tracking-wider ${
                    isLightMode ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-950/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <th className="py-2.5 px-3 text-start">{isEn ? 'Date & Time' : 'تاریخ و زمان'}</th>
                  <th className="py-2.5 px-3 text-start">{isEn ? 'Server' : 'سرور مقصد'}</th>
                  <th className="py-2.5 px-3 text-start">{isEn ? 'Operator' : 'کاربر'}</th>
                  <th className="py-2.5 px-3 text-start">{isEn ? 'Protocol' : 'پروتکل'}</th>
                  <th className="py-2.5 px-3 text-start">{isEn ? 'Duration & Size' : 'مدت و حجم'}</th>
                  <th className="py-2.5 px-3 text-start">{isEn ? 'Status' : 'وضعیت'}</th>
                  <th className="py-2.5 px-3 text-end">{isEn ? 'Actions' : 'عملیات'}</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLightMode ? 'divide-slate-200' : 'divide-slate-800/80'}`}>
                {recordings.map((rec) => {
                  const totalSize =
                    rec.fileSizeBytes || (rec.rawSizeBytes || 0) + (rec.videoSizeBytes || 0);
                  const isHighRisk = rec.maxRiskLevel === 'high' || rec.maxRiskLevel === 'critical';
                  const canPlayRow =
                    permissions.canPlayback &&
                    rec.status !== 'recording' &&
                    (rec.metadata?.playableCast || rec.metadata?.playableVideo || rec.metadata?.playableNativeGuac);

                  return (
                    <tr
                      key={rec.id}
                      className={`transition-colors ${
                        isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                        <div>{new Date(rec.startedAt).toLocaleDateString(isEn ? 'en-US' : 'fa-IR')}</div>
                        <div className={`text-[11px] ${mutedText}`}>
                          {new Date(rec.startedAt).toLocaleTimeString(isEn ? 'en-US' : 'fa-IR')}
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="font-medium truncate max-w-[180px]">{rec.serverName}</div>
                        <div className={`text-[11px] font-mono ${mutedText}`}>{rec.serverIp || '—'}</div>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="font-medium">{rec.username}</div>
                        <div className={`text-[11px] font-mono ${mutedText}`}>
                          {rec.clientIp || '—'}
                          {rec.metadata?.targetUsername ? ` · ${rec.metadata.targetUsername}` : ''}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {rec.protocol === 'ssh' ? (
                            <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Monitor className="w-3.5 h-3.5 text-sky-500" />
                          )}
                          <span className="font-mono uppercase font-medium">{rec.protocol}</span>
                          {isHighRisk && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] font-mono text-rose-500 uppercase"
                              title={isEn ? `Max risk: ${rec.maxRiskLevel}` : `سطح ریسک: ${rec.maxRiskLevel}`}
                            >
                              <ShieldAlert className="w-3 h-3" />
                              {rec.maxRiskLevel}
                            </span>
                          )}
                        </div>
                        {rec.protocol === 'ssh' && rec.commandCount > 0 && (
                          <div className={`text-[11px] font-mono tabular-nums ${mutedText}`}>
                            {rec.commandCount} {isEn ? 'cmds' : 'دستور'}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                        <div>{formatDurationSeconds(rec.durationSeconds)}</div>
                        <div className={`text-[11px] ${mutedText}`}>
                          {formatBytes(totalSize)}
                          {rec.encrypted ? ' · AES-256' : ''}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[11px] font-medium ${
                              rec.status === 'ready'
                                ? 'text-emerald-500'
                                : rec.status === 'transcoding' || rec.status === 'recording'
                                ? 'text-amber-500'
                                : 'text-rose-500'
                            }`}
                          >
                            {rec.status === 'ready'
                              ? isEn
                                ? 'Ready'
                                : 'آماده پخش'
                              : rec.status === 'transcoding'
                              ? isEn
                                ? 'Transcoding'
                                : 'در حال تبدیل'
                              : rec.status === 'recording'
                              ? isEn
                                ? 'Recording'
                                : 'در حال ضبط'
                              : isEn
                              ? 'Failed'
                              : 'ناموفق'}
                          </span>
                          {rec.legalHold && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] text-amber-500 font-medium"
                              title={rec.legalHoldReason || (isEn ? 'Legal Hold active' : 'قفل ضدحذف فعال')}
                            >
                              <Lock className="w-3 h-3" />
                              {isEn ? 'Hold' : 'قفل'}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {permissions.canPlayback && (
                            <button
                              onClick={() => handleOpenPlayer(rec)}
                              disabled={!canPlayRow}
                              className="px-2 py-1 text-[11px] font-medium rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white inline-flex items-center gap-1 transition-colors"
                              title={isEn ? 'Play Recording' : 'پخش جلسه'}
                            >
                              <Play className="w-3 h-3" />
                              <span>{isEn ? 'Play' : 'پخش'}</span>
                            </button>
                          )}

                          {permissions.canDownload && rec.status !== 'recording' && (
                            <>
                              <button
                                onClick={() => handleQuickDownload(rec, 'auto')}
                                className={`p-1.5 rounded border transition-colors ${
                                  isLightMode
                                    ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                                    : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                                }`}
                                title={
                                  rec.protocol === 'ssh'
                                    ? isEn
                                      ? 'Download .cast'
                                      : 'دانلود .cast'
                                    : isEn
                                    ? 'Download Video / Stream'
                                    : 'دانلود ویدیو / استریم'
                                }
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              {rec.protocol === 'ssh' && (
                                <button
                                  onClick={() => handleQuickDownload(rec, 'txt')}
                                  className={`p-1.5 rounded border transition-colors ${
                                    isLightMode
                                      ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                                      : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                                  }`}
                                  title={isEn ? 'Download Transcript (.txt)' : 'دانلود متن دستورات (.txt)'}
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}

                          {permissions.canLegalHold && (
                            <button
                              onClick={() => {
                                setLegalHoldTarget(rec);
                                setLegalHoldReason(rec.legalHoldReason || '');
                              }}
                              className={`p-1.5 rounded border transition-colors ${
                                rec.legalHold
                                  ? 'border-amber-500/50 text-amber-500 hover:bg-amber-500/10'
                                  : isLightMode
                                  ? 'border-slate-300 hover:bg-slate-100 text-slate-600'
                                  : 'border-slate-700 hover:bg-slate-800 text-slate-400'
                              }`}
                              title={
                                rec.legalHold
                                  ? isEn
                                    ? 'Release Legal Hold'
                                    : 'باز کردن قفل ضدحذف'
                                  : isEn
                                  ? 'Enable Legal Hold'
                                  : 'اعمال قفل ضدحذف'
                              }
                            >
                              {rec.legalHold ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                            </button>
                          )}

                          {permissions.canDelete && (
                            <button
                              onClick={() => !rec.legalHold && setDeleteTarget(rec)}
                              disabled={rec.legalHold}
                              className={`p-1.5 rounded border transition-colors ${
                                rec.legalHold
                                  ? 'opacity-30 cursor-not-allowed border-slate-700'
                                  : isLightMode
                                  ? 'border-slate-300 hover:bg-rose-50 hover:text-rose-600 text-slate-600'
                                  : 'border-slate-700 hover:bg-rose-950/50 hover:text-rose-400 text-slate-400'
                              }`}
                              title={
                                rec.legalHold
                                  ? isEn
                                    ? 'Protected by Legal Hold — release Legal Hold before deleting'
                                    : 'دارای قفل ضدحذف — ابتدا قفل را بردارید'
                                  : isEn
                                  ? 'Delete Permanently'
                                  : 'حذف دائمی'
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {total > pageSize && (
          <div className={`px-4 py-2.5 border-t flex items-center justify-between text-xs ${divider}`}>
            <span className={`font-mono tabular-nums ${mutedText}`}>
              {isEn
                ? `Showing ${page * pageSize + 1}–${Math.min(total, (page + 1) * pageSize)} of ${total}`
                : `نمایش ${page * pageSize + 1} تا ${Math.min(total, (page + 1) * pageSize)} از ${total}`}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className={`px-2.5 py-1 rounded border disabled:opacity-40 ${divider}`}
              >
                {isEn ? 'Previous' : 'قبلی'}
              </button>
              <span className="font-mono tabular-nums px-2">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className={`px-2.5 py-1 rounded border disabled:opacity-40 ${divider}`}
              >
                {isEn ? 'Next' : 'بعدی'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Session Player Modal */}
      {activePlayerRec && !isPlayerMinimized && (
        <SessionRecordingPlayerModal
          recording={activePlayerRec}
          isLightMode={isLightMode}
          canDownload={permissions.canDownload}
          onClose={() => {
            undockModal(`session-recording-player-${activePlayerRec.id}`);
            setActivePlayerRec(null);
            setIsPlayerMinimized(false);
          }}
          onMinimize={handleMinimizePlayer}
        />
      )}

      {/* Legal Hold Dialog (5-Rule Universal Modal) */}
      {legalHoldTarget &&
        createPortal(
          <div
            className={`fixed top-0 left-0 right-0 bottom-8 z-[9999] flex items-center justify-center ${
              legalHoldMaximized ? 'p-0' : 'p-4'
            } ${isLightMode ? 'bg-slate-900/45' : 'bg-black/75'}`}
            dir={isEn ? 'ltr' : 'rtl'}
          >
            <div
              className={`border shadow-2xl flex flex-col ${surface} ${
                legalHoldMaximized ? 'w-full h-full rounded-none' : 'w-full max-w-md rounded-lg'
              }`}
            >
              <div className={`px-4 py-3 border-b flex items-center justify-between ${divider}`}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Lock className="w-4 h-4 text-amber-500" />
                  <span>
                    {legalHoldTarget.legalHold
                      ? isEn
                        ? 'Release Legal Hold'
                        : 'برداشتن قفل ضدحذف'
                      : isEn
                      ? 'Enable Legal Hold'
                      : 'فعال‌سازی قفل ضدحذف (Legal Hold)'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const target = legalHoldTarget;
                      setLegalHoldTarget(null);
                      dockModal({
                        id: `legal-hold-${target.id}`,
                        labelEn: `Legal Hold: ${target.serverName}`,
                        labelFa: `قفل ضدحذف: ${target.serverName}`,
                        category: 'system',
                        onRestore: () => setLegalHoldTarget(target),
                      });
                    }}
                    className="p-1 rounded hover:bg-slate-500/15"
                    title={isEn ? 'Minimize' : 'کوچک کردن'}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setLegalHoldMaximized((v) => !v)}
                    className="p-1 rounded hover:bg-slate-500/15"
                    title={isEn ? 'Fullscreen' : 'تمام‌صفحه'}
                  >
                    {legalHoldMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setLegalHoldTarget(null)}
                    className="p-1 rounded hover:bg-rose-500/15 hover:text-rose-500"
                    title={isEn ? 'Close' : 'بستن'}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-3 text-xs flex-1">
                <p className={mutedText}>
                  {legalHoldTarget.legalHold
                    ? isEn
                      ? `Releasing Legal Hold on "${legalHoldTarget.serverName}" allows manual deletion and automated retention cleanup to apply again.`
                      : `با برداشتن قفل ضدحذف از جلسه «${legalHoldTarget.serverName}»، این فایل مجدداً مشمول سیاست حذف خودکار و امکان حذف دستی خواهد شد.`
                    : isEn
                    ? `Placing "${legalHoldTarget.serverName}" under Legal Hold prevents both manual deletion and automated retention/quota purge until explicitly released.`
                    : `با فعال‌سازی قفل ضدحذف، این پرونده در برابر حذف دستی و پاکسازی خودکار زمان/حجم به طور کامل محافظت خواهد شد.`}
                </p>

                {!legalHoldTarget.legalHold && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <label className="font-medium">
                        {isEn ? 'Case / Incident Reason (Required)' : 'علت / شماره پرونده (الزامی)'}
                      </label>
                      <FieldInfoTooltip
                        isEn={isEn}
                        isLightMode={isLightMode}
                        infoWhatEn="Mandatory audit justification recorded alongside the Legal Hold lock."
                        infoWhatFa="علت یا شماره تیکت حادثه امنیتی که در لاگ ممیزی ثبت می‌شود."
                        infoWhyEn="Ensures accountability so teams know why a recording is retained past normal expiry."
                        infoWhyFa="شفافیت تیم امنیتی برای نگهداری طولانی‌مدت پرونده‌های حساس را تضمین می‌کند."
                        infoExampleEn="INC-2026-0412: Unauthorized config modification investigation"
                        infoExampleFa="پرونده INC-404: بررسی تغییر غیرمجاز تنظیمات سرور"
                      />
                    </div>
                    <textarea
                      rows={3}
                      value={legalHoldReason}
                      onChange={(e) => setLegalHoldReason(e.target.value)}
                      placeholder={
                        isEn
                          ? 'e.g., Security incident #402 — preserve evidence pending audit review'
                          : 'مثلاً: پرونده حادثه امنیتی ۴۰۲ — نگهداری جهت بررسی ممیزی'
                      }
                      className={`w-full px-3 py-2 text-xs rounded-md border outline-none ${inputCls}`}
                    />
                  </div>
                )}
              </div>

              <div className={`px-4 py-3 border-t flex items-center justify-end gap-2 ${divider}`}>
                <button
                  onClick={() => setLegalHoldTarget(null)}
                  className={`px-3 py-1.5 text-xs rounded-md border ${divider}`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  onClick={handleConfirmLegalHold}
                  disabled={legalHoldBusy}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-md bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50"
                >
                  {legalHoldBusy
                    ? isEn
                      ? 'Saving...'
                      : 'در حال ثبت...'
                    : legalHoldTarget.legalHold
                    ? isEn
                      ? 'Release Hold'
                      : 'برداشتن قفل'
                    : isEn
                    ? 'Enable Legal Hold'
                    : 'اعمال قفل ضدحذف'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget &&
        createPortal(
          <div
            className={`fixed top-0 left-0 right-0 bottom-8 z-[9999] flex items-center justify-center p-4 ${
              isLightMode ? 'bg-slate-900/45' : 'bg-black/75'
            }`}
            dir={isEn ? 'ltr' : 'rtl'}
          >
            <div className={`w-full max-w-md border rounded-lg shadow-2xl ${surface}`}>
              <div className={`px-4 py-3 border-b flex items-center justify-between ${divider}`}>
                <div className="flex items-center gap-2 text-sm font-semibold text-rose-500">
                  <Trash2 className="w-4 h-4" />
                  <span>{isEn ? 'Delete Recording Permanently' : 'حذف دائمی ضبط جلسه'}</span>
                </div>
                <button onClick={() => setDeleteTarget(null)} className="p-1 rounded hover:bg-slate-500/15">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 text-xs space-y-2">
                <p>
                  {isEn
                    ? `Permanently delete the ${deleteTarget.protocol.toUpperCase()} recording of "${deleteTarget.username}" on "${deleteTarget.serverName}"?`
                    : `آیا از حذف دائمی ضبط ${deleteTarget.protocol.toUpperCase()} کاربر «${deleteTarget.username}» روی سرور «${deleteTarget.serverName}» اطمینان دارید؟`}
                </p>
                <p className={mutedText}>
                  {isEn
                    ? 'This removes both the database record and media files on disk and cannot be undone.'
                    : 'این عمل فایل‌های ذخیره‌شده روی دیسک و رکورد دیتابیس را پاک می‌کند و غیرقابل بازگشت است.'}
                </p>
              </div>
              <div className={`px-4 py-3 border-t flex items-center justify-end gap-2 ${divider}`}>
                <button
                  onClick={() => setDeleteTarget(null)}
                  className={`px-3 py-1.5 text-xs rounded-md border ${divider}`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleteBusy}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-md bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50"
                >
                  {deleteBusy
                    ? isEn
                      ? 'Deleting...'
                      : 'در حال حذف...'
                    : isEn
                    ? 'Delete Permanently'
                    : 'حذف دائمی'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
