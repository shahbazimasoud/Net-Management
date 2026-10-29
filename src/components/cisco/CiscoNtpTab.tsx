import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Server,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  FileCode2,
  Radio,
  Globe,
  Sun,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { Device } from '../../types';
import { useLanguage } from '../../i18n';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { updateCiscoConfigTab } from '../../services/api';

export interface CiscoNtpTabProps {
  device: Device;
  initialConfig?: any;
  isPermitted: boolean;
  isLightMode?: boolean;
  onConfigApplied?: () => void;
}

interface NtpServerEntry {
  server: string;
  prefer?: boolean;
}

export const CiscoNtpTab: React.FC<CiscoNtpTabProps> = ({
  device,
  initialConfig,
  isPermitted,
  isLightMode = false,
  onConfigApplied,
}) => {
  const { isEn } = useLanguage();

  const ntpData = initialConfig?.ntp || {};

  // Form States
  const [servers, setServers] = useState<NtpServerEntry[]>(
    Array.isArray(ntpData.servers) && ntpData.servers.length > 0
      ? ntpData.servers.map((s: any) =>
          typeof s === 'string' ? { server: s, prefer: false } : s
        )
      : [
          { server: '192.168.1.10', prefer: true },
          { server: 'time.google.com', prefer: false },
        ]
  );
  const [newServerInput, setNewServerInput] = useState('');
  const [newServerPrefer, setNewServerPrefer] = useState(false);

  const [sourceInterface, setSourceInterface] = useState<string>(
    ntpData.source_interface || 'Vlan1'
  );
  const [timezoneName, setTimezoneName] = useState<string>(
    ntpData.timezone_name || 'IRST'
  );
  const [timezoneHours, setTimezoneHours] = useState<number>(
    ntpData.timezone_offset_hours !== undefined ? ntpData.timezone_offset_hours : 3
  );
  const [timezoneMinutes, setTimezoneMinutes] = useState<number>(
    ntpData.timezone_offset_minutes !== undefined ? ntpData.timezone_offset_minutes : 30
  );
  const [summerTimeEnabled, setSummerTimeEnabled] = useState<boolean>(
    Boolean(ntpData.summer_time_enabled)
  );

  // Execution state
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{
    success: boolean;
    output?: string;
    error?: string;
  } | null>(null);

  // Sync with initialConfig
  useEffect(() => {
    if (Array.isArray(ntpData.servers) && ntpData.servers.length > 0) {
      setServers(
        ntpData.servers.map((s: any) =>
          typeof s === 'string' ? { server: s, prefer: false } : s
        )
      );
    }
    if (ntpData.source_interface) setSourceInterface(ntpData.source_interface);
    if (ntpData.timezone_name) setTimezoneName(ntpData.timezone_name);
    if (ntpData.timezone_offset_hours !== undefined) setTimezoneHours(ntpData.timezone_offset_hours);
    if (ntpData.timezone_offset_minutes !== undefined) setTimezoneMinutes(ntpData.timezone_offset_minutes);
    if (ntpData.summer_time_enabled !== undefined) setSummerTimeEnabled(ntpData.summer_time_enabled);
  }, [initialConfig]);

  // Live generated CLI commands
  const generatedCli = useMemo(() => {
    const lines: string[] = ['configure terminal'];
    for (const s of servers) {
      if (s.server.trim()) {
        lines.push(`ntp server ${s.server.trim()}${s.prefer ? ' prefer' : ''}`);
      }
    }
    if (sourceInterface.trim()) {
      lines.push(`ntp source ${sourceInterface.trim()}`);
    }
    if (timezoneName.trim()) {
      lines.push(`clock timezone ${timezoneName.trim()} ${timezoneHours} ${timezoneMinutes}`);
    }
    if (summerTimeEnabled) {
      lines.push('clock summer-time IRDT recurring');
    }
    lines.push('end');
    return lines.join('\n');
  }, [servers, sourceInterface, timezoneName, timezoneHours, timezoneMinutes, summerTimeEnabled]);

  // Add Server Handler
  const handleAddServer = () => {
    const trimmed = newServerInput.trim();
    if (!trimmed) return;
    if (servers.some((s) => s.server.toLowerCase() === trimmed.toLowerCase())) return;

    setServers([...servers, { server: trimmed, prefer: newServerPrefer }]);
    setNewServerInput('');
    setNewServerPrefer(false);
  };

  // Remove Server Handler
  const handleRemoveServer = (index: number) => {
    setServers(servers.filter((_, idx) => idx !== index));
  };

  // Toggle Prefer Flag
  const handleTogglePrefer = (index: number) => {
    setServers(
      servers.map((s, idx) => (idx === index ? { ...s, prefer: !s.prefer } : s))
    );
  };

  // Handle Deploy CLI to switch
  const handleApply = async () => {
    if (!isPermitted || isApplying) return;
    setIsApplying(true);
    setApplyResult(null);

    const payload = {
      servers: servers.filter((s) => s.server.trim()),
      source_interface: sourceInterface.trim(),
      timezone_name: timezoneName.trim(),
      timezone_offset_hours: timezoneHours,
      timezone_offset_minutes: timezoneMinutes,
      summer_time_enabled: summerTimeEnabled,
    };

    try {
      const res = await updateCiscoConfigTab(device.id, 'ntp', payload);
      if (res.success) {
        setApplyResult({
          success: true,
          output: res.output || (isEn ? 'NTP servers and timezone parameters applied successfully.' : 'سرورهای NTP و منطقه زمانی با موفقیت روی سوئیچ اعمال شدند.'),
        });
        if (onConfigApplied) onConfigApplied();
      } else {
        setApplyResult({
          success: false,
          error: res.error || (isEn ? 'Failed to apply NTP configuration' : 'خطا در اعمال پیکربندی NTP'),
        });
      }
    } catch (err: any) {
      setApplyResult({
        success: false,
        error: err?.message || (isEn ? 'Communication error during NTP deployment' : 'خطای ارتباطی هنگام اعمال تنظیمات NTP'),
      });
    } finally {
      setIsApplying(false);
    }
  };

  // Reset to initial values
  const handleReset = () => {
    if (Array.isArray(ntpData.servers) && ntpData.servers.length > 0) {
      setServers(
        ntpData.servers.map((s: any) =>
          typeof s === 'string' ? { server: s, prefer: false } : s
        )
      );
    } else {
      setServers([
        { server: '192.168.1.10', prefer: true },
        { server: 'time.google.com', prefer: false },
      ]);
    }
    setSourceInterface(ntpData.source_interface || 'Vlan1');
    setTimezoneName(ntpData.timezone_name || 'IRST');
    setTimezoneHours(ntpData.timezone_offset_hours !== undefined ? ntpData.timezone_offset_hours : 3);
    setTimezoneMinutes(ntpData.timezone_offset_minutes !== undefined ? ntpData.timezone_offset_minutes : 30);
    setSummerTimeEnabled(Boolean(ntpData.summer_time_enabled));
    setApplyResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / NTP Live Hardware Telemetry */}
      <div
        className={`p-4 rounded-xl border flex items-center justify-between ${
          isLightMode
            ? 'bg-slate-100 border-slate-200 text-slate-800'
            : 'bg-slate-900/60 border-slate-800 text-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-xs sm:text-sm">
              {isEn ? 'Network Time Protocol (NTP) & Clock Suite' : 'پروتکل زمان شبکه (NTP) و ساعت سخت‌افزاری'}
            </h4>
            <p className="text-xs opacity-75 mt-0.5">
              {isEn
                ? 'Coordinate system clock across multi-stratum upstream servers for forensic audit and syslog correlation.'
                : 'همگام‌سازی ساعت سیستم با سرورهای زمانی معتبر جهت لاگ‌برداری دقیق و بررسی رخدادهای شبکه.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold border flex items-center gap-1.5 ${
              ntpData.is_synced
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            }`}
          >
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>{ntpData.is_synced ? (isEn ? 'NTP Synchronized' : 'همگام با سرور') : (isEn ? 'Stratum Unsynced' : 'در انتظار همگام‌سازی')}</span>
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left Column: NTP Servers List */}
        <div
          className={`p-5 rounded-2xl border space-y-4 shadow-xs ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-900/40 border-slate-800 text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-2.5">
            <h5 className="font-bold text-xs uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
              <Server className="w-4 h-4" />
              <span>{isEn ? 'Configured NTP Upstream Servers' : 'سرورهای زمانی بالادست (NTP Servers)'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'NTP Servers & Prefer Flag' : 'سرورهای NTP و اولویت prefer'}
              infoWhatEn="Configures IP addresses or hostnames of network time servers. The 'prefer' keyword gives priority to an authoritative clock."
              infoWhatFa="آدرس یا نام سرورهای زمانی شبکه را مشخص می‌کند. کلیدواژه prefer به سرور زمان منتخب اولویت بالاتر می‌دهد."
              infoWhyEn="Redundant NTP servers prevent time desynchronization if the primary stratum source experiences downtime."
              infoWhyFa="تعریف چند سرور مانع از بهم خوردن ساعت سوئیچ در صورت در دسترس نبودن سرور زمانی اصلی می‌شود."
              infoExampleEn="ntp server 10.0.0.1 prefer, ntp server pool.ntp.org"
              infoExampleFa="ntp server 10.0.0.1 prefer, ntp server pool.ntp.org"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* Add Server Input Form */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newServerInput}
              onChange={(e) => setNewServerInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddServer()}
              disabled={!isPermitted}
              placeholder={isEn ? 'Server IP / FQDN (e.g. 10.10.10.1)' : 'آدرس IP یا دامنه سرور (مثال: 10.10.10.1)'}
              className={`flex-1 px-3 py-2 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              }`}
              dir="ltr"
            />
            <label className="flex items-center gap-1.5 text-xs select-none cursor-pointer">
              <input
                type="checkbox"
                checked={newServerPrefer}
                onChange={(e) => setNewServerPrefer(e.target.checked)}
                disabled={!isPermitted}
                className="rounded text-cyan-600 focus:ring-cyan-500"
              />
              <span className="font-semibold">{isEn ? 'Prefer' : 'ارجحیت'}</span>
            </label>
            <button
              type="button"
              onClick={handleAddServer}
              disabled={!isPermitted || !newServerInput.trim()}
              className={`p-2 rounded-xl border text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-40 ${
                isLightMode
                  ? 'bg-cyan-50 text-cyan-700 border-cyan-300 hover:bg-cyan-100'
                  : 'bg-cyan-950 text-cyan-300 border-cyan-700/60 hover:bg-cyan-900'
              }`}
              title={isEn ? 'Add NTP Server' : 'افزودن سرور NTP'}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Servers List */}
          <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
            {servers.length === 0 ? (
              <div className="py-6 text-center text-xs opacity-60">
                {isEn ? 'No NTP servers configured' : 'هیچ سرور NTP ثبت نشده است'}
              </div>
            ) : (
              servers.map((s, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-xs ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-800'
                      : 'bg-slate-950/60 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-mono">
                    <Server className="w-3.5 h-3.5 text-cyan-500" />
                    <span className="font-bold">{s.server}</span>
                    {s.prefer && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase font-bold">
                        Prefer
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTogglePrefer(idx)}
                      disabled={!isPermitted}
                      className={`text-[11px] px-2 py-0.5 rounded border transition cursor-pointer ${
                        s.prefer
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                      }`}
                      title={isEn ? 'Toggle Prefer Priority' : 'تغییر اولویت ترجیحی'}
                    >
                      {s.prefer ? (isEn ? 'Preferred' : 'ارجح') : (isEn ? 'Set Prefer' : 'عادی')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveServer(idx)}
                      disabled={!isPermitted}
                      className="p-1 rounded-lg text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
                      title={isEn ? 'Remove Server' : 'حذف سرور'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* NTP Source Interface */}
          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold">
                {isEn ? 'NTP Source Interface (ntp source):' : 'اینترفیس مبدا بسته‌های NTP (ntp source):'}
              </label>
              <FieldInfoTooltip
                title={isEn ? 'NTP Source Interface' : 'اینترفیس مبدا NTP'}
                infoWhatEn="Forces all outbound NTP client packets to use the IP address of this specified interface as the source address."
                infoWhatFa="آدرس مبدا بسته‌های ارسالی به سرورهای زمانی را روی آی‌پی اینترفیس تعیین‌شده (مانند SVI ویلن مدیریتی) قفل می‌کند."
                infoWhyEn="Ensures predictable firewall and ACL rule matching between the switch and network time servers."
                infoWhyFa="تضمین تطابق با رول‌های فایروال و ACL برای عبور بدون مانع ترافیک زمان شبکه."
                infoExampleEn="ntp source Vlan1 / ntp source Loopback0"
                infoExampleFa="ntp source Vlan1 / ntp source Loopback0"
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>
            <input
              type="text"
              value={sourceInterface}
              onChange={(e) => setSourceInterface(e.target.value)}
              disabled={!isPermitted}
              placeholder="e.g. Vlan1, GigabitEthernet0/1, Loopback0"
              className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              }`}
              dir="ltr"
            />
          </div>
        </div>

        {/* Right Column: Timezone & Clock Parameters */}
        <div
          className={`p-5 rounded-2xl border space-y-4 shadow-xs ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-900/40 border-slate-800 text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-2.5">
            <h5 className="font-bold text-xs uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
              <Globe className="w-4 h-4" />
              <span>{isEn ? 'Timezone & Daylight Saving' : 'منطقه زمانی و ساعت تابستانی'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'Clock Timezone' : 'منطقه زمانی سیستم'}
              infoWhatEn="Sets the local timezone acronym and hour/minute offset relative to Universal Coordinated Time (UTC)."
              infoWhatFa="نام مخفف منطقه زمانی محلی و اختلاف زمانی آن بر حسب ساعت و دقیقه نسبت به زمان هماهنگ جهانی (UTC) را تعیین می‌کند."
              infoWhyEn="Translates internal UTC timestamps into authentic local operational time for log timestamps and audit reviews."
              infoWhyFa="تبدیل زمان جهانی UTC به زمان محلی جهت خوانایی آسان لاگ‌ها و تطبیق با ساعت رسمی سازمان."
              infoExampleEn="clock timezone IRST 3 30 (UTC+03:30)"
              infoExampleFa="clock timezone IRST 3 30 (UTC+03:30)"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* Timezone Name */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              {isEn ? 'Timezone Acronym (e.g. IRST, UTC, EST):' : 'نام منطقه زمانی (مانند IRST، UTC، EST):'}
            </label>
            <input
              type="text"
              value={timezoneName}
              onChange={(e) => setTimezoneName(e.target.value.toUpperCase())}
              disabled={!isPermitted}
              placeholder="IRST"
              className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              }`}
              dir="ltr"
            />
          </div>

          {/* Timezone Hours & Minutes Offset */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] opacity-75 block mb-1">
                {isEn ? 'Offset Hours (-12 to +14):' : 'اختلاف ساعت:'}
              </span>
              <input
                type="number"
                min="-12"
                max="14"
                value={timezoneHours}
                onChange={(e) => setTimezoneHours(parseInt(e.target.value, 10) || 0)}
                disabled={!isPermitted}
                className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                    : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
                }`}
              />
            </div>
            <div>
              <span className="text-[10px] opacity-75 block mb-1">
                {isEn ? 'Offset Minutes (0-59):' : 'اختلاف دقیقه:'}
              </span>
              <input
                type="number"
                min="0"
                max="59"
                value={timezoneMinutes}
                onChange={(e) => setTimezoneMinutes(parseInt(e.target.value, 10) || 0)}
                disabled={!isPermitted}
                className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                    : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
                }`}
              />
            </div>
          </div>

          {/* Summer Time / Daylight Saving Toggle */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Sun className="w-4 h-4 text-amber-500" />
              <div>
                <span className="text-xs font-bold block">
                  {isEn ? 'Daylight Saving Time (DST):' : 'ساعت تابستانی (Daylight Saving):'}
                </span>
                <span className="text-[10px] opacity-70 font-mono">clock summer-time IRDT recurring</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={summerTimeEnabled}
              onChange={(e) => setSummerTimeEnabled(e.target.checked)}
              disabled={!isPermitted}
              className="rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer w-4 h-4"
            />
          </div>

          {/* Quick Preset Buttons */}
          <div>
            <span className="text-[10px] opacity-70 block mb-1.5">{isEn ? 'Common Presets:' : 'الگوهای زمانی متداول:'}</span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { name: 'IRST (Tehran +3:30)', tz: 'IRST', h: 3, m: 30, dst: false },
                { name: 'UTC (Universal +0:00)', tz: 'UTC', h: 0, m: 0, dst: false },
                { name: 'GST (Dubai +4:00)', tz: 'GST', h: 4, m: 0, dst: false },
                { name: 'CET (Central Europe +1:00)', tz: 'CET', h: 1, m: 0, dst: true },
              ].map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setTimezoneName(p.tz);
                    setTimezoneHours(p.h);
                    setTimezoneMinutes(p.m);
                    setSummerTimeEnabled(p.dst);
                  }}
                  disabled={!isPermitted}
                  className={`px-2 py-1 rounded-lg text-[10px] border font-mono transition cursor-pointer ${
                    isLightMode
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Live Generated Cisco CLI Preview */}
      <div
        className={`p-4 rounded-2xl border shadow-inner ${
          isLightMode
            ? 'bg-slate-900 text-slate-100 border-slate-700'
            : 'bg-black/80 text-emerald-400 border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
            <FileCode2 className="w-4 h-4 text-cyan-400" />
            <span>{isEn ? 'Generated Cisco IOS CLI Commands Preview:' : 'پیش‌نمایش زنده دستورات ارسالی به سوئیچ:'}</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">{'conf t -> ntp -> clock -> end'}</span>
        </div>
        <pre className="text-xs font-mono p-3 rounded-xl bg-slate-950/70 border border-white/10 overflow-x-auto custom-scrollbar leading-relaxed" dir="ltr">
          {generatedCli}
        </pre>
      </div>

      {/* Execution Feedback Banner */}
      {applyResult && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
            applyResult.success
              ? isLightMode
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
              : isLightMode
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
          }`}
        >
          {applyResult.success ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <h5 className="font-bold text-xs">
              {applyResult.success
                ? isEn
                  ? 'Configuration Deployed to Switch Successfully'
                  : 'پیکربندی با موفقیت روی سخت‌افزار سوئیچ اعمال شد'
                : isEn
                ? 'Deployment Error'
                : 'خطا در اعمال پیکربندی'}
            </h5>
            <p className="text-xs mt-1 font-mono opacity-90 break-words" dir="ltr">
              {applyResult.output || applyResult.error}
            </p>
          </div>
        </div>
      )}

      {/* Action Footer Buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
        <button
          type="button"
          onClick={handleReset}
          disabled={isApplying}
          className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition cursor-pointer active:scale-95 ${
            isLightMode
              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{isEn ? 'Reset to Current' : 'بازنشانی به مقادیر جاری'}</span>
        </button>

        <button
          type="button"
          onClick={handleApply}
          disabled={!isPermitted || isApplying}
          className={`px-6 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
            isLightMode
              ? 'bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white shadow-cyan-600/30'
              : 'bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-black shadow-[0_0_20px_rgba(6,182,212,0.4)]'
          }`}
        >
          <Play className={`w-4 h-4 ${isApplying ? 'animate-spin' : ''}`} />
          <span>
            {isApplying
              ? isEn
                ? 'Applying NTP to Switch CLI...'
                : 'در حال ارسال دستورات به سوئیچ...'
              : isEn
              ? 'Apply Configuration to Switch'
              : 'اعمال پیکربندی روی سخت‌افزار سوئیچ'}
          </span>
        </button>
      </div>
    </div>
  );
};
