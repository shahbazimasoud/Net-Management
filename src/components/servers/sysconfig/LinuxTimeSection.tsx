import React, { useState, useEffect } from 'react';
import { Clock, RefreshCw, CheckCircle2, AlertTriangle, Save, Zap } from 'lucide-react';
import { RemoteServer, LinuxTimeInfo } from '../../../types';
import {
  fetchLinuxTimeInfo,
  updateLinuxTimezone,
  updateLinuxNtp,
  updateLinuxTime,
} from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface LinuxTimeSectionProps {
  server: RemoteServer;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
}

const COMMON_TIMEZONES = [
  { label: 'Asia/Tehran (Iran Standard Time +03:30)', value: 'Asia/Tehran' },
  { label: 'UTC (Coordinated Universal Time)', value: 'UTC' },
  { label: 'Europe/London (GMT/BST)', value: 'Europe/London' },
  { label: 'Europe/Berlin (CET/CEST)', value: 'Europe/Berlin' },
  { label: 'Europe/Paris (CET/CEST)', value: 'Europe/Paris' },
  { label: 'Asia/Dubai (GST +04:00)', value: 'Asia/Dubai' },
  { label: 'Asia/Istanbul (TRT +03:00)', value: 'Asia/Istanbul' },
  { label: 'America/New_York (EST/EDT)', value: 'America/New_York' },
  { label: 'America/Los_Angeles (PST/PDT)', value: 'America/Los_Angeles' },
  { label: 'Asia/Singapore (SGT +08:00)', value: 'Asia/Singapore' },
  { label: 'Asia/Tokyo (JST +09:00)', value: 'Asia/Tokyo' },
];

