import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  HardDrive,
  FolderPlus,
  Check,
  AlertTriangle,
  CheckCircle2,
  Layers,
  FileCode,
  Sliders,
  RefreshCw,
  Folder,
} from 'lucide-react';
import { RemoteServer, LinuxBlockDevice } from '../../types';
import { fetchLinuxBlockDevices, mountLinuxFilesystem } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface LinuxMountModalProps {
  isOpen: boolean;
  server: RemoteServer;
  ephemeralPassword?: string;
  onClose: () => void;
  onMinimize?: () => void;
  onSuccess: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const LinuxMountModal: React.FC<LinuxMountModalProps> = ({
  isOpen,
  server,
  ephemeralPassword,
  onClose,
  onMinimize,
  onSuccess,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [device, setDevice] = useState('');
  const [mountPoint, setMountPoint] = useState('/mnt/data');
  const [fsType, setFsType] = useState('auto');
  const [options, setOptions] = useState('defaults');
  const [persistInFstab, setPersistInFstab] = useState(true);
  const [createDirectory, setCreateDirectory] = useState(true);

  const [blockDevices, setBlockDevices] = useState<LinuxBlockDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Load available block devices from server
  const loadDevices = async () => {
    setLoadingDevices(true);
    try {
      const res = await fetchLinuxBlockDevices(server.id, ephemeralPassword);
      if (res.success && Array.isArray(res.devices)) {
        setBlockDevices(res.devices);
        // Automatically preselect first unmounted partition if any
        const unmounted = res.devices.find((d) => !d.mountpoint && d.type === 'part');
        if (unmounted && !device) {
          setDevice(unmounted.name);
          if (unmounted.fstype) {
            setFsType(unmounted.fstype);
          }
        }
      }
    } catch (err: any) {
      console.warn('Failed to load block devices:', err?.message);
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDevices();
      setFeedback(null);
    }
  }, [isOpen, server.id]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!device.trim()) {
      setFeedback({
        message: isEn ? 'Please specify a device or source filesystem' : 'لطفاً نام دیسک یا پارتیشن مبدأ را مشخص کنید',
        type: 'error',
      });
      return;
    }
    if (!mountPoint.trim().startsWith('/')) {
      setFeedback({
        message: isEn ? 'Mount point must be an absolute path starting with /' : 'مسیر مانت باید یک مسیر مطلق با / باشد',
        type: 'error',
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await mountLinuxFilesystem(
        server.id,
        {
          device: device.trim(),
          mountPoint: mountPoint.trim(),
          fsType: fsType.trim() || undefined,
          options: options.trim() || undefined,
          persistInFstab,
          createDirectory,
        },
        ephemeralPassword
      );

      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? 'Filesystem mounted successfully' : 'فایل‌سیستم با موفقیت مانت شد'),
          type: 'success',
        });
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      } else {
        setFeedback({
          message: res.message || res.error || (isEn ? 'Failed to mount filesystem' : 'خطا در مانت فایل‌سیستم'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Connection error while mounting filesystem' : 'خطای ارتباطی در مانت فایل‌سیستم'),
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const unmountedDevices = blockDevices.filter((d) => !d.mountpoint);

  const modalContent = (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm transition-all duration-200 ${
        isMaximized ? 'p-0 top-0 left-0 right-0 bottom-8 fixed' : ''
      }`}
    >
      <div
        className={`w-full flex flex-col overflow-hidden transition-all duration-200 shadow-2xl border ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-900'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        } ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'max-w-2xl max-h-[92vh] rounded-2xl'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b select-none ${
            isLightMode ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl flex items-center justify-center border shadow-sm ${
                isLightMode
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                  : 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
              }`}
            >
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg">
                  {isEn ? 'Mount Storage & Filesystem' : 'مانت حافظه و فایل‌سیستم'}
                </h3>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-mono border ${
                    isLightMode
                      ? 'bg-slate-100 text-slate-600 border-slate-300'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {server.name || server.ip}
                </span>
              </div>
              <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Attach local partitions, external storage, or network shares'
                  : 'اتصال پارتیشن‌های محلی، دیسک‌های جانبی یا منابع شبکه'}
              </p>
            </div>
          </div>

          {/* Triad of Window Control Buttons */}
          <div className="flex items-center gap-1.5">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                title={isEn ? 'Minimize' : 'کوچک‌سازی'}
                className={`p-2 rounded-lg transition-colors ${
                  isLightMode
                    ? 'hover:bg-slate-100 text-slate-600'
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
              className={`p-2 rounded-lg transition-colors ${
                isLightMode
                  ? 'hover:bg-slate-100 text-slate-600'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className={`p-2 rounded-lg transition-colors ${
                isLightMode
                  ? 'hover:bg-rose-50 text-slate-600 hover:text-rose-600'
                  : 'hover:bg-rose-950/40 text-slate-400 hover:text-rose-400'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Detected Unmounted Partitions Quick Selection */}
          <div
            className={`p-4 rounded-xl border ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {isEn ? 'Detected Block Devices' : 'دیسک‌ها و پارتیشن‌های شناسایی‌شده'}
                </span>
              </div>
              <button
                type="button"
                onClick={loadDevices}
                disabled={loadingDevices}
                className={`p-1 text-xs flex items-center gap-1 rounded transition-colors ${
                  isLightMode ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800'
                }`}
                title={isEn ? 'Refresh disks' : 'بروزرسانی دیسک‌ها'}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDevices ? 'animate-spin text-emerald-500' : ''}`} />
                <span className="text-[11px]">{isEn ? 'Scan' : 'اسکن'}</span>
              </button>
            </div>

            {unmountedDevices.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {unmountedDevices.map((dev) => (
                  <button
                    key={dev.name}
                    type="button"
                    onClick={() => {
                      setDevice(dev.name);
                      if (dev.fstype) setFsType(dev.fstype);
                    }}
                    className={`p-2.5 rounded-lg border text-left flex items-center justify-between transition-all ${
                      device === dev.name
                        ? isLightMode
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-medium ring-1 ring-emerald-400'
                          : 'bg-emerald-950/50 border-emerald-500/80 text-emerald-200 font-medium ring-1 ring-emerald-500'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
                        : 'bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-300'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-mono text-xs font-semibold flex items-center gap-1.5 truncate">
                        <HardDrive className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        {dev.name}
                      </div>
                      <div className="text-[11px] opacity-70 mt-0.5 truncate">
                        {dev.size} • {dev.type} {dev.fstype ? `• ${dev.fstype}` : ''}
                      </div>
                    </div>
                    {device === dev.name && (
                      <span className="shrink-0 p-1 bg-emerald-500 text-white rounded-full">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className={`text-xs py-2 italic ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {loadingDevices
                  ? isEn
                    ? 'Scanning server block devices...'
                    : 'در حال بررسی دیسک‌های متصل به سرور...'
                  : isEn
                  ? 'All detected partitions are currently mounted or enter custom device/path below.'
                  : 'تمامی پارتیشن‌های شناسایی‌شده مانت هستند یا مسیر دلخواه خود را در کادر زیر وارد کنید.'}
              </p>
            )}
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Device / Source */}
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-emerald-500" />
                  {isEn ? 'Device / Source Filesystem' : 'دیسک یا فایل‌سیستم مبدأ'}
                  <span className="text-rose-500">*</span>
                </label>
                <FieldInfoTooltip
                  title={isEn ? 'Device / Source' : 'دیسک یا منبع فایل‌سیستم'}
                  whatIsIt={
                    isEn
                      ? 'The block device node, storage partition, or network storage share to be mounted.'
                      : 'نود سخت‌افزاری دیسک، پارتیشن یا مسیر اشتراکی شبکه جهت مانت شدن.'
                  }
                  whyIsItNeeded={
                    isEn
                      ? 'Tells the Linux kernel which physical storage or remote share to read filesystem data from.'
                      : 'به کرنل لینوکس مشخص می‌کند که داده‌های فایل‌سیستم را از کدام دیسک فیزیکی یا اشتراک شبکه بارگذاری کند.'
                  }
                  practicalExample={
                    isEn
                      ? '/dev/sdb1, /dev/nvme1n1p1, or NFS share 192.168.1.100:/srv/nfs'
                      : '/dev/sdb1 یا /dev/nvme1n1p1 یا اشتراک شبکه 192.168.1.100:/srv/nfs'
                  }
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>
              <input
                type="text"
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                placeholder="/dev/sdb1"
                required
                className={`w-full px-3 py-2 text-sm font-mono rounded-lg border outline-none transition-all ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                    : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                }`}
              />
            </div>

            {/* Mount Point */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-emerald-500" />
                  {isEn ? 'Target Mount Point' : 'مسیر مانت مقصد'}
                  <span className="text-rose-500">*</span>
                </label>
                <FieldInfoTooltip
                  title={isEn ? 'Mount Point' : 'مسیر مانت'}
                  whatIsIt={
                    isEn
                      ? 'The absolute directory path in the Linux filesystem hierarchy where the files will be accessed.'
                      : 'مسیر مطلق پوشه در درخت فایل‌سیستم لینوکس که محتوای دیسک در آن در دسترس قرار می‌گیرد.'
                  }
                  whyIsItNeeded={
                    isEn
                      ? 'Linux does not use drive letters (like C: or D:). All storage is mounted into directory folders.'
                      : 'لینوکس از درایو لتر (مثل C یا D) استفاده نمی‌کند؛ کلیه حافظه‌ها در قالب پوشه‌ها متصل می‌شوند.'
                  }
                  practicalExample={
                    isEn ? '/mnt/storage, /media/backup, or /data' : '/mnt/storage یا /media/backup یا /data'
                  }
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>
              <input
                type="text"
                value={mountPoint}
                onChange={(e) => setMountPoint(e.target.value)}
                placeholder="/mnt/storage"
                required
                className={`w-full px-3 py-2 text-sm font-mono rounded-lg border outline-none transition-all ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                    : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                }`}
              />
            </div>

            {/* Filesystem Type */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-emerald-500" />
                  {isEn ? 'Filesystem Type' : 'نوع فایل‌سیستم'}
                </label>
                <FieldInfoTooltip
                  title={isEn ? 'Filesystem Type' : 'نوع فایل‌سیستم'}
                  whatIsIt={
                    isEn
                      ? 'The formatted layout of data blocks on the disk (e.g. ext4, xfs, btrfs, ntfs, nfs).'
                      : 'ساختار ذخیره‌سازی بلاک‌های داده روی دیسک (مثل ext4، xfs، btrfs، ntfs، nfs).'
                  }
                  whyIsItNeeded={
                    isEn
                      ? 'Specifies the correct filesystem driver for the Linux kernel to use when mounting.'
                      : 'درایور مناسب کرنل لینوکس را جهت خواندن داده‌ها مشخص می‌کند.'
                  }
                  practicalExample={
                    isEn
                      ? 'auto (auto-detect), ext4 (standard), xfs (enterprise), nfs (network)'
                      : 'auto (تشخیص خودکار)، ext4 (پیش‌فرض استاندارد)، xfs (سرعت بالا)، nfs (شبکه)'
                  }
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>
              <select
                value={fsType}
                onChange={(e) => setFsType(e.target.value)}
                className={`w-full px-3 py-2 text-sm font-mono rounded-lg border outline-none transition-all ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                    : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                }`}
              >
                <option value="auto">{isEn ? 'auto (Auto-detect)' : 'auto (تشخیص خودکار)'}</option>
                <option value="ext4">ext4 (Standard Linux)</option>
                <option value="xfs">xfs (High-Performance Linux)</option>
                <option value="btrfs">btrfs (Snapshot-capable)</option>
                <option value="vfat">vfat / FAT32 (USB/EFI)</option>
                <option value="ntfs-3g">ntfs-3g (Windows NTFS)</option>
                <option value="nfs">nfs (Network File System)</option>
                <option value="cifs">cifs (Windows SMB Share)</option>
              </select>
            </div>

            {/* Mount Options */}
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-emerald-500" />
                  {isEn ? 'Mount Options' : 'آپشن‌های مانت'}
                </label>
                <FieldInfoTooltip
                  title={isEn ? 'Mount Options' : 'آپشن‌های مانت'}
                  whatIsIt={
                    isEn
                      ? 'Comma-separated parameters passed to mount (e.g., defaults, noatime, ro, rw).'
                      : 'پارامترهای کاما-جدا که به دستور مانت ارسال می‌شوند (نظیر defaults, noatime, ro).'
                  }
                  whyIsItNeeded={
                    isEn
                      ? 'Controls performance, access permissions, and write protection.'
                      : 'عملکرد، دسترسی‌های نوشتن و پارامترهای امنیتی را تعیین می‌کند.'
                  }
                  practicalExample={
                    isEn ? 'defaults (default rw), defaults,noatime (faster), ro (read-only)' : 'defaults یا noatime یا ro'
                  }
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>
              <input
                type="text"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="defaults"
                className={`w-full px-3 py-2 text-sm font-mono rounded-lg border outline-none transition-all ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                    : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                }`}
              />
            </div>

            {/* Switches */}
            <div className="space-y-3 md:col-span-2 pt-1">
              {/* Create Directory */}
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  createDirectory
                    ? isLightMode
                      ? 'bg-emerald-50/50 border-emerald-300'
                      : 'bg-emerald-950/20 border-emerald-800/60'
                    : isLightMode
                    ? 'bg-white border-slate-200'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <input
                  type="checkbox"
                  checked={createDirectory}
                  onChange={(e) => setCreateDirectory(e.target.checked)}
                  className="mt-1 rounded text-emerald-600 focus:ring-emerald-500 shrink-0"
                />
                <div className="flex-1">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    <FolderPlus className="w-3.5 h-3.5 text-emerald-500" />
                    {isEn ? 'Create Directory Automatically' : 'ساخت خودکار پوشه در صورت عدم وجود'}
                  </div>
                  <p className={`text-[11px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn
                      ? 'Runs `mkdir -p` on the server if the target mount directory does not already exist'
                      : 'در صورتی که پوشه مقصد در سرور وجود نداشته باشد، دستور mkdir -p برای ایجاد آن اجرا می‌شود'}
                  </p>
                </div>
              </label>

              {/* Persist in /etc/fstab */}
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  persistInFstab
                    ? isLightMode
                      ? 'bg-emerald-50/50 border-emerald-300'
                      : 'bg-emerald-950/20 border-emerald-800/60'
                    : isLightMode
                    ? 'bg-white border-slate-200'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <input
                  type="checkbox"
                  checked={persistInFstab}
                  onChange={(e) => setPersistInFstab(e.target.checked)}
                  className="mt-1 rounded text-emerald-600 focus:ring-emerald-500 shrink-0"
                />
                <div className="flex-1">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-500" />
                    {isEn ? 'Persist in /etc/fstab (Mount on Boot)' : 'ثبت دائمی در /etc/fstab (مانت خودکار در بوت)'}
                  </div>
                  <p className={`text-[11px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn
                      ? 'Automatically mounts this drive every time the Linux system restarts'
                      : 'با ثبت در فایل fstab، این دیسک در هر بار ری‌استارت شدن سرور به طور خودکار مجدداً مانت می‌شود'}
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Feedback Banner */}
          {feedback && (
            <div
              className={`p-3 rounded-xl flex items-center gap-2.5 text-xs font-medium border ${
                feedback.type === 'success'
                  ? isLightMode
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-emerald-950/40 text-emerald-300 border-emerald-800'
                  : isLightMode
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : 'bg-rose-950/40 text-rose-300 border-rose-800'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-xs font-medium rounded-xl border transition-colors ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-medium rounded-xl text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{isEn ? 'Mounting...' : 'در حال مانت...'}</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{isEn ? 'Mount Filesystem' : 'مانت فایل‌سیستم'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
