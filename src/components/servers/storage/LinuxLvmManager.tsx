import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  HardDrive,
  RefreshCw,
  Plus,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Folder,
  Sliders,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  Server,
  Info,
  Database,
  Search,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  PlusCircle,
  Compass,
  Cpu,
  Terminal,
} from 'lucide-react';
import {
  RemoteServer,
  LinuxLvmOverview,
  LinuxLvmLv,
  LinuxLvmVg,
  LinuxLvmPv,
  LinuxRawDisk,
} from '../../../types';
import { fetchLinuxLvmOverview, rescanLinuxStorageDisks } from '../../../services/api';
import { LinuxExtendLvModal } from './LinuxExtendLvModal';
import { LinuxCreateLvmModal } from './LinuxCreateLvmModal';
import { LinuxShrinkLvModal } from './LinuxShrinkLvModal';
import { LinuxAddDiskToVgModal } from './LinuxAddDiskToVgModal';
import { LinuxInitPvModal } from './LinuxInitPvModal';
import { LinuxStoragePipelineModal } from './LinuxStoragePipelineModal';
import { useModalDock } from '../../../context/ModalDockContext';

interface LinuxLvmManagerProps {
  server: RemoteServer;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
  onRefreshParent?: () => void;
}

export const LinuxLvmManager: React.FC<LinuxLvmManagerProps> = ({
  server,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
  onRefreshParent,
}) => {
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [overview, setOverview] = useState<LinuxLvmOverview | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Modals state
  const { dockModal, undockModal } = useModalDock();

  // Storage Pipeline Modal (Disk -> PV -> VG -> LV -> Filesystem -> Mount Point)
  const [pipelineModalOpen, setPipelineModalOpen] = useState(false);
  const [pipelineMode, setPipelineMode] = useState<'extend_existing' | 'create_new'>('extend_existing');
  const [pipelineTargetLv, setPipelineTargetLv] = useState<LinuxLvmLv | null>(null);
  const [pipelineTargetDisk, setPipelineTargetDisk] = useState<string | null>(null);
  const [pipelineTargetVg, setPipelineTargetVg] = useState<string | null>(null);

  const [initPvModalOpen, setInitPvModalOpen] = useState(false);
  const [targetDiskForInitPv, setTargetDiskForInitPv] = useState<string | null>(null);

  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [targetLvForExtend, setTargetLvForExtend] = useState<LinuxLvmLv | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [targetVgForCreate, setTargetVgForCreate] = useState<string | null>(null);

  const [shrinkModalOpen, setShrinkModalOpen] = useState(false);
  const [targetLvForShrink, setTargetLvForShrink] = useState<LinuxLvmLv | null>(null);

  const [addDiskModalOpen, setAddDiskModalOpen] = useState(false);
  const [targetVgForAddDisk, setTargetVgForAddDisk] = useState<string | null>(null);
  const [targetDiskForAddDisk, setTargetDiskForAddDisk] = useState<string | null>(null);

  // Active scenario guide toggle
  const [activeScenario, setActiveScenario] = useState<'new_disk' | 'extend_lv' | 'new_mount' | null>('new_disk');

  // Fetch LVM overview
  const loadLvmOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchLinuxLvmOverview(server.id, ephemeralPassword);
      if (res.success) {
        setOverview({
          pvs: res.pvs || [],
          vgs: res.vgs || [],
          lvs: res.lvs || [],
          availableDisks: res.availableDisks || [],
          lvmInstalled: res.lvmInstalled ?? true,
        });
      } else {
        setOverview({
          pvs: [],
          vgs: [],
          lvs: [],
          availableDisks: [],
          lvmInstalled: false,
        });
      }
    } catch (err: any) {
      console.error('Failed to load LVM overview:', err);
    } finally {
      setLoading(false);
    }
  }, [server.id, ephemeralPassword]);

  useEffect(() => {
    loadLvmOverview();
  }, [loadLvmOverview]);

  // Online SCSI & Block Device Rescan without reboot
  const handleOnlineRescan = async () => {
    setRescanning(true);
    setNotification(null);
    try {
      const res = await rescanLinuxStorageDisks(server.id, ephemeralPassword);
      if (res.success) {
        setNotification({
          type: 'success',
          message:
            res.message ||
            (isEn
              ? 'Online SCSI rescan completed! Newly attached disks and expanded capacities detected without restarting.'
              : 'اسکن آنلاین با موفقیت انجام شد! دیسک‌های جدید و افزایش ظرفیت‌های دیسک بدون نیاز به ریبوت شناسایی شدند.'),
        });
        await loadLvmOverview();
        if (onRefreshParent) onRefreshParent();
      } else {
        setNotification({
          type: 'error',
          message: res.error || res.message || (isEn ? 'Rescan failed.' : 'خطا در اسکن آنلاین دیسک‌ها.'),
        });
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err?.message || (isEn ? 'Rescan error occurred.' : 'خطای ارتباط رخ داد.'),
      });
    } finally {
      setRescanning(false);
    }
  };

  // Pipeline Modal Handlers
  const handleOpenPipeline = (
    mode: 'extend_existing' | 'create_new' = 'extend_existing',
    targetLv?: LinuxLvmLv | null,
    targetDisk?: string | null,
    targetVg?: string | null
  ) => {
    setPipelineMode(mode);
    setPipelineTargetLv(targetLv || null);
    setPipelineTargetDisk(targetDisk || null);
    setPipelineTargetVg(targetVg || null);
    setPipelineModalOpen(true);
    undockModal(`linux_storage_pipeline_${server.id}`);
  };

  const handleMinimizePipeline = () => {
    setPipelineModalOpen(false);
    dockModal({
      id: `linux_storage_pipeline_${server.id}`,
      labelEn: `Storage Pipeline (${pipelineMode === 'extend_existing' ? 'Extend' : 'New Volume'})`,
      labelFa: `پایپ‌لاین ذخیره‌سازی (${pipelineMode === 'extend_existing' ? 'اکستند' : 'درایو جدید'})`,
      category: 'system',
      badge: 'pipeline',
      onRestore: () => {
        setPipelineModalOpen(true);
        undockModal(`linux_storage_pipeline_${server.id}`);
      },
      onClose: () => {
        setPipelineModalOpen(false);
        undockModal(`linux_storage_pipeline_${server.id}`);
      },
    });
  };

  const handleOpenInitPv = (diskPath?: string) => {
    setTargetDiskForInitPv(diskPath || null);
    setInitPvModalOpen(true);
    undockModal(`linux_init_pv_${server.id}`);
  };

  const handleMinimizeInitPv = () => {
    setInitPvModalOpen(false);
    dockModal({
      id: `linux_init_pv_${server.id}`,
      labelEn: `Init PV (${targetDiskForInitPv || 'Raw Disk'})`,
      labelFa: `مقداردهی PV (${targetDiskForInitPv || 'دیسک خام'})`,
      category: 'system',
      badge: 'pvcreate',
      onRestore: () => {
        setInitPvModalOpen(true);
        undockModal(`linux_init_pv_${server.id}`);
      },
      onClose: () => {
        setInitPvModalOpen(false);
        undockModal(`linux_init_pv_${server.id}`);
      },
    });
  };

  const handleOpenExtend = (lv?: LinuxLvmLv | null) => {
    setTargetLvForExtend(lv || (overview?.lvs[0] || null));
    setExtendModalOpen(true);
    undockModal(`linux_extend_lv_${server.id}`);
  };

  const handleMinimizeExtend = () => {
    setExtendModalOpen(false);
    dockModal({
      id: `linux_extend_lv_${server.id}`,
      labelEn: `Extend LV (${targetLvForExtend?.name || 'Volume'})`,
      labelFa: `افزایش حجم ولوم (${targetLvForExtend?.name || 'ولوم'})`,
      category: 'system',
      badge: 'lvextend',
      onRestore: () => {
        setExtendModalOpen(true);
        undockModal(`linux_extend_lv_${server.id}`);
      },
      onClose: () => {
        setExtendModalOpen(false);
        undockModal(`linux_extend_lv_${server.id}`);
      },
    });
  };

  const handleOpenShrink = (lv: LinuxLvmLv) => {
    setTargetLvForShrink(lv);
    setShrinkModalOpen(true);
    undockModal(`linux_shrink_lv_${server.id}`);
  };

  const handleMinimizeShrink = () => {
    setShrinkModalOpen(false);
    dockModal({
      id: `linux_shrink_lv_${server.id}`,
      labelEn: `Shrink LV (${targetLvForShrink?.name || 'Volume'})`,
      labelFa: `کاهش حجم ولوم (${targetLvForShrink?.name || 'ولوم'})`,
      category: 'system',
      badge: 'lvreduce',
      onRestore: () => {
        setShrinkModalOpen(true);
        undockModal(`linux_shrink_lv_${server.id}`);
      },
      onClose: () => {
        setShrinkModalOpen(false);
        undockModal(`linux_shrink_lv_${server.id}`);
      },
    });
  };

  const handleOpenCreate = (vgName?: string) => {
    setTargetVgForCreate(vgName || null);
    setCreateModalOpen(true);
    undockModal(`linux_create_lvm_${server.id}`);
  };

  const handleMinimizeCreate = () => {
    setCreateModalOpen(false);
    dockModal({
      id: `linux_create_lvm_${server.id}`,
      labelEn: `New LVM Volume (${server.name || server.ip})`,
      labelFa: `فضای جدید LVM (${server.name || server.ip})`,
      category: 'system',
      badge: 'lvcreate',
      onRestore: () => {
        setCreateModalOpen(true);
        undockModal(`linux_create_lvm_${server.id}`);
      },
      onClose: () => {
        setCreateModalOpen(false);
        undockModal(`linux_create_lvm_${server.id}`);
      },
    });
  };

  const handleOpenAddDiskToVg = (vgName?: string, diskPath?: string) => {
    setTargetVgForAddDisk(vgName || null);
    setTargetDiskForAddDisk(diskPath || null);
    setAddDiskModalOpen(true);
    undockModal(`linux_add_disk_${server.id}`);
  };

  const handleMinimizeAddDisk = () => {
    setAddDiskModalOpen(false);
    dockModal({
      id: `linux_add_disk_${server.id}`,
      labelEn: `Add Disk to VG (${targetVgForAddDisk || 'Storage Pool'})`,
      labelFa: `افزودن دیسک به گروه حجم (${targetVgForAddDisk || 'استخر ذخیره'})`,
      category: 'system',
      badge: 'vgextend',
      onRestore: () => {
        setAddDiskModalOpen(true);
        undockModal(`linux_add_disk_${server.id}`);
      },
      onClose: () => {
        setAddDiskModalOpen(false);
        undockModal(`linux_add_disk_${server.id}`);
      },
    });
  };

  const vgs = overview?.vgs || [];
  const lvs = overview?.lvs || [];
  const pvs = overview?.pvs || [];
  const rawDisks = (overview?.availableDisks || []).filter((d) => !d.isInLvm);

  return (
    <div className="space-y-6 pt-3">
      {/* Top Header Bar */}
      <div
        className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/70 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 to-teal-500 text-white shadow-md shadow-cyan-500/20">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold">
                {isEn ? 'Logical Volume Management (LVM)' : 'مدیریت پیشرفته فضاهای دیسک (LVM)'}
              </h3>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                {vgs.length} {isEn ? 'VGs' : 'گروه حجم'} / {lvs.length} {isEn ? 'LVs' : 'ولوم'} / {pvs.length} {isEn ? 'PVs' : 'دیسک عضو'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEn
                ? 'Cohesive Disk → PV → VG → LV → Filesystem → Mount Point lifecycle with online expansion.'
                : 'معماری جامع دیسک خام ← PV ← گروه حجم VG ← لاجیکال ولوم LV ← ساختار فایل ← مسیر مانت سیستم‌عامل.'}
            </p>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* PRIMARY WORKFLOW 1: GUIDED STORAGE PIPELINE WIZARD */}
          <button
            type="button"
            onClick={() => handleOpenPipeline('extend_existing')}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 shadow-md shadow-cyan-500/20 cursor-pointer flex items-center gap-1.5 transition-all"
            title={
              isEn
                ? 'Execute end-to-end storage extension: Disk -> PV -> VG -> LV -> Filesystem -> Mount Point'
                : 'اجرای پایپ‌لاین جامع افزایش حجم: دیسک خام ← فیزیکال ولوم ← گروه حجم ← ولوم و فایل‌سیستم آنلاین'
            }
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isEn ? 'Storage Pipeline Wizard' : 'پایپ‌لاین جامع افزایش حجم (Disk → LV)'}</span>
          </button>

          {/* PRIMARY WORKFLOW 2: CREATE NEW VOLUME & MOUNT POINT */}
          <button
            type="button"
            onClick={() => handleOpenPipeline('create_new')}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 transition-all shadow-sm shadow-teal-600/20 cursor-pointer flex items-center gap-1.5"
            title={
              isEn
                ? 'Create a brand new formatted volume and mount point with fstab persistence'
                : 'ایجاد درایو و مسیر مانت جدید با دیسک خام و ذخیره در /etc/fstab'
            }
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isEn ? 'New Volume & Mount' : 'ساخت درایو و مانت جدید'}</span>
          </button>

          {/* ONLINE SCSI & BLOCK DEVICE RESCAN */}
          <button
            type="button"
            onClick={handleOnlineRescan}
            disabled={rescanning}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-2 shadow-sm ${
              isLightMode
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                : 'bg-amber-950/20 hover:bg-amber-950/40 text-amber-300 border-amber-900/50'
            }`}
            title={
              isEn
                ? 'Scans SCSI buses for newly added virtual disks or size increases without rebooting'
                : 'اسکن آنلاین باس‌های SCSI برای شناسایی دیسک‌های جدید متصل‌شده بدون نیاز به ریبوت'
            }
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rescanning ? 'animate-spin text-amber-400' : 'text-amber-500'}`} />
            <span>
              {rescanning
                ? isEn
                  ? 'Scanning SCSI Buses...'
                  : 'در حال اسکن آنلاین...'
                : isEn
                ? 'Online Rescan Disks'
                : 'اسکن سریع دیسک‌ها'}
            </span>
          </button>

          {/* INITIALIZE PHYSICAL VOLUME (pvcreate) */}
          <button
            type="button"
            onClick={() => handleOpenInitPv()}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 shadow-sm ${
              isLightMode
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
            }`}
            title={
              isEn
                ? 'Initialize a raw block device into an LVM Physical Volume (pvcreate)'
                : 'مقداردهی اولیه دیسک خام به عنوان فیزیکال ولوم LVM با دستور pvcreate'
            }
          >
            <HardDrive className="w-3.5 h-3.5 text-amber-400" />
            <span>{isEn ? 'Init PV' : 'مقداردهی PV'}</span>
          </button>

          {/* REFRESH INVENTORY */}
          <button
            type="button"
            onClick={loadLvmOverview}
            disabled={loading}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              isLightMode
                ? 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-300'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
            }`}
            title={isEn ? 'Refresh LVM Inventory' : 'بروزرسانی اطلاعات LVM'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* THE 6-LAYER ARCHITECTURE INTERACTIVE RIBBON */}
      <div
        className={`p-4 rounded-2xl border transition-all ${
          isLightMode ? 'bg-gradient-to-r from-slate-50 via-cyan-50/30 to-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              {isEn ? 'Cohesive Storage Architecture Hierarchy' : 'سلسله‌مراتب و نقش لایه‌های ذخیره‌سازی لینوکس'}
            </h4>
          </div>
          <button
            type="button"
            onClick={() => handleOpenPipeline('extend_existing')}
            className="text-[11px] font-bold text-cyan-400 hover:underline cursor-pointer flex items-center gap-1"
          >
            <span>{isEn ? 'Launch Pipeline Wizard →' : 'اجرای پایپ‌لاین گام‌به‌گام ←'}</span>
          </button>
        </div>

        {/* 6 Step Interactive Architecture Progression Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs">
          {/* Stage 1: Disk */}
          <div
            onClick={() => handleOpenPipeline('extend_existing')}
            className={`p-2.5 rounded-xl border flex flex-col items-center justify-between gap-1 transition-all cursor-pointer ${
              rawDisks.length > 0
                ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 ring-1 ring-amber-500/30'
                : isLightMode
                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <HardDrive className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-[11px]">1. Disk</span>
            <span className="text-[9px] text-slate-400 leading-tight">
              {isEn ? 'Physical raw space' : 'فضای فیزیکی جدید'}
            </span>
            <span className="text-[8px] font-mono text-amber-400/80">/dev/sdb</span>
          </div>

          {/* Stage 2: PV */}
          <div
            onClick={() => handleOpenInitPv()}
            className={`p-2.5 rounded-xl border flex flex-col items-center justify-between gap-1 transition-all cursor-pointer ${
              isLightMode
                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-[11px]">2. PV</span>
            <span className="text-[9px] text-slate-400 leading-tight">
              {isEn ? 'LVM usable format' : 'تبدیل به فرمت LVM'}
            </span>
            <span className="text-[8px] font-mono text-emerald-400/80">pvcreate</span>
          </div>

          {/* Stage 3: VG */}
          <div
            onClick={() => handleOpenAddDiskToVg()}
            className={`p-2.5 rounded-xl border flex flex-col items-center justify-between gap-1 transition-all cursor-pointer ${
              isLightMode
                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="font-bold text-[11px]">3. VG</span>
            <span className="text-[9px] text-slate-400 leading-tight">
              {isEn ? 'Aggregated pool' : 'مخزن/Pool کردن PVها'}
            </span>
            <span className="text-[8px] font-mono text-cyan-400/80">vgextend</span>
          </div>

          {/* Stage 4: LV */}
          <div
            onClick={() => handleOpenExtend()}
            className={`p-2.5 rounded-xl border flex flex-col items-center justify-between gap-1 transition-all cursor-pointer ${
              isLightMode
                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Database className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-[11px]">4. LV</span>
            <span className="text-[9px] text-slate-400 leading-tight">
              {isEn ? 'Volume slice' : 'برداشت ظرفیت برای ولوم'}
            </span>
            <span className="text-[8px] font-mono text-indigo-400/80">lvextend</span>
          </div>

          {/* Stage 5: Filesystem */}
          <div
            onClick={() => handleOpenPipeline('extend_existing')}
            className={`p-2.5 rounded-xl border flex flex-col items-center justify-between gap-1 transition-all cursor-pointer ${
              isLightMode
                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Sliders className="w-4 h-4 text-teal-400" />
            <span className="font-bold text-[11px]">5. Filesystem</span>
            <span className="text-[9px] text-slate-400 leading-tight">
              {isEn ? 'Live online growth' : 'رشد آنلاین ext4/XFS'}
            </span>
            <span className="text-[8px] font-mono text-teal-400/80">resize2fs / xfs</span>
          </div>

          {/* Stage 6: Mount Point */}
          <div
            onClick={() => handleOpenPipeline('create_new')}
            className={`p-2.5 rounded-xl border flex flex-col items-center justify-between gap-1 transition-all cursor-pointer ${
              isLightMode
                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Folder className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-[11px]">6. Mount</span>
            <span className="text-[9px] text-slate-400 leading-tight">
              {isEn ? 'Directory attachment' : 'نقطه اتصال /var یا /'}
            </span>
            <span className="text-[8px] font-mono text-blue-400/80">/etc/fstab</span>
          </div>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : notification.type === 'info'
              ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-xs hover:opacity-80 cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !overview && (
        <div className="p-8 rounded-2xl border flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
          <p className="text-xs text-slate-400">
            {isEn ? 'Querying LVM state from server...' : 'در حال خواندن وضعیت LVM از سرور...'}
          </p>
        </div>
      )}

      {/* LVM Not Installed Banner */}
      {!loading && overview && !overview.lvmInstalled && (
        <div
          className={`p-5 rounded-2xl border space-y-3 ${
            isLightMode ? 'bg-amber-50/70 border-amber-200' : 'bg-amber-950/20 border-amber-900/50'
          }`}
        >
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <Info className="w-5 h-5 shrink-0" />
            <span>{isEn ? 'LVM2 Utilities Not Installed' : 'ابزارهای LVM2 روی این سرور نصب نیست'}</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {isEn
              ? 'The server does not currently have the lvm2 package installed. To enable volume management, install it with:'
              : 'پکیج lvm2 روی این سرور لینوکس نصب نیست. برای فعال‌سازی قابلیت‌های LVM، دستور زیر را در سرور اجرا کنید:'}
          </p>
          <div className="p-2.5 rounded-lg bg-black/40 font-mono text-xs text-cyan-300 flex items-center justify-between">
            <code>sudo apt-get install -y lvm2   # (or sudo dnf install -y lvm2)</code>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* LAYER 1 & 2: PHYSICAL DISKS & PHYSICAL VOLUMES (PVs)                      */}
      {/* ========================================================================= */}
      {!loading && overview && overview.lvmInstalled && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                {isEn
                  ? 'Layer 1 & 2: Physical Disks & LVM Physical Volumes (PVs)'
                  : 'لایه ۱ و ۲: دیسک‌های خام فیزیکی و Physical Volumes (PV)'}
              </h4>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {rawDisks.length} {isEn ? 'Unassigned Raw Disks' : 'دیسک خام جدید'}
              </span>
              <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {pvs.length} {isEn ? 'PVs Initialized' : 'فیزیکال ولوم فعال'}
              </span>
            </div>
          </div>

          {/* Layer 1 & 2 Operational Guide */}
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              isLightMode ? 'bg-slate-100/80 border-slate-200 text-slate-700' : 'bg-slate-900/40 border-slate-800 text-slate-400'
            }`}
          >
            <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <span className="font-semibold text-slate-200 block">
                {isEn ? 'Physical Disks & PVs Role & Actions:' : 'نقش دیسک خام و فیزیکال ولوم‌ها:'}
              </span>
              <p>
                {isEn
                  ? '• Newly added disk (e.g. 100GB): Click "+ Extend Volume with this Disk" to atomically initialize PV, join target VG, and expand your mounted partition (e.g. /var or /) without reboot.'
                  : '• دیسک خام جدید (مثلاً ۱۰۰ گیگابایت): با زدن دکمه «+ اکستند درایو با این دیسک»، این دیسک به صورت آنی به PV تبدیل شده، به گروه حجم ملحق گشته و درایو مانت‌شده (مانند / یا /var) را بدون قطعی بزرگ می‌کند.'}
              </p>
              <p>
                {isEn
                  ? '• If you resized the virtual disk in VMware/Proxmox: Click "Online Rescan Disks" above; pvresize will automatically expand the PV.'
                  : '• اگر اندازه دیسک مجازی را در VMware/Proxmox افزایش داده‌اید: دکمه «اسکن سریع دیسک‌ها» را بزنید؛ سیستم آنلاین pvresize را اجرا می‌کند.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Unassigned Raw Disks */}
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isEn ? 'Detected Physical Raw Disks' : 'دیسک‌های خام فیزیکی کشف‌شده'}</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold">
                  {rawDisks.length}
                </span>
              </div>

              {rawDisks.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center space-y-2">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {isEn
                      ? 'All attached block devices are already enrolled in LVM. If you just attached a new virtual disk in VMware/Proxmox, click "Online Rescan Disks" above.'
                      : 'تمامی دیسک‌ها به سیستم اختصاص یافته‌اند. اگر دیسک جدیدی در مجازی‌ساز متصل کرده‌اید، دکمه «اسکن سریع دیسک‌ها» در بالا را بزنید.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleOnlineRescan}
                    disabled={rescanning}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer"
                  >
                    {rescanning ? (isEn ? 'Scanning...' : 'در حال اسکن...') : (isEn ? 'Rescan SCSI Buses' : 'اسکن آنلاین')}
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {rawDisks.map((disk) => (
                    <div
                      key={disk.name}
                      className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-amber-300">{disk.name}</span>
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            {disk.size}
                          </span>
                        </div>
                        <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{isEn ? 'Ready for Enrollment' : 'آماده تخصیص'}</span>
                        </span>
                      </div>

                      {/* Direct Workflow Buttons on each Raw Disk */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-amber-500/20">
                        {/* Option 1: Extend Existing Volume with Pipeline */}
                        <button
                          type="button"
                          onClick={() => handleOpenPipeline('extend_existing', null, disk.name)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 shadow-xs cursor-pointer flex items-center gap-1 transition-all"
                          title={isEn ? 'Extend existing volume using this disk via pipeline' : 'افزایش حجم درایو موجود با این دیسک از طریق پایپ‌لاین'}
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>{isEn ? '+ Extend Volume' : '+ اکستند درایو'}</span>
                        </button>

                        {/* Option 2: Create New Volume & Mount Point */}
                        <button
                          type="button"
                          onClick={() => handleOpenPipeline('create_new', null, disk.name)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-teal-300 bg-teal-950/40 hover:bg-teal-950/70 border border-teal-800/60 cursor-pointer flex items-center gap-1 transition-colors"
                          title={isEn ? 'Create new standalone partition and mount point' : 'ساخت درایو جدید و مانت دائمی با این دیسک'}
                        >
                          <Plus className="w-3 h-3" />
                          <span>{isEn ? '+ New Mount' : '+ مانت جدید'}</span>
                        </button>

                        {/* Option 3: Manual Init PV */}
                        <button
                          type="button"
                          onClick={() => handleOpenInitPv(disk.name)}
                          className="px-2 py-1.5 rounded-lg text-[11px] font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 cursor-pointer flex items-center gap-1 transition-colors"
                          title={isEn ? 'Initialize disk as Physical Volume (pvcreate)' : 'مقداردهی اولیه دیسک خام با دستور pvcreate'}
                        >
                          <span>{isEn ? 'Init PV' : 'دستور pvcreate'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Enrolled PVs */}
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isEn ? 'Active Physical Volumes (PVs)' : 'فیزیکال ولوم‌های عضو LVM'}</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {pvs.length}
                </span>
              </div>

              {pvs.length === 0 ? (
                <p className="text-xs text-slate-500 italic">
                  {isEn ? 'No physical volumes initialized yet.' : 'هنوز هیچ فیزیکال ولومی مقداردهی نشده است.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {pvs.map((pv) => {
                    const isUnassigned = !pv.vgName || pv.vgName === 'none' || pv.vgName === '-';
                    return (
                      <div
                        key={pv.name}
                        className={`p-2.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs transition-colors ${
                          isUnassigned
                            ? isLightMode
                              ? 'border-amber-300 bg-amber-50/60'
                              : 'border-amber-500/40 bg-amber-950/20'
                            : isLightMode
                            ? 'border-slate-200 bg-slate-50'
                            : 'border-slate-800/80 bg-slate-950/30'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-bold text-slate-200">{pv.name}</span>
                            {isUnassigned ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold">
                                {isEn ? 'Unassigned PV' : 'فیزیکال ولوم آزاد'}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-mono">
                                VG: {pv.vgName}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                            {isUnassigned
                              ? isEn
                                ? 'Initialized with pvcreate • Ready to join VG'
                                : 'با pvcreate مقداردهی شده • آماده پیوست به گروه'
                              : `Pool member of ${pv.vgName}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <div className="text-right font-mono">
                            <span className="text-cyan-400 font-semibold block">{pv.size}</span>
                            <span className="text-[10px] text-slate-400 block">Free: {pv.free}</span>
                          </div>
                          {isUnassigned && (
                            <button
                              type="button"
                              onClick={() => handleOpenAddDiskToVg(undefined, pv.name)}
                              className="px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-semibold cursor-pointer shadow-xs transition-colors flex items-center gap-1"
                              title={isEn ? 'Add this unassigned PV to a Volume Group' : 'پیوست این فیزیکال ولوم به گروه حجم'}
                            >
                              <PlusCircle className="w-3 h-3" />
                              <span>{isEn ? '+ Add to VG' : '+ پیوست به گروه'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* LAYER 3: STORAGE VOLUME GROUPS (VGs) - AGGREGATED STORAGE POOLS          */}
      {/* ========================================================================= */}
      {!loading && overview && overview.lvmInstalled && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                {isEn ? 'Layer 3: Volume Groups (VGs) - Storage Pools' : 'لایه ۳: گروه‌های حجم (VGs) - استخرهای ذخیره‌سازی'}
              </h4>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              {vgs.length} {isEn ? 'Groups Defined' : 'گروه تعریف‌شده'}
            </span>
          </div>

          {/* Layer 3 Operational Guide */}
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              isLightMode ? 'bg-slate-100/80 border-slate-200 text-slate-700' : 'bg-slate-900/40 border-slate-800 text-slate-400'
            }`}
          >
            <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <span className="font-semibold text-slate-200 block">
                {isEn ? 'Volume Group (VG) Storage Pool Role & Actions:' : 'نقش استخر گروه حجم (VG):'}
              </span>
              <p>
                {isEn
                  ? '• The VG pools together multiple PVs into one massive shared capacity reservoir. All Logical Volumes carve their space from here.'
                  : '• گروه حجم تمامی PVها را درون یک استخر ظرفیت مشترک تجمیع می‌کند. تمامی ولوم‌های لاجیکال از این فضا سهم می‌برند.'}
              </p>
              <p>
                {isEn
                  ? '• If Free is 0: Click "+ Add Disk" to extend the pool with a new physical drive before growing volumes.'
                  : '• اگر مقدار Free صفر است: دکمه «+ دیسک» را بزنید تا با اضافه کردن دیسک جدید، ظرفیت استخر باز شود.'}
              </p>
            </div>
          </div>

          {vgs.length === 0 ? (
            <div
              className={`p-6 rounded-2xl border text-center text-xs space-y-2 ${
                isLightMode ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-900/40 border-slate-800 text-slate-400'
              }`}
            >
              <Database className="w-6 h-6 mx-auto text-slate-500" />
              <p>{isEn ? 'No Volume Groups found on this server.' : 'هیچ گروه حجمی روی این سرور یافت نشد.'}</p>
              <button
                type="button"
                onClick={() => handleOpenPipeline('create_new')}
                className="mt-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-500 cursor-pointer"
              >
                {isEn ? 'Create First Volume Group' : 'ایجاد اولین گروه حجم'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {vgs.map((vg) => {
                const totalFloat = parseFloat(vg.size) || 1;
                const freeFloat = parseFloat(vg.free) || 0;
                const usedFloat = Math.max(0, totalFloat - freeFloat);
                const usedPercent = Math.min(100, Math.round((usedFloat / totalFloat) * 100));

                return (
                  <div
                    key={vg.name}
                    className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all ${
                      isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-cyan-400 font-mono flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5" />
                          <span>{vg.name}</span>
                        </span>
                        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                          {vg.size}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1 font-mono">
                        <span>{vg.pvCount} PVs (Disks)</span>
                        <span>&bull;</span>
                        <span>{vg.lvCount} LVs (Volumes)</span>
                      </div>
                    </div>

                    <div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-white/5">
                        <div
                          className={`h-full transition-all duration-300 ${
                            usedPercent > 90 ? 'bg-rose-500' : usedPercent > 75 ? 'bg-amber-400' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${usedPercent}%` }}
                        />
                      </div>

                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono mt-2">
                        <span>Used: {usedFloat.toFixed(2)} GB ({usedPercent}%)</span>
                        <span className="text-emerald-400 font-semibold">Free: {vg.free}</span>
                      </div>

                      {/* VG Action Buttons */}
                      <div className="grid grid-cols-3 gap-1.5 mt-3 pt-2 border-t border-slate-800/60">
                        <button
                          type="button"
                          onClick={() => handleOpenAddDiskToVg(vg.name)}
                          className={`py-1.5 px-1.5 rounded-lg text-[11px] font-medium border flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                            isLightMode
                              ? 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
                              : 'bg-teal-950/20 text-teal-300 border-teal-900/50 hover:bg-teal-950/40'
                          }`}
                          title={isEn ? 'Attach a raw disk to this VG' : 'پیوست یک دیسک فیزیکی به این گروه حجم'}
                        >
                          <PlusCircle className="w-3 h-3" />
                          <span>{isEn ? '+ Disk' : '+ دیسک'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const matchedLv = lvs.find((l) => l.vgName === vg.name) || lvs[0] || null;
                            handleOpenPipeline('extend_existing', matchedLv, null, vg.name);
                          }}
                          className={`py-1.5 px-1.5 rounded-lg text-[11px] font-medium border flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                            isLightMode
                              ? 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100'
                              : 'bg-cyan-950/20 text-cyan-300 border-cyan-900/50 hover:bg-cyan-950/40'
                          }`}
                          title={isEn ? 'Extend a volume in this VG via pipeline' : 'افزایش حجم ولوم در این گروه با پایپ‌لاین'}
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>{isEn ? 'Extend LV' : 'اکستند'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenPipeline('create_new', null, null, vg.name)}
                          className={`py-1.5 px-1.5 rounded-lg text-[11px] font-medium border flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                            isLightMode
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-emerald-950/20 text-emerald-300 border-emerald-900/50 hover:bg-emerald-950/40'
                          }`}
                          title={isEn ? 'Create a new volume in this VG' : 'ساخت ولوم جدید در این گروه'}
                        >
                          <Plus className="w-3 h-3" />
                          <span>{isEn ? 'New LV' : 'ولوم نو'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* LAYER 4, 5 & 6: LOGICAL VOLUMES (LVs), FILESYSTEMS & MOUNT POINTS        */}
      {/* ========================================================================= */}
      {!loading && overview && overview.lvmInstalled && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                {isEn
                  ? 'Layer 4, 5 & 6: Logical Volumes, Filesystems & Mount Points'
                  : 'لایه ۴، ۵ و ۶: لاجیکال ولوم‌ها (LV)، ساختار فایل‌سیستم و مسیرهای مانت'}
              </h4>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              {lvs.length} {isEn ? 'Volumes Active' : 'ولوم فعال'}
            </span>
          </div>

          {/* Layer 4, 5, 6 Operational Guide */}
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              isLightMode ? 'bg-slate-100/80 border-slate-200 text-slate-700' : 'bg-slate-900/40 border-slate-800 text-slate-400'
            }`}
          >
            <HelpCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <span className="font-semibold text-slate-200 block">
                {isEn ? 'Volume & Filesystem Growth Workflow:' : 'گسترش آنلاین ولوم و فایل‌سیستم:'}
              </span>
              <p>
                {isEn
                  ? '• Click "Extend" on any mounted volume (e.g. / or /var) below. The pipeline automatically orchestrates disk enrollment, VG pool extension, and online resize2fs/xfs_growfs with zero downtime.'
                  : '• روی هر درایو مانت‌شده (مانند / یا /var) دکمه «Extend» را بزنید. پایپ‌لاین به طور خودکار پیوست دیسک، افزایش استخر گروه و رشد آنلاین فایل‌سیستم (resize2fs یا xfs_growfs) را بدون قطعی انجام می‌دهد.'}
              </p>
            </div>
          </div>

          {lvs.length === 0 ? (
            <div
              className={`p-6 rounded-2xl border text-center text-xs space-y-2 ${
                isLightMode ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-900/40 border-slate-800 text-slate-400'
              }`}
            >
              <HardDrive className="w-6 h-6 mx-auto text-slate-500" />
              <p>{isEn ? 'No Logical Volumes created yet.' : 'هنوز هیچ لاجیکال ولومی ساخته نشده است.'}</p>
              <button
                type="button"
                onClick={() => handleOpenPipeline('create_new')}
                className="mt-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 cursor-pointer"
              >
                {isEn ? 'Create New Volume & Mount' : 'ایجاد اولین فضای LVM'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lvs.map((lv) => (
                <div
                  key={lv.path}
                  className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all ${
                    isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-cyan-400 font-mono truncate max-w-[170px]" title={lv.name}>
                        {lv.name}
                      </span>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                        {lv.size}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-1">
                      <span className="truncate max-w-[140px]">VG: {lv.vgName}</span>
                      <span className="uppercase text-[10px] px-1.5 py-0.2 rounded bg-slate-800/80 font-bold text-teal-400">
                        {lv.fsType || 'ext4'}
                      </span>
                    </div>

                    {/* Mount Status Badge */}
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Folder className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs font-mono text-slate-200 truncate max-w-[160px]" title={lv.mountPoint || 'Unmounted'}>
                          {lv.mountPoint || (isEn ? 'Unmounted' : 'مانت‌نشده')}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          lv.isMounted
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {lv.isMounted ? (isEn ? 'Mounted' : 'مانت‌شده') : (isEn ? 'Raw' : 'خام')}
                      </span>
                    </div>

                    {/* Disk Usage Progress (if mounted) */}
                    {lv.isMounted && lv.usagePercent !== undefined && (
                      <div className="mt-2.5">
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full ${
                              lv.usagePercent > 90 ? 'bg-rose-500' : lv.usagePercent > 75 ? 'bg-amber-400' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${lv.usagePercent}%` }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono mt-1">
                          <span>{lv.usagePercent}% used</span>
                          <span className="text-emerald-400">{lv.size} total</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    {/* Action Buttons: Pipeline Extend & Shrink */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/60">
                      <button
                        type="button"
                        onClick={() => handleOpenPipeline('extend_existing', lv, null, lv.vgName)}
                        className="py-1.5 px-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 flex items-center justify-center gap-1 transition-all shadow-xs cursor-pointer"
                        title={isEn ? 'Extend volume capacity via pipeline' : 'افزایش فضای این ولوم از طریق پایپ‌لاین'}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Extend' : 'اکستند حجم'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenShrink(lv)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                          isLightMode
                            ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                            : 'bg-amber-950/20 text-amber-300 border-amber-900/50 hover:bg-amber-950/40'
                        }`}
                        title={isEn ? 'Shrink volume and reclaim space' : 'کاهش حجم و آزادسازی فضا'}
                      >
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Shrink' : 'شرینک'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS                                                                    */}
      {/* ========================================================================= */}

      {/* Comprehensive Guided Storage Pipeline Modal */}
      <LinuxStoragePipelineModal
        isOpen={pipelineModalOpen}
        server={server}
        overview={overview}
        initialMode={pipelineMode}
        initialTargetLv={pipelineTargetLv}
        initialTargetDisk={pipelineTargetDisk}
        initialTargetVg={pipelineTargetVg}
        ephemeralPassword={ephemeralPassword}
        onClose={() => {
          setPipelineModalOpen(false);
          undockModal(`linux_storage_pipeline_${server.id}`);
        }}
        onMinimize={handleMinimizePipeline}
        onSuccess={() => {
          loadLvmOverview();
          if (onRefreshParent) onRefreshParent();
        }}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      <LinuxInitPvModal
        isOpen={initPvModalOpen}
        server={server}
        targetDiskPath={targetDiskForInitPv}
        availableDisks={overview?.availableDisks || []}
        allPvs={pvs}
        ephemeralPassword={ephemeralPassword}
        onClose={() => {
          setInitPvModalOpen(false);
          undockModal(`linux_init_pv_${server.id}`);
        }}
        onMinimize={handleMinimizeInitPv}
        onSuccess={() => {
          loadLvmOverview();
          if (onRefreshParent) onRefreshParent();
        }}
        onOpenAddDiskToVg={(diskPath) => {
          handleOpenAddDiskToVg(undefined, diskPath);
        }}
        onOpenCreateLvm={(diskPath) => {
          handleOpenCreate(undefined);
        }}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      <LinuxAddDiskToVgModal
        isOpen={addDiskModalOpen}
        server={server}
        targetVgName={targetVgForAddDisk}
        targetDiskPath={targetDiskForAddDisk}
        allVgs={vgs}
        availableDisks={overview?.availableDisks || []}
        allPvs={pvs}
        ephemeralPassword={ephemeralPassword}
        onClose={() => {
          setAddDiskModalOpen(false);
          undockModal(`linux_add_disk_${server.id}`);
        }}
        onMinimize={handleMinimizeAddDisk}
        onSuccess={() => {
          loadLvmOverview();
          if (onRefreshParent) onRefreshParent();
        }}
        onOpenExtendLv={(vgName) => {
          const matchedLv = lvs.find((l) => l.vgName === vgName) || lvs[0] || null;
          handleOpenExtend(matchedLv);
        }}
        onOpenCreateLvm={(vgName) => {
          handleOpenCreate(vgName);
        }}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      <LinuxExtendLvModal
        isOpen={extendModalOpen}
        server={server}
        targetLv={targetLvForExtend}
        allLvs={lvs}
        allVgs={vgs}
        availableDisks={overview?.availableDisks || []}
        ephemeralPassword={ephemeralPassword}
        onClose={() => {
          setExtendModalOpen(false);
          undockModal(`linux_extend_lv_${server.id}`);
        }}
        onMinimize={handleMinimizeExtend}
        onSuccess={() => {
          loadLvmOverview();
          if (onRefreshParent) onRefreshParent();
        }}
        onOpenAddDiskToVg={(vgName) => {
          handleOpenAddDiskToVg(vgName);
        }}
        onOpenCreateLvm={(vgName) => {
          handleOpenCreate(vgName);
        }}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      <LinuxCreateLvmModal
        isOpen={createModalOpen}
        server={server}
        targetVgName={targetVgForCreate}
        allVgs={vgs}
        availableDisks={overview?.availableDisks || []}
        ephemeralPassword={ephemeralPassword}
        onClose={() => {
          setCreateModalOpen(false);
          undockModal(`linux_create_lvm_${server.id}`);
        }}
        onMinimize={handleMinimizeCreate}
        onSuccess={() => {
          loadLvmOverview();
          if (onRefreshParent) onRefreshParent();
        }}
        onOpenExtendLv={(vgName, lvName) => {
          const matched =
            lvs.find((l) => (vgName ? l.vgName === vgName : true) && (lvName ? l.name === lvName : true)) ||
            lvs.find((l) => (vgName ? l.vgName === vgName : true)) ||
            lvs[0] ||
            null;
          handleOpenExtend(matched);
        }}
        onOpenAddDiskToVg={(vgName) => {
          handleOpenAddDiskToVg(vgName);
        }}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      <LinuxShrinkLvModal
        isOpen={shrinkModalOpen}
        server={server}
        targetLv={targetLvForShrink}
        allLvs={lvs}
        allVgs={vgs}
        ephemeralPassword={ephemeralPassword}
        onClose={() => {
          setShrinkModalOpen(false);
          undockModal(`linux_shrink_lv_${server.id}`);
        }}
        onMinimize={handleMinimizeShrink}
        onSuccess={() => {
          loadLvmOverview();
          if (onRefreshParent) onRefreshParent();
        }}
        isLightMode={isLightMode}
        isEn={isEn}
      />
    </div>
  );
};
