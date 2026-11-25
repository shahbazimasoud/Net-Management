import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderPlus,
  FolderOpen,
  Server,
  Search,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  Users,
  UserCog,
  KeyRound,
  Eye,
  EyeOff,
  Lock,
  HardDrive,
} from 'lucide-react';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import {
  fetchHelpdeskFileServerShares,
  mapHelpdeskEndpointShare,
  HelpdeskConnectionPayload,
} from '../../services/api';

export interface EndpointUserProfileItem {
  username: string;
  sid: string;
  profilePath: string;
  isLoaded: boolean;
  isActiveLoggedIn: boolean;
}

export interface FileServerShareBrowseItem {
  name: string;
  uncPath: string;
  description: string;
  shareType: string;
  isAdminShare: boolean;
  alreadyMapped: boolean;
  mappedDriveLetter: string;
}

interface NetworkShareMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  isLightMode: boolean;
  isEn: boolean;
  canExecuteActions: boolean;
  buildPayload: () => HelpdeskConnectionPayload | null;
  workstationIp: string;
  detectedLoggedInUser?: string;
  userProfiles: EndpointUserProfileItem[];
  usedDriveLetters?: string[];
  disks?: Array<{ drive?: string; driveLetter?: string }>;
  existingShares?: Array<{ driveLetter?: string }>;
  initialRemotePath?: string;
  initialDriveLetter?: string;
  initialScope?: 'active_user' | 'specific_user' | 'all_users';
  onMapped?: (result: any) => void;
  onRateLimitUpdate?: (rl: any) => void;
}

const DRIVE_LETTERS = [
  'Z:', 'Y:', 'X:', 'W:', 'V:', 'U:', 'T:', 'S:', 'R:', 'Q:', 'P:',
  'O:', 'N:', 'M:', 'L:', 'K:', 'J:', 'I:', 'H:', 'G:', 'F:', 'E:', 'D:',
];

function normalizeDriveLetterToken(raw: unknown): string | null {
  const s = String(raw || '').trim().toUpperCase();
  const m = /^([A-Z])(?::|\\)?$/.exec(s) || /^([A-Z]):/.exec(s);
  return m ? `${m[1]}:` : null;
}

