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
  ChevronRight,
  ChevronDown,
  FileCheck,
  Search,
  ExternalLink,
  Code2,
} from 'lucide-react';
import {
  RemoteServer,
  NginxInstallationDetails,
  NginxConfigTopologyTree,
  NginxConfigFileNode,
  NginxSitesSummary,
  NginxServerBlock,
  NginxProxySummary,
  NginxUpstreamPool,
  NginxReverseProxyRoute,
} from '../../types';
import {
  controlLinuxServerService,
  discoverNginxTopology,
  fetchNginxConfigTopology,
  fetchNginxSites,
  fetchNginxProxy,
  sshExecute,
} from '../../services/api';
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

  // Phase 2: Configuration Tree & Include Topology Model
  const [configTopology, setConfigTopology] = useState<NginxConfigTopologyTree | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [selectedConfigFile, setSelectedConfigFile] = useState<NginxConfigFileNode | null>(null);
  const [configSearchQuery, setConfigSearchQuery] = useState('');

  // Phase 3: Virtual Hosts & Sites AST Model
  const [sitesData, setSitesData] = useState<NginxSitesSummary | null>(null);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [selectedSite, setSelectedSite] = useState<NginxServerBlock | null>(null);
  const [sitesSearchQuery, setSitesSearchQuery] = useState('');
  const [sitesFilter, setSitesFilter] = useState<'all' | 'active' | 'disabled' | 'ssl' | 'proxy'>('all');

  // Phase 4: Upstreams & Reverse Proxy Model
  const [proxyData, setProxyData] = useState<NginxProxySummary | null>(null);
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxyViewMode, setProxyViewMode] = useState<'upstreams' | 'routes'>('upstreams');
  const [selectedUpstream, setSelectedUpstream] = useState<NginxUpstreamPool | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<NginxReverseProxyRoute | null>(null);
  const [proxySearchQuery, setProxySearchQuery] = useState('');

  // Fetch full proxy & upstreams architecture
  const fetchProxyArchitecture = useCallback(async () => {
    if (!server) return;
    setProxyLoading(true);
    try {
      const res = await fetchNginxProxy(server.id, sessionPassword || server.ssh_password);
      if (res && res.success && res.proxy) {
        setProxyData(res.proxy);
        if (res.proxy.upstreams.length > 0) {
          setSelectedUpstream(res.proxy.upstreams[0]);
        }
        if (res.proxy.proxyRoutes.length > 0) {
          setSelectedRoute(res.proxy.proxyRoutes[0]);
        }
      }
    } catch (err: any) {
      console.error('[Failed to fetch Nginx proxy architecture]:', err);
    } finally {
      setProxyLoading(false);
    }
  }, [server, sessionPassword]);

  // Fetch full virtual hosts and server blocks
  const fetchSites = useCallback(async () => {
    if (!server) return;
    setSitesLoading(true);
    try {
      const res = await fetchNginxSites(server.id, sessionPassword || server.ssh_password);
      if (res && res.success && res.sites) {
        setSitesData(res.sites);
        if (res.sites.sites.length > 0) {
          setSelectedSite(res.sites.sites[0]);
        }
      }
    } catch (err: any) {
      console.error('[Failed to fetch Nginx server blocks]:', err);
    } finally {
      setSitesLoading(false);
    }
  }, [server, sessionPassword]);

  // Fetch full configuration tree topology
  const fetchConfigTree = useCallback(async () => {
    if (!server) return;
    setConfigLoading(true);
    try {
      const res = await fetchNginxConfigTopology(
        server.id,
        sessionPassword || server.ssh_password,
        discovery?.confPath,
        discovery?.prefixPath
      );
      if (res && res.success && res.topology) {
        setConfigTopology(res.topology);
        if (res.topology.files && res.topology.files.length > 0) {
          setSelectedConfigFile(res.topology.files[0]);
        }
      }
    } catch (err: any) {
      console.error('[Failed to fetch Nginx config topology]:', err);
    } finally {
      setConfigLoading(false);
    }
  }, [server, sessionPassword, discovery?.confPath, discovery?.prefixPath]);

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

  useEffect(() => {
    if (isOpen && server && (activeTab === 'config' || activeTab === 'vhosts' || activeTab === 'proxy') && !configTopology && !configLoading) {
      fetchConfigTree();
    }
  }, [isOpen, server, activeTab, configTopology, configLoading, fetchConfigTree]);

  useEffect(() => {
    if (isOpen && server && activeTab === 'vhosts' && !sitesData && !sitesLoading) {
      fetchSites();
    }
  }, [isOpen, server, activeTab, sitesData, sitesLoading, fetchSites]);

  useEffect(() => {
    if (isOpen && server && activeTab === 'proxy' && !proxyData && !proxyLoading) {
      fetchProxyArchitecture();
    }
  }, [isOpen, server, activeTab, proxyData, proxyLoading, fetchProxyArchitecture]);

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

          {/* TAB 2: VIRTUAL HOSTS & SITES AST MODEL */}
          {activeTab === 'vhosts' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span>{isEn ? 'Virtual Hosts & Server Blocks Model' : 'مدل هاست‌های مجازی و بلوک‌های سرور'}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    {isEn
                      ? `Total: ${sitesData?.totalSites ?? 0} sites • Active: ${sitesData?.activeSites ?? 0} • SSL Enabled: ${sitesData?.sslSites ?? 0} • Reverse Proxies: ${sitesData?.proxySites ?? 0}`
                      : `مجموع: ${sitesData?.totalSites ?? 0} سایت • فعال: ${sitesData?.activeSites ?? 0} • مجهز به SSL: ${sitesData?.sslSites ?? 0} • پروکسی معکوس: ${sitesData?.proxySites ?? 0}`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fetchSites}
                    disabled={sitesLoading}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                      isLightMode
                        ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${sitesLoading ? 'animate-spin' : ''}`} />
                    <span>{sitesLoading ? (isEn ? 'Parsing Sites...' : 'در حال استخراج سایت‌ها...') : (isEn ? 'Refresh Sites' : 'بروزرسانی سایت‌ها')}</span>
                  </button>

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
              </div>

              {/* Sites Summary Telemetry */}
              {sitesData && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'}`}>
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">{isEn ? 'Total Sites' : 'کل وب‌سایت‌ها'}</span>
                    <div className="text-base font-bold text-emerald-400 mt-1">{sitesData.totalSites}</div>
                  </div>
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'}`}>
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">{isEn ? 'Active Sites' : 'سایت‌های فعال'}</span>
                    <div className="text-base font-bold text-cyan-400 mt-1">{sitesData.activeSites}</div>
                  </div>
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'}`}>
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">{isEn ? 'Disabled Sites' : 'غیرفعال / بکاپ'}</span>
                    <div className="text-base font-bold text-amber-400 mt-1">{sitesData.disabledSites}</div>
                  </div>
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'}`}>
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">{isEn ? 'SSL Protected' : 'مجهز به SSL'}</span>
                    <div className="text-base font-bold text-emerald-300 mt-1">{sitesData.sslSites}</div>
                  </div>
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'}`}>
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">{isEn ? 'Reverse Proxies' : 'پروکسی‌های معکوس'}</span>
                    <div className="text-base font-bold text-purple-400 mt-1">{sitesData.proxySites}</div>
                  </div>
                </div>
              )}

              {/* Two-Pane Sites Explorer */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Sites List Column */}
                <div
                  className={`lg:col-span-5 p-3 rounded-xl border flex flex-col space-y-2 max-h-[520px] overflow-hidden ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  {/* Filter & Search Bar */}
                  <div className="space-y-2 shrink-0">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={sitesSearchQuery}
                        onChange={(e) => setSitesSearchQuery(e.target.value)}
                        placeholder={isEn ? 'Search domains, ports...' : 'جستجوی دامنه‌ها و پورت‌ها...'}
                        className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border outline-none font-mono transition ${
                          isLightMode
                            ? 'border-slate-300 bg-slate-50 focus:border-emerald-500 text-slate-800'
                            : 'border-slate-800 bg-slate-950/60 focus:border-emerald-500/50 text-slate-100'
                        }`}
                      />
                    </div>

                    {/* Filter Pills */}
                    <div className="flex items-center gap-1 overflow-x-auto text-[11px] pb-1">
                      {(['all', 'active', 'disabled', 'ssl', 'proxy'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setSitesFilter(mode)}
                          className={`px-2 py-0.5 rounded capitalize transition cursor-pointer shrink-0 font-medium ${
                            sitesFilter === mode
                              ? 'bg-emerald-500 text-slate-950 font-bold'
                              : isLightMode
                              ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {mode === 'all'
                            ? isEn ? 'All' : 'همه'
                            : mode === 'active'
                            ? isEn ? 'Active' : 'فعال'
                            : mode === 'disabled'
                            ? isEn ? 'Disabled' : 'غیرفعال'
                            : mode === 'ssl'
                            ? 'SSL'
                            : isEn ? 'Proxy' : 'پروکسی'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sites Scrollable List */}
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                    {sitesLoading ? (
                      <div className="p-8 text-center text-xs text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400" />
                        <span>{isEn ? 'Discovering Virtual Hosts...' : 'در حال استخراج هاست‌های مجازی...'}</span>
                      </div>
                    ) : !sitesData || sitesData.sites.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        <Layers className="w-6 h-6 mx-auto mb-2 text-slate-500" />
                        <span>{isEn ? 'No virtual hosts or server blocks detected' : 'هیچ هاست مجازی در کانفیگ‌ها یافت نشد'}</span>
                      </div>
                    ) : (
                      sitesData.sites
                        .filter((s) => {
                          if (sitesFilter === 'active' && !s.isEnabled) return false;
                          if (sitesFilter === 'disabled' && s.isEnabled) return false;
                          if (sitesFilter === 'ssl' && !s.sslEnabled) return false;
                          if (sitesFilter === 'proxy' && !s.locations.some((l) => l.proxyPass)) return false;

                          if (!sitesSearchQuery) return true;
                          const q = sitesSearchQuery.toLowerCase();
                          return (
                            s.primaryDomain.toLowerCase().includes(q) ||
                            s.serverNames.some((n) => n.toLowerCase().includes(q)) ||
                            s.fileRelativePath.toLowerCase().includes(q) ||
                            s.listens.some((l) => l.port.toString().includes(q))
                          );
                        })
                        .map((s) => {
                          const isSelected = selectedSite?.id === s.id;
                          const hasProxy = s.locations.some((l) => l.proxyPass);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setSelectedSite(s)}
                              className={`w-full text-left p-2.5 rounded-xl border transition cursor-pointer flex flex-col space-y-1.5 ${
                                isSelected
                                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200 shadow-sm'
                                  : isLightMode
                                  ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                                  : 'border-slate-800/80 bg-slate-950/40 hover:bg-slate-800/40 text-slate-200'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Globe className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-emerald-400' : 'text-slate-400'}`} />
                                  <span className="font-bold text-xs font-mono truncate">{s.primaryDomain}</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {s.isEnabled ? (
                                    <span className="w-2 h-2 rounded-full bg-emerald-400" title="Active / Enabled" />
                                  ) : (
                                    <span className="w-2 h-2 rounded-full bg-amber-400" title="Disabled" />
                                  )}
                                  {s.sslEnabled && (
                                    <span className="px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono border border-emerald-500/30">
                                      SSL
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                                <div className="flex items-center gap-1">
                                  {s.listens.map((l, i) => (
                                    <span key={i} className="px-1.5 py-0.2 rounded bg-slate-800/60 text-slate-300">
                                      :{l.port}
                                    </span>
                                  ))}
                                  {hasProxy && (
                                    <span className="px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[10px]">
                                      proxy
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                                  {s.fileRelativePath}
                                </span>
                              </div>
                            </button>
                          );
                        })
                    )}
                  </div>
                </div>

                {/* Site Inspection & Location Routing Column */}
                <div
                  className={`lg:col-span-7 p-4 rounded-xl border flex flex-col space-y-3 max-h-[520px] overflow-hidden ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  {selectedSite ? (
                    <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                      {/* Site Header */}
                      <div className="flex items-start justify-between border-b pb-3 gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold font-mono text-emerald-400">
                              {selectedSite.primaryDomain}
                            </h4>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              {selectedSite.context}
                            </span>
                            {selectedSite.isEnabled ? (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                {isEn ? 'Active' : 'فعال'}
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                {isEn ? 'Disabled' : 'غیرفعال'}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono mt-1">
                            Defined in: <strong className="text-slate-300">{selectedSite.definedInFile}</strong>
                          </p>
                        </div>
                      </div>

                      {/* Ports & Bindings */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-400 uppercase">
                          {isEn ? 'Listen Directives & Ports' : 'دایرکتیوهای Listen و پورت‌ها'}
                        </span>
                        <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                          {selectedSite.listens.map((l, idx) => (
                            <div
                              key={idx}
                              className="px-2 py-1 rounded-lg border border-slate-800 bg-slate-950/60 flex items-center gap-1.5"
                            >
                              <span className="text-emerald-400 font-bold">{l.raw}</span>
                              {l.isSsl && <span className="text-[10px] text-cyan-400">(SSL)</span>}
                              {l.isHttp2 && <span className="text-[10px] text-emerald-400">(HTTP/2)</span>}
                              {l.isDefaultServer && <span className="text-[10px] text-amber-400">(Default)</span>}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Server Names (Aliases) */}
                      {selectedSite.serverNames.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-bold text-slate-400 uppercase">
                            {isEn ? 'Server Names & Aliases' : 'نام‌های سرور و دامنه‌های متصل'}
                          </span>
                          <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                            {selectedSite.serverNames.map((sn, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded border border-slate-800 bg-slate-950/40 text-slate-200"
                              >
                                {sn}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Root & Static Index */}
                      {selectedSite.rootPath && (
                        <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40 text-xs font-mono">
                          <span className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                            {isEn ? 'Document Root' : 'مسیر ریشه وب (Root Path)'}
                          </span>
                          <div className="text-amber-300 font-bold mt-0.5">{selectedSite.rootPath}</div>
                          {selectedSite.indexFiles && selectedSite.indexFiles.length > 0 && (
                            <div className="text-slate-400 text-[11px] mt-1">
                              Index: {selectedSite.indexFiles.join(', ')}
                            </div>
                          )}
                        </div>
                      )}

                      {/* SSL Certificates (Zero Private Key Leakage) */}
                      {selectedSite.sslEnabled && (
                        <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 text-xs font-mono space-y-1">
                          <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                            <ShieldCheck className="w-4 h-4" />
                            <span>{isEn ? 'SSL / TLS Certificate Binding' : 'گواهی امنیتی SSL/TLS متصل'}</span>
                          </div>
                          {selectedSite.sslCertificate && (
                            <div className="text-[11px] text-slate-300 truncate">
                              <strong>Cert:</strong> {selectedSite.sslCertificate}
                            </div>
                          )}
                          {selectedSite.sslCertificateKey && (
                            <div className="text-[11px] text-slate-400 truncate">
                              <strong>Key Path:</strong> {selectedSite.sslCertificateKey}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Location Routing Blocks */}
                      <div className="space-y-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase">
                          {isEn ? `Locations & Routing (${selectedSite.locations.length})` : `مسیرها و روتینگ (${selectedSite.locations.length})`}
                        </span>

                        {selectedSite.locations.length === 0 ? (
                          <div className="text-xs text-slate-500 italic font-mono p-2">
                            {isEn ? 'No location directives explicitly defined' : 'دایرکتیو location مجزا تعریف نشده است'}
                          </div>
                        ) : (
                          <div className="space-y-1.5 font-mono text-xs">
                            {selectedSite.locations.map((loc, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-lg border border-slate-800 bg-slate-950/60 flex flex-col space-y-1"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-emerald-400">location {loc.path}</span>
                                  {loc.websocketSupport && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                      WebSocket
                                    </span>
                                  )}
                                </div>

                                {loc.proxyPass && (
                                  <div className="text-cyan-300 text-[11px]">
                                    <strong className="text-slate-400">proxy_pass:</strong> {loc.proxyPass}
                                  </div>
                                )}
                                {loc.root && (
                                  <div className="text-amber-300 text-[11px]">
                                    <strong className="text-slate-400">root:</strong> {loc.root}
                                  </div>
                                )}
                                {loc.alias && (
                                  <div className="text-purple-300 text-[11px]">
                                    <strong className="text-slate-400">alias:</strong> {loc.alias}
                                  </div>
                                )}
                                {loc.tryFiles && (
                                  <div className="text-slate-300 text-[11px]">
                                    <strong className="text-slate-400">try_files:</strong> {loc.tryFiles}
                                  </div>
                                )}
                                {loc.fastcgiPass && (
                                  <div className="text-amber-400 text-[11px]">
                                    <strong className="text-slate-400">fastcgi_pass:</strong> {loc.fastcgiPass}
                                  </div>
                                )}
                                {loc.returnDirective && (
                                  <div className="text-rose-400 text-[11px]">
                                    <strong className="text-slate-400">return:</strong> {loc.returnDirective}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Raw Server Block Snippet */}
                      <div className="space-y-1">
                        <span className="text-[11px] font-bold text-slate-400 uppercase">
                          {isEn ? 'Configuration Snippet' : 'تکه کد کانفیگ'}
                        </span>
                        <pre className="font-mono text-xs p-3 rounded-lg bg-black/70 text-slate-200 overflow-x-auto whitespace-pre">
                          {selectedSite.rawBlockSnippet}
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                      <span>{isEn ? 'Select a virtual host to inspect details' : 'یک هاست مجازی را برای بررسی انتخاب کنید'}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: REVERSE PROXY & UPSTREAMS */}
          {activeTab === 'proxy' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Network className="w-4 h-4 text-emerald-400" />
                    <span>{isEn ? 'Reverse Proxy & Load Balancing Upstreams' : 'پروکسی معکوس و آپ‌استریم‌های لود بالانسر'}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    {isEn
                      ? `Upstream Pools: ${proxyData?.totalUpstreams ?? 0} (${proxyData?.totalUpstreamServers ?? 0} backend targets) • Active Proxy Routes: ${proxyData?.totalProxyRoutes ?? 0} (WebSockets: ${proxyData?.websocketRoutesCount ?? 0})`
                      : `استخرهای بالادستی: ${proxyData?.totalUpstreams ?? 0} (${proxyData?.totalUpstreamServers ?? 0} تارگت بک‌اند) • روت‌های پروکسی فعال: ${proxyData?.totalProxyRoutes ?? 0} (وب‌سوکت: ${proxyData?.websocketRoutesCount ?? 0})`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fetchProxyArchitecture}
                    disabled={proxyLoading}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                      isLightMode
                        ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${proxyLoading ? 'animate-spin' : ''}`} />
                    <span>{proxyLoading ? (isEn ? 'Parsing Proxy...' : 'در حال بارگذاری...') : (isEn ? 'Refresh Proxy' : 'بروزرسانی پروکسی')}</span>
                  </button>

                  <FieldInfoTooltip
                    fieldName="Nginx Upstream Pool & Reverse Proxy"
                    infoWhatEn="A group of internal backend server addresses that Nginx balances incoming web traffic across, mapped with proxy_pass directives."
                    infoWhatFa="گروهی از آدرس‌های سرورهای بک‌اند که Nginx ترافیک ورودی را بین آنها توزیع می‌کند و با دستورات proxy_pass نگاشت می‌شوند."
                    infoWhyEn="Essential for microservices, Node.js/Python backend apps, high availability, and horizontal scaling."
                    infoWhyFa="ضروری برای میکروسرویس‌ها، برنامه‌های نود و پایتون، افزونگی و مقیاس‌پذیری افقی."
                    infoExampleEn="upstream backend_pool { server 127.0.0.1:3000; server 127.0.0.1:3001; }"
                    infoExampleFa="upstream backend_pool { server 127.0.0.1:3000; server 127.0.0.1:3001; }"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
              </div>

              {/* Proxy Telemetry Cards */}
              {proxyData && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'}`}>
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">{isEn ? 'Upstream Pools' : 'استخرهای آپ‌استریم'}</span>
                    <div className="text-base font-bold text-amber-400 mt-1">{proxyData.totalUpstreams}</div>
                  </div>
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'}`}>
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">{isEn ? 'Backend Targets' : 'تارگت‌های بک‌اند'}</span>
                    <div className="text-base font-bold text-cyan-400 mt-1">{proxyData.totalUpstreamServers}</div>
                  </div>
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'}`}>
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">{isEn ? 'Proxy Routes' : 'مسیرهای Proxy Pass'}</span>
                    <div className="text-base font-bold text-emerald-400 mt-1">{proxyData.totalProxyRoutes}</div>
                  </div>
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'}`}>
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">{isEn ? 'WebSocket Routes' : 'پشتیبانی وب‌سوکت'}</span>
                    <div className="text-base font-bold text-purple-400 mt-1">{proxyData.websocketRoutesCount}</div>
                  </div>
                </div>
              )}

              {/* View Switcher: Upstream Pools vs Proxy Routes */}
              <div className="flex items-center justify-between gap-2 border-b pb-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setProxyViewMode('upstreams')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                      proxyViewMode === 'upstreams'
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : isLightMode
                        ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Server className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Upstream Pools' : 'استخرهای بالادستی'} ({proxyData?.totalUpstreams ?? 0})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setProxyViewMode('routes')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                      proxyViewMode === 'routes'
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : isLightMode
                        ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Network className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Reverse Proxy Routes' : 'مسیرهای پروکسی'} ({proxyData?.totalProxyRoutes ?? 0})</span>
                  </button>
                </div>

                {/* Search Bar */}
                <div className="relative min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                  <input
                    type="text"
                    value={proxySearchQuery}
                    onChange={(e) => setProxySearchQuery(e.target.value)}
                    placeholder={
                      proxyViewMode === 'upstreams'
                        ? isEn ? 'Search upstreams, servers...' : 'جستجوی استخرها و سرورها...'
                        : isEn ? 'Search proxy targets, locations...' : 'جستجوی اهداف پروکسی...'
                    }
                    className={`w-full pl-8 pr-3 py-1 text-xs rounded-lg border outline-none font-mono transition ${
                      isLightMode
                        ? 'border-slate-300 bg-white focus:border-emerald-500 text-slate-800'
                        : 'border-slate-800 bg-slate-950/60 focus:border-emerald-500/50 text-slate-100'
                    }`}
                  />
                </div>
              </div>

              {/* Two-Pane Explorer */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left/Right List Column */}
                <div
                  className={`lg:col-span-5 p-3 rounded-xl border flex flex-col space-y-2 max-h-[500px] overflow-hidden ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                    {proxyLoading ? (
                      <div className="p-8 text-center text-xs text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400" />
                        <span>{isEn ? 'Discovering Proxy & Upstreams...' : 'در حال استخراج پروکسی‌ها و آپ‌استریم‌ها...'}</span>
                      </div>
                    ) : proxyViewMode === 'upstreams' ? (
                      // UPSTREAMS LIST
                      !proxyData || proxyData.upstreams.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          <Server className="w-6 h-6 mx-auto mb-2 text-slate-500" />
                          <span>{isEn ? 'No upstream pools defined in Nginx configs' : 'هیچ استخر آپ‌استریمی تعریف نشده است'}</span>
                        </div>
                      ) : (
                        proxyData.upstreams
                          .filter((u) => {
                            if (!proxySearchQuery) return true;
                            const q = proxySearchQuery.toLowerCase();
                            return (
                              u.name.toLowerCase().includes(q) ||
                              u.fileRelativePath.toLowerCase().includes(q) ||
                              u.servers.some((s) => s.address.toLowerCase().includes(q))
                            );
                          })
                          .map((u) => {
                            const isSelected = selectedUpstream?.id === u.id;
                            return (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => setSelectedUpstream(u)}
                                className={`w-full text-left p-2.5 rounded-xl border transition cursor-pointer flex flex-col space-y-1.5 ${
                                  isSelected
                                    ? 'border-amber-500/50 bg-amber-500/15 text-amber-200 shadow-sm'
                                    : isLightMode
                                    ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                                    : 'border-slate-800/80 bg-slate-950/40 hover:bg-slate-800/40 text-slate-200'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <Server className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-amber-400' : 'text-slate-400'}`} />
                                    <span className="font-bold text-xs font-mono truncate">{u.name}</span>
                                  </div>
                                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/30 shrink-0">
                                    {u.algorithm}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                                  <span>{u.servers.length} {isEn ? 'target servers' : 'سرور مقصد'}</span>
                                  <span className="text-[10px] text-slate-500 truncate">{u.fileRelativePath}</span>
                                </div>
                              </button>
                            );
                          })
                      )
                    ) : (
                      // PROXY ROUTES LIST
                      !proxyData || proxyData.proxyRoutes.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          <Network className="w-6 h-6 mx-auto mb-2 text-slate-500" />
                          <span>{isEn ? 'No proxy_pass directives detected' : 'هیچ دستور proxy_pass در کانفیگ‌ها یافت نشد'}</span>
                        </div>
                      ) : (
                        proxyData.proxyRoutes
                          .filter((r) => {
                            if (!proxySearchQuery) return true;
                            const q = proxySearchQuery.toLowerCase();
                            return (
                              r.locationPath.toLowerCase().includes(q) ||
                              r.proxyPassTarget.toLowerCase().includes(q) ||
                              r.sitePrimaryDomain.toLowerCase().includes(q)
                            );
                          })
                          .map((r) => {
                            const isSelected = selectedRoute?.id === r.id;
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => setSelectedRoute(r)}
                                className={`w-full text-left p-2.5 rounded-xl border transition cursor-pointer flex flex-col space-y-1.5 ${
                                  isSelected
                                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200 shadow-sm'
                                    : isLightMode
                                    ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                                    : 'border-slate-800/80 bg-slate-950/40 hover:bg-slate-800/40 text-slate-200'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <Network className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-emerald-400' : 'text-slate-400'}`} />
                                    <span className="font-bold text-xs font-mono truncate">{r.locationPath}</span>
                                  </div>
                                  {r.websocketEnabled && (
                                    <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono border border-purple-500/30 shrink-0">
                                      WS
                                    </span>
                                  )}
                                </div>

                                <div className="text-[11px] font-mono text-cyan-400 truncate">
                                  {r.proxyPassTarget}
                                </div>

                                <div className="text-[10px] text-slate-500 font-mono truncate">
                                  {r.siteFileRelativePath}
                                </div>
                              </button>
                            );
                          })
                      )
                    )}
                  </div>
                </div>

                {/* Right Details Column */}
                <div
                  className={`lg:col-span-7 p-4 rounded-xl border flex flex-col space-y-3 max-h-[500px] overflow-hidden ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  {proxyViewMode === 'upstreams' ? (
                    selectedUpstream ? (
                      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                        <div className="flex items-start justify-between border-b pb-3 gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold font-mono text-amber-400">
                                upstream {selectedUpstream.name}
                              </h4>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {selectedUpstream.algorithm}
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                {selectedUpstream.context}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 font-mono mt-1">
                              File: <strong className="text-slate-300">{selectedUpstream.definedInFile}</strong>
                              {selectedUpstream.keepalive && ` • Keepalive: ${selectedUpstream.keepalive}`}
                            </p>
                          </div>
                        </div>

                        {/* Servers List in Pool */}
                        <div className="space-y-2">
                          <span className="text-[11px] font-bold text-slate-400 uppercase">
                            {isEn ? `Backend Servers (${selectedUpstream.servers.length})` : `سرورهای بک‌اند (${selectedUpstream.servers.length})`}
                          </span>

                          <div className="space-y-1.5 font-mono text-xs">
                            {selectedUpstream.servers.map((srv, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-lg border border-slate-800 bg-slate-950/60 flex items-center justify-between gap-2 flex-wrap"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Server className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                  <span className="font-bold text-slate-100 truncate">
                                    {srv.address}:{srv.port || 80}
                                  </span>
                                  {srv.isUnixSocket && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                                      UNIX Socket
                                    </span>
                                  )}
                                  {srv.isResolvingDomain && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300">
                                      DNS Domain
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 text-[11px]">
                                  {srv.weight && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
                                      weight={srv.weight}
                                    </span>
                                  )}
                                  {srv.maxFails && (
                                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                                      max_fails={srv.maxFails}
                                    </span>
                                  )}
                                  {srv.isBackup && (
                                    <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300">
                                      backup
                                    </span>
                                  )}
                                  {srv.isDown && (
                                    <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400">
                                      down
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Raw Code Snippet */}
                        <div className="space-y-1">
                          <span className="text-[11px] font-bold text-slate-400 uppercase">
                            {isEn ? 'Upstream Code Block' : 'بلوک کد آپ‌استریم'}
                          </span>
                          <pre className="font-mono text-xs p-3 rounded-lg bg-black/70 text-slate-200 overflow-x-auto whitespace-pre">
                            {selectedUpstream.rawSnippet}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                        <span>{isEn ? 'Select an upstream pool to inspect' : 'یک استخر آپ‌استریم را برای بررسی انتخاب کنید'}</span>
                      </div>
                    )
                  ) : (
                    selectedRoute ? (
                      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                        <div className="flex items-start justify-between border-b pb-3 gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold font-mono text-emerald-400">
                                location {selectedRoute.locationPath}
                              </h4>
                              {selectedRoute.isUpstream && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  Pool: {selectedRoute.matchedUpstreamName}
                                </span>
                              )}
                              {selectedRoute.websocketEnabled && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                  WebSocket Enabled
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 font-mono mt-1">
                              File: <strong className="text-slate-300">{selectedRoute.siteFileRelativePath}</strong>
                            </p>
                          </div>
                        </div>

                        {/* Target URL */}
                        <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60 space-y-1">
                          <span className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                            {isEn ? 'Proxy Target Directive' : 'تارگت دستور proxy_pass'}
                          </span>
                          <div className="text-sm font-bold font-mono text-cyan-300">
                            {selectedRoute.proxyPassTarget}
                          </div>
                        </div>

                        {/* Forwarded Headers */}
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-bold text-slate-400 uppercase">
                            {isEn ? 'Forwarded Headers (proxy_set_header)' : 'هدرهای ارسالی (proxy_set_header)'}
                          </span>
                          {Object.keys(selectedRoute.proxySetHeaders).length === 0 ? (
                            <div className="text-xs text-slate-500 italic font-mono p-2">
                              {isEn ? 'Default Nginx headers applied' : 'هدرهای پیش‌فرض Nginx اعمال می‌شوند'}
                            </div>
                          ) : (
                            <div className="space-y-1 font-mono text-xs">
                              {Object.entries(selectedRoute.proxySetHeaders).map(([k, v], idx) => (
                                <div
                                  key={idx}
                                  className="px-2.5 py-1.5 rounded border border-slate-800 bg-slate-950/40 flex items-center justify-between"
                                >
                                  <span className="text-slate-400 font-bold">{k}:</span>
                                  <span className="text-emerald-400">{v}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Timeouts */}
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-950/40">
                            <span className="text-[10px] text-slate-400 font-sans font-bold uppercase">{isEn ? 'Read Timeout' : 'تایم‌اوت خواندن'}</span>
                            <div className="text-slate-200 font-bold mt-0.5">{selectedRoute.proxyReadTimeout || '60s (default)'}</div>
                          </div>
                          <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-950/40">
                            <span className="text-[10px] text-slate-400 font-sans font-bold uppercase">{isEn ? 'Connect Timeout' : 'تایم‌اوت اتصال'}</span>
                            <div className="text-slate-200 font-bold mt-0.5">{selectedRoute.proxyConnectTimeout || '60s (default)'}</div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                        <span>{isEn ? 'Select a reverse proxy route to inspect' : 'یک مسیر پروکسی را برای بررسی انتخاب کنید'}</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CONFIGURATION TREE & AST TOPOLOGY */}
          {activeTab === 'config' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <FolderTree className="w-4 h-4 text-emerald-400" />
                    <span>{isEn ? 'Configuration Files & Include Hierarchy Graph' : 'گراف سلسله‌مراتبی فایل‌های کانفیگ و Includeها'}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    {isEn
                      ? `Root: ${configTopology?.mainConfigPath || discovery?.confPath || '/etc/nginx/nginx.conf'} • Discovered: ${configTopology?.totalFiles ?? 0} files (${configTopology?.totalLines ?? 0} lines)`
                      : `ریشه: ${configTopology?.mainConfigPath || discovery?.confPath || '/etc/nginx/nginx.conf'} • کشف‌شده: ${configTopology?.totalFiles ?? 0} فایل (${configTopology?.totalLines ?? 0} خط)`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fetchConfigTree}
                    disabled={configLoading}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                      isLightMode
                        ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${configLoading ? 'animate-spin' : ''}`} />
                    <span>{configLoading ? (isEn ? 'Traversing...' : 'در حال پیمایش...') : (isEn ? 'Refresh Tree' : 'بروزرسانی درخت')}</span>
                  </button>

                  <FieldInfoTooltip
                    fieldName="Nginx Include Hierarchy"
                    infoWhatEn="Nginx configurations are dynamically composed via 'include' directives pointing to individual files or wildcard glob paths."
                    infoWhatFa="تنظیمات Nginx از طریق دایرکتیوهای include و پترن‌های glob به‌صورت درختی و تو در تو بارگذاری می‌شوند."
                    infoWhyEn="Eliminates assumptions about Ubuntu's sites-available and maps the exact configuration layout used on this server."
                    infoWhyFa="وابستگی به ساختار پیش‌فرض اوبونتو را از بین برده و معماری واقعی اعمال‌شده بر روی این سرور را نشان می‌دهد."
                    infoExampleEn="include /etc/nginx/conf.d/*.conf;"
                    infoExampleFa="include /etc/nginx/conf.d/*.conf;"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
              </div>

              {/* Topology Summary Cards */}
              {configTopology && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'}`}>
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">{isEn ? 'Scanned Files' : 'فایل‌های پویش‌شده'}</span>
                    <div className="text-base font-bold text-emerald-400 mt-1">{configTopology.totalFiles}</div>
                  </div>
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'}`}>
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">{isEn ? 'Server Blocks' : 'بلوک‌های سرور'}</span>
                    <div className="text-base font-bold text-cyan-400 mt-1">{configTopology.detectedContexts.totalServerBlocks}</div>
                  </div>
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'}`}>
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">{isEn ? 'Upstream Pools' : 'استخرهای بالادستی'}</span>
                    <div className="text-base font-bold text-amber-400 mt-1">{configTopology.detectedContexts.totalUpstreams}</div>
                  </div>
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'}`}>
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">{isEn ? 'Contexts Detected' : 'کانتکست‌های کشف‌شده'}</span>
                    <div className="text-xs font-bold text-slate-200 mt-1.5 flex gap-1">
                      {configTopology.detectedContexts.hasHttp && <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">HTTP</span>}
                      {configTopology.detectedContexts.hasStream && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">STREAM</span>}
                      {configTopology.detectedContexts.hasEvents && <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">EVENTS</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* Two-Pane Viewer: Tree List on Left/Right, Code Viewer on Other */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* File Tree Column */}
                <div
                  className={`lg:col-span-5 p-3 rounded-xl border flex flex-col space-y-2 max-h-[500px] overflow-hidden ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  {/* Search / Filter Input */}
                  <div className="relative shrink-0">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={configSearchQuery}
                      onChange={(e) => setConfigSearchQuery(e.target.value)}
                      placeholder={isEn ? 'Filter config files...' : 'جستجوی فایل‌های کانفیگ...'}
                      className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border outline-none font-mono transition ${
                        isLightMode
                          ? 'border-slate-300 bg-slate-50 focus:border-emerald-500 text-slate-800'
                          : 'border-slate-800 bg-slate-950/60 focus:border-emerald-500/50 text-slate-100'
                      }`}
                    />
                  </div>

                  {/* Files List with Indentation & Level Badges */}
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                    {configLoading ? (
                      <div className="p-8 text-center text-xs text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400" />
                        <span>{isEn ? 'Traversing Include Hierarchy...' : 'در حال پویش بازگشتی دایرکتیوهای Include...'}</span>
                      </div>
                    ) : !configTopology || configTopology.files.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        <FileCode className="w-6 h-6 mx-auto mb-2 text-slate-500" />
                        <span>{isEn ? 'No configuration files discovered' : 'هیچ فایلی کشف نشد'}</span>
                      </div>
                    ) : (
                      configTopology.files
                        .filter((f) =>
                          !configSearchQuery ||
                          f.filePath.toLowerCase().includes(configSearchQuery.toLowerCase()) ||
                          f.relativePath.toLowerCase().includes(configSearchQuery.toLowerCase())
                        )
                        .map((f, idx) => {
                          const isSelected = selectedConfigFile?.filePath === f.filePath;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setSelectedConfigFile(f)}
                              style={{ paddingLeft: `${Math.max(8, f.level * 16 + 8)}px` }}
                              className={`w-full text-left py-2 pr-2.5 rounded-lg border transition cursor-pointer flex items-center justify-between gap-2 text-xs font-mono ${
                                isSelected
                                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-sm'
                                  : isLightMode
                                  ? 'border-transparent hover:bg-slate-100 text-slate-700'
                                  : 'border-transparent hover:bg-slate-800/50 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <FileCode className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-emerald-400' : 'text-slate-400'}`} />
                                <div className="truncate">
                                  <div className="font-bold truncate text-[11px]">{f.relativePath}</div>
                                  <div className="text-[9px] text-slate-500 truncate">{f.filePath}</div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 text-[10px]">
                                {f.serverBlocksCount > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" title="Server Blocks">
                                    {f.serverBlocksCount} srv
                                  </span>
                                )}
                                {f.upstreamsCount > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30" title="Upstream Pools">
                                    {f.upstreamsCount} ups
                                  </span>
                                )}
                                <span className="text-slate-500">{f.lineCount}L</span>
                              </div>
                            </button>
                          );
                        })
                    )}
                  </div>
                </div>

                {/* File Preview & Details Column */}
                <div
                  className={`lg:col-span-7 p-4 rounded-xl border flex flex-col space-y-3 max-h-[500px] overflow-hidden ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  {selectedConfigFile ? (
                    <>
                      <div className="flex items-center justify-between border-b pb-2.5 shrink-0">
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold font-mono text-emerald-400 truncate">
                            {selectedConfigFile.filePath}
                          </h4>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {selectedConfigFile.sizeBytes} bytes • {selectedConfigFile.lineCount} lines • Includes: {selectedConfigFile.includesCount}
                            {selectedConfigFile.includedFrom && ` • Included from: ${selectedConfigFile.includedFrom}`}
                          </p>
                        </div>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">
                          Level {selectedConfigFile.level}
                        </span>
                      </div>

                      {/* Code Snippet / Content */}
                      <div className="flex-1 overflow-auto rounded-lg bg-black/70 border border-slate-800/80 p-3 font-mono text-xs text-slate-200 whitespace-pre">
                        {selectedConfigFile.fullContent || selectedConfigFile.contentSnippet || '# Empty configuration file'}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                      <span>{isEn ? 'Select a file to inspect content' : 'یک فایل را برای مشاهده محتوا انتخاب کنید'}</span>
                    </div>
                  )}
                </div>
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
