import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Server,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  FileCode2,
  Sliders,
  Shield,
  Layers,
  Activity,
} from 'lucide-react';
import { Device } from '../../types';
import { useLanguage } from '../../i18n';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { updateCiscoConfigTab } from '../../services/api';

export interface CiscoSyslogTabProps {
  device: Device;
  initialConfig?: any;
  isPermitted: boolean;
  isLightMode?: boolean;
  onConfigApplied?: () => void;
}

const SEVERITY_LEVELS = [
  { level: 'emergencies', num: 0, label: 'Emergencies (0)', desc: 'System is unusable' },
  { level: 'alerts', num: 1, label: 'Alerts (1)', desc: 'Immediate action needed' },
  { level: 'critical', num: 2, label: 'Critical (2)', desc: 'Critical conditions' },
  { level: 'errors', num: 3, label: 'Errors (3)', desc: 'Error conditions' },
  { level: 'warnings', num: 4, label: 'Warnings (4 - Recommended)', desc: 'Warning conditions' },
  { level: 'notifications', num: 5, label: 'Notifications (5)', desc: 'Normal but significant' },
  { level: 'informational', num: 6, label: 'Informational (6)', desc: 'Normal operational' },
  { level: 'debugging', num: 7, label: 'Debugging (7)', desc: 'Diagnostic messages' },
];

