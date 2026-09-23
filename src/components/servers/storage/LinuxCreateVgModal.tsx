import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Database,
  X,
  Minus,
  Maximize2,
  Minimize2,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Plus,
  RefreshCw,
  Layers,
  Info,
} from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';
import {
  LinuxVolumeGroup,
  LinuxPhysicalDisk,
  LinuxPhysicalVolume,
  LinuxRawDisk,
  LinuxLvmCreateVgPayload,
} from '../../../types';
import { FieldInfoTooltip } from '../../vpn/FieldInfoTooltip';
import { LinuxStorageConfirmationModal } from './LinuxStorageConfirmationModal';

export interface LinuxCreateVgModalProps {
  isOpen: boolean;
  onClose: () => void;
  volumeGroups: LinuxVolumeGroup[];
  physicalDisks?: LinuxPhysicalDisk[];
  physicalVolumes?: LinuxPhysicalVolume[];
  availableDisks?: LinuxRawDisk[];
  onCreateVg: (payload: LinuxLvmCreateVgPayload) => Promise<void>;
  onRescanDisks?: () => Promise<void>;
  isLightMode?: boolean;
  isLoading?: boolean;
}

interface CandidateDiskItem {
  id: string;
  path: string;
  size: string;
  type: string;
  model?: string;
  isPv: boolean;
  pvSize?: string;
  recommended: boolean;
}

