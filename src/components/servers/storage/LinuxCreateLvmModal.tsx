import React, { useState, useEffect } from 'react';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  FolderPlus,
  HardDrive,
  Layers,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Plus,
  Sparkles,
  Check,
  ArrowRight,
  ArrowUpRight,
  PlusCircle,
} from 'lucide-react';
import { RemoteServer, LinuxLvmVg, LinuxRawDisk } from '../../../types';
import { createLinuxLvmVolume } from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface LinuxCreateLvmModalProps {
  isOpen: boolean;
  server: RemoteServer;
  targetVgName?: string | null;
  allVgs: LinuxLvmVg[];
  availableDisks: LinuxRawDisk[];
  ephemeralPassword?: string;
  onClose: () => void;
  onMinimize?: () => void;
  onSuccess: () => void;
  onOpenExtendLv?: (vgName?: string, lvName?: string) => void;
  onOpenAddDiskToVg?: (vgName?: string) => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const LinuxCreateLvmModal: React.FC<LinuxCreateLvmModalProps> = ({
  isOpen,
  server,
  targetVgName,
  allVgs,
  availableDisks,
  ephemeralPassword,
  onClose,
  onMinimize,
  onSuccess,
  onOpenExtendLv,
  onOpenAddDiskToVg,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  // Mode: existing VG or create new VG
  const [isNewVg, setIsNewVg] = useState(allVgs.length === 0);
  const [existingVgName, setExistingVgName] = useState('');
  const [newVgName, setNewVgName] = useState('data-vg');
  const [selectedDisks, setSelectedDisks] = useState<string[]>([]);

  // LV Properties
  const [lvName, setLvName] = useState('data_lv');
  const [size, setSize] = useState('20G');
  const [useAllFree, setUseAllFree] = useState(false);
  const [fsType, setFsType] = useState<'ext4' | 'xfs' | 'btrfs'>('ext4');

  // Mount settings
  const [mountPath, setMountPath] = useState('/data');
  const [persistInFstab, setPersistInFstab] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [createdDetails, setCreatedDetails] = useState<{ vg: string; lv: string } | null>(null);

  // Unassigned disks that aren't in LVM
  const unassignedDisks = availableDisks.filter((d) => !d.isInLvm);

  useEffect(() => {
    if (targetVgName && allVgs.some((v) => v.name === targetVgName)) {
      setExistingVgName(targetVgName);
      setIsNewVg(false);
    } else if (allVgs.length > 0 && !existingVgName) {
      setExistingVgName(allVgs[0].name);
    }
    if (unassignedDisks.length > 0 && selectedDisks.length === 0) {
      setSelectedDisks([unassignedDisks[0].name]);
    }
    setFeedback(null);
    setCreatedDetails(null);
  }, [targetVgName, allVgs, availableDisks, isOpen]);

  const toggleDiskSelection = (diskName: string) => {
    setSelectedDisks((prev) =>
      prev.includes(diskName) ? prev.filter((d) => d !== diskName) : [...prev, diskName]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const targetVg = isNewVg ? newVgName.trim() : existingVgName;
    if (!targetVg) {
      setFeedback({
        type: 'error',
        message: isEn ? 'Please specify a Volume Group name.' : 'لطفاً نام گروه حجم (Volume Group) را مشخص کنید.',
      });
      return;
    }

    if (isNewVg && selectedDisks.length === 0) {
      setFeedback({
        type: 'error',
        message: isEn
          ? 'Please select at least one physical disk to create the Volume Group.'
          : 'برای ساخت گروه حجم جدید باید حداقل یک دیسک فیزیکی را انتخاب کنید.',
      });
      return;
    }

    const cleanLv = lvName.trim();
    if (!cleanLv) {
      setFeedback({
        type: 'error',
        message: isEn ? 'Please enter a Logical Volume name.' : 'لطفاً نام لاجیکال ولوم را وارد کنید.',
      });
      return;
    }

    const finalSize = useAllFree ? '100%FREE' : size.trim();
    if (!finalSize) {
      setFeedback({
        type: 'error',
        message: isEn ? 'Please specify volume size.' : 'لطفاً ظرفیت حجم را وارد کنید.',
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await createLinuxLvmVolume(
        server.id,
        {
          isNewVg,
          vgName: targetVg,
          selectedDisks: selectedDisks.length > 0 ? selectedDisks : undefined,
          lvName: cleanLv,
          size: finalSize,
          fsType,
          mountPath: mountPath.trim() || undefined,
          persistInFstab: !!mountPath.trim() && persistInFstab,
        },
        ephemeralPassword
      );

      if (res.success) {
        setCreatedDetails({ vg: targetVg, lv: cleanLv });
        setFeedback({
          type: 'success',
          message:
            res.message ||
            (isEn
              ? `Logical Volume "${cleanLv}" created and mounted successfully in Volume Group "${targetVg}"!`
              : `فضای لاجیکال ولوم «${cleanLv}» با موفقیت در گروه حجم «${targetVg}» ساخته و مانت شد!`),
        });
        onSuccess();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || (isEn ? 'Failed to create volume.' : 'خطا در ایجاد فضای لاجیکال ولوم.'),
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
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>{isEn ? 'Create New LVM Volume' : 'ایجاد فضای جدید با LVM'}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {fsType.toUpperCase()}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEn
                  ? 'Allocate storage, format filesystem, and mount permanently with reboot persistence.'
                  : 'تخصیص فضا، فرمت با فایل‌سیستم دلخواه، و مانت دائمی پایدار در هنگام ریبوت سرور.'}
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

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* VG Selection: Existing vs New */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold">{isEn ? 'Volume Group Placement' : 'تعیین گروه حجم (VG)'}</label>
              <FieldInfoTooltip
                title={isEn ? 'Volume Group' : 'گروه حجم (Volume Group)'}
                whatIsIt={
                  isEn
                    ? 'A pool of physical storage disks combined into a single unified space for logical volumes.'
                    : 'مجموعه‌ای از دیسک‌های فیزیکی یکپارچه‌شده که استخر ذخیره‌سازی را برای ولوم‌ها تشکیل می‌دهند.'
                }
                whyNeeded={
                  isEn
                    ? 'Determines whether your new volume consumes existing free storage or claims freshly attached disks.'
                    : 'مشخص می‌کند فضا از استخر موجود کسر شود یا از دیسک‌های متصل‌شده جدید یک استخر تازه ایجاد گردد.'
                }
                example={isEn ? 'ubuntu-vg or data-vg' : 'ubuntu-vg یا data-vg'}
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                type="button"
                disabled={allVgs.length === 0}
                onClick={() => setIsNewVg(false)}
                className={`py-2 px-3 rounded-xl text-xs font-medium border text-center transition-all cursor-pointer ${
                  !isNewVg
                    ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40 font-bold'
                    : isLightMode
                    ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 disabled:opacity-40'
                }`}
              >
                {isEn ? 'Use Existing Volume Group' : 'استفاده از گروه حجم موجود'}
              </button>

              <button
                type="button"
                onClick={() => setIsNewVg(true)}
                className={`py-2 px-3 rounded-xl text-xs font-medium border text-center transition-all cursor-pointer ${
                  isNewVg
                    ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40 font-bold'
                    : isLightMode
                    ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                {isEn ? 'Create New Volume Group' : 'ایجاد گروه حجم جدید'}
              </button>
            </div>

            {!isNewVg ? (
              <div className="space-y-3">
                <select
                  value={existingVgName}
                  onChange={(e) => setExistingVgName(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border font-mono ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800'
                      : 'bg-slate-900 border-slate-700 text-slate-200'
                  }`}
                >
                  {allVgs.map((vg) => (
                    <option key={vg.name} value={vg.name}>
                      {vg.name} ({vg.size} Total, {vg.free} Free) - {vg.pvCount} PVs
                    </option>
                  ))}
                </select>

                {unassignedDisks.length > 0 && (
                  <div
                    className={`p-3 rounded-xl border text-xs space-y-2 ${
                      isLightMode ? 'bg-amber-50/60 border-amber-200' : 'bg-amber-950/20 border-amber-900/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Attach Raw Disks to this VG (Optional):' : 'الصاق دیسک‌های خام به این گروه (اختیاری):'}</span>
                      </span>
                      {selectedDisks.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedDisks([])}
                          className="text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer"
                        >
                          {isEn ? 'Clear selection' : 'حذف انتخاب'}
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      {isEn
                        ? 'If this Volume Group lacks free space, select one or more detected raw disks. They will be auto-initialized with pvcreate and aggregated into this VG (vgextend).'
                        : 'اگر این گروه حجم فاقد فضای آزاد کافی است، می‌توانید دیسک‌های خام جدید را انتخاب کنید تا با pvcreate و vgextend ظرفیت آن افزوده شود.'}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {unassignedDisks.map((d) => {
                        const isSelected = selectedDisks.includes(d.name);
                        return (
                          <div
                            key={d.name}
                            onClick={() => toggleDiskSelection(d.name)}
                            className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all ${
                              isSelected
                                ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400 font-semibold'
                                : isLightMode
                                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <HardDrive className="w-4 h-4" />
                              <span className="font-mono">{d.name}</span>
                            </div>
                            <span className="font-mono text-[11px]">{d.size}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  value={newVgName}
                  onChange={(e) => setNewVgName(e.target.value)}
                  placeholder="e.g. data-vg or storage-vg"
                  className={`w-full px-3 py-2 text-xs rounded-xl border font-mono ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800'
                      : 'bg-slate-900 border-slate-700 text-slate-200'
                  }`}
                />

                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1.5">
                    {isEn ? 'Select Raw Disks for this Volume Group:' : 'انتخاب دیسک‌های خام برای گروه حجم:'}
                  </label>
                  {unassignedDisks.length === 0 ? (
                    <div
                      className={`p-3 rounded-xl border text-xs text-amber-400 ${
                        isLightMode ? 'bg-amber-50 border-amber-200' : 'bg-amber-950/20 border-amber-900/50'
                      }`}
                    >
                      {isEn
                        ? 'No unassigned raw disks available. Click "Online Rescan Disks" on the main tab to detect newly attached hardware.'
                        : 'هیچ دیسک خام تخصیص‌نیافته‌ای یافت نشد. دکمه «اسکن سریع دیسک‌ها» را بزنید تا دیسک جدید شناسایی شود.'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {unassignedDisks.map((d) => {
                        const isSelected = selectedDisks.includes(d.name);
                        return (
                          <div
                            key={d.name}
                            onClick={() => toggleDiskSelection(d.name)}
                            className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all ${
                              isSelected
                                ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400 font-semibold'
                                : isLightMode
                                ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <HardDrive className="w-4 h-4" />
                              <span className="font-mono">{d.name}</span>
                            </div>
                            <span className="font-mono text-[11px]">{d.size}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* LV Name & Size */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold">{isEn ? 'Logical Volume Name' : 'نام لاجیکال ولوم (LV)'}</label>
                <FieldInfoTooltip
                  title={isEn ? 'LV Name' : 'نام ولوم'}
                  whatIsIt={isEn ? 'Identifier for the new partition.' : 'نام شناسه پارتیشن مجازی جدید.'}
                  whyNeeded={isEn ? 'Used in /dev/<vg>/<lv> mapping path.' : 'مسیر دسترسی در /dev/<vg>/<lv> را مشخص می‌کند.'}
                  example={isEn ? 'data_lv, opt_lv, app_data' : 'data_lv یا storage_lv'}
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>
              <input
                type="text"
                value={lvName}
                onChange={(e) => setLvName(e.target.value)}
                placeholder="e.g. data_lv"
                className={`w-full px-3 py-2 text-xs rounded-xl border font-mono ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800'
                    : 'bg-slate-900 border-slate-700 text-slate-200'
                }`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold">{isEn ? 'Volume Size' : 'حجم ولوم'}</label>
                <FieldInfoTooltip
                  title={isEn ? 'Volume Size' : 'حجم فضا'}
                  whatIsIt={isEn ? 'Desired storage capacity (e.g. 20G, 100G) or 100%FREE.' : 'حجم مورد نظر مثلاً 20G یا کل فضا.'}
                  whyNeeded={isEn ? 'Determines space allocated from the VG pool.' : 'میزان فضای تخصیص‌یافته از استخر گروه را تعیین می‌کند.'}
                  example={isEn ? '20G, 50G, 100%FREE' : '20G یا 100%FREE'}
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={size}
                  disabled={useAllFree}
                  onChange={(e) => setSize(e.target.value)}
                  placeholder="e.g. 20G"
                  className={`flex-1 px-3 py-2 text-xs rounded-xl border font-mono disabled:opacity-50 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800'
                      : 'bg-slate-900 border-slate-700 text-slate-200'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setUseAllFree(!useAllFree)}
                  className={`px-2.5 py-2 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer ${
                    useAllFree
                      ? 'bg-cyan-500 text-white border-cyan-500'
                      : isLightMode
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  100%FREE
                </button>
              </div>
            </div>
          </div>

          {/* Filesystem Format */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold">{isEn ? 'Filesystem Format' : 'فرمت فایل‌سیستم'}</label>
              <FieldInfoTooltip
                title={isEn ? 'Filesystem Type' : 'نوع فایل‌سیستم'}
                whatIsIt={
                  isEn
                    ? 'The storage formatting structure: ext4 (standard, shrinkable), XFS (high-throughput enterprise), or Btrfs.'
                    : 'ساختار فرمت فایل‌ها: ext4 (استاندارد لینوکس و قابل کوچک‌سازی)، XFS (سرعت بالا و اینترپرایز)، یا Btrfs.'
                }
                whyNeeded={
                  isEn
                    ? 'Different filesystems provide different capabilities. ext4 allows both extending and shrinking, while XFS can only grow.'
                    : 'فایل‌سیستم ext4 امکان هم اکستند و هم شرینک را دارد؛ در حالی که XFS طبق معماری‌اش فقط قابل اکستند است.'
                }
                example={isEn ? 'ext4 (Recommended) or xfs' : 'ext4 (پیشنهادی) یا xfs'}
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { type: 'ext4', desc: isEn ? 'Standard & Shrinkable' : 'استاندارد و قابل شرینک' },
                { type: 'xfs', desc: isEn ? 'Enterprise Performance' : 'سرعت سازمانی (فقط اکستند)' },
                { type: 'btrfs', desc: isEn ? 'Snapshot & Checksum' : 'اسنپ‌شات و چک‌سام' },
              ].map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setFsType(item.type as any)}
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                    fsType === item.type
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 font-bold'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="font-mono text-xs block">{item.type.toUpperCase()}</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">{item.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Mount Path & fstab Persistence */}
          <div
            className={`p-3.5 rounded-xl border space-y-3 ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold">{isEn ? 'Mount Path (Optional)' : 'مسیر مانت در لینوکس (اختیاری)'}</label>
                <FieldInfoTooltip
                  title={isEn ? 'Mount Path' : 'مسیر مانت'}
                  whatIsIt={
                    isEn
                      ? 'The directory where the volume will be attached and accessible (e.g. /data, /mnt/storage).'
                      : 'پوشه‌ای در سیستم‌عامل که حجم در آن در دسترس قرار می‌گیرد (مانند /data یا /mnt/storage).'
                  }
                  whyNeeded={
                    isEn
                      ? 'Enables direct read/write file access immediately upon volume creation.'
                      : 'امکان استفاده و خواندن و نوشتن فایل‌ها بلافاصله پس از ساخت را فراهم می‌آورد.'
                  }
                  example={isEn ? '/data, /mnt/storage, /var/www' : '/data یا /mnt/storage'}
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>
              <input
                type="text"
                value={mountPath}
                onChange={(e) => setMountPath(e.target.value)}
                placeholder="/data"
                className={`w-full px-3 py-2 text-xs rounded-xl border font-mono ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800'
                    : 'bg-slate-900 border-slate-700 text-slate-200'
                }`}
              />
            </div>

            {mountPath.trim() && (
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={persistInFstab}
                  onChange={(e) => setPersistInFstab(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-semibold block text-emerald-400">
                    {isEn
                      ? 'Persist in /etc/fstab across reboots (Automount with UUID & nofail)'
                      : 'مانت دائمی در سیستم (ثبت خودکار در /etc/fstab با UUID و nofail)'}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    {isEn
                      ? 'Ensures the volume mounts automatically every time the server restarts.'
                      : 'باعث می‌شود با هر بار ریستارت شدن سرور، این پارتیشن به طور خودکار مانت بماند.'}
                  </span>
                </div>
              </label>
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
                    {/* Action 1: Extend LV */}
                    {onOpenExtendLv && createdDetails && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenExtendLv(createdDetails.vg, createdDetails.lv);
                        }}
                        className="p-3 rounded-xl border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 transition-all flex flex-col items-center text-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <ArrowUpRight className="w-5 h-5 text-cyan-400" />
                        <span className="text-xs font-bold">
                          {isEn ? 'Extend Logical Volume' : 'افزایش حجم ولوم (LV)'}
                        </span>
                        <span className="text-[10px] text-slate-400 leading-tight">
                          {isEn
                            ? `Expand "${createdDetails.lv}" with additional storage`
                            : `افزایش بیشتر فضای ولوم ${createdDetails.lv}`}
                        </span>
                      </button>
                    )}

                    {/* Action 2: Add More Physical Disks to VG */}
                    {onOpenAddDiskToVg && createdDetails && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenAddDiskToVg(createdDetails.vg);
                        }}
                        className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 hover:text-emerald-200 transition-all flex flex-col items-center text-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <PlusCircle className="w-5 h-5 text-emerald-400" />
                        <span className="text-xs font-bold">
                          {isEn ? 'Add Physical Disk (VG)' : 'پیوست دیسک فیزیکی به گروه'}
                        </span>
                        <span className="text-[10px] text-slate-400 leading-tight">
                          {isEn
                            ? `Attach more raw drives to VG "${createdDetails.vg}"`
                            : `اتصال دیسک‌های خام بیشتر به گروه ${createdDetails.vg}`}
                        </span>
                      </button>
                    )}

                    {/* Action 3: Done & Return */}
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-3 rounded-xl border border-teal-500/40 bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 hover:text-teal-200 transition-all flex flex-col items-center text-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <CheckCircle2 className="w-5 h-5 text-teal-400" />
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
              disabled={submitting}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-all shadow-md shadow-emerald-600/20 cursor-pointer flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{isEn ? 'Creating & Formatting...' : 'در حال ایجاد و فرمت...'}</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Create Volume' : 'ایجاد فضای جدید'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
