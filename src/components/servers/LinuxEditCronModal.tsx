import React, { useState, useEffect } from 'react';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Clock,
  Terminal,
  Play,
  Save,
  AlertTriangle,
  CheckCircle2,
  Info,
  Calendar,
  Sparkles,
  HelpCircle,
  Code2,
} from 'lucide-react';
import { RemoteServer, LinuxCronJob, LinuxCronJobPayload, LinuxCronExecutionResult } from '../../types';
import { saveLinuxCronJob, runLinuxCronJobNow } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface LinuxEditCronModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  server: RemoteServer;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
  initialJob?: LinuxCronJob | null;
  systemUsers?: string[];
}

interface CronPreset {
  id: string;
  labelEn: string;
  labelFa: string;
  schedule: string;
}

const CRON_PRESETS: CronPreset[] = [
  { id: 'every_min', labelEn: 'Every minute (* * * * *)', labelFa: 'هر دقیقه (* * * * *)', schedule: '* * * * *' },
  { id: 'every_5m', labelEn: 'Every 5 minutes (*/5 * * * *)', labelFa: 'هر ۵ دقیقه (*/5 * * * *)', schedule: '*/5 * * * *' },
  { id: 'every_15m', labelEn: 'Every 15 minutes (*/15 * * * *)', labelFa: 'هر ۱۵ دقیقه (*/15 * * * *)', schedule: '*/15 * * * *' },
  { id: 'every_30m', labelEn: 'Every 30 minutes (*/30 * * * *)', labelFa: 'هر ۳۰ دقیقه (*/30 * * * *)', schedule: '*/30 * * * *' },
  { id: 'hourly', labelEn: 'Hourly at minute 0 (0 * * * *)', labelFa: 'هر ساعت در دقیقه صفر (0 * * * *)', schedule: '0 * * * *' },
  { id: 'daily_midnight', labelEn: 'Daily at midnight (0 0 * * *)', labelFa: 'هر شب رأس ساعت ۰۰:۰۰ (0 0 * * *)', schedule: '0 0 * * *' },
  { id: 'daily_2am', labelEn: 'Daily at 02:00 AM (0 2 * * *)', labelFa: 'هر روز رأس ساعت ۰۲:۰۰ بامداد (0 2 * * *)', schedule: '0 2 * * *' },
  { id: 'weekly_sun', labelEn: 'Weekly on Sunday at 00:00 (0 0 * * 0)', labelFa: 'هفتگی یکشنبه‌ها رأس ساعت ۰۰:۰۰ (0 0 * * 0)', schedule: '0 0 * * 0' },
  { id: 'monthly_1st', labelEn: 'Monthly on 1st at 00:00 (0 0 1 * *)', labelFa: 'ماهانه اول هر ماه در ۰۰:۰۰ (0 0 1 * *)', schedule: '0 0 1 * *' },
  { id: 'reboot', labelEn: 'At system boot (@reboot)', labelFa: 'هنگام روشن شدن یا ریبوت سرور (@reboot)', schedule: '@reboot' },
  { id: 'custom', labelEn: 'Custom 5-part expression...', labelFa: 'عبارت سفارشی ۵ بخشی...', schedule: 'custom' },
];

interface CommandTemplate {
  nameEn: string;
  nameFa: string;
  commentEn: string;
  commentFa: string;
  command: string;
  suggestedSchedule: string;
}

