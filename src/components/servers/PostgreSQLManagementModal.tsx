import React, { useState, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Database,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Server,
  Key,
  ShieldCheck,
  Terminal,
  Activity,
  Layers,
  Settings,
  HelpCircle,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { RemoteServer, PostgresConnectionTestResult, PostgresConnectionStatus } from '../../types';
import { testRemoteServerPostgresConnection } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface PostgreSQLManagementModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  onClose: () => void;
  onMinimize?: () => void;
  onOpenTerminal?: (server: RemoteServer) => void;
  onEditServer?: (server: RemoteServer) => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const PostgreSQLManagementModal: React.FC<PostgreSQLManagementModalProps> = ({
  isOpen,
  server,
  onClose,
  onMinimize,
  onOpenTerminal,
  onEditServer,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionResult, setConnectionResult] = useState<PostgresConnectionTestResult | null>(null);
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);

  // Run connection test
  const handleTestConnection = useCallback(async () => {
    if (!server?.id) return;
    setTesting(true);
    try {
      const res = await testRemoteServerPostgresConnection(server.id);
      setConnectionResult(res);
      setLastTestedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      setConnectionResult({
        success: false,
        status: 'unknown_error',
        message: err.message || 'Failed to execute PostgreSQL connection test',
        messageFa: 'خطا در اجرای آزمایش ارتباط با PostgreSQL',
        serverAddress: server.ip,
        port: server.postgres_port || 5432,
        username: server.postgres_user || 'postgres',
        testedAt: new Date().toISOString(),
        errorDetail: err.message,
      });
      setLastTestedAt(new Date().toLocaleTimeString());
    } finally {
      setTesting(false);
    }
  }, [server]);

  // Automatically test connection when modal opens
  useEffect(() => {
    if (isOpen && server) {
      setConnectionResult(null);
      handleTestConnection();
    }
  }, [isOpen, server?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen || !server) return null;

  const status: PostgresConnectionStatus = connectionResult?.status || (testing ? 'unknown_error' : 'unknown_error');

  const getStatusBadge = () => {
    if (testing) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-blue-500/15 text-blue-400 border border-blue-500/30 animate-pulse">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
          <span>{isEn ? 'Connecting...' : 'در حال اتصال...'}</span>
        </span>
      );
    }

    if (!connectionResult) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-slate-500/15 text-slate-400 border border-slate-500/30">
          <Clock className="w-3.5 h-3.5" />
          <span>{isEn ? 'Untested' : 'آزمایش‌نشده'}</span>
        </span>
      );
    }

    switch (connectionResult.status) {
      case 'connected':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span className="font-bold">{isEn ? 'Connected' : 'متصل'}</span>
          </span>
        );
      case 'authentication_failed':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-bold">{isEn ? 'Authentication Failed' : 'خطای احراز هویت'}</span>
          </span>
        );
      case 'connection_refused':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            <span className="font-bold">{isEn ? 'Connection Refused' : 'ارتباط رد شد'}</span>
          </span>
        );
      case 'timeout':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-orange-500/15 text-orange-400 border border-orange-500/30">
            <Clock className="w-3.5 h-3.5 text-orange-400" />
            <span className="font-bold">{isEn ? 'Connection Timeout' : 'پایان مهلت زمان'}</span>
          </span>
        );
      case 'permission_denied':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-purple-500/15 text-purple-400 border border-purple-500/30">
            <Lock className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-bold">{isEn ? 'Permission Denied' : 'دسترسی مجاز نیست'}</span>
          </span>
        );
      case 'database_unavailable':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
            <span className="font-bold">{isEn ? 'Database Unavailable' : 'دیتابیس ناموجود'}</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            <span className="font-bold">{isEn ? 'Connection Failed' : 'خطای اتصال'}</span>
          </span>
        );
    }
  };

  const modalContent = (
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 ${
        isMaximized ? 'p-0!' : ''
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col rounded-2xl shadow-2xl overflow-hidden border transition-all duration-200 ${
          isMaximized ? 'w-full h-full rounded-none border-0' : 'w-full max-w-4xl max-h-[90vh]'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* ======================================================== */}
        {/* 1. HEADER (Universal 3-Button Standard)                   */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3.5 border-b select-none shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-sm sm:text-base truncate">
                  {server.name} — {isEn ? 'PostgreSQL Management' : 'مدیریت PostgreSQL'}
                </h2>
                {getStatusBadge()}
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                {server.ip}:{server.postgres_port || 5432} • {server.postgres_user || 'postgres'} • {server.os_distro || 'Linux'}
              </p>
            </div>
          </div>

          {/* Controls: Minimize, Fullscreen, Close */}
          <div className="flex items-center gap-1.5 shrink-0">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                title={isEn ? 'Minimize' : 'کوچک‌سازی به داک'}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  isLightMode
                    ? 'hover:bg-slate-100 text-slate-600'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Minus className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام‌صفحه') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-100 text-slate-600'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 hover:text-rose-300 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2. BODY CONTENT                                           */}
        {/* ======================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Connection Test / Status Summary Card */}
          <div
            className={`p-4 sm:p-5 rounded-2xl border transition-all ${
              connectionResult?.success
                ? isLightMode
                  ? 'bg-emerald-50/70 border-emerald-200'
                  : 'bg-emerald-950/20 border-emerald-500/30'
                : connectionResult
                ? isLightMode
                  ? 'bg-rose-50/70 border-rose-200'
                  : 'bg-rose-950/20 border-rose-500/30'
                : isLightMode
                ? 'bg-white border-slate-200'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
                    connectionResult?.success
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : connectionResult
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                      : 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                  }`}
                >
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base">
                      {connectionResult?.success
                        ? isEn
                          ? 'PostgreSQL Engine Connected'
                          : 'موتور PostgreSQL متصل و آماده است'
                        : connectionResult
                        ? isEn
                          ? 'Connection Validation Issue'
                          : 'عدم برقراری ارتباط با PostgreSQL'
                        : isEn
                        ? 'PostgreSQL Connection State'
                        : 'وضعیت اتصال پایگاه داده PostgreSQL'}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-xl">
                    {connectionResult
                      ? isEn
                        ? connectionResult.message
                        : connectionResult.messageFa || connectionResult.message
                      : isEn
                      ? 'Initiate a connection test to verify direct backend-to-database reachability and credentials.'
                      : 'جهت اعتبارسنجی اتصال مستقیم، نام کاربری و پورت دیتابیس، آزمون اتصال را اجرا کنید.'}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={testing}
                  onClick={handleTestConnection}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                  <span>{testing ? (isEn ? 'Testing...' : 'در حال آزمون...') : (isEn ? 'Test Connection' : 'آزمایش مجدد اتصال')}</span>
                </button>

                {onEditServer && (
                  <button
                    type="button"
                    onClick={() => onEditServer(server)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
                      isLightMode
                        ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                        : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Edit Credentials' : 'ویرایش مشخصات'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Error Diagnosis Banner if failed */}
            {connectionResult && !connectionResult.success && (
              <div
                className={`mt-4 p-3 rounded-xl border text-xs space-y-1.5 ${
                  isLightMode
                    ? 'bg-rose-100/60 border-rose-300 text-rose-900'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{isEn ? 'Diagnostic Recommendations:' : 'راهنمای رفع مشکل:'}</span>
                </div>
                <div className="text-[11px] leading-relaxed opacity-90 pl-5">
                  {connectionResult.status === 'authentication_failed' && (
                    <p>
                      {isEn
                        ? 'The database rejected the credentials. Verify that the username exists and password matches. Check pg_hba.conf for md5/scram-sha-256 authentication rules.'
                        : 'رمز عبور یا نام کاربری توسط PostgreSQL رد شد. مطمئن شوید نام کاربری وجود دارد و رمز صحیح است. همچنین متد احراز هویت (md5 یا scram-sha-256) در فایل pg_hba.conf را بررسی نمایید.'}
                    </p>
                  )}
                  {connectionResult.status === 'connection_refused' && (
                    <p>
                      {isEn
                        ? `Port ${server.postgres_port || 5432} is not accepting connections. Ensure PostgreSQL service is running ("systemctl status postgresql") and listen_addresses is set to '*' in postgresql.conf.`
                        : `پورت ${server.postgres_port || 5432} درخواست را رد کرد. بررسی کنید سرویس فعال باشد ("systemctl status postgresql") و در فایل postgresql.conf عبارت listen_addresses برابر '*' تنظیم شده باشد.`}
                    </p>
                  )}
                  {connectionResult.status === 'timeout' && (
                    <p>
                      {isEn
                        ? `Connection timed out after 5000ms. Check host firewall (UFW/iptables: "ufw allow ${server.postgres_port || 5432}/tcp") and network security groups.`
                        : `مهلت ارتباط به پایان رسید (Timeout). فایروال سرور (دستور ufw allow ${server.postgres_port || 5432}/tcp) و گروه‌های امنیتی شبکه را بررسی فرمایید.`}
                    </p>
                  )}
                  {connectionResult.status === 'permission_denied' && (
                    <p>
                      {isEn
                        ? 'User has insufficient privileges to connect to the initial database. Grant CONNECT permissions to this role.'
                        : 'کاربر مجوز دسترسی لازم جهت اتصال به این پایگاه داده را ندارد. مجوز CONNECT را به این نقش اعطا نمایید.'}
                    </p>
                  )}
                  {connectionResult.status === 'database_unavailable' && (
                    <p>
                      {isEn
                        ? `The targeted database does not exist. Ensure the default database "postgres" exists or configure a valid database.`
                        : 'پایگاه داده مورد نظر روی سرور وجود ندارد. از وجود دیتابیس پیش‌فرض "postgres" مطمئن شوید.'}
                    </p>
                  )}
                  {connectionResult.status === 'connection_failed' && (
                    <p>
                      {isEn
                        ? `Generic network error: ${connectionResult.errorDetail || connectionResult.message}`
                        : `خطای شبکه: ${connectionResult.errorDetail || connectionResult.message}`}
                    </p>
                  )}
                </div>

                {onOpenTerminal && (
                  <div className="pt-2 pl-5">
                    <button
                      type="button"
                      onClick={() => onOpenTerminal(server)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-900 text-slate-200 hover:bg-black transition cursor-pointer"
                    >
                      <Terminal className="w-3 h-3 text-emerald-400" />
                      <span>{isEn ? 'Open SSH Terminal to Troubleshoot' : 'بازگشایی ترمینال SSH جهت عیب‌یابی'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Connection Parameters & Specifications Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1: Network & Endpoint */}
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2 font-bold text-xs">
                  <Server className="w-4 h-4 text-cyan-400" />
                  <span>{isEn ? 'Endpoint & Network Context' : 'مشخصات آدرس و شبکه'}</span>
                </div>
                <FieldInfoTooltip
                  title={isEn ? 'Server Address Source of Truth' : 'مرجع آدرس سرور'}
                  whatIsIt={
                    isEn
                      ? 'The remote server IP address is sourced directly from the existing server registration, eliminating duplicate data entry.'
                      : 'آدرس IP سرور مستقیماً از رکورد اصلی سرور در فلیت خوانده شده و نیازی به ورود مجدد آن نیست.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Ensures single source of truth across all modules and device inventory.'
                      : 'یکپارچگی و جلوگیری از تکرار داده‌ها در تمامی بخش‌های نرم‌افزار.'
                  }
                  example={server.ip}
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-dashed border-slate-700/20">
                  <span className="text-slate-400">{isEn ? 'Target Host / IP' : 'هاست / آدرس IP'}</span>
                  <span className="font-mono font-bold text-cyan-400">{server.ip}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-dashed border-slate-700/20">
                  <span className="text-slate-400">{isEn ? 'PostgreSQL Port' : 'پورت PostgreSQL'}</span>
                  <span className="font-mono font-bold text-blue-400">{server.postgres_port || 5432}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-dashed border-slate-700/20">
                  <span className="text-slate-400">{isEn ? 'Operating System' : 'سیستم‌عامل'}</span>
                  <span className="font-medium">{server.os_distro || 'Linux'}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-400">{isEn ? 'Environment' : 'محیط'}</span>
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-slate-500/10 font-bold">
                    {server.environment || 'Production'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Authentication & Security Credentials */}
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2 font-bold text-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>{isEn ? 'Authentication & Cryptography' : 'احراز هویت و امنیت'}</span>
                </div>
                <FieldInfoTooltip
                  title={isEn ? 'Zero-Leak Credential Confidentiality' : 'امنیت اطلاعات هویتی و رمزنگاری'}
                  whatIsIt={
                    isEn
                      ? 'PostgreSQL passwords are encrypted at rest using AES-256-GCM and never exposed to the frontend browser.'
                      : 'کلمه عبور دیتابیس با الگوریتم AES-256-GCM رمزنگاری شده و هرگز به سمت مرورگر ارسال نمی‌گردد.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Adheres strictly to the Zero-Leak Security Directive (Rule 14).'
                      : 'رعایت استاندارد الزامی عدم نشت اطلاعات حساس و امنیت سرور.'
                  }
                  example="AES-256-GCM In-Flight Decryption"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-dashed border-slate-700/20">
                  <span className="text-slate-400">{isEn ? 'Database Username' : 'نام کاربری پایگاه داده'}</span>
                  <span className="font-mono font-bold text-emerald-400">{server.postgres_user || 'postgres'}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-dashed border-slate-700/20">
                  <span className="text-slate-400">{isEn ? 'Password Storage' : 'وضعیت ذخیره‌سازی رمز'}</span>
                  <span className="flex items-center gap-1 font-mono text-[11px] text-emerald-400 font-medium">
                    <Lock className="w-3 h-3 text-emerald-400" />
                    <span>{server.postgres_password_set ? (isEn ? 'AES-256-GCM Encrypted' : 'رمزنگاری‌شده با AES-256') : (isEn ? 'Not Set' : 'تنظیم‌نشده')}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-dashed border-slate-700/20">
                  <span className="text-slate-400">{isEn ? 'Default Context DB' : 'دیتابیس پیش‌فرض اتصال'}</span>
                  <span className="font-mono font-bold">{server.postgres_database || 'postgres'}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-400">{isEn ? 'Client Encryption' : 'رمزنگاری در کلاینت'}</span>
                  <span className="text-[11px] font-mono text-cyan-400">{isEn ? 'Zero-Leak Protected' : 'محافظت‌شده بدون نشت'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Live Engine Metadata Card (when connected) */}
          {connectionResult?.success && (
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2 font-bold text-xs">
                  <Activity className="w-4 h-4 text-blue-400" />
                  <span>{isEn ? 'Live PostgreSQL Engine Telemetry' : 'اطلاعات زنده موتور PostgreSQL'}</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 font-bold">
                  {isEn ? 'Active Handshake' : 'ارتباط زنده فعال'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-black/10 border border-slate-700/20 space-y-1">
                  <span className="text-[10px] text-slate-400 font-mono">{isEn ? 'ROUND-TRIP LATENCY' : 'تاخیر ارتباط (Latency)'}</span>
                  <div className="text-lg font-mono font-bold text-cyan-400">
                    {connectionResult.latencyMs !== undefined ? `${connectionResult.latencyMs} ms` : '—'}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-black/10 border border-slate-700/20 space-y-1">
                  <span className="text-[10px] text-slate-400 font-mono">{isEn ? 'CLUSTER ROLE' : 'نقش سرور در کلاستر'}</span>
                  <div className="text-sm font-bold text-emerald-400">
                    {connectionResult.inRecovery ? (isEn ? 'Standby (Read-Only)' : 'استندبای (فقط خواندنی)') : (isEn ? 'Primary (Read-Write)' : 'مستر / پرایمری (خواندن و نوشتن)')}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-black/10 border border-slate-700/20 space-y-1">
                  <span className="text-[10px] text-slate-400 font-mono">{isEn ? 'CONNECTED DATABASE' : 'پایگاه داده فعال'}</span>
                  <div className="text-sm font-mono font-bold text-blue-400">
                    {connectionResult.database || 'postgres'}
                  </div>
                </div>
              </div>

              {connectionResult.version && (
                <div className="mt-2 p-2.5 rounded-lg bg-black/20 font-mono text-[11px] text-slate-300 break-all">
                  <span className="text-slate-400 font-semibold">{isEn ? 'Build Version: ' : 'نسخه کامپایل: '}</span>
                  {connectionResult.version}
                </div>
              )}
            </div>
          )}

          {/* Phase 1 Foundation Architecture Notice */}
          <div
            className={`p-4 rounded-xl border flex items-start gap-3 ${
              isLightMode ? 'bg-blue-50/50 border-blue-200/80 text-blue-950' : 'bg-blue-950/20 border-blue-500/20 text-blue-200'
            }`}
          >
            <Layers className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs leading-relaxed">
              <h4 className="font-bold">
                {isEn ? 'Phase 1 Foundation: Connection & Credential Architecture' : 'زیرساخت فاز ۱: اتصال و معماری امن اطلاعات هویتی'}
              </h4>
              <p className="text-[11px] opacity-90">
                {isEn
                  ? 'Phase 1 establishes the verified backend PostgreSQL connection layer, credential encryption (AES-256-GCM), and entry point without exposing passwords. Subsequent phases will introduce Database Browsing, Schema & Table Inspection, Roles & Users, SQL Studio, and Real-Time Telemetry.'
                  : 'فاز ۱ لایه اتصال ایمن بک‌اند به پایگاه داده PostgreSQL، رمزنگاری کلمات عبور (AES-256-GCM) و مدخل دسترسی اختصاصی را فراهم ساخته است. در فازهای بعدی قابلیت‌های مرور دیتابیس، جداول و اسکیما، مدیریت کاربران و رول‌ها، استودیو کوئری و مانیتورینگ عملکرد ارائه خواهند شد.'}
              </p>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 3. FOOTER (Status & Timestamps)                           */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-2.5 border-t text-xs select-none shrink-0 ${
            isLightMode ? 'bg-white border-slate-200 text-slate-600' : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span>{isEn ? 'Host:' : 'میزبان:'}</span>
            <span className="font-bold text-cyan-400">{server.ip}</span>
            <span>•</span>
            <span>{isEn ? 'Port:' : 'پورت:'}</span>
            <span className="font-bold text-blue-400">{server.postgres_port || 5432}</span>
          </div>

          <div className="flex items-center gap-3">
            {lastTestedAt && (
              <span className="text-[10px] font-mono text-slate-500">
                {isEn ? `Last check: ${lastTestedAt}` : `آخرین بررسی: ${lastTestedAt}`}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
            >
              {isEn ? 'Close' : 'بستن'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
