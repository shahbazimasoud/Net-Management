import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X, Minus, Maximize2, Minimize2, HardDrive, ShieldAlert, Check } from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';

export interface LinuxStorageConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  titleEn?: string;
  description: string;
  descriptionEn?: string;
  targetDevice?: string;
  actionType: 'format' | 'pvcreate' | 'vgextend' | 'lvextend' | 'unmount' | 'generic';
  isLightMode?: boolean;
  isLoading?: boolean;
  requiresTypingConfirmation?: boolean;
  confirmationKeyword?: string;
}

export const LinuxStorageConfirmationModal: React.FC<LinuxStorageConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  titleEn,
  description,
  descriptionEn,
  targetDevice,
  actionType,
  isLightMode = false,
  isLoading = false,
  requiresTypingConfirmation = false,
  confirmationKeyword = 'CONFIRM',
}) => {
  const { isEn } = useLanguage();
  const [isMaximized, setIsMaximized] = useState(false);
  const [typedKeyword, setTypedKeyword] = useState('');

  if (!isOpen) return null;

  const displayTitle = isEn ? (titleEn || title) : title;
  const displayDesc = isEn ? (descriptionEn || description) : description;

  const isDestructive = actionType === 'format' || actionType === 'pvcreate';
  const isConfirmDisabled = isLoading || (requiresTypingConfirmation && typedKeyword.trim().toUpperCase() !== confirmationKeyword.toUpperCase());

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div
        className={`relative flex flex-col transition-all duration-200 overflow-hidden shadow-2xl border ${
          isMaximized
            ? 'fixed top-0 left-0 right-0 bottom-8 z-50 p-0 w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-lg rounded-xl'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-900 border-slate-700/80 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b select-none ${
            isDestructive
              ? isLightMode
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-rose-950/40 border-rose-800/40 text-rose-300'
              : isLightMode
              ? 'bg-slate-100 border-slate-200 text-slate-800'
              : 'bg-slate-800/70 border-slate-700/60 text-slate-100'
          }`}
        >
          <div className="flex items-center gap-2.5 font-semibold text-sm">
            {isDestructive ? (
              <ShieldAlert className="w-5 h-5 text-rose-500 animate-pulse" />
            ) : (
              <HardDrive className="w-5 h-5 text-cyan-400" />
            )}
            <span>{displayTitle}</span>
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
              title={isEn ? (isMaximized ? 'Exit Fullscreen' : 'Fullscreen') : isMaximized ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}
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

        {/* Body */}
        <div className="flex-1 p-6 space-y-4 overflow-y-auto">
          {targetDevice && (
            <div
              className={`p-3 rounded-lg border font-mono text-xs flex items-center justify-between ${
                isLightMode
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : 'bg-slate-950/70 border-slate-800 text-cyan-300'
              }`}
            >
              <span className="font-sans font-semibold text-slate-500">
                {isEn ? 'Target Block Device:' : 'تجهیز بلاک هدف:'}
              </span>
              <span className="font-bold text-sm tracking-wide">{targetDevice}</span>
            </div>
          )}

          {isDestructive && (
            <div
              className={`p-4 rounded-lg border flex gap-3 ${
                isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-rose-950/30 border-rose-800/40 text-rose-200'
              }`}
            >
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1.5 leading-relaxed">
                <div className="font-bold text-sm">
                  {isEn ? 'Permanent Data Loss Warning' : 'هشدار پاک‌سازی قطعی داده‌ها'}
                </div>
                <div>
                  {isEn
                    ? 'Formatting or repartitioning will completely erase all existing partitions, filesystem headers, and data on this device. This operation is irreversible.'
                    : 'فرمت کردن یا پارتیشن‌بندی مجدد تمامی پارتیشن‌ها، هدر فایل‌سیستم و داده‌های موجود روی این دیسک را به طور غیرقابل بازگشت پاک خواهد کرد.'}
                </div>
              </div>
            </div>
          )}

          <div className="text-sm leading-relaxed text-slate-300 dark:text-slate-300 text-slate-600">
            {displayDesc}
          </div>

          {requiresTypingConfirmation && (
            <div className="space-y-2 pt-2">
              <label className="block text-xs font-semibold text-slate-400">
                {isEn
                  ? `To confirm, please type "${confirmationKeyword}" below:`
                  : `جهت تایید، لطفاً کلمه "${confirmationKeyword}" را وارد کنید:`}
              </label>
              <input
                type="text"
                value={typedKeyword}
                onChange={(e) => setTypedKeyword(e.target.value)}
                placeholder={confirmationKeyword}
                disabled={isLoading}
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm font-mono tracking-wider focus:outline-none focus:ring-2 ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800 focus:ring-rose-500/30 focus:border-rose-500'
                    : 'bg-slate-950 border-slate-700 text-slate-100 focus:ring-rose-500/30 focus:border-rose-500'
                }`}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-end gap-3 px-5 py-3.5 border-t ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              isLightMode
                ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            {isEn ? 'Cancel' : 'انصراف'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirmDisabled}
            className={`px-5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              isDestructive
                ? isConfirmDisabled
                  ? 'bg-rose-500/40 text-rose-200 cursor-not-allowed'
                  : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 active:scale-98'
                : isConfirmDisabled
                ? 'bg-cyan-600/40 text-cyan-200 cursor-not-allowed'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/30 active:scale-98'
            }`}
          >
            {isLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>
              {isLoading
                ? isEn ? 'Executing...' : 'در حال اجرا...'
                : isEn ? 'I Understand & Confirm' : 'متوجه هستم و تایید می‌کنم'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
