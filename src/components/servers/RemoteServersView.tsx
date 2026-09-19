import React, { useState, useEffect, useMemo } from 'react';
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
  Table as TableIcon,
  Play,
  Cpu,
  Globe,
  Sparkles,
  Zap,
  ArrowUpDown
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
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

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
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Modal states
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [serverToEdit, setServerToEdit] = useState<RemoteServer | null>(null);

  // Terminal & Remote Connect Modals
  const [terminalServer, setTerminalServer] = useState<RemoteServer | null>(null);
  const [terminalShell, setTerminalShell] = useState<'bash' | 'zsh'>('bash');
  const [isTerminalModalOpen, setIsTerminalModalOpen] = useState(false);

  const [windowsModalServer, setWindowsModalServer] = useState<RemoteServer | null>(null);
  const [isWindowsModalOpen, setIsWindowsModalOpen] = useState(false);

  // Quick Ping / Test status cache: serverId -> { reachable: boolean; latency: number }
  const [reachabilityCache, setReachabilityCache] = useState<Record<string, { reachable: boolean; latency: number; testing: boolean }>>({});
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

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

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = server.name.toLowerCase().includes(q);
        const matchesIp = server.ip.includes(q);
        const matchesHost = server.hostname?.toLowerCase().includes(q) || false;
        const matchesDistro = server.os_distro?.toLowerCase().includes(q) || false;
        const matchesTags = Array.isArray(server.tags) && server.tags.some((t) => t.toLowerCase().includes(q));
        const matchesCategory = server.category.toLowerCase().includes(q);
        return matchesName || matchesIp || matchesHost || matchesDistro || matchesTags || matchesCategory;
      }

      return true;
    });
  }, [servers, activeTabFilter, selectedEnv, selectedCategory, selectedTag, searchQuery]);

  // Summary Metrics
  const linuxCount = useMemo(() => servers.filter((s) => s.os_type === 'linux').length, [servers]);
  const windowsCount = useMemo(() => servers.filter((s) => s.os_type === 'windows').length, [servers]);
  const totalTagsCount = useMemo(() => tagsSummary.length, [tagsSummary]);

  // Handlers
  const handleOpenAdd = () => {
    setServerToEdit(null);
    setIsAddEditModalOpen(true);
  };

  const handleOpenEdit = (server: RemoteServer) => {
    setServerToEdit(server);
    setIsAddEditModalOpen(true);
  };

  const handleDelete = async (server: RemoteServer) => {
    const confirmMsg = isEn
      ? `Are you sure you want to remove ${server.name} (${server.ip}) from fleet?`
      : `آیا از حذف سرور ${server.name} (${server.ip}) اطمینان دارید؟`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteRemoteServer(server.id);
      await loadFleet();
    } catch (err: any) {
      alert(err.message || 'Failed to delete server');
    }
  };

  const handleSaveServer = async (serverData: Partial<RemoteServer>) => {
    if (serverToEdit) {
      await updateRemoteServer(serverToEdit.id, serverData);
    } else {
      await createRemoteServer(serverData);
    }
    await loadFleet();
  };

  const handleOpenLinuxTerminal = (server: RemoteServer, shell: 'bash' | 'zsh') => {
    setTerminalServer(server);
    setTerminalShell(shell);
    setIsTerminalModalOpen(true);
  };

  const handleOpenWindowsRemote = (server: RemoteServer) => {
    setWindowsModalServer(server);
    setIsWindowsModalOpen(true);
  };

  const handleTestPing = async (serverId: string) => {
    setReachabilityCache((prev) => ({
      ...prev,
      [serverId]: { reachable: false, latency: 0, testing: true },
    }));

    try {
      const res = await testRemoteServerConnection(serverId);
      setReachabilityCache((prev) => ({
        ...prev,
        [serverId]: { reachable: res.reachable, latency: res.latency_ms, testing: false },
      }));
    } catch {
      setReachabilityCache((prev) => ({
        ...prev,
        [serverId]: { reachable: false, latency: 0, testing: false },
      }));
    }
  };

  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 1500);
  };

  return (
    <div
      className={`min-h-full p-4 sm:p-6 lg:p-8 transition-colors ${
        isLightMode ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-slate-100'
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      {/* Top Header & Metrics Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800/40">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-emerald-400">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight">
                  {isEn ? 'Remote Servers & Automation Fleet' : 'مدیریت سرورهای ریموت و اتوماسیون'}
                </h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {servers.length} {isEn ? 'Hosts' : 'سرور'}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Linux Bash / Zsh interactive terminals, Windows RDP suites, and categorized automation tags'
                  : 'ترمینال تعاملی Bash و Zshell لینوکس، ریموت دسکتاپ ویندوز و تگ‌های آماده اتوماسیون'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={loadFleet}
            disabled={loading}
            title={isEn ? 'Refresh fleet' : 'تازه‌سازی سرورها'}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              isLightMode
                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <div className="flex items-center p-1 rounded-xl border border-slate-800 bg-slate-900/60">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white'
              }`}
              title={isEn ? 'Grid view' : 'نمایش کارتی'}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white'
              }`}
              title={isEn ? 'Table view' : 'نمایش جدولی'}
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isEn ? 'Add Remote Server' : 'افزودن سرور ریموت'}</span>
          </button>
        </div>
      </div>

      {/* Metrics Cards Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 my-6">
        {/* Linux Metric */}
        <div
          onClick={() => setActiveTabFilter(activeTabFilter === 'linux' ? 'all' : 'linux')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            activeTabFilter === 'linux'
              ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
              : isLightMode
              ? 'bg-white border-slate-200 hover:border-emerald-400'
              : 'bg-slate-900/40 border-slate-800 hover:border-emerald-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">{isEn ? 'Linux Servers' : 'سرورهای لینوکس'}</span>
            <Terminal className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-emerald-400">{linuxCount}</span>
            <span className="text-[11px] font-mono text-slate-400">Bash / Zsh SSH</span>
          </div>
        </div>

        {/* Windows Metric */}
        <div
          onClick={() => setActiveTabFilter(activeTabFilter === 'windows' ? 'all' : 'windows')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            activeTabFilter === 'windows'
              ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
              : isLightMode
              ? 'bg-white border-slate-200 hover:border-blue-400'
              : 'bg-slate-900/40 border-slate-800 hover:border-blue-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">{isEn ? 'Windows Servers' : 'سرورهای ویندوز'}</span>
            <Monitor className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-blue-400">{windowsCount}</span>
            <span className="text-[11px] font-mono text-slate-400">RDP / PowerShell</span>
          </div>
        </div>

        {/* Automation Tags Metric */}
        <div
          onClick={() => setActiveTabFilter(activeTabFilter === 'tags' ? 'all' : 'tags')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            activeTabFilter === 'tags'
              ? 'border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/30'
              : isLightMode
              ? 'bg-white border-slate-200 hover:border-purple-400'
              : 'bg-slate-900/40 border-slate-800 hover:border-purple-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">{isEn ? 'Automation Tags' : 'تگ‌های اتوماسیون'}</span>
            <Tags className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-purple-400">{totalTagsCount}</span>
            <span className="text-[11px] font-mono text-slate-400">{isEn ? 'Distinct Labels' : 'برچسب مستقل'}</span>
          </div>
        </div>

        {/* Total Fleet Metric */}
        <div
          onClick={() => setActiveTabFilter('all')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            activeTabFilter === 'all' && !selectedTag
              ? 'border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500/30'
              : isLightMode
              ? 'bg-white border-slate-200 hover:border-cyan-400'
              : 'bg-slate-900/40 border-slate-800 hover:border-cyan-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">{isEn ? 'Total Fleet' : 'کل ناوگان سرورها'}</span>
            <Server className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-cyan-400">{servers.length}</span>
            <span className="text-[11px] font-mono text-slate-400">100% Persisted</span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs & Filters */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 mb-5">
        {/* Tab Switcher */}
        <div className="flex items-center p-1 rounded-xl border border-slate-800 bg-slate-900/70 overflow-x-auto no-scrollbar shrink-0">
          <button
            type="button"
            onClick={() => setActiveTabFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTabFilter === 'all'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isEn ? 'All Fleet' : 'همه سرورها'}</span>
            <span className="text-[10px] opacity-70">({servers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTabFilter('linux')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTabFilter === 'linux'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-emerald-300'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>{isEn ? 'Linux (Bash / Zsh)' : 'لینوکس (Bash / Zsh)'}</span>
            <span className="text-[10px] opacity-80">({linuxCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTabFilter('windows')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTabFilter === 'windows'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-blue-300'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>{isEn ? 'Windows (RDP / PS)' : 'ویندوز (RDP / PS)'}</span>
            <span className="text-[10px] opacity-80">({windowsCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTabFilter('tags')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTabFilter === 'tags'
                ? 'bg-purple-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-purple-300'
            }`}
          >
            <Tags className="w-3.5 h-3.5" />
            <span>{isEn ? 'Automation Tags' : 'تگ‌های اتوماسیون'}</span>
            <span className="text-[10px] opacity-80">({totalTagsCount})</span>
          </button>
        </div>

        {/* Search & Secondary Filter Dropdowns */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Search Bar */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isEn ? 'Search name, IP, tag, distro...' : 'جستجو نام، آی‌پی، تگ، توزیع...'}
              className={`w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs outline-none transition-all ${
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
            className={`px-3 py-1.5 rounded-xl border text-xs outline-none cursor-pointer ${
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
            className={`px-3 py-1.5 rounded-xl border text-xs outline-none cursor-pointer ${
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
        </div>
      </div>

      {/* Active Tag Filter Chip Banner */}
      {selectedTag && (
        <div className="flex items-center gap-2 mb-4 p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs">
          <Tags className="w-4 h-4 shrink-0 text-purple-400" />
          <span>
            {isEn ? 'Filtered by Automation Tag:' : 'فیلتر شده بر اساس تگ اتوماسیون:'} <strong>#{selectedTag}</strong>
          </span>
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className="ms-auto text-xs px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 cursor-pointer"
          >
            {isEn ? 'Clear Tag Filter' : 'پاک کردن فیلتر تگ'}
          </button>
        </div>
      )}

      {/* Automation Tags Cloud Matrix (Always accessible or prominent in tags tab) */}
      {(activeTabFilter === 'tags' || !selectedTag) && tagsSummary.length > 0 && (
        <div
          className={`p-4 rounded-2xl border mb-6 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Tags className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {isEn ? 'Automation Tag Cloud (Click to target fleet)' : 'ابر تگ‌های اتوماسیون (کلیک برای فیلتر و اتوماسیون)'}
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">
              {isEn ? 'Ready for Ansible, CI/CD, and batch tasks' : 'آماده برای اتوماسیون، پلی‌بوک انسیبل و کارهای دسته‌ای'}
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

      {/* Main Server Cards Grid View */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredServers.map((server) => {
            const isLinux = server.os_type === 'linux';
            const reach = reachabilityCache[server.id];

            return (
              <div
                key={server.id}
                className={`group flex flex-col justify-between p-5 rounded-2xl border transition-all duration-200 hover:shadow-xl ${
                  isLightMode
                    ? 'bg-white border-slate-200 hover:border-cyan-400 shadow-sm'
                    : 'bg-slate-900/60 border-slate-800/90 hover:border-cyan-500/40 hover:bg-slate-900/90 shadow-lg'
                }`}
              >
                <div>
                  {/* Card Header: OS Icon, Name, Status, Actions Menu */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2.5 rounded-xl border ${
                          isLinux
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        }`}
                      >
                        {isLinux ? <Terminal className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold tracking-tight text-white group-hover:text-cyan-300 transition-colors">
                            {server.name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                          <span>{server.os_distro || (isLinux ? 'Linux' : 'Windows Server')}</span>
                          <span>•</span>
                          <span className="font-mono">{server.category}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
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
                    </div>
                  </div>

                  {/* IP Address & Reachability Badge */}
                  <div className="flex items-center justify-between mt-4 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">{server.ip}</span>
                      {server.hostname && (
                        <span className="text-[11px] text-slate-500 hidden sm:inline">({server.hostname})</span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopyIp(server.ip)}
                        className="p-1 rounded text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
                        title={isEn ? 'Copy IP' : 'کپی آی‌پی'}
                      >
                        {copiedIp === server.ip ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {reach ? (
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                            reach.reachable
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {reach.reachable ? `${reach.latency}ms` : 'Down'}
                        </span>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => handleTestPing(server.id)}
                        disabled={reach?.testing}
                        className="p-1 rounded text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
                        title={isEn ? 'Test Port Ping' : 'تست پینگ پورت'}
                      >
                        <Zap className={`w-3.5 h-3.5 ${reach?.testing ? 'animate-bounce text-cyan-400' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Automation Tags List */}
                  <div className="mt-3.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                      <Tags className="w-3 h-3 text-purple-400" />
                      <span>{isEn ? 'Automation Tags:' : 'تگ‌های اتوماسیون:'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 min-h-[26px]">
                      {Array.isArray(server.tags) && server.tags.length > 0 ? (
                        server.tags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setSelectedTag(tag)}
                            className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 transition-colors cursor-pointer"
                          >
                            #{tag}
                          </button>
                        ))
                      ) : (
                        <span className="text-[11px] text-slate-600 italic">
                          {isEn ? 'No tags' : 'بدون تگ'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isLinux ? (
                      <>
                        {/* Bash Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenLinuxTerminal(server, 'bash')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                          title={isEn ? 'Launch Bash Shell Terminal' : 'اتصال به شل Bash لینوکس'}
                        >
                          <Terminal className="w-3.5 h-3.5" />
                          <span>Bash</span>
                        </button>

                        {/* Zsh Button (Explicit user requirement) */}
                        <button
                          type="button"
                          onClick={() => handleOpenLinuxTerminal(server, 'zsh')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/30 transition-all cursor-pointer"
                          title={isEn ? 'Launch Zshell (zsh) Terminal' : 'اتصال به شل Zshell لینوکس'}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Zshell</span>
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Windows RDP Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenWindowsRemote(server)}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                          title={isEn ? 'Open Windows Remote Suite' : 'اتصال به ریموت ویندوز'}
                        >
                          <Monitor className="w-3.5 h-3.5" />
                          <span>{isEn ? 'RDP / Connect' : 'اتصال RDP'}</span>
                        </button>
                      </>
                    )}
                  </div>

                  {/* Edit / Delete Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(server)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                      title={isEn ? 'Edit server' : 'ویرایش سرور'}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(server)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                      title={isEn ? 'Delete server' : 'حذف سرور'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Enterprise Dense Table View */
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
                  <th className="p-3.5">{isEn ? 'Automation Tags' : 'تگ‌های اتوماسیون'}</th>
                  <th className="p-3.5 text-right">{isEn ? 'Actions' : 'عملیات'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredServers.map((server) => {
                  const isLinux = server.os_type === 'linux';
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
                        <div className="flex items-center justify-end gap-1.5">
                          {isLinux ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenLinuxTerminal(server, 'bash')}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 cursor-pointer"
                              >
                                Bash
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenLinuxTerminal(server, 'zsh')}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-cyan-950 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-900 cursor-pointer"
                              >
                                Zsh
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenWindowsRemote(server)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-500 cursor-pointer"
                            >
                              RDP
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(server)}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(server)}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* Empty State */}
      {filteredServers.length === 0 && !loading && (
        <div
          className={`p-12 text-center rounded-2xl border ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/30 border-slate-800'
          }`}
        >
          <Server className="w-12 h-12 mx-auto text-slate-600 mb-3" />
          <h3 className="text-base font-bold text-slate-300">
            {isEn ? 'No remote servers found' : 'هیچ سروری مطابق فیلتر یافت نشد'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {isEn
              ? 'Try changing your search terms or filter selection, or register a new server to the fleet.'
              : 'فیلترها را تغییر دهید یا با کلیک بر روی افزودن سرور، اولین سرور لینوکس یا ویندوز را ثبت کنید.'}
          </p>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 shadow-md cursor-pointer"
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
        onClose={() => setIsAddEditModalOpen(false)}
        onMinimize={() => setIsAddEditModalOpen(false)}
        onSave={handleSaveServer}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* Linux Terminal Modal (Bash / Zshell) */}
      <LinuxTerminalModal
        isOpen={isTerminalModalOpen}
        server={terminalServer}
        initialShell={terminalShell}
        onClose={() => setIsTerminalModalOpen(false)}
        onMinimize={() => setIsTerminalModalOpen(false)}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* Windows Remote Connect Modal (RDP / PowerShell) */}
      <WindowsRemoteConnectModal
        isOpen={isWindowsModalOpen}
        server={windowsModalServer}
        onClose={() => setIsWindowsModalOpen(false)}
        onMinimize={() => setIsWindowsModalOpen(false)}
        isLightMode={isLightMode}
        isEn={isEn}
      />
    </div>
  );
};