export const CiscoSyslogTab: React.FC<CiscoSyslogTabProps> = ({
  device,
  initialConfig,
  isPermitted,
  isLightMode = false,
  onConfigApplied,
}) => {
  const { isEn } = useLanguage();

  const syslogData = initialConfig?.syslog || {};

  // Form States
  const [servers, setServers] = useState<string[]>(
    Array.isArray(syslogData.servers) && syslogData.servers.length > 0
      ? syslogData.servers
      : ['192.168.1.40']
  );
  const [newServerInput, setNewServerInput] = useState('');
  const [severityLevel, setSeverityLevel] = useState<string>(
    syslogData.severity_level || 'warnings'
  );
  const [bufferedSize, setBufferedSize] = useState<number>(
    syslogData.buffered_size || 32768
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
    if (Array.isArray(syslogData.servers) && syslogData.servers.length > 0) {
      setServers(syslogData.servers);
    }
    if (syslogData.severity_level) setSeverityLevel(syslogData.severity_level);
    if (syslogData.buffered_size) setBufferedSize(syslogData.buffered_size);
  }, [initialConfig]);

  // Live generated CLI commands
  const generatedCli = useMemo(() => {
    const lines: string[] = ['configure terminal'];
    for (const s of servers) {
      if (s.trim()) {
        lines.push(`logging host ${s.trim()}`);
      }
    }
    if (severityLevel) {
      lines.push(`logging trap ${severityLevel}`);
    }
    if (bufferedSize) {
      lines.push(`logging buffered ${bufferedSize}`);
    }
    lines.push('service timestamps log datetime msec localtime show-timezone');
    lines.push('end');
    return lines.join('\n');
  }, [servers, severityLevel, bufferedSize]);

  // Add Server Handler
  const handleAddServer = () => {
    const trimmed = newServerInput.trim();
    if (!trimmed) return;
    if (servers.includes(trimmed)) return;
    setServers([...servers, trimmed]);
    setNewServerInput('');
  };

  // Remove Server Handler
  const handleRemoveServer = (index: number) => {
    setServers(servers.filter((_, idx) => idx !== index));
  };

  // Deploy CLI to switch
  const handleApply = async () => {
    if (!isPermitted || isApplying) return;
    setIsApplying(true);
    setApplyResult(null);

    const payload = {
      servers: servers.filter((s) => s.trim()),
      severity_level: severityLevel,
      buffered_size: bufferedSize,
    };

    try {
      const res = await updateCiscoConfigTab(device.id, 'syslog', payload);
      if (res.success) {
        setApplyResult({
          success: true,
          output: res.output || (isEn ? 'Syslog logging parameters applied successfully.' : 'تنظیمات لاگ‌برداری و سرورهای Syslog با موفقیت روی سوئیچ ثبت شدند.'),
        });
        if (onConfigApplied) onConfigApplied();
      } else {
        setApplyResult({
          success: false,
          error: res.error || (isEn ? 'Failed to apply Syslog configuration' : 'خطا در اعمال پیکربندی Syslog'),
        });
      }
    } catch (err: any) {
      setApplyResult({
        success: false,
        error: err?.message || (isEn ? 'Communication error during Syslog deployment' : 'خطای ارتباطی هنگام اعمال تنظیمات Syslog'),
      });
    } finally {
      setIsApplying(false);
    }
  };

  // Reset Form
  const handleReset = () => {
    if (Array.isArray(syslogData.servers) && syslogData.servers.length > 0) {
      setServers(syslogData.servers);
    } else {
      setServers(['192.168.1.40']);
    }
    setSeverityLevel(syslogData.severity_level || 'warnings');
    setBufferedSize(syslogData.buffered_size || 32768);
    setApplyResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div
        className={`p-4 rounded-xl border flex items-center justify-between ${
          isLightMode
            ? 'bg-slate-100 border-slate-200 text-slate-800'
            : 'bg-slate-900/60 border-slate-800 text-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-xs sm:text-sm">
              {isEn ? 'Syslog & Centralized Event Logging' : 'سرورهای Syslog و ثبت رخدادهای سیستمی'}
            </h4>
            <p className="text-xs opacity-75 mt-0.5">
              {isEn
                ? 'Stream security alerts, port state changes, and hardware events to central SIEM servers.'
                : 'هدایت بلادرنگ وقایع امنیتی، تغییر وضعیت پورت‌ها و رخدادهای سخت‌افزاری به سرورهای مانیتورینگ مرکزی.'}
            </p>
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40 uppercase">
          {severityLevel}
        </span>
      </div>

      {/* Grid: Left (Servers) - Right (Severity & Buffer) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left Column: Remote Syslog Hosts */}
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
              <span>{isEn ? 'Remote Syslog Daemons (logging host)' : 'سرورهای ریموت دریافت لاگ (logging host)'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'Syslog Logging Hosts' : 'سرورهای ثبت وقایع Syslog'}
              infoWhatEn="Configures IP addresses of remote syslog daemons or SIEM platforms (e.g. Graylog, Splunk, ELK)."
              infoWhatFa="آدرس IP سرورهای جمع‌آوری لاگ مرکزی یا پلتفرم‌های امنیتی SIEM را مشخص می‌کند."
              infoWhyEn="Local switch RAM log buffers overwrite rapidly. Remote forwarding ensures long-term compliance and auditability."
              infoWhyFa="حافظه RAM محلی سوئیچ سریع پر شده و لاگ‌های قدیمی پاک می‌شوند؛ ارسال ریموت نگهداری بلندمدت لاگ‌ها را تضمین می‌کند."
              infoExampleEn="logging host 10.0.0.40"
              infoExampleFa="logging host 10.0.0.40"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* Add Server Form */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newServerInput}
              onChange={(e) => setNewServerInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddServer()}
              disabled={!isPermitted}
              placeholder={isEn ? 'Server IP / FQDN (e.g. 10.0.0.40)' : 'آدرس IP سرور لاگ (مثال: 10.0.0.40)'}
              className={`flex-1 px-3 py-2 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              }`}
              dir="ltr"
            />
            <button
              type="button"
              onClick={handleAddServer}
              disabled={!isPermitted || !newServerInput.trim()}
              className={`p-2 rounded-xl border text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-40 ${
                isLightMode
                  ? 'bg-cyan-50 text-cyan-700 border-cyan-300 hover:bg-cyan-100'
                  : 'bg-cyan-950 text-cyan-300 border-cyan-700/60 hover:bg-cyan-900'
              }`}
              title={isEn ? 'Add Host' : 'افزودن سرور'}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Servers List */}
          <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
            {servers.length === 0 ? (
              <div className="py-6 text-center text-xs opacity-60">
                {isEn ? 'No remote syslog hosts configured' : 'هیچ سرور Syslog ثبت نشده است'}
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
                    <Server className="w-3.5 h-3.5 text-teal-400" />
                    <span className="font-bold">{s}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveServer(idx)}
                    disabled={!isPermitted}
                    className="p-1 rounded-lg text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
                    title={isEn ? 'Remove Server' : 'حذف'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Severity Filter & Buffer */}
        <div
          className={`p-5 rounded-2xl border space-y-4 shadow-xs ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-900/40 border-slate-800 text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-2.5">
            <h5 className="font-bold text-xs uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
              <Sliders className="w-4 h-4" />
              <span>{isEn ? 'Trap Severity & Memory Buffer' : 'فیلتر اهمیت لاگ‌ها و بافر حافظه'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'Syslog Severity & Buffer' : 'سطح حساسیت وقایع و بافر'}
              infoWhatEn="Filters which syslog messages are dispatched to remote hosts based on severity level (0 to 7) and sets local RAM circular buffer size."
              infoWhatFa="پیام‌های ارسالی به سرور ریموت را بر اساس سطح اهمیت (۰ تا ۷) فیلتر کرده و ظرفیت بافر موقت در حافظه رم را تنظیم می‌کند."
              infoWhyEn="Setting to 'warnings' captures security incidents and link-flaps while avoiding network congestion caused by chatty debugging logs."
              infoWhyFa="تنظیم روی warnings تمام خطاهای حیاتی و قطعی لینک را ثبت می‌کند بدون اینکه ترافیک شبکه را با لاگ‌های مکرر اشغال کند."
              infoExampleEn="logging trap warnings, logging buffered 65536"
              infoExampleFa="logging trap warnings, logging buffered 65536"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* Severity Trap Level */}
          <div>
            <label className="block text-xs font-semibold mb-1.5">
              {isEn ? 'Remote Trap Severity (logging trap):' : 'سطح اهمیت پیام‌های ارسالی (logging trap):'}
            </label>
            <select
              value={severityLevel}
              onChange={(e) => setSeverityLevel(e.target.value)}
              disabled={!isPermitted}
              className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900'
                  : 'bg-slate-950 border-slate-800 text-slate-100'
              }`}
            >
              {SEVERITY_LEVELS.map((s) => (
                <option key={s.level} value={s.level}>
                  {s.label} - {s.desc}
                </option>
              ))}
            </select>
          </div>

          {/* Buffer Size */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              {isEn ? 'Local RAM Buffer Size in Bytes (logging buffered):' : 'حجم بافر حافظه رم بر حسب بایت (logging buffered):'}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[8192, 16384, 32768, 65536].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setBufferedSize(size)}
                  disabled={!isPermitted}
                  className={`py-2 px-1 text-center rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                    bufferedSize === size
                      ? isLightMode
                        ? 'bg-cyan-600 text-white border-cyan-600 shadow-xs'
                        : 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {size / 1024} KB
                </button>
              ))}
            </div>
          </div>

          {/* High-Precision Timestamp Banner */}
          <div
            className={`p-3 rounded-xl border text-[11px] leading-relaxed ${
              isLightMode
                ? 'bg-teal-50 border-teal-200 text-teal-900'
                : 'bg-teal-950/30 border-teal-500/30 text-teal-300'
            }`}
          >
            <span className="font-bold block mb-0.5">
              {isEn ? 'Millisecond Timestamp Precision Active:' : 'دقت میلی‌ثانیه زمان‌سنجی لاگ‌ها فعال است:'}
            </span>
            <code className="font-mono text-[10px]" dir="ltr">
              service timestamps log datetime msec localtime show-timezone
            </code>
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
          <span className="text-[10px] font-mono text-slate-400">{'conf t -> logging host -> end'}</span>
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
                ? 'Applying Syslog Configuration...'
                : 'در حال اعمال تنظیمات Syslog...'
              : isEn
              ? 'Apply Configuration to Switch'
              : 'اعمال پیکربندی روی سخت‌افزار سوئیچ'}
          </span>
        </button>
      </div>
    </div>
  );
};
