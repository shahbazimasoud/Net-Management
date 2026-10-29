import React, { useState, useMemo } from 'react';
import {
  Server,
  User,
  Clock,
  Search,
  Filter,
  Terminal,
  Monitor,
  Eye,
  SlidersHorizontal,
  Layers,
  Code2,
  Copy,
  Check,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Shield,
  X,
  ExternalLink,
  ChevronRight,
  Maximize2,
  Minimize2,
  Minus,
  Info,
  Calendar,
  Cpu,
  HardDrive,
  FileText,
  Activity,
  Play,
  RotateCw,
  FolderTree,
  Flame,
  Globe,
  Database,
  RefreshCw,
  Download,
  Mail,
} from 'lucide-react';
import { ServerCommandAuditLogEntry, CommandRiskLevel, ServerCommandChannel, ServerActionModule } from '../../types';

interface ServerCommandLogsSectionProps {
  isLightMode?: boolean;
  isEn?: boolean;
  isRtl?: boolean;
  serverLogs: ServerCommandAuditLogEntry[];
  selectedTimeframe: 'all' | '1h' | '24h' | '7d' | '30d';
  isWithinTimeframe: (iso: string) => boolean;
  formatDateTime: (iso: string) => string;
  formatDateOnly: (iso: string) => string;
  onRefresh: () => void;
  isRefreshing: boolean;
  onExportCsv: () => void;
  onClearLogs: () => void;
  onOpenEmailReport?: () => void;
}

type ServerGroupMode = 'server' | 'user' | 'timeline';

