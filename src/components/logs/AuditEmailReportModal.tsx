import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Mail,
  Send,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  Calendar,
  Layers,
  Filter,
  Eye,
  Code2,
  Sliders,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Terminal,
  Check,
  X,
  Plus,
  Trash2,
  ExternalLink,
  Sparkles,
  Info,
  Maximize2,
  Minimize2,
  Minus,
  FileSpreadsheet,
  Server
} from 'lucide-react';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { useLanguage } from '../../i18n/LanguageContext';
import { useModalDock } from '../../context/ModalDockContext';
import {
  AuditReportScheduleConfig,
  AuditLogCategory,
  AuditReportPreviewResult,
  AuditReportSendResult,
  PortalAuditLogEntry,
  DeviceCommandLogEntry
} from '../../types';
import {
  fetchAuditReportConfigApi,
  saveAuditReportConfigApi,
  saveAuditEmailReportApi,
  previewAuditReportApi,
  sendAuditReportNowApi
} from '../../services/api';

interface AuditEmailReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  portalLogs: PortalAuditLogEntry[];
  commandLogs: DeviceCommandLogEntry[];
  isLightMode?: boolean;
  reportToEdit?: AuditReportScheduleConfig | null;
  onReportSaved?: (savedReport: AuditReportScheduleConfig) => void;
  initialMode?: 'config' | 'preview';
}

const ALL_PORTAL_CATEGORIES: { id: AuditLogCategory; labelEn: string; labelFa: string; color: string; descEn: string; descFa: string }[] = [
  {
    id: 'user_management',
    labelEn: 'User Management',
    labelFa: 'مدیریت کاربران و هویت',
    color: '#3b82f6',
    descEn: 'Account creation, role assignment, password resets, logins',
    descFa: 'ایجاد حساب کاربری، تخصیص نقش، بازنشانی رمز و ورود به سامانه'
  },
  {
    id: 'rbac_policy',
    labelEn: 'RBAC & Policies',
    labelFa: 'خط‌مشی‌ها و سطوح دسترسی',
    color: '#8b5cf6',
    descEn: 'Access control modifications, target scope definitions',
    descFa: 'تغییرات سطوح دسترسی و محدوده‌های تجهیزات مجاز'
  },
  {
    id: 'device_inventory',
    labelEn: 'Device Inventory',
    labelFa: 'تجهیزات و دارایی‌های شبکه',
    color: '#06b6d4',
    descEn: 'Adding, modifying, decommissioning network assets & switches',
    descFa: 'ثبت، ویرایش و اسقاط تجهیزات شبکه و سوئیچ‌ها'
  },
  {
    id: 'backup_recovery',
    labelEn: 'Backup & Recovery',
    labelFa: 'پشتیبان‌گیری و بازیابی',
    color: '#10b981',
    descEn: 'Automated disaster recovery backups, snapshots, exports',
    descFa: 'پشتیبان‌گیری اضطراری، استخراج پکیج و بازیابی'
  },
  {
    id: 'topology_network',
    labelEn: 'Topology & Network',
    labelFa: 'نقشه و توپولوژی شبکه',
    color: '#f59e0b',
    descEn: 'CDP/LLDP discovery changes, diagram node coordinate relocations',
    descFa: 'کشف همسایگی، تغییر موقعیت گره‌ها و لایه‌های شماتیک'
  },
  {
    id: 'port_interface',
    labelEn: 'Port & Interfaces',
    labelFa: 'پورت‌ها و اینترفیس‌ها',
    color: '#ec4899',
    descEn: 'VLAN membership reallocations, port enable/shutdown, PoE state',
    descFa: 'تغییر وضعیت پورت، ترانک، اکسس و تخصیص VLAN'
  },
  {
    id: 'system_auth',
    labelEn: 'System & Security',
    labelFa: 'امنیت و احراز هویت سیستم',
    color: '#6366f1',
    descEn: 'Security perimeter alerts, TLS certificate validations, Active Directory',
    descFa: 'هشدارهای امنیتی، اعتبارسنجی سرتیفیکیت و اکتیو دایرکتوری'
  },
];

