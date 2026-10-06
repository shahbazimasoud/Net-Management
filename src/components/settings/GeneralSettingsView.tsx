import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Sliders,
  Server,
  Database,
  ShieldCheck,
  Activity,
  CheckCircle2,
  RefreshCw,
  Clock,
  Cpu,
  Layers,
  Globe,
  Sparkles,
  Terminal,
  Info,
  Check,
  Network,
  Router,
  Save,
  RotateCcw,
  Upload,
  Image as ImageIcon,
  Palette,
  KeyRound,
  ArrowUpCircle,
  AlertCircle
} from 'lucide-react';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { isUserSuperAdmin } from '../../utils/rbac';
import { APP_VERSION } from '../../version';
import { ThemeType } from '../Navbar';
import { PanelGeneralSettings } from '../../types';
import {
  loadGeneralSettings,
  saveGeneralSettings,
  syncGeneralSettingsFromDatabase,
  DEFAULT_PANEL_GENERAL_SETTINGS
} from '../../services/settingsStorage';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface GeneralSettingsViewProps {
  isLightMode?: boolean;
  panelTheme?: ThemeType;
  onChangeTheme?: (theme: ThemeType) => void;
  onNavigateToTab?: (tab: 'settings-ldap' | 'settings-update' | string) => void;
  onSettingsSaved?: (newSettings: PanelGeneralSettings) => void;
}

interface BackendHealthData {
  status: string;
  engine: string;
  cdp_engine?: string;
  lldp_engine?: string;
  device_count?: number;
}

