import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  AlertCircle,
  Archive,
  Mail,
  Calendar,
  Radio,
  Laptop,
  Zap,
  Minus,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { isUserSuperAdmin } from '../../utils/rbac';
import { APP_VERSION } from '../../version';
import { ThemeType } from '../Navbar';
import { PanelGeneralSettings, ServerTimeInfo } from '../../types';
import {
  fetchServerTimeApi,
  updateServerTimezoneApi,
  syncServerNtpApi,
  setServerManualTimeApi,
  fetchEmailConfigApi,
} from '../../services/api';
import {
  loadGeneralSettings,
  saveGeneralSettings,
  syncGeneralSettingsFromDatabase,
  DEFAULT_PANEL_GENERAL_SETTINGS
} from '../../services/settingsStorage';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import {
  resolveFaviconUrl,
  updateDocumentFavicon,
  scaleImageToPanelLogo,
  getPresetFaviconDataUrl,
} from '../../utils/favicon';

interface GeneralSettingsViewProps {
  isLightMode?: boolean;
  panelTheme?: ThemeType;
  onChangeTheme?: (theme: ThemeType) => void;
  onNavigateToTab?: (tab: 'settings-ldap' | 'settings-update' | 'settings-services' | string) => void;
  onSettingsSaved?: (newSettings: PanelGeneralSettings) => void;
}

interface BackendHealthData {
  status: string;
  engine: string;
  cdp_engine?: string;
  lldp_engine?: string;
  device_count?: number;
}

interface TimezonePreset {
  id: string;
  nameEn: string;
  nameFa: string;
  offset: string;
  groupEn: string;
  groupFa: string;
}

