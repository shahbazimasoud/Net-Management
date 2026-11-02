import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Terminal,
  Play,
  Pause,
  RotateCcw,
  Download,
  Copy,
  Check,
  Search,
  Filter,
  Trash2,
  Lock,
  Unlock,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  RefreshCw,
  Sliders,
  Shield,
  Activity,
} from 'lucide-react';
import { Device, isMikroTikDevice } from '../../types';
import { fetchDeviceLogs, clearDeviceLogs } from '../../services/api';

export interface DeviceTerminalLogsTabProps {
  device: Device;
  isEn: boolean;
  isLightMode?: boolean;
  onConnectTerminal?: (device: Device, initialPort?: string) => void;
}

interface ParsedLogLine {
  id: string;
  raw: string;
  timestamp?: string;
  facility?: string;
  severityLevel?: number; // 0 to 7
  severityName?: 'emerg' | 'alert' | 'crit' | 'error' | 'warning' | 'notice' | 'info' | 'debug';
  mnemonic?: string;
  message: string;
  isLive?: boolean;
}

export const DeviceTerminalLogsTab: React.FC<DeviceTerminalLogsTabProps> = ({
  device,
  isEn,
  isLightMode = false,
  onConnectTerminal,
}) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLiveActive, setIsLiveActive] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [showLineNumbers, setShowLineNumbers] = useState<boolean>(true);
  const [wrapLines, setWrapLines] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning' | 'notice' | 'info' | 'debug'>('all');
  const [facilityFilter, setFacilityFilter] = useState<string>('all');
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSyncedTime, setLastSyncedTime] = useState<string>('');

  const terminalBodyRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isMikro = isMikroTikDevice(device);

  // Parse a syslog / CLI log line into structured tokens for syntax highlighting
  const parseLine = useCallback((raw: string, index: number, isLive = false): ParsedLogLine => {
    const trimmed = raw.trim();
    const id = `log-${index}-${trimmed.substring(0, 24)}`;

    // 1. Cisco Syslog Pattern: *Nov 2 11:20:15.342: %LINK-3-UPDOWN: Interface Gi0/1, changed state to up
    // Pattern: [%](FACILITY)-(SEVERITY)-(MNEMONIC): (MESSAGE)
    const ciscoMatch = trimmed.match(
      /^(?:[\*]?\s*([A-Za-z0-9\s\.\:\-]+?)\s*:\s*)?%([A-Z0-9_]+)-([0-7])-([A-Z0-9_]+):\s*(.*)$/
    );

    if (ciscoMatch) {
      const timestamp = ciscoMatch[1]?.trim();
      const facility = ciscoMatch[2];
      const severityLevel = parseInt(ciscoMatch[3], 10);
      const mnemonic = ciscoMatch[4];
      const message = ciscoMatch[5];

      let severityName: ParsedLogLine['severityName'] = 'info';
      if (severityLevel <= 2) severityName = 'crit';
      else if (severityLevel === 3) severityName = 'error';
      else if (severityLevel === 4) severityName = 'warning';
      else if (severityLevel === 5) severityName = 'notice';
      else if (severityLevel === 6) severityName = 'info';
      else if (severityLevel === 7) severityName = 'debug';

      return {
        id,
        raw: trimmed,
        timestamp,
        facility,
        severityLevel,
        severityName,
        mnemonic,
        message,
        isLive,
      };
    }

    // 2. MikroTik Log Pattern: nov/02 11:20:15 interface,info ether1 link up
    const mikrotikMatch = trimmed.match(
      /^([a-z]{3}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s+([a-z0-9_,]+)\s+(.*)$/i
    );
    if (mikrotikMatch) {
      const timestamp = mikrotikMatch[1];
      const topics = mikrotikMatch[2];
      const message = mikrotikMatch[3];

      let severityLevel = 6;
      let severityName: ParsedLogLine['severityName'] = 'info';

      if (topics.includes('critical') || topics.includes('error')) {
        severityLevel = 3;
        severityName = 'error';
      } else if (topics.includes('warning')) {
        severityLevel = 4;
        severityName = 'warning';
      } else if (topics.includes('debug')) {
        severityLevel = 7;
        severityName = 'debug';
      }

      return {
        id,
        raw: trimmed,
        timestamp,
        facility: topics,
        severityLevel,
        severityName,
        mnemonic: topics,
        message,
        isLive,
      };
    }

    // 3. Fallback General Line
    return {
      id,
      raw: trimmed,
      message: trimmed,
      isLive,
    };
  }, []);

  // Fetch initial authoritative buffer from hardware
  const loadDeviceBuffer = useCallback(async () => {
    if (!device?.id) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetchDeviceLogs(device.id, 200);
      if (res && Array.isArray(res.logs)) {
        setLogs(res.logs);
        setLastSyncedTime(new Date().toLocaleTimeString());
      }
    } catch (err: any) {
      setErrorMessage(err.message || (isEn ? 'Failed to read device logs buffer' : 'خطا در دریافت بافر لاگ‌های تجهیز'));
    } finally {
      setIsLoading(false);
    }
  }, [device?.id, isEn]);

  useEffect(() => {
    loadDeviceBuffer();
  }, [loadDeviceBuffer]);

  // Live WebSocket streaming listener
  useEffect(() => {
    if (!device?.id || !isLiveActive) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = localStorage.getItem('token') || '';
    const wsUrl = `${protocol}//${window.location.host}/ws/ports-monitor?deviceId=${encodeURIComponent(
      device.id
    )}&token=${encodeURIComponent(token)}&lang=${isEn ? 'en' : 'fa'}`;

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'DEVICE_LOG_STREAM' && data.line) {
            if (!isPaused) {
              setLogs((prev) => {
                const updated = [...prev, data.line];
                // Cap memory buffer to 1000 lines
                if (updated.length > 1000) return updated.slice(-1000);
                return updated;
              });
            }
          } else if (data.type === 'PORT_LIVE_STATUS' && data.logLine) {
            if (!isPaused) {
              setLogs((prev) => {
                const updated = [...prev, data.logLine];
                if (updated.length > 1000) return updated.slice(-1000);
                return updated;
              });
            }
          }
        } catch {}
      };

      ws.onerror = () => {
        // Fallback silently if port monitor ws is busy
      };
    } catch {}

    return () => {
      try {
        if (ws) {
          ws.close();
        }
      } catch {}
    };
  }, [device?.id, isLiveActive, isPaused, isEn]);

  // Auto-scroll to bottom of terminal
  useEffect(() => {
    if (autoScroll && !isPaused && terminalBodyRef.current) {
      terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
    }
  }, [logs, autoScroll, isPaused]);

  // Parsed and filtered log items
  const parsedLogs = useMemo(() => {
    return logs.map((l, idx) => parseLine(l, idx));
  }, [logs, parseLine]);

  const filteredLogs = useMemo(() => {
    return parsedLogs.filter((item) => {
      // Severity Filter
      if (severityFilter === 'error' && (item.severityLevel === undefined || item.severityLevel > 3)) return false;
      if (severityFilter === 'warning' && (item.severityLevel === undefined || item.severityLevel !== 4)) return false;
      if (severityFilter === 'notice' && (item.severityLevel === undefined || item.severityLevel !== 5)) return false;
      if (severityFilter === 'info' && (item.severityLevel === undefined || item.severityLevel !== 6)) return false;
      if (severityFilter === 'debug' && (item.severityLevel === undefined || item.severityLevel !== 7)) return false;

      // Facility Filter
      if (facilityFilter !== 'all' && item.facility && !item.facility.toLowerCase().includes(facilityFilter.toLowerCase())) {
        return false;
      }

      // Keyword Query Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.raw.toLowerCase().includes(q);
      }

      return true;
    });
  }, [parsedLogs, severityFilter, facilityFilter, searchQuery]);

  // Unique facilities for filter dropdown
  const availableFacilities = useMemo(() => {
    const set = new Set<string>();
    parsedLogs.forEach((p) => {
      if (p.facility) set.add(p.facility);
    });
    return Array.from(set).sort();
  }, [parsedLogs]);

  // Log counts by severity
  const severityCounts = useMemo(() => {
    let err = 0;
    let warn = 0;
    let notice = 0;
    let info = 0;
    let upDown = 0;

    parsedLogs.forEach((p) => {
      if (p.severityLevel !== undefined && p.severityLevel <= 3) err++;
      else if (p.severityLevel === 4) warn++;
      else if (p.severityLevel === 5) notice++;
      else if (p.severityLevel === 6) info++;

      if (p.mnemonic && (p.mnemonic.includes('UPDOWN') || p.mnemonic.includes('CHANGED') || p.raw.includes('link up') || p.raw.includes('link down'))) {
        upDown++;
      }
    });

    return { err, warn, notice, info, upDown, total: parsedLogs.length };
  }, [parsedLogs]);

  const handleCopyLogs = () => {
    try {
      const text = filteredLogs.map((l) => l.raw).join('\n');
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDownloadLogs = () => {
    const text = filteredLogs.map((l) => l.raw).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${device.name || device.ip}-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearLocalLogs = () => {
    setLogs([]);
  };

  // Highlights interfaces, IP addresses, keywords in messages
  const renderMessageText = (msg: string) => {
    // Regex matches IPs, MACs, interfaces, states
    const parts = msg.split(/(\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b|\b(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}\b|\b(?:[0-9a-fA-F]{4}\.){2}[0-9a-fA-F]{4}\b|\b(?:Gi|Fa|Te|Twe|Eth|Ethernet|FastEthernet|GigabitEthernet|TenGigabitEthernet|ether|wlan|bridge|vlan)[0-9\/\.\-_]+\b|\b(?:up|down|administratively down|admin down|connected|disabled|enabled|err-disable|err-disabled|shutdown|failed|success)\b)/gi);

    return parts.map((part, i) => {
      const lower = part.toLowerCase();
      // Interface
      if (/^(gi|fa|te|twe|eth|ethernet|fastethernet|gigabitethernet|tengigabitethernet|ether|wlan|bridge|vlan)[0-9\/\.\-_]+$/i.test(part)) {
        return (
          <span key={i} className="text-yellow-300 font-bold underline underline-offset-2 decoration-yellow-500/40">
            {part}
          </span>
        );
      }
      // IP address
      if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(part)) {
        return (
          <span key={i} className="text-sky-300 font-bold">
            {part}
          </span>
        );
      }
      // Status words
      if (lower === 'up' || lower === 'connected' || lower === 'enabled' || lower === 'success') {
        return (
          <span key={i} className="text-emerald-400 font-bold">
            {part}
          </span>
        );
      }
      if (lower === 'down' || lower === 'administratively down' || lower === 'admin down' || lower === 'disabled' || lower === 'err-disable' || lower === 'err-disabled' || lower === 'shutdown' || lower === 'failed') {
        return (
          <span key={i} className="text-rose-400 font-bold">
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div
      className={`flex flex-col h-full rounded-xl border overflow-hidden select-none ${
        isLightMode
          ? 'bg-slate-100 border-slate-300 text-slate-800'
          : 'bg-[#060913] border-slate-800 text-slate-100'
      }`}
      dir="ltr"
    >
      {/* Terminal Title Bar */}
      <div
        className={`flex flex-wrap items-center justify-between px-3.5 py-2.5 border-b text-xs shrink-0 gap-2 ${
          isLightMode
            ? 'bg-slate-200/90 border-slate-300'
            : 'bg-slate-900/95 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Terminal Window Dots */}
          <div className="flex items-center gap-1.5 mr-1">
            <div className="w-3 h-3 rounded-full bg-rose-500/80 border border-rose-600/50 shadow-xs" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-600/50 shadow-xs" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-600/50 shadow-xs" />
          </div>

          <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
            <Terminal className="w-4 h-4" />
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold tracking-wide font-mono text-sm truncate text-white">
              {device.name}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-slate-800 text-slate-300 border border-slate-700/80">
              {device.ip}
            </span>
            <span className="hidden md:inline-flex text-[10px] px-2 py-0.5 rounded font-mono bg-slate-800/80 text-cyan-400 border border-cyan-500/30">
              {isMikro ? 'RouterOS (/log print follow)' : 'Cisco IOS (terminal monitor & show logging)'}
            </span>
          </div>

          {/* Live Status Pill */}
          <div className="flex items-center gap-1.5 ml-1">
            {isLiveActive ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full bg-emerald-400 ${isPaused ? 'opacity-50' : 'animate-ping'}`} />
                <span>{isPaused ? 'PAUSED' : 'LIVE STREAM'}</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                OFFLINE BUFFER
              </span>
            )}
            {lastSyncedTime && (
              <span className="hidden lg:inline text-[10px] font-mono text-slate-500">
                Synced: {lastSyncedTime}
              </span>
            )}
          </div>
        </div>

        {/* Global Terminal Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Pause / Resume Stream */}
          <button
            type="button"
            onClick={() => setIsPaused(!isPaused)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              isPaused
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title={isPaused ? 'Resume live logging' : 'Pause auto-feed to inspect lines'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5 text-amber-400" /> : <Pause className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isPaused ? (isEn ? 'Resume' : 'ادامه') : (isEn ? 'Pause' : 'توقف موقت')}</span>
          </button>

          {/* Auto-scroll Pin Lock */}
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded-lg border text-xs transition cursor-pointer ${
              autoScroll
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
            title={autoScroll ? 'Auto-scroll enabled (following tail)' : 'Auto-scroll locked'}
          >
            {autoScroll ? <Lock className="w-3.5 h-3.5 text-emerald-400" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>

          {/* Refresh / Re-fetch Buffer */}
          <button
            type="button"
            onClick={loadDeviceBuffer}
            disabled={isLoading}
            className="p-1.5 rounded-lg border bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 transition cursor-pointer disabled:opacity-50"
            title={isEn ? 'Reload logs from device buffer' : 'بارگذاری مجدد بافر لاگ از تجهیز'}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Clear View */}
          <button
            type="button"
            onClick={handleClearLocalLogs}
            className="p-1.5 rounded-lg border bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-400 border-slate-700 transition cursor-pointer"
            title={isEn ? 'Clear terminal display' : 'پاک کردن صفحه ترمینال'}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Copy All */}
          <button
            type="button"
            onClick={handleCopyLogs}
            className="p-1.5 rounded-lg border bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 transition cursor-pointer"
            title={isEn ? 'Copy all filtered logs' : 'کپی کردن تمام لاگ‌ها'}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Download Log File */}
          <button
            type="button"
            onClick={handleDownloadLogs}
            className="p-1.5 rounded-lg border bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 transition cursor-pointer"
            title={isEn ? 'Download .log file' : 'دانلود فایل لاگ'}
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
          </button>

          {/* Open Full CLI Terminal */}
          {onConnectTerminal && (
            <button
              type="button"
              onClick={() => onConnectTerminal(device)}
              className="px-2.5 py-1 rounded-lg border bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs ml-1"
              title={isEn ? 'Open interactive CLI terminal' : 'باز کردن ترمینال تعاملی'}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isEn ? 'Interactive CLI' : 'ترمینال کامل'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Severity Header Bar */}
      <div
        className={`flex flex-wrap items-center justify-between px-3.5 py-2 border-b text-xs gap-2 shrink-0 ${
          isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-950/80 border-slate-800/90'
        }`}
      >
        {/* Severity Quick Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-mono text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3 text-cyan-400" />
            <span>{isEn ? 'Severity:' : 'سطح:'}</span>
          </span>

          <button
            type="button"
            onClick={() => setSeverityFilter('all')}
            className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition cursor-pointer border ${
              severityFilter === 'all'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200'
            }`}
          >
            ALL ({severityCounts.total})
          </button>

          <button
            type="button"
            onClick={() => setSeverityFilter('error')}
            className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition cursor-pointer border ${
              severityFilter === 'error'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold'
                : 'bg-slate-800/60 text-rose-400/80 border-slate-700/60 hover:text-rose-300'
            }`}
          >
            ERR/CRIT ({severityCounts.err})
          </button>

          <button
            type="button"
            onClick={() => setSeverityFilter('warning')}
            className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition cursor-pointer border ${
              severityFilter === 'warning'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                : 'bg-slate-800/60 text-amber-400/80 border-slate-700/60 hover:text-amber-300'
            }`}
          >
            WARN ({severityCounts.warn})
          </button>

          <button
            type="button"
            onClick={() => setSeverityFilter('notice')}
            className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition cursor-pointer border ${
              severityFilter === 'notice'
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                : 'bg-slate-800/60 text-sky-400/80 border-slate-700/60 hover:text-sky-300'
            }`}
          >
            NOTICE ({severityCounts.notice})
          </button>

          <button
            type="button"
            onClick={() => setSeverityFilter('info')}
            className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition cursor-pointer border ${
              severityFilter === 'info'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800/60 text-emerald-400/80 border-slate-700/60 hover:text-emerald-300'
            }`}
          >
            INFO ({severityCounts.info})
          </button>

          {severityCounts.upDown > 0 && (
            <button
              type="button"
              onClick={() => setSearchQuery('UPDOWN')}
              className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30 transition cursor-pointer"
              title="Filter interface UP/DOWN transitions"
            >
              PORT EVENTS ({severityCounts.upDown})
            </button>
          )}
        </div>

        {/* Search Filter Input & View Toggles */}
        <div className="flex items-center gap-2">
          {/* Facility Dropdown (if present) */}
          {availableFacilities.length > 0 && (
            <select
              value={facilityFilter}
              onChange={(e) => setFacilityFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-mono rounded px-2 py-1 outline-hidden focus:border-cyan-400"
            >
              <option value="all">Facility: All</option>
              {availableFacilities.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isEn ? 'Filter syslog (e.g. Gi0/1, UPDOWN)...' : 'فیلتر لاگ (مثلاً Gi0/1)...'}
              className="pl-8 pr-2 py-1 text-xs font-mono rounded-lg bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-cyan-400 w-44 sm:w-56"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Line Numbers Toggle */}
          <button
            type="button"
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            className={`px-2 py-1 rounded text-[11px] font-mono border transition cursor-pointer ${
              showLineNumbers
                ? 'bg-slate-800 text-cyan-400 border-slate-700'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
            title="Toggle line numbers"
          >
            #
          </button>

          {/* Wrap Lines Toggle */}
          <button
            type="button"
            onClick={() => setWrapLines(!wrapLines)}
            className={`px-2 py-1 rounded text-[11px] font-mono border transition cursor-pointer ${
              wrapLines
                ? 'bg-slate-800 text-cyan-400 border-slate-700'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
            title="Toggle line wrapping"
          >
            Wrap
          </button>
        </div>
      </div>

      {/* Error Notification Banner if connection rejected */}
      {errorMessage && (
        <div className="bg-rose-950/80 border-b border-rose-800/80 px-4 py-2 text-rose-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-mono truncate">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={loadDeviceBuffer}
            className="px-2.5 py-1 rounded bg-rose-800 hover:bg-rose-700 text-white font-mono text-[11px] transition cursor-pointer shrink-0"
          >
            {isEn ? 'Retry' : 'تلاش مجدد'}
          </button>
        </div>
      )}

      {/* Terminal Output Area */}
      <div
        ref={terminalBodyRef}
        className={`flex-1 overflow-y-auto p-3 font-mono text-xs sm:text-[13px] leading-relaxed select-text ${
          wrapLines ? 'break-words whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto'
        } ${
          isLightMode
            ? 'bg-[#0f172a] text-slate-200'
            : 'bg-[#050811] text-slate-200'
        }`}
        style={{ minHeight: '340px' }}
      >
        {isLoading && logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center select-none text-slate-400 gap-3">
            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
            <div className="font-mono font-semibold text-sm text-cyan-300">
              {isEn ? 'Executing "show logging" via SSH...' : 'در حال اجرای دستور "show logging" بر روی دستگاه...'}
            </div>
            <p className="text-xs text-slate-500 font-mono">
              {isEn
                ? 'Retrieving authentic hardware syslog ring buffer directly from target device...'
                : 'دریافت مستقیم و معتبر بافر لاگ‌های سخت‌افزاری از طریق پروتکل امن SSH...'}
            </p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center select-none text-slate-400 gap-2">
            <Terminal className="w-8 h-8 text-slate-600" />
            <div className="font-mono text-slate-400">
              {searchQuery || severityFilter !== 'all' || facilityFilter !== 'all'
                ? isEn
                  ? 'No syslog messages matched your active filter criteria.'
                  : 'هیچ پیامی با فیلترهای انتخابی مطابقت ندارد.'
                : isEn
                ? 'No syslog messages recorded in device buffer yet.'
                : 'تاکنون پیامی در بافر لاگ دستگاه ثبت نشده است.'}
            </div>
            {(searchQuery || severityFilter !== 'all' || facilityFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSeverityFilter('all');
                  setFacilityFilter('all');
                }}
                className="mt-2 text-xs text-cyan-400 hover:underline font-mono"
              >
                {isEn ? 'Reset All Filters' : 'حذف تمام فیلترها'}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredLogs.map((item, idx) => {
              // Line severity color scheme
              let sevBadgeClass = 'bg-slate-800 text-slate-300 border-slate-700';
              let lineTextClass = 'text-slate-300';

              if (item.severityLevel !== undefined) {
                if (item.severityLevel <= 2) {
                  sevBadgeClass = 'bg-red-500/20 text-red-300 border-red-500/50 font-bold';
                  lineTextClass = 'text-red-300 bg-red-950/20';
                } else if (item.severityLevel === 3) {
                  sevBadgeClass = 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold';
                  lineTextClass = 'text-rose-300 bg-rose-950/10';
                } else if (item.severityLevel === 4) {
                  sevBadgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold';
                  lineTextClass = 'text-amber-200';
                } else if (item.severityLevel === 5) {
                  sevBadgeClass = 'bg-sky-500/20 text-sky-300 border-sky-500/40';
                  lineTextClass = 'text-sky-200';
                } else if (item.severityLevel === 6) {
                  sevBadgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
                  lineTextClass = 'text-emerald-200/90';
                } else if (item.severityLevel === 7) {
                  sevBadgeClass = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
                  lineTextClass = 'text-purple-200/80';
                }
              }

              return (
                <div
                  key={item.id}
                  className={`flex items-start gap-2 py-0.5 px-1.5 rounded transition-colors hover:bg-slate-800/40 ${lineTextClass}`}
                >
                  {/* Line Number */}
                  {showLineNumbers && (
                    <span className="text-[10px] font-mono text-slate-600 select-none w-8 text-right shrink-0">
                      {idx + 1}
                    </span>
                  )}

                  {/* Timestamp */}
                  {item.timestamp && (
                    <span className="text-slate-500 text-[11px] font-mono shrink-0 select-none">
                      {item.timestamp}
                    </span>
                  )}

                  {/* Facility & Severity Badge */}
                  {item.facility && item.mnemonic && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded border shrink-0 font-bold select-none ${sevBadgeClass}`}
                    >
                      %{item.facility}-{item.severityLevel !== undefined ? item.severityLevel : '?'}-{item.mnemonic}
                    </span>
                  )}

                  {/* Message Body with Highlighted Interfaces & States */}
                  <span className="flex-1 font-mono tracking-wide">
                    {renderMessageText(item.message)}
                  </span>
                </div>
              );
            })}

            {/* Read-Only Terminal Prompt with Blinking Cursor */}
            <div className="flex items-center gap-2 pt-3 pb-1 text-slate-500 select-none font-mono text-xs">
              <span className="text-emerald-400 font-bold">●</span>
              <span className="text-slate-400">
                [{device.name.toUpperCase()}: READ-ONLY LIVE LOG STREAM]
              </span>
              <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse ml-0.5" />
            </div>
          </div>
        )}
      </div>

      {/* Terminal Footer Bar */}
      <div
        className={`flex flex-wrap items-center justify-between px-3.5 py-1.5 border-t text-[11px] font-mono shrink-0 select-none gap-2 ${
          isLightMode ? 'bg-slate-200/90 border-slate-300 text-slate-700' : 'bg-slate-900/90 border-slate-800 text-slate-400'
        }`}
      >
        <div className="flex items-center gap-3">
          <span>
            {isEn ? 'Showing:' : 'نمایش:'}{' '}
            <strong className="text-cyan-400">{filteredLogs.length}</strong> / {parsedLogs.length}{' '}
            {isEn ? 'lines' : 'سطر'}
          </span>
          {searchQuery && (
            <span className="text-amber-400">
              [Filter: "{searchQuery}"]
            </span>
          )}
          <span className="hidden sm:inline text-slate-600">•</span>
          <span className="hidden sm:inline">
            Buffer: <strong className="text-slate-300">{(new Blob([logs.join('\n')]).size / 1024).toFixed(1)} KB</strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Mode: Read-Only Tail</span>
          </span>
          <span className="text-slate-600">•</span>
          <span className="text-slate-400">
            Encoding: UTF-8 / VT100
          </span>
        </div>
      </div>
    </div>
  );
};
