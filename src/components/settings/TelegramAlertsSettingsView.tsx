import React, { useState, useEffect } from 'react';
import {
  BellRing,
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
  Settings,
  HelpCircle,
  Copy,
  ExternalLink,
  Flame,
  Radio,
  Zap,
  Activity,
  Network,
  Cpu,
  DatabaseBackup,
  ServerCrash,
  MessageSquare,
  Bot,
  Users2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { TelegramAlertConfig, TelegramTestResult } from '../../types';
import {
  fetchTelegramConfigApi,
  saveTelegramConfigApi,
  testTelegramConfigApi
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { isUserSuperAdmin } from '../../utils/rbac';
import { APP_VERSION } from '../../version';

interface TelegramAlertsSettingsViewProps {
  isLightMode?: boolean;
}

export const TelegramAlertsSettingsView: React.FC<TelegramAlertsSettingsViewProps> = ({
  isLightMode = false,
}) => {
  const { isRtl, isEn } = useLanguage();
  const { user, effectivePolicy } = useAuth();
  const isSuperAdmin = isUserSuperAdmin(user, effectivePolicy);

  // Form State
  const [formData, setFormData] = useState<TelegramAlertConfig>({
    enabled: false,
    bot_token: '',
    has_token: false,
    chat_id: '',
    proxy_url: '',
    notify_on_host_down: true,
    notify_on_port_down: true,
    notify_on_high_cpu: true,
    notify_on_backup_failure: true,
    notify_on_security_events: true,
    anti_flap_damping_sec: 60,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [isChangingToken, setIsChangingToken] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Live Test State
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TelegramTestResult | null>(null);

  // Interactive Guide State (Accordion expanded by default for new setups)
  const [isGuideOpen, setIsGuideOpen] = useState(true);
  const [activeGuideStep, setActiveGuideStep] = useState<1 | 2 | 3>(1);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Load saved configuration from backend
  useEffect(() => {
    fetchTelegramConfigApi()
      .then((res) => {
        if (res.config) {
          setFormData({
            ...res.config,
            anti_flap_damping_sec: res.config.anti_flap_damping_sec || 60,
          });
          // If already configured and enabled, collapse guide to keep UI compact
          if (res.config.enabled && res.config.chat_id) {
            setIsGuideOpen(false);
          }
        }
      })
      .catch((err) => {
        console.warn('Could not load Telegram alert configuration:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const handleInputChange = (field: keyof TelegramAlertConfig, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2500);
  };

  // Save Configuration Handler
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setSaveFeedback(null);

    try {
      const payload: Partial<TelegramAlertConfig> = {
        enabled: formData.enabled,
        chat_id: formData.chat_id.trim(),
        proxy_url: (formData.proxy_url || '').trim(),
        notify_on_host_down: Boolean(formData.notify_on_host_down),
        notify_on_port_down: Boolean(formData.notify_on_port_down),
        notify_on_high_cpu: Boolean(formData.notify_on_high_cpu),
        notify_on_backup_failure: Boolean(formData.notify_on_backup_failure),
        notify_on_security_events: Boolean(formData.notify_on_security_events),
        anti_flap_damping_sec: Number(formData.anti_flap_damping_sec) || 60,
      };

      // Only send bot_token if user actually typed a new one
      if (formData.bot_token && formData.bot_token !== '••••••••') {
        payload.bot_token = formData.bot_token.trim();
      }

      const res = await saveTelegramConfigApi(payload);
      if (res.success && res.config) {
        setFormData({
          ...res.config,
          anti_flap_damping_sec: res.config.anti_flap_damping_sec || 60,
        });
        setIsChangingToken(false);
        setSaveFeedback({
          type: 'success',
          message: isEn
            ? (res.message || 'Telegram alerting configuration saved and synced successfully.')
            : (res.message_fa || 'تنظیمات هشدارهای تلگرام با موفقیت در سیستم ذخیره و همگام شد.'),
        });
      }
    } catch (err: any) {
      setSaveFeedback({
        type: 'error',
        message: err.message || (isEn ? 'Failed to save configuration' : 'خطا در ذخیره تنظیمات هشدارهای تلگرام'),
      });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveFeedback(null), 6000);
    }
  };

  // Test Alert Dispatch Handler
  const handleTestAlert = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const payload: {
        config?: Partial<TelegramAlertConfig>;
        botToken?: string;
        chatId?: string;
        proxyUrl?: string;
      } = {
        chatId: formData.chat_id.trim(),
        proxyUrl: (formData.proxy_url || '').trim(),
      };

      if (formData.bot_token && formData.bot_token !== '••••••••') {
        payload.botToken = formData.bot_token.trim();
      }

      const res = await testTelegramConfigApi(payload);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'Failed to dispatch test alert',
        error_fa: err.message || 'خطا در ارسال پیام تست تلگرام',
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
            ? 'Access Denied: Only Super Administrator can configure Telegram Alerting & Incidents.'
            : 'عدم دسترسی: تنظیمات هشدارهای تلگرام منحصراً برای مدیر ارشد (Super Admin) مجاز است.'}
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 max-w-7xl mx-auto px-2 sm:px-4 py-4 animate-fadeIn ${isRtl ? 'rtl' : 'ltr'}`}>
      {/* Dynamic Sub-Menu Top Banner */}
      <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl border shadow-xl backdrop-blur-xl ${
        isLightMode
          ? 'bg-gradient-to-r from-sky-50 via-indigo-50 to-white border-sky-200'
          : 'bg-gradient-to-r from-slate-900/90 via-sky-950/40 to-slate-900/90 border-white/10'
      }`}>
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white shadow-[0_0_25px_rgba(14,165,233,0.5)] border border-white/20">
            <BellRing className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-mono flex items-center gap-1 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                <Settings className="w-3 h-3" />
                <span>{isEn ? 'Settings' : 'تنظیمات'}</span>
                <ChevronRight className="w-3 h-3 rtl:rotate-180 text-slate-500" />
                <span>{isEn ? 'Alerting' : 'هشدارها'}</span>
              </span>
              <h1 className={`text-base sm:text-xl font-bold tracking-tight font-mono ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                {isEn ? 'Incident Alerting & Telegram Notifications' : 'اعلان‌ها و هشدارهای تلگرام (Incident Alerting)'}
              </h1>
              <span className="text-[10px] font-sans font-semibold px-2.5 py-0.5 rounded-full border bg-sky-500/20 text-sky-400 border-sky-500/30">
                NOC Bot API
              </span>
              {formData.enabled ? (
                <span className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full border bg-emerald-500/20 text-emerald-400 border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  {isEn ? 'ACTIVE / DISPATCHING' : 'فعال و آماده مخابره'}
                </span>
              ) : (
                <span className={`text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                  isLightMode
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  <Radio className="w-3 h-3 text-amber-500" />
                  {isEn ? 'MUTED / DISABLED' : 'غیرفعال / سکوت'}
                </span>
              )}
            </div>
            <p className={`text-xs mt-1 max-w-3xl ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
              {isEn
                ? 'Automated real-time dispatch of network outages, port state changes, CPU spikes, and backup results to Telegram channels or NOC operator groups with anti-flap throttling.'
                : 'مخابره خودکار و آنی رخدادهای بحرانی شبکه، قطعی پورت‌ها، اخطار پردازنده و نتایج بکاپ به کانال یا گروه‌های تلگرام با مکانیزم ضد رگبار (Anti-Flap).'}
            </p>
          </div>
        </div>

        {/* Quick Action Button for Guide */}
        <button
          type="button"
          onClick={() => setIsGuideOpen(!isGuideOpen)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer border ${
            isGuideOpen
              ? 'bg-sky-500/20 text-sky-400 border-sky-500/40 shadow-sm'
              : isLightMode
                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-sm'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
          }`}
        >
          <HelpCircle className="w-4 h-4 text-sky-400" />
          <span>{isEn ? 'Setup Guide' : 'راهنمای راه‌اندازی'}</span>
          {isGuideOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Save Feedback Banner */}
      {saveFeedback && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 transition-all animate-fadeIn ${
          saveFeedback.type === 'success'
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
        }`}>
          {saveFeedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span className="text-xs font-semibold">{saveFeedback.message}</span>
        </div>
      )}

      {/* Master Enable/Disable Switch & Status Card */}
      <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
        isLightMode
          ? 'bg-white border-slate-200 shadow-sm'
          : 'bg-slate-900/60 border-slate-800 backdrop-blur-md'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
              formData.enabled
                ? 'bg-sky-500/20 text-sky-400 border-sky-500/30 shadow-[0_0_15px_rgba(14,165,233,0.3)]'
                : isLightMode
                  ? 'bg-slate-100 text-slate-400 border-slate-200'
                  : 'bg-white/5 text-slate-500 border-white/5'
            }`}>
              <Send className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                  {isEn ? 'Master Telegram Notifications Switch' : 'کلید اصلی فعال‌سازی اطلاع‌رسانی تلگرام'}
                </span>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  title={isEn ? 'Master Alerting Switch' : 'کلید اصلی ارسال هشدار'}
                  infoWhatEn="Global on/off toggle for dispatching any automated notifications from NetTopology to Telegram."
                  infoWhatFa="کلید عمومی فعال یا غیرفعال‌سازی کلیه اعلان‌های خودکار ارسالی از سامانه NetTopology به تلگرام."
                  infoWhyEn="Allows immediate silencing of alerts during maintenance windows without deleting bot token or chat configurations."
                  infoWhyFa="به شما این امکان را می‌دهد که هنگام انجام تعمیرات یا تغییرات شبکه، بدون پاک کردن توکن، ارسال پیام‌ها را موقتاً خاموش کنید."
                  infoExampleEn="Toggle to ON once bot credentials and chat ID are verified."
                  infoExampleFa="پس از انجام تست موفقیت‌آمیز، این گزینه را روی حالت روشن قرار دهید."
                />
              </div>
              <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {formData.enabled
                  ? (isEn
                      ? 'NOC alert engine is armed. Configured network events will trigger live alerts to Telegram.'
                      : 'موتور هشدار فعال است. رویدادهای انتخاب‌شده شبکه به تلگرام مخابره خواهند شد.')
                  : (isEn
                      ? 'Alert engine is paused. No messages will be sent to Telegram even if network events occur.'
                      : 'موتور هشدار خاموش است. در صورت بروز هرگونه قطعی یا رویداد شبکه، پیامی به تلگرام ارسال نمی‌شود.')}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0 self-start sm:self-auto">
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={(e) => handleInputChange('enabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className={`w-14 h-7.5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:start-[3px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all ${
              formData.enabled
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 shadow-[0_0_15px_rgba(14,165,233,0.5)]'
                : isLightMode
                  ? 'bg-slate-300'
                  : 'bg-slate-700'
            }`}></div>
          </label>
        </div>
      </div>

      {/* Interactive Step-by-Step Help Card */}
      {isGuideOpen && (
        <div className={`rounded-2xl border transition-all overflow-hidden ${
          isLightMode
            ? 'bg-white border-sky-200 shadow-md'
            : 'bg-slate-900/80 border-sky-500/30 backdrop-blur-md shadow-2xl'
        }`}>
          {/* Guide Header */}
          <div className={`p-4 border-b flex items-center justify-between ${
            isLightMode ? 'bg-sky-50/70 border-sky-100' : 'bg-sky-950/20 border-white/5'
          }`}>
            <div className="flex items-center gap-2.5">
              <Bot className="w-5 h-5 text-sky-400" />
              <h2 className={`text-sm font-bold ${isLightMode ? 'text-sky-950' : 'text-sky-300'}`}>
                {isEn
                  ? '📖 Step-by-Step Telegram Bot & Destination Setup Guide'
                  : '📖 راهنمای گام‌به‌گام ساخت ربات، کانال و اتصال به تلگرام'}
              </h2>
            </div>
            <div className="flex items-center gap-1.5">
              {([1, 2, 3] as const).map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setActiveGuideStep(step)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeGuideStep === step
                      ? 'bg-sky-500 text-white shadow-sm'
                      : isLightMode
                        ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  {isEn ? `Step ${step}` : `مرحله ${step}`}
                </button>
              ))}
            </div>
          </div>

          {/* Guide Body */}
          <div className="p-5 space-y-4">
            {activeGuideStep === 1 && (
              <div className="space-y-3 animate-fadeIn">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                    1
                  </div>
                  <div className="space-y-2 flex-1">
                    <h3 className={`text-xs sm:text-sm font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn ? 'Create Bot via Telegram @BotFather' : 'مرحله ۱: ساخت ربات در تلگرام (دریافت Bot Token)'}
                    </h3>
                    <p className={`text-xs leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                      {isEn
                        ? 'Open official Telegram bot @BotFather and send the command to create a new dedicated network alerting bot:'
                        : 'در تلگرام وارد ربات رسمی BotFather@ شوید و دکمه Start را بزنید. سپس دستور زیر را ارسال کنید:'}
                    </p>

                    <div className="flex items-center gap-2 max-w-md">
                      <code className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-mono border ${
                        isLightMode ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-slate-950 border-white/10 text-sky-300'
                      }`}>
                        /newbot
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopy('/newbot')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                          copiedText === '/newbot'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : isLightMode
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                              : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                        }`}
                      >
                        {copiedText === '/newbot' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedText === '/newbot' ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی')}</span>
                      </button>
                    </div>

                    <ul className={`text-xs space-y-1.5 list-disc list-inside mt-2 ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                      <li>
                        {isEn
                          ? 'Choose a friendly display name (e.g. "NOC Network Monitor").'
                          : 'یک نام نمایشی برای ربات انتخاب کنید (مثلاً: NOC Network Monitor).'}
                      </li>
                      <li>
                        {isEn
                          ? 'Choose a username ending with "bot" (e.g. "MyCompany_Noc_Bot").'
                          : 'یک نام‌کاربری (Username) که به کلمه bot ختم شود انتخاب کنید (مثلاً: MyCompany_Noc_Bot).'}
                      </li>
                      <li>
                        {isEn
                          ? 'BotFather will issue your HTTP API Token (e.g. 7123456789:AAH...). Copy and paste it in the "Bot Token" field below.'
                          : 'متنی به شما نمایش داده می‌شود که حاوی HTTP API Token است (رشته‌ای شبیه به 7123456789:AAH...). این مقدار را کپی کرده و در فیلد Bot Token وارد کنید.'}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeGuideStep === 2 && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                    2
                  </div>
                  <div className="space-y-3 flex-1">
                    <h3 className={`text-xs sm:text-sm font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn ? 'Set Alert Destination (Choose 1 of 3 options)' : 'مرحله ۲: تعیین مقصد هشدارها (یکی از سه روش زیر به انتخاب شما)'}
                    </h3>

                    {/* Method 1: Channel */}
                    <div className={`p-3.5 rounded-xl border ${
                      isLightMode ? 'bg-sky-50/50 border-sky-200' : 'bg-white/[0.02] border-sky-500/20'
                    }`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Radio className="w-4 h-4 text-sky-400" />
                        <span className={`text-xs font-bold ${isLightMode ? 'text-sky-900' : 'text-sky-300'}`}>
                          {isEn ? 'Option 1 (Recommended): Telegram Channel' : 'روش اول (پیشنهادی برای تیم شبکه): ارسال به کانال تلگرام'}
                        </span>
                      </div>
                      <p className={`text-xs leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                        {isEn
                          ? 'Create a Telegram Channel (e.g. "NOC Alerts"). Go to Channel Settings → Administrators → Add your bot as Administrator with "Post Messages" permission.'
                          : 'یک کانال در تلگرام ایجاد کنید (مثلاً NOC Alerts). وارد تنظیمات کانال شوید و ربات خود را به عنوان مدیر (Administrator) با دسترسی Post Messages اضافه کنید.'}
                      </p>
                      <div className={`mt-2 text-[11px] p-2 rounded-lg border font-mono ${
                        isLightMode ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-950 border-white/5 text-slate-400'
                      }`}>
                        {isEn
                          ? '• Public Channel: Enter @YourChannelUsername in Chat ID field.\n• Private Channel: Forward a message from channel to @userinfobot to get numeric ID (-100xxxxxxxxxx).'
                          : '• کانال عمومی: نام‌کاربری کانال را وارد کنید (مثلاً MyCompany_Alerts@).\n• کانال خصوصی: یک پیام را به userinfobot@ فوروارد کنید تا شناسه منفی (-1001234567890) را به شما بدهد.'}
                      </div>
                    </div>

                    {/* Method 2: Group */}
                    <div className={`p-3.5 rounded-xl border ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/10'
                    }`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Users2 className="w-4 h-4 text-indigo-400" />
                        <span className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-slate-200'}`}>
                          {isEn ? 'Option 2: Network Ops Team Group' : 'روش دوم: ارسال به گروه تیم فنی (Group)'}
                        </span>
                      </div>
                      <p className={`text-xs leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                        {isEn
                          ? 'Add your bot to your IT/NOC Telegram Group. Temporarily add @userinfobot or @RawDataBot to the group to obtain the group negative chat ID (e.g. -456789012).'
                          : 'ربات را به گروه کاری ادمین‌های شبکه اضافه کنید. برای دریافت شناسه گروه، ربات userinfobot@ یا RawDataBot@ را موقتاً به گروه بیاورید تا آیدی منفی گروه را به شما نشان دهد.'}
                      </p>
                    </div>

                    {/* Method 3: Direct User Message */}
                    <div className={`p-3.5 rounded-xl border ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/10'
                    }`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <MessageSquare className="w-4 h-4 text-emerald-400" />
                        <span className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-slate-200'}`}>
                          {isEn ? 'Option 3: Direct Private Chat' : 'روش سوم: ارسال به چت شخصی شما (Direct Message)'}
                        </span>
                      </div>
                      <p className={`text-xs leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                        {isEn
                          ? 'Open a chat with your bot in Telegram and send /start. Check your numerical User ID via @userinfobot and enter it in the Chat ID field.'
                          : 'یک بار وارد پیوی ربات خود شوید و دکمه /start را بزنید. با مراجعه به ربات userinfobot@ در تلگرام، شناسه عددی حساب کاربری خود (User ID) را بگیرید و در پنل وارد کنید.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeGuideStep === 3 && (
              <div className="space-y-3 animate-fadeIn">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                    3
                  </div>
                  <div className="space-y-2 flex-1">
                    <h3 className={`text-xs sm:text-sm font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn ? 'Verify via Live Test Alert' : 'مرحله ۳: اعتبارسنجی با تست زنده و ذخیره'}
                    </h3>
                    <p className={`text-xs leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                      {isEn
                        ? '1. Enter your Bot Token and Destination Chat ID.\n2. Click the "Send Test Alert" button below to verify instant delivery.\n3. Turn on the "Master Telegram Switch" and click "Save Configuration".'
                        : '۱. توکن ربات و آیدی چت/کانال مقصد را در فرم زیر وارد کنید.\n۲. دکمه "ارسال هشدار تست زنده" را بزنید تا از دریافت پیام در تلگرام مطمئن شوید.\n۳. کلید اصلی را روشن کرده و دکمه "ذخیره تنظیمات" را کلیک فرمایید.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Credentials & Proxy Card */}
        <div className={`p-5 rounded-2xl border ${
          isLightMode
            ? 'bg-white border-slate-200 shadow-sm'
            : 'bg-slate-900/60 border-slate-800 backdrop-blur-md'
        }`}>
          <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-white/5">
            <Lock className="w-5 h-5 text-sky-400" />
            <h3 className={`text-sm font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
              {isEn ? 'Bot Credentials & Network Routing' : 'اعتبارنامه ربات تلگرام و تنظیمات پروکسی شبکه'}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Field 1: Bot Token */}
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                  <span>{isEn ? 'Telegram Bot Token' : 'توکن ربات تلگرام (Bot Token)'}</span>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    title={isEn ? 'Bot Token' : 'توکن ربات تلگرام'}
                    infoWhatEn="The unique HTTP API authentication secret issued by @BotFather upon creating your bot."
                    infoWhatFa="رشته کلید اختصاصی احراز هویت ربات که توسط BotFather@ تلگرام در زمان ساخت ربات صادر می‌شود."
                    infoWhyEn="Authenticates server dispatch requests against the official Telegram Bot API gateway."
                    infoWhyFa="به سرور اجازه می‌دهد پیام‌ها را با هویت ربات شما در تلگرام منتشر کند."
                    infoExampleEn="e.g. 7123456789:AAHk981-xyz99qwe-Abc123_qwer"
                    infoExampleFa="نمونه: 7123456789:AAHk981-xyz99qwe-Abc123_qwer"
                  />
                </label>

                {formData.has_token && !isChangingToken && (
                  <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Token Secured in Vault' : 'توکن در والت سرور ذخیره شده است'}</span>
                  </span>
                )}
              </div>

              {formData.has_token && !isChangingToken ? (
                <div className={`flex items-center justify-between p-2.5 rounded-xl border ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-white/5'
                }`}>
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-emerald-400" />
                    <span className="font-mono text-xs text-slate-400">••••••••••••••••••••••••••••••••••••</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingToken(true);
                      setFormData((prev) => ({ ...prev, bot_token: '' }));
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 transition-all cursor-pointer"
                  >
                    {isEn ? 'Change Token' : 'تغییر توکن'}
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={formData.bot_token || ''}
                    onChange={(e) => handleInputChange('bot_token', e.target.value)}
                    placeholder={isEn ? 'Paste bot token from @BotFather...' : 'توکن دریافتی از BotFather@ را اینجا وارد کنید...'}
                    className={`w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-sky-500/40 ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                        : 'bg-slate-950/60 border-white/10 text-white placeholder-slate-500'
                    } ${isRtl ? 'pl-20' : 'pr-20'}`}
                  />
                  <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1.5 ${isRtl ? 'left-2.5' : 'right-2.5'}`}>
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                      title={showToken ? (isEn ? 'Hide' : 'مخفی‌سازی') : (isEn ? 'Show' : 'نمایش')}
                    >
                      {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    {formData.has_token && isChangingToken && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsChangingToken(false);
                          setFormData((prev) => ({ ...prev, bot_token: '••••••••' }));
                        }}
                        className="text-[11px] text-slate-400 hover:text-white transition-all cursor-pointer px-1"
                      >
                        {isEn ? 'Cancel' : 'انصراف'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Field 2: Chat ID / Channel Username */}
            <div className="space-y-1.5">
              <label className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                <span>{isEn ? 'Destination Chat ID or Channel' : 'شناسه چت یا نام‌کاربری کانال (Chat ID)'}</span>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  title={isEn ? 'Chat ID / Destination' : 'شناسه مقصد هشدارها'}
                  infoWhatEn="The target Telegram channel, group, or user where alert notifications will be dispatched."
                  infoWhatFa="مقصد دریافت هشدارها که می‌تواند یک کانال تلگرام، گروه ادمین‌ها یا حساب شخصی باشد."
                  infoWhyEn="Specifies where incident payloads must be routed by the Telegram Bot API."
                  infoWhyFa="مشخص می‌کند که بات هشدارها را به کدام گروه یا کانال ارسال کند."
                  infoExampleEn="e.g. @noc_alerts or -1001234567890 or 987654321"
                  infoExampleFa="نمونه: noc_alerts@ یا شناسه کانال عددی 1001234567890- یا آیدی عددی کاربر"
                />
              </label>
              <input
                type="text"
                value={formData.chat_id || ''}
                onChange={(e) => handleInputChange('chat_id', e.target.value)}
                placeholder={isEn ? 'e.g. @noc_alerts or -1001234567890' : 'مثال: noc_alerts@ یا شناسه عددی -100...'}
                className={`w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-sky-500/40 ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                    : 'bg-slate-950/60 border-white/10 text-white placeholder-slate-500'
                }`}
              />
              <span className={`text-[11px] block ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'For public channels: @ChannelName. For private channels/groups: numeric ID with negative sign (-100...).'
                  : 'برای کانال عمومی: نام با @، برای کانال یا گروه خصوصی: شناسه عددی با علامت منفی (-100...).'}
              </span>
            </div>

            {/* Field 3: Network Proxy URL (Optional) */}
            <div className="space-y-1.5">
              <label className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                <span>{isEn ? 'Network Proxy / Reverse Proxy (Optional)' : 'پروکسی شبکه یا ریورس پروکسی (اختیاری)'}</span>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  title={isEn ? 'Network Proxy' : 'پروکسی شبکه'}
                  infoWhatEn="Proxy server or reverse proxy endpoint for servers with restricted outbound Internet access."
                  infoWhatFa="آدرس پروکسی شبکه (HTTP / SOCKS5) یا ریورس پروکسی برای سرورهایی که دسترسی مستقیم به تلگرام ندارند."
                  infoWhyEn="Bypasses outbound restrictions in isolated data centers or internal networks."
                  infoWhyFa="امکان ارسال هشدارها را برای سرورهای مستقر در شبکه داخلی بدون اینترنت مستقیم فراهم می‌سازد."
                  infoExampleEn="e.g. http://127.0.0.1:8080 or socks5://127.0.0.1:1080"
                  infoExampleFa="نمونه: http://127.0.0.1:8080 یا socks5://127.0.0.1:1080 یا خالی"
                />
              </label>
              <input
                type="text"
                value={formData.proxy_url || ''}
                onChange={(e) => handleInputChange('proxy_url', e.target.value)}
                placeholder={isEn ? 'e.g. http://127.0.0.1:8080 (Leave blank if not needed)' : 'مثال: http://127.0.0.1:8080 (در صورت عدم نیاز خالی بگذارید)'}
                className={`w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-sky-500/40 ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                    : 'bg-slate-950/60 border-white/10 text-white placeholder-slate-500'
                }`}
              />
              <span className={`text-[11px] block ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Supports HTTP CONNECT proxy, custom reverse proxy, or leave empty for direct connection.'
                  : 'پشتیبانی از پروکسی HTTP CONNECT، یا در صورت برقراری ارتباط مستقیم خالی بگذارید.'}
              </span>
            </div>

            {/* Field 4: Anti-Flap Damping Window */}
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>{isEn ? 'Anti-Flap & Flood Damping Window (Seconds)' : 'بازه زمانی ضد رگبار و مهار نوسان پورت (Anti-Flap Damping)'}</span>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    title={isEn ? 'Anti-Flap Damping' : 'مکانیزم ضد رگبار'}
                    infoWhatEn="Minimum quiet duration between alert dispatches for the exact same flapping interface or host."
                    infoWhatFa="حداقل بازه زمانی آرامش میان ارسال هشدارهای تکراری برای یک پورت یا سرور ناپایدار."
                    infoWhyEn="Prevents Telegram channel spam and rate-limit bans when a faulty cable or bad link flaps dozens of times a minute."
                    infoWhyFa="از اسپم شدن کانال تلگرام و بن شدن ربات در اثر قطع و وصل مکرر کابل شبکه جلوگیری می‌کند."
                    infoExampleEn="Recommended: 60 seconds (1 minute)."
                    infoExampleFa="مقدار استاندارد و پیشنهادی: ۶۰ ثانیه."
                  />
                </label>
                <span className="text-xs font-mono font-bold text-sky-400">
                  {formData.anti_flap_damping_sec} {isEn ? 'Seconds' : 'ثانیه'}
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="300"
                step="5"
                value={formData.anti_flap_damping_sec || 60}
                onChange={(e) => handleInputChange('anti_flap_damping_sec', parseInt(e.target.value, 10))}
                className="w-full accent-sky-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>10s ({isEn ? 'Fast' : 'سریع'})</span>
                <span>60s ({isEn ? 'Recommended' : 'استاندارد'})</span>
                <span>300s ({isEn ? 'Heavy Damping' : 'مهار شدید'})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Trigger Rules Matrix Card */}
        <div className={`p-5 rounded-2xl border ${
          isLightMode
            ? 'bg-white border-slate-200 shadow-sm'
            : 'bg-slate-900/60 border-slate-800 backdrop-blur-md'
        }`}>
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <Activity className="w-5 h-5 text-sky-400" />
              <div>
                <h3 className={`text-sm font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                  {isEn ? 'Trigger Rules Matrix (Event Dispatch Policy)' : 'ماتریس انتخاب رویدادها (Trigger Rules)'}
                </h3>
                <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isEn
                    ? 'Select which incident categories should immediately dispatch alert payloads to Telegram.'
                    : 'مشخص کنید چه نوع حوادث و اخطارهایی بلافاصله به کانال یا گروه تلگرام مخابره شوند.'}
                </p>
              </div>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
              5 {isEn ? 'Triggers Available' : 'رویداد قابل تنظیم'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Rule 1: Host Unreachable */}
            <label className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
              formData.notify_on_host_down
                ? isLightMode
                  ? 'bg-rose-50/60 border-rose-200'
                  : 'bg-rose-500/10 border-rose-500/30 shadow-sm'
                : isLightMode
                  ? 'bg-slate-50 border-slate-200 opacity-60'
                  : 'bg-white/[0.02] border-white/5 opacity-60'
            }`}>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                  <ServerCrash className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn ? 'Host Unreachable (Ping / SSH Drop)' : 'قطع ارتباط پینگ یا SSH سرور یا سوییچ'}
                    </span>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      title={isEn ? 'Host Down Alert' : 'هشدار قطعی هاست'}
                      infoWhatEn="Triggers whenever a monitored switch, router, or server fails ping ICMP or SSH poll."
                      infoWhatFa="به محض قطع شدن پینگ یا در دسترس نبودن سرور و سوییچ در شبکه ارسال می‌شود."
                      infoWhyEn="Instant incident detection prevents prolonged unannounced outages."
                      infoWhyFa="اطلاع سریع به تیم پشتیبانی پیش از گزارش کاربران."
                      infoExampleEn="Enabled by default."
                      infoExampleFa="به طور پیش‌فرض فعال است."
                    />
                  </div>
                  <span className={`text-[11px] block mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn ? '🔴 Critical Alert when target drops offline' : '🔴 ارسال هشدار قرمز هنگام قطع شدن سوییچ یا سرور'}
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.notify_on_host_down}
                onChange={(e) => handleInputChange('notify_on_host_down', e.target.checked)}
                className="w-4 h-4 rounded text-sky-500 focus:ring-sky-500 accent-sky-500 cursor-pointer"
              />
            </label>

            {/* Rule 2: Port Flap / Down */}
            <label className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
              formData.notify_on_port_down
                ? isLightMode
                  ? 'bg-amber-50/60 border-amber-200'
                  : 'bg-amber-500/10 border-amber-500/30 shadow-sm'
                : isLightMode
                  ? 'bg-slate-50 border-slate-200 opacity-60'
                  : 'bg-white/[0.02] border-white/5 opacity-60'
            }`}>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                  <Network className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn ? 'Critical Port State Down / Flap' : 'تغییر وضعیت پورت‌های حیاتی (Port Down/Flap)'}
                    </span>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      title={isEn ? 'Port State Alert' : 'هشدار وضعیت پورت'}
                      infoWhatEn="Monitors trunk and uplink ports on Cisco and MikroTik switches."
                      infoWhatFa="پایش وضعیت پورت‌های ترانک، آپ‌لینک و سرویس‌دهنده در تجهیزات سیسکو و میکروتیک."
                      infoWhyEn="Detects physical cable disconnects or SFP transceiver failures."
                      infoWhyFa="اطلاع‌رسانی فوری در صورت قطع کابل یا سوختن ماژول فیبر نوری."
                      infoExampleEn="Enabled by default."
                      infoExampleFa="به طور پیش‌فرض فعال است."
                    />
                  </div>
                  <span className={`text-[11px] block mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn ? '🟡 Warning when trunk / uplink interface goes down' : '🟡 هشدار هنگام قطعی پورت آپ‌لینک یا تغییر وضعیت ترانک'}
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.notify_on_port_down}
                onChange={(e) => handleInputChange('notify_on_port_down', e.target.checked)}
                className="w-4 h-4 rounded text-sky-500 focus:ring-sky-500 accent-sky-500 cursor-pointer"
              />
            </label>

            {/* Rule 3: High CPU / Memory >85% */}
            <label className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
              formData.notify_on_high_cpu
                ? isLightMode
                  ? 'bg-amber-50/60 border-amber-200'
                  : 'bg-amber-500/10 border-amber-500/30 shadow-sm'
                : isLightMode
                  ? 'bg-slate-50 border-slate-200 opacity-60'
                  : 'bg-white/[0.02] border-white/5 opacity-60'
            }`}>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn ? 'High CPU / RAM Saturation (>85%)' : 'اخطار مصرف بالای ۸۵٪ پردازنده و حافظه'}
                    </span>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      title={isEn ? 'Resource Saturation' : 'هشدار اشباع منابع'}
                      infoWhatEn="Alerts when server or router CPU or memory usage exceeds 85% threshold."
                      infoWhatFa="هشدار هنگامی که مصرف CPU یا RAM سرورها یا روترها از آستانه ۸۵٪ عبور کند."
                      infoWhyEn="Gives admins lead time to mitigate before services crash or throttle."
                      infoWhyFa="فرصت اقدام به ادمین پیش از قفل شدن سرور یا کندی شبکه."
                      infoExampleEn="Enabled by default."
                      infoExampleFa="به طور پیش‌فرض فعال است."
                    />
                  </div>
                  <span className={`text-[11px] block mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn ? '🟡 Resource overload warnings on remote servers' : '🟡 اخطار داغ شدن CPU یا پر شدن حافظه در سرورها'}
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.notify_on_high_cpu}
                onChange={(e) => handleInputChange('notify_on_high_cpu', e.target.checked)}
                className="w-4 h-4 rounded text-sky-500 focus:ring-sky-500 accent-sky-500 cursor-pointer"
              />
            </label>

            {/* Rule 4: Nightly Backup Report */}
            <label className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
              formData.notify_on_backup_failure
                ? isLightMode
                  ? 'bg-blue-50/60 border-blue-200'
                  : 'bg-blue-500/10 border-blue-500/30 shadow-sm'
                : isLightMode
                  ? 'bg-slate-50 border-slate-200 opacity-60'
                  : 'bg-white/[0.02] border-white/5 opacity-60'
            }`}>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
                  <DatabaseBackup className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn ? 'Automated Backup Job Status (Success & Fail)' : 'گزارش بکاپ‌گیری شبانه (موفق یا ناموفق)'}
                    </span>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      title={isEn ? 'Backup Reports' : 'گزارش وضعیت بکاپ'}
                      infoWhatEn="Daily scheduled disaster recovery backup execution summary."
                      infoWhatFa="گزارش روزانه اجرای موفق یا ناموفق پشتیبان‌گیری کلان شبکه."
                      infoWhyEn="Ensures disaster recovery state is validated every morning."
                      infoWhyFa="اطمینان از وجود نسخه پشتیبان سالم و معتبر هر روز صبح."
                      infoExampleEn="Enabled by default."
                      infoExampleFa="به طور پیش‌فرض فعال است."
                    />
                  </div>
                  <span className={`text-[11px] block mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn ? 'ℹ️ Nightly snapshot confirmation or failure report' : 'ℹ️ تاییدیه تهیه نسخه پشتیبان یا اخطار ناموفق بودن'}
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.notify_on_backup_failure}
                onChange={(e) => handleInputChange('notify_on_backup_failure', e.target.checked)}
                className="w-4 h-4 rounded text-sky-500 focus:ring-sky-500 accent-sky-500 cursor-pointer"
              />
            </label>

            {/* Rule 5: Security Events & Failed Logins */}
            <label className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all md:col-span-2 ${
              formData.notify_on_security_events
                ? isLightMode
                  ? 'bg-purple-50/60 border-purple-200'
                  : 'bg-purple-500/10 border-purple-500/30 shadow-sm'
                : isLightMode
                  ? 'bg-slate-50 border-slate-200 opacity-60'
                  : 'bg-white/[0.02] border-white/5 opacity-60'
            }`}>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 shrink-0">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn ? 'Security Events & Repeated Failed Logins' : 'هشدارهای امنیتی (تلاش برای لاگین ناموفق با رمز اشتباه)'}
                    </span>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      title={isEn ? 'Security Events' : 'هشدارهای امنیتی'}
                      infoWhatEn="Alerts on brute-force login attempts, policy violations, or unauthorized access."
                      infoWhatFa="هشدار در صورت تلاش‌های مکرر برای ورود با رمز اشتباه یا دسترسی غیرمجاز."
                      infoWhyEn="Protects network management console against credential stuffing attacks."
                      infoWhyFa="محافظت از پنل مدیریتی شبکه در برابر حملات جستجوی فراگیر (Brute Force)."
                      infoExampleEn="Enabled by default."
                      infoExampleFa="به طور پیش‌فرض فعال است."
                    />
                  </div>
                  <span className={`text-[11px] block mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn ? '🛡️ Brute-force threshold alerts and unauthorized SSH / panel access' : '🛡️ اخطار تلاش‌های مشکوک برای ورود به پنل یا دسترسی به تجهیزات'}
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.notify_on_security_events}
                onChange={(e) => handleInputChange('notify_on_security_events', e.target.checked)}
                className="w-4 h-4 rounded text-sky-500 focus:ring-sky-500 accent-sky-500 cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Action Controls & Live Test Card */}
        <div className={`p-5 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-4 ${
          isLightMode
            ? 'bg-white border-slate-200 shadow-sm'
            : 'bg-slate-900/60 border-slate-800 backdrop-blur-md'
        }`}>
          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Live Test Alert Button */}
            <button
              type="button"
              onClick={handleTestAlert}
              disabled={isTesting || (!formData.bot_token && !formData.has_token) || !formData.chat_id}
              className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border w-full md:w-auto ${
                isTesting
                  ? 'bg-slate-800 text-slate-400 border-slate-700 cursor-not-allowed'
                  : 'bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 border-sky-500/40 shadow-sm active:scale-95'
              }`}
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                  <span>{isEn ? 'Dispatching Test Alert...' : 'در حال مخابره پیام تست...'}</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 text-sky-400" />
                  <span>{isEn ? 'Send Live Test Alert' : 'ارسال هشدار تست زنده (Send Test Alert)'}</span>
                </>
              )}
            </button>
          </div>

          {/* Save Configuration Button */}
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 shadow-[0_0_20px_rgba(14,165,233,0.4)] active:scale-95 transition-all cursor-pointer w-full md:w-auto border border-white/20"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{isEn ? 'Saving Configuration...' : 'در حال ذخیره‌سازی...'}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{isEn ? 'Save Configuration' : 'ذخیره تنظیمات (Save)'}</span>
              </>
            )}
          </button>
        </div>

        {/* Live Test Results Card */}
        {testResult && (
          <div className={`p-5 rounded-2xl border transition-all animate-fadeIn ${
            testResult.success
              ? isLightMode
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
              : isLightMode
                ? 'bg-rose-50 border-rose-300 text-rose-950'
                : 'bg-rose-950/20 border-rose-500/40 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.15)]'
          }`}>
            <div className="flex items-start gap-3.5">
              {testResult.success ? (
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                  <AlertCircle className="w-6 h-6" />
                </div>
              )}

              <div className="space-y-2 flex-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-sm font-bold">
                    {testResult.success
                      ? (isEn ? '✅ Test Alert Dispatched Successfully!' : '✅ پیام تست با موفقیت به تلگرام مخابره شد!')
                      : (isEn ? '❌ Test Alert Delivery Failed' : '❌ خطا در ارسال پیام تست به تلگرام')}
                  </h4>
                  {testResult.messageId && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                      Message ID: #{testResult.messageId}
                    </span>
                  )}
                </div>

                {testResult.success ? (
                  <div className="space-y-1.5 text-xs">
                    <p className="leading-relaxed">
                      {isEn
                        ? `The test alert payload was confirmed by Telegram Bot API and delivered to destination chat.`
                        : `پیام تست با موفقیت توسط سرور تلگرام دریافت و به مقصد مورد نظر شما تحویل داده شد.`}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 pt-2 border-t border-emerald-500/20 font-mono text-[11px]">
                      <div>
                        <span className="opacity-70 block">{isEn ? 'Bot:' : 'ربات:'}</span>
                        <span className="font-bold">{testResult.botFirstName} (@{testResult.botUsername})</span>
                      </div>
                      <div>
                        <span className="opacity-70 block">{isEn ? 'Destination:' : 'مقصد:'}</span>
                        <span className="font-bold">{testResult.chatTitle || testResult.chatId}</span>
                      </div>
                      <div>
                        <span className="opacity-70 block">{isEn ? 'Status:' : 'وضعیت:'}</span>
                        <span className="font-bold text-emerald-400">HTTP 200 OK</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-xs">
                    <p className="font-semibold text-rose-400 leading-relaxed">
                      {isEn ? (testResult.error || 'Connection failed') : (testResult.error_fa || testResult.error || 'خطا در برقراری ارتباط')}
                    </p>
                    {testResult.details && (
                      <pre className={`p-2 rounded-lg text-[10px] font-mono overflow-x-auto border ${
                        isLightMode ? 'bg-white border-rose-200 text-slate-800' : 'bg-black/40 border-rose-500/20 text-rose-300'
                      }`}>
                        {JSON.stringify(testResult.details, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
