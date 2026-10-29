import React, { useState, useMemo } from 'react';
import {
  Users,
  Key,
  Shield,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  FileCode2,
  UserPlus,
  ShieldCheck,
  UserCheck,
  Trash2,
  Plus,
  Sliders,
  ShieldAlert,
  Sparkles,
  X,
  BadgeAlert,
  Undo2,
} from 'lucide-react';
import { Device } from '../../types';
import { useLanguage } from '../../i18n';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { updateCiscoConfigTab } from '../../services/api';

export interface CiscoUsersTabProps {
  device: Device;
  initialConfig?: any;
  isPermitted: boolean;
  isLightMode?: boolean;
  onConfigApplied?: () => void;
}

export interface StagedUser {
  id: string;
  username: string;
  privilege: number;
  secret: string;
  secret_type: 'secret' | 'password';
}

export const CiscoUsersTab: React.FC<CiscoUsersTabProps> = ({
  device,
  initialConfig,
  isPermitted,
  isLightMode = false,
  onConfigApplied,
}) => {
  const { isEn } = useLanguage();

  const existingUsers = Array.isArray(initialConfig?.users) ? initialConfig.users : [];
  const enableSecretConfigured = Boolean(initialConfig?.enable_secret_configured);

  // Staged users to be provisioned on switch
  const [stagedUsers, setStagedUsers] = useState<StagedUser[]>([]);

  // Existing users marked for removal (no username ...)
  const [deletedUsers, setDeletedUsers] = useState<string[]>([]);

  // New User Form State
  const [username, setUsername] = useState('netadmin');
  const [privilege, setPrivilege] = useState<number>(15);
  const [secretType, setSecretType] = useState<'secret' | 'password'>('secret');
  const [secretPassword, setSecretPassword] = useState('');
  const [showSecretPassword, setShowSecretPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Enable Secret State
  const [enableSecret, setEnableSecret] = useState('');
  const [showEnableSecret, setShowEnableSecret] = useState(false);

  // Execution state
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{
    success: boolean;
    output?: string;
    error?: string;
  } | null>(null);

  // Helper description for selected privilege level
  const privilegeDescription = useMemo(() => {
    if (privilege === 15) {
      return {
        en: 'Level 15 (SuperAdmin / Root): Unrestricted exec authority, configuration terminal mode, system reload, and NVRAM storage.',
        fa: 'سطح ۱۵ (مدیر ارشد / دسترسی کامل): دسترسی نامحدود به کلیه دستورات اجرایی، مد پیکربندی، ریستارت و ذخیره‌سازی دائمی.',
        color: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
      };
    }
    if (privilege >= 10) {
      return {
        en: `Level ${privilege} (Senior Network Engineer): Elevated operational scope, advanced diagnostics, interface tweaks, and protocol audits.`,
        fa: `سطح ${privilege} (مهندس ارشد شبکه): اختیارات ارشد عملیاتی، خطایابی پیشرفته، تنظیمات واسط‌ها و بررسی پروتکل‌ها.`,
        color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
      };
    }
    if (privilege >= 7) {
      return {
        en: `Level ${privilege} (Port & Interface Operator): Interface toggling (shutdown/no shut), speed/duplex, and port statistics monitoring.`,
        fa: `سطح ${privilege} (اپراتور پورت و اینترفیس): مدیریت روشن/خاموش کردن پورت‌ها، تنظیمات سرعت و پایش آمار ارتباطی.`,
        color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
      };
    }
    if (privilege >= 2) {
      return {
        en: `Level ${privilege} (Intermediate Operator): Extended telemetry inspections and non-destructive show commands without write rights.`,
        fa: `سطح ${privilege} (اپراتور میانی): بررسی دستورات مشاهده‌ای و تلمتری بیشتر بدون مجوز اعمال تغییرات در تنظیمات.`,
        color: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
      };
    }
    if (privilege === 1) {
      return {
        en: 'Level 1 (User Exec / Read-Only): Basic ping, traceroute, and unprivileged show command outputs.',
        fa: 'سطح ۱ (کاربر عادی / مانیتورینگ): اجرای تست‌های پینگ، تریس‌روت و دستورات پایه‌ای show بدون دسترسی پیکربندی.',
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
      };
    }
    return {
      en: 'Level 0 (Minimal Exec): Initial restricted login shell with bare minimum commands (enable, exit, help).',
      fa: 'سطح ۰ (حداقلی): دسترسی بسیار محدود صرفاً جهت ورود اولیه، دستور enable و خروج.',
      color: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
    };
  }, [privilege]);

  // Live generated CLI commands preview
  const generatedCli = useMemo(() => {
    const lines: string[] = ['configure terminal'];

    // 1. Staged users
    if (stagedUsers.length > 0) {
      lines.push('! Local AAA User Provisioning (Queue)');
      for (const u of stagedUsers) {
        lines.push(`username ${u.username} privilege ${u.privilege} ${u.secret_type} ${u.secret}`);
      }
    }

    // 2. In-form single user if not yet staged into the list
    if (username.trim() && secretPassword.trim() && !stagedUsers.some((u) => u.username === username.trim())) {
      lines.push('! Local AAA User Provisioning (Current Form)');
      lines.push(`username ${username.trim()} privilege ${privilege} ${secretType} ${secretPassword.trim()}`);
    }

    // 3. Marked deletions
    if (deletedUsers.length > 0) {
      lines.push('! Remove Obsolete Users from Device');
      for (const du of deletedUsers) {
        lines.push(`no username ${du}`);
      }
    }

    // 4. Enable Secret
    if (enableSecret.trim()) {
      lines.push('! Global Device Root Privilege Password');
      lines.push(`enable secret ${enableSecret.trim()}`);
    }

    lines.push('line con 0');
    lines.push(' login local');
    lines.push('exit');
    lines.push('end');
    return lines.join('\n');
  }, [stagedUsers, username, secretPassword, privilege, secretType, deletedUsers, enableSecret]);

  // Handle adding a user to staged list
  const handleStageUser = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUser = username.trim();
    const cleanPass = secretPassword.trim();

    if (!cleanUser) {
      setFormError(isEn ? 'Please specify a valid username' : 'لطفاً نام کاربری معتبر وارد کنید');
      return;
    }

    if (!cleanPass) {
      setFormError(isEn ? 'Please enter a password for this user' : 'لطفاً رمز عبور کاربر را وارد کنید');
      return;
    }

    if (stagedUsers.some((u) => u.username.toLowerCase() === cleanUser.toLowerCase())) {
      setFormError(
        isEn
          ? `User "${cleanUser}" is already added to the provisioning queue`
          : `کاربر "${cleanUser}" قبلاً در صف اعمال اضافه شده است`
      );
      return;
    }

    setFormError(null);
    setStagedUsers((prev) => [
      ...prev,
      {
        id: `${cleanUser}-${Date.now()}`,
        username: cleanUser,
        privilege,
        secret: cleanPass,
        secret_type: secretType,
      },
    ]);

    // Clear form inputs for rapid multi-user addition
    setUsername('');
    setSecretPassword('');
  };

  // Remove a user from staged queue
  const handleRemoveStagedUser = (id: string) => {
    setStagedUsers((prev) => prev.filter((u) => u.id !== id));
  };

  // Toggle deletion marking for discovered users
  const handleToggleDeleteUser = (uName: string) => {
    if (deletedUsers.includes(uName)) {
      setDeletedUsers((prev) => prev.filter((name) => name !== uName));
    } else {
      setDeletedUsers((prev) => [...prev, uName]);
    }
  };

  // Handle Deploy CLI to switch
  const handleApply = async () => {
    if (!isPermitted || isApplying) return;

    // Collect all users to provision: staged + in-form if valid
    const finalUsers = [...stagedUsers];
    if (username.trim() && secretPassword.trim()) {
      const cleanUser = username.trim();
      if (!finalUsers.some((u) => u.username.toLowerCase() === cleanUser.toLowerCase())) {
        finalUsers.push({
          id: `inline-${Date.now()}`,
          username: cleanUser,
          privilege,
          secret: secretPassword.trim(),
          secret_type: secretType,
        });
      }
    }

    if (finalUsers.length === 0 && deletedUsers.length === 0 && !enableSecret.trim()) {
      setApplyResult({
        success: false,
        error: isEn
          ? 'Please enter user credentials with privilege level or set enable secret to apply.'
          : 'لطفاً حداقل یک کاربر با سطح دسترسی مشخص اضافه کنید یا رمز Enable را جهت اعمال وارد نمایید.',
      });
      return;
    }

    setIsApplying(true);
    setApplyResult(null);

    const payload = {
      users: finalUsers.map((u) => ({
        username: u.username,
        privilege: u.privilege,
        secret: u.secret,
        secret_type: u.secret_type,
      })),
      delete_users: deletedUsers,
      enable_secret: enableSecret.trim() || undefined,
    };

    try {
      const res = await updateCiscoConfigTab(device.id, 'users', payload);
      if (res.success) {
        setApplyResult({
          success: true,
          output:
            res.output ||
            (isEn
              ? 'Local users and credentials provisioned to switch successfully.'
              : 'کاربران محلی، سطوح دسترسی و تنظیمات امنیتی با موفقیت روی سخت‌افزار سوئیچ اعمال شدند.'),
        });
        setStagedUsers([]);
        setUsername('netadmin');
        setSecretPassword('');
        setDeletedUsers([]);
        setEnableSecret('');
        if (onConfigApplied) onConfigApplied();
      } else {
        setApplyResult({
          success: false,
          error: res.error || (isEn ? 'Failed to provision users on switch' : 'خطا در ثبت کاربران روی سوئیچ'),
        });
      }
    } catch (err: any) {
      setApplyResult({
        success: false,
        error:
          err?.message ||
          (isEn
            ? 'Communication error during user provisioning'
            : 'خطای ارتباطی هنگام ثبت اطلاعات کاربران روی سخت‌افزار'),
      });
    } finally {
      setIsApplying(false);
    }
  };

  // Reset Form
  const handleReset = () => {
    setUsername('netadmin');
    setPrivilege(15);
    setSecretType('secret');
    setSecretPassword('');
    setEnableSecret('');
    setStagedUsers([]);
    setDeletedUsers([]);
    setFormError(null);
    setApplyResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div
        className={`p-4 rounded-xl border flex items-center justify-between ${
          isLightMode
            ? 'bg-slate-100 border-slate-200 text-slate-800'
            : 'bg-slate-900/60 border-slate-800 text-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-xs sm:text-sm">
              {isEn ? 'Local AAA Database & Privilege Hierarchy' : 'کاربران محلی، سطوح دسترسی (Privilege) و رمز Enable'}
            </h4>
            <p className="text-xs opacity-75 mt-0.5">
              {isEn
                ? 'Provision local accounts with granular privilege levels (0-15) and secure cryptographic hashes on Cisco IOS hardware.'
                : 'تعریف و مدیریت کاربران سخت‌افزار با سطوح دسترسی دقیق (۰ تا ۱۵) و الگوریتم‌های هش امن در سوئیچ سیسکو.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold border flex items-center gap-1.5 ${
              enableSecretConfigured
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>
              {enableSecretConfigured
                ? isEn
                  ? 'Enable Secret Active'
                  : 'رمز Enable فعال'
                : isEn
                ? 'No Secret Set'
                : 'بدون رمز Enable'}
            </span>
          </span>
        </div>
      </div>

      {/* Grid: Existing Users & User Provisioning Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (5 Cols): Existing Local Users on Hardware */}
        <div
          className={`lg:col-span-5 p-5 rounded-2xl border space-y-4 shadow-xs flex flex-col justify-between ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-900/40 border-slate-800 text-slate-100'
          }`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h5 className="font-bold text-xs uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" />
                <span>{isEn ? 'Discovered Local Users on Switch' : 'کاربران محلی موجود روی سخت‌افزار'}</span>
              </h5>
              <FieldInfoTooltip
                title={isEn ? 'Discovered Switch Users' : 'کاربران فعال سوئیچ'}
                infoWhatEn="Authentic list of local administrative accounts extracted directly from the switch's running-config."
                infoWhatFa="فهرست کاربران احراز هویت محلی که مستقیماً از فایل پیکربندی فعال سوئیچ استخراج شده‌اند."
                infoWhyEn="Allows auditing active credentials, setting appropriate privilege tiers, or removing obsolete accounts."
                infoWhyFa="امکان بازرسی حساب‌های فعال، تفکیک سطوح دسترسی و حذف حساب‌های منقضی‌شده یا پیش‌فرض."
                infoExampleEn="username admin privilege 15 secret 9 ..."
                infoExampleFa="username admin privilege 15 secret 9 ..."
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
              {existingUsers.length === 0 ? (
                <div className="py-8 text-center text-xs opacity-60">
                  {isEn ? 'No local users discovered in show running-config' : 'هیچ کاربر محلی در فایل پیکربندی سوئیچ شناسایی نشد'}
                </div>
              ) : (
                existingUsers.map((u: any, idx: number) => {
                  const isMarkedDelete = deletedUsers.includes(u.username);
                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-3 rounded-xl border text-xs transition-all ${
                        isMarkedDelete
                          ? isLightMode
                            ? 'bg-rose-50 border-rose-300 opacity-70 line-through'
                            : 'bg-rose-950/30 border-rose-800/60 opacity-60 line-through'
                          : isLightMode
                          ? 'bg-slate-50 border-slate-200 text-slate-800'
                          : 'bg-slate-950/60 border-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 font-mono">
                        <UserPlus className={`w-4 h-4 ${isMarkedDelete ? 'text-rose-400' : 'text-cyan-400'}`} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm block">{u.username}</span>
                            {isMarkedDelete && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-500/20 text-rose-300 font-sans border border-rose-500/30">
                                {isEn ? 'Marked for Deletion' : 'حذف خواهد شد'}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] opacity-70">
                            {isEn
                              ? `Algorithm: ${u.secret_type || 'Encrypted'}`
                              : `نوع رمز: ${u.secret_type || 'هش‌شده'}`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold font-mono border ${
                            u.privilege === 15
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              : u.privilege >= 7
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          }`}
                        >
                          Priv {u.privilege ?? 1}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleToggleDeleteUser(u.username)}
                          disabled={!isPermitted}
                          title={
                            isMarkedDelete
                              ? isEn
                                ? 'Undo removal'
                                : 'لغو حذف کاربر'
                              : isEn
                              ? 'Remove this user from switch'
                              : 'حذف این کاربر از سوئیچ'
                          }
                          className={`p-1.5 rounded-lg border transition cursor-pointer ${
                            isMarkedDelete
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                          }`}
                        >
                          {isMarkedDelete ? <Undo2 className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Staged Users Queue (if any) */}
          {stagedUsers.length > 0 && (
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  {isEn ? `Staged Users (${stagedUsers.length})` : `کاربران آماده اعمال (${stagedUsers.length})`}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {isEn ? 'Pending switch push' : 'در صف اعمال'}
                </span>
              </div>

              <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                {stagedUsers.map((su) => (
                  <div
                    key={su.id}
                    className={`flex items-center justify-between p-2 rounded-lg border text-xs font-mono ${
                      isLightMode
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                        : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs">{su.username}</span>
                      <span className="text-[10px] opacity-75">
                        Priv {su.privilege} ({su.secret_type})
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveStagedUser(su.id)}
                      className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                      title={isEn ? 'Remove from queue' : 'حذف از صف اعمال'}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column (7 Cols): Add User with Granular Privileges & Form */}
        <div
          className={`lg:col-span-7 p-5 rounded-2xl border space-y-4 shadow-xs ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-900/40 border-slate-800 text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-2.5">
            <h5 className="font-bold text-xs uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
              <UserPlus className="w-4 h-4" />
              <span>{isEn ? 'Add User to Device with Granular Privileges' : 'افزودن کاربر به دیوایس با سطح دسترسی مشخص'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'Add Switch User' : 'تعریف کاربر سوئیچ'}
              infoWhatEn="Provisions local accounts with granular privilege levels (0 to 15) and cryptographic hashing on the switch."
              infoWhatFa="تعریف حساب‌های کاربری محلی با سطوح دسترسی تفکیک‌شده (۰ تا ۱۵) و الگوریتم‌های هش امن بر روی سوئیچ."
              infoWhyEn="Enforces Principle of Least Privilege (PoLP) and ensures out-of-band management access during network isolation."
              infoWhyFa="پیاده‌سازی اصل حداقل دسترسی و تضمین ورود امن ادمین‌ها و اپراتورها به تجهیز در سناریوهای اضطراری."
              infoExampleEn="username noc_user privilege 7 secret NOC@Pass2026!"
              infoExampleFa="username noc_user privilege 7 secret NOC@Pass2026!"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* Form error alert */}
          {formError && (
            <div className="p-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Username Input & Encryption Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold">
                  {isEn ? 'Username (username):' : 'نام کاربری (Username):'}
                </label>
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setFormError(null);
                }}
                disabled={!isPermitted}
                placeholder="e.g. netadmin, noc_operator"
                className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                    : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
                }`}
                dir="ltr"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold">
                  {isEn ? 'Encryption Method:' : 'نوع الگوریتم رمز:'}
                </label>
                <FieldInfoTooltip
                  title={isEn ? 'Credential Hashing' : 'رمزنگاری پسورد'}
                  infoWhatEn="'secret' employs modern one-way cryptographic hashes (SHA-256 / scrypt), whereas 'password' is Cisco reversible Type 7."
                  infoWhatFa="گزینه 'secret' از الگوریتم‌های هش یک‌طرفه امن (SHA-256) استفاده می‌کند در حالی که 'password' رمز ضعیف نوع ۷ است."
                  infoWhyEn="Industry security baselines forbid reversible Type 7 passwords in running-config to prevent offline cracking."
                  infoWhyFa="استانداردهای امنیتی استفاده از پسوردهای معکوس‌پذیر نوع ۷ را در پیکربندی تجهیزات ممنوع می‌دانند."
                  infoExampleEn="username admin privilege 15 secret StrongP@ssw0rd!"
                  infoExampleFa="username admin privilege 15 secret StrongP@ssw0rd!"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setSecretType('secret')}
                  className={`py-2 px-2 text-center rounded-xl border text-xs font-bold transition cursor-pointer ${
                    secretType === 'secret'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs'
                      : 'bg-slate-950/40 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {isEn ? 'secret (Secure Hash)' : 'secret (هش امن)'}
                </button>
                <button
                  type="button"
                  onClick={() => setSecretType('password')}
                  className={`py-2 px-2 text-center rounded-xl border text-xs font-bold transition cursor-pointer ${
                    secretType === 'password'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                      : 'bg-slate-950/40 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {isEn ? 'password (Type 7)' : 'password (نوع ۷)'}
                </button>
              </div>
            </div>
          </div>

          {/* Privilege Level Selector (0 to 15) */}
          <div className="space-y-2 p-3.5 rounded-xl border border-slate-800/80 bg-slate-950/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <label className="text-xs font-semibold">
                  {isEn ? 'Privilege Level Scope (0 - 15):' : 'سطح دسترسی کاربری در سیسکو (Privilege 0 - 15):'}
                </label>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-cyan-400 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30">
                  Level {privilege}
                </span>
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={privilege}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      setPrivilege(Math.max(0, Math.min(15, val)));
                    }
                  }}
                  disabled={!isPermitted}
                  className={`w-14 text-center py-0.5 px-1 rounded-md text-xs font-mono font-bold border ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-slate-900 border-slate-700 text-cyan-300'
                  }`}
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { level: 15, labelEn: '15 (SuperAdmin)', labelFa: '۱۵ (مدیر ارشد)' },
                { level: 10, labelEn: '10 (Engineer)', labelFa: '۱۰ (مهندس شبکه)' },
                { level: 7, labelEn: '7 (Port Admin)', labelFa: '۷ (اپراتور پورت)' },
                { level: 1, labelEn: '1 (Monitor)', labelFa: '۱ (مشاهده وضعیت)' },
              ].map((p) => (
                <button
                  key={p.level}
                  type="button"
                  onClick={() => setPrivilege(p.level)}
                  disabled={!isPermitted}
                  className={`py-1.5 px-1 text-center rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                    privilege === p.level
                      ? isLightMode
                        ? 'bg-cyan-600 text-white border-cyan-600 shadow-xs'
                        : 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {isEn ? p.labelEn : p.labelFa}
                </button>
              ))}
            </div>

            {/* Granular Slider Range */}
            <div className="pt-1 flex items-center gap-3">
              <span className="text-[10px] font-mono text-slate-500">0</span>
              <input
                type="range"
                min="0"
                max="15"
                step="1"
                value={privilege}
                onChange={(e) => setPrivilege(parseInt(e.target.value, 10))}
                disabled={!isPermitted}
                className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
              <span className="text-[10px] font-mono text-slate-500">15</span>
            </div>

            {/* Privilege Level Description Badge */}
            <div className={`p-2 rounded-lg border text-[11px] leading-relaxed ${privilegeDescription.color}`}>
              {isEn ? privilegeDescription.en : privilegeDescription.fa}
            </div>
          </div>

          {/* User Secret Password */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              {isEn ? 'User Secret Password (secret):' : 'رمز عبور کاربر (secret):'}
            </label>
            <div className="relative">
              <input
                type={showSecretPassword ? 'text' : 'password'}
                value={secretPassword}
                onChange={(e) => {
                  setSecretPassword(e.target.value);
                  setFormError(null);
                }}
                disabled={!isPermitted}
                placeholder={isEn ? 'Enter strong secret password' : 'رمز عبور قوی وارد نمایید'}
                className={`w-full px-3 py-2 pr-10 rtl:pl-10 rtl:pr-3 rounded-xl text-xs border font-mono ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                    : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
                }`}
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowSecretPassword(!showSecretPassword)}
                className="absolute right-2.5 rtl:right-auto rtl:left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              >
                {showSecretPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Add User to List Button */}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => handleStageUser()}
              disabled={!isPermitted}
              className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-2 transition cursor-pointer active:scale-95 ${
                isLightMode
                  ? 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border-cyan-300'
                  : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>{isEn ? '+ Add User to Device Queue' : '+ افزودن کاربر به لیست اعمال دیوایس'}</span>
            </button>
          </div>

          {/* Enable Secret Input */}
          <div className="pt-3 border-t border-slate-800">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>{isEn ? 'Global Switch Enable Secret (enable secret):' : 'رمز عبور حالت مدیریت سوئیچ (enable secret):'}</span>
              </label>
              <FieldInfoTooltip
                title={isEn ? 'Switch Enable Secret' : 'رمز عبور Enable'}
                infoWhatEn="Global cryptographic password protecting the 'enable' privileged exec mode from console or SSH sessions."
                infoWhatFa="رمز عبور سراسری و رمزنگاری‌شده جهت محافظت از ورود به حالت دسترسی مدیریتی (enable) در خطوط کنسول و SSH."
                infoWhyEn="Guarantees authorization before allowing engineers to inspect running-configs or execute configuration terminal."
                infoWhyFa="تضمین احراز هویت تکمیلی قبل از مجاز شدن کاربر برای مشاهده تنظیمات فعال یا ورود به مد پیکربندی."
                infoExampleEn="enable secret StrongAdmin#Pass99"
                infoExampleFa="enable secret StrongAdmin#Pass99"
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>
            <div className="relative">
              <input
                type={showEnableSecret ? 'text' : 'password'}
                value={enableSecret}
                onChange={(e) => setEnableSecret(e.target.value)}
                disabled={!isPermitted}
                placeholder={isEn ? 'Enter enable secret password (leave blank to keep current)' : 'رمز ورود به حالت enable را وارد کنید (جهت حفظ رمز قبلی خالی بگذارید)'}
                className={`w-full px-3 py-2 pr-10 rtl:pl-10 rtl:pr-3 rounded-xl text-xs border font-mono ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                    : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
                }`}
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowEnableSecret(!showEnableSecret)}
                className="absolute right-2.5 rtl:right-auto rtl:left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              >
                {showEnableSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Live Generated Cisco CLI Preview */}
      <div
        className={`p-4 rounded-2xl border shadow-inner ${
          isLightMode ? 'bg-slate-900 text-slate-100 border-slate-700' : 'bg-black/80 text-emerald-400 border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
            <FileCode2 className="w-4 h-4 text-cyan-400" />
            <span>{isEn ? 'Generated Cisco IOS CLI Commands Preview:' : 'پیش‌نمایش زنده دستورات ارسالی به سوئیچ:'}</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            {'conf t -> username [priv] [secret] -> enable secret -> end'}
          </span>
        </div>
        <pre
          className="text-xs font-mono p-3 rounded-xl bg-slate-950/70 border border-white/10 overflow-x-auto custom-scrollbar leading-relaxed"
          dir="ltr"
        >
          {generatedCli}
        </pre>
      </div>

      {/* Execution Feedback Banner */}
      {applyResult && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
            applyResult.success
              ? isLightMode
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
              : isLightMode
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
          }`}
        >
          {applyResult.success ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <h5 className="font-bold text-xs">
              {applyResult.success
                ? isEn
                  ? 'Configuration Deployed to Switch Successfully'
                  : 'پیکربندی با موفقیت روی سخت‌افزار سوئیچ اعمال شد'
                : isEn
                ? 'Deployment Error'
                : 'خطا در اعمال پیکربندی'}
            </h5>
            <p className="text-xs mt-1 font-mono opacity-90 break-words" dir="ltr">
              {applyResult.output || applyResult.error}
            </p>
          </div>
        </div>
      )}

      {/* Action Footer Buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
        <button
          type="button"
          onClick={handleReset}
          disabled={isApplying}
          className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition cursor-pointer active:scale-95 ${
            isLightMode
              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{isEn ? 'Reset to Current' : 'بازنشانی به مقادیر جاری'}</span>
        </button>

        <button
          type="button"
          onClick={handleApply}
          disabled={!isPermitted || isApplying}
          className={`px-6 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
            isLightMode
              ? 'bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white shadow-cyan-600/30'
              : 'bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-black shadow-[0_0_20px_rgba(6,182,212,0.4)]'
          }`}
        >
          <Play className={`w-4 h-4 ${isApplying ? 'animate-spin' : ''}`} />
          <span>
            {isApplying
              ? isEn
                ? 'Deploying Credentials to Switch...'
                : 'در حال اعمال کاربران بر روی سوئیچ...'
              : isEn
              ? 'Apply Configuration to Switch'
              : 'اعمال پیکربندی روی سخت‌افزار سوئیچ'}
          </span>
        </button>
      </div>
    </div>
  );
};
