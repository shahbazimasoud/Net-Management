import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  FileSpreadsheet,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  X,
  Minus,
  Maximize2,
  Minimize2,
  ShieldAlert,
  Server,
  Layers,
  MapPin,
  Cpu,
  Lock,
} from 'lucide-react';
import { Device } from '../types';
import { FieldInfoTooltip } from './common/FieldInfoTooltip';
import { isDeviceActionPermitted } from '../utils/rbac';
import { useModalDock } from '../context/ModalDockContext';

export interface DeviceExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: Device[];
  selectedDeviceIds?: Set<string>;
  effectivePolicy?: any;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const DeviceExportModal: React.FC<DeviceExportModalProps> = ({
  isOpen,
  onClose,
  devices,
  selectedDeviceIds = new Set<string>(),
  effectivePolicy,
  isLightMode = false,
  isEn = true,
}) => {
  const { dockModal, undockModal } = useModalDock();

  // Modal Window State
  const [isMaximized, setIsMaximized] = useState(false);

  // Export Scope Selection: 'selected' | 'all' | 'filtered'
  const hasSelected = selectedDeviceIds.size > 0;
  const [scope, setScope] = useState<'selected' | 'all'>(hasSelected ? 'selected' : 'all');
  const [format, setFormat] = useState<'json' | 'csv'>('json');

  // Export Options
  const [includePorts, setIncludePorts] = useState(true);
  const [includePlacement, setIncludePlacement] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);

  // Execution states
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  // Minimize handler adhering to Rule 5 & 7
  const handleMinimize = () => {
    dockModal({
      id: 'modal-device-export',
      labelEn: `Export Devices (${devicesToExport.length})`,
      labelFa: `خروجی تجهیزات (${devicesToExport.length})`,
      badge: format.toUpperCase(),
      category: 'device',
      onRestore: () => {
        undockModal('modal-device-export');
      },
      onClose: () => {
        undockModal('modal-device-export');
        onClose();
      },
    });
    onClose();
  };

  if (!isOpen) return null;

  // Determine which devices are targeted
  const targetDeviceList =
    scope === 'selected' && hasSelected
      ? devices.filter((d) => selectedDeviceIds.has(d.id))
      : devices;

  // Check RBAC permission for each targeted device
  const authorizedDevices = targetDeviceList.filter((d) =>
    isDeviceActionPermitted(effectivePolicy, d.id, 'export_devices')
  );
  const forbiddenDevices = targetDeviceList.filter(
    (d) => !isDeviceActionPermitted(effectivePolicy, d.id, 'export_devices')
  );

  const devicesToExport = authorizedDevices;
  const canExportAtLeastOne = devicesToExport.length > 0;

  const handleExecuteExport = async () => {
    if (!canExportAtLeastOne) return;
    setIsExporting(true);
    setError(null);
    setSuccessCount(null);

    try {
      const response = await fetch('/api/devices/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceIds: devicesToExport.map((d) => d.id),
          format,
          includePorts,
          includePlacement,
          includeNotes,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(
          (isEn ? errJson.error : errJson.errorFa) ||
            (isEn ? 'Failed to export network equipment.' : 'خطا در دریافت فایل خروجی تجهیزات.')
        );
      }

      if (format === 'csv') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `network_equipment_export_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const data = await response.json();
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `network_equipment_export_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }

      setSuccessCount(devicesToExport.length);
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err: any) {
      setError(err.message || (isEn ? 'Export failed' : 'عملیات با خطا مواجه شد'));
    } finally {
      setIsExporting(false);
    }
  };

  const modalContent = (
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-3 sm:p-5 pointer-events-auto"
      style={{ isolation: 'isolate' }}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 transition-opacity ${
          isLightMode ? 'bg-slate-900/35 backdrop-blur-xs' : 'bg-black/70 backdrop-blur-sm'
        }`}
        onClick={onClose}
      />

      {/* Modal Dialog Window */}
      <div
        className={`relative flex flex-col w-full shadow-2xl transition-all duration-200 border rounded-2xl overflow-hidden font-sans ${
          isMaximized
            ? 'h-full max-h-full rounded-none'
            : 'max-w-2xl max-h-[92vh] sm:rounded-2xl'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-300 text-slate-800 shadow-slate-900/20'
            : 'bg-slate-950 border-cyan-500/30 text-slate-100 shadow-cyan-950/40'
        }`}
        dir={isEn ? 'ltr' : 'rtl'}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with 3 Control Buttons (Close, Minimize, Maximize) adhering to Rule 7 */}
        <div
          className={`px-4 sm:px-6 py-3.5 border-b flex items-center justify-between shrink-0 select-none ${
            isLightMode
              ? 'bg-white border-slate-200'
              : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`p-2 rounded-xl flex items-center justify-center shrink-0 border ${
                isLightMode
                  ? 'bg-cyan-100/80 border-cyan-300 text-cyan-700'
                  : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
              }`}
            >
              <Download className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2
                  className={`text-sm sm:text-base font-bold truncate ${
                    isLightMode ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {isEn
                    ? 'Export Network Equipment & Inventory'
                    : 'استخراج و خروجی اطلاعات تجهیزات شبکه'}
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  RBAC
                </span>
              </div>
              <p className={`text-xs truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Granular Multi-Vendor Hardware Inventory Data Extraction'
                  : 'استخراج داده‌های شناسنامه و کانفیگ سخت‌افزاری بر اساس ماتریس دسترسی'}
              </p>
            </div>
          </div>

          {/* 3 Header Control Buttons */}
          <div className="flex items-center gap-1.5 shrink-0 rtl:flex-row-reverse">
            {/* Minimize Button */}
            <button
              type="button"
              onClick={handleMinimize}
              title={isEn ? 'Minimize to Tools Dock' : 'کمینه‌سازی در داک ابزارها'}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  : 'border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Maximize / Restore Button */}
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام‌صفحه') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  : 'border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-rose-600 hover:bg-rose-50'
                  : 'border-white/10 text-rose-400 hover:bg-rose-500/20 hover:text-white'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 custom-scrollbar flex-1">
          {/* RBAC Status & Scope Summary */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              forbiddenDevices.length > 0
                ? isLightMode
                  ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                  : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                : isLightMode
                ? 'bg-cyan-50/70 border-cyan-200 text-cyan-900'
                : 'bg-cyan-950/20 border-cyan-500/30 text-cyan-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {forbiddenDevices.length > 0 ? (
                <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <span>
                    {isEn
                      ? `Access Control (RBAC): ${authorizedDevices.length} Authorized of ${targetDeviceList.length} Devices`
                      : `کنترل دسترسی (RBAC): ${authorizedDevices.length} مجاز از مجموع ${targetDeviceList.length} تجهیز`}
                  </span>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    fieldName="RBAC Export Security Policy"
                    whatIsIt={
                      isEn
                        ? 'Hardware inventory extraction security policy based on your assigned RBAC role.'
                        : 'سیاست امنیتی استخراج داده‌های تجهیزات و شناسه سخت‌افزاری بر پایه پالیسی امنیتی کاربر.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Enforces strict protection preventing unauthorized extraction of network addressing, MACs, and hardware configurations.'
                        : 'جلوگیری قطعی از سرقت یا استخراج مشخصات آدرس‌دهی و کانفیگ‌های محرمانه تجهیزات توسط حساب‌های بدون دسترسی.'
                    }
                    example={
                      isEn
                        ? 'Network Auditors can export full inventory; Helpdesk can only view status.'
                        : 'ممیزان شبکه اجازه استخراج کامل دارند ولی تکنسین‌های معمولی فاقد مجوز export هستند.'
                    }
                  />
                </div>
                <p className="text-[11px] opacity-80 leading-relaxed">
                  {forbiddenDevices.length > 0
                    ? isEn
                      ? `${forbiddenDevices.length} devices are excluded from export because your active role lacks the 'export_devices' capability for them.`
                      : `تعداد ${forbiddenDevices.length} تجهیز به دلیل عدم وجود دسترسی «خروجی گرفتن از تجهیزات» در پالیسی شما، از فایل خروجی حذف خواهند شد.`
                    : isEn
                    ? 'All selected devices are fully permitted for export under your current role.'
                    : 'تمامی تجهیزات انتخاب‌شده با مجوز کامل پالیسی شما استخراج خواهند شد.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-mono font-bold px-3 py-1 rounded-lg bg-black/10 border border-current">
                {devicesToExport.length} {isEn ? 'Ready' : 'آماده'}
              </span>
            </div>
          </div>

          {/* Scope Selector (Only if some devices were selected on main page) */}
          {hasSelected && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <span className={isLightMode ? 'text-slate-800' : 'text-slate-200'}>
                  {isEn ? 'Target Devices Selection:' : 'محدوده تجهیزات هدف:'}
                </span>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  fieldName="Export Target Scope"
                  whatIsIt={
                    isEn
                      ? 'Select whether to export only checked devices or the entire inventory.'
                      : 'انتخاب استخراج منحصراً تجهیزات تیک‌خورده یا کل انبار تجهیزات شبکه.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Allows exporting specific switches or auditing the entire datacenter at once.'
                      : 'امکان گزارش‌گیری اختصاصی از چند سوئیچ مشخص یا ممیزی یکپارچه تمام دیتاسنتر.'
                  }
                  example={
                    isEn
                      ? 'Selected (5 devices) or All (24 devices)'
                      : 'انتخاب‌شده‌ها (۵ تجهیز) یا تمام تجهیزات (۲۴ تجهیز)'
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setScope('selected')}
                  className={`p-3 rounded-xl border text-xs font-medium text-start transition flex items-center justify-between cursor-pointer ${
                    scope === 'selected'
                      ? isLightMode
                        ? 'bg-indigo-50/80 border-indigo-400 text-indigo-900 shadow-xs'
                        : 'bg-indigo-500/20 border-indigo-400 text-indigo-200 shadow-indigo-900/30'
                      : isLightMode
                      ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        scope === 'selected'
                          ? 'border-indigo-500 bg-indigo-500'
                          : 'border-slate-400'
                      }`}
                    >
                      {scope === 'selected' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="font-bold">
                        {isEn ? 'Selected Devices Only' : 'فقط تجهیزات انتخاب‌شده'}
                      </div>
                      <div className="text-[11px] opacity-75">
                        {isEn
                          ? `${selectedDeviceIds.size} specific items chosen from table`
                          : `${selectedDeviceIds.size} تجهیز علامت‌گذاری‌شده در جدول`}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-500/20 font-bold">
                    {selectedDeviceIds.size}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`p-3 rounded-xl border text-xs font-medium text-start transition flex items-center justify-between cursor-pointer ${
                    scope === 'all'
                      ? isLightMode
                        ? 'bg-indigo-50/80 border-indigo-400 text-indigo-900 shadow-xs'
                        : 'bg-indigo-500/20 border-indigo-400 text-indigo-200 shadow-indigo-900/30'
                      : isLightMode
                      ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        scope === 'all'
                          ? 'border-indigo-500 bg-indigo-500'
                          : 'border-slate-400'
                      }`}
                    >
                      {scope === 'all' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="font-bold">
                        {isEn ? 'Entire Inventory Fleet' : 'کل ناوگان تجهیزات'}
                      </div>
                      <div className="text-[11px] opacity-75">
                        {isEn ? 'All switches, routers and APs' : 'تمام سوئیچ‌ها، روترها و اکسس‌پوینت‌ها'}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-500/20 font-bold">
                    {devices.length}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Export File Format */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <span className={isLightMode ? 'text-slate-800' : 'text-slate-200'}>
                {isEn ? 'Export File Format:' : 'فرمت فایل خروجی:'}
              </span>
              <FieldInfoTooltip
                isEn={isEn}
                isLightMode={isLightMode}
                fieldName="File Export Format"
                whatIsIt={
                  isEn
                    ? 'Output file format for data serialization (JSON or CSV).'
                    : 'فرمت ذخیره‌سازی داده‌های استخراج‌شده شامل JSON یا CSV.'
                }
                whyNeeded={
                  isEn
                    ? 'JSON preserves full hierarchical interfaces & nested configurations; CSV opens directly in Microsoft Excel.'
                    : 'فرمت JSON تمام جزییات درختی پورت‌ها و VLAN را حفظ می‌کند؛ فرمت CSV مستقیماً در نرم‌افزار Excel باز می‌شود.'
                }
                example={
                  isEn
                    ? 'JSON for automated scripts / API; CSV for spreadsheet management.'
                    : 'JSON برای اسکریپت‌نویسی و انتقال دیتا؛ CSV برای حسابداری و اکسل.'
                }
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setFormat('json')}
                className={`p-3.5 rounded-xl border text-xs font-medium text-start transition flex items-start gap-3 cursor-pointer ${
                  format === 'json'
                    ? isLightMode
                      ? 'bg-cyan-50/80 border-cyan-400 text-cyan-950 shadow-xs'
                      : 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-cyan-900/30'
                    : isLightMode
                    ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-900'
                }`}
              >
                <div
                  className={`p-2 rounded-lg shrink-0 border ${
                    format === 'json'
                      ? 'bg-cyan-500 text-white border-cyan-400'
                      : isLightMode
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  <FileCode className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold flex items-center gap-1.5">
                    <span>JSON (Structured Hierarchy)</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold">
                      Complete
                    </span>
                  </div>
                  <p className="text-[11px] opacity-75 mt-0.5 leading-relaxed">
                    {isEn
                      ? 'Retains full port telemetry, VLAN IDs, physical placement, and Web configs.'
                      : 'شامل تمامی جزییات درختی پورت‌ها، شماره‌های VLAN، موقعیت رک و کنسول‌های وب.'}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`p-3.5 rounded-xl border text-xs font-medium text-start transition flex items-start gap-3 cursor-pointer ${
                  format === 'csv'
                    ? isLightMode
                      ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950 shadow-xs'
                      : 'bg-emerald-500/20 border-emerald-400 text-emerald-200 shadow-emerald-900/30'
                    : isLightMode
                    ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-900'
                }`}
              >
                <div
                  className={`p-2 rounded-lg shrink-0 border ${
                    format === 'csv'
                      ? 'bg-emerald-500 text-white border-emerald-400'
                      : isLightMode
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold flex items-center gap-1.5">
                    <span>CSV (Microsoft Excel & Tables)</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                      UTF-8 BOM
                    </span>
                  </div>
                  <p className="text-[11px] opacity-75 mt-0.5 leading-relaxed">
                    {isEn
                      ? 'Tabular format with BOM encoding for direct import into Excel and Google Sheets.'
                      : 'فرمت جدولی استاندارد با انکودینگ UTF-8 جهت باز کردن مستقیم در اکسل بدون بهم‌ریختگی حروف.'}
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Granular Content Options */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <span className={isLightMode ? 'text-slate-800' : 'text-slate-200'}>
                {isEn ? 'Inventory Content Options:' : 'گزینه‌های محتوای خروجی:'}
              </span>
              <FieldInfoTooltip
                isEn={isEn}
                isLightMode={isLightMode}
                fieldName="Export Content Inclusions"
                whatIsIt={
                  isEn
                    ? 'Configures whether to include deep port matrices, location tags, and operational notes.'
                    : 'تعیین اینکه آیا ماتریس پورت‌ها، تگ‌های مکانی و یادداشت‌های عملیاتی در خروجی قرار گیرند یا خیر.'
                }
                whyNeeded={
                  isEn
                    ? 'Minimizes file size or prevents disclosing internal infrastructure physical placements.'
                    : 'کاهش حجم فایل یا عدم افشای آدرس دقیق فیزیکی رک‌ها در گزارش‌های عمومی.'
                }
                example={
                  isEn
                    ? 'Uncheck physical placement if sharing data with external contractors.'
                    : 'غیرفعال کردن موقعیت فیزیکی هنگام ارائه گزارش به پیمانکاران خارجی.'
                }
              />
            </div>

            <div
              className={`p-3.5 rounded-xl border space-y-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <label className="flex items-center justify-between text-xs cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-500" />
                  <span className="font-medium">
                    {isEn
                      ? 'Include Interfaces & Port Telemetry'
                      : 'شامل بودن فهرست پورت‌ها و وضعیت اینترفیس‌ها'}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={includePorts}
                  onChange={(e) => setIncludePorts(e.target.checked)}
                  className="rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between text-xs cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-indigo-500" />
                  <span className="font-medium">
                    {isEn
                      ? 'Include Physical Placement (Building, Floor, Unit, Rack)'
                      : 'شامل بودن موقعیت فیزیکی (ساختمان، طبقه، واحد، رک)'}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={includePlacement}
                  onChange={(e) => setIncludePlacement(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between text-xs cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-500" />
                  <span className="font-medium">
                    {isEn
                      ? 'Include Device Sticky Notes & Annotations'
                      : 'شامل بودن یادداشت‌ها و استیکرهای توضیحی تجهیز'}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={includeNotes}
                  onChange={(e) => setIncludeNotes(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer w-4 h-4"
                />
              </label>
            </div>
          </div>

          {/* Security Guarantee Note adhering to Rule 14 (Zero plaintext credential leak) */}
          <div
            className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-mono ${
              isLightMode
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
            }`}
          >
            <Lock className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>
              {isEn
                ? 'Zero-Leak Credential Guarantee: Passwords, SSH secrets, and private keys are strictly stripped.'
                : 'تضمین عدم نشت اطلاعات: تمامی کلمات عبور، کلیدهای خصوصی SSH و سکرت‌ها پیش از ارسال پاکسازی می‌شوند.'}
            </span>
          </div>

          {/* Feedback messages */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successCount !== null && (
            <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {isEn
                  ? `Successfully generated export for ${successCount} devices.`
                  : `خروجی ${successCount} تجهیز با موفقیت ایجاد و دانلود شد.`}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`px-4 sm:px-6 py-3.5 border-t flex items-center justify-between gap-3 shrink-0 ${
            isLightMode
              ? 'bg-white border-slate-200'
              : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="text-xs text-slate-500 font-mono">
            {isEn ? `${devicesToExport.length} devices ready` : `${devicesToExport.length} تجهیز آماده دریافت`}
          </div>

          <div className="flex items-center gap-2 rtl:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className={`px-4 py-2 rounded-xl text-xs font-medium border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'border-white/10 text-slate-300 hover:bg-white/10'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>

            <button
              type="button"
              onClick={handleExecuteExport}
              disabled={!canExportAtLeastOne || isExporting}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white shadow-lg transition active:scale-95 cursor-pointer ${
                !canExportAtLeastOne || isExporting
                  ? 'bg-slate-600 opacity-50 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 shadow-cyan-500/20'
              }`}
            >
              <Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />
              <span>
                {isExporting
                  ? isEn
                    ? 'Exporting Data...'
                    : 'در حال تولید خروجی...'
                  : isEn
                  ? `Download ${format.toUpperCase()} Export (${devicesToExport.length})`
                  : `دانلود فایل خروجی ${format.toUpperCase()} (${devicesToExport.length})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