export const AuditEmailReportModal: React.FC<AuditEmailReportModalProps> = ({
  isOpen,
  onClose,
  portalLogs,
  commandLogs,
  isLightMode = false,
  reportToEdit = null,
  onReportSaved,
  initialMode = 'config',
}) => {
  const { isEn, isRtl } = useLanguage();
  const { dockModal } = useModalDock();

  // Window states
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'preview'>(initialMode);

  // Form Config state
  const [config, setConfig] = useState<AuditReportScheduleConfig>({
    enabled: false,
    recipients: [],
    frequency: 'daily',
    timeOfDay: '08:00',
    dayOfWeek: 1,
    dayOfMonth: 1,
    reportTitle: 'NetTopology Enterprise Audit & Activity Report',
    selectedCategories: [
      'user_management',
      'rbac_policy',
      'device_inventory',
      'backup_recovery',
      'topology_network',
      'port_interface',
      'system_auth',
    ],
    includeCommands: true,
    minSeverity: 'all',
    statusFilter: 'all',
    timeframeHours: 24,
    attachCsv: false,
  });

  // SMTP Status state
  const [smtpConfigured, setSmtpConfigured] = useState<boolean>(false);
  const [smtpFrom, setSmtpFrom] = useState<string>('');
  const [smtpHost, setSmtpHost] = useState<string>('');
  const [smtpPort, setSmtpPort] = useState<number>(587);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingNow, setIsSendingNow] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [recipientInput, setRecipientInput] = useState('');
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    details?: string;
  } | null>(null);

  // Preview state
  const [previewData, setPreviewData] = useState<AuditReportPreviewResult | null>(null);
  const [previewDeviceMode, setPreviewDeviceMode] = useState<'desktop' | 'mobile'>('desktop');

  // Load config from backend
  const loadConfig = async () => {
    setIsLoading(true);
    setStatusFeedback(null);
    try {
      if (reportToEdit) {
        setConfig({
          ...reportToEdit,
          recipients: Array.isArray(reportToEdit.recipients) ? reportToEdit.recipients : [],
          selectedCategories: Array.isArray(reportToEdit.selectedCategories)
            ? reportToEdit.selectedCategories
            : [
                'user_management',
                'rbac_policy',
                'device_inventory',
                'backup_recovery',
                'topology_network',
                'port_interface',
                'system_auth',
              ],
        });
      } else {
        setConfig({
          id: '',
          enabled: true,
          recipients: [],
          frequency: 'daily',
          timeOfDay: '08:00',
          dayOfWeek: 1,
          dayOfMonth: 1,
          reportTitle: isEn ? 'Enterprise Audit & Security Summary' : 'خلاصه ممیزی و امنیت سازمانی شبکه',
          selectedCategories: [
            'user_management',
            'rbac_policy',
            'device_inventory',
            'backup_recovery',
            'topology_network',
            'port_interface',
            'system_auth',
          ],
          includeCommands: true,
          minSeverity: 'all',
          statusFilter: 'all',
          timeframeHours: 24,
          attachCsv: false,
        });
      }

      const res = await fetchAuditReportConfigApi();
      setSmtpConfigured(Boolean(res.smtpConfigured));
      setSmtpFrom(res.smtpFrom || '');
      setSmtpHost(res.smtpHost || '');
      setSmtpPort(res.smtpPort || 587);

      if (initialMode === 'preview') {
        setActiveTab('preview');
        setTimeout(() => {
          handleGeneratePreview();
        }, 150);
      } else {
        setActiveTab('config');
      }
    } catch (err: any) {
      console.warn('Failed to load audit report schedule configuration:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen, reportToEdit]);

  // Handle minimization to dock
  const handleMinimize = () => {
    dockModal({
      id: 'audit-email-report-modal',
      labelEn: 'Audit Email Reports',
      labelFa: 'گزارش‌گیری ایمیل ممیزی',
      category: 'system',
      onRestore: () => {},
      onClose,
    });
    onClose();
  };

  // Add recipient
  const handleAddRecipient = () => {
    const raw = recipientInput.trim();
    if (!raw) return;

    // Support comma or whitespace separated values
    const parts = raw.split(/[\s,;]+/).map((p) => p.trim()).filter((p) => p.length > 3 && p.includes('@'));
    if (parts.length === 0) {
      setStatusFeedback({
        type: 'error',
        message: isEn ? 'Please enter a valid email address.' : 'لطفاً یک آدرس ایمیل معتبر وارد نمایید.',
      });
      return;
    }

    const current = config.recipients || [];
    const newRecipients = Array.from(new Set([...current, ...parts]));
    setConfig({ ...config, recipients: newRecipients });
    setRecipientInput('');
    setStatusFeedback(null);
  };

  // Remove recipient
  const handleRemoveRecipient = (emailToRemove: string) => {
    const updated = (config.recipients || []).filter((e) => e !== emailToRemove);
    setConfig({ ...config, recipients: updated });
  };

  // Toggle Category
  const handleToggleCategory = (catId: AuditLogCategory) => {
    const current = config.selectedCategories || [];
    let updated: AuditLogCategory[];
    if (current.includes(catId)) {
      if (current.length === 1) {
        setStatusFeedback({
          type: 'error',
          message: isEn ? 'At least one category must be selected.' : 'حداقل یک دسته‌بندی باید انتخاب شده باشد.',
        });
        return;
      }
      updated = current.filter((c) => c !== catId);
    } else {
      updated = [...current, catId];
    }
    setConfig({ ...config, selectedCategories: updated });
    setStatusFeedback(null);
  };

  // Select all or clear categories
  const handleSelectAllCategories = () => {
    setConfig({
      ...config,
      selectedCategories: ALL_PORTAL_CATEGORIES.map((c) => c.id),
    });
  };

  // Save Config
  const handleSaveConfig = async () => {
    setIsSaving(true);
    setStatusFeedback(null);
    try {
      const res = await saveAuditEmailReportApi(config);
      setConfig(res.report);
      onReportSaved?.(res.report);
      setStatusFeedback({
        type: 'success',
        message: isEn
          ? res.message || 'Audit report saved successfully in database.'
          : res.message_fa || 'تنظیمات گزارش ایمیل با موفقیت در پایگاه داده ذخیره شد.',
      });
    } catch (err: any) {
      setStatusFeedback({
        type: 'error',
        message: err.message || (isEn ? 'Failed to save settings.' : 'خطا در ذخیره‌سازی تنظیمات.'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Generate Preview
  const handleGeneratePreview = async () => {
    setIsPreviewLoading(true);
    setStatusFeedback(null);
    try {
      const res = await previewAuditReportApi({
        config,
        portalLogs,
        commandLogs,
        isEn,
      });
      setPreviewData(res);
      setActiveTab('preview');
    } catch (err: any) {
      setStatusFeedback({
        type: 'error',
        message: err.message || (isEn ? 'Failed to generate preview.' : 'خطا در تولید پیش‌نمایش گزارش.'),
      });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // Send Report Now (Immediate dispatch)
  const handleSendNow = async () => {
    if (!config.recipients || config.recipients.length === 0) {
      setStatusFeedback({
        type: 'error',
        message: isEn
          ? 'Please add at least one recipient email address before sending.'
          : 'لطفاً ابتدا حداقل یک آدرس ایمیل گیرنده اضافه نمایید.',
      });
      return;
    }

    if (!smtpConfigured) {
      setStatusFeedback({
        type: 'error',
        message: isEn
          ? 'SMTP connection parameters are not configured. Please configure them in Settings > Email.'
          : 'پارامترهای اتصال سرور SMTP تنظیم نشده است. لطفاً ابتدا در بخش تنظیمات > ایمیل، اطلاعات را ثبت کنید.',
      });
      return;
    }

    setIsSendingNow(true);
    setStatusFeedback({
      type: 'info',
      message: isEn
        ? `Dispatching live audit report to ${config.recipients.join(', ')} via SMTP...`
        : `در حال ارسال زنده گزارش ممیزی به ${config.recipients.join(', ')} از طریق سرور SMTP...`,
    });

    try {
      const res: AuditReportSendResult = await sendAuditReportNowApi({
        config,
        portalLogs,
        commandLogs,
        isEn,
      });

      if (res.success) {
        setStatusFeedback({
          type: 'success',
          message: isEn
            ? `Report successfully sent to ${res.recipients.length} recipients in ${res.latencyMs}ms! (${res.totalLogs} events included)`
            : `گزارش با موفقیت به ${res.recipients.length} گیرنده در ${res.latencyMs} میلی‌ثانیه ارسال شد! (${res.totalLogs} رویداد گنجانده شد)`,
          details: res.messageId ? `Message ID: ${res.messageId}` : undefined,
        });
      } else {
        setStatusFeedback({
          type: 'error',
          message: isEn ? (res.error || 'Failed to dispatch email') : (res.error_fa || res.error || 'خطا در ارسال ایمیل'),
        });
      }
    } catch (err: any) {
      setStatusFeedback({
        type: 'error',
        message: err.message || (isEn ? 'An unexpected network error occurred while sending.' : 'خطای شبکه در هنگام ارسال رخ داد.'),
      });
    } finally {
      setIsSendingNow(false);
    }
  };

  if (!isOpen) return null;

  const modalNode = (
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[999990] flex flex-col items-center justify-center transition-all duration-200 ${
        isMaximized ? 'p-0' : 'p-3 sm:p-6 bg-black/75 backdrop-blur-sm'
      }`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div
        className={`flex flex-col transition-all duration-200 overflow-hidden ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-5xl max-h-[92vh] rounded-2xl border shadow-2xl'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isLightMode
              ? 'bg-white border-slate-200'
              : 'bg-slate-900/90 border-slate-800/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">
                  {reportToEdit
                    ? isEn
                      ? `Edit Email Report: ${config.reportTitle || reportToEdit.id || ''}`
                      : `ویرایش گزارش ایمیل: ${config.reportTitle || reportToEdit.id || ''}`
                    : isEn
                    ? 'Create New Audit Email Report'
                    : 'ایجاد گزارش ایمیل جدید ممیزی و وقایع'}
                </h2>
                {config.enabled ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {isEn ? 'Scheduled Active' : 'زمان‌بندی فعال'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
                    {isEn ? 'Manual Only' : 'ارسال دستی'}
                  </span>
                )}
              </div>
              <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Configure periodic scheduled email delivery or trigger instant dispatch using corporate SMTP credentials'
                  : 'پیکربندی زمان‌بندی دوره‌ای یا ارسال فوری گزارش وقایع و دستورات با استفاده از اکانت SMTP تعریف‌شده'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View Switcher Tabs */}
            <div className={`flex items-center p-1 rounded-lg border ${isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
              <button
                type="button"
                onClick={() => setActiveTab('config')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === 'config'
                    ? isLightMode
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'bg-indigo-600 text-white'
                    : isLightMode
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{isEn ? 'Schedule & Filters' : 'تنظیمات و فیلترها'}</span>
              </button>
              <button
                type="button"
                onClick={handleGeneratePreview}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === 'preview'
                    ? isLightMode
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'bg-indigo-600 text-white'
                    : isLightMode
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{isEn ? 'Email Preview' : 'پیش‌نمایش قالب ایمیل'}</span>
              </button>
            </div>

            {/* Universal Modal Header Controls */}
            <ModalHeaderControls
              onClose={onClose}
              onMinimize={handleMinimize}
              onMaximizeToggle={() => setIsMaximized(!isMaximized)}
              isMaximized={isMaximized}
              isLightMode={isLightMode}
              isEn={isEn}
            />
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* SMTP Status Banner */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
              smtpConfigured
                ? isLightMode
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                  : 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                : isLightMode
                ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                : 'bg-amber-950/20 border-amber-800/40 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  smtpConfigured
                    ? isLightMode ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-900/40 text-emerald-400'
                    : isLightMode ? 'bg-amber-100 text-amber-700' : 'bg-amber-900/40 text-amber-400'
                }`}
              >
                {smtpConfigured ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">
                    {smtpConfigured
                      ? isEn ? 'Corporate SMTP Gateway Connected' : 'درگاه ایمیل سازمانی SMTP متصل است'
                      : isEn ? 'SMTP Gateway Parameters Not Configured' : 'اطلاعات درگاه SMTP ثبت نشده است'}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-black/10">
                    {smtpConfigured ? `${smtpHost}:${smtpPort}` : isEn ? 'No Host' : 'بدون سرور'}
                  </span>
                </div>
                <p className="text-xs opacity-80 mt-0.5">
                  {smtpConfigured
                    ? isEn
                      ? `Dispatches will originate from "${smtpFrom || 'configured sender'}". Using SMTP parameters from Settings > Email.`
                      : `گزارشات با فرستنده «${smtpFrom || 'فرستنده تعریف‌شده'}» ارسال خواهند شد. با مشخصات ثبت‌شده در تنظیمات > ایمیل.`
                    : isEn
                    ? 'Please configure your mail server settings in SMTP Connection & Account Parameters first to enable sending.'
                    : 'جهت امکان ارسال ایمیل، ابتدا مشخصات سرور را در بخش مشخصات سرور و حساب کاربری ایمیل تنظیم نمایید.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <div className="text-xs text-slate-400">
                <FieldInfoTooltip
                  title={isEn ? 'SMTP Connection Parameters' : 'مشخصات اتصال SMTP'}
                  whatIsIt={isEn ? 'Live SMTP relay credentials configured under Server Settings.' : 'اعتبارنامه‌های اتصال میل‌سرور که در بخش تنظیمات سرور ثبت شده است.'}
                  whyNeeded={isEn ? 'Required to transmit outbound alert and audit emails over encrypted TLS/SSL to mailboxes.' : 'برای ارسال ایمیل‌های امن گزارشات و هشدارها به میل‌باکس مدیران از طریق پروتکل TLS الزامی است.'}
                  example={isEn ? 'smtp.company.com:587 (TLS)' : 'mail.company.local:465 (SSL)'}
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
            </div>
          </div>

          {/* Feedback Toast Banner */}
          {statusFeedback && (
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
                statusFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : statusFeedback.type === 'error'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
              }`}
            >
              {statusFeedback.type === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />}
              {statusFeedback.type === 'error' && <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
              {statusFeedback.type === 'info' && <RefreshCw className="w-5 h-5 shrink-0 mt-0.5 animate-spin" />}
              <div className="flex-1 text-sm">
                <div className="font-semibold">{statusFeedback.message}</div>
                {statusFeedback.details && (
                  <div className="text-xs font-mono opacity-80 mt-1">{statusFeedback.details}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setStatusFeedback(null)}
                className="opacity-70 hover:opacity-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {activeTab === 'config' ? (
            /* ================= CONFIGURATION & SCHEDULE TAB ================= */
            <div className="space-y-6">
              {/* Row 1: Automated Schedule & Recipients */}
              <div
                className={`p-5 rounded-xl border ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/40">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-indigo-400" />
                    <h3 className="font-bold text-base">
                      {isEn ? 'Automated Scheduling & Dispatch Frequency' : 'زمان‌بندی خودکار و تناوب ارسال گزارشات'}
                    </h3>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enabled}
                        onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                      <span className="ml-3 text-sm font-semibold select-none">
                        {config.enabled ? (isEn ? 'Enabled' : 'فعال') : (isEn ? 'Disabled' : 'غیرفعال')}
                      </span>
                    </label>

                    <FieldInfoTooltip
                      title={isEn ? 'Automated Scheduled Delivery' : 'ارسال خودکار زمان‌بندی‌شده'}
                      whatIsIt={isEn ? 'Autonomous background daemon that evaluates logs and delivers periodic email reports.' : 'سرویس پس‌زمینه خودکار که در سررسیدهای مقرر گزارشات را به ایمیل‌های مقصد ارسال می‌کند.'}
                      whyNeeded={isEn ? 'Keeps management and security auditors regularly updated without manual export effort.' : 'مدیران و ناظران امنیت شبکه را بدون نیاز به لاگین دستی در جریان وقایع قرار می‌دهد.'}
                      example={isEn ? 'Daily at 08:00 AM' : 'روزانه رأس ساعت ۰۸:۰۰ صبح'}
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                  {/* Frequency */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      {isEn ? 'Frequency' : 'تناوب تکرار'}
                    </label>
                    <select
                      value={config.frequency}
                      onChange={(e) => setConfig({ ...config, frequency: e.target.value as any })}
                      className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-800 text-slate-100'
                      }`}
                    >
                      <option value="hourly">{isEn ? 'Hourly (Every 1 Hour)' : 'ساعتی (هر ۱ ساعت)'}</option>
                      <option value="daily">{isEn ? 'Daily (Once a Day)' : 'روزانه (یک‌بار در روز)'}</option>
                      <option value="weekly">{isEn ? 'Weekly (Once a Week)' : 'هفتگی (یک‌بار در هفته)'}</option>
                      <option value="monthly">{isEn ? 'Monthly (Once a Month)' : 'ماهانه (یک‌بار در ماه)'}</option>
                    </select>
                  </div>

                  {/* Execution Time */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      {isEn ? 'Dispatch Time (24h)' : 'ساعت ارسال (۲۴ ساعته)'}
                    </label>
                    <input
                      type="time"
                      value={config.timeOfDay}
                      onChange={(e) => setConfig({ ...config, timeOfDay: e.target.value })}
                      className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-800 text-slate-100'
                      }`}
                    />
                  </div>

                  {/* Timeframe Scope */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      {isEn ? 'Audit Window (Hours)' : 'بازه زمانی پوشش وقایع'}
                    </label>
                    <select
                      value={config.timeframeHours}
                      onChange={(e) => setConfig({ ...config, timeframeHours: Number(e.target.value) })}
                      className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-800 text-slate-100'
                      }`}
                    >
                      <option value={1}>{isEn ? 'Last 1 Hour' : '۱ ساعت اخیر'}</option>
                      <option value={6}>{isEn ? 'Last 6 Hours' : '۶ ساعت اخیر'}</option>
                      <option value={12}>{isEn ? 'Last 12 Hours' : '۱۲ ساعت اخیر'}</option>
                      <option value={24}>{isEn ? 'Last 24 Hours (Recommended for Daily)' : '۲۴ ساعت گذشته (پیشنهادی روزانه)'}</option>
                      <option value={168}>{isEn ? 'Last 7 Days (Recommended for Weekly)' : '۷ روز گذشته (پیشنهادی هفتگی)'}</option>
                      <option value={720}>{isEn ? 'Last 30 Days (Recommended for Monthly)' : '۳۰ روز گذشته (پیشنهادی ماهانه)'}</option>
                      <option value={0}>{isEn ? 'All Historical Logs' : 'تمامی وقایع تاریخچه'}</option>
                    </select>
                  </div>
                </div>

                {/* Recipients Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {isEn ? 'Recipient Email Addresses' : 'ایمیل‌های دریافت‌کننده گزارش'}
                    </label>
                    <span className="text-xs text-slate-500">
                      {config.recipients?.length || 0} {isEn ? 'recipients added' : 'گیرنده افزوده شده'}
                    </span>
                  </div>

                  {/* Add Input */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="relative flex-1">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      <input
                        type="text"
                        value={recipientInput}
                        onChange={(e) => setRecipientInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddRecipient();
                          }
                        }}
                        placeholder={
                          isEn
                            ? 'Enter email (e.g. security@company.com, admin@domain.org) and press Add'
                            : 'ایمیل را وارد کنید (مانند security@company.com) و دکمه افزودن را بزنید'
                        }
                        className={`w-full pl-9 pr-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-800'
                            : 'bg-slate-950 border-slate-800 text-slate-100'
                        }`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddRecipient}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer transition-colors shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{isEn ? 'Add' : 'افزودن'}</span>
                    </button>
                  </div>

                  {/* Chips List */}
                  <div className="flex flex-wrap gap-2 min-h-[38px] p-2 rounded-lg border border-dashed border-slate-800/80 bg-slate-950/40">
                    {config.recipients && config.recipients.length > 0 ? (
                      config.recipients.map((email) => (
                        <span
                          key={email}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                        >
                          <span>{email}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveRecipient(email)}
                            className="hover:text-rose-400 cursor-pointer transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500 italic p-1">
                        {isEn
                          ? 'No recipient email configured yet. Type an email address above to add.'
                          : 'هنوز آدرس ایمیلی تعریف نشده است. آدرس گیرنده را در کادر بالا وارد نمایید.'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 2: Category Filter Selection */}
              <div
                className={`p-5 rounded-xl border ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/40">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-cyan-400" />
                    <h3 className="font-bold text-base">
                      {isEn ? 'Audit Scope & Category Inclusions' : 'دسته‌بندی‌های وقایع و محدوده گزارش'}
                    </h3>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSelectAllCategories}
                      className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer"
                    >
                      {isEn ? 'Select All Categories' : 'انتخاب همه دسته‌ها'}
                    </button>

                    <FieldInfoTooltip
                      title={isEn ? 'Audit Categories' : 'دسته‌بندی‌های وقایع'}
                      whatIsIt={isEn ? 'Functional modules generating events (User Management, Device Inventory, RBAC, etc.).' : 'ماژول‌های ساختاریافته نرم‌افزار که رویدادها را تولید می‌کنند.'}
                      whyNeeded={isEn ? 'Allows narrowing reports strictly to security, device modifications, or comprehensive audit trails.' : 'امکان اختصاص گزارش صرفاً به وقایع امنیتی، تغییرات تجهیزات یا گزارش کامل را فراهم می‌سازد.'}
                      example={isEn ? 'User Management + RBAC Policies' : 'مدیریت کاربران + خط‌مشی‌ها'}
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                </div>

                {/* Category Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
                  {ALL_PORTAL_CATEGORIES.map((cat) => {
                    const isSelected = (config.selectedCategories || []).includes(cat.id);
                    return (
                      <div
                        key={cat.id}
                        onClick={() => handleToggleCategory(cat.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-3 select-none ${
                          isSelected
                            ? isLightMode
                              ? 'bg-indigo-50 border-indigo-300 text-slate-900'
                              : 'bg-indigo-950/20 border-indigo-500/40 text-slate-100'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 opacity-60 hover:opacity-100'
                            : 'bg-slate-950/40 border-slate-800 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 border ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-slate-600'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="font-semibold text-xs truncate">
                              {isEn ? cat.labelEn : cat.labelFa}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                            {isEn ? cat.descEn : cat.descFa}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Terminal Commands & Advanced Filters */}
                <div className="pt-4 border-t border-slate-800/40 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Include Commands Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950/40">
                    <div>
                      <div className="flex items-center gap-1.5 font-semibold text-xs">
                        <Terminal className="w-4 h-4 text-rose-400" />
                        <span>{isEn ? 'CLI Terminal Commands' : 'دستورات کنسول و ترمینال'}</span>
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {isEn ? 'Include Cisco, MikroTik & Linux commands' : 'شامل دستورات مستقیم اجراشده در تجهیزات'}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.includeCommands}
                      onChange={(e) => setConfig({ ...config, includeCommands: e.target.checked })}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 cursor-pointer"
                    />
                  </div>

                  {/* Minimum Severity */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      {isEn ? 'Minimum Severity Filter' : 'حداقل سطح شدت رویداد'}
                    </label>
                    <select
                      value={config.minSeverity}
                      onChange={(e) => setConfig({ ...config, minSeverity: e.target.value as any })}
                      className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-800 text-slate-100'
                      }`}
                    >
                      <option value="all">{isEn ? 'All Severities (Info, Notice, Warning, Critical)' : 'تمام سطوح (عادی، اطلاع، هشدار، بحرانی)'}</option>
                      <option value="notice">{isEn ? 'Notice and Above (Exclude Info)' : 'اطلاع به بالا (حذف لاگ‌های عادی)'}</option>
                      <option value="warning">{isEn ? 'Warning & Critical Only' : 'فقط هشدار و بحرانی'}</option>
                      <option value="critical">{isEn ? 'Critical Security Events Only' : 'فقط رویدادهای بحرانی و امنیتی'}</option>
                    </select>
                  </div>

                  {/* Status Filter */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      {isEn ? 'Execution Status Filter' : 'فیلتر وضعیت اجرا'}
                    </label>
                    <select
                      value={config.statusFilter}
                      onChange={(e) => setConfig({ ...config, statusFilter: e.target.value as any })}
                      className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-800 text-slate-100'
                      }`}
                    >
                      <option value="all">{isEn ? 'All Statuses (Success, Failed, Denied)' : 'تمام وضعیت‌ها (موفق، ناموفق، رد شده)'}</option>
                      <option value="failed_only">{isEn ? 'Failures & Denials Only' : 'فقط خطاها و عملیات ناموفق'}</option>
                      <option value="success_and_failed">{isEn ? 'Success & Failed' : 'عملیات موفق و ناموفق'}</option>
                    </select>
                  </div>
                </div>

                {/* CSV Attachment Option */}
                <div className="mt-4 pt-3 border-t border-slate-800/40 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-semibold">
                      {isEn ? 'Attach Detailed CSV Spreadsheet File to Email' : 'پیوست فایل اکسل/CSV تفصیلی در ایمیل'}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {isEn ? '(Useful for cold storage and spreadsheet analysis)' : '(مناسب برای آرشیو و بررسی آفلاین)'}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.attachCsv}
                    onChange={(e) => setConfig({ ...config, attachCsv: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* ================= LIVE HTML PREVIEW TAB ================= */
            <div className="space-y-4">
              {/* Preview Toolbar */}
              <div
                className={`p-3 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <span>{isEn ? 'View Mode:' : 'حالت نمایش:'}</span>
                    <button
                      type="button"
                      onClick={() => setPreviewDeviceMode('desktop')}
                      className={`px-2.5 py-1 rounded text-xs cursor-pointer ${
                        previewDeviceMode === 'desktop'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {isEn ? 'Desktop' : 'دسکتاپ'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDeviceMode('mobile')}
                      className={`px-2.5 py-1 rounded text-xs cursor-pointer ${
                        previewDeviceMode === 'mobile'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {isEn ? 'Mobile' : 'موبایل'}
                    </button>
                  </div>

                  {previewData?.summary && (
                    <div className="text-xs text-slate-400 flex items-center gap-3 border-l border-slate-700 pl-3">
                      <span>
                        {isEn ? 'Total Events:' : 'کل رویدادها:'}{' '}
                        <strong className="text-white">{previewData.summary.totalEvents}</strong>
                      </span>
                      <span>
                        {isEn ? 'Critical:' : 'بحرانی:'}{' '}
                        <strong className="text-rose-400">{previewData.summary.criticalCount}</strong>
                      </span>
                      <span>
                        {isEn ? 'Warnings:' : 'هشدار:'}{' '}
                        <strong className="text-amber-400">{previewData.summary.warningCount}</strong>
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGeneratePreview}
                    disabled={isPreviewLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700 hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPreviewLoading ? 'animate-spin' : ''}`} />
                    <span>{isEn ? 'Refresh Preview' : 'تازه‌سازی پیش‌نمایش'}</span>
                  </button>
                </div>
              </div>

              {/* Subject Bar */}
              {previewData?.subject && (
                <div
                  className={`px-4 py-2.5 rounded-lg border text-xs font-mono flex items-center gap-2 ${
                    isLightMode ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  <span className="font-semibold text-slate-500">{isEn ? 'Email Subject:' : 'موضوع ایمیل:'}</span>
                  <span className="text-indigo-400 font-bold">{previewData.subject}</span>
                </div>
              )}

              {/* Rendered HTML Container */}
              <div
                className={`rounded-xl border overflow-hidden transition-all duration-200 mx-auto ${
                  previewDeviceMode === 'mobile' ? 'max-w-[420px]' : 'w-full'
                } ${isLightMode ? 'bg-slate-900 border-slate-200 shadow-lg' : 'bg-slate-950 border-slate-800'}`}
              >
                {isPreviewLoading ? (
                  <div className="p-16 flex flex-col items-center justify-center text-slate-400">
                    <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
                    <span>{isEn ? 'Compiling report and rendering template...' : 'در حال تولید و رندر قالب گزارش...'}</span>
                  </div>
                ) : previewData?.html ? (
                  <iframe
                    title="Audit Report Preview"
                    srcDoc={previewData.html}
                    className="w-full h-[520px] border-0"
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <div className="p-16 text-center text-slate-500">
                    <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <span>{isEn ? 'Click "Refresh Preview" to generate report mockup' : 'جهت مشاهده، دکمه تازه‌سازی پیش‌نمایش را بزنید'}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-t shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span>{isEn ? 'Last Dispatched:' : 'آخرین ارسال:'}</span>
            <span className="font-mono text-slate-400">
              {config.lastSentAt
                ? new Date(config.lastSentAt).toLocaleString()
                : isEn ? 'Never' : 'هرگز'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Preview Button */}
            {activeTab === 'config' && (
              <button
                type="button"
                onClick={handleGeneratePreview}
                disabled={isPreviewLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer transition-colors ${
                  isLightMode
                    ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                    : 'border-slate-700 hover:bg-slate-800 text-slate-200'
                }`}
              >
                <Eye className="w-4 h-4 text-cyan-400" />
                <span>{isEn ? 'Preview Template' : 'پیش‌نمایش قالب'}</span>
              </button>
            )}

            {/* Save Settings */}
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={isSaving}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer transition-colors ${
                isLightMode
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                  : 'border-indigo-600/50 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/60'
              }`}
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{isEn ? 'Save Schedule' : 'ذخیره تنظیمات'}</span>
            </button>

            {/* Send Report Now (Immediate Action) */}
            <button
              type="button"
              onClick={handleSendNow}
              disabled={isSendingNow || !smtpConfigured}
              title={
                !smtpConfigured
                  ? isEn ? 'SMTP credentials not configured in Email Settings' : 'مشخصات SMTP در تنظیمات ایمیل ست نشده است'
                  : undefined
              }
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white shadow-lg cursor-pointer transition-all ${
                !smtpConfigured
                  ? 'bg-slate-700 opacity-60 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/20'
              }`}
            >
              {isSendingNow ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isEn ? 'Dispatching...' : 'در حال ارسال...'}</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{isEn ? 'Send Report Now' : 'ارسال آنی گزارش (Send Now)'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
};
