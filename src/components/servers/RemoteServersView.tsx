import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Server,
  Terminal,
  Monitor,
  Plus,
  Search,
  RefreshCw,
  Tags,
  MoreVertical,
  Edit2,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  Activity,
  Layers,
  LayoutGrid,
  List,
  Table as TableIcon,
  Columns3,
  Cpu,
  Zap,
  Sliders,
  Sparkles,
  ChevronDown,
  Globe,
  AlertCircle,
  Key,
  FolderTree,
} from 'lucide-react';
import { RemoteServer, RemoteServerTagSummary, ServerCategory } from '../../types';
import {
  fetchRemoteServers,
  fetchRemoteServerTags,
  createRemoteServer,
  updateRemoteServer,
  deleteRemoteServer,
  testRemoteServerConnection,
} from '../../services/api';
import { AddEditServerModal } from './AddEditServerModal';
import { LinuxTerminalModal } from './LinuxTerminalModal';
import { LinuxServerMonitorModal } from './LinuxServerMonitorModal';
import { WindowsRemoteConnectModal } from './WindowsRemoteConnectModal';
import { InBrowserRemoteDesktopModal } from './InBrowserRemoteDesktopModal';
import { OnDemandPasswordModal } from './OnDemandPasswordModal';
import { ManageServerCategoriesModal } from './ManageServerCategoriesModal';
import { BulkServerConfigModal } from './BulkServerConfigModal';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { useModalDock } from '../../context/ModalDockContext';

export interface RemoteServersViewProps {
  initialFilter?: 'all' | 'linux' | 'windows' | 'tags';
  isLightMode?: boolean;
  isEn?: boolean;
}

interface MenuAnchor {
  id: string;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  server: RemoteServer;
}

export interface ServerColumnDef {
  key: string;
  labelEn: string;
  labelFa: string;
  required?: boolean;
}

export const SERVER_COLUMNS: ServerColumnDef[] = [
  { key: 'select', labelEn: 'Selection Checkbox', labelFa: 'چک‌باکس انتخاب' },
  { key: 'node', labelEn: 'Server Node & Hostname', labelFa: 'نام و هاست‌نیم سرور', required: true },
  { key: 'os', labelEn: 'OS & Distro', labelFa: 'سیستم‌عامل و توزیع' },
  { key: 'ip', labelEn: 'IP Address & Port', labelFa: 'آدرس IP و پورت' },
  { key: 'role', labelEn: 'Role & Environment', labelFa: 'محیط و دسته‌بندی' },
  { key: 'status', labelEn: 'Live Status / Ping', labelFa: 'وضعیت لحظه‌ای و پینگ' },
  { key: 'tags', labelEn: 'Automation Tags', labelFa: 'تگ‌های اتوماسیون' },
  { key: 'actions', labelEn: 'Actions', labelFa: 'عملیات' },
];

