import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  Lock,
  Mail,
  Moon,
  Phone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  User,
  UserCog,
} from 'lucide-react';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import {
  TotpEnrollmentPayload,
  TrustedDeviceEntry,
  TwoFactorMethod,
  UserEmailNotifyPrefs,
  UserNotifyChannelPrefs,
  UserQuietHours,
  UserSecurityProfile,
} from '../../types';
import {
  beginTotpSetup,
  changeOwnPassword,
  fetchUserSecurityProfile,
  regenerateBackupCodes,
  revokeAllTrustedDevices,
  revokeSingleTrustedDevice,
  updateTwoFactorPreference,
  updateUserSecurityProfile,
  verifyTotpSetup,
} from '../../services/profileApi';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { HelpdeskNotificationSettingsCard } from '../settings/HelpdeskNotificationSettingsCard';

interface UserProfileSecurityViewProps {
  isLightMode?: boolean;
  onNavigateToCommunications?: () => void;
  initialSubTab?: ProfileSubTab | null;
  onConsumeInitialSubTab?: () => void;
}

export type ProfileSubTab = 'profile' | 'security' | 'devices' | 'notifications';

const COMMON_TIMEZONES = [
  'Asia/Tehran',
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dubai',
  'America/New_York',
];

function summarizeUserAgent(ua?: string | null, isEn = true): string {
  if (!ua || !ua.trim()) return isEn ? 'Unknown Browser / Device' : 'مرورگر / دستگاه نامشخص';
  const browser = /Edg\//i.test(ua)
    ? 'Microsoft Edge'
    : /Chrome\//i.test(ua) && !/Chromium/i.test(ua)
    ? 'Google Chrome'
    : /Firefox\//i.test(ua)
    ? 'Mozilla Firefox'
    : /Safari\//i.test(ua) && !/Chrome\//i.test(ua)
    ? 'Apple Safari'
    : 'HTTP Client';
  const os = /Windows/i.test(ua)
    ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua)
    ? 'macOS'
    : /Linux/i.test(ua)
    ? 'Linux'
    : /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad/i.test(ua)
    ? 'iOS'
    : 'OS';
  return `${browser} · ${os}`;
}