const COMMAND_TEMPLATES: CommandTemplate[] = [
  {
    nameEn: 'Database Backup (MySQL/MariaDB)',
    nameFa: 'پشتیبان‌گیری پایگاه‌داده (MySQL/MariaDB)',
    commentEn: 'Daily automated MySQL full database dump backup',
    commentFa: 'پشتیبان‌گیری روزانه خودکار از دیتابیس‌های MySQL',
    command: 'mysqldump --all-databases -u root | gzip > /var/backups/mysql_$(date +\\%F).sql.gz',
    suggestedSchedule: '0 2 * * *',
  },
  {
    nameEn: 'Log Cleanup (Delete older than 14 days)',
    nameFa: 'پاکسازی لاگ‌های قدیمی (بیش از ۱۴ روز)',
    commentEn: 'Purge rotated system and application log files older than 14 days',
    commentFa: 'حذف فایل‌های لاگ فشرده و قدیمی‌تر از ۱۴ روز',
    command: 'find /var/log -type f -name "*.gz" -mtime +14 -exec rm -f {} +',
    suggestedSchedule: '0 3 * * *',
  },
  {
    nameEn: 'SSL Certificate Auto-Renewal (Certbot)',
    nameFa: 'تمدید خودکار گواهینامه‌های SSL (Certbot)',
    commentEn: 'Renew Let\'s Encrypt SSL/TLS certificates and reload web server',
    commentFa: 'تمدید خودکار گواهینامه SSL و بارگذاری مجدد وب‌سرور',
    command: 'certbot renew --quiet --post-hook "systemctl reload nginx || systemctl reload apache2"',
    suggestedSchedule: '0 12 * * 1',
  },
  {
    nameEn: 'Service Watchdog (Auto-restart if dead)',
    nameFa: 'ناظر سرویس (راه‌اندازی مجدد در صورت توقف)',
    commentEn: 'Check service health and auto-restart if inactive',
    commentFa: 'بررسی وضعیت سلامت سرویس و استارت در صورت توقف',
    command: 'systemctl is-active --quiet nginx || systemctl restart nginx',
    suggestedSchedule: '*/5 * * * *',
  },
  {
    nameEn: 'Custom Shell Script Execution',
    nameFa: 'اجرای اسکریپت شل سفارشی',
    commentEn: 'Execute routine administrative bash maintenance script',
    commentFa: 'اجرای اسکریپت نگهداری ادمین',
    command: '/usr/local/bin/backup-sync.sh >> /var/log/backup-sync.log 2>&1',
    suggestedSchedule: '0 4 * * *',
  },
];

