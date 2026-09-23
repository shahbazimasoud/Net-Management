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
  PlusCircle,
  ArrowRight,
  Database,
  ArrowUpRight,
} from 'lucide-react';
import { RemoteServer, LinuxLvmVg, LinuxRawDisk } from '../../../types';
import { addDiskToLinuxVg } from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface LinuxAddDiskToVgModalProps {
  isOpen: boolean;
  server: RemoteServer;
  targetVgName?: string | null;
  targetDiskPath?: string | null;
  allVgs: LinuxLvmVg[];
  availableDisks: LinuxRawDisk[];
  ephemeralPassword?: string;
  onClose: () => void;
  onMinimize?: () => void;
  onSuccess: () => void;
  onOpenExtendLv?: (vgName: string) => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const LinuxAddDiskToVgModal: React.FC<LinuxAddDiskToVgModalProps> = ({
  isOpen,
  server,
  targetVgName,
  targetDiskPath,
  allVgs,
  availableDisks,
  ephemeralPassword,
  onClose,
  onMinimize,
  onSuccess,
  onOpenExtendLv,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedVg, setSelectedVg] = useState('');
  const [selectedDisk, setSelectedDisk] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Filter unassigned raw disks or the pre-selected disk
  const unassignedDisks = availableDisks.filter((d) => !d.isInLvm || d.name === targetDiskPath);

  useEffect(() => {
    if (targetVgName && allVgs.some((v) => v.name === targetVgName)) {
      setSelectedVg(targetVgName);
    } else if (allVgs.length > 0) {
      setSelectedVg(allVgs[0].name);
    }

    if (targetDiskPath && availableDisks.some((d) => d.name === targetDiskPath)) {
      setSelectedDisk(targetDiskPath);
    } else if (unassignedDisks.length > 0) {
      setSelectedDisk(unassignedDisks[0].name);
    } else {
      setSelectedDisk('');
    }

    setFeedback(null);
  }, [targetVgName, targetDiskPath, allVgs, availableDisks, isOpen]);

  if (!isOpen) return null;

  const currentVg = allVgs.find((v) => v.name === selectedVg);
  const currentDisk = availableDisks.find((d) => d.name === selectedDisk);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVg) {
      setFeedback({
        type: 'error',
        message: isEn ? 'Please select a target Volume Group.' : 'لطفاً گروه حجم مورد نظر را انتخاب کنید.',
      });
      return;
    }
    if (!selectedDisk) {
      setFeedback({
        type: 'error',
        message: isEn
          ? 'Please select a physical disk or partition to add.'
          : 'لطفاً دیسک یا پارتیشن فیزیکی مورد نظر را برای پیوست انتخاب کنید.',
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await addDiskToLinuxVg(
        server.id,
        { vgName: selectedVg, diskPath: selectedDisk },
        ephemeralPassword
      );

      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || (isEn ? 'Disk successfully added to Volume Group!' : 'دیسک با موفقیت به گروه حجم اضافه شد!'),
        });
        onSuccess();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || (isEn ? 'Failed to add disk to VG.' : 'خطا در اتصال دیسک به گروه حجم.'),
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || (isEn ? 'An unexpected error occurred.' : 'خطای پیش‌بینی نشده‌ای رخ داد.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={
        isMaximized
          ? 'fixed top-0 left-0 right-0 bottom-8 z-50 p-0 flex flex-col bg-black/60 backdrop-blur-sm'
          : 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto'
      }
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col transition-all duration-200 overflow-hidden shadow-2xl ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-2xl rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-800'
            : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/80 border-slate-800/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">
                  {isEn ? 'Add Physical Disk to Volume Group' : 'پیوست دیسک فیزیکی به گروه حجم (VG)'}
                </h3>
                <span className="px-2 py-0.5 text-xs font-mono rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  vgextend
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEn
                  ? 'Expand the shared storage pool of an existing Volume Group using raw disks or partitions'
                  : 'گسترش استخر ذخیره‌سازی مشترک گروه حجم موجود با استفاده از دیسک‌ها یا پارتیشن‌های خام'}
              </p>
            </div>
          </div>

          {/* Header Controls */}
          <div className="flex items-center gap-1.5">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                title={isEn ? 'Minimize' : 'کوچک‌سازی'}
                aria-label={isEn ? 'Minimize' : 'کوچک‌سازی'}
                className={`p-1.5 rounded-lg transition-colors ${
                  isLightMode
                    ? 'hover:bg-slate-200 text-slate-600'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Minus className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={
                isMaximized
                  ? isEn
                    ? 'Exit Fullscreen'
                    : 'خروج از تمام‌صفحه'
                  : isEn
                  ? 'Fullscreen'
                  : 'تمام‌صفحه'
              }
              aria-label={
                isMaximized
                  ? isEn
                    ? 'Exit Fullscreen'
                    : 'خروج از تمام‌صفحه'
                  : isEn
                  ? 'Fullscreen'
                  : 'تمام‌صفحه'
              }
              className={`p-1.5 rounded-lg transition-colors ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-600'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              aria-label={isEn ? 'Close' : 'بستن'}
              className={`p-1.5 rounded-lg transition-colors ${
                isLightMode
                  ? 'hover:bg-rose-100 text-slate-600 hover:text-rose-600'
                  : 'hover:bg-rose-500/20 text-slate-400 hover:text-rose-400'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Concept Guide Banner */}
          <div
            className={`p-4 rounded-xl border flex items-start gap-3 ${
              isLightMode ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' : 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
            }`}
          >
            <Database className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <div className="font-semibold text-sm">
                {isEn ? 'How adding a disk to a Volume Group works:' : 'نحوه کارکرد پیوست دیسک به گروه حجم:'}
              </div>
              <p className="leading-relaxed">
                {isEn
                  ? 'This operation runs `pvcreate` to format the disk as an LVM Physical Volume, then runs `vgextend` to add its capacity to the selected Volume Group. Existing data on current volumes is 100% safe and unaffected.'
                  : 'این عملیات ابتدا دستور `pvcreate` را روی دیسک خام اجرا کرده و سپس با `vgextend` ظرفیت آن را به استخر گروه حجم اضافه می‌کند. تمام داده‌های کنونی شما بدون تغییر و با ایمنی کامل حفظ می‌گردند.'}
              </p>
            </div>
          </div>

          {feedback && (
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                feedback.type === 'success'
                  ? isLightMode
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div className="text-sm font-medium">{feedback.message}</div>
                {feedback.type === 'success' && onOpenExtendLv && selectedVg && (
                  <div className="mt-3 pt-3 border-t border-emerald-500/20 flex items-center justify-between">
                    <span className="text-xs">
                      {isEn
                        ? 'Next Step: Would you like to extend a Logical Volume now?'
                        : 'گام بعدی: آیا تمایل دارید یکی از ولوم‌های لاجیکال (مانند ریشه یا دیتا) را بلافاصله افزایش حجم دهید؟'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenExtendLv(selectedVg);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors"
                    >
                      <span>{isEn ? 'Extend Logical Volume' : 'افزایش حجم لاجیکال ولوم'}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Target Volume Group Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isEn ? 'Target Volume Group (VG)' : 'گروه حجم مقصد (VG)'}</span>
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  title={isEn ? 'Target Volume Group' : 'گروه حجم مقصد'}
                  whatIsIt={
                    isEn
                      ? 'The storage pool that aggregates one or more physical disks into a unified capacity.'
                      : 'استخر ذخیره‌سازی مشترک که یک یا چند دیسک فیزیکی را به ظرفیتی یکپارچه تبدیل می‌کند.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Select which existing Volume Group should receive the capacity of the new physical disk.'
                      : 'مشخص می‌کند کدام گروه حجم موجود، ظرفیت دیسک جدید را دریافت کند.'
                  }
                  example={
                    isEn
                      ? 'ubuntu-vg, centos_root, datavg'
                      : 'ubuntu-vg یا centos_root یا دیتابیس گروه حجم'
                  }
                />
              </div>

              {allVgs.length === 0 ? (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    isLightMode ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-amber-950/30 border-amber-800/50 text-amber-300'
                  }`}
                >
                  {isEn
                    ? 'No Volume Groups found on this server. Please create a Volume Group first via "New LVM Volume".'
                    : 'هیچ گروه حجمی روی این سرور یافت نشد. لطفاً ابتدا از طریق دکمه «ایجاد فضای جدید» گروه حجم بسازید.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {allVgs.map((vg) => {
                    const isSelected = selectedVg === vg.name;
                    return (
                      <div
                        key={vg.name}
                        onClick={() => setSelectedVg(vg.name)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? isLightMode
                              ? 'bg-cyan-50/80 border-cyan-500 shadow-sm ring-1 ring-cyan-500/50'
                              : 'bg-cyan-950/30 border-cyan-500 shadow-sm shadow-cyan-500/10 ring-1 ring-cyan-500/50'
                            : isLightMode
                            ? 'bg-white border-slate-200 hover:border-slate-300'
                            : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm font-mono text-cyan-400">{vg.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            {vg.size}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                          <span>{isEn ? 'Free Space:' : 'فضای آزاد:'}</span>
                          <span className="font-semibold text-emerald-400 font-mono">{vg.free}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                          <span>{isEn ? 'PVs / LVs:' : 'دیسک‌ها / ولوم‌ها:'}</span>
                          <span>
                            {vg.pvCount} PVs / {vg.lvCount} LVs
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Target Raw Disk Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isEn ? 'Physical Raw Disk to Add' : 'دیسک فیزیکی خام جهت پیوست'}</span>
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  title={isEn ? 'Physical Disk to Add' : 'دیسک فیزیکی جهت پیوست'}
                  whatIsIt={
                    isEn
                      ? 'The unassigned block device or partition that will be initialized and bound to the Volume Group.'
                      : 'دستگاه بلاک یا پارتیشن خامی که به استخر گروه حجم متصل می‌گردد.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Provides the new raw physical storage bytes that will expand your Volume Group pool.'
                      : 'تأمین‌کننده بایت‌های حافظه فیزیکی خام جهت گسترش استخر حجم.'
                  }
                  example={
                    isEn
                      ? '/dev/sdb, /dev/sdc1, /dev/nvme1n1'
                      : '/dev/sdb یا /dev/sdc یا /dev/nvme1n1'
                  }
                />
              </div>

              {unassignedDisks.length === 0 ? (
                <div
                  className={`p-4 rounded-xl border text-xs flex items-start gap-2.5 ${
                    isLightMode ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-amber-950/30 border-amber-800/50 text-amber-300'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">
                      {isEn ? 'No unassigned raw disks detected' : 'هیچ دیسک خام آزاد شناسایی نشد'}
                    </div>
                    <p className="mt-1 leading-relaxed">
                      {isEn
                        ? 'If you just attached a new virtual disk in VMware, Proxmox, or AWS, close this window and click "Online Rescan Disks" in the Physical Disks tab to detect it without rebooting.'
                        : 'اگر به‌تازگی دیسک مجازی در VMware، Proxmox یا پنل ابری اضافه کرده‌اید، این پنجره را ببندید و دکمه «Online Rescan Disks» را در تب دیسک‌های فیزیکی بزنید تا بدون ریستارت شناسایی شود.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {unassignedDisks.map((d) => {
                    const isSelected = selectedDisk === d.name;
                    return (
                      <div
                        key={d.name}
                        onClick={() => setSelectedDisk(d.name)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? isLightMode
                              ? 'bg-emerald-50/80 border-emerald-500 shadow-sm ring-1 ring-emerald-500/50'
                              : 'bg-emerald-950/30 border-emerald-500 shadow-sm shadow-emerald-500/10 ring-1 ring-emerald-500/50'
                            : isLightMode
                            ? 'bg-white border-slate-200 hover:border-slate-300'
                            : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm font-mono text-emerald-400">{d.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono font-bold">
                            {d.size}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                          <span>{isEn ? 'Device Type:' : 'نوع دستگاه:'}</span>
                          <span className="font-mono">{d.type}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                          <span>{isEn ? 'Current Status:' : 'وضعیت فعلی:'}</span>
                          <span className="text-teal-400 font-medium">
                            {isEn ? 'Unassigned (Raw)' : 'خام و آزاد'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Live Command & Topology Preview */}
            {currentVg && currentDisk && (
              <div
                className={`p-4 rounded-xl border space-y-2 text-xs ${
                  isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>{isEn ? 'Action Plan' : 'برنامه عملیاتی سیستم'}</span>
                  <span className="text-emerald-400 font-mono">Zero Downtime</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="text-slate-400">1. pvcreate -y</span>
                  <span className="text-emerald-400">{currentDisk.name}</span>
                  <span className="text-slate-500">({currentDisk.size})</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="text-slate-400">2. vgextend</span>
                  <span className="text-cyan-400">{currentVg.name}</span>
                  <span className="text-emerald-400">{currentDisk.name}</span>
                </div>
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-slate-300">
                  <span>{isEn ? 'Volume Group will expand by:' : 'ظرفیت اضافه شونده به گروه حجم:'}</span>
                  <span className="font-mono font-bold text-emerald-400">+{currentDisk.size}</span>
                </div>
              </div>
            )}

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  isLightMode
                    ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="submit"
                disabled={submitting || !selectedVg || !selectedDisk}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all cursor-pointer"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{isEn ? 'Attaching Disk...' : 'در حال اتصال دیسک...'}</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>{isEn ? 'Add Disk to VG' : 'پیوست دیسک به گروه حجم'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
