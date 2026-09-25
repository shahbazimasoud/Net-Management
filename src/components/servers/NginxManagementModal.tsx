import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Globe,
  X,
  Minus,
  Maximize2,
  Minimize2,
  RefreshCw,
  Terminal,
  Activity,
  Play,
  Square,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Server,
  Network,
  Cpu,
  ShieldCheck,
  FileText,
  Layers,
  HelpCircle,
  FolderTree,
  Box,
  Key,
  Flame,
  Check,
  Info,
} from 'lucide-react';
import { RemoteServer, NginxInstallationDetails } from '../../types';
import { controlLinuxServerService, discoverNginxTopology, sshExecute } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface NginxManagementModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  sessionPassword?: string;
  onClose: () => void;
  onMinimize: () => void;
  onOpenTerminal?: (server: RemoteServer) => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

type NginxTab = 'overview' | 'vhosts' | 'proxy' | 'config' | 'logs';

export const NginxManagementModal: React.FC<NginxManagementModalProps> = ({
  isOpen,
  server,
  sessionPassword,
  onClose,
  onMinimize,
  onOpenTerminal,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState<NginxTab>('overview');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    details?: string;
  } | null>(null);

  // Phase 1: Real Topology Discovery Model
  const [discovery, setDiscovery] = useState<NginxInstallationDetails | null>(null);

  // Fetch full dynamic distribution-aware discovery
  const fetchDiscovery = useCallback(async () => {
    if (!server) return;
    setLoading(true);
    setActionFeedback(null);

    try {
      const res = await discoverNginxTopology(
        server.id,
        sessionPassword || server.ssh_password
      );

      if (res && res.success && res.discovery) {
        setDiscovery(res.discovery);
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn
            ? 'Failed to discover Nginx installation details'
            : 'خطا در استعلام مشخصات نصب و معماری Nginx',
          details: res?.error || (isEn ? 'Remote host did not return discovery data.' : 'سرور پاسخی ارسال نکرد.'),
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn ? 'Connection error during Nginx discovery' : 'خطای ارتباط در حین کشف معماری Nginx',
        details: err?.message,
      });
    } finally {
      setLoading(false);
    }
  }, [server, sessionPassword, isEn]);

  useEffect(() => {
    if (isOpen && server) {
      fetchDiscovery();
    }
  }, [isOpen, server, fetchDiscovery]);

  // Execute Service Action (Start, Stop, Restart, Reload) using discovered service name
  const handleServiceAction = async (action: 'start' | 'stop' | 'restart' | 'reload') => {
    if (!server) return;
    setActionLoading(action);
    setActionFeedback(null);

    const svcName = discovery?.serviceName || 'nginx';

    try {
      const res = await controlLinuxServerService(
        server.id,
        svcName,
        action,
        sessionPassword || server.ssh_password
      );

      if (res && res.success) {
        setActionFeedback({
          type: 'success',
          message: isEn
            ? `Nginx service ${action} (${svcName}) executed successfully.`
            : `عملیات ${action} روی سرویس ${svcName} با موفقیت انجام شد.`,
          details: res.message,
        });
        setTimeout(() => {
          fetchDiscovery();
        }, 1200);
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn
            ? `Failed to ${action} Nginx (${svcName}) service.`
            : `خطا در اجرای عملیات ${action} روی سرویس ${svcName}.`,
          details: res?.error || res?.message || (isEn ? 'Command exited with error' : 'دستور با خطا پایان یافت'),
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn ? `Error executing ${action}` : `خطا در اجرای ${action}`,
        details: err?.message,
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Run Test Syntax (`nginx -t`) using discovered binary and configuration path
  const handleTestSyntax = async () => {
    if (!server) return;
    setActionLoading('test');
    setActionFeedback(null);

    const bin = discovery?.binaryPath || 'nginx';
    const confArg = discovery?.confPath ? `-c "${discovery.confPath}"` : '';
    const cmd = `${bin} ${confArg} -t 2>&1`;

    try {
      const res = await sshExecute({
        host: server.ip,
        port: server.ssh_port || 22,
        username: server.ssh_username || 'root',
        password: sessionPassword || server.ssh_password,
        command: cmd,
        timeout: 10000,
      });

      if (res && res.output) {
        const isOk = res.output.includes('syntax is ok') && res.output.includes('test is successful');
        setDiscovery((prev) =>
          prev
            ? {
                ...prev,
                configTestOk: isOk,
                configTestOutput: res.output,
                testedAt: new Date().toISOString(),
              }
            : null
        );

        setActionFeedback({
          type: isOk ? 'success' : 'error',
          message: isOk
            ? isEn
              ? 'Nginx configuration syntax test: OK'
              : 'تست سینتکس تنظیمات Nginx: سالم و بدون خطا'
            : isEn
            ? 'Nginx configuration syntax test: FAILED'
            : 'تست سینتکس تنظیمات Nginx: دارای خطای ساختاری',
          details: res.output,
        });
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn ? 'Unable to test Nginx syntax' : 'امکان اجرای تست سینتکس Nginx وجود ندارد',
          details: res?.error,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn ? 'Error executing configuration test' : 'خطا در اجرای تست پیکربندی',
        details: err?.message,
      });
    } finally {
      setActionLoading(null);
    }
  };

  if (!isOpen || !server) return null;

  const isRunning = discovery?.serviceActive === 'active' || (discovery?.masterPid ?? 0) > 0;

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
        {/* MODAL HEADER (Universal 3-button control & Strict Bounds) */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold tracking-tight truncate">
                  {server.name}
                </h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  {isEn ? 'Nginx Management' : 'مدیریت Nginx'}
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-500/15 text-slate-300 border border-slate-500/30">
                  {server.ip}:{server.ssh_port || 22}
                </span>

                {/* Discovered Distribution Badge */}
                {discovery?.osDistro ? (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                    {discovery.osDistro} {discovery.osRelease || ''} ({discovery.osFamily})
                  </span>
                ) : (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 uppercase">
                    {server.os_distro || 'Linux'}
                  </span>
                )}

                {/* Status Badge */}
                {isRunning ? (
                  <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{isEn ? 'Active / Running' : 'فعال و در حال اجرا'}</span>
                  </span>
                ) : discovery?.serviceActive === 'inactive' ? (
                  <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>{isEn ? 'Stopped / Inactive' : 'متوقف‌شده'}</span>
                  </span>
                ) : discovery?.serviceActive === 'failed' ? (
                  <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    <span>{isEn ? 'Failed' : 'خطادار'}</span>
                  </span>
                ) : !loading ? (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-500/20 text-slate-400 border border-slate-500/40">
                    {isEn ? 'Status Unknown' : 'وضعیت نامشخص'}
                  </span>
                ) : null}

                {loading && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>{isEn ? 'Discovering Environment...' : 'در حال کشف معماری سرور...'}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                {discovery?.version ? `${discovery.version}` : 'Web Server & Reverse Proxy'}
                {discovery?.binaryPath ? ` • Binary: ${discovery.binaryPath}` : ''}
                {discovery?.masterPid ? ` • Master PID: ${discovery.masterPid}` : ''}
                {discovery?.workerCount ? ` • Workers: ${discovery.workerCount}` : ''}
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
              title={isEn ? 'Close Nginx Management' : 'بستن مدیریت Nginx'}
              className="p-2 rounded-lg border border-rose-500/20 text-rose-400 hover:bg-rose-500/15 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* SUBHEADER: DYNAMIC ACTIONS & PATHS                       */}
        {/* ======================================================== */}
        <div
          className={`px-4 sm:px-6 py-2.5 border-b flex items-center justify-between gap-3 flex-wrap text-xs ${
            isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          {/* Quick Dynamic Service Controls */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-400 text-[11px] font-semibold">
              {isEn ? 'Live Actions:' : 'عملیات زنده:'}
            </span>

            {/* Test Config Syntax using discovered binary */}
            <button
              type="button"
              onClick={handleTestSyntax}
              disabled={actionLoading !== null || loading || !discovery?.isInstalled}
              className={`px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                isLightMode
                  ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {actionLoading === 'test'
                  ? isEn ? 'Testing...' : 'تست...'
                  : isEn ? 'Test Syntax' : 'تست سینتکس'}
              </span>
            </button>

            {/* Reload */}
            <button
              type="button"
              onClick={() => handleServiceAction('reload')}
              disabled={actionLoading !== null || loading || !discovery?.isInstalled}
              className={`px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                isLightMode
                  ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
              }`}
            >
              <RotateCw className={`w-3.5 h-3.5 text-cyan-400 ${actionLoading === 'reload' ? 'animate-spin' : ''}`} />
              <span>{actionLoading === 'reload' ? (isEn ? 'Reloading...' : 'بارگذاری مجدد...') : (isEn ? 'Reload' : 'بارگذاری مجدد')}</span>
            </button>

            {/* Restart */}
            <button
              type="button"
              onClick={() => handleServiceAction('restart')}
              disabled={actionLoading !== null || loading || !discovery?.isInstalled}
              className={`px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                isLightMode
                  ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${actionLoading === 'restart' ? 'animate-spin' : ''}`} />
              <span>{actionLoading === 'restart' ? (isEn ? 'Restarting...' : 'راه‌اندازی مجدد...') : (isEn ? 'Restart' : 'راه‌اندازی مجدد')}</span>
            </button>

            {/* Start or Stop */}
            {isRunning ? (
              <button
                type="button"
                onClick={() => handleServiceAction('stop')}
                disabled={actionLoading !== null || loading || !discovery?.isInstalled}
                className="px-2.5 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5 text-rose-400" />
                <span>{actionLoading === 'stop' ? (isEn ? 'Stopping...' : 'در حال توقف...') : (isEn ? 'Stop' : 'توقف سرویس')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleServiceAction('start')}
                disabled={actionLoading !== null || loading || !discovery?.isInstalled}
                className="px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 text-emerald-400" />
                <span>{actionLoading === 'start' ? (isEn ? 'Starting...' : 'در حال اجرا...') : (isEn ? 'Start' : 'شروع سرویس')}</span>
              </button>
            )}

            {/* Refresh Live Discovery */}
            <button
              type="button"
              onClick={fetchDiscovery}
              disabled={loading}
              title={isEn ? 'Refresh Live Discovery' : 'کشف مجدد وضعیت زنده'}
              className={`p-1.5 rounded-lg border transition cursor-pointer disabled:opacity-50 ${
                isLightMode
                  ? 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Real Discovered Paths (Zero hardcoded assumptions) */}
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 truncate">
            {discovery?.confPath && (
              <span className="hidden md:inline">
                <strong className="text-slate-300">Config:</strong> {discovery.confPath}
              </span>
            )}
            {discovery?.prefixPath && (
              <>
                <span className="hidden lg:inline text-slate-600">•</span>
                <span className="hidden lg:inline">
                  <strong className="text-slate-300">Prefix:</strong> {discovery.prefixPath}
                </span>
              </>
            )}
            {discovery?.serviceManager && (
              <>
                <span className="hidden xl:inline text-slate-600">•</span>
                <span className="hidden xl:inline">
                  <strong className="text-slate-300">Init:</strong> {discovery.serviceManager} ({discovery.serviceName || 'nginx'})
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action Feedback Banner */}
        {actionFeedback && (
          <div
            className={`px-4 sm:px-6 py-2 text-xs flex items-start gap-2 border-b ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : actionFeedback.type === 'error'
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
            }`}
          >
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : actionFeedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <Activity className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{actionFeedback.message}</p>
              {actionFeedback.details && (
                <pre className="mt-1 font-mono text-[10px] bg-black/40 p-1.5 rounded max-h-24 overflow-y-auto whitespace-pre-wrap">
                  {actionFeedback.details}
                </pre>
              )}
            </div>
            <button
              type="button"
              onClick={() => setActionFeedback(null)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* TABS NAVIGATION                                          */}
        {/* ======================================================== */}
        <div
          className={`flex items-center gap-1 px-4 sm:px-6 py-2 border-b overflow-x-auto text-xs font-medium shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-slate-800'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'overview'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : isLightMode
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{isEn ? 'Overview & Discovery' : 'نمای کلی و کشف معماری'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vhosts')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'vhosts'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : isLightMode
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{isEn ? 'Virtual Hosts / Sites' : 'هاست‌های مجازی و سایت‌ها'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('proxy')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'proxy'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : isLightMode
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>{isEn ? 'Reverse Proxy & Upstreams' : 'پروکسی معکوس و آپ‌استریم'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'config'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : isLightMode
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>{isEn ? 'Configuration Tree' : 'درخت پیکربندی'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'logs'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : isLightMode
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isEn ? 'Access & Error Logs' : 'لاگ‌های دسترسی و خطا'}</span>
          </button>
        </div>

        {/* ======================================================== */}
        {/* TAB CONTENTS                                             */}
        {/* ======================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* TAB 1: OVERVIEW & DISCOVERY */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Telemetry & Spec Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Daemon & Process State */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-400">
                      {isEn ? 'Process State' : 'وضعیت پردازش'}
                    </span>
                    <FieldInfoTooltip
                      fieldName="Nginx Master & Worker State"
                      infoWhatEn="The active execution state of Nginx master and worker processes discovered directly via /proc."
                      infoWhatFa="وضعیت اجرای پردازش اصلی (Master) و پردازش‌های کارگر (Workers) که مستقیماً از /proc لینوکس کشف شده است."
                      infoWhyEn="Confirms whether Nginx is actively listening and handling web traffic, regardless of systemd unit status."
                      infoWhyFa="تایید می‌کند وب‌سرور واقعاً ترافیک وب را دریافت می‌کند یا خیر، مستقل از اینکه سرویس از چه راهی استارت شده باشد."
                      infoExampleEn="Active (Master PID: 1248, 4 Workers)"
                      infoExampleFa="فعال (شناسه مستر: ۱۲۴۸، ۴ ورکر)"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-3 h-3 rounded-full ${
                        isRunning
                          ? 'bg-emerald-500 animate-pulse'
                          : discovery?.serviceActive === 'inactive'
                          ? 'bg-amber-500'
                          : discovery?.serviceActive === 'failed'
                          ? 'bg-rose-500'
                          : 'bg-slate-500'
                      }`}
                    />
                    <span className="text-base font-bold capitalize">
                      {isRunning ? (isEn ? 'Running' : 'در حال اجرا') : (isEn ? 'Stopped' : 'متوقف')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    {discovery?.masterPid
                      ? `Master PID: ${discovery.masterPid} (${discovery.workerCount} workers)`
                      : isEn ? 'No running process detected' : 'هیچ پردازش فعالی یافت نشد'}
                  </p>
                </div>

                {/* Card 2: Engine Version & Distribution */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-400">
                      {isEn ? 'Discovered Engine' : 'موتور و توزیع لینوکس'}
                    </span>
                    <Globe className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-base font-bold font-mono text-emerald-400 truncate">
                    {discovery?.version || (isEn ? 'Nginx' : 'انجین‌ایکس')}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono truncate">
                    {discovery?.osDistro
                      ? `${discovery.osDistro} (${discovery.packageManager || 'pkg'})`
                      : 'Linux Distribution'}
                  </p>
                </div>

                {/* Card 3: Syntax Verification */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-400">
                      {isEn ? 'Syntax Test' : 'اعتبارسنجی سینتکس'}
                    </span>
                    <FieldInfoTooltip
                      fieldName="Real Nginx Configuration Test"
                      infoWhatEn="Verifies configuration integrity using discovered binary and configuration path."
                      infoWhatFa="صحت نحوی کانفیگ را با باینری و مسیر کانفیگ کشف‌شده از سرور بررسی می‌کند."
                      infoWhyEn="Prevents downtime and service restarts with invalid configuration syntax."
                      infoWhyFa="مانع از دان شدن سرور و کرش در حین بارگذاری مجدد کانفیگ معیوب می‌شود."
                      infoExampleEn="nginx -c /etc/nginx/nginx.conf -t"
                      infoExampleFa="nginx -c /etc/nginx/nginx.conf -t"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {discovery?.configTestOutput ? (
                      discovery.configTestOk ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-base font-bold text-emerald-400">
                            {isEn ? 'Syntax OK' : 'بدون خطا'}
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 text-rose-400" />
                          <span className="text-base font-bold text-rose-400">
                            {isEn ? 'Syntax Error' : 'خطای سینتکس'}
                          </span>
                        </>
                      )
                    ) : (
                      <span className="text-sm font-semibold text-slate-400">
                        {isEn ? 'Click "Test Syntax"' : 'نیازمند تست'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    {discovery?.testedAt ? new Date(discovery.testedAt).toLocaleTimeString() : 'nginx -t'}
                  </p>
                </div>

                {/* Card 4: Service Manager & Init */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-400">
                      {isEn ? 'Service Manager' : 'مدیر سرویس'}
                    </span>
                    <Server className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-base font-bold font-mono text-cyan-400 truncate">
                    {discovery?.serviceManager || 'systemd'} ({discovery?.serviceName || 'nginx'})
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    Boot: {discovery?.serviceEnabled || 'unknown'}
                  </p>
                </div>
              </div>

              {/* Real Discovered Paths Grid */}
              <div
                className={`p-5 rounded-xl border ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <FolderTree className="w-4 h-4 text-emerald-400" />
                    <span>{isEn ? 'Discovered Nginx System Topology' : 'توپولوژی و مسیرهای کشف‌شده Nginx در سرور'}</span>
                  </h3>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    {isEn ? 'Discovered from live host' : 'کشف‌شده به‌صورت زنده از هاست'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs font-mono">
                  {/* Binary Path */}
                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40">
                    <div className="text-slate-400 text-[10px] uppercase font-sans font-bold">
                      {isEn ? 'Executable Binary' : 'مسیر باینری اجرایی'}
                    </div>
                    <div className="text-emerald-400 font-bold truncate mt-1">
                      {discovery?.binaryPath || (isEn ? 'Not found in PATH' : 'یافت نشد')}
                    </div>
                  </div>

                  {/* Config Path */}
                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40">
                    <div className="text-slate-400 text-[10px] uppercase font-sans font-bold">
                      {isEn ? 'Main Configuration' : 'فایل کانفیگ اصلی'}
                    </div>
                    <div className="text-cyan-400 font-bold truncate mt-1">
                      {discovery?.confPath || '/etc/nginx/nginx.conf'}
                    </div>
                  </div>

                  {/* Prefix Path */}
                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40">
                    <div className="text-slate-400 text-[10px] uppercase font-sans font-bold">
                      {isEn ? 'Root Prefix Path' : 'دایرکتوری ریشه Prefix'}
                    </div>
                    <div className="text-amber-400 font-bold truncate mt-1">
                      {discovery?.prefixPath || '/etc/nginx'}
                    </div>
                  </div>

                  {/* PID Path */}
                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40">
                    <div className="text-slate-400 text-[10px] uppercase font-sans font-bold">
                      {isEn ? 'Master PID File' : 'مسیر فایل PID مستر'}
                    </div>
                    <div className="text-slate-200 font-bold truncate mt-1">
                      {discovery?.pidPath || '/run/nginx.pid'}
                    </div>
                  </div>

                  {/* Error Log Path */}
                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40">
                    <div className="text-slate-400 text-[10px] uppercase font-sans font-bold">
                      {isEn ? 'Default Error Log' : 'لاگ پیش‌فرض خطا'}
                    </div>
                    <div className="text-rose-400 font-bold truncate mt-1">
                      {discovery?.errorLogPath || '/var/log/nginx/error.log'}
                    </div>
                  </div>

                  {/* Access Log Path */}
                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40">
                    <div className="text-slate-400 text-[10px] uppercase font-sans font-bold">
                      {isEn ? 'Default Access Log' : 'لاگ پیش‌فرض دسترسی'}
                    </div>
                    <div className="text-emerald-300 font-bold truncate mt-1">
                      {discovery?.accessLogPath || '/var/log/nginx/access.log'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Compiled Modules & Build Arguments */}
              {discovery?.compiledModules && discovery.compiledModules.length > 0 && (
                <div
                  className={`p-5 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Box className="w-4 h-4 text-emerald-400" />
                      <span>{isEn ? 'Compiled Nginx Modules' : 'ماژول‌های کامپایل‌شده انجین‌ایکس'}</span>
                    </h3>
                    <span className="text-xs text-slate-400 font-mono">
                      {discovery.compiledModules.length} {isEn ? 'modules enabled' : 'ماژول فعال'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 font-mono text-[11px]">
                    {discovery.compiledModules.map((m, idx) => (
                      <span
                        key={idx}
                        className={`px-2 py-0.5 rounded border ${
                          m.includes('ssl')
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            : m.includes('v2') || m.includes('v3')
                            ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                            : m.includes('stream')
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                            : isLightMode
                            ? 'bg-slate-100 border-slate-300 text-slate-700'
                            : 'bg-slate-800/60 border-slate-700/60 text-slate-300'
                        }`}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Syntax Output Panel (if tested) */}
              {discovery?.configTestOutput && (
                <div
                  className={`p-4 rounded-xl border ${
                    discovery.configTestOk
                      ? isLightMode
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                      : isLightMode
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" />
                      <span className="font-bold text-xs">
                        {isEn
                          ? `Configuration Test Output (${discovery.binaryPath || 'nginx'} -t):`
                          : 'خروجی تست پیکربندی انجین‌ایکس:'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono opacity-75">
                      {new Date(discovery.testedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="font-mono text-xs p-3 rounded-lg bg-black/50 text-slate-200 overflow-x-auto whitespace-pre-wrap">
                    {discovery.configTestOutput}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: VIRTUAL HOSTS */}
          {activeTab === 'vhosts' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span>{isEn ? 'Virtual Hosts & Server Blocks' : 'هاست‌های مجازی و بلوک‌های سرور'}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isEn
                      ? 'Inspect domains, ports (80/443), SSL certificates, and root directories served by Nginx.'
                      : 'مشاهده دامنه‌ها، پورت‌های ۸۰ و ۴۴۳، وضعیت گواهینامه‌های SSL و مسیرهای ریشه دایرکتوری وب.'}
                  </p>
                </div>
                <FieldInfoTooltip
                  fieldName="Virtual Host (Server Block)"
                  infoWhatEn="A configuration block allowing a single Nginx instance to host multiple distinct domain names or services."
                  infoWhatFa="بلوک پیکربندی که به یک سرور Nginx امکان میزبانی چندین دامنه و سرویس مجزا را می‌دهد."
                  infoWhyEn="Isolates routing, root folders, and SSL settings per domain name or IP."
                  infoWhyFa="تفکیک روتینگ، مسیر فایل‌ها و سرتیفیکیت‌های امنیتی برای هر دامنه یا ساب‌دامنه."
                  infoExampleEn="server { listen 80; server_name example.com; root /var/www/html; }"
                  infoExampleFa="server { listen 80; server_name example.com; root /var/www/html; }"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>

              <div
                className={`p-6 rounded-xl border text-center ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <Layers className="w-10 h-10 text-emerald-400/60 mx-auto mb-3" />
                <h4 className="text-sm font-bold">
                  {isEn ? 'Virtual Hosts Inspector' : 'کاوشگر هاست‌های مجازی'}
                </h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                  {isEn
                    ? 'Target directories: discovered from include directives in nginx.conf. Ready for parsing in Phase 3.'
                    : 'مسیرهای هدف از دایرکتیوهای include در فایل nginx.conf کشف می‌شوند. آماده برای فاز ۳.'}
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: REVERSE PROXY & UPSTREAMS */}
          {activeTab === 'proxy' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Network className="w-4 h-4 text-emerald-400" />
                    <span>{isEn ? 'Reverse Proxy & Load Balancing Upstreams' : 'پروکسی معکوس و آپ‌استریم‌های لود بالانسر'}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isEn
                      ? 'Configure backend pools, WebSocket headers, proxy passes, and failover parameters.'
                      : 'تنظیم استخرهای بک‌اند، هدرهای وب‌سوکت، هدایت درخواست‌ها (proxy_pass) و پارامترهای failover.'}
                  </p>
                </div>
                <FieldInfoTooltip
                  fieldName="Nginx Upstream Pool"
                  infoWhatEn="A group of internal backend server addresses that Nginx balances incoming web traffic across."
                  infoWhatFa="گروهی از آدرس‌های سرورهای بک‌اند که Nginx ترافیک ورودی را بین آنها توزیع می‌کند."
                  infoWhyEn="Essential for microservices, Node.js/Python backend apps, high availability, and horizontal scaling."
                  infoWhyFa="ضروری برای میکروسرویس‌ها، برنامه‌های نود و پایتون، افزونگی و مقیاس‌پذیری افقی."
                  infoExampleEn="upstream backend_pool { server 127.0.0.1:3000; server 127.0.0.1:3001; }"
                  infoExampleFa="upstream backend_pool { server 127.0.0.1:3000; server 127.0.0.1:3001; }"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>

              <div
                className={`p-6 rounded-xl border text-center ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <Network className="w-10 h-10 text-cyan-400/60 mx-auto mb-3" />
                <h4 className="text-sm font-bold">
                  {isEn ? 'Reverse Proxy Configuration' : 'پیکربندی پروکسی معکوس'}
                </h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                  {isEn
                    ? 'Manages proxy_pass directives, X-Forwarded headers, and upstream backend pools on this Linux server.'
                    : 'مدیریت دستورات proxy_pass، هدرهای X-Forwarded و استخرهای بک‌اند بر روی این سرور لینوکسی.'}
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: CONFIGURATION TREE */}
          {activeTab === 'config' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-emerald-400" />
                    <span>{isEn ? 'Configuration Files & Architecture' : 'فایل‌ها و ساختار پیکربندی'}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isEn
                      ? `Root config path: ${discovery?.confPath || '/etc/nginx/nginx.conf'}`
                      : `مسیر فایل اصلی: ${discovery?.confPath || '/etc/nginx/nginx.conf'}`}
                  </p>
                </div>
              </div>

              <div
                className={`p-6 rounded-xl border text-center ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <FileCode className="w-10 h-10 text-emerald-400/60 mx-auto mb-3" />
                <h4 className="text-sm font-bold">
                  {isEn ? 'Nginx Configuration Hub' : 'مرکز پیکربندی Nginx'}
                </h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                  {isEn
                    ? 'Ready for viewing, recursive include traversal, and safe syntax validation in Phase 2.'
                    : 'آماده برای تحلیل گراف Includeها و اعتبارسنجی در فاز ۲.'}
                </p>
              </div>
            </div>
          )}

          {/* TAB 5: LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span>{isEn ? 'Nginx Diagnostic Logs' : 'لاگ‌های وب‌سرور Nginx'}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isEn
                      ? `Discovered logs: Error (${discovery?.errorLogPath || '/var/log/nginx/error.log'}), Access (${discovery?.accessLogPath || '/var/log/nginx/access.log'})`
                      : `مسیرهای لاگ کشف‌شده: خطا (${discovery?.errorLogPath || '/var/log/nginx/error.log'})، دسترسی (${discovery?.accessLogPath || '/var/log/nginx/access.log'})`}
                  </p>
                </div>
              </div>

              <div
                className={`p-6 rounded-xl border text-center ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <FileText className="w-10 h-10 text-amber-400/60 mx-auto mb-3" />
                <h4 className="text-sm font-bold">
                  {isEn ? 'Access & Error Stream' : 'جریان لاگ‌های دسترسی و خطا'}
                </h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                  {isEn
                    ? 'Tails and filters incoming HTTP status codes and fatal web server errors from real discovered paths.'
                    : 'مشاهده و فیلتر کردن لاگ‌های واقعی کشف‌شده از سرور لینوکس.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* FOOTER BAR                                               */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-2.5 border-t shrink-0 text-xs font-mono ${
            isLightMode ? 'bg-white border-slate-200 text-slate-600' : 'bg-slate-900/90 border-slate-800 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-3">
            <span>
              Server: <strong className="text-emerald-400">{server.name}</strong> ({server.ip})
            </span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">
              Engine: <strong className="text-slate-200">{discovery?.version || 'Nginx'}</strong>
            </span>
            {discovery?.binaryPath && (
              <>
                <span className="hidden md:inline">•</span>
                <span className="hidden md:inline text-slate-400">
                  Bin: <span className="text-emerald-400">{discovery.binaryPath}</span>
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-3 py-1 rounded-lg border font-sans font-semibold transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'border-white/10 text-slate-300 hover:bg-white/10'
              }`}
            >
              {isEn ? 'Close' : 'بستن'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
