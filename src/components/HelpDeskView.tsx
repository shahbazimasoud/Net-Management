import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  Headphones,
  ShieldCheck,
  Cpu,
  HardDrive,
  Activity,
  Network,
  Printer,
  RefreshCw,
  Search,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Globe,
  Play,
  RotateCcw,
  Trash2,
  FileCode2,
  Copy,
  Check,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Eraser,
  Server,
  FileWarning,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  FolderOpen,
  Wrench,
  PowerOff,
  Lightbulb,
  ShieldAlert,
  BatteryCharging,
  Battery,
  UserCheck,
  Power,
  FileCheck2,
  Clock,
  Monitor,
  PackageCheck,
  Ban,
  MoreVertical,
  Star,
  PlugZap,
  FolderPlus,
  FolderX,
  LogIn,
  LogOut,
  User,
  UserX,
  Unlock,
  History,
  ScrollText,
  Download,
  Route,
  FileText,
  Settings,
  Plus,
  Waypoints,
  Gpu,
  Volume2,
  KeyRound,
  Shield,
  CircuitBoard,
  MemoryStick,
  Usb,
  Camera,
  Bluetooth,
  Keyboard,
  Laptop,
  Fingerprint,
  Wifi,
} from 'lucide-react';
import { AccessPolicy } from '../types';
import { AuthUser } from '../context/AuthContext';
import { isUserSuperAdmin, isUserDomainAdmin } from '../utils/rbac';
import {
  fetchHelpdeskStatus,
  fetchHelpdeskEndpointHealth,
  fetchHelpdeskConnectionHistory,
  deleteHelpdeskConnectionHistoryItem,
  clearHelpdeskConnectionHistory,
  fetchHelpdeskNetworkSnapshot,
  runHelpdeskNetworkProbe,
  executeHelpdeskNetworkAction,
  updateHelpdeskAdapterNetworkConfig,
  manageHelpdeskHostsEntry,
  updateHelpdeskProxySettings,
  manageHelpdeskStaticRoute,
  manageHelpdeskVpnConnection,
  fetchHelpdeskPrinterStatus,
  executeHelpdeskPrinterAction,
  setHelpdeskDefaultPrinter,
  deleteHelpdeskPrinter,
  fetchHelpdeskEndpointShares,
  disconnectHelpdeskEndpointShare,
  fetchHelpdeskEndpointLogons,
  executeHelpdeskUserSessionAction,
  fetchHelpdeskEventLogs,
  terminateHelpdeskProcess,
  scanHelpdeskTemp,
  cleanHelpdeskTemp,
  fetchHelpdeskGpoStatus,
  runHelpdeskGpupdate,
  fetchHelpdeskSystemInfo,
  fetchHelpdeskUpdateStatus,
  installHelpdeskWindowsUpdates,
  uninstallHelpdeskHotfix,
  fetchHelpdeskPrograms,
  uninstallHelpdeskProgram,
  fetchHelpdeskHardwareInventory,
  fetchHelpdeskDiskHealth,
  executeHelpdeskSystemRepair,
  inspectHelpdeskDomainUser,
  executeHelpdeskPowerControl,
  fetchHelpdeskBatteryReport,
  HelpdeskConnectionPayload,
  HelpdeskConnectionHistoryItem,
  HelpdeskConnectionHistoryResponse,
} from '../services/api';
import {
  HelpdeskSubTab,
  HelpdeskRamState,
  getHelpdeskRamSnapshot,
  subscribeHelpdeskRam,
  patchHelpdeskRamSnapshot,
  bindHelpdeskRamOwner,
  stopHelpdeskPrefetch,
  wipeHelpdeskRamSession,
  runHelpdeskSequentialConnect,
} from '../services/helpdeskRamSession';
import { FieldInfoTooltip } from './common/FieldInfoTooltip';
import { useModalDock } from '../context/ModalDockContext';
import {
  DeleteConfirmModal,
  DeletePrinterTarget,
  DeleteNetworkShareTarget,
} from './DeleteConfirmModal';
import { PrintServerConnectModal } from './helpdesk/PrintServerConnectModal';
import { NetworkShareMapModal } from './helpdesk/NetworkShareMapModal';

interface HelpDeskViewProps {
  isLightMode: boolean;
  isEn: boolean;
  effectivePolicy?: AccessPolicy | null;
  currentUser?: AuthUser | null;
}

const PROCESS_PAGE_SIZE = 20;

interface CircularGaugeProps {
  value: number;
  label: string;
  primaryText: string;
  secondaryText: string;
  isLightMode: boolean;
  size?: number;
}

const CircularGauge: React.FC<CircularGaugeProps> = ({
  value,
  label,
  primaryText,
  secondaryText,
  isLightMode,
  size = 124,
}) => {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);

  const strokeColor =
    clamped >= 85 ? '#e11d48' : clamped >= 65 ? '#d97706' : '#0ea5e9';
  const stateLabelColor =
    clamped >= 85
      ? isLightMode
        ? 'text-rose-700'
        : 'text-rose-400'
      : clamped >= 65
      ? isLightMode
        ? 'text-amber-700'
        : 'text-amber-400'
      : isLightMode
      ? 'text-sky-700'
      : 'text-sky-400';

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={isLightMode ? '#e2e8f0' : '#1e293b'}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.45s cubic-bezier(0.16, 1, 0.3, 1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-xl font-bold font-mono tabular-nums ${stateLabelColor}`}>
            {clamped.toFixed(1)}%
          </span>
          <span className={`text-[11px] font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
            {label}
          </span>
        </div>
      </div>
      <div className={`mt-2.5 text-xs font-semibold font-mono tabular-nums ${isLightMode ? 'text-slate-900' : 'text-slate-100'}`}>
        {primaryText}
      </div>
      <div className={`text-[11px] truncate max-w-[200px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
        {secondaryText}
      </div>
    </div>
  );
};

const PROCESS_PALETTE = [
  '#0ea5e9', // sky
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#64748b', // slate (others)
];

export const HelpDeskView: React.FC<HelpDeskViewProps> = ({
  isLightMode,
  isEn,
  effectivePolicy,
  currentUser,
}) => {
  const { dockModal, undockModal } = useModalDock();
  const isSuper = isUserSuperAdmin(currentUser, effectivePolicy);
  const isDomainAdmin = isUserDomainAdmin(currentUser);
  const hasElevatedHelpdesk = isSuper || isDomainAdmin;

  // RBAC permissions (also double-checked by backend on every request)
  const canRunDiagnostics = Boolean(
    hasElevatedHelpdesk || (effectivePolicy?.canViewHelpdesk !== false && effectivePolicy?.canRunHelpdeskDiagnostics === true)
  );
  const canExecuteActions = Boolean(
    hasElevatedHelpdesk || (canRunDiagnostics && effectivePolicy?.canExecuteHelpdeskActions === true)
  );
  const canViewEventViewer = Boolean(
    hasElevatedHelpdesk || (canRunDiagnostics && effectivePolicy?.canViewHelpdeskEventViewer === true)
  );
  const canTerminateProcesses = Boolean(
    hasElevatedHelpdesk || (canExecuteActions && effectivePolicy?.canTerminateHelpdeskProcesses === true)
  );
  const canCleanTemp = Boolean(
    hasElevatedHelpdesk || (canExecuteActions && effectivePolicy?.canCleanHelpdeskTemp === true)
  );
  const canRunGpupdate = Boolean(
    hasElevatedHelpdesk || (canExecuteActions && effectivePolicy?.canRunHelpdeskGpupdate === true)
  );
  const canRunSystemRepair = Boolean(
    hasElevatedHelpdesk || (canExecuteActions && effectivePolicy?.canRunHelpdeskSystemRepair === true)
  );
  const canInspectDomainUsers = Boolean(
    hasElevatedHelpdesk || (canRunDiagnostics && effectivePolicy?.canInspectHelpdeskDomainUsers === true)
  );
  const canPowerControl = Boolean(
    hasElevatedHelpdesk || (canExecuteActions && effectivePolicy?.canPowerControlHelpdeskEndpoints === true)
  );

  // Volatile JS RAM-Only Session State (preserved across sidebar page navigation, NEVER stored in localStorage or DB!)
  const ram = useSyncExternalStore(subscribeHelpdeskRam, getHelpdeskRamSnapshot);
  const setRamField =
    <K extends keyof HelpdeskRamState>(key: K) =>
    (
      val:
        | HelpdeskRamState[K]
        | ((prev: HelpdeskRamState[K]) => HelpdeskRamState[K])
    ) => {
      patchHelpdeskRamSnapshot((prev) => ({
        [key]:
          typeof val === 'function'
            ? (val as (p: HelpdeskRamState[K]) => HelpdeskRamState[K])(prev[key])
            : val,
      }));
    };

  const targetIp = ram.targetIp;
  const setTargetIp = setRamField('targetIp');
  const protocol = ram.protocol;
  const setProtocol = setRamField('protocol');
  const customPort = ram.customPort;
  const setCustomPort = setRamField('customPort');
  const username = ram.username;
  const setUsername = setRamField('username');
  const password = ram.password;
  const setPassword = setRamField('password');
  const [showPassword, setShowPassword] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const [reconnectBanner, setReconnectBanner] = useState<{ targetIp: string; username: string } | null>(null);
  const jeaConfigName = ram.jeaConfigName;
  const setJeaConfigName = setRamField('jeaConfigName');
  const showAdvancedConn = ram.showAdvancedConn;
  const setShowAdvancedConn = setRamField('showAdvancedConn');

  // Active sub-workspace tab & sequential prefetch progress
  const activeSubTab = ram.activeSubTab;
  const setActiveSubTab = setRamField('activeSubTab');
  const prefetchProgress = ram.prefetchProgress;

  // Guardrail status & JEA templates from backend
  const rateLimit = ram.rateLimit;
  const setRateLimit = setRamField('rateLimit');
  const jeaTemplates = ram.jeaTemplates;
  const setJeaTemplates = setRamField('jeaTemplates');

  // JEA / GPO Hardening Modal (Universal Modal Rule 7)
  const [isJeaModalOpen, setIsJeaModalOpen] = useState(false);
  const [isJeaModalMaximized, setIsJeaModalMaximized] = useState(false);
  const [copiedJeaKey, setCopiedJeaKey] = useState<string | null>(null);

  // Module 1: Health & Processes state (backed by RAM store)
  const healthData = ram.healthData;
  const setHealthData = setRamField('healthData');
  const loadingHealth = ram.loadingHealth;
  const setLoadingHealth = setRamField('loadingHealth');
  const healthError = ram.healthError;
  const setHealthError = setRamField('healthError');
  const processSearch = ram.processSearch;
  const setProcessSearch = setRamField('processSearch');
  const processSort = ram.processSort;
  const setProcessSort = setRamField('processSort');
  const processSortDir = ram.processSortDir;
  const setProcessSortDir = setRamField('processSortDir');
  const processPage = ram.processPage;
  const setProcessPage = setRamField('processPage');
  const donutMetric = ram.donutMetric;
  const setDonutMetric = setRamField('donutMetric');
  const selectedProcessPid = ram.selectedProcessPid;
  const setSelectedProcessPid = setRamField('selectedProcessPid');

  // Module 1B: Hardware Inventory & Connected Peripherals state (backed by RAM store)
  const hardwareData = ram.hardwareData;
  const setHardwareData = setRamField('hardwareData');
  const loadingHardware = ram.loadingHardware;
  const setLoadingHardware = setRamField('loadingHardware');
  const hardwareError = ram.hardwareError;
  const setHardwareError = setRamField('hardwareError');
  const [peripheralCategoryFilter, setPeripheralCategoryFilter] = useState<string>('all');
  const [peripheralSearch, setPeripheralSearch] = useState('');
  const [copiedHwMac, setCopiedHwMac] = useState<string | null>(null);

  // Module 2: Network Diagnostics, Manual IP/DNS, Hosts, Proxy, Routing & Safe Reset state
  const networkData = ram.networkData;
  const setNetworkData = setRamField('networkData');
  const loadingNetwork = ram.loadingNetwork;
  const setLoadingNetwork = setRamField('loadingNetwork');
  const networkError = ram.networkError;
  const setNetworkError = setRamField('networkError');
  const [probeType, setProbeType] = useState<'ping' | 'port' | 'dns' | 'nslookup' | 'tracert' | 'http' | 'arp'>('ping');
  const [probeTarget, setProbeTarget] = useState('8.8.8.8');
  const [probePort, setProbePort] = useState('443');
  const [probeDnsRecordType, setProbeDnsRecordType] = useState('A');
  const [probeDnsServer, setProbeDnsServer] = useState('');
  const [loadingProbe, setLoadingProbe] = useState(false);
  const probeResult = ram.probeResult;
  const setProbeResult = setRamField('probeResult');
  const probeError = ram.probeError;
  const setProbeError = setRamField('probeError');
  const [runningNetAction, setRunningNetAction] = useState<string | null>(null);
  const netActionResult = ram.netActionResult;
  const setNetActionResult = setRamField('netActionResult');

  // NIC Manual IPv4 & DNS Configuration state
  const [editingAdapter, setEditingAdapter] = useState<any | null>(null);
  const [nicIpMode, setNicIpMode] = useState<'keep' | 'dhcp' | 'static'>('keep');
  const [nicIpAddress, setNicIpAddress] = useState('');
  const [nicSubnetMask, setNicSubnetMask] = useState('255.255.255.0');
  const [nicGateway, setNicGateway] = useState('');
  const [nicDnsMode, setNicDnsMode] = useState<'keep' | 'dhcp' | 'static'>('keep');
  const [nicDnsPrimary, setNicDnsPrimary] = useState('');
  const [nicDnsSecondary, setNicDnsSecondary] = useState('');
  const [savingNicConfig, setSavingNicConfig] = useState(false);
  const [confirmNicSave, setConfirmNicSave] = useState(false);

  // OS Proxy Manager state
  const [proxyScope, setProxyScope] = useState<'user' | 'winhttp' | 'both'>('user');
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyServer, setProxyServer] = useState('');
  const [proxyOverride, setProxyOverride] = useState('');
  const [proxyAutoConfigUrl, setProxyAutoConfigUrl] = useState('');
  const [proxyAutoDetect, setProxyAutoDetect] = useState(false);
  const [savingProxy, setSavingProxy] = useState(false);

  // Local DNS hosts file Manager state
  const [hostsNewIp, setHostsNewIp] = useState('');
  const [hostsNewNames, setHostsNewNames] = useState('');
  const [hostsNewComment, setHostsNewComment] = useState('');
  const [hostsSearch, setHostsSearch] = useState('');
  const [busyHostsKey, setBusyHostsKey] = useState<string | null>(null);

  // Simple Static Routing Table & Writer state
  const [routeDest, setRouteDest] = useState('');
  const [routeMask, setRouteMask] = useState('255.255.255.0');
  const [routeGateway, setRouteGateway] = useState('');
  const [routeIfIndex, setRouteIfIndex] = useState<number>(0);
  const [routeMetric, setRouteMetric] = useState('');
  const [routePersistent, setRoutePersistent] = useState(true);
  const [routeSearch, setRouteSearch] = useState('');
  const [busyRouteKey, setBusyRouteKey] = useState<string | null>(null);
  const [confirmDeleteRouteId, setConfirmDeleteRouteId] = useState<string | null>(null);

  // Endpoint VPN Connection Manager state
  const [vpnName, setVpnName] = useState('');
  const [vpnServer, setVpnServer] = useState('');
  const [vpnTunnelType, setVpnTunnelType] = useState<'Automatic' | 'L2tp' | 'Ikev2' | 'Sstp' | 'Pptp'>('L2tp');
  const [vpnL2tpPsk, setVpnL2tpPsk] = useState('');
  const [vpnUseWinCred, setVpnUseWinCred] = useState(true);
  const [vpnSplitTunnel, setVpnSplitTunnel] = useState(true);
  const [vpnAllUsers, setVpnAllUsers] = useState(true);
  const [vpnDnsSuffix, setVpnDnsSuffix] = useState('');
  const [vpnCustomUser, setVpnCustomUser] = useState('');
  const [vpnCustomPass, setVpnCustomPass] = useState('');
  const [showVpnCustomPass, setShowVpnCustomPass] = useState(false);
  const [busyVpnKey, setBusyVpnKey] = useState<string | null>(null);
  const [confirmDeleteVpnName, setConfirmDeleteVpnName] = useState<string | null>(null);

  // Module 3: Printers & Print Spooler state
  const printerData = ram.printerData;
  const setPrinterData = setRamField('printerData');
  const loadingPrinters = ram.loadingPrinters;
  const setLoadingPrinters = setRamField('loadingPrinters');
  const printerError = ram.printerError;
  const setPrinterError = setRamField('printerError');
  const [runningSpoolerAction, setRunningSpoolerAction] = useState<string | null>(null);
  const spoolerActionResult = ram.spoolerActionResult;
  const setSpoolerActionResult = setRamField('spoolerActionResult');
  const [printerRowActionBusy, setPrinterRowActionBusy] = useState<string | null>(null);
  const [printerMenuAnchor, setPrinterMenuAnchor] = useState<{
    printer: any;
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  } | null>(null);
  const [printerDeleteTarget, setPrinterDeleteTarget] = useState<DeletePrinterTarget | null>(null);
  const [isPrintServerModalOpen, setIsPrintServerModalOpen] = useState(false);

  // Module 1B: Shared Folders & Mapped Network Drives (inside Tab 1: Health & Safe Process Control)
  const sharesData = ram.sharesData;
  const setSharesData = setRamField('sharesData');
  const loadingShares = ram.loadingShares;
  const setLoadingShares = setRamField('loadingShares');
  const sharesError = ram.sharesError;
  const setSharesError = setRamField('sharesError');
  const shareActionResult = ram.shareActionResult;
  const setShareActionResult = setRamField('shareActionResult');
  const [shareRowActionBusy, setShareRowActionBusy] = useState<string | null>(null);
  const [shareMenuAnchor, setShareMenuAnchor] = useState<{
    share: any;
    top?: number;
    bottom?: number;
    left?: number;
  } | null>(null);
  const [shareDeleteTarget, setShareDeleteTarget] = useState<DeleteNetworkShareTarget | null>(null);
  const [isShareMapModalOpen, setIsShareMapModalOpen] = useState(false);
  const [shareModalPrefill, setShareModalPrefill] = useState<{
    remotePath?: string;
    driveLetter?: string;
    scope?: 'active_user' | 'specific_user' | 'all_users';
  }>({});

  // Module 4: Event Viewer (Human-Readable Diagnostics) state
  const [eventChannel, setEventChannel] = useState<'All' | 'System' | 'Application'>('All');
  const [eventHoursBack, setEventHoursBack] = useState<number>(48);
  const [eventSeverityMode, setEventSeverityMode] = useState<'all' | 'critical_error'>('all');
  const [eventSearch, setEventSearch] = useState('');
  const [eventLevelFilter, setEventLevelFilter] = useState<'all' | 'critical' | 'error' | 'warning'>('all');
  const eventData = ram.eventData;
  const setEventData = setRamField('eventData');
  const loadingEvents = ram.loadingEvents;
  const setLoadingEvents = setRamField('loadingEvents');
  const eventError = ram.eventError;
  const setEventError = setRamField('eventError');
  const [expandedEventIds, setExpandedEventIds] = useState<Record<string, boolean>>({});

  // Module 4B: Workstation User Logons, Last Login & Active Session Report state
  const logonsData = ram.logonsData;
  const setLogonsData = setRamField('logonsData');
  const loadingLogons = ram.loadingLogons;
  const setLoadingLogons = setRamField('loadingLogons');
  const logonsError = ram.logonsError;
  const setLogonsError = setRamField('logonsError');
  const [logonsHoursBack, setLogonsHoursBack] = useState<number>(168);
  const [logonsSearch, setLogonsSearch] = useState('');
  const [logonsEventFilter, setLogonsEventFilter] = useState<
    'all' | 'logon' | 'logoff' | 'lock_unlock' | 'rdp' | 'failed'
  >('all');

  // Module 5: Safe User-App Process Termination inline confirm state
  const [confirmKillPid, setConfirmKillPid] = useState<number | null>(null);
  const [terminatingPid, setTerminatingPid] = useState<number | null>(null);
  const processActionNotice = ram.processActionNotice;
  const setProcessActionNotice = setRamField('processActionNotice');

  // Module 6: Confined Temp Cleanup state
  const tempScanData = ram.tempScanData;
  const setTempScanData = setRamField('tempScanData');
  const loadingTempScan = ram.loadingTempScan;
  const setLoadingTempScan = setRamField('loadingTempScan');
  const tempError = ram.tempError;
  const setTempError = setRamField('tempError');
  const [tempScope, setTempScope] = useState<'both' | 'user_temp' | 'windows_temp'>('both');
  const [confirmTempClean, setConfirmTempClean] = useState(false);
  const [cleaningTemp, setCleaningTemp] = useState(false);
  const tempCleanResult = ram.tempCleanResult;
  const setTempCleanResult = setRamField('tempCleanResult');

  // Group Policy Inspection & GPUpdate state
  const gpoData = ram.gpoData;
  const setGpoData = setRamField('gpoData');
  const loadingGpo = ram.loadingGpo;
  const setLoadingGpo = setRamField('loadingGpo');
  const gpoError = ram.gpoError;
  const setGpoError = setRamField('gpoError');
  const [runningGpupdate, setRunningGpupdate] = useState(false);
  const gpupdateResult = ram.gpupdateResult;
  const setGpupdateResult = setRamField('gpupdateResult');
  const [showRawGpo, setShowRawGpo] = useState(false);

  // Detailed System Info, Windows Updates (WSUS vs Internet) & Installed HotFixes
  const sysInfoData = ram.sysInfoData;
  const setSysInfoData = setRamField('sysInfoData');
  const loadingSysInfo = ram.loadingSysInfo;
  const setLoadingSysInfo = setRamField('loadingSysInfo');
  const sysInfoError = ram.sysInfoError;
  const setSysInfoError = setRamField('sysInfoError');
  const [hotfixSearch, setHotfixSearch] = useState('');
  const [showRawSysInfo, setShowRawSysInfo] = useState(false);
  const updateStatusData = ram.updateStatusData;
  const setUpdateStatusData = setRamField('updateStatusData');
  const loadingUpdateStatus = ram.loadingUpdateStatus;
  const setLoadingUpdateStatus = setRamField('loadingUpdateStatus');
  const updateStatusError = ram.updateStatusError;
  const setUpdateStatusError = setRamField('updateStatusError');
  const [updateSourceMode, setUpdateSourceMode] = useState<'auto' | 'wsus' | 'internet'>('auto');
  const [installingUpdates, setInstallingUpdates] = useState<string | null>(null);
  const [confirmInstallAllUpdates, setConfirmInstallAllUpdates] = useState(false);
  const [uninstallingKb, setUninstallingKb] = useState<string | null>(null);
  const [confirmUninstallKb, setConfirmUninstallKb] = useState<string | null>(null);
  const [manualKbUninstall, setManualKbUninstall] = useState('');
  const updateActionResult = ram.updateActionResult;
  const setUpdateActionResult = setRamField('updateActionResult');
  const updateActionError = ram.updateActionError;
  const setUpdateActionError = setRamField('updateActionError');

  // Add / Remove Programs (Installed Applications & Safe Remote Uninstall)
  const programsData = ram.programsData;
  const setProgramsData = setRamField('programsData');
  const loadingPrograms = ram.loadingPrograms;
  const setLoadingPrograms = setRamField('loadingPrograms');
  const programsError = ram.programsError;
  const setProgramsError = setRamField('programsError');
  const programActionResult = ram.programActionResult;
  const setProgramActionResult = setRamField('programActionResult');
  const programActionError = ram.programActionError;
  const setProgramActionError = setRamField('programActionError');
  const [programSearch, setProgramSearch] = useState('');
  const [programScopeFilter, setProgramScopeFilter] = useState<'all' | 'machine' | 'user'>('all');
  const [programTypeFilter, setProgramTypeFilter] = useState<'all' | 'msi' | 'exe'>('all');
  const [programSort, setProgramSort] = useState<'name' | 'size' | 'installDate' | 'publisher'>('name');
  const [programSortDir, setProgramSortDir] = useState<'asc' | 'desc'>('asc');
  const [programPage, setProgramPage] = useState<number>(1);
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(null);
  const [confirmUninstallProgId, setConfirmUninstallProgId] = useState<string | null>(null);
  const [uninstallingProgId, setUninstallingProgId] = useState<string | null>(null);

  // System Integrity Repair (SFC / DISM) & Smart Disk Media (HDD vs SSD) + CHKDSK
  const diskHealthData = ram.diskHealthData;
  const setDiskHealthData = setRamField('diskHealthData');
  const loadingDiskHealth = ram.loadingDiskHealth;
  const setLoadingDiskHealth = setRamField('loadingDiskHealth');
  const diskHealthError = ram.diskHealthError;
  const setDiskHealthError = setRamField('diskHealthError');
  const [runningRepairMode, setRunningRepairMode] = useState<string | null>(null);
  const [confirmRepairKey, setConfirmRepairKey] = useState<string | null>(null);
  const repairResult = ram.repairResult;
  const setRepairResult = setRamField('repairResult');
  const repairError = ram.repairError;
  const setRepairError = setRamField('repairError');
  const [showRawRepair, setShowRawRepair] = useState(false);

  // Remote Power Control (Force/Scheduled Shutdown, Immediate/Scheduled Restart, Abort) & User Session Actions
  const [powerAction, setPowerAction] = useState<
    'restart_now' | 'restart_scheduled' | 'shutdown_force' | 'shutdown_scheduled' | 'abort'
  >('restart_scheduled');
  const [powerDelayMinutes, setPowerDelayMinutes] = useState<number>(5);
  const [powerReason, setPowerReason] = useState('IT HelpDesk Remote Maintenance');
  const [confirmPowerAction, setConfirmPowerAction] = useState(false);
  const [runningPower, setRunningPower] = useState(false);
  const powerResult = ram.powerResult;
  const setPowerResult = setRamField('powerResult');
  const powerError = ram.powerError;
  const setPowerError = setRamField('powerError');
  const [sessionActionBusy, setSessionActionBusy] = useState<string | null>(null);
  const [confirmLogoffKey, setConfirmLogoffKey] = useState<string | null>(null);
  const sessionActionResult = ram.sessionActionResult;
  const setSessionActionResult = setRamField('sessionActionResult');
  const sessionActionError = ram.sessionActionError;
  const setSessionActionError = setRamField('sessionActionError');

  // Laptop Battery Health & Cycle Count Report
  const batteryData = ram.batteryData;
  const setBatteryData = setRamField('batteryData');
  const loadingBattery = ram.loadingBattery;
  const setLoadingBattery = setRamField('loadingBattery');
  const batteryError = ram.batteryError;
  const setBatteryError = setRamField('batteryError');

  // Active Directory Domain Account Lookup (net user <USERNAME> /domain)
  const domainQueryUser = ram.domainQueryUser;
  const setDomainQueryUser = setRamField('domainQueryUser');
  const domainUserData = ram.domainUserData;
  const setDomainUserData = setRamField('domainUserData');
  const loadingDomainUser = ram.loadingDomainUser;
  const setLoadingDomainUser = setRamField('loadingDomainUser');
  const domainUserError = ram.domainUserError;
  const setDomainUserError = setRamField('domainUserError');
  const [domainGroupFilter, setDomainGroupFilter] = useState('');
  const [showRawDomainUser, setShowRawDomainUser] = useState(false);

  // Connection History Tab State (persisted non-secret metadata in DB, paginated & searchable)
  const [historyItems, setHistoryItems] = useState<HelpdeskConnectionHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(15);
  const [historyStats, setHistoryStats] = useState<HelpdeskConnectionHistoryResponse['stats'] | null>(null);
  const [historySearchInput, setHistorySearchInput] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [historyProtocolFilter, setHistoryProtocolFilter] = useState<string>('all');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [busyHistoryId, setBusyHistoryId] = useState<string | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [copiedHistoryIpId, setCopiedHistoryIpId] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    bindHelpdeskRamOwner(currentUser?.id || currentUser?.username || null);
  }, [currentUser?.id, currentUser?.username]);

  useEffect(() => {
    let mounted = true;
    fetchHelpdeskStatus()
      .then((res) => {
        if (!mounted) return;
        if (res.rateLimit) setRateLimit(res.rateLimit);
        if (res.jeaTemplates) setJeaTemplates(res.jeaTemplates);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Hydrate proxy/gateway form inputs when remounting with an active network snapshot in RAM
  const syncNetworkFormDefaults = useCallback((netData: any) => {
    if (!netData) return;
    if (netData.proxy) {
      setProxyEnabled(Boolean(netData.proxy.enabled));
      setProxyServer(String(netData.proxy.server || ''));
      setProxyOverride(String(netData.proxy.override || ''));
      setProxyAutoConfigUrl(String(netData.proxy.autoConfigUrl || ''));
      setProxyAutoDetect(Boolean(netData.proxy.autoDetect));
    }
    if (Array.isArray(netData.adapters)) {
      const gwAdapter = netData.adapters.find((ad: any) => Array.isArray(ad.defaultGateways) && ad.defaultGateways[0]);
      if (gwAdapter) {
        setRouteGateway((prev) => prev || String(gwAdapter.defaultGateways[0]));
      }
    }
  }, []);

  useEffect(() => {
    if (networkData) {
      syncNetworkFormDefaults(networkData);
    }
  }, [networkData, syncNetworkFormDefaults]);

  const loadConnectionHistory = useCallback(
    async (opts?: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: 'all' | 'success' | 'failed';
      protocol?: string;
    }) => {
      setLoadingHistory(true);
      setHistoryError(null);
      try {
        const res = await fetchHelpdeskConnectionHistory({
          page: opts?.page ?? historyPage,
          pageSize: opts?.pageSize ?? historyPageSize,
          search: opts?.search ?? historySearch,
          status: opts?.status ?? historyStatusFilter,
          protocol: opts?.protocol ?? historyProtocolFilter,
        });
        setHistoryItems(Array.isArray(res.items) ? res.items : []);
        setHistoryTotal(Number(res.total || 0));
        setHistoryPage(Number(res.page || 1));
        setHistoryStats(res.stats || null);
      } catch (err: any) {
        setHistoryError(
          err?.message ||
            (isEn ? 'Failed to load HelpDesk connection history.' : 'خطا در دریافت تاریخچه اتصالات هلپ‌دسک.')
        );
      } finally {
        setLoadingHistory(false);
      }
    },
    [historyPage, historyPageSize, historySearch, historyStatusFilter, historyProtocolFilter, isEn]
  );

  useEffect(() => {
    if (activeSubTab === 'history') {
      loadConnectionHistory();
    }
  }, [activeSubTab, loadConnectionHistory]);

  const buildPayload = (): HelpdeskConnectionPayload | null => {
    const cleanIp = targetIp.trim();
    const cleanUser = username.trim();
    if (!cleanIp) {
      const msg = isEn
        ? 'Enter a target workstation IP address or hostname first.'
        : 'ابتدا آدرس IP یا نام سیستم کاربر را وارد کنید.';
      setHealthError(msg);
      return null;
    }
    if (!cleanUser || !password) {
      const msg = isEn
        ? 'Enter ephemeral session username and password (kept in memory only).'
        : 'نام کاربری و رمز عبور موقت نشست را وارد کنید (فقط در حافظه موقت نگهداری می‌شود).';
      setHealthError(msg);
      return null;
    }
    const portNum = customPort.trim() ? Number(customPort.trim()) : undefined;
    return {
      targetIp: cleanIp,
      protocol,
      port: portNum && Number.isInteger(portNum) ? portNum : undefined,
      username: cleanUser,
      password,
      jeaConfigName: jeaConfigName.trim() || undefined,
    };
  };

  const handleClearSession = () => {
    wipeHelpdeskRamSession();
    setShowPassword(false);
    setReconnectBanner(null);
    setPrinterRowActionBusy(null);
    setPrinterMenuAnchor(null);
    setPrinterDeleteTarget(null);
    setIsPrintServerModalOpen(false);
    setShareRowActionBusy(null);
    setShareMenuAnchor(null);
    setShareDeleteTarget(null);
    setIsShareMapModalOpen(false);
    setShareModalPrefill({});
    setConfirmKillPid(null);
    setExpandedEventIds({});
    setLogonsSearch('');
    setLogonsEventFilter('all');
    setConfirmTempClean(false);
    setHotfixSearch('');
    setShowRawSysInfo(false);
    setConfirmInstallAllUpdates(false);
    setConfirmUninstallKb(null);
    setManualKbUninstall('');
    setEditingAdapter(null);
    setConfirmNicSave(false);
    setProxyServer('');
    setProxyOverride('');
    setProxyAutoConfigUrl('');
    setHostsNewIp('');
    setHostsNewNames('');
    setHostsNewComment('');
    setRouteDest('');
    setRouteGateway('');
    setConfirmDeleteRouteId(null);
    setVpnName('');
    setVpnServer('');
    setVpnTunnelType('L2tp');
    setVpnL2tpPsk('');
    setVpnUseWinCred(true);
    setVpnSplitTunnel(true);
    setVpnAllUsers(true);
    setVpnDnsSuffix('');
    setVpnCustomUser('');
    setVpnCustomPass('');
    setShowVpnCustomPass(false);
    setConfirmDeleteVpnName(null);
    setConfirmRepairKey(null);
    setConfirmPowerAction(false);
    setSessionActionBusy(null);
    setConfirmLogoffKey(null);
  };

  const handleInspectShares = async (overridePayload?: HelpdeskConnectionPayload) => {
    const payload = overridePayload || buildPayload();
    if (!payload) return;
    setLoadingShares(true);
    setSharesError(null);
    try {
      const res = await fetchHelpdeskEndpointShares(payload);
      setSharesData(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setSharesData(null);
      setSharesError(
        err?.message ||
          (isEn
            ? 'Failed to inspect mapped network shares.'
            : 'خطا در دریافت لیست پوشه‌های اشتراکی مپ‌شده کاربر.')
      );
    } finally {
      setLoadingShares(false);
    }
  };

  const handleInspectHealth = async (
    e?: React.FormEvent,
    overridePayload?: HelpdeskConnectionPayload,
    skipHistory = false
  ): Promise<boolean> => {
    if (e) e.preventDefault();
    const payload = overridePayload || buildPayload();
    if (!payload) return false;
    setLoadingHealth(true);
    setHealthError(null);
    try {
      const res = await fetchHelpdeskEndpointHealth({ ...payload, skipHistory });
      setHealthData(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      setLoadingHealth(false);
      // Automatically fetch user's mapped shared folders for Tab 1 in sequence after live gauges populate
      await handleInspectShares(payload);
      return true;
    } catch (err: any) {
      setHealthData(null);
      setHealthError(err?.message || (isEn ? 'Failed to inspect endpoint.' : 'خطا در اتصال و دریافت وضعیت سیستم.'));
      return false;
    } finally {
      setLoadingHealth(false);
    }
  };

  const handleInspectHardware = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setLoadingHardware(true);
    setHardwareError(null);
    try {
      const res = await fetchHelpdeskHardwareInventory(payload);
      setHardwareData(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setHardwareData(null);
      setHardwareError(
        err?.message ||
          (isEn
            ? 'Failed to collect endpoint hardware inventory.'
            : 'خطا در دریافت مشخصات کامل سخت‌افزار سیستم کاربر.')
      );
    } finally {
      setLoadingHardware(false);
    }
  };

  const handleExportHardwareJson = () => {
    if (!hardwareData) return;
    const blob = new Blob([JSON.stringify(hardwareData, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hardware_inventory_${hardwareData.hostname || targetIp || 'endpoint'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleInspectNetwork = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setLoadingNetwork(true);
    setNetworkError(null);
    try {
      const res = await fetchHelpdeskNetworkSnapshot(payload);
      setNetworkData(res.data);
      if (res.data?.proxy) {
        setProxyEnabled(Boolean(res.data.proxy.enabled));
        setProxyServer(String(res.data.proxy.server || ''));
        setProxyOverride(String(res.data.proxy.override || ''));
        setProxyAutoConfigUrl(String(res.data.proxy.autoConfigUrl || ''));
        setProxyAutoDetect(Boolean(res.data.proxy.autoDetect));
      }
      if (!routeGateway && Array.isArray(res.data?.adapters)) {
        const gwAdapter = res.data.adapters.find((ad: any) => Array.isArray(ad.defaultGateways) && ad.defaultGateways[0]);
        if (gwAdapter) setRouteGateway(String(gwAdapter.defaultGateways[0]));
      }
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setNetworkData(null);
      setNetworkError(err?.message || (isEn ? 'Failed to inspect endpoint network.' : 'خطا در دریافت اطلاعات شبکه سیستم کاربر.'));
    } finally {
      setLoadingNetwork(false);
    }
  };

  const handleRunProbe = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    setLoadingProbe(true);
    setProbeError(null);
    try {
      const res = await runHelpdeskNetworkProbe({
        ...payload,
        probeType,
        probeTarget: probeTarget.trim(),
        probePort: probeType === 'port' ? Number(probePort) : undefined,
        dnsRecordType: probeType === 'nslookup' ? probeDnsRecordType : undefined,
        dnsServer: probeType === 'nslookup' && probeDnsServer.trim() ? probeDnsServer.trim() : undefined,
      });
      setProbeResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setProbeResult(null);
      setProbeError(err?.message || (isEn ? 'Diagnostic probe failed.' : 'تست عیب‌یابی با خطا مواجه شد.'));
    } finally {
      setLoadingProbe(false);
    }
  };

  const handleSafeNetworkAction = async (action: 'network_flush_dns' | 'network_renew_ip') => {
    const payload = buildPayload();
    if (!payload) return;
    setRunningNetAction(action);
    setNetworkError(null);
    setNetActionResult(null);
    try {
      const res = await executeHelpdeskNetworkAction({ ...payload, action });
      setNetActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setNetworkError(err?.message || (isEn ? 'Safe network action failed.' : 'اجرای عملیات امن شبکه ناموفق بود.'));
    } finally {
      setRunningNetAction(null);
    }
  };

  const handleStartEditAdapter = (adapter: any) => {
    setEditingAdapter(adapter);
    setConfirmNicSave(false);
    setNicIpMode(adapter.dhcpEnabled === false ? 'static' : 'dhcp');
    setNicIpAddress(Array.isArray(adapter.ipv4Addresses) && adapter.ipv4Addresses[0] ? adapter.ipv4Addresses[0] : '');
    setNicSubnetMask(
      Array.isArray(adapter.subnetMasks) && adapter.subnetMasks[0] ? adapter.subnetMasks[0] : '255.255.255.0'
    );
    setNicGateway(Array.isArray(adapter.defaultGateways) && adapter.defaultGateways[0] ? adapter.defaultGateways[0] : '');
    const hasDns = Array.isArray(adapter.dnsServers) && adapter.dnsServers.length > 0;
    setNicDnsMode(adapter.dhcpEnabled === false || hasDns ? 'static' : 'dhcp');
    setNicDnsPrimary(Array.isArray(adapter.dnsServers) && adapter.dnsServers[0] ? adapter.dnsServers[0] : '');
    setNicDnsSecondary(Array.isArray(adapter.dnsServers) && adapter.dnsServers[1] ? adapter.dnsServers[1] : '');
  };

  const handleSaveAdapterConfig = async () => {
    if (!editingAdapter) return;
    const payload = buildPayload();
    if (!payload) return;
    setSavingNicConfig(true);
    setConfirmNicSave(false);
    setNetworkError(null);
    setNetActionResult(null);
    try {
      const res = await updateHelpdeskAdapterNetworkConfig({
        ...payload,
        adapterName: editingAdapter.name,
        interfaceIndex: editingAdapter.interfaceIndex ?? undefined,
        ipMode: nicIpMode,
        ipAddress: nicIpMode === 'static' ? nicIpAddress.trim() : undefined,
        subnetMask: nicIpMode === 'static' ? nicSubnetMask.trim() : undefined,
        gateway: nicIpMode === 'static' && nicGateway.trim() ? nicGateway.trim() : undefined,
        dnsMode: nicDnsMode,
        dnsPrimary: nicDnsMode === 'static' ? nicDnsPrimary.trim() : undefined,
        dnsSecondary: nicDnsMode === 'static' && nicDnsSecondary.trim() ? nicDnsSecondary.trim() : undefined,
      });
      setNetActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      setEditingAdapter(null);
      try {
        const refreshed = await fetchHelpdeskNetworkSnapshot(payload);
        setNetworkData(refreshed.data);
      } catch {}
    } catch (err: any) {
      setNetworkError(
        err?.message || (isEn ? 'Failed to update adapter IP/DNS.' : 'تغییر دستی IP یا DNS کارت شبکه ناموفق بود.')
      );
    } finally {
      setSavingNicConfig(false);
      notifyHelpdeskAuditUpdated();
    }
  };

  const handleSaveProxyConfig = async (forceDisable = false) => {
    const payload = buildPayload();
    if (!payload) return;
    setSavingProxy(true);
    setNetworkError(null);
    setNetActionResult(null);
    try {
      const res = await updateHelpdeskProxySettings({
        ...payload,
        scope: proxyScope,
        enabled: forceDisable ? false : proxyEnabled,
        server: forceDisable ? '' : proxyServer.trim(),
        override: forceDisable ? '' : proxyOverride.trim(),
        autoConfigUrl: forceDisable ? '' : proxyAutoConfigUrl.trim(),
        autoDetect: forceDisable ? false : proxyAutoDetect,
      });
      setNetActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      if (forceDisable) {
        setProxyEnabled(false);
      }
      try {
        const refreshed = await fetchHelpdeskNetworkSnapshot(payload);
        setNetworkData(refreshed.data);
      } catch {}
    } catch (err: any) {
      setNetworkError(
        err?.message || (isEn ? 'Failed to configure OS Proxy.' : 'اعمال تنظیمات Proxy سیستم‌عامل ناموفق بود.')
      );
    } finally {
      setSavingProxy(false);
      notifyHelpdeskAuditUpdated();
    }
  };

  const handleManageHosts = async (
    operation: 'add' | 'toggle' | 'delete',
    lineIndex?: number,
    e?: React.FormEvent
  ) => {
    if (e) e.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    const busyKey = operation === 'add' ? 'add' : `${operation}-${lineIndex}`;
    setBusyHostsKey(busyKey);
    setNetworkError(null);
    setNetActionResult(null);
    try {
      const res = await manageHelpdeskHostsEntry({
        ...payload,
        operation,
        ip: operation === 'add' ? hostsNewIp.trim() : undefined,
        hostnames: operation === 'add' ? hostsNewNames.trim() : undefined,
        comment: operation === 'add' ? hostsNewComment.trim() : undefined,
        lineIndex,
      });
      setNetActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      if (operation === 'add') {
        setHostsNewIp('');
        setHostsNewNames('');
        setHostsNewComment('');
      }
      try {
        const refreshed = await fetchHelpdeskNetworkSnapshot(payload);
        setNetworkData(refreshed.data);
      } catch {}
    } catch (err: any) {
      setNetworkError(
        err?.message || (isEn ? 'Failed to update hosts file.' : 'بروزرسانی فایل محلی hosts ناموفق بود.')
      );
    } finally {
      setBusyHostsKey(null);
      notifyHelpdeskAuditUpdated();
    }
  };

  const handleAddStaticRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    setBusyRouteKey('add');
    setNetworkError(null);
    setNetActionResult(null);
    try {
      const res = await manageHelpdeskStaticRoute({
        ...payload,
        operation: 'add',
        destination: routeDest.trim(),
        netmask: routeMask,
        gateway: routeGateway.trim(),
        interfaceIndex: routeIfIndex > 0 ? routeIfIndex : undefined,
        metric: routeMetric.trim() ? Number(routeMetric.trim()) : undefined,
        persistent: routePersistent,
      });
      setNetActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      setRouteDest('');
      try {
        const refreshed = await fetchHelpdeskNetworkSnapshot(payload);
        setNetworkData(refreshed.data);
      } catch {}
    } catch (err: any) {
      setNetworkError(
        err?.message || (isEn ? 'Failed to add static route.' : 'ثبت روت جدید در جدول مسیریابی ناموفق بود.')
      );
    } finally {
      setBusyRouteKey(null);
      notifyHelpdeskAuditUpdated();
    }
  };

  const handleDeleteStaticRoute = async (rt: any) => {
    const payload = buildPayload();
    if (!payload) return;
    setBusyRouteKey(rt.id);
    setConfirmDeleteRouteId(null);
    setNetworkError(null);
    setNetActionResult(null);
    try {
      const res = await manageHelpdeskStaticRoute({
        ...payload,
        operation: 'delete',
        destination: rt.destination,
        netmask: rt.netmask,
        gateway: rt.gateway,
        interfaceIndex: rt.interfaceIndex > 0 ? rt.interfaceIndex : undefined,
        persistent: Boolean(rt.persistent),
      });
      setNetActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      try {
        const refreshed = await fetchHelpdeskNetworkSnapshot(payload);
        setNetworkData(refreshed.data);
      } catch {}
    } catch (err: any) {
      setNetworkError(
        err?.message || (isEn ? 'Failed to delete route.' : 'حذف روت انتخاب‌شده ناموفق بود.')
      );
    } finally {
      setBusyRouteKey(null);
      notifyHelpdeskAuditUpdated();
    }
  };

  const handleCreateVpn = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    setBusyVpnKey('create');
    setNetworkError(null);
    setNetActionResult(null);
    try {
      const res = await manageHelpdeskVpnConnection({
        ...payload,
        operation: 'create',
        name: vpnName.trim(),
        serverAddress: vpnServer.trim(),
        tunnelType: vpnTunnelType,
        l2tpPsk: vpnL2tpPsk || undefined,
        useWinlogonCredential: vpnUseWinCred,
        splitTunneling: vpnSplitTunnel,
        allUserConnection: vpnAllUsers,
        dnsSuffix: vpnDnsSuffix.trim() || undefined,
        customUsername: !vpnUseWinCred && vpnCustomUser.trim() ? vpnCustomUser.trim() : undefined,
        customPassword: !vpnUseWinCred && vpnCustomPass ? vpnCustomPass : undefined,
      });
      setNetActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      setVpnName('');
      setVpnL2tpPsk('');
      setVpnCustomPass('');
      try {
        const refreshed = await fetchHelpdeskNetworkSnapshot(payload);
        setNetworkData(refreshed.data);
      } catch {}
    } catch (err: any) {
      setNetworkError(
        err?.message || (isEn ? 'Failed to configure VPN connection.' : 'ساخت یا تنظیم کانکشن VPN روی سیستم کاربر ناموفق بود.')
      );
    } finally {
      setBusyVpnKey(null);
      notifyHelpdeskAuditUpdated();
    }
  };

  const handleVpnRowAction = async (operation: 'connect' | 'disconnect' | 'delete', name: string) => {
    const payload = buildPayload();
    if (!payload) return;
    setBusyVpnKey(`${operation}:${name}`);
    setConfirmDeleteVpnName(null);
    setNetworkError(null);
    setNetActionResult(null);
    try {
      const res = await manageHelpdeskVpnConnection({
        ...payload,
        operation,
        name,
      });
      setNetActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      try {
        const refreshed = await fetchHelpdeskNetworkSnapshot(payload);
        setNetworkData(refreshed.data);
      } catch {}
    } catch (err: any) {
      setNetworkError(
        err?.message || (isEn ? `VPN ${operation} action failed.` : `عملیات ${operation} روی کانکشن VPN ناموفق بود.`)
      );
    } finally {
      setBusyVpnKey(null);
      notifyHelpdeskAuditUpdated();
    }
  };

  const handleInspectPrinters = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setLoadingPrinters(true);
    setPrinterError(null);
    try {
      const res = await fetchHelpdeskPrinterStatus(payload);
      setPrinterData(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setPrinterData(null);
      setPrinterError(err?.message || (isEn ? 'Failed to inspect printers.' : 'خطا در دریافت وضعیت پرینترها و Spooler.'));
    } finally {
      setLoadingPrinters(false);
    }
  };

  const handleSpoolerAction = async (action: 'spooler_restart' | 'spooler_clear_queue') => {
    const payload = buildPayload();
    if (!payload) return;
    setRunningSpoolerAction(action);
    setPrinterError(null);
    setSpoolerActionResult(null);
    try {
      const res = await executeHelpdeskPrinterAction({ ...payload, action });
      setSpoolerActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      // Re-fetch real printer/spooler state after remediation
      try {
        const refreshed = await fetchHelpdeskPrinterStatus(payload);
        setPrinterData(refreshed.data);
      } catch {}
    } catch (err: any) {
      setPrinterError(err?.message || (isEn ? 'Print Spooler action failed.' : 'اجرای عملیات روی سرویس Spooler ناموفق بود.'));
    } finally {
      setRunningSpoolerAction(null);
    }
  };

  const handleTogglePrinterMenu = (e: React.MouseEvent<HTMLButtonElement>, pr: any) => {
    e.stopPropagation();
    if (printerMenuAnchor?.printer?.name === pr.name) {
      setPrinterMenuAnchor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 224;
    const spaceBelow = window.innerHeight - rect.bottom - 44;
    const openUp = spaceBelow < 130 && rect.top > 130;
    const leftPos = isEn
      ? Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12))
      : Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12));
    setPrinterMenuAnchor({
      printer: pr,
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      left: leftPos,
    });
  };

  const handleSetDefaultPrinter = async (printerName: string) => {
    const payload = buildPayload();
    if (!payload) return;
    setPrinterMenuAnchor(null);
    setPrinterRowActionBusy(printerName);
    setPrinterError(null);
    setSpoolerActionResult(null);
    try {
      const res = await setHelpdeskDefaultPrinter({ ...payload, printerName });
      setSpoolerActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      try {
        const refreshed = await fetchHelpdeskPrinterStatus(payload);
        setPrinterData(refreshed.data);
      } catch {}
    } catch (err: any) {
      setPrinterError(
        err?.message ||
          (isEn
            ? `Failed to set "${printerName}" as default printer.`
            : `تنظیم پرینتر «${printerName}» به‌عنوان پیش‌فرض ناموفق بود.`)
      );
    } finally {
      setPrinterRowActionBusy(null);
    }
  };

  const handleConfirmDeletePrinter = async (target: DeletePrinterTarget) => {
    const payload = buildPayload();
    if (!payload) return;
    setPrinterRowActionBusy(target.name);
    setPrinterError(null);
    setSpoolerActionResult(null);
    try {
      const res = await deleteHelpdeskPrinter({
        ...payload,
        printerName: target.name,
        scope: target.scope === 'user' || target.scope === 'machine' ? target.scope : 'auto',
      });
      setSpoolerActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      try {
        const refreshed = await fetchHelpdeskPrinterStatus(payload);
        setPrinterData(refreshed.data);
      } catch {}
    } catch (err: any) {
      setPrinterError(
        err?.message ||
          (isEn
            ? `Failed to remove printer "${target.name}".`
            : `حذف پرینتر «${target.name}» ناموفق بود.`)
      );
    } finally {
      setPrinterRowActionBusy(null);
    }
  };

  const handleMinimizePrintServerModal = () => {
    dockModal({
      id: 'modal-helpdesk-print-server',
      labelEn: 'Connect Print Server Printer',
      labelFa: 'نصب پرینتر از پرینت سرور',
      badge: 'Print',
      category: 'system',
      onRestore: () => {
        undockModal('modal-helpdesk-print-server');
        setIsPrintServerModalOpen(true);
      },
      onClose: () => {
        undockModal('modal-helpdesk-print-server');
        setIsPrintServerModalOpen(false);
      },
    });
    setIsPrintServerModalOpen(false);
  };

  const handleToggleShareMenu = (e: React.MouseEvent<HTMLButtonElement>, sh: any) => {
    e.stopPropagation();
    if (shareMenuAnchor?.share?.id === sh.id) {
      setShareMenuAnchor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 230;
    const spaceBelow = window.innerHeight - rect.bottom - 44;
    const openUp = spaceBelow < 130 && rect.top > 130;
    const leftPos = isEn
      ? Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12))
      : Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12));
    setShareMenuAnchor({
      share: sh,
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      left: leftPos,
    });
  };

  const handleConfirmDisconnectShare = async (target: DeleteNetworkShareTarget) => {
    const payload = buildPayload();
    if (!payload) return;
    setShareRowActionBusy(target.id);
    setSharesError(null);
    setShareActionResult(null);
    try {
      const res = await disconnectHelpdeskEndpointShare({
        ...payload,
        remotePath: target.remotePath,
        driveLetter: target.driveLetter,
        scope: target.scope || 'auto',
        ownerSid: target.ownerSid,
        managedRuleName: target.managedRuleName,
      });
      setShareActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      try {
        const refreshed = await fetchHelpdeskEndpointShares(payload);
        setSharesData(refreshed.data);
      } catch {}
    } catch (err: any) {
      setSharesError(
        err?.message ||
          (isEn
            ? `Failed to disconnect share "${target.remotePath}".`
            : `قطع اتصال پوشه اشتراکی «${target.remotePath}» ناموفق بود.`)
      );
    } finally {
      setShareRowActionBusy(null);
    }
  };

  const handleMinimizeShareMapModal = () => {
    dockModal({
      id: 'modal-helpdesk-network-share',
      labelEn: 'Map Shared Folder',
      labelFa: 'مپ کردن پوشه اشتراکی',
      badge: 'Share',
      category: 'system',
      onRestore: () => {
        undockModal('modal-helpdesk-network-share');
        setIsShareMapModalOpen(true);
      },
      onClose: () => {
        undockModal('modal-helpdesk-network-share');
        setIsShareMapModalOpen(false);
      },
    });
    setIsShareMapModalOpen(false);
  };

  const handleInspectEvents = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setLoadingEvents(true);
    setEventError(null);
    try {
      const res = await fetchHelpdeskEventLogs({
        ...payload,
        channel: eventChannel,
        hoursBack: eventHoursBack,
        maxEvents: 50,
        severity: eventSeverityMode,
      });
      setEventData(res.data);
      setExpandedEventIds({});
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setEventData(null);
      setEventError(
        err?.message || (isEn ? 'Failed to read endpoint Event Viewer logs.' : 'خطا در خواندن لاگ‌های Event Viewer سیستم کاربر.')
      );
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleTerminateProcess = async (pid: number, processName: string) => {
    const payload = buildPayload();
    if (!payload) return;
    setTerminatingPid(pid);
    setProcessActionNotice(null);
    setHealthError(null);
    try {
      const res = await terminateHelpdeskProcess({ ...payload, pid, processName });
      setConfirmKillPid(null);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      setProcessActionNotice({
        ok: Boolean(res.data?.success),
        text: isEn ? res.data?.message : res.data?.messageFa,
      });
      // Refresh real process table from endpoint after termination (without duplicating connection history)
      try {
        const refreshed = await fetchHelpdeskEndpointHealth({ ...payload, skipHistory: true });
        setHealthData(refreshed.data);
      } catch {}
    } catch (err: any) {
      setConfirmKillPid(null);
      setProcessActionNotice({
        ok: false,
        text: err?.message || (isEn ? 'Failed to terminate user process.' : 'توقف پروسس کاربری ناموفق بود.'),
      });
    } finally {
      setTerminatingPid(null);
    }
  };

  const handleScanTemp = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setLoadingTempScan(true);
    setTempError(null);
    try {
      const res = await scanHelpdeskTemp(payload);
      setTempScanData(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setTempScanData(null);
      setTempError(
        err?.message || (isEn ? 'Failed to scan endpoint Temp folders.' : 'خطا در اسکن پوشه‌های Temp سیستم کاربر.')
      );
    } finally {
      setLoadingTempScan(false);
    }
  };

  const handleCleanTemp = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setCleaningTemp(true);
    setTempError(null);
    setTempCleanResult(null);
    setConfirmTempClean(false);
    try {
      const res = await cleanHelpdeskTemp({ ...payload, scope: tempScope });
      setTempCleanResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      try {
        const rescanned = await scanHelpdeskTemp(payload);
        setTempScanData(rescanned.data);
      } catch {}
    } catch (err: any) {
      setTempError(
        err?.message || (isEn ? 'Safe Temp cleanup failed.' : 'پاک‌سازی ایمن پوشه Temp ناموفق بود.')
      );
    } finally {
      setCleaningTemp(false);
    }
  };

  const handleInspectGpo = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setLoadingGpo(true);
    setGpoError(null);
    try {
      const res = await fetchHelpdeskGpoStatus(payload);
      setGpoData(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setGpoData(null);
      setGpoError(
        err?.message || (isEn ? 'Failed to inspect Group Policy status.' : 'خطا در دریافت وضعیت Group Policy سیستم کاربر.')
      );
    } finally {
      setLoadingGpo(false);
    }
  };

  const handleRunGpupdate = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setRunningGpupdate(true);
    setGpoError(null);
    setGpupdateResult(null);
    try {
      const res = await runHelpdeskGpupdate(payload);
      setGpupdateResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      try {
        const refreshed = await fetchHelpdeskGpoStatus(payload);
        setGpoData(refreshed.data);
      } catch {}
    } catch (err: any) {
      setGpoError(
        err?.message || (isEn ? 'gpupdate /force failed.' : 'اجرای gpupdate /force با خطا مواجه شد.')
      );
    } finally {
      setRunningGpupdate(false);
    }
  };

  const handleInspectSysInfo = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setLoadingSysInfo(true);
    setSysInfoError(null);
    try {
      const res = await fetchHelpdeskSystemInfo(payload);
      setSysInfoData(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setSysInfoData(null);
      setSysInfoError(
        err?.message || (isEn ? 'Failed to collect detailed system info and updates.' : 'خطا در دریافت مشخصات سیستم و لیست آپدیت‌ها.')
      );
    } finally {
      setLoadingSysInfo(false);
    }
  };

  const handleInspectUpdateStatus = async (
    overrideSource?: 'auto' | 'wsus' | 'internet',
    withOnlineScan = true
  ) => {
    const payload = buildPayload();
    if (!payload) return;
    setLoadingUpdateStatus(true);
    setUpdateStatusError(null);
    try {
      const res = await fetchHelpdeskUpdateStatus({
        ...payload,
        sourceMode: overrideSource ?? updateSourceMode,
        withOnlineScan,
      });
      setUpdateStatusData(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setUpdateStatusData(null);
      setUpdateStatusError(
        err?.message ||
          (isEn
            ? 'Failed to inspect Windows Update & WSUS policy.'
            : 'خطا در بررسی وضعیت Windows Update و پالیسی WSUS.')
      );
    } finally {
      setLoadingUpdateStatus(false);
      notifyHelpdeskAuditUpdated();
    }
  };

  const handleInstallUpdates = async (kbFilter?: string[]) => {
    const payload = buildPayload();
    if (!payload) return;
    const busyKey = kbFilter && kbFilter.length > 0 ? kbFilter[0] : 'ALL';
    setInstallingUpdates(busyKey);
    setConfirmInstallAllUpdates(false);
    setUpdateActionError(null);
    setUpdateActionResult(null);
    try {
      const res = await installHelpdeskWindowsUpdates({
        ...payload,
        source: updateSourceMode,
        kbFilter,
      });
      setUpdateActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      await Promise.all([
        handleInspectUpdateStatus(updateSourceMode, true).catch(() => {}),
        handleInspectSysInfo().catch(() => {}),
      ]);
    } catch (err: any) {
      setUpdateActionError(
        err?.message || (isEn ? 'Windows Update installation failed.' : 'نصب آپدیت‌های ویندوز با خطا مواجه شد.')
      );
    } finally {
      setInstallingUpdates(null);
      notifyHelpdeskAuditUpdated();
    }
  };

  const handleUninstallHotfix = async (kbId: string) => {
    const payload = buildPayload();
    if (!payload) return;
    const cleanKb = kbId.trim().toUpperCase();
    if (!cleanKb) return;
    setUninstallingKb(cleanKb);
    setConfirmUninstallKb(null);
    setUpdateActionError(null);
    setUpdateActionResult(null);
    try {
      const res = await uninstallHelpdeskHotfix({ ...payload, kbId: cleanKb });
      setUpdateActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      setManualKbUninstall('');
      try {
        await handleInspectSysInfo();
      } catch {}
    } catch (err: any) {
      setUpdateActionError(
        err?.message || (isEn ? `Failed to uninstall ${cleanKb}.` : `حذف آپدیت ${cleanKb} ناموفق بود.`)
      );
    } finally {
      setUninstallingKb(null);
      notifyHelpdeskAuditUpdated();
    }
  };

  const handleInspectPrograms = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setLoadingPrograms(true);
    setProgramsError(null);
    setConfirmUninstallProgId(null);
    try {
      const res = await fetchHelpdeskPrograms(payload);
      setProgramsData(res.data);
      setProgramPage(1);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setProgramsData(null);
      setProgramsError(
        err?.message ||
          (isEn
            ? 'Failed to collect installed applications from endpoint.'
            : 'خطا در دریافت لیست برنامه‌های نصب‌شده از سیستم کاربر.')
      );
    } finally {
      setLoadingPrograms(false);
    }
  };

  const handleUninstallProgram = async (prog: any) => {
    const payload = buildPayload();
    if (!payload || !prog) return;
    setUninstallingProgId(String(prog.id));
    setConfirmUninstallProgId(null);
    setProgramActionError(null);
    setProgramActionResult(null);
    try {
      const res = await uninstallHelpdeskProgram({
        ...payload,
        programName: String(prog.name || ''),
        registryHive: prog.registryHive,
        registryKeyName: String(prog.registryKeyName || ''),
        ownerSid: prog.ownerSid ? String(prog.ownerSid) : undefined,
      });
      setProgramActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      // Refresh list cleanly after uninstall attempt
      try {
        await handleInspectPrograms();
      } catch {}
    } catch (err: any) {
      setProgramActionError(
        err?.message ||
          (isEn
            ? `Failed to uninstall "${prog.name}".`
            : `حذف نرم‌افزار «${prog.name}» با خطا مواجه شد.`)
      );
    } finally {
      setUninstallingProgId(null);
      notifyHelpdeskAuditUpdated();
    }
  };

  const handleExportProgramsCsv = () => {
    const list: any[] = filteredAndSortedPrograms;
    if (!list || list.length === 0) return;
    const headers = [
      'Name',
      'Version',
      'Publisher',
      'Scope',
      'Arch',
      'OwnerUser',
      'InstallerType',
      'SizeMB',
      'InstallDate',
      'InstallLocation',
      'ProductCode',
      'RegistryHive',
      'RegistryKeyName',
      'Protected',
    ];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = list.map((p) =>
      [
        p.name,
        p.version,
        p.publisher,
        p.scope,
        p.arch,
        p.ownerUser || '',
        p.installerType,
        p.sizeMb || 0,
        p.installDate || '',
        p.installLocation || '',
        p.productCode || '',
        p.registryHive,
        p.registryKeyName,
        p.isProtected ? 'Yes' : 'No',
      ]
        .map(esc)
        .join(',')
    );
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `installed_programs_${programsData?.hostname || targetIp || 'endpoint'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleInspectDisks = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setLoadingDiskHealth(true);
    setDiskHealthError(null);
    try {
      const res = await fetchHelpdeskDiskHealth(payload);
      setDiskHealthData(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setDiskHealthData(null);
      setDiskHealthError(
        err?.message || (isEn ? 'Failed to inspect disk media types.' : 'خطا در شناسایی نوع دیسک‌ها (HDD/SSD).')
      );
    } finally {
      setLoadingDiskHealth(false);
    }
  };

  const handleRunSystemRepair = async (
    mode:
      | 'sfc_verify'
      | 'sfc_scannow'
      | 'dism_check'
      | 'dism_scan'
      | 'dism_restore'
      | 'chkdsk_readonly'
      | 'chkdsk_hdd_badsector',
    driveLetter?: string
  ) => {
    const payload = buildPayload();
    if (!payload) return;
    const key = driveLetter ? `${mode}:${driveLetter}` : mode;
    setRunningRepairMode(key);
    setConfirmRepairKey(null);
    setRepairError(null);
    setRepairResult(null);
    try {
      const res = await executeHelpdeskSystemRepair({ ...payload, mode, driveLetter });
      setRepairResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setRepairError(
        err?.message || (isEn ? 'System repair execution failed.' : 'اجرای عملیات بررسی یا تعمیر سیستم ناموفق بود.')
      );
    } finally {
      setRunningRepairMode(null);
    }
  };

  const handleExecutePowerControl = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setRunningPower(true);
    setConfirmPowerAction(false);
    setPowerError(null);
    setPowerResult(null);
    try {
      const isSched = powerAction === 'restart_scheduled' || powerAction === 'shutdown_scheduled';
      const delaySec = isSched ? Math.max(30, Math.round(powerDelayMinutes * 60)) : undefined;
      const res = await executeHelpdeskPowerControl({
        ...payload,
        powerAction,
        delaySeconds: delaySec,
        reason: powerReason.trim() || undefined,
      });
      setPowerResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setPowerError(
        err?.message || (isEn ? 'Remote power control failed.' : 'اجرای دستور پاور از راه دور ناموفق بود.')
      );
    } finally {
      setRunningPower(false);
      notifyHelpdeskAuditUpdated();
    }
  };

  const handleUserSessionAction = async (
    action: 'lock' | 'logoff',
    sessionId?: string,
    targetUser?: string,
    rowKey?: string
  ) => {
    const payload = buildPayload();
    if (!payload) return;
    const busyKey = rowKey || `quick:${action}`;
    setSessionActionBusy(busyKey);
    setConfirmLogoffKey(null);
    setSessionActionError(null);
    setSessionActionResult(null);
    try {
      const res = await executeHelpdeskUserSessionAction({
        ...payload,
        action,
        sessionId: sessionId || undefined,
        username: targetUser || undefined,
      });
      setSessionActionResult(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
      // Re-inspect sessions after a short delay so live presence & state update naturally
      setTimeout(() => {
        if (targetIp.trim() && username.trim() && password) {
          handleInspectLogons();
        }
      }, 900);
    } catch (err: any) {
      setSessionActionError(
        err?.message ||
          (isEn
            ? `Failed to ${action} workstation user session.`
            : `اجرای عملیات ${action === 'lock' ? 'قفل صفحه' : 'خروج کاربر'} ناموفق بود.`)
      );
    } finally {
      setSessionActionBusy(null);
      notifyHelpdeskAuditUpdated();
    }
  };

  const handleInspectBattery = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setLoadingBattery(true);
    setBatteryError(null);
    try {
      const res = await fetchHelpdeskBatteryReport(payload);
      setBatteryData(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setBatteryData(null);
      setBatteryError(
        err?.message || (isEn ? 'Failed to generate battery health report.' : 'خطا در دریافت گزارش سلامت باتری.')
      );
    } finally {
      setLoadingBattery(false);
    }
  };

  const handleInspectDomainUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    const targetUser = domainQueryUser.trim();
    if (!targetUser) {
      setDomainUserError(
        isEn ? 'Enter a domain username (sAMAccountName) first.' : 'ابتدا نام کاربری دامین (مثلاً a.rezaei) را وارد کنید.'
      );
      return;
    }
    setLoadingDomainUser(true);
    setDomainUserError(null);
    try {
      const res = await inspectHelpdeskDomainUser({ ...payload, domainUsername: targetUser });
      setDomainUserData(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setDomainUserData(null);
      setDomainUserError(
        err?.message || (isEn ? 'Domain user lookup failed.' : 'استعلام وضعیت اکانت دامین با خطا مواجه شد.')
      );
    } finally {
      setLoadingDomainUser(false);
    }
  };

  const notifyHelpdeskAuditUpdated = () => {
    try {
      window.dispatchEvent(new CustomEvent('nettopology_audit_log_updated'));
    } catch {}
  };

  const handleInspectLogons = async (overrideHoursBack?: number) => {
    const payload = buildPayload();
    if (!payload) return;
    setLoadingLogons(true);
    setLogonsError(null);
    try {
      const hours = overrideHoursBack ?? logonsHoursBack;
      const res = await fetchHelpdeskEndpointLogons({
        ...payload,
        hoursBack: hours,
        maxEvents: 120,
      });
      setLogonsData(res.data);
      if (res.rateLimit) setRateLimit(res.rateLimit);
    } catch (err: any) {
      setLogonsData(null);
      setLogonsError(
        err?.message ||
          (isEn
            ? 'Failed to inspect workstation user logins & active sessions.'
            : 'خطا در دریافت گزارش ورود کاربران و نشست‌های فعال سیستم.')
      );
    } finally {
      setLoadingLogons(false);
      notifyHelpdeskAuditUpdated();
    }
  };

  const handleStopPrefetch = () => {
    stopHelpdeskPrefetch();
  };

  const handleConnectCurrentTab = async (e?: React.FormEvent, overridePayload?: HelpdeskConnectionPayload) => {
    if (e) e.preventDefault();
    const payload = overridePayload || buildPayload();
    if (!payload) return;
    setReconnectBanner(null);
    if (activeSubTab === 'history') {
      setActiveSubTab('health');
    }
    await runHelpdeskSequentialConnect({
      payload,
      isEn,
      canViewEventViewer,
      eventChannel,
      eventHoursBack,
      eventSeverityMode,
      logonsHoursBack,
      onNetworkLoaded: syncNetworkFormDefaults,
    });
    if (activeSubTab === 'history') {
      loadConnectionHistory({ page: 1 });
    }
  };

  const handleReconnectFromHistory = async (item: HelpdeskConnectionHistoryItem) => {
    const rawProto = (item.protocolUsed || item.protocolRequested || 'auto').toLowerCase();
    const mappedProtocol: HelpdeskRamState['protocol'] =
      rawProto === 'winrm_https' ||
      rawProto === 'winrm_http' ||
      rawProto === 'smb_rpc' ||
      rawProto === 'ssh'
        ? rawProto
        : 'auto';
    const nextUser = item.sessionUsername || username.trim();
    const standardPort =
      mappedProtocol === 'winrm_https'
        ? 5986
        : mappedProtocol === 'winrm_http'
        ? 5985
        : mappedProtocol === 'smb_rpc'
        ? 445
        : mappedProtocol === 'ssh'
        ? 22
        : 0;
    const customPortStr =
      item.portUsed && standardPort && item.portUsed !== standardPort ? String(item.portUsed) : '';

    patchHelpdeskRamSnapshot({
      targetIp: item.targetIp,
      protocol: mappedProtocol,
      customPort: customPortStr,
      username: nextUser,
      jeaConfigName: item.jeaConfigName || '',
      activeSubTab: 'health',
      healthError: null,
    });

    const canImmediateConnect =
      Boolean(password) &&
      Boolean(nextUser) &&
      (!item.sessionUsername || username.trim().toLowerCase() === item.sessionUsername.trim().toLowerCase());

    if (canImmediateConnect) {
      await handleConnectCurrentTab(undefined, {
        targetIp: item.targetIp,
        protocol: mappedProtocol,
        port: customPortStr ? Number(customPortStr) : undefined,
        username: nextUser,
        password,
        jeaConfigName: item.jeaConfigName || undefined,
      });
    } else {
      setReconnectBanner({ targetIp: item.targetIp, username: nextUser });
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 60);
    }
  };

  const handleDeleteHistoryItem = async (id: string) => {
    setBusyHistoryId(id);
    setHistoryError(null);
    setHistoryNotice(null);
    try {
      await deleteHelpdeskConnectionHistoryItem(id);
      setHistoryNotice({
        ok: true,
        text: isEn ? 'Connection history entry removed.' : 'رکورد انتخاب‌شده از تاریخچه اتصالات حذف شد.',
      });
      await loadConnectionHistory();
      notifyHelpdeskAuditUpdated();
    } catch (err: any) {
      setHistoryError(err?.message || (isEn ? 'Failed to remove history entry.' : 'حذف رکورد تاریخچه ناموفق بود.'));
    } finally {
      setBusyHistoryId(null);
    }
  };

  const handleClearAllHistory = async () => {
    setBusyHistoryId('ALL');
    setConfirmClearHistory(false);
    setHistoryError(null);
    setHistoryNotice(null);
    try {
      const res = await clearHelpdeskConnectionHistory();
      setHistoryNotice({
        ok: true,
        text: isEn
          ? `Cleared ${res.clearedCount} connection history record(s).`
          : `تعداد ${res.clearedCount} رکورد از تاریخچه اتصالات با موفقیت پاک شد.`,
      });
      await loadConnectionHistory({ page: 1 });
      notifyHelpdeskAuditUpdated();
    } catch (err: any) {
      setHistoryError(err?.message || (isEn ? 'Failed to clear history.' : 'پاک‌سازی تاریخچه اتصالات ناموفق بود.'));
    } finally {
      setBusyHistoryId(null);
    }
  };

  const handleExportHistoryCsv = () => {
    if (historyItems.length === 0) return;
    const headers = [
      'Connected At',
      'Target IP',
      'Hostname',
      'OS',
      'Logged-In PC User',
      'Session Username',
      'Protocol Used',
      'Port',
      'Status',
      'Operator',
      'Error',
    ];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = historyItems.map((it) =>
      [
        it.connectedAt,
        it.targetIp,
        it.hostname,
        it.osName,
        it.loggedInUser,
        it.sessionUsername,
        it.protocolUsed || it.protocolRequested,
        it.portUsed || '',
        it.status,
        it.actorName,
        it.errorMessage || '',
      ]
        .map(esc)
        .join(',')
    );
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `helpdesk_connection_history_p${historyPage}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatLogonTimestamp = (isoStr?: string) => {
    if (!isoStr || !String(isoStr).trim()) return '—';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return String(isoStr);
    try {
      return d.toLocaleString(isEn ? 'en-US' : 'fa-IR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return d.toISOString().replace('T', ' ').slice(0, 19);
    }
  };

  const filteredLogonEvents = useMemo(() => {
    const list: any[] = Array.isArray(logonsData?.events) ? logonsData.events : [];
    const q = logonsSearch.trim().toLowerCase();
    return list.filter((ev) => {
      if (logonsEventFilter === 'logon' && ev.eventType !== 'logon') return false;
      if (logonsEventFilter === 'logoff' && ev.eventType !== 'logoff') return false;
      if (logonsEventFilter === 'lock_unlock' && ev.eventType !== 'lock' && ev.eventType !== 'unlock') {
        return false;
      }
      if (
        logonsEventFilter === 'rdp' &&
        ev.eventType !== 'rdp_disconnect' &&
        ev.eventType !== 'rdp_reconnect' &&
        ev.logonTypeCode !== 10 &&
        ev.logonTypeCode !== 12
      ) {
        return false;
      }
      if (logonsEventFilter === 'failed' && ev.eventType !== 'failed') return false;
      if (!q) return true;
      return (
        String(ev.username || '').toLowerCase().includes(q) ||
        String(ev.domain || '').toLowerCase().includes(q) ||
        String(ev.sourceIp || '').toLowerCase().includes(q) ||
        String(ev.sourceHost || '').toLowerCase().includes(q) ||
        String(ev.logonTypeLabel || '').toLowerCase().includes(q) ||
        String(ev.logonTypeLabelFa || '').toLowerCase().includes(q) ||
        String(ev.failureReason || '').toLowerCase().includes(q) ||
        String(ev.eventId || '').includes(q)
      );
    });
  }, [logonsData, logonsSearch, logonsEventFilter]);

  const filteredUserSummaries = useMemo(() => {
    const list: any[] = Array.isArray(logonsData?.userSummaries) ? logonsData.userSummaries : [];
    const q = logonsSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (u) =>
        String(u.username || '').toLowerCase().includes(q) ||
        String(u.sid || '').toLowerCase().includes(q) ||
        String(u.lastSourceIp || '').toLowerCase().includes(q) ||
        String(u.currentState || '').toLowerCase().includes(q)
    );
  }, [logonsData, logonsSearch]);

  // Filtered Event Viewer items for Tab 4
  const filteredEvents = useMemo(() => {
    const list: any[] = Array.isArray(eventData?.events) ? eventData.events : [];
    const q = eventSearch.trim().toLowerCase();
    return list.filter((ev) => {
      if (eventLevelFilter !== 'all' && ev.level !== eventLevelFilter) return false;
      if (!q) return true;
      const exp = ev.explanation || {};
      return (
        String(ev.eventId || '').includes(q) ||
        String(ev.source || '').toLowerCase().includes(q) ||
        String(ev.rawMessage || '').toLowerCase().includes(q) ||
        String(exp.humanTitleEn || '').toLowerCase().includes(q) ||
        String(exp.humanTitleFa || '').toLowerCase().includes(q) ||
        String(exp.humanReasonEn || '').toLowerCase().includes(q) ||
        String(exp.humanReasonFa || '').toLowerCase().includes(q) ||
        String(exp.likelyCauseEn || '').toLowerCase().includes(q) ||
        String(exp.likelyCauseFa || '').toLowerCase().includes(q)
      );
    });
  }, [eventData, eventSearch, eventLevelFilter]);

  // Filtered & sorted process list for Module 1 (with Asc/Desc + 20/page pagination)
  const filteredProcesses = useMemo(() => {
    const list: any[] = Array.isArray(healthData?.processes) ? healthData.processes : [];
    const q = processSearch.trim().toLowerCase();
    const filtered = q
      ? list.filter(
          (p) =>
            String(p.name || '').toLowerCase().includes(q) ||
            String(p.pid || '').includes(q) ||
            String(p.status || '').toLowerCase().includes(q)
        )
      : list;
    const mult = processSortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (processSort === 'memory') {
        const diff = (Number(a.memoryMb) || 0) - (Number(b.memoryMb) || 0);
        if (diff !== 0) return diff * mult;
        return ((Number(a.cpuPercent) || 0) - (Number(b.cpuPercent) || 0)) * mult;
      }
      if (processSort === 'name') {
        const cmp = String(a.name || '').localeCompare(String(b.name || ''));
        if (cmp !== 0) return cmp * mult;
        return (Number(a.pid) || 0) - (Number(b.pid) || 0);
      }
      if (processSort === 'pid') {
        return ((Number(a.pid) || 0) - (Number(b.pid) || 0)) * mult;
      }
      const cpuDiff = (Number(a.cpuPercent) || 0) - (Number(b.cpuPercent) || 0);
      if (cpuDiff !== 0) return cpuDiff * mult;
      return ((Number(a.memoryMb) || 0) - (Number(b.memoryMb) || 0)) * mult;
    });
  }, [healthData, processSearch, processSort, processSortDir]);

  const processTotalPages = Math.max(1, Math.ceil(filteredProcesses.length / PROCESS_PAGE_SIZE));
  const clampedProcessPage = Math.min(Math.max(1, processPage), processTotalPages);
  const paginatedProcesses = useMemo(() => {
    const start = (clampedProcessPage - 1) * PROCESS_PAGE_SIZE;
    return filteredProcesses.slice(start, start + PROCESS_PAGE_SIZE);
  }, [filteredProcesses, clampedProcessPage]);

  const handleToggleProcessColumnSort = (col: 'cpu' | 'memory' | 'name' | 'pid') => {
    if (processSort === col) {
      setProcessSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setProcessSort(col);
      setProcessSortDir(col === 'name' || col === 'pid' ? 'asc' : 'desc');
    }
    if (col === 'cpu' || col === 'memory') {
      setDonutMetric(col);
    }
    setProcessPage(1);
  };

  // Filtered, sorted, and paginated Add / Remove Programs list
  const PROGRAMS_PAGE_SIZE = 20;
  const filteredAndSortedPrograms = useMemo(() => {
    const list: any[] = Array.isArray(programsData?.programs) ? programsData.programs : [];
    const q = programSearch.trim().toLowerCase();
    const filtered = list.filter((p) => {
      if (programScopeFilter !== 'all' && p.scope !== programScopeFilter) return false;
      if (programTypeFilter === 'msi' && p.installerType !== 'msi') return false;
      if (programTypeFilter === 'exe' && p.installerType === 'msi') return false;
      if (!q) return true;
      return (
        String(p.name || '').toLowerCase().includes(q) ||
        String(p.publisher || '').toLowerCase().includes(q) ||
        String(p.version || '').toLowerCase().includes(q) ||
        String(p.installLocation || '').toLowerCase().includes(q) ||
        String(p.productCode || '').toLowerCase().includes(q) ||
        String(p.ownerUser || '').toLowerCase().includes(q)
      );
    });
    const mult = programSortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (programSort === 'size') {
        const diff = (Number(a.sizeMb) || 0) - (Number(b.sizeMb) || 0);
        if (diff !== 0) return diff * mult;
        return String(a.name || '').localeCompare(String(b.name || ''));
      }
      if (programSort === 'installDate') {
        const cmp = String(a.installDate || '').localeCompare(String(b.installDate || ''));
        if (cmp !== 0) return cmp * mult;
        return String(a.name || '').localeCompare(String(b.name || ''));
      }
      if (programSort === 'publisher') {
        const cmp = String(a.publisher || '').localeCompare(String(b.publisher || ''));
        if (cmp !== 0) return cmp * mult;
        return String(a.name || '').localeCompare(String(b.name || ''));
      }
      return String(a.name || '').localeCompare(String(b.name || '')) * mult;
    });
  }, [programsData, programSearch, programScopeFilter, programTypeFilter, programSort, programSortDir]);

  const programTotalPages = Math.max(1, Math.ceil(filteredAndSortedPrograms.length / PROGRAMS_PAGE_SIZE));
  const clampedProgramPage = Math.min(Math.max(1, programPage), programTotalPages);
  const paginatedPrograms = useMemo(() => {
    const start = (clampedProgramPage - 1) * PROGRAMS_PAGE_SIZE;
    return filteredAndSortedPrograms.slice(start, start + PROGRAMS_PAGE_SIZE);
  }, [filteredAndSortedPrograms, clampedProgramPage]);

  const handleToggleProgramSort = (col: 'name' | 'size' | 'installDate' | 'publisher') => {
    if (programSort === col) {
      setProgramSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setProgramSort(col);
      setProgramSortDir(col === 'size' || col === 'installDate' ? 'desc' : 'asc');
    }
    setProgramPage(1);
  };

  // Top 6 Process Donut segments (SVG circular distribution chart)
  const processDonutSegments = useMemo(() => {
    const list: any[] = Array.isArray(healthData?.processes) ? healthData.processes : [];
    if (list.length === 0) return [];
    const sorted = [...list].sort((a, b) =>
      donutMetric === 'cpu'
        ? (b.cpuPercent || 0) - (a.cpuPercent || 0)
        : (b.memoryPercent || 0) - (a.memoryPercent || 0)
    );
    const top6 = sorted.slice(0, 6);
    const totalUsed = top6.reduce(
      (sum, p) => sum + (donutMetric === 'cpu' ? Number(p.cpuPercent) || 0 : Number(p.memoryPercent) || 0),
      0
    );
    const overallUsed =
      donutMetric === 'cpu'
        ? Number(healthData?.cpu?.usagePercent) || totalUsed
        : Number(healthData?.memory?.usedPercent) || totalUsed;
    const denominator = Math.max(100, overallUsed, totalUsed);

    let cumulative = 0;
    const segments = top6.map((p, idx) => {
      const val = donutMetric === 'cpu' ? Number(p.cpuPercent) || 0 : Number(p.memoryPercent) || 0;
      const pct = Math.max(0, (val / denominator) * 100);
      const startPct = cumulative;
      cumulative += pct;
      return {
        pid: p.pid as number,
        name: String(p.name),
        rawVal: val,
        memoryMb: Number(p.memoryMb) || 0,
        pct,
        startPct,
        color: PROCESS_PALETTE[idx % (PROCESS_PALETTE.length - 1)],
      };
    });

    const otherVal = Math.max(0, overallUsed - totalUsed);
    if (otherVal > 0.2) {
      const otherPct = (otherVal / denominator) * 100;
      segments.push({
        pid: -1,
        name: isEn ? 'Other Processes' : 'سایر پروسس‌ها',
        rawVal: Number(otherVal.toFixed(1)),
        memoryMb: 0,
        pct: otherPct,
        startPct: cumulative,
        color: PROCESS_PALETTE[6],
      });
    }
    return segments;
  }, [healthData, donutMetric, isEn]);

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedJeaKey(key);
      setTimeout(() => setCopiedJeaKey(null), 2000);
    } catch {}
  };

  const handleMinimizeJeaModal = () => {
    dockModal({
      id: 'modal-helpdesk-jea-hardening',
      labelEn: 'HelpDesk JEA & GPO Hardening',
      labelFa: 'اسکریپت امن‌سازی JEA و GPO هلپ‌دسک',
      badge: 'JEA',
      category: 'system',
      onRestore: () => {
        undockModal('modal-helpdesk-jea-hardening');
        setIsJeaModalOpen(true);
      },
      onClose: () => {
        undockModal('modal-helpdesk-jea-hardening');
        setIsJeaModalOpen(false);
      },
    });
    setIsJeaModalOpen(false);
  };

  // Surface styling tokens (60-30-10 discipline, single-level hairline elevation)
  const surfaceBg = isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/75 border-slate-800';
  const subSurfaceBg = isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800';
  const textPrimary = isLightMode ? 'text-slate-900' : 'text-slate-100';
  const textMuted = isLightMode ? 'text-slate-600' : 'text-slate-400';
  const inputCls = isLightMode
    ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-sky-500'
    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-sky-400';

  const isAnyLoading =
    loadingHealth ||
    loadingSysInfo ||
    loadingUpdateStatus ||
    loadingNetwork ||
    loadingPrinters ||
    loadingEvents ||
    loadingLogons ||
    loadingTempScan ||
    loadingGpo ||
    loadingDiskHealth ||
    loadingBattery ||
    loadingDomainUser;

  const filteredHotfixes = useMemo(() => {
    const list: any[] = Array.isArray(sysInfoData?.hotfixes) ? sysInfoData.hotfixes : [];
    const q = hotfixSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (h) =>
        String(h.hotfixId || '').toLowerCase().includes(q) ||
        String(h.description || '').toLowerCase().includes(q) ||
        String(h.installedOn || '').toLowerCase().includes(q)
    );
  }, [sysInfoData, hotfixSearch]);

  const filteredHostsEntries = useMemo(() => {
    const list: any[] = Array.isArray(networkData?.hostsEntries) ? networkData.hostsEntries : [];
    const q = hostsSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (h) =>
        String(h.ip || '').toLowerCase().includes(q) ||
        String(h.hostnames || '').toLowerCase().includes(q) ||
        String(h.comment || '').toLowerCase().includes(q)
    );
  }, [networkData, hostsSearch]);

  const filteredRoutes = useMemo(() => {
    const list: any[] = Array.isArray(networkData?.routes) ? networkData.routes : [];
    const q = routeSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        String(r.destination || '').toLowerCase().includes(q) ||
        String(r.gateway || '').toLowerCase().includes(q) ||
        String(r.netmask || '').toLowerCase().includes(q) ||
        String(r.interfaceName || '').toLowerCase().includes(q)
    );
  }, [networkData, routeSearch]);

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-6 pb-10" dir={isEn ? 'ltr' : 'rtl'}>
      {/* Page Header — Clean Top Contract */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Headphones className="w-6 h-6 text-teal-500 shrink-0" />
            <h1 className={`text-xl font-bold tracking-tight ${textPrimary}`}>
              {isEn ? 'Agentless Endpoint HelpDesk' : 'هلپ‌دسک بدون‌ایجنت سیستم کاربران (HelpDesk)'}
            </h1>
          </div>
          <p className={`mt-1 text-xs ${textMuted}`}>
            {isEn
              ? 'On-Demand Single-Host Support · Zero Stored Credentials · Granular RBAC & Full Audit Trail'
              : 'پشتیبانی لحظه‌ای تک‌سیستمی · بدون ذخیره رمز عبور · کنترل دسترسی دقیق RBAC و ثبت کامل لاگ'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {rateLimit && (
            <div
              className={`px-3 py-2 rounded-lg border text-xs font-mono tabular-nums flex items-center gap-2 ${
                rateLimit.isFrozen
                  ? 'border-rose-500/50 bg-rose-500/10 text-rose-500'
                  : surfaceBg
              }`}
            >
              <ShieldCheck className={`w-4 h-4 ${rateLimit.isFrozen ? 'text-rose-500' : 'text-emerald-500'}`} />
              <span className={textPrimary}>
                {isEn
                  ? `Write Quota: ${rateLimit.remainingWriteActions}/${rateLimit.maxWriteActions} · Hosts: ${rateLimit.distinctHostsUsed}/${rateLimit.maxDistinctHosts}`
                  : `سهمیه تعمیر امن: ${rateLimit.remainingWriteActions}/${rateLimit.maxWriteActions} · سیستم‌ها: ${rateLimit.distinctHostsUsed}/${rateLimit.maxDistinctHosts}`}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsJeaModalOpen(true)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
              isLightMode
                ? 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5 text-teal-500" />
            <span>{isEn ? 'Windows JEA / GPO Hardening' : 'اسکریپت امن‌سازی JEA / GPO'}</span>
          </button>
        </div>
      </div>

      {/* On-Demand Single-Host Connection Bar (Zero Pre-Populated Endpoint List!) */}
      <form
        onSubmit={handleConnectCurrentTab}
        className={`rounded-xl border p-4 sm:p-5 space-y-4 overflow-hidden ${surfaceBg}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold min-w-0">
            <Server className="w-4 h-4 text-sky-500 shrink-0" />
            <span className={`truncate ${textPrimary}`}>
              {isEn ? 'On-Demand Target Workstation Session' : 'اتصال لحظه‌ای به سیستم کاربر (بدون لیست از پیش ثبت‌شده)'}
            </span>
            <FieldInfoTooltip
              isEn={isEn}
              isLightMode={isLightMode}
              fieldName={isEn ? 'On-Demand Single-Host Connection' : 'اتصال لحظه‌ای تک‌سیستمی'}
              whatIsIt={
                isEn
                  ? 'Connects directly to a single workstation IP on demand via WinRM HTTPS/HTTP, Domain Admin SMB/RPC (TCP 445), or SSH without storing endpoint inventory or static passwords.'
                  : 'به صورت لحظه‌ای از طریق WinRM HTTPS/HTTP، پروتکل دامین ادمین SMB/RPC (پورت 445) یا SSH فقط به یک سیستم کاربر متصل می‌شود و هیچ IP یا رمز عبوری را در دیتابیس ذخیره نمی‌کند.'
              }
              whyNeeded={
                isEn
                  ? 'Allows Domain Admins to connect even when WinRM/SSH are disabled on domain-joined PCs, while preventing persistent credential storage and mass lateral movement.'
                  : 'امکان اتصال دامین ادمین به سیستم‌های عضو دامین را حتی زمانی که WinRM و SSH خاموش هستند فراهم می‌کند و هم‌زمان مانع ذخیره رمزهای ثابت کلاینت‌ها می‌شود.'
              }
              example={
                isEn
                  ? 'IP: 192.168.10.45 · Protocol: Auto · User: CORP\\Administrator or admin@corp.local'
                  : 'مثال IP: 192.168.10.45 · پروتکل: Auto · نام کاربری: CORP\\Administrator یا admin@corp.local'
              }
            />
          </div>

          <div className={`text-[11px] flex flex-wrap items-center gap-3 ${textMuted}`}>
            <span>{isEn ? 'Credentials stay in RAM only' : 'رمز عبور فقط در حافظه موقت می‌ماند'}</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setShowAdvancedConn((v) => !v)}
              className="text-sky-500 hover:underline font-medium cursor-pointer"
            >
              {showAdvancedConn
                ? isEn
                  ? 'Hide JEA / Port'
                  : 'بستن تنظیمات JEA / پورت'
                : isEn
                ? 'JEA Endpoint / Port'
                : 'تنظیم JEA / پورت دلخواه'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          {/* Target IP */}
          <div className="lg:col-span-3 min-w-0">
            <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
              {isEn ? 'Target Workstation IP / Hostname' : 'آدرس IP یا نام سیستم کاربر'}
            </label>
            <input
              type="text"
              dir="ltr"
              value={targetIp}
              onChange={(e) => setTargetIp(e.target.value)}
              placeholder="192.168.10.45"
              className={`w-full min-w-0 px-3 py-2 rounded-lg border text-xs font-mono outline-none transition ${inputCls}`}
              required
            />
          </div>

          {/* Protocol */}
          <div className="lg:col-span-2 min-w-0">
            <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
              {isEn ? 'Protocol' : 'پروتکل اتصال'}
            </label>
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as any)}
              className={`w-full min-w-0 px-3 py-2 rounded-lg border text-xs outline-none transition ${inputCls}`}
            >
              <option value="auto">{isEn ? 'Auto (5986 → 5985 → 445 → 22)' : 'خودکار (5986 → 5985 → 445 → 22)'}</option>
              <option value="winrm_https">WinRM HTTPS (5986)</option>
              <option value="winrm_http">WinRM HTTP (5985)</option>
              <option value="smb_rpc">{isEn ? 'Domain Admin SMB/RPC (445)' : 'دامین ادمین SMB/RPC (445)'}</option>
              <option value="ssh">OpenSSH / Linux (22)</option>
            </select>
          </div>

          {/* Ephemeral Username */}
          <div className="lg:col-span-2 min-w-0">
            <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
              {isEn ? 'Session Username' : 'نام کاربری نشست'}
            </label>
            <input
              type="text"
              dir="ltr"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="CORP\Administrator"
              className={`w-full min-w-0 px-3 py-2 rounded-lg border text-xs font-mono outline-none transition ${inputCls}`}
              required
            />
          </div>

          {/* Ephemeral Password */}
          <div className="lg:col-span-2 min-w-0">
            <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
              {isEn ? 'Session Password (Ephemeral)' : 'رمز عبور موقت نشست'}
            </label>
            <div className="relative">
              <input
                ref={passwordInputRef}
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (reconnectBanner) setReconnectBanner(null);
                }}
                placeholder="••••••••••••"
                className={`w-full min-w-0 px-3 py-2 rounded-lg border text-xs font-mono outline-none transition pe-9 ${inputCls}`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className={`absolute top-1/2 -translate-y-1/2 end-2.5 p-1 ${textMuted} hover:text-sky-500 cursor-pointer`}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Primary Action + Wipe */}
          <div className="md:col-span-2 lg:col-span-3 min-w-0 flex items-center gap-2">
            <button
              type="submit"
              disabled={!canRunDiagnostics || loadingHealth}
              className="flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition whitespace-nowrap cursor-pointer"
            >
              {loadingHealth ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Activity className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">{isEn ? 'Connect & Inspect' : 'اتصال و پایش'}</span>
            </button>
            <button
              type="button"
              onClick={handleClearSession}
              title={isEn ? 'Wipe session credentials & results from memory' : 'پاک‌سازی فوری IP، رمز و نتایج از حافظه'}
              aria-label={isEn ? 'Wipe session' : 'پاک‌سازی نشست'}
              className={`shrink-0 h-[34px] w-[34px] flex items-center justify-center rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {reconnectBanner && (
          <div
            className={`px-3 py-2 rounded-lg border flex flex-wrap items-center justify-between gap-2 text-xs ${
              isLightMode
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <KeyRound className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>
                {isEn
                  ? `Pre-filled ${reconnectBanner.targetIp}${reconnectBanner.username ? ` (${reconnectBanner.username})` : ''} from history. Enter the ephemeral password above and click "Connect & Inspect".`
                  : `اطلاعات اتصال به ${reconnectBanner.targetIp}${reconnectBanner.username ? ` (${reconnectBanner.username})` : ''} از تاریخچه پر شد. رمز عبور موقت را در فیلد بالا وارد کرده و «اتصال و پایش» را بزنید.`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReconnectBanner(null)}
              className="opacity-70 hover:opacity-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {prefetchProgress?.active && (
          <div
            className={`px-3 py-2 rounded-lg border flex flex-wrap items-center justify-between gap-2 text-xs ${
              isLightMode
                ? 'bg-sky-50 border-sky-200 text-sky-900'
                : 'bg-sky-950/30 border-sky-500/30 text-sky-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin shrink-0" />
              <span>
                {isEn
                  ? `Fetching all tabs sequentially (${prefetchProgress.step}/${prefetchProgress.total}): ${prefetchProgress.labelEn}...`
                  : `در حال دریافت خودکار اطلاعات تب‌ها به ترتیب (${prefetchProgress.step} از ${prefetchProgress.total}): ${prefetchProgress.labelFa}...`}
              </span>
            </div>
            <button
              type="button"
              onClick={handleStopPrefetch}
              className="px-2 py-0.5 rounded border border-sky-500/40 hover:bg-sky-500/15 text-[11px] font-semibold cursor-pointer"
            >
              {isEn ? 'Stop' : 'توقف'}
            </button>
          </div>
        )}

        {showAdvancedConn && (
          <div className={`pt-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-3 ${isLightMode ? 'border-slate-200' : 'border-slate-800'}`}>
            <div>
              <label className={`block text-xs font-medium mb-1 ${textMuted}`}>
                {isEn ? 'Custom Windows JEA Endpoint Name (Optional)' : 'نام JEA Endpoint محدودشده ویندوز (اختیاری)'}
              </label>
              <input
                type="text"
                dir="ltr"
                value={jeaConfigName}
                onChange={(e) => setJeaConfigName(e.target.value)}
                placeholder="HelpDeskSafeJEA"
                className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
              />
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1 ${textMuted}`}>
                {isEn ? 'Custom Port Override (Optional)' : 'پورت دلخواه (اختیاری)'}
              </label>
              <input
                type="number"
                dir="ltr"
                min={1}
                max={65535}
                value={customPort}
                onChange={(e) => setCustomPort(e.target.value)}
                placeholder="5986 / 5985 / 22"
                className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
              />
            </div>
          </div>
        )}
      </form>

      {/* Segmented Workspace Navigation Tabs (Interactive Controls) */}
      <div
        className={`flex flex-wrap items-center gap-1 p-1 rounded-xl border ${
          isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}
      >
        {[
          {
            id: 'health' as HelpdeskSubTab,
            icon: Cpu,
            labelEn: 'Health & Safe Process Control',
            labelFa: 'سلامت سیستم و کنترل پروسس‌ها',
          },
          {
            id: 'hardware' as HelpdeskSubTab,
            icon: CircuitBoard,
            labelEn: 'Hardware & Peripherals',
            labelFa: 'سخت‌افزار و تجهیزات متصل',
          },
          {
            id: 'network' as HelpdeskSubTab,
            icon: Network,
            labelEn: 'Network & Safe Reset',
            labelFa: 'عیب‌یابی شبکه و ریست امن',
          },
          {
            id: 'printers' as HelpdeskSubTab,
            icon: Printer,
            labelEn: 'Printers & Spooler',
            labelFa: 'پرینترها و Spooler',
          },
          {
            id: 'events' as HelpdeskSubTab,
            icon: FileWarning,
            labelEn: 'Event Viewer (Human Guide)',
            labelFa: 'Event Viewer (تحلیل خطاها)',
          },
          {
            id: 'logins' as HelpdeskSubTab,
            icon: History,
            labelEn: 'User Logins, Sessions & Power',
            labelFa: 'ورود کاربران، نشست و پاور',
          },
          {
            id: 'updates' as HelpdeskSubTab,
            icon: Download,
            labelEn: 'Updates, WSUS & System Info',
            labelFa: 'آپدیت ویندوز، WSUS و مشخصات سیستم',
          },
          {
            id: 'programs' as HelpdeskSubTab,
            icon: PackageCheck,
            labelEn: 'Add / Remove Programs',
            labelFa: 'برنامه‌های نصب‌شده (Add/Remove)',
          },
          {
            id: 'maintenance' as HelpdeskSubTab,
            icon: Wrench,
            labelEn: 'System Repair, Temp & GPO',
            labelFa: 'تعمیر سیستم، Temp و GPO',
          },
          {
            id: 'hardware_domain' as HelpdeskSubTab,
            icon: BatteryCharging,
            labelEn: 'Battery & Domain Account',
            labelFa: 'سلامت باتری و اکانت دامین',
          },
          {
            id: 'history' as HelpdeskSubTab,
            icon: Clock,
            labelEn: 'Connection History',
            labelFa: 'تاریخچه اتصالات',
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          const isFetchingThisTab =
            (prefetchProgress?.active && prefetchProgress.currentTab === tab.id) ||
            (tab.id === 'health' && loadingHealth) ||
            (tab.id === 'hardware' && loadingHardware) ||
            (tab.id === 'network' && loadingNetwork) ||
            (tab.id === 'printers' && loadingPrinters) ||
            (tab.id === 'events' && loadingEvents) ||
            (tab.id === 'logins' && loadingLogons) ||
            (tab.id === 'updates' && (loadingSysInfo || loadingUpdateStatus)) ||
            (tab.id === 'programs' && loadingPrograms) ||
            (tab.id === 'maintenance' && (loadingTempScan || loadingGpo || loadingDiskHealth)) ||
            (tab.id === 'hardware_domain' && loadingBattery) ||
            (tab.id === 'history' && loadingHistory);
          const hasTabData =
            (tab.id === 'health' && Boolean(healthData)) ||
            (tab.id === 'hardware' && Boolean(hardwareData)) ||
            (tab.id === 'network' && Boolean(networkData)) ||
            (tab.id === 'printers' && Boolean(printerData)) ||
            (tab.id === 'events' && Boolean(eventData)) ||
            (tab.id === 'logins' && Boolean(logonsData)) ||
            (tab.id === 'updates' && Boolean(sysInfoData || updateStatusData)) ||
            (tab.id === 'programs' && Boolean(programsData)) ||
            (tab.id === 'maintenance' && Boolean(tempScanData || gpoData || diskHealthData)) ||
            (tab.id === 'hardware_domain' && Boolean(batteryData)) ||
            (tab.id === 'history' && Boolean(historyStats?.totalConnections));

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveSubTab(tab.id);
                if (tab.id === 'history') {
                  loadConnectionHistory();
                  return;
                }
                if (!prefetchProgress?.active && targetIp.trim() && username.trim() && password) {
                  if (tab.id === 'hardware' && !hardwareData && !loadingHardware) handleInspectHardware();
                  else if (tab.id === 'network' && !networkData && !loadingNetwork) handleInspectNetwork();
                  else if (tab.id === 'printers' && !printerData && !loadingPrinters) handleInspectPrinters();
                  else if (tab.id === 'events' && canViewEventViewer && !eventData && !loadingEvents) handleInspectEvents();
                  else if (tab.id === 'logins' && !logonsData && !loadingLogons) handleInspectLogons();
                  else if (tab.id === 'updates') {
                    if (!sysInfoData && !loadingSysInfo) handleInspectSysInfo();
                    if (!updateStatusData && !loadingUpdateStatus) handleInspectUpdateStatus('auto', true);
                  } else if (tab.id === 'programs' && !programsData && !loadingPrograms) {
                    handleInspectPrograms();
                  } else if (tab.id === 'maintenance') {
                    if (!tempScanData && !loadingTempScan) handleScanTemp();
                    if (!gpoData && !loadingGpo) handleInspectGpo();
                    if (!diskHealthData && !loadingDiskHealth) handleInspectDisks();
                  } else if (tab.id === 'hardware_domain' && !batteryData && !loadingBattery) handleInspectBattery();
                }
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                active
                  ? isLightMode
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'bg-slate-800 text-white shadow-xs'
                  : isLightMode
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {isFetchingThisTab ? (
                <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin" />
              ) : (
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-sky-500' : ''}`} />
              )}
              <span>{isEn ? tab.labelEn : tab.labelFa}</span>
              {!isFetchingThisTab && hasTabData && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* =================================================================== */}
      {/* TAB 1: SYSTEM HEALTH & LIVE VISUAL PROCESS TELEMETRY                */}
      {/* =================================================================== */}
      {activeSubTab === 'health' && (
        <div className="space-y-6">
          {healthError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 flex items-start gap-3 text-xs text-rose-500">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold">
                  {isEn ? 'Endpoint Connection / Telemetry Error' : 'خطا در اتصال یا دریافت وضعیت سیستم کاربر'}
                </div>
                <div className={isLightMode ? 'text-rose-800' : 'text-rose-200'}>{healthError}</div>
              </div>
            </div>
          )}

          {!healthData && !loadingHealth && (
            <div className={`rounded-xl border p-10 text-center space-y-3 ${surfaceBg}`}>
              <Cpu className="w-10 h-10 mx-auto text-sky-500 opacity-80" />
              <h2 className={`text-base font-bold ${textPrimary}`}>
                {isEn ? 'Ready for Live Endpoint Health Inspection' : 'آماده پایش لحظه‌ای سلامت و پروسس‌های سیستم کاربر'}
              </h2>
              <p className={`text-xs max-w-xl mx-auto ${textMuted}`}>
                {isEn
                  ? 'Enter the user workstation IP and ephemeral credentials above, then click "Connect & Inspect". Live CPU, RAM, Disk radial gauges, security posture, and interactive process rings will populate directly from the endpoint.'
                  : 'آدرس IP سیستم کاربر و مشخصات ورود موقت را در نوار بالا وارد کرده و دکمه «اتصال و پایش» را بزنید. نمودارهای دایره‌ای CPU، RAM، دیسک، وضعیت امنیت و نمای گرافیکی پروسس‌ها به صورت مستقیم و واقعی از سیستم کاربر خوانده می‌شود.'}
              </p>
            </div>
          )}

          {loadingHealth && (
            <div className={`rounded-xl border p-10 text-center space-y-3 ${surfaceBg}`}>
              <Loader2 className="w-8 h-8 mx-auto text-sky-500 animate-spin" />
              <div className={`text-sm font-semibold ${textPrimary}`}>
                {isEn
                  ? `Connecting to ${targetIp} and sampling live CPU, memory, disk & process telemetry...`
                  : `در حال اتصال به ${targetIp} و خواندن لحظه‌ای وضعیت CPU، RAM، دیسک و پروسس‌ها...`}
              </div>
            </div>
          )}

          {healthData && !loadingHealth && (
            <>
              {/* Endpoint Identity & Security Strip */}
              <div className={`rounded-xl border p-4 sm:p-5 ${surfaceBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h2 className={`text-base font-bold ${textPrimary}`}>
                      {healthData.hostname}
                      <span className={`ms-2 text-xs font-mono font-normal ${textMuted}`}>
                        ({healthData.targetIp})
                      </span>
                    </h2>
                    <div className={`text-xs mt-0.5 flex flex-wrap items-center gap-2 ${textMuted}`}>
                      <span>{healthData.osName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{healthData.protocolUsed.toUpperCase()}:{healthData.portUsed}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {isEn ? 'User' : 'کاربر فعال'}: <strong className={textPrimary}>{healthData.loggedInUser || '-'}</strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {isEn ? 'Uptime' : 'زمان روشن بودن'}: {healthData.uptimeText}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInspectHealth(undefined, undefined, true)}
                    disabled={loadingHealth}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold hover:border-sky-500 transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-sky-500 ${loadingHealth ? 'animate-spin' : ''}`} />
                    <span>{isEn ? 'Refresh Live Data' : 'بروزرسانی زنده'}</span>
                  </button>
                </div>

                {/* 3 Crisp Circular Radial Gauges (CPU, RAM, Primary Disk) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-6">
                  <CircularGauge
                    value={healthData.cpu?.usagePercent ?? 0}
                    label="CPU"
                    primaryText={`${healthData.cpu?.cores ?? 1}C / ${healthData.cpu?.logicalProcessors ?? 1}T`}
                    secondaryText={healthData.cpu?.modelName || (isEn ? 'Processor' : 'پردازنده')}
                    isLightMode={isLightMode}
                  />
                  <CircularGauge
                    value={healthData.memory?.usedPercent ?? 0}
                    label="RAM"
                    primaryText={`${healthData.memory?.usedGb ?? 0} / ${healthData.memory?.totalGb ?? 0} GB`}
                    secondaryText={`${isEn ? 'Free' : 'آزاد'}: ${healthData.memory?.freeGb ?? 0} GB`}
                    isLightMode={isLightMode}
                  />
                  <CircularGauge
                    value={healthData.disks?.[0]?.usedPercent ?? 0}
                    label={healthData.disks?.[0]?.drive || 'Disk'}
                    primaryText={
                      healthData.disks?.[0]
                        ? `${healthData.disks[0].usedGb} / ${healthData.disks[0].totalGb} GB`
                        : '-'
                    }
                    secondaryText={
                      healthData.disks?.[0]
                        ? `${isEn ? 'Free' : 'فضای خالی'}: ${healthData.disks[0].freeGb} GB (${healthData.disks[0].fileSystem || '-'})`
                        : isEn
                        ? 'No fixed disk reported'
                        : 'دیسکی گزارش نشد'
                    }
                    isLightMode={isLightMode}
                  />
                </div>

                {/* Security Posture & Mounted Disks Split */}
                <div className={`pt-4 border-t grid grid-cols-1 lg:grid-cols-2 gap-6 ${isLightMode ? 'border-slate-200' : 'border-slate-800'}`}>
                  {/* Mounted Volumes Progress Bars */}
                  <div className="space-y-3">
                    <div className={`text-xs font-bold flex items-center gap-2 ${textPrimary}`}>
                      <HardDrive className="w-4 h-4 text-sky-500" />
                      <span>{isEn ? 'Storage Volumes Health' : 'وضعیت فضای درایوهای دیسک'}</span>
                    </div>
                    <div className="space-y-2.5">
                      {(healthData.disks || []).map((d: any) => {
                        const pct = Math.max(0, Math.min(100, Number(d.usedPercent) || 0));
                        const barClr =
                          pct >= 90 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-sky-500';
                        return (
                          <div key={d.drive} className="space-y-1">
                            <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                              <span className={`font-semibold ${textPrimary}`}>
                                {d.drive} {d.label ? `(${d.label})` : ''}
                              </span>
                              <span className={textMuted}>
                                {d.usedGb} / {d.totalGb} GB · {isEn ? 'Free' : 'خالی'} {d.freeGb} GB ({pct}%)
                              </span>
                            </div>
                            <div className={`h-2 w-full rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                              <div className={`h-full rounded-full transition-all ${barClr}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Endpoint Security Posture */}
                  <div className="space-y-3">
                    <div className={`text-xs font-bold flex items-center gap-2 ${textPrimary}`}>
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      <span>{isEn ? 'Antivirus & Firewall Posture' : 'وضعیت آنتی‌ویروس و فایروال سیستم'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className={`p-3 rounded-lg border ${subSurfaceBg}`}>
                        <div className={textMuted}>{healthData.security?.antivirusName || 'Antivirus'}</div>
                        <div className={`mt-1 font-bold flex items-center gap-1.5 ${
                          healthData.security?.antivirusEnabled === true
                            ? 'text-emerald-500'
                            : healthData.security?.antivirusEnabled === false
                            ? 'text-rose-500'
                            : textMuted
                        }`}>
                          {healthData.security?.antivirusEnabled === true ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isEn ? 'Enabled' : 'فعال'}</span>
                            </>
                          ) : healthData.security?.antivirusEnabled === false ? (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>{isEn ? 'Disabled' : 'غیرفعال'}</span>
                            </>
                          ) : (
                            <span>{isEn ? 'N/A' : 'نامشخص'}</span>
                          )}
                        </div>
                        {healthData.security?.signatureUpdated && (
                          <div className={`text-[11px] font-mono mt-1 ${textMuted}`}>
                            {isEn ? 'Sig' : 'آپدیت'}: {healthData.security.signatureUpdated}
                          </div>
                        )}
                      </div>

                      <div className={`p-3 rounded-lg border ${subSurfaceBg}`}>
                        <div className={textMuted}>{isEn ? 'Windows / Host Firewall' : 'فایروال سیستم'}</div>
                        <div className="mt-1.5 space-y-1 font-mono text-[11px]">
                          {[
                            { k: 'Domain', v: healthData.security?.firewallDomain },
                            { k: 'Private', v: healthData.security?.firewallPrivate },
                            { k: 'Public', v: healthData.security?.firewallPublic },
                          ].map((fw) => (
                            <div key={fw.k} className="flex items-center justify-between">
                              <span className={textMuted}>{fw.k}</span>
                              <span
                                className={
                                  fw.v === true
                                    ? 'text-emerald-500 font-semibold'
                                    : fw.v === false
                                    ? 'text-rose-500 font-semibold'
                                    : textMuted
                                }
                              >
                                {fw.v === true ? 'ON' : fw.v === false ? 'OFF' : 'N/A'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Graphics (GPU / VRAM) & Audio Hardware Telemetry (Onboard vs Dedicated + Usage) */}
                <div className={`pt-4 mt-4 border-t space-y-4 ${isLightMode ? 'border-slate-200' : 'border-slate-800'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className={`text-xs font-bold flex items-center gap-2 ${textPrimary}`}>
                      <Gpu className="w-4 h-4 text-violet-500" />
                      <span>
                        {isEn
                          ? 'Graphics (GPU), VRAM & Audio Hardware Telemetry (Onboard vs Dedicated)'
                          : 'وضعیت گرافیک (GPU / VRAM)، کارت صدا و تشخیص سخت‌افزار آنبورد / مجزا'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span
                        className={`px-2 py-0.5 rounded-md border font-semibold ${
                          healthData.gpuSummary?.hasDedicatedGpu
                            ? isLightMode
                              ? 'bg-violet-50 border-violet-200 text-violet-700'
                              : 'bg-violet-500/15 border-violet-500/30 text-violet-300'
                            : isLightMode
                            ? 'bg-sky-50 border-sky-200 text-sky-700'
                            : 'bg-sky-500/15 border-sky-500/30 text-sky-300'
                        }`}
                      >
                        {healthData.gpuSummary?.hasDedicatedGpu
                          ? isEn
                            ? 'Dedicated GPU Detected'
                            : 'دارای کارت گرافیک مجزا'
                          : (healthData.gpus?.length || 0) > 0
                          ? healthData.gpus[0].hardwareType === 'virtual'
                            ? isEn
                              ? 'Virtual Display Adapter'
                              : 'آداپتور تصویر مجازی'
                            : isEn
                            ? 'Onboard / Integrated Graphics'
                            : 'گرافیک آنبورد (مجتمع)'
                          : isEn
                          ? 'No GPU Reported'
                          : 'گرافیکی گزارش نشد'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md border font-medium ${
                          isLightMode
                            ? 'bg-slate-100 border-slate-200 text-slate-700'
                            : 'bg-slate-800 border-slate-700 text-slate-300'
                        }`}
                      >
                        {isEn
                          ? `Audio: ${healthData.audioSummary?.onboardCount ?? 0} Onboard · ${healthData.audioSummary?.gpuAudioCount ?? 0} HDMI/GPU · ${healthData.audioSummary?.externalCount ?? 0} Ext`
                          : `صدا: ${healthData.audioSummary?.onboardCount ?? 0} آنبورد · ${healthData.audioSummary?.gpuAudioCount ?? 0} HDMI · ${healthData.audioSummary?.externalCount ?? 0} اکسترنال`}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                    {/* Graphical GPU & VRAM Radial Gauges */}
                    <div className={`xl:col-span-5 rounded-xl border p-4 grid grid-cols-2 gap-4 ${subSurfaceBg}`}>
                      <CircularGauge
                        value={healthData.gpuSummary?.primaryUsagePercent ?? 0}
                        label={isEn ? 'GPU Load' : 'مصرف GPU'}
                        primaryText={
                          healthData.gpuSummary?.primaryUsagePercent !== null &&
                          healthData.gpuSummary?.primaryUsagePercent !== undefined
                            ? `${healthData.gpuSummary.primaryUsagePercent}%`
                            : 'N/A'
                        }
                        secondaryText={
                          healthData.gpuSummary?.primaryGpuName ||
                          (isEn ? 'No active 3D counter' : 'بدون شمارنده فعال')
                        }
                        size={112}
                        isLightMode={isLightMode}
                      />
                      <CircularGauge
                        value={healthData.gpuSummary?.vramUsedPercent ?? 0}
                        label="VRAM"
                        primaryText={
                          (healthData.gpuSummary?.vramTotalMb || 0) > 0
                            ? `${
                                healthData.gpuSummary?.vramUsedMb !== null &&
                                healthData.gpuSummary?.vramUsedMb !== undefined
                                  ? healthData.gpuSummary.vramUsedMb >= 1024
                                    ? `${(healthData.gpuSummary.vramUsedMb / 1024).toFixed(1)}G`
                                    : `${healthData.gpuSummary.vramUsedMb}M`
                                  : '—'
                              } / ${
                                healthData.gpuSummary.vramTotalMb >= 1024
                                  ? `${(healthData.gpuSummary.vramTotalMb / 1024).toFixed(1)} GB`
                                  : `${healthData.gpuSummary.vramTotalMb} MB`
                              }`
                            : isEn
                            ? 'Shared RAM'
                            : 'اشتراکی RAM'
                        }
                        secondaryText={
                          healthData.gpuSummary?.primaryGpuType === 'dedicated'
                            ? isEn
                              ? 'Dedicated Memory'
                              : 'حافظه اختصاصی گرافیک'
                            : isEn
                            ? 'Integrated / Shared'
                            : 'حافظه آنبورد / مشترک'
                        }
                        size={112}
                        isLightMode={isLightMode}
                      />
                    </div>

                    {/* GPU Cards with Utilization & VRAM Bars */}
                    <div className="xl:col-span-7 space-y-2.5">
                      {(healthData.gpus || []).length === 0 ? (
                        <div className={`p-4 rounded-xl border text-xs ${subSurfaceBg} ${textMuted}`}>
                          {isEn ? 'No display adapters reported by endpoint.' : 'هیچ کارت گرافیکی از سیستم گزارش نشد.'}
                        </div>
                      ) : (
                        (healthData.gpus || []).map((gpu: any, idx: number) => {
                          const uVal = gpu.usagePercent !== null && gpu.usagePercent !== undefined ? Number(gpu.usagePercent) : null;
                          const vVal = gpu.vramUsedPercent !== null && gpu.vramUsedPercent !== undefined ? Number(gpu.vramUsedPercent) : null;
                          const typeBadgeCls =
                            gpu.hardwareType === 'dedicated'
                              ? isLightMode
                                ? 'bg-violet-50 border-violet-200 text-violet-700'
                                : 'bg-violet-500/15 border-violet-500/30 text-violet-300'
                              : gpu.hardwareType === 'virtual'
                              ? isLightMode
                                ? 'bg-slate-100 border-slate-300 text-slate-600'
                                : 'bg-slate-800 border-slate-700 text-slate-300'
                              : isLightMode
                              ? 'bg-sky-50 border-sky-200 text-sky-700'
                              : 'bg-sky-500/15 border-sky-500/30 text-sky-300';
                          return (
                            <div key={`${gpu.name}-${idx}`} className={`p-3.5 rounded-xl border space-y-2.5 ${subSurfaceBg}`}>
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`text-xs font-bold ${textPrimary}`} dir="ltr">
                                      {gpu.name}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${typeBadgeCls}`}>
                                      {gpu.hardwareType === 'dedicated'
                                        ? isEn
                                          ? 'Dedicated GPU'
                                          : 'مجزا (Dedicated)'
                                        : gpu.hardwareType === 'virtual'
                                        ? isEn
                                          ? 'Virtual'
                                          : 'مجازی (VM)'
                                        : isEn
                                        ? 'Onboard / Integrated'
                                        : 'آنبورد (Onboard)'}
                                    </span>
                                  </div>
                                  <div className={`text-[11px] mt-1 flex flex-wrap items-center gap-2 ${textMuted}`} dir="ltr">
                                    {gpu.vendor && <span>{gpu.vendor}</span>}
                                    {gpu.resolution && (
                                      <>
                                        <span>·</span>
                                        <span className="font-mono">{gpu.resolution}</span>
                                      </>
                                    )}
                                    {gpu.driverVersion && (
                                      <>
                                        <span>·</span>
                                        <span className="font-mono">Drv {gpu.driverVersion}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border ${
                                    String(gpu.status).toUpperCase() === 'OK'
                                      ? isLightMode
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                        : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                      : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                                  }`}
                                >
                                  {gpu.status || 'OK'}
                                </span>
                              </div>

                              {/* Graphical GPU Load + VRAM Progress Bars */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] font-mono tabular-nums">
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className={textMuted}>{isEn ? '3D / Compute Load' : 'درصد مصرف پردازش'}</span>
                                    <span className={`font-semibold ${textPrimary}`}>
                                      {uVal !== null ? `${uVal}%` : isEn ? 'N/A' : 'در دسترس نیست'}
                                    </span>
                                  </div>
                                  <div className={`h-2 w-full rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        (uVal ?? 0) >= 85
                                          ? 'bg-rose-500'
                                          : (uVal ?? 0) >= 60
                                          ? 'bg-amber-500'
                                          : 'bg-violet-500'
                                      }`}
                                      style={{ width: `${Math.max(0, Math.min(100, uVal ?? 0))}%` }}
                                    />
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className={textMuted}>{isEn ? 'VRAM Memory' : 'حافظه گرافیک (VRAM)'}</span>
                                    <span className={`font-semibold ${textPrimary}`}>
                                      {gpu.vramTotalMb > 0
                                        ? `${gpu.vramUsedMb !== null ? `${gpu.vramUsedMb} / ` : ''}${
                                            gpu.vramTotalMb >= 1024
                                              ? `${(gpu.vramTotalMb / 1024).toFixed(1)} GB`
                                              : `${gpu.vramTotalMb} MB`
                                          }${vVal !== null ? ` (${vVal}%)` : ''}`
                                        : isEn
                                        ? 'Shared System RAM'
                                        : 'اشتراکی با RAM'}
                                    </span>
                                  </div>
                                  <div className={`h-2 w-full rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        (vVal ?? 0) >= 85
                                          ? 'bg-rose-500'
                                          : (vVal ?? 0) >= 65
                                          ? 'bg-amber-500'
                                          : 'bg-sky-500'
                                      }`}
                                      style={{ width: `${Math.max(0, Math.min(100, vVal ?? (gpu.vramTotalMb > 0 ? 4 : 0)))}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Audio Controllers & Sound Cards (Onboard vs HDMI/GPU vs USB/Bluetooth) */}
                  <div className="space-y-2.5">
                    <div className={`text-xs font-bold flex items-center gap-2 ${textPrimary}`}>
                      <Volume2 className="w-4 h-4 text-teal-500" />
                      <span>
                        {isEn
                          ? `Audio Controllers & Output Hardware (${healthData.audioDevices?.length || 0})`
                          : `کارت‌های صدا و کنترلرهای صوتی (${healthData.audioDevices?.length || 0})`}
                      </span>
                    </div>
                    {(healthData.audioDevices || []).length === 0 ? (
                      <div className={`p-3.5 rounded-xl border text-xs ${subSurfaceBg} ${textMuted}`}>
                        {isEn
                          ? 'No audio controller detected on this endpoint (common on headless servers/VMs).'
                          : 'کنترلر صوتی روی این سیستم شناسایی نشد (در سرورها یا ماشین‌های مجازی بدون کارت صدا طبیعی است).'}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {(healthData.audioDevices || []).map((aud: any, idx: number) => {
                          const isOk = String(aud.status || 'OK').toUpperCase() === 'OK';
                          const aTypeLabel =
                            aud.deviceType === 'onboard'
                              ? isEn
                                ? 'Onboard Motherboard'
                                : 'آنبورد مادربرد'
                              : aud.deviceType === 'gpu_hdmi'
                              ? isEn
                                ? 'GPU HDMI / DP Audio'
                                : 'خروجی تصویر/گرافیک (HDMI)'
                              : aud.deviceType === 'usb_external'
                              ? isEn
                                ? 'USB External Audio'
                                : 'کارت صدای USB / اکسترنال'
                              : aud.deviceType === 'bluetooth'
                              ? isEn
                                ? 'Bluetooth Audio'
                                : 'بلوتوث'
                              : isEn
                              ? 'Virtual Audio'
                              : 'صوت مجازی';
                          const aBadgeCls =
                            aud.deviceType === 'onboard'
                              ? isLightMode
                                ? 'bg-teal-50 border-teal-200 text-teal-700'
                                : 'bg-teal-500/15 border-teal-500/30 text-teal-300'
                              : aud.deviceType === 'gpu_hdmi'
                              ? isLightMode
                                ? 'bg-violet-50 border-violet-200 text-violet-700'
                                : 'bg-violet-500/15 border-violet-500/30 text-violet-300'
                              : isLightMode
                              ? 'bg-sky-50 border-sky-200 text-sky-700'
                              : 'bg-sky-500/15 border-sky-500/30 text-sky-300';
                          return (
                            <div key={`${aud.name}-${idx}`} className={`p-3 rounded-xl border space-y-2 ${subSurfaceBg}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className={`text-xs font-bold truncate ${textPrimary}`} title={aud.name} dir="ltr">
                                    {aud.name}
                                  </div>
                                  <div className={`text-[11px] truncate ${textMuted}`}>
                                    {aud.manufacturer || (isEn ? 'Standard Audio' : 'درایور استاندارد')}
                                  </div>
                                </div>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold shrink-0 ${
                                    isOk ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10'
                                  }`}
                                >
                                  {aud.status || 'OK'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold ${aBadgeCls}`}>
                                  {aTypeLabel}
                                </span>
                                <div className={`h-1.5 flex-1 rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                                  <div
                                    className={`h-full rounded-full ${isOk ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                    style={{ width: isOk ? '100%' : '30%' }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* VISUAL PROCESS MONITOR — Interactive Circular Donut + Paginated/Sortable Progress Table */}
              <div className={`rounded-xl border p-4 sm:p-5 space-y-5 ${surfaceBg}`}>
                <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
                  <div>
                    <h3 className={`text-sm font-bold ${textPrimary}`}>
                      {isEn
                        ? `Live Process Monitor & Safe User-App Control (${healthData.totalProcessCount} active processes)`
                        : `مانیتورینگ گرافیکی و کنترل ایمن پروسس‌ها (${healthData.totalProcessCount} پروسس فعال)`}
                    </h3>
                    <p className={`text-xs ${textMuted}`}>
                      {isEn
                        ? `Showing ${PROCESS_PAGE_SIZE} processes per page with Highest/Lowest sorting + safe End Task strictly for user apps.`
                        : `نمایش ${PROCESS_PAGE_SIZE} پروسس در هر صفحه با مرتب‌سازی صعودی/نزولی + امکان بستن صرفاً برنامه‌های کاربری هنگ‌کرده.`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-2.5 ${textMuted}`} />
                      <input
                        type="text"
                        value={processSearch}
                        onChange={(e) => {
                          setProcessSearch(e.target.value);
                          setProcessPage(1);
                        }}
                        placeholder={isEn ? 'Filter process or PID...' : 'جستجوی پروسس یا PID...'}
                        className={`ps-8 pe-3 py-1.5 rounded-lg border text-xs outline-none w-44 sm:w-48 ${inputCls}`}
                      />
                    </div>

                    <div
                      className={`flex items-center gap-1 p-0.5 rounded-lg border text-xs ${
                        isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      {(
                        [
                          { id: 'cpu', label: 'CPU' },
                          { id: 'memory', label: 'RAM' },
                          { id: 'pid', label: 'PID' },
                          { id: 'name', label: isEn ? 'Name' : 'نام' },
                        ] as const
                      ).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleToggleProcessColumnSort(s.id)}
                          className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                            processSort === s.id
                              ? isLightMode
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'bg-slate-800 text-white'
                              : textMuted
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setProcessSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
                        setProcessPage(1);
                      }}
                      title={isEn ? 'Toggle Highest / Lowest order' : 'تغییر ترتیب بیشترین / کمترین'}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                        isLightMode
                          ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                          : 'bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-200'
                      }`}
                    >
                      <ArrowUpDown className="w-3.5 h-3.5 text-sky-500" />
                      <span>
                        {processSortDir === 'desc'
                          ? isEn
                            ? 'Highest'
                            : 'بیشترین'
                          : isEn
                          ? 'Lowest'
                          : 'کمترین'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleInspectHealth(undefined, undefined, true)}
                      disabled={loadingHealth}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                        isLightMode
                          ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-100'
                      }`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-sky-500 ${loadingHealth ? 'animate-spin' : ''}`} />
                      <span>{isEn ? 'Refresh' : 'بروزرسانی'}</span>
                    </button>
                  </div>
                </div>

                {/* Split Layout: Circular Process Distribution Ring + Dual Progress Bar Grid */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                  {/* Left/Start: Interactive Circular Process Resource Donut */}
                  <div className={`xl:col-span-4 rounded-xl border p-4 space-y-4 ${subSurfaceBg}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${textPrimary}`}>
                        {donutMetric === 'cpu'
                          ? isEn
                            ? 'CPU Share by Top Processes'
                            : 'سهم دایره‌ای مصرف CPU پروسس‌ها'
                          : isEn
                          ? 'RAM Share by Top Processes'
                          : 'سهم دایره‌ای مصرف حافظه (RAM)'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setDonutMetric('cpu')}
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                            donutMetric === 'cpu' ? 'bg-sky-600 text-white' : textMuted
                          }`}
                        >
                          CPU
                        </button>
                        <button
                          type="button"
                          onClick={() => setDonutMetric('memory')}
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                            donutMetric === 'memory' ? 'bg-indigo-600 text-white' : textMuted
                          }`}
                        >
                          RAM
                        </button>
                      </div>
                    </div>

                    {/* SVG Donut Ring */}
                    <div className="flex justify-center py-2">
                      <div className="relative w-44 h-44">
                        <svg viewBox="0 0 180 180" className="w-full h-full -rotate-90">
                          <circle
                            cx="90"
                            cy="90"
                            r="70"
                            fill="none"
                            stroke={isLightMode ? '#e2e8f0' : '#1e293b'}
                            strokeWidth="20"
                          />
                          {processDonutSegments.map((seg) => {
                            const C = 2 * Math.PI * 70;
                            const segLen = (seg.pct / 100) * C;
                            const offset = -((seg.startPct / 100) * C);
                            const isSelected = selectedProcessPid === seg.pid;
                            return (
                              <circle
                                key={`${seg.pid}-${seg.name}`}
                                cx="90"
                                cy="90"
                                r="70"
                                fill="none"
                                stroke={seg.color}
                                strokeWidth={isSelected ? 24 : 20}
                                strokeDasharray={`${segLen} ${C}`}
                                strokeDashoffset={offset}
                                className="cursor-pointer transition-all"
                                opacity={selectedProcessPid && !isSelected ? 0.35 : 0.95}
                                onClick={() =>
                                  setSelectedProcessPid((cur) => (cur === seg.pid ? null : seg.pid))
                                }
                              />
                            );
                          })}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
                          <span className={`text-xl font-bold font-mono tabular-nums ${textPrimary}`}>
                            {donutMetric === 'cpu'
                              ? `${Number(healthData.cpu?.usagePercent || 0).toFixed(1)}%`
                              : `${Number(healthData.memory?.usedPercent || 0).toFixed(1)}%`}
                          </span>
                          <span className={`text-[11px] ${textMuted}`}>
                            {donutMetric === 'cpu'
                              ? isEn
                                ? 'Total CPU'
                                : 'کل مصرف CPU'
                              : isEn
                              ? 'Total RAM'
                              : 'کل مصرف RAM'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Interactive Legend */}
                    <div className="space-y-1.5">
                      {processDonutSegments.map((seg) => {
                        const isSelected = selectedProcessPid === seg.pid;
                        return (
                          <button
                            key={`leg-${seg.pid}-${seg.name}`}
                            type="button"
                            onClick={() =>
                              setSelectedProcessPid((cur) => (cur === seg.pid ? null : seg.pid))
                            }
                            className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded-md text-xs transition cursor-pointer ${
                              isSelected
                                ? isLightMode
                                  ? 'bg-sky-50 text-sky-900 font-semibold'
                                  : 'bg-sky-500/15 text-sky-200 font-semibold'
                                : isLightMode
                                ? 'hover:bg-slate-200/60'
                                : 'hover:bg-slate-800/70'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-xs shrink-0"
                                style={{ backgroundColor: seg.color }}
                              />
                              <span className={`truncate font-mono ${textPrimary}`}>{seg.name}</span>
                            </div>
                            <span className={`font-mono tabular-nums shrink-0 ${textMuted}`}>
                              {donutMetric === 'cpu'
                                ? `${seg.rawVal.toFixed(1)}%`
                                : seg.memoryMb > 0
                                ? `${seg.memoryMb.toFixed(0)} MB`
                                : `${seg.rawVal.toFixed(1)}%`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right/End: High-Density Process Progress Bars Table + Module 5 Safe End Task */}
                  <div className="xl:col-span-8 space-y-3 overflow-x-auto">
                    {processActionNotice && (
                      <div
                        className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                          processActionNotice.ok
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                            : 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-semibold">
                          {processActionNotice.ok ? (
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 shrink-0" />
                          )}
                          <span>{processActionNotice.text}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setProcessActionNotice(null)}
                          className="opacity-70 hover:opacity-100 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className={`border-b text-start ${isLightMode ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
                          <th className="py-2 px-2.5 font-semibold text-start">
                            <button
                              type="button"
                              onClick={() => handleToggleProcessColumnSort('pid')}
                              className="inline-flex items-center gap-1 hover:text-sky-500 cursor-pointer"
                            >
                              <span>PID</span>
                              {processSort === 'pid' && (
                                processSortDir === 'desc' ? <ChevronDown className="w-3 h-3 text-sky-500" /> : <ChevronUp className="w-3 h-3 text-sky-500" />
                              )}
                            </button>
                          </th>
                          <th className="py-2 px-2.5 font-semibold text-start">
                            <button
                              type="button"
                              onClick={() => handleToggleProcessColumnSort('name')}
                              className="inline-flex items-center gap-1 hover:text-sky-500 cursor-pointer"
                            >
                              <span>{isEn ? 'Process' : 'نام پروسس'}</span>
                              {processSort === 'name' && (
                                processSortDir === 'desc' ? <ChevronDown className="w-3 h-3 text-sky-500" /> : <ChevronUp className="w-3 h-3 text-sky-500" />
                              )}
                            </button>
                          </th>
                          <th className="py-2 px-2.5 font-semibold text-start w-40">
                            <button
                              type="button"
                              onClick={() => handleToggleProcessColumnSort('cpu')}
                              className="inline-flex items-center gap-1 hover:text-sky-500 cursor-pointer"
                            >
                              <span>{isEn ? 'CPU Load' : 'مصرف CPU'}</span>
                              {processSort === 'cpu' && (
                                processSortDir === 'desc' ? <ChevronDown className="w-3 h-3 text-sky-500" /> : <ChevronUp className="w-3 h-3 text-sky-500" />
                              )}
                            </button>
                          </th>
                          <th className="py-2 px-2.5 font-semibold text-start w-40">
                            <button
                              type="button"
                              onClick={() => handleToggleProcessColumnSort('memory')}
                              className="inline-flex items-center gap-1 hover:text-sky-500 cursor-pointer"
                            >
                              <span>{isEn ? 'Memory (RAM)' : 'مصرف RAM'}</span>
                              {processSort === 'memory' && (
                                processSortDir === 'desc' ? <ChevronDown className="w-3 h-3 text-sky-500" /> : <ChevronUp className="w-3 h-3 text-sky-500" />
                              )}
                            </button>
                          </th>
                          <th className="py-2 px-2.5 font-semibold text-end">{isEn ? 'State' : 'وضعیت'}</th>
                          <th className="py-2 px-2.5 font-semibold text-end">{isEn ? 'Safe Control' : 'کنترل ایمن'}</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                        {paginatedProcesses.map((proc: any) => {
                          const cpuVal = Math.max(0, Math.min(100, Number(proc.cpuPercent) || 0));
                          const memVal = Math.max(0, Math.min(100, Number(proc.memoryPercent) || 0));
                          const isHighlighted = selectedProcessPid === proc.pid;
                          const cpuBarClr =
                            cpuVal >= 50 ? 'bg-rose-500' : cpuVal >= 20 ? 'bg-amber-500' : 'bg-sky-500';
                          const memBarClr =
                            memVal >= 35 ? 'bg-rose-500' : memVal >= 15 ? 'bg-amber-500' : 'bg-indigo-500';
                          const isTerminable = proc.terminable === true;
                          const isConfirming = confirmKillPid === proc.pid;
                          const isKillingThis = terminatingPid === proc.pid;

                          return (
                            <tr
                              key={`${proc.pid}-${proc.name}`}
                              onClick={() =>
                                setSelectedProcessPid((cur) => (cur === proc.pid ? null : proc.pid))
                              }
                              className={`cursor-pointer transition-colors ${
                                isHighlighted
                                  ? isLightMode
                                    ? 'bg-sky-50'
                                    : 'bg-sky-500/15'
                                  : isLightMode
                                  ? 'hover:bg-slate-50'
                                  : 'hover:bg-slate-800/40'
                              }`}
                            >
                              <td className={`py-2.5 px-2.5 font-mono tabular-nums ${textMuted}`}>
                                {proc.pid}
                              </td>
                              <td className="py-2.5 px-2.5">
                                <div className={`font-mono font-semibold ${textPrimary}`}>{proc.name}</div>
                                <div className={`text-[10px] ${textMuted}`}>
                                  {proc.threads} {isEn ? 'threads' : 'ترد'}
                                  {proc.processCategory === 'browser'
                                    ? ` · ${isEn ? 'Browser' : 'مرورگر'}`
                                    : proc.processCategory === 'office'
                                    ? ` · ${isEn ? 'Office App' : 'برنامه آفیس'}`
                                    : proc.processCategory === 'security_protected'
                                    ? ` · ${isEn ? 'Antivirus / EDR' : 'آنتی‌ویروس / EDR'}`
                                    : proc.processCategory === 'system_protected'
                                    ? ` · ${isEn ? 'Core OS' : 'هسته سیستم'}`
                                    : ''}
                                </div>
                              </td>
                              <td className="py-2.5 px-2.5">
                                <div className="flex items-center gap-2">
                                  <div className={`flex-1 h-2 rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                                    <div
                                      className={`h-full rounded-full ${cpuBarClr}`}
                                      style={{ width: `${Math.max(cpuVal > 0 ? 3 : 0, cpuVal)}%` }}
                                    />
                                  </div>
                                  <span className={`w-11 text-end font-mono tabular-nums ${textPrimary}`}>
                                    {cpuVal.toFixed(1)}%
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-2.5">
                                <div className="flex items-center gap-2">
                                  <div className={`flex-1 h-2 rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                                    <div
                                      className={`h-full rounded-full ${memBarClr}`}
                                      style={{ width: `${Math.max(memVal > 0 ? 3 : 0, memVal)}%` }}
                                    />
                                  </div>
                                  <span className={`w-14 text-end font-mono tabular-nums ${textPrimary}`}>
                                    {Number(proc.memoryMb || 0).toFixed(0)} MB
                                  </span>
                                </div>
                              </td>
                              <td
                                className={`py-2.5 px-2.5 text-end font-medium ${
                                  String(proc.status).toLowerCase().includes('not')
                                    ? 'text-rose-500'
                                    : 'text-emerald-500'
                                }`}
                              >
                                {proc.status}
                              </td>
                              <td
                                className="py-2.5 px-2.5 text-end whitespace-nowrap"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {!isTerminable ? (
                                  <span
                                    title={isEn ? proc.protectionReason : proc.protectionReasonFa}
                                    className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                                      proc.processCategory === 'security_protected'
                                        ? 'text-emerald-500'
                                        : textMuted
                                    }`}
                                  >
                                    <Lock className="w-3 h-3" />
                                    <span>
                                      {proc.processCategory === 'security_protected'
                                        ? isEn
                                          ? 'AV Locked'
                                          : 'قفل آنتی‌ویروس'
                                        : isEn
                                        ? 'OS Protected'
                                        : 'قفل سیستمی'}
                                    </span>
                                  </span>
                                ) : !canTerminateProcesses ? (
                                  <span
                                    title={
                                      isEn
                                        ? 'Requires canTerminateHelpdeskProcesses permission'
                                        : 'نیازمند مجوز canTerminateHelpdeskProcesses در Access Policy'
                                    }
                                    className={`inline-flex items-center gap-1 text-[11px] ${textMuted}`}
                                  >
                                    <Lock className="w-3 h-3 text-amber-500" />
                                    <span>{isEn ? 'No RBAC' : 'بدون مجوز'}</span>
                                  </span>
                                ) : isConfirming ? (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={isKillingThis}
                                      onClick={() => handleTerminateProcess(proc.pid, proc.name)}
                                      className="px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                                    >
                                      {isKillingThis ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : isEn ? (
                                        'Confirm Stop'
                                      ) : (
                                        'تأیید بستن'
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isKillingThis}
                                      onClick={() => setConfirmKillPid(null)}
                                      className={`px-2 py-1 rounded-md border text-[11px] font-medium cursor-pointer ${
                                        isLightMode
                                          ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                                          : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                                      }`}
                                    >
                                      {isEn ? 'Cancel' : 'انصراف'}
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={terminatingPid !== null}
                                    onClick={() => setConfirmKillPid(proc.pid)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-rose-500/40 text-rose-500 hover:bg-rose-500/10 text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                                  >
                                    <PowerOff className="w-3 h-3" />
                                    <span>{isEn ? 'End Task' : 'بستن برنامه'}</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {paginatedProcesses.length === 0 && (
                          <tr>
                            <td colSpan={6} className={`py-6 text-center ${textMuted}`}>
                              {isEn ? 'No processes match your filter.' : 'هیچ پروسسی با این فیلتر پیدا نشد.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {/* Process Table Pagination Bar (20 items per page) */}
                    {filteredProcesses.length > 0 && (
                      <div
                        className={`mt-3 pt-3 border-t flex flex-wrap items-center justify-between gap-2 text-xs ${
                          isLightMode ? 'border-slate-200' : 'border-slate-800'
                        }`}
                      >
                        <div className={textMuted}>
                          {isEn
                            ? `Showing ${(clampedProcessPage - 1) * PROCESS_PAGE_SIZE + 1}–${Math.min(
                                clampedProcessPage * PROCESS_PAGE_SIZE,
                                filteredProcesses.length
                              )} of ${filteredProcesses.length} processes`
                            : `نمایش ${(clampedProcessPage - 1) * PROCESS_PAGE_SIZE + 1} تا ${Math.min(
                                clampedProcessPage * PROCESS_PAGE_SIZE,
                                filteredProcesses.length
                              )} از ${filteredProcesses.length} پروسس`}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={clampedProcessPage <= 1}
                            onClick={() => setProcessPage(clampedProcessPage - 1)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold disabled:opacity-40 cursor-pointer ${
                              isLightMode
                                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                            }`}
                          >
                            {isEn ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            <span>{isEn ? 'Prev' : 'قبلی'}</span>
                          </button>

                          {Array.from({ length: processTotalPages }, (_, idx) => idx + 1)
                            .filter(
                              (p) =>
                                p === 1 ||
                                p === processTotalPages ||
                                Math.abs(p - clampedProcessPage) <= 1
                            )
                            .map((p, idx, arr) => (
                              <React.Fragment key={p}>
                                {idx > 0 && arr[idx - 1] !== p - 1 && (
                                  <span className={`px-1.5 ${textMuted}`}>…</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setProcessPage(p)}
                                  className={`min-w-[28px] h-7 px-2 rounded-md border text-[11px] font-mono font-semibold cursor-pointer transition ${
                                    p === clampedProcessPage
                                      ? 'bg-sky-600 border-sky-600 text-white'
                                      : isLightMode
                                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                                  }`}
                                >
                                  {p}
                                </button>
                              </React.Fragment>
                            ))}

                          <button
                            type="button"
                            disabled={clampedProcessPage >= processTotalPages}
                            onClick={() => setProcessPage(clampedProcessPage + 1)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold disabled:opacity-40 cursor-pointer ${
                              isLightMode
                                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                            }`}
                          >
                            <span>{isEn ? 'Next' : 'بعدی'}</span>
                            {isEn ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* SHARED FOLDERS & MAPPED NETWORK DRIVES (User Profile + All-Users Control) */}
          <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-amber-500" />
                  <h3 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn
                      ? 'Mapped Network Drives & Shared Folders'
                      : 'پوشه‌های اشتراکی و درایوهای شبکه (Shared Folders)'}
                  </h3>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    fieldName={isEn ? 'Mapped Shared Folders Management' : 'مدیریت پوشه‌های اشتراکی کاربر'}
                    whatIsIt={
                      isEn
                        ? 'Displays network drives and SMB shares mapped in the active user’s profile (HKU\\<SID>\\Network), other loaded profiles, and persistent All-Users logon rules on this workstation.'
                        : 'درایوهای شبکه و پوشه‌های اشتراکی مپ‌شده در پروفایل کاربر فعال، سایر پروفایل‌های این سیستم و قوانین Logon همه کاربران را نمایش می‌دهد.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Allows HelpDesk engineers to disconnect broken shares or map a new shared folder for the active user, chosen user profile(s), or all users on this workstation.'
                        : 'به کارشناس اجازه می‌دهد بدون نیاز به پسورد ادمین در دست کاربر، پوشه‌های اشتراکی را دیسکانکت کند یا برای تک‌کاربر، کاربران مشخص یا همه کاربران این آدرس مپ و مدیریت نماید.'
                    }
                    example={
                      isEn
                        ? 'Z: → \\\\fileserver\\Finance (Active User or All Users Logon Policy)'
                        : 'درایو Z: ← \\\\fileserver\\Finance (تک‌کاربر یا همه کاربران سیستم)'
                    }
                  />
                </div>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {isEn
                    ? 'View, disconnect, or map SMB shared folders for the logged-in user, specific user profiles, or all users on this address.'
                    : 'مشاهده، دیسکانکت کردن و مپ کردن پوشه‌های اشتراکی برای کاربر فعال، کاربران انتخابی این سیستم یا همه کاربران این آدرس.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleInspectShares()}
                  disabled={!canRunDiagnostics || loadingShares}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {loadingShares ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>{isEn ? 'Refresh Shares' : 'دریافت / بروزرسانی شیرفولدرها'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    undockModal('modal-helpdesk-network-share');
                    setShareModalPrefill({});
                    setIsShareMapModalOpen(true);
                  }}
                  disabled={!canExecuteActions}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {!canExecuteActions ? <Lock className="w-3.5 h-3.5" /> : <FolderPlus className="w-3.5 h-3.5" />}
                  <span>{isEn ? 'Map Shared Folder' : 'مپ کردن شیر فولدر'}</span>
                </button>
              </div>
            </div>

            {sharesError && (
              <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-500 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className={isLightMode ? 'text-rose-800' : 'text-rose-200'}>{sharesError}</span>
              </div>
            )}

            {shareActionResult && (
              <div className="p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 space-y-1 text-xs">
                <div className="flex items-center gap-2 font-bold text-emerald-500">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{isEn ? shareActionResult.message : shareActionResult.messageFa}</span>
                </div>
                {shareActionResult.rawOutput && (
                  <div className={`font-mono text-[11px] ${textMuted}`}>{shareActionResult.rawOutput}</div>
                )}
              </div>
            )}

            {sharesData && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    {sharesData.loggedInUser && (
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium border ${
                          isLightMode
                            ? 'bg-sky-50 text-sky-800 border-sky-200'
                            : 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                        }`}
                      >
                        <UserCheck className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {isEn ? 'Active User:' : 'کاربر فعال:'}{' '}
                          <strong dir="ltr" className="font-mono">{sharesData.loggedInUser}</strong>
                        </span>
                      </span>
                    )}
                    {Array.isArray(sharesData.userProfiles) && sharesData.userProfiles.length > 0 && (
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium border ${
                          isLightMode
                            ? 'bg-slate-100 text-slate-700 border-slate-200'
                            : 'bg-slate-800/80 text-slate-300 border-slate-700'
                        }`}
                      >
                        <span>
                          {isEn
                            ? `Workstation Profiles: ${sharesData.userProfiles.length}`
                            : `پروفایل‌های این سیستم: ${sharesData.userProfiles.length} کاربر`}
                        </span>
                      </span>
                    )}
                  </div>
                  <span className={`font-mono ${textMuted}`}>
                    {isEn ? `${(sharesData.shares || []).length} Share(s)` : `${(sharesData.shares || []).length} پوشه اشتراکی`}
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-xs border-collapse">
                    <thead className={isLightMode ? 'bg-slate-50 text-slate-600' : 'bg-slate-900/90 text-slate-400'}>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-start">
                        <th className="py-2.5 px-3 text-start">{isEn ? 'Drive' : 'درایو'}</th>
                        <th className="py-2.5 px-3 text-start">{isEn ? 'UNC Share Path' : 'مسیر پوشه اشتراکی (UNC)'}</th>
                        <th className="py-2.5 px-3 text-start">{isEn ? 'Scope' : 'محدوده'}</th>
                        <th className="py-2.5 px-3 text-start">{isEn ? 'User / Owner' : 'کاربر / مالک'}</th>
                        <th className="py-2.5 px-3 text-start">{isEn ? 'Status' : 'وضعیت'}</th>
                        <th className="py-2.5 px-3 text-center">{isEn ? 'Manage' : 'مدیریت'}</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                      {(sharesData.shares || []).map((sh: any) => {
                        const isBusy = shareRowActionBusy === sh.id;
                        return (
                          <tr key={sh.id}>
                            <td className="py-2.5 px-3 font-mono font-bold whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${
                                  isLightMode
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                }`}
                              >
                                <HardDrive className="w-3 h-3 shrink-0" />
                                <span dir="ltr">{sh.driveLetter || 'UNC'}</span>
                              </span>
                              {sh.label && (
                                <div className={`text-[10px] font-sans font-normal mt-0.5 ${textMuted}`}>
                                  {sh.label}
                                </div>
                              )}
                            </td>
                            <td className={`py-2.5 px-3 ${textPrimary}`}>
                              <div dir="ltr" className="font-mono font-semibold text-start">
                                {sh.remotePath}
                              </div>
                              <div className={`text-[10px] ${textMuted}`}>{sh.provider}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${
                                  sh.scope === 'all_users'
                                    ? isLightMode
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                    : sh.scope === 'user'
                                    ? isLightMode
                                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                      : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                                    : isLightMode
                                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                                    : 'bg-slate-800 text-slate-300 border-slate-700'
                                }`}
                              >
                                {sh.scope === 'all_users'
                                  ? isEn
                                    ? 'All Users Rule'
                                    : 'همه کاربران آدرس'
                                  : sh.scope === 'user'
                                  ? isEn
                                    ? 'User Profile'
                                    : 'پروفایل کاربر'
                                  : isEn
                                  ? 'Session / PC'
                                  : 'نشست سیستم'}
                              </span>
                            </td>
                            <td dir="ltr" className={`py-2.5 px-3 font-mono text-[11px] ${textMuted}`}>
                              {sh.ownerUser || '-'}
                            </td>
                            <td className="py-2.5 px-3">
                              <div
                                className={`font-semibold ${
                                  String(sh.status).toLowerCase().includes('disconnect') ||
                                  String(sh.status).toLowerCase().includes('unavailable')
                                    ? 'text-amber-500'
                                    : 'text-emerald-500'
                                }`}
                              >
                                {sh.status}
                              </div>
                              {sh.persistent && (
                                <div className={`text-[10px] ${textMuted}`}>
                                  {isEn ? 'Persistent' : 'دائمی (Persistent)'}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {canExecuteActions ? (
                                <button
                                  type="button"
                                  disabled={isBusy || shareRowActionBusy !== null}
                                  onClick={(e) => handleToggleShareMenu(e, sh)}
                                  className={`p-1.5 rounded-lg border transition cursor-pointer disabled:opacity-50 ${
                                    shareMenuAnchor?.share?.id === sh.id
                                      ? 'bg-sky-600 text-white border-sky-500'
                                      : isLightMode
                                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                  }`}
                                  title={isEn ? 'Manage Share' : 'مدیریت پوشه اشتراکی'}
                                >
                                  {isBusy ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              ) : (
                                <span className={`text-[11px] ${textMuted}`}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {(sharesData.shares || []).length === 0 && (
                        <tr>
                          <td colSpan={6} className={`py-6 text-center ${textMuted}`}>
                            {isEn
                              ? 'No mapped network drives or shared folders detected for this workstation/user.'
                              : 'هیچ درایو شبکه یا پوشه اشتراکی مپ‌شده‌ای برای این سیستم/کاربر ثبت نشده است.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!sharesData && !loadingShares && !sharesError && (
              <div className={`p-5 rounded-xl border text-center text-xs space-y-1.5 ${subSurfaceBg}`}>
                <div className={`font-semibold ${textPrimary}`}>
                  {isEn ? 'Inspect or Map Network Shared Folders' : 'مشاهده و مدیریت پوشه‌های اشتراکی کاربر'}
                </div>
                <p className={textMuted}>
                  {isEn
                    ? 'Click "Connect & Inspect" above (or "Refresh Shares") to load the user’s mapped drives and discovered profiles on this workstation.'
                    : 'با زدن «اتصال و پایش» در بالای صفحه یا دکمه «دریافت / بروزرسانی شیرفولدرها»، پوشه‌های اشتراکی این کاربر و لیست پروفایل‌های این سیستم نمایش داده می‌شود.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 1B: VISUAL HARDWARE INVENTORY & CONNECTED PERIPHERALS           */}
      {/* =================================================================== */}
      {activeSubTab === 'hardware' && (
        <div className="space-y-6">
          {/* Header & System OEM Hero Banner */}
          <div className={`rounded-2xl border p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${
                    isLightMode
                      ? 'bg-sky-50 border-sky-200 text-sky-600'
                      : 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                  }`}
                >
                  {hardwareData?.system?.systemType?.toLowerCase().includes('laptop') ? (
                    <Laptop className="w-5 h-5" />
                  ) : (
                    <CircuitBoard className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h2 className={`text-sm font-bold flex flex-wrap items-center gap-2 ${textPrimary}`}>
                    <span>
                      {isEn
                        ? 'Complete Workstation Hardware Inventory'
                        : 'مشخصات کامل سخت‌افزار و تجهیزات متصل سیستم'}
                    </span>
                    {hardwareData?.system?.systemType && (
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${
                          isLightMode
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                            : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                        }`}
                      >
                        {hardwareData.system.systemType}
                      </span>
                    )}
                  </h2>
                  <p className={`text-xs mt-0.5 ${textMuted}`}>
                    {hardwareData
                      ? `${hardwareData.system?.manufacturer || ''} ${hardwareData.system?.model || hardwareData.hostname} · S/N: ${hardwareData.system?.serialNumber || '—'}`
                      : isEn
                      ? 'Visual breakdown of CPU, physical RAM slots & bus speed, motherboard, GPUs, monitors, storage drives, NICs & connected USB/HID hardware.'
                      : 'نمایش دقیق و گرافیکی پردازنده، ماژول‌ها و باس رم، مدل مادربرد و BIOS، کارت گرافیک، مانیتور، هاردها، کارت شبکه و کلیه دستگاه‌های متصل.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {hardwareData && (
                  <button
                    type="button"
                    onClick={handleExportHardwareJson}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                      isLightMode
                        ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{isEn ? 'Export Spec JSON' : 'خروجی JSON'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleInspectHardware}
                  disabled={loadingHardware || !targetIp.trim()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingHardware ? 'animate-spin' : ''}`} />
                  <span>{isEn ? 'Scan Hardware' : 'بروزرسانی سخت‌افزار'}</span>
                </button>
              </div>
            </div>

            {hardwareError && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-start gap-2.5 text-xs text-rose-500">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{hardwareError}</span>
              </div>
            )}

            {!hardwareData && !loadingHardware && !hardwareError && (
              <div className={`rounded-xl border p-8 text-center text-xs ${subSurfaceBg} ${textMuted}`}>
                {isEn
                  ? 'Connect to a workstation above or click "Scan Hardware" to generate a full visual hardware report.'
                  : 'ابتدا به سیستم کاربر متصل شوید یا دکمه «بروزرسانی سخت‌افزار» را بزنید تا نمای گرافیکی قطعات نمایش داده شود.'}
              </div>
            )}
          </div>

          {hardwareData && (
            <>
              {/* Row 1: CPU & Motherboard Side-by-Side Hero Cards */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* PROCESSOR (CPU) CARD */}
                <div className={`rounded-2xl border p-5 space-y-4 ${surfaceBg}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                          isLightMode
                            ? 'bg-sky-50 border-sky-200 text-sky-600'
                            : 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                        }`}
                      >
                        <Cpu className="w-5 h-5" />
                      </div>
                      <div>
                        <div className={`text-[11px] font-semibold uppercase tracking-wide ${textMuted}`}>
                          {isEn ? 'Processor (CPU)' : 'پردازنده (CPU)'}
                        </div>
                        <h3 className={`text-sm font-bold leading-snug ${textPrimary}`} dir="ltr">
                          {hardwareData.cpu?.name || '—'}
                        </h3>
                      </div>
                    </div>
                    {hardwareData.cpu?.architecture && (
                      <span
                        dir="ltr"
                        className={`px-2 py-0.5 rounded-md border font-mono text-[11px] font-semibold shrink-0 ${subSurfaceBg} ${textMuted}`}
                      >
                        {hardwareData.cpu.architecture}
                      </span>
                    )}
                  </div>

                  {/* Highlighted Speed & Core Metrics */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className={`rounded-xl border p-3 ${subSurfaceBg}`}>
                      <div className={`text-[11px] ${textMuted}`}>
                        {isEn ? 'Clock Speed' : 'فرکانس / سرعت'}
                      </div>
                      <div className="text-lg font-bold font-mono tabular-nums text-sky-500 mt-0.5" dir="ltr">
                        {hardwareData.cpu?.maxClockGhz > 0
                          ? `${hardwareData.cpu.maxClockGhz} GHz`
                          : hardwareData.cpu?.baseClockGhz > 0
                          ? `${hardwareData.cpu.baseClockGhz} GHz`
                          : '—'}
                      </div>
                      <div className={`text-[10px] font-mono ${textMuted}`} dir="ltr">
                        {hardwareData.cpu?.baseClockGhz > 0
                          ? `Base: ${hardwareData.cpu.baseClockGhz} GHz`
                          : isEn
                          ? 'Clock N/A'
                          : 'فرکانس پایه'}
                      </div>
                    </div>

                    <div className={`rounded-xl border p-3 ${subSurfaceBg}`}>
                      <div className={`text-[11px] ${textMuted}`}>
                        {isEn ? 'Cores / Threads' : 'هسته / ترد'}
                      </div>
                      <div className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${textPrimary}`} dir="ltr">
                        {hardwareData.cpu?.cores || 0}C / {hardwareData.cpu?.logicalProcessors || 0}T
                      </div>
                      <div className={`text-[10px] ${textMuted}`}>
                        {isEn ? 'Physical / Logical' : 'هسته فیزیکی / منطقی'}
                      </div>
                    </div>

                    <div className={`rounded-xl border p-3 ${subSurfaceBg}`}>
                      <div className={`text-[11px] ${textMuted}`}>
                        {isEn ? 'L2 / L3 Cache' : 'حافظه کش'}
                      </div>
                      <div className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${textPrimary}`} dir="ltr">
                        {hardwareData.cpu?.l3CacheMb > 0 ? `${hardwareData.cpu.l3CacheMb} MB` : '—'}
                      </div>
                      <div className={`text-[10px] font-mono ${textMuted}`} dir="ltr">
                        {hardwareData.cpu?.l2CacheMb > 0 ? `L2: ${hardwareData.cpu.l2CacheMb} MB` : 'Smart Cache'}
                      </div>
                    </div>
                  </div>

                  {/* Specs Footer */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs pt-1">
                    <div className={`px-3 py-2 rounded-lg border ${subSurfaceBg}`}>
                      <span className={textMuted}>{isEn ? 'Socket: ' : 'سوکت: '}</span>
                      <span className={`font-mono font-semibold ${textPrimary}`} dir="ltr">
                        {hardwareData.cpu?.socket || '—'}
                      </span>
                    </div>
                    <div className={`px-3 py-2 rounded-lg border ${subSurfaceBg}`}>
                      <span className={textMuted}>{isEn ? 'Vendor: ' : 'سازنده: '}</span>
                      <span className={`font-mono font-semibold truncate ${textPrimary}`} dir="ltr">
                        {hardwareData.cpu?.manufacturer || '—'}
                      </span>
                    </div>
                    <div className={`px-3 py-2 rounded-lg border ${subSurfaceBg}`}>
                      <span className={textMuted}>{isEn ? 'Virtualization: ' : 'مجازی‌سازی: '}</span>
                      <span
                        className={`font-semibold ${
                          hardwareData.cpu?.virtualizationEnabled === true
                            ? 'text-emerald-500'
                            : hardwareData.cpu?.virtualizationEnabled === false
                            ? 'text-amber-500'
                            : textMuted
                        }`}
                      >
                        {hardwareData.cpu?.virtualizationEnabled === true
                          ? isEn
                            ? 'Enabled'
                            : 'فعال'
                          : hardwareData.cpu?.virtualizationEnabled === false
                          ? isEn
                            ? 'Disabled'
                            : 'غیرفعال'
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* MOTHERBOARD & BIOS CARD */}
                <div className={`rounded-2xl border p-5 space-y-4 ${surfaceBg}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                          isLightMode
                            ? 'bg-teal-50 border-teal-200 text-teal-600'
                            : 'bg-teal-500/10 border-teal-500/30 text-teal-400'
                        }`}
                      >
                        <CircuitBoard className="w-5 h-5" />
                      </div>
                      <div>
                        <div className={`text-[11px] font-semibold uppercase tracking-wide ${textMuted}`}>
                          {isEn ? 'Motherboard & System Firmware (BIOS)' : 'مادربرد و بایوس (Motherboard & BIOS)'}
                        </div>
                        <h3 className={`text-sm font-bold leading-snug ${textPrimary}`} dir="ltr">
                          {[hardwareData.motherboard?.manufacturer, hardwareData.motherboard?.product]
                            .filter(Boolean)
                            .join(' ') || '—'}
                        </h3>
                      </div>
                    </div>
                    {hardwareData.motherboard?.version && (
                      <span
                        dir="ltr"
                        className={`px-2 py-0.5 rounded-md border font-mono text-[11px] font-semibold shrink-0 ${subSurfaceBg} ${textMuted}`}
                      >
                        Rev {hardwareData.motherboard.version}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className={`p-3 rounded-xl border ${subSurfaceBg}`}>
                      <div className={`text-[11px] ${textMuted}`}>{isEn ? 'Board Model' : 'مدل مادربرد'}</div>
                      <div className={`font-mono font-bold mt-0.5 break-all ${textPrimary}`} dir="ltr">
                        {hardwareData.motherboard?.product || '—'}
                      </div>
                      <div className={`text-[10px] mt-0.5 ${textMuted}`} dir="ltr">
                        S/N: {hardwareData.motherboard?.serialNumber || '—'}
                      </div>
                    </div>

                    <div className={`p-3 rounded-xl border ${subSurfaceBg}`}>
                      <div className={`text-[11px] ${textMuted}`}>{isEn ? 'BIOS / UEFI Version' : 'نسخه و تاریخ BIOS'}</div>
                      <div className="font-mono font-bold mt-0.5 text-teal-500 truncate" dir="ltr">
                        {hardwareData.motherboard?.biosVersion || '—'}
                      </div>
                      <div className={`text-[10px] font-mono mt-0.5 ${textMuted}`} dir="ltr">
                        {hardwareData.motherboard?.biosVendor || 'BIOS'}{' '}
                        {hardwareData.motherboard?.biosReleaseDate ? `(${hardwareData.motherboard.biosReleaseDate})` : ''}
                      </div>
                    </div>

                    <div className={`p-3 rounded-xl border sm:col-span-2 ${subSurfaceBg}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className={`text-[11px] ${textMuted}`}>{isEn ? 'Chipset / Platform Bridge' : 'چیپست / پل اصلی مادربرد'}</div>
                          <div className={`font-mono text-xs font-semibold mt-0.5 ${textPrimary}`} dir="ltr">
                            {hardwareData.motherboard?.chipset ||
                              `${hardwareData.system?.manufacturer || ''} ${hardwareData.system?.model || ''}`.trim() ||
                              '—'}
                          </div>
                        </div>
                        {hardwareData.system?.uuid && (
                          <div className="text-end" dir="ltr">
                            <div className={`text-[10px] ${textMuted}`}>SMBIOS UUID</div>
                            <div className={`font-mono text-[10px] ${textMuted}`}>{hardwareData.system.uuid}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 2: PHYSICAL MEMORY (RAM) VISUAL MODULE & SLOT MAP */}
              <div className={`rounded-2xl border p-5 space-y-4 ${surfaceBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                        isLightMode
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                          : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                      }`}
                    >
                      <MemoryStick className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className={`text-sm font-bold ${textPrimary}`}>
                        {isEn ? 'Physical Memory (RAM) Modules & Slots' : 'حافظه رم (RAM) — ظرفیت، تعداد ماژول، باس و اسلات‌های مادربرد'}
                      </h3>
                      <p className={`text-xs mt-0.5 ${textMuted}`}>
                        {isEn
                          ? 'Detailed physical DIMM/SODIMM sticks, effective memory bus speed (MHz/MT/s), channel mode, and free upgrade slots.'
                          : 'جزئیات کامل هر استیک رم، سرعت باس واقعی (MHz)، نوع DDR، پیکربندی کانال و تعداد اسلات‌های پر و خالی مادربرد.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono" dir="ltr">
                    <span className="px-2.5 py-1 rounded-lg border border-indigo-500/40 bg-indigo-500/10 text-indigo-500 font-bold">
                      {hardwareData.memory?.totalGb || 0} GB {hardwareData.memory?.memoryType || 'RAM'}
                    </span>
                    {hardwareData.memory?.speedMhz > 0 && (
                      <span className="px-2.5 py-1 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-500 font-bold">
                        {hardwareData.memory.speedMhz} MHz
                      </span>
                    )}
                    <span className={`px-2.5 py-1 rounded-lg border ${subSurfaceBg} ${textPrimary}`}>
                      {hardwareData.memory?.populatedSlots || 0} / {hardwareData.memory?.totalSlots || 0}{' '}
                      {isEn ? 'Slots' : 'اسلات'}
                    </span>
                  </div>
                </div>

                {/* RAM KPI Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                  <div className={`p-3 rounded-xl border ${subSurfaceBg}`}>
                    <div className={textMuted}>{isEn ? 'Total Physical RAM' : 'کل رم نصب‌شده'}</div>
                    <div className="text-lg font-bold font-mono text-indigo-500 mt-0.5" dir="ltr">
                      {hardwareData.memory?.totalGb || 0} GB
                    </div>
                    <div className={`text-[10px] font-mono ${textMuted}`} dir="ltr">
                      {isEn ? 'OS Usable' : 'قابل استفاده'}: {hardwareData.memory?.usableGb || 0} GB
                    </div>
                  </div>

                  <div className={`p-3 rounded-xl border ${subSurfaceBg}`}>
                    <div className={textMuted}>{isEn ? 'Memory Bus Speed' : 'سرعت باس (Bus)'}</div>
                    <div className="text-lg font-bold font-mono text-sky-500 mt-0.5" dir="ltr">
                      {hardwareData.memory?.speedMhz > 0 ? `${hardwareData.memory.speedMhz} MHz` : '—'}
                    </div>
                    <div className={`text-[10px] ${textMuted}`}>
                      {hardwareData.memory?.memoryType || 'DDR'}
                    </div>
                  </div>

                  <div className={`p-3 rounded-xl border ${subSurfaceBg}`}>
                    <div className={textMuted}>{isEn ? 'Installed Sticks' : 'تعداد ماژول (رم)'}</div>
                    <div className={`text-lg font-bold font-mono mt-0.5 ${textPrimary}`} dir="ltr">
                      {hardwareData.memory?.populatedSlots || 0} {isEn ? 'Stick(s)' : 'عدد'}
                    </div>
                    <div className={`text-[10px] ${textMuted}`}>
                      {hardwareData.memory?.channelMode || '—'}
                    </div>
                  </div>

                  <div className={`p-3 rounded-xl border ${subSurfaceBg}`}>
                    <div className={textMuted}>{isEn ? 'Free Slots' : 'اسلات خالی'}</div>
                    <div
                      className={`text-lg font-bold font-mono mt-0.5 ${
                        (hardwareData.memory?.freeSlots || 0) > 0 ? 'text-emerald-500' : 'text-amber-500'
                      }`}
                      dir="ltr"
                    >
                      {hardwareData.memory?.freeSlots ?? 0} / {hardwareData.memory?.totalSlots ?? 0}
                    </div>
                    <div className={`text-[10px] ${textMuted}`}>
                      {(hardwareData.memory?.freeSlots || 0) > 0
                        ? isEn
                          ? 'Upgrade ready'
                          : 'آماده ارتقا'
                        : isEn
                        ? 'All slots full'
                        : 'همه اسلات‌ها پر است'}
                    </div>
                  </div>

                  <div className={`p-3 rounded-xl border ${subSurfaceBg}`}>
                    <div className={textMuted}>{isEn ? 'Board Max Support' : 'حداکثر پشتیبانی'}</div>
                    <div className={`text-lg font-bold font-mono mt-0.5 ${textPrimary}`} dir="ltr">
                      {hardwareData.memory?.maxCapacityGb > 0 ? `${hardwareData.memory.maxCapacityGb} GB` : '—'}
                    </div>
                    <div className={`text-[10px] ${textMuted}`}>
                      {isEn ? 'Motherboard ceiling' : 'سقف پشتیبانی مادربرد'}
                    </div>
                  </div>
                </div>

                {/* Visual DIMM Slot Layout */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {(hardwareData.memory?.modules || []).map((mod: any, idx: number) => (
                    <div
                      key={`ram-mod-${idx}`}
                      className={`rounded-xl border p-3.5 space-y-2 ${
                        isLightMode
                          ? 'border-indigo-200 bg-indigo-50/50'
                          : 'border-indigo-500/30 bg-indigo-950/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-500 font-mono" dir="ltr">
                          <MemoryStick className="w-3.5 h-3.5" />
                          {mod.slotLabel || `Slot ${idx + 1}`}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[11px] font-bold font-mono" dir="ltr">
                          {mod.capacityGb} GB
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                        <div>
                          <span className={textMuted}>{isEn ? 'Type: ' : 'نوع: '}</span>
                          <span className={`font-mono font-semibold ${textPrimary}`} dir="ltr">
                            {mod.memoryType} ({mod.formFactor})
                          </span>
                        </div>
                        <div>
                          <span className={textMuted}>{isEn ? 'Bus: ' : 'باس: '}</span>
                          <span className="font-mono font-semibold text-sky-500" dir="ltr">
                            {mod.configuredSpeedMhz || mod.speedMhz || '—'} MHz
                          </span>
                        </div>
                        <div className="col-span-2 truncate">
                          <span className={textMuted}>{isEn ? 'Brand: ' : 'برند: '}</span>
                          <span className={`font-semibold ${textPrimary}`} dir="ltr">
                            {mod.manufacturer || '—'}
                          </span>
                          {mod.voltageV > 0 && (
                            <span className={`ms-1.5 font-mono text-[10px] ${textMuted}`} dir="ltr">
                              ({mod.voltageV}V)
                            </span>
                          )}
                        </div>
                        {mod.partNumber && (
                          <div className="col-span-2 truncate font-mono text-[10px] text-slate-400" dir="ltr">
                            P/N: {mod.partNumber}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {Array.from({ length: Math.max(0, Math.min(8, Number(hardwareData.memory?.freeSlots) || 0)) }).map((_, emptyIdx) => (
                    <div
                      key={`ram-empty-${emptyIdx}`}
                      className={`rounded-xl border border-dashed p-3.5 flex flex-col items-center justify-center text-center min-h-[104px] ${
                        isLightMode ? 'border-slate-300 bg-slate-50/70' : 'border-slate-700 bg-slate-900/40'
                      }`}
                    >
                      <MemoryStick className={`w-4 h-4 mb-1 opacity-40 ${textMuted}`} />
                      <div className={`text-xs font-semibold ${textMuted}`}>
                        {isEn ? 'Empty RAM Slot' : 'اسلات رم خالی'}
                      </div>
                      <div className={`text-[10px] ${textMuted}`}>
                        {isEn ? 'Available for upgrade' : 'قابل استفاده برای ارتقا'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Row 3: GRAPHICS & DISPLAYS + PHYSICAL STORAGE DRIVES */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* GPUs & MONITORS CARD */}
                <div className={`rounded-2xl border p-5 space-y-4 ${surfaceBg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Gpu className="w-4 h-4 text-purple-500" />
                      <h3 className={`text-sm font-bold ${textPrimary}`}>
                        {isEn ? 'Graphics Cards (GPU) & Connected Displays' : 'کارت گرافیک (GPU) و مانیتورهای متصل'}
                      </h3>
                    </div>
                    <span className={`text-[11px] font-mono ${textMuted}`}>
                      {(hardwareData.gpus || []).length} GPU · {(hardwareData.monitors || []).length}{' '}
                      {isEn ? 'Display(s)' : 'مانیتور'}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {(hardwareData.gpus || []).map((g: any, idx: number) => (
                      <div key={`hw-gpu-${idx}`} className={`p-3.5 rounded-xl border space-y-1.5 ${subSurfaceBg}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={`text-xs font-bold ${textPrimary}`} dir="ltr">
                            {g.name}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold ${
                              g.type === 'discrete'
                                ? 'border-purple-500/40 bg-purple-500/10 text-purple-500'
                                : g.type === 'virtual'
                                ? 'border-slate-500/40 bg-slate-500/10 text-slate-400'
                                : 'border-sky-500/40 bg-sky-500/10 text-sky-500'
                            }`}
                          >
                            {g.type === 'discrete'
                              ? isEn
                                ? 'Dedicated GPU'
                                : 'گرافیک مجزا (Dedicated)'
                              : g.type === 'virtual'
                              ? isEn
                                ? 'Virtual Display'
                                : 'گرافیک مجازی'
                              : isEn
                              ? 'Onboard / Integrated'
                              : 'آنبورد (Integrated)'}
                          </span>
                        </div>
                        <div className={`flex flex-wrap items-center gap-3 text-[11px] font-mono ${textMuted}`} dir="ltr">
                          <span>VRAM: {g.vramGb > 0 ? `${g.vramGb} GB` : 'Shared / Dynamic'}</span>
                          {g.resolution && (
                            <span>
                              {g.resolution}
                              {g.refreshRateHz > 0 ? ` @ ${g.refreshRateHz}Hz` : ''}
                            </span>
                          )}
                          {g.driverVersion && <span>Driver: {g.driverVersion}</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {(hardwareData.monitors || []).length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className={`text-xs font-semibold flex items-center gap-1.5 ${textMuted}`}>
                        <Monitor className="w-3.5 h-3.5 text-sky-500" />
                        <span>{isEn ? 'Detected Monitors (EDID)' : 'مانیتورهای متصل شناسایی‌شده'}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(hardwareData.monitors || []).map((mon: any, idx: number) => (
                          <div key={`mon-${idx}`} className={`p-2.5 rounded-lg border text-xs ${subSurfaceBg}`} dir="ltr">
                            <div className={`font-semibold truncate ${textPrimary}`}>{mon.name}</div>
                            <div className={`text-[10px] font-mono ${textMuted}`}>
                              {[mon.manufacturer, mon.serialNumber ? `S/N: ${mon.serialNumber}` : '']
                                .filter(Boolean)
                                .join(' · ') || 'Plug & Play Monitor'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* PHYSICAL STORAGE DRIVES CARD */}
                <div className={`rounded-2xl border p-5 space-y-4 ${surfaceBg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <HardDrive className="w-4 h-4 text-emerald-500" />
                      <h3 className={`text-sm font-bold ${textPrimary}`}>
                        {isEn ? 'Physical Storage Drives (NVMe / SSD / HDD)' : 'درایوهای ذخیره‌سازی فیزیکی (هارد و SSD)'}
                      </h3>
                    </div>
                    <span className={`text-[11px] font-mono ${textMuted}`}>
                      {(hardwareData.disks || []).length} {isEn ? 'Drive(s)' : 'درایو'}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {(hardwareData.disks || []).length === 0 ? (
                      <div className={`p-4 rounded-xl border text-center text-xs ${subSurfaceBg} ${textMuted}`}>
                        {isEn ? 'No physical drives reported.' : 'درایو فیزیکی گزارش نشد.'}
                      </div>
                    ) : (
                      (hardwareData.disks || []).map((d: any, idx: number) => {
                        const isHealthy = /healthy|ok/i.test(String(d.healthStatus || ''));
                        return (
                          <div key={`hw-disk-${idx}`} className={`p-3.5 rounded-xl border space-y-1.5 ${subSurfaceBg}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className={`text-xs font-bold ${textPrimary}`} dir="ltr">
                                {d.model || `Disk #${idx}`}
                              </span>
                              <div className="flex items-center gap-1.5 font-mono text-[11px]" dir="ltr">
                                <span className="px-2 py-0.5 rounded bg-emerald-600/15 text-emerald-500 font-bold">
                                  {d.sizeGb >= 1000 ? `${(d.sizeGb / 1000).toFixed(2)} TB` : `${d.sizeGb} GB`}
                                </span>
                                <span className={`px-2 py-0.5 rounded border ${surfaceBg} ${textPrimary}`}>
                                  {d.mediaType || d.busType}
                                </span>
                              </div>
                            </div>
                            <div className={`flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono ${textMuted}`} dir="ltr">
                              <span>
                                Bus: {d.busType || '—'}
                                {d.firmwareVersion ? ` · FW: ${d.firmwareVersion}` : ''}
                                {d.serialNumber ? ` · S/N: ${d.serialNumber}` : ''}
                              </span>
                              <span className={`font-semibold ${isHealthy ? 'text-emerald-500' : 'text-amber-500'}`}>
                                {d.healthStatus || 'Unknown'}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Row 4: NETWORK ADAPTERS & AUDIO CONTROLLERS */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* NETWORK ADAPTERS */}
                <div className={`rounded-2xl border p-5 space-y-4 ${surfaceBg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Network className="w-4 h-4 text-sky-500" />
                      <h3 className={`text-sm font-bold ${textPrimary}`}>
                        {isEn ? 'Network Adapters (Ethernet / Wi-Fi)' : 'کارت‌های شبکه (LAN / Wi-Fi)'}
                      </h3>
                    </div>
                    <span className={`text-[11px] font-mono ${textMuted}`}>
                      {(hardwareData.networkAdapters || []).length} NIC
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {(hardwareData.networkAdapters || []).map((nic: any, idx: number) => (
                      <div key={`hw-nic-${idx}`} className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 ${subSurfaceBg}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {nic.adapterType === 'wifi' ? (
                              <Wifi className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                            ) : nic.adapterType === 'bluetooth' ? (
                              <Bluetooth className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            ) : (
                              <Network className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                            )}
                            <span className={`text-xs font-bold truncate ${textPrimary}`}>{nic.name}</span>
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                String(nic.status).toLowerCase() === 'up' ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            />
                          </div>
                          <div className={`text-[11px] truncate mt-0.5 ${textMuted}`} dir="ltr">
                            {nic.description}
                          </div>
                        </div>

                        <div className="text-end font-mono text-[11px] shrink-0" dir="ltr">
                          <div className="font-semibold text-sky-500">{nic.linkSpeed || nic.status}</div>
                          {nic.macAddress && (
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(nic.macAddress);
                                setCopiedHwMac(nic.macAddress);
                                setTimeout(() => setCopiedHwMac(null), 1500);
                              }}
                              className={`inline-flex items-center gap-1 hover:text-sky-500 cursor-pointer ${textMuted}`}
                            >
                              <span>{nic.macAddress}</span>
                              {copiedHwMac === nic.macAddress ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AUDIO CONTROLLERS */}
                <div className={`rounded-2xl border p-5 space-y-4 ${surfaceBg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Volume2 className="w-4 h-4 text-amber-500" />
                      <h3 className={`text-sm font-bold ${textPrimary}`}>
                        {isEn ? 'Sound & Audio Hardware' : 'تجهیزات و کارت‌های صدا (Audio)'}
                      </h3>
                    </div>
                    <span className={`text-[11px] font-mono ${textMuted}`}>
                      {(hardwareData.audioDevices || []).length}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {(hardwareData.audioDevices || []).length === 0 ? (
                      <div className={`p-4 rounded-xl border text-center text-xs ${subSurfaceBg} ${textMuted}`}>
                        {isEn ? 'No audio controllers detected.' : 'کارت صدا شناسایی نشد.'}
                      </div>
                    ) : (
                      (hardwareData.audioDevices || []).map((au: any, idx: number) => (
                        <div key={`hw-au-${idx}`} className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${subSurfaceBg}`}>
                          <div className="min-w-0">
                            <div className={`text-xs font-bold truncate ${textPrimary}`} dir="ltr">
                              {au.name}
                            </div>
                            <div className={`text-[11px] truncate ${textMuted}`} dir="ltr">
                              {au.manufacturer || 'Standard Audio Driver'}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold shrink-0 ${
                              au.isOnboard
                                ? 'border-sky-500/35 bg-sky-500/10 text-sky-500'
                                : 'border-amber-500/35 bg-amber-500/10 text-amber-500'
                            }`}
                          >
                            {au.isOnboard
                              ? isEn
                                ? 'Onboard Audio'
                                : 'آنبورد'
                              : isEn
                              ? 'External / Display Audio'
                              : 'خارجی / HDMI'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Row 5: CONNECTED PERIPHERALS EXPLORER (USB / MOUSE / KEYBOARD / CAMERA / BLUETOOTH / BIOMETRIC) */}
              <div className={`rounded-2xl border p-5 space-y-4 ${surfaceBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Usb className="w-4 h-4 text-indigo-500" />
                    <div>
                      <h3 className={`text-sm font-bold ${textPrimary}`}>
                        {isEn
                          ? 'Connected Peripherals & Plug-and-Play Devices'
                          : 'سخت‌افزارها و تجهیزات جانبی متصل به سیستم (USB / کیبورد / ماوس / وب‌کم / بلوتوث)'}
                      </h3>
                      <p className={`text-xs mt-0.5 ${textMuted}`}>
                        {isEn
                          ? 'Live inventory of plugged-in user peripherals filtered cleanly from OS root enumerators.'
                          : 'فهرست تمیز و دسته‌بندی‌شده تمامی تجهیزات متصل به پورت‌های سیستم (بدون شلوغی درایورهای سیستمی ویندوز).'}
                      </p>
                    </div>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-3 ${textMuted}`} />
                    <input
                      type="text"
                      value={peripheralSearch}
                      onChange={(e) => setPeripheralSearch(e.target.value)}
                      placeholder={isEn ? 'Filter connected devices...' : 'جستجو در دستگاه‌های متصل...'}
                      className={`w-full ps-8 pe-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                    />
                  </div>
                </div>

                {/* Category Filter Tabs */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'all', en: 'All Connected', fa: 'همه تجهیزات' },
                    { id: 'input', en: 'Mouse & Keyboard', fa: 'کیبورد و ماوس' },
                    { id: 'camera', en: 'Cameras & Scanners', fa: 'دوربین و اسکنر' },
                    { id: 'bluetooth', en: 'Bluetooth', fa: 'بلوتوث' },
                    { id: 'usb_storage', en: 'USB & Optical Drives', fa: 'فلش و حافظه USB' },
                    { id: 'printer_scanner', en: 'Printers', fa: 'پرینترها' },
                    { id: 'biometric', en: 'Biometric / SmartCard', fa: 'اثرانگشت / کارت‌خوان' },
                    { id: 'other', en: 'USB Hubs & Docks', fa: 'هاب و سایر USB' },
                  ].map((cat) => {
                    const list: any[] = Array.isArray(hardwareData.connectedDevices) ? hardwareData.connectedDevices : [];
                    const count =
                      cat.id === 'all' ? list.length : list.filter((d) => d.category === cat.id).length;
                    if (cat.id !== 'all' && count === 0) return null;
                    const active = peripheralCategoryFilter === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setPeripheralCategoryFilter(cat.id)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                          active
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : isLightMode
                            ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        <span>{isEn ? cat.en : cat.fa}</span>
                        <span className="ms-1.5 opacity-80 font-mono">({count})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Peripherals Grid */}
                {(() => {
                  const list: any[] = Array.isArray(hardwareData.connectedDevices) ? hardwareData.connectedDevices : [];
                  const q = peripheralSearch.trim().toLowerCase();
                  const filtered = list.filter((d) => {
                    if (peripheralCategoryFilter !== 'all' && d.category !== peripheralCategoryFilter) return false;
                    if (!q) return true;
                    return (
                      String(d.name || '').toLowerCase().includes(q) ||
                      String(d.manufacturer || '').toLowerCase().includes(q) ||
                      String(d.pnpClass || '').toLowerCase().includes(q)
                    );
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className={`p-6 rounded-xl border text-center text-xs ${subSurfaceBg} ${textMuted}`}>
                        {isEn ? 'No connected peripherals match this filter.' : 'تجهیزات جانبی مطابق فیلتر فعلی یافت نشد.'}
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filtered.map((dev: any, idx: number) => {
                        const DevIcon =
                          dev.category === 'input'
                            ? Keyboard
                            : dev.category === 'camera'
                            ? Camera
                            : dev.category === 'bluetooth'
                            ? Bluetooth
                            : dev.category === 'printer_scanner'
                            ? Printer
                            : dev.category === 'biometric'
                            ? Fingerprint
                            : dev.category === 'usb_storage'
                            ? HardDrive
                            : Usb;
                        return (
                          <div
                            key={`periph-${idx}`}
                            className={`p-3 rounded-xl border flex items-start gap-3 ${subSurfaceBg}`}
                          >
                            <div
                              className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${
                                isLightMode
                                  ? 'bg-white border-slate-200 text-indigo-600'
                                  : 'bg-slate-800 border-slate-700 text-indigo-400'
                              }`}
                            >
                              <DevIcon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className={`text-xs font-bold truncate ${textPrimary}`} dir="ltr" title={dev.name}>
                                {dev.name}
                              </div>
                              <div className={`text-[11px] truncate ${textMuted}`} dir="ltr">
                                {dev.manufacturer || dev.pnpClass}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-[10px] font-mono">
                                <span
                                  className={
                                    String(dev.status).toLowerCase() === 'ok' ? 'text-emerald-500' : 'text-amber-500'
                                  }
                                >
                                  ● {dev.status || 'OK'}
                                </span>
                                <span className={textMuted}>{dev.pnpClass}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: ENDPOINT-SIDE NETWORK DIAGNOSTICS & SAFE RESET               */}
      {/* =================================================================== */}
      {activeSubTab === 'network' && (
        <div className="space-y-6">
          {networkError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 flex items-start gap-3 text-xs text-rose-500">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className={isLightMode ? 'text-rose-800' : 'text-rose-200'}>{networkError}</span>
            </div>
          )}

          {netActionResult && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-emerald-500">
                <CheckCircle2 className="w-4 h-4" />
                <span>{isEn ? netActionResult.message : netActionResult.messageFa}</span>
              </div>
              {netActionResult.rawOutput && (
                <pre
                  dir="ltr"
                  className={`p-3 rounded-lg border font-mono text-[11px] overflow-x-auto ${subSurfaceBg} ${textPrimary}`}
                >
                  {netActionResult.rawOutput}
                </pre>
              )}
            </div>
          )}

          {/* Action Toolbar: Load Snapshot + Allowlisted Safe Network Resets */}
          <div className={`rounded-xl border p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 ${surfaceBg}`}>
            <div>
              <h2 className={`text-sm font-bold ${textPrimary}`}>
                {isEn ? 'Endpoint Network Stack & Allowlisted Safe Resets' : 'وضعیت شبکه سیستم کاربر و ریست‌های امن مجاز'}
              </h2>
              <p className={`text-xs ${textMuted}`}>
                {isEn
                  ? 'Inspect adapters, DNS, Gateway & Proxy or run fixed safe actions (Flush DNS / Renew IP) with zero arbitrary shell.'
                  : 'بررسی کارت شبکه، DNS، Gateway و Proxy یا اجرای دکمه‌های ثابت و ایمن (Flush DNS و Renew IP) بدون دسترسی ترمینال آزاد.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleInspectNetwork}
                disabled={!canRunDiagnostics || loadingNetwork}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
              >
                {loadingNetwork ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>{isEn ? 'Inspect Network Stack' : 'دریافت وضعیت شبکه'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSafeNetworkAction('network_flush_dns')}
                disabled={!canExecuteActions || runningNetAction !== null}
                title={
                  !canExecuteActions
                    ? isEn
                      ? 'Requires canExecuteHelpdeskActions permission'
                      : 'نیازمند مجوز canExecuteHelpdeskActions در Access Policy'
                    : undefined
                }
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition disabled:opacity-50 cursor-pointer ${
                  isLightMode
                    ? 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700'
                }`}
              >
                {runningNetAction === 'network_flush_dns' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : !canExecuteActions ? (
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5 text-teal-500" />
                )}
                <span>Flush DNS</span>
              </button>

              <button
                type="button"
                onClick={() => handleSafeNetworkAction('network_renew_ip')}
                disabled={!canExecuteActions || runningNetAction !== null}
                title={
                  !canExecuteActions
                    ? isEn
                      ? 'Requires canExecuteHelpdeskActions permission'
                      : 'نیازمند مجوز canExecuteHelpdeskActions در Access Policy'
                    : undefined
                }
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition disabled:opacity-50 cursor-pointer ${
                  isLightMode
                    ? 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700'
                }`}
              >
                {runningNetAction === 'network_renew_ip' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : !canExecuteActions ? (
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <Network className="w-3.5 h-3.5 text-sky-500" />
                )}
                <span>Renew DHCP IP</span>
              </button>
            </div>
          </div>

          {/* Endpoint-Side Live Probe Console (Ping / Port / DNS / NSLookup / Tracert / HTTP / ARP FROM INSIDE the User's PC!) */}
          <form onSubmit={handleRunProbe} className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Globe className="w-4 h-4 text-sky-500" />
                <span className={textPrimary}>
                  {isEn
                    ? 'Endpoint-Side Diagnostic Probe (Executes FROM Inside User Workstation)'
                    : 'تست عیب‌یابی شبکه از داخل خود سیستم کاربر (Ping / Port / NSLookup / Tracert / HTTP / ARP)'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                {[
                  {
                    label: isEn ? 'NSLookup A/MX' : 'NSLookup رکورد MX',
                    onClick: () => {
                      setProbeType('nslookup');
                      setProbeDnsRecordType('MX');
                      setProbeTarget('gmail.com');
                    },
                  },
                  {
                    label: isEn ? 'NSLookup @ 8.8.8.8' : 'تست با DNS گوگل',
                    onClick: () => {
                      setProbeType('nslookup');
                      setProbeDnsRecordType('A');
                      setProbeDnsServer('8.8.8.8');
                      setProbeTarget('google.com');
                    },
                  },
                  {
                    label: 'Tracert 8.8.8.8',
                    onClick: () => {
                      setProbeType('tracert');
                      setProbeTarget('8.8.8.8');
                    },
                  },
                  {
                    label: isEn ? 'HTTPS Check' : 'تست وب HTTPS',
                    onClick: () => {
                      setProbeType('http');
                      setProbeTarget('https://www.microsoft.com');
                    },
                  },
                  {
                    label: isEn ? 'ARP Table' : 'جدول ARP همسایه‌ها',
                    onClick: () => {
                      setProbeType('arp');
                      setProbeTarget('*');
                    },
                  },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={preset.onClick}
                    className={`px-2 py-1 rounded-md border font-medium transition cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-50 hover:bg-sky-50 border-slate-200 text-slate-700'
                        : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-3">
                <label className={`block text-xs font-medium mb-1 ${textMuted}`}>
                  {isEn ? 'Probe Type' : 'نوع تست'}
                </label>
                <select
                  value={probeType}
                  onChange={(e) => setProbeType(e.target.value as any)}
                  className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="ping">{isEn ? 'ICMP Ping (4 packets)' : 'پینگ ICMP (۴ بسته)'}</option>
                  <option value="port">{isEn ? 'TCP Port Connectivity' : 'تست باز بودن پورت TCP'}</option>
                  <option value="dns">{isEn ? 'Standard DNS Lookup' : 'تست ترجمه نام DNS'}</option>
                  <option value="nslookup">{isEn ? 'NSLookup (Record Type & DNS Server)' : 'NSLookup پیشرفته (نوع رکورد و سرور DNS)'}</option>
                  <option value="tracert">{isEn ? 'Traceroute (tracert -d)' : 'مسیر‌یابی بسته‌ها (Tracert)'}</option>
                  <option value="http">{isEn ? 'HTTP / HTTPS Reachability' : 'تست دسترسی وب HTTP / HTTPS'}</option>
                  <option value="arp">{isEn ? 'ARP Neighbor Table Lookup' : 'مشاهده و جستجوی جدول ARP'}</option>
                </select>
              </div>

              <div
                className={
                  probeType === 'port'
                    ? 'sm:col-span-5'
                    : probeType === 'nslookup'
                    ? 'sm:col-span-3'
                    : 'sm:col-span-7'
                }
              >
                <label className={`block text-xs font-medium mb-1 ${textMuted}`}>
                  {probeType === 'http'
                    ? isEn
                      ? 'URL or Hostname'
                      : 'آدرس وب (URL یا دامنه)'
                    : probeType === 'arp'
                    ? isEn
                      ? 'Filter IP/MAC (or * for all)'
                      : 'فیلتر IP/MAC (یا * برای همه)'
                    : isEn
                    ? 'Destination Host / IP / Domain'
                    : 'آدرس مقصد (IP یا دامنه)'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={probeTarget}
                  onChange={(e) => setProbeTarget(e.target.value)}
                  placeholder={
                    probeType === 'http'
                      ? 'https://portal.company.local'
                      : probeType === 'arp'
                      ? '* or 192.168.1.1'
                      : '8.8.8.8 / dc01.corp.local / google.com'
                  }
                  className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                  required={probeType !== 'arp'}
                />
              </div>

              {probeType === 'port' && (
                <div className="sm:col-span-2">
                  <label className={`block text-xs font-medium mb-1 ${textMuted}`}>
                    {isEn ? 'TCP Port' : 'پورت TCP'}
                  </label>
                  <input
                    type="number"
                    dir="ltr"
                    min={1}
                    max={65535}
                    value={probePort}
                    onChange={(e) => setProbePort(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                    required
                  />
                </div>
              )}

              {probeType === 'nslookup' && (
                <>
                  <div className="sm:col-span-2">
                    <label className={`block text-xs font-medium mb-1 ${textMuted}`}>
                      {isEn ? 'Record Type' : 'نوع رکورد'}
                    </label>
                    <select
                      value={probeDnsRecordType}
                      onChange={(e) => setProbeDnsRecordType(e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                    >
                      {['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'PTR', 'NS', 'SRV', 'SOA', 'ANY'].map((rt) => (
                        <option key={rt} value={rt}>
                          {rt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={`block text-xs font-medium mb-1 ${textMuted}`}>
                      {isEn ? 'DNS Server (Opt.)' : 'سرور DNS (اختیاری)'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={probeDnsServer}
                      onChange={(e) => setProbeDnsServer(e.target.value)}
                      placeholder="e.g. 8.8.8.8"
                      className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                    />
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={!canRunDiagnostics || loadingProbe}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {loadingProbe ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isEn ? 'Run Probe' : 'اجرای تست'}</span>
                </button>
              </div>
            </div>

            {probeError && (
              <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-xs text-rose-500">
                {probeError}
              </div>
            )}

            {probeResult && (
              <div className={`p-4 rounded-xl border space-y-3 ${subSurfaceBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div
                    className={`font-bold flex items-center gap-2 ${
                      probeResult.success ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {probeResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    <span>{isEn ? probeResult.summary : probeResult.summaryFa}</span>
                  </div>
                  <span className={`font-mono text-[11px] ${textMuted}`}>
                    {probeResult.targetIp} → {probeResult.probeTarget}
                    {probeResult.probePort ? `:${probeResult.probePort}` : ''}
                  </span>
                </div>

                {Array.isArray(probeResult.records) && probeResult.records.length > 0 && (
                  <div className={`text-xs font-mono space-y-1 ${textPrimary}`} dir="ltr">
                    {probeResult.records.map((rec: string, i: number) => (
                      <div key={i}>{rec}</div>
                    ))}
                  </div>
                )}

                {probeResult.rawOutput && (
                  <pre
                    dir="ltr"
                    className={`p-3 rounded-lg border font-mono text-[11px] overflow-x-auto max-h-56 ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
                    }`}
                  >
                    {probeResult.rawOutput}
                  </pre>
                )}
              </div>
            )}
          </form>

          {/* Network Adapters Table + Manual IPv4 & DNS Editor */}
          {networkData && (
            <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className={`text-sm font-bold ${textPrimary}`}>
                  {isEn
                    ? `Active Network Adapters & Manual IP/DNS (${networkData.hostname})`
                    : `کارت‌های شبکه و تنظیم دستی IP / DNS (${networkData.hostname})`}
                </h3>
                <div className={`text-xs ${textMuted}`}>
                  {isEn ? 'User Proxy' : 'پروکسی کاربر'}:{' '}
                  <strong className={networkData.proxy?.enabled ? 'text-amber-500' : 'text-emerald-500'}>
                    {networkData.proxy?.enabled
                      ? `${isEn ? 'ENABLED' : 'فعال'} (${networkData.proxy.server || networkData.proxy.autoConfigUrl || '-'})`
                      : isEn
                      ? 'Direct (No Proxy)'
                      : 'مستقیم (غیرفعال)'}
                  </strong>
                  <span className="mx-2" aria-hidden="true">·</span>
                  <span className="font-mono">ARP: {networkData.arpSummaryCount}</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className={`border-b text-start ${isLightMode ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
                      <th className="py-2 px-2.5 text-start">{isEn ? 'Adapter' : 'نام کارت شبکه'}</th>
                      <th className="py-2 px-2.5 text-start">{isEn ? 'Status / Speed' : 'وضعیت / سرعت'}</th>
                      <th className="py-2 px-2.5 text-start">IPv4 / Mask</th>
                      <th className="py-2 px-2.5 text-start">Gateway</th>
                      <th className="py-2 px-2.5 text-start">DNS</th>
                      <th className="py-2 px-2.5 text-start">MAC / DHCP</th>
                      <th className="py-2 px-2.5 text-end">{isEn ? 'Configure' : 'تنظیم'}</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                    {(networkData.adapters || []).map((a: any, i: number) => {
                      const isEditingThis = editingAdapter?.name === a.name;
                      return (
                        <tr key={`${a.name}-${i}`} className={isEditingThis ? (isLightMode ? 'bg-sky-50/70' : 'bg-sky-500/10') : ''}>
                          <td className="py-2.5 px-2.5">
                            <div className={`font-semibold ${textPrimary}`}>{a.name}</div>
                            <div className={`text-[11px] ${textMuted}`}>{a.description}</div>
                          </td>
                          <td className="py-2.5 px-2.5 font-mono">
                            <span className={a.status === 'Up' ? 'text-emerald-500 font-semibold' : 'text-rose-500'}>
                              {a.status}
                            </span>
                            <span className={`ms-1.5 ${textMuted}`}>{a.linkSpeed}</span>
                          </td>
                          <td className={`py-2.5 px-2.5 font-mono ${textPrimary}`} dir="ltr">
                            <div>{(a.ipv4Addresses || []).join(', ') || '-'}</div>
                            {Array.isArray(a.subnetMasks) && a.subnetMasks[0] && (
                              <div className={`text-[11px] ${textMuted}`}>
                                {a.subnetMasks[0]} {a.prefixLengths?.[0] ? `/${a.prefixLengths[0]}` : ''}
                              </div>
                            )}
                          </td>
                          <td className={`py-2.5 px-2.5 font-mono ${textMuted}`} dir="ltr">
                            {(a.defaultGateways || []).join(', ') || '-'}
                          </td>
                          <td className={`py-2.5 px-2.5 font-mono ${textMuted}`} dir="ltr">
                            {(a.dnsServers || []).join(', ') || '-'}
                          </td>
                          <td className={`py-2.5 px-2.5 font-mono text-[11px] ${textMuted}`}>
                            <div>{a.macAddress || '-'}</div>
                            <div>DHCP: {a.dhcpEnabled === true ? 'Yes' : a.dhcpEnabled === false ? 'Static' : '-'}</div>
                          </td>
                          <td className="py-2.5 px-2.5 text-end">
                            <button
                              type="button"
                              disabled={!canExecuteActions}
                              onClick={() => (isEditingThis ? setEditingAdapter(null) : handleStartEditAdapter(a))}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition disabled:opacity-50 cursor-pointer ${
                                isEditingThis
                                  ? 'border-sky-500 bg-sky-600 text-white'
                                  : isLightMode
                                  ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                              }`}
                            >
                              <Settings className="w-3 h-3" />
                              <span>{isEditingThis ? (isEn ? 'Close' : 'بستن') : isEn ? 'Edit IP/DNS' : 'تغییر IP/DNS'}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Inline Manual IPv4 & DNS Editor */}
              {editingAdapter && (
                <div className={`p-4 rounded-xl border space-y-4 ${subSurfaceBg}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <Settings className="w-4 h-4 text-sky-500" />
                      <span className={textPrimary}>
                        {isEn
                          ? `Manual IPv4 & DNS Configuration: ${editingAdapter.name}`
                          : `تنظیم دستی آدرس IPv4 و سرورهای DNS برای کارت شبکه: ${editingAdapter.name}`}
                      </span>
                    </div>
                    <span className="text-[11px] text-amber-500 font-medium">
                      {isEn
                        ? 'Caution: Changing the active management IP may briefly disconnect this session.'
                        : 'هشدار: تغییر IP اصلی که اکنون به آن متصل هستید ممکن است باعث قطع نشست فعلی شود.'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                    {/* IPv4 Mode */}
                    <div className={`p-3.5 rounded-xl border space-y-3 ${surfaceBg}`}>
                      <div className={`font-bold ${textPrimary}`}>{isEn ? 'IPv4 Address & Gateway' : 'تنظیم آدرس IP و Gateway'}</div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: 'keep' as const, en: 'Keep Current', fa: 'بدون تغییر' },
                          { id: 'dhcp' as const, en: 'Automatic (DHCP)', fa: 'خودکار (DHCP)' },
                          { id: 'static' as const, en: 'Manual (Static IP)', fa: 'دستی (Static IP)' },
                        ].map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setNicIpMode(m.id)}
                            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${
                              nicIpMode === m.id
                                ? 'border-sky-500 bg-sky-500/15 text-sky-500'
                                : isLightMode
                                ? 'border-slate-200 bg-slate-50 text-slate-600'
                                : 'border-slate-700 bg-slate-900 text-slate-400'
                            }`}
                          >
                            {isEn ? m.en : m.fa}
                          </button>
                        ))}
                      </div>

                      {nicIpMode === 'static' && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>IPv4 Address</label>
                            <input
                              type="text"
                              dir="ltr"
                              value={nicIpAddress}
                              onChange={(e) => setNicIpAddress(e.target.value)}
                              placeholder="192.168.10.55"
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                            />
                          </div>
                          <div>
                            <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>Subnet Mask</label>
                            <input
                              type="text"
                              dir="ltr"
                              value={nicSubnetMask}
                              onChange={(e) => setNicSubnetMask(e.target.value)}
                              placeholder="255.255.255.0"
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                            />
                          </div>
                          <div>
                            <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>Default Gateway</label>
                            <input
                              type="text"
                              dir="ltr"
                              value={nicGateway}
                              onChange={(e) => setNicGateway(e.target.value)}
                              placeholder="192.168.10.1"
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* DNS Mode */}
                    <div className={`p-3.5 rounded-xl border space-y-3 ${surfaceBg}`}>
                      <div className={`font-bold ${textPrimary}`}>{isEn ? 'DNS Servers' : 'تنظیم سرورهای DNS'}</div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: 'keep' as const, en: 'Keep Current', fa: 'بدون تغییر' },
                          { id: 'dhcp' as const, en: 'Automatic (DHCP DNS)', fa: 'خودکار از DHCP' },
                          { id: 'static' as const, en: 'Manual (Static DNS)', fa: 'دستی (Static DNS)' },
                        ].map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setNicDnsMode(m.id)}
                            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${
                              nicDnsMode === m.id
                                ? 'border-teal-500 bg-teal-500/15 text-teal-500'
                                : isLightMode
                                ? 'border-slate-200 bg-slate-50 text-slate-600'
                                : 'border-slate-700 bg-slate-900 text-slate-400'
                            }`}
                          >
                            {isEn ? m.en : m.fa}
                          </button>
                        ))}
                      </div>

                      {nicDnsMode === 'static' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                              {isEn ? 'Preferred DNS (Primary)' : 'DNS اول (اصلی)'}
                            </label>
                            <input
                              type="text"
                              dir="ltr"
                              value={nicDnsPrimary}
                              onChange={(e) => setNicDnsPrimary(e.target.value)}
                              placeholder="192.168.10.10"
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                            />
                          </div>
                          <div>
                            <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                              {isEn ? 'Alternate DNS (Optional)' : 'DNS دوم (اختیاری)'}
                            </label>
                            <input
                              type="text"
                              dir="ltr"
                              value={nicDnsSecondary}
                              onChange={(e) => setNicDnsSecondary(e.target.value)}
                              placeholder="8.8.8.8"
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAdapter(null);
                        setConfirmNicSave(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-700'
                          : 'bg-slate-900 border-slate-700 text-slate-300'
                      }`}
                    >
                      {isEn ? 'Cancel' : 'انصراف'}
                    </button>

                    {!confirmNicSave ? (
                      <button
                        type="button"
                        disabled={!canExecuteActions || savingNicConfig || (nicIpMode === 'keep' && nicDnsMode === 'keep')}
                        onClick={() => setConfirmNicSave(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Apply IP / DNS Changes' : 'اعمال تغییرات IP / DNS'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={savingNicConfig}
                        onClick={handleSaveAdapterConfig}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                      >
                        {savingNicConfig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        <span>{isEn ? 'Confirm Save Network Config' : 'تایید و اعمال نهایی'}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* OS Proxy Manager & Local DNS hosts File Manager */}
          {networkData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* OS Proxy Inspector & Manager Card */}
              <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Waypoints className="w-4 h-4 text-amber-500" />
                      <h3 className={`text-sm font-bold ${textPrimary}`}>
                        {isEn ? 'OS Proxy Inspector & Manager' : 'بررسی و مدیریت Proxy سیستم‌عامل'}
                      </h3>
                    </div>
                    <p className={`text-[11px] mt-0.5 ${textMuted}`}>
                      {isEn
                        ? `User WinINet (${networkData.proxy?.activeUser || 'Current'}) & System WinHTTP`
                        : `وضعیت WinINet کاربر (${networkData.proxy?.activeUser || 'فعال'}) و WinHTTP سیستمی`}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border ${
                      networkData.proxy?.enabled || !networkData.proxy?.winhttpDirect
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                        : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                    }`}
                  >
                    {networkData.proxy?.enabled
                      ? isEn
                        ? 'Proxy Active'
                        : 'پروکسی فعال است'
                      : isEn
                      ? 'Direct Connection'
                      : 'مستقیم (بدون پروکسی)'}
                  </span>
                </div>

                {/* Current Status Readout */}
                <div className={`p-3 rounded-xl border text-xs grid grid-cols-1 sm:grid-cols-2 gap-2.5 ${subSurfaceBg}`}>
                  <div>
                    <div className={`text-[11px] ${textMuted}`}>{isEn ? 'User WinINet Proxy' : 'پروکسی کاربر (WinINet)'}</div>
                    <div className={`font-mono font-semibold mt-0.5 ${textPrimary}`} dir="ltr">
                      {networkData.proxy?.enabled
                        ? networkData.proxy?.server || networkData.proxy?.autoConfigUrl || 'Enabled'
                        : 'Disabled'}
                    </div>
                  </div>
                  <div>
                    <div className={`text-[11px] ${textMuted}`}>{isEn ? 'System WinHTTP Proxy' : 'پروکسی سیستمی (WinHTTP)'}</div>
                    <div className={`font-mono font-semibold mt-0.5 ${textPrimary}`} dir="ltr">
                      {networkData.proxy?.winhttpDirect === false
                        ? networkData.proxy?.winhttpServer || 'Configured'
                        : 'Direct access (no proxy)'}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                        {isEn ? 'Target Scope' : 'محدوده اعمال'}
                      </label>
                      <select
                        value={proxyScope}
                        onChange={(e) => setProxyScope(e.target.value as any)}
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                      >
                        <option value="user">{isEn ? 'Active User (WinINet / Browser)' : 'کاربر فعال (WinINet / مرورگر)'}</option>
                        <option value="winhttp">{isEn ? 'System Services (WinHTTP)' : 'سرویس‌های ویندوز (WinHTTP)'}</option>
                        <option value="both">{isEn ? 'Both (User + WinHTTP)' : 'هر دو (کاربر + سرویس‌ها)'}</option>
                      </select>
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={proxyEnabled}
                          onChange={(e) => setProxyEnabled(e.target.checked)}
                          className="rounded border-slate-400 text-sky-600 focus:ring-sky-500"
                        />
                        <span className={`font-semibold ${textPrimary}`}>
                          {isEn ? 'Enable Manual Proxy' : 'فعال‌سازی پروکسی دستی'}
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                        {isEn ? 'Proxy Server (host:port)' : 'آدرس و پورت Proxy'}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={proxyServer}
                        onChange={(e) => setProxyServer(e.target.value)}
                        placeholder="192.168.10.5:8080"
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                      />
                    </div>
                    <div>
                      <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                        {isEn ? 'Bypass List (Optional)' : 'استثناها / Bypass (اختیاری)'}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={proxyOverride}
                        onChange={(e) => setProxyOverride(e.target.value)}
                        placeholder="<local>;10.*;192.168.*"
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                    <div>
                      <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                        {isEn ? 'PAC AutoConfig URL (Optional)' : 'لینک PAC اسکریپت (اختیاری)'}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={proxyAutoConfigUrl}
                        onChange={(e) => setProxyAutoConfigUrl(e.target.value)}
                        placeholder="http://wpad.corp.local/proxy.pac"
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                      />
                    </div>
                    <div className="pb-1">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={proxyAutoDetect}
                          onChange={(e) => setProxyAutoDetect(e.target.checked)}
                          className="rounded border-slate-400 text-sky-600 focus:ring-sky-500"
                        />
                        <span className={textMuted}>
                          {isEn ? 'Automatically detect settings (WPAD)' : 'تشخیص خودکار تنظیمات (WPAD)'}
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={!canExecuteActions || savingProxy}
                      onClick={() => handleSaveProxyConfig(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Disable Proxy (Direct)' : 'حذف پروکسی (اتصال مستقیم)'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={!canExecuteActions || savingProxy}
                      onClick={() => handleSaveProxyConfig(false)}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      {savingProxy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>{isEn ? 'Apply Proxy Settings' : 'ذخیره تنظیمات Proxy'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Local DNS hosts File Inspector & Manager Card */}
              <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-500" />
                      <h3 className={`text-sm font-bold ${textPrimary}`}>
                        {isEn ? 'Local DNS Hosts File Manager' : 'بررسی و مدیریت فایل محلی DNS (hosts)'}
                      </h3>
                    </div>
                    <p className={`text-[11px] font-mono mt-0.5 ${textMuted}`} dir="ltr">
                      {networkData.hostsFilePath || 'C:\\Windows\\System32\\drivers\\etc\\hosts'}
                    </p>
                  </div>
                  <div className="relative">
                    <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-2.5 ${textMuted}`} />
                    <input
                      type="text"
                      value={hostsSearch}
                      onChange={(e) => setHostsSearch(e.target.value)}
                      placeholder={isEn ? 'Filter hosts...' : 'فیلتر IP یا نام...'}
                      className={`ps-8 pe-2.5 py-1 rounded-lg border text-xs outline-none w-40 ${inputCls}`}
                    />
                  </div>
                </div>

                {/* Add new hosts entry */}
                <form
                  onSubmit={(e) => handleManageHosts('add', undefined, e)}
                  className={`p-3 rounded-xl border grid grid-cols-1 sm:grid-cols-12 gap-2 items-end ${subSurfaceBg}`}
                >
                  <div className="sm:col-span-4">
                    <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>IP Address</label>
                    <input
                      type="text"
                      dir="ltr"
                      value={hostsNewIp}
                      onChange={(e) => setHostsNewIp(e.target.value)}
                      placeholder="192.168.10.20"
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                      required
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                      {isEn ? 'Hostname(s)' : 'نام دامنه / سرور'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={hostsNewNames}
                      onChange={(e) => setHostsNewNames(e.target.value)}
                      placeholder="erp.local portal"
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                      required
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <button
                      type="submit"
                      disabled={!canExecuteActions || busyHostsKey === 'add'}
                      className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      {busyHostsKey === 'add' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>{isEn ? 'Add' : 'افزودن'}</span>
                    </button>
                  </div>
                </form>

                {/* Entries Table */}
                {filteredHostsEntries.length === 0 ? (
                  <div className={`p-5 rounded-xl border text-center text-xs ${subSurfaceBg} ${textMuted}`}>
                    {isEn
                      ? 'No custom host mappings found in local hosts file.'
                      : 'هیچ رکورد اختصاصی در فایل محلی hosts سیستم کاربر ثبت نشده است.'}
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full min-w-[460px] text-xs border-collapse">
                      <thead className={`sticky top-0 z-10 ${isLightMode ? 'bg-slate-50 text-slate-600' : 'bg-slate-900 text-slate-400'}`}>
                        <tr className="border-b border-slate-200 dark:border-slate-800">
                          <th className="py-2.5 px-3 text-start whitespace-nowrap w-24">{isEn ? 'State' : 'وضعیت'}</th>
                          <th className="py-2.5 px-3 text-start whitespace-nowrap">IP</th>
                          <th className="py-2.5 px-3 text-start">{isEn ? 'Hostnames' : 'نام‌ها'}</th>
                          <th className="py-2.5 px-3 text-end whitespace-nowrap w-32">{isEn ? 'Actions' : 'عملیات'}</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                        {filteredHostsEntries.map((he: any) => (
                          <tr key={he.id} className={!he.enabled ? 'opacity-65' : ''}>
                            <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                              <span
                                className={`inline-flex items-center whitespace-nowrap shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                                  he.enabled
                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                                    : 'border-slate-500/30 bg-slate-500/10 text-slate-400'
                                }`}
                              >
                                {he.enabled ? (isEn ? 'Active' : 'فعال') : isEn ? 'Disabled (#)' : 'غیرفعال (#)'}
                              </span>
                            </td>
                            <td className={`py-2.5 px-3 font-mono whitespace-nowrap align-middle ${textPrimary}`} dir="ltr">
                              {he.ip}
                            </td>
                            <td className={`py-2.5 px-3 font-mono align-middle break-all ${textPrimary}`} dir="ltr">
                              <div>{he.hostnames}</div>
                              {he.comment && <div className={`text-[10px] ${textMuted}`}># {he.comment}</div>}
                            </td>
                            <td className="py-2.5 px-3 text-end whitespace-nowrap align-middle">
                              <div className="inline-flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={!canExecuteActions || busyHostsKey !== null}
                                  onClick={() => handleManageHosts('toggle', he.lineIndex)}
                                  title={he.enabled ? (isEn ? 'Comment out (#)' : 'غیرفعال‌سازی موقت') : isEn ? 'Enable' : 'فعال‌سازی'}
                                  className={`h-7 px-2.5 inline-flex items-center justify-center whitespace-nowrap rounded-md border text-[11px] font-medium cursor-pointer transition disabled:opacity-40 ${
                                    isLightMode
                                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                                  }`}
                                >
                                  {he.enabled ? (isEn ? 'Disable' : 'غیرفعال') : isEn ? 'Enable' : 'فعال'}
                                </button>
                                <button
                                  type="button"
                                  disabled={!canExecuteActions || busyHostsKey !== null}
                                  onClick={() => handleManageHosts('delete', he.lineIndex)}
                                  title={isEn ? 'Delete entry' : 'حذف ردیف'}
                                  className="h-7 w-7 inline-flex items-center justify-center shrink-0 rounded-md border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 cursor-pointer transition disabled:opacity-40"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Simple Static Routing Table & Easy Route Writer */}
          {networkData && (
            <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Route className="w-4 h-4 text-teal-500" />
                    <h3 className={`text-sm font-bold ${textPrimary}`}>
                      {isEn
                        ? 'Simple Static Route Writer & Routing Table'
                        : 'جدول مسیریابی و افزودن بسیار ساده روت استاتیک (Static Route)'}
                    </h3>
                  </div>
                  <p className={`text-xs mt-0.5 ${textMuted}`}>
                    {isEn
                      ? 'Easily route a specific IP or subnet through a desired Gateway without typing complex route commands.'
                      : 'به‌سادگی تعیین کنید ترافیک یک IP یا رنج شبکه از طریق کدام Gateway یا کارت شبکه عبور کند (با پیش‌نمایش زنده دستور).'}
                  </p>
                </div>

                <div className="relative">
                  <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-2.5 ${textMuted}`} />
                  <input
                    type="text"
                    value={routeSearch}
                    onChange={(e) => setRouteSearch(e.target.value)}
                    placeholder={isEn ? 'Filter destination / gateway...' : 'فیلتر مقصد یا گیت‌وی...'}
                    className={`ps-8 pe-3 py-1.5 rounded-lg border text-xs outline-none w-52 ${inputCls}`}
                  />
                </div>
              </div>

              {/* Guided Simple Route Writer Form */}
              <form
                onSubmit={handleAddStaticRoute}
                className={`p-4 rounded-xl border space-y-3 ${subSurfaceBg}`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                  <div className="lg:col-span-3">
                    <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                      {isEn ? '1. Destination IP / Network' : '۱. آدرس IP یا شبکه مقصد'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={routeDest}
                      onChange={(e) => setRouteDest(e.target.value)}
                      placeholder="10.20.0.0"
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                      required
                    />
                  </div>

                  <div className="lg:col-span-3">
                    <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                      {isEn ? '2. Subnet Scope (Mask)' : '۲. محدوده / ساب‌نت مسک'}
                    </label>
                    <select
                      value={routeMask}
                      onChange={(e) => setRouteMask(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                    >
                      <option value="255.255.255.0">/24 (255.255.255.0) — {isEn ? 'Standard Subnet' : 'رنج عادی'}</option>
                      <option value="255.255.255.255">/32 (255.255.255.255) — {isEn ? 'Single IP Host' : 'فقط همین یک IP'}</option>
                      <option value="255.255.0.0">/16 (255.255.0.0) — {isEn ? 'Large Subnet' : 'رنج بزرگ'}</option>
                      <option value="255.255.255.128">/25 (255.255.255.128)</option>
                      <option value="255.255.254.0">/23 (255.255.254.0)</option>
                      <option value="255.0.0.0">/8 (255.0.0.0)</option>
                      <option value="0.0.0.0">/0 (0.0.0.0) — {isEn ? 'Default Route' : 'مسیر پیش‌فرض'}</option>
                    </select>
                  </div>

                  <div className="lg:col-span-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className={`text-[11px] font-medium ${textMuted}`}>
                        {isEn ? '3. Via Gateway (Next Hop)' : '۳. از طریق Gateway'}
                      </label>
                      {(networkData.adapters || [])
                        .flatMap((ad: any) => ad.defaultGateways || [])
                        .slice(0, 1)
                        .map((gw: string) => (
                          <button
                            key={gw}
                            type="button"
                            onClick={() => setRouteGateway(gw)}
                            className="text-[10px] font-mono text-sky-500 hover:underline cursor-pointer"
                          >
                            {isEn ? `Use ${gw}` : `استفاده از ${gw}`}
                          </button>
                        ))}
                    </div>
                    <input
                      type="text"
                      dir="ltr"
                      value={routeGateway}
                      onChange={(e) => setRouteGateway(e.target.value)}
                      placeholder="192.168.10.254"
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                      required
                    />
                  </div>

                  <div className="lg:col-span-3">
                    <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                      {isEn ? '4. Interface (Optional)' : '۴. کارت شبکه (اختیاری)'}
                    </label>
                    <select
                      value={routeIfIndex}
                      onChange={(e) => setRouteIfIndex(Number(e.target.value))}
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                    >
                      <option value={0}>{isEn ? 'Auto-select best NIC' : 'انتخاب خودکار توسط ویندوز'}</option>
                      {(networkData.adapters || [])
                        .filter((ad: any) => ad.interfaceIndex)
                        .map((ad: any) => (
                          <option key={ad.interfaceIndex} value={ad.interfaceIndex}>
                            #{ad.interfaceIndex} {ad.name} ({ad.ipv4Addresses?.[0] || ad.status})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={routePersistent}
                        onChange={(e) => setRoutePersistent(e.target.checked)}
                        className="rounded border-slate-400 text-teal-600 focus:ring-teal-500"
                      />
                      <span className={`font-medium ${textPrimary}`}>
                        {isEn ? 'Persistent (-p: survive reboot)' : 'ماندگار پس از ری‌استارت سیستم (-p)'}
                      </span>
                    </label>

                    <div className="flex items-center gap-1.5">
                      <span className={`text-[11px] ${textMuted}`}>{isEn ? 'Metric:' : 'اولویت (Metric):'}</span>
                      <input
                        type="number"
                        dir="ltr"
                        min={1}
                        max={9999}
                        value={routeMetric}
                        onChange={(e) => setRouteMetric(e.target.value)}
                        placeholder="Auto"
                        className={`w-20 px-2 py-1 rounded-md border text-[11px] font-mono outline-none ${inputCls}`}
                      />
                    </div>

                    <div
                      dir="ltr"
                      className={`px-2.5 py-1 rounded-md border font-mono text-[11px] ${
                        isLightMode ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-300'
                      }`}
                    >
                      route {routePersistent ? '-p ' : ''}add {routeDest.trim() || '<Dest>'} mask {routeMask}{' '}
                      {routeGateway.trim() || '<Gateway>'}
                      {routeMetric.trim() ? ` metric ${routeMetric.trim()}` : ''}
                      {routeIfIndex > 0 ? ` if ${routeIfIndex}` : ''}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!canExecuteActions || busyRouteKey === 'add'}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    {busyRouteKey === 'add' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>{isEn ? 'Add Route' : 'ثبت روت جدید'}</span>
                  </button>
                </div>
              </form>

              {/* Routing Table */}
              <div className="max-h-72 overflow-y-auto overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-xs border-collapse">
                  <thead className={`sticky top-0 ${isLightMode ? 'bg-slate-50 text-slate-600' : 'bg-slate-900 text-slate-400'}`}>
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2 px-3 text-start">{isEn ? 'Destination' : 'مقصد'}</th>
                      <th className="py-2 px-3 text-start">{isEn ? 'Netmask' : 'ساب‌نت مسک'}</th>
                      <th className="py-2 px-3 text-start">{isEn ? 'Gateway' : 'گیت‌وی'}</th>
                      <th className="py-2 px-3 text-start">{isEn ? 'Interface' : 'کارت شبکه'}</th>
                      <th className="py-2 px-3 text-start">{isEn ? 'Metric / Type' : 'متریک / نوع'}</th>
                      <th className="py-2 px-3 text-end">{isEn ? 'Delete' : 'حذف'}</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                    {filteredRoutes.map((rt: any) => (
                      <tr key={rt.id}>
                        <td className={`py-2 px-3 font-mono font-semibold ${textPrimary}`} dir="ltr">
                          {rt.destination}/{rt.prefixLength}
                          {rt.isDefault && (
                            <span className="ms-1.5 px-1.5 py-0.5 rounded text-[10px] border border-sky-500/40 bg-sky-500/10 text-sky-500">
                              Default
                            </span>
                          )}
                        </td>
                        <td className={`py-2 px-3 font-mono ${textMuted}`} dir="ltr">
                          {rt.netmask}
                        </td>
                        <td className={`py-2 px-3 font-mono ${textPrimary}`} dir="ltr">
                          {rt.gateway}
                        </td>
                        <td className={`py-2 px-3 ${textMuted}`}>
                          {rt.interfaceName} {rt.interfaceIndex > 0 ? `(#${rt.interfaceIndex})` : ''}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px]">
                          <span className={textMuted}>{rt.metric}</span>
                          {rt.persistent && (
                            <span className="ms-1.5 px-1.5 py-0.5 rounded border border-teal-500/40 bg-teal-500/10 text-teal-500 text-[10px]">
                              {isEn ? 'Persistent' : 'دائمی'}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-end">
                          {rt.isSystemReserved ? (
                            <span className={`text-[11px] ${textMuted}`}>{isEn ? 'System' : 'سیستمی'}</span>
                          ) : confirmDeleteRouteId === rt.id ? (
                            <span className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                disabled={busyRouteKey === rt.id}
                                onClick={() => handleDeleteStaticRoute(rt)}
                                className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold cursor-pointer"
                              >
                                {isEn ? 'Confirm' : 'تایید'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRouteId(null)}
                                className={`px-2 py-0.5 rounded border text-[11px] cursor-pointer ${
                                  isLightMode ? 'bg-white border-slate-300 text-slate-600' : 'bg-slate-800 border-slate-700 text-slate-300'
                                }`}
                              >
                                {isEn ? 'Cancel' : 'لغو'}
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={!canExecuteActions || busyRouteKey !== null}
                              onClick={() => setConfirmDeleteRouteId(rt.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-[11px] font-semibold cursor-pointer disabled:opacity-40"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>{isEn ? 'Delete' : 'حذف'}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Endpoint VPN Connection Provisioning & Management */}
          {networkData && (
            <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-sky-500" />
                    <h3 className={`text-sm font-bold ${textPrimary}`}>
                      {isEn
                        ? 'Endpoint VPN Connections Manager'
                        : 'ساخت و مدیریت کانکشن‌های VPN روی سیستم کاربر'}
                    </h3>
                  </div>
                  <p className={`text-xs mt-0.5 ${textMuted}`}>
                    {isEn
                      ? 'Provision L2TP/IPsec, IKEv2, SSTP, or PPTP VPN profiles directly on the workstation — defaulted to automatic Windows/Domain user login SSO credentials.'
                      : 'تعریف و مدیریت پروفایل‌های VPN (از جمله L2TP/IPsec، IKEv2، SSTP و PPTP) روی ویندوز کاربر؛ در حالت پیش‌فرض کانکشن با نام کاربری و رمز خود کاربر سیستم احراز هویت می‌شود.'}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-500 text-xs font-semibold">
                  <Shield className="w-3.5 h-3.5" />
                  <span>
                    {Array.isArray(networkData.vpnConnections) ? networkData.vpnConnections.length : 0}{' '}
                    {isEn ? 'VPN Profiles' : 'کانکشن VPN'}
                  </span>
                </span>
              </div>

              {/* Create New VPN Profile Form */}
              <form
                onSubmit={handleCreateVpn}
                className={`p-4 rounded-xl border space-y-4 ${subSurfaceBg}`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                  <div className="lg:col-span-3">
                    <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                      {isEn ? 'VPN Connection Name' : 'نام کانکشن VPN'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={vpnName}
                      onChange={(e) => setVpnName(e.target.value)}
                      placeholder="Corp-VPN"
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                      required
                    />
                  </div>

                  <div className="lg:col-span-3">
                    <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                      {isEn ? 'VPN Server IP / Hostname' : 'آدرس IP یا هاست‌نیم سرور VPN'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={vpnServer}
                      onChange={(e) => setVpnServer(e.target.value)}
                      placeholder="vpn.company.com"
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                      required
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                      {isEn ? 'Protocol / Type' : 'پروتکل / نوع VPN'}
                    </label>
                    <select
                      value={vpnTunnelType}
                      onChange={(e) => setVpnTunnelType(e.target.value as any)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                    >
                      <option value="L2tp">L2TP / IPsec</option>
                      <option value="Ikev2">IKEv2</option>
                      <option value="Sstp">SSTP (HTTPS 443)</option>
                      <option value="Pptp">PPTP</option>
                      <option value="Automatic">Automatic</option>
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                      {isEn ? 'Profile Scope' : 'محدوده کاربر'}
                    </label>
                    <select
                      value={vpnAllUsers ? 'all' : 'user'}
                      onChange={(e) => setVpnAllUsers(e.target.value === 'all')}
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                    >
                      <option value="all">{isEn ? 'All Users on PC' : 'همه کاربران سیستم'}</option>
                      <option value="user">{isEn ? 'Active Logged-In User' : 'فقط کاربر فعال فعلی'}</option>
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                      {isEn ? 'DNS Suffix (Optional)' : 'پسوند DNS (اختیاری)'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={vpnDnsSuffix}
                      onChange={(e) => setVpnDnsSuffix(e.target.value)}
                      placeholder="corp.local"
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                    />
                  </div>
                </div>

                {(vpnTunnelType === 'L2tp' || vpnTunnelType === 'Automatic') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
                    <div className="lg:col-span-4">
                      <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                        {isEn ? 'L2TP Pre-Shared Key / PSK (Optional)' : 'کلید مشترک L2TP Pre-Shared Key (اختیاری)'}
                      </label>
                      <input
                        type="password"
                        dir="ltr"
                        autoComplete="new-password"
                        value={vpnL2tpPsk}
                        onChange={(e) => setVpnL2tpPsk(e.target.value)}
                        placeholder="••••••••"
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                      />
                    </div>
                  </div>
                )}

                {/* VPN Authentication Mode Selector + Always-Visible Username & Password */}
                <div
                  className={`p-3.5 rounded-xl border space-y-3 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`text-xs font-bold ${textPrimary}`}>
                      {isEn ? 'VPN User Credentials Mode' : 'نحوه احراز هویت یوزر و پسورد کانکشن VPN'}
                    </span>
                    <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={vpnSplitTunnel}
                        onChange={(e) => setVpnSplitTunnel(e.target.checked)}
                        className="rounded border-slate-400 text-sky-600 focus:ring-sky-500"
                      />
                      <span className={`font-medium ${textPrimary}`}>
                        {isEn ? 'Split Tunneling (Keep Local Internet)' : 'Split Tunneling (حفظ اینترنت محلی)'}
                      </span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setVpnUseWinCred(true)}
                      className={`p-3 rounded-xl border text-start transition cursor-pointer ${
                        vpnUseWinCred
                          ? 'border-emerald-500/50 bg-emerald-500/10'
                          : isLightMode
                          ? 'border-slate-200 hover:border-slate-300 bg-slate-50'
                          : 'border-slate-800 hover:border-slate-700 bg-slate-950/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-bold ${textPrimary}`}>
                          {isEn
                            ? "Use Logged-In User's Windows Credentials (SSO)"
                            : 'استفاده از یوزر و پسورد خود کاربرِ لاگین‌شده در سیستم'}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 border ${
                            vpnUseWinCred
                              ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40'
                              : isLightMode
                              ? 'bg-slate-200 text-slate-600 border-slate-300'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {isEn ? 'Default · SSO' : 'پیش‌فرض · SSO'}
                        </span>
                      </div>
                      <p className={`text-[11px] mt-1 ${textMuted}`}>
                        {isEn
                          ? `Automatically authenticates with the active Windows/Domain user${
                              healthData?.loggedInUser ? ` (${healthData.loggedInUser})` : ''
                            }.`
                          : `بدون نیاز به وارد کردن رمز مجدد، با اکانت خود کاربر لاگین‌شده${
                              healthData?.loggedInUser ? ` (${healthData.loggedInUser})` : ''
                            } متصل می‌شود.`}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setVpnUseWinCred(false)}
                      className={`p-3 rounded-xl border text-start transition cursor-pointer ${
                        !vpnUseWinCred
                          ? 'border-sky-500/50 bg-sky-500/10'
                          : isLightMode
                          ? 'border-slate-200 hover:border-slate-300 bg-slate-50'
                          : 'border-slate-800 hover:border-slate-700 bg-slate-950/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-bold ${textPrimary}`}>
                          {isEn
                            ? 'Enter Custom VPN Username & Password'
                            : 'وارد کردن یوزرنیم و پسورد دلخواه برای VPN'}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 border ${
                            !vpnUseWinCred
                              ? 'bg-sky-500/20 text-sky-500 border-sky-500/40'
                              : isLightMode
                              ? 'bg-slate-200 text-slate-600 border-slate-300'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {isEn ? 'Custom' : 'سفارشی'}
                        </span>
                      </div>
                      <p className={`text-[11px] mt-1 ${textMuted}`}>
                        {isEn
                          ? 'Specify dedicated VPN credentials below (or leave empty to prompt user when dialing).'
                          : 'نام کاربری و رمز عبور اختصاصی VPN را در کادرهای زیر وارد کنید (یا برای پرسش هنگام اتصال خالی بگذارید).'}
                      </p>
                    </button>
                  </div>

                  {/* Always-Visible VPN Username & Password Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                        {isEn ? 'VPN Username' : 'نام کاربری (Username) VPN'}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        disabled={vpnUseWinCred}
                        value={vpnUseWinCred ? '' : vpnCustomUser}
                        onChange={(e) => setVpnCustomUser(e.target.value)}
                        placeholder={
                          vpnUseWinCred
                            ? healthData?.loggedInUser
                              ? `${healthData.loggedInUser} (${isEn ? 'Auto Windows Login' : 'خودکار از کاربر فعلی'})`
                              : isEn
                              ? 'Auto: Logged-in Windows User'
                              : 'خودکار: نام کاربری ویندوز فرد لاگین‌شده'
                            : 'DOMAIN\\vpnuser'
                        }
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none disabled:opacity-60 disabled:cursor-not-allowed ${inputCls}`}
                      />
                    </div>
                    <div>
                      <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                        {isEn ? 'VPN Password' : 'رمز عبور (Password) VPN'}
                      </label>
                      <div className="relative">
                        <input
                          type={showVpnCustomPass && !vpnUseWinCred ? 'text' : 'password'}
                          dir="ltr"
                          autoComplete="new-password"
                          disabled={vpnUseWinCred}
                          value={vpnUseWinCred ? '' : vpnCustomPass}
                          onChange={(e) => setVpnCustomPass(e.target.value)}
                          placeholder={
                            vpnUseWinCred
                              ? isEn
                                ? 'Auto: Active Windows Session Password'
                                : 'خودکار: رمز عبور اکانت فعلی ویندوز'
                              : '••••••••'
                          }
                          className={`w-full px-2.5 py-1.5 pe-8 rounded-lg border text-xs font-mono outline-none disabled:opacity-60 disabled:cursor-not-allowed ${inputCls}`}
                        />
                        {!vpnUseWinCred && (
                          <button
                            type="button"
                            onClick={() => setShowVpnCustomPass((p) => !p)}
                            className={`absolute top-1/2 -translate-y-1/2 end-2 p-0.5 ${textMuted} hover:text-sky-500 cursor-pointer`}
                            aria-label={showVpnCustomPass ? 'Hide VPN password' : 'Show VPN password'}
                          >
                            {showVpnCustomPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={!canExecuteActions || busyVpnKey !== null}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    {busyVpnKey === 'create' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>{isEn ? 'Create / Update VPN Connection' : 'ساخت / بروزرسانی کانکشن VPN'}</span>
                  </button>
                </div>
              </form>

              {/* Existing VPN Connections Table */}
              {!Array.isArray(networkData.vpnConnections) || networkData.vpnConnections.length === 0 ? (
                <div className={`p-5 rounded-xl border text-center text-xs ${subSurfaceBg} ${textMuted}`}>
                  {isEn
                    ? 'No VPN connections configured on this workstation yet.'
                    : 'هنوز هیچ کانکشن VPN روی این سیستم تعریف نشده است.'}
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full min-w-[680px] text-xs border-collapse">
                    <thead className={`sticky top-0 z-10 ${isLightMode ? 'bg-slate-50 text-slate-600' : 'bg-slate-900 text-slate-400'}`}>
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        <th className="py-2.5 px-3 text-start">{isEn ? 'VPN Name' : 'نام کانکشن'}</th>
                        <th className="py-2.5 px-3 text-start">{isEn ? 'Server' : 'آدرس سرور'}</th>
                        <th className="py-2.5 px-3 text-start">{isEn ? 'Protocol & Auth' : 'پروتکل و احراز هویت'}</th>
                        <th className="py-2.5 px-3 text-start">{isEn ? 'Scope & Split' : 'محدوده و Split'}</th>
                        <th className="py-2.5 px-3 text-start">{isEn ? 'Status' : 'وضعیت'}</th>
                        <th className="py-2.5 px-3 text-end">{isEn ? 'Actions' : 'عملیات'}</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                      {networkData.vpnConnections.map((vpn: any) => {
                        const isConn = String(vpn.connectionStatus || '').toLowerCase() === 'connected';
                        return (
                          <tr key={vpn.id || vpn.name}>
                            <td className={`py-2.5 px-3 font-semibold ${textPrimary}`}>{vpn.name}</td>
                            <td className={`py-2.5 px-3 font-mono ${textPrimary}`} dir="ltr">
                              {vpn.serverAddress || '—'}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="inline-flex items-center flex-wrap gap-1.5">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono border border-sky-500/30 bg-sky-500/10 text-sky-500">
                                  {vpn.tunnelType || 'Auto'}
                                </span>
                                {vpn.useWinlogonCredential ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-emerald-500/40 bg-emerald-500/10 text-emerald-500 whitespace-nowrap">
                                    <UserCheck className="w-3 h-3" />
                                    <span>{isEn ? 'Windows SSO' : 'یوزر ویندوز'}</span>
                                  </span>
                                ) : (
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] border ${isLightMode ? 'border-slate-300 text-slate-600' : 'border-slate-700 text-slate-400'}`}>
                                    {vpn.authenticationMethod || (isEn ? 'Prompt/Custom' : 'یوزر سفارشی')}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="inline-flex items-center flex-wrap gap-1.5">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] border ${isLightMode ? 'border-slate-300 text-slate-600' : 'border-slate-700 text-slate-400'}`}>
                                  {vpn.allUserConnection ? (isEn ? 'All Users' : 'همه کاربران') : isEn ? 'Active User' : 'کاربر فعال'}
                                </span>
                                {vpn.splitTunneling && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] border border-teal-500/30 bg-teal-500/10 text-teal-500">
                                    Split
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                                  isConn
                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                                    : 'border-slate-500/30 bg-slate-500/10 text-slate-400'
                                }`}
                              >
                                {isConn ? (isEn ? 'Connected' : 'متصل') : isEn ? 'Disconnected' : 'قطع'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-end whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-2">
                                {isConn ? (
                                  <button
                                    type="button"
                                    disabled={!canExecuteActions || busyVpnKey !== null}
                                    onClick={() => handleVpnRowAction('disconnect', vpn.name)}
                                    className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-[11px] font-semibold cursor-pointer disabled:opacity-40"
                                  >
                                    {busyVpnKey === `disconnect:${vpn.name}` ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <PowerOff className="w-3 h-3" />
                                    )}
                                    <span>{isEn ? 'Disconnect' : 'قطع'}</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={!canExecuteActions || busyVpnKey !== null}
                                    onClick={() => handleVpnRowAction('connect', vpn.name)}
                                    className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 text-[11px] font-semibold cursor-pointer disabled:opacity-40"
                                  >
                                    {busyVpnKey === `connect:${vpn.name}` ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <PlugZap className="w-3 h-3" />
                                    )}
                                    <span>{isEn ? 'Connect' : 'اتصال'}</span>
                                  </button>
                                )}

                                {confirmDeleteVpnName === vpn.name ? (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={busyVpnKey !== null}
                                      onClick={() => handleVpnRowAction('delete', vpn.name)}
                                      className="h-7 px-2 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold cursor-pointer"
                                    >
                                      {isEn ? 'Confirm' : 'تایید'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteVpnName(null)}
                                      className={`h-7 px-2 rounded-md border text-[11px] cursor-pointer ${
                                        isLightMode ? 'bg-white border-slate-300 text-slate-600' : 'bg-slate-800 border-slate-700 text-slate-300'
                                      }`}
                                    >
                                      {isEn ? 'Cancel' : 'لغو'}
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={!canExecuteActions || busyVpnKey !== null}
                                    onClick={() => setConfirmDeleteVpnName(vpn.name)}
                                    title={isEn ? 'Delete VPN connection' : 'حذف کانکشن VPN'}
                                    className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 cursor-pointer disabled:opacity-40"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: PRINTERS & PRINT SPOOLER REPAIR (Strictly Scoped to Spooler) */}
      {/* =================================================================== */}
      {activeSubTab === 'printers' && (
        <div className="space-y-6">
          {printerError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 flex items-start gap-3 text-xs text-rose-500">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className={isLightMode ? 'text-rose-800' : 'text-rose-200'}>{printerError}</span>
            </div>
          )}

          {spoolerActionResult && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-1 text-xs">
              <div className="flex items-center gap-2 font-bold text-emerald-500">
                <CheckCircle2 className="w-4 h-4" />
                <span>{isEn ? spoolerActionResult.message : spoolerActionResult.messageFa}</span>
              </div>
              {spoolerActionResult.rawOutput && (
                <div className={`font-mono text-[11px] ${textMuted}`}>{spoolerActionResult.rawOutput}</div>
              )}
            </div>
          )}

          {/* Spooler Control Bar */}
          <div className={`rounded-xl border p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 ${surfaceBg}`}>
            <div>
              <h2 className={`text-sm font-bold ${textPrimary}`}>
                {isEn ? 'Print Spooler Service & Queue Repair' : 'مدیریت سرویس Print Spooler و صف پرینت'}
              </h2>
              <p className={`text-xs ${textMuted}`}>
                {isEn
                  ? 'Strictly confined to the Print Spooler service and C:\\Windows\\System32\\spool\\PRINTERS queue files.'
                  : 'عملیات صرفاً محدود به سرویس Print Spooler و پاک‌سازی فایل‌های صف گیرکرده پرینت (بدون دسترسی به سایر سرویس‌ها).'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleInspectPrinters}
                disabled={!canRunDiagnostics || loadingPrinters}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
              >
                {loadingPrinters ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>{isEn ? 'Inspect Printers & Queue' : 'بررسی پرینترها و صف'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  undockModal('modal-helpdesk-print-server');
                  setIsPrintServerModalOpen(true);
                }}
                disabled={!canRunDiagnostics}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
              >
                <PlugZap className="w-3.5 h-3.5" />
                <span>{isEn ? 'Connect Print Server' : 'نصب از پرینت سرور'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSpoolerAction('spooler_restart')}
                disabled={!canExecuteActions || runningSpoolerAction !== null}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition disabled:opacity-50 cursor-pointer ${
                  isLightMode
                    ? 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700'
                }`}
              >
                {runningSpoolerAction === 'spooler_restart' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : !canExecuteActions ? (
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5 text-teal-500" />
                )}
                <span>{isEn ? 'Restart Print Spooler' : 'ری‌استارت Print Spooler'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSpoolerAction('spooler_clear_queue')}
                disabled={!canExecuteActions || runningSpoolerAction !== null}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
              >
                {runningSpoolerAction === 'spooler_clear_queue' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : !canExecuteActions ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{isEn ? 'Clear Stuck Queue & Restart' : 'پاک‌سازی صف گیرکرده و ری‌استارت'}</span>
              </button>
            </div>
          </div>

          {!printerData && !loadingPrinters && (
            <div className={`rounded-xl border p-10 text-center space-y-3 ${surfaceBg}`}>
              <Printer className="w-10 h-10 mx-auto text-teal-500 opacity-80" />
              <div className={`text-sm font-bold ${textPrimary}`}>
                {isEn ? 'No Printer Data Loaded Yet' : 'اطلاعات پرینتر هنوز دریافت نشده است'}
              </div>
              <p className={`text-xs max-w-lg mx-auto ${textMuted}`}>
                {isEn
                  ? 'Enter a workstation IP & credentials above and click "Inspect Printers & Queue" to see live Print Spooler health, installed printers, and stuck documents.'
                  : 'پس از وارد کردن IP و مشخصات ورود در بالا، روی «بررسی پرینترها و صف» کلیک کنید تا وضعیت سرویس Spooler، پرینترهای نصب‌شده و اسناد گیرکرده در صف نمایش داده شود.'}
              </p>
            </div>
          )}

          {printerData && (
            <div className="space-y-6">
              {/* Spooler Service Status Strip */}
              <div className={`rounded-xl border p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs ${surfaceBg}`}>
                <div>
                  <div className={textMuted}>{isEn ? 'Service' : 'نام سرویس'}</div>
                  <div className={`mt-1 font-bold font-mono ${textPrimary}`}>
                    {printerData.spooler?.displayName} ({printerData.spooler?.serviceName})
                  </div>
                </div>
                <div>
                  <div className={textMuted}>{isEn ? 'State' : 'وضعیت اجرا'}</div>
                  <div
                    className={`mt-1 font-bold ${
                      String(printerData.spooler?.status).toLowerCase() === 'running' ||
                      String(printerData.spooler?.status).toLowerCase() === 'active'
                        ? 'text-emerald-500'
                        : 'text-rose-500'
                    }`}
                  >
                    {printerData.spooler?.status}
                  </div>
                </div>
                <div>
                  <div className={textMuted}>{isEn ? 'Startup / PID' : 'نوع اجرا / PID'}</div>
                  <div className={`mt-1 font-mono tabular-nums ${textPrimary}`}>
                    {printerData.spooler?.startType} {printerData.spooler?.pid ? `· PID ${printerData.spooler.pid}` : ''}
                  </div>
                </div>
                <div>
                  <div className={textMuted}>{isEn ? 'Printers / Active Jobs' : 'تعداد پرینتر / صف فعلی'}</div>
                  <div className={`mt-1 font-bold font-mono tabular-nums ${textPrimary}`}>
                    {(printerData.printers || []).length} / {(printerData.jobs || []).length}
                  </div>
                </div>
              </div>

              {/* Installed Printers Table */}
              <div className={`rounded-xl border p-4 sm:p-5 space-y-3 ${surfaceBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn ? 'Installed Printers' : 'پرینترهای نصب‌شده روی سیستم کاربر'}
                  </h3>
                  {printerData.loggedInUser && (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                        isLightMode
                          ? 'bg-sky-50 text-sky-800 border-sky-200'
                          : 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                      }`}
                    >
                      <UserCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {isEn ? 'Active User Profile:' : 'پروفایل کاربر فعال:'}{' '}
                        <strong dir="ltr" className="font-mono">{printerData.loggedInUser}</strong>
                      </span>
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className={`border-b text-start ${isLightMode ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
                        <th className="py-2 px-2.5 text-start">{isEn ? 'Printer Name' : 'نام پرینتر'}</th>
                        <th className="py-2 px-2.5 text-start">{isEn ? 'Scope' : 'محدوده'}</th>
                        <th className="py-2 px-2.5 text-start">{isEn ? 'Port / IP' : 'پورت / IP'}</th>
                        <th className="py-2 px-2.5 text-start">{isEn ? 'Driver' : 'درایور'}</th>
                        <th className="py-2 px-2.5 text-start">{isEn ? 'Status' : 'وضعیت'}</th>
                        <th className="py-2 px-2.5 text-end">{isEn ? 'Jobs' : 'تعداد کار'}</th>
                        <th className="py-2 px-2.5 text-center">{isEn ? 'Actions' : 'عملیات'}</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                      {(printerData.printers || []).map((pr: any, idx: number) => {
                        const isBusy = printerRowActionBusy === pr.name;
                        return (
                          <tr key={`${pr.name}-${idx}`}>
                            <td className={`py-2.5 px-2.5 font-semibold ${textPrimary}`}>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span dir="ltr">{pr.name}</span>
                                {pr.isDefault && (
                                  <span
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                      isLightMode
                                        ? 'bg-sky-50 text-sky-700 border-sky-200'
                                        : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                                    }`}
                                  >
                                    <Star className="w-2.5 h-2.5 fill-current" />
                                    {isEn ? 'Default' : 'پیش‌فرض'}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className={`py-2.5 px-2.5 ${textMuted}`}>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${
                                  pr.scope === 'user'
                                    ? isLightMode
                                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                      : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                                    : isLightMode
                                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                                    : 'bg-slate-800 text-slate-300 border-slate-700'
                                }`}
                              >
                                {pr.scope === 'user'
                                  ? isEn
                                    ? 'User Profile'
                                    : 'پروفایل کاربر'
                                  : isEn
                                  ? 'All Users / PC'
                                  : 'سیستمی / همه کاربران'}
                              </span>
                            </td>
                            <td dir="ltr" className={`py-2.5 px-2.5 font-mono ${textMuted}`}>{pr.portName || '-'}</td>
                            <td className={`py-2.5 px-2.5 ${textMuted}`}>{pr.driverName || '-'}</td>
                            <td
                              className={`py-2.5 px-2.5 font-semibold ${
                                String(pr.status).toLowerCase().includes('offline') ||
                                String(pr.status).toLowerCase().includes('stop')
                                  ? 'text-rose-500'
                                  : 'text-emerald-500'
                              }`}
                            >
                              {pr.status}
                            </td>
                            <td className={`py-2.5 px-2.5 text-end font-mono tabular-nums ${textPrimary}`}>
                              {pr.jobCount}
                            </td>
                            <td className="py-2.5 px-2.5 text-center">
                              {canExecuteActions ? (
                                <button
                                  type="button"
                                  disabled={isBusy || printerRowActionBusy !== null}
                                  onClick={(e) => handleTogglePrinterMenu(e, pr)}
                                  className={`p-1.5 rounded-lg border transition cursor-pointer disabled:opacity-50 ${
                                    printerMenuAnchor?.printer?.name === pr.name
                                      ? 'bg-sky-600 text-white border-sky-500'
                                      : isLightMode
                                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                  }`}
                                  title={isEn ? 'Printer Actions' : 'عملیات پرینتر'}
                                >
                                  {isBusy ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              ) : (
                                <span className={`text-[11px] ${textMuted}`}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {(printerData.printers || []).length === 0 && (
                        <tr>
                          <td colSpan={7} className={`py-6 text-center ${textMuted}`}>
                            {isEn ? 'No printers installed on this workstation.' : 'هیچ پرینتری روی این سیستم نصب نشده است.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Active Print Queue Table */}
              <div className={`rounded-xl border p-4 sm:p-5 space-y-3 ${surfaceBg}`}>
                <h3 className={`text-sm font-bold ${textPrimary}`}>
                  {isEn ? 'Live Print Queue Jobs' : 'صف لحظه‌ای اسناد در انتظار پرینت'}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className={`border-b text-start ${isLightMode ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
                        <th className="py-2 px-2.5 text-start">ID</th>
                        <th className="py-2 px-2.5 text-start">{isEn ? 'Printer' : 'پرینتر'}</th>
                        <th className="py-2 px-2.5 text-start">{isEn ? 'Document' : 'سند'}</th>
                        <th className="py-2 px-2.5 text-start">{isEn ? 'Owner' : 'کاربر'}</th>
                        <th className="py-2 px-2.5 text-start">{isEn ? 'Status' : 'وضعیت'}</th>
                        <th className="py-2 px-2.5 text-end">{isEn ? 'Size (KB)' : 'حجم (KB)'}</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                      {(printerData.jobs || []).map((job: any) => (
                        <tr key={`${job.printerName}-${job.id}`}>
                          <td className={`py-2.5 px-2.5 font-mono tabular-nums ${textMuted}`}>{job.id}</td>
                          <td className={`py-2.5 px-2.5 font-semibold ${textPrimary}`}>{job.printerName}</td>
                          <td className={`py-2.5 px-2.5 ${textPrimary}`}>{job.documentName}</td>
                          <td className={`py-2.5 px-2.5 font-mono ${textMuted}`}>{job.owner}</td>
                          <td className="py-2.5 px-2.5 text-amber-500 font-semibold">{job.status}</td>
                          <td className={`py-2.5 px-2.5 text-end font-mono tabular-nums ${textMuted}`}>
                            {job.sizeKb}
                          </td>
                        </tr>
                      ))}
                      {(printerData.jobs || []).length === 0 && (
                        <tr>
                          <td colSpan={6} className={`py-6 text-center ${textMuted}`}>
                            {isEn ? 'Print queue is clean (0 stuck jobs).' : 'صف پرینت کاملاً خالی است (۰ سند گیرکرده).'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: HUMAN-READABLE EVENT VIEWER (MODULE 4 — READ-ONLY)           */}
      {/* =================================================================== */}
      {activeSubTab === 'events' && (
        <div className="space-y-6">
          {eventError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 flex items-start gap-3 text-xs text-rose-500">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className={isLightMode ? 'text-rose-800' : 'text-rose-200'}>{eventError}</span>
            </div>
          )}

          {/* Event Viewer Filter & Control Bar */}
          <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn
                      ? 'Event Viewer with Plain-Language Human Diagnostics'
                      : 'بررسی خطاهای Event Viewer با توضیح انسانی و دقیق علت خطا'}
                  </h2>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    fieldName={isEn ? 'Human-Readable Event Viewer' : 'Event Viewer با تحلیل انسانی'}
                    whatIsIt={
                      isEn
                        ? 'Collects recent Windows System/Application (or Linux journald) Critical, Error, and Warning events and displays a plain-language reason and recommended fix right beside every Event ID.'
                        : 'آخرین خطاها و هشدارهای بحرانی ویندوز (System/Application) یا لینوکس را خوانده و دقیقاً کنار هر کد خطا به زبان ساده و انسانی توضیح می‌دهد چه اتفاقی افتاده و راهکار چیست.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Eliminates guesswork and slow Event ID lookups during live support calls without needing to take over the user’s desktop.'
                        : 'بدون نیاز به گرفتن صفحه کاربر یا جستجوی دستی کد خطاهای مبهم ویندوز، علت اصلی کرش، BSOD، قطعی شبکه یا خطای دیسک را در چند ثانیه مشخص می‌کند.'
                    }
                    example={
                      isEn
                        ? 'Event ID 41 → Unexpected Power Loss / BSOD · Event ID 1014 → DNS Timeout · Event ID 7 → Disk Bad Sector'
                        : 'مثال: کد 41 ← خاموشی ناگهانی/BSOD · کد 1014 ← پاسخ ندادن DNS · کد 7 ← بدسکتور هارد دیسک'
                    }
                  />
                </div>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {isEn
                    ? 'Read-only live Event ID decoder — every error code is paired with what happened, likely cause, and next step.'
                    : 'فقط‌خواندنی و زنده — کنار هر کد خطا دقیقاً مشخص می‌شود دلیل خطا چیست، علت احتمالی کدام است و کارشناس چه اقدامی انجام دهد.'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleInspectEvents}
                disabled={!canViewEventViewer || loadingEvents}
                title={
                  !canViewEventViewer
                    ? isEn
                      ? 'Requires canViewHelpdeskEventViewer permission'
                      : 'نیازمند مجوز canViewHelpdeskEventViewer در Access Policy'
                    : undefined
                }
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
              >
                {loadingEvents ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : !canViewEventViewer ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>{isEn ? 'Collect & Decode Events' : 'دریافت و تحلیل خطاها'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
              <div className="lg:col-span-3">
                <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                  {isEn ? 'Event Channel' : 'کانال لاگ'}
                </label>
                <select
                  value={eventChannel}
                  onChange={(e) => setEventChannel(e.target.value as any)}
                  className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="All">{isEn ? 'System + Application' : 'هر دو (System + Application)'}</option>
                  <option value="System">{isEn ? 'System Only' : 'فقط System'}</option>
                  <option value="Application">{isEn ? 'Application Only' : 'فقط Application'}</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                  {isEn ? 'Time Window' : 'بازه زمانی'}
                </label>
                <select
                  value={eventHoursBack}
                  onChange={(e) => setEventHoursBack(Number(e.target.value))}
                  className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value={24}>{isEn ? 'Last 24 Hours' : '۲۴ ساعت اخیر'}</option>
                  <option value={48}>{isEn ? 'Last 48 Hours' : '۴۸ ساعت اخیر'}</option>
                  <option value={72}>{isEn ? 'Last 3 Days' : '۳ روز اخیر'}</option>
                  <option value={168}>{isEn ? 'Last 7 Days' : '۷ روز اخیر'}</option>
                </select>
              </div>

              <div className="lg:col-span-3">
                <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                  {isEn ? 'Collection Scope' : 'سطح دریافت'}
                </label>
                <select
                  value={eventSeverityMode}
                  onChange={(e) => setEventSeverityMode(e.target.value as any)}
                  className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="all">{isEn ? 'Critical + Error + Warning' : 'بحرانی + خطا + هشدار'}</option>
                  <option value="critical_error">{isEn ? 'Critical & Error Only' : 'فقط بحرانی و خطا'}</option>
                </select>
              </div>

              <div className="lg:col-span-4">
                <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                  {isEn ? 'Quick Search (Code / Cause / Source)' : 'جستجو (کد خطا / دلیل / منبع)'}
                </label>
                <div className="relative">
                  <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-2.5 ${textMuted}`} />
                  <input
                    type="text"
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                    placeholder={isEn ? 'e.g. 41, DNS, Disk, BSOD...' : 'مثلاً 41، دیسک، DNS، پرینتر...'}
                    className={`w-full ps-8 pe-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                  />
                </div>
              </div>
            </div>
          </div>

          {!eventData && !loadingEvents && (
            <div className={`rounded-xl border p-10 text-center space-y-3 ${surfaceBg}`}>
              <FileWarning className="w-10 h-10 mx-auto text-amber-500 opacity-85" />
              <div className={`text-sm font-bold ${textPrimary}`}>
                {isEn ? 'Ready to Decode Workstation Event Logs' : 'آماده خواندن و ترجمه انسانی خطاهای سیستم کاربر'}
              </div>
              <p className={`text-xs max-w-xl mx-auto ${textMuted}`}>
                {isEn
                  ? 'Enter the target workstation IP & credentials above and click "Collect & Decode Events". Every Windows Event ID will be shown right beside its human-language explanation, root cause, and recommended HelpDesk fix.'
                  : 'IP و مشخصات ورود موقت را در بالا وارد کرده و روی «دریافت و تحلیل خطاها» کلیک کنید. کنار هر کد خطای ویندوز، توضیح شفاف و فارسی علت خطا و اقدام پیشنهادی نمایش داده می‌شود.'}
              </p>
            </div>
          )}

          {loadingEvents && (
            <div className={`rounded-xl border p-10 text-center space-y-3 ${surfaceBg}`}>
              <Loader2 className="w-8 h-8 mx-auto text-sky-500 animate-spin" />
              <div className={`text-sm font-semibold ${textPrimary}`}>
                {isEn
                  ? `Reading Event Viewer logs from ${targetIp} and decoding Event IDs...`
                  : `در حال خواندن لاگ‌های Event Viewer از ${targetIp} و تحلیل انسانی کدهای خطا...`}
              </div>
            </div>
          )}

          {eventData && !loadingEvents && (
            <div className="space-y-5">
              {/* Event Summary KPI Strip + Interactive Severity Filter */}
              <div className={`rounded-xl border p-4 grid grid-cols-2 lg:grid-cols-5 gap-4 text-xs ${surfaceBg}`}>
                <button
                  type="button"
                  onClick={() => setEventLevelFilter('all')}
                  className={`text-start p-2.5 rounded-lg border transition cursor-pointer ${
                    eventLevelFilter === 'all'
                      ? 'border-sky-500 bg-sky-500/10'
                      : subSurfaceBg
                  }`}
                >
                  <div className={textMuted}>{isEn ? 'Total Events' : 'کل رویدادها'}</div>
                  <div className={`mt-1 text-lg font-bold font-mono tabular-nums ${textPrimary}`}>
                    {eventData.summary?.total ?? 0}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setEventLevelFilter((v) => (v === 'critical' ? 'all' : 'critical'))}
                  className={`text-start p-2.5 rounded-lg border transition cursor-pointer ${
                    eventLevelFilter === 'critical'
                      ? 'border-rose-500 bg-rose-500/10'
                      : subSurfaceBg
                  }`}
                >
                  <div className={textMuted}>{isEn ? 'Critical' : 'بحرانی (Critical)'}</div>
                  <div className="mt-1 text-lg font-bold font-mono tabular-nums text-rose-500">
                    {eventData.summary?.critical ?? 0}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setEventLevelFilter((v) => (v === 'error' ? 'all' : 'error'))}
                  className={`text-start p-2.5 rounded-lg border transition cursor-pointer ${
                    eventLevelFilter === 'error'
                      ? 'border-orange-500 bg-orange-500/10'
                      : subSurfaceBg
                  }`}
                >
                  <div className={textMuted}>{isEn ? 'Errors' : 'خطا (Error)'}</div>
                  <div className="mt-1 text-lg font-bold font-mono tabular-nums text-orange-500">
                    {eventData.summary?.error ?? 0}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setEventLevelFilter((v) => (v === 'warning' ? 'all' : 'warning'))}
                  className={`text-start p-2.5 rounded-lg border transition cursor-pointer ${
                    eventLevelFilter === 'warning'
                      ? 'border-amber-500 bg-amber-500/10'
                      : subSurfaceBg
                  }`}
                >
                  <div className={textMuted}>{isEn ? 'Warnings' : 'هشدار (Warning)'}</div>
                  <div className="mt-1 text-lg font-bold font-mono tabular-nums text-amber-500">
                    {eventData.summary?.warning ?? 0}
                  </div>
                </button>

                <div className={`col-span-2 lg:col-span-1 p-2.5 rounded-lg border ${subSurfaceBg}`}>
                  <div className={textMuted}>{isEn ? 'Most Frequent Issue' : 'پرتکرارترین خطا'}</div>
                  {eventData.summary?.topIssue ? (
                    <div className="mt-1 space-y-0.5">
                      <div className={`font-bold truncate ${textPrimary}`} title={isEn ? eventData.summary.topIssue.humanTitleEn : eventData.summary.topIssue.humanTitleFa}>
                        {isEn ? eventData.summary.topIssue.humanTitleEn : eventData.summary.topIssue.humanTitleFa}
                      </div>
                      <div className={`text-[11px] font-mono tabular-nums ${textMuted}`}>
                        ID {eventData.summary.topIssue.eventId} · {eventData.summary.topIssue.count}×
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 font-semibold text-emerald-500">
                      {isEn ? 'Clean (0 issues)' : 'سالم (بدون خطا)'}
                    </div>
                  )}
                </div>
              </div>

              {/* Human-Decoded Event Incident Cards */}
              {filteredEvents.length === 0 ? (
                <div className={`rounded-xl border p-8 text-center text-xs ${surfaceBg} ${textMuted}`}>
                  <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                  <div className={`font-bold text-sm ${textPrimary}`}>
                    {isEn ? 'No matching errors or warnings found' : 'هیچ خطا یا هشداری با این فیلتر ثبت نشده است'}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredEvents.map((ev: any, idx: number) => {
                    const rowKey = `${ev.recordId}-${ev.eventId}-${idx}`;
                    const exp = ev.explanation || {};
                    const isExpanded = Boolean(expandedEventIds[rowKey]);
                    const levelColor =
                      ev.level === 'critical'
                        ? 'text-rose-500'
                        : ev.level === 'error'
                        ? 'text-orange-500'
                        : 'text-amber-500';
                    const formattedTime = ev.timeCreated
                      ? new Date(ev.timeCreated).toLocaleString(isEn ? 'en-US' : 'fa-IR')
                      : '-';

                    return (
                      <div key={rowKey} className={`rounded-xl border p-4 sm:p-5 space-y-3.5 ${surfaceBg}`}>
                        {/* Top Header: Event Code & Source paired directly beside Human Title */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                          {/* Left/Start Identity Column: Error Code + Severity + Source + Time */}
                          <div className={`lg:col-span-4 p-3 rounded-lg border space-y-1.5 ${subSurfaceBg}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className={`flex items-center gap-1.5 text-xs font-bold ${levelColor}`}>
                                {ev.level === 'critical' ? (
                                  <ShieldAlert className="w-4 h-4 shrink-0" />
                                ) : ev.level === 'error' ? (
                                  <AlertCircle className="w-4 h-4 shrink-0" />
                                ) : (
                                  <AlertTriangle className="w-4 h-4 shrink-0" />
                                )}
                                <span>{isEn ? ev.levelLabelEn : ev.levelLabelFa}</span>
                              </div>
                              <span className={`font-mono text-sm font-bold tabular-nums ${textPrimary}`}>
                                {isEn ? `Event ID ${ev.eventId}` : `کد خطا ${ev.eventId}`}
                              </span>
                            </div>

                            <div className={`text-xs font-mono truncate ${textPrimary}`} title={ev.source}>
                              {ev.source}
                            </div>

                            <div className={`text-[11px] flex flex-wrap items-center gap-1.5 ${textMuted}`}>
                              <span>{ev.channel}</span>
                              <span aria-hidden="true">·</span>
                              <span>{isEn ? exp.categoryLabelEn : exp.categoryLabelFa}</span>
                            </div>

                            <div className={`text-[11px] font-mono tabular-nums pt-1 border-t ${isLightMode ? 'border-slate-200' : 'border-slate-800'} ${textMuted}`}>
                              {formattedTime}
                            </div>
                          </div>

                          {/* Right/End Human-Readable Plain-Language Diagnosis */}
                          <div className="lg:col-span-8 space-y-2.5 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h3 className={`text-sm font-bold ${textPrimary}`}>
                                {isEn ? exp.humanTitleEn : exp.humanTitleFa}
                              </h3>
                              <span className={`text-[11px] font-medium ${exp.isKnownCode ? 'text-teal-500' : textMuted}`}>
                                {exp.isKnownCode
                                  ? isEn
                                    ? 'Exact Code Match'
                                    : 'شناسایی دقیق کد خطا'
                                  : isEn
                                  ? 'Smart Analysis'
                                  : 'تحلیل هوشمند متن خطا'}
                              </span>
                            </div>

                            <p className={`leading-relaxed ${textPrimary}`}>
                              <span className={`font-semibold ${textMuted}`}>
                                {isEn ? 'What happened: ' : 'دلیل خطا: '}
                              </span>
                              {isEn ? exp.humanReasonEn : exp.humanReasonFa}
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                              <div className={`p-2.5 rounded-lg border ${subSurfaceBg}`}>
                                <div className={`text-[11px] font-semibold mb-0.5 ${textMuted}`}>
                                  {isEn ? 'Likely Root Cause' : 'علت احتمالی'}
                                </div>
                                <div className={`leading-relaxed ${textPrimary}`}>
                                  {isEn ? exp.likelyCauseEn : exp.likelyCauseFa}
                                </div>
                              </div>

                              <div
                                className={`p-2.5 rounded-lg border ${
                                  isLightMode
                                    ? 'bg-teal-50/70 border-teal-200 text-slate-900'
                                    : 'bg-teal-500/10 border-teal-500/25 text-slate-100'
                                }`}
                              >
                                <div className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 flex items-center gap-1 mb-0.5">
                                  <Lightbulb className="w-3.5 h-3.5" />
                                  <span>{isEn ? 'Recommended HelpDesk Action' : 'اقدام پیشنهادی کارشناس'}</span>
                                </div>
                                <div className="leading-relaxed">
                                  {isEn ? exp.recommendedActionEn : exp.recommendedActionFa}
                                </div>
                              </div>
                            </div>

                            {ev.rawMessage && (
                              <div className="pt-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedEventIds((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }))
                                  }
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-500 hover:underline cursor-pointer"
                                >
                                  {isExpanded ? (
                                    <>
                                      <ChevronUp className="w-3.5 h-3.5" />
                                      <span>{isEn ? 'Hide Raw Event Log' : 'بستن متن خام لاگ'}</span>
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="w-3.5 h-3.5" />
                                      <span>{isEn ? 'Show Raw Event Log' : 'مشاهده متن خام لاگ ویندوز'}</span>
                                    </>
                                  )}
                                </button>
                                {isExpanded && (
                                  <pre
                                    dir="ltr"
                                    className={`mt-2 p-3 rounded-lg border font-mono text-[11px] whitespace-pre-wrap break-words max-h-56 overflow-y-auto ${subSurfaceBg} ${textMuted}`}
                                  >
                                    {ev.rawMessage}
                                  </pre>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 5: CONFINED TEMP CLEANUP (ITEM 6) & GPUPDATE /FORCE (ITEM 7)    */}
      {/* =================================================================== */}
      {activeSubTab === 'maintenance' && (
        <div className="space-y-6">
          {/* MODULE 6: SAFE CONFINED TEMP FOLDER CLEANUP */}
          <div className={`rounded-xl border p-4 sm:p-5 space-y-5 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-sky-500" />
                  <h2 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn ? 'Safe Confined Temp Folder Cleanup' : 'اسکن و پاک‌سازی ایمن پوشه‌های Temp سیستم کاربر'}
                  </h2>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    fieldName={isEn ? 'Confined Temp Folder Cleanup' : 'پاک‌سازی محدود پوشه Temp'}
                    whatIsIt={
                      isEn
                        ? 'Scans and removes temporary junk files strictly inside hardcoded Windows\\Temp and active user AppData\\Local\\Temp directories.'
                        : 'فایل‌های موقت انباشته‌شده را صرفاً داخل دو مسیر ثابت Windows\\Temp و AppData\\Local\\Temp کاربر فعال اسکن و پاک‌سازی می‌کند.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Reclaims Drive C space and resolves frozen app cache issues without exposing arbitrary file-deletion risk.'
                        : 'فضای درایو C را آزاد کرده و مشکلات کش برنامه‌ها را حل می‌کند بدون اینکه امکان حذف مسیر دلخواه یا فایل‌های کاربر وجود داشته باشد.'
                    }
                    example={
                      isEn
                        ? 'Hardcoded paths only · In-use locked files are safely skipped · Zero custom path input'
                        : 'مسیرها کاملاً ثابت در سرور هستند · فایل‌های در حال استفاده ایمن رد می‌شوند · بدون ورودی مسیر دلخواه'
                    }
                  />
                </div>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {isEn
                    ? 'Hard-confined strictly to Windows\\Temp and active user AppData\\Local\\Temp. In-use files are automatically skipped.'
                    : 'دسترسی حذف کاملاً قفل‌شده فقط روی پوشه‌های Temp ویندوز و کاربر فعال (هیچ مسیر دیگری قابل حذف نیست و فایل‌های باز رد می‌شوند).'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleScanTemp}
                  disabled={!canRunDiagnostics || loadingTempScan}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {loadingTempScan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>{isEn ? 'Scan Temp Folders' : 'اسکن پوشه‌های Temp'}</span>
                </button>

                <select
                  value={tempScope}
                  onChange={(e) => setTempScope(e.target.value as any)}
                  className={`px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="both">{isEn ? 'Both Temp Folders' : 'هر دو پوشه Temp'}</option>
                  <option value="user_temp">{isEn ? 'User Temp Only' : 'فقط Temp کاربر فعال'}</option>
                  <option value="windows_temp">{isEn ? 'Windows Temp Only' : 'فقط Windows\\Temp'}</option>
                </select>

                {!confirmTempClean ? (
                  <button
                    type="button"
                    onClick={() => setConfirmTempClean(true)}
                    disabled={!canCleanTemp || cleaningTemp}
                    title={
                      !canCleanTemp
                        ? isEn
                          ? 'Requires canCleanHelpdeskTemp permission'
                          : 'نیازمند مجوز canCleanHelpdeskTemp در Access Policy'
                        : undefined
                    }
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
                  >
                    {cleaningTemp ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : !canCleanTemp ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>{isEn ? 'Clean Temp Safely' : 'پاک‌سازی ایمن Temp'}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleCleanTemp}
                      disabled={cleaningTemp}
                      className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      {isEn ? 'Confirm Clean' : 'تأیید پاک‌سازی'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmTempClean(false)}
                      className={`px-2.5 py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                        isLightMode ? 'border-slate-300 text-slate-700' : 'border-slate-700 text-slate-300'
                      }`}
                    >
                      {isEn ? 'Cancel' : 'انصراف'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {tempError && (
              <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-500 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{tempError}</span>
              </div>
            )}

            {tempCleanResult && (
              <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-xs space-y-1">
                <div className="font-bold text-emerald-500 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isEn ? tempCleanResult.message : tempCleanResult.messageFa}</span>
                </div>
                <div className={`font-mono tabular-nums ${textMuted}`}>
                  {isEn
                    ? `Deleted: ${tempCleanResult.deletedFiles} files · Freed: ${tempCleanResult.freedMb} MB · Locked & Skipped: ${tempCleanResult.skippedLockedFiles} files`
                    : `حذف‌شده: ${tempCleanResult.deletedFiles} فایل · آزادسازی: ${tempCleanResult.freedMb} MB · فایل‌های باز ردشده: ${tempCleanResult.skippedLockedFiles}`}
                </div>
              </div>
            )}

            {tempScanData && (
              <div className="space-y-4">
                {/* Temp Folders Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className={`p-4 rounded-xl border ${subSurfaceBg}`}>
                    <div className={textMuted}>{isEn ? 'Total Reclaimable Temp' : 'حجم کل قابل آزادسازی'}</div>
                    <div className={`mt-1 text-2xl font-bold font-mono tabular-nums ${textPrimary}`}>
                      {tempScanData.totalReclaimableMb} MB
                    </div>
                    <div className={`mt-1 font-mono tabular-nums ${textMuted}`}>
                      {tempScanData.totalFileCount} {isEn ? 'temp files' : 'فایل موقت'} · {tempScanData.hostname}
                    </div>
                  </div>

                  {(tempScanData.folders || []).map((f: any) => {
                    const share =
                      tempScanData.totalReclaimableMb > 0
                        ? Math.min(100, (f.sizeMb / tempScanData.totalReclaimableMb) * 100)
                        : 0;
                    return (
                      <div key={f.key} className={`p-4 rounded-xl border space-y-2 ${subSurfaceBg}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-bold ${textPrimary}`}>{isEn ? f.labelEn : f.labelFa}</span>
                          <span className="font-mono font-bold tabular-nums text-sky-500">{f.sizeMb} MB</span>
                        </div>
                        <div className={`h-1.5 rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                          <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(f.sizeMb > 0 ? 4 : 0, share)}%` }} />
                        </div>
                        <div className={`text-[11px] font-mono truncate ${textMuted}`} dir="ltr" title={f.path}>
                          {f.path || '-'}
                        </div>
                        <div className={`text-[11px] font-mono tabular-nums ${textMuted}`}>
                          {f.fileCount} {isEn ? 'files' : 'فایل'} · {f.folderCount} {isEn ? 'folders' : 'پوشه'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Largest Temp Files Preview */}
                {Array.isArray(tempScanData.largestFiles) && tempScanData.largestFiles.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className={`border-b text-start ${isLightMode ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
                          <th className="py-2 px-2.5 text-start">{isEn ? 'Largest Temp File' : 'حجیم‌ترین فایل‌های Temp'}</th>
                          <th className="py-2 px-2.5 text-start">{isEn ? 'Location' : 'مسیر'}</th>
                          <th className="py-2 px-2.5 text-end">{isEn ? 'Size' : 'حجم'}</th>
                          <th className="py-2 px-2.5 text-end">{isEn ? 'Modified' : 'آخرین تغییر'}</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                        {tempScanData.largestFiles.map((lf: any, idx: number) => (
                          <tr key={`${lf.name}-${idx}`}>
                            <td className={`py-2 px-2.5 font-mono ${textPrimary}`}>{lf.name}</td>
                            <td className={`py-2 px-2.5 ${textMuted}`}>
                              {lf.folderKey === 'windows_temp'
                                ? isEn
                                  ? 'Windows Temp'
                                  : 'Temp ویندوز'
                                : isEn
                                ? 'User Temp'
                                : 'Temp کاربر'}
                            </td>
                            <td className={`py-2 px-2.5 text-end font-mono tabular-nums font-semibold ${textPrimary}`}>
                              {lf.sizeMb} MB
                            </td>
                            <td className={`py-2 px-2.5 text-end font-mono tabular-nums ${textMuted}`}>
                              {lf.lastModified || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* MODULE 7: GROUP POLICY INSPECTION & SAFE GPUPDATE /FORCE */}
          <div className={`rounded-xl border p-4 sm:p-5 space-y-5 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-teal-500" />
                  <h2 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn ? 'Group Policy Inspection & Non-Disruptive gpupdate /force' : 'بررسی وضعیت Group Policy و اجرای فوری gpupdate /force'}
                  </h2>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    fieldName={isEn ? 'Safe Group Policy Refresh' : 'اعمال ایمن Group Policy'}
                    whatIsIt={
                      isEn
                        ? 'Reads currently applied domain GPOs via gpresult /r and runs a fixed, parameterless gpupdate /force /wait:0.'
                        : 'لیست پالیسی‌های اعمال‌شده دامین را از طریق gpresult خوانده و با یک دکمه ثابت دستور gpupdate /force را اجرا می‌کند.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Immediately applies new security, printer, or drive-mapping policies without logging off or rebooting the active user.'
                        : 'پالیسی‌های جدید دامین، پرینتر یا تنظیمات امنیتی را بلافاصله اعمال می‌کند و جلوی Logoff یا Reboot اجباری کاربر را می‌گیرد.'
                    }
                    example={
                      isEn
                        ? 'Executes: echo N | gpupdate.exe /force /wait:0 (never forces unexpected logoff)'
                        : 'دستور ثابت: echo N | gpupdate.exe /force /wait:0 (بدون قطع کردن کار کاربر)'
                    }
                  />
                </div>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {isEn
                    ? 'Fixed parameterless gpupdate /force /wait:0 — automatically declines any forced user logoff or restart prompt.'
                    : 'اجرای ثابت و بدون پارامتر gpupdate /force /wait:0 — هرگونه درخواست Logoff یا Restart اجباری کاربر به‌طور خودکار رد می‌شود.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleInspectGpo}
                  disabled={!canRunDiagnostics || loadingGpo}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {loadingGpo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>{isEn ? 'Inspect GPO Status' : 'بررسی وضعیت GPO'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRunGpupdate}
                  disabled={!canRunGpupdate || runningGpupdate}
                  title={
                    !canRunGpupdate
                      ? isEn
                        ? 'Requires canRunHelpdeskGpupdate permission'
                        : 'نیازمند مجوز canRunHelpdeskGpupdate در Access Policy'
                      : undefined
                  }
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {runningGpupdate ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : !canRunGpupdate ? (
                    <Lock className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  <span>{isEn ? 'Run gpupdate /force' : 'اجرای gpupdate /force'}</span>
                </button>
              </div>
            </div>

            {gpoError && (
              <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-500 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{gpoError}</span>
              </div>
            )}

            {gpupdateResult && (
              <div
                className={`p-4 rounded-xl border space-y-2 text-xs ${
                  gpupdateResult.success
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-amber-500/40 bg-amber-500/10'
                }`}
              >
                <div
                  className={`font-bold flex items-center gap-2 ${
                    gpupdateResult.success ? 'text-emerald-500' : 'text-amber-500'
                  }`}
                >
                  {gpupdateResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  <span>{isEn ? gpupdateResult.message : gpupdateResult.messageFa}</span>
                </div>
                {gpupdateResult.rawOutput && (
                  <pre
                    dir="ltr"
                    className={`p-3 rounded-lg border font-mono text-[11px] overflow-x-auto max-h-48 ${subSurfaceBg} ${textPrimary}`}
                  >
                    {gpupdateResult.rawOutput}
                  </pre>
                )}
              </div>
            )}

            {gpoData && (
              <div className="space-y-4">
                <div className={`p-4 rounded-xl border grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs ${subSurfaceBg}`}>
                  <div>
                    <div className={textMuted}>{isEn ? 'Domain / Workgroup' : 'دامین / Workgroup'}</div>
                    <div className={`mt-1 font-bold font-mono ${textPrimary}`}>{gpoData.domain || '-'}</div>
                  </div>
                  <div>
                    <div className={textMuted}>{isEn ? 'AD Domain Joined' : 'عضویت در دامین'}</div>
                    <div className={`mt-1 font-bold ${gpoData.domainJoined ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {gpoData.domainJoined
                        ? isEn
                          ? 'Joined'
                          : 'عضو دامین'
                        : isEn
                        ? 'Workgroup / Standalone'
                        : 'خارج از دامین'}
                    </div>
                  </div>
                  <div>
                    <div className={textMuted}>{isEn ? 'Last GPO Applied' : 'آخرین اعمال GPO'}</div>
                    <div className={`mt-1 font-mono text-[11px] ${textPrimary}`}>
                      {gpoData.lastGpoRefresh || '-'}
                    </div>
                  </div>
                  <div>
                    <div className={textMuted}>{isEn ? 'Pending Reboot' : 'نیاز به ری‌استارت'}</div>
                    <div className={`mt-1 font-bold ${gpoData.pendingReboot ? 'text-amber-500' : 'text-emerald-500'}`}>
                      {gpoData.pendingReboot
                        ? isEn
                          ? 'Reboot Pending'
                          : 'در انتظار ری‌استارت'
                        : isEn
                        ? 'Not Required'
                        : 'نیاز ندارد'}
                    </div>
                  </div>
                </div>

                {Array.isArray(gpoData.computerGpos) && gpoData.computerGpos.length > 0 && (
                  <div className="space-y-2">
                    <div className={`text-xs font-bold ${textPrimary}`}>
                      {isEn
                        ? `Applied Computer Group Policies (${gpoData.computerGpos.length})`
                        : `گروپ پالیسی‌های اعمال‌شده روی سیستم (${gpoData.computerGpos.length})`}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {gpoData.computerGpos.map((gpo: string, idx: number) => (
                        <div key={`${gpo}-${idx}`} className={`px-3 py-2 rounded-lg border font-mono ${subSurfaceBg} ${textPrimary}`}>
                          {gpo}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {gpoData.rawSummary && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowRawGpo((v) => !v)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-sky-500 hover:underline cursor-pointer"
                    >
                      {showRawGpo ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      <span>{showRawGpo ? (isEn ? 'Hide gpresult /r Output' : 'بستن خروجی gpresult') : isEn ? 'Show Full gpresult /r Output' : 'مشاهده خروجی کامل gpresult /r'}</span>
                    </button>
                    {showRawGpo && (
                      <pre
                        dir="ltr"
                        className={`mt-2 p-3.5 rounded-xl border font-mono text-[11px] overflow-x-auto max-h-64 ${subSurfaceBg} ${textMuted}`}
                      >
                        {gpoData.rawSummary}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SYSTEM FILE INTEGRITY (SFC) & WINDOWS IMAGE REPAIR (DISM) */}
          <div className={`rounded-xl border p-4 sm:p-5 space-y-5 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-sky-500" />
                  <h2 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn
                      ? 'Corrupt System File Check (SFC) & Windows Image Repair (DISM)'
                      : 'یافتن و تعمیر فایل‌های سیستمی خراب (SFC) و تعمیر ایمیج ویندوز (DISM)'}
                  </h2>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    fieldName={isEn ? 'SFC & DISM System Repair' : 'تعمیر فایل‌های سیستمی و ایمیج ویندوز'}
                    whatIsIt={
                      isEn
                        ? 'Runs official Windows integrity tools (sfc /verifyonly, sfc /scannow, and DISM /CheckHealth, /ScanHealth, /RestoreHealth) remotely.'
                        : 'ابزارهای رسمی سلامت ویندوز شامل sfc /verifyonly، sfc /scannow و DISM CheckHealth/ScanHealth/RestoreHealth را از راه دور و ایمن اجرا می‌کند.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Fixes broken OS DLLs, Windows Update failures, and crashes without reinstalling Windows.'
                        : 'خرابی فایل‌های هسته ویندوز، خطاهای Windows Update و کرش‌های ناگهانی را بدون نیاز به نصب مجدد ویندوز برطرف می‌کند.'
                    }
                    example={
                      isEn
                        ? 'Recommended order: 1) DISM RestoreHealth → 2) SFC /scannow (takes 1–4 minutes)'
                        : 'ترتیب پیشنهادی: ۱) DISM RestoreHealth و سپس ۲) SFC /scannow (زمان اجرا ۱ تا ۴ دقیقه)'
                    }
                  />
                </div>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {isEn
                    ? 'Allowlisted system integrity commands only. Deep scans (SFC /scannow and DISM /RestoreHealth) may take 1 to 4 minutes to complete.'
                    : 'فقط دستورات ثابت و مجاز تعمیر ویندوز اجرا می‌شوند. اسکن‌های عمیق (SFC /scannow و DISM RestoreHealth) ممکن است ۱ تا ۴ دقیقه زمان ببرند.'}
                </p>
              </div>
              {!canRunSystemRepair && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-500">
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Requires canRunHelpdeskSystemRepair' : 'نیازمند مجوز canRunHelpdeskSystemRepair'}</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* SFC Controls */}
              <div className={`p-4 rounded-xl border space-y-3 ${subSurfaceBg}`}>
                <div>
                  <div className={`text-xs font-bold ${textPrimary}`}>
                    {isEn ? 'System File Checker (SFC)' : 'بررسی و تعمیر فایل‌های سیستمی (SFC)'}
                  </div>
                  <div className={`text-[11px] mt-0.5 ${textMuted}`}>
                    {isEn
                      ? 'Verify protected Windows system files or repair corrupted system binaries.'
                      : 'بررسی سلامت فایل‌های محافظت‌شده ویندوز و تعمیر خودکار فایل‌های خراب.'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!canRunSystemRepair || runningRepairMode !== null}
                    onClick={() => handleRunSystemRepair('sfc_verify')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition disabled:opacity-50 cursor-pointer ${
                      isLightMode ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  >
                    {runningRepairMode === 'sfc_verify' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5 text-sky-500" />}
                    <span>{isEn ? 'SFC Verify Only' : 'فقط بررسی (sfc /verifyonly)'}</span>
                  </button>

                  {confirmRepairKey === 'sfc_scannow' ? (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={runningRepairMode !== null}
                        onClick={() => handleRunSystemRepair('sfc_scannow')}
                        className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer"
                      >
                        {isEn ? 'Confirm sfc /scannow' : 'تأیید اجرای sfc /scannow'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRepairKey(null)}
                        className={`px-2.5 py-2 rounded-lg border text-xs cursor-pointer ${isLightMode ? 'border-slate-300 text-slate-700' : 'border-slate-700 text-slate-300'}`}
                      >
                        {isEn ? 'Cancel' : 'انصراف'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!canRunSystemRepair || runningRepairMode !== null}
                      onClick={() => setConfirmRepairKey('sfc_scannow')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      {runningRepairMode === 'sfc_scannow' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                      <span>{isEn ? 'Repair (sfc /scannow)' : 'یافتن و تعمیر (sfc /scannow)'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* DISM Controls */}
              <div className={`p-4 rounded-xl border space-y-3 ${subSurfaceBg}`}>
                <div>
                  <div className={`text-xs font-bold ${textPrimary}`}>
                    {isEn ? 'Windows Image Servicing (DISM)' : 'تعمیر ایمیج ویندوز (DISM Component Store)'}
                  </div>
                  <div className={`text-[11px] mt-0.5 ${textMuted}`}>
                    {isEn
                      ? 'Check, deep-scan, or restore the Windows Component Store image.'
                      : 'بررسی سریع، اسکن عمیق و تعمیر کامل ایمیج ویندوز با DISM RestoreHealth.'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!canRunSystemRepair || runningRepairMode !== null}
                    onClick={() => handleRunSystemRepair('dism_check')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition disabled:opacity-50 cursor-pointer ${
                      isLightMode ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  >
                    {runningRepairMode === 'dism_check' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-teal-500" />}
                    <span>CheckHealth</span>
                  </button>
                  <button
                    type="button"
                    disabled={!canRunSystemRepair || runningRepairMode !== null}
                    onClick={() => handleRunSystemRepair('dism_scan')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition disabled:opacity-50 cursor-pointer ${
                      isLightMode ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  >
                    {runningRepairMode === 'dism_scan' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5 text-sky-500" />}
                    <span>ScanHealth</span>
                  </button>
                  {confirmRepairKey === 'dism_restore' ? (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={runningRepairMode !== null}
                        onClick={() => handleRunSystemRepair('dism_restore')}
                        className="px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer"
                      >
                        {isEn ? 'Confirm RestoreHealth' : 'تأیید RestoreHealth'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRepairKey(null)}
                        className={`px-2.5 py-2 rounded-lg border text-xs cursor-pointer ${isLightMode ? 'border-slate-300 text-slate-700' : 'border-slate-700 text-slate-300'}`}
                      >
                        {isEn ? 'Cancel' : 'انصراف'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!canRunSystemRepair || runningRepairMode !== null}
                      onClick={() => setConfirmRepairKey('dism_restore')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      {runningRepairMode === 'dism_restore' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                      <span>RestoreHealth</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {runningRepairMode && (
              <div className="p-3.5 rounded-xl border border-sky-500/40 bg-sky-500/10 text-xs flex items-center gap-2.5 text-sky-500">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>
                  {isEn
                    ? `Executing ${runningRepairMode} on ${targetIp}... Please wait (deep system scans can take 1–4 minutes).`
                    : `در حال اجرای ${runningRepairMode} روی سیستم ${targetIp}... لطفاً صبر کنید (اسکن‌های عمیق ممکن است ۱ تا ۴ دقیقه زمان ببرند).`}
                </span>
              </div>
            )}

            {repairError && (
              <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-500 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{repairError}</span>
              </div>
            )}

            {repairResult && (
              <div
                className={`p-4 rounded-xl border space-y-2 text-xs ${
                  repairResult.statusCode === 'clean' || repairResult.statusCode === 'repaired' || repairResult.statusCode === 'scheduled'
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : repairResult.blockedSsd
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-rose-500/40 bg-rose-500/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={`font-bold flex items-center gap-2 ${
                      repairResult.statusCode === 'clean' || repairResult.statusCode === 'repaired' || repairResult.statusCode === 'scheduled'
                        ? 'text-emerald-500'
                        : repairResult.blockedSsd
                        ? 'text-amber-500'
                        : 'text-rose-500'
                    }`}
                  >
                    {repairResult.blockedSsd ? (
                      <Ban className="w-4 h-4 shrink-0" />
                    ) : repairResult.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{isEn ? repairResult.summaryEn : repairResult.summaryFa}</span>
                  </div>
                  {repairResult.rawOutput && (
                    <button
                      type="button"
                      onClick={() => setShowRawRepair((v) => !v)}
                      className="text-sky-500 hover:underline font-semibold shrink-0 cursor-pointer"
                    >
                      {showRawRepair ? (isEn ? 'Hide Output' : 'بستن خروجی') : isEn ? 'Raw Output' : 'خروجی کامل'}
                    </button>
                  )}
                </div>
                {showRawRepair && repairResult.rawOutput && (
                  <pre
                    dir="ltr"
                    className={`p-3 rounded-lg border font-mono text-[11px] overflow-x-auto max-h-60 ${subSurfaceBg} ${textMuted}`}
                  >
                    {repairResult.rawOutput}
                  </pre>
                )}
              </div>
            )}
          </div>

          {/* SMART DISK MEDIA DETECTION (HDD vs SSD/NVMe) & NON-SSD BAD-SECTOR CHKDSK */}
          <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-sky-500" />
                  <h2 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn
                      ? 'File-System & Bad-Sector Check (Strictly Non-SSD / HDD Protected)'
                      : 'بررسی خطای فایل‌سیستم و بدسکتور هارد (محافظت‌شده: صرفاً برای هاردهای غیر SSD)'}
                  </h2>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    fieldName={isEn ? 'Smart HDD-Only Bad-Sector Guard' : 'محافظت هوشمند SSD در CHKDSK'}
                    whatIsIt={
                      isEn
                        ? 'Detects whether each logical volume resides on a mechanical HDD or an SSD/NVMe drive before offering CHKDSK actions.'
                        : 'ابتدا نوع فیزیکی هر درایو (HDD مکانیکی در برابر SSD/NVMe) و وضعیت Dirty Bit را تشخیص می‌دهد و سپس گزینه‌های ایمن CHKDSK را فعال می‌کند.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Surface bad-sector rewrite (chkdsk /r) causes unnecessary flash wear on SSDs; this guard hard-blocks /r on both UI and endpoint PowerShell.'
                        : 'اجرای اسکن سطح بدسکتور (chkdsk /r) روی SSD باعث کاهش عمر سلول‌های فلش می‌شود؛ بنابراین هم در رابط کاربری و هم در اسکریپت روی سیستم کاربر، اجرای /r روی SSD/NVMe به‌صورت قطعی مسدود شده است.'
                    }
                    example={
                      isEn
                        ? 'C: (NVMe SSD) → Read-only CHKDSK only · D: (SATA HDD) → Bad-Sector Scan (/r) enabled'
                        : 'درایو C (SSD/NVMe): فقط بررسی خواندنی · درایو D (HDD مکانیکی): اسکن بدسکتور (/r) فعال'
                    }
                  />
                </div>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {isEn
                    ? 'Automatically distinguishes mechanical HDDs from SSD/NVMe drives. Bad-sector scan (chkdsk /r) is hard-blocked on SSD/NVMe drives.'
                    : 'تشخیص خودکار هارد مکانیکی (HDD) از SSD/NVMe؛ اجرای اسکن بدسکتور (chkdsk /r) روی دیسک‌های SSD و NVMe به‌صورت خودکار مسدود می‌شود.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleInspectDisks}
                disabled={!canRunDiagnostics || loadingDiskHealth}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
              >
                {loadingDiskHealth ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>{isEn ? 'Detect Disks (HDD / SSD)' : 'شناسایی دیسک‌ها (HDD / SSD)'}</span>
              </button>
            </div>

            {diskHealthError && (
              <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-500 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{diskHealthError}</span>
              </div>
            )}

            {diskHealthData && Array.isArray(diskHealthData.volumes) && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className={`border-b text-start ${isLightMode ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
                      <th className="py-2 px-2.5 text-start font-semibold">{isEn ? 'Drive' : 'درایو'}</th>
                      <th className="py-2 px-2.5 text-start font-semibold">{isEn ? 'Media Type & Model' : 'نوع دیسک و مدل'}</th>
                      <th className="py-2 px-2.5 text-start font-semibold">{isEn ? 'Health / Dirty Bit' : 'سلامت / Dirty Bit'}</th>
                      <th className="py-2 px-2.5 text-end font-semibold">{isEn ? 'Free / Total' : 'خالی / کل'}</th>
                      <th className="py-2 px-2.5 text-end font-semibold">{isEn ? 'CHKDSK Actions' : 'عملیات CHKDSK'}</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                    {diskHealthData.volumes.map((v: any) => {
                      const confirmKey = `chkdsk_hdd_badsector:${v.driveLetter}`;
                      const isSsdDrive = Boolean(v.isSsd || v.mediaType === 'SSD' || v.mediaType === 'NVMe');
                      const canBadSector = !isSsdDrive && v.badSectorScanAllowed !== false && diskHealthData.osFamily === 'windows';
                      return (
                        <tr key={v.driveLetter}>
                          <td className="py-2.5 px-2.5 font-mono font-bold">
                            <span className={textPrimary}>{v.driveLetter}:</span>
                            <div className={`text-[10px] font-normal ${textMuted}`}>
                              {v.label || '-'} · {v.fileSystem || '-'}
                            </div>
                          </td>
                          <td className="py-2.5 px-2.5">
                            <div
                              className={`font-bold font-mono ${
                                isSsdDrive ? 'text-sky-500' : v.mediaType === 'HDD' ? 'text-amber-500' : textMuted
                              }`}
                            >
                              {v.mediaType} {v.busType ? `· ${v.busType}` : ''}
                            </div>
                            <div className={`text-[11px] truncate max-w-[240px] ${textMuted}`} title={v.diskModel}>
                              {v.diskModel || '-'}
                            </div>
                          </td>
                          <td className="py-2.5 px-2.5">
                            <div className={`font-semibold ${v.healthStatus === 'Healthy' ? 'text-emerald-500' : 'text-amber-500'}`}>
                              {v.healthStatus || 'Unknown'}
                            </div>
                            <div className={`text-[10px] ${v.isDirty ? 'text-rose-500 font-semibold' : textMuted}`}>
                              {v.isDirty
                                ? isEn
                                  ? 'FS Dirty Flag Set'
                                  : 'فلگ خطای فایل‌سیستم (Dirty)'
                                : isEn
                                ? 'FS Clean'
                                : 'فایل‌سیستم سالم'}
                            </div>
                          </td>
                          <td className={`py-2.5 px-2.5 text-end font-mono tabular-nums ${textPrimary}`}>
                            {v.freeGb} / {v.sizeGb} GB
                            <div className={`text-[10px] ${textMuted}`}>{v.usedPercent}% {isEn ? 'used' : 'پر'}</div>
                          </td>
                          <td className="py-2.5 px-2.5 text-end whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {diskHealthData.osFamily === 'windows' && (
                                <button
                                  type="button"
                                  disabled={!canRunSystemRepair || runningRepairMode !== null}
                                  onClick={() => handleRunSystemRepair('chkdsk_readonly', v.driveLetter)}
                                  className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold transition disabled:opacity-50 cursor-pointer ${
                                    isLightMode ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                                  }`}
                                >
                                  {runningRepairMode === `chkdsk_readonly:${v.driveLetter}` ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : isEn ? (
                                    'Read-Only Check'
                                  ) : (
                                    'بررسی خواندنی'
                                  )}
                                </button>
                              )}
                              {isSsdDrive ? (
                                <span
                                  title={
                                    isEn
                                      ? 'Bad-sector scan (chkdsk /r) is strictly blocked on SSD/NVMe drives to protect flash lifespan.'
                                      : 'اسکن بدسکتور (chkdsk /r) روی هاردهای SSD/NVMe برای حفظ عمر درایو مسدود است.'
                                  }
                                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 ${textMuted}`}
                                >
                                  <Lock className="w-3 h-3 text-sky-500" />
                                  <span>{isEn ? 'SSD Protected' : 'محافظت SSD (مسدود)'}</span>
                                </span>
                              ) : canBadSector ? (
                                confirmRepairKey === confirmKey ? (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleRunSystemRepair('chkdsk_hdd_badsector', v.driveLetter)}
                                      className="px-2 py-1 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold cursor-pointer"
                                    >
                                      {isEn ? 'Confirm /r' : 'تأیید /r'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmRepairKey(null)}
                                      className={`px-2 py-1 rounded-md border text-[11px] cursor-pointer ${isLightMode ? 'border-slate-300 text-slate-700' : 'border-slate-700 text-slate-300'}`}
                                    >
                                      {isEn ? 'Cancel' : 'انصراف'}
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={!canRunSystemRepair || runningRepairMode !== null}
                                    onClick={() => setConfirmRepairKey(confirmKey)}
                                    className="px-2.5 py-1 rounded-md border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-[11px] font-semibold transition disabled:opacity-50 cursor-pointer"
                                  >
                                    {isEn ? 'HDD Bad-Sector (/r)' : 'اسکن بدسکتور HDD (/r)'}
                                  </button>
                                )
                              ) : (
                                <span className={`text-[11px] ${textMuted}`}>—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 6: LAPTOP BATTERY HEALTH/CYCLES & DOMAIN ACCOUNT LOOKUP         */}
      {/* =================================================================== */}
      {activeSubTab === 'hardware_domain' && (
        <div className="space-y-6">
          {/* LAPTOP BATTERY HEALTH & EXACT CYCLE COUNT REPORT */}
          <div className={`rounded-xl border p-4 sm:p-5 space-y-5 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <BatteryCharging className="w-4 h-4 text-emerald-500" />
                  <h2 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn
                      ? 'Laptop Battery Health, Wear & Exact Cycle Count Report'
                      : 'گزارش کامل سلامت باتری لپ‌تاپ، تعداد دفعات شارژ (Cycle) و میزان فرسودگی'}
                  </h2>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    fieldName={isEn ? 'Battery Health & Cycle Count' : 'سلامت و سایکل باتری لپ‌تاپ'}
                    whatIsIt={
                      isEn
                        ? 'Generates a real Windows powercfg /batteryreport XML + WMI inspection to calculate exact battery health % (Full Charge / Design Capacity) and exact cycle count.'
                        : 'گزارش واقعی powercfg /batteryreport و WMI را از لپ‌تاپ کاربر می‌گیرد و به‌طور خودکار درصد سلامت باتری (نسبت ظرفیت فعلی به ظرفیت کارخانه) و تعداد دقیق دفعات شارژ (Cycle Count) را محاسبه می‌کند.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Instantly determines whether a user laptop needs battery replacement without physical access.'
                        : 'به کارشناس هلپ‌دسک نشان می‌دهد آیا باتری لپ‌تاپ کاربر دچار افت ظرفیت شده و نیازمند تعویض است یا خیر.'
                    }
                    example={
                      isEn
                        ? 'Health: 84.2% (Good) · Cycles: 187 · Full 42,100 mWh / Design 50,000 mWh'
                        : 'سلامت: 84.2% (خوب) · تعداد سایکل: ۱۸۷ بار · ظرفیت فعلی 42,100 از 50,000 mWh'
                    }
                  />
                </div>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {isEn
                    ? 'Reads exact Design Capacity vs Full-Charge Capacity (mWh), Charge Cycle Count, auto-computed Health %, and Capacity History.'
                    : 'خواندن ظرفیت کارخانه در برابر ظرفیت فعلی (mWh)، تعداد دقیق دفعات شارژ (Cycle Count)، محاسبه خودکار درصد سلامت و تاریخچه افت ظرفیت.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleInspectBattery}
                disabled={!canRunDiagnostics || loadingBattery}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
              >
                {loadingBattery ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Battery className="w-3.5 h-3.5" />}
                <span>{isEn ? 'Generate Battery Report' : 'دریافت گزارش سلامت باتری'}</span>
              </button>
            </div>

            {batteryError && (
              <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-500 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{batteryError}</span>
              </div>
            )}

            {batteryData && !batteryData.hasBattery && (
              <div className={`p-6 rounded-xl border text-center space-y-2 ${subSurfaceBg}`}>
                <Monitor className="w-8 h-8 mx-auto text-slate-400" />
                <div className={`text-sm font-bold ${textPrimary}`}>
                  {isEn ? 'No Battery Detected on This Endpoint' : 'هیچ باتری روی این سیستم شناسایی نشد'}
                </div>
                <p className={`text-xs ${textMuted}`}>
                  {isEn
                    ? `${batteryData.hostname} appears to be a desktop workstation, virtual machine, or has its battery removed.`
                    : `سیستم ${batteryData.hostname} احتمالاً کامپیوتر دسکتاپ، ماشین مجازی است یا باتری آن جدا شده است.`}
                </p>
              </div>
            )}

            {batteryData && batteryData.hasBattery && (
              <div className="space-y-5">
                {(batteryData.batteries || []).map((batt: any, idx: number) => {
                  const healthPct = typeof batt.healthPercent === 'number' ? batt.healthPercent : 0;
                  const ringSize = 136;
                  const strokeWidth = 11;
                  const radius = (ringSize - strokeWidth) / 2;
                  const circumference = 2 * Math.PI * radius;
                  const dashOffset = circumference * (1 - Math.max(0, Math.min(100, healthPct)) / 100);
                  const ringColor =
                    batt.healthPercent === null
                      ? '#64748b'
                      : healthPct >= 80
                      ? '#10b981'
                      : healthPct >= 65
                      ? '#0ea5e9'
                      : healthPct >= 50
                      ? '#f59e0b'
                      : '#e11d48';
                  const condLabel =
                    batt.condition === 'excellent'
                      ? isEn
                        ? 'Excellent Health'
                        : 'سلامت عالی'
                      : batt.condition === 'good'
                      ? isEn
                        ? 'Good Health'
                        : 'سلامت خوب'
                      : batt.condition === 'fair'
                      ? isEn
                        ? 'Fair (Moderate Wear)'
                        : 'متوسط (افت ظرفیت)'
                      : batt.condition === 'poor'
                      ? isEn
                        ? 'Poor — Replacement Recommended'
                        : 'ضعیف — نیاز به تعویض باتری'
                      : isEn
                      ? 'Unknown'
                      : 'نامشخص';

                  return (
                    <div
                      key={`${batt.id}-${idx}`}
                      className={`p-4 sm:p-5 rounded-xl border grid grid-cols-1 lg:grid-cols-12 gap-6 items-center ${subSurfaceBg}`}
                    >
                      {/* Radial Battery Health Gauge */}
                      <div className="lg:col-span-3 flex flex-col items-center text-center">
                        <div className="relative" style={{ width: ringSize, height: ringSize }}>
                          <svg width={ringSize} height={ringSize} className="-rotate-90">
                            <circle
                              cx={ringSize / 2}
                              cy={ringSize / 2}
                              r={radius}
                              fill="none"
                              stroke={isLightMode ? '#e2e8f0' : '#1e293b'}
                              strokeWidth={strokeWidth}
                            />
                            <circle
                              cx={ringSize / 2}
                              cy={ringSize / 2}
                              r={radius}
                              fill="none"
                              stroke={ringColor}
                              strokeWidth={strokeWidth}
                              strokeLinecap="round"
                              strokeDasharray={circumference}
                              strokeDashoffset={dashOffset}
                              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-2xl font-bold font-mono tabular-nums" style={{ color: ringColor }}>
                              {batt.healthPercent !== null ? `${batt.healthPercent}%` : 'N/A'}
                            </span>
                            <span className={`text-[11px] font-medium ${textMuted}`}>
                              {isEn ? 'Battery Health' : 'سلامت باتری'}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 text-xs font-bold" style={{ color: ringColor }}>
                          {condLabel}
                        </div>
                        {batt.wearPercent !== null && (
                          <div className={`text-[11px] font-mono tabular-nums ${textMuted}`}>
                            {isEn ? `Wear Level: ${batt.wearPercent}%` : `میزان فرسودگی: ${batt.wearPercent}%`}
                          </div>
                        )}
                      </div>

                      {/* KPI Cards & Capacity Bar */}
                      <div className="lg:col-span-9 space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div className={`p-3 rounded-lg border ${surfaceBg}`}>
                            <div className={textMuted}>{isEn ? 'Charge Cycles' : 'تعداد دفعات شارژ (Cycle)'}</div>
                            <div className={`mt-1 text-xl font-bold font-mono tabular-nums ${textPrimary}`}>
                              {batt.cycleCount !== null ? batt.cycleCount : isEn ? 'N/A' : 'گزارش نشد'}
                            </div>
                            <div className={`text-[10px] ${textMuted}`}>
                              {isEn ? 'Full charge cycles' : 'سایکل شارژ کامل'}
                            </div>
                          </div>

                          <div className={`p-3 rounded-lg border ${surfaceBg}`}>
                            <div className={textMuted}>{isEn ? 'Current Charge' : 'شارژ فعلی'}</div>
                            <div className={`mt-1 text-xl font-bold font-mono tabular-nums text-sky-500`}>
                              {batt.chargePercent !== null ? `${batt.chargePercent}%` : '-'}
                            </div>
                            <div className={`text-[10px] ${textMuted}`}>
                              {batt.isCharging
                                ? isEn
                                  ? 'Charging'
                                  : 'در حال شارژ'
                                : batt.onAcPower
                                ? isEn
                                  ? 'Plugged In (AC)'
                                  : 'متصل به برق'
                                : isEn
                                ? 'On Battery'
                                : 'روی باتری'}
                            </div>
                          </div>

                          <div className={`p-3 rounded-lg border ${surfaceBg}`}>
                            <div className={textMuted}>{isEn ? 'Full Charge Cap.' : 'ظرفیت فعلی باتری'}</div>
                            <div className={`mt-1 text-base font-bold font-mono tabular-nums ${textPrimary}`}>
                              {batt.fullChargeCapacityMwh > 0 ? `${batt.fullChargeCapacityMwh.toLocaleString()} mWh` : '-'}
                            </div>
                            <div className={`text-[10px] ${textMuted}`}>{isEn ? 'Current max capacity' : 'حداکثر ظرفیت فعلی'}</div>
                          </div>

                          <div className={`p-3 rounded-lg border ${surfaceBg}`}>
                            <div className={textMuted}>{isEn ? 'Design Capacity' : 'ظرفیت کارخانه (Design)'}</div>
                            <div className={`mt-1 text-base font-bold font-mono tabular-nums ${textPrimary}`}>
                              {batt.designCapacityMwh > 0 ? `${batt.designCapacityMwh.toLocaleString()} mWh` : '-'}
                            </div>
                            <div className={`text-[10px] ${textMuted}`}>{isEn ? 'Factory specification' : 'ظرفیت استاندارد کارخانه'}</div>
                          </div>
                        </div>

                        {/* Capacity Ratio Bar */}
                        {batt.designCapacityMwh > 0 && batt.fullChargeCapacityMwh > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                              <span className={textMuted}>
                                {isEn ? 'Effective Capacity vs Factory Design' : 'نسبت ظرفیت فعلی به ظرفیت اولیه کارخانه'}
                              </span>
                              <span className={`font-semibold ${textPrimary}`}>
                                {batt.fullChargeCapacityMwh.toLocaleString()} / {batt.designCapacityMwh.toLocaleString()} mWh ({batt.healthPercent}%)
                              </span>
                            </div>
                            <div className={`h-2.5 w-full rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${Math.max(4, Math.min(100, healthPct))}%`, backgroundColor: ringColor }}
                              />
                            </div>
                          </div>
                        )}

                        <div className={`text-[11px] flex flex-wrap items-center gap-2 font-mono ${textMuted}`}>
                          <span>{batt.manufacturer || 'Unknown OEM'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{batt.name || batt.id}</span>
                          {batt.chemistry && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{batt.chemistry}</span>
                            </>
                          )}
                          {batt.serialNumber && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>S/N: {batt.serialNumber}</span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span>{batteryData.sourceMethod}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {Array.isArray(batteryData.capacityHistory) && batteryData.capacityHistory.length > 0 && (
                  <div className="space-y-2">
                    <div className={`text-xs font-bold ${textPrimary}`}>
                      {isEn ? 'Recent Battery Capacity History' : 'تاریخچه روند تغییر ظرفیت باتری'}
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className={`border-b text-start ${isLightMode ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
                            <th className="py-2 px-3 text-start font-semibold">{isEn ? 'Date / Period' : 'تاریخ'}</th>
                            <th className="py-2 px-3 text-end font-semibold">{isEn ? 'Full Charge Capacity' : 'ظرفیت کامل ثبت‌شده'}</th>
                            <th className="py-2 px-3 text-end font-semibold">{isEn ? 'Design Capacity' : 'ظرفیت کارخانه'}</th>
                            <th className="py-2 px-3 text-end font-semibold">{isEn ? 'Health %' : 'درصد سلامت'}</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                          {batteryData.capacityHistory.map((h: any, idx: number) => (
                            <tr key={`${h.period}-${idx}`}>
                              <td className={`py-2 px-3 font-mono tabular-nums ${textPrimary}`}>{h.period}</td>
                              <td className={`py-2 px-3 text-end font-mono tabular-nums ${textPrimary}`}>
                                {Number(h.fullChargeCapacityMwh).toLocaleString()} mWh
                              </td>
                              <td className={`py-2 px-3 text-end font-mono tabular-nums ${textMuted}`}>
                                {Number(h.designCapacityMwh).toLocaleString()} mWh
                              </td>
                              <td className={`py-2 px-3 text-end font-mono tabular-nums font-bold ${
                                (h.healthPercent ?? 0) >= 80 ? 'text-emerald-500' : (h.healthPercent ?? 0) >= 60 ? 'text-amber-500' : 'text-rose-500'
                              }`}>
                                {h.healthPercent !== null ? `${h.healthPercent}%` : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ACTIVE DIRECTORY DOMAIN ACCOUNT INSPECTOR (net user <USERNAME> /domain) */}
          <div className={`rounded-xl border p-4 sm:p-5 space-y-5 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-sky-500" />
                  <h2 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn
                      ? 'Active Directory Domain Account Inspector (net user /domain)'
                      : 'بررسی وضعیت اکانت دامین کاربر (آخرین تغییر پسورد، انقضا، قفل حساب و گروه‌ها)'}
                  </h2>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    fieldName={isEn ? 'Domain Account Lookup' : 'استعلام اکانت دامین'}
                    whatIsIt={
                      isEn
                        ? 'Queries Active Directory from the domain-joined workstation using net user <username> /domain plus ADSI lockout state.'
                        : 'وضعیت اکانت کاربری را از طریق سیستم عضو دامین با دستور net user USERNAME /domain و بررسی ADSI Lockout استعلام می‌گیرد.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Quickly reveals expired passwords, locked accounts, last logon time, and AD group memberships during login troubleshooting.'
                        : 'بلافاصله مشخص می‌کند آیا پسورد کاربر منقضی شده، اکانت قفل (Locked) شده، آخرین بار چه زمانی رمز عوض کرده و عضو کدام گروه‌ها است.'
                    }
                    example={
                      isEn
                        ? 'Username: m.shahbazi → Password Last Set, Expires, Active/Locked, Global & Local Groups'
                        : 'نام کاربری: m.shahbazi ← نمایش تاریخ آخرین تغییر رمز، انقضا، وضعیت قفل و لیست کامل گروه‌ها'
                    }
                  />
                </div>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {isEn
                    ? 'Inspect password last set, expiration state, lockout flag, last logon, and Local/Global group memberships.'
                    : 'بررسی تاریخ آخرین تغییر پسورد، وضعیت انقضا، قفل بودن حساب، آخرین لاگین و عضویت گروه‌های Local و Global در اکتیو دایرکتوری.'}
                </p>
              </div>
              {!canInspectDomainUsers && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-500">
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Requires canInspectHelpdeskDomainUsers' : 'نیازمند مجوز canInspectHelpdeskDomainUsers'}</span>
                </span>
              )}
            </div>

            <form onSubmit={handleInspectDomainUser} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px] max-w-md">
                <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
                  {isEn ? 'Domain Username (sAMAccountName)' : 'نام کاربری دامین (بدون نام دامین)'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={domainQueryUser}
                  onChange={(e) => setDomainQueryUser(e.target.value)}
                  placeholder="j.smith"
                  className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                />
              </div>
              <button
                type="submit"
                disabled={!canInspectDomainUsers || loadingDomainUser}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
              >
                {loadingDomainUser ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <span>{isEn ? 'Inspect Domain Account' : 'استعلام اکانت دامین'}</span>
              </button>
            </form>

            {domainUserError && (
              <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-500 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{domainUserError}</span>
              </div>
            )}

            {domainUserData && !domainUserData.found && (
              <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs space-y-2">
                <div className="font-bold text-amber-500 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>
                    {isEn
                      ? `Domain user "${domainUserData.username}" was not found or the endpoint cannot reach a Domain Controller.`
                      : `اکانت دامین «${domainUserData.username}» یافت نشد یا سیستم به Domain Controller دسترسی ندارد.`}
                  </span>
                </div>
                {domainUserData.rawOutput && (
                  <pre dir="ltr" className={`p-3 rounded-lg border font-mono text-[11px] overflow-x-auto ${subSurfaceBg} ${textMuted}`}>
                    {domainUserData.rawOutput}
                  </pre>
                )}
              </div>
            )}

            {domainUserData && domainUserData.found && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
                    <div className={textMuted}>{isEn ? 'User & Full Name' : 'نام کاربری و نام کامل'}</div>
                    <div className={`mt-1 font-bold font-mono ${textPrimary}`}>{domainUserData.username}</div>
                    <div className={`mt-0.5 truncate ${textMuted}`}>{domainUserData.fullName || '-'}</div>
                  </div>

                  <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
                    <div className={textMuted}>{isEn ? 'Account Status & Lockout' : 'وضعیت فعال و قفل اکانت'}</div>
                    <div className={`mt-1 font-bold ${
                      String(domainUserData.accountActive).toLowerCase() === 'yes' ? 'text-emerald-500' : 'text-rose-500'
                    }`}>
                      {isEn ? 'Active' : 'فعال'}: {domainUserData.accountActive || '-'}
                    </div>
                    <div className={`mt-0.5 font-semibold ${
                      domainUserData.accountLocked === true
                        ? 'text-rose-500'
                        : domainUserData.accountLocked === false
                        ? 'text-emerald-500'
                        : textMuted
                    }`}>
                      {domainUserData.accountLocked === true
                        ? isEn
                          ? 'LOCKED OUT'
                          : 'قفل‌شده (Locked)'
                        : domainUserData.accountLocked === false
                        ? isEn
                          ? 'Unlocked'
                          : 'باز (قفل نیست)'
                        : isEn
                        ? 'Lockout: N/A'
                        : 'وضعیت قفل نامشخص'}
                    </div>
                  </div>

                  <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
                    <div className={textMuted}>{isEn ? 'Password Status' : 'وضعیت پسورد'}</div>
                    <div className={`mt-1 font-bold ${
                      domainUserData.passwordStatus === 'expired' || domainUserData.passwordStatus === 'must_change'
                        ? 'text-rose-500'
                        : domainUserData.passwordStatus === 'active' || domainUserData.passwordStatus === 'never_expires'
                        ? 'text-emerald-500'
                        : textMuted
                    }`}>
                      {domainUserData.passwordStatus === 'expired'
                        ? isEn
                          ? 'Expired'
                          : 'منقضی شده (Expired)'
                        : domainUserData.passwordStatus === 'must_change'
                        ? isEn
                          ? 'Must Change at Next Logon'
                          : 'اجبار به تغییر در ورود بعدی'
                        : domainUserData.passwordStatus === 'never_expires'
                        ? isEn
                          ? 'Active (Never Expires)'
                          : 'فعال (بدون انقضا)'
                        : domainUserData.passwordStatus === 'active'
                        ? isEn
                          ? 'Valid / Active'
                          : 'معتبر و فعال'
                        : isEn
                        ? 'Unknown'
                        : 'نامشخص'}
                    </div>
                    <div className={`mt-0.5 text-[11px] font-mono ${textMuted}`} dir="ltr">
                      {isEn ? 'Exp' : 'انقضا'}: {domainUserData.passwordExpires || '-'}
                    </div>
                  </div>

                  <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
                    <div className={textMuted}>{isEn ? 'Last Password Set / Logon' : 'آخرین تغییر رمز / آخرین لاگین'}</div>
                    <div className={`mt-1 font-mono text-[11px] font-semibold ${textPrimary}`} dir="ltr">
                      {domainUserData.passwordLastSet || '-'}
                    </div>
                    <div className={`mt-0.5 font-mono text-[11px] ${textMuted}`} dir="ltr">
                      {isEn ? 'Logon' : 'لاگین'}: {domainUserData.lastLogon || '-'}
                    </div>
                  </div>
                </div>

                {/* Group Memberships */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                  <div className={`p-4 rounded-xl border space-y-2.5 ${subSurfaceBg}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-bold ${textPrimary}`}>
                        {isEn
                          ? `Global Group Memberships (${domainUserData.globalGroups?.length || 0})`
                          : `عضویت در گروه‌های Global دامین (${domainUserData.globalGroups?.length || 0})`}
                      </span>
                      {(domainUserData.globalGroups?.length || 0) > 6 && (
                        <input
                          type="text"
                          value={domainGroupFilter}
                          onChange={(e) => setDomainGroupFilter(e.target.value)}
                          placeholder={isEn ? 'Filter groups...' : 'فیلتر گروه...'}
                          className={`px-2 py-1 rounded-md border text-[11px] outline-none w-36 ${inputCls}`}
                        />
                      )}
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {(domainUserData.globalGroups || [])
                        .filter((g: string) => !domainGroupFilter.trim() || g.toLowerCase().includes(domainGroupFilter.trim().toLowerCase()))
                        .map((g: string, idx: number) => (
                          <div key={`gg-${g}-${idx}`} className={`px-2.5 py-1.5 rounded-md border font-mono ${surfaceBg} ${textPrimary}`} dir="ltr">
                            {g}
                          </div>
                        ))}
                      {(domainUserData.globalGroups?.length || 0) === 0 && (
                        <div className={textMuted}>{isEn ? 'No Global groups listed.' : 'گروه Global ثبت نشده است.'}</div>
                      )}
                    </div>
                  </div>

                  <div className={`p-4 rounded-xl border space-y-2.5 ${subSurfaceBg}`}>
                    <div className={`font-bold ${textPrimary}`}>
                      {isEn
                        ? `Local Group Memberships (${domainUserData.localGroups?.length || 0})`
                        : `عضویت در گروه‌های Local (${domainUserData.localGroups?.length || 0})`}
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {(domainUserData.localGroups || []).map((g: string, idx: number) => (
                        <div key={`lg-${g}-${idx}`} className={`px-2.5 py-1.5 rounded-md border font-mono ${surfaceBg} ${textPrimary}`} dir="ltr">
                          {g}
                        </div>
                      ))}
                      {(domainUserData.localGroups?.length || 0) === 0 && (
                        <div className={textMuted}>{isEn ? 'No Local groups listed.' : 'گروه Local ثبت نشده است.'}</div>
                      )}
                    </div>
                  </div>
                </div>

                {domainUserData.rawOutput && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowRawDomainUser((v) => !v)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-sky-500 hover:underline cursor-pointer"
                    >
                      {showRawDomainUser ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      <span>
                        {showRawDomainUser
                          ? isEn
                            ? 'Hide Raw net user /domain Output'
                            : 'بستن خروجی خام net user /domain'
                          : isEn
                          ? 'Show Full net user /domain Output'
                          : 'مشاهده خروجی کامل net user /domain'}
                      </span>
                    </button>
                    {showRawDomainUser && (
                      <pre
                        dir="ltr"
                        className={`mt-2 p-3.5 rounded-xl border font-mono text-[11px] overflow-x-auto max-h-64 ${subSurfaceBg} ${textMuted}`}
                      >
                        {domainUserData.rawOutput}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 6B: WORKSTATION USER LOGINS, LAST LOGIN & ACTIVE SESSIONS       */}
      {/* =================================================================== */}
      {activeSubTab === 'logins' && (
        <div className="space-y-6">
          {/* Controls Header */}
          <div className={`rounded-xl border p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-sky-500 shrink-0" />
                  <h2 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn
                      ? 'Workstation User Login History, Last Login & Active Session Report'
                      : 'گزارش ورود و خروج کاربران، آخرین زمان لاگین و نشست‌های فعال سیستم'}
                  </h2>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    fieldName={isEn ? 'Workstation Login & Session Telemetry' : 'تله‌متری ورود و نشست کاربران سیستم'}
                    whatIsIt={
                      isEn
                        ? 'Inspects active interactive/RDP sessions (quser, Win32_LogonSession, LogonUI lock state), per-user local/domain profiles (ProfileList & Win32_NetworkLoginProfile), and Security/TerminalServices logon audit events.'
                        : 'نشست‌های فعال کنسول/RDP، وضعیت قفل صفحه (LogonUI)، آخرین ورود ثبت‌شده هر کاربر در سیستم (ProfileList و NetworkLoginProfile) و رویدادهای Security/TerminalServices را هم‌زمان استخراج می‌کند.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Lets technicians immediately verify whether anyone is currently logged into the workstation, who logged in last, and audit interactive, RDP, lock/unlock, or failed password attempts.'
                        : 'به کارشناس نشان می‌دهد آیا در همین لحظه کاربری روی سیستم لاگین است یا خیر، آخرین ورود هر کاربر چه زمانی بوده و تاریخچه ورود، خروج، قفل، RDP و تلاش‌های ناموفق را دقیق بررسی می‌کند.'
                    }
                    example={
                      isEn
                        ? 'Active: CORP\\a.rezaei (Console) · Last Logons: 4624/4625/4800/4801 · WinRM LogonType 3 noise filtered'
                        : 'کاربر فعال: CORP\\a.rezaei (Console) · رویدادها: ورود، خروج، قفل/بازگشایی و خطای رمز بدون شلوغی نشست WinRM'
                    }
                  />
                </div>
                <p className={`text-xs mt-1 ${textMuted}`}>
                  {isEn
                    ? 'Shows who is logged in right now (or if no user is signed in), last login timestamps per user, and interactive/RDP login history. All HelpDesk operations are recorded in Audit & Command Logs.'
                    : 'نمایش دقیق اینکه آیا در حال حاضر کاربری لاگین است یا خیر، چه کاربری و چه ساعتی آخرین بار وارد شده و تاریخچه کامل ورود/خروج؛ تمامی عملیات این بخش نیز در Audit & Command Logs ثبت می‌گردد.'}
                </p>
              </div>

              <button
                type="button"
                disabled={loadingLogons || !canRunDiagnostics}
                onClick={() => handleInspectLogons()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
              >
                {loadingLogons ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>
                  {isEn ? 'Inspect User Logins & Sessions' : 'دریافت گزارش ورود و نشست کاربران'}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-3">
                <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                  {isEn ? 'History Timeframe' : 'بازه زمانی گزارش'}
                </label>
                <select
                  value={logonsHoursBack}
                  onChange={(e) => {
                    const nextHours = Number(e.target.value);
                    setLogonsHoursBack(nextHours);
                    if (logonsData && targetIp.trim() && username.trim() && password) {
                      handleInspectLogons(nextHours);
                    }
                  }}
                  className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value={24}>{isEn ? 'Last 24 Hours' : '۲۴ ساعت اخیر'}</option>
                  <option value={48}>{isEn ? 'Last 48 Hours' : '۴۸ ساعت اخیر'}</option>
                  <option value={168}>{isEn ? 'Last 7 Days' : '۷ روز اخیر'}</option>
                  <option value={336}>{isEn ? 'Last 14 Days' : '۱۴ روز اخیر'}</option>
                  <option value={720}>{isEn ? 'Last 30 Days' : '۳۰ روز اخیر'}</option>
                </select>
              </div>

              <div className="lg:col-span-6">
                <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                  {isEn ? 'Search User, Source IP, Event ID or Reason' : 'جستجو بر اساس کاربر، IP مبدأ، کد رویداد یا دلیل'}
                </label>
                <div className="relative">
                  <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-2.5 ${textMuted}`} />
                  <input
                    type="text"
                    value={logonsSearch}
                    onChange={(e) => setLogonsSearch(e.target.value)}
                    placeholder={
                      isEn ? 'e.g. a.rezaei, 192.168.10.20, 4625, RDP...' : 'مثلاً a.rezaei، 192.168.10.20، 4625، ریموت...'
                    }
                    className={`w-full ps-8 pe-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                  />
                </div>
              </div>

              <div className="lg:col-span-3 flex items-center justify-end">
                <div
                  className={`w-full px-3 py-1.5 rounded-lg border text-[11px] flex items-center gap-1.5 ${subSurfaceBg} ${textMuted}`}
                >
                  <ScrollText className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                  <span className="truncate">
                    {isEn ? 'Audited in Audit & Command Logs (HelpDesk)' : 'ثبت خودکار در Audit & Command Logs'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {logonsError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 flex items-start gap-3 text-xs text-rose-500">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold">
                  {isEn ? 'Workstation Login Inspection Error' : 'خطا در دریافت گزارش ورود کاربران سیستم'}
                </div>
                <div className={isLightMode ? 'text-rose-800' : 'text-rose-200'}>{logonsError}</div>
              </div>
            </div>
          )}

          {!logonsData && !loadingLogons && (
            <div className={`rounded-xl border p-10 text-center space-y-3 ${surfaceBg}`}>
              <History className="w-10 h-10 mx-auto text-sky-500 opacity-85" />
              <div className={`text-sm font-bold ${textPrimary}`}>
                {isEn
                  ? 'Ready to Audit Workstation Logins & Active User Presence'
                  : 'آماده دریافت گزارش ورود، آخرین لاگین و وضعیت لحظه‌ای نشست کاربران'}
              </div>
              <p className={`text-xs max-w-xl mx-auto ${textMuted}`}>
                {isEn
                  ? 'Enter the target workstation IP and ephemeral credentials above, then click "Connect & Inspect" to inspect active user presence, lock/logoff controls, remote power control, and logon history.'
                  : 'آدرس IP سیستم و مشخصات اتصال موقت را در بالا وارد کرده و دکمه «اتصال و پایش» را بزنید تا وضعیت حضور کاربر، کنترل قفل/خروج، کنترل پاور و تاریخچه لاگین‌ها نمایش داده شود.'}
              </p>
            </div>
          )}

          {loadingLogons && (
            <div className={`rounded-xl border p-10 text-center space-y-3 ${surfaceBg}`}>
              <Loader2 className="w-8 h-8 mx-auto text-sky-500 animate-spin" />
              <div className={`text-sm font-semibold ${textPrimary}`}>
                {isEn
                  ? `Collecting active sessions, user profiles, and logon events from ${targetIp}...`
                  : `در حال جمع‌آوری نشست‌های فعال، پروفایل‌ها و تاریخچه ورود کاربران از ${targetIp}...`}
              </div>
            </div>
          )}

          {logonsData && !loadingLogons && (
            <div className="space-y-5">
              {/* Live Presence Answer Banner with Integrated Lock Screen & Sign Out Controls */}
              <div
                className={`rounded-xl border p-5 space-y-4 ${
                  logonsData.isAnyoneLoggedIn
                    ? logonsData.isScreenLocked
                      ? isLightMode
                        ? 'bg-amber-50/90 border-amber-300'
                        : 'bg-amber-950/25 border-amber-500/40'
                      : isLightMode
                      ? 'bg-emerald-50/90 border-emerald-300'
                      : 'bg-emerald-950/25 border-emerald-500/40'
                    : isLightMode
                    ? 'bg-slate-50 border-slate-300'
                    : 'bg-slate-900/80 border-slate-700'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                        logonsData.isAnyoneLoggedIn
                          ? logonsData.isScreenLocked
                            ? 'bg-amber-500/15 text-amber-500'
                            : 'bg-emerald-500/15 text-emerald-500'
                          : 'bg-slate-500/15 text-slate-500'
                      }`}
                    >
                      {logonsData.isAnyoneLoggedIn ? (
                        logonsData.isScreenLocked ? (
                          <Lock className="w-5 h-5" />
                        ) : (
                          <UserCheck className="w-5 h-5" />
                        )
                      ) : (
                        <UserX className="w-5 h-5" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-sm font-bold ${
                            logonsData.isAnyoneLoggedIn
                              ? logonsData.isScreenLocked
                                ? isLightMode
                                  ? 'text-amber-900'
                                  : 'text-amber-300'
                                : isLightMode
                                ? 'text-emerald-900'
                                : 'text-emerald-300'
                              : textPrimary
                          }`}
                        >
                          {logonsData.isAnyoneLoggedIn
                            ? logonsData.isScreenLocked
                              ? isEn
                                ? 'User Session Present — Screen Currently Locked'
                                : 'کاربر روی سیستم لاگین است (صفحه در حال حاضر قفل است)'
                              : isEn
                              ? 'User Currently Logged In (Active Session)'
                              : 'هم‌اکنون کاربر روی سیستم لاگین است (نشست فعال)'
                            : isEn
                            ? 'No User Currently Logged In'
                            : 'هم‌اکنون هیچ کاربری روی این سیستم لاگین نیست'}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-mono border ${
                            isLightMode
                              ? 'bg-white/80 border-slate-300 text-slate-700'
                              : 'bg-slate-950/70 border-slate-700 text-slate-300'
                          }`}
                          dir="ltr"
                        >
                          {logonsData.hostname || logonsData.targetIp} ({logonsData.osFamily?.toUpperCase()})
                        </span>
                      </div>

                      <div className={`text-xs ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                        {logonsData.isAnyoneLoggedIn ? (
                          <>
                            <span>
                              {isEn ? 'Current logged-in user: ' : 'کاربر فعلی لاگین‌شده: '}
                            </span>
                            <span className="font-bold font-mono" dir="ltr">
                              {logonsData.activeLoggedInUser ||
                                logonsData.activeSessions?.[0]?.username ||
                                '—'}
                            </span>
                            {logonsData.summary?.activeUsersCount > 1 && (
                              <span className="ms-2">
                                {isEn
                                  ? `(+${logonsData.summary.activeUsersCount - 1} other active session)`
                                  : `(+${logonsData.summary.activeUsersCount - 1} نشست فعال دیگر)`}
                              </span>
                            )}
                          </>
                        ) : (
                          <span>
                            {isEn
                              ? 'The workstation is currently at the sign-in screen or idle with zero interactive/RDP user sessions.'
                              : 'هیچ نشست فعال یا قفل‌شده‌ای از کاربران روی کنسول یا RDP باز نیست (سیستم در صفحه Sign-In است).'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
                    <div className={`text-xs space-y-0.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                      <div>
                        <span className={textMuted}>{isEn ? 'Most Recent Login: ' : 'آخرین لاگین ثبت‌شده: '}</span>
                        <span className={`font-bold font-mono ${textPrimary}`} dir="ltr">
                          {logonsData.summary?.lastLoginUser || '—'}
                        </span>
                      </div>
                      <div className="font-mono text-[11px]" dir="ltr">
                        {formatLogonTimestamp(logonsData.summary?.lastLoginTime)}
                      </div>
                    </div>

                    {/* Interactive Lock Screen & Sign Out Controls inside Presence Box */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!canExecuteActions || sessionActionBusy !== null || !logonsData.isAnyoneLoggedIn}
                        onClick={() =>
                          handleUserSessionAction(
                            'lock',
                            logonsData?.activeSessions?.[0]?.sessionId,
                            logonsData?.activeLoggedInUser || logonsData?.activeSessions?.[0]?.username,
                            'quick:lock'
                          )
                        }
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/50 text-xs font-semibold transition cursor-pointer disabled:opacity-45 ${
                          isLightMode
                            ? 'bg-white/90 hover:bg-amber-100 text-amber-800'
                            : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300'
                        }`}
                      >
                        {sessionActionBusy === 'quick:lock' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Lock className="w-3.5 h-3.5" />
                        )}
                        <span>{isEn ? 'Lock Screen' : 'قفل صفحه'}</span>
                      </button>

                      {confirmLogoffKey === 'quick:logoff' ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={!canExecuteActions || sessionActionBusy !== null}
                            onClick={() =>
                              handleUserSessionAction(
                                'logoff',
                                logonsData?.activeSessions?.[0]?.sessionId,
                                logonsData?.activeLoggedInUser || logonsData?.activeSessions?.[0]?.username,
                                'quick:logoff'
                              )
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition cursor-pointer"
                          >
                            {sessionActionBusy === 'quick:logoff' ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <LogOut className="w-3.5 h-3.5" />
                            )}
                            <span>{isEn ? 'Confirm Logoff' : 'تأیید خروج'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmLogoffKey(null)}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${
                              isLightMode ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-900 border-slate-700 text-slate-300'
                            }`}
                          >
                            {isEn ? 'Cancel' : 'انصراف'}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={!canExecuteActions || sessionActionBusy !== null || !logonsData.isAnyoneLoggedIn}
                          onClick={() => setConfirmLogoffKey('quick:logoff')}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/50 text-xs font-semibold transition cursor-pointer disabled:opacity-45 ${
                            isLightMode
                              ? 'bg-white/90 hover:bg-rose-100 text-rose-700'
                              : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300'
                          }`}
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Sign Out (Logoff)' : 'خروج کاربر (Logoff)'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {sessionActionError && (
                  <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-500 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{sessionActionError}</span>
                  </div>
                )}

                {sessionActionResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center gap-2 font-semibold ${
                      sessionActionResult.success
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                        : 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                    }`}
                  >
                    {sessionActionResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span>{isEn ? sessionActionResult.message : sessionActionResult.messageFa}</span>
                  </div>
                )}
              </div>

              {/* Workstation Power Control Directly Beneath the Presence Banner */}
              <div className={`rounded-xl border p-4 sm:p-5 space-y-3 ${surfaceBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className={`text-xs font-bold flex items-center gap-2 ${textPrimary}`}>
                    <PowerOff className="w-4 h-4 text-rose-500" />
                    <span>
                      {isEn
                        ? 'Workstation Power Control (Immediate / Scheduled Restart & Shutdown)'
                        : 'کنترل پاور ایستگاه کاری (ری‌استارت و خاموشی فوری یا زمان‌بندی‌شده)'}
                    </span>
                  </div>
                  {!canPowerControl && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500">
                      <Lock className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Power commands require canPowerControlHelpdeskEndpoints' : 'عملیات پاور نیازمند مجوز canPowerControlHelpdeskEndpoints است'}</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-4">
                    <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
                      {isEn ? 'Power Operation' : 'نوع عملیات پاور'}
                    </label>
                    <select
                      value={powerAction}
                      onChange={(e) => {
                        setPowerAction(e.target.value as any);
                        setConfirmPowerAction(false);
                      }}
                      className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                    >
                      <option value="restart_now">{isEn ? 'Immediate Forced Restart (shutdown /r /f /t 5)' : 'ری‌استارت فوری و اجباری (۵ ثانیه)'}</option>
                      <option value="restart_scheduled">{isEn ? 'Scheduled Restart (Custom Delay)' : 'ری‌استارت زمان‌بندی‌شده (با تأخیر دلخواه)'}</option>
                      <option value="shutdown_force">{isEn ? 'Immediate Forced Shutdown (shutdown /s /f /t 5)' : 'خاموش کردن فوری و اجباری (۵ ثانیه)'}</option>
                      <option value="shutdown_scheduled">{isEn ? 'Scheduled Shutdown (Custom Delay)' : 'خاموش کردن زمان‌بندی‌شده (با تأخیر دلخواه)'}</option>
                      <option value="abort">{isEn ? 'Cancel Pending Shutdown / Restart (shutdown /a)' : 'لغو خاموشی / ری‌استارت زمان‌بندی‌شده (shutdown /a)'}</option>
                    </select>
                  </div>

                  {(powerAction === 'restart_scheduled' || powerAction === 'shutdown_scheduled') && (
                    <div className="md:col-span-2">
                      <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
                        {isEn ? 'Delay (Minutes)' : 'زمان‌بندی (دقیقه)'}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        value={powerDelayMinutes}
                        onChange={(e) => setPowerDelayMinutes(Math.max(1, Math.min(1440, Number(e.target.value) || 1)))}
                        className={`w-full px-3 py-2 rounded-lg border text-xs font-mono tabular-nums outline-none ${inputCls}`}
                      />
                    </div>
                  )}

                  {powerAction !== 'abort' && (
                    <div className={powerAction === 'restart_scheduled' || powerAction === 'shutdown_scheduled' ? 'md:col-span-3' : 'md:col-span-5'}>
                      <label className={`block text-xs font-medium mb-1.5 ${textMuted}`}>
                        {isEn ? 'User Notification Message (Optional)' : 'پیام نمایشی به کاربر (اختیاری)'}
                      </label>
                      <input
                        type="text"
                        maxLength={120}
                        value={powerReason}
                        onChange={(e) => setPowerReason(e.target.value)}
                        placeholder="IT HelpDesk Remote Maintenance"
                        className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                      />
                    </div>
                  )}

                  <div className={powerAction === 'abort' ? 'md:col-span-8 flex justify-end' : 'md:col-span-3 flex justify-end'}>
                    {powerAction === 'abort' ? (
                      <button
                        type="button"
                        disabled={!canPowerControl || runningPower}
                        onClick={handleExecutePowerControl}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                      >
                        {runningPower ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        <span>{isEn ? 'Cancel Scheduled Power Action' : 'لغو زمان‌بندی (shutdown /a)'}</span>
                      </button>
                    ) : confirmPowerAction ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={!canPowerControl || runningPower}
                          onClick={handleExecutePowerControl}
                          className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition cursor-pointer"
                        >
                          {runningPower ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : isEn ? (
                            'Confirm Execute'
                          ) : (
                            'تأیید قطعی اجرا'
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmPowerAction(false)}
                          className={`px-2.5 py-2 rounded-lg border text-xs cursor-pointer ${isLightMode ? 'border-slate-300 text-slate-700' : 'border-slate-700 text-slate-300'}`}
                        >
                          {isEn ? 'Cancel' : 'انصراف'}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={!canPowerControl || runningPower}
                        onClick={() => setConfirmPowerAction(true)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 disabled:opacity-50 text-xs font-semibold transition cursor-pointer"
                      >
                        {!canPowerControl ? <Lock className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                        <span>{isEn ? 'Issue Power Command' : 'ارسال دستور پاور'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {powerError && (
                  <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-500 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{powerError}</span>
                  </div>
                )}

                {powerResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center gap-2 font-semibold ${
                      powerResult.success
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                        : 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                    }`}
                  >
                    {powerResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span>{isEn ? powerResult.message : powerResult.messageFa}</span>
                  </div>
                )}
              </div>

              {/* 5 Summary KPI Cards */}
              <div className={`rounded-xl border p-4 grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs ${surfaceBg}`}>
                <div className={`p-3 rounded-lg border ${subSurfaceBg}`}>
                  <div className={textMuted}>{isEn ? 'Active Logged-In Now' : 'لاگین فعال هم‌اکنون'}</div>
                  <div className="mt-1 text-lg font-bold font-mono tabular-nums text-emerald-500">
                    {logonsData.summary?.activeUsersCount ?? 0}
                  </div>
                </div>

                <div className={`p-3 rounded-lg border ${subSurfaceBg}`}>
                  <div className={textMuted}>{isEn ? 'Disconnected / Locked' : 'نشست قطع‌اتصال / قفل'}</div>
                  <div className="mt-1 text-lg font-bold font-mono tabular-nums text-amber-500">
                    {logonsData.summary?.disconnectedCount ?? 0}
                  </div>
                </div>

                <div className={`p-3 rounded-lg border ${subSurfaceBg}`}>
                  <div className={textMuted}>{isEn ? 'Distinct Users on PC' : 'کاربران شناخته‌شده سیستم'}</div>
                  <div className={`mt-1 text-lg font-bold font-mono tabular-nums ${textPrimary}`}>
                    {logonsData.summary?.distinctUsersCount ?? 0}
                  </div>
                </div>

                <div className={`p-3 rounded-lg border ${subSurfaceBg}`}>
                  <div className={textMuted}>{isEn ? `Successful Logins (${logonsHoursBack}h)` : `تعداد ورود موفق`}</div>
                  <div className="mt-1 text-lg font-bold font-mono tabular-nums text-sky-500">
                    {logonsData.summary?.totalLogonEvents ?? 0}
                  </div>
                </div>

                <div className={`col-span-2 lg:col-span-1 p-3 rounded-lg border ${subSurfaceBg}`}>
                  <div className={textMuted}>{isEn ? 'Failed Login Attempts' : 'ورودهای ناموفق'}</div>
                  <div
                    className={`mt-1 text-lg font-bold font-mono tabular-nums ${
                      (logonsData.summary?.totalFailedEvents ?? 0) > 0 ? 'text-rose-500' : textPrimary
                    }`}
                  >
                    {logonsData.summary?.totalFailedEvents ?? 0}
                  </div>
                </div>
              </div>

              {logonsData.securityLogAccessible === false && logonsData.securityLogNote && (
                <div
                  className={`rounded-xl border p-3.5 flex items-start gap-2.5 text-xs ${
                    isLightMode
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-amber-950/25 border-amber-500/30 text-amber-200'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>{logonsData.securityLogNote}</span>
                </div>
              )}

              {/* Section 1: Currently Logged-In & Live Sessions */}
              <div className={`rounded-xl border overflow-hidden ${surfaceBg}`}>
                <div className={`px-5 py-3.5 border-b flex items-center justify-between gap-2 ${subSurfaceBg}`}>
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-emerald-500" />
                    <h3 className={`text-xs font-bold ${textPrimary}`}>
                      {isEn
                        ? `Current Live Workstation Sessions (${logonsData.activeSessions?.length || 0})`
                        : `نشست‌های زنده و فعلی روی سیستم (${logonsData.activeSessions?.length || 0})`}
                    </h3>
                  </div>
                  <span className={`text-[11px] font-mono ${textMuted}`} dir="ltr">
                    {formatLogonTimestamp(logonsData.collectedAt)}
                  </span>
                </div>

                {(logonsData.activeSessions?.length || 0) === 0 ? (
                  <div className={`p-6 text-center text-xs ${textMuted}`}>
                    {isEn
                      ? 'No interactive or RDP user sessions are currently open on this workstation.'
                      : 'در این لحظه هیچ نشست کاربری فعالی (Console یا RDP) روی سیستم باز نیست.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-start">
                      <thead className={`border-b ${subSurfaceBg} ${textMuted}`}>
                        <tr>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'User' : 'نام کاربری'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'State' : 'وضعیت'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Session' : 'نشست'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Method' : 'نوع اتصال'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Logon Time' : 'زمان ورود'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Idle' : 'بیکاری'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Source IP' : 'IP مبدأ'}</th>
                          <th className="px-4 py-2.5 text-end font-semibold">{isEn ? 'Session Actions' : 'مدیریت نشست'}</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isLightMode ? 'divide-slate-200' : 'divide-slate-800'}`}>
                        {logonsData.activeSessions.map((sess: any, idx: number) => {
                          const rowKey = `row:${sess.sessionId || sess.username}:${idx}`;
                          const fullUser = sess.domain ? `${sess.domain}\\${sess.username}` : sess.username;
                          const isSystemZero = String(sess.sessionId) === '0';
                          return (
                            <tr key={`${sess.username}-${sess.sessionId}-${idx}`}>
                              <td className={`px-4 py-2.5 font-mono font-semibold ${textPrimary}`} dir="ltr">
                                <div>{fullUser}</div>
                                {sess.isCurrentConsoleOwner && (
                                  <span className="text-[10px] font-sans text-sky-500">
                                    {isEn ? 'Primary Console Owner' : 'مالک نشست کنسول'}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                                    sess.state === 'active'
                                      ? isLightMode
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                        : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                      : sess.state === 'locked'
                                      ? isLightMode
                                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                                        : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                      : isLightMode
                                      ? 'bg-slate-100 border-slate-300 text-slate-700'
                                      : 'bg-slate-800 border-slate-700 text-slate-300'
                                  }`}
                                >
                                  {sess.state === 'active'
                                    ? isEn
                                      ? 'Active'
                                      : 'فعال'
                                    : sess.state === 'locked'
                                    ? isEn
                                      ? 'Locked'
                                      : 'قفل‌شده'
                                    : sess.state === 'disconnected'
                                    ? isEn
                                      ? 'Disconnected'
                                      : 'قطع‌اتصال'
                                    : isEn
                                    ? 'Idle'
                                    : 'بیکار'}
                                </span>
                              </td>
                              <td className={`px-4 py-2.5 font-mono ${textMuted}`} dir="ltr">
                                {sess.sessionName || `ID:${sess.sessionId || '-'}`}
                              </td>
                              <td className={`px-4 py-2.5 ${textPrimary}`}>{sess.logonType || 'Console'}</td>
                              <td className={`px-4 py-2.5 font-mono tabular-nums ${textMuted}`} dir="ltr">
                                {sess.logonTime
                                  ? formatLogonTimestamp(sess.logonTime)
                                  : sess.logonTimeDisplay || '—'}
                              </td>
                              <td className={`px-4 py-2.5 font-mono ${textMuted}`} dir="ltr">
                                {sess.idleTime || '0'}
                              </td>
                              <td className={`px-4 py-2.5 font-mono ${textMuted}`} dir="ltr">
                                {sess.sourceIp || 'Local'}
                              </td>
                              <td className="px-4 py-2.5 text-end">
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    disabled={!canExecuteActions || sessionActionBusy !== null || isSystemZero}
                                    onClick={() => handleUserSessionAction('lock', sess.sessionId, fullUser, `${rowKey}:lock`)}
                                    title={isEn ? 'Lock this session screen' : 'قفل کردن صفحه این نشست'}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 disabled:opacity-40 text-[11px] font-semibold transition cursor-pointer"
                                  >
                                    {sessionActionBusy === `${rowKey}:lock` ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Lock className="w-3 h-3" />
                                    )}
                                    <span>{isEn ? 'Lock' : 'قفل'}</span>
                                  </button>

                                  {confirmLogoffKey === rowKey ? (
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={!canExecuteActions || sessionActionBusy !== null}
                                        onClick={() => handleUserSessionAction('logoff', sess.sessionId, fullUser, `${rowKey}:logoff`)}
                                        className="px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold cursor-pointer"
                                      >
                                        {sessionActionBusy === `${rowKey}:logoff` ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : isEn ? (
                                          'Confirm'
                                        ) : (
                                          'تأیید'
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmLogoffKey(null)}
                                        className={`px-1.5 py-1 rounded-md border text-[11px] cursor-pointer ${
                                          isLightMode ? 'border-slate-300 text-slate-700' : 'border-slate-700 text-slate-300'
                                        }`}
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={!canExecuteActions || sessionActionBusy !== null || isSystemZero}
                                      onClick={() => setConfirmLogoffKey(rowKey)}
                                      title={isEn ? 'Sign out / logoff this user session' : 'خارج کردن (Logoff) این نشست'}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 disabled:opacity-40 text-[11px] font-semibold transition cursor-pointer"
                                    >
                                      <LogOut className="w-3 h-3" />
                                      <span>{isEn ? 'Logoff' : 'خروج'}</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Section 2: Per-User Last Login Summary */}
              <div className={`rounded-xl border overflow-hidden ${surfaceBg}`}>
                <div className={`px-5 py-3.5 border-b flex items-center justify-between gap-2 ${subSurfaceBg}`}>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-sky-500" />
                    <h3 className={`text-xs font-bold ${textPrimary}`}>
                      {isEn
                        ? `Users & Last Login Summary (${filteredUserSummaries.length})`
                        : `خلاصه کاربران سیستم و آخرین زمان ورود (${filteredUserSummaries.length})`}
                    </h3>
                  </div>
                </div>

                {filteredUserSummaries.length === 0 ? (
                  <div className={`p-6 text-center text-xs ${textMuted}`}>
                    {isEn ? 'No matching workstation user profiles found.' : 'کاربر یا پروفایل مطابقی یافت نشد.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-start">
                      <thead className={`border-b ${subSurfaceBg} ${textMuted}`}>
                        <tr>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Username' : 'نام کاربر'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Status Now' : 'وضعیت فعلی'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Last Login' : 'آخرین ورود'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Last Logoff' : 'آخرین خروج'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Logins (Window / Total)' : 'تعداد ورود (بازه / کل)'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Failed' : 'ناموفق'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Last Source / Type' : 'آخرین مبدأ / نوع'}</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isLightMode ? 'divide-slate-200' : 'divide-slate-800'}`}>
                        {filteredUserSummaries.map((u: any, idx: number) => (
                          <tr key={`${u.username}-${u.sid}-${idx}`}>
                            <td className={`px-4 py-2.5 ${textPrimary}`}>
                              <div className="font-mono font-bold" dir="ltr">
                                {u.username}
                              </div>
                              {u.sid && (
                                <div className={`text-[10px] font-mono ${textMuted}`} dir="ltr">
                                  {u.sid}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              {u.isCurrentlyLoggedIn ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                                    u.currentState === 'locked'
                                      ? isLightMode
                                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                                        : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                      : u.currentState === 'disconnected'
                                      ? isLightMode
                                        ? 'bg-sky-50 border-sky-200 text-sky-700'
                                        : 'bg-sky-500/15 border-sky-500/30 text-sky-300'
                                      : isLightMode
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                  }`}
                                >
                                  {u.currentState === 'locked'
                                    ? isEn
                                      ? 'Logged In (Locked)'
                                      : 'لاگین (صفحه قفل)'
                                    : u.currentState === 'disconnected'
                                    ? isEn
                                      ? 'Disconnected Session'
                                      : 'نشست قطع‌اتصال'
                                    : isEn
                                    ? 'Logged In (Active)'
                                    : 'لاگین (فعال)'}
                                </span>
                              ) : (
                                <span className={`text-[11px] font-medium ${textMuted}`}>
                                  {isEn ? 'Offline' : 'آفلاین'}
                                </span>
                              )}
                            </td>
                            <td className={`px-4 py-2.5 font-mono tabular-nums ${textPrimary}`} dir="ltr">
                              {formatLogonTimestamp(u.lastLogonTime)}
                            </td>
                            <td className={`px-4 py-2.5 font-mono tabular-nums ${textMuted}`} dir="ltr">
                              {formatLogonTimestamp(u.lastLogoffTime)}
                            </td>
                            <td className={`px-4 py-2.5 font-mono tabular-nums ${textPrimary}`} dir="ltr">
                              {u.logonCountInWindow ?? 0} / {u.totalLogonsOnSystem || '—'}
                            </td>
                            <td
                              className={`px-4 py-2.5 font-mono tabular-nums font-semibold ${
                                (u.failedCountInWindow ?? 0) > 0 ? 'text-rose-500' : textMuted
                              }`}
                            >
                              {u.failedCountInWindow ?? 0}
                            </td>
                            <td className={`px-4 py-2.5 text-[11px] ${textMuted}`}>
                              <div className="font-mono" dir="ltr">
                                {u.lastSourceIp || 'Local'}
                              </div>
                              <div>{u.lastLogonType || '—'}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Section 3: Detailed Login / Logoff / Lock / RDP / Failed Event Timeline */}
              <div className={`rounded-xl border overflow-hidden ${surfaceBg}`}>
                <div
                  className={`px-5 py-3.5 border-b flex flex-wrap items-center justify-between gap-3 ${subSurfaceBg}`}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-indigo-500" />
                    <h3 className={`text-xs font-bold ${textPrimary}`}>
                      {isEn
                        ? `Detailed Login, Logoff & Lock Timeline (${filteredLogonEvents.length})`
                        : `تاریخچه دقیق ورود، خروج، قفل صفحه و RDP (${filteredLogonEvents.length})`}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: 'all' as const, en: 'All', fa: 'همه' },
                      { id: 'logon' as const, en: 'Logons', fa: 'ورودها' },
                      { id: 'logoff' as const, en: 'Logoffs', fa: 'خروج‌ها' },
                      { id: 'lock_unlock' as const, en: 'Lock / Unlock', fa: 'قفل / بازگشایی' },
                      { id: 'rdp' as const, en: 'RDP', fa: 'ریموت دسکتاپ' },
                      { id: 'failed' as const, en: 'Failed', fa: 'ناموفق' },
                    ].map((flt) => {
                      const active = logonsEventFilter === flt.id;
                      return (
                        <button
                          key={flt.id}
                          type="button"
                          onClick={() => setLogonsEventFilter(flt.id)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition cursor-pointer ${
                            active
                              ? 'border-sky-500 bg-sky-500/15 text-sky-500'
                              : isLightMode
                              ? 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-100'
                          }`}
                        >
                          {isEn ? flt.en : flt.fa}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {filteredLogonEvents.length === 0 ? (
                  <div className={`p-8 text-center text-xs ${textMuted}`}>
                    {isEn
                      ? 'No workstation login/session events matched this filter in the selected timeframe.'
                      : 'در این بازه زمانی و با این فیلتر، رویداد ورود یا خروجی یافت نشد.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[460px]">
                    <table className="w-full text-xs text-start">
                      <thead className={`border-b sticky top-0 z-10 ${subSurfaceBg} ${textMuted}`}>
                        <tr>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Time' : 'زمان دقیق'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Activity' : 'نوع رویداد'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'User' : 'کاربر'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Method' : 'روش ورود'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Source IP / Host' : 'مبدأ'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Event ID / Details' : 'کد و جزئیات'}</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isLightMode ? 'divide-slate-200' : 'divide-slate-800'}`}>
                        {filteredLogonEvents.map((ev: any) => {
                          const badgeMap: Record<string, { cls: string; en: string; fa: string; Icon: any }> = {
                            logon: {
                              cls: isLightMode
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
                              en: 'Logon',
                              fa: 'ورود موفق',
                              Icon: LogIn,
                            },
                            logoff: {
                              cls: isLightMode
                                ? 'bg-slate-100 border-slate-300 text-slate-700'
                                : 'bg-slate-800 border-slate-700 text-slate-300',
                              en: 'Logoff',
                              fa: 'خروج',
                              Icon: LogOut,
                            },
                            lock: {
                              cls: isLightMode
                                ? 'bg-amber-50 border-amber-200 text-amber-700'
                                : 'bg-amber-500/15 border-amber-500/30 text-amber-300',
                              en: 'Locked',
                              fa: 'قفل صفحه',
                              Icon: Lock,
                            },
                            unlock: {
                              cls: isLightMode
                                ? 'bg-sky-50 border-sky-200 text-sky-700'
                                : 'bg-sky-500/15 border-sky-500/30 text-sky-300',
                              en: 'Unlocked',
                              fa: 'بازگشایی قفل',
                              Icon: Unlock,
                            },
                            rdp_reconnect: {
                              cls: isLightMode
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300',
                              en: 'RDP Reconnect',
                              fa: 'اتصال مجدد RDP',
                              Icon: Monitor,
                            },
                            rdp_disconnect: {
                              cls: isLightMode
                                ? 'bg-orange-50 border-orange-200 text-orange-700'
                                : 'bg-orange-500/15 border-orange-500/30 text-orange-300',
                              en: 'RDP Disconnect',
                              fa: 'قطع نشست RDP',
                              Icon: Monitor,
                            },
                            failed: {
                              cls: isLightMode
                                ? 'bg-rose-50 border-rose-200 text-rose-700'
                                : 'bg-rose-500/15 border-rose-500/30 text-rose-300',
                              en: 'Failed Login',
                              fa: 'ورود ناموفق',
                              Icon: ShieldAlert,
                            },
                          };
                          const b = badgeMap[ev.eventType] || badgeMap.logon;
                          const EvIcon = b.Icon;
                          return (
                            <tr key={ev.id}>
                              <td className={`px-4 py-2.5 font-mono tabular-nums whitespace-nowrap ${textPrimary}`} dir="ltr">
                                {formatLogonTimestamp(ev.timestamp)}
                              </td>
                              <td className="px-4 py-2.5 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${b.cls}`}
                                >
                                  <EvIcon className="w-3 h-3" />
                                  <span>{isEn ? b.en : b.fa}</span>
                                </span>
                              </td>
                              <td className={`px-4 py-2.5 font-mono font-semibold ${textPrimary}`} dir="ltr">
                                {ev.domain ? `${ev.domain}\\${ev.username}` : ev.username}
                              </td>
                              <td className={`px-4 py-2.5 ${textPrimary}`}>
                                {isEn ? ev.logonTypeLabel : ev.logonTypeLabelFa}
                              </td>
                              <td className={`px-4 py-2.5 font-mono ${textMuted}`} dir="ltr">
                                {ev.sourceIp || ev.sourceHost || 'Local'}
                              </td>
                              <td className={`px-4 py-2.5 text-[11px] ${textMuted}`}>
                                <span className="font-mono" dir="ltr">
                                  ID {ev.eventId} · {ev.channel}
                                </span>
                                {ev.failureReason && (
                                  <div className="text-rose-500 font-medium mt-0.5">{ev.failureReason}</div>
                                )}
                                {!ev.failureReason && ev.sessionName && (
                                  <div className="font-mono mt-0.5" dir="ltr">
                                    {ev.sessionName}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* DEDICATED TAB: WINDOWS UPDATES, WSUS POLICY & SYSTEM INFO           */}
      {/* =================================================================== */}
      {activeSubTab === 'updates' && (
        <div className="space-y-6">
          {(updateStatusError || sysInfoError || updateActionError) && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 flex items-start gap-3 text-xs text-rose-500">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                {updateStatusError && <div>{updateStatusError}</div>}
                {sysInfoError && <div>{sysInfoError}</div>}
                {updateActionError && <div>{updateActionError}</div>}
              </div>
            </div>
          )}

          {updateActionResult && (
            <div
              className={`rounded-xl border p-4 space-y-2 text-xs ${
                updateActionResult.success
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-amber-500/40 bg-amber-500/10'
              }`}
            >
              <div
                className={`flex items-center gap-2 font-bold ${
                  updateActionResult.success ? 'text-emerald-500' : 'text-amber-500'
                }`}
              >
                {updateActionResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                <span>{isEn ? updateActionResult.message : updateActionResult.messageFa}</span>
              </div>
              {updateActionResult.rawOutput && (
                <pre
                  dir="ltr"
                  className={`p-3 rounded-lg border font-mono text-[11px] overflow-x-auto max-h-48 ${subSurfaceBg} ${textPrimary}`}
                >
                  {updateActionResult.rawOutput}
                </pre>
              )}
            </div>
          )}

          {/* Windows Update & WSUS Control Toolbar */}
          <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-sky-500" />
                  <h2 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn
                      ? 'Windows Updates, WSUS Policy & KB Management'
                      : 'مدیریت آپدیت‌های ویندوز، پالیسی WSUS و حذف/نصب KB'}
                  </h2>
                </div>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {isEn
                    ? 'Automatically follows workstation WSUS GPO if configured, or queries Microsoft Update directly over Internet.'
                    : 'در صورت اعمال پالیسی WSUS آخرین آپدیت‌ها را از سرور WSUS سازمانی دریافت می‌کند و در نبود WSUS مستقیماً از اینترنت (Microsoft Update) می‌گیرد.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={updateSourceMode}
                  onChange={(e) => setUpdateSourceMode(e.target.value as any)}
                  className={`px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="auto">
                    {isEn ? 'Auto (Follow WSUS Policy if set, else Internet)' : 'خودکار (طبق پالیسی WSUS یا اینترنت)'}
                  </option>
                  <option value="wsus">{isEn ? 'Force WSUS Server' : 'فقط سرور WSUS سازمانی'}</option>
                  <option value="internet">{isEn ? 'Direct Internet (Microsoft Update)' : 'اینترنت مستقیم (Microsoft Update)'}</option>
                </select>

                <button
                  type="button"
                  onClick={() => handleInspectUpdateStatus(updateSourceMode, true)}
                  disabled={!canRunDiagnostics || loadingUpdateStatus}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {loadingUpdateStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>{isEn ? 'Scan Pending Updates' : 'بررسی WSUS و آپدیت‌های جدید'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleInspectSysInfo}
                  disabled={!canRunDiagnostics || loadingSysInfo}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition disabled:opacity-50 cursor-pointer ${
                    isLightMode
                      ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                  }`}
                >
                  {loadingSysInfo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5 text-teal-500" />}
                  <span>{isEn ? 'Fetch System Info & Installed KBs' : 'مشخصات سیستم و آپدیت‌های نصب‌شده'}</span>
                </button>
              </div>
            </div>

            {/* WSUS & Agent Posture Cards */}
            {updateStatusData && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
                  <div className={textMuted}>{isEn ? 'Update Policy Source' : 'منبع سیاست آپدیت'}</div>
                  <div
                    className={`mt-1 font-bold ${
                      updateStatusData.wsusPolicy?.useWuServer ? 'text-sky-500' : 'text-emerald-500'
                    }`}
                  >
                    {updateStatusData.wsusPolicy?.useWuServer
                      ? isEn
                        ? 'WSUS Policy Active'
                        : 'سیاست WSUS فعال است'
                      : isEn
                      ? 'Microsoft Update (Internet)'
                      : 'مستقیم اینترنت (Microsoft Update)'}
                  </div>
                  <div className={`mt-0.5 font-mono text-[11px] truncate ${textMuted}`} dir="ltr" title={updateStatusData.wsusPolicy?.wuServer}>
                    {updateStatusData.wsusPolicy?.wuServer || (isEn ? 'No WUServer GPO' : 'بدون پالیسی WSUS')}
                    {updateStatusData.wsusPolicy?.targetGroup ? ` (${updateStatusData.wsusPolicy.targetGroup})` : ''}
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
                  <div className={textMuted}>{isEn ? 'Windows Update Service' : 'وضعیت سرویس آپدیت'}</div>
                  <div className={`mt-1 font-bold font-mono ${textPrimary}`}>
                    wuauserv: {updateStatusData.updateService?.wuauservStatus || '-'} ({updateStatusData.updateService?.wuauservStartType || '-'})
                  </div>
                  <div className={`mt-0.5 text-[11px] truncate ${textMuted}`}>
                    {updateStatusData.wsusPolicy?.auOptionsLabel || '-'}
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
                  <div className={textMuted}>{isEn ? 'Pending Reboot' : 'نیاز به ری‌استارت'}</div>
                  <div
                    className={`mt-1 font-bold ${
                      updateStatusData.pendingReboot?.required ? 'text-amber-500' : 'text-emerald-500'
                    }`}
                  >
                    {updateStatusData.pendingReboot?.required
                      ? isEn
                        ? 'Reboot Required'
                        : 'بله (سیستم منتظر ری‌استارت است)'
                      : isEn
                      ? 'No Reboot Pending'
                      : 'خیر (نیازی نیست)'}
                  </div>
                  <div className={`mt-0.5 text-[11px] truncate ${textMuted}`}>
                    {(updateStatusData.pendingReboot?.reasons || []).join(', ') || (isEn ? 'Clean state' : 'وضعیت عادی')}
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
                  <div className={textMuted}>{isEn ? 'Last Check / Pending Count' : 'آخرین بررسی و آپدیت منتظر'}</div>
                  <div className={`mt-1 font-bold font-mono tabular-nums ${textPrimary}`}>
                    {updateStatusData.pendingUpdates?.length || 0} {isEn ? 'Pending' : 'آپدیت در انتظار نصب'}
                  </div>
                  <div className={`mt-0.5 font-mono text-[11px] truncate ${textMuted}`} dir="ltr">
                    {isEn ? 'Checked' : 'بررسی'}: {updateStatusData.lastCheckTime || '-'}
                  </div>
                </div>
              </div>
            )}

            {/* Available / Pending Updates + Install Action */}
            {updateStatusData && (
              <div className="space-y-3 pt-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className={`text-xs font-bold ${textPrimary}`}>
                    {isEn
                      ? `Available Updates from ${updateStatusData.sourceScanned === 'wsus' ? 'WSUS' : 'Internet'} (${updateStatusData.pendingUpdates?.length || 0})`
                      : `آپدیت‌های آماده دریافت از ${updateStatusData.sourceScanned === 'wsus' ? 'سرور WSUS' : 'اینترنت'} (${updateStatusData.pendingUpdates?.length || 0} مورد)`}
                  </div>

                  <div className="flex items-center gap-2">
                    {!confirmInstallAllUpdates ? (
                      <button
                        type="button"
                        disabled={!canExecuteActions || installingUpdates !== null}
                        onClick={() => setConfirmInstallAllUpdates(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                      >
                        {installingUpdates === 'ALL' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isEn
                            ? `Download & Install Updates (${updateSourceMode.toUpperCase()})`
                            : `دریافت و نصب آپدیت‌ها (${updateSourceMode === 'auto' ? 'طبق پالیسی/WSUS' : updateSourceMode === 'wsus' ? 'WSUS' : 'اینترنت'})`}
                        </span>
                      </button>
                    ) : (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={installingUpdates !== null}
                          onClick={() => handleInstallUpdates()}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Confirm Download & Install' : 'تایید و شروع نصب آپدیت‌ها'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmInstallAllUpdates(false)}
                          className={`px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${
                            isLightMode ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-800 border-slate-700 text-slate-300'
                          }`}
                        >
                          {isEn ? 'Cancel' : 'انصراف'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {updateStatusData.scanNote && (
                  <div className={`p-3 rounded-lg border text-xs ${subSurfaceBg} ${textMuted}`}>
                    {updateStatusData.scanNote}
                  </div>
                )}

                {Array.isArray(updateStatusData.pendingUpdates) && updateStatusData.pendingUpdates.length > 0 ? (
                  <div className="max-h-64 overflow-y-auto overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-xs border-collapse">
                      <thead className={`sticky top-0 ${isLightMode ? 'bg-slate-50 text-slate-600' : 'bg-slate-900 text-slate-400'}`}>
                        <tr className="border-b border-slate-200 dark:border-slate-800">
                          <th className="py-2 px-3 text-start">{isEn ? 'Update Title' : 'عنوان آپدیت'}</th>
                          <th className="py-2 px-3 text-start">KB</th>
                          <th className="py-2 px-3 text-start">{isEn ? 'Severity' : 'اهمیت'}</th>
                          <th className="py-2 px-3 text-end">{isEn ? 'Size' : 'حجم'}</th>
                          <th className="py-2 px-3 text-end">{isEn ? 'Action' : 'نصب'}</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                        {updateStatusData.pendingUpdates.map((pu: any) => (
                          <tr key={pu.id}>
                            <td className={`py-2 px-3 ${textPrimary}`}>
                              <div className="font-semibold">{pu.title}</div>
                              <div className={`text-[11px] ${textMuted}`}>
                                {pu.isDownloaded ? (isEn ? 'Downloaded' : 'دانلود شده') : isEn ? 'Needs Download' : 'نیاز به دانلود'}
                                {pu.rebootRequired ? (isEn ? ' · Reboot required' : ' · نیازمند ری‌استارت') : ''}
                              </div>
                            </td>
                            <td className="py-2 px-3 font-mono text-sky-500">
                              {(pu.kbIds || []).join(', ') || '-'}
                            </td>
                            <td className={`py-2 px-3 ${textMuted}`}>{pu.severity || '-'}</td>
                            <td className={`py-2 px-3 text-end font-mono tabular-nums ${textMuted}`}>
                              {pu.sizeMb ? `${pu.sizeMb} MB` : '-'}
                            </td>
                            <td className="py-2 px-3 text-end">
                              {Array.isArray(pu.kbIds) && pu.kbIds[0] ? (
                                <button
                                  type="button"
                                  disabled={!canExecuteActions || installingUpdates !== null}
                                  onClick={() => handleInstallUpdates([pu.kbIds[0]])}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-[11px] font-semibold cursor-pointer"
                                >
                                  {installingUpdates === pu.kbIds[0] ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Download className="w-3 h-3" />
                                  )}
                                  <span>{isEn ? 'Install' : 'نصب'}</span>
                                </button>
                              ) : (
                                <span className={textMuted}>—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className={`p-4 rounded-xl border text-center text-xs ${subSurfaceBg} ${textMuted}`}>
                    {updateStatusData.scanSucceeded
                      ? isEn
                        ? 'No pending Windows updates reported from the selected source.'
                        : 'هیچ آپدیت منتظری در منبع انتخاب‌شده یافت نشد (سیستم بروز است).'
                      : isEn
                      ? 'Update scan did not list pending items. Click "Scan Pending Updates" to retry or check WSUS connectivity.'
                      : 'اسکن آپدیت موردی برنگرداند یا ارتباط با WSUS/اینترنت برقرار نشد.'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* DETAILED SYSTEM INFO, BOOT TIME & INSTALLED UPDATES (Moved from Health Tab + Uninstall KB) */}
          <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-sky-500" />
                  <h3 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn
                      ? 'Detailed System Info, Boot Time & Installed Updates (systeminfo)'
                      : 'مشخصات دقیق ویندوز، زمان آخرین بوت، رم، دامین و حذف/مدیریت آپدیت‌های نصب‌شده'}
                  </h3>
                </div>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {isEn
                    ? 'Exact OS build, last boot time, physical/virtual RAM, hardware serial, and installed HotFix KB list with safe KB uninstall.'
                    : 'نمایش نسخه دقیق ویندوز، زمان آخرین بوت، رم، دامین، سریال سخت‌افزار و لیست آپدیت‌های نصب‌شده (HotFix) با امکان حذف هر KB.'}
                </p>
              </div>
            </div>

            {!sysInfoData && !loadingSysInfo && (
              <div className={`p-6 rounded-xl border text-center text-xs ${subSurfaceBg} ${textMuted}`}>
                {isEn
                  ? 'Click "Connect & Inspect" above or "Fetch System Info & Installed KBs" to load OS build, boot time, and installed HotFixes.'
                  : 'برای مشاهده مشخصات کامل ویندوز و لیست آپدیت‌های نصب‌شده، روی «اتصال و پایش» یا دکمه «مشخصات سیستم و آپدیت‌های نصب‌شده» کلیک کنید.'}
              </div>
            )}

            {sysInfoData && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
                    <div className={textMuted}>{isEn ? 'Windows / OS Edition' : 'نسخه دقیق سیستم‌عامل'}</div>
                    <div className={`mt-1 font-bold ${textPrimary}`}>{sysInfoData.osName || '-'}</div>
                    <div className={`mt-0.5 font-mono text-[11px] tabular-nums ${textMuted}`}>
                      {sysInfoData.osDisplayVersion ? `${sysInfoData.osDisplayVersion} · ` : ''}
                      Build {sysInfoData.osBuild || sysInfoData.osVersion || '-'} ({sysInfoData.osArchitecture || '-'})
                    </div>
                  </div>
                  <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
                    <div className={textMuted}>{isEn ? 'Last Boot Time & Uptime' : 'زمان آخرین بوت و روشن بودن'}</div>
                    <div className={`mt-1 font-bold font-mono tabular-nums ${textPrimary}`} dir="ltr">
                      {sysInfoData.lastBootTime || '-'}
                    </div>
                    <div className={`mt-0.5 font-mono text-[11px] tabular-nums ${textMuted}`}>
                      {isEn ? 'Uptime' : 'آپتایم'}: {sysInfoData.uptimeFormatted || '-'}
                    </div>
                  </div>
                  <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
                    <div className={textMuted}>{isEn ? 'Physical & Virtual RAM' : 'حافظه رم فیزیکی و مجازی'}</div>
                    <div className={`mt-1 font-bold font-mono tabular-nums ${textPrimary}`}>
                      {sysInfoData.totalRamGb} GB ({isEn ? 'Free' : 'آزاد'}: {sysInfoData.availableRamGb} GB)
                    </div>
                    <div className={`mt-0.5 font-mono text-[11px] tabular-nums ${textMuted}`}>
                      {isEn ? 'Virtual' : 'مجازی'}: {sysInfoData.virtualMemAvailGb} / {sysInfoData.virtualMemTotalGb} GB
                    </div>
                  </div>
                  <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
                    <div className={textMuted}>{isEn ? 'Domain & Hardware' : 'دامین و سخت‌افزار'}</div>
                    <div className={`mt-1 font-bold font-mono ${textPrimary}`}>
                      {sysInfoData.domain || '-'}{' '}
                      <span className={sysInfoData.domainJoined ? 'text-emerald-500 font-normal' : 'text-amber-500 font-normal'}>
                        ({sysInfoData.domainJoined ? (isEn ? 'Domain' : 'عضو دامین') : 'Workgroup'})
                      </span>
                    </div>
                    <div className={`mt-0.5 text-[11px] truncate ${textMuted}`} title={`${sysInfoData.manufacturer} ${sysInfoData.model} · S/N: ${sysInfoData.serialNumber}`}>
                      {sysInfoData.manufacturer} {sysInfoData.model} {sysInfoData.serialNumber ? `· S/N ${sysInfoData.serialNumber}` : ''}
                    </div>
                  </div>
                </div>

                {/* Installed Windows Updates (HotFixes) Table + Manual KB Uninstall */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className={`text-xs font-bold ${textPrimary}`}>
                      {isEn
                        ? `Installed Windows Updates / HotFixes (${sysInfoData.hotfixes?.length || 0})`
                        : `آپدیت‌های نصب‌شده ویندوز (${sysInfoData.hotfixes?.length || 0} مورد)`}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Direct KB Uninstall input */}
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          dir="ltr"
                          value={manualKbUninstall}
                          onChange={(e) => setManualKbUninstall(e.target.value)}
                          placeholder="KB5034122"
                          className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none w-32 ${inputCls}`}
                        />
                        <button
                          type="button"
                          disabled={!canExecuteActions || !manualKbUninstall.trim() || uninstallingKb !== null}
                          onClick={() => handleUninstallHotfix(manualKbUninstall)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-40 text-rose-500 text-xs font-semibold cursor-pointer"
                        >
                          {uninstallingKb === manualKbUninstall.trim().toUpperCase() ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                          <span>{isEn ? 'Uninstall KB' : 'حذف KB'}</span>
                        </button>
                      </div>

                      <div className="relative">
                        <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-2.5 ${textMuted}`} />
                        <input
                          type="text"
                          value={hotfixSearch}
                          onChange={(e) => setHotfixSearch(e.target.value)}
                          placeholder={isEn ? 'Filter KB number or date...' : 'جستجوی شماره KB یا تاریخ...'}
                          className={`ps-8 pe-3 py-1.5 rounded-lg border text-xs outline-none w-48 ${inputCls}`}
                        />
                      </div>
                    </div>
                  </div>

                  {filteredHotfixes.length === 0 ? (
                    <div className={`p-4 rounded-lg border text-xs text-center ${subSurfaceBg} ${textMuted}`}>
                      {isEn ? 'No installed HotFixes reported.' : 'هیچ آپدیت HotFix ثبت نشده یا با فیلتر مطابقت ندارد.'}
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-xs border-collapse">
                        <thead className={`sticky top-0 ${isLightMode ? 'bg-slate-50 text-slate-600' : 'bg-slate-900 text-slate-400'}`}>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-start">
                            <th className="py-2 px-3 text-start font-semibold">KB / HotFix ID</th>
                            <th className="py-2 px-3 text-start font-semibold">{isEn ? 'Category' : 'نوع آپدیت'}</th>
                            <th className="py-2 px-3 text-end font-semibold">{isEn ? 'Installed On' : 'تاریخ نصب'}</th>
                            <th className="py-2 px-3 text-end font-semibold">{isEn ? 'Installed By' : 'نصب توسط'}</th>
                            <th className="py-2 px-3 text-end font-semibold">{isEn ? 'Uninstall' : 'حذف آپدیت'}</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                          {filteredHotfixes.map((hf: any, idx: number) => {
                            const kb = String(hf.hotfixId || '').toUpperCase();
                            const isConfirming = confirmUninstallKb === kb;
                            const isBusy = uninstallingKb === kb;
                            return (
                              <tr key={`${kb}-${idx}`}>
                                <td className="py-2 px-3 font-mono font-semibold text-sky-500" dir="ltr">{kb}</td>
                                <td className={`py-2 px-3 ${textPrimary}`}>{hf.description || '-'}</td>
                                <td className={`py-2 px-3 text-end font-mono tabular-nums ${textMuted}`}>{hf.installedOn || '-'}</td>
                                <td className={`py-2 px-3 text-end font-mono ${textMuted}`}>{hf.installedBy || '-'}</td>
                                <td className="py-2 px-3 text-end whitespace-nowrap">
                                  {isConfirming ? (
                                    <span className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() => handleUninstallHotfix(kb)}
                                        className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold cursor-pointer"
                                      >
                                        {isBusy ? '...' : isEn ? 'Confirm Remove' : 'تایید حذف'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmUninstallKb(null)}
                                        className={`px-2 py-0.5 rounded border text-[11px] cursor-pointer ${
                                          isLightMode ? 'bg-white border-slate-300 text-slate-600' : 'bg-slate-800 border-slate-700 text-slate-300'
                                        }`}
                                      >
                                        {isEn ? 'Cancel' : 'لغو'}
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={!canExecuteActions || uninstallingKb !== null || !/^KB\d+/i.test(kb)}
                                      onClick={() => setConfirmUninstallKb(kb)}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-40 text-rose-500 text-[11px] font-semibold cursor-pointer"
                                    >
                                      {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                      <span>{isEn ? 'Uninstall' : 'حذف'}</span>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {sysInfoData.rawSystemInfo && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowRawSysInfo((v) => !v)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-sky-500 hover:underline cursor-pointer"
                    >
                      {showRawSysInfo ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      <span>
                        {showRawSysInfo
                          ? isEn
                            ? 'Hide Raw systeminfo Output'
                            : 'بستن خروجی خام systeminfo'
                          : isEn
                          ? 'Show Full systeminfo Output'
                          : 'مشاهده خروجی کامل systeminfo'}
                      </span>
                    </button>
                    {showRawSysInfo && (
                      <pre
                        dir="ltr"
                        className={`mt-2 p-3.5 rounded-xl border font-mono text-[11px] overflow-x-auto max-h-64 ${subSurfaceBg} ${textMuted}`}
                      >
                        {sysInfoData.rawSystemInfo}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 6B: ADD / REMOVE PROGRAMS (INSTALLED APPS & REMOTE UNINSTALL)   */}
      {/* =================================================================== */}
      {activeSubTab === 'programs' && (
        <div className="space-y-6">
          <div className={`rounded-2xl border p-5 space-y-5 ${surfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className={`text-sm font-bold flex items-center gap-2 ${textPrimary}`}>
                  <PackageCheck className="w-4 h-4 text-indigo-500" />
                  <span>
                    {isEn
                      ? 'Add / Remove Programs (Installed Workstation Applications)'
                      : 'مدیریت برنامه‌های نصب‌شده (Add / Remove Programs)'}
                  </span>
                </h2>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {isEn
                    ? 'Accurate inventory from 64-bit/32-bit machine registry hives and logged-in user profiles (excluding Windows updates & subcomponents). Critical AV/EDR and OpenSSH components are protected.'
                    : 'فهرست دقیق نرم‌افزارهای نصب‌شده در رجیستری سیستم (۶۴ و ۳۲ بیتی) و پروفایل کاربران فعال (بدون موارد تکراری و آپدیت‌ها). آنتی‌ویروس‌ها و سرویس‌های ارتباطی حیاتی در برابر حذف محافظت شده‌اند.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {filteredAndSortedPrograms.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportProgramsCsv}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                      isLightMode
                        ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{isEn ? 'Export CSV' : 'خروجی CSV'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleInspectPrograms}
                  disabled={loadingPrograms || !targetIp.trim()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPrograms ? 'animate-spin' : ''}`} />
                  <span>{isEn ? 'Refresh Programs List' : 'بروزرسانی لیست برنامه‌ها'}</span>
                </button>
              </div>
            </div>

            {programsError && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-start gap-2.5 text-xs text-rose-500">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{programsError}</span>
              </div>
            )}

            {programActionError && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-start gap-2.5 text-xs text-rose-500">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{programActionError}</span>
              </div>
            )}

            {programActionResult && (
              <div
                className={`rounded-xl border p-3.5 space-y-1.5 text-xs ${
                  programActionResult.success
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                }`}
              >
                <div className="flex items-center justify-between gap-2 font-semibold">
                  <div className="flex items-center gap-2">
                    {programActionResult.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{isEn ? programActionResult.message : programActionResult.messageFa}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProgramActionResult(null)}
                    className="opacity-70 hover:opacity-100 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {programActionResult.rawOutput && (
                  <pre
                    dir="ltr"
                    className={`p-2.5 rounded-lg border font-mono text-[11px] overflow-x-auto ${subSurfaceBg} ${textMuted}`}
                  >
                    {programActionResult.rawOutput}
                  </pre>
                )}
              </div>
            )}

            {programsData && (
              <>
                {/* Summary KPI Strip */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className={`rounded-xl border p-3.5 ${subSurfaceBg}`}>
                    <div className={`text-[11px] font-medium ${textMuted}`}>
                      {isEn ? 'Total Installed Programs' : 'کل برنامه‌های نصب‌شده'}
                    </div>
                    <div className={`text-xl font-bold font-mono tabular-nums mt-1 ${textPrimary}`}>
                      {programsData.totalCount}
                    </div>
                    <div className={`text-[11px] mt-0.5 truncate ${textMuted}`}>
                      {programsData.hostname || programsData.targetIp}
                    </div>
                  </div>
                  <div className={`rounded-xl border p-3.5 ${subSurfaceBg}`}>
                    <div className={`text-[11px] font-medium ${textMuted}`}>
                      {isEn ? 'Machine-Wide (All Users)' : 'نصب‌شده سیستمی (همه کاربران)'}
                    </div>
                    <div className="text-xl font-bold font-mono tabular-nums mt-1 text-sky-500">
                      {programsData.machineCount}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${textMuted}`}>HKLM (x64 / x86)</div>
                  </div>
                  <div className={`rounded-xl border p-3.5 ${subSurfaceBg}`}>
                    <div className={`text-[11px] font-medium ${textMuted}`}>
                      {isEn ? 'Per-User Profile Apps' : 'نصب‌شده در پروفایل کاربر'}
                    </div>
                    <div className="text-xl font-bold font-mono tabular-nums mt-1 text-indigo-500">
                      {programsData.userCount}
                    </div>
                    <div className={`text-[11px] mt-0.5 truncate ${textMuted}`} dir="ltr">
                      {programsData.activeUser || (isEn ? 'Active User Hives' : 'پروفایل کاربران فعال')}
                    </div>
                  </div>
                  <div className={`rounded-xl border p-3.5 ${subSurfaceBg}`}>
                    <div className={`text-[11px] font-medium ${textMuted}`}>
                      {isEn ? 'Reported Footprint' : 'حجم تخمینی ثبت‌شده'}
                    </div>
                    <div className="text-xl font-bold font-mono tabular-nums mt-1 text-teal-500">
                      {programsData.totalSizeMb >= 1024
                        ? `${(programsData.totalSizeMb / 1024).toFixed(2)} GB`
                        : `${Number(programsData.totalSizeMb || 0).toFixed(0)} MB`}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${textMuted}`}>
                      {isEn ? 'Across matching apps' : 'مجموع برنامه‌های شناسایی‌شده'}
                    </div>
                  </div>
                </div>

                {/* Search, Scope/Type Filter & Sort Toolbar */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center">
                  <div className="lg:col-span-5 relative">
                    <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-3 ${textMuted}`} />
                    <input
                      type="text"
                      value={programSearch}
                      onChange={(e) => {
                        setProgramSearch(e.target.value);
                        setProgramPage(1);
                      }}
                      placeholder={
                        isEn
                          ? 'Search program name, publisher, version, path, or GUID...'
                          : 'جستجو نام برنامه، ناشر (Publisher)، نسخه، مسیر نصب یا کد GUID...'
                      }
                      className={`w-full ps-8 pe-8 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                    />
                    {programSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setProgramSearch('');
                          setProgramPage(1);
                        }}
                        className={`absolute top-1/2 -translate-y-1/2 end-2.5 ${textMuted} hover:text-rose-500 cursor-pointer`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="lg:col-span-3">
                    <select
                      value={programScopeFilter}
                      onChange={(e) => {
                        setProgramScopeFilter(e.target.value as 'all' | 'machine' | 'user');
                        setProgramPage(1);
                      }}
                      className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                    >
                      <option value="all">
                        {isEn ? `All Scopes (${programsData.totalCount})` : `همه برنامه‌ها (${programsData.totalCount})`}
                      </option>
                      <option value="machine">
                        {isEn ? `System / Machine (${programsData.machineCount})` : `سیستمی / همه‌کاربران (${programsData.machineCount})`}
                      </option>
                      <option value="user">
                        {isEn ? `User Profile (${programsData.userCount})` : `پروفایل کاربر (${programsData.userCount})`}
                      </option>
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <select
                      value={programTypeFilter}
                      onChange={(e) => {
                        setProgramTypeFilter(e.target.value as 'all' | 'msi' | 'exe');
                        setProgramPage(1);
                      }}
                      className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                    >
                      <option value="all">{isEn ? 'All Installers' : 'همه نصاب‌ها'}</option>
                      <option value="msi">MSI (Windows Installer)</option>
                      <option value="exe">{isEn ? 'EXE / Inno / NSIS / Pkg' : 'EXE / اسکریپتی / پکیج'}</option>
                    </select>
                  </div>

                  <div className="lg:col-span-2 flex items-center gap-1.5">
                    <select
                      value={programSort}
                      onChange={(e) => {
                        setProgramSort(e.target.value as 'name' | 'size' | 'installDate' | 'publisher');
                        setProgramPage(1);
                      }}
                      className={`flex-1 min-w-0 px-2.5 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                    >
                      <option value="name">{isEn ? 'Sort: Name' : 'مرتب‌سازی: نام'}</option>
                      <option value="size">{isEn ? 'Sort: Size' : 'مرتب‌سازی: حجم'}</option>
                      <option value="installDate">{isEn ? 'Sort: Install Date' : 'مرتب‌سازی: تاریخ نصب'}</option>
                      <option value="publisher">{isEn ? 'Sort: Publisher' : 'مرتب‌سازی: ناشر'}</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setProgramSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                      title={
                        programSortDir === 'asc'
                          ? isEn
                            ? 'Ascending'
                            : 'صعودی'
                          : isEn
                          ? 'Descending'
                          : 'نزولی'
                      }
                      className={`px-2.5 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer shrink-0 ${
                        isLightMode
                          ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      <ArrowUpDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Installed Programs Table */}
                {filteredAndSortedPrograms.length === 0 ? (
                  <div className={`rounded-xl border p-8 text-center text-xs ${subSurfaceBg} ${textMuted}`}>
                    {isEn
                      ? 'No installed applications matched your current search or filters.'
                      : 'هیچ برنامه‌ای مطابق فیلتر یا عبارت جستجوی فعلی یافت نشد.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-xs border-collapse">
                      <thead className={isLightMode ? 'bg-slate-50 text-slate-600' : 'bg-slate-900/90 text-slate-400'}>
                        <tr className="border-b border-slate-200 dark:border-slate-800">
                          <th className="py-2.5 px-3 text-start">
                            <button
                              type="button"
                              onClick={() => handleToggleProgramSort('name')}
                              className="inline-flex items-center gap-1 font-semibold hover:text-sky-500 cursor-pointer"
                            >
                              <span>{isEn ? 'Program & Version' : 'نام برنامه و نسخه'}</span>
                              {programSort === 'name' &&
                                (programSortDir === 'asc' ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-sky-500" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                                ))}
                            </button>
                          </th>
                          <th className="py-2.5 px-3 text-start">
                            <button
                              type="button"
                              onClick={() => handleToggleProgramSort('publisher')}
                              className="inline-flex items-center gap-1 font-semibold hover:text-sky-500 cursor-pointer"
                            >
                              <span>{isEn ? 'Publisher' : 'ناشر'}</span>
                              {programSort === 'publisher' &&
                                (programSortDir === 'asc' ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-sky-500" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                                ))}
                            </button>
                          </th>
                          <th className="py-2.5 px-3 text-start">{isEn ? 'Scope / Type' : 'دامنه / نوع'}</th>
                          <th className="py-2.5 px-3 text-start">
                            <button
                              type="button"
                              onClick={() => handleToggleProgramSort('size')}
                              className="inline-flex items-center gap-1 font-semibold hover:text-sky-500 cursor-pointer"
                            >
                              <span>{isEn ? 'Size' : 'حجم'}</span>
                              {programSort === 'size' &&
                                (programSortDir === 'asc' ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-sky-500" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                                ))}
                            </button>
                          </th>
                          <th className="py-2.5 px-3 text-start">
                            <button
                              type="button"
                              onClick={() => handleToggleProgramSort('installDate')}
                              className="inline-flex items-center gap-1 font-semibold hover:text-sky-500 cursor-pointer"
                            >
                              <span>{isEn ? 'Installed' : 'تاریخ نصب'}</span>
                              {programSort === 'installDate' &&
                                (programSortDir === 'asc' ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-sky-500" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                                ))}
                            </button>
                          </th>
                          <th className="py-2.5 px-3 text-end">{isEn ? 'Action' : 'عملیات'}</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                        {paginatedPrograms.map((prog: any) => {
                          const isExpanded = expandedProgramId === prog.id;
                          const isConfirming = confirmUninstallProgId === prog.id;
                          const isBusy = uninstallingProgId === prog.id;

                          return (
                            <React.Fragment key={prog.id}>
                              <tr className={isLightMode ? 'hover:bg-slate-50/70' : 'hover:bg-slate-800/30'}>
                                <td className="py-2.5 px-3 max-w-[320px]">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedProgramId(isExpanded ? null : prog.id)}
                                    className="text-start group cursor-pointer w-full"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      {isExpanded ? (
                                        <ChevronUp className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                                      ) : (
                                        <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${textMuted} group-hover:text-sky-500`} />
                                      )}
                                      <span className={`font-semibold truncate ${textPrimary} group-hover:text-sky-500`}>
                                        {prog.name}
                                      </span>
                                    </div>
                                    <div className={`text-[11px] font-mono ps-5 truncate ${textMuted}`} dir="ltr">
                                      {prog.version ? `v${prog.version}` : isEn ? 'Version N/A' : 'نسخه نامشخص'}
                                    </div>
                                  </button>
                                </td>

                                <td className={`py-2.5 px-3 max-w-[180px] truncate ${textMuted}`}>
                                  {prog.publisher || '—'}
                                </td>

                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <div className="flex flex-col gap-0.5">
                                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${textPrimary}`}>
                                      {prog.scope === 'user' ? (
                                        <>
                                          <User className="w-3 h-3 text-indigo-500 shrink-0" />
                                          <span className="truncate max-w-[130px]" dir="ltr">
                                            {prog.ownerUser || (isEn ? 'User Profile' : 'کاربر')}
                                          </span>
                                        </>
                                      ) : (
                                        <>
                                          <Server className="w-3 h-3 text-sky-500 shrink-0" />
                                          <span>
                                            {prog.arch === 'x86'
                                              ? isEn
                                                ? 'Machine (32-bit)'
                                                : 'سیستم (۳۲ بیتی)'
                                              : prog.arch === 'pkg'
                                              ? isEn
                                                ? 'System Package'
                                                : 'پکیج سیستم'
                                              : isEn
                                              ? 'Machine (64-bit)'
                                              : 'سیستم (۶۴ بیتی)'}
                                          </span>
                                        </>
                                      )}
                                    </span>
                                    <span className={`text-[10px] font-mono uppercase ${textMuted}`} dir="ltr">
                                      {prog.installerType}
                                      {prog.quietSupported ? ' • silent' : ''}
                                    </span>
                                  </div>
                                </td>

                                <td className={`py-2.5 px-3 font-mono tabular-nums whitespace-nowrap ${textMuted}`} dir="ltr">
                                  {prog.sizeMb > 0
                                    ? prog.sizeMb >= 1024
                                      ? `${(prog.sizeMb / 1024).toFixed(2)} GB`
                                      : `${prog.sizeMb} MB`
                                    : '—'}
                                </td>

                                <td className={`py-2.5 px-3 font-mono whitespace-nowrap ${textMuted}`} dir="ltr">
                                  {prog.installDate || '—'}
                                </td>

                                <td className="py-2.5 px-3 text-end whitespace-nowrap">
                                  {prog.isProtected ? (
                                    <span
                                      title={isEn ? prog.protectionReason : prog.protectionReasonFa}
                                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold ${
                                        isLightMode
                                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                                          : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                      }`}
                                    >
                                      <Lock className="w-3 h-3" />
                                      <span>{isEn ? 'Protected' : 'محافظت‌شده'}</span>
                                    </span>
                                  ) : !prog.canUninstall ? (
                                    <span className={`text-[11px] ${textMuted}`}>
                                      {isEn ? 'No Uninstaller' : 'غیرقابل‌حذف'}
                                    </span>
                                  ) : !isConfirming ? (
                                    <button
                                      type="button"
                                      disabled={!canExecuteActions || Boolean(uninstallingProgId)}
                                      onClick={() => setConfirmUninstallProgId(prog.id)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-45 text-rose-500 text-[11px] font-semibold transition cursor-pointer"
                                    >
                                      {isBusy ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Trash2 className="w-3 h-3" />
                                      )}
                                      <span>{isEn ? 'Uninstall' : 'حذف برنامه'}</span>
                                    </button>
                                  ) : (
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={Boolean(uninstallingProgId)}
                                        onClick={() => handleUninstallProgram(prog)}
                                        className="px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold transition cursor-pointer"
                                      >
                                        {isEn ? 'Confirm Uninstall' : 'تأیید حذف'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmUninstallProgId(null)}
                                        className={`px-2 py-1 rounded-md border text-[11px] cursor-pointer ${
                                          isLightMode
                                            ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                                            : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                                        }`}
                                      >
                                        {isEn ? 'Cancel' : 'انصراف'}
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>

                              {isExpanded && (
                                <tr className={isLightMode ? 'bg-slate-50/90' : 'bg-slate-900/55'}>
                                  <td colSpan={6} className="px-5 py-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                                      <div>
                                        <span className={`font-semibold ${textMuted}`}>
                                          {isEn ? 'Registry Hive & Key: ' : 'کلید رجیستری: '}
                                        </span>
                                        <span className={`font-mono break-all ${textPrimary}`} dir="ltr">
                                          {prog.registryHive} \ {prog.registryKeyName}
                                        </span>
                                      </div>
                                      {prog.productCode && (
                                        <div>
                                          <span className={`font-semibold ${textMuted}`}>
                                            {isEn ? 'MSI ProductCode: ' : 'شناسه MSI: '}
                                          </span>
                                          <span className={`font-mono ${textPrimary}`} dir="ltr">
                                            {prog.productCode}
                                          </span>
                                        </div>
                                      )}
                                      {prog.installLocation && (
                                        <div className="md:col-span-2">
                                          <span className={`font-semibold ${textMuted}`}>
                                            {isEn ? 'Install Location: ' : 'مسیر نصب: '}
                                          </span>
                                          <span className={`font-mono break-all ${textPrimary}`} dir="ltr">
                                            {prog.installLocation}
                                          </span>
                                        </div>
                                      )}
                                      {prog.uninstallPreview && (
                                        <div className="md:col-span-2">
                                          <span className={`font-semibold ${textMuted}`}>
                                            {isEn ? 'Uninstall Command: ' : 'دستور حذف ثبت‌شده: '}
                                          </span>
                                          <code
                                            dir="ltr"
                                            className={`inline-block mt-0.5 px-2 py-0.5 rounded border font-mono text-[10px] break-all ${subSurfaceBg} ${textPrimary}`}
                                          >
                                            {prog.uninstallPreview}
                                          </code>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className={textMuted}>
                    {isEn
                      ? `Showing ${(clampedProgramPage - 1) * PROGRAMS_PAGE_SIZE + (paginatedPrograms.length > 0 ? 1 : 0)}–${
                          (clampedProgramPage - 1) * PROGRAMS_PAGE_SIZE + paginatedPrograms.length
                        } of ${filteredAndSortedPrograms.length} matching application(s)`
                      : `نمایش ${
                          (clampedProgramPage - 1) * PROGRAMS_PAGE_SIZE + (paginatedPrograms.length > 0 ? 1 : 0)
                        } تا ${(clampedProgramPage - 1) * PROGRAMS_PAGE_SIZE + paginatedPrograms.length} از ${
                          filteredAndSortedPrograms.length
                        } برنامه`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={clampedProgramPage <= 1}
                      onClick={() => setProgramPage(Math.max(1, clampedProgramPage - 1))}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 cursor-pointer ${
                        isLightMode
                          ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Prev' : 'قبلی'}</span>
                    </button>
                    <span className={`px-2 font-mono tabular-nums ${textPrimary}`} dir="ltr">
                      {clampedProgramPage} / {programTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={clampedProgramPage >= programTotalPages}
                      onClick={() => setProgramPage(Math.min(programTotalPages, clampedProgramPage + 1))}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 cursor-pointer ${
                        isLightMode
                          ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      <span>{isEn ? 'Next' : 'بعدی'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </>
            )}

            {!programsData && !loadingPrograms && !programsError && (
              <div className={`rounded-xl border p-8 text-center text-xs ${subSurfaceBg} ${textMuted}`}>
                {isEn
                  ? 'Connect to a workstation above or click "Refresh Programs List" to load installed applications.'
                  : 'ابتدا به سیستم کاربر متصل شوید یا دکمه «بروزرسانی لیست برنامه‌ها» را بزنید.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 9: CONNECTION HISTORY (SEARCH, FILTER, PAGINATION & RECONNECT)  */}
      {/* =================================================================== */}
      {activeSubTab === 'history' && (
        <div className="space-y-6">
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                label: isEn ? 'Total Recorded Sessions' : 'کل اتصالات ثبت‌شده',
                value: historyStats?.totalConnections ?? historyTotal,
                accent: 'text-sky-500',
              },
              {
                label: isEn ? 'Unique Endpoints' : 'سیستم‌های یکتا (IP)',
                value: historyStats?.uniqueHosts ?? 0,
                accent: 'text-indigo-500',
              },
              {
                label: isEn ? 'Successful Connections' : 'اتصالات موفق',
                value: historyStats?.successCount ?? 0,
                accent: 'text-emerald-500',
              },
              {
                label: isEn ? 'Failed Attempts' : 'تلاش‌های ناموفق',
                value: historyStats?.failedCount ?? 0,
                accent: 'text-rose-500',
              },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-xl border p-4 ${surfaceBg}`}>
                <div className={`text-[11px] font-medium ${textMuted}`}>{stat.label}</div>
                <div className={`mt-1 text-2xl font-bold font-mono tabular-nums ${stat.accent}`}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Search, Filters & Actions Bar */}
          <div className={`rounded-xl border p-4 sm:p-5 space-y-4 ${surfaceBg}`}>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <h2 className={`text-sm font-bold ${textPrimary}`}>
                  {isEn ? 'HelpDesk Workstation Connection History' : 'تاریخچه اتصالات انجام‌شده در هلپ‌دسک'}
                </h2>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {isEn
                    ? 'Shows target IP, computer name, endpoint logged-in PC user, timestamp, and 1-click reconnect (passwords are never stored).'
                    : 'نمایش آدرس IP، نام کامپیوتر، کاربر فعالِ سیستم، زمان و تاریخ اتصال همراه با امکان اتصال مجدد فوری (هیچ رمزی ذخیره نمی‌شود).'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadConnectionHistory()}
                  disabled={loadingHistory}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                    isLightMode
                      ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                      : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-sky-500 ${loadingHistory ? 'animate-spin' : ''}`} />
                  <span>{isEn ? 'Refresh' : 'بروزرسانی'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportHistoryCsv}
                  disabled={historyItems.length === 0}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer disabled:opacity-40 ${
                    isLightMode
                      ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                      : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                >
                  <Download className="w-3.5 h-3.5 text-teal-500" />
                  <span>{isEn ? 'Export CSV' : 'خروجی CSV'}</span>
                </button>

                {canExecuteActions &&
                  (confirmClearHistory ? (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busyHistoryId !== null}
                        onClick={handleClearAllHistory}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {busyHistoryId === 'ALL' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isEn ? (
                          'Confirm Clear All'
                        ) : (
                          'تأیید پاک‌سازی کل تاریخچه'
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearHistory(false)}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-700'
                            : 'bg-slate-800 border-slate-700 text-slate-200'
                        }`}
                      >
                        {isEn ? 'Cancel' : 'انصراف'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={(historyStats?.totalConnections ?? historyTotal) === 0 || busyHistoryId !== null}
                      onClick={() => setConfirmClearHistory(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-semibold transition cursor-pointer disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Clear History' : 'پاک‌سازی تاریخچه'}</span>
                    </button>
                  ))}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setHistoryPage(1);
                setHistorySearch(historySearchInput.trim());
                loadConnectionHistory({ page: 1, search: historySearchInput.trim() });
              }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center"
            >
              <div className="lg:col-span-5 relative">
                <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-3 ${textMuted}`} />
                <input
                  type="text"
                  value={historySearchInput}
                  onChange={(e) => setHistorySearchInput(e.target.value)}
                  placeholder={
                    isEn
                      ? 'Search IP, computer name, PC user, admin or OS...'
                      : 'جستجو بر اساس IP، اسم کامپیوتر، یوزر سیستم، ادمین یا ویندوز...'
                  }
                  className={`w-full ps-9 pe-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                />
              </div>

              <div className="lg:col-span-2">
                <select
                  value={historyStatusFilter}
                  onChange={(e) => {
                    const next = e.target.value as 'all' | 'success' | 'failed';
                    setHistoryStatusFilter(next);
                    setHistoryPage(1);
                    loadConnectionHistory({ page: 1, status: next });
                  }}
                  className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="all">{isEn ? 'All Statuses' : 'همه وضعیت‌ها'}</option>
                  <option value="success">{isEn ? 'Connected (Success)' : 'موفق'}</option>
                  <option value="failed">{isEn ? 'Failed' : 'ناموفق'}</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <select
                  value={historyProtocolFilter}
                  onChange={(e) => {
                    const next = e.target.value;
                    setHistoryProtocolFilter(next);
                    setHistoryPage(1);
                    loadConnectionHistory({ page: 1, protocol: next });
                  }}
                  className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="all">{isEn ? 'All Protocols' : 'همه پروتکل‌ها'}</option>
                  <option value="winrm_https">WinRM HTTPS (5986)</option>
                  <option value="winrm_http">WinRM HTTP (5985)</option>
                  <option value="smb_rpc">SMB/RPC (445)</option>
                  <option value="ssh">OpenSSH (22)</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <select
                  value={historyPageSize}
                  onChange={(e) => {
                    const nextSize = Number(e.target.value) || 15;
                    setHistoryPageSize(nextSize);
                    setHistoryPage(1);
                    loadConnectionHistory({ page: 1, pageSize: nextSize });
                  }}
                  className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value={10}>10 {isEn ? 'per page' : 'ردیف در صفحه'}</option>
                  <option value={15}>15 {isEn ? 'per page' : 'ردیف در صفحه'}</option>
                  <option value={25}>25 {isEn ? 'per page' : 'ردیف در صفحه'}</option>
                  <option value={50}>50 {isEn ? 'per page' : 'ردیف در صفحه'}</option>
                </select>
              </div>

              <div className="lg:col-span-1 flex items-center gap-1.5">
                <button
                  type="submit"
                  className="w-full py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer transition"
                >
                  {isEn ? 'Search' : 'جستجو'}
                </button>
              </div>
            </form>

            {historyNotice && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                  historyNotice.ok
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                }`}
              >
                <span className="font-semibold">{historyNotice.text}</span>
                <button type="button" onClick={() => setHistoryNotice(null)} className="cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {historyError && (
              <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-xs text-rose-500 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{historyError}</span>
              </div>
            )}

            {/* Connection History Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[860px] text-xs border-collapse">
                <thead className={isLightMode ? 'bg-slate-50 text-slate-600' : 'bg-slate-950 text-slate-400'}>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Date & Time' : 'تاریخ و زمان'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Target IP' : 'آدرس IP'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Computer Name & OS' : 'نام کامپیوتر و سیستم‌عامل'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Endpoint PC User' : 'یوزر فعالِ سیستم'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Admin Session & Protocol' : 'یوزر ادمین و پروتکل'}</th>
                    <th className="py-2.5 px-3 text-start font-semibold">{isEn ? 'Status' : 'وضعیت'}</th>
                    <th className="py-2.5 px-3 text-end font-semibold">{isEn ? 'Actions' : 'عملیات'}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                  {loadingHistory && historyItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={`py-8 text-center ${textMuted}`}>
                        <Loader2 className="w-5 h-5 mx-auto animate-spin text-sky-500 mb-2" />
                        <span>{isEn ? 'Loading connection history...' : 'در حال بارگذاری تاریخچه اتصالات...'}</span>
                      </td>
                    </tr>
                  ) : historyItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={`py-10 text-center ${textMuted}`}>
                        <Clock className="w-7 h-7 mx-auto opacity-50 mb-2" />
                        <div>
                          {isEn
                            ? 'No HelpDesk connection history records match your filter.'
                            : 'هیچ تاریخچه اتصالی با این فیلتر ثبت نشده است.'}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    historyItems.map((item) => {
                      const isSuccess = item.status === 'success';
                      return (
                        <tr
                          key={item.id}
                          className={isLightMode ? 'hover:bg-slate-50/80' : 'hover:bg-slate-800/40'}
                        >
                          <td className={`py-2.5 px-3 font-mono tabular-nums whitespace-nowrap ${textMuted}`}>
                            {formatLogonTimestamp(item.connectedAt)}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <span className={`font-mono font-bold ${textPrimary}`} dir="ltr">
                                {item.targetIp}
                              </span>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(item.targetIp);
                                    setCopiedHistoryIpId(item.id);
                                    setTimeout(() => setCopiedHistoryIpId(null), 1500);
                                  } catch {}
                                }}
                                title={isEn ? 'Copy IP' : 'کپی IP'}
                                className={`p-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700/60 cursor-pointer ${textMuted}`}
                              >
                                {copiedHistoryIpId === item.id ? (
                                  <Check className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className={`font-semibold ${textPrimary}`}>
                              {item.hostname || '—'}
                            </div>
                            <div className={`text-[10px] truncate max-w-[210px] ${textMuted}`}>
                              {item.osName || (item.osFamily !== 'unknown' ? item.osFamily : '—')}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            {item.loggedInUser ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-indigo-500/30 bg-indigo-500/10 text-indigo-500 font-mono font-semibold text-[11px]">
                                <User className="w-3 h-3 shrink-0" />
                                <span>{item.loggedInUser}</span>
                              </span>
                            ) : (
                              <span className={textMuted}>—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className={`font-mono text-[11px] ${textPrimary}`} dir="ltr">
                              {item.sessionUsername || '—'}
                            </div>
                            <div className={`text-[10px] flex items-center gap-1.5 ${textMuted}`}>
                              <span className="font-mono uppercase">
                                {(item.protocolUsed || item.protocolRequested || 'auto')}
                                {item.portUsed ? `:${item.portUsed}` : ''}
                              </span>
                              {item.actorName && (
                                <>
                                  <span>·</span>
                                  <span>{isEn ? 'By' : 'توسط'}: {item.actorName}</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              title={item.errorMessage || undefined}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border whitespace-nowrap ${
                                isSuccess
                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                                  : 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                              }`}
                            >
                              {isSuccess ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : (
                                <AlertCircle className="w-3 h-3" />
                              )}
                              <span>{isSuccess ? (isEn ? 'Connected' : 'موفق') : isEn ? 'Failed' : 'ناموفق'}</span>
                            </span>
                            {!isSuccess && item.errorMessage && (
                              <div className={`mt-0.5 text-[10px] truncate max-w-[160px] text-rose-400`}>
                                {item.errorMessage}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-end whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={!canRunDiagnostics}
                                onClick={() => handleReconnectFromHistory(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-[11px] font-semibold transition cursor-pointer"
                              >
                                <PlugZap className="w-3 h-3" />
                                <span>{isEn ? 'Reconnect' : 'اتصال مجدد'}</span>
                              </button>
                              {canExecuteActions && (
                                <button
                                  type="button"
                                  disabled={busyHistoryId !== null}
                                  onClick={() => handleDeleteHistoryItem(item.id)}
                                  title={isEn ? 'Remove entry' : 'حذف ردیف'}
                                  className="p-1.5 rounded-md border border-rose-500/30 hover:bg-rose-500/10 text-rose-500 transition cursor-pointer disabled:opacity-40"
                                >
                                  {busyHistoryId === item.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {historyTotal > 0 && (() => {
              const totalHistPages = Math.max(1, Math.ceil(historyTotal / historyPageSize));
              const startIdx = (historyPage - 1) * historyPageSize + 1;
              const endIdx = Math.min(historyPage * historyPageSize, historyTotal);
              return (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                  <div className={textMuted}>
                    {isEn
                      ? `Showing ${startIdx}–${endIdx} of ${historyTotal} connections`
                      : `نمایش ${startIdx} تا ${endIdx} از ${historyTotal} اتصال`}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={historyPage <= 1 || loadingHistory}
                      onClick={() => {
                        const p = Math.max(1, historyPage - 1);
                        setHistoryPage(p);
                        loadConnectionHistory({ page: p });
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold disabled:opacity-40 cursor-pointer ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                          : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {isEn ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <span>{isEn ? 'Prev' : 'قبلی'}</span>
                    </button>

                    {Array.from({ length: totalHistPages }, (_, idx) => idx + 1)
                      .filter(
                        (p) =>
                          p === 1 ||
                          p === totalHistPages ||
                          Math.abs(p - historyPage) <= 1
                      )
                      .map((p, idx, arr) => (
                        <React.Fragment key={p}>
                          {idx > 0 && arr[idx - 1] !== p - 1 && (
                            <span className={`px-1.5 ${textMuted}`}>…</span>
                          )}
                          <button
                            type="button"
                            disabled={loadingHistory}
                            onClick={() => {
                              setHistoryPage(p);
                              loadConnectionHistory({ page: p });
                            }}
                            className={`min-w-[28px] h-7 px-2 rounded-md border text-[11px] font-mono font-semibold cursor-pointer transition ${
                              p === historyPage
                                ? 'bg-sky-600 border-sky-600 text-white'
                                : isLightMode
                                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      ))}

                    <button
                      type="button"
                      disabled={historyPage >= totalHistPages || loadingHistory}
                      onClick={() => {
                        const p = Math.min(totalHistPages, historyPage + 1);
                        setHistoryPage(p);
                        loadConnectionHistory({ page: p });
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold disabled:opacity-40 cursor-pointer ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                          : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <span>{isEn ? 'Next' : 'بعدی'}</span>
                      {isEn ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* WINDOWS JEA & GPO HARDENING MODAL (Universal Modal Rule 7)          */}
      {/* =================================================================== */}
      {isJeaModalOpen &&
        createPortal(
          <div
            dir={isEn ? 'ltr' : 'rtl'}
            className="fixed top-0 left-0 right-0 bottom-8 z-[9999] flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 sm:p-5"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsJeaModalOpen(false);
            }}
          >
            <div
              className={`flex flex-col overflow-hidden border shadow-2xl transition-all ${
                isJeaModalMaximized ? 'w-full h-full rounded-xl' : 'w-full max-w-3xl max-h-[88vh] rounded-2xl'
              } ${
                isLightMode
                  ? 'bg-slate-50 border-slate-200 text-slate-900'
                  : 'bg-slate-950 border-slate-800 text-slate-100'
              }`}
            >
              {/* Header with Mandatory 3 Controls */}
              <div
                className={`flex items-center justify-between gap-3 px-5 py-3.5 border-b shrink-0 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <ShieldCheck className="w-5 h-5 text-teal-500 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold truncate">
                      {isEn
                        ? 'Windows JEA (Just Enough Administration) & GPO Firewall Hardening'
                        : 'اسکریپت امن‌سازی Windows JEA و قفل فایروال WinRM (ضدباج‌افزار)'}
                    </h3>
                    <p className={`text-[11px] truncate ${textMuted}`}>
                      {isEn
                        ? 'Locks workstations so WinRM only permits approved HelpDesk diagnostic & safe remediation cmdlets from your panel IP.'
                        : 'سیستم‌های کاربران را طوری قفل می‌کند که WinRM فقط دستورات مجاز هلپ‌دسک را و صرفاً از IP سرور پنل بپذیرد.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleMinimizeJeaModal}
                    className={`p-1.5 rounded-lg border transition cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                    title={isEn ? 'Minimize' : 'مینیمایز'}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsJeaModalMaximized((v) => !v)}
                    className={`p-1.5 rounded-lg border transition cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                    title={isJeaModalMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام‌صفحه') : isEn ? 'Fullscreen' : 'تمام‌صفحه'}
                  >
                    {isJeaModalMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsJeaModalOpen(false)}
                    className={`p-1.5 rounded-lg border transition cursor-pointer ${
                      isLightMode
                        ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                        : 'bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border-rose-500/30'
                    }`}
                    title={isEn ? 'Close' : 'بستن'}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">
                      {isEn ? 'Step 1: JEA Role Capability File (.psrc)' : 'مرحله ۱: فایل محدودسازی دستورات مجاز JEA (.psrc)'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText('psrc', jeaTemplates?.roleCapabilityScript || '')}
                      className="flex items-center gap-1 text-xs font-semibold text-sky-500 hover:underline cursor-pointer"
                    >
                      {copiedJeaKey === 'psrc' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedJeaKey === 'psrc' ? (isEn ? 'Copied' : 'کپی شد') : isEn ? 'Copy' : 'کپی'}</span>
                    </button>
                  </div>
                  <pre
                    dir="ltr"
                    className={`p-3.5 rounded-xl border font-mono text-[11px] overflow-x-auto ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
                    }`}
                  >
                    {jeaTemplates?.roleCapabilityScript || ''}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">
                      {isEn
                        ? 'Step 2: Register JEA Session & Restrict WinRM Port 5986 to Panel IP'
                        : 'مرحله ۲: ثبت Endpoint محدود JEA و محدودسازی فایروال پورت 5986 به IP پنل'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText('pssc', jeaTemplates?.registerSessionScript || '')}
                      className="flex items-center gap-1 text-xs font-semibold text-sky-500 hover:underline cursor-pointer"
                    >
                      {copiedJeaKey === 'pssc' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedJeaKey === 'pssc' ? (isEn ? 'Copied' : 'کپی شد') : isEn ? 'Copy' : 'کپی'}</span>
                    </button>
                  </div>
                  <pre
                    dir="ltr"
                    className={`p-3.5 rounded-xl border font-mono text-[11px] overflow-x-auto ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
                    }`}
                  >
                    {jeaTemplates?.registerSessionScript || ''}
                  </pre>
                </div>
              </div>

              <div
                className={`flex items-center justify-end px-5 py-3 border-t shrink-0 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setIsJeaModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer"
                >
                  {isEn ? 'Close' : 'بستن'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Floating 3-Dots Action Menu for Installed Printers (Portal) */}
      {printerMenuAnchor &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998] bg-transparent"
              onClick={() => setPrinterMenuAnchor(null)}
            />
            <div
              dir={isEn ? 'ltr' : 'rtl'}
              style={{
                position: 'fixed',
                top: printerMenuAnchor.top !== undefined ? `${printerMenuAnchor.top}px` : undefined,
                bottom: printerMenuAnchor.bottom !== undefined ? `${printerMenuAnchor.bottom}px` : undefined,
                left: printerMenuAnchor.left !== undefined ? `${printerMenuAnchor.left}px` : undefined,
                width: '14rem',
              }}
              className={`z-[9999] rounded-xl border shadow-2xl p-1.5 text-xs space-y-1 ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-800'
                  : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                disabled={Boolean(printerMenuAnchor.printer?.isDefault)}
                onClick={() => handleSetDefaultPrinter(printerMenuAnchor.printer.name)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-start transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                  isLightMode ? 'hover:bg-sky-50 text-slate-800' : 'hover:bg-slate-800 text-slate-100'
                }`}
              >
                <Star className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                <span>
                  {printerMenuAnchor.printer?.isDefault
                    ? isEn
                      ? 'Already Default'
                      : 'در حال حاضر پیش‌فرض است'
                    : isEn
                    ? 'Set as Default Printer'
                    : 'تنظیم به‌عنوان پیش‌فرض'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const pr = printerMenuAnchor.printer;
                  setPrinterMenuAnchor(null);
                  setPrinterDeleteTarget({
                    type: 'printer',
                    id: pr.name,
                    name: pr.name,
                    host: printerData?.targetIp || targetIp.trim(),
                    portName: pr.portName,
                    driverName: pr.driverName,
                    scope: pr.scope,
                    ownerUser: pr.ownerUser || printerData?.loggedInUser,
                  });
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-start transition cursor-pointer ${
                  isLightMode
                    ? 'hover:bg-rose-50 text-rose-700'
                    : 'hover:bg-rose-500/15 text-rose-300'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>{isEn ? 'Remove Printer' : 'حذف پرینتر از سیستم'}</span>
              </button>
            </div>
          </>,
          document.body
        )}

      {/* Floating 3-Dots Action Menu for Mapped Network Shares (Portal) */}
      {shareMenuAnchor &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998] bg-transparent"
              onClick={() => setShareMenuAnchor(null)}
            />
            <div
              dir={isEn ? 'ltr' : 'rtl'}
              style={{
                position: 'fixed',
                top: shareMenuAnchor.top !== undefined ? `${shareMenuAnchor.top}px` : undefined,
                bottom: shareMenuAnchor.bottom !== undefined ? `${shareMenuAnchor.bottom}px` : undefined,
                left: shareMenuAnchor.left !== undefined ? `${shareMenuAnchor.left}px` : undefined,
                width: '14.5rem',
              }}
              className={`z-[9999] rounded-xl border shadow-2xl p-1.5 text-xs space-y-1 ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-800'
                  : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  const sh = shareMenuAnchor.share;
                  setShareMenuAnchor(null);
                  undockModal('modal-helpdesk-network-share');
                  setShareModalPrefill({
                    remotePath: sh.remotePath,
                    driveLetter: sh.driveLetter || 'AUTO',
                    scope:
                      sh.scope === 'all_users'
                        ? 'all_users'
                        : sharesData?.loggedInUser
                        ? 'active_user'
                        : 'specific_user',
                  });
                  setIsShareMapModalOpen(true);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-start transition cursor-pointer ${
                  isLightMode ? 'hover:bg-sky-50 text-slate-800' : 'hover:bg-slate-800 text-slate-100'
                }`}
              >
                <FolderPlus className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                <span>{isEn ? 'Remap / Apply to Other Users' : 'مپ مجدد / اعمال برای سایر کاربران'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const sh = shareMenuAnchor.share;
                  setShareMenuAnchor(null);
                  setShareDeleteTarget({
                    type: 'network_share',
                    id: sh.id,
                    name: sh.driveLetter ? `${sh.driveLetter} (${sh.remotePath})` : sh.remotePath,
                    driveLetter: sh.driveLetter,
                    remotePath: sh.remotePath,
                    host: sharesData?.targetIp || targetIp.trim(),
                    scope: sh.scope,
                    ownerUser: sh.ownerUser,
                    ownerSid: sh.ownerSid,
                    managedRuleName: sh.managedRuleName,
                  });
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-start transition cursor-pointer ${
                  isLightMode
                    ? 'hover:bg-rose-50 text-rose-700'
                    : 'hover:bg-rose-500/15 text-rose-300'
                }`}
              >
                <FolderX className="w-3.5 h-3.5 shrink-0" />
                <span>{isEn ? 'Disconnect Share' : 'قطع اتصال (Disconnect)'}</span>
              </button>
            </div>
          </>,
          document.body
        )}

      {/* Print Server Connect & Install Modal */}
      <PrintServerConnectModal
        isOpen={isPrintServerModalOpen}
        onClose={() => setIsPrintServerModalOpen(false)}
        onMinimize={handleMinimizePrintServerModal}
        isLightMode={isLightMode}
        isEn={isEn}
        canExecuteActions={canExecuteActions}
        buildPayload={buildPayload}
        workstationIp={printerData?.targetIp || targetIp.trim()}
        detectedLoggedInUser={printerData?.loggedInUser || healthData?.loggedInUser || ''}
        onRateLimitUpdate={(rl) => setRateLimit(rl)}
        onInstalled={(result) => {
          setSpoolerActionResult(result);
          handleInspectPrinters();
        }}
      />

      {/* Network Share Map & Management Modal */}
      <NetworkShareMapModal
        isOpen={isShareMapModalOpen}
        onClose={() => setIsShareMapModalOpen(false)}
        onMinimize={handleMinimizeShareMapModal}
        isLightMode={isLightMode}
        isEn={isEn}
        canExecuteActions={canExecuteActions}
        buildPayload={buildPayload}
        workstationIp={sharesData?.targetIp || healthData?.targetIp || targetIp.trim()}
        detectedLoggedInUser={sharesData?.loggedInUser || healthData?.loggedInUser || ''}
        userProfiles={sharesData?.userProfiles || []}
        initialRemotePath={shareModalPrefill.remotePath}
        initialDriveLetter={shareModalPrefill.driveLetter}
        initialScope={shareModalPrefill.scope}
        onRateLimitUpdate={(rl) => setRateLimit(rl)}
        onMapped={(result) => {
          setShareActionResult(result);
          handleInspectShares();
        }}
      />

      {/* Standard Printer Removal Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(printerDeleteTarget)}
        onClose={() => setPrinterDeleteTarget(null)}
        target={printerDeleteTarget}
        onConfirmDeletePrinter={handleConfirmDeletePrinter}
        isLightMode={isLightMode}
      />

      {/* Standard Network Share Disconnect Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(shareDeleteTarget)}
        onClose={() => setShareDeleteTarget(null)}
        target={shareDeleteTarget}
        onConfirmDeleteNetworkShare={handleConfirmDisconnectShare}
        isLightMode={isLightMode}
      />
    </div>
  );
};
