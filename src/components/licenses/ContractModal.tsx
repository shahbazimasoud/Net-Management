import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ScrollText,
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
  Phone,
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
  Eye,
  FileCheck
} from 'lucide-react';
import {
  ContractItem,
  ContractType,
  ContractStatus,
  AttachmentFile
} from '../../types';
import { createContractApi, updateContractApi, uploadContractAttachmentApi } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { useModalDock } from '../../context/ModalDockContext';
import { AttachmentPreviewModal } from './AttachmentPreviewModal';

interface ContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract?: ContractItem | null;
  isLightMode?: boolean;
  isEn?: boolean;
  onSaved: (contract: ContractItem) => void;
}

export const ContractModal: React.FC<ContractModalProps> = ({
  isOpen,
  onClose,
  contract,
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
  const [contractNumber, setContractNumber] = useState('');
  const [title, setTitle] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vendorContact, setVendorContact] = useState('');
  const [contractType, setContractType] = useState<ContractType>('sla_support');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [totalCost, setTotalCost] = useState<number>(0);
  const [currency, setCurrency] = useState<'IRR' | 'USD' | 'EUR' | 'AED'>('IRR');
  const [paymentTerms, setPaymentTerms] = useState('فصلی (۴ قسط مساوی)');
  const [alertDays, setAlertDays] = useState<number[]>([60, 45, 30, 15, 5, 0]);
  const [customDayInput, setCustomDayInput] = useState('');
  const [notifyEmails, setNotifyEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [notes, setNotes] = useState('');

  // Preview Modal
  const [previewFile, setPreviewFile] = useState<AttachmentFile | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state when editing an existing contract or opening a new one
  useEffect(() => {
    if (contract) {
      setContractNumber(contract.contractNumber || '');
      setTitle(contract.title || '');
      setVendorName(contract.vendorName || '');
      setVendorContact(contract.vendorContact || '');
      setContractType(contract.contractType || 'sla_support');
      setOwnerName(contract.ownerName || '');
      setOwnerEmail(contract.ownerEmail || '');
      setDepartment(contract.department || '');
      setStartDate(contract.startDate || '');
      setEndDate(contract.endDate || '');
      setTotalCost(contract.totalCost || 0);
      setCurrency((contract.currency as any) || 'IRR');
      setPaymentTerms(contract.paymentTerms || '');
      setAlertDays(contract.alertDays?.length ? contract.alertDays : [60, 45, 30, 15, 5, 0]);
      setNotifyEmails(contract.notifyEmails || []);
      setAttachments(contract.attachments || []);
      setNotes(contract.notes || '');
    } else {
      // Default initial values for new contract
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const nextYear = new Date(now);
      nextYear.setFullYear(now.getFullYear() + 1);
      const nextYearStr = nextYear.toISOString().split('T')[0];

      const autoNum = `CTR-${now.getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
      setContractNumber(autoNum);
      setTitle('');
      setVendorName('');
      setVendorContact('');
      setContractType('sla_support');
      setOwnerName('');
      setOwnerEmail('');
      setDepartment('مدیریت فناوری اطلاعات');
      setStartDate(todayStr);
      setEndDate(nextYearStr);
      setTotalCost(0);
      setCurrency('IRR');
      setPaymentTerms(isEn ? 'Quarterly (4 equal payments)' : 'فصلی (۴ قسط مساوی)');
      setAlertDays([60, 45, 30, 15, 5, 0]);
      setNotifyEmails([]);
      setAttachments([]);
      setNotes('');
    }
    setErrorMessage(null);
    setIsMinimized(false);
  }, [contract, isOpen, isEn]);

  // Universal minimization handler into ToolsDock
  const handleMinimize = () => {
    dockModal({
      id: `contract-modal-${contract?.id || 'new'}`,
      labelEn: contract ? `Contract: ${contract.title}` : 'New Contract Modal',
      labelFa: contract ? `قرارداد: ${contract.title}` : 'فرم ثبت قرارداد جدید',
      badge: 'CTR',
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

  // Add notification email
  const handleAddEmail = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setErrorMessage(isEn ? 'Please enter a valid email address' : 'لطفاً یک آدرس ایمیل معتبر وارد کنید');
      return;
    }
    if (notifyEmails.includes(trimmed)) {
      setErrorMessage(isEn ? 'Email already in recipient list' : 'این ایمیل قبلاً به لیست افزوده شده است');
      return;
    }
    setNotifyEmails([...notifyEmails, trimmed]);
    setEmailInput('');
    setErrorMessage(null);
  };

  // Remove notification email
  const handleRemoveEmail = (email: string) => {
    setNotifyEmails(notifyEmails.filter((e) => e !== email));
  };

  // Add custom alert milestone day
  const handleAddCustomDay = () => {
    const parsed = parseInt(customDayInput.trim(), 10);
    if (isNaN(parsed) || parsed < 0) {
      setErrorMessage(isEn ? 'Please enter a non-negative number of days' : 'لطفاً یک عدد معتبر بزرگتر یا مساوی صفر وارد کنید');
      return;
    }
    if (alertDays.includes(parsed)) {
      setErrorMessage(isEn ? 'Day milestone already exists' : 'این روز یادآوری از قبل در لیست وجود دارد');
      return;
    }
    const updated = [...alertDays, parsed].sort((a, b) => b - a);
    setAlertDays(updated);
    setCustomDayInput('');
    setErrorMessage(null);
  };

  // Remove alert milestone day
  const handleRemoveAlertDay = (day: number) => {
    setAlertDays(alertDays.filter((d) => d !== day));
  };

  // File upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setErrorMessage(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 25 * 1024 * 1024) {
          setErrorMessage(
            isEn
              ? `File "${file.name}" exceeds the 25MB maximum size limit.`
              : `حجم فایل «${file.name}» بیشتر از سقف مجاز ۲۵ مگابایت است.`
          );
          continue;
        }

        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (err) => reject(err);
        });
        reader.readAsDataURL(file);

        const dataBase64 = await base64Promise;
        const uploadRes = await uploadContractAttachmentApi({
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          dataBase64,
        });

        if (uploadRes.success && uploadRes.attachment) {
          setAttachments((prev) => [...prev, uploadRes.attachment]);
        }
      }
    } catch (err: any) {
      setErrorMessage(
        isEn
          ? `Attachment upload failed: ${err.message || 'Server error'}`
          : `خطا در بارگذاری پیوست: ${err.message || 'خطای سرور'}`
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Remove attachment
  const handleRemoveAttachment = (attId: string) => {
    setAttachments(attachments.filter((a) => a.id !== attId));
  };

  // Open in-browser PDF/Document preview
  const handleOpenPreview = (file: AttachmentFile) => {
    setPreviewFile(file);
    setIsPreviewOpen(true);
  };

  // Calculate days left
  const calculateDaysLeft = () => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const now = new Date();
    if (isNaN(end.getTime())) return null;
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const daysLeft = calculateDaysLeft();

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setErrorMessage(isEn ? 'Contract title is required.' : 'وارد کردن عنوان قرارداد الزامی است.');
      return;
    }
    if (!contractNumber.trim()) {
      setErrorMessage(isEn ? 'Contract number is required.' : 'وارد کردن شماره قرارداد الزامی است.');
      return;
    }
    if (!vendorName.trim()) {
      setErrorMessage(isEn ? 'Vendor / Company name is required.' : 'نام شرکت طرف قرارداد الزامی است.');
      return;
    }
    if (!startDate || !endDate) {
      setErrorMessage(isEn ? 'Start and end dates are required.' : 'تاریخ شروع و پایان قرارداد الزامی است.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    let calculatedStatus: ContractStatus = 'active';
    if (daysLeft !== null) {
      if (daysLeft < 0) calculatedStatus = 'expired';
      else if (daysLeft <= 45) calculatedStatus = 'expiring_soon';
      else calculatedStatus = 'active';
    }

    const payload: Partial<ContractItem> = {
      contractNumber: contractNumber.trim(),
      title: title.trim(),
      vendorName: vendorName.trim(),
      vendorContact: vendorContact.trim(),
      contractType,
      ownerName: ownerName.trim() || 'مدیر زیرساخت',
      ownerEmail: ownerEmail.trim(),
      department: department.trim(),
      startDate,
      endDate,
      status: calculatedStatus,
      totalCost: Number(totalCost) || 0,
      currency,
      paymentTerms: paymentTerms.trim(),
      notifyEmails,
      alertDays: alertDays.length > 0 ? alertDays : [60, 45, 30, 15, 5, 0],
      attachments,
      notes: notes.trim(),
    };

    try {
      if (contract?.id) {
        const res = await updateContractApi(contract.id, payload);
        onSaved(res.contract);
      } else {
        const res = await createContractApi(payload);
        onSaved(res.contract);
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(
        isEn
          ? `Failed to save contract: ${err.message || 'Check network connection'}`
          : `خطا در ذخیره‌سازی قرارداد: ${err.message || 'اتصال سرور را بررسی فرمایید'}`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className={
        isMaximized
          ? 'fixed top-0 left-0 right-0 bottom-8 z-[9999] p-0 flex flex-col'
          : 'fixed top-0 left-0 right-0 bottom-8 z-[9999] p-2 sm:p-4 bg-black/80 backdrop-blur-sm flex items-center justify-center'
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
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <ScrollText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                {contract
                  ? isEn
                    ? `Edit Contract: ${contract.title}`
                    : `ویرایش قرارداد: ${contract.title}`
                  : isEn
                  ? 'Register New Vendor / SLA Agreement Contract'
                  : 'ثبت و تعریف قرارداد جدید پشتیبانی، گارانتی و SLA'}
              </h2>
              <p className="text-xs text-slate-400">
                {isEn
                  ? 'Manage vendor agreements, ISP bandwidth SLAs, payments, attachments & alerts'
                  : 'مدیریت قراردادهای پیمانکاران، پهنای باند اینترنت، گارانتی، پیوست‌ها و هشدارهای تمدید'}
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

          {/* Section 1: Identification & Contract Type */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              {isEn ? '1. Contract Identification & Agreement Type' : '۱. مشخصات قرارداد و نوع توافق‌نامه'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Contract Number */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    {isEn ? 'Contract Number / Ref' : 'شماره یا شناسه قرارداد'}
                    <span className="text-rose-400">*</span>
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Contract Number' : 'شماره قرارداد'}
                    infoWhatEn="Official identifier, purchase order number, or vendor contract reference."
                    infoWhatFa="شناسه رسمی ثبت شده در دبیرخانه، شماره سفارش خرید یا رفرنس قرارداد پیمانکار."
                    infoWhyEn="Ensures fast searching, reconciliation with accounting, and legal tracking."
                    infoWhyFa="جهت جستجوی سریع، تطبیق با امور مالی و پیگیری حقوقی در زمان بروز اختلاف."
                    infoExampleEn="CTR-2026-ISP-019, SMARTNET-88219"
                    infoExampleFa="CTR-1404-NET-084 یا PO-9923"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="text"
                  value={contractNumber}
                  onChange={(e) => setContractNumber(e.target.value)}
                  placeholder={isEn ? 'e.g. CTR-2026-NET-084' : 'مثلاً CTR-1404-NET-084'}
                  required
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500 focus:ring-indigo-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-indigo-500 focus:ring-indigo-500'
                  }`}
                />
              </div>

              {/* Title */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    {isEn ? 'Contract Title / Scope' : 'موضوع یا عنوان قرارداد'}
                    <span className="text-rose-400">*</span>
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Contract Title' : 'موضوع قرارداد'}
                    infoWhatEn="Brief descriptive summary of the services, hardware maintenance, or bandwidth supplied."
                    infoWhatFa="شرح مختصر و مشخص خدمات، نگهداری سخت‌افزار یا پهنای باند تامین‌شده."
                    infoWhyEn="Identifies the contract purpose immediately on tables and notifications."
                    infoWhyFa="تشخیص فوری ماهیت قرارداد در جدول‌ها و ایمیل‌های هشدار بدون نیاز به باز کردن متن پیوست."
                    infoExampleEn="Core Datacenter Hardware Warranty & 4h Replacement SLA"
                    infoExampleFa="قرارداد پشتیبانی سخت‌افزاری سوئیچ‌های دیتاسنتر با SLA تعویض ۴ ساعته"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={isEn ? 'e.g. Dedicated Fiber 1Gbps Bandwidth SLA' : 'مثلاً قرارداد پشتیبانی سخت‌افزار و قطعات یدکی دیتاسنتر'}
                  required
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500 focus:ring-indigo-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-indigo-500 focus:ring-indigo-500'
                  }`}
                />
              </div>
            </div>

            {/* Contract Type & Payment Terms */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    {isEn ? 'Contract Category / Type' : 'نوع یا دسته‌بندی قرارداد'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Contract Type' : 'نوع قرارداد'}
                    infoWhatEn="Classification category defining the nature of the SLA or vendor engagement."
                    infoWhatFa="دسته‌بندی تخصصی جهت تفکیک قراردادهای پشتیبانی، پهنای باند، گارانتی یا نگهداری."
                    infoWhyEn="Allows targeted filtering and reporting across specific infrastructure services."
                    infoWhyFa="فیلترسازی سریع بر اساس نوع تعهدات تامین‌کننده در داشبورد."
                    infoExampleEn="SLA & 24/7 Support, Internet Bandwidth, Hardware Warranty"
                    infoExampleFa="پشتیبانی ۲۴/۷، پهنای باند اختصاصی ISP، گارانتی قطعات سخت‌افزاری"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <select
                  value={contractType}
                  onChange={(e) => setContractType(e.target.value as ContractType)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-indigo-500'
                  }`}
                >
                  <option value="sla_support">
                    {isEn ? 'SLA & 24/7 Technical Support' : 'پشتیبانی فنی و توافق‌نامه سطح خدمات (SLA)'}
                  </option>
                  <option value="hardware_warranty">
                    {isEn ? 'Hardware Warranty & RMA Replacement' : 'گارانتی سخت‌افزار و تامین قطعات یدکی (RMA)'}
                  </option>
                  <option value="internet_isp">
                    {isEn ? 'Dedicated Internet Bandwidth (ISP)' : 'پهنای باند اختصاصی اینترنت و لینک‌های مخابراتی'}
                  </option>
                  <option value="datacenter_colocation">
                    {isEn ? 'Datacenter Space & Colocation' : 'فضای دیتاسنتر، رک و کولوکیشن'}
                  </option>
                  <option value="software_maintenance">
                    {isEn ? 'Software Maintenance & Updates' : 'نگهداری و آپدیت نرم‌افزارهای سازمان'}
                  </option>
                  <option value="hardware_purchase">
                    {isEn ? 'Hardware Purchase & Delivery' : 'خرید و تحویل تجهیزات سخت‌افزاری'}
                  </option>
                  <option value="consulting">
                    {isEn ? 'Technical Consulting & Audit' : 'مشاوره فنی، ممیزی و نظارت'}
                  </option>
                  <option value="other">
                    {isEn ? 'Other Services' : 'سایر خدمات'}
                  </option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    {isEn ? 'Payment Terms / Milestones' : 'شرایط پرداخت یا اقساط'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Payment Terms' : 'شرایط پرداخت'}
                    infoWhatEn="Agreed payment schedule (monthly, quarterly, milestone-based)."
                    infoWhatFa="شیوه تسویه مالی قرارداد با پیمانکار به تفکیک اقساط یا دوره‌ها."
                    infoWhyEn="Ensures timely financial approval before vendor service suspension."
                    infoWhyFa="جلوگیری از قطع ناگهانی سرویس‌های اینترنت یا گارانتی به دلیل تاخیر در پرداخت فاکتورها."
                    infoExampleEn="Monthly invoice, 4 quarterly installments, 30% advance + 70% delivery"
                    infoExampleFa="پرداخت ماهانه، فصلی ۴ قسط، یا ۳۰٪ پیش‌پرداخت + ۷۰٪ تحویل نهایی"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="text"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  placeholder={isEn ? 'e.g. Quarterly installments (4 payments)' : 'مثلاً پرداخت فصلی، ماهانه یا بر اساس مایلستون'}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-indigo-500'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Vendor / Provider & Contact Info */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-400" />
              {isEn ? '2. Vendor Company & Account Representative' : '۲. شرکت طرف قرارداد و اطلاعات تماس کارشناس رابط'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Vendor Company Name */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    {isEn ? 'Vendor / Company Name' : 'نام شرکت یا پیمانکار'}
                    <span className="text-rose-400">*</span>
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Vendor Company Name' : 'نام شرکت پیمانکار'}
                    infoWhatEn="Legal entity name of the supplier, ISP provider, or warranty vendor."
                    infoWhatFa="نام حقوقی شرکت تامین‌کننده تجهیزات، سرویس‌دهنده اینترنت یا شرکت پشتیبان."
                    infoWhyEn="Enables vendor performance tracking and contract renewal negotiations."
                    infoWhyFa="ثبت سوابق کیفی تامین‌کنندگان جهت ارزیابی در مناقصات و تمدیدهای آتی."
                    infoExampleEn="Cisco Gold Partner, Respina Telecom, Fanava Datacenter"
                    infoExampleFa="شرکت ارتباطات زیرساخت، فناوا، پیشرو داده یا رسپینا"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="text"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder={isEn ? 'e.g. Cisco Authorized Partner Inc.' : 'مثلاً شرکت فناوری ارتباطات پیشرو داده'}
                  required
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-indigo-500'
                  }`}
                />
              </div>

              {/* Vendor Contact (Phone / Email / Representative) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    {isEn ? 'Vendor Contact & Support Hotline' : 'نام رابط، تلفن تماس و پشتیبانی اضطراری'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Vendor Contact' : 'اطلاعات تماس پشتیبانی'}
                    infoWhatEn="Direct contact number, account manager name, and 24/7 NOC hotline."
                    infoWhatFa="شماره تلفن مستقیم، نام اکانت منیجر یا خط پشتیبانی ۲۴ ساعته شیفت فنی شرکت."
                    infoWhyEn="Ensures fast escalation during severe network incidents or SLA breaches."
                    infoWhyFa="امکان تماس فوری در زمان رخدادهای بحرانی و قطعی‌های گسترده شبکه."
                    infoExampleEn="Eng. Smith: +1-555-0192 / noc@vendor.com"
                    infoExampleFa="مهندس کریمی: ۰۲۱۸۸۹۹۰۰۱۱ / شیفت ۲۴ ساعته ۱۵۲۴"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="text"
                  value={vendorContact}
                  onChange={(e) => setVendorContact(e.target.value)}
                  placeholder={isEn ? 'e.g. Eng. Karimi - 021-88990011 / noc@provider.ir' : 'مثلاً مهندس کریمی - ۰۲۱۸۸۹۹۰۰۱۱ / پشتیبانی noc@provider.ir'}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-indigo-500'
                  }`}
                />
              </div>
            </div>

            {/* Ownership & Department */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    {isEn ? 'Internal Owner / Manager' : 'مسئول یا تحویل‌گیرنده داخلی'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Internal Owner' : 'مسئول قرارداد'}
                    infoWhatEn="Internal engineer or manager responsible for overseeing contract deliverables."
                    infoWhatFa="کارشناس یا مدیر فناوری اطلاعات ناظر بر اجرای صحیح مفاد قرارداد."
                    infoWhyEn="Directs notifications and renewal responsibilities to the proper team member."
                    infoWhyFa="تضمین عدم رها شدن قرارداد و ارجاع مستقیم یادآوری‌ها به فرد مسئول."
                    infoExampleEn="IT Infrastructure Lead"
                    infoExampleFa="مدیر فناوری اطلاعات یا سرپرست شبکه"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder={isEn ? 'e.g. IT Director' : 'مثلاً مدیر فناوری اطلاعات'}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-indigo-500'
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
                    infoWhatEn="Primary email address of the contract supervisor."
                    infoWhatFa="آدرس ایمیل کاری ناظر قرارداد جهت دریافت گزارش‌ها."
                    infoWhyEn="Receives scheduled automated reminders and audit notices."
                    infoWhyFa="ارسال منظم خلاصه وضعیت و سررسیدها به ناظر مربوطه."
                    infoExampleEn="it-director@corp.internal"
                    infoExampleFa="it-manager@company.ir"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="it-director@corp.internal"
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-indigo-500'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    {isEn ? 'Department' : 'دپارتمان / واحد سازمانی'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Department' : 'دپارتمان'}
                    infoWhatEn="Organizational branch holding the budget and operational mandate."
                    infoWhatFa="واحد سازمانی صاحب بودجه و متولی قرارداد در سازمان."
                    infoWhyEn="Enables cost center attribution and cross-departmental budgeting."
                    infoWhyFa="تفکیک هزینه‌ها بر اساس مراکز هزینه دپارتمان‌ها."
                    infoExampleEn="Network & Security Operations, NOC, Data Management"
                    infoExampleFa="عملیات شبکه و امنیت، دیتاسنتر یا فناوری اطلاعات"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder={isEn ? 'e.g. IT Infrastructure' : 'مثلاً مدیریت فناوری اطلاعات'}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-indigo-500'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Timeline & Financials */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              {isEn ? '3. Dates, Warranty Periods & Financial Amounts' : '۳. بازه زمانی، دوره گارانتی و مبالغ قرارداد'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Start Date */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    {isEn ? 'Start Date' : 'تاریخ شروع'}
                    <span className="text-rose-400">*</span>
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Start Date' : 'تاریخ شروع'}
                    infoWhatEn="Effective execution date when services or coverage commence."
                    infoWhatFa="تاریخ موثر آغاز تعهدات پیمانکار، پوشش گارانتی یا اتصال خط ارتباطی."
                    infoWhyEn="Calculates SLA validity window and uptime penalties."
                    infoWhyFa="محاسبه دقیق طول دوره خدمات و ارزیابی زمان قطعی مجاز."
                    infoExampleEn="2026-01-01"
                    infoExampleFa="۱۴۰۴/۰۱/۰۱"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-indigo-500'
                  }`}
                />
              </div>

              {/* End Date */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    {isEn ? 'End Date / Expiry' : 'تاریخ پایان / انقضا'}
                    <span className="text-rose-400">*</span>
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'End Date' : 'تاریخ پایان قرارداد'}
                    infoWhatEn="Date of contract expiration or warranty termination."
                    infoWhatFa="تاریخ سررسید نهایی قرارداد یا پایان دوره تعهدات گارانتی پیمانکار."
                    infoWhyEn="Triggers proactive automated renewal email alerts to avoid coverage lapses."
                    infoWhyFa="فعال‌سازی سیستم خودکار هشدار ایمیلی جهت جلوگیری از اتمام گارانتی بدون تمدید."
                    infoExampleEn="2027-01-01"
                    infoExampleFa="۱۴۰۵/۰۱/۰۱"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-indigo-500'
                  }`}
                />
              </div>

              {/* Total Cost */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    {isEn ? 'Total Contract Cost' : 'مبلغ کل قرارداد'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Total Cost' : 'مبلغ قرارداد'}
                    infoWhatEn="Total monetary commitment across the entire contract term."
                    infoWhatFa="مبلغ ناخالص کل تعهدات مالی قرارداد در طول دوره اعتبار."
                    infoWhyEn="Enables enterprise budget tracking and annual IT spending reports."
                    infoWhyFa="تحلیل کلان هزینه‌های زیرساخت شبکه و مقایسه پیشنهادات مالی در تمدیدها."
                    infoExampleEn="480000000 IRR, 12500 USD"
                    infoExampleFa="۴۸۰,۰۰۰,۰۰۰ ریال یا ۱۲,۵۰۰ دلار"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="number"
                  value={totalCost}
                  onChange={(e) => setTotalCost(parseFloat(e.target.value) || 0)}
                  min="0"
                  step="any"
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-indigo-500'
                  }`}
                />
              </div>

              {/* Currency */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    {isEn ? 'Currency' : 'واحد پول'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Currency' : 'واحد پول'}
                    infoWhatEn="Currency in which the vendor invoices and billing are settled."
                    infoWhatFa="واحد ارزی یا ریالی درج شده در اسناد مالی و قرارداد رسمی."
                    infoWhyEn="Accurate multi-currency financial accounting."
                    infoWhyFa="محاسبه دقیق در سازمان‌هایی که پرداخت‌های ارزی و ریالی توامان دارند."
                    infoExampleEn="IRR (Rials), USD, EUR, AED"
                    infoExampleFa="ریال (IRR)، دلار یا یورو"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as any)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-indigo-500'
                  }`}
                >
                  <option value="IRR">{isEn ? 'IRR (Iranian Rial)' : 'ریال (IRR)'}</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="AED">AED (Dirham)</option>
                </select>
              </div>
            </div>

            {/* Countdown Badge Preview */}
            {daysLeft !== null && (
              <div
                className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                  daysLeft < 0
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    : daysLeft <= 45
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>
                    {isEn
                      ? daysLeft < 0
                        ? `Contract expired ${Math.abs(daysLeft)} days ago!`
                        : daysLeft === 0
                        ? 'Contract expires today!'
                        : `${daysLeft} days remaining until expiration.`
                      : daysLeft < 0
                      ? `قرارداد ${Math.abs(daysLeft)} روز پیش منقضی شده است!`
                      : daysLeft === 0
                      ? 'قرارداد امروز به پایان می‌رسد!'
                      : `${daysLeft} روز تا سررسید و پایان قرارداد باقیمانده است.`}
                  </span>
                </div>
                <span className="font-bold px-2 py-0.5 rounded-full bg-black/20 text-[11px]">
                  {daysLeft < 0
                    ? isEn ? 'EXPIRED' : 'منقضی'
                    : daysLeft <= 45
                    ? isEn ? 'EXPIRING SOON' : 'نزدیک انقضا'
                    : isEn ? 'ACTIVE' : 'معتبر و فعال'}
                </span>
              </div>
            )}
          </div>

          {/* Section 4: Email Alerts & Milestone Schedule */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-indigo-400" />
              {isEn ? '4. Notification Recipients & Custom Alert Schedule' : '۴. گیرندگان ایمیل هشدار و زمان‌بندی یادآوری‌های پلکانی'}
            </h3>

            {/* Email Recipients */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  {isEn ? 'Notification Email Recipients' : 'آدرس‌های ایمیل دریافت‌کننده هشدار'}
                </label>
                <FieldInfoTooltip
                  title={isEn ? 'Notification Emails' : 'ایمیل‌های هشدار'}
                  infoWhatEn="List of email addresses receiving automated renewal alerts from the background cron daemon."
                  infoWhatFa="فهرست ایمیل کارشناسان و مدیرانی که در مواعد مقرر هشدارهای خودکار ایمیلی دریافت می‌نمایند."
                  infoWhyEn="Ensures multi-stakeholder awareness so renewals or payment milestones are not missed."
                  infoWhyFa="اطلاع‌رسانی همزمان به تیم فنی، مدیران و واحد تدارکات جهت هماهنگی تمدید."
                  infoExampleEn="it-director@corp.internal, financial@corp.internal, vendor-team@corp.internal"
                  infoExampleFa="noc@company.ir و financial@company.ir"
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>

              {/* Tag Input */}
              <div className="flex gap-2 mb-2">
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
                  placeholder={isEn ? 'Type email address and press Enter or Add' : 'آدرس ایمیل را تایپ و دکمه افزودن را بزنید'}
                  className={`flex-1 px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-indigo-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={handleAddEmail}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 inline mr-1" />
                  {isEn ? 'Add Email' : 'افزودن'}
                </button>
              </div>

              {/* Email Tag Pills */}
              <div className="flex flex-wrap gap-2">
                {notifyEmails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/30"
                  >
                    <Mail className="w-3 h-3 text-indigo-400" />
                    <span>{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveEmail(email)}
                      className="hover:text-rose-400 cursor-pointer ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {notifyEmails.length === 0 && (
                  <p className="text-xs text-slate-500 italic">
                    {isEn ? 'No recipient emails added. Add at least one to receive automated alerts.' : 'هنوز ایمیلی ثبت نشده است. جهت دریافت هشدارها حداقل یک ایمیل اضافه فرمایید.'}
                  </p>
                )}
              </div>
            </div>

            {/* Custom Milestone Alert Days */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  {isEn ? 'Alert Milestones (Days before expiration)' : 'روزهای یادآوری هشدار (تعداد روز قبل از سررسید)'}
                </label>
                <FieldInfoTooltip
                  title={isEn ? 'Alert Days Milestones' : 'روزهای یادآوری سررسید'}
                  infoWhatEn="Configurable countdown intervals (e.g. 60, 45, 30, 15, 5, 0 days) when alerts trigger."
                  infoWhatFa="نقاط عطف زمانی (مثلاً ۶۰، ۴۵، ۳۰، ۱۵، ۵ و روز صفر) که سامانه کران‌جاب اقدام به ارسال هشدار می‌نماید."
                  infoWhyEn="Provides stepped escalating reminders ensuring ample lead time for purchasing & approval."
                  infoWhyFa="ایجاد زمان کافی جهت استعلام قیمت، تصویب بودجه تمدید و مذاکره با پیمانکار."
                  infoExampleEn="60, 45, 30, 15, 5, 0 (Day of expiry)"
                  infoExampleFa="۶۰، ۴۵، ۳۰، ۱۵، ۵ و روز صفر انقضا"
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>

              {/* Alert Days Pills and Add Input */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {alertDays.map((day) => (
                  <span
                    key={day}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold border ${
                      day === 0
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : day <= 15
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    <span>{day === 0 ? (isEn ? 'Day 0 (Expiry)' : 'روز صفر (سررسید)') : isEn ? `${day} days before` : `${day} روز مانده`}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAlertDay(day)}
                      className="hover:text-rose-400 cursor-pointer ml-1"
                      title={isEn ? 'Remove milestone' : 'حذف این موعد'}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="number"
                  value={customDayInput}
                  onChange={(e) => setCustomDayInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomDay();
                    }
                  }}
                  min="0"
                  max="365"
                  placeholder={isEn ? 'Enter custom day (e.g. 90, 20) and click Add' : 'عدد روز دلخواه (مثلاً ۹۰ یا ۲۰) را تایپ کنید'}
                  className={`w-64 px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-indigo-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={handleAddCustomDay}
                  className="px-3.5 py-2 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 inline mr-1" />
                  {isEn ? 'Add Milestone' : 'افزودن روز یادآوری'}
                </button>
              </div>
            </div>
          </div>

          {/* Section 5: Attachments & In-Browser PDF/Document Preview */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
                {isEn ? '5. Document Attachments & In-Browser PDF Preview' : '۵. فایل‌های پیوست و پیش‌نمایش مستقیم PDF در مرورگر'}
              </h3>
              <FieldInfoTooltip
                title={isEn ? 'Contract Attachments' : 'پیوست‌های قرارداد'}
                infoWhatEn="Scanned PDF contracts, SLA appendices, proforma invoices, and warranty documents."
                infoWhatFa="اسکن رسمی قرارداد با مهر و امضا، پیوست‌های فنی توافق‌نامه سطح خدمات و فاکتورها."
                infoWhyEn="Centralizes documentation with instant in-browser preview without requiring separate software."
                infoWhyFa="دسترسی سریع و مشاهده آنی قراردادهای رسمی در مرورگر بدون نیاز به خروج از پنل."
                infoExampleEn="Contract_SLA_Respina.pdf, Proforma_Invoice_98.pdf, Warranty_Card.png"
                infoExampleFa="Contract_Signed.pdf، فاکتور_رسمی.pdf یا اسکن_گارانتی.jpg"
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>

            {/* Dropzone Upload Button */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${
                isLightMode
                  ? 'bg-indigo-50/50 hover:bg-indigo-50 border-indigo-200 text-slate-700'
                  : 'bg-indigo-950/20 hover:bg-indigo-950/40 border-indigo-500/30 text-slate-300'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
                className="hidden"
              />
              <Upload className="w-8 h-8 text-indigo-400 mb-2 animate-bounce" />
              <p className="text-xs font-bold text-center">
                {isUploading
                  ? isEn ? 'Uploading attachment to secure vault...' : 'در حال بارگذاری فایل در مخزن امن سرور...'
                  : isEn ? 'Click or drag files here to upload (PDF, Images, Scanned Contracts)' : 'جهت آپلود کلیک فرمایید یا فایل‌ها را به اینجا بکشید (PDF، تصاویر و فاکتورها)'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {isEn ? 'Max size: 25MB per file • Full in-browser PDF viewing supported' : 'حداکثر حجم مجاز: ۲۵ مگابایت • پشتیبانی از نمایش مستقیم PDF در پنل'}
              </p>
            </div>

            {/* Attachments List */}
            {attachments.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                  {isEn ? `Attached Documents (${attachments.length})` : `فایل‌های بارگذاری شده (${attachments.length})`}:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {attachments.map((file) => {
                    const isPdf = file.fileType?.includes('pdf') || file.fileName?.toLowerCase().endsWith('.pdf');
                    return (
                      <div
                        key={file.id}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <div className={`p-2 rounded-lg shrink-0 ${isPdf ? 'bg-rose-500/10 text-rose-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate text-slate-200">{file.fileName}</p>
                            <p className="text-[10px] text-slate-400">
                              {(file.fileSize / 1024).toFixed(1)} KB • {isPdf ? 'PDF Document' : 'Attachment'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {/* In-Browser Preview Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenPreview(file)}
                            className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition-colors cursor-pointer"
                            title={isEn ? 'In-Browser Preview' : 'پیش‌نمایش در مرورگر'}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(file.id)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors cursor-pointer"
                            title={isEn ? 'Delete file' : 'حذف فایل'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Section 6: Operational Notes & Special SLA Clauses */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                {isEn ? 'SLA Terms, Response Time Commitments & Technical Notes' : 'تعهدات سطح خدمات (SLA)، زمان پاسخ‌گویی و یادداشت‌های فنی'}
              </label>
              <FieldInfoTooltip
                title={isEn ? 'SLA Notes' : 'یادداشت‌های SLA'}
                infoWhatEn="Key contract obligations: Maximum MTTR (Mean Time to Repair), spare part replacement SLAs, and penalty clauses."
                infoWhatFa="تعهدات کلیدی: حداکثر زمان رفع خرابی، سقف جریمه‌های قطعی، تعهد تامین قطعه یدکی و شرایط فسخ."
                infoWhyEn="Provides immediate reference to technicians during outages to demand vendor compliance."
                infoWhyFa="مرجع سریع برای شیفت فنی در زمان قطعی جهت مطالبه تعهدات پاسخ‌گویی پیمانکار."
                infoExampleEn="MTTR < 4h, 99.9% uptime guarantee, penalty of 2% contract value per hour of unresolved outage."
                infoExampleFa="SLA تعویض قطعه ۴ ساعته، تضمین آپ‌تایم ۹۹.۹٪، جریمه قطعی طبق جدول ضمیمه ۳."
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isEn ? 'e.g. 4-hour on-site hardware replacement SLA, dedicated 24/7 technical point of contact...' : 'مثلاً تعهد تعویض قطعه در کمتر از ۴ ساعت، خط اختصاصی پشتیبانی ۲۴ ساعته...'}
              className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 leading-relaxed ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500'
                  : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-indigo-500'
              }`}
            />
          </div>

          {/* Modal Footer / Save Buttons */}
          <div
            className={`flex items-center justify-end gap-3 pt-4 border-t sticky bottom-0 -mx-5 -mb-5 px-5 py-3 ${
              isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                isLightMode ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? isEn ? 'Saving contract...' : 'در حال ذخیره‌سازی...'
                  : contract
                  ? isEn ? 'Save Changes' : 'ذخیره تغییرات قرارداد'
                  : isEn ? 'Register Contract' : 'ثبت نهایی قرارداد'}
              </span>
            </button>
          </div>
        </form>
      </div>

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
    </div>,
    document.body
  );
};
