import React, { useState, useEffect, useCallback } from 'react';
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
  Search,
  Check,
  Copy,
} from 'lucide-react';
import { RemoteServer, ApacheInstallationDetails, ApacheInstanceInfo } from '../../types';
import { discoverApacheTopology } from '../../services/api';
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

  // Live Discovery State
  const [discovery, setDiscovery] = useState<ApacheInstallationDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [testingSyntax, setTestingSyntax] = useState<boolean>(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [moduleFilter, setModuleFilter] = useState<string>('');
  const [showCompilerDefines, setShowCompilerDefines] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    details?: string;
  } | null>(null);

  // Fetch full live Apache discovery from remote Linux server
  const fetchDiscovery = useCallback(
    async (targetOpts?: { targetConfPath?: string; targetBinaryPath?: string }) => {
      if (!server) return;
      setLoading(true);
      setActionFeedback(null);

      try {
        const res = await discoverApacheTopology(
          server.id,
          server.ssh_password,
          targetOpts
        );

        if (res && res.success && res.discovery) {
          setDiscovery(res.discovery);
          if (res.discovery.instances && res.discovery.instances.length > 0) {
            setSelectedInstanceId((prev) => {
              if (prev && res.discovery?.instances?.some((i) => i.id === prev)) {
                return prev;
              }
              const primary =
                res.discovery?.instances?.find((i) => i.isPrimary) ||
                res.discovery?.instances?.[0];
              return primary ? primary.id : '';
            });
          }
        } else {
          setActionFeedback({
            type: 'error',
            message: isEn
              ? 'Failed to discover Apache installation details'
              : 'خطا در استعلام مشخصات نصب و معماری Apache',
            details:
              res?.error ||
              (isEn
                ? 'Remote host did not return Apache discovery data.'
                : 'سرور مقصدی داده‌های کشف آپاچی ارسال نکرد.'),
          });
        }
      } catch (err: any) {
        setActionFeedback({
          type: 'error',
          message: isEn
            ? 'Connection error during Apache discovery'
            : 'خطای ارتباط در حین کشف معماری Apache',
          details: err?.message,
        });
      } finally {
        setLoading(false);
      }
    },
    [server, isEn]
  );

  // Run on-demand syntax test
  const handleRunSyntaxTest = async () => {
    if (!server || !discovery?.binaryPath) return;
    setTestingSyntax(true);
    setActionFeedback(null);
    try {
      await fetchDiscovery({
        targetBinaryPath: discovery.binaryPath,
        targetConfPath: discovery.confPath,
      });
      setActionFeedback({
        type: 'info',
        message: isEn
          ? 'Configuration syntax verification completed'
          : 'بررسی صحت سینتکس کانفیگ آپاچی تکمیل شد',
      });
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn ? 'Syntax test failed to execute' : 'اجرای تست سینتکس با خطا مواجه شد',
        details: err?.message,
      });
    } finally {
      setTestingSyntax(false);
    }
  };

  useEffect(() => {
    if (isOpen && server) {
      fetchDiscovery();
    }
  }, [isOpen, server, fetchDiscovery]);

  if (!isOpen || !server) return null;

  const isConfiguredForApache = Boolean(
    server.has_apache ||
      (Array.isArray(server.installed_web_servers) &&
        server.installed_web_servers.includes('apache'))
  );

  const isRunning = Boolean(
    discovery?.masterPid || discovery?.serviceActive === 'active'
  );

  const filteredModules = (discovery?.loadedModules || []).filter((m) =>
    moduleFilter ? m.toLowerCase().includes(moduleFilter.toLowerCase()) : true
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
                  {discovery?.osDistro || server.os_distro || 'Linux'}
                </span>

                {/* Active MPM Badge */}
                {discovery?.activeMpm && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    MPM: {discovery.activeMpm}
                  </span>
                )}

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
                  {isEn ? 'Phase 2: Discovery & Health' : 'فاز ۲: کشف و پایش سلامت'}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                {discovery?.version
                  ? `${discovery.version} • ${discovery.binaryPath || 'apache2'} • Root: ${discovery.serverRoot || '/etc/apache2'}`
                  : isEn
                  ? 'Apache HTTP Server • Multi-Distribution Architecture (httpd / apache2)'
                  : 'وب‌سرور آپاچی • معماری چندتوزیعی (httpd / apache2)'}
              </p>
            </div>
          </div>

          {/* Header Action Buttons (Terminal, Refresh, Minimize, Fullscreen, Close) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Refresh Discovery */}
            <button
              type="button"
              onClick={() => fetchDiscovery()}
              disabled={loading}
              title={isEn ? 'Refresh Live Discovery' : 'بازخوانی کشف زنده'}
              className={`p-2 rounded-lg border transition cursor-pointer ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                isLightMode
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  : 'border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>

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
        {/* 2. SUBHEADER: STATUS, MULTI-INSTANCE & TARGET INFO       */}
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
              {isEn ? 'SSH User:' : 'کاربر SSH:'}{' '}
              <strong className="text-slate-300">{server.ssh_username || 'root'}</strong>
            </span>
            {discovery?.serverRoot && (
              <>
                <span className="text-slate-500">•</span>
                <span className="text-slate-400 text-[11px]">
                  {isEn ? 'ServerRoot:' : 'مسیر ریشه:'}{' '}
                  <strong className="text-amber-400 font-mono">{discovery.serverRoot}</strong>
                </span>
              </>
            )}
            {discovery?.confPath && (
              <>
                <span className="text-slate-500">•</span>
                <span className="text-slate-400 text-[11px] hidden md:inline">
                  {isEn ? 'Config:' : 'فایل کانفیگ:'}{' '}
                  <strong className="text-slate-300 font-mono">{discovery.confPath}</strong>
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Multi-Instance Selector if more than 1 instance detected */}
            {discovery?.instances && discovery.instances.length > 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400 font-semibold">
                  {isEn ? 'Instance:' : 'نمونه:'}
                </span>
                <select
                  value={selectedInstanceId}
                  onChange={(e) => {
                    const instId = e.target.value;
                    setSelectedInstanceId(instId);
                    const chosen = discovery.instances?.find((i) => i.id === instId);
                    if (chosen) {
                      fetchDiscovery({
                        targetBinaryPath: chosen.binaryPath,
                        targetConfPath: chosen.confPath,
                      });
                    }
                  }}
                  className={`text-xs px-2 py-1 rounded border font-mono ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800'
                      : 'bg-slate-900 border-slate-700 text-slate-200'
                  }`}
                >
                  {discovery.instances.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name} {inst.masterPid ? `(PID ${inst.masterPid})` : `(${inst.status})`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Test Syntax Button */}
            {discovery?.isInstalled && (
              <button
                type="button"
                onClick={handleRunSyntaxTest}
                disabled={testingSyntax}
                className="px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold cursor-pointer transition flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {testingSyntax
                    ? isEn
                      ? 'Testing...'
                      : 'در حال تست...'
                    : isEn
                    ? 'Test Syntax (-t)'
                    : 'تست سینتکس (-t)'}
                </span>
              </button>
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
                : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
            }`}
          >
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : actionFeedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <Activity className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
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
            <span>{isEn ? 'Overview & Discovery' : 'نمای کلی و کشف زنده'}</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-black/20 font-mono">P2</span>
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
            {discovery?.loadedModules && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono font-bold">
                {discovery.loadedModules.length}
              </span>
            )}
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
          {/* TAB 1: OVERVIEW & LIVE DISCOVERY */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Not Installed Notice Banner */}
              {discovery && !discovery.isInstalled && !loading && (
                <div
                  className={`p-4 rounded-xl border flex items-start gap-3 ${
                    isLightMode
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                  }`}
                >
                  <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-bold text-sm">
                      {isEn ? 'Apache Web Server Not Detected' : 'وب‌سرور آپاچی شناسایی نشد'}
                    </h4>
                    <p className="text-xs mt-1 opacity-90 leading-relaxed">
                      {isEn
                        ? 'Apache executable binary (apache2 / httpd) was not found in standard system paths (/usr/sbin/apache2, /usr/sbin/httpd, /usr/local/apache2, etc.) and no running Apache master processes were discovered on this host. Please ensure Apache (httpd or apache2) is installed on the remote Linux server.'
                        : 'باینری اجرایی آپاچی (apache2 یا httpd) در مسیرهای استاندارد سیستم یافت نشد و پردازش مستر فعالی روی هاست شناسایی نگردید. لطفاً از نصب بودن پکیج httpd یا apache2 بر روی سرور لینوکس اطمینان حاصل فرمایید.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Loading State Spinner */}
              {loading && !discovery && (
                <div className="py-12 flex flex-col items-center justify-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
                  <p className="text-xs font-mono text-slate-400">
                    {isEn
                      ? 'Connecting over SSH & discovering live Apache topology (procfs, httpd -V, modules)...'
                      : 'در حال اتصال از طریق SSH و کشف مشخصات زنده آپاچی (procfs، httpd -V و ماژول‌ها)...'}
                  </p>
                </div>
              )}

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
                      fieldName="Apache Master & Worker State"
                      infoWhatEn="The active execution state of Apache master and worker child processes discovered directly via /proc."
                      infoWhatFa="وضعیت اجرای پردازش اصلی (Master) و پردازش‌های فرزند کارگر (Workers) آپاچی که مستقیماً از /proc لینوکس کشف شده است."
                      infoWhyEn="Confirms whether Apache is actively listening and handling web traffic, regardless of systemd unit status."
                      infoWhyFa="تایید می‌کند وب‌سرور واقعاً ترافیک وب را دریافت می‌کند یا خیر، مستقل از وضعیت صوری سیستم‌دی."
                      infoExampleEn="Active (Master PID: 1842, 8 Workers)"
                      infoExampleFa="فعال (شناسه مستر: ۱۸۴۲، ۸ ورکر)"
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
                  <p className="text-[11px] text-slate-400 mt-1 font-mono truncate">
                    {discovery?.masterPid
                      ? `Master PID: ${discovery.masterPid} (${discovery.workerCount} workers)`
                      : isEn
                      ? 'No running process detected'
                      : 'هیچ پردازش فعالی یافت نشد'}
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
                    <Globe className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-base font-bold font-mono text-amber-400 truncate">
                    {discovery?.version || (isEn ? 'Apache HTTP Server' : 'وب‌سرور آپاچی')}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono truncate">
                    {discovery?.osDistro
                      ? `${discovery.osDistro} (${discovery.packageManager || 'pkg'})`
                      : 'Linux Distribution'}
                  </p>
                </div>

                {/* Card 3: Active MPM Architecture */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-400">
                      {isEn ? 'Active MPM' : 'مدل چندپردازشی (MPM)'}
                    </span>
                    <FieldInfoTooltip
                      fieldName="Apache Multi-Processing Module (MPM)"
                      infoWhatEn="The core multi-processing engine governing how Apache handles concurrent incoming connections (event, worker, or prefork)."
                      infoWhatFa="موتور اصلی پردازش همزمانی در آپاچی که نحوه مدیریت اتصال‌های همزمان ورودی (event، worker یا prefork) را تعیین می‌کند."
                      infoWhyEn="Critical for tuning throughput, memory consumption, and thread/process concurrency limits."
                      infoWhyFa="نقش کلیدی در تنظیم پهنای باند، مصرف رم و سقف کانکشن‌های همزمان وب‌سرور دارد."
                      infoExampleEn="event (threaded multi-process)"
                      infoExampleFa="event (چندپردازشی نخ‌بندی‌شده)"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <div className="text-base font-bold font-mono text-emerald-400 capitalize truncate">
                    {discovery?.activeMpm ? `mpm_${discovery.activeMpm}` : (isEn ? 'Undetected' : 'نامشخص')}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    {discovery?.activeMpm === 'event'
                      ? isEn ? 'Asynchronous Event-driven' : 'رویدادمحور و غیرهمگام'
                      : discovery?.activeMpm === 'worker'
                      ? isEn ? 'Multi-Process Multi-Threaded' : 'چندپردازشی و چندنخی'
                      : discovery?.activeMpm === 'prefork'
                      ? isEn ? 'Non-threaded Process-based' : 'تک‌نخی بر پایه پردازش'
                      : isEn ? 'Discovered via -V' : 'استخراج‌شده از -V'}
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
                    {discovery?.serviceManager || 'systemd'} ({discovery?.serviceName || 'apache2'})
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    Boot: {discovery?.serviceEnabled || 'unknown'} • Status: {discovery?.serviceActive || 'unknown'}
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
                    <FolderTree className="w-4 h-4 text-amber-400" />
                    <span>{isEn ? 'Discovered Apache System Topology' : 'توپولوژی و مسیرهای کشف‌شده Apache در هاست'}</span>
                  </h3>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    {isEn ? 'Live Host Discovery' : 'کشف‌شده به‌صورت زنده از هاست'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs font-mono">
                  {/* Binary Path */}
                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40">
                    <div className="text-slate-400 text-[10px] uppercase font-sans font-bold">
                      {isEn ? 'Executable Binary' : 'مسیر باینری اجرایی'}
                    </div>
                    <div className="text-amber-400 font-bold truncate mt-1">
                      {discovery?.binaryPath || (isEn ? 'Not found in PATH' : 'یافت نشد')}
                    </div>
                  </div>

                  {/* Control Binary Path */}
                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40">
                    <div className="text-slate-400 text-[10px] uppercase font-sans font-bold">
                      {isEn ? 'Control Utility' : 'ابزار کنترل (apachectl)'}
                    </div>
                    <div className="text-cyan-400 font-bold truncate mt-1">
                      {discovery?.controlBinaryPath || (isEn ? 'apachectl' : 'apachectl')}
                    </div>
                  </div>

                  {/* ServerRoot */}
                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40">
                    <div className="text-slate-400 text-[10px] uppercase font-sans font-bold">
                      {isEn ? 'ServerRoot (Root Directory)' : 'دایرکتوری ریشه (ServerRoot)'}
                    </div>
                    <div className="text-emerald-400 font-bold truncate mt-1">
                      {discovery?.serverRoot || '/etc/apache2'}
                    </div>
                  </div>

                  {/* Main Config Path */}
                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40">
                    <div className="text-slate-400 text-[10px] uppercase font-sans font-bold">
                      {isEn ? 'Main Configuration File' : 'فایل کانفیگ اصلی'}
                    </div>
                    <div className="text-cyan-400 font-bold truncate mt-1">
                      {discovery?.confPath || '/etc/apache2/apache2.conf'}
                    </div>
                  </div>

                  {/* PID Path */}
                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40">
                    <div className="text-slate-400 text-[10px] uppercase font-sans font-bold">
                      {isEn ? 'Master PID File' : 'مسیر فایل PID مستر'}
                    </div>
                    <div className="text-slate-200 font-bold truncate mt-1">
                      {discovery?.pidPath || '/var/run/apache2/apache2.pid'}
                    </div>
                  </div>

                  {/* Error Log Path */}
                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40">
                    <div className="text-slate-400 text-[10px] uppercase font-sans font-bold">
                      {isEn ? 'Default Error Log' : 'لاگ پیش‌فرض خطا'}
                    </div>
                    <div className="text-rose-400 font-bold truncate mt-1">
                      {discovery?.errorLogPath || '/var/log/apache2/error.log'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Syntax Test Output Console */}
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
                          ? discovery.binaryPath
                            ? `Configuration Test Output (${discovery.binaryPath} -t):`
                            : 'Apache Status / Syntax Verification:'
                          : discovery.binaryPath
                          ? `خروجی تست پیکربندی (${discovery.binaryPath} -t):`
                          : 'وضعیت نصب و تست پیکربندی آپاچی:'}
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

              {/* Discovered Loaded Modules Section */}
              {discovery?.loadedModules && discovery.loadedModules.length > 0 && (
                <div
                  className={`p-5 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-amber-400" />
                      <h4 className="text-sm font-bold">
                        {isEn
                          ? `Discovered Loaded Modules (${discovery.loadedModules.length})`
                          : `ماژول‌های بارگذاری‌شده کشف‌شده (${discovery.loadedModules.length})`}
                      </h4>
                    </div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                      <input
                        type="text"
                        placeholder={isEn ? 'Filter modules (e.g. ssl, proxy)...' : 'فیلتر ماژول‌ها...'}
                        value={moduleFilter}
                        onChange={(e) => setModuleFilter(e.target.value)}
                        className={`text-xs pl-8 pr-3 py-1 rounded-lg border font-mono ${
                          isLightMode
                            ? 'bg-white border-slate-200 text-slate-800'
                            : 'bg-slate-900 border-slate-700 text-slate-200'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1 font-mono text-[11px]">
                    {filteredModules.map((mod, idx) => {
                      const isShared = mod.includes('shared');
                      return (
                        <span
                          key={idx}
                          className={`px-2 py-0.5 rounded border ${
                            isShared
                              ? isLightMode
                                ? 'bg-cyan-50 border-cyan-200 text-cyan-800'
                                : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-200 text-slate-700'
                              : 'bg-slate-800/60 border-slate-700 text-slate-300'
                          }`}
                        >
                          {mod}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Build Arguments & Compiler Defines */}
              {discovery?.buildArguments && discovery.buildArguments.length > 0 && (
                <div
                  className={`p-5 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-cyan-400" />
                      <h4 className="text-sm font-bold">
                        {isEn
                          ? `Apache Compiler Directives (-D Defines: ${discovery.buildArguments.length})`
                          : `تعاریف زمان کامپایلر آپاچی (-D: ${discovery.buildArguments.length})`}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCompilerDefines(!showCompilerDefines)}
                      className="text-xs text-amber-400 hover:underline cursor-pointer"
                    >
                      {showCompilerDefines
                        ? isEn
                          ? 'Collapse'
                          : 'بستن'
                        : isEn
                        ? 'Expand'
                        : 'نمایش جزئیات'}
                    </button>
                  </div>

                  {showCompilerDefines && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 font-mono text-[11px]">
                      {discovery.buildArguments.map((def, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded bg-black/40 border border-slate-800 truncate"
                          title={def}
                        >
                          <span className="text-amber-400 font-bold">-D </span>
                          <span className="text-slate-300">{def}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MODULES & MPM CONTROLLER */}
          {activeTab === 'modules' && (
            <div className="space-y-6">
              <div
                className={`p-5 rounded-xl border ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <Boxes className="w-5 h-5 text-amber-400" />
                    <div>
                      <h3 className="font-bold text-sm">
                        {isEn ? 'Apache Modules Architecture' : 'معماری ماژول‌های آپاچی'}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isEn
                          ? `Total Loaded: ${discovery?.loadedModules?.length || 0} • Static: ${discovery?.compiledModules?.length || 0} • Active MPM: ${discovery?.activeMpm || 'unknown'}`
                          : `مجموع بارگذاری‌شده: ${discovery?.loadedModules?.length || 0} • استاتیک: ${discovery?.compiledModules?.length || 0} • مدل MPM فعال: ${discovery?.activeMpm || 'نامشخص'}`}
                      </p>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                    <input
                      type="text"
                      placeholder={isEn ? 'Filter modules...' : 'فیلتر ماژول‌ها...'}
                      value={moduleFilter}
                      onChange={(e) => setModuleFilter(e.target.value)}
                      className={`text-xs pl-8 pr-3 py-1 rounded-lg border font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-200 text-slate-800'
                          : 'bg-slate-900 border-slate-700 text-slate-200'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 font-mono text-xs">
                  {filteredModules.map((mod, idx) => {
                    const isShared = mod.includes('shared');
                    const cleanName = mod.replace(/\s*\((static|shared)\)/i, '');
                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg border flex items-center justify-between ${
                          isShared
                            ? isLightMode
                              ? 'bg-white border-cyan-200 text-cyan-900'
                              : 'bg-slate-950/60 border-cyan-500/20 text-cyan-300'
                            : isLightMode
                            ? 'bg-slate-100 border-slate-200 text-slate-800'
                            : 'bg-slate-950/60 border-slate-800 text-slate-300'
                        }`}
                      >
                        <span className="font-bold truncate">{cleanName}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-sans uppercase font-semibold ${
                            isShared
                              ? 'bg-cyan-500/20 text-cyan-300'
                              : 'bg-slate-700/50 text-slate-400'
                          }`}
                        >
                          {isShared ? 'shared' : 'static'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* PLACEHOLDERS FOR FUTURE PHASES */}
          {activeTab !== 'overview' && activeTab !== 'modules' && (
            <div
              className={`p-8 rounded-xl border text-center flex flex-col items-center justify-center space-y-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                {activeTab === 'vhosts' && <Layers className="w-7 h-7" />}
                {activeTab === 'proxy' && <Globe className="w-7 h-7" />}
                {activeTab === 'ssl' && <Lock className="w-7 h-7" />}
                {activeTab === 'logs' && <FileText className="w-7 h-7" />}
                {activeTab === 'config' && <FileCode className="w-7 h-7" />}
              </div>
              <h3 className="font-bold text-base">
                {activeTab === 'vhosts' && (isEn ? 'Virtual Hosts Management (Phase 4)' : 'مدیریت هاست‌های مجازی (فاز ۴)')}
                {activeTab === 'proxy' && (isEn ? 'Reverse Proxy & Load Balancer (Phase 5)' : 'پروکسی معکوس و بالانسر (فاز ۵)')}
                {activeTab === 'ssl' && (isEn ? 'SSL / TLS Certificate Engine (Phase 7)' : 'موتور سرتیفیکیت و SSL/TLS (فاز ۷)')}
                {activeTab === 'logs' && (isEn ? 'Access & Error Logs Discovery (Phase 8)' : 'کشف و تحلیل لاگ‌های دسترسی و خطا (فاز ۸)')}
                {activeTab === 'config' && (isEn ? 'Safe Configuration Editor with Rollback (Phase 10)' : 'ویرایشگر امن کانفیگ با رول‌بک خودکار (فاز ۱۰)')}
              </h3>
              <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                {isEn
                  ? 'Phase 2 has delivered full live Apache discovery & health monitoring. This module will be developed in its planned phase using authentic live data from the connected Linux server.'
                  : 'فاز ۲ کشف کامل زنده و پایش سلامت وب‌سرور آپاچی را مستقر ساخته است. این ماژول در فاز زمان‌بندی‌شده با استفاده از داده‌های واقعی سرور توسعه خواهد یافت.'}
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold cursor-pointer transition"
              >
                {isEn ? 'Return to Live Discovery' : 'بازگشت به نمای کشف زنده'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
