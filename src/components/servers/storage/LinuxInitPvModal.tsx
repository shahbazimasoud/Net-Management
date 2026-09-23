import React, { useState, useEffect } from 'react';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  HardDrive,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Database,
  ArrowUpRight,
  FolderPlus,
  Terminal,
  ShieldCheck,
  PlusCircle,
} from 'lucide-react';
import { RemoteServer, LinuxLvmPv, LinuxRawDisk } from '../../../types';
import { initializeLinuxPv } from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface LinuxInitPvModalProps {
  isOpen: boolean;
  server: RemoteServer;
  targetDiskPath?: string | null;
  availableDisks: LinuxRawDisk[];
  allPvs?: LinuxLvmPv[];
  ephemeralPassword?: string;
  onClose: () => void;
  onMinimize?: () => void;
  onSuccess: () => void;
  onOpenAddDiskToVg?: (diskPath: string) => void;
  onOpenCreateLvm?: (diskPath: string) => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const LinuxInitPvModal: React.FC<LinuxInitPvModalProps> = ({
  isOpen,
  server,
  targetDiskPath,
  availableDisks,
  allPvs = [],
  ephemeralPassword,
  onClose,
  onMinimize,
  onSuccess,
  onOpenAddDiskToVg,
  onOpenCreateLvm,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedDisk, setSelectedDisk] = useState('');
  const [isCustomDisk, setIsCustomDisk] = useState(false);
  const [customDiskPath, setCustomDiskPath] = useState('');
  const [forceInit, setForceInit] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Filter raw disks that are not in LVM yet
  const unassignedDisks = availableDisks.filter((d) => !d.isInLvm || d.name === targetDiskPath);

  useEffect(() => {
    if (targetDiskPath) {
      if (unassignedDisks.some((d) => d.name === targetDiskPath)) {
        setSelectedDisk(targetDiskPath);
        setIsCustomDisk(false);
      } else {
        setIsCustomDisk(true);
        setCustomDiskPath(targetDiskPath);
      }
    } else if (unassignedDisks.length > 0) {
      setSelectedDisk(unassignedDisks[0].name);
      setIsCustomDisk(false);
    } else {
      setIsCustomDisk(true);
      setCustomDiskPath('');
    }
  }, [targetDiskPath, availableDisks]);

  if (!isOpen) return null;

  const effectiveDiskPath = isCustomDisk ? customDiskPath.trim() : selectedDisk;
  const currentDiskObj = unassignedDisks.find((d) => d.name === selectedDisk);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveDiskPath) {
      setFeedback({
        type: 'error',
        message: isEn ? 'Please select or enter a disk block device path.' : 'لطفاً یک دیسک یا مسیر بلوک دیوایس را انتخاب یا وارد کنید.',
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await initializeLinuxPv(
        server.id,
        {
          diskPath: effectiveDiskPath,
          force: forceInit,
        },
        ephemeralPassword
      );

      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || (isEn ? `Disk ${effectiveDiskPath} successfully initialized as Physical Volume (PV)!` : `دیسک ${effectiveDiskPath} با موفقیت به عنوان فیزیکال ولوم (PV) مقداردهی شد!`),
        });
        onSuccess();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || (isEn ? 'Failed to initialize Physical Volume' : 'خطا در مقداردهی فیزیکال ولوم'),
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || (isEn ? 'Unexpected communication error' : 'خطای غیرمنتظره در ارتباط با سرور'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextAction = (action: 'add_vg' | 'create_vg') => {
    const disk = effectiveDiskPath;
    onClose();
    if (action === 'add_vg' && onOpenAddDiskToVg) {
      onOpenAddDiskToVg(disk);
    } else if (action === 'create_vg' && onOpenCreateLvm) {
      onOpenCreateLvm(disk);
    }
  };

  return (
    <div
      className={
        isMaximized
          ? 'fixed top-0 left-0 right-0 bottom-8 z-50 p-0 flex flex-col'
          : 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs'
      }
    >
      <div
        className={`flex flex-col border shadow-2xl transition-all ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-xl max-h-[92vh] rounded-2xl overflow-hidden'
        } ${
          isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold">
                  {isEn ? 'Initialize Physical Volume (pvcreate)' : 'مقداردهی اولیه فیزیکال ولوم (pvcreate)'}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {isEn ? 'Step 1 of LVM' : 'گام ۱ در معماری LVM'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEn
                  ? 'Format raw disk/partition with LVM headers to turn it into an authentic Physical Volume (PV).'
                  : 'نوشتن ساختار متادیتای LVM روی دیسک خام برای تبدیل آن به یک فیزیکال ولوم استاندارد.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  isLightMode
                    ? 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800'
                }`}
                title={isEn ? 'Minimize to dock' : 'مینیمایز به نوار داک'}
              >
                <Minus className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isLightMode
                  ? 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800'
              }`}
              title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام‌صفحه') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isLightMode
                  ? 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Architectural Explanation Banner */}
          <div
            className={`p-3.5 rounded-xl border text-xs leading-relaxed space-y-1.5 ${
              isLightMode ? 'bg-amber-50/70 border-amber-200 text-amber-950' : 'bg-amber-950/20 border-amber-900/40 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-amber-400">
              <Layers className="w-4 h-4 shrink-0" />
              <span>{isEn ? 'How LVM Physical Volumes (PV) Work:' : 'عملکرد فیزیکال ولوم (PV) در ساختار دیسک لینوکس:'}</span>
            </div>
            <p className="text-[11px] text-slate-300">
              {isEn
                ? 'A raw disk cannot directly join a Volume Group or be mounted. It must first be initialized with pvcreate to establish LVM partition headers and allocation extents. Once initialized as a PV, it can be added to an existing VG or used to form a brand new storage pool.'
                : 'دیسک یا پارتیشن خام پیش از پیوست به گروه حجم یا استفاده در درایوها، باید ابتدا با دستور pvcreate شناسه و ساختار LVM را دریافت کند. پس از تبدیل به PV، می‌توانید آن را به گروه حجم موجود پیوست کرده یا یک استخر دیسک کاملاً جدید بسازید.'}
            </p>
          </div>

          {/* Disk Selection Mode */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold flex items-center gap-1.5">
                <span>{isEn ? 'Select Physical Disk to Initialize' : 'انتخاب دیسک فیزیکی جهت مقداردهی'}</span>
                <FieldInfoTooltip
                  title={isEn ? 'Physical Volume Target (pvcreate)' : 'مقداردهی دیسک فیزیکی (pvcreate)'}
                  whatIsIt={
                    isEn
                      ? 'The raw physical or virtual disk device path (e.g. /dev/sdb, /dev/vdc) to initialize into an LVM Physical Volume.'
                      : 'مسیر دیسک فیزیکی یا مجازی خام در لینوکس (مانند /dev/sdb یا /dev/vdc) که قرار است ساختار متادیتای LVM روی آن ثبت شود.'
                  }
                  whyNeeded={
                    isEn
                      ? 'LVM volume managers require block devices to have an authentic PV header before they can be pooled into Volume Groups.'
                      : 'مدیریت حافظه LVM نیازمند متادیتای استاندارد PV روی دیسک است تا بتواند بلوک‌های آن را در استخرهای مشترک به اشتراک بگذارد.'
                  }
                  example="/dev/sdb, /dev/sdc, /dev/vdb1"
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </label>

              <button
                type="button"
                onClick={() => {
                  setIsCustomDisk(!isCustomDisk);
                  setFeedback(null);
                }}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
              >
                {isCustomDisk
                  ? isEn
                    ? '← Select from detected disks'
                    : '← انتخاب از لیست دیسک‌های شناسایی‌شده'
                  : isEn
                  ? 'Enter custom path manually'
                  : 'درج دستی مسیر دیسک'}
              </button>
            </div>

            {!isCustomDisk ? (
              unassignedDisks.length > 0 ? (
                <div className="space-y-2">
                  <select
                    value={selectedDisk}
                    onChange={(e) => setSelectedDisk(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-mono border outline-hidden transition-all ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-amber-500'
                        : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-amber-500'
                    }`}
                  >
                    {unassignedDisks.map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name} ({d.size}) &bull; {d.type} {d.fstype ? `[${d.fstype}]` : ''}
                      </option>
                    ))}
                  </select>

                  {currentDiskObj && (
                    <div
                      className={`p-2.5 rounded-lg border text-xs flex items-center justify-between font-mono ${
                        isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
                      }`}
                    >
                      <span className="text-slate-400">{isEn ? 'Disk Details:' : 'مشخصات دیسک:'}</span>
                      <span className="font-bold text-amber-400">
                        {currentDiskObj.size} &bull; {currentDiskObj.type}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    isLightMode ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-900/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <p className="leading-relaxed">
                    {isEn
                      ? 'No unassigned raw disks detected automatically. You can enter the block device path manually below.'
                      : 'دیسک خام بدون تخصیص به صورت خودکار یافت نشد. می‌توانید مسیر دیسک را به صورت دستی وارد نمایید.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsCustomDisk(true)}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-semibold cursor-pointer"
                  >
                    {isEn ? 'Switch to Manual Input' : 'تغییر به ورودی دستی'}
                  </button>
                </div>
              )
            ) : (
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={customDiskPath}
                  onChange={(e) => setCustomDiskPath(e.target.value)}
                  placeholder={isEn ? '/dev/sdb or /dev/nvme0n2' : '/dev/sdb یا /dev/nvme0n2'}
                  className={`w-full px-3 py-2 rounded-xl text-xs font-mono border outline-hidden transition-all ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-amber-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-amber-500'
                  }`}
                />
                <p className="text-[11px] text-slate-400">
                  {isEn
                    ? 'Enter the full block device path (e.g. /dev/sdb, /dev/vdb, /dev/sdb1).'
                    : 'مسیر کامل دستگاه بلوکی دیسک را وارد کنید (مانند /dev/sdb یا /dev/vdb).'}
                </p>
              </div>
            )}
          </div>

          {/* Force Flag Switch */}
          <div
            className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="space-y-0.5">
              <span className="font-semibold block flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isEn ? 'Force Initialization (-ff -y)' : 'تایید خودکار و اجبار (-ff -y)'}</span>
              </span>
              <p className="text-[11px] text-slate-400">
                {isEn
                  ? 'Overwrites existing partition tables or stale signatures non-interactively.'
                  : 'در صورت وجود پارتیشن‌تیبل‌های قدیمی یا امضاهای قبلی، آنها را بدون توقف و تایید دستی بازنویسی می‌کند.'}
              </p>
            </div>
            <input
              type="checkbox"
              checked={forceInit}
              onChange={(e) => setForceInit(e.target.checked)}
              className="w-4 h-4 rounded text-amber-500 cursor-pointer"
            />
          </div>

          {/* Command Preview */}
          <div
            className={`p-3 rounded-xl border text-xs font-mono space-y-1 ${
              isLightMode ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-950 border-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-[11px]">
              <Terminal className="w-3.5 h-3.5" />
              <span>{isEn ? 'Command to Execute via SSH:' : 'دستور اجرایی از طریق SSH:'}</span>
            </div>
            <p className="text-[11px] text-cyan-400 overflow-x-auto whitespace-nowrap">
              sudo pvcreate {forceInit ? '-y -ff' : '-y'} {effectiveDiskPath || '/dev/sdX'}
            </p>
          </div>

          {/* Feedback & Next Steps Card */}
          {feedback && (
            <div
              className={`p-4 rounded-xl border text-xs space-y-3 ${
                feedback.type === 'success'
                  ? isLightMode
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
                  : isLightMode
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-rose-950/30 border-rose-800/60 text-rose-200'
              }`}
            >
              <div className="flex items-start gap-2">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <span className="leading-relaxed">{feedback.message}</span>
              </div>

              {/* Next Steps Buttons */}
              {feedback.type === 'success' && (
                <div className="pt-2 border-t border-emerald-500/20 space-y-2">
                  <span className="font-bold text-[11px] text-emerald-400 block">
                    {isEn ? 'Next Steps: What would you like to do now?' : 'گام‌های بعدی: مایل به انجام کدام عملیات هستید؟'}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {onOpenAddDiskToVg && (
                      <button
                        type="button"
                        onClick={() => handleNextAction('add_vg')}
                        className="p-2.5 rounded-lg border border-teal-500/40 bg-teal-600/20 hover:bg-teal-600/30 text-teal-200 flex items-center justify-between text-xs font-semibold cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <PlusCircle className="w-3.5 h-3.5 text-teal-400" />
                          <span>{isEn ? 'Add to Volume Group (vgextend)' : 'پیوست به گروه حجم (vgextend)'}</span>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-teal-400" />
                      </button>
                    )}

                    {onOpenCreateLvm && (
                      <button
                        type="button"
                        onClick={() => handleNextAction('create_vg')}
                        className="p-2.5 rounded-lg border border-emerald-500/40 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-200 flex items-center justify-between text-xs font-semibold cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <FolderPlus className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{isEn ? 'Create New VG & Volume' : 'ایجاد گروه و ولوم جدید'}</span>
                        </div>
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/40">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
            >
              {isEn ? 'Cancel / Close' : 'بستن / انصراف'}
            </button>

            <button
              type="submit"
              disabled={submitting || !effectiveDiskPath}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition-all shadow-sm shadow-amber-600/20 cursor-pointer flex items-center gap-1.5"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{isEn ? 'Initializing PV...' : 'در حال مقداردهی PV...'}</span>
                </>
              ) : (
                <>
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Initialize Physical Volume (pvcreate)' : 'مقداردهی فیزیکال ولوم (pvcreate)'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
