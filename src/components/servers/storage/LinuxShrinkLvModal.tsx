import React, { useState, useEffect } from 'react';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Minimize,
  ArrowDownLeft,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { RemoteServer, LinuxLvmLv, LinuxLvmVg } from '../../../types';
import { shrinkLinuxLvVolume } from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface LinuxShrinkLvModalProps {
  isOpen: boolean;
  server: RemoteServer;
  targetLv: LinuxLvmLv | null;
  allLvs: LinuxLvmLv[];
  allVgs: LinuxLvmVg[];
  ephemeralPassword?: string;
  onClose: () => void;
  onMinimize?: () => void;
  onSuccess: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const LinuxShrinkLvModal: React.FC<LinuxShrinkLvModalProps> = ({
  isOpen,
  server,
  targetLv,
  allLvs,
  allVgs,
  ephemeralPassword,
  onClose,
  onMinimize,
  onSuccess,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedLvPath, setSelectedLvPath] = useState('');
  const [reduceAmount, setReduceAmount] = useState('5G');
  const [confirmedRisk, setConfirmedRisk] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (targetLv) {
      setSelectedLvPath(targetLv.path);
    } else if (allLvs.length > 0) {
      setSelectedLvPath(allLvs[0].path);
    }
    setConfirmedRisk(false);
    setFeedback(null);
  }, [targetLv, allLvs, isOpen]);

  const currentLv = allLvs.find((l) => l.path === selectedLvPath) || targetLv;
  const currentVg = allVgs.find((v) => v.name === currentLv?.vgName);

  const isXfs = currentLv?.fsType?.toLowerCase() === 'xfs';
  const isRoot = currentLv?.mountPoint === '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentLv) return;

    if (isXfs) {
      setFeedback({
        type: 'error',
        message: isEn
          ? 'XFS filesystem cannot be shrunk by design. Only ext4 filesystems support online/offline reduction.'
          : 'سیستم‌فایل XFS به دلیل ساختار معماری خود امکان کوچک‌سازی (Shrink) ندارد و فقط قابل افزایش است.',
      });
      return;
    }

    if (isRoot) {
      setFeedback({
        type: 'error',
        message: isEn
          ? 'The active root filesystem (/) cannot be safely unmounted or shrunk on a live running system.'
          : 'پارتیشن ریشه اصلی لینوکس (/) در حال کار قابل آن‌مانت یا شرینک زنده نیست.',
      });
      return;
    }

    if (!reduceAmount.trim()) {
      setFeedback({
        type: 'error',
        message: isEn ? 'Please specify the reduction amount.' : 'لطفاً میزان کاهش فضا را مشخص کنید.',
      });
      return;
    }

    if (!confirmedRisk) {
      setFeedback({
        type: 'error',
        message: isEn
          ? 'Please acknowledge and confirm the filesystem reduction warning.'
          : 'لطفاً تیک تأیید آگاهی از شرایط شرینک دیسک را علامت بزنید.',
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await shrinkLinuxLvVolume(
        server.id,
        {
          lvPath: currentLv.path,
          vgName: currentLv.vgName,
          reduceAmount: reduceAmount.trim(),
          mountPoint: currentLv.mountPoint || undefined,
          fsType: currentLv.fsType || undefined,
        },
        ephemeralPassword
      );

      if (res.success) {
        setFeedback({
          type: 'success',
          message:
            res.message ||
            (isEn
              ? 'Logical Volume shrunk successfully! Reclaimed space is now free in Volume Group.'
              : 'فضای حجم با موفقیت کاهش یافت و فضای آزاد شده به گروه حجم بازگشت!'),
        });
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || (isEn ? 'Failed to shrink Logical Volume.' : 'خطا در کاهش حجم لاجیکال ولوم.'),
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
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Minimize className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>{isEn ? 'Shrink Logical Volume' : 'کاهش فضای لاجیکال ولوم (Shrink)'}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {currentLv ? currentLv.name : 'LV'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEn
                  ? 'Reclaim unused volume space and return it to the Volume Group for other storage paths.'
                  : 'آزادسازی فضای استفاده‌نشده ولوم و بازگرداندن آن به استخر گروه حجم برای استفاده در مسیرهای دیگر.'}
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
              <label className="text-xs font-semibold">{isEn ? 'Target Logical Volume' : 'انتخاب لاجیکال ولوم'}</label>
              <FieldInfoTooltip
                title={isEn ? 'Target LV' : 'ولوم هدف'}
                whatIsIt={isEn ? 'The specific partition to be shrunk.' : 'پارتیشنی که می‌خواهید فضای آن را کاهش دهید.'}
                whyNeeded={
                  isEn
                    ? 'Shrinks the filesystem and frees unallocated blocks back to the VG pool.'
                    : 'فایل‌سیستم را کوچک کرده و فضای بلااستفاده را به استخر گروه برمی‌گرداند.'
                }
                example={isEn ? '/dev/ubuntu-vg/data_lv' : '/dev/ubuntu-vg/data_lv'}
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>
            <select
              value={selectedLvPath}
              onChange={(e) => setSelectedLvPath(e.target.value)}
              className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition-colors ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800'
                  : 'bg-slate-900 border-slate-700 text-slate-200'
              }`}
            >
              {allLvs.map((lv) => (
                <option key={lv.path} value={lv.path}>
                  {lv.name} ({lv.size}) - {lv.mountPoint ? `Mounted on ${lv.mountPoint}` : 'Unmounted'} [{lv.fsType || 'ext4'}]
                </option>
              ))}
            </select>
          </div>

          {/* Current LV Info Box */}
          {currentLv && (
            <div
              className={`p-3.5 rounded-xl border text-xs grid grid-cols-2 sm:grid-cols-4 gap-3 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
              }`}
            >
              <div>
                <span className="text-[10px] text-slate-400 block">{isEn ? 'Current Size' : 'ظرفیت فعلی'}</span>
                <span className="font-mono font-bold text-amber-400 mt-0.5 block">{currentLv.size}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">{isEn ? 'Volume Group' : 'گروه حجم'}</span>
                <span className="font-mono font-bold mt-0.5 block">{currentLv.vgName}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">{isEn ? 'Filesystem' : 'نوع فایل‌سیستم'}</span>
                <span className="font-mono font-bold mt-0.5 block uppercase">{currentLv.fsType || 'ext4'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">{isEn ? 'Mount Point' : 'مسیر مانت'}</span>
                <span className="font-mono font-bold mt-0.5 block truncate">
                  {currentLv.mountPoint || (isEn ? 'Unmounted' : 'آن‌مانت')}
                </span>
              </div>
            </div>
          )}

          {/* XFS Architectural Warning */}
          {isXfs && (
            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-400">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <span>{isEn ? 'XFS Cannot Be Shrunk by Design' : 'فایل‌سیستم XFS بر اساس معماری خود قابلیت شرینک ندارد'}</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                {isEn
                  ? 'The Linux XFS filesystem format does not support shrinking or downscaling. To reduce size on an XFS partition, you must backup your files, recreate/reformat the LV with the smaller size, and restore the data.'
                  : 'معماری فایل‌سیستم XFS به گونه‌ای است که فقط امکان رشد و توسعه (xfs_growfs) دارد و قابلیت کوچک‌سازی را پشتیبانی نمی‌کند. در صورت نیاز به کاهش حجم XFS، باید از داده‌ها بکاپ گرفته، حجم را مجدداً با ظرفیت کمتر ساخته و اطلاعات را بازیابی نمایید.'}
              </p>
            </div>
          )}

          {/* Root Warning */}
          {isRoot && (
            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-400">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <span>{isEn ? 'Active Root Filesystem Protected' : 'حفاظت از فایل‌سیستم ریشه لینوکس'}</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                {isEn
                  ? 'The active root partition (/) cannot be unmounted while the operating system is running. Shrinking root requires booting into an offline rescue environment.'
                  : 'پارتیشن اصلی ریشه سیستم‌عامل (/) در حین روشن بودن سرور امکان آن‌مانت شدن ندارد. تغییر سایز ریشه مستلزم بوت به محیط نجات (Rescue Mode) است.'}
              </p>
            </div>
          )}

          {/* Reduction Amount Input */}
          {!isXfs && !isRoot && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold">{isEn ? 'Amount to Shrink (e.g. 5G, 10G)' : 'میزان کاهش حجم'}</label>
                <FieldInfoTooltip
                  title={isEn ? 'Reduce Amount' : 'میزان کاهش'}
                  whatIsIt={
                    isEn
                      ? 'The quantity of storage to subtract from this logical volume (e.g. 5G or 10G).'
                      : 'میزان فضایی که از این ولوم کاسته شده و به استخر گروه بازمی‌گردد.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Frees up space to reallocate to other critical partitions or new mount points.'
                      : 'فضای اضافی را آزاد کرده تا برای پارتیشن‌های دیگر یا مسیرهای مانت جدید قابل استفاده باشد.'
                  }
                  example={isEn ? '5G, 10G, 20G' : '5G یا 10G'}
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={reduceAmount}
                  onChange={(e) => setReduceAmount(e.target.value)}
                  placeholder="e.g. 5G or 10G"
                  className={`w-full px-3 py-2 text-xs rounded-xl border font-mono ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800'
                      : 'bg-slate-900 border-slate-700 text-slate-200'
                  }`}
                />

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">{isEn ? 'Quick Select:' : 'انتخاب سریع:'}</span>
                  {['2G', '5G', '10G', '20G', '50G'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setReduceAmount(s)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                        reduceAmount === s
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : isLightMode
                          ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      -{s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Safe Reclaim Information */}
          {!isXfs && !isRoot && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                isLightMode ? 'bg-cyan-50 border-cyan-200 text-cyan-900' : 'bg-cyan-950/20 border-cyan-900/50 text-cyan-300'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                <Info className="w-4 h-4 shrink-0 text-cyan-400" />
                <span>{isEn ? 'How Reclaimed Space Works' : 'نحوه آزادسازی و استفاده مجدد از فضا'}</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                {isEn
                  ? `Once shrunk by ${reduceAmount || 'selected amount'}, the freed space is returned directly into Volume Group "${currentLv?.vgName}". You can immediately allocate it to extend another volume or create a brand new partition.`
                  : `با کاهش ${reduceAmount || 'مقدار مشخص‌شده'}، این فضا بلافاصله به استخر گروه حجم «${currentLv?.vgName}» بازمی‌گردد و می‌توانید آن را به حجم دیگری اختصاص داده یا برای یک مسیر مانت جدید استفاده کنید.`}
              </p>
            </div>
          )}

          {/* Confirmation Checkbox */}
          {!isXfs && !isRoot && (
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmedRisk}
                onChange={(e) => setConfirmedRisk(e.target.checked)}
                className="mt-0.5 rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-semibold block">
                  {isEn
                    ? 'I confirm that the filesystem has sufficient free space to accommodate this reduction.'
                    : 'تأیید می‌کنم که فایل‌سیستم فضای خالی کافی بیشتر از مقدار کاهشی دارد.'}
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  {isEn
                    ? 'The volume will be temporarily unmounted for e2fsck validation and safely remounted upon completion.'
                    : 'ولوم جهت اعتبارسنجی e2fsck به طور موقت آن‌مانت شده و پس از تکمیل مجدداً مانت می‌شود.'}
                </span>
              </div>
            </label>
          )}

          {/* Feedback */}
          {feedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.message}</span>
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
              disabled={submitting || isXfs || isRoot || !confirmedRisk}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition-all shadow-md shadow-amber-600/20 cursor-pointer flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{isEn ? 'Shrinking Volume...' : 'در حال کاهش حجم...'}</span>
                </>
              ) : (
                <>
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Shrink Volume' : 'کاهش حجم (Shrink)'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
