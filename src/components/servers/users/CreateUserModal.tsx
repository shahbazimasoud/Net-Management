import React, { useState, useMemo } from 'react';
import {
  UserPlus,
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
} from 'lucide-react';
import { RemoteServer, LinuxSystemGroup } from '../../../types';
import { createLinuxUser, createLinuxGroup } from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface CreateUserModalProps {
  server: RemoteServer;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
  systemGroups: LinuxSystemGroup[];
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateUserModal: React.FC<CreateUserModalProps> = ({
  server,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
  systemGroups,
  onClose,
  onSuccess,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [comment, setComment] = useState('');
  const [homeDir, setHomeDir] = useState('');
  const [createHome, setCreateHome] = useState(true);
  const [shell, setShell] = useState('/bin/bash');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [expirePreset, setExpirePreset] = useState<'never' | '30' | '90' | '180' | '365' | 'custom'>('never');
  const [expireDate, setExpireDate] = useState('');

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

  // Group selector filter & quick add
  const [groupFilter, setGroupFilter] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [availableGroups, setAvailableGroups] = useState<LinuxSystemGroup[]>(systemGroups);

  // Auto-sync default home directory as username changes
  const handleUsernameChange = (val: string) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    setUsername(clean);
    if (!homeDir || homeDir.startsWith('/home/')) {
      setHomeDir(clean ? `/home/${clean}` : '');
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
        const newGroupObj: LinuxSystemGroup = { name: clean, gid: 0, members: [] };
        setAvailableGroups([...availableGroups, newGroupObj]);
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
    if (!username.trim()) {
      setError(isEn ? 'Username is required' : 'نام کاربری الزامی است');
      return;
    }

    if (password && password !== confirmPassword) {
      setError(isEn ? 'Passwords do not match' : 'رمز عبور و تکرار آن یکسان نیستند');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await createLinuxUser(
        server.id,
        {
          username: username.trim(),
          password: password ? password : undefined,
          comment: comment.trim() || undefined,
          homeDir: homeDir.trim() || undefined,
          shell: shell.trim() || undefined,
          groups: selectedGroups,
          createHome,
          expireDate: expireDate.trim() || undefined,
          forcePasswordChange,
        },
        ephemeralPassword
      );

      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.error || (isEn ? 'Failed to create user' : 'خطا در ساخت کاربر'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error creating user' : 'خطای شبکه در ساخت کاربر'));
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
            : 'w-full max-w-2xl max-h-[90vh] rounded-2xl'
        } ${isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'}`}
      >
        {/* Header with Mandatory 3 Controls */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-slate-100/80 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold">{isEn ? 'Create New System User' : 'ایجاد کاربر جدید لینوکس'}</h3>
                <FieldInfoTooltip
                  title={isEn ? 'Linux User Creation' : 'ساخت کاربر در لینوکس'}
                  infoWhatEn="Executes useradd with home directory creation, default shell assignment, and initial supplementary group permissions."
                  infoWhatFa="اجرای دستور استاندارد useradd برای ایجاد حساب، دایرکتوری خانگی، شل ورود و اعطای گروه‌های تکمیلی."
                  infoWhyEn="Enables adding distinct operational accounts for administrators, developers, or service daemons with least-privilege principles."
                  infoWhyFa="برای تفکیک دسترسی توسعه‌دهندگان و سرویس‌ها بدون نیاز به استفاده مستقیم و ناامن از اکانت root."
                  infoExampleEn="useradd -m -s /bin/bash -G sudo,docker developer"
                  infoExampleFa="useradd -m -s /bin/bash -G sudo,docker developer"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                {server.name || server.ip} ({server.hostname || 'Linux'})
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
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

          {/* Account Credentials */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold block mb-1.5 flex items-center gap-1.5">
                <span>{isEn ? 'Username' : 'نام کاربری'}</span>
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. dev_admin"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900'
                    : 'bg-slate-900 border-slate-700 text-slate-100'
                }`}
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                {isEn ? 'Lowercase letters, digits, dashes or underscores (max 32).' : 'حروف کوچک انگلیسی، اعداد، خط فاصله یا زیرخط.'}
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1.5">
                {isEn ? 'Full Name / Description' : 'نام کامل / توضیحات حساب'}
              </label>
              <input
                type="text"
                placeholder={isEn ? 'e.g. DevOps Engineer' : 'مثال: مهندس شبکه'}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg text-xs border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900'
                    : 'bg-slate-900 border-slate-700 text-slate-100'
                }`}
              />
            </div>
          </div>

          {/* Password fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isEn ? 'Password' : 'رمز عبور'}</span>
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
                placeholder={isEn ? 'Enter password (optional)' : 'رمز عبور کاربر (اختیاری)'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900'
                    : 'bg-slate-900 border-slate-700 text-slate-100'
                }`}
              />
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1.5">
                {isEn ? 'Confirm Password' : 'تکرار رمز عبور'}
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={isEn ? 'Re-enter password' : 'تکرار رمز عبور'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900'
                    : 'bg-slate-900 border-slate-700 text-slate-100'
                }`}
              />
            </div>
          </div>

          {/* Force password change on first login */}
          {password && (
            <div className={`p-3 rounded-xl border flex items-center justify-between ${
              isLightMode ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-500/10 border-amber-500/30'
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
                    {isEn ? 'Require password change upon first login' : 'اجبار کاربر به تغییر رمز عبور در اولین لاگین'}
                  </span>
                </div>
              </label>
              <FieldInfoTooltip
                title={isEn ? 'Force Password Change' : 'اجبار تغییر رمز عبور'}
                whatIsIt={isEn
                  ? 'Expires the user password immediately so they must set their own new password upon initial login.'
                  : 'عمر رمز عبور را به صفر می‌رساند تا کاربر در اولین اتصال از طریق SSH یا ترمینال، ملزم به تعیین رمز جدید شود.'}
                whyNeeded={isEn
                  ? 'Key security baseline practice preventing administrators or provisioners from permanently knowing the user private credentials.'
                  : 'الزام امنیتی استانداردی است که از دسترسی دائمی مدیران سرور به رمز عبور شخصی کاربر جلوگیری می‌کند.'}
                practicalExample={isEn
                  ? 'Executes chage -d 0 username upon user creation.'
                  : 'دستور chage -d 0 username را روی کاربر اعمال می‌کند.'}
              />
            </div>
          )}

          {/* Account Expiration Date */}
          <div className={`p-3.5 rounded-xl border ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs font-semibold">
                  {isEn ? 'Account Expiration Date' : 'تاریخ انقضای حساب کاربری (Expire Date)'}
                </span>
              </div>
              <FieldInfoTooltip
                title={isEn ? 'User Account Expiration' : 'تاریخ انقضای کاربر'}
                whatIsIt={isEn
                  ? 'Sets an explicit expiration date for this Linux user account in /etc/shadow using useradd -e YYYY-MM-DD.'
                  : 'یک تاریخ انقضای مشخص در فایل /etc/shadow از طریق سوئیچ useradd -e YYYY-MM-DD روی حساب کاربر تنظیم می‌کند.'}
                whyNeeded={isEn
                  ? 'Crucial for temporary contractors, time-limited projects, or temporary access grants that must automatically deactivate.'
                  : 'برای حساب‌های پیمانکاران، پروژه‌های موقت یا دسترسی‌های زمان‌دار ضروری است تا حساب پس از موعد به طور خودکار غیرفعال شود.'}
                practicalExample={isEn
                  ? 'Set to 90 Days or specific date e.g. 2026-12-31.'
                  : 'تنظیم روی ۳۰ روز یا تاریخ معین مانند ۲۰۲۶-۱۲-۳۱.'}
              />
            </div>

            {/* Presets */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
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
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                />
                <span className="text-[11px] text-slate-400">
                  {expireDate ? (
                    isEn ? `Account will deactivate on ${expireDate}` : `حساب در تاریخ ${expireDate} منقضی خواهد شد`
                  ) : (
                    isEn ? 'Select an expiration date' : 'تاریخ انقضا را انتخاب کنید'
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Directory & Shell */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold block mb-1.5 flex items-center gap-1">
                <Folder className="w-3.5 h-3.5 text-amber-400" />
                <span>{isEn ? 'Home Directory' : 'پوشه خانگی (Home Directory)'}</span>
              </label>
              <input
                type="text"
                placeholder="/home/username"
                value={homeDir}
                onChange={(e) => setHomeDir(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900'
                    : 'bg-slate-900 border-slate-700 text-slate-100'
                }`}
              />
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createHome}
                  onChange={(e) => setCreateHome(e.target.checked)}
                  className="rounded text-cyan-500 focus:ring-cyan-500"
                />
                <span className="text-[11px] text-slate-400">
                  {isEn ? 'Create home directory (-m)' : 'ساخت خودکار دایرکتوری در صورت عدم وجود (-m)'}
                </span>
              </label>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1.5 flex items-center gap-1">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isEn ? 'Login Shell' : 'شل لاگین (Login Shell)'}</span>
              </label>
              <select
                value={shell}
                onChange={(e) => setShell(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900'
                    : 'bg-slate-900 border-slate-700 text-slate-100'
                }`}
              >
                <option value="/bin/bash">/bin/bash (Default)</option>
                <option value="/bin/sh">/bin/sh</option>
                <option value="/bin/zsh">/bin/zsh</option>
                <option value="/usr/bin/zsh">/usr/bin/zsh</option>
                <option value="/usr/sbin/nologin">/usr/sbin/nologin (No interactive login)</option>
                <option value="/bin/false">/bin/false (Disabled)</option>
              </select>
            </div>
          </div>

          {/* Group Memberships Section */}
          <div
            className={`p-4 rounded-xl border space-y-3 ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold">
                  {isEn ? 'Assign Groups & Privileges' : 'تخصیص گروه‌ها و دسترسی‌های سیستم'}
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-mono">
                  {selectedGroups.length} {isEn ? 'selected' : 'انتخاب شده'}
                </span>
              </div>

              {/* Group quick search */}
              <div className="relative w-full sm:w-48">
                <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={isEn ? 'Filter groups...' : 'فیلتر گروه‌ها...'}
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  className={`w-full pl-7 pr-2.5 py-1 rounded-lg text-[11px] font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                />
              </div>
            </div>

            {/* Quick Sudo / Wheel Toggle */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <button
                type="button"
                onClick={() => {
                  const targetGrp = availableGroups.some((g) => g.name === 'wheel') ? 'wheel' : 'sudo';
                  toggleGroup(targetGrp);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                  selectedGroups.includes('sudo') || selectedGroups.includes('wheel')
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                    : isLightMode
                    ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-rose-400" />
                <span>{isEn ? 'Grant Sudo / Root Access' : 'اعطای دسترسی سودو (Sudo/Wheel)'}</span>
                {(selectedGroups.includes('sudo') || selectedGroups.includes('wheel')) && (
                  <Check className="w-3 h-3 text-rose-400" />
                )}
              </button>

              {availableGroups.some((g) => g.name === 'docker') && (
                <button
                  type="button"
                  onClick={() => toggleGroup('docker')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                    selectedGroups.includes('docker')
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                      : isLightMode
                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span>docker</span>
                  {selectedGroups.includes('docker') && <Check className="w-3 h-3 text-cyan-400" />}
                </button>
              )}
            </div>

            {/* Groups Grid */}
            <div className="max-h-36 overflow-y-auto p-2 rounded-lg border border-white/5 flex flex-wrap gap-1.5">
              {filteredGroups.map((g) => {
                const isSelected = selectedGroups.includes(g.name);
                return (
                  <button
                    key={g.name}
                    type="button"
                    onClick={() => toggleGroup(g.name)}
                    className={`px-2 py-1 rounded text-xs font-mono border transition cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400 shadow-sm'
                        : isLightMode
                        ? 'bg-white text-slate-700 border-slate-300 hover:border-cyan-400'
                        : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <span>{g.name}</span>
                    {isSelected && <Check className="w-3 h-3 text-slate-950 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Inline Quick Add Group */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                placeholder={isEn ? 'Create and add new group...' : 'نام گروه جدید برای ایجاد...'}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className={`flex-1 px-2.5 py-1 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                  isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-slate-100'
                }`}
              />
              <button
                type="button"
                disabled={creatingGroup || !newGroupName.trim()}
                onClick={handleQuickAddGroup}
                className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{creatingGroup ? (isEn ? 'Adding...' : 'در حال افزودن...') : (isEn ? 'Add Group' : 'افزودن گروه')}</span>
              </button>
            </div>
          </div>

          {/* Footer Submit */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
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
              disabled={loading || !username.trim()}
              className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-2 disabled:opacity-50 shadow-md"
            >
              <UserPlus className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? (isEn ? 'Creating User...' : 'در حال ایجاد...') : (isEn ? 'Create User' : 'ایجاد کاربر')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
