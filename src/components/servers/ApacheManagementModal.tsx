import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Server,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Terminal,
  Activity,
  CheckCircle2,
  AlertCircle,
  Globe,
  Layers,
  FolderTree,
  ShieldCheck,
  FileCode,
  FileText,
  Lock,
  Boxes,
  Cpu,
  RefreshCw,
  Clock,
  ExternalLink,
  ChevronRight,
  Info,
  Radio,
  SlidersHorizontal,
} from 'lucide-react';
import { RemoteServer } from '../../types';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface ApacheManagementModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  isEn: boolean;
  isLightMode: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onOpenTerminal?: (server: RemoteServer) => void;
}

export type ApacheTabType =
  | 'overview'
  | 'vhosts'
  | 'proxy'
  | 'modules'
  | 'ssl'
  | 'logs'
  | 'config';

export const ApacheManagementModal: React.FC<ApacheManagementModalProps> = ({
  isOpen,
  server,
  isEn,
  isLightMode,
  onClose,
  onMinimize,
  onOpenTerminal,
}) => {
  const [activeTab, setActiveTab] = useState<ApacheTabType>('overview');
  const [isMaximized, setIsMaximized] = useState(false);

  if (!isOpen || !server) return null;

  const isConfiguredForApache = Boolean(
    server.has_apache ||
      (Array.isArray(server.installed_web_servers) &&
        server.installed_web_servers.includes('apache'))
  );

  return createPortal(
    <div
      className={
        isMaximized
          ? 'fixed top-0 left-0 right-0 bottom-8 z-[9999] p-0 flex flex-col'
          : 'fixed top-0 left-0 right-0 bottom-8 z-[9999] p-2 sm:p-4 bg-black/80 backdrop-blur-sm flex items-center justify-center'
      }
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col overflow-hidden transition-all duration-200 shadow-2xl ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-6xl max-h-[92vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* ======================================================== */}
        {/* 1. MODAL HEADER (Universal 3-button control & Strict Bounds) */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold tracking-tight truncate">
                  {server.name}
                </h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {isEn ? 'Apache Management' : 'مدیریت Apache'}
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-500/15 text-slate-300 border border-slate-500/30">
                  {server.ip}:{server.ssh_port || 22}
                </span>

                {/* Distribution Badge */}
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 uppercase">
                  {server.os_distro || 'Linux'}
                </span>

                {/* Database Source-of-Truth Confirmation Badge */}
                {isConfiguredForApache ? (
                  <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>{isEn ? 'Fleet Registered' : 'ثبت‌شده در فلیت'}</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40">
                    <AlertCircle className="w-3 h-3 text-rose-400" />
                    <span>{isEn ? 'Unregistered' : 'ثبت‌نشده'}</span>
                  </span>
                )}

                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {isEn ? 'Phase 1: Entry Point' : 'فاز ۱: مدخل دسترسی'}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                {isEn
                  ? 'Apache HTTP Server • Multi-Distribution Architecture (httpd / apache2)'
                  : 'وب‌سرور آپاچی • معماری چندتوزیعی (httpd / apache2)'}
              </p>
            </div>
          </div>

          {/* 3-Control Header Action Buttons + Terminal Shortcut */}
          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenTerminal && (
              <button
                type="button"
                onClick={() => onOpenTerminal(server)}
                title={isEn ? 'Open SSH Terminal' : 'باز کردن ترمینال لینوکس'}
                className={`p-2 rounded-lg border transition cursor-pointer text-xs font-semibold flex items-center gap-1 ${
                  isLightMode
                    ? 'border-slate-200 text-slate-700 hover:bg-slate-100'
                    : 'border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">{isEn ? 'Terminal' : 'ترمینال'}</span>
              </button>
            )}

            {/* Minimize to ToolsDock */}
            <button
              type="button"
              onClick={onMinimize}
              title={isEn ? 'Minimize to Dock' : 'کوچک‌سازی به نوار ابزار'}
              className={`p-2 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  : 'border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Maximize / Restore */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={
                isMaximized
                  ? isEn
                    ? 'Exit Fullscreen'
                    : 'خروج از تمام‌صفحه'
                  : isEn
                  ? 'Fullscreen'
                  : 'تمام‌صفحه'
              }
              className={`p-2 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  : 'border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close Apache Management' : 'بستن مدیریت Apache'}
              className="p-2 rounded-lg border border-rose-500/20 text-rose-400 hover:bg-rose-500/15 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2. SUBHEADER: STATUS & TARGET INFO                       */}
        {/* ======================================================== */}
        <div
          className={`px-4 sm:px-6 py-2.5 border-b flex items-center justify-between gap-3 flex-wrap text-xs ${
            isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 text-[11px] font-semibold">
              {isEn ? 'Target Host:' : 'میزبان مقصد:'}
            </span>
            <span className="font-mono text-cyan-400 font-bold">
              {server.ip}:{server.ssh_port || 22}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400 text-[11px]">
              {isEn ? 'SSH User:' : 'کاربر SSH:'} <strong className="text-slate-300">{server.ssh_username || 'root'}</strong>
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400 text-[11px]">
              {isEn ? 'Default Shell:' : 'شل پیش‌فرض:'} <strong className="text-slate-300">/bin/{server.default_shell || 'bash'}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
              {isEn ? 'Apache Architecture Blueprint Active' : 'طرح معماری وب‌سرور آپاچی فعال است'}
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 3. TABS NAVIGATION                                       */}
        {/* ======================================================== */}
        <div
          className={`flex items-center gap-1 px-4 sm:px-6 py-2 border-b overflow-x-auto text-xs shrink-0 select-none ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
          }`}
        >
          {/* Tab 1: Overview */}
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'overview'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : isLightMode
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{isEn ? 'Overview & Roadmap' : 'نمای کلی و نقشه راه'}</span>
          </button>

          {/* Tab 2: Virtual Hosts */}
          <button
            type="button"
            onClick={() => setActiveTab('vhosts')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'vhosts'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : isLightMode
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{isEn ? 'Virtual Hosts' : 'هاست‌های مجازی (<VirtualHost>)'}</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-black/20 font-mono">P4</span>
          </button>

          {/* Tab 3: Reverse Proxy */}
          <button
            type="button"
            onClick={() => setActiveTab('proxy')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'proxy'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : isLightMode
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{isEn ? 'Reverse Proxy' : 'پروکسی معکوس'}</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-black/20 font-mono">P5</span>
          </button>

          {/* Tab 4: Modules & MPM */}
          <button
            type="button"
            onClick={() => setActiveTab('modules')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'modules'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : isLightMode
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>{isEn ? 'Modules & MPM' : 'ماژول‌ها و MPM'}</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-black/20 font-mono">P6</span>
          </button>

          {/* Tab 5: SSL / TLS */}
          <button
            type="button"
            onClick={() => setActiveTab('ssl')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'ssl'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : isLightMode
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{isEn ? 'SSL / TLS' : 'سرتیفیکیت و SSL/TLS'}</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-black/20 font-mono">P7</span>
          </button>

          {/* Tab 6: Logs */}
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'logs'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : isLightMode
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isEn ? 'Logs' : 'لاگ‌ها (Access & Error)'}</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-black/20 font-mono">P8</span>
          </button>

          {/* Tab 7: Safe Config Editor */}
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'config'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : isLightMode
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>{isEn ? 'Config Editor' : 'ویرایشگر امن کانفیگ'}</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-black/20 font-mono">P10</span>
          </button>
        </div>

        {/* ======================================================== */}
        {/* 4. TAB CONTENTS                                          */}
        {/* ======================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* TAB 1: OVERVIEW & ARCHITECTURE ROADMAP */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Entry Point Active Banner */}
              <div
                className={`p-4 rounded-xl border flex items-start gap-3.5 ${
                  isLightMode
                    ? 'bg-amber-50 border-amber-200 text-amber-950'
                    : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                }`}
              >
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
                  <Server className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm">
                      {isEn
                        ? 'Apache HTTP Server Management — Phase 1 Entry Point Ready'
                        : 'مدیریت وب‌سرور آپاچی — فاز ۱ مدخل دسترسی با موفقیت فعال شد'}
                    </h3>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                      {isEn ? 'Database Verified' : 'تاییدشده بر اساس دیتابیس'}
                    </span>
                  </div>
                  <p className="text-xs mt-1 opacity-90 leading-relaxed">
                    {isEn
                      ? `This server has Apache enabled under "Installed Services & Engines" in the fleet database. Phase 1 provides the dedicated entry point and modal architecture. Subsequent phases will deliver distribution-neutral discovery (httpd / apache2), VirtualHost managers, reverse proxies, MPM controllers, SSL certificates, log streaming, and safe atomic configuration editing.`
                      : `این سرور در دیتابیس فلیت با گزینه آپاچی در بخش «سرویس‌ها و موتورهای نصب‌شده» ثبت شده است. فاز ۱ مدخل اختصاصی و ساختار استاندارد مودال را فراهم ساخته و فازهای بعدی به ترتیب کشف زنده و مستقل از توزیع (httpd / apache2)، مدیریت هاست‌های مجازی، ماژول‌ها و MPM، گواهینامه‌های SSL، لاگ‌های زنده و ویرایشگر اتمیک کانفیگ را ارایه خواهند داد.`}
                  </p>
                </div>
              </div>

              {/* Host Specs & Registered Configuration Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Registered Web Server */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-400">
                      {isEn ? 'Engine Type' : 'نوع موتور وب'}
                    </span>
                    <FieldInfoTooltip
                      fieldName="Apache HTTP Server"
                      infoWhatEn="Apache HTTP Server is a modular, high-performance web server utilizing MPM architectures (event, worker, prefork)."
                      infoWhatFa="وب‌سرور آپاچی یک وب‌سرور ماژولار با معماری‌های پردازشی MPM (مانند event، worker یا prefork) است."
                      infoWhyEn="Identifies whether this host runs Apache as a primary web server or reverse proxy."
                      infoWhyFa="تعیین‌کننده اجرای آپاچی به عنوان وب‌سرور اصلی یا پروکسی در سرور میزبان است."
                      infoExampleEn="Apache 2.4 (httpd / apache2)"
                      infoExampleFa="آپاچی ۲.۴ (httpd یا apache2)"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <div className="text-base font-bold text-amber-400 truncate">
                    Apache HTTP Server
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    {isEn ? 'Registered in fleet stack' : 'ثبت‌شده در استک فلیت'}
                  </p>
                </div>

                {/* Card 2: Operating System & Distribution */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-400">
                      {isEn ? 'Host Platform' : 'پلتفرم هاست'}
                    </span>
                    <Globe className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-base font-bold text-cyan-400 truncate">
                    {server.os_distro || 'Linux'}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    {server.os_type.toUpperCase()} • /bin/{server.default_shell || 'bash'}
                  </p>
                </div>

                {/* Card 3: Target SSH Transport */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-400">
                      {isEn ? 'Management Port' : 'پورت مدیریت'}
                    </span>
                    <Terminal className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-base font-bold text-emerald-400 font-mono truncate">
                    {server.ip}:{server.ssh_port || 22}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    {isEn ? 'User:' : 'کاربر:'} {server.ssh_username || 'root'}
                  </p>
                </div>

                {/* Card 4: Roadmap Status */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-400">
                      {isEn ? 'Current Phase' : 'فاز اجرایی کنونی'}
                    </span>
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-base font-bold text-amber-400">
                    Phase 1 / 12
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    {isEn ? 'Ready for Phase 2 Discovery' : 'آماده فاز ۲ (کشف زنده)'}
                  </p>
                </div>
              </div>

              {/* Distribution-Neutral Architecture Principle Card */}
              <div
                className={`p-5 rounded-xl border ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FolderTree className="w-4 h-4 text-amber-400" />
                    <h4 className="text-sm font-bold">
                      {isEn
                        ? 'Distribution-Neutral Architecture Principles (No Ubuntu-Only Assumptions)'
                        : 'اصول معماری مستقل از توزیع (پرهیز قطعی از پیش‌فرض‌های اختصاصی اوبونتو)'}
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    {isEn ? 'Universal Linux Support' : 'پشتیبانی فراگیر لینوکس'}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-400">
                  {isEn
                    ? 'Unlike Nginx, Apache HTTP Server follows vastly different layouts across distributions. Debian and Ubuntu utilize "/etc/apache2" with "apache2" binaries and sites-available/sites-enabled symlinks. In contrast, RHEL, Rocky Linux, AlmaLinux, CentOS, and Fedora utilize "/etc/httpd" with "httpd" binaries and conf.d inclusions. SUSE and custom builds (/usr/local/apache2) use their own distinct structures. The upcoming Phase 2 discovery will dynamically determine the authentic binary, configuration root, service unit, and active MPM directly from the running host.'
                    : 'برخلاف Nginx، وب‌سرور آپاچی در توزیع‌های مختلف ساختار متفاوتی دارد. دبیان و اوبونتو از مسیر /etc/apache2 با باینری apache2 و لینک‌های sites-available/sites-enabled استفاده می‌کنند، در حالی که توزیع‌های مبتنی بر ردهت (RHEL، Rocky Linux، AlmaLinux، Fedora) از /etc/httpd با باینری httpd و conf.d بهره می‌برند. سیستم در فاز ۲ کشف زنده را بر مبنای هاست واقعی انجام خواهد داد و هرگز مسیر ثابتی را تحمیل نخواهد کرد.'}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-xs font-mono">
                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40">
                    <div className="text-amber-400 font-bold">Debian / Ubuntu</div>
                    <div className="text-slate-400 text-[11px] mt-1">Binary: apache2 / apache2ctl</div>
                    <div className="text-slate-400 text-[11px]">Config: /etc/apache2/apache2.conf</div>
                    <div className="text-slate-400 text-[11px]">Service: apache2.service</div>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40">
                    <div className="text-cyan-400 font-bold">RHEL / Rocky / Alma / Fedora</div>
                    <div className="text-slate-400 text-[11px] mt-1">Binary: httpd / apachectl</div>
                    <div className="text-slate-400 text-[11px]">Config: /etc/httpd/conf/httpd.conf</div>
                    <div className="text-slate-400 text-[11px]">Service: httpd.service</div>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40">
                    <div className="text-emerald-400 font-bold">SUSE / Alpine / Custom Paths</div>
                    <div className="text-slate-400 text-[11px] mt-1">Binary: httpd / apache2</div>
                    <div className="text-slate-400 text-[11px]">Config: Discovered via /proc or -V</div>
                    <div className="text-slate-400 text-[11px]">Custom: /usr/local/apache2, /opt</div>
                  </div>
                </div>
              </div>

              {/* Complete Phased Implementation Roadmap */}
              <div
                className={`p-5 rounded-xl border ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                    <h4 className="text-sm font-bold">
                      {isEn
                        ? 'Apache Management Phased Roadmap'
                        : 'نقشه راه پیاده‌سازی گام‌به‌گام مدیریت آپاچی'}
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    {isEn ? 'Roadmap' : 'فازبندی پروژه'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {/* Phase 1 */}
                  <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-emerald-300">Phase 1: Entry Point (Current)</div>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        {isEn
                          ? 'Conditional 3-dot fleet entry point, modal container, docking integration & database source of truth.'
                          : 'مدخل شرطی در منوی فلیت، کانتینر مودال، اتصال به داک ابزارها و اتکا به دیتابیس سرور.'}
                      </p>
                    </div>
                  </div>

                  {/* Phase 2 */}
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      2
                    </span>
                    <div>
                      <div className="font-bold text-slate-200">Phase 2: Discovery & Health</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isEn
                          ? 'Dynamic binary discovery, httpd -V build specs, master/worker PID inspection, config test (-t), MPM & loaded modules.'
                          : 'کشف زنده باینری، استخراج پارامترهای بیلد با -V، وضعیت پروسه‌ها، تست سینتکس (-t) و ماژول‌ها.'}
                      </p>
                    </div>
                  </div>

                  {/* Phase 3 */}
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      3
                    </span>
                    <div>
                      <div className="font-bold text-slate-200">Phase 3: Configuration Topology</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isEn
                          ? 'Include / IncludeOptional parser, directive hierarchy tree & dependency graph.'
                          : 'تحلیلگر ساختار درختی Include و نگاشت پیوندهای کانفیگ آپاچی.'}
                      </p>
                    </div>
                  </div>

                  {/* Phase 4 */}
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      4
                    </span>
                    <div>
                      <div className="font-bold text-slate-200">Phase 4: Virtual Hosts</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isEn
                          ? 'Deep VirtualHost extraction, ServerName, DocumentRoot, Directory blocks & creation wizard.'
                          : 'مدیریت کامل بلوک‌های VirtualHost، ریشه اسناد، دایرکتیوها و ویزارد ایجاد سایت.'}
                      </p>
                    </div>
                  </div>

                  {/* Phase 5 */}
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      5
                    </span>
                    <div>
                      <div className="font-bold text-slate-200">Phase 5: Reverse Proxy</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isEn
                          ? 'ProxyPass, ProxyPassReverse, mod_proxy_balancer pools, WebSockets & health checks.'
                          : 'پیکربندی پروکسی معکوس، بالانسر سرورها، وب‌سوکت و بررسی سلامت بک‌اند.'}
                      </p>
                    </div>
                  </div>

                  {/* Phase 6 */}
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      6
                    </span>
                    <div>
                      <div className="font-bold text-slate-200">Phase 6: Modules & MPM</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isEn
                          ? 'Loaded vs available modules, a2enmod/a2dismod & LoadModule handling, active MPM tuning.'
                          : 'مدیریت و بارگذاری ماژول‌ها، سوئیچ و بهینه‌سازی MPM (event, worker, prefork).'}
                      </p>
                    </div>
                  </div>

                  {/* Phase 7 */}
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      7
                    </span>
                    <div>
                      <div className="font-bold text-slate-200">Phase 7: SSL / TLS Certificates</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isEn
                          ? 'SSLCertificateFile discovery from config, validity audit, SANs, cipher suites & renewals.'
                          : 'استخراج گواهی‌های SSL از کانفیگ، بررسی تاریخ انقضا و زنجیره اعتبارسنجی.'}
                      </p>
                    </div>
                  </div>

                  {/* Phase 8 */}
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      8
                    </span>
                    <div>
                      <div className="font-bold text-slate-200">Phase 8: Log Analytics & Live Stream</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isEn
                          ? 'CustomLog & ErrorLog dynamic discovery, real-time tail, status code metrics & IP analysis.'
                          : 'کشف مسیرهای CustomLog و ErrorLog، پایش زنده لاگ و تحلیل کدهای وضعیت.'}
                      </p>
                    </div>
                  </div>

                  {/* Phase 9 */}
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      9
                    </span>
                    <div>
                      <div className="font-bold text-slate-200">Phase 9: Service Lifecycle</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isEn
                          ? 'Detected service manager (systemd, openrc, init.d), graceful reload, restart, start & stop.'
                          : 'کنترل وضعیت سرویس با سیستم‌دی یا مدیر سرویس محلی، بارگذاری مجدد نرم و ری‌استارت.'}
                      </p>
                    </div>
                  </div>

                  {/* Phase 10 */}
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      10
                    </span>
                    <div>
                      <div className="font-bold text-slate-200">Phase 10: Safe Config Editor</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isEn
                          ? 'Syntax test dry-run, visual diff, versioned backups & atomic rollback upon errors.'
                          : 'ویرایشگر امن کانفیگ همراه با تست نحوی در حافظه موقت، فایل پشتیبان و رول‌بک اتمیک.'}
                      </p>
                    </div>
                  </div>

                  {/* Phase 11 */}
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      11
                    </span>
                    <div>
                      <div className="font-bold text-slate-200">Phase 11: Security Audit & Hardening</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isEn
                          ? 'ServerTokens, ServerSignature, TraceEnable off, security headers & .htaccess auditing.'
                          : 'ممیزی امنیتی دایرکتیوها، هدرهای امنیتی، مسدودسازی TRACE و محافظت از htaccess.'}
                      </p>
                    </div>
                  </div>

                  {/* Phase 12 */}
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      12
                    </span>
                    <div>
                      <div className="font-bold text-slate-200">Phase 12: Multi-Instance Engine</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isEn
                          ? 'Support for parallel Apache instances running with independent ServerRoots, ports & configs.'
                          : 'پشتیبانی از چندین اینستنس موازی آپاچی با ServerRoot و پورت‌های تفکیک‌شده.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PLACEHOLDERS FOR FUTURE PHASES (Strict Rule 8: Zero fake data, clean phase readiness cards) */}
          {activeTab !== 'overview' && (
            <div
              className={`p-8 rounded-xl border text-center flex flex-col items-center justify-center space-y-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                {activeTab === 'vhosts' && <Layers className="w-7 h-7" />}
                {activeTab === 'proxy' && <Globe className="w-7 h-7" />}
                {activeTab === 'modules' && <Boxes className="w-7 h-7" />}
                {activeTab === 'ssl' && <Lock className="w-7 h-7" />}
                {activeTab === 'logs' && <FileText className="w-7 h-7" />}
                {activeTab === 'config' && <FileCode className="w-7 h-7" />}
              </div>
              <h3 className="font-bold text-base">
                {activeTab === 'vhosts' && (isEn ? 'Virtual Hosts Management (Phase 4)' : 'مدیریت هاست‌های مجازی (فاز ۴)')}
                {activeTab === 'proxy' && (isEn ? 'Reverse Proxy & Load Balancer (Phase 5)' : 'پروکسی معکوس و بالانسر (فاز ۵)')}
                {activeTab === 'modules' && (isEn ? 'Apache Modules & MPM Controller (Phase 6)' : 'ماژول‌های آپاچی و کنترلر MPM (فاز ۶)')}
                {activeTab === 'ssl' && (isEn ? 'SSL / TLS Certificate Engine (Phase 7)' : 'موتور سرتیفیکیت و SSL/TLS (فاز ۷)')}
                {activeTab === 'logs' && (isEn ? 'Access & Error Logs Discovery (Phase 8)' : 'کشف و تحلیل لاگ‌های دسترسی و خطا (فاز ۸)')}
                {activeTab === 'config' && (isEn ? 'Safe Configuration Editor with Rollback (Phase 10)' : 'ویرایشگر امن کانفیگ با رول‌بک خودکار (فاز ۱۰)')}
              </h3>
              <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                {isEn
                  ? 'Phase 1 has established the dedicated entry point and modal architecture. This module will be developed in its planned phase using authentic live data from the connected Linux server.'
                  : 'فاز ۱ مدخل ورود و زیرساخت معماری مودال را مستقر نموده است. این ماژول در فاز برنامه‌ریزی‌شده خود با استفاده از داده‌های زنده و واقعی سرور لینوکس متصل توسعه خواهد یافت.'}
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold cursor-pointer transition"
              >
                {isEn ? 'Return to Phase 1 Overview' : 'بازگشت به نمای کلی فاز ۱'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
