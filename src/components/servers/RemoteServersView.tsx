import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Server,
  Terminal,
  Monitor,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Tags,
  CheckCircle2,
  AlertCircle,
  Clock,
  MoreVertical,
  Edit2,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  Shield,
  Activity,
  Layers,
  LayoutGrid,
  List,
  Table as TableIcon,
  Play,
  Cpu,
  Globe,
  Sparkles,
  Zap,
  ArrowUpDown,
  HardDrive,
  ChevronDown,
} from 'lucide-react';
import { RemoteServer, RemoteServerTagSummary } from '../../types';
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
import { WindowsRemoteConnectModal } from './WindowsRemoteConnectModal';
import { InBrowserRemoteDesktopModal } from './InBrowserRemoteDesktopModal';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { useModalDock } from '../../context/ModalDockContext';

export interface RemoteServersViewProps {
  initialFilter?: 'all' | 'linux' | 'windows' | 'tags';
  isLightMode?: boolean;
  isEn?: boolean;
}

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

  // Filter & Search states
  const [activeTabFilter, setActiveTabFilter] = useState<'all' | 'linux' | 'windows' | 'tags'>(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEnv, setSelectedEnv] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'table'>('grid');

  // 3-Dot context menu state
  const [activeMenuServerId, setActiveMenuServerId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Modal states
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [serverToEdit, setServerToEdit] = useState<RemoteServer | null>(null);

  // Terminal & Remote Connect Modals
  const [terminalServer, setTerminalServer] = useState<RemoteServer | null>(null);
  const [terminalShell, setTerminalShell] = useState<'bash' | 'zsh'>('bash');
  const [isTerminalModalOpen, setIsTerminalModalOpen] = useState(false);

  const [windowsModalServer, setWindowsModalServer] = useState<RemoteServer | null>(null);
  const [isWindowsModalOpen, setIsWindowsModalOpen] = useState(false);

  const [inBrowserRemoteServer, setInBrowserRemoteServer] = useState<RemoteServer | null>(null);
  const [inBrowserProtocol, setInBrowserProtocol] = useState<'rdp' | 'vnc'>('rdp');
  const [isInBrowserModalOpen, setIsInBrowserModalOpen] = useState(false);

  // Quick Ping / Test status cache
  const [reachabilityCache, setReachabilityCache] = useState<
    Record<string, { reachable: boolean; latency: number; testing: boolean }>
  >({});
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  // Close 3-dot menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuServerId(null);
      }
    };
    if (activeMenuServerId) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [activeMenuServerId]);

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

  useEffect(() => {
    loadFleet();
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

  // Statistics
  const stats = useMemo(() => {
    const total = servers.length;
    const linuxCount = servers.filter((s) => s.os_type === 'linux').length;
    const winCount = servers.filter((s) => s.os_type === 'windows').length;
    const prodCount = servers.filter((s) => s.environment === 'Production').length;
    return { total, linuxCount, winCount, prodCount };
  }, [servers]);

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
    setActiveMenuServerId(null);
    undockModal('add_edit_remote_server');
  };

  // Handle Save Server (create or update)
  const handleSaveServer = async (serverData: Partial<RemoteServer>) => {
    if (serverToEdit) {
      await updateRemoteServer(serverToEdit.id, serverData);
    } else {
      await createRemoteServer(serverData);
    }
    await loadFleet();
    setIsAddEditModalOpen(false);
    undockModal('add_edit_remote_server');
  };

  // Handle Delete Server
  const handleDelete = async (server: RemoteServer) => {
    setActiveMenuServerId(null);
    const confirmMsg = isEn
      ? `Are you sure you want to remove server "${server.name}" (${server.ip})?`
      : `آیا از حذف سرور "${server.name}" (${server.ip}) از ناوگان اطمینان دارید؟`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteRemoteServer(server.id);
      await loadFleet();
    } catch (err: any) {
      alert(err.message || 'Failed to delete server');
    }
  };

  // Handle Open Linux Terminal
  const handleOpenLinuxTerminal = (server: RemoteServer, shell: 'bash' | 'zsh' = 'bash') => {
    setTerminalServer(server);
    setTerminalShell(shell);
    setIsTerminalModalOpen(true);
    setActiveMenuServerId(null);
    undockModal(`linux_term_${server.id}`);
  };

  // Handle Open Windows Remote
  const handleOpenWindowsRemote = (server: RemoteServer) => {
    setWindowsModalServer(server);
    setIsWindowsModalOpen(true);
    setActiveMenuServerId(null);
    undockModal(`win_remote_${server.id}`);
  };

  // Handle Open In-Browser Remote Desktop (RDP / VNC via Guacamole Gateway)
  const handleOpenInBrowserRemote = (server: RemoteServer, protocol: 'rdp' | 'vnc' = 'rdp') => {
    setInBrowserRemoteServer(server);
    setInBrowserProtocol(protocol);
    setIsInBrowserModalOpen(true);
    setActiveMenuServerId(null);
    undockModal(`inbrowser_remote_${server.id}`);
  };

  // Handle Copy IP
  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 1500);
    setActiveMenuServerId(null);
  };

  // Handle Test Ping
  const handleTestPing = async (serverId: string) => {
    setActiveMenuServerId(null);
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

  return (
    <div
      className={`p-4 sm:p-6 rounded-2xl transition-colors duration-200 min-h-[600px] ${
        isLightMode ? 'bg-slate-50 text-slate-800' : 'bg-slate-950 text-slate-100'
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      {/* View Header with Title, Stats & Primary Action */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800/80 mb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white">
                  {isEn ? 'Remote Servers & Automation Fleet' : 'مدیریت سرورهای ریموت و ناوگان اتوماسیون'}
                </h2>
                <FieldInfoTooltip
                  title={isEn ? 'Remote Compute Fleet' : 'ناوگان سرورهای ریموت'}
                  whatIsIt={
                    isEn
                      ? 'Unified enterprise inventory of Linux and Windows remote compute nodes with terminal access.'
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
              <p className="text-xs text-slate-400 mt-1">
                {isEn
                  ? 'Access live Linux shells (Bash & Zsh), Windows PowerShell / RDP, and manage automation tags.'
                  : 'دسترسی زنده به شل لینوکس (Bash و Zsh)، ریموت ویندوز و مدیریت تگ‌های اتوماسیون ناوگان.'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls & Top Stats */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Quick Metrics Chips */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
              {isEn ? 'Total:' : 'کل:'} <strong>{stats.total}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              Linux: <strong>{stats.linuxCount}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400">
              Windows: <strong>{stats.winCount}</strong>
            </span>
          </div>

          {/* Add Server Button */}
          <button
            type="button"
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isEn ? 'Add Remote Server' : 'ثبت سرور جدید'}</span>
          </button>

          {/* Refresh Fleet */}
          <button
            type="button"
            onClick={loadFleet}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
            title={isEn ? 'Refresh fleet' : 'به‌روزرسانی ناوگان'}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Toolbar: Tabs, Search, Env, Category, Tag Dropdown & View Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5">
        {/* Left Filter Tabs (All, Linux, Windows, Tags) */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTabFilter('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTabFilter === 'all'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{isEn ? 'All Fleet' : 'همه سرورها'}</span>
            <span className="text-[10px] opacity-80">({stats.total})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTabFilter('linux')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTabFilter === 'linux'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>{isEn ? 'Linux Nodes' : 'لینوکس'}</span>
            <span className="text-[10px] opacity-80">({stats.linuxCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTabFilter('windows')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTabFilter === 'windows'
                ? 'bg-blue-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>{isEn ? 'Windows Nodes' : 'ویندوز'}</span>
            <span className="text-[10px] opacity-80">({stats.winCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTabFilter('tags')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTabFilter === 'tags'
                ? 'bg-purple-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Tags className="w-3.5 h-3.5" />
            <span>{isEn ? 'Tag Cloud' : 'مدیریت تگ‌ها'}</span>
            <span className="text-[10px] opacity-80">({tagsSummary.length})</span>
          </button>
        </div>

        {/* Right Controls: Search, Dropdowns (Env, Category, Tags), and View Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search Box */}
          <div className="relative min-w-[170px] flex-1 sm:flex-initial">
            <Search
              className={`w-3.5 h-3.5 text-slate-400 absolute ${
                isEn ? 'left-3' : 'right-3'
              } top-1/2 -translate-y-1/2`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isEn ? 'Search name, IP, distro...' : 'جستجوی نام، IP، توزیع...'}
              className={`w-full py-1.5 ${
                isEn ? 'pl-8 pr-3' : 'pr-8 pl-3'
              } rounded-xl border text-xs outline-none transition-colors ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                  : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-cyan-500'
              }`}
            />
          </div>

          {/* Environment Filter */}
          <select
            value={selectedEnv}
            onChange={(e) => setSelectedEnv(e.target.value)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs outline-none cursor-pointer ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800 text-slate-300'
            }`}
          >
            <option value="all">{isEn ? 'All Envs' : 'همه محیط‌ها'}</option>
            <option value="Production">Production</option>
            <option value="Staging">Staging</option>
            <option value="Development">Development</option>
            <option value="DMZ">DMZ</option>
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs outline-none cursor-pointer ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800 text-slate-300'
            }`}
          >
            <option value="all">{isEn ? 'All Categories' : 'همه دسته‌ها'}</option>
            <option value="Infrastructure">Infrastructure</option>
            <option value="Database">Database</option>
            <option value="Kubernetes">Kubernetes</option>
            <option value="Web / App">Web / App</option>
            <option value="Monitoring">Monitoring</option>
            <option value="Active Directory">Active Directory</option>
          </select>

          {/* Tag Filter Dropdown (User Requirement: Tags incorporated cleanly in filters!) */}
          <select
            value={selectedTag || 'all'}
            onChange={(e) => setSelectedTag(e.target.value === 'all' ? null : e.target.value)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs outline-none cursor-pointer ${
              selectedTag
                ? 'bg-purple-950/60 border-purple-500/50 text-purple-300 font-bold'
                : isLightMode
                ? 'bg-white border-slate-200 text-slate-700'
                : 'bg-slate-900 border-slate-800 text-slate-300'
            }`}
          >
            <option value="all">{isEn ? '🏷️ All Tags' : '🏷️ همه تگ‌ها'}</option>
            {tagsSummary.map((ts) => (
              <option key={ts.tag} value={ts.tag}>
                #{ts.tag} ({ts.count})
              </option>
            ))}
          </select>

          {/* View Mode Switcher: Grid, List, Table */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title={isEn ? 'Grid View' : 'نمایش کارت‌ها'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-slate-800 text-cyan-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              title={isEn ? 'List View' : 'نمایش لیستی'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'list' ? 'bg-slate-800 text-cyan-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title={isEn ? 'Table View' : 'نمایش جدولی'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-slate-800 text-cyan-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Active Tag Filter Indicator */}
      {selectedTag && (
        <div className="flex items-center gap-2 mb-4 p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs">
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

      {/* Automation Tags Cloud (ONLY shown when user explicitly clicks the Tags tab) */}
      {activeTabFilter === 'tags' && (
        <div
          className={`p-4 rounded-2xl border mb-6 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Tags className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {isEn ? 'Fleet Automation Tags' : 'ابر تگ‌های اتوماسیون ناوگان'}
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">
              {isEn ? 'Click tag to isolate targeted compute group' : 'برای فیلتر روی هر تگ کلیک کنید'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tagsSummary.map((ts) => {
              const isSelected = selectedTag === ts.tag;
              return (
                <button
                  key={ts.tag}
                  type="button"
                  onClick={() => setSelectedTag(isSelected ? null : ts.tag)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-purple-500 text-white shadow-md shadow-purple-500/30 ring-2 ring-purple-400'
                      : isLightMode
                      ? 'bg-slate-100 hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-200'
                      : 'bg-slate-950 hover:bg-purple-950/40 text-slate-300 hover:text-purple-300 border border-slate-800 hover:border-purple-500/40'
                  }`}
                >
                  <span>#{ts.tag}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isSelected ? 'bg-purple-700 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {ts.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 1. Main Server Cards Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredServers.map((server) => {
            const isLinux = server.os_type === 'linux';
            const reach = reachabilityCache[server.id];
            const isMenuOpen = activeMenuServerId === server.id;

            return (
              <div
                key={server.id}
                className={`group flex flex-col justify-between p-4 sm:p-5 rounded-2xl border transition-all duration-200 hover:shadow-xl relative ${
                  isLightMode
                    ? 'bg-white border-slate-200 hover:border-cyan-400 shadow-sm'
                    : 'bg-slate-900/60 border-slate-800/90 hover:border-cyan-500/40 hover:bg-slate-900/90 shadow-lg'
                }`}
              >
                <div>
                  {/* Card Header: OS Icon, Name, Status, 3-Dot Menu */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`p-2.5 rounded-xl border shrink-0 ${
                          isLinux
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        }`}
                      >
                        {isLinux ? <Terminal className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold tracking-tight text-white group-hover:text-cyan-300 transition-colors truncate">
                          {server.name}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5 truncate">
                          <span>{server.os_distro || (isLinux ? 'Linux' : 'Windows Server')}</span>
                          <span>•</span>
                          <span className="font-mono">{server.category}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border ${
                          server.environment === 'Production'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : server.environment === 'Staging'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                        }`}
                      >
                        {server.environment}
                      </span>

                      {/* 3-Dot Menu Trigger */}
                      <div className="relative" ref={isMenuOpen ? menuRef : undefined}>
                        <button
                          type="button"
                          onClick={() => setActiveMenuServerId(isMenuOpen ? null : server.id)}
                          className={`p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer ${
                            isMenuOpen ? 'bg-slate-800 text-white' : 'hover:bg-slate-800'
                          }`}
                          title={isEn ? 'More options' : 'گزینه‌های بیشتر'}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {/* Dropdown Menu */}
                        {isMenuOpen && (
                          <div
                            className={`absolute ${
                              isEn ? 'right-0' : 'left-0'
                            } mt-1 w-48 rounded-xl bg-slate-950 border border-slate-800 shadow-2xl p-1 z-30 text-xs space-y-0.5`}
                          >
                            <button
                              type="button"
                              onClick={() => handleTestPing(server.id)}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-cyan-300 hover:bg-slate-900 transition text-start cursor-pointer"
                            >
                              <Zap className="w-3.5 h-3.5 text-cyan-400" />
                              <span>{isEn ? 'Test Reachability / Ping' : 'تست پینگ و وضعیت'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCopyIp(server.ip)}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900 transition text-start cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span>{isEn ? 'Copy IP Address' : 'کپی آدرس آی‌پی'}</span>
                            </button>

                            {isLinux && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenInBrowserRemote(server, 'vnc')}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-amber-300 hover:bg-amber-950/40 transition text-start cursor-pointer font-medium"
                                >
                                  <Monitor className="w-3.5 h-3.5 text-amber-400" />
                                  <span>{isEn ? 'In-Browser VNC Console' : 'کنسول گرافیکی VNC در مرورگر'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenLinuxTerminal(server, 'bash')}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-emerald-300 hover:bg-emerald-950/40 transition text-start cursor-pointer"
                                >
                                  <Terminal className="w-3.5 h-3.5" />
                                  <span>{isEn ? 'Open Bash Terminal' : 'ترمینال Bash'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenLinuxTerminal(server, 'zsh')}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-cyan-300 hover:bg-cyan-950/40 transition text-start cursor-pointer"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>{isEn ? 'Open Zsh Terminal' : 'ترمینال Zsh'}</span>
                                </button>
                              </>
                            )}

                            {!isLinux && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenInBrowserRemote(server, 'rdp')}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-cyan-300 hover:bg-cyan-950/40 transition text-start cursor-pointer font-medium"
                                >
                                  <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                                  <span>{isEn ? 'In-Browser RDP (Web Gateway)' : 'ریموت دسکتاپ در مرورگر (وب گیت‌وی)'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenWindowsRemote(server)}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-blue-300 hover:bg-blue-950/40 transition text-start cursor-pointer"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  <span>{isEn ? 'Native RDP / PowerShell Suite' : 'تنظیمات mstsc و پاورشل'}</span>
                                </button>
                              </>
                            )}

                            <div className="my-1 border-t border-slate-800" />

                            <button
                              type="button"
                              onClick={() => handleOpenEdit(server)}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900 transition text-start cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                              <span>{isEn ? 'Edit Server' : 'ویرایش سرور'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(server)}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-400 hover:bg-rose-950/40 transition text-start cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{isEn ? 'Delete Server' : 'حذف سرور'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* IP Address & Reachability Bar */}
                  <div className="flex items-center justify-between mt-3 p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 font-mono text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-slate-300">{server.ip}</span>
                      {server.hostname && (
                        <span className="text-[11px] text-slate-500 truncate">({server.hostname})</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {reach && (
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                            reach.reachable
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {reach.reachable ? `${reach.latency}ms` : 'Down'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Clean, Compact Tags (No clutter!) */}
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
                        <span className="text-[10px] text-slate-500 font-mono">
                          +{server.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Action Section: ONE Clean Primary Button + Quick Info */}
                <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-400 font-mono">
                    {server.cpu_cores || 8} vCPU • {server.ram_gb || 32} GB
                  </div>

                  {isLinux ? (
                    <button
                      type="button"
                      onClick={() => handleOpenLinuxTerminal(server, server.default_shell === 'zsh' ? 'zsh' : 'bash')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Launch Terminal' : 'اتصال ترمینال'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOpenInBrowserRemote(server, 'rdp')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                      title={isEn ? 'Open live in-browser RDP session' : 'اتصال زنده ریموت دسکتاپ در مرورگر'}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      <span>{isEn ? 'In-Browser RDP' : 'ریموت در مرورگر'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 2. New List View (User Requirement: Ergonomic Horizontal Rows) */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {filteredServers.map((server) => {
            const isLinux = server.os_type === 'linux';
            const reach = reachabilityCache[server.id];
            const isMenuOpen = activeMenuServerId === server.id;

            return (
              <div
                key={server.id}
                className={`p-3 sm:p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all duration-150 ${
                  isLightMode
                    ? 'bg-white border-slate-200 hover:border-cyan-400'
                    : 'bg-slate-900/60 border-slate-800 hover:border-cyan-500/40 hover:bg-slate-900/90'
                }`}
              >
                {/* Left: Icon, Name, IP, Distro */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className={`p-2 rounded-lg border shrink-0 ${
                      isLinux
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                    }`}
                  >
                    {isLinux ? <Terminal className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white truncate">{server.name}</span>
                      <span className="font-mono text-xs text-cyan-400">
                        {server.ip}:{isLinux ? server.ssh_port || 22 : server.win_port || 3389}
                      </span>
                      <span
                        className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded border ${
                          server.environment === 'Production'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                        }`}
                      >
                        {server.environment}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 flex-wrap">
                      <span>{server.os_distro || (isLinux ? 'Linux' : 'Windows Server')}</span>
                      <span>•</span>
                      <span>{server.category}</span>
                      {Array.isArray(server.tags) && server.tags.length > 0 && (
                        <>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            {server.tags.slice(0, 2).map((t) => (
                              <span
                                key={t}
                                className="text-[10px] font-mono px-1 rounded bg-purple-500/10 text-purple-300"
                              >
                                #{t}
                              </span>
                            ))}
                            {server.tags.length > 2 && (
                              <span className="text-[10px] text-slate-500">+{server.tags.length - 2}</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Specs, Reachability, Primary Action & 3-Dot Menu */}
                <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                  <div className="hidden lg:block text-xs font-mono text-slate-400 text-end">
                    <div>{server.cpu_cores || 8} vCPU • {server.ram_gb || 32} GB</div>
                    <div className="text-[10px] text-slate-500">{server.disk_gb || 500} GB NVMe</div>
                  </div>

                  {reach && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        reach.reachable
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {reach.reachable ? `${reach.latency}ms` : 'Down'}
                    </span>
                  )}

                  {/* Primary Action Button */}
                  {isLinux ? (
                    <button
                      type="button"
                      onClick={() => handleOpenLinuxTerminal(server, server.default_shell === 'zsh' ? 'zsh' : 'bash')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-sm cursor-pointer"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Terminal' : 'ترمینال'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOpenInBrowserRemote(server, 'rdp')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-sm cursor-pointer"
                      title={isEn ? 'Open live in-browser RDP session' : 'اجرای ریموت دسکتاپ در مرورگر'}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      <span>{isEn ? 'In-Browser RDP' : 'ریموت دسکتاپ'}</span>
                    </button>
                  )}

                  {/* 3-Dot Menu */}
                  <div className="relative" ref={isMenuOpen ? menuRef : undefined}>
                    <button
                      type="button"
                      onClick={() => setActiveMenuServerId(isMenuOpen ? null : server.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {isMenuOpen && (
                      <div
                        className={`absolute ${
                          isEn ? 'right-0' : 'left-0'
                        } mt-1 w-52 rounded-xl bg-slate-950 border border-slate-800 shadow-2xl p-1 z-30 text-xs space-y-0.5`}
                      >
                        <button
                          type="button"
                          onClick={() => handleTestPing(server.id)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-cyan-300 hover:bg-slate-900 transition text-start cursor-pointer"
                        >
                          <Zap className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{isEn ? 'Test Reachability / Ping' : 'تست پینگ و وضعیت'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyIp(server.ip)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900 transition text-start cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          <span>{isEn ? 'Copy IP Address' : 'کپی آدرس آی‌پی'}</span>
                        </button>
                        {isLinux && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenInBrowserRemote(server, 'vnc')}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-amber-300 hover:bg-amber-950/40 transition text-start cursor-pointer font-medium"
                            >
                              <Monitor className="w-3.5 h-3.5 text-amber-400" />
                              <span>{isEn ? 'In-Browser VNC Console' : 'کنسول گرافیکی VNC در مرورگر'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenLinuxTerminal(server, 'bash')}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-emerald-300 hover:bg-emerald-950/40 transition text-start cursor-pointer"
                            >
                              <Terminal className="w-3.5 h-3.5" />
                              <span>{isEn ? 'Open Bash Terminal' : 'ترمینال Bash'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenLinuxTerminal(server, 'zsh')}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-cyan-300 hover:bg-cyan-950/40 transition text-start cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>{isEn ? 'Open Zsh Terminal' : 'ترمینال Zsh'}</span>
                            </button>
                          </>
                        )}
                        {!isLinux && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenInBrowserRemote(server, 'rdp')}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-cyan-300 hover:bg-cyan-950/40 transition text-start cursor-pointer font-medium"
                            >
                              <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                              <span>{isEn ? 'In-Browser RDP Session' : 'ریموت دسکتاپ در مرورگر'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenWindowsRemote(server)}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-blue-300 hover:bg-blue-950/40 transition text-start cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>{isEn ? 'Native RDP / PowerShell Suite' : 'تنظیمات mstsc و پاورشل'}</span>
                            </button>
                          </>
                        )}
                        <div className="my-1 border-t border-slate-800" />
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(server)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900 transition text-start cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{isEn ? 'Edit Server' : 'ویرایش سرور'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(server)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-400 hover:bg-rose-950/40 transition text-start cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Delete Server' : 'حذف سرور'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Enterprise Dense Table View */}
      {viewMode === 'table' && (
        <div
          className={`rounded-2xl border overflow-hidden ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-mono uppercase text-[10px]">
                  <th className="p-3.5">OS</th>
                  <th className="p-3.5">{isEn ? 'Server Name' : 'نام سرور'}</th>
                  <th className="p-3.5">IP / Port</th>
                  <th className="p-3.5">{isEn ? 'Category' : 'دسته'}</th>
                  <th className="p-3.5">{isEn ? 'Env' : 'محیط'}</th>
                  <th className="p-3.5">{isEn ? 'Tags' : 'تگ‌ها'}</th>
                  <th className="p-3.5 text-right">{isEn ? 'Actions' : 'عملیات'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredServers.map((server) => {
                  const isLinux = server.os_type === 'linux';
                  const reach = reachabilityCache[server.id];
                  const isMenuOpen = activeMenuServerId === server.id;

                  return (
                    <tr
                      key={server.id}
                      className={`hover:bg-slate-800/30 transition-colors ${
                        isLightMode ? 'hover:bg-slate-50' : ''
                      }`}
                    >
                      <td className="p-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                            isLinux
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          }`}
                        >
                          {isLinux ? <Terminal className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                          {server.os_type.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-3.5 font-bold text-white">
                        <div>{server.name}</div>
                        <div className="text-[10px] text-slate-400 font-normal">{server.os_distro}</div>
                      </td>
                      <td className="p-3.5 font-mono text-slate-300">
                        {server.ip}:{isLinux ? server.ssh_port || 22 : server.win_port || 3389}
                      </td>
                      <td className="p-3.5 text-slate-400">{server.category}</td>
                      <td className="p-3.5">
                        <span
                          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                            server.environment === 'Production'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                          }`}
                        >
                          {server.environment}
                        </span>
                      </td>
                      <td className="p-3.5">
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
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isLinux ? (
                            <button
                              type="button"
                              onClick={() => handleOpenLinuxTerminal(server, server.default_shell === 'zsh' ? 'zsh' : 'bash')}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 cursor-pointer"
                            >
                              Terminal
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenInBrowserRemote(server, 'rdp')}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-500 cursor-pointer shadow-sm"
                              title={isEn ? 'Launch In-Browser RDP' : 'اجرای ریموت در مرورگر'}
                            >
                              Web RDP
                            </button>
                          )}

                          <div className="relative" ref={isMenuOpen ? menuRef : undefined}>
                            <button
                              type="button"
                              onClick={() => setActiveMenuServerId(isMenuOpen ? null : server.id)}
                              className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {isMenuOpen && (
                              <div
                                className={`absolute ${
                                  isEn ? 'right-0' : 'left-0'
                                } mt-1 w-48 rounded-xl bg-slate-950 border border-slate-800 shadow-2xl p-1 z-30 text-xs space-y-0.5 text-start`}
                              >
                                {isLinux ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenInBrowserRemote(server, 'vnc')}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-amber-300 hover:bg-slate-900 cursor-pointer font-medium"
                                  >
                                    <Monitor className="w-3.5 h-3.5 text-amber-400" />
                                    <span>{isEn ? 'In-Browser VNC' : 'کنسول VNC مرورگر'}</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenWindowsRemote(server)}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-blue-300 hover:bg-slate-900 cursor-pointer"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>{isEn ? 'Native RDP Suite' : 'تنظیمات mstsc'}</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleTestPing(server.id)}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-slate-300 hover:bg-slate-900 cursor-pointer"
                                >
                                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                                  <span>{isEn ? 'Test Ping' : 'تست پینگ'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopyIp(server.ip)}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-slate-300 hover:bg-slate-900 cursor-pointer"
                                >
                                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{isEn ? 'Copy IP' : 'کپی آی‌پی'}</span>
                                </button>
                                <div className="my-1 border-t border-slate-800" />
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(server)}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-slate-300 hover:bg-slate-900 cursor-pointer"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                  <span>{isEn ? 'Edit' : 'ویرایش'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(server)}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-rose-400 hover:bg-rose-950/40 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>{isEn ? 'Delete' : 'حذف'}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty Search / Filter Results State */}
      {filteredServers.length === 0 && !loading && (
        <div className="text-center py-16 px-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 flex items-center justify-center mx-auto mb-3">
            <Server className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-300">
            {isEn ? 'No remote servers found' : 'هیچ سروری یافت نشد'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            {isEn
              ? 'Try modifying your search criteria, environment, or automation tag filter.'
              : 'فیلترها را تغییر دهید یا با کلیک بر روی افزودن سرور، سرور جدیدی ثبت کنید.'}
          </p>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isEn ? 'Add Server Now' : 'ثبت سرور جدید'}</span>
          </button>
        </div>
      )}

      {/* Add / Edit Server Modal */}
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

      {/* Linux Terminal Modal (Bash / Zshell) with Docking */}
      <LinuxTerminalModal
        isOpen={isTerminalModalOpen}
        server={terminalServer}
        initialShell={terminalShell}
        onClose={() => {
          setIsTerminalModalOpen(false);
          if (terminalServer) undockModal(`linux_term_${terminalServer.id}`);
        }}
        onMinimize={handleMinimizeLinuxTerminal}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* Windows Remote Connect Modal (RDP / PowerShell) with Docking */}
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

      {/* In-Browser Remote Desktop Modal (Guacamole Gateway RDP / VNC) */}
      <InBrowserRemoteDesktopModal
        isOpen={isInBrowserModalOpen}
        server={inBrowserRemoteServer}
        protocol={inBrowserProtocol}
        onClose={() => {
          setIsInBrowserModalOpen(false);
          if (inBrowserRemoteServer) undockModal(`inbrowser_remote_${inBrowserRemoteServer.id}`);
        }}
        onMinimize={handleMinimizeInBrowserRemote}
        isLightMode={isLightMode}
        isEn={isEn}
      />
    </div>
  );
};
