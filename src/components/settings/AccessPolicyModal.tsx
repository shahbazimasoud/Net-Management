import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Plus,
  Maximize2,
  Minimize2,
  Check,
  RefreshCw,
  ShieldCheck,
  Compass,
  Terminal,
  Router as RouterIcon,
  Server,
  FileCode2,
  Sliders,
  ChevronDown,
  ChevronUp,
  Clock,
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
  Copy,
  BookmarkPlus,
  ShieldAlert,
  Monitor,
  ScrollText,
  FileCheck,
  Paperclip,
  Bell,
  Megaphone,
  Send,
  Video,
  Headphones,
  ShieldBan,
  UserX,
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
  ContractItem,
  LicenseItem,
  SslCertificateItem,
  ActionAccessDecision,
  ApprovalWorkflowStageConfig,
  HelpdeskExceptionRule,
} from '../../types';
import { useLanguage } from '../../i18n';
import { useModalDock } from '../../context/ModalDockContext';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { ApprovalChainBuilder } from './ApprovalChainBuilder';
import { HelpdeskExceptionsModal } from '../helpdesk/HelpdeskExceptionsModal';
import {
  SERVER_ACTIONS_CATALOG,
  DEVICE_ACTIONS_CATALOG,
  FULL_SERVER_PERMISSIONS,
  RESTRICTED_SERVER_PERMISSIONS,
  FULL_DEVICE_PERMISSIONS,
  RESTRICTED_DEVICE_PERMISSIONS,
  isDeviceActionPermitted,
  evaluateDeviceActionDecision,
  countPolicyApprovalRules,
} from '../../utils/rbac';
import {
  fetchActiveDirectoryConfig,
  fetchContractsApi,
  fetchHelpdeskExceptions,
  fetchLicensesApi,
  fetchSslCertificatesApi,
} from '../../services/api';

export type PolicyModalTab =
  | 'identity'
  | 'navigation'
  | 'contracts_licenses'
  | 'helpdesk'
  | 'servers'
  | 'global'
  | 'matrix'
  | 'approvals';

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
  liveContracts?: ContractItem[];
  liveLicenses?: LicenseItem[];
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
  liveContracts = [],
  liveLicenses = [],
}) => {
  const { isRtl, isEn } = useLanguage();
  const { dockModal, undockModal } = useModalDock();

  const isLightMode =
    propIsLightMode ??
    (typeof document !== 'undefined' &&
      (document.querySelector('.theme-light') !== null ||
        document.documentElement.classList.contains('light') ||
        localStorage.getItem('panel_theme') === 'light' ||
        localStorage.getItem('theme_mode') === 'light'));

  const [activeTab, setActiveTab] = useState<PolicyModalTab>('identity');
  const [isMaximized, setIsMaximized] = useState(false);

  const [contractsList, setContractsList] = useState<ContractItem[]>(liveContracts || []);
  const [licensesList, setLicensesList] = useState<LicenseItem[]>(liveLicenses || []);
  const [sslCertsList, setSslCertsList] = useState<SslCertificateItem[]>([]);
  const [contractsSearch, setContractsSearch] = useState('');
  const [licensesSearch, setLicensesSearch] = useState('');
  const [sslCertsSearch, setSslCertsSearch] = useState('');
  const [isLoadingContractsLicenses, setIsLoadingContractsLicenses] = useState(false);

  // Tab: HelpDesk Scope & Rules inputs & Global Exceptions Modal state
  const [hdAllowedIpInput, setHdAllowedIpInput] = useState('');
  const [hdBlockedIpInput, setHdBlockedIpInput] = useState('');
  const [hdAllowedGroupInput, setHdAllowedGroupInput] = useState('');
  const [hdAllowedUserInput, setHdAllowedUserInput] = useState('');
  const [hdBlockedGroupInput, setHdBlockedGroupInput] = useState('');
  const [hdBlockedUserInput, setHdBlockedUserInput] = useState('');
  const [hdBlockedLocalUserInput, setHdBlockedLocalUserInput] = useState('');
  const [hdCatalogSearch, setHdCatalogSearch] = useState('');
  const [isExceptionsModalOpen, setIsExceptionsModalOpen] = useState(false);
  const [globalExceptionsCount, setGlobalExceptionsCount] = useState(0);
  const [canManageGlobalExceptions, setCanManageGlobalExceptions] = useState(true);

  const [draftPolicy, setDraftPolicy] = useState<AccessPolicy | null>(() => {
    if (!initialPolicy) return null;
    return {
      ...initialPolicy,
      subjectIds: Array.isArray(initialPolicy.subjectIds) && initialPolicy.subjectIds.length > 0
        ? initialPolicy.subjectIds
        : (initialPolicy.subjectId ? [initialPolicy.subjectId] : []),
      subjectNames: Array.isArray(initialPolicy.subjectNames) && initialPolicy.subjectNames.length > 0
        ? initialPolicy.subjectNames
        : (initialPolicy.subjectName ? [initialPolicy.subjectName] : []),
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
      canAddDevice:
        initialPolicy.canAddDevice ??
        Boolean(initialPolicy.defaultDevicePermissions?.add_device ?? initialPolicy.canManageDevices),
      canBulkConfigureDevices:
        initialPolicy.canBulkConfigureDevices ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canBulkConfigureServers:
        initialPolicy.canBulkConfigureServers ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canManageNavigationGovernance:
        initialPolicy.canManageNavigationGovernance ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canViewContracts: initialPolicy.canViewContracts ?? true,
      canViewLicenses: initialPolicy.canViewLicenses ?? true,
      canViewSslCertificates: initialPolicy.canViewSslCertificates ?? true,
      canViewHelpdesk:
        initialPolicy.canViewHelpdesk ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canViewHelpdeskUsers:
        initialPolicy.canViewHelpdeskUsers ??
        Boolean(
          initialPolicy.id === 'policy-super-admin' ||
            (initialPolicy.priority || 0) >= 100 ||
            (initialPolicy.canViewHelpdesk && initialPolicy.canInspectHelpdeskDomainUsers)
        ),
      canViewHelpdeskGroups:
        initialPolicy.canViewHelpdeskGroups ??
        Boolean(
          initialPolicy.id === 'policy-super-admin' ||
            (initialPolicy.priority || 0) >= 100 ||
            (initialPolicy.canViewHelpdesk && initialPolicy.canInspectHelpdeskDomainUsers)
        ),
      canRunHelpdeskDiagnostics:
        initialPolicy.canRunHelpdeskDiagnostics ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canExecuteHelpdeskActions:
        initialPolicy.canExecuteHelpdeskActions ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canViewHelpdeskEventViewer:
        initialPolicy.canViewHelpdeskEventViewer ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canTerminateHelpdeskProcesses:
        initialPolicy.canTerminateHelpdeskProcesses ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canCleanHelpdeskTemp:
        initialPolicy.canCleanHelpdeskTemp ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canRunHelpdeskGpupdate:
        initialPolicy.canRunHelpdeskGpupdate ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canRunHelpdeskSystemRepair:
        initialPolicy.canRunHelpdeskSystemRepair ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canInspectHelpdeskDomainUsers:
        initialPolicy.canInspectHelpdeskDomainUsers ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canUnlockHelpdeskDomainUsers:
        initialPolicy.canUnlockHelpdeskDomainUsers ??
        Boolean(
          initialPolicy.id === 'policy-super-admin' ||
            (initialPolicy.priority || 0) >= 100 ||
            (initialPolicy.canViewHelpdesk &&
              initialPolicy.canInspectHelpdeskDomainUsers &&
              initialPolicy.canExecuteHelpdeskActions)
        ),
      canPowerControlHelpdeskEndpoints:
        initialPolicy.canPowerControlHelpdeskEndpoints ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canManageHelpdeskExceptions:
        initialPolicy.canManageHelpdeskExceptions ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canSendHelpdeskMessage:
        initialPolicy.canSendHelpdeskMessage ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canViewAllHelpdeskHistory:
        initialPolicy.canViewAllHelpdeskHistory ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      targetHelpdeskIpScope: initialPolicy.targetHelpdeskIpScope === 'selected' ? 'selected' : 'all',
      allowedHelpdeskIps: Array.isArray(initialPolicy.allowedHelpdeskIps) ? initialPolicy.allowedHelpdeskIps : [],
      blockedHelpdeskIps: Array.isArray(initialPolicy.blockedHelpdeskIps) ? initialPolicy.blockedHelpdeskIps : [],
      targetHelpdeskAdScope: initialPolicy.targetHelpdeskAdScope === 'selected' ? 'selected' : 'all',
      allowedHelpdeskAdGroups: Array.isArray(initialPolicy.allowedHelpdeskAdGroups)
        ? initialPolicy.allowedHelpdeskAdGroups
        : [],
      allowedHelpdeskAdUsers: Array.isArray(initialPolicy.allowedHelpdeskAdUsers)
        ? initialPolicy.allowedHelpdeskAdUsers
        : [],
      blockedHelpdeskAdUsers: Array.isArray(initialPolicy.blockedHelpdeskAdUsers)
        ? initialPolicy.blockedHelpdeskAdUsers
        : [],
      blockedHelpdeskAdGroups: Array.isArray(initialPolicy.blockedHelpdeskAdGroups)
        ? initialPolicy.blockedHelpdeskAdGroups
        : [],
      blockedHelpdeskLocalUsers: Array.isArray(initialPolicy.blockedHelpdeskLocalUsers)
        ? initialPolicy.blockedHelpdeskLocalUsers
        : [],
      canViewCommunications: initialPolicy.canViewCommunications ?? true,
      canSendCommunications: initialPolicy.canSendCommunications ?? true,
      canSendAnnouncements:
        initialPolicy.canSendAnnouncements ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canApproveActions:
        initialPolicy.canApproveActions ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      targetContractScope: initialPolicy.targetContractScope || 'all',
      targetContractIds: initialPolicy.targetContractIds || [],
      canAddContracts: initialPolicy.canAddContracts ?? initialPolicy.canManageContracts ?? true,
      canEditContracts: initialPolicy.canEditContracts ?? initialPolicy.canManageContracts ?? true,
      canDeleteContracts: initialPolicy.canDeleteContracts ?? true,
      canDeleteContractAttachments: initialPolicy.canDeleteContractAttachments ?? true,
      targetLicenseScope: initialPolicy.targetLicenseScope || 'all',
      targetLicenseIds: initialPolicy.targetLicenseIds || [],
      canAddLicenses: initialPolicy.canAddLicenses ?? initialPolicy.canManageLicenses ?? true,
      canEditLicenses: initialPolicy.canEditLicenses ?? initialPolicy.canManageLicenses ?? true,
      canDeleteLicenses: initialPolicy.canDeleteLicenses ?? true,
      canDeleteLicenseAttachments: initialPolicy.canDeleteLicenseAttachments ?? true,
      targetSslScope: initialPolicy.targetSslScope || 'all',
      targetSslIds: initialPolicy.targetSslIds || [],
      canManageSslCertificates: initialPolicy.canManageSslCertificates ?? true,
      canAddSslCertificates: initialPolicy.canAddSslCertificates ?? initialPolicy.canManageSslCertificates ?? true,
      canEditSslCertificates: initialPolicy.canEditSslCertificates ?? initialPolicy.canManageSslCertificates ?? true,
      canDeleteSslCertificates: initialPolicy.canDeleteSslCertificates ?? true,
      canCheckSslCertificates: initialPolicy.canCheckSslCertificates ?? true,
      canViewLogs:
        initialPolicy.canViewLogs ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canViewSessionRecordings:
        initialPolicy.canViewSessionRecordings ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canPlaybackSessionRecordings:
        initialPolicy.canPlaybackSessionRecordings ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canDownloadSessionRecordings:
        initialPolicy.canDownloadSessionRecordings ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canDeleteSessionRecordings:
        initialPolicy.canDeleteSessionRecordings ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canManageSessionRecordingLegalHold:
        initialPolicy.canManageSessionRecordingLegalHold ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      canManageSessionRecordingSettings:
        initialPolicy.canManageSessionRecordingSettings ??
        Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
      defaultServerPermissions: initialPolicy.defaultServerPermissions
        ? {
            session_recordings: Boolean(
              initialPolicy.defaultServerPermissions.session_recordings ??
                (initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100)
            ),
            ...initialPolicy.defaultServerPermissions,
          }
        : {
            terminal: false,
            file_explorer: true,
            server_management: false,
            web_management: false,
            database_management: false,
            power_control: false,
            edit_properties: false,
            delete_server: false,
            export_servers: false,
            import_servers: false,
            add_server: false,
            session_recordings: false,
          },
      perServerPermissions: initialPolicy.perServerPermissions || {},
      defaultDevicePermissions: initialPolicy.defaultDevicePermissions || {
        terminal: false,
        config: false,
        backup: false,
        inspect_ports: true,
        port_power: false,
        port_vlan: false,
        port_description: false,
        port_speed: false,
        port_cable_test: false,
        port_security: false,
        port_bridge: false,
        cisco_config_vlans: false,
        cisco_config_stp: false,
        cisco_config_l2_security: false,
        cisco_config_write_memory: false,
        mikrotik_bridge_vlan: false,
        mikrotik_toggle_interface: false,
        mikrotik_comment: false,
        web_configs: true,
        ping_keepalive: true,
        device_note: true,
        export_devices: false,
        import_devices: false,
        apply_template: false,
        export_template: false,
        import_template: false,
        edit_properties: false,
        delete_device: false,
        add_device: false,
      },
      perDevicePermissions: initialPolicy.perDevicePermissions || {},
      defaultServerApprovalRules: initialPolicy.defaultServerApprovalRules || {},
      perServerApprovalRules: initialPolicy.perServerApprovalRules || {},
      defaultDeviceApprovalRules: initialPolicy.defaultDeviceApprovalRules || {},
      perDeviceApprovalRules: initialPolicy.perDeviceApprovalRules || {},
      approvalWorkflowStages: Array.isArray(initialPolicy.approvalWorkflowStages)
        ? initialPolicy.approvalWorkflowStages
        : [],
    };
  });
  const [isDefaultDeviceActionsOpen, setIsDefaultDeviceActionsOpen] = useState(true);
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

  // Tab 7 (Equipment Matrix) Search States
  const [matrixDeviceSearch, setMatrixDeviceSearch] = useState('');
  const [matrixDeviceFilter, setMatrixDeviceFilter] = useState<'all' | 'custom_only' | 'default_only'>('all');

  // Tab 7 Batch Multi-Select, Templates, and Cloning States
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());
  const [copyTargetDevId, setCopyTargetDevId] = useState<string | null>(null); // target devId or 'BATCH'
  const [copySourceSearch, setCopySourceSearch] = useState('');
  const [saveTemplateDevId, setSaveTemplateDevId] = useState<string | null>(null);
  const [templateNameInput, setTemplateNameInput] = useState('');
  const [activePresetMenuDevId, setActivePresetMenuDevId] = useState<string | null>(null);
  const [isBatchTemplateMenuOpen, setIsBatchTemplateMenuOpen] = useState(false);
  const [matrixFeedbackToast, setMatrixFeedbackToast] = useState<string | null>(null);
  const [customTemplates, setCustomTemplates] = useState<
    Array<{
      id: string;
      nameEn: string;
      nameFa: string;
      permissions: Partial<Record<NetworkDeviceActionKey, boolean>>;
      approvalRules?: Partial<Record<NetworkDeviceActionKey, ActionAccessDecision>>;
    }>
  >(() => {
    try {
      const saved = localStorage.getItem('nettopology_custom_device_policy_templates');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Tab 5 (Server Fleet Actions, Scope & Overrides) States
  const [serverScopeSearch, setServerScopeSearch] = useState('');
  const [serverOverrideFilter, setServerOverrideFilter] = useState<'all' | 'custom_only' | 'default_only'>('all');
  const [expandedServerOverrideId, setExpandedServerOverrideId] = useState<string | null>(null);
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

  // Active Directory live objects fetch state & on-demand sync
  const [adConfigState, setAdConfigState] = useState<ActiveDirectoryConfig | null>(() => {
    if (liveAdConfig && (liveAdConfig.syncedUsers?.length || liveAdConfig.syncedGroups?.length)) {
      return liveAdConfig;
    }
    return null;
  });
  const [isFetchingAd, setIsFetchingAd] = useState(false);

  useEffect(() => {
    if (liveAdConfig) {
      setAdConfigState((prev) => {
        // If current state already has synced objects and incoming prop is missing them, keep current state
        if (prev && (prev.syncedUsers?.length || prev.syncedGroups?.length)) {
          if (!liveAdConfig.syncedUsers?.length && !liveAdConfig.syncedGroups?.length) {
            return prev;
          }
        }
        return {
          ...liveAdConfig,
          syncedUsers: (liveAdConfig.syncedUsers && liveAdConfig.syncedUsers.length > 0)
            ? liveAdConfig.syncedUsers
            : (prev?.syncedUsers || []),
          syncedGroups: (liveAdConfig.syncedGroups && liveAdConfig.syncedGroups.length > 0)
            ? liveAdConfig.syncedGroups
            : (prev?.syncedGroups || []),
        };
      });
    }
  }, [liveAdConfig]);

  const handleFetchAd = useCallback(async () => {
    setIsFetchingAd(true);
    try {
      const res = await fetchActiveDirectoryConfig();
      if (res && res.config) {
        setAdConfigState((prev) => ({
          ...(prev || {}),
          ...res.config,
          syncedUsers: Array.isArray(res.config.syncedUsers) && res.config.syncedUsers.length > 0
            ? res.config.syncedUsers
            : (prev?.syncedUsers || []),
          syncedGroups: Array.isArray(res.config.syncedGroups) && res.config.syncedGroups.length > 0
            ? res.config.syncedGroups
            : (prev?.syncedGroups || []),
        }));
      }
    } catch (e) {
      console.error('Failed to fetch AD objects in AccessPolicyModal', e);
    } finally {
      setIsFetchingAd(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (!adConfigState || (!adConfigState.syncedGroups?.length && !adConfigState.syncedUsers?.length)) {
        handleFetchAd();
      }
    }
  }, [isOpen, handleFetchAd]);

  const effectiveAdConfig = useMemo(() => {
    const users = (adConfigState?.syncedUsers && adConfigState.syncedUsers.length > 0)
      ? adConfigState.syncedUsers
      : (liveAdConfig?.syncedUsers && liveAdConfig.syncedUsers.length > 0)
      ? liveAdConfig.syncedUsers
      : [];
    const groups = (adConfigState?.syncedGroups && adConfigState.syncedGroups.length > 0)
      ? adConfigState.syncedGroups
      : (liveAdConfig?.syncedGroups && liveAdConfig.syncedGroups.length > 0)
      ? liveAdConfig.syncedGroups
      : [];
    return {
      ...(liveAdConfig || {}),
      ...(adConfigState || {}),
      syncedUsers: users,
      syncedGroups: groups,
    };
  }, [adConfigState, liveAdConfig]);

  // -------------------------------------------------------------
  // Cascading Scope Resolution (Phase 2):
  // Resolves permitted equipment and servers based on draftPolicy.targetScope
  // -------------------------------------------------------------
  const permittedDeviceIds = useMemo<Set<string> | 'all'>(() => {
    if (!draftPolicy || draftPolicy.targetScope === 'all') return 'all';
    if (draftPolicy.targetScope === 'specific') {
      return new Set(draftPolicy.targetDeviceIds || []);
    }
    if (draftPolicy.targetScope === 'groups') {
      const selectedGroupIds = new Set(draftPolicy.targetGroupIds || []);
      const devIds = new Set<string>();
      for (const g of liveDeviceGroups) {
        if (selectedGroupIds.has(g.id)) {
          const list = g.device_ids || g.deviceIds || [];
          list.forEach((id) => devIds.add(id));
        }
      }
      return devIds;
    }
    return 'all';
  }, [draftPolicy?.targetScope, draftPolicy?.targetGroupIds, draftPolicy?.targetDeviceIds, liveDeviceGroups]);

  const permittedServerIds = useMemo<Set<string> | 'all'>(() => {
    if (!draftPolicy || draftPolicy.targetScope === 'all') return 'all';
    if (draftPolicy.targetScope === 'specific') {
      return new Set(draftPolicy.targetServerIds || []);
    }
    if (draftPolicy.targetScope === 'groups') {
      const selectedGroupIds = new Set(draftPolicy.targetGroupIds || []);
      const srvIds = new Set<string>();
      for (const g of liveDeviceGroups) {
        if (selectedGroupIds.has(g.id)) {
          const list = g.server_ids || g.serverIds || [];
          list.forEach((id) => srvIds.add(id));
        }
      }
      for (const sg of liveServerGroups) {
        if (selectedGroupIds.has(sg.id)) {
          const list = sg.server_ids || [];
          list.forEach((id) => srvIds.add(id));
        }
      }
      return srvIds;
    }
    return 'all';
  }, [draftPolicy?.targetScope, draftPolicy?.targetGroupIds, draftPolicy?.targetServerIds, liveDeviceGroups, liveServerGroups]);

  const permittedDevices = useMemo(() => {
    if (permittedDeviceIds === 'all') return devices;
    return devices.filter((d) => permittedDeviceIds.has(d.id));
  }, [devices, permittedDeviceIds]);

  const permittedServers = useMemo(() => {
    if (permittedServerIds === 'all') return allAvailableServers;
    return allAvailableServers.filter((s) => permittedServerIds.has(s.id));
  }, [allAvailableServers, permittedServerIds]);

  const filteredServersForScope = useMemo(() => {
    // In 'groups' mode, display only servers belonging to authorized groups.
    // In 'all' or 'specific' mode, display allAvailableServers.
    const baseList = draftPolicy?.targetScope === 'groups' ? permittedServers : allAvailableServers;
    return baseList.filter((s) => {
      const q = serverScopeSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        s.name?.toLowerCase().includes(q) ||
        s.ip?.toLowerCase().includes(q) ||
        s.hostname?.toLowerCase().includes(q) ||
        s.os_distro?.toLowerCase().includes(q) ||
        s.os?.toLowerCase().includes(q) ||
        (Array.isArray(s.tags) && s.tags.some((t) => t.toLowerCase().includes(q)));
      if (!matchesSearch) return false;

      const hasCustom = Boolean(
        (draftPolicy?.perServerPermissions?.[s.id] &&
          Object.keys(draftPolicy.perServerPermissions[s.id]).length > 0) ||
          (draftPolicy?.perServerApprovalRules?.[s.id] &&
            Object.keys(draftPolicy.perServerApprovalRules[s.id]).length > 0)
      );
      if (serverOverrideFilter === 'custom_only') return hasCustom;
      if (serverOverrideFilter === 'default_only') return !hasCustom;
      return true;
    });
  }, [
    draftPolicy?.targetScope,
    draftPolicy?.perServerPermissions,
    draftPolicy?.perServerApprovalRules,
    permittedServers,
    allAvailableServers,
    serverScopeSearch,
    serverOverrideFilter,
  ]);

  // Sync draft policy whenever initialPolicy changes or modal opens
  useEffect(() => {
    if (isOpen && initialPolicy) {
      setDraftPolicy({
        ...initialPolicy,
        subjectIds: Array.isArray(initialPolicy.subjectIds) && initialPolicy.subjectIds.length > 0
          ? initialPolicy.subjectIds
          : (initialPolicy.subjectId ? [initialPolicy.subjectId] : []),
        subjectNames: Array.isArray(initialPolicy.subjectNames) && initialPolicy.subjectNames.length > 0
          ? initialPolicy.subjectNames
          : (initialPolicy.subjectName ? [initialPolicy.subjectName] : []),
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
        canAddDevice:
          initialPolicy.canAddDevice ??
          Boolean(initialPolicy.defaultDevicePermissions?.add_device ?? initialPolicy.canManageDevices),
        canBulkConfigureDevices:
          initialPolicy.canBulkConfigureDevices ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canBulkConfigureServers:
          initialPolicy.canBulkConfigureServers ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canManageNavigationGovernance:
          initialPolicy.canManageNavigationGovernance ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canViewContracts: initialPolicy.canViewContracts ?? true,
        canViewLicenses: initialPolicy.canViewLicenses ?? true,
        canViewSslCertificates: initialPolicy.canViewSslCertificates ?? true,
        canViewHelpdesk:
          initialPolicy.canViewHelpdesk ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canViewHelpdeskUsers:
          initialPolicy.canViewHelpdeskUsers ??
          Boolean(
            initialPolicy.id === 'policy-super-admin' ||
              (initialPolicy.priority || 0) >= 100 ||
              (initialPolicy.canViewHelpdesk && initialPolicy.canInspectHelpdeskDomainUsers)
          ),
        canViewHelpdeskGroups:
          initialPolicy.canViewHelpdeskGroups ??
          Boolean(
            initialPolicy.id === 'policy-super-admin' ||
              (initialPolicy.priority || 0) >= 100 ||
              (initialPolicy.canViewHelpdesk && initialPolicy.canInspectHelpdeskDomainUsers)
          ),
        canRunHelpdeskDiagnostics:
          initialPolicy.canRunHelpdeskDiagnostics ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canExecuteHelpdeskActions:
          initialPolicy.canExecuteHelpdeskActions ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canViewHelpdeskEventViewer:
          initialPolicy.canViewHelpdeskEventViewer ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canTerminateHelpdeskProcesses:
          initialPolicy.canTerminateHelpdeskProcesses ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canCleanHelpdeskTemp:
          initialPolicy.canCleanHelpdeskTemp ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canRunHelpdeskGpupdate:
          initialPolicy.canRunHelpdeskGpupdate ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canRunHelpdeskSystemRepair:
          initialPolicy.canRunHelpdeskSystemRepair ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canInspectHelpdeskDomainUsers:
          initialPolicy.canInspectHelpdeskDomainUsers ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canUnlockHelpdeskDomainUsers:
          initialPolicy.canUnlockHelpdeskDomainUsers ??
          Boolean(
            initialPolicy.id === 'policy-super-admin' ||
              (initialPolicy.priority || 0) >= 100 ||
              (initialPolicy.canViewHelpdesk &&
                initialPolicy.canInspectHelpdeskDomainUsers &&
                initialPolicy.canExecuteHelpdeskActions)
          ),
        canPowerControlHelpdeskEndpoints:
          initialPolicy.canPowerControlHelpdeskEndpoints ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canManageHelpdeskExceptions:
          initialPolicy.canManageHelpdeskExceptions ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canSendHelpdeskMessage:
          initialPolicy.canSendHelpdeskMessage ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canViewAllHelpdeskHistory:
          initialPolicy.canViewAllHelpdeskHistory ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        targetHelpdeskIpScope: initialPolicy.targetHelpdeskIpScope === 'selected' ? 'selected' : 'all',
        allowedHelpdeskIps: Array.isArray(initialPolicy.allowedHelpdeskIps) ? initialPolicy.allowedHelpdeskIps : [],
        blockedHelpdeskIps: Array.isArray(initialPolicy.blockedHelpdeskIps) ? initialPolicy.blockedHelpdeskIps : [],
        targetHelpdeskAdScope: initialPolicy.targetHelpdeskAdScope === 'selected' ? 'selected' : 'all',
        allowedHelpdeskAdGroups: Array.isArray(initialPolicy.allowedHelpdeskAdGroups)
          ? initialPolicy.allowedHelpdeskAdGroups
          : [],
        allowedHelpdeskAdUsers: Array.isArray(initialPolicy.allowedHelpdeskAdUsers)
          ? initialPolicy.allowedHelpdeskAdUsers
          : [],
        blockedHelpdeskAdUsers: Array.isArray(initialPolicy.blockedHelpdeskAdUsers)
          ? initialPolicy.blockedHelpdeskAdUsers
          : [],
        blockedHelpdeskAdGroups: Array.isArray(initialPolicy.blockedHelpdeskAdGroups)
          ? initialPolicy.blockedHelpdeskAdGroups
          : [],
        blockedHelpdeskLocalUsers: Array.isArray(initialPolicy.blockedHelpdeskLocalUsers)
          ? initialPolicy.blockedHelpdeskLocalUsers
          : [],
        canViewCommunications: initialPolicy.canViewCommunications ?? true,
        canSendCommunications: initialPolicy.canSendCommunications ?? true,
        canSendAnnouncements:
          initialPolicy.canSendAnnouncements ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canApproveActions:
          initialPolicy.canApproveActions ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        targetContractScope: initialPolicy.targetContractScope || 'all',
        targetContractIds: initialPolicy.targetContractIds || [],
        canAddContracts: initialPolicy.canAddContracts ?? initialPolicy.canManageContracts ?? true,
        canEditContracts: initialPolicy.canEditContracts ?? initialPolicy.canManageContracts ?? true,
        canDeleteContracts: initialPolicy.canDeleteContracts ?? true,
        canDeleteContractAttachments: initialPolicy.canDeleteContractAttachments ?? true,
        targetLicenseScope: initialPolicy.targetLicenseScope || 'all',
        targetLicenseIds: initialPolicy.targetLicenseIds || [],
        canAddLicenses: initialPolicy.canAddLicenses ?? initialPolicy.canManageLicenses ?? true,
        canEditLicenses: initialPolicy.canEditLicenses ?? initialPolicy.canManageLicenses ?? true,
        canDeleteLicenses: initialPolicy.canDeleteLicenses ?? true,
        canDeleteLicenseAttachments: initialPolicy.canDeleteLicenseAttachments ?? true,
        targetSslScope: initialPolicy.targetSslScope || 'all',
        targetSslIds: initialPolicy.targetSslIds || [],
        canManageSslCertificates: initialPolicy.canManageSslCertificates ?? true,
        canAddSslCertificates: initialPolicy.canAddSslCertificates ?? initialPolicy.canManageSslCertificates ?? true,
        canEditSslCertificates: initialPolicy.canEditSslCertificates ?? initialPolicy.canManageSslCertificates ?? true,
        canDeleteSslCertificates: initialPolicy.canDeleteSslCertificates ?? true,
        canCheckSslCertificates: initialPolicy.canCheckSslCertificates ?? true,
        canViewLogs:
          initialPolicy.canViewLogs ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canViewSessionRecordings:
          initialPolicy.canViewSessionRecordings ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canPlaybackSessionRecordings:
          initialPolicy.canPlaybackSessionRecordings ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canDownloadSessionRecordings:
          initialPolicy.canDownloadSessionRecordings ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canDeleteSessionRecordings:
          initialPolicy.canDeleteSessionRecordings ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canManageSessionRecordingLegalHold:
          initialPolicy.canManageSessionRecordingLegalHold ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        canManageSessionRecordingSettings:
          initialPolicy.canManageSessionRecordingSettings ??
          Boolean(initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100),
        defaultServerPermissions: initialPolicy.defaultServerPermissions
          ? {
              session_recordings: Boolean(
                initialPolicy.defaultServerPermissions.session_recordings ??
                  (initialPolicy.id === 'policy-super-admin' || (initialPolicy.priority || 0) >= 100)
              ),
              ...initialPolicy.defaultServerPermissions,
            }
          : {
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
              session_recordings: false,
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
          add_device: false,
        },
        perDevicePermissions: initialPolicy.perDevicePermissions || {},
        defaultServerApprovalRules: initialPolicy.defaultServerApprovalRules || {},
        perServerApprovalRules: initialPolicy.perServerApprovalRules || {},
        defaultDeviceApprovalRules: initialPolicy.defaultDeviceApprovalRules || {},
        perDeviceApprovalRules: initialPolicy.perDeviceApprovalRules || {},
        approvalWorkflowStages: Array.isArray(initialPolicy.approvalWorkflowStages)
          ? initialPolicy.approvalWorkflowStages
          : [],
      });
      setErrorMessage(null);
      setIsMaximized(false);
      setActiveTab('identity');
      setAdUserSearch('');
      setIsAdUserOpen(true);
      setAdGroupSearch('');
      setIsAdGroupOpen(true);
      setLocalUserSearch('');
      setIsLocalUserOpen(true);
      setLocalGroupSearch('');
      setIsLocalGroupOpen(true);
      setDeviceSearchQuery('');
      setMatrixDeviceSearch('');
      setMatrixDeviceFilter('all');
      setServerScopeSearch('');
      setServerOverrideFilter('all');
      setExpandedServerOverrideId(null);
      setContractsSearch('');
      setLicensesSearch('');
      setSslCertsSearch('');
      setHdAllowedIpInput('');
      setHdBlockedIpInput('');
      setHdAllowedGroupInput('');
      setHdAllowedUserInput('');
      setHdBlockedGroupInput('');
      setHdBlockedUserInput('');
      setHdBlockedLocalUserInput('');
      setHdCatalogSearch('');
    }
  }, [isOpen, initialPolicy]);

  // Fetch authentic live Contracts, Licenses, SSL Certificates & Global HelpDesk Exceptions from backend on modal open
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;
    const fetchLiveItems = async () => {
      try {
        setIsLoadingContractsLicenses(true);
        const [cntRes, licRes, sslRes, hdExcRes] = await Promise.all([
          fetchContractsApi().catch(() => ({ contracts: [] })),
          fetchLicensesApi().catch(() => ({ licenses: [] })),
          fetchSslCertificatesApi().catch(() => ({ certificates: [] })),
          fetchHelpdeskExceptions().catch(() => null),
        ]);
        if (!isCancelled) {
          if (Array.isArray(cntRes?.contracts)) {
            setContractsList(cntRes.contracts);
          }
          if (Array.isArray(licRes?.licenses)) {
            setLicensesList(licRes.licenses);
          }
          if (Array.isArray(sslRes?.certificates)) {
            setSslCertsList(sslRes.certificates);
          }
          if (hdExcRes && Array.isArray(hdExcRes.rules)) {
            setGlobalExceptionsCount(hdExcRes.rules.filter((r) => r.enabled).length);
            if (typeof hdExcRes.canManage === 'boolean') {
              setCanManageGlobalExceptions(hdExcRes.canManage);
            }
          }
        }
      } catch (err) {
        // Fallback to initial prop arrays
      } finally {
        if (!isCancelled) {
          setIsLoadingContractsLicenses(false);
        }
      }
    };
    fetchLiveItems();
    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  // Derived filtered users and groups for subject selection
  const filteredAdUsers = useMemo(() => {
    const list = effectiveAdConfig?.syncedUsers || [];
    if (!adUserSearch.trim()) return list.slice(0, 50);
    const q = adUserSearch.toLowerCase().trim();
    return list.filter((u) => {
      const disp = String(u.displayName || '').toLowerCase();
      const sam = String(u.samAccountName || (u as any).sAMAccountName || (u as any).username || '').toLowerCase();
      const upn = String(u.userPrincipalName || '').toLowerCase();
      const mail = String((u as any).email || u.mail || '').toLowerCase();
      const dept = String(u.department || '').toLowerCase();
      const title = String(u.title || '').toLowerCase();
      const dn = String(u.dn || '').toLowerCase();
      return (
        disp.includes(q) ||
        sam.includes(q) ||
        upn.includes(q) ||
        mail.includes(q) ||
        dept.includes(q) ||
        title.includes(q) ||
        dn.includes(q)
      );
    });
  }, [effectiveAdConfig?.syncedUsers, adUserSearch]);

  const filteredAdGroups = useMemo(() => {
    const list = effectiveAdConfig?.syncedGroups || [];
    if (!adGroupSearch.trim()) return list.slice(0, 50);
    const q = adGroupSearch.toLowerCase().trim();
    return list.filter((g) => {
      const cn = String(g.cn || '').toLowerCase();
      const disp = String(g.displayName || '').toLowerCase();
      const sam = String(g.sAMAccountName || (g as any).samAccountName || '').toLowerCase();
      const desc = String(g.description || '').toLowerCase();
      const dn = String(g.dn || '').toLowerCase();
      return (
        cn.includes(q) ||
        disp.includes(q) ||
        sam.includes(q) ||
        desc.includes(q) ||
        dn.includes(q)
      );
    });
  }, [effectiveAdConfig?.syncedGroups, adGroupSearch]);

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

  const filteredContracts = useMemo(() => {
    if (!contractsSearch.trim()) return contractsList;
    const q = contractsSearch.toLowerCase().trim();
    return contractsList.filter(
      (c) =>
        c.title?.toLowerCase().includes(q) ||
        c.contractNumber?.toLowerCase().includes(q) ||
        c.vendorName?.toLowerCase().includes(q) ||
        c.vendorContact?.toLowerCase().includes(q) ||
        c.ownerName?.toLowerCase().includes(q) ||
        c.department?.toLowerCase().includes(q) ||
        c.contractType?.toLowerCase().includes(q)
    );
  }, [contractsList, contractsSearch]);

  const filteredLicenses = useMemo(() => {
    if (!licensesSearch.trim()) return licensesList;
    const q = licensesSearch.toLowerCase().trim();
    return licensesList.filter(
      (l) =>
        l.title?.toLowerCase().includes(q) ||
        l.licenseKey?.toLowerCase().includes(q) ||
        l.vendor?.toLowerCase().includes(q) ||
        l.deviceType?.toLowerCase().includes(q) ||
        l.ownerName?.toLowerCase().includes(q) ||
        l.department?.toLowerCase().includes(q)
    );
  }, [licensesList, licensesSearch]);

  // Selected subject IDs & Names supporting multi-selection
  const selectedSubjectIds: string[] = useMemo(() => {
    if (!draftPolicy) return [];
    if (Array.isArray(draftPolicy.subjectIds) && draftPolicy.subjectIds.length > 0) {
      return draftPolicy.subjectIds;
    }
    return draftPolicy.subjectId ? [draftPolicy.subjectId] : [];
  }, [draftPolicy?.subjectIds, draftPolicy?.subjectId]);

  const selectedSubjectNames: string[] = useMemo(() => {
    if (!draftPolicy) return [];
    if (Array.isArray(draftPolicy.subjectNames) && draftPolicy.subjectNames.length > 0) {
      return draftPolicy.subjectNames;
    }
    return draftPolicy.subjectName ? [draftPolicy.subjectName] : [];
  }, [draftPolicy?.subjectNames, draftPolicy?.subjectName]);

  const handleToggleSubject = useCallback((id: string, name: string) => {
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      const currentIds = Array.isArray(prev.subjectIds) && prev.subjectIds.length > 0
        ? [...prev.subjectIds]
        : (prev.subjectId ? [prev.subjectId] : []);
      const currentNames = Array.isArray(prev.subjectNames) && prev.subjectNames.length > 0
        ? [...prev.subjectNames]
        : (prev.subjectName ? [prev.subjectName] : []);

      const idx = currentIds.indexOf(id);
      let nextIds: string[];
      let nextNames: string[];

      if (idx >= 0) {
        nextIds = currentIds.filter((item) => item !== id);
        nextNames = currentNames.filter((_, i) => i !== idx);
      } else {
        nextIds = [...currentIds, id];
        nextNames = [...currentNames, name];
      }

      return {
        ...prev,
        subjectIds: nextIds,
        subjectNames: nextNames,
        subjectId: nextIds[0] || '',
        subjectName: nextNames.join(', ') || '',
      };
    });
  }, []);

  const handleRemoveSubject = useCallback((id: string) => {
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      const currentIds = Array.isArray(prev.subjectIds) && prev.subjectIds.length > 0
        ? [...prev.subjectIds]
        : (prev.subjectId ? [prev.subjectId] : []);
      const currentNames = Array.isArray(prev.subjectNames) && prev.subjectNames.length > 0
        ? [...prev.subjectNames]
        : (prev.subjectName ? [prev.subjectName] : []);

      const idx = currentIds.indexOf(id);
      if (idx === -1) return prev;
      const nextIds = currentIds.filter((item) => item !== id);
      const nextNames = currentNames.filter((_, i) => i !== idx);

      return {
        ...prev,
        subjectIds: nextIds,
        subjectNames: nextNames,
        subjectId: nextIds[0] || '',
        subjectName: nextNames.join(', ') || '',
      };
    });
  }, []);

  const handleClearAllSubjects = useCallback(() => {
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        subjectIds: [],
        subjectNames: [],
        subjectId: '',
        subjectName: '',
      };
    });
  }, []);

  const handleSelectAllVisible = useCallback((items: { id: string; name: string }[]) => {
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      const currentIds = Array.isArray(prev.subjectIds) && prev.subjectIds.length > 0
        ? [...prev.subjectIds]
        : (prev.subjectId ? [prev.subjectId] : []);
      const currentNames = Array.isArray(prev.subjectNames) && prev.subjectNames.length > 0
        ? [...prev.subjectNames]
        : (prev.subjectName ? [prev.subjectName] : []);

      const idToNameMap = new Map<string, string>();
      currentIds.forEach((id, idx) => {
        idToNameMap.set(id, currentNames[idx] || id);
      });
      items.forEach((item) => {
        idToNameMap.set(item.id, item.name);
      });

      const nextIds = Array.from(idToNameMap.keys());
      const nextNames = Array.from(idToNameMap.values());

      return {
        ...prev,
        subjectIds: nextIds,
        subjectNames: nextNames,
        subjectId: nextIds[0] || '',
        subjectName: nextNames.join(', ') || '',
      };
    });
  }, []);

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

  // Tab 7 filtered devices and servers (Cascading Filtered by Scope)
  const matrixFilteredDevices = useMemo(() => {
    if (!draftPolicy) return [];
    return permittedDevices.filter((d) => {
      const matchesSearch =
        !matrixDeviceSearch.trim() ||
        d.name?.toLowerCase().includes(matrixDeviceSearch.toLowerCase()) ||
        d.ip?.toLowerCase().includes(matrixDeviceSearch.toLowerCase()) ||
        d.platform?.toLowerCase().includes(matrixDeviceSearch.toLowerCase());
      if (!matchesSearch) return false;

      const hasCustom = Boolean(
        (draftPolicy.perDevicePermissions?.[d.id] &&
          Object.keys(draftPolicy.perDevicePermissions[d.id]).length > 0) ||
          (draftPolicy.perDeviceApprovalRules?.[d.id] &&
            Object.keys(draftPolicy.perDeviceApprovalRules[d.id]).length > 0)
      );
      if (matrixDeviceFilter === 'custom_only') return hasCustom;
      if (matrixDeviceFilter === 'default_only') return !hasCustom;
      return true;
    });
  }, [permittedDevices, matrixDeviceSearch, matrixDeviceFilter, draftPolicy]);

  const handleToggleContractId = useCallback((id: string) => {
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      const current = prev.targetContractIds || [];
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      return { ...prev, targetContractIds: next };
    });
  }, []);

  const handleSelectAllContracts = useCallback(() => {
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      return { ...prev, targetContractIds: contractsList.map((c) => c.id) };
    });
  }, [contractsList]);

  const handleDeselectAllContracts = useCallback(() => {
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      return { ...prev, targetContractIds: [] };
    });
  }, []);

  const handleToggleLicenseId = useCallback((id: string) => {
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      const current = prev.targetLicenseIds || [];
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      return { ...prev, targetLicenseIds: next };
    });
  }, []);

  const handleSelectAllLicenses = useCallback(() => {
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      return { ...prev, targetLicenseIds: licensesList.map((l) => l.id) };
    });
  }, [licensesList]);

  const handleDeselectAllLicenses = useCallback(() => {
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      return { ...prev, targetLicenseIds: [] };
    });
  }, []);

  const handleToggleSslCertId = useCallback((id: string) => {
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      const current = prev.targetSslIds || [];
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      return { ...prev, targetSslIds: next };
    });
  }, []);

  const handleSelectAllSslCerts = useCallback(() => {
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      return { ...prev, targetSslIds: sslCertsList.map((c) => c.id) };
    });
  }, [sslCertsList]);

  const handleDeselectAllSslCerts = useCallback(() => {
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      return { ...prev, targetSslIds: [] };
    });
  }, []);

  const handleMinimize = () => {
    if (!draftPolicy) return;
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

  const approvalCounts = useMemo(
    () => countPolicyApprovalRules(draftPolicy),
    [
      draftPolicy?.defaultServerApprovalRules,
      draftPolicy?.perServerApprovalRules,
      draftPolicy?.defaultDeviceApprovalRules,
      draftPolicy?.perDeviceApprovalRules,
    ]
  );

  const customServerOverridesCount = useMemo(() => {
    if (!draftPolicy) return 0;
    const keys = new Set<string>([
      ...Object.keys(draftPolicy.perServerPermissions || {}).filter(
        (id) => Object.keys(draftPolicy.perServerPermissions?.[id] || {}).length > 0
      ),
      ...Object.keys(draftPolicy.perServerApprovalRules || {}).filter(
        (id) => Object.keys(draftPolicy.perServerApprovalRules?.[id] || {}).length > 0
      ),
    ]);
    return keys.size;
  }, [draftPolicy?.perServerPermissions, draftPolicy?.perServerApprovalRules]);

  const customDeviceOverridesCount = useMemo(() => {
    if (!draftPolicy) return 0;
    const keys = new Set<string>([
      ...Object.keys(draftPolicy.perDevicePermissions || {}).filter(
        (id) => Object.keys(draftPolicy.perDevicePermissions?.[id] || {}).length > 0
      ),
      ...Object.keys(draftPolicy.perDeviceApprovalRules || {}).filter(
        (id) => Object.keys(draftPolicy.perDeviceApprovalRules?.[id] || {}).length > 0
      ),
    ]);
    return keys.size;
  }, [draftPolicy?.perDevicePermissions, draftPolicy?.perDeviceApprovalRules]);

  const getDefaultServerDecision = useCallback(
    (key: ServerActionKey): ActionAccessDecision => {
      if (!draftPolicy) return 'deny';
      const rule = draftPolicy.defaultServerApprovalRules?.[key];
      if (rule === 'allow' || rule === 'require_approval' || rule === 'deny') return rule;
      return draftPolicy.defaultServerPermissions?.[key] ? 'allow' : 'deny';
    },
    [draftPolicy]
  );

  const setDefaultServerDecision = useCallback(
    (key: ServerActionKey, decision: ActionAccessDecision) => {
      setDraftPolicy((prev) => {
        if (!prev) return prev;
        const nextRules = { ...(prev.defaultServerApprovalRules || {}), [key]: decision };
        return {
          ...prev,
          canAddServer: key === 'add_server' ? decision !== 'deny' : prev.canAddServer,
          defaultServerPermissions: {
            ...(prev.defaultServerPermissions || {}),
            [key]: decision !== 'deny',
          },
          defaultServerApprovalRules: nextRules,
        };
      });
    },
    []
  );

  const setAllServerDefaultDecision = useCallback((decision: ActionAccessDecision) => {
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      const nextPerms: Record<string, boolean> = { ...(prev.defaultServerPermissions || {}) };
      const nextRules: Record<string, ActionAccessDecision> = {
        ...(prev.defaultServerApprovalRules || {}),
      };
      SERVER_ACTIONS_CATALOG.forEach((a) => {
        nextPerms[a.key] = decision !== 'deny';
        nextRules[a.key] = decision;
      });
      return {
        ...prev,
        canAddServer: decision !== 'deny',
        defaultServerPermissions: nextPerms as any,
        defaultServerApprovalRules: nextRules as any,
      };
    });
  }, []);

  const getPerServerDecisionState = useCallback(
    (serverId: string, key: ServerActionKey): { decision: ActionAccessDecision; isOverridden: boolean } => {
      const rule = draftPolicy?.perServerApprovalRules?.[serverId]?.[key];
      if (rule === 'allow' || rule === 'require_approval' || rule === 'deny') {
        return { decision: rule, isOverridden: true };
      }
      const boolOverride = draftPolicy?.perServerPermissions?.[serverId]?.[key];
      if (typeof boolOverride === 'boolean') {
        return { decision: boolOverride ? 'allow' : 'deny', isOverridden: true };
      }
      return { decision: getDefaultServerDecision(key), isOverridden: false };
    },
    [draftPolicy, getDefaultServerDecision]
  );

  const setPerServerDecision = useCallback(
    (serverId: string, key: ServerActionKey, decision: ActionAccessDecision) => {
      setDraftPolicy((prev) => {
        if (!prev) return prev;
        const currentPerms = prev.perServerPermissions?.[serverId] || {
          ...(prev.defaultServerPermissions || {}),
        };
        const currentRules = prev.perServerApprovalRules?.[serverId] || {};
        return {
          ...prev,
          perServerPermissions: {
            ...(prev.perServerPermissions || {}),
            [serverId]: { ...currentPerms, [key]: decision !== 'deny' },
          },
          perServerApprovalRules: {
            ...(prev.perServerApprovalRules || {}),
            [serverId]: { ...currentRules, [key]: decision },
          },
        };
      });
    },
    []
  );

  const setPerServerBulkDecision = useCallback(
    (serverId: string, decision: ActionAccessDecision) => {
      setDraftPolicy((prev) => {
        if (!prev) return prev;
        const nextPerms: Record<string, boolean> = {};
        const nextRules: Record<string, ActionAccessDecision> = {};
        SERVER_ACTIONS_CATALOG.forEach((a) => {
          nextPerms[a.key] = decision !== 'deny';
          nextRules[a.key] = decision;
        });
        return {
          ...prev,
          perServerPermissions: {
            ...(prev.perServerPermissions || {}),
            [serverId]: nextPerms as any,
          },
          perServerApprovalRules: {
            ...(prev.perServerApprovalRules || {}),
            [serverId]: nextRules as any,
          },
        };
      });
    },
    []
  );

  const resetPerServerOverride = useCallback((serverId: string) => {
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      const nextPerms = { ...(prev.perServerPermissions || {}) };
      const nextRules = { ...(prev.perServerApprovalRules || {}) };
      delete nextPerms[serverId];
      delete nextRules[serverId];
      return {
        ...prev,
        perServerPermissions: nextPerms,
        perServerApprovalRules: nextRules,
      };
    });
  }, []);

  const getDefaultDeviceDecision = useCallback(
    (key: NetworkDeviceActionKey): ActionAccessDecision => {
      if (!draftPolicy) return 'deny';
      const rule = draftPolicy.defaultDeviceApprovalRules?.[key];
      if (rule === 'allow' || rule === 'require_approval' || rule === 'deny') return rule;
      if (key === 'add_device' && draftPolicy.canAddDevice !== undefined) {
        return draftPolicy.canAddDevice ? 'allow' : 'deny';
      }
      const fallbackDecision = evaluateDeviceActionDecision(
        {
          ...draftPolicy,
          perDevicePermissions: undefined,
          perDeviceApprovalRules: undefined,
        },
        '',
        key
      );
      return fallbackDecision;
    },
    [draftPolicy]
  );

  const setDefaultDeviceDecision = useCallback(
    (key: NetworkDeviceActionKey, decision: ActionAccessDecision) => {
      setDraftPolicy((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          canAddDevice: key === 'add_device' ? decision !== 'deny' : prev.canAddDevice,
          defaultDevicePermissions: {
            ...(prev.defaultDevicePermissions || {}),
            [key]: decision !== 'deny',
          },
          defaultDeviceApprovalRules: {
            ...(prev.defaultDeviceApprovalRules || {}),
            [key]: decision,
          },
        };
      });
    },
    []
  );

  const setAllDefaultDeviceDecision = useCallback(
    (keys: NetworkDeviceActionKey[], decision: ActionAccessDecision) => {
      setDraftPolicy((prev) => {
        if (!prev) return prev;
        const nextPerms = { ...(prev.defaultDevicePermissions || {}) };
        const nextRules = { ...(prev.defaultDeviceApprovalRules || {}) };
        let nextCanAdd = prev.canAddDevice;
        keys.forEach((k) => {
          (nextPerms as any)[k] = decision !== 'deny';
          (nextRules as any)[k] = decision;
          if (k === 'add_device') nextCanAdd = decision !== 'deny';
        });
        return {
          ...prev,
          canAddDevice: nextCanAdd,
          defaultDevicePermissions: nextPerms,
          defaultDeviceApprovalRules: nextRules,
        };
      });
    },
    []
  );

  const getPerDeviceDecisionState = useCallback(
    (deviceId: string, key: NetworkDeviceActionKey): { decision: ActionAccessDecision; isOverridden: boolean } => {
      const rule = draftPolicy?.perDeviceApprovalRules?.[deviceId]?.[key];
      if (rule === 'allow' || rule === 'require_approval' || rule === 'deny') {
        return { decision: rule, isOverridden: true };
      }
      const boolOverride = draftPolicy?.perDevicePermissions?.[deviceId]?.[key];
      if (typeof boolOverride === 'boolean') {
        return { decision: boolOverride ? 'allow' : 'deny', isOverridden: true };
      }
      const defaultDecision = evaluateDeviceActionDecision(
        {
          ...draftPolicy,
          perDevicePermissions: undefined,
          perDeviceApprovalRules: undefined,
        },
        deviceId,
        key
      );
      return { decision: defaultDecision, isOverridden: false };
    },
    [draftPolicy]
  );

  const setPerDeviceDecision = useCallback(
    (deviceId: string, key: NetworkDeviceActionKey, decision: ActionAccessDecision) => {
      setDraftPolicy((prev) => {
        if (!prev) return prev;
        const currentPerms = prev.perDevicePermissions?.[deviceId] || {
          ...(prev.defaultDevicePermissions || {}),
        };
        const currentRules = prev.perDeviceApprovalRules?.[deviceId] || {};
        return {
          ...prev,
          perDevicePermissions: {
            ...(prev.perDevicePermissions || {}),
            [deviceId]: { ...currentPerms, [key]: decision !== 'deny' },
          },
          perDeviceApprovalRules: {
            ...(prev.perDeviceApprovalRules || {}),
            [deviceId]: { ...currentRules, [key]: decision },
          },
        };
      });
    },
    []
  );

  const setPerDeviceSectionDecision = useCallback(
    (deviceId: string, keys: NetworkDeviceActionKey[], decision: ActionAccessDecision) => {
      setDraftPolicy((prev) => {
        if (!prev) return prev;
        const currentPerms = { ...(prev.perDevicePermissions?.[deviceId] || prev.defaultDevicePermissions || {}) };
        const currentRules = { ...(prev.perDeviceApprovalRules?.[deviceId] || {}) };
        keys.forEach((k) => {
          (currentPerms as any)[k] = decision !== 'deny';
          (currentRules as any)[k] = decision;
        });
        return {
          ...prev,
          perDevicePermissions: {
            ...(prev.perDevicePermissions || {}),
            [deviceId]: currentPerms,
          },
          perDeviceApprovalRules: {
            ...(prev.perDeviceApprovalRules || {}),
            [deviceId]: currentRules,
          },
        };
      });
    },
    []
  );

  const renderTriStateControl = (
    decision: ActionAccessDecision,
    onChange: (next: ActionAccessDecision) => void,
    compact = false
  ) => (
    <div
      className={`inline-flex items-center rounded-lg border p-0.5 gap-0.5 shrink-0 ${
        isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-950/80 border-white/10'
      }`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onChange('allow');
        }}
        title={isEn ? 'Allow directly without approval' : 'مجاز بدون نیاز به تایید'}
        className={`${
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[10px]'
        } rounded-md font-bold transition flex items-center gap-1 cursor-pointer ${
          decision === 'allow'
            ? 'bg-emerald-600 text-white shadow-xs'
            : isLightMode
            ? 'text-slate-900 hover:bg-slate-200'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
        }`}
      >
        <CheckCircle2 className="w-3 h-3 shrink-0" />
        <span>{isEn ? 'Allow' : 'مجاز'}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onChange('require_approval');
        }}
        title={
          isEn
            ? 'Require sequential approval workflow before execution'
            : 'اجرای عملیات منوط به تایید در زنجیره مراحل'
        }
        className={`${
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[10px]'
        } rounded-md font-bold transition flex items-center gap-1 cursor-pointer ${
          decision === 'require_approval'
            ? 'bg-amber-600 text-white shadow-xs'
            : isLightMode
            ? 'text-slate-900 hover:bg-slate-200'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
        }`}
      >
        <Clock className="w-3 h-3 shrink-0" />
        <span>{isEn ? 'Approval' : 'نیاز به تایید'}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onChange('deny');
        }}
        title={isEn ? 'Block and deny action' : 'مسدودسازی و عدم دسترسی'}
        className={`${
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[10px]'
        } rounded-md font-bold transition flex items-center gap-1 cursor-pointer ${
          decision === 'deny'
            ? 'bg-rose-600 text-white shadow-xs'
            : isLightMode
            ? 'text-slate-900 hover:bg-slate-200'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
        }`}
      >
        <X className="w-3 h-3 shrink-0" />
        <span>{isEn ? 'Deny' : 'مسدود'}</span>
      </button>
    </div>
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftPolicy) return;
    if (!draftPolicy.name.trim()) {
      setErrorMessage(
        isEn
          ? 'Policy name is required. Please specify a descriptive name.'
          : 'عنوان پالیسی الزامی است. لطفاً یک نام مشخص وارد فرمایید.'
      );
      setActiveTab('identity');
      return;
    }

    const stages: ApprovalWorkflowStageConfig[] = Array.isArray(draftPolicy.approvalWorkflowStages)
      ? draftPolicy.approvalWorkflowStages
      : [];
    const reqCount = countPolicyApprovalRules(draftPolicy).totalCount;
    if (reqCount > 0 && stages.length === 0) {
      setErrorMessage(
        isEn
          ? `This policy has ${reqCount} action(s) set to "Require Approval" without an Approval Workflow Chain. Add 1 to 3 stages before saving.`
          : `این پالیسی دارای ${reqCount} اکشن «نیازمند تایید» است اما زنجیره تایید مراحل تعریف نشده است. لطفاً حداقل ۱ مرحله در تب «زنجیره تایید مراحل» اضافه کنید.`
      );
      setActiveTab('approvals');
      return;
    }
    if (stages.length > 3) {
      setErrorMessage(
        isEn
          ? 'A maximum of 3 sequential approval stages is permitted.'
          : 'حداکثر ۳ مرحله تایید متوالی مجاز است.'
      );
      setActiveTab('approvals');
      return;
    }
    for (let i = 0; i < stages.length; i++) {
      const st = stages[i];
      if (!st.titleFa?.trim() && !st.titleEn?.trim()) {
        setErrorMessage(
          isEn
            ? `Approval Stage ${i + 1} requires a stage title.`
            : `مرحله تایید ${i + 1} باید دارای عنوان باشد.`
        );
        setActiveTab('approvals');
        return;
      }
      if (st.approverTargetType === 'specific_users' && (!st.approverUserIds || st.approverUserIds.length === 0)) {
        setErrorMessage(
          isEn
            ? `Approval Stage ${i + 1} requires at least one selected approver user.`
            : `در مرحله تایید ${i + 1} حداقل یک کاربر تاییدکننده باید انتخاب شود.`
        );
        setActiveTab('approvals');
        return;
      }
      if (st.approverTargetType === 'user_groups' && (!st.approverGroupIds || st.approverGroupIds.length === 0)) {
        setErrorMessage(
          isEn
            ? `Approval Stage ${i + 1} requires at least one selected approver group.`
            : `در مرحله تایید ${i + 1} حداقل یک گروه تاییدکننده باید انتخاب شود.`
        );
        setActiveTab('approvals');
        return;
      }
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
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        canViewDashboard: enabled,
        canViewTopology: enabled,
        canViewDevices: enabled,
        canViewPorts: enabled,
        canViewDiscovery: enabled,
        canViewTemplates: enabled,
        canViewServers: enabled,
        canViewLogs: enabled,
        canViewSessionRecordings: enabled,
        canViewNetworkTools: enabled,
        canViewPhysicalPlacement: enabled,
        canViewSettings: enabled,
        canViewContracts: enabled,
        canViewLicenses: enabled,
        canViewSslCertificates: enabled,
        canViewHelpdesk: enabled,
        canViewHelpdeskUsers: enabled,
        canViewHelpdeskGroups: enabled,
        canViewCommunications: enabled,
        canSendCommunications: enabled,
        canSendAnnouncements: enabled,
        canApproveActions: enabled,
        canBulkConfigureDevices: enabled,
        canBulkConfigureServers: enabled,
        canManageNavigationGovernance: enabled,
      };
    });
  };

  const setAllServerDefaultPermissions = (enabled: boolean) => {
    setAllServerDefaultDecision(enabled ? 'allow' : 'deny');
  };

  const setAllGlobalCapabilities = (enabled: boolean) => {
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        canApplyTemplates: enabled,
        canExportTemplates: enabled,
        canImportTemplates: enabled,
        canManageDevices: enabled,
        canAddDevice: enabled,
        canExportBackup: enabled,
        canImportBackup: enabled,
        canExportDevices: enabled,
        canImportDevices: enabled,
        canExportServers: enabled,
        canImportServers: enabled,
        canExportSchematic: enabled,
        canRunHelpdeskDiagnostics: enabled,
        canExecuteHelpdeskActions: enabled,
        canViewHelpdeskEventViewer: enabled,
        canTerminateHelpdeskProcesses: enabled,
        canCleanHelpdeskTemp: enabled,
        canRunHelpdeskGpupdate: enabled,
        canRunHelpdeskSystemRepair: enabled,
        canInspectHelpdeskDomainUsers: enabled,
        canUnlockHelpdeskDomainUsers: enabled,
        canPowerControlHelpdeskEndpoints: enabled,
        canManageHelpdeskExceptions: enabled,
        canSendHelpdeskMessage: enabled,
        canViewAllHelpdeskHistory: enabled,
        canBatchOperate: enabled,
        canViewSessionRecordings: enabled,
        canPlaybackSessionRecordings: enabled,
        canDownloadSessionRecordings: enabled,
        canDeleteSessionRecordings: enabled,
        canManageSessionRecordingLegalHold: enabled,
        canManageSessionRecordingSettings: enabled,
      };
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
      id: 'contracts_licenses',
      labelEn: 'Contracts, Licenses & SSL',
      labelFa: 'قراردادها، لایسنس و SSL',
      icon: FileCheck,
      color: 'text-emerald-400',
    },
    {
      id: 'helpdesk',
      labelEn: 'HelpDesk Scope & Rules',
      labelFa: 'محدوده و قوانین هلپ‌دسک',
      icon: Headphones,
      color: 'text-teal-400',
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
      labelEn: 'Equipment Overrides',
      labelFa: 'استثنائات تجهیزات شبکه',
      icon: Sliders,
      color: 'text-rose-400',
    },
    {
      id: 'approvals',
      labelEn: 'Approval Chain',
      labelFa: 'زنجیره تایید مراحل',
      icon: Layers,
      color: 'text-amber-400',
    },
  ];

  const universalGeneralActions = DEVICE_ACTIONS_CATALOG.filter(
    (a) => a.category !== 'port' && (!a.platform || a.platform === 'all')
  );
  const mikrotikCoreActions = DEVICE_ACTIONS_CATALOG.filter(
    (a) => a.platform === 'mikrotik' && a.category !== 'port'
  );
  const ciscoConfigActions = DEVICE_ACTIONS_CATALOG.filter(
    (a) => a.platform === 'cisco' && a.category !== 'port'
  );
  const portEquipmentActions = DEVICE_ACTIONS_CATALOG.filter((a) => a.category === 'port');

  // ---------------------------------------------------------------------------
  // Tab 5 Equipment Policy Templates & Cloning Architecture
  // ---------------------------------------------------------------------------
  const builtinDeviceTemplates = useMemo(() => {
    // 1. Full Hardware Admin (All permissions true)
    const fullAdmin: Record<string, boolean> = {};
    DEVICE_ACTIONS_CATALOG.forEach((a) => {
      fullAdmin[a.key] = true;
    });

    // 2. Port & Interface Operator (Field / Helpdesk)
    const portOperator: Record<string, boolean> = {};
    DEVICE_ACTIONS_CATALOG.forEach((a) => {
      portOperator[a.key] = false;
    });
    // Port actions
    portOperator['port_power'] = true;
    portOperator['port_vlan'] = true;
    portOperator['port_description'] = true;
    portOperator['port_speed'] = true;
    portOperator['port_cable_test'] = true;
    portOperator['port_security'] = true;
    portOperator['port_bridge'] = true;
    // Safe general
    portOperator['web_configs'] = true;
    portOperator['inspect_ports'] = true;
    portOperator['ping_keepalive'] = true;
    portOperator['device_note'] = true;
    portOperator['mikrotik_toggle_interface'] = true;
    portOperator['mikrotik_comment'] = true;

    // 3. Read-Only Monitor / NOC Observer
    const readOnlyNoc: Record<string, boolean> = {};
    DEVICE_ACTIONS_CATALOG.forEach((a) => {
      readOnlyNoc[a.key] = false;
    });
    readOnlyNoc['inspect_ports'] = true;
    readOnlyNoc['ping_keepalive'] = true;
    readOnlyNoc['web_configs'] = true;
    readOnlyNoc['device_note'] = true;
    readOnlyNoc['port_cable_test'] = true;

    // 4. Layer 2 & VLAN Administrator
    const l2VlanAdmin: Record<string, boolean> = {};
    DEVICE_ACTIONS_CATALOG.forEach((a) => {
      l2VlanAdmin[a.key] = false;
    });
    // All port actions true
    portEquipmentActions.forEach((a) => {
      l2VlanAdmin[a.key] = true;
    });
    l2VlanAdmin['web_configs'] = true;
    l2VlanAdmin['inspect_ports'] = true;
    l2VlanAdmin['ping_keepalive'] = true;
    l2VlanAdmin['device_note'] = true;
    // Cisco L2
    l2VlanAdmin['cisco_config_vlans'] = true;
    l2VlanAdmin['cisco_config_stp'] = true;
    l2VlanAdmin['cisco_config_l2_security'] = true;
    l2VlanAdmin['cisco_config_write_memory'] = true;
    // MikroTik L2
    l2VlanAdmin['mikrotik_bridge_vlan'] = true;
    l2VlanAdmin['mikrotik_toggle_interface'] = true;
    l2VlanAdmin['mikrotik_comment'] = true;

    // 5. Total Lockdown / Complete Exclusion (Deny All)
    const lockdownDenyAll: Record<string, boolean> = {};
    DEVICE_ACTIONS_CATALOG.forEach((a) => {
      lockdownDenyAll[a.key] = false;
    });

    return [
      {
        id: 'full_admin',
        nameEn: 'Full Hardware Admin',
        nameFa: 'دسترسی کامل مدیریت سخت‌افزار',
        descriptionEn: 'Unrestricted control over all switch/router features, configurations, backups, and ports.',
        descriptionFa: 'اختیارات کامل روی تمامی قابلیت‌ها، پورت‌ها، ترمینال، کانفیگ‌ها و بکاپ‌های دستگاه.',
        badgeEn: 'Full Access',
        badgeFa: 'دسترسی کامل',
        color: 'emerald',
        permissions: fullAdmin,
      },
      {
        id: 'port_operator',
        nameEn: 'Port & Interface Operator',
        nameFa: 'اپراتور پورت و اینترفیس',
        descriptionEn: 'Permits interface power, VLAN assignment, description, cable tests, and port security.',
        descriptionFa: 'مجوز تغییر وضعیت پورت، تخصیص VLAN، عیب‌یابی کابل، تغییر سرعت و برچسب پورت‌ها.',
        badgeEn: 'Port Specialist',
        badgeFa: 'تخصصی پورت',
        color: 'sky',
        permissions: portOperator,
      },
      {
        id: 'read_only_noc',
        nameEn: 'Read-Only NOC Observer',
        nameFa: 'پایشگر خواندنی مرکز عملیات (NOC)',
        descriptionEn: 'Telemetric ping, interface status, and sticky notes only. Zero write or reload access.',
        descriptionFa: 'تنها پایش پینگ، وضعیت لحظه‌ای پورت‌ها و یادداشت‌ها بدون هیچ‌گونه امکان تغییر یا نوشتن.',
        badgeEn: 'Observer',
        badgeFa: 'ناظر مانیتورینگ',
        color: 'indigo',
        permissions: readOnlyNoc,
      },
      {
        id: 'l2_vlan_admin',
        nameEn: 'Layer 2 & VLAN Administrator',
        nameFa: 'مدیر لایه ۲ و سوئیچینگ VLAN',
        descriptionEn: 'Authorized for VLAN database, STP loops, bridge filtering, and switchport security.',
        descriptionFa: 'اختیار ایجاد VLANها، اینترفیس SVI، پروتکل STP، بریج میکروتیک و امنیت پورت.',
        badgeEn: 'L2 Switch',
        badgeFa: 'سوئیچینگ لایه ۲',
        color: 'amber',
        permissions: l2VlanAdmin,
      },
      {
        id: 'lockdown_deny_all',
        nameEn: 'Total Lockdown / Exclude Device',
        nameFa: 'استثنا و مسدودسازی کامل تجهیز',
        descriptionEn: 'Explicitly revokes and blocks 100% of capabilities on this target device.',
        descriptionFa: 'استثنا کردن این تجهیز و مسدودسازی کامل تمامی دسترسی‌ها و عملیات‌ها.',
        badgeEn: 'Lockdown',
        badgeFa: 'استثنا و مسدود',
        color: 'rose',
        permissions: lockdownDenyAll,
      },
    ];
  }, [portEquipmentActions]);

  const showToast = useCallback((msg: string) => {
    setMatrixFeedbackToast(msg);
    setTimeout(() => {
      setMatrixFeedbackToast((prev) => (prev === msg ? null : prev));
    }, 4000);
  }, []);

  const buildTemplateDevicePayload = useCallback(
    (
      tmplPerms: Partial<Record<string, boolean>>,
      tmplApprovalRules?: Partial<Record<string, ActionAccessDecision>>
    ) => {
      const resolvedPerms: Partial<Record<NetworkDeviceActionKey, boolean>> = {};
      const resolvedRules: Partial<Record<NetworkDeviceActionKey, ActionAccessDecision>> = {};

      const allKeys = new Set<string>([
        ...DEVICE_ACTIONS_CATALOG.map((a) => a.key),
        ...Object.keys(tmplPerms || {}),
        ...Object.keys(tmplApprovalRules || {}),
      ]);

      allKeys.forEach((rawKey) => {
        const key = rawKey as NetworkDeviceActionKey;
        const explicitRule = tmplApprovalRules?.[key];
        if (
          explicitRule === 'allow' ||
          explicitRule === 'require_approval' ||
          explicitRule === 'deny'
        ) {
          resolvedRules[key] = explicitRule;
          resolvedPerms[key] = explicitRule !== 'deny';
          return;
        }
        if (typeof tmplPerms?.[key] === 'boolean') {
          const decision: ActionAccessDecision = tmplPerms[key] ? 'allow' : 'deny';
          resolvedRules[key] = decision;
          resolvedPerms[key] = tmplPerms[key];
        }
      });

      return { resolvedPerms, resolvedRules };
    },
    []
  );

  const applyTemplateToDevice = useCallback(
    (
      devId: string,
      tmplPerms: Partial<Record<string, boolean>>,
      tmplName: string,
      tmplApprovalRules?: Partial<Record<string, ActionAccessDecision>>
    ) => {
      const { resolvedPerms, resolvedRules } = buildTemplateDevicePayload(
        tmplPerms,
        tmplApprovalRules
      );
      setDraftPolicy((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          perDevicePermissions: {
            ...(prev.perDevicePermissions || {}),
            [devId]: { ...resolvedPerms },
          },
          perDeviceApprovalRules: {
            ...(prev.perDeviceApprovalRules || {}),
            [devId]: { ...resolvedRules },
          },
        };
      });
      setActivePresetMenuDevId(null);
      showToast(
        isEn
          ? `Template "${tmplName}" applied to device.`
          : `الگوی "${tmplName}" بر روی تجهیز اعمال شد.`
      );
    },
    [buildTemplateDevicePayload, isEn, showToast]
  );

  const applyTemplateToBatch = useCallback(
    (
      tmplPerms: Partial<Record<string, boolean>>,
      tmplName: string,
      tmplApprovalRules?: Partial<Record<string, ActionAccessDecision>>
    ) => {
      if (selectedDeviceIds.size === 0) return;
      const { resolvedPerms, resolvedRules } = buildTemplateDevicePayload(
        tmplPerms,
        tmplApprovalRules
      );
      setDraftPolicy((prev) => {
        if (!prev) return prev;
        const nextPerDev = { ...(prev.perDevicePermissions || {}) };
        const nextRules = { ...(prev.perDeviceApprovalRules || {}) };
        selectedDeviceIds.forEach((id) => {
          nextPerDev[id] = { ...resolvedPerms };
          nextRules[id] = { ...resolvedRules };
        });
        return {
          ...prev,
          perDevicePermissions: nextPerDev,
          perDeviceApprovalRules: nextRules,
        };
      });
      setIsBatchTemplateMenuOpen(false);
      showToast(
        isEn
          ? `Template "${tmplName}" applied to ${selectedDeviceIds.size} devices.`
          : `الگوی "${tmplName}" بر روی ${selectedDeviceIds.size} تجهیز اعمال شد.`
      );
    },
    [selectedDeviceIds, buildTemplateDevicePayload, isEn, showToast]
  );

  const handleCopyFromDevice = useCallback(
    (sourceDevId: string, targetDevIdOrBatch: string) => {
      if (!draftPolicy) return;
      const sourceDev = devices.find((d) => d.id === sourceDevId);
      const sourcePerms =
        draftPolicy.perDevicePermissions?.[sourceDevId] ||
        draftPolicy.defaultDevicePermissions ||
        {};
      const sourceRules =
        draftPolicy.perDeviceApprovalRules?.[sourceDevId] ||
        draftPolicy.defaultDeviceApprovalRules ||
        {};

      if (targetDevIdOrBatch === 'BATCH') {
        if (selectedDeviceIds.size === 0) return;
        setDraftPolicy((prev) => {
          if (!prev) return prev;
          const nextPerDev = { ...(prev.perDevicePermissions || {}) };
          const nextRules = { ...(prev.perDeviceApprovalRules || {}) };
          selectedDeviceIds.forEach((id) => {
            nextPerDev[id] = { ...sourcePerms };
            nextRules[id] = { ...sourceRules };
          });
          return {
            ...prev,
            perDevicePermissions: nextPerDev,
            perDeviceApprovalRules: nextRules,
          };
        });
        setCopyTargetDevId(null);
        setCopySourceSearch('');
        showToast(
          isEn
            ? `Permissions copied from "${sourceDev?.name || sourceDevId}" to ${selectedDeviceIds.size} selected devices.`
            : `دسترسی‌ها از "${sourceDev?.name || sourceDevId}" به ${selectedDeviceIds.size} تجهیز انتخاب شده کپی گردید.`
        );
      } else {
        setDraftPolicy((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            perDevicePermissions: {
              ...(prev.perDevicePermissions || {}),
              [targetDevIdOrBatch]: { ...sourcePerms },
            },
            perDeviceApprovalRules: {
              ...(prev.perDeviceApprovalRules || {}),
              [targetDevIdOrBatch]: { ...sourceRules },
            },
          };
        });
        const targetDev = devices.find((d) => d.id === targetDevIdOrBatch);
        setCopyTargetDevId(null);
        setCopySourceSearch('');
        showToast(
          isEn
            ? `Permissions copied from "${sourceDev?.name || sourceDevId}" to "${targetDev?.name || targetDevIdOrBatch}".`
            : `دسترسی‌ها از "${sourceDev?.name || sourceDevId}" به "${targetDev?.name || targetDevIdOrBatch}" کپی شد.`
        );
      }
    },
    [draftPolicy, devices, selectedDeviceIds, isEn, showToast]
  );

  const handleExcludeDevice = useCallback(
    (devId: string) => {
      const denyAll: Record<string, boolean> = {};
      const denyRules: Record<string, ActionAccessDecision> = {};
      DEVICE_ACTIONS_CATALOG.forEach((a) => {
        denyAll[a.key] = false;
        denyRules[a.key] = 'deny';
      });
      setDraftPolicy((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          perDevicePermissions: {
            ...(prev.perDevicePermissions || {}),
            [devId]: denyAll,
          },
          perDeviceApprovalRules: {
            ...(prev.perDeviceApprovalRules || {}),
            [devId]: denyRules,
          },
        };
      });
      showToast(
        isEn
          ? 'Device excluded and locked down.'
          : 'تجهیز استثنا و کلیه دسترسی‌ها مسدود گردید.'
      );
    },
    [isEn, showToast]
  );

  const handleExcludeBatch = useCallback(() => {
    if (selectedDeviceIds.size === 0) return;
    const denyAll: Record<string, boolean> = {};
    const denyRules: Record<string, ActionAccessDecision> = {};
    DEVICE_ACTIONS_CATALOG.forEach((a) => {
      denyAll[a.key] = false;
      denyRules[a.key] = 'deny';
    });
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      const nextPerDev = { ...(prev.perDevicePermissions || {}) };
      const nextRules = { ...(prev.perDeviceApprovalRules || {}) };
      selectedDeviceIds.forEach((id) => {
        nextPerDev[id] = { ...denyAll };
        nextRules[id] = { ...denyRules };
      });
      return {
        ...prev,
        perDevicePermissions: nextPerDev,
        perDeviceApprovalRules: nextRules,
      };
    });
    showToast(
      isEn
        ? `${selectedDeviceIds.size} devices excluded and locked down.`
        : `${selectedDeviceIds.size} تجهیز استثنا و کلیه دسترسی‌ها مسدود گردید.`
    );
  }, [selectedDeviceIds, isEn, showToast]);

  const handleResetDevice = useCallback(
    (devId: string) => {
      setDraftPolicy((prev) => {
        if (!prev) return prev;
        const nextPerDev = { ...(prev.perDevicePermissions || {}) };
        const nextRules = { ...(prev.perDeviceApprovalRules || {}) };
        delete nextPerDev[devId];
        delete nextRules[devId];
        return {
          ...prev,
          perDevicePermissions: nextPerDev,
          perDeviceApprovalRules: nextRules,
        };
      });
      showToast(
        isEn
          ? 'Device reset to inherit General Policy.'
          : 'تجهیز ریست شد و به پالیسی عمومی بازگشت.'
      );
    },
    [isEn, showToast]
  );

  const handleResetBatch = useCallback(() => {
    if (selectedDeviceIds.size === 0) return;
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      const nextPerDev = { ...(prev.perDevicePermissions || {}) };
      const nextRules = { ...(prev.perDeviceApprovalRules || {}) };
      selectedDeviceIds.forEach((id) => {
        delete nextPerDev[id];
        delete nextRules[id];
      });
      return {
        ...prev,
        perDevicePermissions: nextPerDev,
        perDeviceApprovalRules: nextRules,
      };
    });
    showToast(
      isEn
        ? `${selectedDeviceIds.size} devices reset to inherit General Policy.`
        : `${selectedDeviceIds.size} تجهیز ریست شد و به پالیسی عمومی بازگشت.`
    );
  }, [selectedDeviceIds, isEn, showToast]);

  const handleSaveCustomTemplate = useCallback(
    (sourceDevId: string, name: string) => {
      if (!name.trim() || !draftPolicy) return;
      const snapshotPerms: Partial<Record<NetworkDeviceActionKey, boolean>> = {};
      const snapshotRules: Partial<Record<NetworkDeviceActionKey, ActionAccessDecision>> = {};

      DEVICE_ACTIONS_CATALOG.forEach((action) => {
        const key = action.key as NetworkDeviceActionKey;
        const { decision } = getPerDeviceDecisionState(sourceDevId, key);
        snapshotRules[key] = decision;
        snapshotPerms[key] = decision !== 'deny';
      });

      const rawPerms = draftPolicy.perDevicePermissions?.[sourceDevId] || {};
      const rawRules = draftPolicy.perDeviceApprovalRules?.[sourceDevId] || {};
      Object.entries(rawPerms).forEach(([k, val]) => {
        const key = k as NetworkDeviceActionKey;
        if (snapshotPerms[key] === undefined && typeof val === 'boolean') {
          snapshotPerms[key] = val;
          snapshotRules[key] = val ? 'allow' : 'deny';
        }
      });
      Object.entries(rawRules).forEach(([k, val]) => {
        const key = k as NetworkDeviceActionKey;
        if (val === 'allow' || val === 'require_approval' || val === 'deny') {
          snapshotRules[key] = val;
          snapshotPerms[key] = val !== 'deny';
        }
      });

      const newTmpl = {
        id: `custom_${Date.now()}`,
        nameEn: name.trim(),
        nameFa: name.trim(),
        permissions: snapshotPerms,
        approvalRules: snapshotRules,
      };
      const updated = [newTmpl, ...customTemplates];
      setCustomTemplates(updated);
      try {
        localStorage.setItem(
          'nettopology_custom_device_policy_templates',
          JSON.stringify(updated)
        );
      } catch {}
      setSaveTemplateDevId(null);
      setTemplateNameInput('');
      showToast(
        isEn
          ? `Template "${name.trim()}" saved successfully.`
          : `الگوی "${name.trim()}" با موفقیت ذخیره گردید.`
      );
    },
    [draftPolicy, customTemplates, getPerDeviceDecisionState, isEn, showToast]
  );

  const handleDeleteCustomTemplate = useCallback(
    (tmplId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const updated = customTemplates.filter((t) => t.id !== tmplId);
      setCustomTemplates(updated);
      try {
        localStorage.setItem(
          'nettopology_custom_device_policy_templates',
          JSON.stringify(updated)
        );
      } catch {}
      showToast(isEn ? 'Custom template deleted.' : 'الگوی سفارشی حذف شد.');
    },
    [customTemplates, isEn, showToast]
  );

  const handleToggleSelectDevice = useCallback((devId: string) => {
    setSelectedDeviceIds((prev) => {
      const next = new Set(prev);
      if (next.has(devId)) {
        next.delete(devId);
      } else {
        next.add(devId);
      }
      return next;
    });
  }, []);

  const handleSelectAllVisibleDevices = useCallback(() => {
    setSelectedDeviceIds((prev) => {
      const allVisibleSelected =
        matrixFilteredDevices.length > 0 &&
        matrixFilteredDevices.every((d) => prev.has(d.id));
      if (allVisibleSelected) {
        const next = new Set(prev);
        matrixFilteredDevices.forEach((d) => next.delete(d.id));
        return next;
      } else {
        const next = new Set(prev);
        matrixFilteredDevices.forEach((d) => next.add(d.id));
        return next;
      }
    });
  }, [matrixFilteredDevices]);

  const handleSelectDevicesByPlatform = useCallback(
    (platformType: 'cisco' | 'mikrotik') => {
      setSelectedDeviceIds((prev) => {
        const next = new Set(prev);
        matrixFilteredDevices.forEach((d) => {
          const isCisco = Boolean(
            d.platform?.includes('cisco') ||
              d.platform === 'cisco_ios' ||
              d.platform === 'cisco_ios_xe' ||
              (!d.platform && (d.type === 'switch' || d.type === 'router'))
          );
          const isMikrotik = Boolean(
            d.platform?.includes('mikrotik') ||
              d.platform === 'mikrotik_routeros'
          );
          if (platformType === 'cisco' && isCisco) next.add(d.id);
          if (platformType === 'mikrotik' && isMikrotik) next.add(d.id);
        });
        return next;
      });
    },
    [matrixFilteredDevices]
  );

  type HelpdeskListField =
    | 'allowedHelpdeskIps'
    | 'blockedHelpdeskIps'
    | 'allowedHelpdeskAdGroups'
    | 'allowedHelpdeskAdUsers'
    | 'blockedHelpdeskAdUsers'
    | 'blockedHelpdeskAdGroups'
    | 'blockedHelpdeskLocalUsers';

  const addHelpdeskListItems = useCallback((field: HelpdeskListField, rawText: string) => {
    const tokens = String(rawText || '')
      .split(/[\r\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (tokens.length === 0) return;
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      const current = Array.isArray(prev[field]) ? ([...prev[field]!] as string[]) : [];
      const existingLower = new Set(current.map((x) => x.toLowerCase()));
      tokens.forEach((tok) => {
        if (!existingLower.has(tok.toLowerCase())) {
          existingLower.add(tok.toLowerCase());
          current.push(tok);
        }
      });
      return { ...prev, [field]: current };
    });
  }, []);

  const removeHelpdeskListItem = useCallback((field: HelpdeskListField, idx: number) => {
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      const current = Array.isArray(prev[field]) ? [...prev[field]!] : [];
      current.splice(idx, 1);
      return { ...prev, [field]: current };
    });
  }, []);

  const clearHelpdeskListField = useCallback((field: HelpdeskListField) => {
    setDraftPolicy((prev) => (prev ? { ...prev, [field]: [] } : prev));
  }, []);

  const helpdeskRulesBadgeCount = useMemo(() => {
    if (!draftPolicy) return 0;
    return (
      (draftPolicy.allowedHelpdeskIps?.length || 0) +
      (draftPolicy.blockedHelpdeskIps?.length || 0) +
      (draftPolicy.allowedHelpdeskAdGroups?.length || 0) +
      (draftPolicy.allowedHelpdeskAdUsers?.length || 0) +
      (draftPolicy.blockedHelpdeskAdUsers?.length || 0) +
      (draftPolicy.blockedHelpdeskAdGroups?.length || 0) +
      (draftPolicy.blockedHelpdeskLocalUsers?.length || 0) +
      (draftPolicy.targetHelpdeskIpScope === 'selected' ? 1 : 0) +
      (draftPolicy.targetHelpdeskAdScope === 'selected' ? 1 : 0)
    );
  }, [draftPolicy]);

  const handleMinimizeExceptionsModal = () => {
    dockModal({
      id: 'modal-helpdesk-exceptions',
      labelEn: 'Global HelpDesk Exceptions',
      labelFa: 'استثنائات و مسدودسازی سراسری هلپ‌دسک',
      badge: globalExceptionsCount > 0 ? String(globalExceptionsCount) : undefined,
      category: 'tools',
      onRestore: () => {
        undockModal('modal-helpdesk-exceptions');
        setIsExceptionsModalOpen(true);
      },
      onClose: () => {
        undockModal('modal-helpdesk-exceptions');
        setIsExceptionsModalOpen(false);
      },
    });
    setIsExceptionsModalOpen(false);
  };

  if (!isOpen || !draftPolicy) return null;

  return createPortal(
    <>
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
            const stageCount = Array.isArray(draftPolicy.approvalWorkflowStages)
              ? draftPolicy.approvalWorkflowStages.length
              : 0;
            const isApprovalsWarning =
              tab.id === 'approvals' && approvalCounts.totalCount > 0 && stageCount === 0;
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
                {tab.id === 'helpdesk' && helpdeskRulesBadgeCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums font-bold ${
                      isLightMode
                        ? 'bg-teal-100 text-teal-800'
                        : 'bg-teal-500/20 text-teal-300'
                    }`}
                  >
                    {helpdeskRulesBadgeCount}
                  </span>
                )}
                {tab.id === 'approvals' && (approvalCounts.totalCount > 0 || stageCount > 0) && (
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums font-bold ${
                      isApprovalsWarning
                        ? 'bg-amber-600 text-white'
                        : stageCount > 0
                        ? isLightMode
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-emerald-500/20 text-emerald-300'
                        : isLightMode
                        ? 'bg-slate-200 text-slate-800'
                        : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {stageCount}/3
                  </span>
                )}
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

                {/* 1B: Subject Identity Type & Interactive Multi-Subject Selector */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
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
                      {selectedSubjectIds.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                          {selectedSubjectIds.length} {isEn ? 'selected' : 'مورد انتخاب‌شده'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {(draftPolicy.subjectType === 'ad_user' || draftPolicy.subjectType === 'ad_group') && (
                        <button
                          type="button"
                          onClick={handleFetchAd}
                          disabled={isFetchingAd}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                            isLightMode
                              ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                              : 'bg-slate-900 hover:bg-slate-800 border-white/15 text-slate-200'
                          }`}
                          title={isEn ? 'Reload Active Directory live objects' : 'دریافت مجدد آبجکت‌های زنده اکتیو دایرکتوری'}
                        >
                          <RefreshCw className={`w-3 h-3 text-cyan-400 ${isFetchingAd ? 'animate-spin' : ''}`} />
                          <span>
                            {isEn
                              ? isFetchingAd
                                ? 'Fetching AD...'
                                : 'Fetch AD Objects'
                              : isFetchingAd
                              ? 'درحال بارگذاری...'
                              : 'دریافت آبجکت‌های AD'}
                          </span>
                        </button>
                      )}

                      <FieldInfoTooltip
                        title={isEn ? 'Subject Assignment' : 'انتساب هویت'}
                        whatIsIt={
                          isEn
                            ? 'The entity or entities (Active Directory accounts or Local users/groups) to which this policy is authoritatively mapped.'
                            : 'موجودیتی (کاربر/گروه اکتیو دایرکتوری یا کاربر/گروه محلی) که این پالیسی به آن تعلق می‌گیرد.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Enforces role-based access control based on LDAP domain credentials or local system accounts. You can select multiple subjects for a unified policy.'
                            : 'اعمال کنترل دسترسی مبتنی بر نقش متناسب با اکانت‌های دامین یا حساب‌های کاربری داخلی سیستم. امکان انتخاب چند موجودیت به طور همزمان فراهم است.'
                        }
                        practicalExample={
                          isEn
                            ? 'AD Groups: "Domain Admins", "Network Operators" or Local Users: "admin", "operator1"'
                            : 'گروه‌های AD: "Domain Admins", "NetAdmins" یا کاربران محلی: "admin", "operator1"'
                        }
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                  </div>

                  {/* Subject Type Selector Tabs */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
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
                              subjectIds: [],
                              subjectNames: [],
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

                  {/* Active Selected Subjects Badges / Chips */}
                  {selectedSubjectIds.length > 0 && (
                    <div
                      className={`mb-3 p-3 rounded-xl border space-y-2 ${
                        isLightMode
                          ? 'bg-cyan-50/70 border-cyan-200'
                          : 'bg-cyan-950/30 border-cyan-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className={`font-semibold flex items-center gap-1.5 ${isLightMode ? 'text-cyan-950' : 'text-cyan-200'}`}>
                          <CheckCircle2 className="w-4 h-4 text-cyan-500" />
                          {isEn
                            ? `Selected Subjects (${selectedSubjectIds.length}):`
                            : `موجودیت‌های انتخاب‌شده (${selectedSubjectIds.length}):`}
                        </span>
                        <button
                          type="button"
                          onClick={handleClearAllSubjects}
                          className="text-[11px] font-medium text-rose-500 hover:underline cursor-pointer"
                        >
                          {isEn ? 'Clear All' : 'حذف همه'}
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
                        {selectedSubjectIds.map((id, idx) => {
                          const name = selectedSubjectNames[idx] || id;
                          return (
                            <span
                              key={id}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border shadow-xs ${
                                isLightMode
                                  ? 'bg-white border-cyan-300 text-cyan-950'
                                  : 'bg-slate-900 border-cyan-500/50 text-cyan-100'
                              }`}
                            >
                              <span className="font-semibold">{name}</span>
                              {name !== id && (
                                <span className="font-mono text-[10px] opacity-75">
                                  (@{id.length > 25 ? `${id.slice(0, 22)}...` : id})
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveSubject(id);
                                }}
                                className="hover:text-rose-400 p-0.5 rounded transition cursor-pointer"
                                title={isEn ? 'Remove' : 'حذف'}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* AD Domain Status notice for AD types */}
                  {(draftPolicy.subjectType === 'ad_user' || draftPolicy.subjectType === 'ad_group') && (
                    <div
                      className={`mb-3 p-2.5 rounded-xl border flex items-center justify-between text-[11px] ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-200 text-slate-700'
                          : 'bg-slate-900/60 border-white/10 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="font-medium">
                          {isEn ? 'Active Directory Domain:' : 'دامین اکتیو دایرکتوری:'}
                        </span>
                        <span className="font-mono font-bold text-cyan-400">
                          {effectiveAdConfig?.domain || effectiveAdConfig?.server || (isEn ? 'Configured' : 'پیکربندی‌شده')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] opacity-80">
                          {draftPolicy.subjectType === 'ad_user'
                            ? `${effectiveAdConfig?.syncedUsers?.length || 0} ${isEn ? 'users synced' : 'کاربر همگام‌شده'}`
                            : `${effectiveAdConfig?.syncedGroups?.length || 0} ${isEn ? 'groups synced' : 'گروه همگام‌شده'}`}
                        </span>
                        <button
                          type="button"
                          onClick={handleFetchAd}
                          disabled={isFetchingAd}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 transition cursor-pointer disabled:opacity-50"
                          title={isEn ? 'Re-sync objects from Active Directory' : 'دریافت مجدد آبجکت‌ها از دامین'}
                        >
                          <RefreshCw className={`w-2.5 h-2.5 ${isFetchingAd ? 'animate-spin' : ''}`} />
                          <span>{isFetchingAd ? (isEn ? 'Syncing...' : 'درحال همگام‌سازی...') : (isEn ? 'Sync AD' : 'همگام‌سازی')}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* AD User Interactive Multi-Selector */}
                  {draftPolicy.subjectType === 'ad_user' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-cyan-400 pointer-events-none" />
                          <input
                            type="text"
                            value={adUserSearch}
                            onChange={(e) => setAdUserSearch(e.target.value)}
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
                        {filteredAdUsers.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleSelectAllVisible(
                                filteredAdUsers.map((u) => ({
                                  id: u.samAccountName,
                                  name: u.displayName || u.samAccountName,
                                }))
                              )
                            }
                            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition shrink-0 cursor-pointer ${
                              isLightMode
                                ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                                : 'bg-slate-900 hover:bg-slate-800 border-white/15 text-slate-200'
                            }`}
                          >
                            {isEn ? `Select All (${filteredAdUsers.length})` : `انتخاب همه (${filteredAdUsers.length})`}
                          </button>
                        )}
                      </div>

                      <div
                        className={`max-h-60 overflow-y-auto rounded-xl border p-1 space-y-1 ${
                          isLightMode
                            ? 'bg-white border-slate-200 shadow-inner'
                            : 'bg-slate-950/80 border-white/15 shadow-inner'
                        }`}
                      >
                        {isFetchingAd ? (
                          <div className="p-4 text-center text-xs text-cyan-400 space-y-2">
                            <RefreshCw className="w-4 h-4 animate-spin mx-auto text-cyan-400" />
                            <p>{isEn ? 'Fetching live objects from Active Directory...' : 'در حال دریافت آبجکت‌های زنده از اکتیو دایرکتوری...'}</p>
                          </div>
                        ) : filteredAdUsers.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-400 space-y-2">
                            <p>{isEn ? 'No Active Directory users found matching criteria.' : 'کاربر اکتیو دایرکتوری مطابق با جستجو یافت نشد.'}</p>
                            <button
                              type="button"
                              onClick={handleFetchAd}
                              className="text-cyan-400 hover:underline inline-flex items-center gap-1 font-semibold cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" />
                              {isEn ? 'Click to fetch fresh AD objects' : 'کلیک برای دریافت مجدد آبجکت‌های AD'}
                            </button>
                          </div>
                        ) : (
                          filteredAdUsers.map((u) => {
                            const isChecked = selectedSubjectIds.includes(u.samAccountName);
                            return (
                              <div
                                key={u.samAccountName || u.dn}
                                onClick={() =>
                                  handleToggleSubject(
                                    u.samAccountName,
                                    u.displayName || u.samAccountName
                                  )
                                }
                                className={`w-full flex items-center justify-between p-2.5 rounded-lg text-xs transition cursor-pointer select-none text-start border ${
                                  isChecked
                                    ? isLightMode
                                      ? 'bg-cyan-50 border-cyan-300 text-cyan-950 font-semibold'
                                      : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200 font-semibold'
                                    : isLightMode
                                    ? 'hover:bg-slate-100 border-transparent text-slate-700'
                                    : 'hover:bg-white/5 border-transparent text-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition ${
                                      isChecked
                                        ? 'bg-cyan-500 border-cyan-500 text-white'
                                        : isLightMode
                                        ? 'border-slate-400 bg-white'
                                        : 'border-white/30 bg-slate-900'
                                    }`}
                                  >
                                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-semibold truncate">{u.displayName}</div>
                                    <div className="text-[10px] font-mono opacity-70 truncate">
                                      @{u.samAccountName} {u.department ? `• ${u.department}` : ''} {((u as any).email || u.mail) ? `• ${(u as any).email || u.mail}` : ''}
                                    </div>
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 shrink-0">
                                  LDAP User
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* AD Group Interactive Multi-Selector */}
                  {draftPolicy.subjectType === 'ad_group' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-cyan-400 pointer-events-none" />
                          <input
                            type="text"
                            value={adGroupSearch}
                            onChange={(e) => setAdGroupSearch(e.target.value)}
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
                        {filteredAdGroups.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleSelectAllVisible(
                                filteredAdGroups.map((g) => ({
                                  id: g.dn || g.cn || g.sAMAccountName || g.displayName,
                                  name: g.cn || g.displayName || g.sAMAccountName || g.dn,
                                }))
                              )
                            }
                            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition shrink-0 cursor-pointer ${
                              isLightMode
                                ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                                : 'bg-slate-900 hover:bg-slate-800 border-white/15 text-slate-200'
                            }`}
                          >
                            {isEn ? `Select All (${filteredAdGroups.length})` : `انتخاب همه (${filteredAdGroups.length})`}
                          </button>
                        )}
                      </div>

                      <div
                        className={`max-h-60 overflow-y-auto rounded-xl border p-1 space-y-1 ${
                          isLightMode
                            ? 'bg-white border-slate-200 shadow-inner'
                            : 'bg-slate-950/80 border-white/15 shadow-inner'
                        }`}
                      >
                        {isFetchingAd ? (
                          <div className="p-4 text-center text-xs text-cyan-400 space-y-2">
                            <RefreshCw className="w-4 h-4 animate-spin mx-auto text-cyan-400" />
                            <p>{isEn ? 'Fetching live objects from Active Directory...' : 'در حال دریافت آبجکت‌های زنده از اکتیو دایرکتوری...'}</p>
                          </div>
                        ) : filteredAdGroups.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-400 space-y-2">
                            <p>{isEn ? 'No Active Directory security groups found.' : 'گروه امنیتی اکتیو دایرکتوری یافت نشد.'}</p>
                            <button
                              type="button"
                              onClick={handleFetchAd}
                              className="text-cyan-400 hover:underline inline-flex items-center gap-1 font-semibold cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" />
                              {isEn ? 'Click to fetch fresh AD objects' : 'کلیک برای دریافت مجدد آبجکت‌های AD'}
                            </button>
                          </div>
                        ) : (
                          filteredAdGroups.map((g) => {
                            const groupId = g.dn || g.cn || g.sAMAccountName || g.displayName;
                            const groupName = g.cn || g.displayName || g.sAMAccountName || g.dn;
                            const isChecked = selectedSubjectIds.includes(groupId);
                            return (
                              <div
                                key={groupId}
                                onClick={() => handleToggleSubject(groupId, groupName)}
                                className={`w-full flex items-center justify-between p-2.5 rounded-lg text-xs transition cursor-pointer select-none text-start border ${
                                  isChecked
                                    ? isLightMode
                                      ? 'bg-cyan-50 border-cyan-300 text-cyan-950 font-semibold'
                                      : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200 font-semibold'
                                    : isLightMode
                                    ? 'hover:bg-slate-100 border-transparent text-slate-700'
                                    : 'hover:bg-white/5 border-transparent text-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition ${
                                      isChecked
                                        ? 'bg-cyan-500 border-cyan-500 text-white'
                                        : isLightMode
                                        ? 'border-slate-400 bg-white'
                                        : 'border-white/30 bg-slate-900'
                                    }`}
                                  >
                                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-semibold truncate">{groupName}</div>
                                    <div className="text-[10px] text-slate-400 truncate max-w-md">
                                      {g.description || g.dn}
                                    </div>
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 shrink-0">
                                  {g.memberCount !== undefined ? `${g.memberCount} members` : 'Security Group'}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* Local User Interactive Multi-Selector */}
                  {draftPolicy.subjectType === 'local_user' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-cyan-400 pointer-events-none" />
                          <input
                            type="text"
                            value={localUserSearch}
                            onChange={(e) => setLocalUserSearch(e.target.value)}
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
                        {filteredLocalUsers.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleSelectAllVisible(
                                filteredLocalUsers.map((u) => ({
                                  id: u.id || u.username,
                                  name: u.fullName || u.username,
                                }))
                              )
                            }
                            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition shrink-0 cursor-pointer ${
                              isLightMode
                                ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                                : 'bg-slate-900 hover:bg-slate-800 border-white/15 text-slate-200'
                            }`}
                          >
                            {isEn ? `Select All (${filteredLocalUsers.length})` : `انتخاب همه (${filteredLocalUsers.length})`}
                          </button>
                        )}
                      </div>

                      <div
                        className={`max-h-60 overflow-y-auto rounded-xl border p-1 space-y-1 ${
                          isLightMode
                            ? 'bg-white border-slate-200 shadow-inner'
                            : 'bg-slate-950/80 border-white/15 shadow-inner'
                        }`}
                      >
                        {filteredLocalUsers.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400">
                            {isEn ? 'No matching local users found' : 'کاربری یافت نشد'}
                          </div>
                        ) : (
                          filteredLocalUsers.map((u) => {
                            const userId = u.id || u.username;
                            const userName = u.fullName || u.username;
                            const isChecked = selectedSubjectIds.includes(userId);
                            return (
                              <div
                                key={userId}
                                onClick={() => handleToggleSubject(userId, userName)}
                                className={`w-full flex items-center justify-between p-2.5 rounded-lg text-xs transition cursor-pointer select-none text-start border ${
                                  isChecked
                                    ? isLightMode
                                      ? 'bg-cyan-50 border-cyan-300 text-cyan-950 font-semibold'
                                      : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200 font-semibold'
                                    : isLightMode
                                    ? 'hover:bg-slate-100 border-transparent text-slate-700'
                                    : 'hover:bg-white/5 border-transparent text-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition ${
                                      isChecked
                                        ? 'bg-cyan-500 border-cyan-500 text-white'
                                        : isLightMode
                                        ? 'border-slate-400 bg-white'
                                        : 'border-white/30 bg-slate-900'
                                    }`}
                                  >
                                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-semibold truncate">{userName}</div>
                                    <div className="text-[10px] font-mono opacity-70 truncate">
                                      @{u.username} • {u.role || 'user'} {u.email ? `• ${u.email}` : ''}
                                    </div>
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 shrink-0">
                                  Local User
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* Local Group Interactive Multi-Selector */}
                  {draftPolicy.subjectType === 'local_group' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-cyan-400 pointer-events-none" />
                          <input
                            type="text"
                            value={localGroupSearch}
                            onChange={(e) => setLocalGroupSearch(e.target.value)}
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
                        {filteredLocalGroups.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleSelectAllVisible(
                                filteredLocalGroups.map((g) => ({
                                  id: g.id,
                                  name: g.name,
                                }))
                              )
                            }
                            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition shrink-0 cursor-pointer ${
                              isLightMode
                                ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                                : 'bg-slate-900 hover:bg-slate-800 border-white/15 text-slate-200'
                            }`}
                          >
                            {isEn ? `Select All (${filteredLocalGroups.length})` : `انتخاب همه (${filteredLocalGroups.length})`}
                          </button>
                        )}
                      </div>

                      <div
                        className={`max-h-60 overflow-y-auto rounded-xl border p-1 space-y-1 ${
                          isLightMode
                            ? 'bg-white border-slate-200 shadow-inner'
                            : 'bg-slate-950/80 border-white/15 shadow-inner'
                        }`}
                      >
                        {filteredLocalGroups.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400">
                            {isEn ? 'No matching local groups found' : 'گروهی یافت نشد'}
                          </div>
                        ) : (
                          filteredLocalGroups.map((g) => {
                            const isChecked = selectedSubjectIds.includes(g.id);
                            return (
                              <div
                                key={g.id}
                                onClick={() => handleToggleSubject(g.id, g.name)}
                                className={`w-full flex items-center justify-between p-2.5 rounded-lg text-xs transition cursor-pointer select-none text-start border ${
                                  isChecked
                                    ? isLightMode
                                      ? 'bg-cyan-50 border-cyan-300 text-cyan-950 font-semibold'
                                      : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200 font-semibold'
                                    : isLightMode
                                    ? 'hover:bg-slate-100 border-transparent text-slate-700'
                                    : 'hover:bg-white/5 border-transparent text-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition ${
                                      isChecked
                                        ? 'bg-cyan-500 border-cyan-500 text-white'
                                        : isLightMode
                                        ? 'border-slate-400 bg-white'
                                        : 'border-white/30 bg-slate-900'
                                    }`}
                                  >
                                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-semibold truncate">{g.name}</div>
                                    <div className="text-[10px] text-slate-400 truncate">
                                      {g.description || 'Local Group'}
                                    </div>
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 shrink-0">
                                  Local Group
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 1C: Target Infrastructure Scope & Device Grouping */}
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
                          ? 'Target Infrastructure Scope & Device Grouping'
                          : 'محدوده پوشش زیرساخت، تجهیزات هدف و گروه‌بندی (Target Infrastructure Scope)'}
                      </h4>
                    </div>
                    <FieldInfoTooltip
                      title={isEn ? 'Target Infrastructure Scope' : 'محدوده پوشش تجهیزات و سرورها'}
                      whatIsIt={
                        isEn
                          ? 'Defines which specific physical switches, routers, and server fleet nodes this access policy governs.'
                          : 'مشخص می‌کند این خط‌مشی دسترسی (Access Policy) بر روی کدام سوییچ‌ها، روترها و سرورهای ناوگان اعمال خواهد شد.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Enforces the least-privilege boundary across infrastructure, ensuring operators only interact with their designated hardware branch or cluster.'
                          : 'تضمین اصل حداقل اختیارات (Least Privilege) و ایزولاسیون زیرساخت‌های حساس؛ به‌طوری‌که اپراتورها فقط به تجهیزات و سرورهای حوزه کاری خود دسترسی داشته باشند.'
                      }
                      practicalExample={
                        isEn
                          ? 'Select "Specific Device & Server Groups" and choose "Access Layer Switches" and "Branch Tehran".'
                          : 'انتخاب «گروه‌های مشخص از تجهیزات و سرورها» و تیک زدن گروه‌هایی نظیر "سوییچ‌های لایه دسترسی" یا "شعب اصفهان".'
                      }
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>

                  <p
                    className={`text-[11px] mb-3 ${
                      isLightMode ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    {isEn
                      ? 'Choose whether this policy applies globally across all infrastructure, specific pre-defined device groups, or individual selected hardware nodes.'
                      : 'مشخص کنید این پالیسی به صورت سراسری روی تمام زیرساخت، روی گروه‌های از پیش تعریف‌شده، یا روی تجهیزات و سرورهای خاص اعمال گردد.'}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-3">
                    {[
                      {
                        scope: 'all',
                        labelEn: 'All Network Devices & Servers',
                        labelFa: 'تمام تجهیزات و سرورها (All Infrastructure)',
                        descEn: 'Global scope across all managed network switches, routers, and server fleet',
                        descFa: 'دسترسی سراسری به کلیه سوییچ‌ها، روترها و سرورهای ناوگان شبکه',
                        icon: Globe,
                      },
                      {
                        scope: 'groups',
                        labelEn: 'Specific Device & Server Groups',
                        labelFa: 'گروه‌های مشخص از تجهیزات و سرورها',
                        descEn: 'Bound to authorized device groups configured in Device Grouping & Tagging',
                        descFa: 'محدودسازی به گروه‌های ساخته‌شده در بخش گروه‌بندی و برچسب‌گذاری تجهیزات',
                        icon: Layers,
                      },
                      {
                        scope: 'specific',
                        labelEn: 'Individual Specific Devices & Servers',
                        labelFa: 'تجهیزات و سرورهای خاص و تفکیکی',
                        descEn: 'Explicitly checked individual switches, routers, and server compute nodes',
                        descFa: 'انتخاب دقیق، دستی و تفکیکی سوییچ‌ها، روترها و سرورها بر اساس نام یا IP',
                        icon: Server,
                      },
                    ].map((item) => {
                      const isSelected = draftPolicy.targetScope === item.scope;
                      const ScopeIcon = item.icon;
                      return (
                        <button
                          key={item.scope}
                          type="button"
                          onClick={() => {
                            setDraftPolicy({
                              ...draftPolicy,
                              targetScope: item.scope as any,
                              targetServerScope: item.scope === 'all' ? 'all' : (draftPolicy.targetServerScope || 'all'),
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
                            <span className="flex items-center gap-1.5">
                              <ScopeIcon className="w-3.5 h-3.5 text-amber-400" />
                              <span>{isEn ? item.labelEn : item.labelFa}</span>
                            </span>
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
                      className={`p-3.5 rounded-xl border space-y-2.5 animate-fadeIn ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-200'
                          : 'bg-slate-900/80 border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-amber-400">
                            {isEn ? 'Authorized Device & Server Groups:' : 'گروه‌های تجهیزات و سرورهای مجاز:'}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            {draftPolicy.targetGroupIds?.length || 0} / {liveDeviceGroups.length} {isEn ? 'selected' : 'انتخاب شده'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setDraftPolicy({
                                ...draftPolicy,
                                targetGroupIds: liveDeviceGroups.map((g) => g.id),
                              })
                            }
                            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 cursor-pointer transition"
                          >
                            {isEn ? 'Select All Groups' : 'انتخاب همه گروه‌ها'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftPolicy({
                                ...draftPolicy,
                                targetGroupIds: [],
                              })
                            }
                            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-white/5 text-slate-400 border border-white/10 hover:text-white cursor-pointer transition"
                          >
                            {isEn ? 'Deselect All' : 'لغو انتخاب'}
                          </button>
                        </div>
                      </div>

                      {liveDeviceGroups.length === 0 ? (
                        <div className="text-xs text-amber-400/90 p-3 text-center rounded-lg bg-amber-500/5 border border-amber-500/20">
                          {isEn
                            ? 'No device groups defined in database yet. You can create groups in Settings > Device Grouping & Tagging.'
                            : 'هنوز هیچ گروه دستگاهی در دیتابیس ثبت نشده است. می‌توانید در بخش «تنظیمات > گروه‌بندی و برچسب‌گذاری» گروه‌های جدید بسازید.'}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                          {liveDeviceGroups.map((g) => {
                            const isChecked = (draftPolicy.targetGroupIds || []).includes(g.id);
                            const devCount = g.device_ids?.length || g.deviceIds?.length || 0;
                            const srvCount = g.server_ids?.length || g.serverIds?.length || 0;
                            return (
                              <label
                                key={g.id}
                                className={`flex flex-col p-2.5 rounded-xl border text-xs cursor-pointer select-none transition ${
                                  isChecked
                                    ? isLightMode
                                      ? 'bg-amber-50 border-amber-400 text-amber-950 font-semibold shadow-xs'
                                      : 'bg-amber-500/20 border-amber-500/40 text-amber-200 font-semibold shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                                    : isLightMode
                                    ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                                }`}
                              >
                                <div className="flex items-center gap-2">
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
                                    className="accent-amber-500 w-3.5 h-3.5 cursor-pointer rounded"
                                  />
                                  <span className="font-bold truncate">{g.name}</span>
                                </div>
                                {g.description && (
                                  <div className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                                    {g.description}
                                  </div>
                                )}
                                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-1.5 pt-1.5 border-t border-white/5">
                                  <span>
                                    {devCount} {isEn ? 'devices' : 'دستگاه'} • {srvCount} {isEn ? 'servers' : 'سرور'}
                                  </span>
                                  {g.color && (
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: g.color }}
                                      title={g.color}
                                    />
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Individual specific devices & servers when targetScope === 'specific' */}
                  {draftPolicy.targetScope === 'specific' && (
                    <div
                      className={`p-3.5 rounded-xl border space-y-3 animate-fadeIn ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-200'
                          : 'bg-slate-900/80 border-white/10'
                      }`}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Specific Network Devices */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                              <Network className="w-3.5 h-3.5" />
                              <span>{isEn ? 'Network Switches & Routers:' : 'سوییچ‌ها و روترهای خاص شبکه:'}</span>
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {(draftPolicy.targetDeviceIds || []).length} / {devices.length}
                            </span>
                          </div>
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 rtl:left-auto rtl:right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                              type="text"
                              value={deviceSearchQuery}
                              onChange={(e) => setDeviceSearchQuery(e.target.value)}
                              placeholder={isEn ? 'Filter devices by name, IP, platform...' : 'فیلتر سوییچ‌ها بر اساس نام، IP یا پلتفرم...'}
                              className={`w-full pl-8 pr-8 py-1 rounded-lg text-xs outline-none ${
                                isLightMode
                                  ? 'bg-white border border-slate-300 text-slate-900'
                                  : 'bg-slate-900 border border-white/15 text-white'
                              }`}
                            />
                          </div>

                          <div className="max-h-48 overflow-y-auto space-y-1.5 p-1">
                            {filteredDevicesForSpecificScope.length === 0 ? (
                              <div className="text-[11px] text-slate-400 text-center p-2">
                                {isEn ? 'No devices found' : 'دستگاهی یافت نشد'}
                              </div>
                            ) : (
                              filteredDevicesForSpecificScope.map((d) => {
                                const isChecked = (draftPolicy.targetDeviceIds || []).includes(d.id);
                                return (
                                  <label
                                    key={d.id}
                                    className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer select-none transition ${
                                      isChecked
                                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-200 font-semibold'
                                        : isLightMode
                                        ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
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
                                        className="accent-amber-500 w-3.5 h-3.5 rounded cursor-pointer"
                                      />
                                      <span className="truncate">{d.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-[10px] font-mono text-slate-400">
                                        {d.ip}
                                      </span>
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
                                        {d.platform || 'cisco'}
                                      </span>
                                    </div>
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </div>

                        {/* Specific Servers */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                              <Server className="w-3.5 h-3.5" />
                              <span>{isEn ? 'Remote Server Fleet Nodes:' : 'سرورهای ریموت خاص ناوگان:'}</span>
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {(draftPolicy.targetServerIds || []).length} / {allAvailableServers.length}
                            </span>
                          </div>
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 rtl:left-auto rtl:right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                              type="text"
                              value={serverScopeSearch}
                              onChange={(e) => setServerScopeSearch(e.target.value)}
                              placeholder={isEn ? 'Filter servers by name, IP, OS...' : 'فیلتر سرورها بر اساس نام، IP یا سیستم‌عامل...'}
                              className={`w-full pl-8 pr-8 py-1 rounded-lg text-xs outline-none ${
                                isLightMode
                                  ? 'bg-white border border-slate-300 text-slate-900'
                                  : 'bg-slate-900 border border-white/15 text-white'
                              }`}
                            />
                          </div>

                          <div className="max-h-48 overflow-y-auto space-y-1.5 p-1">
                            {filteredServersForScope.length === 0 ? (
                              <div className="text-[11px] text-slate-400 text-center p-2">
                                {isEn ? 'No servers found' : 'سروری یافت نشد'}
                              </div>
                            ) : (
                              filteredServersForScope.map((s) => {
                                const isChecked = (draftPolicy.targetServerIds || []).includes(s.id);
                                return (
                                  <label
                                    key={s.id}
                                    className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer select-none transition ${
                                      isChecked
                                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-200 font-semibold'
                                        : isLightMode
                                        ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                                        : 'bg-white/5 border-white/10 text-slate-300'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) => {
                                          const current = draftPolicy.targetServerIds || [];
                                          const next = e.target.checked
                                            ? [...current, s.id]
                                            : current.filter((id) => id !== s.id);
                                          setDraftPolicy({
                                            ...draftPolicy,
                                            targetServerIds: next,
                                            targetServerScope: next.length > 0 ? 'specific' : 'all',
                                          });
                                        }}
                                        className="accent-amber-500 w-3.5 h-3.5 rounded cursor-pointer"
                                      />
                                      <span className="truncate">{s.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-[10px] font-mono text-slate-400">
                                        {s.ip}
                                      </span>
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                                        {s.os_type || s.os_distro || 'linux'}
                                      </span>
                                    </div>
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </div>
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
                      {
                        key: 'canViewContracts',
                        labelEn: 'Contracts Management',
                        labelFa: 'مدیریت قراردادها',
                        descEn: 'Access to the Contracts repository & SLA view',
                        descFa: 'دسترسی به صفحه مخزن قراردادها و وضعیت SLA',
                        icon: ScrollText,
                        whatIsItEn: 'Controls access to the Contracts page and navigation tab in the panel.',
                        whatIsItFa: 'مجوز ورود و مشاهده صفحه و منوی قراردادها در پنل.',
                        whyNeededEn: 'Contracts contain sensitive commercial agreements, financial terms, and vendor SLAs that should be restricted to authorized roles.',
                        whyNeededFa: 'قراردادها شامل توافقات تجاری، اطلاعات مالی و شرایط پشتیبانی حساس هستند و باید محدود به افراد مجاز باشند.',
                        practicalExampleEn: 'Enable for Legal, Procurement, IT Managers, and Administrators',
                        practicalExampleFa: 'برای مدیران IT، حقوقی، تدارکات و ادمین‌های شبکه فعال باشد',
                      },
                      {
                        key: 'canViewLicenses',
                        labelEn: 'Licenses Management',
                        labelFa: 'مدیریت لایسنس‌ها',
                        descEn: 'Access to Software & Equipment Licenses page',
                        descFa: 'دسترسی به صفحه لایسنس‌های نرم‌افزاری و تجهیزات',
                        icon: FileCheck,
                        whatIsItEn: 'Controls access to the Software & Equipment Licenses page and navigation tab.',
                        whatIsItFa: 'مجوز ورود و مشاهده صفحه و منوی مدیریت لایسنس‌ها در پنل.',
                        whyNeededEn: 'Software licenses and product keys require controlled access to prevent license leaks or unauthorized expiration management.',
                        whyNeededFa: 'کلیدهای فعال‌سازی و لایسنس‌های نرم‌افزاری نیازمند دسترسی کنترل‌شده برای پیشگیری از افشای کلیدها هستند.',
                        practicalExampleEn: 'Enable for IT Asset Managers, System Administrators, and Super Administrators',
                        practicalExampleFa: 'برای مدیران دارایی‌های IT، ادمین‌های سیستم و سوپرادمین‌ها فعال باشد',
                      },
                      {
                        key: 'canViewSslCertificates',
                        labelEn: 'SSL / TLS Certificates',
                        labelFa: 'گواهینامه‌های SSL / TLS',
                        descEn: 'Access to SSL certificate expiration & domain monitor page',
                        descFa: 'دسترسی به صفحه پایش انقضا و مدیریت گواهینامه‌های SSL و دامنه‌ها',
                        icon: Lock,
                        whatIsItEn: 'Controls access to the SSL / TLS Certificates lifecycle monitoring page and sidebar menu item.',
                        whatIsItFa: 'مجوز ورود و مشاهده صفحه و منوی گواهینامه‌های SSL / TLS و پایش انقضای دامنه‌ها در پنل.',
                        whyNeededEn: 'SSL certificates inventory reveals internal/external endpoints, expiry timelines, and certificate authorities; restricting access enforces least-privilege governance.',
                        whyNeededFa: 'فهرست گواهینامه‌های SSL شامل دامنه‌های داخلی/خارجی و زمان انقضای سرویس‌های حیاتی است و باید منحصراً در اختیار کاربران مجاز باشد.',
                        practicalExampleEn: 'Enable for Security Engineers, DevOps, NOC Operators, and Administrators',
                        practicalExampleFa: 'برای مهندسین امنیت، دواپس، اپراتورهای NOC و مدیران زیرساخت فعال شود',
                      },
                      {
                        key: 'canViewHelpdesk',
                        labelEn: 'HelpDesk (Endpoint Support)',
                        labelFa: 'هلپ‌دسک (پشتیبانی سیستم کاربران)',
                        descEn: 'Access to Agentless On-Demand Endpoint HelpDesk workspace',
                        descFa: 'دسترسی به صفحه پشتیبانی بدون‌ایجنت و لحظه‌ای سیستم کاربران (HelpDesk)',
                        icon: Monitor,
                        whatIsItEn: 'Controls access to the HelpDesk sidebar menu and On-Demand single-host endpoint support page.',
                        whatIsItFa: 'مجوز مشاهده منوی HelpDesk در سایدبار و ورود به صفحه پشتیبانی لحظه‌ای تک‌سیستمی کاربران.',
                        whyNeededEn: 'Enforces least-privilege separation so only authorized support engineers can connect to user workstations.',
                        whyNeededFa: 'جداسازی دسترسی‌ها را تضمین می‌کند تا فقط کارشناسان مجاز پشتیبانی بتوانند به سیستم کاربران متصل شوند.',
                        practicalExampleEn: 'Enable for HelpDesk Technicians, IT Support Engineers, and Administrators',
                        practicalExampleFa: 'برای کارشناسان هلپ‌دسک، تیم پشتیبانی IT و مدیران سیستم فعال شود',
                      },
                      {
                        key: 'canViewHelpdeskUsers',
                        labelEn: 'HelpDesk (AD & User Support)',
                        labelFa: 'هلپ‌دسک: پشتیبانی کاربران اکتیو دایرکتوری (User Support)',
                        descEn: 'Access to Active Directory & User Support HelpDesk page (AD profile, Exchange quota, history)',
                        descFa: 'دسترسی به صفحه پشتیبانی کاربران و اکانت‌های دامین (پروفایل AD، میل‌باکس، گزارش‌ها و تاریخچه)',
                        icon: Users,
                        whatIsItEn: 'Controls visibility and backend authorization for the Active Directory & User Support HelpDesk page independently of endpoint workstation diagnostics.',
                        whatIsItFa: 'مجوز مشاهده و استفاده از صفحه پشتیبانی کاربران اکتیو دایرکتوری و استعلام میل‌باکس، مستقل از دسترسی ریموت به سیستم کاربران.',
                        whyNeededEn: 'Allows assigning AD User HelpDesk access to service-desk agents who look up user accounts and mailbox quotas without granting workstation remote control.',
                        whyNeededFa: 'امکان تفکیک دسترسی استعلام اکانت‌های AD و ایمیل را برای اپراتورهای میز خدمت بدون نیاز به دسترسی ریموت سیستم فراهم می‌کند.',
                        practicalExampleEn: 'Enable for Service Desk Operators, AD Support Staff, and Administrators',
                        practicalExampleFa: 'برای کارشناسان میز خدمت، پشتیبان‌های دامین و مدیران سیستم فعال شود',
                      },
                      {
                        key: 'canViewHelpdeskGroups',
                        labelEn: 'HelpDesk (AD & Group Support)',
                        labelFa: 'هلپ‌دسک: پشتیبانی گروه‌های اکتیو دایرکتوری (Group Support)',
                        descEn: 'Access to Active Directory & Group Support HelpDesk page (creator, OU, members, plain ACLs)',
                        descFa: 'دسترسی به صفحه پشتیبانی گروه‌های اکتیو دایرکتوری (سازنده، مسیر OU، اعضا و راهنمای سطح دسترسی)',
                        icon: Users,
                        whatIsItEn: 'Controls visibility and backend authorization for the Active Directory & Group Support HelpDesk workspace and group browser.',
                        whatIsItFa: 'مجوز مشاهده و استعلام اطلاعات کامل گروه‌های اکتیو دایرکتوری (تاریخ ساخت، سازنده، اعضا و پرمیژن‌ها).',
                        whyNeededEn: 'Separates AD group auditing from user/workstation support so access governance reviewers or AD operators can inspect groups under least privilege.',
                        whyNeededFa: 'دسترسی بررسی و ممیزی گروه‌های دامین را به صورت مستقل از پشتیبانی ایستگاه‌های کاری کنترل می‌کند.',
                        practicalExampleEn: 'Enable for AD Support Engineers, Security Auditors, and Administrators',
                        practicalExampleFa: 'برای مهندسان AD، ممیزان امنیت و مدیران زیرساخت فعال شود',
                      },
                      {
                        key: 'canBulkConfigureDevices',
                        labelEn: 'Bulk Device Configuration',
                        labelFa: 'پیکربندی گروهی تجهیزات شبکه',
                        descEn: 'Batch multi-vendor config & CLI automation suite',
                        descFa: 'ماژول اعمال گروهی دستورات و اتوماسیون روی تجهیزات',
                        icon: Sliders,
                        whatIsItEn: 'Controls access to the Bulk Device Configuration modal and multi-device CLI command automation suite.',
                        whatIsItFa: 'مجوز باز کردن مودال و استفاده از سامانه اتوماسیون و اجرای گروهی دستورات روی تجهیزات شبکه.',
                        whyNeededEn: 'Batch CLI execution carries high operational risk. Restricting this permission prevents accidental or unauthorized network-wide changes.',
                        whyNeededFa: 'اجرای دستورات گروهی ریسک بالایی دارد؛ محدود کردن آن مانع از دستکاری‌های ناخواسته یا خرابکاری گسترده در شبکه می‌شود.',
                        practicalExampleEn: 'Enable only for Senior Network Engineers and Super Administrators',
                        practicalExampleFa: 'فقط برای مدیران ارشد شبکه و ادمین‌های زیرساخت فعال باشد',
                      },
                      {
                        key: 'canBulkConfigureServers',
                        labelEn: 'Bulk Server Configuration',
                        labelFa: 'پیکربندی گروهی سرورها',
                        descEn: 'Batch Linux fleet config & multi-server automation suite',
                        descFa: 'ماژول اعمال گروهی دستورات و اتوماسیون روی سرورهای ناوگان',
                        icon: Sliders,
                        whatIsItEn: 'Controls access to the Bulk Server Configuration modal and multi-server automation suite in the Remote Servers & Fleet view.',
                        whatIsItFa: 'مجوز باز کردن مودال و استفاده از سامانه اتوماسیون و اجرای گروهی دستورات و تمپلیت‌ها روی سرورهای لینوکس ناوگان.',
                        whyNeededEn: 'Batch server execution carries critical system-wide operational risks. Restricting this permission prevents accidental or unauthorized mass configuration changes across servers.',
                        whyNeededFa: 'اجرای دستورات گروهی روی سرورها ریسک عملیاتی و سیستمی بالایی دارد؛ محدود کردن آن مانع از دستکاری‌های ناخواسته، قطعی سرویس‌ها یا تغییرات غیرمجاز در کل سرورها می‌شود.',
                        practicalExampleEn: 'Enable only for Senior DevOps Engineers, Linux System Administrators, and Super Administrators',
                        practicalExampleFa: 'فقط برای مدیران ارشد سیستم لینوکس، مهندسان ارشد دوآپس و سوپرادمین‌ها فعال باشد',
                      },
                      {
                        key: 'canViewCommunications',
                        labelEn: 'Inbox & Notifications Center',
                        labelFa: 'مرکز پیام‌ها و اعلانات',
                        descEn: 'Access personal Inbox, alerts feed, and live notification bell',
                        descFa: 'مشاهده صندوق پیام‌ها، اعلانات سیستم و زنگ هشدار زنده',
                        icon: Bell,
                        whatIsItEn: 'Allows the user to open the Communications & Notifications Center and view incoming system alerts, broadcasts, and messages.',
                        whatIsItFa: 'مجوز ورود به صفحه مرکز پیام‌ها و اعلانات جهت مشاهده هشدارهای سیستم، اطلاعیه‌ها و پیام‌ها.',
                        whyNeededEn: 'Keeps IT staff aligned with security notices, license alerts, and team communications in one unified inbox.',
                        whyNeededFa: 'کارشناسان و مدیران برای آگاهی سریع از هشدارهای امنیتی، انقضای لایسنس و مکاتبات تیمی به این صفحه نیاز دارند.',
                        practicalExampleEn: 'Enable for all active IT engineers, NOC operators, and administrators',
                        practicalExampleFa: 'برای همه کارشناسان IT، اپراتورهای مانیتورینگ و مدیران فعال باشد',
                      },
                      {
                        key: 'canSendCommunications',
                        labelEn: 'Send Direct / Group Messages',
                        labelFa: 'ارسال پیام به همکاران و گروه‌ها',
                        descEn: 'Dispatch direct messages or team channel updates',
                        descFa: 'امکان ارسال پیام مستقیم به کاربران یا گروه‌های کاربری',
                        icon: Send,
                        whatIsItEn: 'Grants permission to compose and send messages to individual panel users or defined user groups.',
                        whatIsItFa: 'مجوز ارسال پیام مستقیم به سایر کاربران یا اعضای یک گروه در مرکز پیام‌ها.',
                        whyNeededEn: 'Prevents read-only guest or monitor-only accounts from dispatching messages while empowering engineers to collaborate.',
                        whyNeededFa: 'از ارسال پیام توسط اکانت‌های صرفاً نظارتی جلوگیری کرده و ارتباط تیمی مهندسان را فعال می‌کند.',
                        practicalExampleEn: 'Enable for IT Engineers, Team Leads, and Administrators',
                        practicalExampleFa: 'برای کارشناسان فنی، سرپرستان تیم و مدیران فعال باشد',
                      },
                      {
                        key: 'canSendAnnouncements',
                        labelEn: 'Broadcast Official Announcements',
                        labelFa: 'ارسال اطلاعیه‌های عمومی مدیر',
                        descEn: 'Send panel-wide announcements with read receipts',
                        descFa: 'ارسال اطلاعیه سراسری به کل پنل همراه با تاییدیه مطالعه',
                        icon: Megaphone,
                        whatIsItEn: 'Authorizes broadcasting official organizational announcements to all active panel users with optional mandatory read acknowledgment.',
                        whatIsItFa: 'اختیار ارسال اطلاعیه رسمی سراسری به تمام کاربران سامانه همراه با الزام ثبت تاییدیه خوانده‌شدن.',
                        whyNeededEn: 'Official maintenance windows and security directives should only be broadcast by authorized IT managers.',
                        whyNeededFa: 'اطلاعیه‌های سراسری نگهداری یا دستورات امنیتی باید منحصراً توسط مدیران مجاز صادر شوند.',
                        practicalExampleEn: 'Enable only for IT Managers, Security Officers, and Super Administrators',
                        practicalExampleFa: 'فقط برای مدیران IT، مسئولان امنیت و سوپرادمین‌ها فعال باشد',
                      },
                      {
                        key: 'canApproveActions',
                        labelEn: 'Two-Step Action Approvals',
                        labelFa: 'تاییدیه دو مرحله‌ای عملیات حساس',
                        descEn: 'Approve or reject sensitive four-eyes network & server requests',
                        descFa: 'تایید یا رد درخواست‌های پرریسک و حساس شبکه و سرور',
                        icon: ShieldCheck,
                        whatIsItEn: 'Allows reviewing, approving, or rejecting sensitive operational requests submitted under two-step approval workflows.',
                        whatIsItFa: 'اختیار بررسی، تایید یا رد درخواست‌های اجرای دستورات حساس در گردش کار تایید دو مرحله‌ای.',
                        whyNeededEn: 'Enforces four-eyes separation of duties before high-risk changes run on core infrastructure.',
                        whyNeededFa: 'اجرای تغییرات پرخطر روی زیرساخت را منوط به تایید مدیر بالادستی می‌کند.',
                        practicalExampleEn: 'Strictly limit to IT Managers and Senior Infrastructure Leads',
                        practicalExampleFa: 'منحصراً برای مدیران ارشد IT و سوپرادمین‌ها فعال باشد',
                      },
                      {
                        key: 'canViewLogs',
                        optIn: true,
                        labelEn: 'Audit & Command Logs',
                        labelFa: 'لاگ‌های ممیزی و دستورات',
                        descEn: 'Device/server CLI logs, portal events, login reports & blocklist',
                        descFa: 'لاگ دستورات تجهیزات و سرورها، رویدادهای پورتال، گزارش ورود و لیست مسدودی',
                        icon: ScrollText,
                        whatIsItEn: 'Grants access to the Audit & Command Logs page including device commands, server commands, portal events, login reports, blocked IPs, and email reports.',
                        whatIsItFa: 'مجوز ورود و مشاهده صفحه لاگ‌های ممیزی و دستورات (شامل دستورات تجهیزات، سرورها، رویدادهای پورتال، گزارش ورود و ایمیل).',
                        whyNeededEn: 'Audit trails expose sensitive operator actions, IP addresses, and security events; access should be restricted to auditors and managers.',
                        whyNeededFa: 'لاگ‌های ممیزی حاوی تاریخچه عملیات حساس، آدرس IP کاربران و رخدادهای امنیتی است و باید محدود به ممیزان و مدیران مجاز باشد.',
                        practicalExampleEn: 'Enable for Security Auditors, SOC Analysts, and IT Managers; disable for regular Helpdesk operators.',
                        practicalExampleFa: 'برای ممیزان امنیت، تحلیلگران SOC و مدیران IT فعال و برای کاربران پشتیبانی عادی غیرفعال شود.',
                      },
                      {
                        key: 'canViewSessionRecordings',
                        optIn: true,
                        labelEn: 'Session Recordings (Audit & Command Logs)',
                        labelFa: 'ضبط جلسات ریموت (بخش Audit & Command Logs)',
                        descEn: 'Access the Session Recordings tab in Audit & Command Logs (SSH / RDP / VNC)',
                        descFa: 'دسترسی به تب ضبط جلسات ریموت (SSH / RDP / VNC) در صفحه Audit & Command Logs',
                        icon: Video,
                        whatIsItEn: 'Controls visibility and access to the Session Recordings tab inside the Audit & Command Logs page to browse recorded SSH, RDP, and VNC sessions for servers in scope.',
                        whatIsItFa: 'دسترسی و نمایش تب «ضبط جلسات ریموت» در صفحه Audit & Command Logs برای مشاهده آرشیو جلسات ضبط‌شده SSH، RDP و VNC سرورهای مجاز را کنترل می‌کند.',
                        whyNeededEn: 'Separates recorded session video/terminal replay governance from general text logs so organizations can strictly control who inspects screen recordings.',
                        whyNeededFa: 'دسترسی به ویدیوها و بازپخش ترمینال جلسات را از سایر لاگ‌های متنی تفکیک می‌کند تا کنترل دقیقی بر روی مشاهده ضبط‌های حساس اعمال شود.',
                        practicalExampleEn: 'Enable for Security Officers & Compliance Auditors; combine with Playback / Download / Legal Hold permissions in Global Capabilities.',
                        practicalExampleFa: 'برای مسئولان امنیت و ممیزان فعال شود و در صورت نیاز همراه با مجوزهای پخش، دانلود و قفل ضدحذف تنظیم گردد.',
                      },
                      {
                        key: 'canManageNavigationGovernance',
                        labelEn: 'Navigation & Views Governance',
                        labelFa: 'مدیریت دسترسی به منوها و صفحات',
                        descEn: 'Authority to govern & configure panel tabs and view access',
                        descFa: 'اختیار تعیین و محدودسازی دسترسی به تب‌ها و صفحات پنل',
                        icon: Compass,
                        whatIsItEn: 'Allows editing and configuring navigation menu visibility and panel view access rules across policies.',
                        whatIsItFa: 'اختیار تنظیم و تغییر سطوح دسترسی به منوها و صفحات مختلف سامانه در جدول پالیسی‌ها.',
                        whyNeededEn: 'Prevents non-superadmin operators from elevating their privileges or unlocking hidden operational menus.',
                        whyNeededFa: 'جلوگیری از دور زدن محدودیت‌ها یا باز کردن صفحات مسدود توسط کاربران و اپراتورهای سطح پایین.',
                        practicalExampleEn: 'Strictly restricted to Super Administrator',
                        practicalExampleFa: 'منحصراً برای سوپرادمین و بالاترین رده مدیریتی فعال گردد',
                      },
                    ].map((item) => {
                      const isChecked = (item as any).optIn
                        ? Boolean((draftPolicy as any)[item.key])
                        : (draftPolicy as any)[item.key] !== false;
                      const IconComp = item.icon;
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
                              <div className="flex items-center gap-1.5 min-w-0">
                                {IconComp && <IconComp className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                                <span
                                  className={`font-bold text-xs truncate ${
                                    isLightMode ? 'text-slate-900' : 'text-white'
                                  }`}
                                >
                                  {isEn ? item.labelEn : item.labelFa}
                                </span>
                              </div>
                              <FieldInfoTooltip
                                title={isEn ? item.labelEn : item.labelFa}
                                whatIsIt={
                                  isEn
                                    ? ((item as any).whatIsItEn || `Grants view access to the ${item.labelEn} view.`)
                                    : ((item as any).whatIsItFa || `مجوز مشاهده و کار با بخش «${item.labelFa}» در پنل.`)
                                }
                                whyNeeded={
                                  isEn
                                    ? ((item as any).whyNeededEn || 'Prevents unauthorized inspection of network metrics, passwords, or topology.')
                                    : ((item as any).whyNeededFa || 'جلوگیری از دسترسی کاربران غیرمجاز به اطلاعات حساس و تلمتری این بخش.')
                                }
                                practicalExample={
                                  isEn
                                    ? ((item as any).practicalExampleEn || 'Disable for guest/viewer accounts')
                                    : ((item as any).practicalExampleFa || 'برای حساب‌های مهمان یا اپراتور غیرفعال شود')
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
            {/* TAB: Contracts & Licenses Governance */}
            {/* ========================================================================= */}
            {activeTab === 'contracts_licenses' && (
              <div className="space-y-5 animate-fadeIn">
                {/* Informational Guidance Banner */}
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                    isLightMode
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-emerald-950/30 border-emerald-500/20 text-emerald-200'
                  }`}
                >
                  <Info className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <p className="font-semibold mb-0.5">
                      {isEn
                        ? 'Granular Access Governance for Contracts, Licenses & SSL Certificates'
                        : 'مدیریت و کنترل دسترسی جزئی به قراردادها، لایسنس‌ها و گواهینامه‌های SSL'}
                    </p>
                    <p className={`text-[11px] ${isLightMode ? 'text-emerald-800' : 'text-emerald-300/80'}`}>
                      {isEn
                        ? 'Access to Contracts, Licenses, and SSL Certificates pages must first be enabled in the "Navigation & Views" tab. Here you define exact item-level scopes (all vs. specific items) and operational authorities (view, create, edit, live SSL check, delete, or remove attachments).'
                        : 'ورود به صفحات قراردادها، لایسنس‌ها و گواهینامه‌های SSL ابتدا در تب «صفحات و ابزارها» تعیین می‌شود. در این بخش مشخص می‌کنید کاربر به کدام آیتم‌ها (همه یا فقط موارد خاص) دسترسی داشته باشد و چه عملیاتی شامل مشاهده، افزودن، ویرایش، بررسی زنده SSL یا حذف مجاز باشد.'}
                    </p>
                  </div>
                </div>

                {/* ==================== 1. CONTRACTS GOVERNANCE ==================== */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  {/* Section Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <ScrollText className="w-4 h-4 text-emerald-500" />
                      <h4
                        className={`text-xs font-bold ${
                          isLightMode ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {isEn
                          ? 'Contracts Repository Access & Scoping'
                          : 'محدوده و مجوزهای دسترسی به قراردادها'}
                      </h4>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      {draftPolicy?.targetContractScope === 'all'
                        ? (isEn ? 'Scope: All Contracts' : 'دامنه: تمام قراردادها')
                        : `${isEn ? 'Selected:' : 'انتخاب‌شده:'} ${(draftPolicy?.targetContractIds || []).length}`}
                    </span>
                  </div>

                  <p
                    className={`text-[11px] mb-4 ${
                      isLightMode ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    {isEn
                      ? 'Configure whether the subject can access all organizational contracts or only designated specific contracts.'
                      : 'تعیین کنید کاربر به کلیه قراردادهای سازمانی دسترسی داشته باشد یا تنها قراردادهای انتخاب‌شده در لیست زیر.'}
                  </p>

                  {/* Scope Radio Selection */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    {/* All Contracts Radio */}
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition select-none ${
                        (draftPolicy?.targetContractScope || 'all') === 'all'
                          ? isLightMode
                            ? 'bg-emerald-50/80 border-emerald-300 shadow-xs'
                            : 'bg-emerald-500/10 border-emerald-500/40 text-white'
                          : isLightMode
                          ? 'bg-slate-50 border-slate-200 hover:border-slate-300'
                          : 'bg-white/5 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <input
                        type="radio"
                        name="targetContractScope"
                        checked={(draftPolicy?.targetContractScope || 'all') === 'all'}
                        onChange={() =>
                          setDraftPolicy((prev) => (prev ? { ...prev, targetContractScope: 'all' } : prev))
                        }
                        className="mt-0.5 text-emerald-500 focus:ring-emerald-400"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-semibold ${
                              isLightMode ? 'text-slate-900' : 'text-white'
                            }`}
                          >
                            {isEn ? 'All Contracts' : 'دسترسی به تمامی قراردادها'}
                          </span>
                          <FieldInfoTooltip
                            title={isEn ? 'All Contracts Scope' : 'دامنه کلیه قراردادها'}
                            whatIsIt={
                              isEn
                                ? 'Grants unrestricted visibility to all existing and future registered contracts.'
                                : 'دسترسی به تمام قراردادهای فعلی و قراردادهایی که در آینده در سامانه ثبت خواهند شد.'
                            }
                            whyNeeded={
                              isEn
                                ? 'Suitable for executives, legal teams, or procurement officers who need comprehensive organizational oversight.'
                                : 'مناسب برای مدیران عامل، مدیران مالی و حقوقی که باید بر کل قراردادهای شرکت اشراف داشته باشند.'
                            }
                            practicalExample={
                              isEn
                                ? 'Recommended for Department Heads and Chief IT Officers'
                                : 'پیشنهادی برای مدیران ارشد، مالی و حراست IT'
                            }
                            isEn={isEn}
                            isLightMode={isLightMode}
                          />
                        </div>
                        <p
                          className={`text-[10px] mt-0.5 ${
                            isLightMode ? 'text-slate-500' : 'text-slate-400'
                          }`}
                        >
                          {isEn
                            ? 'User can view and interact with every contract in the organization repository.'
                            : 'کاربر اجازه مشاهده و کار با کلیه قراردادهای ثبت‌شده در سازمان را خواهد داشت.'}
                        </p>
                      </div>
                    </label>

                    {/* Specific Contracts Radio */}
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition select-none ${
                        draftPolicy?.targetContractScope === 'specific'
                          ? isLightMode
                            ? 'bg-emerald-50/80 border-emerald-300 shadow-xs'
                            : 'bg-emerald-500/10 border-emerald-500/40 text-white'
                          : isLightMode
                          ? 'bg-slate-50 border-slate-200 hover:border-slate-300'
                          : 'bg-white/5 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <input
                        type="radio"
                        name="targetContractScope"
                        checked={draftPolicy?.targetContractScope === 'specific'}
                        onChange={() =>
                          setDraftPolicy((prev) => (prev ? { ...prev, targetContractScope: 'specific' } : prev))
                        }
                        className="mt-0.5 text-emerald-500 focus:ring-emerald-400"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-semibold ${
                              isLightMode ? 'text-slate-900' : 'text-white'
                            }`}
                          >
                            {isEn ? 'Specific Contracts Only' : 'فقط قراردادهای مشخص‌شده'}
                          </span>
                          <FieldInfoTooltip
                            title={isEn ? 'Specific Contracts Scope' : 'دامنه اختصاصی قراردادها'}
                            whatIsIt={
                              isEn
                                ? 'Limits subject visibility strictly to the selected contracts in the list below.'
                                : 'محدودسازی دسترسی کاربر صرفاً به قراردادهایی که در چک‌لیست زیر تیک خورده باشند.'
                            }
                            whyNeeded={
                              isEn
                                ? 'Enforces least-privilege access so vendors, sub-contractors, or branch managers only see relevant contracts.'
                                : 'رعایت اصل حداقل دسترسی تا پیمانکاران یا مسئولان شعب فقط قراردادهای مربوط به خود را ببینند.'
                            }
                            practicalExample={
                              isEn
                                ? 'Select only ISP Link agreements for WAN network operators'
                                : 'فقط قراردادهای لینک اینترنت و فیبر نوری برای کارشناسان WAN انتخاب شود'
                            }
                            isEn={isEn}
                            isLightMode={isLightMode}
                          />
                        </div>
                        <p
                          className={`text-[10px] mt-0.5 ${
                            isLightMode ? 'text-slate-500' : 'text-slate-400'
                          }`}
                        >
                          {isEn
                            ? 'Restrict visibility to explicitly checked contracts in the selector below.'
                            : 'دسترسی فقط به قراردادهایی که صراحتاً در لیست زیر انتخاب شوند محدود خواهد شد.'}
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Specific Contracts Picker Table */}
                  {draftPolicy?.targetContractScope === 'specific' && (
                    <div
                      className={`p-3 rounded-xl border mb-4 ${
                        isLightMode
                          ? 'bg-slate-50/80 border-slate-200'
                          : 'bg-slate-900/60 border-white/10'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input
                            type="text"
                            value={contractsSearch}
                            onChange={(e) => setContractsSearch(e.target.value)}
                            placeholder={
                              isEn
                                ? 'Filter contracts by title, vendor, code, or SLA...'
                                : 'جستجو بر اساس عنوان، پیمانکار، شماره قرارداد یا SLA...'
                            }
                            className={`w-full text-xs rounded-lg pr-8 pl-3 py-1.5 border transition outline-none ${
                              isLightMode
                                ? 'bg-white border-slate-200 text-slate-800 focus:border-emerald-500'
                                : 'bg-white/5 border-white/10 text-white focus:border-emerald-500'
                            }`}
                          />
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          <button
                            type="button"
                            onClick={handleSelectAllContracts}
                            className="px-2 py-1 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition cursor-pointer"
                          >
                            {isEn ? 'Select All' : 'انتخاب همه'}
                          </button>
                          <button
                            type="button"
                            onClick={handleDeselectAllContracts}
                            className="px-2 py-1 rounded text-[11px] font-medium bg-white/5 text-slate-400 border border-white/10 hover:text-white transition cursor-pointer"
                          >
                            {isEn ? 'Deselect All' : 'لغو همه'}
                          </button>
                          <span className="text-[10px] text-slate-400 px-1 font-mono">
                            {(draftPolicy?.targetContractIds || []).length} / {contractsList.length}
                          </span>
                        </div>
                      </div>

                      {isLoadingContractsLicenses ? (
                        <div className="py-8 text-center text-xs text-slate-400">
                          <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-emerald-400" />
                          {isEn ? 'Loading authentic contracts from server...' : 'در حال بارگذاری قراردادهای معتبر از سرور...'}
                        </div>
                      ) : filteredContracts.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400">
                          <ScrollText className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
                          {contractsSearch
                            ? (isEn ? 'No contracts match your search filter.' : 'هیچ قراردادی با فیلتر جستجوی شما یافت نشد.')
                            : (isEn ? 'No contracts found in repository. You can allow adding new ones below.' : 'هیچ قراردادی در مخزن ثبت نشده است. می‌توانید مجوز افزودن قرارداد را در ادامه فعال نمایید.')}
                        </div>
                      ) : (
                        <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                          {filteredContracts.map((c) => {
                            const isSelected = (draftPolicy?.targetContractIds || []).includes(c.id);
                            return (
                              <div
                                key={c.id}
                                onClick={() => handleToggleContractId(c.id)}
                                className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition select-none ${
                                  isSelected
                                    ? isLightMode
                                      ? 'bg-emerald-50 border-emerald-300 text-slate-900'
                                      : 'bg-emerald-500/15 border-emerald-500/40 text-white'
                                    : isLightMode
                                    ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                                    : 'bg-white/5 border-white/5 text-slate-300 hover:border-white/10'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-400 shrink-0" />
                                  )}
                                  <div className="truncate">
                                    <div className="font-semibold truncate">{c.title}</div>
                                    <div className="text-[10px] text-slate-400 truncate flex items-center gap-2">
                                      <span>{c.contractNumber || c.id}</span>
                                      {c.vendorName && <span>• {c.vendorName}</span>}
                                      {c.contractType && <span>• {c.contractType}</span>}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                  {c.status && (
                                    <span
                                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono uppercase ${
                                        c.status === 'active'
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                          : c.status === 'expired'
                                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                      }`}
                                    >
                                      {c.status}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Granular Operational Permissions for Contracts */}
                  <div className="pt-2 border-t border-slate-200/60 dark:border-white/10">
                    <h5
                      className={`text-[11px] font-bold mb-2.5 flex items-center gap-1.5 ${
                        isLightMode ? 'text-slate-800' : 'text-slate-200'
                      }`}
                    >
                      <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                      {isEn
                        ? 'Granular Operational Permissions for Contracts'
                        : 'اختیارات و مجوزهای عملیاتی روی قراردادها'}
                    </h5>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {/* 1. canViewContracts */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                          draftPolicy?.canViewContracts !== false
                            ? isLightMode
                              ? 'bg-emerald-50/70 border-emerald-300'
                              : 'bg-emerald-500/10 border-emerald-500/30 text-white'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-white/5 border-white/5 opacity-60 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={draftPolicy?.canViewContracts !== false}
                          onChange={(e) =>
                            setDraftPolicy((prev) => (prev ? { ...prev, canViewContracts: e.target.checked } : prev))
                          }
                          className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-semibold ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {isEn ? 'View & Read Contracts' : 'مشاهده و خواندن قراردادها'}
                            </span>
                            <FieldInfoTooltip
                              title={isEn ? 'View Contracts Permission' : 'مجوز مشاهده قراردادها'}
                              whatIsIt={
                                isEn
                                  ? 'Enables read-only access to view contract details, terms, SLA levels, and documents.'
                                  : 'امکان مشاهده و مطالعه جزئیات قراردادها، اطلاعات پیمانکار، شرایط SLA و اسناد ضمیمه.'
                              }
                              whyNeeded={
                                isEn
                                  ? 'Essential baseline permission required to review organizational agreements.'
                                  : 'مجوز پایه برای بررسی و خواندن مفاد قراردادهای سازمان بدون امکان دستکاری.'
                              }
                              practicalExample={
                                isEn
                                  ? 'Enable for Helpdesk, NOC engineers, or Auditors'
                                  : 'برای مهندسان پشتیبانی، ناظران شبکه و حسابرسان فعال باشد'
                              }
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                          <p className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Inspect contract metadata & SLAs' : 'بررسی اطلاعات قرارداد، پیمانکار و تعهدات'}
                          </p>
                        </div>
                      </label>

                      {/* 2. canAddContracts */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                          draftPolicy?.canAddContracts !== false
                            ? isLightMode
                              ? 'bg-emerald-50/70 border-emerald-300'
                              : 'bg-emerald-500/10 border-emerald-500/30 text-white'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-white/5 border-white/5 opacity-60 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={draftPolicy?.canAddContracts !== false}
                          onChange={(e) =>
                            setDraftPolicy((prev) => (prev ? { ...prev, canAddContracts: e.target.checked } : prev))
                          }
                          className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-semibold ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {isEn ? 'Add New Contracts' : 'ایجاد و افزودن قرارداد جدید'}
                            </span>
                            <FieldInfoTooltip
                              title={isEn ? 'Add Contracts Permission' : 'مجوز افزودن قرارداد جدید'}
                              whatIsIt={
                                isEn
                                  ? 'Allows the user to register and add new contracts even if they had no prior scoped contracts.'
                                  : 'به کاربر اجازه می‌دهد قرارداد جدید ثبت و اضافه نماید حتی اگر از قبل قراردادی در محدوده‌اش نبوده باشد.'
                              }
                              whyNeeded={
                                isEn
                                  ? 'Delegates contract registration to procurement officers or department heads.'
                                  : 'واگذاری اختیار ثبت قراردادهای جدید به کارشناسان خرید یا مدیران بخش‌ها.'
                              }
                              practicalExample={
                                isEn
                                  ? 'Enable for Procurement and Contracting Officers'
                                  : 'برای کارشناسان امور قراردادها و تدارکات فعال شود'
                              }
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                          <p className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Register new service agreements' : 'ثبت و تعریف قراردادهای جدید در سامانه'}
                          </p>
                        </div>
                      </label>

                      {/* 3. canEditContracts */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                          draftPolicy?.canEditContracts !== false
                            ? isLightMode
                              ? 'bg-emerald-50/70 border-emerald-300'
                              : 'bg-emerald-500/10 border-emerald-500/30 text-white'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-white/5 border-white/5 opacity-60 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={draftPolicy?.canEditContracts !== false}
                          onChange={(e) =>
                            setDraftPolicy((prev) => (prev ? { ...prev, canEditContracts: e.target.checked } : prev))
                          }
                          className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-semibold ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {isEn ? 'Edit & Renew Contracts' : 'ویرایش و تمدید قراردادها'}
                            </span>
                            <FieldInfoTooltip
                              title={isEn ? 'Edit Contracts Permission' : 'مجوز ویرایش قراردادها'}
                              whatIsIt={
                                isEn
                                  ? 'Allows updating contract details, extending end dates, modifying SLAs, or uploading attachments.'
                                  : 'اختیار اصلاح اطلاعات قرارداد، تغییر تاریخ پایان، تمدید، تغییر SLA و بارگذاری مدارک.'
                              }
                              whyNeeded={
                                isEn
                                  ? 'Prevents unauthorized tampering of binding contractual SLA obligations.'
                                  : 'پیشگیری از دستکاری ناخواسته تعهدات و پارامترهای حقوقی قرارداد.'
                              }
                              practicalExample={
                                isEn
                                  ? 'Enable for Contract Administrators'
                                  : 'برای مدیران قراردادها و ناظران پیمان فعال باشد'
                              }
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                          <p className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Update terms, SLAs, & renewal dates' : 'ویرایش شرایط، تعهدات SLA و تاریخ تمدید'}
                          </p>
                        </div>
                      </label>

                      {/* 4. canDeleteContracts */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                          draftPolicy?.canDeleteContracts !== false
                            ? isLightMode
                              ? 'bg-rose-50/70 border-rose-300'
                              : 'bg-rose-500/10 border-rose-500/30 text-white'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-white/5 border-white/5 opacity-60 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={draftPolicy?.canDeleteContracts !== false}
                          onChange={(e) =>
                            setDraftPolicy((prev) => (prev ? { ...prev, canDeleteContracts: e.target.checked } : prev))
                          }
                          className="mt-0.5 rounded text-rose-500 focus:ring-rose-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-semibold ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {isEn ? 'Delete Contracts' : 'حذف کامل قراردادها'}
                            </span>
                            <FieldInfoTooltip
                              title={isEn ? 'Delete Contracts Authority' : 'اختیار حذف قراردادها'}
                              whatIsIt={
                                isEn
                                  ? 'Allows permanently deleting contract records from the organization repository.'
                                  : 'مجوز حذف قطعی و غیرقابل بازگشت رکورد قرارداد از مخزن سازمان.'
                              }
                              whyNeeded={
                                isEn
                                  ? 'Destructive action that could delete critical legal records. Restrict strictly.'
                                  : 'عملیات خطرناک و حساس که می‌تواند سوابق حقوقی معتبر را از بین ببرد؛ باید شدیداً محدود گردد.'
                              }
                              practicalExample={
                                isEn
                                  ? 'Restrict strictly to Super Administrator'
                                  : 'منحصراً برای سوپرادمین و رده بالای حاکمیتی فعال باشد'
                              }
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                          <p className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Permanently remove contract records' : 'حذف همیشگی پرونده قرارداد از سامانه'}
                          </p>
                        </div>
                      </label>

                      {/* 5. canDeleteContractAttachments */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                          draftPolicy?.canDeleteContractAttachments !== false
                            ? isLightMode
                              ? 'bg-amber-50/70 border-amber-300'
                              : 'bg-amber-500/10 border-amber-500/30 text-white'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-white/5 border-white/5 opacity-60 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={draftPolicy?.canDeleteContractAttachments !== false}
                          onChange={(e) =>
                            setDraftPolicy((prev) => (prev ? { ...prev, canDeleteContractAttachments: e.target.checked } : prev))
                          }
                          className="mt-0.5 rounded text-amber-500 focus:ring-amber-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-semibold ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {isEn ? 'Delete Contract Attachments' : 'حذف پیوست‌های قرارداد'}
                            </span>
                            <FieldInfoTooltip
                              title={isEn ? 'Delete Contract Attachments' : 'مجوز حذف پیوست‌های قرارداد'}
                              whatIsIt={
                                isEn
                                  ? 'Allows deleting attached PDFs, scanned signed pages, or documents inside a contract.'
                                  : 'مجوز حذف فایل‌های PDF، اسکن قرارداد امضاشده و مستندات داخل قرارداد.'
                              }
                              whyNeeded={
                                isEn
                                  ? 'Protects original evidentiary files from being deleted by standard operators.'
                                  : 'حفظ مستندات معتبر و جلوگیری از پاک شدن مدارک رسمی توسط کاربران عادی.'
                              }
                              practicalExample={
                                isEn
                                  ? 'Disable for regular staff to prevent loss of signed PDF copies'
                                  : 'برای کارمندان عادی غیرفعال باشد تا نسخه PDF امضاشده حفظ گردد'
                              }
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                          <p className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Remove attached PDF & signed docs' : 'پاک کردن فایل‌های پیوست و اسناد داخل قرارداد'}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* ==================== 2. LICENSES GOVERNANCE ==================== */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  {/* Section Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-emerald-500" />
                      <h4
                        className={`text-xs font-bold ${
                          isLightMode ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {isEn
                          ? 'Licenses Repository Access & Scoping'
                          : 'محدوده و مجوزهای دسترسی به لایسنس‌ها'}
                      </h4>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      {draftPolicy?.targetLicenseScope === 'all'
                        ? (isEn ? 'Scope: All Licenses' : 'دامنه: تمام لایسنس‌ها')
                        : `${isEn ? 'Selected:' : 'انتخاب‌شده:'} ${(draftPolicy?.targetLicenseIds || []).length}`}
                    </span>
                  </div>

                  <p
                    className={`text-[11px] mb-4 ${
                      isLightMode ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    {isEn
                      ? 'Configure whether the subject can access all software and appliance licenses or only designated specific licenses.'
                      : 'تعیین کنید کاربر به کلیه لایسنس‌های نرم‌افزاری و تجهیزات دسترسی داشته باشد یا فقط لایسنس‌های انتخاب‌شده در لیست زیر.'}
                  </p>

                  {/* Scope Radio Selection */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    {/* All Licenses Radio */}
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition select-none ${
                        (draftPolicy?.targetLicenseScope || 'all') === 'all'
                          ? isLightMode
                            ? 'bg-emerald-50/80 border-emerald-300 shadow-xs'
                            : 'bg-emerald-500/10 border-emerald-500/40 text-white'
                          : isLightMode
                          ? 'bg-slate-50 border-slate-200 hover:border-slate-300'
                          : 'bg-white/5 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <input
                        type="radio"
                        name="targetLicenseScope"
                        checked={(draftPolicy?.targetLicenseScope || 'all') === 'all'}
                        onChange={() =>
                          setDraftPolicy((prev) => (prev ? { ...prev, targetLicenseScope: 'all' } : prev))
                        }
                        className="mt-0.5 text-emerald-500 focus:ring-emerald-400"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-semibold ${
                              isLightMode ? 'text-slate-900' : 'text-white'
                            }`}
                          >
                            {isEn ? 'All Licenses' : 'دسترسی به تمامی لایسنس‌ها'}
                          </span>
                          <FieldInfoTooltip
                            title={isEn ? 'All Licenses Scope' : 'دامنه کلیه لایسنس‌ها'}
                            whatIsIt={
                              isEn
                                ? 'Grants unrestricted visibility to all existing and future registered software and appliance licenses.'
                                : 'دسترسی به تمام لایسنس‌های موجود و لایسنس‌هایی که در آینده ثبت خواهند شد.'
                            }
                            whyNeeded={
                              isEn
                                ? 'Necessary for asset managers, IT directors, and license compliance officers.'
                                : 'الزامی برای مدیران دارایی‌های نرم‌افزاری، مسئولان تمدید و مدیران IT.'
                            }
                            practicalExample={
                              isEn
                                ? 'Recommended for Enterprise Asset Managers and Super Admins'
                                : 'پیشنهادی برای مدیران ارشد دارایی IT و سوپرادمین‌ها'
                            }
                            isEn={isEn}
                            isLightMode={isLightMode}
                          />
                        </div>
                        <p
                          className={`text-[10px] mt-0.5 ${
                            isLightMode ? 'text-slate-500' : 'text-slate-400'
                          }`}
                        >
                          {isEn
                            ? 'User can view and manage every license in the organization repository.'
                            : 'کاربر به کلیه لایسنس‌های نرم‌افزاری و سخت‌افزاری سازمان دسترسی خواهد داشت.'}
                        </p>
                      </div>
                    </label>

                    {/* Specific Licenses Radio */}
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition select-none ${
                        draftPolicy?.targetLicenseScope === 'specific'
                          ? isLightMode
                            ? 'bg-emerald-50/80 border-emerald-300 shadow-xs'
                            : 'bg-emerald-500/10 border-emerald-500/40 text-white'
                          : isLightMode
                          ? 'bg-slate-50 border-slate-200 hover:border-slate-300'
                          : 'bg-white/5 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <input
                        type="radio"
                        name="targetLicenseScope"
                        checked={draftPolicy?.targetLicenseScope === 'specific'}
                        onChange={() =>
                          setDraftPolicy((prev) => (prev ? { ...prev, targetLicenseScope: 'specific' } : prev))
                        }
                        className="mt-0.5 text-emerald-500 focus:ring-emerald-400"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-semibold ${
                              isLightMode ? 'text-slate-900' : 'text-white'
                            }`}
                          >
                            {isEn ? 'Specific Licenses Only' : 'فقط لایسنس‌های مشخص‌شده'}
                          </span>
                          <FieldInfoTooltip
                            title={isEn ? 'Specific Licenses Scope' : 'دامنه اختصاصی لایسنس‌ها'}
                            whatIsIt={
                              isEn
                                ? 'Limits subject access strictly to the checked licenses in the list below.'
                                : 'محدود کردن دسترسی کاربر منحصراً به لایسنس‌هایی که در لیست زیر انتخاب شده‌اند.'
                            }
                            whyNeeded={
                              isEn
                                ? 'Prevents unauthorized exposure of sensitive product keys or activation files to unrelated teams.'
                                : 'جلوگیری از افشای کلیدهای فعال‌سازی نرم‌افزارهای حساس به تیم‌ها یا کارمندان غیرمرتبط.'
                            }
                            practicalExample={
                              isEn
                                ? 'Assign only VMware and Windows Server keys to Virtualization Admins'
                                : 'فقط لایسنس‌های مجازی‌سازی و ویندوز سرور برای ادمین‌های دیتاسنتر انتخاب شود'
                            }
                            isEn={isEn}
                            isLightMode={isLightMode}
                          />
                        </div>
                        <p
                          className={`text-[10px] mt-0.5 ${
                            isLightMode ? 'text-slate-500' : 'text-slate-400'
                          }`}
                        >
                          {isEn
                            ? 'Restrict visibility to explicitly checked licenses in the selector below.'
                            : 'دسترسی فقط به لایسنس‌هایی که صراحتاً در لیست زیر انتخاب شوند محدود خواهد شد.'}
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Specific Licenses Picker Table */}
                  {draftPolicy?.targetLicenseScope === 'specific' && (
                    <div
                      className={`p-3 rounded-xl border mb-4 ${
                        isLightMode
                          ? 'bg-slate-50/80 border-slate-200'
                          : 'bg-slate-900/60 border-white/10'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input
                            type="text"
                            value={licensesSearch}
                            onChange={(e) => setLicensesSearch(e.target.value)}
                            placeholder={
                              isEn
                                ? 'Filter licenses by name, software, key, or category...'
                                : 'جستجو بر اساس نام، نرم‌افزار، کلید لایسنس یا دسته‌بندی...'
                            }
                            className={`w-full text-xs rounded-lg pr-8 pl-3 py-1.5 border transition outline-none ${
                              isLightMode
                                ? 'bg-white border-slate-200 text-slate-800 focus:border-emerald-500'
                                : 'bg-white/5 border-white/10 text-white focus:border-emerald-500'
                            }`}
                          />
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          <button
                            type="button"
                            onClick={handleSelectAllLicenses}
                            className="px-2 py-1 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition cursor-pointer"
                          >
                            {isEn ? 'Select All' : 'انتخاب همه'}
                          </button>
                          <button
                            type="button"
                            onClick={handleDeselectAllLicenses}
                            className="px-2 py-1 rounded text-[11px] font-medium bg-white/5 text-slate-400 border border-white/10 hover:text-white transition cursor-pointer"
                          >
                            {isEn ? 'Deselect All' : 'لغو همه'}
                          </button>
                          <span className="text-[10px] text-slate-400 px-1 font-mono">
                            {(draftPolicy?.targetLicenseIds || []).length} / {licensesList.length}
                          </span>
                        </div>
                      </div>

                      {isLoadingContractsLicenses ? (
                        <div className="py-8 text-center text-xs text-slate-400">
                          <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-emerald-400" />
                          {isEn ? 'Loading authentic licenses from server...' : 'در حال بارگذاری لایسنس‌های معتبر از سرور...'}
                        </div>
                      ) : filteredLicenses.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400">
                          <FileCheck className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
                          {licensesSearch
                            ? (isEn ? 'No licenses match your search filter.' : 'هیچ لایسنسی با فیلتر جستجوی شما یافت نشد.')
                            : (isEn ? 'No licenses found in repository. You can allow adding new ones below.' : 'هیچ لایسنسی در مخزن ثبت نشده است. می‌توانید مجوز افزودن لایسنس را در ادامه فعال نمایید.')}
                        </div>
                      ) : (
                        <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                          {filteredLicenses.map((l) => {
                            const isSelected = (draftPolicy?.targetLicenseIds || []).includes(l.id);
                            return (
                              <div
                                key={l.id}
                                onClick={() => handleToggleLicenseId(l.id)}
                                className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition select-none ${
                                  isSelected
                                    ? isLightMode
                                      ? 'bg-emerald-50 border-emerald-300 text-slate-900'
                                      : 'bg-emerald-500/15 border-emerald-500/40 text-white'
                                    : isLightMode
                                    ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                                    : 'bg-white/5 border-white/5 text-slate-300 hover:border-white/10'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-400 shrink-0" />
                                  )}
                                  <div className="truncate">
                                    <div className="font-semibold truncate">{l.title}</div>
                                    <div className="text-[10px] text-slate-400 truncate flex items-center gap-2">
                                      {l.vendor && <span>{l.vendor}</span>}
                                      {l.deviceType && <span>• {l.deviceType}</span>}
                                      {l.licenseKey && (
                                        <span className="font-mono">
                                          • {l.licenseKey.slice(0, 8)}...
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                  {l.status && (
                                    <span
                                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono uppercase ${
                                        l.status === 'active'
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                          : l.status === 'expired'
                                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                      }`}
                                    >
                                      {l.status}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Granular Operational Permissions for Licenses */}
                  <div className="pt-2 border-t border-slate-200/60 dark:border-white/10">
                    <h5
                      className={`text-[11px] font-bold mb-2.5 flex items-center gap-1.5 ${
                        isLightMode ? 'text-slate-800' : 'text-slate-200'
                      }`}
                    >
                      <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                      {isEn
                        ? 'Granular Operational Permissions for Licenses'
                        : 'اختیارات و مجوزهای عملیاتی روی لایسنس‌ها'}
                    </h5>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {/* 1. canViewLicenses */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                          draftPolicy?.canViewLicenses !== false
                            ? isLightMode
                              ? 'bg-emerald-50/70 border-emerald-300'
                              : 'bg-emerald-500/10 border-emerald-500/30 text-white'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-white/5 border-white/5 opacity-60 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={draftPolicy?.canViewLicenses !== false}
                          onChange={(e) =>
                            setDraftPolicy((prev) => (prev ? { ...prev, canViewLicenses: e.target.checked } : prev))
                          }
                          className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-semibold ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {isEn ? 'View & Read Licenses' : 'مشاهده و خواندن لایسنس‌ها'}
                            </span>
                            <FieldInfoTooltip
                              title={isEn ? 'View Licenses Permission' : 'مجوز مشاهده لایسنس‌ها'}
                              whatIsIt={
                                isEn
                                  ? 'Enables read-only access to inspect license keys, validity periods, seat counts, and assigned devices.'
                                  : 'امکان مشاهده و مطالعه کلیدهای فعال‌سازی، مدت اعتبار، تعداد کاربر مجاز و دستگاه‌های متصل.'
                              }
                              whyNeeded={
                                isEn
                                  ? 'Basic requirement for technical support staff to verify license entitlements.'
                                  : 'مجوز پایه برای پرسنل فنی و پشتیبانی جهت بررسی فعال بودن نرم‌افزارها بدون حق تغییر.'
                              }
                              practicalExample={
                                isEn
                                  ? 'Enable for NOC operators, System Admins, and Asset Auditors'
                                  : 'برای اپراتورهای NOC، ادمین‌های سیستم و حسابرسان دارایی فعال باشد'
                              }
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                          <p className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Inspect license keys & allocations' : 'مشاهده کلیدهای فعال‌سازی و تخصیص لایسنس'}
                          </p>
                        </div>
                      </label>

                      {/* 2. canAddLicenses */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                          draftPolicy?.canAddLicenses !== false
                            ? isLightMode
                              ? 'bg-emerald-50/70 border-emerald-300'
                              : 'bg-emerald-500/10 border-emerald-500/30 text-white'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-white/5 border-white/5 opacity-60 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={draftPolicy?.canAddLicenses !== false}
                          onChange={(e) =>
                            setDraftPolicy((prev) => (prev ? { ...prev, canAddLicenses: e.target.checked } : prev))
                          }
                          className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-semibold ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {isEn ? 'Add New Licenses' : 'ایجاد و ثبت لایسنس جدید'}
                            </span>
                            <FieldInfoTooltip
                              title={isEn ? 'Add Licenses Permission' : 'مجوز ثبت لایسنس جدید'}
                              whatIsIt={
                                isEn
                                  ? 'Allows the user to register and add new software or appliance licenses even if not previously scoped.'
                                  : 'به کاربر اجازه می‌دهد لایسنس‌های جدید ثبت و ذخیره کند حتی اگر قبلاً لایسنسی در محدوده‌اش نبوده باشد.'
                              }
                              whyNeeded={
                                isEn
                                  ? 'Empowers software asset officers to record newly purchased licenses directly.'
                                  : 'توانمندسازی مسئولان خرید و نرم‌افزار برای ورود مستقیم لایسنس‌های جدید خریداری‌شده.'
                              }
                              practicalExample={
                                isEn
                                  ? 'Enable for Software Procurement Officers and Lead Sysadmins'
                                  : 'برای مسئولان تدارکات نرم‌افزار و ادمین‌های ارشد شبکه فعال شود'
                              }
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                          <p className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Register new software credentials' : 'ثبت و ورود لایسنس‌های جدید به سیستم'}
                          </p>
                        </div>
                      </label>

                      {/* 3. canEditLicenses */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                          draftPolicy?.canEditLicenses !== false
                            ? isLightMode
                              ? 'bg-emerald-50/70 border-emerald-300'
                              : 'bg-emerald-500/10 border-emerald-500/30 text-white'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-white/5 border-white/5 opacity-60 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={draftPolicy?.canEditLicenses !== false}
                          onChange={(e) =>
                            setDraftPolicy((prev) => (prev ? { ...prev, canEditLicenses: e.target.checked } : prev))
                          }
                          className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-semibold ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {isEn ? 'Edit Licenses' : 'ویرایش اطلاعات لایسنس‌ها'}
                            </span>
                            <FieldInfoTooltip
                              title={isEn ? 'Edit Licenses Permission' : 'مجوز ویرایش لایسنس‌ها'}
                              whatIsIt={
                                isEn
                                  ? 'Allows modifying license keys, expiration dates, seat assignments, and category details.'
                                  : 'اختیار ویرایش کلیدهای فعال‌سازی، تاریخ‌های انقضا، تعداد کرسی‌ها و اطلاعات تجهیزات مرتبط.'
                              }
                              whyNeeded={
                                isEn
                                  ? 'Restricts modification of critical software activation keys to authorized staff only.'
                                  : 'محدودسازی تغییر کلیدهای لایسنس برای جلوگیری از قطع سرویس نرم‌افزارها در سازمان.'
                              }
                              practicalExample={
                                isEn
                                  ? 'Enable for Software License Administrators'
                                  : 'برای مدیران لایسنس و مسئولان دارایی‌های دیجیتال فعال شود'
                              }
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                          <p className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Update keys, seat counts, & validity' : 'به‌روزرسانی کلیدها، تعداد کاربر و تاریخ اعتبار'}
                          </p>
                        </div>
                      </label>

                      {/* 4. canDeleteLicenses */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                          draftPolicy?.canDeleteLicenses !== false
                            ? isLightMode
                              ? 'bg-rose-50/70 border-rose-300'
                              : 'bg-rose-500/10 border-rose-500/30 text-white'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-white/5 border-white/5 opacity-60 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={draftPolicy?.canDeleteLicenses !== false}
                          onChange={(e) =>
                            setDraftPolicy((prev) => (prev ? { ...prev, canDeleteLicenses: e.target.checked } : prev))
                          }
                          className="mt-0.5 rounded text-rose-500 focus:ring-rose-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-semibold ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {isEn ? 'Delete Licenses' : 'حذف کامل لایسنس‌ها'}
                            </span>
                            <FieldInfoTooltip
                              title={isEn ? 'Delete Licenses Authority' : 'اختیار حذف لایسنس‌ها'}
                              whatIsIt={
                                isEn
                                  ? 'Allows permanently deleting license records and product keys from the repository.'
                                  : 'مجوز حذف کامل و دائمی لایسنس‌ها و کلیدهای ثبت‌شده از پایگاه داده سامانه.'
                              }
                              whyNeeded={
                                isEn
                                  ? 'High-risk destructive capability; prevents accidental loss of paid product licenses.'
                                  : 'عملیات حساس و با ریسک بالا؛ جلوگیری از حذف تصادفی یا مخرب لایسنس‌های گران‌قیمت خریداری‌شده.'
                              }
                              practicalExample={
                                isEn
                                  ? 'Strictly restricted to Super Administrator'
                                  : 'منحصراً برای سوپرادمین و بالاترین سطح دسترسی فعال گردد'
                              }
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                          <p className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Permanently remove license records' : 'حذف همیشگی لایسنس و کلیدها از سامانه'}
                          </p>
                        </div>
                      </label>

                      {/* 5. canDeleteLicenseAttachments */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                          draftPolicy?.canDeleteLicenseAttachments !== false
                            ? isLightMode
                              ? 'bg-amber-50/70 border-amber-300'
                              : 'bg-amber-500/10 border-amber-500/30 text-white'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-white/5 border-white/5 opacity-60 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={draftPolicy?.canDeleteLicenseAttachments !== false}
                          onChange={(e) =>
                            setDraftPolicy((prev) => (prev ? { ...prev, canDeleteLicenseAttachments: e.target.checked } : prev))
                          }
                          className="mt-0.5 rounded text-amber-500 focus:ring-amber-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-semibold ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {isEn ? 'Delete License Attachments' : 'حذف پیوست‌های لایسنس'}
                            </span>
                            <FieldInfoTooltip
                              title={isEn ? 'Delete License Attachments' : 'مجوز حذف پیوست‌های لایسنس'}
                              whatIsIt={
                                isEn
                                  ? 'Allows deleting attached certificate keys (.lic, .crt, .key), invoice receipts, or documentation inside a license.'
                                  : 'مجوز حذف فایل‌های ضمیمه، گواهی‌ها (.lic, .key)، رسیدهای خرید و فاکتورهای داخل لایسنس.'
                              }
                              whyNeeded={
                                isEn
                                  ? 'Protects original binary license files and procurement receipts from being deleted.'
                                  : 'حفظ فایل‌های باینری لایسنس و مدارک خرید اصلی از پاک شدن توسط کاربران عادی.'
                              }
                              practicalExample={
                                isEn
                                  ? 'Disable for general technical staff'
                                  : 'برای کارشناسان فنی عمومی غیرفعال بماند'
                              }
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                          <p className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Remove attached key files & proofs' : 'پاک کردن فایل‌های کلید و فاکتورهای داخل لایسنس'}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* ==================== 3. SSL / TLS CERTIFICATES GOVERNANCE ==================== */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  {/* Section Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-cyan-500" />
                      <h4
                        className={`text-xs font-bold ${
                          isLightMode ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {isEn
                          ? 'SSL / TLS Certificates Access & Item-Level Scoping'
                          : 'محدوده و مجوزهای دسترسی به گواهینامه‌های SSL / TLS'}
                      </h4>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-semibold">
                      {(draftPolicy?.targetSslScope || 'all') === 'all'
                        ? (isEn ? 'Scope: All SSL Certificates' : 'دامنه: تمام گواهینامه‌های SSL')
                        : `${isEn ? 'Selected:' : 'انتخاب‌شده:'} ${(draftPolicy?.targetSslIds || []).length}`}
                    </span>
                  </div>

                  <p className={`text-[11px] mb-4 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn
                      ? 'Control whether the subject can inspect all monitored SSL domains & certificates or only specific designated items, and define exact create/edit/live-check/delete rights.'
                      : 'تعیین کنید کاربر به کلیه دامنه‌ها و گواهینامه‌های SSL دسترسی داشته باشد یا تنها به آیتم‌های انتخاب‌شده در لیست زیر، و مجوزهای افزودن، ویرایش، بررسی زنده و حذف را مشخص کنید.'}
                  </p>

                  {/* Scope Selection Radio Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() =>
                        setDraftPolicy((prev) => (prev ? { ...prev, targetSslScope: 'all' } : prev))
                      }
                      className={`p-3 rounded-xl border text-left rtl:text-right transition cursor-pointer flex items-start gap-2.5 ${
                        (draftPolicy?.targetSslScope || 'all') === 'all'
                          ? isLightMode
                            ? 'bg-cyan-50 border-cyan-400 ring-1 ring-cyan-400/30'
                            : 'bg-cyan-500/10 border-cyan-500/40 ring-1 ring-cyan-500/20'
                          : isLightMode
                          ? 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div
                        className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          (draftPolicy?.targetSslScope || 'all') === 'all'
                            ? 'border-cyan-500 bg-cyan-500/20'
                            : 'border-slate-500'
                        }`}
                      >
                        {(draftPolicy?.targetSslScope || 'all') === 'all' && (
                          <div className="w-2 h-2 rounded-full bg-cyan-400" />
                        )}
                      </div>
                      <div>
                        <div className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                          {isEn ? 'All SSL / TLS Certificates' : 'دسترسی به تمام گواهینامه‌های SSL'}
                        </div>
                        <div className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {isEn
                            ? 'Covers all current and future monitored domains and uploaded PEM certificates.'
                            : 'پوشش تمامی دامنه‌های پایش‌شده و گواهینامه‌های PEM فعلی و آینده.'}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setDraftPolicy((prev) => (prev ? { ...prev, targetSslScope: 'specific' } : prev))
                      }
                      className={`p-3 rounded-xl border text-left rtl:text-right transition cursor-pointer flex items-start gap-2.5 ${
                        draftPolicy?.targetSslScope === 'specific'
                          ? isLightMode
                            ? 'bg-cyan-50 border-cyan-400 ring-1 ring-cyan-400/30'
                            : 'bg-cyan-500/10 border-cyan-500/40 ring-1 ring-cyan-500/20'
                          : isLightMode
                          ? 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div
                        className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          draftPolicy?.targetSslScope === 'specific'
                            ? 'border-cyan-500 bg-cyan-500/20'
                            : 'border-slate-500'
                        }`}
                      >
                        {draftPolicy?.targetSslScope === 'specific' && (
                          <div className="w-2 h-2 rounded-full bg-cyan-400" />
                        )}
                      </div>
                      <div>
                        <div className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                          {isEn ? 'Specific SSL Certificates Only' : 'فقط گواهینامه‌ها و دامنه‌های انتخاب‌شده'}
                        </div>
                        <div className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {isEn
                            ? 'Restrict visibility and operations strictly to selected SSL items below.'
                            : 'محدودسازی نمایش و عملیات منحصراً به موارد انتخاب‌شده در لیست زیر.'}
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Specific SSL Item Picker */}
                  {draftPolicy?.targetSslScope === 'specific' && (
                    <div
                      className={`p-3 rounded-xl border mb-4 ${
                        isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-black/30 border-white/10'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 mb-2.5">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 ltr:left-2.5 rtl:right-2.5" />
                          <input
                            type="text"
                            value={sslCertsSearch}
                            onChange={(e) => setSslCertsSearch(e.target.value)}
                            placeholder={
                              isEn
                                ? 'Search SSL certificates by title, domain, or issuer...'
                                : 'جستجو بر اساس نام، دامنه یا صادرکننده SSL...'
                            }
                            className={`w-full text-xs py-1.5 ltr:pl-8 rtl:pr-8 px-3 rounded-lg border outline-none ${
                              isLightMode
                                ? 'bg-white border-slate-300 text-slate-800'
                                : 'bg-slate-900 border-white/10 text-slate-200'
                            }`}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] font-mono text-cyan-400 px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/20">
                            {(draftPolicy?.targetSslIds || []).length} / {sslCertsList.length}
                          </span>
                          <button
                            type="button"
                            onClick={handleSelectAllSslCerts}
                            className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 border border-cyan-500/30 cursor-pointer"
                          >
                            {isEn ? 'Select All' : 'انتخاب همه'}
                          </button>
                          <button
                            type="button"
                            onClick={handleDeselectAllSslCerts}
                            className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-500/15 text-slate-400 hover:bg-slate-500/25 border border-slate-500/30 cursor-pointer"
                          >
                            {isEn ? 'Clear' : 'پاک کردن'}
                          </button>
                        </div>
                      </div>

                      {isLoadingContractsLicenses ? (
                        <div className="text-center py-4 text-xs text-slate-400">
                          {isEn ? 'Loading monitored SSL certificates...' : 'در حال دریافت لیست گواهینامه‌های SSL...'}
                        </div>
                      ) : sslCertsList.length === 0 ? (
                        <div className="text-center py-4 text-xs text-slate-400">
                          {isEn
                            ? 'No SSL certificates registered yet. Add domains or certificates in the SSL / TLS Certificates page first.'
                            : 'هنوز گواهینامه SSL ثبت نشده است. ابتدا دامنه‌ها یا گواهینامه‌ها را در صفحه گواهینامه‌های SSL ثبت کنید.'}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                          {sslCertsList
                            .filter((c) => {
                              const q = sslCertsSearch.trim().toLowerCase();
                              if (!q) return true;
                              return `${c.title} ${c.domain || ''} ${c.subjectCN || ''} ${c.issuerCN || ''}`
                                .toLowerCase()
                                .includes(q);
                            })
                            .map((cert) => {
                              const isSelected = (draftPolicy?.targetSslIds || []).includes(cert.id);
                              return (
                                <button
                                  key={cert.id}
                                  type="button"
                                  onClick={() => handleToggleSslCertId(cert.id)}
                                  className={`flex items-center gap-2 p-2 rounded-lg border text-left rtl:text-right transition cursor-pointer ${
                                    isSelected
                                      ? isLightMode
                                        ? 'bg-cyan-50 border-cyan-400 text-slate-900'
                                        : 'bg-cyan-500/15 border-cyan-500/40 text-white'
                                      : isLightMode
                                      ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                                  }`}
                                >
                                  {isSelected ? (
                                    <CheckSquare className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                                  ) : (
                                    <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-semibold truncate">{cert.title}</div>
                                    <div className="text-[10px] font-mono text-slate-400 truncate">
                                      {cert.domain ? `${cert.domain}:${cert.port || 443}` : cert.subjectCN || 'PEM'}
                                      {cert.daysRemaining !== null && cert.daysRemaining !== undefined
                                        ? ` • ${cert.daysRemaining}d`
                                        : ''}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Granular Operational Permissions for SSL Certificates */}
                  <div className="pt-3 border-t border-white/10">
                    <h5
                      className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${
                        isLightMode ? 'text-slate-700' : 'text-slate-300'
                      }`}
                    >
                      {isEn
                        ? 'Granular Operational Permissions for SSL / TLS Certificates'
                        : 'اختیارات و مجوزهای عملیاتی روی گواهینامه‌های SSL / TLS'}
                    </h5>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {/* 1. canViewSslCertificates */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                          draftPolicy?.canViewSslCertificates !== false
                            ? isLightMode
                              ? 'bg-cyan-50/70 border-cyan-300'
                              : 'bg-cyan-500/10 border-cyan-500/30 text-white'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-white/5 border-white/5 opacity-60 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={draftPolicy?.canViewSslCertificates !== false}
                          onChange={(e) =>
                            setDraftPolicy((prev) =>
                              prev ? { ...prev, canViewSslCertificates: e.target.checked } : prev
                            )
                          }
                          className="mt-0.5 rounded text-cyan-500 focus:ring-cyan-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-semibold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                              {isEn ? 'View SSL Certificates' : 'مشاهده گواهینامه‌های SSL'}
                            </span>
                            <FieldInfoTooltip
                              title={isEn ? 'View SSL Certificates' : 'مجوز مشاهده گواهینامه‌های SSL'}
                              whatIsIt={
                                isEn
                                  ? 'Enables read-only access to inspect monitored domains, remaining validity days, issuers, SANs, and certificate chain details.'
                                  : 'مجوز خواندن و مشاهده وضعیت اعتبار دامنه‌ها، روزهای باقی‌مانده، صادرکننده، SANها و زنجیره گواهینامه.'
                              }
                              whyNeeded={
                                isEn
                                  ? 'Allows operators and auditors to track upcoming SSL expirations without granting modification or deletion powers.'
                                  : 'امکان رصد نزدیک‌شدن انقضای SSL توسط اپراتورها و ممیزان بدون دادن حق تغییر یا حذف.'
                              }
                              practicalExample={
                                isEn
                                  ? 'Enable for NOC Monitors, Security Analysts, and IT Managers'
                                  : 'برای اپراتورهای NOC، تحلیلگران امنیت و مدیران IT فعال باشد'
                              }
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                          <p className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Inspect expiry countdowns & X.509 details' : 'مشاهده شمارش معکوس انقضا و مشخصات X.509'}
                          </p>
                        </div>
                      </label>

                      {/* 2. canAddSslCertificates */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                          draftPolicy?.canAddSslCertificates !== false
                            ? isLightMode
                              ? 'bg-cyan-50/70 border-cyan-300'
                              : 'bg-cyan-500/10 border-cyan-500/30 text-white'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-white/5 border-white/5 opacity-60 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={draftPolicy?.canAddSslCertificates !== false}
                          onChange={(e) =>
                            setDraftPolicy((prev) =>
                              prev ? { ...prev, canAddSslCertificates: e.target.checked } : prev
                            )
                          }
                          className="mt-0.5 rounded text-cyan-500 focus:ring-cyan-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-semibold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                              {isEn ? 'Add Domains & SSL Certs' : 'افزودن دامنه و گواهینامه SSL'}
                            </span>
                            <FieldInfoTooltip
                              title={isEn ? 'Add SSL Certificates Permission' : 'مجوز افزودن گواهینامه و دامنه SSL'}
                              whatIsIt={
                                isEn
                                  ? 'Allows registering new live HTTPS/TLS domains or uploading/pasting public X.509 PEM certificates for monitoring.'
                                  : 'امکان معرفی دامنه‌های جدید (بررسی زنده TLS) یا ثبت/آپلود گواهینامه عمومی PEM جهت پایش انقضا.'
                              }
                              whyNeeded={
                                isEn
                                  ? 'Ensures only authorized engineers can add new external or internal monitoring targets to the daily scheduler.'
                                  : 'تضمین می‌کند تنها مهندسین مجاز بتوانند اهداف جدید به زمان‌بند روزانه پایش SSL اضافه کنند.'
                              }
                              practicalExample={
                                isEn
                                  ? 'Enable for DevOps, Web Admins, and Infrastructure Engineers'
                                  : 'برای تیم دواپس، ادمین‌های وب و مهندسین زیرساخت فعال شود'
                              }
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                          <p className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Register new domains or PEM certs' : 'معرفی دامنه‌ها و گواهینامه‌های جدید'}
                          </p>
                        </div>
                      </label>

                      {/* 3. canEditSslCertificates */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                          draftPolicy?.canEditSslCertificates !== false
                            ? isLightMode
                              ? 'bg-cyan-50/70 border-cyan-300'
                              : 'bg-cyan-500/10 border-cyan-500/30 text-white'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-white/5 border-white/5 opacity-60 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={draftPolicy?.canEditSslCertificates !== false}
                          onChange={(e) =>
                            setDraftPolicy((prev) =>
                              prev ? { ...prev, canEditSslCertificates: e.target.checked } : prev
                            )
                          }
                          className="mt-0.5 rounded text-cyan-500 focus:ring-cyan-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-semibold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                              {isEn ? 'Edit SSL Settings & Alerts' : 'ویرایش تنظیمات و هشدار SSL'}
                            </span>
                            <FieldInfoTooltip
                              title={isEn ? 'Edit SSL Certificates Permission' : 'مجوز ویرایش گواهینامه‌های SSL'}
                              whatIsIt={
                                isEn
                                  ? 'Allows modifying domain ports, SNI hostnames, PEM updates, daily auto-check interval, alert thresholds, recipients, and active status.'
                                  : 'امکان ویرایش پورت، SNI، به‌روزرسانی PEM، بازه بررسی روزانه، روزهای هشدار، گیرندگان ایمیل و فعال/غیرفعال‌سازی.'
                              }
                              whyNeeded={
                                isEn
                                  ? 'Prevents unauthorized tampering with alert recipients or disabling daily checks on critical production domains.'
                                  : 'جلوگیری از غیرفعال کردن پایش روزانه یا تغییر آدرس ایمیل هشدار روی دامنه‌های حیاتی پروداکشن.'
                              }
                              practicalExample={
                                isEn
                                  ? 'Enable for Lead Engineers and Security Operations'
                                  : 'برای مهندسین ارشد و تیم عملیات امنیت فعال شود'
                              }
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                          <p className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Update schedule, PEM & notification emails' : 'ویرایش زمان‌بندی، PEM و ایمیل‌های هشدار'}
                          </p>
                        </div>
                      </label>

                      {/* 4. canCheckSslCertificates */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                          draftPolicy?.canCheckSslCertificates !== false
                            ? isLightMode
                              ? 'bg-emerald-50/70 border-emerald-300'
                              : 'bg-emerald-500/10 border-emerald-500/30 text-white'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-white/5 border-white/5 opacity-60 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={draftPolicy?.canCheckSslCertificates !== false}
                          onChange={(e) =>
                            setDraftPolicy((prev) =>
                              prev ? { ...prev, canCheckSslCertificates: e.target.checked } : prev
                            )
                          }
                          className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-semibold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                              {isEn ? 'Run Live & Bulk SSL Checks' : 'اجرای بررسی زنده و گروهی SSL'}
                            </span>
                            <FieldInfoTooltip
                              title={isEn ? 'Run Live SSL Checks Permission' : 'مجوز اجرای بررسی زنده و گروهی SSL'}
                              whatIsIt={
                                isEn
                                  ? 'Permits triggering on-demand live TLS handshakes for individual items, executing "Check All Now", and sending test expiry alerts.'
                                  : 'اجازه اجرای بررسی لحظه‌ای یک دامنه، کلیک روی دکمه «بررسی همه با هم» و ارسال ایمیل تست هشدار.'
                              }
                              whyNeeded={
                                isEn
                                  ? 'Allows operators to immediately verify newly renewed SSL certificates without waiting for the daily automatic schedule.'
                                  : 'امکان تایید فوری پس از تمدید گواهینامه SSL توسط اپراتور بدون انتظار برای اجرای خودکار روزانه.'
                              }
                              practicalExample={
                                isEn
                                  ? 'Enable for NOC Operators and DevOps Engineers'
                                  : 'برای اپراتورهای NOC و مهندسین دواپس فعال باشد'
                              }
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                          <p className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Trigger single/bulk TLS checks & test alerts' : 'بررسی تکی/گروهی TLS و تست ایمیل هشدار'}
                          </p>
                        </div>
                      </label>

                      {/* 5. canDeleteSslCertificates */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                          draftPolicy?.canDeleteSslCertificates !== false
                            ? isLightMode
                              ? 'bg-rose-50/70 border-rose-300'
                              : 'bg-rose-500/10 border-rose-500/30 text-white'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-white/5 border-white/5 opacity-60 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={draftPolicy?.canDeleteSslCertificates !== false}
                          onChange={(e) =>
                            setDraftPolicy((prev) =>
                              prev ? { ...prev, canDeleteSslCertificates: e.target.checked } : prev
                            )
                          }
                          className="mt-0.5 rounded text-rose-500 focus:ring-rose-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-semibold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                              {isEn ? 'Delete SSL Certificates' : 'حذف گواهینامه‌های SSL'}
                            </span>
                            <FieldInfoTooltip
                              title={isEn ? 'Delete SSL Certificates Permission' : 'مجوز حذف گواهینامه‌های SSL'}
                              whatIsIt={
                                isEn
                                  ? 'Permanently removes monitored domains or uploaded SSL certificate records and their check history.'
                                  : 'حذف کامل و دائمی دامنه یا گواهینامه SSL ثبت‌شده به همراه تاریخچه بررسی‌های آن از دیتابیس.'
                              }
                              whyNeeded={
                                isEn
                                  ? 'Prevents accidental removal of production SSL expiration watches that could cause unnoticed outages.'
                                  : 'جلوگیری از حذف تصادفی پایش SSL سرویس‌های حساس که می‌تواند منجر به قطعی ناگهانی شود.'
                              }
                              practicalExample={
                                isEn
                                  ? 'Restrict strictly to Super Administrators and Senior Security Leads'
                                  : 'منحصراً برای سوپرادمین‌ها و مدیران ارشد امنیت فعال بماند'
                              }
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                          <p className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Remove monitored domains & SSL items' : 'پاک کردن دامنه‌ها و آیتم‌های SSL از پایش'}
                          </p>
                        </div>
                      </label>
                    </div>
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
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-amber-400" />
                      <h4
                        className={`text-xs font-bold ${
                          isLightMode ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {isEn
                          ? 'Default Server Fleet Actions & Tri-State Approval Rules'
                          : 'اختیارات پیش‌فرض ناوگان سرورها و قوانین سه‌حالته تایید'}
                      </h4>
                      <FieldInfoTooltip
                        title={
                          isEn
                            ? 'Tri-State Server Action Governance'
                            : 'مدیریت سه‌حالته اکشن‌های سرور'
                        }
                        whatIsIt={
                          isEn
                            ? 'Controls whether each server action executes immediately (Allow), routes through the policy Approval Chain (Require Approval), or is blocked (Deny).'
                            : 'تعیین می‌کند هر عملیات روی سرور مستقیماً اجرا شود (مجاز)، در صف زنجیره تایید قرار گیرد (نیاز به تایید)، یا مسدود شود (مسدود).'
                        }
                        whyNeeded={
                          isEn
                            ? 'Protects critical Linux/Windows actions (e.g., power off, delete, SSH terminal) with multi-stage human approval without blocking day-to-day operations.'
                            : 'امکان اعمال تایید چندمرحله‌ای روی دستورات حساس (مانند خاموش کردن، حذف یا ترمینال SSH) را بدون از کار انداختن کارهای روزمره فراهم می‌کند.'
                        }
                        practicalExample={
                          isEn
                            ? 'Set File Explorer to Allow, Power Control & Delete Server to Require Approval.'
                            : 'فایل اکسپلورر را «مجاز» و کنترل پاور یا حذف سرور را «نیاز به تایید» قرار دهید.'
                        }
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setAllServerDefaultDecision('allow')}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
                      >
                        {isEn ? 'Allow All' : 'مجاز همه'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllServerDefaultDecision('require_approval')}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition cursor-pointer"
                      >
                        {isEn ? 'Approval All' : 'نیاز به تایید همه'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllServerDefaultDecision('deny')}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer"
                      >
                        {isEn ? 'Deny All' : 'مسدود همه'}
                      </button>
                    </div>
                  </div>

                  <p
                    className={`text-[11px] mb-4 ${
                      isLightMode ? 'text-slate-600' : 'text-slate-400'
                    }`}
                  >
                    {isEn
                      ? 'Configure default tri-state decisions (Allow / Require Approval / Deny) applied across all authorized Linux and Windows servers.'
                      : 'پیکربندی وضعیت سه‌حالته پیش‌فرض (مجاز / نیاز به تایید / مسدود) که بر روی کلیه سرورهای مجاز اعمال می‌گردد.'}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {SERVER_ACTIONS_CATALOG.map((action) => {
                      const decision = getDefaultServerDecision(action.key as ServerActionKey);
                      return (
                        <div
                          key={action.key}
                          className={`flex flex-col justify-between gap-2.5 p-3 rounded-xl border transition select-none ${
                            decision === 'allow'
                              ? isLightMode
                                ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-xs'
                                : 'bg-emerald-500/10 border-emerald-500/35 text-emerald-100'
                              : decision === 'require_approval'
                              ? isLightMode
                                ? 'bg-amber-50/80 border-amber-300 text-amber-950 shadow-xs'
                                : 'bg-amber-500/15 border-amber-500/40 text-amber-100'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-200 text-slate-700'
                              : 'bg-slate-900/60 border-white/10 text-slate-400'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`font-bold text-xs ${
                                    isLightMode ? 'text-slate-900' : 'text-white'
                                  }`}
                                >
                                  {isEn ? action.labelEn : action.labelFa}
                                </span>
                                {action.danger && (
                                  <span
                                    className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold border ${
                                      isLightMode
                                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                                        : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                    }`}
                                  >
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
                                      ? action.tooltipWhyEn ||
                                        'Defines operational authority for server actions across the fleet.'
                                      : action.tooltipWhyFa ||
                                        'تعیین سطح اختیارات اجرایی بر روی ناوگان سرورهای متصل.'
                                  }
                                  practicalExample={
                                    isEn
                                      ? action.tooltipExampleEn ||
                                        'Configured according to administrator role and responsibility.'
                                      : action.tooltipExampleFa ||
                                        'تنظیم بر مبنای مسئولیت‌های تخصصی تیم‌های عملیات و پشتیبانی.'
                                  }
                                  isEn={isEn}
                                  isLightMode={isLightMode}
                                />
                              </div>
                              <div
                                className={`text-[10px] mt-1 ${
                                  isLightMode ? 'text-slate-600' : 'text-slate-400'
                                }`}
                              >
                                {isEn ? action.descriptionEn : action.descriptionFa}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-black/5 dark:border-white/5">
                            <span
                              className={`text-[10px] font-mono ${
                                isLightMode ? 'text-slate-500' : 'text-slate-400'
                              }`}
                            >
                              {action.key}
                            </span>
                            {renderTriStateControl(decision, (next) =>
                              setDefaultServerDecision(action.key as ServerActionKey, next)
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ========================================================================= */}
                {/* Permitted Target Servers Fleet Scope & Selection (Phase 2 Cascaded) */}
                {/* ========================================================================= */}
                <div
                  className={`p-4 rounded-xl border space-y-3.5 ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                        title={isEn ? 'Authorized Server Fleet Scope' : 'محدوده سرورهای مجاز ناوگان'}
                        whatIsIt={
                          isEn
                            ? 'Displays and restricts the servers accessible under this policy, dynamically cascaded from the Target Infrastructure Scope configured in Tab 1 (Identity & Scope).'
                            : 'سرورهای قابل دسترسی این پالیسی را نمایش داده و محدود می‌کند که به‌طور هوشمند از محدوده زیرساخت هدف در تب ۱ (شناسه و محدوده) به ارث می‌رسد.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Eliminates redundant scope definitions, prevents accidental authorization leaks, and strictly adheres to least-privilege security boundaries.'
                            : 'از تعریف تکراری اسکوپ‌ها جلوگیری کرده، مانع از نشت دسترسی‌ها شده و مرزهای امنیتی حداقل اختیارات را رعایت می‌نماید.'
                        }
                        practicalExample={
                          isEn
                            ? 'If "Specific Device & Server Groups" was selected in Tab 1, only compute nodes belonging to those groups appear here and in fleet management.'
                            : 'در صورت انتخاب «گروه‌های خاص» در تب ۱، صرفاً سرورهای عضو آن گروه‌ها در اینجا و صفحه ناوگان نمایش داده می‌شوند.'
                        }
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>

                    {/* Quick Link to change scope in Tab 1 */}
                    <button
                      type="button"
                      onClick={() => setActiveTab('identity')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                        isLightMode
                          ? 'bg-cyan-50 text-cyan-700 border border-cyan-300 hover:bg-cyan-100'
                          : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20'
                      }`}
                    >
                      <span>{isEn ? 'Configure Scope in Tab 1' : 'تغییر اسکوپ در تب ۱'}</span>
                      <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                    </button>
                  </div>

                  {/* Cascading Scope Status Banner */}
                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 flex-wrap ${
                      draftPolicy.targetScope === 'all'
                        ? isLightMode
                          ? 'bg-cyan-50/70 border-cyan-200 text-cyan-950'
                          : 'bg-cyan-950/20 border-cyan-500/30 text-cyan-200'
                        : draftPolicy.targetScope === 'groups'
                        ? isLightMode
                          ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                          : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                        : isLightMode
                        ? 'bg-purple-50/70 border-purple-200 text-purple-950'
                        : 'bg-purple-950/20 border-purple-500/30 text-purple-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border uppercase ${
                          draftPolicy.targetScope === 'all'
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : draftPolicy.targetScope === 'groups'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                        }`}
                      >
                        {draftPolicy.targetScope === 'all'
                          ? isEn
                            ? 'All Infrastructure Scope'
                            : 'دامنه کلیه زیرساخت'
                          : draftPolicy.targetScope === 'groups'
                          ? isEn
                            ? 'Group-Scoped Infrastructure'
                            : 'دامنه بر مبنای گروه‌ها'
                          : isEn
                          ? 'Specific Individual Nodes'
                          : 'سرورهای خاص تفکیک‌شده'}
                      </span>
                      <span className="text-xs">
                        {draftPolicy.targetScope === 'all'
                          ? isEn
                            ? `Unrestricted: All ${allAvailableServers.length} servers in the fleet are authorized under this policy.`
                            : `نامحدود: تمامی ${allAvailableServers.length} سرور موجود در ناوگان تحت این پالیسی مجاز هستند.`
                          : draftPolicy.targetScope === 'groups'
                          ? isEn
                            ? `Cascaded: Filtered to ${permittedServers.length} of ${allAvailableServers.length} servers belonging to ${draftPolicy.targetGroupIds?.length || 0} selected group(s).`
                            : `آبشاری: فیلتر شده به ${permittedServers.length} از ${allAvailableServers.length} سرور عضو ${draftPolicy.targetGroupIds?.length || 0} گروه انتخابی در تب ۱.`
                          : isEn
                          ? `Specific Selection: ${(draftPolicy.targetServerIds || []).length} of ${allAvailableServers.length} servers explicitly permitted.`
                          : `انتخاب خاص: ${(draftPolicy.targetServerIds || []).length} از ${allAvailableServers.length} سرور به صورت تفکیکی انتخاب شده‌اند.`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="px-2 py-0.5 rounded-full bg-black/20 border border-white/10">
                        {permittedServers.length} / {allAvailableServers.length} {isEn ? 'Permitted' : 'مجاز'}
                      </span>
                    </div>
                  </div>

                  {/* Search and Server List */}
                  <div className="space-y-3 pt-1">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-300">
                          {isEn ? 'Permitted Servers in Active Scope:' : 'سرورهای مجاز در این اسکوپ:'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/5 border border-white/10 text-slate-300">
                          {filteredServersForScope.length} {isEn ? 'Showing' : 'نمایش'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Override Filter Pills */}
                        <div
                          className={`flex items-center gap-1 p-0.5 rounded-lg border ${
                            isLightMode
                              ? 'bg-slate-100 border-slate-200'
                              : 'bg-black/20 border-white/10'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setServerOverrideFilter('all')}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                              serverOverrideFilter === 'all'
                                ? 'bg-amber-600 text-white shadow-xs'
                                : isLightMode
                                ? 'text-slate-900 hover:bg-slate-200'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {isEn ? 'All' : 'همه'} ({permittedServers.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setServerOverrideFilter('custom_only')}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                              serverOverrideFilter === 'custom_only'
                                ? 'bg-amber-600 text-white shadow-xs'
                                : isLightMode
                                ? 'text-slate-900 hover:bg-slate-200'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {isEn ? 'Custom Overrides' : 'دارای استثنا'} (
                            {customServerOverridesCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setServerOverrideFilter('default_only')}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                              serverOverrideFilter === 'default_only'
                                ? 'bg-amber-600 text-white shadow-xs'
                                : isLightMode
                                ? 'text-slate-900 hover:bg-slate-200'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {isEn ? 'Default' : 'پیش‌فرض'}
                          </button>
                        </div>

                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute right-2.5 top-2 text-slate-400 pointer-events-none" />
                          <input
                            type="text"
                            value={serverScopeSearch}
                            onChange={(e) => setServerScopeSearch(e.target.value)}
                            placeholder={isEn ? 'Filter servers by name, IP, OS...' : 'جستجوی سرور بر اساس نام، IP یا سیستم‌عامل...'}
                            className={`w-40 sm:w-52 pl-3 pr-8 py-1 rounded-lg text-xs border outline-none transition ${
                              isLightMode
                                ? 'bg-slate-50 border-slate-300 text-slate-800 focus:border-cyan-500'
                                : 'bg-slate-900 border-white/15 text-white focus:border-cyan-400'
                            }`}
                          />
                        </div>

                        {draftPolicy.targetScope === 'specific' && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setDraftPolicy({
                                  ...draftPolicy,
                                  targetServerIds: allAvailableServers.map((s) => s.id),
                                })
                              }
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition cursor-pointer whitespace-nowrap"
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
                          </>
                        )}
                      </div>
                    </div>

                    {filteredServersForScope.length === 0 ? (
                      <div className="p-5 text-center rounded-xl bg-white/5 border border-white/10 space-y-2">
                        <AlertCircle className="w-5 h-5 text-amber-400 mx-auto" />
                        <div className="text-xs font-semibold text-slate-300">
                          {draftPolicy.targetScope === 'groups' && permittedServers.length === 0
                            ? isEn
                              ? 'No remote servers found in the currently selected device & server groups.'
                              : 'هیچ سروری در گروه‌های انتخابی فعلی در تب ۱ وجود ندارد.'
                            : isEn
                            ? 'No remote servers match the search criteria.'
                            : 'هیچ سروری مطابق با فیلتر جستجو یافت نشد.'}
                        </div>
                        {draftPolicy.targetScope === 'groups' && permittedServers.length === 0 && (
                          <p className="text-[11px] text-slate-400">
                            {isEn
                              ? 'Please select groups containing servers in Tab 1 (Identity & Scope) or switch to All Infrastructure.'
                              : 'لطفاً در تب ۱ گروه‌های دارای سرور را انتخاب نموده یا اسکوپ را روی کلیه زیرساخت قرار دهید.'}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-96 overflow-y-auto p-1 pr-1.5">
                        {filteredServersForScope.map((server) => {
                          const isSelected =
                            draftPolicy.targetScope === 'all'
                              ? true
                              : draftPolicy.targetScope === 'groups'
                              ? true
                              : (draftPolicy.targetServerIds || []).includes(server.id);

                          const hasCustom = Boolean(
                            (draftPolicy.perServerPermissions?.[server.id] &&
                              Object.keys(draftPolicy.perServerPermissions[server.id]).length > 0) ||
                              (draftPolicy.perServerApprovalRules?.[server.id] &&
                                Object.keys(draftPolicy.perServerApprovalRules[server.id]).length > 0)
                          );
                          const isExpanded = expandedServerOverrideId === server.id;

                          // Groups that contain this server
                          const parentGroups = liveDeviceGroups.filter((g) =>
                            (g.server_ids || g.serverIds || []).includes(server.id)
                          );

                          return (
                            <div
                              key={server.id}
                              className={`rounded-xl border transition overflow-hidden ${
                                hasCustom
                                  ? isLightMode
                                    ? 'bg-amber-50/70 border-amber-300 shadow-xs'
                                    : 'bg-amber-950/20 border-amber-500/40 shadow-xs'
                                  : isLightMode
                                  ? 'bg-slate-50 border-slate-200'
                                  : 'bg-slate-900/60 border-white/10'
                              }`}
                            >
                              {/* Main Card Header */}
                              <div className="p-3 flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {draftPolicy.targetScope === 'specific' ? (
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
                                      className="w-4 h-4 accent-purple-500 rounded cursor-pointer shrink-0"
                                    />
                                  ) : (
                                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                                  )}

                                  <Server className="w-4 h-4 text-amber-400 shrink-0" />

                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-xs truncate">
                                        {server.name}
                                      </span>
                                      <span className="text-[10px] font-mono text-slate-400">
                                        {server.ip}
                                      </span>
                                      <span
                                        className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold uppercase ${
                                          server.os_type === 'windows'
                                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                        }`}
                                      >
                                        {server.os_distro || server.os_type || server.os || 'linux'}
                                      </span>
                                      {server.hostname && (
                                        <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">
                                          ({server.hostname})
                                        </span>
                                      )}
                                    </div>

                                    {/* Parent groups and tags */}
                                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                      {draftPolicy.targetScope === 'groups' && parentGroups.length > 0 && (
                                        parentGroups.slice(0, 2).map((pg) => (
                                          <span
                                            key={pg.id}
                                            className="text-[8px] px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/25 text-amber-300 font-semibold truncate max-w-[120px]"
                                          >
                                            {pg.name}
                                          </span>
                                        ))
                                      )}
                                      {Array.isArray(server.tags) && server.tags.slice(0, 3).map((tag) => (
                                        <span
                                          key={tag}
                                          className="text-[8px] px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-slate-400"
                                        >
                                          #{tag}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                {/* Right Side Actions: Status Badge, Reset, Configure Overrides Drawer */}
                                <div className="flex items-center gap-2 shrink-0 ml-auto rtl:ml-0 rtl:mr-auto">
                                  {hasCustom ? (
                                    <>
                                      <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                        <Sliders className="w-2.5 h-2.5" />
                                        <span>{isEn ? 'Custom Overrides Active' : 'دارای استثنائات اختصاصی'}</span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => resetPerServerOverride(server.id)}
                                        className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition cursor-pointer flex items-center gap-1 ${
                                          isLightMode
                                            ? 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                                            : 'bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25'
                                        }`}
                                        title={isEn ? 'Reset to General Server Actions' : 'ریست به دسترسی‌های پیش‌فرض عمومی'}
                                      >
                                        <RotateCcw className="w-2.5 h-2.5" />
                                        <span>{isEn ? 'Reset' : 'ریست'}</span>
                                      </button>
                                    </>
                                  ) : (
                                    <span
                                      className={`text-[10px] px-2 py-0.5 rounded-md font-medium border ${
                                        isLightMode
                                          ? 'text-slate-700 border-slate-200 bg-slate-100'
                                          : 'text-slate-400 border-white/5 bg-white/5'
                                      }`}
                                    >
                                      {isEn ? 'Inherits General Actions' : 'پیروی از دسترسی‌های عمومی'}
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => setExpandedServerOverrideId(isExpanded ? null : server.id)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                                      isExpanded
                                        ? 'bg-amber-600 text-white font-bold border-amber-500 shadow-xs'
                                        : isLightMode
                                        ? 'bg-white text-slate-900 border-slate-300 hover:bg-slate-100'
                                        : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
                                    }`}
                                  >
                                    <Sliders className={`w-3 h-3 ${isExpanded ? 'text-white' : 'text-amber-500'}`} />
                                    <span>
                                      {isEn ? 'Custom Overrides' : 'تنظیم استثنائات'}
                                    </span>
                                    {isExpanded ? (
                                      <ChevronUp className="w-3 h-3" />
                                    ) : (
                                      <ChevronDown className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              </div>

                              {/* Expanded Custom Overrides Drawer */}
                              {isExpanded && (
                                <div
                                  className={`p-3.5 border-t space-y-3 animate-fadeIn ${
                                    isLightMode ? 'bg-white/90 border-slate-200' : 'bg-black/25 border-white/10'
                                  }`}
                                >
                                  {/* Drawer Subheader with Quick Toggles */}
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                      <Sliders className="w-3.5 h-3.5 text-amber-500" />
                                      <span
                                        className={`text-xs font-bold ${
                                          isLightMode ? 'text-amber-800' : 'text-amber-300'
                                        }`}
                                      >
                                        {isEn
                                          ? `Granular Overrides for ${server.name}:`
                                          : `استثنائات تفکیکی برای سرور ${server.name}:`}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => setPerServerBulkDecision(server.id, 'allow')}
                                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer flex items-center gap-1"
                                      >
                                        <CheckSquare className="w-2.5 h-2.5" />
                                        <span>{isEn ? 'Allow All' : 'مجاز همه'}</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setPerServerBulkDecision(server.id, 'require_approval')}
                                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-600 hover:bg-amber-500 text-white transition cursor-pointer flex items-center gap-1"
                                      >
                                        <Clock className="w-2.5 h-2.5" />
                                        <span>{isEn ? 'Approval All' : 'نیاز به تایید همه'}</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setPerServerBulkDecision(server.id, 'deny')}
                                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer flex items-center gap-1"
                                      >
                                        <Square className="w-2.5 h-2.5" />
                                        <span>{isEn ? 'Deny All' : 'مسدود همه'}</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => resetPerServerOverride(server.id)}
                                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition cursor-pointer flex items-center gap-1 ${
                                          isLightMode
                                            ? 'bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200'
                                            : 'bg-white/5 text-slate-300 border-white/10 hover:text-white'
                                        }`}
                                      >
                                        <RotateCcw className="w-2.5 h-2.5" />
                                        <span>{isEn ? 'Reset to Defaults' : 'ریست به پیش‌فرض'}</span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* Grid of Server Actions with Tri-State Controls */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                                    {SERVER_ACTIONS_CATALOG.map((action) => {
                                      const { decision, isOverridden } = getPerServerDecisionState(
                                        server.id,
                                        action.key as ServerActionKey
                                      );

                                      return (
                                        <div
                                          key={action.key}
                                          title={isEn ? action.descriptionEn : action.descriptionFa}
                                          className={`flex items-center justify-between p-2 rounded-lg border text-xs transition gap-2 ${
                                            decision === 'allow'
                                              ? isLightMode
                                                ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                                                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-100'
                                              : decision === 'require_approval'
                                              ? isLightMode
                                                ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                                                : 'bg-amber-500/15 border-amber-500/40 text-amber-100'
                                              : isLightMode
                                              ? 'bg-rose-50/60 border-rose-200 text-rose-950'
                                              : 'bg-rose-500/10 border-rose-500/25 text-rose-200'
                                          }`}
                                        >
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <span className="font-semibold truncate">
                                                {isEn ? action.labelEn : action.labelFa}
                                              </span>
                                              <span
                                                className={`text-[9px] px-1.5 py-0.2 rounded font-semibold border ${
                                                  isOverridden
                                                    ? isLightMode
                                                      ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                                                      : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                                    : isLightMode
                                                    ? 'bg-slate-200 text-slate-700 border-slate-300'
                                                    : 'bg-white/5 text-slate-400 border-white/10'
                                                }`}
                                              >
                                                {isOverridden
                                                  ? isEn
                                                    ? 'Override'
                                                    : 'استثنا'
                                                  : isEn
                                                  ? 'Inherited'
                                                  : 'ارث‌بری'}
                                              </span>
                                            </div>
                                            <div
                                              className={`text-[10px] truncate ${
                                                isLightMode ? 'text-slate-500' : 'text-slate-400'
                                              }`}
                                            >
                                              {action.key}
                                            </div>
                                          </div>
                                          {renderTriStateControl(
                                            decision,
                                            (next) =>
                                              setPerServerDecision(
                                                server.id,
                                                action.key as ServerActionKey,
                                                next
                                              ),
                                            true
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
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
                        key: 'canAddDevice',
                        labelEn: 'Introduce New Device (Inventory Registration)',
                        labelFa: 'معرفی و ثبت تجهیز جدید در انبار تجهیزات',
                        descEn: 'Display and authorize the "Introduce New Device" button',
                        descFa: 'فعال‌سازی دکمه معرفی تجهیز جدید جهت ثبت مستقل تجهیزات',
                        what: 'Permissions to click "Introduce New Device" and onboard new equipment',
                        why: 'Enables users to add and manage their own hardware within their inventory',
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
                        key: 'canExportSchematic',
                        labelEn: 'Export Visual Schematic Topology (HTML & VLAN Matrix)',
                        labelFa: 'خروجی ویژوال نقشه شماتیک (HTML و جدول ارتباطات VLAN)',
                        descEn: 'Download interactive Card / Physical topology HTML with full VLAN connections table',
                        descFa: 'دریافت خروجی بصری تعاملی HTML از نمای کارت و فیزیکی نقشه شماتیک همراه با جدول کامل ارتباطات VLANها',
                        what: 'Allows exporting Card View and Physical View schematic maps as standalone interactive HTML documentation including complete VLAN topology mappings',
                        whatFa: 'مجوز دریافت فایل HTML مستقل و ویژوال از نمای کارت‌ها و نمای فیزیکی (رک‌ها، دکل‌ها و تجهیزات) نقشه شماتیک به همراه جدول کامل ارتباطات VLANها.',
                        why: 'Protects sensitive network architecture diagrams, VLAN segmentation, and physical rack elevations from unauthorized exfiltration',
                        whyFa: 'از خروج غیرمجاز نقشه معماری شبکه، ساختار تفکیک VLANها و چیدمان فیزیکی رک‌ها توسط کاربران فاقد مجوز جلوگیری می‌کند.',
                      },
                      {
                        key: 'canRunHelpdeskDiagnostics',
                        labelEn: 'HelpDesk: Read-Only Health, Process & Network Diagnostics',
                        labelFa: 'هلپ‌دسک: مشاهده سلامت سیستم، پروسس‌ها، عیب‌یابی شبکه و صف پرینت (فقط‌خواندنی)',
                        descEn: 'Run read-only CPU/RAM/Disk/Process telemetry, endpoint Ping/Port/DNS tests, and printer queue inspection',
                        descFa: 'اجرای پایش فقط‌خواندنی سلامت و پروسس‌ها، تست پینگ/پورت/DNS از داخل سیستم کاربر و مشاهده صف پرینت',
                        what: 'Permits read-only single-host diagnostics inside the HelpDesk workspace without modifying workstation state',
                        whatFa: 'مجوز اجرای بررسی‌های فقط‌خواندنی روی یک سیستم مشخص در صفحه HelpDesk بدون ایجاد هیچ تغییری روی سیستم کاربر.',
                        why: 'Allows Tier-1 support and observers to diagnose performance, network, and printing issues safely with zero mutation risk',
                        whyFa: 'به کارشناسان سطح ۱ اجازه می‌دهد مشکلات کندی، شبکه و پرینتر را بدون ریسک تغییر در سیستم کاربر عیب‌یابی کنند.',
                      },
                      {
                        key: 'canExecuteHelpdeskActions',
                        labelEn: 'HelpDesk: Safe Remediation Actions (Flush DNS, Renew IP, Spooler Repair)',
                        labelFa: 'هلپ‌دسک: اجرای اقدامات تعمیری امن (Flush DNS، Renew IP و تعمیر Print Spooler)',
                        descEn: 'Execute allowlisted safe resets protected by single-host anti-ransomware rate limits',
                        descFa: 'اجرای دکمه‌های تعمیری ثابت و مجاز (پاک‌سازی DNS، تمدید IP، ری‌استارت و پاک‌سازی صف Spooler) با مدارقطع‌کن ضدباج‌افزار',
                        what: 'Authorizes fixed, hardcoded single-host repair actions (Flush DNS, Renew DHCP IP, Restart Print Spooler, Clear Stuck Print Queue)',
                        whatFa: 'مجوز اجرای عملیات تعمیری ثابت و غیرآزاد روی یک سیستم مشخص شامل Flush DNS، Renew IP، ری‌استارت سرویس Spooler و پاک‌سازی صف گیرکرده پرینت.',
                        why: 'Separates state-changing remediation from read-only telemetry and enforces anti-ransomware rate-limit caps and audit trails',
                        whyFa: 'عملیات تغییردهنده را از مشاهده جدا می‌کند و تحت محدودیت نرخ ضدباج‌افزار و لاگ ممیزی قرار می‌دهد.',
                      },
                      {
                        key: 'canViewHelpdeskEventViewer',
                        labelEn: 'HelpDesk: Event Viewer & Human Error Diagnostics (Read-Only)',
                        labelFa: 'هلپ‌دسک: مشاهده Event Viewer و تحلیل انسانی کد خطاها (فقط‌خواندنی)',
                        descEn: 'Inspect recent System/Application Critical, Error, and Warning events with plain-language root-cause analysis',
                        descFa: 'خواندن خطاهای اخیر System/Application سیستم کاربر همراه با توضیح دقیق و انسانی علت هر کد خطا',
                        what: 'Permits read-only retrieval of Windows Event Viewer / Linux journalctl logs paired with human-readable cause & remediation guidance',
                        whatFa: 'مجوز خواندن فقط‌خواندنی لاگ‌های Event Viewer ویندوز (یا journalctl لینوکس) همراه با ترجمه انسانی کد خطاها و راهکار پیشنهادی.',
                        why: 'Enables fast troubleshooting of crashes, disk errors, GPO failures, and DNS outages without logging into the user desktop',
                        whyFa: 'امکان تشخیص سریع علت کرش برنامه‌ها، خطای هارد، قطعی DNS و خطاهای GPO را بدون مزاحمت برای کاربر فراهم می‌کند.',
                      },
                      {
                        key: 'canTerminateHelpdeskProcesses',
                        labelEn: 'HelpDesk: Terminate Allowed User Applications (Protected OS/AV Locked)',
                        labelFa: 'هلپ‌دسک: بستن برنامه‌های کاربری هنگ‌کرده (پروسس‌های سیستمی و آنتی‌ویروس قفل)',
                        descEn: 'Safely end frozen user apps (Chrome, Excel, Outlook, etc.) while hard-blocking OS & Antivirus/EDR processes',
                        descFa: 'بستن ایمن برنامه‌های کاربری هنگ‌کرده (کروم، اکسل، اوت‌لوک و...) با محافظت سخت‌گیرانه از پروسس‌های سیستم‌عامل و آنتی‌ویروس',
                        what: 'Allows ending non-protected user-session processes verified by both PID and exact Process Name under anti-ransomware rate limits',
                        whatFa: 'مجوز پایان دادن به پروسس‌های کاربری غیرحساس با تطبیق همزمان PID و نام پروسس؛ پروسس‌های هسته ویندوز و آنتی‌ویروس‌ها به صورت سخت مسدود هستند.',
                        why: 'Resolves frozen user apps quickly while preventing accidental system crashes or ransomware-style antivirus tampering',
                        whyFa: 'مشکل هنگ کردن نرم‌افزارهای کاربر را سریع حل می‌کند بدون آنکه امکان توقف سرویس‌های امنیتی یا سیستم‌عامل وجود داشته باشد.',
                      },
                      {
                        key: 'canCleanHelpdeskTemp',
                        labelEn: 'HelpDesk: Safe Confined Temp & Recycle Bin Cleanup',
                        labelFa: 'هلپ‌دسک: پاک‌سازی امن پوشه‌های Temp و تخلیه سطل زباله',
                        descEn: 'Scan and remove unlocked temporary files inside Windows\\Temp, AppData\\Local\\Temp, and empty system Recycle Bin',
                        descFa: 'اسکن و پاک‌سازی فایل‌های موقت درون Windows\\Temp و AppData\\Local\\Temp و خالی کردن سطل زباله (Recycle Bin) بدون امکان دسترسی به سایر مسیرها',
                        what: 'Authorizes scanning and cleaning strictly hardcoded temporary directories to reclaim disk space safely',
                        whatFa: 'مجوز اسکن و پاک‌سازی مسیرهای ثابت و محدودشده پوشه Temp جهت آزادسازی فضای دیسک C سیستم کاربر.',
                        why: 'Prevents arbitrary file deletion by confining cleanup strictly to OS-standard Temp folders with full audit logging',
                        whyFa: 'با محدود کردن پاک‌سازی به مسیرهای استاندارد Temp و ثبت در Audit Log، جلوی هرگونه حذف غیرمجاز فایل‌های کاربر را می‌گیرد.',
                      },
                      {
                        key: 'canRunHelpdeskGpupdate',
                        labelEn: 'HelpDesk: Group Policy Inspection & GPUpdate /Force',
                        labelFa: 'هلپ‌دسک: مشاهده وضعیت Group Policy و اجرای gpupdate /force',
                        descEn: 'View applied Domain GPOs and trigger non-disruptive Group Policy refresh on the workstation',
                        descFa: 'مشاهده پالیسی‌های اعمال‌شده دامین (GPO) و اجرای فوری و بدون ری‌استارت دستور gpupdate /force روی سیستم کاربر',
                        what: 'Permits reading applied GPO metadata and executing a fixed non-interactive gpupdate /force refresh',
                        whatFa: 'مجوز بررسی وضعیت اعمال Group Policy و اجرای دکمه ثابت gpupdate /force بدون ری‌استارت ناخواسته سیستم کاربر.',
                        why: 'Applies new AD permissions, mapped drives, and security policies immediately during a support call',
                        whyFa: 'باعث اعمال فوری تغییرات Active Directory، دسترسی‌ها و پالیسی‌های جدید در همان لحظه تماس پشتیبانی می‌شود.',
                      },
                      {
                        key: 'canRunHelpdeskSystemRepair',
                        labelEn: 'HelpDesk: System Integrity & Disk Repair (SFC / DISM / HDD CHKDSK)',
                        labelFa: 'هلپ‌دسک: تعمیر فایل‌های سیستمی، ایمیج ویندوز و بررسی دیسک (SFC / DISM / CHKDSK)',
                        descEn: 'Run SFC verify/repair, DISM CheckHealth/ScanHealth/RestoreHealth, and safe CHKDSK (bad-sector scan strictly blocked on SSD/NVMe)',
                        descFa: 'اجرای بررسی و تعمیر فایل‌های سیستمی (SFC)، تعمیر ایمیج ویندوز (DISM) و اسکن فایل‌سیستم/بدسکتور منحصراً روی هاردهای مکانیکی HDD',
                        what: 'Authorizes hardcoded Windows integrity and image repair workflows (sfc, DISM, chkdsk) with automatic SSD/NVMe protection against chkdsk /r',
                        whatFa: 'مجوز اجرای دستورات استاندارد بررسی و تعمیر سیستم‌عامل (sfc، DISM و chkdsk) با محافظت خودکار جهت منع اجرای bad-sector scan روی درایوهای SSD و NVMe.',
                        why: 'Repairs corrupted OS binaries and schedules non-SSD disk checks remotely without granting arbitrary command shell access',
                        whyFa: 'امکان رفع خرابی فایل‌های ویندوز و بررسی سلامت هاردهای مکانیکی را از راه دور بدون باز کردن شل آزاد فراهم می‌کند.',
                      },
                      {
                        key: 'canInspectHelpdeskDomainUsers',
                        labelEn: 'HelpDesk: Active Directory Domain Account Inspection (net user /domain)',
                        labelFa: 'هلپ‌دسک: بررسی وضعیت اکانت کاربری دامین (net user /domain)',
                        descEn: 'Check AD password last set, expiration, account active/lockout status, and local/global group memberships',
                        descFa: 'استعلام وضعیت اکانت دامین شامل تاریخ آخرین تغییر رمز، انقضا، قفل بودن حساب و فهرست گروه‌های Local و Global',
                        what: 'Permits read-only domain user inspection via sanitized net user <username> /domain queries',
                        whatFa: 'مجوز استعلام فقط‌خواندنی مشخصات اکانت‌های دامین از طریق دستور کنترل‌شده net user /domain.',
                        why: 'Allows HelpDesk technicians to diagnose locked or expired domain accounts immediately without full Domain Admin rights',
                        whyFa: 'کارشناسان هلپ‌دسک می‌توانند علت عدم ورود کاربر (قفل شدن یا انقضای رمز) و عضویت گروه‌ها را سریعاً تشخیص دهند.',
                      },
                      {
                        key: 'canUnlockHelpdeskDomainUsers',
                        labelEn: 'HelpDesk: Unlock Locked AD Accounts & Manage AD Check History',
                        labelFa: 'هلپ‌دسک: رفع قفل اکانت دامین و مدیریت تاریخچه بررسی‌های AD',
                        descEn: 'Allow unlocking locked Active Directory user accounts (lockoutTime=0) and deleting AD user/group check history entries',
                        descFa: 'مجوز باز کردن قفل اکانت‌های قفل‌شده اکتیو دایرکتوری (Unlock Account) و حذف سوابق تاریخچه بررسی کاربر/گروه دامین',
                        what: 'Authorizes write-level AD lockout release (POST /helpdesk/user/unlock) and deletion of AD user/group check history records within active RBAC scope.',
                        whatFa: 'اجازه اجرای عملیات نوشتاری رفع قفل حساب کاربری در اکتیو دایرکتوری و مدیریت حذف سوابق تاریخچه بررسی کاربر و گروه دامین.',
                        why: 'Keeps Active Directory & User/Group Support strictly read-only for Tier-1 viewers while allowing Tier-2 operators to release lockouts safely.',
                        whyFa: 'به مدیران اجازه می‌دهد نمایش اطلاعات کاربر/گروه دامین را به صورت فقط‌خواندنی (Read-Only) بدهند و دسترسی رفع قفل را فقط به کارشناسان مجاز واگذار کنند.',
                      },
                      {
                        key: 'canPowerControlHelpdeskEndpoints',
                        labelEn: 'HelpDesk: Remote Power Control (Force/Scheduled Shutdown & Restart)',
                        labelFa: 'هلپ‌دسک: کنترل پاور از راه دور (خاموش کردن و ری‌استارت فوری/زمان‌بندی‌شده)',
                        descEn: 'High-impact permission to remotely restart, shut down (immediate or scheduled), or abort pending shutdown on an endpoint',
                        descFa: 'دسترسی حساس برای ری‌استارت فوری، خاموش کردن اجباری یا زمان‌بندی‌شده سیستم کاربر و لغو زمان‌بندی خاموشی (shutdown /a)',
                        what: 'Grants explicit authority to execute remote shutdown /r, shutdown /s, and shutdown /a actions with full audit logging',
                        whatFa: 'مجوز صریح اجرای خاموشی یا ری‌استارت فوری/زمان‌بندی‌شده و لغو آن روی ایستگاه کاری با ثبت کامل در لاگ ممیزی.',
                        why: 'Separated as an opt-in high-impact permission so routine HelpDesk staff cannot accidentally power off active workstations',
                        whyFa: 'به دلیل ریسک قطع ناگهانی کار کاربر به صورت مجزا و غیرفعال پیش‌فرض برای غیرمدیران طراحی شده تا فقط در صورت نیاز واگذار شود.',
                      },
                      {
                        key: 'canManageHelpdeskExceptions',
                        labelEn: 'HelpDesk: Manage Blocked IP, Local User & AD Exceptions',
                        labelFa: 'هلپ‌دسک: مدیریت استثنائات و مسدودسازی اتصال (IP / کاربر لوکال / یوزر و گروه AD)',
                        descEn: 'Create, enable/disable, edit, and delete HelpDesk exclusion rules that block HelpDesk connections to VIP workstations, IPs, local accounts, AD users, or AD groups',
                        descFa: 'ایجاد، فعال/غیرفعال‌سازی، ویرایش و حذف قوانین استثنائات هلپ‌دسک برای جلوگیری از اتصال به آی‌پی‌ها، کاربران محلی، کاربران دامین و گروه‌های اکتیو دایرکتوری مشخص',
                        what: 'Authorizes modifying PostgreSQL-enforced HelpDesk target blocklist rules across IPs, CIDRs, hostnames, local accounts, AD users, and AD security groups.',
                        whatFa: 'مجوز مدیریت قوانین مسدودسازی و استثنائات اتصال در ماژول هلپ‌دسک (ذخیره و اعمال قطعی در سمت سرور و دیتابیس PostgreSQL).',
                        why: 'Ensures only trusted security/infrastructure administrators can add or lift exclusions protecting sensitive executives, servers, or privileged AD groups.',
                        whyFa: 'از حذف یا دور زدن محدودیت‌های امنیتی سیستم‌های حساس (مدیران ارشد یا گروه‌های ویژه AD) توسط اپراتورهای عادی جلوگیری می‌کند.',
                      },
                      {
                        key: 'canSendHelpdeskMessage',
                        labelEn: 'HelpDesk & Servers: Send Interactive Message to Endpoint Screen / Terminal',
                        labelFa: 'هلپ‌دسک و سرورها: ارسال پیام تعاملی روی صفحه سیستم کاربر / ترمینال',
                        descEn: 'Authorize sending live screen popup notices (Windows msg.exe / desktop dialog) and Linux terminal broadcast messages (wall/write/notify)',
                        descFa: 'مجوز ارسال پیام زنده روی مانیتور سیستم ویندوزی کاربر (پنجره اعلان روی صفحه) و پیام ترمینال لینوکس (wall / write)',
                        what: 'Grants explicit permission to display immediate alert popups on remote workstation screens or broadcast messages to active Linux sessions.',
                        whatFa: 'مجوز صریح برای ارسال و نمایش پیام فوری روی صفحه نمایش ایستگاه‌های کاری کاربران در ماژول هلپ‌دسک و ترمینال سرورهای لینوکس.',
                        why: 'Separated strictly from standard HelpDesk actions so unauthorized operators cannot display disruptive or social-engineering popups on user screens unless Super Admin or explicitly permitted.',
                        whyFa: 'به صورت سخت‌گیرانه از سایر دسترسی‌ها جدا شده است تا فقط سوپرادمین یا اپراتورهای دارای مجوز صریح بتوانند روی مانیتور کاربران پیام ارسال کنند.',
                      },
                      {
                        key: 'canViewAllHelpdeskHistory',
                        labelEn: 'HelpDesk: View & Manage All Operators Connection History',
                        labelFa: 'هلپ‌دسک: مشاهده و مدیریت تاریخچه اتصالات تمامی اپراتورها',
                        descEn: 'View, audit, and manage HelpDesk connection history across all technicians; when disabled, operators see only their own connections',
                        descFa: 'مشاهده و مدیریت سوابق اتصال تمام کارشناسان در تاریخچه هلپ‌دسک؛ در صورت غیرفعال بودن، هر کارشناس فقط اتصالات خودش را می‌بیند',
                        what: 'Expands the Connection History tab scope from operator-private records to organization-wide HelpDesk audit records.',
                        whatFa: 'دامنه نمایش و مدیریت تب Connection History را از سوابق شخصی اپراتور به تاریخچه جامع همه کارشناسان گسترش می‌دهد.',
                        why: 'Preserves operator privacy and least-privilege separation while letting managers and Super Admins audit all remote support sessions.',
                        whyFa: 'حریم شخصی و اصل حداقل دسترسی میان اپراتورهای هلپ‌دسک را حفظ می‌کند و هم‌زمان امکان نظارت جامع را برای مدیران فراهم می‌سازد.',
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
                      {
                        key: 'canViewSessionRecordings',
                        labelEn: 'View Session Recordings Archive (Audit Logs)',
                        labelFa: 'مشاهده لیست آرشیو ضبط جلسات ریموت (Audit Logs)',
                        descEn: 'Browse recorded SSH, RDP, and VNC sessions for allowed servers',
                        descFa: 'مشاهده فهرست جلسات ضبط‌شده سرورهای مجاز در تب Session Recordings بخش لاگ‌ها',
                        what: 'Grants visibility into the Session Recordings tab inside Audit & Command Logs',
                        whatFa: 'مجوز مشاهده تب و فهرست آرشیو ضبط جلسات (SSH / RDP / VNC) در صفحه Audit & Command Logs.',
                        why: 'Enables auditors and managers to track who connected to sensitive servers and when',
                        whyFa: 'امکان ردیابی دقیق اتصال کاربران به سرورهای حساس و بررسی تاریخچه جلسات را برای ممیزان فراهم می‌کند.',
                      },
                      {
                        key: 'canPlaybackSessionRecordings',
                        labelEn: 'Play Back Recorded Sessions',
                        labelFa: 'پخش آنلاین جلسات ضبط‌شده (SSH / RDP / VNC)',
                        descEn: 'Watch SSH terminal timeline replays and RDP/VNC video streams',
                        descFa: 'بازپخش تایم‌لاینی دستورات SSH و ویدیوی جلسات ریموت دسکتاپ',
                        what: 'Authorizes streaming and playing back archived terminal and desktop recordings',
                        whatFa: 'مجوز استریم و بازپخش آنلاین فایل‌های ضبط‌شده ترمینال SSH و ویدیوی جلسات RDP/VNC.',
                        why: 'Restricts visual review of sensitive screen sessions to authorized investigators',
                        whyFa: 'مشاهده محتوای تصویری و دستورات اجراشده در جلسات حساس را محدود به بازرسان و مدیران مجاز می‌کند.',
                      },
                      {
                        key: 'canDownloadSessionRecordings',
                        labelEn: 'Download Session Recordings & Transcripts',
                        labelFa: 'دانلود فایل ویدیو و متن ضبط جلسات',
                        descEn: 'Export .mp4, .webm, .guac, .cast, and .txt files locally',
                        descFa: 'دریافت خروجی محلی فایل‌های ویدیویی و متن دستورات SSH',
                        what: 'Permits downloading archived session media outside the portal',
                        whatFa: 'امکان دانلود محلی فایل‌های ویدیویی (.mp4/.webm/.guac) و متن دستورات (.cast/.txt) از سرور.',
                        why: 'Prevents unauthorized exfiltration of recorded administrative screen activity',
                        whyFa: 'از خروج غیرمجاز فایل‌های ضبط‌شده و افشای فعالیت‌های مدیریتی خارج از پنل جلوگیری می‌کند.',
                      },
                      {
                        key: 'canManageSessionRecordingLegalHold',
                        labelEn: 'Manage Recording Legal Hold (Anti-Delete Lock)',
                        labelFa: 'مدیریت قفل ضدحذف ضبط جلسات (Legal Hold)',
                        descEn: 'Lock or unlock sensitive recordings against manual and auto purge',
                        descFa: 'اعمال یا برداشتن قفل ضدحذف برای محافظت از پرونده‌های حساس',
                        what: 'Protects forensic evidence from automated retention cleanup or deletion',
                        whatFa: 'امکان قفل‌گذاری یا باز کردن قفل ضدحذف (Legal Hold) روی جلسات حساس جهت جلوگیری از پاک‌سازی خودکار یا دستی.',
                        why: 'Ensures compliance officers can preserve incident recordings indefinitely',
                        whyFa: 'تضمین می‌کند شواهد حوادث امنیتی تا پایان بررسی‌ها به هیچ عنوان حذف نشوند.',
                      },
                      {
                        key: 'canDeleteSessionRecordings',
                        labelEn: 'Delete Session Recordings Permanently',
                        labelFa: 'حذف دائمی فایل‌های ضبط جلسات',
                        descEn: 'Permanently remove unlocked recordings from database and disk',
                        descFa: 'حذف کامل فایل‌های بدون قفل ضدحذف از سرور و پایگاه داده',
                        what: 'Destructive capability to erase archived remote session recordings',
                        whatFa: 'اختیار حذف دائم و غیرقابل بازگشت فایل‌های ضبط جلسات (بدون قفل Legal Hold) از دیسک و دیتابیس.',
                        why: 'Should be restricted strictly to senior administrators to maintain audit integrity',
                        whyFa: 'برای حفظ یکپارچگی ممیزی امنیتی باید منحصراً در اختیار مدیران ارشد باشد.',
                      },
                      {
                        key: 'canManageSessionRecordingSettings',
                        labelEn: 'Configure Session Recording & Storage Settings',
                        labelFa: 'مدیریت تنظیمات ضبط، کیفیت و مسیر ذخیره‌سازی',
                        descEn: 'Modify storage directory, video quality, retention days, and encryption',
                        descFa: 'تغییر مسیر ذخیره روی سرور، کیفیت ویدیو، مدت نگهداری و رمزنگاری',
                        what: 'Controls fleet-wide recording capture, transcoding quality, and disk retention',
                        whatFa: 'اختیار ویرایش تنظیمات سراسری ضبط جلسات، مسیر ذخیره‌سازی، کیفیت کدگذاری ویدیو، رمزنگاری و مدت نگهداری.',
                        why: 'High-privilege setting affecting server storage and compliance posture',
                        whyFa: 'تنظیماتی با سطح دسترسی بالا که مستقیماً بر فضای دیسک سرور و سیاست‌های انطباق امنیتی اثر می‌گذارد.',
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
                                whatIsIt={isEn ? item.what : ((item as any).whatFa || item.descFa)}
                                whyNeeded={isEn ? item.why : ((item as any).whyFa || item.descFa)}
                                practicalExample={
                                  isEn
                                    ? 'Permitted for Core Admins & Auditors; disabled for Helpdesk'
                                    : 'مجاز برای مدیران ارشد و ممیزان؛ غیرمجاز برای پشتیبانی عادی'
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
            {/* TAB 7: Network Device & Granular matrix */}
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
                          ? 'Network Equipment Granular Override Matrix'
                          : 'ماتریس اختیارات تفکیکی تجهیزات شبکه'}
                      </h4>
                    </div>

                    {/* Equipment Scope Badges */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">
                        {permittedDevices.length} {isEn ? 'Equipment in Scope' : 'تجهیز در دامنه'}
                      </span>
                      <span
                        className={`text-[11px] font-mono px-2 py-0.5 rounded-md border ${
                          isLightMode
                            ? 'bg-slate-100 text-slate-800 border-slate-300'
                            : 'bg-white/5 text-slate-300 border-white/10'
                        }`}
                      >
                        {customDeviceOverridesCount} {isEn ? 'Custom Overrides' : 'دارای استثنا'}
                      </span>
                    </div>
                  </div>

                  {/* Network Equipment Matrix Content */}
                  <div className="space-y-3">
                      {/* Introduce New Device Permission Card */}
                      {(() => {
                        const addDeviceDecision = getDefaultDeviceDecision('add_device');
                        return (
                          <div
                            className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 flex-wrap transition ${
                              addDeviceDecision === 'allow'
                                ? isLightMode
                                  ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-xs'
                                  : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                                : addDeviceDecision === 'require_approval'
                                ? isLightMode
                                  ? 'bg-amber-50/90 border-amber-300 text-amber-950 shadow-xs'
                                  : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                                : isLightMode
                                ? 'bg-slate-100 border-slate-200 text-slate-700'
                                : 'bg-slate-900/60 border-white/10 text-slate-400'
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                              <div
                                className={`p-2 rounded-lg shrink-0 ${
                                  addDeviceDecision === 'allow'
                                    ? isLightMode
                                      ? 'bg-emerald-200 text-emerald-800'
                                      : 'bg-emerald-500/30 text-emerald-300'
                                    : addDeviceDecision === 'require_approval'
                                    ? isLightMode
                                      ? 'bg-amber-200 text-amber-800'
                                      : 'bg-amber-500/30 text-amber-300'
                                    : isLightMode
                                    ? 'bg-slate-200 text-slate-600'
                                    : 'bg-white/5 text-slate-400'
                                }`}
                              >
                                <Plus className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className={`font-bold text-xs ${
                                      isLightMode ? 'text-slate-900' : 'text-white'
                                    }`}
                                  >
                                    {isEn
                                      ? 'Introduce New Device Authority (Inventory Registration)'
                                      : 'مجوز دسترسی دکمه معرفی تجهیز جدید (Introduce New Device)'}
                                  </span>
                                  <span
                                    className={`text-[9px] px-1.5 py-0.2 rounded font-semibold border ${
                                      addDeviceDecision === 'allow'
                                        ? isLightMode
                                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold'
                                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-bold'
                                        : addDeviceDecision === 'require_approval'
                                        ? isLightMode
                                          ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                                          : 'bg-amber-500/20 text-amber-300 border-amber-500/30 font-bold'
                                        : isLightMode
                                        ? 'bg-slate-200 text-slate-700 border-slate-300'
                                        : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                                    }`}
                                  >
                                    {addDeviceDecision === 'allow'
                                      ? isEn
                                        ? 'PERMITTED'
                                        : 'مجاز'
                                      : addDeviceDecision === 'require_approval'
                                      ? isEn
                                        ? 'APPROVAL REQUIRED'
                                        : 'نیاز به تایید'
                                      : isEn
                                      ? 'RESTRICTED'
                                      : 'مسدود'}
                                  </span>
                                </div>
                                <p
                                  className={`text-[11px] mt-0.5 leading-relaxed ${
                                    isLightMode ? 'text-slate-600' : 'text-slate-300'
                                  }`}
                                >
                                  {isEn
                                    ? 'Controls direct onboarding, approval-gated onboarding, or restriction for the "Introduce New Device" action.'
                                    : 'کنترل دسترسی مستقیم، منوط به تایید در زنجیره مراحل، یا مسدودسازی دکمه «معرفی تجهیز جدید» برای این نقش.'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <FieldInfoTooltip
                                title={
                                  isEn
                                    ? 'Introduce New Device Authority'
                                    : 'اختیار معرفی تجهیز جدید'
                                }
                                whatIsIt={
                                  isEn
                                    ? 'Controls visibility and approval requirements for the "Introduce New Device" action in Dashboard and Equipment Inventory.'
                                    : 'کنترل‌کننده فعال بودن و یا نیاز به تایید برای دکمه معرفی تجهیز جدید در داشبورد و فهرست تجهیزات.'
                                }
                                whyNeeded={
                                  isEn
                                    ? 'Allows delegated engineers to propose or register new hardware with optional multi-stage supervisor sign-off.'
                                    : 'به مهندسان اجازه می‌دهد تجهیزات جدید را مستقیماً یا با تایید سرپرست در سامانه ثبت کنند.'
                                }
                                practicalExample={
                                  isEn
                                    ? 'Set to Require Approval for junior NOC operators onboarding core devices.'
                                    : 'برای اپراتورهای جدید روی «نیاز به تایید» قرار دهید تا ثبت تجهیز جدید توسط مدیر تایید شود.'
                                }
                                isEn={isEn}
                                isLightMode={isLightMode}
                              />
                              {renderTriStateControl(addDeviceDecision, (next) =>
                                setDefaultDeviceDecision('add_device', next)
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Collapsible Default Network Device Actions (Policy-wide Tri-State Rules) */}
                      <div
                        className={`rounded-xl border overflow-hidden transition ${
                          isLightMode
                            ? 'bg-slate-50/90 border-slate-200'
                            : 'bg-slate-900/60 border-white/10'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setIsDefaultDeviceActionsOpen((prev) => !prev)}
                          className={`w-full p-3.5 flex items-center justify-between gap-3 text-left rtl:text-right cursor-pointer transition ${
                            isLightMode ? 'hover:bg-slate-100/80' : 'hover:bg-white/[0.03]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`p-1.5 rounded-lg shrink-0 ${
                                isLightMode
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : 'bg-indigo-500/20 text-indigo-300'
                              }`}
                            >
                              <Layers className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`text-xs font-bold ${
                                    isLightMode ? 'text-slate-900' : 'text-white'
                                  }`}
                                >
                                  {isEn
                                    ? 'Default Network Device Actions (General, MikroTik, Cisco & Ports)'
                                    : 'اختیارات پیش‌فرض تجهیزات شبکه (عمومی، میکروتیک، سیسکو و پورت‌ها)'}
                                </span>
                                <span
                                  className={`text-[10px] font-mono px-2 py-0.2 rounded-full border font-semibold ${
                                    approvalCounts.defaultDeviceCount > 0
                                      ? isLightMode
                                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                      : isLightMode
                                      ? 'bg-slate-200 text-slate-700 border-slate-300'
                                      : 'bg-white/5 text-slate-400 border-white/10'
                                  }`}
                                >
                                  {approvalCounts.defaultDeviceCount}{' '}
                                  {isEn ? 'Require Approval' : 'نیاز به تایید'}
                                </span>
                              </div>
                              <p
                                className={`text-[11px] mt-0.5 ${
                                  isLightMode ? 'text-slate-600' : 'text-slate-400'
                                }`}
                              >
                                {isEn
                                  ? 'Policy-wide tri-state defaults inherited by all network equipment unless overridden per device below.'
                                  : 'مقادیر سه‌حالته پیش‌فرض پالیسی که به کلیه تجهیزات شبکه به ارث می‌رسند مگر در استثنائات زیر بازنویسی شوند.'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div onClick={(e) => e.stopPropagation()}>
                              <FieldInfoTooltip
                                title={
                                  isEn
                                    ? 'Default Network Device Actions'
                                    : 'اختیارات پیش‌فرض تجهیزات شبکه'
                                }
                                whatIsIt={
                                  isEn
                                    ? 'Sets the baseline tri-state rule (Allow / Require Approval / Deny) across all 4 network capability groups.'
                                    : 'قاعده پایه سه‌حالته (مجاز / نیاز به تایید / مسدود) را برای هر ۴ دسته قابلیت تجهیزات شبکه مشخص می‌کند.'
                                }
                                whyNeeded={
                                  isEn
                                    ? 'Enforces uniform approval gates (e.g., Write Memory, Firewall, Port Shutdown) across all switches and routers at once.'
                                    : 'قوانین تایید یکپارچه (مثلاً ذخیره NVRAM، فایروال یا خاموش کردن پورت) را هم‌زمان روی همه روترها و سوئیچ‌ها اعمال می‌کند.'
                                }
                                practicalExample={
                                  isEn
                                    ? 'Set Cisco Write Memory and MikroTik Firewall & Safe Mode to Require Approval by default.'
                                    : 'گزینه‌های Write Memory سیسکو و فایروال میکروتیک را به‌صورت پیش‌فرض روی «نیاز به تایید» قرار دهید.'
                                }
                                isEn={isEn}
                                isLightMode={isLightMode}
                              />
                            </div>
                            {isDefaultDeviceActionsOpen ? (
                              <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                        </button>

                        {isDefaultDeviceActionsOpen && (
                          <div
                            className={`p-3.5 border-t space-y-4 animate-fadeIn ${
                              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/50 border-white/10'
                            }`}
                          >
                            {[
                              {
                                id: 'general',
                                titleEn: 'General Device & Management Capabilities',
                                titleFa: 'عملیات و دسترسی‌های عمومی تجهیز',
                                actions: universalGeneralActions,
                                accentClass: isLightMode ? 'text-cyan-700' : 'text-cyan-300',
                              },
                              {
                                id: 'mikrotik',
                                titleEn: 'MikroTik RouterOS Core Services & Governance',
                                titleFa: 'سرویس‌ها و اختیارات اختصاصی روتروس میکروتیک',
                                actions: mikrotikCoreActions,
                                accentClass: isLightMode ? 'text-emerald-700' : 'text-emerald-300',
                              },
                              {
                                id: 'cisco',
                                titleEn: 'Cisco IOS Switch Enterprise Configuration Suite',
                                titleFa: 'مجموعه ابزار و اختیارات پیکربندی سوئیچ سیسکو',
                                actions: ciscoConfigActions,
                                accentClass: isLightMode ? 'text-sky-700' : 'text-sky-300',
                              },
                              {
                                id: 'ports',
                                titleEn: 'Port Right-Click & Interface Actions',
                                titleFa: 'عملیات راست‌کلیک پورت و اینترفیس‌ها',
                                actions: portEquipmentActions,
                                accentClass: isLightMode ? 'text-amber-700' : 'text-amber-300',
                              },
                            ]
                              .filter((sec) => sec.actions.length > 0)
                              .map((section) => {
                                const sectionKeys = section.actions.map(
                                  (a) => a.key as NetworkDeviceActionKey
                                );
                                return (
                                  <div
                                    key={section.id}
                                    className="space-y-2 pt-2 first:pt-0 border-t first:border-t-0 border-slate-200/70 dark:border-white/10"
                                  >
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                      <span className={`text-[11px] font-bold ${section.accentClass}`}>
                                        {isEn ? section.titleEn : section.titleFa}
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setAllDefaultDeviceDecision(sectionKeys, 'allow')
                                          }
                                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                                        >
                                          {isEn ? 'Allow All' : 'مجاز همه'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setAllDefaultDeviceDecision(
                                              sectionKeys,
                                              'require_approval'
                                            )
                                          }
                                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-600 hover:bg-amber-500 text-white cursor-pointer"
                                        >
                                          {isEn ? 'Approval All' : 'نیاز به تایید همه'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setAllDefaultDeviceDecision(sectionKeys, 'deny')
                                          }
                                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                                        >
                                          {isEn ? 'Deny All' : 'مسدود همه'}
                                        </button>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      {section.actions.map((action) => {
                                        const decision = getDefaultDeviceDecision(
                                          action.key as NetworkDeviceActionKey
                                        );
                                        return (
                                          <div
                                            key={action.key}
                                            title={
                                              isEn
                                                ? action.descriptionEn || action.labelEn
                                                : action.descriptionFa || action.labelFa
                                            }
                                            className={`flex items-center justify-between p-2 rounded-lg border text-[11px] transition gap-2 ${
                                              decision === 'allow'
                                                ? isLightMode
                                                  ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                                                  : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                                                : decision === 'require_approval'
                                                ? isLightMode
                                                  ? 'bg-amber-50/75 border-amber-300 text-amber-950'
                                                  : 'bg-amber-500/15 border-amber-500/35 text-amber-200'
                                                : isLightMode
                                                ? 'bg-slate-100 border-slate-200 text-slate-600'
                                                : 'bg-slate-900/60 border-white/10 text-slate-400'
                                            }`}
                                          >
                                            <span className="font-semibold truncate">
                                              {isEn
                                                ? action.labelEn || action.shortLabelEn || action.key
                                                : action.labelFa || action.shortLabelFa || action.key}
                                            </span>
                                            {renderTriStateControl(
                                              decision,
                                              (next) =>
                                                setDefaultDeviceDecision(
                                                  action.key as NetworkDeviceActionKey,
                                                  next
                                                ),
                                              true
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>

                      {/* Cascading Filter Status Banner (Phase 2) */}
                      <div
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 flex-wrap ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border uppercase ${
                              draftPolicy.targetScope === 'all'
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                                : draftPolicy.targetScope === 'groups'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            }`}
                          >
                            {draftPolicy.targetScope === 'all'
                              ? isEn
                                ? 'All Equipment Scope'
                                : 'دامنه کلیه تجهیزات'
                              : draftPolicy.targetScope === 'groups'
                              ? isEn
                                ? 'Group-Scoped Equipment'
                                : 'تجهیزات فیلترشده با گروه'
                              : isEn
                              ? 'Specific Devices'
                              : 'تجهیزات خاص انتخابی'}
                          </span>
                          <span
                            className={`text-xs ${
                              isLightMode ? 'text-slate-600' : 'text-slate-300'
                            }`}
                          >
                            {isEn
                              ? `Displaying ${permittedDevices.length} of ${devices.length} network devices permitted under this policy (configured in Tab 1: Scope & Identity).`
                              : `نمایش ${permittedDevices.length} از ${devices.length} تجهیز شبکه مجاز تحت این پالیسی (تعیین شده در تب ۱: شناسه و محدوده).`}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setActiveTab('identity')}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 transition flex items-center gap-1.5 cursor-pointer ml-auto rtl:ml-0 rtl:mr-auto shrink-0"
                        >
                          <ArrowRight className="w-3 h-3 rtl:rotate-180" />
                          <span>{isEn ? 'Change Scope in Tab 1' : 'تغییر اسکوپ در تب ۱'}</span>
                        </button>
                      </div>

                      {permittedDevices.length === 0 ? (
                        <div className="p-6 text-center rounded-xl bg-white/5 border border-white/10 space-y-2">
                          <AlertCircle className="w-6 h-6 text-amber-400 mx-auto" />
                          <div className="font-bold text-xs text-amber-300">
                            {isEn ? 'No Network Devices in Permitted Scope' : 'هیچ تجهیز شبکه‌ای در محدوده مجاز این پالیسی قرار ندارد'}
                          </div>
                          <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                            {isEn
                              ? 'The infrastructure scope configured in Tab 1 (Identity & Scope) does not include any network switches or routers. Adjust the target groups or specific devices in Tab 1 to enable per-device overrides.'
                              : 'محدوده زیرساختی انتخاب‌شده در تب ۱ شامل هیچ سوییچ یا روتری نیست. جهت تنظیم استثنائات، لطفاً گروه‌ها یا تجهیزات هدف را در تب ۱ تغییر دهید.'}
                          </p>
                          <button
                            type="button"
                            onClick={() => setActiveTab('identity')}
                            className="mt-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                            <span>{isEn ? 'Go to Tab 1 (Identity & Scope)' : 'رفتن به تب ۱ (شناسه و محدوده)'}</span>
                          </button>
                        </div>
                      ) : (
                        <>
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
                                className={`px-2 py-1 rounded text-[10px] font-semibold border cursor-pointer transition ${
                                  matrixDeviceFilter === 'all'
                                    ? 'bg-rose-600 text-white border-rose-500'
                                    : isLightMode
                                    ? 'bg-slate-100 text-slate-900 border-slate-200 hover:bg-slate-200'
                                    : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
                                }`}
                              >
                                {isEn ? 'All' : 'همه'} ({permittedDevices.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setMatrixDeviceFilter('custom_only')}
                                className={`px-2 py-1 rounded text-[10px] font-semibold border cursor-pointer transition ${
                                  matrixDeviceFilter === 'custom_only'
                                    ? 'bg-rose-600 text-white border-rose-500'
                                    : isLightMode
                                    ? 'bg-slate-100 text-slate-900 border-slate-200 hover:bg-slate-200'
                                    : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
                                }`}
                              >
                                {isEn ? 'Custom Overrides' : 'دارای استثنا'} (
                                {customDeviceOverridesCount})
                              </button>
                              <button
                                type="button"
                                onClick={() => setMatrixDeviceFilter('default_only')}
                                className={`px-2 py-1 rounded text-[10px] font-semibold border cursor-pointer transition ${
                                  matrixDeviceFilter === 'default_only'
                                    ? 'bg-rose-600 text-white border-rose-500'
                                    : isLightMode
                                    ? 'bg-slate-100 text-slate-900 border-slate-200 hover:bg-slate-200'
                                    : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
                                }`}
                              >
                                {isEn ? 'Default' : 'پیش‌فرض'}
                              </button>
                            </div>
                          </div>

                          {/* Batch Multi-Select & Selection Toolbar */}
                          <div
                            className={`p-2.5 rounded-xl border flex items-center justify-between flex-wrap gap-2 text-xs transition ${
                              isLightMode
                                ? 'bg-slate-100/90 border-slate-200'
                                : 'bg-slate-900/80 border-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={handleSelectAllVisibleDevices}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1.5 transition cursor-pointer ${
                                  matrixFilteredDevices.length > 0 &&
                                  matrixFilteredDevices.every((d) => selectedDeviceIds.has(d.id))
                                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                    : isLightMode
                                    ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                                    : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                                }`}
                              >
                                {matrixFilteredDevices.length > 0 &&
                                matrixFilteredDevices.every((d) => selectedDeviceIds.has(d.id)) ? (
                                  <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
                                ) : (
                                  <Square className="w-3.5 h-3.5 text-slate-400" />
                                )}
                                <span>{isEn ? 'Select All Visible' : 'انتخاب همه موارد جاری'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSelectDevicesByPlatform('cisco')}
                                className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                                  isLightMode
                                    ? 'bg-white text-sky-700 border-sky-300 hover:bg-sky-50'
                                    : 'bg-sky-500/10 text-sky-300 border-sky-500/20 hover:bg-sky-500/20'
                                }`}
                              >
                                <span>{isEn ? 'Select Cisco' : 'انتخاب سیسکو'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSelectDevicesByPlatform('mikrotik')}
                                className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                                  isLightMode
                                    ? 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                                    : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20'
                                }`}
                              >
                                <span>{isEn ? 'Select MikroTik' : 'انتخاب میکروتیک'}</span>
                              </button>

                              {selectedDeviceIds.size > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedDeviceIds(new Set())}
                                  className="text-[11px] text-slate-400 hover:text-rose-400 underline cursor-pointer"
                                >
                                  {isEn ? 'Clear Selection' : 'لغو انتخاب'}
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                              <span>{isEn ? 'Selected:' : 'انتخاب شده:'}</span>
                              <span className="font-mono font-bold text-cyan-400">
                                {selectedDeviceIds.size}
                              </span>
                              <span>/</span>
                              <span className="font-mono">{permittedDevices.length}</span>
                            </div>
                          </div>

                          {/* Active Batch Operations Toolbar (Revealed when 1+ devices are selected) */}
                          {selectedDeviceIds.size > 0 && (
                            <div
                              className={`p-3 rounded-xl border flex items-center justify-between flex-wrap gap-2 shadow-lg animate-fadeIn relative z-20 ${
                                isLightMode
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-950'
                                  : 'bg-indigo-950/40 border-indigo-500/40 text-white'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                                <span className="font-bold text-xs">
                                  {isEn
                                    ? `Batch Action on ${selectedDeviceIds.size} Selected Devices:`
                                    : `عملیات گروهی روی ${selectedDeviceIds.size} تجهیز انتخاب شده:`}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Apply Template Dropdown Button */}
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setIsBatchTemplateMenuOpen((prev) => !prev)
                                    }
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>
                                      {isEn ? 'Apply Template...' : 'اعمال الگو به انتخاب‌شده‌ها...'}
                                    </span>
                                    <ChevronDown className="w-3 h-3" />
                                  </button>

                                  {isBatchTemplateMenuOpen && (
                                    <>
                                      <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setIsBatchTemplateMenuOpen(false)}
                                      />
                                      <div
                                        className={`absolute right-0 rtl:right-auto rtl:left-0 top-full mt-1.5 w-76 max-h-[65vh] overflow-y-auto rounded-xl border shadow-2xl p-2 z-50 animate-fadeIn ${
                                          isLightMode
                                            ? 'bg-white border-slate-200 text-slate-800'
                                            : 'bg-slate-900 border-white/15 text-white'
                                        }`}
                                      >
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
                                          {isEn ? 'Standard Built-in Templates' : 'الگوهای استاندارد سیستم'}
                                        </div>
                                        <div className="space-y-1 mb-2">
                                          {builtinDeviceTemplates.map((tmpl) => (
                                            <button
                                              key={tmpl.id}
                                              type="button"
                                              onClick={() =>
                                                applyTemplateToBatch(
                                                  tmpl.permissions,
                                                  isEn ? tmpl.nameEn : tmpl.nameFa
                                                )
                                              }
                                              className={`w-full text-left rtl:text-right p-2 rounded-lg text-xs transition cursor-pointer flex flex-col gap-0.5 ${
                                                isLightMode
                                                  ? 'hover:bg-slate-100 text-slate-800'
                                                  : 'hover:bg-white/10 text-slate-200'
                                              }`}
                                            >
                                              <div className="flex items-center justify-between">
                                                <span className="font-semibold">
                                                  {isEn ? tmpl.nameEn : tmpl.nameFa}
                                                </span>
                                                <span
                                                  className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                                                    tmpl.id === 'lockdown_deny_all'
                                                      ? 'bg-rose-500/20 text-rose-300'
                                                      : 'bg-cyan-500/20 text-cyan-300'
                                                  }`}
                                                >
                                                  {isEn ? tmpl.badgeEn : tmpl.badgeFa}
                                                </span>
                                              </div>
                                              <span className="text-[10px] text-slate-400 line-clamp-1">
                                                {isEn
                                                  ? tmpl.descriptionEn
                                                  : tmpl.descriptionFa}
                                              </span>
                                            </button>
                                          ))}
                                        </div>

                                        {customTemplates.length > 0 && (
                                          <>
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 border-t border-white/10 pt-1.5">
                                              {isEn ? 'Custom Saved Templates' : 'الگوهای سفارشی ذخیره‌شده'}
                                            </div>
                                            <div className="space-y-1 max-h-44 overflow-y-auto">
                                              {customTemplates.map((ct) => {
                                                const allowCount = DEVICE_ACTIONS_CATALOG.filter((a) => {
                                                  const k = a.key as NetworkDeviceActionKey;
                                                  const r = ct.approvalRules?.[k];
                                                  return r ? r === 'allow' : Boolean(ct.permissions?.[k]);
                                                }).length;
                                                const apprCount = DEVICE_ACTIONS_CATALOG.filter(
                                                  (a) => ct.approvalRules?.[a.key as NetworkDeviceActionKey] === 'require_approval'
                                                ).length;
                                                return (
                                                  <div
                                                    key={ct.id}
                                                    className={`flex items-center justify-between gap-1 rounded-lg text-xs transition ${
                                                      isLightMode
                                                        ? 'hover:bg-slate-100'
                                                        : 'hover:bg-white/10'
                                                    }`}
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        applyTemplateToBatch(
                                                          ct.permissions,
                                                          isEn ? ct.nameEn : ct.nameFa,
                                                          ct.approvalRules
                                                        )
                                                      }
                                                      className="flex-1 p-1.5 text-left rtl:text-right cursor-pointer flex items-center justify-between gap-2 min-w-0"
                                                    >
                                                      <span className="font-semibold truncate">
                                                        {isEn ? ct.nameEn : ct.nameFa}
                                                      </span>
                                                      <span className="text-[9px] font-mono shrink-0 text-slate-400">
                                                        {allowCount}✓{apprCount > 0 ? ` · ${apprCount}⏳` : ''}
                                                      </span>
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={(e) =>
                                                        handleDeleteCustomTemplate(ct.id, e)
                                                      }
                                                      className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer shrink-0"
                                                      title={isEn ? 'Delete template' : 'حذف الگو'}
                                                    >
                                                      <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </div>

                                {/* Copy Permissions From Device Button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCopyTargetDevId('BATCH');
                                    setCopySourceSearch('');
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>
                                    {isEn ? 'Copy From Device...' : 'کپی دسترسی از تجهیز دیگر...'}
                                  </span>
                                </button>

                                {/* Exclude / Deny All Button */}
                                <button
                                  type="button"
                                  onClick={handleExcludeBatch}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                                  title={
                                    isEn
                                      ? 'Deny all permissions on selected devices'
                                      : 'مسدودسازی و قطع کامل دسترسی روی تجهیزات انتخابی'
                                  }
                                >
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  <span>
                                    {isEn ? 'Exclude / Lock Down' : 'استثنا و مسدودسازی'}
                                  </span>
                                </button>

                                {/* Reset to Default Button */}
                                <button
                                  type="button"
                                  onClick={handleResetBatch}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                                  title={
                                    isEn
                                      ? 'Reset selected devices to inherit General Policy'
                                      : 'ریست تنظیمات و بازگشت به پالیسی عمومی'
                                  }
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>
                                    {isEn ? 'Reset to Default' : 'ریست به پیش‌فرض'}
                                  </span>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Matrix Feedback Toast Notification */}
                          {matrixFeedbackToast && (
                            <div
                              className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 shadow-md animate-fadeIn ${
                                isLightMode
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                  : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                <span className="font-medium">{matrixFeedbackToast}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setMatrixFeedbackToast(null)}
                                className="text-slate-400 hover:text-white cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}

                          {/* Device List with action toggle buttons */}
                          <div className="space-y-2 max-h-80 overflow-y-auto p-1">
                            {matrixFilteredDevices.length === 0 ? (
                              <div className="p-4 text-center text-xs text-slate-400">
                                {isEn ? 'No devices match the filter.' : 'هیچ تجهیزی مطابق با فیلتر یافت نشد.'}
                              </div>
                            ) : (
                          matrixFilteredDevices.map((dev) => {
                            const hasCustom = Boolean(
                              (draftPolicy.perDevicePermissions?.[dev.id] &&
                                Object.keys(draftPolicy.perDevicePermissions[dev.id]).length > 0) ||
                                (draftPolicy.perDeviceApprovalRules?.[dev.id] &&
                                  Object.keys(draftPolicy.perDeviceApprovalRules[dev.id]).length > 0)
                            );
                            const isSelected = selectedDeviceIds.has(dev.id);

                            const isCisco = Boolean(
                              dev.platform?.includes('cisco') ||
                              dev.platform === 'cisco_ios' ||
                              dev.platform === 'cisco_ios_xe' ||
                              (!dev.platform && (dev.type === 'switch' || dev.type === 'router'))
                            );
                            const isMikrotik = Boolean(
                              dev.platform?.includes('mikrotik') ||
                              dev.platform === 'mikrotik_routeros'
                            );
                            const applicablePortActions = portEquipmentActions.filter((action) => {
                              if (action.platform === 'all' || !action.platform) return true;
                              if (action.platform === 'cisco') return isCisco || !isMikrotik;
                              if (action.platform === 'mikrotik') return isMikrotik;
                              return false;
                            });

                            return (
                              <div
                                key={dev.id}
                                className={`p-3 rounded-xl border space-y-3 transition ${
                                  isSelected
                                    ? isLightMode
                                      ? 'bg-indigo-50/90 border-indigo-400 shadow-sm'
                                      : 'bg-indigo-950/30 border-indigo-500/50'
                                    : hasCustom
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
                                    <button
                                      type="button"
                                      onClick={() => handleToggleSelectDevice(dev.id)}
                                      className="cursor-pointer text-slate-400 hover:text-white transition"
                                      title={
                                        isEn
                                          ? 'Select device for batch operations'
                                          : 'انتخاب تجهیز برای عملیات گروهی'
                                      }
                                    >
                                      {isSelected ? (
                                        <CheckSquare className="w-4 h-4 text-cyan-400" />
                                      ) : (
                                        <Square className="w-4 h-4 text-slate-500 hover:text-slate-300" />
                                      )}
                                    </button>
                                    <HardDrive className="w-4 h-4 text-cyan-400" />
                                    <span className="font-bold text-xs">{dev.name}</span>
                                    <span className="text-[10px] font-mono text-slate-400">
                                      {dev.ip}
                                    </span>
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
                                      {dev.platform || (isCisco ? 'cisco' : isMikrotik ? 'mikrotik' : dev.type)}
                                    </span>
                                    {isCisco && (
                                      <span className="text-[9px] px-1 py-0.2 rounded bg-sky-500/15 text-sky-300 border border-sky-500/25 font-semibold">
                                        Cisco IOS
                                      </span>
                                    )}
                                    {isMikrotik && (
                                      <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 font-semibold">
                                        MikroTik RouterOS
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {/* Per-Device Apply Template Dropdown */}
                                    <div className="relative">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setActivePresetMenuDevId((prev) =>
                                            prev === dev.id ? null : dev.id
                                          )
                                        }
                                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 flex items-center gap-1 cursor-pointer"
                                        title={
                                          isEn
                                            ? 'Apply permission template to this device'
                                            : 'اعمال الگوی دسترسی به این تجهیز'
                                        }
                                      >
                                        <Sparkles className="w-3 h-3 text-indigo-400" />
                                        <span>{isEn ? 'Templates' : 'الگوها'}</span>
                                        <ChevronDown className="w-2.5 h-2.5" />
                                      </button>

                                      {activePresetMenuDevId === dev.id && (
                                        <>
                                          <div
                                            className="fixed inset-0 z-40"
                                            onClick={() => setActivePresetMenuDevId(null)}
                                          />
                                          <div
                                            className={`absolute right-0 rtl:right-auto rtl:left-0 top-full mt-1 w-68 max-h-64 overflow-y-auto rounded-xl border shadow-2xl p-2 z-50 animate-fadeIn ${
                                              isLightMode
                                                ? 'bg-white border-slate-200 text-slate-800'
                                                : 'bg-slate-900 border-white/15 text-white'
                                            }`}
                                          >
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-0.5">
                                              {isEn ? 'Standard Templates' : 'الگوهای استاندارد'}
                                            </div>
                                            <div className="space-y-1 mb-2">
                                              {builtinDeviceTemplates.map((tmpl) => (
                                                <button
                                                  key={tmpl.id}
                                                  type="button"
                                                  onClick={() =>
                                                    applyTemplateToDevice(
                                                      dev.id,
                                                      tmpl.permissions,
                                                      isEn ? tmpl.nameEn : tmpl.nameFa
                                                    )
                                                  }
                                                  className={`w-full text-left rtl:text-right p-1.5 rounded-lg text-[11px] transition cursor-pointer flex flex-col ${
                                                    isLightMode
                                                      ? 'hover:bg-slate-100 text-slate-800'
                                                      : 'hover:bg-white/10 text-slate-200'
                                                  }`}
                                                >
                                                  <div className="flex items-center justify-between">
                                                    <span className="font-semibold">
                                                      {isEn ? tmpl.nameEn : tmpl.nameFa}
                                                    </span>
                                                    <span
                                                      className={`text-[8px] px-1 py-0.1 rounded font-mono ${
                                                        tmpl.id === 'lockdown_deny_all'
                                                          ? 'bg-rose-500/20 text-rose-300'
                                                          : 'bg-cyan-500/20 text-cyan-300'
                                                      }`}
                                                    >
                                                      {isEn ? tmpl.badgeEn : tmpl.badgeFa}
                                                    </span>
                                                  </div>
                                                </button>
                                              ))}
                                            </div>

                                            {customTemplates.length > 0 && (
                                              <>
                                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-0.5 border-t border-white/10 pt-1">
                                                  {isEn ? 'Custom Templates' : 'الگوهای سفارشی'}
                                                </div>
                                                <div className="space-y-1 max-h-36 overflow-y-auto">
                                                  {customTemplates.map((ct) => {
                                                    const allowCount = DEVICE_ACTIONS_CATALOG.filter((a) => {
                                                      const k = a.key as NetworkDeviceActionKey;
                                                      const r = ct.approvalRules?.[k];
                                                      return r ? r === 'allow' : Boolean(ct.permissions?.[k]);
                                                    }).length;
                                                    const apprCount = DEVICE_ACTIONS_CATALOG.filter(
                                                      (a) => ct.approvalRules?.[a.key as NetworkDeviceActionKey] === 'require_approval'
                                                    ).length;
                                                    return (
                                                      <div
                                                        key={ct.id}
                                                        className={`flex items-center justify-between gap-1 rounded-lg text-[11px] transition ${
                                                          isLightMode
                                                            ? 'hover:bg-slate-100'
                                                            : 'hover:bg-white/10'
                                                        }`}
                                                      >
                                                        <button
                                                          type="button"
                                                          onClick={() =>
                                                            applyTemplateToDevice(
                                                              dev.id,
                                                              ct.permissions,
                                                              isEn ? ct.nameEn : ct.nameFa,
                                                              ct.approvalRules
                                                            )
                                                          }
                                                          className="flex-1 p-1.5 text-left rtl:text-right cursor-pointer flex items-center justify-between gap-1.5 min-w-0"
                                                        >
                                                          <span className="font-semibold truncate">
                                                            {isEn ? ct.nameEn : ct.nameFa}
                                                          </span>
                                                          <span className="text-[9px] font-mono shrink-0 text-slate-400">
                                                            {allowCount}✓{apprCount > 0 ? `·${apprCount}⏳` : ''}
                                                          </span>
                                                        </button>
                                                        <button
                                                          type="button"
                                                          onClick={(e) =>
                                                            handleDeleteCustomTemplate(ct.id, e)
                                                          }
                                                          className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer shrink-0"
                                                          title={isEn ? 'Delete' : 'حذف'}
                                                        >
                                                          <Trash2 className="w-3 h-3" />
                                                        </button>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              </>
                                            )}
                                          </div>
                                        </>
                                      )}
                                    </div>

                                    {/* Copy From Another Device Button */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCopyTargetDevId(dev.id);
                                        setCopySourceSearch('');
                                      }}
                                      className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 flex items-center gap-1 cursor-pointer"
                                      title={
                                        isEn
                                          ? 'Copy permissions from another device to this one'
                                          : 'کپی کردن دسترسی‌ها از تجهیز دیگر به این تجهیز'
                                      }
                                    >
                                      <Copy className="w-3 h-3" />
                                      <span>{isEn ? 'Copy From...' : 'کپی از...'}</span>
                                    </button>

                                    {/* Save as Custom Template Button */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSaveTemplateDevId(dev.id);
                                        setTemplateNameInput(
                                          isEn
                                            ? `${dev.name} Template`
                                            : `الگوی ${dev.name}`
                                        );
                                      }}
                                      className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 flex items-center gap-1 cursor-pointer"
                                      title={
                                        isEn
                                          ? 'Save this device’s permissions as a reusable template'
                                          : 'ذخیره دسترسی‌های این تجهیز به عنوان یک الگوی آماده'
                                      }
                                    >
                                      <BookmarkPlus className="w-3 h-3" />
                                      <span>{isEn ? 'Save Template' : 'ذخیره الگو'}</span>
                                    </button>

                                    {/* Exclude / Lock Down Single Device Button */}
                                    <button
                                      type="button"
                                      onClick={() => handleExcludeDevice(dev.id)}
                                      className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/25 hover:bg-rose-500/25 flex items-center gap-1 cursor-pointer"
                                      title={
                                        isEn
                                          ? 'Exclude and deny all permissions on this device'
                                          : 'استثنا و قطع کامل کلیه دسترسی‌ها روی این تجهیز'
                                      }
                                    >
                                      <ShieldAlert className="w-3 h-3" />
                                      <span>{isEn ? 'Exclude' : 'استثنا'}</span>
                                    </button>

                                    {/* Reset to Default or Status */}
                                    {hasCustom ? (
                                      <button
                                        type="button"
                                        onClick={() => handleResetDevice(dev.id)}
                                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-700/60 text-slate-300 border border-slate-600 hover:bg-slate-700 flex items-center gap-1 cursor-pointer"
                                        title={
                                          isEn
                                            ? 'Remove custom overrides and inherit general policy'
                                            : 'حذف استثنائات اختصاصی و بازگشت به پالیسی عمومی'
                                        }
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        <span>{isEn ? 'Reset' : 'ریست'}</span>
                                      </button>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 font-semibold px-1.5 py-0.5 rounded bg-white/5 border border-white/5">
                                        {isEn ? 'Inherits General Policy' : 'پیروی از پالیسی عمومی'}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Section 1: General Device & Management Capabilities */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between flex-wrap gap-1">
                                    <div
                                      className={`text-[10px] font-bold flex items-center gap-1 ${
                                        isLightMode ? 'text-slate-700' : 'text-slate-300'
                                      }`}
                                    >
                                      <Sliders className="w-3 h-3 text-cyan-500" />
                                      <span>
                                        {isEn
                                          ? 'General Device & Management Capabilities'
                                          : 'عملیات و دسترسی‌های عمومی تجهیز'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPerDeviceSectionDecision(
                                            dev.id,
                                            universalGeneralActions.map(
                                              (a) => a.key as NetworkDeviceActionKey
                                            ),
                                            'allow'
                                          )
                                        }
                                        className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                                      >
                                        {isEn ? 'Allow All' : 'مجاز همه'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPerDeviceSectionDecision(
                                            dev.id,
                                            universalGeneralActions.map(
                                              (a) => a.key as NetworkDeviceActionKey
                                            ),
                                            'require_approval'
                                          )
                                        }
                                        className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-600 hover:bg-amber-500 text-white cursor-pointer"
                                      >
                                        {isEn ? 'Approval All' : 'نیاز به تایید'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPerDeviceSectionDecision(
                                            dev.id,
                                            universalGeneralActions.map(
                                              (a) => a.key as NetworkDeviceActionKey
                                            ),
                                            'deny'
                                          )
                                        }
                                        className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                                      >
                                        {isEn ? 'Deny All' : 'مسدودسازی'}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                                    {universalGeneralActions.map((action) => {
                                      const { decision, isOverridden } = getPerDeviceDecisionState(
                                        dev.id,
                                        action.key as NetworkDeviceActionKey
                                      );

                                      return (
                                        <div
                                          key={action.key}
                                          title={
                                            isEn
                                              ? action.descriptionEn || action.labelEn
                                              : action.descriptionFa || action.labelFa
                                          }
                                          className={`flex items-center justify-between p-1.5 rounded-lg border text-[11px] transition gap-2 ${
                                            decision === 'allow'
                                              ? isLightMode
                                                ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                                                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                                              : decision === 'require_approval'
                                              ? isLightMode
                                                ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                                                : 'bg-amber-500/15 border-amber-500/35 text-amber-200'
                                              : isLightMode
                                              ? 'bg-rose-50/60 border-rose-200 text-rose-950'
                                              : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                                          }`}
                                        >
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="truncate font-semibold">
                                              {isEn
                                                ? action.shortLabelEn || action.key
                                                : action.shortLabelFa || action.key}
                                            </span>
                                            <span
                                              className={`text-[9px] px-1 py-0.2 rounded font-semibold shrink-0 border ${
                                                isOverridden
                                                  ? isLightMode
                                                    ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                                                    : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                                  : isLightMode
                                                  ? 'bg-slate-200 text-slate-700 border-slate-300'
                                                  : 'bg-white/5 text-slate-400 border-white/10'
                                              }`}
                                            >
                                              {isOverridden
                                                ? isEn
                                                  ? 'Override'
                                                  : 'استثنا'
                                                : isEn
                                                ? 'Inherited'
                                                : 'ارث‌بری'}
                                            </span>
                                          </div>
                                          {renderTriStateControl(
                                            decision,
                                            (next) =>
                                              setPerDeviceDecision(
                                                dev.id,
                                                action.key as NetworkDeviceActionKey,
                                                next
                                              ),
                                            true
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Section 2 (MikroTik Only): RouterOS Core Services & Governance */}
                                {isMikrotik && mikrotikCoreActions.length > 0 && (
                                  <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                                    <div className="flex items-center justify-between flex-wrap gap-1">
                                      <div
                                        className={`text-[10px] font-bold flex items-center gap-1.5 ${
                                          isLightMode ? 'text-emerald-800' : 'text-emerald-300'
                                        }`}
                                      >
                                        <RouterIcon className="w-3 h-3 text-emerald-500" />
                                        <span>
                                          {isEn
                                            ? 'MikroTik RouterOS Core Services & Governance'
                                            : 'سرویس‌ها و اختیارات اختصاصی روتروس میکروتیک'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPerDeviceSectionDecision(
                                              dev.id,
                                              mikrotikCoreActions.map(
                                                (a) => a.key as NetworkDeviceActionKey
                                              ),
                                              'allow'
                                            )
                                          }
                                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                                        >
                                          {isEn ? 'Allow All RouterOS' : 'اجازه همه روتروس'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPerDeviceSectionDecision(
                                              dev.id,
                                              mikrotikCoreActions.map(
                                                (a) => a.key as NetworkDeviceActionKey
                                              ),
                                              'require_approval'
                                            )
                                          }
                                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-600 hover:bg-amber-500 text-white cursor-pointer"
                                        >
                                          {isEn ? 'Approval RouterOS' : 'نیاز به تایید'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPerDeviceSectionDecision(
                                              dev.id,
                                              mikrotikCoreActions.map(
                                                (a) => a.key as NetworkDeviceActionKey
                                              ),
                                              'deny'
                                            )
                                          }
                                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                                        >
                                          {isEn ? 'Deny All RouterOS' : 'مسدودسازی روتروس'}
                                        </button>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                                      {mikrotikCoreActions.map((action) => {
                                        const { decision, isOverridden } = getPerDeviceDecisionState(
                                          dev.id,
                                          action.key as NetworkDeviceActionKey
                                        );

                                        return (
                                          <div
                                            key={action.key}
                                            title={
                                              isEn
                                                ? action.descriptionEn || action.labelEn
                                                : action.descriptionFa || action.labelFa
                                            }
                                            className={`flex items-center justify-between p-1.5 rounded-lg border text-[11px] transition gap-2 ${
                                              decision === 'allow'
                                                ? isLightMode
                                                  ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                                                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                                                : decision === 'require_approval'
                                                ? isLightMode
                                                  ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                                                  : 'bg-amber-500/15 border-amber-500/35 text-amber-200'
                                                : isLightMode
                                                ? 'bg-rose-50/60 border-rose-200 text-rose-950'
                                                : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                                            }`}
                                          >
                                            <div className="flex items-center gap-1.5 min-w-0">
                                              <span className="truncate font-semibold">
                                                {isEn
                                                  ? action.shortLabelEn || action.key
                                                  : action.shortLabelFa || action.key}
                                              </span>
                                              <span
                                                className={`text-[9px] px-1 py-0.2 rounded font-semibold shrink-0 border ${
                                                  isOverridden
                                                    ? isLightMode
                                                      ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                                                      : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                                    : isLightMode
                                                    ? 'bg-slate-200 text-slate-700 border-slate-300'
                                                    : 'bg-white/5 text-slate-400 border-white/10'
                                                }`}
                                              >
                                                {isOverridden
                                                  ? isEn
                                                    ? 'Override'
                                                    : 'استثنا'
                                                  : isEn
                                                  ? 'Inherited'
                                                  : 'ارث‌بری'}
                                              </span>
                                            </div>
                                            {renderTriStateControl(
                                              decision,
                                              (next) =>
                                                setPerDeviceDecision(
                                                  dev.id,
                                                  action.key as NetworkDeviceActionKey,
                                                  next
                                                ),
                                            true
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Section 3 (Cisco Only): Cisco IOS Switch Enterprise Configuration Suite */}
                                {isCisco && ciscoConfigActions.length > 0 && (
                                  <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                                    <div className="flex items-center justify-between flex-wrap gap-1">
                                      <div
                                        className={`text-[10px] font-bold flex items-center gap-1.5 ${
                                          isLightMode ? 'text-sky-800' : 'text-sky-300'
                                        }`}
                                      >
                                        <Sliders className="w-3 h-3 text-sky-500" />
                                        <span>
                                          {isEn
                                            ? 'Cisco IOS Switch Enterprise Configuration Suite'
                                            : 'مجموعه ابزار و اختیارات پیکربندی سوئیچ سیسکو'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPerDeviceSectionDecision(
                                              dev.id,
                                              ciscoConfigActions.map(
                                                (a) => a.key as NetworkDeviceActionKey
                                              ),
                                              'allow'
                                            )
                                          }
                                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
                                        >
                                          {isEn ? 'Allow All Cisco' : 'اجازه همه سیسکو'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPerDeviceSectionDecision(
                                              dev.id,
                                              ciscoConfigActions.map(
                                                (a) => a.key as NetworkDeviceActionKey
                                              ),
                                              'require_approval'
                                            )
                                          }
                                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-600 hover:bg-amber-500 text-white cursor-pointer"
                                        >
                                          {isEn ? 'Approval Cisco' : 'نیاز به تایید'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPerDeviceSectionDecision(
                                              dev.id,
                                              ciscoConfigActions.map(
                                                (a) => a.key as NetworkDeviceActionKey
                                              ),
                                              'deny'
                                            )
                                          }
                                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                                        >
                                          {isEn ? 'Deny All Cisco' : 'مسدودسازی سیسکو'}
                                        </button>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                                      {ciscoConfigActions.map((action) => {
                                        const { decision, isOverridden } = getPerDeviceDecisionState(
                                          dev.id,
                                          action.key as NetworkDeviceActionKey
                                        );

                                        return (
                                          <div
                                            key={action.key}
                                            title={
                                              isEn
                                                ? action.descriptionEn || action.labelEn
                                                : action.descriptionFa || action.labelFa
                                            }
                                            className={`flex items-center justify-between p-1.5 rounded-lg border text-[11px] transition gap-2 ${
                                              decision === 'allow'
                                                ? isLightMode
                                                  ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                                                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                                                : decision === 'require_approval'
                                                ? isLightMode
                                                  ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                                                  : 'bg-amber-500/15 border-amber-500/35 text-amber-200'
                                                : isLightMode
                                                ? 'bg-rose-50/60 border-rose-200 text-rose-950'
                                                : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                                            }`}
                                          >
                                            <div className="flex items-center gap-1.5 min-w-0">
                                              <span className="truncate font-semibold">
                                                {isEn
                                                  ? action.shortLabelEn || action.key
                                                  : action.shortLabelFa || action.key}
                                              </span>
                                              <span
                                                className={`text-[9px] px-1 py-0.2 rounded font-semibold shrink-0 border ${
                                                  isOverridden
                                                    ? isLightMode
                                                      ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                                                      : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                                    : isLightMode
                                                    ? 'bg-slate-200 text-slate-700 border-slate-300'
                                                    : 'bg-white/5 text-slate-400 border-white/10'
                                                }`}
                                              >
                                                {isOverridden
                                                  ? isEn
                                                    ? 'Override'
                                                    : 'استثنا'
                                                  : isEn
                                                  ? 'Inherited'
                                                  : 'ارث‌بری'}
                                              </span>
                                            </div>
                                            {renderTriStateControl(
                                              decision,
                                              (next) =>
                                                setPerDeviceDecision(
                                                  dev.id,
                                                  action.key as NetworkDeviceActionKey,
                                                  next
                                                ),
                                              true
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Section 4 (or Section 2/3): Port Right-Click & Interface Actions */}
                                {applicablePortActions.length > 0 && (
                                  <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                                    <div className="flex items-center justify-between flex-wrap gap-1">
                                      <div
                                        className={`text-[10px] font-bold flex items-center gap-1.5 ${
                                          isLightMode ? 'text-amber-800' : 'text-amber-300'
                                        }`}
                                      >
                                        <Network className="w-3 h-3 text-amber-500" />
                                        <span>
                                          {isMikrotik
                                            ? isEn
                                              ? 'MikroTik Port Right-Click & Interface Actions'
                                              : 'عملیات راست‌کلیک و اینترفیس‌های میکروتیک'
                                            : isEn
                                            ? 'Cisco Port Right-Click & Port Actions'
                                            : 'عملیات راست‌کلیک و پورت‌های سیسکو'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPerDeviceSectionDecision(
                                              dev.id,
                                              applicablePortActions.map(
                                                (a) => a.key as NetworkDeviceActionKey
                                              ),
                                              'allow'
                                            )
                                          }
                                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                                        >
                                          {isEn ? 'Allow All Ports' : 'اجازه همه پورت‌ها'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPerDeviceSectionDecision(
                                              dev.id,
                                              applicablePortActions.map(
                                                (a) => a.key as NetworkDeviceActionKey
                                              ),
                                              'require_approval'
                                            )
                                          }
                                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-600 hover:bg-amber-500 text-white cursor-pointer"
                                        >
                                          {isEn ? 'Approval Ports' : 'نیاز به تایید'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPerDeviceSectionDecision(
                                              dev.id,
                                              applicablePortActions.map(
                                                (a) => a.key as NetworkDeviceActionKey
                                              ),
                                              'deny'
                                            )
                                          }
                                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                                        >
                                          {isEn ? 'Deny All Ports' : 'مسدودسازی پورت‌ها'}
                                        </button>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                                      {applicablePortActions.map((action) => {
                                        const { decision, isOverridden } = getPerDeviceDecisionState(
                                          dev.id,
                                          action.key as NetworkDeviceActionKey
                                        );

                                        return (
                                          <div
                                            key={action.key}
                                            title={
                                              isEn
                                                ? action.descriptionEn || action.labelEn
                                                : action.descriptionFa || action.labelFa
                                            }
                                            className={`flex items-center justify-between p-1.5 rounded-lg border text-[11px] transition gap-2 ${
                                              decision === 'allow'
                                                ? isLightMode
                                                  ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                                                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                                                : decision === 'require_approval'
                                                ? isLightMode
                                                  ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                                                  : 'bg-amber-500/15 border-amber-500/35 text-amber-200'
                                                : isLightMode
                                                ? 'bg-rose-50/60 border-rose-200 text-rose-950'
                                                : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                                            }`}
                                          >
                                            <div className="flex items-center gap-1.5 min-w-0">
                                              <span className="truncate font-semibold">
                                                {isEn
                                                  ? action.shortLabelEn || action.key
                                                  : action.shortLabelFa || action.key}
                                              </span>
                                              <span
                                                className={`text-[9px] px-1 py-0.2 rounded font-semibold shrink-0 border ${
                                                  isOverridden
                                                    ? isLightMode
                                                      ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                                                      : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                                    : isLightMode
                                                    ? 'bg-slate-200 text-slate-700 border-slate-300'
                                                    : 'bg-white/5 text-slate-400 border-white/10'
                                                }`}
                                              >
                                                {isOverridden
                                                  ? isEn
                                                    ? 'Override'
                                                    : 'استثنا'
                                                  : isEn
                                                  ? 'Inherited'
                                                  : 'ارث‌بری'}
                                              </span>
                                            </div>
                                            {renderTriStateControl(
                                              decision,
                                              (next) =>
                                                setPerDeviceDecision(
                                                  dev.id,
                                                  action.key as NetworkDeviceActionKey,
                                                  next
                                                ),
                                              true
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

            {/* ========================================================================= */}
            {/* TAB: HelpDesk Target Scope & Exception Rules                              */}
            {/* ========================================================================= */}
            {activeTab === 'helpdesk' && (
              <div className="space-y-5 animate-fadeIn">
                {/* Intro Guidance Banner */}
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                    isLightMode
                      ? 'bg-teal-50/80 border-teal-200 text-teal-950'
                      : 'bg-teal-950/30 border-teal-500/25 text-teal-100'
                  }`}
                >
                  <Headphones className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed space-y-1">
                    <p className="font-bold">
                      {isEn
                        ? 'Unified HelpDesk Target Governance (Endpoint, AD Users & AD Groups)'
                        : 'مدیریت یکپارچه محدوده دسترسی و آدرس‌های مجاز/مسدود در هر ۳ صفحه هلپ‌دسک'}
                    </p>
                    <p className={`text-[11px] ${isLightMode ? 'text-teal-900/90' : 'text-teal-200/85'}`}>
                      {isEn
                        ? 'By default all fields below are empty and set to "Allow All" so HelpDesk technicians can inspect any permitted target. Configure IP/Subnet/Range or AD Group/User rules here to enforce strict allowlists or blocklists across Agentless Endpoint HelpDesk, AD User Support HelpDesk, and AD Group Support HelpDesk.'
                        : 'به صورت پیش‌فرض تمام فیلدهای زیر خالی و روی حالت «همه مجاز» قرار دارند تا عملکرد هلپ‌دسک محدود نشود. با تعریف رنج/IP یا گروه/کاربر در اینجا، محدودیت‌ها همزمان روی هر سه صفحه (هلپ‌دسک سیستم کاربران، پشتیبانی کاربران AD و پشتیبانی گروه‌های AD) اعمال می‌شوند.'}
                    </p>
                  </div>
                </div>

                {/* -------- Section 1: Endpoint IP / CIDR / Range / Hostname Rules -------- */}
                <div
                  className={`p-4 rounded-xl border space-y-4 ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-sky-500" />
                      <h4 className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                        {isEn
                          ? '1. Workstations, IP Addresses, Subnets (CIDR) & IP Ranges'
                          : '۱. محدوده سیستم‌ها، آدرس‌های IP، ساب‌نت‌ها (CIDR) و رنج‌های IP'}
                      </h4>
                      <FieldInfoTooltip
                        title={isEn ? 'Endpoint IP / Subnet / Range Rules' : 'قوانین محدوده IP و ساب‌نت سیستم‌ها'}
                        whatIsIt={
                          isEn
                            ? 'Controls which workstations (by IP, CIDR subnet, start-end IP range, or hostname/wildcard) operators under this policy can connect to in Agentless Endpoint HelpDesk.'
                            : 'تعیین می‌کند کارشناسان این پالیسی به کدام آدرس‌های IP، رنج یا ساب‌نت بتوانند در صفحه هلپ‌دسک متصل شوند و کدام آدرس‌ها مسدود باشند.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Allows scoping branch/team support technicians to their own subnet while protecting servers, VIP endpoints, or management VLANs. Blocklist is checked both pre-connect and against resolved endpoint NIC IPs.'
                            : 'امکان محدودسازی کارشناسان هر شعبه/تیم به رنج IP واحد خودشان و مسدودسازی قطعی دسترسی به سرورها، VLANهای مدیریتی یا سیستم‌های مدیران را فراهم می‌کند.'
                        }
                        practicalExample="10.10.20.0/24, 192.168.5.10-192.168.5.80, 172.16.1.5, ws-fin-*"
                        isEn={isEn}
                        isLightMode={Boolean(isLightMode)}
                      />
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/25 font-semibold">
                      {draftPolicy.targetHelpdeskIpScope === 'selected'
                        ? `${isEn ? 'Allowlist Only' : 'فقط موارد مجاز'}: ${(draftPolicy.allowedHelpdeskIps || []).length}`
                        : isEn
                        ? 'Scope: All IPs Permitted'
                        : 'دامنه: همه آدرس‌ها مجاز'}
                    </span>
                  </div>

                  {/* Scope Mode Radio Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition select-none ${
                        (draftPolicy.targetHelpdeskIpScope || 'all') === 'all'
                          ? isLightMode
                            ? 'bg-sky-50 border-sky-300 shadow-xs'
                            : 'bg-sky-500/10 border-sky-500/40 text-white'
                          : isLightMode
                          ? 'bg-slate-50 border-slate-200 hover:border-slate-300'
                          : 'bg-white/5 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <input
                        type="radio"
                        name="targetHelpdeskIpScope"
                        checked={(draftPolicy.targetHelpdeskIpScope || 'all') === 'all'}
                        onChange={() =>
                          setDraftPolicy({ ...draftPolicy, targetHelpdeskIpScope: 'all' })
                        }
                        className="mt-0.5 accent-sky-500"
                      />
                      <div>
                        <div className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                          {isEn ? 'All Endpoints & IPs Allowed (Default)' : 'همه سیستم‌ها و IPها مجاز (پیش‌فرض)'}
                        </div>
                        <div className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                          {isEn
                            ? 'Technicians can check any IP/host except those in the Blocked list or Global Blocklist.'
                            : 'کارشناسان می‌توانند تمام سیستم‌ها را بررسی کنند مگر آدرس‌هایی که در لیست مسدود زیر قرار دارند.'}
                        </div>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition select-none ${
                        draftPolicy.targetHelpdeskIpScope === 'selected'
                          ? isLightMode
                            ? 'bg-teal-50 border-teal-300 shadow-xs'
                            : 'bg-teal-500/10 border-teal-500/40 text-white'
                          : isLightMode
                          ? 'bg-slate-50 border-slate-200 hover:border-slate-300'
                          : 'bg-white/5 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <input
                        type="radio"
                        name="targetHelpdeskIpScope"
                        checked={draftPolicy.targetHelpdeskIpScope === 'selected'}
                        onChange={() =>
                          setDraftPolicy({ ...draftPolicy, targetHelpdeskIpScope: 'selected' })
                        }
                        className="mt-0.5 accent-teal-500"
                      />
                      <div>
                        <div className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                          {isEn ? 'Only Specified IPs / Subnets / Ranges' : 'فقط IPها، ساب‌نت‌ها و رنج‌های مشخص‌شده'}
                        </div>
                        <div className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                          {isEn
                            ? 'Strictly restricts Endpoint HelpDesk checks to addresses listed in Permitted IPs below.'
                            : 'امکان بررسی در صفحه هلپ‌دسک را منحصراً به آدرس‌ها و رنج‌های مجاز تعریف‌شده محدود می‌کند.'}
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Permitted IPs builder (shown when selected) */}
                  {draftPolicy.targetHelpdeskIpScope === 'selected' && (
                    <div
                      className={`p-3.5 rounded-xl border space-y-2.5 ${
                        isLightMode
                          ? 'bg-teal-50/50 border-teal-200'
                          : 'bg-teal-950/20 border-teal-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-bold ${isLightMode ? 'text-teal-900' : 'text-teal-200'}`}>
                          {isEn
                            ? 'Permitted IPs, CIDR Subnets, IP Ranges & Hostname Patterns'
                            : 'آدرس‌های IP، ساب‌نت‌های CIDR، رنج IP و الگوهای نام سیستم مجاز'}
                        </span>
                        {(draftPolicy.allowedHelpdeskIps || []).length > 0 && (
                          <button
                            type="button"
                            onClick={() => clearHelpdeskListField('allowedHelpdeskIps')}
                            className="text-[11px] font-semibold text-rose-500 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>{isEn ? 'Clear' : 'پاک کردن'}</span>
                          </button>
                        )}
                      </div>
                      {(draftPolicy.allowedHelpdeskIps || []).length === 0 && (
                        <div
                          className={`p-2 rounded-lg border text-[11px] flex items-center gap-2 ${
                            isLightMode
                              ? 'bg-amber-50 border-amber-300 text-amber-900'
                              : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                          }`}
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span>
                            {isEn
                              ? 'Allowlist is currently empty while "Selected Only" is active — all Endpoint HelpDesk checks will be blocked until at least one IP, CIDR, range, or hostname is added.'
                              : 'حالت «فقط موارد مجاز» فعال است اما لیست مجاز خالی است؛ تا زمانی که حداقل یک IP، ساب‌نت یا رنج اضافه نشود تمام اتصالات هلپ‌دسک مسدود خواهند بود.'}
                          </span>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          dir="ltr"
                          value={hdAllowedIpInput}
                          onChange={(e) => setHdAllowedIpInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              addHelpdeskListItems('allowedHelpdeskIps', hdAllowedIpInput);
                              setHdAllowedIpInput('');
                            }
                          }}
                          placeholder="e.g. 10.10.20.0/24, 192.168.1.10-192.168.1.50, 172.16.0.15, ws-fin-*"
                          className={`flex-1 px-3 py-1.5 rounded-lg border text-xs font-mono ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                              : 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            addHelpdeskListItems('allowedHelpdeskIps', hdAllowedIpInput);
                            setHdAllowedIpInput('');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Add' : 'افزودن'}</span>
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(draftPolicy.allowedHelpdeskIps || []).map((item, idx) => (
                          <span
                            key={`${item}-${idx}`}
                            dir="ltr"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono ${
                              isLightMode
                                ? 'bg-white border-teal-300 text-teal-800'
                                : 'bg-teal-500/15 border-teal-500/35 text-teal-200'
                            }`}
                          >
                            <span>{item}</span>
                            <button
                              type="button"
                              onClick={() => removeHelpdeskListItem('allowedHelpdeskIps', idx)}
                              className="hover:text-rose-500 cursor-pointer"
                              aria-label="Remove"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Blocked IPs / Subnets / Ranges (Always available) */}
                  <div
                    className={`p-3.5 rounded-xl border space-y-2.5 ${
                      isLightMode
                        ? 'bg-rose-50/50 border-rose-200'
                        : 'bg-rose-950/15 border-rose-500/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldBan className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span className={`text-xs font-bold ${isLightMode ? 'text-rose-900' : 'text-rose-200'}`}>
                          {isEn
                            ? 'Blocked IPs, Subnets (CIDR), IP Ranges & Hostnames (Leave empty for none)'
                            : 'آدرس‌های IP، ساب‌نت‌ها، رنج‌های IP و نام‌های سیستم مسدودشده (پیش‌فرض خالی)'}
                        </span>
                      </div>
                      {(draftPolicy.blockedHelpdeskIps || []).length > 0 && (
                        <button
                          type="button"
                          onClick={() => clearHelpdeskListField('blockedHelpdeskIps')}
                          className="text-[11px] font-semibold text-rose-500 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{isEn ? 'Clear All' : 'پاک کردن همه'}</span>
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        dir="ltr"
                        value={hdBlockedIpInput}
                        onChange={(e) => setHdBlockedIpInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            addHelpdeskListItems('blockedHelpdeskIps', hdBlockedIpInput);
                            setHdBlockedIpInput('');
                          }
                        }}
                        placeholder="e.g. 10.0.0.10, 192.168.99.0/24, 10.5.1.1-10.5.1.20, dc01*"
                        className={`flex-1 px-3 py-1.5 rounded-lg border text-xs font-mono ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                            : 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          addHelpdeskListItems('blockedHelpdeskIps', hdBlockedIpInput);
                          setHdBlockedIpInput('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Block' : 'مسدود کردن'}</span>
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(draftPolicy.blockedHelpdeskIps || []).length === 0 ? (
                        <span className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {isEn
                            ? 'Empty (no per-policy IP/range exclusions configured).'
                            : 'خالی (هیچ آدرس یا رنج مسدودی برای این پالیسی ثبت نشده است).'}
                        </span>
                      ) : (
                        (draftPolicy.blockedHelpdeskIps || []).map((item, idx) => (
                          <span
                            key={`${item}-${idx}`}
                            dir="ltr"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono ${
                              isLightMode
                                ? 'bg-white border-rose-300 text-rose-800'
                                : 'bg-rose-500/15 border-rose-500/35 text-rose-200'
                            }`}
                          >
                            <span>{item}</span>
                            <button
                              type="button"
                              onClick={() => removeHelpdeskListItem('blockedHelpdeskIps', idx)}
                              className="hover:text-rose-500 cursor-pointer"
                              aria-label="Remove"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* -------- Section 2: AD Groups, AD Users & Local Users (All 3 Pages) -------- */}
                <div
                  className={`p-4 rounded-xl border space-y-4 ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-500" />
                      <h4 className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                        {isEn
                          ? '2. Active Directory Groups, Domain Users & Local Accounts (All 3 HelpDesk Pages)'
                          : '۲. گروه‌ها و کاربران اکتیو دایرکتوری و حساب‌های لوکال (اعمال روی هر ۳ صفحه هلپ‌دسک)'}
                      </h4>
                      <FieldInfoTooltip
                        title={isEn ? 'AD Group, AD User & Local Account Rules' : 'قوانین گروه، کاربر دامین و کاربر محلی'}
                        whatIsIt={
                          isEn
                            ? 'Restricts which AD groups, AD user accounts, and local workstation accounts can be queried, inspected, unlocked, or managed across all 3 HelpDesk pages.'
                            : 'محدودسازی و مسدودسازی بررسی، مشاهده پروفایل، وضعیت گروه یا رفع قفل کاربران/گروه‌های اکتیو دایرکتوری و کاربران لوکال در هر ۳ صفحه هلپ‌دسک.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Protects Domain Admins, Executive OUs/groups, and service accounts from HelpDesk inspection or unlocks, or scopes support teams to support only specific departments/AD groups.'
                            : 'از دسترسی کارشناسان به اکانت مدیران، گروه‌های Domain Admins و کاربران حساس جلوگیری کرده یا هر کارشناس را فقط محدود به بررسی گروه‌های دامین مشخصی می‌کند.'
                        }
                        practicalExample="Sales_Users, Finance_Dept, j.doe, CORP\\helpdesk_vip, *"
                        isEn={isEn}
                        isLightMode={Boolean(isLightMode)}
                      />
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 font-semibold">
                      {draftPolicy.targetHelpdeskAdScope === 'selected'
                        ? `${isEn ? 'AD Allowlist' : 'AD فقط مجاز'}: ${(draftPolicy.allowedHelpdeskAdGroups || []).length}G / ${(draftPolicy.allowedHelpdeskAdUsers || []).length}U`
                        : isEn
                        ? 'AD Scope: All Permitted'
                        : 'دامنه AD: همه مجاز'}
                    </span>
                  </div>

                  {/* AD Allowlist Mode Radio */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition select-none ${
                        (draftPolicy.targetHelpdeskAdScope || 'all') === 'all'
                          ? isLightMode
                            ? 'bg-indigo-50 border-indigo-300 shadow-xs'
                            : 'bg-indigo-500/10 border-indigo-500/40 text-white'
                          : isLightMode
                          ? 'bg-slate-50 border-slate-200 hover:border-slate-300'
                          : 'bg-white/5 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <input
                        type="radio"
                        name="targetHelpdeskAdScope"
                        checked={(draftPolicy.targetHelpdeskAdScope || 'all') === 'all'}
                        onChange={() =>
                          setDraftPolicy({ ...draftPolicy, targetHelpdeskAdScope: 'all' })
                        }
                        className="mt-0.5 accent-indigo-500"
                      />
                      <div>
                        <div className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                          {isEn ? 'All AD Groups & Users Allowed (Default)' : 'همه گروه‌ها و کاربران AD مجاز (پیش‌فرض)'}
                        </div>
                        <div className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                          {isEn
                            ? 'Operators can check any AD user/group or endpoint unless explicitly listed in Blocked rules.'
                            : 'تمام کاربران و گروه‌های دامین قابل بررسی هستند مگر مواردی که در لیست مسدود زیر یا استثنائات سراسری ثبت شوند.'}
                        </div>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition select-none ${
                        draftPolicy.targetHelpdeskAdScope === 'selected'
                          ? isLightMode
                            ? 'bg-teal-50 border-teal-300 shadow-xs'
                            : 'bg-teal-500/10 border-teal-500/40 text-white'
                          : isLightMode
                          ? 'bg-slate-50 border-slate-200 hover:border-slate-300'
                          : 'bg-white/5 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <input
                        type="radio"
                        name="targetHelpdeskAdScope"
                        checked={draftPolicy.targetHelpdeskAdScope === 'selected'}
                        onChange={() =>
                          setDraftPolicy({ ...draftPolicy, targetHelpdeskAdScope: 'selected' })
                        }
                        className="mt-0.5 accent-teal-500"
                      />
                      <div>
                        <div className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                          {isEn ? 'Only Specified AD Groups / AD Users' : 'فقط گروه‌ها و کاربران AD مشخص‌شده'}
                        </div>
                        <div className={`text-[10px] mt-0.5 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                          {isEn
                            ? 'Across all 3 HelpDesk pages, operators can only inspect users/endpoints/groups matching the allowlists below.'
                            : 'در هر ۳ صفحه هلپ‌دسک، کارشناس فقط امکان بررسی گروه‌ها، کاربران یا سیستم‌های متعلق به لیست مجاز زیر را دارد.'}
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Quick AD Catalog Picker Search (shows synced AD groups/users for 1-click adding!) */}
                  {(effectiveAdConfig.syncedGroups.length > 0 || effectiveAdConfig.syncedUsers.length > 0) && (
                    <div
                      className={`p-3 rounded-xl border space-y-2 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-200'
                          : 'bg-slate-900/70 border-slate-800'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`text-[11px] font-semibold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                          {isEn
                            ? 'Quick Pick from Synced Active Directory Catalog:'
                            : 'انتخاب سریع از فهرست همگام‌شده اکتیو دایرکتوری:'}
                        </span>
                        <div className="relative w-full sm:w-64">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 rtl:left-auto rtl:right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={hdCatalogSearch}
                            onChange={(e) => setHdCatalogSearch(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                              }
                            }}
                            placeholder={isEn ? 'Filter synced AD groups/users...' : 'فیلتر گروه یا کاربر AD...'}
                            className={`w-full pl-8 pr-3 rtl:pl-3 rtl:pr-8 py-1 rounded-lg border text-xs ${
                              isLightMode
                                ? 'bg-white border-slate-300 text-slate-900'
                                : 'bg-slate-950 border-slate-700 text-slate-100'
                            }`}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-36 overflow-y-auto">
                        {/* Quick AD Groups */}
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {isEn ? 'AD Groups (Click to Block / Allow)' : 'گروه‌های AD (کلیک برای افزودن)'}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {effectiveAdConfig.syncedGroups
                              .filter((g) => {
                                const q = hdCatalogSearch.trim().toLowerCase();
                                if (!q) return true;
                                return (
                                  String(g.cn || '').toLowerCase().includes(q) ||
                                  String(g.sAMAccountName || '').toLowerCase().includes(q)
                                );
                              })
                              .slice(0, 18)
                              .map((g, idx) => {
                                const gName = g.cn || g.sAMAccountName || g.displayName || '';
                                if (!gName) return null;
                                return (
                                  <div
                                    key={`hd-qgrp-${idx}-${gName}`}
                                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${
                                      isLightMode
                                        ? 'bg-white border-slate-200 text-slate-800'
                                        : 'bg-slate-950 border-slate-700 text-slate-200'
                                    }`}
                                  >
                                    <span className="font-medium truncate max-w-[130px]">{gName}</span>
                                    {draftPolicy.targetHelpdeskAdScope === 'selected' && (
                                      <button
                                        type="button"
                                        onClick={() => addHelpdeskListItems('allowedHelpdeskAdGroups', gName)}
                                        className="px-1 rounded bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 font-bold cursor-pointer"
                                        title={isEn ? 'Add to Allowed Groups' : 'افزودن به گروه‌های مجاز'}
                                      >
                                        +{isEn ? 'Allow' : 'مجاز'}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => addHelpdeskListItems('blockedHelpdeskAdGroups', gName)}
                                      className="px-1 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 font-bold cursor-pointer"
                                      title={isEn ? 'Add to Blocked Groups' : 'افزودن به گروه‌های مسدود'}
                                    >
                                      {isEn ? 'Block' : 'مسدود'}
                                    </button>
                                  </div>
                                );
                              })}
                          </div>
                        </div>

                        {/* Quick AD Users */}
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {isEn ? 'AD Users (Click to Block / Allow)' : 'کاربران AD (کلیک برای افزودن)'}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {effectiveAdConfig.syncedUsers
                              .filter((u) => {
                                const q = hdCatalogSearch.trim().toLowerCase();
                                if (!q) return true;
                                return (
                                  String(u.samAccountName || '').toLowerCase().includes(q) ||
                                  String(u.displayName || '').toLowerCase().includes(q)
                                );
                              })
                              .slice(0, 18)
                              .map((u, idx) => {
                                const uName = u.samAccountName || u.userPrincipalName || u.displayName || '';
                                if (!uName) return null;
                                return (
                                  <div
                                    key={`hd-qusr-${idx}-${uName}`}
                                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${
                                      isLightMode
                                        ? 'bg-white border-slate-200 text-slate-800'
                                        : 'bg-slate-950 border-slate-700 text-slate-200'
                                    }`}
                                  >
                                    <span className="font-mono truncate max-w-[130px]">{uName}</span>
                                    {draftPolicy.targetHelpdeskAdScope === 'selected' && (
                                      <button
                                        type="button"
                                        onClick={() => addHelpdeskListItems('allowedHelpdeskAdUsers', uName)}
                                        className="px-1 rounded bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 font-bold cursor-pointer"
                                        title={isEn ? 'Add to Allowed Users' : 'افزودن به کاربران مجاز'}
                                      >
                                        +{isEn ? 'Allow' : 'مجاز'}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => addHelpdeskListItems('blockedHelpdeskAdUsers', uName)}
                                      className="px-1 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 font-bold cursor-pointer"
                                      title={isEn ? 'Add to Blocked Users' : 'افزودن به کاربران مسدود'}
                                    >
                                      {isEn ? 'Block' : 'مسدود'}
                                    </button>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Permitted AD Groups & AD Users (shown when targetHelpdeskAdScope === 'selected') */}
                  {draftPolicy.targetHelpdeskAdScope === 'selected' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Allowed AD Groups */}
                      <div
                        className={`p-3.5 rounded-xl border space-y-2.5 ${
                          isLightMode
                            ? 'bg-teal-50/50 border-teal-200'
                            : 'bg-teal-950/20 border-teal-500/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold ${isLightMode ? 'text-teal-900' : 'text-teal-200'}`}>
                            {isEn ? 'Permitted AD Security Groups' : 'گروه‌های اکتیو دایرکتوری مجاز'}
                          </span>
                          {(draftPolicy.allowedHelpdeskAdGroups || []).length > 0 && (
                            <button
                              type="button"
                              onClick={() => clearHelpdeskListField('allowedHelpdeskAdGroups')}
                              className="text-[11px] font-semibold text-rose-500 hover:underline cursor-pointer"
                            >
                              {isEn ? 'Clear' : 'پاک کردن'}
                            </button>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={hdAllowedGroupInput}
                            onChange={(e) => setHdAllowedGroupInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                addHelpdeskListItems('allowedHelpdeskAdGroups', hdAllowedGroupInput);
                                setHdAllowedGroupInput('');
                              }
                            }}
                            placeholder={isEn ? 'e.g. Sales_Team, Branch1_Users, IT-*' : 'مثال: Sales_Team, Branch1_Users'}
                            className={`flex-1 px-3 py-1.5 rounded-lg border text-xs ${
                              isLightMode
                                ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                                : 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              addHelpdeskListItems('allowedHelpdeskAdGroups', hdAllowedGroupInput);
                              setHdAllowedGroupInput('');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer shrink-0"
                          >
                            {isEn ? 'Add' : 'افزودن'}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(draftPolicy.allowedHelpdeskAdGroups || []).map((item, idx) => (
                            <span
                              key={`${item}-${idx}`}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${
                                isLightMode
                                  ? 'bg-white border-teal-300 text-teal-800'
                                  : 'bg-teal-500/15 border-teal-500/35 text-teal-200'
                              }`}
                            >
                              <span>{item}</span>
                              <button
                                type="button"
                                onClick={() => removeHelpdeskListItem('allowedHelpdeskAdGroups', idx)}
                                className="hover:text-rose-500 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Allowed AD Users */}
                      <div
                        className={`p-3.5 rounded-xl border space-y-2.5 ${
                          isLightMode
                            ? 'bg-teal-50/50 border-teal-200'
                            : 'bg-teal-950/20 border-teal-500/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold ${isLightMode ? 'text-teal-900' : 'text-teal-200'}`}>
                            {isEn ? 'Permitted Individual AD Users' : 'کاربران اکتیو دایرکتوری مجاز (اختیاری)'}
                          </span>
                          {(draftPolicy.allowedHelpdeskAdUsers || []).length > 0 && (
                            <button
                              type="button"
                              onClick={() => clearHelpdeskListField('allowedHelpdeskAdUsers')}
                              className="text-[11px] font-semibold text-rose-500 hover:underline cursor-pointer"
                            >
                              {isEn ? 'Clear' : 'پاک کردن'}
                            </button>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            dir="ltr"
                            value={hdAllowedUserInput}
                            onChange={(e) => setHdAllowedUserInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                addHelpdeskListItems('allowedHelpdeskAdUsers', hdAllowedUserInput);
                                setHdAllowedUserInput('');
                              }
                            }}
                            placeholder="e.g. a.rezaei, CORP\\helpdesk_test, branch-*"
                            className={`flex-1 px-3 py-1.5 rounded-lg border text-xs font-mono ${
                              isLightMode
                                ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                                : 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              addHelpdeskListItems('allowedHelpdeskAdUsers', hdAllowedUserInput);
                              setHdAllowedUserInput('');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer shrink-0"
                          >
                            {isEn ? 'Add' : 'افزودن'}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(draftPolicy.allowedHelpdeskAdUsers || []).map((item, idx) => (
                            <span
                              key={`${item}-${idx}`}
                              dir="ltr"
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono ${
                                isLightMode
                                  ? 'bg-white border-teal-300 text-teal-800'
                                  : 'bg-teal-500/15 border-teal-500/35 text-teal-200'
                              }`}
                            >
                              <span>{item}</span>
                              <button
                                type="button"
                                onClick={() => removeHelpdeskListItem('allowedHelpdeskAdUsers', idx)}
                                className="hover:text-rose-500 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Blocked AD Groups, AD Users & Local Accounts */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {/* Blocked AD Groups */}
                    <div
                      className={`p-3.5 rounded-xl border space-y-2.5 ${
                        isLightMode
                          ? 'bg-rose-50/40 border-rose-200'
                          : 'bg-rose-950/15 border-rose-500/25'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-rose-900' : 'text-rose-200'}`}>
                          <Users className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span>{isEn ? 'Blocked AD Groups' : 'گروه‌های AD مسدودشده'}</span>
                        </span>
                        {(draftPolicy.blockedHelpdeskAdGroups || []).length > 0 && (
                          <button
                            type="button"
                            onClick={() => clearHelpdeskListField('blockedHelpdeskAdGroups')}
                            className="text-[11px] font-semibold text-rose-500 hover:underline cursor-pointer"
                          >
                            {isEn ? 'Clear' : 'پاک'}
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={hdBlockedGroupInput}
                          onChange={(e) => setHdBlockedGroupInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              addHelpdeskListItems('blockedHelpdeskAdGroups', hdBlockedGroupInput);
                              setHdBlockedGroupInput('');
                            }
                          }}
                          placeholder="e.g. Domain Admins, VIP_Board"
                          className={`flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border text-xs ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-900'
                              : 'bg-slate-950 border-slate-700 text-white'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            addHelpdeskListItems('blockedHelpdeskAdGroups', hdBlockedGroupInput);
                            setHdBlockedGroupInput('');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(draftPolicy.blockedHelpdeskAdGroups || []).length === 0 ? (
                          <span className={`text-[10px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Empty' : 'خالی'}
                          </span>
                        ) : (
                          (draftPolicy.blockedHelpdeskAdGroups || []).map((item, idx) => (
                            <span
                              key={`${item}-${idx}`}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${
                                isLightMode
                                  ? 'bg-white border-rose-300 text-rose-800'
                                  : 'bg-rose-500/15 border-rose-500/35 text-rose-200'
                              }`}
                            >
                              <span>{item}</span>
                              <button
                                type="button"
                                onClick={() => removeHelpdeskListItem('blockedHelpdeskAdGroups', idx)}
                                className="hover:text-rose-500 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Blocked AD Users */}
                    <div
                      className={`p-3.5 rounded-xl border space-y-2.5 ${
                        isLightMode
                          ? 'bg-rose-50/40 border-rose-200'
                          : 'bg-rose-950/15 border-rose-500/25'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-rose-900' : 'text-rose-200'}`}>
                          <UserX className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span>{isEn ? 'Blocked AD Users' : 'کاربران AD مسدودشده'}</span>
                        </span>
                        {(draftPolicy.blockedHelpdeskAdUsers || []).length > 0 && (
                          <button
                            type="button"
                            onClick={() => clearHelpdeskListField('blockedHelpdeskAdUsers')}
                            className="text-[11px] font-semibold text-rose-500 hover:underline cursor-pointer"
                          >
                            {isEn ? 'Clear' : 'پاک'}
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          dir="ltr"
                          value={hdBlockedUserInput}
                          onChange={(e) => setHdBlockedUserInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              addHelpdeskListItems('blockedHelpdeskAdUsers', hdBlockedUserInput);
                              setHdBlockedUserInput('');
                            }
                          }}
                          placeholder="e.g. ceo.user, CORP\\admin_*"
                          className={`flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-900'
                              : 'bg-slate-950 border-slate-700 text-white'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            addHelpdeskListItems('blockedHelpdeskAdUsers', hdBlockedUserInput);
                            setHdBlockedUserInput('');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(draftPolicy.blockedHelpdeskAdUsers || []).length === 0 ? (
                          <span className={`text-[10px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Empty' : 'خالی'}
                          </span>
                        ) : (
                          (draftPolicy.blockedHelpdeskAdUsers || []).map((item, idx) => (
                            <span
                              key={`${item}-${idx}`}
                              dir="ltr"
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-mono ${
                                isLightMode
                                  ? 'bg-white border-rose-300 text-rose-800'
                                  : 'bg-rose-500/15 border-rose-500/35 text-rose-200'
                              }`}
                            >
                              <span>{item}</span>
                              <button
                                type="button"
                                onClick={() => removeHelpdeskListItem('blockedHelpdeskAdUsers', idx)}
                                className="hover:text-rose-500 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Blocked Local Users */}
                    <div
                      className={`p-3.5 rounded-xl border space-y-2.5 ${
                        isLightMode
                          ? 'bg-amber-50/50 border-amber-200'
                          : 'bg-amber-950/15 border-amber-500/25'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-amber-900' : 'text-amber-200'}`}>
                          <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span>{isEn ? 'Blocked Local Users' : 'کاربران لوکال مسدودشده'}</span>
                        </span>
                        {(draftPolicy.blockedHelpdeskLocalUsers || []).length > 0 && (
                          <button
                            type="button"
                            onClick={() => clearHelpdeskListField('blockedHelpdeskLocalUsers')}
                            className="text-[11px] font-semibold text-rose-500 hover:underline cursor-pointer"
                          >
                            {isEn ? 'Clear' : 'پاک'}
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          dir="ltr"
                          value={hdBlockedLocalUserInput}
                          onChange={(e) => setHdBlockedLocalUserInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              addHelpdeskListItems('blockedHelpdeskLocalUsers', hdBlockedLocalUserInput);
                              setHdBlockedLocalUserInput('');
                            }
                          }}
                          placeholder="e.g. ceo_local, LocalSecAdmin"
                          className={`flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-900'
                              : 'bg-slate-950 border-slate-700 text-white'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            addHelpdeskListItems('blockedHelpdeskLocalUsers', hdBlockedLocalUserInput);
                            setHdBlockedLocalUserInput('');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(draftPolicy.blockedHelpdeskLocalUsers || []).length === 0 ? (
                          <span className={`text-[10px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Empty' : 'خالی'}
                          </span>
                        ) : (
                          (draftPolicy.blockedHelpdeskLocalUsers || []).map((item, idx) => (
                            <span
                              key={`${item}-${idx}`}
                              dir="ltr"
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-mono ${
                                isLightMode
                                  ? 'bg-white border-amber-300 text-amber-900'
                                  : 'bg-amber-500/15 border-amber-500/35 text-amber-200'
                              }`}
                            >
                              <span>{item}</span>
                              <button
                                type="button"
                                onClick={() => removeHelpdeskListItem('blockedHelpdeskLocalUsers', idx)}
                                className="hover:text-rose-500 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* -------- Section 3: Organization-Wide Global Blocklist Manager (HelpdeskExceptionsModal) -------- */}
                <div
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-slate-950/70 border-white/10'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-xl border shrink-0 ${
                        isLightMode
                          ? 'bg-rose-50 border-rose-200 text-rose-600'
                          : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                      }`}
                    >
                      <ShieldBan className="w-4 h-4" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                          {isEn
                            ? 'Organization-Wide Global HelpDesk Exceptions & Blocklist'
                            : 'فهرست سراسری استثنائات و مسدودسازی هلپ‌دسک (برای تمام پالیسی‌ها)'}
                        </h4>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                            globalExceptionsCount > 0
                              ? isLightMode
                                ? 'bg-rose-50 border-rose-200 text-rose-700'
                                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-200 text-slate-600'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          {isEn
                            ? `${globalExceptionsCount} active global rule(s)`
                            : `${globalExceptionsCount} قانون سراسری فعال`}
                        </span>
                      </div>
                      <p className={`text-[11px] ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                        {isEn
                          ? 'Rules managed here apply organization-wide across all HelpDesk sessions and are hidden from technicians on Endpoint HelpDesk.'
                          : 'قوانین این بخش به صورت سراسری در کل سازمان و برای تمام نشست‌های هلپ‌دسک اعمال می‌شوند و در صفحه کاربران/تکنسین‌ها نمایش داده نمی‌شوند.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      undockModal('modal-helpdesk-exceptions');
                      setIsExceptionsModalOpen(true);
                    }}
                    className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                      isLightMode
                        ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-700 shadow-xs'
                        : 'bg-rose-600/85 hover:bg-rose-500 text-white border-rose-400/30 shadow-sm'
                    }`}
                  >
                    <ShieldBan className="w-3.5 h-3.5" />
                    <span>
                      {isEn ? 'Manage Global Exceptions' : 'مدیریت استثنائات سراسری'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 7: Multi-Stage Approval Workflow Chain Builder                        */}
            {/* ========================================================================= */}
            {activeTab === 'approvals' && (
              <div className="space-y-4 animate-fadeIn">
                <ApprovalChainBuilder
                  stages={draftPolicy.approvalWorkflowStages || []}
                  onChange={(stages) =>
                    setDraftPolicy((prev) =>
                      prev ? { ...prev, approvalWorkflowStages: stages } : prev
                    )
                  }
                  requireApprovalCount={approvalCounts.totalCount}
                  isEn={isEn}
                  isLightMode={Boolean(isLightMode)}
                  liveLocalUsers={liveLocalUsers}
                  liveLocalGroups={liveLocalGroups}
                  liveAdConfig={liveAdConfig}
                  currentPolicy={draftPolicy}
                />
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
                {isEn
                  ? tabsConfig.find((t) => t.id === activeTab)?.labelEn
                  : tabsConfig.find((t) => t.id === activeTab)?.labelFa}
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
    </div>

      {/* Sub-Modal 1: Copy Permissions From Device */}
      {copyTargetDevId !== null && (
        <div
          className="fixed top-0 left-0 right-0 bottom-8 z-[999995] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
          dir={isEn ? 'ltr' : 'rtl'}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setCopyTargetDevId(null);
              setCopySourceSearch('');
            }
          }}
        >
          <div
            className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scaleIn ${
              isLightMode
                ? 'bg-white border-slate-200 text-slate-800'
                : 'bg-slate-900 border-white/15 text-white'
            }`}
          >
            {/* Header */}
            <div
              className={`p-4 border-b flex items-center justify-between gap-3 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-white/10'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
                  <Copy className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    {copyTargetDevId === 'BATCH'
                      ? isEn
                        ? `Clone Permissions to ${selectedDeviceIds.size} Selected Devices`
                        : `کپی و شبیه‌سازی دسترسی‌ها به ${selectedDeviceIds.size} تجهیز انتخاب شده`
                      : isEn
                      ? `Clone Permissions to "${devices.find((d) => d.id === copyTargetDevId)?.name || copyTargetDevId}"`
                      : `کپی و شبیه‌سازی دسترسی‌ها به "${devices.find((d) => d.id === copyTargetDevId)?.name || copyTargetDevId}"`}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isEn
                      ? 'Select any device below to mirror its exact permission overrides.'
                      : 'یک تجهیز مبدأ را انتخاب کنید تا کلیه دسترسی‌های آن کپی و اعمال شود.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCopyTargetDevId(null);
                  setCopySourceSearch('');
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="p-3 border-b border-white/10">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={copySourceSearch}
                  onChange={(e) => setCopySourceSearch(e.target.value)}
                  placeholder={
                    isEn
                      ? 'Search source devices by name, IP, platform...'
                      : 'جستجوی تجهیز مبدأ بر اساس نام، IP یا پلتفرم...'
                  }
                  className={`w-full pl-8 pr-8 py-2 rounded-xl text-xs border transition ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                      : 'bg-slate-950 border-white/15 text-white focus:border-cyan-500/50'
                  }`}
                  autoFocus
                />
              </div>
            </div>

            {/* Source Devices List */}
            <div className="p-3 overflow-y-auto space-y-2 flex-1 max-h-80">
              {permittedDevices
                .filter(
                  (d) =>
                    (copyTargetDevId === 'BATCH' || d.id !== copyTargetDevId) &&
                    (!copySourceSearch.trim() ||
                      d.name?.toLowerCase().includes(copySourceSearch.toLowerCase()) ||
                      d.ip?.toLowerCase().includes(copySourceSearch.toLowerCase()) ||
                      d.platform?.toLowerCase().includes(copySourceSearch.toLowerCase()))
                )
                .map((srcDev) => {
                  const hasCustom = Boolean(
                    (draftPolicy?.perDevicePermissions?.[srcDev.id] &&
                      Object.keys(draftPolicy.perDevicePermissions[srcDev.id]).length > 0) ||
                      (draftPolicy?.perDeviceApprovalRules?.[srcDev.id] &&
                        Object.keys(draftPolicy.perDeviceApprovalRules[srcDev.id]).length > 0)
                  );
                  const allowedCount = hasCustom
                    ? Object.values(draftPolicy!.perDevicePermissions?.[srcDev.id] || {}).filter(Boolean).length
                    : Object.values(draftPolicy?.defaultDevicePermissions || {}).filter(Boolean).length;

                  return (
                    <div
                      key={srcDev.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition ${
                        isLightMode
                          ? 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                          : 'bg-slate-950/60 hover:bg-white/5 border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <HardDrive className="w-4 h-4 text-cyan-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs truncate">{srcDev.name}</span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {srcDev.ip}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                              {srcDev.platform || srcDev.type}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                                hasCustom
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              {hasCustom
                                ? isEn
                                  ? `Custom (${allowedCount} allowed)`
                                  : `دارای استثنا (${allowedCount} مجوز)`
                                : isEn
                                ? `Inherits Policy (${allowedCount} allowed)`
                                : `پیروی از پالیسی (${allowedCount} مجوز)`}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopyFromDevice(srcDev.id, copyTargetDevId)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 transition shadow-sm cursor-pointer shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Copy From This' : 'کپی از این تجهیز'}</span>
                      </button>
                    </div>
                  );
                })}

              {permittedDevices.filter(
                (d) =>
                  (copyTargetDevId === 'BATCH' || d.id !== copyTargetDevId) &&
                  (!copySourceSearch.trim() ||
                    d.name?.toLowerCase().includes(copySourceSearch.toLowerCase()) ||
                    d.ip?.toLowerCase().includes(copySourceSearch.toLowerCase()) ||
                    d.platform?.toLowerCase().includes(copySourceSearch.toLowerCase()))
              ).length === 0 && (
                <div className="p-6 text-center text-xs text-slate-400">
                  {isEn
                    ? 'No matching source devices found.'
                    : 'هیچ تجهیز مبدأ مطابق با جستجو یافت نشد.'}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className={`p-3 border-t flex items-center justify-end ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-white/10'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setCopyTargetDevId(null);
                  setCopySourceSearch('');
                }}
                className={`px-4 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                  isLightMode
                    ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                {isEn ? 'Close' : 'بستن'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Modal 2: Save As Custom Template */}
      {saveTemplateDevId !== null && (
        <div
          className="fixed top-0 left-0 right-0 bottom-8 z-[999995] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
          dir={isEn ? 'ltr' : 'rtl'}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSaveTemplateDevId(null);
              setTemplateNameInput('');
            }
          }}
        >
          <div
            className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden flex flex-col animate-scaleIn ${
              isLightMode
                ? 'bg-white border-slate-200 text-slate-800'
                : 'bg-slate-900 border-white/15 text-white'
            }`}
          >
            {/* Header */}
            <div
              className={`p-4 border-b flex items-center justify-between gap-3 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-white/10'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
                  <BookmarkPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    {isEn ? 'Save as Reusable Template' : 'ذخیره به عنوان الگوی آماده'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isEn
                      ? 'Save this device’s permissions so you can assign them to other devices.'
                      : 'تنظیمات این تجهیز را ذخیره کنید تا به سادگی به سایر تجهیزات اختصاص دهید.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSaveTemplateDevId(null);
                  setTemplateNameInput('');
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-400">
                  {isEn ? 'Template Name' : 'نام الگو'}
                </label>
                <input
                  type="text"
                  value={templateNameInput}
                  onChange={(e) => setTemplateNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && templateNameInput.trim()) {
                      e.preventDefault();
                      handleSaveCustomTemplate(saveTemplateDevId, templateNameInput);
                    }
                  }}
                  placeholder={
                    isEn
                      ? 'e.g., Access Switch Standard, Branch Gateway...'
                      : 'مثال: استاندارد سوئیچ‌های اکسس، گیت‌وی شعب...'
                  }
                  className={`w-full px-3 py-2 rounded-xl text-xs border transition ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                      : 'bg-slate-950 border-white/15 text-white focus:border-purple-500/50'
                  }`}
                  autoFocus
                />
              </div>

              <div
                className={`p-2.5 rounded-xl border text-[11px] space-y-1 ${
                  isLightMode
                    ? 'bg-slate-100 border-slate-200 text-slate-600'
                    : 'bg-slate-950/60 border-white/10 text-slate-400'
                }`}
              >
                <div className="font-semibold text-slate-300">
                  {isEn ? 'Source Device Snapshot:' : 'مشخصات تجهیز مبدأ:'}
                </div>
                <div>
                  {devices.find((d) => d.id === saveTemplateDevId)?.name} (
                  {devices.find((d) => d.id === saveTemplateDevId)?.ip})
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              className={`p-3 border-t flex items-center justify-end gap-2 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-white/10'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setSaveTemplateDevId(null);
                  setTemplateNameInput('');
                }}
                className={`px-4 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                  isLightMode
                    ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="button"
                onClick={() =>
                  handleSaveCustomTemplate(saveTemplateDevId, templateNameInput)
                }
                disabled={!templateNameInput.trim()}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>{isEn ? 'Save Template' : 'ذخیره الگو'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nested Organization-Wide HelpDesk Exceptions Manager (Admin Access Policy Portal) */}
      <HelpdeskExceptionsModal
        isOpen={isExceptionsModalOpen}
        onClose={() => {
          undockModal('modal-helpdesk-exceptions');
          setIsExceptionsModalOpen(false);
        }}
        onMinimize={handleMinimizeExceptionsModal}
        isLightMode={Boolean(isLightMode)}
        isEn={isEn}
        canManage={canManageGlobalExceptions}
        overlayZIndexClass="z-[99995]"
        onRulesChanged={(updatedRules: HelpdeskExceptionRule[]) => {
          setGlobalExceptionsCount(updatedRules.filter((r) => r.enabled).length);
        }}
      />
    </>,
    document.body
  );
};