export const NetworkShareMapModal: React.FC<NetworkShareMapModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  isLightMode,
  isEn,
  canExecuteActions,
  buildPayload,
  workstationIp,
  detectedLoggedInUser = '',
  userProfiles,
  usedDriveLetters = [],
  disks = [],
  existingShares = [],
  initialRemotePath = '',
  initialDriveLetter = 'AUTO',
  initialScope,
  onMapped,
  onRateLimitUpdate,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  // Server browser state
  const [fileServer, setFileServer] = useState('');
  const [showAdminShares, setShowAdminShares] = useState(false);
  const [loadingShares, setLoadingShares] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [serverBrowseData, setServerBrowseData] = useState<{
    fileServer: string;
    shares: FileServerShareBrowseItem[];
  } | null>(null);
  const [shareFilter, setShareFilter] = useState('');

  // Mapping configuration state
  const [remotePath, setRemotePath] = useState(initialRemotePath);
  const [driveLetter, setDriveLetter] = useState(initialDriveLetter || 'AUTO');
  const [label, setLabel] = useState('');
  const [persistent, setPersistent] = useState(true);
  const [scope, setScope] = useState<'active_user' | 'specific_user' | 'all_users'>(
    initialScope || (detectedLoggedInUser ? 'active_user' : userProfiles.length > 0 ? 'specific_user' : 'all_users')
  );
  const [selectedSids, setSelectedSids] = useState<string[]>([]);

  // Optional separate File Server / Share Credentials
  const [useAltCreds, setUseAltCreds] = useState(false);
  const [shareUsername, setShareUsername] = useState('');
  const [sharePassword, setSharePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [mapResult, setMapResult] = useState<{
    ok: boolean;
    message: string;
    rawOutput?: string;
  } | null>(null);

  const occupiedDriveLetters = useMemo(() => {
    const set = new Set<string>();
    for (const raw of usedDriveLetters) {
      const dl = normalizeDriveLetterToken(raw);
      if (dl) set.add(dl);
    }
    for (const d of disks) {
      const dl = normalizeDriveLetterToken(d?.driveLetter || d?.drive);
      if (dl) set.add(dl);
    }
    for (const sh of existingShares) {
      const dl = normalizeDriveLetterToken(sh?.driveLetter);
      if (dl) set.add(dl);
    }
    return Array.from(set).sort();
  }, [usedDriveLetters, disks, existingShares]);

  const occupiedDriveLetterSet = useMemo(
    () => new Set(occupiedDriveLetters),
    [occupiedDriveLetters]
  );

  const availableDriveLetters = useMemo(
    () => DRIVE_LETTERS.filter((dl) => !occupiedDriveLetterSet.has(dl)),
    [occupiedDriveLetterSet]
  );

  useEffect(() => {
    if (!isOpen) return;
    if (initialRemotePath) setRemotePath(initialRemotePath);
    const normalizedInit = normalizeDriveLetterToken(initialDriveLetter);
    if (initialDriveLetter === 'NONE') {
      setDriveLetter('NONE');
    } else if (normalizedInit && !occupiedDriveLetterSet.has(normalizedInit)) {
      setDriveLetter(normalizedInit);
    } else {
      setDriveLetter(availableDriveLetters.length > 0 ? 'AUTO' : 'NONE');
    }
    if (initialScope) {
      setScope(initialScope);
    } else if (detectedLoggedInUser) {
      setScope('active_user');
    } else if (userProfiles.length > 0) {
      setScope('specific_user');
    } else {
      setScope('all_users');
    }
    setMapResult(null);
    setBrowseError(null);
  }, [
    isOpen,
    initialRemotePath,
    initialDriveLetter,
    initialScope,
    detectedLoggedInUser,
    userProfiles.length,
    occupiedDriveLetterSet,
    availableDriveLetters.length,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const filteredServerShares = useMemo(() => {
    const list = serverBrowseData?.shares || [];
    const q = shareFilter.trim().toLowerCase();
    return list.filter((s) => {
      if (!showAdminShares && s.isAdminShare) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.uncPath.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
      );
    });
  }, [serverBrowseData, showAdminShares, shareFilter]);

  if (!isOpen) return null;

  const surfaceBg = isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800';
  const textPrimary = isLightMode ? 'text-slate-900' : 'text-slate-100';
  const textMuted = isLightMode ? 'text-slate-600' : 'text-slate-400';
  const inputCls = isLightMode
    ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-sky-500'
    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-sky-400';

  const handleBrowseFileServer = async (e: React.FormEvent) => {
    e.preventDefault();
    const basePayload = buildPayload();
    if (!basePayload) {
      setBrowseError(
        isEn
          ? 'Enter the target workstation IP and session credentials in the HelpDesk header first.'
          : 'لطفاً ابتدا IP و مشخصات ورود سیستم کاربر را در نوار بالای صفحه HelpDesk وارد کنید.'
      );
      return;
    }
    const cleanServer = fileServer.trim().replace(/^\\\\+/, '').replace(/[\\/]+$/, '');
    if (!cleanServer) {
      setBrowseError(
        isEn
          ? 'Enter a File Server IP address or hostname (e.g. 192.168.10.20 or fs01.domain.local).'
          : 'آدرس IP یا نام فایل سرور را وارد کنید (مثلاً 192.168.10.20 یا fs01.domain.local).'
      );
      return;
    }
    setLoadingShares(true);
    setBrowseError(null);
    try {
      const res = await fetchHelpdeskFileServerShares({
        ...basePayload,
        fileServer: cleanServer,
        fileServerUsername: useAltCreds && shareUsername.trim() ? shareUsername.trim() : undefined,
        fileServerPassword: useAltCreds && sharePassword ? sharePassword : undefined,
      });
      setServerBrowseData({
        fileServer: res.data.fileServer,
        shares: res.data.shares || [],
      });
      if (res.rateLimit && onRateLimitUpdate) onRateLimitUpdate(res.rateLimit);
    } catch (err: any) {
      setServerBrowseData(null);
      setBrowseError(
        err?.message ||
          (isEn
            ? 'Failed to query shared folders on the File Server.'
            : 'دریافت لیست پوشه‌های اشتراکی از فایل سرور ناموفق بود.')
      );
    } finally {
      setLoadingShares(false);
    }
  };

  const toggleUserSid = (sid: string) => {
    setSelectedSids((prev) =>
      prev.includes(sid) ? prev.filter((item) => item !== sid) : [...prev, sid]
    );
  };

  const handleMapShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canExecuteActions) return;
    const basePayload = buildPayload();
    if (!basePayload) {
      setMapResult({
        ok: false,
        message: isEn
          ? 'Enter the target workstation IP and credentials in the HelpDesk header first.'
          : 'ابتدا IP و مشخصات ورود سیستم کاربر را در نوار بالای صفحه HelpDesk وارد کنید.',
      });
      return;
    }

    const cleanUnc = remotePath.trim();
    if (!cleanUnc) {
      setMapResult({
        ok: false,
        message: isEn
          ? 'Enter or select a UNC shared folder path (e.g. \\\\fileserver\\Shared).'
          : 'مسیر اشتراکی UNC را وارد یا از لیست سرور انتخاب کنید (مثلاً \\\\fileserver\\Shared).',
      });
      return;
    }

    if (scope === 'specific_user' && selectedSids.length === 0) {
      setMapResult({
        ok: false,
        message: isEn
          ? 'Select at least one workstation user profile below.'
          : 'لطفاً حداقل یک کاربر از لیست پروفایل‌های این سیستم را انتخاب کنید.',
      });
      return;
    }

    setSubmitting(true);
    setMapResult(null);
    try {
      const res = await mapHelpdeskEndpointShare({
        ...basePayload,
        remotePath: cleanUnc,
        driveLetter: driveLetter === 'NONE' ? '' : driveLetter,
        scope,
        targetSids: scope === 'specific_user' ? selectedSids : undefined,
        persistent,
        label: label.trim() || undefined,
        shareUsername: useAltCreds && shareUsername.trim() ? shareUsername.trim() : undefined,
        sharePassword: useAltCreds && sharePassword ? sharePassword : undefined,
      });
      setMapResult({
        ok: Boolean(res.data?.success),
        message: isEn ? res.data?.message : res.data?.messageFa,
        rawOutput: res.data?.rawOutput,
      });
      if (res.rateLimit && onRateLimitUpdate) onRateLimitUpdate(res.rateLimit);
      if (onMapped) onMapped(res.data);
    } catch (err: any) {
      setMapResult({
        ok: false,
        message:
          err?.message ||
          (isEn
            ? `Failed to map shared folder ${cleanUnc}.`
            : `مپ کردن پوشه اشتراکی ${cleanUnc} ناموفق بود.`),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const modalContent = (
    <div
      dir={isEn ? 'ltr' : 'rtl'}
      className={`fixed top-0 left-0 right-0 bottom-8 z-[9999] flex flex-col items-center justify-center transition-all duration-200 ${
        isMaximized ? 'p-0' : 'p-3 sm:p-6 bg-black/75 backdrop-blur-sm'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex flex-col overflow-hidden transition-all duration-200 ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-4xl max-h-[88vh] rounded-2xl border shadow-2xl'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-900'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between gap-3 px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`p-2 rounded-xl border shrink-0 ${
                isLightMode
                  ? 'bg-sky-50 border-sky-200 text-sky-600'
                  : 'bg-sky-500/15 border-sky-500/30 text-sky-400'
              }`}
            >
              <FolderPlus className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className={`text-sm font-bold truncate ${textPrimary}`}>
                {isEn
                  ? 'Map & Manage Shared Folder (Network Drive)'
                  : 'مپ کردن و مدیریت پوشه اشتراکی (Network Drive)'}
              </h3>
              <p className={`text-[11px] truncate ${textMuted}`}>
                {isEn
                  ? `Workstation: ${workstationIp || 'Not specified'} ${detectedLoggedInUser ? `· Active User: ${detectedLoggedInUser}` : ''}`
                  : `سیستم مقصد: ${workstationIp || 'نامشخص'} ${detectedLoggedInUser ? `· کاربر فعال: ${detectedLoggedInUser}` : ''}`}
              </p>
            </div>
          </div>

          <ModalHeaderControls
            onClose={onClose}
            onMinimize={onMinimize}
            onMaximizeToggle={() => setIsMaximized((v) => !v)}
            isMaximized={isMaximized}
            isLightMode={isLightMode}
            isEn={isEn}
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Optional File Server Browser */}
          <form onSubmit={handleBrowseFileServer} className={`rounded-xl border p-4 space-y-3.5 ${surfaceBg}`}>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <label className={`flex items-center gap-1 text-xs font-semibold ${textPrimary}`}>
                  <span>{isEn ? 'Browse File Server Shares (Optional)' : 'مرورگر پوشه‌های فایل سرور (اختیاری)'}</span>
                  <FieldInfoTooltip
                    title={isEn ? 'File Server Browser' : 'مرورگر فایل سرور'}
                    whatIsIt={
                      isEn
                        ? 'Queries SMB disk shares published on a remote File Server or NAS from the workstation network perspective.'
                        : 'لیست پوشه‌های اشتراکی روی یک فایل سرور یا NAS را از داخل شبکه سیستم کاربر استعلام می‌گیرد.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Lets you inspect exact share names before mapping instead of guessing UNC paths manually.'
                        : 'به جای تایپ دستی نام دقیق اشتراک، می‌توانید لیست واقعی پوشه‌های سرور را ببینید و با یک کلیک انتخاب کنید.'
                    }
                    example={isEn ? '192.168.10.20 or fs01.corp.local' : '192.168.10.20 یا fs01.corp.local'}
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </label>
                <div className="relative">
                  <Server className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 ${textMuted}`} />
                  <input
                    type="text"
                    dir="ltr"
                    value={fileServer}
                    onChange={(e) => setFileServer(e.target.value)}
                    placeholder={isEn ? 'File Server IP or hostname (e.g. 192.168.10.20)' : 'آدرس IP یا نام فایل سرور (مثلاً 192.168.10.20)'}
                    className={`w-full ps-9 pe-3 py-2 rounded-lg border text-xs font-mono outline-none transition ${inputCls}`}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loadingShares || !fileServer.trim()}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer shrink-0"
              >
                {loadingShares ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span>{isEn ? 'List Server Shares' : 'دریافت لیست پوشه‌ها'}</span>
              </button>
            </div>

            {browseError && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 flex items-start gap-2 text-xs text-rose-500">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className={isLightMode ? 'text-rose-800' : 'text-rose-200'}>{browseError}</span>
              </div>
            )}

            {serverBrowseData && (
              <div className="space-y-2.5 pt-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold ${textPrimary}`}>
                      {isEn
                        ? `Shares on \\\\${serverBrowseData.fileServer} (${filteredServerShares.length})`
                        : `پوشه‌های سرور \\\\${serverBrowseData.fileServer} (${filteredServerShares.length})`}
                    </span>
                    <label className="flex items-center gap-1.5 text-[11px] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showAdminShares}
                        onChange={(e) => setShowAdminShares(e.target.checked)}
                        className="rounded border-slate-400 text-sky-600"
                      />
                      <span className={textMuted}>{isEn ? 'Show hidden ($)' : 'نمایش اشتراک‌های سیستمی ($)'}</span>
                    </label>
                  </div>
                  <div className="relative w-full sm:w-52">
                    <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-2.5 ${textMuted}`} />
                    <input
                      type="text"
                      value={shareFilter}
                      onChange={(e) => setShareFilter(e.target.value)}
                      placeholder={isEn ? 'Filter shares...' : 'جستجوی پوشه...'}
                      className={`w-full ps-8 pe-3 py-1 rounded-lg border text-xs outline-none ${inputCls}`}
                    />
                  </div>
                </div>

                <div className={`max-h-44 overflow-y-auto rounded-lg border divide-y ${isLightMode ? 'border-slate-200 divide-slate-100' : 'border-slate-800 divide-slate-800/70'}`}>
                  {filteredServerShares.map((sh) => (
                    <div
                      key={sh.uncPath}
                      className={`flex items-center justify-between gap-3 px-3 py-2 text-xs ${
                        remotePath.toLowerCase() === sh.uncPath.toLowerCase()
                          ? isLightMode
                            ? 'bg-sky-50'
                            : 'bg-sky-500/15'
                          : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-semibold">
                          <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className={textPrimary}>{sh.name}</span>
                          {sh.alreadyMapped && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${isLightMode ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-500/15 text-emerald-300'}`}>
                              {isEn ? 'Mapped' : 'مپ‌شده'} {sh.mappedDriveLetter}
                            </span>
                          )}
                        </div>
                        <div dir="ltr" className={`font-mono text-[11px] truncate ${textMuted}`}>
                          {sh.uncPath} {sh.description ? `— ${sh.description}` : ''}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setRemotePath(sh.uncPath)}
                        className="px-2.5 py-1 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold shrink-0 cursor-pointer"
                      >
                        {isEn ? 'Select' : 'انتخاب'}
                      </button>
                    </div>
                  ))}
                  {filteredServerShares.length === 0 && (
                    <div className={`py-5 text-center text-xs ${textMuted}`}>
                      {isEn ? 'No matching shared folders found.' : 'هیچ پوشه اشتراکی مطابقی یافت نشد.'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </form>

          {/* Main Map Configuration Form */}
          <form onSubmit={handleMapShare} className={`rounded-xl border p-4 space-y-4 ${surfaceBg}`}>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
              {/* UNC Path */}
              <div className="sm:col-span-6 space-y-1.5">
                <label className={`flex items-center gap-1 text-xs font-semibold ${textPrimary}`}>
                  <span>{isEn ? 'Network Share UNC Path' : 'مسیر پوشه اشتراکی (UNC Path)'}</span>
                  <FieldInfoTooltip
                    title={isEn ? 'UNC Share Path' : 'مسیر اشتراکی UNC'}
                    whatIsIt={
                      isEn
                        ? 'The Windows SMB network path to mount on the workstation, starting with two backslashes.'
                        : 'آدرس شبکه پوشه اشتراکی روی فایل سرور یا سیستم دیگر به فرمت استاندارد ویندوز.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Specifies exact server and shared folder (or subfolder) to map.'
                        : 'مسیر دقیق سرور و پوشه‌ای را که باید روی سیستم کاربر متصل شود مشخص می‌کند.'
                    }
                    example="\\\\192.168.10.20\\Accounting"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={remotePath}
                  onChange={(e) => setRemotePath(e.target.value)}
                  placeholder="\\192.168.10.20\SharedFolder"
                  className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none transition ${inputCls}`}
                />
              </div>

              {/* Drive Letter (Filtered Strictly to Unused Letters) */}
              <div className="sm:col-span-3 space-y-1.5">
                <label className={`flex items-center gap-1 text-xs font-semibold ${textPrimary}`}>
                  <HardDrive className="w-3.5 h-3.5 text-sky-500" />
                  <span>{isEn ? 'Drive Letter (Unused Only)' : 'حرف درایو (فقط حروف آزاد)'}</span>
                  <FieldInfoTooltip
                    isLightMode={isLightMode}
                    isEn={isEn}
                    title={isEn ? 'Available Drive Letter' : 'انتخاب حرف درایو آزاد'}
                    whatIsIt={
                      isEn
                        ? 'Lists only drive letters that are NOT currently used by Windows local volumes, USB/optical drives, or existing mapped network folders.'
                        : 'فقط حروفی را نمایش می‌دهد که در حال حاضر نه برای درایوهای لوکال ویندوز (مثل C: یا D:) و نه برای شیرفولدرهای فعلی استفاده نشده‌اند.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Prevents overwriting or colliding with active disks and existing user mapped shares.'
                        : 'از تداخل با درایوهای ویندوزی و قطع شدن اشتراک‌های شبکه‌ای فعلی کاربر جلوگیری می‌کند.'
                    }
                    example={
                      isEn
                        ? 'Auto-Pick selects the highest unused letter (e.g. Z:, Y:) automatically.'
                        : 'گزینه انتخاب خودکار بالاترین حرف آزاد (مثلاً Z: یا Y:) را برمی‌گزیند.'
                    }
                  />
                </label>
                <select
                  value={driveLetter}
                  onChange={(e) => setDriveLetter(e.target.value)}
                  className={`w-full px-2.5 py-2 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                >
                  {availableDriveLetters.length > 0 && (
                    <option value="AUTO">
                      {isEn
                        ? `Auto-Pick Unused (${availableDriveLetters[0]} → ${availableDriveLetters[availableDriveLetters.length - 1]})`
                        : `انتخاب خودکار آزاد (${availableDriveLetters[0]} تا ${availableDriveLetters[availableDriveLetters.length - 1]})`}
                    </option>
                  )}
                  {availableDriveLetters.map((dl) => (
                    <option key={dl} value={dl}>
                      {dl}
                    </option>
                  ))}
                  <option value="NONE">{isEn ? 'UNC Only (No Drive Letter)' : 'فقط اتصال UNC (بدون حرف درایو)'}</option>
                </select>
                {occupiedDriveLetters.length > 0 && (
                  <div className={`text-[10px] font-mono leading-relaxed ${textMuted}`} dir="ltr">
                    {isEn ? 'Excluded (in use):' : 'حذف‌شده (در حال استفاده):'} {occupiedDriveLetters.join(', ')}
                  </div>
                )}
              </div>

              {/* Optional Drive Label */}
              <div className="sm:col-span-3 space-y-1.5">
                <label className={`block text-xs font-semibold ${textPrimary}`}>
                  {isEn ? 'Explorer Label (Optional)' : 'نام نمایشی درایو (اختیاری)'}
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={isEn ? 'e.g. Finance Share' : 'مثلاً پوشه مالی'}
                  className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                />
              </div>
            </div>

            {/* Target Scope Selection: Single Active User vs Specific User(s) vs All Users */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className={`flex items-center gap-1 text-xs font-bold ${textPrimary}`}>
                  <span>{isEn ? 'Target User Scope on This Workstation' : 'محدوده کاربران مقصد روی این سیستم'}</span>
                  <FieldInfoTooltip
                    title={isEn ? 'User Scope & Profile Mapping' : 'تخصیص برای تک‌کاربر یا کل کاربران سیستم'}
                    whatIsIt={
                      isEn
                        ? 'Choose whether to map the shared folder for the currently logged-in user, selected individual user profile(s) on this PC, or every user logging into this workstation.'
                        : 'تعیین می‌کند پوشه اشتراکی فقط برای کاربر فعال فعلی مپ شود، برای یک یا چند پروفایل خاص این سیستم، یا برای تمامی کاربرانی که به این آدرس وارد می‌شوند.'
                    }
                    whyNeeded={
                      isEn
                        ? 'In domain workstations, running net use remotely via Admin/SYSTEM isolates the drive from the user session. Choosing User or All Users bridges directly into their HKU\\<SID> hive and interactive desktop.'
                        : 'در سیستم‌های تحت دامین، مپ کردن مستقیم در نشست ادمین برای کاربر عادی دیده نمی‌شود؛ این گزینه دقیقاً درایو را در رجیستری پروفایل کاربر (یا قانون Logon همه کاربران) ثبت و در This PC کاربر ظاهر می‌کند.'
                    }
                    example={isEn ? 'Active User for 1-to-1 ticket; All Users for shared PCs' : 'کاربر فعال برای کارهای تکی؛ همه کاربران برای سیستم‌های اشتراکی'}
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </label>

                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={persistent}
                    onChange={(e) => setPersistent(e.target.checked)}
                    className="rounded border-slate-400 text-sky-600 focus:ring-sky-500"
                  />
                  <span className={textPrimary}>
                    {isEn ? 'Reconnect at sign-in (Persistent)' : 'اتصال مجدد خودکار پس از ری‌استارت (Persistent)'}
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  disabled={!detectedLoggedInUser}
                  onClick={() => setScope('active_user')}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border text-start transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    scope === 'active_user'
                      ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-900 hover:bg-slate-100'
                      : 'bg-slate-950/60 border-slate-800 text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <UserCheck className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">
                      {isEn ? 'Active User Only' : 'فقط کاربر فعال فعلی'}
                    </div>
                    <div className={`text-[11px] mt-0.5 truncate ${scope === 'active_user' ? 'text-sky-100' : textMuted}`}>
                      {detectedLoggedInUser || (isEn ? 'No active session' : 'کاربر لاگین‌شده ندارد')}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={userProfiles.length === 0}
                  onClick={() => setScope('specific_user')}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border text-start transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    scope === 'specific_user'
                      ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-900 hover:bg-slate-100'
                      : 'bg-slate-950/60 border-slate-800 text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <UserCog className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold">
                      {isEn ? 'Select User(s) on PC' : 'انتخاب کاربر(های) این سیستم'}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${scope === 'specific_user' ? 'text-sky-100' : textMuted}`}>
                      {userProfiles.length > 0
                        ? isEn
                          ? `${userProfiles.length} workstation profile(s)`
                          : `${userProfiles.length} پروفایل روی این سیستم`
                        : isEn
                        ? 'Load endpoint shares first'
                        : 'ابتدا لیست را دریافت کنید'}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setScope('all_users')}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border text-start transition cursor-pointer ${
                    scope === 'all_users'
                      ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-900 hover:bg-slate-100'
                      : 'bg-slate-950/60 border-slate-800 text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Users className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold">
                      {isEn ? 'All Users on Workstation' : 'همه کاربران این آدرس'}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${scope === 'all_users' ? 'text-sky-100' : textMuted}`}>
                      {isEn
                        ? 'Existing profiles + logon policy for new users'
                        : 'پروفایل‌های فعلی + قانون Logon کاربران جدید'}
                    </div>
                  </div>
                </button>
              </div>

              {/* User Profile Multi-Select Picker when Specific User(s) is chosen */}
              {scope === 'specific_user' && userProfiles.length > 0 && (
                <div className={`rounded-xl border p-3 space-y-2 ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={`font-semibold ${textPrimary}`}>
                      {isEn ? 'Choose Target Workstation User Profile(s):' : 'کاربر یا کاربران هدف روی این سیستم را انتخاب کنید:'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedSids(
                          selectedSids.length === userProfiles.length ? [] : userProfiles.map((u) => u.sid)
                        )
                      }
                      className="text-sky-500 hover:underline font-semibold cursor-pointer"
                    >
                      {selectedSids.length === userProfiles.length
                        ? isEn
                          ? 'Clear Selection'
                          : 'لغو انتخاب همه'
                        : isEn
                        ? 'Select All'
                        : 'انتخاب همه'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                    {userProfiles.map((prof) => {
                      const checked = selectedSids.includes(prof.sid);
                      return (
                        <label
                          key={prof.sid}
                          className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition ${
                            checked
                              ? isLightMode
                                ? 'bg-sky-50 border-sky-300 text-sky-900'
                                : 'bg-sky-500/15 border-sky-500/40 text-sky-100'
                              : isLightMode
                              ? 'bg-white border-slate-200 text-slate-800'
                              : 'bg-slate-900 border-slate-800 text-slate-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleUserSid(prof.sid)}
                            className="rounded border-slate-400 text-sky-600"
                          />
                          <div className="min-w-0 flex-1">
                            <div dir="ltr" className="font-mono font-semibold truncate text-start">
                              {prof.username}
                            </div>
                            <div className={`text-[10px] ${textMuted}`}>
                              {prof.isActiveLoggedIn
                                ? isEn
                                  ? 'Logged In (Active)'
                                  : 'لاگین‌شده (فعال)'
                                : prof.isLoaded
                                ? isEn
                                  ? 'Session Loaded'
                                  : 'پروفایل باز'
                                : isEn
                                ? 'Offline Profile Hive'
                                : 'پروفایل آفلاین (ثبت در رجیستری)'}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Optional Share Credentials Toggle */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUseAltCreds((v) => !v)}
                  className={`flex items-center gap-1.5 text-xs font-medium cursor-pointer ${
                    isLightMode ? 'text-sky-700 hover:text-sky-800' : 'text-sky-400 hover:text-sky-300'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>
                    {useAltCreds
                      ? isEn
                        ? 'Hide custom share credentials (default uses the user’s domain session)'
                        : 'مخفی کردن اطلاعات ورود مجزا (پیش‌فرض از دسترسی دامین خود کاربر استفاده می‌شود)'
                      : isEn
                      ? 'Specify custom credentials for this share (optional, never stored)'
                      : 'وارد کردن نام کاربری/رمز مجزا برای این پوشه اشتراکی (اختیاری)'}
                  </span>
                </button>
              </div>

              {useAltCreds && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <input
                    type="text"
                    dir="ltr"
                    value={shareUsername}
                    onChange={(e) => setShareUsername(e.target.value)}
                    placeholder={isEn ? 'DOMAIN\\username or user@domain' : 'DOMAIN\\username یا user@domain'}
                    className={`px-3 py-2 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                  />
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      dir="ltr"
                      value={sharePassword}
                      onChange={(e) => setSharePassword(e.target.value)}
                      placeholder={isEn ? 'Share Password (Ephemeral)' : 'رمز عبور پوشه اشتراکی'}
                      className={`w-full ps-3 pe-9 py-2 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className={`absolute top-1/2 -translate-y-1/2 end-2.5 p-1 cursor-pointer ${textMuted}`}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {mapResult && (
              <div
                className={`rounded-xl border p-3.5 space-y-1 text-xs ${
                  mapResult.ok
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-rose-500/40 bg-rose-500/10'
                }`}
              >
                <div
                  className={`flex items-center gap-2 font-bold ${
                    mapResult.ok ? 'text-emerald-500' : 'text-rose-500'
                  }`}
                >
                  {mapResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{mapResult.message}</span>
                </div>
                {mapResult.rawOutput && (
                  <div className={`font-mono text-[11px] ${textMuted}`}>{mapResult.rawOutput}</div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="submit"
                disabled={!canExecuteActions || submitting || !remotePath.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition cursor-pointer"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : !canExecuteActions ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <FolderPlus className="w-4 h-4" />
                )}
                <span>
                  {submitting
                    ? isEn
                      ? 'Mapping Share...'
                      : 'در حال مپ کردن...'
                    : isEn
                    ? 'Map Shared Folder'
                    : 'مپ کردن پوشه اشتراکی'}
                </span>
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-end px-5 py-3 border-t shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${
              isLightMode
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            {isEn ? 'Close' : 'بستن'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
