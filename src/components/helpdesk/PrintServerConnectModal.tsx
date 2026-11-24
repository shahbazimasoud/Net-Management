import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Printer,
  Server,
  Search,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  Users,
  PlugZap,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  Lock,
} from 'lucide-react';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import {
  fetchHelpdeskPrintServerPrinters,
  installHelpdeskPrintServerPrinter,
  HelpdeskConnectionPayload,
} from '../../services/api';

export interface PrintServerPrinterItem {
  name: string;
  shareName: string;
  uncPath: string;
  driverName: string;
  portName: string;
  location: string;
  comment: string;
  status: string;
  shared: boolean;
  alreadyInstalled: boolean;
}

interface PrintServerConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  isLightMode: boolean;
  isEn: boolean;
  canExecuteActions: boolean;
  buildPayload: () => HelpdeskConnectionPayload | null;
  workstationIp: string;
  detectedLoggedInUser?: string;
  onInstalled?: (result: any) => void;
  onRateLimitUpdate?: (rl: any) => void;
}

export const PrintServerConnectModal: React.FC<PrintServerConnectModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  isLightMode,
  isEn,
  canExecuteActions,
  buildPayload,
  workstationIp,
  detectedLoggedInUser = '',
  onInstalled,
  onRateLimitUpdate,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [printServer, setPrintServer] = useState('');
  const [useAltCreds, setUseAltCreds] = useState(false);
  const [psUsername, setPsUsername] = useState('');
  const [psPassword, setPsPassword] = useState('');
  const [showPsPassword, setShowPsPassword] = useState(false);

  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [serverData, setServerData] = useState<{
    printServer: string;
    loggedInUser: string;
    printers: PrintServerPrinterItem[];
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [installScope, setInstallScope] = useState<'active_user' | 'all_users'>(
    detectedLoggedInUser ? 'active_user' : 'all_users'
  );
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [installingShare, setInstallingShare] = useState<string | null>(null);
  const [installResult, setInstallResult] = useState<{
    ok: boolean;
    message: string;
    rawOutput?: string;
  } | null>(null);

  const activeLoggedUser = serverData?.loggedInUser || detectedLoggedInUser || '';

  useEffect(() => {
    if (!isOpen) return;
    if (activeLoggedUser) {
      setInstallScope((prev) => prev || 'active_user');
    }
  }, [isOpen, activeLoggedUser]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const filteredPrinters = useMemo(() => {
    const list = serverData?.printers || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.shareName.toLowerCase().includes(q) ||
        p.driverName.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        p.comment.toLowerCase().includes(q)
    );
  }, [serverData, searchQuery]);

  if (!isOpen) return null;

  const surfaceBg = isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800';
  const textPrimary = isLightMode ? 'text-slate-900' : 'text-slate-100';
  const textMuted = isLightMode ? 'text-slate-600' : 'text-slate-400';
  const inputCls = isLightMode
    ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-sky-500'
    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-sky-400';

  const handleBrowsePrintServer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const basePayload = buildPayload();
    if (!basePayload) {
      setListError(
        isEn
          ? 'Please enter the target workstation IP and credentials in the HelpDesk session bar first.'
          : 'لطفاً ابتدا IP و مشخصات ورود سیستم کاربر را در نوار اتصال بالای صفحه HelpDesk وارد کنید.'
      );
      return;
    }
    const cleanServer = printServer.trim();
    if (!cleanServer) {
      setListError(
        isEn
          ? 'Enter a Print Server IP address or hostname (e.g. 192.168.10.25 or print01.domain.local).'
          : 'آدرس IP یا نام هاست پرینت سرور را وارد کنید (مثلاً 192.168.10.25 یا print01.domain.local).'
      );
      return;
    }

    setLoadingList(true);
    setListError(null);
    setInstallResult(null);
    try {
      const res = await fetchHelpdeskPrintServerPrinters({
        ...basePayload,
        printServer: cleanServer,
        printServerUsername: useAltCreds && psUsername.trim() ? psUsername.trim() : undefined,
        printServerPassword: useAltCreds && psPassword ? psPassword : undefined,
      });
      setServerData({
        printServer: res.data.printServer,
        loggedInUser: res.data.loggedInUser || '',
        printers: res.data.printers || [],
      });
      if (res.data.loggedInUser && installScope === 'all_users' && !detectedLoggedInUser) {
        setInstallScope('active_user');
      }
      if (res.rateLimit && onRateLimitUpdate) onRateLimitUpdate(res.rateLimit);
    } catch (err: any) {
      setServerData(null);
      setListError(
        err?.message ||
          (isEn
            ? 'Failed to query shared printers from the Print Server.'
            : 'دریافت لیست پرینترهای اشتراکی از پرینت سرور ناموفق بود.')
      );
    } finally {
      setLoadingList(false);
    }
  };

  const handleInstallPrinter = async (printer: PrintServerPrinterItem) => {
    if (!canExecuteActions) return;
    const basePayload = buildPayload();
    if (!basePayload) return;

    const targetServer = serverData?.printServer || printServer.trim();
    if (!targetServer) return;

    setInstallingShare(printer.shareName);
    setInstallResult(null);
    setListError(null);
    try {
      const res = await installHelpdeskPrintServerPrinter({
        ...basePayload,
        printServer: targetServer,
        shareName: printer.shareName,
        installScope: activeLoggedUser ? installScope : 'all_users',
        setAsDefault,
        printServerUsername: useAltCreds && psUsername.trim() ? psUsername.trim() : undefined,
        printServerPassword: useAltCreds && psPassword ? psPassword : undefined,
      });
      setInstallResult({
        ok: Boolean(res.data?.success),
        message: isEn ? res.data?.message : res.data?.messageFa,
        rawOutput: res.data?.rawOutput,
      });
      setServerData((prev) =>
        prev
          ? {
              ...prev,
              printers: prev.printers.map((item) =>
                item.shareName.toLowerCase() === printer.shareName.toLowerCase()
                  ? { ...item, alreadyInstalled: true }
                  : item
              ),
            }
          : prev
      );
      if (res.rateLimit && onRateLimitUpdate) onRateLimitUpdate(res.rateLimit);
      if (onInstalled) onInstalled(res.data);
    } catch (err: any) {
      setInstallResult({
        ok: false,
        message:
          err?.message ||
          (isEn
            ? `Failed to install printer ${printer.uncPath}.`
            : `نصب پرینتر ${printer.uncPath} با خطا مواجه شد.`),
      });
    } finally {
      setInstallingShare(null);
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
              <Server className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className={`text-sm font-bold truncate ${textPrimary}`}>
                {isEn
                  ? 'Connect & Install Printer from Print Server'
                  : 'اتصال به پرینت سرور و نصب پرینتر روی سیستم کاربر'}
              </h3>
              <p className={`text-[11px] truncate ${textMuted}`}>
                {isEn
                  ? `Target Workstation: ${workstationIp || 'Not specified'} ${activeLoggedUser ? `· Active User: ${activeLoggedUser}` : ''}`
                  : `سیستم مقصد: ${workstationIp || 'نامشخص'} ${activeLoggedUser ? `· کاربر فعال: ${activeLoggedUser}` : ''}`}
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
          {/* Print Server Query Form */}
          <form onSubmit={handleBrowsePrintServer} className={`rounded-xl border p-4 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <label className={`flex items-center gap-1 text-xs font-semibold ${textPrimary}`}>
                  <span>{isEn ? 'Print Server Address (Hostname or IP)' : 'آدرس پرینت سرور (IP یا نام سرور)'}</span>
                  <FieldInfoTooltip
                    title={isEn ? 'Print Server Address' : 'آدرس پرینت سرور'}
                    whatIsIt={
                      isEn
                        ? 'The Windows Print Server hostname, FQDN, or IPv4 address hosting shared network printers.'
                        : 'نام کامپیوتر، FQDN یا آدرس IP پرینت سرور ویندوزی که پرینترهای شبکه روی آن Share شده‌اند.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Queries available printer queues from the Print Server on behalf of the workstation and downloads signed drivers with Admin elevation.'
                        : 'لیست صف‌های پرینتر اشتراکی روی سرور را می‌خواند و درایور را با دسترسی ادمین روی سیستم کاربر نصب می‌کند تا کاربر عادی بدون نیاز به پسورد ادمین پرینتر را داشته باشد.'
                    }
                    example={isEn ? '192.168.10.25 or print01.corp.local' : '192.168.10.25 یا print01.corp.local'}
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </label>
                <div className="relative">
                  <Server className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 ${textMuted}`} />
                  <input
                    type="text"
                    dir="ltr"
                    value={printServer}
                    onChange={(e) => setPrintServer(e.target.value)}
                    placeholder={isEn ? 'e.g. 192.168.10.25 or print01.domain.local' : 'مثلاً 192.168.10.25 یا print01.domain.local'}
                    className={`w-full ps-9 pe-3 py-2 rounded-lg border text-xs font-mono outline-none transition ${inputCls}`}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loadingList || !printServer.trim()}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer shrink-0"
              >
                {loadingList ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span>{isEn ? 'List Shared Printers' : 'دریافت لیست پرینترها'}</span>
              </button>
            </div>

            {/* Optional Print Server Credentials Toggle */}
            <div className="space-y-2.5">
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
                        ? 'Hide custom Print Server credentials (using HelpDesk session credentials by default)'
                        : 'مخفی کردن اطلاعات ورود مجزا (به‌صورت پیش‌فرض از اکانت نشست HelpDesk استفاده می‌شود)'
                      : isEn
                      ? 'Use different credentials for Print Server (optional)'
                      : 'استفاده از نام کاربری/رمز متفاوت برای پرینت سرور (اختیاری)'}
                  </span>
                </button>
                <FieldInfoTooltip
                  title={isEn ? 'Print Server Credentials' : 'احراز هویت پرینت سرور'}
                  whatIsIt={
                    isEn
                      ? 'Optional credentials used by the workstation to authenticate to the Print Server SMB/RPC shares.'
                      : 'اطلاعات کاربری اختیاری جهت اتصال موقت (IPC$) از سیستم کاربر به پرینت سرور.'
                  }
                  whyNeeded={
                    isEn
                      ? 'By default, your active HelpDesk Domain Admin credentials are passed securely to prevent WinRM double-hop authentication failures. Use this only if the Print Server uses a different account.'
                      : 'به‌صورت پیش‌فرض از همان اکانت دامین ادمین نشست فعلی برای رفع مشکل Double-Hop و دریافت درایور استفاده می‌شود؛ فقط در صورت متفاوت بودن اکانت پرینت سرور این بخش را پر کنید.'
                  }
                  example={isEn ? 'CORP\\printadmin' : 'CORP\\printadmin'}
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>

              {useAltCreds && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <input
                    type="text"
                    dir="ltr"
                    value={psUsername}
                    onChange={(e) => setPsUsername(e.target.value)}
                    placeholder={isEn ? 'DOMAIN\\username or user@domain' : 'DOMAIN\\username یا user@domain'}
                    className={`px-3 py-2 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                  />
                  <div className="relative">
                    <input
                      type={showPsPassword ? 'text' : 'password'}
                      dir="ltr"
                      value={psPassword}
                      onChange={(e) => setPsPassword(e.target.value)}
                      placeholder={isEn ? 'Print Server Password' : 'رمز عبور پرینت سرور'}
                      className={`w-full ps-3 pe-9 py-2 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPsPassword((v) => !v)}
                      className={`absolute top-1/2 -translate-y-1/2 end-2.5 p-1 cursor-pointer ${textMuted}`}
                    >
                      {showPsPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </form>

          {/* Target Profile Scope & Engineering Explanation Banner */}
          <div className={`rounded-xl border p-4 space-y-3 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>
                  {isEn
                    ? 'Installation Scope & Privilege Delegation'
                    : 'نحوه نصب روی پروفایل کاربر با دسترسی نصب ادمین'}
                </span>
                <FieldInfoTooltip
                  title={isEn ? 'Admin-Staged User Printer Mapping' : 'نصب با دسترسی ادمین برای کاربر دامین'}
                  whatIsIt={
                    isEn
                      ? 'Controls whether the printer is mapped into the currently logged-in user profile or globally for every user on the workstation.'
                      : 'تعیین می‌کند پرینتر پس از نصب درایور با دسترسی ادمین، دقیقاً در پروفایل کاربر لاگین‌شده مپ شود یا به‌صورت سراسری برای تمام کاربران سیستم.'
                  }
                  whyNeeded={
                    isEn
                      ? 'In Windows, running Add-Printer remotely as Domain Admin installs the network printer into the Admin profile instead of the user profile, while standard users lack Point-and-Print driver rights. Staging the driver as Admin and mapping into the active user session (or using per-machine /ga) guarantees the user sees and prints to it immediately.'
                      : 'در ویندوز اگر دستور نصب ریموت فقط در سشن ادمین اجرا شود، پرینتر در پروفایل ادمین می‌نشیند و کاربر نمی‌بیند؛ از طرفی کاربر عادی هم مجوز نصب درایور ندارد. سیستم ابتدا درایور را با دسترسی ادمین نصب (Stage) کرده و سپس در پروفایل کاربر فعال مپ می‌کند (و در صورت محدودیت GPO به‌صورت خودکار از حالت سراسری /ga استفاده می‌نماید).'
                  }
                  example={
                    isEn
                      ? 'Active User Profile when user is logged in; All Users (/ga) for shared PCs'
                      : 'پروفایل کاربر فعال برای سیستم‌های شخصی؛ همه کاربران (/ga) برای سیستم‌های مشترک'
                  }
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={setAsDefault}
                  onChange={(e) => setSetAsDefault(e.target.checked)}
                  className="rounded border-slate-400 text-sky-600 focus:ring-sky-500"
                />
                <span className={textPrimary}>
                  {isEn ? 'Set as Default Printer after install' : 'تنظیم به‌عنوان پرینتر پیش‌فرض پس از نصب'}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={!activeLoggedUser}
                onClick={() => setInstallScope('active_user')}
                className={`flex items-start gap-2.5 p-3 rounded-xl border text-start transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  installScope === 'active_user' && activeLoggedUser
                    ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                    : isLightMode
                    ? 'bg-slate-50 border-slate-200 text-slate-900 hover:bg-slate-100'
                    : 'bg-slate-950/60 border-slate-800 text-slate-200 hover:bg-slate-900'
                }`}
              >
                <UserCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">
                    {isEn ? 'Active Logged-In User' : 'پروفایل کاربر لاگین‌شده فعلی'}
                    {activeLoggedUser ? ` (${activeLoggedUser})` : ''}
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 leading-relaxed ${
                      installScope === 'active_user' && activeLoggedUser ? 'text-sky-100' : textMuted
                    }`}
                  >
                    {activeLoggedUser
                      ? isEn
                        ? 'Stages driver as Admin, maps in user session (with /ga fallback if GPO requires).'
                        : 'درایور با دسترسی ادمین نصب و در نشست کاربر مپ می‌شود (با Fallback خودکار /ga).'
                      : isEn
                      ? 'No interactive user session detected — use All Users mode.'
                      : 'کاربر فعال لاگین‌شده شناسایی نشد — از حالت همه کاربران استفاده کنید.'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setInstallScope('all_users')}
                className={`flex items-start gap-2.5 p-3 rounded-xl border text-start transition cursor-pointer ${
                  installScope === 'all_users' || !activeLoggedUser
                    ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                    : isLightMode
                    ? 'bg-slate-50 border-slate-200 text-slate-900 hover:bg-slate-100'
                    : 'bg-slate-950/60 border-slate-800 text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Users className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs font-bold">
                    {isEn ? 'All Users on Workstation (/ga)' : 'تمام کاربران این سیستم (سراسری /ga)'}
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 leading-relaxed ${
                      installScope === 'all_users' || !activeLoggedUser ? 'text-sky-100' : textMuted
                    }`}
                  >
                    {isEn
                      ? 'Installs per-machine connection via printui.dll /ga and refreshes Spooler.'
                      : 'نصب پرینتر در سطح سیستم (HKLM) با ریفرش Spooler برای همه کاربران سیستم.'}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Feedback Banners */}
          {listError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-start gap-2.5 text-xs text-rose-500">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className={isLightMode ? 'text-rose-800' : 'text-rose-200'}>{listError}</span>
            </div>
          )}

          {installResult && (
            <div
              className={`rounded-xl border p-3.5 space-y-1 text-xs ${
                installResult.ok
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-rose-500/40 bg-rose-500/10'
              }`}
            >
              <div
                className={`flex items-center gap-2 font-bold ${
                  installResult.ok ? 'text-emerald-500' : 'text-rose-500'
                }`}
              >
                {installResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{installResult.message}</span>
              </div>
              {installResult.rawOutput && (
                <div className={`font-mono text-[11px] ${textMuted}`}>{installResult.rawOutput}</div>
              )}
            </div>
          )}

          {/* Print Server Printers List */}
          {serverData && (
            <div className={`rounded-xl border p-4 space-y-3 ${surfaceBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-bold">
                  {isEn
                    ? `Shared Printers on \\\\${serverData.printServer} (${filteredPrinters.length})`
                    : `پرینترهای اشتراکی روی سرور \\\\${serverData.printServer} (${filteredPrinters.length})`}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-2.5 ${textMuted}`} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isEn ? 'Filter by name, driver, location...' : 'جستجو در نام، درایور یا مکان...'}
                    className={`w-full ps-8 pe-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr
                      className={`border-b text-start ${
                        isLightMode ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'
                      }`}
                    >
                      <th className="py-2 px-2.5 text-start">{isEn ? 'Share / UNC Path' : 'نام اشتراک / مسیر UNC'}</th>
                      <th className="py-2 px-2.5 text-start">{isEn ? 'Driver' : 'درایور'}</th>
                      <th className="py-2 px-2.5 text-start">{isEn ? 'Location / Comment' : 'مکان / توضیحات'}</th>
                      <th className="py-2 px-2.5 text-start">{isEn ? 'Status' : 'وضعیت'}</th>
                      <th className="py-2 px-2.5 text-end">{isEn ? 'Connect' : 'نصب'}</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                    {filteredPrinters.map((pr) => {
                      const isInstallingThis = installingShare === pr.shareName;
                      return (
                        <tr key={pr.uncPath}>
                          <td className={`py-2.5 px-2.5 ${textPrimary}`}>
                            <div className="font-semibold flex items-center gap-2">
                              <Printer className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                              <span>{pr.shareName || pr.name}</span>
                              {pr.alreadyInstalled && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                    isLightMode
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  }`}
                                >
                                  {isEn ? 'Installed' : 'نصب‌شده'}
                                </span>
                              )}
                            </div>
                            <div dir="ltr" className={`font-mono text-[11px] mt-0.5 ${textMuted}`}>
                              {pr.uncPath}
                            </div>
                          </td>
                          <td className={`py-2.5 px-2.5 ${textMuted}`}>{pr.driverName || '-'}</td>
                          <td className={`py-2.5 px-2.5 ${textMuted}`}>
                            {[pr.location, pr.comment].filter(Boolean).join(' · ') || '-'}
                          </td>
                          <td className="py-2.5 px-2.5 font-semibold text-emerald-500">{pr.status || 'Shared'}</td>
                          <td className="py-2.5 px-2.5 text-end">
                            <button
                              type="button"
                              disabled={!canExecuteActions || installingShare !== null}
                              onClick={() => handleInstallPrinter(pr)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                            >
                              {isInstallingThis ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : !canExecuteActions ? (
                                <Lock className="w-3.5 h-3.5" />
                              ) : (
                                <PlugZap className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {isInstallingThis
                                  ? isEn
                                    ? 'Installing...'
                                    : 'در حال نصب...'
                                  : pr.alreadyInstalled
                                  ? isEn
                                    ? 'Reconnect'
                                    : 'نصب مجدد'
                                  : isEn
                                  ? 'Connect & Install'
                                  : 'اتصال و نصب'}
                              </span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredPrinters.length === 0 && (
                      <tr>
                        <td colSpan={5} className={`py-8 text-center ${textMuted}`}>
                          {isEn
                            ? 'No shared printers matched on this Print Server.'
                            : 'هیچ پرینتر اشتراکی مطابقی روی این پرینت سرور یافت نشد.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!serverData && !loadingList && (
            <div className={`rounded-xl border p-8 text-center space-y-2.5 ${surfaceBg}`}>
              <Printer className="w-9 h-9 mx-auto text-sky-500 opacity-80" />
              <div className={`text-xs font-bold ${textPrimary}`}>
                {isEn ? 'Enter Print Server Address to Browse Shared Printers' : 'آدرس پرینت سرور را وارد کنید'}
              </div>
              <p className={`text-[11px] max-w-md mx-auto leading-relaxed ${textMuted}`}>
                {isEn
                  ? 'Type the Print Server IP or hostname above and click "List Shared Printers". You can then connect any shared printer directly into the logged-in user profile using Admin driver privileges.'
                  : 'آدرس IP یا نام پرینت سرور را در کادر بالا وارد کرده و روی «دریافت لیست پرینترها» کلیک کنید تا پرینترهای اشتراکی نمایش داده شوند و با دسترسی ادمین روی پروفایل کاربر نصب شوند.'}
              </p>
            </div>
          )}
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
