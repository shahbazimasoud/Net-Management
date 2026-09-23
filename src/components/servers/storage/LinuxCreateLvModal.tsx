import React, { useState, useEffect } from 'react';
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
  Lock,
  HardDrive,
} from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';
import { LinuxVolumeGroup, LinuxLogicalVolume, LinuxLvmCreatePayload } from '../../../types';
import { FieldInfoTooltip } from '../../vpn/FieldInfoTooltip';
import { LinuxStorageConfirmationModal } from './LinuxStorageConfirmationModal';

export interface LinuxCreateLvModalProps {
  isOpen: boolean;
  onClose: () => void;
  volumeGroups: LinuxVolumeGroup[];
  existingLogicalVolumes?: LinuxLogicalVolume[];
  targetVgName?: string | null;
  onCreateLv: (payload: LinuxLvmCreatePayload) => Promise<void>;
  isLightMode?: boolean;
  isLoading?: boolean;
}

/**
 * Parses size strings like "200.00 GB", "20G", "500MB", "1.5T" to Megabytes (MB)
 */
export function parseSizeStringToMB(sizeStr: string): number | null {
  if (!sizeStr) return null;
  const s = sizeStr.trim().toUpperCase();
  if (s.includes('%')) return null; // e.g. 100%FREE
  const match = s.match(/^([0-9.]+)\s*([KMGTPE]?I?B?)$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num) || num <= 0) return null;
  const unit = match[2] || '';
  if (unit.startsWith('T')) return num * 1024 * 1024;
  if (unit.startsWith('G')) return num * 1024;
  if (unit.startsWith('M')) return num;
  if (unit.startsWith('K')) return num / 1024;
  if (unit.startsWith('P')) return num * 1024 * 1024 * 1024;
  return num * 1024; // default assume GB
}

