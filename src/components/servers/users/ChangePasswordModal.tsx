import React, { useState } from 'react';
import {
  KeyRound,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { RemoteServer, LinuxSystemUser } from '../../../types';
import { updateLinuxUserPassword } from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface ChangePasswordModalProps {
  server: RemoteServer;
  user: LinuxSystemUser;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  server,
  user,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
  onClose,
  onSuccess,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError(isEn ? 'Password cannot be empty' : 'رمز عبور نمی‌تواند خالی باشد');
      return;
    }

    if (password !== confirmPassword) {
      setError(isEn ? 'Passwords do not match' : 'رمز عبور و تکرار آن یکسان نیستند');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await updateLinuxUserPassword(server.id, user.username, password, ephemeralPassword);
      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.error || (isEn ? 'Failed to update password' : 'خطا در تغییر رمز عبور'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error updating password' : 'خطای شبکه در تغییر رمز عبور'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className={`flex flex-col border shadow-2xl transition-all duration-200 overflow-hidden ${
          isMaximized
            ? 'fixed top-0 left-0 right-0 bottom-8 z-50 p-0 w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-md rounded-2xl'
        } ${isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'}`}
      >
        {/* Header with Mandatory 3 Controls */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-slate-100/80 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold">
                  {isEn ? `Change Password: ${user.username}` : `تغییر رمز عبور: ${user.username}`}
                </h3>
                <FieldInfoTooltip
                  title={isEn ? 'Linux User Password' : 'رمز عبور کاربر لینوکس'}
                  infoWhatEn="Securely updates the user password in /etc/shadow using PAM and chpasswd without terminal echoing."
                  infoWhatFa="به‌روزرسانی امن هش رمز عبور در /etc/shadow با بهره‌گیری از PAM و دستور chpasswd بدون انعکاس در لاگ‌ها."
                  infoWhyEn="Required when credential rotation is necessary or a user loses their SSH/console credentials."
                  infoWhyFa="برای تغییر دوره‌ای گذرواژه یا بازیابی دسترسی کاربرانی که رمز عبور کنسول یا SSH را فراموش کرده‌اند."
                  infoExampleEn="echo 'user:newSecret123!' | sudo chpasswd"
                  infoExampleFa="echo 'user:newSecret123!' | sudo chpasswd"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                UID: {user.uid} • {server.name || server.ip}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Minimize' : 'کوچک‌سازی'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isEn ? (isMaximized ? 'Exit Fullscreen' : 'Fullscreen') : isMaximized ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition cursor-pointer"
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-mono ${
                isLightMode ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs">
            <p className="text-cyan-300 font-semibold mb-0.5">
              {isEn ? 'Zero-Leak Password Protection' : 'امنیت بالا و عدم ذخیره رمز'}
            </p>
            <p className="text-slate-400 text-[11px]">
              {isEn
                ? 'The new password is encrypted during transit and injected directly into the Linux shadow database via SSH.'
                : 'رمز عبور جدید به صورت مستقیم و امن از طریق نشست SSH به پایگاه داده shadow سیستم تزریق می‌گردد.'}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-cyan-400" />
                <span>{isEn ? 'New Password' : 'رمز عبور جدید'}</span>
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[11px] text-slate-400 hover:text-cyan-400 flex items-center gap-1 transition cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showPassword ? (isEn ? 'Hide' : 'مخفی') : (isEn ? 'Show' : 'نمایش')}</span>
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              placeholder={isEn ? 'Enter new password' : 'رمز عبور جدید را وارد کنید'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1.5">
              {isEn ? 'Confirm New Password' : 'تکرار رمز عبور جدید'}
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              placeholder={isEn ? 'Re-enter new password' : 'تکرار رمز عبور جدید'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                isLightMode ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>
            <button
              type="submit"
              disabled={loading || !password}
              className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-2 disabled:opacity-50 shadow-md"
            >
              <KeyRound className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? (isEn ? 'Updating...' : 'در حال تغییر...') : (isEn ? 'Update Password' : 'ثبت رمز عبور جدید')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
