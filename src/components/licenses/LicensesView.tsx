import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Download,
  Trash2,
  Edit3,
  Mail,
  Send,
  Paperclip,
  Server,
  ShieldCheck,
  Building2,
  Calendar,
  Copy,
  ExternalLink,
  ChevronDown,
  BellRing,
  Sparkles,
  Info,
  RotateCw,
  History,
  Eye,
  MoreVertical,
  Power,
  PowerOff
} from 'lucide-react';
import {
  LicenseItem,
  LicenseDeviceType,
  LicenseStatus,
  Device,
  AccessPolicy,
  AttachmentFile
} from '../../types';
import {
  fetchLicensesApi,
  deleteLicenseApi,
  updateLicenseApi,
  testLicenseContractAlertApi,
  runLicenseContractCronNowApi
} from '../../services/api';
import { LicenseModal } from './LicenseModal';
import { RenewalHistoryModal } from './RenewalHistoryModal';
import { ItemAttachmentsModal } from './ItemAttachmentsModal';
import { AlertRecipientsModal } from './AlertRecipientsModal';
import { AttachmentPreviewModal } from './AttachmentPreviewModal';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { appDataCache } from '../../services/dataCache';

interface LicensesViewProps {
  devices: Device[];
  isLightMode?: boolean;
  isEn?: boolean;
  effectivePolicy?: AccessPolicy;
  onOpenTerminal?: (device: Device) => void;
}

