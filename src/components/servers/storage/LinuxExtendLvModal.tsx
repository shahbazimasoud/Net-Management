import React, { useState, useEffect } from 'react';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  HardDrive,
  Maximize,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Plus,
  Layers,
  Sparkles,
  ArrowRight,
  PlusCircle,
  FolderPlus,
} from 'lucide-react';
import { RemoteServer, LinuxLvmLv, LinuxLvmVg, LinuxRawDisk } from '../../../types';
import { extendLinuxLvVolume } from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface LinuxExtendLvModalProps {
  isOpen: boolean;
  server: RemoteServer;
  targetLv: LinuxLvmLv | null;
  allLvs: LinuxLvmLv[];
  allVgs: LinuxLvmVg[];
  availableDisks: LinuxRawDisk[];
  ephemeralPassword?: string;
  onClose: () => void;
  onMinimize?: () => void;
  onSuccess: () => void;
  onOpenAddDiskToVg?: (vgName?: string) => void;
  onOpenCreateLvm?: (vgName?: string) => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const LinuxExtendLvModal: React.FC<LinuxExtendLvModalProps> = ({
  isOpen,
  server,
  targetLv,
  allLvs,
  allVgs,
  availableDisks,
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
  const [selectedLvPath, setSelectedLvPath] = useState('');
  const [addSize, setAddSize] = useState('10G');
  const [useAllFree, setUseAllFree] = useState(false);
  const [includeRawDisk, setIncludeRawDisk] = useState(false);
  const [selectedRawDisk, setSelectedRawDisk] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Initialize or reset selected LV
  useEffect(() => {
    if (targetLv) {
      setSelectedLvPath(targetLv.path);
    } else if (allLvs.length > 0) {
      setSelectedLvPath(allLvs[0].path);
    }
    setFeedback(null);
  }, [targetLv, allLvs, isOpen]);

  // Current active LV and its VG
  const currentLv = allLvs.find((l) => l.path === selectedLvPath) || targetLv;
  const currentVg = allVgs.find((v) => v.name === currentLv?.vgName);

  // Available raw disks that are not in LVM
  const unassignedDisks = availableDisks.filter((d) => !d.isInLvm);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentLv) return;

    const sizeValue = useAllFree ? '100%FREE' : addSize.trim();
    if (!sizeValue) {
      setFeedback({
        type: 'error',
        message: isEn ? 'Please specify the size to add.' : 'لطفاً میزان فضای افزایش را مشخص کنید.',
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await extendLinuxLvVolume(
        server.id,
        {
          lvPath: currentLv.path,
          vgName: currentLv.vgName,
          addSize: sizeValue,
          diskToAddToVg: includeRawDisk && selectedRawDisk ? selectedRawDisk : undefined,
          fsType: currentLv.fsType || undefined,
          mountPoint: currentLv.mountPoint || undefined,
        },
        ephemeralPassword
      );

      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || (isEn ? 'Logical Volume extended successfully!' : 'فضای لاجیکال ولوم با موفقیت افزایش یافت!'),
        });
        onSuccess();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || (isEn ? 'Failed to extend Logical Volume.' : 'خطا در افزایش فضای لاجیکال ولوم.'),
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || (isEn ? 'Connection error occurred.' : 'خطای ارتباط با سرور رخ داد.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={
        isMaximized
          ? 'fixed top-0 left-0 right-0 bottom-8 z-50 p-0 flex flex-col bg-slate-950/80 backdrop-blur-sm'
          : 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm'
      }
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`w-full flex flex-col transition-all duration-200 overflow-hidden shadow-2xl ${
          isMaximized
            ? 'h-full max-w-none max-h-full rounded-none border-none'
            : 'max-w-2xl max-h-[90vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-white text-slate-800 border-slate-200'
            : 'bg-slate-950 text-slate-100 border-slate-800'
        }`}
      >
        {/* Header with mandatory 3 buttons */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Maximize className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>{isEn ? 'Extend Logical Volume' : 'افزایش فضای لاجیکال ولوم (LVM)'}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {currentLv ? currentLv.name : 'LV'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEn
                  ? 'Dynamically expand volume capacity and filesystem online without downtime.'
                  : 'افزایش زنده ظرفیت دیسک و فایل‌سیستم بدون توقف سرویس‌ها یا نیاز به ریبوت.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                  isLightMode
                    ? 'hover:bg-slate-200 text-slate-600'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title={isEn ? 'Minimize' : 'کوچک‌نمایی'}
              >
                <Minus className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-600'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام‌صفحه') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
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

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Target LV Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold flex items-center gap-1.5">
                <span>{isEn ? 'Target Logical Volume (LV)' : 'انتخاب لاجیکال ولوم مقصد'}</span>
              </label>
              <FieldInfoTooltip
                title={isEn ? 'Logical Volume' : 'فضای لاجیکال ولوم'}
                whatIsIt={
                  isEn
                    ? 'The specific virtual partition within an LVM Volume Group that contains your filesystem.'
                    : 'پارتیشن مجازی موجود در گروه حجم (Volume Group) که حاوی سیستم‌فایل شماست.'
                }
                whyNeeded={
                  isEn
                    ? 'Determines which disk partition will receive the additional capacity.'
                    : 'مشخص می‌کند کدام دیسک یا مانت پوینت فضای اضافی جدید را دریافت خواهد کرد.'
                }
                example={isEn ? '/dev/ubuntu-vg/ubuntu-lv or /dev/mapper/...' : '/dev/ubuntu-vg/ubuntu-lv'}
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>
            <select
              value={selectedLvPath}
              onChange={(e) => setSelectedLvPath(e.target.value)}
              className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition-colors ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800 focus:border-cyan-500'
                  : 'bg-slate-900 border-slate-700 text-slate-200 focus:border-cyan-400'
              }`}
            >
              {allLvs.map((lv) => (
                <option key={lv.path} value={lv.path}>
                  {lv.name} ({lv.size}) - {lv.mountPoint ? `Mounted on ${lv.mountPoint}` : 'Unmounted'} [{lv.vgName}]
                </option>
              ))}
            </select>
          </div>

          {/* Current LV & VG Info Box */}
          {currentLv && (
            <div
              className={`p-3.5 rounded-xl border text-xs grid grid-cols-2 sm:grid-cols-4 gap-3 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
              }`}
            >
              <div>
                <span className="text-[10px] text-slate-400 block">{isEn ? 'Current LV Size' : 'حجم فعلی LV'}</span>
                <span className="font-mono font-bold text-cyan-400 mt-0.5 block">{currentLv.size}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">{isEn ? 'Volume Group' : 'گروه حجم (VG)'}</span>
                <span className="font-mono font-bold mt-0.5 block">{currentLv.vgName}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">{isEn ? 'VG Free Space' : 'فضای آزاد گروه VG'}</span>
                <span className="font-mono font-bold text-emerald-400 mt-0.5 block">
                  {currentVg ? currentVg.free : isEn ? 'Unknown' : 'نامشخص'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">{isEn ? 'Mount Point / FS' : 'مسیر مانت / فرمت'}</span>
                <span className="font-mono font-bold mt-0.5 block truncate">
                  {currentLv.mountPoint || 'Unmounted'} ({currentLv.fsType || 'ext4'})
                </span>
              </div>
            </div>
          )}

          {/* Size Increment Controls */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold flex items-center gap-1.5">
                <span>{isEn ? 'Size to Add' : 'میزان فضای اضافه شونده'}</span>
              </label>
              <FieldInfoTooltip
                title={isEn ? 'Add Size' : 'حجم افزایش'}
                whatIsIt={
                  isEn
                    ? 'The amount of disk space to expand the logical volume by (e.g. 10G, 50G, 500M) or 100% of VG free space.'
                    : 'میزان حجمی که به دیسک اضافه می‌شود (مثلاً 10G یا 50G یا کل فضای آزاد موجود در گروه).'
                }
                whyNeeded={
                  isEn
                    ? 'Allows flexible on-demand expansion matching your workload growth without downtime.'
                    : 'امکان رشد تدریجی ظرفیت دیسک بر اساس نیاز بدون هیچ‌گونه توقف سیستم را فراهم می‌کند.'
                }
                example={isEn ? '10G, 20G, 500M' : '10G یا 20G'}
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={addSize}
                  disabled={useAllFree}
                  onChange={(e) => setAddSize(e.target.value)}
                  placeholder="e.g. 10G or 50G"
                  className={`flex-1 px-3 py-2 text-xs rounded-xl border font-mono transition-colors disabled:opacity-50 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-cyan-500'
                      : 'bg-slate-900 border-slate-700 text-slate-200 focus:border-cyan-400'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setUseAllFree(!useAllFree)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                    useAllFree
                      ? 'bg-cyan-500 text-white border-cyan-500 shadow-sm'
                      : isLightMode
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Use All Free Space (+100%FREE)' : 'اختصاص کل فضای آزاد (+100%FREE)'}</span>
                </button>
              </div>

              {/* Quick Size Chips */}
              {!useAllFree && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">{isEn ? 'Quick Select:' : 'انتخاب سریع:'}</span>
                  {['2G', '5G', '10G', '20G', '50G', '100G'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setAddSize(s)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                        addSize === s
                          ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                          : isLightMode
                          ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      +{s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Optional: Add Newly Attached Disk to VG First */}
          <div
            className={`p-3.5 rounded-xl border transition-colors ${
              includeRawDisk
                ? isLightMode
                  ? 'bg-amber-50/70 border-amber-200'
                  : 'bg-amber-950/20 border-amber-900/50'
                : isLightMode
                ? 'bg-slate-50 border-slate-200'
                : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeRawDisk}
                onChange={(e) => {
                  setIncludeRawDisk(e.target.checked);
                  if (e.target.checked && unassignedDisks.length > 0 && !selectedRawDisk) {
                    setSelectedRawDisk(unassignedDisks[0].name);
                  }
                }}
                className="mt-0.5 rounded text-cyan-500 focus:ring-cyan-500 cursor-pointer"
              />
              <div className="flex-1 text-xs">
                <span className="font-semibold block">
                  {isEn
                    ? 'Attach a new raw disk to this Volume Group before extending'
                    : 'افزودن یک دیسک خام جدید به این گروه حجم (VG) قبل از اکستند'}
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  {isEn
                    ? 'If you just attached a new virtual disk (e.g. in Proxmox/VMware), select it here. It will automatically run pvcreate and vgextend.'
                    : 'اگر دیسک مجازی جدیدی اضافه کرده‌اید، می‌توانید آن را انتخاب کنید تا به طور خودکار pvcreate و vgextend انجام شود.'}
                </span>
              </div>
            </label>

            {includeRawDisk && (
              <div className="mt-3 pl-6">
                {unassignedDisks.length === 0 ? (
                  <p className="text-xs text-amber-400">
                    {isEn
                      ? 'No unassigned raw disks detected. Please run "Online Rescan Disks" first to detect newly added hardware.'
                      : 'هیچ دیسک خامی یافت نشد. ابتدا دکمه «اسکن سریع دیسک‌ها» را بزنید تا دیسک جدید کشف شود.'}
                  </p>
                ) : (
                  <div>
                    <label className="text-[11px] font-medium block mb-1">
                      {isEn ? 'Select Unassigned Disk:' : 'انتخاب دیسک خام:'}
                    </label>
                    <select
                      value={selectedRawDisk}
                      onChange={(e) => setSelectedRawDisk(e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-800'
                          : 'bg-slate-900 border-slate-700 text-slate-200'
                      }`}
                    >
                      {unassignedDisks.map((d) => (
                        <option key={d.name} value={d.name}>
                          {d.name} ({d.size}) - {d.type}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Feedback & SUCCESS NEXT-STEPS ACTION PANEL */}
          {feedback && (
            <div
              className={`p-4 rounded-xl border flex flex-col gap-3 ${
                feedback.type === 'success'
                  ? isLightMode
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-sm'
                    : 'bg-emerald-950/50 border-emerald-500/60 text-emerald-200 shadow-sm'
                  : isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
              }`}
            >
              <div className="flex items-start gap-3">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="text-sm font-semibold">{feedback.message}</div>
                </div>
              </div>

              {/* NEXT STEPS NAVIGATOR ON SUCCESS */}
              {feedback.type === 'success' && (
                <div className="mt-2 pt-3 border-t border-emerald-500/30 space-y-3">
                  <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <ArrowRight className="w-4 h-4 text-emerald-400" />
                    <span>
                      {isEn
                        ? 'Next Steps: What would you like to do now?'
                        : 'گام‌های بعدی: مایل به انجام کدام عملیات هستید؟'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* Action 1: Add More Physical Disks to VG */}
                    {onOpenAddDiskToVg && currentLv?.vgName && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenAddDiskToVg(currentLv.vgName);
                        }}
                        className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 hover:text-emerald-200 transition-all flex flex-col items-center text-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <PlusCircle className="w-5 h-5 text-emerald-400" />
                        <span className="text-xs font-bold">
                          {isEn ? 'Add Physical Disk (VG)' : 'پیوست دیسک فیزیکی به گروه'}
                        </span>
                        <span className="text-[10px] text-slate-400 leading-tight">
                          {isEn
                            ? `Expand Volume Group "${currentLv.vgName}" with more disks`
                            : `افزایش مجدد ظرفیت استخر گروه ${currentLv.vgName}`}
                        </span>
                      </button>
                    )}

                    {/* Action 2: Create Another Volume */}
                    {onOpenCreateLvm && currentLv?.vgName && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenCreateLvm(currentLv.vgName);
                        }}
                        className="p-3 rounded-xl border border-teal-500/40 bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 hover:text-teal-200 transition-all flex flex-col items-center text-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <FolderPlus className="w-5 h-5 text-teal-400" />
                        <span className="text-xs font-bold">
                          {isEn ? 'Create Another Volume' : 'ایجاد لاجیکال ولوم دیگر'}
                        </span>
                        <span className="text-[10px] text-slate-400 leading-tight">
                          {isEn
                            ? 'Create an independent LV inside this Volume Group'
                            : 'ساخت یک پارتیشن مجزا در این گروه حجم'}
                        </span>
                      </button>
                    )}

                    {/* Action 3: Done & Return */}
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-3 rounded-xl border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 transition-all flex flex-col items-center text-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <CheckCircle2 className="w-5 h-5 text-cyan-400" />
                      <span className="text-xs font-bold">
                        {isEn ? 'Done / Overview' : 'اتمام و مشاهده وضعیت'}
                      </span>
                      <span className="text-[10px] text-slate-400 leading-tight">
                        {isEn ? 'Return to storage management overview' : 'مشاهده در پنل مدیریت فایل‌سیستم‌ها'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'border-slate-800 text-slate-300 hover:bg-slate-900'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>
            <button
              type="submit"
              disabled={submitting || !currentLv}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 transition-all shadow-md shadow-cyan-600/20 cursor-pointer flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{isEn ? 'Expanding Volume...' : 'در حال گسترش فضا...'}</span>
                </>
              ) : (
                <>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Extend Logical Volume' : 'افزایش فضای دیسک'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
