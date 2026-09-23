import React, { useState, useEffect } from 'react';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  HardDrive,
  Layers,
  Database,
  Folder,
  Sliders,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Terminal,
  PlusCircle,
  HelpCircle,
  Cpu,
} from 'lucide-react';
import {
  RemoteServer,
  LinuxLvmOverview,
  LinuxLvmLv,
  LinuxLvmVg,
  LinuxLvmPv,
  LinuxRawDisk,
} from '../../../types';
import {
  extendLinuxLvVolume,
  createLinuxLvmVolume,
  addDiskToLinuxVg,
  rescanLinuxStorageDisks,
} from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface LinuxStoragePipelineModalProps {
  isOpen: boolean;
  server: RemoteServer;
  overview: LinuxLvmOverview | null;
  initialMode?: 'extend_existing' | 'create_new';
  initialTargetLv?: LinuxLvmLv | null;
  initialTargetDisk?: string | null;
  initialTargetVg?: string | null;
  ephemeralPassword?: string;
  onClose: () => void;
  onMinimize?: () => void;
  onSuccess: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const LinuxStoragePipelineModal: React.FC<LinuxStoragePipelineModalProps> = ({
  isOpen,
  server,
  overview,
  initialMode = 'extend_existing',
  initialTargetLv = null,
  initialTargetDisk = null,
  initialTargetVg = null,
  ephemeralPassword,
  onClose,
  onMinimize,
  onSuccess,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  // Workflow Mode:
  // 'extend_existing': Disk -> PV -> Existing VG -> Target LV -> Filesystem -> Mount Point (e.g. /var or /)
  // 'create_new': Disk -> PV -> New/Existing VG -> New LV -> Format -> New Mount Point (e.g. /data)
  const [workflowMode, setWorkflowMode] = useState<'extend_existing' | 'create_new'>(initialMode);

  // Storage Source Selection:
  // 'new_disk': Attach unassigned raw physical disk (/dev/sdb, /dev/vdb)
  // 'vg_pool': Use existing unallocated free space in VG pool
  // 'hypervisor_resized': Underlying virtual disk was expanded (triggers pvresize)
  const [sourceType, setSourceType] = useState<'new_disk' | 'vg_pool' | 'hypervisor_resized'>('new_disk');

  // Selected Physical Disk
  const [selectedDisk, setSelectedDisk] = useState<string>('');
  const [isCustomDisk, setIsCustomDisk] = useState(false);
  const [customDiskPath, setCustomDiskPath] = useState('');

  // Target Volume Group
  const [selectedVgName, setSelectedVgName] = useState<string>('');
  const [isNewVgForCreate, setIsNewVgForCreate] = useState(false);
  const [newVgName, setNewVgName] = useState('data-vg');

  // Target Logical Volume (for extend)
  const [selectedLvPath, setSelectedLvPath] = useState<string>('');

  // New LV settings (for create_new)
  const [newLvName, setNewLvName] = useState('data_lv');
  const [fsType, setFsType] = useState<'ext4' | 'xfs'>('ext4');
  const [newMountPoint, setNewMountPoint] = useState('/data');
  const [persistInFstab, setPersistInFstab] = useState(true);

  // Size Configuration
  const [addSize, setAddSize] = useState('20G');
  const [useAllFree, setUseAllFree] = useState(false);

  // Execution & Feedback State
  const [submitting, setSubmitting] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const availableDisks = overview?.availableDisks || [];
  const unassignedDisks = availableDisks.filter((d) => !d.isInLvm || d.name === initialTargetDisk);
  const vgs = overview?.vgs || [];
  const lvs = overview?.lvs || [];

  // Initialize selections when modal opens or inputs change
  useEffect(() => {
    if (!isOpen) return;

    setWorkflowMode(initialMode);
    setFeedback(null);

    // Initial Disk selection
    if (initialTargetDisk) {
      setSelectedDisk(initialTargetDisk);
      setIsCustomDisk(false);
    } else if (unassignedDisks.length > 0) {
      setSelectedDisk(unassignedDisks[0].name);
      setIsCustomDisk(false);
    } else {
      setSelectedDisk('');
      setIsCustomDisk(false);
    }

    // Initial LV selection
    if (initialTargetLv) {
      setSelectedLvPath(initialTargetLv.path);
      setSelectedVgName(initialTargetLv.vgName);
    } else if (lvs.length > 0) {
      setSelectedLvPath(lvs[0].path);
      setSelectedVgName(lvs[0].vgName);
    }

    // Initial VG selection
    if (initialTargetVg && vgs.some((v) => v.name === initialTargetVg)) {
      setSelectedVgName(initialTargetVg);
    } else if (vgs.length > 0 && !selectedVgName) {
      setSelectedVgName(vgs[0].name);
    }

    // Determine initial source type based on unassigned disks vs VG free space
    if (unassignedDisks.length > 0) {
      setSourceType('new_disk');
    } else if (vgs.some((v) => parseFloat(v.free) > 0)) {
      setSourceType('vg_pool');
    } else {
      setSourceType('hypervisor_resized');
    }
  }, [isOpen, initialMode, initialTargetLv, initialTargetDisk, initialTargetVg, overview]);

  // Sync VG when selected LV changes
  useEffect(() => {
    if (selectedLvPath) {
      const found = lvs.find((l) => l.path === selectedLvPath);
      if (found) {
        setSelectedVgName(found.vgName);
      }
    }
  }, [selectedLvPath, lvs]);

  if (!isOpen) return null;

  const currentLv = lvs.find((l) => l.path === selectedLvPath);
  const effectiveVgName = workflowMode === 'create_new' && isNewVgForCreate ? newVgName.trim() : selectedVgName;
  const currentVg = vgs.find((v) => v.name === effectiveVgName);
  const effectiveDiskPath = isCustomDisk ? customDiskPath.trim() : selectedDisk;
  const currentDiskObj = availableDisks.find((d) => d.name === effectiveDiskPath);

  // Handle Online Rescan
  const handleRescanDisks = async () => {
    setRescanning(true);
    setFeedback(null);
    try {
      const res = await rescanLinuxStorageDisks(server.id, ephemeralPassword);
      if (res.success) {
        setFeedback({
          type: 'success',
          message:
            res.message ||
            (isEn
              ? 'Online SCSI rescan completed! Newly attached disks and expanded capacities detected.'
              : 'اسکن آنلاین با موفقیت انجام شد! دیسک‌های جدید شناسایی شدند.'),
        });
        onSuccess();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || (isEn ? 'Rescan failed.' : 'خطا در اسکن آنلاین دیسک‌ها.'),
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || (isEn ? 'Rescan error occurred.' : 'خطای ارتباط در اسکن آنلاین.'),
      });
    } finally {
      setRescanning(false);
    }
  };

  // Submit Pipeline Execution
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    const sizeValue = useAllFree ? '100%FREE' : addSize.trim();

    try {
      if (workflowMode === 'extend_existing') {
        if (!selectedLvPath || !currentLv) {
          setFeedback({
            type: 'error',
            message: isEn ? 'Please select a Logical Volume to extend.' : 'لطفاً لاجیکال ولوم مورد نظر را برای افزایش حجم انتخاب کنید.',
          });
          setSubmitting(false);
          return;
        }

        const attachDisk = sourceType === 'new_disk' && effectiveDiskPath ? effectiveDiskPath : undefined;

        const res = await extendLinuxLvVolume(
          server.id,
          {
            lvPath: currentLv.path,
            vgName: currentLv.vgName,
            addSize: sizeValue,
            diskToAddToVg: attachDisk,
            fsType: currentLv.fsType || undefined,
            mountPoint: currentLv.mountPoint || undefined,
          },
          ephemeralPassword
        );

        if (res.success) {
          setFeedback({
            type: 'success',
            message:
              res.message ||
              (isEn
                ? `Pipeline completed successfully! Volume "${currentLv.name}" at ${currentLv.mountPoint || 'mount'} has been expanded.`
                : `پایپ‌لاین با موفقیت اجرا شد! ولوم «${currentLv.name}» در مسیر ${currentLv.mountPoint || 'مانت'} بدون قطعی افزایش یافت.`),
          });
          onSuccess();
        } else {
          setFeedback({
            type: 'error',
            message: res.error || res.message || (isEn ? 'Pipeline extension failed.' : 'خطا در اجرای پایپ‌لاین افزایش حجم.'),
          });
        }
      } else {
        // Mode: create_new
        const cleanLv = newLvName.trim();
        if (!cleanLv) {
          setFeedback({
            type: 'error',
            message: isEn ? 'Please specify a name for the new Logical Volume.' : 'لطفاً نام ولوم جدید را وارد کنید.',
          });
          setSubmitting(false);
          return;
        }

        const disksForVg =
          effectiveDiskPath ? [effectiveDiskPath] : [];

        const res = await createLinuxLvmVolume(
          server.id,
          {
            isNewVg: isNewVgForCreate,
            vgName: effectiveVgName,
            selectedDisks: disksForVg.length > 0 ? disksForVg : undefined,
            lvName: cleanLv,
            size: sizeValue,
            fsType,
            mountPath: newMountPoint.trim() || undefined,
            persistInFstab: !!newMountPoint.trim() && persistInFstab,
          },
          ephemeralPassword
        );

        if (res.success) {
          setFeedback({
            type: 'success',
            message:
              res.message ||
              (isEn
                ? `Pipeline completed successfully! New Volume "${cleanLv}" formatted with ${fsType} and mounted to ${newMountPoint}.`
                : `پایپ‌لاین با موفقیت اجرا شد! ولوم جدید «${cleanLv}» با فرمت ${fsType} در مسیر ${newMountPoint} ایجاد و پایدار شد.`),
          });
          onSuccess();
        } else {
          setFeedback({
            type: 'error',
            message: res.error || res.message || (isEn ? 'Failed to create new volume pipeline.' : 'خطا در اجرای پایپ‌لاین ایجاد ولوم جدید.'),
          });
        }
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || (isEn ? 'Execution error occurred.' : 'خطای پیش‌بینی نشده در اجرای دستورات.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={
        isMaximized
          ? 'fixed top-0 left-0 right-0 bottom-8 z-50 p-0 flex flex-col bg-slate-950/80 backdrop-blur-sm'
          : 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto'
      }
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col transition-all duration-200 overflow-hidden shadow-2xl ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-3xl rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-800'
            : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header with 3 Control Buttons */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/80 border-slate-800/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 to-teal-500 text-white shadow-md shadow-cyan-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold">
                  {isEn ? 'End-to-End Linux Storage Pipeline' : 'پایپ‌لاین جامع معماری ذخیره‌سازی لینوکس (LVM)'}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  Disk → PV → VG → LV → FS → Mount
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEn
                  ? 'Cohesive 6-layer orchestration: physical device enrollment, pool aggregation, volume expansion & online filesystem growth.'
                  : 'یکپارچه‌سازی شش‌لایه معماری: تبدیل دیسک خام فیزیکی به استخر حافظه، ایجاد یا گسترش ولوم و رشد آنلاین فایل‌سیستم.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Online Rescan Button */}
            <button
              type="button"
              onClick={handleRescanDisks}
              disabled={rescanning}
              className={`p-2 rounded-lg border transition-colors cursor-pointer mr-1 ${
                isLightMode
                  ? 'hover:bg-amber-100 text-amber-700 border-amber-300'
                  : 'hover:bg-amber-950/40 text-amber-400 border-amber-800/50'
              }`}
              title={isEn ? 'Rescan SCSI & Disks' : 'اسکن آنلاین دیسک‌ها'}
            >
              <RefreshCw className={`w-4 h-4 ${rescanning ? 'animate-spin' : ''}`} />
            </button>

            {/* Minimize Button */}
            <button
              type="button"
              onClick={onMinimize || onClose}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-600'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title={isEn ? 'Minimize' : 'کوچک‌نمایی'}
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Fullscreen Button */}
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

            {/* Close Button */}
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* THE 6-LAYER ARCHITECTURE VISUAL RIBBON */}
          <div
            className={`p-4 rounded-2xl border ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/70 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>{isEn ? 'Logical Storage Hierarchy Layers' : 'سلسله‌مراتب لایه‌های ذخیره‌سازی'}</span>
              </span>
              <span className="text-[11px] text-cyan-400 font-mono">
                {isEn ? 'Atomic Zero-Downtime Chain' : 'اجرای زنجیره‌ای بدون قطعی'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs">
              {/* Layer 1: Disk */}
              <div
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-between gap-1 transition-all ${
                  sourceType === 'new_disk'
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 ring-1 ring-amber-500/30'
                    : isLightMode
                    ? 'bg-slate-50 border-slate-200 text-slate-600'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400'
                }`}
              >
                <HardDrive className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-[11px]">1. Disk</span>
                <span className="text-[9px] text-slate-400 leading-tight">
                  {isEn ? 'Physical raw space' : 'فضای فیزیکی جدید'}
                </span>
              </div>

              {/* Layer 2: PV */}
              <div
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-between gap-1 transition-all ${
                  sourceType === 'new_disk' || sourceType === 'hypervisor_resized'
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 ring-1 ring-emerald-500/30'
                    : isLightMode
                    ? 'bg-slate-50 border-slate-200 text-slate-600'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400'
                }`}
              >
                <Cpu className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-[11px]">2. PV</span>
                <span className="text-[9px] text-slate-400 leading-tight">
                  {isEn ? 'LVM usable format' : 'فرمت قابل فهم LVM'}
                </span>
              </div>

              {/* Layer 3: VG */}
              <div
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-between gap-1 transition-all bg-cyan-500/10 border-cyan-500/40 text-cyan-400 ring-1 ring-cyan-500/30`}
              >
                <Layers className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-[11px]">3. VG</span>
                <span className="text-[9px] text-slate-400 leading-tight">
                  {isEn ? 'Aggregated pool' : 'مخزن/Pool مشترک'}
                </span>
              </div>

              {/* Layer 4: LV */}
              <div
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-between gap-1 transition-all bg-indigo-500/10 border-indigo-500/40 text-indigo-400 ring-1 ring-indigo-500/30`}
              >
                <Database className="w-4 h-4 text-indigo-400" />
                <span className="font-bold text-[11px]">4. LV</span>
                <span className="text-[9px] text-slate-400 leading-tight">
                  {isEn ? 'Partition slice' : 'برداشت ظرفیت ولوم'}
                </span>
              </div>

              {/* Layer 5: Filesystem */}
              <div
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-between gap-1 transition-all bg-teal-500/10 border-teal-500/40 text-teal-400 ring-1 ring-teal-500/30`}
              >
                <Sliders className="w-4 h-4 text-teal-400" />
                <span className="font-bold text-[11px]">5. Filesystem</span>
                <span className="text-[9px] text-slate-400 leading-tight">
                  {isEn ? 'ext4 or XFS grow' : 'ساختار ext4 / XFS'}
                </span>
              </div>

              {/* Layer 6: Mount Point */}
              <div
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-between gap-1 transition-all bg-blue-500/10 border-blue-500/40 text-blue-400 ring-1 ring-blue-500/30`}
              >
                <Folder className="w-4 h-4 text-blue-400" />
                <span className="font-bold text-[11px]">6. Mount</span>
                <span className="text-[9px] text-slate-400 leading-tight">
                  {isEn ? 'e.g. /var or /' : 'مسیر مثلاً /var یا /'}
                </span>
              </div>
            </div>
          </div>

          {/* Workflow Mode Tabs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {isEn ? 'Select Primary Objective' : 'انتخاب هدف عملیاتی'}
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setWorkflowMode('extend_existing')}
                className={`p-4 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-3 ${
                  workflowMode === 'extend_existing'
                    ? isLightMode
                      ? 'bg-cyan-50/80 border-cyan-500 ring-1 ring-cyan-500/40 shadow-sm'
                      : 'bg-cyan-950/30 border-cyan-500/60 ring-1 ring-cyan-500/40 shadow-sm shadow-cyan-500/10'
                    : isLightMode
                    ? 'bg-white border-slate-200 hover:border-slate-300'
                    : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <ArrowUpRight
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    workflowMode === 'extend_existing' ? 'text-cyan-400' : 'text-slate-500'
                  }`}
                />
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-200">
                    {isEn ? 'Option A: Extend Existing Partition (e.g. /var or /)' : 'گزینه ۱: افزایش حجم پارتیشن موجود (مانند /var یا /)'}
                  </div>
                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    {isEn
                      ? 'Channel newly added disk space or existing VG pool into an existing mounted directory without downtime.'
                      : 'هدایت ظرفیت دیسک فیزیکی جدید یا فضای استخر به پارتیشن مانت‌شده موجود بدون نیاز به خاموشی سرور.'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setWorkflowMode('create_new')}
                className={`p-4 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-3 ${
                  workflowMode === 'create_new'
                    ? isLightMode
                      ? 'bg-teal-50/80 border-teal-500 ring-1 ring-teal-500/40 shadow-sm'
                      : 'bg-teal-950/30 border-teal-500/60 ring-1 ring-teal-500/40 shadow-sm shadow-teal-500/10'
                    : isLightMode
                    ? 'bg-white border-slate-200 hover:border-slate-300'
                    : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <PlusCircle
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    workflowMode === 'create_new' ? 'text-teal-400' : 'text-slate-500'
                  }`}
                />
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-200">
                    {isEn ? 'Option B: Create New Volume & Mount Point (e.g. /data)' : 'گزینه ۲: ساخت ولوم و مانت پوینت جدید (مانند /data)'}
                  </div>
                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    {isEn
                      ? 'Initialize a fresh volume, format with ext4/XFS, mount to a directory, and persist in /etc/fstab.'
                      : 'ساخت درایو جدید مستقل، فرمت با ext4 یا XFS، مانت به مسیر دلخواه و ذخیره دائمی در /etc/fstab.'}
                  </div>
                </div>
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* STEP 1 & 2: SOURCE DISK & STORAGE ORIGIN */}
            <div
              className={`p-4 rounded-xl border space-y-4 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/50 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    {isEn ? 'Step 1 & 2: Space Source (Disk & PV)' : 'گام ۱ و ۲: منبع تأمین فضا (دیسک و PV)'}
                  </span>
                </div>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  title={isEn ? 'Storage Source' : 'منبع فضای ذخیره‌سازی'}
                  whatIsIt={
                    isEn
                      ? 'Determines where the additional gigabytes come from: an unassigned physical disk, existing VG pool free space, or hypervisor expanded disk.'
                      : 'مشخص می‌کند ظرفیت جدید از کجا تأمین شود: دیسک فیزیکی جدید، فضای آزاد استخر VG یا افزایش اندازه دیسک مجازی در هایپروایزر.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Guarantees the storage manager executes pvcreate or pvresize as required before allocation.'
                      : 'تضمین می‌کند دستورات pvcreate یا pvresize در صورت نیاز قبل از تخصیص به صورت خودکار اجرا شوند.'
                  }
                  example={isEn ? '/dev/sdb, 100GB' : '/dev/sdb یا فضای آزاد VG'}
                />
              </div>

              {/* Source Type Options */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div
                  onClick={() => setSourceType('new_disk')}
                  className={`p-3 rounded-xl border cursor-pointer text-xs transition-all ${
                    sourceType === 'new_disk'
                      ? 'bg-amber-500/10 border-amber-500/60 text-amber-300 font-semibold ring-1 ring-amber-500/40'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>{isEn ? 'A. Add New Physical Disk' : 'الف. دیسک فیزیکی جدید'}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">
                      pvcreate
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    {isEn
                      ? 'Newly attached block device (e.g. /dev/sdb 100GB). Auto-inits PV and extends VG.'
                      : 'دیسک خام جدید متصل‌شده به سرور. اجرای خودکار pvcreate و vgextend.'}
                  </p>
                </div>

                <div
                  onClick={() => setSourceType('vg_pool')}
                  className={`p-3 rounded-xl border cursor-pointer text-xs transition-all ${
                    sourceType === 'vg_pool'
                      ? 'bg-cyan-500/10 border-cyan-500/60 text-cyan-300 font-semibold ring-1 ring-cyan-500/40'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>{isEn ? 'B. Existing VG Free Space' : 'ب. فضای آزاد موجود در VG'}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-mono">
                      VG Pool
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    {isEn
                      ? 'Use unallocated free space already residing in the Volume Group pool.'
                      : 'استفاده از ظرفیت آزاد موجود در استخر گروه حجم بدون نیاز به دیسک جدید.'}
                  </p>
                </div>

                <div
                  onClick={() => setSourceType('hypervisor_resized')}
                  className={`p-3 rounded-xl border cursor-pointer text-xs transition-all ${
                    sourceType === 'hypervisor_resized'
                      ? 'bg-emerald-500/10 border-emerald-500/60 text-emerald-300 font-semibold ring-1 ring-emerald-500/40'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>{isEn ? 'C. Resized Virtual Disk' : 'ج. افزایش اندازه دیسک در VM'}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                      pvresize
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    {isEn
                      ? 'VMware/Proxmox disk was resized. Auto-runs online SCSI rescan & pvresize.'
                      : 'افزایش سایز دیسک در هایپروایزر. اجرای آنلاین اسکن و pvresize.'}
                  </p>
                </div>
              </div>

              {/* Disk Selector (if sourceType is new_disk or hypervisor_resized) */}
              {sourceType !== 'vg_pool' && (
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <span>{isEn ? 'Select Physical Block Device' : 'انتخاب دستگاه دیسک فیزیکی'}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCustomDisk(!isCustomDisk)}
                      className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
                    >
                      {isCustomDisk
                        ? isEn
                          ? '← Choose from detected list'
                          : '← انتخاب از لیست کشف‌شده'
                        : isEn
                        ? '+ Enter custom device path'
                        : '+ درج دستی مسیر دستگاه'}
                    </button>
                  </div>

                  {isCustomDisk ? (
                    <input
                      type="text"
                      value={customDiskPath}
                      onChange={(e) => setCustomDiskPath(e.target.value)}
                      placeholder="/dev/sdb or /dev/vdb"
                      className={`w-full px-3.5 py-2.5 text-xs rounded-xl border font-mono transition-colors ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-800'
                          : 'bg-slate-900 border-slate-700 text-slate-200'
                      }`}
                    />
                  ) : unassignedDisks.length === 0 ? (
                    <div
                      className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
                        isLightMode
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-amber-950/30 border-amber-800/50 text-amber-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>
                          {isEn
                            ? 'No unassigned raw disks detected. If you just added a disk in VMware/Proxmox, run Online Rescan.'
                            : 'هیچ دیسک خامی یافت نشد. اگر دیسکی در مجازی‌ساز اضافه کرده‌اید، اسکن آنلاین را بزنید.'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRescanDisks}
                        disabled={rescanning}
                        className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer shrink-0 ml-2"
                      >
                        {rescanning ? (isEn ? 'Scanning...' : 'در حال اسکن...') : (isEn ? 'Rescan Now' : 'اسکن اکنون')}
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {unassignedDisks.map((d) => {
                        const isSelected = selectedDisk === d.name;
                        return (
                          <div
                            key={d.name}
                            onClick={() => setSelectedDisk(d.name)}
                            className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                              isSelected
                                ? 'bg-cyan-500/10 border-cyan-500/60 ring-1 ring-cyan-500/40 font-semibold'
                                : isLightMode
                                ? 'bg-white border-slate-200 hover:border-slate-300'
                                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <HardDrive className={`w-4 h-4 ${isSelected ? 'text-cyan-400' : 'text-slate-400'}`} />
                              <div>
                                <span className="font-mono text-sm block">{d.name}</span>
                                <span className="text-[10px] text-slate-400 block">{d.type || 'disk'}</span>
                              </div>
                            </div>
                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              {d.size}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* STEP 3: VOLUME GROUP (VG) POOL */}
            <div
              className={`p-4 rounded-xl border space-y-4 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/50 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    {isEn ? 'Step 3: Volume Group Storage Pool (VG)' : 'گام ۳: مخزن گروه حجم (Volume Group)'}
                  </span>
                </div>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  title={isEn ? 'Volume Group Pool' : 'استخر گروه حجم'}
                  whatIsIt={
                    isEn
                      ? 'The unified storage pool created by aggregating physical volumes. All Logical Volumes take their capacity from here.'
                      : 'استخر مشترک ذخیره‌سازی که از تجمیع PVها به وجود می‌آید و تمام ولوم‌های سیستم از این مخزن فضا دریافت می‌کنند.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Selecting the target VG directs the newly enrolled disk capacity to the proper pool (vgextend).'
                      : 'مشخص می‌کند دیسک جدید به کدام استخر اضافه شود تا ظرفیت آن برای افزایش ولوم‌ها آزاد گردد.'
                  }
                  example={isEn ? 'ubuntu-vg, rhel-vg, data-vg' : 'ubuntu-vg یا rootvg'}
                />
              </div>

              {workflowMode === 'create_new' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsNewVgForCreate(false)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                        !isNewVgForCreate
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                          : isLightMode
                          ? 'bg-slate-100 border-slate-300 text-slate-600'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      {isEn ? 'Add to Existing Volume Group' : 'استفاده از گروه حجم موجود'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsNewVgForCreate(true)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                        isNewVgForCreate
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                          : isLightMode
                          ? 'bg-slate-100 border-slate-300 text-slate-600'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      {isEn ? '+ Create Brand New VG' : '+ ایجاد گروه حجم کاملاً جدید'}
                    </button>
                  </div>

                  {isNewVgForCreate ? (
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                        {isEn ? 'New Volume Group Name:' : 'نام گروه حجم جدید:'}
                      </label>
                      <input
                        type="text"
                        value={newVgName}
                        onChange={(e) => setNewVgName(e.target.value)}
                        placeholder="e.g. data-vg or storage-vg"
                        className={`w-full px-3.5 py-2 text-xs rounded-xl border font-mono ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-800'
                            : 'bg-slate-900 border-slate-700 text-slate-200'
                        }`}
                      />
                    </div>
                  ) : (
                    <select
                      value={selectedVgName}
                      onChange={(e) => setSelectedVgName(e.target.value)}
                      className={`w-full px-3.5 py-2.5 text-xs rounded-xl border font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-800'
                          : 'bg-slate-900 border-slate-700 text-slate-200'
                      }`}
                    >
                      {vgs.map((vg) => (
                        <option key={vg.name} value={vg.name}>
                          {vg.name} ({vg.size} Total, {vg.free} Free) - {vg.pvCount} PVs
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                /* Mode: extend_existing */
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    {isEn ? 'Target Volume Group:' : 'گروه حجم مقصد:'}
                  </label>
                  <select
                    value={selectedVgName}
                    onChange={(e) => setSelectedVgName(e.target.value)}
                    className={`w-full px-3.5 py-2.5 text-xs rounded-xl border font-mono ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-800'
                        : 'bg-slate-900 border-slate-700 text-slate-200'
                    }`}
                  >
                    {vgs.map((vg) => (
                      <option key={vg.name} value={vg.name}>
                        {vg.name} (Total: {vg.size}, Free Pool: {vg.free}) - {vg.pvCount} PVs
                      </option>
                    ))}
                  </select>
                  {currentVg && (
                    <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                      <span>{isEn ? 'Current VG Free Capacity:' : 'ظرفیت آزاد فعلی استخر:'}</span>
                      <span className="font-mono font-bold text-emerald-400">{currentVg.free}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* STEP 4, 5 & 6: LOGICAL VOLUME, FILESYSTEM & MOUNT POINT */}
            <div
              className={`p-4 rounded-xl border space-y-4 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/50 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    {isEn
                      ? 'Step 4, 5 & 6: Logical Volume, Filesystem & Mount Point'
                      : 'گام ۴، ۵ و ۶: لاجیکال ولوم، فایل‌سیستم و نقطه مانت'}
                  </span>
                </div>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  title={isEn ? 'Volume & Filesystem Growth' : 'گسترش ولوم و فایل‌سیستم'}
                  whatIsIt={
                    isEn
                      ? 'The operating system visible disk slice (LV), formatted filesystem (ext4/XFS), and its directory attachment (/var, /).'
                      : 'پارتیشن قابل رویت سیستم‌عامل (LV)، ساختار فایل‌سیستم و محل اتصال آن به شاخه‌های لینوکس مثل /var یا /.'
                  }
                  whyNeeded={
                    isEn
                      ? 'After extending the raw LVM boundary, the filesystem must be expanded (resize2fs or xfs_growfs) so programs can write files immediately.'
                      : 'پس از افزایش فضای LVM، فایل‌سیستم باید به صورت آنلاین رشد داده شود تا سیستم‌عامل فوراً فضای بیشتر را برای ذخیره داده‌ها ببیند.'
                  }
                  example={isEn ? '/dev/ubuntu-vg/ubuntu-lv mounted on /' : '/dev/ubuntu-vg/ubuntu-lv مانت در /'}
                />
              </div>

              {workflowMode === 'extend_existing' ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                      {isEn ? 'Select Mounted Volume to Expand:' : 'انتخاب ولوم مانت‌شده جهت افزایش حجم:'}
                    </label>
                    <select
                      value={selectedLvPath}
                      onChange={(e) => setSelectedLvPath(e.target.value)}
                      className={`w-full px-3.5 py-2.5 text-xs rounded-xl border font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-800'
                          : 'bg-slate-900 border-slate-700 text-slate-200'
                      }`}
                    >
                      {lvs.map((lv) => (
                        <option key={lv.path} value={lv.path}>
                          {lv.name} ({lv.size}) → Mount: {lv.mountPoint || 'Unmounted'} [{lv.vgName}]
                        </option>
                      ))}
                    </select>
                  </div>

                  {currentLv && (
                    <div
                      className={`p-3 rounded-xl border text-xs grid grid-cols-2 sm:grid-cols-4 gap-2 ${
                        isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div>
                        <span className="text-[10px] text-slate-400 block">{isEn ? 'Current Size' : 'حجم فعلی'}</span>
                        <span className="font-mono font-bold text-cyan-400 mt-0.5 block">{currentLv.size}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">{isEn ? 'Mount Point' : 'مسیر مانت'}</span>
                        <span className="font-mono font-bold text-slate-200 mt-0.5 block">
                          {currentLv.mountPoint || 'Unmounted'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">{isEn ? 'Filesystem' : 'فایل‌سیستم'}</span>
                        <span className="font-mono font-bold text-teal-400 mt-0.5 block">
                          {currentLv.fsType || 'ext4'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">{isEn ? 'Resize Method' : 'ابزار رشد'}</span>
                        <span className="font-mono text-slate-300 mt-0.5 block">
                          {currentLv.fsType === 'xfs' ? 'xfs_growfs' : 'resize2fs'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Mode: create_new */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                        {isEn ? 'Logical Volume Name:' : 'نام لاجیکال ولوم:'}
                      </label>
                      <input
                        type="text"
                        value={newLvName}
                        onChange={(e) => setNewLvName(e.target.value)}
                        placeholder="e.g. data_lv or app_storage"
                        className={`w-full px-3.5 py-2 text-xs rounded-xl border font-mono ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-800'
                            : 'bg-slate-900 border-slate-700 text-slate-200'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                        {isEn ? 'Filesystem Type:' : 'فرمت فایل‌سیستم:'}
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setFsType('ext4')}
                          className={`py-2 text-xs rounded-xl border font-mono cursor-pointer transition-colors ${
                            fsType === 'ext4'
                              ? 'bg-teal-500/20 border-teal-500 text-teal-300 font-bold'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-300 text-slate-600'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          ext4 (Standard)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFsType('xfs')}
                          className={`py-2 text-xs rounded-xl border font-mono cursor-pointer transition-colors ${
                            fsType === 'xfs'
                              ? 'bg-teal-500/20 border-teal-500 text-teal-300 font-bold'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-300 text-slate-600'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          XFS (Enterprise)
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                        {isEn ? 'Mount Directory Path:' : 'مسیر پوشه مانت:'}
                      </label>
                      <input
                        type="text"
                        value={newMountPoint}
                        onChange={(e) => setNewMountPoint(e.target.value)}
                        placeholder="e.g. /data or /var/log/app"
                        className={`w-full px-3.5 py-2 text-xs rounded-xl border font-mono ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-800'
                            : 'bg-slate-900 border-slate-700 text-slate-200'
                        }`}
                      />
                    </div>

                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={persistInFstab}
                          onChange={(e) => setPersistInFstab(e.target.checked)}
                          className="rounded text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                        />
                        <span className="text-slate-300 font-medium">
                          {isEn ? 'Persist in /etc/fstab (Auto-mount on reboot)' : 'ذخیره در /etc/fstab (مانت دائمی پس از ریبوت)'}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* SIZE INCREMENT / ALLOCATION */}
              <div className="pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300">
                    {workflowMode === 'extend_existing'
                      ? isEn
                        ? 'Capacity to Add (Expansion Size)'
                        : 'میزان افزایش ظرفیت'
                      : isEn
                      ? 'Total Volume Size'
                      : 'حجم ولوم جدید'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setUseAllFree(!useAllFree)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                      useAllFree
                        ? 'bg-cyan-500 text-white border-cyan-500 shadow-sm'
                        : isLightMode
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Use All Free Space (+100%FREE)' : 'اختصاص کل فضای آزاد (+100%FREE)'}</span>
                  </button>
                </div>

                {!useAllFree && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={addSize}
                      onChange={(e) => setAddSize(e.target.value)}
                      placeholder="e.g. 10G, 50G, 100G"
                      className={`w-full px-3.5 py-2.5 text-xs rounded-xl border font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-800'
                          : 'bg-slate-900 border-slate-700 text-slate-200'
                      }`}
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-slate-400">{isEn ? 'Quick Presets:' : 'مقادیر سریع:'}</span>
                      {['5G', '10G', '20G', '50G', '100G', '200G'].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setAddSize(s)}
                          className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                            addSize === s
                              ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50'
                              : isLightMode
                              ? 'bg-slate-100 text-slate-600 border-slate-200'
                              : 'bg-slate-900 text-slate-400 border-slate-800'
                          }`}
                        >
                          +{s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* LIVE COMMAND EXECUTION PLAN PREVIEW */}
            <div
              className={`p-4 rounded-xl border font-mono text-xs space-y-2 ${
                isLightMode ? 'bg-slate-100 border-slate-300' : 'bg-slate-950/80 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between font-sans text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isEn ? 'Atomic Script Execution Plan' : 'برنامه گام‌به‌گام اجرای فرامین در سرور'}</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">Zero Downtime</span>
              </div>

              <div className="space-y-1 text-[11px] text-slate-300 pt-1">
                {sourceType === 'new_disk' && effectiveDiskPath && (
                  <>
                    <p className="text-amber-400"># 1. Initialize Raw Disk to PV</p>
                    <p className="text-slate-400 pl-3">sudo pvcreate -y -ff {effectiveDiskPath}</p>
                    <p className="text-cyan-400"># 2. Extend Volume Group Pool</p>
                    <p className="text-slate-400 pl-3">sudo vgextend {effectiveVgName} {effectiveDiskPath}</p>
                  </>
                )}

                {sourceType === 'hypervisor_resized' && effectiveDiskPath && (
                  <>
                    <p className="text-emerald-400"># 1. Rescan and Resize PV on Hypervisor-Expanded Disk</p>
                    <p className="text-slate-400 pl-3">sudo pvresize -y {effectiveDiskPath}</p>
                  </>
                )}

                {workflowMode === 'extend_existing' && currentLv ? (
                  <>
                    <p className="text-indigo-400"># 3. Extend Logical Volume Boundary</p>
                    <p className="text-slate-400 pl-3">
                      sudo lvextend {useAllFree ? '-l +100%FREE' : `-L +${addSize}`} -r {currentLv.path}
                    </p>
                    <p className="text-teal-400"># 4. Expand Live Filesystem</p>
                    <p className="text-slate-400 pl-3">
                      {currentLv.fsType === 'xfs'
                        ? `sudo xfs_growfs ${currentLv.mountPoint || currentLv.path}`
                        : `sudo resize2fs ${currentLv.path}`}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-indigo-400"># 3. Create Logical Volume Slice</p>
                    <p className="text-slate-400 pl-3">
                      sudo lvcreate {useAllFree ? '-l 100%FREE' : `-L ${addSize}`} -n {newLvName} {effectiveVgName} -y
                    </p>
                    <p className="text-teal-400"># 4. Format Filesystem ({fsType})</p>
                    <p className="text-slate-400 pl-3">sudo mkfs.{fsType} /dev/{effectiveVgName}/{newLvName}</p>
                    {newMountPoint && (
                      <>
                        <p className="text-blue-400"># 5. Mount and Persist</p>
                        <p className="text-slate-400 pl-3">
                          sudo mkdir -p {newMountPoint} && sudo mount /dev/{effectiveVgName}/{newLvName} {newMountPoint}
                        </p>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* FEEDBACK CALLOUT */}
            {feedback && (
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  feedback.type === 'success'
                    ? isLightMode
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                    : isLightMode
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : 'bg-rose-950/40 border-rose-800/60 text-rose-200'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 text-xs">
                  <div className="font-bold mb-0.5">
                    {feedback.type === 'success'
                      ? isEn
                        ? 'Operation Successful'
                        : 'عملیات با موفقیت انجام شد'
                      : isEn
                      ? 'Execution Error'
                      : 'خطا در اجرا'}
                  </div>
                  <div>{feedback.message}</div>
                </div>
              </div>
            )}

            {/* ACTION BUTTONS */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800/80">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  isLightMode
                    ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {isEn ? 'Close' : 'بستن'}
              </button>

              <button
                type="submit"
                disabled={submitting || (workflowMode === 'extend_existing' && !currentLv)}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 shadow-lg shadow-cyan-500/25 disabled:opacity-50 transition-all cursor-pointer"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{isEn ? 'Executing Pipeline...' : 'در حال اجرای پایپ‌لاین...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {workflowMode === 'extend_existing'
                        ? isEn
                          ? 'Execute Storage Extension'
                          : 'اجرای پایپ‌لاین افزایش حجم'
                        : isEn
                        ? 'Execute Volume Creation'
                        : 'اجرای پایپ‌لاین ساخت درایو جدید'}
                    </span>
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
