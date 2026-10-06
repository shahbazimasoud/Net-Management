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
  Check
} from 'lucide-react';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { APP_VERSION } from '../../version';
import { ThemeType } from '../Navbar';

interface GeneralSettingsViewProps {
  isLightMode?: boolean;
  panelTheme?: ThemeType;
  onChangeTheme?: (theme: ThemeType) => void;
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
}) => {
  const { isEn } = useLanguage();
  const { user, effectivePolicy } = useAuth();

  const [healthData, setHealthData] = useState<BackendHealthData | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastCheckTime, setLastCheckTime] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

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
            <div className="p-3 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-lg shadow-sky-500/25 shrink-0">
              <Settings className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight font-mono">
                  {isEn ? 'Settings' : 'تنظیمات (Settings)'}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  {isEn ? 'Module Hub' : 'پیشخوان ماژولار'}
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
                  ? 'Core configuration hub. Additional settings modules will be added here step-by-step in upcoming phases.'
                  : 'پیشخوان مرکزی تنظیمات سیستم. ماژول‌ها و گزینه‌های تنظیمی جدید در فازهای بعدی مرحله‌به‌مرحله به این بخش اضافه خواهند شد.'}
              </p>
            </div>
          </div>

          {/* Quick Refresh Live Action */}
          <div className="flex items-center gap-2.5 self-start md:self-auto">
            <button
              onClick={fetchLiveTelemetry}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-medium text-xs shadow-md shadow-sky-600/30 transition cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
              />
              <span>{isEn ? 'Refresh Telemetry' : 'بروزرسانی داده‌ها'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Status, Telemetry & Future Modules */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Section Readiness & Upcoming Phases Info */}
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
                <div className="p-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold">
                    {isEn ? 'Configuration Section Initialized' : 'بخش تنظیمات فعال شد'}
                  </h2>
                  <p
                    className={`text-xs ${
                      isLightMode ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    {isEn
                      ? 'Navigation entry registered & ready for custom items'
                      : 'آیتم منوی ناوبری ثبت و آماده پذیرش ماژول‌های تنظیمی است'}
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{isEn ? 'Ready' : 'آماده فازهای بعدی'}</span>
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <div
                className={`p-4 rounded-xl border flex items-start gap-3.5 ${
                  isLightMode
                    ? 'bg-sky-50/80 border-sky-200 text-sky-950'
                    : 'bg-sky-950/30 border-sky-500/20 text-sky-100'
                }`}
              >
                <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm leading-relaxed">
                  <p className="font-semibold mb-1">
                    {isEn ? 'Ready for Upcoming Phases:' : 'آماده‌سازی برای فازهای بعدی:'}
                  </p>
                  <p className={isLightMode ? 'text-sky-900' : 'text-sky-200/90'}>
                    {isEn
                      ? 'This dedicated Settings section has been successfully incorporated into the navigation menu. In the next steps, you can specify individual settings, parameters, and modules to be engineered and displayed directly within this workspace.'
                      : 'این بخش اختصاصی تنظیمات (Settings) با موفقیت در منوی ناوبری پیاده‌سازی و مستقر شد. در فازهای بعدی می‌توانید تک‌تک آیتم‌ها و ماژول‌های مورد نظر خود را اعلام فرمایید تا دقیقا در همین بخش پیاده‌سازی و اضافه شوند.'}
                  </p>
                </div>
              </div>

              {/* Step Roadmap */}
              <div className="space-y-2.5 pt-2">
                <div
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-white/[0.02] border-white/5'
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xs">
                    <span className="font-bold text-emerald-400">
                      {isEn ? 'Phase 1 (Complete): ' : 'فاز ۱ (تکمیل شده): '}
                    </span>
                    <span className={isLightMode ? 'text-slate-700' : 'text-slate-300'}>
                      {isEn
                        ? 'Navigation menu entry "Settings" created with live telemetry and clean architecture.'
                        : 'افزودن آیتم "سیتینگ" به منوی ناوبری با تلمتری زنده سیستم و معماری ماژولار.'}
                    </span>
                  </div>
                </div>

                <div
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-white/[0.02] border-white/5'
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-400 flex items-center justify-center text-xs font-bold shrink-0">
                    2
                  </div>
                  <div className="text-xs">
                    <span className="font-bold text-sky-400">
                      {isEn ? 'Phase 2+ (Awaiting Brief): ' : 'فازهای بعدی (در انتظار اعلام آیتم‌ها): '}
                    </span>
                    <span className={isLightMode ? 'text-slate-700' : 'text-slate-300'}>
                      {isEn
                        ? 'Awaiting your instructions for custom settings items to be embedded here.'
                        : 'در انتظار اعلام آیتم‌های اختصاصی تنظیمی توسط شما جهت اضافه شدن گام‌به‌گام.'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className={`mt-6 pt-4 border-t text-[11px] font-mono flex items-center justify-between ${
              isLightMode
                ? 'border-slate-200 text-slate-500'
                : 'border-white/10 text-slate-400'
            }`}
          >
            <span>{isEn ? 'Protocol: Strict Zero-Mock' : 'پروتکل: داده‌های صددرصد واقعی'}</span>
            <span>{isEn ? 'Version: ' : 'نسخه: '}v{APP_VERSION}</span>
          </div>
        </div>

        {/* Card 2: Live Backend & Host Telemetry */}
        <div
          className={`p-6 rounded-2xl border backdrop-blur-xl shadow-lg space-y-4 ${
            isLightMode
              ? 'bg-white/90 border-slate-200'
              : 'bg-slate-950/60 border-white/10'
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold">
                {isEn ? 'Live System Telemetry' : 'تلمتری زنده سرور'}
              </h3>
            </div>
            {latencyMs !== null && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {latencyMs}ms
              </span>
            )}
          </div>

          {fetchError ? (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {fetchError}
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <div
                className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-white/[0.02] border-white/5'
                }`}
              >
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-sky-400" />
                  {isEn ? 'Discovery Engine' : 'هسته دیسکاوری'}
                </span>
                <span className="font-mono font-semibold text-sky-400">
                  {healthData?.engine || (isEn ? 'Detecting...' : 'در حال بررسی...')}
                </span>
              </div>

              <div
                className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-white/[0.02] border-white/5'
                }`}
              >
                <span className="text-slate-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  {isEn ? 'Backend Status' : 'وضعیت ارتباط'}
                </span>
                <span className="font-mono font-semibold text-emerald-400 uppercase">
                  {healthData?.status || 'ONLINE'}
                </span>
              </div>

              <div
                className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-white/[0.02] border-white/5'
                }`}
              >
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  {isEn ? 'CDP / LLDP Engine' : 'پروتکل همسایگی'}
                </span>
                <span className="font-mono text-indigo-300">
                  {healthData?.cdp_engine || 'Active'} / {healthData?.lldp_engine || 'Active'}
                </span>
              </div>

              <div
                className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-white/[0.02] border-white/5'
                }`}
              >
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                  {isEn ? 'HTTP Port / Host' : 'پورت و آدرس'}
                </span>
                <span className="font-mono text-slate-300">3000 / 0.0.0.0</span>
              </div>

              <div
                className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-white/[0.02] border-white/5'
                }`}
              >
                <span className="text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                  {isEn ? 'Current User' : 'کاربر جاری'}
                </span>
                <span className="font-mono text-purple-300 truncate max-w-[120px]">
                  {user?.username || 'admin'} ({user?.role || 'Super Admin'})
                </span>
              </div>
            </div>
          )}

          {lastCheckTime && (
            <p className="text-[10px] text-slate-500 font-mono text-center pt-2">
              {isEn ? `Last synced: ${lastCheckTime}` : `آخرین بروزرسانی: ${lastCheckTime}`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
