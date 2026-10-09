import React, { useState, useEffect } from 'react';
import {
  Mail,
  Send,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Server,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Info,
  Clock,
  Check,
  Globe,
  Sliders,
  ChevronRight,
  Settings
} from 'lucide-react';
import { EmailConfig, EmailTestResult } from '../../types';
import { fetchEmailConfigApi, saveEmailConfigApi, testEmailConfigApi } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { isUserSuperAdmin } from '../../utils/rbac';
import { APP_VERSION } from '../../version';

interface EmailSettingsViewProps {
  isLightMode?: boolean;
}

export const EmailSettingsView: React.FC<EmailSettingsViewProps> = ({
  isLightMode = false,
}) => {
  const { isRtl, isEn } = useLanguage();
  const { user, effectivePolicy } = useAuth();
  const isSuperAdmin = isUserSuperAdmin(user, effectivePolicy);

  // Form State
  const [formData, setFormData] = useState<EmailConfig>({
    smtp_host: '',
    smtp_port: 587,
    smtp_secure: 'tls',
    smtp_user: '',
    smtp_pass: '',
    has_password: false,
    from_email: '',
    from_name: 'NetTopology Alerts',
    require_auth: true,
    reject_unauthorized: false,
    allow_self_signed: true,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Test Email State
  const [testRecipient, setTestRecipient] = useState('');
  const [testSubject, setTestSubject] = useState('');
  const [testNotes, setTestNotes] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<EmailTestResult | null>(null);

  // Load saved configuration from server
  useEffect(() => {
    fetchEmailConfigApi()
      .then((res) => {
        if (res.config) {
          const cfg = res.config;
          const allowSelfSigned = cfg.allow_self_signed !== undefined
            ? Boolean(cfg.allow_self_signed)
            : (cfg.reject_unauthorized !== undefined ? !cfg.reject_unauthorized : true);
          setFormData({
            ...cfg,
            allow_self_signed: allowSelfSigned,
            reject_unauthorized: !allowSelfSigned,
          });
          if (res.config.from_email && !testRecipient) {
            setTestRecipient(res.config.from_email);
          }
        }
      })
      .catch((err) => {
        console.warn('Could not load email configuration:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const handleInputChange = (field: keyof EmailConfig, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Provider presets
  const applyPreset = (provider: 'gmail' | 'office365' | 'exchange' | 'yahoo' | 'custom') => {
    if (provider === 'gmail') {
      setFormData((prev) => ({
        ...prev,
        smtp_host: 'smtp.gmail.com',
        smtp_port: 587,
        smtp_secure: 'tls',
        require_auth: true,
        allow_self_signed: false,
        reject_unauthorized: true,
      }));
    } else if (provider === 'office365') {
      setFormData((prev) => ({
        ...prev,
        smtp_host: 'smtp.office365.com',
        smtp_port: 587,
        smtp_secure: 'tls',
        require_auth: true,
        allow_self_signed: false,
        reject_unauthorized: true,
      }));
    } else if (provider === 'exchange') {
      setFormData((prev) => ({
        ...prev,
        smtp_host: prev.smtp_host && !prev.smtp_host.includes('gmail') && !prev.smtp_host.includes('office365') && !prev.smtp_host.includes('yahoo') ? prev.smtp_host : '',
        smtp_port: 587,
        smtp_secure: 'tls',
        require_auth: true,
        allow_self_signed: true,
        reject_unauthorized: false,
      }));
    } else if (provider === 'yahoo') {
      setFormData((prev) => ({
        ...prev,
        smtp_host: 'smtp.mail.yahoo.com',
        smtp_port: 465,
        smtp_secure: 'ssl',
        require_auth: true,
        allow_self_signed: false,
        reject_unauthorized: true,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        smtp_host: '',
        smtp_port: 587,
        smtp_secure: 'tls',
        allow_self_signed: true,
        reject_unauthorized: false,
      }));
    }
  };

  // Save Settings
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setSaveFeedback(null);

    try {
      const res = await saveEmailConfigApi(formData);
      setFormData(res.config);
      setSaveFeedback({
        type: 'success',
        message: isEn
          ? 'Outgoing email settings successfully saved to database.'
          : 'تنظیمات ارسال ایمیل با موفقیت در پایگاه داده سرور ذخیره شد.',
      });
      setTimeout(() => setSaveFeedback(null), 4000);
    } catch (err: any) {
      setSaveFeedback({
        type: 'error',
        message: err.message || (isEn ? 'Failed to save email settings' : 'خطا در ذخیره‌سازی تنظیمات ایمیل'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Send Test Email
  const handleSendTestEmail = async () => {
    if (!testRecipient || !testRecipient.trim() || !testRecipient.includes('@')) {
      alert(isEn ? 'Please enter a valid recipient email address for testing.' : 'لطفاً یک آدرس ایمیل معتبر برای گیرنده وارد کنید.');
      return;
    }

    if (!formData.smtp_host || !formData.smtp_host.trim()) {
      alert(isEn ? 'Please enter the SMTP Host address.' : 'لطفاً آدرس سرور SMTP را وارد نمایید.');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testEmailConfigApi({
        config: formData,
        to: testRecipient.trim(),
        subject: testSubject.trim() || undefined,
        notes: testNotes.trim() || undefined,
      });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || (isEn ? 'Network error during test execution' : 'خطای ارتباطی در اجرای تست'),
        latencyMs: 0,
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-8 text-center text-slate-400">
        <p className="text-rose-400 font-bold mb-3">
          {isEn
            ? 'Access Denied: Only Super Administrator can configure outgoing email services.'
            : 'عدم دسترسی: منوی پیکربندی ایمیل منحصراً برای مدیر ارشد (Super Admin) مجاز است.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 py-3 animate-fadeIn pb-16">
      {/* Dynamic Sub-Menu Top Banner */}
      <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl border shadow-xl backdrop-blur-xl ${
        isLightMode
          ? 'bg-white border-slate-200'
          : 'bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-white/10'
      }`}>
        <div className="flex items-center gap-3.5">
          <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] border border-white/20">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                <Settings className="w-3 h-3" />
                <span>{isEn ? 'Settings' : 'تنظیمات'}</span>
                <ChevronRight className="w-3 h-3 rtl:rotate-180 text-slate-500" />
              </span>
              <h1 className="text-base sm:text-lg font-bold tracking-tight font-mono">
                {isEn ? 'Outgoing Mail Server & SMTP Account' : 'پیکربندی حساب ارسال ایمیل (SMTP)'}
              </h1>
              <span className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full border bg-cyan-500/20 text-cyan-300 border-cyan-500/30">
                SMTP
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
                v{APP_VERSION}
              </span>
            </div>
            <p className={`text-xs mt-1 max-w-3xl ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn
                ? 'Configure credentials and connection parameters for the system email account to dispatch automated alerts, reports, and notifications.'
                : 'معرفی حساب کاربری و تنظیمات سرور ایمیل جهت ارسال خودکار هشدارهای شبکه، گزارش‌های مانیتورینگ و اعلان‌های سیستم.'}
            </p>
          </div>
        </div>

        {/* Quick status pill */}
        <div className="flex items-center gap-2 shrink-0">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold ${
            formData.smtp_host && formData.has_password
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
          }`}>
            {formData.smtp_host && formData.has_password ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{isEn ? 'Account Configured' : 'اکانت معرفی شده'}</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{isEn ? 'Not Fully Configured' : 'نیاز به تکمیل تنظیمات'}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Preset Quick Selectors */}
      <div className={`p-4 rounded-2xl border ${
        isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-white/10'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 text-xs font-bold">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>{isEn ? 'Quick Provider Presets:' : 'الگوهای آماده سرویس‌دهندگان ایمیل:'}</span>
          </div>
          <span className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
            {isEn ? 'Click any provider to auto-fill recommended host and port settings' : 'برای تکمیل خودکار هاست و پورت استاندارد روی سرویس‌دهنده کلیک کنید'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <button
            type="button"
            onClick={() => applyPreset('gmail')}
            className={`p-3 rounded-xl border text-left rtl:text-right transition cursor-pointer flex flex-col justify-between ${
              formData.smtp_host === 'smtp.gmail.com'
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 ring-1 ring-cyan-500/30'
                : isLightMode
                ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                : 'bg-slate-800/80 hover:bg-slate-800 border-white/10 text-slate-200'
            }`}
          >
            <div className="font-bold text-xs">Google Gmail</div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">smtp.gmail.com:587</div>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('office365')}
            className={`p-3 rounded-xl border text-left rtl:text-right transition cursor-pointer flex flex-col justify-between ${
              formData.smtp_host === 'smtp.office365.com'
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 ring-1 ring-cyan-500/30'
                : isLightMode
                ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                : 'bg-slate-800/80 hover:bg-slate-800 border-white/10 text-slate-200'
            }`}
          >
            <div className="font-bold text-xs">Microsoft 365 / Cloud</div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">smtp.office365.com:587</div>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('exchange')}
            className={`p-3 rounded-xl border text-left rtl:text-right transition cursor-pointer flex flex-col justify-between ${
              formData.allow_self_signed && formData.smtp_host !== 'smtp.gmail.com' && formData.smtp_host !== 'smtp.office365.com' && formData.smtp_host !== 'smtp.mail.yahoo.com'
                ? 'bg-blue-500/20 border-blue-500/40 text-blue-300 ring-1 ring-blue-500/30'
                : isLightMode
                ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                : 'bg-slate-800/80 hover:bg-slate-800 border-white/10 text-slate-200'
            }`}
          >
            <div className="font-bold text-xs">{isEn ? 'Microsoft Exchange (On-Prem)' : 'مایکروسافت اکسچنج (داخلی)'}</div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">mail.company.local:587</div>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('yahoo')}
            className={`p-3 rounded-xl border text-left rtl:text-right transition cursor-pointer flex flex-col justify-between ${
              formData.smtp_host === 'smtp.mail.yahoo.com'
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 ring-1 ring-cyan-500/30'
                : isLightMode
                ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                : 'bg-slate-800/80 hover:bg-slate-800 border-white/10 text-slate-200'
            }`}
          >
            <div className="font-bold text-xs">Yahoo Mail</div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">smtp.mail.yahoo.com:465</div>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('custom')}
            className={`p-3 rounded-xl border text-left rtl:text-right transition cursor-pointer flex flex-col justify-between ${
              !formData.allow_self_signed && formData.smtp_host !== 'smtp.gmail.com' && formData.smtp_host !== 'smtp.office365.com' && formData.smtp_host !== 'smtp.mail.yahoo.com'
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300 ring-1 ring-indigo-500/30'
                : isLightMode
                ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                : 'bg-slate-800/80 hover:bg-slate-800 border-white/10 text-slate-200'
            }`}
          >
            <div className="font-bold text-xs">{isEn ? 'Custom / Corporate SMTP' : 'سایر میل سرورها'}</div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">mail.company.local</div>
          </button>
        </div>
      </div>

      {/* Main Grid: Settings Form & Live Diagnostic Test */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left / Column 1: Configuration Form (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          <form onSubmit={handleSave} className={`p-5 rounded-2xl border shadow-xl space-y-5 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-white/10'
          }`}>
            <div className="flex items-center justify-between border-b pb-3 border-white/10">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <h2 className="font-bold text-sm">
                  {isEn ? 'SMTP Connection & Account Parameters' : 'مشخصات سرور و حساب کاربری ایمیل'}
                </h2>
              </div>
              <span className={`text-[10px] font-mono ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {formData.updated_at ? `${isEn ? 'Updated:' : 'بروزرسانی:'} ${formData.updated_at.slice(0, 10)}` : ''}
              </span>
            </div>

            {/* Row 1: Host and Port */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold flex items-center gap-1.5">
                    <span>{isEn ? 'SMTP Server Host:' : 'آدرس هاست یا سرور ایمیل (SMTP Host):'}</span>
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'SMTP Server Host' : 'آدرس هاست سرور ایمیل'}
                    whatIsIt={isEn ? 'Domain name or IP address of the outgoing mail server.' : 'نام دامنه یا آی‌پی سرور ارسال ایمیل (مانند smtp.gmail.com).'}
                    whyIsItNeeded={isEn ? 'Required to establish TCP/IP socket connection with the mail transfer agent.' : 'جهت برقراری ارتباط سوکت با سرور مبدا ارسال ایمیل ضروری است.'}
                    practicalExample={isEn ? 'smtp.gmail.com or mail.yourcompany.com' : 'smtp.gmail.com یا mail.company.ir'}
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
                <input
                  type="text"
                  placeholder="e.g. smtp.gmail.com"
                  value={formData.smtp_host}
                  onChange={(e) => handleInputChange('smtp_host', e.target.value)}
                  required
                  className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none transition ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-800 focus:border-cyan-500' : 'bg-slate-950 border-white/20 text-white focus:border-cyan-400'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold flex items-center gap-1.5">
                    <span>{isEn ? 'Port:' : 'پورت:'}</span>
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'SMTP Port' : 'پورت سرور ایمیل'}
                    whatIsIt={isEn ? 'Listening network port of the target SMTP service.' : 'شماره پورت شبکه میل سرور مقصد.'}
                    whyIsItNeeded={isEn ? 'Standard ports are 587 (STARTTLS), 465 (SSL/TLS), or 25 (legacy relay).' : 'پورت‌های استاندارد شامل ۵۸۷ (STARTTLS) و ۴۶۵ (SSL مستقیم) هستند.'}
                    practicalExample={isEn ? '587 (TLS) or 465 (SSL)' : '۵۸۷ (STARTTLS) یا ۴۶۵ (SSL)'}
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
                <input
                  type="number"
                  placeholder="587"
                  value={formData.smtp_port}
                  onChange={(e) => handleInputChange('smtp_port', Number(e.target.value))}
                  required
                  className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none transition ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-800 focus:border-cyan-500' : 'bg-slate-950 border-white/20 text-white focus:border-cyan-400'
                  }`}
                />
              </div>
            </div>

            {/* Row 2: Security Encryption */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold">
                  {isEn ? 'Encryption Protocol:' : 'پروتکل رمزنگاری امنیتی (Security Protocol):'}
                </label>
                <FieldInfoTooltip
                  title={isEn ? 'Encryption Protocol' : 'پروتکل رمزنگاری'}
                  whatIsIt={isEn ? 'Cryptographic tunnel protocol for in-transit communication security.' : 'پروتکل رمزنگاری جهت امنیت انتقال پیام و اعتبارنامه‌ها در بستر شبکه.'}
                  whyIsItNeeded={isEn ? 'Protects credentials from wire interception.' : 'جلوگیری از شنود رمز عبور و متن ایمیل در مسیر تبادل دیتا.'}
                  practicalExample={isEn ? 'TLS (STARTTLS) is recommended for Port 587' : 'گزینه TLS (STARTTLS) برای پورت ۵۸۷ پیشنهاد می‌شود'}
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'tls', label: 'STARTTLS (TLS 1.2+)', sub: 'Port 587' },
                  { id: 'ssl', label: 'SSL / TLS Direct', sub: 'Port 465' },
                  { id: 'none', label: 'Plain (No SSL)', sub: 'Port 25 (Internal)' },
                ].map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => handleInputChange('smtp_secure', sec.id)}
                    className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                      formData.smtp_secure === sec.id
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold ring-1 ring-cyan-500/30'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        : 'bg-slate-950 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-semibold">{sec.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{sec.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Row 3: Account Credentials */}
            <div className={`p-4 rounded-xl border space-y-4 ${
              isLightMode ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-950/60 border-white/10'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{isEn ? 'Authentication Credentials' : 'اعتبارنامه‌های ورود به اکانت (Authentication):'}</span>
                </span>
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={formData.require_auth}
                    onChange={(e) => handleInputChange('require_auth', e.target.checked)}
                    className="rounded accent-cyan-500 cursor-pointer"
                  />
                  <span>{isEn ? 'Requires Authentication' : 'نیاز به احراز هویت دارد'}</span>
                </label>
              </div>

              {formData.require_auth && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold flex items-center gap-1">
                        <span>{isEn ? 'Username / Email Address:' : 'نام کاربری یا آدرس ایمیل:'}</span>
                        <span className="text-rose-500 font-bold">*</span>
                      </label>
                      <FieldInfoTooltip
                        title={isEn ? 'SMTP Username' : 'نام کاربری سرور ایمیل'}
                        whatIsIt={isEn ? 'Email address or username used to login to the SMTP server.' : 'نام کاربری یا آدرس ایمیل کامل اکانت جهت ورود به سرور.'}
                        whyIsItNeeded={isEn ? 'Authenticates permission to relay outbound messages. Exchange supports DOMAIN\\username, username@domain, or username.' : 'جهت تایید هویت ارسال پیام. اکسچنج از هر دو فرمت DOMAIN\\username و username@domain پشتیبانی می‌کند.'}
                        practicalExample={isEn ? 'alerts@company.com or DOMAIN\\username or user' : 'alerts@company.ir یا DOMAIN\\username یا user'}
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                    <input
                      type="text"
                      placeholder={isEn ? 'e.g. alerts@company.com or DOMAIN\\user' : 'مثال: alerts@company.com یا DOMAIN\\user'}
                      value={formData.smtp_user}
                      onChange={(e) => handleInputChange('smtp_user', e.target.value)}
                      required={formData.require_auth}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none transition ${
                        isLightMode ? 'bg-white border-slate-300 text-slate-800 focus:border-cyan-500' : 'bg-slate-900 border-white/20 text-white focus:border-cyan-400'
                      }`}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold flex items-center gap-1">
                        <span>{isEn ? 'Password / App Password:' : 'رمز عبور یا گذرواژه اپلیکیشن (App Password):'}</span>
                        <span className="text-rose-500 font-bold">*</span>
                      </label>
                      <FieldInfoTooltip
                        title={isEn ? 'Account Password' : 'رمز عبور اکانت'}
                        whatIsIt={isEn ? 'Secret password or provider-generated App Password.' : 'رمز عبور اکانت یا گذرواژه اختصاصی برنامه (App Password).'}
                        whyIsItNeeded={isEn ? 'Major providers (Google, Microsoft) require 16-character App Passwords when 2FA is active.' : 'سرویس‌دهندگان مدرن در صورت فعال بودن ورود دو مرحله‌ای به رمز اپلیکیشن نیاز دارند.'}
                        practicalExample={isEn ? 'xxxx xxxx xxxx xxxx (Google App Password)' : 'گذرواژه ۱۶ رقمی بدون فاصله'}
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder={formData.has_password ? (isEn ? '•••••••• (Saved Password)' : '•••••••• (رمز ذخیره شده است)') : '••••••••'}
                        value={formData.smtp_pass || ''}
                        onChange={(e) => handleInputChange('smtp_pass', e.target.value)}
                        className={`w-full px-3 py-2 ltr:pr-9 rtl:pl-9 rounded-xl text-xs font-mono border focus:outline-none transition ${
                          isLightMode ? 'bg-white border-slate-300 text-slate-800 focus:border-cyan-500' : 'bg-slate-900 border-white/20 text-white focus:border-cyan-400'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 ltr:right-2.5 rtl:left-2.5 flex items-center text-slate-400 hover:text-white cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {formData.has_password && (
                      <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>{isEn ? 'Password is saved on server. Leave blank to keep current.' : 'رمز عبور در سرور ذخیره است. برای حفظ آن نیازی به ورود مجدد نیست.'}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Row 4: Sender Identity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold">
                    {isEn ? 'Sender Email (From):' : 'آدرس ایمیل فرستنده (From Address):'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Sender Email (From)' : 'آدرس ایمیل فرستنده'}
                    whatIsIt={isEn ? 'Email address displayed in the message envelope and header.' : 'آدرس ایمیلی که به عنوان فرستنده پیام به گیرندگان نمایش داده می‌شود.'}
                    whyIsItNeeded={isEn ? 'If left blank, the SMTP username will automatically be used.' : 'در صورت خالی بودن، به طور خودکار از همان نام کاربری SMTP استفاده می‌گردد.'}
                    practicalExample={isEn ? 'no-reply@company.com' : 'no-reply@company.ir'}
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
                <input
                  type="email"
                  placeholder={formData.smtp_user || 'e.g. alerts@company.com'}
                  value={formData.from_email || ''}
                  onChange={(e) => handleInputChange('from_email', e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none transition ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-800 focus:border-cyan-500' : 'bg-slate-950 border-white/20 text-white focus:border-cyan-400'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold">
                    {isEn ? 'Sender Name (Display Name):' : 'نام نمایشی فرستنده (Display Name):'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Sender Display Name' : 'نام نمایشی فرستنده'}
                    whatIsIt={isEn ? 'Friendly brand name shown next to the sender email address.' : 'نام دوستانه و عنوان برند که کنار آدرس ایمیل برای گیرنده درج می‌شود.'}
                    whyIsItNeeded={isEn ? 'Ensures clear identification of automated network notifications.' : 'شناسایی شفاف مبدا هشدارهای شبکه در صندوق ورودی کاربر.'}
                    practicalExample={isEn ? 'NetTopology Security Alerts' : 'سیستم مانیتورینگ نت‌توپولوژی'}
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
                <input
                  type="text"
                  placeholder="e.g. NetTopology System Alerts"
                  value={formData.from_name || ''}
                  onChange={(e) => handleInputChange('from_name', e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none transition ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-800 focus:border-cyan-500' : 'bg-slate-950 border-white/20 text-white focus:border-cyan-400'
                  }`}
                />
              </div>
            </div>

            {/* Row 5: Certificate option */}
            <div className={`p-3 rounded-xl border ${
              isLightMode ? 'bg-cyan-50/50 border-cyan-200/60' : 'bg-cyan-950/20 border-cyan-500/20'
            }`}>
              <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={formData.allow_self_signed ?? !formData.reject_unauthorized}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    handleInputChange('allow_self_signed', checked);
                    handleInputChange('reject_unauthorized', !checked);
                  }}
                  className="rounded accent-cyan-500 cursor-pointer mt-0.5"
                />
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    <span>{isEn ? 'Allow Self-Signed / Untrusted TLS Certificates' : 'پذیرش سرتیفیکیت‌های خودامضا و CA داخلی (میل‌سرورهای سازمانی)'}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-normal bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      {isEn ? 'Recommended for Exchange' : 'ضروری برای اکسچنج سازمانی'}
                    </span>
                  </div>
                  <span className={`text-[11px] block mt-1 leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                    {isEn
                      ? 'Enable this option if your organization uses Microsoft Exchange or an internal mail relay with private Enterprise CA / self-signed certificate.'
                      : 'فعال‌سازی این گزینه برای اتصال به میل‌سرورهای داخلی سازمانی (مانند Microsoft Exchange) که از گواهی داخلی یا Self-Signed استفاده می‌کنند الزامی است.'}
                  </span>
                </div>
              </label>
            </div>

            {/* Save Feedback Toast */}
            {saveFeedback && (
              <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 animate-fadeIn ${
                saveFeedback.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              }`}>
                {saveFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{saveFeedback.message}</span>
              </div>
            )}

            {/* Form Action Buttons */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{isEn ? 'Saving Configuration...' : 'در حال ذخیره‌سازی...'}</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{isEn ? 'Save Email Configuration' : 'ذخیره تنظیمات حساب ایمیل'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right / Column 2: Live Diagnostic Test Feature (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className={`p-5 rounded-2xl border shadow-xl space-y-4 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-cyan-500/30'
          }`}>
            <div className="flex items-center gap-2.5 border-b pb-3 border-white/10">
              <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                <Send className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-bold text-sm">
                  {isEn ? 'SMTP Delivery Test & Diagnostic' : 'تست آنلاین ارسال و راستی‌آزمایی ایمیل'}
                </h2>
                <p className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isEn
                    ? 'Dispatch a real test message to verify outbound delivery'
                    : 'ارسال ایمیل واقعی به آدرس دلخواه جهت اطمینان از عملکرد اکانت'}
                </p>
              </div>
            </div>

            {/* Test recipient input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold flex items-center gap-1.5">
                  <span>{isEn ? 'Recipient Destination Email:' : 'آدرس ایمیل گیرنده برای تست:'}</span>
                  <span className="text-rose-500 font-bold">*</span>
                </label>
                <FieldInfoTooltip
                  title={isEn ? 'Recipient Test Email' : 'ایمیل گیرنده تست'}
                  whatIsIt={isEn ? 'Target inbox to receive the diagnostic test message.' : 'صندوق پستی مقصد که ایمیل تست به آن ارسال می‌شود.'}
                  whyIsItNeeded={isEn ? 'Empirical proof of deliverability and socket authentication.' : 'اثبات عملی موفقیت‌آمیز بودن احراز هویت و تحویل پیام.'}
                  practicalExample={isEn ? 'your_email@gmail.com' : 'ایمیل شخصی یا اداری شما'}
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <input
                type="email"
                placeholder="e.g. user@example.com"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none transition ${
                  isLightMode ? 'bg-white border-slate-300 text-slate-800 focus:border-cyan-500' : 'bg-slate-950 border-white/20 text-white focus:border-cyan-400'
                }`}
              />
            </div>

            {/* Optional subject */}
            <div>
              <label className="block text-xs font-semibold mb-1">
                {isEn ? 'Subject Line (Optional):' : 'موضوع ایمیل تست (اختیاری):'}
              </label>
              <input
                type="text"
                placeholder={isEn ? '[NetTopology] Email Gateway Diagnostic Test' : '[NetTopology] تست اتصال سامانه ایمیل'}
                value={testSubject}
                onChange={(e) => setTestSubject(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none transition ${
                  isLightMode ? 'bg-white border-slate-300 text-slate-800 focus:border-cyan-500' : 'bg-slate-950 border-white/20 text-white focus:border-cyan-400'
                }`}
              />
            </div>

            {/* Optional memo */}
            <div>
              <label className="block text-xs font-semibold mb-1">
                {isEn ? 'Test Note / Memo (Optional):' : 'یادداشت ضمیمه (اختیاری):'}
              </label>
              <textarea
                rows={2}
                placeholder={isEn ? 'e.g. Verification from primary datacenter router' : 'مثال: تست ارتباط از دیتاسنتر شماره یک'}
                value={testNotes}
                onChange={(e) => setTestNotes(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none transition resize-none ${
                  isLightMode ? 'bg-white border-slate-300 text-slate-800 focus:border-cyan-500' : 'bg-slate-950 border-white/20 text-white focus:border-cyan-400'
                }`}
              />
            </div>

            {/* Send button */}
            <button
              type="button"
              disabled={isTesting}
              onClick={handleSendTestEmail}
              className="w-full py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-cyan-600 via-indigo-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isEn ? 'Connecting & Sending Real Email...' : 'در حال اتصال به SMTP و ارسال ایمیل...'}</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{isEn ? 'Send Real Test Email Now' : 'ارسال ایمیل تست به گیرنده'}</span>
                </>
              )}
            </button>

            {/* Test Result Display Box */}
            {testResult && (
              <div className={`p-4 rounded-xl border space-y-2.5 animate-fadeIn text-xs ${
                testResult.success
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold">
                    {testResult.success ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{isEn ? 'Test Email Delivered Successfully!' : 'ایمیل تست با موفقیت ارسال و تحویل شد!'}</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>{isEn ? 'Test Delivery Failed' : 'ارسال ایمیل تست با شکست مواجه شد'}</span>
                      </>
                    )}
                  </div>
                  {testResult.latencyMs > 0 && (
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-black/40 border border-white/10 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-cyan-400" />
                      <span>{testResult.latencyMs} ms</span>
                    </span>
                  )}
                </div>

                {testResult.success ? (
                  <div className="space-y-1.5 text-[11px] text-slate-300 pt-1">
                    <p className="text-emerald-300 font-medium">
                      {isEn
                        ? `The message was accepted by ${formData.smtp_host} and queued/delivered to ${testRecipient}.`
                        : `پیام توسط سرور ${formData.smtp_host} پذیرفته شد و به آدرس ${testRecipient} ارسال گردید.`}
                    </p>
                    {testResult.messageId && (
                      <div className="font-mono text-[10px] text-slate-400 break-all p-2 rounded bg-black/30 border border-white/5">
                        <span className="text-slate-500 block">Message-ID:</span>
                        <span>{testResult.messageId}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 text-[11px] text-slate-300 pt-1">
                    <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 break-words font-mono text-[11px]">
                      {isEn ? testResult.error : (testResult.error_fa || testResult.error)}
                    </div>
                    {testResult.code && (
                      <div className="text-[10px] text-slate-400">
                        <span className="font-bold">{isEn ? 'Error Code:' : 'کد خطا:'}</span> {testResult.code}
                      </div>
                    )}

                    {/* Quick Fix Button for Certificate Errors */}
                    {(testResult.code === 'ECERT' || testResult.error?.toLowerCase().includes('certificate') || testResult.error?.toLowerCase().includes('self-signed')) && (
                      <button
                        type="button"
                        onClick={async () => {
                          const updated: EmailConfig = {
                            ...formData,
                            allow_self_signed: true,
                            reject_unauthorized: false,
                          };
                          setFormData(updated);
                          setIsTesting(true);
                          setTestResult(null);
                          try {
                            // Auto save updated config first
                            await saveEmailConfigApi(updated);
                            // Then trigger test
                            const res = await testEmailConfigApi({
                              config: updated,
                              to: testRecipient.trim(),
                              subject: testSubject.trim() || undefined,
                              notes: testNotes.trim() || undefined,
                            });
                            setTestResult(res);
                            if (res.success) {
                              setSaveFeedback({
                                type: 'success',
                                message: isEn
                                  ? "'Allow Self-Signed Certificates' enabled and verified successfully!"
                                  : 'گزینه پذیرش سرتیفیکیت خودامضا فعال شد و تست با موفقیت انجام گرفت!',
                              });
                              setTimeout(() => setSaveFeedback(null), 4000);
                            }
                          } catch (err: any) {
                            setTestResult({
                              success: false,
                              error: err.message || (isEn ? 'Diagnostic re-test failed' : 'اجرای مجدد تست با خطا مواجه شد'),
                              latencyMs: 0,
                            });
                          } finally {
                            setIsTesting(false);
                          }
                        }}
                        className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4 text-cyan-200" />
                        <span>
                          {isEn
                            ? "One-Click Fix: Enable 'Allow Self-Signed' & Retest Now"
                            : 'رفع سریع با یک کلیک: فعال‌سازی پذیرش سرتیفیکیت خودامضا و تست مجدد'}
                        </span>
                      </button>
                    )}

                    <div className="p-2 rounded bg-black/30 border border-white/5 text-[10px] text-slate-400 space-y-1">
                      <span className="font-bold text-amber-400 block">{isEn ? 'Troubleshooting Guide:' : 'راهنمای رفع مشکل:'}</span>
                      <ul className="list-disc list-inside space-y-0.5">
                        <li>{isEn ? "For Microsoft Exchange or internal relays, enable 'Allow Self-Signed / Untrusted TLS Certificates'" : "برای سرورهای اکسچنج سازمانی و رله‌های داخلی، تیک «پذیرش سرتیفیکیت‌های خودامضا و CA داخلی» را فعال کنید"}</li>
                        <li>{isEn ? 'For Exchange AD users, verify format: DOMAIN\\username or user@domain.com' : 'برای کاربران اکسچنج دامین، فرمت DOMAIN\\username یا user@domain.com را بررسی فرمایید'}</li>
                        <li>{isEn ? 'Ensure 2-Step Verification & App Password are used (for Gmail/Outlook)' : 'در جیمیل و اوت‌لوک، حتماً از App Password اختصاصی استفاده کنید'}</li>
                        <li>{isEn ? 'Verify SMTP port and security protocol alignment (587 STARTTLS vs 465 SSL)' : 'تطابق پورت و پروتکل امنیتی (پورت ۵۸۷ با TLS یا ۴۶۵ با SSL) را چک کنید'}</li>
                        <li>{isEn ? 'Check that outbound mail ports are not blocked by host firewall or ISP' : 'اطمینان حاصل کنید پورت‌های خروجی ایمیل توسط فایروال سرور یا ISP مسدود نشده باشند'}</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Integration Info Box */}
          <div className={`p-4 rounded-2xl border space-y-2 ${
            isLightMode ? 'bg-sky-50/70 border-sky-200 text-slate-700' : 'bg-slate-900/60 border-white/10 text-slate-300'
          }`}>
            <div className="flex items-center gap-2 text-xs font-bold text-sky-400">
              <Info className="w-4 h-4" />
              <span>{isEn ? 'Automated Notification Routing' : 'هدایت خودکار اعلان‌های سیستم'}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              {isEn
                ? 'Once configured, NetTopology utilizes this verified account to dispatch critical event alerts, configuration drift reports, and scheduled disaster recovery archive logs directly to administrators.'
                : 'پس از تکمیل و تست این حساب، سامانه نت‌توپولوژی کلیه گزارش‌های تغییرات کانفیگ، رخدادهای قطعی پورت و لاگ‌های زمانبندی بکاپ را به صورت خودکار از طریق این اکانت ارسال خواهد کرد.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
