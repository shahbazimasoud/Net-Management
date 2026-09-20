import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Key,
  Shield,
  Eye,
  EyeOff,
  Server,
  Terminal,
  Monitor,
  ArrowRight,
  AlertTriangle,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import { RemoteServer } from '../../types';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface OnDemandPasswordModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  target: 'rdp' | 'vnc' | 'terminal';
  shell?: 'bash' | 'zsh';
  onClose: () => void;
  onMinimize?: () => void;
  onConfirmConnect: (password: string) => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const OnDemandPasswordModal: React.FC<OnDemandPasswordModalProps> = ({
  isOpen,
  server,
  target,
  shell = 'bash',
  onClose,
  onMinimize,
  onConfirmConnect,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setShowPassword(false);
      setValidationError(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 80);
    }
  }, [isOpen, server?.id]);

  if (!isOpen || !server) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLockActive(e.getModifierState('CapsLock'));
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!password.trim()) {
      setValidationError(
        isEn ? 'Password is required to authenticate with this server.' : 'ورود رمز عبور برای احراز هویت با سرور الزامی است.'
      );
      inputRef.current?.focus();
      return;
    }
    setValidationError(null);
    onConfirmConnect(password);
  };

  const username =
    target === 'terminal'
      ? server.ssh_username || 'root'
      : server.win_username || (target === 'vnc' ? server.vnc_username || 'root' : 'Administrator');

  const port =
    target === 'terminal'
      ? server.ssh_port || 22
      : target === 'rdp'
      ? server.win_port || 3389
      : server.vnc_port || 5900;

  const protocolName =
    target === 'terminal'
      ? `SSH Terminal (${shell.toUpperCase()})`
      : target === 'rdp'
      ? 'In-Browser RDP (Guacamole)'
      : 'In-Browser VNC (Guacamole)';

  return createPortal(
    <div
      className={`fixed z-[9999] flex flex-col items-center justify-center ${
        isMaximized
          ? 'top-0 left-0 right-0 bottom-8 p-0'
          : 'inset-0 p-3 sm:p-4 bg-black/80 backdrop-blur-sm'
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`flex flex-col overflow-hidden transition-all duration-200 shadow-2xl ${
          isMaximized
            ? 'w-full h-full rounded-none border-none'
            : 'w-full max-w-lg rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Mandatory Rule 7 Triad Controls */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
            isLightMode ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/60'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Key className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate flex items-center gap-1.5">
                <span>{isEn ? 'Authenticate Session' : 'احراز هویت نشست'}</span>
                <span className="text-xs font-medium text-slate-400">({server.name})</span>
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                {isEn ? 'On-demand credential prompt for live connection' : 'درخواست گذرواژه در لحظه جهت اتصال مستقیم'}
              </p>
            </div>
          </div>

          {/* Triad Control Buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onMinimize}
              title={isEn ? 'Minimize' : 'کوچک‌سازی (ارسال به داک)'}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-500 hover:bg-slate-100'
                  : 'border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
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
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-500 hover:bg-slate-100'
                  : 'border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className="p-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Target Host Details Banner */}
          <div
            className={`p-3 rounded-xl border flex flex-col gap-2 ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 font-medium">
                {target === 'terminal' ? (
                  <Terminal className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Monitor className="w-4 h-4 text-cyan-400" />
                )}
                <span>{protocolName}</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {isEn ? '🔒 On-Demand Auth' : '🔒 احراز در لحظه'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-800/40">
              <div>
                <span className="text-slate-400">{isEn ? 'Host IP: ' : 'آدرس هاست: '}</span>
                <span className="font-mono font-bold text-cyan-400">{server.ip}:{port}</span>
              </div>
              <div>
                <span className="text-slate-400">{isEn ? 'User: ' : 'کاربر: '}</span>
                <span className="font-mono font-bold text-emerald-400">{username}</span>
              </div>
            </div>
          </div>

          {/* Security Guarantee Notice */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
              isLightMode
                ? 'bg-amber-50/60 border-amber-200 text-amber-900'
                : 'bg-amber-500/10 border-amber-500/25 text-amber-200/90'
            }`}
          >
            <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-[11px]">
                {isEn
                  ? 'Ephemeral In-Memory Credential'
                  : 'گذرواژه موقت صرفاً در حافظه رم'}
              </p>
              <p className="text-[10px] leading-relaxed text-slate-400">
                {isEn
                  ? 'This server does not store credentials. The password entered here will be used strictly to negotiate this active session and discarded immediately upon exit.'
                  : 'رمز عبور این سرور در دیتابیس ذخیره نشده است. رمزی که اکنون وارد می‌کنید صرفاً برای برقراری همین نشست استفاده شده و با خروج شما بلافاصله دور ریخته می‌شود.'}
              </p>
            </div>
          </div>

          {/* Password Input Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-300">
                  {isEn ? `Password for "${username}"` : `رمز عبور برای کاربر "${username}"`}
                </label>
                <FieldInfoTooltip
                  title={isEn ? 'Session Password' : 'رمز عبور نشست'}
                  whatIsIt={
                    isEn
                      ? 'The authentication password for the target user account on this host.'
                      : 'رمز عبور حساب کاربری مورد نظر در این سرور مقصد جهت ورود به سیستم.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Required to authenticate via SSH, RDP, or VNC without storing credentials at rest.'
                      : 'جهت احراز هویت در پروتکل SSH، RDP یا VNC بدون ذخیره‌سازی دائمی پسورد در سامانه.'
                  }
                  example={
                    isEn
                      ? 'e.g. S3cur3P@ssw0rd!2026'
                      : 'مثال: S3cur3P@ssw0rd!2026'
                  }
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>

              {capsLockActive && (
                <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {isEn ? 'Caps Lock ON' : 'کلید Caps Lock روشن است'}
                </span>
              )}
            </div>

            <div className="relative">
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder={isEn ? 'Enter password for this session...' : 'رمز عبور را برای این نشست وارد کنید...'}
                autoComplete="off"
                spellCheck={false}
                className={`w-full px-3 py-2 text-xs font-mono rounded-xl border outline-none transition-all pr-9 ${
                  validationError
                    ? 'border-rose-500 ring-2 ring-rose-500/20'
                    : isLightMode
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'
                    : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'
                }`}
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? (isEn ? 'Hide password' : 'پنهان‌سازی رمز') : (isEn ? 'Show password' : 'نمایش رمز')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition p-1 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            {validationError && (
              <p className="text-[11px] font-medium text-rose-400 flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>{validationError}</span>
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className={`flex items-center justify-end gap-2.5 px-4 py-3 border-t shrink-0 ${
            isLightMode ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/60'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              isLightMode
                ? 'border border-slate-300 text-slate-600 hover:bg-slate-100'
                : 'border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            {isEn ? 'Cancel' : 'انصراف'}
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-md shadow-cyan-500/25 transition cursor-pointer"
          >
            <span>{isEn ? 'Connect Live' : 'اتصال مستقیم'}</span>
            <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