export const LinuxCreateVgModal: React.FC<LinuxCreateVgModalProps> = ({
  isOpen,
  onClose,
  volumeGroups,
  physicalDisks = [],
  physicalVolumes = [],
  availableDisks = [],
  onCreateVg,
  onRescanDisks,
  isLightMode = false,
  isLoading = false,
}) => {
  const { isEn } = useLanguage();
  const [isMaximized, setIsMaximized] = useState(false);

  const [vgName, setVgName] = useState('vg_data');
  const [selectedDiskPaths, setSelectedDiskPaths] = useState<string[]>([]);
  const [peSize, setPeSize] = useState('4M');
  const [force, setForce] = useState(true);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isRescanning, setIsRescanning] = useState(false);

  // Compute available candidate disks
  const candidateDisks: CandidateDiskItem[] = React.useMemo(() => {
    const list: CandidateDiskItem[] = [];
    const seenPaths = new Set<string>();

    // 1. Unassigned Physical Volumes (pvs with no vg)
    for (const pv of physicalVolumes) {
      const isUnassigned = !pv.vgName || pv.vgName === '-' || pv.vgName === 'none' || pv.vgName === '';
      const devPath = pv.device || pv.name;
      if (isUnassigned && devPath && !seenPaths.has(devPath)) {
        seenPaths.add(devPath);
        list.push({
          id: devPath,
          path: devPath,
          size: pv.size || pv.free || 'Unknown',
          type: 'Unassigned PV',
          isPv: true,
          pvSize: pv.size,
          recommended: true,
        });
      }
    }

    // 2. Physical Disks that are available or not in LVM and have no active mounts
    for (const d of physicalDisks) {
      const devPath = d.name.startsWith('/dev/') ? d.name : `/dev/${d.name}`;
      if (!seenPaths.has(devPath)) {
        const isEligible = d.isAvailable || (!d.isInLvm && d.partitions.length === 0 && !d.isUsed);
        if (isEligible) {
          seenPaths.add(devPath);
          list.push({
            id: devPath,
            path: devPath,
            size: d.size || 'Unknown',
            type: d.type || 'Raw Disk',
            model: d.model || undefined,
            isPv: false,
            recommended: true,
          });
        }
      }

      // Check partitions of non-LVM disks
      if (!d.isInLvm && d.partitions && d.partitions.length > 0) {
        for (const p of d.partitions) {
          const partPath = p.name.startsWith('/dev/') ? p.name : `/dev/${p.name}`;
          if (!seenPaths.has(partPath) && !p.mountPoint && !p.fsType) {
            seenPaths.add(partPath);
            list.push({
              id: partPath,
              path: partPath,
              size: p.size || 'Unknown',
              type: 'Partition',
              isPv: false,
              recommended: false,
            });
          }
        }
      }
    }

    // 3. Fallback to availableDisks from raw scan
    for (const raw of availableDisks) {
      const devPath = raw.name.startsWith('/dev/') ? raw.name : `/dev/${raw.name}`;
      if (!seenPaths.has(devPath)) {
        seenPaths.add(devPath);
        list.push({
          id: devPath,
          path: devPath,
          size: raw.size || 'Unknown',
          type: raw.type || 'Raw Device',
          model: raw.model,
          isPv: false,
          recommended: true,
        });
      }
    }

    return list;
  }, [physicalDisks, physicalVolumes, availableDisks]);

  // Reset or initialize selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setValidationError(null);
      // Auto-select first recommended candidate disk if none selected
      if (selectedDiskPaths.length === 0 && candidateDisks.length > 0) {
        const first = candidateDisks.find((d) => d.recommended) || candidateDisks[0];
        if (first) {
          setSelectedDiskPaths([first.path]);
        }
      }
    }
  }, [isOpen, candidateDisks]);

  if (!isOpen) return null;

  const toggleDiskSelection = (path: string) => {
    setSelectedDiskPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

  const handleSelectAll = () => {
    if (selectedDiskPaths.length === candidateDisks.length) {
      setSelectedDiskPaths([]);
    } else {
      setSelectedDiskPaths(candidateDisks.map((d) => d.path));
    }
  };

  const handleRescan = async () => {
    if (!onRescanDisks || isRescanning) return;
    setIsRescanning(true);
    try {
      await onRescanDisks();
    } finally {
      setIsRescanning(false);
    }
  };

  const handleStartCreate = () => {
    setValidationError(null);

    // 1. Validate VG Name
    const cleanVg = vgName.trim();
    if (!cleanVg) {
      setValidationError(
        isEn ? 'Please enter a Volume Group name.' : 'لطفاً نام گروه حجمی را وارد کنید.'
      );
      return;
    }

    if (!/^[a-zA-Z0-9_\-]+$/.test(cleanVg)) {
      setValidationError(
        isEn
          ? 'Volume Group name may only contain letters, numbers, underscores, and hyphens.'
          : 'نام گروه حجمی فقط می‌تواند شامل حروف، ارقام، زیرخط (_) و خط تیره (-) باشد.'
      );
      return;
    }

    const nameLower = cleanVg.toLowerCase();
    if (volumeGroups.some((vg) => vg.name.toLowerCase() === nameLower)) {
      setValidationError(
        isEn
          ? `A Volume Group named "${cleanVg}" already exists on this server.`
          : `یک گروه حجمی با نام "${cleanVg}" از قبل در این سرور وجود دارد.`
      );
      return;
    }

    // 2. Validate Disks
    if (selectedDiskPaths.length === 0) {
      setValidationError(
        isEn
          ? 'Please select at least one raw disk or partition to create the Volume Group.'
          : 'لطفاً حداقل یک دیسک یا پارتیشن را برای تشکیل گروه حجمی انتخاب کنید.'
      );
      return;
    }

    setIsConfirmOpen(true);
  };

  const handleExecuteConfirmed = async () => {
    setIsConfirmOpen(false);
    await onCreateVg({
      vgName: vgName.trim(),
      selectedDisks: selectedDiskPaths,
      peSize: peSize !== '4M' ? peSize : undefined,
      force,
    });
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
            isLightMode
              ? 'bg-slate-100 border-slate-200 text-slate-800'
              : 'bg-slate-800/80 border-slate-700 text-slate-100'
          }`}
        >
          <div className="flex items-center gap-2.5 font-semibold text-sm">
            <Database className="w-5 h-5 text-cyan-400" />
            <span>{isEn ? 'Create Volume Group (VG)' : 'ایجاد گروه حجمی جدید (VG)'}</span>
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
              title={
                isEn
                  ? isMaximized
                    ? 'Exit Fullscreen'
                    : 'Fullscreen'
                  : isMaximized
                  ? 'خروج از تمام‌صفحه'
                  : 'تمام‌صفحه'
              }
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

        {/* Form Body */}
        <div className="flex-1 p-5 space-y-4 overflow-y-auto">
          {validationError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Volume Group Name */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-cyan-400" />
                <span>{isEn ? 'Volume Group Name (VG Name)' : 'نام گروه حجمی (VG Name)'}</span>
              </label>
              <FieldInfoTooltip
                title={isEn ? 'Volume Group Name' : 'نام گروه حجمی'}
                whatIsIt={
                  isEn
                    ? 'A descriptive, unique identifier for this LVM storage pool.'
                    : 'یک شناسه منحصر‌به‌فرد و معتبر برای استخر ذخیره‌سازی تجمیع‌شده LVM.'
                }
                whyIsItNeeded={
                  isEn
                    ? 'Required by the Linux LVM subsystem to address this pool and slice Logical Volumes from it.'
                    : 'هسته لینوکس از این نام برای ارجاع به استخر و برش حجم‌های منطقی (LV) استفاده می‌کند.'
                }
                practicalExample="vg_data, app-vg, storage-pool"
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>
            <input
              type="text"
              value={vgName}
              onChange={(e) => setVgName(e.target.value.replace(/\s+/g, '_'))}
              placeholder="vg_data"
              className={`w-full px-3 py-2 rounded-lg text-xs font-mono border transition-all ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-900 focus:border-cyan-500'
                  : 'bg-slate-950/80 border-slate-700 text-slate-100 focus:border-cyan-400'
              }`}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              {isEn
                ? 'Only alphanumeric characters, underscores, and hyphens are allowed.'
                : 'فقط حروف انگلیسی، ارقام، خط زیر (_) و خط تیره (-) مجاز است.'}
            </p>
          </div>

          {/* Candidate Disks / Physical Volumes Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-purple-400" />
                <span>
                  {isEn ? 'Select Physical Storage Disks' : 'انتخاب دیسک‌های فیزیکی تشکیل‌دهنده'}
                </span>
                <span className="text-[11px] text-slate-400 font-normal">
                  ({selectedDiskPaths.length}/{candidateDisks.length})
                </span>
              </label>

              <div className="flex items-center gap-2">
                {candidateDisks.length > 1 && (
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-medium"
                  >
                    {selectedDiskPaths.length === candidateDisks.length
                      ? isEn
                        ? 'Deselect All'
                        : 'لغو انتخاب همه'
                      : isEn
                      ? 'Select All'
                      : 'انتخاب همه'}
                  </button>
                )}

                {onRescanDisks && (
                  <button
                    type="button"
                    onClick={handleRescan}
                    disabled={isRescanning}
                    className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 transition-all ${
                      isLightMode
                        ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                    title={isEn ? 'Rescan SCSI Disks' : 'اسکن مجدد دیسک‌های سیستم'}
                  >
                    <RefreshCw className={`w-3 h-3 ${isRescanning ? 'animate-spin text-cyan-400' : ''}`} />
                    <span>{isEn ? 'Rescan' : 'اسکن دیسک'}</span>
                  </button>
                )}

                <FieldInfoTooltip
                  title={isEn ? 'Physical Disks Selection' : 'انتخاب دیسک‌های خام'}
                  whatIsIt={
                    isEn
                      ? 'One or more physical block devices or partitions to bundle into the Volume Group.'
                      : 'یک یا چند دیسک، پارتیشن یا حافظه فیزیکی که فضای آنها با یکدیگر تجمیع می‌شود.'
                  }
                  whyIsItNeeded={
                    isEn
                      ? 'A Volume Group requires raw underlying storage devices (PVs) to build its total capacity.'
                      : 'هر گروه حجمی برای تامین ظرفیت کلی نیاز به حداقل یک قطعه ذخیره‌سازی فیزیکی دارد.'
                  }
                  practicalExample="/dev/sdb, /dev/sdc"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
            </div>

            {candidateDisks.length === 0 ? (
              <div
                className={`p-4 rounded-xl border text-center space-y-2.5 ${
                  isLightMode ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-amber-950/20 border-amber-800/40 text-amber-300'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 text-xs font-semibold">
                  <AlertCircle className="w-4 h-4" />
                  <span>
                    {isEn
                      ? 'No available unassigned disks or partitions found.'
                      : 'هیچ دیسک خام یا پارتیشن آزادسازی‌شده‌ای روی سرور یافت نشد.'}
                  </span>
                </div>
                <p className="text-[11px] opacity-80 max-w-md mx-auto">
                  {isEn
                    ? 'All current disks are already assigned to active filesystems or Volume Groups. If you recently attached a new virtual disk, click "Rescan Disks" below.'
                    : 'تمامی دیسک‌های فعلی در حال استفاده در فایل‌سیستم یا LVM هستند. چنانچه دیسک جدیدی اضافه کرده‌اید، دکمه اسکن دیسک‌ها را بفشارید.'}
                </p>
                {onRescanDisks && (
                  <button
                    type="button"
                    onClick={handleRescan}
                    disabled={isRescanning}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white shadow-sm transition-all"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
                    <span>{isEn ? 'Online Rescan Disks' : 'اسکن آنلاین دیسک‌ها'}</span>
                  </button>
                )}
              </div>
            ) : (
              <div
                className={`max-h-48 overflow-y-auto rounded-lg border divide-y ${
                  isLightMode
                    ? 'bg-white border-slate-200 divide-slate-100'
                    : 'bg-slate-950/60 border-slate-800 divide-slate-800/60'
                }`}
              >
                {candidateDisks.map((d) => {
                  const isChecked = selectedDiskPaths.includes(d.path);
                  return (
                    <div
                      key={d.id}
                      onClick={() => toggleDiskSelection(d.path)}
                      className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                        isChecked
                          ? isLightMode
                            ? 'bg-cyan-50/70 text-slate-900'
                            : 'bg-cyan-950/30 text-cyan-200'
                          : isLightMode
                          ? 'hover:bg-slate-50 text-slate-700'
                          : 'hover:bg-slate-800/40 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by parent div onClick
                          className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold">{d.path}</span>
                            {d.isPv && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">
                                {isEn ? 'Existing PV' : 'PV موجود'}
                              </span>
                            )}
                            {d.model && (
                              <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                                {d.model}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 font-sans">
                            {d.type}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-mono text-xs font-semibold text-emerald-400 block">
                          {d.size}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {isEn ? 'Capacity' : 'ظرفیت'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Aggregate Capacity & Info Card */}
          {selectedDiskPaths.length > 0 && (
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
                isLightMode
                  ? 'bg-cyan-50/80 border-cyan-200 text-cyan-900'
                  : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <div className="font-semibold">
                    {isEn
                      ? `${selectedDiskPaths.length} Device(s) Selected for this VG`
                      : `${selectedDiskPaths.length} دیسک/تجهیز برای تشکیل این گروه حجمی انتخاب شد`}
                  </div>
                  <div className="text-[11px] opacity-80">
                    {isEn
                      ? 'Disks will be initialized with pvcreate and aggregated using vgcreate.'
                      : 'دیسک‌ها در صورت نیاز با pvcreate آماده و با vgcreate تجمیع خواهند شد.'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Advanced Options: Physical Extent (PE) Size */}
          <div
            className={`p-3.5 rounded-xl border space-y-3 ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <span>{isEn ? 'Physical Extent (PE) Size' : 'اندازه واحد تخصیص (Physical Extent)'}</span>
              </label>
              <FieldInfoTooltip
                title={isEn ? 'Physical Extent (PE) Size' : 'اندازه Physical Extent'}
                whatIsIt={
                  isEn
                    ? 'The minimum allocation chunk unit inside the Volume Group (standard: 4 MB).'
                    : 'کوچک‌ترین قطعه تخصیص فضا درون گروه حجمی (استاندارد لینوکس: ۴ مگابایت).'
                }
                whyIsItNeeded={
                  isEn
                    ? 'Controls the granularity of Logical Volume expansion and allocation.'
                    : 'دقت در اندازه‌بندی درایوهای منطقی و میزان ظرفیت هر اکستنت را تعیین می‌کند.'
                }
                practicalExample="4M (Default), 8M, 16M"
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>

            <div className="grid grid-cols-5 gap-2">
              {['4M', '8M', '16M', '32M', '64M'].map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setPeSize(sz)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-mono font-medium border transition-all ${
                    peSize === sz
                      ? 'bg-cyan-600 border-cyan-500 text-white shadow-sm'
                      : isLightMode
                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {sz} {sz === '4M' ? (isEn ? '(Std)' : '(پیش‌فرض)') : ''}
                </button>
              ))}
            </div>

            {/* Force wipe old signatures toggle */}
            <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={force}
                  onChange={(e) => setForce(e.target.checked)}
                  className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                />
                <span className="text-[11px]">
                  {isEn
                    ? 'Force clean existing headers/signatures (-y -ff)'
                    : 'پاک‌سازی خودکار سربرگ‌ها و امضاهای قبلی دیسک (-y -ff)'}
                </span>
              </label>
              <span className="text-[10px] text-slate-500 font-mono">pvcreate -ff</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-t ${
            isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-800/80 border-slate-700'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {isEn ? 'Cancel' : 'انصراف'}
          </button>

          <button
            type="button"
            onClick={handleStartCreate}
            disabled={isLoading || selectedDiskPaths.length === 0}
            className="px-5 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            <span>
              {isLoading
                ? isEn
                  ? 'Creating VG...'
                  : 'در حال ساخت...'
                : isEn
                ? 'Create Volume Group'
                : 'ایجاد گروه حجمی (VG)'}
            </span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      <LinuxStorageConfirmationModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleExecuteConfirmed}
        title={isEn ? `Create Volume Group "${vgName}"` : `تایید ایجاد گروه حجمی "${vgName}"`}
        titleEn={`Create Volume Group "${vgName}"`}
        description={
          isEn
            ? `This operation will initialize Physical Volume(s) on ${selectedDiskPaths.join(
                ', '
              )} and create a new unified Volume Group named "${vgName}". Any unformatted data on these devices may be overwritten.`
            : `این عملیات دیسک‌های ${selectedDiskPaths.join(
                '، '
              )} را مقداردهی اولیه کرده و گروه حجمی جدیدی به نام "${vgName}" تشکیل می‌دهد. آیا از اجرای عملیات اطمینان دارید؟`
        }
        descriptionEn={`This operation will initialize Physical Volume(s) on ${selectedDiskPaths.join(
          ', '
        )} and create a new unified Volume Group named "${vgName}".`}
        targetDevice={selectedDiskPaths.join(', ')}
        actionType="generic"
        isLightMode={isLightMode}
        isLoading={isLoading}
      />
    </div>
  );

  return createPortal(modalContent, document.body);
};
