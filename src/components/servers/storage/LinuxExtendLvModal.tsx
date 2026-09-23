import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Layers,
  X,
  Minus,
  Maximize2,
  Minimize2,
  HardDrive,
  Maximize,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';
import { LinuxLogicalVolume, LinuxVolumeGroup, LinuxRawDisk } from '../../../types';
import { FieldInfoTooltip } from '../../vpn/FieldInfoTooltip';
import { LinuxStorageConfirmationModal } from './LinuxStorageConfirmationModal';

export interface LinuxExtendLvModalProps {
  isOpen: boolean;
  onClose: () => void;
  lv: LinuxLogicalVolume | null;
  volumeGroups: LinuxVolumeGroup[];
  availableDisks?: LinuxRawDisk[];
  onExtend: (params: {
    lvPath: string;
    vgName: string;
    addSize: string;
    diskToAddToVg?: string;
  }) => Promise<void>;
  isLightMode?: boolean;
  isLoading?: boolean;
}

export const LinuxExtendLvModal: React.FC<LinuxExtendLvModalProps> = ({
  isOpen,
  onClose,
  lv,
  volumeGroups,
  availableDisks = [],
  onExtend,
  isLightMode = false,
  isLoading = false,
}) => {
  const { isEn } = useLanguage();
  const [isMaximized, setIsMaximized] = useState(false);
  const [addSize, setAddSize] = useState('10G');
  const [diskToAddToVg, setDiskToAddToVg] = useState('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen || !lv) return null;

  const currentVg = volumeGroups.find((vg) => vg.name === lv.vgName);
  const vgFreeStr = currentVg?.freeSize || '0 GB';
  const vgTotalStr = currentVg?.totalSize || '0 GB';

  const handleStartExtend = () => {
    setValidationError(null);
    const cleanSize = addSize.trim().toUpperCase();
    if (!cleanSize) {
      setValidationError(isEn ? 'Please specify the size to add (e.g. 10G or 100%FREE).' : 'لطفاً میزان حجم افزایش را مشخص کنید (مثال: 10G یا 100%FREE).');
      return;
    }

    if (!cleanSize.endsWith('G') && !cleanSize.endsWith('M') && !cleanSize.endsWith('T') && cleanSize !== '100%FREE') {
      setValidationError(isEn ? 'Size unit must be G, M, T or 100%FREE (e.g. 5G, 20G).' : 'واحد حجم باید G, M, T یا 100%FREE باشد (مثال: 5G, 20G).');
      return;
    }

    setIsConfirmOpen(true);
  };

  const handleExecuteConfirmed = async () => {
    setIsConfirmOpen(false);
    await onExtend({
      lvPath: lv.path,
      vgName: lv.vgName,
      addSize: addSize.trim().toUpperCase(),
      diskToAddToVg: diskToAddToVg || undefined,
    });
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div
        className={`relative flex flex-col transition-all duration-200 overflow-hidden shadow-2xl border ${
          isMaximized
            ? 'fixed top-0 left-0 right-0 bottom-8 z-50 p-0 w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-xl rounded-xl'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-900 border-slate-700/80 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b select-none ${
            isLightMode ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-slate-800/80 border-slate-700 text-slate-100'
          }`}
        >
          <div className="flex items-center gap-2.5 font-semibold text-sm">
            <Maximize className="w-5 h-5 text-emerald-400" />
            <span>
              {isEn ? `Extend Logical Volume: ${lv.name}` : `توسعه حجم منطقی: ${lv.name}`}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onClose}
              title={isEn ? 'Minimize' : 'کوچک کردن'}
              className={`p-1.5 rounded-md transition-colors ${
                isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-700 text-slate-300'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsMaximized((prev) => !prev)}
              title={isEn ? (isMaximized ? 'Exit Fullscreen' : 'Fullscreen') : isMaximized ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}
              className={`p-1.5 rounded-md transition-colors ${
                isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-700 text-slate-300'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className={`p-1.5 rounded-md transition-colors ${
                isLightMode ? 'hover:bg-rose-100 text-rose-600' : 'hover:bg-rose-900/40 text-rose-400'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Current State Grid */}
        <div
          className={`px-5 py-3.5 border-b grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}
        >
          <div>
            <div className="text-slate-400 text-[11px]">{isEn ? 'Current LV Size' : 'حجم فعلی LV'}</div>
            <div className="font-bold text-cyan-400 text-sm mt-0.5">{lv.size}</div>
          </div>
          <div>
            <div className="text-slate-400 text-[11px]">{isEn ? 'Volume Group' : 'گروه حجمی'}</div>
            <div className="font-semibold text-slate-200 mt-0.5">{lv.vgName}</div>
          </div>
          <div>
            <div className="text-slate-400 text-[11px]">{isEn ? 'VG Free Space' : 'فضای آزاد VG'}</div>
            <div className="font-bold text-emerald-400 text-sm mt-0.5">{vgFreeStr}</div>
          </div>
          <div>
            <div className="text-slate-400 text-[11px]">{isEn ? 'Filesystem / Mount' : 'فایل‌سیستم / مانت'}</div>
            <div className="font-medium text-slate-300 mt-0.5 truncate">
              {lv.fsType || 'ext4'} {lv.mountPoint ? `(${lv.mountPoint})` : ''}
            </div>
          </div>
        </div>

        {/* Form Body */}
        <div className="flex-1 p-5 space-y-4 overflow-y-auto">
          {validationError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Size Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <span>{isEn ? 'Additional Capacity to Add (+Size)' : 'حجم افزایشی مورد نظر (+Size)'}</span>
              </label>
              <FieldInfoTooltip
                title={isEn ? 'Logical Volume Extension Size' : 'میزان افزایش حجم منطقی'}
                whatIsIt={
                  isEn
                    ? 'The amount of disk space to expand the LV by (e.g. +10G, +50G, or 100%FREE).'
                    : 'میزان حجمی که به حجم منطقی فعلی اضافه می‌شود (مثال: 10G یا 100%FREE).'
                }
                whyIsItNeeded={
                  isEn
                    ? 'lvextend allocates additional physical extents from the VG, followed by automatic online filesystem resizing.'
                    : 'دستور lvextend اکستنت‌های فیزیکی جدید از VG را تخصیص داده و سپس فایل‌سیستم آنلاین بزرگ می‌شود.'
                }
                practicalExample="10G or 50G or 100%FREE"
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={addSize}
                onChange={(e) => setAddSize(e.target.value)}
                placeholder="10G"
                className={`flex-1 px-3.5 py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800'
                    : 'bg-slate-950 border-slate-700 text-slate-100'
                }`}
              />
              {['5G', '10G', '20G', '50G', '100%FREE'].map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setAddSize(sug)}
                  className={`px-2.5 py-2 rounded-lg border text-xs font-mono font-medium transition-colors ${
                    addSize === sug
                      ? 'bg-emerald-500 text-white border-emerald-500 shadow'
                      : isLightMode
                      ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  +{sug}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Disk Addition if VG has no space */}
          {availableDisks.filter((d) => d.isAvailable && !d.isInLvm).length > 0 && (
            <div
              className={`p-3.5 rounded-xl border ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-cyan-400" />
                  <span>{isEn ? 'Attach Unused Disk to VG First (Optional)' : 'افزودن دیسک جدید به VG قبل از توسعه (اختیاری)'}</span>
                </label>
              </div>
              <select
                value={diskToAddToVg}
                onChange={(e) => setDiskToAddToVg(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-xs font-mono focus:outline-none ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800'
                    : 'bg-slate-900 border-slate-700 text-slate-100'
                }`}
              >
                <option value="">{isEn ? '-- None (Use Existing VG Free Space) --' : '-- هیچ‌کدام (استفاده از فضای آزاد فعلی VG) --'}</option>
                {availableDisks
                  .filter((d) => d.isAvailable && !d.isInLvm)
                  .map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name} ({d.size}) - {isEn ? 'Unallocated Disk' : 'دیسک آزاد'}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Pipeline Diagram */}
          <div
            className={`p-3.5 rounded-xl border text-xs ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}
          >
            <div className="font-semibold text-slate-400 text-[11px] mb-2">
              {isEn ? 'End-to-End Execution Pipeline:' : 'فرآیند اجرایی پیوسته در لینوکس:'}
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] flex-wrap">
              <span className="text-emerald-400 font-bold">VG Free ({vgFreeStr})</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-cyan-400 font-bold">lvextend +{addSize}</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-purple-400 font-bold">
                {lv.fsType === 'xfs' ? 'xfs_growfs' : 'resize2fs'} (Online Grow)
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-amber-400 font-bold">{lv.mountPoint || lv.path} Expanded</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-2">
              {isEn
                ? 'Filesystem expansion occurs online without unmounting the volume or stopping services.'
                : 'گسترش فایل‌سیستم به صورت کاملاً آنلاین و بدون نیاز به unmount کردن یا توقف سرویس‌ها انجام می‌پذیرد.'}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-t ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="text-[11px] text-slate-400">
            {isEn ? 'Target:' : 'هدف:'} <span className="font-mono text-cyan-400 font-bold">{lv.path}</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                isLightMode
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>
            <button
              type="button"
              onClick={handleStartExtend}
              disabled={isLoading || !addSize.trim()}
              className="px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 active:scale-98 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isEn ? 'Extend Volume & Grow Filesystem' : 'توسعه حجم و بزرگ‌سازی فایل‌سیستم'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <LinuxStorageConfirmationModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleExecuteConfirmed}
        title={isEn ? 'Confirm Logical Volume Extension' : 'تایید توسعه حجم منطقی'}
        description={
          isEn
            ? `You are about to extend Logical Volume "${lv.name}" by +${addSize} and expand the mounted ${lv.fsType || 'ext4'} filesystem. This is an online, non-destructive operation.`
            : `شما در حال توسعه حجم منطقی "${lv.name}" به میزان +${addSize} و بزرگ‌سازی آنلاین فایل‌سیستم ${lv.fsType || 'ext4'} هستید. این فرآیند بدون قطعی و بدون از بین رفتن داده‌ها انجام می‌شود.`
        }
        targetDevice={lv.path}
        actionType="lvextend"
        isLightMode={isLightMode}
        isLoading={isLoading}
      />
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
