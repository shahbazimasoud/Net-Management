import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../i18n';
import { useAuth, AuthUser } from '../../context/AuthContext';
import { NetworkGlobe3D, GlobeThemeType } from './NetworkGlobe3D';
import { APP_VERSION } from '../../version';
import { loadGeneralSettings, syncGeneralSettingsFromDatabase } from '../../services/settingsStorage';
import { PanelGeneralSettings } from '../../types';
import {
  ShieldCheck,
  Server,
  User,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  LogIn,
  Globe,
  Database,
  Layers,
  Palette,
  Sun,
  Moon,
  Network,
  Router,
  Cpu,
  Mail,
  Clock,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  KeyRound,
} from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess?: (user: AuthUser) => void;
  currentTheme?: GlobeThemeType;
  onThemeChange?: (theme: GlobeThemeType) => void;
}

const THEME_OPTIONS: { id: GlobeThemeType; name: string; nameFa: string; color: string; isLight?: boolean }[] = [
  { id: 'obsidian', name: 'Obsidian Space', nameFa: 'فضایی آبسیدین', color: '#6366f1' },
  { id: 'emerald', name: 'Emerald Cyber', nameFa: 'زمردی سایبر', color: '#10b981' },
  { id: 'cobalt', name: 'Cobalt Blue', nameFa: 'کبالت پررنگ', color: '#0284c7' },
  { id: 'rose', name: 'Rose Red', nameFa: 'زرشکی نئون', color: '#f43f5e' },
  { id: 'amber', name: 'Amber Gold', nameFa: 'کهربایی طلایی', color: '#f59e0b' },
  { id: 'light', name: 'Clean Light', nameFa: 'تم روشن و شفاف', color: '#ffffff', isLight: true },
  { id: 'google-dark', name: 'Google Dark', nameFa: 'گوگل دارک', color: '#8ab4f8' },
];

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  currentTheme: propTheme,
  onThemeChange,
}) => {
  const { isEn, language, setLanguage, isRtl } = useLanguage();
  const { login } = useAuth();
  const [generalSettings, setGeneralSettings] = useState<PanelGeneralSettings>(() => loadGeneralSettings());

  // Local or propagated theme state (respect user preference if customized, fallback to system default)
  const [theme, setTheme] = useState<GlobeThemeType>(() => {
    if (propTheme) return propTheme;
    const userCustomized = localStorage.getItem('user_customized_theme') === 'true';
    const saved = localStorage.getItem('panel_theme') as GlobeThemeType;
    if (userCustomized && saved) return saved;
    const initialSettings = loadGeneralSettings();
    return (initialSettings?.defaultTheme as GlobeThemeType) || saved || 'obsidian';
  });

  const [showThemePicker, setShowThemePicker] = useState(false);

  const isLight = theme === 'light';

  // Apply theme to HTML documentElement
  const handleSelectTheme = (newTheme: GlobeThemeType, isUserAction: boolean = true) => {
    setTheme(newTheme);
    const isNewThemeLight = newTheme === 'light';
    localStorage.setItem('panel_theme', newTheme);
    localStorage.setItem('theme_mode', isNewThemeLight ? 'light' : 'dark');
    if (isUserAction) {
      localStorage.setItem('user_customized_theme', 'true');
    }

    if (typeof document !== 'undefined') {
      // Remove previous theme classes
      THEME_OPTIONS.forEach((t) => {
        document.documentElement.classList.remove(`theme-${t.id}`);
      });
      document.documentElement.classList.add(`theme-${newTheme}`);

      if (isNewThemeLight) {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }
    }

    if (onThemeChange) {
      onThemeChange(newTheme);
    }
    setShowThemePicker(false);
  };

  useEffect(() => {
    // Initial sync of theme on mount
    handleSelectTheme(theme, false);
    syncGeneralSettingsFromDatabase().then((synced) => {
      if (synced) {
        setGeneralSettings(synced);
        const userHasCustomTheme = localStorage.getItem('user_customized_theme') === 'true';
        if (synced.defaultTheme && !userHasCustomTheme) {
          handleSelectTheme(synced.defaultTheme as GlobeThemeType, false);
        }
        if (synced.allowedAuthMethods === 'ad_only') {
          setAuthType('ad');
        } else if (synced.allowedAuthMethods === 'local_only') {
          setAuthType('local');
        }
      }
    }).catch(() => {});
  }, []);

  const allowedAuth = generalSettings?.allowedAuthMethods || 'both';

  const [authType, setAuthType] = useState<'local' | 'ad'>(() => {
    const initial = loadGeneralSettings();
    return initial?.allowedAuthMethods === 'ad_only' ? 'ad' : 'local';
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [domain, setDomain] = useState('corp.internal');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Sync authType if allowedAuth changes
  useEffect(() => {
    if (allowedAuth === 'ad_only') {
      setAuthType('ad');
    } else if (allowedAuth === 'local_only') {
      setAuthType('local');
    }
  }, [allowedAuth]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockedRemaining, setLockedRemaining] = useState<number | null>(null);

  // 2-Step Verification (2FA) State
  const [requires2FA, setRequires2FA] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [otpExpiresIn, setOtpExpiresIn] = useState<number>(300);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [resending, setResending] = useState(false);
  const [verifying2FA, setVerifying2FA] = useState(false);
  const [emailSentNotice, setEmailSentNotice] = useState<boolean>(true);
  const [emailErrorMessage, setEmailErrorMessage] = useState<string | null>(null);
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);

  // Countdown timers for 2FA OTP validity and Resend Cooldown
  useEffect(() => {
    if (!requires2FA) return;
    const interval = setInterval(() => {
      setOtpExpiresIn((prev) => (prev > 0 ? prev - 1 : 0));
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [requires2FA]);

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockedRemaining || lockedRemaining <= 0) return;
    const timer = setInterval(() => {
      setLockedRemaining((prev) => {
        if (!prev || prev <= 1) {
          setErrorMsg(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedRemaining]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg(isEn ? 'Please enter both username and password.' : 'لطفاً نام کاربری و کلمه عبور را وارد فرمایید.');
      return;
    }

    const hasDomainInUsername = username.includes('@') || username.includes('\\');
    let extractedDomain = '';
    if (username.includes('@')) {
      extractedDomain = username.split('@')[1]?.trim() || '';
    } else if (username.includes('\\')) {
      extractedDomain = username.split('\\')[0]?.trim() || '';
    }

    const effectiveDomain = extractedDomain || domain.trim() || 'corp.internal';

    if (authType === 'ad' && !hasDomainInUsername && !domain.trim()) {
      setErrorMsg(
        isEn
          ? 'Please enter your domain name or include it in your username (e.g. user@domain.com).'
          : 'لطفاً نام دامین را وارد کنید یا در قالب user@domain.com در نام کاربری درج فرمایید.'
      );
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessFeedback(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': language,
        },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
          authType,
          domain: effectiveDomain,
          rememberMe,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      let data: any = null;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const textResponse = await res.text().catch(() => '');
        console.error('[Login non-JSON response]', res.status, textResponse.slice(0, 150));
        throw new Error(
          isEn
            ? `Authentication server returned status ${res.status} (${res.statusText || 'Service Gateway Error'}). Please verify backend connection.`
            : `سرویس احراز هویت وضعیت نامعتبر ${res.status} برگرداند. لطفاً اتصال به سرور پایگاه داده را بررسی فرمایید.`
        );
      }

      if (res.ok && data.success) {
        if (data.requires2FA) {
          // Intercept and launch Two-Step Verification challenge
          setRequires2FA(true);
          setChallengeToken(data.challengeToken);
          setMaskedEmail(data.emailMasked || '');
          setOtpExpiresIn(data.expiresIn || 300);
          setResendCooldown(45);
          setEmailSentNotice(data.emailSent !== false);
          setEmailErrorMessage(data.emailError || null);
          setOtpCode('');
          setErrorMsg(null);
          setSuccessFeedback(
            isEn
              ? (data.message_en || data.message || 'Two-Step Verification code dispatched to your email.')
              : (data.message || 'کد تایید دو مرحله‌ای به آدرس ایمیل شما ارسال شد.')
          );
          return;
        }

        login(data.token, data.user, rememberMe, data.effectivePolicy);
        if (onLoginSuccess) {
          onLoginSuccess(data.user);
        }
      } else {
        if (data.locked && data.remainingSec) {
          setLockedRemaining(data.remainingSec);
          setErrorMsg(
            isEn
              ? `Security Lockout: Account locked for ${data.remainingSec}s due to multiple failed attempts.`
              : `قفل امنیتی: به دلیل تلاش‌های مکرر، ورود تا ${data.remainingSec} ثانیه دیگر مسدود شد.`
          );
        } else {
          setErrorMsg(
            isEn
              ? data.error || 'Authentication failed. Please check credentials.'
              : data.message || 'نام کاربری یا کلمه عبور نادرست است.'
          );
          if (data.attemptsLeft !== undefined) {
            setAttemptsLeft(data.attemptsLeft);
          }
        }
      }
    } catch (err: any) {
      setErrorMsg(
        isEn
          ? `Authentication error: ${err.message || 'Service temporarily unavailable'}`
          : `خطای احراز هویت: ${err.message || 'سرویس در دسترس نیست'}`
      );
    } finally {
      setLoading(false);
    }
  };

  // Submit and verify 2FA OTP code
  const triggerVerify2FA = async (codeToVerify: string) => {
    if (!challengeToken || !codeToVerify.trim()) return;
    setVerifying2FA(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': language,
        },
        body: JSON.stringify({
          challengeToken,
          code: codeToVerify.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        login(data.token, data.user, rememberMe, data.effectivePolicy);
        if (onLoginSuccess) {
          onLoginSuccess(data.user);
        }
      } else {
        setErrorMsg(
          isEn
            ? (data.error || 'Invalid verification code. Please check your email.')
            : (data.message || 'کد تایید وارد شده نامعتبر است.')
        );
        if (data.attemptsLeft !== undefined) {
          setAttemptsLeft(data.attemptsLeft);
        }
        if (data.locked) {
          // If locked or max attempts exceeded, reset back to login
          setTimeout(() => {
            setRequires2FA(false);
            setChallengeToken(null);
          }, 3500);
        }
      }
    } catch (err: any) {
      setErrorMsg(
        isEn
          ? `Verification error: ${err.message || 'Network error'}`
          : `خطا در اعتبارسنجی کد: ${err.message || 'خطای شبکه'}`
      );
    } finally {
      setVerifying2FA(false);
    }
  };

  const handleVerify2FASubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      setErrorMsg(
        isEn
          ? 'Please enter the complete 6-digit verification code.'
          : 'لطفاً کد تایید ۶ رقمی را به طور کامل وارد نمایید.'
      );
      return;
    }
    triggerVerify2FA(otpCode.trim());
  };

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numeric = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtpCode(numeric);
    setErrorMsg(null);
    if (numeric.length === 6) {
      triggerVerify2FA(numeric);
    }
  };

  const handleResend2FA = async () => {
    if (!challengeToken || resendCooldown > 0 || resending) return;
    setResending(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/resend-2fa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': language,
        },
        body: JSON.stringify({ challengeToken }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setOtpExpiresIn(data.expiresIn || 300);
        setResendCooldown(45);
        if (data.emailMasked) setMaskedEmail(data.emailMasked);
        setSuccessFeedback(
          isEn
            ? (data.message_en || data.message || 'Fresh verification code dispatched to your email.')
            : (data.message || 'کد تایید جدید به ایمیل شما ارسال شد.')
        );
      } else {
        setErrorMsg(
          isEn
            ? (data.error || 'Failed to resend verification code.')
            : (data.message || 'خطا در ارسال مجدد کد تایید.')
        );
      }
    } catch (err: any) {
      setErrorMsg(
        isEn
          ? `Failed to resend code: ${err.message}`
          : `خطا در ارسال مجدد کد: ${err.message}`
      );
    } finally {
      setResending(false);
    }
  };

  const handleCancel2FA = () => {
    setRequires2FA(false);
    setChallengeToken(null);
    setOtpCode('');
    setErrorMsg(null);
    setSuccessFeedback(null);
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={`w-screen h-screen flex flex-col md:flex-row overflow-hidden transition-colors duration-500 font-sans ${
        isLight ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-slate-100'
      } ${isRtl ? 'rtl' : 'ltr'}`}
    >
      {/* ------------------------------------------------------------- */}
      {/* LEFT 1/4 (25-30%): Modern Security Login Card */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`w-full md:w-[380px] lg:w-[420px] xl:w-[440px] shrink-0 h-full flex flex-col justify-between p-6 sm:p-8 z-30 shadow-2xl backdrop-blur-2xl overflow-y-auto transition-colors duration-500 ${
          isLight
            ? 'bg-white/95 border-r border-slate-200/80 text-slate-800'
            : 'bg-slate-900/95 border-r border-white/10 text-slate-100'
        }`}
      >
        {/* Top Header: Brand, Language Toggle, and Theme Menu */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-6">
            <div className="flex items-center gap-3">
              {generalSettings.logoType === 'custom_url' && generalSettings.logoCustomUrl ? (
                <img
                  src={generalSettings.logoCustomUrl}
                  alt="Logo"
                  className="w-9 h-9 min-w-9 min-h-9 max-w-9 max-h-9 rounded-xl object-contain shadow-[0_0_15px_rgba(99,102,241,0.5)] border border-white/20 p-0.5 bg-black/40 shrink-0"
                />
              ) : generalSettings.logoType === 'preset' ? (
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(99,102,241,0.5)] text-xs border border-white/20 shrink-0">
                  {generalSettings.logoPreset === 'shield' ? (
                    <ShieldCheck className="w-5 h-5 text-white" />
                  ) : generalSettings.logoPreset === 'server' ? (
                    <Server className="w-5 h-5 text-white" />
                  ) : generalSettings.logoPreset === 'router' ? (
                    <Router className="w-5 h-5 text-white" />
                  ) : generalSettings.logoPreset === 'cpu' ? (
                    <Cpu className="w-5 h-5 text-white" />
                  ) : generalSettings.logoPreset === 'globe' ? (
                    <Globe className="w-5 h-5 text-white" />
                  ) : (
                    <Network className="w-5 h-5 text-white" />
                  )}
                </div>
              ) : (
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(99,102,241,0.5)] text-xs font-mono border border-white/20">
                  NT
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-bold text-base tracking-tight font-mono ${
                      isLight ? 'text-slate-900' : 'text-white'
                    }`}
                  >
                    {generalSettings.panelTitle || 'NetTopology'}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                      isLight
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold'
                        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                    }`}
                  >
                    v{APP_VERSION}
                  </span>
                </div>
                <p className={`text-[10px] font-sans ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {generalSettings.panelSubtitle || (isEn ? 'Enterprise Operations Center' : 'مرکز عملیات و امنیت شبکه')}
                </p>
              </div>
            </div>

            {/* Language & Theme Controls */}
            <div className="flex items-center gap-1.5 relative">
              {/* Theme Switcher Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowThemePicker(!showThemePicker)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition cursor-pointer ${
                    isLight
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                  }`}
                  title={isEn ? 'Change Panel Theme' : 'تغییر تم پنل'}
                >
                  {isLight ? (
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                  ) : (
                    <Palette className="w-3.5 h-3.5 text-indigo-400" />
                  )}
                  <span className="hidden sm:inline font-mono text-[10px] uppercase font-bold">
                    {theme}
                  </span>
                </button>

                {/* Theme Selector Dropdown Popover */}
                {showThemePicker && (
                  <div
                    className={`absolute ${
                      isRtl ? 'left-0' : 'right-0'
                    } top-full mt-2 w-48 p-2 rounded-xl shadow-2xl border z-50 animate-in fade-in zoom-in-95 duration-150 ${
                      isLight
                        ? 'bg-white border-slate-200 text-slate-800'
                        : 'bg-slate-900 border-slate-700 text-slate-100'
                    }`}
                  >
                    <div
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-1 mb-1 border-b ${
                        isLight
                          ? 'text-slate-500 border-slate-100'
                          : 'text-slate-400 border-slate-800'
                      }`}
                    >
                      {isEn ? 'Panel Themes' : 'تم‌های نرم‌افزار'}
                    </div>
                    <div className="space-y-1">
                      {THEME_OPTIONS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectTheme(item.id)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                            theme === item.id
                              ? isLight
                                ? 'bg-indigo-50 text-indigo-700 font-bold'
                                : 'bg-indigo-600/30 text-cyan-300 font-bold'
                              : isLight
                              ? 'hover:bg-slate-100 text-slate-700'
                              : 'hover:bg-white/5 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full border border-black/20 shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <span>{isEn ? item.name : item.nameFa}</span>
                          </div>
                          {item.isLight ? (
                            <Sun className="w-3 h-3 text-amber-500" />
                          ) : (
                            <Moon className="w-3 h-3 text-indigo-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Language Switcher */}
              <button
                type="button"
                onClick={() => setLanguage(language === 'en' ? 'fa' : 'en')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition cursor-pointer ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                }`}
                title={isEn ? 'Switch Language' : 'تغییر زبان'}
              >
                <Globe className="w-3.5 h-3.5 text-cyan-500" />
                <span className="font-mono text-[11px] font-semibold uppercase">
                  {language === 'en' ? 'FA' : 'EN'}
                </span>
              </button>
            </div>
          </div>

          {requires2FA ? (
            /* ----------------------------------------------------------- */
            /* TWO-STEP VERIFICATION (2FA) INTERFACE                       */
            /* ----------------------------------------------------------- */
            <div className="space-y-5 animate-in fade-in duration-300">
              {/* Form Title & Badge */}
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 mb-2.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{isEn ? '2-STEP VERIFICATION' : 'احراز هویت دو مرحله‌ای'}</span>
                </div>
                <h2
                  className={`text-xl font-bold mb-1 tracking-tight ${
                    isLight ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {isEn ? 'Security Code Required' : 'کد تایید امنیتی را وارد کنید'}
                </h2>
                <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  {isEn
                    ? 'A 6-digit one-time passcode was dispatched to your registered email. Enter it below to complete sign-in.'
                    : 'کد تایید ۶ رقمی یک‌بار مصرف به آدرس ایمیل شما ارسال شد. جهت تکمیل ورود آن را وارد فرمایید.'}
                </p>
              </div>

              {/* Masked Email Badge */}
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                  isLight
                    ? 'bg-slate-50 border-slate-300'
                    : 'bg-slate-950/70 border-white/10'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-mono block text-slate-400">
                      {isEn ? 'Dispatched to:' : 'ارسال به آدرس ایمیل:'}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-200 truncate block">
                      {maskedEmail}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold shrink-0">
                  OTP Active
                </span>
              </div>

              {/* SMTP Warning Notice if mail sending had issue */}
              {!emailSentNotice && (
                <div className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                  isLight
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-amber-950/50 border-amber-500/40 text-amber-200'
                }`}>
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <p className="font-semibold">{isEn ? 'Notice on Email Delivery' : 'توجه در خصوص تحویل ایمیل'}</p>
                    <p className="text-[11px] mt-0.5">
                      {isEn
                        ? (emailErrorMessage || 'Outgoing mail server had an issue. The security code has also been logged to server terminal for administrative access.')
                        : 'ارسال به سرور ایمیل با هشدار مواجه شد. در صورت عدم دریافت ایمیل، کد تایید در ترمینال سرور نیز با برچسب امنیتی ثبت شده است.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Success Feedback Alert */}
              {successFeedback && (
                <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs ${
                  isLight
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                }`}>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{successFeedback}</span>
                </div>
              )}

              {/* Error Alert */}
              {errorMsg && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                    isLight
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium leading-relaxed">{errorMsg}</p>
                    {attemptsLeft !== null && attemptsLeft > 0 && (
                      <p className="text-[10px] mt-1 font-mono text-rose-300">
                        {isEn
                          ? `Verification attempts remaining: ${attemptsLeft}`
                          : `فرصت‌های باقی‌مانده برای ورود کد: ${attemptsLeft}`}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 2FA Form */}
              <form onSubmit={handleVerify2FASubmit} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label
                      className={`block text-[11px] font-semibold uppercase tracking-wider font-mono ${
                        isLight ? 'text-slate-700' : 'text-slate-300'
                      }`}
                    >
                      {isEn ? '6-Digit Verification Code' : 'کد تایید ۶ رقمی یک‌بار مصرف'}
                    </label>
                    <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatTimer(otpExpiresIn)}</span>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoFocus
                      value={otpCode}
                      onChange={handleOtpChange}
                      placeholder="••••••"
                      disabled={verifying2FA || otpExpiresIn <= 0}
                      className={`w-full py-3.5 px-4 text-center text-3xl font-mono font-bold tracking-[0.4em] rounded-xl border transition focus:outline-none ${
                        isLight
                          ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-600/20'
                          : 'bg-slate-950/80 border-indigo-500/40 text-cyan-300 placeholder-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30'
                      }`}
                    />
                  </div>
                  {otpExpiresIn <= 0 && (
                    <p className="text-[11px] text-rose-400 font-mono mt-1 text-center">
                      {isEn ? 'Code has expired. Please click Resend Code.' : 'کد تایید منقضی شده است. لطفاً گزینه ارسال مجدد را بزنید.'}
                    </p>
                  )}
                </div>

                {/* Verify Submit Button */}
                <button
                  type="submit"
                  disabled={verifying2FA || otpCode.trim().length !== 6 || otpExpiresIn <= 0}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-xs shadow-[0_0_20px_rgba(99,102,241,0.4)] transition active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  {verifying2FA ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  <span>
                    {verifying2FA
                      ? isEn
                        ? 'Verifying Code...'
                        : 'در حال اعتبارسنجی کد...'
                      : isEn
                      ? 'Verify & Enter Panel'
                      : 'تایید کد و ورود به پنل'}
                  </span>
                </button>

                {/* Resend & Cancel / Back actions */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleResend2FA}
                    disabled={resendCooldown > 0 || resending}
                    className={`flex items-center gap-1.5 text-xs font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      isLight
                        ? 'text-indigo-600 hover:text-indigo-800'
                        : 'text-indigo-400 hover:text-indigo-300'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
                    <span>
                      {resending
                        ? isEn
                          ? 'Sending...'
                          : 'در حال ارسال...'
                        : resendCooldown > 0
                        ? isEn
                          ? `Resend Code (${resendCooldown}s)`
                          : `ارسال مجدد (${resendCooldown} ثانیه)`
                        : isEn
                        ? 'Resend Code'
                        : 'ارسال مجدد کد'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCancel2FA}
                    className={`flex items-center gap-1 text-xs transition cursor-pointer ${
                      isLight
                        ? 'text-slate-500 hover:text-slate-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isRtl ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                    <span>{isEn ? 'Change Account' : 'تغییر نام کاربری'}</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* ----------------------------------------------------------- */
            /* STANDARD CREDENTIALS LOGIN INTERFACE                       */
            /* ----------------------------------------------------------- */
            <div>
              {/* Form Title */}
              <div className="mb-6">
                <h2
                  className={`text-xl font-bold mb-1 tracking-tight ${
                    isLight ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {isEn ? 'System Authentication' : 'احراز هویت و ورود به سامانه'}
                </h2>
                <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  {allowedAuth === 'local_only'
                    ? isEn
                      ? 'Sign in with your local administrator credentials.'
                      : 'با حساب محلی مدیر سیستم وارد شوید.'
                    : allowedAuth === 'ad_only'
                    ? isEn
                      ? 'Sign in with your corporate Active Directory domain account.'
                      : 'با حساب سازمانی اکتیو دایرکتوری وارد شوید.'
                    : isEn
                    ? 'Sign in with your local administrator credentials or Active Directory domain account.'
                    : 'با حساب محلی مدیر سیستم یا حساب سازمانی اکتیو دایرکتوری وارد شوید.'}
                </p>
              </div>

              {/* Segmented Auth Mode Switcher */}
              {allowedAuth === 'both' ? (
                <div
                  className={`p-1 rounded-xl border flex items-center mb-5 ${
                    isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950/80 border-white/10'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setAuthType('local');
                      setErrorMsg(null);
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      authType === 'local'
                        ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md'
                        : isLight
                        ? 'text-slate-600 hover:text-slate-900'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{isEn ? 'Local Account' : 'حساب محلی'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAuthType('ad');
                      setErrorMsg(null);
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      authType === 'ad'
                        ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md'
                        : isLight
                        ? 'text-slate-600 hover:text-slate-900'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Server className="w-4 h-4" />
                    <span>{isEn ? 'Active Directory' : 'اکتیو دایرکتوری'}</span>
                  </button>
                </div>
              ) : allowedAuth === 'ad_only' ? (
                <div
                  className={`p-2.5 rounded-xl border flex items-center justify-between mb-5 ${
                    isLight ? 'bg-cyan-50 border-cyan-200' : 'bg-cyan-950/40 border-cyan-500/20'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                    <Server className="w-4 h-4" />
                    <span>{isEn ? 'Active Directory Domain Authentication' : 'احراز هویت دامین اکتیو دایرکتوری'}</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
                    {isEn ? 'AD Mode' : 'حالت دامین'}
                  </span>
                </div>
              ) : (
                <div
                  className={`p-2.5 rounded-xl border flex items-center justify-between mb-5 ${
                    isLight ? 'bg-indigo-50 border-indigo-200' : 'bg-indigo-950/40 border-indigo-500/20'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    <ShieldCheck className="w-4 h-4" />
                    <span>{isEn ? 'Local Account Authentication' : 'احراز هویت با حساب محلی'}</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                    {isEn ? 'Local Mode' : 'حالت محلی'}
                  </span>
                </div>
              )}

              {/* Alert / Error Banner */}
              {errorMsg && (
                <div
                  className={`p-3 rounded-xl mb-4 border text-xs flex items-start gap-2.5 ${
                    lockedRemaining
                      ? 'bg-rose-950/60 border-rose-500/50 text-rose-200 animate-pulse'
                      : isLight
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-amber-950/50 border-amber-500/40 text-amber-200'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium leading-relaxed">{errorMsg}</p>
                    {attemptsLeft !== null && attemptsLeft > 0 && !lockedRemaining && (
                      <p
                        className={`text-[10px] mt-1 font-mono ${
                          isLight ? 'text-amber-800' : 'text-amber-300/80'
                        }`}
                      >
                        {isEn
                          ? `Attempts remaining before security lockout: ${attemptsLeft}`
                          : `تعداد تلاش‌های مجاز باقی‌مانده تا قفل سیستم: ${attemptsLeft}`}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Username / UPN Input */}
                <div>
                  <label
                    className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 font-mono ${
                      isLight ? 'text-slate-700' : 'text-slate-300'
                    }`}
                  >
                    {authType === 'local'
                      ? isEn
                        ? 'Username'
                        : 'نام کاربری'
                      : isEn
                      ? 'UPN / Domain Username'
                      : 'نام کاربری دامین (UPN)'}
                  </label>
                  <div className="relative flex items-center">
                    <div className="absolute left-3 pointer-events-none text-slate-400">
                      <User className="w-4 h-4 text-indigo-500" />
                    </div>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={authType === 'local' ? 'admin' : (isEn ? 'user@domain.com or username' : 'user@domain.com یا نام کاربری')}
                      className={`w-full rounded-xl py-2.5 pl-10 pr-3 text-xs transition font-mono focus:outline-none ${
                        isLight
                          ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:bg-white focus:ring-1 focus:ring-indigo-600'
                          : 'bg-slate-950/60 border border-white/10 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                      }`}
                      autoComplete="username"
                      required
                    />
                  </div>

                  {/* In AD mode: Show auto-detected domain confirmation when @ or \ is used */}
                  {authType === 'ad' && (username.includes('@') || username.includes('\\')) && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono mt-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {isEn
                          ? `Domain extracted: ${
                              username.includes('@')
                                ? username.split('@')[1]?.trim() || ''
                                : username.split('\\')[0]?.trim() || ''
                            } (No separate domain entry required)`
                          : `دامین از نام کاربری استخراج شد: ${
                              username.includes('@')
                                ? username.split('@')[1]?.trim() || ''
                                : username.split('\\')[0]?.trim() || ''
                            } (نیازی به ورود مجدد دامنه نیست)`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Active Directory Domain Selector (Only shown if username does NOT include domain) */}
                {authType === 'ad' && !username.includes('@') && !username.includes('\\') && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        className={`block text-[11px] font-semibold uppercase tracking-wider font-mono ${
                          isLight ? 'text-slate-700' : 'text-slate-300'
                        }`}
                      >
                        {isEn ? 'Domain Name / Kerberos Realm' : 'نام دامین / اکتیو دایرکتوری'}
                      </label>
                      <span className={`text-[10px] font-mono ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                        {isEn ? '(Required without @domain in username)' : '(الزامی در صورت عدم درج دامین در نام کاربری)'}
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <div className="absolute left-3 pointer-events-none text-slate-400">
                        <Layers className="w-4 h-4 text-cyan-500" />
                      </div>
                      <input
                        type="text"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        placeholder="corp.internal"
                        className={`w-full rounded-xl py-2.5 pl-10 pr-3 text-xs transition font-mono focus:outline-none ${
                          isLight
                            ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:bg-white focus:ring-1 focus:ring-indigo-600'
                            : 'bg-slate-950/60 border border-white/10 text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'
                        }`}
                        required
                      />
                    </div>
                  </div>
                )}

                {/* Password Input */}
                <div>
                  <label
                    className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 font-mono ${
                      isLight ? 'text-slate-700' : 'text-slate-300'
                    }`}
                  >
                    {isEn ? 'Password' : 'رمز عبور'}
                  </label>
                  <div className="relative flex items-center">
                    <div className="absolute left-3 pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4 text-indigo-500" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className={`w-full rounded-xl py-2.5 pl-10 pr-10 text-xs transition font-mono focus:outline-none ${
                        isLight
                          ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:bg-white focus:ring-1 focus:ring-indigo-600'
                          : 'bg-slate-950/60 border border-white/10 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                      }`}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={`absolute right-3 transition cursor-pointer ${
                        isLight
                          ? 'text-slate-400 hover:text-slate-700'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me Option */}
                <div className="flex items-center justify-between pt-1">
                  <label
                    className={`flex items-center gap-2 text-xs cursor-pointer select-none ${
                      isLight ? 'text-slate-700' : 'text-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className={`rounded h-4 w-4 cursor-pointer ${
                        isLight
                          ? 'border-slate-300 text-indigo-600 focus:ring-indigo-500'
                          : 'border-white/20 bg-slate-950 text-indigo-600 focus:ring-indigo-500'
                      }`}
                    />
                    <span>{isEn ? 'Remember session on this device' : 'مرا به خاطر بسپار (نشست امن)'}</span>
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading || (lockedRemaining !== null && lockedRemaining > 0)}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-xs shadow-[0_0_20px_rgba(99,102,241,0.4)] transition active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  <span>
                    {loading
                      ? isEn
                        ? 'Authenticating...'
                        : 'در حال اعتبارسنجی...'
                      : isEn
                      ? 'Authenticate & Enter'
                      : 'احراز هویت و ورود به سامانه'}
                  </span>
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer Security Badges */}
        <div
          className={`pt-6 border-t flex items-center justify-between text-[10px] font-mono ${
            isLight ? 'border-slate-200 text-slate-500' : 'border-white/10 text-slate-500'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-cyan-600" />
            <span>PostgreSQL Secured</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>TLS 1.3 Strict</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* RIGHT 3/4 (70-75%): Interactive 3D Network Globe Animation */}
      {/* ------------------------------------------------------------- */}
      <div className="flex-1 h-full relative overflow-hidden hidden md:block">
        <NetworkGlobe3D theme={theme} />
      </div>
    </div>
  );
};