export const LicensesView: React.FC<LicensesViewProps> = ({
  devices,
  isLightMode = false,
  isEn = true,
  effectivePolicy,
}) => {
  const cachedLicenses = appDataCache.getOptimistic<LicenseItem[]>('licenses_list');
  const [licenses, setLicenses] = useState<LicenseItem[]>(() => cachedLicenses || []);
  const [isLoading, setIsLoading] = useState(() => !cachedLicenses);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRunningCron, setIsRunningCron] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'renew'>('create');
  const [editingLicense, setEditingLicense] = useState<LicenseItem | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyLicense, setHistoryLicense] = useState<LicenseItem | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [testingLicenseId, setTestingLicenseId] = useState<string | null>(null);

  // Modals for Alerts & Files
  const [attachmentsModalItem, setAttachmentsModalItem] = useState<{
    title: string;
    attachments: AttachmentFile[];
  } | null>(null);
  const [isAttachmentsModalOpen, setIsAttachmentsModalOpen] = useState(false);

  const [alertModalItem, setAlertModalItem] = useState<LicenseItem | null>(null);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);

  const [previewFile, setPreviewFile] = useState<AttachmentFile | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Deactivate Confirmation Modal
  const [deactivatingLicense, setDeactivatingLicense] = useState<LicenseItem | null>(null);
  const [isDeactivatingLoading, setIsDeactivatingLoading] = useState(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // 3-Dots Action Menu state
  const [actionMenuAnchor, setActionMenuAnchor] = useState<{
    id: string;
    item: LicenseItem;
    top?: number;
    bottom?: number;
    left?: number;
    maxHeight?: number;
  } | null>(null);

  const handleToggleActionMenu = (e: React.MouseEvent<HTMLButtonElement>, lic: LicenseItem) => {
    e.stopPropagation();
    if (actionMenuAnchor?.id === lic.id) {
      setActionMenuAnchor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const topMargin = 12;
    const bottomMargin = 44; // Rule 7.2: strict clearance above footer bar
    const estimatedMenuHeight = 220;

    const spaceBelow = viewportHeight - rect.bottom - bottomMargin;
    const spaceAbove = rect.top - topMargin;

    let top: number | undefined;
    let bottom: number | undefined;
    let maxHeight: number;

    if (spaceBelow >= estimatedMenuHeight || spaceBelow >= spaceAbove) {
      top = rect.bottom + 6;
      maxHeight = Math.max(140, viewportHeight - top - bottomMargin);
    } else {
      bottom = viewportHeight - rect.top + 6;
      maxHeight = Math.max(140, rect.top - topMargin - 6);
    }

    let left: number;
    if (!isEn) {
      // In RTL: align left edge of menu with left edge of button
      left = Math.max(12, Math.min(rect.left, viewportWidth - menuWidth - 12));
    } else {
      // In LTR: align right edge of menu with right edge of button
      const desiredLeft = rect.right - menuWidth;
      if (desiredLeft >= 12) {
        left = desiredLeft;
      } else {
        left = Math.max(12, Math.min(rect.left, viewportWidth - menuWidth - 12));
      }
    }

    setActionMenuAnchor({
      id: lic.id,
      item: lic,
      top,
      bottom,
      left,
      maxHeight,
    });
  };

  // RBAC checks
  const canAdd = effectivePolicy?.canAddLicenses ?? effectivePolicy?.canManageLicenses ?? true;
  const canEdit = effectivePolicy?.canEditLicenses ?? effectivePolicy?.canManageLicenses ?? true;
  const canDelete = effectivePolicy?.canDeleteLicenses ?? true;
  const canDeleteAttachments = effectivePolicy?.canDeleteLicenseAttachments ?? true;

  // Filter licenses according to policy scoping (all vs specific)
  const visibleLicenses = useMemo(() => {
    if (effectivePolicy?.targetLicenseScope === 'specific') {
      const allowedIds = effectivePolicy.targetLicenseIds || [];
      return licenses.filter((l) => allowedIds.includes(l.id));
    }
    return licenses;
  }, [licenses, effectivePolicy]);

  // Show auto-dismissing toast
  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4500);
  }, []);

  // Fetch licenses from server with SWR caching & background revalidation
  const loadLicenses = useCallback(async (isSilent = false) => {
    const hasCache = Boolean(appDataCache.getOptimistic<LicenseItem[]>('licenses_list'));
    if (!isSilent && !hasCache) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const data = await appDataCache.query('licenses_list_full', () => fetchLicensesApi(), {
        ttlMs: 45_000,
        forceRefresh: isSilent,
      });
      const items = data.licenses || [];
      appDataCache.set('licenses_list', items);
      setLicenses(items);
    } catch (err: any) {
      if (!hasCache) {
        showToast(
          isEn
            ? `Failed to load licenses: ${err.message || 'Server error'}`
            : `خطا در دریافت اطلاعات لایسنس‌ها: ${err.message || 'خطای سرور'}`,
          'error'
        );
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isEn, showToast]);

  useEffect(() => {
    loadLicenses();
  }, [loadLicenses]);

  // Trigger automated daemon check manually
  const handleRunDaemonNow = async () => {
    setIsRunningCron(true);
    try {
      const result = await runLicenseContractCronNowApi();
      showToast(
        isEn
          ? `Daemon check complete. Analyzed ${result.checkedLicenses || 0} licenses, sent ${result.alertsSent || 0} email alerts.`
          : `بررسی خودکار انجام شد. ${result.checkedLicenses || 0} لایسنس ارزیابی شد و ${result.alertsSent || 0} هشدار ارسال گردید.`,
        'success'
      );
      loadLicenses(true);
    } catch (err: any) {
      showToast(
        isEn
          ? `Daemon trigger failed: ${err.message || 'Check SMTP server config'}`
          : `خطا در اجرای پایش: ${err.message || 'تنظیمات SMTP را بررسی نمایید'}`,
        'error'
      );
    } finally {
      setIsRunningCron(false);
    }
  };

  // Test sending alert email for a specific license
  const handleTestAlert = async (lic: LicenseItem) => {
    setTestingLicenseId(lic.id);
    const targetEmail = lic.ownerEmail || (lic.notifyEmails && lic.notifyEmails[0]);
    if (!targetEmail) {
      showToast(
        isEn
          ? 'No email address configured for this license. Please set Owner Email or Alert Recipients first.'
          : 'هیچ آدرس ایمیلی برای این لایسنس تنظیم نشده است. ابتدا ایمیل مسئول یا گیرندگان را وارد نمایید.',
        'error'
      );
      setTestingLicenseId(null);
      return;
    }

    try {
      const res = await testLicenseContractAlertApi({
        type: 'license',
        id: lic.id,
        targetEmail,
      });
      if (res.success) {
        showToast(
          isEn
            ? `Test alert email dispatched successfully to ${targetEmail}!`
            : `ایمیل هشدار آزمایشی با موفقیت به آدرس ${targetEmail} ارسال شد!`,
          'success'
        );
      } else {
        showToast(
          isEn
            ? `Email alert dispatch failed: ${res.message || 'SMTP rejection'}`
            : `ارسال هشدار با شکست مواجه شد: ${res.message || 'خطای SMTP'}`,
          'error'
        );
      }
    } catch (err: any) {
      showToast(
        isEn
          ? `Error sending test alert: ${err.message || 'Network error'}`
          : `خطا در ارسال ایمیل آزمایشی: ${err.message || 'خطای شبکه'}`,
        'error'
      );
    } finally {
      setTestingLicenseId(null);
    }
  };

  // Delete license
  const handleDeleteLicense = async (lic: LicenseItem) => {
    if (!canDelete) {
      showToast(
        isEn ? 'Access Denied: You do not have permission to delete licenses.' : 'عدم دسترسی: شما دسترسی حذف لایسنس را ندارید.',
        'error'
      );
      return;
    }

    const confirmText = isEn
      ? `Are you sure you want to delete license "${lic.title}"?`
      : `آیا از حذف لایسنس «${lic.title}» اطمینان دارید؟`;

    if (window.confirm(confirmText)) {
      try {
        await deleteLicenseApi(lic.id);
        appDataCache.invalidate('licenses_list');
        setLicenses((prev) => prev.filter((item) => item.id !== lic.id));
        showToast(
          isEn ? `License "${lic.title}" deleted.` : `لایسنس «${lic.title}» حذف شد.`,
          'info'
        );
      } catch (err: any) {
        showToast(
          isEn ? `Failed to delete license: ${err.message}` : `خطا در حذف لایسنس: ${err.message}`,
          'error'
        );
      }
    }
  };

  // Copy key to clipboard
  const handleCopyKey = (id: string, keyStr: string) => {
    navigator.clipboard.writeText(keyStr);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  // Calculate days remaining helper (suppressed / returns null if inactive)
  const getDaysRemaining = (endDateStr: string, isItemActive = true): number | null => {
    if (!isItemActive) return null;
    if (!endDateStr) return null;
    const now = new Date();
    const expiry = new Date(endDateStr);
    return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Toggle active / inactive handler
  const handleToggleActive = async (lic: LicenseItem, targetActive?: boolean) => {
    const currentlyActive = lic.isActive !== false && lic.status !== 'inactive';
    const nextActive = targetActive !== undefined ? targetActive : !currentlyActive;
    try {
      const res = await updateLicenseApi(lic.id, {
        isActive: nextActive,
        status: nextActive ? 'active' : 'inactive',
      });
      if (res.license) {
        setLicenses((prev) => prev.map((l) => (l.id === lic.id ? res.license : l)));
        appDataCache.invalidate('licenses_list');
        showToast(
          isEn
            ? `License "${lic.title}" is now ${nextActive ? 'Active' : 'Inactive (Paused)'}.`
            : `لایسنس «${lic.title}» به وضعیت ${nextActive ? 'فعال' : 'غیرفعال (متوقف)'} تغییر یافت.`,
          'success'
        );
      }
    } catch (err: any) {
      showToast(
        isEn
          ? `Failed to update status: ${err.message || 'Server error'}`
          : `خطا در تغییر وضعیت: ${err.message || 'خطای سرور'}`,
        'error'
      );
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivatingLicense) return;
    setIsDeactivatingLoading(true);
    try {
      await handleToggleActive(deactivatingLicense, false);
      setDeactivatingLicense(null);
    } finally {
      setIsDeactivatingLoading(false);
    }
  };

  // Unique vendors for filter
  const uniqueVendors = useMemo(() => {
    const set = new Set<string>();
    visibleLicenses.forEach((lic) => {
      if (lic.vendor) set.add(lic.vendor.trim());
    });
    return Array.from(set).sort();
  }, [visibleLicenses]);

  // Filtered licenses
  const filteredLicenses = useMemo(() => {
    return visibleLicenses.filter((lic) => {
      const isInactive = lic.isActive === false || lic.status === 'inactive';

      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = lic.title?.toLowerCase().includes(q);
        const matchesKey = lic.licenseKey?.toLowerCase().includes(q);
        const matchesVendor = lic.vendor?.toLowerCase().includes(q);
        const matchesOwner = lic.ownerName?.toLowerCase().includes(q);
        const matchesDept = lic.department?.toLowerCase().includes(q);
        const matchesNotes = lic.notes?.toLowerCase().includes(q);
        const matchedDevice = devices.find((d) => d.id === lic.connectedDeviceId);
        const matchesDev = matchedDevice && (
          matchedDevice.name.toLowerCase().includes(q) ||
          matchedDevice.ip.toLowerCase().includes(q)
        );

        if (!matchesTitle && !matchesKey && !matchesVendor && !matchesOwner && !matchesDept && !matchesNotes && !matchesDev) {
          return false;
        }
      }

      // Device Type
      if (typeFilter !== 'all' && lic.deviceType !== typeFilter) {
        return false;
      }

      // Vendor
      if (vendorFilter !== 'all' && lic.vendor !== vendorFilter) {
        return false;
      }

      // Status
      if (statusFilter !== 'all') {
        if (statusFilter === 'inactive') {
          if (!isInactive) return false;
        } else if (statusFilter === 'active') {
          if (isInactive) return false;
          const days = getDaysRemaining(lic.endDate, true);
          if (days !== null && (days <= 30 || lic.status === 'expired')) return false;
        } else if (statusFilter === 'expiring_soon') {
          if (isInactive) return false;
          const days = getDaysRemaining(lic.endDate, true);
          if (days === null || days > 30 || days < 0) return false;
        } else if (statusFilter === 'expired') {
          if (isInactive) return false;
          const days = getDaysRemaining(lic.endDate, true);
          if (days !== null && days >= 0) return false;
        }
      }

      return true;
    });
  }, [visibleLicenses, searchQuery, typeFilter, vendorFilter, statusFilter, devices]);

  // Summary Metrics calculations
  const summaryMetrics = useMemo(() => {
    let active = 0;
    let expiring = 0;
    let expired = 0;
    let inactive = 0;
    let totalAnnualCost = 0;
    let totalCostIrr = 0;
    let totalCostUsd = 0;

    visibleLicenses.forEach((lic) => {
      const isInactive = lic.isActive === false || lic.status === 'inactive';
      if (isInactive) {
        inactive++;
      } else {
        const days = getDaysRemaining(lic.endDate, true);
        if (days !== null && days < 0 || lic.status === 'expired') {
          expired++;
        } else if (days !== null && days <= 30 || lic.status === 'expiring_soon') {
          expiring++;
        } else {
          active++;
        }
      }

      if (lic.cost) {
        totalAnnualCost += lic.cost;
        if (lic.currency === 'IRR') {
          totalCostIrr += lic.cost;
        } else if (lic.currency === 'USD') {
          totalCostUsd += lic.cost;
        }
      }
    });

    return {
      total: visibleLicenses.length,
      active,
      expiring,
      expired,
      inactive,
      totalAnnualCost,
      totalCostIrr,
      totalCostUsd,
    };
  }, [visibleLicenses]);

  // Formatted cost display to ensure numbers fit cleanly without overflow
  const formattedCostDisplay = useMemo(() => {
    const { totalAnnualCost, totalCostIrr, totalCostUsd } = summaryMetrics;
    if (totalAnnualCost === 0) {
      return { value: '0', unit: '$ / IRR', subText: null };
    }

    if (totalCostIrr > 0 && totalCostUsd === 0) {
      if (totalCostIrr >= 1_000_000_000) {
        return {
          value: (totalCostIrr / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 }),
          unit: 'B IRR',
          subText: isEn ? 'Billion Rials' : 'میلیارد ریال',
        };
      }
      if (totalCostIrr >= 1_000_000) {
        return {
          value: (totalCostIrr / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 }),
          unit: 'M IRR',
          subText: isEn ? 'Million Rials' : 'میلیون ریال',
        };
      }
      return {
        value: totalCostIrr.toLocaleString(),
        unit: 'IRR',
        subText: null,
      };
    }

    if (totalCostUsd > 0 && totalCostIrr === 0) {
      if (totalCostUsd >= 1_000_000) {
        return {
          value: `$${(totalCostUsd / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
          unit: 'M',
          subText: isEn ? 'Million USD' : 'میلیون دلار',
        };
      }
      if (totalCostUsd >= 100_000) {
        return {
          value: `$${(totalCostUsd / 1_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}`,
          unit: 'K',
          subText: isEn ? 'Thousand USD' : 'هزار دلار',
        };
      }
      return {
        value: `$${totalCostUsd.toLocaleString()}`,
        unit: 'USD',
        subText: null,
      };
    }

    if (totalCostIrr > 0 && totalCostUsd > 0) {
      const irrPart =
        totalCostIrr >= 1_000_000
          ? `${(totalCostIrr / 1_000_000).toFixed(1)}M IRR`
          : `${totalCostIrr.toLocaleString()} IRR`;
      const usdPart =
        totalCostUsd >= 1_000
          ? `$${(totalCostUsd / 1_000).toFixed(0)}K`
          : `$${totalCostUsd}`;
      return {
        value: irrPart,
        unit: `+ ${usdPart}`,
        subText: isEn ? 'Multi-currency portfolio' : 'مجموع سبد ارزی و ریالی',
      };
    }

    // Generic fallback
    if (totalAnnualCost >= 1_000_000_000) {
      return {
        value: (totalAnnualCost / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 }),
        unit: 'B',
        subText: null,
      };
    }
    if (totalAnnualCost >= 1_000_000) {
      return {
        value: (totalAnnualCost / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 }),
        unit: 'M',
        subText: null,
      };
    }
    return {
      value: totalAnnualCost.toLocaleString(),
      unit: '$ / IRR',
      subText: null,
    };
  }, [summaryMetrics, isEn]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6" dir={isEn ? 'ltr' : 'rtl'}>
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-[999999] px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-3 transition-all duration-300 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              : toastMessage.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
              : 'bg-sky-950/90 border-sky-500/40 text-sky-200'
          }`}
        >
          {toastMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
          {toastMessage.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
          {toastMessage.type === 'info' && <Info className="w-5 h-5 text-sky-400 shrink-0" />}
          <span className="text-sm font-medium">{toastMessage.text}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-violet-600/20 to-indigo-600/10 border border-violet-500/30 text-violet-400">
              <KeyRound className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-slate-100">
                {isEn ? 'Licenses & Entitlements Management' : 'مدیریت جامع لایسنس‌ها و مجوزهای نرم‌افزاری'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                {isEn
                  ? 'Track vendor licenses, multi-milestone expiry notifications, attached certificates, and equipment links'
                  : 'پایش لایسنس‌های تجهیزات، هشدارهای زمان‌بندی‌شده چندگانه، پیوست‌های دیجیتال و پیوند به سخت‌افزار'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Manual Run Daemon Button */}
          <button
            type="button"
            onClick={handleRunDaemonNow}
            disabled={isRunningCron}
            className={`px-3 py-2 text-xs font-medium rounded-xl border transition-all cursor-pointer flex items-center gap-2 ${
              isLightMode
                ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
            } disabled:opacity-50`}
            title={isEn ? 'Run automated expiry check & send due alert emails' : 'بررسی فوری انقضا و ارسال ایمیل هشدارهای سررسید'}
          >
            <BellRing className={`w-3.5 h-3.5 text-amber-400 ${isRunningCron ? 'animate-bounce' : ''}`} />
            <span>{isRunningCron ? (isEn ? 'Evaluating...' : 'در حال ارزیابی...') : (isEn ? 'Check Expiries Now' : 'پایش فوری انقضا')}</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => loadLicenses(true)}
            disabled={isRefreshing}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isLightMode
                ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
            }`}
            title={isEn ? 'Refresh Data' : 'تازه‌سازی اطلاعات'}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-violet-400' : ''}`} />
          </button>

          {/* Add New License Button */}
          {canAdd && (
            <button
              type="button"
              onClick={() => {
                setEditingLicense(null);
                setModalMode('create');
                setIsModalOpen(true);
              }}
              className="px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30 transition-all cursor-pointer flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>{isEn ? 'Register New License' : 'ثبت لایسنس جدید'}</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Metric Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Total Licenses */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">{isEn ? 'Total Licenses' : 'کل لایسنس‌ها'}</span>
            <FieldInfoTooltip
              title={isEn ? 'Total Registered Licenses' : 'کل لایسنس‌های ثبت‌شده'}
              infoWhatEn="Aggregate count of software, switch, router, and server licenses."
              infoWhatFa="مجموع کل لایسنس‌ها و مجوزهای نرم‌افزاری و سخت‌افزاری ثبت‌شده در پایگاه داده."
              infoWhyEn="Gives full visibility over all vendor assets across the organization."
              infoWhyFa="دید کامل بر کلیه دارایی‌های دارای مجوز در سازمان."
              infoExampleEn="24 Active Assets"
              infoExampleFa="۲۴ مورد ثبت‌شده"
              isLightMode={isLightMode}
              isEn={isEn}
            />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-100">{summaryMetrics.total}</span>
            <span className="text-[10px] text-slate-400">{isEn ? 'records' : 'مورد'}</span>
          </div>
        </div>

        {/* Active Licenses */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              {isEn ? 'Active & Valid' : 'فعال و معتبر'}
            </span>
            <FieldInfoTooltip
              title={isEn ? 'Active Licenses' : 'لایسنس‌های معتبر'}
              infoWhatEn="Licenses with more than 30 days of validity remaining."
              infoWhatFa="مجوزهایی که بیشتر از ۳۰ روز تا انقضای آن‌ها باقی مانده است."
              infoWhyEn="Indicates nominal operating status without pending renewal urgency."
              infoWhyFa="وضعیت مطلوب شبکه بدون نیاز به اقدام اضطراری برای تمدید."
              infoExampleEn="18 Valid"
              infoExampleFa="۱۸ لایسنس پایدار"
              isLightMode={isLightMode}
              isEn={isEn}
            />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400">{summaryMetrics.active}</span>
            <span className="text-[10px] text-slate-400">{isEn ? 'healthy' : 'فعال'}</span>
          </div>
        </div>

        {/* Expiring Soon */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-amber-400 font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              {isEn ? 'Expiring Soon (≤30d)' : 'نزدیک به اتمام (≤۳۰ روز)'}
            </span>
            <FieldInfoTooltip
              title={isEn ? 'Expiring Soon' : 'در آستانه انقضا'}
              infoWhatEn="Licenses with 30 days or less remaining before cutoff."
              infoWhatFa="لایسنس‌هایی که ۳۰ روز یا کمتر تا پایان اعتبار آن‌ها فرصت باقی است."
              infoWhyEn="Requires immediate procurement attention and vendor quote requests."
              infoWhyFa="نیازمند پیگیری سریع خرید و اخذ استعلام قیمت جهت تمدید بدون قطعی سرویس."
              infoExampleEn="3 Pending Renewal"
              infoExampleFa="۳ مورد نیازمند تمدید"
              isLightMode={isLightMode}
              isEn={isEn}
            />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-400">{summaryMetrics.expiring}</span>
            <span className="text-[10px] text-amber-400/80">{isEn ? 'action required' : 'اقدام فوری'}</span>
          </div>
        </div>

        {/* Expired */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-rose-400 font-medium flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
              {isEn ? 'Expired' : 'منقضی شده'}
            </span>
            <FieldInfoTooltip
              title={isEn ? 'Expired Licenses' : 'لایسنس‌های منقضی'}
              infoWhatEn="Licenses that have already passed their valid end date."
              infoWhatFa="مجوزهایی که تاریخ انقضای آن‌ها به اتمام رسیده و تمدید نشده‌اند."
              infoWhyEn="Risks security definition drops, TAC lockout, and regulatory non-compliance."
              infoWhyFa="خطر قطع شدن آپدیت‌های امنیتی، قطع دسترسی به پشتیبانی TAC و جریمه حسابرسی."
              infoExampleEn="1 Expired"
              infoExampleFa="۱ مورد منقضی"
              isLightMode={isLightMode}
              isEn={isEn}
            />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-400">{summaryMetrics.expired}</span>
            <span className="text-[10px] text-rose-400/80">{isEn ? 'lapsed' : 'فاقد اعتبار'}</span>
          </div>
        </div>

        {/* Total Cost Investment */}
        <div
          className={`p-4 rounded-2xl border transition-all min-w-0 overflow-hidden flex flex-col justify-between ${
            isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2 min-w-0 gap-1">
            <span className="text-xs text-sky-400 font-medium flex items-center gap-1.5 truncate">
              <DollarSign className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate">{isEn ? 'Recorded Cost' : 'ارزش سرمایه‌گذاری'}</span>
            </span>
            <FieldInfoTooltip
              title={isEn ? 'Total License Cost' : 'مجموع هزینه‌های لایسنس'}
              infoWhatEn="Sum of registered procurement costs across all active items."
              infoWhatFa="جمع کل مبالغ سرمایه‌گذاری ثبت‌شده برای خرید لایسنس‌ها."
              infoWhyEn="Crucial for IT OPEX / CAPEX reporting and management presentations."
              infoWhyFa="ارائه گزارش‌های شفاف بودجه‌ای و هزینه‌های سالانه فناوری اطلاعات به مدیریت."
              infoExampleEn="$14,250 USD"
              infoExampleFa="۱۴,۲۵۰ دلار"
              isLightMode={isLightMode}
              isEn={isEn}
            />
          </div>
          <div className="min-w-0 overflow-hidden">
            <div
              className="flex items-baseline gap-1.5 flex-wrap min-w-0"
              title={`${summaryMetrics.totalAnnualCost.toLocaleString()} (${summaryMetrics.totalCostIrr > 0 ? `${summaryMetrics.totalCostIrr.toLocaleString()} IRR` : ''} ${summaryMetrics.totalCostUsd > 0 ? `$${summaryMetrics.totalCostUsd.toLocaleString()}` : ''})`}
            >
              <span className="text-lg sm:text-xl font-black text-sky-400 tracking-tight font-mono truncate max-w-full">
                {formattedCostDisplay.value}
              </span>
              <span className="text-[10px] text-slate-400 font-medium shrink-0">
                {formattedCostDisplay.unit}
              </span>
            </div>
            {formattedCostDisplay.subText && (
              <p className="text-[10px] text-slate-400/80 font-mono truncate mt-0.5" title={formattedCostDisplay.subText}>
                {formattedCostDisplay.subText}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        className={`p-4 rounded-2xl border flex flex-col md:flex-row items-center gap-3 ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
        }`}
      >
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isEn
                ? 'Search by license name, key, vendor, owner, department, or device...'
                : 'جستجو بر اساس نام لایسنس، کلید، سازنده، مسئول، دپارتمان یا دیوایس...'
            }
            className={`w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border outline-none transition-colors ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 focus:border-violet-500 text-slate-800'
                : 'bg-slate-950 border-slate-800 focus:border-violet-500 text-slate-100'
            }`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap sm:flex-nowrap">
          {/* Device Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={`px-3 py-2 text-xs rounded-xl border outline-none cursor-pointer ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-700'
                : 'bg-slate-950 border-slate-800 text-slate-300'
            }`}
          >
            <option value="all">{isEn ? 'All Asset Types' : 'همه انواع دارایی'}</option>
            <option value="switch">{isEn ? 'Switch' : 'سوئیچ'}</option>
            <option value="router">{isEn ? 'Router' : 'روتر'}</option>
            <option value="firewall">{isEn ? 'Firewall' : 'فایروال'}</option>
            <option value="linux_server">{isEn ? 'Linux Server' : 'سرور لینوکس'}</option>
            <option value="windows_server">{isEn ? 'Windows Server' : 'سرور ویندوز'}</option>
            <option value="virtual_machine">{isEn ? 'VM / Hypervisor' : 'ماشین مجازی'}</option>
            <option value="storage">{isEn ? 'Storage' : 'استوریج'}</option>
            <option value="access_point">{isEn ? 'Access Point' : 'اکسس‌پوینت'}</option>
          </select>

          {/* Vendor Filter */}
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className={`px-3 py-2 text-xs rounded-xl border outline-none cursor-pointer ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-700'
                : 'bg-slate-950 border-slate-800 text-slate-300'
            }`}
          >
            <option value="all">{isEn ? 'All Vendors' : 'همه سازندگان'}</option>
            {uniqueVendors.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`px-3 py-2 text-xs rounded-xl border outline-none cursor-pointer ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-700'
                : 'bg-slate-950 border-slate-800 text-slate-300'
            }`}
          >
            <option value="all">{isEn ? 'All Statuses' : 'همه وضعیت‌ها'}</option>
            <option value="active">{isEn ? 'Active Only' : 'فقط معتبر'}</option>
            <option value="inactive">{isEn ? 'Inactive (Paused)' : 'غیرفعال (متوقف)'}</option>
            <option value="expiring_soon">{isEn ? 'Expiring Soon (≤30d)' : 'فقط نزدیک به انقضا'}</option>
            <option value="expired">{isEn ? 'Expired Only' : 'فقط منقضی شده'}</option>
          </select>
        </div>
      </div>

      {/* Main Licenses Data Table */}
      <div
        className={`rounded-2xl border overflow-hidden shadow-sm ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
        }`}
      >
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
            <p className="text-xs text-slate-400">
              {isEn ? 'Loading enterprise licenses...' : 'در حال بارگذاری لایسنس‌های سازمان...'}
            </p>
          </div>
        ) : filteredLicenses.length === 0 ? (
          <div className="py-20 px-4 text-center flex flex-col items-center justify-center gap-3">
            <div className="p-4 rounded-3xl bg-slate-800/40 text-slate-400">
              <KeyRound className="w-10 h-10 stroke-1" />
            </div>
            <h3 className="text-sm font-bold text-slate-200">
              {isEn ? 'No Licenses Found' : 'لایسنسی یافت نشد'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md">
              {searchQuery || typeFilter !== 'all' || vendorFilter !== 'all' || statusFilter !== 'all'
                ? isEn
                  ? 'No licenses match the selected search criteria or filter tags.'
                  : 'هیچ لایسنسی با معیارهای جستجو یا فیلترهای انتخابی مطابقت ندارد.'
                : isEn
                ? 'Register your software, firmware, and equipment licenses to track validity periods and avoid service disruptions.'
                : 'لایسنس‌ها و مجوزهای نرم‌افزاری و سخت‌افزاری خود را جهت پایش خودکار سررسید و جلوگیری از اختلال شبکه ثبت نمایید.'}
            </p>
            {canAdd && (
              <button
                type="button"
                onClick={() => {
                  setEditingLicense(null);
                  setIsModalOpen(true);
                }}
                className="mt-2 px-4 py-2 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30 transition-all cursor-pointer flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>{isEn ? 'Register First License' : 'ثبت اولین لایسنس'}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" dir={isEn ? 'ltr' : 'rtl'}>
              <thead
                className={`text-[11px] font-bold uppercase tracking-wider border-b ${
                  isLightMode
                    ? 'bg-slate-100 text-slate-600 border-slate-200'
                    : 'bg-slate-950/70 text-slate-400 border-slate-800'
                }`}
              >
                <tr>
                  <th className="py-3 px-4">{isEn ? 'Title & Key' : 'عنوان و شناسه لایسنس'}</th>
                  <th className="py-3 px-3">{isEn ? 'Vendor & Type' : 'سازنده و نوع دارایی'}</th>
                  <th className="py-3 px-3">{isEn ? 'Connected Equipment' : 'دیوایس متصل'}</th>
                  <th className="py-3 px-3">{isEn ? 'Owner / Dept' : 'مسئول / واحد'}</th>
                  <th className="py-3 px-3">{isEn ? 'Validity & Expiry' : 'اعتبار و تاریخ انقضا'}</th>
                  <th className="py-3 px-3">{isEn ? 'Investment' : 'هزینه'}</th>
                  <th className="py-3 px-3">{isEn ? 'Alerts & Files' : 'هشدارها و پیوست‌ها'}</th>
                  <th className="py-3 px-4 text-right">{isEn ? 'Actions' : 'عملیات'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredLicenses.map((lic) => {
                  const isInactive = lic.isActive === false || lic.status === 'inactive';
                  const daysRemaining = getDaysRemaining(lic.endDate, !isInactive);
                  const isExpired = !isInactive && (daysRemaining !== null && daysRemaining < 0 || lic.status === 'expired');
                  const isExpiringSoon = !isInactive && !isExpired && (daysRemaining !== null && daysRemaining <= 30 || lic.status === 'expiring_soon');
                  const connectedDev = devices.find((d) => d.id === lic.connectedDeviceId);

                  return (
                    <tr
                      key={lic.id}
                      className={`transition-colors ${
                        isInactive
                          ? isLightMode
                            ? 'bg-slate-100/70 border-l-4 border-l-slate-400 opacity-70 hover:bg-slate-200/50 text-slate-500'
                            : 'bg-slate-900/40 border-l-4 border-l-slate-600 opacity-65 hover:bg-slate-800/40 text-slate-400'
                          : isLightMode
                          ? 'hover:bg-slate-50 divide-slate-100'
                          : 'hover:bg-slate-800/30'
                      }`}
                    >
                      {/* Title & Key */}
                      <td className="py-3.5 px-4">
                        <div className={`font-bold flex items-center gap-1.5 flex-wrap ${isInactive ? 'text-slate-400' : 'text-slate-200'}`}>
                          <span>{lic.title}</span>
                          {isInactive && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-700/50 text-slate-300 border border-slate-600/60 flex items-center gap-1">
                              <PowerOff className="w-2.5 h-2.5" />
                              {isEn ? 'INACTIVE' : 'غیرفعال'}
                            </span>
                          )}
                          {lic.renewalCycle && lic.renewalCycle > 1 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              {isEn ? `Cycle ${lic.renewalCycle}` : `دوره ${lic.renewalCycle}`}
                            </span>
                          )}
                          {lic.status === 'renewed' && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                              {isEn ? 'Renewed' : 'تمدید شده'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/70 text-slate-300 max-w-[170px] truncate">
                            {lic.licenseKey}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopyKey(lic.id, lic.licenseKey)}
                            className="text-slate-400 hover:text-cyan-300 cursor-pointer"
                            title={isEn ? 'Copy key' : 'کپی کلید لایسنس'}
                          >
                            {copiedKeyId === lic.id ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Vendor & Type */}
                      <td className="py-3.5 px-3">
                        <div className={`font-medium ${isInactive ? 'text-slate-400' : 'text-slate-300'}`}>{lic.vendor || '-'}</div>
                        <div className="text-[10px] text-slate-400 capitalize">
                          {lic.deviceType?.replace('_', ' ') || 'Other'}
                        </div>
                      </td>

                      {/* Connected Device */}
                      <td className="py-3.5 px-3">
                        {connectedDev ? (
                          <div className="flex items-center gap-1.5">
                            <Server className={`w-3.5 h-3.5 ${isInactive ? 'text-slate-500' : 'text-cyan-400'} shrink-0`} />
                            <div>
                              <p className={`font-medium text-xs truncate max-w-[140px] ${isInactive ? 'text-slate-400' : 'text-slate-200'}`}>{connectedDev.name}</p>
                              <p className="font-mono text-[10px] text-slate-400">{connectedDev.ip}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            {isEn ? 'Standalone' : 'مستقل (بدون دیوایس)'}
                          </span>
                        )}
                      </td>

                      {/* Owner & Department */}
                      <td className="py-3.5 px-3">
                        <div className={`font-medium ${isInactive ? 'text-slate-400' : 'text-slate-300'}`}>{lic.ownerName || '-'}</div>
                        <div className="text-[10px] text-slate-400">{lic.department || '-'}</div>
                      </td>

                      {/* Validity & Expiry Countdown */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1.5">
                          {isInactive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700/80">
                              <PowerOff className="w-3 h-3 text-slate-400" />
                              {isEn ? 'INACTIVE (PAUSED)' : 'غیرفعال (متوقف)'}
                            </span>
                          ) : lic.status === 'renewed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                              <RotateCw className="w-3 h-3" />
                              {isEn ? 'Renewed' : 'تمدید شده'}
                            </span>
                          ) : isExpired ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/10 border border-rose-500/30 text-rose-400">
                              <XCircle className="w-3 h-3" />
                              {isEn ? 'Expired' : 'منقضی شده'}
                            </span>
                          ) : isExpiringSoon ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400 animate-pulse">
                              <Clock className="w-3 h-3" />
                              {daysRemaining} {isEn ? 'days left' : 'روز مانده'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" />
                              {daysRemaining} {isEn ? 'days left' : 'روز مانده'}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {lic.endDate}
                        </div>
                      </td>

                      {/* Investment */}
                      <td className="py-3.5 px-3">
                        <div className={`font-medium ${isInactive ? 'text-slate-400' : 'text-slate-200'}`}>
                          {lic.cost ? `${lic.cost.toLocaleString()} ${lic.currency}` : '-'}
                        </div>
                        <div className="text-[10px] text-slate-400 capitalize">
                          {lic.paymentMethod || 'annual'}
                        </div>
                      </td>

                      {/* Alerts & Attachments */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2">
                          {/* Alert recipients badge - clickable button */}
                          <button
                            type="button"
                            onClick={() => {
                              setAlertModalItem(lic);
                              setIsAlertModalOpen(true);
                            }}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer group ${
                              isInactive
                                ? 'bg-slate-800/20 text-slate-500 border-slate-700/40 opacity-60'
                                : (lic.notifyEmails?.length || 0) + (lic.ownerEmail ? 1 : 0) > 0
                                ? 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border-sky-500/30 hover:border-sky-400'
                                : 'bg-slate-800/40 hover:bg-slate-800 text-slate-400 border-slate-700/60'
                            }`}
                            title={
                              isInactive
                                ? isEn ? 'Reminders paused (Inactive license)' : 'یادآورها متوقف هستند (لایسنس غیرفعال)'
                                : isEn
                                ? `View ${(lic.notifyEmails?.length || 0) + (lic.ownerEmail ? 1 : 0)} alert recipients & schedule`
                                : `مشاهده ${(lic.notifyEmails?.length || 0) + (lic.ownerEmail ? 1 : 0)} گیرنده و زمان‌بندی هشدارها`
                            }
                          >
                            <Mail className={`w-3.5 h-3.5 ${isInactive ? 'text-slate-500' : 'text-sky-400 group-hover:scale-110'} transition-transform shrink-0`} />
                            <span>{(lic.notifyEmails?.length || 0) + (lic.ownerEmail ? 1 : 0)}</span>
                          </button>

                          {/* Attachments badge - clickable button to view and download all files */}
                          {lic.attachments && lic.attachments.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAttachmentsModalItem({
                                  title: lic.title,
                                  attachments: lic.attachments,
                                });
                                setIsAttachmentsModalOpen(true);
                              }}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-400 text-indigo-300 text-[11px] font-semibold transition-all cursor-pointer group"
                              title={
                                isEn
                                  ? `Click to view and download ${lic.attachments.length} attached files`
                                  : `کلیک برای مشاهده و دانلود ${lic.attachments.length} فایل پیوست`
                              }
                            >
                              <Paperclip className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform shrink-0" />
                              <span>{lic.attachments.length}</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-500 px-1 font-mono">-</span>
                          )}
                        </div>
                      </td>

                      {/* Actions: 3-Dots Menu Only */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center">
                          <button
                            type="button"
                            onClick={(e) => handleToggleActionMenu(e, lic)}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                              actionMenuAnchor?.id === lic.id
                                ? 'bg-cyan-600 text-white border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                                : isLightMode
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700/80 hover:text-white'
                            }`}
                            title={isEn ? 'Actions & Options' : 'عملیات و گزینه‌ها'}
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

      {/* License Registration / Editing / Renewal Modal */}
      <LicenseModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingLicense(null);
        }}
        license={editingLicense}
        mode={modalMode}
        devices={devices}
        isLightMode={isLightMode}
        isEn={isEn}
        canDeleteAttachments={canDeleteAttachments}
        onSaved={(savedLicense) => {
          loadLicenses(true);
          showToast(
            isEn
              ? modalMode === 'renew'
                ? `License renewed successfully: ${savedLicense.title}`
                : editingLicense
                ? `License "${savedLicense.title}" updated successfully.`
                : `License "${savedLicense.title}" registered successfully.`
              : modalMode === 'renew'
              ? `تمدید لایسنس با موفقیت انجام شد: ${savedLicense.title}`
              : editingLicense
              ? `لایسنس «${savedLicense.title}» با موفقیت ویرایش شد.`
              : `لایسنس «${savedLicense.title}» با موفقیت ثبت شد.`,
            'success'
          );
        }}
      />

      {/* Renewal & Version History Chain Modal */}
      <RenewalHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => {
          setIsHistoryModalOpen(false);
          setHistoryLicense(null);
        }}
        type="license"
        item={historyLicense}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* Item Attachments & Downloads Modal */}
      <ItemAttachmentsModal
        isOpen={isAttachmentsModalOpen}
        onClose={() => {
          setIsAttachmentsModalOpen(false);
          setAttachmentsModalItem(null);
        }}
        itemTitle={attachmentsModalItem?.title || ''}
        attachments={attachmentsModalItem?.attachments || []}
        isLightMode={isLightMode}
        isEn={isEn}
        onPreviewFile={(file) => {
          setPreviewFile(file);
          setIsPreviewOpen(true);
        }}
      />

      {/* Alert Recipients & Milestones Modal */}
      <AlertRecipientsModal
        isOpen={isAlertModalOpen}
        onClose={() => {
          setIsAlertModalOpen(false);
          setAlertModalItem(null);
        }}
        itemTitle={alertModalItem?.title || ''}
        itemType="license"
        ownerEmail={alertModalItem?.ownerEmail}
        ownerName={alertModalItem?.ownerName}
        department={alertModalItem?.department}
        notifyEmails={alertModalItem?.notifyEmails}
        alertDays={alertModalItem?.alertDays || [60, 30, 15, 7, 1]}
        endDate={alertModalItem?.endDate}
        isLightMode={isLightMode}
        isEn={isEn}
        isSendingTest={testingLicenseId === alertModalItem?.id}
        onSendTestAlert={async () => {
          if (alertModalItem) {
            await handleTestAlert(alertModalItem);
          }
        }}
      />

      {/* Single Attachment File Preview Modal */}
      <AttachmentPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewFile(null);
        }}
        file={previewFile}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* Deactivate License Confirmation Modal */}
      {deactivatingLicense && (
        <div
          className="fixed top-0 left-0 right-0 bottom-8 z-[999995] p-4 bg-black/80 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-150"
          onClick={() => !isDeactivatingLoading && setDeactivatingLicense(null)}
          dir={isEn ? 'ltr' : 'rtl'}
        >
          <div
            className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 ${
              isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold">
                  {isEn ? 'Confirm License Deactivation' : 'تایید غیرفعال‌سازی لایسنس'}
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {isEn ? (
                    <>
                      Are you sure you want to deactivate license{' '}
                      <span className="font-semibold text-slate-200">"{deactivatingLicense.title}"</span>?
                      Deactivating will pause the expiration countdown and suspend all scheduled email alerts.
                    </>
                  ) : (
                    <>
                      آیا از غیرفعال‌سازی لایسنس{' '}
                      <span className="font-semibold text-slate-200">«{deactivatingLicense.title}»</span>{' '}
                      اطمینان دارید؟ با این کار، روزشمار انقضا متوقف شده و ارسال کلیه هشدارهای ایمیلی سررسید به حالت تعلیق درمی‌آید.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeactivatingLicense(null)}
                disabled={isDeactivatingLoading}
                className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                  isLightMode
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeactivate}
                disabled={isDeactivatingLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeactivatingLoading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <PowerOff className="w-3.5 h-3.5" />
                )}
                <span>{isEn ? 'Deactivate License' : 'غیرفعال‌سازی لایسنس'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating 3-Dots Action Dropdown Menu (Portal) */}
      {actionMenuAnchor &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-[99998] bg-transparent"
              onClick={() => setActionMenuAnchor(null)}
            />

            {/* Dropdown Menu */}
            <div
              style={{
                position: 'fixed',
                top: actionMenuAnchor.top !== undefined ? `${actionMenuAnchor.top}px` : undefined,
                bottom: actionMenuAnchor.bottom !== undefined ? `${actionMenuAnchor.bottom}px` : undefined,
                left: `${actionMenuAnchor.left}px`,
                maxHeight: `${actionMenuAnchor.maxHeight}px`,
              }}
              className={`z-[99999] min-w-[210px] rounded-xl border shadow-2xl p-1.5 flex flex-col gap-1 overflow-y-auto backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 ${
                isLightMode
                  ? 'bg-white/95 border-slate-200 shadow-slate-400/30'
                  : 'bg-slate-900/95 border-slate-700/80 shadow-black/80'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Test Alert Button */}
              <button
                type="button"
                onClick={() => {
                  handleTestAlert(actionMenuAnchor.item);
                  setActionMenuAnchor(null);
                }}
                disabled={testingLicenseId === actionMenuAnchor.item.id}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                  isLightMode ? 'hover:bg-sky-50 text-sky-700' : 'hover:bg-sky-500/15 text-sky-300'
                }`}
              >
                {testingLicenseId === actionMenuAnchor.item.id ? (
                  <div className="w-3.5 h-3.5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin shrink-0" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                )}
                <span>{isEn ? 'Dispatch Test Alert' : 'ارسال ایمیل هشدار تستی'}</span>
              </button>

              {/* Toggle Active / Inactive in Action Menu */}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    const item = actionMenuAnchor.item;
                    const isCurrentlyInactive = item.isActive === false || item.status === 'inactive';
                    setActionMenuAnchor(null);
                    if (isCurrentlyInactive) {
                      // Activating is immediate, no confirmation needed
                      handleToggleActive(item, true);
                    } else {
                      // Deactivation requires user confirmation first
                      setDeactivatingLicense(item);
                    }
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                    (actionMenuAnchor.item.isActive === false || actionMenuAnchor.item.status === 'inactive')
                      ? isLightMode ? 'hover:bg-emerald-50 text-emerald-700' : 'hover:bg-emerald-500/15 text-emerald-400'
                      : isLightMode ? 'hover:bg-amber-50 text-amber-700' : 'hover:bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {(actionMenuAnchor.item.isActive === false || actionMenuAnchor.item.status === 'inactive') ? (
                    <>
                      <Power className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{isEn ? 'Activate License' : 'فعال‌سازی لایسنس'}</span>
                    </>
                  ) : (
                    <>
                      <PowerOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{isEn ? 'Deactivate License' : 'غیرفعال‌سازی لایسنس'}</span>
                    </>
                  )}
                </button>
              )}

              {/* Renew Button */}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingLicense(actionMenuAnchor.item);
                    setModalMode('renew');
                    setIsModalOpen(true);
                    setActionMenuAnchor(null);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                    isLightMode ? 'hover:bg-cyan-50 text-cyan-700' : 'hover:bg-cyan-500/15 text-cyan-300'
                  }`}
                >
                  <RotateCw className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>{isEn ? 'Renew License' : 'تمدید لایسنس (دوره جدید)'}</span>
                </button>
              )}

              {/* History Chain Button */}
              <button
                type="button"
                onClick={() => {
                  setHistoryLicense(actionMenuAnchor.item);
                  setIsHistoryModalOpen(true);
                  setActionMenuAnchor(null);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                  isLightMode ? 'hover:bg-indigo-50 text-indigo-700' : 'hover:bg-indigo-500/15 text-indigo-300'
                }`}
              >
                <History className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>{isEn ? 'Renewal History Chain' : 'مشاهده زنجیره سوابق'}</span>
              </button>

              {/* Edit Button */}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingLicense(actionMenuAnchor.item);
                    setModalMode('edit');
                    setIsModalOpen(true);
                    setActionMenuAnchor(null);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                    isLightMode ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{isEn ? 'Edit License' : 'ویرایش لایسنس'}</span>
                </button>
              )}

              {/* Delete Button */}
              {canDelete && (
                <div className={`pt-1 mt-0.5 border-t ${isLightMode ? 'border-slate-200' : 'border-slate-800'}`}>
                  <button
                    type="button"
                    onClick={() => {
                      handleDeleteLicense(actionMenuAnchor.item);
                      setActionMenuAnchor(null);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                      isLightMode ? 'hover:bg-rose-50 text-rose-600' : 'hover:bg-rose-500/15 text-rose-400'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>{isEn ? 'Delete License' : 'حذف لایسنس'}</span>
                  </button>
                </div>
              )}
            </div>
          </>,
          document.body
        )}
    </div>
  );
};
