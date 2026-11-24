import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileType2,
  Globe,
  HardDriveUpload,
  Keyboard,
  Languages,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Server,
  Shield,
  Trash2,
  Type,
  Upload,
  User,
  X,
} from 'lucide-react';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface RegionFontsTabProps {
  isLightMode: boolean;
  isEn: boolean;
  targetIp: string;
  canExecuteActions: boolean;
  data: any | null;
  loading: boolean;
  error: string | null;
  actionResult: any | null;
  actionError: string | null;
  onClearActionBanner: () => void;
  onRefresh: () => void;
  onUpdateDateTime: (params: {
    operation: 'set_timezone' | 'set_datetime' | 'sync_ntp' | 'toggle_ntp';
    timezoneId?: string;
    localDate?: string;
    localTime?: string;
    ntpEnabled?: boolean;
    ntpServer?: string;
  }) => Promise<void>;
  onUpdateLanguages: (params: {
    operation: 'set_languages' | 'set_locale';
    languageTags?: string[];
    activeUserSid?: string;
    systemLocale?: string;
    currentCulture?: string;
    homeLocationGeoId?: number | null;
  }) => Promise<void>;
  onInstallFont: (params: {
    fileName: string;
    fileBase64: string;
    fontDisplayName?: string;
    installScope: 'system' | 'user';
    activeUserSid?: string;
  }) => Promise<void>;
  onDeleteFont: (font: any) => Promise<void>;
  busyKey: string | null;
}

const FONT_PAGE_SIZE = 25;

const CURATED_LANGUAGES: Array<{ tag: string; labelEn: string; labelFa: string }> = [
  { tag: 'en-US', labelEn: 'English (United States)', labelFa: 'انگلیسی (آمریکا) — en-US' },
  { tag: 'fa-IR', labelEn: 'Persian (Iran)', labelFa: 'فارسی (ایران) — fa-IR' },
  { tag: 'ar-SA', labelEn: 'Arabic (Saudi Arabia)', labelFa: 'عربی — ar-SA' },
  { tag: 'ar-IQ', labelEn: 'Arabic (Iraq)', labelFa: 'عربی (عراق) — ar-IQ' },
  { tag: 'en-GB', labelEn: 'English (United Kingdom)', labelFa: 'انگلیسی (بریتانیا) — en-GB' },
  { tag: 'de-DE', labelEn: 'German (Germany)', labelFa: 'آلمانی — de-DE' },
  { tag: 'fr-FR', labelEn: 'French (France)', labelFa: 'فرانسوی — fr-FR' },
  { tag: 'tr-TR', labelEn: 'Turkish (Turkey)', labelFa: 'ترکی استانبولی — tr-TR' },
  { tag: 'ru-RU', labelEn: 'Russian (Russia)', labelFa: 'روسی — ru-RU' },
  { tag: 'es-ES', labelEn: 'Spanish (Spain)', labelFa: 'اسپانیایی — es-ES' },
  { tag: 'it-IT', labelEn: 'Italian (Italy)', labelFa: 'ایتالیایی — it-IT' },
  { tag: 'zh-CN', labelEn: 'Chinese (Simplified)', labelFa: 'چینی ساده‌شده — zh-CN' },
  { tag: 'ja-JP', labelEn: 'Japanese', labelFa: 'ژاپنی — ja-JP' },
  { tag: 'ko-KR', labelEn: 'Korean', labelFa: 'کره‌ای — ko-KR' },
];

const CURATED_LOCATIONS: Array<{ geoId: number; labelEn: string; labelFa: string }> = [
  { geoId: 116, labelEn: 'Iran (116)', labelFa: 'ایران (Iran - 116)' },
  { geoId: 244, labelEn: 'United States (244)', labelFa: 'ایالات متحده (United States - 244)' },
  { geoId: 242, labelEn: 'United Kingdom (242)', labelFa: 'بریتانیا (United Kingdom - 242)' },
  { geoId: 224, labelEn: 'United Arab Emirates (224)', labelFa: 'امارات متحده عربی (UAE - 224)' },
  { geoId: 94, labelEn: 'Germany (94)', labelFa: 'آلمان (Germany - 94)' },
  { geoId: 235, labelEn: 'Turkey (235)', labelFa: 'ترکیه (Turkey - 235)' },
  { geoId: 39, labelEn: 'Canada (39)', labelFa: 'کانادا (Canada - 39)' },
];

function formatUtcOffset(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(Math.round(minutes));
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

function formatBytes(bytes: number | null | undefined, isEn: boolean): string {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) return '—';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function escapeCsvCell(val: any): string {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const commaIdx = res.indexOf(',');
      resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/**
 * Parse endpoint clock string ("YYYY-MM-DD" + "HH:mm:ss") as a local wall-clock base Date
 * so ticking increments exact wall-clock seconds of the remote workstation regardless of browser timezone.
 */
function parseWallClock(localDate?: string, localTime?: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(localDate || '').trim());
  const tm = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(localTime || '').trim());
  if (!dm || !tm) return null;
  return new Date(
    Number(dm[1]),
    Number(dm[2]) - 1,
    Number(dm[3]),
    Number(tm[1]),
    Number(tm[2]),
    tm[3] ? Number(tm[3]) : 0
  );
}

