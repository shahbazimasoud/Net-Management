import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  KeyRound,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Save,
  Calendar,
  DollarSign,
  Mail,
  User,
  Building2,
  Server,
  FileText,
  Upload,
  Download,
  Trash2,
  Plus,
  AlertCircle,
  Clock,
  Paperclip,
  CheckCircle2,
  ShieldCheck,
  Tag,
  RotateCw
} from 'lucide-react';
import {
  LicenseItem,
  LicenseDeviceType,
  LicenseStatus,
  AttachmentFile,
  Device
} from '../../types';
import { createLicenseApi, updateLicenseApi, renewLicenseApi, uploadContractAttachmentApi } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { useModalDock } from '../../context/ModalDockContext';

interface LicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  license?: LicenseItem | null;
  mode?: 'create' | 'edit' | 'renew';
  devices: Device[];
  isLightMode?: boolean;
  isEn?: boolean;
  onSaved: (license: LicenseItem) => void;
}

export const LicenseModal: React.FC<LicenseModalProps> = ({
  isOpen,
  onClose,
  license,
  mode = 'edit',
  devices,
  isLightMode = false,
  isEn = true,
  onSaved,
}) => {
  const { dockModal } = useModalDock();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [deviceType, setDeviceType] = useState<LicenseDeviceType>('switch');
  const [vendor, setVendor] = useState('Cisco');
  const [connectedDeviceId, setConnectedDeviceId] = useState<string>('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [cost, setCost] = useState<number>(0);
  const [currency, setCurrency] = useState<'USD' | 'EUR' | 'IRR' | 'AED'>('USD');
  const [paymentMethod, setPaymentMethod] = useState<'one-time' | 'monthly' | 'annual' | 'biennial'>('annual');
  const [alertDays, setAlertDays] = useState<number[]>([30, 15, 7, 0]);
  const [customDayInput, setCustomDayInput] = useState('');
  const [notifyEmails, setNotifyEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [notes, setNotes] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state when editing an existing license or opening a new one
  useEffect(() => {
    if (mode === 'renew' && license) {
      const nextCycle = (license.renewalCycle || 1) + 1;
      setTitle(
        isEn
          ? `${license.title} (Cycle ${nextCycle})`
          : `${license.title} (دوره تمدید ${nextCycle})`
      );
      setLicenseKey(license.licenseKey || '');
      setDeviceType(license.deviceType || 'switch');
      setVendor(license.vendor || 'Cisco');
      setConnectedDeviceId(license.connectedDeviceId || '');
      setOwnerName(license.ownerName || '');
      setOwnerEmail(license.ownerEmail || '');
      setDepartment(license.department || '');
      // Calculate start date = 1 day after previous end date
      let nextStart = '';
      try {
        const d = new Date(license.endDate);
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() + 1);
          nextStart = d.toISOString().split('T')[0];
        }
      } catch {}
      if (!nextStart) nextStart = new Date().toISOString().split('T')[0];
      setStartDate(nextStart);

      // Default end date = 1 year later
      let nextEnd = '';
      try {
        const d = new Date(nextStart);
        d.setFullYear(d.getFullYear() + 1);
        nextEnd = d.toISOString().split('T')[0];
      } catch {
        nextEnd = nextStart;
      }
      setEndDate(nextEnd);

      setCost(license.cost || 0);
      setCurrency((license.currency as any) || 'USD');
      setPaymentMethod((license.paymentMethod as any) || 'annual');
      setAlertDays(license.alertDays?.length ? license.alertDays : [30, 15, 7, 0]);
      setNotifyEmails(license.notifyEmails || []);
      setAttachments([]); // New fresh documents for this renewal cycle
      setNotes(
        isEn
          ? `Renewed from preceding cycle (${license.startDate} to ${license.endDate})`
          : `تمدید شده از لایسنس دوره قبل (${license.startDate} الی ${license.endDate})`
      );
    } else if (license) {
      setTitle(license.title || '');
      setLicenseKey(license.licenseKey || '');
      setDeviceType(license.deviceType || 'switch');
      setVendor(license.vendor || 'Cisco');
      setConnectedDeviceId(license.connectedDeviceId || '');
      setOwnerName(license.ownerName || '');
      setOwnerEmail(license.ownerEmail || '');
      setDepartment(license.department || '');
      setStartDate(license.startDate || '');
      setEndDate(license.endDate || '');
      setCost(license.cost || 0);
      setCurrency((license.currency as any) || 'USD');
      setPaymentMethod((license.paymentMethod as any) || 'annual');
      setAlertDays(license.alertDays?.length ? license.alertDays : [30, 15, 7, 0]);
      setNotifyEmails(license.notifyEmails || []);
      setAttachments(license.attachments || []);
      setNotes(license.notes || '');
    } else {
      // Default initial values for new license
      setTitle('');
      setLicenseKey('');
      setDeviceType('switch');
      setVendor('Cisco');
      setConnectedDeviceId('');
      setOwnerName('');
      setOwnerEmail('');
      setDepartment('');
      const today = new Date().toISOString().split('T')[0];
      setStartDate(today);
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      setEndDate(nextYear.toISOString().split('T')[0]);
      setCost(0);
      setCurrency('USD');
      setPaymentMethod('annual');
      setAlertDays([30, 15, 7, 0]);
      setNotifyEmails([]);
      setAttachments([]);
      setNotes('');
    }
    setErrorMessage(null);
    setIsMinimized(false);
  }, [license, isOpen, mode, isEn]);

  // Universal minimization handler into ToolsDock
  const handleMinimize = () => {
    dockModal({
      id: `license-modal-${license?.id || 'new'}`,
      labelEn: license ? `License: ${license.title}` : 'New License Modal',
      labelFa: license ? `لایسنس: ${license.title}` : 'فرم ثبت لایسنس جدید',
      badge: 'Lic',
      category: 'config',
      onRestore: () => setIsMinimized(false),
      onClose: () => {
        setIsMinimized(false);
        onClose();
      },
    });
    setIsMinimized(true);
  };

  if (!isOpen || isMinimized) return null;

  // Add / remove notification milestone days
  const handleAddCustomDay = () => {
    const day = parseInt(customDayInput.trim(), 10);
    if (!isNaN(day) && day >= 0 && !alertDays.includes(day)) {
      setAlertDays((prev) => [...prev, day].sort((a, b) => b - a));
      setCustomDayInput('');
    }
  };

  const handleRemoveDay = (dayToRemove: number) => {
    setAlertDays((prev) => prev.filter((d) => d !== dayToRemove));
  };

  const handleTogglePresetDay = (presetDay: number) => {
    if (alertDays.includes(presetDay)) {
      handleRemoveDay(presetDay);
    } else {
      setAlertDays((prev) => [...prev, presetDay].sort((a, b) => b - a));
    }
  };

  // Add / remove recipient emails
  const handleAddEmail = () => {
    const email = emailInput.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && emailRegex.test(email) && !notifyEmails.includes(email)) {
      setNotifyEmails((prev) => [...prev, email]);
      setEmailInput('');
    }
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setNotifyEmails((prev) => prev.filter((e) => e !== emailToRemove));
  };

  // Multi-file attachment handler
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const newAttachments: AttachmentFile[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Read as base64 first
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
        });
        reader.readAsDataURL(file);
        const dataUrl = await base64Promise;

        try {
          const res = await uploadContractAttachmentApi({
            fileName: file.name,
            fileType: file.type || 'application/octet-stream',
            dataBase64: dataUrl,
          });
          if (res.attachment) {
            newAttachments.push({
              ...res.attachment,
              dataBase64: res.attachment.dataBase64 || dataUrl,
            });
          }
        } catch {
          // If server upload route had an issue, fallback to inline base64 attachment
          newAttachments.push({
            id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type || 'application/octet-stream',
            downloadUrl: dataUrl,
            uploadDate: new Date().toISOString(),
          });
        }
      }

      setAttachments((prev) => [...prev, ...newAttachments]);
    } catch (err: any) {
      setErrorMessage(
        isEn
          ? `File upload failed: ${err.message || 'Unknown error'}`
          : `خطا در بارگذاری فایل: ${err.message || 'خطای ناشناخته'}`
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAttachment = (attId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  // Calculate status based on endDate
  const calculateCurrentStatus = (end: string): LicenseStatus => {
    if (!end) return 'active';
    const now = new Date();
    const expiry = new Date(end);
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'expired';
    if (diffDays <= 30) return 'expiring_soon';
    return 'active';
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage(isEn ? 'License Title is required.' : 'عنوان لایسنس الزامی است.');
      return;
    }
    if (!licenseKey.trim()) {
      setErrorMessage(isEn ? 'License Key / Serial is required.' : 'کد یا سریال لایسنس الزامی است.');
      return;
    }
    if (!endDate) {
      setErrorMessage(isEn ? 'Expiration Date is required.' : 'تاریخ پایان و انقضای لایسنس الزامی است.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const calculatedStatus = calculateCurrentStatus(endDate);

    const licensePayload: Partial<LicenseItem> = {
      title: title.trim(),
      licenseKey: licenseKey.trim(),
      deviceType,
      vendor: vendor.trim(),
      connectedDeviceId: connectedDeviceId || undefined,
      ownerName: ownerName.trim(),
      ownerEmail: ownerEmail.trim(),
      department: department.trim(),
      startDate,
      endDate,
      cost: Number(cost) || 0,
      currency,
      paymentMethod,
      alertDays,
      notifyEmails,
      attachments,
      notes: notes.trim(),
      status: calculatedStatus,
    };

    try {
      if (mode === 'renew' && license?.id) {
        const res = await renewLicenseApi(license.id, licensePayload);
        onSaved(res.license);
      } else if (license?.id && mode !== 'renew') {
        const res = await updateLicenseApi(license.id, licensePayload);
        onSaved(res.license);
      } else {
        const res = await createLicenseApi(licensePayload);
        onSaved(res.license);
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(
        isEn
          ? `Failed to save license: ${err.message || 'Check network connection'}`
          : `خطا در ذخیره‌سازی لایسنس: ${err.message || 'اتصال شبکه را بررسی کنید'}`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className={
        isMaximized
          ? 'fixed top-0 left-0 right-0 bottom-8 z-[999990] p-0 flex flex-col'
          : 'fixed top-0 left-0 right-0 bottom-8 z-[999990] p-2 sm:p-4 bg-black/80 backdrop-blur-sm flex items-center justify-center'
      }
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col transition-all duration-200 shadow-2xl ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-4xl max-h-[88vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-300 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                {mode === 'renew'
                  ? isEn
                    ? `Renew License: ${license?.title || ''}`
                    : `تمدید لایسنس: ${license?.title || ''}`
                  : license
                  ? isEn
                    ? `Edit License: ${license.title}`
                    : `ویرایش لایسنس: ${license.title}`
                  : isEn
                  ? 'Register New Software / Equipment License'
                  : 'ثبت و تعریف لایسنس جدید نرم‌افزار / سخت‌افزار'}
              </h2>
              <p className="text-xs text-slate-400">
                {mode === 'renew'
                  ? isEn
                    ? 'Creates the next license cycle, linking it to the historical chain'
                    : 'ایجاد دوره بعدی لایسنس و اتصال به زنجیره سوابق تاریخی'
                  : isEn
                  ? 'Manage vendor licenses, expiry alerts, costs, and documentation'
                  : 'مدیریت لایسنس‌های سازمانی، هشدارهای انقضا، هزینه‌ها و مستندات پیوست'}
              </p>
            </div>
          </div>

          {/* Triad Header Controls (Minimize, Fullscreen, Close) */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleMinimize}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-600'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-300'
              }`}
              title={isEn ? 'Minimize to ToolsDock' : 'مینیمایز به نوار ابزار پایین'}
            >
              <Minus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-600'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-300'
              }`}
              title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام‌صفحه') : isEn ? 'Fullscreen' : 'تمام‌صفحه'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-rose-100 text-slate-600 hover:text-rose-600'
                  : 'hover:bg-rose-950/40 text-slate-400 hover:text-rose-400'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body / Scrollable Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-6">
          {errorMessage && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {mode === 'renew' && license && (
            <div
              className={`p-4 rounded-xl border flex items-center gap-3 ${
                isLightMode ? 'bg-cyan-50 border-cyan-300 text-cyan-900' : 'bg-cyan-950/40 border-cyan-800 text-cyan-200'
              }`}
            >
              <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 shrink-0">
                <RotateCw className="w-5 h-5 animate-pulse" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold">
                  {isEn
                    ? `Renewal Cycle ${(license.renewalCycle || 1) + 1} for ${license.title}`
                    : `دوره تمدید ${(license.renewalCycle || 1) + 1} برای ${license.title}`}
                </h4>
                <p className="text-xs opacity-85 mt-0.5">
                  {isEn
                    ? `The preceding cycle (${license.startDate} to ${license.endDate}) will be marked as 'Renewed' in audit history, while this new cycle becomes active.`
                    : `دوره قبلی (${license.startDate} تا ${license.endDate}) با وضعیت «تمدیدشده» در سوابق نگهداری می‌شود و این دوره جدید فعال خواهد شد.`}
                </p>
              </div>
            </div>
          )}

          {/* Section 1: Basic Identity & Keys */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-violet-400" />
              {isEn ? '1. Identification & Vendor Details' : '۱. مشخصات هویتی و تامین‌کننده'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Title */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    {isEn ? 'License Title / Name' : 'عنوان یا نام لایسنس'}
                    <span className="text-rose-400">*</span>
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'License Title' : 'عنوان لایسنس'}
                    infoWhatEn="Descriptive name of the software, feature tier, or equipment license."
                    infoWhatFa="نام شفاف و تفکیک‌پذیر برای لایسنس نرم‌افزار، ماژول یا سخت‌افزار مورد نظر."
                    infoWhyEn="Identifies the asset across telemetry dashboards, reports, and email alerts."
                    infoWhyFa="جهت شناسایی آسان در داشبوردها، گزارش‌های دوره‌ای و هشدارهای خودکار ایمیلی."
                    infoExampleEn="Cisco DNA Advantage 24P, FortiGate UTP 1-Year, VMware vSphere Standard"
                    infoExampleFa="Cisco DNA Advantage 24P یا FortiGuard UTP Bundle"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={isEn ? 'e.g., Cisco DNA Advantage 24-Port' : 'مثال: لایسنس سیسکو DNA ادونتیج'}
                  required
                  className={`w-full px-3 py-2 text-sm rounded-xl border transition-colors outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-violet-500 text-slate-800'
                      : 'bg-slate-900 border-slate-800 focus:border-violet-500 text-slate-100'
                  }`}
                />
              </div>

              {/* Vendor */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    {isEn ? 'Vendor / Manufacturer' : 'تامین‌کننده / کمپانی سازنده'}
                    <span className="text-rose-400">*</span>
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Vendor / Brand' : 'برند تامین‌کننده'}
                    infoWhatEn="Manufacturer, software publisher, or service provider issuing the license."
                    infoWhatFa="شرکت سازنده یا توزیع‌کننده لایسنس یا خدمات پشتیبانی."
                    infoWhyEn="Categorizes licenses and ensures correct vendor warranty alignment."
                    infoWhyFa="تفکیک بر اساس برند جهت پیگیری تمدید و گارانتی تجهیزات."
                    infoExampleEn="Cisco, MikroTik, Fortinet, Microsoft, VMware, RedHat, HPE"
                    infoExampleFa="Cisco, MikroTik, Fortinet, VMware, Microsoft"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="text"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder={isEn ? 'e.g., Cisco, Fortinet, Microsoft' : 'مثال: Cisco یا MikroTik'}
                  required
                  className={`w-full px-3 py-2 text-sm rounded-xl border transition-colors outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-violet-500 text-slate-800'
                      : 'bg-slate-900 border-slate-800 focus:border-violet-500 text-slate-100'
                  }`}
                />
              </div>

              {/* License Key */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    {isEn ? 'License Key / Serial / Certificate ID' : 'کد لایسنس / شماره سریال / شناسه فعال‌سازی'}
                    <span className="text-rose-400">*</span>
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'License Key' : 'شناسه لایسنس'}
                    infoWhatEn="Serial number, PAC code, subscription token, or license key string."
                    infoWhatFa="کد فعال‌سازی، سریال، شناسه قرارداد یا کلید لایسنس دیجیتال."
                    infoWhyEn="Necessary for verification with vendor TAC and reactivation during migrations."
                    infoWhyFa="ضروری جهت استعلام از پشتیبانی سازنده و فعال‌سازی مجدد در زمان بحران."
                    infoExampleEn="ABCD-1234-EFGH-5678, PAK-9923184-IOS, FC-10-00100-950-02-12"
                    infoExampleFa="ABCD-1234-EFGH-5678 یا PAK-9923184"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="text"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder={isEn ? 'e.g., PAK-9923184-IOS-XE' : 'مثال: PAK-9923184-IOS-XE'}
                  required
                  className={`w-full px-3 py-2 font-mono text-xs rounded-xl border transition-colors outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-violet-500 text-slate-800'
                      : 'bg-slate-900 border-slate-800 focus:border-violet-500 text-slate-100'
                  }`}
                />
              </div>

              {/* Device Type */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    {isEn ? 'Asset / Device Classification' : 'نوع دستگاه یا دارایی مرتبط'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Asset Type' : 'نوع تجهیز'}
                    infoWhatEn="Hardware or virtualization category this license attaches to."
                    infoWhatFa="طبقه‌بندی سخت‌افزاری یا مجازی دارایی هدف."
                    infoWhyEn="Allows granular filtering and telemetry mapping per equipment role."
                    infoWhyFa="فیلتر دقیق و پیوند با پایش وضعیت پورت‌ها و سرورها."
                    infoExampleEn="Switch, Firewall, Linux Server, Access Point"
                    infoExampleFa="سوئیچ، فایروال، سرور لینوکس، اکسس‌پوینت"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <select
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value as LicenseDeviceType)}
                  className={`w-full px-3 py-2 text-sm rounded-xl border transition-colors outline-none cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-violet-500 text-slate-800'
                      : 'bg-slate-900 border-slate-800 focus:border-violet-500 text-slate-100'
                  }`}
                >
                  <option value="switch">{isEn ? 'Network Switch' : 'سوئیچ شبکه'}</option>
                  <option value="router">{isEn ? 'Router / Gateway' : 'روتر / گیت‌وی'}</option>
                  <option value="firewall">{isEn ? 'Firewall / Security Appliance' : 'فایروال و تجهیز امنیتی'}</option>
                  <option value="linux_server">{isEn ? 'Linux Server' : 'سرور لینوکس'}</option>
                  <option value="windows_server">{isEn ? 'Windows Server' : 'سرور ویندوز'}</option>
                  <option value="virtual_machine">{isEn ? 'Virtual Machine / Hypervisor' : 'ماشین مجازی / مجازی‌ساز'}</option>
                  <option value="storage">{isEn ? 'SAN / NAS Storage' : 'استوریج و ذخیره‌ساز'}</option>
                  <option value="access_point">{isEn ? 'Wireless Access Point' : 'اکسس‌پوینت بی‌سیم'}</option>
                  <option value="other">{isEn ? 'Other / Miscellaneous' : 'سایر موارد'}</option>
                </select>
              </div>

              {/* Connected Device Selector */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    <Server className="w-3.5 h-3.5 text-cyan-400" />
                    {isEn ? 'Link to Registered Equipment (Optional)' : 'اتصال به دیوایس ثبت‌شده در پنل (اختیاری)'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Equipment Link' : 'پیوند به دیوایس'}
                    infoWhatEn="Links this license to an active node in your network inventory."
                    infoWhatFa="پیوند مستقیم لایسنس به سوئیچ، روتر یا سرور موجود در پنل."
                    infoWhyEn="Displays license expiry alerts directly in device status summaries."
                    infoWhyFa="نمایش مستقیم وضعیت لایسنس در پنجره جزئیات دیوایس."
                    infoExampleEn="ASH-Sul-S-CAM-2 (172.27.100.252)"
                    infoExampleFa="انتخاب از لیست سوئیچ‌ها و سرورهای پنل"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <select
                  value={connectedDeviceId}
                  onChange={(e) => setConnectedDeviceId(e.target.value)}
                  className={`w-full px-3 py-2 text-sm rounded-xl border transition-colors outline-none cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-violet-500 text-slate-800'
                      : 'bg-slate-900 border-slate-800 focus:border-violet-500 text-slate-100'
                  }`}
                >
                  <option value="">{isEn ? '-- Standalone License (No Device Attached) --' : '-- لایسنس مستقل (بدون اتصال به دیوایس) --'}</option>
                  {devices.map((dev) => (
                    <option key={dev.id} value={dev.id}>
                      {dev.name} ({dev.ip}) - {dev.model || dev.platform || dev.type}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Owner & Department */}
          <div className="space-y-4 pt-2 border-t border-slate-800/60">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-cyan-400" />
              {isEn ? '2. Ownership & Department' : '۲. مالکیت سازمانی و واحد تحویل‌گیرنده'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    {isEn ? 'Owner / Custodian Name' : 'نام مسئول / تحویل‌گیرنده'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Owner Name' : 'نام مسئول'}
                    infoWhatEn="The individual or lead engineer accountable for this license."
                    infoWhatFa="نام مهندس یا مسئولی که پیگیری و تحویل لایسنس بر عهده اوست."
                    infoWhyEn="Identifies the primary contact point during renewal or auditing."
                    infoWhyFa="مشخص شدن مخاطب اصلی برای پیگیری تمدید و حسابرسی داخلی."
                    infoExampleEn="Masoud Shahbazi, Reza Hosseini"
                    infoExampleFa="مسعود شهبازی یا علی رضایی"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder={isEn ? 'e.g., Network Admin' : 'مثال: ادمین شبکه'}
                  className={`w-full px-3 py-2 text-sm rounded-xl border transition-colors outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                      : 'bg-slate-900 border-slate-800 focus:border-cyan-500 text-slate-100'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    {isEn ? 'Owner Email' : 'ایمیل مسئول'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Owner Email' : 'ایمیل مسئول'}
                    infoWhatEn="Email address of the primary license custodian."
                    infoWhatFa="آدرس ایمیل فرد مسئول جهت دریافت نوتیفیکیشن‌های مستقیم."
                    infoWhyEn="Used by the automated alerting daemon to send expiration notices."
                    infoWhyFa="ارسال مستقیم هشدارهای دوره‌ای انقضا توسط سرویس پس‌زمینه پنل."
                    infoExampleEn="admin@nettopology.internal"
                    infoExampleFa="admin@company.com"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="admin@company.com"
                  className={`w-full px-3 py-2 text-sm rounded-xl border transition-colors outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                      : 'bg-slate-900 border-slate-800 focus:border-cyan-500 text-slate-100'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    {isEn ? 'Department / Cost Center' : 'واحد سازمانی / مرکز هزینه'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Department' : 'واحد سازمانی'}
                    infoWhatEn="Organizational unit or branch bearing this asset expense."
                    infoWhatFa="بخش، دپارتمان یا شعبه‌ای که هزینه لایسنس به آن اختصاص یافته است."
                    infoWhyEn="Facilitates budget breakdowns and department-level cost reporting."
                    infoWhyFa="تسهیل گزارش‌گیری مالی و تفکیک بودجه‌ای بین واحدهای شرکت."
                    infoExampleEn="IT Infrastructure, NOC, Security Operations, Logistics"
                    infoExampleFa="زیرساخت فناوری اطلاعات، NOC، انبار مرکزی"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder={isEn ? 'e.g., IT Infrastructure' : 'مثال: زیرساخت شبکه'}
                  className={`w-full px-3 py-2 text-sm rounded-xl border transition-colors outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-cyan-500 text-slate-800'
                      : 'bg-slate-900 border-slate-800 focus:border-cyan-500 text-slate-100'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Validity, Cost & Billing */}
          <div className="space-y-4 pt-2 border-t border-slate-800/60">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              {isEn ? '3. Validity Period & Financial Details' : '۳. دوره اعتبار زمانی و مشخصات مالی'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    {isEn ? 'Start Date' : 'تاریخ شروع'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Effective Start Date' : 'تاریخ شروع'}
                    infoWhatEn="Date when license became valid or was activated."
                    infoWhatFa="تاریخ فعال‌سازی اولیه یا شروع دوره گارانتی."
                    infoWhyEn="Calculates total utilization and amortization periods."
                    infoWhyFa="محاسبه دقیق طول دوره و زمان استهلاک سرمایه."
                    infoExampleEn="2026-01-01"
                    infoExampleFa="۱۴۰۴-۱۰-۱۱"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={`w-full px-3 py-2 text-sm rounded-xl border transition-colors outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-emerald-500 text-slate-800'
                      : 'bg-slate-900 border-slate-800 focus:border-emerald-500 text-slate-100'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    {isEn ? 'Expiration Date' : 'تاریخ انقضا'}
                    <span className="text-rose-400">*</span>
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Expiration Date' : 'تاریخ انقضا'}
                    infoWhatEn="The exact cutoff date when license entitlements cease."
                    infoWhatFa="تاریخ پایان دوره دسترسی یا انقضای سرویس لایسنس."
                    infoWhyEn="Drives countdown timers and triggers scheduled email alerts."
                    infoWhyFa="مبنای زمان‌بندی روزشمار و ارسال هشدارهای تمدید به مسئولان."
                    infoExampleEn="2027-01-01"
                    infoExampleFa="۱۴۰۵-۱۰-۱۱"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className={`w-full px-3 py-2 text-sm rounded-xl border transition-colors outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-emerald-500 text-slate-800'
                      : 'bg-slate-900 border-slate-800 focus:border-emerald-500 text-slate-100'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    {isEn ? 'Cost / Investment' : 'هزینه پرداختی'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Cost' : 'هزینه'}
                    infoWhatEn="Purchase or renewal price paid to the vendor or reseller."
                    infoWhatFa="مبلغ پرداختی بابت خرید یا تمدید لایسنس."
                    infoWhyEn="Aggregates IT asset investments across the entire enterprise."
                    infoWhyFa="تجمع کل سرمایه‌گذاری لایسنس‌های سازمان در کارت‌های آماری."
                    infoExampleEn="1250, 45000000"
                    infoExampleFa="۱۲۵۰ یا ۴۵۰۰۰۰۰۰"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={cost}
                  onChange={(e) => setCost(parseFloat(e.target.value) || 0)}
                  className={`w-full px-3 py-2 text-sm rounded-xl border transition-colors outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-emerald-500 text-slate-800'
                      : 'bg-slate-900 border-slate-800 focus:border-emerald-500 text-slate-100'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    {isEn ? 'Currency' : 'ارز پرداختی'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Currency' : 'واحد پول'}
                    infoWhatEn="Monetary unit used for purchasing this license."
                    infoWhatFa="واحد ارز معامله شده برای پرداخت فاکتور."
                    infoWhyEn="Ensures accurate financial auditing across international vendors."
                    infoWhyFa="نمایش دقیق واحد ارزی در گزارش‌های مالی و فاکتورها."
                    infoExampleEn="USD, EUR, IRR, AED"
                    infoExampleFa="دلار، یورو، ریال، درهم"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as any)}
                  className={`w-full px-3 py-2 text-sm rounded-xl border transition-colors outline-none cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-emerald-500 text-slate-800'
                      : 'bg-slate-900 border-slate-800 focus:border-emerald-500 text-slate-100'
                  }`}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="IRR">IRR (ریال)</option>
                  <option value="AED">AED (درهم)</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    {isEn ? 'Billing Cycle' : 'دوره تمدید'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Billing Cycle' : 'دوره پرداخت'}
                    infoWhatEn="Repetition cadence of license fees (annual, one-time, monthly)."
                    infoWhatFa="دوره تکرار یا پرداخت لایسنس (سالانه، یک‌باره، ماهانه)."
                    infoWhyEn="Helps finance and procurement plan ahead for recurring subscriptions."
                    infoWhyFa="برنامه‌ریزی مالی برای پرداخت‌های دوره‌ای و تمدید اشتراک."
                    infoExampleEn="Annual, Monthly, One-time (Perpetual)"
                    infoExampleFa="سالانه، ماهانه، دائمی"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className={`w-full px-3 py-2 text-sm rounded-xl border transition-colors outline-none cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-emerald-500 text-slate-800'
                      : 'bg-slate-900 border-slate-800 focus:border-emerald-500 text-slate-100'
                  }`}
                >
                  <option value="annual">{isEn ? 'Annual (Yearly)' : 'سالانه'}</option>
                  <option value="monthly">{isEn ? 'Monthly' : 'ماهانه'}</option>
                  <option value="biennial">{isEn ? 'Biennial (2 Years)' : 'دوسالانه'}</option>
                  <option value="one-time">{isEn ? 'One-time (Perpetual)' : 'یک‌باره (مادام‌العمر)'}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 4: Alert Thresholds & Milestone Custom Days */}
          <div className="space-y-4 pt-2 border-t border-slate-800/60">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                {isEn ? '4. Automated Alert Milestones (Days Before Expiry)' : '۴. نقاط عطف ارسال هشدار (چند روز مانده به پایان)'}
              </h3>
              <FieldInfoTooltip
                title={isEn ? 'Alert Milestones' : 'زمان‌بندی هشدار'}
                infoWhatEn="Multiple threshold days before expiration when email alerts will be fired."
                infoWhatFa="روزهای مشخص قبل از انقضا که ایمیل هشدار به صورت خودکار ارسال می‌شود."
                infoWhyEn="Gives NOC teams ample lead time (e.g. 60, 30, 20, 10, 0 days) to process renewals."
                infoWhyFa="امکان مشخص کردن چندین روز دلخواه (مثلاً ۱۰ روز، ۲۰ روز، روز پایان یا سفارشی)."
                infoExampleEn="60, 30, 20, 10, 0 (Day of expiry)"
                infoExampleFa="۶۰، ۳۰، ۲۰، ۱۰، ۰ (روز پایان)"
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>

            <p className="text-xs text-slate-400">
              {isEn
                ? 'Select preset milestone days or type a custom number of days to trigger proactive warnings before the license lapses.'
                : 'روزهای پیش‌فرض را انتخاب کنید یا تعداد روز دلخواه را تایپ کرده و اضافه نمایید تا قبل از اتمام لایسنس هشدار ایمیلی ارسال شود.'}
            </p>

            {/* Presets and Custom Input */}
            <div className="flex flex-wrap items-center gap-2">
              {[60, 45, 30, 20, 15, 10, 7, 3, 0].map((preset) => {
                const isActive = alertDays.includes(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleTogglePresetDay(preset)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                        : isLightMode
                        ? 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span>{preset === 0 ? (isEn ? 'Expiry Day (0d)' : 'روز انقضا (۰ روز)') : `${preset} ${isEn ? 'days' : 'روز'}`}</span>
                    {isActive ? '✓' : '+'}
                  </button>
                );
              })}

              {/* Custom day adder */}
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={customDayInput}
                  onChange={(e) => setCustomDayInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomDay();
                    }
                  }}
                  placeholder={isEn ? 'Custom days...' : 'روز دلخواه...'}
                  className={`w-28 px-2.5 py-1.5 text-xs rounded-xl border outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-amber-500 text-slate-800'
                      : 'bg-slate-900 border-slate-800 focus:border-amber-500 text-slate-100'
                  }`}
                />
                <button
                  type="button"
                  onClick={handleAddCustomDay}
                  className="px-2.5 py-1.5 text-xs rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-medium cursor-pointer"
                >
                  {isEn ? 'Add' : 'افزودن'}
                </button>
              </div>
            </div>

            {/* Active milestone tags */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-slate-400">{isEn ? 'Configured Alert Milestones:' : 'نقاط عطف فعال:'}</span>
              {alertDays.length === 0 ? (
                <span className="text-xs text-slate-400 italic">
                  {isEn ? 'None selected (alerts disabled)' : 'هیچ هشداری تنظیم نشده است'}
                </span>
              ) : (
                alertDays.map((day) => (
                  <span
                    key={day}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono"
                  >
                    {day === 0 ? (isEn ? 'Day of Expiry (0d)' : 'روز اتمام لایسنس') : `${day} ${isEn ? 'days before' : 'روز مانده'}`}
                    <button
                      type="button"
                      onClick={() => handleRemoveDay(day)}
                      className="hover:text-rose-400 cursor-pointer ml-1"
                      title={isEn ? 'Remove milestone' : 'حذف این موعد'}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Section 5: Multiple Notification Email Recipients */}
          <div className="space-y-4 pt-2 border-t border-slate-800/60">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-sky-400" />
                {isEn ? '5. Alert Email Recipients (Multiple Persons)' : '۵. گیرندگان ایمیل هشدار (چندین نفر / تیم‌ها)'}
              </h3>
              <FieldInfoTooltip
                title={isEn ? 'Alert Recipients' : 'گیرندگان ایمیل'}
                infoWhatEn="List of email addresses that will receive proactive alerts."
                infoWhatFa="فهرست ایمیل نفراتی که هشدارهای نزدیک شدن به اتمام لایسنس برایشان ارسال می‌شود."
                infoWhyEn="Ensures cross-departmental awareness (e.g. NOC lead, CTO, purchasing manager)."
                infoWhyFa="اطلاع‌رسانی همزمان به چندین مسئول مانند مدیر شبکه، خرید و سرپرست تیم."
                infoExampleEn="noc@company.com, cto@company.com, procurement@company.com"
                infoExampleFa="noc@company.com, purchase@company.com"
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>

            <p className="text-xs text-slate-400">
              {isEn
                ? 'Specify team members or distribution lists to notify when milestones trigger. Type email and press Enter or Add.'
                : 'آدرس ایمیل افراد یا لیست‌های توزیع را وارد کرده و Enter بزنید تا در مواعد مقرر ایمیل دریافت کنند.'}
            </p>

            <div className="flex items-center gap-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddEmail();
                  }
                }}
                placeholder={isEn ? 'e.g., engineer@company.com' : 'مثال: engineer@company.com'}
                className={`flex-1 px-3 py-2 text-sm rounded-xl border outline-none ${
                  isLightMode
                    ? 'bg-white border-slate-300 focus:border-sky-500 text-slate-800'
                    : 'bg-slate-900 border-slate-800 focus:border-sky-500 text-slate-100'
                }`}
              />
              <button
                type="button"
                onClick={handleAddEmail}
                className="px-4 py-2 text-sm font-medium rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 border border-sky-500/30 cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                {isEn ? 'Add Recipient' : 'افزودن ایمیل'}
              </button>
            </div>

            {/* Email tags */}
            <div className="flex flex-wrap items-center gap-2 min-h-8">
              {notifyEmails.length === 0 ? (
                <span className="text-xs text-slate-400 italic">
                  {isEn
                    ? 'No additional recipient emails configured (owner email will be used if set).'
                    : 'ایمیل اضافی ثبت نشده است (در صورت ثبت ایمیل مسئول، به او ارسال خواهد شد).'}
                </span>
              ) : (
                notifyEmails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 font-mono"
                  >
                    <Mail className="w-3 h-3 text-sky-400" />
                    <span>{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveEmail(email)}
                      className="hover:text-rose-400 cursor-pointer ml-1"
                      title={isEn ? 'Remove recipient' : 'حذف این ایمیل'}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Section 6: Multi-File Attachments (Upload / Download) */}
          <div className="space-y-4 pt-2 border-t border-slate-800/60">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
                {isEn ? '6. Document & Certificate Attachments (Multiple Files)' : '۶. اسناد و فایل‌های پیوست (آپلود و دانلود چندگانه)'}
              </h3>
              <FieldInfoTooltip
                title={isEn ? 'Attachments' : 'پیوست‌ها'}
                infoWhatEn="Attached vendor purchase orders, digital certificates (.lic, .pem), or contracts."
                infoWhatFa="پیوست فاکتور خرید، فایل لایسنس (.lic, .bin)، سرتیفیکیت دیجیتال و قرارداد سازنده."
                infoWhyEn="Keeps critical procurement proofs securely downloadable in one centralized place."
                infoWhyFa="دسترسی سریع و دانلود فایل‌های اصلی لایسنس در هنگام راه‌اندازی یا بحران."
                infoExampleEn="cisco_lic_2026.bin, fortinet_contract.pdf, vmware_keys.txt"
                infoExampleFa="cisco_lic.bin, invoice.pdf"
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>

            <p className="text-xs text-slate-400">
              {isEn
                ? 'Upload license files, vendor invoices, PAC certificates, or PDF agreements. All files can be directly downloaded.'
                : 'فایل‌های لایسنس، سرتیفیکیت‌ها، فاکتورها یا قراردادها را آپلود کنید. کلیه فایل‌ها قابلیت دانلود مستقیم دارند.'}
            </p>

            {/* Hidden native file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              multiple
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className={`w-full py-4 px-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 hover:border-indigo-500 bg-white hover:bg-indigo-50/20'
                  : 'border-slate-800 hover:border-indigo-500/50 bg-slate-900/50 hover:bg-indigo-950/20'
              } ${isUploading ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <Upload className="w-5 h-5 text-indigo-400" />
              <div className="text-xs font-medium text-slate-300">
                {isUploading
                  ? isEn
                    ? 'Uploading attachments...'
                    : 'در حال بارگذاری فایل‌ها...'
                  : isEn
                  ? 'Click to Browse & Upload Files (PDF, Images, Zip, Lic, Cert, etc.)'
                  : 'جهت انتخاب و آپلود فایل‌ها کلیک کنید (PDF، تصاویر، ZIP، لایسنس و...)'}
              </div>
            </button>

            {/* Attachments list */}
            {attachments.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-slate-400 font-medium">
                  {isEn ? `Attached Files (${attachments.length}):` : `فایل‌های پیوست‌شده (${attachments.length}):`}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      className={`flex items-center justify-between p-3 rounded-xl border ${
                        isLightMode
                          ? 'bg-white border-slate-200 shadow-sm'
                          : 'bg-slate-900 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-200 truncate">{att.fileName}</p>
                          <p className="text-[10px] text-slate-400">
                            {att.fileSize ? `${(att.fileSize / 1024).toFixed(1)} KB` : 'File'} •{' '}
                            {att.uploadDate ? new Date(att.uploadDate).toLocaleDateString() : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {att.downloadUrl && (
                          <a
                            href={att.downloadUrl}
                            download={att.fileName}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition-colors"
                            title={isEn ? 'Download File' : 'دانلود فایل'}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(att.id)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors cursor-pointer"
                          title={isEn ? 'Delete File' : 'حذف فایل'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 7: Notes & Remarks */}
          <div className="space-y-3 pt-2 border-t border-slate-800/60">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                {isEn ? '7. Technical Notes & Renewal Instructions' : '۷. یادداشت‌های فنی و دستورالعمل تمدید'}
              </h3>
              <FieldInfoTooltip
                title={isEn ? 'Notes' : 'یادداشت‌ها'}
                infoWhatEn="Free-form operational details, reseller contact numbers, or TAC procedures."
                infoWhatFa="توضیحات تکمیلی، شماره تماس کارگزار فروش یا دستورالعمل فعال‌سازی مجدد."
                infoWhyEn="Preserves institutional knowledge across engineering shifts and handovers."
                infoWhyFa="حفظ تاریخچه و راهنمای عملیاتی برای سایر کارشناسان و شیفت‌های بعدی."
                infoExampleEn="Renewal contract number: RN-99238, Reseller contact: Ali 0912..."
                infoExampleFa="شماره پرونده تمدید: RN-99238، کارگزار رسمی: آقای ..."
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>

            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isEn
                  ? 'Enter renewal contacts, purchase order reference, or operational notes...'
                  : 'توضیحات تکمیلی، شماره سفارش خرید یا اطلاعات تماس نماینده فروش...'
              }
              className={`w-full px-3 py-2 text-sm rounded-xl border outline-none resize-none ${
                isLightMode
                  ? 'bg-white border-slate-300 focus:border-violet-500 text-slate-800'
                  : 'bg-slate-900 border-slate-800 focus:border-violet-500 text-slate-100'
              }`}
            />
          </div>

          {/* Modal Footer / Actions */}
          <div
            className={`flex items-center justify-between pt-4 border-t ${
              isLightMode ? 'border-slate-200' : 'border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`px-4 py-2 text-sm font-medium rounded-xl border transition-colors cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 text-slate-600 hover:bg-slate-200'
                  : 'border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 text-sm font-bold rounded-xl bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{isEn ? 'Save License' : 'ذخیره لایسنس'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
