import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ScrollText,
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
  Eye,
  FileText,
  Phone,
  Tag,
  Layers,
  ArrowRight,
  RotateCw,
  History,
  MoreVertical,
  Power,
  PowerOff
} from 'lucide-react';
import {
  ContractItem,
  ContractType,
  ContractStatus,
  AttachmentFile,
  Device,
  AccessPolicy
} from '../../types';
import {
  fetchContractsApi,
  deleteContractApi,
  updateContractApi,
  testLicenseContractAlertApi,
  runLicenseContractCronNowApi
} from '../../services/api';
import { ContractModal } from './ContractModal';
import { AttachmentPreviewModal } from './AttachmentPreviewModal';
import { RenewalHistoryModal } from './RenewalHistoryModal';
import { ItemAttachmentsModal } from './ItemAttachmentsModal';
import { AlertRecipientsModal } from './AlertRecipientsModal';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { appDataCache } from '../../services/dataCache';

interface ContractsViewProps {
  devices: Device[];
  isLightMode?: boolean;
  isEn?: boolean;
  effectivePolicy?: AccessPolicy;
  onNavigateToLicenses?: () => void;
}

export const ContractsView: React.FC<ContractsViewProps> = ({
  devices,
  isLightMode = false,
  isEn = true,
  effectivePolicy,
  onNavigateToLicenses,
}) => {
  const cachedContracts = appDataCache.getOptimistic<ContractItem[]>('contracts_list');
  const [contracts, setContracts] = useState<ContractItem[]>(() => cachedContracts || []);
  const [isLoading, setIsLoading] = useState(() => !cachedContracts);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRunningCron, setIsRunningCron] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'renew'>('create');
  const [editingContract, setEditingContract] = useState<ContractItem | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyContract, setHistoryContract] = useState<ContractItem | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [testingContractId, setTestingContractId] = useState<string | null>(null);

  // Attachment Preview Modal
  const [previewFile, setPreviewFile] = useState<AttachmentFile | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Modals for Alerts & Files
  const [attachmentsModalItem, setAttachmentsModalItem] = useState<{
    title: string;
    attachments: AttachmentFile[];
  } | null>(null);
  const [isAttachmentsModalOpen, setIsAttachmentsModalOpen] = useState(false);

  const [alertModalItem, setAlertModalItem] = useState<ContractItem | null>(null);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);

  // Delete Confirmation Modal
  const [contractToDelete, setContractToDelete] = useState<ContractItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Deactivate Confirmation Modal
  const [deactivatingContract, setDeactivatingContract] = useState<ContractItem | null>(null);
  const [isDeactivatingLoading, setIsDeactivatingLoading] = useState(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 3-Dots Action Menu state
  const [actionMenuAnchor, setActionMenuAnchor] = useState<{
    id: string;
    item: ContractItem;
    top?: number;
    bottom?: number;
    left?: number;
    maxHeight?: number;
  } | null>(null);

  const handleToggleActionMenu = (e: React.MouseEvent<HTMLButtonElement>, contract: ContractItem) => {
    e.stopPropagation();
    if (actionMenuAnchor?.id === contract.id) {
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
      id: contract.id,
      item: contract,
      top,
      bottom,
      left,
      maxHeight,
    });
  };

  // RBAC checks
  const canAdd = effectivePolicy?.canAddContracts ?? effectivePolicy?.canManageContracts ?? true;
  const canEdit = effectivePolicy?.canEditContracts ?? effectivePolicy?.canManageContracts ?? true;
  const canDelete = effectivePolicy?.canDeleteContracts ?? true;
  const canDeleteAttachments = effectivePolicy?.canDeleteContractAttachments ?? true;

  // Filter contracts according to policy scoping (all vs specific)
  const visibleContracts = useMemo(() => {
    if (effectivePolicy?.targetContractScope === 'specific') {
      const allowedIds = effectivePolicy.targetContractIds || [];
      return contracts.filter((c) => allowedIds.includes(c.id));
    }
    return contracts;
  }, [contracts, effectivePolicy]);

  // Show auto-dismissing toast
  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4500);
  }, []);

  // Fetch contracts from server with SWR caching & background revalidation
  const loadContracts = useCallback(async (isSilent = false) => {
    const hasCache = Boolean(appDataCache.getOptimistic<ContractItem[]>('contracts_list'));
    if (!isSilent && !hasCache) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const data = await appDataCache.query('contracts_list_full', () => fetchContractsApi(), {
        ttlMs: 45_000,
        forceRefresh: isSilent,
      });
      const items = data.contracts || [];
      appDataCache.set('contracts_list', items);
      setContracts(items);
    } catch (err: any) {
      if (!hasCache) {
        showToast(
          isEn
            ? `Failed to load contracts: ${err.message || 'Server error'}`
            : `خطا در دریافت اطلاعات قراردادها: ${err.message || 'خطای سرور'}`,
          'error'
        );
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isEn, showToast]);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  // Execute Background Cron Alert Daemon manually
  const handleRunCron = async () => {
    setIsRunningCron(true);
    try {
      const res = await runLicenseContractCronNowApi();
      showToast(
        isEn
          ? `Alert Daemon executed: ${res.checkedContracts} contracts checked, ${res.alertsSent} emails dispatched.`
          : `موتور پایش با موفقیت اجرا شد: ${res.checkedContracts} قرارداد بررسی و ${res.alertsSent} ایمیل ارسال گردید.`,
        'success'
      );
      loadContracts(true);
    } catch (err: any) {
      showToast(
        isEn
          ? `Alert Daemon failed: ${err.message || 'Server error'}`
          : `خطا در اجرای موتور هشدار: ${err.message || 'خطای سرور'}`,
        'error'
      );
    } finally {
      setIsRunningCron(false);
    }
  };

  // Test single contract alert
  const handleTestAlert = async (contract: ContractItem) => {
    setTestingContractId(contract.id);
    try {
      const res = await testLicenseContractAlertApi({
        type: 'contract',
        id: contract.id,
      });
      showToast(
        isEn
          ? `Test alert dispatched for "${contract.title}"! (Recipients: ${contract.notifyEmails.length || 1})`
          : `ایمیل هشدار آزمایشی برای «${contract.title}» با موفقیت ارسال شد!`,
        'success'
      );
    } catch (err: any) {
      showToast(
        isEn
          ? `Failed to dispatch test alert: ${err.message || 'Check SMTP configuration'}`
          : `ارسال هشدار آزمایشی با خطا مواجه شد: ${err.message || 'تنظیمات SMTP را بررسی فرمایید'}`,
        'error'
      );
    } finally {
      setTestingContractId(null);
    }
  };

  // Confirm and delete contract
  const handleDeleteContract = async () => {
    if (!contractToDelete) return;
    setIsDeleting(true);

    try {
      await deleteContractApi(contractToDelete.id);
      appDataCache.invalidate('contracts_list');
      showToast(
        isEn
          ? `Contract "${contractToDelete.title}" deleted successfully.`
          : `قرارداد «${contractToDelete.title}» با موفقیت حذف گردید.`,
        'success'
      );
      setContractToDelete(null);
      loadContracts(true);
    } catch (err: any) {
      showToast(
        isEn
          ? `Failed to delete contract: ${err.message || 'Server error'}`
          : `خطا در حذف قرارداد: ${err.message || 'خطای سرور'}`,
        'error'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // Copy text helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Open attachment preview
  const handlePreviewAttachment = (file: AttachmentFile) => {
    setPreviewFile(file);
    setIsPreviewOpen(true);
  };

  // Filtered contracts
  const filteredContracts = useMemo(() => {
    return visibleContracts.filter((cnt) => {
      // Type filter
      if (typeFilter !== 'all' && cnt.contractType !== typeFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'inactive') {
          if (cnt.isActive !== false && cnt.status !== 'inactive') return false;
        } else if (statusFilter === 'active') {
          if (cnt.isActive === false || cnt.status !== 'active') return false;
        } else if (cnt.status !== statusFilter) {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = cnt.title?.toLowerCase().includes(q);
        const matchNum = cnt.contractNumber?.toLowerCase().includes(q);
        const matchVendor = cnt.vendorName?.toLowerCase().includes(q);
        const matchContact = cnt.vendorContact?.toLowerCase().includes(q);
        const matchOwner = cnt.ownerName?.toLowerCase().includes(q);
        const matchDept = cnt.department?.toLowerCase().includes(q);
        const matchNotes = cnt.notes?.toLowerCase().includes(q);
        return matchTitle || matchNum || matchVendor || matchContact || matchOwner || matchDept || matchNotes;
      }

      return true;
    });
  }, [visibleContracts, typeFilter, statusFilter, searchQuery]);

  // Statistical KPI metrics
  const stats = useMemo(() => {
    const total = visibleContracts.length;
    const inactive = visibleContracts.filter((c) => c.status === 'inactive' || c.isActive === false).length;
    const active = visibleContracts.filter((c) => (c.isActive !== false && c.status !== 'inactive') && c.status === 'active').length;
    const expiringSoon = visibleContracts.filter((c) => (c.isActive !== false && c.status !== 'inactive') && c.status === 'expiring_soon').length;
    const expired = visibleContracts.filter((c) => (c.isActive !== false && c.status !== 'inactive') && c.status === 'expired').length;
    const inRenewal = visibleContracts.filter((c) => c.status === 'in_renewal').length;

    // Total cost in IRR
    const totalCostIrr = visibleContracts
      .filter((c) => c.currency === 'IRR' && c.totalCost)
      .reduce((sum, c) => sum + (c.totalCost || 0), 0);

    const totalCostUsd = visibleContracts
      .filter((c) => c.currency === 'USD' && c.totalCost)
      .reduce((sum, c) => sum + (c.totalCost || 0), 0);

    return { total, active, expiringSoon, expired, inRenewal, inactive, totalCostIrr, totalCostUsd };
  }, [visibleContracts]);

  // Toggle active / inactive handler
  const handleToggleActive = async (contract: ContractItem, targetActive?: boolean) => {
    const currentlyActive = contract.isActive !== false && contract.status !== 'inactive';
    const nextActive = targetActive !== undefined ? targetActive : !currentlyActive;
    try {
      const res = await updateContractApi(contract.id, {
        isActive: nextActive,
        status: nextActive ? 'active' : 'inactive',
      });
      if (res.contract) {
        setContracts((prev) => prev.map((c) => (c.id === contract.id ? res.contract : c)));
        appDataCache.invalidate('contracts_list');
        showToast(
          isEn
            ? `Contract "${contract.title}" is now ${nextActive ? 'Active' : 'Inactive (Paused)'}.`
            : `قرارداد «${contract.title}» به وضعیت ${nextActive ? 'فعال' : 'غیرفعال (متوقف)'} تغییر یافت.`,
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
    if (!deactivatingContract) return;
    setIsDeactivatingLoading(true);
    try {
      await handleToggleActive(deactivatingContract, false);
      setDeactivatingContract(null);
    } finally {
      setIsDeactivatingLoading(false);
    }
  };

  // Days left calculation (suppressed if inactive)
  const getDaysLeft = (endDate: string, isItemActive = true) => {
    if (!isItemActive) return null;
    if (!endDate) return null;
    const end = new Date(endDate);
    const now = new Date();
    if (isNaN(end.getTime())) return null;
    return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Helper for contract type label
  const getContractTypeLabel = (type: ContractType) => {
    switch (type) {
      case 'sla_support':
        return isEn ? '24/7 SLA Support' : 'پشتیبانی فنی و SLA';
      case 'hardware_warranty':
        return isEn ? 'Hardware Warranty & RMA' : 'گارانتی و قطعات RMA';
      case 'internet_isp':
        return isEn ? 'Dedicated Bandwidth (ISP)' : 'پهنای باند اینترنت ISP';
      case 'datacenter_colocation':
        return isEn ? 'Datacenter Colocation' : 'کولوکیشن دیتاسنتر';
      case 'software_maintenance':
        return isEn ? 'Software Maintenance' : 'نگهداری نرم‌افزار';
      case 'hardware_purchase':
        return isEn ? 'Hardware Purchase' : 'خرید تجهیزات';
      case 'consulting':
        return isEn ? 'Technical Consulting' : 'مشاوره و ممیزی';
      default:
        return isEn ? 'Other Services' : 'سایر خدمات';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6" dir={isEn ? 'ltr' : 'rtl'}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 sm:right-8 z-[999999] max-w-[calc(100vw-2rem)] flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold animate-in fade-in slide-in-from-top-4 duration-200 border ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
              : toastMessage.type === 'error'
              ? 'bg-rose-950/90 border-rose-500 text-rose-200'
              : 'bg-indigo-950/90 border-indigo-500 text-indigo-200'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : toastMessage.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <ScrollText className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100">
                {isEn ? 'Contracts & Vendor SLA Agreements' : 'مدیریت قراردادها، گارانتی و توافق‌نامه‌های SLA'}
              </h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Phase 4 Live
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400">
              {isEn
                ? 'Centralized vendor warranties, ISP bandwidth SLAs, multi-milestone renewal alerts, and PDF documents'
                : 'سامانه متمرکز گارانتی تجهیزات، قراردادهای پهنای باند اینترنت، هشدارهای تمدید و اسناد پیوست'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {onNavigateToLicenses && (
            <button
              type="button"
              onClick={onNavigateToLicenses}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                isLightMode
                  ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
              }`}
              title={isEn ? 'Switch to Licenses Tab' : 'جابجایی به برگه مدیریت لایسنس‌ها'}
            >
              <span>{isEn ? 'Licenses Management' : 'مدیریت لایسنس‌ها'}</span>
              <ArrowRight className={`w-3.5 h-3.5 ${isEn ? '' : 'rotate-180'}`} />
            </button>
          )}

          <button
            type="button"
            onClick={() => loadContracts(true)}
            disabled={isRefreshing}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isLightMode
                ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
            }`}
            title={isEn ? 'Refresh contracts list' : 'تازه‌سازی لیست قراردادها'}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleRunCron}
            disabled={isRunningCron}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
              isLightMode
                ? 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800'
                : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300'
            }`}
            title={isEn ? 'Run Expiry Daemon & Send Scheduled Alerts' : 'اجرای آنی موتور زمان‌بندی و ارسال هشدارهای سررسید'}
          >
            <BellRing className={`w-3.5 h-3.5 ${isRunningCron ? 'animate-bounce text-amber-400' : ''}`} />
            <span className="hidden sm:inline">
              {isRunningCron
                ? isEn ? 'Scanning...' : 'در حال اسکن...'
                : isEn ? 'Run Alert Daemon' : 'اجرای موتور هشدار'}
            </span>
          </button>

          {canAdd && (
            <button
              type="button"
              onClick={() => {
                setEditingContract(null);
                setModalMode('create');
                setIsModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isEn ? 'New Contract' : 'ثبت قرارداد جدید'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Top 5 KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Contracts */}
        <div
          className={`p-4 rounded-2xl border space-y-1.5 ${
            isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {isEn ? 'Total Contracts' : 'کل قراردادها'}
            </span>
            <FieldInfoTooltip
              title={isEn ? 'Total Contracts' : 'تعداد کل قراردادها'}
              infoWhatEn="Total count of active, expiring, expired, and in-renewal vendor contracts."
              infoWhatFa="مجموع کل قراردادهای ثبت‌شده در سازمان اعم از پشتیبانی، گارانتی و اینترنت."
              infoWhyEn="Represents overall vendor management volume across infrastructure."
              infoWhyFa="نشان‌دهنده حجم کلی توافق‌نامه‌ها و بار مدیریتی امور پیمانکاران."
              infoExampleEn="Active contracts portfolio"
              infoExampleFa="کل قراردادهای تحت مدیریت"
              isLightMode={isLightMode}
              isEn={isEn}
            />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-100">{stats.total}</p>
          <p className="text-[10px] text-slate-500">
            {isEn ? 'Portfolio agreements' : 'قرارداد رسمی'}
          </p>
        </div>

        {/* Active Contracts */}
        <div
          className={`p-4 rounded-2xl border space-y-1.5 ${
            isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              {isEn ? 'Active & Valid' : 'معتبر و فعال'}
            </span>
            <FieldInfoTooltip
              title={isEn ? 'Active Contracts' : 'قراردادهای معتبر'}
              infoWhatEn="Contracts with valid SLA coverage and more than 45 days remaining."
              infoWhatFa="قراردادهایی که بیش از ۴۵ روز تا انقضای آنها باقیمانده و پوشش SLA برقرار است."
              infoWhyEn="Guarantees immediate vendor assistance and spare part availability."
              infoWhyFa="تضمین دسترسی به خدمات فنی و تعویض فوری قطعات بدون مانع قراردادی."
              infoExampleEn="Healthy SLA status"
              infoExampleFa="پوشش کامل گارانتی و پشتیبانی"
              isLightMode={isLightMode}
              isEn={isEn}
            />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-400">{stats.active}</p>
          <p className="text-[10px] text-emerald-500/80">
            {isEn ? 'Full SLA coverage' : 'پوشش کامل خدمات'}
          </p>
        </div>

        {/* Expiring Soon */}
        <div
          className={`p-4 rounded-2xl border space-y-1.5 ${
            isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              {isEn ? 'Expiring Soon' : 'در آستانه انقضا'}
            </span>
            <FieldInfoTooltip
              title={isEn ? 'Expiring Soon' : 'قراردادهای نزدیک سررسید'}
              infoWhatEn="Contracts ending within 45 days requiring renewal or budget extension."
              infoWhatFa="قراردادهایی که کمتر از ۴۵ روز به سررسید آنها مانده و نیاز به تمدید دارند."
              infoWhyEn="Highlights urgent renewals to prevent service interruption."
              infoWhyFa="هشدار فوری جهت جلوگیری از قطعی اینترنت یا پایان تعهدات گارانتی."
              infoExampleEn="Renewal in progress"
              infoExampleFa="نیاز به استعلام و تمدید فوری"
              isLightMode={isLightMode}
              isEn={isEn}
            />
          </div>
          <p className="text-2xl font-bold font-mono text-amber-400">{stats.expiringSoon}</p>
          <p className="text-[10px] text-amber-500/80">
            {isEn ? 'Action required (< 45d)' : 'نیازمند اقدام تمدید'}
          </p>
        </div>

        {/* Expired / In Renewal */}
        <div
          className={`p-4 rounded-2xl border space-y-1.5 ${
            isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
              {isEn ? 'Expired / Lapsed' : 'منقضی یا خاتمه‌یافته'}
            </span>
            <FieldInfoTooltip
              title={isEn ? 'Expired Contracts' : 'قراردادهای منقضی'}
              infoWhatEn="Agreements whose term has ended without recorded renewal."
              infoWhatFa="قراردادهایی که موعد آنها سپری شده و هنوز تمدید نشده‌اند."
              infoWhyEn="Identifies uncovered hardware exposed to replacement costs."
              infoWhyFa="شناسایی ریسک سخت‌افزارهای بدون گارانتی و پیگیری حقوقی."
              infoExampleEn="Expired support"
              infoExampleFa="خارج از پوشش خدمات رسمی"
              isLightMode={isLightMode}
              isEn={isEn}
            />
          </div>
          <p className="text-2xl font-bold font-mono text-rose-400">
            {stats.expired + stats.inRenewal}
          </p>
          <p className="text-[10px] text-rose-500/80">
            {isEn ? 'No active SLA' : 'فاقد پوشش پشتیبانی'}
          </p>
        </div>

        {/* Total Financial Commitment */}
        <div
          className={`col-span-2 lg:col-span-1 p-4 rounded-2xl border space-y-1.5 ${
            isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
              {isEn ? 'Financial Portfolio' : 'ارزش کل تعهدات'}
            </span>
            <FieldInfoTooltip
              title={isEn ? 'Total Contract Commitments' : 'مجموع بار مالی قراردادها'}
              infoWhatEn="Total monetary commitment across registered vendor contracts."
              infoWhatFa="مجموع ارزش ریالی و ارزی کلیه قراردادهای ثبت‌شده سازمان."
              infoWhyEn="Provides executive visibility into recurring infrastructure costs."
              infoWhyFa="ارائه گزارش دقیق به مدیریت ارشد از هزینه‌های نگهداری دیتاسنتر و خطوط."
              infoExampleEn="Total annual IT commitment"
              infoExampleFa="کل بودجه سالانه پشتیبانی"
              isLightMode={isLightMode}
              isEn={isEn}
            />
          </div>
          <p className="text-base sm:text-lg font-bold font-mono text-indigo-300 truncate">
            {stats.totalCostIrr > 0
              ? `${(stats.totalCostIrr / 1000000).toLocaleString()} M IRR`
              : stats.totalCostUsd > 0
              ? `$${stats.totalCostUsd.toLocaleString()}`
              : '0'}
          </p>
          <p className="text-[10px] text-slate-500">
            {isEn ? 'Annual commitment' : 'ارزش تعهدات سالانه'}
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div
        className={`p-3.5 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-3 ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        {/* Search Input */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 left-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isEn
                ? 'Search contracts, vendors, contacts, owner, number...'
                : 'جستجو در موضوع قرارداد، شماره، نام شرکت، رابط یا مالک...'
            }
            className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-800 focus:border-indigo-500'
                : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-indigo-500'
            }`}
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          {/* Type Filter */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto min-w-0 flex-1 sm:flex-initial">
            <span className="text-xs text-slate-400 hidden sm:inline">
              {isEn ? 'Category:' : 'نوع:'}
            </span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={`w-full sm:w-auto max-w-full min-w-0 flex-1 px-3 py-2 text-xs rounded-xl border focus:outline-none ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-800'
                  : 'bg-slate-950 border-slate-800 text-slate-200'
              }`}
            >
              <option value="all">{isEn ? 'All Categories' : 'همه دسته‌ها'}</option>
              <option value="sla_support">{isEn ? 'SLA & 24/7 Support' : 'پشتیبانی فنی و SLA'}</option>
              <option value="hardware_warranty">{isEn ? 'Hardware Warranty' : 'گارانتی و قطعات RMA'}</option>
              <option value="internet_isp">{isEn ? 'Dedicated ISP Bandwidth' : 'پهنای باند اینترنت ISP'}</option>
              <option value="datacenter_colocation">{isEn ? 'Datacenter Colocation' : 'کولوکیشن دیتاسنتر'}</option>
              <option value="software_maintenance">{isEn ? 'Software Maintenance' : 'نگهداری نرم‌افزار'}</option>
              <option value="hardware_purchase">{isEn ? 'Hardware Purchase' : 'خرید تجهیزات'}</option>
              <option value="consulting">{isEn ? 'Technical Consulting' : 'مشاوره و نظارت'}</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto min-w-0 flex-1 sm:flex-initial">
            <span className="text-xs text-slate-400 hidden sm:inline">
              {isEn ? 'Status:' : 'وضعیت:'}
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`w-full sm:w-auto max-w-full min-w-0 flex-1 px-3 py-2 text-xs rounded-xl border focus:outline-none ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-800'
                  : 'bg-slate-950 border-slate-800 text-slate-200'
              }`}
            >
              <option value="all">{isEn ? 'All Statuses' : 'همه وضعیت‌ها'}</option>
              <option value="active">{isEn ? 'Active & Valid' : 'معتبر و فعال'}</option>
              <option value="inactive">{isEn ? 'Inactive (Paused)' : 'غیرفعال (متوقف)'}</option>
              <option value="expiring_soon">{isEn ? 'Expiring Soon' : 'نزدیک انقضا'}</option>
              <option value="expired">{isEn ? 'Expired' : 'منقضی شده'}</option>
              <option value="in_renewal">{isEn ? 'In Renewal' : 'در حال تمدید'}</option>
              <option value="terminated">{isEn ? 'Terminated' : 'خاتمه‌یافته'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Contracts Data Table */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-xs text-slate-400">
              {isEn ? 'Retrieving vendor contracts and SLAs...' : 'در حال بارگذاری قراردادها و توافق‌نامه‌های SLA...'}
            </p>
          </div>
        ) : filteredContracts.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-center space-y-3">
            <div className="p-4 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <ScrollText className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-200">
                {isEn ? 'No Contracts Found' : 'هیچ قراردادی یافت نشد'}
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                {searchQuery || typeFilter !== 'all' || statusFilter !== 'all'
                  ? isEn
                    ? 'No contracts match your search and filter criteria.'
                    : 'هیچ قراردادی با فیلترهای انتخابی مطابقت ندارد.'
                  : isEn
                  ? 'No vendor agreements registered yet. Click "New Contract" to add hardware warranties, ISP links, and support contracts.'
                  : 'هنوز قراردادی ثبت نشده است. با زدن دکمه «ثبت قرارداد جدید» اولین قرارداد سازمان را تعریف فرمایید.'}
              </p>
            </div>
            {canAdd && (
              <button
                type="button"
                onClick={() => {
                  setEditingContract(null);
                  setIsModalOpen(true);
                }}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                <span>{isEn ? 'Register New Contract' : 'ثبت قرارداد جدید'}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" dir={isEn ? 'ltr' : 'rtl'}>
              <thead>
                <tr
                  className={`text-[11px] font-bold uppercase tracking-wider border-b ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-500'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <th className="px-4 py-3">{isEn ? 'Contract / Scope' : 'شماره و موضوع قرارداد'}</th>
                  <th className="px-4 py-3">{isEn ? 'Category' : 'دسته‌بندی'}</th>
                  <th className="px-4 py-3">{isEn ? 'Vendor / Partner' : 'شرکت طرف قرارداد'}</th>
                  <th className="px-4 py-3">{isEn ? 'Owner / Dept' : 'مسئول / واحد'}</th>
                  <th className="px-4 py-3">{isEn ? 'Validity / Countdown' : 'اعتبار و روزشمار'}</th>
                  <th className="px-4 py-3">{isEn ? 'Financials' : 'مبلغ و شرایط'}</th>
                  <th className="px-4 py-3">{isEn ? 'Alerts & Files' : 'هشدارها و پیوست‌ها'}</th>
                  <th className="px-4 py-3 text-right">{isEn ? 'Actions' : 'عملیات'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-xs">
                {filteredContracts.map((contract) => {
                  const isInactive = contract.isActive === false || contract.status === 'inactive';
                  const daysLeft = getDaysLeft(contract.endDate, !isInactive);
                  const isExpired = !isInactive && (contract.status === 'expired' || (daysLeft !== null && daysLeft < 0));
                  const isExpiringSoon = !isInactive && (contract.status === 'expiring_soon' || (daysLeft !== null && daysLeft <= 45 && daysLeft >= 0));

                  return (
                    <tr
                      key={contract.id}
                      className={`transition-colors ${
                        isInactive
                          ? isLightMode
                            ? 'bg-slate-100/70 border-l-4 border-l-slate-400 opacity-70 hover:bg-slate-200/50 text-slate-500'
                            : 'bg-slate-900/40 border-l-4 border-l-slate-600 opacity-65 hover:bg-slate-800/40 text-slate-400'
                          : isLightMode
                          ? 'hover:bg-slate-50/80 divide-slate-100'
                          : 'hover:bg-slate-800/30'
                      }`}
                    >
                      {/* Contract / Scope */}
                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-bold ${isInactive ? 'text-slate-400' : 'text-slate-100'}`}>{contract.title}</span>
                            {isInactive && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-700/50 text-slate-300 border border-slate-600/60 flex items-center gap-1">
                                <PowerOff className="w-2.5 h-2.5" />
                                {isEn ? 'INACTIVE' : 'غیرفعال'}
                              </span>
                            )}
                            {contract.renewalCycle && contract.renewalCycle > 1 && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                {isEn ? `Cycle ${contract.renewalCycle}` : `دوره ${contract.renewalCycle}`}
                              </span>
                            )}
                            {contract.status === 'renewed' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                {isEn ? 'Renewed' : 'تمدید شده'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                            <span>{contract.contractNumber}</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(contract.contractNumber, `num-${contract.id}`)}
                              className="text-slate-500 hover:text-indigo-400 cursor-pointer"
                              title={isEn ? 'Copy number' : 'کپی شماره'}
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                            {copiedId === `num-${contract.id}` && (
                              <span className="text-[10px] text-emerald-400">
                                {isEn ? 'Copied!' : 'کپی شد'}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap ${
                          isInactive
                            ? 'bg-slate-800/40 text-slate-400 border border-slate-700/60'
                            : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                        }`}>
                          <ShieldCheck className="w-3 h-3" />
                          <span>{getContractTypeLabel(contract.contractType)}</span>
                        </span>
                      </td>

                      {/* Vendor / Partner */}
                      <td className="px-4 py-3.5">
                        <div className="space-y-0.5">
                          <p className={`font-semibold flex items-center gap-1 ${isInactive ? 'text-slate-400' : 'text-slate-200'}`}>
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            <span>{contract.vendorName}</span>
                          </p>
                          {contract.vendorContact && (
                            <p className="text-[11px] text-slate-400 truncate max-w-xs" title={contract.vendorContact}>
                              {contract.vendorContact}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Owner / Dept */}
                      <td className="px-4 py-3.5">
                        <div className="space-y-0.5">
                          <p className={`font-medium ${isInactive ? 'text-slate-400' : 'text-slate-200'}`}>{contract.ownerName || 'Admin'}</p>
                          <p className="text-[11px] text-slate-500">{contract.department || 'IT'}</p>
                        </div>
                      </td>

                      {/* Validity / Countdown */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="space-y-1">
                          <div className="text-[11px] text-slate-400 font-mono">
                            {contract.startDate} → {contract.endDate}
                          </div>
                          <div>
                            {isInactive ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700/80">
                                <PowerOff className="w-3 h-3 text-slate-400" />
                                <span>{isEn ? 'INACTIVE (PAUSED)' : 'غیرفعال (متوقف)'}</span>
                              </span>
                            ) : contract.status === 'renewed' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                <RotateCw className="w-3 h-3" />
                                <span>{isEn ? 'RENEWED' : 'تمدید شده'}</span>
                              </span>
                            ) : isExpired ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                <XCircle className="w-3 h-3" />
                                <span>{isEn ? 'EXPIRED' : 'منقضی شده'}</span>
                              </span>
                            ) : isExpiringSoon ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                <Clock className="w-3 h-3" />
                                <span>
                                  {daysLeft !== null
                                    ? isEn ? `${daysLeft} days left` : `${daysLeft} روز باقیمانده`
                                    : isEn ? 'Expiring' : 'نزدیک انقضا'}
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>
                                  {daysLeft !== null
                                    ? isEn ? `${daysLeft} days` : `${daysLeft} روز معتبر`
                                    : isEn ? 'ACTIVE' : 'فعال'}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Financials */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <p className={`font-mono font-bold ${isInactive ? 'text-slate-400' : 'text-slate-200'}`}>
                            {contract.totalCost
                              ? `${contract.totalCost.toLocaleString()} ${contract.currency}`
                              : isEn ? 'Included / Fixed' : 'توافقی / ثابت'}
                          </p>
                          {contract.paymentTerms && (
                            <p className="text-[11px] text-slate-400 truncate max-w-[140px]" title={contract.paymentTerms}>
                              {contract.paymentTerms}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Alerts & Attachments */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {/* Alert recipients badge - clickable button */}
                          <button
                            type="button"
                            onClick={() => {
                              setAlertModalItem(contract);
                              setIsAlertModalOpen(true);
                            }}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer group ${
                              isInactive
                                ? 'bg-slate-800/20 text-slate-500 border-slate-700/40 opacity-60'
                                : (contract.notifyEmails?.length || 0) + (contract.ownerEmail ? 1 : 0) > 0
                                ? 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border-sky-500/30 hover:border-sky-400'
                                : 'bg-slate-800/40 hover:bg-slate-800 text-slate-400 border-slate-700/60'
                            }`}
                            title={
                              isInactive
                                ? isEn ? 'Reminders paused (Inactive contract)' : 'یادآورها متوقف هستند (قرارداد غیرفعال)'
                                : isEn
                                ? `View ${(contract.notifyEmails?.length || 0) + (contract.ownerEmail ? 1 : 0)} alert recipients & schedule`
                                : `مشاهده ${(contract.notifyEmails?.length || 0) + (contract.ownerEmail ? 1 : 0)} گیرنده و زمان‌بندی هشدارها`
                            }
                          >
                            <Mail className={`w-3.5 h-3.5 ${isInactive ? 'text-slate-500' : 'text-sky-400 group-hover:scale-110'} transition-transform shrink-0`} />
                            <span>{(contract.notifyEmails?.length || 0) + (contract.ownerEmail ? 1 : 0)}</span>
                          </button>

                          {/* Attachments badge - clickable button to view and download all files */}
                          {contract.attachments && contract.attachments.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAttachmentsModalItem({
                                  title: contract.title,
                                  attachments: contract.attachments,
                                });
                                setIsAttachmentsModalOpen(true);
                              }}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-400 text-indigo-300 text-[11px] font-semibold transition-all cursor-pointer group"
                              title={
                                isEn
                                  ? `Click to view and download ${contract.attachments.length} attached files`
                                  : `کلیک برای مشاهده و دانلود ${contract.attachments.length} فایل پیوست`
                              }
                            >
                              <Paperclip className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform shrink-0" />
                              <span>{contract.attachments.length}</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-500 px-1 font-mono">-</span>
                          )}
                        </div>
                      </td>

                      {/* Actions: 3-Dots Menu Only */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center">
                          <button
                            type="button"
                            onClick={(e) => handleToggleActionMenu(e, contract)}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                              actionMenuAnchor?.id === contract.id
                                ? 'bg-indigo-600 text-white border-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.4)]'
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

      {/* Contract Add/Edit/Renew Modal */}
      <ContractModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingContract(null);
        }}
        contract={editingContract}
        mode={modalMode}
        isLightMode={isLightMode}
        isEn={isEn}
        canDeleteAttachments={canDeleteAttachments}
        onSaved={() => {
          loadContracts(true);
          showToast(
            isEn
              ? modalMode === 'renew'
                ? 'Contract renewed successfully.'
                : editingContract
                ? 'Contract updated successfully.'
                : 'New contract registered successfully.'
              : modalMode === 'renew'
              ? 'تمدید قرارداد با موفقیت انجام شد.'
              : editingContract
              ? 'اطلاعات قرارداد با موفقیت به‌روزرسانی شد.'
              : 'قرارداد جدید با موفقیت ثبت گردید.',
            'success'
          );
        }}
      />

      {/* Embedded In-Browser PDF/Document Preview Modal */}
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

      {/* Renewal & Version History Chain Modal */}
      <RenewalHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => {
          setIsHistoryModalOpen(false);
          setHistoryContract(null);
        }}
        type="contract"
        item={historyContract}
        isLightMode={isLightMode}
        isEn={isEn}
        onPreviewAttachment={handlePreviewAttachment}
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
        itemType="contract"
        ownerEmail={alertModalItem?.ownerEmail}
        ownerName={alertModalItem?.ownerName}
        department={alertModalItem?.department}
        notifyEmails={alertModalItem?.notifyEmails}
        alertDays={alertModalItem?.alertDays || [60, 30, 15, 7, 1]}
        endDate={alertModalItem?.endDate}
        isLightMode={isLightMode}
        isEn={isEn}
        isSendingTest={testingContractId === alertModalItem?.id}
        onSendTestAlert={async () => {
          if (alertModalItem) {
            await handleTestAlert(alertModalItem);
          }
        }}
      />

      {/* Delete Confirmation Modal */}
      {contractToDelete && (
        <div
          className="fixed top-0 left-0 right-0 bottom-8 z-[999995] p-4 bg-black/80 backdrop-blur-sm flex items-center justify-center"
          dir={isEn ? 'ltr' : 'rtl'}
        >
          <div
            className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-4 ${
              isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold">
                  {isEn ? 'Confirm Contract Deletion' : 'تایید حذف قرارداد'}
                </h3>
                <p className="text-xs text-slate-400">
                  {isEn ? 'This action will delete the agreement and all attachments.' : 'این عملیات غیرقابل بازگشت است.'}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {isEn
                ? `Are you sure you want to permanently remove contract "${contractToDelete.title}" (${contractToDelete.contractNumber})?`
                : `آیا از حذف دائم قرارداد «${contractToDelete.title}» با شناسه «${contractToDelete.contractNumber}» اطمینان دارید؟`}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setContractToDelete(null)}
                disabled={isDeleting}
                className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                  isLightMode ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                onClick={handleDeleteContract}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeleting
                  ? isEn ? 'Deleting...' : 'در حال حذف...'
                  : isEn ? 'Delete Permanently' : 'حذف قطعی قرارداد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Contract Confirmation Modal */}
      {deactivatingContract && (
        <div
          className="fixed top-0 left-0 right-0 bottom-8 z-[999995] p-4 bg-black/80 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-150"
          onClick={() => !isDeactivatingLoading && setDeactivatingContract(null)}
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
                  {isEn ? 'Confirm Contract Deactivation' : 'تایید غیرفعال‌سازی قرارداد'}
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {isEn ? (
                    <>
                      Are you sure you want to deactivate contract{' '}
                      <span className="font-semibold text-slate-200">"{deactivatingContract.title}"</span>?
                      Deactivating will pause the expiration countdown and suspend all scheduled email alerts.
                    </>
                  ) : (
                    <>
                      آیا از غیرفعال‌سازی قرارداد{' '}
                      <span className="font-semibold text-slate-200">«{deactivatingContract.title}»</span>{' '}
                      اطمینان دارید؟ با این کار، روزشمار انقضا متوقف شده و ارسال کلیه هشدارهای ایمیلی سررسید به حالت تعلیق درمی‌آید.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeactivatingContract(null)}
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
                <span>{isEn ? 'Deactivate Contract' : 'غیرفعال‌سازی قرارداد'}</span>
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
                disabled={testingContractId === actionMenuAnchor.item.id}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                  isLightMode ? 'hover:bg-amber-50 text-amber-700' : 'hover:bg-amber-500/15 text-amber-300'
                }`}
              >
                {testingContractId === actionMenuAnchor.item.id ? (
                  <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
                <span>{isEn ? 'Send Test Alert' : 'ارسال ایمیل هشدار آزمایشی'}</span>
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
                      setDeactivatingContract(item);
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
                      <span>{isEn ? 'Activate Contract' : 'فعال‌سازی قرارداد'}</span>
                    </>
                  ) : (
                    <>
                      <PowerOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{isEn ? 'Deactivate Contract' : 'غیرفعال‌سازی قرارداد'}</span>
                    </>
                  )}
                </button>
              )}

              {/* Renew Button */}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingContract(actionMenuAnchor.item);
                    setModalMode('renew');
                    setIsModalOpen(true);
                    setActionMenuAnchor(null);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                    isLightMode ? 'hover:bg-cyan-50 text-cyan-700' : 'hover:bg-cyan-500/15 text-cyan-300'
                  }`}
                >
                  <RotateCw className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>{isEn ? 'Renew Contract' : 'تمدید قرارداد (دوره جدید)'}</span>
                </button>
              )}

              {/* History Chain Button */}
              <button
                type="button"
                onClick={() => {
                  setHistoryContract(actionMenuAnchor.item);
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
                    setEditingContract(actionMenuAnchor.item);
                    setModalMode('edit');
                    setIsModalOpen(true);
                    setActionMenuAnchor(null);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                    isLightMode ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{isEn ? 'Edit Contract' : 'ویرایش قرارداد'}</span>
                </button>
              )}

              {/* Delete Button */}
              {canDelete && (
                <div className={`pt-1 mt-0.5 border-t ${isLightMode ? 'border-slate-200' : 'border-slate-800'}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setContractToDelete(actionMenuAnchor.item);
                      setActionMenuAnchor(null);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                      isLightMode ? 'hover:bg-rose-50 text-rose-600' : 'hover:bg-rose-500/15 text-rose-400'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>{isEn ? 'Delete Contract' : 'حذف قرارداد'}</span>
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