export const ServerCommandLogsSection: React.FC<ServerCommandLogsSectionProps> = ({
  isLightMode = false,
  isEn = false,
  isRtl = false,
  serverLogs,
  selectedTimeframe,
  isWithinTimeframe,
  formatDateTime,
  formatDateOnly,
  onRefresh,
  isRefreshing,
  onExportCsv,
  onClearLogs,
  onOpenEmailReport,
}) => {
  const [groupMode, setGroupMode] = useState<ServerGroupMode>('server');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedRisk, setSelectedRisk] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedOs, setSelectedOs] = useState<string>('all');

  // Selected item in dual-view
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [selectedUsername, setSelectedUsername] = useState<string>('');

  // Modals
  const [inspectedLog, setInspectedLog] = useState<ServerCommandAuditLogEntry | null>(null);
  const [isModalMaximized, setIsModalMaximized] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter server logs
  const filteredLogs = useMemo(() => {
    return serverLogs.filter((log) => {
      if (!isWithinTimeframe(log.timestamp)) return false;
      if (selectedChannel !== 'all' && log.channel !== selectedChannel) return false;
      if (selectedModule !== 'all' && log.actionModule !== selectedModule) return false;
      if (selectedRisk !== 'all' && log.riskLevel !== selectedRisk) return false;
      if (selectedStatus !== 'all' && log.status !== selectedStatus) return false;
      if (selectedOs !== 'all' && log.osType !== selectedOs) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (log.serverName && log.serverName.toLowerCase().includes(q)) ||
        (log.serverIp && log.serverIp.includes(q)) ||
        (log.command && log.command.toLowerCase().includes(q)) ||
        (log.actionName && log.actionName.toLowerCase().includes(q)) ||
        (log.actionNameEn && log.actionNameEn.toLowerCase().includes(q)) ||
        (log.outputSummary && log.outputSummary.toLowerCase().includes(q)) ||
        (log.outputSummaryEn && log.outputSummaryEn.toLowerCase().includes(q)) ||
        (log.actor?.username && log.actor.username.toLowerCase().includes(q)) ||
        (log.actor?.role && log.actor.role.toLowerCase().includes(q)) ||
        (log.actor?.ipAddress && log.actor.ipAddress.includes(q)) ||
        (log.channel && log.channel.toLowerCase().includes(q)) ||
        (log.actionModule && log.actionModule.toLowerCase().includes(q)) ||
        (log.osDistro && log.osDistro.toLowerCase().includes(q))
      );
    });
  }, [serverLogs, searchQuery, selectedChannel, selectedModule, selectedRisk, selectedStatus, selectedOs, selectedTimeframe]);

  // Group by Server
  const serverGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        serverId: string;
        serverName: string;
        serverIp: string;
        osType: 'linux' | 'windows';
        osDistro?: string;
        serverEnvironment?: string;
        totalActions: number;
        lastActive: string;
        hasCritical: boolean;
        hasFailed: boolean;
        operatorMap: Map<
          string,
          {
            username: string;
            role: string;
            ipAddress?: string;
            actions: ServerCommandAuditLogEntry[];
          }
        >;
        actions: ServerCommandAuditLogEntry[];
      }
    >();

    filteredLogs.forEach((log) => {
      const serverKey = log.serverName || log.serverId || log.serverIp || 'unknown';
      if (!map.has(serverKey)) {
        map.set(serverKey, {
          serverId: log.serverId,
          serverName: log.serverName || serverKey,
          serverIp: log.serverIp,
          osType: log.osType || 'linux',
          osDistro: log.osDistro,
          serverEnvironment: log.serverEnvironment || 'production',
          totalActions: 0,
          lastActive: log.timestamp,
          hasCritical: false,
          hasFailed: false,
          operatorMap: new Map(),
          actions: [],
        });
      }

      const sEntry = map.get(serverKey)!;
      sEntry.totalActions += 1;
      sEntry.actions.push(log);
      if (new Date(log.timestamp) > new Date(sEntry.lastActive)) {
        sEntry.lastActive = log.timestamp;
      }
      if (log.riskLevel === 'critical' || log.riskLevel === 'high') sEntry.hasCritical = true;
      if (log.status === 'FAILED' || log.status === 'ACCESS_DENIED' || log.status === 'TIMEOUT') {
        sEntry.hasFailed = true;
      }

      const userKey = log.actor?.username || 'unknown';
      if (!sEntry.operatorMap.has(userKey)) {
        sEntry.operatorMap.set(userKey, {
          username: userKey,
          role: log.actor?.role || 'Operator',
          ipAddress: log.actor?.ipAddress,
          actions: [],
        });
      }
      sEntry.operatorMap.get(userKey)!.actions.push(log);
    });

    return Array.from(map.values())
      .map((s) => ({
        ...s,
        operators: Array.from(s.operatorMap.values())
          .map((op) => ({
            ...op,
            actionsCount: op.actions.length,
            lastActive: op.actions[0]?.timestamp || '',
          }))
          .sort((a, b) => b.actionsCount - a.actionsCount),
        actions: s.actions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      }))
      .sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());
  }, [filteredLogs]);

  // Group by User
  const userGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        username: string;
        role: string;
        ipAddress?: string;
        totalActions: number;
        lastActive: string;
        hasCritical: boolean;
        hasFailed: boolean;
        serverMap: Map<
          string,
          {
            serverId: string;
            serverName: string;
            serverIp: string;
            osType: 'linux' | 'windows';
            osDistro?: string;
            actions: ServerCommandAuditLogEntry[];
          }
        >;
        actions: ServerCommandAuditLogEntry[];
      }
    >();

    filteredLogs.forEach((log) => {
      const userKey = log.actor?.username || 'unknown';
      if (!map.has(userKey)) {
        map.set(userKey, {
          username: userKey,
          role: log.actor?.role || 'Operator',
          ipAddress: log.actor?.ipAddress,
          totalActions: 0,
          lastActive: log.timestamp,
          hasCritical: false,
          hasFailed: false,
          serverMap: new Map(),
          actions: [],
        });
      }

      const uEntry = map.get(userKey)!;
      uEntry.totalActions += 1;
      uEntry.actions.push(log);
      if (new Date(log.timestamp) > new Date(uEntry.lastActive)) {
        uEntry.lastActive = log.timestamp;
      }
      if (log.riskLevel === 'critical' || log.riskLevel === 'high') uEntry.hasCritical = true;
      if (log.status === 'FAILED' || log.status === 'ACCESS_DENIED' || log.status === 'TIMEOUT') {
        uEntry.hasFailed = true;
      }

      const serverKey = log.serverName || log.serverId || log.serverIp || 'unknown';
      if (!uEntry.serverMap.has(serverKey)) {
        uEntry.serverMap.set(serverKey, {
          serverId: log.serverId,
          serverName: log.serverName || serverKey,
          serverIp: log.serverIp,
          osType: log.osType || 'linux',
          osDistro: log.osDistro,
          actions: [],
        });
      }
      uEntry.serverMap.get(serverKey)!.actions.push(log);
    });

    return Array.from(map.values())
      .map((u) => ({
        ...u,
        servers: Array.from(u.serverMap.values())
          .map((s) => ({
            ...s,
            actionsCount: s.actions.length,
            lastActive: s.actions[0]?.timestamp || '',
          }))
          .sort((a, b) => b.actionsCount - a.actionsCount),
        actions: u.actions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      }))
      .sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());
  }, [filteredLogs]);

  // Set default selection
  React.useEffect(() => {
    if (serverGroups.length > 0 && (!selectedServerId || !serverGroups.some((s) => s.serverName === selectedServerId))) {
      setSelectedServerId(serverGroups[0].serverName);
    }
  }, [serverGroups, selectedServerId]);

  React.useEffect(() => {
    if (userGroups.length > 0 && (!selectedUsername || !userGroups.some((u) => u.username === selectedUsername))) {
      setSelectedUsername(userGroups[0].username);
    }
  }, [userGroups, selectedUsername]);

  const activeServerGroup = useMemo(() => {
    if (!selectedServerId) return serverGroups[0] || null;
    return serverGroups.find((s) => s.serverName === selectedServerId) || serverGroups[0] || null;
  }, [serverGroups, selectedServerId]);

  const activeUserGroup = useMemo(() => {
    if (!selectedUsername) return userGroups[0] || null;
    return userGroups.find((u) => u.username === selectedUsername) || userGroups[0] || null;
  }, [userGroups, selectedUsername]);

  // Helpers for Channel badges
  const getChannelBadge = (channel: ServerCommandChannel) => {
    switch (channel) {
      case 'SSH_SHELL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <Terminal className="w-3 h-3" />
            SSH Shell
          </span>
        );
      case 'REMOTE_DESKTOP_RDP':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
            <Monitor className="w-3 h-3" />
            RDP Desktop
          </span>
        );
      case 'REMOTE_DESKTOP_VNC':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Eye className="w-3 h-3" />
            VNC Graphic
          </span>
        );
      case '3DOTS_ACTION':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
            <SlidersHorizontal className="w-3 h-3" />
            3-Dots Action
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <Code2 className="w-3 h-3" />
            API Dispatch
          </span>
        );
    }
  };

  // Helpers for Module badges
  const getModuleBadge = (mod: ServerActionModule) => {
    switch (mod) {
      case 'FILE_EXPLORER':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-500/20 text-slate-300 border border-slate-500/20">
            <FolderTree className="w-2.5 h-2.5 text-amber-400" />
            {isEn ? 'File Explorer' : 'فایل اکسپلورر'}
          </span>
        );
      case 'CRON_MANAGER':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-500/20 text-slate-300 border border-slate-500/20">
            <Clock className="w-2.5 h-2.5 text-cyan-400" />
            {isEn ? 'Cron Manager' : 'کران‌جاب'}
          </span>
        );
      case 'FIREWALL_UFW':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-500/20 text-slate-300 border border-slate-500/20">
            <Flame className="w-2.5 h-2.5 text-rose-400" />
            {isEn ? 'Firewall UFW' : 'فایروال'}
          </span>
        );
      case 'STORAGE_LVM':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-500/20 text-slate-300 border border-slate-500/20">
            <HardDrive className="w-2.5 h-2.5 text-purple-400" />
            {isEn ? 'Storage & LVM' : 'دیسک و LVM'}
          </span>
        );
      case 'NGINX_MANAGEMENT':
      case 'APACHE_MANAGEMENT':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-500/20 text-slate-300 border border-slate-500/20">
            <Globe className="w-2.5 h-2.5 text-emerald-400" />
            {mod === 'NGINX_MANAGEMENT' ? 'Nginx Web' : 'Apache Web'}
          </span>
        );
      case 'POSTGRESQL':
      case 'POSTGRESQL_MANAGEMENT':
      case 'MYSQL':
      case 'MYSQL_MANAGEMENT':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-500/20 text-slate-300 border border-slate-500/20">
            <Database className="w-2.5 h-2.5 text-blue-400" />
            {mod.startsWith('POSTGRE') ? 'PostgreSQL' : 'MySQL'}
          </span>
        );
      case 'SYSTEM_SERVICES':
      case 'SYSTEM_RESTART':
      case 'SYSTEM_SHUTDOWN':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-500/20 text-slate-300 border border-slate-500/20">
            <RotateCw className="w-2.5 h-2.5 text-amber-400" />
            {isEn ? 'System Service' : 'سیستم و سرویس'}
          </span>
        );
      case 'TERMINAL_SESSION':
      case 'SSH_SESSION':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-500/20 text-slate-300 border border-slate-500/20">
            <Terminal className="w-2.5 h-2.5 text-emerald-400" />
            {isEn ? 'SSH Session' : 'نشست SSH'}
          </span>
        );
      case 'REMOTE_DESKTOP_SESSION':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-500/20 text-slate-300 border border-slate-500/20">
            <Monitor className="w-2.5 h-2.5 text-indigo-400" />
            {isEn ? 'Graphic Session' : 'نشست گرافیکی'}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-500/20 text-slate-300 border border-slate-500/20">
            <Layers className="w-2.5 h-2.5 text-slate-400" />
            {isEn ? 'Fleet Action' : 'عملیات سرور'}
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            {isEn ? 'SUCCESS' : 'موفق'}
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3 h-3" />
            {isEn ? 'FAILED' : 'خطا / شکست'}
          </span>
        );
      case 'TIMEOUT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" />
            {isEn ? 'TIMEOUT' : 'تایم‌اوت'}
          </span>
        );
      case 'ACCESS_DENIED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <Shield className="w-3 h-3" />
            {isEn ? 'ACCESS DENIED' : 'عدم دسترسی'}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-500/15 text-slate-300 border border-slate-500/30">
            {status}
          </span>
        );
    }
  };

  const getRiskBadge = (risk: CommandRiskLevel) => {
    switch (risk) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3 h-3" />
            {isEn ? 'CRITICAL' : 'بحرانی'}
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30">
            <AlertTriangle className="w-3 h-3" />
            {isEn ? 'HIGH RISK' : 'ریسک بالا'}
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
            {isEn ? 'CONFIG/SYS' : 'تغییر سیستم'}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            {isEn ? 'LOW RISK' : 'پایش / عادی'}
          </span>
        );
    }
  };

  const hasActiveFilters =
    searchQuery ||
    selectedChannel !== 'all' ||
    selectedModule !== 'all' ||
    selectedRisk !== 'all' ||
    selectedStatus !== 'all' ||
    selectedOs !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedChannel('all');
    setSelectedModule('all');
    setSelectedRisk('all');
    setSelectedStatus('all');
    setSelectedOs('all');
  };

  return (
    <div className="space-y-4 max-w-full overflow-hidden">
      {/* Sub-toolbar: Grouping Mode Switcher & Filter Toolbar */}
      <div className="flex flex-col xl:flex-row gap-3 items-stretch xl:items-center justify-between p-3 sm:p-3.5 rounded-2xl audit-glass-panel border border-white/10 w-full max-w-full overflow-hidden">
        {/* Dual-Perspective Grouping mode buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-black/25 rounded-xl border border-white/5 overflow-x-auto custom-scrollbar shrink-0 max-w-full">
          <button
            onClick={() => setGroupMode('server')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              groupMode === 'server'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>{isEn ? 'Group by Server' : 'دیدگاه سرور‌محور'}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/30 text-white font-mono">
              {serverGroups.length}
            </span>
          </button>

          <button
            onClick={() => setGroupMode('user')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              groupMode === 'user'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>{isEn ? 'Group by User' : 'دیدگاه کاربر‌محور'}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/30 text-white font-mono">
              {userGroups.length}
            </span>
          </button>

          <button
            onClick={() => setGroupMode('timeline')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              groupMode === 'timeline'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{isEn ? 'All Server Activity Timeline' : 'لیست جامع زمانی'}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/30 text-white font-mono">
              {filteredLogs.length}
            </span>
          </button>
        </div>

        {/* Search and Main Filters */}
        <div className="flex items-center gap-2 flex-wrap flex-1 w-full max-w-full xl:justify-end">
          <div className="relative flex-1 min-w-[160px] sm:min-w-[200px] max-w-full">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 text-slate-400 ltr:left-3 rtl:right-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                groupMode === 'server'
                  ? (isEn ? 'Search servers, IP, actions, user, SSH command...' : 'جستجوی نام سرور، IP، کاربر، اکشن، دستور SSH...')
                  : groupMode === 'user'
                  ? (isEn ? 'Search operator username, role, server, action...' : 'جستجوی نام کاربر، سرور، آی‌پی، اکشن یا دستور...')
                  : (isEn ? 'Search command, action name, server, operator...' : 'جستجو در کل تاریخچه دستورات و فعالیت‌های سرور...')
              }
              className="w-full text-xs py-2 rounded-xl bg-black/20 hover:bg-black/30 focus:bg-black/30 border border-white/10 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ltr:pl-9 ltr:pr-8 rtl:pr-9 rtl:pl-8"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute top-1/2 -translate-y-1/2 text-slate-400 hover:text-white ltr:right-2.5 rtl:left-2.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Channel Filter */}
          <select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
            className="text-xs py-2 px-2.5 rounded-xl bg-black/20 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shrink-0 max-w-full"
          >
            <option value="all" className="bg-slate-900 text-white">{isEn ? 'All Channels' : 'همه کانال‌ها'}</option>
            <option value="SSH_SHELL" className="bg-slate-900 text-white">SSH Shell</option>
            <option value="REMOTE_DESKTOP_RDP" className="bg-slate-900 text-white">Remote RDP</option>
            <option value="REMOTE_DESKTOP_VNC" className="bg-slate-900 text-white">Remote VNC</option>
            <option value="3DOTS_ACTION" className="bg-slate-900 text-white">3-Dots Menu</option>
            <option value="API_DISPATCH" className="bg-slate-900 text-white">API Dispatch</option>
          </select>

          {/* OS Filter */}
          <select
            value={selectedOs}
            onChange={(e) => setSelectedOs(e.target.value)}
            className="text-xs py-2 px-2.5 rounded-xl bg-black/20 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shrink-0 max-w-full"
          >
            <option value="all" className="bg-slate-900 text-white">{isEn ? 'All OS' : 'همه سیستم‌عامل‌ها'}</option>
            <option value="linux" className="bg-slate-900 text-white">Linux</option>
            <option value="windows" className="bg-slate-900 text-white">Windows</option>
          </select>

          {/* Risk Filter */}
          <select
            value={selectedRisk}
            onChange={(e) => setSelectedRisk(e.target.value)}
            className="text-xs py-2 px-2.5 rounded-xl bg-black/20 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shrink-0 max-w-full"
          >
            <option value="all" className="bg-slate-900 text-white">{isEn ? 'All Risks' : 'همه سطوح ریسک'}</option>
            <option value="critical" className="bg-slate-900 text-white">{isEn ? 'Critical' : 'بحرانی'}</option>
            <option value="high" className="bg-slate-900 text-white">{isEn ? 'High Risk' : 'ریسک بالا'}</option>
            <option value="medium" className="bg-slate-900 text-white">{isEn ? 'Medium' : 'متوسط'}</option>
            <option value="low" className="bg-slate-900 text-white">{isEn ? 'Low Risk' : 'پایین'}</option>
          </select>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              title={isEn ? 'Clear filters' : 'پاکسازی فیلترها'}
              className="p-2 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30 transition cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {onOpenEmailReport && (
            <button
              onClick={onOpenEmailReport}
              className="px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600/30 via-indigo-500/25 to-cyan-500/25 hover:from-indigo-600/50 hover:to-cyan-500/50 active:scale-95 text-indigo-200 hover:text-white border border-indigo-400/40 text-xs font-semibold flex items-center gap-1.5 transition shadow-sm cursor-pointer shrink-0"
              title={isEn ? 'Create server fleet audit email report schedule' : 'ایجاد گزارش زمان‌بندی ایمیلی ممیزی سرورها'}
            >
              <Mail className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">{isEn ? 'Email Report' : 'گزارش ایمیلی'}</span>
            </button>
          )}
        </div>
      </div>

      {/* DUAL PERSPECTIVE CONTENT */}
      {filteredLogs.length === 0 ? (
        <div className="p-12 text-center rounded-2xl audit-glass-panel border border-white/10 space-y-3">
          <Server className="w-12 h-12 text-slate-500 mx-auto" />
          <h3 className="text-base font-bold text-white">
            {isEn ? 'No Server Command Logs Found' : 'هیچ رخداد یا دستور ممیزی سروری یافت نشد'}
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {isEn
              ? 'No SSH commands, Remote Desktop sessions, or 3-dots fleet actions match your active filters or timeframe.'
              : 'هیچ دستور SSH، نشست ریموت دسکتاپ گرافیکی، یا اقدام منوی سه‌نقطه‌ای با فیلترهای فعال یا بازه انتخابی شما مطابقت ندارد.'}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer"
            >
              {isEn ? 'Reset All Filters' : 'تنظیم مجدد فیلترها'}
            </button>
          )}
        </div>
      ) : groupMode === 'server' ? (
        /* ================= PERSPECTIVE 1: GROUP BY SERVER ================= */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left/Right Sidebar: Server Fleet List */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-2 max-h-[780px] overflow-y-auto custom-scrollbar p-1">
            {serverGroups.map((s) => {
              const isSelected = activeServerGroup?.serverName === s.serverName;
              return (
                <div
                  key={s.serverName}
                  onClick={() => setSelectedServerId(s.serverName)}
                  className={`p-3.5 rounded-2xl transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500 shadow-lg shadow-indigo-500/10'
                      : 'audit-glass-panel border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`p-2 rounded-xl shrink-0 ${
                          s.osType === 'windows'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        <Server className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">{s.serverName}</h4>
                        <span className="font-mono text-[11px] text-slate-400 block">{s.serverIp}</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-black/40 text-slate-300 border border-white/10">
                      {s.totalActions}
                    </span>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 truncate max-w-[120px]">
                      {s.osDistro || s.osType.toUpperCase()}
                    </span>
                    <span className="font-mono text-slate-400 text-[10px]">
                      {formatDateTime(s.lastActive)}
                    </span>
                  </div>

                  {/* Badges for critical or failures */}
                  {(s.hasCritical || s.hasFailed) && (
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      {s.hasCritical && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          {isEn ? 'HIGH RISK' : 'عملیات حساس'}
                        </span>
                      )}
                      {s.hasFailed && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          {isEn ? 'FAILURES' : 'خطا / شکست'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Main Panel: Active Server Details & Action Feed */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-4">
            {activeServerGroup && (
              <>
                {/* Server Hero Banner */}
                <div className="p-4 rounded-2xl audit-glass-panel border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-3 rounded-2xl ${
                        activeServerGroup.osType === 'windows'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      <Server className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-white">{activeServerGroup.serverName}</h3>
                        <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-white/10 text-slate-300">
                          {activeServerGroup.serverEnvironment}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                          {activeServerGroup.osDistro || activeServerGroup.osType}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                        <span className="font-mono">{activeServerGroup.serverIp}</span>
                        <span>•</span>
                        <span>{isEn ? `${activeServerGroup.operators.length} Operators Active` : `${activeServerGroup.operators.length} کاربر فعال`}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(activeServerGroup.serverIp, 'active-srv-ip')}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {copiedId === 'active-srv-ip' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === 'active-srv-ip' ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy IP' : 'کپی IP')}</span>
                    </button>
                  </div>
                </div>

                {/* Operators who accessed this server */}
                <div className="p-3.5 rounded-2xl audit-glass-panel border border-white/10 space-y-2">
                  <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{isEn ? 'Operators Operating on this Server:' : 'کاربران وارد شده به این سرور:'}</span>
                  </h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    {activeServerGroup.operators.map((op) => (
                      <div
                        key={op.username}
                        onClick={() => {
                          setGroupMode('user');
                          setSelectedUsername(op.username);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-black/25 hover:bg-black/40 border border-white/10 flex items-center gap-2 text-xs transition cursor-pointer"
                      >
                        <User className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="font-bold text-white">{op.username}</span>
                        <span className="text-[10px] text-slate-400">({op.role})</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 font-mono">
                          {op.actionsCount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Chronological Action Feed on this server */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{isEn ? 'Activity & Commands Stream' : 'جریان دستورات و وقایع این سرور'}</span>
                    </h4>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {activeServerGroup.actions.length} {isEn ? 'Records' : 'سند ثبت‌شده'}
                    </span>
                  </div>

                  {activeServerGroup.actions.map((log) => (
                    <div
                      key={log.id}
                      onClick={() => setInspectedLog(log)}
                      className="p-3.5 rounded-2xl audit-glass-panel border border-white/10 hover:border-indigo-500/40 hover:bg-white/[0.04] transition cursor-pointer space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getChannelBadge(log.channel)}
                          {getModuleBadge(log.actionModule)}
                          <span className="text-xs font-bold text-white">
                            {isEn ? log.actionNameEn || log.actionName : log.actionName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {getRiskBadge(log.riskLevel)}
                          {getStatusBadge(log.status)}
                        </div>
                      </div>

                      {/* Command box if applicable */}
                      {log.command && (
                        <div className="p-2 rounded-xl bg-black/40 border border-white/5 font-mono text-[11px] text-emerald-400 flex items-center justify-between gap-2 overflow-x-auto">
                          <span className="truncate">{log.command}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(log.command || '', `cmd-${log.id}`);
                            }}
                            className="text-slate-400 hover:text-white shrink-0"
                          >
                            {copiedId === `cmd-${log.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}

                      {/* Footer metadata */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-white/5 flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1 text-slate-300 font-medium">
                            <User className="w-3 h-3 text-indigo-400" />
                            {log.actor?.username} ({log.actor?.role})
                          </span>
                          {log.actor?.ipAddress && (
                            <span className="font-mono text-slate-400">IP: {log.actor.ipAddress}</span>
                          )}
                          {log.durationMs && log.durationMs > 0 ? (
                            <span className="font-mono text-cyan-400">
                              {Math.round(log.durationMs / 1000)}s
                            </span>
                          ) : null}
                        </div>
                        <span className="font-mono text-slate-400 text-[10px]">
                          {formatDateTime(log.timestamp)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : groupMode === 'user' ? (
        /* ================= PERSPECTIVE 2: GROUP BY USER ================= */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left/Right Sidebar: Operators List */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-2 max-h-[780px] overflow-y-auto custom-scrollbar p-1">
            {userGroups.map((u) => {
              const isSelected = activeUserGroup?.username === u.username;
              return (
                <div
                  key={u.username}
                  onClick={() => setSelectedUsername(u.username)}
                  className={`p-3.5 rounded-2xl transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500 shadow-lg shadow-indigo-500/10'
                      : 'audit-glass-panel border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 font-bold flex items-center justify-center shrink-0 uppercase">
                        {u.username.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">{u.username}</h4>
                        <span className="text-[11px] text-slate-400 block truncate">{u.role}</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-black/40 text-slate-300 border border-white/10">
                      {u.totalActions}
                    </span>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">
                      {u.servers.length} {isEn ? 'Servers' : 'سرور هدف'}
                    </span>
                    <span className="font-mono text-slate-400 text-[10px]">
                      {formatDateTime(u.lastActive)}
                    </span>
                  </div>

                  {(u.hasCritical || u.hasFailed) && (
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      {u.hasCritical && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          {isEn ? 'CRITICAL ACTIONS' : 'دستورات حساس'}
                        </span>
                      )}
                      {u.hasFailed && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          {isEn ? 'FAILED ATTEMPTS' : 'اقدامات ناموفق'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Main Panel: Active User Details & Action Feed */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-4">
            {activeUserGroup && (
              <>
                {/* User Hero Banner */}
                <div className="p-4 rounded-2xl audit-glass-panel border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 font-bold flex items-center justify-center text-lg uppercase shrink-0">
                      {activeUserGroup.username.slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-white">{activeUserGroup.username}</h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {activeUserGroup.role}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                        {activeUserGroup.ipAddress && (
                          <span className="font-mono">IP: {activeUserGroup.ipAddress}</span>
                        )}
                        <span>•</span>
                        <span>{isEn ? `${activeUserGroup.totalActions} Total Operations` : `${activeUserGroup.totalActions} کل اقدامات روی سرورها`}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Target servers touched by this user */}
                <div className="p-3.5 rounded-2xl audit-glass-panel border border-white/10 space-y-2">
                  <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{isEn ? 'Servers Accessed by this Operator:' : 'سرورهای مدیریت‌شده توسط این کاربر:'}</span>
                  </h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    {activeUserGroup.servers.map((srv) => (
                      <div
                        key={srv.serverName}
                        onClick={() => {
                          setGroupMode('server');
                          setSelectedServerId(srv.serverName);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-black/25 hover:bg-black/40 border border-white/10 flex items-center gap-2 text-xs transition cursor-pointer"
                      >
                        <Server className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-bold text-white">{srv.serverName}</span>
                        <span className="font-mono text-[10px] text-slate-400">({srv.serverIp})</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 font-mono">
                          {srv.actionsCount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Chronological Action Feed for this user */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{isEn ? 'Actions Executed Across Fleet' : 'لیست اقدامات و دستورات اجرا شده'}</span>
                    </h4>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {activeUserGroup.actions.length} {isEn ? 'Records' : 'سند ثبت‌شده'}
                    </span>
                  </div>

                  {activeUserGroup.actions.map((log) => (
                    <div
                      key={log.id}
                      onClick={() => setInspectedLog(log)}
                      className="p-3.5 rounded-2xl audit-glass-panel border border-white/10 hover:border-indigo-500/40 hover:bg-white/[0.04] transition cursor-pointer space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-xs flex items-center gap-1">
                            <Server className="w-3.5 h-3.5 text-amber-400" />
                            {log.serverName}
                          </span>
                          {getChannelBadge(log.channel)}
                          {getModuleBadge(log.actionModule)}
                          <span className="text-xs text-slate-300 font-medium">
                            {isEn ? log.actionNameEn || log.actionName : log.actionName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {getRiskBadge(log.riskLevel)}
                          {getStatusBadge(log.status)}
                        </div>
                      </div>

                      {log.command && (
                        <div className="p-2 rounded-xl bg-black/40 border border-white/5 font-mono text-[11px] text-emerald-400 flex items-center justify-between gap-2 overflow-x-auto">
                          <span className="truncate">{log.command}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(log.command || '', `cmd-${log.id}`);
                            }}
                            className="text-slate-400 hover:text-white shrink-0"
                          >
                            {copiedId === `cmd-${log.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-white/5 flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-slate-400">{log.serverIp}</span>
                          {log.durationMs && log.durationMs > 0 ? (
                            <span className="font-mono text-cyan-400">
                              {Math.round(log.durationMs / 1000)}s
                            </span>
                          ) : null}
                        </div>
                        <span className="font-mono text-slate-400 text-[10px]">
                          {formatDateTime(log.timestamp)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* ================= PERSPECTIVE 3: ALL TIMELINE ================= */
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isEn ? 'Chronological Server Fleet Audit Log' : 'تاریخچه جامع وقایع و دستورات سرورها'}</span>
            </h4>
            <span className="text-[11px] text-slate-400 font-mono">
              {filteredLogs.length} {isEn ? 'Events' : 'رویداد'}
            </span>
          </div>

          <div className="space-y-2">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                onClick={() => setInspectedLog(log)}
                className="p-3.5 rounded-2xl audit-glass-panel border border-white/10 hover:border-indigo-500/40 hover:bg-white/[0.04] transition cursor-pointer space-y-2"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-xs flex items-center gap-1">
                      <Server className="w-3.5 h-3.5 text-amber-400" />
                      {log.serverName} ({log.serverIp})
                    </span>
                    {getChannelBadge(log.channel)}
                    {getModuleBadge(log.actionModule)}
                    <span className="text-xs font-semibold text-slate-200">
                      {isEn ? log.actionNameEn || log.actionName : log.actionName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getRiskBadge(log.riskLevel)}
                    {getStatusBadge(log.status)}
                  </div>
                </div>

                {log.command && (
                  <div className="p-2 rounded-xl bg-black/40 border border-white/5 font-mono text-[11px] text-emerald-400 flex items-center justify-between gap-2 overflow-x-auto">
                    <span className="truncate">{log.command}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(log.command || '', `timeline-cmd-${log.id}`);
                      }}
                      className="text-slate-400 hover:text-white shrink-0"
                    >
                      {copiedId === `timeline-cmd-${log.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-white/5 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-slate-300 font-medium">
                      <User className="w-3 h-3 text-indigo-400" />
                      {log.actor?.username} ({log.actor?.role})
                    </span>
                    {log.durationMs && log.durationMs > 0 ? (
                      <span className="font-mono text-cyan-400">
                        {Math.round(log.durationMs / 1000)}s
                      </span>
                    ) : null}
                  </div>
                  <span className="font-mono text-slate-400 text-[10px]">
                    {formatDateTime(log.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SINGLE SERVER LOG DETAIL INSPECTION MODAL - 100% MODAL RULES COMPLIANT */}
      {inspectedLog && (
        <div className="fixed top-0 left-0 right-0 bottom-8 z-[999990] modal-glass-backdrop flex items-center justify-center p-4">
          <div
            className={`audit-glass-panel border border-white/15 rounded-2xl flex flex-col shadow-2xl overflow-hidden transition-all duration-200 ${
              isModalMaximized ? 'w-full h-full max-w-full max-h-full rounded-none' : 'w-full max-w-2xl max-h-[90vh]'
            }`}
          >
            {/* Modal Header with Required 3-Button Controls: Close, Minimize, Fullscreen */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {isEn ? 'Server Fleet Command & Activity Audit Record' : 'سند ممیزی فعالیت و دستور سرور'}
                  </h3>
                  <span className="font-mono text-xs text-slate-400">
                    ID: {inspectedLog.id}
                  </span>
                </div>
              </div>

              {/* 3-Button Controls (Rule 7.1) */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsModalMaximized(!isModalMaximized)}
                  title={isEn ? (isModalMaximized ? 'Exit Fullscreen' : 'Fullscreen') : (isModalMaximized ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه')}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  {isModalMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setInspectedLog(null)}
                  title={isEn ? 'Minimize / Dock' : 'مینیمایز'}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setInspectedLog(null)}
                  title={isEn ? 'Close' : 'بستن'}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs custom-scrollbar flex-1">
              {/* Target Server and Operator Details Grid */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/10 font-sans">
                <div>
                  <span className="text-slate-400 block text-[11px]">{isEn ? 'Target Server:' : 'سرور مقصد:'}</span>
                  <span className="font-bold text-white font-mono">{inspectedLog.serverName} ({inspectedLog.serverIp})</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">{isEn ? 'OS & Environment:' : 'سیستم‌عامل و محیط:'}</span>
                  <span className="text-slate-200 font-medium">
                    {inspectedLog.osDistro || inspectedLog.osType} ({inspectedLog.serverEnvironment || 'production'})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">{isEn ? 'Operator:' : 'کاربر اپراتور:'}</span>
                  <span className="font-bold text-white">
                    {inspectedLog.actor?.username} ({inspectedLog.actor?.role})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">{isEn ? 'Client Source IP:' : 'آدرس IP کلاینت:'}</span>
                  <span className="font-mono text-slate-300">{inspectedLog.actor?.ipAddress || '127.0.0.1'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">{isEn ? 'Channel & Module:' : 'کانال و ماژول:'}</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {getChannelBadge(inspectedLog.channel)}
                    {getModuleBadge(inspectedLog.actionModule)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">{isEn ? 'Timestamp:' : 'زمان دقیق رویداد:'}</span>
                  <span className="font-mono text-slate-300">{new Date(inspectedLog.timestamp).toLocaleString()}</span>
                </div>
              </div>

              {/* Status and Risk */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-black/25 border border-white/5">
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">{isEn ? 'Execution Status:' : 'وضعیت اجرا:'}</span>
                  {getStatusBadge(inspectedLog.status)}
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">{isEn ? 'Risk Assessment:' : 'ارزیابی ریسک:'}</span>
                  {getRiskBadge(inspectedLog.riskLevel)}
                </div>
                {inspectedLog.durationMs !== undefined && (
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-0.5">{isEn ? 'Session Duration:' : 'طول مدت ارتباط:'}</span>
                    <span className="font-mono text-cyan-400 font-bold">
                      {Math.round(inspectedLog.durationMs / 1000)} {isEn ? 'seconds' : 'ثانیه'} ({inspectedLog.durationMs}ms)
                    </span>
                  </div>
                )}
              </div>

              {/* Command text if present */}
              {inspectedLog.command && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1">
                      <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{isEn ? 'Raw Command / Action Execution String:' : 'متن دستور یا دستور اجرایی:'}</span>
                    </h4>
                    <button
                      onClick={() => handleCopy(inspectedLog.command || '', 'inspected-cmd')}
                      className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {copiedId === 'inspected-cmd' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{isEn ? 'Copy Command' : 'کپی دستور'}</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded-xl bg-black/60 text-emerald-400 font-mono text-[11px] overflow-x-auto border border-white/10 whitespace-pre-wrap">
                    {inspectedLog.command}
                  </pre>
                </div>
              )}

              {/* Output / Summary details */}
              {(inspectedLog.outputSummary || inspectedLog.outputSummaryEn) && (
                <div>
                  <h4 className="text-xs font-bold text-slate-300 mb-1">
                    {isEn ? 'Output & Event Summary:' : 'خلاصه و نتیجه رویداد:'}
                  </h4>
                  <div className="p-3 rounded-xl bg-black/30 border border-white/5 text-slate-200 leading-relaxed font-sans">
                    {isEn ? inspectedLog.outputSummaryEn || inspectedLog.outputSummary : inspectedLog.outputSummary}
                  </div>
                </div>
              )}

              {/* Parameters / Metadata JSON */}
              {inspectedLog.parameters && Object.keys(inspectedLog.parameters).length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-xs font-bold text-slate-300">
                      {isEn ? 'Action Parameters & Metadata (JSON):' : 'پارامترها و متادیتای اکشن (JSON):'}
                    </h4>
                    <button
                      onClick={() => handleCopy(JSON.stringify(inspectedLog.parameters, null, 2), 'params-json')}
                      className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {copiedId === 'params-json' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{isEn ? 'Copy Parameters' : 'کپی پارامترها'}</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded-xl bg-black/60 text-indigo-300 font-mono text-[11px] overflow-x-auto max-h-48 border border-white/10">
                    {JSON.stringify(inspectedLog.parameters, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-black/30 flex justify-end">
              <button
                onClick={() => setInspectedLog(null)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition cursor-pointer"
              >
                {isEn ? 'Close' : 'بستن'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
