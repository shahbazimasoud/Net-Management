import React, { useState } from 'react';
import {
  Trash2,
  X,
  Minus,
  Maximize2,
  Minimize2,
  AlertTriangle,
  FolderMinus,
} from 'lucide-react';
import { RemoteServer, LinuxSystemUser } from '../../../types';
import { deleteLinuxUser } from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface DeleteUserModalProps {
  server: RemoteServer;
  user: LinuxSystemUser;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const DeleteUserModal: React.FC<DeleteUserModalProps> = ({
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
  const [removeHome, setRemoveHome] = useState(false);

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await deleteLinuxUser(server.id, user.username, removeHome, ephemeralPassword);
      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.error || (isEn ? 'Failed to delete user' : 'خطا در حذف کاربر'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error deleting user' : 'خطای ارتباط در حذف کاربر'));
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
            <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold">
                  {isEn ? `Delete User: ${user.username}` : `حذف کاربر: ${user.username}`}
                </h3>
                <FieldInfoTooltip
                  title={isEn ? 'Linux User Deletion' : 'حذف کاربر لینوکس'}
                  infoWhatEn="Executes userdel to delete the user account from /etc/passwd and /etc/shadow with optional home folder removal."
                  infoWhatFa="اجرای دستور userdel برای پاکسازی کامل حساب کاربری از پایگاه‌های داده سیستم همراه با امکان حذف پوشه خانگی."
                  infoWhyEn="Removes inactive, departed, or unauthorized users from the remote server."
                  infoWhyFa="برای پاکسازی اکانت‌های منقضی‌شده و جلوگیری از باقی‌ماندن مسیرهای لاگین ناامن."
                  infoExampleEn="sudo userdel -r olduser"
                  infoExampleFa="sudo userdel -r olduser"
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
        <form onSubmit={handleDelete} className="p-5 space-y-4">
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

          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{isEn ? 'Confirm User Account Deletion' : 'تأیید حذف دائمی حساب کاربری'}</span>
            </p>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              {isEn
                ? `Are you sure you want to permanently delete user "${user.username}" (UID: ${user.uid})? This action cannot be undone.`
                : `آیا از حذف دائمی کاربر «${user.username}» (شناسه: ${user.uid}) اطمینان دارید؟ این عملیات غیرقابل بازگشت است.`}
            </p>
          </div>

          <div
            className={`p-3 rounded-xl border ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={removeHome}
                onChange={(e) => setRemoveHome(e.target.checked)}
                className="mt-0.5 rounded text-rose-500 focus:ring-rose-500"
              />
              <div>
                <span className="text-xs font-semibold block flex items-center gap-1 text-slate-300">
                  <FolderMinus className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isEn ? 'Also remove home directory (-r)' : 'حذف کامل دایرکتوری خانگی و فایل‌ها (-r)'}</span>
                </span>
                <span className="text-[11px] text-slate-400 block font-mono mt-0.5">
                  {user.homeDir}
                </span>
              </div>
            </label>
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
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer flex items-center gap-2 disabled:opacity-50 shadow-md"
            >
              <Trash2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? (isEn ? 'Deleting...' : 'در حال حذف...') : (isEn ? 'Delete Account' : 'حذف قطعی کاربر')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
