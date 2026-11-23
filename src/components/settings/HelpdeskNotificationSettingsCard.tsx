import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  Headphones,
  Loader2,
  Mail,
  Plus,
  Save,
  Search,
  ShieldAlert,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  CommsRecipientOption,
  HelpdeskNotificationConfig,
  HelpdeskNotificationRecipientMode,
} from '../../types';
import {
  fetchHelpdeskNotificationConfigApi,
  saveHelpdeskNotificationConfigApi,
} from '../../services/api';
import { fetchCommsRecipients } from '../../services/commsApi';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface HelpdeskNotificationSettingsCardProps {
  isEn: boolean;
  isLightMode?: boolean;
}

const DEFAULT_CFG: HelpdeskNotificationConfig = {
  enabled: false,
  sendEmail: false,
  sendInboxNotification: false,
  notifyOnConnectionFailure: true,
  notifyOnUnauthorizedAttempt: true,
  notifyOnRateLimitTripped: true,
  recipientMode: 'selected_users',
  recipientUserIds: [],
  recipientGroupIds: [],
  customEmails: [],
};

export const HelpdeskNotificationSettingsCard: React.FC<HelpdeskNotificationSettingsCardProps> = ({
  isEn,
  isLightMode = false,
}) => {
  const [config, setConfig] = useState<HelpdeskNotificationConfig>(DEFAULT_CFG);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean>(false);
  const [canEdit, setCanEdit] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [recipientsList, setRecipientsList] = useState<CommsRecipientOption[]>([]);
  const [recipientSearch, setRecipientSearch] = useState<string>('');
  const [newEmailInput, setNewEmailInput] = useState<string>('');
  const [emailInputError, setEmailInputError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchHelpdeskNotificationConfigApi(),
      fetchCommsRecipients().catch(() => [] as CommsRecipientOption[]),
    ])
      .then(([cfgRes, recRes]) => {
        if (!active) return;
        if (cfgRes?.config) {
          setConfig(cfgRes.config);
        }
        setSmtpConfigured(Boolean(cfgRes?.smtpConfigured));
        setCanEdit(Boolean(cfgRes?.canEdit));
        if (Array.isArray(recRes)) {
          setRecipientsList(recRes.filter((r) => r.type === 'user' || r.type === 'group'));
        }
      })
      .catch((err: any) => {
        if (!active) return;
        setFeedback({
          type: 'error',
          text:
            err?.message ||
            (isEn
              ? 'Failed to load HelpDesk notification settings.'
              : 'خطا در بارگذاری تنظیمات اعلان‌های هلپ‌دسک.'),
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isEn]);

  const userOptions = useMemo(
    () => recipientsList.filter((r) => r.type === 'user'),
    [recipientsList]
  );
  const groupOptions = useMemo(
    () => recipientsList.filter((r) => r.type === 'group'),
    [recipientsList]
  );

  const filteredUsers = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    if (!q) return userOptions;
    return userOptions.filter(
      (u) =>
        (u.label || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.roleOrType || '').toLowerCase().includes(q)
    );
  }, [userOptions, recipientSearch]);

  const filteredGroups = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    if (!q) return groupOptions;
    return groupOptions.filter(
      (g) =>
        (g.label || '').toLowerCase().includes(q) ||
        (g.roleOrType || '').toLowerCase().includes(q)
    );
  }, [groupOptions, recipientSearch]);

  const toggleUserRecipient = (idOrUsername: string) => {
    if (!canEdit) return;
    setConfig((prev) => {
      const exists = prev.recipientUserIds.some(
        (x) => x.toLowerCase() === idOrUsername.toLowerCase()
      );
      return {
        ...prev,
        recipientUserIds: exists
          ? prev.recipientUserIds.filter((x) => x.toLowerCase() !== idOrUsername.toLowerCase())
          : [...prev.recipientUserIds, idOrUsername],
      };
    });
  };

  const toggleGroupRecipient = (groupId: string) => {
    if (!canEdit) return;
    setConfig((prev) => {
      const exists = prev.recipientGroupIds.some((x) => x.toLowerCase() === groupId.toLowerCase());
      return {
        ...prev,
        recipientGroupIds: exists
          ? prev.recipientGroupIds.filter((x) => x.toLowerCase() !== groupId.toLowerCase())
          : [...prev.recipientGroupIds, groupId],
      };
    });
  };

  const handleAddCustomEmail = () => {
    if (!canEdit) return;
    const raw = newEmailInput.trim();
    if (!raw) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      setEmailInputError(
        isEn ? 'Please enter a valid email address.' : 'لطفاً یک آدرس ایمیل معتبر وارد کنید.'
      );
      return;
    }
    setEmailInputError(null);
    setConfig((prev) => {
      if (prev.customEmails.some((e) => e.toLowerCase() === raw.toLowerCase())) return prev;
      return { ...prev, customEmails: [...prev.customEmails, raw] };
    });
    setNewEmailInput('');
  };

  const handleRemoveCustomEmail = (email: string) => {
    if (!canEdit) return;
    setConfig((prev) => ({
      ...prev,
      customEmails: prev.customEmails.filter((e) => e.toLowerCase() !== email.toLowerCase()),
    }));
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await saveHelpdeskNotificationConfigApi(config);
      if (res?.config) {
        setConfig(res.config);
      }
      setFeedback({
        type: 'success',
        text: isEn
          ? 'HelpDesk notification & email routing settings saved to PostgreSQL.'
          : 'تنظیمات ارسال اعلان و ایمیل بخش هلپ‌دسک با موفقیت در پایگاه داده ذخیره شد.',
      });
      setTimeout(() => setFeedback(null), 4500);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text:
          err?.message ||
          (isEn ? 'Failed to save HelpDesk notification settings.' : 'خطا در ذخیره تنظیمات اعلان هلپ‌دسک.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const cardSurface = isLightMode
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-slate-900/80 border-slate-800 text-slate-100';
  const subBox = isLightMode
    ? 'bg-slate-50 border-slate-200'
    : 'bg-slate-950/60 border-slate-800';
  const mutedText = isLightMode ? 'text-slate-600' : 'text-slate-400';

  const showUserPicker =
    config.recipientMode === 'selected_users' || config.recipientMode === 'selected_and_custom';
  const showCustomEmails =
    config.recipientMode === 'custom_emails' || config.recipientMode === 'selected_and_custom';

  return (
    <div className={`rounded-2xl border p-5 space-y-5 ${cardSurface}`} dir={isEn ? 'ltr' : 'rtl'}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3.5 border-b border-slate-700/20">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-500 shrink-0">
            <Headphones className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold">
                {isEn
                  ? 'HelpDesk Failure & Security Alert Notifications'
                  : 'تنظیمات اعلان و ارسال ایمیل خطاهای هلپ‌دسک (HelpDesk)'}
              </h2>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                  config.enabled
                    ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                    : isLightMode
                    ? 'bg-slate-100 text-slate-600 border-slate-300'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {config.enabled
                  ? isEn
                    ? 'ACTIVE'
                    : 'فعال'
                  : isEn
                  ? 'DISABLED (DEFAULT)'
                  : 'غیرفعال (پیش‌فرض)'}
              </span>
              <FieldInfoTooltip
                isEn={isEn}
                isLightMode={isLightMode}
                title={isEn ? 'HelpDesk Alert Routing' : 'مسیریابی اعلان‌های هلپ‌دسک'}
                infoWhatEn="Controls whether failed HelpDesk endpoint connections, access denials, or circuit-breaker trips send email or Inbox alerts, and selects exact recipients."
                infoWhatFa="مشخص می‌کند آیا خطاهای اتصال در صفحه هلپ‌دسک، تلاش‌های غیرمجاز یا فعال‌شدن مدارقطع‌کن امنیتی ایمیل یا اعلان ارسال کنند یا خیر، و دقیقاً برای چه کسانی ارسال شود."
                infoWhyEn="Prevents unnecessary email floods during routine workstation troubleshooting while allowing targeted alerting for HelpDesk managers when needed."
                infoWhyFa="از ارسال ایمیل‌های مزاحم هنگام تست یا عیب‌یابی سیستم کاربران جلوگیری می‌کند و به مدیر اجازه می‌دهد دقیقاً تعیین کند هشدارها فقط برای افراد مشخص ارسال شود."
                infoExampleEn="Keep Disabled during rollout, or Enable Email only for 'HelpDesk Managers' group + helpdesk-lead@company.com."
                infoExampleFa="در حالت عادی غیرفعال بگذارید یا فقط برای گروه مدیران هلپ‌دسک و ایمیل helpdesk-lead@company.com فعال کنید."
              />
            </div>
            <p className={`text-xs mt-1 ${mutedText}`}>
              {isEn
                ? 'Audit logs are always recorded regardless of this setting. Enable below only if you want email or Inbox alerts dispatched to chosen recipients.'
                : 'گزارش کامل ممیزی (Audit Log) همواره در سیستم ثبت می‌شود. گزینه‌های زیر را فقط در صورتی فعال کنید که مایل به ارسال ایمیل یا اعلان به گیرندگان مشخص هستید.'}
            </p>
          </div>
        </div>

        <span
          className={`px-2.5 py-1 rounded-lg font-mono font-bold text-[10px] border shrink-0 ${
            smtpConfigured
              ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
              : 'bg-amber-500/15 text-amber-500 border-amber-500/30'
          }`}
        >
          {smtpConfigured
            ? isEn
              ? 'SMTP Ready'
              : 'سرور SMTP آماده'
            : isEn
            ? 'SMTP Not Configured'
            : 'SMTP تنظیم نشده'}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 gap-2 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
          <span>{isEn ? 'Loading HelpDesk notification routing...' : 'در حال بارگذاری تنظیمات اعلان هلپ‌دسک...'}</span>
        </div>
      ) : (
        <div className="space-y-4">
          {feedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Master Enable Toggle */}
          <label
            className={`flex items-center justify-between gap-4 p-3.5 rounded-xl border ${
              canEdit ? 'cursor-pointer' : 'opacity-75 cursor-not-allowed'
            } ${
              config.enabled
                ? isLightMode
                  ? 'bg-teal-50/70 border-teal-300'
                  : 'bg-teal-950/30 border-teal-500/40'
                : subBox
            }`}
          >
            <div>
              <div className="text-xs font-bold">
                {isEn
                  ? 'Enable Automated Alerts for HelpDesk Events'
                  : 'فعال‌سازی ارسال اعلان خودکار برای رویدادهای هلپ‌دسک'}
              </div>
              <div className={`text-[11px] mt-0.5 ${mutedText}`}>
                {isEn
                  ? 'When disabled, failed workstation connections in HelpDesk will NOT send any email or Inbox alert.'
                  : 'در صورت غیرفعال بودن، خطاهای اتصال به سیستم کاربران در صفحه هلپ‌دسک هیچ ایمیل یا اعلانی ارسال نمی‌کنند.'}
              </div>
            </div>
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={config.enabled}
              onChange={(e) => setConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="w-4 h-4 rounded accent-teal-600 cursor-pointer shrink-0"
            />
          </label>

          {config.enabled && (
            <div className="space-y-4">
              {/* Row 1: Delivery Channels + Event Triggers */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Channels */}
                <div className={`rounded-xl border p-4 space-y-2.5 ${subBox}`}>
                  <div className="flex items-center gap-2 text-xs font-bold pb-1.5 border-b border-slate-700/20">
                    <Mail className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{isEn ? 'Delivery Channels' : 'کانال‌های ارسال'}</span>
                  </div>

                  <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
                    <div>
                      <span className="text-xs font-semibold block">
                        {isEn ? 'Send Email Notification (SMTP)' : 'ارسال ایمیل (از طریق سرور SMTP)'}
                      </span>
                      <span className={`text-[11px] ${mutedText}`}>
                        {isEn
                          ? 'Dispatch email alert to selected recipients below.'
                          : 'ارسال ایمیل هشدار منحصراً برای گیرندگان انتخاب‌شده در پایین.'}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={config.sendEmail}
                      onChange={(e) => setConfig((prev) => ({ ...prev, sendEmail: e.target.checked }))}
                      className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
                    <div>
                      <span className="text-xs font-semibold block">
                        {isEn ? 'Send In-App Inbox Notification' : 'ارسال اعلان داخل صندوق پنل (Inbox)'}
                      </span>
                      <span className={`text-[11px] ${mutedText}`}>
                        {isEn
                          ? 'Deliver notification badge to selected panel users.'
                          : 'نمایش اعلان در زنگوله و صندوق پیام کاربران انتخاب‌شده پنل.'}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={config.sendInboxNotification}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, sendInboxNotification: e.target.checked }))
                      }
                      className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                    />
                  </label>
                </div>

                {/* Event Triggers */}
                <div className={`rounded-xl border p-4 space-y-2.5 ${subBox}`}>
                  <div className="flex items-center gap-2 text-xs font-bold pb-1.5 border-b border-slate-700/20">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                    <span>{isEn ? 'Which HelpDesk Events Trigger Alerts?' : 'کدام رویدادهای هلپ‌دسک اعلان بسازند؟'}</span>
                  </div>

                  <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
                    <span className="text-xs font-medium">
                      {isEn
                        ? 'Failed Endpoint Connection / Unreachable Workstation'
                        : 'خطای اتصال به سیستم کاربر / عدم پاسخگویی کلاینت'}
                    </span>
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={config.notifyOnConnectionFailure}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          notifyOnConnectionFailure: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded accent-teal-600 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
                    <span className="text-xs font-medium">
                      {isEn
                        ? 'Unauthorized RBAC Access Attempt (Denied)'
                        : 'تلاش غیرمجاز و رد دسترسی RBAC در هلپ‌دسک'}
                    </span>
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={config.notifyOnUnauthorizedAttempt}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          notifyOnUnauthorizedAttempt: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded accent-teal-600 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
                    <span className="text-xs font-medium">
                      {isEn
                        ? 'Anti-Ransomware Circuit Breaker Tripped'
                        : 'فعال‌شدن مدارقطع‌کن امنیتی ضدباج‌افزار'}
                    </span>
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={config.notifyOnRateLimitTripped}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          notifyOnRateLimitTripped: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded accent-teal-600 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Row 2: Recipient Selection */}
              <div className={`rounded-xl border p-4 space-y-3.5 ${subBox}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-700/20">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <Users className="w-3.5 h-3.5 text-sky-500" />
                    <span>{isEn ? 'Alert Recipients (Who Should Receive Alerts?)' : 'گیرندگان اعلان و ایمیل (برای چه کسانی ارسال شود؟)'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        {
                          id: 'selected_users',
                          en: 'Specific Users / Groups',
                          fa: 'کاربران و گروه‌های مشخص',
                        },
                        {
                          id: 'custom_emails',
                          en: 'Custom Email Addresses',
                          fa: 'ایمیل‌های دلخواه',
                        },
                        {
                          id: 'selected_and_custom',
                          en: 'Users/Groups + Custom Emails',
                          fa: 'کاربران + ایمیل‌های دلخواه',
                        },
                        {
                          id: 'super_admins',
                          en: 'All Super Admins',
                          fa: 'همه مدیران ارشد',
                        },
                      ] as { id: HelpdeskNotificationRecipientMode; en: string; fa: string }[]
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setConfig((prev) => ({ ...prev, recipientMode: m.id }))}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                          config.recipientMode === m.id
                            ? 'bg-sky-600 text-white border-sky-500'
                            : isLightMode
                            ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                            : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                        }`}
                      >
                        {isEn ? m.en : m.fa}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Panel Users & Groups Selector */}
                {showUserPicker && (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
                      <input
                        type="text"
                        value={recipientSearch}
                        onChange={(e) => setRecipientSearch(e.target.value)}
                        placeholder={
                          isEn
                            ? 'Search panel users, AD users, or groups...'
                            : 'جستجوی کاربران محلی، کاربران دامین یا گروه‌ها...'
                        }
                        className={`w-full ps-8 pe-3 py-2 rounded-lg border text-xs outline-none ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-900'
                            : 'bg-slate-900 border-slate-700 text-slate-100'
                        }`}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Users */}
                      <div
                        className={`rounded-lg border p-3 max-h-48 overflow-y-auto space-y-1.5 ${
                          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-slate-800'
                        }`}
                      >
                        <div className="text-[11px] font-bold flex items-center justify-between pb-1 border-b border-slate-700/20">
                          <span className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-sky-500" />
                            {isEn ? 'Users' : 'کاربران'}
                          </span>
                          <span className="font-mono text-[10px] text-sky-500">
                            {config.recipientUserIds.length} {isEn ? 'selected' : 'انتخاب‌شده'}
                          </span>
                        </div>
                        {filteredUsers.length === 0 ? (
                          <p className={`text-[11px] py-2 ${mutedText}`}>
                            {isEn ? 'No users found.' : 'کاربری یافت نشد.'}
                          </p>
                        ) : (
                          filteredUsers.map((u) => {
                            const key = u.username || u.id;
                            const checked = config.recipientUserIds.some(
                              (x) =>
                                x.toLowerCase() === key.toLowerCase() ||
                                x.toLowerCase() === u.id.toLowerCase()
                            );
                            return (
                              <label
                                key={u.id}
                                className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer ${
                                  checked
                                    ? isLightMode
                                      ? 'bg-sky-50 text-sky-900'
                                      : 'bg-sky-500/15 text-sky-200'
                                    : isLightMode
                                    ? 'hover:bg-slate-50'
                                    : 'hover:bg-slate-800/60'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="font-medium truncate">{u.label}</div>
                                  <div className={`text-[10px] truncate ${mutedText}`}>
                                    {u.roleOrType}
                                  </div>
                                </div>
                                <input
                                  type="checkbox"
                                  disabled={!canEdit}
                                  checked={checked}
                                  onChange={() => toggleUserRecipient(key)}
                                  className="w-3.5 h-3.5 rounded accent-sky-600 cursor-pointer shrink-0"
                                />
                              </label>
                            );
                          })
                        )}
                      </div>

                      {/* Groups */}
                      <div
                        className={`rounded-lg border p-3 max-h-48 overflow-y-auto space-y-1.5 ${
                          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-slate-800'
                        }`}
                      >
                        <div className="text-[11px] font-bold flex items-center justify-between pb-1 border-b border-slate-700/20">
                          <span className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-indigo-500" />
                            {isEn ? 'Groups (Local & AD)' : 'گروه‌ها (محلی و دامین)'}
                          </span>
                          <span className="font-mono text-[10px] text-indigo-500">
                            {config.recipientGroupIds.length} {isEn ? 'selected' : 'انتخاب‌شده'}
                          </span>
                        </div>
                        {filteredGroups.length === 0 ? (
                          <p className={`text-[11px] py-2 ${mutedText}`}>
                            {isEn ? 'No groups found.' : 'گروهی یافت نشد.'}
                          </p>
                        ) : (
                          filteredGroups.map((g) => {
                            const checked = config.recipientGroupIds.some(
                              (x) =>
                                x.toLowerCase() === g.id.toLowerCase() ||
                                x.toLowerCase() === g.label.toLowerCase()
                            );
                            return (
                              <label
                                key={g.id}
                                className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer ${
                                  checked
                                    ? isLightMode
                                      ? 'bg-indigo-50 text-indigo-900'
                                      : 'bg-indigo-500/15 text-indigo-200'
                                    : isLightMode
                                    ? 'hover:bg-slate-50'
                                    : 'hover:bg-slate-800/60'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="font-medium truncate">{g.label}</div>
                                  <div className={`text-[10px] truncate ${mutedText}`}>
                                    {g.roleOrType}
                                  </div>
                                </div>
                                <input
                                  type="checkbox"
                                  disabled={!canEdit}
                                  checked={checked}
                                  onChange={() => toggleGroupRecipient(g.id)}
                                  className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer shrink-0"
                                />
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Custom Email Addresses */}
                {showCustomEmails && (
                  <div className="space-y-2.5">
                    <label className="block text-xs font-semibold">
                      {isEn ? 'Custom Email Recipients' : 'آدرس‌های ایمیل دلخواه گیرندگان'}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        dir="ltr"
                        disabled={!canEdit}
                        value={newEmailInput}
                        onChange={(e) => {
                          setNewEmailInput(e.target.value);
                          setEmailInputError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomEmail();
                          }
                        }}
                        placeholder="helpdesk-lead@company.com"
                        className={`flex-1 px-3 py-2 rounded-lg border text-xs font-mono outline-none ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-900'
                            : 'bg-slate-900 border-slate-700 text-slate-100'
                        }`}
                      />
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={handleAddCustomEmail}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Add' : 'افزودن'}</span>
                      </button>
                    </div>
                    {emailInputError && <p className="text-[11px] text-rose-500">{emailInputError}</p>}

                    {config.customEmails.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {config.customEmails.map((em) => (
                          <span
                            key={em}
                            dir="ltr"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-mono ${
                              isLightMode
                                ? 'bg-white border-slate-300 text-slate-800'
                                : 'bg-slate-900 border-slate-700 text-slate-200'
                            }`}
                          >
                            <Mail className="w-3 h-3 text-sky-500" />
                            <span>{em}</span>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => handleRemoveCustomEmail(em)}
                                className="text-slate-400 hover:text-rose-500 cursor-pointer"
                                aria-label="Remove email"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className={`text-[11px] ${mutedText}`}>
                        {isEn
                          ? 'No custom email recipients added yet.'
                          : 'هنوز هیچ آدرس ایمیل دلخواهی اضافه نشده است.'}
                      </p>
                    )}
                  </div>
                )}

                {config.recipientMode === 'super_admins' && (
                  <p className={`text-xs flex items-center gap-2 ${mutedText}`}>
                    <Bell className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                    <span>
                      {isEn
                        ? 'Alerts will be dispatched to all active Super Administrator accounts with routable email addresses.'
                        : 'اعلان‌ها به تمامی حساب‌های فعال مدیر ارشد (Super Admin) که دارای ایمیل معتبر هستند ارسال خواهد شد.'}
                    </span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Save Footer */}
          {canEdit ? (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <span className={`text-[11px] ${mutedText}`}>
                {config.updated_at
                  ? isEn
                    ? `Last updated by ${config.updated_by || 'admin'} on ${new Date(config.updated_at).toLocaleString()}`
                    : `آخرین ذخیره توسط ${config.updated_by || 'admin'} در ${new Date(config.updated_at).toLocaleString('fa-IR')}`
                  : isEn
                  ? 'Default policy: HelpDesk failure emails are OFF until enabled here.'
                  : 'سیاست پیش‌فرض: ارسال ایمیل خطاهای هلپ‌دسک تا زمان فعال‌سازی در این بخش خاموش است.'}
              </span>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>
                  {isEn ? 'Save HelpDesk Notification Policy' : 'ذخیره تنظیمات اعلان هلپ‌دسک'}
                </span>
              </button>
            </div>
          ) : (
            <p className={`text-[11px] ${mutedText}`}>
              {isEn
                ? 'Read-only view: Only Super Administrators can modify global HelpDesk alert routing.'
                : 'نمایش فقط‌خواندنی: تنها مدیر ارشد (Super Admin) می‌تواند سیاست ارسال اعلان‌های هلپ‌دسک را تغییر دهد.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
