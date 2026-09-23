import React, { useState, useMemo } from 'react';
import {
  UserCheck,
  X,
  Minus,
  Maximize2,
  Minimize2,
  KeyRound,
  Shield,
  Folder,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Search,
  Check,
  Plus,
  Calendar,
  Clock,
  Lock,
  Unlock,
} from 'lucide-react';
import { RemoteServer, LinuxSystemUser, LinuxSystemGroup } from '../../../types';
import { updateLinuxUser, createLinuxGroup } from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface EditUserModalProps {
  server: RemoteServer;
  user: LinuxSystemUser;
  systemGroups: LinuxSystemGroup[];
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
  server,
  user,
  systemGroups,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
  onClose,
  onSuccess,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields initialized from current user values
  const [comment, setComment] = useState(user.comment || '');
  const [shell, setShell] = useState(user.shell || '/bin/bash');
  const [homeDir, setHomeDir] = useState(user.homeDir || `/home/${user.username}`);
  const [selectedGroups, setSelectedGroups] = useState<string[]>(user.groups || []);
  const [isLocked, setIsLocked] = useState(!!user.isLocked);

  // Expiration settings
  const initialExpire = user.expireDate && user.expireDate !== 'never' ? user.expireDate : '';
  const [expireDate, setExpireDate] = useState(initialExpire);
  const [expirePreset, setExpirePreset] = useState<'never' | '30' | '90' | '180' | '365' | 'custom'>(
    initialExpire ? 'custom' : 'never'
  );

  // Optional new password & force change
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forcePasswordChange, setForcePasswordChange] = useState(!!user.mustChangePassword);

  // Group search & quick add
  const [groupFilter, setGroupFilter] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [availableGroups, setAvailableGroups] = useState<LinuxSystemGroup[]>(systemGroups);

  const handleExpirePresetChange = (preset: 'never' | '30' | '90' | '180' | '365' | 'custom') => {
    setExpirePreset(preset);
    if (preset === 'never') {
      setExpireDate('');
    } else if (preset === 'custom') {
      if (!expireDate) {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        setExpireDate(d.toISOString().split('T')[0]);
      }
    } else {
      const days = parseInt(preset, 10);
      const d = new Date();
      d.setDate(d.getDate() + days);
      setExpireDate(d.toISOString().split('T')[0]);
    }
  };

  const toggleGroup = (groupName: string) => {
    if (selectedGroups.includes(groupName)) {
      setSelectedGroups(selectedGroups.filter((g) => g !== groupName));
    } else {
      setSelectedGroups([...selectedGroups, groupName]);
    }
  };

  const handleQuickAddGroup = async () => {
    const clean = newGroupName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!clean) return;

    if (availableGroups.some((g) => g.name === clean)) {
      if (!selectedGroups.includes(clean)) {
        setSelectedGroups([...selectedGroups, clean]);
      }
      setNewGroupName('');
      return;
    }

    setCreatingGroup(true);
    try {
      const res = await createLinuxGroup(server.id, clean, ephemeralPassword);
      if (res.success) {
        const newGrp: LinuxSystemGroup = {
          name: clean,
          gid: 9999,
          members: [user.username],
        };
        setAvailableGroups([...availableGroups, newGrp]);
        setSelectedGroups([...selectedGroups, clean]);
        setNewGroupName('');
      } else {
        setError(res.error || (isEn ? 'Failed to create group' : 'خطا در ایجاد گروه'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error creating group' : 'خطای شبکه در ایجاد گروه'));
    } finally {
      setCreatingGroup(false);
    }
  };

  const filteredGroups = useMemo(() => {
    if (!groupFilter.trim()) return availableGroups;
    const q = groupFilter.toLowerCase();
    return availableGroups.filter((g) => g.name.toLowerCase().includes(q));
  }, [availableGroups, groupFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword && newPassword !== confirmPassword) {
      setError(isEn ? 'Passwords do not match' : 'رمز عبور و تکرار آن یکسان نیستند');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await updateLinuxUser(
        server.id,
        {
          username: user.username,
          comment: comment.trim(),
          shell: shell.trim(),
          homeDir: homeDir.trim(),
          groups: selectedGroups,
          expireDate: expirePreset === 'never' ? 'never' : (expireDate.trim() || undefined),
          newPassword: newPassword ? newPassword : undefined,
          forcePasswordChange,
          isLocked,
        },
        ephemeralPassword
      );

      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.error || (isEn ? 'Failed to update user' : 'خطا در ویرایش کاربر'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error updating user' : 'خطای شبکه در ویرایش کاربر'));
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
            : 'w-full max-w-2xl max-h-[92vh] rounded-2xl'
        } ${isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'}`}
      >
        {/* Header with Mandatory 3 Controls */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isLightMode ? 'bg-slate-100/80 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold">
                  {isEn ? `Edit User: ${user.username}` : `ویرایش کاربر: ${user.username}`}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  UID {user.uid}
                </span>
                {user.isSystem && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-500/10 text-slate-400 border border-slate-500/20">
                    {isEn ? 'System User' : 'کاربر سیستمی'}
                  </span>
                )}
                <FieldInfoTooltip
                  title={isEn ? 'Edit Linux User Account' : 'ویرایش حساب کاربری لینوکس'}
                  whatIsIt={isEn
                    ? 'Modifies existing Linux user attributes including login shell, home directory, groups, account expiration, and password aging policies.'
                    : 'تغییر ویژگی‌های حساب کاربری لینوکس اعم از شل ورود، پوشه خانگی، عضویت در گروه‌ها، تاریخ انقضا و سیاست‌های تغییر رمز عبور.'}
                  whyNeeded={isEn
                    ? 'Allows comprehensive administration of server accounts without running raw usermod or chage terminal commands manually.'
                    : 'امکان مدیریت یکپارچه و دقیق حساب‌های کاربری سرور را بدون نیاز به وارد کردن دستی دستورات پیچیده ترمینال فراهم می‌کند.'}
                  practicalExample={isEn
                    ? 'usermod -s /bin/zsh -c "Dev Lead" -e 2026-12-31 username'
                    : 'usermod -s /bin/zsh -c "Dev Lead" -e 2026-12-31 username'}
                />
              </div>
              <p className="text-xs text-slate-400 font-mono">
                {server.name || server.ip} • GID: {user.gid}
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

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
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

          {/* Account Status / Lock Banner */}
          <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
            isLocked
              ? isLightMode ? 'bg-rose-50 border-rose-200' : 'bg-rose-950/30 border-rose-500/30'
              : isLightMode ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-950/30 border-emerald-500/30'
          }`}>
            <div className="flex items-center gap-2.5">
              {isLocked ? (
                <Lock className="w-4 h-4 text-rose-400" />
              ) : (
                <Unlock className="w-4 h-4 text-emerald-400" />
              )}
              <div>
                <span className="text-xs font-bold block">
                  {isLocked
                    ? (isEn ? 'Account is currently Locked' : 'حساب کاربری در وضعیت قفل‌شده است')
                    : (isEn ? 'Account is Active and Unlocked' : 'حساب کاربری فعال و آزاد است')}
                </span>
                <span className="text-[11px] text-slate-400">
                  {isLocked
                    ? (isEn ? 'User cannot authenticate via password or interactive login.' : 'کاربر امکان لاگین تعاملی یا استفاده از رمز عبور را ندارد.')
                    : (isEn ? 'User can log in normally according to their credentials.' : 'کاربر امکان ورود و احراز هویت عادی را داراست.')}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsLocked(!isLocked)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                isLocked
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-sm'
                  : 'bg-rose-500 hover:bg-rose-400 text-white shadow-sm'
              }`}
            >
              {isLocked ? (isEn ? 'Unlock Account' : 'آزادسازی قفل') : (isEn ? 'Lock Account' : 'قفل کردن حساب')}
            </button>
          </div>

          {/* Comment / Full Name */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold">
                {isEn ? 'Full Name / Description (-c)' : 'نام کامل / توضیحات حساب (-c)'}
              </label>
              <FieldInfoTooltip
                title={isEn ? 'User Comment Field (GECOS)' : 'توضیحات و نام کاربر'}
                whatIsIt={isEn ? 'The GECOS/comment field stored in /etc/passwd representing full name or contact details.' : 'فیلد توضیحات در /etc/passwd که نام کامل، واحد سازمانی یا مسئول کاربر را نگهداری می‌کند.'}
                whyNeeded={isEn ? 'Identifies who owns this system account for audit and corporate directory purposes.' : 'شناسایی و تفکیک مالک حساب در گزارش‌های ممیزی و امنیتی سازمان.'}
                practicalExample={isEn ? 'usermod -c "Alice Smith - Backend Team" alice' : 'usermod -c "علی رضایی - تیم شبکه" alireza'}
              />
            </div>
            <input
              type="text"
              placeholder={isEn ? 'e.g. Lead Network Engineer' : 'مثال: مدیر فنی شبکه'}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg text-xs border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}
            />
          </div>

          {/* Home Dir & Login Shell */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold flex items-center gap-1">
                  <Folder className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isEn ? 'Home Directory (-d)' : 'مسیر پوشه خانگی (-d)'}</span>
                </label>
                <FieldInfoTooltip
                  title={isEn ? 'Home Directory' : 'پوشه خانگی کاربر'}
                  whatIsIt={isEn ? 'The primary working directory where user personal files and SSH keys are stored.' : 'مسیر دایرکتوری اصلی کاربر که فایل‌های شخصی و کلیدهای SSH در آن قرار می‌گیرد.'}
                  whyNeeded={isEn ? 'Determines the starting path when user logs in and where .ssh/authorized_keys resides.' : 'مسیر پیش‌فرض ورود به ترمینال و محل استقرار کلیدهای عمومی SSH.'}
                  practicalExample={isEn ? '/home/username or /data/home/username' : '/home/username یا /var/www'}
                />
              </div>
              <input
                type="text"
                value={homeDir}
                onChange={(e) => setHomeDir(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                  isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
                }`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold flex items-center gap-1">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isEn ? 'Login Shell (-s)' : 'شل ورود (-s)'}</span>
                </label>
                <FieldInfoTooltip
                  title={isEn ? 'Login Shell' : 'شل لاگین'}
                  whatIsIt={isEn ? 'Command-line interpreter launched when user opens an interactive terminal session.' : 'مفسر خط فرمانی که به محض لاگین کاربر اجرا می‌شود.'}
                  whyNeeded={isEn ? 'Set to /usr/sbin/nologin or /bin/false to completely block shell access while allowing SFTP or specific services.' : 'تنظیم روی nologin دسترسی مستقیم ترمینال را برای سرویس‌ها یا حساب‌های امنیتی قطع می‌کند.'}
                  practicalExample={isEn ? '/bin/bash, /bin/zsh, or /usr/sbin/nologin' : '/bin/bash یا /usr/sbin/nologin'}
                />
              </div>
              <select
                value={shell}
                onChange={(e) => setShell(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                  isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
                }`}
              >
                <option value="/bin/bash">/bin/bash (Default)</option>
                <option value="/bin/sh">/bin/sh (Standard POSIX)</option>
                <option value="/bin/zsh">/bin/zsh (Z Shell)</option>
                <option value="/usr/sbin/nologin">/usr/sbin/nologin (No Login Access)</option>
                <option value="/bin/false">/bin/false (Disabled Shell)</option>
              </select>
            </div>
          </div>

          {/* Account Expiration Date */}
          <div className={`p-4 rounded-xl border ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold">
                  {isEn ? 'Account Expiration Date' : 'تاریخ انقضای حساب کاربری (Expire Date)'}
                </span>
              </div>
              <FieldInfoTooltip
                title={isEn ? 'Account Expiration' : 'انقضای حساب کاربری'}
                whatIsIt={isEn
                  ? 'Configures the date when the Linux system automatically disables and locks this account via chage -E.'
                  : 'تاریخ مشخصی که پس از آن سیستم لینوکس با دستور chage -E حساب را خودکار غیرفعال و منقضی می‌کند.'}
                whyNeeded={isEn
                  ? 'Ensures contractors, temporary administrators, and external consultants do not maintain lingering access.'
                  : 'جلوگیری از دسترسی معلق و ماندگار پیمانکاران، مشاوران و حساب‌های موقت در سیستم.'}
                practicalExample={isEn ? 'chage -E 2026-10-31 user' : 'chage -E 2026-10-31 user'}
              />
            </div>

            {/* Presets */}
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {[
                { id: 'never', labelEn: 'Never (Permanent)', labelFa: 'همیشگی (بدون انقضا)' },
                { id: '30', labelEn: '30 Days', labelFa: '۳۰ روزه' },
                { id: '90', labelEn: '90 Days', labelFa: '۹۰ روزه' },
                { id: '180', labelEn: '180 Days', labelFa: '۶ ماهه' },
                { id: '365', labelEn: '1 Year', labelFa: '۱ ساله' },
                { id: 'custom', labelEn: 'Custom Date', labelFa: 'تاریخ دلخواه' },
              ].map((p) => {
                const active = expirePreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleExpirePresetChange(p.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                      active
                        ? 'bg-cyan-500 text-white shadow-sm'
                        : isLightMode
                        ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {isEn ? p.labelEn : p.labelFa}
                  </button>
                );
              })}
            </div>

            {expirePreset !== 'never' && (
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={expireDate}
                  onChange={(e) => {
                    setExpireDate(e.target.value);
                    setExpirePreset('custom');
                  }}
                  min={new Date().toISOString().split('T')[0]}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                />
                <span className="text-[11px] text-slate-400">
                  {expireDate ? (
                    isEn ? `Deactivates on ${expireDate}` : `در تاریخ ${expireDate} غیرفعال خواهد شد`
                  ) : (
                    isEn ? 'Select a valid expiration date' : 'تاریخ معتبر انتخاب کنید'
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Password Update & Force Change (Optional) */}
          <div className={`p-4 rounded-xl border space-y-3 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold">
                  {isEn ? 'Reset Password (Optional)' : 'تغییر یا بازنشانی رمز عبور (اختیاری)'}
                </span>
              </div>
              <span className="text-[10px] text-slate-400">
                {isEn ? 'Leave blank to keep existing password' : 'برای حفظ رمز فعلی خالی بگذارید'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-400">
                    {isEn ? 'New Password' : 'رمز عبور جدید'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[10px] text-slate-400 hover:text-cyan-400 flex items-center gap-1 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showPassword ? (isEn ? 'Hide' : 'مخفی') : (isEn ? 'Show' : 'نمایش')}</span>
                  </button>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={isEn ? 'Leave empty to keep' : 'خالی برای عدم تغییر'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  {isEn ? 'Confirm New Password' : 'تکرار رمز عبور جدید'}
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={isEn ? 'Re-enter to confirm' : 'تکرار برای تایید'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                />
              </div>
            </div>

            {/* Force Password Change Checkbox */}
            <div className={`p-2.5 rounded-lg border flex items-center justify-between ${
              isLightMode ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-500/10 border-amber-500/25'
            }`}>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={forcePasswordChange}
                  onChange={(e) => setForcePasswordChange(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-semibold">
                    {isEn ? 'Require user to change password on next login' : 'اجبار کاربر به تغییر رمز عبور در ورود بعدی'}
                  </span>
                </div>
              </label>
              <FieldInfoTooltip
                title={isEn ? 'Force Password Change' : 'اجبار تغییر رمز عبور'}
                whatIsIt={isEn
                  ? 'Sets shadow password age to zero (chage -d 0) requiring immediate user credential rotation.'
                  : 'عمر رمز عبور را با chage -d 0 صفر می‌کند تا کاربر در اولین اتصال آتی ناچار به تنظیم رمز جدید باشد.'}
                whyNeeded={isEn
                  ? 'Enforces personal credential confidentiality after administrative reset.'
                  : 'حفظ حریم خصوصی و امنیت اطلاعات پس از بازنشانی توسط مدیر سیستم.'}
                practicalExample={isEn ? 'sudo chage -d 0 username' : 'sudo chage -d 0 username'}
              />
            </div>
          </div>

          {/* Group Memberships */}
          <div className={`p-4 rounded-xl border ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold">
                  {isEn ? 'Supplementary Groups' : 'گروه‌های کاربری (Supplementary Groups)'}
                </span>
                <span className="text-[11px] text-cyan-400 font-mono">
                  ({selectedGroups.length})
                </span>
              </div>
              <FieldInfoTooltip
                title={isEn ? 'User Group Memberships' : 'عضویت در گروه‌ها'}
                whatIsIt={isEn ? 'Secondary system groups the user belongs to (e.g. sudo, wheel, docker, www-data).' : 'گروه‌های تکمیلی کاربر مانند sudo یا docker که مجوزهای سیستمی خاصی به او اعطا می‌کنند.'}
                whyNeeded={isEn ? 'Grants specific resource permissions, administrative privileges, or file access.' : 'اعطای سطح دسترسی مدیریتی یا دسترسی به پوشه‌ها و سرویس‌های خاص مانند داکر.'}
                practicalExample={isEn ? 'usermod -G sudo,docker alice' : 'usermod -G sudo,docker alice'}
              />
            </div>

            {/* Quick Filter & Quick Add */}
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={isEn ? 'Search groups...' : 'جستجوی گروه‌ها...'}
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  className={`w-full pl-8 pr-3 py-1.5 rounded-lg text-xs border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                />
              </div>

              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder={isEn ? 'New group...' : 'گروه جدید...'}
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className={`w-28 px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                />
                <button
                  type="button"
                  onClick={handleQuickAddGroup}
                  disabled={creatingGroup || !newGroupName.trim()}
                  className="px-2.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{creatingGroup ? '...' : (isEn ? 'Add' : 'افزودن')}</span>
                </button>
              </div>
            </div>

            {/* Groups Grid */}
            <div className="max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 rounded-lg border border-white/5 custom-scrollbar">
              {filteredGroups.map((g) => {
                const selected = selectedGroups.includes(g.name);
                return (
                  <button
                    key={g.name}
                    type="button"
                    onClick={() => toggleGroup(g.name)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition text-left cursor-pointer ${
                      selected
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                        : isLightMode
                        ? 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <span className="truncate">{g.name}</span>
                    {selected ? (
                      <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-1" />
                    ) : (
                      <span className="text-[10px] text-slate-400">GID {g.gid}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
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
              className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-2 disabled:opacity-50 shadow-md"
            >
              <UserCheck className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? (isEn ? 'Saving Changes...' : 'در حال ذخیره...') : (isEn ? 'Save User Changes' : 'ذخیره تغییرات کاربر')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