const COMMON_TIMEZONES: TimezonePreset[] = [
  { id: 'Asia/Tehran', nameEn: 'Tehran (Iran Standard Time)', nameFa: 'تهران (ساعت رسمی ایران)', offset: 'UTC+03:30', groupEn: 'Iran & Middle East', groupFa: 'ایران و خاورمیانه' },
  { id: 'Asia/Dubai', nameEn: 'Dubai (UAE / Gulf)', nameFa: 'دبی (امارات و حوزه خلیج فارس)', offset: 'UTC+04:00', groupEn: 'Iran & Middle East', groupFa: 'ایران و خاورمیانه' },
  { id: 'Asia/Riyadh', nameEn: 'Riyadh (Saudi Arabia)', nameFa: 'ریاض (عربستان سعودی)', offset: 'UTC+03:00', groupEn: 'Iran & Middle East', groupFa: 'ایران و خاورمیانه' },
  { id: 'Asia/Baghdad', nameEn: 'Baghdad (Iraq)', nameFa: 'بغداد (عراق)', offset: 'UTC+03:00', groupEn: 'Iran & Middle East', groupFa: 'ایران و خاورمیانه' },
  { id: 'Asia/Baku', nameEn: 'Baku (Azerbaijan)', nameFa: 'باکو (آذربایجان)', offset: 'UTC+04:00', groupEn: 'Iran & Middle East', groupFa: 'ایران و خاورمیانه' },
  { id: 'Asia/Kabul', nameEn: 'Kabul (Afghanistan)', nameFa: 'کابل (افغانستان)', offset: 'UTC+04:30', groupEn: 'Iran & Middle East', groupFa: 'ایران و خاورمیانه' },
  { id: 'UTC', nameEn: 'Universal Coordinated Time (UTC / GMT)', nameFa: 'ساعت هماهنگ جهانی (UTC / GMT)', offset: 'UTC+00:00', groupEn: 'Standard UTC', groupFa: 'ساعت هماهنگ جهانی' },
  { id: 'Europe/London', nameEn: 'London (UK / BST)', nameFa: 'لندن (بریتانیا)', offset: 'UTC+01:00', groupEn: 'Europe', groupFa: 'اروپا' },
  { id: 'Europe/Paris', nameEn: 'Paris (Central Europe)', nameFa: 'پاریس (اروپای مرکزی)', offset: 'UTC+02:00', groupEn: 'Europe', groupFa: 'اروپا' },
  { id: 'Europe/Berlin', nameEn: 'Berlin (Germany)', nameFa: 'برلین (آلمان)', offset: 'UTC+02:00', groupEn: 'Europe', groupFa: 'اروپا' },
  { id: 'Europe/Istanbul', nameEn: 'Istanbul (Turkey)', nameFa: 'استانبول (ترکیه)', offset: 'UTC+03:00', groupEn: 'Europe', groupFa: 'اروپا' },
  { id: 'Europe/Moscow', nameEn: 'Moscow (Russia)', nameFa: 'مسکو (روسیه)', offset: 'UTC+03:00', groupEn: 'Europe', groupFa: 'اروپا' },
  { id: 'America/New_York', nameEn: 'New York (Eastern Time)', nameFa: 'نیویورک (ساعت شرقی آمریکا)', offset: 'UTC-04:00', groupEn: 'Americas', groupFa: 'آمریکا' },
  { id: 'America/Chicago', nameEn: 'Chicago (Central Time)', nameFa: 'شیکاگو (ساعت مرکزی آمریکا)', offset: 'UTC-05:00', groupEn: 'Americas', groupFa: 'آمریکا' },
  { id: 'America/Denver', nameEn: 'Denver (Mountain Time)', nameFa: 'دنور (ساعت کوهستانی)', offset: 'UTC-06:00', groupEn: 'Americas', groupFa: 'آمریکا' },
  { id: 'America/Los_Angeles', nameEn: 'Los Angeles (Pacific Time)', nameFa: 'لس آنجلس (ساعت اقیانوس آرام)', offset: 'UTC-07:00', groupEn: 'Americas', groupFa: 'آمریکا' },
  { id: 'America/Toronto', nameEn: 'Toronto (Canada)', nameFa: 'تورنتو (کانادا)', offset: 'UTC-04:00', groupEn: 'Americas', groupFa: 'آمریکا' },
  { id: 'Asia/Tokyo', nameEn: 'Tokyo (Japan)', nameFa: 'توکیو (ژاپن)', offset: 'UTC+09:00', groupEn: 'Asia & Pacific', groupFa: 'آسیا و اقیانوسیه' },
  { id: 'Asia/Shanghai', nameEn: 'Shanghai / Beijing (China)', nameFa: 'شانگهای / پکن (چین)', offset: 'UTC+08:00', groupEn: 'Asia & Pacific', groupFa: 'آسیا و اقیانوسیه' },
  { id: 'Asia/Singapore', nameEn: 'Singapore', nameFa: 'سنگاپور', offset: 'UTC+08:00', groupEn: 'Asia & Pacific', groupFa: 'آسیا و اقیانوسیه' },
  { id: 'Asia/Kolkata', nameEn: 'Kolkata / New Delhi (India)', nameFa: 'دهلی نو (هند)', offset: 'UTC+05:30', groupEn: 'Asia & Pacific', groupFa: 'آسیا و اقیانوسیه' },
  { id: 'Australia/Sydney', nameEn: 'Sydney (Eastern Australia)', nameFa: 'سیدنی (استرالیا)', offset: 'UTC+10:00', groupEn: 'Asia & Pacific', groupFa: 'آسیا و اقیانوسیه' },
];

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
  const [logoUploadInfo, setLogoUploadInfo] = useState<{
    originalSize: string;
    scaledSize: string;
    format: string;
  } | null>(null);
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const [isProcessingFavicon, setIsProcessingFavicon] = useState(false);

  // Server Time & Clock State
  const [serverTimeInfo, setServerTimeInfo] = useState<ServerTimeInfo | null>(null);
  const [isFetchingServerTime, setIsFetchingServerTime] = useState<boolean>(false);
  const [isSyncingNtp, setIsSyncingNtp] = useState<boolean>(false);
  const [isSettingManualTime, setIsSettingManualTime] = useState<boolean>(false);
  const [serverTimeFeedback, setServerTimeFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showManualTimeModal, setShowManualTimeModal] = useState<boolean>(false);
  const [isManualModalMaximized, setIsManualModalMaximized] = useState<boolean>(false);
  const [isManualModalMinimized, setIsManualModalMinimized] = useState<boolean>(false);
  const [manualDateInput, setManualDateInput] = useState<string>('');
  const [manualTimeInput, setManualTimeInput] = useState<string>('');
  const [customTimezoneInput, setCustomTimezoneInput] = useState<string>('');
  const [showCustomTzField, setShowCustomTzField] = useState<boolean>(false);

  // Email/SMTP Status check for 2FA
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);
  const [smtpHostName, setSmtpHostName] = useState<string>('');

  useEffect(() => {
    fetchEmailConfigApi()
      .then((cfg) => {
        if (cfg && cfg.smtp_host && cfg.smtp_host.trim()) {
          setSmtpConfigured(true);
          setSmtpHostName(cfg.smtp_host.trim());
        } else {
          setSmtpConfigured(false);
        }
      })
      .catch(() => {
        setSmtpConfigured(false);
      });
  }, []);

  // Fetch live server time from backend
  const fetchLiveServerTime = useCallback(async () => {
    setIsFetchingServerTime(true);
    try {
      const data = await fetchServerTimeApi();
      setServerTimeInfo(data);
    } catch (err: any) {
      console.warn('Could not fetch server time info:', err?.message);
    } finally {
      setIsFetchingServerTime(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveServerTime();
    const interval = setInterval(fetchLiveServerTime, 25000);
    return () => clearInterval(interval);
  }, [fetchLiveServerTime]);

  // High-precision live second counter
  useEffect(() => {
    const tick = setInterval(() => {
      setServerTimeInfo((prev) => {
        if (!prev) return prev;
        const nextTs = prev.timestamp + 1000;
        const d = new Date(nextTs);
        const is24h = (formData.timeFormat || prev.timeFormat) !== '12h';
        const tz = formData.serverTimezone || prev.timezone || 'Asia/Tehran';
        let formattedTime = prev.formattedTime;
        try {
          formattedTime = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: !is24h,
          }).format(d);
        } catch {}
        return {
          ...prev,
          timestamp: nextTs,
          formattedTime,
        };
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [formData.timeFormat, formData.serverTimezone]);

  // Handle Timezone Change
  const handleTimezoneChange = async (newTz: string) => {
    setFormData((prev) => ({ ...prev, serverTimezone: newTz }));
    setServerTimeFeedback(null);
    try {
      const res = await updateServerTimezoneApi(newTz);
      if (res?.serverTime) {
        setServerTimeInfo(res.serverTime);
      }
      setServerTimeFeedback({
        type: 'success',
        message: isEn
          ? `Host server timezone updated to ${newTz}`
          : `منطقه زمانی سرور با موفقیت به ${newTz} تغییر یافت.`,
      });
    } catch (err: any) {
      setServerTimeFeedback({
        type: 'error',
        message: err?.message || (isEn ? 'Failed to update timezone' : 'خطا در اعمال منطقه زمانی'),
      });
    }
  };

  // Handle NTP Sync Now
  const handleNtpSyncNow = async () => {
    setIsSyncingNtp(true);
    setServerTimeFeedback(null);
    try {
      const res = await syncServerNtpApi(formData.serverNtpServer);
      if (res?.serverTime) {
        setServerTimeInfo(res.serverTime);
      }
      setServerTimeFeedback({
        type: 'success',
        message: isEn ? res.message : res.message_fa,
      });
    } catch (err: any) {
      setServerTimeFeedback({
        type: 'error',
        message: err?.message || (isEn ? 'NTP synchronization failed' : 'خطا در همگام‌سازی زمان با سرور NTP'),
      });
    } finally {
      setIsSyncingNtp(false);
    }
  };

  // Handle Sync with Local Browser Time
  const handleSyncWithBrowserTime = async () => {
    setIsSettingManualTime(true);
    setServerTimeFeedback(null);
    try {
      const nowTs = Date.now();
      const res = await setServerManualTimeApi(nowTs);
      if (res?.serverTime) {
        setServerTimeInfo(res.serverTime);
      }
      setServerTimeFeedback({
        type: 'success',
        message: isEn
          ? 'Server clock successfully synchronized with your local browser time.'
          : 'ساعت سرور با موفقیت بر اساس ساعت مرورگر و سیستم محلی شما تنظیم شد.',
      });
    } catch (err: any) {
      setServerTimeFeedback({
        type: 'error',
        message: err?.message || (isEn ? 'Failed to synchronize with browser time' : 'خطا در تنظیم ساعت بر اساس مرورگر'),
      });
    } finally {
      setIsSettingManualTime(false);
    }
  };

  // Open Manual Time Adjustment Modal
  const handleOpenManualTimeModal = () => {
    const d = serverTimeInfo ? new Date(serverTimeInfo.timestamp) : new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const sec = String(d.getSeconds()).padStart(2, '0');
    setManualDateInput(`${yyyy}-${mm}-${dd}`);
    setManualTimeInput(`${hh}:${min}:${sec}`);
    setShowManualTimeModal(true);
    setIsManualModalMinimized(false);
    setIsManualModalMaximized(false);
  };

  // Handle Save Manual Time
  const handleSaveManualTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDateInput || !manualTimeInput) return;
    setIsSettingManualTime(true);
    setServerTimeFeedback(null);
    try {
      const [year, month, day] = manualDateInput.split('-').map(Number);
      const [hour, minute, second] = manualTimeInput.split(':').map((s) => Number(s) || 0);
      const targetDate = new Date(year, month - 1, day, hour, minute, second || 0);
      if (isNaN(targetDate.getTime())) {
        throw new Error(isEn ? 'Invalid date or time' : 'تاریخ یا ساعت نامعتبر است');
      }
      const res = await setServerManualTimeApi(targetDate.getTime());
      if (res?.serverTime) {
        setServerTimeInfo(res.serverTime);
      }
      setShowManualTimeModal(false);
      setServerTimeFeedback({
        type: 'success',
        message: isEn ? res.message : res.message_fa,
      });
    } catch (err: any) {
      setServerTimeFeedback({
        type: 'error',
        message: err?.message || (isEn ? 'Failed to set server time' : 'خطا در تنظیم دستی ساعت سرور'),
      });
    } finally {
      setIsSettingManualTime(false);
    }
  };

  // Load latest settings from database on mount
  useEffect(() => {
    syncGeneralSettingsFromDatabase().then((synced) => {
      if (synced) {
        setFormData(synced);
        updateDocumentFavicon(synced);
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
      updateDocumentFavicon(saved);
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
      updateDocumentFavicon(DEFAULT_PANEL_GENERAL_SETTINGS);
      setLogoUploadInfo(null);
      setSaveFeedback({
        type: 'success',
        message: isEn
          ? 'Settings reset to defaults. Click "Save Settings" to persist.'
          : 'تنظیمات به مقادیر پیش‌فرض بازگردانده شد. جهت اعمال دائمی، روی «ذخیره تنظیمات» کلیک کنید.',
      });
    }
  };

  // Handle Logo File Upload (supports PNG, SVG, JPG, WebP - auto scales/fits to panel logo size)
  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.svg') && !file.name.toLowerCase().endsWith('.ico')) {
      alert(isEn ? 'Please select a valid image file (PNG, SVG, JPG, WebP).' : 'لطفاً یک فایل تصویری معتبر (PNG، SVG، JPG، WebP) انتخاب نمایید.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert(isEn ? 'Image size must be less than 10MB.' : 'حجم تصویر باید کمتر از ۱۰ مگابایت باشد.');
      return;
    }

    setIsProcessingLogo(true);
    try {
      // Scale and fit any size/resolution image to panel standard 256x256 high-DPI square canvas with transparent background
      const result = await scaleImageToPanelLogo(file, 256);
      setFormData((prev) => {
        const next = {
          ...prev,
          logoType: 'custom_url' as const,
          logoCustomUrl: result.dataUrl,
        };
        if (next.faviconType === 'same_as_logo') {
          updateDocumentFavicon(next);
        }
        return next;
      });

      setLogoUploadInfo({
        originalSize: `${result.originalWidth}×${result.originalHeight}`,
        scaledSize: '256×256 (PNG)',
        format: result.format.toUpperCase(),
      });
    } catch (err: any) {
      alert(isEn ? 'Failed to process logo image.' : 'خطا در پردازش تصویر لوگو.');
    } finally {
      setIsProcessingLogo(false);
      e.target.value = '';
    }
  };

  // Handle Favicon File Upload (supports ICO, PNG, SVG - auto scales to favicon size)
  const handleFaviconFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.ico') && !file.name.toLowerCase().endsWith('.svg')) {
      alert(isEn ? 'Please select a valid icon file (ICO, PNG, SVG).' : 'لطفاً یک فایل آیکون معتبر (ICO، PNG، SVG) انتخاب نمایید.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert(isEn ? 'Icon size must be less than 5MB.' : 'حجم آیکون باید کمتر از ۵ مگابایت باشد.');
      return;
    }

    setIsProcessingFavicon(true);
    try {
      const result = await scaleImageToPanelLogo(file, 64);
      setFormData((prev) => {
        const next = {
          ...prev,
          faviconType: 'custom_url' as const,
          faviconCustomUrl: result.dataUrl,
        };
        updateDocumentFavicon(next);
        return next;
      });
    } catch (err: any) {
      alert(isEn ? 'Failed to process favicon.' : 'خطا در پردازش فایل فاو‌آیکون.');
    } finally {
      setIsProcessingFavicon(false);
      e.target.value = '';
    }
  };

  // Available Themes (including Google Dark merged into panel themes)
  const themeList: { id: ThemeType; nameEn: string; nameFa: string; color: string; border: string }[] = [
    { id: 'obsidian', nameEn: 'Obsidian Dark', nameFa: 'ابریشم سیاه (پیش‌فرض)', color: '#6366f1', border: 'border-indigo-500' },
    { id: 'emerald', nameEn: 'Emerald Green', nameFa: 'زمردی سایبر', color: '#10b981', border: 'border-emerald-500' },
    { id: 'cobalt', nameEn: 'Cobalt Deep', nameFa: 'کبالت عمیق', color: '#0284c7', border: 'border-sky-500' },
    { id: 'rose', nameEn: 'Rose Crimson', nameFa: 'رز سرخ مانیتورینگ', color: '#f43f5e', border: 'border-rose-500' },
    { id: 'amber', nameEn: 'Cyber Amber', nameFa: 'کهربایی اختصاصی', color: '#f59e0b', border: 'border-amber-500' },
    { id: 'light', nameEn: 'Ergonomic Light', nameFa: 'تم روشن اداری', color: '#64748b', border: 'border-slate-400' },
    { id: 'google-dark', nameEn: 'Google Dark', nameFa: 'گوگل دارک', color: '#8ab4f8', border: 'border-blue-400' },
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
                      infoWhatEn="Determines whether the header displays a high-tech built-in SVG icon or custom company logo (PNG/SVG)."
                      infoWhatFa="تعیین نوع نشان هدر سامانه بین آیکون‌های وکتور شبکه یا لوگوی اختصاصی سازمان (PNG با پس‌زمینه شفاف یا SVG)."
                      infoWhyEn="Ensures platform branding matches organizational identity guidelines and seamlessly scales to panel logo bounds."
                      infoWhyFa="انطباق کامل ظاهر پنل با برند و هویت بصری سازمانی با مقیاس‌بندی و انطباق خودکار بر ابعاد لوگوی پنل."
                      infoExampleEn="Upload an organizational PNG (any resolution) or select 'Network Node'"
                      infoExampleFa="بارگذاری فایل PNG سازمانی در هر سایز و ابعادی یا انتخاب آیکون نود شبکه"
                    />
                  </label>

                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-white/10 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        const next = { ...formData, logoType: 'preset' as const };
                        setFormData(next);
                        if (next.faviconType === 'same_as_logo') {
                          updateDocumentFavicon(next);
                        }
                      }}
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
                      onClick={() => {
                        const next = { ...formData, logoType: 'custom_url' as const };
                        setFormData(next);
                        if (next.faviconType === 'same_as_logo') {
                          updateDocumentFavicon(next);
                        }
                      }}
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
                  /* Custom URL / Upload Box with PNG & Auto-scaling */
                  <div className={`p-4 rounded-xl border space-y-3 ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-white/10'}`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={formData.logoCustomUrl || ''}
                        onChange={(e) => {
                          const next = { ...formData, logoCustomUrl: e.target.value };
                          setFormData(next);
                          if (next.faviconType === 'same_as_logo') {
                            updateDocumentFavicon(next);
                          }
                        }}
                        placeholder={isEn ? 'Enter Image URL (PNG, SVG, HTTPS...)' : 'آدرس اینترنتی مستقیم لوگو (PNG، SVG، HTTPS...)'}
                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs border focus:outline-none focus:border-indigo-500 ${
                          isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-white/10 text-white'
                        }`}
                      />
                      <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold cursor-pointer transition shrink-0">
                        {isProcessingLogo ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-300" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>{isProcessingLogo ? (isEn ? 'Scaling...' : 'در حال پردازش...') : (isEn ? 'Upload PNG / SVG' : 'آپلود PNG / SVG')}</span>
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg,.svg,.webp,.ico,image/png,image/svg+xml,image/*"
                          onChange={handleLogoFileUpload}
                          disabled={isProcessingLogo}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>
                        {isEn
                          ? 'PNG (with transparency) & SVG supported. Any uploaded image automatically scales to fit the panel logo size.'
                          : 'پشتیبانی کامل از فرمت PNG (با پس‌زمینه شفاف) و SVG. تصویر در هر اندازه‌ای آپلود شود، خودکار به ابعاد لوگوی پنل تبدیل و فیت می‌شود.'}
                      </span>
                    </div>

                    {formData.logoCustomUrl && (
                      <div className="p-3 rounded-lg bg-black/25 border border-white/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 min-w-8 min-h-8 max-w-8 max-h-8 rounded-xl object-contain shadow-[0_0_15px_rgba(99,102,241,0.5)] border border-white/20 p-0.5 bg-black/40 flex items-center justify-center shrink-0">
                              <img
                                src={formData.logoCustomUrl}
                                alt="Custom Logo"
                                className="w-full h-full object-contain"
                              />
                            </div>
                            <div>
                              <div className="text-xs text-slate-200 font-mono truncate max-w-[220px]">
                                {formData.logoCustomUrl.startsWith('data:')
                                  ? (isEn ? 'Auto-Scaled Image Loaded' : 'لوگوی بهینه‌شده بارگذاری شد')
                                  : formData.logoCustomUrl}
                              </div>
                              {logoUploadInfo && (
                                <div className="text-[10px] text-indigo-300 font-mono flex items-center gap-2">
                                  <span>{isEn ? `Original: ${logoUploadInfo.originalSize}` : `سایز اولیه: ${logoUploadInfo.originalSize}`}</span>
                                  <span>→</span>
                                  <span className="text-emerald-400 font-bold">{isEn ? `Fitted: ${logoUploadInfo.scaledSize}` : `انطباق: ${logoUploadInfo.scaledSize}`}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const next = { ...formData, logoCustomUrl: '' };
                              setFormData(next);
                              setLogoUploadInfo(null);
                              if (next.faviconType === 'same_as_logo') {
                                updateDocumentFavicon(next);
                              }
                            }}
                            className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer font-bold px-2 py-1"
                          >
                            {isEn ? 'Remove' : 'حذف'}
                          </button>
                        </div>

                        {/* Dual Viewport Preview Mockup */}
                        <div className="pt-2 border-t border-white/5 flex items-center gap-4 text-[11px] text-slate-400">
                          <span className="text-slate-500 font-mono text-[10px]">{isEn ? 'Display Previews:' : 'پیش‌نمایش در سامانه:'}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400">{isEn ? 'Navbar (32px):' : 'هدر (۳۲px):'}</span>
                            <div className="w-6 h-6 rounded-lg bg-black/40 border border-white/20 p-0.5 flex items-center justify-center">
                              <img src={formData.logoCustomUrl} alt="Nav Preview" className="w-full h-full object-contain" />
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400">{isEn ? 'Login (36px):' : 'لاگین (۳۶px):'}</span>
                            <div className="w-7 h-7 rounded-lg bg-black/40 border border-white/20 p-0.5 flex items-center justify-center">
                              <img src={formData.logoCustomUrl} alt="Login Preview" className="w-full h-full object-contain" />
                            </div>
                          </div>
                        </div>
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
                          onClick={() => {
                            const next = { ...formData, logoType: 'preset' as const, logoPreset: p.id as any };
                            setFormData(next);
                            if (next.faviconType === 'same_as_logo') {
                              updateDocumentFavicon(next);
                            }
                          }}
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

              {/* Item: Panel Favicon (Browser Tab Icon) */}
              <div className="space-y-3 pt-3 border-t border-white/10">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    <span>{isEn ? 'Panel Favicon (Browser Tab Icon)' : 'فاو‌آیکون پنل (نشان تب مرورگر / Favicon)'}</span>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      title={isEn ? 'Browser Favicon Setup' : 'تنظیم فاو‌آیکون مرورگر'}
                      infoWhatEn="The miniature icon displayed in the browser tab and bookmarks beside the application title."
                      infoWhatFa="آیکون گرافیکی کوچکی که در نوار تب‌های مرورگر و بوک‌مارک‌ها کنار عنوان پنل دیده می‌شود."
                      infoWhyEn="Ensures corporate brand consistency across open tabs and enables instant visual identification."
                      infoWhyFa="شخصی‌سازی صددرصدی تجربه کاربری، متمایزسازی تب‌های باز پنل از سایر سایت‌ها و یکپارچگی هویت بصری سازمانی."
                      infoExampleEn="Select 'Same as Logo', a network vector preset, or upload an organizational PNG/ICO/SVG."
                      infoExampleFa="انتخاب گزینه «همانند لوگوی پنل»، آیکون‌های وکتور شبکه، یا بارگذاری فایل اختصاصی PNG/ICO/SVG."
                    />
                  </label>

                  {/* Mode Selector Buttons */}
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-white/10 text-[11px] overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => {
                        const next = { ...formData, faviconType: 'default' as const };
                        setFormData(next);
                        updateDocumentFavicon(next);
                      }}
                      className={`px-2 py-1 rounded-md transition cursor-pointer font-medium whitespace-nowrap ${
                        (formData.faviconType || 'default') === 'default'
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {isEn ? 'Default' : 'پیش‌فرض'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = { ...formData, faviconType: 'same_as_logo' as const };
                        setFormData(next);
                        updateDocumentFavicon(next);
                      }}
                      className={`px-2 py-1 rounded-md transition cursor-pointer font-medium whitespace-nowrap ${
                        formData.faviconType === 'same_as_logo'
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {isEn ? 'Same as Logo' : 'همانند لوگوی پنل'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = { ...formData, faviconType: 'preset' as const };
                        setFormData(next);
                        updateDocumentFavicon(next);
                      }}
                      className={`px-2 py-1 rounded-md transition cursor-pointer font-medium whitespace-nowrap ${
                        formData.faviconType === 'preset'
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {isEn ? 'Presets' : 'آیکون‌ها'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = { ...formData, faviconType: 'custom_url' as const };
                        setFormData(next);
                        updateDocumentFavicon(next);
                      }}
                      className={`px-2 py-1 rounded-md transition cursor-pointer font-medium whitespace-nowrap ${
                        formData.faviconType === 'custom_url'
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {isEn ? 'Upload / URL' : 'آپلود / آدرس'}
                    </button>
                  </div>
                </div>

                {/* Simulated Browser Tab Live Preview */}
                <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                  isLightMode ? 'bg-slate-100/90 border-slate-300' : 'bg-slate-950/70 border-white/10'
                }`}>
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider shrink-0">
                      {isEn ? 'Browser Tab Preview:' : 'پیش‌نمایش تب مرورگر:'}
                    </span>
                    {/* Tab mockup */}
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs max-w-[280px] shadow-sm ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-800'
                        : 'bg-slate-900 border-indigo-500/30 text-slate-200'
                    }`}>
                      <img
                        src={resolveFaviconUrl(formData).href}
                        alt="Favicon"
                        className="w-4 h-4 object-contain rounded shrink-0"
                      />
                      <span className="font-semibold text-[11px] truncate">
                        {formData.panelTitle || 'NetTopology Pro'}
                      </span>
                      <span className="text-slate-400 text-[10px] ml-auto pl-1 shrink-0">×</span>
                    </div>
                  </div>

                  <span className="text-[10px] text-emerald-400 font-mono hidden sm:inline-block">
                    {isEn ? '● Live in Browser' : '● اعمال لحظه‌ای در تب مرورگر'}
                  </span>
                </div>

                {/* Content based on faviconType */}
                {formData.faviconType === 'custom_url' && (
                  <div className={`p-4 rounded-xl border space-y-3 ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-white/10'}`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={formData.faviconCustomUrl || ''}
                        onChange={(e) => {
                          const next = { ...formData, faviconCustomUrl: e.target.value };
                          setFormData(next);
                          updateDocumentFavicon(next);
                        }}
                        placeholder={isEn ? 'Enter Favicon URL (ICO, PNG, SVG)' : 'آدرس اینترنتی مستقیم فاو‌آیکون (ICO, PNG, SVG)'}
                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs border focus:outline-none focus:border-indigo-500 ${
                          isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-white/10 text-white'
                        }`}
                      />
                      <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold cursor-pointer transition shrink-0">
                        {isProcessingFavicon ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-300" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>{isProcessingFavicon ? (isEn ? 'Scaling...' : 'در حال پردازش...') : (isEn ? 'Upload Icon' : 'آپلود آیکون')}</span>
                        <input
                          type="file"
                          accept=".ico,.png,.svg,.webp,image/*"
                          onChange={handleFaviconFileUpload}
                          disabled={isProcessingFavicon}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {formData.faviconCustomUrl && (
                      <div className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-white/5">
                        <div className="flex items-center gap-2">
                          <img src={formData.faviconCustomUrl} alt="Custom Favicon" className="w-6 h-6 rounded object-contain bg-white/5 p-0.5" />
                          <span className="text-xs text-slate-300 font-mono truncate max-w-[240px]">
                            {formData.faviconCustomUrl.startsWith('data:') ? (isEn ? 'Custom Icon Loaded' : 'آیکون بارگذاری شد') : formData.faviconCustomUrl}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const next = { ...formData, faviconCustomUrl: '' };
                            setFormData(next);
                            updateDocumentFavicon(next);
                          }}
                          className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer font-bold px-2 py-1"
                        >
                          {isEn ? 'Remove' : 'حذف'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {formData.faviconType === 'preset' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {presetLogos.map((p) => {
                      const Icon = p.icon;
                      const isSelected = (formData.faviconPreset || 'network') === p.id;
                      return (
                        <button
                          key={`fav-${p.id}`}
                          type="button"
                          onClick={() => {
                            const next = { ...formData, faviconPreset: p.id as any };
                            setFormData(next);
                            updateDocumentFavicon(next);
                          }}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs transition cursor-pointer text-left ${
                            isSelected
                              ? 'bg-indigo-600/25 border-indigo-500 text-white font-bold shadow-sm'
                              : isLightMode
                              ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                              : 'bg-slate-900/40 border-white/5 text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-lg bg-gradient-to-tr ${p.color} flex items-center justify-center text-white shrink-0`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className="truncate text-xs">{isEn ? p.labelEn : p.labelFa}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 ml-auto shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {formData.faviconType === 'same_as_logo' && (
                  <p className={`text-[11px] ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                    {isEn
                      ? 'Favicon automatically synchronizes with the active panel logo and graphic style.'
                      : 'فاو‌آیکون به صورت خودکار و هوشمند با لوگوی فعال پنل و سبک گرافیکی آن هماهنگ می‌شود.'}
                  </p>
                )}

                {formData.faviconType === 'default' && (
                  <p className={`text-[11px] ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                    {isEn
                      ? 'Using standard high-tech NetTopology network node vector favicon.'
                      : 'استفاده از فاو‌آیکون استاندارد وکتور نود شبکه NetTopology.'}
                  </p>
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

              {/* Themes Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {themeList.map((t) => {
                  const isSelected = formData.defaultTheme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, defaultTheme: t.id });
                        if (onChangeTheme) onChangeTheme(t.id);
                      }}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs transition cursor-pointer text-left ${
                        isSelected
                          ? `bg-indigo-600/20 ${t.border} text-white font-bold shadow-md ring-1 ring-indigo-500`
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

            {/* Card 5: Allowed Authentication Methods & Login Gateways */}
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
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className={`text-base font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn ? 'Allowed Login Authentication Methods' : 'روش‌های مجاز احراز هویت و ورود به سامانه'}
                    </h3>
                    <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn
                        ? 'Specify which user identity providers (Local database, Active Directory domain, or both) are permitted to sign in.'
                        : 'مشخص نمایید کدام کاربران (حساب‌های محلی پنل، اکتیو دایرکتوری سازمانی، یا هر دو) مجاز به ورود به سامانه هستند.'}
                    </p>
                  </div>
                </div>

                <span className="text-xs font-mono text-indigo-400 font-bold uppercase px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                  {formData.allowedAuthMethods === 'local_only'
                    ? (isEn ? 'LOCAL ONLY' : 'فقط محلی')
                    : formData.allowedAuthMethods === 'ad_only'
                    ? (isEn ? 'AD ONLY' : 'فقط اکتیو دایرکتوری')
                    : (isEn ? 'DUAL AUTH (BOTH)' : 'هر دو روش')}
                </span>
              </div>

              {/* Allowed Auth Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    <span>{isEn ? 'Authorized Login Providers' : 'روش‌های مجاز احراز هویت'}</span>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      title={isEn ? 'Allowed Login Methods' : 'روش‌های مجاز احراز هویت'}
                      infoWhatEn="Controls which authentication mechanisms (Local accounts, Active Directory domain accounts, or both) are allowed to log into the panel."
                      infoWhatFa="تعیین سازوکارهای مجاز احراز هویت در صفحه لاگین پنل، شامل کاربران محلی، کاربران اکتیو دایرکتوری سازمانی یا هر دو."
                      infoWhyEn="Enforces enterprise identity governance policies by disabling local shadow accounts or mandating single sign-on via Active Directory."
                      infoWhyFa="اعمال سیاست‌های حاکمیت امنیت سازمانی جهت غیرفعال‌سازی حساب‌های محلی سایه و الزام به ورود صرفاً از طریق دامین کنترلر، یا برعکس."
                      infoExampleEn="Both (standard dual-mode), Local Only (isolated networks), or Active Directory Only (strict corporate SSO compliance)"
                      infoExampleFa="هر دو (حالت پیش‌فرض استاندارد)، فقط محلی (شبکه‌های ایزوله آفلاین)، یا فقط اکتیو دایرکتوری (الزام سازمانی)"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Option 1: Both */}
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, allowedAuthMethods: 'both' })}
                    className={`p-3.5 rounded-xl border text-left rtl:text-right transition cursor-pointer flex flex-col justify-between ${
                      (formData.allowedAuthMethods || 'both') === 'both'
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-md ring-1 ring-indigo-500/50'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                        : 'bg-slate-900 border-white/5 text-slate-400 hover:text-white hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {isEn ? 'Both (Local & AD)' : 'هر دو روش (محلی و AD)'}
                        </span>
                      </div>
                      {(formData.allowedAuthMethods || 'both') === 'both' && (
                        <Check className="w-4 h-4 text-indigo-400" />
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {isEn
                        ? 'Users can sign in with either local administrator accounts or enterprise Active Directory credentials.'
                        : 'کاربران می‌توانند با حساب‌های محلی پنل یا با نام کاربری و رمز دامین اکتیو دایرکتوری وارد شوند.'}
                    </p>
                  </button>

                  {/* Option 2: Local Only */}
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, allowedAuthMethods: 'local_only' })}
                    className={`p-3.5 rounded-xl border text-left rtl:text-right transition cursor-pointer flex flex-col justify-between ${
                      formData.allowedAuthMethods === 'local_only'
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-md ring-1 ring-indigo-500/50'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                        : 'bg-slate-900 border-white/5 text-slate-400 hover:text-white hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {isEn ? 'Local Accounts Only' : 'فقط حساب‌های محلی'}
                        </span>
                      </div>
                      {formData.allowedAuthMethods === 'local_only' && (
                        <Check className="w-4 h-4 text-indigo-400" />
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {isEn
                        ? 'Only local accounts stored in the panel database can sign in. Active Directory authentication is completely disabled.'
                        : 'صرفاً حساب‌های ثبت‌شده در دیتابیس محلی پنل مجاز به ورود هستند. ورود با اکتیو دایرکتوری کاملاً مسدود می‌شود.'}
                    </p>
                  </button>

                  {/* Option 3: AD Only */}
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, allowedAuthMethods: 'ad_only' })}
                    className={`p-3.5 rounded-xl border text-left rtl:text-right transition cursor-pointer flex flex-col justify-between ${
                      formData.allowedAuthMethods === 'ad_only'
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-md ring-1 ring-indigo-500/50'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                        : 'bg-slate-900 border-white/5 text-slate-400 hover:text-white hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {isEn ? 'Active Directory Only' : 'فقط اکتیو دایرکتوری'}
                        </span>
                      </div>
                      {formData.allowedAuthMethods === 'ad_only' && (
                        <Check className="w-4 h-4 text-indigo-400" />
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {isEn
                        ? 'Only domain users authenticated via corporate Active Directory / LDAP can sign in. Local account logins are rejected.'
                        : 'تنها کاربران دامین احراز هویت‌شده از طریق اکتیو دایرکتوری سازمانی حق ورود دارند و ورود محلی مسدود می‌شود.'}
                    </p>
                  </button>
                </div>

                {formData.allowedAuthMethods === 'ad_only' && (
                  <div className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                    isLightMode
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                  }`}>
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      {isEn
                        ? 'Important: Ensure Active Directory connection is verified and at least one synchronized domain user has Super Administrator permissions to prevent administrative lockout.'
                        : 'توجه مهم: پیش از ذخیره، از اتصال صحیح به سرور اکتیو دایرکتوری و داشتن دسترسی مدیر ارشد برای حداقل یک کاربر دامین اطمینان حاصل فرمایید تا دسترسی مدیریتی مسدود نگردد.'}
                    </p>
                  </div>
                )}

                {/* Two-Step Verification (2FA / OTP via Email) */}
                <div className="pt-4 mt-2 border-t border-white/10 space-y-3">
                  <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                    formData.twoFactorEnabled
                      ? isLightMode
                        ? 'bg-indigo-50/80 border-indigo-300 shadow-sm'
                        : 'bg-indigo-950/30 border-indigo-500/40 shadow-inner'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-slate-900/60 border-white/5'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl border mt-0.5 shrink-0 ${
                        formData.twoFactorEnabled
                          ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-400'
                          : 'bg-slate-800/60 border-white/10 text-slate-400'
                      }`}>
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                            {isEn ? 'Two-Step Verification (2FA / OTP via Email)' : 'احراز هویت دو مرحله‌ای (2FA با ارسال کد به ایمیل)'}
                          </span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase border ${
                            formData.twoFactorEnabled
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400 border-white/10'
                          }`}>
                            {formData.twoFactorEnabled
                              ? (isEn ? '2FA ACTIVE' : 'فعال')
                              : (isEn ? 'DISABLED' : 'غیرفعال')}
                          </span>
                          <FieldInfoTooltip
                            isEn={isEn}
                            isLightMode={isLightMode}
                            title={isEn ? 'Two-Step Verification' : 'احراز هویت دو مرحله‌ای'}
                            infoWhatEn="Enforces an authentic two-step verification flow for all users signing in with username and password. A secure 6-digit one-time code (OTP) is dispatched to the user's email."
                            infoWhatFa="الزام تایید هویت دو مرحله‌ای برای تمامی کاربران هنگام ورود به سامانه با نام کاربری و کلمه عبور؛ کد ۶ رقمی امنیتی به ایمیل کاربر ارسال می‌شود."
                            infoWhyEn="Hardens administrative security and prevents unauthorized panel entry even if user credentials are leaked or intercepted."
                            infoWhyFa="ارتقای چشمگیر امنیت پنل و جلوگیری از نفوذ غیرمجاز حتی در صورت افشای رمز عبور کاربران."
                            infoExampleEn="Highly recommended for production and enterprise networks."
                            infoExampleFa="توصیه اکید برای تمامی شبکه‌های عملیاتی و سازمانی."
                          />
                        </div>
                        <p className={`text-[11px] mt-1 leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                          {isEn
                            ? 'When enabled, after entering valid credentials, users must submit a 6-digit one-time verification code dispatched to their email address in an enterprise-branded security template.'
                            : 'در صورت فعال‌سازی، پس از ورود نام کاربری و کلمه عبور، کد تایید ۶ رقمی یک‌بار مصرف در قالبی سازمانی و زیبا به ایمیل کاربر ارسال شده و ورود تنها پس از تایید این کد امکان‌پذیر خواهد بود.'}
                        </p>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0 self-end sm:self-center">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.twoFactorEnabled)}
                        onChange={(e) => setFormData({ ...formData, twoFactorEnabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] rtl:after:left-auto rtl:after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {/* Diagnostic / SMTP notification when 2FA is enabled */}
                  {formData.twoFactorEnabled && (
                    <div className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                      smtpConfigured === false
                        ? isLightMode
                          ? 'bg-amber-50 border-amber-300 text-amber-900'
                          : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                        : isLightMode
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                    }`}>
                      {smtpConfigured === false ? (
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        {smtpConfigured === false ? (
                          <p className="leading-relaxed">
                            {isEn
                              ? 'Notice: Outgoing SMTP mail server is not yet configured. Please configure SMTP in System -> Email Settings so users receive verification codes in their inbox.'
                              : 'توجه: سرور ارسال ایمیل (SMTP) هنوز در سامانه پیکربندی نشده است. جهت ارسال کدها به کاربران، تنظیمات SMTP را در بخش «تنظیمات سیستم -> تنظیمات ایمیل» تکمیل فرمایید.'}
                          </p>
                        ) : (
                          <p className="leading-relaxed font-medium">
                            {isEn
                              ? `Outgoing SMTP mail service is active (${smtpHostName || 'Configured'}). Two-Step Verification codes will be delivered to signing-in users.`
                              : `سرویس ارسال ایمیل SMTP فعال است (${smtpHostName || 'پیکربندی شده'}). کدهای تایید دو مرحله‌ای به آدرس ایمیل کاربران ارسال خواهند شد.`}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Card 6: Server Time, Timezone & NTP Management */}
            <div
              className={`p-6 rounded-2xl border backdrop-blur-xl shadow-lg space-y-5 ${
                isLightMode
                  ? 'bg-white/90 border-slate-200 shadow-slate-200/50'
                  : 'bg-slate-950/60 border-white/10'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className={`text-base font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn ? 'Server Time, Timezone & NTP Clock' : 'ساعت سرور، منطقه زمانی و پروتکل NTP'}
                    </h3>
                    <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn
                        ? 'Manage host server clock, IANA timezone identification, and NTP network time synchronization.'
                        : 'تنظیم منطقه زمانی رسمی سرور میزبان پنل، کالیبراسیون ساعت سیستم و همگام‌سازی با سرورهای NTP.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                    {serverTimeInfo?.utcOffset || 'UTC+03:30'}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-[10px] font-mono font-bold uppercase border ${
                    formData.serverNtpEnabled !== false
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-white/10'
                  }`}>
                    {formData.serverNtpEnabled !== false
                      ? (isEn ? 'NTP Active' : 'NTP فعال')
                      : (isEn ? 'NTP Off' : 'NTP غیرفعال')}
                  </span>
                </div>
              </div>

              {/* Live Server Digital Clock Dashboard */}
              <div className={`p-4 rounded-xl border relative overflow-hidden ${
                isLightMode
                  ? 'bg-gradient-to-br from-slate-100 to-slate-50 border-slate-300'
                  : 'bg-gradient-to-br from-slate-950/90 via-slate-900/60 to-cyan-950/20 border-cyan-500/30 shadow-inner'
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-cyan-500/20 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="font-semibold text-xs text-emerald-400">
                      {isEn ? 'Live Host Server Clock' : 'ساعت زنده سرور میزبان پنل'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-cyan-300 px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30">
                      {serverTimeInfo?.timezone || formData.serverTimezone || 'Asia/Tehran'}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {serverTimeInfo?.utcTime || 'UTC'}
                    </span>
                  </div>
                </div>

                <div className="py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-center sm:text-left rtl:sm:text-right">
                    <div className="text-3xl sm:text-4xl font-extrabold font-mono tracking-wider text-cyan-400 drop-shadow-sm">
                      {serverTimeInfo?.formattedTime || '12:00:00'}
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                      <span>{serverTimeInfo?.formattedDateEn || new Date().toDateString()}</span>
                      {serverTimeInfo?.formattedDateFa && (
                        <>
                          <span className="text-slate-600">•</span>
                          <span className="text-cyan-300/90 font-medium">{serverTimeInfo.formattedDateFa}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Direct Sync Shortcuts */}
                  <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleNtpSyncNow}
                      disabled={isSyncingNtp}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingNtp ? 'animate-spin' : ''}`} />
                      <span>{isSyncingNtp ? (isEn ? 'Syncing...' : 'در حال همگام‌سازی...') : (isEn ? 'Sync with NTP' : 'همگام‌سازی با NTP')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSyncWithBrowserTime}
                      disabled={isSettingManualTime}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 transition cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                      <Laptop className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Sync with My System' : 'تنظیم بر اساس این مرورگر'}</span>
                    </button>
                  </div>
                </div>

                {/* Server Uptime & NTP Status */}
                <div className="pt-2 border-t border-cyan-500/20 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      {isEn ? 'Upstream NTP: ' : 'سرور NTP مرجع: '}
                      <strong className="text-slate-200 font-mono">{formData.serverNtpServer || 'ir.pool.ntp.org'}</strong>
                    </span>
                  </div>
                  {serverTimeInfo?.uptimeSeconds !== undefined && (
                    <span className="font-mono text-slate-400">
                      {isEn ? 'Host Uptime: ' : 'آپ‌تایم پردازش: '}
                      {Math.floor(serverTimeInfo.uptimeSeconds / 3600)}h {Math.floor((serverTimeInfo.uptimeSeconds % 3600) / 60)}m
                    </span>
                  )}
                </div>
              </div>

              {/* Feedback Alert if Action Triggered */}
              {serverTimeFeedback && (
                <div
                  className={`p-3 rounded-xl border flex items-start gap-2 text-xs animate-fadeIn ${
                    serverTimeFeedback.type === 'success'
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                  }`}
                >
                  {serverTimeFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <p className="leading-relaxed">{serverTimeFeedback.message}</p>
                </div>
              )}

              {/* Setting 1: Server Timezone */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    <span>{isEn ? 'Server Official Timezone' : 'منطقه زمانی رسمی سرور (Timezone)'}</span>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      title={isEn ? 'Server Official Timezone' : 'منطقه زمانی رسمی سرور'}
                      infoWhatEn="The official IANA Timezone identifier (such as Asia/Tehran, UTC, Europe/London) applied to the host server operating system and node runtime."
                      infoWhatFa="شناسه استاندارد منطقه زمانی IANA (مانند Asia/Tehran، UTC، Europe/London) که به سیستم‌عامل سرور و فرایند نود اعمال می‌گردد."
                      infoWhyEn="Ensures all command executions, scheduled backups, audit logs, and email digests accurately match your exact administrative local time."
                      infoWhyFa="تضمین می‌کند که برچسب‌های زمانی اجرای دستورات، زمان‌بندی بکاپ‌گیری خودکار، لاگ‌های ممیزی و گزارش‌های ایمیل دقیقاً مطابق با ساعت اداری محلی شما ثبت گردند."
                      infoExampleEn="Asia/Tehran (UTC+03:30) or UTC (Coordinated Universal Time)"
                      infoExampleFa="Asia/Tehran (UTC+03:30) برای ایران یا UTC"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowCustomTzField(!showCustomTzField)}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 transition cursor-pointer underline"
                  >
                    {showCustomTzField
                      ? (isEn ? 'Select standard list' : 'انتخاب از لیست مناطق استاندارد')
                      : (isEn ? 'Enter custom IANA zone' : 'ورود منطقه زمانی دلخواه (IANA)')}
                  </button>
                </div>

                {!showCustomTzField ? (
                  <select
                    value={formData.serverTimezone || 'Asia/Tehran'}
                    onChange={(e) => handleTimezoneChange(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm border transition focus:outline-none focus:border-cyan-500 font-sans cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-900'
                        : 'bg-slate-900 border-white/10 text-white'
                    }`}
                  >
                    {['Iran & Middle East', 'Standard UTC', 'Europe', 'Americas', 'Asia & Pacific'].map((grp) => {
                      const groupItems = COMMON_TIMEZONES.filter((tz) => tz.groupEn === grp);
                      const grpTitle = isEn
                        ? grp
                        : groupItems[0]?.groupFa || grp;
                      return (
                        <optgroup key={grp} label={grpTitle}>
                          {groupItems.map((tz) => (
                            <option key={tz.id} value={tz.id}>
                              {isEn ? tz.nameEn : tz.nameFa} ({tz.offset}) [{tz.id}]
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customTimezoneInput || formData.serverTimezone || ''}
                      onChange={(e) => setCustomTimezoneInput(e.target.value)}
                      placeholder={isEn ? 'e.g. Asia/Tehran, Europe/Berlin, UTC' : 'مثال: Asia/Tehran یا Europe/Berlin یا UTC'}
                      className={`flex-1 px-3.5 py-2 rounded-xl text-xs sm:text-sm border transition focus:outline-none focus:border-cyan-500 font-mono ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                          : 'bg-slate-900 border-white/10 text-white placeholder:text-slate-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (customTimezoneInput.trim()) {
                          handleTimezoneChange(customTimezoneInput.trim());
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition cursor-pointer"
                    >
                      {isEn ? 'Apply' : 'اعمال'}
                    </button>
                  </div>
                )}
              </div>

              {/* Setting 2: Time Display Format (24h vs 12h) */}
              <div className="space-y-1.5">
                <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                  <span>{isEn ? 'Time Display Format' : 'قالب و شیوه نمایش زمان'}</span>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    title={isEn ? 'Time Display Format' : 'قالب نمایش زمان'}
                    infoWhatEn="Selects whether time in logs, header badges, and dashboard telemetry is displayed in 24-hour military notation (15:45) or 12-hour AM/PM notation."
                    infoWhatFa="تعیین نحوه نمایش ساعت در سرتاسر پنل، لاگ‌های فرمان و ویجت‌های نظارتی به صورت ۲۴ ساعته (۱۵:۴۵) یا ۱۲ ساعته همراه با قبل/بعدازظهر."
                    infoWhyEn="Standardizes chronological audit reports according to your engineering team conventions."
                    infoWhyFa="یکپارچه‌سازی گزارش‌های زمانی بر اساس استانداردهای مهندسی و راحتی اپراتورهای شبکه."
                    infoExampleEn="24-Hour (standard in IT/NOC centers)"
                    infoExampleFa="۲۴ ساعته (استاندارد مراکز NOC و ثبت لاگ)"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, timeFormat: '24h' })}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      formData.timeFormat !== '12h'
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-sm'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{isEn ? '24-Hour (15:45:00)' : '۲۴ ساعته (۱۵:۴۵:۰۰)'}</span>
                    </div>
                    {formData.timeFormat !== '12h' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, timeFormat: '12h' })}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      formData.timeFormat === '12h'
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-sm'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{isEn ? '12-Hour (03:45:00 PM)' : '۱۲ ساعته (۰۳:۴۵:۰۰ عصر)'}</span>
                    </div>
                    {formData.timeFormat === '12h' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                  </button>
                </div>
              </div>

              {/* Setting 3: NTP Synchronization and Server Address */}
              <div className="space-y-3 pt-1 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    <span>{isEn ? 'Network Time Protocol (NTP) Sync' : 'همگام‌سازی خودکار با پروتکل زمان شبکه (NTP)'}</span>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      title={isEn ? 'NTP Network Time Synchronization' : 'همگام‌سازی زمان شبکه (NTP)'}
                      infoWhatEn="Enables automated continuous synchronization of the host operating system clock with atomic time server clusters via UDP port 123."
                      infoWhatFa="فعال‌سازی همگام‌سازی پیوسته و خودکار ساعت سیستم‌عامل سرور با سرورهای اتمی زمان از طریق پورت UDP 123."
                      infoWhyEn="Eliminates CMOS clock drifting and prevents TLS/SSL certificate verification failures and AD Kerberos authentication rejections."
                      infoWhyFa="جلوگیری از انحراف تدریجی ساعت سخت‌افزاری سرور، ابطال گواهی‌های امنیتی SSL و خطاهای احراز هویت کربروس در اکتیو دایرکتوری."
                      infoExampleEn="Enabled (recommended for production deployment)"
                      infoExampleFa="فعال (توصیه‌شده برای تمامی محیط‌های کاری)"
                    />
                  </label>

                  {/* Toggle Button */}
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, serverNtpEnabled: formData.serverNtpEnabled === false ? true : false })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      formData.serverNtpEnabled !== false ? 'bg-cyan-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        formData.serverNtpEnabled !== false ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* NTP Server Input & Presets */}
                {formData.serverNtpEnabled !== false && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className={`text-xs flex items-center gap-1.5 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                        <span>{isEn ? 'NTP Server Address (FQDN / IP)' : 'آدرس سرور زمان NTP (نام یا آی‌پی)'}</span>
                        <FieldInfoTooltip
                          isEn={isEn}
                          isLightMode={isLightMode}
                          title={isEn ? 'NTP Server Hostname' : 'آدرس سرور NTP'}
                          infoWhatEn="Host address or IP of the authoritative NTP server."
                          infoWhatFa="آدرس اینترنتی یا آی‌پی سرور زمان بالادستی جهت دریافت زمان دقیق."
                          infoWhyEn="Allows using isolated internal NTP routers or public pool clusters."
                          infoWhyFa="امکان معرفی سرور زمان داخلی (مانند روتر سیسکو/میکروتیک یا دامین کنترلر) در شبکه‌های ایزوله را فراهم می‌سازد."
                          infoExampleEn="ir.pool.ntp.org, pool.ntp.org, or 192.168.1.1"
                          infoExampleFa="ir.pool.ntp.org یا pool.ntp.org یا 192.168.1.1"
                        />
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={formData.serverNtpServer || 'ir.pool.ntp.org'}
                        onChange={(e) => setFormData({ ...formData, serverNtpServer: e.target.value })}
                        placeholder="e.g. ir.pool.ntp.org or pool.ntp.org"
                        className={`flex-1 px-3.5 py-2 rounded-xl text-xs font-mono border transition focus:outline-none focus:border-cyan-500 ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-900'
                            : 'bg-slate-900 border-white/10 text-white'
                        }`}
                      />
                    </div>

                    {/* Presets Chips */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-slate-500">{isEn ? 'Presets:' : 'سرورهای آماده:'}</span>
                      {['ir.pool.ntp.org', 'pool.ntp.org', 'time.google.com', 'time.cloudflare.com'].map((srv) => (
                        <button
                          key={srv}
                          type="button"
                          onClick={() => setFormData({ ...formData, serverNtpServer: srv })}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-mono border transition cursor-pointer ${
                            formData.serverNtpServer === srv
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold'
                              : isLightMode
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'
                              : 'bg-slate-900 hover:bg-white/5 text-slate-400 border-white/10'
                          }`}
                        >
                          {srv}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Manual Time Button */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {isEn ? 'Need custom time without NTP?' : 'نیاز به تنظیم دلخواه ساعت و تاریخ بدون اینترنت؟'}
                </span>
                <button
                  type="button"
                  onClick={handleOpenManualTimeModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 text-xs font-semibold transition cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Set Manual Time' : 'تنظیم دستی تاریخ و ساعت'}</span>
                </button>
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

              {/* Phase 5: Host Services Manager */}
              <div className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-white/5'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                  <div className="text-xs">
                    <span className="font-bold text-emerald-400">{isEn ? 'Phase 5: ' : 'فاز ۵: '}</span>
                    <span className={isLightMode ? 'text-slate-700' : 'text-slate-300'}>
                      {isEn
                        ? 'Host Services & Daemons: real-time telemetry, start/stop/restart/reload and log inspection for Web Server, Core API, Python Discovery & PostgreSQL.'
                        : 'مدیریت و کنترل سرویس‌های هاست: پایش لحظه‌ای، استارت/استاپ/ریستارت/ریلود و مشاهده لاگ‌های وب‌سرور، هسته API، موتور کاوش و دیتابیس.'}
                    </span>
                  </div>
                </div>
                {onNavigateToTab && (
                  <button
                    onClick={() => onNavigateToTab('settings-services')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 text-xs font-semibold transition shrink-0 cursor-pointer"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Host Services' : 'سرویس‌های هاست'}</span>
                  </button>
                )}
              </div>

              {/* Enterprise Backup & Disaster Recovery Portal */}
              <div className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-white/5'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center text-xs font-bold shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                  <div className="text-xs">
                    <span className="font-bold text-cyan-400">{isEn ? 'Disaster Recovery: ' : 'پشتیبان‌گیری و بازیابی: '}</span>
                    <span className={isLightMode ? 'text-slate-700' : 'text-slate-300'}>
                      {isEn
                        ? 'Enterprise Backup & Disaster Recovery Portal: Export signed packages, 1-Click Restore, automated cron schedules, and safety rollback.'
                        : 'پورتال جامع بازیابی از بحران (DR): استخراج پکیج‌های معتبر، بازیابی ۱-کلیک، زمانبندی خودکار پشتیبان‌گیری و نقطه بازگشت امن.'}
                    </span>
                  </div>
                </div>
                {onNavigateToTab && (
                  <button
                    onClick={() => onNavigateToTab('settings-backup')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-semibold transition shrink-0 cursor-pointer"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Open Backup Portal' : 'پورتال بکاپ و بازیابی'}</span>
                  </button>
                )}
              </div>

              {/* Outgoing Mail (SMTP) Gateway */}
              <div className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-white/5'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                  <div className="text-xs">
                    <span className="font-bold text-indigo-400">{isEn ? 'Outgoing Mail: ' : 'ارسال ایمیل (SMTP): '}</span>
                    <span className={isLightMode ? 'text-slate-700' : 'text-slate-300'}>
                      {isEn
                        ? 'Outgoing Mail (SMTP) Gateway: Configure system sender credentials and perform live delivery diagnostics.'
                        : 'سامانه ارسال ایمیل (SMTP): معرفی نام کاربری، کلمه عبور و تست ارتباط زنده جهت ارسال هشدارهای شبکه.'}
                    </span>
                  </div>
                </div>
                {onNavigateToTab && (
                  <button
                    onClick={() => onNavigateToTab('settings-email')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 text-xs font-semibold transition shrink-0 cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Open Email Settings' : 'تنظیمات ارسال ایمیل'}</span>
                  </button>
                )}
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

      {/* Modal: Manual Server Time Adjustment (Compliant with Universal Modal Standards) */}
      {showManualTimeModal && !isManualModalMinimized && createPortal(
        <div className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div
            className={`flex flex-col rounded-2xl border shadow-2xl transition-all duration-200 overflow-hidden ${
              isManualModalMaximized ? 'w-full h-full rounded-none' : 'w-full max-w-lg'
            } ${
              isLightMode
                ? 'bg-white border-slate-200 text-slate-900 shadow-slate-300/60'
                : 'bg-slate-950 border-cyan-500/30 text-slate-100 shadow-black/80'
            }`}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold">
                    {isEn ? 'Manual Server Clock Calibration' : 'تنظیم و کالیبراسیون دستی ساعت سرور'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isEn ? 'Adjust host operating system date and time directly' : 'تنظیم مستقیم تاریخ و زمان سیستم‌عامل سرور میزبان'}
                  </p>
                </div>
              </div>

              {/* Header 3 Control Buttons: Close, Minimize, Fullscreen */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsManualModalMinimized(true)}
                  title={isEn ? 'Minimize' : 'کوچک‌سازی'}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsManualModalMaximized(!isManualModalMaximized)}
                  title={isManualModalMaximized ? (isEn ? 'Restore' : 'خروج از تمام‌صفحه') : (isEn ? 'Maximize' : 'تمام‌صفحه')}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  {isManualModalMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualTimeModal(false)}
                  title={isEn ? 'Close' : 'بستن'}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveManualTime} className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="p-3.5 rounded-xl border border-cyan-500/20 bg-cyan-950/20 text-xs text-cyan-300 leading-relaxed">
                {isEn
                  ? 'Warning: Adjusting system time manually disables NTP temporarily. Timestamps will reflect the newly configured date and time for all subsequent logs and audit records.'
                  : 'توجه: با تغییر دستی ساعت سرور، همگام‌سازی خودکار NTP به حالت دستی تغییر می‌یابد و تمامی لاگ‌ها و رکوردهای بعدی با ساعت جدید ثبت خواهند شد.'}
              </div>

              {/* Date Input */}
              <div className="space-y-1.5">
                <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                  <span>{isEn ? 'Target Date (YYYY-MM-DD)' : 'تاریخ مورد نظر (میلادی)'}</span>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    title={isEn ? 'Target Date' : 'تاریخ سرور'}
                    infoWhatEn="The calendar date to assign to the host server system clock."
                    infoWhatFa="تاریخ تقویمی که به ساعت سیستم سرور میزبان اختصاص می‌یابد."
                    infoWhyEn="Allows correcting inaccurate system dates in isolated datacenters."
                    infoWhyFa="جهت اصلاح تاریخ اشتباه در دیتاسنترهای ایزوله و بدون دسترسی به اینترنت."
                    infoExampleEn="2026-10-09"
                    infoExampleFa="2026-10-09"
                  />
                </label>
                <input
                  type="date"
                  value={manualDateInput}
                  onChange={(e) => setManualDateInput(e.target.value)}
                  required
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm border transition focus:outline-none focus:border-cyan-500 font-mono ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-900'
                      : 'bg-slate-900 border-white/10 text-white'
                  }`}
                />
              </div>

              {/* Time Input */}
              <div className="space-y-1.5">
                <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                  <span>{isEn ? 'Target Time (HH:MM:SS)' : 'ساعت مورد نظر (ساعت:دقیقه:ثانیه)'}</span>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    title={isEn ? 'Target Time' : 'ساعت سرور'}
                    infoWhatEn="The exact hour, minute, and second to calibrate the server clock."
                    infoWhatFa="ساعت، دقیقه و ثانیه دقیق جهت کالیبره کردن ساعت سرور."
                    infoWhyEn="Synchronizes time with authorized physical wall clocks or internal master generators."
                    infoWhyFa="انطباق با ساعت مرجع فیزیکی یا ژنراتورهای ساعت داخلی در سایت‌های صنعتی."
                    infoExampleEn="14:30:00"
                    infoExampleFa="14:30:00"
                  />
                </label>
                <input
                  type="time"
                  step="1"
                  value={manualTimeInput}
                  onChange={(e) => setManualTimeInput(e.target.value)}
                  required
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm border transition focus:outline-none focus:border-cyan-500 font-mono ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-900'
                      : 'bg-slate-900 border-white/10 text-white'
                  }`}
                />
              </div>

              {/* Active Timezone Notice */}
              <div className="flex items-center justify-between text-xs text-slate-400 p-2.5 rounded-xl bg-slate-900/50 border border-white/5">
                <span>{isEn ? 'Applied Timezone:' : 'منطقه زمانی اعمال‌شونده:'}</span>
                <span className="font-mono text-cyan-300 font-semibold">
                  {serverTimeInfo?.timezone || formData.serverTimezone || 'Asia/Tehran'}
                </span>
              </div>

              {/* Modal Footer Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowManualTimeModal(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    isLightMode
                      ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                      : 'border-white/10 text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>

                <button
                  type="submit"
                  disabled={isSettingManualTime}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/20 transition cursor-pointer disabled:opacity-50"
                >
                  {isSettingManualTime ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{isEn ? 'Applying...' : 'در حال اعمال...'}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Apply to Host Server' : 'اعمال در سرور میزبان'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
