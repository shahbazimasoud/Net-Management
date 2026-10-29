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
  isDeviceActionPermitted,
} from '../../utils/rbac';
import { fetchActiveDirectoryConfig } from '../../services/api';

export type PolicyModalTab =
  | 'identity'
  | 'navigation'
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
        draftPolicy?.perServerPermissions?.[s.id] &&
          Object.keys(draftPolicy.perServerPermissions[s.id]).length > 0
      );
      if (serverOverrideFilter === 'custom_only') return hasCustom;
      if (serverOverrideFilter === 'default_only') return !hasCustom;
      return true;
    });
  }, [draftPolicy?.targetScope, draftPolicy?.perServerPermissions, permittedServers, allAvailableServers, serverScopeSearch, serverOverrideFilter]);

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
          add_device: false,
        },
        perDevicePermissions: initialPolicy.perDevicePermissions || {},
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
    }
  }, [isOpen, initialPolicy]);

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
        draftPolicy.perDevicePermissions?.[d.id] &&
          Object.keys(draftPolicy.perDevicePermissions[d.id]).length > 0
      );
      if (matrixDeviceFilter === 'custom_only') return hasCustom;
      if (matrixDeviceFilter === 'default_only') return !hasCustom;
      return true;
    });
  }, [permittedDevices, matrixDeviceSearch, matrixDeviceFilter, draftPolicy]);

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
      canAddDevice: enabled,
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

  const applyTemplateToDevice = useCallback(
    (devId: string, tmplPerms: Record<string, boolean>, tmplName: string) => {
      setDraftPolicy((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          perDevicePermissions: {
            ...(prev.perDevicePermissions || {}),
            [devId]: { ...tmplPerms },
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
    [isEn, showToast]
  );

  const applyTemplateToBatch = useCallback(
    (tmplPerms: Record<string, boolean>, tmplName: string) => {
      if (selectedDeviceIds.size === 0) return;
      setDraftPolicy((prev) => {
        if (!prev) return prev;
        const nextPerDev = { ...(prev.perDevicePermissions || {}) };
        selectedDeviceIds.forEach((id) => {
          nextPerDev[id] = { ...tmplPerms };
        });
        return {
          ...prev,
          perDevicePermissions: nextPerDev,
        };
      });
      setIsBatchTemplateMenuOpen(false);
      showToast(
        isEn
          ? `Template "${tmplName}" applied to ${selectedDeviceIds.size} devices.`
          : `الگوی "${tmplName}" بر روی ${selectedDeviceIds.size} تجهیز اعمال شد.`
      );
    },
    [selectedDeviceIds, isEn, showToast]
  );

  const handleCopyFromDevice = useCallback(
    (sourceDevId: string, targetDevIdOrBatch: string) => {
      if (!draftPolicy) return;
      const sourceDev = devices.find((d) => d.id === sourceDevId);
      const sourcePerms =
        draftPolicy.perDevicePermissions?.[sourceDevId] ||
        draftPolicy.defaultDevicePermissions ||
        {};

      if (targetDevIdOrBatch === 'BATCH') {
        if (selectedDeviceIds.size === 0) return;
        setDraftPolicy((prev) => {
          if (!prev) return prev;
          const nextPerDev = { ...(prev.perDevicePermissions || {}) };
          selectedDeviceIds.forEach((id) => {
            nextPerDev[id] = { ...sourcePerms };
          });
          return {
            ...prev,
            perDevicePermissions: nextPerDev,
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
      DEVICE_ACTIONS_CATALOG.forEach((a) => {
        denyAll[a.key] = false;
      });
      setDraftPolicy((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          perDevicePermissions: {
            ...(prev.perDevicePermissions || {}),
            [devId]: denyAll,
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
    DEVICE_ACTIONS_CATALOG.forEach((a) => {
      denyAll[a.key] = false;
    });
    setDraftPolicy((prev) => {
      if (!prev) return prev;
      const nextPerDev = { ...(prev.perDevicePermissions || {}) };
      selectedDeviceIds.forEach((id) => {
        nextPerDev[id] = { ...denyAll };
      });
      return {
        ...prev,
        perDevicePermissions: nextPerDev,
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
        delete nextPerDev[devId];
        return {
          ...prev,
          perDevicePermissions: nextPerDev,
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
      selectedDeviceIds.forEach((id) => {
        delete nextPerDev[id];
      });
      return {
        ...prev,
        perDevicePermissions: nextPerDev,
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
      const sourcePerms =
        draftPolicy.perDevicePermissions?.[sourceDevId] ||
        draftPolicy.defaultDevicePermissions ||
        {};
      const newTmpl = {
        id: `custom_${Date.now()}`,
        nameEn: name.trim(),
        nameFa: name.trim(),
        permissions: { ...sourcePerms },
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
    [draftPolicy, customTemplates, isEn, showToast]
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
                        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-black/20 border border-white/10">
                          <button
                            type="button"
                            onClick={() => setServerOverrideFilter('all')}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                              serverOverrideFilter === 'all'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
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
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {isEn ? 'Custom Overrides' : 'دارای استثنا'} (
                            {Object.keys(draftPolicy.perServerPermissions || {}).length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setServerOverrideFilter('default_only')}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                              serverOverrideFilter === 'default_only'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
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
                            draftPolicy.perServerPermissions?.[server.id] &&
                              Object.keys(draftPolicy.perServerPermissions[server.id]).length > 0
                          );
                          const srvPerms = draftPolicy.perServerPermissions?.[server.id] || {};
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
                                        onClick={() => {
                                          const next = { ...(draftPolicy.perServerPermissions || {}) };
                                          delete next[server.id];
                                          setDraftPolicy({
                                            ...draftPolicy,
                                            perServerPermissions: next,
                                          });
                                        }}
                                        className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition cursor-pointer flex items-center gap-1"
                                        title={isEn ? 'Reset to General Server Actions' : 'ریست به دسترسی‌های پیش‌فرض عمومی'}
                                      >
                                        <RotateCcw className="w-2.5 h-2.5" />
                                        <span>{isEn ? 'Reset' : 'ریست'}</span>
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-[10px] px-2 py-0.5 rounded-md text-slate-400 font-medium border border-white/5 bg-white/5">
                                      {isEn ? 'Inherits General Actions' : 'پیروی از دسترسی‌های عمومی'}
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => setExpandedServerOverrideId(isExpanded ? null : server.id)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                                      isExpanded
                                        ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-xs'
                                        : isLightMode
                                        ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                        : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
                                    }`}
                                  >
                                    <Sliders className="w-3 h-3 text-amber-400" />
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
                                    isLightMode ? 'bg-white/80 border-slate-200' : 'bg-black/25 border-white/10'
                                  }`}
                                >
                                  {/* Drawer Subheader with Quick Toggles */}
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                      <Sliders className="w-3.5 h-3.5 text-amber-400" />
                                      <span className="text-xs font-bold text-amber-300">
                                        {isEn
                                          ? `Granular Overrides for ${server.name}:`
                                          : `استثنائات تفکیکی برای سرور ${server.name}:`}
                                      </span>
                                      <span className="text-[10px] text-slate-400 hidden sm:inline">
                                        {isEn
                                          ? '(Toggling an action overrides general policy for this specific server)'
                                          : '(تغییر هر دسترسی، پالیسی عمومی را برای این سرور خاص بازنویسی می‌کند)'}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const allTrue: Record<string, boolean> = {};
                                          SERVER_ACTIONS_CATALOG.forEach((a) => {
                                            allTrue[a.key] = true;
                                          });
                                          setDraftPolicy({
                                            ...draftPolicy,
                                            perServerPermissions: {
                                              ...(draftPolicy.perServerPermissions || {}),
                                              [server.id]: allTrue as any,
                                            },
                                          });
                                        }}
                                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition cursor-pointer flex items-center gap-1"
                                      >
                                        <CheckSquare className="w-2.5 h-2.5" />
                                        <span>{isEn ? 'Allow All' : 'مجاز همه'}</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const allFalse: Record<string, boolean> = {};
                                          SERVER_ACTIONS_CATALOG.forEach((a) => {
                                            allFalse[a.key] = false;
                                          });
                                          setDraftPolicy({
                                            ...draftPolicy,
                                            perServerPermissions: {
                                              ...(draftPolicy.perServerPermissions || {}),
                                              [server.id]: allFalse as any,
                                            },
                                          });
                                        }}
                                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition cursor-pointer flex items-center gap-1"
                                      >
                                        <Square className="w-2.5 h-2.5" />
                                        <span>{isEn ? 'Deny All' : 'مسدود همه'}</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const next = { ...(draftPolicy.perServerPermissions || {}) };
                                          delete next[server.id];
                                          setDraftPolicy({
                                            ...draftPolicy,
                                            perServerPermissions: next,
                                          });
                                        }}
                                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-slate-300 border border-white/10 hover:text-white transition cursor-pointer flex items-center gap-1"
                                      >
                                        <RotateCcw className="w-2.5 h-2.5" />
                                        <span>{isEn ? 'Reset to Defaults' : 'ریست به پیش‌فرض'}</span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* Grid of the 11 Server Actions */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 pt-1">
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
                                            const current = draftPolicy.perServerPermissions?.[server.id] || {
                                              ...(draftPolicy.defaultServerPermissions || {}),
                                            };
                                            const nextVal = !isAllowed;
                                            setDraftPolicy({
                                              ...draftPolicy,
                                              perServerPermissions: {
                                                ...(draftPolicy.perServerPermissions || {}),
                                                [server.id]: {
                                                  ...current,
                                                  [action.key]: nextVal,
                                                },
                                              },
                                            });
                                          }}
                                          className={`flex items-center justify-between p-2 rounded-lg border text-xs font-medium transition cursor-pointer select-none text-left rtl:text-right gap-2 ${
                                            isAllowed
                                              ? isLightMode
                                                ? 'bg-emerald-50 border-emerald-300 text-emerald-950 hover:bg-emerald-100'
                                                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/25'
                                              : isLightMode
                                              ? 'bg-rose-50 border-rose-300 text-rose-950 hover:bg-rose-100 opacity-80'
                                              : 'bg-rose-500/15 border-rose-500/30 text-rose-200 hover:bg-rose-500/25 opacity-80'
                                          }`}
                                          title={isEn ? action.descriptionEn : action.descriptionFa}
                                        >
                                          <div className="truncate">
                                            <div className="font-semibold truncate">
                                              {isEn ? action.labelEn : action.labelFa}
                                            </div>
                                            <div className="text-[10px] text-slate-400 truncate opacity-80">
                                              {action.key}
                                            </div>
                                          </div>
                                          {isAllowed ? (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                          ) : (
                                            <X className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                          )}
                                        </button>
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
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/20 font-bold">
                        {permittedDevices.length} {isEn ? 'Equipment in Scope' : 'تجهیز در دامنه'}
                      </span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/10">
                        {Object.keys(draftPolicy.perDevicePermissions || {}).length} {isEn ? 'Custom Overrides' : 'دارای استثنا'}
                      </span>
                    </div>
                  </div>

                  {/* Network Equipment Matrix Content */}
                  <div className="space-y-3">
                      {/* Introduce New Device Permission Card */}
                      <div
                        className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition ${
                          draftPolicy.canAddDevice
                            ? isLightMode
                              ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-xs'
                              : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                            : isLightMode
                            ? 'bg-slate-100 border-slate-200 text-slate-700'
                            : 'bg-slate-900/60 border-white/10 text-slate-400'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div
                            className={`p-2 rounded-lg shrink-0 ${
                              draftPolicy.canAddDevice
                                ? isLightMode
                                  ? 'bg-emerald-200 text-emerald-800'
                                  : 'bg-emerald-500/30 text-emerald-300'
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
                                  draftPolicy.canAddDevice
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-bold'
                                    : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                                }`}
                              >
                                {draftPolicy.canAddDevice
                                  ? isEn
                                    ? 'PERMITTED'
                                    : 'مجاز'
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
                                ? 'Permits the subject to use the "Introduce New Device" button in Dashboard and Network Equipment Inventory to register and manage their own hardware.'
                                : 'به این کاربر اجازه می‌دهد علاوه بر تجهیزات از قبل تخصیص‌یافته، بتواند با دکمه «معرفی تجهیز جدید» دیوایس‌های مدنظر خود را ثبت و مدیریت کند.'}
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
                                ? 'Controls visibility and authorization for the "Introduce New Device" button in Dashboard and Network Equipment Inventory.'
                                : 'کنترل‌کننده فعال بودن دکمه معرفی تجهیز جدید در داشبورد و فهرست تجهیزات شبکه.'
                            }
                            whyNeeded={
                              isEn
                                ? 'Allows delegated network operators to onboard new hardware into their authorized inventory without granting full global admin rights.'
                                : 'امکان اضافه کردن تجهیزات شبکه توسط کاربر برای خود بدون نیاز به دسترسی‌های سطح بالای مدیریتی.'
                            }
                            practicalExample={
                              isEn
                                ? 'Enabled for Site Engineers adding branch switches; disabled for read-only NOC operators.'
                                : 'فعال برای مهندسین شعب جهت افزودن سوییچ‌های جدید؛ غیرفعال برای ناظران مانیتورینگ.'
                            }
                            isEn={isEn}
                            isLightMode={isLightMode}
                          />
                          <label className="relative inline-flex items-center cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={Boolean(draftPolicy.canAddDevice)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setDraftPolicy({
                                  ...draftPolicy,
                                  canAddDevice: checked,
                                  defaultDevicePermissions: {
                                    ...(draftPolicy.defaultDevicePermissions || {}),
                                    add_device: checked,
                                  },
                                });
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                          </label>
                        </div>
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
                                className={`px-2 py-1 rounded text-[10px] font-semibold border ${
                                  matrixDeviceFilter === 'all'
                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                    : 'bg-white/5 text-slate-400 border-white/10'
                                }`}
                              >
                                {isEn ? 'All' : 'همه'} ({permittedDevices.length})
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
                                        className={`absolute right-0 rtl:right-auto rtl:left-0 top-full mt-1.5 w-72 rounded-xl border shadow-2xl p-2 z-50 animate-fadeIn ${
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
                                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                              {customTemplates.map((ct) => (
                                                <div
                                                  key={ct.id}
                                                  className={`flex items-center justify-between p-1.5 rounded-lg text-xs transition ${
                                                    isLightMode
                                                      ? 'hover:bg-slate-100'
                                                      : 'hover:bg-white/10'
                                                  }`}
                                                >
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      applyTemplateToBatch(
                                                        ct.permissions as any,
                                                        isEn ? ct.nameEn : ct.nameFa
                                                      )
                                                    }
                                                    className="flex-1 text-left rtl:text-right cursor-pointer"
                                                  >
                                                    <span className="font-semibold">
                                                      {isEn ? ct.nameEn : ct.nameFa}
                                                    </span>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={(e) =>
                                                      handleDeleteCustomTemplate(ct.id, e)
                                                    }
                                                    className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                                                    title={isEn ? 'Delete template' : 'حذف الگو'}
                                                  >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                  </button>
                                                </div>
                                              ))}
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
                              draftPolicy.perDevicePermissions?.[dev.id] &&
                                Object.keys(draftPolicy.perDevicePermissions[dev.id]).length > 0
                            );
                            const devPerms = draftPolicy.perDevicePermissions?.[dev.id] || {};
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
                                            className={`absolute right-0 rtl:right-auto rtl:left-0 top-full mt-1 w-64 rounded-xl border shadow-2xl p-2 z-50 animate-fadeIn ${
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
                                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                                  {customTemplates.map((ct) => (
                                                    <div
                                                      key={ct.id}
                                                      className={`flex items-center justify-between p-1 rounded-lg text-[11px] transition ${
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
                                                            ct.permissions as any,
                                                            isEn ? ct.nameEn : ct.nameFa
                                                          )
                                                        }
                                                        className="flex-1 text-left rtl:text-right cursor-pointer"
                                                      >
                                                        <span className="font-semibold">
                                                          {isEn ? ct.nameEn : ct.nameFa}
                                                        </span>
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={(e) =>
                                                          handleDeleteCustomTemplate(ct.id, e)
                                                        }
                                                        className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                                                        title={isEn ? 'Delete' : 'حذف'}
                                                      >
                                                        <Trash2 className="w-3 h-3" />
                                                      </button>
                                                    </div>
                                                  ))}
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
                                    <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                      <Sliders className="w-3 h-3 text-cyan-400" />
                                      <span>
                                        {isEn
                                          ? 'General Device & Management Capabilities'
                                          : 'عملیات و دسترسی‌های عمومی تجهیز'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const current = draftPolicy.perDevicePermissions?.[dev.id] || {
                                            ...(draftPolicy.defaultDevicePermissions || {}),
                                          };
                                          const updated = { ...current };
                                          universalGeneralActions.forEach((a) => {
                                            updated[a.key as NetworkDeviceActionKey] = true;
                                          });
                                          setDraftPolicy({
                                            ...draftPolicy,
                                            perDevicePermissions: {
                                              ...(draftPolicy.perDevicePermissions || {}),
                                              [dev.id]: updated,
                                            },
                                          });
                                        }}
                                        className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 cursor-pointer"
                                      >
                                        {isEn ? 'Allow All' : 'اجازه همه'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const current = draftPolicy.perDevicePermissions?.[dev.id] || {
                                            ...(draftPolicy.defaultDevicePermissions || {}),
                                          };
                                          const updated = { ...current };
                                          universalGeneralActions.forEach((a) => {
                                            updated[a.key as NetworkDeviceActionKey] = false;
                                          });
                                          setDraftPolicy({
                                            ...draftPolicy,
                                            perDevicePermissions: {
                                              ...(draftPolicy.perDevicePermissions || {}),
                                              [dev.id]: updated,
                                            },
                                          });
                                        }}
                                        className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 cursor-pointer"
                                      >
                                        {isEn ? 'Deny All' : 'مسدودسازی'}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                                    {universalGeneralActions.map((action) => {
                                      const isCustom = typeof devPerms[action.key as NetworkDeviceActionKey] === 'boolean';
                                      const isAllowed = isCustom
                                        ? devPerms[action.key as NetworkDeviceActionKey] === true
                                        : isDeviceActionPermitted(
                                            { ...draftPolicy, perDevicePermissions: undefined },
                                            dev.id,
                                            action.key as NetworkDeviceActionKey
                                          );

                                      return (
                                        <button
                                          key={action.key}
                                          type="button"
                                          title={isEn ? (action.descriptionEn || action.labelEn) : (action.descriptionFa || action.labelFa)}
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
                                          <span className="truncate">
                                            {isEn
                                              ? (action.shortLabelEn || action.key)
                                              : (action.shortLabelFa || action.key)}
                                          </span>
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

                                {/* Section 2 (MikroTik Only): RouterOS Core Services & Governance */}
                                {isMikrotik && mikrotikCoreActions.length > 0 && (
                                  <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                                    <div className="flex items-center justify-between flex-wrap gap-1">
                                      <div className="text-[10px] font-bold text-emerald-300 flex items-center gap-1.5">
                                        <RouterIcon className="w-3 h-3 text-emerald-400" />
                                        <span>
                                          {isEn
                                            ? 'MikroTik RouterOS Core Services & Governance'
                                            : 'سرویس‌ها و اختیارات اختصاصی روتروس میکروتیک'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const current = draftPolicy.perDevicePermissions?.[dev.id] || {
                                              ...(draftPolicy.defaultDevicePermissions || {}),
                                            };
                                            const updated = { ...current };
                                            mikrotikCoreActions.forEach((a) => {
                                              updated[a.key as NetworkDeviceActionKey] = true;
                                            });
                                            setDraftPolicy({
                                              ...draftPolicy,
                                              perDevicePermissions: {
                                                ...(draftPolicy.perDevicePermissions || {}),
                                                [dev.id]: updated,
                                              },
                                            });
                                          }}
                                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 cursor-pointer"
                                        >
                                          {isEn ? 'Allow All RouterOS' : 'اجازه همه روتروس'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const current = draftPolicy.perDevicePermissions?.[dev.id] || {
                                              ...(draftPolicy.defaultDevicePermissions || {}),
                                            };
                                            const updated = { ...current };
                                            mikrotikCoreActions.forEach((a) => {
                                              updated[a.key as NetworkDeviceActionKey] = false;
                                            });
                                            setDraftPolicy({
                                              ...draftPolicy,
                                              perDevicePermissions: {
                                                ...(draftPolicy.perDevicePermissions || {}),
                                                [dev.id]: updated,
                                              },
                                            });
                                          }}
                                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 cursor-pointer"
                                        >
                                          {isEn ? 'Deny All RouterOS' : 'مسدودسازی روتروس'}
                                        </button>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                                      {mikrotikCoreActions.map((action) => {
                                        const isCustom = typeof devPerms[action.key as NetworkDeviceActionKey] === 'boolean';
                                        const isAllowed = isCustom
                                          ? devPerms[action.key as NetworkDeviceActionKey] === true
                                          : isDeviceActionPermitted(
                                              { ...draftPolicy, perDevicePermissions: undefined },
                                              dev.id,
                                              action.key as NetworkDeviceActionKey
                                            );

                                        return (
                                          <button
                                            key={action.key}
                                            type="button"
                                            title={isEn ? (action.descriptionEn || action.labelEn) : (action.descriptionFa || action.labelFa)}
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
                                            <span className="truncate">
                                              {isEn
                                                ? (action.shortLabelEn || action.key)
                                                : (action.shortLabelFa || action.key)}
                                            </span>
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
                                )}

                                {/* Section 3 (Cisco Only): Cisco IOS Switch Enterprise Configuration Suite */}
                                {isCisco && ciscoConfigActions.length > 0 && (
                                  <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                                    <div className="flex items-center justify-between flex-wrap gap-1">
                                      <div className="text-[10px] font-bold text-sky-300 flex items-center gap-1.5">
                                        <Sliders className="w-3 h-3 text-sky-400" />
                                        <span>
                                          {isEn
                                            ? 'Cisco IOS Switch Enterprise Configuration Suite'
                                            : 'مجموعه ابزار و اختیارات پیکربندی سوئیچ سیسکو'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const current = draftPolicy.perDevicePermissions?.[dev.id] || {
                                              ...(draftPolicy.defaultDevicePermissions || {}),
                                            };
                                            const updated = { ...current };
                                            ciscoConfigActions.forEach((a) => {
                                              updated[a.key as NetworkDeviceActionKey] = true;
                                            });
                                            setDraftPolicy({
                                              ...draftPolicy,
                                              perDevicePermissions: {
                                                ...(draftPolicy.perDevicePermissions || {}),
                                                [dev.id]: updated,
                                              },
                                            });
                                          }}
                                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30 hover:bg-sky-500/30 cursor-pointer"
                                        >
                                          {isEn ? 'Allow All Cisco Config' : 'اجازه همه کانفیگ سیسکو'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const current = draftPolicy.perDevicePermissions?.[dev.id] || {
                                              ...(draftPolicy.defaultDevicePermissions || {}),
                                            };
                                            const updated = { ...current };
                                            ciscoConfigActions.forEach((a) => {
                                              updated[a.key as NetworkDeviceActionKey] = false;
                                            });
                                            setDraftPolicy({
                                              ...draftPolicy,
                                              perDevicePermissions: {
                                                ...(draftPolicy.perDevicePermissions || {}),
                                                [dev.id]: updated,
                                              },
                                            });
                                          }}
                                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 cursor-pointer"
                                        >
                                          {isEn ? 'Deny All Cisco Config' : 'مسدودسازی کانفیگ سیسکو'}
                                        </button>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                                      {ciscoConfigActions.map((action) => {
                                        const isCustom = typeof devPerms[action.key as NetworkDeviceActionKey] === 'boolean';
                                        const isAllowed = isCustom
                                          ? devPerms[action.key as NetworkDeviceActionKey] === true
                                          : isDeviceActionPermitted(
                                              { ...draftPolicy, perDevicePermissions: undefined },
                                              dev.id,
                                              action.key as NetworkDeviceActionKey
                                            );

                                        return (
                                          <button
                                            key={action.key}
                                            type="button"
                                            title={isEn ? (action.descriptionEn || action.labelEn) : (action.descriptionFa || action.labelFa)}
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
                                            <span className="truncate">
                                              {isEn
                                                ? (action.shortLabelEn || action.key)
                                                : (action.shortLabelFa || action.key)}
                                            </span>
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
                                )}

                                {/* Section 4 (or Section 2/3): Port Right-Click & Interface Actions */}
                                {applicablePortActions.length > 0 && (
                                  <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                                    <div className="flex items-center justify-between flex-wrap gap-1">
                                      <div className="text-[10px] font-bold text-amber-300 flex items-center gap-1.5">
                                        <Network className="w-3 h-3 text-amber-400" />
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
                                          onClick={() => {
                                            const current = draftPolicy.perDevicePermissions?.[dev.id] || {
                                              ...(draftPolicy.defaultDevicePermissions || {}),
                                            };
                                            const updated = { ...current };
                                            applicablePortActions.forEach((a) => {
                                              updated[a.key as NetworkDeviceActionKey] = true;
                                            });
                                            setDraftPolicy({
                                              ...draftPolicy,
                                              perDevicePermissions: {
                                                ...(draftPolicy.perDevicePermissions || {}),
                                                [dev.id]: updated,
                                              },
                                            });
                                          }}
                                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 cursor-pointer"
                                        >
                                          {isEn ? 'Allow All Ports' : 'اجازه همه پورت‌ها'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const current = draftPolicy.perDevicePermissions?.[dev.id] || {
                                              ...(draftPolicy.defaultDevicePermissions || {}),
                                            };
                                            const updated = { ...current };
                                            applicablePortActions.forEach((a) => {
                                              updated[a.key as NetworkDeviceActionKey] = false;
                                            });
                                            setDraftPolicy({
                                              ...draftPolicy,
                                              perDevicePermissions: {
                                                ...(draftPolicy.perDevicePermissions || {}),
                                                [dev.id]: updated,
                                              },
                                            });
                                          }}
                                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 cursor-pointer"
                                        >
                                          {isEn ? 'Deny All Ports' : 'مسدودسازی پورت‌ها'}
                                        </button>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                                      {applicablePortActions.map((action) => {
                                        const isCustom = typeof devPerms[action.key as NetworkDeviceActionKey] === 'boolean';
                                        const isAllowed = isCustom
                                          ? devPerms[action.key as NetworkDeviceActionKey] === true
                                          : isDeviceActionPermitted(
                                              { ...draftPolicy, perDevicePermissions: undefined },
                                              dev.id,
                                              action.key as NetworkDeviceActionKey
                                            );

                                        return (
                                          <button
                                            key={action.key}
                                            type="button"
                                            title={isEn ? (action.descriptionEn || action.labelEn) : (action.descriptionFa || action.labelFa)}
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
                                            <span className="truncate">
                                              {isEn
                                                ? (action.shortLabelEn || action.key)
                                                : (action.shortLabelFa || action.key)}
                                            </span>
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
                    draftPolicy?.perDevicePermissions?.[srcDev.id] &&
                      Object.keys(draftPolicy.perDevicePermissions[srcDev.id]).length > 0
                  );
                  const allowedCount = hasCustom
                    ? Object.values(draftPolicy!.perDevicePermissions![srcDev.id]).filter(Boolean).length
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
    </>,
    document.body
  );
};