export const UserProfileSecurityView: React.FC<UserProfileSecurityViewProps> = ({
  isLightMode = false,
  onNavigateToCommunications,
  initialSubTab = null,
  onConsumeInitialSubTab,
}) => {
  const { isEn, isRtl } = useLanguage();
  const { user } = useAuth();

  const [subTab, setSubTab] = useState<ProfileSubTab>(initialSubTab || 'profile');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserSecurityProfile | null>(null);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDeviceEntry[]>([]);

  // Editable Profile Metadata
  const [displayTitle, setDisplayTitle] = useState<string>('');
  const [phoneExt, setPhoneExt] = useState<string>('');

  // Editable Notification Preferences, Email Forwarding & Quiet Hours
  const [notifyChannels, setNotifyChannels] = useState<UserNotifyChannelPrefs>({
    system_alert: true,
    security_2fa: true,
    direct_message: true,
    channel_message: true,
    announcement: true,
    approval_request: true,
    desktop_sound: true,
  });
  const [emailChannels, setEmailChannels] = useState<UserEmailNotifyPrefs>({
    system_alert: true,
    security_2fa: true,
    direct_message: true,
    channel_message: true,
    announcement: true,
    approval_request: true,
  });
  const [quietHours, setQuietHours] = useState<UserQuietHours>({
    enabled: false,
    startHour: '22:00',
    endHour: '07:00',
    timezone: 'Asia/Tehran',
  });

  // Self-Service Password Change (Local Users)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // TOTP Enrollment Flow
  const [totpEnrollment, setTotpEnrollment] = useState<TotpEnrollmentPayload | null>(null);
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [totpBusy, setTotpBusy] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Backup Codes Modal (One-time display)
  const [backupCodesModalOpen, setBackupCodesModalOpen] = useState(false);
  const [backupCodesModalMinimized, setBackupCodesModalMinimized] = useState(false);
  const [backupCodesModalMaximized, setBackupCodesModalMaximized] = useState(false);
  const [generatedBackupCodes, setGeneratedBackupCodes] = useState<string[]>([]);
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);

  // Verification / Confirmation Dialog (for disabling TOTP, regenerating backup codes, or revoking trusted devices)
  const [securityPrompt, setSecurityPrompt] = useState<{
    kind: 'disable_totp' | 'switch_to_email' | 'regen_backup' | 'revoke_one' | 'revoke_all';
    deviceId?: string;
    deviceLabel?: string;
  } | null>(null);
  const [securityPromptInput, setSecurityPromptInput] = useState('');
  const [securityPromptMinimized, setSecurityPromptMinimized] = useState(false);
  const [securityPromptMaximized, setSecurityPromptMaximized] = useState(false);

  const clearAlerts = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const loadProfileData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchUserSecurityProfile(user?.username);
      setProfile(res.profile);
      setTrustedDevices(res.trustedDevices || []);
      setDisplayTitle(res.profile.displayTitle || '');
      setPhoneExt(res.profile.phoneExt || '');
      setNotifyChannels(res.profile.notifyChannels);
      setEmailChannels(
        res.profile.emailChannels || {
          system_alert: true,
          security_2fa: true,
          direct_message: true,
          channel_message: true,
          announcement: true,
          approval_request: true,
        }
      );
      setQuietHours(res.profile.quietHours);
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          (isEn ? 'Failed to load profile settings' : 'خطا در بارگذاری اطلاعات پروفایل و امنیت')
      );
    } finally {
      setLoading(false);
    }
  }, [user?.username, isEn]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
      onConsumeInitialSubTab?.();
    }
  }, [initialSubTab, onConsumeInitialSubTab]);

  const handleSaveProfileMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    setSaving(true);
    try {
      const res = await updateUserSecurityProfile({ displayTitle, phoneExt });
      setProfile(res.profile);
      setSuccessMsg(
        isEn
          ? 'Profile metadata saved to database.'
          : 'مشخصات پروفایل با موفقیت در دیتابیس ذخیره شد.'
      );
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Failed to save profile' : 'خطا در ذخیره پروفایل'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    setSaving(true);
    try {
      const res = await updateUserSecurityProfile({ notifyChannels, emailChannels, quietHours });
      setProfile(res.profile);
      setNotifyChannels(res.profile.notifyChannels);
      setEmailChannels(res.profile.emailChannels);
      setQuietHours(res.profile.quietHours);
      setSuccessMsg(
        isEn
          ? 'Inbox, email notification channels & quiet hours saved.'
          : 'تنظیمات صندوق اعلانات، ارسال ایمیل و ساعات سکوت با موفقیت ذخیره شد.'
      );
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          (isEn ? 'Failed to update notification preferences' : 'خطا در ذخیره ترجیحات اعلان')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    if (newPassword.trim().length < 8) {
      setErrorMsg(
        isEn
          ? 'New password must be at least 8 characters.'
          : 'رمز عبور جدید باید حداقل ۸ کاراکتر باشد.'
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg(
        isEn
          ? 'New password and confirmation do not match.'
          : 'رمز عبور جدید با تکرار آن مطابقت ندارد.'
      );
      return;
    }
    setChangingPassword(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMsg(
        isEn
          ? 'Your account password was updated securely.'
          : 'رمز عبور حساب شما با موفقیت تغییر یافت.'
      );
    } catch (err: any) {
      setErrorMsg(
        err?.message || (isEn ? 'Password update failed' : 'تغییر رمز عبور ناموفق بود')
      );
    } finally {
      setChangingPassword(false);
    }
  };

  const handleBeginTotp = async () => {
    clearAlerts();
    setTotpBusy(true);
    try {
      const res = await beginTotpSetup();
      setTotpEnrollment(res.enrollment);
      setProfile(res.profile);
      setTotpVerifyCode('');
    } catch (err: any) {
      setErrorMsg(
        err?.message || (isEn ? 'Failed to generate QR setup key' : 'خطا در ایجاد کلید راه‌اندازی TOTP')
      );
    } finally {
      setTotpBusy(false);
    }
  };

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    if (!/^\d{6}$/.test(totpVerifyCode.trim())) {
      setErrorMsg(
        isEn
          ? 'Enter the exact 6-digit code shown in your Authenticator app.'
          : 'لطفاً کد ۶ رقمی فعلی برنامه احراز هویت را وارد نمایید.'
      );
      return;
    }
    setTotpBusy(true);
    try {
      const res = await verifyTotpSetup(totpVerifyCode.trim());
      setProfile(res.profile);
      setTotpEnrollment(null);
      setTotpVerifyCode('');
      setGeneratedBackupCodes(res.backupCodes || []);
      setBackupCodesModalMinimized(false);
      setBackupCodesModalOpen(true);
      setSuccessMsg(
        isEn
          ? 'Authenticator App (TOTP) 2FA is now active on your account.'
          : 'احراز هویت دو مرحله‌ای با اپلیکیشن (TOTP) با موفقیت برای حساب شما فعال شد.'
      );
    } catch (err: any) {
      setErrorMsg(
        err?.message || (isEn ? 'Invalid 6-digit code' : 'کد تایید وارد شده نادرست است')
      );
    } finally {
      setTotpBusy(false);
    }
  };

  const handleSelect2faMethod = async (targetMethod: TwoFactorMethod) => {
    clearAlerts();
    if (profile?.totpVerified && targetMethod !== 'totp') {
      setSecurityPromptInput('');
      setSecurityPromptMinimized(false);
      setSecurityPrompt({
        kind: targetMethod === 'none' ? 'disable_totp' : 'switch_to_email',
      });
      return;
    }
    if (targetMethod === 'totp' && !profile?.totpVerified) {
      await handleBeginTotp();
      return;
    }
    setTotpBusy(true);
    try {
      const res = await updateTwoFactorPreference({ method: targetMethod });
      setProfile(res.profile);
      setSuccessMsg(
        isEn
          ? `2FA preference set to "${targetMethod}".`
          : `روش ترجیحی احراز هویت دو مرحله‌ای روی "${targetMethod}" تنظیم شد.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Failed to update method' : 'خطا در تغییر روش ۲ مرحله‌ای'));
    } finally {
      setTotpBusy(false);
    }
  };

  const handleConfirmSecurityPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!securityPrompt) return;
    clearAlerts();
    setTotpBusy(true);
    try {
      if (securityPrompt.kind === 'disable_totp') {
        const res = await updateTwoFactorPreference({
          method: 'none',
          verificationInput: securityPromptInput.trim(),
          resetTotpSecret: true,
        });
        setProfile(res.profile);
        setTotpEnrollment(null);
        setSuccessMsg(
          isEn
            ? 'Personal TOTP Authenticator 2FA has been disabled.'
            : 'احراز هویت دو مرحله‌ای TOTP با موفقیت غیرفعال شد.'
        );
      } else if (securityPrompt.kind === 'switch_to_email') {
        const res = await updateTwoFactorPreference({
          method: 'email',
          verificationInput: securityPromptInput.trim(),
          resetTotpSecret: false,
        });
        setProfile(res.profile);
        setSuccessMsg(
          isEn
            ? 'Switched 2FA preference to Email OTP.'
            : 'روش احراز هویت دو مرحله‌ای به کد ایمیل تغییر یافت.'
        );
      } else if (securityPrompt.kind === 'regen_backup') {
        const res = await regenerateBackupCodes(securityPromptInput.trim());
        setProfile(res.profile);
        setGeneratedBackupCodes(res.backupCodes || []);
        setBackupCodesModalMinimized(false);
        setBackupCodesModalOpen(true);
        setSuccessMsg(
          isEn
            ? 'Generated 8 fresh single-use recovery backup codes.'
            : '۸ کد پشتیبان یک‌بارمصرف جدید با موفقیت تولید شد.'
        );
      } else if (securityPrompt.kind === 'revoke_one' && securityPrompt.deviceId) {
        const res = await revokeSingleTrustedDevice(securityPrompt.deviceId, user?.username);
        setTrustedDevices(res.trustedDevices || []);
        setSuccessMsg(
          isEn ? 'Trusted device token revoked.' : 'دستگاه مورد اعتماد با موفقیت لغو شد.'
        );
      } else if (securityPrompt.kind === 'revoke_all') {
        const res = await revokeAllTrustedDevices();
        setTrustedDevices(res.trustedDevices || []);
        try {
          localStorage.removeItem('nettopology_trusted_device_token');
          if (user?.username) {
            localStorage.removeItem(
              `nettopology_trusted_device_${user.username.trim().toLowerCase()}`
            );
          }
        } catch {}
        setSuccessMsg(
          isEn
            ? 'All trusted devices revoked across your account.'
            : 'تمامی دستگاه‌های مورد اعتماد حساب شما لغو شدند.'
        );
      }
      setSecurityPrompt(null);
      setSecurityPromptInput('');
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Action failed' : 'عملیات ناموفق بود'));
    } finally {
      setTotpBusy(false);
    }
  };

  const handleCopyText = (val: string, kind: 'secret' | 'backup') => {
    navigator.clipboard?.writeText(val).then(() => {
      if (kind === 'secret') {
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      } else {
        setCopiedBackupCodes(true);
        setTimeout(() => setCopiedBackupCodes(false), 2000);
      }
    });
  };

  const handleDownloadBackupCodes = () => {
    const content = [
      `NetTopology Recovery Backup Codes (${profile?.username || user?.username || 'user'})`,
      `Generated: ${new Date().toISOString()}`,
      `Each code can be used ONCE if your Authenticator app is unavailable.`,
      '',
      ...generatedBackupCodes.map((c, idx) => `${idx + 1}. ${c}`),
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nettopology-2fa-backup-codes-${profile?.username || 'account'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cardSurface = isLightMode
    ? 'bg-white border-slate-200 text-slate-900 shadow-xs'
    : 'bg-slate-900/85 border-slate-800 text-slate-100';

  const inputSurface = isLightMode
    ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white'
    : 'bg-slate-950/80 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-cyan-500';

  const subTabs: { id: ProfileSubTab; labelEn: string; labelFa: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'profile', labelEn: 'Account & Profile', labelFa: 'پروفایل و رمز عبور', icon: UserCog },
    { id: 'security', labelEn: '2FA & Authenticator', labelFa: 'احراز هویت دو مرحله‌ای', icon: ShieldCheck },
    { id: 'devices', labelEn: 'Trusted Devices', labelFa: 'دستگاه‌های مورد اعتماد', icon: Laptop },
    { id: 'notifications', labelEn: 'Notifications & Quiet Hours', labelFa: 'اعلانات و ساعات سکوت', icon: Bell },
  ];

  const isAdUser = profile?.userType === 'ad';

  return (
    <div
      className={`max-w-6xl mx-auto px-3 sm:px-6 py-5 space-y-5 ${
        isRtl ? 'text-right' : 'text-left'
      }`}
    >
      {/* Top Identity Header */}
      <div className={`rounded-2xl border p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${cardSurface}`}>
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-md">
            {(profile?.fullName || user?.fullName || user?.username || 'U').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold truncate">
                {profile?.fullName || user?.fullName || user?.username}
              </h1>
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded-lg border ${
                  isLightMode
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                }`}
              >
                {profile?.role || user?.role}
              </span>
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded-lg border ${
                  isAdUser
                    ? isLightMode
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : isLightMode
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                }`}
              >
                {isAdUser
                  ? isEn ? 'Active Directory' : 'اکتیو دایرکتوری'
                  : isEn ? 'Local Account' : 'حساب محلی'}
              </span>
            </div>
            <p className={`text-xs font-mono mt-1 truncate ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
              {profile?.username || user?.username} · {profile?.email || user?.email}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {onNavigateToCommunications && (
            <button
              type="button"
              onClick={onNavigateToCommunications}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-800'
                  : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              <Bell className="w-3.5 h-3.5 text-cyan-500" />
              <span>{isEn ? 'Inbox Center' : 'مرکز پیام‌ها'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={loadProfileData}
            disabled={loading}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              isLightMode
                ? 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-800'
                : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-200'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{isEn ? 'Refresh' : 'بروزرسانی'}</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className={`rounded-2xl border p-1.5 flex items-center gap-1.5 overflow-x-auto ${cardSurface}`}>
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                clearAlerts();
                setSubTab(tab.id);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                active
                  ? isLightMode
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : isLightMode
                  ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{isEn ? tab.labelEn : tab.labelFa}</span>
              {tab.id === 'devices' && trustedDevices.length > 0 && (
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.2 rounded ${
                    active
                      ? 'bg-white/20 text-white'
                      : isLightMode
                      ? 'bg-slate-200 text-slate-700'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {trustedDevices.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
            isLightMode
              ? 'bg-rose-50 border-rose-300 text-rose-800'
              : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <span className="flex-1">{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
            isLightMode
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="flex-1">{successMsg}</span>
        </div>
      )}

      {((backupCodesModalOpen && backupCodesModalMinimized) ||
        (securityPrompt && securityPromptMinimized)) && (
        <div className="flex flex-wrap items-center gap-2">
          {backupCodesModalOpen && backupCodesModalMinimized && (
            <button
              type="button"
              onClick={() => setBackupCodesModalMinimized(false)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                isLightMode
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-800 hover:bg-indigo-100'
                  : 'bg-indigo-950/50 border-indigo-500/40 text-indigo-200 hover:bg-indigo-900/50'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 text-emerald-500" />
              <span>{isEn ? 'Restore Recovery Backup Codes Window' : 'بازگردانی پنجره کدهای پشتیبان 2FA'}</span>
            </button>
          )}
          {securityPrompt && securityPromptMinimized && (
            <button
              type="button"
              onClick={() => setSecurityPromptMinimized(false)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                isLightMode
                  ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                  : 'bg-amber-950/50 border-amber-500/40 text-amber-200 hover:bg-amber-900/50'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              <span>{isEn ? 'Restore Security Confirmation Window' : 'بازگردانی پنجره تایید امنیتی'}</span>
            </button>
          )}
        </div>
      )}

      {loading && !profile ? (
        <div className={`rounded-2xl border p-12 text-center ${cardSurface}`}>
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-500" />
          <p className={`text-xs ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
            {isEn ? 'Loading profile and security state...' : 'در حال بارگذاری اطلاعات پروفایل و امنیت...'}
          </p>
        </div>
      ) : (
        <>
          {/* TAB 1: ACCOUNT & PROFILE */}
          {subTab === 'profile' && profile && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Personal Metadata Card */}
              <form onSubmit={handleSaveProfileMeta} className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-700/20">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-indigo-500" />
                    <h2 className="text-sm font-bold">
                      {isEn ? 'Personal Operational Identity' : 'مشخصات سازمانی و تماس'}
                    </h2>
                  </div>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    title={isEn ? 'Operational Profile' : 'پروفایل عملیاتی'}
                    infoWhatEn="Additional operational title and internal extension shown to team members in Inbox & Channels."
                    infoWhatFa="عنوان شغلی عملیاتی و شماره داخلی که در مرکز پیام‌ها و کانال‌های تیمی به همکاران نمایش داده می‌شود."
                    infoWhyEn="Helps shift engineers quickly identify the on-call owner or escalation contact during incidents."
                    infoWhyFa="به کارشناسان شیفت کمک می‌کند در زمان بروز رخداد، مسئول مربوطه و داخلی تماس وی را سریع‌تر بشناسند."
                    infoExampleEn="Title: Senior NOC Engineer | Ext: 4120"
                    infoExampleFa="عنوان: راهبر ارشد شبکه | داخلی: ۴۱۲۰"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    {isEn ? 'Job / Shift Title' : 'عنوان شغلی / سمت عملیاتی'}
                  </label>
                  <input
                    type="text"
                    value={displayTitle}
                    onChange={(e) => setDisplayTitle(e.target.value)}
                    placeholder={isEn ? 'e.g. Core Infrastructure Lead' : 'مثلاً: راهبر ارشد زیرساخت و امنیت'}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none ${inputSurface}`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-cyan-500" />
                    <span>{isEn ? 'Internal Extension / Contact Number' : 'شماره داخلی / تماس اضطراری'}</span>
                  </label>
                  <input
                    type="text"
                    value={phoneExt}
                    onChange={(e) => setPhoneExt(e.target.value)}
                    placeholder={isEn ? 'e.g. Ext 405 / +98-912-...' : 'مثلاً: داخلی ۴۰۵'}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono focus:outline-none ${inputSurface}`}
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    {saving
                      ? isEn ? 'Saving...' : 'در حال ذخیره...'
                      : isEn ? 'Save Profile Info' : 'ذخیره مشخصات'}
                  </button>
                </div>
              </form>

              {/* Password Change Card */}
              <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-700/20">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-emerald-500" />
                    <h2 className="text-sm font-bold">
                      {isEn ? 'Account Password Management' : 'تغییر رمز عبور حساب'}
                    </h2>
                  </div>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    title={isEn ? 'Password Security' : 'امنیت رمز عبور'}
                    infoWhatEn="Self-service credential update stored with PBKDF2-SHA512 hashing on PostgreSQL."
                    infoWhatFa="تغییر رمز عبور حساب محلی که با الگوریتم رمزنگاری PBKDF2-SHA512 در دیتابیس ذخیره می‌شود."
                    infoWhyEn="Enforces strong credential hygiene without requiring Super Admin intervention."
                    infoWhyFa="امکان تغییر دوره‌ای رمز عبور توسط خود کاربر بدون نیاز به ادمین ارشد را فراهم می‌کند."
                    infoExampleEn="Minimum 8 characters mixing letters, digits & symbols."
                    infoExampleFa="حداقل ۸ کاراکتر ترکیبی از حروف، اعداد و کاراکترهای خاص"
                  />
                </div>

                {isAdUser ? (
                  <div
                    className={`p-4 rounded-xl border text-xs space-y-2 ${
                      isLightMode
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                    }`}
                  >
                    <p className="font-bold">
                      {isEn
                        ? 'Managed by Active Directory Domain Controller'
                        : 'مدیریت‌شده توسط اکتیو دایرکتوری (Domain Controller)'}
                    </p>
                    <p className="leading-relaxed opacity-90">
                      {isEn
                        ? 'Your account authenticates against your corporate LDAP / Active Directory domain. Please update your password through your domain workstation or AD self-service portal.'
                        : 'حساب شما از طریق دامین اکتیو دایرکتوری احراز هویت می‌شود. تغییر رمز عبور باید از طریق سیستم ویندوز دامین یا مدیر شبکه انجام شود.'}
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleChangePassword} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        {isEn ? 'Current Password' : 'رمز عبور فعلی'}
                      </label>
                      <div className="relative">
                        <input
                          type={showPasswords ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          required
                          className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none ${inputSurface}`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        {isEn ? 'New Password (min 8 chars)' : 'رمز عبور جدید (حداقل ۸ کاراکتر)'}
                      </label>
                      <input
                        type={showPasswords ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none ${inputSurface}`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        {isEn ? 'Confirm New Password' : 'تکرار رمز عبور جدید'}
                      </label>
                      <input
                        type={showPasswords ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={8}
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none ${inputSurface}`}
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => setShowPasswords((p) => !p)}
                        className={`text-xs flex items-center gap-1.5 cursor-pointer ${
                          isLightMode ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        <span>{showPasswords ? (isEn ? 'Hide Passwords' : 'مخفی کردن') : (isEn ? 'Show Passwords' : 'نمایش رمزها')}</span>
                      </button>

                      <button
                        type="submit"
                        disabled={changingPassword}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                      >
                        {changingPassword
                          ? isEn ? 'Updating...' : 'در حال تغییر...'
                          : isEn ? 'Update Password' : 'تغییر رمز عبور'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: TWO-FACTOR AUTHENTICATION & TOTP */}
          {subTab === 'security' && profile && (
            <div className="space-y-5">
              {/* Method Selection & Current Posture */}
              <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-700/20">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-cyan-500" />
                    <h2 className="text-sm font-bold">
                      {isEn ? 'Two-Factor Authentication (2FA) Policy & Method' : 'پیکربندی احراز هویت دو مرحله‌ای (2FA)'}
                    </h2>
                  </div>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    title={isEn ? 'Personal 2FA & TOTP' : 'احراز هویت دو مرحله‌ای شخصی'}
                    infoWhatEn="Adds a second verification step (Authenticator TOTP app or Email OTP) during sign-in."
                    infoWhatFa="لایه امنیتی دوم هنگام ورود به سامانه با استفاده از برنامه Authenticator یا کد یک‌بارمصرف ایمیل."
                    infoWhyEn="Protects infrastructure credentials and audit controls even if your password is compromised."
                    infoWhyFa="حتی در صورت افشای رمز عبور، از ورود غیرمجاز به پنل زیرساخت شبکه جلوگیری می‌کند."
                    infoExampleEn="Recommended: Enable TOTP with Google or Microsoft Authenticator and store your 8 backup codes offline."
                    infoExampleFa="پیشنهاد: فعال‌سازی TOTP با Google Authenticator و نگهداری ۸ کد پشتیبان در جای امن."
                  />
                </div>

                {profile.globalTwoFactorEnabled && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                      isLightMode
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                        : 'bg-indigo-950/40 border-indigo-500/30 text-indigo-200'
                    }`}
                  >
                    <ShieldAlert className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>
                      {isEn
                        ? 'Organization-wide 2FA enforcement is active: if personal TOTP is not enabled, Email OTP is automatically required at sign-in.'
                        : 'سیاست اجباری 2FA در سطح سازمان فعال است: در صورت غیرفعال بودن Authenticator، کد ایمیل هنگام ورود الزامی خواهد بود.'}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Option 1: TOTP Authenticator */}
                  <div
                    className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                      profile.preferred2faMethod === 'totp' && profile.totpVerified
                        ? isLightMode
                          ? 'bg-emerald-50/70 border-emerald-400'
                          : 'bg-emerald-950/30 border-emerald-500/50'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 font-bold text-xs">
                          <Smartphone className="w-4 h-4 text-emerald-500" />
                          <span>{isEn ? 'Authenticator App (TOTP)' : 'برنامه Authenticator'}</span>
                        </span>
                        {profile.totpVerified && profile.preferred2faMethod === 'totp' && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500 text-white">
                            {isEn ? 'Active' : 'فعال'}
                          </span>
                        )}
                      </div>
                      <p className={`text-[11px] leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                        {isEn
                          ? 'Offline 6-digit RFC 6238 codes via Google/Microsoft Authenticator + 8 backup codes.'
                          : 'تولید کد ۶ رقمی آفلاین روی موبایل مطابق استاندارد RFC 6238 به همراه ۸ کد پشتیبان بازیابی.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={totpBusy}
                      onClick={
                        profile.totpVerified && profile.preferred2faMethod === 'totp'
                          ? handleBeginTotp
                          : () => handleSelect2faMethod('totp')
                      }
                      className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                        profile.totpVerified && profile.preferred2faMethod === 'totp'
                          ? isLightMode
                            ? 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-100'
                            : 'bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                    >
                      {profile.totpVerified
                        ? profile.preferred2faMethod === 'totp'
                          ? isEn ? 'Rotate TOTP Secret' : 'تعویض کلید QR'
                          : isEn ? 'Switch to TOTP' : 'تغییر به TOTP'
                        : isEn ? 'Setup Authenticator' : 'راه‌اندازی Authenticator'}
                    </button>
                  </div>

                  {/* Option 2: Email OTP */}
                  <div
                    className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                      profile.preferred2faMethod === 'email'
                        ? isLightMode
                          ? 'bg-cyan-50/70 border-cyan-400'
                          : 'bg-cyan-950/30 border-cyan-500/50'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 font-bold text-xs">
                          <Mail className="w-4 h-4 text-cyan-500" />
                          <span>{isEn ? 'Email One-Time Code' : 'کد یک‌بارمصرف ایمیل'}</span>
                        </span>
                        {profile.preferred2faMethod === 'email' && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-600 text-white">
                            {isEn ? 'Active' : 'فعال'}
                          </span>
                        )}
                      </div>
                      <p className={`text-[11px] leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                        {isEn
                          ? 'Requires 6-digit verification code dispatched to your account email on sign-in.'
                          : 'ارسال خودکار کد ۶ رقمی به آدرس ایمیل ثبت‌شده حساب هنگام هر ورود جدید.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={totpBusy || profile.preferred2faMethod === 'email'}
                      onClick={() => handleSelect2faMethod('email')}
                      className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-50 ${
                        profile.preferred2faMethod === 'email'
                          ? isLightMode
                            ? 'bg-white border border-slate-300 text-slate-700'
                            : 'bg-slate-800 border border-slate-700 text-slate-300'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      }`}
                    >
                      {profile.preferred2faMethod === 'email'
                        ? isEn ? 'Currently Active' : 'در حال استفاده'
                        : isEn ? 'Use Email 2FA' : 'انتخاب کد ایمیل'}
                    </button>
                  </div>

                  {/* Option 3: Disabled / Global Default */}
                  <div
                    className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                      profile.preferred2faMethod === 'none'
                        ? isLightMode
                          ? 'bg-slate-100 border-slate-400'
                          : 'bg-slate-800/70 border-slate-600'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 font-bold text-xs">
                          <KeyRound className="w-4 h-4 text-slate-500" />
                          <span>{isEn ? 'Follow Global Policy' : 'پیروی از سیاست عمومی'}</span>
                        </span>
                        {profile.preferred2faMethod === 'none' && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-600 text-white">
                            {isEn ? 'Selected' : 'انتخاب‌شده'}
                          </span>
                        )}
                      </div>
                      <p className={`text-[11px] leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                        {isEn
                          ? 'No personal 2FA override. Applies only when organization-wide 2FA is enabled.'
                          : 'بدون اجبار شخصی؛ فقط در صورتی که تایید دو مرحله‌ای عمومی سیستم روشن باشد اجرا می‌شود.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={totpBusy || profile.preferred2faMethod === 'none'}
                      onClick={() => handleSelect2faMethod('none')}
                      className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-50 ${
                        profile.preferred2faMethod === 'none'
                          ? isLightMode
                            ? 'bg-white border border-slate-300 text-slate-600'
                            : 'bg-slate-800 border border-slate-700 text-slate-400'
                          : isLightMode
                          ? 'bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700'
                          : 'bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300'
                      }`}
                    >
                      {profile.preferred2faMethod === 'none'
                        ? isEn ? 'Default Active' : 'حالت پیش‌فرض'
                        : isEn ? 'Disable Personal 2FA' : 'غیرفعال‌سازی 2FA شخصی'}
                    </button>
                  </div>
                </div>

                {/* Active TOTP Backup Codes Controls */}
                {profile.totpVerified && (
                  <div
                    className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold">
                        {isEn
                          ? `Recovery Backup Codes: ${profile.backupCodesRemaining} remaining`
                          : `کدهای پشتیبان یک‌بارمصرف: ${profile.backupCodesRemaining} کد باقی‌مانده`}
                      </p>
                      <p className={`text-[11px] mt-0.5 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                        {isEn
                          ? 'Backup codes are hashed with SHA-256 on the server and allow emergency access if your phone is unavailable.'
                          : 'کدهای پشتیبان به صورت هش‌شده روی سرور ذخیره شده‌اند و در زمان عدم دسترسی به گوشی کاربرد دارند.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        clearAlerts();
                        setSecurityPromptInput('');
                        setSecurityPromptMinimized(false);
                        setSecurityPrompt({ kind: 'regen_backup' });
                      }}
                      className={`px-3.5 py-2 rounded-xl border text-xs font-bold shrink-0 cursor-pointer transition ${
                        isLightMode
                          ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
                          : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                      }`}
                    >
                      {isEn ? 'Regenerate Backup Codes' : 'تولید مجدد کدهای پشتیبان'}
                    </button>
                  </div>
                )}
              </div>

              {/* Interactive TOTP Enrollment Wizard */}
              {totpEnrollment && (
                <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-700/20">
                    <div>
                      <h3 className="text-sm font-bold">
                        {isEn ? 'Scan QR Code with Your Authenticator App' : 'اسکن کد QR با برنامه Authenticator'}
                      </h3>
                      <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                        {isEn
                          ? 'Scan the QR image below, then enter the 6-digit code generated by your app to confirm activation.'
                          : 'تصویر QR زیر را با اپلیکیشن موبایل اسکن کرده و سپس کد ۶ رقمی نمایش‌داده‌شده را برای تایید نهایی وارد کنید.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTotpEnrollment(null)}
                      className={`px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {isEn ? 'Cancel Setup' : 'انصراف'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5 items-center">
                    <div className="bg-white p-3 rounded-2xl border border-slate-200 w-fit mx-auto shadow-xs">
                      <div
                        className="w-[200px] h-[200px] flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                        dangerouslySetInnerHTML={{ __html: totpEnrollment.qrSvg }}
                      />
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold mb-1.5">
                          {isEn ? 'Manual Setup Key (Base32)' : 'کلید ورود دستی (Base32)'}
                        </label>
                        <div className="flex items-center gap-2">
                          <code
                            className={`flex-1 px-3 py-2.5 rounded-xl border text-xs font-mono tracking-wider break-all ${
                              isLightMode
                                ? 'bg-slate-50 border-slate-300 text-slate-900'
                                : 'bg-slate-950 border-slate-700 text-cyan-300'
                            }`}
                          >
                            {totpEnrollment.secretBase32}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopyText(totpEnrollment.secretBase32, 'secret')}
                            className={`px-3 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 ${
                              isLightMode
                                ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
                                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                            }`}
                          >
                            {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedSecret ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی')}</span>
                          </button>
                        </div>
                      </div>

                      <form onSubmit={handleVerifyTotp} className="space-y-2.5">
                        <label className="block text-xs font-semibold">
                          {isEn ? '6-Digit Verification Code' : 'کد تایید ۶ رقمی جهت تکمیل فعال‌سازی'}
                        </label>
                        <div className="flex items-center gap-2.5">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={totpVerifyCode}
                            onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="123456"
                            className={`w-44 px-4 py-2.5 rounded-xl border text-center text-lg font-mono font-bold tracking-[0.3em] focus:outline-none ${inputSurface}`}
                          />
                          <button
                            type="submit"
                            disabled={totpBusy || totpVerifyCode.length !== 6}
                            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                          >
                            {totpBusy
                              ? isEn ? 'Verifying...' : 'در حال تایید...'
                              : isEn ? 'Verify & Activate' : 'تایید و فعال‌سازی'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TRUSTED DEVICES */}
          {subTab === 'devices' && (
            <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-700/20">
                <div className="flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-indigo-500" />
                  <h2 className="text-sm font-bold">
                    {isEn ? 'Active 30-Day Trusted Browsers & Devices' : 'دستگاه‌ها و مرورگرهای مورد اعتماد فعال'}
                  </h2>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    title={isEn ? 'Trusted Devices' : 'دستگاه‌های مورد اعتماد'}
                    infoWhatEn="Browsers that passed 2FA verification and opted into 30-day device trust."
                    infoWhatFa="مرورگرهایی که پس از احراز هویت دو مرحله‌ای با گزینه اعتماد ۳۰ روزه ثبت شده‌اند."
                    infoWhyEn="Allows revoking stolen or shared workstations immediately from your account."
                    infoWhyFa="امکان لغو آنی دسترسی مرورگرهای گم‌شده یا اشتراکی از راه دور را فراهم می‌کند."
                    infoExampleEn="Revoke any unrecognized IP address immediately."
                    infoExampleFa="در صورت مشاهده آی‌پی ناشناس، فوراً دکمه لغو دسترسی را بزنید."
                  />
                </div>
                {trustedDevices.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      clearAlerts();
                      setSecurityPromptMinimized(false);
                      setSecurityPrompt({ kind: 'revoke_all' });
                    }}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                      isLightMode
                        ? 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700'
                        : 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Revoke All Devices' : 'لغو تمام دستگاه‌ها'}</span>
                  </button>
                )}
              </div>

              {trustedDevices.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <Laptop className={`w-8 h-8 mx-auto ${isLightMode ? 'text-slate-400' : 'text-slate-600'}`} />
                  <p className={`text-xs font-semibold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    {isEn ? 'No active trusted devices registered.' : 'هیچ دستگاه مورد اعتماد فعالی برای حساب شما ثبت نشده است.'}
                  </p>
                  <p className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn
                      ? 'When you verify 2FA with "Trust this device for 30 days" checked, that browser appears here.'
                      : 'هنگام ورود با تایید دو مرحله‌ای و تیک گزینه «اعتماد ۳۰ روزه»، مرورگر مربوطه در این بخش نمایش داده می‌شود.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {trustedDevices.map((dev) => (
                    <div
                      key={dev.id}
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold">
                            {summarizeUserAgent(dev.userAgent, isEn)}
                          </span>
                          {dev.isCurrent && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 font-bold">
                              {isEn ? 'Current Browser' : 'مرورگر فعلی'}
                            </span>
                          )}
                        </div>
                        <div className={`text-[11px] font-mono flex flex-wrap gap-x-4 gap-y-1 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                          <span>IP: {dev.ip || '-'}</span>
                          <span>
                            {isEn ? 'Last Used:' : 'آخرین استفاده:'}{' '}
                            {new Date(dev.lastUsedAt).toLocaleString(isEn ? 'en-US' : 'fa-IR')}
                          </span>
                          <span>
                            {isEn ? 'Expires:' : 'انقضا:'}{' '}
                            {new Date(dev.expiresAt).toLocaleDateString(isEn ? 'en-US' : 'fa-IR')}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          clearAlerts();
                          setSecurityPromptMinimized(false);
                          setSecurityPrompt({
                            kind: 'revoke_one',
                            deviceId: dev.id,
                            deviceLabel: `${summarizeUserAgent(dev.userAgent, isEn)} (${dev.ip || '-'})`,
                          });
                        }}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold shrink-0 cursor-pointer ${
                          isLightMode
                            ? 'bg-white hover:bg-rose-50 border-slate-300 hover:border-rose-300 text-rose-700'
                            : 'bg-slate-800 hover:bg-rose-500/20 border-slate-700 hover:border-rose-500/40 text-rose-300'
                        }`}
                      >
                        {isEn ? 'Revoke' : 'لغو دسترسی'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: NOTIFICATIONS, EMAIL ALERTS & QUIET HOURS */}
          {subTab === 'notifications' && (
            <div className="space-y-5">
            <form onSubmit={handleSaveNotifications} className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Inbox Notification Category Toggles */}
                <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-700/20">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-cyan-500" />
                      <h2 className="text-sm font-bold">
                        {isEn ? 'Inbox Category Preferences' : 'تنظیمات دریافت دسته‌بندی اعلانات'}
                      </h2>
                    </div>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      title={isEn ? 'Notification Channels' : 'دسته‌بندی اعلانات'}
                      infoWhatEn="Controls which non-critical alert feeds generate Inbox notifications for your account."
                      infoWhatFa="تعیین می‌کند کدام یک از رویدادهای غیربحرانی برای حساب شما اعلان صندوق بسازند."
                      infoWhyEn="Reduces alert fatigue while keeping critical security and approval notices guaranteed."
                      infoWhyFa="از شلوغی صندوق اعلانات جلوگیری کرده و هم‌زمان هشدارهای حیاتی و امنیتی را همیشه حفظ می‌کند."
                      infoExampleEn="Keep System Alerts and Security 2FA enabled for infrastructure engineers."
                      infoExampleFa="برای کارشناسان شبکه، فعال بودن هشدارهای سیستمی و امنیتی توصیه می‌شود."
                    />
                  </div>

                  <div className="space-y-2.5">
                    {(
                      [
                        {
                          key: 'system_alert',
                          labelEn: 'System & Daemon Operational Alerts (Non-Critical)',
                          labelFa: 'هشدارهای عملیاتی سرویس‌ها (بکاپ، لایسنس و سیستم)',
                        },
                        {
                          key: 'direct_message',
                          labelEn: '1:1 Direct Message Inbox Notifications',
                          labelFa: 'اعلان صندوق پیام‌های مستقیم (1:1)',
                        },
                        {
                          key: 'channel_message',
                          labelEn: 'Team Channel Message Notifications',
                          labelFa: 'اعلان پیام‌های کانال‌های تیمی',
                        },
                        {
                          key: 'announcement',
                          labelEn: 'Standard Team Announcements (Non-Mandatory)',
                          labelFa: 'اطلاعیه‌های عمومی تیمی (غیرالزامی)',
                        },
                        {
                          key: 'desktop_sound',
                          labelEn: 'Live Audio Chime for Incoming Alerts',
                          labelFa: 'پخش صدای هشدار هنگام دریافت اعلان جدید',
                        },
                      ] as { key: keyof UserNotifyChannelPrefs; labelEn: string; labelFa: string }[]
                    ).map((item) => (
                      <label
                        key={item.key}
                        className={`flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <span className="text-xs font-medium">{isEn ? item.labelEn : item.labelFa}</span>
                        <input
                          type="checkbox"
                          checked={notifyChannels[item.key] !== false}
                          onChange={(e) =>
                            setNotifyChannels((prev) => ({ ...prev, [item.key]: e.target.checked }))
                          }
                          className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                        />
                      </label>
                    ))}
                    <p className={`text-[11px] pt-1 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn
                        ? 'Note: Critical severity alerts, 2FA security events, and mandatory read-receipt announcements are always delivered for audit compliance.'
                        : 'نکته: هشدارهای سطح بحرانی (Critical)، رویدادهای امنیتی 2FA و اطلاعیه‌های نیازمند تایید رسمی (Acknowledge) همیشه ارسال می‌شوند.'}
                    </p>
                  </div>
                </div>

                {/* Email Notification Category Toggles */}
                <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-700/20">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-indigo-500" />
                      <h2 className="text-sm font-bold">
                        {isEn ? 'Email Notification Preferences' : 'تنظیمات ارسال ایمیل اعلانات'}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const allOn = Object.values(emailChannels).every((v) => v !== false);
                          const nextVal = !allOn;
                          setEmailChannels({
                            system_alert: nextVal,
                            security_2fa: nextVal,
                            direct_message: nextVal,
                            channel_message: nextVal,
                            announcement: nextVal,
                            approval_request: nextVal,
                          });
                        }}
                        className={`px-2 py-0.5 rounded-lg border text-[10px] font-semibold cursor-pointer transition ${
                          isLightMode
                            ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                            : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                        }`}
                      >
                        {Object.values(emailChannels).every((v) => v !== false)
                          ? isEn
                            ? 'Uncheck All'
                            : 'لغو همه'
                          : isEn
                          ? 'Enable All'
                          : 'انتخاب همه'}
                      </button>
                      <FieldInfoTooltip
                        isEn={isEn}
                        isLightMode={isLightMode}
                        title={isEn ? 'Email Notifications' : 'ارسال ایمیل اعلانات'}
                        infoWhatEn="Controls which notification categories automatically forward an email copy to your registered account email."
                        infoWhatFa="تعیین می‌کند برای کدام دسته‌بندی‌ها علاوه بر صندوق داخلی، یک نسخه ایمیل نیز به آدرس ایمیل ثبت‌شده شما ارسال شود."
                        infoWhyEn="Delivers important team chats, system alerts, and approval requests directly to your inbox via the Outgoing Mail Server & SMTP Account."
                        infoWhyFa="پیام‌های تیمی، هشدارهای سیستم و درخواست‌های تایید را مستقیماً از طریق تنظیمات سرور ایمیل خروجی (SMTP) به ایمیل شما می‌فرستد."
                        infoExampleEn="All categories default to enabled; uncheck Chat Channels if you only want email for Critical Alerts and Approvals."
                        infoExampleFa="به‌صورت پیش‌فرض همه موارد فعال است؛ در صورت نیاز می‌توانید ارسال ایمیل برای چت‌ها یا سایر بخش‌ها را غیرفعال کنید."
                      />
                    </div>
                  </div>

                  {/* Recipient & SMTP Gateway Readiness Indicator */}
                  <div
                    className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border text-[11px] ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Mail className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span className={isLightMode ? 'text-slate-600' : 'text-slate-400'}>
                        {isEn ? 'Target Email:' : 'ایمیل مقصد:'}
                      </span>
                      <span className="font-mono font-semibold truncate">{profile?.email || '-'}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md font-mono font-bold text-[10px] border ${
                        profile?.smtpConfigured
                          ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                      }`}
                    >
                      {profile?.smtpConfigured
                        ? isEn
                          ? 'SMTP Configured'
                          : 'سرور SMTP آماده است'
                        : isEn
                        ? 'SMTP Not Configured'
                        : 'SMTP پیکربندی نشده'}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {(
                      [
                        {
                          key: 'system_alert',
                          labelEn: 'Email for System & Daemon Operational Alerts',
                          labelFa: 'ایمیل هشدارهای عملیاتی سرویس‌ها (بکاپ، لایسنس و سیستم)',
                        },
                        {
                          key: 'security_2fa',
                          labelEn: 'Email for Security, Audit & Authentication Alerts',
                          labelFa: 'ایمیل هشدارهای امنیتی، ممیزی و رویدادهای ورود',
                        },
                        {
                          key: 'direct_message',
                          labelEn: 'Email for 1:1 Direct Chat Messages',
                          labelFa: 'ایمیل پیام‌های چت مستقیم (1:1)',
                        },
                        {
                          key: 'channel_message',
                          labelEn: 'Email for Team Channel Chat Messages',
                          labelFa: 'ایمیل پیام‌های گفتگو و کانال‌های تیمی',
                        },
                        {
                          key: 'announcement',
                          labelEn: 'Email for Team Announcements & Broadcasts',
                          labelFa: 'ایمیل اطلاعیه‌های عمومی و سازمانی تیم',
                        },
                        {
                          key: 'approval_request',
                          labelEn: 'Email for Approval Requests & Change Decisions',
                          labelFa: 'ایمیل درخواست‌ها و نتایج تاییدیه‌های دو مرحله‌ای',
                        },
                      ] as { key: keyof UserEmailNotifyPrefs; labelEn: string; labelFa: string }[]
                    ).map((item) => (
                      <label
                        key={item.key}
                        className={`flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <span className="text-xs font-medium">{isEn ? item.labelEn : item.labelFa}</span>
                        <input
                          type="checkbox"
                          checked={emailChannels[item.key] !== false}
                          onChange={(e) =>
                            setEmailChannels((prev) => ({ ...prev, [item.key]: e.target.checked }))
                          }
                          className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                        />
                      </label>
                    ))}
                    <p className={`text-[11px] pt-1 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn
                        ? 'Emails are delivered using the Outgoing Mail Server & SMTP Account settings. Ensure your account uses a valid routable email address.'
                        : 'ایمیل‌ها از طریق تنظیمات «Outgoing Mail Server & SMTP Account» ارسال می‌شوند. برای دریافت، باید آدرس ایمیل معتبر (غیرداخلی) در پروفایل شما ثبت شده باشد.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Quiet Hours & Save Bar */}
              <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-700/20">
                  <div className="flex items-center gap-2">
                    <Moon className="w-4 h-4 text-indigo-500" />
                    <h2 className="text-sm font-bold">
                      {isEn ? 'Quiet Hours Schedule' : 'زمان‌بندی ساعات سکوت (Quiet Hours)'}
                    </h2>
                  </div>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    title={isEn ? 'Quiet Hours' : 'ساعات سکوت'}
                    infoWhatEn="Suppresses notification chimes during off-shift hours while preserving full Inbox records."
                    infoWhatFa="پخش صدای هشدار و حواس‌پرتی در ساعات غیرکاری را متوقف می‌کند بدون آنکه پیام‌ها حذف شوند."
                    infoWhyEn="Respects shift rotation boundaries for NOC/IT engineers."
                    infoWhyFa="به کارشناسان شیفت و تیم IT کمک می‌کند در ساعات استراحت مزاحمت صوتی نداشته باشند."
                    infoExampleEn="22:00 to 07:00 (Asia/Tehran)"
                    infoExampleFa="از ۲۲:۰۰ تا ۰۷:۰۰ (منطقه زمانی Asia/Tehran)"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                  <div className="lg:col-span-5">
                    <label
                      className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border cursor-pointer ${
                        isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                      }`}
                    >
                      <div>
                        <span className="text-xs font-bold block">
                          {isEn ? 'Enable Scheduled Quiet Hours' : 'فعال‌سازی زمان‌بندی ساعات سکوت'}
                        </span>
                        <span className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {isEn
                            ? 'Notifications stay archived/unread in Inbox with audio muted.'
                            : 'پیام‌ها در صندوق ذخیره می‌شوند ولی صدای اعلان در این بازه غیرفعال است.'}
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={quietHours.enabled}
                        onChange={(e) => setQuietHours((prev) => ({ ...prev, enabled: e.target.checked }))}
                        className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                      />
                    </label>
                  </div>

                  <div className="lg:col-span-2">
                    <label className="block text-xs font-semibold mb-1.5 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{isEn ? 'Start Time' : 'ساعت شروع'}</span>
                    </label>
                    <input
                      type="time"
                      value={quietHours.startHour}
                      disabled={!quietHours.enabled}
                      onChange={(e) => setQuietHours((prev) => ({ ...prev, startHour: e.target.value }))}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none disabled:opacity-50 ${inputSurface}`}
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="block text-xs font-semibold mb-1.5 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{isEn ? 'End Time' : 'ساعت پایان'}</span>
                    </label>
                    <input
                      type="time"
                      value={quietHours.endHour}
                      disabled={!quietHours.enabled}
                      onChange={(e) => setQuietHours((prev) => ({ ...prev, endHour: e.target.value }))}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none disabled:opacity-50 ${inputSurface}`}
                    />
                  </div>

                  <div className="lg:col-span-3">
                    <label className="block text-xs font-semibold mb-1.5">
                      {isEn ? 'Schedule Timezone' : 'منطقه زمانی (Timezone)'}
                    </label>
                    <select
                      value={quietHours.timezone}
                      disabled={!quietHours.enabled}
                      onChange={(e) => setQuietHours((prev) => ({ ...prev, timezone: e.target.value }))}
                      className={`w-full px-3 py-2.5 rounded-xl border text-xs font-mono focus:outline-none disabled:opacity-50 ${inputSurface}`}
                    >
                      {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full sm:w-auto py-2.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    {saving
                      ? isEn
                        ? 'Saving Preferences...'
                        : 'در حال ذخیره...'
                      : isEn
                      ? 'Save Notification & Email Preferences'
                      : 'ذخیره تنظیمات اعلانات و ایمیل'}
                  </button>
                </div>
              </div>
            </form>

            {/* HelpDesk Failure & Alert Email Routing Controls (Default OFF + Recipient Picker) */}
            <HelpdeskNotificationSettingsCard isEn={isEn} isLightMode={isLightMode} />
            </div>
          )}
        </>
      )}

      {/* ONE-TIME BACKUP RECOVERY CODES MODAL (MODAL_GUIDELINES.md Compliant) */}
      {backupCodesModalOpen &&
        !backupCodesModalMinimized &&
        createPortal(
          <div className="fixed top-0 left-0 right-0 bottom-8 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div
              className={`border rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
                backupCodesModalMaximized ? 'w-full h-full max-w-none max-h-none' : 'w-full max-w-lg max-h-[88vh]'
              } ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-900'
                  : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              <div
                className={`px-5 py-3.5 border-b flex items-center justify-between gap-2 shrink-0 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <KeyRound className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-sm font-bold truncate">
                    {isEn ? 'Save Your 2FA Recovery Backup Codes' : 'ذخیره کدهای پشتیبان بازیابی 2FA'}
                  </span>
                </div>
                <ModalHeaderControls
                  isEn={isEn}
                  isLightMode={isLightMode}
                  isMaximized={backupCodesModalMaximized}
                  onMaximizeToggle={() => setBackupCodesModalMaximized((p) => !p)}
                  onMinimize={() => setBackupCodesModalMinimized(true)}
                  onClose={() => setBackupCodesModalOpen(false)}
                />
              </div>

              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                <div
                  className={`p-3 rounded-xl border text-xs leading-relaxed ${
                    isLightMode
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-amber-950/40 border-amber-500/30 text-amber-200'
                  }`}
                >
                  {isEn
                    ? 'Store these single-use codes securely. For security, they are hashed on the server and will NOT be shown again after closing this window.'
                    : 'این کدهای یک‌بارمصرف را در جای امن نگهداری کنید. به دلایل امنیتی، صرفاً هش آن‌ها در سرور ذخیره شده و پس از بستن این پنجره مجدداً نمایش داده نخواهند شد.'}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {generatedBackupCodes.map((code) => (
                    <div
                      key={code}
                      className={`px-3 py-2 rounded-xl border font-mono text-sm font-bold text-center tracking-wider ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-200 text-slate-900'
                          : 'bg-slate-950 border-slate-700 text-cyan-300'
                      }`}
                    >
                      {code}
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2.5 pt-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleCopyText(generatedBackupCodes.join('\n'), 'backup')}
                    className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-800'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                    }`}
                  >
                    {copiedBackupCodes ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedBackupCodes ? (isEn ? 'Copied All' : 'همه کپی شدند') : (isEn ? 'Copy All' : 'کپی همه')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadBackupCodes}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Download .TXT' : 'دانلود فایل .TXT'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* SECURITY VERIFICATION / CONFIRMATION MODAL (MODAL_GUIDELINES.md Compliant) */}
      {securityPrompt &&
        !securityPromptMinimized &&
        createPortal(
          <div className="fixed top-0 left-0 right-0 bottom-8 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <form
              onSubmit={handleConfirmSecurityPrompt}
              className={`border rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
                securityPromptMaximized ? 'w-full h-full max-w-none max-h-none' : 'w-full max-w-md max-h-[85vh]'
              } ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-900'
                  : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              <div
                className={`px-5 py-3.5 border-b flex items-center justify-between gap-2 shrink-0 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-sm font-bold truncate">
                    {securityPrompt.kind === 'revoke_one'
                      ? isEn ? 'Revoke Trusted Device' : 'لغو دستگاه مورد اعتماد'
                      : securityPrompt.kind === 'revoke_all'
                      ? isEn ? 'Revoke All Trusted Devices' : 'لغو همه دستگاه‌های مورد اعتماد'
                      : securityPrompt.kind === 'regen_backup'
                      ? isEn ? 'Confirm Backup Code Regeneration' : 'تایید تولید مجدد کدهای پشتیبان'
                      : isEn ? 'Confirm Security Change' : 'تایید تغییر تنظیمات امنیتی'}
                  </span>
                </div>
                <ModalHeaderControls
                  isEn={isEn}
                  isLightMode={isLightMode}
                  isMaximized={securityPromptMaximized}
                  onMaximizeToggle={() => setSecurityPromptMaximized((p) => !p)}
                  onMinimize={() => setSecurityPromptMinimized(true)}
                  onClose={() => {
                    setSecurityPrompt(null);
                    setSecurityPromptInput('');
                  }}
                />
              </div>

              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                {securityPrompt.kind === 'revoke_one' ? (
                  <p className="text-xs leading-relaxed">
                    {isEn
                      ? `Revoke 30-day trust for "${securityPrompt.deviceLabel}"? That browser will require 2FA verification on next login.`
                      : `آیا دسترسی ۳۰ روزه دستگاه «${securityPrompt.deviceLabel}» لغو شود؟ مرورگر مربوطه در ورود بعدی ملزم به تایید دو مرحله‌ای خواهد شد.`}
                  </p>
                ) : securityPrompt.kind === 'revoke_all' ? (
                  <p className="text-xs leading-relaxed">
                    {isEn
                      ? 'Revoke ALL trusted devices across your account? Every browser will require 2FA verification on next sign-in.'
                      : 'آیا تمام دستگاه‌های مورد اعتماد حساب شما لغو شوند؟ همه مرورگرها در ورود بعدی نیازمند کد تایید دو مرحله‌ای خواهند بود.'}
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-xs leading-relaxed">
                      {securityPrompt.kind === 'regen_backup'
                        ? isEn
                          ? 'Previous unused backup codes will be permanently invalidated. Enter your current 6-digit Authenticator code or account password to continue.'
                          : 'کدهای پشتیبان قبلی باطل خواهند شد. لطفاً کد ۶ رقمی Authenticator یا رمز عبور فعلی خود را وارد نمایید.'
                        : isEn
                        ? 'Enter your current 6-digit Authenticator code, a recovery backup code, or your account password to confirm changing your 2FA method.'
                        : 'جهت تایید تغییر یا غیرفعال‌سازی TOTP، کد ۶ رقمی Authenticator، کد پشتیبان یا رمز عبور فعلی حساب خود را وارد کنید.'}
                    </p>
                    <input
                      type="text"
                      autoFocus
                      required
                      value={securityPromptInput}
                      onChange={(e) => setSecurityPromptInput(e.target.value)}
                      placeholder={isEn ? '6-digit code or current password' : 'کد ۶ رقمی یا رمز عبور فعلی'}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono focus:outline-none ${inputSurface}`}
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSecurityPrompt(null);
                      setSecurityPromptInput('');
                    }}
                    className={`px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>
                  <button
                    type="submit"
                    disabled={totpBusy}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    {totpBusy
                      ? isEn ? 'Processing...' : 'در حال پردازش...'
                      : isEn ? 'Confirm' : 'تایید و اجرا'}
                  </button>
                </div>
              </div>
            </form>
          </div>,
          document.body
        )}
    </div>
  );
};
