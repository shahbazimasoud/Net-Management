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

  const handleOpenExtend = (lv?: LinuxLvmLv) => {
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
      labelEn: `Add Disk to VG (${targetVgForAddDisk || 'VG'})`,
      labelFa: `پیوست دیسک به گروه (${targetVgForAddDisk || 'گروه حجم'})`,
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
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold">
                {isEn ? 'Logical Volume Management (LVM)' : 'مدیریت پیشرفته فضاهای دیسک (LVM)'}
              </h3>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                {vgs.length} {isEn ? 'VGs' : 'گروه حجم'} / {lvs.length} {isEn ? 'LVs' : 'ولوم'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEn
                ? 'Zero-downtime disk allocation, online scanning, volume extension, and safe shrinking.'
                : 'تخصیص پویای فضای دیسک، اسکن زنده بدون ریبوت، افزایش حجم (Extend) و کاهش ایمن (Shrink).'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Online Rescan Button */}
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
                : 'اسکن سریع دیسک‌ها (بدون ریستارت)'}
            </span>
          </button>

          {/* Initialize Physical Volume (pvcreate) */}
          <button
            type="button"
            onClick={() => handleOpenInitPv()}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 shadow-sm ${
              isLightMode
                ? 'bg-amber-50/80 hover:bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-amber-950/20 hover:bg-amber-950/40 text-amber-300 border-amber-700/50'
            }`}
            title={
              isEn
                ? 'Initialize a raw block device into an LVM Physical Volume (pvcreate)'
                : 'مقداردهی اولیه دیسک خام به عنوان فیزیکال ولوم LVM با دستور pvcreate'
            }
          >
            <HardDrive className="w-3.5 h-3.5 text-amber-400" />
            <span>{isEn ? 'Initialize PV (pvcreate)' : 'مقداردهی فیزیکال ولوم (PV)'}</span>
          </button>

          {/* Add Disk to Existing VG */}
          <button
            type="button"
            onClick={() => handleOpenAddDiskToVg()}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 transition-all shadow-sm shadow-teal-600/20 cursor-pointer flex items-center gap-1.5"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>{isEn ? 'Add Disk to VG' : 'پیوست دیسک به گروه حجم'}</span>
          </button>

          {/* New LVM Volume Button */}
          <button
            type="button"
            onClick={() => handleOpenCreate()}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-all shadow-sm shadow-emerald-600/20 cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isEn ? 'New LVM Volume' : 'ایجاد فضای جدید (LVM)'}</span>
          </button>

          {/* Refresh LVM */}
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

      {/* Global Interactive Lifecycle & Scenario Navigator */}
      <div
        className={`p-4 rounded-2xl border transition-all ${
          isLightMode ? 'bg-gradient-to-r from-slate-50 to-cyan-50/40 border-slate-200' : 'bg-slate-900/40 border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              {isEn ? 'Interactive Storage Workflow Guide' : 'راهنمای گام‌به‌گام سناریوهای ذخیره‌سازی'}
            </h4>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveScenario(activeScenario === 'new_disk' ? null : 'new_disk')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                activeScenario === 'new_disk'
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                  : isLightMode
                  ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {isEn ? '1. Added New Physical Disk?' : '۱. دیسک فیزیکی جدید اضافه کرده‌اید؟'}
            </button>
            <button
              type="button"
              onClick={() => setActiveScenario(activeScenario === 'extend_lv' ? null : 'extend_lv')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                activeScenario === 'extend_lv'
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold'
                  : isLightMode
                  ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {isEn ? '2. Want to Extend an Existing Volume?' : '۲. می‌خواهید درایو موجود را افزایش حجم دهید؟'}
            </button>
            <button
              type="button"
              onClick={() => setActiveScenario(activeScenario === 'new_mount' ? null : 'new_mount')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                activeScenario === 'new_mount'
                  ? 'bg-teal-500/20 border-teal-500/50 text-teal-300 font-bold'
                  : isLightMode
                  ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {isEn ? '3. Create New Mount Point?' : '۳. ایجاد درایو و مسیر مانت جدید؟'}
            </button>
          </div>
        </div>

        {/* Selected Scenario Roadmap */}
        {activeScenario === 'new_disk' && (
          <div
            className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
              isLightMode ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' : 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
            }`}
          >
            <div className="font-semibold flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">
                ✓
              </span>
              <span>
                {isEn
                  ? 'Scenario: You added a physical or virtual disk (VMware/Proxmox) and want to expand your current server space:'
                  : 'سناریو: یک دیسک فیزیکی یا مجازی (VMware / Proxmox) اضافه کرده‌اید و می‌خواهید فضای درایوهای موجود را افزایش دهید:'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div
                className={`p-2.5 rounded-lg border ${
                  isLightMode ? 'bg-white border-emerald-200' : 'bg-slate-950/60 border-emerald-900/50'
                }`}
              >
                <div className="font-bold text-amber-400 flex items-center gap-1 mb-1">
                  <span>{isEn ? 'Step 1:' : 'گام ۱:'}</span>
                  <span>{isEn ? 'Physical Disk & Init PV' : 'دیسک خام و مقداردهی PV'}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  {isEn
                    ? 'Check "Physical Disks & Raw Devices". If not listed, run "Online Rescan Disks". Click "Initialize PV" (pvcreate) or use "+ Add to VG" to write LVM headers.'
                    : 'در بخش پایین دیسک خام را بررسی کنید؛ در صورت نیاز «Online Rescan Disks» را بزنید. سپس دکمه «مقداردهی PV» (دستور pvcreate) یا «+ Add to VG» را برای نوشتن هدر LVM بزنید.'}
                </p>
              </div>

              <div
                className={`p-2.5 rounded-lg border ${
                  isLightMode ? 'bg-white border-emerald-200' : 'bg-slate-950/60 border-emerald-900/50'
                }`}
              >
                <div className="font-bold text-teal-400 flex items-center gap-1 mb-1">
                  <span>{isEn ? 'Step 2:' : 'گام ۲:'}</span>
                  <span>{isEn ? 'Pool into Volume Group (VG)' : 'پیوست به استخر گروه حجم (VG)'}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  {isEn
                    ? 'Click "+ Add to VG" on the disk or PV card to run vgextend. The free capacity of the Volume Group storage pool expands immediately.'
                    : 'روی کارت دیسک یا فیزیکال ولوم آزاد دکمه «+ Add to VG» را کلیک کنید تا با vgextend ظرفیت استخر گروه حجم بلافاصله گسترش یابد.'}
                </p>
              </div>

              <div
                className={`p-2.5 rounded-lg border ${
                  isLightMode ? 'bg-white border-emerald-200' : 'bg-slate-950/60 border-emerald-900/50'
                }`}
              >
                <div className="font-bold text-cyan-400 flex items-center gap-1 mb-1">
                  <span>{isEn ? 'Step 3:' : 'گام ۳:'}</span>
                  <span>{isEn ? 'Extend Mounted Volume (LV)' : 'افزایش حجم ولوم مانت‌شده'}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  {isEn
                    ? 'Go to "Logical Volumes & Mount Points" and click "Extend" on your mounted volume (e.g. /). The filesystem expands online instantly!'
                    : 'به بخش «Logical Volumes» رفته و روی ولوم مورد نظر (مانند ریشه / یا دیتا) دکمه «Extend» را بزنید تا حجم آن زنده اضافه شود!'}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeScenario === 'extend_lv' && (
          <div
            className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
              isLightMode ? 'bg-cyan-50/70 border-cyan-200 text-cyan-950' : 'bg-cyan-950/20 border-cyan-800/40 text-cyan-200'
            }`}
          >
            <div className="font-semibold flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-cyan-500 text-white flex items-center justify-center text-[10px] font-bold">
                ✓
              </span>
              <span>
                {isEn
                  ? 'Scenario: You want to expand an existing Logical Volume / mount point (e.g. / or /var):'
                  : 'سناریو: می‌خواهید حجم یکی از ولوم‌های لاجیکال یا پارتیشن‌های فعلی (مانند / یا /var) را افزایش دهید:'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div
                className={`p-2.5 rounded-lg border ${
                  isLightMode ? 'bg-white border-cyan-200' : 'bg-slate-950/60 border-cyan-900/50'
                }`}
              >
                <div className="font-bold text-emerald-400 mb-1">
                  {isEn ? 'Case A: VG has Free Space (Free > 0)' : 'حالت الف: گروه حجم دارای فضای آزاد است (Free > 0)'}
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  {isEn
                    ? 'Directly click "Extend" on the target Logical Volume below. Choose the size or +100%FREE, and submit. No disk addition needed.'
                    : 'مستقیماً در بخش «Logical Volumes» دکمه «Extend» را روی ولوم مورد نظر بزنید و حجم دلخواه را وارد کنید. بدون نیاز به دیسک جدید انجام می‌شود.'}
                </p>
              </div>

              <div
                className={`p-2.5 rounded-lg border ${
                  isLightMode ? 'bg-white border-cyan-200' : 'bg-slate-950/60 border-cyan-900/50'
                }`}
              >
                <div className="font-bold text-amber-400 mb-1">
                  {isEn ? 'Case B: VG has 0 Free Space' : 'حالت ب: گروه حجم فاقد فضای آزاد است (Free = 0)'}
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  {isEn
                    ? 'First, attach a new virtual disk. Then click "Online Rescan Disks" and use "+ Add to VG" to feed space into the Volume Group before extending.'
                    : 'ابتدا یک دیسک در هایپروایزر اضافه کنید، سپس با «Online Rescan Disks» و دکمه «+ Add to VG» آن را به گروه حجم متصل کنید تا فضا برای اکستند باز شود.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeScenario === 'new_mount' && (
          <div
            className={`p-3.5 rounded-xl border text-xs space-y-2 ${
              isLightMode ? 'bg-teal-50/70 border-teal-200 text-teal-950' : 'bg-teal-950/20 border-teal-800/40 text-teal-200'
            }`}
          >
            <div className="font-semibold flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center text-[10px] font-bold">
                ✓
              </span>
              <span>
                {isEn
                  ? 'Scenario: You want an entirely new volume mounted at /data or /backup with persistent reboot protection:'
                  : 'سناریو: می‌خواهید یک درایو کاملاً مستقل و جدید با مسیر مانت دلخواه (مثل /data یا /backup) ایجاد و در fstab پایدار کنید:'}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              {isEn
                ? 'Click "New LVM Volume" at the top. You can choose to create it within an existing Volume Group or form a new VG with unassigned raw disks. It formats with your chosen filesystem (ext4/xfs) and automounts permanently.'
                : 'دکمه «ایجاد فضای جدید (New LVM Volume)» را در بالا بزنید. می‌توانید آن را درون گروه حجم موجود بسازید یا با دیسک‌های خام گروه جدیدی بسازید. سیستم به طور خودکار آن را فرمت کرده و در /etc/fstab پایدار می‌سازد.'}
            </p>
          </div>
        )}
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
      {/* SECTION 1: VOLUME GROUPS OVERVIEW (VGs) */}
      {/* ========================================================================= */}
      {!loading && overview && overview.lvmInstalled && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                {isEn ? 'Storage Volume Groups (VGs)' : 'گروه‌های حجم ذخیره‌سازی (Storage Volume Groups)'}
              </h4>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              {vgs.length} {isEn ? 'Groups Defined' : 'گروه تعریف‌شده'}
            </span>
          </div>

          {/* Section 1 Operational Guide */}
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              isLightMode ? 'bg-slate-100/80 border-slate-200 text-slate-700' : 'bg-slate-900/40 border-slate-800 text-slate-400'
            }`}
          >
            <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <span className="font-semibold text-slate-200 block">
                {isEn ? 'Volume Group (VG) Workflow Instructions:' : 'راهنمای توالی گام‌ها برای گروه‌های حجم (VGs):'}
              </span>
              <p>
                {isEn
                  ? '• If you added a new physical disk: Go to Section 3 below, click "+ Add to VG" on the disk card to expand this storage pool.'
                  : '• اگر دیسک جدیدی اضافه کرده‌اید: ابتدا به بخش ۳ در پایین بروید و دکمه «+ Add to VG» را روی دیسک بزنید تا به این گروه اضافه شود.'}
              </p>
              <p>
                {isEn
                  ? '• If you want to extend an existing volume: Check the "Free" space here. If positive, go directly to Section 2 and click Extend. If 0, click "+ Add Disk" on the VG card first.'
                  : '• اگر می‌خواهید ولوم موجود را بزرگ‌تر کنید: فضای آزاد (Free) گروه را ببینید. اگر فضا داشت، مستقیماً به بخش ۲ رفته و Extend بزنید؛ اگر صفر بود، ابتدا دکمه «+ Add Disk» را روی کارت گروه بزنید.'}
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
                onClick={() => handleOpenCreate()}
                className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-500 cursor-pointer"
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

                      {/* VG Action Buttons: Add Disk, Extend LV, New LV */}
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
                          onClick={() => handleOpenExtend()}
                          className={`py-1.5 px-1.5 rounded-lg text-[11px] font-medium border flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                            isLightMode
                              ? 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100'
                              : 'bg-cyan-950/20 text-cyan-300 border-cyan-900/50 hover:bg-cyan-950/40'
                          }`}
                          title={isEn ? 'Extend a logical volume' : 'افزایش حجم یک لاجیکال ولوم'}
                        >
                          <ArrowUpRight className="w-3 h-3" />
                          <span>{isEn ? 'Extend' : 'اکستند'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenCreate(vg.name)}
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
      {/* SECTION 2: LOGICAL VOLUMES (LVs) & MOUNT POINTS */}
      {/* ========================================================================= */}
      {!loading && overview && overview.lvmInstalled && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                {isEn ? 'Logical Volumes & Mount Points' : 'لاجیکال ولوم‌ها و درایوهای مانت‌شده (Logical Volumes & Mount Points)'}
              </h4>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              {lvs.length} {isEn ? 'Volumes Active' : 'ولوم فعال'}
            </span>
          </div>

          {/* Section 2 Operational Guide */}
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              isLightMode ? 'bg-slate-100/80 border-slate-200 text-slate-700' : 'bg-slate-900/40 border-slate-800 text-slate-400'
            }`}
          >
            <HelpCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <span className="font-semibold text-slate-200 block">
                {isEn ? 'Logical Volume (LV) Workflow Instructions:' : 'راهنمای توالی گام‌ها برای لاجیکال ولوم‌ها (LVs):'}
              </span>
              <p>
                {isEn
                  ? '• If you added a new disk to increase partition size: Ensure you already ran "+ Add to VG" in Section 3/1, then click "Extend" on the mounted volume below. Filesystem expands online without reboot.'
                  : '• اگر دیسک جدیدی اضافه کرده‌اید: مطمئن شوید ابتدا آن را به گروه حجم (VG) ملحق کرده‌اید؛ سپس روی درایو مانت‌شده (مانند / یا مسیر دیتا) دکمه «Extend» را بزنید تا فایل‌سیستم آنلاین بزرگ شود.'}
              </p>
              <p>
                {isEn
                  ? '• If you want to extend an existing volume right now: Click "Extend" directly. If the group has insufficient space, you can either attach a new disk or shrink another volume.'
                  : '• اگر می‌خواهید همین حالا ولوم را اکستند کنید: مستقیماً دکمه «Extend» را بزنید؛ در صورت کمبود فضا، سیستم به شما پیشنهاد الصاق دیسک می‌دهد.'}
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
                onClick={() => handleOpenCreate()}
                className="mt-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 cursor-pointer"
              >
                {isEn ? 'Create New Volume' : 'ایجاد اولین فضای LVM'}
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
                      <span className="uppercase text-[10px] px-1.5 py-0.2 rounded bg-slate-800/80">
                        {lv.fsType || 'ext4'}
                      </span>
                    </div>

                    {/* Mount Status Badge */}
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Folder className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs font-mono font-semibold truncate max-w-[150px]">
                          {lv.mountPoint || (isEn ? 'Not Mounted' : 'مانت نشده')}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                          lv.isMounted
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {lv.isMounted ? (isEn ? 'Mounted' : 'مانت') : (isEn ? 'Raw LV' : 'خام')}
                      </span>
                    </div>
                  </div>

                  <div>
                    {/* Live Usage Bar (if available) */}
                    {lv.usagePercent !== undefined && (
                      <div className="mt-1">
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full ${
                              lv.usagePercent > 90
                                ? 'bg-rose-500'
                                : lv.usagePercent > 75
                                ? 'bg-amber-400'
                                : 'bg-cyan-500'
                            }`}
                            style={{ width: `${lv.usagePercent}%` }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono mt-1">
                          <span>{isEn ? 'Live Usage:' : 'مصرف:'} {lv.usagePercent}%</span>
                          <span className="text-cyan-400">{lv.size}</span>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons: Extend & Shrink */}
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-slate-800/60">
                      <button
                        type="button"
                        onClick={() => handleOpenExtend(lv)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                          isLightMode
                            ? 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100'
                            : 'bg-cyan-950/20 text-cyan-300 border-cyan-900/50 hover:bg-cyan-950/40'
                        }`}
                        title={isEn ? 'Extend volume capacity' : 'افزایش فضای این ولوم'}
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Extend' : 'اکستند'}</span>
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
      {/* SECTION 3: PHYSICAL VOLUMES (PVs) & DETECTED RAW DISKS */}
      {/* ========================================================================= */}
      {!loading && overview && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                {isEn ? 'Physical Disks & Raw Devices' : 'دیسک‌های فیزیکی و دستگاه‌های خام شناسایی‌شده (Physical Disks & Raw Devices)'}
              </h4>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              {pvs.length} {isEn ? 'in LVM' : 'عضو LVM'} / {rawDisks.length} {isEn ? 'Unassigned' : 'خام بدون تخصیص'}
            </span>
          </div>

          {/* Section 3 Operational Guide */}
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              isLightMode ? 'bg-slate-100/80 border-slate-200 text-slate-700' : 'bg-slate-900/40 border-slate-800 text-slate-400'
            }`}
          >
            <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <span className="font-semibold text-slate-200 block">
                {isEn ? 'Physical Disks & Raw Devices Workflow Instructions:' : 'راهنمای توالی گام‌ها برای دیسک‌های فیزیکی و دستگاه‌های خام:'}
              </span>
              <p>
                {isEn
                  ? '• If you added a new disk on VMware/Proxmox/Cloud: Click "Online Rescan Disks" above if it does not appear below. Then click "+ Add to VG" on the disk card to immediately join it to your existing storage pool!'
                  : '• اگر دیسک جدیدی در مجازی‌ساز وصل کرده‌اید: چنانچه در کارت‌های زیر دیده نمی‌شود، دکمه «Online Rescan Disks» در بالای صفحه را بزنید؛ سپس دکمه «+ Add to VG» را روی دیسک کلیک کنید تا بلافاصله به گروه حجم ملحق گردد.'}
              </p>
              <p>
                {isEn
                  ? '• Next Step after adding to VG: Go up to Section 2 and click "Extend" on your mounted partition to consume this new capacity.'
                  : '• گام بعدی پس از پیوست به VG: به بخش ۲ (Logical Volumes) در بالا بروید و دکمه «Extend» را روی پارتیشن مدنظرتان بزنید تا فضا به آن اختصاص یابد.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Enrolled PVs */}
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isEn ? 'Active Physical Volumes (PVs)' : 'دیسک‌های عضو LVM (Physical Volumes)'}</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {pvs.length}
                </span>
              </div>

              {pvs.length === 0 ? (
                <p className="text-xs text-slate-500 italic">
                  {isEn ? 'No physical volumes initialized.' : 'هیچ دیسکی در LVM مقداردهی نشده است.'}
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

            {/* Unassigned Raw Disks */}
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isEn ? 'Unassigned Raw Disks (Newly Detected)' : 'دیسک‌های خام شناسایی‌شده (جدید)'}</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold">
                  {rawDisks.length}
                </span>
              </div>

              {rawDisks.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {isEn
                      ? 'All block devices are allocated. If you just attached a new virtual disk on your hypervisor, click "Online Rescan Disks" above to scan SCSI buses without restarting.'
                      : 'تمامی دیسک‌ها به سیستم اختصاص یافته‌اند. اگر دیسک جدیدی در مجازی‌ساز اضافه کرده‌اید، دکمه «Online Rescan Disks» را در بالای صفحه بزنید.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {rawDisks.map((disk) => (
                    <div
                      key={disk.name}
                      className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-amber-300">{disk.name}</span>
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            {disk.size}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block font-mono mt-1">
                          {disk.type} {disk.fstype ? `(${disk.fstype})` : ''} &bull;{' '}
                          <span className="text-emerald-400">{isEn ? 'Ready for LVM' : 'آماده مقداردهی و پیوست'}</span>
                        </span>
                      </div>

                      {/* Three Clear Actions: Initialize PV, Add to Existing VG, or Create Volume */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleOpenInitPv(disk.name)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 cursor-pointer shadow-xs flex items-center gap-1 transition-colors"
                          title={isEn ? 'Initialize disk as Physical Volume (pvcreate)' : 'مقداردهی اولیه دیسک خام با دستور pvcreate'}
                        >
                          <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                          <span>{isEn ? 'Init PV' : 'مقداردهی PV'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenAddDiskToVg(undefined, disk.name)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 cursor-pointer shadow-xs flex items-center gap-1 transition-colors"
                          title={isEn ? 'Add to existing Volume Group' : 'پیوست این دیسک به گروه حجم موجود'}
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>{isEn ? '+ Add to VG' : '+ پیوست به گروه'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenCreate()}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 cursor-pointer shadow-xs transition-colors"
                          title={isEn ? 'Create new standalone VG/volume' : 'ایجاد فضای کاملاً مجزا با این دیسک'}
                        >
                          {isEn ? 'Create' : 'ایجاد'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
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