export const RemoteServersView: React.FC<RemoteServersViewProps> = ({
  initialFilter = 'all',
  isLightMode = false,
  isEn = true,
}) => {
  const { dockModal, undockModal } = useModalDock();

  const [servers, setServers] = useState<RemoteServer[]>([]);
  const [tagsSummary, setTagsSummary] = useState<RemoteServerTagSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states - DEFAULT viewMode is 'list' per user requirement!
  const [activeTabFilter, setActiveTabFilter] = useState<'all' | 'linux' | 'windows' | 'tags'>(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEnv, setSelectedEnv] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'table' | 'grid'>('list');

  // Column Visibility customization (persisted in localStorage)
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('remote_servers_visible_columns');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    return {
      select: true,
      node: true,
      os: true,
      ip: true,
      role: true,
      status: true,
      tags: true,
      actions: true,
    };
  });

  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
  const columnPickerRef = useRef<HTMLDivElement>(null);

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('remote_servers_visible_columns', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const resetColumns = () => {
    const defaults = {
      select: true,
      node: true,
      os: true,
      ip: true,
      role: true,
      status: true,
      tags: true,
      actions: true,
    };
    setVisibleColumns(defaults);
    try {
      localStorage.setItem('remote_servers_visible_columns', JSON.stringify(defaults));
    } catch {}
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setIsColumnPickerOpen(false);
      }
    };
    if (isColumnPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isColumnPickerOpen]);

  // Multi-server Selection state
  const [selectedServerIds, setSelectedServerIds] = useState<Set<string>>(new Set());

  // 3-Dot Action Menu Anchor (Floating Portal)
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);

  // Modal states
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [serverToEdit, setServerToEdit] = useState<RemoteServer | null>(null);

  // Category Management Modal State
  const [categories, setCategories] = useState<ServerCategory[]>([]);
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);

  // Terminal & Remote Connect Modals
  const [terminalServer, setTerminalServer] = useState<RemoteServer | null>(null);
  const [terminalShell, setTerminalShell] = useState<'bash' | 'zsh'>('bash');
  const [isTerminalModalOpen, setIsTerminalModalOpen] = useState(false);

  // Linux Resource & Telemetry Monitoring Modal
  const [monitorServer, setMonitorServer] = useState<RemoteServer | null>(null);
  const [isMonitorModalOpen, setIsMonitorModalOpen] = useState(false);

  const [windowsModalServer, setWindowsModalServer] = useState<RemoteServer | null>(null);
  const [isWindowsModalOpen, setIsWindowsModalOpen] = useState(false);

  const [inBrowserRemoteServer, setInBrowserRemoteServer] = useState<RemoteServer | null>(null);
  const [inBrowserProtocol, setInBrowserProtocol] = useState<'rdp' | 'vnc'>('rdp');
  const [isInBrowserModalOpen, setIsInBrowserModalOpen] = useState(false);

  // On-Demand Password Prompt State (Zero-Storage Ephemeral Auth)
  const [isOnDemandModalOpen, setIsOnDemandModalOpen] = useState(false);
  const [onDemandServer, setOnDemandServer] = useState<RemoteServer | null>(null);
  const [onDemandTarget, setOnDemandTarget] = useState<'rdp' | 'vnc' | 'terminal'>('rdp');
  const [onDemandShell, setOnDemandShell] = useState<'bash' | 'zsh'>('bash');
  const [ephemeralRdpPassword, setEphemeralRdpPassword] = useState<string | undefined>(undefined);
  const [ephemeralTerminalPassword, setEphemeralTerminalPassword] = useState<string | undefined>(undefined);

  // Quick Ping / Test status cache
  const [reachabilityCache, setReachabilityCache] = useState<
    Record<string, { reachable: boolean; latency: number; testing: boolean }>
  >({});
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [isPingingAll, setIsPingingAll] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<RemoteServer | null>(null);

  // Bulk Linux Server Configuration Modal State
  const [isBulkConfigOpen, setIsBulkConfigOpen] = useState(false);

  // Close floating action menu on scroll or window resize
  useEffect(() => {
    if (!menuAnchor) return;
    const handleClose = () => setMenuAnchor(null);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);
    return () => {
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [menuAnchor]);

  // Sync initial filter prop
  useEffect(() => {
    setActiveTabFilter(initialFilter);
  }, [initialFilter]);

  // Load server fleet
  const loadFleet = async () => {
    setLoading(true);
    setError(null);
    try {
      const [srvRes, tagRes] = await Promise.all([
        fetchRemoteServers(),
        fetchRemoteServerTags(),
      ]);
      setServers(srvRes.servers || []);
      setTagsSummary(tagRes.tags || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load remote servers fleet');
    } finally {
      setLoading(false);
    }
  };

  // Load server categories
  const loadCategories = async () => {
    try {
      const res = await fetch('/api/server-categories');
      const data = await res.json();
      if (data.success && Array.isArray(data.categories)) {
        setCategories(data.categories);
      }
    } catch (err) {
      console.warn('Failed to load server categories:', err);
    }
  };

  const handleCategoriesChanged = () => {
    loadCategories();
    loadFleet();
  };

  useEffect(() => {
    loadFleet();
    loadCategories();
  }, []);

  // Filtered servers calculation
  const filteredServers = useMemo(() => {
    return servers.filter((server) => {
      // OS / Tab Filter
      if (activeTabFilter === 'linux' && server.os_type !== 'linux') return false;
      if (activeTabFilter === 'windows' && server.os_type !== 'windows') return false;

      // Environment Filter
      if (selectedEnv !== 'all' && server.environment.toLowerCase() !== selectedEnv.toLowerCase()) {
        return false;
      }

      // Category Filter
      if (selectedCategory !== 'all' && server.category.toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
      }

      // Tag Filter
      if (selectedTag && (!Array.isArray(server.tags) || !server.tags.includes(selectedTag))) {
        return false;
      }

      // Text Query Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = server.name.toLowerCase().includes(q);
        const matchesHost = server.hostname?.toLowerCase().includes(q);
        const matchesIp = server.ip.includes(q);
        const matchesDistro = server.os_distro?.toLowerCase().includes(q);
        const matchesRole = server.role?.toLowerCase().includes(q);
        const matchesTags = Array.isArray(server.tags) && server.tags.some((t) => t.toLowerCase().includes(q));

        if (!matchesName && !matchesHost && !matchesIp && !matchesDistro && !matchesRole && !matchesTags) {
          return false;
        }
      }

      return true;
    });
  }, [servers, activeTabFilter, selectedEnv, selectedCategory, selectedTag, searchQuery]);

  // Quick statistics
  const stats = useMemo(() => {
    const total = servers.length;
    const linuxCount = servers.filter((s) => s.os_type === 'linux').length;
    const winCount = servers.filter((s) => s.os_type === 'windows').length;
    const prodCount = servers.filter((s) => s.environment === 'Production').length;

    let reachableCount = 0;
    let unreachableCount = 0;
    servers.forEach((s) => {
      const cached = reachabilityCache[s.id];
      if (cached) {
        if (cached.reachable) reachableCount++;
        else unreachableCount++;
      } else {
        // Fallback to server.status if not pinged yet
        if (s.status === 'online') reachableCount++;
        else unreachableCount++;
      }
    });

    return { total, linuxCount, winCount, prodCount, reachableCount, unreachableCount };
  }, [servers, reachabilityCache]);

  // Handle open Add Modal
  const handleOpenAdd = () => {
    setServerToEdit(null);
    setIsAddEditModalOpen(true);
    undockModal('add_edit_remote_server');
  };

  // Handle open Edit Modal
  const handleOpenEdit = (server: RemoteServer) => {
    setServerToEdit(server);
    setIsAddEditModalOpen(true);
    setMenuAnchor(null);
    undockModal('add_edit_remote_server');
  };

  // Handle Save Server (create or update)
  const handleSaveServer = async (serverData: Partial<RemoteServer>) => {
    if (serverToEdit) {
      await updateRemoteServer(serverToEdit.id, { ...serverData, id: serverToEdit.id });
    } else {
      await createRemoteServer(serverData);
    }
    await loadFleet();
    setIsAddEditModalOpen(false);
    undockModal('add_edit_remote_server');
  };

  // Handle Delete Server with safety confirmation
  const handleConfirmDelete = async () => {
    if (!serverToDelete) return;
    try {
      await deleteRemoteServer(serverToDelete.id);
      await loadFleet();
      setSelectedServerIds((prev) => {
        const next = new Set(prev);
        next.delete(serverToDelete.id);
        return next;
      });
      setServerToDelete(null);
    } catch (err: any) {
      alert(err.message || (isEn ? 'Failed to delete server.' : 'خطا در حذف سرور.'));
    }
  };

  // Handle Open Linux Terminal
  const handleOpenLinuxTerminal = (server: RemoteServer, shell: 'bash' | 'zsh' = 'bash') => {
    setMenuAnchor(null);
    if (server.prompt_password_on_connect) {
      setOnDemandServer(server);
      setOnDemandTarget('terminal');
      setOnDemandShell(shell);
      setIsOnDemandModalOpen(true);
      return;
    }
    setEphemeralTerminalPassword(undefined);
    setTerminalServer(server);
    setTerminalShell(shell);
    setIsTerminalModalOpen(true);
    undockModal(`linux_term_${server.id}`);
  };

  // Handle Open Linux Live Telemetry & Resource Monitor
  const handleOpenLinuxMonitor = (server: RemoteServer) => {
    setMenuAnchor(null);
    setMonitorServer(server);
    setIsMonitorModalOpen(true);
    undockModal(`linux_mon_${server.id}`);
  };

  // Handle Open Windows Remote
  const handleOpenWindowsRemote = (server: RemoteServer) => {
    setWindowsModalServer(server);
    setIsWindowsModalOpen(true);
    setMenuAnchor(null);
    undockModal(`win_remote_${server.id}`);
  };

  // Handle Open In-Browser Remote Desktop (RDP / VNC via Guacamole Gateway)
  const handleOpenInBrowserRemote = (server: RemoteServer, protocol: 'rdp' | 'vnc' = 'rdp') => {
    setMenuAnchor(null);
    if (server.prompt_password_on_connect) {
      setOnDemandServer(server);
      setOnDemandTarget(protocol);
      setIsOnDemandModalOpen(true);
      return;
    }
    setEphemeralRdpPassword(undefined);
    setInBrowserRemoteServer(server);
    setInBrowserProtocol(protocol);
    setIsInBrowserModalOpen(true);
    undockModal(`inbrowser_remote_${server.id}`);
  };

  // Handle Confirm On-Demand Password Entry
  const handleConfirmOnDemandConnect = (sessionPassword: string) => {
    setIsOnDemandModalOpen(false);
    if (!onDemandServer) return;

    if (onDemandTarget === 'terminal') {
      setEphemeralTerminalPassword(sessionPassword);
      setTerminalServer(onDemandServer);
      setTerminalShell(onDemandShell);
      setIsTerminalModalOpen(true);
      undockModal(`linux_term_${onDemandServer.id}`);
    } else {
      setEphemeralRdpPassword(sessionPassword);
      setInBrowserRemoteServer(onDemandServer);
      setInBrowserProtocol(onDemandTarget);
      setIsInBrowserModalOpen(true);
      undockModal(`inbrowser_remote_${onDemandServer.id}`);
    }
  };

  // Handle Copy IP
  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 1500);
    setMenuAnchor(null);
  };

  // Handle Test Ping on a single server
  const handleTestPing = async (serverId: string) => {
    setMenuAnchor(null);
    setReachabilityCache((prev) => ({
      ...prev,
      [serverId]: { reachable: false, latency: 0, testing: true },
    }));

    try {
      const res = await testRemoteServerConnection(serverId);
      setReachabilityCache((prev) => ({
        ...prev,
        [serverId]: {
          reachable: res.reachable,
          latency: res.latency_ms || 12,
          testing: false,
        },
      }));
    } catch {
      setReachabilityCache((prev) => ({
        ...prev,
        [serverId]: {
          reachable: false,
          latency: 0,
          testing: false,
        },
      }));
    }
  };

  // Handle Bulk Ping on all selected servers
  const handleBulkPing = async () => {
    if (selectedServerIds.size === 0) return;
    const targetIds = Array.from(selectedServerIds);

    setReachabilityCache((prev) => {
      const next = { ...prev };
      targetIds.forEach((id) => {
        next[id] = { reachable: false, latency: 0, testing: true };
      });
      return next;
    });

    await Promise.allSettled(
      targetIds.map(async (id) => {
        try {
          const res = await testRemoteServerConnection(id);
          setReachabilityCache((prev) => ({
            ...prev,
            [id]: { reachable: res.reachable, latency: res.latency_ms || 12, testing: false },
          }));
        } catch {
          setReachabilityCache((prev) => ({
            ...prev,
            [id]: { reachable: false, latency: 0, testing: false },
          }));
        }
      })
    );
  };

  // Handle Ping All Fleet
  const handlePingAllFleet = async () => {
    if (servers.length === 0 || isPingingAll) return;
    setIsPingingAll(true);

    const allIds = servers.map((s) => s.id);
    setReachabilityCache((prev) => {
      const next = { ...prev };
      allIds.forEach((id) => {
        next[id] = { reachable: false, latency: 0, testing: true };
      });
      return next;
    });

    await Promise.allSettled(
      allIds.map(async (id) => {
        try {
          const res = await testRemoteServerConnection(id);
          setReachabilityCache((prev) => ({
            ...prev,
            [id]: { reachable: res.reachable, latency: res.latency_ms || 12, testing: false },
          }));
        } catch {
          setReachabilityCache((prev) => ({
            ...prev,
            [id]: { reachable: false, latency: 0, testing: false },
          }));
        }
      })
    );
    setIsPingingAll(false);
  };

  // Toggle Action Menu Dropdown with Boundary Clamping
  const handleToggleActionMenu = (e: React.MouseEvent<HTMLButtonElement>, server: RemoteServer) => {
    e.stopPropagation();
    if (menuAnchor?.id === server.id) {
      setMenuAnchor(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const menuEstimatedHeight = 280;
    const menuWidth = 240;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < menuEstimatedHeight && rect.top > menuEstimatedHeight;

    const pos: MenuAnchor = {
      id: server.id,
      server,
    };

    if (openUpwards) {
      pos.bottom = window.innerHeight - rect.top + 6;
    } else {
      pos.top = rect.bottom + 6;
    }

    if (!isEn) {
      // In RTL, align left side bounded
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12));
      pos.left = left;
    } else {
      // In LTR, align right side bounded
      const right = Math.max(12, Math.min(window.innerWidth - rect.right, window.innerWidth - menuWidth - 12));
      pos.right = right;
    }

    setMenuAnchor(pos);
  };

  // Minimization Handlers with ModalDockContext
  const handleMinimizeLinuxTerminal = () => {
    setIsTerminalModalOpen(false);
    if (terminalServer) {
      dockModal({
        id: `linux_term_${terminalServer.id}`,
        labelEn: `${terminalServer.name} Terminal`,
        labelFa: `ترمینال ${terminalServer.name}`,
        badge: terminalShell.toUpperCase(),
        category: 'terminal',
        onRestore: () => setIsTerminalModalOpen(true),
        onClose: () => {
          setIsTerminalModalOpen(false);
          undockModal(`linux_term_${terminalServer.id}`);
        },
      });
    }
  };

  const handleMinimizeMonitor = () => {
    setIsMonitorModalOpen(false);
    if (monitorServer) {
      dockModal({
        id: `linux_mon_${monitorServer.id}`,
        labelEn: `${monitorServer.name} - Server Management`,
        labelFa: `مدیریت سرور ${monitorServer.name}`,
        badge: 'LIVE',
        category: 'tools',
        onRestore: () => setIsMonitorModalOpen(true),
        onClose: () => {
          setIsMonitorModalOpen(false);
          undockModal(`linux_mon_${monitorServer.id}`);
        },
      });
    }
  };

  const handleMinimizeWindowsRemote = () => {
    setIsWindowsModalOpen(false);
    if (windowsModalServer) {
      dockModal({
        id: `win_remote_${windowsModalServer.id}`,
        labelEn: `${windowsModalServer.name} Remote`,
        labelFa: `ریموت ${windowsModalServer.name}`,
        badge: 'RDP',
        category: 'device',
        onRestore: () => setIsWindowsModalOpen(true),
        onClose: () => {
          setIsWindowsModalOpen(false);
          undockModal(`win_remote_${windowsModalServer.id}`);
        },
      });
    }
  };

  const handleMinimizeInBrowserRemote = () => {
    setIsInBrowserModalOpen(false);
    if (inBrowserRemoteServer) {
      dockModal({
        id: `inbrowser_remote_${inBrowserRemoteServer.id}`,
        labelEn: `${inBrowserRemoteServer.name} ${inBrowserProtocol.toUpperCase()}`,
        labelFa: `ریموت ${inBrowserRemoteServer.name} (${inBrowserProtocol.toUpperCase()})`,
        badge: inBrowserProtocol.toUpperCase(),
        category: 'device',
        onRestore: () => setIsInBrowserModalOpen(true),
        onClose: () => {
          setIsInBrowserModalOpen(false);
          undockModal(`inbrowser_remote_${inBrowserRemoteServer.id}`);
        },
      });
    }
  };

  const handleMinimizeAddEdit = () => {
    setIsAddEditModalOpen(false);
    dockModal({
      id: 'add_edit_remote_server',
      labelEn: serverToEdit ? `Edit ${serverToEdit.name}` : 'Add Server',
      labelFa: serverToEdit ? `ویرایش ${serverToEdit.name}` : 'افزودن سرور',
      category: 'config',
      onRestore: () => setIsAddEditModalOpen(true),
      onClose: () => {
        setIsAddEditModalOpen(false);
        undockModal('add_edit_remote_server');
      },
    });
  };

  const handleMinimizeCategories = () => {
    setIsCategoriesModalOpen(false);
    dockModal({
      id: 'manage_server_categories',
      labelEn: isEn ? 'Categories' : 'دسته‌بندی‌ها',
      labelFa: 'دسته‌بندی‌های سرور',
      badge: 'CATEGORIES',
      category: 'config',
      onRestore: () => setIsCategoriesModalOpen(true),
      onClose: () => {
        setIsCategoriesModalOpen(false);
        undockModal('manage_server_categories');
      },
    });
  };

  const handleMinimizeOnDemand = () => {
    setIsOnDemandModalOpen(false);
    if (onDemandServer) {
      dockModal({
        id: `ondemand_auth_${onDemandServer.id}`,
        labelEn: `${onDemandServer.name} Auth`,
        labelFa: `احراز ${onDemandServer.name}`,
        badge: 'AUTH',
        category: 'system',
        onRestore: () => setIsOnDemandModalOpen(true),
        onClose: () => {
          setIsOnDemandModalOpen(false);
          setOnDemandServer(null);
          undockModal(`ondemand_auth_${onDemandServer.id}`);
        },
      });
    }
  };

  const handleMinimizeBulkConfig = () => {
    setIsBulkConfigOpen(false);
    dockModal({
      id: 'bulk_server_config_modal',
      labelEn: isEn ? 'Bulk Linux Config' : 'پیکربندی گروهی لینوکس',
      labelFa: 'پیکربندی گروهی سرورهای لینوکس',
      badge: 'BULK',
      category: 'tools',
      onRestore: () => setIsBulkConfigOpen(true),
      onClose: () => {
        setIsBulkConfigOpen(false);
        undockModal('bulk_server_config_modal');
      },
    });
  };

  return (
    <div
      className={`p-4 sm:p-6 space-y-4 max-w-7xl mx-auto transition-colors duration-200 ${
        isEn ? 'text-left' : 'text-right'
      } ${isLightMode ? 'text-slate-800' : 'text-slate-100'}`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      {/* 1. Sticky Top Bar (Matching DeviceListView spatial-glass styling) */}
      <div className="sticky top-0 z-20 -mt-2 pt-2 pb-2 bg-transparent -mx-4 sm:-mx-6 px-4 sm:px-6 transition-all">
        <div
          className={`flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 rounded-2xl border shadow-xl backdrop-blur-xl ${
            isLightMode
              ? 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-200/50'
              : 'spatial-glass border-white/10 text-white'
          }`}
        >
          <div>
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-xl border ${
                  isLightMode
                    ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-700'
                    : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                }`}
              >
                <Server className="w-5 h-5" />
              </div>
              <h2 className="text-base sm:text-lg font-bold glow-text-cyan tracking-tight">
                {isEn ? 'Remote Servers & Automation Fleet' : 'مدیریت سرورهای ریموت و ناوگان اتوماسیون'}
              </h2>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded-lg border font-bold ${
                  isLightMode
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                }`}
              >
                {servers.length} {isEn ? 'Nodes' : 'سرور'}
              </span>

              <FieldInfoTooltip
                title={isEn ? 'Remote Compute Fleet' : 'ناوگان سرورهای ریموت'}
                whatIsIt={
                  isEn
                    ? 'Unified enterprise inventory of Linux and Windows remote compute nodes with terminal and RDP access.'
                    : 'مدیریت متمرکز سرورهای لینوکسی و ویندوزی همراه با دسترسی مستقیم شل و ریموت دسکتاپ.'
                }
                whyNeeded={
                  isEn
                    ? 'Enables automated configuration management, instant SSH access, and centralized host inventory.'
                    : 'امکان مدیریت دسته‌جمعی، اجرای دستورات و اسنیپت‌ها و دسترسی مستقیم بدون نیاز به کلاینت مجزا.'
                }
                example={
                  isEn
                    ? 'Ubuntu 24.04 Web Gateway, Debian DB Cluster, Windows AD Server.'
                    : 'گیت‌وی وب اوبونتو، کلاستر دیتابیس دبیان، سرور دامین ویندوز.'
                }
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>
            <p className={`text-xs mt-1 max-w-2xl leading-relaxed ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn
                ? 'Centralized remote compute nodes, interactive SSH/Zsh shells, in-browser Guacamole RDP/VNC sessions, and automation fleet management.'
                : 'مدیریت متمرکز سرورهای لینوکسی و ویندوزی، دسترسی تعاملی SSH، ریموت دسکتاپ RDP/VNC در مرورگر و اتوماسیون ناوگان.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Bulk Action Button (When servers selected) */}
            {selectedServerIds.size > 0 && (
              <button
                type="button"
                onClick={handleBulkPing}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white border border-cyan-400/40 shadow-[0_0_15px_rgba(6,182,212,0.35)] transition active:scale-95 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>
                  {isEn
                    ? `Ping Selected (${selectedServerIds.size})`
                    : `تست پینگ انتخاب‌شده‌ها (${selectedServerIds.size})`}
                </span>
              </button>
            )}

            {/* Ping / Refresh All Button */}
            <button
              type="button"
              onClick={handlePingAllFleet}
              disabled={isPingingAll || loading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition active:scale-95 cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10 shadow-xs'
              }`}
              title={isEn ? 'Ping and check latency across all fleet nodes' : 'تست پینگ و وضعیت تاخیر تمام ناوگان'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPingingAll || loading ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{isEn ? 'Ping All Fleet' : 'تست پینگ همه'}</span>
            </button>

            {/* Bulk Server Config Button */}
            <button
              id="btn-bulk-server-config"
              type="button"
              onClick={() => setIsBulkConfigOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition active:scale-95 cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/30 shadow-xs'
              }`}
              title={isEn ? 'Bulk configure remote Linux servers' : 'پیکربندی گروهی سرورهای لینوکس'}
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isEn ? 'Bulk Server Config' : 'پیکربندی گروهی'}</span>
            </button>

            {/* Add Server Button */}
            <button
              id="btn-add-server"
              type="button"
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-medium shadow-[0_0_15px_rgba(99,102,241,0.35)] transition border border-white/10 active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isEn ? 'Add Remote Server' : 'ثبت سرور جدید'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Quick Summary Cards (4 stats - matching DeviceListView) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {/* Linux Nodes Card */}
        <div
          className={`p-3.5 rounded-xl border shadow-lg flex items-center justify-between transition-all ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'spatial-glass spatial-glass-hover spatial-depth-card border-white/10'
          }`}
        >
          <div>
            <div className={`text-[10px] uppercase font-bold tracking-wider ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Linux Compute Nodes' : 'سرورهای لینوکس'}
            </div>
            <div className="text-2xl font-bold font-mono mt-1 text-emerald-400">
              {stats.linuxCount}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Terminal className="w-4 h-4" />
          </div>
        </div>

        {/* Windows Nodes Card */}
        <div
          className={`p-3.5 rounded-xl border shadow-lg flex items-center justify-between transition-all ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'spatial-glass spatial-glass-hover spatial-depth-card border-white/10'
          }`}
        >
          <div>
            <div className={`text-[10px] uppercase font-bold tracking-wider ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Windows Server Nodes' : 'سرورهای ویندوز'}
            </div>
            <div className="text-2xl font-bold font-mono mt-1 text-blue-400">
              {stats.winCount}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Monitor className="w-4 h-4" />
          </div>
        </div>

        {/* Reachability Status Card */}
        <div
          className={`p-3.5 rounded-xl border shadow-lg flex items-center justify-between transition-all ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'spatial-glass spatial-glass-hover spatial-depth-card border-white/10'
          }`}
        >
          <div>
            <div className={`text-[10px] uppercase font-bold tracking-wider ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Reachability Status' : 'وضعیت آنلاین / آفلاین'}
            </div>
            <div className="text-2xl font-bold font-mono mt-1">
              <span className="text-emerald-400">{stats.reachableCount}</span>
              <span className={`mx-1 text-xs font-normal ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}>/</span>
              <span className="text-rose-400">{stats.unreachableCount}</span>
            </div>
          </div>
          <div
            className={`p-2.5 rounded-xl border ${
              isLightMode ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white/5 text-slate-300 border-white/10'
            }`}
          >
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
        </div>

        {/* Fleet Capacity Card */}
        <div
          className={`p-3.5 rounded-xl border shadow-lg flex items-center justify-between transition-all ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'spatial-glass spatial-glass-hover spatial-depth-card border-white/10'
          }`}
        >
          <div>
            <div className={`text-[10px] uppercase font-bold tracking-wider ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Fleet Capacity' : 'مجموع ناوگان'}
            </div>
            <div className="text-2xl font-bold font-mono mt-1 glow-text-cyan">
              {stats.total}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Cpu className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 3. Search and Filter Bar */}
      <div
        className={`p-3.5 rounded-xl border shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs backdrop-blur-xl ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-800'
            : 'spatial-glass border-white/10 text-slate-200'
        }`}
      >
        {/* Search Input */}
        <div className="relative flex-1 min-w-[220px]">
          <input
            type="text"
            placeholder={
              isEn
                ? 'Search by name, IP, hostname, distro, tags...'
                : 'جستجوی نام، آدرس IP، هاست‌نیم، توزیع، تگ‌ها...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full px-3.5 py-2 ${
              isEn ? 'pl-9 pr-3.5' : 'pr-9 pl-3.5'
            } rounded-xl border text-xs focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 shadow-inner transition-colors ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                : 'bg-slate-900/70 border-white/15 text-slate-100 placeholder-slate-500'
            }`}
          />
          <Search className={`w-4 h-4 text-slate-400 absolute ${isEn ? 'left-3' : 'right-3'} top-2.5`} />
        </div>

        {/* Dropdown Filters & Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {/* OS Type Filter */}
          <select
            value={activeTabFilter}
            onChange={(e) => setActiveTabFilter(e.target.value as any)}
            className={`px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-indigo-400 cursor-pointer ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-700'
                : 'bg-slate-900/70 border-white/15 text-slate-200'
            }`}
          >
            <option value="all">{isEn ? 'All Server Types' : 'همه انواع سرورها'}</option>
            <option value="linux">{isEn ? 'Linux Nodes Only' : 'فقط سرورهای لینوکس'}</option>
            <option value="windows">{isEn ? 'Windows Nodes Only' : 'فقط سرورهای ویندوز'}</option>
          </select>

          {/* Environment Filter */}
          <select
            value={selectedEnv}
            onChange={(e) => setSelectedEnv(e.target.value)}
            className={`px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-indigo-400 cursor-pointer ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-700'
                : 'bg-slate-900/70 border-white/15 text-slate-200'
            }`}
          >
            <option value="all">{isEn ? 'All Environments' : 'همه محیط‌ها'}</option>
            <option value="Production">Production</option>
            <option value="Staging">Staging</option>
            <option value="Development">Development</option>
            <option value="DMZ">DMZ</option>
          </select>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5">
            <select
              id="server-category-filter-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={`px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-indigo-400 cursor-pointer ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-700'
                  : 'bg-slate-900/70 border-white/15 text-slate-200'
              }`}
            >
              <option value="all">{isEn ? 'All Categories' : 'همه دسته‌ها'}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {isEn ? c.name : (c.name_fa || c.name)} ({c.serverCount || 0})
                </option>
              ))}
            </select>

            <button
              id="open-manage-categories-btn"
              onClick={() => setIsCategoriesModalOpen(true)}
              title={isEn ? 'Manage Server Categories' : 'مدیریت دسته‌بندی‌های سرور'}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 hover:border-slate-400'
                  : 'bg-slate-900/70 border-white/15 text-slate-200 hover:bg-slate-800'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">{isEn ? 'Categories' : 'دسته‌ها'}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold">
                {categories.length}
              </span>
            </button>
          </div>

          {/* Tags Filter */}
          <select
            value={selectedTag || 'all'}
            onChange={(e) => setSelectedTag(e.target.value === 'all' ? null : e.target.value)}
            className={`px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-indigo-400 cursor-pointer ${
              selectedTag
                ? 'bg-purple-950/60 border-purple-500/50 text-purple-300 font-bold'
                : isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-700'
                : 'bg-slate-900/70 border-white/15 text-slate-200'
            }`}
          >
            <option value="all">{isEn ? '🏷️ All Tags' : '🏷️ همه تگ‌ها'}</option>
            {tagsSummary.map((ts) => (
              <option key={ts.tag} value={ts.tag}>
                #{ts.tag} ({ts.count})
              </option>
            ))}
          </select>

          {/* View Mode Switcher (List DEFAULT!) */}
          <div
            className={`flex items-center p-0.5 rounded-xl border ${
              isLightMode ? 'bg-slate-100 border-slate-300' : 'bg-slate-900/80 border-white/15'
            }`}
          >
            <button
              type="button"
              onClick={() => setViewMode('list')}
              title={isEn ? 'List View (Default)' : 'نمایش لیستی (پیش‌فرض)'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title={isEn ? 'Dense Table View' : 'نمایش جدولی متراکم'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TableIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title={isEn ? 'Grid Cards View' : 'نمایش کارت‌ها'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Column Visibility Selector (Persisted in localStorage) */}
          <div className="relative" ref={columnPickerRef}>
            <button
              type="button"
              onClick={() => setIsColumnPickerOpen(!isColumnPickerOpen)}
              title={isEn ? 'Customize Visible Columns' : 'سفارشی‌سازی ستون‌های جدول'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
                isColumnPickerOpen
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                  : isLightMode
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  : 'bg-slate-900/80 border-white/15 text-slate-300 hover:bg-white/10'
              }`}
            >
              <Columns3 className="w-4 h-4 text-cyan-400" />
              <span className="hidden sm:inline">{isEn ? 'Columns' : 'ستون‌ها'}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-bold">
                {Object.values(visibleColumns).filter(Boolean).length}/{SERVER_COLUMNS.length}
              </span>
            </button>

            {isColumnPickerOpen && (
              <div
                className={`absolute ${
                  isEn ? 'right-0' : 'left-0'
                } mt-2 w-64 rounded-2xl shadow-2xl p-3 border z-40 backdrop-blur-xl animate-in fade-in zoom-in-95 ${
                  isLightMode
                    ? 'bg-white border-slate-200 text-slate-900 shadow-slate-900/15'
                    : 'bg-slate-950/95 border-white/15 text-slate-100 shadow-black/60'
                }`}
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <Columns3 className="w-3.5 h-3.5 text-cyan-400" />
                    {isEn ? 'Table Columns' : 'ستون‌های جدول'}
                  </span>
                  <button
                    type="button"
                    onClick={resetColumns}
                    className="text-[11px] text-cyan-400 hover:underline cursor-pointer font-mono"
                  >
                    {isEn ? 'Reset Default' : 'پیش‌فرض'}
                  </button>
                </div>

                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                  {SERVER_COLUMNS.map((col) => {
                    const isVisible = visibleColumns[col.key] !== false;
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs select-none transition ${
                          col.required
                            ? 'opacity-70 cursor-not-allowed'
                            : 'cursor-pointer ' + (isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5')
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isVisible}
                            disabled={col.required}
                            onChange={() => !col.required && toggleColumn(col.key)}
                            className="w-3.5 h-3.5 rounded text-cyan-500 bg-slate-900 border-white/20 focus:ring-cyan-500 accent-cyan-500 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <span className="text-xs">{isEn ? col.labelEn : col.labelFa}</span>
                        </span>
                        {col.required && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {isEn ? 'Required' : 'الزامی'}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Multi-Server Selection Action Bar (Matching DeviceListView) */}
      {selectedServerIds.size > 0 && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border shadow-lg text-xs font-mono animate-in fade-in slide-in-from-top-2 ${
            isLightMode
              ? 'bg-cyan-50 border-cyan-300 text-cyan-900'
              : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold border ${
                isLightMode
                  ? 'bg-cyan-100 text-cyan-800 border-cyan-300'
                  : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>
                {isEn
                  ? `${selectedServerIds.size} of ${servers.length} servers selected`
                  : `${selectedServerIds.size} از ${servers.length} سرور انتخاب شده است`}
              </span>
            </span>

            {/* Quick Selection Shortcuts */}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  const linuxIds = servers.filter((s) => s.os_type === 'linux').map((s) => s.id);
                  setSelectedServerIds(new Set(linuxIds));
                }}
                className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 cursor-pointer"
              >
                {isEn ? 'Only Linux' : 'فقط لینوکس'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const winIds = servers.filter((s) => s.os_type === 'windows').map((s) => s.id);
                  setSelectedServerIds(new Set(winIds));
                }}
                className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30 cursor-pointer"
              >
                {isEn ? 'Only Windows' : 'فقط ویندوز'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const prodIds = servers.filter((s) => s.environment === 'Production').map((s) => s.id);
                  setSelectedServerIds(new Set(prodIds));
                }}
                className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 cursor-pointer"
              >
                {isEn ? 'Only Production' : 'فقط پروداکشن'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedServerIds(new Set())}
              className={`px-2.5 py-1 transition cursor-pointer ${
                isLightMode ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isEn ? 'Clear Selection' : 'لغو انتخاب‌ها'}
            </button>

            <button
              type="button"
              onClick={handleBulkPing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold shadow-md shadow-cyan-500/20 cursor-pointer active:scale-95 transition"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isEn ? 'Test Reachability' : 'تست وضعیت پینگ'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsBulkConfigOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold shadow-md shadow-indigo-500/20 cursor-pointer active:scale-95 transition"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isEn ? 'Bulk Linux Config' : 'پیکربندی گروهی لینوکس'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. Active Tag Filter Indicator */}
      {selectedTag && (
        <div className="flex items-center gap-2 p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs">
          <Tags className="w-4 h-4 shrink-0 text-purple-400" />
          <span>
            {isEn ? 'Filtered by Tag:' : 'فیلتر بر اساس تگ:'} <strong>#{selectedTag}</strong>
          </span>
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className="ms-auto text-xs px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 cursor-pointer"
          >
            {isEn ? 'Clear Filter' : 'حذف فیلتر'}
          </button>
        </div>
      )}

      {/* 6. Main List View (DEFAULT VIEW - Styled with DeviceListView spatial-glass table) */}
      {viewMode === 'list' && (
        <div
          className={`rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl border ${
            isLightMode
              ? 'bg-white border-slate-200 shadow-slate-200/50'
              : 'spatial-glass border-white/10'
          }`}
        >
          <div className="overflow-x-auto min-h-[380px]">
            <table className={`w-full ${isEn ? 'text-left' : 'text-right'} text-xs device-table`}>
              <thead>
                <tr
                  className={`border-b-2 text-[11px] font-bold uppercase tracking-wider font-mono ${
                    isLightMode
                      ? 'bg-slate-100 text-slate-700 border-slate-200'
                      : 'bg-slate-950/80 text-slate-300 border-white/15'
                  }`}
                >
                  {visibleColumns.select && (
                    <th
                      className={`p-3.5 ${
                        isEn ? 'border-r' : 'border-l'
                      } ${isLightMode ? 'border-slate-200' : 'border-white/15'} w-10 text-center`}
                    >
                      <input
                        type="checkbox"
                        checked={filteredServers.length > 0 && selectedServerIds.size === filteredServers.length}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate =
                              selectedServerIds.size > 0 && selectedServerIds.size < filteredServers.length;
                          }
                        }}
                        onChange={() => {
                          if (selectedServerIds.size === filteredServers.length && filteredServers.length > 0) {
                            setSelectedServerIds(new Set());
                          } else {
                            setSelectedServerIds(new Set(filteredServers.map((s) => s.id)));
                          }
                        }}
                        className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-white/20 focus:ring-cyan-500 accent-cyan-500 cursor-pointer"
                      />
                    </th>
                  )}
                  {visibleColumns.node && (
                    <th
                      className={`p-3.5 ${
                        isEn ? 'border-r' : 'border-l'
                      } ${isLightMode ? 'border-slate-200' : 'border-white/15'}`}
                    >
                      {isEn ? 'Server Node & Hostname' : 'نام و هاست‌نیم سرور'}
                    </th>
                  )}
                  {visibleColumns.os && (
                    <th
                      className={`p-3.5 ${
                        isEn ? 'border-r' : 'border-l'
                      } ${isLightMode ? 'border-slate-200' : 'border-white/15'}`}
                    >
                      {isEn ? 'OS & Distro' : 'سیستم‌عامل و توزیع'}
                    </th>
                  )}
                  {visibleColumns.ip && (
                    <th
                      className={`p-3.5 ${
                        isEn ? 'border-r' : 'border-l'
                      } ${isLightMode ? 'border-slate-200' : 'border-white/15'}`}
                    >
                      {isEn ? 'IP Address & Port' : 'آدرس IP و پورت'}
                    </th>
                  )}
                  {visibleColumns.role && (
                    <th
                      className={`p-3.5 ${
                        isEn ? 'border-r' : 'border-l'
                      } ${isLightMode ? 'border-slate-200' : 'border-white/15'}`}
                    >
                      {isEn ? 'Role & Environment' : 'محیط و دسته‌بندی'}
                    </th>
                  )}
                  {visibleColumns.status && (
                    <th
                      className={`p-3.5 ${
                        isEn ? 'border-r' : 'border-l'
                      } ${isLightMode ? 'border-slate-200' : 'border-white/15'}`}
                    >
                      {isEn ? 'Live Status' : 'وضعیت لحظه‌ای'}
                    </th>
                  )}
                  {visibleColumns.tags && (
                    <th
                      className={`p-3.5 ${
                        isEn ? 'border-r' : 'border-l'
                      } ${isLightMode ? 'border-slate-200' : 'border-white/15'}`}
                    >
                      {isEn ? 'Automation Tags' : 'تگ‌های اتوماسیون'}
                    </th>
                  )}
                  {visibleColumns.actions && (
                    <th className="p-3.5 text-center">{isEn ? 'Actions' : 'عملیات'}</th>
                  )}
                </tr>
              </thead>
              <tbody className={`divide-y ${isLightMode ? 'divide-slate-200' : 'divide-white/10'}`}>
                {filteredServers.length === 0 ? (
                  <tr>
                    <td colSpan={Object.values(visibleColumns).filter(Boolean).length || 8} className="p-8 text-center text-slate-400">
                      {isEn ? 'No remote servers found matching filters.' : 'هیچ سروری منطبق با فیلترها یافت نشد.'}
                    </td>
                  </tr>
                ) : (
                  filteredServers.map((server) => {
                    const isLinux = server.os_type === 'linux';
                    const reach = reachabilityCache[server.id];
                    const isSelected = selectedServerIds.has(server.id);

                    return (
                      <tr
                        key={server.id}
                        className={`group transition-colors duration-150 ${
                          isSelected
                            ? isLightMode
                              ? 'bg-cyan-50/60'
                              : 'bg-cyan-950/30'
                            : isLightMode
                            ? 'hover:bg-slate-50'
                            : 'hover:bg-white/5'
                        }`}
                      >
                        {/* Checkbox Column */}
                        {visibleColumns.select && (
                          <td
                            className={`p-3.5 text-center ${
                              isEn ? 'border-r' : 'border-l'
                            } ${isLightMode ? 'border-slate-200' : 'border-white/10'}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedServerIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(server.id)) next.delete(server.id);
                                  else next.add(server.id);
                                  return next;
                                });
                              }}
                              className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-white/20 focus:ring-cyan-500 accent-cyan-500 cursor-pointer"
                            />
                          </td>
                        )}

                        {/* Server Node & Hostname */}
                        {visibleColumns.node && (
                          <td
                            className={`p-3.5 ${
                              isEn ? 'border-r' : 'border-l'
                            } ${isLightMode ? 'border-slate-200' : 'border-white/10'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`p-2 rounded-xl border shrink-0 ${
                                  isLinux
                                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                    : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                                }`}
                              >
                                {isLinux ? <Terminal className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                              </div>
                              <div className="min-w-0">
                                {isLinux ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenLinuxMonitor(server)}
                                    className="text-left rtl:text-right group/lst block cursor-pointer focus:outline-none"
                                    title={isEn ? `Open Server Management for ${server.name}` : `باز کردن مدیریت سرور برای ${server.name}`}
                                  >
                                    <div
                                      className={`text-xs font-bold tracking-tight truncate transition-colors group-hover/lst:text-cyan-400 group-hover/lst:underline ${
                                        isLightMode
                                          ? 'text-slate-900 group-hover:text-cyan-700'
                                          : 'text-white group-hover:text-cyan-300'
                                      }`}
                                    >
                                      {server.name}
                                    </div>
                                  </button>
                                ) : (
                                  <div
                                    className={`text-xs font-bold tracking-tight truncate transition-colors ${
                                      isLightMode
                                        ? 'text-slate-900 group-hover:text-cyan-700'
                                        : 'text-white group-hover:text-cyan-300'
                                    }`}
                                  >
                                    {server.name}
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                                  <span>{server.hostname || server.ip}</span>
                                  <span>•</span>
                                  <span>
                                    {server.cpu_cores || 4} vCPU • {server.ram_gb || 16} GB
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                        )}

                        {/* OS & Distro */}
                        {visibleColumns.os && (
                          <td
                            className={`p-3.5 ${
                              isEn ? 'border-r' : 'border-l'
                            } ${isLightMode ? 'border-slate-200' : 'border-white/10'}`}
                          >
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                                    isLinux
                                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                      : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                  }`}
                                >
                                  {server.os_type.toUpperCase()}
                                </span>
                                <span className="text-xs font-medium truncate max-w-[140px]">
                                  {server.os_distro || (isLinux ? 'Linux' : 'Windows Server')}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {isLinux
                                  ? `Shell: /bin/${server.default_shell || 'bash'}`
                                  : `Protocol: ${(server.win_protocol || 'rdp').toUpperCase()}`}
                              </span>
                            </div>
                          </td>
                        )}

                        {/* IP Address & Port */}
                        {visibleColumns.ip && (
                          <td
                            className={`p-3.5 ${
                              isEn ? 'border-r' : 'border-l'
                            } ${isLightMode ? 'border-slate-200' : 'border-white/10'}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-cyan-400">{server.ip}</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                :{isLinux ? server.ssh_port || 22 : server.win_port || 3389}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyIp(server.ip)}
                                title={isEn ? 'Copy IP address' : 'کپی آدرس آی‌پی'}
                                className={`p-1 rounded-md transition cursor-pointer ${
                                  copiedIp === server.ip
                                    ? 'text-emerald-400'
                                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                                }`}
                              >
                                {copiedIp === server.ip ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                        )}

                        {/* Role & Environment */}
                        {visibleColumns.role && (
                          <td
                            className={`p-3.5 ${
                              isEn ? 'border-r' : 'border-l'
                            } ${isLightMode ? 'border-slate-200' : 'border-white/10'}`}
                          >
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                                    server.environment === 'Production'
                                      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                      : server.environment === 'Staging'
                                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                      : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                                  }`}
                                >
                                  {server.environment}
                                </span>
                                <span className="text-[11px] text-slate-300 truncate">{server.category}</span>
                              </div>
                              {server.prompt_password_on_connect && (
                                <span
                                  title={isEn ? 'Zero-storage credential policy (Prompt on connect)' : 'عدم ذخیره پسورد (درخواست در زمان اتصال)'}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 w-fit"
                                >
                                  <Key className="w-2.5 h-2.5" />
                                  <span>{isEn ? 'No-Store' : 'بدون‌ذخیره'}</span>
                                </span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Live Status */}
                        {visibleColumns.status && (
                          <td
                            className={`p-3.5 ${
                              isEn ? 'border-r' : 'border-l'
                            } ${isLightMode ? 'border-slate-200' : 'border-white/10'}`}
                          >
                            <div className="flex items-center gap-2">
                              {reach?.testing ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 animate-pulse">
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  <span>Pinging...</span>
                                </span>
                              ) : reach ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${
                                    reach.reachable
                                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                      : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      reach.reachable ? 'bg-emerald-400' : 'bg-rose-400'
                                    }`}
                                  />
                                  {reach.reachable ? `${reach.latency}ms` : 'Down'}
                                </span>
                              ) : (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${
                                    server.status === 'online'
                                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                      : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      server.status === 'online'
                                        ? 'bg-emerald-400'
                                        : 'bg-slate-400'
                                    }`}
                                  />
                                  {server.status || 'Ready'}
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => handleTestPing(server.id)}
                                title={isEn ? 'Test keepalive ping' : 'تست پینگ لحظه‌ای'}
                                className={`p-1 rounded-md border transition cursor-pointer ${
                                  isLightMode
                                    ? 'border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-cyan-700'
                                    : 'border-white/10 text-slate-400 hover:text-cyan-300 hover:bg-white/10'
                                }`}
                              >
                                <Zap className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        )}

                        {/* Automation Tags */}
                        {visibleColumns.tags && (
                          <td
                            className={`p-3.5 ${
                              isEn ? 'border-r' : 'border-l'
                            } ${isLightMode ? 'border-slate-200' : 'border-white/10'}`}
                          >
                            <div className="flex flex-wrap items-center gap-1 max-w-[200px]">
                              {Array.isArray(server.tags) && server.tags.length > 0 ? (
                                server.tags.slice(0, 3).map((t) => (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={() => setSelectedTag(t)}
                                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/25 text-purple-300 border border-purple-500/20 transition cursor-pointer"
                                  >
                                    #{t}
                                  </button>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-500">—</span>
                              )}
                              {Array.isArray(server.tags) && server.tags.length > 3 && (
                                <span className="text-[10px] text-slate-500 font-mono">+{server.tags.length - 3}</span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Actions (3-Dot Options Trigger) */}
                        {visibleColumns.actions && (
                          <td className="p-3.5 text-center">
                            <div className="flex items-center justify-center">
                              {/* 3-Dot Options Trigger */}
                              <button
                                type="button"
                                onClick={(e) => handleToggleActionMenu(e, server)}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  menuAnchor?.id === server.id
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                    : isLightMode
                                    ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
                                    : 'text-slate-400 hover:bg-white/10 hover:text-white border border-white/10'
                                }`}
                                title={isEn ? 'Actions & Options' : 'عملیات و گزینه‌ها'}
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. Grid Cards View (Compact & Sleek) */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredServers.map((server) => {
            const isLinux = server.os_type === 'linux';
            const reach = reachabilityCache[server.id];

            return (
              <div
                key={server.id}
                className={`group flex flex-col justify-between p-4 rounded-xl border transition-all duration-200 hover:shadow-xl relative ${
                  isLightMode
                    ? 'bg-white border-slate-200 hover:border-cyan-400 shadow-sm'
                    : 'spatial-glass spatial-glass-hover border-white/10 shadow-lg'
                }`}
              >
                <div>
                  {/* Card Header: OS Icon, Name, Status, 3-Dot Menu */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`p-2 rounded-xl border shrink-0 ${
                          isLinux
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                            : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                        }`}
                      >
                        {isLinux ? <Terminal className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        {isLinux ? (
                          <button
                            type="button"
                            onClick={() => handleOpenLinuxMonitor(server)}
                            className="text-left rtl:text-right cursor-pointer group/name block max-w-full"
                            title={isEn ? `Open Server Management for ${server.name}` : `باز کردن مدیریت سرور برای ${server.name}`}
                          >
                            <h3
                              className={`text-sm font-bold tracking-tight truncate transition-colors ${
                                isLightMode ? 'text-slate-900 group-hover/name:text-cyan-700' : 'text-white group-hover/name:text-cyan-300'
                              }`}
                            >
                              {server.name}
                            </h3>
                          </button>
                        ) : (
                          <h3
                            className={`text-sm font-bold tracking-tight truncate transition-colors ${
                              isLightMode ? 'text-slate-900 group-hover:text-cyan-700' : 'text-white group-hover:text-cyan-300'
                            }`}
                          >
                            {server.name}
                          </h3>
                        )}
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5 truncate">
                          <span>{server.os_distro || (isLinux ? 'Linux' : 'Windows Server')}</span>
                          <span>•</span>
                          <span className="font-mono">{server.category}</span>
                          {server.prompt_password_on_connect && (
                            <span
                              title={isEn ? 'Zero-storage credential policy' : 'عدم ذخیره پسورد'}
                              className="inline-flex items-center gap-1 px-1 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0"
                            >
                              <Key className="w-2.5 h-2.5" />
                              <span>{isEn ? 'No-Store' : 'بدون‌ذخیره'}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border ${
                          server.environment === 'Production'
                            ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                            : server.environment === 'Staging'
                            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                        }`}
                      >
                        {server.environment}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => handleToggleActionMenu(e, server)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          menuAnchor?.id === server.id
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : isLightMode
                            ? 'text-slate-500 hover:bg-slate-100'
                            : 'text-slate-400 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* IP Address & Reachability Bar */}
                  <div
                    className={`flex items-center justify-between mt-3 p-2 rounded-xl font-mono text-xs border ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-cyan-400 font-bold">{server.ip}</span>
                      {server.hostname && (
                        <span className="text-[11px] text-slate-400 truncate">({server.hostname})</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {reach && (
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                            reach.reachable
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {reach.reachable ? `${reach.latency}ms` : 'Down'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tags */}
                  {Array.isArray(server.tags) && server.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-2.5 flex-wrap">
                      {server.tags.slice(0, 3).map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setSelectedTag(tag)}
                          className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 transition-colors cursor-pointer"
                        >
                          #{tag}
                        </button>
                      ))}
                      {server.tags.length > 3 && (
                        <span className="text-[10px] text-slate-500 font-mono">+{server.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Action Section */}
                <div
                  className={`pt-3 mt-3 border-t flex items-center justify-between gap-2 ${
                    isLightMode ? 'border-slate-200' : 'border-white/10'
                  }`}
                >
                  <div className="text-[11px] text-slate-400 font-mono">
                    {server.cpu_cores || 4} vCPU • {server.ram_gb || 16} GB
                  </div>

                  {isLinux ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenLinuxMonitor(server)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 shadow-md transition-all cursor-pointer"
                        title={isEn ? 'Open Server Management' : 'مشاهده و مدیریت کامل سرور'}
                      >
                        <Activity className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Management' : 'مدیریت'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenLinuxTerminal(server, server.default_shell === 'zsh' ? 'zsh' : 'bash')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-md transition-all cursor-pointer"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Terminal' : 'ترمینال'}</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOpenInBrowserRemote(server, 'rdp')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-md transition-all cursor-pointer"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      <span>{isEn ? 'In-Browser RDP' : 'ریموت'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 8. Dense Table View */}
      {viewMode === 'table' && (
        <div
          className={`rounded-2xl border overflow-hidden shadow-xl backdrop-blur-xl ${
            isLightMode ? 'bg-white border-slate-200' : 'spatial-glass border-white/10'
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr
                  className={`border-b text-[10px] font-mono uppercase ${
                    isLightMode
                      ? 'bg-slate-100 text-slate-700 border-slate-200'
                      : 'border-white/10 bg-slate-950/80 text-slate-400'
                  }`}
                >
                  {visibleColumns.os && <th className="p-3">OS</th>}
                  {visibleColumns.node && <th className="p-3">{isEn ? 'Server Name' : 'نام سرور'}</th>}
                  {visibleColumns.ip && <th className="p-3">IP / Port</th>}
                  {visibleColumns.role && <th className="p-3">{isEn ? 'Category' : 'دسته'}</th>}
                  {visibleColumns.role && <th className="p-3">{isEn ? 'Env' : 'محیط'}</th>}
                  {visibleColumns.tags && <th className="p-3">{isEn ? 'Tags' : 'تگ‌ها'}</th>}
                  {visibleColumns.actions && <th className="p-3 text-right">{isEn ? 'Actions' : 'عملیات'}</th>}
                </tr>
              </thead>
              <tbody className={`divide-y ${isLightMode ? 'divide-slate-200' : 'divide-white/10'} font-sans`}>
                {filteredServers.map((server) => {
                  const isLinux = server.os_type === 'linux';

                  return (
                    <tr
                      key={server.id}
                      className={`transition-colors ${
                        isLightMode ? 'hover:bg-slate-50' : 'hover:bg-white/5'
                      }`}
                    >
                      {visibleColumns.os && (
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                              isLinux
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                            }`}
                          >
                            {isLinux ? <Terminal className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                            {server.os_type.toUpperCase()}
                          </span>
                        </td>
                      )}
                      {visibleColumns.node && (
                        <td className={`p-3 font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                          {isLinux ? (
                            <button
                              type="button"
                              onClick={() => handleOpenLinuxMonitor(server)}
                              className="text-left rtl:text-right group/tblname block cursor-pointer focus:outline-none"
                              title={isEn ? `Open Server Management for ${server.name}` : `باز کردن مدیریت سرور برای ${server.name}`}
                            >
                              <div className="group-hover/tblname:text-cyan-400 group-hover/tblname:underline transition-colors">
                                {server.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-normal">{server.os_distro}</div>
                            </button>
                          ) : (
                            <div>
                              <div>{server.name}</div>
                              <div className="text-[10px] text-slate-400 font-normal">{server.os_distro}</div>
                            </div>
                          )}
                        </td>
                      )}
                      {visibleColumns.ip && (
                        <td className="p-3 font-mono text-cyan-400 font-semibold">
                          {server.ip}:{isLinux ? server.ssh_port || 22 : server.win_port || 3389}
                        </td>
                      )}
                      {visibleColumns.role && <td className="p-3 text-slate-400">{server.category}</td>}
                      {visibleColumns.role && (
                        <td className="p-3">
                          <span
                            className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                              server.environment === 'Production'
                                ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                            }`}
                          >
                            {server.environment}
                          </span>
                        </td>
                      )}
                      {visibleColumns.tags && (
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {server.tags?.map((t) => (
                              <span
                                key={t}
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        </td>
                      )}
                      {visibleColumns.actions && (
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isLinux ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenLinuxMonitor(server)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-cyan-400 text-slate-950 hover:bg-cyan-300 cursor-pointer shadow-sm"
                                  title={isEn ? 'Open Server Management' : 'مشاهده و مدیریت کامل سرور'}
                                >
                                  {isEn ? 'Manage' : 'مدیریت'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOpenLinuxTerminal(server, server.default_shell === 'zsh' ? 'zsh' : 'bash')
                                  }
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 cursor-pointer"
                                >
                                  {isEn ? 'Terminal' : 'ترمینال'}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenInBrowserRemote(server, 'rdp')}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-500 cursor-pointer shadow-sm"
                              >
                                Web RDP
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => handleToggleActionMenu(e, server)}
                              className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 9. Floating 3-Dots Action Dropdown Menu (Portal, matching DeviceListView) */}
      {menuAnchor &&
        createPortal(
          <>
            {/* Transparent backdrop */}
            <div
              className="fixed inset-0 z-50 bg-black/10"
              onClick={(e) => {
                e.stopPropagation();
                setMenuAnchor(null);
              }}
            />

            <div
              style={{
                position: 'fixed',
                top: menuAnchor.top !== undefined ? `${menuAnchor.top}px` : undefined,
                bottom: menuAnchor.bottom !== undefined ? `${menuAnchor.bottom}px` : undefined,
                left: menuAnchor.left !== undefined ? `${menuAnchor.left}px` : undefined,
                right: menuAnchor.right !== undefined ? `${menuAnchor.right}px` : undefined,
              }}
              className={`w-60 z-50 rounded-2xl shadow-2xl p-1.5 border font-sans animate-in fade-in zoom-in-95 ${
                isEn ? 'text-left' : 'text-right'
              } ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-900 shadow-slate-900/20'
                  : 'bg-slate-950/95 border-white/15 backdrop-blur-2xl text-slate-100'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Menu Header: Name & IP */}
              <div
                className={`px-3 py-2 border-b flex items-center justify-between text-[11px] font-mono ${
                  isLightMode ? 'border-slate-200' : 'border-white/10'
                }`}
              >
                <span className="font-bold truncate max-w-[120px]">{menuAnchor.server.name}</span>
                <span className="text-cyan-400 font-semibold">{menuAnchor.server.ip}</span>
              </div>

              <div className="py-1 space-y-0.5">
                {/* Ping / Keepalive Test */}
                <button
                  type="button"
                  onClick={() => handleTestPing(menuAnchor.server.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                    isEn ? 'text-left' : 'text-right'
                  } ${
                    isLightMode ? 'text-slate-700 hover:bg-slate-100 hover:text-cyan-700' : 'text-slate-200 hover:bg-white/10 hover:text-cyan-300'
                  }`}
                >
                  <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div className="flex flex-col">
                    <span>{isEn ? 'Test Reachability / Ping' : 'تست وضعیت پینگ و تاخیر'}</span>
                    <span className="text-[10px] text-slate-400 font-mono">ICMP Keepalive Check</span>
                  </div>
                </button>

                {/* Copy IP Address */}
                <button
                  type="button"
                  onClick={() => handleCopyIp(menuAnchor.server.ip)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                    isEn ? 'text-left' : 'text-right'
                  } ${
                    isLightMode ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <Copy className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="flex flex-col">
                    <span>{isEn ? 'Copy IP Address' : 'کپی آدرس آی‌پی'}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{menuAnchor.server.ip}</span>
                  </div>
                </button>

                {/* Linux Specific Remote Options */}
                {menuAnchor.server.os_type === 'linux' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const s = menuAnchor.server;
                        handleOpenLinuxMonitor(s);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-cyan-300 transition cursor-pointer ${
                        isEn ? 'text-left' : 'text-right'
                      } ${isLightMode ? 'hover:bg-cyan-50' : 'hover:bg-cyan-500/15'}`}
                    >
                      <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
                      <div className="flex flex-col">
                        <span>{isEn ? 'Server Management' : 'مدیریت سرور'}</span>
                        <span className="text-[10px] text-cyan-400/80 font-mono">Overview, Storage, Services & Config</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const s = menuAnchor.server;
                        handleOpenInBrowserRemote(s, 'vnc');
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-amber-300 transition cursor-pointer ${
                        isEn ? 'text-left' : 'text-right'
                      } ${isLightMode ? 'hover:bg-amber-50' : 'hover:bg-amber-500/15'}`}
                    >
                      <Monitor className="w-4 h-4 text-amber-400 shrink-0" />
                      <div className="flex flex-col">
                        <span>{isEn ? 'In-Browser VNC Console' : 'کنسول گرافیکی VNC مرورگر'}</span>
                        <span className="text-[10px] text-amber-400/80 font-mono">Web Desktop Stream</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const s = menuAnchor.server;
                        handleOpenLinuxTerminal(s, 'bash');
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-emerald-300 transition cursor-pointer ${
                        isEn ? 'text-left' : 'text-right'
                      } ${isLightMode ? 'hover:bg-emerald-50' : 'hover:bg-emerald-500/15'}`}
                    >
                      <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div className="flex flex-col">
                        <span>{isEn ? 'SSH Terminal (Bash)' : 'شل تعاملی Bash'}</span>
                        <span className="text-[10px] text-emerald-400/80 font-mono">/bin/bash Shell</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const s = menuAnchor.server;
                        handleOpenLinuxTerminal(s, 'zsh');
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-cyan-300 transition cursor-pointer ${
                        isEn ? 'text-left' : 'text-right'
                      } ${isLightMode ? 'hover:bg-cyan-50' : 'hover:bg-cyan-500/15'}`}
                    >
                      <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                      <div className="flex flex-col">
                        <span>{isEn ? 'SSH Terminal (Zsh)' : 'شل تعاملی Zsh'}</span>
                        <span className="text-[10px] text-cyan-400/80 font-mono">/bin/zsh Shell</span>
                      </div>
                    </button>
                  </>
                )}

                {/* Windows Specific Remote Options */}
                {menuAnchor.server.os_type === 'windows' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const s = menuAnchor.server;
                        handleOpenInBrowserRemote(s, 'rdp');
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-cyan-300 transition cursor-pointer ${
                        isEn ? 'text-left' : 'text-right'
                      } ${isLightMode ? 'hover:bg-cyan-50' : 'hover:bg-cyan-500/15'}`}
                    >
                      <Monitor className="w-4 h-4 text-cyan-400 shrink-0" />
                      <div className="flex flex-col">
                        <span>{isEn ? 'In-Browser RDP' : 'ریموت دسکتاپ در مرورگر'}</span>
                        <span className="text-[10px] text-cyan-400/80 font-mono">HTML5 Guacamole Gateway</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const s = menuAnchor.server;
                        handleOpenWindowsRemote(s);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-blue-300 transition cursor-pointer ${
                        isEn ? 'text-left' : 'text-right'
                      } ${isLightMode ? 'hover:bg-blue-50' : 'hover:bg-blue-500/15'}`}
                    >
                      <ExternalLink className="w-4 h-4 text-blue-400 shrink-0" />
                      <div className="flex flex-col">
                        <span>{isEn ? 'Native RDP / PowerShell' : 'تنظیمات mstsc و پاورشل'}</span>
                        <span className="text-[10px] text-blue-400/80 font-mono">Desktop Client & PowerShell</span>
                      </div>
                    </button>
                  </>
                )}

                <div className={`my-1 border-t ${isLightMode ? 'border-slate-200' : 'border-white/10'}`} />

                {/* Edit Server Properties */}
                <button
                  type="button"
                  onClick={() => handleOpenEdit(menuAnchor.server)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-amber-300 transition cursor-pointer ${
                    isEn ? 'text-left' : 'text-right'
                  } ${isLightMode ? 'hover:bg-amber-50' : 'hover:bg-amber-500/15'}`}
                >
                  <Edit2 className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="flex flex-col">
                    <span>{isEn ? 'Edit Server Properties' : 'ویرایش مشخصات سرور'}</span>
                    <span className="text-[10px] text-amber-400/80 font-mono">Host, IP, Credentials, Tags</span>
                  </div>
                </button>

                {/* Delete Server */}
                <button
                  type="button"
                  onClick={() => {
                    const s = menuAnchor.server;
                    setMenuAnchor(null);
                    setServerToDelete(s);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:text-rose-300 transition cursor-pointer ${
                    isEn ? 'text-left' : 'text-right'
                  } ${isLightMode ? 'hover:bg-rose-50' : 'hover:bg-rose-500/20'}`}
                >
                  <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{isEn ? 'Delete Server from Fleet' : 'حذف سرور از ناوگان'}</span>
                </button>
              </div>
            </div>
          </>,
          document.body
        )}

      {/* 10. Delete Confirmation Dialog */}
      {serverToDelete &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            dir={isEn ? 'ltr' : 'rtl'}
          >
            <div
              className={`w-full max-w-md rounded-2xl p-5 border shadow-2xl space-y-4 ${
                isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">
                    {isEn ? 'Confirm Server Deletion' : 'تأیید حذف سرور از ناوگان'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {serverToDelete.name} ({serverToDelete.ip})
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                {isEn
                  ? 'Are you sure you want to permanently remove this server from the automation fleet? All registered credentials and telemetry associations will be discarded.'
                  : 'آیا از حذف دائمی این سرور از ناوگان اطمینان دارید؟ اطلاعات احراز هویت و ارتباطات پایش این سرور حذف خواهند شد.'}
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setServerToDelete(null)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer ${
                    isLightMode
                      ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                      : 'border-slate-800 text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-600/30 transition cursor-pointer"
                >
                  {isEn ? 'Delete Server' : 'حذف قطعی سرور'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 11. Add / Edit Server Modal */}
      <AddEditServerModal
        isOpen={isAddEditModalOpen}
        serverToEdit={serverToEdit}
        onClose={() => {
          setIsAddEditModalOpen(false);
          undockModal('add_edit_remote_server');
        }}
        onMinimize={handleMinimizeAddEdit}
        onSave={handleSaveServer}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* 12. Linux Terminal Modal (Bash / Zsh) */}
      <LinuxTerminalModal
        isOpen={isTerminalModalOpen}
        server={terminalServer}
        availableServers={servers}
        initialShell={terminalShell}
        sessionPassword={ephemeralTerminalPassword}
        onClose={() => {
          setIsTerminalModalOpen(false);
          setEphemeralTerminalPassword(undefined);
          if (terminalServer) undockModal(`linux_term_${terminalServer.id}`);
          setTerminalServer(null);
        }}
        onMinimize={handleMinimizeLinuxTerminal}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* 12.5 Linux Live Resource & Telemetry Monitoring Modal */}
      <LinuxServerMonitorModal
        isOpen={isMonitorModalOpen}
        server={monitorServer}
        sessionPassword={ephemeralTerminalPassword}
        onClose={() => {
          setIsMonitorModalOpen(false);
          if (monitorServer) undockModal(`linux_mon_${monitorServer.id}`);
          setMonitorServer(null);
        }}
        onMinimize={handleMinimizeMonitor}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* 13. Windows Remote Connect Modal (RDP / PowerShell) */}
      <WindowsRemoteConnectModal
        isOpen={isWindowsModalOpen}
        server={windowsModalServer}
        onClose={() => {
          setIsWindowsModalOpen(false);
          if (windowsModalServer) undockModal(`win_remote_${windowsModalServer.id}`);
        }}
        onMinimize={handleMinimizeWindowsRemote}
        onLaunchInBrowserRdp={(srv) => handleOpenInBrowserRemote(srv, 'rdp')}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* 14. In-Browser Remote Desktop Modal (Guacamole Gateway RDP / VNC) */}
      <InBrowserRemoteDesktopModal
        isOpen={isInBrowserModalOpen}
        server={inBrowserRemoteServer}
        protocol={inBrowserProtocol}
        sessionPassword={ephemeralRdpPassword}
        onClose={() => {
          setIsInBrowserModalOpen(false);
          setEphemeralRdpPassword(undefined);
          if (inBrowserRemoteServer) undockModal(`inbrowser_remote_${inBrowserRemoteServer.id}`);
        }}
        onMinimize={handleMinimizeInBrowserRemote}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* 15. On-Demand Password Prompt Modal (Zero-Storage Policy) */}
      <OnDemandPasswordModal
        isOpen={isOnDemandModalOpen}
        server={onDemandServer}
        target={onDemandTarget}
        isLightMode={isLightMode}
        isEn={isEn}
        onClose={() => {
          setIsOnDemandModalOpen(false);
          if (onDemandServer) undockModal(`ondemand_auth_${onDemandServer.id}`);
          setOnDemandServer(null);
        }}
        onMinimize={handleMinimizeOnDemand}
        onConfirmConnect={(pass) => {
          if (onDemandServer) undockModal(`ondemand_auth_${onDemandServer.id}`);
          handleConfirmOnDemandConnect(pass);
        }}
      />

      {/* 16. Manage Server Categories Modal */}
      <ManageServerCategoriesModal
        isOpen={isCategoriesModalOpen}
        isLightMode={isLightMode}
        isEn={isEn}
        onClose={() => {
          setIsCategoriesModalOpen(false);
          undockModal('manage_server_categories');
        }}
        onMinimize={handleMinimizeCategories}
        onCategoriesChanged={handleCategoriesChanged}
      />

      {/* 17. Bulk Linux Server Configuration Modal */}
      <BulkServerConfigModal
        isOpen={isBulkConfigOpen}
        onClose={() => {
          setIsBulkConfigOpen(false);
          undockModal('bulk_server_config_modal');
        }}
        onMinimize={handleMinimizeBulkConfig}
        isLightMode={isLightMode}
        isEn={isEn}
        allServers={servers}
        initialSelectedServers={servers.filter((s) => selectedServerIds.has(s.id))}
        onServersUpdated={loadFleet}
      />
    </div>
  );
};