export const LinuxCreateLvModal: React.FC<LinuxCreateLvModalProps> = ({
  isOpen,
  onClose,
  volumeGroups,
  existingLogicalVolumes = [],
  targetVgName = null,
  onCreateLv,
  isLightMode = false,
  isLoading = false,
}) => {
  const { isEn } = useLanguage();
  const [isMaximized, setIsMaximized] = useState(false);

  // If opened with targetVgName, lock to it; otherwise default to first available VG
  const [selectedVg, setSelectedVg] = useState<string>(() => {
    if (targetVgName && volumeGroups.some((vg) => vg.name === targetVgName)) {
      return targetVgName;
    }
    return volumeGroups[0]?.name || '';
  });

  const [lvName, setLvName] = useState('data_lv');
  const [size, setSize] = useState('20G');
  const [fsType, setFsType] = useState<'ext4' | 'xfs' | 'btrfs'>('ext4');
  const [mountPoint, setMountPoint] = useState('/mnt/data');
  const [persistInFstab, setPersistInFstab] = useState(true);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Synchronize VG state whenever modal opens or targetVgName changes
  useEffect(() => {
    if (isOpen) {
      setValidationError(null);
      if (targetVgName && volumeGroups.some((vg) => vg.name === targetVgName)) {
        setSelectedVg(targetVgName);
      } else if (!selectedVg || !volumeGroups.some((vg) => vg.name === selectedVg)) {
        setSelectedVg(volumeGroups[0]?.name || '');
      }
    }
  }, [isOpen, targetVgName, volumeGroups]);

  if (!isOpen) return null;

  const isVgLocked = Boolean(targetVgName && volumeGroups.some((vg) => vg.name === targetVgName));
  const currentVg = volumeGroups.find((vg) => vg.name === selectedVg);

  const handleStartCreate = () => {
    setValidationError(null);

    // 1. Validate VG
    if (!selectedVg) {
      setValidationError(isEn ? 'Please select a Volume Group.' : 'لطفاً یک گروه حجمی انتخاب کنید.');
      return;
    }

    if (!currentVg) {
      setValidationError(
        isEn
          ? `Volume Group "${selectedVg}" is not currently available.`
          : `گروه حجمی "${selectedVg}" در حال حاضر در دسترس نیست.`
      );
      return;
    }

    // 2. Validate LV Name
    const cleanLv = lvName.trim();
    if (!cleanLv) {
      setValidationError(isEn ? 'Please enter a valid Logical Volume name.' : 'لطفاً نام حجم منطقی را وارد کنید.');
      return;
    }

    if (!/^[a-zA-Z0-9_\-]+$/.test(cleanLv)) {
      setValidationError(
        isEn
          ? 'LV name may only contain letters, numbers, underscores, and hyphens.'
          : 'نام حجم منطقی تنها می‌تواند شامل حروف انگلیسی، اعداد، خط زیر و خط تیره باشد.'
      );
      return;
    }

    // Check duplicate LV name in this VG
    const isDuplicate =
      existingLogicalVolumes.some(
        (lv) => lv.vgName === selectedVg && lv.name.toLowerCase() === cleanLv.toLowerCase()
      ) ||
      (currentVg.lvs && currentVg.lvs.some((l) => l.toLowerCase() === cleanLv.toLowerCase()));

    if (isDuplicate) {
      setValidationError(
        isEn
          ? `A Logical Volume named "${cleanLv}" already exists in Volume Group "${selectedVg}". Please choose a unique name.`
          : `یک حجم منطقی با نام "${cleanLv}" از قبل در گروه حجمی "${selectedVg}" وجود دارد. لطفاً نام دیگری انتخاب کنید.`
      );
      return;
    }

    // 3. Validate Size
    const cleanSize = size.trim().toUpperCase();
    if (!cleanSize) {
      setValidationError(
        isEn ? 'Please specify an allocation size (e.g. 20G or 100%FREE).' : 'لطفاً حجم تخصیصی را وارد کنید (مثال: 20G یا 100%FREE).'
      );
      return;
    }

    // Check free space if not 100%FREE
    if (cleanSize === '100%FREE' || cleanSize === '100% FREE') {
      // Valid LVM parameter
    } else {
      const isFormatValid = /^[0-9.]+\s*[KMGTPE]?I?B?$/i.test(cleanSize);
      if (!isFormatValid) {
        setValidationError(
          isEn
            ? 'Invalid size format. Examples: 20G, 500M, 1.5T, 100%FREE'
            : 'فرمت حجم نامعتبر است. نمونه‌ها: 20G یا 500M یا 1.5T یا 100%FREE'
        );
        return;
      }

      const reqMB = parseSizeStringToMB(cleanSize);
      const freeMB = parseSizeStringToMB(currentVg.freeSize);

      if (reqMB !== null && freeMB !== null && reqMB > freeMB) {
        setValidationError(
          isEn
            ? `Insufficient free space in Volume Group "${currentVg.name}". Available: ${currentVg.freeSize}, Requested: ${cleanSize}.`
            : `فضای آزاد کافی در گروه حجمی "${currentVg.name}" وجود ندارد. فضای در دسترس: ${currentVg.freeSize}، فضای درخواستی: ${cleanSize}.`
        );
        return;
      }
    }

    // 4. Validate Mount Point if provided
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

          {/* Volume Group Selection or Locked Context */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-cyan-400" />
                <span>
                  {isVgLocked
                    ? isEn
                      ? 'Target Volume Group (VG)'
                      : 'گروه حجمی هدف (VG)'
                    : isEn
                    ? 'Select Volume Group (VG)'
                    : 'انتخاب گروه حجمی (VG)'}
                </span>
              </label>

              {isVgLocked ? (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>{isEn ? 'Inherited Context' : 'از گروه انتخابی'}</span>
                </span>
              ) : (
                <FieldInfoTooltip
                  title={isEn ? 'Volume Group Selection' : 'انتخاب گروه حجمی'}
                  whatIsIt={
                    isEn
                      ? 'The storage pool from which this Logical Volume will be carved out.'
                      : 'استخر ذخیره‌سازی که این حجم منطقی از فضای آن ساخته می‌شود.'
                  }
                  whyIsItNeeded={
                    isEn
                      ? 'Every Logical Volume must reside inside an existing Volume Group.'
                      : 'هر درایو منطقی باید متعلق به یک گروه حجمی باشد.'
                  }
                  practicalExample="ubuntu-vg, data-vg"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              )}
            </div>

            {isVgLocked ? (
              <div
                className={`w-full px-3.5 py-2.5 rounded-lg border text-xs font-mono flex items-center justify-between shadow-xs ${
                  isLightMode ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-slate-950/80 border-slate-700 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-cyan-400" />
                  <span className="font-bold text-cyan-400">{selectedVg}</span>
                  {currentVg && (
                    <span className="text-[11px] text-slate-400">
                      ({isEn ? 'Total:' : 'کل:'} {currentVg.totalSize})
                    </span>
                  )}
                </div>
                {currentVg && (
                  <div className="flex items-center gap-1 text-[11px]">
                    <span className="text-slate-400">{isEn ? 'Free:' : 'آزاد:'}</span>
                    <span className="text-emerald-400 font-bold">{currentVg.freeSize}</span>
                  </div>
                )}
              </div>
            ) : (
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
            )}

            {currentVg && !isVgLocked && (
              <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                <span>{isEn ? 'Available free space in VG:' : 'فضای آزاد در دسترس در VG:'}</span>
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
                {currentVg && (
                  <button
                    type="button"
                    onClick={() => setSize('100%FREE')}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-colors cursor-pointer"
                    title={isEn ? 'Carve out all remaining free extents in this VG' : 'تخصیص تمام فضای آزاد باقیمانده در این VG'}
                  >
                    {isEn ? 'Use All Free Space' : 'تمام فضای آزاد'}
                  </button>
                )}
              </div>
              <input
                type="text"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="20G or 100%FREE"
                className={`w-full px-3 py-2 rounded-lg border text-xs font-mono focus:outline-none ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800'
                    : 'bg-slate-950 border-slate-700 text-slate-100'
                }`}
              />

              {/* Quick size presets */}
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[10px] text-slate-400">{isEn ? 'Presets:' : 'پیش‌فرض‌ها:'}</span>
                {['5G', '10G', '20G', '50G', '100%FREE'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSize(preset)}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                      size.toUpperCase() === preset
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                        : isLightMode
                        ? 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
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
