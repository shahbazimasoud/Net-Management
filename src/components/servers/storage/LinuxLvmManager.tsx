import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  HardDrive,
  RefreshCw,
  Plus,
  Maximize2,
  Minimize2,
  Maximize,
  Minimize,
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
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [targetLvForExtend, setTargetLvForExtend] = useState<LinuxLvmLv | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [shrinkModalOpen, setShrinkModalOpen] = useState(false);
  const [targetLvForShrink, setTargetLvForShrink] = useState<LinuxLvmLv | null>(null);

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

  const handleOpenExtend = (lv?: LinuxLvmLv) => {
    setTargetLvForExtend(lv || (overview?.lvs[0] || null));
    setExtendModalOpen(true);
  };

  const handleOpenShrink = (lv: LinuxLvmLv) => {
    setTargetLvForShrink(lv);
    setShrinkModalOpen(true);
  };

  const handleOpenCreate = () => {
    setCreateModalOpen(true);
  };

  const vgs = overview?.vgs || [];
  const lvs = overview?.lvs || [];
  const pvs = overview?.pvs || [];
  const rawDisks = (overview?.availableDisks || []).filter((d) => !d.isInLvm);

  return (
    <div className="space-y-6 pt-3">
      {/* Header Bar */}
      <div
        className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-slate-800'
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
                ? 'Dynamic zero-downtime disk allocation, online scanning, volume extension, and safe shrinking.'
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

          {/* New LVM Volume Button */}
          <button
            type="button"
            onClick={handleOpenCreate}
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

      {/* SECTION 1: VOLUME GROUPS OVERVIEW */}
      {!loading && overview && overview.lvmInstalled && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {isEn ? 'Storage Volume Groups (VGs)' : 'گروه‌های حجم ذخیره‌سازی (Volume Groups)'}
            </h4>
            <span className="text-[11px] text-slate-500">
              {vgs.length} {isEn ? 'Groups Defined' : 'گروه تعریف‌شده'}
            </span>
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
                onClick={handleOpenCreate}
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
                    className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
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

                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-800/60">
                        <button
                          type="button"
                          onClick={() => handleOpenExtend()}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                            isLightMode
                              ? 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100'
                              : 'bg-cyan-950/20 text-cyan-300 border-cyan-900/50 hover:bg-cyan-950/40'
                          }`}
                        >
                          <ArrowUpRight className="w-3 h-3" />
                          <span>{isEn ? 'Extend An LV' : 'اکستند ولوم'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenCreate}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                            isLightMode
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-emerald-950/20 text-emerald-300 border-emerald-900/50 hover:bg-emerald-950/40'
                          }`}
                        >
                          <Plus className="w-3 h-3" />
                          <span>{isEn ? 'New LV' : 'ولوم جدید'}</span>
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

      {/* SECTION 2: LOGICAL VOLUMES (LVs) */}
      {!loading && overview && overview.lvmInstalled && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {isEn ? 'Logical Volumes & Mount Points' : 'لاجیکال ولوم‌ها و مسیرهای مانت (LVs)'}
            </h4>
            <span className="text-[11px] text-slate-500">
              {lvs.length} {isEn ? 'Volumes Active' : 'ولوم فعال'}
            </span>
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
                onClick={handleOpenCreate}
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
                  className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
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

      {/* SECTION 3: PHYSICAL VOLUMES & DETECTED RAW DISKS */}
      {!loading && overview && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {isEn ? 'Physical Disks & Raw Devices' : 'دیسک‌های فیزیکی و دستگاه‌های خام شناسایی‌شده'}
            </h4>
            <span className="text-[11px] text-slate-500">
              {pvs.length} {isEn ? 'in LVM' : 'عضو LVM'} / {rawDisks.length} {isEn ? 'Unassigned' : 'خام بدون تخصیص'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Enrolled PVs */}
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
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
                  {pvs.map((pv) => (
                    <div
                      key={pv.name}
                      className="p-2.5 rounded-lg border border-slate-800/80 bg-slate-950/30 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-slate-200 block">{pv.name}</span>
                        <span className="text-[10px] text-slate-400 block font-mono">VG: {pv.vgName}</span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="text-cyan-400 font-semibold block">{pv.size}</span>
                        <span className="text-[10px] text-slate-400 block">Free: {pv.free}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Unassigned Raw Disks */}
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isEn ? 'Unassigned Raw Disks' : 'دیسک‌های خام شناسایی‌شده (جدید)'}</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {rawDisks.length}
                </span>
              </div>

              {rawDisks.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">
                    {isEn
                      ? 'All block devices are allocated. If you just attached a new virtual disk on your hypervisor, click "Online Rescan Disks" above.'
                      : 'تمامی دیسک‌ها به سیستم اختصاص یافته‌اند. اگر دیسک جدیدی در مجازی‌ساز اضافه کرده‌اید، دکمه «اسکن سریع دیسک‌ها» را بزنید.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {rawDisks.map((disk) => (
                    <div
                      key={disk.name}
                      className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-amber-300 block">{disk.name}</span>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {disk.type} {disk.fstype ? `(${disk.fstype})` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-200">{disk.size}</span>
                        <button
                          type="button"
                          onClick={() => handleOpenCreate()}
                          className="px-2.5 py-1 rounded text-[11px] font-medium text-white bg-cyan-600 hover:bg-cyan-500 cursor-pointer shadow-sm"
                        >
                          {isEn ? 'Create Volume' : 'ایجاد فضا'}
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
      <LinuxExtendLvModal
        isOpen={extendModalOpen}
        server={server}
        targetLv={targetLvForExtend}
        allLvs={lvs}
        allVgs={vgs}
        availableDisks={overview?.availableDisks || []}
        ephemeralPassword={ephemeralPassword}
        onClose={() => setExtendModalOpen(false)}
        onSuccess={() => {
          loadLvmOverview();
          if (onRefreshParent) onRefreshParent();
        }}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      <LinuxCreateLvmModal
        isOpen={createModalOpen}
        server={server}
        allVgs={vgs}
        availableDisks={overview?.availableDisks || []}
        ephemeralPassword={ephemeralPassword}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => {
          loadLvmOverview();
          if (onRefreshParent) onRefreshParent();
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
        onClose={() => setShrinkModalOpen(false)}
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
