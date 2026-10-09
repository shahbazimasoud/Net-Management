import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  AlertTriangle,
  Lock,
  Database,
  Server,
  Layers,
  Shield,
  FileCheck,
  CheckCircle2,
  RefreshCw,
  Maximize2,
  Minimize2,
  Minus,
  X
} from 'lucide-react';
import { ServerArchiveItem } from '../../types';

interface ServerArchiveRestoreModalProps {
  isOpen: boolean;
  isEn: boolean;
  isLightMode?: boolean;
  file: ServerArchiveItem | null;
  onClose: () => void;
  onConfirmRestore: (
    fileId: string,
    options: { mode: 'overwrite' | 'merge'; passphrase?: string }
  ) => Promise<void>;
}

export const ServerArchiveRestoreModal: React.FC<ServerArchiveRestoreModalProps> = ({
  isOpen,
  isEn,
  isLightMode = false,
  file,
  onClose,
  onConfirmRestore
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [mode, setMode] = useState<'overwrite' | 'merge'>('overwrite');
  const [passphrase, setPassphrase] = useState('');
  const [confirmKeyword, setConfirmKeyword] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setMode('overwrite');
    setPassphrase('');
    setConfirmKeyword('');
    setErrorMessage(null);
  }, [file, isOpen]);

  if (!isOpen || !file) return null;

  const handleExecute = async () => {
    setErrorMessage(null);

    if (file.isEncrypted && (!passphrase || passphrase.trim().length === 0)) {
      setErrorMessage(
        isEn
          ? 'This backup package is encrypted. Please enter the decryption passphrase.'
          : 'این پکیج با رمز عبور محافظت شده است. لطفاً رمز عبور را جهت رمزگشایی وارد کنید.'
      );
      return;
    }

    if (mode === 'overwrite' && confirmKeyword.trim().toUpperCase() !== 'RESTORE') {
      setErrorMessage(
        isEn
          ? 'Please type RESTORE to confirm complete database overwrite.'
          : 'جهت تایید بازگردانی کامل و بازنویسی دیتابیس، کلمه RESTORE را تایپ کنید.'
      );
      return;
    }

    setIsExecuting(true);
    try {
      await onConfirmRestore(file.id, {
        mode,
        passphrase: file.isEncrypted ? passphrase : undefined
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || (isEn ? 'Restore failed' : 'خطا در بازگردانی اطلاعات'));
    } finally {
      setIsExecuting(false);
    }
  };

  const isFormValid =
    (!file.isEncrypted || passphrase.trim().length > 0) &&
    (mode !== 'overwrite' || confirmKeyword.trim().toUpperCase() === 'RESTORE');

  return (
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[9999] flex flex-col items-center justify-center transition-all duration-200 ${
        isMaximized ? 'p-0' : 'p-3 sm:p-6 bg-black/80 backdrop-blur-sm'
      }`}
    >
      <div
        className={`flex flex-col transition-all duration-200 overflow-hidden shadow-2xl ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-2xl max-h-[88vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-300 text-slate-800'
            : 'bg-slate-950 border-amber-500/30 text-slate-100'
        }`}
      >
        {/* Header with 3 Universal Controls */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/10'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl border ${
                isLightMode
                  ? 'bg-amber-50 text-amber-600 border-amber-200'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}
            >
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm">
                {isEn ? '1-Click Server Archive Restoration' : 'بازگردانی مستقیم از آرشیو سرور (1-Click Restore)'}
              </h2>
              <p className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Restore live PostgreSQL database state directly from protected server archive'
                  : 'بازگردانی اتمیک تمام رکوردهای پایگاه داده مستقیماً از روی فایل ذخیره‌شده در سرور'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-500'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title={isEn ? 'Minimize' : 'کوچک‌سازی'}
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-500'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام صفحه') : (isEn ? 'Fullscreen' : 'تمام صفحه')}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'hover:bg-rose-100 text-slate-500 hover:text-rose-600'
                  : 'hover:bg-rose-950/40 text-slate-400 hover:text-rose-400'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Backup File Details Card */}
          <div
            className={`p-4 rounded-xl border space-y-3 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  {isEn ? 'Selected Server Snapshot' : 'فایل پشتیبان انتخابی سرور'}
                </span>
                <span className="font-mono text-xs font-bold text-cyan-400 break-all">{file.filename}</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {file.fileSizeFormatted}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1 border-t border-white/5">
              <div>
                <span className="text-slate-400 block">{isEn ? 'Created At:' : 'زمان تهیه:'}</span>
                <span className="font-semibold">{file.createdAtFormatted || file.createdAt}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{isEn ? 'Scope:' : 'دامنه اطلاعات:'}</span>
                <span className="font-semibold text-blue-400">{isEn ? file.scopeLabel_en || file.scopeLabel : file.scopeLabel}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{isEn ? 'Encryption:' : 'رمزنگاری:'}</span>
                <span className="font-semibold flex items-center gap-1">
                  {file.isEncrypted ? (
                    <span className="text-indigo-400 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>AES-GCM</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">{isEn ? 'None (Plain)' : 'عادی'}</span>
                  )}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">{isEn ? 'Checksum:' : 'هش SHA-256:'}</span>
                <span className="font-mono text-[10px] truncate block" title={file.checksumSha256}>
                  {file.checksumSha256 ? `${file.checksumSha256.slice(0, 8)}...` : 'N/A'}
                </span>
              </div>
            </div>

            {/* Counts breakdown */}
            {file.counts && (
              <div className="pt-2 border-t border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-center">
                <div className="p-1.5 rounded-lg bg-black/20">
                  <span className="text-slate-400 block">{isEn ? 'Servers' : 'سرورها'}</span>
                  <span className="font-bold text-white text-xs">{file.counts.servers || 0}</span>
                </div>
                <div className="p-1.5 rounded-lg bg-black/20">
                  <span className="text-slate-400 block">{isEn ? 'Devices' : 'تجهیزات'}</span>
                  <span className="font-bold text-white text-xs">{file.counts.devices || 0}</span>
                </div>
                <div className="p-1.5 rounded-lg bg-black/20">
                  <span className="text-slate-400 block">{isEn ? 'Maps' : 'نقشه‌ها'}</span>
                  <span className="font-bold text-white text-xs">{file.counts.customMaps || 0}</span>
                </div>
                <div className="p-1.5 rounded-lg bg-black/20">
                  <span className="text-slate-400 block">{isEn ? 'Policies' : 'پالیسی‌ها'}</span>
                  <span className="font-bold text-white text-xs">{file.counts.accessPolicies || 0}</span>
                </div>
              </div>
            )}
          </div>

          {/* Encrypted Passphrase Prompt */}
          {file.isEncrypted && (
            <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/40 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                <Lock className="w-4 h-4" />
                <span>{isEn ? 'Decryption Passphrase Required' : 'این پکیج رمزنگاری شده است'}</span>
              </div>
              <p className="text-[11px] text-slate-300">
                {isEn
                  ? 'Enter the password configured for this scheduled or manual backup to unlock and restore.'
                  : 'جهت رمزگشایی فایل در سرور، لطفاً کلمه عبور را وارد نمایید.'}
              </p>
              <input
                type="password"
                placeholder="••••••••"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className={`w-full px-3 py-1.5 rounded-lg text-xs border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                  isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-white/20 text-white'
                }`}
              />
            </div>
          )}

          {/* Restore Strategy Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold">{isEn ? 'Restore Strategy:' : 'روش اعمال و بازگردانی اطلاعات:'}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label
                className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 transition ${
                  mode === 'overwrite'
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                    : isLightMode
                    ? 'bg-white border-slate-200 text-slate-600'
                    : 'bg-slate-900/60 border-white/10 text-slate-400'
                }`}
              >
                <input
                  type="radio"
                  name="restoreMode"
                  checked={mode === 'overwrite'}
                  onChange={() => setMode('overwrite')}
                  className="mt-0.5 accent-amber-500 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-xs text-white">
                    {isEn ? 'Full Overwrite (Disaster Recovery)' : 'جایگزینی کامل (Full Overwrite)'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                    {isEn
                      ? 'Replaces active database tables with this backup state within an atomic transaction.'
                      : 'بازنویسی کامل وضعیت سرورها، دیوایس‌ها و کاربران با محتوای این فایل پشتیبان.'}
                  </div>
                </div>
              </label>

              <label
                className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 transition ${
                  mode === 'merge'
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : isLightMode
                    ? 'bg-white border-slate-200 text-slate-600'
                    : 'bg-slate-900/60 border-white/10 text-slate-400'
                }`}
              >
                <input
                  type="radio"
                  name="restoreMode"
                  checked={mode === 'merge'}
                  onChange={() => setMode('merge')}
                  className="mt-0.5 accent-cyan-500 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-xs text-white">
                    {isEn ? 'Smart Merge (Incremental)' : 'ادغام هوشمند (Smart Merge)'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                    {isEn
                      ? 'Appends missing items and updates existing records without purging active state.'
                      : 'افزودن آیتم‌های موجود در فایل به دیتابیس فعلی بدون حذف رکوردهای فعلی.'}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Overwrite Confirmation */}
          {mode === 'overwrite' && (
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 space-y-1.5 animate-fadeIn">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                <AlertTriangle className="w-4 h-4" />
                <span>{isEn ? 'Safety Confirmation Required:' : 'تاییدیه جهت جلوگیری از خطای ناخواسته:'}</span>
              </div>
              <p className="text-[11px] text-slate-300">
                {isEn
                  ? 'A pre-restore safety snapshot will be captured automatically. Type RESTORE to proceed:'
                  : 'یک نقطه بازگشت امن خودکار قبل از اعمال ایجاد خواهد شد. جهت تایید نهایی، کلمه RESTORE را تایپ کنید:'}
              </p>
              <input
                type="text"
                placeholder="RESTORE"
                value={confirmKeyword}
                onChange={(e) => setConfirmKeyword(e.target.value)}
                className={`w-full px-3 py-1.5 rounded-lg font-mono text-xs border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                  isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-amber-500/30 text-white'
                }`}
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-white/10 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isEn ? 'Automatic Safety Point Included' : 'ایجاد خودکار نقطه بازگشت امن در سرور'}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isExecuting}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>
            <button
              type="button"
              disabled={!isFormValid || isExecuting}
              onClick={handleExecute}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-1.5 ${
                isFormValid && !isExecuting
                  ? 'bg-gradient-to-r from-amber-600 via-rose-600 to-amber-700 hover:from-amber-500 hover:to-rose-500 text-white cursor-pointer'
                  : 'bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed'
              }`}
            >
              {isExecuting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isEn ? 'Restoring PostgreSQL Database...' : 'در حال بازگردانی دیتابیس در سرور...'}</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>{isEn ? 'Execute Server Restore' : 'اجرای بازگردانی روی سرور'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