export const LinuxTimeSection: React.FC<LinuxTimeSectionProps> = ({
  server,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
}) => {
  const [timeInfo, setTimeInfo] = useState<LinuxTimeInfo | null>(null);
  const [selectedTz, setSelectedTz] = useState('UTC');
  const [customTz, setCustomTz] = useState('');
  const [useCustomTz, setUseCustomTz] = useState(false);
  const [manualTimeStr, setManualTimeStr] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingTz, setSavingTz] = useState(false);
  const [updatingNtp, setUpdatingNtp] = useState(false);
  const [settingTime, setSettingTime] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetchLinuxTimeInfo(server.id, ephemeralPassword);
      if (res.success && res.info) {
        setTimeInfo(res.info);
        const tz = res.info.tzIdentifier || 'UTC';
        if (COMMON_TIMEZONES.some((c) => c.value === tz)) {
          setSelectedTz(tz);
          setUseCustomTz(false);
        } else {
          setCustomTz(tz);
          setUseCustomTz(true);
        }
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to fetch time info' : 'خطا در دریافت اطلاعات ساعت'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error' : 'خطای ارتباط با سرور'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [server.id, ephemeralPassword]);

  const handleSaveTimezone = async () => {
    const tzToApply = (useCustomTz ? customTz : selectedTz).trim();
    if (!tzToApply) return;

    setSavingTz(true);
    setFeedback(null);
    try {
      const res = await updateLinuxTimezone(server.id, tzToApply, ephemeralPassword);
      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? `Timezone set to ${tzToApply}` : `منطقه زمانی به ${tzToApply} تغییر یافت`),
          type: 'success',
        });
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to set timezone' : 'خطا در تنظیم منطقه زمانی'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error' : 'خطای شبکه'),
        type: 'error',
      });
    } finally {
      setSavingTz(false);
    }
  };

  const handleToggleNtp = async (enable: boolean) => {
    setUpdatingNtp(true);
    setFeedback(null);
    try {
      const res = await updateLinuxNtp(server.id, enable, ephemeralPassword);
      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? `NTP synchronization ${enable ? 'enabled' : 'disabled'}` : `همگام‌سازی خودکار NTP ${enable ? 'فعال' : 'غیرفعال'} شد`),
          type: 'success',
        });
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to toggle NTP' : 'خطا در تغییر وضعیت NTP'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error' : 'خطای شبکه'),
        type: 'error',
      });
    } finally {
      setUpdatingNtp(false);
    }
  };

  const handleManualTimeSet = async () => {
    if (!manualTimeStr.trim()) return;
    setSettingTime(true);
    setFeedback(null);
    try {
      const res = await updateLinuxTime(server.id, manualTimeStr.trim(), ephemeralPassword);
      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? 'System time updated' : 'ساعت سرور تنظیم شد'),
          type: 'success',
        });
        setManualTimeStr('');
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to set system time' : 'خطا در تنظیم دستی ساعت'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error' : 'خطای شبکه'),
        type: 'error',
      });
    } finally {
      setSettingTime(false);
    }
  };

  return (
    <div
      id="linux-time-timezone-card"
      className={`p-5 rounded-2xl border space-y-5 ${
        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-sm font-bold">
                {isEn ? 'Clock, Timezone & NTP Synchronization' : 'تنظیم ساعت، تایم‌زون و همگام‌سازی NTP'}
              </h4>
              <FieldInfoTooltip
                title={isEn ? 'Linux Time & NTP' : 'ساعت و تایم‌زون لینوکس'}
                infoWhatEn="Manages server system clock, local timezone via timedatectl, and automatic network time sync (systemd-timesyncd/chrony)."
                infoWhatFa="تنظیم دقیق ساعت سیستمی، منطقه زمانی سرور با timedatectl و همگام‌سازی خودکار زمانی از سرورهای NTP."
                infoWhyEn="Accurate time is essential for TLS certificates, authentication tickets (Kerberos/JWT), database timestamps, and security audit log correlation."
                infoWhyFa="دقت ساعت سرور برای اعتبارسنجی گواهی‌های SSL، لاگ‌های امنیتی، توکن‌های احراز هویت و پایگاه‌های داده حیاتی است."
                infoExampleEn="Asia/Tehran (+03:30) with NTP enabled."
                infoExampleFa="تنظیم روی Asia/Tehran به همراه فعال‌بودن همگام‌سازی خودکار NTP."
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {isEn ? 'Active Zone:' : 'منطقه زمانی فعلی:'}{' '}
              <strong className="text-amber-400">{timeInfo?.tzIdentifier || timeInfo?.timeZone || 'UTC'}</strong>
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={loadData}
          id="btn-refresh-time"
          title={isEn ? 'Reload Clock' : 'بروزرسانی ساعت'}
          className={`p-2 rounded-lg border transition cursor-pointer disabled:opacity-50 ${
            isLightMode ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-slate-800 border-slate-700 text-slate-300'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="font-mono">{feedback.message}</span>
        </div>
      )}

      {/* Clocks Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          className={`p-3.5 rounded-xl border ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-white/5'
          }`}
        >
          <span className="text-[10px] text-slate-400 block font-medium">
            {isEn ? 'Local Time' : 'ساعت محلی سرور'}
          </span>
          <span className="text-xs sm:text-sm font-bold text-amber-400 font-mono block mt-1">
            {timeInfo?.localTime || '-'}
          </span>
        </div>

        <div
          className={`p-3.5 rounded-xl border ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-white/5'
          }`}
        >
          <span className="text-[10px] text-slate-400 block font-medium">
            {isEn ? 'Universal Time (UTC)' : 'ساعت هماهنگ جهانی (UTC)'}
          </span>
          <span className="text-xs sm:text-sm font-bold text-slate-200 font-mono block mt-1">
            {timeInfo?.universalTime || '-'}
          </span>
        </div>

        <div
          className={`p-3.5 rounded-xl border ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-white/5'
          }`}
        >
          <span className="text-[10px] text-slate-400 block font-medium">
            {isEn ? 'NTP Service Status' : 'وضعیت همگام‌سازی NTP'}
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                timeInfo?.ntpSynchronized
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : timeInfo?.ntpEnabled
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {timeInfo?.ntpSynchronized
                ? isEn
                  ? 'Synchronized'
                  : 'همگام‌شده'
                : timeInfo?.ntpEnabled
                ? isEn
                  ? 'Syncing...'
                  : 'در حال همگام‌سازی'
                : isEn
                ? 'NTP Disabled'
                : 'غیرفعال'}
            </span>
          </div>
        </div>
      </div>

      {/* Timezone Configuration */}
      <div
        className={`p-4 rounded-xl border space-y-3 ${
          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-white/5'
        }`}
      >
        <span className="text-xs font-bold text-slate-300 block">
          {isEn ? 'Set System Timezone' : 'تنظیم منطقه زمانی (Timezone)'}
        </span>

        <div className="flex flex-col sm:flex-row items-end gap-3">
          <div className="w-full sm:flex-1">
            {!useCustomTz ? (
              <select
                id="select-timezone"
                value={selectedTz}
                onChange={(e) => setSelectedTz(e.target.value)}
                className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                  isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
                }`}
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                id="input-custom-timezone"
                placeholder="e.g. Europe/Madrid or Asia/Dubai"
                value={customTz}
                onChange={(e) => setCustomTz(e.target.value)}
                className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                  isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
                }`}
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setUseCustomTz(!useCustomTz)}
              className="text-xs text-slate-400 hover:text-slate-200 underline whitespace-nowrap"
            >
              {useCustomTz ? (isEn ? 'Pick from List' : 'انتخاب از لیست') : (isEn ? 'Custom String' : 'ورود دستی')}
            </button>

            <button
              type="button"
              id="btn-apply-timezone"
              disabled={savingTz}
              onClick={handleSaveTimezone}
              className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className={`w-3.5 h-3.5 ${savingTz ? 'animate-spin' : ''}`} />
              <span>{savingTz ? (isEn ? 'Saving...' : 'در حال ثبت...') : (isEn ? 'Apply Timezone' : 'اعمال منطقه زمانی')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* NTP Toggle & Manual Time */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-white/5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            id="btn-toggle-ntp"
            disabled={updatingNtp}
            onClick={() => handleToggleNtp(!timeInfo?.ntpEnabled)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 border ${
              timeInfo?.ntpEnabled
                ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${updatingNtp ? 'animate-spin' : ''}`} />
            <span>
              {timeInfo?.ntpEnabled
                ? isEn
                  ? 'NTP Synchronization is ON'
                  : 'همگام‌سازی NTP فعال است'
                : isEn
                ? 'Enable NTP Auto-Sync'
                : 'فعال‌سازی همگام‌سازی خودکار NTP'}
            </span>
          </button>
          <span className="text-[11px] text-slate-500">
            {isEn ? 'Automatic clock sync via timesyncd' : 'همگام‌سازی خودکار از طریق timesyncd'}
          </span>
        </div>

        {/* Manual Time Input if NTP disabled */}
        {!timeInfo?.ntpEnabled && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              id="input-manual-time"
              placeholder="YYYY-MM-DD HH:MM:SS"
              value={manualTimeStr}
              onChange={(e) => setManualTimeStr(e.target.value)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none ${
                isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
              }`}
            />
            <button
              type="button"
              id="btn-set-manual-time"
              disabled={settingTime || !manualTimeStr.trim()}
              onClick={handleManualTimeSet}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer disabled:opacity-50"
            >
              <span>{settingTime ? (isEn ? 'Setting...' : 'در حال ثبت...') : (isEn ? 'Set Time' : 'تنظیم ساعت')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
