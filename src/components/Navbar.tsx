import React, { useState, useRef, useEffect } from 'react';
import {
  RefreshCw,
  Zap,
  Palette,
  ChevronDown,
  Check,
  Globe,
  User,
  ShieldCheck,
  FileText,
  ArrowUpCircle,
  Sparkles,
  LogOut,
  Lock,
  Network,
  Router,
  Server,
  Cpu,
  Menu,
  X
} from 'lucide-react';
import { APP_VERSION } from '../version';
import { useLanguage } from '../i18n';
import { useUpdate } from '../context/UpdateContext';
import { useAuth } from '../context/AuthContext';
import { canUserCheckUpdate, isUserSuperAdmin } from '../utils/rbac';

export type ThemeType = 'obsidian' | 'emerald' | 'cobalt' | 'rose' | 'amber' | 'light' | 'google-dark';

interface NavbarProps {
  onRefreshAll: () => void;
  isRefreshing: boolean;
  onQuickScan: () => void;
  isScanning: boolean;
  onResetDemo?: () => void;
  onlineCount?: number;
  totalDevices?: number;
  panelTheme: ThemeType;
  onChangeTheme: (theme: ThemeType) => void;
  onResetThemeToDefault?: () => void;
  onOpenReleaseNotes?: () => void;
  onOpenSettings?: () => void;
  onOpenPasswordVault?: () => void;
  onOpenUpdateSettings?: () => void;
  customTitle?: string;
  customSubtitle?: string;
  logoType?: 'default' | 'preset' | 'custom_url';
  logoPreset?: string;
  logoCustomUrl?: string;
  isMobileMenuOpen?: boolean;
  onToggleMobileMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onRefreshAll,
  isRefreshing,
  onQuickScan,
  isScanning,
  panelTheme,
  onChangeTheme,
  onResetThemeToDefault,
  onOpenReleaseNotes,
  onOpenSettings,
  onOpenPasswordVault,
  onOpenUpdateSettings,
  customTitle,
  customSubtitle,
  logoType = 'default',
  logoPreset = 'network',
  logoCustomUrl,
  isMobileMenuOpen = false,
  onToggleMobileMenu,
}) => {
  const { t, language, setLanguage, resetToDefaultLanguage, isCustomizedByUser, isRtl, isEn } = useLanguage();
  const { updateInfo, checking, checkUpdate, checkFeedback, dismissFeedback } = useUpdate();
  const { user, logout, effectivePolicy } = useAuth();
  const isSuperAdmin = isUserSuperAdmin(user, effectivePolicy);
  const hasUpdate = Boolean(updateInfo?.hasUpdate);
  const canCheck = canUserCheckUpdate(user, effectivePolicy);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const isThemeCustomized = typeof window !== 'undefined' && localStorage.getItem('user_customized_theme') === 'true';
  const isLightMode = panelTheme === 'light';

  const displayName = user?.fullName || user?.username || (isEn ? 'Admin' : 'مدیر');
  const displayRole = user?.role || (isEn ? 'Super Administrator' : 'مدیر ارشد سیستم');
  const displayEmail = user?.email || 'admin@nettopology.internal';

  useEffect(() => {
    if (!profileOpen) return;
    const handleOutsideClick = (event: Event) => {
      const target = event.target as Node | null;
      if (profileRef.current && target && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleOutsideClick, true);
    window.addEventListener('mousedown', handleOutsideClick, true);
    window.addEventListener('touchstart', handleOutsideClick, true);
    return () => {
      window.removeEventListener('pointerdown', handleOutsideClick, true);
      window.removeEventListener('mousedown', handleOutsideClick, true);
      window.removeEventListener('touchstart', handleOutsideClick, true);
    };
  }, [profileOpen]);

  const themeOptions: { id: ThemeType; nameKey: string; color: string; bgClass: string; nameEn: string; nameFa: string }[] = [
    { id: 'obsidian', nameKey: 'theme_obsidian', color: '#6366f1', bgClass: 'bg-indigo-600', nameEn: 'Obsidian', nameFa: 'آبسیدین' },
    { id: 'emerald', nameKey: 'theme_emerald', color: '#10b981', bgClass: 'bg-emerald-500', nameEn: 'Emerald', nameFa: 'زمردی' },
    { id: 'cobalt', nameKey: 'theme_cobalt', color: '#0284c7', bgClass: 'bg-sky-600', nameEn: 'Cobalt', nameFa: 'کبالت' },
    { id: 'rose', nameKey: 'theme_rose', color: '#f43f5e', bgClass: 'bg-rose-500', nameEn: 'Rose', nameFa: 'رز سرخ' },
    { id: 'amber', nameKey: 'theme_amber', color: '#f59e0b', bgClass: 'bg-amber-500', nameEn: 'Amber', nameFa: 'کهربایی' },
    { id: 'light', nameKey: 'theme_light', color: '#64748b', bgClass: 'bg-slate-400', nameEn: 'Light', nameFa: 'روشن' },
    { id: 'google-dark', nameKey: 'theme_google_dark', color: '#8ab4f8', bgClass: 'bg-blue-400', nameEn: 'Google Dark', nameFa: 'گوگل دارک' },
  ];

  const currentThemeObj = themeOptions.find((t) => t.id === panelTheme) || themeOptions[0];

  const getTitleInitials = (title?: string): string => {
    if (!title || !title.trim()) return 'NT';
    const clean = title.trim();
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0].slice(0, 1) + words[1].slice(0, 1)).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  };

  const activeTitle = customTitle || t('app_title');
  const dynamicInitials = getTitleInitials(activeTitle);

  return (
    <header className={`h-14 spatial-glass flex items-center justify-between px-2.5 sm:px-4 lg:px-6 gap-2 shrink-0 border-b sticky top-0 z-50 backdrop-blur-xl ${
      isLightMode
        ? 'text-slate-900 border-slate-200 shadow-sm'
        : 'text-white border-white/10 shadow-xl'
    }`}>
      {/* Brand & Identity + Mobile/Tablet Menu Toggle */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className={`lg:hidden p-1.5 sm:p-2 rounded-xl border transition active:scale-95 cursor-pointer shrink-0 ${
              isLightMode
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 hover:text-slate-900'
                : 'bg-white/5 hover:bg-white/15 border-white/15 text-slate-200 hover:text-white'
            }`}
            title={isMobileMenuOpen ? (isEn ? 'Close navigation menu' : 'بستن منوی دسترسی') : (isEn ? 'Open navigation menu' : 'باز کردن منوی دسترسی')}
            aria-label={isMobileMenuOpen ? (isEn ? 'Close navigation menu' : 'بستن منوی دسترسی') : (isEn ? 'Open navigation menu' : 'باز کردن منوی دسترسی')}
            aria-expanded={Boolean(isMobileMenuOpen)}
            id="navbar-mobile-menu-btn"
          >
            {isMobileMenuOpen ? (
              <X className={`w-4 h-4 ${isLightMode ? 'text-indigo-600' : 'text-cyan-400'}`} />
            ) : (
              <Menu className={`w-4 h-4 ${isLightMode ? 'text-indigo-600' : 'text-cyan-400'}`} />
            )}
          </button>
        )}

        {logoType === 'custom_url' && logoCustomUrl ? (
          <img
            src={logoCustomUrl}
            alt="Logo"
            className="w-8 h-8 min-w-8 min-h-8 max-w-8 max-h-8 rounded-xl object-contain shadow-[0_0_15px_rgba(99,102,241,0.5)] border border-white/20 p-0.5 bg-black/40 shrink-0"
          />
        ) : logoType === 'preset' ? (
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(99,102,241,0.5)] text-xs border border-white/20 shrink-0">
            {logoPreset === 'shield' ? (
              <ShieldCheck className="w-4 h-4 text-white" />
            ) : logoPreset === 'server' ? (
              <Server className="w-4 h-4 text-white" />
            ) : logoPreset === 'router' ? (
              <Router className="w-4 h-4 text-white" />
            ) : logoPreset === 'cpu' ? (
              <Cpu className="w-4 h-4 text-white" />
            ) : logoPreset === 'globe' ? (
              <Globe className="w-4 h-4 text-white" />
            ) : (
              <Network className="w-4 h-4 text-white" />
            )}
          </div>
        ) : (
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(99,102,241,0.5)] text-xs font-mono pulse-glow-cyan border border-white/20 shrink-0">
            {dynamicInitials}
          </div>
        )}

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <h1 className="text-xs sm:text-base font-bold tracking-tight text-white font-mono glow-text-cyan flex items-center gap-1.5 min-w-0">
              <span className="truncate">{activeTitle}</span>
              {!customTitle && (
                <span className="hidden sm:inline-block text-indigo-400 text-[11px] font-semibold px-1.5 py-0.2 rounded bg-indigo-500/20 border border-indigo-500/30 shrink-0">
                  {t('app_edition')}
                </span>
              )}
            </h1>
          </div>
          <p className="text-[10px] text-slate-400 hidden md:block font-sans truncate max-w-[320px]">
            {customSubtitle || t('app_subtitle')}
          </p>
        </div>
      </div>

      {/* Clean Uncluttered Header Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* Quick CDP/LLDP Scan Button */}
        <button
          onClick={onQuickScan}
          disabled={isScanning}
          className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-medium text-xs shadow-[0_0_15px_rgba(99,102,241,0.35)] transition disabled:opacity-50 border border-white/10 active:scale-95 cursor-pointer"
          title={t('action_quick_scan_title')}
        >
          <Zap className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">
            {isScanning ? t('action_quick_scan_active') : t('action_quick_scan')}
          </span>
        </button>

        {/* Refresh / Ping Button */}
        <button
          onClick={onRefreshAll}
          disabled={isRefreshing}
          className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg border text-xs transition disabled:opacity-50 shadow-xs active:scale-95 cursor-pointer ${
            isLightMode
              ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
              : 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10'
          }`}
          title={t('action_live_ping_title')}
        >
          <RefreshCw className={`w-3.5 h-3.5 sm:w-3 sm:h-3 ${isRefreshing ? 'animate-spin text-indigo-500' : ''}`} />
          <span className="hidden lg:inline">{t('action_live_ping')}</span>
        </button>

        {/* Personal Password Vault Button */}
        {onOpenPasswordVault && (
          <button
            onClick={onOpenPasswordVault}
            className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg border font-medium text-xs shadow-xs transition active:scale-95 cursor-pointer ${
              isLightMode
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800 hover:text-cyan-700'
                : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200 hover:text-cyan-300'
            }`}
            title={isEn ? 'Personal Password Vault' : 'کیف امن گذرواژه‌ها (ولت)'}
            id="navbar-password-vault-btn"
          >
            <Lock className={`w-3.5 h-3.5 ${isLightMode ? 'text-cyan-600' : 'text-cyan-400'}`} />
            <span className="hidden md:inline">{isEn ? 'Vault' : 'ولت پسورد'}</span>
          </button>
        )}


        {/* Separator */}
        <div className={`hidden sm:block h-5 w-px ${isLightMode ? 'bg-slate-300' : 'bg-white/10'}`}></div>

        {/* Unified Profile & Preferences Button */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className={`flex items-center gap-2 p-1 sm:px-2.5 sm:py-1 rounded-xl border transition shadow-xs cursor-pointer active:scale-95 ${
              isLightMode
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
            }`}
            title={t('profile_menu_title')}
            id="profile-dropdown-btn"
          >
            {/* Avatar Circle with Status Dot or Pulsating Update Dot */}
            <div className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-cyan-500 text-white font-bold text-xs shadow-inner">
              <User className="w-4 h-4 text-white" />
              {hasUpdate ? (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 z-10" title={t('update_available_title')}>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-90"></span>
                  <span className={`relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500 border-2 shadow-[0_0_10px_rgba(244,63,94,1)] ${isLightMode ? 'border-white' : 'border-slate-950'}`}></span>
                </span>
              ) : (
                <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border shadow-[0_0_4px_rgba(52,211,153,0.9)] ${isLightMode ? 'border-white' : 'border-slate-900'}`}></span>
              )}
            </div>

            {/* Language & Theme Micro Indicators on Button */}
            <div className="hidden sm:flex flex-col text-left text-[10px] leading-tight max-w-[120px]">
              <span className={`font-bold text-[11px] flex items-center gap-1 truncate ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                {displayName}
                {hasUpdate ? (
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full border text-[9px] font-bold animate-pulse ${
                    isLightMode
                      ? 'bg-rose-100 border-rose-300 text-rose-700'
                      : 'bg-rose-500/25 border-rose-500/40 text-rose-300'
                  }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    <span>v{updateInfo?.latestVersion}</span>
                  </span>
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: currentThemeObj.color }}></span>
                )}
              </span>
              <span className={`font-mono text-[9px] uppercase tracking-wider ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>{language.toUpperCase()}</span>
            </div>

            <ChevronDown className={`w-3.5 h-3.5 ml-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`} />
          </button>

          {/* Profile & Settings Dropdown Menu */}
          {profileOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setProfileOpen(false)}
              ></div>

              <div
                className={`absolute ${isRtl ? 'left-0 text-right' : 'right-0 text-left'} mt-2 w-[min(20rem,calc(100vw-1rem))] max-h-[calc(100dvh-4.5rem)] overflow-y-auto custom-scrollbar rounded-2xl border p-3.5 shadow-2xl z-50 backdrop-blur-2xl ${
                  isLightMode
                    ? 'bg-white border-slate-200 ring-1 ring-slate-200/80 text-slate-900'
                    : 'bg-slate-900/95 border-white/15 ring-1 ring-white/10'
                }`}
              >
                {/* Profile Header Card */}
                <div className={`flex items-center gap-3 p-3 rounded-xl border mb-3 shadow-inner ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-white/[0.04] border-white/10'
                }`}>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center text-white shadow-md relative shrink-0">
                    <ShieldCheck className="w-5 h-5 text-cyan-200" />
                    {hasUpdate && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-90"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500 border border-slate-900 shadow-[0_0_8px_rgba(244,63,94,1)]"></span>
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className={`font-bold text-xs truncate ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                        {displayName}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border shrink-0 text-[9px] font-medium ${
                          isLightMode
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        }`}
                        title={t('profile_active_session')}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" />
                        <span className="hidden sm:inline">{isEn ? 'Active' : 'فعال'}</span>
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md border truncate ${
                        isLightMode
                          ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                          : 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20'
                      }`}>
                        {displayRole}
                      </span>
                    </div>
                    <p className={`text-[9px] font-mono mt-1 truncate ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                      {displayEmail}
                    </p>
                  </div>
                </div>

                {/* Section 1: Language Switcher */}
                <div className="space-y-1.5">
                  <div className={`px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                    <div className="flex items-center gap-1.5">
                      <Globe className={`w-3.5 h-3.5 shrink-0 ${isLightMode ? 'text-cyan-600' : 'text-cyan-400'}`} />
                      <span>{t('profile_language_title')}</span>
                      {isCustomizedByUser ? (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-normal ${isLightMode ? 'bg-cyan-100 text-cyan-800 border border-cyan-200' : 'bg-cyan-500/20 text-cyan-300'}`}>
                          {t('profile_custom_badge')}
                        </span>
                      ) : (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-normal ${isLightMode ? 'bg-slate-100 text-slate-600 border border-slate-200' : 'bg-white/10 text-slate-400'}`}>
                          {t('profile_default_badge')}
                        </span>
                      )}
                    </div>
                    {isCustomizedByUser && (
                      <button
                        type="button"
                        onClick={() => resetToDefaultLanguage()}
                        className={`text-[9px] underline cursor-pointer ${isLightMode ? 'text-cyan-700 hover:text-cyan-900' : 'text-cyan-400 hover:text-cyan-300'}`}
                        title={isEn ? 'Reset to system default language' : 'بازنشانی به زبان پیش‌فرض سامانه'}
                      >
                        {t('profile_reset_to_default')}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setLanguage('en')}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all duration-150 cursor-pointer ${
                        language === 'en'
                          ? isLightMode
                            ? 'bg-cyan-50 text-cyan-900 font-bold border border-cyan-400 shadow-xs'
                            : 'bg-cyan-500/20 text-white font-bold border border-cyan-400/50 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                          : isLightMode
                          ? 'bg-slate-50 text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
                          : 'bg-white/[0.03] text-slate-300 hover:text-white hover:bg-white/[0.08] border border-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded border ${
                          isLightMode
                            ? 'bg-cyan-100 text-cyan-800 border-cyan-300'
                            : 'bg-white/10 text-cyan-300 border-cyan-400/20'
                        }`}>EN</span>
                        <span className="truncate">English</span>
                      </div>
                      {language === 'en' && <Check className={`w-3.5 h-3.5 shrink-0 ${isLightMode ? 'text-cyan-600' : 'text-cyan-400'}`} />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setLanguage('fa')}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all duration-150 cursor-pointer ${
                        language === 'fa'
                          ? isLightMode
                            ? 'bg-cyan-50 text-cyan-900 font-bold border border-cyan-400 shadow-xs'
                            : 'bg-cyan-500/20 text-white font-bold border border-cyan-400/50 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                          : isLightMode
                          ? 'bg-slate-50 text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
                          : 'bg-white/[0.03] text-slate-300 hover:text-white hover:bg-white/[0.08] border border-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded border ${
                          isLightMode
                            ? 'bg-cyan-100 text-cyan-800 border-cyan-300'
                            : 'bg-white/10 text-cyan-300 border-cyan-400/20'
                        }`}>FA</span>
                        <span className="truncate">فارسی</span>
                      </div>
                      {language === 'fa' && <Check className={`w-3.5 h-3.5 shrink-0 ${isLightMode ? 'text-cyan-600' : 'text-cyan-400'}`} />}
                    </button>
                  </div>
                </div>

                {/* Divider between Language and Theme */}
                <div className={`my-3 border-t ${isLightMode ? 'border-slate-200' : 'border-white/10'}`} />

                {/* Section 2: Theme Switcher */}
                <div className="space-y-1.5">
                  <div className={`px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                    <div className="flex items-center gap-1.5">
                      <Palette className={`w-3.5 h-3.5 shrink-0 ${isLightMode ? 'text-indigo-600' : 'text-indigo-400'}`} />
                      <span>{t('profile_theme_title')}</span>
                      {isThemeCustomized ? (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-normal ${isLightMode ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' : 'bg-indigo-500/20 text-indigo-300'}`}>
                          {t('profile_custom_badge')}
                        </span>
                      ) : (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-normal ${isLightMode ? 'bg-slate-100 text-slate-600 border border-slate-200' : 'bg-white/10 text-slate-400'}`}>
                          {t('profile_default_badge')}
                        </span>
                      )}
                    </div>
                    {isThemeCustomized && onResetThemeToDefault && (
                      <button
                        type="button"
                        onClick={() => onResetThemeToDefault()}
                        className={`text-[9px] underline cursor-pointer ${isLightMode ? 'text-indigo-600 hover:text-indigo-800' : 'text-indigo-400 hover:text-indigo-300'}`}
                        title={isEn ? 'Reset to system default theme' : 'بازنشانی به تم پیش‌فرض سامانه'}
                      >
                        {t('profile_reset_to_default')}
                      </button>
                    )}
                  </div>

                  {/* Themes Grid */}
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    {themeOptions.map((opt, idx) => {
                      const isSelected = panelTheme === opt.id;
                      const isFullWidth = idx === themeOptions.length - 1 && themeOptions.length % 2 !== 0;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onChangeTheme(opt.id)}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs transition-all duration-150 cursor-pointer ${
                            isFullWidth ? 'col-span-2 justify-between' : ''
                          } ${
                            isSelected
                              ? isLightMode
                                ? 'bg-indigo-50 text-indigo-900 font-bold border border-indigo-400 shadow-xs'
                                : 'bg-indigo-600/30 text-white font-bold border border-indigo-400/50 shadow-[0_0_12px_rgba(99,102,241,0.25)]'
                              : isLightMode
                              ? 'bg-slate-50 text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
                              : 'bg-white/[0.03] text-slate-300 hover:text-white hover:bg-white/[0.08] border border-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-3.5 h-3.5 rounded-full shrink-0 shadow-xs border ${
                                isSelected
                                  ? isLightMode
                                    ? 'ring-2 ring-indigo-300 border-transparent'
                                    : 'ring-2 ring-white/50 border-transparent'
                                  : isLightMode
                                  ? 'border-slate-300'
                                  : 'border-white/20'
                              }`}
                              style={{ backgroundColor: opt.color }}
                            />
                            <span className="truncate text-[11px]">{isEn ? opt.nameEn : opt.nameFa}</span>
                          </div>
                          {isSelected && <Check className={`w-3.5 h-3.5 shrink-0 ml-auto ${isLightMode ? 'text-indigo-600' : 'text-indigo-300'}`} />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Section 3: Check for Updates & Release Notes (Super Admin Only) */}
                {isSuperAdmin && (
                  <>
                    <div className={`my-3 border-t ${isLightMode ? 'border-slate-200' : 'border-white/10'}`} />
                    <div>
                      <button
                        onClick={() => {
                          setProfileOpen(false);
                          if (onOpenUpdateSettings) {
                            onOpenUpdateSettings();
                          } else if (onOpenReleaseNotes) {
                            onOpenReleaseNotes();
                          }
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer shadow-xs active:scale-98 ${
                          isLightMode
                            ? 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-800'
                            : 'bg-gradient-to-r from-purple-500/15 to-indigo-500/15 hover:from-purple-500/25 hover:to-indigo-500/25 border-purple-500/25 text-purple-200'
                        }`}
                        title={isEn ? 'Open Panel Updates and Release Notes in Settings' : 'باز کردن صفحه ارتقا و به‌روزرسانی پنل در سیتینگ'}
                      >
                        <div className="flex items-center gap-2">
                          <ArrowUpCircle className={`w-4 h-4 ${isLightMode ? 'text-purple-600' : 'text-purple-400'}`} />
                          <span>{isEn ? 'Check for Updates' : 'بررسی نسخه جدید و آپدیت'}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            isLightMode
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : 'bg-purple-500/20 text-purple-300'
                          }`}>
                            v{APP_VERSION}
                          </span>
                          {hasUpdate && (
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-90"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,1)]"></span>
                            </span>
                          )}
                        </div>
                      </button>
                    </div>
                  </>
                )}

                {/* Section 4: Log Out Action */}
                <div className={`my-3 border-t ${isLightMode ? 'border-slate-200' : 'border-white/10'}`} />
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    logout();
                  }}
                  className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer active:scale-98 ${
                    isLightMode
                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border-rose-200 hover:border-rose-300'
                      : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border-rose-500/25 hover:border-rose-500/40'
                  }`}
                >
                  <LogOut className={`w-3.5 h-3.5 ${isLightMode ? 'text-rose-600' : 'text-rose-400'}`} />
                  <span>{isEn ? 'Log Out of Account' : 'خروج از حساب کاربری'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

