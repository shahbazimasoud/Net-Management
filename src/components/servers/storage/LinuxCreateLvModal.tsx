import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Layers,
  X,
  Minus,
  Maximize2,
  Minimize2,
  FolderPlus,
  Database,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';
import { LinuxVolumeGroup, LinuxLvmCreatePayload } from '../../../types';
import { FieldInfoTooltip } from '../../vpn/FieldInfoTooltip';
import { LinuxStorageConfirmationModal } from './LinuxStorageConfirmationModal';

export interface LinuxCreateLvModalProps {
  isOpen: boolean;
  onClose: () => void;
  volumeGroups: LinuxVolumeGroup[];
  onCreateLv: (payload: LinuxLvmCreatePayload) => Promise<void>;
  isLightMode?: boolean;
  isLoading?: boolean;
}

export const LinuxCreateLvModal: React.FC<LinuxCreateLvModalProps> = ({
  isOpen,
  onClose,
  volumeGroups,
  onCreateLv,
  isLightMode = false,
  isLoading = false,
}) => {
  const { isEn } = useLanguage();
  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedVg, setSelectedVg] = useState<string>(volumeGroups[0]?.name || '');
  const [lvName, setLvName] = useState('data_lv');
  const [size, setSize] = useState('20G');
  const [fsType, setFsType] = useState<'ext4' | 'xfs' | 'btrfs'>('ext4');
  const [mountPoint, setMountPoint] = useState('/mnt/data');
  const [persistInFstab, setPersistInFstab] = useState(true);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentVg = volumeGroups.find((vg) => vg.name === selectedVg);

  const handleStartCreate = () => {
    setValidationError(null);
    if (!selectedVg) {
      setValidationError(isEn ? 'Please select a Volume Group.' : 'لطفاً یک گروه حجمی انتخاب کنید.');
      return;
    }
    const cleanLv = lvName.trim().replace(/[^a-zA-Z0-9_\-]/g, '');
    if (!cleanLv) {
      setValidationError(isEn ? 'Please enter a valid Logical Volume name.' : 'لطفاً یک نام معتبر برای حجم منطقی وارد کنید.');
      return;
    }
    const cleanSize = size.trim().toUpperCase();
    if (!cleanSize) {
      setValidationError(isEn ? 'Please enter a valid size (e.g. 20G or 100%FREE).' : 'لطفاً حجم مورد نظر را وارد کنید (مثال: 20G یا 100%FREE).');
      return;
    }
    if (mountPoint.trim()) {
      if (!mountPoint.trim().startsWith('/')) {
        setValidationError(isEn ? 'Mount point must be an absolute path starting with /.' : 'مسیر مانت باید با / شروع شود.');
        return;
      }
      const forbidden = ['/', '/boot', '/proc', '/sys', '/dev', '/etc', '/bin', '/sbin', '/lib', '/usr', '/var'];
      if (forbidden.includes(mountPoint.trim())) {
        setValidationError(isEn ? 'Mounting to core system path is prohibited.' : 'مانت در مسیرهای ریشه سیستم مجاز نیست.');
        return;
      }
    }

    setIsConfirmOpen(true);
  };

  const handleExecuteConfirmed = async () => {
    setIsConfirmOpen(false);
    await onCreateLv({
      isNewVg: false,
      vgName: selectedVg,
      lvName: lvName.trim(),
      size: size.trim().toUpperCase(),
      fsType,
      mountPath: mountPoint.trim() || undefined,
      persistInFstab,
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
            <FolderPlus className="w-5 h-5 text-cyan-400" />
            <span>{isEn ? 'Create New Logical Volume (LV)' : 'ایجاد حجم منطقی جدید (LV)'}</span>
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

        {/* Form Body */}
        <div className="flex-1 p-5 space-y-4 overflow-y-auto">
          {validationError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Volume Group Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-cyan-400" />
                <span>{isEn ? 'Select Volume Group (VG)' : 'انتخاب گروه حجمی (VG)'}</span>
              </label>
            </div>
            <select
              value={selectedVg}
              onChange={(e) => setSelectedVg(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border text-xs font-mono focus:outline-none ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800'
                  : 'bg-slate-950 border-slate-700 text-slate-100'
              }`}
            >
              {volumeGroups.map((vg) => (
                <option key={vg.name} value={vg.name}>
                  {vg.name} (Free: {vg.freeSize} / Total: {vg.totalSize})
                </option>
              ))}
            </select>
            {currentVg && (
              <div className="text-[11px] text-slate-400 mt-1">
                {isEn ? 'Available free space in VG:' : 'فضای آزاد در دسترس در VG:'}{' '}
                <span className="text-emerald-400 font-bold font-mono">{currentVg.freeSize}</span>
              </div>
            )}
          </div>

          {/* LV Name & Size */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Logical Volume Name' : 'نام حجم منطقی (LV)'}
                </label>
                <FieldInfoTooltip
                  title={isEn ? 'LV Identifier' : 'شناسه حجم منطقی'}
                  whatIsIt={isEn ? 'The name given to the new Logical Volume device.' : 'نام مشخصه جهت شناسایی دیوایس در لینوکس.'}
                  whyIsItNeeded={isEn ? 'Creates /dev/vg_name/lv_name device node.' : 'جهت دسترسی به مسیر دیوایس در هسته سیستم‌عامل.'}
                  practicalExample="data_lv or app_storage"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <input
                type="text"
                value={lvName}
                onChange={(e) => setLvName(e.target.value)}
                placeholder="data_lv"
                className={`w-full px-3 py-2 rounded-lg border text-xs font-mono focus:outline-none ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800'
                    : 'bg-slate-950 border-slate-700 text-slate-100'
                }`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Allocation Size' : 'حجم تخصیصی'}
                </label>
                <FieldInfoTooltip
                  title={isEn ? 'LV Size' : 'حجم LV'}
                  whatIsIt={isEn ? 'The capacity to carve out from the Volume Group.' : 'میزان حجمی که از گروه حجمی کسر و به این LV اختصاص می‌یابد.'}
                  whyIsItNeeded={isEn ? 'Determines disk space of the filesystem.' : 'تعیین‌کننده حجم نهایی فایل‌سیستم است.'}
                  practicalExample="20G or 100%FREE"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <input
                type="text"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="20G"
                className={`w-full px-3 py-2 rounded-lg border text-xs font-mono focus:outline-none ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800'
                    : 'bg-slate-950 border-slate-700 text-slate-100'
                }`}
              />
            </div>
          </div>

          {/* Filesystem Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isEn ? 'Filesystem Type' : 'نوع فایل‌سیستم'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['ext4', 'xfs', 'btrfs'] as const).map((fs) => (
                <button
                  key={fs}
                  type="button"
                  onClick={() => setFsType(fs)}
                  className={`py-2 px-3 rounded-lg border text-xs font-mono font-semibold transition-all ${
                    fsType === fs
                      ? 'bg-cyan-500 text-white border-cyan-500 shadow'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {fs.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Mount Point & Persist */}
          <div className="space-y-3 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {isEn ? 'Mount Point Path (Optional)' : 'مسیر نقطه مانت (اختیاری)'}
              </label>
              <input
                type="text"
                value={mountPoint}
                onChange={(e) => setMountPoint(e.target.value)}
                placeholder="/mnt/data"
                className={`w-full px-3 py-2 rounded-lg border text-xs font-mono focus:outline-none ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800'
                    : 'bg-slate-950 border-slate-700 text-slate-100'
                }`}
              />
            </div>

            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={persistInFstab}
                onChange={(e) => setPersistInFstab(e.target.checked)}
                className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500"
              />
              <span className="font-medium text-slate-300">
                {isEn ? 'Persist in /etc/fstab (auto-mount on boot)' : 'ثبت در /etc/fstab (مانت خودکار در ریبوت)'}
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-end gap-3 px-5 py-3.5 border-t ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
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
            onClick={handleStartCreate}
            disabled={isLoading || !lvName.trim() || !size.trim()}
            className="px-5 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/30 active:scale-98 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isEn ? 'Create Logical Volume' : 'ایجاد حجم منطقی'}</span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      <LinuxStorageConfirmationModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleExecuteConfirmed}
        title={isEn ? 'Confirm Create Logical Volume' : 'تایید ساخت حجم منطقی'}
        description={
          isEn
            ? `You are about to create Logical Volume "${lvName}" of size ${size} in Volume Group "${selectedVg}" with ${fsType.toUpperCase()} filesystem${mountPoint ? ` mounted at ${mountPoint}` : ''}.`
            : `شما در حال ایجاد حجم منطقی "${lvName}" به ظرفیت ${size} در گروه حجمی "${selectedVg}" با فایل‌سیستم ${fsType.toUpperCase()}${mountPoint ? ` و مانت در ${mountPoint}` : ''} هستید.`
        }
        targetDevice={`/dev/${selectedVg}/${lvName}`}
        actionType="generic"
        isLightMode={isLightMode}
        isLoading={isLoading}
      />
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
