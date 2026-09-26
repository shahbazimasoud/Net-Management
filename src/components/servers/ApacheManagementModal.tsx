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
  Hash,
  Eye,
  CornerDownRight,
  Network,
  Plus,
  Trash2,
  Power,
  ArrowUpRight,
  Code2,
} from 'lucide-react';
import {
  RemoteServer,
  ApacheInstallationDetails,
  ApacheInstanceInfo,
  ApacheConfigFileNode,
  ApacheConfigTopologyTree,
  ApacheVirtualHost,
  ApacheVirtualHostsSummary,
  CreateApacheVirtualHostParams,
} from '../../types';
import {
  discoverApacheTopology,
  fetchApacheConfigTopology,
  fetchApacheVirtualHosts,
  toggleApacheVirtualHostStatus,
  createApacheVirtualHost,
  deleteApacheVirtualHost,
} from '../../services/api';
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
  | 'topology'
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

  // Live Discovery State (Phase 2)
  const [discovery, setDiscovery] = useState<ApacheInstallationDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [testingSyntax, setTestingSyntax] = useState<boolean>(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [moduleFilter, setModuleFilter] = useState<string>('');
  const [showCompilerDefines, setShowCompilerDefines] = useState<boolean>(false);

  // Configuration Topology State (Phase 3)
  const [topology, setTopology] = useState<ApacheConfigTopologyTree | null>(null);
  const [loadingTopology, setLoadingTopology] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<ApacheConfigFileNode | null>(null);
  const [topologySearch, setTopologySearch] = useState<string>('');
  const [copiedFilePath, setCopiedFilePath] = useState<string | null>(null);

  // Virtual Hosts State (Phase 4)
  const [vhostsSummary, setVhostsSummary] = useState<ApacheVirtualHostsSummary | null>(null);
  const [loadingVHosts, setLoadingVHosts] = useState<boolean>(false);
  const [vhostFilter, setVhostFilter] = useState<string>('');
  const [vhostStatusFilter, setVhostStatusFilter] = useState<
    'all' | 'active' | 'disabled' | 'ssl' | 'proxy' | 'static'
  >('all');
  const [togglingVHostId, setTogglingVHostId] = useState<string | null>(null);
  const [inspectVHost, setInspectVHost] = useState<ApacheVirtualHost | null>(null);
  const [isCreateVHostOpen, setIsCreateVHostOpen] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState<CreateApacheVirtualHostParams>({
    siteType: 'static',
    siteName: '',
    serverName: '',
    serverAliases: '',
    port: 80,
    serverAdmin: 'webmaster@localhost',
    documentRoot: '/var/www/',
    proxyTarget: 'http://127.0.0.1:3000',
    enableSsl: false,
    sslCertFile: '',
    sslKeyFile: '',
    autoEnable: true,
  });
  const [creatingVHost, setCreatingVHost] = useState<boolean>(false);
  const [deletingVHostId, setDeletingVHostId] = useState<string | null>(null);

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

  // Fetch complete Apache configuration topology tree (Phase 3)
  const fetchTopologyData = useCallback(async () => {
    if (!server) return;
    setLoadingTopology(true);
    setActionFeedback(null);
    try {
      const res = await fetchApacheConfigTopology(
        server.id,
        server.ssh_password,
        discovery?.confPath,
        discovery?.serverRoot
      );
      if (res && res.success && res.topology) {
        setTopology(res.topology);
        if (res.topology.files && res.topology.files.length > 0) {
          setSelectedFile(res.topology.files[0]);
        }
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn
            ? 'Failed to scan Apache configuration topology'
            : 'خطا در پیمایش ساختار درختی کانفیگ آپاچی',
          details: res?.error,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn
          ? 'Topology scanner connection error'
          : 'خطای ارتباط در اسکنر توپولوژی کانفیگ',
        details: err?.message,
      });
    } finally {
      setLoadingTopology(false);
    }
  }, [server, discovery, isEn]);

  // Fetch all VirtualHosts (Phase 4)
  const fetchVHostsData = useCallback(async () => {
    if (!server) return;
    setLoadingVHosts(true);
    setActionFeedback(null);
    try {
      const res = await fetchApacheVirtualHosts(server.id, server.ssh_password);
      if (res && res.success && res.summary) {
        setVhostsSummary(res.summary);
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn
            ? 'Failed to discover Apache VirtualHosts'
            : 'خطا در استخراج هاست‌های مجازی آپاچی',
          details: res?.error,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn
          ? 'VirtualHost scanner connection error'
          : 'خطای ارتباط در دریافت هاست‌های مجازی',
        details: err?.message,
      });
    } finally {
      setLoadingVHosts(false);
    }
  }, [server, isEn]);

  // Toggle VirtualHost status (Enable / Disable)
  const handleToggleVHost = async (vhost: ApacheVirtualHost) => {
    if (!server) return;
    setTogglingVHostId(vhost.id);
    setActionFeedback(null);
    try {
      const newStatus = !vhost.isEnabled;
      const res = await toggleApacheVirtualHostStatus(
        server.id,
        vhost.siteName,
        newStatus,
        vhost.definedInFile,
        server.ssh_password
      );
      if (res && res.success) {
        setActionFeedback({
          type: 'success',
          message: res.message || (isEn ? 'VirtualHost updated successfully' : 'وضعیت هاست مجازی به‌روزرسانی شد'),
        });
        await fetchVHostsData();
        await fetchTopologyData();
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn ? 'Failed to update VirtualHost status' : 'خطا در تغییر وضعیت هاست مجازی',
          details: res?.error,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn ? 'VirtualHost toggle failed' : 'خطای سیستمی در فعال‌سازی/غیرفعال‌سازی',
        details: err?.message,
      });
    } finally {
      setTogglingVHostId(null);
    }
  };

  // Delete VirtualHost
  const handleDeleteVHost = async (vhost: ApacheVirtualHost) => {
    if (!server) return;
    const confirmMsg = isEn
      ? `Are you sure you want to permanently delete VirtualHost '${vhost.serverName}' (${vhost.siteName})?`
      : `آیا از حذف دائمی هاست مجازی '${vhost.serverName}' (${vhost.siteName}) اطمینان دارید؟`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingVHostId(vhost.id);
    setActionFeedback(null);
    try {
      const res = await deleteApacheVirtualHost(
        server.id,
        vhost.siteName,
        vhost.definedInFile,
        server.ssh_password
      );
      if (res && res.success) {
        setActionFeedback({
          type: 'success',
          message: res.message || (isEn ? 'VirtualHost deleted successfully' : 'هاست مجازی با موفقیت حذف شد'),
        });
        await fetchVHostsData();
        await fetchTopologyData();
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn ? 'Failed to delete VirtualHost' : 'خطا در حذف هاست مجازی',
          details: res?.error,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn ? 'VirtualHost deletion failed' : 'خطای سیستمی در حذف هاست مجازی',
        details: err?.message,
      });
    } finally {
      setDeletingVHostId(null);
    }
  };

  // Create VirtualHost Submit
  const handleCreateVHostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!server) return;

    if (!createForm.siteName.trim()) {
      alert(isEn ? 'Please enter a site name' : 'لطفاً نام سایت را وارد کنید');
      return;
    }
    if (!createForm.serverName.trim()) {
      alert(isEn ? 'Please enter a ServerName (domain)' : 'لطفاً دامنه اصلی ServerName را وارد کنید');
      return;
    }

    setCreatingVHost(true);
    setActionFeedback(null);
    try {
      const res = await createApacheVirtualHost(server.id, createForm, server.ssh_password);
      if (res && res.success) {
        setActionFeedback({
          type: 'success',
          message: res.message || (isEn ? 'VirtualHost created successfully' : 'هاست مجازی جدید با موفقیت ایجاد و مستقر شد'),
        });
        setIsCreateVHostOpen(false);
        setCreateForm({
          siteType: 'static',
          siteName: '',
          serverName: '',
          serverAliases: '',
          port: 80,
          serverAdmin: 'webmaster@localhost',
          documentRoot: '/var/www/',
          proxyTarget: 'http://127.0.0.1:3000',
          enableSsl: false,
          sslCertFile: '',
          sslKeyFile: '',
          autoEnable: true,
        });
        await fetchVHostsData();
        await fetchTopologyData();
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn ? 'Failed to create VirtualHost' : 'خطا در ساخت هاست مجازی',
          details: res?.error,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn ? 'VirtualHost creation failed' : 'خطای سیستمی در ایجاد هاست مجازی',
        details: err?.message,
      });
    } finally {
      setCreatingVHost(false);
    }
  };

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFilePath(text);
    setTimeout(() => setCopiedFilePath(null), 2000);
  };

  useEffect(() => {
    if (isOpen && server) {
      fetchDiscovery();
    }
  }, [isOpen, server, fetchDiscovery]);

  useEffect(() => {
    if (activeTab === 'topology' && !topology && !loadingTopology && server) {
      fetchTopologyData();
    }
    if (activeTab === 'vhosts' && !vhostsSummary && !loadingVHosts && server) {
      fetchVHostsData();
    }
  }, [activeTab, topology, loadingTopology, vhostsSummary, loadingVHosts, server, fetchTopologyData, fetchVHostsData]);

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

  const filteredTopologyFiles = (topology?.files || []).filter((f) => {
    if (!topologySearch) return true;
    const term = topologySearch.toLowerCase();
    return (
      f.filePath.toLowerCase().includes(term) ||
      f.relativePath.toLowerCase().includes(term)
    );
  });

  const filteredVHosts = (vhostsSummary?.vhosts || []).filter((vh) => {
    if (vhostStatusFilter === 'active' && !vh.isEnabled) return false;
    if (vhostStatusFilter === 'disabled' && vh.isEnabled) return false;
    if (vhostStatusFilter === 'ssl' && !vh.isSsl) return false;
    if (vhostStatusFilter === 'proxy' && vh.proxyPassTargets.length === 0) return false;
    if (vhostStatusFilter === 'static' && (!vh.documentRoot || vh.proxyPassTargets.length > 0)) return false;

    if (!vhostFilter) return true;
    const term = vhostFilter.toLowerCase();
    return (
      vh.serverName.toLowerCase().includes(term) ||
      vh.serverAliases.some((a) => a.toLowerCase().includes(term)) ||
      vh.siteName.toLowerCase().includes(term) ||
      vh.definedInFile.toLowerCase().includes(term) ||
      String(vh.port).includes(term) ||
      (vh.documentRoot && vh.documentRoot.toLowerCase().includes(term))
    );
  });

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
                  {isEn ? 'Phase 4: Virtual Hosts' : 'فاز ۴: هاست‌های مجازی'}
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
            {/* Refresh */}
            <button
              type="button"
              onClick={() => {
                fetchDiscovery();
                if (activeTab === 'topology') fetchTopologyData();
                if (activeTab === 'vhosts') fetchVHostsData();
              }}
              disabled={loading || loadingTopology || loadingVHosts}
              title={isEn ? 'Refresh Live Data' : 'بازخوانی داده‌های زنده'}
              className={`p-2 rounded-lg border transition cursor-pointer ${
                loading || loadingTopology || loadingVHosts ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                isLightMode
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  : 'border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <RefreshCw
                className={`w-4 h-4 ${
                  loading || loadingTopology || loadingVHosts ? 'animate-spin text-amber-400' : ''
                }`}
              />
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
            <span>{isEn ? 'Overview & Discovery' : 'نمای کلی و کشف'}</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-black/20 font-mono">P2</span>
          </button>

          {/* Tab 2: Config Topology */}
          <button
            type="button"
            onClick={() => setActiveTab('topology')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'topology'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : isLightMode
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>{isEn ? 'Config Topology' : 'توپولوژی کانفیگ'}</span>
            {topology ? (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                {topology.totalFiles} {isEn ? 'files' : 'فایل'}
              </span>
            ) : (
              <span className="text-[9px] px-1 py-0.2 rounded bg-black/20 font-mono">P3</span>
            )}
          </button>

          {/* Tab 3: Virtual Hosts (Phase 4) */}
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
            {vhostsSummary ? (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                {vhostsSummary.totalVHosts}
              </span>
            ) : (
              <span className="text-[9px] px-1 py-0.2 rounded bg-black/20 font-mono">P4</span>
            )}
          </button>

          {/* Tab 4: Reverse Proxy */}
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

          {/* Tab 5: Modules & MPM */}
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

          {/* Tab 6: SSL / TLS */}
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

          {/* Tab 7: Logs */}
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

          {/* Tab 8: Safe Config Editor */}
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
                  <button
                    type="button"
                    onClick={() => setActiveTab('topology')}
                    className="text-xs text-amber-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <span>{isEn ? 'Explore Include Tree →' : 'کاوش درخت کانفیگ‌ها ←'}</span>
                  </button>
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
            </div>
          )}

          {/* TAB 2: CONFIGURATION TOPOLOGY & INCLUDE TREE (PHASE 3) */}
          {activeTab === 'topology' && (
            <div className="space-y-6">
              {/* Header and Quick Stats */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                    <FolderTree className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">
                      {isEn
                        ? 'Apache Configuration Tree & Include Topology'
                        : 'ساختار درختی و نگاشت پیوندهای کانفیگ آپاچی'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {isEn
                        ? `ServerRoot: ${topology?.serverRoot || discovery?.serverRoot || '/etc/apache2'} • Main: ${topology?.mainConfigPath || discovery?.confPath || 'apache2.conf'}`
                        : `مسیر ریشه سرور: ${topology?.serverRoot || discovery?.serverRoot || '/etc/apache2'} • فایل اصلی: ${topology?.mainConfigPath || discovery?.confPath || 'apache2.conf'}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                    <input
                      type="text"
                      placeholder={isEn ? 'Filter config files...' : 'فیلتر فایل‌های کانفیگ...'}
                      value={topologySearch}
                      onChange={(e) => setTopologySearch(e.target.value)}
                      className={`text-xs pl-8 pr-3 py-1 rounded-lg border font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-200 text-slate-800'
                          : 'bg-slate-900 border-slate-700 text-slate-200'
                      }`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={fetchTopologyData}
                    disabled={loadingTopology}
                    className="px-3 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold cursor-pointer transition flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingTopology ? 'animate-spin' : ''}`} />
                    <span>{isEn ? 'Rescan Tree' : 'اسکن مجدد'}</span>
                  </button>
                </div>
              </div>

              {/* Topology Loading Spinner */}
              {loadingTopology && !topology && (
                <div className="py-12 flex flex-col items-center justify-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
                  <p className="text-xs font-mono text-slate-400">
                    {isEn
                      ? 'Traversing Include & IncludeOptional directives across ServerRoot...'
                      : 'در حال پیمایش بازگشتی دستورات Include و IncludeOptional در ServerRoot...'}
                  </p>
                </div>
              )}

              {/* Topology Summary Directives Metrics */}
              {topology && (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
                  <div
                    className={`p-3 rounded-xl border ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[10px] text-slate-400 uppercase font-bold">
                      {isEn ? 'Files' : 'فایل‌ها'}
                    </span>
                    <div className="text-base font-bold text-amber-400 font-mono mt-0.5">
                      {topology.totalFiles}
                    </div>
                  </div>

                  <div
                    className={`p-3 rounded-xl border ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[10px] text-slate-400 uppercase font-bold">
                      {isEn ? 'Total Lines' : 'مجموع خطوط'}
                    </span>
                    <div className="text-base font-bold text-cyan-400 font-mono mt-0.5">
                      {topology.totalLines.toLocaleString()}
                    </div>
                  </div>

                  <div
                    className={`p-3 rounded-xl border ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[10px] text-slate-400 uppercase font-bold">
                      {isEn ? 'VirtualHosts' : 'هاست‌های مجازی'}
                    </span>
                    <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                      {topology.detectedContexts.totalVirtualHosts}
                    </div>
                  </div>

                  <div
                    className={`p-3 rounded-xl border ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[10px] text-slate-400 uppercase font-bold">
                      {isEn ? 'Directories' : 'دایرکتوری‌ها'}
                    </span>
                    <div className="text-base font-bold text-slate-200 font-mono mt-0.5">
                      {topology.detectedContexts.totalDirectories}
                    </div>
                  </div>

                  <div
                    className={`p-3 rounded-xl border ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[10px] text-slate-400 uppercase font-bold">
                      {isEn ? 'Proxy Directives' : 'دستورات پروکسی'}
                    </span>
                    <div className="text-base font-bold text-cyan-300 font-mono mt-0.5">
                      {topology.detectedContexts.totalProxyDirectives}
                    </div>
                  </div>

                  <div
                    className={`p-3 rounded-xl border ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[10px] text-slate-400 uppercase font-bold">
                      {isEn ? 'SSL Files' : 'فایل‌های SSL'}
                    </span>
                    <div className="text-base font-bold text-emerald-300 font-mono mt-0.5">
                      {topology.detectedContexts.totalSslBlocks}
                    </div>
                  </div>

                  <div
                    className={`p-3 rounded-xl border ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-[10px] text-slate-400 uppercase font-bold">
                      {isEn ? 'Listen Ports' : 'پورت‌های Listen'}
                    </span>
                    <div className="text-base font-bold text-amber-300 font-mono mt-0.5 truncate">
                      {topology.detectedContexts.listenPorts.length > 0
                        ? topology.detectedContexts.listenPorts.join(', ')
                        : '80, 443'}
                    </div>
                  </div>
                </div>
              )}

              {/* Two-Panel Explorer (Tree List & File Inspector) */}
              {topology && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Left Column: Include Hierarchy Tree List */}
                  <div
                    className={`lg:col-span-5 p-3 rounded-xl border flex flex-col max-h-[580px] overflow-hidden ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between px-2 pb-2.5 border-b mb-2">
                      <span className="text-xs font-bold text-slate-400">
                        {isEn ? 'Include Hierarchy Tree' : 'سلسله‌مراتب فایل‌های Include'}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {filteredTopologyFiles.length} / {topology.totalFiles}
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1 pr-1 font-mono text-xs">
                      {filteredTopologyFiles.map((file, idx) => {
                        const isSelected = selectedFile?.filePath === file.filePath;
                        const indentPx = Math.min(file.level * 16, 64);
                        const fileName = file.filePath.split('/').pop() || file.filePath;
                        const dirName = file.filePath.substring(0, file.filePath.lastIndexOf('/'));

                        return (
                          <div
                            key={idx}
                            onClick={() => setSelectedFile(file)}
                            style={{
                              paddingLeft: isEn ? `${indentPx}px` : undefined,
                              paddingRight: !isEn ? `${indentPx}px` : undefined,
                            }}
                            className={`p-2 rounded-lg border transition cursor-pointer flex items-center justify-between gap-2 ${
                              isSelected
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                                : isLightMode
                                ? 'border-slate-200/60 hover:bg-slate-100 text-slate-700'
                                : 'border-slate-800/60 hover:bg-slate-800/40 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {file.level > 0 ? (
                                <CornerDownRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              ) : (
                                <FolderTree className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="font-bold text-xs truncate">{fileName}</div>
                                <div className="text-[10px] text-slate-500 truncate">{dirName}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                              {file.virtualHostsCount > 0 && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                  {file.virtualHostsCount} vhost
                                </span>
                              )}
                              {file.sslEnabled && (
                                <span className="px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                  SSL
                                </span>
                              )}
                              <span className="text-slate-500 font-mono">
                                {file.lineCount}L
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Column: File Inspector & Code Preview */}
                  <div
                    className={`lg:col-span-7 p-4 rounded-xl border flex flex-col max-h-[580px] overflow-hidden ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    {selectedFile ? (
                      <div className="flex flex-col h-full space-y-3">
                        {/* File Header Bar */}
                        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b shrink-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <FileCode className="w-4 h-4 text-amber-400 shrink-0" />
                              <span className="font-mono font-bold text-xs truncate">
                                {selectedFile.filePath}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 font-mono flex-wrap">
                              <span>Lines: <strong className="text-slate-200">{selectedFile.lineCount}</strong></span>
                              <span>•</span>
                              <span>Size: <strong className="text-slate-200">{(selectedFile.sizeBytes / 1024).toFixed(1)} KB</strong></span>
                              <span>•</span>
                              <span>Perms: <strong className="text-slate-200">{selectedFile.permissions || '0644'}</strong></span>
                              <span>•</span>
                              <span>Owner: <strong className="text-slate-200">{selectedFile.owner || 'root'}</strong></span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => copyToClipboard(selectedFile.filePath)}
                            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white cursor-pointer text-xs flex items-center gap-1 font-mono"
                          >
                            {copiedFilePath === selectedFile.filePath ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedFilePath === selectedFile.filePath ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی')}</span>
                          </button>
                        </div>

                        {/* Directives Metric Badges */}
                        <div className="flex items-center gap-2 flex-wrap text-xs font-mono shrink-0">
                          {selectedFile.virtualHostsCount > 0 && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              VirtualHosts: {selectedFile.virtualHostsCount}
                            </span>
                          )}
                          {selectedFile.directoriesCount > 0 && (
                            <span className="px-2 py-0.5 rounded bg-slate-500/15 text-slate-300 border border-slate-500/30">
                              Directories: {selectedFile.directoriesCount}
                            </span>
                          )}
                          {selectedFile.locationsCount > 0 && (
                            <span className="px-2 py-0.5 rounded bg-slate-500/15 text-slate-300 border border-slate-500/30">
                              Locations: {selectedFile.locationsCount}
                            </span>
                          )}
                          {selectedFile.proxyPassCount > 0 && (
                            <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                              ProxyPass: {selectedFile.proxyPassCount}
                            </span>
                          )}
                          {selectedFile.sslEnabled && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              SSL Enabled
                            </span>
                          )}
                          {selectedFile.hasCustomLog && (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                              CustomLog
                            </span>
                          )}
                          {selectedFile.hasErrorLog && (
                            <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
                              ErrorLog
                            </span>
                          )}
                        </div>

                        {/* Included From Parent info */}
                        {selectedFile.includedFrom && (
                          <div className="text-[11px] font-mono text-slate-400 bg-black/30 p-2 rounded border border-slate-800 truncate shrink-0">
                            <span className="text-amber-400 font-bold">{isEn ? 'Included from: ' : 'درج‌شده توسط: '}</span>
                            <span>{selectedFile.includedFrom}</span>
                          </div>
                        )}

                        {/* Code Content Snippet Preview */}
                        <div className="flex-1 overflow-hidden flex flex-col rounded-lg border border-slate-800 bg-black/60">
                          <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between text-[11px] font-mono text-slate-400 shrink-0">
                            <span>{isEn ? 'Configuration Source Code Preview' : 'پیش‌نمایش سورس فایل کانفیگ'}</span>
                            <span>{selectedFile.lineCount} {isEn ? 'lines' : 'سطر'}</span>
                          </div>
                          <pre className="flex-1 overflow-y-auto p-3 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">
                            {selectedFile.fullContent || selectedFile.contentSnippet || (isEn ? '# Empty file or not readable' : '# فایل خالی است یا خوانده نشد')}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs">
                        <FolderTree className="w-8 h-8 text-slate-600 mb-2" />
                        <p>{isEn ? 'Select a configuration file to inspect' : 'یک فایل کانفیگ را جهت بررسی انتخاب کنید'}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: VIRTUAL HOSTS (PHASE 4) */}
          {activeTab === 'vhosts' && (
            <div className="space-y-6">
              {/* Header and Controls */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">
                      {isEn ? 'Apache Virtual Hosts Management' : 'مدیریت هاست‌های مجازی آپاچی (<VirtualHost>)'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {isEn
                        ? `Total Discovered: ${vhostsSummary?.totalVHosts || 0} • Active: ${vhostsSummary?.activeVHosts || 0} • Disabled: ${vhostsSummary?.disabledVHosts || 0} • SSL: ${vhostsSummary?.sslVHosts || 0}`
                        : `مجموع هاست‌ها: ${vhostsSummary?.totalVHosts || 0} • فعال: ${vhostsSummary?.activeVHosts || 0} • غیرفعال: ${vhostsSummary?.disabledVHosts || 0} • دارای SSL: ${vhostsSummary?.sslVHosts || 0}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateVHostOpen(true)}
                    className="px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 text-xs cursor-pointer transition flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Create VirtualHost' : 'ایجاد VirtualHost جدید'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={fetchVHostsData}
                    disabled={loadingVHosts}
                    className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white cursor-pointer transition"
                    title={isEn ? 'Refresh VirtualHosts' : 'بازخوانی هاست‌ها'}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingVHosts ? 'animate-spin text-amber-400' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Filters Bar */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 flex-wrap text-xs ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['all', 'active', 'disabled', 'ssl', 'proxy', 'static'] as const).map((filterType) => (
                    <button
                      key={filterType}
                      type="button"
                      onClick={() => setVhostStatusFilter(filterType)}
                      className={`px-2.5 py-1 rounded-lg border text-xs capitalize transition cursor-pointer font-medium ${
                        vhostStatusFilter === filterType
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                          : isLightMode
                          ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                          : 'border-slate-800 text-slate-400 hover:bg-white/5'
                      }`}
                    >
                      {filterType === 'all'
                        ? isEn ? 'All' : 'همه'
                        : filterType === 'active'
                        ? isEn ? 'Active' : 'فعال'
                        : filterType === 'disabled'
                        ? isEn ? 'Disabled' : 'غیرفعال'
                        : filterType === 'ssl'
                        ? 'SSL / HTTPS'
                        : filterType === 'proxy'
                        ? isEn ? 'Reverse Proxy' : 'پروکسی معکوس'
                        : isEn ? 'Static Web' : 'وب استاتیک'}
                    </button>
                  ))}
                </div>

                <div className="relative min-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    placeholder={isEn ? 'Search domains, aliases, ports...' : 'جستجوی دامنه‌ها، پورت یا فایل...'}
                    value={vhostFilter}
                    onChange={(e) => setVhostFilter(e.target.value)}
                    className={`w-full text-xs pl-8 pr-3 py-1 rounded-lg border font-mono ${
                      isLightMode
                        ? 'bg-white border-slate-200 text-slate-800'
                        : 'bg-slate-900 border-slate-700 text-slate-200'
                    }`}
                  />
                </div>
              </div>

              {/* Loading State */}
              {loadingVHosts && !vhostsSummary && (
                <div className="py-12 flex flex-col items-center justify-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
                  <p className="text-xs font-mono text-slate-400">
                    {isEn
                      ? 'Discovering all <VirtualHost> blocks from Apache configuration files...'
                      : 'در حال استخراج بلوک‌های <VirtualHost> از فایل‌های کانفیگ آپاچی...'}
                  </p>
                </div>
              )}

              {/* VirtualHosts Cards Grid */}
              {vhostsSummary && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredVHosts.map((vh) => {
                    const isToggling = togglingVHostId === vh.id;
                    const isDeleting = deletingVHostId === vh.id;
                    const isProxy = vh.proxyPassTargets.length > 0;

                    return (
                      <div
                        key={vh.id}
                        className={`p-4 rounded-xl border flex flex-col justify-between transition ${
                          vh.isEnabled
                            ? isLightMode
                              ? 'bg-white border-slate-200 shadow-sm'
                              : 'bg-slate-900/70 border-slate-800'
                            : isLightMode
                            ? 'bg-slate-100/60 border-slate-200 opacity-75'
                            : 'bg-slate-950/60 border-slate-900 opacity-65'
                        }`}
                      >
                        {/* Top: Domain & Badges */}
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className="font-bold text-sm font-mono truncate text-amber-400">
                                  {vh.serverName}
                                </h4>
                                {vh.isSsl ? (
                                  <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                    <Lock className="w-2.5 h-2.5" />
                                    <span>:{vh.port} SSL</span>
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-500/20 text-slate-300 border border-slate-500/30">
                                    :{vh.port} HTTP
                                  </span>
                                )}
                              </div>

                              {/* Aliases */}
                              {vh.serverAliases.length > 0 && (
                                <div className="flex items-center gap-1 flex-wrap mt-1">
                                  {vh.serverAliases.map((a, idx) => (
                                    <span
                                      key={idx}
                                      className="text-[10px] font-mono px-1 py-0.2 rounded bg-black/30 text-slate-400 border border-slate-800"
                                    >
                                      {a}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Active / Disabled Toggle Switch */}
                            <button
                              type="button"
                              onClick={() => handleToggleVHost(vh)}
                              disabled={isToggling}
                              title={
                                vh.isEnabled
                                  ? isEn
                                    ? 'Click to Disable (a2dissite)'
                                    : 'غیرفعال‌سازی (a2dissite)'
                                  : isEn
                                  ? 'Click to Enable (a2ensite)'
                                  : 'فعال‌سازی (a2ensite)'
                              }
                              className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center gap-1 text-[11px] font-semibold shrink-0 ${
                                isToggling ? 'opacity-50 cursor-wait' : ''
                              } ${
                                vh.isEnabled
                                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
                                  : 'bg-rose-500/15 border-rose-500/30 text-rose-400 hover:bg-rose-500/25'
                              }`}
                            >
                              <Power className={`w-3.5 h-3.5 ${isToggling ? 'animate-spin' : ''}`} />
                              <span>{vh.isEnabled ? (isEn ? 'Active' : 'فعال') : (isEn ? 'Disabled' : 'غیرفعال')}</span>
                            </button>
                          </div>

                          {/* Destination info (DocumentRoot vs ProxyPass) */}
                          <div className="mt-3 text-xs font-mono space-y-1">
                            {isProxy ? (
                              <div className="p-2 rounded bg-black/40 border border-slate-800 text-[11px] truncate">
                                <span className="text-cyan-400 font-bold">ProxyPass → </span>
                                <span className="text-slate-300">{vh.proxyPassTargets[0]?.target}</span>
                              </div>
                            ) : vh.documentRoot ? (
                              <div className="p-2 rounded bg-black/40 border border-slate-800 text-[11px] truncate">
                                <span className="text-emerald-400 font-bold">DocRoot → </span>
                                <span className="text-slate-300">{vh.documentRoot}</span>
                              </div>
                            ) : null}

                            {/* File path line tag */}
                            <div className="text-[10px] text-slate-500 truncate pt-1">
                              <span>{vh.fileRelativePath}</span>
                              {vh.lineStart && <span>:{vh.lineStart}-{vh.lineEnd}</span>}
                            </div>
                          </div>
                        </div>

                        {/* Bottom Actions Bar */}
                        <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-slate-800/60 text-xs">
                          <button
                            type="button"
                            onClick={() => setInspectVHost(vh)}
                            className="text-amber-400 hover:underline flex items-center gap-1 cursor-pointer font-medium text-[11px]"
                          >
                            <Code2 className="w-3.5 h-3.5" />
                            <span>{isEn ? 'View Config' : 'مشاهده کانفیگ'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteVHost(vh)}
                            disabled={isDeleting}
                            className="p-1.5 rounded-lg border border-rose-500/20 text-rose-400 hover:bg-rose-500/15 cursor-pointer transition text-[11px] flex items-center gap-1"
                            title={isEn ? 'Delete VirtualHost' : 'حذف هاست مجازی'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{isEn ? 'Delete' : 'حذف'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Empty State */}
              {vhostsSummary && filteredVHosts.length === 0 && (
                <div
                  className={`p-8 rounded-xl border text-center flex flex-col items-center justify-center space-y-2 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <Layers className="w-8 h-8 text-slate-600 mb-1" />
                  <h4 className="font-bold text-sm">
                    {isEn ? 'No matching VirtualHosts found' : 'هیچ هاست مجازی مطابق با فیلتر یافت نشد'}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {isEn
                      ? 'Try adjusting your search criteria or create a new VirtualHost.'
                      : 'معیار فیلتر خود را تغییر دهید یا یک هاست مجازی جدید ایجاد نمایید.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: MODULES & MPM CONTROLLER */}
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
          {activeTab !== 'overview' &&
            activeTab !== 'topology' &&
            activeTab !== 'vhosts' &&
            activeTab !== 'modules' && (
              <div
                className={`p-8 rounded-xl border text-center flex flex-col items-center justify-center space-y-3 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  {activeTab === 'proxy' && <Globe className="w-7 h-7" />}
                  {activeTab === 'ssl' && <Lock className="w-7 h-7" />}
                  {activeTab === 'logs' && <FileText className="w-7 h-7" />}
                  {activeTab === 'config' && <FileCode className="w-7 h-7" />}
                </div>
                <h3 className="font-bold text-base">
                  {activeTab === 'proxy' && (isEn ? 'Reverse Proxy & Load Balancer (Phase 5)' : 'پروکسی معکوس و بالانسر (فاز ۵)')}
                  {activeTab === 'ssl' && (isEn ? 'SSL / TLS Certificate Engine (Phase 7)' : 'موتور سرتیفیکیت و SSL/TLS (فاز ۷)')}
                  {activeTab === 'logs' && (isEn ? 'Access & Error Logs Discovery (Phase 8)' : 'کشف و تحلیل لاگ‌های دسترسی و خطا (فاز ۸)')}
                  {activeTab === 'config' && (isEn ? 'Safe Configuration Editor with Rollback (Phase 10)' : 'ویرایشگر امن کانفیگ با رول‌بک خودکار (فاز ۱۰)')}
                </h3>
                <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                  {isEn
                    ? 'Phase 4 has delivered Virtual Hosts management. This module will be developed in its planned phase using authentic live data from the connected Linux server.'
                    : 'فاز ۴ مدیریت جامع هاست‌های مجازی آپاچی را مستقر ساخته است. این ماژول در فاز برنامه‌ریزی‌شده با استفاده از داده‌های واقعی سرور توسعه خواهد یافت.'}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('vhosts')}
                  className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold cursor-pointer transition"
                >
                  {isEn ? 'Return to Virtual Hosts' : 'بازگشت به هاست‌های مجازی'}
                </button>
              </div>
            )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 5. INSPECT RAW VIRTUALHOST MODAL (Portal)                */}
      {/* ======================================================== */}
      {inspectVHost &&
        createPortal(
          <div className="fixed inset-0 z-[999995] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div
              className={`w-full max-w-3xl max-h-[85vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl ${
                isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            >
              <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
                <div className="flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-amber-400" />
                  <span className="font-bold text-sm font-mono">
                    {inspectVHost.serverName} ({inspectVHost.siteName}.conf)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectVHost(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 flex-1 overflow-y-auto space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-400 text-[11px] pb-1 border-b border-slate-800">
                  <span>{inspectVHost.definedInFile}:{inspectVHost.lineStart}-{inspectVHost.lineEnd}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(inspectVHost.rawBlockSnippet)}
                    className="flex items-center gap-1 text-amber-400 hover:underline cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Copy Snippet' : 'کپی کد'}</span>
                  </button>
                </div>
                <pre className="p-3 rounded-lg bg-black/60 text-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
                  {inspectVHost.rawBlockSnippet}
                </pre>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ======================================================== */}
      {/* 6. CREATE VIRTUALHOST WIZARD MODAL (Portal)              */}
      {/* ======================================================== */}
      {isCreateVHostOpen &&
        createPortal(
          <div className="fixed inset-0 z-[999995] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div
              className={`w-full max-w-2xl max-h-[90vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl ${
                isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            >
              <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-sm">
                    {isEn ? 'Create New Apache VirtualHost' : 'ایجاد VirtualHost جدید آپاچی'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateVHostOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateVHostSubmit} className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
                {/* Site Type Radio */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-400 flex items-center justify-between">
                    <span>{isEn ? 'VirtualHost Purpose' : 'نوع هاست مجازی'}</span>
                    <FieldInfoTooltip
                      fieldName="Apache Site Type"
                      infoWhatEn="Select whether this VirtualHost serves local static/PHP web files or acts as a reverse proxy for a backend app."
                      infoWhatFa="انتخاب کنید که آیا این VirtualHost فایل‌های محلی وب را سرو می‌کند یا به عنوان پروکسی معکوس برای یک برنامه بک‌اند عمل می‌کند."
                      infoWhyEn="Configures either DocumentRoot directives or ProxyPass / ProxyPassReverse directives."
                      infoWhyFa="دایرکتیوهای DocumentRoot یا ProxyPass متناسب با نیاز سرور را ایجاد می‌نماید."
                      infoExampleEn="Static Web or Reverse Proxy"
                      infoExampleFa="وب استاتیک یا پروکسی معکوس"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCreateForm({ ...createForm, siteType: 'static', port: 80 })}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition flex items-start gap-2.5 ${
                        createForm.siteType === 'static'
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-bold'
                          : 'border-slate-800 bg-slate-900/40 text-slate-400'
                      }`}
                    >
                      <Globe className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <div>{isEn ? 'Standard Web Site' : 'وب‌سایت استاندارد'}</div>
                        <div className="text-[10px] opacity-75 font-normal">
                          {isEn ? 'DocumentRoot, HTML, PHP files' : 'فایل‌های محلی HTML، اسکریپت‌ها و DocumentRoot'}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCreateForm({ ...createForm, siteType: 'proxy', port: 80 })}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition flex items-start gap-2.5 ${
                        createForm.siteType === 'proxy'
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-bold'
                          : 'border-slate-800 bg-slate-900/40 text-slate-400'
                      }`}
                    >
                      <ArrowUpRight className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                      <div>
                        <div>{isEn ? 'Reverse Proxy' : 'پروکسی معکوس'}</div>
                        <div className="text-[10px] opacity-75 font-normal">
                          {isEn ? 'Node.js, Python, Go, Docker backend' : 'اتصال به بک‌اند Node.js، پایتون یا داکر'}
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Identification: Site Name & ServerName */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-400 block mb-1">
                      {isEn ? 'Config Filename (Site Name)' : 'نام فایل کانفیگ (Site Name)'} *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. my-app"
                      value={createForm.siteName}
                      onChange={(e) => setCreateForm({ ...createForm, siteName: e.target.value })}
                      className={`w-full p-2 rounded-lg border font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    />
                    <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                      → {createForm.siteName || 'name'}.conf
                    </span>
                  </div>

                  <div>
                    <label className="font-bold text-slate-400 block mb-1">
                      {isEn ? 'Primary Domain (ServerName)' : 'دامنه اصلی (ServerName)'} *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. app.example.com"
                      value={createForm.serverName}
                      onChange={(e) => setCreateForm({ ...createForm, serverName: e.target.value })}
                      className={`w-full p-2 rounded-lg border font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    />
                  </div>
                </div>

                {/* ServerAlias & Port */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="font-bold text-slate-400 block mb-1">
                      {isEn ? 'Domain Aliases (ServerAlias)' : 'دامنه‌های مستعار (ServerAlias)'}
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. www.example.com api.example.com"
                      value={createForm.serverAliases}
                      onChange={(e) => setCreateForm({ ...createForm, serverAliases: e.target.value })}
                      className={`w-full p-2 rounded-lg border font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-400 block mb-1">
                      {isEn ? 'Port' : 'پورت'}
                    </label>
                    <input
                      type="number"
                      value={createForm.port || 80}
                      onChange={(e) => setCreateForm({ ...createForm, port: parseInt(e.target.value, 10) || 80 })}
                      className={`w-full p-2 rounded-lg border font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    />
                  </div>
                </div>

                {/* Target: DocumentRoot or Proxy Target */}
                {createForm.siteType === 'static' ? (
                  <div>
                    <label className="font-bold text-slate-400 block mb-1">
                      {isEn ? 'DocumentRoot (Web Root Directory)' : 'مسیر ریشه اسناد وب (DocumentRoot)'} *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="/var/www/my-app"
                      value={createForm.documentRoot}
                      onChange={(e) => setCreateForm({ ...createForm, documentRoot: e.target.value })}
                      className={`w-full p-2 rounded-lg border font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="font-bold text-slate-400 block mb-1">
                      {isEn ? 'Backend Proxy Target URL' : 'آدرس و پورت بک‌اند پروکسی'} *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="http://127.0.0.1:3000"
                      value={createForm.proxyTarget}
                      onChange={(e) => setCreateForm({ ...createForm, proxyTarget: e.target.value })}
                      className={`w-full p-2 rounded-lg border font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    />
                  </div>
                )}

                {/* Admin Email & Auto Enable */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="font-bold text-slate-400 block mb-1">
                      {isEn ? 'ServerAdmin Email' : 'ایمیل مدیر سرور (ServerAdmin)'}
                    </label>
                    <input
                      type="email"
                      placeholder="webmaster@localhost"
                      value={createForm.serverAdmin}
                      onChange={(e) => setCreateForm({ ...createForm, serverAdmin: e.target.value })}
                      className={`w-full p-2 rounded-lg border font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-4">
                    <input
                      type="checkbox"
                      id="autoEnableVHost"
                      checked={createForm.autoEnable}
                      onChange={(e) => setCreateForm({ ...createForm, autoEnable: e.target.checked })}
                      className="rounded text-amber-500 cursor-pointer"
                    />
                    <label htmlFor="autoEnableVHost" className="cursor-pointer font-medium text-slate-300">
                      {isEn ? 'Automatically enable site (a2ensite)' : 'فعال‌سازی خودکار سایت پس از ایجاد (a2ensite)'}
                    </label>
                  </div>
                </div>

                <div className="pt-4 border-t flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateVHostOpen(false)}
                    className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>
                  <button
                    type="submit"
                    disabled={creatingVHost}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer transition flex items-center gap-1.5"
                  >
                    {creatingVHost ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>{creatingVHost ? (isEn ? 'Deploying...' : 'در حال استقرار...') : (isEn ? 'Create & Deploy' : 'ایجاد و استقرار')}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>,
    document.body
  );
};