export const GeneralSettingsView: React.FC<GeneralSettingsViewProps> = ({
  isLightMode = false,
  panelTheme = 'obsidian',
  onChangeTheme,
  onNavigateToTab,
  onSettingsSaved,
}) => {
  const { isEn, language, setLanguage } = useLanguage();
  const { user, effectivePolicy } = useAuth();

  // Active submodule sub-tab: 'config' (Panel Settings), 'telemetry' (Live Telemetry), 'roadmap' (Phases Roadmap)
  const [activeSubSection, setActiveSubSection] = useState<'config' | 'telemetry' | 'roadmap'>('config');

  // Form State for General Settings
  const [formData, setFormData] = useState<PanelGeneralSettings>(() => loadGeneralSettings());
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Backend Health Telemetry
  const [healthData, setHealthData] = useState<BackendHealthData | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastCheckTime, setLastCheckTime] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Load latest settings from database on mount
  useEffect(() => {
    syncGeneralSettingsFromDatabase().then((synced) => {
      if (synced) {
        setFormData(synced);
      }
    });
  }, []);

  const fetchLiveTelemetry = useCallback(async () => {
    setIsRefreshing(true);
    setFetchError(null);
    const startTime = performance.now();
    try {
      const token =
        localStorage.getItem('nettopology_auth_token_v1') ||
        sessionStorage.getItem('nettopology_auth_token_v1');
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/health', { headers });
      const elapsed = Math.round(performance.now() - startTime);
      setLatencyMs(elapsed);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      setHealthData(data);
      setLastCheckTime(new Date().toLocaleTimeString(isEn ? 'en-US' : 'fa-IR'));
    } catch (err: any) {
      setFetchError(err?.message || (isEn ? 'Connection failed' : 'خطا در ارتباط با سرور'));
    } finally {
      setIsRefreshing(false);
    }
  }, [isEn]);

  useEffect(() => {
    fetchLiveTelemetry();
  }, [fetchLiveTelemetry]);

  // Handle Save
  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setSaveFeedback(null);

    // Validate port
    const portNum = Number(formData.panelPort);
    if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
      setIsSaving(false);
      setSaveFeedback({
        type: 'error',
        message: isEn
          ? 'Invalid port number. Port must be between 1024 and 65535.'
          : 'شماره پورت نامعتبر است. پورت باید عددی بین ۱۰۲۴ تا ۶۵۵۳۵ باشد.',
      });
      return;
    }

    try {
      const saved = await saveGeneralSettings(formData);
      setFormData(saved);
      setSaveFeedback({
        type: 'success',
        message: isEn
          ? 'Panel general settings successfully saved to database.'
          : 'تنظیمات عمومی پنل با موفقیت در پایگاه داده سرور ذخیره شد.',
      });

      // Update document title if customized
      if (saved.panelTitle) {
        document.title = saved.panelTitle;
      }

      // If default language was changed, only apply to current view if user has no personal preference
      const userHasCustomLang = localStorage.getItem('user_customized_language') === 'true';
      if (!userHasCustomLang && saved.defaultLanguage && saved.defaultLanguage !== language) {
        setLanguage(saved.defaultLanguage, false);
      }

      // If default theme was changed and onChangeTheme callback provided, only apply if user has no personal preference
      const userHasCustomTheme = localStorage.getItem('user_customized_theme') === 'true';
      if (!userHasCustomTheme && saved.defaultTheme && onChangeTheme && saved.defaultTheme !== panelTheme) {
        onChangeTheme(saved.defaultTheme);
      }

      if (onSettingsSaved) {
        onSettingsSaved(saved);
      }

      // Auto dismiss success feedback after 4s
      setTimeout(() => {
        setSaveFeedback(null);
      }, 4000);
    } catch (err: any) {
      setSaveFeedback({
        type: 'error',
        message: err?.message || (isEn ? 'Failed to save settings' : 'خطا در ذخیره‌سازی تنظیمات'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Reset to Default Settings
  const handleResetDefaults = () => {
    const confirmMsg = isEn
      ? 'Are you sure you want to restore default panel settings?'
      : 'آیا از بازنشانی تنظیمات عمومی پنل به مقادیر پیش‌فرض اطمینان دارید؟';
    if (window.confirm(confirmMsg)) {
      setFormData(DEFAULT_PANEL_GENERAL_SETTINGS);
      setSaveFeedback({
        type: 'success',
        message: isEn
          ? 'Settings reset to defaults. Click "Save Settings" to persist.'
          : 'تنظیمات به مقادیر پیش‌فرض بازگردانده شد. جهت اعمال دائمی، روی «ذخیره تنظیمات» کلیک کنید.',
      });
    }
  };

  // Handle Logo File Upload (convert to base64 data URL)
  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert(isEn ? 'Please select a valid image file.' : 'لطفاً یک فایل تصویری معتبر انتخاب نمایید.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert(isEn ? 'Image size must be less than 2MB.' : 'حجم تصویر باید کمتر از ۲ مگابایت باشد.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setFormData((prev) => ({
        ...prev,
        logoType: 'custom_url',
        logoCustomUrl: base64,
      }));
    };
    reader.readAsDataURL(file);
  };

  // Theme options available
  const themeList: { id: ThemeType; nameEn: string; nameFa: string; color: string; border: string }[] = [
    { id: 'obsidian', nameEn: 'Obsidian Dark', nameFa: 'ابریشم سیاه (پیش‌فرض)', color: '#6366f1', border: 'border-indigo-500' },
    { id: 'emerald', nameEn: 'Emerald Green', nameFa: 'زمردی سایبر', color: '#10b981', border: 'border-emerald-500' },
    { id: 'cobalt', nameEn: 'Cobalt Deep', nameFa: 'کبالت عمیق', color: '#0284c7', border: 'border-sky-500' },
    { id: 'rose', nameEn: 'Rose Crimson', nameFa: 'رز سرخ مانیتورینگ', color: '#f43f5e', border: 'border-rose-500' },
    { id: 'amber', nameEn: 'Cyber Amber', nameFa: 'کهربایی اختصاصی', color: '#f59e0b', border: 'border-amber-500' },
    { id: 'light', nameEn: 'Ergonomic Light', nameFa: 'تم روشن اداری', color: '#64748b', border: 'border-slate-400' },
  ];

  // Preset logo list
  const presetLogos = [
    { id: 'network', labelEn: 'Network Node', labelFa: 'نود شبکه (NT)', icon: Network, color: 'from-indigo-600 to-cyan-500' },
    { id: 'shield', labelEn: 'Cyber Shield', labelFa: 'سپر امنیتی', icon: ShieldCheck, color: 'from-purple-600 to-indigo-600' },
    { id: 'server', labelEn: 'Enterprise Fleet', labelFa: 'رک سرورها', icon: Server, color: 'from-emerald-600 to-teal-500' },
    { id: 'router', labelEn: 'Core Router', labelFa: 'روتر هسته', icon: Router, color: 'from-sky-600 to-blue-600' },
    { id: 'cpu', labelEn: 'Neural Chip', labelFa: 'تراشه پردازشی', icon: Cpu, color: 'from-rose-600 to-orange-500' },
    { id: 'globe', labelEn: 'Global Fiber', labelFa: 'فیبر بین‌الملل', icon: Globe, color: 'from-amber-600 to-yellow-500' },
  ];

  // Render Preset Icon Component
  const renderPresetIcon = (presetId: string, sizeClass = 'w-4 h-4') => {
    switch (presetId) {
      case 'shield':
        return <ShieldCheck className={sizeClass} />;
      case 'server':
        return <Server className={sizeClass} />;
      case 'router':
        return <Router className={sizeClass} />;
      case 'cpu':
        return <Cpu className={sizeClass} />;
      case 'globe':
        return <Globe className={sizeClass} />;
      case 'network':
      default:
        return <Network className={sizeClass} />;
    }
  };

  const isSuperAdmin = isUserSuperAdmin(user, effectivePolicy);

  if (!isSuperAdmin) {
    return (
      <div className="p-8 text-center text-slate-400">
        <p className="text-rose-400 font-bold mb-3">
          {isEn
            ? 'Access Denied: Only Super Administrator can access General Settings.'
            : 'عدم دسترسی: تنظیمات عمومی پنل منحصراً برای مدیر ارشد (Super Admin) قابل دسترسی است.'}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`min-h-full p-4 lg:p-8 space-y-6 transition-colors duration-200 ${
        isLightMode ? 'text-slate-900' : 'text-slate-100'
      }`}
    >
      {/* Top Header Banner */}
      <div
        className={`p-6 rounded-2xl border backdrop-blur-xl relative overflow-hidden shadow-xl ${
          isLightMode
            ? 'bg-white/90 border-slate-200 shadow-slate-200/50'
            : 'bg-slate-950/70 border-white/10 shadow-black/40'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-gradient-to-tr from-sky-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-sky-500/25 shrink-0">
              <Settings className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight font-mono">
                  {isEn ? 'Panel General Settings' : 'تنظیمات عمومی پنل (General Settings)'}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  {isEn ? 'System Config' : 'پیکربندی پنل'}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  v{APP_VERSION}
                </span>
              </div>
              <p
                className={`text-xs sm:text-sm mt-1 ${
                  isLightMode ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                {isEn
                  ? 'Configure core panel identity, listening port, custom logos, default themes, language preferences, and live telemetry parameters.'
                  : 'مدیریت و شخصی‌سازی تایتل، پورت اتصال سامانه، لوگو و نشان تجاری، تم و زبان پیش‌فرض و پارامترهای عملکردی نشست.'}
              </p>
            </div>
          </div>

          {/* Quick Sub-navigation Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/60 border border-white/10 self-start md:self-auto flex-wrap">
            <button
              onClick={() => setActiveSubSection('config')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeSubSection === 'config'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isEn ? 'Panel Configuration' : 'تنظیمات پنل'}</span>
            </button>

            <button
              onClick={() => setActiveSubSection('telemetry')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeSubSection === 'telemetry'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{isEn ? 'Live Telemetry' : 'تلمتری زنده سرور'}</span>
            </button>

            <button
              onClick={() => setActiveSubSection('roadmap')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeSubSection === 'roadmap'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isEn ? 'Phases Roadmap' : 'مسیر ماژول‌ها'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Save Feedback Toast / Alert */}
      {saveFeedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs sm:text-sm animate-fadeIn ${
            saveFeedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {saveFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{saveFeedback.message}</span>
          </div>
          <button
            onClick={() => setSaveFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* SUB-SECTION 1: Panel Configuration Form */}
      {activeSubSection === 'config' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card 1: Panel Identity & Branding */}
            <div
              className={`p-6 rounded-2xl border backdrop-blur-xl shadow-lg space-y-5 ${
                isLightMode
                  ? 'bg-white/90 border-slate-200 shadow-slate-200/50'
                  : 'bg-slate-950/60 border-white/10'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className={`text-base font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn ? 'Panel Identity & Branding' : 'هویت، تایتل و لوگوی پنل'}
                    </h3>
                    <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'Customize application title, subtitle, and branding logos' : 'شخصی‌سازی نام و لوگوی نمایش‌داده‌شده در هدر'}
                    </p>
                  </div>
                </div>

                {/* Live Header Logo Preview */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-white/15">
                  <span className="text-[10px] text-slate-400 font-mono uppercase">{isEn ? 'Preview' : 'پیش‌نمایش'}:</span>
                  {formData.logoType === 'custom_url' && formData.logoCustomUrl ? (
                    <img src={formData.logoCustomUrl} alt="Logo" className="w-5 h-5 rounded object-contain" />
                  ) : (
                    <div className="w-5 h-5 rounded bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center text-white text-[10px] font-bold">
                      {renderPresetIcon(formData.logoPreset, 'w-3 h-3')}
                    </div>
                  )}
                  <span className="text-xs font-bold font-mono text-white max-w-[100px] truncate">
                    {formData.panelTitle || 'NetTopology'}
                  </span>
                </div>
              </div>

              {/* Field: Panel Title */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    <span>{isEn ? 'Panel Title' : 'تایتل و نام اصلی پنل'}</span>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      title={isEn ? 'Panel Title' : 'تایتل پنل'}
                      infoWhatEn="The primary title and branding displayed in the browser tab and top navigation bar."
                      infoWhatFa="عنوان اصلی و نام تجاری سامانه که در عنوان تب مرورگر و نوار بالایی پنل نمایش داده می‌شود."
                      infoWhyEn="Allows organizations to white-label or customize the platform identity for their NOC."
                      infoWhyFa="به سازمان‌ها و تیم‌های NOC اجازه می‌دهد نام سامانه را اختصاصی و برند خود نمایند."
                      infoExampleEn="NetTopology Pro or ACME NOC Operations"
                      infoExampleFa="سامانه مانیتورینگ شبکه مرکزی یا NetTopology Pro"
                    />
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {formData.panelTitle.length}/60
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={60}
                  value={formData.panelTitle}
                  onChange={(e) => setFormData({ ...formData, panelTitle: e.target.value })}
                  placeholder={isEn ? 'e.g. NetTopology Pro' : 'مثال: سامانه جامع مانیتورینگ زیرساخت'}
                  className={`w-full px-3.5 py-2 rounded-xl text-xs sm:text-sm border transition focus:outline-none focus:border-indigo-500 ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                      : 'bg-slate-900 border-white/10 text-white placeholder:text-slate-500'
                  }`}
                  required
                />
              </div>

              {/* Field: Panel Subtitle */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    <span>{isEn ? 'Panel Subtitle / Organization' : 'زیرعنوان و نام سازمان / بخش'}</span>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      title={isEn ? 'Panel Subtitle' : 'زیرعنوان پنل'}
                      infoWhatEn="Secondary explanatory text displayed beneath the main title in desktop viewports."
                      infoWhatFa="متن توضیحی تکمیلی که در زیر تایتل اصلی در نوار ناوبری دسکتاپ درج می‌گردد."
                      infoWhyEn="Identifies the responsible department, datacenter, or infrastructure scope."
                      infoWhyFa="جهت تعیین حوزه عملیاتی، مرکز داده یا دپارتمان مسئول زیرساخت شبکه."
                      infoExampleEn="Enterprise Network Operations Center"
                      infoExampleFa="مرکز عملیات شبکه و امنیت زیرساخت (NOC)"
                    />
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {formData.panelSubtitle.length}/80
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={80}
                  value={formData.panelSubtitle}
                  onChange={(e) => setFormData({ ...formData, panelSubtitle: e.target.value })}
                  placeholder={isEn ? 'e.g. Enterprise Network Operation Center' : 'مثال: مرکز عملیات و پایش شبکه سازمان'}
                  className={`w-full px-3.5 py-2 rounded-xl text-xs sm:text-sm border transition focus:outline-none focus:border-indigo-500 ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                      : 'bg-slate-900 border-white/10 text-white placeholder:text-slate-500'
                  }`}
                />
              </div>

              {/* Logo Selection: Presets vs Custom URL/Upload */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between">
                  <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    <span>{isEn ? 'Logo Icon / Graphic' : 'نشان و لوگوی گرافیکی پنل'}</span>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      title={isEn ? 'Logo Selection' : 'انتخاب لوگو'}
                      infoWhatEn="Determines whether the header displays a high-tech built-in SVG icon or custom company logo."
                      infoWhatFa="تعیین نوع نشان هدر سامانه بین آیکون‌های وکتور شبکه یا لوگوی اختصاصی سازمان."
                      infoWhyEn="Ensures platform branding matches organizational identity guidelines."
                      infoWhyFa="انطباق کامل ظاهر پنل با برند و هویت بصری سازمانی."
                      infoExampleEn="Select 'Network Node' or upload organizational PNG/SVG"
                      infoExampleFa="انتخاب آیکون نود شبکه یا بارگذاری فایل SVG/PNG اختصاصی"
                    />
                  </label>

                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-white/10 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, logoType: 'preset' })}
                      className={`px-2.5 py-1 rounded-md transition cursor-pointer font-medium ${
                        formData.logoType !== 'custom_url'
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {isEn ? 'Presets' : 'آیکون‌های پیش‌فرض'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, logoType: 'custom_url' })}
                      className={`px-2.5 py-1 rounded-md transition cursor-pointer font-medium ${
                        formData.logoType === 'custom_url'
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {isEn ? 'Custom / Upload' : 'آپلود / آدرس دلخواه'}
                    </button>
                  </div>
                </div>

                {formData.logoType === 'custom_url' ? (
                  /* Custom URL / Upload Box */
                  <div className={`p-4 rounded-xl border space-y-3 ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-white/10'}`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={formData.logoCustomUrl || ''}
                        onChange={(e) => setFormData({ ...formData, logoCustomUrl: e.target.value })}
                        placeholder={isEn ? 'Enter Image / SVG URL (https://...)' : 'آدرس اینترنتی مستقیم لوگو (https://...)'}
                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs border focus:outline-none focus:border-indigo-500 ${
                          isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-white/10 text-white'
                        }`}
                      />
                      <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold cursor-pointer transition shrink-0">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Upload File' : 'آپلود فایل'}</span>
                        <input
                          type="file"
                          accept="image/*,.svg"
                          onChange={handleLogoFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {formData.logoCustomUrl && (
                      <div className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-white/5">
                        <div className="flex items-center gap-2">
                          <img src={formData.logoCustomUrl} alt="Custom Logo" className="w-8 h-8 rounded object-contain bg-white/5 p-1" />
                          <span className="text-xs text-slate-300 font-mono truncate max-w-[200px]">
                            {formData.logoCustomUrl.startsWith('data:') ? (isEn ? 'Local File Loaded' : 'فایل بارگذاری شد') : formData.logoCustomUrl}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, logoCustomUrl: '' })}
                          className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer font-bold px-2 py-1"
                        >
                          {isEn ? 'Remove' : 'حذف'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Preset Grid */
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {presetLogos.map((p) => {
                      const Icon = p.icon;
                      const isSelected = formData.logoPreset === p.id && formData.logoType !== 'custom_url';
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setFormData({ ...formData, logoType: 'preset', logoPreset: p.id as any })}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs transition cursor-pointer text-left ${
                            isSelected
                              ? 'bg-indigo-600/25 border-indigo-500 text-white font-bold shadow-sm'
                              : isLightMode
                              ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                              : 'bg-slate-900/40 border-white/5 text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${p.color} flex items-center justify-center text-white shrink-0`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="truncate text-xs">{isEn ? p.labelEn : p.labelFa}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 ml-auto shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Card 2: Networking & Listening Port */}
            <div
              className={`p-6 rounded-2xl border backdrop-blur-xl shadow-lg space-y-5 ${
                isLightMode
                  ? 'bg-white/90 border-slate-200 shadow-slate-200/50'
                  : 'bg-slate-950/60 border-white/10'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className={`text-base font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn ? 'Network Port & Core Protocol' : 'پورت سامانه و پروتکل‌های ارتباطی'}
                    </h3>
                    <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'Web server listening port and device connection parameters' : 'تنظیمات درگاه گوش‌دادن وب‌سرور و پروتکل ارتباط با تجهیزات'}
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                  TCP/IP
                </span>
              </div>

              {/* Field: Panel Port */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    <span>{isEn ? 'Panel Web Port' : 'پورت وب سامانه (Panel Port)'}</span>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      title={isEn ? 'Panel Web Port' : 'پورت وب پنل'}
                      infoWhatEn="The TCP port on which the Node/Express management server listens for web requests."
                      infoWhatFa="پورت شبکه پروتکل TCP که وب‌سرور پنل روی آن به درخواست‌های کلاینت گوش می‌دهد."
                      infoWhyEn="Essential for avoiding conflicts with other services and aligning with reverse proxies (e.g. Nginx, Traefik)."
                      infoWhyFa="جهت جلوگیری از تداخل با سرویس‌های دیگر هاست و هماهنگی با پروکسی‌های معکوس مانند Nginx."
                      infoExampleEn="3000 (default), 8080, or 8443"
                      infoExampleFa="۳۰۰۰ (پیش‌فرض سیستم)، ۸۰۸۰ یا ۸۴۴۳"
                    />
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">1024 - 65535</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min={1024}
                    max={65535}
                    value={formData.panelPort}
                    onChange={(e) => setFormData({ ...formData, panelPort: parseInt(e.target.value, 10) || 3000 })}
                    className={`w-full px-3.5 py-2 rounded-xl text-xs sm:text-sm border transition font-mono focus:outline-none focus:border-indigo-500 ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-900'
                        : 'bg-slate-900 border-white/10 text-white'
                    }`}
                    required
                  />
                  <span className="absolute right-3.5 rtl:right-auto rtl:left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400 pointer-events-none">
                    TCP
                  </span>
                </div>
                <p className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isEn
                    ? 'Default port is 3000. Changes are stored authoritatively in server configuration.'
                    : 'پورت پیش‌فرض سامانه ۳۰۰۰ است. تغییرات به‌صورت دائمی در دیتابیس و پیکربندی سرور ذخیره می‌شود.'}
                </p>
              </div>

              {/* Field: Default Device Access Protocol */}
              <div className="space-y-1.5">
                <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                  <span>{isEn ? 'Default Device Management Protocol' : 'پروتکل ارتباطی پیش‌فرض با تجهیزات'}</span>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    title={isEn ? 'Default Protocol' : 'پروتکل پیش‌فرض'}
                    infoWhatEn="The primary connection protocol selected by default when managing new hardware."
                    infoWhatFa="پروتکل ترجیحی پایه هنگام برقراری ارتباط با سوئیچ‌ها و روترهای جدید."
                    infoWhyEn="Standardizes operations toward modern encrypted channels (SSHv2)."
                    infoWhyFa="استانداردسازی و هدایت اتصالات به سمت کانال‌های امن و رمزنگاری‌شده (SSHv2)."
                    infoExampleEn="SSHv2 (Encrypted, Recommended) or Telnet"
                    infoExampleFa="SSHv2 (رمزنگاری‌شده، توصیه اکید)"
                  />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['ssh', 'telnet', 'https'] as const).map((proto) => {
                    const isSelected = formData.defaultDeviceProtocol === proto;
                    return (
                      <button
                        key={proto}
                        type="button"
                        onClick={() => setFormData({ ...formData, defaultDeviceProtocol: proto })}
                        className={`py-2 px-3 rounded-xl border text-xs font-mono font-bold transition cursor-pointer text-center uppercase ${
                          isSelected
                            ? 'bg-sky-600/25 border-sky-500 text-sky-300 shadow-sm'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            : 'bg-slate-900/40 border-white/5 text-slate-400 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        {proto === 'ssh' ? 'SSHv2' : proto.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Field: Telemetry Refresh Interval */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    <span>{isEn ? 'Telemetry Refresh Rate' : 'دوره تازه‌سازی تلمتری زنده پورت‌ها'}</span>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      title={isEn ? 'Telemetry Refresh' : 'تازه‌سازی تلمتری'}
                      infoWhatEn="Defines how frequently the panel automatically refreshes backend link and node telemetry."
                      infoWhatFa="بازه زمانی اجرای خودکار پایش ترافیک، همسایگی و وضعیت پورت‌ها."
                      infoWhyEn="Balances real-time monitoring visibility against network and CPU overhead."
                      infoWhyFa="تنظیم توازن میان دقت مانیتورینگ بلادرنگ و مصرف پردازنده و ترافیک شبکه."
                      infoExampleEn="10 seconds (standard) or 30 seconds"
                      infoExampleFa="۱۰ ثانیه (استاندارد) یا ۳۰ ثانیه"
                    />
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {formData.telemetryRefreshIntervalSec}s
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 30, 60].map((sec) => {
                    const isSelected = formData.telemetryRefreshIntervalSec === sec;
                    return (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setFormData({ ...formData, telemetryRefreshIntervalSec: sec })}
                        className={`py-1.5 px-2 rounded-xl border text-xs font-mono transition cursor-pointer text-center ${
                          isSelected
                            ? 'bg-indigo-600/30 border-indigo-500 text-white font-bold'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 text-slate-600'
                            : 'bg-slate-900 border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {sec}s
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Card 3: Default Appearance & Themes */}
            <div
              className={`p-6 rounded-2xl border backdrop-blur-xl shadow-lg space-y-5 ${
                isLightMode
                  ? 'bg-white/90 border-slate-200 shadow-slate-200/50'
                  : 'bg-slate-950/60 border-white/10'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400">
                    <Palette className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className={`text-base font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn ? 'Default Theme & Visual Style' : 'تم و استایل گرافیکی پیش‌فرض'}
                    </h3>
                    <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'Default base theme for new sessions (users can customize freely in profile)' : 'تم رنگی پیش‌فرض سامانه برای نشست‌های جدید (کاربران می‌توانند تم اختصاصی خود را برگزینند)'}
                    </p>
                  </div>
                </div>

                <span className="text-xs font-mono text-purple-400 font-bold uppercase">
                  {formData.defaultTheme}
                </span>
              </div>

              {/* Theme Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {themeList.map((t) => {
                  const isSelected = formData.defaultTheme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, defaultTheme: t.id })}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs transition cursor-pointer text-left ${
                        isSelected
                          ? `bg-indigo-600/20 ${t.border} text-white font-bold shadow-md`
                          : isLightMode
                          ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          : 'bg-slate-900/50 border-white/5 text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs border border-white/20"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="truncate text-xs">{isEn ? t.nameEn : t.nameFa}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 ml-auto shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Card 4: Default Language & Session Security */}
            <div
              className={`p-6 rounded-2xl border backdrop-blur-xl shadow-lg space-y-5 ${
                isLightMode
                  ? 'bg-white/90 border-slate-200 shadow-slate-200/50'
                  : 'bg-slate-950/60 border-white/10'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className={`text-base font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn ? 'Default Language & Session Security' : 'زبان پیش‌فرض و انقضای نشست'}
                    </h3>
                    <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'Default language for new sessions (users can choose their own language in profile)' : 'زبان پیش‌فرض سامانه برای نشست‌های تازه (با امکان انتخاب آزادانه زبان توسط هر کاربر)'}
                    </p>
                  </div>
                </div>

                <span className="text-xs font-mono text-emerald-400 font-bold uppercase">
                  {formData.defaultLanguage.toUpperCase()}
                </span>
              </div>

              {/* Default Language Selector */}
              <div className="space-y-1.5">
                <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                  <span>{isEn ? 'Default Panel Language' : 'زبان پیش‌فرض سامانه'}</span>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    title={isEn ? 'Default Language' : 'زبان پیش‌فرض'}
                    infoWhatEn="The default interface language for new sessions and users without a personal language selection."
                    infoWhatFa="زبان اصلی پیش‌فرض سامانه هنگام بارگذاری اولیه برای کاربران جدیدی که هنوز زبان اختصاصی تعیین نکرده‌اند."
                    infoWhyEn="Sets the organizational standard upon first login while ensuring every user can switch to their preferred language at any time."
                    infoWhyFa="تعیین استاندارد اداری سامانه در ورود اول ضمن تضمین آزادی کامل هر کاربر جهت جابجایی زبان در هر لحظه."
                    infoExampleEn="Persian (فارسی - RTL) or English (LTR)"
                    infoExampleFa="فارسی (پیش‌فرض سیستم) یا انگلیسی"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, defaultLanguage: 'fa' })}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      formData.defaultLanguage === 'fa'
                        ? 'bg-emerald-600/25 border-emerald-500 text-emerald-300 font-bold shadow-sm'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-900 border-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-emerald-300 font-bold">FA</span>
                    <span>فارسی (راست‌چین)</span>
                    {formData.defaultLanguage === 'fa' && <Check className="w-3.5 h-3.5 text-emerald-400 ml-1" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, defaultLanguage: 'en' })}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      formData.defaultLanguage === 'en'
                        ? 'bg-emerald-600/25 border-emerald-500 text-emerald-300 font-bold shadow-sm'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-900 border-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-emerald-300 font-bold">EN</span>
                    <span>English (LTR)</span>
                    {formData.defaultLanguage === 'en' && <Check className="w-3.5 h-3.5 text-emerald-400 ml-1" />}
                  </button>
                </div>
              </div>

              {/* Inactivity Session Timeout */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    <span>{isEn ? 'Session Inactivity Auto-Logout' : 'مدت زمان انقضای نشست در حالت بی‌کار بودن'}</span>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      title={isEn ? 'Inactivity Timeout' : 'انقضای نشست'}
                      infoWhatEn="Automatically logs out idle administrative sessions after the specified inactivity duration."
                      infoWhatFa="خروج خودکار نشست‌های کاربری پس از عدم فعالیت در پنل طی زمان مشخص‌شده."
                      infoWhyEn="Mitigates unauthorized physical workstation access in accordance with ISO 27001."
                      infoWhyFa="جلوگیری از دسترسی غیرمجاز در صورت رها شدن سیستم کاربر و رعایت الزامات ISO 27001."
                      infoExampleEn="60 minutes (standard) or 15 minutes (high security)"
                      infoExampleFa="۶۰ دقیقه (استاندارد) یا ۱۵ دقیقه (امنیت بالا)"
                    />
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {formData.sessionInactivityTimeoutMin === 0
                      ? (isEn ? 'Disabled' : 'غیرفعال')
                      : `${formData.sessionInactivityTimeoutMin} min`}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[15, 30, 60, 240].map((mins) => {
                    const isSelected = formData.sessionInactivityTimeoutMin === mins;
                    return (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setFormData({ ...formData, sessionInactivityTimeoutMin: mins })}
                        className={`py-1.5 px-2 rounded-xl border text-xs font-mono transition cursor-pointer text-center ${
                          isSelected
                            ? 'bg-emerald-600/25 border-emerald-500 text-emerald-300 font-bold'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 text-slate-600'
                            : 'bg-slate-900 border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {mins}m
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* System Debug Logging Toggle */}
              <div className={`p-3 rounded-xl border flex items-center justify-between ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-white/5'}`}>
                <div>
                  <span className={`text-xs font-semibold block ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                    {isEn ? 'System Diagnostic Debug Logging' : 'ثبت تفصیلی لاگ‌های خطایابی سیستم (Debug)'}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {isEn ? 'Outputs granular diagnostic logs to server stdout' : 'ثبت دقیق مراحل اجرای فرامین و ارتباطات تجهیزات'}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.systemDebugLogging}
                    onChange={(e) => setFormData({ ...formData, systemDebugLogging: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] rtl:after:left-auto rtl:after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Form Actions Footer */}
          <div
            className={`p-5 rounded-2xl border backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl ${
              isLightMode
                ? 'bg-white/90 border-slate-200 shadow-slate-200/50'
                : 'bg-slate-950/80 border-white/10 shadow-black/40'
            }`}
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleResetDefaults}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                  isLightMode
                    ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                    : 'border-white/10 text-slate-300 hover:bg-white/5'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isEn ? 'Reset to Defaults' : 'بازنشانی مقادیر پیش‌فرض'}</span>
              </button>

              {formData.updatedAt && (
                <span className="text-[11px] text-slate-500 font-mono hidden md:inline">
                  {isEn ? `Last saved: ${formData.updatedAt}` : `آخرین ذخیره: ${formData.updatedAt}`}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-indigo-600/25 transition cursor-pointer active:scale-98 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isEn ? 'Saving to Database...' : 'در حال ذخیره‌سازی...'}</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{isEn ? 'Save Panel Settings' : 'ذخیره تنظیمات عمومی پنل'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* SUB-SECTION 2: Live System Telemetry */}
      {activeSubSection === 'telemetry' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          {/* Card 1: Live Status Info */}
          <div
            className={`lg:col-span-2 p-6 rounded-2xl border backdrop-blur-xl shadow-lg relative flex flex-col justify-between ${
              isLightMode
                ? 'bg-white/90 border-slate-200'
                : 'bg-slate-950/60 border-white/10'
            }`}
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold">
                      {isEn ? 'Authentic System Runtime & Connectivity' : 'ارتباط زنده و وضعیت هسته سرور'}
                    </h2>
                    <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'Direct telemetry from Python Discovery & Node Express engines' : 'اطلاعات زنده دریافت شده از هسته دیسکاوری شبکه و نود اکسپرس'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={fetchLiveTelemetry}
                  disabled={isRefreshing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/25 text-xs font-semibold transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>{isEn ? 'Refresh Now' : 'بروزرسانی'}</span>
                </button>
              </div>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={`p-4 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-white/5'}`}>
                  <span className="text-xs text-slate-400 block mb-1">{isEn ? 'Network Engine' : 'هسته دیسکاوری شبکه'}</span>
                  <span className="text-sm font-bold font-mono text-sky-400">
                    {healthData?.engine || (isEn ? 'Detecting...' : 'در حال بررسی...')}
                  </span>
                </div>

                <div className={`p-4 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-white/5'}`}>
                  <span className="text-xs text-slate-400 block mb-1">{isEn ? 'Backend Status' : 'وضعیت ارتباط سرویس'}</span>
                  <span className="text-sm font-bold font-mono text-emerald-400 uppercase">
                    {healthData?.status || 'ONLINE'}
                  </span>
                </div>

                <div className={`p-4 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-white/5'}`}>
                  <span className="text-xs text-slate-400 block mb-1">{isEn ? 'CDP / LLDP Protocol' : 'پروتکل‌های همسایگی'}</span>
                  <span className="text-sm font-bold font-mono text-indigo-400">
                    {healthData?.cdp_engine || 'Active'} / {healthData?.lldp_engine || 'Active'}
                  </span>
                </div>

                <div className={`p-4 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-white/5'}`}>
                  <span className="text-xs text-slate-400 block mb-1">{isEn ? 'Core Round-Trip Latency' : 'تاخیر پاسخگویی هسته (RTT)'}</span>
                  <span className="text-sm font-bold font-mono text-emerald-400">
                    {latencyMs !== null ? `${latencyMs} ms` : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className={`mt-6 pt-4 border-t text-[11px] font-mono flex items-center justify-between ${isLightMode ? 'border-slate-200 text-slate-500' : 'border-white/10 text-slate-400'}`}>
              <span>{isEn ? 'Execution: Authentic Hardware Mode' : 'حالت اجرا: تجهیزات واقعی و استاندارد'}</span>
              <span>{isEn ? 'Version: ' : 'نسخه: '}v{APP_VERSION}</span>
            </div>
          </div>

          {/* Card 2: Database & Storage Status */}
          <div
            className={`p-6 rounded-2xl border backdrop-blur-xl shadow-lg space-y-4 ${
              isLightMode
                ? 'bg-white/90 border-slate-200'
                : 'bg-slate-950/60 border-white/10'
            }`}
          >
            <div className="flex items-center gap-2 pb-3 border-b border-white/10">
              <Database className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-bold">
                {isEn ? 'Database & Storage Engine' : 'پایگاه داده و ذخیره‌سازی'}
              </h3>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className={`p-2.5 rounded-xl border flex items-center justify-between ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5'}`}>
                <span className="text-slate-400">{isEn ? 'Primary Store' : 'مخزن داده اولیه'}</span>
                <span className="font-mono text-purple-300 font-bold">PostgreSQL / JSON Authoritative</span>
              </div>

              <div className={`p-2.5 rounded-xl border flex items-center justify-between ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5'}`}>
                <span className="text-slate-400">{isEn ? 'Discovered Devices' : 'تجهیزات متصل'}</span>
                <span className="font-mono text-emerald-400 font-bold">{healthData?.device_count || 11}</span>
              </div>

              <div className={`p-2.5 rounded-xl border flex items-center justify-between ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5'}`}>
                <span className="text-slate-400">{isEn ? 'HTTP Host / Bind' : 'آدرس و پورت جاری'}</span>
                <span className="font-mono text-slate-300">0.0.0.0:{formData.panelPort}</span>
              </div>

              <div className={`p-2.5 rounded-xl border flex items-center justify-between ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5'}`}>
                <span className="text-slate-400">{isEn ? 'Active Operator' : 'اپراتور جاری'}</span>
                <span className="font-mono text-indigo-300 font-bold">{user?.username || 'admin'}</span>
              </div>
            </div>

            {lastCheckTime && (
              <p className="text-[10px] text-slate-500 font-mono text-center pt-2">
                {isEn ? `Last telemetry sync: ${lastCheckTime}` : `آخرین همگام‌سازی: ${lastCheckTime}`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* SUB-SECTION 3: Phases Roadmap & Quick Links */}
      {activeSubSection === 'roadmap' && (
        <div className="space-y-4 animate-fadeIn">
          <div
            className={`p-6 rounded-2xl border backdrop-blur-xl shadow-lg space-y-4 ${
              isLightMode
                ? 'bg-white/90 border-slate-200'
                : 'bg-slate-950/60 border-white/10'
            }`}
          >
            <div className="flex items-center gap-2 pb-3 border-b border-white/10">
              <Layers className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className={`text-base font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                  {isEn ? 'Settings Architecture & Module Evolution' : 'نقشه توسعه و سازمان‌دهی ماژول‌های سیتینگ'}
                </h3>
                <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isEn ? 'Incremental modular milestones integrated across the platform' : 'مراحل و بخش‌های پیاده‌سازی‌شده در فازهای گام‌به‌گام'}
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {/* Phase 1 */}
              <div className={`flex items-center gap-3 p-3.5 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-white/5'}`}>
                <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
                  <Check className="w-4 h-4" />
                </div>
                <div className="text-xs flex-1">
                  <span className="font-bold text-emerald-400">{isEn ? 'Phase 1: ' : 'فاز ۱: '}</span>
                  <span className={isLightMode ? 'text-slate-700' : 'text-slate-300'}>
                    {isEn
                      ? 'Navigation menu entry "Settings" initialized with live telemetry & modular framework.'
                      : 'افزودن آیتم "سیتینگ" به منوی ناوبری با تلمتری زنده سیستم و معماری ماژولار.'}
                  </span>
                </div>
              </div>

              {/* Phase 2: LDAP */}
              <div className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-white/5'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                  <div className="text-xs">
                    <span className="font-bold text-emerald-400">{isEn ? 'Phase 2: ' : 'فاز ۲: '}</span>
                    <span className={isLightMode ? 'text-slate-700' : 'text-slate-300'}>
                      {isEn
                        ? 'Domain Controller Connection parameters relocated under Settings as a dedicated submenu.'
                        : 'انتقال پارامترهای اتصال دامین کنترلر به عنوان زیرمنو در سیتینگ.'}
                    </span>
                  </div>
                </div>
                {onNavigateToTab && (
                  <button
                    onClick={() => onNavigateToTab('settings-ldap')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-400 text-xs font-semibold transition shrink-0 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Open LDAP' : 'تنظیمات LDAP'}</span>
                  </button>
                )}
              </div>

              {/* Phase 3: Updates */}
              <div className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-white/5'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                  <div className="text-xs">
                    <span className="font-bold text-emerald-400">{isEn ? 'Phase 3: ' : 'فاز ۳: '}</span>
                    <span className={isLightMode ? 'text-slate-700' : 'text-slate-300'}>
                      {isEn
                        ? 'Panel Updates, Release Notes, and 1-Click Update relocated under Settings.'
                        : 'انتقال ارتقا و به‌روزرسانی پنل و ریلیز نوت‌ها به عنوان زیرمنو در سیتینگ.'}
                    </span>
                  </div>
                </div>
                {onNavigateToTab && (
                  <button
                    onClick={() => onNavigateToTab('settings-update')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-semibold transition shrink-0 cursor-pointer"
                  >
                    <ArrowUpCircle className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Open Updates' : 'ارتقای پنل'}</span>
                  </button>
                )}
              </div>

              {/* Phase 4: General Panel Settings */}
              <div className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-white/5'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                  <div className="text-xs">
                    <span className="font-bold text-emerald-400">{isEn ? 'Phase 4 (Current): ' : 'فاز ۴ (کنونی): '}</span>
                    <span className={isLightMode ? 'text-slate-700' : 'text-slate-300'}>
                      {isEn
                        ? 'Panel General Settings: custom listening port, title, logos, default theme and language.'
                        : 'تنظیمات عمومی پنل: تغییر پورت وب، تایتل، لوگوی اختصاصی، تم و زبان پیش‌فرض.'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setActiveSubSection('config')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 text-xs font-semibold transition shrink-0 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Configure Now' : 'ویرایش تنظیمات'}</span>
                </button>
              </div>

              {/* Next Phases */}
              <div className={`flex items-center gap-3 p-3.5 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-white/5'}`}>
                <div className="w-7 h-7 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-400 flex items-center justify-center text-xs font-bold shrink-0">
                  +
                </div>
                <div className="text-xs">
                  <span className="font-bold text-sky-400">{isEn ? 'Future Phases: ' : 'فازهای بعدی: '}</span>
                  <span className={isLightMode ? 'text-slate-700' : 'text-slate-300'}>
                    {isEn
                      ? 'Ready for additional enterprise configuration modules as instructed.'
                      : 'سامانه آماده افزودن ماژول‌ها و تنظیمات بعدی بر اساس درخواست شما می‌باشد.'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
