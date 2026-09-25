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
  Sliders,
  Server,
  Network,
  Cpu,
  ShieldCheck,
  FileText,
  Clock,
  Layers,
  Check,
  ArrowUpRight,
  HelpCircle,
} from 'lucide-react';
import { RemoteServer } from '../../types';
import { controlLinuxServerService, sshExecute } from '../../services/api';
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

interface NginxLiveStatus {
  activeState: 'active' | 'inactive' | 'failed' | 'unknown';
  version?: string;
  uptime?: string;
  mainPid?: string;
  configTestResult?: {
    ok: boolean;
    output: string;
    testedAt: string;
  };
  lastCheckTime?: string;
}

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

  const [nginxStatus, setNginxStatus] = useState<NginxLiveStatus>({
    activeState: 'unknown',
  });

  // Query live Nginx status on the real server
  const fetchLiveNginxStatus = useCallback(async () => {
    if (!server) return;
    setLoading(true);
    setActionFeedback(null);

    try {
      // Execute authentic diagnostic command via SSH
      const cmd = `export LC_ALL=C
echo "===SYSTEMCTL==="
systemctl is-active nginx 2>/dev/null || service nginx status 2>/dev/null || echo "unknown"
echo "===VERSION==="
nginx -v 2>&1 || true
echo "===TEST==="
nginx -t 2>&1 || true
echo "===PID==="
pgrep -f "nginx: master process" 2>/dev/null || true
`;
      const res = await sshExecute({
        host: server.ip,
        port: server.ssh_port || 22,
        username: server.ssh_username || 'root',
        password: sessionPassword || server.ssh_password,
        command: cmd,
        timeout: 10000,
      });

      if (res && res.success && res.output) {
        const out = res.output;
        const sysctlPart = out.includes('===SYSTEMCTL===')
          ? out.split('===SYSTEMCTL===')[1].split('===VERSION===')[0].trim()
          : '';
        const versionPart = out.includes('===VERSION===')
          ? out.split('===VERSION===')[1].split('===TEST===')[0].trim()
          : '';
        const testPart = out.includes('===TEST===')
          ? out.split('===TEST===')[1].split('===PID===')[0].trim()
          : '';
        const pidPart = out.includes('===PID===')
          ? out.split('===PID===')[1].trim()
          : '';

        let state: 'active' | 'inactive' | 'failed' | 'unknown' = 'unknown';
        if (sysctlPart.includes('active') && !sysctlPart.includes('inactive')) {
          state = 'active';
        } else if (sysctlPart.includes('inactive') || sysctlPart.includes('dead') || sysctlPart.includes('stopped')) {
          state = 'inactive';
        } else if (sysctlPart.includes('failed')) {
          state = 'failed';
        }

        const isConfigOk = testPart.includes('syntax is ok') && testPart.includes('test is successful');

        setNginxStatus({
          activeState: state,
          version: versionPart.replace('nginx version:', '').trim() || undefined,
          mainPid: pidPart || undefined,
          configTestResult: {
            ok: isConfigOk,
            output: testPart,
            testedAt: new Date().toLocaleTimeString(),
          },
          lastCheckTime: new Date().toLocaleTimeString(),
        });
      } else {
        // If SSH command failed or unreachable
        setNginxStatus({
          activeState: 'unknown',
          configTestResult: undefined,
          lastCheckTime: new Date().toLocaleTimeString(),
        });
        if (res?.error) {
          setActionFeedback({
            type: 'error',
            message: isEn ? 'Failed to query Nginx status' : 'خطا در استعلام وضعیت سرویس Nginx',
            details: res.error,
          });
        }
      }
    } catch (err: any) {
      setNginxStatus({
        activeState: 'unknown',
        lastCheckTime: new Date().toLocaleTimeString(),
      });
      setActionFeedback({
        type: 'error',
        message: isEn ? 'Connection error while checking Nginx' : 'خطای ارتباط هنگام بررسی وضعیت Nginx',
        details: err?.message,
      });
    } finally {
      setLoading(false);
    }
  }, [server, sessionPassword, isEn]);

  useEffect(() => {
    if (isOpen && server) {
      fetchLiveNginxStatus();
    }
  }, [isOpen, server, fetchLiveNginxStatus]);

  // Execute Service Action (Start, Stop, Restart, Reload)
  const handleServiceAction = async (action: 'start' | 'stop' | 'restart' | 'reload') => {
    if (!server) return;
    setActionLoading(action);
    setActionFeedback(null);

    try {
      const res = await controlLinuxServerService(
        server.id,
        'nginx',
        action,
        sessionPassword || server.ssh_password
      );

      if (res && res.success) {
        setActionFeedback({
          type: 'success',
          message: isEn
            ? `Nginx service ${action} action executed successfully.`
            : `عملیات ${action} روی سرویس Nginx با موفقیت اجرا شد.`,
          details: res.message,
        });
        // Refresh live status after action
        setTimeout(() => {
          fetchLiveNginxStatus();
        }, 1200);
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn
            ? `Failed to ${action} Nginx service.`
            : `خطا در اجرای عملیات ${action} روی سرویس Nginx.`,
          details: res?.error || res?.message || (isEn ? 'Command returned non-zero code' : 'دستور با خطا پایان یافت'),
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

  // Run Test Syntax (`nginx -t`)
  const handleTestSyntax = async () => {
    if (!server) return;
    setActionLoading('test');
    setActionFeedback(null);

    try {
      const res = await sshExecute({
        host: server.ip,
        port: server.ssh_port || 22,
        username: server.ssh_username || 'root',
        password: sessionPassword || server.ssh_password,
        command: 'nginx -t 2>&1',
        timeout: 10000,
      });

      if (res && res.output) {
        const isOk = res.output.includes('syntax is ok') && res.output.includes('test is successful');
        setNginxStatus((prev) => ({
          ...prev,
          configTestResult: {
            ok: isOk,
            output: res.output,
            testedAt: new Date().toLocaleTimeString(),
          },
        }));

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
        message: isEn ? 'Error executing nginx -t' : 'خطا در اجرای دستور nginx -t',
        details: err?.message,
      });
    } finally {
      setActionLoading(null);
    }
  };

  if (!isOpen || !server) return null;

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
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 uppercase">
                  {server.os_distro || 'Linux'}
                </span>

                {/* Status Badge */}
                {nginxStatus.activeState === 'active' && (
                  <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{isEn ? 'Active / Running' : 'فعال و در حال اجرا'}</span>
                  </span>
                )}
                {nginxStatus.activeState === 'inactive' && (
                  <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>{isEn ? 'Stopped / Inactive' : 'متوقف‌شده'}</span>
                  </span>
                )}
                {nginxStatus.activeState === 'failed' && (
                  <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    <span>{isEn ? 'Failed' : 'خطادار'}</span>
                  </span>
                )}
                {nginxStatus.activeState === 'unknown' && !loading && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-500/20 text-slate-400 border border-slate-500/40">
                    {isEn ? 'Status Untested' : 'وضعیت نامشخص'}
                  </span>
                )}
                {loading && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>{isEn ? 'Inspecting...' : 'بررسی وضعیت...'}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                {server.hostname ? `hostname: ${server.hostname} • ` : ''}
                {nginxStatus.version ? `Nginx ${nginxStatus.version}` : 'Web Server & Reverse Proxy'}
                {nginxStatus.mainPid ? ` • PID: ${nginxStatus.mainPid}` : ''}
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
        {/* SUBHEADER: QUICK ACTIONS & PATH INFO                     */}
        {/* ======================================================== */}
        <div
          className={`px-4 sm:px-6 py-2.5 border-b flex items-center justify-between gap-3 flex-wrap text-xs ${
            isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          {/* Quick Service Controls */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-400 text-[11px] font-semibold">
              {isEn ? 'Quick Actions:' : 'عملیات سریع:'}
            </span>

            {/* Test Config Syntax */}
            <button
              type="button"
              onClick={handleTestSyntax}
              disabled={actionLoading !== null || loading}
              className={`px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                isLightMode
                  ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{actionLoading === 'test' ? (isEn ? 'Testing...' : 'تست...') : (isEn ? 'Test Syntax (nginx -t)' : 'تست سینتکس (nginx -t)')}</span>
            </button>

            {/* Reload */}
            <button
              type="button"
              onClick={() => handleServiceAction('reload')}
              disabled={actionLoading !== null || loading}
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
              disabled={actionLoading !== null || loading}
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
            {nginxStatus.activeState === 'active' ? (
              <button
                type="button"
                onClick={() => handleServiceAction('stop')}
                disabled={actionLoading !== null || loading}
                className="px-2.5 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5 text-rose-400" />
                <span>{actionLoading === 'stop' ? (isEn ? 'Stopping...' : 'در حال توقف...') : (isEn ? 'Stop' : 'توقف سرویس')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleServiceAction('start')}
                disabled={actionLoading !== null || loading}
                className="px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 text-emerald-400" />
                <span>{actionLoading === 'start' ? (isEn ? 'Starting...' : 'در حال اجرا...') : (isEn ? 'Start' : 'شروع سرویس')}</span>
              </button>
            )}

            {/* Refresh Live Status */}
            <button
              type="button"
              onClick={fetchLiveNginxStatus}
              disabled={loading}
              title={isEn ? 'Refresh Live Status' : 'به‌روزرسانی وضعیت زنده'}
              className={`p-1.5 rounded-lg border transition cursor-pointer disabled:opacity-50 ${
                isLightMode
                  ? 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Standard Paths Quick References */}
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 truncate">
            <span className="hidden md:inline">
              <strong className="text-slate-300">Config:</strong> /etc/nginx/nginx.conf
            </span>
            <span className="hidden lg:inline text-slate-600">•</span>
            <span className="hidden lg:inline">
              <strong className="text-slate-300">Sites:</strong> /etc/nginx/sites-available/
            </span>
            <span className="hidden xl:inline text-slate-600">•</span>
            <span className="hidden xl:inline">
              <strong className="text-slate-300">Logs:</strong> /var/log/nginx/
            </span>
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
            <span>{isEn ? 'Overview & Status' : 'نمای کلی و وضعیت'}</span>
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
            <span>{isEn ? 'Configuration' : 'فایل‌های پیکربندی'}</span>
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
          {/* TAB 1: OVERVIEW & STATUS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Telemetry & Spec Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Service State */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-400">
                      {isEn ? 'Service Status' : 'وضعیت سرویس'}
                    </span>
                    <FieldInfoTooltip
                      fieldName="Nginx Daemon State"
                      infoWhatEn="The active execution state of the Nginx master process under systemd."
                      infoWhatFa="وضعیت پردازش اصلی و سرویس دیمن وب‌سرور Nginx تحت سیستم‌دی لینوکس."
                      infoWhyEn="Ensures the web server daemon is alive and listening for incoming HTTP/HTTPS traffic."
                      infoWhyFa="تضمین می‌کند وب‌سرور زنده بوده و به ترافیک ورودی وب گوش فرا می‌دهد."
                      infoExampleEn="active (running)"
                      infoExampleFa="active (running)"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-3 h-3 rounded-full ${
                        nginxStatus.activeState === 'active'
                          ? 'bg-emerald-500 animate-pulse'
                          : nginxStatus.activeState === 'inactive'
                          ? 'bg-amber-500'
                          : nginxStatus.activeState === 'failed'
                          ? 'bg-rose-500'
                          : 'bg-slate-500'
                      }`}
                    />
                    <span className="text-base font-bold capitalize">
                      {nginxStatus.activeState}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    {nginxStatus.lastCheckTime
                      ? `${isEn ? 'Checked at' : 'بررسی در'}: ${nginxStatus.lastCheckTime}`
                      : isEn ? 'Not verified yet' : 'هنوز بررسی نشده'}
                  </p>
                </div>

                {/* Card 2: Nginx Version */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-400">
                      {isEn ? 'Installed Engine' : 'موتور وب‌سرور'}
                    </span>
                    <Globe className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-base font-bold font-mono text-emerald-400">
                    {nginxStatus.version || 'Nginx (Live)'}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {isEn ? 'HTTP Server & Reverse Proxy' : 'وب‌سرور و پراکسی معکوس'}
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
                      fieldName="Nginx Configuration Integrity"
                      infoWhatEn="Verifies that all include directives, server blocks, and proxy rules are syntactically sound without breaking production."
                      infoWhatFa="صحت نحوی تمامی دستورات، بلوک‌های سرور و رول‌های پروکسی را بدون اختلال در سرور بررسی می‌کند."
                      infoWhyEn="Executing nginx -t prevents fatal service crashes prior to applying reloads or restarts."
                      infoWhyFa="اجرای تست سینتکس مانع از کرش و از کار افتادن وب‌سرور قبل از اعمال ریلود می‌شود."
                      infoExampleEn="nginx -t => syntax is ok, test is successful"
                      infoExampleFa="nginx -t => syntax is ok, test is successful"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {nginxStatus.configTestResult ? (
                      nginxStatus.configTestResult.ok ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-base font-bold text-emerald-400">
                            {isEn ? 'Passed' : 'بدون خطا'}
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
                    {nginxStatus.configTestResult?.testedAt || 'nginx -t'}
                  </p>
                </div>

                {/* Card 4: SSH Target */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-400">
                      {isEn ? 'Management Target' : 'هدف ارتباطی'}
                    </span>
                    <Server className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-base font-bold font-mono text-cyan-400 truncate">
                    {server.ip}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    SSH: {server.ssh_username || 'root'}@{server.ip}:{server.ssh_port || 22}
                  </p>
                </div>
              </div>

              {/* Syntax Output Panel (if tested) */}
              {nginxStatus.configTestResult && (
                <div
                  className={`p-4 rounded-xl border ${
                    nginxStatus.configTestResult.ok
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
                        {isEn ? 'Nginx Configuration Test Output (nginx -t):' : 'خروجی تست پیکربندی Nginx:'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono opacity-75">
                      {nginxStatus.configTestResult.testedAt}
                    </span>
                  </div>
                  <pre className="font-mono text-xs p-3 rounded-lg bg-black/50 text-slate-200 overflow-x-auto whitespace-pre-wrap">
                    {nginxStatus.configTestResult.output}
                  </pre>
                </div>
              )}

              {/* Server Information & Paths Guide */}
              <div
                className={`p-5 rounded-xl border ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-emerald-400" />
                  <span>{isEn ? 'Nginx File Structure & Architecture' : 'ساختار فایل‌ها و معماری Nginx'}</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40 space-y-1">
                    <div className="text-emerald-400 font-bold">/etc/nginx/nginx.conf</div>
                    <div className="text-slate-400 text-[11px] font-sans">
                      {isEn
                        ? 'Primary Nginx server configuration file, worker processes, event loop, and global HTTP context.'
                        : 'فایل پیکربندی اصلی وب‌سرور، تنظیمات پردازشگرهای ورکر، حلقه رویدادها و کانتکست عمومی HTTP.'}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40 space-y-1">
                    <div className="text-cyan-400 font-bold">/etc/nginx/sites-available/</div>
                    <div className="text-slate-400 text-[11px] font-sans">
                      {isEn
                        ? 'Definitions of virtual hosts (server blocks) for domains and ports before being symlinked.'
                        : 'تعاریف هاست‌های مجازی (بلوک‌های سرور) برای دامنه‌ها و پورت‌های مختلف قبل از لینک‌شدن.'}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40 space-y-1">
                    <div className="text-amber-400 font-bold">/etc/nginx/sites-enabled/</div>
                    <div className="text-slate-400 text-[11px] font-sans">
                      {isEn
                        ? 'Active sites symlinked from sites-available that are parsed and served by Nginx.'
                        : 'سایت‌های فعال که از پوشه sites-available لینک شده و در حال سرویس‌دهی ترافیک هستند.'}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40 space-y-1">
                    <div className="text-rose-400 font-bold">/var/log/nginx/error.log</div>
                    <div className="text-slate-400 text-[11px] font-sans">
                      {isEn
                        ? 'Web server diagnostic errors, failed upstream connections, and configuration issues.'
                        : 'لاگ خطاهای سرور، عدم دسترسی به آپ‌استریم‌های بک‌اند و خطاهای تحلیل پیکربندی.'}
                    </div>
                  </div>
                </div>
              </div>
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

              {/* Virtual Hosts Container Ready for User Guidance */}
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
                    ? 'Target directories: /etc/nginx/sites-available and /etc/nginx/conf.d. Ready for automated parsing and site creation.'
                    : 'مسیرهای هدف: /etc/nginx/sites-available و /etc/nginx/conf.d. آماده برای تحلیل فایل‌ها و مدیریت سایت‌ها.'}
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

              {/* Upstreams Container Ready for User Guidance */}
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

          {/* TAB 4: CONFIGURATION */}
          {activeTab === 'config' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-emerald-400" />
                    <span>{isEn ? 'Configuration Files & Editor' : 'فایل‌ها و ویرایشگر پیکربندی'}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isEn
                      ? 'Direct editing and backup of nginx.conf, snippets, and SSL parameters with safety checks.'
                      : 'ویرایش مستقیم و پشتیبان‌گیری از nginx.conf و تنظیمات SSL همراه با تست ایمنی سینتکس.'}
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
                    ? 'Ready for viewing, syntax validation, and editing /etc/nginx/nginx.conf.'
                    : 'آماده برای مشاهده، اعتبارسنجی سینتکس و ویرایش فایل /etc/nginx/nginx.conf.'}
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
                      ? 'Real-time telemetry from /var/log/nginx/access.log and /var/log/nginx/error.log.'
                      : 'گزارش‌های لحظه‌ای ترافیک از /var/log/nginx/access.log و خطاهای /var/log/nginx/error.log.'}
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
                    ? 'Tails and filters incoming HTTP status codes (2xx, 3xx, 4xx, 5xx) and fatal web server errors.'
                    : 'مشاهده و فیلتر کردن کدهای وضعیت HTTP و خطاهای سرور به صورت زنده.'}
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
              Engine: <strong className="text-slate-200">{nginxStatus.version || 'Nginx'}</strong>
            </span>
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
