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
  GitFork,
  Share2,
  ToggleLeft,
  ToggleRight,
  Wrench,
  Shield,
  CheckSquare,
  Sliders,
  AlertTriangle,
  Key,
  FileCheck,
  ShieldAlert,
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
  ApacheProxyRoute,
  ApacheBalancerMember,
  ApacheBalancerPool,
  ApacheProxyModuleRequirement,
  ApacheProxySummary,
  CreateApacheProxyRouteParams,
  ApacheModuleItem,
  ApacheMpmDetails,
  ApacheModulesSummary,
  ApacheSslSummary,
  ApacheCertificateDetails,
  ApacheCertificateAssociatedVHost,
  GenerateApacheSelfSignedCertParams,
  AttachApacheSslCertParams,
} from '../../types';
import {
  discoverApacheTopology,
  fetchApacheConfigTopology,
  fetchApacheVirtualHosts,
  toggleApacheVirtualHostStatus,
  createApacheVirtualHost,
  deleteApacheVirtualHost,
  fetchApacheProxyArchitecture,
  enableApacheProxyModules,
  createApacheProxyRoute,
  deleteApacheProxyRoute,
  fetchApacheModulesArchitecture,
  toggleApacheModule,
  switchApacheMpm,
  fetchApacheCertificates,
  generateApacheSelfSignedCert,
  attachApacheSslCert,
  enableApacheModernSslProfile,
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

  // Reverse Proxy & Load Balancer State (Phase 5)
  const [proxySummary, setProxySummary] = useState<ApacheProxySummary | null>(null);
  const [loadingProxy, setLoadingProxy] = useState<boolean>(false);
  const [proxyViewMode, setProxyViewMode] = useState<'routes' | 'balancers' | 'modules'>('routes');
  const [proxySearch, setProxySearch] = useState<string>('');
  const [proxyFilter, setProxyFilter] = useState<'all' | 'http' | 'ws' | 'balancer' | 'ssl'>('all');
  const [inspectProxyRoute, setInspectProxyRoute] = useState<ApacheProxyRoute | null>(null);
  const [inspectBalancer, setInspectBalancer] = useState<ApacheBalancerPool | null>(null);
  const [isCreateProxyOpen, setIsCreateProxyOpen] = useState<boolean>(false);
  const [createProxyForm, setCreateProxyForm] = useState<CreateApacheProxyRouteParams>({
    path: '/',
    backendUrl: 'http://127.0.0.1:3000',
    preserveHost: true,
    websocketSupport: false,
    timeout: 60,
    connectTimeout: 10,
    sslBackend: false,
    sslVerify: true,
    isBalancer: false,
    balancerName: 'app_cluster',
    balancerAlgorithm: 'byrequests',
    balancerMembers: [
      { url: 'http://127.0.0.1:8081', loadfactor: 1 },
      { url: 'http://127.0.0.1:8082', loadfactor: 1 },
    ],
    autoEnableModules: true,
    customHeaders: [],
  });
  const [creatingProxy, setCreatingProxy] = useState<boolean>(false);
  const [deletingProxyId, setDeletingProxyId] = useState<string | null>(null);
  const [enablingModules, setEnablingModules] = useState<boolean>(false);

  // Modules & MPM State (Phase 6)
  const [modulesSummary, setModulesSummary] = useState<ApacheModulesSummary | null>(null);
  const [loadingModules, setLoadingModules] = useState<boolean>(false);
  const [moduleSearchQuery, setModuleSearchQuery] = useState<string>('');
  const [moduleCategoryFilter, setModuleCategoryFilter] = useState<string>('all');
  const [moduleStatusFilter, setModuleStatusFilter] = useState<
    'all' | 'loaded' | 'enabled' | 'available' | 'disabled' | 'required'
  >('all');
  const [togglingModuleName, setTogglingModuleName] = useState<string | null>(null);
  const [inspectModule, setInspectModule] = useState<ApacheModuleItem | null>(null);
  const [isSwitchMpmOpen, setIsSwitchMpmOpen] = useState<boolean>(false);
  const [targetMpm, setTargetMpm] = useState<string>('event');
  const [switchingMpm, setSwitchingMpm] = useState<boolean>(false);

  // SSL / TLS Certificate Engine State (Phase 7)
  const [sslData, setSslData] = useState<ApacheSslSummary | null>(null);
  const [loadingSsl, setLoadingSsl] = useState<boolean>(false);
  const [sslFilter, setSslFilter] = useState<'all' | 'valid' | 'expiring_soon' | 'expired' | 'self_signed' | 'error'>('all');
  const [sslSearchQuery, setSslSearchQuery] = useState<string>('');
  const [selectedCert, setSelectedCert] = useState<ApacheCertificateDetails | null>(null);
  const [copiedCertText, setCopiedCertText] = useState<string | null>(null);

  // Self-Signed Cert Generator Modal
  const [isGenerateSelfSignedOpen, setIsGenerateSelfSignedOpen] = useState<boolean>(false);
  const [generateDomain, setGenerateDomain] = useState<string>('');
  const [generateDays, setGenerateDays] = useState<number>(365);
  const [generateOrg, setGenerateOrg] = useState<string>('NetTopology Managed');
  const [generateCountry, setGenerateCountry] = useState<string>('US');
  const [generateVHostId, setGenerateVHostId] = useState<string>('');
  const [generatingCert, setGeneratingCert] = useState<boolean>(false);

  // Attach SSL Cert Modal
  const [isAttachCertOpen, setIsAttachCertOpen] = useState<boolean>(false);
  const [attachVHostId, setAttachVHostId] = useState<string>('');
  const [attachCertPath, setAttachCertPath] = useState<string>('');
  const [attachKeyPath, setAttachKeyPath] = useState<string>('');
  const [attachChainPath, setAttachChainPath] = useState<string>('');
  const [attachEnableH2, setAttachEnableH2] = useState<boolean>(true);
  const [attachEnableHsts, setAttachEnableHsts] = useState<boolean>(false);
  const [attachingCert, setAttachingCert] = useState<boolean>(false);

  const [applyingProfileVHostId, setApplyingProfileVHostId] = useState<string | null>(null);
  const [enablingModSsl, setEnablingModSsl] = useState<boolean>(false);

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

  // Fetch complete Apache reverse proxy architecture (Phase 5)
  const fetchProxyData = useCallback(async () => {
    if (!server) return;
    setLoadingProxy(true);
    setActionFeedback(null);
    try {
      const res = await fetchApacheProxyArchitecture(server.id, server.ssh_password);
      if (res && res.success && res.summary) {
        setProxySummary(res.summary);
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn
            ? 'Failed to discover Apache Reverse Proxy architecture'
            : 'خطا در استخراج ساختار پروکسی معکوس آپاچی',
          details: res?.error,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn
          ? 'Reverse proxy scanner connection error'
          : 'خطای ارتباط در اسکنر پروکسی معکوس',
        details: err?.message,
      });
    } finally {
      setLoadingProxy(false);
    }
  }, [server, isEn]);

  // Handle enabling required proxy modules
  const handleEnableProxyModules = async (modulesToEnable: string[]) => {
    if (!server || enablingModules) return;
    setEnablingModules(true);
    setActionFeedback(null);
    try {
      const res = await enableApacheProxyModules(server.id, modulesToEnable, server.ssh_password);
      if (res && res.success) {
        setActionFeedback({
          type: 'success',
          message: res.message || (isEn ? 'Proxy modules enabled successfully' : 'ماژول‌های پروکسی با موفقیت فعال شدند'),
        });
        await fetchProxyData();
        await fetchDiscovery();
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn ? 'Failed to enable proxy modules' : 'خطا در فعال‌سازی ماژول‌های پروکسی',
          details: res?.error,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn ? 'Error enabling proxy modules' : 'خطا در فعال‌سازی ماژول‌های پروکسی',
        details: err?.message,
      });
    } finally {
      setEnablingModules(false);
    }
  };

  // Handle creating reverse proxy route / balancer
  const handleCreateProxySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!server || creatingProxy) return;
    setCreatingProxy(true);
    setActionFeedback(null);
    try {
      const res = await createApacheProxyRoute(server.id, createProxyForm, server.ssh_password);
      if (res && res.success) {
        setActionFeedback({
          type: 'success',
          message: res.message || (isEn ? 'Reverse proxy route deployed successfully' : 'مسیر پروکسی معکوس با موفقیت مستقر شد'),
        });
        setIsCreateProxyOpen(false);
        await fetchProxyData();
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn ? 'Failed to deploy proxy route' : 'خطا در استقرار مسیر پروکسی',
          details: res?.error,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn ? 'Proxy route deployment error' : 'خطا در استقرار مسیر پروکسی معکوس',
        details: err?.message,
      });
    } finally {
      setCreatingProxy(false);
    }
  };

  // Handle deleting reverse proxy route
  const handleDeleteProxyRoute = async (route: ApacheProxyRoute) => {
    if (!server || deletingProxyId) return;
    const confirmMsg = isEn
      ? `Are you sure you want to remove reverse proxy route for '${route.path}'?`
      : `آیا از حذف مسیر پروکسی معکوس '${route.path}' اطمینان دارید؟`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingProxyId(route.id);
    setActionFeedback(null);
    try {
      const res = await deleteApacheProxyRoute(server.id, route.id, route.definedInFile, server.ssh_password);
      if (res && res.success) {
        setActionFeedback({
          type: 'success',
          message: res.message || (isEn ? 'Proxy route removed successfully' : 'مسیر پروکسی با موفقیت حذف شد'),
        });
        await fetchProxyData();
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn ? 'Failed to delete proxy route' : 'خطا در حذف مسیر پروکسی',
          details: res?.error,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn ? 'Error deleting proxy route' : 'خطا در حذف مسیر پروکسی',
        details: err?.message,
      });
    } finally {
      setDeletingProxyId(null);
    }
  };

  // Fetch full Apache Modules & MPM Architecture (Phase 6)
  const fetchModulesData = useCallback(async () => {
    if (!server) return;
    setLoadingModules(true);
    setActionFeedback(null);
    try {
      const res = await fetchApacheModulesArchitecture(server.id, server.ssh_password);
      if (res && res.success && res.summary) {
        setModulesSummary(res.summary);
        if (res.summary.activeMpm?.activeMpm) {
          setTargetMpm(res.summary.activeMpm.activeMpm);
        }
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn
            ? 'Failed to discover Apache modules & MPM'
            : 'خطا در کشف ماژول‌ها و ساختار MPM آپاچی',
          details: res?.error,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn ? 'Modules scanner connection error' : 'خطای ارتباط در اسکنر ماژول‌ها',
        details: err?.message,
      });
    } finally {
      setLoadingModules(false);
    }
  }, [server, isEn]);

  // Handle module toggle (enable / disable)
  const handleToggleModuleAction = async (moduleItem: ApacheModuleItem, action: 'enable' | 'disable') => {
    if (!server || togglingModuleName) return;
    const cleanName = moduleItem.rawName;
    const confirmMsg = isEn
      ? `Are you sure you want to ${action} module 'mod_${cleanName}'?`
      : `آیا از ${action === 'enable' ? 'فعال‌سازی' : 'غیرفعال‌سازی'} ماژول 'mod_${cleanName}' اطمینان دارید؟`;
    if (!window.confirm(confirmMsg)) return;

    setTogglingModuleName(moduleItem.name);
    setActionFeedback(null);
    try {
      const res = await toggleApacheModule(server.id, cleanName, action, server.ssh_password);
      if (res && res.success) {
        setActionFeedback({
          type: 'success',
          message: res.message || (isEn ? `Module mod_${cleanName} ${action}d successfully` : `ماژول mod_${cleanName} با موفقیت ${action === 'enable' ? 'فعال' : 'غیرفعال'} شد`),
        });
        await fetchModulesData();
        await fetchDiscovery();
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn ? `Failed to ${action} module mod_${cleanName}` : `خطا در ${action === 'enable' ? 'فعال‌سازی' : 'غیرفعال‌سازی'} ماژول mod_${cleanName}`,
          details: res?.error,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn ? 'Module operation failed' : 'عملیات تغییر وضعیت ماژول با خطا مواجه شد',
        details: err?.message,
      });
    } finally {
      setTogglingModuleName(null);
    }
  };

  // Handle switching Apache MPM
  const handleSwitchMpmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!server || switchingMpm || !targetMpm) return;
    setSwitchingMpm(true);
    setActionFeedback(null);
    try {
      const res = await switchApacheMpm(server.id, targetMpm, server.ssh_password);
      if (res && res.success) {
        setActionFeedback({
          type: 'success',
          message: res.message || (isEn ? `Switched active MPM to '${targetMpm}' successfully` : `مدل MPM با موفقیت به '${targetMpm}' تغییر یافت`),
        });
        setIsSwitchMpmOpen(false);
        await fetchModulesData();
        await fetchDiscovery();
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn ? `Failed to switch MPM to '${targetMpm}'` : `خطا در تغییر MPM به '${targetMpm}'`,
          details: res?.error,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn ? 'MPM switch operation failed' : 'عملیات تغییر MPM با خطا مواجه شد',
        details: err?.message,
      });
    } finally {
      setSwitchingMpm(false);
    }
  };

  const fetchSslData = useCallback(async () => {
    if (!server) return;
    setLoadingSsl(true);
    try {
      const res = await fetchApacheCertificates(server.id, server.ssh_password);
      if (res && res.success && res.sslData) {
        setSslData(res.sslData);
        if (res.sslData.certificates && res.sslData.certificates.length > 0) {
          setSelectedCert((prev) => {
            if (prev && res.sslData?.certificates.some((c) => c.id === prev.id)) {
              return res.sslData?.certificates.find((c) => c.id === prev.id) || res.sslData?.certificates[0];
            }
            return res.sslData?.certificates[0];
          });
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch Apache certificates:', err);
    } finally {
      setLoadingSsl(false);
    }
  }, [server]);

  const handleCopyCertText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCertText(id);
    setTimeout(() => setCopiedCertText(null), 2000);
  };

  const handleGenerateSelfSignedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!server || generatingCert || !generateDomain.trim()) return;
    setGeneratingCert(true);
    setActionFeedback(null);
    try {
      const res = await generateApacheSelfSignedCert(
        server.id,
        {
          domain: generateDomain.trim(),
          days: Number(generateDays) || 365,
          country: generateCountry.trim() || 'US',
          organization: generateOrg.trim() || 'Self-Signed',
          vhostId: generateVHostId || undefined,
        },
        server.ssh_password
      );
      if (res && res.success) {
        setActionFeedback({
          type: 'success',
          message: res.message || (isEn ? 'Self-signed certificate generated successfully' : 'گواهینامه خودامضا با موفقیت ساخته شد'),
        });
        setIsGenerateSelfSignedOpen(false);
        setGenerateDomain('');
        await fetchSslData();
        await fetchVHostsData();
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn ? 'Failed to generate self-signed certificate' : 'خطا در ایجاد گواهینامه خودامضا',
          details: res?.error,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn ? 'Failed to generate certificate' : 'خطا در صدور گواهینامه',
        details: err?.message,
      });
    } finally {
      setGeneratingCert(false);
    }
  };

  const handleAttachSslSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!server || attachingCert || !attachVHostId || !attachCertPath.trim() || !attachKeyPath.trim()) return;
    setAttachingCert(true);
    setActionFeedback(null);
    try {
      const res = await attachApacheSslCert(
        server.id,
        {
          vhostId: attachVHostId,
          certPath: attachCertPath.trim(),
          keyPath: attachKeyPath.trim(),
          chainPath: attachChainPath.trim() || undefined,
          enableHttp2: attachEnableH2,
          enableHsts: attachEnableHsts,
        },
        server.ssh_password
      );
      if (res && res.success) {
        setActionFeedback({
          type: 'success',
          message: res.message || (isEn ? 'SSL certificate attached to VirtualHost successfully' : 'گواهینامه SSL با موفقیت به هاست مجازی متصل شد'),
        });
        setIsAttachCertOpen(false);
        await fetchSslData();
        await fetchVHostsData();
        await fetchDiscovery();
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn ? 'Failed to attach SSL certificate' : 'خطا در اتصال گواهینامه SSL',
          details: res?.error,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn ? 'Failed to attach SSL certificate' : 'خطا در اتصال گواهینامه SSL',
        details: err?.message,
      });
    } finally {
      setAttachingCert(false);
    }
  };

  const handleApplyModernProfile = async (vhostId: string) => {
    if (!server || applyingProfileVHostId) return;
    setApplyingProfileVHostId(vhostId);
    setActionFeedback(null);
    try {
      const res = await enableApacheModernSslProfile(server.id, vhostId, server.ssh_password);
      if (res && res.success) {
        setActionFeedback({
          type: 'success',
          message: res.message || (isEn ? 'Modern SSL profile applied successfully' : 'پروفایل امنیتی مدرن SSL با موفقیت اعمال شد'),
        });
        await fetchSslData();
        await fetchVHostsData();
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn ? 'Failed to apply modern SSL profile' : 'خطا در اعمال پروفایل امنیتی مدرن SSL',
          details: res?.error,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn ? 'Failed to apply modern SSL profile' : 'خطا در اعمال پروفایل امنیتی مدرن',
        details: err?.message,
      });
    } finally {
      setApplyingProfileVHostId(null);
    }
  };

  const handleEnableModSsl = async () => {
    if (!server || enablingModSsl) return;
    setEnablingModSsl(true);
    setActionFeedback(null);
    try {
      const res = await toggleApacheModule(server.id, 'ssl', 'enable', server.ssh_password);
      if (res && res.success) {
        setActionFeedback({
          type: 'success',
          message: res.message || (isEn ? 'mod_ssl enabled successfully' : 'ماژول mod_ssl با موفقیت فعال شد'),
        });
        await fetchSslData();
        await fetchModulesData();
        await fetchDiscovery();
      } else {
        setActionFeedback({
          type: 'error',
          message: isEn ? 'Failed to enable mod_ssl' : 'خطا در فعال‌سازی mod_ssl',
          details: res?.error,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: isEn ? 'Failed to enable mod_ssl' : 'خطا در فعال‌سازی mod_ssl',
        details: err?.message,
      });
    } finally {
      setEnablingModSsl(false);
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
    if (activeTab === 'proxy' && !proxySummary && !loadingProxy && server) {
      fetchProxyData();
    }
    if (activeTab === 'modules' && !modulesSummary && !loadingModules && server) {
      fetchModulesData();
    }
    if (activeTab === 'ssl' && !sslData && !loadingSsl && server) {
      fetchSslData();
    }
  }, [activeTab, topology, loadingTopology, vhostsSummary, loadingVHosts, proxySummary, loadingProxy, modulesSummary, loadingModules, sslData, loadingSsl, server, fetchTopologyData, fetchVHostsData, fetchProxyData, fetchModulesData, fetchSslData]);

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
            {proxySummary ? (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono font-bold">
                {proxySummary.totalRoutes}
              </span>
            ) : (
              <span className="text-[9px] px-1 py-0.2 rounded bg-black/20 font-mono">P5</span>
            )}
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

          {/* ======================================================== */}
          {/* TAB 4: REVERSE PROXY & LOAD BALANCER (PHASE 5)           */}
          {/* ======================================================== */}
          {activeTab === 'proxy' && (
            <div className="space-y-4">
              {/* Header Controls */}
              <div
                className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm flex items-center gap-2">
                      <span>{isEn ? 'Apache Reverse Proxy & Load Balancer' : 'پروکسی معکوس و توزیع بار آپاچی'}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold">
                        Phase 5
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      {isEn
                        ? 'Discovered from live Apache config, ProxyPass directives, balancer clusters & mod_proxy tables'
                        : 'استخراج‌شده از کانفیگ زنده، دایرکتیوهای ProxyPass، کلاسترهای بالانسر و جداول mod_proxy'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* View Mode Switcher */}
                  <div
                    className={`p-1 rounded-lg border flex items-center gap-1 ${
                      isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-950/80 border-slate-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setProxyViewMode('routes')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition flex items-center gap-1.5 ${
                        proxyViewMode === 'routes'
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <GitFork className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Routes' : 'مسیرها'}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/20 font-mono">
                        {proxySummary?.totalRoutes || 0}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setProxyViewMode('balancers')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition flex items-center gap-1.5 ${
                        proxyViewMode === 'balancers'
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Network className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Load Balancers' : 'بالانسرها'}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/20 font-mono">
                        {proxySummary?.totalBalancers || 0}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setProxyViewMode('modules')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition flex items-center gap-1.5 ${
                        proxyViewMode === 'modules'
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Boxes className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Modules' : 'ماژول‌ها'}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                          proxySummary?.allRequiredModulesLoaded
                            ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                            : 'bg-amber-500/20 text-amber-400 font-bold'
                        }`}
                      >
                        {proxySummary?.moduleStatus?.filter((m) => m.isLoaded).length || 0}/10
                      </span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsCreateProxyOpen(true)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer transition flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isEn ? 'New Proxy Route' : 'مسیر پروکسی جدید'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={fetchProxyData}
                    disabled={loadingProxy}
                    className={`p-2 rounded-lg border text-slate-400 hover:text-white cursor-pointer transition ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'
                    }`}
                    title={isEn ? 'Refresh Proxy Data' : 'به‌روزرسانی داده‌های پروکسی'}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingProxy ? 'animate-spin text-amber-400' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Metric Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <div
                  className={`p-3 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    {isEn ? 'Proxy Routes' : 'مسیرهای پروکسی'}
                  </span>
                  <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                    {proxySummary?.totalRoutes ?? 0}
                  </div>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    {isEn ? 'Load Balancers' : 'کلاسترهای بالانسر'}
                  </span>
                  <div className="text-xl font-bold font-mono text-cyan-400 mt-1 flex items-baseline gap-1.5">
                    <span>{proxySummary?.totalBalancers ?? 0}</span>
                    <span className="text-xs text-slate-400 font-normal">
                      ({proxySummary?.totalBalancerMembers ?? 0} {isEn ? 'nodes' : 'گره'})
                    </span>
                  </div>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    {isEn ? 'WebSocket Routes' : 'مسیرهای وب‌سوکت'}
                  </span>
                  <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                    {proxySummary?.websocketRoutesCount ?? 0}
                  </div>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    {isEn ? 'SSL Protected' : 'بک‌اند امن (SSL)'}
                  </span>
                  <div className="text-xl font-bold font-mono text-purple-400 mt-1">
                    {proxySummary?.sslBackendCount ?? 0}
                  </div>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider flex items-center justify-between">
                    <span>{isEn ? 'Module Readiness' : 'آمادگی ماژول‌ها'}</span>
                    <FieldInfoTooltip
                      fieldName="Apache Proxy Modules"
                      infoWhatEn="Apache relies on dynamic modules (mod_proxy, mod_proxy_http, mod_proxy_wstunnel, mod_proxy_balancer) for proxying traffic."
                      infoWhatFa="آپاچی برای فوروارد ترافیک، وب‌سوکت و لود بالانسر به ماژول‌های داینامیک mod_proxy، mod_proxy_http و ... وابسته است."
                      infoWhyEn="Without these modules loaded, Apache will reject ProxyPass directives with configuration errors."
                      infoWhyFa="بدون بارگذاری این ماژول‌ها، آپاچی دایرکتیوهای ProxyPass را خطا دانسته و اجرا نمی‌کند."
                      infoExampleEn="mod_proxy, mod_proxy_http, mod_proxy_wstunnel"
                      infoExampleFa="mod_proxy، mod_proxy_http، mod_proxy_wstunnel"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </span>
                  <div className="text-sm font-bold font-mono mt-1 flex items-center gap-1.5">
                    {proxySummary?.allRequiredModulesLoaded ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{isEn ? 'Operational' : 'آماده به کار'}</span>
                      </span>
                    ) : (
                      <span className="text-amber-400 flex items-center gap-1 text-xs">
                        <AlertCircle className="w-4 h-4" />
                        <span>{isEn ? 'Missing Modules' : 'ماژول‌های ناقص'}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Missing Modules Warning Banner */}
              {proxySummary && !proxySummary.allRequiredModulesLoaded && (
                <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <div className="font-bold text-amber-300">
                        {isEn
                          ? 'Essential Apache Proxy modules are not yet loaded!'
                          : 'ماژول‌های اصلی پروکسی آپاچی هنوز بارگذاری نشده‌اند!'}
                      </div>
                      <div className="text-slate-300 text-[11px]">
                        {isEn
                          ? `Missing: ${proxySummary.missingModules.join(', ')}. Reverse proxy requests require these modules.`
                          : `ماژول‌های ناموجود: ${proxySummary.missingModules.join('، ')}. برای کارکرد پروکسی معکوس این ماژول‌ها ضروری هستند.`}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEnableProxyModules(proxySummary.missingModules)}
                    disabled={enablingModules}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer transition shrink-0 flex items-center gap-1.5 shadow"
                  >
                    {enablingModules ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {enablingModules
                        ? isEn
                          ? 'Enabling...'
                          : 'در حال فعال‌سازی...'
                        : isEn
                        ? 'Enable Missing Modules'
                        : 'فعال‌سازی خودکار ماژول‌ها'}
                    </span>
                  </button>
                </div>
              )}

              {/* VIEW 1: REVERSE PROXY ROUTES */}
              {proxyViewMode === 'routes' && (
                <div className="space-y-3">
                  {/* Search and Filters */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    <div className="relative flex-1 max-w-md">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        placeholder={
                          isEn
                            ? 'Search by path, backend target, domain...'
                            : 'جستجو بر اساس مسیر، سرور مقصد، دامنه...'
                        }
                        value={proxySearch}
                        onChange={(e) => setProxySearch(e.target.value)}
                        className={`w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border font-mono ${
                          isLightMode
                            ? 'bg-white border-slate-200 text-slate-800'
                            : 'bg-slate-900 border-slate-700 text-slate-200'
                        }`}
                      />
                    </div>

                    <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                      {[
                        { id: 'all', labelEn: 'All', labelFa: 'همه' },
                        { id: 'http', labelEn: 'HTTP/HTTPS', labelFa: 'HTTP/HTTPS' },
                        { id: 'ws', labelEn: 'WebSocket', labelFa: 'وب‌سوکت' },
                        { id: 'balancer', labelEn: 'Balancer', labelFa: 'بالانسر' },
                        { id: 'ssl', labelEn: 'SSL Backend', labelFa: 'بک‌اند امن' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setProxyFilter(f.id as any)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition shrink-0 ${
                            proxyFilter === f.id
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : isLightMode
                              ? 'text-slate-600 hover:bg-slate-100'
                              : 'text-slate-400 hover:bg-slate-800'
                          }`}
                        >
                          {isEn ? f.labelEn : f.labelFa}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Routes List */}
                  {loadingProxy ? (
                    <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                      <span>{isEn ? 'Scanning Apache proxy directives...' : 'در حال اسکن دایرکتیوهای پروکسی آپاچی...'}</span>
                    </div>
                  ) : (
                    (() => {
                      const filteredRoutes = (proxySummary?.routes || []).filter((r) => {
                        const matchesSearch =
                          !proxySearch ||
                          r.path.toLowerCase().includes(proxySearch.toLowerCase()) ||
                          r.target.toLowerCase().includes(proxySearch.toLowerCase()) ||
                          (r.serverName && r.serverName.toLowerCase().includes(proxySearch.toLowerCase())) ||
                          r.fileRelativePath.toLowerCase().includes(proxySearch.toLowerCase());

                        if (!matchesSearch) return false;
                        if (proxyFilter === 'http') return r.protocol === 'http' || r.protocol === 'https';
                        if (proxyFilter === 'ws') return r.websocketEnabled || r.protocol === 'ws' || r.protocol === 'wss';
                        if (proxyFilter === 'balancer') return r.isBalancer;
                        if (proxyFilter === 'ssl') return r.sslBackend;
                        return true;
                      });

                      if (filteredRoutes.length === 0) {
                        return (
                          <div
                            className={`p-8 rounded-xl border text-center space-y-3 ${
                              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                            }`}
                          >
                            <Globe className="w-8 h-8 text-slate-500 mx-auto" />
                            <div className="font-bold text-sm">
                              {isEn ? 'No Reverse Proxy Routes Found' : 'هیچ مسیر پروکسی معکوسی یافت نشد'}
                            </div>
                            <p className="text-xs text-slate-400 max-w-sm mx-auto">
                              {isEn
                                ? 'No ProxyPass directives are active in the discovered Apache configurations.'
                                : 'هیچ دایرکتیو ProxyPass فعالی در کانفیگ‌های آپاچی کشف نشد.'}
                            </p>
                            <button
                              type="button"
                              onClick={() => setIsCreateProxyOpen(true)}
                              className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer hover:bg-amber-400 transition"
                            >
                              {isEn ? 'Deploy First Proxy Route' : 'ایجاد اولین مسیر پروکسی'}
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-2.5">
                          {filteredRoutes.map((route) => (
                            <div
                              key={route.id}
                              className={`p-3.5 rounded-xl border transition ${
                                isLightMode
                                  ? 'bg-white border-slate-200 hover:border-amber-500/50'
                                  : 'bg-slate-900/70 border-slate-800 hover:border-amber-500/40'
                              }`}
                            >
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                                {/* Route Info */}
                                <div className="space-y-1.5 flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono font-bold text-sm text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                      {route.path}
                                    </span>
                                    <span className="text-slate-400 text-xs">→</span>
                                    <span className="font-mono font-bold text-sm text-cyan-300 truncate max-w-xs sm:max-w-md">
                                      {route.target}
                                    </span>

                                    {/* Protocol badge */}
                                    <span
                                      className={`text-[10px] px-2 py-0.2 rounded font-mono font-bold uppercase ${
                                        route.isBalancer
                                          ? 'bg-purple-500/20 text-purple-300'
                                          : route.websocketEnabled
                                          ? 'bg-emerald-500/20 text-emerald-300'
                                          : route.sslBackend
                                          ? 'bg-cyan-500/20 text-cyan-300'
                                          : 'bg-blue-500/20 text-blue-300'
                                      }`}
                                    >
                                      {route.protocol}
                                    </span>

                                    {route.websocketEnabled && (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 font-mono flex items-center gap-1">
                                        <Activity className="w-3 h-3" />
                                        WebSocket
                                      </span>
                                    )}

                                    {route.preserveHost && (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-700/50 text-slate-300 font-mono">
                                        Host: Preserved
                                      </span>
                                    )}

                                    {route.sslBackend && (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-300 font-mono flex items-center gap-1">
                                        <Shield className="w-3 h-3" />
                                        SSL Backend
                                      </span>
                                    )}

                                    {route.timeout && (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                                        {route.timeout}s
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
                                    {route.serverName && (
                                      <span className="flex items-center gap-1 text-slate-300">
                                        <Globe className="w-3 h-3 text-amber-400" />
                                        <span>{route.serverName}</span>
                                      </span>
                                    )}
                                    <span className="truncate text-[11px] text-slate-400">
                                      {route.fileRelativePath}
                                      {route.lineStart ? `:${route.lineStart}` : ''}
                                    </span>
                                  </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                                  <button
                                    type="button"
                                    onClick={() => setInspectProxyRoute(route)}
                                    className="p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition text-xs flex items-center gap-1"
                                    title={isEn ? 'Inspect Apache Directive' : 'مشاهده دایرکتیو کانفیگ'}
                                  >
                                    <Code2 className="w-3.5 h-3.5 text-amber-400" />
                                    <span>{isEn ? 'Inspect' : 'بررسی'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteProxyRoute(route)}
                                    disabled={deletingProxyId === route.id}
                                    className="p-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/20 cursor-pointer transition text-xs flex items-center gap-1"
                                    title={isEn ? 'Delete Proxy Route' : 'حذف مسیر پروکسی'}
                                  >
                                    {deletingProxyId === route.id ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  )}
                </div>
              )}

              {/* VIEW 2: LOAD BALANCER POOLS */}
              {proxyViewMode === 'balancers' && (
                <div className="space-y-3">
                  {loadingProxy ? (
                    <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                      <span>{isEn ? 'Scanning Apache balancer clusters...' : 'در حال اسکن کلاسترهای بالانسر آپاچی...'}</span>
                    </div>
                  ) : (proxySummary?.balancers || []).length === 0 ? (
                    <div
                      className={`p-8 rounded-xl border text-center space-y-3 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <Network className="w-8 h-8 text-slate-500 mx-auto" />
                      <div className="font-bold text-sm">
                        {isEn ? 'No Load Balancer Pools Defined' : 'هیچ کلاستر توزیع باری تعریف نشده است'}
                      </div>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        {isEn
                          ? 'Apache mod_proxy_balancer supports clustering multiple backends with failover & loadfactor.'
                          : 'ماژول mod_proxy_balancer امکان توزیع بار بین چندین سرور بک‌اند با ضرایب وزنی را فراهم می‌کند.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setCreateProxyForm({ ...createProxyForm, isBalancer: true });
                          setIsCreateProxyOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer hover:bg-amber-400 transition"
                      >
                        {isEn ? 'Create Balancer Cluster' : 'ایجاد کلاستر توزیع بار'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(proxySummary?.balancers || []).map((bal) => (
                        <div
                          key={bal.id}
                          className={`p-4 rounded-xl border ${
                            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-slate-800'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                            <div className="flex items-center gap-2.5">
                              <Network className="w-5 h-5 text-purple-400 shrink-0" />
                              <div>
                                <div className="font-mono font-bold text-sm text-purple-300">
                                  balancer://{bal.name}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  {bal.fileRelativePath}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono uppercase font-bold">
                                {bal.algorithm}
                              </span>
                              <span className="text-xs text-slate-400 font-mono">
                                {bal.members.length} {isEn ? 'members' : 'عضو'}
                              </span>
                              <button
                                type="button"
                                onClick={() => setInspectBalancer(bal)}
                                className="p-1 rounded-lg text-slate-400 hover:text-white"
                                title={isEn ? 'View Snippet' : 'مشاهده کد'}
                              >
                                <Code2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Member Table */}
                          <div className="pt-3 overflow-x-auto">
                            <table className="w-full text-left font-mono text-xs">
                              <thead>
                                <tr className="text-slate-400 text-[10px] uppercase border-b border-slate-800/60 pb-1">
                                  <th className="pb-1 font-semibold">{isEn ? 'Member Target URL' : 'آدرس گره بک‌اند'}</th>
                                  <th className="pb-1 font-semibold">{isEn ? 'Weight' : 'ضریب بار'}</th>
                                  <th className="pb-1 font-semibold">{isEn ? 'Status' : 'وضعیت'}</th>
                                  <th className="pb-1 font-semibold">{isEn ? 'Route' : 'مسیر'}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/40">
                                {bal.members.map((m, mIdx) => (
                                  <tr key={mIdx} className="hover:bg-white/5 transition">
                                    <td className="py-1.5 font-bold text-slate-200">{m.url}</td>
                                    <td className="py-1.5 text-amber-400 font-bold">{m.loadfactor || 1}</td>
                                    <td className="py-1.5">
                                      {m.isBackup ? (
                                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-sans">
                                          Standby
                                        </span>
                                      ) : m.isDrain ? (
                                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-500/20 text-red-300 font-sans">
                                          Drain
                                        </span>
                                      ) : (
                                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-sans">
                                          Active
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-1.5 text-slate-400">{m.route || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* VIEW 3: PROXY MODULES CATALOG */}
              {proxyViewMode === 'modules' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {isEn
                        ? 'Catalog of dynamic Apache modules governing reverse proxy, protocols & load balancing'
                        : 'کاتالوگ جامع ماژول‌های داینامیک آپاچی برای پروکسی، وب‌سوکت و توزیع بار'}
                    </span>
                    {proxySummary?.missingModules && proxySummary.missingModules.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleEnableProxyModules(proxySummary.missingModules)}
                        disabled={enablingModules}
                        className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer transition text-xs flex items-center gap-1 shadow"
                      >
                        {enablingModules ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        <span>{isEn ? 'Enable All Missing' : 'فعال‌سازی همه موارد ناقص'}</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(proxySummary?.moduleStatus || []).map((mod, idx) => (
                      <div
                        key={idx}
                        className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 transition ${
                          mod.isLoaded
                            ? isLightMode
                              ? 'bg-white border-emerald-300'
                              : 'bg-slate-900/70 border-emerald-500/30'
                            : isLightMode
                            ? 'bg-amber-50 border-amber-300'
                            : 'bg-slate-900/70 border-amber-500/30'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-sm text-slate-100 flex items-center gap-1.5">
                              <span>{mod.name}</span>
                              <span className="text-slate-400 text-[11px] font-normal">({mod.moduleName})</span>
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase ${
                                mod.isLoaded
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-amber-500/20 text-amber-400'
                              }`}
                            >
                              {mod.isLoaded
                                ? isEn
                                  ? 'Loaded'
                                  : 'بارگذاری شده'
                                : isEn
                                ? 'Not Loaded'
                                : 'بارگذاری نشده'}
                            </span>
                          </div>

                          <p className="text-xs text-slate-300 font-medium leading-relaxed">
                            {isEn ? mod.purpose : mod.purpose_fa}
                          </p>
                          <p className="text-[11px] text-slate-400 leading-normal">
                            <strong className="text-slate-300">{isEn ? 'Used for: ' : 'کاربرد: '}</strong>
                            {mod.requiredFor}
                          </p>
                        </div>

                        {!mod.isLoaded && (
                          <div className="pt-2 border-t border-slate-800 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleEnableProxyModules([mod.name.replace(/^mod_/, '')])}
                              disabled={enablingModules}
                              className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 text-xs font-bold cursor-pointer transition flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>{isEn ? 'Enable Module' : 'فعال‌سازی ماژول'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 5: MODULES & MPM MANAGEMENT (PHASE 6)                */}
          {/* ======================================================== */}
          {activeTab === 'modules' && (
            <div className="space-y-4">
              {/* Header Controls */}
              <div
                className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                    <Boxes className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm flex items-center gap-2">
                      <span>{isEn ? 'Apache Modules & MPM Architecture' : 'معماری ماژول‌ها و MPM آپاچی'}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold">
                        Phase 6
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      {isEn
                        ? `Loaded: ${modulesSummary?.loadedCount || discovery?.loadedModules?.length || 0} • Available: ${modulesSummary?.availableCount || 0} • Active MPM: ${modulesSummary?.activeMpm?.activeMpm || discovery?.activeMpm || 'event'}`
                        : `بارگذاری‌شده: ${modulesSummary?.loadedCount || discovery?.loadedModules?.length || 0} • موجود: ${modulesSummary?.availableCount || 0} • مدل MPM فعال: ${modulesSummary?.activeMpm?.activeMpm || discovery?.activeMpm || 'event'}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (modulesSummary?.activeMpm?.activeMpm) {
                        setTargetMpm(modulesSummary.activeMpm.activeMpm);
                      }
                      setIsSwitchMpmOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer transition flex items-center gap-1.5 shadow-sm"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Switch MPM' : 'تغییر مدل MPM'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={fetchModulesData}
                    disabled={loadingModules}
                    className={`p-2 rounded-lg border text-slate-400 hover:text-white cursor-pointer transition ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'
                    }`}
                    title={isEn ? 'Refresh Modules' : 'به‌روزرسانی ماژول‌ها'}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingModules ? 'animate-spin text-amber-400' : ''}`} />
                  </button>
                </div>
              </div>

              {/* MPM Architecture Spotlight Card */}
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <Cpu className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">
                          {isEn ? 'Multi-Processing Module (MPM):' : 'مدل چندپردازشی فعال (MPM):'}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-mono font-bold text-xs uppercase">
                          mpm_{modulesSummary?.activeMpm?.activeMpm || discovery?.activeMpm || 'event'}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {modulesSummary?.activeMpm?.isThreaded
                          ? isEn
                            ? 'Threaded Multi-Process Architecture (High Concurrency & Async I/O)'
                            : 'معماری چندپردازشی چندتردی (کارایی بالا و پردازش غیرهمگام I/O)'
                          : isEn
                          ? 'Process-Based Non-Threaded Architecture (Legacy/PHP Thread-Safe)'
                          : 'معماری تک‌تردی مبتنی بر پردازه مجزا (مناسب برای ماژول‌های فاقد Thread-Safety)'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (modulesSummary?.activeMpm?.activeMpm) {
                        setTargetMpm(modulesSummary.activeMpm.activeMpm);
                      }
                      setIsSwitchMpmOpen(true);
                    }}
                    className="text-xs text-amber-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <span>{isEn ? 'Change Engine' : 'تغییر موتور'}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Compatibility Warning if present */}
                {modulesSummary?.activeMpm?.compatibilityWarning && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">
                        {isEn ? 'MPM Compatibility Notice' : 'هشدار سازگاری مدل پردازشی MPM'}
                      </div>
                      <div className="text-[11px] text-slate-300 mt-0.5">
                        {isEn
                          ? modulesSummary.activeMpm.compatibilityWarning
                          : modulesSummary.activeMpm.compatibilityWarning_fa}
                      </div>
                    </div>
                  </div>
                )}

                {/* 3 MPM Architecture Explanations */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                  <div
                    className={`p-3 rounded-lg border transition ${
                      (modulesSummary?.activeMpm?.activeMpm || discovery?.activeMpm) === 'event'
                        ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-600'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold mb-1">
                      <span>Event MPM</span>
                      {(modulesSummary?.activeMpm?.activeMpm || discovery?.activeMpm) === 'event' && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 uppercase font-bold">
                          {isEn ? 'Active' : 'فعال'}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      {isEn
                        ? 'Asynchronous listener threads offload Keep-Alive connections. Best for high traffic & HTTP/2.'
                        : 'تردهای شنونده ناهمگام کانکشن‌های Keep-Alive را مدیریت می‌کنند. بهترین گزینه برای ترافیک بالا و HTTP/2.'}
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-lg border transition ${
                      (modulesSummary?.activeMpm?.activeMpm || discovery?.activeMpm) === 'worker'
                        ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-600'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold mb-1">
                      <span>Worker MPM</span>
                      {(modulesSummary?.activeMpm?.activeMpm || discovery?.activeMpm) === 'worker' && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 uppercase font-bold">
                          {isEn ? 'Active' : 'فعال'}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      {isEn
                        ? 'Multi-process multi-threaded hybrid. Low memory footprint with fixed thread pools.'
                        : 'معماری ترکیبی چندپردازشی و چندتردی با مصرف بهینه رم و استخرهای ترد ثابت.'}
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-lg border transition ${
                      (modulesSummary?.activeMpm?.activeMpm || discovery?.activeMpm) === 'prefork'
                        ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-600'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold mb-1">
                      <span>Prefork MPM</span>
                      {(modulesSummary?.activeMpm?.activeMpm || discovery?.activeMpm) === 'prefork' && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 uppercase font-bold">
                          {isEn ? 'Active' : 'فعال'}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      {isEn
                        ? 'Isolated non-threaded processes. Essential when running non-thread-safe modules like mod_php.'
                        : 'پردازه‌های مجزا و تک‌تردی؛ ایزوله‌سازی کامل حافظه برای افزونه‌های ناسازگار با ترد (مانند mod_php).'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Statistical Metrics Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <div
                  className={`p-3 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    {isEn ? 'Loaded Modules' : 'ماژول‌های بارگذاری‌شده'}
                  </span>
                  <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                    {modulesSummary?.loadedCount || discovery?.loadedModules?.length || 0}
                  </div>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    {isEn ? 'Disabled / Inactive' : 'غیرفعال / در دسترس'}
                  </span>
                  <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                    {modulesSummary?.disabledCount || 0}
                  </div>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    {isEn ? 'Static (Compiled-in)' : 'استاتیک (کامپایل‌شده)'}
                  </span>
                  <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
                    {modulesSummary?.staticCount || discovery?.compiledModules?.length || 0}
                  </div>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider flex items-center justify-between">
                    <span>{isEn ? 'Required by Config' : 'الزام در کانفیگ'}</span>
                    <FieldInfoTooltip
                      fieldName="Required by Config"
                      infoWhatEn="Modules that are actively demanded by directives used in your virtual hosts and config files (e.g. RewriteRule demands mod_rewrite)."
                      infoWhatFa="ماژول‌هایی که صراحتاً توسط دایرکتیوهای کانفیگ‌های شما (مانند RewriteRule یا ProxyPass) مورد نیاز هستند."
                      infoWhyEn="If a required module is disabled, Apache will throw a syntax error and fail to boot."
                      infoWhyFa="در صورت غیرفعال شدن این ماژول‌ها، آپاچی خطای سینتکس داده و اجرا نخواهد شد."
                      infoExampleEn="RewriteRule -> mod_rewrite, SSLEngine -> mod_ssl"
                      infoExampleFa="RewriteRule -> mod_rewrite، SSLEngine -> mod_ssl"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </span>
                  <div className="text-xl font-bold font-mono text-purple-400 mt-1">
                    {modulesSummary?.requiredCount || 0}
                  </div>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    {isEn ? 'Active MPM' : 'موتور MPM فعال'}
                  </span>
                  <div className="text-sm font-bold font-mono text-amber-300 mt-1 uppercase truncate">
                    {modulesSummary?.activeMpm?.activeMpm || discovery?.activeMpm || 'event'}
                  </div>
                </div>
              </div>

              {/* Search and Filters */}
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder={
                        isEn
                          ? 'Search modules by name, directive, category...'
                          : 'جستجوی ماژول بر اساس نام، دایرکتیو، دسته‌بندی...'
                      }
                      value={moduleSearchQuery}
                      onChange={(e) => setModuleSearchQuery(e.target.value)}
                      className={`w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-200 text-slate-800'
                          : 'bg-slate-900 border-slate-700 text-slate-200'
                      }`}
                    />
                  </div>

                  {/* Status Filter Buttons */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                    {[
                      { id: 'all', labelEn: 'All', labelFa: 'همه' },
                      { id: 'loaded', labelEn: 'Loaded', labelFa: 'بارگذاری‌شده' },
                      { id: 'disabled', labelEn: 'Disabled', labelFa: 'غیرفعال' },
                      { id: 'required', labelEn: 'Required by Config', labelFa: 'الزام کانفیگ' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setModuleStatusFilter(f.id as any)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition shrink-0 ${
                          moduleStatusFilter === f.id
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : isLightMode
                            ? 'text-slate-600 hover:bg-slate-100'
                            : 'text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {isEn ? f.labelEn : f.labelFa}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  <span className="text-[11px] text-slate-400 font-semibold shrink-0">
                    {isEn ? 'Category:' : 'دسته‌بندی:'}
                  </span>
                  {[
                    { id: 'all', labelEn: 'All Categories', labelFa: 'همه دسته‌ها' },
                    { id: 'core', labelEn: 'Core', labelFa: 'هسته' },
                    { id: 'proxy', labelEn: 'Proxy', labelFa: 'پروکسی' },
                    { id: 'security', labelEn: 'Security & SSL', labelFa: 'امنیت و SSL' },
                    { id: 'performance', labelEn: 'Performance', labelFa: 'بهینه‌سازی' },
                    { id: 'rewrite', labelEn: 'URL Rewrite', labelFa: 'بازنویسی آدرس' },
                    { id: 'auth', labelEn: 'Auth', labelFa: 'احراز هویت' },
                    { id: 'mpm', labelEn: 'MPM', labelFa: 'مدل پردازش' },
                    { id: 'other', labelEn: 'Other', labelFa: 'سایر' },
                  ].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setModuleCategoryFilter(c.id)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer transition shrink-0 ${
                        moduleCategoryFilter === c.id
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                          : isLightMode
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {isEn ? c.labelEn : c.labelFa}
                    </button>
                  ))}
                </div>
              </div>

              {/* Modules Grid */}
              {loadingModules ? (
                <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                  <span>{isEn ? 'Scanning Apache modules & directives...' : 'در حال اسکن ماژول‌ها و دایرکتیوهای آپاچی...'}</span>
                </div>
              ) : (
                (() => {
                  const filtered = (modulesSummary?.modules || []).filter((m) => {
                    // Search
                    if (moduleSearchQuery) {
                      const q = moduleSearchQuery.toLowerCase();
                      const matchName =
                        m.name.toLowerCase().includes(q) ||
                        m.rawName.toLowerCase().includes(q) ||
                        (m.moduleSymbol && m.moduleSymbol.toLowerCase().includes(q)) ||
                        m.descriptionEn.toLowerCase().includes(q) ||
                        m.descriptionFa.includes(q) ||
                        m.requiredByDirectives.some((d) => d.toLowerCase().includes(q));
                      if (!matchName) return false;
                    }

                    // Category
                    if (moduleCategoryFilter !== 'all') {
                      if (m.category !== moduleCategoryFilter) return false;
                    }

                    // Status
                    if (moduleStatusFilter === 'loaded') return m.status === 'loaded';
                    if (moduleStatusFilter === 'disabled') return m.status === 'disabled';
                    if (moduleStatusFilter === 'required') return m.isRequiredByConfig;

                    return true;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div
                        className={`p-8 rounded-xl border text-center space-y-2 ${
                          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                        }`}
                      >
                        <Boxes className="w-8 h-8 text-slate-500 mx-auto" />
                        <div className="font-bold text-sm">
                          {isEn ? 'No Matching Apache Modules' : 'هیچ ماژولی مطابق با فیلتر یافت نشد'}
                        </div>
                        <p className="text-xs text-slate-400">
                          {isEn
                            ? 'Try clearing the search query or changing category and status filters.'
                            : 'معیار فیلتر خود را تغییر دهید یا عبارت جستجو را پاک کنید.'}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {filtered.map((mod) => {
                        const isCore = ['core', 'so', 'http', 'authz_core'].includes(mod.rawName);
                        const isMpm = mod.category === 'mpm';

                        return (
                          <div
                            key={mod.name}
                            className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 transition ${
                              mod.status === 'loaded'
                                ? isLightMode
                                  ? 'bg-white border-slate-200 hover:border-amber-500/50'
                                  : 'bg-slate-900/70 border-slate-800 hover:border-amber-500/40'
                                : isLightMode
                                ? 'bg-slate-50/80 border-slate-200 opacity-80'
                                : 'bg-slate-950/60 border-slate-800/80 opacity-75'
                            }`}
                          >
                            <div className="space-y-1.5">
                              {/* Top Bar: Name & Badges */}
                              <div className="flex items-center justify-between flex-wrap gap-1.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-sm text-slate-100">
                                    {mod.name}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    ({mod.moduleSymbol || `${mod.rawName}_module`})
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`text-[10px] px-2 py-0.2 rounded font-mono uppercase font-bold ${
                                      mod.category === 'security'
                                        ? 'bg-purple-500/20 text-purple-300'
                                        : mod.category === 'proxy'
                                        ? 'bg-blue-500/20 text-blue-300'
                                        : mod.category === 'performance'
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : mod.category === 'rewrite'
                                        ? 'bg-amber-500/20 text-amber-300'
                                        : mod.category === 'mpm'
                                        ? 'bg-cyan-500/20 text-cyan-300'
                                        : 'bg-slate-700/50 text-slate-300'
                                    }`}
                                  >
                                    {mod.category}
                                  </span>

                                  <span
                                    className={`text-[10px] px-2 py-0.2 rounded-full font-mono font-bold uppercase ${
                                      mod.status === 'loaded'
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : mod.status === 'disabled'
                                        ? 'bg-amber-500/20 text-amber-400'
                                        : 'bg-slate-700/40 text-slate-400'
                                    }`}
                                  >
                                    {mod.status === 'loaded'
                                      ? isEn
                                        ? 'Loaded'
                                        : 'بارگذاری‌شده'
                                      : mod.status === 'disabled'
                                      ? isEn
                                        ? 'Disabled'
                                        : 'غیرفعال'
                                      : isEn
                                      ? 'Available'
                                      : 'موجود'}
                                  </span>
                                </div>
                              </div>

                              {/* Required by Config Banner */}
                              {mod.isRequiredByConfig && (
                                <div className="p-1.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[11px] flex items-center gap-1.5 font-mono">
                                  <CheckSquare className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                  <span className="font-semibold">
                                    {isEn ? 'Required by config: ' : 'الزام در فایل‌های کانفیگ: '}
                                  </span>
                                  <span className="truncate text-slate-300">
                                    {mod.requiredByDirectives.slice(0, 3).join(', ')}
                                  </span>
                                </div>
                              )}

                              {/* Description */}
                              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                                {isEn ? mod.descriptionEn : mod.descriptionFa}
                              </p>
                            </div>

                            {/* Actions Footer */}
                            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                              <span className="text-[10px] text-slate-400">
                                {mod.type === 'static' ? 'Static (in-binary)' : 'DSO Dynamic (.so)'}
                              </span>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setInspectModule(mod)}
                                  className="p-1.5 rounded border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition flex items-center gap-1"
                                  title={isEn ? 'Inspect Module' : 'بررسی مشخصات ماژول'}
                                >
                                  <Code2 className="w-3 h-3 text-amber-400" />
                                  <span>{isEn ? 'Inspect' : 'مشاهده'}</span>
                                </button>

                                {!isCore && !isMpm && (
                                  <>
                                    {mod.status === 'loaded' ? (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleModuleAction(mod, 'disable')}
                                        disabled={togglingModuleName === mod.name}
                                        className="px-2.5 py-1 rounded border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 text-[11px] font-bold cursor-pointer transition flex items-center gap-1"
                                      >
                                        {togglingModuleName === mod.name ? (
                                          <RefreshCw className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <Power className="w-3 h-3" />
                                        )}
                                        <span>{isEn ? 'Disable' : 'غیرفعال‌سازی'}</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleModuleAction(mod, 'enable')}
                                        disabled={togglingModuleName === mod.name}
                                        className="px-2.5 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-[11px] font-bold cursor-pointer transition flex items-center gap-1"
                                      >
                                        {togglingModuleName === mod.name ? (
                                          <RefreshCw className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <Check className="w-3 h-3" />
                                        )}
                                        <span>{isEn ? 'Enable' : 'فعال‌سازی'}</span>
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 6: SSL / TLS CERTIFICATE ENGINE (PHASE 7)             */}
          {/* ======================================================== */}
          {activeTab === 'ssl' && (
            <div className="space-y-4">
              {/* Header Bar */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>
                      {isEn
                        ? 'SSL / TLS Certificates & Security Inspector'
                        : 'کاوش و تحلیل زنده گواهینامه‌های امنیتی SSL / TLS'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    {isEn
                      ? `Discovered: ${sslData?.totalCertificates ?? 0} • Valid: ${sslData?.validCertificates ?? 0} • Expiring Soon: ${sslData?.expiringSoonCertificates ?? 0} • Expired: ${sslData?.expiredCertificates ?? 0}`
                      : `گواهینامه‌های کشف‌شده: ${sslData?.totalCertificates ?? 0} • معتبر: ${sslData?.validCertificates ?? 0} • در آستانه انقضا: ${sslData?.expiringSoonCertificates ?? 0} • منقضی: ${sslData?.expiredCertificates ?? 0}`}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={fetchSslData}
                    disabled={loadingSsl}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                      isLightMode
                        ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingSsl ? 'animate-spin' : ''}`} />
                    <span>
                      {loadingSsl
                        ? isEn
                          ? 'Inspecting Certificates...'
                          : 'در حال بررسی گواهینامه‌ها...'
                        : isEn
                        ? 'Refresh Certificates'
                        : 'بروزرسانی گواهینامه‌ها'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (vhostsSummary?.vhosts && vhostsSummary.vhosts.length > 0) {
                        setGenerateVHostId(vhostsSummary.vhosts[0].id);
                      }
                      setIsGenerateSelfSignedOpen(true);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Generate Self-Signed' : 'صدور گواهینامه خودامضا'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (vhostsSummary?.vhosts && vhostsSummary.vhosts.length > 0) {
                        setAttachVHostId(vhostsSummary.vhosts[0].id);
                      }
                      if (selectedCert) {
                        setAttachCertPath(selectedCert.certPath);
                        if (selectedCert.keyPath) setAttachKeyPath(selectedCert.keyPath);
                        if (selectedCert.chainPath) setAttachChainPath(selectedCert.chainPath);
                      }
                      setIsAttachCertOpen(true);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Attach SSL to VHost' : 'اتصال SSL به هاست مجازی'}</span>
                  </button>

                  <FieldInfoTooltip
                    fieldName="Apache SSL / TLS Certificate Inspector"
                    infoWhatEn="Scans and analyzes real X.509 SSL/TLS certificates and private keys referenced across Apache VirtualHosts and system stores via OpenSSL."
                    infoWhatFa="پایش و بررسی دقیق گواهینامه‌های واقعی X.509 و کلیدهای استفاده‌شده در کانفیگ‌های آپاچی و مخازن سیستم مستقیماً از روی سرور با ابزار استاندارد OpenSSL."
                    infoWhyEn="Critical for preventing sudden HTTPS downtime, detecting certificate expirations before they affect users, and validating Subject Alternative Names (SANs)."
                    infoWhyFa="حیاتی برای جلوگیری از قطع ناگهانی پروتکل امن HTTPS، تشخیص زودهنگام انقضای گواهینامه‌ها و بررسی دامنه‌های تحت پوشش (SANs)."
                    infoExampleEn="SSLCertificateFile /etc/letsencrypt/live/domain.com/fullchain.pem; SSLCertificateKeyFile /etc/letsencrypt/live/domain.com/privkey.pem;"
                    infoExampleFa="SSLCertificateFile /etc/letsencrypt/live/domain.com/fullchain.pem; SSLCertificateKeyFile /etc/letsencrypt/live/domain.com/privkey.pem;"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
              </div>

              {/* mod_ssl Status Alert Banner */}
              {sslData && !sslData.modSslLoaded && (
                <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">
                        {isEn
                          ? 'Apache mod_ssl Module is Not Loaded'
                          : 'ماژول mod_ssl در وب‌سرور آپاچی بارگذاری نشده است'}
                      </div>
                      <div className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                        {isEn
                          ? 'Apache requires the mod_ssl module to bind to port 443 and terminate TLS connections. Without it, SSL VirtualHosts will produce syntax or runtime errors.'
                          : 'آپاچی برای گوش دادن به پورت ۴۴۳ و مدیریت اتصالات امن TLS به ماژول mod_ssl نیاز دارد. بدون آن، هاست‌های مجازی SSL با خطای ساختاری مواجه خواهند شد.'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleEnableModSsl}
                    disabled={enablingModSsl}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer transition shrink-0 flex items-center gap-1.5 shadow-sm"
                  >
                    {enablingModSsl ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Power className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {enablingModSsl
                        ? isEn
                          ? 'Enabling mod_ssl...'
                          : 'در حال فعال‌سازی...'
                        : isEn
                        ? 'Enable mod_ssl'
                        : 'فعال‌سازی ماژول mod_ssl'}
                    </span>
                  </button>
                </div>
              )}

              {/* SSL Telemetry Metric Cards */}
              {sslData && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
                  <div
                    className={`p-3 rounded-xl border ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">
                      {isEn ? 'Total Discovered' : 'کل گواهینامه‌ها'}
                    </span>
                    <div className="text-base font-bold text-slate-200 mt-1">
                      {sslData.totalCertificates}
                    </div>
                  </div>

                  <div
                    className={`p-3 rounded-xl border ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">
                      {isEn ? 'Valid & Active' : 'معتبر و فعال'}
                    </span>
                    <div className="text-base font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                      <span>{sslData.validCertificates}</span>
                      {sslData.validCertificates > 0 && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                    </div>
                  </div>

                  <div
                    className={`p-3 rounded-xl border ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    } ${
                      sslData.expiringSoonCertificates > 0
                        ? isLightMode
                          ? 'border-amber-300 bg-amber-50/50'
                          : 'border-amber-500/40 bg-amber-500/10'
                        : ''
                    }`}
                  >
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">
                      {isEn ? 'Expiring Soon (<=30d)' : 'آستانه انقضا (کمتر از ۳۰ روز)'}
                    </span>
                    <div className="text-base font-bold text-amber-400 mt-1 flex items-center gap-1.5">
                      <span>{sslData.expiringSoonCertificates}</span>
                      {sslData.expiringSoonCertificates > 0 && (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                      )}
                    </div>
                  </div>

                  <div
                    className={`p-3 rounded-xl border ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    } ${
                      sslData.expiredCertificates + sslData.missingOrUnreadableCertificates > 0
                        ? isLightMode
                          ? 'border-rose-300 bg-rose-50/50'
                          : 'border-rose-500/40 bg-rose-500/10'
                        : ''
                    }`}
                  >
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">
                      {isEn ? 'Expired / Errors' : 'منقضی / خطا'}
                    </span>
                    <div className="text-base font-bold text-rose-400 mt-1 flex items-center gap-1.5">
                      <span>
                        {sslData.expiredCertificates + sslData.missingOrUnreadableCertificates}
                      </span>
                      {sslData.expiredCertificates + sslData.missingOrUnreadableCertificates > 0 && (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                      )}
                    </div>
                  </div>

                  <div
                    className={`p-3 rounded-xl border col-span-2 sm:col-span-1 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">
                      {isEn ? 'Self-Signed' : 'خودامضا (Self-Signed)'}
                    </span>
                    <div className="text-base font-bold text-cyan-400 mt-1">
                      {sslData.selfSignedCertificates}
                    </div>
                  </div>
                </div>
              )}

              {/* Expiring Soon / Expired Alert Banner */}
              {sslData &&
                (sslData.expiringSoonCertificates > 0 || sslData.expiredCertificates > 0) && (
                  <div
                    className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                      sslData.expiredCertificates > 0
                        ? isLightMode
                          ? 'bg-rose-50 border-rose-200 text-rose-800'
                          : 'bg-rose-950/40 border-rose-800 text-rose-300'
                        : isLightMode
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-amber-950/40 border-amber-800 text-amber-300'
                    }`}
                  >
                    <AlertTriangle
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        sslData.expiredCertificates > 0 ? 'text-rose-400' : 'text-amber-400'
                      }`}
                    />
                    <div className="flex-1">
                      <span className="font-bold">
                        {isEn
                          ? 'Certificate Action Required:'
                          : 'اقدام فوری جهت تمدید گواهینامه:'}
                      </span>{' '}
                      <span>
                        {isEn
                          ? `Attention! ${
                              sslData.expiredCertificates > 0
                                ? `${sslData.expiredCertificates} certificate(s) have EXPIRED, and `
                                : ''
                            }${
                              sslData.expiringSoonCertificates
                            } certificate(s) will expire within the next 30 days. Renew them via Certbot/ACME or your Certificate Authority to prevent service degradation.`
                          : `توجه! ${
                              sslData.expiredCertificates > 0
                                ? `${sslData.expiredCertificates} گواهینامه منقضی شده و `
                                : ''
                            }${
                              sslData.expiringSoonCertificates
                            } گواهینامه در کمتر از ۳۰ روز آینده منقضی خواهند شد. لطفاً پیش از بروز اختلال در دسترسی کاربران آنها را تمدید فرمایید.`}
                      </span>
                    </div>
                  </div>
                )}

              {/* Filter and Search Bar */}
              <div className="flex items-center justify-between gap-2 border-b pb-3 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(
                    [
                      {
                        id: 'all',
                        labelEn: 'All Certificates',
                        labelFa: 'همه گواهینامه‌ها',
                        count: sslData?.totalCertificates ?? 0,
                      },
                      {
                        id: 'valid',
                        labelEn: 'Valid',
                        labelFa: 'معتبر',
                        count: sslData?.validCertificates ?? 0,
                      },
                      {
                        id: 'expiring_soon',
                        labelEn: 'Expiring Soon',
                        labelFa: 'در آستانه انقضا',
                        count: sslData?.expiringSoonCertificates ?? 0,
                      },
                      {
                        id: 'expired',
                        labelEn: 'Expired',
                        labelFa: 'منقضی شده',
                        count: sslData?.expiredCertificates ?? 0,
                      },
                      {
                        id: 'self_signed',
                        labelEn: 'Self-Signed',
                        labelFa: 'خودامضا',
                        count: sslData?.selfSignedCertificates ?? 0,
                      },
                      {
                        id: 'error',
                        labelEn: 'Missing / Error',
                        labelFa: 'فایل مفقود / خطا',
                        count: sslData?.missingOrUnreadableCertificates ?? 0,
                      },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSslFilter(tab.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                        sslFilter === tab.id
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : isLightMode
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <span>{isEn ? tab.labelEn : tab.labelFa}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                          sslFilter === tab.id
                            ? 'bg-slate-950/20 text-slate-950'
                            : 'bg-black/20 text-slate-400'
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="relative min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={sslSearchQuery}
                    onChange={(e) => setSslSearchQuery(e.target.value)}
                    placeholder={
                      isEn
                        ? 'Filter by domain, issuer, or path...'
                        : 'فیلتر بر اساس دامنه، صادرکننده، مسیر...'
                    }
                    className={`w-full pl-8 pr-3 py-1 text-xs rounded-lg border font-mono transition focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                        : 'bg-slate-950/80 border-slate-800 text-slate-200 placeholder:text-slate-500'
                    }`}
                  />
                  {sslSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setSslSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* Master-Detail Certificates View */}
              {loadingSsl && !sslData ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <ShieldCheck className="w-8 h-8 text-amber-400 animate-spin" />
                  <p className="text-xs text-slate-400 font-mono">
                    {isEn
                      ? 'Running OpenSSL certificate inspector on remote Apache server...'
                      : 'در حال اجرای اسکنر گواهینامه‌های OpenSSL در وب‌سرور آپاچی...'}
                  </p>
                </div>
              ) : !sslData || sslData.certificates.length === 0 ? (
                <div
                  className={`p-8 rounded-xl border text-center space-y-3 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
                  }`}
                >
                  <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-200">
                    {isEn
                      ? 'No SSL / TLS Certificates Found in Apache'
                      : 'هیچ گواهینامه SSL / TLS در فایل‌های کانفیگ آپاچی یافت نشد'}
                  </h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    {isEn
                      ? "Apache does not appear to have any active SSLCertificateFile directives configured yet. You can issue a self-signed certificate right now or attach existing certificates to your VirtualHosts."
                      : 'به نظر می‌رسد دستور فعال SSLCertificateFile در فایل‌های پیکربندی آپاچی وجود ندارد. می‌توانید یک گواهینامه خودامضا ایجاد فرمایید یا گواهینامه‌های موجود را به VirtualHost متصل نمایید.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (vhostsSummary?.vhosts && vhostsSummary.vhosts.length > 0) {
                        setGenerateVHostId(vhostsSummary.vhosts[0].id);
                      }
                      setIsGenerateSelfSignedOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Generate Self-Signed Certificate' : 'صدور گواهینامه خودامضا'}</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  {/* Left Column: Certificates List */}
                  <div className="lg:col-span-5 space-y-2 max-h-[580px] overflow-y-auto pr-1">
                    {(() => {
                      const filtered = sslData.certificates.filter((cert) => {
                        if (sslFilter === 'valid' && cert.status !== 'valid') return false;
                        if (sslFilter === 'expiring_soon' && cert.status !== 'expiring_soon') return false;
                        if (sslFilter === 'expired' && cert.status !== 'expired') return false;
                        if (sslFilter === 'self_signed' && !cert.isSelfSigned) return false;
                        if (
                          sslFilter === 'error' &&
                          cert.status !== 'missing' &&
                          cert.status !== 'unreadable'
                        )
                          return false;

                        if (sslSearchQuery.trim()) {
                          const q = sslSearchQuery.toLowerCase();
                          const matchPrimary = cert.primaryDomain.toLowerCase().includes(q);
                          const matchAll = cert.allDomains.some((d) => d.toLowerCase().includes(q));
                          const matchIssuer = cert.issuer.toLowerCase().includes(q);
                          const matchCertPath = cert.certPath.toLowerCase().includes(q);
                          const matchVHosts = cert.associatedVHosts.some(
                            (s) =>
                              s.serverName.toLowerCase().includes(q) ||
                              s.definedInFile.toLowerCase().includes(q)
                          );
                          if (
                            !matchPrimary &&
                            !matchAll &&
                            !matchIssuer &&
                            !matchCertPath &&
                            !matchVHosts
                          ) {
                            return false;
                          }
                        }
                        return true;
                      });

                      if (filtered.length === 0) {
                        return (
                          <div className="p-6 text-center text-xs text-slate-400 font-mono">
                            {isEn
                              ? 'No certificates match current filter or search criteria.'
                              : 'گواهینامه‌ای با فیلتر یا عبارت جستجوی فعلی همخوانی ندارد.'}
                          </div>
                        );
                      }

                      return filtered.map((cert) => {
                        const isSelected = selectedCert?.id === cert.id;
                        return (
                          <div
                            key={cert.id}
                            onClick={() => setSelectedCert(cert)}
                            className={`p-3 rounded-xl border text-xs cursor-pointer transition relative ${
                              isSelected
                                ? isLightMode
                                  ? 'bg-amber-50/80 border-amber-500 shadow-sm'
                                  : 'bg-amber-950/20 border-amber-500/80 shadow-md ring-1 ring-amber-500/30'
                                : isLightMode
                                ? 'bg-white border-slate-200 hover:border-slate-300'
                                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`p-1.5 rounded-lg shrink-0 ${
                                    cert.status === 'valid'
                                      ? 'bg-emerald-500/10 text-emerald-400'
                                      : cert.status === 'expiring_soon'
                                      ? 'bg-amber-500/10 text-amber-400'
                                      : 'bg-rose-500/10 text-rose-400'
                                  }`}
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                  <div className="font-bold font-mono text-sm text-slate-200 flex items-center gap-1.5">
                                    <span>{cert.primaryDomain}</span>
                                    {cert.isWildcard && (
                                      <span className="text-[9px] px-1 py-0.2 rounded font-sans font-bold bg-purple-500/15 text-purple-300 border border-purple-500/20">
                                        Wildcard
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-400 truncate max-w-[220px]">
                                    {cert.issuer}
                                  </div>
                                </div>
                              </div>

                              {/* Status Badge */}
                              <div className="shrink-0 text-right">
                                {cert.status === 'valid' && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>{cert.daysRemaining}d</span>
                                  </span>
                                )}
                                {cert.status === 'expiring_soon' && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 text-amber-400 animate-pulse" />
                                    <span>{cert.daysRemaining}d left</span>
                                  </span>
                                )}
                                {cert.status === 'expired' && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 inline-flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    <span>Expired</span>
                                  </span>
                                )}
                                {cert.status === 'missing' && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                    Missing
                                  </span>
                                )}
                                {cert.status === 'unreadable' && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                    Error
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Secondary Attributes */}
                            <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[10px] ${
                                    cert.isSelfSigned
                                      ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                                      : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                                  }`}
                                >
                                  {cert.isSelfSigned ? 'Self-Signed' : 'Public CA'}
                                </span>
                                {cert.keyExists && (
                                  <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                                    <Key className="w-2.5 h-2.5" />
                                    <span>Key OK</span>
                                  </span>
                                )}
                                <span className="text-[9px] px-1 rounded bg-slate-800 text-slate-400 uppercase">
                                  {cert.sourceType === 'letsencrypt_storage'
                                    ? "Let's Encrypt"
                                    : cert.sourceType === 'configured_vhost'
                                    ? 'VirtualHost'
                                    : 'System'}
                                </span>
                              </div>
                              <span className="text-slate-400">
                                {isEn
                                  ? `${cert.associatedVHosts.length} vhost(s)`
                                  : `${cert.associatedVHosts.length} هاست`}
                              </span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* Right Column: Selected Certificate Detailed Inspector */}
                  <div
                    className={`lg:col-span-7 rounded-xl border p-4 sm:p-5 space-y-4 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    {selectedCert ? (
                      <div className="space-y-4">
                        {/* Domain Header & Main Badges */}
                        <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                              <h4 className="text-base font-bold font-mono text-slate-100">
                                {selectedCert.primaryDomain}
                              </h4>
                            </div>
                            <p className="text-xs text-slate-400 font-mono mt-1">
                              Subject: <span className="text-slate-300">{selectedCert.subject}</span>
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                                selectedCert.status === 'valid'
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : selectedCert.status === 'expiring_soon'
                                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                  : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {selectedCert.status === 'valid' &&
                                (isEn
                                  ? `Valid (${selectedCert.daysRemaining} days left)`
                                  : `معتبر (${selectedCert.daysRemaining} روز مانده)`)}
                              {selectedCert.status === 'expiring_soon' &&
                                (isEn
                                  ? `Expires soon (${selectedCert.daysRemaining} days left)`
                                  : `در آستانه انقضا (${selectedCert.daysRemaining} روز مانده)`)}
                              {selectedCert.status === 'expired' &&
                                (isEn
                                  ? `Expired (${Math.abs(selectedCert.daysRemaining)} days ago)`
                                  : `منقضی شده (${Math.abs(selectedCert.daysRemaining)} روز پیش)`)}
                              {selectedCert.status === 'missing' &&
                                (isEn ? 'Certificate Missing' : 'فایل گواهینامه یافت نشد')}
                              {selectedCert.status === 'unreadable' &&
                                (isEn ? 'Unreadable Certificate' : 'گواهینامه غیرقابل خواندن')}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-mono ${
                                selectedCert.isSelfSigned
                                  ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                  : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              }`}
                            >
                              {selectedCert.isSelfSigned
                                ? isEn
                                  ? 'Self-Signed'
                                  : 'گواهینامه خودامضا'
                                : isEn
                                ? 'Public CA'
                                : 'مرجع رسمی (CA)'}
                            </span>
                          </div>
                        </div>

                        {/* Validity Countdown Bar */}
                        <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 space-y-2">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="text-slate-400 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span>
                                {isEn ? 'Certificate Validity Lifecycle' : 'چرخه اعتبار زمانی گواهینامه'}
                              </span>
                            </span>
                            <span className="font-bold text-slate-200">
                              {selectedCert.daysRemaining > 0
                                ? isEn
                                  ? `${selectedCert.daysRemaining} days remaining`
                                  : `${selectedCert.daysRemaining} روز باقیمانده`
                                : isEn
                                ? `Expired on ${selectedCert.validTo}`
                                : `در تاریخ ${selectedCert.validTo} منقضی شده`}
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                selectedCert.daysRemaining > 60
                                  ? 'bg-emerald-500'
                                  : selectedCert.daysRemaining > 30
                                  ? 'bg-teal-500'
                                  : selectedCert.daysRemaining > 15
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                              }`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(
                                    5,
                                    (selectedCert.daysRemaining /
                                      (selectedCert.isSelfSigned ? 365 : 90)) *
                                      100
                                  )
                                )}%`,
                              }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-0.5">
                            <span>
                              From:{' '}
                              <strong className="text-slate-300">
                                {selectedCert.validFrom || 'Unknown'}
                              </strong>
                            </span>
                            <span>
                              To:{' '}
                              <strong className="text-slate-300">
                                {selectedCert.validTo || 'Unknown'}
                              </strong>
                            </span>
                          </div>
                        </div>

                        {/* Subject Alternative Names (SANs) */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-400 uppercase font-sans">
                              {isEn
                                ? 'Protected Domains & SANs (Subject Alternative Names)'
                                : 'دامنه‌های تحت پوشش گواهینامه (SANs)'}
                            </span>
                            <FieldInfoTooltip
                              fieldName="Subject Alternative Names (SANs)"
                              infoWhatEn="An extension to X.509 that allows multiple domain names, subdomains, or IP addresses to be protected under a single SSL certificate."
                              infoWhatFa="قابلیتی در گواهینامه X.509 که امکان پوشش و حفاظت از چندین دامنه، ساب‌دامین یا IP را در یک گواهینامه واحد فراهم می‌کند."
                              infoWhyEn="Enables multi-domain and wildcard (*.domain.com) SSL protection without requiring distinct certificates and IP addresses per host."
                              infoWhyFa="امکان پوشش چندین دامنه و وایلدکارد (*.domain.com) را بدون نیاز به تهیه گواهینامه‌های مجزا و IPهای جداگانه فراهم می‌سازد."
                              infoExampleEn="DNS:example.com, DNS:www.example.com, DNS:api.example.com"
                              infoExampleFa="DNS:example.com, DNS:www.example.com, DNS:api.example.com"
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {selectedCert.allDomains.length > 0 ? (
                              selectedCert.allDomains.map((domain, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-1 rounded-lg text-xs font-mono bg-slate-950/70 border border-slate-800 text-cyan-300 flex items-center gap-1"
                                >
                                  <Globe className="w-3 h-3 text-cyan-400" />
                                  <span>{domain}</span>
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-500 italic font-mono">
                                {isEn
                                  ? 'No SAN entries found (Single CN domain)'
                                  : 'فاقد ورودی SAN (تک دامنه CN)'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Issuer & Authority */}
                        <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 space-y-1">
                          <span className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                            {isEn
                              ? 'Issuer / Certificate Authority (CA)'
                              : 'مرجع صادرکننده گواهینامه (CA)'}
                          </span>
                          <div className="text-xs font-mono text-slate-200">
                            {selectedCert.issuer}
                          </div>
                        </div>

                        {/* File Paths & Key Security Notice */}
                        <div className="space-y-2">
                          <span className="text-[11px] font-bold text-slate-400 uppercase font-sans">
                            {isEn
                              ? 'Storage Filesystem Paths & Key Verification'
                              : 'مسیر فایل‌های ذخیره‌شده و تایید کلید خصوصی'}
                          </span>

                          {/* Certificate Path */}
                          <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-950/70 flex items-center justify-between gap-2 text-xs font-mono">
                            <div className="flex items-center gap-2 truncate">
                              <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span className="text-slate-400 text-[11px]">
                                SSLCertificateFile:
                              </span>
                              <span className="text-slate-200 font-bold truncate">
                                {selectedCert.certPath}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleCopyCertText(selectedCert.certPath, `cert-${selectedCert.id}`)
                              }
                              className="p-1 rounded text-slate-400 hover:text-slate-200 cursor-pointer shrink-0 transition"
                              title={isEn ? 'Copy Certificate Path' : 'کپی مسیر گواهینامه'}
                            >
                              {copiedCertText === `cert-${selectedCert.id}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          {/* Private Key Path */}
                          {selectedCert.keyPath && (
                            <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-950/70 flex items-center justify-between gap-2 text-xs font-mono">
                              <div className="flex items-center gap-2 truncate">
                                <Key
                                  className={`w-4 h-4 shrink-0 ${
                                    selectedCert.keyExists ? 'text-amber-400' : 'text-rose-400'
                                  }`}
                                />
                                <span className="text-slate-400 text-[11px]">
                                  SSLCertificateKeyFile:
                                </span>
                                <span className="text-slate-200 font-bold truncate">
                                  {selectedCert.keyPath}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span
                                  className={`text-[10px] px-1.5 py-0.2 rounded font-sans font-bold ${
                                    selectedCert.keyExists
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                  }`}
                                >
                                  {selectedCert.keyExists ? 'Exists' : 'Missing'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopyCertText(selectedCert.keyPath!, `key-${selectedCert.id}`)
                                  }
                                  className="p-1 rounded text-slate-400 hover:text-slate-200 cursor-pointer transition"
                                  title={isEn ? 'Copy Key Path' : 'کپی مسیر کلید خصوصی'}
                                >
                                  {copiedCertText === `key-${selectedCert.id}` ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Chain File Path if present */}
                          {selectedCert.chainPath && (
                            <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-950/70 flex items-center justify-between gap-2 text-xs font-mono">
                              <div className="flex items-center gap-2 truncate">
                                <FolderTree className="w-4 h-4 text-purple-400 shrink-0" />
                                <span className="text-slate-400 text-[11px]">
                                  SSLCertificateChainFile:
                                </span>
                                <span className="text-slate-200 font-bold truncate">
                                  {selectedCert.chainPath}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Strict Zero-Leak Notice */}
                          <div
                            className={`p-2.5 rounded-lg border flex items-center gap-2 text-[11px] ${
                              isLightMode
                                ? 'bg-slate-50 border-slate-200 text-slate-600'
                                : 'bg-slate-950/40 border-slate-800 text-slate-400'
                            }`}
                          >
                            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>
                              {isEn
                                ? 'Zero-Leak Security Protocol: Private key presence on disk is verified; key data is never exposed or transferred.'
                                : 'استاندارد امنیتی عدم افشای کلید: وجود فایل کلید خصوصی روی دیسک تایید شده است؛ محتوای کلید هرگز خوانده یا به مرورگر ارسال نمی‌شود.'}
                            </span>
                          </div>
                        </div>

                        {/* Technical Fingerprint & Serial */}
                        {(selectedCert.serialNumber || selectedCert.fingerprintSha256) && (
                          <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 space-y-1.5 text-xs font-mono">
                            <span className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                              {isEn ? 'Cryptographic Fingerprints' : 'اثرانگشت و مشخصات رمزنگاری'}
                            </span>
                            {selectedCert.serialNumber && (
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-400">Serial:</span>
                                <span className="text-slate-300 font-bold truncate max-w-[280px]">
                                  {selectedCert.serialNumber}
                                </span>
                              </div>
                            )}
                            {selectedCert.fingerprintSha256 && (
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-400">SHA-256:</span>
                                <span className="text-slate-300 truncate max-w-[280px] text-[10px]">
                                  {selectedCert.fingerprintSha256}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Associated Apache VirtualHosts */}
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-bold text-slate-400 uppercase font-sans">
                            {isEn
                              ? 'Associated Apache VirtualHosts'
                              : 'هاست‌های مجازی متصل به این گواهینامه در آپاچی'}
                          </span>
                          {selectedCert.associatedVHosts.length === 0 ? (
                            <div className="text-xs text-slate-500 italic font-mono p-2">
                              {isEn
                                ? 'Discovered in storage or system pool; not currently bound to any active VirtualHost.'
                                : 'در مخزن دیسک یا سیستم کشف شده است؛ در حال حاضر به هیچ هاست مجازی متصل نیست.'}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {selectedCert.associatedVHosts.map((vh, idx) => (
                                <div
                                  key={idx}
                                  className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 space-y-2 text-xs font-mono"
                                >
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                      <Server className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                      <span className="text-slate-200 font-bold">
                                        {vh.serverName}
                                      </span>
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                                        Port: {vh.port}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 truncate max-w-[220px]">
                                      {vh.definedInFile}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60 flex-wrap text-[11px]">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`px-1.5 py-0.2 rounded text-[10px] ${
                                          vh.sslEngine
                                            ? 'bg-emerald-500/10 text-emerald-400'
                                            : 'bg-slate-800 text-slate-400'
                                        }`}
                                      >
                                        SSLEngine: {vh.sslEngine ? 'ON' : 'OFF'}
                                      </span>
                                      <span
                                        className={`px-1.5 py-0.2 rounded text-[10px] ${
                                          vh.h2Enabled
                                            ? 'bg-cyan-500/10 text-cyan-400'
                                            : 'bg-slate-800 text-slate-400'
                                        }`}
                                      >
                                        HTTP/2: {vh.h2Enabled ? 'Active' : 'Disabled'}
                                      </span>
                                      <span
                                        className={`px-1.5 py-0.2 rounded text-[10px] ${
                                          vh.hstsEnabled
                                            ? 'bg-purple-500/10 text-purple-400'
                                            : 'bg-slate-800 text-slate-400'
                                        }`}
                                      >
                                        HSTS: {vh.hstsEnabled ? 'Enforced' : 'Off'}
                                      </span>
                                    </div>

                                    {vh.vhostId !== 'global-apache-ssl' && (
                                      <button
                                        type="button"
                                        onClick={() => handleApplyModernProfile(vh.vhostId)}
                                        disabled={applyingProfileVHostId === vh.vhostId}
                                        className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold cursor-pointer transition"
                                      >
                                        {applyingProfileVHostId === vh.vhostId ? (
                                          <RefreshCw className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <Shield className="w-3 h-3" />
                                        )}
                                        <span>
                                          {isEn
                                            ? 'Apply Modern Profile (TLS 1.2/1.3)'
                                            : 'اعمال پروفایل مدرن (TLS 1.2/1.3)'}
                                        </span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="py-12 text-center text-xs text-slate-400 font-mono">
                        {isEn
                          ? 'Select a certificate from the left list to view detailed cryptographic properties.'
                          : 'برای مشاهده مشخصات رمزنقاری، یک گواهینامه را از لیست سمت چپ انتخاب کنید.'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PLACEHOLDERS FOR FUTURE PHASES */}
          {activeTab !== 'overview' &&
            activeTab !== 'topology' &&
            activeTab !== 'vhosts' &&
            activeTab !== 'proxy' &&
            activeTab !== 'modules' &&
            activeTab !== 'ssl' && (
              <div
                className={`p-8 rounded-xl border text-center flex flex-col items-center justify-center space-y-3 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  {activeTab === 'logs' && <FileText className="w-7 h-7" />}
                  {activeTab === 'config' && <FileCode className="w-7 h-7" />}
                </div>
                <h3 className="font-bold text-base">
                  {activeTab === 'logs' &&
                    (isEn
                      ? 'Access & Error Logs Discovery (Phase 8)'
                      : 'کشف و تحلیل لاگ‌های دسترسی و خطا (فاز ۸)')}
                  {activeTab === 'config' &&
                    (isEn
                      ? 'Safe Configuration Editor with Rollback (Phase 10)'
                      : 'ویرایشگر امن کانفیگ با رول‌بک خودکار (فاز ۱۰)')}
                </h3>
                <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                  {isEn
                    ? 'Phases 1-7 have delivered Entry Point, Discovery, Topology, Virtual Hosts, Reverse Proxy, Modules & MPM, and SSL/TLS Engine. This module will be developed in its planned phase using authentic live data from the connected Linux server.'
                    : 'فازهای ۱ تا ۷ ورودی، کشف زنده، توپولوژی کانفیگ، هاست‌های مجازی، پروکسی معکوس، مدیریت ماژول‌ها و MPM و موتور سرتیفیکیت SSL آپاچی را مستقر ساخته‌اند. این ماژول در فاز برنامه‌ریزی‌شده با داده‌های واقعی سرور توسعه خواهد یافت.'}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('ssl')}
                  className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold cursor-pointer transition"
                >
                  {isEn ? 'Return to SSL Engine' : 'بازگشت به موتور SSL'}
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

      {/* ======================================================== */}
      {/* 7. INSPECT REVERSE PROXY ROUTE MODAL (Portal)            */}
      {/* ======================================================== */}
      {inspectProxyRoute &&
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
                    {inspectProxyRoute.path} → {inspectProxyRoute.target}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectProxyRoute(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 flex-1 overflow-y-auto space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-400 text-[11px] pb-1 border-b border-slate-800">
                  <span>
                    {inspectProxyRoute.definedInFile}
                    {inspectProxyRoute.lineStart ? `:${inspectProxyRoute.lineStart}` : ''}
                  </span>
                  {inspectProxyRoute.rawSnippet && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(inspectProxyRoute.rawSnippet!)}
                      className="flex items-center gap-1 text-amber-400 hover:underline cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Copy Directive' : 'کپی دایرکتیو'}</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="p-2 rounded bg-black/40 border border-slate-800">
                    <span className="text-slate-400 block">{isEn ? 'Protocol' : 'پروتکل'}</span>
                    <span className="font-bold text-amber-300 uppercase">{inspectProxyRoute.protocol}</span>
                  </div>
                  <div className="p-2 rounded bg-black/40 border border-slate-800">
                    <span className="text-slate-400 block">{isEn ? 'WebSocket' : 'وب‌سوکت'}</span>
                    <span className="font-bold text-emerald-300">
                      {inspectProxyRoute.websocketEnabled ? (isEn ? 'Enabled' : 'فعال') : (isEn ? 'Disabled' : 'غیرفعال')}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-black/40 border border-slate-800">
                    <span className="text-slate-400 block">{isEn ? 'Preserve Host' : 'حفظ هدر هاست'}</span>
                    <span className="font-bold text-cyan-300">
                      {inspectProxyRoute.preserveHost ? 'On' : 'Off'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-black/40 border border-slate-800">
                    <span className="text-slate-400 block">{isEn ? 'SSL Backend' : 'بک‌اند امن'}</span>
                    <span className="font-bold text-purple-300">
                      {inspectProxyRoute.sslBackend ? 'SSLProxyEngine' : 'Plain'}
                    </span>
                  </div>
                </div>

                {inspectProxyRoute.rawSnippet ? (
                  <pre className="p-3 rounded-lg bg-black/60 text-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
                    {inspectProxyRoute.rawSnippet}
                  </pre>
                ) : (
                  <div className="p-4 text-center text-slate-400">
                    {isEn ? 'No raw snippet captured.' : 'کد خامی ثبت نشده است.'}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ======================================================== */}
      {/* 8. INSPECT BALANCER POOL MODAL (Portal)                  */}
      {/* ======================================================== */}
      {inspectBalancer &&
        createPortal(
          <div className="fixed inset-0 z-[999995] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div
              className={`w-full max-w-3xl max-h-[85vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl ${
                isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            >
              <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
                <div className="flex items-center gap-2">
                  <Network className="w-5 h-5 text-purple-400" />
                  <span className="font-bold text-sm font-mono">
                    balancer://{inspectBalancer.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectBalancer(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 flex-1 overflow-y-auto space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-400 text-[11px] pb-1 border-b border-slate-800">
                  <span>{inspectBalancer.definedInFile}</span>
                  {inspectBalancer.rawSnippet && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(inspectBalancer.rawSnippet)}
                      className="flex items-center gap-1 text-purple-400 hover:underline cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Copy Configuration' : 'کپی کانفیگ'}</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded bg-black/40 border border-slate-800">
                    <span className="text-slate-400 block">{isEn ? 'Balancing Algorithm' : 'الگوریتم توزیع بار'}</span>
                    <span className="font-bold text-purple-300 uppercase">{inspectBalancer.algorithm}</span>
                  </div>
                  <div className="p-2 rounded bg-black/40 border border-slate-800">
                    <span className="text-slate-400 block">{isEn ? 'Active Cluster Nodes' : 'تعداد اعضای کلاستر'}</span>
                    <span className="font-bold text-cyan-300">{inspectBalancer.members.length}</span>
                  </div>
                </div>

                <pre className="p-3 rounded-lg bg-black/60 text-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
                  {inspectBalancer.rawSnippet}
                </pre>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ======================================================== */}
      {/* 9. CREATE REVERSE PROXY WIZARD MODAL (Portal)            */}
      {/* ======================================================== */}
      {isCreateProxyOpen &&
        createPortal(
          <div className="fixed inset-0 z-[999995] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div
              className={`w-full max-w-2xl max-h-[90vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl ${
                isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            >
              <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-sm">
                    {isEn ? 'Deploy Apache Reverse Proxy Route' : 'استقرار مسیر پروکسی معکوس آپاچی'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateProxyOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateProxySubmit} className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
                {/* Route Path Input */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-400 flex items-center justify-between">
                    <span>{isEn ? 'Proxy Path Prefix' : 'پیشوند آدرس مسیر پروکسی'}</span>
                    <FieldInfoTooltip
                      fieldName="Proxy Path"
                      infoWhatEn="URL path pattern intercepted and proxied by Apache (e.g. / or /api or /ws)."
                      infoWhatFa="الگوی آدرس URL که توسط آپاچی شنود و به سرور بک‌اند هدایت می‌شود (مانند / یا /api)."
                      infoWhyEn="Maps incoming public request URLs to specific internal application services."
                      infoWhyFa="درخواست‌های بیرونی را به سرویس‌ها و پورت‌های برنامه‌های داخلی متصل می‌سازد."
                      infoExampleEn="/ or /api/v1"
                      infoExampleFa="/ یا /api/v1"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="/ or /api"
                    value={createProxyForm.path}
                    onChange={(e) => setCreateProxyForm({ ...createProxyForm, path: e.target.value })}
                    className={`w-full p-2.5 rounded-lg border font-mono ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900'
                        : 'bg-slate-900 border-slate-700 text-white'
                    }`}
                  />
                </div>

                {/* Target Type Radio */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-400 block">
                    {isEn ? 'Backend Routing Architecture' : 'معماری روتینگ سرور بک‌اند'}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCreateProxyForm({ ...createProxyForm, isBalancer: false })}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition flex items-start gap-2.5 ${
                        !createProxyForm.isBalancer
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-bold'
                          : 'border-slate-800 bg-slate-900/40 text-slate-400'
                      }`}
                    >
                      <ArrowUpRight className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                      <div>
                        <div>{isEn ? 'Single Backend Target' : 'سرور مقصد تکی'}</div>
                        <div className="text-[10px] opacity-75 font-normal">
                          {isEn ? 'Direct HTTP/HTTPS/WS destination' : 'اتصال مستقیم به آدرس مشخص (مانند 127.0.0.1:3000)'}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCreateProxyForm({ ...createProxyForm, isBalancer: true })}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition flex items-start gap-2.5 ${
                        createProxyForm.isBalancer
                          ? 'border-purple-500 bg-purple-500/15 text-purple-300 font-bold'
                          : 'border-slate-800 bg-slate-900/40 text-slate-400'
                      }`}
                    >
                      <Network className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                      <div>
                        <div>{isEn ? 'Load Balancer Cluster' : 'کلاستر توزیع بار (Balancer)'}</div>
                        <div className="text-[10px] opacity-75 font-normal">
                          {isEn ? 'mod_proxy_balancer pool with failover' : 'کلاسترینگ چندین سرور با بالانس هوشمند'}
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* If Single Backend */}
                {!createProxyForm.isBalancer ? (
                  <div className="space-y-1">
                    <label className="font-bold text-slate-400 flex items-center justify-between">
                      <span>{isEn ? 'Backend Destination URL' : 'آدرس کامل سرور بک‌اند'}</span>
                      <FieldInfoTooltip
                        fieldName="Backend Destination"
                        infoWhatEn="Internal network address and port where the application server listens."
                        infoWhatFa="آدرس شبکه داخلی و پورتی که برنامه وب در آن گوش فرا می‌دهد."
                        infoWhyEn="Instructs Apache where to transmit proxy requests via ProxyPass directive."
                        infoWhyFa="مشخص می‌کند آپاچی درخواست‌ها را به کدام سرور داخلی بفرستد."
                        infoExampleEn="http://127.0.0.1:3000 or https://internal.app:8443"
                        infoExampleFa="http://127.0.0.1:3000 یا https://internal.app:8443"
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="http://127.0.0.1:3000"
                      value={createProxyForm.backendUrl}
                      onChange={(e) => setCreateProxyForm({ ...createProxyForm, backendUrl: e.target.value })}
                      className={`w-full p-2.5 rounded-lg border font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    />
                  </div>
                ) : (
                  /* If Load Balancer Cluster */
                  <div className="space-y-3 p-3.5 rounded-xl border border-purple-500/30 bg-purple-500/5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="font-bold text-slate-400 block mb-1">
                          {isEn ? 'Cluster Identifier Name' : 'نام شناسه کلاستر (Balancer Name)'}
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="app_cluster"
                          value={createProxyForm.balancerName}
                          onChange={(e) => setCreateProxyForm({ ...createProxyForm, balancerName: e.target.value })}
                          className={`w-full p-2 rounded-lg border font-mono ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-900'
                              : 'bg-slate-900 border-slate-700 text-white'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-400 block mb-1">
                          {isEn ? 'Balancing Algorithm' : 'الگوریتم توزیع بار'}
                        </label>
                        <select
                          value={createProxyForm.balancerAlgorithm}
                          onChange={(e) =>
                            setCreateProxyForm({
                              ...createProxyForm,
                              balancerAlgorithm: e.target.value as any,
                            })
                          }
                          className={`w-full p-2 rounded-lg border font-mono ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-900'
                              : 'bg-slate-900 border-slate-700 text-white'
                          }`}
                        >
                          <option value="byrequests">byrequests (Request Counting)</option>
                          <option value="bytraffic">bytraffic (Bandwidth / Bytes)</option>
                          <option value="bybusyness">bybusyness (Least Active Connections)</option>
                        </select>
                      </div>
                    </div>

                    {/* Member List */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-300">
                          {isEn ? 'Balancer Member Nodes' : 'گره‌های عضو کلاستر'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const current = createProxyForm.balancerMembers || [];
                            setCreateProxyForm({
                              ...createProxyForm,
                              balancerMembers: [
                                ...current,
                                { url: `http://127.0.0.1:${8080 + current.length + 1}`, loadfactor: 1 },
                              ],
                            });
                          }}
                          className="text-[11px] text-amber-400 hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Add Member' : 'افزودن عضو'}</span>
                        </button>
                      </div>

                      {(createProxyForm.balancerMembers || []).map((m, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="http://127.0.0.1:8081"
                            value={m.url}
                            onChange={(e) => {
                              const updated = [...(createProxyForm.balancerMembers || [])];
                              updated[idx].url = e.target.value;
                              setCreateProxyForm({ ...createProxyForm, balancerMembers: updated });
                            }}
                            className={`flex-1 p-2 rounded-lg border font-mono ${
                              isLightMode
                                ? 'bg-white border-slate-300 text-slate-900'
                                : 'bg-slate-900 border-slate-700 text-white'
                            }`}
                          />
                          <div className="w-24 flex items-center gap-1">
                            <span className="text-[10px] text-slate-400">w:</span>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={m.loadfactor || 1}
                              onChange={(e) => {
                                const updated = [...(createProxyForm.balancerMembers || [])];
                                updated[idx].loadfactor = parseInt(e.target.value) || 1;
                                setCreateProxyForm({ ...createProxyForm, balancerMembers: updated });
                              }}
                              className={`w-full p-2 rounded-lg border font-mono text-center ${
                                isLightMode
                                  ? 'bg-white border-slate-300 text-slate-900'
                                  : 'bg-slate-900 border-slate-700 text-white'
                              }`}
                            />
                          </div>
                          {(createProxyForm.balancerMembers || []).length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = (createProxyForm.balancerMembers || []).filter((_, i) => i !== idx);
                                setCreateProxyForm({ ...createProxyForm, balancerMembers: updated });
                              }}
                              className="p-2 text-slate-400 hover:text-red-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Protocol & Connection Options */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <span className="font-bold text-slate-300 block">
                    {isEn ? 'Proxy Protocol & Performance Options' : 'تنظیمات پروتکل و عملکرد پروکسی'}
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* WebSocket */}
                    <div
                      className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition ${
                        createProxyForm.websocketSupport
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                          : 'border-slate-800 bg-slate-900/40 text-slate-400'
                      }`}
                      onClick={() =>
                        setCreateProxyForm({
                          ...createProxyForm,
                          websocketSupport: !createProxyForm.websocketSupport,
                        })
                      }
                    >
                      <input
                        type="checkbox"
                        checked={createProxyForm.websocketSupport}
                        onChange={() => {}}
                        className="mt-0.5 rounded text-emerald-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="font-bold flex items-center justify-between">
                          <span>{isEn ? 'WebSocket Support' : 'پشتیبانی وب‌سوکت'}</span>
                          <FieldInfoTooltip
                            fieldName="WebSocket Support"
                            infoWhatEn="Configures mod_proxy_wstunnel and HTTP Upgrade headers for duplex WebSocket connections."
                            infoWhatFa="ماژول mod_proxy_wstunnel و هدرهای ارتقای HTTP را برای ارتباطات دوطرفه وب‌سوکت تنظیم می‌کند."
                            infoWhyEn="Prevents socket disconnections and handshake failures in real-time apps."
                            infoWhyFa="از قطع شدن ارتباطات بلادرنگ وب‌سوکت و خطای عدم تطابق پروتکل جلوگیری می‌کند."
                            infoExampleEn="Enabled for Socket.io, ws, Live feeds"
                            infoExampleFa="فعال برای Socket.io و برنامه‌های چت و تلمتری"
                            isEn={isEn}
                            isLightMode={isLightMode}
                          />
                        </div>
                        <div className="text-[10px] opacity-75 font-normal">
                          {isEn ? 'Auto-wires mod_proxy_wstunnel & upgrade rules' : 'تنظیم خودکار قوانین ارتقای سوکت'}
                        </div>
                      </div>
                    </div>

                    {/* PreserveHost */}
                    <div
                      className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition ${
                        createProxyForm.preserveHost
                          ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                          : 'border-slate-800 bg-slate-900/40 text-slate-400'
                      }`}
                      onClick={() =>
                        setCreateProxyForm({
                          ...createProxyForm,
                          preserveHost: !createProxyForm.preserveHost,
                        })
                      }
                    >
                      <input
                        type="checkbox"
                        checked={createProxyForm.preserveHost}
                        onChange={() => {}}
                        className="mt-0.5 rounded text-amber-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="font-bold flex items-center justify-between">
                          <span>{isEn ? 'Preserve Original Host' : 'حفظ هدر اصلی هاست (Host)'}</span>
                          <FieldInfoTooltip
                            fieldName="ProxyPreserveHost"
                            infoWhatEn="Directs Apache to pass the incoming Host: header to the backend instead of rewriting it to the backend IP/host."
                            infoWhatFa="به آپاچی دستور می‌دهد هدر Host ورودی کاربر را دقیقاً به بک‌اند بفرستد و آن را با IP بک‌اند بازنویسی نکند."
                            infoWhyEn="Critical for virtual-hosted backends and correct SSL/domain routing."
                            infoWhyFa="برای برنامه‌هایی که نیاز به شناسایی دامنه دقیق کاربر دارند حیاتی است."
                            infoExampleEn="ProxyPreserveHost On"
                            infoExampleFa="ProxyPreserveHost On"
                            isEn={isEn}
                            isLightMode={isLightMode}
                          />
                        </div>
                        <div className="text-[10px] opacity-75 font-normal">
                          {isEn ? 'ProxyPreserveHost On' : 'ارسال دامنه درخواستی کاربر به بک‌اند'}
                        </div>
                      </div>
                    </div>

                    {/* SSL Backend */}
                    <div
                      className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition ${
                        createProxyForm.sslBackend
                          ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                          : 'border-slate-800 bg-slate-900/40 text-slate-400'
                      }`}
                      onClick={() =>
                        setCreateProxyForm({
                          ...createProxyForm,
                          sslBackend: !createProxyForm.sslBackend,
                        })
                      }
                    >
                      <input
                        type="checkbox"
                        checked={createProxyForm.sslBackend}
                        onChange={() => {}}
                        className="mt-0.5 rounded text-purple-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="font-bold flex items-center justify-between">
                          <span>{isEn ? 'SSL/TLS Backend Engine' : 'رمزنگاری بک‌اند با SSL/TLS'}</span>
                          <FieldInfoTooltip
                            fieldName="SSLProxyEngine"
                            infoWhatEn="Enables SSL/TLS encryption for communication between Apache and the backend server (https://)."
                            infoWhatFa="رمزنگاری امن SSL/TLS را برای ارتباط بین آپاچی و سرور مقصد فعال می‌سازد."
                            infoWhyEn="Required whenever the backend destination uses HTTPS or WSS."
                            infoWhyFa="زمانی که بک‌اند از پروتکل امن https استفاده می‌کند اجباری است."
                            infoExampleEn="SSLProxyEngine On"
                            infoExampleFa="SSLProxyEngine On"
                            isEn={isEn}
                            isLightMode={isLightMode}
                          />
                        </div>
                        <div className="text-[10px] opacity-75 font-normal">
                          {isEn ? 'SSLProxyEngine On' : 'ارتباط امن با سرور مقصد'}
                        </div>
                      </div>
                    </div>

                    {/* Auto-enable Modules */}
                    <div
                      className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition ${
                        createProxyForm.autoEnableModules !== false
                          ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                          : 'border-slate-800 bg-slate-900/40 text-slate-400'
                      }`}
                      onClick={() =>
                        setCreateProxyForm({
                          ...createProxyForm,
                          autoEnableModules: createProxyForm.autoEnableModules === false ? true : false,
                        })
                      }
                    >
                      <input
                        type="checkbox"
                        checked={createProxyForm.autoEnableModules !== false}
                        onChange={() => {}}
                        className="mt-0.5 rounded text-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="font-bold">
                          {isEn ? 'Auto-Enable Missing Modules' : 'فعال‌سازی خودکار ماژول‌ها'}
                        </div>
                        <div className="text-[10px] opacity-75 font-normal">
                          {isEn
                            ? 'Detects and runs a2enmod before writing configuration'
                            : 'اجرای خودکار دستور a2enmod قبل از استقرار کانفیگ'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Timeouts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="font-bold text-slate-400 flex items-center justify-between mb-1">
                      <span>{isEn ? 'Read Timeout (seconds)' : 'مهلت خواندن پاسخ (Read Timeout)'}</span>
                      <FieldInfoTooltip
                        fieldName="Proxy Timeout"
                        infoWhatEn="Maximum time in seconds Apache waits for backend application to generate a response."
                        infoWhatFa="حداکثر زمانی که آپاچی منتظر پاسخ از برنامه بک‌اند می‌ماند."
                        infoWhyEn="Prevents hanging requests while accommodating long-running API calculations."
                        infoWhyFa="از باز ماندن بیهوده کانکشن‌ها در صورت قطعی سرور مقصد جلوگیری می‌کند."
                        infoExampleEn="60"
                        infoExampleFa="60 ثانیه"
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="600"
                      value={createProxyForm.timeout || 60}
                      onChange={(e) =>
                        setCreateProxyForm({ ...createProxyForm, timeout: parseInt(e.target.value) || 60 })
                      }
                      className={`w-full p-2 rounded-lg border font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-400 flex items-center justify-between mb-1">
                      <span>{isEn ? 'Connection Timeout (seconds)' : 'مهلت برقراری اتصال (Connect Timeout)'}</span>
                      <FieldInfoTooltip
                        fieldName="Connection Timeout"
                        infoWhatEn="Time Apache waits to establish TCP network handshake with backend host."
                        infoWhatFa="زمانی که آپاچی برای برقراری ارتباط TCP اولیه با بک‌اند منتظر می‌ماند."
                        infoWhyEn="Quickly fails over if backend port is closed or server is unreachable."
                        infoWhyFa="در صورت در دسترس نبودن پورت مقصد، بلافاصله خطا را مدیریت می‌کند."
                        infoExampleEn="10"
                        infoExampleFa="10 ثانیه"
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={createProxyForm.connectTimeout || 10}
                      onChange={(e) =>
                        setCreateProxyForm({ ...createProxyForm, connectTimeout: parseInt(e.target.value) || 10 })
                      }
                      className={`w-full p-2 rounded-lg border font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    />
                  </div>
                </div>

                {/* Submit Bar */}
                <div className="pt-4 border-t flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateProxyOpen(false)}
                    className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>
                  <button
                    type="submit"
                    disabled={creatingProxy}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer transition flex items-center gap-1.5"
                  >
                    {creatingProxy ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {creatingProxy
                        ? isEn
                          ? 'Validating & Deploying...'
                          : 'در حال اعتبارسنجی و استقرار...'
                        : isEn
                        ? 'Deploy Proxy Route'
                        : 'استقرار مسیر پروکسی'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* ======================================================== */}
      {/* 10. INSPECT APACHE MODULE MODAL (Portal)                 */}
      {/* ======================================================== */}
      {inspectModule &&
        createPortal(
          <div className="fixed top-0 left-0 right-0 bottom-8 z-[999995] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div
              className={`w-full max-w-xl max-h-[85vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl ${
                isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            >
              <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
                <div className="flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-amber-400" />
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm font-mono">
                      mod_{inspectModule.rawName}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({inspectModule.moduleSymbol || `${inspectModule.rawName}_module`})
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectModule(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs font-sans">
                {/* Status & Type Bar */}
                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold uppercase ${
                        inspectModule.status === 'loaded'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : inspectModule.status === 'disabled'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-slate-700/40 text-slate-400'
                      }`}
                    >
                      {inspectModule.status === 'loaded'
                        ? isEn
                          ? 'Loaded (Active)'
                          : 'بارگذاری‌شده (فعال)'
                        : inspectModule.status === 'disabled'
                        ? isEn
                          ? 'Disabled'
                          : 'غیرفعال'
                        : isEn
                        ? 'Available'
                        : 'در دسترس'}
                    </span>

                    <span className="text-[10px] px-2 py-0.5 rounded font-mono uppercase bg-slate-800 text-slate-300">
                      {inspectModule.type === 'static' ? 'Static (in-binary)' : 'Dynamic Shared (.so)'}
                    </span>

                    <span className="text-[10px] px-2 py-0.5 rounded font-mono uppercase bg-amber-500/20 text-amber-300">
                      {inspectModule.category}
                    </span>
                  </div>

                  <span className="text-slate-400 text-[11px] font-mono">
                    {inspectModule.filename || `mod_${inspectModule.rawName}.so`}
                  </span>
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <span className="font-bold text-slate-400 block">
                    {isEn ? 'Module Purpose & Architecture:' : 'کاربرد و معماری ماژول:'}
                  </span>
                  <p className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-200 leading-relaxed">
                    {isEn ? inspectModule.descriptionEn : inspectModule.descriptionFa}
                  </p>
                </div>

                {/* Directives Section */}
                {inspectModule.requiredByDirectives && inspectModule.requiredByDirectives.length > 0 && (
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 block">
                      {isEn ? 'Directives Provided / Dependent in Configuration:' : 'دایرکتیوهای وابسته در پیکربندی:'}
                    </span>
                    <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800 font-mono text-[11px]">
                      {inspectModule.requiredByDirectives.map((dir, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-black/50 text-cyan-300 border border-slate-800">
                          {dir}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Required by Config Notice */}
                {inspectModule.isRequiredByConfig && (
                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 flex items-start gap-2.5">
                    <CheckSquare className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">
                        {isEn ? 'Essential Configuration Dependency' : 'وابستگی حیاتی به این ماژول در کانفیگ'}
                      </div>
                      <div className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                        {isEn
                          ? 'This module is actively invoked by directives in your VirtualHosts or server config files. Disabling it will cause Apache syntax validation to fail!'
                          : 'این ماژول توسط دایرکتیوهای فعال در VirtualHostها یا فایل‌های پیکربندی فراخوانی شده است. در صورت غیرفعال‌سازی، اعتبارسنجی سینتکس آپاچی خطا خواهد داد.'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Source File */}
                {inspectModule.sourceConfigPath && (
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 block font-mono text-[11px]">
                      {isEn ? 'LoadModule Configuration Source:' : 'مسیر فایل فراخوانی LoadModule:'}
                    </span>
                    <div className="p-2.5 rounded-lg bg-black/50 border border-slate-800 font-mono text-[11px] text-slate-300 break-all">
                      {inspectModule.sourceConfigPath}
                    </div>
                  </div>
                )}

                {/* Actions Bar */}
                <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setInspectModule(null)}
                    className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {isEn ? 'Close' : 'بستن'}
                  </button>

                  {!['core', 'so', 'http', 'authz_core'].includes(inspectModule.rawName) &&
                    inspectModule.category !== 'mpm' && (
                      <div>
                        {inspectModule.status === 'loaded' ? (
                          <button
                            type="button"
                            onClick={() => {
                              const target = inspectModule;
                              setInspectModule(null);
                              handleToggleModuleAction(target, 'disable');
                            }}
                            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold cursor-pointer transition flex items-center gap-1.5"
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>{isEn ? 'Disable Module' : 'غیرفعال‌سازی ماژول'}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const target = inspectModule;
                              setInspectModule(null);
                              handleToggleModuleAction(target, 'enable');
                            }}
                            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer transition flex items-center gap-1.5"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{isEn ? 'Enable Module' : 'فعال‌سازی ماژول'}</span>
                          </button>
                        )}
                      </div>
                    )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ======================================================== */}
      {/* 11. SWITCH APACHE MPM MODAL (Portal)                     */}
      {/* ======================================================== */}
      {isSwitchMpmOpen &&
        createPortal(
          <div className="fixed top-0 left-0 right-0 bottom-8 z-[999995] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div
              className={`w-full max-w-xl max-h-[85vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl ${
                isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            >
              <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-sm">
                    {isEn ? 'Switch Apache MPM Architecture' : 'تغییر مدل چندپردازشی (MPM) آپاچی'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSwitchMpmOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSwitchMpmSubmit} className="p-5 flex-1 overflow-y-auto space-y-4 text-xs font-sans">
                <p className="text-slate-300 leading-relaxed">
                  {isEn
                    ? 'The Multi-Processing Module (MPM) defines how Apache binds to network ports, handles incoming HTTP/WebSocket connections, and dispatches workers.'
                    : 'مدل چندپردازشی (MPM) نحوه اتصال به پورت‌های شبکه، مدیریت کانکشن‌های HTTP و وب‌سوکت و توزیع پردازه‌ها و تردها در آپاچی را تعیین می‌کند.'}
                </p>

                {/* 3 MPM Selection Cards */}
                <div className="space-y-2.5">
                  {[
                    {
                      id: 'event',
                      title: 'Event MPM (Recommended)',
                      titleFa: 'مدل Event (پیشنهادی و مدرن)',
                      badge: 'Async / High Load',
                      descEn:
                        'Asynchronous listener threads handle Keep-Alive and idle connections. Ideal for high traffic, HTTP/2, WebSocket, and modern PHP via PHP-FPM.',
                      descFa:
                        'تردهای ناهمگام کانکشن‌های باز را بدون مشغول کردن ورکرها مدیریت می‌کنند. بهترین گزینه برای ترافیک بالا، HTTP/2، وب‌سوکت و PHP-FPM.',
                    },
                    {
                      id: 'worker',
                      title: 'Worker MPM',
                      titleFa: 'مدل Worker',
                      badge: 'Hybrid Multi-Thread',
                      descEn:
                        'Multi-process, multi-threaded hybrid model. Low RAM footprint and predictable scaling with fixed thread pools.',
                      descFa:
                        'معماری ترکیبی چندپردازشی و چندتردی با مصرف بهینه حافظه رم و استخرهای ترد معین.',
                    },
                    {
                      id: 'prefork',
                      title: 'Prefork MPM',
                      titleFa: 'مدل Prefork (سنتی / تک‌تردی)',
                      badge: 'Process-Isolated',
                      descEn:
                        'Single-threaded separate processes. Higher RAM usage, but required if using non-thread-safe Apache extensions such as embedded mod_php.',
                      descFa:
                        'پردازه‌های مجزا بدون ترد؛ مصرف رم بالاتر، اما اجباری برای کتابخانه‌ها و ماژول‌های فاقد Thread-Safety (مانند mod_php قدیمی).',
                    },
                  ].map((mpmOpt) => (
                    <div
                      key={mpmOpt.id}
                      onClick={() => setTargetMpm(mpmOpt.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition flex items-start gap-3 ${
                        targetMpm === mpmOpt.id
                          ? 'border-amber-500 bg-amber-500/15 shadow-md'
                          : isLightMode
                          ? 'border-slate-200 bg-white hover:border-slate-400'
                          : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="apacheMpmRadio"
                        value={mpmOpt.id}
                        checked={targetMpm === mpmOpt.id}
                        onChange={() => setTargetMpm(mpmOpt.id)}
                        className="mt-1 text-amber-500 cursor-pointer"
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-slate-100">
                            {isEn ? mpmOpt.title : mpmOpt.titleFa}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300">
                            {mpmOpt.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                          {isEn ? mpmOpt.descEn : mpmOpt.descFa}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Safety Warning */}
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">
                      {isEn ? 'Automatic Verification & Safe Restart' : 'اعتبارسنجی خودکار و ری‌استارت ایمن'}
                    </div>
                    <div className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                      {isEn
                        ? 'Changing MPM requires restarting the Apache daemon. The engine will run a syntax check (`apachectl -t`) first; if any error is detected, changes are immediately rolled back without interrupting service.'
                        : 'تغییر مدل MPM نیازمند ری‌استارت سرویس آپاچی است. سیستم ابتدا تست سینتکس (`apachectl -t`) می‌گیرد؛ در صورت بروز هرگونه خطا، تغییرات بلافاصله به حالت اولیه بازگردانده می‌شوند.'}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSwitchMpmOpen(false)}
                    className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>

                  <button
                    type="submit"
                    disabled={switchingMpm}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer transition flex items-center gap-1.5 shadow-sm"
                  >
                    {switchingMpm ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {switchingMpm
                        ? isEn
                          ? 'Validating & Switching...'
                          : 'در حال اعتبارسنجی و تغییر...'
                        : isEn
                        ? 'Apply & Restart MPM'
                        : 'اعمال و ری‌استارت MPM'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* ======================================================== */}
      {/* 12. GENERATE SELF-SIGNED CERTIFICATE MODAL (Portal)      */}
      {/* ======================================================== */}
      {isGenerateSelfSignedOpen &&
        createPortal(
          <div className="fixed top-0 left-0 right-0 bottom-8 z-[999995] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div
              className={`w-full max-w-xl max-h-[85vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl ${
                isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            >
              <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-bold text-sm">
                    {isEn
                      ? 'Generate Self-Signed SSL Certificate'
                      : 'صدور و ایجاد گواهینامه امنیتی خودامضا (Self-Signed)'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsGenerateSelfSignedOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleGenerateSelfSignedSubmit} className="p-5 flex-1 overflow-y-auto space-y-4 text-xs font-sans">
                <p className="text-slate-300 leading-relaxed">
                  {isEn
                    ? 'Generates an authentic 2048-bit RSA X.509 certificate and private key directly on the remote Linux host using OpenSSL. The private key remains securely on the server.'
                    : 'صدور یک گواهینامه معتبر RSA 2048 بیتی استاندارد X.509 و کلید خصوصی مربوطه مستقیماً بر روی هاست لینوکسی سرور با استفاده از OpenSSL. کلید خصوصی با امنیت کامل روی سرور باقی می‌ماند.'}
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      {isEn ? 'Primary Domain / Hostname (CN) *' : 'نام دامنه اصلی یا هاست‌نیم (CN) *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={generateDomain}
                      onChange={(e) => setGenerateDomain(e.target.value)}
                      placeholder="e.g. app.mydomain.com or 192.168.1.100"
                      className={`w-full px-3 py-2 text-xs rounded-lg border font-mono transition focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-slate-100'
                      }`}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-slate-300 mb-1">
                        {isEn ? 'Validity (Days)' : 'مدت اعتبار (روز)'}
                      </label>
                      <input
                        type="number"
                        min="30"
                        max="3650"
                        value={generateDays}
                        onChange={(e) => setGenerateDays(parseInt(e.target.value) || 365)}
                        className={`w-full px-3 py-2 text-xs rounded-lg border font-mono transition focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-900'
                            : 'bg-slate-900 border-slate-700 text-slate-100'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-300 mb-1">
                        {isEn ? 'Country (2 letters)' : 'کد کشور (۲ حرفی)'}
                      </label>
                      <input
                        type="text"
                        maxLength={2}
                        value={generateCountry}
                        onChange={(e) => setGenerateCountry(e.target.value.toUpperCase())}
                        placeholder="US"
                        className={`w-full px-3 py-2 text-xs rounded-lg border font-mono transition focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-900'
                            : 'bg-slate-900 border-slate-700 text-slate-100'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-300 mb-1">
                        {isEn ? 'Organization' : 'سازمان / شرکت'}
                      </label>
                      <input
                        type="text"
                        value={generateOrg}
                        onChange={(e) => setGenerateOrg(e.target.value)}
                        placeholder="NetTopology"
                        className={`w-full px-3 py-2 text-xs rounded-lg border font-mono transition focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-900'
                            : 'bg-slate-900 border-slate-700 text-slate-100'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Optional auto-bind to VirtualHost */}
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      {isEn
                        ? 'Auto-Bind to VirtualHost (Optional)'
                        : 'اتصال خودکار به هاست مجازی (اختیاری)'}
                    </label>
                    <select
                      value={generateVHostId}
                      onChange={(e) => setGenerateVHostId(e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-lg border font-mono transition focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-slate-100'
                      }`}
                    >
                      <option value="">{isEn ? '-- Do not auto-bind (Save to /etc/ssl/ only) --' : '-- فقط در /etc/ssl/ ذخیره شود بدون اتصال --'}</option>
                      {vhostsSummary?.vhosts?.map((vh) => (
                        <option key={vh.id} value={vh.id}>
                          {vh.serverName} (Port: {vh.port} • {vh.definedInFile})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Storage note */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1 font-mono text-[11px] text-slate-300">
                  <div className="text-slate-400">
                    Cert Path: <span className="text-emerald-400">/etc/ssl/certs/apache-{generateDomain || '<domain>'}.crt</span>
                  </div>
                  <div className="text-slate-400">
                    Key Path: <span className="text-amber-400">/etc/ssl/private/apache-{generateDomain || '<domain>'}.key</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsGenerateSelfSignedOpen(false)}
                    className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>

                  <button
                    type="submit"
                    disabled={generatingCert || !generateDomain.trim()}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer transition flex items-center gap-1.5 shadow-sm"
                  >
                    {generatingCert ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {generatingCert
                        ? isEn
                          ? 'Generating via OpenSSL...'
                          : 'در حال صدور با OpenSSL...'
                        : isEn
                        ? 'Generate Certificate'
                        : 'صدور گواهینامه'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* ======================================================== */}
      {/* 13. ATTACH SSL CERTIFICATE TO VIRTUALHOST (Portal)        */}
      {/* ======================================================== */}
      {isAttachCertOpen &&
        createPortal(
          <div className="fixed top-0 left-0 right-0 bottom-8 z-[999995] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div
              className={`w-full max-w-xl max-h-[85vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl ${
                isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            >
              <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-sm">
                    {isEn
                      ? 'Attach SSL Certificate to Apache VirtualHost'
                      : 'اتصال گواهینامه SSL به هاست مجازی آپاچی'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAttachCertOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAttachSslSubmit} className="p-5 flex-1 overflow-y-auto space-y-4 text-xs font-sans">
                <p className="text-slate-300 leading-relaxed">
                  {isEn
                    ? 'Configures SSLEngine, SSLCertificateFile, SSLCertificateKeyFile, and optional HTTP/2 / HSTS on the selected VirtualHost with automatic pre-flight syntax verification.'
                    : 'پیکربندی دایرکتیوهای SSLEngine، SSLCertificateFile و SSLCertificateKeyFile و فعال‌سازی اختیاری HTTP/2 و HSTS بر روی هاست مجازی انتخابی با اعتبارسنجی خودکار سینتکس.'}
                </p>

                <div className="space-y-3">
                  {/* Select VirtualHost */}
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      {isEn ? 'Target VirtualHost *' : 'هاست مجازی هدف *'}
                    </label>
                    <select
                      required
                      value={attachVHostId}
                      onChange={(e) => setAttachVHostId(e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-lg border font-mono transition focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-slate-100'
                      }`}
                    >
                      <option value="">{isEn ? '-- Select a VirtualHost --' : '-- انتخاب یک هاست مجازی --'}</option>
                      {vhostsSummary?.vhosts?.map((vh) => (
                        <option key={vh.id} value={vh.id}>
                          {vh.serverName} (Port: {vh.port} • {vh.definedInFile})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quick Pick Certificate from Discovered */}
                  {sslData && sslData.certificates.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-slate-400 block font-mono">
                        {isEn ? 'Quick-Select from Discovered Certificates:' : 'انتخاب سریع از میان گواهینامه‌های کشف‌شده:'}
                      </span>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                        {sslData.certificates.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setAttachCertPath(c.certPath);
                              if (c.keyPath) setAttachKeyPath(c.keyPath);
                              if (c.chainPath) setAttachChainPath(c.chainPath);
                            }}
                            className="px-2 py-1 rounded bg-black/60 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-700 text-[10px] font-mono transition cursor-pointer flex items-center gap-1"
                          >
                            <FileCheck className="w-3 h-3 text-emerald-400" />
                            <span>{c.primaryDomain}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Certificate Path */}
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      {isEn ? 'SSLCertificateFile (Public Cert Path) *' : 'مسیر فایل گواهینامه عمومی (SSLCertificateFile) *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={attachCertPath}
                      onChange={(e) => setAttachCertPath(e.target.value)}
                      placeholder="/etc/letsencrypt/live/domain/fullchain.pem"
                      className={`w-full px-3 py-2 text-xs rounded-lg border font-mono transition focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-slate-100'
                      }`}
                    />
                  </div>

                  {/* Private Key Path */}
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      {isEn ? 'SSLCertificateKeyFile (Private Key Path) *' : 'مسیر فایل کلید خصوصی (SSLCertificateKeyFile) *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={attachKeyPath}
                      onChange={(e) => setAttachKeyPath(e.target.value)}
                      placeholder="/etc/letsencrypt/live/domain/privkey.pem"
                      className={`w-full px-3 py-2 text-xs rounded-lg border font-mono transition focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-slate-100'
                      }`}
                    />
                  </div>

                  {/* Optional Chain Path */}
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      {isEn ? 'SSLCertificateChainFile (Optional Intermediate CA)' : 'مسیر فایل زنجیره گواهینامه (اختیاری)'}
                    </label>
                    <input
                      type="text"
                      value={attachChainPath}
                      onChange={(e) => setAttachChainPath(e.target.value)}
                      placeholder="/etc/ssl/certs/chain.pem (optional)"
                      className={`w-full px-3 py-2 text-xs rounded-lg border font-mono transition focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-slate-100'
                      }`}
                    />
                  </div>

                  {/* Checkboxes for HTTP/2 and HSTS */}
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={attachEnableH2}
                        onChange={(e) => setAttachEnableH2(e.target.checked)}
                        className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                      />
                      <span className="font-semibold text-slate-200">
                        {isEn
                          ? 'Enable HTTP/2 Protocol (Protocols h2 http/1.1)'
                          : 'فعال‌سازی پروتکل پرسرعت HTTP/2'}
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={attachEnableHsts}
                        onChange={(e) => setAttachEnableHsts(e.target.checked)}
                        className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                      />
                      <span className="font-semibold text-slate-200">
                        {isEn
                          ? 'Enforce HSTS (Strict-Transport-Security Header)'
                          : 'اجبار هدر امنیتی HSTS'}
                      </span>
                    </label>
                  </div>
                </div>

                {/* Safety Rollback Notice */}
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">
                      {isEn ? 'Automatic Verification & Rollback' : 'اعتبارسنجی خودکار و رول‌بک ایمن'}
                    </div>
                    <div className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                      {isEn
                        ? 'Before restarting Apache, a syntax test (`apachectl -t`) is executed. If anything fails, configuration is rolled back immediately without downtime.'
                        : 'قبل از اعمال تغییرات، تست سینتکس (`apachectl -t`) انجام می‌گیرد و در صورت کوچکترین خطا، کانفیگ فوراً به حالت سالم اولیه رول‌بک می‌شود.'}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAttachCertOpen(false)}
                    className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>

                  <button
                    type="submit"
                    disabled={attachingCert || !attachVHostId || !attachCertPath.trim() || !attachKeyPath.trim()}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer transition flex items-center gap-1.5 shadow-sm"
                  >
                    {attachingCert ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {attachingCert
                        ? isEn
                          ? 'Validating & Attaching...'
                          : 'در حال بررسی و اتصال...'
                        : isEn
                        ? 'Attach SSL & Reload'
                        : 'اتصال SSL و اعمال'}
                    </span>
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