export const LinuxEditCronModal: React.FC<LinuxEditCronModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  server,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
  initialJob = null,
  systemUsers = ['root'],
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  // Form Fields
  const [targetUser, setTargetUser] = useState('root');
  const [preset, setPreset] = useState<string>('daily_2am');
  const [schedule, setSchedule] = useState('0 2 * * *');

  // 5 Individual fields for visual editing
  const [cronMinute, setCronMinute] = useState('0');
  const [cronHour, setCronHour] = useState('2');
  const [cronDom, setCronDom] = useState('*');
  const [cronMon, setCronMon] = useState('*');
  const [cronDow, setCronDow] = useState('*');

  const [command, setCommand] = useState('');
  const [comment, setComment] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);

  // Status & Feedback
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<LinuxCronExecutionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state when modal opens or initialJob changes
  useEffect(() => {
    if (!isOpen) return;

    if (initialJob) {
      setTargetUser(initialJob.user || 'root');
      const sched = initialJob.schedule.trim();
      setSchedule(sched);
      setCommand(initialJob.command);
      setComment(initialJob.comment || '');
      setIsEnabled(initialJob.isEnabled);

      // Check if matches preset
      const matched = CRON_PRESETS.find((p) => p.schedule === sched);
      if (matched) {
        setPreset(matched.id);
      } else {
        setPreset('custom');
      }

      // Parse 5 fields if applicable
      const parts = sched.split(/\s+/);
      if (parts.length === 5) {
        setCronMinute(parts[0]);
        setCronHour(parts[1]);
        setCronDom(parts[2]);
        setCronMon(parts[3]);
        setCronDow(parts[4]);
      }
    } else {
      // Default new job
      setTargetUser(server.ssh_username || 'root');
      setPreset('daily_2am');
      setSchedule('0 2 * * *');
      setCronMinute('0');
      setCronHour('2');
      setCronDom('*');
      setCronMon('*');
      setCronDow('*');
      setCommand('');
      setComment('');
      setIsEnabled(true);
    }

    setTestResult(null);
    setErrorMessage(null);
  }, [isOpen, initialJob, server]);

  // When preset changes
  const handlePresetSelect = (presetId: string) => {
    setPreset(presetId);
    if (presetId === 'custom') return;

    const matched = CRON_PRESETS.find((p) => p.id === presetId);
    if (matched && matched.schedule !== 'custom') {
      setSchedule(matched.schedule);
      const parts = matched.schedule.split(/\s+/);
      if (parts.length === 5) {
        setCronMinute(parts[0]);
        setCronHour(parts[1]);
        setCronDom(parts[2]);
        setCronMon(parts[3]);
        setCronDow(parts[4]);
      }
    }
  };

  // When individual 5 fields change
  const handleFieldChange = (field: 'min' | 'hour' | 'dom' | 'mon' | 'dow', val: string) => {
    let m = cronMinute;
    let h = cronHour;
    let dom = cronDom;
    let mon = cronMon;
    let dow = cronDow;

    if (field === 'min') { m = val; setCronMinute(val); }
    if (field === 'hour') { h = val; setCronHour(val); }
    if (field === 'dom') { dom = val; setCronDom(val); }
    if (field === 'mon') { mon = val; setCronMon(val); }
    if (field === 'dow') { dow = val; setCronDow(val); }

    const combined = `${m.trim() || '*'} ${h.trim() || '*'} ${dom.trim() || '*'} ${mon.trim() || '*'} ${dow.trim() || '*'}`;
    setSchedule(combined);
    setPreset('custom');
  };

  // Apply quick template
  const handleApplyTemplate = (tmpl: CommandTemplate) => {
    setCommand(tmpl.command);
    setComment(isEn ? tmpl.commentEn : tmpl.commentFa);
    setSchedule(tmpl.suggestedSchedule);
    const matched = CRON_PRESETS.find((p) => p.schedule === tmpl.suggestedSchedule);
    if (matched) {
      setPreset(matched.id);
    } else {
      setPreset('custom');
    }
    const parts = tmpl.suggestedSchedule.split(/\s+/);
    if (parts.length === 5) {
      setCronMinute(parts[0]);
      setCronHour(parts[1]);
      setCronDom(parts[2]);
      setCronMon(parts[3]);
      setCronDow(parts[4]);
    }
  };

  // Generate human-readable explanation
  const getHumanScheduleDescription = (): string => {
    const s = schedule.trim();
    if (s === '@reboot') {
      return isEn
        ? 'Executes automatically at system boot and server startup.'
        : 'در هنگام روشن شدن یا ریبوت سرور اجرا می‌شود.';
    }
    if (s === '* * * * *') {
      return isEn ? 'Executes every minute of every day.' : 'در هر دقیقه از شبانه‌روز اجرا می‌شود.';
    }
    if (s === '*/5 * * * *') {
      return isEn ? 'Executes every 5 minutes.' : 'هر ۵ دقیقه یک‌بار اجرا می‌شود.';
    }
    if (s === '*/15 * * * *') {
      return isEn ? 'Executes every 15 minutes.' : 'هر ۱۵ دقیقه یک‌بار اجرا می‌شود.';
    }
    if (s === '*/30 * * * *') {
      return isEn ? 'Executes every 30 minutes.' : 'هر ۳۰ دقیقه یک‌بار اجرا می‌شود.';
    }
    if (s === '0 * * * *') {
      return isEn ? 'Executes once every hour at minute 00.' : 'هر ساعت یک‌بار در دقیقه ۰۰ اجرا می‌شود.';
    }
    if (s === '0 0 * * *') {
      return isEn ? 'Executes every day at midnight (00:00).' : 'هر روز رأس ساعت ۰۰:۰۰ (نیمه‌شب) اجرا می‌شود.';
    }
    if (s === '0 2 * * *') {
      return isEn ? 'Executes daily at 02:00 AM.' : 'هر روز رأس ساعت ۰۲:۰۰ بامداد اجرا می‌شود.';
    }
    if (s === '0 0 * * 0') {
      return isEn ? 'Executes every week on Sunday at 00:00.' : 'هر هفته یکشنبه‌ها رأس ساعت ۰۰:۰۰ اجرا می‌شود.';
    }
    if (s === '0 0 1 * *') {
      return isEn ? 'Executes on the 1st day of every month at 00:00.' : 'اولین روز هر ماه میلادی رأس ساعت ۰۰:۰۰ اجرا می‌شود.';
    }

    const parts = s.split(/\s+/);
    if (parts.length === 5) {
      const [m, h, dom, mon, dow] = parts;
      if (isEn) {
        return `Custom Schedule: Minute [${m}], Hour [${h}], Day [${dom}], Month [${mon}], Weekday [${dow}].`;
      }
      return `زمان‌بندی سفارشی: دقیقه [${m}]، ساعت [${h}]، روز ماه [${dom}]، ماه [${mon}]، روز هفته [${dow}].`;
    }

    return isEn ? `Schedule Expression: ${s}` : `عبارت زمان‌بندی: ${s}`;
  };

  // Test run
  const handleTestRun = async () => {
    if (!command.trim()) {
      setErrorMessage(isEn ? 'Please enter a command to execute.' : 'لطفاً دستوری برای اجرا وارد نمایید.');
      return;
    }

    setTesting(true);
    setTestResult(null);
    setErrorMessage(null);

    try {
      const res = await runLinuxCronJobNow(
        server.id,
        { user: targetUser, command: command.trim() },
        ephemeralPassword
      );

      if (res.success && res.result) {
        setTestResult(res.result);
      } else {
        setErrorMessage(res.error || (isEn ? 'Test execution failed' : 'اجرای آزمایشی ناموفق بود'));
      }
    } catch (err: any) {
      setErrorMessage(err?.message || (isEn ? 'Failed to execute command' : 'خطا در اجرای تست دستور'));
    } finally {
      setTesting(false);
    }
  };

  // Submit save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!schedule.trim()) {
      setErrorMessage(isEn ? 'Schedule expression cannot be empty.' : 'عبارت زمان‌بندی نمی‌تواند خالی باشد.');
      return;
    }
    if (!command.trim()) {
      setErrorMessage(isEn ? 'Command to execute is required.' : 'دستور اجرایی الزامی است.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    const payload: LinuxCronJobPayload = {
      id: initialJob?.id,
      originalCommand: initialJob?.command,
      originalSchedule: initialJob?.schedule,
      user: targetUser,
      schedule: schedule.trim(),
      command: command.trim(),
      comment: comment.trim() || undefined,
      isEnabled,
    };

    try {
      const res = await saveLinuxCronJob(server.id, payload, ephemeralPassword);
      if (res.success) {
        onSaved();
        onClose();
      } else {
        setErrorMessage(res.error || res.message || (isEn ? 'Failed to save cron job' : 'ذخیره جاب ناموفق بود'));
      }
    } catch (err: any) {
      setErrorMessage(err?.message || (isEn ? 'Error communicating with server' : 'خطای ارتباط با سرور'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[99999] flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm ${
        isLightMode ? 'bg-slate-900/40' : 'bg-black/60'
      }`}
    >
      <div
        className={`w-full flex flex-col transition-all duration-200 border rounded-xl shadow-2xl overflow-hidden ${
          isMaximized ? 'h-full max-h-full rounded-none' : 'max-h-[92vh] max-w-4xl'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* ======================================================== */}
        {/* MODAL HEADER (Strict Standard: Close, Minimize, Fullscreen) */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3 border-b select-none shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold flex items-center gap-2">
                <span>
                  {initialJob
                    ? isEn
                      ? 'Edit Linux Cron Job'
                      : 'ویرایش جاب زمان‌بندی‌شده (Cron Job)'
                    : isEn
                    ? 'Create Scheduled Cron Job'
                    : 'ایجاد جاب زمان‌بندی‌شده جدید (Cron Job)'}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {server.name || server.ip}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {isEn
                  ? 'Real-time Linux daemon crontab task scheduling with zero fake data.'
                  : 'مدیریت و ثبت مستقیم تسک‌ها در Crontab سرور بدون داده شبیه‌سازی‌شده.'}
              </p>
            </div>
          </div>

          {/* Triad Control Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Minimize dialog' : 'کوچک‌نمایی پنجره'}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                  : 'border-slate-800 text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام‌صفحه') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                  : 'border-slate-800 text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close dialog' : 'بستن پنجره'}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-red-600 hover:bg-red-50'
                  : 'border-slate-800 text-red-400 hover:bg-red-500/10'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* MODAL BODY */}
        {/* ======================================================== */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {errorMessage && (
            <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* SECTION 1: EXECUTION USER & STATUS */}
          <div
            className={`p-4 rounded-xl border ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
            }`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div>
                <label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5">
                  <span>{isEn ? 'Execute as User' : 'اجرا با دسترسی کاربر'}</span>
                  <FieldInfoTooltip
                    title={isEn ? 'Cron Execution User' : 'کاربر مجری کرون'}
                    infoWhatEn="The Linux system user account whose individual crontab will own and run this job."
                    infoWhatFa="حساب کاربری سیستم‌عامل لینوکس که تسک تحت مجوزها و مسیر Home آن کاربر اجرا خواهد شد."
                    infoWhyEn="Running jobs as unprivileged users (e.g., www-data, postgres) prevents security escalation risks. Use root only when root privileges are strictly required."
                    infoWhyFa="اجرای جاب‌ها با کاربران محدود مانع از خطرات امنیتی و خرابکاری سیستمی می‌شود. از root فقط برای کارهای سیستمی حیاتی استفاده کنید."
                    infoExampleEn="root, www-data, nginx, or your administrative user"
                    infoExampleFa="کاربر root برای بکاپ سرور، یا www-data برای تسک‌های وب‌سایت"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </label>
                <div className="relative">
                  <select
                    value={targetUser}
                    onChange={(e) => setTargetUser(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-xs font-mono transition outline-none ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-800 focus:border-cyan-500'
                        : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-cyan-500'
                    }`}
                  >
                    {systemUsers.map((u) => (
                      <option key={u} value={u}>
                        {u} {u === 'root' ? (isEn ? '(Superuser)' : '(مدیر ارشد سیستمی)') : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5">
                  <span>{isEn ? 'Job Operational State' : 'وضعیت فعالیت جاب'}</span>
                  <FieldInfoTooltip
                    title={isEn ? 'Cron Enabled / Paused State' : 'وضعیت فعال / متوقف کرون'}
                    infoWhatEn="Controls whether the cron daemon actively triggers this schedule or temporarily pauses it."
                    infoWhatFa="تعیین می‌کند که آیا جاب در زمان‌بندی مقرر فعال باشد یا به صورت موقت متوقف (Pause) شود."
                    infoWhyEn="Disabling a job comments it out with '# [DISABLED]' in the crontab without deleting its code, allowing instant resumption later."
                    infoWhyFa="با متوقف‌سازی، دستور حذف نمی‌شود بلکه در کرون‌تب کامنت شده تا در زمان نیاز مجدداً فعال گردد."
                    infoExampleEn="Active: Runs automatically | Paused: Kept preserved in crontab"
                    infoExampleFa="فعال: اجرای زمان‌بندی‌شده | متوقف: غیرفعال بدون حذف اسکریپت"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </label>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsEnabled(!isEnabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isEnabled ? 'bg-emerald-500' : isLightMode ? 'bg-slate-300' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        isEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className={`text-xs font-medium ${isEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {isEnabled
                      ? isEn
                        ? 'Active (Scheduled to run)'
                        : 'فعال (در صف زمان‌بندی دیمن)'
                      : isEn
                      ? 'Paused / Stopped (Preserved)'
                      : 'متوقف / غیرفعال (حفظ شده در فایل)'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: SCHEDULE CONFIGURATION & PRESETS */}
          <div
            className={`p-4 rounded-xl border ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <span>{isEn ? 'Cron Schedule & Frequency' : 'فرکانس و زمان‌بندی اجرای کرون'}</span>
                <FieldInfoTooltip
                  title={isEn ? 'Cron Schedule Syntax' : 'فرمت زمان‌بندی کرون'}
                  infoWhatEn="The standard 5-part cron pattern: Minute (0-59), Hour (0-23), Day of Month (1-31), Month (1-12), and Day of Week (0-7)."
                  infoWhatFa="ساختار پنج‌گانه زمان‌بندی استاندارد کرون: دقیقه، ساعت، روز ماه، ماه، و روز هفته."
                  infoWhyEn="Ensures predictable, deterministic task execution without consuming memory waiting in sleep loops."
                  infoWhyFa="اجرای دقیق تسک‌های دوره‌ای سرور بدون اشغال پردازنده و رم در حلقه‌های انتظار."
                  infoExampleEn="0 2 * * * (At 02:00 AM every day) or @reboot (Once at boot)"
                  infoExampleFa="0 2 * * * (هر شب در ساعت ۲) یا @reboot (هنگام روشن شدن سیستم)"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </label>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {schedule}
              </span>
            </div>

            {/* Presets Select */}
            <div className="mb-4">
              <select
                value={preset}
                onChange={(e) => handlePresetSelect(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-xs transition outline-none ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-800 focus:border-cyan-500'
                    : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-cyan-500'
                }`}
              >
                {CRON_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {isEn ? p.labelEn : p.labelFa}
                  </option>
                ))}
              </select>
            </div>

            {/* Visual 5-Field Pickers (Visible when custom or fine-tuning, unless @reboot) */}
            {schedule !== '@reboot' && (
              <div className="space-y-2 mb-4">
                <div className="grid grid-cols-5 gap-2 text-center">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      {isEn ? 'Minute (0-59)' : 'دقیقه (۰-۵۹)'}
                    </label>
                    <input
                      type="text"
                      value={cronMinute}
                      onChange={(e) => handleFieldChange('min', e.target.value)}
                      placeholder="*"
                      className={`w-full text-center px-2 py-1.5 rounded border text-xs font-mono ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-700 text-slate-100'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      {isEn ? 'Hour (0-23)' : 'ساعت (۰-۲۳)'}
                    </label>
                    <input
                      type="text"
                      value={cronHour}
                      onChange={(e) => handleFieldChange('hour', e.target.value)}
                      placeholder="*"
                      className={`w-full text-center px-2 py-1.5 rounded border text-xs font-mono ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-700 text-slate-100'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      {isEn ? 'Day (1-31)' : 'روز ماه (۱-۳۱)'}
                    </label>
                    <input
                      type="text"
                      value={cronDom}
                      onChange={(e) => handleFieldChange('dom', e.target.value)}
                      placeholder="*"
                      className={`w-full text-center px-2 py-1.5 rounded border text-xs font-mono ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-700 text-slate-100'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      {isEn ? 'Month (1-12)' : 'ماه (۱-۱۲)'}
                    </label>
                    <input
                      type="text"
                      value={cronMon}
                      onChange={(e) => handleFieldChange('mon', e.target.value)}
                      placeholder="*"
                      className={`w-full text-center px-2 py-1.5 rounded border text-xs font-mono ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-700 text-slate-100'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      {isEn ? 'Weekday (0-6)' : 'روز هفته (۰-۶)'}
                    </label>
                    <input
                      type="text"
                      value={cronDow}
                      onChange={(e) => handleFieldChange('dow', e.target.value)}
                      placeholder="*"
                      className={`w-full text-center px-2 py-1.5 rounded border text-xs font-mono ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-700 text-slate-100'
                      }`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Human-Readable Schedule Interpretation Banner */}
            <div
              className={`p-2.5 rounded-lg border flex items-center gap-2 text-xs ${
                isLightMode ? 'bg-cyan-50 border-cyan-200 text-cyan-900' : 'bg-cyan-950/40 border-cyan-800/60 text-cyan-300'
              }`}
            >
              <Info className="w-4 h-4 shrink-0 text-cyan-500" />
              <span className="font-medium">{getHumanScheduleDescription()}</span>
            </div>
          </div>

          {/* SECTION 3: COMMAND & QUICK TEMPLATES */}
          <div
            className={`p-4 rounded-xl border ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span>{isEn ? 'Command or Script to Run' : 'دستور یا مسیر اسکریپت اجرایی'}</span>
                <FieldInfoTooltip
                  title={isEn ? 'Cron Command Syntax' : 'ساختار دستور کرون'}
                  infoWhatEn="The exact shell command line or executable binary/script to be dispatched by the cron daemon."
                  infoWhatFa="دستور مستقیم شل لینوکس یا مسیر فایل اجرایی که دیمن کرون در زمان مشخص آن را فراخوانی می‌کند."
                  infoWhyEn="Use absolute paths (e.g., /usr/bin/python3 instead of python3) because the cron daemon runs with a minimal default PATH environment."
                  infoWhyFa="همواره از مسیرهای مطلق (مانند /usr/bin/bash) استفاده کنید زیرا محیط PATH پیش‌فرض کرون بسیار محدود است."
                  infoExampleEn="/usr/local/bin/backup.sh >> /var/log/backup.log 2>&1"
                  infoExampleFa="mysqldump --all-databases | gzip > /backup.sql.gz"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </label>

              {/* Quick Template Picker */}
              <div className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px] text-slate-400">
                  {isEn ? 'Quick Templates:' : 'الگوهای آماده:'}
                </span>
              </div>
            </div>

            {/* Template Buttons */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {COMMAND_TEMPLATES.map((tmpl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyTemplate(tmpl)}
                  className={`text-[11px] px-2 py-1 rounded-md border transition cursor-pointer flex items-center gap-1 ${
                    isLightMode
                      ? 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-cyan-50 hover:border-cyan-300 hover:text-cyan-700'
                      : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-cyan-500/10 hover:border-cyan-500/30 hover:text-cyan-300'
                  }`}
                >
                  <Code2 className="w-3 h-3 text-cyan-400" />
                  <span>{isEn ? tmpl.nameEn : tmpl.nameFa}</span>
                </button>
              ))}
            </div>

            {/* Command Textarea */}
            <div className="mb-3">
              <textarea
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                rows={3}
                placeholder={isEn ? '/usr/bin/python3 /opt/scripts/cleanup.py >> /var/log/cleanup.log 2>&1' : '/usr/bin/bash /root/backup.sh'}
                className={`w-full px-3 py-2 rounded-lg border text-xs font-mono transition outline-none resize-y ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-800 focus:border-cyan-500'
                    : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-cyan-500'
                }`}
              />
            </div>

            {/* Description / Comment */}
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                {isEn ? 'Comment / Description (Optional)' : 'توضیحات یا یادداشت جاب (اختیاری)'}
              </label>
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={isEn ? 'Daily midnight database archive and backup' : 'پشتیبان‌گیری شبانه دیتابیس'}
                className={`w-full px-3 py-2 rounded-lg border text-xs transition outline-none ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-800 focus:border-cyan-500'
                    : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-cyan-500'
                }`}
              />
            </div>
          </div>

          {/* SECTION 4: TEST EXECUTION RESULTS (If tested) */}
          {testResult && (
            <div
              className={`p-4 rounded-xl border ${
                testResult.success
                  ? isLightMode
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-emerald-950/30 border-emerald-800/50'
                  : isLightMode
                  ? 'bg-red-50 border-red-200'
                  : 'bg-red-950/30 border-red-800/50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  )}
                  <span className="text-xs font-bold">
                    {testResult.success
                      ? isEn
                        ? `Execution Succeeded (Exit Code: ${testResult.exitCode})`
                        : `تست موفقیت‌آمیز بود (کد خروج: ${testResult.exitCode})`
                      : isEn
                      ? `Execution Failed with Code: ${testResult.exitCode}`
                      : `اجرای تست با کد خطا خاتمه یافت: ${testResult.exitCode}`}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {testResult.durationMs}ms
                </span>
              </div>

              {testResult.stdout ? (
                <div className="mt-2">
                  <span className="text-[10px] text-slate-400 block mb-1 font-mono">Standard Output (stdout):</span>
                  <pre className="p-2.5 rounded bg-black/80 text-emerald-300 font-mono text-[11px] max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {testResult.stdout}
                  </pre>
                </div>
              ) : null}

              {testResult.stderr && !testResult.stdout ? (
                <div className="mt-2">
                  <span className="text-[10px] text-red-400 block mb-1 font-mono">Standard Error (stderr):</span>
                  <pre className="p-2.5 rounded bg-black/80 text-red-300 font-mono text-[11px] max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {testResult.stderr}
                  </pre>
                </div>
              ) : null}
            </div>
          )}
        </form>

        {/* ======================================================== */}
        {/* MODAL FOOTER */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3 border-t shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          {/* Test Run Button */}
          <button
            type="button"
            onClick={handleTestRun}
            disabled={testing || saving || !command.trim()}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              isLightMode
                ? 'border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50'
                : 'border-slate-700 text-slate-300 hover:bg-white/5 disabled:opacity-50'
            }`}
          >
            <Play className={`w-3.5 h-3.5 text-amber-400 ${testing ? 'animate-spin' : ''}`} />
            <span>{testing ? (isEn ? 'Running Test...' : 'در حال اجرای تست...') : (isEn ? 'Test Run Now' : 'اجرای تست دستی')}</span>
          </button>

          {/* Cancel & Save Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'border-slate-700 text-slate-300 hover:bg-white/5'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !command.trim() || !schedule.trim()}
              className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? (isEn ? 'Saving...' : 'در حال ذخیره...') : (isEn ? 'Save Cron Job' : 'ذخیره جاب زمان‌بندی‌شده')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
