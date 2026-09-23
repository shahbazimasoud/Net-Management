import React, { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  RefreshCw,
  Search,
  Layers,
  FolderTree,
  Database,
  CheckCircle2,
  AlertCircle,
  FolderCheck,
  Plus,
  Maximize2,
  ArrowRight,
  Disc,
  Server,
  Zap,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';
import {
  RemoteServer,
  LinuxStorageOverview,
  LinuxMountedFilesystem,
  LinuxPhysicalDisk,
  LinuxPhysicalVolume,
  LinuxVolumeGroup,
  LinuxLogicalVolume,
  LinuxDiskFormatMountPayload,
  LinuxLvmCreatePayload,
} from '../../../types';
import {
  fetchLinuxStorageOverview,
  rescanLinuxStorageDisks,
  formatAndMountLinuxDisk,
  extendLinuxLvVolume,
  createLinuxLvmVolume,
  addDiskToLinuxVg,
} from '../../../services/api';
import { LinuxDiskManageModal } from './LinuxDiskManageModal';
import { LinuxExtendLvModal } from './LinuxExtendLvModal';
import { LinuxCreateLvModal } from './LinuxCreateLvModal';
import { FieldInfoTooltip } from '../../vpn/FieldInfoTooltip';

export interface LinuxStorageManagerProps {
  server: RemoteServer;
  isLightMode?: boolean;
  onRefreshParent?: () => void;
}

type StorageTab = 'all' | 'filesystems' | 'disks' | 'pvs' | 'vgs' | 'lvs';

export const LinuxStorageManager: React.FC<LinuxStorageManagerProps> = ({
  server,
  isLightMode = false,
  onRefreshParent,
}) => {
  const { isEn } = useLanguage();

  // Storage data state
  const [data, setData] = useState<LinuxStorageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Tab navigation
  const [activeTab, setActiveTab] = useState<StorageTab>('all');

  // Modals state
  const [selectedDiskForManage, setSelectedDiskForManage] = useState<LinuxPhysicalDisk | null>(null);
  const [selectedLvForExtend, setSelectedLvForExtend] = useState<LinuxLogicalVolume | null>(null);
  const [isCreateLvOpen, setIsCreateLvOpen] = useState(false);
  const [targetVgForCreate, setTargetVgForCreate] = useState<string | null>(null);
  const [isOperationLoading, setIsOperationLoading] = useState(false);

  const handleOpenCreateLvModal = (vgName?: string) => {
    setTargetVgForCreate(vgName || null);
    setIsCreateLvOpen(true);
  };

  // Fetch real storage overview from server
  const loadStorageData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await fetchLinuxStorageOverview(server.id);
      if (res.success) {
        setData({
          filesystems: res.filesystems || [],
          physicalDisks: res.physicalDisks || [],
          physicalVolumes: res.physicalVolumes || [],
          volumeGroups: res.volumeGroups || [],
          logicalVolumes: res.logicalVolumes || [],
          summary: res.summary || {
            totalDiskCount: (res.physicalDisks || []).length,
            availableDiskCount: (res.physicalDisks || []).filter((d) => d.isAvailable).length,
            totalMountedCount: (res.filesystems || []).length,
            totalVgCount: (res.volumeGroups || []).length,
            totalLvCount: (res.logicalVolumes || []).length,
          },
          lvmInstalled: res.lvmInstalled ?? true,
          pvs: res.pvs,
          vgs: res.vgs,
          lvs: res.lvs,
          availableDisks: res.availableDisks,
        });
      } else {
        setActionMessage({
          text: res.error || (isEn ? 'Failed to fetch storage overview' : 'خطا در دریافت اطلاعات دیسک‌ها'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setActionMessage({
        text: err?.message || (isEn ? 'Network error fetching storage overview' : 'خطای ارتباط با سرور'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [server.id, isEn]);

  useEffect(() => {
    loadStorageData();
  }, [loadStorageData]);

  // Real SCSI & Block Rescan
  const handleScanDisks = async () => {
    setScanning(true);
    setScanMessage(null);
    try {
      const res = await rescanLinuxStorageDisks(server.id);
      if (res.success) {
        setScanMessage({
          text: res.message || (isEn ? 'Storage scan complete. Discovered block devices updated.' : 'اسکن ذخیره‌ساز با موفقیت انجام شد.'),
          type: 'success',
        });
        await loadStorageData(true);
        if (onRefreshParent) onRefreshParent();
      } else {
        setScanMessage({
          text: res.error || res.message || (isEn ? 'Storage scan failed' : 'خطا در اسکن تجهیزات'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setScanMessage({
        text: err?.message || (isEn ? 'Scan request failed' : 'خطا در ارسال درخواست اسکن'),
        type: 'error',
      });
    } finally {
      setScanning(false);
    }
  };

  // Workflow A: Format & Mount Disk
  const handleFormatAndMount = async (payload: LinuxDiskFormatMountPayload) => {
    setIsOperationLoading(true);
    setActionMessage(null);
    try {
      const res = await formatAndMountLinuxDisk(server.id, payload);
      if (res.success) {
        setActionMessage({
          text: res.message || (isEn ? 'Disk successfully formatted and mounted.' : 'دیسک با موفقیت فرمت و مانت شد.'),
          type: 'success',
        });
        setSelectedDiskForManage(null);
        await loadStorageData(true);
        if (onRefreshParent) onRefreshParent();
      } else {
        setActionMessage({
          text: res.message || res.error || (isEn ? 'Failed to format disk.' : 'خطا در فرمت و مانت دیسک.'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setActionMessage({
        text: err?.message || (isEn ? 'Failed to execute disk format.' : 'خطا در اجرای عملیات فرمت.'),
        type: 'error',
      });
    } finally {
      setIsOperationLoading(false);
    }
  };

  // Workflow B: Add Disk to LVM
  const handleAddDiskToLvm = async (diskPath: string, targetVg: string) => {
    setIsOperationLoading(true);
    setActionMessage(null);
    try {
      const res = await addDiskToLinuxVg(server.id, { diskPath, vgName: targetVg });
      if (res.success) {
        setActionMessage({
          text: res.message || (isEn ? `Disk ${diskPath} added to Volume Group ${targetVg}.` : `دیسک ${diskPath} به گروه حجمی ${targetVg} الحاق شد.`),
          type: 'success',
        });
        setSelectedDiskForManage(null);
        await loadStorageData(true);
        if (onRefreshParent) onRefreshParent();
      } else {
        setActionMessage({
          text: res.message || res.error || (isEn ? 'Failed to add disk to LVM.' : 'خطا در افزودن دیسک به LVM.'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setActionMessage({
        text: err?.message || (isEn ? 'Failed to execute LVM extension.' : 'خطا در الحاق دیسک به گروه حجمی.'),
        type: 'error',
      });
    } finally {
      setIsOperationLoading(false);
    }
  };

  // Extend LV and Grow Filesystem
  const handleExtendLv = async (params: {
    lvPath: string;
    vgName: string;
    addSize: string;
    diskToAddToVg?: string;
  }) => {
    setIsOperationLoading(true);
    setActionMessage(null);
    try {
      const res = await extendLinuxLvVolume(server.id, params);
      if (res.success) {
        setActionMessage({
          text: res.message || (isEn ? 'Logical Volume extended and filesystem successfully grown.' : 'حجم منطقی و فایل‌سیستم با موفقیت بزرگ‌سازی شد.'),
          type: 'success',
        });
        setSelectedLvForExtend(null);
        await loadStorageData(true);
        if (onRefreshParent) onRefreshParent();
      } else {
        setActionMessage({
          text: res.message || res.error || (isEn ? 'Failed to extend Logical Volume.' : 'خطا در افزایش حجم منطقی.'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setActionMessage({
        text: err?.message || (isEn ? 'Failed to execute LV extension.' : 'خطا در اجرای فرآیند توسعه حجم.'),
        type: 'error',
      });
    } finally {
      setIsOperationLoading(false);
    }
  };

  // Create new Logical Volume
  const handleCreateLv = async (payload: LinuxLvmCreatePayload) => {
    setIsOperationLoading(true);
    setActionMessage(null);
    try {
      const res = await createLinuxLvmVolume(server.id, payload);
      if (res.success) {
        setActionMessage({
          text: res.message || (isEn ? 'Logical Volume successfully created.' : 'حجم منطقی با موفقیت ایجاد شد.'),
          type: 'success',
        });
        setIsCreateLvOpen(false);
        setTargetVgForCreate(null);
        await loadStorageData(true);
        if (onRefreshParent) onRefreshParent();
      } else {
        setActionMessage({
          text: res.message || res.error || (isEn ? 'Failed to create Logical Volume.' : 'خطا در ایجاد حجم منطقی.'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setActionMessage({
        text: err?.message || (isEn ? 'Failed to execute LV creation.' : 'خطا در اجرای فرآیند ساخت حجم.'),
        type: 'error',
      });
    } finally {
      setIsOperationLoading(false);
    }
  };

  const filesystems = data?.filesystems || [];
  const physicalDisks = data?.physicalDisks || [];
  const physicalVolumes = data?.physicalVolumes || [];
  const volumeGroups = data?.volumeGroups || [];
  const logicalVolumes = data?.logicalVolumes || [];
  const availableDisksCount = physicalDisks.filter((d) => d.isAvailable).length;

  return (
    <div className="space-y-6">
      {/* Action Banners */}
      {scanMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
            scanMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {scanMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{scanMessage.text}</span>
          </div>
          <button
            onClick={() => setScanMessage(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100"
          >
            {isEn ? 'Dismiss' : 'بستن'}
          </button>
        </div>
      )}

      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
            actionMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100"
          >
            {isEn ? 'Dismiss' : 'بستن'}
          </button>
        </div>
      )}

      {/* Storage & Disks Top Bar */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <div className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <span className={isLightMode ? 'text-slate-900' : 'text-slate-100'}>
                {isEn ? 'Storage & Disks Architecture' : 'معماری ذخیره‌سازی و دیسک‌ها'}
              </span>
              {availableDisksCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                  {isEn ? `${availableDisksCount} Available / Unallocated` : `${availableDisksCount} دیسک آزاد جدید`}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
              <span>{isEn ? 'Physical Disks' : 'دیسک فیزیکی'}</span>
              <span>➔</span>
              <span>{isEn ? 'Partitions' : 'پارتیشن'}</span>
              <span>➔</span>
              <span>{isEn ? 'PV / VG / LV' : 'ساختار LVM'}</span>
              <span>➔</span>
              <span>{isEn ? 'Filesystem & Mounts' : 'فایل‌سیستم و مانت'}</span>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => loadStorageData()}
            disabled={loading || scanning}
            className={`px-3.5 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              isLightMode
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{isEn ? 'Refresh' : 'بروزرسانی'}</span>
          </button>

          <button
            type="button"
            onClick={handleScanDisks}
            disabled={loading || scanning}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/20 active:scale-98 transition-all flex items-center justify-center gap-2 flex-1 sm:flex-initial"
          >
            <Search className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? (isEn ? 'Scanning SCSI Bus...' : 'در حال اسکن درگاه...') : (isEn ? 'Scan for Disks' : 'اسکن دیسک‌ها')}</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {[
          { id: 'all', label: isEn ? 'All Tiers Overview' : 'نمای کلی لایه‌ها', count: null },
          { id: 'filesystems', label: isEn ? 'Mounted Filesystems' : 'فایل‌سیستم‌های مانت‌شده', count: filesystems.length },
          { id: 'disks', label: isEn ? 'Physical Disks' : 'دیسک‌های فیزیکی', count: physicalDisks.length },
          { id: 'pvs', label: isEn ? 'Physical Volumes (PV)' : 'پارتیشن‌های فیزیکی (PV)', count: physicalVolumes.length },
          { id: 'vgs', label: isEn ? 'Volume Groups (VG)' : 'گروه‌های حجمی (VG)', count: volumeGroups.length },
          { id: 'lvs', label: isEn ? 'Logical Volumes (LV)' : 'حجم‌های منطقی (LV)', count: logicalVolumes.length },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as StorageTab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'bg-cyan-500 text-white shadow-sm'
                : isLightMode
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== null && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeTab === tab.id
                    ? 'bg-white/20 text-white'
                    : isLightMode
                    ? 'bg-slate-200 text-slate-600'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && !data ? (
        /* Loading Skeleton */
        <div className="p-8 text-center space-y-3">
          <div className="inline-block w-8 h-8 border-3 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          <div className="text-xs text-slate-400">
            {isEn ? 'Discovering block devices, mounts, and LVM topology from server...' : 'در حال دریافت اطلاعات تجهیزات، مانت‌ها و LVM از هسته سیستم...'}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* SECTION 1: MOUNTED FILESYSTEMS */}
          {(activeTab === 'all' || activeTab === 'filesystems') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-200">
                  <FolderCheck className="w-4 h-4 text-cyan-400" />
                  <span className={isLightMode ? 'text-slate-900' : 'text-slate-100'}>
                    {isEn ? 'Mounted Filesystems' : 'فایل‌سیستم‌های مانت‌شده'}
                  </span>
                  <span className="text-xs font-normal text-slate-400">({filesystems.length})</span>
                </div>
                <FieldInfoTooltip
                  title={isEn ? 'Linux Mounted Filesystems' : 'فایل‌سیستم‌های فعال لینوکس'}
                  whatIsIt={
                    isEn
                      ? 'Live file hierarchy mount points currently active in the Linux VFS (Virtual File System).'
                      : 'نقاط مانت فعال در ساختار فایل لینوکس که به تجهیزات یا LVM متصل هستند.'
                  }
                  whyIsItNeeded={
                    isEn
                      ? 'Monitors partition usage, filesystem health, read/write flags, and identifies LVM-backed paths.'
                      : 'جهت پایش مصرف حجم دیسک، سلامت فایل‌سیستم و وضعیت دسترسی خواندن/نوشتن.'
                  }
                  practicalExample="/ (root), /var, /home, /data"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>

              {filesystems.length === 0 ? (
                <div
                  className={`p-6 rounded-xl border text-center text-xs text-slate-400 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  {isEn ? 'No mounted filesystems detected.' : 'هیچ فایل‌سیستم مانت‌شده‌ای یافت نشد.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {filesystems.map((fs, idx) => {
                    const pct = fs.usagePercent || 0;
                    const isHigh = pct >= 90;
                    const isWarn = pct >= 75 && pct < 90;

                    return (
                      <div
                        key={`${fs.mountPoint}-${idx}`}
                        className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                          isLightMode
                            ? 'bg-white border-slate-200 shadow-xs hover:border-slate-300'
                            : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          {/* Header / Mount Point */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-mono font-bold text-sm text-cyan-400 truncate">
                                {fs.mountPoint}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5" title={fs.device}>
                                {fs.device}
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                                fs.isReadOnly
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {fs.isReadOnly ? 'RO' : 'RW'}
                            </span>
                          </div>

                          {/* Progress Bar */}
                          <div className="mt-3.5 space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-400">
                                {isEn ? 'Usage:' : 'میزان مصرف:'} <span className="font-semibold text-slate-200 font-mono">{pct}%</span>
                              </span>
                              <span className="text-slate-400 font-mono text-[10px]">
                                {fs.usedSize} / {fs.totalSize}
                              </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  isHigh
                                    ? 'bg-rose-500'
                                    : isWarn
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Metadata Footer */}
                        <div
                          className={`mt-4 pt-3 border-t grid grid-cols-2 gap-2 text-[11px] ${
                            isLightMode ? 'border-slate-100 text-slate-600' : 'border-slate-800 text-slate-400'
                          }`}
                        >
                          <div>
                            <span className="text-slate-500 text-[10px] block">{isEn ? 'Filesystem' : 'فایل‌سیستم'}</span>
                            <span className="font-mono font-semibold text-slate-300">{fs.fsType || '-'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] block">{isEn ? 'Free Space' : 'فضای آزاد'}</span>
                            <span className="font-mono font-semibold text-emerald-400">{fs.freeSize}</span>
                          </div>
                          {fs.isLvm && (
                            <div className="col-span-2 pt-1 font-mono text-[10px] text-purple-300 flex items-center gap-1 truncate">
                              <Layers className="w-3 h-3 shrink-0 text-purple-400" />
                              <span>
                                LVM: {fs.vgName || 'VG'}/{fs.lvName || 'LV'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: PHYSICAL DISKS */}
          {(activeTab === 'all' || activeTab === 'disks') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-200">
                  <HardDrive className="w-4 h-4 text-purple-400" />
                  <span className={isLightMode ? 'text-slate-900' : 'text-slate-100'}>
                    {isEn ? 'Physical Disks' : 'دیسک‌های فیزیکی'}
                  </span>
                  <span className="text-xs font-normal text-slate-400">({physicalDisks.length})</span>
                </div>
                <FieldInfoTooltip
                  title={isEn ? 'Linux Physical Block Devices' : 'تجهیزات بلاک فیزیکی'}
                  whatIsIt={
                    isEn
                      ? 'Physical storage drives (SATA, SAS, NVMe, VirtIO) discovered by the Linux kernel.'
                      : 'دیسک‌های فیزیکی یا مجازی متصل به سرور که توسط هسته لینوکس شناسایی شده‌اند.'
                  }
                  whyIsItNeeded={
                    isEn
                      ? 'The foundational hardware tier for partitioning, independent filesystems, or LVM PVs.'
                      : 'پایه و اساس اولیه ذخیره‌سازی جهت ایجاد پارتیشن یا الحاق به LVM.'
                  }
                  practicalExample="/dev/sda, /dev/sdb, /dev/nvme0n1"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>

              {physicalDisks.length === 0 ? (
                <div
                  className={`p-6 rounded-xl border text-center text-xs text-slate-400 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  {isEn ? 'No physical disks found.' : 'هیچ دیسک فیزیکی یافت نشد.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {physicalDisks.map((disk) => {
                    const isNew = disk.isAvailable;

                    return (
                      <div
                        key={disk.name}
                        className={`p-4 rounded-xl border transition-all relative flex flex-col justify-between ${
                          isNew
                            ? isLightMode
                              ? 'bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-400/20'
                              : 'bg-emerald-950/20 border-emerald-500/40 ring-1 ring-emerald-500/20'
                            : isLightMode
                            ? 'bg-white border-slate-200'
                            : 'bg-slate-900/80 border-slate-800'
                        }`}
                      >
                        <div>
                          {/* Disk Top Bar */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`p-2 rounded-lg ${
                                  isNew
                                    ? 'bg-emerald-500 text-white shadow-sm'
                                    : isLightMode ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                <HardDrive className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="font-mono font-bold text-sm text-cyan-400 flex items-center gap-2">
                                  <span>{disk.name}</span>
                                  {isNew && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                      {isEn ? 'New / Available' : 'جدید / آزاد'}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                                  {disk.model || disk.serial || (isEn ? 'Standard Block Disk' : 'دیسک استاندارد')}
                                </div>
                              </div>
                            </div>

                            {/* Capacity Badge */}
                            <div className="text-right">
                              <div className="font-mono font-bold text-sm text-slate-100">
                                {disk.size}
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                  disk.mediaType === 'NVMe'
                                    ? 'bg-purple-500/20 text-purple-400'
                                    : disk.mediaType === 'SSD'
                                    ? 'bg-cyan-500/20 text-cyan-400'
                                    : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                {disk.mediaType}
                              </span>
                            </div>
                          </div>

                          {/* Quick Stats Pill Grid */}
                          <div
                            className={`mt-4 p-3 rounded-lg grid grid-cols-3 gap-2 text-center text-xs ${
                              isLightMode ? 'bg-slate-50' : 'bg-slate-950/60'
                            }`}
                          >
                            <div>
                              <span className="text-[10px] text-slate-500 block">{isEn ? 'Partitions' : 'پارتیشن‌ها'}</span>
                              <span className="font-mono font-semibold text-slate-300">{disk.partitionCount}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-500 block">{isEn ? 'LVM Member' : 'عضو LVM'}</span>
                              <span className={`font-mono font-semibold ${disk.isInLvm ? 'text-purple-400' : 'text-slate-400'}`}>
                                {disk.isInLvm ? (isEn ? 'Yes' : 'بله') : (isEn ? 'No' : 'خیر')}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-500 block">{isEn ? 'Status' : 'وضعیت'}</span>
                              <span className={`font-semibold ${isNew ? 'text-emerald-400' : 'text-slate-300'}`}>
                                {isNew ? (isEn ? 'Available' : 'آزاد') : (isEn ? 'In Use' : 'در حال استفاده')}
                              </span>
                            </div>
                          </div>

                          {/* Associated Partitions List */}
                          {disk.partitions && disk.partitions.length > 0 && (
                            <div className="mt-3 space-y-1.5">
                              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                {isEn ? 'Child Partitions:' : 'پارتیشن‌های زیرمجموعه:'}
                              </div>
                              <div className="space-y-1">
                                {disk.partitions.map((part) => (
                                  <div
                                    key={part.name}
                                    className={`px-2.5 py-1.5 rounded text-[11px] font-mono flex items-center justify-between ${
                                      isLightMode ? 'bg-slate-100' : 'bg-slate-950/40 border border-slate-800/80'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      <span className="text-cyan-400 font-semibold">{part.name}</span>
                                      {part.fsType && <span className="text-purple-300 text-[10px]">({part.fsType})</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-slate-400">{part.size}</span>
                                      {part.mountPoint && (
                                        <span className="text-emerald-400 truncate max-w-[120px]" title={part.mountPoint}>
                                          {part.mountPoint}
                                        </span>
                                      )}
                                      {part.isInLvm && (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-purple-500/20 text-purple-300">
                                          PV
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Card Footer Actions */}
                        <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                          <div className="text-[11px] text-slate-400 font-mono">
                            {disk.transport ? `bus: ${disk.transport}` : ''}
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedDiskForManage(disk)}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                              isNew
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 active:scale-98'
                                : isLightMode
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                            }`}
                          >
                            <Zap className="w-3.5 h-3.5" />
                            <span>{isEn ? 'Manage Disk' : 'مدیریت دیسک'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SECTION 3: PHYSICAL VOLUMES (PV) */}
          {(activeTab === 'all' || activeTab === 'pvs') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-200">
                  <Disc className="w-4 h-4 text-emerald-400" />
                  <span className={isLightMode ? 'text-slate-900' : 'text-slate-100'}>
                    {isEn ? 'Physical Volumes (PV)' : 'پارتیشن‌های فیزیکی (PV)'}
                  </span>
                  <span className="text-xs font-normal text-slate-400">({physicalVolumes.length})</span>
                </div>
                <FieldInfoTooltip
                  title={isEn ? 'LVM Physical Volume (PV)' : 'پارتیشن فیزیکی LVM'}
                  whatIsIt={
                    isEn
                      ? 'A block device or partition initialized with pvcreate for use inside an LVM Volume Group.'
                      : 'تجهیز بلاکی که با دستور pvcreate برای عضویت در گروه حجمی LVM آماده شده است.'
                  }
                  whyIsItNeeded={
                    isEn
                      ? 'LVM aggregates multiple PVs into a unified storage pool (VG).'
                      : 'اتصال چندین دیسک فیزیکی به یک استخر ذخیره‌سازی مشترک را ممکن می‌سازد.'
                  }
                  practicalExample="/dev/sdb1 or /dev/nvme0n1p2"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>

              {physicalVolumes.length === 0 ? (
                <div
                  className={`p-6 rounded-xl border text-center text-xs text-slate-400 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  {isEn ? 'No Physical Volumes (PV) configured.' : 'هیچ Physical Volume (PV) پیکربندی نشده است.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {physicalVolumes.map((pv) => (
                    <div
                      key={pv.name}
                      className={`p-4 rounded-xl border flex flex-col justify-between ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="font-mono font-bold text-sm text-cyan-400 truncate">
                            {pv.name}
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/20 text-purple-300">
                            {pv.format || 'lvm2'}
                          </span>
                        </div>

                        <div className="mt-2 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">{isEn ? 'Volume Group:' : 'گروه حجمی:'}</span>
                            <span className="font-semibold text-slate-200">{pv.vgName}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">{isEn ? 'Total PV Size:' : 'ظرفیت کل:'}</span>
                            <span className="font-mono font-semibold text-slate-200">{pv.size}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">{isEn ? 'Free Space:' : 'فضای آزاد:'}</span>
                            <span className="font-mono font-semibold text-emerald-400">{pv.free}</span>
                          </div>
                        </div>
                      </div>

                      {/* Breadcrumb Hierarchy */}
                      <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] font-mono text-slate-400 flex items-center gap-1.5 truncate">
                        <span>{pv.parentDisk || 'Disk'}</span>
                        <ArrowRight className="w-3 h-3 text-slate-600" />
                        <span className="text-purple-400">{pv.name}</span>
                        <ArrowRight className="w-3 h-3 text-slate-600" />
                        <span className="text-cyan-400">{pv.vgName}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SECTION 4: VOLUME GROUPS (VG) */}
          {(activeTab === 'all' || activeTab === 'vgs') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-200">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <span className={isLightMode ? 'text-slate-900' : 'text-slate-100'}>
                    {isEn ? 'Volume Groups (VG)' : 'گروه‌های حجمی (VG)'}
                  </span>
                  <span className="text-xs font-normal text-slate-400">({volumeGroups.length})</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenCreateLvModal()}
                    disabled={volumeGroups.length === 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isEn ? 'New Logical Volume' : 'حجم منطقی جدید'}</span>
                  </button>
                  <FieldInfoTooltip
                    title={isEn ? 'LVM Volume Group (VG)' : 'گروه حجمی LVM'}
                    whatIsIt={
                      isEn
                        ? 'A unified pool of storage created by combining one or more Physical Volumes (PVs).'
                        : 'استخر یکپارچه‌ای از فضا که از ترکیب یک یا چند دیسک/پارتیشن (PV) ساخته می‌شود.'
                    }
                    whyIsItNeeded={
                      isEn
                        ? 'Allows dynamic allocation and online expansion of Logical Volumes on demand.'
                        : 'امکان تخصیص پویا و گسترش آنلاین درایوها را بدون وابستگی به یک هارد فیزیکی خاص فراهم می‌سازد.'
                    }
                    practicalExample="ubuntu-vg, data-vg"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
              </div>

              {volumeGroups.length === 0 ? (
                <div
                  className={`p-6 rounded-xl border text-center text-xs text-slate-400 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  {isEn ? 'No Volume Groups detected on this system.' : 'هیچ گروه حجمی (Volume Group) شناسایی نشد.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {volumeGroups.map((vg) => (
                    <div
                      key={vg.name}
                      className={`p-4 rounded-xl border flex flex-col justify-between ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Database className="w-5 h-5 text-cyan-400" />
                            <span className="font-bold text-sm text-slate-100">{vg.name}</span>
                          </div>
                          <div className="font-mono text-xs font-bold text-slate-200">
                            {vg.totalSize}
                          </div>
                        </div>

                        {/* Capacity Stats */}
                        <div
                          className={`mt-3.5 p-3 rounded-lg grid grid-cols-3 gap-2 text-center text-xs ${
                            isLightMode ? 'bg-slate-50' : 'bg-slate-950/60'
                          }`}
                        >
                          <div>
                            <span className="text-[10px] text-slate-500 block">{isEn ? 'Allocated' : 'تخصیص‌یافته'}</span>
                            <span className="font-mono font-semibold text-slate-300">{vg.allocatedSize}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">{isEn ? 'Free Space' : 'فضای آزاد'}</span>
                            <span className="font-mono font-bold text-emerald-400">{vg.freeSize}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">{isEn ? 'PVs / LVs' : 'تعداد PV / LV'}</span>
                            <span className="font-mono font-semibold text-slate-300">
                              {vg.pvCount} / {vg.lvCount}
                            </span>
                          </div>
                        </div>

                        {/* Member PVs and LVs */}
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono">
                          <div className="p-2 rounded bg-slate-950/40 border border-slate-800/80">
                            <div className="text-[10px] text-slate-400 font-sans font-semibold mb-1">
                              {isEn ? 'Member PVs:' : 'دیسک‌های PV عضو:'}
                            </div>
                            <div className="space-y-0.5 text-cyan-300 text-[10px] truncate">
                              {vg.pvs.length > 0 ? vg.pvs.join(', ') : '-'}
                            </div>
                          </div>
                          <div className="p-2 rounded bg-slate-950/40 border border-slate-800/80">
                            <div className="text-[10px] text-slate-400 font-sans font-semibold mb-1">
                              {isEn ? 'Member LVs:' : 'حجم‌های LV عضو:'}
                            </div>
                            <div className="space-y-0.5 text-purple-300 text-[10px] truncate">
                              {vg.lvs.length > 0 ? vg.lvs.join(', ') : '-'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenCreateLvModal(vg.name)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 transition-colors flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isEn ? 'New LV' : 'حجم منطقی جدید'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SECTION 5: LOGICAL VOLUMES (LV) */}
          {(activeTab === 'all' || activeTab === 'lvs') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-200">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span className={isLightMode ? 'text-slate-900' : 'text-slate-100'}>
                    {isEn ? 'Logical Volumes (LV)' : 'حجم‌های منطقی (LV)'}
                  </span>
                  <span className="text-xs font-normal text-slate-400">({logicalVolumes.length})</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenCreateLvModal()}
                    disabled={volumeGroups.length === 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      volumeGroups.length === 0
                        ? isEn
                          ? 'No Volume Group available'
                          : 'هیچ گروه حجمی در دسترس نیست'
                        : undefined
                    }
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isEn ? 'New LV' : 'حجم منطقی جدید'}</span>
                  </button>
                  <FieldInfoTooltip
                    title={isEn ? 'LVM Logical Volume (LV)' : 'حجم منطقی LVM'}
                    whatIsIt={
                      isEn
                        ? 'A virtual block device carved out from a Volume Group, holding a filesystem and mount point.'
                        : 'تجهیز بلاک مجازی که از استخر VG مشتق شده و فایل‌سیستم روی آن فرمت و مانت می‌گردد.'
                    }
                    whyIsItNeeded={
                      isEn
                        ? 'LVs can be resized online (lvextend) and snapshot-managed without taking services down.'
                        : 'امکان بزرگ‌سازی آنلاین (lvextend) و بدون وقفه سرویس‌ها را در شبکه فراهم می‌سازد.'
                    }
                    practicalExample="root-lv, data-lv"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
              </div>

              {logicalVolumes.length === 0 ? (
                <div
                  className={`p-6 rounded-xl border text-center text-xs text-slate-400 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  {isEn ? 'No Logical Volumes (LV) found.' : 'هیچ حجم منطقی (LV) یافت نشد.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {logicalVolumes.map((lv) => {
                    const pct = lv.usagePercent || 0;

                    return (
                      <div
                        key={`${lv.vgName}-${lv.name}`}
                        className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-mono font-bold text-sm text-cyan-400">
                                {lv.name}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                VG: {lv.vgName}
                              </div>
                            </div>
                            <div className="text-right font-mono">
                              <div className="font-bold text-sm text-slate-200">{lv.size}</div>
                              <span className="text-[10px] text-purple-300">{lv.fsType || 'ext4'}</span>
                            </div>
                          </div>

                          {/* Mount Point & Usage */}
                          {lv.mountPoint && (
                            <div className="mt-3 p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80 space-y-1.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-400">{isEn ? 'Mount:' : 'مانت:'}</span>
                                <span className="font-mono font-bold text-emerald-400 truncate">
                                  {lv.mountPoint}
                                </span>
                              </div>
                              {lv.usagePercent !== undefined && (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                                    <span>{isEn ? 'Usage:' : 'مصرف:'} {pct}%</span>
                                    <span>{lv.usedSize} / {lv.size}</span>
                                  </div>
                                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        pct >= 90 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                                      }`}
                                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                          <div className="text-[10px] text-slate-400 font-mono truncate" title={lv.path}>
                            {lv.path}
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedLvForExtend(lv)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center gap-1.5 active:scale-98 transition-all"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span>{isEn ? 'Extend LV' : 'توسعه حجم'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Disk Manage Modal (Workflows A & B) */}
      <LinuxDiskManageModal
        isOpen={!!selectedDiskForManage}
        onClose={() => setSelectedDiskForManage(null)}
        disk={selectedDiskForManage}
        volumeGroups={volumeGroups}
        onFormatAndMount={handleFormatAndMount}
        onAddDiskToLvm={handleAddDiskToLvm}
        isLightMode={isLightMode}
        isLoading={isOperationLoading}
      />

      {/* Extend LV Modal */}
      <LinuxExtendLvModal
        isOpen={!!selectedLvForExtend}
        onClose={() => setSelectedLvForExtend(null)}
        lv={selectedLvForExtend}
        volumeGroups={volumeGroups}
        availableDisks={data?.availableDisks || []}
        onExtend={handleExtendLv}
        isLightMode={isLightMode}
        isLoading={isOperationLoading}
      />

      {/* Create LV Modal */}
      <LinuxCreateLvModal
        isOpen={isCreateLvOpen}
        onClose={() => {
          setIsCreateLvOpen(false);
          setTargetVgForCreate(null);
        }}
        volumeGroups={volumeGroups}
        existingLogicalVolumes={logicalVolumes}
        targetVgName={targetVgForCreate}
        onCreateLv={handleCreateLv}
        isLightMode={isLightMode}
        isLoading={isOperationLoading}
      />
    </div>
  );
};
