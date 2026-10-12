import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Info
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
  const [vendorFilter, setVendorFilter] = useState<'all' | 'cisco' | 'mikrotik' | 'generic' | 'servers' | 'devices'>('all');

  // Live database-backed states for subjects and scopes
  const [liveLocalUsers, setLiveLocalUsers] = useState<LocalUser[]>(localUsers);
  const [liveLocalGroups, setLiveLocalGroups] = useState<LocalGroup[]>(localGroups);
  const [liveDeviceGroups, setLiveDeviceGroups] = useState<DeviceGroup[]>(groups);
  const [liveAdConfig, setLiveAdConfig] = useState<ActiveDirectoryConfig>(adConfig);
  const [liveServers, setLiveServers] = useState<RemoteServer[]>([]);
  const [serverSearchQuery, setServerSearchQuery] = useState('');
  const [serverMatrixFilter, setServerMatrixFilter] = useState<'all' | 'custom_only' | 'default_only'>('all');
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');
  const [deviceMatrixFilter, setDeviceMatrixFilter] = useState<'all' | 'custom_only' | 'default_only'>('all');
  const [deviceTypeMatrixFilter, setDeviceTypeMatrixFilter] = useState<'all' | 'switch' | 'router' | 'firewall' | 'other'>('all');
  const [isSyncingDb, setIsSyncingDb] = useState<boolean>(false);

  // Search and selector state for AD User target identity in RBAC policy modal
  const [adUserSearchQuery, setAdUserSearchQuery] = useState('');
  const [isAdUserDropdownOpen, setIsAdUserDropdownOpen] = useState(false);

  // Search and selector state for AD Group target identity in RBAC policy modal
  const [adGroupSearchQuery, setAdGroupSearchQuery] = useState('');
  const [isAdGroupDropdownOpen, setIsAdGroupDropdownOpen] = useState(false);

  // Search and selector state for Local User target identity in RBAC policy modal
  const [localUserSearchQuery, setLocalUserSearchQuery] = useState('');
  const [isLocalUserDropdownOpen, setIsLocalUserDropdownOpen] = useState(false);

  // Search and selector state for Local Group target identity in RBAC policy modal
  const [localGroupSearchQuery, setLocalGroupSearchQuery] = useState('');
  const [isLocalGroupDropdownOpen, setIsLocalGroupDropdownOpen] = useState(false);

  // Filter AD users for RBAC policy creation/editing
  const filteredAdUsersForRbac = useMemo(() => {
    const list = liveAdConfig.syncedUsers || [];
    if (!adUserSearchQuery.trim()) {
      return list;
    }
    const q = adUserSearchQuery.trim().toLowerCase();
    return list.filter((u) => {
      const sam = String(u.samAccountName || '').toLowerCase();
      const name = String(u.displayName || '').toLowerCase();
      const mail = String(u.email || '').toLowerCase();
      const dept = String(u.department || '').toLowerCase();
      const title = String(u.title || '').toLowerCase();
      return (
        sam.includes(q) ||
        name.includes(q) ||
        mail.includes(q) ||
        dept.includes(q) ||
        title.includes(q)
      );
    });
  }, [liveAdConfig.syncedUsers, adUserSearchQuery]);

  const currentSelectedAdUser = useMemo(() => {
    if (!editingPolicy || editingPolicy.subjectType !== 'ad_user') return null;
    return (
      (liveAdConfig.syncedUsers || []).find(
        (u) => u.samAccountName === editingPolicy.subjectId || u.dn === editingPolicy.subjectId
      ) || null
    );
  }, [liveAdConfig.syncedUsers, editingPolicy?.subjectId, editingPolicy?.subjectType]);

  // Filter AD groups for RBAC policy creation/editing
  const filteredAdGroupsForRbac = useMemo(() => {
    const list = liveAdConfig.syncedGroups || [];
    if (!adGroupSearchQuery.trim()) {
      return list;
    }
    const q = adGroupSearchQuery.trim().toLowerCase();
    return list.filter((g) => {
      const cn = String(g.cn || '').toLowerCase();
      const desc = String(g.description || '').toLowerCase();
      const dn = String(g.dn || '').toLowerCase();
      return cn.includes(q) || desc.includes(q) || dn.includes(q);
    });
  }, [liveAdConfig.syncedGroups, adGroupSearchQuery]);

  const currentSelectedAdGroup = useMemo(() => {
    if (!editingPolicy || editingPolicy.subjectType !== 'ad_group') return null;
    return (
      (liveAdConfig.syncedGroups || []).find(
        (g) => g.dn === editingPolicy.subjectId
      ) || null
    );
  }, [liveAdConfig.syncedGroups, editingPolicy?.subjectId, editingPolicy?.subjectType]);

  // Filter Local Users for RBAC policy creation/editing
  const filteredLocalUsersForRbac = useMemo(() => {
    const list = liveLocalUsers || [];
    if (!localUserSearchQuery.trim()) {
      return list;
    }
    const q = localUserSearchQuery.trim().toLowerCase();
    return list.filter((u) => {
      const fn = String(u.fullName || '').toLowerCase();
      const un = String(u.username || '').toLowerCase();
      const em = String(u.email || '').toLowerCase();
      const ro = String(u.role || '').toLowerCase();
      return fn.includes(q) || un.includes(q) || em.includes(q) || ro.includes(q);
    });
  }, [liveLocalUsers, localUserSearchQuery]);

  const currentSelectedLocalUser = useMemo(() => {
    if (!editingPolicy || editingPolicy.subjectType !== 'local_user') return null;
    return (
      (liveLocalUsers || []).find(
        (u) => u.id === editingPolicy.subjectId || u.username === editingPolicy.subjectId
      ) || null
    );
  }, [liveLocalUsers, editingPolicy?.subjectId, editingPolicy?.subjectType]);

  // Filter Local Groups for RBAC policy creation/editing
  const filteredLocalGroupsForRbac = useMemo(() => {
    const list = liveLocalGroups || [];
    if (!localGroupSearchQuery.trim()) {
      return list;
    }
    const q = localGroupSearchQuery.trim().toLowerCase();
    return list.filter((g) => {
      const nm = String(g.name || '').toLowerCase();
      const ds = String(g.description || '').toLowerCase();
      return nm.includes(q) || ds.includes(q);
    });
  }, [liveLocalGroups, localGroupSearchQuery]);

  const currentSelectedLocalGroup = useMemo(() => {
    if (!editingPolicy || editingPolicy.subjectType !== 'local_group') return null;
    return (
      (liveLocalGroups || []).find(
        (g) => g.id === editingPolicy.subjectId
      ) || null
    );
  }, [liveLocalGroups, editingPolicy?.subjectId, editingPolicy?.subjectType]);

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

      // fetchRemoteServers() returns { success: boolean; count: number; servers: RemoteServer[] }
      const parsedServers: RemoteServer[] = Array.isArray(dbServers)
        ? dbServers
        : Array.isArray((dbServers as any)?.servers)
        ? (dbServers as any).servers
        : [];

      if (parsedServers.length > 0) {
        setLiveServers(parsedServers);
        finalServers = parsedServers;
      } else {
        // Fallback: direct fetch from /api/remote-servers
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
  }, [localUsers, localGroups, groups, adConfig, liveLocalUsers, liveLocalGroups, liveDeviceGroups, liveAdConfig, liveServers]);

  useEffect(() => {
    refreshDatabaseData();
  }, [refreshDatabaseData]);

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
      canApplyTemplates: false,
      canBatchOperate: false,
      // Backup & Disaster Recovery
      canExportBackup: false,
      canImportBackup: false,
      // Server Fleet & 3-Dots Action Permissions
      defaultServerPermissions: {
        terminal: false,
        file_explorer: true,
        server_management: true,
        web_management: false,
        database_management: false,
        power_control: false,
        edit_properties: false,
        delete_server: false,
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
    setVendorFilter('all');
    setServerSearchQuery('');
    setDeviceSearchQuery('');
    setDeviceMatrixFilter('all');
    setDeviceTypeMatrixFilter('all');
    setAdUserSearchQuery('');
    setIsAdUserDropdownOpen(false);
    setAdGroupSearchQuery('');
    setIsAdGroupDropdownOpen(false);
    setLocalUserSearchQuery('');
    setIsLocalUserDropdownOpen(false);
    setLocalGroupSearchQuery('');
    setIsLocalGroupDropdownOpen(false);
  };

  const handleStartEdit = (policy: AccessPolicy) => {
    refreshDatabaseData();
    setEditingPolicy({
      ...policy,
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
    setVendorFilter('all');
    setServerSearchQuery('');
    setDeviceSearchQuery('');
    setDeviceMatrixFilter('all');
    setDeviceTypeMatrixFilter('all');
    setAdUserSearchQuery('');
    setIsAdUserDropdownOpen(false);
    setAdGroupSearchQuery('');
    setIsAdGroupDropdownOpen(false);
    setLocalUserSearchQuery('');
    setIsLocalUserDropdownOpen(false);
    setLocalGroupSearchQuery('');
    setIsLocalGroupDropdownOpen(false);
  };

  // Real-time calculation of permitted devices based on current targetScope selection
  const permittedScopeDevices = useMemo(() => {
    if (!editingPolicy) return [];
    if (editingPolicy.targetScope === 'all') return devices;
    if (editingPolicy.targetScope === 'groups') {
      const selectedGroupSet = new Set(
        (editingPolicy.targetGroupIds || []).map((id) => (id || '').trim().toLowerCase())
      );
      const devIdSet = new Set<string>();
      for (const g of liveDeviceGroups) {
        const gid = (g.id || '').trim().toLowerCase();
        const gname = (g.name || '').trim().toLowerCase();
        if (selectedGroupSet.has(gid) || selectedGroupSet.has(gname)) {
          const ids = g.deviceIds || (g as any).device_ids || [];
          ids.forEach((id: string) => devIdSet.add(id));
        }
      }
      return devices.filter((d) => devIdSet.has(d.id));
    }
    if (editingPolicy.targetScope === 'specific') {
      const specificSet = new Set(editingPolicy.targetDeviceIds || []);
      return devices.filter((d) => specificSet.has(d.id));
    }
    return [];
  }, [editingPolicy, liveDeviceGroups, devices]);

  // Real-time calculation of permitted servers based on current targetScope selection
  const permittedScopeServers = useMemo(() => {
    if (!editingPolicy) return [];
    if (editingPolicy.canViewServers === false) return [];
    if (editingPolicy.targetScope === 'all') return liveServers;

    if (editingPolicy.targetScope === 'groups') {
      const targetGroupIds: string[] = [
        ...(Array.isArray(editingPolicy.targetGroupIds) ? editingPolicy.targetGroupIds : []),
        ...(Array.isArray((editingPolicy as any).target_group_ids) ? (editingPolicy as any).target_group_ids : []),
      ];
      const selectedGroupSet = new Set(
        targetGroupIds.map((id) => (id || '').trim().toLowerCase())
      );

      const srvIdSet = new Set<string>();
      for (const g of liveDeviceGroups) {
        const gid = (g.id || '').trim().toLowerCase();
        const gname = (g.name || '').trim().toLowerCase();
        if (selectedGroupSet.has(gid) || selectedGroupSet.has(gname)) {
          const sIds: string[] = Array.isArray((g as any).serverIds)
            ? (g as any).serverIds
            : Array.isArray((g as any).server_ids)
            ? (g as any).server_ids
            : [];
          const dIds: string[] = Array.isArray(g.deviceIds)
            ? g.deviceIds
            : Array.isArray((g as any).device_ids)
            ? (g as any).device_ids
            : [];

          sIds.forEach((id: string) => {
            if (id) srvIdSet.add(id.trim().toLowerCase());
          });
          dIds.forEach((id: string) => {
            if (id) srvIdSet.add(id.trim().toLowerCase());
          });
        }
      }

      return liveServers.filter((s) => {
        const sid = (s.id || '').trim().toLowerCase();
        const sname = (s.name || '').trim().toLowerCase();
        const shost = (s.hostname || '').trim().toLowerCase();
        const sip = ((s.ip || (s as any).ip_address || '')).trim().toLowerCase();

        // 1. Direct match by ID, name, hostname, or IP in srvIdSet
        if (srvIdSet.has(sid) || srvIdSet.has(sname) || srvIdSet.has(shost) || srvIdSet.has(sip)) {
          return true;
        }

        // 2. Server group associations
        const sGroupIds: string[] = [
          ...(Array.isArray((s as any).groupIds) ? (s as any).groupIds : []),
          ...(Array.isArray((s as any).group_ids) ? (s as any).group_ids : []),
          ...(Array.isArray((s as any).deviceGroupIds) ? (s as any).deviceGroupIds : []),
          ...(Array.isArray((s as any).device_group_ids) ? (s as any).device_group_ids : []),
        ].map((gid) => (gid || '').trim().toLowerCase());

        if (sGroupIds.some((gid) => selectedGroupSet.has(gid))) {
          return true;
        }

        return false;
      });
    }

    if (editingPolicy.targetScope === 'specific') {
      const specificIds: string[] = [
        ...(Array.isArray((editingPolicy as any).targetServerIds) ? (editingPolicy as any).targetServerIds : []),
        ...(Array.isArray((editingPolicy as any).target_server_ids) ? (editingPolicy as any).target_server_ids : []),
        ...(Array.isArray(editingPolicy.targetDeviceIds) ? editingPolicy.targetDeviceIds : []),
        ...(Array.isArray((editingPolicy as any).target_device_ids) ? (editingPolicy as any).target_device_ids : []),
      ];
      const specificSet = new Set(specificIds.map((id: string) => (id || '').trim().toLowerCase()));

      return liveServers.filter((s) => {
        const sid = (s.id || '').trim().toLowerCase();
        const sname = (s.name || '').trim().toLowerCase();
        const shost = (s.hostname || '').trim().toLowerCase();
        const sip = ((s.ip || (s as any).ip_address || '')).trim().toLowerCase();
        return specificSet.has(sid) || specificSet.has(sname) || specificSet.has(shost) || specificSet.has(sip);
      });
    }

    return [];
  }, [editingPolicy, liveDeviceGroups, liveServers]);

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
      } catch (err) {
        // ignore
      }
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
    } catch (err) {
      // ignore
    }

    setEditingPolicy(null);
    setIsCreating(false);
    setIsPolicyModalOpen(false);
  };

  const activePolicyObj = policies.find((p) => p.id === activeSimulatedPolicyId) || policies[0];

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

      {/* Policies List Header & New Policy Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>{isEn ? 'Configured Access Policies' : 'پالیسی‌های دسترسی تعریف‌شده'}</span>
          </h3>
          <span className="px-2 py-0.5 rounded-full text-xs bg-slate-800 border border-white/10 text-slate-300 font-mono">
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
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

      {/* Grid of Policies */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {policies.map((policy) => {
          const isCurrent = policy.id === activeSimulatedPolicyId;

          return (
            <div
              key={policy.id}
              className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
                isCurrent
                  ? 'bg-slate-900/90 border-cyan-500/60 shadow-lg shadow-cyan-500/10'
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
                      <h4 className="font-bold text-xs text-white">{policy.name}</h4>
                      <span className="text-[10px] text-cyan-300 font-mono">
                        {policy.subjectName}
                      </span>
                    </div>
                  </div>

                  {isCurrent && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 font-bold">
                      {isEn ? 'ACTIVE' : 'فعال'}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">{policy.description}</p>

                {/* Target Scope Pill */}
                <div className="mt-2.5 flex items-center gap-1.5 text-[10px] font-mono text-slate-300">
                  <FolderTree className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isEn ? 'Target:' : 'محدوده:'}</span>
                  {policy.targetScope === 'all' && (
                    <span className="text-emerald-400 font-semibold">{isEn ? 'All Network Devices' : 'تمام تجهیزات شبکه'}</span>
                  )}
                  {policy.targetScope === 'groups' && (
                    <span className="text-amber-300 font-semibold truncate max-w-[180px]">
                      {policy.targetGroupIds.map((gid) => groups.find((g) => g.id === gid)?.name || gid).join(', ')}
                    </span>
                  )}
                  {policy.targetScope === 'specific' && (
                    <span className="text-cyan-300 font-semibold">
                      {policy.targetDeviceIds.length} {isEn ? 'Devices' : 'دستگاه مشخص'}
                    </span>
                  )}
                </div>

                {/* Multi-Vendor Badges */}
                <div className="flex flex-wrap gap-1 mt-2.5 pt-2 border-t border-white/5">
                  {/* Cisco Badge */}
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <span>Cisco:</span>
                    <span className="font-mono">
                      {policy.canChangeVlan ? 'VLAN ' : ''}
                      {policy.canTogglePortSecurity ? 'Sec ' : ''}
                      {policy.canToggleAdminStatus ? 'Shut ' : ''}
                      {policy.terminalAccess !== 'none' ? 'CLI' : ''}
                      {!policy.canChangeVlan && !policy.canTogglePortSecurity && !policy.canToggleAdminStatus && policy.terminalAccess === 'none' ? 'Restricted' : ''}
                    </span>
                  </span>

                  {/* MikroTik Badge */}
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-500/15 text-rose-300 border border-rose-500/30 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    <span>MikroTik:</span>
                    <span className="font-mono">
                      {policy.canMikrotikBridgeVlan ? 'Bridge ' : ''}
                      {policy.canMikrotikToggleInterface ? 'Port ' : ''}
                      {policy.canMikrotikBackup ? 'Backup ' : ''}
                      {policy.mikrotikTerminalAccess && policy.mikrotikTerminalAccess !== 'none' ? 'ROS-CLI' : ''}
                      {!policy.canMikrotikBridgeVlan && !policy.canMikrotikToggleInterface && (!policy.mikrotikTerminalAccess || policy.mikrotikTerminalAccess === 'none') ? 'Restricted' : ''}
                    </span>
                  </span>

                  {/* Generic Badge */}
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Linux:</span>
                    <span className="font-mono">
                      {policy.canGenericDiagnostics ? 'Diag ' : ''}
                      {policy.canGenericToggleLink ? 'Link ' : ''}
                      {policy.genericTerminalAccess && policy.genericTerminalAccess !== 'none' ? 'Shell' : ''}
                    </span>
                  </span>

                  {/* Backup & DR Badge */}
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold flex items-center gap-1 border ${
                    policy.canImportBackup
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : policy.canExportBackup
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      : 'bg-slate-800 text-slate-500 border-white/5'
                  }`}>
                    <Archive className="w-2.5 h-2.5" />
                    <span>Backup:</span>
                    <span className="font-mono">
                      {policy.canImportBackup ? 'Full (Exp+Imp)' : policy.canExportBackup ? 'Export' : 'Locked'}
                    </span>
                  </span>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="pt-2 mt-3 border-t border-white/10 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onSelectSimulatedPolicy(policy.id)}
                  className={`text-[11px] font-semibold cursor-pointer transition ${
                    isCurrent ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isCurrent ? (isEn ? '● Current Test Role' : '● نقش جاری در حال اجرا') : (isEn ? 'Select for Simulation' : 'انتخاب جهت شبیه‌سازی')}
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(policy)}
                    className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-white/10 transition cursor-pointer"
                    title={isEn ? 'Edit Policy' : 'ویرایش پالیسی'}
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  {policies.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => handleDeletePolicy(policy.id, e)}
                      className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                      title={isEn ? 'Delete Policy' : 'حذف پالیسی'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modern Tabbed Universal Access Policy Modal */}
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
    </div>
  );
};
