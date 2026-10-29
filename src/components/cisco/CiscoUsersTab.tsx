import React, { useState, useEffect, useMemo } from 'react';
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

  // New User Form State
  const [username, setUsername] = useState('netadmin');
  const [privilege, setPrivilege] = useState<number>(15);
  const [secretPassword, setSecretPassword] = useState('');
  const [showSecretPassword, setShowSecretPassword] = useState(false);

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

  // Live generated CLI commands preview
  const generatedCli = useMemo(() => {
    const lines: string[] = ['configure terminal'];
    if (username.trim() && secretPassword.trim()) {
      lines.push(`username ${username.trim()} privilege ${privilege} secret ${secretPassword.trim()}`);
    }
    if (enableSecret.trim()) {
      lines.push(`enable secret ${enableSecret.trim()}`);
    }
    lines.push('line con 0');
    lines.push(' login local');
    lines.push('exit');
    lines.push('end');
    return lines.join('\n');
  }, [username, privilege, secretPassword, enableSecret]);

  // Handle Deploy CLI to switch
  const handleApply = async () => {
    if (!isPermitted || isApplying) return;
    if (!secretPassword.trim() && !enableSecret.trim()) {
      setApplyResult({
        success: false,
        error: isEn
          ? 'Please enter a user secret password or enable secret to apply.'
          : 'لطفاً رمز عبور کاربر محلی یا رمز عبور Enable Secret را جهت اعمال وارد کنید.',
      });
      return;
    }

    setIsApplying(true);
    setApplyResult(null);

    const payload = {
      username: username.trim() || undefined,
      privilege: privilege,
      secret: secretPassword.trim() || undefined,
      enable_secret: enableSecret.trim() || undefined,
    };

    try {
      const res = await updateCiscoConfigTab(device.id, 'users', payload);
      if (res.success) {
        setApplyResult({
          success: true,
          output: res.output || (isEn ? 'Local user and enable secret provisioned successfully.' : 'کاربر محلی و رمز عبور Enable با موفقیت در سوئیچ ایجاد و تنظیم گردید.'),
        });
        setSecretPassword('');
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
        error: err?.message || (isEn ? 'Communication error during user provisioning' : 'خطای ارتباطی هنگام ثبت اطلاعات کاربران'),
      });
    } finally {
      setIsApplying(false);
    }
  };

  // Reset Form
  const handleReset = () => {
    setUsername('netadmin');
    setPrivilege(15);
    setSecretPassword('');
    setEnableSecret('');
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
                ? 'Provision cryptographic local credentials (algorithm type 5/8/9) and secure root enable secret.'
                : 'مدیریت حساب‌های محلی سخت‌افزار با الگوریتم‌های هش مدرن و تعیین رمز دسترسی به حالت مدیریت سوئیچ.'}
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
            <span>{enableSecretConfigured ? (isEn ? 'Enable Secret Active' : 'رمز Enable فعال') : (isEn ? 'No Secret Set' : 'بدون رمز Enable')}</span>
          </span>
        </div>
      </div>

      {/* Grid: Existing Users & New User Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left Column: Existing Local Users on Hardware */}
        <div
          className={`p-5 rounded-2xl border space-y-4 shadow-xs ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-900/40 border-slate-800 text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-2.5">
            <h5 className="font-bold text-xs uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4" />
              <span>{isEn ? 'Discovered Local Users on Switch' : 'کاربران محلی موجود روی سخت‌افزار'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'Discovered Switch Users' : 'کاربران فعال سوئیچ'}
              infoWhatEn="Authentic list of local administrative accounts extracted directly from the switch's running-config."
              infoWhatFa="فهرست کاربران احراز هویت محلی که مستقیماً از فایل پیکربندی فعال سوئیچ استخراج شده‌اند."
              infoWhyEn="Verifying existing accounts helps eliminate leftover vendor default passwords (e.g. cisco/cisco)."
              infoWhyFa="بررسی و پالایش کاربران محلی جهت حذف نام‌های کاربری پیش‌فرض و ناامن کارخانه‌ای."
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
              existingUsers.map((u: any, idx: number) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-3 rounded-xl border text-xs ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-800'
                      : 'bg-slate-950/60 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 font-mono">
                    <UserPlus className="w-4 h-4 text-cyan-400" />
                    <div>
                      <span className="font-bold text-sm block">{u.username}</span>
                      <span className="text-[10px] opacity-70">
                        {isEn ? `Algorithm Type: ${u.secret_type || 'Encrypted'}` : `الگوریتم رمزنگاری: ${u.secret_type || 'هش‌شده'}`}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold font-mono border ${
                      u.privilege === 15
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    }`}
                  >
                    Privilege {u.privilege}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Provision / Update User & Enable Secret Form */}
        <div
          className={`p-5 rounded-2xl border space-y-4 shadow-xs ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-900/40 border-slate-800 text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-2.5">
            <h5 className="font-bold text-xs uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
              <Key className="w-4 h-4" />
              <span>{isEn ? 'Provision User & Enable Secret' : 'تعریف کاربر محلی و رمز عبور Enable'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'Privilege Levels & Enable Secret' : 'سطوح دسترسی Privilege و Enable Secret'}
              infoWhatEn="Privilege 15 grants unrestricted root exec access. Enable secret protects entering 'enable' mode from console/VTY."
              infoWhatFa="سطح دسترسی ۱۵ بالاترین سطح ادمین است. رمز Enable Secret از ورود به حالت پیکربندی محافظت می‌کند."
              infoWhyEn="Without an enable secret or privilege 15 user, administrative commands cannot be executed over SSH."
              infoWhyFa="بدون تعیین رمز Enable یا کاربر با سطح دسترسی ۱۵، اجرای دستورات پیکربندی از طریق SSH امکان‌پذیر نخواهد بود."
              infoExampleEn="username netadmin privilege 15 secret P@ssw0rd99, enable secret Root#Secret"
              infoExampleFa="username netadmin privilege 15 secret P@ssw0rd99, enable secret Root#Secret"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* Username Input */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              {isEn ? 'Username (username):' : 'نام کاربری (Username):'}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={!isPermitted}
              placeholder="e.g. netadmin"
              className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              }`}
              dir="ltr"
            />
          </div>

          {/* Privilege Level Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold">
                {isEn ? 'Privilege Level (1 - 15):' : 'سطح دسترسی کاربری (Privilege):'}
              </label>
              <span className="text-xs font-mono font-bold text-cyan-400">
                Level {privilege}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { level: 15, label: '15 (SuperAdmin)', labelFa: '۱۵ (دسترسی کامل)' },
                { level: 7, label: '7 (Operator)', labelFa: '۷ (اپراتور پورت)' },
                { level: 1, label: '1 (User Monitor)', labelFa: '۱ (فقط مانیتورینگ)' },
              ].map((p) => (
                <button
                  key={p.level}
                  type="button"
                  onClick={() => setPrivilege(p.level)}
                  disabled={!isPermitted}
                  className={`py-2 px-1 text-center rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    privilege === p.level
                      ? isLightMode
                        ? 'bg-cyan-600 text-white border-cyan-600 shadow-xs'
                        : 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {isEn ? p.label : p.labelFa}
                </button>
              ))}
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
                onChange={(e) => setSecretPassword(e.target.value)}
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

          {/* Enable Secret Input */}
          <div className="pt-2 border-t border-slate-800">
            <label className="block text-xs font-semibold mb-1 flex items-center justify-between">
              <span>{isEn ? 'Global Switch Enable Secret (enable secret):' : 'رمز عبور حالت مدیریت سوئیچ (enable secret):'}</span>
            </label>
            <div className="relative">
              <input
                type={showEnableSecret ? 'text' : 'password'}
                value={enableSecret}
                onChange={(e) => setEnableSecret(e.target.value)}
                disabled={!isPermitted}
                placeholder={isEn ? 'Enter enable secret password' : 'رمز ورود به حالت enable را وارد کنید'}
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
          isLightMode
            ? 'bg-slate-900 text-slate-100 border-slate-700'
            : 'bg-black/80 text-emerald-400 border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
            <FileCode2 className="w-4 h-4 text-cyan-400" />
            <span>{isEn ? 'Generated Cisco IOS CLI Commands Preview:' : 'پیش‌نمایش زنده دستورات ارسالی به سوئیچ:'}</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">{'conf t -> username -> enable secret -> end'}</span>
        </div>
        <pre className="text-xs font-mono p-3 rounded-xl bg-slate-950/70 border border-white/10 overflow-x-auto custom-scrollbar leading-relaxed" dir="ltr">
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
