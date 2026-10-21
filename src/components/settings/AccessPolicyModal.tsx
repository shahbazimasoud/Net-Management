import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Compass,
  Terminal,
  Router as RouterIcon,
  Server,
  FileCode2,
  Sliders,
  Save,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Layers,
  Lock,
  Eye,
  Settings,
  Users,
  UserCheck,
  Cpu,
  Flame,
  ArrowRight,
  Sparkles,
  Search,
  CheckSquare,
  Square,
  Network,
  Radio,
  FileText,
  Boxes,
  Activity,
  HardDrive,
  FolderTree,
  Wrench,
  KeyRound,
  Shield,
  Download,
  Upload,
  Database,
  Globe,
  Power,
  Trash2,
  Edit,
  RotateCcw,
  Filter,
} from 'lucide-react';
import {
  AccessPolicy,
  LocalUser,
  LocalGroup,
  ActiveDirectoryConfig,
  Device,
  DeviceGroup,
  RemoteServer,
  ServerGroup,
  ServerActionKey,
  NetworkDeviceActionKey,
} from '../../types';
import { useLanguage } from '../../i18n';
import { useModalDock } from '../../context/ModalDockContext';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import {
  SERVER_ACTIONS_CATALOG,
  DEVICE_ACTIONS_CATALOG,
  FULL_SERVER_PERMISSIONS,
  RESTRICTED_SERVER_PERMISSIONS,
  FULL_DEVICE_PERMISSIONS,
  RESTRICTED_DEVICE_PERMISSIONS,
} from '../../utils/rbac';

export type PolicyModalTab =
  | 'identity'
  | 'navigation'
  | 'cisco'
  | 'mikrotik'
  | 'servers'
  | 'global'
  | 'matrix';

export interface AccessPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  isCreating: boolean;
  editingPolicy: AccessPolicy | null;
  onSavePolicy: (policy: AccessPolicy) => Promise<void> | void;
  isLightMode?: boolean;
  liveLocalUsers?: LocalUser[];
  liveLocalGroups?: LocalGroup[];
  liveAdConfig?: ActiveDirectoryConfig;
  devices?: Device[];
  liveDeviceGroups?: DeviceGroup[];
  liveServers?: RemoteServer[];
  liveServerGroups?: ServerGroup[];
}

