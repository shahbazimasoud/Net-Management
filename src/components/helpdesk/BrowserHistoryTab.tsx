import React, { useMemo, useState } from 'react';
import {
  Globe,
  RefreshCw,
  Loader2,
  Search,
  Download,
  FileSpreadsheet,
  FileCode2,
  AlertTriangle,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  Clock,
  User,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Lock,
  Filter,
  X,
  Compass,
  Layers,
  BarChart3,
  Keyboard,
} from 'lucide-react';
import {
  HelpdeskBrowserHistoryEntry,
  HelpdeskBrowserHistoryResult,
  HelpdeskBrowserVendor,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface BrowserHistoryTabProps {
  isLightMode: boolean;
  isEn: boolean;
  targetIp: string;
  hasCredentials: boolean;
  canViewBrowserHistory: boolean;
  data: HelpdeskBrowserHistoryResult | null;
  loading: boolean;
  error: string | null;
  hoursBack: number;
  onChangeHoursBack: (hours: number) => void;
  onFetchHistory: (overrideHoursBack?: number) => void;
}

const PAGE_SIZE = 50;

function escapeHtmlSafe(val: any): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function csvSafeCell(val: any): string {
  let s = String(val ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function getBrowserBadgeColors(browser: HelpdeskBrowserVendor, isLightMode: boolean): string {
  switch (browser) {
    case 'chrome':
      return isLightMode
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'edge':
      return isLightMode
        ? 'bg-sky-50 text-sky-800 border-sky-200'
        : 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    case 'firefox':
      return isLightMode
        ? 'bg-orange-50 text-orange-800 border-orange-200'
        : 'bg-orange-500/15 text-orange-300 border-orange-500/30';
    case 'brave':
      return isLightMode
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'opera':
      return isLightMode
        ? 'bg-rose-50 text-rose-800 border-rose-200'
        : 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    case 'vivaldi':
      return isLightMode
        ? 'bg-red-50 text-red-800 border-red-200'
        : 'bg-red-500/15 text-red-300 border-red-500/30';
    case 'yandex':
      return isLightMode
        ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
        : 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30';
    default:
      return isLightMode
        ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
        : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
  }
}

function getBrowserBarColor(browser: HelpdeskBrowserVendor): string {
  switch (browser) {
    case 'chrome':
      return 'bg-emerald-500';
    case 'edge':
      return 'bg-sky-500';
    case 'firefox':
      return 'bg-orange-500';
    case 'brave':
      return 'bg-amber-500';
    case 'opera':
      return 'bg-rose-500';
    case 'vivaldi':
      return 'bg-red-500';
    case 'yandex':
      return 'bg-yellow-500';
    default:
      return 'bg-indigo-500';
  }
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export const BrowserHistoryTab: React.FC<BrowserHistoryTabProps> = ({
  isLightMode,
  isEn,
  targetIp,
  hasCredentials,
  canViewBrowserHistory,
  data,
  loading,
  error,
  hoursBack,
  onChangeHoursBack,
  onFetchHistory,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [browserFilter, setBrowserFilter] = useState<string>('all');
  const [osUserFilter, setOsUserFilter] = useState<string>('all');
  const [transitionFilter, setTransitionFilter] = useState<string>('all');
  const [domainFilter, setDomainFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'visitedAt' | 'domain' | 'browserLabel' | 'visitCount' | 'typedCount'>(
    'visitedAt'
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showProfilePaths, setShowProfilePaths] = useState(false);

  const surfaceBg = isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800';
  const subSurfaceBg = isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800';
  const textPrimary = isLightMode ? 'text-slate-900' : 'text-slate-100';
  const textMuted = isLightMode ? 'text-slate-600' : 'text-slate-400';
  const inputCls = isLightMode
    ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-teal-500'
    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-teal-500';

  const formatTimestamp = (iso: string | null | undefined) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    try {
      return d.toLocaleString(isEn ? 'en-US' : 'fa-IR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return d.toISOString().replace('T', ' ').slice(0, 19);
    }
  };

  const transitionLabel = (t: HelpdeskBrowserHistoryEntry['transitionType']) => {
    switch (t) {
      case 'typed':
        return isEn ? 'Typed URL' : 'تایپ مستقیم';
      case 'link':
        return isEn ? 'Link Click' : 'کلیک لینک';
      case 'bookmark':
        return isEn ? 'Bookmark' : 'بوکمارک';
      case 'reload':
        return isEn ? 'Reload' : 'رفرش صفحه';
      case 'redirect':
        return isEn ? 'Redirect' : 'ریدایرکت';
      case 'generated':
        return isEn ? 'Omnibox Search' : 'جستجو/پیشنهاد';
      case 'form_submit':
        return isEn ? 'Form Submit' : 'ارسال فرم';
      default:
        return isEn ? 'Other' : 'سایر';
    }
  };

  const timeframeLabel = (h: number) => {
    if (h === 0) return isEn ? 'All Available History' : 'کل تاریخچه موجود';
    if (h === 24) return isEn ? 'Last 24 Hours' : '۲۴ ساعت اخیر';
    if (h === 168) return isEn ? 'Last 7 Days' : '۷ روز اخیر';
    if (h === 720) return isEn ? 'Last 30 Days' : '۳۰ روز اخیر';
    if (h === 2160) return isEn ? 'Last 90 Days' : '۹۰ روز اخیر';
    return isEn ? `Last ${h} Hours` : `${h} ساعت اخیر`;
  };

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      window.setTimeout(() => setCopiedId((prev) => (prev === key ? null : prev)), 1600);
    } catch {}
  };

  const osUsersList = useMemo(() => {
    const set = new Set<string>();
    (data?.profiles || []).forEach((p) => {
      if (p.osUser) set.add(p.osUser);
    });
    (data?.entries || []).forEach((e) => {
      if (e.osUser) set.add(e.osUser);
    });
    return Array.from(set).sort();
  }, [data]);

  const browsersList = useMemo(() => {
    const map = new Map<string, string>();
    (data?.entries || []).forEach((e) => {
      map.set(e.browser, e.browserLabel);
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [data]);

  const filteredEntries = useMemo(() => {
    const list = data?.entries || [];
    const q = searchQuery.trim().toLowerCase();
    const dom = domainFilter.trim().toLowerCase();

    const filtered = list.filter((e) => {
      if (browserFilter !== 'all' && e.browser !== browserFilter) return false;
      if (osUserFilter !== 'all' && e.osUser !== osUserFilter) return false;
      if (transitionFilter !== 'all' && e.transitionType !== transitionFilter) return false;
      if (dom && e.domain.toLowerCase() !== dom) return false;
      if (q) {
        const hay = `${e.title} ${e.url} ${e.domain} ${e.osUser} ${e.profileName} ${e.browserLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'visitedAt') {
        cmp = a.visitedAt.localeCompare(b.visitedAt);
      } else if (sortBy === 'domain') {
        cmp = a.domain.localeCompare(b.domain);
      } else if (sortBy === 'browserLabel') {
        cmp = a.browserLabel.localeCompare(b.browserLabel);
      } else if (sortBy === 'visitCount') {
        cmp = a.visitCount - b.visitCount;
      } else if (sortBy === 'typedCount') {
        cmp = a.typedCount - b.typedCount;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [data, searchQuery, browserFilter, osUserFilter, transitionFilter, domainFilter, sortBy, sortDir]);

  const filteredAnalytics = useMemo(() => {
    const domainCounts = new Map<
      string,
      { domain: string; entries: number; visits: number; browsers: Set<string>; lastVisitedAt: string }
    >();
    const browserCounts = new Map<
      HelpdeskBrowserVendor,
      { browser: HelpdeskBrowserVendor; browserLabel: string; entries: number; domains: Set<string> }
    >();
    let typedTotal = 0;

    for (const e of filteredEntries) {
      if (e.transitionType === 'typed' || e.typedCount > 0) typedTotal++;
      const d = domainCounts.get(e.domain) || {
        domain: e.domain,
        entries: 0,
        visits: 0,
        browsers: new Set<string>(),
        lastVisitedAt: e.visitedAt,
      };
      d.entries += 1;
      d.visits += Math.max(1, e.visitCount);
      d.browsers.add(e.browserLabel);
      if (e.visitedAt > d.lastVisitedAt) d.lastVisitedAt = e.visitedAt;
      domainCounts.set(e.domain, d);

      const b = browserCounts.get(e.browser) || {
        browser: e.browser,
        browserLabel: e.browserLabel,
        entries: 0,
        domains: new Set<string>(),
      };
      b.entries += 1;
      b.domains.add(e.domain);
      browserCounts.set(e.browser, b);
    }

    const topDomains = Array.from(domainCounts.values())
      .sort((a, b) => b.entries - a.entries || b.visits - a.visits)
      .slice(0, 15)
      .map((d) => ({
        domain: d.domain,
        entries: d.entries,
        visits: d.visits,
        browsers: Array.from(d.browsers),
        lastVisitedAt: d.lastVisitedAt,
      }));

    const browsers = Array.from(browserCounts.values())
      .sort((a, b) => b.entries - a.entries)
      .map((b) => ({
        browser: b.browser,
        browserLabel: b.browserLabel,
        entries: b.entries,
        uniqueDomains: b.domains.size,
      }));

    return {
      uniqueDomains: domainCounts.size,
      typedTotal,
      topDomains,
      browsers,
    };
  }, [filteredEntries]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageEntries = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredEntries.slice(start, start + PAGE_SIZE);
  }, [filteredEntries, safePage]);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'domain' || col === 'browserLabel' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const handleExportExcel = () => {
    if (!data) return;
    const hostLabel = (data.hostname || data.targetIp || 'endpoint').replace(/[^a-zA-Z0-9._-]/g, '_');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const headers = isEn
      ? [
          'Visited At (Local)',
          'Visited At (UTC ISO)',
          'OS User',
          'Browser',
          'Profile',
          'Domain',
          'Page Title',
          'URL',
          'Navigation Type',
          'Visit Count',
          'Typed Count',
          'Scheme',
        ]
      : [
          'زمان بازدید (محلی)',
          'زمان بازدید (UTC ISO)',
          'کاربر سیستم',
          'مرورگر',
          'پروفایل',
          'دامنه',
          'عنوان صفحه',
          'آدرس کامل (URL)',
          'نوع دسترسی',
          'تعداد کل بازدید',
          'تعداد تایپ مستقیم',
          'پروتکل (Scheme)',
        ];

    const lines = [headers.map(csvSafeCell).join(',')];
    for (const row of filteredEntries) {
      lines.push(
        [
          formatTimestamp(row.visitedAt),
          row.visitedAt,
          row.osUser,
          row.browserLabel,
          row.profileName,
          row.domain,
          row.title,
          row.url,
          transitionLabel(row.transitionType),
          row.visitCount,
          row.typedCount,
          row.scheme,
        ]
          .map(csvSafeCell)
          .join(',')
      );
    }

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `browser_history_${hostLabel}_${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportHtml = () => {
    if (!data) return;
    const hostLabel = (data.hostname || data.targetIp || 'endpoint').replace(/[^a-zA-Z0-9._-]/g, '_');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const dir = isEn ? 'ltr' : 'rtl';
    const exportedAt = formatTimestamp(new Date().toISOString());
    const collectedAtFormatted = formatTimestamp(data.collectedAt);
    const maxDomEntries = Math.max(1, filteredAnalytics.topDomains[0]?.entries || 1);
    const totalFiltered = Math.max(1, filteredEntries.length);

    const browserCardsHtml = filteredAnalytics.browsers
      .map((b) => {
        const pct = Math.round((b.entries / totalFiltered) * 100);
        return `<div class="b-row">
          <div class="b-head"><strong>${escapeHtmlSafe(b.browserLabel)}</strong><span>${b.entries.toLocaleString()} (${pct}%) · ${b.uniqueDomains} ${escapeHtmlSafe(isEn ? 'domains' : 'دامنه')}</span></div>
          <div class="bar-bg"><div class="bar-fill" style="width:${pct}%"></div></div>
        </div>`;
      })
      .join('');

    const topDomainsHtml = filteredAnalytics.topDomains
      .map((d, idx) => {
        const pct = Math.max(4, Math.round((d.entries / maxDomEntries) * 100));
        return `<tr>
          <td style="width:42px;text-align:center;font-weight:700;color:#64748b">${idx + 1}</td>
          <td><strong>${escapeHtmlSafe(d.domain)}</strong><div class="bar-bg" style="margin-top:4px;height:5px"><div class="bar-fill bar-teal" style="width:${pct}%"></div></div></td>
          <td dir="ltr" style="font-weight:700">${d.entries.toLocaleString()}</td>
          <td dir="ltr">${d.visits.toLocaleString()}</td>
          <td>${escapeHtmlSafe(d.browsers.join(', '))}</td>
          <td dir="ltr">${escapeHtmlSafe(formatTimestamp(d.lastVisitedAt))}</td>
        </tr>`;
      })
      .join('');

    const profileRowsHtml = data.profiles
      .map(
        (p) => `<tr>
          <td><strong>${escapeHtmlSafe(p.osUser)}</strong></td>
          <td>${escapeHtmlSafe(p.browserLabel)}</td>
          <td>${escapeHtmlSafe(p.profileName)}</td>
          <td dir="ltr">${p.entryCount.toLocaleString()}</td>
          <td dir="ltr">${escapeHtmlSafe(formatTimestamp(p.lastVisitAt))}</td>
          <td><span class="status status-${escapeHtmlSafe(p.engineStatus)}">${escapeHtmlSafe(
            p.engineStatus === 'ok'
              ? isEn
                ? 'Active / Collected'
                : 'سالم / جمع‌آوری‌شده'
              : p.engineStatus === 'empty'
              ? isEn
                ? 'No Visits in Window'
                : 'بدون رکورد در بازه'
              : isEn
              ? 'Read Error'
              : 'خطای خواندن'
          )}</span></td>
        </tr>`
      )
      .join('');

    const tableRowsHtml = filteredEntries
      .map((e, idx) => {
        const safeHref = isSafeHttpUrl(e.url) ? escapeHtmlSafe(e.url) : '';
        const urlHtml = safeHref
          ? `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="url-link">${escapeHtmlSafe(e.url)}</a>`
          : `<span class="url-plain">${escapeHtmlSafe(e.url)}</span>`;
        return `<tr data-browser="${escapeHtmlSafe(e.browser)}" data-search="${escapeHtmlSafe(
          `${e.title} ${e.url} ${e.domain} ${e.osUser} ${e.profileName} ${e.browserLabel}`.toLowerCase()
        )}">
          <td style="text-align:center;color:#64748b">${idx + 1}</td>
          <td dir="ltr" class="mono nowrap">${escapeHtmlSafe(formatTimestamp(e.visitedAt))}</td>
          <td><strong>${escapeHtmlSafe(e.osUser || '—')}</strong><div class="sub">${escapeHtmlSafe(e.profileName)}</div></td>
          <td><span class="badge badge-browser">${escapeHtmlSafe(e.browserLabel)}</span></td>
          <td><div class="title-txt">${escapeHtmlSafe(e.title)}</div><div class="url-box" dir="ltr">${urlHtml}</div></td>
          <td dir="ltr"><strong>${escapeHtmlSafe(e.domain)}</strong></td>
          <td><span class="badge badge-${escapeHtmlSafe(e.transitionType)}">${escapeHtmlSafe(transitionLabel(e.transitionType))}</span></td>
          <td dir="ltr" style="text-align:center;font-weight:700">${e.visitCount}</td>
        </tr>`;
      })
      .join('');

    const browserFilterOptions = filteredAnalytics.browsers
      .map((b) => `<option value="${escapeHtmlSafe(b.browser)}">${escapeHtmlSafe(b.browserLabel)} (${b.entries})</option>`)
      .join('');

    const html = `<!doctype html>
<html lang="${isEn ? 'en' : 'fa'}" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtmlSafe(isEn ? 'Endpoint Web Browser History Audit Report' : 'گزارش مهندسی تاریخچه مرورگرهای وب سیستم')} - ${escapeHtmlSafe(data.hostname || data.targetIp)}</title>
<style>
  :root { --bg:#f1f5f9; --card:#ffffff; --border:#e2e8f0; --text:#0f172a; --muted:#64748b; --accent:#0d9488; --accent-dark:#0f766e; }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px; font-family: system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif; background:var(--bg); color:var(--text); line-height:1.55; }
  .wrap { max-width:1380px; margin:0 auto; }
  .hero { background:linear-gradient(135deg,#0f172a 0%,#134e4a 55%,#0d9488 100%); color:#fff; border-radius:16px; padding:24px 28px; margin-bottom:20px; box-shadow:0 10px 25px rgba(15,23,42,.15); }
  .hero h1 { margin:0 0 8px; font-size:22px; font-weight:800; letter-spacing:-0.01em; }
  .hero-meta { display:flex; flex-wrap:wrap; gap:10px 20px; font-size:12.5px; color:#cbd5e1; }
  .hero-meta strong { color:#fff; }
  .kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; margin-bottom:20px; }
  .kpi { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:16px 18px; box-shadow:0 1px 3px rgba(15,23,42,.04); }
  .kpi-lbl { font-size:12px; color:var(--muted); font-weight:600; }
  .kpi-val { font-size:24px; font-weight:800; margin-top:6px; font-family:ui-monospace,monospace; color:#0f172a; }
  .kpi-sub { font-size:11px; color:var(--muted); margin-top:3px; }
  .two-col { display:grid; grid-template-columns:1fr 1.5fr; gap:18px; margin-bottom:20px; }
  @media (max-width:960px) { .two-col { grid-template-columns:1fr; } }
  .card { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:18px 20px; margin-bottom:20px; box-shadow:0 1px 4px rgba(15,23,42,.04); }
  .card h2 { margin:0 0 14px; font-size:15px; font-weight:700; color:#0f172a; display:flex; align-items:center; justify-content:space-between; }
  .b-row { margin-bottom:12px; }
  .b-head { display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:5px; }
  .bar-bg { width:100%; height:8px; background:#e2e8f0; border-radius:999px; overflow:hidden; }
  .bar-fill { height:100%; background:linear-gradient(90deg,#0284c7,#0d9488); border-radius:999px; }
  .bar-teal { background:linear-gradient(90deg,#0d9488,#14b8a6); }
  .toolbar { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:14px; align-items:center; }
  .toolbar input, .toolbar select { padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:12.5px; background:#fff; color:#0f172a; outline:none; }
  .toolbar input { flex:1; min-width:240px; }
  table { width:100%; border-collapse:collapse; font-size:12.5px; }
  th, td { border-bottom:1px solid #e2e8f0; padding:9px 10px; text-align:start; vertical-align:top; }
  th { background:#f8fafc; color:#334155; font-weight:700; position:sticky; top:0; z-index:1; }
  tr:hover td { background:#f8fafc; }
  .mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11.5px; }
  .nowrap { white-space:nowrap; }
  .sub { font-size:11px; color:var(--muted); margin-top:2px; }
  .title-txt { font-weight:600; color:#0f172a; max-width:460px; word-break:break-word; }
  .url-box { max-width:460px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; margin-top:2px; }
  .url-link { color:#0284c7; text-decoration:none; }
  .url-link:hover { text-decoration:underline; }
  .url-plain { color:#64748b; }
  .badge { display:inline-block; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:700; white-space:nowrap; }
  .badge-browser { background:#e0f2fe; color:#0369a1; }
  .badge-typed { background:#dcfce7; color:#166534; }
  .badge-link { background:#f1f5f9; color:#334155; }
  .badge-bookmark { background:#fef3c7; color:#92400e; }
  .badge-reload, .badge-redirect, .badge-generated, .badge-form_submit, .badge-other { background:#ede9fe; color:#5b21b6; }
  .status { display:inline-block; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:700; }
  .status-ok { background:#dcfce7; color:#166534; }
  .status-empty { background:#f1f5f9; color:#475569; }
  .status-error { background:#fee2e2; color:#991b1b; }
  .footer-note { text-align:center; font-size:11.5px; color:var(--muted); margin-top:16px; }
  @media print {
    body { background:#fff; padding:0; }
    .toolbar { display:none; }
    .card, .kpi { box-shadow:none; break-inside:avoid; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <h1>${escapeHtmlSafe(isEn ? 'Endpoint Web Browser History Audit Report' : 'گزارش جامع و مهندسی تاریخچه مرورگرهای وب سیستم')}</h1>
    <div class="hero-meta">
      <span>${escapeHtmlSafe(isEn ? 'Workstation' : 'نام سیستم')}: <strong>${escapeHtmlSafe(data.hostname || data.targetIp)}</strong> (<span dir="ltr">${escapeHtmlSafe(data.targetIp)}</span>)</span>
      <span>${escapeHtmlSafe(isEn ? 'Active OS User' : 'کاربر فعال')}: <strong>${escapeHtmlSafe(data.loggedInUser || '—')}</strong></span>
      <span>${escapeHtmlSafe(isEn ? 'Timeframe' : 'بازه گزارش')}: <strong>${escapeHtmlSafe(timeframeLabel(data.hoursBack))}</strong></span>
      <span>${escapeHtmlSafe(isEn ? 'SQLite Engine' : 'موتور خواندن SQLite')}: <strong>${escapeHtmlSafe(data.sqliteEngine)}</strong></span>
      <span>${escapeHtmlSafe(isEn ? 'Collected At' : 'زمان جمع‌آوری')}: <strong dir="ltr">${escapeHtmlSafe(collectedAtFormatted)}</strong></span>
      <span>${escapeHtmlSafe(isEn ? 'Report Generated' : 'زمان خروجی')}: <strong dir="ltr">${escapeHtmlSafe(exportedAt)}</strong></span>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-lbl">${escapeHtmlSafe(isEn ? 'Exported History Records' : 'تعداد رکوردهای گزارش')}</div><div class="kpi-val">${filteredEntries.length.toLocaleString()}</div><div class="kpi-sub">${escapeHtmlSafe(isEn ? `of ${data.totalEntries.toLocaleString()} collected` : `از مجموع ${data.totalEntries.toLocaleString()} رکورد`)}</div></div>
    <div class="kpi"><div class="kpi-lbl">${escapeHtmlSafe(isEn ? 'Unique Domains' : 'تعداد دامنه‌های یکتا')}</div><div class="kpi-val">${filteredAnalytics.uniqueDomains.toLocaleString()}</div><div class="kpi-sub">${escapeHtmlSafe(isEn ? 'Distinct hosts visited' : 'هاست‌های متمایز بازدیدشده')}</div></div>
    <div class="kpi"><div class="kpi-lbl">${escapeHtmlSafe(isEn ? 'Browser Profiles Scanned' : 'پروفایل‌های اسکن‌شده')}</div><div class="kpi-val">${data.profilesScanned}</div><div class="kpi-sub">${escapeHtmlSafe(isEn ? `${data.profiles.filter((p) => p.engineStatus === 'ok').length} active with visits` : `${data.profiles.filter((p) => p.engineStatus === 'ok').length} پروفایل دارای بازدید`)}</div></div>
    <div class="kpi"><div class="kpi-lbl">${escapeHtmlSafe(isEn ? 'Direct Typed Visits' : 'بازدیدهای تایپ مستقیم')}</div><div class="kpi-val">${filteredAnalytics.typedTotal.toLocaleString()}</div><div class="kpi-sub">${escapeHtmlSafe(isEn ? 'URLs entered in address bar' : 'آدرس‌های تایپ‌شده در نوار آدرس')}</div></div>
  </div>

  <div class="two-col">
    <div class="card">
      <h2>${escapeHtmlSafe(isEn ? 'Browser Usage Breakdown' : 'توزیع سهم مرورگرها')}</h2>
      ${browserCardsHtml || `<div class="sub">${escapeHtmlSafe(isEn ? 'No data' : 'بدون داده')}</div>`}
    </div>
    <div class="card">
      <h2>${escapeHtmlSafe(isEn ? 'Top Visited Domains' : 'پربازدیدترین دامنه‌ها و سایت‌ها')}</h2>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>#</th>
            <th>${escapeHtmlSafe(isEn ? 'Domain' : 'دامنه')}</th>
            <th>${escapeHtmlSafe(isEn ? 'History Rows' : 'تعداد رکورد')}</th>
            <th>${escapeHtmlSafe(isEn ? 'Total Visits' : 'مجموع بازدید')}</th>
            <th>${escapeHtmlSafe(isEn ? 'Browsers' : 'مرورگرها')}</th>
            <th>${escapeHtmlSafe(isEn ? 'Last Visit' : 'آخرین بازدید')}</th>
          </tr></thead>
          <tbody>${topDomainsHtml}</tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>${escapeHtmlSafe(isEn ? 'Scanned User & Browser Profiles' : 'وضعیت پروفایل‌های کاربران و مرورگرهای بررسی‌شده')}</h2>
    <div style="overflow-x:auto">
      <table>
        <thead><tr>
          <th>${escapeHtmlSafe(isEn ? 'OS User' : 'کاربر سیستم')}</th>
          <th>${escapeHtmlSafe(isEn ? 'Browser' : 'مرورگر')}</th>
          <th>${escapeHtmlSafe(isEn ? 'Profile Name' : 'نام پروفایل')}</th>
          <th>${escapeHtmlSafe(isEn ? 'Entries' : 'تعداد رکورد')}</th>
          <th>${escapeHtmlSafe(isEn ? 'Last Visit' : 'آخرین بازدید')}</th>
          <th>${escapeHtmlSafe(isEn ? 'Status' : 'وضعیت')}</th>
        </tr></thead>
        <tbody>${profileRowsHtml}</tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <h2>
      <span>${escapeHtmlSafe(isEn ? 'Detailed Browsing Timeline' : 'جدول دقیق تاریخچه بازدیدهای مرورگر')}</span>
      <span id="visibleCount" class="sub">${filteredEntries.length.toLocaleString()} ${escapeHtmlSafe(isEn ? 'records' : 'رکورد')}</span>
    </h2>
    <div class="toolbar">
      <input type="text" id="qInput" placeholder="${escapeHtmlSafe(isEn ? 'Live search URL, page title, domain, user...' : 'جستجوی آنی در عنوان، URL، دامنه، کاربر...')}" />
      <select id="bSelect">
        <option value="all">${escapeHtmlSafe(isEn ? 'All Browsers' : 'همه مرورگرها')}</option>
        ${browserFilterOptions}
      </select>
    </div>
    <div style="overflow-x:auto;max-height:760px">
      <table id="histTable">
        <thead><tr>
          <th>#</th>
          <th>${escapeHtmlSafe(isEn ? 'Timestamp' : 'زمان بازدید')}</th>
          <th>${escapeHtmlSafe(isEn ? 'OS User / Profile' : 'کاربر / پروفایل')}</th>
          <th>${escapeHtmlSafe(isEn ? 'Browser' : 'مرورگر')}</th>
          <th>${escapeHtmlSafe(isEn ? 'Page Title & URL' : 'عنوان صفحه و آدرس (URL)')}</th>
          <th>${escapeHtmlSafe(isEn ? 'Domain' : 'دامنه')}</th>
          <th>${escapeHtmlSafe(isEn ? 'Type' : 'نوع دسترسی')}</th>
          <th>${escapeHtmlSafe(isEn ? 'Visits' : 'بازدید')}</th>
        </tr></thead>
        <tbody>${tableRowsHtml}</tbody>
      </table>
    </div>
  </div>

  <div class="footer-note">${escapeHtmlSafe(isEn ? 'Generated directly from live endpoint SQLite browser databases in read-only temp mode.' : 'تهیه‌شده به‌صورت زنده و مستقیم از پایگاه‌داده SQLite مرورگرهای سیستم هدف بدون تغییر فایل اصلی.')}</div>
</div>
<script>
(function(){
  var q = document.getElementById('qInput');
  var b = document.getElementById('bSelect');
  var rows = Array.prototype.slice.call(document.querySelectorAll('#histTable tbody tr'));
  var cnt = document.getElementById('visibleCount');
  var suffix = ${JSON.stringify(isEn ? ' records' : ' رکورد')};
  function applyFilter(){
    var txt = (q.value || '').trim().toLowerCase();
    var br = b.value;
    var vis = 0;
    for (var i = 0; i < rows.length; i++){
      var r = rows[i];
      var okB = (br === 'all' || r.getAttribute('data-browser') === br);
      var okQ = (!txt || (r.getAttribute('data-search') || '').indexOf(txt) !== -1);
      if (okB && okQ) { r.style.display = ''; vis++; } else { r.style.display = 'none'; }
    }
    if (cnt) cnt.textContent = vis.toLocaleString() + suffix;
  }
  if (q) q.addEventListener('input', applyFilter);
  if (b) b.addEventListener('change', applyFilter);
})();
</script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `browser_history_report_${hostLabel}_${stamp}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!canViewBrowserHistory) {
    return (
      <div className={`rounded-2xl border p-8 text-center ${surfaceBg}`}>
        <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mb-4">
          <Lock className="w-6 h-6 text-rose-500" />
        </div>
        <h3 className={`text-base font-bold ${textPrimary}`}>
          {isEn ? 'Web Browser History Access Restricted' : 'محدودیت دسترسی RBAC برای تب مرورگر وب'}
        </h3>
        <p className={`mt-2 text-xs max-w-xl mx-auto leading-relaxed ${textMuted}`}>
          {isEn
            ? 'Viewing workstation web browser history is disabled by default for all roles except Super Admin. Ask a Super Admin to enable "canViewHelpdeskBrowserHistory" in Access Policy settings if authorized.'
            : 'دسترسی به تاریخچه مرورگر وب سیستم کاربران به صورت پیش‌فرض برای همه نقش‌ها غیرفعال است و فقط برای سوپرادمین فعال می‌باشد. در صورت نیاز، سوپرادمین باید مجوز canViewHelpdeskBrowserHistory را در پالیسی دسترسی فعال نماید.'}
        </p>
      </div>
    );
  }

  const maxTopEntries = Math.max(1, filteredAnalytics.topDomains[0]?.entries || 1);

  return (
    <div className="space-y-5">
      {/* Header & Controls Card */}
      <div className={`rounded-2xl border p-5 ${surfaceBg}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center shrink-0">
              <Compass className="w-5 h-5 text-teal-500" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className={`text-base font-bold ${textPrimary}`}>
                  {isEn ? 'Web Browser History & Forensic Report' : 'مرورگر وب — تحلیل مهندسی تاریخچه و گزارش‌گیری'}
                </h2>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  fieldName={isEn ? 'Agentless Web Browser History Audit' : 'ممیزی بدون‌ایجنت تاریخچه مرورگرهای وب'}
                  whatIsIt={
                    isEn
                      ? 'Safely copies locked SQLite browser databases (History, History-wal, places.sqlite) across all OS user profiles to a temporary directory and extracts live visit records using native Windows winsqlite3.dll or Linux python3 sqlite3.'
                      : 'دیتابیس‌های SQLite مرورگرهای نصب‌شده (Chrome، Edge، Firefox، Brave، Opera، Vivaldi، Yandex) را حتی در حالت باز بودن مرورگر همراه با فایل‌های WAL به‌صورت ایمن در پوشه موقت کپی و قرائت کرده و بلافاصله پاک‌سازی می‌کند.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Helps authorized Super Admins audit security incidents, trace suspicious downloads or phishing domains, and generate executive HTML or Excel reports without disturbing the user.'
                      : 'به مدیر ارشد سیستم (Super Admin) کمک می‌کند در ممیزی‌های امنیتی یا رفع خطاهای وب، دقیقاً مسیر بازدید سایت‌ها، تعداد مراجعات و دامنه‌های پربازدید هر کاربر را بررسی کرده و گزارش شکیل HTML یا Excel خروجی بگیرد.'
                  }
                  example={
                    isEn
                      ? 'Select "Last 7 Days" or "Last 30 Days", click "Collect Browser History", click any domain to filter, and export to Styled HTML or Excel.'
                      : 'بازه زمانی «۷ روز اخیر» یا «۳۰ روز اخیر» را انتخاب کرده، دکمه «دریافت تاریخچه مرورگرها» را بزنید و با کلیک روی هر دامنه یا مرورگر فیلتر کرده و خروجی HTML یا Excel بگیرید.'
                  }
                />
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                    isLightMode
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  }`}
                >
                  <Lock className="w-2.5 h-2.5" />
                  {isEn ? 'RBAC: Super Admin / Explicit Grant' : 'RBAC: سوپرادمین / مجوز صریح'}
                </span>
              </div>
              <p className={`mt-1 text-xs ${textMuted}`}>
                {isEn
                  ? 'Live read-only extraction across Chrome, Edge, Firefox, Brave, Opera, Vivaldi & Yandex profiles (WAL-aware, zero endpoint modification).'
                  : 'استخراج زنده و فقط‌خواندنی از پروفایل‌های Chrome، Edge، Firefox، Brave، Opera، Vivaldi و Yandex (با پشتیبانی کامل از فایل‌های WAL و بدون تغییر روی سیستم کاربر).'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Timeframe Selector */}
            <div className="flex items-center gap-1.5">
              <Clock className={`w-3.5 h-3.5 ${textMuted}`} />
              <select
                value={hoursBack}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  onChangeHoursBack(next);
                  if (hasCredentials && targetIp.trim()) {
                    onFetchHistory(next);
                  }
                }}
                disabled={loading}
                className={`px-2.5 py-2 rounded-lg border text-xs font-medium outline-none ${inputCls}`}
              >
                <option value={24}>{isEn ? 'Last 24 Hours' : '۲۴ ساعت اخیر'}</option>
                <option value={168}>{isEn ? 'Last 7 Days' : '۷ روز اخیر'}</option>
                <option value={720}>{isEn ? 'Last 30 Days' : '۳۰ روز اخیر'}</option>
                <option value={2160}>{isEn ? 'Last 90 Days' : '۹۰ روز اخیر'}</option>
                <option value={0}>{isEn ? 'All Available Time' : 'کل تاریخچه موجود'}</option>
              </select>
            </div>

            {/* Collect / Refresh Button */}
            <button
              type="button"
              onClick={() => onFetchHistory()}
              disabled={loading || !hasCredentials || !targetIp.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer shadow-sm"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>
                {loading
                  ? isEn
                    ? 'Collecting...'
                    : 'در حال استخراج...'
                  : data
                  ? isEn
                    ? 'Refresh History'
                    : 'بروزرسانی تاریخچه'
                  : isEn
                  ? 'Collect Browser History'
                  : 'دریافت تاریخچه مرورگرها'}
              </span>
            </button>

            {/* Export HTML */}
            <button
              type="button"
              onClick={handleExportHtml}
              disabled={!data || filteredEntries.length === 0}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer disabled:opacity-40 ${
                isLightMode
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                  : 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>{isEn ? 'Export HTML Report' : 'خروجی HTML شکیل'}</span>
            </button>

            {/* Export Excel */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={!data || filteredEntries.length === 0}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer disabled:opacity-40 ${
                isLightMode
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{isEn ? 'Export Excel (CSV)' : 'خروجی اکسل (Excel)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          className={`rounded-xl border p-4 flex items-start gap-3 ${
            isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
          }`}
        >
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <div className="font-bold mb-0.5">
              {isEn ? 'Browser History Collection Failed' : 'خطا در استخراج تاریخچه مرورگرهای سیستم'}
            </div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {/* Warnings Banner */}
      {data && Array.isArray(data.warnings) && data.warnings.length > 0 && (
        <div
          className={`rounded-xl border p-3.5 flex items-start gap-3 ${
            isLightMode
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-amber-950/30 border-amber-500/35 text-amber-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-bold">
              {isEn
                ? `Partial Scan Warnings (${data.warnings.length})`
                : `هشدارهای جزئی هنگام اسکن (${data.warnings.length} مورد)`}
            </div>
            <ul className="list-disc list-inside space-y-0.5 opacity-90">
              {data.warnings.slice(0, 6).map((w, i) => (
                <li key={i} className="font-mono text-[11px]">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Initial Empty / Prompt State */}
      {!data && !loading && !error && (
        <div className={`rounded-2xl border p-10 text-center ${surfaceBg}`}>
          <div className="mx-auto w-12 h-12 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center mb-3">
            <Globe className="w-6 h-6 text-teal-500" />
          </div>
          <h3 className={`text-sm font-bold ${textPrimary}`}>
            {isEn ? 'On-Demand Browser History Audit Ready' : 'آماده استخراج و تحلیل تاریخچه مرورگرهای وب'}
          </h3>
          <p className={`mt-1.5 text-xs max-w-lg mx-auto leading-relaxed ${textMuted}`}>
            {hasCredentials && targetIp.trim()
              ? isEn
                ? `Click "Collect Browser History" to inspect installed browser profiles on ${targetIp} and view interactive domain analytics and HTML/Excel exports.`
                : `برای مشاهده تاریخچه واقعی مرورگرهای سیستم ${targetIp}، تحلیل دامنه‌های پربازدید و دریافت گزارش HTML و Excel روی دکمه «دریافت تاریخچه مرورگرها» کلیک کنید.`
              : isEn
              ? 'Enter the target workstation IP and credentials above first, then click "Collect Browser History".'
              : 'ابتدا در کادر بالا آی‌پی و اطلاعات ورود سیستم کاربر را وارد کنید و سپس دکمه «دریافت تاریخچه مرورگرها» را بزنید.'}
          </p>
          {hasCredentials && targetIp.trim() && (
            <button
              type="button"
              onClick={() => onFetchHistory()}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>{isEn ? 'Collect Browser History Now' : 'شروع استخراج تاریخچه مرورگرها'}</span>
            </button>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && !data && (
        <div className={`rounded-2xl border p-12 text-center ${surfaceBg}`}>
          <Loader2 className="w-8 h-8 animate-spin text-teal-500 mx-auto mb-3" />
          <div className={`text-sm font-semibold ${textPrimary}`}>
            {isEn
              ? `Scanning user profiles & extracting browser SQLite history from ${targetIp}...`
              : `در حال اسکن پروفایل کاربران و خواندن ایمن دیتابیس مرورگرها از ${targetIp}...`}
          </div>
          <div className={`mt-1 text-xs ${textMuted}`}>
            {isEn
              ? 'Copying History / places.sqlite + WAL files in read-only temp mode with automatic cleanup.'
              : 'کپی ایمن فایل‌های History و places.sqlite به‌همراه فایل‌های WAL در مسیر موقت و پاک‌سازی خودکار...'}
          </div>
        </div>
      )}

      {/* Loaded Dashboard */}
      {data && (
        <>
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className={`rounded-xl border p-4 ${surfaceBg}`}>
              <div className={`text-[11px] font-medium ${textMuted}`}>
                {isEn ? 'History Records' : 'رکوردهای تاریخچه'}
              </div>
              <div className="mt-1 text-2xl font-extrabold font-mono tabular-nums text-teal-500">
                {filteredEntries.length.toLocaleString()}
              </div>
              <div className={`mt-0.5 text-[10px] ${textMuted}`}>
                {isEn
                  ? `Collected: ${data.totalEntries.toLocaleString()} (${timeframeLabel(data.hoursBack)})`
                  : `کل دریافت‌شده: ${data.totalEntries.toLocaleString()} (${timeframeLabel(data.hoursBack)})`}
              </div>
            </div>

            <div className={`rounded-xl border p-4 ${surfaceBg}`}>
              <div className={`text-[11px] font-medium ${textMuted}`}>
                {isEn ? 'Unique Domains' : 'دامنه‌های یکتا'}
              </div>
              <div className="mt-1 text-2xl font-extrabold font-mono tabular-nums text-sky-500">
                {filteredAnalytics.uniqueDomains.toLocaleString()}
              </div>
              <div className={`mt-0.5 text-[10px] ${textMuted}`}>
                {isEn ? 'Distinct hosts & web apps' : 'سایت‌ها و سرویس‌های متمایز'}
              </div>
            </div>

            <div className={`rounded-xl border p-4 ${surfaceBg}`}>
              <div className={`text-[11px] font-medium ${textMuted}`}>
                {isEn ? 'Profiles Scanned' : 'پروفایل‌های اسکن‌شده'}
              </div>
              <div className="mt-1 text-2xl font-extrabold font-mono tabular-nums text-indigo-500">
                {data.profilesScanned}
              </div>
              <div className={`mt-0.5 text-[10px] ${textMuted}`}>
                {isEn
                  ? `${data.profiles.filter((p) => p.engineStatus === 'ok').length} with active history`
                  : `${data.profiles.filter((p) => p.engineStatus === 'ok').length} پروفایل دارای بازدید`}
              </div>
            </div>

            <div className={`rounded-xl border p-4 ${surfaceBg}`}>
              <div className={`text-[11px] font-medium ${textMuted}`}>
                {isEn ? 'Direct Typed Visits' : 'ورود مستقیم (Typed)'}
              </div>
              <div className="mt-1 text-2xl font-extrabold font-mono tabular-nums text-emerald-500">
                {filteredAnalytics.typedTotal.toLocaleString()}
              </div>
              <div className={`mt-0.5 text-[10px] ${textMuted}`}>
                {isEn ? 'Entered directly in address bar' : 'تایپ‌شده در نوار آدرس مرورگر'}
              </div>
            </div>

            <div className={`rounded-xl border p-4 col-span-2 lg:col-span-1 ${surfaceBg}`}>
              <div className={`text-[11px] font-medium ${textMuted}`}>
                {isEn ? 'Host & SQLite Engine' : 'سیستم و موتور SQLite'}
              </div>
              <div className={`mt-1 text-sm font-bold truncate ${textPrimary}`}>
                {data.hostname || data.targetIp}
              </div>
              <div className={`mt-1 text-[10px] font-mono truncate ${textMuted}`}>
                {data.sqliteEngine} · {data.protocolUsed}
              </div>
            </div>
          </div>

          {/* Analytics Row: Browser Breakdown + Top Visited Domains */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            {/* Browser Breakdown & Profiles Card */}
            <div className={`xl:col-span-5 rounded-2xl border p-5 flex flex-col gap-4 ${surfaceBg}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-teal-500" />
                  <h3 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn ? 'Browsers & Discovered Profiles' : 'توزیع مرورگرها و پروفایل‌های شناسایی‌شده'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowProfilePaths((v) => !v)}
                  className={`text-[11px] font-semibold px-2 py-1 rounded border transition cursor-pointer ${
                    isLightMode
                      ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                      : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {showProfilePaths
                    ? isEn
                      ? 'Hide DB Paths'
                      : 'مخفی‌کردن مسیر فایل'
                    : isEn
                    ? 'Show DB Paths'
                    : 'نمایش مسیر SQLite'}
                </button>
              </div>

              {/* Browser Bars */}
              <div className="space-y-2.5">
                {filteredAnalytics.browsers.length === 0 ? (
                  <div className={`text-xs py-3 text-center ${textMuted}`}>
                    {isEn ? 'No browser records match current filters.' : 'رکوردی با فیلترهای فعلی یافت نشد.'}
                  </div>
                ) : (
                  filteredAnalytics.browsers.map((b) => {
                    const pct = Math.round((b.entries / Math.max(1, filteredEntries.length)) * 100);
                    const isSelected = browserFilter === b.browser;
                    return (
                      <button
                        key={b.browser}
                        type="button"
                        onClick={() => {
                          setBrowserFilter((prev) => (prev === b.browser ? 'all' : b.browser));
                          setPage(1);
                        }}
                        className={`w-full text-start rounded-xl border p-2.5 transition cursor-pointer ${
                          isSelected
                            ? isLightMode
                              ? 'border-teal-500 bg-teal-50/70'
                              : 'border-teal-500/70 bg-teal-950/30'
                            : subSurfaceBg
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className={`font-bold ${textPrimary}`}>{b.browserLabel}</span>
                          <span className={`font-mono text-[11px] ${textMuted}`}>
                            {b.entries.toLocaleString()} ({pct}%) · {b.uniqueDomains}{' '}
                            {isEn ? 'domains' : 'دامنه'}
                          </span>
                        </div>
                        <div className={`w-full h-1.5 rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                          <div
                            className={`h-full rounded-full ${getBrowserBarColor(b.browser)}`}
                            style={{ width: `${Math.max(3, pct)}%` }}
                          />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Discovered Profiles Table */}
              <div className="border-t pt-3 border-slate-200 dark:border-slate-800">
                <div className={`text-[11px] font-bold mb-2 ${textMuted}`}>
                  {isEn
                    ? `Scanned Browser Profiles (${data.profiles.length})`
                    : `پروفایل‌های مرورگر اسکن‌شده روی سیستم (${data.profiles.length})`}
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
                  {data.profiles.length === 0 ? (
                    <div className={`text-xs py-3 text-center ${textMuted}`}>
                      {isEn ? 'No browser databases discovered on this host.' : 'هیچ دیتابیس مرورگری روی این سیستم یافت نشد.'}
                    </div>
                  ) : (
                    data.profiles.map((p, idx) => (
                      <div
                        key={`${p.osUser}-${p.browser}-${p.profileDir}-${idx}`}
                        className={`rounded-lg border px-2.5 py-2 text-[11px] ${subSurfaceBg}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`px-1.5 py-0.5 rounded border text-[10px] font-bold shrink-0 ${getBrowserBadgeColors(
                                p.browser,
                                isLightMode
                              )}`}
                            >
                              {p.browserLabel}
                            </span>
                            <span className={`font-semibold truncate ${textPrimary}`}>{p.osUser}</span>
                            <span className={`truncate ${textMuted}`}>({p.profileName})</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`font-mono font-bold ${p.entryCount > 0 ? 'text-teal-500' : textMuted}`}>
                              {p.entryCount.toLocaleString()}
                            </span>
                            {p.engineStatus === 'error' && (
                              <span
                                title={p.errorMessage || 'Error'}
                                className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-500 text-[10px] font-bold"
                              >
                                {isEn ? 'ERR' : 'خطا'}
                              </span>
                            )}
                          </div>
                        </div>
                        {showProfilePaths && (
                          <div dir="ltr" className={`mt-1 font-mono text-[10px] break-all opacity-80 ${textMuted}`}>
                            {p.dbPath}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Top Visited Domains Card */}
            <div className={`xl:col-span-7 rounded-2xl border p-5 ${surfaceBg}`}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-sky-500" />
                  <h3 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn ? 'Top Visited Domains (Click to Filter)' : 'پربازدیدترین دامنه‌ها (کلیک برای فیلتر)'}
                  </h3>
                </div>
                {domainFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setDomainFilter('');
                      setPage(1);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-600 text-white text-[11px] font-semibold cursor-pointer hover:bg-teal-500"
                  >
                    <X className="w-3 h-3" />
                    <span dir="ltr">{domainFilter}</span>
                  </button>
                )}
              </div>

              {filteredAnalytics.topDomains.length === 0 ? (
                <div className={`text-xs py-10 text-center ${textMuted}`}>
                  {isEn ? 'No domain telemetry available for the active filter.' : 'دامنه‌ای برای نمایش با فیلتر فعلی وجود ندارد.'}
                </div>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className={`border-b text-[11px] ${isLightMode ? 'border-slate-200 text-slate-600' : 'border-slate-800 text-slate-400'}`}>
                        <th className="py-2 px-2 text-start w-8">#</th>
                        <th className="py-2 px-2 text-start">{isEn ? 'Domain' : 'دامنه'}</th>
                        <th className="py-2 px-2 text-end">{isEn ? 'Events' : 'تعداد رکورد'}</th>
                        <th className="py-2 px-2 text-end">{isEn ? 'Total Visits' : 'مجموع بازدید'}</th>
                        <th className="py-2 px-2 text-start">{isEn ? 'Browsers' : 'مرورگرها'}</th>
                        <th className="py-2 px-2 text-start">{isEn ? 'Last Visit' : 'آخرین بازدید'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAnalytics.topDomains.map((d, idx) => {
                        const pct = Math.max(4, Math.round((d.entries / maxTopEntries) * 100));
                        const isDomActive = domainFilter.toLowerCase() === d.domain.toLowerCase();
                        return (
                          <tr
                            key={d.domain}
                            onClick={() => {
                              setDomainFilter((prev) =>
                                prev.toLowerCase() === d.domain.toLowerCase() ? '' : d.domain
                              );
                              setPage(1);
                            }}
                            className={`border-b cursor-pointer transition ${
                              isDomActive
                                ? isLightMode
                                  ? 'bg-teal-50 border-teal-200'
                                  : 'bg-teal-950/40 border-teal-500/30'
                                : isLightMode
                                ? 'border-slate-100 hover:bg-slate-50'
                                : 'border-slate-800/70 hover:bg-slate-800/40'
                            }`}
                          >
                            <td className={`py-2 px-2 font-mono text-[11px] ${textMuted}`}>{idx + 1}</td>
                            <td className="py-2 px-2 min-w-[180px]">
                              <div dir="ltr" className={`font-semibold truncate max-w-[240px] ${textPrimary}`}>
                                {d.domain}
                              </div>
                              <div className={`mt-1 w-full h-1 rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                                <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </td>
                            <td dir="ltr" className="py-2 px-2 text-end font-mono font-bold text-teal-500">
                              {d.entries.toLocaleString()}
                            </td>
                            <td dir="ltr" className={`py-2 px-2 text-end font-mono ${textMuted}`}>
                              {d.visits.toLocaleString()}
                            </td>
                            <td className={`py-2 px-2 text-[11px] ${textMuted}`}>{d.browsers.join(', ')}</td>
                            <td dir="ltr" className={`py-2 px-2 font-mono text-[11px] whitespace-nowrap ${textMuted}`}>
                              {formatTimestamp(d.lastVisitedAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Filter Toolbar + Detailed History Table */}
          <div className={`rounded-2xl border p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-teal-500" />
                <h3 className={`text-sm font-bold ${textPrimary}`}>
                  {isEn ? 'Detailed Browsing History Log' : 'جدول مهندسی جزئیات بازدیدهای مرورگر'}
                </h3>
                <span className={`text-xs font-mono ${textMuted}`}>
                  ({filteredEntries.length.toLocaleString()})
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[230px] flex-1 sm:flex-none">
                  <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 ${isEn ? 'left-3' : 'right-3'} ${textMuted}`} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder={
                      isEn ? 'Search title, URL, domain, user...' : 'جستجو در عنوان، URL، دامنه یا کاربر...'
                    }
                    className={`w-full py-1.5 rounded-lg border text-xs outline-none ${isEn ? 'pl-8 pr-3' : 'pr-8 pl-3'} ${inputCls}`}
                  />
                </div>

                <select
                  value={browserFilter}
                  onChange={(e) => {
                    setBrowserFilter(e.target.value);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="all">{isEn ? 'All Browsers' : 'همه مرورگرها'}</option>
                  {browsersList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>

                <select
                  value={osUserFilter}
                  onChange={(e) => {
                    setOsUserFilter(e.target.value);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="all">{isEn ? 'All OS Users' : 'همه کاربران سیستم'}</option>
                  {osUsersList.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>

                <select
                  value={transitionFilter}
                  onChange={(e) => {
                    setTransitionFilter(e.target.value);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="all">{isEn ? 'All Navigation Types' : 'همه نوع‌های دسترسی'}</option>
                  <option value="typed">{isEn ? 'Typed URL' : 'تایپ مستقیم'}</option>
                  <option value="link">{isEn ? 'Link Click' : 'کلیک لینک'}</option>
                  <option value="bookmark">{isEn ? 'Bookmark' : 'بوکمارک'}</option>
                  <option value="generated">{isEn ? 'Omnibox Search' : 'جستجو/پیشنهاد'}</option>
                  <option value="reload">{isEn ? 'Reload' : 'رفرش صفحه'}</option>
                  <option value="redirect">{isEn ? 'Redirect' : 'ریدایرکت'}</option>
                  <option value="form_submit">{isEn ? 'Form Submit' : 'ارسال فرم'}</option>
                </select>

                {(searchQuery || browserFilter !== 'all' || osUserFilter !== 'all' || transitionFilter !== 'all' || domainFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setBrowserFilter('all');
                      setOsUserFilter('all');
                      setTransitionFilter('all');
                      setDomainFilter('');
                      setPage(1);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                      isLightMode
                        ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                        : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {isEn ? 'Reset' : 'حذف فیلترها'}
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className={`${isLightMode ? 'bg-slate-100 text-slate-700' : 'bg-slate-950 text-slate-300'} border-b ${isLightMode ? 'border-slate-200' : 'border-slate-800'}`}>
                    <th className="py-2.5 px-3 text-start">
                      <button
                        type="button"
                        onClick={() => toggleSort('visitedAt')}
                        className="inline-flex items-center gap-1 font-bold cursor-pointer hover:text-teal-500"
                      >
                        <span>{isEn ? 'Visited At' : 'زمان بازدید'}</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-start">{isEn ? 'OS User / Profile' : 'کاربر / پروفایل'}</th>
                    <th className="py-2.5 px-3 text-start">
                      <button
                        type="button"
                        onClick={() => toggleSort('browserLabel')}
                        className="inline-flex items-center gap-1 font-bold cursor-pointer hover:text-teal-500"
                      >
                        <span>{isEn ? 'Browser' : 'مرورگر'}</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-start">{isEn ? 'Title & URL' : 'عنوان صفحه و آدرس (URL)'}</th>
                    <th className="py-2.5 px-3 text-start">
                      <button
                        type="button"
                        onClick={() => toggleSort('domain')}
                        className="inline-flex items-center gap-1 font-bold cursor-pointer hover:text-teal-500"
                      >
                        <span>{isEn ? 'Domain' : 'دامنه'}</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-start">{isEn ? 'Type' : 'نوع'}</th>
                    <th className="py-2.5 px-3 text-end">
                      <button
                        type="button"
                        onClick={() => toggleSort('visitCount')}
                        className="inline-flex items-center gap-1 font-bold cursor-pointer hover:text-teal-500"
                      >
                        <span>{isEn ? 'Visits' : 'تعداد'}</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={`py-10 text-center text-xs ${textMuted}`}>
                        {isEn
                          ? 'No browsing history records found for the selected filters.'
                          : 'هیچ رکورد تاریخچه مرورگری مطابق فیلترهای انتخاب‌شده یافت نشد.'}
                      </td>
                    </tr>
                  ) : (
                    pageEntries.map((row) => {
                      const canOpenExternal = isSafeHttpUrl(row.url);
                      return (
                        <tr
                          key={row.id}
                          className={`border-b transition ${
                            isLightMode
                              ? 'border-slate-100 hover:bg-slate-50'
                              : 'border-slate-800/70 hover:bg-slate-800/35'
                          }`}
                        >
                          <td dir="ltr" className={`py-2.5 px-3 font-mono text-[11px] whitespace-nowrap ${textMuted}`}>
                            <div title={row.visitedAt}>{formatTimestamp(row.visitedAt)}</div>
                          </td>

                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3 h-3 text-teal-500 shrink-0" />
                              <span className={`font-semibold ${textPrimary}`}>{row.osUser || '—'}</span>
                            </div>
                            <div className={`text-[10px] truncate max-w-[140px] ${textMuted}`} title={row.profileDir}>
                              {row.profileName}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold ${getBrowserBadgeColors(
                                row.browser,
                                isLightMode
                              )}`}
                            >
                              {row.browserLabel}
                            </span>
                          </td>

                          <td className="py-2.5 px-3 max-w-[440px]">
                            <div className={`font-semibold truncate ${textPrimary}`} title={row.title}>
                              {row.title}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5" dir="ltr">
                              <span className={`font-mono text-[11px] truncate max-w-[360px] ${textMuted}`} title={row.url}>
                                {row.url}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(row.id, row.url)}
                                title={isEn ? 'Copy URL' : 'کپی آدرس URL'}
                                className={`p-1 rounded hover:bg-slate-500/15 transition cursor-pointer shrink-0 ${textMuted}`}
                              >
                                {copiedId === row.id ? (
                                  <Check className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                              {canOpenExternal && (
                                <a
                                  href={row.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={isEn ? 'Open URL in new tab' : 'بازکردن لینک در تب جدید'}
                                  className={`p-1 rounded hover:bg-slate-500/15 transition shrink-0 ${textMuted}`}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <button
                              type="button"
                              dir="ltr"
                              onClick={() => {
                                setDomainFilter((prev) =>
                                  prev.toLowerCase() === row.domain.toLowerCase() ? '' : row.domain
                                );
                                setPage(1);
                              }}
                              className={`font-mono text-[11px] font-semibold hover:underline cursor-pointer ${
                                domainFilter.toLowerCase() === row.domain.toLowerCase()
                                  ? 'text-teal-500'
                                  : isLightMode
                                  ? 'text-sky-700'
                                  : 'text-sky-400'
                              }`}
                            >
                              {row.domain}
                            </button>
                          </td>

                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                                row.transitionType === 'typed'
                                  ? isLightMode
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-emerald-500/15 text-emerald-300'
                                  : row.transitionType === 'bookmark'
                                  ? isLightMode
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-amber-500/15 text-amber-300'
                                  : isLightMode
                                  ? 'bg-slate-100 text-slate-700'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {row.transitionType === 'typed' && <Keyboard className="w-2.5 h-2.5" />}
                              <span>{transitionLabel(row.transitionType)}</span>
                            </span>
                          </td>

                          <td dir="ltr" className="py-2.5 px-3 text-end whitespace-nowrap font-mono">
                            <span className={`font-bold ${textPrimary}`}>{row.visitCount}</span>
                            {row.typedCount > 0 && (
                              <span className="ml-1 text-[10px] text-emerald-500">({row.typedCount}T)</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className={`text-xs ${textMuted}`}>
                  {isEn
                    ? `Page ${safePage} of ${totalPages} (${filteredEntries.length.toLocaleString()} entries)`
                    : `صفحه ${safePage} از ${totalPages} (مجموع ${filteredEntries.length.toLocaleString()} رکورد)`}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-40 cursor-pointer ${
                      isLightMode
                        ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                        : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {isEn ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <span>{isEn ? 'Prev' : 'قبلی'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-40 cursor-pointer ${
                      isLightMode
                        ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                        : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{isEn ? 'Next' : 'بعدی'}</span>
                    {isEn ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
