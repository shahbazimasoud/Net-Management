import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HardDrive,
  X,
  Minus,
  Maximize2,
  Minimize2,
  FolderPlus,
  Layers,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';
import { LinuxPhysicalDisk, LinuxVolumeGroup, LinuxDiskFormatMountPayload } from '../../../types';
import { FieldInfoTooltip } from '../../vpn/FieldInfoTooltip';
import { LinuxStorageConfirmationModal } from './LinuxStorageConfirmationModal';

export interface LinuxDiskManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  disk: LinuxPhysicalDisk | null;
  volumeGroups: LinuxVolumeGroup[];
  onFormatAndMount: (payload: LinuxDiskFormatMountPayload) => Promise<void>;
  onAddDiskToLvm: (diskPath: string, targetVg: string) => Promise<void>;
  isLightMode?: boolean;
  isLoading?: boolean;
}

export const LinuxDiskManageModal: React.FC<LinuxDiskManageModalProps> = ({
  isOpen,
  onClose,
  disk,
  volumeGroups,
  onFormatAndMount,
  onAddDiskToLvm,
  isLightMode = false,
  isLoading = false,
}) => {
  const { isEn } = useLanguage();
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeWorkflow, setActiveWorkflow] = useState<'format' | 'lvm'>('format');

  // Workflow A state
  const [partition, setPartition] = useState(true);
  const [fsType, setFsType] = useState<'ext4' | 'xfs' | 'btrfs'>('ext4');
  const [mountPath, setMountPath] = useState('/data');
  const [label, setLabel] = useState('');
  const [persistInFstab, setPersistInFstab] = useState(true);

  // Workflow B state
  const [selectedVg, setSelectedVg] = useState<string>(volumeGroups[0]?.name || '');

  // Confirmation state
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen || !disk) return null;

  const handleStartAction = () => {
    setValidationError(null);
    if (activeWorkflow === 'format') {
      const cleanMount = mountPath.trim();
      if (!cleanMount.startsWith('/')) {
        setValidationError(isEn ? 'Mount point must be an absolute path starting with /' : 'مسیر مانت باید با / شروع شود');
        return;
      }
      const forbidden = ['/', '/boot', '/proc', '/sys', '/dev', '/etc', '/bin', '/sbin', '/lib', '/usr', '/var'];
      if (forbidden.includes(cleanMount)) {
        setValidationError(
          isEn
            ? `Mounting directly to system path "${cleanMount}" is prohibited for system stability.`
            : `مانت مستقیم روی مسیر سیستمی "${cleanMount}" به منظور حفظ امنیت سیستم مجاز نیست.`
        );
        return;
      }
      setIsConfirmOpen(true);
    } else {
      if (!selectedVg) {
        setValidationError(isEn ? 'Please select a target Volume Group.' : 'لطفاً یک گروه حجمی (VG) انتخاب کنید.');
        return;
      }
      setIsConfirmOpen(true);
    }
  };

  const handleExecuteConfirmed = async () => {
    setIsConfirmOpen(false);
    if (activeWorkflow === 'format') {
      await onFormatAndMount({
        diskPath: disk.name,
        partition,
        fsType,
        mountPath: mountPath.trim(),
        label: label.trim() || undefined,
        persistInFstab,
      });
    } else {
      await onAddDiskToLvm(disk.name, selectedVg);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div
        className={`relative flex flex-col transition-all duration-200 overflow-hidden shadow-2xl border ${
          isMaximized
            ? 'fixed top-0 left-0 right-0 bottom-8 z-50 p-0 w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-2xl rounded-xl'
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
            <HardDrive className="w-5 h-5 text-cyan-500" />
            <span>
              {isEn ? `Manage Disk: ${disk.name}` : `مدیریت دیسک: ${disk.name}`}
            </span>
            <span
              className={`px-2 py-0.5 text-[11px] font-bold rounded-full uppercase tracking-wider ${
                disk.isAvailable
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              {disk.isAvailable ? (isEn ? 'Unused / Available' : 'آزاد / استفاده‌نشده') : (isEn ? 'In Use' : 'در حال استفاده')}
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

        {/* Disk Summary Info Banner */}
        <div
          className={`px-5 py-3 border-b grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}
        >
          <div>
            <div className="text-slate-400 text-[11px]">{isEn ? 'Device Path' : 'مسیر تجهیز'}</div>
            <div className="font-mono font-bold text-cyan-400 text-xs mt-0.5">{disk.name}</div>
          </div>
          <div>
            <div className="text-slate-400 text-[11px]">{isEn ? 'Capacity' : 'ظرفیت'}</div>
            <div className="font-semibold mt-0.5">{disk.size}</div>
          </div>
          <div>
            <div className="text-slate-400 text-[11px]">{isEn ? 'Media Type / Bus' : 'نوع رسانه / درگاه'}</div>
            <div className="font-semibold mt-0.5">
              <span className="text-purple-400">{disk.mediaType}</span>
              {disk.transport && <span className="text-slate-400"> ({disk.transport})</span>}
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-[11px]">{isEn ? 'Model / Serial' : 'مدل / سریال'}</div>
            <div className="font-medium truncate mt-0.5 text-slate-300">
              {disk.model || disk.serial || '-'}
            </div>
          </div>
        </div>

        {/* Workflow Switcher Tabs */}
        <div className={`p-4 border-b ${isLightMode ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'}`}>
          <div className="text-xs font-semibold text-slate-400 mb-2.5">
            {isEn ? 'Select Provisioning Workflow:' : 'انتخاب سناریوی پیکربندی:'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Workflow A Card */}
            <button
              type="button"
              onClick={() => setActiveWorkflow('format')}
              className={`p-3.5 rounded-xl border text-left transition-all relative flex items-start gap-3 ${
                activeWorkflow === 'format'
                  ? isLightMode
                    ? 'border-cyan-500 bg-cyan-50/50 shadow-md ring-1 ring-cyan-500/20'
                    : 'border-cyan-500 bg-cyan-950/30 shadow-md ring-1 ring-cyan-500/30 text-cyan-100'
                  : isLightMode
                  ? 'border-slate-200 hover:border-slate-300 bg-slate-50'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-300'
              }`}
            >
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  activeWorkflow === 'format'
                    ? 'bg-cyan-500 text-white shadow'
                    : isLightMode ? 'bg-slate-200 text-slate-600' : 'bg-slate-800 text-slate-400'
                }`}
              >
                <FolderPlus className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-xs flex items-center justify-between">
                  <span>{isEn ? 'Workflow A: Create Filesystem' : 'سناریو ۱: ساخت فایل‌سیستم مستقل'}</span>
                  {activeWorkflow === 'format' && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  {isEn
                    ? 'Partition disk, format with ext4/xfs/btrfs, and mount to an absolute folder path.'
                    : 'پارتیشن‌بندی دیسک، فرمت با ext4/xfs/btrfs و مانت فوری به یک پوشه دلخواه.'}
                </div>
              </div>
            </button>

            {/* Workflow B Card */}
            <button
              type="button"
              onClick={() => setActiveWorkflow('lvm')}
              className={`p-3.5 rounded-xl border text-left transition-all relative flex items-start gap-3 ${
                activeWorkflow === 'lvm'
                  ? isLightMode
                    ? 'border-cyan-500 bg-cyan-50/50 shadow-md ring-1 ring-cyan-500/20'
                    : 'border-cyan-500 bg-cyan-950/30 shadow-md ring-1 ring-cyan-500/30 text-cyan-100'
                  : isLightMode
                  ? 'border-slate-200 hover:border-slate-300 bg-slate-50'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-300'
              }`}
            >
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  activeWorkflow === 'lvm'
                    ? 'bg-cyan-500 text-white shadow'
                    : isLightMode ? 'bg-slate-200 text-slate-600' : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Layers className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-xs flex items-center justify-between">
                  <span>{isEn ? 'Workflow B: Add to LVM' : 'سناریو ۲: افزودن دیسک به LVM'}</span>
                  {activeWorkflow === 'lvm' && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  {isEn
                    ? 'Initialize disk as Physical Volume (PV) and attach to an existing Volume Group (VG).'
                    : 'ایجاد Physical Volume از دیسک و الحاق به Volume Group موجود جهت افزایش فضای خام.'}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Workflow Configuration Form */}
        <div className="flex-1 p-5 space-y-4 overflow-y-auto">
          {validationError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{validationError}</span>
            </div>
          )}

          {activeWorkflow === 'format' ? (
            /* Workflow A: Create New Filesystem Form */
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Partition Scheme */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <span>{isEn ? 'Partitioning' : 'پارتیشن‌بندی'}</span>
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'Partition Table Scheme' : 'طرح پارتیشن‌بندی'}
                      whatIsIt={
                        isEn
                          ? 'Creates a standard GPT partition table spanning 100% of the disk.'
                          : 'یک جدول پارتیشن استاندارد GPT برای کل دیسک ایجاد می‌کند.'
                      }
                      whyIsItNeeded={
                        isEn
                          ? 'Partition tables ensure standard kernel device alignment and protect against accidental overwrite.'
                          : 'پارتیشن استاندارد مانع از بازنویسی اشتباهی داده‌ها شده و با استاندارد لینوکس هماهنگ است.'
                      }
                      practicalExample="GPT with single primary partition (recommended)"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={partition}
                        onChange={(e) => setPartition(e.target.checked)}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500"
                      />
                      <span>
                        {isEn ? 'Create standard GPT partition (disk1)' : 'ایجاد پارتیشن استاندارد GPT (مثال: sdb1)'}
                      </span>
                    </label>
                  </div>
                </div>

                {/* Filesystem Type */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <span>{isEn ? 'Filesystem Type' : 'نوع فایل‌سیستم'}</span>
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'Linux Filesystem Type' : 'نوع فایل‌سیستم لینوکس'}
                      whatIsIt={
                        isEn
                          ? 'The file structure used to store and organize data on the disk.'
                          : 'ساختار ذخیره‌سازی داده‌ها و اینودها بر روی دیسک.'
                      }
                      whyIsItNeeded={
                        isEn
                          ? 'Different filesystems provide different features (e.g. ext4 for general stability, XFS for large files/databases, Btrfs for snapshots).'
                          : 'انتخاب فایل‌سیستم متناسب با نوع سناریو (ext4 عمومی، XFS برای دیتابیس و فایل‌های حجیم).'
                      }
                      practicalExample="ext4 (default) or xfs"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
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
              </div>

              {/* Mount Point Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <span>{isEn ? 'Mount Point Directory' : 'مسیر پوشه مانت'}</span>
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Mount Point Path' : 'مسیر نقطه مانت'}
                    whatIsIt={
                      isEn
                        ? 'The absolute folder path on the Linux filesystem where this storage will be attached.'
                        : 'مسیر مطلق پوشه در سلسله‌مراتب فایل لینوکس که دیسک در آن متصل می‌شود.'
                    }
                    whyIsItNeeded={
                      isEn
                        ? 'Applications and users access disk files through this directory path.'
                        : 'دسترسی برنامه‌ها و سرویس‌ها به فایل‌های دیسک از طریق این پوشه انجام می‌پذیرد.'
                    }
                    practicalExample="/data or /backup or /mnt/storage"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
                <input
                  type="text"
                  value={mountPath}
                  onChange={(e) => setMountPath(e.target.value)}
                  placeholder="/data"
                  className={`w-full px-3 py-2 rounded-lg border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/30 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800'
                      : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                />
                <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400">
                  <span>{isEn ? 'Suggestions:' : 'مسیرهای متداول:'}</span>
                  {['/data', '/backup', '/var/storage', '/mnt/disk2'].map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setMountPath(sug)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-[10px]"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Label & Persist Checkbox */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {isEn ? 'Filesystem Label (Optional)' : 'برچسب فایل‌سیستم (اختیاری)'}
                  </label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. DATA_STORAGE"
                    className={`w-full px-3 py-2 rounded-lg border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/30 ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-800'
                        : 'bg-slate-950 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 text-xs cursor-pointer select-none py-2">
                    <input
                      type="checkbox"
                      checked={persistInFstab}
                      onChange={(e) => setPersistInFstab(e.target.checked)}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500"
                    />
                    <span className="font-medium text-slate-300">
                      {isEn ? 'Persist in /etc/fstab (auto-mount on boot)' : 'ثبت در /etc/fstab (مانت خودکار پس از ریبوت)'}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          ) : (
            /* Workflow B: Add Disk to Existing LVM */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Select Target Volume Group (VG):' : 'انتخاب گروه حجمی هدف (VG):'}
                </div>
                <FieldInfoTooltip
                  title={isEn ? 'Volume Group Extension' : 'توسعه گروه حجمی'}
                  whatIsIt={
                    isEn
                      ? 'Attaches this raw disk as a Physical Volume (PV) to an existing Volume Group (VG).'
                      : 'این دیسک را به عنوان یک PV به گروه حجمی انتخابی ملحق می‌کند.'
                  }
                  whyIsItNeeded={
                    isEn
                      ? 'Expanding the Volume Group gives all Logical Volumes inside it access to extra unallocated storage.'
                      : 'افزایش فضای آزاد VG امکان توسعه حجم‌های منطقی (LV) را بدون قطعی سیستم فراهم می‌سازد.'
                  }
                  practicalExample="ubuntu-vg or data-vg"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>

              {volumeGroups.length === 0 ? (
                <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs">
                  {isEn
                    ? 'No Volume Groups detected on this server. Please create a Volume Group first or use Workflow A to format an independent filesystem.'
                    : 'هیچ گروه حجمی (Volume Group) روی این سرور یافت نشد. لطفاً از سناریو ۱ جهت ایجاد فایل‌سیستم مستقل استفاده نمایید.'}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {volumeGroups.map((vg) => {
                    const isSelected = selectedVg === vg.name;
                    return (
                      <div
                        key={vg.name}
                        onClick={() => setSelectedVg(vg.name)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? 'border-cyan-500 bg-cyan-950/30 shadow-md ring-1 ring-cyan-500/30'
                            : isLightMode
                            ? 'border-slate-200 hover:border-slate-300 bg-slate-50'
                            : 'border-slate-800 hover:border-slate-700 bg-slate-950/40'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Database className={`w-5 h-5 ${isSelected ? 'text-cyan-400' : 'text-slate-400'}`} />
                          <div>
                            <div className="font-bold text-xs flex items-center gap-2">
                              <span>{vg.name}</span>
                              <span className="text-[10px] text-slate-400 font-normal">
                                ({vg.pvCount} PVs, {vg.lvCount} LVs)
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                              {isEn ? 'Total:' : 'کل:'} {vg.totalSize} | {isEn ? 'Free:' : 'آزاد:'}{' '}
                              <span className="text-emerald-400 font-semibold">{vg.freeSize}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-cyan-400 font-mono">
                            + {disk.size} {isEn ? 'will be added' : 'اضافه خواهد شد'}
                          </span>
                          <input
                            type="radio"
                            name="targetVg"
                            checked={isSelected}
                            onChange={() => setSelectedVg(vg.name)}
                            className="text-cyan-500 focus:ring-cyan-500"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* LVM Visual Pipeline */}
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="text-cyan-400 font-bold">{disk.name}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-purple-400 font-semibold">pvcreate</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-emerald-400 font-semibold">vgextend {selectedVg || 'VG'}</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  {isEn ? 'Online & Non-disruptive' : 'بدون قطعی سرویس'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-t ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>
              {activeWorkflow === 'format'
                ? isEn ? 'Disk will be partitioned and formatted.' : 'دیسک پارتیشن‌بندی و فرمت خواهد شد.'
                : isEn ? 'Disk will be initialized as an LVM Physical Volume.' : 'دیسک به عنوان PV در LVM فعال خواهد شد.'}
            </span>
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
              onClick={handleStartAction}
              disabled={isLoading || (activeWorkflow === 'lvm' && !selectedVg)}
              className="px-5 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/30 active:scale-98 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {activeWorkflow === 'format'
                  ? isEn ? 'Format & Mount Disk' : 'فرمت و مانت دیسک'
                  : isEn ? 'Add Disk to Volume Group' : 'افزودن دیسک به گروه حجمی'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <LinuxStorageConfirmationModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleExecuteConfirmed}
        title={activeWorkflow === 'format' ? (isEn ? 'Confirm Disk Formatting & Mount' : 'تایید فرمت و مانت دیسک') : (isEn ? 'Confirm Add Disk to LVM' : 'تایید افزودن دیسک به LVM')}
        description={
          activeWorkflow === 'format'
            ? isEn
              ? `You are about to format disk ${disk.name} as ${fsType.toUpperCase()} and mount it to ${mountPath}. Any existing data on ${disk.name} will be permanently destroyed.`
              : `شما در حال فرمت دیسک ${disk.name} با فایل‌سیستم ${fsType.toUpperCase()} و مانت آن به مسیر ${mountPath} هستید. داده‌های پیشین این دیسک کاملاً پاک خواهند شد.`
            : isEn
              ? `You are about to initialize disk ${disk.name} as a Physical Volume (pvcreate) and attach it to Volume Group "${selectedVg}" (vgextend).`
              : `شما در حال راه‌اندازی دیسک ${disk.name} به عنوان PV و الحاق آن به گروه حجمی "${selectedVg}" هستید.`
        }
        targetDevice={disk.name}
        actionType={activeWorkflow === 'format' ? 'format' : 'pvcreate'}
        isLightMode={isLightMode}
        isLoading={isLoading}
        requiresTypingConfirmation={activeWorkflow === 'format'}
        confirmationKeyword="FORMAT"
      />
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
