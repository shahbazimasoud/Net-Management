import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  FileCode2,
  Download,
  Trash2,
  Edit3,
  Eye,
  MoreVertical,
  Send,
  Power,
  PowerOff,
  Calendar,
  Activity,
  X,
} from 'lucide-react';
import {
  SslCertificateItem,
  SslCertificatesSummary,
  AccessPolicy,
} from '../../types';
import {
  fetchSslCertificatesApi,
  deleteSslCertificateApi,
  updateSslCertificateApi,
  checkSslCertificateNowApi,
  checkAllSslCertificatesNowApi,
  testSslCertificateAlertApi,
} from '../../services/api';
import {
  isUserSuperAdmin,
  isSslCertificateAccessPermitted,
  isSslCertificateCreatePermitted,
  isSslCertificateEditPermitted,
  isSslCertificateDeletePermitted,
  isSslCertificateCheckPermitted,
} from '../../utils/rbac';
import { SslCertificateModal } from './SslCertificateModal';
import { SslCertificateDetailsModal } from './SslCertificateDetailsModal';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface SslCertificatesViewProps {
  isLightMode?: boolean;
  isEn?: boolean;
  effectivePolicy?: AccessPolicy;
  currentUser?: any;
}

export const SslCertificatesView: React.FC<SslCertificatesViewProps> = ({
  isLightMode = false,
  isEn = true,
  effectivePolicy,
  currentUser,
}) => {
  const [certificates, setCertificates] = useState<SslCertificateItem[]>([]);
  const [summary, setSummary] = useState<SslCertificatesSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [testingAlertId, setTestingAlertId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Modals
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingCert, setEditingCert] = useState<SslCertificateItem | null>(null);
  const [detailsCert, setDetailsCert] = useState<SslCertificateItem | null>(null);
  const [certToDelete, setCertToDelete] = useState<SslCertificateItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [envFilter, setEnvFilter] = useState<string>('all');

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Portal 3-dots Action Menu
  const [actionMenu, setActionMenu] = useState<{
    id: string;
    item: SslCertificateItem;
    top?: number;
    bottom?: number;
    left: number;
    maxHeight: number;
  } | null>(null);

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 5000);
  }, []);

  // Granular RBAC checks
  const isSuperAdmin = isUserSuperAdmin(currentUser, effectivePolicy);
  const canAdd = isSslCertificateCreatePermitted(effectivePolicy, isSuperAdmin);
  const canCheckGlobal = isSslCertificateCheckPermitted(null, effectivePolicy, isSuperAdmin);

  const loadCertificates = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      else setIsRefreshing(true);
      try {
        const res = await fetchSslCertificatesApi();
        setCertificates(res.certificates || []);
        setSummary(res.summary || null);
      } catch (err: any) {
        showToast(
          isEn
            ? `Failed to load SSL certificates: ${err?.message || 'Server error'}`
            : `خطا در دریافت لیست گواهینامه‌های SSL: ${err?.message || 'خطای سرور'}`,
          'error'
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [isEn, showToast]
  );

  useEffect(() => {
    loadCertificates(false);
  }, [loadCertificates]);

  // Close action menu on outside click / scroll
  useEffect(() => {
    if (!actionMenu) return;
    const close = () => setActionMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
    };
  }, [actionMenu]);

  // Client-side mirror of policy scoping (backend already enforces this authoritatively)
  const visibleCertificates = useMemo(() => {
    return certificates.filter((c) => isSslCertificateAccessPermitted(c.id, effectivePolicy, isSuperAdmin));
  }, [certificates, effectivePolicy, isSuperAdmin]);

  // Derived KPI counts over visible items
  const kpis = useMemo(() => {
    const counts = {
      total: visibleCertificates.length,
      valid: 0,
      expiring_soon: 0,
      critical: 0,
      expired: 0,
      check_failed: 0,
      inactive: 0,
      autoCheckEnabled: 0,
    };
    for (const c of visibleCertificates) {
      if (c.autoCheckEnabled !== false && c.isActive !== false) counts.autoCheckEnabled++;
      if (c.status in counts) {
        (counts as any)[c.status]++;
      }
    }
    return counts;
  }, [visibleCertificates]);

  // Filtered list
  const filteredCertificates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleCertificates.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (sourceFilter !== 'all' && c.sourceType !== sourceFilter) return false;
      if (envFilter !== 'all' && (c.environment || 'other') !== envFilter) return false;
      if (!q) return true;
      const haystack = [
        c.title,
        c.domain,
        c.subjectCN,
        c.issuerCN,
        c.issuerOrg,
        c.ownerName,
        c.ownerEmail,
        c.department,
        ...(c.sans || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [visibleCertificates, searchQuery, statusFilter, sourceFilter, envFilter]);

  const handleCheckSingle = async (cert: SslCertificateItem) => {
    setCheckingId(cert.id);
    setActionMenu(null);
    try {
      const res = await checkSslCertificateNowApi(cert.id);
      const updated = res.certificate;
      setCertificates((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      if (detailsCert?.id === updated.id) {
        setDetailsCert(updated);
      }
      if (updated.status === 'check_failed') {
        showToast(
          isEn
            ? `Check failed for ${updated.title}: ${updated.lastCheckError || 'TLS handshake error'}`
            : `خطا در بررسی ${updated.title}: ${updated.lastCheckError || 'خطای اتصال TLS'}`,
          'error'
        );
      } else {
        const daysLabel =
          typeof updated.daysRemaining === 'number'
            ? updated.daysRemaining <= 0
              ? isEn
                ? `Expired (${Math.abs(updated.daysRemaining)}d ago)`
                : `منقضی شده (${Math.abs(updated.daysRemaining)} روز پیش)`
              : isEn
                ? `${updated.daysRemaining} days remaining`
                : `${updated.daysRemaining} روز باقی‌مانده`
            : '';
        showToast(
          isEn
            ? `Checked "${updated.title}" — ${daysLabel}`
            : `گواهینامه «${updated.title}» بررسی شد — ${daysLabel}`,
          'success'
        );
      }
    } catch (err: any) {
      showToast(
        err?.message || (isEn ? 'SSL check failed.' : 'خطا در اجرای بررسی SSL.'),
        'error'
      );
    } finally {
      setCheckingId(null);
    }
  };

  const handleCheckAll = async () => {
    setIsCheckingAll(true);
    try {
      const res = await checkAllSslCertificatesNowApi();
      setCertificates(res.certificates || []);
      setSummary(res.summary || null);
      showToast(
        isEn
          ? `Bulk SSL check completed: ${res.checkedCount} checked, ${res.expiringOrExpired} expiring/expired, ${res.failedCount} failed.`
          : `بررسی گروهی SSL تکمیل شد: ${res.checkedCount} مورد بررسی شد، ${res.expiringOrExpired} مورد در آستانه یا منقضی، ${res.failedCount} خطا.`,
        res.failedCount > 0 ? 'info' : 'success'
      );
    } catch (err: any) {
      showToast(
        err?.message || (isEn ? 'Bulk SSL check failed.' : 'خطا در بررسی گروهی گواهینامه‌ها.'),
        'error'
      );
    } finally {
      setIsCheckingAll(false);
    }
  };

  const handleToggleActive = async (cert: SslCertificateItem) => {
    setTogglingId(cert.id);
    setActionMenu(null);
    try {
      const nextActive = cert.isActive === false;
      const res = await updateSslCertificateApi(cert.id, { isActive: nextActive });
      setCertificates((prev) => prev.map((c) => (c.id === res.certificate.id ? res.certificate : c)));
      showToast(
        isEn
          ? `Certificate "${cert.title}" ${nextActive ? 'activated' : 'paused'}.`
          : `پایش گواهینامه «${cert.title}» ${nextActive ? 'فعال' : 'متوقف'} شد.`,
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || (isEn ? 'Failed to update status.' : 'خطا در تغییر وضعیت.'), 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleSendTestAlert = async (cert: SslCertificateItem) => {
    setTestingAlertId(cert.id);
    setActionMenu(null);
    try {
      await testSslCertificateAlertApi(cert.id);
      showToast(
        isEn
          ? `Test SSL alert dispatched for "${cert.title}".`
          : `ایمیل هشدار آزمایشی برای «${cert.title}» با موفقیت ارسال شد.`,
        'success'
      );
    } catch (err: any) {
      showToast(
        err?.message ||
          (isEn
            ? 'Failed to send test alert email. Check SMTP settings.'
            : 'خطا در ارسال ایمیل هشدار. تنظیمات SMTP را بررسی کنید.'),
        'error'
      );
    } finally {
      setTestingAlertId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!certToDelete) return;
    setIsDeleting(true);
    try {
      await deleteSslCertificateApi(certToDelete.id);
      setCertificates((prev) => prev.filter((c) => c.id !== certToDelete.id));
      if (detailsCert?.id === certToDelete.id) setDetailsCert(null);
      showToast(
        isEn
          ? `Deleted SSL certificate "${certToDelete.title}".`
          : `گواهینامه SSL «${certToDelete.title}» حذف شد.`,
        'success'
      );
      setCertToDelete(null);
    } catch (err: any) {
      showToast(err?.message || (isEn ? 'Delete failed.' : 'خطا در حذف گواهینامه.'), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Title',
      'Source Type',
      'Domain',
      'Port',
      'Environment',
      'Status',
      'Days Remaining',
      'Valid From',
      'Valid To',
      'Subject CN',
      'Issuer',
      'TLS Protocol',
      'Key Algorithm',
      'Trusted',
      'Auto-Check Hours',
      'Owner',
      'Last Checked',
      'Last Error',
    ];
    const escape = (v: unknown) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };
    const rows = filteredCertificates.map((c) => [
      c.title,
      c.sourceType,
      c.domain || '',
      c.port || '',
      c.environment || '',
      c.status,
      c.daysRemaining ?? '',
      c.validFrom ? c.validFrom.slice(0, 10) : '',
      c.validTo ? c.validTo.slice(0, 10) : '',
      c.subjectCN || '',
      c.issuerOrg || c.issuerCN || '',
      c.tlsProtocol || '',
      c.keyAlgorithm ? `${c.keyAlgorithm} ${c.keySize || ''}`.trim() : '',
      c.selfSigned ? 'Self-Signed' : c.authorized === false ? 'Untrusted' : 'Trusted',
      c.autoCheckEnabled !== false ? c.checkIntervalHours || 24 : 'Disabled',
      c.ownerName || '',
      c.lastCheckedAt || '',
      c.lastCheckError || '',
    ]);

    const csv = '\uFEFF' + [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ssl-certificates-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const openActionMenu = (e: React.MouseEvent<HTMLButtonElement>, cert: SslCertificateItem) => {
    e.stopPropagation();
    if (actionMenu?.id === cert.id) {
      setActionMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bottomMargin = 44; // Rule 7: stay above footer
    const topMargin = 12;
    const estimatedHeight = 250;

    const spaceBelow = vh - rect.bottom - bottomMargin;
    const spaceAbove = rect.top - topMargin;

    let top: number | undefined;
    let bottom: number | undefined;
    let maxHeight: number;
    if (spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove) {
      top = rect.bottom + 6;
      maxHeight = Math.max(150, vh - top - bottomMargin);
    } else {
      bottom = vh - rect.top + 6;
      maxHeight = Math.max(150, rect.top - topMargin - 6);
    }

    const left = !isEn
      ? Math.max(12, Math.min(rect.left, vw - menuWidth - 12))
      : Math.max(12, Math.min(rect.right - menuWidth, vw - menuWidth - 12));

    setActionMenu({ id: cert.id, item: cert, top, bottom, left, maxHeight });
  };

  const formatShortDate = (iso?: string) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleDateString(isEn ? 'en-US' : 'fa-IR', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      });
    } catch {
      return iso.slice(0, 10);
    }
  };

  const formatRelativeTime = (iso?: string) => {
    if (!iso) return isEn ? 'Never' : 'بررسی نشده';
    const diffMs = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(diffMs)) return iso;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return isEn ? 'Just now' : 'هم‌اکنون';
    if (mins < 60) return isEn ? `${mins}m ago` : `${mins} دقیقه پیش`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return isEn ? `${hrs}h ago` : `${hrs} ساعت پیش`;
    const days = Math.floor(hrs / 24);
    return isEn ? `${days}d ago` : `${days} روز پیش`;
  };

  const renderDaysCountdown = (cert: SslCertificateItem) => {
    if (cert.status === 'inactive') {
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
            isLightMode
              ? 'bg-slate-100 border-slate-300 text-slate-600'
              : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}
        >
          <PowerOff className="w-3 h-3" />
          {isEn ? 'Paused' : 'غیرفعال'}
        </span>
      );
    }

    if (cert.status === 'check_failed') {
      return (
        <div className="space-y-1">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
              isLightMode
                ? 'bg-red-50 border-red-300 text-red-700'
                : 'bg-red-500/15 border-red-500/40 text-red-300'
            }`}
          >
            <XCircle className="w-3 h-3" />
            {isEn ? 'Check Failed' : 'خطای بررسی'}
          </span>
          {cert.lastCheckError && (
            <div className="text-[10px] font-mono text-rose-400 truncate max-w-[180px]" dir="ltr" title={cert.lastCheckError}>
              {cert.lastCheckError}
            </div>
          )}
        </div>
      );
    }

    const days = cert.daysRemaining;
    if (typeof days !== 'number') {
      return <span className="text-xs opacity-60">—</span>;
    }

    const isExpired = days <= 0;
    const isCritical = days > 0 && days <= 7;
    const isWarning = days > 7 && days <= 30;

    const pillClass = isExpired
      ? 'bg-rose-600 text-white border-rose-500'
      : isCritical
        ? isLightMode
          ? 'bg-rose-100 text-rose-800 border-rose-300'
          : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
        : isWarning
          ? isLightMode
            ? 'bg-amber-100 text-amber-800 border-amber-300'
            : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
          : isLightMode
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';

    const barColor = isExpired
      ? 'bg-rose-600'
      : isCritical
        ? 'bg-rose-500'
        : isWarning
          ? 'bg-amber-500'
          : 'bg-emerald-500';

    // Cap bar at 90 days (standard Let's Encrypt / modern cert window)
    const pct = isExpired ? 100 : Math.min(100, Math.max(6, Math.round((days / 90) * 100)));

    return (
      <div className="space-y-1.5 min-w-[130px]">
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${pillClass}`}>
          {isExpired ? (
            <XCircle className="w-3 h-3" />
          ) : isCritical || isWarning ? (
            <AlertTriangle className="w-3 h-3" />
          ) : (
            <CheckCircle2 className="w-3 h-3" />
          )}
          {isExpired
            ? isEn
              ? `Expired ${Math.abs(days)}d ago`
              : `${Math.abs(days)} روز منقضی`
            : isEn
              ? `${days} days left`
              : `${days} روز مانده`}
        </span>
        <div
          className={`h-1.5 w-full rounded-full overflow-hidden ${
            isLightMode ? 'bg-slate-200' : 'bg-slate-800'
          }`}
        >
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  const envLabel = (env?: string) => {
    switch (env) {
      case 'production':
        return isEn ? 'Production' : 'عملیاتی';
      case 'staging':
        return isEn ? 'Staging' : 'آزمایشی';
      case 'internal':
        return isEn ? 'Internal' : 'داخلی';
      case 'edge':
        return isEn ? 'Edge / WAF' : 'لبه / WAF';
      default:
        return isEn ? 'Other' : 'سایر';
    }
  };

  return (
    <div
      dir={isEn ? 'ltr' : 'rtl'}
      className={`p-4 md:p-6 space-y-5 min-h-full ${
        isLightMode ? 'text-slate-900' : 'text-slate-100'
      }`}
    >
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 z-[99999] ${isEn ? 'right-5' : 'left-5'} max-w-md px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-2.5 text-xs font-semibold ${
            toast.type === 'success'
              ? isLightMode
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200'
              : toast.type === 'error'
                ? isLightMode
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-rose-950/95 border-rose-500/50 text-rose-200'
                : isLightMode
                  ? 'bg-cyan-50 border-cyan-300 text-cyan-900'
                  : 'bg-slate-900/95 border-cyan-500/50 text-cyan-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : toast.type === 'error' ? (
            <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
          ) : (
            <Activity className="w-4 h-4 text-cyan-500 shrink-0" />
          )}
          <span className="flex-1">{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="opacity-60 hover:opacity-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header & Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
              isLightMode
                ? 'bg-cyan-50 border-cyan-200 text-cyan-700'
                : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
            }`}
          >
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg md:text-xl font-extrabold tracking-tight">
                {isEn ? 'SSL / TLS Certificates & Expiry Monitor' : 'پایش و مدیریت گواهینامه‌های SSL / TLS'}
              </h1>
              <FieldInfoTooltip
                title={isEn ? 'SSL / TLS Expiry Monitor' : 'پایشگر گواهینامه‌های SSL / TLS'}
                whatIsIt={
                  isEn
                    ? 'Centralized lifecycle tracker for live domain HTTPS/TLS endpoints and uploaded public X.509 PEM certificates.'
                    : 'سامانه متمرکز پایش چرخه عمر و انقضای گواهینامه‌های SSL دامنه‌های زنده و گواهینامه‌های دستی PEM.'
                }
                whyNeeded={
                  isEn
                    ? 'Automatically inspects remaining validity daily, detects expired or untrusted chains, and alerts teams before service outages.'
                    : 'به‌صورت خودکار و روزانه زمان باقی‌مانده گواهینامه‌ها را بررسی کرده و پیش از انقضا یا خطای زنجیره اعتماد هشدار می‌دهد.'
                }
                practicalExample={
                  isEn
                    ? 'Add production domains (e.g., api.company.com:443) or click "Check All Now" to verify the entire fleet at once.'
                    : 'دامنه‌های عملیاتی را اضافه کنید یا با دکمه «بررسی همه» کل لیست گواهینامه‌ها را همزمان استعلام بگیرید.'
                }
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>
            <div className={`flex flex-wrap items-center gap-3 mt-1 text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {isEn
                  ? `Daily Auto-Check Active (${kpis.autoCheckEnabled} monitored)`
                  : `پایش خودکار روزانه فعال (${kpis.autoCheckEnabled} مورد تحت پایش)`}
              </span>
              {summary?.lastGlobalCheckAt && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {isEn ? 'Last check:' : 'آخرین بررسی:'} {formatRelativeTime(summary.lastGlobalCheckAt)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Primary Toolbar Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {canCheckGlobal && (
            <button
              type="button"
              onClick={handleCheckAll}
              disabled={isCheckingAll || visibleCertificates.length === 0}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer disabled:opacity-50 ${
                isLightMode
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingAll ? 'animate-spin' : ''}`} />
              {isCheckingAll
                ? isEn
                  ? 'Checking All...'
                  : 'در حال بررسی همه...'
                : isEn
                  ? 'Check All Now'
                  : 'بررسی همه گواهینامه‌ها'}
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredCertificates.length === 0}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-40 ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            {isEn ? 'Export CSV' : 'خروجی CSV'}
          </button>

          <button
            type="button"
            onClick={() => loadCertificates(true)}
            disabled={isRefreshing}
            title={isEn ? 'Refresh list' : 'بازخوانی لیست'}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {canAdd && (
            <button
              type="button"
              onClick={() => {
                setEditingCert(null);
                setIsAddEditOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {isEn ? 'Add SSL / Domain' : 'افزودن SSL / دامنه'}
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards (clickable filters) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            key: 'all',
            labelEn: 'Total Tracked',
            labelFa: 'کل گواهینامه‌ها',
            value: kpis.total,
            color: 'cyan',
            icon: Lock,
          },
          {
            key: 'valid',
            labelEn: 'Healthy (>30d)',
            labelFa: 'سالم (بیش از ۳۰ روز)',
            value: kpis.valid,
            color: 'emerald',
            icon: CheckCircle2,
          },
          {
            key: 'expiring_soon',
            labelEn: 'Expiring (≤30d)',
            labelFa: 'نزدیک انقضا (≤۳۰ روز)',
            value: kpis.expiring_soon,
            color: 'amber',
            icon: AlertTriangle,
          },
          {
            key: 'critical',
            labelEn: 'Critical (≤7d)',
            labelFa: 'بحرانی (≤۷ روز)',
            value: kpis.critical,
            color: 'rose',
            icon: ShieldAlert,
          },
          {
            key: 'expired',
            labelEn: 'Expired',
            labelFa: 'منقضی شده',
            value: kpis.expired,
            color: 'red',
            icon: XCircle,
          },
          {
            key: 'check_failed',
            labelEn: 'Check Failed',
            labelFa: 'خطای اتصال',
            value: kpis.check_failed,
            color: 'orange',
            icon: Activity,
          },
        ].map((card) => {
          const Icon = card.icon;
          const active = statusFilter === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setStatusFilter(active && card.key !== 'all' ? 'all' : card.key)}
              className={`p-3.5 rounded-2xl border text-start transition-all cursor-pointer ${
                active
                  ? isLightMode
                    ? 'bg-cyan-50 border-cyan-500 ring-2 ring-cyan-500/20'
                    : 'bg-cyan-500/15 border-cyan-500/60 ring-2 ring-cyan-500/20'
                  : isLightMode
                    ? 'bg-white border-slate-200 hover:border-slate-300'
                    : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[11px] font-semibold ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isEn ? card.labelEn : card.labelFa}
                </span>
                <Icon
                  className={`w-4 h-4 ${
                    card.color === 'emerald'
                      ? 'text-emerald-500'
                      : card.color === 'amber'
                        ? 'text-amber-500'
                        : card.color === 'rose' || card.color === 'red'
                          ? 'text-rose-500'
                          : card.color === 'orange'
                            ? 'text-orange-500'
                            : 'text-cyan-500'
                  }`}
                />
              </div>
              <div className="text-2xl font-extrabold">{card.value}</div>
            </button>
          );
        })}
      </div>

      {/* Filter & Search Toolbar */}
      <div
        className={`p-3.5 rounded-2xl border flex flex-col md:flex-row items-stretch md:items-center gap-3 ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-slate-800'
        }`}
      >
        <div className="relative flex-1">
          <Search
            className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 ${
              isEn ? 'left-3' : 'right-3'
            } ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isEn
                ? 'Search by title, domain, Common Name, Issuer CA, SAN, or owner...'
                : 'جستجو بر اساس عنوان، دامنه، نام گواهینامه (CN)، صادرکننده، SAN یا مسئول...'
            }
            className={`w-full py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
              isEn ? 'pl-9 pr-3' : 'pr-9 pl-3'
            } ${
              isLightMode
                ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                : 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500'
            }`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className={`px-3 py-2 rounded-xl border text-xs font-medium ${
              isLightMode
                ? 'bg-slate-50 border-slate-200 text-slate-700'
                : 'bg-slate-950 border-slate-800 text-slate-200'
            }`}
          >
            <option value="all">{isEn ? 'All Sources' : 'همه منابع'}</option>
            <option value="domain">{isEn ? 'Live Domain (TLS)' : 'دامنه زنده (TLS)'}</option>
            <option value="manual_pem">{isEn ? 'Manual / PEM' : 'دستی / فایل PEM'}</option>
          </select>

          <select
            value={envFilter}
            onChange={(e) => setEnvFilter(e.target.value)}
            className={`px-3 py-2 rounded-xl border text-xs font-medium ${
              isLightMode
                ? 'bg-slate-50 border-slate-200 text-slate-700'
                : 'bg-slate-950 border-slate-800 text-slate-200'
            }`}
          >
            <option value="all">{isEn ? 'All Environments' : 'همه محیط‌ها'}</option>
            <option value="production">{isEn ? 'Production' : 'عملیاتی'}</option>
            <option value="staging">{isEn ? 'Staging' : 'آزمایشی'}</option>
            <option value="internal">{isEn ? 'Internal' : 'داخلی'}</option>
            <option value="edge">{isEn ? 'Edge / WAF' : 'لبه / WAF'}</option>
            <option value="other">{isEn ? 'Other' : 'سایر'}</option>
          </select>

          {(statusFilter !== 'all' || sourceFilter !== 'all' || envFilter !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setSourceFilter('all');
                setEnvFilter('all');
                setSearchQuery('');
              }}
              className="px-2.5 py-2 rounded-xl text-xs font-semibold text-cyan-500 hover:bg-cyan-500/10 cursor-pointer"
            >
              {isEn ? 'Reset' : 'پاک کردن فیلترها'}
            </button>
          )}
        </div>
      </div>

      {/* Main Content Table */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-slate-800'
        }`}
      >
        {isLoading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="w-7 h-7 animate-spin text-cyan-500 mx-auto" />
            <p className="text-xs opacity-70">
              {isEn ? 'Loading SSL / TLS certificates...' : 'در حال بارگذاری گواهینامه‌های SSL / TLS...'}
            </p>
          </div>
        ) : filteredCertificates.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div
              className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center ${
                isLightMode ? 'bg-slate-100 text-slate-400' : 'bg-slate-800 text-slate-500'
              }`}
            >
              <Lock className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold">
              {visibleCertificates.length === 0
                ? isEn
                  ? 'No SSL Certificates Registered Yet'
                  : 'هنوز هیچ گواهینامه SSL یا دامنه‌ای ثبت نشده است'
                : isEn
                  ? 'No Certificates Match Your Filter'
                  : 'هیچ گواهینامه‌ای با فیلتر انتخابی مطابقت ندارد'}
            </h3>
            <p className={`text-xs max-w-md mx-auto ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {visibleCertificates.length === 0
                ? isEn
                  ? 'Add a live domain (e.g. api.company.com) or upload a public PEM certificate to start daily automated expiration monitoring and alerting.'
                  : 'یک دامنه زنده (مانند api.company.ir) معرفی کنید یا فایل گواهینامه عمومی PEM را بارگذاری کنید تا پایش خودکار روزانه انقضا آغاز شود.'
                : isEn
                  ? 'Try adjusting or clearing your search and status filters.'
                  : 'جستجو یا فیلترهای وضعیت را تغییر دهید تا موارد نمایش داده شوند.'}
            </p>
            {visibleCertificates.length === 0 && canAdd && (
              <button
                type="button"
                onClick={() => {
                  setEditingCert(null);
                  setIsAddEditOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {isEn ? 'Add First Domain or SSL Certificate' : 'افزودن اولین دامنه یا گواهینامه SSL'}
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr
                  className={`border-b text-[11px] uppercase tracking-wider ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-500'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <th className="py-3 px-4 text-start font-bold">
                    {isEn ? 'Certificate / Target' : 'گواهینامه / دامنه هدف'}
                  </th>
                  <th className="py-3 px-4 text-start font-bold">
                    {isEn ? 'Expiry & Countdown' : 'وضعیت و زمان باقی‌مانده'}
                  </th>
                  <th className="py-3 px-4 text-start font-bold">
                    {isEn ? 'Issuer & Valid Until' : 'صادرکننده و تاریخ انقضا'}
                  </th>
                  <th className="py-3 px-4 text-start font-bold">
                    {isEn ? 'TLS / Crypto & Trust' : 'پروتکل و زنجیره اعتماد'}
                  </th>
                  <th className="py-3 px-4 text-start font-bold">
                    {isEn ? 'Schedule & Last Check' : 'پایش خودکار و آخرین بررسی'}
                  </th>
                  <th className="py-3 px-4 text-end font-bold">
                    {isEn ? 'Actions' : 'عملیات'}
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                {filteredCertificates.map((cert) => {
                  const canCheckItem = isSslCertificateCheckPermitted(cert.id, effectivePolicy, isSuperAdmin);
                  const isRowChecking = checkingId === cert.id;
                  return (
                    <tr
                      key={cert.id}
                      className={`transition-colors ${
                        isLightMode ? 'hover:bg-slate-50/90' : 'hover:bg-slate-800/40'
                      } ${cert.isActive === false ? 'opacity-65' : ''}`}
                    >
                      {/* Certificate / Target */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-start gap-2.5 min-w-[200px]">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${
                              cert.sourceType === 'domain'
                                ? isLightMode
                                  ? 'bg-cyan-50 border-cyan-200 text-cyan-600'
                                  : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                                : isLightMode
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                                  : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                            }`}
                          >
                            {cert.sourceType === 'domain' ? (
                              <Globe className="w-4 h-4" />
                            ) : (
                              <FileCode2 className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => setDetailsCert(cert)}
                              className="font-bold text-xs hover:text-cyan-500 transition-colors text-start block truncate max-w-[240px] cursor-pointer"
                            >
                              {cert.title}
                            </button>
                            <div
                              className={`text-[11px] font-mono truncate max-w-[240px] ${
                                isLightMode ? 'text-slate-500' : 'text-slate-400'
                              }`}
                              dir="ltr"
                            >
                              {cert.sourceType === 'domain'
                                ? `${cert.domain || '—'}:${cert.port || 443}`
                                : cert.subjectCN || cert.domain || (isEn ? 'Manual PEM' : 'فایل PEM دستی')}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  isLightMode
                                    ? 'bg-slate-100 text-slate-600'
                                    : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                {envLabel(cert.environment)}
                              </span>
                              {cert.sans && cert.sans.length > 1 && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                    isLightMode
                                      ? 'bg-cyan-50 text-cyan-700'
                                      : 'bg-cyan-500/10 text-cyan-300'
                                  }`}
                                >
                                  +{cert.sans.length} SANs
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Expiry & Countdown */}
                      <td className="py-3.5 px-4">{renderDaysCountdown(cert)}</td>

                      {/* Issuer & Valid Until */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold truncate max-w-[180px]" title={cert.issuerOrg || cert.issuerCN}>
                          {cert.issuerOrg || cert.issuerCN || '—'}
                        </div>
                        <div
                          className={`text-[11px] flex items-center gap-1 mt-0.5 ${
                            isLightMode ? 'text-slate-500' : 'text-slate-400'
                          }`}
                        >
                          <Calendar className="w-3 h-3 shrink-0" />
                          <span>{formatShortDate(cert.validTo)}</span>
                        </div>
                      </td>

                      {/* TLS / Crypto & Trust */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-[11px] font-semibold" dir="ltr">
                          {cert.tlsProtocol || (cert.sourceType === 'manual_pem' ? 'X.509 PEM' : '—')}
                          {cert.keyAlgorithm ? ` • ${cert.keyAlgorithm.toUpperCase()}${cert.keySize ? ` ${cert.keySize}` : ''}` : ''}
                        </div>
                        <div className="mt-1">
                          {cert.selfSigned ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-500">
                              <AlertTriangle className="w-3 h-3" />
                              {isEn ? 'Self-Signed' : 'خودامضا'}
                            </span>
                          ) : cert.authorized === false ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-500">
                              <ShieldAlert className="w-3 h-3" />
                              {isEn ? 'Untrusted' : 'نامعتبر'}
                            </span>
                          ) : cert.validTo ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-500">
                              <ShieldCheck className="w-3 h-3" />
                              {isEn ? 'Trusted CA' : 'CA معتبر'}
                            </span>
                          ) : (
                            <span className="text-[10px] opacity-50">—</span>
                          )}
                        </div>
                      </td>

                      {/* Schedule & Last Check */}
                      <td className="py-3.5 px-4">
                        <div className="text-[11px] font-semibold">
                          {cert.autoCheckEnabled !== false
                            ? isEn
                              ? `Every ${cert.checkIntervalHours || 24}h`
                              : `هر ${cert.checkIntervalHours || 24} ساعت`
                            : isEn
                              ? 'Manual only'
                              : 'فقط دستی'}
                        </div>
                        <div className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {formatRelativeTime(cert.lastCheckedAt)}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setDetailsCert(cert)}
                            title={isEn ? 'Inspect Certificate Details' : 'مشاهده جزئیات کامل گواهینامه'}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              isLightMode
                                ? 'text-slate-500 hover:bg-slate-100 hover:text-cyan-700'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-cyan-400'
                            }`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {canCheckItem && (
                            <button
                              type="button"
                              onClick={() => handleCheckSingle(cert)}
                              disabled={isRowChecking}
                              title={isEn ? 'Run Live Check Now' : 'بررسی زنده اکنون'}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 ${
                                isLightMode
                                  ? 'text-slate-500 hover:bg-emerald-50 hover:text-emerald-700'
                                  : 'text-slate-400 hover:bg-emerald-500/15 hover:text-emerald-400'
                              }`}
                            >
                              <RefreshCw className={`w-4 h-4 ${isRowChecking ? 'animate-spin text-cyan-500' : ''}`} />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => openActionMenu(e, cert)}
                            title={isEn ? 'More Actions' : 'سایر عملیات'}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              isLightMode
                                ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                            }`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Portal 3-Dots Context Menu (Rule 7 footer clearance) */}
      {actionMenu &&
        createPortal(
          <div
            dir={isEn ? 'ltr' : 'rtl'}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: actionMenu.top,
              bottom: actionMenu.bottom,
              left: actionMenu.left,
              width: 220,
              maxHeight: actionMenu.maxHeight,
            }}
            className={`z-[99995] rounded-xl border shadow-2xl overflow-y-auto py-1.5 text-xs ${
              isLightMode
                ? 'bg-white border-slate-200 text-slate-800'
                : 'bg-slate-900 border-slate-700 text-slate-200'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setDetailsCert(actionMenu.item);
                setActionMenu(null);
              }}
              className={`w-full px-3.5 py-2 flex items-center gap-2.5 text-start transition-colors cursor-pointer ${
                isLightMode ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-cyan-500" />
              <span>{isEn ? 'Inspect Full X.509 Details' : 'مشاهده جزئیات و زنجیره X.509'}</span>
            </button>

            {isSslCertificateCheckPermitted(actionMenu.item.id, effectivePolicy, isSuperAdmin) && (
              <button
                type="button"
                onClick={() => handleCheckSingle(actionMenu.item)}
                className={`w-full px-3.5 py-2 flex items-center gap-2.5 text-start transition-colors cursor-pointer ${
                  isLightMode ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
                <span>{isEn ? 'Run Live TLS Check' : 'اجرای بررسی زنده TLS'}</span>
              </button>
            )}

            {isSslCertificateEditPermitted(actionMenu.item.id, effectivePolicy, isSuperAdmin) && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditingCert(actionMenu.item);
                    setIsAddEditOpen(true);
                    setActionMenu(null);
                  }}
                  className={`w-full px-3.5 py-2 flex items-center gap-2.5 text-start transition-colors cursor-pointer ${
                    isLightMode ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{isEn ? 'Edit Settings & Schedule' : 'ویرایش تنظیمات و زمان‌بندی'}</span>
                </button>

                <button
                  type="button"
                  disabled={testingAlertId === actionMenu.item.id}
                  onClick={() => handleSendTestAlert(actionMenu.item)}
                  className={`w-full px-3.5 py-2 flex items-center gap-2.5 text-start transition-colors cursor-pointer ${
                    isLightMode ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                  }`}
                >
                  <Send className="w-3.5 h-3.5 text-amber-500" />
                  <span>{isEn ? 'Send Test Expiry Alert' : 'ارسال ایمیل هشدار آزمایشی'}</span>
                </button>

                <button
                  type="button"
                  disabled={togglingId === actionMenu.item.id}
                  onClick={() => handleToggleActive(actionMenu.item)}
                  className={`w-full px-3.5 py-2 flex items-center gap-2.5 text-start transition-colors cursor-pointer ${
                    isLightMode ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                  }`}
                >
                  {actionMenu.item.isActive === false ? (
                    <>
                      <Power className="w-3.5 h-3.5 text-emerald-500" />
                      <span>{isEn ? 'Resume Monitoring' : 'فعال‌سازی مجدد پایش'}</span>
                    </>
                  ) : (
                    <>
                      <PowerOff className="w-3.5 h-3.5 text-slate-400" />
                      <span>{isEn ? 'Pause Monitoring' : 'توقف موقت پایش'}</span>
                    </>
                  )}
                </button>
              </>
            )}

            {isSslCertificateDeletePermitted(actionMenu.item.id, effectivePolicy, isSuperAdmin) && (
              <>
                <div className={`my-1 border-t ${isLightMode ? 'border-slate-200' : 'border-slate-800'}`} />
                <button
                  type="button"
                  onClick={() => {
                    setCertToDelete(actionMenu.item);
                    setActionMenu(null);
                  }}
                  className={`w-full px-3.5 py-2 flex items-center gap-2.5 text-start text-rose-500 transition-colors cursor-pointer ${
                    isLightMode ? 'hover:bg-rose-50' : 'hover:bg-rose-500/10'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Delete Certificate' : 'حذف گواهینامه'}</span>
                </button>
              </>
            )}
          </div>,
          document.body
        )}

      {/* Add / Edit Modal */}
      <SslCertificateModal
        isOpen={isAddEditOpen}
        onClose={() => setIsAddEditOpen(false)}
        editingCert={editingCert}
        isLightMode={isLightMode}
        isEn={isEn}
        onSaved={(saved) => {
          setCertificates((prev) => {
            const exists = prev.some((c) => c.id === saved.id);
            return exists ? prev.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...prev];
          });
          showToast(
            editingCert
              ? isEn
                ? `Updated "${saved.title}" successfully.`
                : `تغییرات گواهینامه «${saved.title}» ذخیره شد.`
              : isEn
                ? `Added "${saved.title}" to SSL monitor.`
                : `گواهینامه «${saved.title}» به پایشگر SSL اضافه شد.`,
            'success'
          );
        }}
      />

      {/* Details Inspector Modal */}
      <SslCertificateDetailsModal
        certificate={detailsCert}
        onClose={() => setDetailsCert(null)}
        onCheckNow={handleCheckSingle}
        isChecking={detailsCert ? checkingId === detailsCert.id : false}
        canCheck={
          detailsCert
            ? isSslCertificateCheckPermitted(detailsCert.id, effectivePolicy, isSuperAdmin)
            : false
        }
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* Delete Confirmation Modal (No window.confirm, Rule 7 bottom-8 clearance) */}
      {certToDelete &&
        createPortal(
          <div
            dir={isEn ? 'ltr' : 'rtl'}
            className="fixed top-0 left-0 right-0 bottom-8 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isDeleting) setCertToDelete(null);
            }}
          >
            <div
              className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-900'
                  : 'bg-slate-950 border-slate-800 text-slate-100'
              }`}
            >
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">
                      {isEn ? 'Delete SSL Certificate Monitor?' : 'حذف گواهینامه SSL از پایشگر؟'}
                    </h3>
                    <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'This action is logged in Audit Logs and cannot be undone.' : 'این عملیات در لاگ ممیزی ثبت شده و غیرقابل بازگشت است.'}
                    </p>
                  </div>
                </div>
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="font-bold">{certToDelete.title}</div>
                  {certToDelete.domain && (
                    <div className="font-mono text-[11px] opacity-75 mt-0.5" dir="ltr">
                      {certToDelete.domain}:{certToDelete.port || 443}
                    </div>
                  )}
                </div>
              </div>
              <div
                className={`px-5 py-3 border-t flex items-center justify-end gap-2 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
                }`}
              >
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setCertToDelete(null)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white cursor-pointer"
                >
                  {isDeleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {isEn ? 'Confirm Delete' : 'تایید و حذف'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
