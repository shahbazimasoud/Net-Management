import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Globe,
  RefreshCw,
  Loader2,
  Download,
  Trash2,
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Bookmark,
  Cookie,
  HardDrive,
  Home,
  Network,
  PowerOff,
  Wrench,
  Lock,
  Puzzle,
  Search,
  X,
  User,
  KeyRound,
  FileJson,
  Eraser,
} from 'lucide-react';
import {
  HelpdeskBrowserManageInspectResult,
  HelpdeskBrowserManageActionPayload,
  HelpdeskBrowserManageActionType,
  HelpdeskBrowserBookmarkBackupResult,
  HelpdeskBrowserVendor,
  HelpdeskManagedProfileInfo,
  HelpdeskBrowserExtensionItem,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface BrowserManageTabProps {
  isLightMode: boolean;
  isEn: boolean;
  targetIp: string;
  hasCredentials: boolean;
  canExecuteActions: boolean;
  data: HelpdeskBrowserManageInspectResult | null;
  loading: boolean;
  error: string | null;
  actionResult: any | null;
  actionError: string | null;
  busyKey: string | null;
  onInspect: () => void;
  onExecuteAction: (payload: HelpdeskBrowserManageActionPayload, busyToken: string) => Promise<void>;
  onBackupBookmarks: (options?: {
    profilePaths?: string[];
    browsers?: HelpdeskBrowserVendor[];
    osUser?: string;
  }) => Promise<HelpdeskBrowserBookmarkBackupResult | null>;
}

const ALL_VENDORS: Array<{ id: HelpdeskBrowserVendor; label: string }> = [
  { id: 'chrome', label: 'Chrome' },
  { id: 'edge', label: 'Edge' },
  { id: 'firefox', label: 'Firefox' },
  { id: 'brave', label: 'Brave' },
  { id: 'opera', label: 'Opera' },
  { id: 'vivaldi', label: 'Vivaldi' },
  { id: 'yandex', label: 'Yandex' },
  { id: 'chromium', label: 'Chromium' },
];

function getVendorBadgeClass(browser: HelpdeskBrowserVendor, isLightMode: boolean): string {
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

function triggerFileDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

interface PendingConfirmState {
  titleEn: string;
  titleFa: string;
  descriptionEn: string;
  descriptionFa: string;
  tone: 'amber' | 'rose' | 'teal';
  payload: HelpdeskBrowserManageActionPayload;
  busyToken: string;
  isExtensionRemove?: boolean;
  extensionTargets?: HelpdeskBrowserExtensionItem[];
}

function getExtensionRowKey(ex: HelpdeskBrowserExtensionItem): string {
  return `${ex.browser}|${ex.osUser}|${ex.profilePath || ex.profileDir}|${ex.extensionId}`;
}

export const BrowserManageTab: React.FC<BrowserManageTabProps> = ({
  isLightMode,
  isEn,
  targetIp,
  hasCredentials,
  canExecuteActions,
  data,
  loading,
  error,
  actionResult,
  actionError,
  busyKey,
  onInspect,
  onExecuteAction,
  onBackupBookmarks,
}) => {
  // Proxy form state
  const [proxyMode, setProxyMode] = useState<'direct' | 'manual' | 'pac'>('manual');
  const [proxyServer, setProxyServer] = useState('');
  const [proxyBypass, setProxyBypass] = useState('<local>;10.*;192.168.*');
  const [proxyPacUrl, setProxyPacUrl] = useState('');
  const [proxyAutoDetect, setProxyAutoDetect] = useState(false);
  const [proxyTargets, setProxyTargets] = useState<
    Array<'wininet' | 'winhttp' | 'chrome_policy' | 'edge_policy' | 'firefox'>
  >(['wininet', 'firefox']);
  const [proxyCloseFirst, setProxyCloseFirst] = useState(false);

  // Homepage & Startup form state
  const [homepageIsNewTab, setHomepageIsNewTab] = useState(false);
  const [homepageUrl, setHomepageUrl] = useState('https://');
  const [restoreOnStartup, setRestoreOnStartup] = useState<'urls' | 'newtab' | 'continue'>('urls');
  const [startupUrlsText, setStartupUrlsText] = useState('');
  const [homepageScope, setHomepageScope] = useState<'both' | 'policy' | 'profile_prefs'>('both');
  const [homepageBrowsers, setHomepageBrowsers] = useState<HelpdeskBrowserVendor[]>([
    'chrome',
    'edge',
    'firefox',
  ]);
  const [homepageCloseFirst, setHomepageCloseFirst] = useState(false);

  // Cookie & Cache toggles
  const [clearSiteStorageWithCookies, setClearSiteStorageWithCookies] = useState(false);
  const [closeBrowsersOnCleanup, setCloseBrowsersOnCleanup] = useState(true);

  // Filters
  const [profileUserFilter, setProfileUserFilter] = useState<string>('all');
  const [profileBrowserFilter, setProfileBrowserFilter] = useState<string>('all');
  const [extSearch, setExtSearch] = useState('');
  const [extBrowserFilter, setExtBrowserFilter] = useState<string>('all');
  const [extUserFilter, setExtUserFilter] = useState<string>('all');
  const [selectedExtKeys, setSelectedExtKeys] = useState<string[]>([]);
  const [showUninstalledBrowsers, setShowUninstalledBrowsers] = useState(false);

  // Bookmarks backup state
  const [backingUpKey, setBackingUpKey] = useState<string | null>(null);
  const [backupNotice, setBackupNotice] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // Form validation notice
  const [formError, setFormError] = useState<string | null>(null);

  // Confirmation modal
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmState | null>(null);
  const [confirmCloseBrowsers, setConfirmCloseBrowsers] = useState(true);
  const [confirmBlockPolicy, setConfirmBlockPolicy] = useState(false);

  useEffect(() => {
    setSelectedExtKeys([]);
    if (data?.proxy?.winInet) {
      const wi = data.proxy.winInet;
      if (wi.autoConfigUrl) {
        setProxyMode('pac');
        setProxyPacUrl(wi.autoConfigUrl);
      } else if (wi.enabled && wi.server) {
        setProxyMode('manual');
        setProxyServer(wi.server);
      }
      if (wi.override) setProxyBypass(wi.override);
      setProxyAutoDetect(Boolean(wi.autoDetect));
    }
  }, [data?.collectedAt]);

  useEffect(() => {
    if (!pendingConfirm) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setPendingConfirm(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingConfirm]);

  const surfaceBg = isLightMode
    ? 'bg-white border-slate-200 shadow-sm'
    : 'bg-slate-900/80 border-slate-800';
  const subSurface = isLightMode
    ? 'bg-slate-50 border-slate-200'
    : 'bg-slate-950/60 border-slate-800';
  const textPrimary = isLightMode ? 'text-slate-900' : 'text-slate-100';
  const textMuted = isLightMode ? 'text-slate-500' : 'text-slate-400';
  const inputClass = isLightMode
    ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-teal-500'
    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-teal-400';

  const installedBrowsers = useMemo(
    () => (data?.browsers || []).filter((b) => showUninstalledBrowsers || b.installed || b.processCount > 0),
    [data?.browsers, showUninstalledBrowsers]
  );

  const runningProcessTotal = useMemo(
    () => (data?.browsers || []).reduce((acc, b) => acc + b.processCount, 0),
    [data?.browsers]
  );

  const totalCacheMb = useMemo(
    () => Number(((data?.profiles || []).reduce((acc, p) => acc + p.cacheSizeMb, 0)).toFixed(2)),
    [data?.profiles]
  );

  const totalCookiesMb = useMemo(
    () => Number(((data?.profiles || []).reduce((acc, p) => acc + p.cookiesSizeMb, 0)).toFixed(2)),
    [data?.profiles]
  );

  const totalBookmarksCount = useMemo(
    () => (data?.profiles || []).reduce((acc, p) => acc + p.bookmarkCount, 0),
    [data?.profiles]
  );

  const osUsers = useMemo(() => {
    const set = new Set<string>();
    (data?.profiles || []).forEach((p) => {
      if (p.osUser) set.add(p.osUser);
    });
    return Array.from(set).sort();
  }, [data?.profiles]);

  const filteredProfiles = useMemo(() => {
    return (data?.profiles || []).filter((p) => {
      if (profileUserFilter !== 'all' && p.osUser !== profileUserFilter) return false;
      if (profileBrowserFilter !== 'all' && p.browser !== profileBrowserFilter) return false;
      return true;
    });
  }, [data?.profiles, profileUserFilter, profileBrowserFilter]);

  const filteredExtensions = useMemo(() => {
    const q = extSearch.trim().toLowerCase();
    return (data?.extensions || []).filter((ex) => {
      if (extBrowserFilter !== 'all' && ex.browser !== extBrowserFilter) return false;
      if (extUserFilter !== 'all' && ex.osUser !== extUserFilter) return false;
      if (!q) return true;
      return (
        ex.name.toLowerCase().includes(q) ||
        ex.extensionId.toLowerCase().includes(q) ||
        ex.osUser.toLowerCase().includes(q) ||
        ex.profileName.toLowerCase().includes(q)
      );
    });
  }, [data?.extensions, extSearch, extBrowserFilter, extUserFilter]);

  const removableFilteredExtensions = useMemo(
    () => filteredExtensions.filter((ex) => ex.installType !== 'internal'),
    [filteredExtensions]
  );

  const selectedExtensionsList = useMemo(() => {
    const keySet = new Set(selectedExtKeys);
    return (data?.extensions || []).filter(
      (ex) => ex.installType !== 'internal' && keySet.has(getExtensionRowKey(ex))
    );
  }, [data?.extensions, selectedExtKeys]);

  const allVisibleRemovableSelected =
    removableFilteredExtensions.length > 0 &&
    removableFilteredExtensions.every((ex) => selectedExtKeys.includes(getExtensionRowKey(ex)));

  const toggleSelectExtRow = (ex: HelpdeskBrowserExtensionItem) => {
    if (ex.installType === 'internal') return;
    const k = getExtensionRowKey(ex);
    setSelectedExtKeys((prev) =>
      prev.includes(k) ? prev.filter((item) => item !== k) : [...prev, k]
    );
  };

  const toggleSelectAllVisibleExtensions = () => {
    const visibleKeys = removableFilteredExtensions.map(getExtensionRowKey);
    if (allVisibleRemovableSelected) {
      const visSet = new Set(visibleKeys);
      setSelectedExtKeys((prev) => prev.filter((k) => !visSet.has(k)));
    } else {
      setSelectedExtKeys((prev) => Array.from(new Set([...prev, ...visibleKeys])));
    }
  };

  const toggleProxyTarget = (
    tgt: 'wininet' | 'winhttp' | 'chrome_policy' | 'edge_policy' | 'firefox'
  ) => {
    setProxyTargets((prev) =>
      prev.includes(tgt) ? (prev.length > 1 ? prev.filter((x) => x !== tgt) : prev) : [...prev, tgt]
    );
  };

  const toggleHomepageBrowser = (b: HelpdeskBrowserVendor) => {
    setHomepageBrowsers((prev) =>
      prev.includes(b) ? (prev.length > 1 ? prev.filter((x) => x !== b) : prev) : [...prev, b]
    );
  };

  const handleBackupDownload = async (
    format: 'html' | 'json',
    profile?: HelpdeskManagedProfileInfo
  ) => {
    const key = profile ? `${profile.id}:${format}` : `all:${format}`;
    setBackingUpKey(key);
    setBackupNotice(null);
    try {
      const res = await onBackupBookmarks(
        profile
          ? { profilePaths: [profile.profilePath], browsers: [profile.browser] }
          : undefined
      );
      if (!res) {
        setBackupNotice({
          ok: false,
          message: isEn ? 'Bookmarks backup failed.' : 'پشتیبان‌گیری از بوکمارک‌ها ناموفق بود.',
        });
        return;
      }
      const safeHost = (res.hostname || res.targetIp || 'workstation').replace(/[^a-zA-Z0-9._-]/g, '_');
      const scopeTag = profile ? `${profile.browser}_${profile.osUser}_${profile.profileDir}` : 'all_browsers';
      const cleanScope = scopeTag.replace(/[^a-zA-Z0-9._-]/g, '_');
      const dateTag = new Date().toISOString().slice(0, 10);

      if (format === 'html') {
        triggerFileDownload(
          `bookmarks_${safeHost}_${cleanScope}_${dateTag}.html`,
          res.netscapeHtml,
          'text/html;charset=utf-8'
        );
      } else {
        triggerFileDownload(
          `bookmarks_${safeHost}_${cleanScope}_${dateTag}.json`,
          JSON.stringify(
            {
              exportedAt: res.collectedAt,
              hostname: res.hostname,
              targetIp: res.targetIp,
              totalBookmarks: res.totalBookmarks,
              profilesExported: res.profilesExported,
              bookmarks: res.bookmarks,
            },
            null,
            2
          ),
          'application/json;charset=utf-8'
        );
      }
      setBackupNotice({
        ok: true,
        message: isEn
          ? `Downloaded ${res.totalBookmarks} bookmark(s) across ${res.profilesExported} profile(s) as ${format.toUpperCase()}.`
          : `فایل بکاپ (${format.toUpperCase()}) شامل ${res.totalBookmarks} بوکمارک از ${res.profilesExported} پروفایل با موفقیت دانلود شد.`,
      });
    } catch (err: any) {
      setBackupNotice({
        ok: false,
        message:
          err?.message ||
          (isEn ? 'Failed to backup browser bookmarks.' : 'خطا در بکاپ‌گیری بوکمارک‌های مرورگر.'),
      });
    } finally {
      setBackingUpKey(null);
    }
  };

  const requestApplyProxy = () => {
    setFormError(null);
    if (proxyMode === 'manual') {
      const srv = proxyServer.trim();
      if (!srv || !/^[a-zA-Z0-9.:;=_-]{3,255}$/.test(srv)) {
        setFormError(
          isEn
            ? 'Please enter a valid manual proxy server in host:port format (e.g. 192.168.10.5:8080).'
            : 'لطفاً آدرس و پورت پروکسی را با فرمت صحیح وارد کنید (مثال: 192.168.10.5:8080).'
        );
        return;
      }
    } else if (proxyMode === 'pac') {
      const pac = proxyPacUrl.trim();
      if (!/^https?:\/\/.+/i.test(pac)) {
        setFormError(
          isEn
            ? 'Please enter a valid PAC script URL starting with http:// or https://.'
            : 'لطفاً آدرس اسکریپت PAC معتبر با http:// یا https:// وارد کنید.'
        );
        return;
      }
    }

    setPendingConfirm({
      titleEn: 'Confirm Remote Browser Proxy Update',
      titleFa: 'تأیید اعمال تنظیمات پروکسی مرورگر',
      descriptionEn: `Apply "${proxyMode}" proxy configuration to [${proxyTargets.join(', ')}] on ${data?.hostname || targetIp}?`,
      descriptionFa: `آیا از اعمال حالت پروکسی «${proxyMode}» روی بخش‌های [${proxyTargets.join(', ')}] در سیستم «${data?.hostname || targetIp}» اطمینان دارید؟`,
      tone: 'teal',
      busyToken: 'proxy:set',
      payload: {
        action: 'set_proxy',
        proxyMode,
        proxyTargets,
        proxyServer: proxyServer.trim(),
        proxyBypass: proxyBypass.trim(),
        proxyPacUrl: proxyPacUrl.trim(),
        proxyAutoDetect,
        closeBrowsersFirst: proxyCloseFirst,
      },
    });
  };

  const requestClearProxy = () => {
    setFormError(null);
    setPendingConfirm({
      titleEn: 'Confirm Reset / Clear Browser Proxy',
      titleFa: 'تأیید حذف و ریست تنظیمات پروکسی',
      descriptionEn: `Disable proxy settings and restore direct connection for [${proxyTargets.join(', ')}] on ${data?.hostname || targetIp}?`,
      descriptionFa: `آیا از غیرفعال‌سازی پروکسی و بازگردانی اتصال مستقیم برای [${proxyTargets.join(', ')}] روی سیستم «${data?.hostname || targetIp}» اطمینان دارید؟`,
      tone: 'amber',
      busyToken: 'proxy:clear',
      payload: {
        action: 'clear_proxy',
        proxyTargets,
        closeBrowsersFirst: proxyCloseFirst,
      },
    });
  };

  const requestApplyHomepage = () => {
    setFormError(null);
    const cleanedHp = homepageUrl.trim();
    if (!homepageIsNewTab && (!/^https?:\/\/.+/i.test(cleanedHp) || cleanedHp === 'https://')) {
      setFormError(
        isEn
          ? 'Please enter a valid Homepage URL starting with http:// or https://, or select New Tab mode.'
          : 'لطفاً آدرس معتبر صفحه خانه (http:// یا https://) را وارد کنید یا گزینه صفحه تب جدید را فعال نمایید.'
      );
      return;
    }
    const extraStartup = startupUrlsText
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter(Boolean);
    for (const su of extraStartup) {
      if (!/^https?:\/\/.+/i.test(su)) {
        setFormError(
          isEn
            ? `Invalid startup URL "${su}". Only http:// and https:// URLs are allowed.`
            : `آدرس استارت‌آپ «${su}» نامعتبر است. فقط آدرس‌های http:// و https:// مجاز هستند.`
        );
        return;
      }
    }

    setPendingConfirm({
      titleEn: 'Confirm Remote Homepage & Startup Update',
      titleFa: 'تأیید تنظیم صفحه خانه و صفحات شروع مرورگر',
      descriptionEn: `Update homepage (${homepageIsNewTab ? 'New Tab' : cleanedHp}) and startup rule (${restoreOnStartup}) for [${homepageBrowsers.join(', ')}] using scope "${homepageScope}"?`,
      descriptionFa: `آیا از تنظیم صفحه خانه (${homepageIsNewTab ? 'تب جدید' : cleanedHp}) و رفتار شروع (${restoreOnStartup}) برای مرورگرهای [${homepageBrowsers.join(', ')}] اطمینان دارید؟`,
      tone: 'teal',
      busyToken: 'homepage:set',
      payload: {
        action: 'set_homepage',
        browsers: homepageBrowsers,
        homepageIsNewTab,
        homepageUrl: homepageIsNewTab ? '' : cleanedHp,
        restoreOnStartup,
        startupUrls:
          restoreOnStartup === 'urls'
            ? extraStartup.length > 0
              ? extraStartup
              : homepageIsNewTab
              ? []
              : [cleanedHp]
            : [],
        homepageScope,
        closeBrowsersFirst: homepageCloseFirst,
      },
    });
  };

  const confirmAndRun = async () => {
    if (!pendingConfirm) return;
    const req = pendingConfirm;
    const finalPayload: HelpdeskBrowserManageActionPayload = req.isExtensionRemove
      ? {
          ...req.payload,
          closeBrowsersFirst: confirmCloseBrowsers,
          blockViaPolicy: confirmBlockPolicy,
        }
      : req.payload;
    setPendingConfirm(null);
    await onExecuteAction(finalPayload, req.busyToken);
  };

  const requestRemoveExtensions = (targets: HelpdeskBrowserExtensionItem[]) => {
    const cleanTargets = targets.filter((t) => t.installType !== 'internal' && t.extensionId);
    if (cleanTargets.length === 0) return;
    setConfirmCloseBrowsers(true);
    setConfirmBlockPolicy(false);
    const isSingle = cleanTargets.length === 1;
    const first = cleanTargets[0];
    setPendingConfirm({
      titleEn: isSingle
        ? `Uninstall Extension: ${first.name}`
        : `Uninstall ${cleanTargets.length} Selected Extensions`,
      titleFa: isSingle
        ? `حذف افزونه: ${first.name}`
        : `حذف ${cleanTargets.length} افزونه انتخاب‌شده`,
      descriptionEn: isSingle
        ? `Remove "${first.name}" (${first.extensionId}) from ${first.browserLabel} profile (${first.osUser} / ${first.profileName}) on ${data?.hostname || targetIp}? Extension files, local extension storage, preferences entries and external registry keys will be deleted.`
        : `Remove ${cleanTargets.length} selected browser extensions across the targeted profiles on ${data?.hostname || targetIp}? Extension files, local storage and preferences registrations will be deleted.`,
      descriptionFa: isSingle
        ? `آیا از حذف کامل افزونه «${first.name}» (${first.extensionId}) از پروفایل ${first.browserLabel} کاربر «${first.osUser} / ${first.profileName}» روی سیستم «${data?.hostname || targetIp}» اطمینان دارید؟ پوشه افزونه، داده‌های ذخیره‌شده و رجیستری مربوطه پاک خواهند شد.`
        : `آیا از حذف کامل ${cleanTargets.length} افزونه انتخاب‌شده از پروفایل‌های هدف روی سیستم «${data?.hostname || targetIp}» اطمینان دارید؟ فایل‌های افزونه و تنظیمات مربوط به آن‌ها حذف می‌شوند.`,
      tone: 'rose',
      busyToken: isSingle
        ? `ext:rm:${first.browser}:${first.extensionId}`
        : `ext:bulk:${cleanTargets.length}`,
      isExtensionRemove: true,
      extensionTargets: cleanTargets,
      payload: {
        action: 'remove_extension',
        extensionItems: cleanTargets.slice(0, 30).map((t) => ({
          extensionId: t.extensionId,
          browser: t.browser,
          profilePath: t.profilePath || undefined,
        })),
        closeBrowsersFirst: true,
        blockViaPolicy: false,
      },
    });
  };

  const openConfirmAction = (
    action: HelpdeskBrowserManageActionType,
    opts: {
      titleEn: string;
      titleFa: string;
      descriptionEn: string;
      descriptionFa: string;
      tone: 'amber' | 'rose' | 'teal';
      busyToken: string;
      browsers?: HelpdeskBrowserVendor[];
      profilePaths?: string[];
      closeBrowsersFirst?: boolean;
      clearSiteStorage?: boolean;
    }
  ) => {
    setPendingConfirm({
      titleEn: opts.titleEn,
      titleFa: opts.titleFa,
      descriptionEn: opts.descriptionEn,
      descriptionFa: opts.descriptionFa,
      tone: opts.tone,
      busyToken: opts.busyToken,
      payload: {
        action,
        browsers: opts.browsers,
        profilePaths: opts.profilePaths,
        closeBrowsersFirst: opts.closeBrowsersFirst,
        clearSiteStorage: opts.clearSiteStorage,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Action & Engineering Toolbar */}
      <div className={`rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3 ${surfaceBg}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-500 shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className={`text-sm font-bold ${textPrimary}`}>
                {isEn
                  ? 'Remote Browser Engineering & Hygiene Console'
                  : 'کنسول مهندسی و مدیریت از راه دور مرورگرها'}
              </h2>
              <FieldInfoTooltip
                title={isEn ? 'Browser Management Scope' : 'محدوده مدیریت مرورگر'}
                isEn={isEn}
                isLightMode={isLightMode}
                infoWhatEn="Live remote control center for installed browsers, user profiles, proxy settings, homepage/startup pages, bookmarks backup, cookies, cache, locks, HSTS and extensions."
                infoWhatFa="مرکز کنترل و عیب‌یابی زنده مرورگرهای نصب‌شده سیستم کاربر شامل تنظیم پروکسی، صفحه خانه، بکاپ بوکمارک‌ها، پاک‌سازی کوکی و کش، رفع قفل پروفایل و بازرسی افزونه‌ها."
                infoWhyEn="Allows HelpDesk engineers to solve portal/proxy/SSL/cache/freeze issues in one click without accessing or displaying user browsing history."
                infoWhyFa="به کارشناسان هلپ‌دسک امکان می‌دهد مشکلات پورتال‌های سازمانی، پروکسی، کش و خطاهای مرورگر را از راه دور و بدون نیاز به مشاهده هستوری وب کاربر برطرف کنند."
                infoExampleEn="Backup bookmarks before cleanup, configure WinINet/Firefox proxy, flush stale HSTS/cache, or force-close frozen browser sessions."
                infoExampleFa="گرفتن بکاپ بوکمارک پیش از پاک‌سازی، تنظیم پروکسی WinINet/Firefox، حذف کش یا کوکی و بستن پروسس‌های هنگ‌کرده مرورگر."
              />
            </div>
            <p className={`text-xs mt-0.5 ${textMuted}`}>
              {isEn
                ? 'Manage installed browsers, proxy, homepage, bookmarks backup, cookies, cache & extensions (browsing history is strictly excluded).'
                : 'مدیریت مرورگرهای نصب‌شده، تنظیم پروکسی، صفحه خانه، بکاپ بوکمارک، پاک‌سازی کوکی و کش و بررسی افزونه‌ها (بدون نمایش تاریخچه مرورگر).'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!hasCredentials || loading}
            onClick={onInspect}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>{isEn ? 'Inspect Browsers' : 'بررسی مرورگرها'}</span>
          </button>

          {data && (
            <>
              <button
                type="button"
                disabled={backingUpKey !== null}
                onClick={() => handleBackupDownload('html')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                  isLightMode
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                    : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25'
                }`}
              >
                {backingUpKey === 'all:html' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Bookmark className="w-3.5 h-3.5" />
                )}
                <span>{isEn ? 'Backup All Bookmarks (.html)' : 'بکاپ کل بوکمارک‌ها (HTML)'}</span>
              </button>

              <button
                type="button"
                disabled={!canExecuteActions || busyKey !== null}
                onClick={() =>
                  openConfirmAction('clear_cache', {
                    titleEn: 'Confirm Clear Cache (All Browsers)',
                    titleFa: 'تأیید پاک‌سازی کش تمام مرورگرها',
                    descriptionEn: `Delete temporary web cache, GPU cache and service-worker cache (~${totalCacheMb} MB) across all browser profiles on ${data.hostname}? Saved passwords, cookies and bookmarks will remain intact.`,
                    descriptionFa: `آیا از حذف کامل حافظه کش وب و GPU (حدود ${totalCacheMb} مگابایت) در تمام پروفایل‌های مرورگر سیستم «${data.hostname}» اطمینان دارید؟ بوکمارک‌ها، رمزها و کوکی‌ها دست‌نخورده باقی می‌مانند.`,
                    tone: 'amber',
                    busyToken: 'all:clear_cache',
                    closeBrowsersFirst: closeBrowsersOnCleanup,
                  })
                }
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                  isLightMode
                    ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                    : 'bg-amber-500/15 border-amber-500/35 text-amber-300 hover:bg-amber-500/25'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>{isEn ? `Clear All Cache (${totalCacheMb} MB)` : `حذف کش کل (${totalCacheMb} MB)`}</span>
              </button>

              {runningProcessTotal > 0 && (
                <button
                  type="button"
                  disabled={!canExecuteActions || busyKey !== null}
                  onClick={() =>
                    openConfirmAction('close_browser', {
                      titleEn: 'Confirm Force Close All Browsers',
                      titleFa: 'تأیید بستن اجباری تمام مرورگرهای باز',
                      descriptionEn: `Terminate all ${runningProcessTotal} running browser process(es) on ${data.hostname}? Unsaved form entries in open tabs may be lost.`,
                      descriptionFa: `آیا از بستن اجباری تمامی ${runningProcessTotal} پروسس فعال مرورگر روی سیستم «${data.hostname}» اطمینان دارید؟ ممکن است فرم‌های ذخیره‌نشده در تب‌های باز از بین بروند.`,
                      tone: 'rose',
                      busyToken: 'all:close_browser',
                    })
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                    isLightMode
                      ? 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100'
                      : 'bg-rose-500/15 border-rose-500/35 text-rose-300 hover:bg-rose-500/25'
                  }`}
                >
                  <PowerOff className="w-3.5 h-3.5" />
                  <span>
                    {isEn ? `Close Browsers (${runningProcessTotal})` : `بستن مرورگرها (${runningProcessTotal})`}
                  </span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Notices & Errors */}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 flex items-start gap-3 text-xs text-rose-500">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="break-words">{error}</div>
        </div>
      )}
      {(formError || actionError) && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-start gap-2.5 text-xs text-rose-500">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="break-words">{formError || actionError}</div>
        </div>
      )}
      {actionResult && (
        <div
          className={`rounded-xl border p-3.5 flex items-start gap-2.5 text-xs ${
            actionResult.success
              ? isLightMode
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/40 text-rose-500'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="break-words font-medium">
            {isEn ? actionResult.message : actionResult.messageFa || actionResult.message}
          </div>
        </div>
      )}
      {backupNotice && (
        <div
          className={`rounded-xl border p-3.5 flex items-start gap-2.5 text-xs ${
            backupNotice.ok
              ? isLightMode
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/40 text-rose-500'
          }`}
        >
          <Download className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="font-medium">{backupNotice.message}</div>
        </div>
      )}

      {/* Empty / Loading states */}
      {!data && !loading && (
        <div className={`rounded-xl border p-10 text-center space-y-3 ${surfaceBg}`}>
          <Globe className="w-10 h-10 mx-auto text-teal-500 opacity-80" />
          <h3 className={`text-base font-bold ${textPrimary}`}>
            {isEn
              ? 'Ready to Inspect & Remotely Configure Workstation Browsers'
              : 'آماده بررسی و مدیریت تنظیمات مرورگرهای سیستم کاربر'}
          </h3>
          <p className={`text-xs max-w-xl mx-auto ${textMuted}`}>
            {isEn
              ? 'Click "Inspect Browsers" above to discover installed browsers, versions, user profiles, proxy & homepage policies, bookmarks counts, cache/cookie sizes, and extensions directly from the target workstation.'
              : 'روی دکمه «بررسی مرورگرها» در بالا کلیک کنید تا لیست مرورگرهای نصب‌شده، نسخه‌ها، پروفایل‌های کاربران، وضعیت پروکسی و صفحه خانه، حجم کش و کوکی و افزونه‌ها به‌صورت مستقیم از سیستم کاربر خوانده شود.'}
          </p>
        </div>
      )}

      {loading && !data && (
        <div className={`rounded-xl border p-10 text-center space-y-3 ${surfaceBg}`}>
          <Loader2 className="w-8 h-8 mx-auto text-teal-500 animate-spin" />
          <div className={`text-sm font-semibold ${textPrimary}`}>
            {isEn
              ? `Inspecting installed browsers, profiles, policies, proxy & extensions on ${targetIp}...`
              : `در حال بررسی مرورگرهای نصب‌شده، پروفایل‌ها، پروکسی، صفحه خانه و افزونه‌ها روی ${targetIp}...`}
          </div>
        </div>
      )}

      {data && (
        <>
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className={`rounded-xl border p-3.5 ${surfaceBg}`}>
              <div className={`text-[11px] font-medium ${textMuted}`}>
                {isEn ? 'Installed Browsers' : 'مرورگرهای نصب‌شده'}
              </div>
              <div className={`text-xl font-bold mt-1 tabular-nums ${textPrimary}`}>
                {(data.browsers || []).filter((b) => b.installed).length}
              </div>
              <div className={`text-[10px] mt-0.5 truncate ${textMuted}`}>
                {isEn ? 'Active PIDs' : 'پروسس‌های فعال'}: <strong>{runningProcessTotal}</strong>
              </div>
            </div>

            <div className={`rounded-xl border p-3.5 ${surfaceBg}`}>
              <div className={`text-[11px] font-medium ${textMuted}`}>
                {isEn ? 'Browser Profiles' : 'پروفایل‌های کاربری'}
              </div>
              <div className={`text-xl font-bold mt-1 tabular-nums text-sky-500`}>
                {data.profiles.length}
              </div>
              <div className={`text-[10px] mt-0.5 ${textMuted}`}>
                {isEn ? 'OS Users' : 'کاربران سیستم'}: <strong>{osUsers.length}</strong>
              </div>
            </div>

            <div className={`rounded-xl border p-3.5 ${surfaceBg}`}>
              <div className={`text-[11px] font-medium ${textMuted}`}>
                {isEn ? 'Total Bookmarks' : 'تعداد کل بوکمارک‌ها'}
              </div>
              <div className={`text-xl font-bold mt-1 tabular-nums text-emerald-500`}>
                {totalBookmarksCount.toLocaleString()}
              </div>
              <div className={`text-[10px] mt-0.5 ${textMuted}`}>
                {isEn ? 'Ready for HTML/JSON backup' : 'آماده بکاپ HTML/JSON'}
              </div>
            </div>

            <div className={`rounded-xl border p-3.5 ${surfaceBg}`}>
              <div className={`text-[11px] font-medium ${textMuted}`}>
                {isEn ? 'Cache & Cookies Footprints' : 'حجم کش و کوکی‌ها'}
              </div>
              <div className={`text-xl font-bold mt-1 tabular-nums text-amber-500`}>
                {(totalCacheMb + totalCookiesMb).toFixed(1)} MB
              </div>
              <div className={`text-[10px] mt-0.5 ${textMuted}`}>
                {isEn ? 'Cache' : 'کش'}: {totalCacheMb} MB · {isEn ? 'Cookies' : 'کوکی'}: {totalCookiesMb} MB
              </div>
            </div>

            <div className={`rounded-xl border p-3.5 ${surfaceBg}`}>
              <div className={`text-[11px] font-medium ${textMuted}`}>
                {isEn ? 'Installed Extensions' : 'افزونه‌های نصب‌شده'}
              </div>
              <div className={`text-xl font-bold mt-1 tabular-nums text-indigo-500`}>
                {data.extensions.length}
              </div>
              <div className={`text-[10px] mt-0.5 truncate ${textMuted}`} dir="ltr">
                {data.defaultBrowserRaw ? `Default: ${data.defaultBrowserRaw}` : data.hostname}
              </div>
            </div>
          </div>

          {/* Installed Browsers & Process Status Cards */}
          <div className={`rounded-xl border p-4 space-y-3 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className={`text-sm font-bold ${textPrimary}`}>
                  {isEn ? 'Installed Browsers & Live Processes' : 'مرورگرهای نصب‌شده و وضعیت لحظه‌ای پروسس‌ها'}
                </h3>
                <span className={`text-[11px] ${textMuted}`}>
                  ({data.hostname} • {data.osFamily.toUpperCase()})
                </span>
              </div>
              <label className={`inline-flex items-center gap-1.5 text-xs cursor-pointer ${textMuted}`}>
                <input
                  type="checkbox"
                  checked={showUninstalledBrowsers}
                  onChange={(e) => setShowUninstalledBrowsers(e.target.checked)}
                  className="rounded border-slate-400 text-teal-600 focus:ring-teal-500"
                />
                <span>{isEn ? 'Show not-installed browsers' : 'نمایش مرورگرهای نصب‌نشده'}</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {installedBrowsers.map((b) => (
                <div
                  key={b.browser}
                  className={`rounded-xl border p-3.5 flex flex-col justify-between gap-3 ${subSurface}`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-bold ${getVendorBadgeClass(
                          b.browser,
                          isLightMode
                        )}`}
                      >
                        {b.browserLabel}
                      </span>
                      <div className="flex items-center gap-1">
                        {b.isDefaultBrowser && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isLightMode
                                ? 'bg-teal-100 text-teal-800'
                                : 'bg-teal-500/20 text-teal-300'
                            }`}
                          >
                            {isEn ? 'Default' : 'پیش‌فرض'}
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            b.installed
                              ? isLightMode
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-emerald-500/20 text-emerald-300'
                              : isLightMode
                              ? 'bg-slate-200 text-slate-600'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {b.installed ? (isEn ? 'Installed' : 'نصب‌شده') : isEn ? 'Absent' : 'نصب نیست'}
                        </span>
                      </div>
                    </div>

                    <div className={`text-[11px] font-mono ${textMuted}`} dir="ltr">
                      {b.version ? `v${b.version}` : isEn ? 'Version N/A' : 'نسخه نامشخص'}
                    </div>
                    {b.exePath && (
                      <div className={`text-[10px] font-mono truncate ${textMuted}`} dir="ltr" title={b.exePath}>
                        {b.exePath}
                      </div>
                    )}
                    <div className={`text-[11px] flex items-center justify-between pt-1 ${textMuted}`}>
                      <span>
                        {isEn ? 'Running:' : 'در حال اجرا:'}{' '}
                        <strong className={b.processCount > 0 ? 'text-teal-500' : ''}>
                          {b.processCount} PID
                        </strong>
                      </span>
                      <span className="font-mono tabular-nums" dir="ltr">
                        {b.totalMemoryMb} MB RAM
                      </span>
                    </div>
                  </div>

                  {b.installed && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                      {b.processCount > 0 && (
                        <button
                          type="button"
                          disabled={!canExecuteActions || busyKey !== null}
                          onClick={() =>
                            openConfirmAction('close_browser', {
                              titleEn: `Confirm Close ${b.browserLabel}`,
                              titleFa: `تأیید بستن ${b.browserLabel}`,
                              descriptionEn: `Terminate all ${b.processCount} running process(es) of ${b.browserLabel} on ${data.hostname}?`,
                              descriptionFa: `آیا از بستن تمام ${b.processCount} پروسس فعال ${b.browserLabel} روی سیستم «${data.hostname}» اطمینان دارید؟`,
                              tone: 'rose',
                              busyToken: `${b.browser}:close`,
                              browsers: [b.browser],
                            })
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-rose-500/35 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 text-[10px] font-bold cursor-pointer disabled:opacity-40"
                        >
                          <PowerOff className="w-3 h-3" />
                          <span>{isEn ? 'Close' : 'بستن'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!canExecuteActions || busyKey !== null}
                        onClick={() =>
                          openConfirmAction('clear_cache', {
                            titleEn: `Confirm Clear ${b.browserLabel} Cache`,
                            titleFa: `تأیید حذف کش ${b.browserLabel}`,
                            descriptionEn: `Clear web/GPU cache across all ${b.browserLabel} profiles on ${data.hostname}?`,
                            descriptionFa: `آیا از حذف کامل فایل‌های کش تمام پروفایل‌های ${b.browserLabel} روی «${data.hostname}» اطمینان دارید؟`,
                            tone: 'amber',
                            busyToken: `${b.browser}:cache`,
                            browsers: [b.browser],
                            closeBrowsersFirst: closeBrowsersOnCleanup,
                          })
                        }
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-semibold cursor-pointer disabled:opacity-40 ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-700 hover:bg-amber-50'
                            : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-amber-500/50'
                        }`}
                      >
                        <Eraser className="w-3 h-3 text-amber-500" />
                        <span>{isEn ? 'Cache' : 'حذف کش'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={!canExecuteActions || busyKey !== null}
                        onClick={() =>
                          openConfirmAction('clear_cookies', {
                            titleEn: `Confirm Clear ${b.browserLabel} Cookies`,
                            titleFa: `تأیید حذف کوکی‌های ${b.browserLabel}`,
                            descriptionEn: `Delete cookies${clearSiteStorageWithCookies ? ' and site storage (LocalStorage/IndexedDB)' : ''} for all ${b.browserLabel} profiles on ${data.hostname}? Active website logins will be signed out.`,
                            descriptionFa: `آیا از حذف کامل کوکی‌ها${clearSiteStorageWithCookies ? ' و حافظه نشست سایت‌ها' : ''} برای تمام پروفایل‌های ${b.browserLabel} اطمینان دارید؟ کاربر از وب‌سایت‌های لاگین‌شده خارج خواهد شد.`,
                            tone: 'rose',
                            busyToken: `${b.browser}:cookies`,
                            browsers: [b.browser],
                            closeBrowsersFirst: closeBrowsersOnCleanup,
                            clearSiteStorage: clearSiteStorageWithCookies,
                          })
                        }
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-semibold cursor-pointer disabled:opacity-40 ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-700 hover:bg-rose-50'
                            : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-rose-500/50'
                        }`}
                      >
                        <Cookie className="w-3 h-3 text-rose-500" />
                        <span>{isEn ? 'Cookies' : 'حذف کوکی'}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 2-Column Engineering Controls: Proxy + Homepage/Startup */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* PANEL A: Remote Browser Proxy Configuration */}
            <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-teal-500" />
                  <h3 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn ? 'Browser & System Proxy Configuration' : 'تنظیم پروکسی مرورگرها و سیستم'}
                  </h3>
                  <FieldInfoTooltip
                    title={isEn ? 'Browser Proxy Scopes' : 'محدوده اعمال پروکسی'}
                    isEn={isEn}
                    isLightMode={isLightMode}
                    infoWhatEn="Configures HTTP/HTTPS manual proxy or PAC auto-config across Windows WinINet (used automatically by Chrome, Edge, Opera, Vivaldi, Brave), Firefox prefs.js, and optional GPO Registry Policies."
                    infoWhatFa="تنظیم پروکسی دستی یا اسکریپت PAC روی لایه WinINet ویندوز (مورد استفاده خودکار Chrome، Edge، Brave و Opera)، فایل prefs.js فایرفاکس و یا پالیسی رجیستری."
                    infoWhyEn="Workstation users often need an internal proxy or proxy reset when VPNs disconnect leaving stale proxy entries that break internet/intranet access."
                    infoWhyFa="بسیاری از قطعی‌های اینترنت کاربران پس از قطع VPN به‌دلیل باقی ماندن پروکسی قبلی است یا نیاز به تنظیم پروکسی سازمانی برای دسترسی به پورتال‌ها وجود دارد."
                    infoExampleEn="Manual: 192.168.10.5:8080 with bypass <local>;10.*;192.168.* or PAC: http://wpad.corp.local/proxy.pac"
                    infoExampleFa="دستی: 192.168.10.5:8080 با استثناهای <local>;10.*;192.168.* یا اسکریپت PAC"
                  />
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    data.proxy.winInet.enabled || data.proxy.winInet.autoConfigUrl
                      ? isLightMode
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-amber-500/15 border-amber-500/35 text-amber-300'
                      : isLightMode
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                  }`}
                >
                  {data.proxy.winInet.autoConfigUrl
                    ? `PAC: ${data.proxy.winInet.autoConfigUrl}`
                    : data.proxy.winInet.enabled
                    ? `WinINet: ${data.proxy.winInet.server}`
                    : isEn
                    ? 'WinINet: Direct'
                    : 'WinINet: مستقیم (بدون پروکسی)'}
                </span>
              </div>

              {/* Current live snapshot of Firefox & Policies proxy */}
              {(data.proxy.firefoxProfiles.length > 0 || data.policies.some((p) => p.proxyMode) || data.osFamily === 'linux') && (
                <div className={`rounded-lg border p-2.5 text-[11px] space-y-1 ${subSurface}`}>
                  {data.proxy.firefoxProfiles.map((fp) => (
                    <div key={fp.profilePath} className="flex flex-wrap items-center justify-between gap-2">
                      <span className={textMuted}>
                        Firefox ({fp.osUser}/{fp.profileName}):
                      </span>
                      <span className="font-mono" dir="ltr">
                        {fp.proxyType === 0
                          ? 'Direct (0)'
                          : fp.proxyType === 1
                          ? `Manual ${fp.httpProxy}:${fp.httpPort || ''}`
                          : fp.proxyType === 2
                          ? `PAC ${fp.autoConfigUrl}`
                          : fp.proxyType === 5
                          ? 'Use System (5)'
                          : `Type ${fp.proxyType}`}
                      </span>
                    </div>
                  ))}
                  {data.policies
                    .filter((pol) => pol.proxyMode || pol.proxyServer || pol.proxyPacUrl)
                    .map((pol) => (
                      <div key={pol.browser} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-indigo-500 font-semibold">
                          Policy ({pol.browserLabel}):
                        </span>
                        <span className="font-mono" dir="ltr">
                          {pol.proxyMode} {pol.proxyServer || pol.proxyPacUrl || ''}
                        </span>
                      </div>
                    ))}
                  {data.osFamily === 'linux' &&
                    (data.proxy.linuxEnv.httpProxy || data.proxy.linuxEnv.httpsProxy) && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={textMuted}>Linux Env:</span>
                        <span className="font-mono" dir="ltr">
                          {data.proxy.linuxEnv.httpsProxy || data.proxy.linuxEnv.httpProxy}
                        </span>
                      </div>
                    )}
                </div>
              )}

              {/* Mode Selector */}
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'manual' as const, labelEn: 'Manual Server', labelFa: 'پروکسی دستی' },
                    { id: 'pac' as const, labelEn: 'PAC Auto-Config', labelFa: 'آدرس PAC' },
                    { id: 'direct' as const, labelEn: 'Direct (No Proxy)', labelFa: 'اتصال مستقیم' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setProxyMode(m.id)}
                      className={`py-2 px-2.5 rounded-lg border font-semibold transition cursor-pointer ${
                        proxyMode === m.id
                          ? 'bg-teal-600 border-teal-500 text-white shadow-sm'
                          : isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                          : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {isEn ? m.labelEn : m.labelFa}
                    </button>
                  ))}
                </div>

                {proxyMode === 'manual' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                        {isEn ? 'Proxy Server (host:port)' : 'آدرس و پورت سرور پروکسی'}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={proxyServer}
                        onChange={(e) => setProxyServer(e.target.value)}
                        placeholder="192.168.10.5:8080"
                        className={`w-full rounded-lg border px-3 py-2 text-xs font-mono outline-none ${inputClass}`}
                      />
                    </div>
                    <div>
                      <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                        {isEn ? 'Bypass List (Exclude)' : 'لیست استثناها (Bypass)'}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={proxyBypass}
                        onChange={(e) => setProxyBypass(e.target.value)}
                        placeholder="<local>;10.*;192.168.*"
                        className={`w-full rounded-lg border px-3 py-2 text-xs font-mono outline-none ${inputClass}`}
                      />
                    </div>
                  </div>
                )}

                {proxyMode === 'pac' && (
                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                      {isEn ? 'PAC Auto-Configuration URL' : 'لینک فایل تنظیم خودکار PAC'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={proxyPacUrl}
                      onChange={(e) => setProxyPacUrl(e.target.value)}
                      placeholder="http://wpad.company.local/proxy.pac"
                      className={`w-full rounded-lg border px-3 py-2 text-xs font-mono outline-none ${inputClass}`}
                    />
                  </div>
                )}

                {/* Target Browsers/Layers */}
                <div>
                  <div className={`text-[11px] font-semibold mb-1.5 ${textMuted}`}>
                    {isEn ? 'Apply To Layers & Browsers:' : 'اعمال روی لایه‌ها و مرورگرها:'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'wininet' as const, label: isEn ? 'Active User WinINet (Chrome/Edge/Brave)' : 'WinINet کاربر (Chrome/Edge)' },
                      { id: 'firefox' as const, label: isEn ? 'Firefox (prefs.js)' : 'فایرفاکس (prefs.js)' },
                      { id: 'chrome_policy' as const, label: isEn ? 'Chrome Policy (HKLM)' : 'پالیسی Chrome' },
                      { id: 'edge_policy' as const, label: isEn ? 'Edge Policy (HKLM)' : 'پالیسی Edge' },
                      { id: 'winhttp' as const, label: 'WinHTTP (netsh)' },
                    ].map((opt) => (
                      <label
                        key={opt.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] cursor-pointer transition ${
                          proxyTargets.includes(opt.id)
                            ? isLightMode
                              ? 'bg-teal-50 border-teal-300 text-teal-800 font-semibold'
                              : 'bg-teal-500/15 border-teal-500/40 text-teal-300 font-semibold'
                            : isLightMode
                            ? 'bg-white border-slate-200 text-slate-600'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={proxyTargets.includes(opt.id)}
                          onChange={() => toggleProxyTarget(opt.id)}
                          className="rounded border-slate-400 text-teal-600 focus:ring-teal-500"
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <label className={`inline-flex items-center gap-1.5 text-[11px] cursor-pointer ${textMuted}`}>
                    <input
                      type="checkbox"
                      checked={proxyAutoDetect}
                      onChange={(e) => setProxyAutoDetect(e.target.checked)}
                      className="rounded border-slate-400 text-teal-600"
                    />
                    <span>{isEn ? 'Auto-detect WPAD' : 'تشخیص خودکار WPAD'}</span>
                  </label>
                  <label className={`inline-flex items-center gap-1.5 text-[11px] cursor-pointer ${textMuted}`}>
                    <input
                      type="checkbox"
                      checked={proxyCloseFirst}
                      onChange={(e) => setProxyCloseFirst(e.target.checked)}
                      className="rounded border-slate-400 text-teal-600"
                    />
                    <span>
                      {isEn
                        ? 'Close Firefox before updating prefs.js'
                        : 'بستن فایرفاکس پیش از ویرایش prefs.js'}
                    </span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    type="button"
                    disabled={!canExecuteActions || busyKey !== null}
                    onClick={requestApplyProxy}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-40"
                  >
                    {busyKey === 'proxy:set' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Network className="w-3.5 h-3.5" />
                    )}
                    <span>{isEn ? 'Apply Proxy Settings' : 'اعمال تنظیمات پروکسی'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={!canExecuteActions || busyKey !== null}
                    onClick={requestClearProxy}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer disabled:opacity-40 ${
                      isLightMode
                        ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                        : 'bg-amber-500/15 border-amber-500/35 text-amber-300 hover:bg-amber-500/25'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Reset / Clear Proxy' : 'حذف و ریست پروکسی'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* PANEL B: Homepage & Startup URLs Configuration */}
            <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Home className="w-4 h-4 text-sky-500" />
                  <h3 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn ? 'Homepage & Startup Pages Control' : 'تنظیم صفحه خانه (Homepage) و صفحات شروع'}
                  </h3>
                  <FieldInfoTooltip
                    title={isEn ? 'Homepage & Policy Persistence' : 'تنظیم صفحه خانه و پالیسی'}
                    isEn={isEn}
                    isLightMode={isLightMode}
                    infoWhatEn="Remotely configures browser Home Button URL and Startup tabs across user profile preferences and/or Windows/Linux managed browser policies."
                    infoWhatFa="آدرس دکمه خانه (Home) و صفحات بازشونده هنگام شروع مرورگر را در فایل تنظیمات پروفایل و یا پالیسی سازمانی مرورگرها تنظیم می‌کند."
                    infoWhyEn="Standardizes corporate intranet/helpdesk portals as the browser landing page and removes hijacked adware startup pages."
                    infoWhyFa="برای یکسان‌سازی صفحه اول پورتال سازمانی یا پاک‌سازی صفحات تبلیغاتی مزاحم که روی استارت‌آپ مرورگر کاربر نشسته‌اند کاربرد دارد."
                    infoExampleEn="Set Homepage URL to https://portal.company.local with Startup = Open URLs and Scope = Policy + Profile."
                    infoExampleFa="تنظیم آدرس https://portal.company.local روی هر دو حالت پالیسی و تنظیمات پروفایل."
                  />
                </div>
                {data.policies.some((p) => p.homepageLocation || p.restoreOnStartupUrls.length > 0) && (
                  <button
                    type="button"
                    disabled={!canExecuteActions || busyKey !== null}
                    onClick={() =>
                      openConfirmAction('clear_policies', {
                        titleEn: 'Confirm Clear Managed Browser Policies',
                        titleFa: 'تأیید حذف پالیسی‌های رجیستری مرورگر',
                        descriptionEn: `Remove HKLM browser policy overrides (Homepage, Startup URLs, ProxyMode) for Chrome/Edge/Brave on ${data.hostname}?`,
                        descriptionFa: `آیا از حذف پالیسی‌های رجیستری مرورگرها (صفحه خانه، آدرس شروع و پروکسی) روی سیستم «${data.hostname}» اطمینان دارید؟`,
                        tone: 'amber',
                        busyToken: 'policies:clear',
                        browsers: ['chrome', 'edge', 'brave'],
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer disabled:opacity-40 ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-amber-50'
                        : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-amber-500/40'
                    }`}
                  >
                    {isEn ? 'Clear Policy Overrides' : 'حذف پالیسی‌های مرورگر'}
                  </button>
                )}
              </div>

              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                      {isEn ? 'Homepage URL' : 'آدرس صفحه خانه (Homepage)'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      disabled={homepageIsNewTab}
                      value={homepageUrl}
                      onChange={(e) => setHomepageUrl(e.target.value)}
                      placeholder="https://portal.company.local"
                      className={`w-full rounded-lg border px-3 py-2 text-xs font-mono outline-none disabled:opacity-50 ${inputClass}`}
                    />
                    <label className={`inline-flex items-center gap-1.5 mt-1.5 text-[11px] cursor-pointer ${textMuted}`}>
                      <input
                        type="checkbox"
                        checked={homepageIsNewTab}
                        onChange={(e) => setHomepageIsNewTab(e.target.checked)}
                        className="rounded border-slate-400 text-teal-600"
                      />
                      <span>{isEn ? 'Use Default New Tab as Homepage' : 'استفاده از تب جدید پیش‌فرض'}</span>
                    </label>
                  </div>

                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                      {isEn ? 'On Browser Startup Behavior' : 'رفتار هنگام باز شدن مرورگر'}
                    </label>
                    <select
                      value={restoreOnStartup}
                      onChange={(e) => setRestoreOnStartup(e.target.value as any)}
                      className={`w-full rounded-lg border px-3 py-2 text-xs outline-none ${inputClass}`}
                    >
                      <option value="urls">
                        {isEn ? 'Open specific URL(s)' : 'باز کردن آدرس(های) مشخص'}
                      </option>
                      <option value="newtab">
                        {isEn ? 'Open New Tab Page' : 'باز کردن صفحه تب جدید'}
                      </option>
                      <option value="continue">
                        {isEn ? 'Continue where user left off' : 'ادامه تب‌های نشست قبلی'}
                      </option>
                    </select>

                    <label className={`block text-[11px] font-semibold mt-2 mb-1 ${textMuted}`}>
                      {isEn ? 'Application Scope' : 'نحوه و محدوده اعمال'}
                    </label>
                    <select
                      value={homepageScope}
                      onChange={(e) => setHomepageScope(e.target.value as any)}
                      className={`w-full rounded-lg border px-3 py-1.5 text-xs outline-none ${inputClass}`}
                    >
                      <option value="both">
                        {isEn ? 'Managed Policy + Profile Preferences' : 'پالیسی سیستمی + تنظیمات پروفایل'}
                      </option>
                      <option value="policy">
                        {isEn ? 'Policy Only (Registry — no restart lock)' : 'فقط پالیسی رجیستری (بدون تداخل با فایل باز)'}
                      </option>
                      <option value="profile_prefs">
                        {isEn ? 'Profile Preferences Files Only' : 'فقط فایل تنظیمات پروفایل'}
                      </option>
                    </select>
                  </div>
                </div>

                {restoreOnStartup === 'urls' && (
                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${textMuted}`}>
                      {isEn
                        ? 'Extra Startup URLs (optional — defaults to Homepage URL above, separate by comma or newline)'
                        : 'آدرس‌های شروع اضافی (اختیاری — در صورت خالی بودن از همان صفحه خانه استفاده می‌شود)'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={startupUrlsText}
                      onChange={(e) => setStartupUrlsText(e.target.value)}
                      placeholder="https://intranet.local, https://mail.company.local"
                      className={`w-full rounded-lg border px-3 py-1.5 text-xs font-mono outline-none ${inputClass}`}
                    />
                  </div>
                )}

                <div>
                  <div className={`text-[11px] font-semibold mb-1.5 ${textMuted}`}>
                    {isEn ? 'Target Browsers:' : 'مرورگرهای هدف:'}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_VENDORS.map((v) => (
                      <label
                        key={v.id}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] cursor-pointer ${
                          homepageBrowsers.includes(v.id)
                            ? isLightMode
                              ? 'bg-sky-50 border-sky-300 text-sky-800 font-semibold'
                              : 'bg-sky-500/15 border-sky-500/40 text-sky-300 font-semibold'
                            : isLightMode
                            ? 'bg-white border-slate-200 text-slate-600'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={homepageBrowsers.includes(v.id)}
                          onChange={() => toggleHomepageBrowser(v.id)}
                          className="rounded border-slate-400 text-sky-600"
                        />
                        <span>{v.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <label className={`inline-flex items-center gap-1.5 text-[11px] cursor-pointer ${textMuted}`}>
                  <input
                    type="checkbox"
                    checked={homepageCloseFirst}
                    onChange={(e) => setHomepageCloseFirst(e.target.checked)}
                    className="rounded border-slate-400 text-sky-600"
                  />
                  <span>
                    {isEn
                      ? 'Close running target browsers before writing Preferences / prefs.js'
                      : 'بستن مرورگرهای باز پیش از نوشتن فایل‌های Preferences / prefs.js'}
                  </span>
                </label>

                <div className="pt-1">
                  <button
                    type="button"
                    disabled={!canExecuteActions || busyKey !== null}
                    onClick={requestApplyHomepage}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-40"
                  >
                    {busyKey === 'homepage:set' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Home className="w-3.5 h-3.5" />
                    )}
                    <span>{isEn ? 'Apply Homepage & Startup' : 'اعمال صفحه خانه و شروع'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Cleanup Options & User Profiles Matrix */}
          <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-teal-500" />
                <h3 className={`text-sm font-bold ${textPrimary}`}>
                  {isEn
                    ? 'Browser Profiles, Bookmarks Backup, Cookies, Cache & Lock Repair'
                    : 'پروفایل‌های مرورگر، بکاپ بوکمارک‌ها، کوکی، کش و رفع قفل‌ها'}
                </h3>
                <FieldInfoTooltip
                  title={isEn ? 'Profile Engineering Controls' : 'ابزارهای مهندسی پروفایل'}
                  isEn={isEn}
                  isLightMode={isLightMode}
                  infoWhatEn="Per-profile remote toolkit to export bookmarks (standard Netscape HTML or JSON), purge cookies/cache, delete stuck HSTS entries (TransportSecurity), and remove stale lock files."
                  infoWhatFa="ابزارهای عملیاتی برای هر پروفایل شامل خروجی بوکمارک (HTML استاندارد قابل ایمپورت یا JSON)، پاک‌سازی کوکی و کش، حذف کش HSTS برای رفع خطای گواهی داخلی و رفع قفل پروفایل."
                  infoWhyEn="If a browser refuses to open ('Profile in use' after a crash) or an internal web app fails due to HSTS/corrupt cookies, technicians can surgically fix that specific profile without wiping the user's whole profile."
                  infoWhyFa="هنگامی که مرورگر پس از کرش باز نمی‌شود یا پورتال داخلی به علت کش/کوکی خراب یا HSTS خطا می‌دهد، بدون حذف کامل پروفایل کاربر مشکل به‌صورت نقطه‌ای حل می‌شود."
                  infoExampleEn="1) Backup Bookmarks (.html) -> 2) Close Browser & Clear Cookies -> 3) Repair Profile Lock."
                  infoExampleFa="۱) بکاپ بوکمارک (.html) ← ۲) بستن مرورگر و حذف کوکی ← ۳) رفع قفل پروفایل."
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className={`inline-flex items-center gap-1.5 cursor-pointer ${textMuted}`}>
                  <input
                    type="checkbox"
                    checked={closeBrowsersOnCleanup}
                    onChange={(e) => setCloseBrowsersOnCleanup(e.target.checked)}
                    className="rounded border-slate-400 text-teal-600"
                  />
                  <span>{isEn ? 'Auto-close browser on cleanup' : 'بستن خودکار مرورگر هنگام پاک‌سازی'}</span>
                </label>

                <label className={`inline-flex items-center gap-1.5 cursor-pointer ${textMuted}`}>
                  <input
                    type="checkbox"
                    checked={clearSiteStorageWithCookies}
                    onChange={(e) => setClearSiteStorageWithCookies(e.target.checked)}
                    className="rounded border-slate-400 text-rose-600"
                  />
                  <span>{isEn ? 'Include LocalStorage/IndexedDB' : 'حذف LocalStorage/IndexedDB همراه کوکی'}</span>
                </label>

                <select
                  value={profileUserFilter}
                  onChange={(e) => setProfileUserFilter(e.target.value)}
                  className={`rounded-lg border px-2.5 py-1 text-xs outline-none ${inputClass}`}
                >
                  <option value="all">{isEn ? 'All OS Users' : 'همه کاربران سیستم'}</option>
                  {osUsers.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>

                <select
                  value={profileBrowserFilter}
                  onChange={(e) => setProfileBrowserFilter(e.target.value)}
                  className={`rounded-lg border px-2.5 py-1 text-xs outline-none ${inputClass}`}
                >
                  <option value="all">{isEn ? 'All Browsers' : 'همه مرورگرها'}</option>
                  {ALL_VENDORS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredProfiles.length === 0 ? (
              <div className={`text-center py-6 text-xs ${textMuted}`}>
                {isEn ? 'No browser profiles matched the current filter.' : 'پروفایلی با فیلتر فعلی یافت نشد.'}
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredProfiles.map((pr) => (
                  <div
                    key={pr.id}
                    className={`rounded-xl border p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${subSurface}`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-bold ${getVendorBadgeClass(
                            pr.browser,
                            isLightMode
                          )}`}
                        >
                          {pr.browserLabel}
                        </span>
                        <span className={`text-xs font-bold ${textPrimary}`}>
                          {pr.osUser} / {pr.profileName}
                        </span>
                        {pr.accountEmail && (
                          <span className={`text-[11px] font-mono ${textMuted}`} dir="ltr">
                            ({pr.accountEmail})
                          </span>
                        )}
                        {pr.lockDetected && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 text-[10px] font-semibold">
                            <Lock className="w-2.5 h-2.5" />
                            <span>{isEn ? 'Lock File' : 'فایل قفل'}</span>
                          </span>
                        )}
                        {pr.transportSecurityPresent && (
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${
                              isLightMode
                                ? 'bg-white border-slate-300 text-slate-600'
                                : 'bg-slate-900 border-slate-700 text-slate-300'
                            }`}
                          >
                            <KeyRound className="w-2.5 h-2.5 text-indigo-400" />
                            <span>HSTS</span>
                          </span>
                        )}
                      </div>

                      <div className={`text-[11px] flex flex-wrap items-center gap-3 ${textMuted}`}>
                        <span>
                          <Bookmark className="w-3 h-3 inline me-1 text-emerald-500" />
                          {isEn ? 'Bookmarks:' : 'بوکمارک:'} <strong className={textPrimary}>{pr.bookmarkCount}</strong>
                        </span>
                        <span>
                          <HardDrive className="w-3 h-3 inline me-1 text-amber-500" />
                          {isEn ? 'Cache:' : 'کش:'} <strong className={textPrimary}>{pr.cacheSizeMb} MB</strong>
                        </span>
                        <span>
                          <Cookie className="w-3 h-3 inline me-1 text-rose-500" />
                          {isEn ? 'Cookies:' : 'کوکی:'} <strong className={textPrimary}>{pr.cookiesSizeMb} MB</strong>
                        </span>
                        <span>
                          <Puzzle className="w-3 h-3 inline me-1 text-indigo-500" />
                          {isEn ? 'Extensions:' : 'افزونه‌ها:'} <strong className={textPrimary}>{pr.extensionCount}</strong>
                        </span>
                      </div>

                      <div className={`text-[11px] flex flex-wrap items-center gap-2 ${textMuted}`}>
                        <span>{isEn ? 'Homepage:' : 'صفحه خانه:'}</span>
                        <span className="font-mono truncate max-w-md" dir="ltr">
                          {pr.homepageIsNewTab
                            ? isEn
                              ? 'New Tab'
                              : 'تب جدید'
                            : pr.homepage || (pr.startupUrls[0] || (isEn ? 'Default / Unset' : 'پیش‌فرض'))}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={!pr.hasBookmarksFile || backingUpKey !== null}
                        onClick={() => handleBackupDownload('html', pr)}
                        title={isEn ? 'Export Netscape HTML bookmarks file' : 'دانلود فایل استاندارد HTML بوکمارک‌ها'}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 ${
                          isLightMode
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                            : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25'
                        }`}
                      >
                        {backingUpKey === `${pr.id}:html` ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                        <span>{isEn ? 'Bookmarks .html' : 'بکاپ بوکمارک'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={!pr.hasBookmarksFile || backingUpKey !== null}
                        onClick={() => handleBackupDownload('json', pr)}
                        title={isEn ? 'Export Bookmarks as JSON' : 'خروجی JSON بوکمارک‌ها'}
                        className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                            : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <FileJson className="w-3 h-3 text-teal-500" />
                        <span>JSON</span>
                      </button>

                      <button
                        type="button"
                        disabled={!canExecuteActions || busyKey !== null}
                        onClick={() =>
                          openConfirmAction('clear_cache', {
                            titleEn: `Clear Cache — ${pr.browserLabel} (${pr.profileName})`,
                            titleFa: `حذف کش — ${pr.browserLabel} (${pr.profileName})`,
                            descriptionEn: `Delete ~${pr.cacheSizeMb} MB of web/GPU cache files from profile "${pr.osUser} / ${pr.profileName}"?`,
                            descriptionFa: `آیا از حذف حدود ${pr.cacheSizeMb} مگابایت فایل کش در پروفایل «${pr.osUser} / ${pr.profileName}» اطمینان دارید؟`,
                            tone: 'amber',
                            busyToken: `${pr.id}:cache`,
                            browsers: [pr.browser],
                            profilePaths: [pr.profilePath],
                            closeBrowsersFirst: closeBrowsersOnCleanup,
                          })
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-700 hover:bg-amber-50'
                            : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-amber-500/40'
                        }`}
                      >
                        <Eraser className="w-3 h-3 text-amber-500" />
                        <span>{isEn ? 'Clear Cache' : 'حذف کش'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={!canExecuteActions || busyKey !== null}
                        onClick={() =>
                          openConfirmAction('clear_cookies', {
                            titleEn: `Clear Cookies — ${pr.browserLabel} (${pr.profileName})`,
                            titleFa: `حذف کوکی‌ها — ${pr.browserLabel} (${pr.profileName})`,
                            descriptionEn: `Delete cookies (~${pr.cookiesSizeMb} MB)${clearSiteStorageWithCookies ? ' + site storage' : ''} for "${pr.osUser} / ${pr.profileName}"? Saved sessions will sign out.`,
                            descriptionFa: `آیا از حذف کوکی‌های پروفایل «${pr.osUser} / ${pr.profileName}» (${pr.cookiesSizeMb} مگابایت)${clearSiteStorageWithCookies ? ' و حافظه سایت‌ها' : ''} اطمینان دارید؟ نشست‌های لاگین‌شده در وب‌سایت‌ها بسته می‌شوند.`,
                            tone: 'rose',
                            busyToken: `${pr.id}:cookies`,
                            browsers: [pr.browser],
                            profilePaths: [pr.profilePath],
                            closeBrowsersFirst: closeBrowsersOnCleanup,
                            clearSiteStorage: clearSiteStorageWithCookies,
                          })
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-700 hover:bg-rose-50'
                            : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-rose-500/40'
                        }`}
                      >
                        <Cookie className="w-3 h-3 text-rose-500" />
                        <span>{isEn ? 'Clear Cookies' : 'حذف کوکی'}</span>
                      </button>

                      {pr.transportSecurityPresent && (
                        <button
                          type="button"
                          disabled={!canExecuteActions || busyKey !== null}
                          onClick={() =>
                            openConfirmAction('clear_transport_security', {
                              titleEn: `Reset HSTS Cache — ${pr.profileName}`,
                              titleFa: `حذف کش HSTS — ${pr.profileName}`,
                              descriptionEn: `Delete TransportSecurity / HSTS state for "${pr.osUser} / ${pr.profileName}"? Fixes internal HTTPS certificate/redirect loops.`,
                              descriptionFa: `آیا از حذف فایل وضعیت HSTS (TransportSecurity) در پروفایل «${pr.osUser} / ${pr.profileName}» اطمینان دارید؟ برای رفع خطای گواهی SSL سایت‌های داخلی کاربرد دارد.`,
                              tone: 'teal',
                              busyToken: `${pr.id}:hsts`,
                              browsers: [pr.browser],
                              profilePaths: [pr.profilePath],
                              closeBrowsersFirst: closeBrowsersOnCleanup,
                            })
                          }
                          className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-700 hover:bg-indigo-50'
                              : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-indigo-500/40'
                          }`}
                        >
                          <KeyRound className="w-3 h-3 text-indigo-400" />
                          <span>{isEn ? 'Clear HSTS' : 'حذف HSTS'}</span>
                        </button>
                      )}

                      {pr.lockDetected && (
                        <button
                          type="button"
                          disabled={!canExecuteActions || busyKey !== null}
                          onClick={() =>
                            openConfirmAction('repair_profile_locks', {
                              titleEn: `Repair Stale Lock — ${pr.profileName}`,
                              titleFa: `رفع قفل پروفایل — ${pr.profileName}`,
                              descriptionEn: `Remove stale SingletonLock / parent.lock files for "${pr.osUser} / ${pr.profileName}" (skipped automatically if the browser is actively running).`,
                              descriptionFa: `آیا از حذف فایل‌های قفل مانده پروفایل «${pr.osUser} / ${pr.profileName}» (در صورت بسته بودن مرورگر) اطمینان دارید؟`,
                              tone: 'amber',
                              busyToken: `${pr.id}:lock`,
                              browsers: [pr.browser],
                              profilePaths: [pr.profilePath],
                            })
                          }
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 text-[11px] font-bold transition cursor-pointer disabled:opacity-40"
                        >
                          <Wrench className="w-3 h-3" />
                          <span>{isEn ? 'Unlock Profile' : 'رفع قفل'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Installed Extensions Inventory & Remote Removal */}
          <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Puzzle className="w-4 h-4 text-indigo-500" />
                <h3 className={`text-sm font-bold ${textPrimary}`}>
                  {isEn
                    ? 'Installed Browser Extensions Management'
                    : 'مدیریت و حذف افزونه‌های نصب‌شده (Extensions)'}
                </h3>
                <span className={`text-xs font-mono ${textMuted}`}>
                  ({filteredExtensions.length} / {data.extensions.length})
                </span>
                <FieldInfoTooltip
                  title={isEn ? 'Extension Uninstall & Policy Block' : 'حذف و مسدودسازی افزونه‌ها'}
                  isEn={isEn}
                  isLightMode={isLightMode}
                  infoWhatEn="Lists installed extensions across all discovered Chrome, Edge, Brave, Opera, Vivaldi and Firefox profiles with remote uninstall and optional policy blocklist."
                  infoWhatFa="فهرست تمام افزونه‌های نصب‌شده در پروفایل‌های کاربران را نمایش می‌دهد و امکان حذف کامل یا مسدودسازی مجدد از طریق پالیسی مرورگر را فراهم می‌کند."
                  infoWhyEn="Malicious toolbars, adware, proxy hijackers and broken extensions frequently cause slowdowns or portal errors."
                  infoWhyFa="افزونه‌های تبلیغاتی، مخرب یا ناسازگار یکی از دلایل اصلی کندی مرورگر، تغییر پروکسی ناخواسته یا اختلال در پورتال‌های داخلی هستند."
                  infoExampleEn="Select suspicious extensions and click Uninstall; enable Policy Block if Google/Microsoft Sync keeps re-installing an unwanted add-on."
                  infoExampleFa="افزونه‌های مشکوک را حذف کنید و اگر مرورگر از طریق Sync دوباره آن را نصب می‌کند، تیک مسدودسازی پالیسی را در پنجره تأیید فعال کنید."
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedExtensionsList.length > 0 && (
                  <>
                    <button
                      type="button"
                      disabled={!canExecuteActions || busyKey !== null}
                      onClick={() => requestRemoveExtensions(selectedExtensionsList)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>
                        {isEn
                          ? `Uninstall Selected (${selectedExtensionsList.length})`
                          : `حذف انتخاب‌شده‌ها (${selectedExtensionsList.length})`}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedExtKeys([])}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
                        isLightMode
                          ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {isEn ? 'Clear Selection' : 'لغو انتخاب'}
                    </button>
                  </>
                )}

                <div className="relative">
                  <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-2.5 ${textMuted}`} />
                  <input
                    type="text"
                    value={extSearch}
                    onChange={(e) => setExtSearch(e.target.value)}
                    placeholder={isEn ? 'Search extension name or ID...' : 'جستجوی نام یا شناسه افزونه...'}
                    className={`rounded-lg border ps-8 pe-3 py-1.5 text-xs outline-none w-52 ${inputClass}`}
                  />
                </div>
                {osUsers.length > 0 && (
                  <select
                    value={extUserFilter}
                    onChange={(e) => setExtUserFilter(e.target.value)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs outline-none ${inputClass}`}
                  >
                    <option value="all">{isEn ? 'All OS Users' : 'همه کاربران'}</option>
                    {osUsers.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  value={extBrowserFilter}
                  onChange={(e) => setExtBrowserFilter(e.target.value)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs outline-none ${inputClass}`}
                >
                  <option value="all">{isEn ? 'All Browsers' : 'همه مرورگرها'}</option>
                  {ALL_VENDORS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredExtensions.length === 0 ? (
              <div className={`text-center py-6 text-xs ${textMuted}`}>
                {isEn ? 'No extensions found matching filters.' : 'افزونه‌ای با این فیلتر یافت نشد.'}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-xs text-start">
                  <thead
                    className={`sticky top-0 z-10 ${
                      isLightMode ? 'bg-slate-100 text-slate-700' : 'bg-slate-950 text-slate-300'
                    }`}
                  >
                    <tr>
                      <th className="px-3 py-2 w-8 text-center">
                        <input
                          type="checkbox"
                          checked={allVisibleRemovableSelected}
                          onChange={toggleSelectAllVisibleExtensions}
                          disabled={removableFilteredExtensions.length === 0}
                          title={isEn ? 'Select all removable extensions' : 'انتخاب همه افزونه‌های قابل حذف'}
                          className="rounded border-slate-400 cursor-pointer accent-rose-600"
                        />
                      </th>
                      <th className="px-3 py-2 font-semibold">{isEn ? 'Extension Name' : 'نام افزونه'}</th>
                      <th className="px-3 py-2 font-semibold">{isEn ? 'Browser / Profile' : 'مرورگر / پروفایل'}</th>
                      <th className="px-3 py-2 font-semibold">{isEn ? 'Version' : 'نسخه'}</th>
                      <th className="px-3 py-2 font-semibold">{isEn ? 'Status' : 'وضعیت'}</th>
                      <th className="px-3 py-2 font-semibold">{isEn ? 'Source / ID' : 'منبع / شناسه'}</th>
                      <th className="px-3 py-2 font-semibold text-end">{isEn ? 'Actions' : 'مدیریت'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredExtensions.map((ex, i) => {
                      const rowKey = getExtensionRowKey(ex);
                      const isInternal = ex.installType === 'internal';
                      const isChecked = selectedExtKeys.includes(rowKey);
                      const rowBusy = busyKey === `ext:rm:${ex.browser}:${ex.extensionId}`;
                      return (
                        <tr
                          key={`${rowKey}-${i}`}
                          className={
                            isChecked
                              ? isLightMode
                                ? 'bg-rose-50/70'
                                : 'bg-rose-950/25'
                              : isLightMode
                              ? 'hover:bg-slate-50'
                              : 'hover:bg-slate-800/40'
                          }
                        >
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isInternal}
                              onChange={() => toggleSelectExtRow(ex)}
                              title={
                                isInternal
                                  ? isEn
                                    ? 'Built-in component cannot be selected'
                                    : 'افزونه داخلی قابل انتخاب نیست'
                                  : undefined
                              }
                              className="rounded border-slate-400 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed accent-rose-600"
                            />
                          </td>
                          <td className={`px-3 py-2 font-semibold ${textPrimary}`}>{ex.name}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-bold me-1.5 ${getVendorBadgeClass(
                                ex.browser,
                                isLightMode
                              )}`}
                            >
                              {ex.browserLabel}
                            </span>
                            <span className={textMuted}>
                              {ex.osUser} / {ex.profileName}
                            </span>
                          </td>
                          <td className={`px-3 py-2 font-mono ${textMuted}`} dir="ltr">
                            {ex.version || '-'}
                          </td>
                          <td className="px-3 py-2">
                            {ex.enabled === true ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-500">
                                {isEn ? 'Enabled' : 'فعال'}
                              </span>
                            ) : ex.enabled === false ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-500/15 text-slate-400">
                                {isEn ? 'Disabled' : 'غیرفعال'}
                              </span>
                            ) : (
                              <span className={textMuted}>-</span>
                            )}
                          </td>
                          <td className={`px-3 py-2 font-mono text-[11px] ${textMuted}`} dir="ltr">
                            <span className="me-1.5 opacity-80">[{ex.installType}]</span>
                            {ex.extensionId}
                          </td>
                          <td className="px-3 py-2 text-end">
                            {isInternal ? (
                              <span
                                title={
                                  isEn
                                    ? 'Built-in browser component cannot be uninstalled'
                                    : 'افزونه سیستمی داخلی مرورگر قابل حذف نیست'
                                }
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-medium opacity-70 ${
                                  isLightMode
                                    ? 'bg-slate-100 border-slate-200 text-slate-500'
                                    : 'bg-slate-800/70 border-slate-700 text-slate-400'
                                }`}
                              >
                                <Lock className="w-3 h-3" />
                                <span>{isEn ? 'Built-in' : 'داخلی'}</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={!canExecuteActions || busyKey !== null}
                                onClick={() => requestRemoveExtensions([ex])}
                                title={
                                  isEn
                                    ? `Uninstall ${ex.name} from ${ex.profileName}`
                                    : `حذف افزونه ${ex.name} از پروفایل ${ex.profileName}`
                                }
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition cursor-pointer disabled:opacity-45 ${
                                  isLightMode
                                    ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                                    : 'bg-rose-500/15 border-rose-500/35 text-rose-300 hover:bg-rose-500/25'
                                }`}
                              >
                                {rowBusy ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3 h-3" />
                                )}
                                <span>{isEn ? 'Remove' : 'حذف'}</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Confirmation Modal (Mandatory Footer Clearance bottom-8 & z-[99999]) */}
      {pendingConfirm &&
        createPortal(
          <div
            dir={isEn ? 'ltr' : 'rtl'}
            className="fixed top-0 left-0 right-0 bottom-8 z-[99999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
            onClick={(e) => {
              if (e.target === e.currentTarget) setPendingConfirm(null);
            }}
          >
            <div
              className={`relative w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden animate-scale-up ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-900'
                  : 'bg-slate-900 border-slate-700/80 text-slate-100'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`flex items-center justify-between gap-3 px-5 py-4 border-b ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`p-2 rounded-xl border shrink-0 ${
                      pendingConfirm.tone === 'rose'
                        ? 'bg-rose-500/15 border-rose-500/35 text-rose-500'
                        : pendingConfirm.tone === 'amber'
                        ? 'bg-amber-500/15 border-amber-500/35 text-amber-500'
                        : 'bg-teal-500/15 border-teal-500/35 text-teal-500'
                    }`}
                  >
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className={`text-sm font-bold truncate ${textPrimary}`}>
                      {isEn ? pendingConfirm.titleEn : pendingConfirm.titleFa}
                    </h3>
                    <p className={`text-[11px] truncate ${textMuted}`} dir="ltr">
                      {data?.hostname || targetIp}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingConfirm(null)}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    isLightMode
                      ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                      : 'text-slate-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 text-xs leading-relaxed space-y-3">
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${
                    pendingConfirm.tone === 'rose'
                      ? isLightMode
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : 'bg-rose-950/30 border-rose-500/40 text-rose-100'
                      : pendingConfirm.tone === 'amber'
                      ? isLightMode
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-amber-950/30 border-amber-500/40 text-amber-100'
                      : isLightMode
                      ? 'bg-teal-50 border-teal-200 text-teal-900'
                      : 'bg-teal-950/25 border-teal-500/35 text-teal-100'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{isEn ? pendingConfirm.descriptionEn : pendingConfirm.descriptionFa}</span>
                </div>

                {pendingConfirm.isExtensionRemove &&
                  pendingConfirm.extensionTargets &&
                  pendingConfirm.extensionTargets.length > 0 && (
                    <div className="space-y-2.5">
                      <div
                        className={`max-h-36 overflow-y-auto rounded-xl border divide-y ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-200 divide-slate-200'
                            : 'bg-slate-950/60 border-slate-800 divide-slate-800'
                        }`}
                      >
                        {pendingConfirm.extensionTargets.map((t, idx) => (
                          <div
                            key={`${t.extensionId}-${idx}`}
                            className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]"
                          >
                            <div className="min-w-0">
                              <div className={`font-semibold truncate ${textPrimary}`}>{t.name}</div>
                              <div className={`font-mono truncate ${textMuted}`} dir="ltr">
                                {t.extensionId}
                              </div>
                            </div>
                            <span
                              className={`shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${getVendorBadgeClass(
                                t.browser,
                                isLightMode
                              )}`}
                            >
                              {t.browserLabel} • {t.osUser}/{t.profileName}
                            </span>
                          </div>
                        ))}
                      </div>

                      <label
                        className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer ${subSurface}`}
                      >
                        <input
                          type="checkbox"
                          checked={confirmCloseBrowsers}
                          onChange={(e) => setConfirmCloseBrowsers(e.target.checked)}
                          className="mt-0.5 rounded accent-teal-600 cursor-pointer"
                        />
                        <span>
                          <span className={`block font-semibold ${textPrimary}`}>
                            {isEn
                              ? 'Close running target browser(s) first (Recommended)'
                              : 'بستن پروسس‌های مرورگر هدف پیش از حذف (توصیه‌شده)'}
                          </span>
                          <span className={`block text-[10px] ${textMuted}`}>
                            {isEn
                              ? 'Prevents locked files and stops an open browser from re-writing Preferences on exit.'
                              : 'از قفل بودن فایل‌های افزونه و بازنویسی فایل Preferences هنگام بسته شدن مرورگر جلوگیری می‌کند.'}
                          </span>
                        </span>
                      </label>

                      <label
                        className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer ${subSurface}`}
                      >
                        <input
                          type="checkbox"
                          checked={confirmBlockPolicy}
                          onChange={(e) => setConfirmBlockPolicy(e.target.checked)}
                          className="mt-0.5 rounded accent-rose-600 cursor-pointer"
                        />
                        <span>
                          <span className={`block font-semibold ${textPrimary}`}>
                            {isEn
                              ? 'Block future re-install via Browser Policy (Blocklist)'
                              : 'مسدودسازی نصب مجدد از طریق پالیسی مرورگر (Blocklist)'}
                          </span>
                          <span className={`block text-[10px] ${textMuted}`}>
                            {isEn
                              ? 'Adds extension ID to Chrome/Edge ExtensionInstallBlocklist (or Firefox Uninstall policy) so Sync cannot restore it.'
                              : 'شناسه افزونه را در لیست سیاه پالیسی Chrome/Edge یا Uninstall فایرفاکس ثبت می‌کند تا از طریق Sync برنگردد.'}
                          </span>
                        </span>
                      </label>
                    </div>
                  )}
              </div>

              <div
                className={`flex items-center justify-end gap-2 px-5 py-3.5 border-t ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setPendingConfirm(null)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    isLightMode
                      ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="button"
                  disabled={!canExecuteActions || busyKey !== null}
                  onClick={confirmAndRun}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-lg transition cursor-pointer disabled:opacity-50 ${
                    pendingConfirm.tone === 'rose'
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : pendingConfirm.tone === 'amber'
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : 'bg-teal-600 hover:bg-teal-500'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Confirm & Execute' : 'تأیید و اجرا'}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
