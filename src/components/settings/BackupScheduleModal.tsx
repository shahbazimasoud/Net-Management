import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Shield,
  ShieldCheck,
  KeyRound,
  Database,
  Server,
  Layers,
  FileText,
  Sliders,
  Check,
  AlertCircle,
  Save,
  Trash2,
  Maximize2,
  Minimize2,
  Minus,
  X
} from 'lucide-react';
import { ScheduledBackupJob, BackupScope } from '../../types';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface BackupScheduleModalProps {
  isOpen: boolean;
  isEn: boolean;
  isLightMode?: boolean;
  job: ScheduledBackupJob | null;
  onClose: () => void;
  onSave: (jobData: Partial<ScheduledBackupJob>) => Promise<void>;
}

export const BackupScheduleModal: React.FC<BackupScheduleModalProps> = ({
  isOpen,
  isEn,
  isLightMode = false,
  job,
  onClose,
  onSave
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [scheduleType, setScheduleType] = useState<'hourly' | 'daily' | 'weekly' | 'custom_interval'>('daily');
  const [runTime, setRunTime] = useState('02:00');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [scope, setScope] = useState<BackupScope>('full');
  const [encrypt, setEncrypt] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [sanitize, setSanitize] = useState(false);
  const [retentionCount, setRetentionCount] = useState(10);
  const [retentionDays, setRetentionDays] = useState(30);

  useEffect(() => {
    if (job) {
      setName(job.name || '');
      setEnabled(job.enabled !== false);
      setScheduleType(job.schedule_type || 'daily');
      setRunTime(job.run_time || '02:00');
      setDaysOfWeek(job.days_of_week && job.days_of_week.length > 0 ? job.days_of_week : [0, 1, 2, 3, 4, 5, 6]);
      setIntervalMinutes(job.interval_minutes || 60);
      setScope(job.scope || 'full');
      setEncrypt(!!job.encrypt);
      setPassphrase('');
      setConfirmPassphrase('');
      setSanitize(!!job.sanitize);
      setRetentionCount(job.retention_count || 10);
      setRetentionDays(job.retention_days || 30);
    } else {
      setName(isEn ? 'Daily Automated DR Snapshot' : 'بکاپ خودکار روزانه کل سیستم');
      setEnabled(true);
      setScheduleType('daily');
      setRunTime('02:00');
      setDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
      setIntervalMinutes(60);
      setScope('full');
      setEncrypt(false);
      setPassphrase('');
      setConfirmPassphrase('');
      setSanitize(false);
      setRetentionCount(10);
      setRetentionDays(30);
    }
    setErrorMessage(null);
  }, [job, isOpen, isEn]);

  if (!isOpen) return null;

  const toggleDayOfWeek = (day: number) => {
    if (daysOfWeek.includes(day)) {
      if (daysOfWeek.length > 1) {
        setDaysOfWeek(daysOfWeek.filter((d) => d !== day));
      }
    } else {
      setDaysOfWeek([...daysOfWeek, day].sort());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage(isEn ? 'Please specify a name for the schedule.' : 'لطفاً یک نام معتبر برای زمانبندی وارد کنید.');
      return;
    }

    if (encrypt) {
      if (!job && (!passphrase || passphrase.length < 4)) {
        setErrorMessage(isEn ? 'Passphrase must be at least 4 characters.' : 'رمز عبور پکیج رمزنگاری باید حداقل ۴ کاراکتر باشد.');
        return;
      }
      if (passphrase && passphrase !== confirmPassphrase) {
        setErrorMessage(isEn ? 'Passphrases do not match.' : 'تکرار کلمه عبور با رمز عبور مطابقت ندارد.');
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload: Partial<ScheduledBackupJob> = {
        name: name.trim(),
        enabled,
        schedule_type: scheduleType,
        run_time: runTime,
        days_of_week: daysOfWeek,
        interval_minutes: Number(intervalMinutes) || 60,
        scope,
        encrypt,
        sanitize,
        retention_count: Math.max(1, Number(retentionCount) || 10),
        retention_days: Math.max(1, Number(retentionDays) || 30)
      };

      if (encrypt && passphrase) {
        payload.passphrase = passphrase;
      }

      await onSave(payload);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || (isEn ? 'Failed to save scheduled backup' : 'خطا در ثبت زمانبندی پشتیبان'));
    } finally {
      setIsSaving(false);
    }
  };

  const weekDays = [
    { id: 0, label_fa: 'شنبه', label_en: 'Sat' },
    { id: 1, label_fa: 'یکشنبه', label_en: 'Sun' },
    { id: 2, label_fa: 'دوشنبه', label_en: 'Mon' },
    { id: 3, label_fa: 'سه‌شنبه', label_en: 'Tue' },
    { id: 4, label_fa: 'چهارشنبه', label_en: 'Wed' },
    { id: 5, label_fa: 'پنج‌شنبه', label_en: 'Thu' },
    { id: 6, label_fa: 'جمعه', label_en: 'Fri' }
  ];

  return (
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[9999] flex flex-col items-center justify-center transition-all duration-200 ${
        isMaximized ? 'p-0' : 'p-3 sm:p-6 bg-black/80 backdrop-blur-sm'
      }`}
    >
      <div
        className={`flex flex-col transition-all duration-200 overflow-hidden shadow-2xl ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-3xl max-h-[88vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-300 text-slate-800'
            : 'bg-slate-950 border-cyan-500/30 text-slate-100'
        }`}
      >
        {/* Header with 3 Universal Controls */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/10'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl border ${
                isLightMode
                  ? 'bg-cyan-50 text-cyan-600 border-cyan-200'
                  : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
              }`}
            >
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm">
                {job
                  ? isEn
                    ? 'Edit Scheduled Backup Job'
                    : 'ویرایش زمانبندی پشتیبان‌گیری خودکار'
                  : isEn
                  ? 'Create New Scheduled Backup Job'
                  : 'تعریف زمانبندی جدید پشتیبان‌گیری خودکار'}
              </h2>
              <p className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Configure automated recurring background backups, encryption & server retention rules'
                  : 'تنظیم فرکانس اجرای خودکار، رمزنگاری پکیج و سیاست‌های پالایش و نگهداری فایل‌ها در سرور'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-500'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title={isEn ? 'Minimize' : 'کوچک‌سازی'}
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-500'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام صفحه') : (isEn ? 'Fullscreen' : 'تمام صفحه')}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'hover:bg-rose-100 text-slate-500 hover:text-rose-600'
                  : 'hover:bg-rose-950/40 text-slate-400 hover:text-rose-400'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Job Name & Enable Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="flex items-center gap-1.5 text-xs font-bold mb-1.5">
                <span>{isEn ? 'Schedule Name:' : 'نام زمانبندی:'}</span>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  title={isEn ? 'Schedule Name' : 'نام زمانبندی'}
                  infoWhatEn="A descriptive label for this automated backup task."
                  infoWhatFa="عنوان تشریحی برای شناسایی این جاب پشتیبان‌گیری دوره‌ای."
                  infoWhyEn="Displayed in backup archives, audit logs, and schedule overviews."
                  infoWhyFa="در تاریخچه آرشیوها، لاگ‌های ممیزی و جدول زمانبندی نمایش داده می‌شود."
                  infoExampleEn="Daily Midnight Full DR Backup"
                  infoExampleFa="بکاپ جامع شبانه سرورها و دیتابیس"
                />
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isEn ? 'e.g. Daily Core Network Backup' : 'مثال: بکاپ جامع روزانه سرورها و شبکه'}
                required
                className={`w-full px-3.5 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800'
                    : 'bg-slate-900 border-white/15 text-white'
                }`}
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold mb-1.5">
                <span>{isEn ? 'Status:' : 'وضعیت اجرا:'}</span>
              </label>
              <label
                className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer ${
                  isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-white/15'
                }`}
              >
                <span className="text-xs font-semibold">
                  {enabled ? (isEn ? 'Active / Enabled' : 'فعال و خودکار') : (isEn ? 'Disabled' : 'غیرفعال')}
                </span>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Schedule Frequency & Run Time */}
          <div
            className={`p-4 rounded-xl border space-y-3 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-500" />
                <span className="text-xs font-bold">{isEn ? 'Execution Frequency' : 'فرکانس و زمانبندی اجرا'}</span>
              </div>
              <FieldInfoTooltip
                isEn={isEn}
                isLightMode={isLightMode}
                title={isEn ? 'Execution Frequency' : 'فرکانس اجرا'}
                infoWhatEn="Determines how frequently the server cron engine executes this backup."
                infoWhatFa="تعیین می‌کند که موتور زمان‌بندی سرور با چه فواصل زمانی اقدام به اجرای بکاپ نماید."
                infoWhyEn="Ensures RPO (Recovery Point Objective) requirements are met automatically."
                infoWhyFa="تضمین دستیابی به اهداف زمان بازیابی (RPO) بدون نیاز به مداخله دستی کاربر."
                infoExampleEn="Daily at 02:00 (low traffic hours)"
                infoExampleFa="روزانه در ساعت ۰۲:۰۰ بامداد (ساعات کم‌ترافیک شبکه)"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'daily', label_fa: 'روزانه (Daily)', label_en: 'Daily' },
                { id: 'hourly', label_fa: 'ساعتی (Hourly)', label_en: 'Hourly' },
                { id: 'weekly', label_fa: 'هفتگی (Weekly)', label_en: 'Weekly' },
                { id: 'custom_interval', label_fa: 'فاصله بر حسب دقیقه', label_en: 'Interval (min)' }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setScheduleType(t.id as any)}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                    scheduleType === t.id
                      ? isLightMode
                        ? 'bg-cyan-500 text-white border-cyan-600 shadow-sm'
                        : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                      : isLightMode
                      ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                      : 'bg-slate-800/80 text-slate-400 border-white/5 hover:bg-slate-800'
                  }`}
                >
                  {isEn ? t.label_en : t.label_fa}
                </button>
              ))}
            </div>

            {/* Time / Interval Sub-options */}
            {(scheduleType === 'daily' || scheduleType === 'weekly') && (
              <div className="pt-2 flex items-center gap-3">
                <label className="text-xs font-semibold">{isEn ? 'Execution Time (HH:MM):' : 'ساعت اجرا (۲۴ ساعته):'}</label>
                <input
                  type="time"
                  value={runTime}
                  onChange={(e) => setRunTime(e.target.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                    isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-white/15 text-white'
                  }`}
                />
              </div>
            )}

            {scheduleType === 'weekly' && (
              <div className="pt-2 space-y-1.5">
                <label className="block text-xs font-semibold">{isEn ? 'Days of Week:' : 'روزهای اجرا در هفته:'}</label>
                <div className="flex flex-wrap gap-1.5">
                  {weekDays.map((d) => {
                    const isSelected = daysOfWeek.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDayOfWeek(d.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                          isSelected
                            ? isLightMode
                              ? 'bg-indigo-600 text-white border-indigo-700'
                              : 'bg-indigo-500/30 text-indigo-200 border-indigo-500/50'
                            : isLightMode
                            ? 'bg-slate-100 text-slate-600 border-slate-200'
                            : 'bg-slate-800 text-slate-400 border-white/5'
                        }`}
                      >
                        {isEn ? d.label_en : d.label_fa}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {scheduleType === 'custom_interval' && (
              <div className="pt-2 flex items-center gap-3">
                <label className="text-xs font-semibold">{isEn ? 'Interval (Minutes):' : 'فاصله زمانی اجرا (دقیقه):'}</label>
                <input
                  type="number"
                  min="5"
                  max="10080"
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Math.max(5, parseInt(e.target.value) || 5))}
                  className={`w-28 px-3 py-1.5 rounded-lg text-xs border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                    isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-white/15 text-white'
                  }`}
                />
                <span className="text-[11px] text-slate-400">
                  {intervalMinutes >= 60 ? `(${(intervalMinutes / 60).toFixed(1)} ${isEn ? 'hours' : 'ساعت'})` : ''}
                </span>
              </div>
            )}
          </div>

          {/* Backup Scope */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold">{isEn ? 'Backup Scope:' : 'دامنه اطلاعات پکیج پشتیبان:'}</label>
              <FieldInfoTooltip
                isEn={isEn}
                isLightMode={isLightMode}
                title={isEn ? 'Backup Scope' : 'دامنه پشتیبان‌گیری'}
                infoWhatEn="Select which database tables and subsystem configurations are bundled into this snapshot."
                infoWhatFa="انتخاب جداول و ماژول‌هایی از سیستم که در این پکیج فشرده و آرشیو خواهند شد."
                infoWhyEn="Allows creating lightweight targeted backups alongside full disaster recovery images."
                infoWhyFa="امکان تفکیک بکاپ‌های سبک دوره‌ای (مثلاً فقط کانفیگ‌ها) از بکاپ‌های جامع فاجعه."
                infoExampleEn="Full Disaster Recovery (Recommended)"
                infoExampleFa="پکیج جامع فاجعه (توصیه شده جهت اطمینان صددرصدی)"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                {
                  id: 'full',
                  title: isEn ? 'Full Disaster Recovery' : 'پکیج جامع فاجعه (Full DR)',
                  desc: isEn ? 'All servers, devices, placements, custom maps, hierarchy, RBAC, users & settings' : 'تمام سرورها، تجهیزات، جانمایی‌ها، نقشه‌ها، سلسله‌مراتب، پالیسی‌ها و کاربران',
                  icon: Database
                },
                {
                  id: 'servers_only',
                  title: isEn ? 'Server Fleet & Categories' : 'ناوگان سرورها و دسته‌بندی‌ها',
                  desc: isEn ? 'Linux/Windows servers, roles, hardware specs, ports & categories' : 'سرورهای لینوکس و ویندوز، دسته‌بندی‌ها، مشخصات سخت‌افزاری و پورت‌ها',
                  icon: Server
                },
                {
                  id: 'devices_topology',
                  title: isEn ? 'Devices & Topology Maps' : 'نقشه‌ها و موجودی تجهیزات',
                  desc: isEn ? 'Switch inventory, ports, links, coordinates & custom maps' : 'اطلاعات دیوایس‌ها، پورت‌ها، لینک‌ها و نقشه‌های شماتیک',
                  icon: Layers
                },
                {
                  id: 'security_rbac',
                  title: isEn ? 'Identity & Access Control' : 'هویت، امنیت و سطوح دسترسی',
                  desc: isEn ? 'Local users, groups, AD config & multi-vendor RBAC policies' : 'کاربران، گروه‌های امنیتی، کانفیگ AD و پالیسی‌های دسترسی',
                  icon: Shield
                },
                {
                  id: 'templates_only',
                  title: isEn ? 'Configuration Templates' : 'الگوها و تمپلیت‌های کانفیگ',
                  desc: isEn ? 'CLI templates, automation scripts & variables' : 'الگوهای دستوری سیسکو، میکروتیک و اسکریپت‌های شبکه',
                  icon: FileText
                }
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScope(s.id as BackupScope)}
                  className={`p-3 rounded-xl border text-right transition cursor-pointer flex items-start gap-2.5 ${
                    scope === s.id
                      ? isLightMode
                        ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-sm'
                        : 'bg-blue-600/20 border-blue-500/60 text-white shadow-md'
                      : isLightMode
                      ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      : 'bg-slate-900/60 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <s.icon className={`w-4 h-4 mt-0.5 shrink-0 ${scope === s.id ? 'text-blue-500' : 'text-slate-400'}`} />
                  <div>
                    <div className="font-bold text-xs">{s.title}</div>
                    <div className="text-[10px] opacity-75 mt-0.5 leading-snug">{s.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Security & Encryption */}
          <div
            className={`p-4 rounded-xl border space-y-3 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-500" />
                <span className="text-xs font-bold">{isEn ? 'Security & Encryption' : 'تنظیمات امنیتی و رمزنگاری'}</span>
              </div>
              <FieldInfoTooltip
                isEn={isEn}
                isLightMode={isLightMode}
                title={isEn ? 'Security & Encryption' : 'امنیت و رمزنگاری فایل‌ها'}
                infoWhatEn="Hardens the exported snapshot file with AES-GCM 256-bit encryption derived via PBKDF2."
                infoWhatFa="رمزنگاری پیشرفته پکیج با الگوریتم استاندارد AES-GCM 256-bit و کلید مشتق‌شده از پسورد."
                infoWhyEn="Guarantees confidentiality if backup files are copied or stored on external media."
                infoWhyFa="تضمین محرمانگی در صورت انتقال فایل‌های آرشیو به سرورهای ذخیره‌سازی ثانویه."
                infoExampleEn="AES-GCM 256-bit with strong passphrase"
                infoExampleFa="رمزنگاری ۲۵۶ بیتی به همراه کلمه عبور قوی"
              />
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={sanitize}
                onChange={(e) => setSanitize(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-cyan-500 rounded"
              />
              <div>
                <div className="text-xs font-semibold">
                  {isEn ? 'Sanitize Passwords & Secrets' : 'پاکسازی رمزهای عبور و سکرت‌ها (Auditing Safe)'}
                </div>
                <div className="text-[10px] text-slate-400">
                  {isEn
                    ? 'Strips AD bind password, SSH credentials, and SNMP strings from saved backup.'
                    : 'حذف رمزهای عبور اکتیو دایرکتوری، SSH و SNMP قبل از ذخیره‌سازی.'}
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer pt-2 border-t border-white/5">
              <input
                type="checkbox"
                checked={encrypt}
                onChange={(e) => setEncrypt(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-indigo-500 rounded"
              />
              <div>
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{isEn ? 'Encrypt Backup File (AES-GCM 256-bit)' : 'رمزنگاری فایل بکاپ با کلید AES-GCM'}</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  {isEn
                    ? 'Requires a passphrase to decrypt and restore. Stored securely on server.'
                    : 'برای بازگردانی فایل‌های این زمانبندی نیاز به وارد کردن پسورد خواهد بود.'}
                </div>
              </div>
            </label>

            {encrypt && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <div>
                  <label className="block text-[11px] mb-1 font-semibold">
                    {isEn ? 'Passphrase:' : 'کلمه عبور رمزنگاری:'}
                    {job?.encrypt && !passphrase && (
                      <span className="text-[10px] text-amber-400 mx-1">
                        ({isEn ? 'Keep empty to reuse existing' : 'جهت حفظ رمز قبلی خالی بگذارید'})
                      </span>
                    )}
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    className={`w-full px-3 py-1.5 rounded-lg text-xs border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                      isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-white/20 text-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] mb-1 font-semibold">{isEn ? 'Confirm Passphrase:' : 'تکرار کلمه عبور:'}</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    className={`w-full px-3 py-1.5 rounded-lg text-xs border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                      isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-white/20 text-white'
                    }`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Retention Policy Engine */}
          <div
            className={`p-4 rounded-xl border space-y-3 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold">{isEn ? 'Server Retention Policy' : 'سیاست نگهداری و چرخه حیات (Retention Policy)'}</span>
              </div>
              <FieldInfoTooltip
                isEn={isEn}
                isLightMode={isLightMode}
                title={isEn ? 'Retention Policy' : 'سیاست نگهداری سرور'}
                infoWhatEn="Rules for automatically rotating and pruning old backup archives on server storage."
                infoWhatFa="تنظیم سقف مجاز نگهداری فایل‌ها در دیسک سرور جهت جلوگیری از سرریز حافظه."
                infoWhyEn="Prevents server disk exhaustion by automatically deleting expired snapshots."
                infoWhyFa="پالایش خودکار نسخه‌های منقضی‌شده و اطمینان از دسترسی همیشگی به آخرین نسخه‌های سالم."
                infoExampleEn="Keep last 10 backups, max 30 days"
                infoExampleFa="نگهداری ۱۰ نسخه آخر یا حداکثر ۳۰ روز"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold mb-1">
                  {isEn ? 'Max Retained Backups (Count Cap):' : 'حداکثر تعداد فایل‌های نگهداری‌شده (سقف تعداد):'}
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={retentionCount}
                  onChange={(e) => setRetentionCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className={`w-full px-3 py-1.5 rounded-lg text-xs border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                    isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-white/20 text-white'
                  }`}
                />
                <div className="text-[10px] text-slate-400 mt-1">
                  {isEn
                    ? `Keeps newest ${retentionCount} backups for this schedule.`
                    : `همواره ${retentionCount} نسخه آخر از این زمانبندی حفظ و فایل‌های مازاد حذف خواهند شد.`}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1">
                  {isEn ? 'Retention Age Limit (Days):' : 'سقف سن فایل‌ها (بر حسب روز):'}
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Math.max(1, parseInt(e.target.value) || 1))}
                  className={`w-full px-3 py-1.5 rounded-lg text-xs border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                    isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-white/20 text-white'
                  }`}
                />
                <div className="text-[10px] text-slate-400 mt-1">
                  {isEn
                    ? `Deletes snapshots older than ${retentionDays} days.`
                    : `بکاپ‌های قدیمی‌تر از ${retentionDays} روز به صورت خودکار پالایش می‌گردند.`}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Submit Buttons */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg transition flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? (isEn ? 'Saving Schedule...' : 'در حال ثبت زمانبندی...') : (isEn ? 'Save Schedule Job' : 'ذخیره جاب زمانبندی')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
