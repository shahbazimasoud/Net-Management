import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Users,
  User,
  FolderTree,
  Plus,
  Trash2,
  Edit,
  Check,
  CheckCircle,
  X,
  Lock,
  Unlock,
  Terminal,
  Power,
  FileText,
  Sliders,
  CheckSquare,
  Square,
  Sparkles,
  HelpCircle,
  Eye,
  Activity,
  Layers,
  Save,
  Radio,
  Server,
  Cpu,
  Router as RouterIcon,
  Globe,
  Wrench,
  HardDrive,
  Archive,
  DownloadCloud,
  UploadCloud,
  LayoutDashboard,
  Network,
  RefreshCw,
  Database,
  RotateCcw,
  Edit2,
  Monitor,
  Search,
  AlertTriangle,
  Flame,
  Info,
  List,
  Table as TableIcon,
  LayoutGrid,
  Columns3,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  SlidersHorizontal
} from 'lucide-react';
import {
  AccessPolicy,
  DeviceGroup,
  Device,
  ActiveDirectoryConfig,
  LocalUser,
  LocalGroup,
  RemoteServer,
  ServerActionKey,
  ServerActionPermissions,
  NetworkDeviceActionKey,
  NetworkDeviceActionPermissions,
} from '../../types';
import {
  SERVER_ACTIONS_CATALOG,
  FULL_SERVER_PERMISSIONS,
  RESTRICTED_SERVER_PERMISSIONS,
  isServerActionPermitted,
  DEVICE_ACTIONS_CATALOG,
  FULL_DEVICE_PERMISSIONS,
  RESTRICTED_DEVICE_PERMISSIONS,
  EMPTY_DEVICE_PERMISSIONS,
  FULL_PORT_PERMISSIONS,
  EMPTY_PORT_PERMISSIONS,
  FULL_EQUIPMENT_PERMISSIONS,
  EMPTY_EQUIPMENT_PERMISSIONS,
  isDeviceActionPermitted,
} from '../../utils/rbac';
import { fetchRemoteServers } from '../../services/api';
import { FieldInfoTooltip } from '../vpn/FieldInfoTooltip';
import { AccessPolicyModal } from './AccessPolicyModal';
import {
  loadLocalUsers,
  loadLocalGroups,
  loadSimulatedRoleId,
  saveSimulatedRoleId,
  syncLocalUsersFromDatabase,
  syncLocalGroupsFromDatabase,
  syncDeviceGroupsFromDatabase,
  syncActiveDirectoryConfigFromDatabase,
} from '../../services/settingsStorage';
import { logPortalEvent } from '../../services/auditLogger';
import { useLanguage } from '../../i18n';
import { useModalDock } from '../../context/ModalDockContext';

export type PolicyViewMode = 'list' | 'table' | 'grid';

export interface PolicyVisibleColumns {
  policy: boolean;
  subject: boolean;
  priority: boolean;
  scope: boolean;
  views: boolean;
  cisco: boolean;
  mikrotik: boolean;
  servers: boolean;
  templates: boolean;
  simulation: boolean;
  actions: boolean;
}

export const DEFAULT_POLICY_COLUMNS: PolicyVisibleColumns = {
  policy: true,
  subject: true,
  priority: true,
  scope: true,
  views: true,
  cisco: true,
  mikrotik: true,
  servers: true,
  templates: true,
  simulation: true,
  actions: true,
};

export const POLICY_COLUMN_ITEMS: {
  key: keyof PolicyVisibleColumns;
  labelEn: string;
  labelFa: string;
}[] = [
  { key: 'policy', labelEn: 'Policy Name & Description', labelFa: 'نام و توضیحات پالیسی' },
  { key: 'subject', labelEn: 'Subject & Identity', labelFa: 'هویت و نوع کاربر/گروه' },
  { key: 'priority', labelEn: 'Priority Weight', labelFa: 'اولویت و وزن اعمال' },
  { key: 'scope', labelEn: 'Target Scope', labelFa: 'محدوده تجهیزات و سرورها' },
  { key: 'views', labelEn: 'UI Views Privileges', labelFa: 'اختیارات صفحات پنل' },
  { key: 'cisco', labelEn: 'Cisco CLI & Ports', labelFa: 'اختیارات تجهیزات سیسکو' },
  { key: 'mikrotik', labelEn: 'MikroTik RouterOS', labelFa: 'اختیارات تجهیزات میکروتیک' },
  { key: 'servers', labelEn: 'Linux Server Fleet', labelFa: 'اختیارات ناوگان سرورها' },
  { key: 'templates', labelEn: 'Templates & Disaster Recovery', labelFa: 'الگوها و پشتیبان‌گیری' },
  { key: 'simulation', labelEn: 'Simulation Status', labelFa: 'وضعیت شبیه‌سازی نقش' },
  { key: 'actions', labelEn: 'Quick Actions', labelFa: 'عملیات سریع' },
];

interface AccessControlTabProps {
  policies: AccessPolicy[];
  groups: DeviceGroup[];
  devices: Device[];
  adConfig: ActiveDirectoryConfig;
  onSavePolicies: (policies: AccessPolicy[]) => void;
  activeSimulatedPolicyId: string;
  onSelectSimulatedPolicy: (id: string) => void;
  localUsers?: LocalUser[];
  localGroups?: LocalGroup[];
  isLightMode?: boolean;
}