export const RegionFontsTab: React.FC<RegionFontsTabProps> = ({
  isLightMode,
  isEn,
  targetIp,
  canExecuteActions,
  data,
  loading,
  error,
  actionResult,
  actionError,
  onClearActionBanner,
  onRefresh,
  onUpdateDateTime,
  onUpdateLanguages,
  onInstallFont,
  onDeleteFont,
  busyKey,
}) => {
  const surfaceBg = isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800';
  const subCardBg = isLightMode ? 'bg-slate-50/90 border-slate-200' : 'bg-slate-950/60 border-slate-800';
  const textPrimary = isLightMode ? 'text-slate-900' : 'text-white';
  const textMuted = isLightMode ? 'text-slate-500' : 'text-slate-400';
  const inputBg = isLightMode
    ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
    : 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500';

  // Live ticking wall-clock offset relative to endpoint snapshot
  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now());
  const snapshotCapturedAtRef = useRef<{ collectedMs: number; key: string }>({
    collectedMs: Date.now(),
    key: '',
  });

  useEffect(() => {
    const t = window.setInterval(() => setNowTickMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const key = `${data?.collectedAt || ''}|${data?.clock?.localDate || ''}|${data?.clock?.localTime || ''}`;
    if (key !== snapshotCapturedAtRef.current.key) {
      snapshotCapturedAtRef.current = { collectedMs: Date.now(), key };
    }
  }, [data?.collectedAt, data?.clock?.localDate, data?.clock?.localTime]);

  const liveEndpointClock = useMemo(() => {
    if (!data?.clock) return null;
    const base = parseWallClock(data.clock.localDate, data.clock.localTime);
    if (!base) {
      return {
        timeStr: data.clock.localTime || '--:--:--',
        dateStr: data.clock.localDate || '----/--/--',
        dayName: data.clock.dayOfWeek || '',
        jalaliStr: '',
      };
    }
    const elapsedMs = Math.max(0, nowTickMs - snapshotCapturedAtRef.current.collectedMs);
    const live = new Date(base.getTime() + elapsedMs);
    const hh = String(live.getHours()).padStart(2, '0');
    const mm = String(live.getMinutes()).padStart(2, '0');
    const ss = String(live.getSeconds()).padStart(2, '0');
    const yyyy = live.getFullYear();
    const mo = String(live.getMonth() + 1).padStart(2, '0');
    const dd = String(live.getDate()).padStart(2, '0');

    let jalaliStr = '';
    try {
      // Construct approximate UTC noon on that wall-clock date to format clean Jalali calendar date
      const calDt = new Date(Date.UTC(yyyy, live.getMonth(), live.getDate(), 12, 0, 0));
      jalaliStr = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(calDt);
    } catch {}

    let gregDay = data.clock.dayOfWeek || '';
    try {
      const calDt = new Date(Date.UTC(yyyy, live.getMonth(), live.getDate(), 12, 0, 0));
      gregDay = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(calDt);
    } catch {}

    return {
      timeStr: `${hh}:${mm}:${ss}`,
      dateStr: `${yyyy}-${mo}-${dd}`,
      dayName: gregDay,
      jalaliStr,
    };
  }, [data?.clock, nowTickMs]);

  // Inline Date/Time & Timezone Editor State (in the centered top hero)
  const [showClockEditor, setShowClockEditor] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [tzFilter, setTzFilter] = useState('');
  const [selectedTzId, setSelectedTzId] = useState('');
  const [ntpServerInput, setNtpServerInput] = useState('');

  useEffect(() => {
    if (data?.clock) {
      setEditDate(data.clock.localDate || '');
      setEditTime(String(data.clock.localTime || '').slice(0, 8));
      setSelectedTzId(data.clock.timezoneId || '');
      setNtpServerInput(String(data.clock.ntpServer || '').split(',')[0].trim());
    }
  }, [data?.collectedAt, data?.clock?.timezoneId, data?.clock?.localDate, data?.clock?.localTime]);

  const filteredTimezones = useMemo(() => {
    const list: any[] = Array.isArray(data?.availableTimezones) ? data.availableTimezones : [];
    const q = tzFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (z) =>
        String(z.id || '').toLowerCase().includes(q) ||
        String(z.displayName || '').toLowerCase().includes(q)
    );
  }, [data?.availableTimezones, tzFilter]);

  const handleSetBrowserNow = () => {
    const d = new Date();
    setEditDate(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    );
    setEditTime(
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
    );
  };

  // Language List Management State (1st, 2nd, 3rd, ...)
  const [draftLanguages, setDraftLanguages] = useState<string[]>([]);
  const [addLangPreset, setAddLangPreset] = useState('fa-IR');
  const [customLangTag, setCustomLangTag] = useState('');
  const [draftSystemLocale, setDraftSystemLocale] = useState('');
  const [draftCulture, setDraftCulture] = useState('');
  const [draftGeoId, setDraftGeoId] = useState<string>('');

  useEffect(() => {
    if (Array.isArray(data?.userLanguages)) {
      setDraftLanguages(data.userLanguages.map((l: any) => String(l.tag || '').trim()).filter(Boolean));
    }
    if (data?.region) {
      setDraftSystemLocale(data.region.systemLocale || '');
      setDraftCulture(data.region.currentCulture || '');
      setDraftGeoId(
        data.region.homeLocationGeoId !== null && data.region.homeLocationGeoId !== undefined
          ? String(data.region.homeLocationGeoId)
          : ''
      );
    }
  }, [data?.collectedAt]);

  const remoteLangSignature = useMemo(() => {
    const list: any[] = Array.isArray(data?.userLanguages) ? data.userLanguages : [];
    return list.map((l) => String(l.tag || '').trim()).join('|');
  }, [data?.userLanguages]);

  const languagesDirty = draftLanguages.join('|') !== remoteLangSignature && draftLanguages.length > 0;

  const resolveLangNames = (tag: string) => {
    const remote = (data?.userLanguages || []).find(
      (l: any) => String(l.tag || '').toLowerCase() === tag.toLowerCase()
    );
    if (remote) {
      return {
        englishName: remote.englishName || tag,
        nativeName: remote.nativeName || tag,
        tips: remote.inputMethodTips || [],
      };
    }
    const preset = CURATED_LANGUAGES.find((c) => c.tag.toLowerCase() === tag.toLowerCase());
    if (preset) {
      return { englishName: preset.labelEn, nativeName: preset.labelFa, tips: [] };
    }
    return { englishName: tag, nativeName: tag, tips: [] };
  };

  const handleAddLanguageToDraft = (tagToAdd: string) => {
    const clean = tagToAdd.trim();
    if (!clean || !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,3}$/.test(clean)) return;
    if (draftLanguages.some((t) => t.toLowerCase() === clean.toLowerCase())) return;
    if (draftLanguages.length >= 8) return;
    setDraftLanguages((prev) => [...prev, clean]);
    setCustomLangTag('');
  };

  const handleMoveLanguage = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= draftLanguages.length) return;
    setDraftLanguages((prev) => {
      const next = [...prev];
      const tmp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = tmp;
      return next;
    });
  };

  const handleRemoveLanguage = (idx: number) => {
    if (draftLanguages.length <= 1) return;
    setDraftLanguages((prev) => prev.filter((_, i) => i !== idx));
  };

  // Font Upload Queue & Installer State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [queuedFonts, setQueuedFonts] = useState<
    Array<{ id: string; file: File; displayName: string; sizeBytes: number }>
  >([]);
  const [installScope, setInstallScope] = useState<'system' | 'user'>('system');
  const [isDraggingFonts, setIsDraggingFonts] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [installingQueueProgress, setInstallingQueueProgress] = useState<{
    done: number;
    total: number;
    currentName: string;
  } | null>(null);

  const acceptFontFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setUploadNotice(null);
    const arr = Array.from(files);
    const valid: Array<{ id: string; file: File; displayName: string; sizeBytes: number }> = [];
    const rejected: string[] = [];

    for (const f of arr) {
      if (!/\.(ttf|otf|ttc|fon)$/i.test(f.name)) {
        rejected.push(f.name);
        continue;
      }
      if (f.size > 15 * 1024 * 1024) {
        rejected.push(`${f.name} (>15MB)`);
        continue;
      }
      const noExt = f.name.replace(/\.(ttf|otf|ttc|fon)$/i, '');
      valid.push({
        id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`,
        file: f,
        displayName: noExt,
        sizeBytes: f.size,
      });
    }

    if (rejected.length > 0) {
      setUploadNotice(
        isEn
          ? `Skipped unsupported or oversized files (>15MB): ${rejected.join(', ')}. Allowed: .ttf, .otf, .ttc, .fon`
          : `فایل‌های نامعتبر یا بزرگ‌تر از ۱۵ مگابایت نادیده گرفته شدند: ${rejected.join('، ')}. فرمت‌های مجاز: ttf، otf، ttc، fon`
      );
    }

    if (valid.length > 0) {
      setQueuedFonts((prev) => {
        const seen = new Set(prev.map((q) => q.file.name.toLowerCase()));
        return [...prev, ...valid.filter((v) => !seen.has(v.file.name.toLowerCase()))];
      });
    }
  };

  const handleInstallQueuedFonts = async () => {
    if (queuedFonts.length === 0) return;
    setUploadNotice(null);
    const items = [...queuedFonts];
    for (let i = 0; i < items.length; i++) {
      const q = items[i];
      setInstallingQueueProgress({ done: i, total: items.length, currentName: q.file.name });
      try {
        const b64 = await readFileAsBase64(q.file);
        await onInstallFont({
          fileName: q.file.name,
          fileBase64: b64,
          fontDisplayName: q.displayName.trim() || undefined,
          installScope,
          activeUserSid: data?.activeUserSid || undefined,
        });
        setQueuedFonts((prev) => prev.filter((item) => item.id !== q.id));
      } catch (err: any) {
        setUploadNotice(err?.message || (isEn ? `Failed to install ${q.file.name}` : `خطا در نصب فونت ${q.file.name}`));
        break;
      }
    }
    setInstallingQueueProgress(null);
  };

  // Installed Fonts Table Filters / Sort / Pagination
  const [fontSearch, setFontSearch] = useState('');
  const [fontScopeFilter, setFontScopeFilter] = useState<'all' | 'system' | 'user'>('all');
  const [fontFormatFilter, setFontFormatFilter] = useState<'all' | 'TrueType' | 'OpenType' | 'Collection' | 'Raster'>('all');
  const [fontSortBy, setFontSortBy] = useState<'name' | 'scope' | 'size'>('name');
  const [fontSortDir, setFontSortDir] = useState<'asc' | 'desc'>('asc');
  const [fontPage, setFontPage] = useState(1);
  const [confirmDeleteFontId, setConfirmDeleteFontId] = useState<string | null>(null);

  const filteredFonts = useMemo(() => {
    const list: any[] = Array.isArray(data?.fonts) ? data.fonts : [];
    const q = fontSearch.trim().toLowerCase();
    const out = list.filter((f) => {
      if (fontScopeFilter !== 'all' && f.scope !== fontScopeFilter) return false;
      if (fontFormatFilter !== 'all' && f.format !== fontFormatFilter) return false;
      if (q) {
        const hay = `${f.displayName} ${f.fileName} ${f.registryValueName} ${f.filePath}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    out.sort((a, b) => {
      let cmp = 0;
      if (fontSortBy === 'size') {
        cmp = (a.sizeBytes ?? -1) - (b.sizeBytes ?? -1);
      } else if (fontSortBy === 'scope') {
        cmp = String(a.scope || '').localeCompare(String(b.scope || ''));
      } else {
        cmp = String(a.displayName || '').localeCompare(String(b.displayName || ''));
      }
      return fontSortDir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [data?.fonts, fontSearch, fontScopeFilter, fontFormatFilter, fontSortBy, fontSortDir]);

  const totalFontPages = Math.max(1, Math.ceil(filteredFonts.length / FONT_PAGE_SIZE));
  const safeFontPage = Math.min(fontPage, totalFontPages);
  const pagedFonts = filteredFonts.slice((safeFontPage - 1) * FONT_PAGE_SIZE, safeFontPage * FONT_PAGE_SIZE);

  useEffect(() => {
    setFontPage(1);
  }, [fontSearch, fontScopeFilter, fontFormatFilter]);

  const handleExportFontsCsv = () => {
    if (!filteredFonts.length) return;
    const headers = ['DisplayName', 'FileName', 'Format', 'Scope', 'SizeBytes', 'Protected', 'Path'];
    const lines = [
      headers.join(','),
      ...filteredFonts.map((f) =>
        [
          escapeCsvCell(f.displayName),
          escapeCsvCell(f.fileName),
          escapeCsvCell(f.format),
          escapeCsvCell(f.scope),
          escapeCsvCell(f.sizeBytes ?? ''),
          escapeCsvCell(f.isProtected ? 'Yes' : 'No'),
          escapeCsvCell(f.filePath),
        ].join(',')
      ),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fonts_${data?.hostname || targetIp || 'endpoint'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatPositionBadge = (idx: number) => {
    if (idx === 0) return isEn ? '#1 Primary' : 'زبان اول (اصلی)';
    if (idx === 1) return isEn ? '#2 Secondary' : 'زبان دوم';
    if (idx === 2) return isEn ? '#3 Third' : 'زبان سوم';
    return isEn ? `#${idx + 1}` : `زبان ${idx + 1}`;
  };

  return (
    <div className="space-y-6">
      <div className={`rounded-2xl border p-5 space-y-6 ${surfaceBg}`}>
        {/* Top Tab Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={`text-sm font-bold flex items-center gap-2 ${textPrimary}`}>
              <Globe className="w-4 h-4 text-sky-500" />
              <span>
                {isEn
                  ? 'Region, Time, Languages & Fonts'
                  : 'تنظیمات ریجن، ساعت و تایم‌زون، زبان‌ها و فونت‌ها (Region & Fonts)'}
              </span>
              <FieldInfoTooltip
                isLightMode={isLightMode}
                isEn={isEn}
                title={isEn ? 'Region, Time & Fonts Control' : 'مدیریت ریجن، زمان و فونت'}
                whatIsIt={
                  isEn
                    ? 'Inspect and update the remote system clock, timezone, NTP synchronization, preferred input languages (1st, 2nd, 3rd), non-Unicode locale, and installed/uploaded fonts.'
                    : 'مشاهده و تنظیم ساعت و تاریخ، تایم‌زون، همگام‌سازی NTP، لیست زبان‌های ورودی (اول، دوم، سوم)، تنظیمات Non-Unicode و نصب/حذف فونت روی سیستم کاربر.'
                }
                whyNeeded={
                  isEn
                    ? 'Prevents Kerberos/AD clock-skew logon errors, adds missing Persian/secondary keyboards, fixes garbled Persian text via System Locale, and deploys corporate fonts to users.'
                    : 'برای رفع خطای اختلاف ساعت Kerberos/AD، اضافه کردن سریع زبان فارسی/دوم/سوم کیبورد، اصلاح فونت برنامه‌های غیر یونیکد و نصب مستقیم فونت برای کاربر.'
                }
                example={
                  isEn
                    ? 'Set Timezone to Iran Standard Time (UTC+03:30), set Languages to [en-US, fa-IR], and upload Vazirmatn.ttf system-wide.'
                    : 'تنظیم تایم‌زون روی Tehran، افزودن فارسی به عنوان زبان دوم و آپلود و نصب فونت روی سیستم کاربر.'
                }
              />
            </h2>
            <p className={`text-xs mt-0.5 ${textMuted}`}>
              {isEn
                ? 'Live endpoint clock & timezone editor, multi-language keyboard ordering (1st / 2nd / 3rd), System Locale, and drag-and-drop Font Installer.'
                : 'اصلاح مستقیم ساعت، تاریخ و تایم‌زون از کادر مرکزی، تعریف زبان دوم و سوم و مشاهده زبان‌های نصب‌شده، به همراه نصب فونت با آپلود روی سیستم کاربر.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {data && filteredFonts.length > 0 && (
              <button
                type="button"
                onClick={handleExportFontsCsv}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  isLightMode
                    ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <Download className="w-3.5 h-3.5 text-emerald-500" />
                <span>{isEn ? 'Export Fonts CSV' : 'خروجی CSV فونت‌ها'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading || !targetIp.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{isEn ? 'Refresh Region & Fonts' : 'بروزرسانی زمان، زبان و فونت'}</span>
            </button>
          </div>
        </div>

        {/* Error & Action Feedback Banners */}
        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-start gap-2.5 text-xs text-rose-500">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {actionError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-start justify-between gap-2.5 text-xs text-rose-500">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
            <button type="button" onClick={onClearActionBanner} className="opacity-70 hover:opacity-100 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {actionResult && (
          <div
            className={`rounded-xl border p-3.5 space-y-1 text-xs ${
              actionResult.success
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}
          >
            <div className="flex items-center justify-between gap-2 font-semibold">
              <div className="flex items-center gap-2">
                {actionResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{isEn ? actionResult.message : actionResult.messageFa}</span>
              </div>
              <button type="button" onClick={onClearActionBanner} className="opacity-70 hover:opacity-100 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Loading Empty State */}
        {loading && !data && (
          <div className="py-14 flex flex-col items-center justify-center gap-3 text-xs">
            <Loader2 className="w-7 h-7 animate-spin text-sky-500" />
            <span className={textMuted}>
              {isEn
                ? 'Reading endpoint clock, timezone, installed languages, and fonts...'
                : 'در حال خواندن ساعت، تاریخ، تایم‌زون، زبان‌ها و فونت‌های سیستم کاربر...'}
            </span>
          </div>
        )}

        {/* Empty / Not Yet Loaded State */}
        {!loading && !data && !error && (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
            <Globe className={`w-10 h-10 opacity-40 ${textMuted}`} />
            <div className={`text-sm font-semibold ${textPrimary}`}>
              {isEn ? 'Region, Time & Fonts Snapshot Ready' : 'مشاهده و تنظیم ساعت، تاریخ، تایم‌زون، زبان و فونت'}
            </div>
            <p className={`text-xs max-w-md ${textMuted}`}>
              {isEn
                ? 'Connect to the endpoint or click "Refresh Region & Fonts" above to inspect live time, languages, and installed fonts.'
                : 'برای نمایش بزرگ ساعت و تایم‌زون و مدیریت زبان‌ها و نصب فونت، ابتدا به سیستم متصل شوید یا روی «بروزرسانی زمان، زبان و فونت» کلیک کنید.'}
            </p>
          </div>
        )}

        {data && (
          <>
            {/* ================================================================= */}
            {/* 1. TOP-CENTER LARGE HERO CLOCK, DATE & TIMEZONE + INLINE FIXER    */}
            {/* ================================================================= */}
            <div
              className={`rounded-2xl border p-6 sm:p-8 flex flex-col items-center text-center gap-4 ${
                isLightMode
                  ? 'bg-gradient-to-b from-sky-50/90 via-white to-slate-50/70 border-sky-200/80'
                  : 'bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border-sky-500/30'
              }`}
            >
              {/* Host & Active Desktop User Indicator */}
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-medium ${
                    isLightMode
                      ? 'bg-white border-slate-200 text-slate-700'
                      : 'bg-slate-900 border-slate-700 text-slate-300'
                  }`}
                >
                  <Server className="w-3.5 h-3.5 text-sky-500" />
                  <span className="font-mono" dir="ltr">
                    {data.hostname || data.targetIp}
                  </span>
                </span>
                {data.activeUser && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-medium ${
                      isLightMode
                        ? 'bg-white border-slate-200 text-slate-700'
                        : 'bg-slate-900 border-slate-700 text-slate-300'
                    }`}
                  >
                    <User className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="font-mono" dir="ltr">
                      {data.activeUser}
                    </span>
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-medium ${
                    data.clock?.ntpEnabled
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {data.clock?.ntpEnabled
                      ? isEn
                        ? `NTP Sync On (${data.clock.ntpType || 'NTP'})`
                        : `همگام‌سازی خودکار NTP فعال`
                      : isEn
                      ? 'Manual Clock (NTP Off)'
                      : 'ساعت دستی (NTP غیرفعال)'}
                  </span>
                </span>
              </div>

              {/* Giant Centered Live Digital Clock */}
              <div className="space-y-1.5 py-1">
                <div
                  className={`text-5xl sm:text-6xl lg:text-7xl font-extrabold font-mono tabular-nums tracking-tight ${textPrimary}`}
                  dir="ltr"
                >
                  {liveEndpointClock?.timeStr || data.clock?.localTime || '--:--:--'}
                </div>

                {/* Large Centered Date (Gregorian + Persian Jalali when in Persian UI) */}
                <div className="flex flex-wrap items-center justify-center gap-2.5 text-base sm:text-lg font-semibold">
                  <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                    <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="font-mono tabular-nums" dir="ltr">
                      {liveEndpointClock?.dateStr || data.clock?.localDate}
                    </span>
                    {liveEndpointClock?.dayName && (
                      <span className={`text-sm font-medium ${textMuted}`}>({liveEndpointClock.dayName})</span>
                    )}
                  </span>
                  {!isEn && liveEndpointClock?.jalaliStr && (
                    <span className={`text-sm sm:text-base font-medium ${textMuted}`}>
                      • {liveEndpointClock.jalaliStr}
                    </span>
                  )}
                </div>

                {/* Large Centered Timezone Display */}
                <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
                  <div
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold ${
                      isLightMode
                        ? 'bg-white border-sky-200 text-slate-800 shadow-xs'
                        : 'bg-slate-900/90 border-slate-700 text-slate-100'
                    }`}
                  >
                    <Globe className="w-4 h-4 text-sky-500 shrink-0" />
                    <span dir="ltr">{data.clock?.timezoneDisplayName || data.clock?.timezoneId}</span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400" dir="ltr">
                      {formatUtcOffset(data.clock?.utcOffsetMinutes ?? 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Toolbar Right Inside the Centered Clock Card */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowClockEditor((v) => !v)}
                  disabled={!canExecuteActions}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                    showClockEditor
                      ? 'bg-sky-600 text-white'
                      : isLightMode
                      ? 'bg-sky-600 hover:bg-sky-500 text-white'
                      : 'bg-sky-600 hover:bg-sky-500 text-white'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {showClockEditor
                      ? isEn
                        ? 'Hide Time & Timezone Editor'
                        : 'بستن پنل ویرایش زمان و تایم‌زون'
                      : isEn
                      ? 'Fix Time, Date & Timezone Here'
                      : 'اصلاح ساعت، تاریخ و تایم‌زون از اینجا'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateDateTime({
                      operation: 'sync_ntp',
                      ntpServer: ntpServerInput.trim() || undefined,
                    })
                  }
                  disabled={!canExecuteActions || busyKey !== null}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                      : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {busyKey === 'dt:sync_ntp' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
                  )}
                  <span>{isEn ? 'Sync NTP Now' : 'همگام‌سازی فوری (NTP Sync)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateDateTime({
                      operation: 'toggle_ntp',
                      ntpEnabled: !data.clock?.ntpEnabled,
                      ntpServer: ntpServerInput.trim() || undefined,
                    })
                  }
                  disabled={!canExecuteActions || busyKey !== null}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                      : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {busyKey === 'dt:toggle_ntp' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {data.clock?.ntpEnabled
                      ? isEn
                        ? 'Disable Auto Time (NTP)'
                        : 'غیرفعال‌سازی ساعت خودکار (NTP)'
                      : isEn
                      ? 'Enable Auto Time (NTP)'
                      : 'فعال‌سازی ساعت خودکار (NTP)'}
                  </span>
                </button>
              </div>

              {/* Inline Clock, Date & Timezone Fixer Panel (Expanded directly inside Top-Center Card) */}
              {showClockEditor && (
                <div
                  className={`w-full max-w-4xl mt-2 rounded-xl border p-4 sm:p-5 text-start grid grid-cols-1 lg:grid-cols-2 gap-5 ${subCardBg}`}
                >
                  {/* Column A: Timezone Selector */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <label className={`text-xs font-bold flex items-center gap-1.5 ${textPrimary}`}>
                        <Globe className="w-3.5 h-3.5 text-sky-500" />
                        <span>{isEn ? 'Change System Timezone' : 'تغییر تایم‌زون سیستم (Timezone)'}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const tehran = (data.availableTimezones || []).find(
                            (z: any) =>
                              String(z.id || '').toLowerCase().includes('iran') ||
                              String(z.id || '').toLowerCase().includes('tehran')
                          );
                          if (tehran) setSelectedTzId(tehran.id);
                        }}
                        className="text-[11px] font-semibold text-sky-500 hover:underline cursor-pointer"
                      >
                        {isEn ? 'Quick Pick: Tehran (+03:30)' : 'انتخاب سریع تهران (+03:30)'}
                      </button>
                    </div>

                    <div className="relative">
                      <Search className={`w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 ${textMuted}`} />
                      <input
                        type="text"
                        value={tzFilter}
                        onChange={(e) => setTzFilter(e.target.value)}
                        placeholder={isEn ? 'Filter timezone (e.g. Tehran, UTC, Europe)...' : 'فیلتر تایم‌زون (مثلاً Tehran یا UTC)...'}
                        className={`w-full ps-8 pe-3 py-1.5 rounded-lg border text-xs ${inputBg}`}
                      />
                    </div>

                    <select
                      value={selectedTzId}
                      onChange={(e) => setSelectedTzId(e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border text-xs ${inputBg}`}
                      dir="ltr"
                    >
                      {filteredTimezones.map((tz: any) => (
                        <option key={tz.id} value={tz.id}>
                          {tz.displayName || tz.id} ({tz.id})
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={!selectedTzId || !canExecuteActions || busyKey !== null}
                      onClick={() =>
                        onUpdateDateTime({
                          operation: 'set_timezone',
                          timezoneId: selectedTzId,
                        })
                      }
                      className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      {busyKey === 'dt:set_timezone' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>{isEn ? 'Apply Timezone' : 'اعمال تایم‌زون انتخاب‌شده'}</span>
                    </button>
                  </div>

                  {/* Column B: Date, Time & Optional NTP Server */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <label className={`text-xs font-bold flex items-center gap-1.5 ${textPrimary}`}>
                        <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{isEn ? 'Set Manual Date & Time' : 'تنظیم دستی تاریخ و ساعت سیستم'}</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleSetBrowserNow}
                        className="text-[11px] font-semibold text-indigo-500 hover:underline cursor-pointer"
                      >
                        {isEn ? 'Fill Current Local Time' : 'درج زمان فعلی شما'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <span className={`block text-[11px] mb-1 ${textMuted}`}>
                          {isEn ? 'Date (YYYY-MM-DD)' : 'تاریخ میلادی'}
                        </span>
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono ${inputBg}`}
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <span className={`block text-[11px] mb-1 ${textMuted}`}>
                          {isEn ? 'Time (HH:MM:SS)' : 'ساعت'}
                        </span>
                        <input
                          type="time"
                          step={1}
                          value={editTime}
                          onChange={(e) => setEditTime(e.target.value)}
                          className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono ${inputBg}`}
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!editDate || !editTime || !canExecuteActions || busyKey !== null}
                      onClick={() =>
                        onUpdateDateTime({
                          operation: 'set_datetime',
                          localDate: editDate,
                          localTime: editTime,
                        })
                      }
                      className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      {busyKey === 'dt:set_datetime' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>{isEn ? 'Apply Date & Time' : 'ثبت تاریخ و ساعت روی سیستم'}</span>
                    </button>

                    <div className="pt-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={ntpServerInput}
                        onChange={(e) => setNtpServerInput(e.target.value)}
                        placeholder={isEn ? 'NTP Server (e.g. time.windows.com)' : 'سرور NTP (مثلاً pool.ntp.org)'}
                        className={`flex-1 px-3 py-1.5 rounded-lg border text-xs font-mono ${inputBg}`}
                        dir="ltr"
                      />
                      <button
                        type="button"
                        disabled={!canExecuteActions || busyKey !== null}
                        onClick={() =>
                          onUpdateDateTime({
                            operation: 'sync_ntp',
                            ntpServer: ntpServerInput.trim() || undefined,
                          })
                        }
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                      >
                        {isEn ? 'Set & Sync NTP' : 'تنظیم و سینک NTP'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ================================================================= */}
            {/* 2. LANGUAGES (1ST, 2ND, 3RD, INSTALLED MUI & NON-UNICODE LOCALE)  */}
            {/* ================================================================= */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              {/* Preferred Input Languages (Primary, 2nd, 3rd...) */}
              <div className={`xl:col-span-7 rounded-2xl border p-5 space-y-4 ${subCardBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className={`text-sm font-bold flex items-center gap-2 ${textPrimary}`}>
                      <Keyboard className="w-4 h-4 text-sky-500" />
                      <span>
                        {isEn
                          ? 'Preferred Input Languages (1st, 2nd, 3rd...)'
                          : 'ترتیب زبان‌های کیبورد و ورودی (زبان اول، دوم، سوم...)'}
                      </span>
                    </h3>
                    <p className={`text-xs mt-0.5 ${textMuted}`}>
                      {data.activeUserSid
                        ? isEn
                          ? `Targets active desktop user hive (${data.activeUser || data.activeUserSid}) + session list.`
                          : `اعمال مستقیم روی پروفایل کاربر فعال دسکتاپ (${data.activeUser || data.activeUserSid})`
                        : isEn
                        ? 'Targets connected session user language profile.'
                        : 'اعمال روی پروفایل کاربر متصل‌شده'}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={!canExecuteActions || !languagesDirty || busyKey !== null}
                    onClick={() =>
                      onUpdateLanguages({
                        operation: 'set_languages',
                        languageTags: draftLanguages,
                        activeUserSid: data.activeUserSid || undefined,
                      })
                    }
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-45 ${
                      languagesDirty
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : isLightMode
                        ? 'bg-slate-200 text-slate-600'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {busyKey === 'lang:set_languages' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>{isEn ? 'Save Language Order' : 'ذخیره و اعمال زبان‌ها'}</span>
                  </button>
                </div>

                {/* Ordered Language Rows */}
                <div className="space-y-2">
                  {draftLanguages.length === 0 ? (
                    <div className={`text-xs py-4 text-center ${textMuted}`}>
                      {isEn ? 'No user languages reported.' : 'هیچ زبانی در پروفایل کاربر یافت نشد.'}
                    </div>
                  ) : (
                    draftLanguages.map((tag, idx) => {
                      const info = resolveLangNames(tag);
                      return (
                        <div
                          key={`${tag}-${idx}`}
                          className={`rounded-xl border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 ${
                            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold shrink-0 ${
                                idx === 0
                                  ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                                  : idx === 1
                                  ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {formatPositionBadge(idx)}
                            </span>
                            <div className="min-w-0">
                              <div className={`text-xs font-semibold truncate ${textPrimary}`}>
                                {info.englishName}
                                {info.nativeName && info.nativeName !== info.englishName ? (
                                  <span className={`ms-1.5 font-normal ${textMuted}`}>({info.nativeName})</span>
                                ) : null}
                              </div>
                              <div className={`text-[11px] font-mono ${textMuted}`} dir="ltr">
                                {tag}
                                {info.tips.length > 0 ? ` • KLID: ${info.tips.join(', ')}` : ''}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleMoveLanguage(idx, -1)}
                              disabled={idx === 0 || !canExecuteActions}
                              title={isEn ? 'Move up' : 'انتقال به بالا'}
                              className={`p-1.5 rounded-lg border text-xs transition cursor-pointer disabled:opacity-35 ${
                                isLightMode
                                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveLanguage(idx, 1)}
                              disabled={idx === draftLanguages.length - 1 || !canExecuteActions}
                              title={isEn ? 'Move down' : 'انتقال به پایین'}
                              className={`p-1.5 rounded-lg border text-xs transition cursor-pointer disabled:opacity-35 ${
                                isLightMode
                                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveLanguage(idx)}
                              disabled={draftLanguages.length <= 1 || !canExecuteActions}
                              title={isEn ? 'Remove language' : 'حذف زبان'}
                              className="p-1.5 rounded-lg border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-35"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Add 2nd / 3rd / Additional Language */}
                <div
                  className={`rounded-xl border p-3.5 space-y-2.5 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <div className={`text-xs font-semibold ${textPrimary}`}>
                    {isEn ? 'Add 2nd / 3rd / Extra Language' : 'افزودن زبان دوم، سوم یا زبان جدید'}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={addLangPreset}
                      onChange={(e) => setAddLangPreset(e.target.value)}
                      className={`flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border text-xs ${inputBg}`}
                    >
                      {CURATED_LANGUAGES.map((lang) => (
                        <option key={lang.tag} value={lang.tag}>
                          {isEn ? `${lang.labelEn} (${lang.tag})` : lang.labelFa}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={
                        !canExecuteActions ||
                        draftLanguages.length >= 8 ||
                        draftLanguages.some((t) => t.toLowerCase() === addLangPreset.toLowerCase())
                      }
                      onClick={() => handleAddLanguageToDraft(addLangPreset)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-45 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Add Selected' : 'افزودن به لیست'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customLangTag}
                      onChange={(e) => setCustomLangTag(e.target.value)}
                      placeholder={isEn ? 'Or enter custom tag (e.g. nl-NL, sv-SE)...' : 'یا کد دلخواه زبان (مثلاً nl-NL یا ku-Arab-IQ)...'}
                      className={`flex-1 px-3 py-1.5 rounded-lg border text-xs font-mono ${inputBg}`}
                      dir="ltr"
                    />
                    <button
                      type="button"
                      disabled={
                        !canExecuteActions ||
                        !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,3}$/.test(customLangTag.trim()) ||
                        draftLanguages.some((t) => t.toLowerCase() === customLangTag.trim().toLowerCase())
                      }
                      onClick={() => handleAddLanguageToDraft(customLangTag)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer disabled:opacity-45 whitespace-nowrap ${
                        isLightMode
                          ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      {isEn ? 'Add Custom' : 'افزودن کد دلخواه'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Installed OS Display Languages & Non-Unicode Regional Locale */}
              <div className={`xl:col-span-5 rounded-2xl border p-5 space-y-4 ${subCardBg}`}>
                <h3 className={`text-sm font-bold flex items-center gap-2 ${textPrimary}`}>
                  <Languages className="w-4 h-4 text-indigo-500" />
                  <span>
                    {isEn ? 'Installed OS Languages & System Locale' : 'زبان‌های نصب‌شده ویندوز و تنظیمات ریجن'}
                  </span>
                </h3>

                {/* Installed OS MUI / Display Languages */}
                <div className="space-y-1.5">
                  <div className={`text-xs font-semibold ${textMuted}`}>
                    {isEn
                      ? `Installed OS Display / MUI Languages (${data.region?.installedMuiLanguages?.length ?? 0})`
                      : `پکیج‌های زبان نصب‌شده روی سیستم عامل (${data.region?.installedMuiLanguages?.length ?? 0})`}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(data.region?.installedMuiLanguages || []).length > 0 ? (
                      data.region.installedMuiLanguages.map((lang: string) => (
                        <span
                          key={lang}
                          className={`px-2.5 py-1 rounded-md border text-xs font-mono font-semibold ${
                            isLightMode
                              ? 'bg-white border-slate-200 text-slate-800'
                              : 'bg-slate-900 border-slate-700 text-slate-200'
                          }`}
                          dir="ltr"
                        >
                          {lang}
                        </span>
                      ))
                    ) : (
                      <span className={`text-xs ${textMuted}`}>—</span>
                    )}
                  </div>
                </div>

                {/* Regional Format / Non-Unicode System Locale / Country */}
                <div
                  className={`rounded-xl border p-3.5 space-y-3 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                      {isEn
                        ? 'Language for Non-Unicode Programs (System Locale)'
                        : 'زبان برنامه‌های غیر یونیکد (System Locale — رفع حروف ناخوانا)'}
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        value={draftSystemLocale}
                        onChange={(e) => setDraftSystemLocale(e.target.value)}
                        className={`flex-1 px-2.5 py-1.5 rounded-lg border text-xs ${inputBg}`}
                      >
                        {draftSystemLocale &&
                          !CURATED_LANGUAGES.some((c) => c.tag.toLowerCase() === draftSystemLocale.toLowerCase()) && (
                            <option value={draftSystemLocale}>{draftSystemLocale}</option>
                          )}
                        {CURATED_LANGUAGES.map((c) => (
                          <option key={`sys-${c.tag}`} value={c.tag}>
                            {isEn ? `${c.labelEn} (${c.tag})` : c.labelFa}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                      {isEn ? 'Regional Format (Dates & Numbers Culture)' : 'فرمت منطقه‌ای تاریخ و اعداد (Culture)'}
                    </label>
                    <select
                      value={draftCulture}
                      onChange={(e) => setDraftCulture(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs ${inputBg}`}
                    >
                      {draftCulture &&
                        !CURATED_LANGUAGES.some((c) => c.tag.toLowerCase() === draftCulture.toLowerCase()) && (
                          <option value={draftCulture}>{draftCulture}</option>
                        )}
                      {CURATED_LANGUAGES.map((c) => (
                        <option key={`cul-${c.tag}`} value={c.tag}>
                          {isEn ? `${c.labelEn} (${c.tag})` : c.labelFa}
                        </option>
                      ))}
                    </select>
                  </div>

                  {data.osFamily === 'windows' && (
                    <div>
                      <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                        {isEn ? 'Country / Home Location' : 'کشور / موقعیت مکانی (Country / Region)'}
                      </label>
                      <select
                        value={draftGeoId}
                        onChange={(e) => setDraftGeoId(e.target.value)}
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs ${inputBg}`}
                      >
                        <option value="">
                          {data.region?.homeLocationName
                            ? `${data.region.homeLocationName} (${data.region.homeLocationGeoId})`
                            : isEn
                            ? '-- Keep Unchanged --'
                            : '-- بدون تغییر --'}
                        </option>
                        {CURATED_LOCATIONS.map((loc) => (
                          <option key={loc.geoId} value={String(loc.geoId)}>
                            {isEn ? loc.labelEn : loc.labelFa}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!canExecuteActions || busyKey !== null}
                    onClick={() =>
                      onUpdateLanguages({
                        operation: 'set_locale',
                        activeUserSid: data.activeUserSid || undefined,
                        systemLocale: draftSystemLocale || undefined,
                        currentCulture: draftCulture || undefined,
                        homeLocationGeoId: draftGeoId ? Number(draftGeoId) : null,
                      })
                    }
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    {busyKey === 'lang:set_locale' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>{isEn ? 'Apply System Locale & Region' : 'ثبت تنظیمات ریجن و System Locale'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ================================================================= */}
            {/* 3. FONTS MANAGEMENT & UPLOAD INSTALLER                            */}
            {/* ================================================================= */}
            <div className={`rounded-2xl border p-5 space-y-5 ${subCardBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className={`text-sm font-bold flex items-center gap-2 ${textPrimary}`}>
                    <Type className="w-4 h-4 text-sky-500" />
                    <span>
                      {isEn ? 'Fonts Management & Remote Font Installer' : 'مدیریت فونت‌ها و نصب فونت با آپلود روی سیستم کاربر'}
                    </span>
                  </h3>
                  <p className={`text-xs mt-0.5 ${textMuted}`}>
                    {isEn
                      ? 'Upload .ttf, .otf, .ttc, or .fon files directly onto the target computer and register them immediately for Office, browsers, and desktop apps.'
                      : 'فایل فونت (.ttf، .otf، .ttc، .fon) را آپلود و مستقیم روی سیستم کاربر نصب کنید تا بلافاصله در ویندوز، آفیس و مرورگرها قابل استفاده باشد.'}
                  </p>
                </div>

                {/* Font Summary Strip */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`px-2.5 py-1 rounded-lg border font-semibold ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-900 border-slate-700 text-slate-200'
                    }`}
                  >
                    {isEn ? 'Total:' : 'کل:'}{' '}
                    <span className="font-mono text-sky-500">{data.summary?.totalFonts ?? 0}</span>
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-lg border font-semibold ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-900 border-slate-700 text-slate-200'
                    }`}
                  >
                    {isEn ? 'System:' : 'سیستمی:'}{' '}
                    <span className="font-mono text-indigo-500">{data.summary?.systemFonts ?? 0}</span>
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-lg border font-semibold ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-900 border-slate-700 text-slate-200'
                    }`}
                  >
                    {isEn ? 'User Profile:' : 'پروفایل کاربر:'}{' '}
                    <span className="font-mono text-emerald-500">{data.summary?.userFonts ?? 0}</span>
                  </span>
                </div>
              </div>

              {/* Drag-and-Drop Font Upload & Install Box */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFonts(true);
                }}
                onDragLeave={() => setIsDraggingFonts(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFonts(false);
                  acceptFontFiles(e.dataTransfer.files);
                }}
                className={`rounded-xl border-2 border-dashed p-5 transition ${
                  isDraggingFonts
                    ? 'border-sky-500 bg-sky-500/10'
                    : isLightMode
                    ? 'border-slate-300 bg-white'
                    : 'border-slate-700 bg-slate-900/70'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".ttf,.otf,.ttc,.fon"
                  onChange={(e) => {
                    acceptFontFiles(e.target.files);
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-500 flex items-center justify-center shrink-0">
                      <HardDriveUpload className="w-5 h-5" />
                    </div>
                    <div>
                      <div className={`text-xs font-bold ${textPrimary}`}>
                        {isEn
                          ? 'Drag & drop font files here, or browse to upload'
                          : 'فایل‌های فونت را اینجا رها کنید یا از سیستم خود انتخاب نمایید'}
                      </div>
                      <div className={`text-[11px] mt-0.5 ${textMuted}`}>
                        {isEn
                          ? 'Supports .ttf, .otf, .ttc, .fon (max 15 MB per file) — auto-registered & broadcast to active apps.'
                          : 'پشتیبانی از .ttf، .otf، .ttc و .fon (حداکثر ۱۵ مگابایت برای هر فایل) با رجیستر و فعال‌سازی آنی روی سیستم کاربر.'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      value={installScope}
                      onChange={(e) => setInstallScope(e.target.value === 'user' ? 'user' : 'system')}
                      className={`px-3 py-2 rounded-lg border text-xs font-medium ${inputBg}`}
                    >
                      <option value="system">
                        {isEn ? 'Install for All Users (System Fonts)' : 'نصب برای همه کاربران سیستم (توصیه‌شده)'}
                      </option>
                      <option value="user">
                        {isEn
                          ? `Install for Active User Only${data.activeUser ? ` (${data.activeUser})` : ''}`
                          : `نصب فقط برای کاربر فعلی${data.activeUser ? ` (${data.activeUser})` : ''}`}
                      </option>
                    </select>

                    <button
                      type="button"
                      disabled={!canExecuteActions}
                      onClick={() => fileInputRef.current?.click()}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold cursor-pointer disabled:opacity-50 ${
                        isLightMode
                          ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5 text-sky-500" />
                      <span>{isEn ? 'Choose Font File(s)' : 'انتخاب فایل فونت'}</span>
                    </button>
                  </div>
                </div>

                {uploadNotice && (
                  <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                    {uploadNotice}
                  </div>
                )}

                {/* Queued Fonts List */}
                {queuedFonts.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`text-xs font-bold ${textPrimary}`}>
                        {isEn
                          ? `Ready to Install (${queuedFonts.length} font file${queuedFonts.length > 1 ? 's' : ''})`
                          : `آماده نصب روی سیستم کاربر (${queuedFonts.length} فایل)`}
                      </span>
                      <button
                        type="button"
                        disabled={!canExecuteActions || busyKey !== null || Boolean(installingQueueProgress)}
                        onClick={handleInstallQueuedFonts}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                      >
                        {installingQueueProgress ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>
                              {isEn
                                ? `Installing ${installingQueueProgress.done + 1}/${installingQueueProgress.total}: ${installingQueueProgress.currentName}`
                                : `در حال نصب ${installingQueueProgress.done + 1} از ${installingQueueProgress.total}: ${installingQueueProgress.currentName}`}
                            </span>
                          </>
                        ) : (
                          <>
                            <HardDriveUpload className="w-3.5 h-3.5" />
                            <span>{isEn ? 'Upload & Install Font(s)' : 'آپلود و نصب فونت‌ها روی سیستم'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {queuedFonts.map((q) => (
                        <div
                          key={q.id}
                          className={`rounded-lg border px-3 py-2 flex items-center justify-between gap-2 ${
                            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <FileType2 className="w-4 h-4 text-sky-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <input
                                type="text"
                                value={q.displayName}
                                onChange={(e) =>
                                  setQueuedFonts((prev) =>
                                    prev.map((item) =>
                                      item.id === q.id ? { ...item, displayName: e.target.value } : item
                                    )
                                  )
                                }
                                placeholder={isEn ? 'Font Display Name' : 'نام نمایشی فونت'}
                                className={`w-full px-2 py-0.5 rounded border text-xs font-medium ${inputBg}`}
                              />
                              <div className={`text-[11px] font-mono mt-0.5 truncate ${textMuted}`} dir="ltr">
                                {q.file.name} • {formatBytes(q.sizeBytes, isEn)}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setQueuedFonts((prev) => prev.filter((item) => item.id !== q.id))}
                            className="p-1 rounded text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                            title={isEn ? 'Remove from queue' : 'حذف از صف'}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Installed Fonts Search & Filter Controls */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className={`w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 ${textMuted}`} />
                  <input
                    type="text"
                    value={fontSearch}
                    onChange={(e) => setFontSearch(e.target.value)}
                    placeholder={
                      isEn ? 'Search installed fonts by name or file...' : 'جستجوی فونت نصب‌شده بر اساس نام یا فایل...'
                    }
                    className={`w-full ps-8 pe-3 py-2 rounded-lg border text-xs ${inputBg}`}
                  />
                </div>

                <select
                  value={fontScopeFilter}
                  onChange={(e) => setFontScopeFilter(e.target.value as any)}
                  className={`px-3 py-2 rounded-lg border text-xs ${inputBg}`}
                >
                  <option value="all">{isEn ? 'All Scopes' : 'همه فونت‌ها (سیستمی و کاربر)'}</option>
                  <option value="system">{isEn ? 'System Fonts Only' : 'فقط فونت‌های سیستمی'}</option>
                  <option value="user">{isEn ? 'User Profile Fonts Only' : 'فقط فونت‌های پروفایل کاربر'}</option>
                </select>

                <select
                  value={fontFormatFilter}
                  onChange={(e) => setFontFormatFilter(e.target.value as any)}
                  className={`px-3 py-2 rounded-lg border text-xs ${inputBg}`}
                >
                  <option value="all">{isEn ? 'All Formats' : 'همه فرمت‌ها'}</option>
                  <option value="TrueType">TrueType (.ttf)</option>
                  <option value="OpenType">OpenType (.otf)</option>
                  <option value="Collection">Collection (.ttc)</option>
                  <option value="Raster">Raster (.fon)</option>
                </select>

                <select
                  value={`${fontSortBy}:${fontSortDir}`}
                  onChange={(e) => {
                    const [sb, sd] = e.target.value.split(':') as any;
                    setFontSortBy(sb);
                    setFontSortDir(sd);
                  }}
                  className={`px-3 py-2 rounded-lg border text-xs ${inputBg}`}
                >
                  <option value="name:asc">{isEn ? 'Name (A-Z)' : 'مرتب‌سازی: نام (A-Z)'}</option>
                  <option value="name:desc">{isEn ? 'Name (Z-A)' : 'مرتب‌سازی: نام (Z-A)'}</option>
                  <option value="size:desc">{isEn ? 'Largest Size' : 'بیشترین حجم'}</option>
                  <option value="scope:desc">{isEn ? 'User Fonts First' : 'فونت‌های کاربر ابتدا'}</option>
                </select>
              </div>

              {/* Installed Fonts Table */}
              <div
                className={`overflow-x-auto rounded-xl border ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                }`}
              >
                <table className="w-full text-xs">
                  <thead>
                    <tr
                      className={`border-b text-[11px] uppercase tracking-wider ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-200 text-slate-500'
                          : 'bg-slate-950/70 border-slate-800 text-slate-400'
                      }`}
                    >
                      <th className="py-2.5 px-3 text-start">{isEn ? 'Font Name' : 'نام فونت'}</th>
                      <th className="py-2.5 px-3 text-start">{isEn ? 'File Name' : 'نام فایل'}</th>
                      <th className="py-2.5 px-3 text-start">{isEn ? 'Format' : 'فرمت'}</th>
                      <th className="py-2.5 px-3 text-start">{isEn ? 'Scope' : 'محدوده نصب'}</th>
                      <th className="py-2.5 px-3 text-start">{isEn ? 'Size' : 'حجم'}</th>
                      <th className="py-2.5 px-3 text-end">{isEn ? 'Action' : 'عملیات'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/80">
                    {pagedFonts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className={`py-8 text-center ${textMuted}`}>
                          {isEn ? 'No fonts match the current filters.' : 'هیچ فونتی با فیلتر فعلی یافت نشد.'}
                        </td>
                      </tr>
                    ) : (
                      pagedFonts.map((font: any) => {
                        const rowBusy = busyKey === `font:del:${font.id}`;
                        const isConfirming = confirmDeleteFontId === font.id;
                        return (
                          <tr
                            key={font.id}
                            className={isLightMode ? 'hover:bg-slate-50/90' : 'hover:bg-slate-800/40'}
                          >
                            <td className="py-2.5 px-3 max-w-[260px]">
                              <div className="flex items-center gap-1.5">
                                <span className={`font-semibold truncate ${textPrimary}`}>{font.displayName}</span>
                                {font.isProtected && (
                                  <span
                                    title={isEn ? font.protectionReason : font.protectionReasonFa}
                                    className="inline-flex items-center text-amber-500 shrink-0"
                                  >
                                    <Lock className="w-3 h-3" />
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className={`py-2.5 px-3 font-mono whitespace-nowrap ${textMuted}`} dir="ltr">
                              {font.fileName}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                  font.format === 'OpenType'
                                    ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                                    : font.format === 'TrueType'
                                    ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                                    : 'bg-slate-500/15 text-slate-500'
                                }`}
                              >
                                {font.format}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {font.scope === 'user' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">
                                  <User className="w-3 h-3" />
                                  <span>{isEn ? 'User' : 'کاربر'}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-500/15 text-slate-600 dark:text-slate-300 text-[11px] font-medium">
                                  <Shield className="w-3 h-3" />
                                  <span>{isEn ? 'System' : 'سیستم'}</span>
                                </span>
                              )}
                            </td>
                            <td className={`py-2.5 px-3 font-mono tabular-nums whitespace-nowrap ${textMuted}`} dir="ltr">
                              {formatBytes(font.sizeBytes, isEn)}
                            </td>
                            <td className="py-2.5 px-3 text-end whitespace-nowrap">
                              {font.isProtected ? (
                                <span
                                  title={isEn ? font.protectionReason : font.protectionReasonFa}
                                  className={`inline-flex items-center gap-1 text-[11px] font-medium ${textMuted}`}
                                >
                                  <Lock className="w-3 h-3 text-amber-500" />
                                  <span>{isEn ? 'Protected' : 'محافظت‌شده'}</span>
                                </span>
                              ) : isConfirming ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={rowBusy || !canExecuteActions}
                                    onClick={async () => {
                                      setConfirmDeleteFontId(null);
                                      await onDeleteFont(font);
                                    }}
                                    className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold cursor-pointer"
                                  >
                                    {isEn ? 'Confirm' : 'تایید حذف'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteFontId(null)}
                                    className={`px-2 py-1 rounded border text-[11px] cursor-pointer ${
                                      isLightMode
                                        ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                                        : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                                    }`}
                                  >
                                    {isEn ? 'Cancel' : 'انصراف'}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={rowBusy || busyKey !== null || !canExecuteActions}
                                  onClick={() => setConfirmDeleteFontId(font.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 text-[11px] font-semibold cursor-pointer disabled:opacity-45"
                                >
                                  {rowBusy ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3 h-3" />
                                  )}
                                  <span>{isEn ? 'Uninstall' : 'حذف فونت'}</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Fonts Pagination Footer */}
              {filteredFonts.length > FONT_PAGE_SIZE && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className={textMuted}>
                    {isEn
                      ? `Showing ${(safeFontPage - 1) * FONT_PAGE_SIZE + 1}–${Math.min(
                          safeFontPage * FONT_PAGE_SIZE,
                          filteredFonts.length
                        )} of ${filteredFonts.length} fonts`
                      : `نمایش ${(safeFontPage - 1) * FONT_PAGE_SIZE + 1} تا ${Math.min(
                          safeFontPage * FONT_PAGE_SIZE,
                          filteredFonts.length
                        )} از ${filteredFonts.length} فونت`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={safeFontPage <= 1}
                      onClick={() => setFontPage((p) => Math.max(1, p - 1))}
                      className={`p-1.5 rounded-lg border cursor-pointer disabled:opacity-40 ${
                        isLightMode ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-900'
                      }`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className={`px-2 font-mono ${textPrimary}`}>
                      {safeFontPage} / {totalFontPages}
                    </span>
                    <button
                      type="button"
                      disabled={safeFontPage >= totalFontPages}
                      onClick={() => setFontPage((p) => Math.min(totalFontPages, p + 1))}
                      className={`p-1.5 rounded-lg border cursor-pointer disabled:opacity-40 ${
                        isLightMode ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-900'
                      }`}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