export const AccessPolicyModal: React.FC<AccessPolicyModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  isCreating,
  editingPolicy: initialPolicy,
  onSavePolicy,
  isLightMode: propIsLightMode,
  liveLocalUsers = [],
  liveLocalGroups = [],
  liveAdConfig,
  devices = [],
  liveDeviceGroups = [],
  liveServers = [],
  liveServerGroups = [],
}) => {
  const { isRtl, isEn } = useLanguage();
  const { dockModal } = useModalDock();

  const isLightMode =
    propIsLightMode ??
    (typeof document !== 'undefined' &&
      (document.querySelector('.theme-light') !== null ||
        document.documentElement.classList.contains('light') ||
        localStorage.getItem('panel_theme') === 'light' ||
        localStorage.getItem('theme_mode') === 'light'));

  const [activeTab, setActiveTab] = useState<PolicyModalTab>('identity');
  const [isMaximized, setIsMaximized] = useState(false);
  const [draftPolicy, setDraftPolicy] = useState<AccessPolicy | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Search queries and dropdown toggles for Tab 1 (Identity & Scope)
  const [adUserSearch, setAdUserSearch] = useState('');
  const [isAdUserOpen, setIsAdUserOpen] = useState(false);
  const [adGroupSearch, setAdGroupSearch] = useState('');
  const [isAdGroupOpen, setIsAdGroupOpen] = useState(false);
  const [localUserSearch, setLocalUserSearch] = useState('');
  const [isLocalUserOpen, setIsLocalUserOpen] = useState(false);
  const [localGroupSearch, setLocalGroupSearch] = useState('');
  const [isLocalGroupOpen, setIsLocalGroupOpen] = useState(false);
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');

  // Tab 7 (Matrix) Sub-mode and Search States
  const [matrixSubTab, setMatrixSubTab] = useState<'devices' | 'servers'>('devices');
  const [matrixDeviceSearch, setMatrixDeviceSearch] = useState('');
  const [matrixServerSearch, setMatrixServerSearch] = useState('');
  const [matrixDeviceFilter, setMatrixDeviceFilter] = useState<'all' | 'custom_only' | 'default_only'>('all');
  const [matrixServerFilter, setMatrixServerFilter] = useState<'all' | 'custom_only' | 'default_only'>('all');

  // Tab 5 (Server Fleet Actions & Scope) States
  const [serverScopeSearch, setServerScopeSearch] = useState('');
  const [fetchedServers, setFetchedServers] = useState<RemoteServer[]>([]);

  // Auto-fetch remote servers if not provided in props
  useEffect(() => {
    if (isOpen && liveServers.length === 0) {
      fetch('/api/remote-servers')
        .then((res) => res.json())
        .then((data) => {
          if (data && Array.isArray(data.servers)) {
            setFetchedServers(data.servers);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, liveServers.length]);

  const allAvailableServers = useMemo(() => {
    return liveServers.length > 0 ? liveServers : fetchedServers;
  }, [liveServers, fetchedServers]);

  const filteredServersForScope = useMemo(() => {
    if (!serverScopeSearch.trim()) return allAvailableServers;
    const q = serverScopeSearch.toLowerCase().trim();
    return allAvailableServers.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.ip?.toLowerCase().includes(q) ||
        s.hostname?.toLowerCase().includes(q) ||
        s.os_distro?.toLowerCase().includes(q) ||
        (Array.isArray(s.tags) && s.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }, [allAvailableServers, serverScopeSearch]);

  // Sync draft policy whenever initialPolicy changes or modal opens
  useEffect(() => {
    if (isOpen && initialPolicy) {
      setDraftPolicy({
        ...initialPolicy,
        targetGroupIds: initialPolicy.targetGroupIds || [],
        targetDeviceIds: initialPolicy.targetDeviceIds || [],
        targetServerScope:
          initialPolicy.targetServerScope ||
          (Array.isArray(initialPolicy.targetServerIds) && initialPolicy.targetServerIds.length > 0
            ? 'specific'
            : 'all'),
        targetServerIds: initialPolicy.targetServerIds || [],
        canAddServer:
          initialPolicy.canAddServer ??
          Boolean(initialPolicy.defaultServerPermissions?.add_server),
        defaultServerPermissions: initialPolicy.defaultServerPermissions || {
          terminal: false,
          file_explorer: true,
          server_management: true,
          web_management: false,
          database_management: false,
          power_control: false,
          edit_properties: false,
          delete_server: false,
          export_servers: false,
          import_servers: false,
          add_server: false,
        },
        perServerPermissions: initialPolicy.perServerPermissions || {},
        defaultDevicePermissions: initialPolicy.defaultDevicePermissions || {
          web_configs: true,
          terminal: false,
          apply_template: false,
          device_note: true,
          edit_properties: false,
          ping_keepalive: true,
          inspect_ports: true,
          write_memory: false,
          delete_device: false,
          export_devices: false,
          import_devices: false,
        },
        perDevicePermissions: initialPolicy.perDevicePermissions || {},
      });
      setErrorMessage(null);
      setIsMaximized(false);
      setActiveTab('identity');
      setAdUserSearch('');
      setIsAdUserOpen(false);
      setAdGroupSearch('');
      setIsAdGroupOpen(false);
      setLocalUserSearch('');
      setIsLocalUserOpen(false);
      setLocalGroupSearch('');
      setIsLocalGroupOpen(false);
      setDeviceSearchQuery('');
      setMatrixDeviceSearch('');
      setMatrixServerSearch('');
      setMatrixDeviceFilter('all');
      setMatrixServerFilter('all');
    }
  }, [isOpen, initialPolicy]);

  // Derived filtered users and groups for subject selection
  const filteredAdUsers = useMemo(() => {
    const list = liveAdConfig?.syncedUsers || [];
    if (!adUserSearch.trim()) return list.slice(0, 50);
    const q = adUserSearch.toLowerCase().trim();
    return list.filter(
      (u) =>
        u.displayName?.toLowerCase().includes(q) ||
        u.samAccountName?.toLowerCase().includes(q) ||
        u.userPrincipalName?.toLowerCase().includes(q) ||
        u.mail?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
    );
  }, [liveAdConfig?.syncedUsers, adUserSearch]);

  const filteredAdGroups = useMemo(() => {
    const list = liveAdConfig?.syncedGroups || [];
    if (!adGroupSearch.trim()) return list.slice(0, 50);
    const q = adGroupSearch.toLowerCase().trim();
    return list.filter(
      (g) =>
        g.displayName?.toLowerCase().includes(q) ||
        g.sAMAccountName?.toLowerCase().includes(q) ||
        g.description?.toLowerCase().includes(q) ||
        g.dn?.toLowerCase().includes(q)
    );
  }, [liveAdConfig?.syncedGroups, adGroupSearch]);

  const filteredLocalUsers = useMemo(() => {
    if (!localUserSearch.trim()) return liveLocalUsers.slice(0, 50);
    const q = localUserSearch.toLowerCase().trim();
    return liveLocalUsers.filter(
      (u) =>
        u.username?.toLowerCase().includes(q) ||
        u.fullName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q)
    );
  }, [liveLocalUsers, localUserSearch]);

  const filteredLocalGroups = useMemo(() => {
    if (!localGroupSearch.trim()) return liveLocalGroups.slice(0, 50);
    const q = localGroupSearch.toLowerCase().trim();
    return liveLocalGroups.filter(
      (g) =>
        g.name?.toLowerCase().includes(q) ||
        g.description?.toLowerCase().includes(q)
    );
  }, [liveLocalGroups, localGroupSearch]);

  const filteredDevicesForSpecificScope = useMemo(() => {
    if (!deviceSearchQuery.trim()) return devices;
    const q = deviceSearchQuery.toLowerCase().trim();
    return devices.filter(
      (d) =>
        d.name?.toLowerCase().includes(q) ||
        d.ip?.toLowerCase().includes(q) ||
        d.platform?.toLowerCase().includes(q) ||
        d.type?.toLowerCase().includes(q) ||
        d.model?.toLowerCase().includes(q)
    );
  }, [devices, deviceSearchQuery]);

  // Selected subject object lookups for summary badges
  const currentSelectedAdUser = useMemo(() => {
    if (!draftPolicy || draftPolicy.subjectType !== 'ad_user') return null;
    return (liveAdConfig?.syncedUsers || []).find(
      (u) =>
        u.samAccountName === draftPolicy.subjectId ||
        u.dn === draftPolicy.subjectId
    );
  }, [liveAdConfig?.syncedUsers, draftPolicy?.subjectId, draftPolicy?.subjectType]);

  const currentSelectedAdGroup = useMemo(() => {
    if (!draftPolicy || draftPolicy.subjectType !== 'ad_group') return null;
    return (liveAdConfig?.syncedGroups || []).find(
      (g) => g.dn === draftPolicy.subjectId
    );
  }, [liveAdConfig?.syncedGroups, draftPolicy?.subjectId, draftPolicy?.subjectType]);

  const currentSelectedLocalUser = useMemo(() => {
    if (!draftPolicy || draftPolicy.subjectType !== 'local_user') return null;
    return liveLocalUsers.find(
      (u) =>
        u.id === draftPolicy.subjectId ||
        u.username === draftPolicy.subjectId
    );
  }, [liveLocalUsers, draftPolicy?.subjectId, draftPolicy?.subjectType]);

  const currentSelectedLocalGroup = useMemo(() => {
    if (!draftPolicy || draftPolicy.subjectType !== 'local_group') return null;
    return liveLocalGroups.find((g) => g.id === draftPolicy.subjectId);
  }, [liveLocalGroups, draftPolicy?.subjectId, draftPolicy?.subjectType]);

  // Tab 7 filtered devices and servers
  const matrixFilteredDevices = useMemo(() => {
    if (!draftPolicy) return [];
    return devices.filter((d) => {
      const matchesSearch =
        !matrixDeviceSearch.trim() ||
        d.name?.toLowerCase().includes(matrixDeviceSearch.toLowerCase()) ||
        d.ip?.toLowerCase().includes(matrixDeviceSearch.toLowerCase()) ||
        d.platform?.toLowerCase().includes(matrixDeviceSearch.toLowerCase());
      if (!matchesSearch) return false;

      const hasCustom = Boolean(
        draftPolicy.perDevicePermissions?.[d.id] &&
          Object.keys(draftPolicy.perDevicePermissions[d.id]).length > 0
      );
      if (matrixDeviceFilter === 'custom_only') return hasCustom;
      if (matrixDeviceFilter === 'default_only') return !hasCustom;
      return true;
    });
  }, [devices, matrixDeviceSearch, matrixDeviceFilter, draftPolicy]);

  const matrixFilteredServers = useMemo(() => {
    if (!draftPolicy) return [];
    return liveServers.filter((s) => {
      const matchesSearch =
        !matrixServerSearch.trim() ||
        s.name?.toLowerCase().includes(matrixServerSearch.toLowerCase()) ||
        s.ip?.toLowerCase().includes(matrixServerSearch.toLowerCase()) ||
        s.hostname?.toLowerCase().includes(matrixServerSearch.toLowerCase()) ||
        s.os?.toLowerCase().includes(matrixServerSearch.toLowerCase());
      if (!matchesSearch) return false;

      const hasCustom = Boolean(
        draftPolicy.perServerPermissions?.[s.id] &&
          Object.keys(draftPolicy.perServerPermissions[s.id]).length > 0
      );
      if (matrixServerFilter === 'custom_only') return hasCustom;
      if (matrixServerFilter === 'default_only') return !hasCustom;
      return true;
    });
  }, [liveServers, matrixServerSearch, matrixServerFilter, draftPolicy]);

  if (!isOpen || !draftPolicy) return null;

  const handleMinimize = () => {
    if (onMinimize) {
      onMinimize();
      return;
    }
    dockModal({
      id: `access-policy-${draftPolicy.id || 'new'}`,
      labelEn: isCreating ? 'New Access Policy' : `Policy: ${draftPolicy.name || 'Edit'}`,
      labelFa: isCreating ? 'تعریف پالیسی دسترسی' : `پالیسی: ${draftPolicy.name || 'ویرایش'}`,
      badge: 'RBAC',
      category: 'config',
      onRestore: () => {},
      onClose: () => {
        onClose();
      },
    });
    onClose();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftPolicy.name.trim()) {
      setErrorMessage(
        isEn
          ? 'Policy name is required. Please specify a descriptive name.'
          : 'عنوان پالیسی الزامی است. لطفاً یک نام مشخص وارد فرمایید.'
      );
      setActiveTab('identity');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      await onSavePolicy(draftPolicy);
      onClose();
    } catch (err: any) {
      setErrorMessage(
        err.message ||
          (isEn
            ? 'Failed to save access policy to database.'
            : 'خطا در ذخیره‌سازی پالیسی سطح دسترسی در پایگاه داده.')
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Helper bulk selectors for tabs
  const setAllNavigationViews = (enabled: boolean) => {
    setDraftPolicy({
      ...draftPolicy,
      canViewDashboard: enabled,
      canViewTopology: enabled,
      canViewDevices: enabled,
      canViewPorts: enabled,
      canViewDiscovery: enabled,
      canViewTemplates: enabled,
      canViewServers: enabled,
      canViewNetworkTools: enabled,
      canViewPhysicalPlacement: enabled,
      canViewSettings: enabled,
    });
  };

  const setAllCiscoCapabilities = (enabled: boolean) => {
    setDraftPolicy({
      ...draftPolicy,
      canToggleAdminStatus: enabled,
      canChangeVlan: enabled,
      canTogglePortSecurity: enabled,
      canEditDescription: enabled,
      canWriteMemory: enabled,
      canBulkConfigurePorts: enabled,
    });
  };

  const setAllMikrotikCapabilities = (enabled: boolean) => {
    setDraftPolicy({
      ...draftPolicy,
      canMikrotikSafeMode: enabled,
      canMikrotikFirewall: enabled,
      canMikrotikBackup: enabled,
      canMikrotikBridgeVlan: enabled,
      canMikrotikToggleInterface: enabled,
      canMikrotikComment: enabled,
      canMikrotikIpPool: enabled,
    });
  };

  const setAllServerDefaultPermissions = (enabled: boolean) => {
    setDraftPolicy({
      ...draftPolicy,
      canAddServer: enabled,
      defaultServerPermissions: {
        terminal: enabled,
        file_explorer: enabled,
        server_management: enabled,
        web_management: enabled,
        database_management: enabled,
        power_control: enabled,
        edit_properties: enabled,
        delete_server: enabled,
        export_servers: enabled,
        import_servers: enabled,
        add_server: enabled,
      },
    });
  };

  const setAllGlobalCapabilities = (enabled: boolean) => {
    setDraftPolicy({
      ...draftPolicy,
      canApplyTemplates: enabled,
      canExportTemplates: enabled,
      canImportTemplates: enabled,
      canManageDevices: enabled,
      canExportBackup: enabled,
      canImportBackup: enabled,
      canExportDevices: enabled,
      canImportDevices: enabled,
      canExportServers: enabled,
      canImportServers: enabled,
      canBatchOperate: enabled,
    });
  };

  const tabsConfig: Array<{
    id: PolicyModalTab;
    labelEn: string;
    labelFa: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  }> = [
    {
      id: 'identity',
      labelEn: 'Identity & Scope',
      labelFa: 'هویت و دامنه',
      icon: ShieldCheck,
      color: 'text-indigo-400',
    },
    {
      id: 'navigation',
      labelEn: 'Navigation & Views',
      labelFa: 'صفحات و ابزارها',
      icon: Compass,
      color: 'text-cyan-400',
    },
    {
      id: 'cisco',
      labelEn: 'Cisco IOS Equipment',
      labelFa: 'تجهیزات سیسکو',
      icon: Terminal,
      color: 'text-sky-400',
    },
    {
      id: 'mikrotik',
      labelEn: 'MikroTik RouterOS',
      labelFa: 'تجهیزات میکروتیک',
      icon: RouterIcon,
      color: 'text-emerald-400',
    },
    {
      id: 'servers',
      labelEn: 'Linux & Servers',
      labelFa: 'ناوگان سرورها',
      icon: Server,
      color: 'text-amber-400',
    },
    {
      id: 'global',
      labelEn: 'Global & Templates',
      labelFa: 'عملیات و الگوها',
      icon: FileCode2,
      color: 'text-purple-400',
    },
    {
      id: 'matrix',
      labelEn: 'Granular Matrix',
      labelFa: 'ماتریس تفکیکی',
      icon: Sliders,
      color: 'text-rose-400',
    },
  ];

  const generalEquipmentActions = DEVICE_ACTIONS_CATALOG.filter((a) => a.category !== 'port');

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[9999] flex items-center justify-center p-2 sm:p-4 modal-backdrop-blur animate-fadeIn overflow-y-auto"
      data-modal-backdrop="true"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col border shadow-2xl overflow-hidden transition-all duration-200 backdrop-blur-2xl ${
          isLightMode
            ? 'bg-slate-50/95 border-slate-300 text-slate-800'
            : 'bg-slate-900/95 border-indigo-500/40 text-slate-100 shadow-[0_0_60px_rgba(99,102,241,0.25)]'
        } ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-none rounded-none'
            : 'w-full max-w-6xl max-h-[92vh] sm:max-h-[88vh] my-auto rounded-2xl'
        }`}
      >
        {/* Header - Pinned with 3 Control Buttons (Minus, Maximize, Close) */}
        <div
          className={`flex items-center justify-between p-4 sm:p-5 border-b shrink-0 ${
            isLightMode
              ? 'bg-white border-slate-200'
              : 'bg-slate-950/80 border-white/10'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                isLightMode
                  ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                  : 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-300 border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.3)]'
              }`}
            >
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3
                  className={`font-bold text-sm sm:text-base ${
                    isLightMode ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {isCreating
                    ? isEn
                      ? 'Create Access Policy'
                      : 'تعریف پالیسی سطح دسترسی جدید'
                    : isEn
                    ? 'Edit Access Policy'
                    : 'ویرایش پالیسی سطح دسترسی'}
                </h3>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-md border font-semibold ${
                    isLightMode
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                  }`}
                >
                  PostgreSQL RBAC
                </span>
                {draftPolicy.id === 'policy-super-admin' && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${
                      isLightMode
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                    }`}
                  >
                    {isEn ? 'Super Admin' : 'مدیر ارشد'}
                  </span>
                )}
              </div>
              <p
                className={`text-xs mt-0.5 ${
                  isLightMode ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                {isEn
                  ? 'Granular Multi-Vendor Access Governance across Cisco, MikroTik RouterOS, and Linux fleet.'
                  : 'مدیریت و کنترل یکپارچه اختیارات و محدودیت‌های عملیاتی برای تجهیزات سیسکو، میکروتیک و ناوگان سرورها'}
              </p>
            </div>
          </div>

          {/* Header Triple Control Buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleMinimize}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
              title={isEn ? 'Minimize to Tools Dock' : 'کوچک‌سازی به داک ابزارها'}
              aria-label="Minimize"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
              title={
                isMaximized
                  ? isEn
                    ? 'Restore Window Size'
                    : 'بازیابی اندازه پنجره'
                  : isEn
                  ? 'Maximize Window'
                  : 'تمام‌صفحه کردن پنجره'
              }
              aria-label="Maximize"
            >
              {isMaximized ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                  : 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10'
              }`}
              title={isEn ? 'Close' : 'بستن'}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation Bar */}
        <div
          className={`px-3 py-2 border-b flex items-center gap-1.5 overflow-x-auto shrink-0 select-none ${
            isLightMode
              ? 'bg-slate-100/80 border-slate-200'
              : 'bg-slate-950/50 border-white/5'
          }`}
        >
          {tabsConfig.map((tab) => {
            const IconComponent = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  isActive
                    ? isLightMode
                      ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                      : 'bg-indigo-600/30 text-white border border-indigo-500/50 shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                    : isLightMode
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <IconComponent
                  className={`w-3.5 h-3.5 ${
                    isActive ? tab.color : 'text-slate-400'
                  }`}
                />
                <span>{isEn ? tab.labelEn : tab.labelFa}</span>
              </button>
            );
          })}
        </div>

        {/* Error Notice */}
        {errorMessage && (
          <div
            className={`mx-5 mt-4 p-3 rounded-xl border flex items-center gap-2 text-xs shrink-0 ${
              isLightMode
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-rose-500/20 border-rose-500/40 text-rose-200'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Body Content (Tab Panels Container) */}
        <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {/* ========================================================================= */}
            {/* TAB 1: Identity & Target Scope */}
            {/* ========================================================================= */}
            {activeTab === 'identity' && (
              <div className="space-y-4 animate-fadeIn">
                {/* 1A: Basic Policy Metadata */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-400" />
                      <h4
                        className={`text-xs font-bold ${
                          isLightMode ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {isEn
                          ? 'Policy Identity & Priority Weight'
                          : 'مشخصات عنوان، توضیحات و ضریب اولویت پالیسی'}
                      </h4>
                    </div>
                    <FieldInfoTooltip
                      title={isEn ? 'Access Policy Identity' : 'هویت پالیسی دسترسی'}
                      whatIsIt={
                        isEn
                          ? 'The unique naming, operational purpose, and precedence weight of this authorization policy.'
                          : 'عنوان منحصر‌به‌فرد، هدف امنیتی و وزن اولویت این پالیسی در ماتریس ارزیابی کنترل دسترسی.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Determines which policy takes precedence when multiple policies match a user or group session.'
                          : 'هنگام انتساب همزمان چند پالیسی به یک کاربر، پالیسی با ضریب اولویت بالاتر ملاک ارزیابی قرار می‌گیرد.'
                      }
                      practicalExample={
                        isEn
                          ? 'Name: "NOC Tier-2 Engineers", Priority: 75'
                          : 'عنوان: "کارشناسان شیفت NOC"، ضریب: ۷۵'
                      }
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <label
                        className={`block text-xs font-semibold mb-1 ${
                          isLightMode ? 'text-slate-700' : 'text-slate-300'
                        }`}
                      >
                        {isEn ? 'Policy Name' : 'عنوان پالیسی دسترسی'}{' '}
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={draftPolicy.name}
                        onChange={(e) =>
                          setDraftPolicy({ ...draftPolicy, name: e.target.value })
                        }
                        placeholder={
                          isEn
                            ? 'e.g. Helpdesk Operations Policy'
                            : 'مثال: پالیسی تیم پشتیبانی و هلپ‌دسک'
                        }
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none transition ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-600'
                            : 'bg-slate-900 border-white/15 text-white focus:border-indigo-500'
                        }`}
                      />
                    </div>

                    <div>
                      <label
                        className={`block text-xs font-semibold mb-1 ${
                          isLightMode ? 'text-slate-700' : 'text-slate-300'
                        }`}
                      >
                        {isEn ? 'Priority (1-100)' : 'ضریب اولویت (۱ تا ۱۰۰)'}
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={draftPolicy.priority || 50}
                        onChange={(e) =>
                          setDraftPolicy({
                            ...draftPolicy,
                            priority: Math.max(1, Math.min(100, Number(e.target.value))),
                          })
                        }
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none transition ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-600'
                            : 'bg-slate-900 border-white/15 text-white focus:border-indigo-500'
                        }`}
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label
                        className={`block text-xs font-semibold mb-1 ${
                          isLightMode ? 'text-slate-700' : 'text-slate-300'
                        }`}
                      >
                        {isEn ? 'Description' : 'توضیحات و اهداف امنیتی'}
                      </label>
                      <input
                        type="text"
                        value={draftPolicy.description || ''}
                        onChange={(e) =>
                          setDraftPolicy({ ...draftPolicy, description: e.target.value })
                        }
                        placeholder={
                          isEn
                            ? 'Brief operational memo or organizational purpose'
                            : 'توضیح کوتاه در مورد اختیارات و وظایف این پالیسی'
                        }
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none transition ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-600'
                            : 'bg-slate-900 border-white/15 text-white focus:border-indigo-500'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* 1B: Subject Identity Type & Interactive Selector */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-cyan-400" />
                      <h4
                        className={`text-xs font-bold ${
                          isLightMode ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {isEn
                          ? 'Subject Identity Assignment (User or Group)'
                          : 'انتساب هویت کاربر یا گروه سازمانی'}
                      </h4>
                    </div>
                    <FieldInfoTooltip
                      title={isEn ? 'Subject Assignment' : 'انتساب هویت'}
                      whatIsIt={
                        isEn
                          ? 'The entity (Active Directory account or Local user/role) to which this policy is authoritatively mapped.'
                          : 'موجودیتی (کاربر/گروه اکتیو دایرکتوری یا کاربر/گروه محلی) که این پالیسی به آن تعلق می‌گیرد.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Enforces role-based access control based on LDAP domain credentials or local system accounts.'
                          : 'اعمال کنترل دسترسی مبتنی بر نقش متناسب با اکانت‌های دامین یا حساب‌های کاربری داخلی سیستم.'
                      }
                      practicalExample={
                        isEn
                          ? 'AD Group: "Domain Admins" or Local User: "operator_ali"'
                          : 'گروه AD: "NetAdmins" یا کاربر محلی: "operator_ali"'
                      }
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
                    {[
                      {
                        type: 'ad_user',
                        labelEn: 'AD User (LDAP)',
                        labelFa: 'کاربر اکتیو دایرکتوری',
                        icon: Users,
                      },
                      {
                        type: 'ad_group',
                        labelEn: 'AD Security Group',
                        labelFa: 'گروه امنیتی دامین',
                        icon: FolderTree,
                      },
                      {
                        type: 'local_user',
                        labelEn: 'Local User',
                        labelFa: 'کاربر دیتابیس محلی',
                        icon: UserCheck,
                      },
                      {
                        type: 'local_group',
                        labelEn: 'Local Group / Role',
                        labelFa: 'گروه کاربری محلی',
                        icon: Layers,
                      },
                    ].map((item) => {
                      const isSelected = draftPolicy.subjectType === item.type;
                      const IconComp = item.icon;
                      return (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => {
                            setDraftPolicy({
                              ...draftPolicy,
                              subjectType: item.type as any,
                              subjectId: '',
                              subjectName: '',
                            });
                          }}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer select-none ${
                            isSelected
                              ? isLightMode
                                ? 'bg-cyan-50 border-cyan-400 text-cyan-900 shadow-xs'
                                : 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                              : isLightMode
                              ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              : 'bg-slate-900/60 border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          <IconComp className="w-4 h-4 shrink-0" />
                          <span>{isEn ? item.labelEn : item.labelFa}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* AD User Interactive Picker */}
                  {draftPolicy.subjectType === 'ad_user' && (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-cyan-400 pointer-events-none" />
                        <input
                          type="text"
                          value={adUserSearch}
                          onChange={(e) => {
                            setAdUserSearch(e.target.value);
                            setIsAdUserOpen(true);
                          }}
                          onFocus={() => setIsAdUserOpen(true)}
                          placeholder={
                            isEn
                              ? 'Search Active Directory users (Name, samAccountName, department)...'
                              : 'جستجوی کاربر دامین (بر اساس نام، نام کاربری، دپارتمان یا ایمیل)...'
                          }
                          className={`w-full pl-9 pr-9 rtl:pl-9 rtl:pr-9 py-2 rounded-xl text-xs outline-none transition ${
                            isLightMode
                              ? 'bg-white border border-slate-300 text-slate-900 focus:border-cyan-500'
                              : 'bg-slate-900 border border-white/20 text-white focus:border-cyan-400'
                          }`}
                        />
                      </div>

                      {draftPolicy.subjectId && (
                        <div
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                            isLightMode
                              ? 'bg-cyan-50/80 border-cyan-200 text-cyan-950'
                              : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold">
                              {currentSelectedAdUser?.displayName ||
                                draftPolicy.subjectName ||
                                draftPolicy.subjectId}
                            </span>
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20">
                              @{draftPolicy.subjectId}
                            </span>
                            {currentSelectedAdUser?.department && (
                              <span className="text-[10px] text-slate-400">
                                ({currentSelectedAdUser.department})
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {isEn ? 'Selected' : 'انتخاب شد'}
                          </span>
                        </div>
                      )}

                      {isAdUserOpen && (
                        <div
                          className={`max-h-48 overflow-y-auto rounded-xl border p-1 space-y-1 ${
                            isLightMode
                              ? 'bg-white border-slate-200 shadow-md'
                              : 'bg-slate-950 border-white/15 shadow-xl'
                          }`}
                        >
                          {filteredAdUsers.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-400">
                              {isEn ? 'No matching AD users found' : 'کاربری یافت نشد'}
                            </div>
                          ) : (
                            filteredAdUsers.map((u) => (
                              <button
                                key={u.samAccountName || u.dn}
                                type="button"
                                onClick={() => {
                                  setDraftPolicy({
                                    ...draftPolicy,
                                    subjectId: u.samAccountName,
                                    subjectName: u.displayName || u.samAccountName,
                                  });
                                  setIsAdUserOpen(false);
                                }}
                                className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition cursor-pointer text-start ${
                                  draftPolicy.subjectId === u.samAccountName
                                    ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                                    : 'hover:bg-white/5 text-slate-300'
                                }`}
                              >
                                <div>
                                  <div className="font-semibold">{u.displayName}</div>
                                  <div className="text-[10px] font-mono text-slate-400">
                                    @{u.samAccountName} {u.department ? `• ${u.department}` : ''}
                                  </div>
                                </div>
                                {draftPolicy.subjectId === u.samAccountName && (
                                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* AD Group Interactive Picker */}
                  {draftPolicy.subjectType === 'ad_group' && (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-cyan-400 pointer-events-none" />
                        <input
                          type="text"
                          value={adGroupSearch}
                          onChange={(e) => {
                            setAdGroupSearch(e.target.value);
                            setIsAdGroupOpen(true);
                          }}
                          onFocus={() => setIsAdGroupOpen(true)}
                          placeholder={
                            isEn
                              ? 'Search Active Directory security groups...'
                              : 'جستجوی گروه امنیتی دامین...'
                          }
                          className={`w-full pl-9 pr-9 rtl:pl-9 rtl:pr-9 py-2 rounded-xl text-xs outline-none transition ${
                            isLightMode
                              ? 'bg-white border border-slate-300 text-slate-900 focus:border-cyan-500'
                              : 'bg-slate-900 border border-white/20 text-white focus:border-cyan-400'
                          }`}
                        />
                      </div>

                      {draftPolicy.subjectId && (
                        <div
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                            isLightMode
                              ? 'bg-cyan-50/80 border-cyan-200 text-cyan-950'
                              : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <FolderTree className="w-4 h-4 text-cyan-400" />
                            <span className="font-bold">
                              {currentSelectedAdGroup?.displayName ||
                                draftPolicy.subjectName ||
                                draftPolicy.subjectId}
                            </span>
                          </div>
                          <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {isEn ? 'Selected' : 'انتخاب شد'}
                          </span>
                        </div>
                      )}

                      {isAdGroupOpen && (
                        <div
                          className={`max-h-48 overflow-y-auto rounded-xl border p-1 space-y-1 ${
                            isLightMode
                              ? 'bg-white border-slate-200 shadow-md'
                              : 'bg-slate-950 border-white/15 shadow-xl'
                          }`}
                        >
                          {filteredAdGroups.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-400">
                              {isEn ? 'No matching AD groups found' : 'گروهی یافت نشد'}
                            </div>
                          ) : (
                            filteredAdGroups.map((g) => (
                              <button
                                key={g.dn || g.displayName}
                                type="button"
                                onClick={() => {
                                  setDraftPolicy({
                                    ...draftPolicy,
                                    subjectId: g.dn,
                                    subjectName: g.displayName || g.sAMAccountName,
                                  });
                                  setIsAdGroupOpen(false);
                                }}
                                className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition cursor-pointer text-start ${
                                  draftPolicy.subjectId === g.dn
                                    ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                                    : 'hover:bg-white/5 text-slate-300'
                                }`}
                              >
                                <div>
                                  <div className="font-semibold">{g.displayName}</div>
                                  <div className="text-[10px] text-slate-400 truncate max-w-md">
                                    {g.description || g.dn}
                                  </div>
                                </div>
                                {draftPolicy.subjectId === g.dn && (
                                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Local User Picker */}
                  {draftPolicy.subjectType === 'local_user' && (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-cyan-400 pointer-events-none" />
                        <input
                          type="text"
                          value={localUserSearch}
                          onChange={(e) => {
                            setLocalUserSearch(e.target.value);
                            setIsLocalUserOpen(true);
                          }}
                          onFocus={() => setIsLocalUserOpen(true)}
                          placeholder={
                            isEn
                              ? 'Search local database users...'
                              : 'جستجوی کاربر دیتابیس محلی...'
                          }
                          className={`w-full pl-9 pr-9 rtl:pl-9 rtl:pr-9 py-2 rounded-xl text-xs outline-none transition ${
                            isLightMode
                              ? 'bg-white border border-slate-300 text-slate-900 focus:border-cyan-500'
                              : 'bg-slate-900 border border-white/20 text-white focus:border-cyan-400'
                          }`}
                        />
                      </div>

                      {draftPolicy.subjectId && (
                        <div
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                            isLightMode
                              ? 'bg-cyan-50/80 border-cyan-200 text-cyan-950'
                              : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-cyan-400" />
                            <span className="font-bold">
                              {currentSelectedLocalUser?.fullName ||
                                currentSelectedLocalUser?.username ||
                                draftPolicy.subjectName ||
                                draftPolicy.subjectId}
                            </span>
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20">
                              @{draftPolicy.subjectId}
                            </span>
                          </div>
                          <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {isEn ? 'Selected' : 'انتخاب شد'}
                          </span>
                        </div>
                      )}

                      {isLocalUserOpen && (
                        <div
                          className={`max-h-48 overflow-y-auto rounded-xl border p-1 space-y-1 ${
                            isLightMode
                              ? 'bg-white border-slate-200 shadow-md'
                              : 'bg-slate-950 border-white/15 shadow-xl'
                          }`}
                        >
                          {filteredLocalUsers.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                setDraftPolicy({
                                  ...draftPolicy,
                                  subjectId: u.id,
                                  subjectName: u.fullName || u.username,
                                });
                                setIsLocalUserOpen(false);
                              }}
                              className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition cursor-pointer text-start ${
                                draftPolicy.subjectId === u.id
                                  ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                                  : 'hover:bg-white/5 text-slate-300'
                              }`}
                            >
                              <div>
                                <div className="font-semibold">
                                  {u.fullName || u.username}
                                </div>
                                <div className="text-[10px] font-mono text-slate-400">
                                  @{u.username} • {u.role}
                                </div>
                              </div>
                              {draftPolicy.subjectId === u.id && (
                                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Local Group Picker */}
                  {draftPolicy.subjectType === 'local_group' && (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-cyan-400 pointer-events-none" />
                        <input
                          type="text"
                          value={localGroupSearch}
                          onChange={(e) => {
                            setLocalGroupSearch(e.target.value);
                            setIsLocalGroupOpen(true);
                          }}
                          onFocus={() => setIsLocalGroupOpen(true)}
                          placeholder={
                            isEn
                              ? 'Search local user groups / roles...'
                              : 'جستجوی گروه کاربری محلی...'
                          }
                          className={`w-full pl-9 pr-9 rtl:pl-9 rtl:pr-9 py-2 rounded-xl text-xs outline-none transition ${
                            isLightMode
                              ? 'bg-white border border-slate-300 text-slate-900 focus:border-cyan-500'
                              : 'bg-slate-900 border border-white/20 text-white focus:border-cyan-400'
                          }`}
                        />
                      </div>

                      {draftPolicy.subjectId && (
                        <div
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                            isLightMode
                              ? 'bg-cyan-50/80 border-cyan-200 text-cyan-950'
                              : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-cyan-400" />
                            <span className="font-bold">
                              {currentSelectedLocalGroup?.name ||
                                draftPolicy.subjectName ||
                                draftPolicy.subjectId}
                            </span>
                          </div>
                          <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {isEn ? 'Selected' : 'انتخاب شد'}
                          </span>
                        </div>
                      )}

                      {isLocalGroupOpen && (
                        <div
                          className={`max-h-48 overflow-y-auto rounded-xl border p-1 space-y-1 ${
                            isLightMode
                              ? 'bg-white border-slate-200 shadow-md'
                              : 'bg-slate-950 border-white/15 shadow-xl'
                          }`}
                        >
                          {filteredLocalGroups.map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => {
                                setDraftPolicy({
                                  ...draftPolicy,
                                  subjectId: g.id,
                                  subjectName: g.name,
                                });
                                setIsLocalGroupOpen(false);
                              }}
                              className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition cursor-pointer text-start ${
                                draftPolicy.subjectId === g.id
                                  ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                                  : 'hover:bg-white/5 text-slate-300'
                              }`}
                            >
                              <div>
                                <div className="font-semibold">{g.name}</div>
                                <div className="text-[10px] text-slate-400">
                                  {g.description || 'Local Group'}
                                </div>
                              </div>
                              {draftPolicy.subjectId === g.id && (
                                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 1C: Target Equipment Scope (All, Groups, Specific) */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Network className="w-4 h-4 text-amber-400" />
                      <h4
                        className={`text-xs font-bold ${
                          isLightMode ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {isEn
                          ? 'Target Equipment Scope & Device Grouping'
                          : 'محدوده تجهیزات هدف و گروه‌بندی دستگاه‌ها'}
                      </h4>
                    </div>
                    <FieldInfoTooltip
                      title={isEn ? 'Equipment Scope' : 'محدوده تجهیزات'}
                      whatIsIt={
                        isEn
                          ? 'Defines which specific physical switches, routers, and servers this policy governs.'
                          : 'مشخص می‌کند اختیارات این پالیسی روی کدام سوییچ‌ها، روترها و سرورها اعمال می‌شود.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Isolates critical core infrastructure while granting access only to designated branch hardware.'
                          : 'جداسازی و ایزولاسیون روترها و سوییچ‌های کر و حساس از تجهیزات شعب یا لایه دسترسی.'
                      }
                      practicalExample={
                        isEn
                          ? 'Groups: "Branch Office Switches" or "DMZ Edge Routers"'
                          : 'گروه‌ها: "سوییچ‌های طبقه ۳" یا "روترهای شعب اصفهان"'
                      }
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                    {[
                      {
                        scope: 'all',
                        labelEn: 'All Network Devices & Servers',
                        labelFa: 'تمام تجهیزات و سرورها',
                        descEn: 'Global scope across all managed hardware',
                        descFa: 'دسترسی سراسری به کلیه سوییچ‌ها و سرورها',
                      },
                      {
                        scope: 'groups',
                        labelEn: 'Specific Device Groups',
                        labelFa: 'گروه‌های مشخص از تجهیزات',
                        descEn: 'Authorized device groups from database',
                        descFa: 'محدودسازی به گروه‌های تعریف‌شده در دیتابیس',
                      },
                      {
                        scope: 'specific',
                        labelEn: 'Individual Specific Devices',
                        labelFa: 'دیوایس‌های تک‌به‌تک و تفکیکی',
                        descEn: 'Explicitly checked individual equipment',
                        descFa: 'انتخاب تکی دستگاه‌ها بر اساس نام یا IP',
                      },
                    ].map((item) => {
                      const isSelected = draftPolicy.targetScope === item.scope;
                      return (
                        <button
                          key={item.scope}
                          type="button"
                          onClick={() => {
                            setDraftPolicy({
                              ...draftPolicy,
                              targetScope: item.scope as any,
                            });
                          }}
                          className={`flex flex-col p-3 rounded-xl border text-xs font-semibold transition cursor-pointer select-none text-start ${
                            isSelected
                              ? isLightMode
                                ? 'bg-amber-50 border-amber-400 text-amber-950 shadow-xs'
                                : 'bg-amber-500/20 border-amber-500/50 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                              : isLightMode
                              ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              : 'bg-slate-900/60 border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          <div className="font-bold flex items-center justify-between">
                            <span>{isEn ? item.labelEn : item.labelFa}</span>
                            {isSelected && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                            )}
                          </div>
                          <div className="text-[10px] mt-1 text-slate-400 font-normal">
                            {isEn ? item.descEn : item.descFa}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Group checkboxes when targetScope === 'groups' */}
                  {draftPolicy.targetScope === 'groups' && (
                    <div
                      className={`p-3 rounded-xl border space-y-2 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-200'
                          : 'bg-slate-900/80 border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-400">
                          {isEn ? 'Authorized Device Groups:' : 'گروه‌های تجهیزات مجاز:'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setDraftPolicy({
                                ...draftPolicy,
                                targetGroupIds: liveDeviceGroups.map((g) => g.id),
                              })
                            }
                            className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 cursor-pointer"
                          >
                            {isEn ? 'Select All' : 'انتخاب همه'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftPolicy({
                                ...draftPolicy,
                                targetGroupIds: [],
                              })
                            }
                            className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-slate-400 border border-white/10 hover:text-white cursor-pointer"
                          >
                            {isEn ? 'Deselect All' : 'لغو انتخاب'}
                          </button>
                        </div>
                      </div>

                      {liveDeviceGroups.length === 0 ? (
                        <div className="text-xs text-amber-400/90 p-2 text-center">
                          {isEn
                            ? 'No device groups defined in database yet.'
                            : 'هنوز هیچ گروه دستگاهی در دیتابیس ثبت نشده است.'}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {liveDeviceGroups.map((g) => {
                            const isChecked = (draftPolicy.targetGroupIds || []).includes(g.id);
                            return (
                              <label
                                key={g.id}
                                className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition ${
                                  isChecked
                                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-200 font-semibold'
                                    : 'bg-white/5 border-white/10 text-slate-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    const current = draftPolicy.targetGroupIds || [];
                                    const next = e.target.checked
                                      ? [...current, g.id]
                                      : current.filter((id) => id !== g.id);
                                    setDraftPolicy({
                                      ...draftPolicy,
                                      targetGroupIds: next,
                                    });
                                  }}
                                  className="accent-amber-500"
                                />
                                <span className="truncate">{g.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Individual devices when targetScope === 'specific' */}
                  {draftPolicy.targetScope === 'specific' && (
                    <div
                      className={`p-3 rounded-xl border space-y-2 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-200'
                          : 'bg-slate-900/80 border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-amber-400">
                          {isEn ? 'Select Individual Devices:' : 'انتخاب دستگاه‌های خاص:'}
                        </span>
                        <input
                          type="text"
                          value={deviceSearchQuery}
                          onChange={(e) => setDeviceSearchQuery(e.target.value)}
                          placeholder={isEn ? 'Filter devices...' : 'فیلتر بر اساس نام یا IP...'}
                          className="px-2 py-0.5 rounded text-[10px] bg-slate-900 border border-white/15 text-white"
                        />
                      </div>

                      <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-1">
                        {filteredDevicesForSpecificScope.map((d) => {
                          const isChecked = (draftPolicy.targetDeviceIds || []).includes(d.id);
                          return (
                            <label
                              key={d.id}
                              className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer select-none transition ${
                                isChecked
                                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-200 font-semibold'
                                  : 'bg-white/5 border-white/10 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    const current = draftPolicy.targetDeviceIds || [];
                                    const next = e.target.checked
                                      ? [...current, d.id]
                                      : current.filter((id) => id !== d.id);
                                    setDraftPolicy({
                                      ...draftPolicy,
                                      targetDeviceIds: next,
                                    });
                                  }}
                                  className="accent-amber-500"
                                />
                                <span className="truncate">{d.name}</span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400">
                                {d.ip}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: Navigation & Views Access */}
            {/* ========================================================================= */}
            {activeTab === 'navigation' && (
              <div className="space-y-4 animate-fadeIn">
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Compass className="w-4 h-4 text-cyan-400" />
                      <h4
                        className={`text-xs font-bold ${
                          isLightMode ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {isEn
                          ? 'Navigation Menus & Panel Views Access Governance'
                          : 'مدیریت دسترسی به منوهای اصلی و صفحات پنل'}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAllNavigationViews(true)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition cursor-pointer"
                      >
                        {isEn ? 'Select All' : 'انتخاب همه'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllNavigationViews(false)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/5 text-slate-400 border border-white/10 hover:text-white transition cursor-pointer"
                      >
                        {isEn ? 'Deselect All' : 'لغو همه'}
                      </button>
                    </div>
                  </div>

                  <p
                    className={`text-[11px] mb-4 ${
                      isLightMode ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    {isEn
                      ? 'Users governed by this policy will only see and access navigation tabs that are toggled active.'
                      : 'کاربران تحت این پالیسی فقط قادر به مشاهده و ورود به تب‌هایی خواهند بود که در این جدول فعال باشند.'}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      {
                        key: 'canViewDashboard',
                        labelEn: 'Dashboard & Metrics',
                        labelFa: 'داشبورد و وضعیت لحظه‌ای',
                        descEn: 'Executive summary & real-time telemetry',
                        descFa: 'خلاصه آمار و وضعیت تلمتری شبکه',
                        icon: Activity,
                      },
                      {
                        key: 'canViewTopology',
                        labelEn: 'Interactive Topology Map',
                        labelFa: 'نقشه توپولوژی تعاملی',
                        descEn: 'Schematic diagrams and live cable links',
                        descFa: 'دیاگرام‌های شماتیک و وضعیت خطوط ارتباطی',
                        icon: Network,
                      },
                      {
                        key: 'canViewDevices',
                        labelEn: 'Equipment Inventory',
                        labelFa: 'تجهیزات و سوییچ‌ها',
                        descEn: 'Network switch and router lists',
                        descFa: 'لیست و وضعیت سوییچ‌ها و روترهای شبکه',
                        icon: HardDrive,
                      },
                      {
                        key: 'canViewPorts',
                        labelEn: 'Port Management View',
                        labelFa: 'مدیریت و مانیتورینگ پورت‌ها',
                        descEn: 'Multi-device port inspection & status',
                        descFa: 'مشاهده و تحلیل وضعیت پورت‌ها در سطح شبکه',
                        icon: Radio,
                      },
                      {
                        key: 'canViewDiscovery',
                        labelEn: 'CDP & LLDP Discovery',
                        labelFa: 'اسکن همسایگی CDP/LLDP',
                        descEn: 'Hardware neighbor discovery scanner',
                        descFa: 'پویش سخت‌افزاری پروتکل‌های کشف همسایه',
                        icon: Radio,
                      },
                      {
                        key: 'canViewTemplates',
                        labelEn: 'Config Templates & Patterns',
                        labelFa: 'الگوها و اسکریپت‌های کانفیگ',
                        descEn: 'Multi-vendor configuration templates',
                        descFa: 'بانک تمپلیت‌های آماده و کدهای پیکربندی',
                        icon: FileCode2,
                      },
                      {
                        key: 'canViewServers',
                        labelEn: 'Remote Servers Fleet',
                        labelFa: 'ناوگان سرورهای ریموت',
                        descEn: 'Linux and Windows servers management',
                        descFa: 'مدیریت سرورهای لینوکسی و ویندوزی',
                        icon: Server,
                      },
                      {
                        key: 'canViewNetworkTools',
                        labelEn: 'Network Tools Suite',
                        labelFa: 'جعبه‌ابزار مهندسی شبکه',
                        descEn: 'IP subnet, Port scanner, Traceroute, Vault',
                        descFa: 'ابزارهای ساب‌نت، اسکنر پورت، تریس و والت',
                        icon: Wrench,
                      },
                      {
                        key: 'canViewPhysicalPlacement',
                        labelEn: 'Physical Placement (Racks)',
                        labelFa: 'جانمایی فیزیکی و رک‌ها',
                        descEn: 'Buildings, floors, rooms, and racks layout',
                        descFa: 'چیدمان فیزیکی در ساختمان، طبقات و رک‌ها',
                        icon: Boxes,
                      },
                      {
                        key: 'canViewSettings',
                        labelEn: 'Settings & Administration',
                        labelFa: 'تنظیمات و مدیریت سامانه',
                        descEn: 'AD sync, RBAC policies, backup engine',
                        descFa: 'تنظیمات اکتیو دایرکتوری، پالیسی‌ها و بکاپ',
                        icon: Settings,
                      },
                    ].map((item) => {
                      const isChecked = (draftPolicy as any)[item.key] !== false;
                      return (
                        <label
                          key={item.key}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition select-none ${
                            isChecked
                              ? isLightMode
                                ? 'bg-cyan-50/80 border-cyan-300 text-cyan-900 shadow-xs'
                                : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-200 text-slate-500'
                              : 'bg-slate-900/60 border-white/10 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              setDraftPolicy({
                                ...draftPolicy,
                                [item.key]: e.target.checked,
                              })
                            }
                            className="w-4 h-4 mt-0.5 accent-cyan-500 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span
                                className={`font-bold text-xs ${
                                  isLightMode ? 'text-slate-900' : 'text-white'
                                }`}
                              >
                                {isEn ? item.labelEn : item.labelFa}
                              </span>
                              <FieldInfoTooltip
                                title={isEn ? item.labelEn : item.labelFa}
                                whatIsIt={
                                  isEn
                                    ? `Grants view access to the ${item.labelEn} view.`
                                    : `مجوز مشاهده و کار با بخش «${item.labelFa}» در پنل.`
                                }
                                whyNeeded={
                                  isEn
                                    ? 'Prevents unauthorized inspection of network metrics, passwords, or topology.'
                                    : 'جلوگیری از دسترسی کاربران غیرمجاز به اطلاعات حساس و تلمتری این بخش.'
                                }
                                practicalExample={
                                  isEn
                                    ? 'Disable for guest/viewer accounts'
                                    : 'برای حساب‌های مهمان یا اپراتور غیرفعال شود'
                                }
                                isEn={isEn}
                                isLightMode={isLightMode}
                              />
                            </div>
                            <div
                              className={`text-[10px] mt-0.5 ${
                                isLightMode ? 'text-slate-600' : 'text-slate-400'
                              }`}
                            >
                              {isEn ? item.descEn : item.descFa}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: Cisco IOS Equipment */}
            {/* ========================================================================= */}
            {activeTab === 'cisco' && (
              <div className="space-y-4 animate-fadeIn">
                {/* 3A: Cisco Terminal CLI Privileges */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-sky-400" />
                      <h4
                        className={`text-xs font-bold ${
                          isLightMode ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {isEn
                          ? 'Cisco IOS CLI Terminal & Console Privileges'
                          : 'سطح دسترسی خط فرمان (CLI Terminal) و کنسول سیسکو'}
                      </h4>
                    </div>
                    <FieldInfoTooltip
                      title={isEn ? 'Cisco Terminal Privilege' : 'اختیارات ترمینال سیسکو'}
                      whatIsIt={
                        isEn
                          ? 'Defines whether interactive SSH/Telnet terminal sessions are permitted and at what privilege tier.'
                          : 'مشخص می‌کند آیا کاربر می‌تواند به شل SSH سوییچ سیسکو متصل شود و سطح دسترسی آن چقدر است.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Protects running configurations from accidental or unauthorized CLI commands.'
                          : 'محافظت از تجهیز در برابر دستورات مخرب یا ناخواسته از طریق خط فرمان مستقیم.'
                      }
                      practicalExample={
                        isEn
                          ? 'View-Only for monitoring staff; Full for senior network engineers'
                          : 'حالت View-Only برای مانیتورینگ؛ Full برای مدیران شبکه'
                      }
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      {
                        value: 'none',
                        labelEn: 'No Terminal Access',
                        labelFa: 'مسدود (بدون دسترسی به ترمینال)',
                        descEn: 'Terminal tab and buttons will be hidden',
                        descFa: 'دسترسی به کنسول و صدور دستورات کاملاً بسته است',
                      },
                      {
                        value: 'view_only',
                        labelEn: 'View-Only (Show Commands)',
                        labelFa: 'فقط مشاهده (دستورات show)',
                        descEn: 'Inspect show commands without config write access',
                        descFa: 'مشاهده دستورات نمایشی بدون امکان اعمال تغییرات',
                      },
                      {
                        value: 'full',
                        labelEn: 'Full Interactive Terminal',
                        labelFa: 'ترمینال کامل و تعاملی (Enable/Config)',
                        descEn: 'Full privileged CLI console session',
                        descFa: 'دسترسی نامحدود به شل و اجرای کامل کانفیگ',
                      },
                    ].map((mode) => {
                      const isSelected = draftPolicy.terminalAccess === mode.value;
                      return (
                        <label
                          key={mode.value}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition select-none ${
                            isSelected
                              ? isLightMode
                                ? 'bg-sky-50 border-sky-300 text-sky-900'
                                : 'bg-sky-500/20 border-sky-500/40 text-sky-200'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-200 text-slate-500'
                              : 'bg-slate-900/60 border-white/10 text-slate-400'
                          }`}
                        >
                          <input
                            type="radio"
                            name="cisco_terminal"
                            value={mode.value}
                            checked={isSelected}
                            onChange={() =>
                              setDraftPolicy({
                                ...draftPolicy,
                                terminalAccess: mode.value as any,
                              })
                            }
                            className="w-4 h-4 mt-0.5 accent-sky-500"
                          />
                          <div>
                            <div
                              className={`font-bold text-xs ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {isEn ? mode.labelEn : mode.labelFa}
                            </div>
                            <div
                              className={`text-[10px] mt-0.5 ${
                                isLightMode ? 'text-slate-600' : 'text-slate-400'
                              }`}
                            >
                              {isEn ? mode.descEn : mode.descFa}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* 3B: Cisco Port Actions & Hardware Operations */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-sky-400" />
                      <h4
                        className={`text-xs font-bold ${
                          isLightMode ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {isEn
                          ? 'Cisco Port & Hardware Capabilities'
                          : 'اختیارات عملیاتی پورت‌ها و سخت‌افزار سیسکو'}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAllCiscoCapabilities(true)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30 hover:bg-sky-500/30 transition cursor-pointer"
                      >
                        {isEn ? 'Select All' : 'انتخاب همه'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllCiscoCapabilities(false)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/5 text-slate-400 border border-white/10 hover:text-white transition cursor-pointer"
                      >
                        {isEn ? 'Deselect All' : 'لغو همه'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      {
                        key: 'canToggleAdminStatus',
                        labelEn: 'Toggle Interface Power (Shutdown/No Shut)',
                        labelFa: 'خاموش/روشن کردن پورت (Shutdown/No Shut)',
                        descEn: 'Administrative link state control',
                        descFa: 'تغییر وضعیت فعال یا غیرفعال بودن اینترفیس',
                        what: 'Administrative shutdown or activation of physical ports',
                        why: 'Prevents unauthorized port link manipulation by lower roles',
                      },
                      {
                        key: 'canChangeVlan',
                        labelEn: 'Assign Access VLAN & PVID',
                        labelFa: 'تغییر و انتساب VLAN به پورت‌ها',
                        descEn: 'Reassign ports to authorized network VLANs',
                        descFa: 'تغییر شماره VLAN اینترفیس‌های لایه ۲',
                        what: 'Modify access VLAN ID assigned to switch interfaces',
                        why: 'Enforces network segmentation and subnet isolation',
                      },
                      {
                        key: 'canTogglePortSecurity',
                        labelEn: 'Port Security & MAC Sticky',
                        labelFa: 'تنظیمات Port Security و کنترل MAC',
                        descEn: 'Manage port violation modes and limits',
                        descFa: 'پیکربندی امنیت مک‌آدرس و قفل پورت',
                        what: 'Configure switchport port-security and violation actions',
                        why: 'Prevents rogue switches or unauthorized device attachments',
                      },
                      {
                        key: 'canEditDescription',
                        labelEn: 'Modify Interface Description',
                        labelFa: 'ویرایش توضیحات پورت (Description)',
                        descEn: 'Update port documentation memos',
                        descFa: 'ثبت و تغییر یادداشت‌های شناسایی پورت',
                        what: 'Set descriptive memo tags on Cisco switch interfaces',
                        why: 'Keeps port labeling accurate and up-to-date',
                      },
                      {
                        key: 'canWriteMemory',
                        labelEn: 'Save Running Config to NVRAM (write mem)',
                        labelFa: 'ذخیره‌سازی کانفیگ در حافظه پایدار (write mem)',
                        descEn: 'Persist active running config across reboots',
                        descFa: 'انتقال تنظیمات موقت به استارت‌آپ سوییچ',
                        what: 'Execute "write memory" or "copy running-config startup-config"',
                        why: 'Ensures changes survive planned or unexpected hardware reboots',
                      },
                      {
                        key: 'canBulkConfigurePorts',
                        labelEn: 'Bulk Multi-Port Configuration',
                        labelFa: 'پیکربندی دسته‌ای و همزمان چندین پورت',
                        descEn: 'Apply bulk commands to range of interfaces',
                        descFa: 'اعمال یکباره تغییرات روی رنجی از پورت‌ها',
                        what: 'Interface range operations applied to multiple ports at once',
                        why: 'High-impact mass configuration requiring senior authorization',
                      },
                    ].map((item) => {
                      const isChecked = Boolean((draftPolicy as any)[item.key]);
                      return (
                        <label
                          key={item.key}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition select-none ${
                            isChecked
                              ? isLightMode
                                ? 'bg-sky-50 border-sky-300 text-sky-900 shadow-xs'
                                : 'bg-sky-500/15 border-sky-500/40 text-sky-200'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-200 text-slate-500'
                              : 'bg-slate-900/60 border-white/10 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              setDraftPolicy({
                                ...draftPolicy,
                                [item.key]: e.target.checked,
                              })
                            }
                            className="w-4 h-4 mt-0.5 accent-sky-500 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span
                                className={`font-bold text-xs ${
                                  isLightMode ? 'text-slate-900' : 'text-white'
                                }`}
                              >
                                {isEn ? item.labelEn : item.labelFa}
                              </span>
                              <FieldInfoTooltip
                                title={isEn ? item.labelEn : item.labelFa}
                                whatIsIt={item.what}
                                whyNeeded={item.why}
                                practicalExample={
                                  isEn
                                    ? 'Allowed for Network Admins, Disabled for Viewers'
                                    : 'مجاز برای مدیران شبکه؛ غیرمجاز برای ناظران'
                                }
                                isEn={isEn}
                                isLightMode={isLightMode}
                              />
                            </div>
                            <div
                              className={`text-[10px] mt-0.5 ${
                                isLightMode ? 'text-slate-600' : 'text-slate-400'
                              }`}
                            >
                              {isEn ? item.descEn : item.descFa}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 4: MikroTik RouterOS */}
            {/* ========================================================================= */}
            {activeTab === 'mikrotik' && (
              <div className="space-y-4 animate-fadeIn">
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <RouterIcon className="w-4 h-4 text-emerald-400" />
                      <h4
                        className={`text-xs font-bold ${
                          isLightMode ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {isEn
                          ? 'MikroTik RouterOS Capabilities & Safety Modules'
                          : 'اختیارات عملیاتی و ماژول‌های امنیتی میکروتیک'}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAllMikrotikCapabilities(true)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition cursor-pointer"
                      >
                        {isEn ? 'Select All' : 'انتخاب همه'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllMikrotikCapabilities(false)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/5 text-slate-400 border border-white/10 hover:text-white transition cursor-pointer"
                      >
                        {isEn ? 'Deselect All' : 'لغو همه'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      {
                        key: 'canMikrotikSafeMode',
                        labelEn: 'RouterOS Safe Mode Protection',
                        labelFa: 'محافظت حالت امن (Safe Mode)',
                        descEn: 'Automatic rollback on connection loss',
                        descFa: 'بازگردانی خودکار تغییرات در صورت قطعی ارتباط',
                        what: 'Enforces RouterOS Safe Mode during live configuration edits',
                        why: 'Prevents permanent lockouts if an admin misconfigures an IP or firewall',
                      },
                      {
                        key: 'canMikrotikFirewall',
                        labelEn: 'Firewall Filter & NAT Rules',
                        labelFa: 'مدیریت فایروال و رول‌های NAT',
                        descEn: 'Inspect and modify /ip/firewall rules',
                        descFa: 'مشاهده و ویرایش جدول‌های فیلتر و نت',
                        what: 'Permissions to edit /ip/firewall/filter and /ip/firewall/nat',
                        why: 'Direct control over perimeter packet filtering and address translation',
                      },
                      {
                        key: 'canMikrotikBackup',
                        labelEn: 'System Backup & Export (.rsc)',
                        labelFa: 'بکاپ‌گیری و استخراج فایل کانفیگ (.rsc)',
                        descEn: 'Trigger /system/backup and /export scripts',
                        descFa: 'تهیه نسخه پشتیبان باینری و اسکریپت خروجی',
                        what: 'Extract system configuration as binary backup or RSC scripts',
                        why: 'Ensures disaster recovery read/write privileges are restricted',
                      },
                      {
                        key: 'canMikrotikBridgeVlan',
                        labelEn: 'Bridge VLAN Filtering & Ports',
                        labelFa: 'مدیریت Bridge و فیلترینگ VLAN',
                        descEn: 'Configure bridge ports and tagged PVIDs',
                        descFa: 'تغییر تنظیمات پورت‌های بریج و تگ‌های VLAN',
                        what: 'Configure /interface/bridge/vlan and port memberships',
                        why: 'Controls trunk and access tagging on MikroTik CRS switches',
                      },
                      {
                        key: 'canMikrotikToggleInterface',
                        labelEn: 'Enable / Disable Interfaces',
                        labelFa: 'فعال/غیرفعال‌سازی اینترفیس‌های روتر',
                        descEn: 'Toggle Ethernet, SFP, and Tunnel links',
                        descFa: 'روشن یا خاموش کردن پورت‌ها و تانل‌ها',
                        what: 'Enable or disable Ethernet, SFP, and WireGuard/IPsec links',
                        why: 'Prevents unauthorized link toggling on edge routers',
                      },
                      {
                        key: 'canMikrotikComment',
                        labelEn: 'Modify Interface Comments',
                        labelFa: 'ثبت و ویرایش کامنت اینترفیس‌ها',
                        descEn: 'Attach operational notes to interfaces',
                        descFa: 'نوشتن کامنت‌های شناسایی روی خطوط ارتباطی',
                        what: 'Add descriptive comments to MikroTik router interfaces',
                        why: 'Enables safe documentation of interface connections',
                      },
                      {
                        key: 'canMikrotikIpPool',
                        labelEn: 'Manage IP Pools & DHCP Ranges',
                        labelFa: 'مدیریت استخر آی‌پی (IP Pool & DHCP)',
                        descEn: 'Configure /ip/pool address allocations',
                        descFa: 'تغییر و تخصیص رنج‌های آدرس‌دهی شبکه',
                        what: 'Permissions to edit /ip/pool address allocations',
                        why: 'Prevents address exhaustion or duplicate IP assignments',
                      },
                    ].map((item) => {
                      const isChecked = Boolean((draftPolicy as any)[item.key]);
                      return (
                        <label
                          key={item.key}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition select-none ${
                            isChecked
                              ? isLightMode
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-xs'
                                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-200 text-slate-500'
                              : 'bg-slate-900/60 border-white/10 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              setDraftPolicy({
                                ...draftPolicy,
                                [item.key]: e.target.checked,
                              })
                            }
                            className="w-4 h-4 mt-0.5 accent-emerald-500 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span
                                className={`font-bold text-xs ${
                                  isLightMode ? 'text-slate-900' : 'text-white'
                                }`}
                              >
                                {isEn ? item.labelEn : item.labelFa}
                              </span>
                              <FieldInfoTooltip
                                title={isEn ? item.labelEn : item.labelFa}
                                whatIsIt={item.what}
                                whyNeeded={item.why}
                                practicalExample={
                                  isEn
                                    ? 'Safe Mode should always be enabled for junior admins'
                                    : 'سیف مد برای کارشناسان باید همواره روشن باشد'
                                }
                                isEn={isEn}
                                isLightMode={isLightMode}
                              />
                            </div>
                            <div
                              className={`text-[10px] mt-0.5 ${
                                isLightMode ? 'text-slate-600' : 'text-slate-400'
                              }`}
                            >
                              {isEn ? item.descEn : item.descFa}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 5: Linux & Servers Fleet (Phase 3 Full Implementation) */}
            {/* ========================================================================= */}
            {activeTab === 'servers' && (
              <div className="space-y-4 animate-fadeIn">
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-amber-400" />
                      <h4
                        className={`text-xs font-bold ${
                          isLightMode ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {isEn
                          ? 'Default Server Fleet Actions & Linux Privileges'
                          : 'اختیارات پیش‌فرض ناوگان سرورها و لینوکس'}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAllServerDefaultPermissions(true)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition cursor-pointer"
                      >
                        {isEn ? 'Select All' : 'انتخاب همه'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllServerDefaultPermissions(false)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/5 text-slate-400 border border-white/10 hover:text-white transition cursor-pointer"
                      >
                        {isEn ? 'Deselect All' : 'لغو همه'}
                      </button>
                    </div>
                  </div>

                  <p
                    className={`text-[11px] mb-4 ${
                      isLightMode ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    {isEn
                      ? 'Configure default action permissions applied across all authorized Linux and Windows servers.'
                      : 'پیکربندی سطح دسترسی پیش‌فرض که بر روی کلیه سرورهای لینوکس و ویندوز مجاز اعمال می‌گردد.'}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {SERVER_ACTIONS_CATALOG.map((action) => {
                      const isChecked = Boolean(
                        draftPolicy.defaultServerPermissions &&
                          (draftPolicy.defaultServerPermissions as any)[action.key]
                      );
                      return (
                        <label
                          key={action.key}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition select-none ${
                            isChecked
                              ? isLightMode
                                ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-xs'
                                : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-200 text-slate-500'
                              : 'bg-slate-900/60 border-white/10 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const isAdd = action.key === 'add_server';
                              setDraftPolicy({
                                ...draftPolicy,
                                canAddServer: isAdd ? e.target.checked : draftPolicy.canAddServer,
                                defaultServerPermissions: {
                                  ...draftPolicy.defaultServerPermissions,
                                  [action.key]: e.target.checked,
                                },
                              });
                            }}
                            className="w-4 h-4 mt-0.5 accent-amber-500 rounded cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span
                                className={`font-bold text-xs ${
                                  isLightMode ? 'text-slate-900' : 'text-white'
                                }`}
                              >
                                {isEn ? action.labelEn : action.labelFa}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {action.danger && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono font-bold">
                                    {isEn ? 'HIGH RISK' : 'حساس'}
                                  </span>
                                )}
                                <FieldInfoTooltip
                                  title={isEn ? action.labelEn : action.labelFa}
                                  whatIsIt={
                                    isEn
                                      ? action.tooltipWhatEn || action.descriptionEn
                                      : action.tooltipWhatFa || action.descriptionFa
                                  }
                                  whyNeeded={
                                    isEn
                                      ? action.tooltipWhyEn || 'Defines operational authority for server actions across the fleet.'
                                      : action.tooltipWhyFa || 'تعیین سطح اختیارات اجرایی بر روی ناوگان سرورهای متصل.'
                                  }
                                  practicalExample={
                                    isEn
                                      ? action.tooltipExampleEn || 'Configured according to administrator role and responsibility.'
                                      : action.tooltipExampleFa || 'تنظیم بر مبنای مسئولیت‌های تخصصی تیم‌های عملیات و پشتیبانی.'
                                  }
                                />
                              </div>
                            </div>
                            <div
                              className={`text-[10px] mt-0.5 ${
                                isLightMode ? 'text-slate-600' : 'text-slate-400'
                              }`}
                            >
                              {isEn ? action.descriptionEn : action.descriptionFa}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* ========================================================================= */}
                {/* Permitted Target Servers Fleet Scope & Selection */}
                {/* ========================================================================= */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-cyan-400" />
                      <h4
                        className={`text-xs font-bold ${
                          isLightMode ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {isEn
                          ? 'Authorized Server Fleet Scope & Permitted Servers'
                          : 'محدوده سرورهای مجاز ناوگان و انتخاب سرورهای هدف'}
                      </h4>
                      <FieldInfoTooltip
                        title={isEn ? 'Authorized Server Scope' : 'محدوده سرورهای مجاز'}
                        whatIsIt={
                          isEn
                            ? 'Specifies whether users under this policy can access all servers in the fleet or only specific selected server nodes in Remote Servers & Automation Fleet.'
                            : 'مشخص می‌کند آیا کاربران دارای این پالیسی به تمام سرورهای ناوگان دسترسی دارند یا فقط سرورهای مشخص انتخاب شده را در صفحه ناوگان سرورها مشاهده و مدیریت می‌کنند.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Prevents unauthorized viewing or management of sensitive compute nodes, ensuring strict multi-tenant isolation and least-privilege boundaries.'
                            : 'جلوگیری از مشاهده یا مدیریت غیرمجاز نودهای پردازشی حساس و تضمین حریم امنیتی حداقل اختیارات (Least Privilege).'
                        }
                        practicalExample={
                          isEn
                            ? 'Select "Specific Selected Servers" and check only database servers for DBA teams, or web nodes for frontend developers.'
                            : 'انتخاب «سرورهای انتخاب شده» و تیک زدن فقط سرورهای پایگاه داده برای تیم DBA یا وب‌سرورها برای توسعه‌دهندگان وب.'
                        }
                      />
                    </div>

                    {/* Scope Toggle: All vs Specific */}
                    <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/40 border border-white/10">
                      <button
                        type="button"
                        onClick={() =>
                          setDraftPolicy({
                            ...draftPolicy,
                            targetServerScope: 'all',
                            targetServerIds: [],
                          })
                        }
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                          (draftPolicy.targetServerScope || 'all') === 'all'
                            ? 'bg-cyan-500 text-white shadow-xs'
                            : isLightMode
                            ? 'text-slate-600 hover:text-slate-900'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {isEn ? 'All Fleet Servers' : 'کلیه سرورهای ناوگان'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftPolicy({
                            ...draftPolicy,
                            targetServerScope: 'specific',
                            targetServerIds: draftPolicy.targetServerIds || [],
                          })
                        }
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                          draftPolicy.targetServerScope === 'specific'
                            ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                            : isLightMode
                            ? 'text-slate-600 hover:text-slate-900'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {isEn ? 'Specific Selected Servers' : 'سرورهای انتخاب شده'}
                      </button>
                    </div>
                  </div>

                  <p
                    className={`text-[11px] mb-3 ${
                      isLightMode ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    {(draftPolicy.targetServerScope || 'all') === 'all'
                      ? isEn
                        ? 'Unrestricted Scope: Users assigned this policy can view, inspect, and manage all current and future servers in the Remote Servers & Automation Fleet.'
                        : 'محدوده عمومی و کامل: کاربران این پالیسی به تمامی سرورهای فعلی و آینده در صفحه Remote Servers & Automation Fleet دسترسی داشته و آن‌ها را در لیست ناوگان می‌بینند.'
                      : isEn
                        ? 'Restricted Scope: Users will ONLY see, inspect, and execute allowed actions on the servers explicitly selected below in the Remote Servers & Automation Fleet list.'
                        : 'محدوده اختصاصی و محدودشده: کاربران منحصراً سرورهایی را که در فهرست زیر انتخاب شده‌اند در لیست Remote Servers & Automation Fleet مشاهده نموده و روی آن‌ها دسترسی خواهند داشت.'}
                  </p>

                  {/* If Specific is selected, render search, bulk actions, and server cards */}
                  {draftPolicy.targetServerScope === 'specific' && (
                    <div className="space-y-3 pt-3 border-t border-white/10">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-amber-400">
                            {isEn ? 'Permitted Server Selection:' : 'انتخاب سرورهای مجاز ناوگان:'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {isEn
                              ? `${(draftPolicy.targetServerIds || []).length} of ${allAvailableServers.length} Selected`
                              : `${(draftPolicy.targetServerIds || []).length} از ${allAvailableServers.length} سرور انتخاب شده`}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute right-2.5 top-2 text-slate-400 pointer-events-none" />
                            <input
                              type="text"
                              value={serverScopeSearch}
                              onChange={(e) => setServerScopeSearch(e.target.value)}
                              placeholder={isEn ? 'Filter by name, IP, OS...' : 'جستجوی نام، IP، توزیع...'}
                              className={`w-44 sm:w-56 pl-3 pr-8 py-1 rounded-lg text-xs border outline-none transition ${
                                isLightMode
                                  ? 'bg-slate-50 border-slate-300 text-slate-800 focus:border-amber-500'
                                  : 'bg-slate-900 border-white/15 text-white focus:border-amber-400'
                              }`}
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setDraftPolicy({
                                ...draftPolicy,
                                targetServerIds: allAvailableServers.map((s) => s.id),
                              })
                            }
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition cursor-pointer whitespace-nowrap"
                          >
                            {isEn ? 'Select All' : 'انتخاب همه'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftPolicy({
                                ...draftPolicy,
                                targetServerIds: [],
                              })
                            }
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/5 text-slate-400 border border-white/10 hover:text-white transition cursor-pointer whitespace-nowrap"
                          >
                            {isEn ? 'Deselect All' : 'لغو همه'}
                          </button>
                        </div>
                      </div>

                      {filteredServersForScope.length === 0 ? (
                        <div className="p-4 text-center rounded-xl bg-white/5 border border-white/10 text-xs text-slate-400">
                          {isEn ? 'No remote servers match the search criteria.' : 'هیچ سروری مطابق با فیلتر جستجو یافت نشد.'}
                        </div>
                      ) : (
                        <div className="max-h-64 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 p-1 pr-2">
                          {filteredServersForScope.map((server) => {
                            const isSelected = (draftPolicy.targetServerIds || []).includes(server.id);
                            return (
                              <label
                                key={server.id}
                                className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer select-none transition ${
                                  isSelected
                                    ? isLightMode
                                      ? 'bg-amber-50 border-amber-400 text-amber-950 shadow-xs'
                                      : 'bg-amber-500/15 border-amber-500/50 text-amber-100 shadow-xs shadow-amber-500/10'
                                    : isLightMode
                                    ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                    : 'bg-slate-900/60 border-white/10 text-slate-300 hover:bg-slate-900'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const current = draftPolicy.targetServerIds || [];
                                    const next = e.target.checked
                                      ? [...current, server.id]
                                      : current.filter((id) => id !== server.id);
                                    setDraftPolicy({
                                      ...draftPolicy,
                                      targetServerIds: next,
                                    });
                                  }}
                                  className="w-4 h-4 mt-0.5 accent-amber-500 rounded cursor-pointer"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-xs truncate">
                                      {server.name}
                                    </span>
                                    <span
                                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold uppercase ${
                                        server.os_type === 'windows'
                                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                      }`}
                                    >
                                      {server.os_distro || server.os_type}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1">
                                    <span>{server.ip}</span>
                                    <span className="truncate max-w-[100px] text-slate-500">
                                      {server.hostname || server.environment || 'production'}
                                    </span>
                                  </div>
                                  {Array.isArray(server.tags) && server.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {server.tags.slice(0, 3).map((tag) => (
                                        <span
                                          key={tag}
                                          className="text-[8px] px-1 py-0.2 rounded bg-white/5 border border-white/10 text-slate-400"
                                        >
                                          #{tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 6: Global & Templates (Phase 3 Full Implementation) */}
            {/* ========================================================================= */}
            {activeTab === 'global' && (
              <div className="space-y-4 animate-fadeIn">
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileCode2 className="w-4 h-4 text-purple-400" />
                      <h4
                        className={`text-xs font-bold ${
                          isLightMode ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {isEn
                          ? 'Global Infrastructure Operations & Config Templates Governance'
                          : 'عملیات عمومی زیرساخت و اختیارات الگوهای کانفیگ'}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAllGlobalCapabilities(true)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition cursor-pointer"
                      >
                        {isEn ? 'Select All' : 'انتخاب همه'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllGlobalCapabilities(false)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/5 text-slate-400 border border-white/10 hover:text-white transition cursor-pointer"
                      >
                        {isEn ? 'Deselect All' : 'لغو همه'}
                      </button>
                    </div>
                  </div>

                  <p
                    className={`text-[11px] mb-4 ${
                      isLightMode ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    {isEn
                      ? 'Controls configuration template deployment (including registration veto), template export/import packages, and disaster recovery snapshots.'
                      : 'کنترل اعمال قالب‌های کانفیگ (از جمله قفل اعمال تمپلیت در ثبت تجهیز)، پکیج‌های اکسپورت/ایمپورت الگوها و پشتیبان‌گیری کل سیستم.'}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      {
                        key: 'canApplyTemplates',
                        labelEn: 'Apply Configuration Templates',
                        labelFa: 'اعمال الگوها و اسکریپت‌های کانفیگ (Templates)',
                        descEn:
                          'Enables template deployment and initial config during device registration',
                        descFa:
                          'مجوز ارسال قالب به تجهیزات و باز شدن قفل تمپلیت اولیه در ثبت تجهیز',
                        what: 'Push templated CLI scripts with variable substitution to devices',
                        why: 'Controls automated device provisioning and initial configuration locks',
                      },
                      {
                        key: 'canExportTemplates',
                        labelEn: 'Export Config Templates Package',
                        labelFa: 'استخراج و خروجی الگوهای کانفیگ (Export)',
                        descEn: 'Download configuration templates package as JSON',
                        descFa: 'مجوز استخراج و دانلود بانک تمپلیت‌ها به فرمت JSON',
                        what: 'Export single or bundled CLI template packages to external JSON files',
                        why: 'Protects proprietary networking scripts against unauthorized exfiltration',
                      },
                      {
                        key: 'canImportTemplates',
                        labelEn: 'Import Config Templates Package',
                        labelFa: 'ورود و بارگذاری الگوهای کانفیگ (Import)',
                        descEn: 'Upload and register templates from JSON package',
                        descFa: 'مجوز افزودن و بارگذاری تمپلیت‌های جدید از فایل بسته',
                        what: 'Upload and register external template packages into the database',
                        why: 'Guards against unauthorized insertion of unverified CLI scripts',
                      },
                      {
                        key: 'canManageDevices',
                        labelEn: 'Manage Equipment (Add, Edit, Delete)',
                        labelFa: 'مدیریت تجهیزات (ثبت، ویرایش و حذف)',
                        descEn: 'Full lifecycle administration of network hardware',
                        descFa: 'امکان ثبت دستگاه جدید، تغییر مشخصات و حذف از نقشه',
                        what: 'Authoritative lifecycle permissions for network switches and routers',
                        why: 'Restricts registering unvetted hardware or deleting live production nodes',
                      },
                      {
                        key: 'canExportBackup',
                        labelEn: 'Export Disaster Recovery Backup',
                        labelFa: 'خروجی بکاپ جامع دیتابیس و شبکه',
                        descEn: 'Generate full encrypted disaster recovery snapshots',
                        descFa: 'تولید پکیج بکاپ کامل سیستم برای بازیابی فاجعه',
                        what: 'Download comprehensive encrypted system database archives',
                        why: 'High-security capability containing complete infrastructure state',
                      },
                      {
                        key: 'canImportBackup',
                        labelEn: 'Import & Restore Network Backup',
                        labelFa: 'بازگردانی و ریستور نسخه پشتیبان',
                        descEn: 'Restore application state from archive package',
                        descFa: 'اعمال و ریستور دیتابیس از روی فایل بکاپ',
                        what: 'Overwrites active application state with restored archive data',
                        why: 'Critical operation that replaces current configuration and devices',
                      },
                      {
                        key: 'canExportDevices',
                        labelEn: 'Export Device Inventory (JSON/CSV)',
                        labelFa: 'خروجی لیست و مشخصات تجهیزات',
                        descEn: 'Download switch/router inventory catalog',
                        descFa: 'دریافت خروجی ساختاریافته از مشخصات فنی تجهیزات',
                        what: 'Export network equipment specifications to CSV or JSON',
                        why: 'Controls access to infrastructure inventory and IP allocations',
                      },
                      {
                        key: 'canImportDevices',
                        labelEn: 'Import Device Inventory (JSON/CSV)',
                        labelFa: 'ورود و بارگذاری دسته‌ای تجهیزات',
                        descEn: 'Bulk register equipment via CSV or JSON',
                        descFa: 'ثبت و بارگذاری دسته‌ای تجهیزات از طریق فایل یا متن',
                        what: 'Bulk import equipment specifications into the network catalog',
                        why: 'Enforces change control on mass inventory additions',
                      },
                      {
                        key: 'canExportServers',
                        labelEn: 'Export Server Fleet Specifications',
                        labelFa: 'خروجی مشخصات ناوگان سرورها',
                        descEn: 'Download server inventory and services list',
                        descFa: 'دریافت خروجی ساختاریافته از مشخصات و IPهای سرورها',
                        what: 'Export server fleet records to CSV or JSON',
                        why: 'Protects server network topology and service inventory',
                      },
                      {
                        key: 'canImportServers',
                        labelEn: 'Import Server Fleet Specifications',
                        labelFa: 'ورود و بارگذاری سرورهای ریموت',
                        descEn: 'Bulk register servers via CSV or JSON',
                        descFa: 'بارگذاری و افزودن سرورها از طریق فایل داده‌ها',
                        what: 'Bulk import remote servers into the fleet management catalog',
                        why: 'Controls registration of new Linux and Windows servers',
                      },
                      {
                        key: 'canBatchOperate',
                        labelEn: 'Multi-Device Bulk Operations',
                        labelFa: 'عملیات گروهی و همزمان چند تجهیز',
                        descEn: 'Execute simultaneous actions across multiple nodes',
                        descFa: 'صدور فرمان همزمان روی دسته‌ای از تجهیزات شبکه',
                        what: 'Allows sending commands or state changes to multiple devices at once',
                        why: 'High-impact operation that affects multiple network nodes concurrently',
                      },
                    ].map((item) => {
                      const isChecked = Boolean((draftPolicy as any)[item.key]);
                      return (
                        <label
                          key={item.key}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition select-none ${
                            isChecked
                              ? isLightMode
                                ? 'bg-purple-50 border-purple-300 text-purple-900 shadow-xs'
                                : 'bg-purple-500/15 border-purple-500/40 text-purple-200'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-200 text-slate-500'
                              : 'bg-slate-900/60 border-white/10 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              setDraftPolicy({
                                ...draftPolicy,
                                [item.key]: e.target.checked,
                              })
                            }
                            className="w-4 h-4 mt-0.5 accent-purple-500 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span
                                className={`font-bold text-xs ${
                                  isLightMode ? 'text-slate-900' : 'text-white'
                                }`}
                              >
                                {isEn ? item.labelEn : item.labelFa}
                              </span>
                              <FieldInfoTooltip
                                title={isEn ? item.labelEn : item.labelFa}
                                whatIsIt={item.what}
                                whyNeeded={item.why}
                                practicalExample={
                                  isEn
                                    ? 'Permitted for Core Admins; disabled for Helpdesk'
                                    : 'مجاز برای مدیران ارشد؛ غیرمجاز برای پشتیبانی عادی'
                                }
                                isEn={isEn}
                                isLightMode={isLightMode}
                              />
                            </div>
                            <div
                              className={`text-[10px] mt-0.5 ${
                                isLightMode ? 'text-slate-600' : 'text-slate-400'
                              }`}
                            >
                              {isEn ? item.descEn : item.descFa}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 7: Granular Overrides Matrix (Phase 3 Full Implementation) */}
            {/* ========================================================================= */}
            {activeTab === 'matrix' && (
              <div className="space-y-4 animate-fadeIn">
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-rose-400" />
                      <h4
                        className={`text-xs font-bold ${
                          isLightMode ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {isEn
                          ? 'Granular Per-Device & Per-Server Override Matrix'
                          : 'ماتریس اختیارات تفکیکی به ازای هر تجهیز یا سرور مجزا'}
                      </h4>
                    </div>

                    {/* Sub-mode selector (Equipment vs Servers) */}
                    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-black/20 border border-white/10">
                      <button
                        type="button"
                        onClick={() => setMatrixSubTab('devices')}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                          matrixSubTab === 'devices'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {isEn ? 'Network Equipment' : 'تجهیزات شبکه'} (
                        {Object.keys(draftPolicy.perDevicePermissions || {}).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setMatrixSubTab('servers')}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                          matrixSubTab === 'servers'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {isEn ? 'Remote Server Fleet' : 'ناوگان سرورها'} (
                        {Object.keys(draftPolicy.perServerPermissions || {}).length})
                      </button>
                    </div>
                  </div>

                  {/* Sub-tab A: Network Equipment Matrix */}
                  {matrixSubTab === 'devices' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="relative flex-1 min-w-[200px]">
                          <Search className="w-3.5 h-3.5 absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={matrixDeviceSearch}
                            onChange={(e) => setMatrixDeviceSearch(e.target.value)}
                            placeholder={isEn ? 'Search devices by name, IP, platform...' : 'جستجوی تجهیز بر اساس نام، IP یا پلتفرم...'}
                            className="w-full pl-8 pr-8 py-1.5 rounded-lg text-xs bg-slate-900 border border-white/15 text-white"
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setMatrixDeviceFilter('all')}
                            className={`px-2 py-1 rounded text-[10px] font-semibold border ${
                              matrixDeviceFilter === 'all'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                : 'bg-white/5 text-slate-400 border-white/10'
                            }`}
                          >
                            {isEn ? 'All' : 'همه'} ({devices.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setMatrixDeviceFilter('custom_only')}
                            className={`px-2 py-1 rounded text-[10px] font-semibold border ${
                              matrixDeviceFilter === 'custom_only'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                : 'bg-white/5 text-slate-400 border-white/10'
                            }`}
                          >
                            {isEn ? 'Custom Overrides' : 'دارای استثنا'} (
                            {Object.keys(draftPolicy.perDevicePermissions || {}).length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setMatrixDeviceFilter('default_only')}
                            className={`px-2 py-1 rounded text-[10px] font-semibold border ${
                              matrixDeviceFilter === 'default_only'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                : 'bg-white/5 text-slate-400 border-white/10'
                            }`}
                          >
                            {isEn ? 'Default' : 'پیش‌فرض'}
                          </button>
                        </div>
                      </div>

                      {/* Device List with action toggle buttons */}
                      <div className="space-y-2 max-h-80 overflow-y-auto p-1">
                        {matrixFilteredDevices.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-400">
                            {isEn ? 'No devices found' : 'تجهیزی یافت نشد'}
                          </div>
                        ) : (
                          matrixFilteredDevices.map((dev) => {
                            const hasCustom = Boolean(
                              draftPolicy.perDevicePermissions?.[dev.id] &&
                                Object.keys(draftPolicy.perDevicePermissions[dev.id]).length > 0
                            );
                            const devPerms = draftPolicy.perDevicePermissions?.[dev.id] || {};

                            return (
                              <div
                                key={dev.id}
                                className={`p-3 rounded-xl border space-y-2 transition ${
                                  hasCustom
                                    ? isLightMode
                                      ? 'bg-rose-50/70 border-rose-300 text-slate-900'
                                      : 'bg-rose-950/20 border-rose-500/40 text-white'
                                    : isLightMode
                                    ? 'bg-slate-50 border-slate-200 text-slate-800'
                                    : 'bg-slate-900/50 border-white/10 text-slate-300'
                                }`}
                              >
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <HardDrive className="w-4 h-4 text-cyan-400" />
                                    <span className="font-bold text-xs">{dev.name}</span>
                                    <span className="text-[10px] font-mono text-slate-400">
                                      {dev.ip}
                                    </span>
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
                                      {dev.platform}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    {hasCustom ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const next = { ...(draftPolicy.perDevicePermissions || {}) };
                                          delete next[dev.id];
                                          setDraftPolicy({
                                            ...draftPolicy,
                                            perDevicePermissions: next,
                                          });
                                        }}
                                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 flex items-center gap-1 cursor-pointer"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        <span>{isEn ? 'Reset to Default' : 'ریست به پیش‌فرض'}</span>
                                      </button>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 font-semibold">
                                        {isEn ? 'Inherits General Policy' : 'پیروی از پالیسی عمومی'}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Action Badges Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 pt-1">
                                  {generalEquipmentActions.map((action) => {
                                    const isAllowed = hasCustom
                                      ? devPerms[action.key as NetworkDeviceActionKey] !== false
                                      : draftPolicy.defaultDevicePermissions
                                      ? draftPolicy.defaultDevicePermissions[action.key as NetworkDeviceActionKey] !== false
                                      : true;

                                    return (
                                      <button
                                        key={action.key}
                                        type="button"
                                        onClick={() => {
                                          const current = draftPolicy.perDevicePermissions?.[dev.id] || {
                                            ...(draftPolicy.defaultDevicePermissions || {}),
                                          };
                                          const nextVal = !isAllowed;
                                          setDraftPolicy({
                                            ...draftPolicy,
                                            perDevicePermissions: {
                                              ...(draftPolicy.perDevicePermissions || {}),
                                              [dev.id]: {
                                                ...current,
                                                [action.key]: nextVal,
                                              },
                                            },
                                          });
                                        }}
                                        className={`flex items-center justify-between p-1.5 rounded-lg border text-[11px] font-medium transition cursor-pointer select-none ${
                                          isAllowed
                                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                            : 'bg-rose-500/15 border-rose-500/30 text-rose-300 opacity-80'
                                        }`}
                                      >
                                        <span className="truncate">{action.shortLabelEn || action.key}</span>
                                        {isAllowed ? (
                                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                        ) : (
                                          <X className="w-3 h-3 text-rose-400 shrink-0" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* Sub-tab B: Remote Server Fleet Matrix */}
                  {matrixSubTab === 'servers' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="relative flex-1 min-w-[200px]">
                          <Search className="w-3.5 h-3.5 absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={matrixServerSearch}
                            onChange={(e) => setMatrixServerSearch(e.target.value)}
                            placeholder={isEn ? 'Search servers by name, IP, OS...' : 'جستجوی سرور بر اساس نام، IP یا سیستم‌عامل...'}
                            className="w-full pl-8 pr-8 py-1.5 rounded-lg text-xs bg-slate-900 border border-white/15 text-white"
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setMatrixServerFilter('all')}
                            className={`px-2 py-1 rounded text-[10px] font-semibold border ${
                              matrixServerFilter === 'all'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                : 'bg-white/5 text-slate-400 border-white/10'
                            }`}
                          >
                            {isEn ? 'All' : 'همه'} ({liveServers.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setMatrixServerFilter('custom_only')}
                            className={`px-2 py-1 rounded text-[10px] font-semibold border ${
                              matrixServerFilter === 'custom_only'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                : 'bg-white/5 text-slate-400 border-white/10'
                            }`}
                          >
                            {isEn ? 'Custom Overrides' : 'دارای استثنا'} (
                            {Object.keys(draftPolicy.perServerPermissions || {}).length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setMatrixServerFilter('default_only')}
                            className={`px-2 py-1 rounded text-[10px] font-semibold border ${
                              matrixServerFilter === 'default_only'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                : 'bg-white/5 text-slate-400 border-white/10'
                            }`}
                          >
                            {isEn ? 'Default' : 'پیش‌فرض'}
                          </button>
                        </div>
                      </div>

                      {/* Server List with action toggle buttons */}
                      <div className="space-y-2 max-h-80 overflow-y-auto p-1">
                        {matrixFilteredServers.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-400">
                            {isEn ? 'No remote servers found' : 'سروری یافت نشد'}
                          </div>
                        ) : (
                          matrixFilteredServers.map((srv) => {
                            const hasCustom = Boolean(
                              draftPolicy.perServerPermissions?.[srv.id] &&
                                Object.keys(draftPolicy.perServerPermissions[srv.id]).length > 0
                            );
                            const srvPerms = draftPolicy.perServerPermissions?.[srv.id] || {};

                            return (
                              <div
                                key={srv.id}
                                className={`p-3 rounded-xl border space-y-2 transition ${
                                  hasCustom
                                    ? isLightMode
                                      ? 'bg-rose-50/70 border-rose-300 text-slate-900'
                                      : 'bg-rose-950/20 border-rose-500/40 text-white'
                                    : isLightMode
                                    ? 'bg-slate-50 border-slate-200 text-slate-800'
                                    : 'bg-slate-900/50 border-white/10 text-slate-300'
                                }`}
                              >
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <Server className="w-4 h-4 text-amber-400" />
                                    <span className="font-bold text-xs">{srv.name}</span>
                                    <span className="text-[10px] font-mono text-slate-400">
                                      {srv.ip}
                                    </span>
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                                      {srv.os || 'Linux'}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    {hasCustom ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const next = { ...(draftPolicy.perServerPermissions || {}) };
                                          delete next[srv.id];
                                          setDraftPolicy({
                                            ...draftPolicy,
                                            perServerPermissions: next,
                                          });
                                        }}
                                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 flex items-center gap-1 cursor-pointer"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        <span>{isEn ? 'Reset to Default' : 'ریست به پیش‌فرض'}</span>
                                      </button>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 font-semibold">
                                        {isEn ? 'Inherits General Policy' : 'پیروی از پالیسی عمومی'}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Server Action Badges Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                                  {SERVER_ACTIONS_CATALOG.map((action) => {
                                    const isAllowed = hasCustom
                                      ? srvPerms[action.key as ServerActionKey] !== false
                                      : draftPolicy.defaultServerPermissions
                                      ? draftPolicy.defaultServerPermissions[action.key as ServerActionKey] !== false
                                      : true;

                                    return (
                                      <button
                                        key={action.key}
                                        type="button"
                                        onClick={() => {
                                          const current = draftPolicy.perServerPermissions?.[srv.id] || {
                                            ...(draftPolicy.defaultServerPermissions || {}),
                                          };
                                          const nextVal = !isAllowed;
                                          setDraftPolicy({
                                            ...draftPolicy,
                                            perServerPermissions: {
                                              ...(draftPolicy.perServerPermissions || {}),
                                              [srv.id]: {
                                                ...current,
                                                [action.key]: nextVal,
                                              },
                                            },
                                          });
                                        }}
                                        className={`flex items-center justify-between p-1.5 rounded-lg border text-[11px] font-medium transition cursor-pointer select-none ${
                                          isAllowed
                                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                            : 'bg-rose-500/15 border-rose-500/30 text-rose-300 opacity-80'
                                        }`}
                                      >
                                        <span className="truncate">{action.labelEn.split(' ')[0]}</span>
                                        {isAllowed ? (
                                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                        ) : (
                                          <X className="w-3 h-3 text-rose-400 shrink-0" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sticky Modal Footer with Actions */}
          <div
            className={`p-4 border-t flex items-center justify-between gap-3 shrink-0 ${
              isLightMode
                ? 'bg-white border-slate-200'
                : 'bg-slate-950/90 border-white/10'
            }`}
          >
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`text-[11px] ${
                  isLightMode ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                {isEn ? 'Active Tab:' : 'بخش فعال:'}
              </span>
              <span className="font-semibold text-indigo-400">
                {tabsConfig.find((t) => t.id === activeTab)?.labelEn}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  isLightMode
                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 transition shadow-lg shadow-indigo-600/30 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>
                  {isSaving
                    ? isEn
                      ? 'Saving to Database...'
                      : 'در حال ذخیره‌سازی...'
                    : isEn
                    ? 'Save Policy'
                    : 'ثبت و ذخیره پالیسی'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