export const AccessControlTab: React.FC<AccessControlTabProps> = ({
  policies,
  groups,
  devices,
  adConfig,
  onSavePolicies,
  activeSimulatedPolicyId,
  onSelectSimulatedPolicy,
  localUsers = loadLocalUsers(),
  localGroups = loadLocalGroups(),
  isLightMode: propIsLightMode,
}) => {
  const { isRtl, isEn } = useLanguage();
  const isLight = Boolean(
    propIsLightMode ||
    (typeof document !== 'undefined' && document.documentElement.classList.contains('light'))
  );
  const [editingPolicy, setEditingPolicy] = useState<AccessPolicy | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const { dockModal, undockModal } = useModalDock();

  // Multi-View, Columns Visibility & Pagination States
  const [viewMode, setViewMode] = useState<PolicyViewMode>(() => {
    try {
      const saved = localStorage.getItem('access_policies_view_mode');
      if (saved === 'list' || saved === 'table' || saved === 'grid') return saved;
    } catch {}
    return 'list'; // Default list view as requested
  });

  const [visibleColumns, setVisibleColumns] = useState<PolicyVisibleColumns>(() => {
    try {
      const saved = localStorage.getItem('access_policies_visible_columns');
      if (saved) return { ...DEFAULT_POLICY_COLUMNS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_POLICY_COLUMNS;
  });

  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
  const columnPickerBtnRef = useRef<HTMLButtonElement | null>(null);
  const columnDropdownRef = useRef<HTMLDivElement | null>(null);
  const [columnPickerCoords, setColumnPickerCoords] = useState<{ top: number; left: number } | null>(null);

  // Search, Filters & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<'all' | 'ad_user' | 'ad_group' | 'local_user' | 'local_group'>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'all_devices' | 'groups' | 'specific'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  // Live database-backed states for subjects and scopes
  const [liveLocalUsers, setLiveLocalUsers] = useState<LocalUser[]>(localUsers);
  const [liveLocalGroups, setLiveLocalGroups] = useState<LocalGroup[]>(localGroups);
  const [liveDeviceGroups, setLiveDeviceGroups] = useState<DeviceGroup[]>(groups);
  const [liveAdConfig, setLiveAdConfig] = useState<ActiveDirectoryConfig>(adConfig);
  const [liveServers, setLiveServers] = useState<RemoteServer[]>([]);
  const [isSyncingDb, setIsSyncingDb] = useState<boolean>(false);

  // Synchronize authentic database entities
  const refreshDatabaseData = useCallback(async () => {
    setIsSyncingDb(true);
    let finalUsers = liveLocalUsers;
    let finalGroups = liveLocalGroups;
    let finalDevGroups = liveDeviceGroups;
    let finalAd = liveAdConfig;
    let finalServers = liveServers;
    try {
      const [dbUsers, dbGroups, dbDevGroups, dbAd, dbServers] = await Promise.all([
        syncLocalUsersFromDatabase().catch(() => localUsers),
        syncLocalGroupsFromDatabase().catch(() => localGroups),
        syncDeviceGroupsFromDatabase().catch(() => groups),
        syncActiveDirectoryConfigFromDatabase().catch(() => adConfig),
        fetchRemoteServers().catch(() => null),
      ]);
      if (Array.isArray(dbUsers) && dbUsers.length > 0) {
        setLiveLocalUsers(dbUsers);
        finalUsers = dbUsers;
      }
      if (Array.isArray(dbGroups) && dbGroups.length > 0) {
        setLiveLocalGroups(dbGroups);
        finalGroups = dbGroups;
      }
      if (Array.isArray(dbDevGroups) && dbDevGroups.length > 0) {
        setLiveDeviceGroups(dbDevGroups);
        finalDevGroups = dbDevGroups;
      }
      if (dbAd && typeof dbAd === 'object') {
        setLiveAdConfig(dbAd);
        finalAd = dbAd;
      }

      const parsedServers: RemoteServer[] = Array.isArray(dbServers)
        ? dbServers
        : Array.isArray((dbServers as any)?.servers)
        ? (dbServers as any).servers
        : [];

      if (parsedServers.length > 0) {
        setLiveServers(parsedServers);
        finalServers = parsedServers;
      } else {
        try {
          const directRes = await fetch('/api/remote-servers');
          if (directRes.ok) {
            const data = await directRes.json();
            const list = Array.isArray(data?.servers)
              ? data.servers
              : Array.isArray(data)
              ? data
              : [];
            if (list.length > 0) {
              setLiveServers(list);
              finalServers = list;
            }
          }
        } catch {
          // ignore
        }
      }
    } finally {
      setIsSyncingDb(false);
    }
    return {
      users: finalUsers,
      groups: finalGroups,
      devGroups: finalDevGroups,
      ad: finalAd,
      servers: finalServers,
    };
  }, [localUsers, localGroups, groups, adConfig]);

  useEffect(() => {
    refreshDatabaseData();
  }, []);

  // Initial template for new policy
  const getBlankPolicy = (groupsPool?: LocalGroup[], devGroupsPool?: DeviceGroup[]): AccessPolicy => {
    const activeGroups = groupsPool && groupsPool.length > 0 ? groupsPool : liveLocalGroups;
    const activeDevGroups = devGroupsPool && devGroupsPool.length > 0 ? devGroupsPool : liveDeviceGroups;
    const firstGroup = activeGroups[0];
    const firstDevGroup = activeDevGroups[0];
    return {
      id: `policy-${Date.now().toString(36)}`,
      name: isEn ? 'New Custom Access Policy' : 'پالیسی جدید سطح دسترسی',
      description: isEn ? 'Custom multi-vendor access control rule' : 'قانون دسترسی سفارشی برای تجهیزات چند وندوری شبکه',
      priority: 50,
      subjectType: 'local_group',
      subjectId: firstGroup?.id || 'group-helpdesk-ops',
      subjectName: firstGroup?.name || (isEn ? 'Helpdesk Operators' : 'تیم هلپ‌دسک و پشتیبانی'),
      targetScope: 'groups',
      targetGroupIds: firstDevGroup ? [firstDevGroup.id] : [],
      targetDeviceIds: [],
      // Page modules
      canViewDashboard: true,
      canViewTopology: true,
      canViewDevices: true,
      canViewServers: true,
      canViewPorts: true,
      canViewScanner: false,
      canViewTemplates: false,
      canViewLogs: false,
      canViewSettings: false,
      canCheckUpdate: false,
      canPerformUpdate: false,
      // Cisco capabilities
      terminalAccess: 'none',
      canToggleAdminStatus: false,
      canChangeVlan: true,
      canEditDescription: true,
      canTogglePortSecurity: true,
      canWriteMemory: false,
      // MikroTik capabilities
      mikrotikTerminalAccess: 'none',
      canMikrotikToggleInterface: false,
      canMikrotikBridgeVlan: true,
      canMikrotikComment: true,
      canMikrotikIpPool: false,
      canMikrotikFirewall: false,
      canMikrotikBackup: false,
      canMikrotikSafeMode: true,
      // Generic / Linux capabilities
      genericTerminalAccess: 'none',
      canGenericToggleLink: false,
      canGenericDiagnostics: true,
      canGenericConfigBackup: false,
      // Global capabilities
      canManageDevices: false,
      canAddDevice: false,
      canApplyTemplates: false,
      canBatchOperate: false,
      // Backup & Disaster Recovery
      canExportBackup: false,
      canImportBackup: false,
      // Server Fleet & 3-Dots Action Permissions
      targetServerScope: 'all',
      targetServerIds: [],
      canAddServer: false,
      defaultServerPermissions: {
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
      perServerPermissions: {},
      // Network Equipment & 3-Dots Action Permissions
      defaultDevicePermissions: {
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
      perDevicePermissions: {},
    };
  };

  const handleStartCreate = async () => {
    const data = await refreshDatabaseData();
    const activeGroups = data?.groups && data.groups.length > 0 ? data.groups : liveLocalGroups;
    const activeDevGroups = data?.devGroups && data.devGroups.length > 0 ? data.devGroups : liveDeviceGroups;
    setEditingPolicy(getBlankPolicy(activeGroups, activeDevGroups));
    setIsCreating(true);
    setIsPolicyModalOpen(true);
  };

  const handleStartEdit = (policy: AccessPolicy) => {
    refreshDatabaseData();
    setEditingPolicy({
      ...policy,
      targetServerScope: policy.targetServerScope || (Array.isArray(policy.targetServerIds) && policy.targetServerIds.length > 0 ? 'specific' : 'all'),
      targetServerIds: policy.targetServerIds || [],
      canAddServer: policy.canAddServer ?? Boolean(policy.defaultServerPermissions?.add_server),
      canAddDevice: policy.canAddDevice ?? Boolean(policy.defaultDevicePermissions?.add_device ?? policy.canManageDevices),
      defaultServerPermissions: policy.defaultServerPermissions || (
        policy.id === 'policy-super-admin'
          ? { ...FULL_SERVER_PERMISSIONS }
          : { ...RESTRICTED_SERVER_PERMISSIONS }
      ),
      perServerPermissions: policy.perServerPermissions || {},
      defaultDevicePermissions: policy.defaultDevicePermissions || (
        policy.id === 'policy-super-admin'
          ? { ...FULL_DEVICE_PERMISSIONS }
          : { ...RESTRICTED_DEVICE_PERMISSIONS }
      ),
      perDevicePermissions: policy.perDevicePermissions || {},
    });
    setIsCreating(false);
    setIsPolicyModalOpen(true);
  };

  const handleDuplicatePolicy = (policy: AccessPolicy, e: React.MouseEvent) => {
    e.stopPropagation();
    const newId = `policy-copy-${Date.now().toString(36)}`;
    const copyPolicy: AccessPolicy = {
      ...policy,
      id: newId,
      name: isEn ? `${policy.name} (Copy)` : `${policy.name} (کپی)`,
      description: isEn ? `Cloned from ${policy.name}` : `کپی‌شده از ${policy.name}`,
      priority: Math.max(1, (policy.priority || 50) - 1),
    };

    const updated = [...policies, copyPolicy];
    onSavePolicies(updated);

    try {
      logPortalEvent({
        category: 'rbac_policy',
        action: 'RBAC_POLICY_CREATED',
        title: `ایجاد نسخه کپی از پالیسی «${policy.name}»`,
        title_en: `Duplicated access policy: ${policy.name}`,
        target: {
          type: 'policy',
          id: copyPolicy.id,
          name: copyPolicy.name,
        },
        severity: 'notice',
        status: 'success',
        details: `پالیسی ${copyPolicy.name} به عنوان کپی از ${policy.name} ایجاد شد.`,
        details_en: `Access policy ${copyPolicy.name} duplicated from ${policy.name}.`,
      });
    } catch {}
  };

  const handleDeletePolicy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (policies.length <= 1) {
      alert(isEn ? 'At least one policy must remain.' : 'حداقل یک سطح دسترسی باید وجود داشته باشد.');
      return;
    }
    const confirmed = window.confirm(
      isEn ? 'Are you sure you want to delete this access policy?' : 'آیا از حذف این پالیسی دسترسی اطمینان دارید؟'
    );
    if (!confirmed) return;

    const targetPolicy = policies.find((p) => p.id === id);
    const updated = policies.filter((p) => p.id !== id);
    onSavePolicies(updated);
    if (activeSimulatedPolicyId === id) {
      onSelectSimulatedPolicy(updated[0]?.id || '');
    }

    if (targetPolicy) {
      try {
        logPortalEvent({
          category: 'rbac_policy',
          action: 'RBAC_POLICY_DELETED',
          title: `حذف پالیسی دسترسی «${targetPolicy.name}»`,
          title_en: `Access policy deleted: ${targetPolicy.name}`,
          target: {
            type: 'policy',
            id: targetPolicy.id,
            name: targetPolicy.name,
            metadata: { subjectName: targetPolicy.subjectName, subjectType: targetPolicy.subjectType }
          },
          severity: 'warning',
          status: 'success',
          details: `پالیسی دسترسی ${targetPolicy.name} با شناسه ${targetPolicy.id} حذف شد.`,
          details_en: `Access policy ${targetPolicy.name} was removed.`,
        });
      } catch {}
    }
  };

  const handleSavePolicy = (e?: React.FormEvent, policyToSave?: AccessPolicy) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const targetPolicy = policyToSave || editingPolicy;
    if (!targetPolicy) return;

    let updated: AccessPolicy[];
    if (isCreating) {
      updated = [...policies, targetPolicy];
    } else {
      updated = policies.map((p) => (p.id === targetPolicy.id ? targetPolicy : p));
    }
    onSavePolicies(updated);

    try {
      logPortalEvent({
        category: 'rbac_policy',
        action: isCreating ? 'RBAC_POLICY_CREATED' : 'RBAC_POLICY_UPDATED',
        title: isCreating
          ? `ایجاد پالیسی دسترسی جدید «${targetPolicy.name}»`
          : `تغییر سطح دسترسی و اختیارات در پالیسی «${targetPolicy.name}»`,
        title_en: isCreating
          ? `New access policy created: ${targetPolicy.name}`
          : `Access policy updated: ${targetPolicy.name}`,
        target: {
          type: 'policy',
          id: targetPolicy.id,
          name: targetPolicy.name,
          metadata: {
            subjectName: targetPolicy.subjectName,
            subjectType: targetPolicy.subjectType,
            canExportBackup: targetPolicy.permissions?.canExportBackup,
            canImportBackup: targetPolicy.permissions?.canImportBackup,
            terminalAccess: targetPolicy.permissions?.terminalAccess,
          }
        },
        severity: 'notice',
        status: 'success',
        details: `پالیسی ${targetPolicy.name} برای ${targetPolicy.subjectType} ${targetPolicy.subjectName} ذخیره شد.`,
        details_en: `Access policy ${targetPolicy.name} saved.`,
      });
    } catch {}

    setEditingPolicy(null);
    setIsCreating(false);
    setIsPolicyModalOpen(false);
  };

  // Column Picker floating position updater
  const updateColumnPickerPosition = useCallback(() => {
    if (!columnPickerBtnRef.current || typeof window === 'undefined') return;
    const rect = columnPickerBtnRef.current.getBoundingClientRect();
    const dropdownWidth = 270;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = rect.bottom + 6;
    if (top + 340 > viewportHeight && rect.top > 340) {
      top = Math.max(10, rect.top - 340);
    }

    let left: number;
    if (isEn) {
      const desiredLeft = rect.right - dropdownWidth;
      if (desiredLeft >= 10 && desiredLeft + dropdownWidth <= viewportWidth - 10) {
        left = desiredLeft;
      } else if (rect.left + dropdownWidth <= viewportWidth - 10) {
        left = Math.max(10, rect.left);
      } else {
        left = Math.max(10, viewportWidth - dropdownWidth - 10);
      }
    } else {
      const desiredLeft = rect.left;
      if (desiredLeft + dropdownWidth <= viewportWidth - 10 && desiredLeft >= 10) {
        left = desiredLeft;
      } else if (rect.right - dropdownWidth >= 10) {
        left = rect.right - dropdownWidth;
      } else {
        left = Math.max(10, Math.min(rect.left, viewportWidth - dropdownWidth - 10));
      }
    }

    setColumnPickerCoords({ top, left });
  }, [isEn]);

  const handleToggleColumnPicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isColumnPickerOpen) {
      updateColumnPickerPosition();
      setIsColumnPickerOpen(true);
    } else {
      setIsColumnPickerOpen(false);
    }
  };

  const toggleColumn = (key: keyof PolicyVisibleColumns) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('access_policies_visible_columns', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const resetColumns = () => {
    setVisibleColumns(DEFAULT_POLICY_COLUMNS);
    try {
      localStorage.setItem('access_policies_visible_columns', JSON.stringify(DEFAULT_POLICY_COLUMNS));
    } catch {}
  };

  const selectAllColumns = () => {
    const allTrue: PolicyVisibleColumns = {
      policy: true,
      subject: true,
      priority: true,
      scope: true,
      views: true,
      cisco: true,
      mikrotik: true,
      servers: true,
      templates: true,
      simulation: true,
      actions: true,
    };
    setVisibleColumns(allTrue);
    try {
      localStorage.setItem('access_policies_visible_columns', JSON.stringify(allTrue));
    } catch {}
  };

  const handleViewModeChange = (mode: PolicyViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('access_policies_view_mode', mode);
    } catch {}
  };

  useEffect(() => {
    if (!isColumnPickerOpen) return;

    const handleScrollOrResize = () => {
      updateColumnPickerPosition();
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        columnPickerBtnRef.current &&
        columnPickerBtnRef.current.contains(target)
      ) {
        return;
      }
      if (
        columnDropdownRef.current &&
        columnDropdownRef.current.contains(target)
      ) {
        return;
      }
      setIsColumnPickerOpen(false);
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isColumnPickerOpen, updateColumnPickerPosition]);

  // Filtered policies based on search query, subject type, and scope
  const filteredPolicies = useMemo(() => {
    return policies.filter((p) => {
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = (p.name || '').toLowerCase().includes(q);
        const matchSubject = (p.subjectName || '').toLowerCase().includes(q);
        const matchDesc = (p.description || '').toLowerCase().includes(q);
        const matchId = (p.id || '').toLowerCase().includes(q);
        if (!matchName && !matchSubject && !matchDesc && !matchId) {
          return false;
        }
      }
      if (subjectTypeFilter !== 'all') {
        if (p.subjectType !== subjectTypeFilter) {
          return false;
        }
      }
      if (scopeFilter !== 'all') {
        if (scopeFilter === 'all_devices' && p.targetScope !== 'all') return false;
        if (scopeFilter === 'groups' && p.targetScope !== 'groups') return false;
        if (scopeFilter === 'specific' && p.targetScope !== 'specific') return false;
      }
      return true;
    });
  }, [policies, searchQuery, subjectTypeFilter, scopeFilter]);

  // Reset to page 1 on filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, subjectTypeFilter, scopeFilter, itemsPerPage]);

  const totalItems = filteredPolicies.length;
  const totalPages = itemsPerPage === -1 ? 1 : Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedPolicies = useMemo(() => {
    if (itemsPerPage === -1) return filteredPolicies;
    const start = (safePage - 1) * itemsPerPage;
    return filteredPolicies.slice(start, start + itemsPerPage);
  }, [filteredPolicies, safePage, itemsPerPage]);

  const startIndex = totalItems === 0 ? 0 : (safePage - 1) * (itemsPerPage === -1 ? totalItems : itemsPerPage);
  const endIndex = itemsPerPage === -1 ? totalItems : Math.min(startIndex + itemsPerPage, totalItems);

  // Helper renderers
  const getPermittedViewsCount = (policy: AccessPolicy) => {
    if ((policy.priority || 0) >= 100) return 10;
    let count = 0;
    if (policy.canViewDashboard !== false) count++;
    if (policy.canViewTopology !== false) count++;
    if (policy.canViewDevices !== false) count++;
    if (policy.canViewPorts !== false) count++;
    if (policy.canViewDiscovery !== false) count++;
    if (policy.canViewTemplates !== false) count++;
    if (policy.canViewServers !== false) count++;
    if (policy.canViewNetworkTools !== false) count++;
    if (policy.canViewPhysicalPlacement !== false) count++;
    if (policy.canViewSettings === true) count++;
    return count;
  };

  const renderSubjectTypeBadge = (policy: AccessPolicy) => {
    if (policy.subjectType === 'ad_group') {
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
          isLight
            ? 'bg-cyan-100 text-cyan-800 border-cyan-300'
            : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
        }`}>
          <Users className="w-3 h-3" />
          <span>AD Group</span>
        </span>
      );
    }
    if (policy.subjectType === 'ad_user') {
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
          isLight
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
        }`}>
          <User className="w-3 h-3" />
          <span>AD User</span>
        </span>
      );
    }
    if (policy.subjectType === 'local_group') {
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
          isLight
            ? 'bg-purple-100 text-purple-800 border-purple-300'
            : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
        }`}>
          <FolderTree className="w-3 h-3" />
          <span>Local Group</span>
        </span>
      );
    }
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
        isLight
          ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
          : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
      }`}>
        <ShieldCheck className="w-3 h-3" />
        <span>Local User</span>
      </span>
    );
  };

  const renderScopeBadge = (policy: AccessPolicy) => {
    if (policy.targetScope === 'all') {
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
          isLight
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
        }`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>{isEn ? 'All Devices' : 'تمام تجهیزات'}</span>
        </span>
      );
    }
    if (policy.targetScope === 'groups') {
      const groupCount = (policy.targetGroupIds || []).length;
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
            isLight
              ? 'bg-amber-100 text-amber-800 border-amber-300'
              : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
          }`}
          title={(policy.targetGroupIds || []).map((gid) => groups.find((g) => g.id === gid)?.name || gid).join(', ')}
        >
          <FolderTree className="w-3 h-3 text-amber-400" />
          <span>{isEn ? `${groupCount} Groups` : `${groupCount} گروه`}</span>
        </span>
      );
    }
    const devCount = (policy.targetDeviceIds || []).length;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
        isLight
          ? 'bg-cyan-100 text-cyan-800 border-cyan-300'
          : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
      }`}>
        <RouterIcon className="w-3 h-3 text-cyan-400" />
        <span>{isEn ? `${devCount} Devices` : `${devCount} دستگاه`}</span>
      </span>
    );
  };

  const renderPriorityBadge = (policy: AccessPolicy) => {
    const p = policy.priority || 50;
    const isRoot = p >= 100;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
        isRoot
          ? isLight ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
          : p >= 80
          ? isLight ? 'bg-purple-100 text-purple-800 border-purple-300' : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
          : p >= 50
          ? isLight ? 'bg-indigo-100 text-indigo-800 border-indigo-300' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
          : isLight ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-slate-800 text-slate-400 border-white/10'
      }`}>
        <span>P-{p}</span>
        {isRoot && <span className="text-[8px] uppercase">ROOT</span>}
      </span>
    );
  };

  const renderViewsBadge = (policy: AccessPolicy) => {
    const count = getPermittedViewsCount(policy);
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
        count >= 9
          ? isLight ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
          : count >= 6
          ? isLight ? 'bg-indigo-100 text-indigo-800 border-indigo-300' : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
          : isLight ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-slate-800 text-slate-400 border-white/10'
      }`}>
        <LayoutDashboard className="w-3 h-3" />
        <span>{isEn ? `${count}/10 Views` : `${count}/۱۰ بخش`}</span>
      </span>
    );
  };

  const renderCiscoBadge = (policy: AccessPolicy) => {
    const isNone = !policy.canChangeVlan && !policy.canTogglePortSecurity && !policy.canToggleAdminStatus && (!policy.terminalAccess || policy.terminalAccess === 'none');
    if (isNone) {
      return <span className={`text-[10px] font-mono ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>{isEn ? 'Restricted' : 'محدود'}</span>;
    }
    return (
      <div className="flex flex-wrap gap-1 items-center">
        <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border ${
          policy.terminalAccess === 'full'
            ? isLight ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
            : policy.terminalAccess === 'exec'
            ? isLight ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
            : isLight ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-slate-800 text-slate-500 border-white/5'
        }`}>
          {policy.terminalAccess === 'full' ? 'CLI:Full' : policy.terminalAccess === 'exec' ? 'CLI:Exec' : 'CLI:None'}
        </span>
        {policy.canChangeVlan && (
          <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${isLight ? 'bg-blue-100 text-blue-800' : 'bg-blue-500/20 text-blue-300'}`}>
            VLAN
          </span>
        )}
        {policy.canTogglePortSecurity && (
          <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${isLight ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/20 text-amber-300'}`}>
            Sec
          </span>
        )}
        {policy.canToggleAdminStatus && (
          <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${isLight ? 'bg-rose-100 text-rose-800' : 'bg-rose-500/20 text-rose-300'}`}>
            Shut
          </span>
        )}
        {policy.canWriteMemory && (
          <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${isLight ? 'bg-cyan-100 text-cyan-800' : 'bg-cyan-500/20 text-cyan-300'}`}>
            WR
          </span>
        )}
      </div>
    );
  };

  const renderMikrotikBadge = (policy: AccessPolicy) => {
    const isNone = !policy.canMikrotikBridgeVlan && !policy.canMikrotikToggleInterface && !policy.canMikrotikFirewall && !policy.canMikrotikBackup && (!policy.mikrotikTerminalAccess || policy.mikrotikTerminalAccess === 'none');
    if (isNone) {
      return <span className={`text-[10px] font-mono ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>{isEn ? 'Restricted' : 'محدود'}</span>;
    }
    return (
      <div className="flex flex-wrap gap-1 items-center">
        {policy.mikrotikTerminalAccess && policy.mikrotikTerminalAccess !== 'none' && (
          <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
            isLight ? 'bg-rose-100 text-rose-800' : 'bg-rose-500/20 text-rose-300'
          }`}>
            ROS-CLI
          </span>
        )}
        {policy.canMikrotikSafeMode && (
          <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
            isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-500/20 text-emerald-300'
          }`}>
            SafeMode
          </span>
        )}
        {policy.canMikrotikFirewall && (
          <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${
            isLight ? 'bg-orange-100 text-orange-800' : 'bg-orange-500/20 text-orange-300'
          }`}>
            FW/NAT
          </span>
        )}
        {policy.canMikrotikBackup && (
          <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${
            isLight ? 'bg-purple-100 text-purple-800' : 'bg-purple-500/20 text-purple-300'
          }`}>
            Backup
          </span>
        )}
        {policy.canMikrotikBridgeVlan && (
          <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${
            isLight ? 'bg-cyan-100 text-cyan-800' : 'bg-cyan-500/20 text-cyan-300'
          }`}>
            BVLAN
          </span>
        )}
      </div>
    );
  };

  const renderServersBadge = (policy: AccessPolicy) => {
    const p = policy.defaultServerPermissions;
    if (!p) {
      return <span className={`text-[10px] font-mono ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>{isEn ? 'Default' : 'پیش‌فرض'}</span>;
    }
    const activeCount = Object.values(p).filter(Boolean).length;
    return (
      <div className="flex flex-wrap gap-1 items-center">
        <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border ${
          activeCount >= 6
            ? isLight ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
            : activeCount > 0
            ? isLight ? 'bg-cyan-100 text-cyan-800 border-cyan-300' : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
            : isLight ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-slate-800 text-slate-500 border-white/5'
        }`}>
          {activeCount}/8 Actions
        </span>
        {p.terminal && <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-500/20 text-emerald-300'}`}>SSH</span>}
        {p.file_explorer && <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${isLight ? 'bg-blue-100 text-blue-800' : 'bg-blue-500/20 text-blue-300'}`}>SFTP</span>}
        {p.database_management && <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${isLight ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/20 text-amber-300'}`}>DB</span>}
        {p.power_control && <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${isLight ? 'bg-rose-100 text-rose-800' : 'bg-rose-500/20 text-rose-300'}`}>Power</span>}
      </div>
    );
  };

  const renderTemplatesBadge = (policy: AccessPolicy) => {
    return (
      <div className="flex flex-wrap gap-1 items-center">
        {policy.canApplyTemplates && (
          <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
            isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-500/20 text-emerald-300'
          }`}>
            Apply
          </span>
        )}
        {(policy.canExportTemplates || policy.canImportTemplates) && (
          <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${
            isLight ? 'bg-blue-100 text-blue-800' : 'bg-blue-500/20 text-blue-300'
          }`}>
            {policy.canExportTemplates && policy.canImportTemplates ? 'Exp+Imp' : policy.canExportTemplates ? 'Exp' : 'Imp'}
          </span>
        )}
        <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${
          policy.canImportBackup
            ? isLight ? 'bg-amber-100 text-amber-800 font-bold' : 'bg-amber-500/20 text-amber-300 font-bold'
            : policy.canExportBackup
            ? isLight ? 'bg-cyan-100 text-cyan-800' : 'bg-cyan-500/20 text-cyan-300'
            : isLight ? 'text-slate-400' : 'text-slate-500'
        }`}>
          DR: {policy.canImportBackup ? 'Full' : policy.canExportBackup ? 'Exp' : 'None'}
        </span>
      </div>
    );
  };

  const renderSimulationButton = (policy: AccessPolicy) => {
    const isCurrent = policy.id === activeSimulatedPolicyId;
    return (
      <button
        type="button"
        onClick={() => onSelectSimulatedPolicy(policy.id)}
        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5 border ${
          isCurrent
            ? isLight
              ? 'bg-cyan-100 border-cyan-400 text-cyan-900 font-bold shadow-sm'
              : 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold shadow-sm shadow-cyan-500/20'
            : isLight
            ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
            : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white'
        }`}
        title={isCurrent ? (isEn ? 'Active Test Role' : 'نقش تستی فعال') : (isEn ? 'Switch to this role' : 'تغییر به این نقش')}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-cyan-400 animate-pulse' : 'bg-slate-500'}`} />
        <span>{isCurrent ? (isEn ? 'Active Test' : 'فعال در تست') : (isEn ? 'Simulate' : 'شبیه‌سازی')}</span>
      </button>
    );
  };

  const renderActionButtons = (policy: AccessPolicy) => {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleStartEdit(policy)}
          className={`p-1.5 rounded-lg transition cursor-pointer ${
            isLight
              ? 'text-slate-600 hover:text-cyan-700 hover:bg-slate-200/70'
              : 'text-slate-300 hover:text-cyan-300 hover:bg-white/10'
          }`}
          title={isEn ? 'Edit Policy' : 'ویرایش پالیسی'}
        >
          <Edit className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={(e) => handleDuplicatePolicy(policy, e)}
          className={`p-1.5 rounded-lg transition cursor-pointer ${
            isLight
              ? 'text-slate-600 hover:text-indigo-700 hover:bg-slate-200/70'
              : 'text-slate-300 hover:text-indigo-300 hover:bg-white/10'
          }`}
          title={isEn ? 'Duplicate Policy' : 'تکثیر و کپی پالیسی'}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>

        {policies.length > 1 && (
          <button
            type="button"
            onClick={(e) => handleDeletePolicy(policy.id, e)}
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              isLight
                ? 'text-slate-600 hover:text-rose-700 hover:bg-rose-100'
                : 'text-slate-300 hover:text-rose-400 hover:bg-rose-500/10'
            }`}
            title={isEn ? 'Delete Policy' : 'حذف پالیسی'}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Role Simulator Header Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-cyan-900/30 border border-indigo-500/30 shadow-lg backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-inner">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-white">
                {isEn ? 'Multi-Vendor Granular RBAC Engine' : 'موتور کنترل دسترسی مبتنی بر نقش (RBAC چند وندوری)'}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {isEn ? 'Cisco • MikroTik • Linux' : 'سیسکو • میکروتیک • لینوکس'}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              {isEn
                ? 'Control exact CLI commands, port states, and modal privileges per vendor across network nodes.'
                : 'مدیریت تفکیک‌شده اختیارات ترمینال، تغییرات پورت، ویلن و کانفیگ برای تجهیزات سیسکو، میکروتیک و لینوکس'}
            </p>
          </div>
        </div>

        {/* Live Simulator Role Selector */}
        <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-900/80 border border-white/10 self-start md:self-auto">
          <span className="text-[11px] font-semibold text-amber-300 pl-2 rtl:pr-2 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>{isEn ? 'Active Test Role:' : 'نقش تستی فعال:'}</span>
          </span>
          <select
            value={activeSimulatedPolicyId}
            onChange={(e) => onSelectSimulatedPolicy(e.target.value)}
            className="px-3 py-1 rounded-lg bg-slate-800 border border-white/15 text-white text-xs font-semibold focus:outline-none focus:border-cyan-400 cursor-pointer"
          >
            <option value="actual-user">
              {isEn ? '🔒 Authentic Database Policy (Live Token Session)' : '🔒 سطح دسترسی واقعی از دیتابیس (سشن معتبر توکن)'}
            </option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.subjectName})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Policies List Header & Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={`font-bold text-sm flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>{isEn ? 'Configured Access Policies' : 'پالیسی‌های دسترسی تعریف‌شده'}</span>
          </h3>
          <span className={`px-2 py-0.5 rounded-full text-xs font-mono border ${
            isLight ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-slate-800 text-slate-300 border-white/10'
          }`}>
            {policies.length}
          </span>
          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>
              {isEn
                ? `DB: ${liveLocalUsers.length} Users • ${liveLocalGroups.length} Groups • ${liveDeviceGroups.length} Device Groups`
                : `دیتابیس: ${liveLocalUsers.length} کاربر • ${liveLocalGroups.length} گروه • ${liveDeviceGroups.length} گروه تجهیزات`}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshDatabaseData}
            disabled={isSyncingDb}
            title={isEn ? 'Reload live users, groups, and device scopes from database' : 'بارگذاری مجدد کاربران، گروه‌ها و تجهیزات از دیتابیس'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
              isLight
                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isSyncingDb ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isEn ? 'Sync DB' : 'همگام‌سازی دیتابیس'}</span>
          </button>

          <button
            onClick={handleStartCreate}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isEn ? 'Create Access Policy' : 'تعریف پالیسی جدید'}</span>
          </button>
        </div>
      </div>

      {/* Interactive Controls Toolbar: Search, Filters, View Modes & Column Customizer */}
      <div className={`p-3 rounded-2xl border backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 ${
        isLight
          ? 'bg-slate-50 border-slate-200 shadow-sm'
          : 'bg-slate-900/60 border-white/10'
      }`}>
        {/* Left Side: Search & Filter Inputs */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 ${
              isRtl ? 'right-3' : 'left-3'
            } text-slate-400 pointer-events-none`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isEn ? 'Search policies, subjects, scopes...' : 'جستجوی پالیسی، هویت، محدوده...'}
              className={`w-full py-1.5 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-cyan-500 transition ${
                isRtl ? 'pr-8 pl-8' : 'pl-8 pr-8'
              } ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  : 'bg-slate-950/80 border-white/15 text-white placeholder-slate-500'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className={`absolute top-1/2 -translate-y-1/2 ${
                  isRtl ? 'left-2.5' : 'right-2.5'
                } text-slate-400 hover:text-white p-0.5 rounded cursor-pointer`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Subject Type Filter */}
          <select
            value={subjectTypeFilter}
            onChange={(e) => setSubjectTypeFilter(e.target.value as any)}
            className={`px-2.5 py-1.5 text-xs rounded-xl border cursor-pointer focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
              isLight
                ? 'bg-white border-slate-300 text-slate-700'
                : 'bg-slate-950/80 border-white/15 text-slate-300'
            }`}
          >
            <option value="all">{isEn ? 'All Identity Types' : 'همه انواع هویت'}</option>
            <option value="ad_user">{isEn ? 'AD Users' : 'کاربران AD'}</option>
            <option value="ad_group">{isEn ? 'AD Groups' : 'گروه‌های AD'}</option>
            <option value="local_user">{isEn ? 'Local Users' : 'کاربران محلی'}</option>
            <option value="local_group">{isEn ? 'Local Groups' : 'گروه‌های محلی'}</option>
          </select>

          {/* Scope Filter */}
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as any)}
            className={`px-2.5 py-1.5 text-xs rounded-xl border cursor-pointer focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
              isLight
                ? 'bg-white border-slate-300 text-slate-700'
                : 'bg-slate-950/80 border-white/15 text-slate-300'
            }`}
          >
            <option value="all">{isEn ? 'All Target Scopes' : 'همه محدوده‌ها'}</option>
            <option value="all_devices">{isEn ? 'Entire Fleet (All Nodes)' : 'کل شبکه (تمام دستگاه‌ها)'}</option>
            <option value="groups">{isEn ? 'Device Groups' : 'گروه‌های تجهیزات'}</option>
            <option value="specific">{isEn ? 'Specific Nodes' : 'دستگاه‌های مشخص'}</option>
          </select>
        </div>

        {/* Right Side: View Mode Switcher & Column Picker */}
        <div className="flex items-center gap-2">
          {/* View Mode Switcher (List, Table, Grid) */}
          <div
            className={`flex items-center p-0.5 rounded-xl border ${
              isLight ? 'bg-slate-100 border-slate-300' : 'bg-slate-950/80 border-white/15'
            }`}
          >
            <button
              type="button"
              onClick={() => handleViewModeChange('list')}
              title={isEn ? 'List View (Default)' : 'نمایش لیستی (پیش‌فرض)'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('table')}
              title={isEn ? 'Dense Table View' : 'نمایش جدولی متراکم'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TableIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('grid')}
              title={isEn ? 'Grid Cards View' : 'نمایش کارت‌ها'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Column Visibility Selector (Persisted in localStorage) */}
          <div className="relative">
            <button
              ref={columnPickerBtnRef}
              type="button"
              onClick={handleToggleColumnPicker}
              title={isEn ? 'Customize Visible Columns' : 'سفارشی‌سازی ستون‌های جدول'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
                isColumnPickerOpen
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                  : isLight
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  : 'bg-slate-950/80 border-white/15 text-slate-300 hover:bg-white/10'
              }`}
            >
              <Columns3 className="w-4 h-4 text-cyan-400" />
              <span className="hidden sm:inline">{isEn ? 'Columns' : 'ستون‌ها'}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-bold">
                {Object.values(visibleColumns).filter(Boolean).length}/{POLICY_COLUMN_ITEMS.length}
              </span>
            </button>

            {isColumnPickerOpen &&
              columnPickerCoords &&
              createPortal(
                <div
                  ref={columnDropdownRef}
                  style={{
                    position: 'fixed',
                    top: `${columnPickerCoords.top}px`,
                    left: `${columnPickerCoords.left}px`,
                    width: '17rem',
                  }}
                  className={`z-[1000000] rounded-2xl shadow-2xl p-3 border font-sans backdrop-blur-2xl animate-in fade-in zoom-in-95 ${
                    isEn ? 'text-left' : 'text-right'
                  } ${
                    isLight
                      ? 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-900/25'
                      : 'bg-slate-950/95 border-white/15 text-slate-100 shadow-black/80'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Columns3 className="w-3.5 h-3.5 text-cyan-400" />
                      {isEn ? 'Visible Columns' : 'ستون‌های قابل نمایش'}
                    </span>
                    <button
                      type="button"
                      onClick={resetColumns}
                      className="text-[10px] text-cyan-400 hover:underline cursor-pointer"
                    >
                      {isEn ? 'Reset' : 'بازنشانی'}
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {POLICY_COLUMN_ITEMS.map((col) => (
                      <label
                        key={col.key}
                        className={`flex items-center justify-between p-1.5 rounded-lg text-xs cursor-pointer transition ${
                          isLight ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                        }`}
                      >
                        <span className="truncate pr-2 rtl:pl-2">
                          {isEn ? col.labelEn : col.labelFa}
                        </span>
                        <input
                          type="checkbox"
                          checked={visibleColumns[col.key]}
                          onChange={() => toggleColumn(col.key)}
                          className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-white/20 focus:ring-cyan-500 accent-cyan-500 cursor-pointer"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="pt-2 mt-2 border-t border-white/10 flex justify-between items-center text-[10px]">
                    <button
                      type="button"
                      onClick={selectAllColumns}
                      className="text-cyan-400 hover:underline cursor-pointer"
                    >
                      {isEn ? 'Select All' : 'انتخاب همه'}
                    </button>
                    <span className="text-slate-400 font-mono">
                      {Object.values(visibleColumns).filter(Boolean).length}/{POLICY_COLUMN_ITEMS.length}
                    </span>
                  </div>
                </div>,
                document.body
              )}
          </div>
        </div>
      </div>

      {/* Main View Display: List, Table, or Grid */}
      {filteredPolicies.length === 0 ? (
        <div className={`p-8 text-center rounded-2xl border ${
          isLight ? 'bg-white border-slate-200 text-slate-500' : 'bg-slate-900/40 border-white/10 text-slate-400'
        }`}>
          <ShieldAlert className="w-8 h-8 mx-auto text-amber-400/60 mb-2" />
          <p className="text-xs font-semibold">
            {isEn ? 'No access policies match the active search or filter criteria.' : 'هیچ پالیسی دسترسی با فیلترها یا عبارت جستجوی فعلی یافت نشد.'}
          </p>
          {(searchQuery || subjectTypeFilter !== 'all' || scopeFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSubjectTypeFilter('all');
                setScopeFilter('all');
              }}
              className="mt-3 px-3 py-1 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-xs font-semibold border border-cyan-500/30 transition cursor-pointer"
            >
              {isEn ? 'Clear All Filters' : 'پاک‌سازی تمام فیلترها'}
            </button>
          )}
        </div>
      ) : viewMode === 'list' ? (
        /* 1. Structured List View (DEFAULT - spatial-glass table) */
        <div className={`rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl border ${
          isLight ? 'bg-white border-slate-200 shadow-slate-200/50' : 'spatial-glass border-white/10'
        }`}>
          <div className="overflow-x-auto min-h-[340px]">
            <table className={`w-full ${isEn ? 'text-left' : 'text-right'} text-xs border-collapse`}>
              <thead>
                <tr className={`border-b-2 text-[11px] font-bold uppercase tracking-wider font-mono ${
                  isLight
                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                    : 'bg-slate-950/80 text-slate-300 border-white/15'
                }`}>
                  {visibleColumns.policy && (
                    <th className={`p-3.5 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/15'}`}>
                      {isEn ? 'Policy Name & Description' : 'نام و توضیحات پالیسی'}
                    </th>
                  )}
                  {visibleColumns.subject && (
                    <th className={`p-3.5 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/15'}`}>
                      {isEn ? 'Subject & Identity' : 'هویت و کاربر/گروه'}
                    </th>
                  )}
                  {visibleColumns.priority && (
                    <th className={`p-3.5 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/15'}`}>
                      {isEn ? 'Priority' : 'اولویت'}
                    </th>
                  )}
                  {visibleColumns.scope && (
                    <th className={`p-3.5 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/15'}`}>
                      {isEn ? 'Target Scope' : 'محدوده هدف'}
                    </th>
                  )}
                  {visibleColumns.views && (
                    <th className={`p-3.5 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/15'}`}>
                      {isEn ? 'UI Views' : 'صفحات پنل'}
                    </th>
                  )}
                  {visibleColumns.cisco && (
                    <th className={`p-3.5 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/15'}`}>
                      {isEn ? 'Cisco Capabilities' : 'اختیارات سیسکو'}
                    </th>
                  )}
                  {visibleColumns.mikrotik && (
                    <th className={`p-3.5 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/15'}`}>
                      {isEn ? 'MikroTik Capabilities' : 'اختیارات میکروتیک'}
                    </th>
                  )}
                  {visibleColumns.servers && (
                    <th className={`p-3.5 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/15'}`}>
                      {isEn ? 'Linux Fleet' : 'ناوگان سرورها'}
                    </th>
                  )}
                  {visibleColumns.templates && (
                    <th className={`p-3.5 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/15'}`}>
                      {isEn ? 'Templates & DR' : 'الگوها و بکاپ'}
                    </th>
                  )}
                  {visibleColumns.simulation && (
                    <th className={`p-3.5 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/15'}`}>
                      {isEn ? 'Test Role' : 'شبیه‌سازی'}
                    </th>
                  )}
                  {visibleColumns.actions && (
                    <th className="p-3.5 text-center">
                      {isEn ? 'Actions' : 'عملیات'}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-white/10'}`}>
                {paginatedPolicies.map((policy) => {
                  const isCurrent = policy.id === activeSimulatedPolicyId;

                  return (
                    <tr
                      key={policy.id}
                      className={`transition-colors ${
                        isCurrent
                          ? isLight
                            ? 'bg-cyan-50/70'
                            : 'bg-cyan-950/20'
                          : isLight
                          ? 'hover:bg-slate-50'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      {visibleColumns.policy && (
                        <td className={`p-3 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-white/5 border border-white/10 shrink-0">
                              {policy.subjectType === 'ad_group' ? (
                                <Users className="w-4 h-4 text-cyan-400" />
                              ) : policy.subjectType === 'ad_user' ? (
                                <User className="w-4 h-4 text-emerald-400" />
                              ) : policy.subjectType === 'local_group' ? (
                                <FolderTree className="w-4 h-4 text-purple-400" />
                              ) : (
                                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className={`font-bold text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                  {policy.name}
                                </span>
                                {isCurrent && (
                                  <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 font-bold">
                                    ACTIVE
                                  </span>
                                )}
                              </div>
                              <p className="text-[10.5px] text-slate-400 line-clamp-1 max-w-xs mt-0.5">
                                {policy.description}
                              </p>
                            </div>
                          </div>
                        </td>
                      )}

                      {visibleColumns.subject && (
                        <td className={`p-3 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                          <div className="space-y-1">
                            {renderSubjectTypeBadge(policy)}
                            <div className="text-[11px] font-mono font-semibold text-cyan-400">
                              {policy.subjectName}
                            </div>
                          </div>
                        </td>
                      )}

                      {visibleColumns.priority && (
                        <td className={`p-3 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                          {renderPriorityBadge(policy)}
                        </td>
                      )}

                      {visibleColumns.scope && (
                        <td className={`p-3 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                          {renderScopeBadge(policy)}
                        </td>
                      )}

                      {visibleColumns.views && (
                        <td className={`p-3 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                          {renderViewsBadge(policy)}
                        </td>
                      )}

                      {visibleColumns.cisco && (
                        <td className={`p-3 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                          {renderCiscoBadge(policy)}
                        </td>
                      )}

                      {visibleColumns.mikrotik && (
                        <td className={`p-3 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                          {renderMikrotikBadge(policy)}
                        </td>
                      )}

                      {visibleColumns.servers && (
                        <td className={`p-3 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                          {renderServersBadge(policy)}
                        </td>
                      )}

                      {visibleColumns.templates && (
                        <td className={`p-3 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                          {renderTemplatesBadge(policy)}
                        </td>
                      )}

                      {visibleColumns.simulation && (
                        <td className={`p-3 ${isEn ? 'border-r' : 'border-l'} ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                          {renderSimulationButton(policy)}
                        </td>
                      )}

                      {visibleColumns.actions && (
                        <td className="p-3 text-center">
                          {renderActionButtons(policy)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        /* 2. Dense Compact Table View */
        <div className={`rounded-2xl border overflow-hidden shadow-xl backdrop-blur-xl ${
          isLight ? 'bg-white border-slate-200' : 'spatial-glass border-white/10'
        }`}>
          <div className="overflow-x-auto min-h-[320px]">
            <table className={`w-full ${isEn ? 'text-left' : 'text-right'} text-xs border-collapse`}>
              <thead>
                <tr className={`border-b text-[10px] font-mono uppercase ${
                  isLight
                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                    : 'border-white/10 bg-slate-950/80 text-slate-400'
                }`}>
                  {visibleColumns.policy && <th className="p-2.5">{isEn ? 'Policy' : 'پالیسی'}</th>}
                  {visibleColumns.subject && <th className="p-2.5">{isEn ? 'Identity' : 'هویت'}</th>}
                  {visibleColumns.priority && <th className="p-2.5">{isEn ? 'Priority' : 'اولویت'}</th>}
                  {visibleColumns.scope && <th className="p-2.5">{isEn ? 'Scope' : 'محدوده'}</th>}
                  {visibleColumns.views && <th className="p-2.5">{isEn ? 'Views' : 'صفحات'}</th>}
                  {visibleColumns.cisco && <th className="p-2.5">Cisco</th>}
                  {visibleColumns.mikrotik && <th className="p-2.5">MikroTik</th>}
                  {visibleColumns.servers && <th className="p-2.5">Servers</th>}
                  {visibleColumns.templates && <th className="p-2.5">Templates</th>}
                  {visibleColumns.simulation && <th className="p-2.5">{isEn ? 'Sim' : 'تست'}</th>}
                  {visibleColumns.actions && <th className="p-2.5 text-center">{isEn ? 'Actions' : 'عملیات'}</th>}
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-white/10'}`}>
                {paginatedPolicies.map((policy) => {
                  const isCurrent = policy.id === activeSimulatedPolicyId;

                  return (
                    <tr
                      key={policy.id}
                      className={`transition-colors ${
                        isCurrent
                          ? isLight
                            ? 'bg-cyan-50/70'
                            : 'bg-cyan-950/20'
                          : isLight
                          ? 'hover:bg-slate-50'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      {visibleColumns.policy && (
                        <td className="p-2.5">
                          <div className="font-bold text-xs truncate max-w-[160px]">{policy.name}</div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[160px]">{policy.description}</div>
                        </td>
                      )}
                      {visibleColumns.subject && (
                        <td className="p-2.5 font-mono text-[11px]">
                          {policy.subjectName}
                        </td>
                      )}
                      {visibleColumns.priority && (
                        <td className="p-2.5">
                          {renderPriorityBadge(policy)}
                        </td>
                      )}
                      {visibleColumns.scope && (
                        <td className="p-2.5">
                          {renderScopeBadge(policy)}
                        </td>
                      )}
                      {visibleColumns.views && (
                        <td className="p-2.5">
                          {renderViewsBadge(policy)}
                        </td>
                      )}
                      {visibleColumns.cisco && (
                        <td className="p-2.5">
                          {renderCiscoBadge(policy)}
                        </td>
                      )}
                      {visibleColumns.mikrotik && (
                        <td className="p-2.5">
                          {renderMikrotikBadge(policy)}
                        </td>
                      )}
                      {visibleColumns.servers && (
                        <td className="p-2.5">
                          {renderServersBadge(policy)}
                        </td>
                      )}
                      {visibleColumns.templates && (
                        <td className="p-2.5">
                          {renderTemplatesBadge(policy)}
                        </td>
                      )}
                      {visibleColumns.simulation && (
                        <td className="p-2.5">
                          {renderSimulationButton(policy)}
                        </td>
                      )}
                      {visibleColumns.actions && (
                        <td className="p-2.5 text-center">
                          {renderActionButtons(policy)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* 3. Grid Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {paginatedPolicies.map((policy) => {
            const isCurrent = policy.id === activeSimulatedPolicyId;

            return (
              <div
                key={policy.id}
                className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
                  isCurrent
                    ? isLight
                      ? 'bg-cyan-50/70 border-cyan-400 shadow-lg shadow-cyan-500/10'
                      : 'bg-slate-900/90 border-cyan-500/60 shadow-lg shadow-cyan-500/10'
                    : isLight
                    ? 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                    : 'bg-slate-900/60 border-white/10 hover:border-white/20'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-white/5 border border-white/10">
                        {policy.subjectType === 'ad_group' ? (
                          <Users className="w-4 h-4 text-cyan-400" />
                        ) : policy.subjectType === 'ad_user' ? (
                          <User className="w-4 h-4 text-emerald-400" />
                        ) : policy.subjectType === 'local_group' ? (
                          <FolderTree className="w-4 h-4 text-purple-400" />
                        ) : (
                          <ShieldCheck className="w-4 h-4 text-indigo-400" />
                        )}
                      </div>
                      <div>
                        <h4 className={`font-bold text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          {policy.name}
                        </h4>
                        <span className="text-[10px] text-cyan-400 font-mono">
                          {policy.subjectName}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {renderPriorityBadge(policy)}
                      {isCurrent && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 font-bold">
                          ACTIVE
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">{policy.description}</p>

                  {/* Target Scope Pill */}
                  <div className="mt-2.5 flex items-center justify-between gap-1 text-[10px] font-mono text-slate-300">
                    <div className="flex items-center gap-1.5">
                      <FolderTree className="w-3.5 h-3.5 text-amber-400" />
                      <span>{isEn ? 'Target:' : 'محدوده:'}</span>
                      {renderScopeBadge(policy)}
                    </div>
                    {renderViewsBadge(policy)}
                  </div>

                  {/* Vendor Badges */}
                  <div className="space-y-1.5 mt-2.5 pt-2 border-t border-white/5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono text-slate-400 w-12 shrink-0">Cisco:</span>
                      {renderCiscoBadge(policy)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono text-slate-400 w-12 shrink-0">MikroTik:</span>
                      {renderMikrotikBadge(policy)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono text-slate-400 w-12 shrink-0">Servers:</span>
                      {renderServersBadge(policy)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono text-slate-400 w-12 shrink-0">Backup:</span>
                      {renderTemplatesBadge(policy)}
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="pt-2 mt-3 border-t border-white/10 flex items-center justify-between">
                  {renderSimulationButton(policy)}
                  {renderActionButtons(policy)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination & Summary Footer Controls */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl border ${
        isLight
          ? 'bg-slate-100 border-slate-200 text-slate-800'
          : 'bg-slate-900/60 border-white/10 text-slate-300'
      }`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-mono">
            {totalItems === 0
              ? (isEn ? 'No policies' : 'بدون پالیسی')
              : isEn
              ? `Showing ${startIndex + 1}-${endIndex} of ${totalItems} policies`
              : `نمایش ${startIndex + 1} تا ${endIndex} از ${totalItems} پالیسی`}
          </span>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] text-slate-400">{isEn ? 'Per page:' : 'تعداد در صفحه:'}</span>
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className={`px-2 py-1 rounded-lg text-xs font-mono border cursor-pointer ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-800'
                  : 'bg-slate-800 border-white/15 text-white'
              }`}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={-1}>{isEn ? 'All' : 'همه'}</option>
            </select>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1 self-center sm:self-auto">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage(1)}
              className={`p-1.5 rounded-lg border transition disabled:opacity-30 disabled:cursor-not-allowed ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'bg-slate-800 border-white/15 text-slate-300 hover:bg-white/10'
              }`}
              title={isEn ? 'First Page' : 'صفحه نخست'}
            >
              {isRtl ? <ChevronsRight className="w-3.5 h-3.5" /> : <ChevronsLeft className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className={`p-1.5 rounded-lg border transition disabled:opacity-30 disabled:cursor-not-allowed ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'bg-slate-800 border-white/15 text-slate-300 hover:bg-white/10'
              }`}
              title={isEn ? 'Previous Page' : 'صفحه قبل'}
            >
              {isRtl ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>

            {/* Page Numbers */}
            <div className="flex items-center gap-1 mx-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((page) => {
                  if (totalPages <= 7) return true;
                  if (page === 1 || page === totalPages) return true;
                  return Math.abs(page - safePage) <= 1;
                })
                .map((page, idx, arr) => {
                  const prev = arr[idx - 1];
                  const hasGap = prev && page - prev > 1;

                  return (
                    <React.Fragment key={page}>
                      {hasGap && <span className="px-1 text-slate-400 text-xs font-mono">...</span>}
                      <button
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                          page === safePage
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : isLight
                            ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                            : 'bg-slate-800 border border-white/15 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {page}
                      </button>
                    </React.Fragment>
                  );
                })}
            </div>

            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className={`p-1.5 rounded-lg border transition disabled:opacity-30 disabled:cursor-not-allowed ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'bg-slate-800 border-white/15 text-slate-300 hover:bg-white/10'
              }`}
              title={isEn ? 'Next Page' : 'صفحه بعد'}
            >
              {isRtl ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage(totalPages)}
              className={`p-1.5 rounded-lg border transition disabled:opacity-30 disabled:cursor-not-allowed ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'bg-slate-800 border-white/15 text-slate-300 hover:bg-white/10'
              }`}
              title={isEn ? 'Last Page' : 'صفحه آخر'}
            >
              {isRtl ? <ChevronsLeft className="w-3.5 h-3.5" /> : <ChevronsRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>

      {/* Modern Tabbed Universal Access Policy Modal */}
      {isPolicyModalOpen && editingPolicy && (
        <AccessPolicyModal
          isOpen={isPolicyModalOpen}
          onClose={() => {
            setIsPolicyModalOpen(false);
            if (editingPolicy) {
              undockModal(`access-policy-${editingPolicy.id || 'new'}`);
            }
            setEditingPolicy(null);
          }}
          onMinimize={() => {
            if (editingPolicy) {
              dockModal({
                id: `access-policy-${editingPolicy.id || 'new'}`,
                labelEn: isCreating ? 'New Access Policy' : `Policy: ${editingPolicy.name || 'Edit'}`,
                labelFa: isCreating ? 'تعریف پالیسی دسترسی' : `پالیسی: ${editingPolicy.name || 'ویرایش'}`,
                badge: 'RBAC',
                category: 'config',
                onRestore: () => {
                  setIsPolicyModalOpen(true);
                },
                onClose: () => {
                  setIsPolicyModalOpen(false);
                  setEditingPolicy(null);
                },
              });
            }
            setIsPolicyModalOpen(false);
          }}
          isCreating={isCreating}
          editingPolicy={editingPolicy}
          onSavePolicy={async (policy) => {
            handleSavePolicy(undefined, policy);
            undockModal(`access-policy-${policy.id || 'new'}`);
          }}
          isLightMode={isLight}
          liveLocalUsers={liveLocalUsers}
          liveLocalGroups={liveLocalGroups}
          liveAdConfig={liveAdConfig}
          devices={devices}
          liveDeviceGroups={liveDeviceGroups}
          liveServers={liveServers}
        />
      )}
    </div>
  );
};
