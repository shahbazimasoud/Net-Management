import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  LocateFixed,
  Minus,
  X,
  Maximize2,
  Minimize2,
  Search,
  RefreshCw,
  ClipboardPaste,
  Copy,
  Check,
  Terminal,
  Server,
  Layers,
  Network,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  ArrowRight,
  ShieldAlert,
  SlidersHorizontal,
  ChevronRight,
  ExternalLink,
  Cpu,
  Zap,
  Cable,
  History,
  Activity,
  Trash2
} from 'lucide-react';
import { Device } from '../../types';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

// ============================================================================
// Types
// ============================================================================

export interface CamTableObservation {
  switchId: string;
  switchName: string;
  switchIp: string;
  switchVendor: string;
  switchRole?: string;
  switchModel?: string;
  vlan: string;
  mac: string;
  type: string;
  port: string;
  isUplink?: boolean;
  uplinkReason?: 'cdp_lldp_neighbor' | 'topology_link' | 'port_channel' | 'uplink_naming' | 'none';
  isFinalEdgePort?: boolean;
  peerDeviceName?: string;
  peerDeviceId?: string;
  peerDeviceIp?: string;
  peerPort?: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface ArpTableObservation {
  switchId: string;
  switchName: string;
  switchIp: string;
  ip: string;
  mac: string;
  interface: string;
  vlan?: string;
  age?: string;
  type?: string;
  timestamp?: string;
}

export interface PathHopInfo {
  hopNumber: number;
  switchId: string;
  switchName: string;
  switchIp: string;
  switchRole?: string;
  switchVendor: string;
  port: string;
  vlan: string;
  isEdge: boolean;
  isUplink: boolean;
  peerDeviceName?: string;
  peerPort?: string;
  nextHopName?: string;
}

export interface TrackerResultPayload {
  query: string;
  queryType: 'mac' | 'ipv4' | 'ipv6' | 'invalid';
  normalizedMac: {
    clean: string;
    standard: string;
    standardUpper: string;
    cisco: string;
    ciscoUpper: string;
    hyphen: string;
    hyphenUpper: string;
    oui: string;
  } | null;
  resolvedIp: string | null;
  resolvedMac: string | null;
  vendor: {
    vendor: string;
    prefix: string;
    isKnown: boolean;
  };
  camEntries: CamTableObservation[];
  arpEntries: ArpTableObservation[];
  finalEdgePort: CamTableObservation | null;
  edgeSummary: {
    finalEdgeFound: boolean;
    finalSwitchName?: string;
    finalPort?: string;
    vlan?: string;
    uplinksFilteredCount: number;
    totalSwitchesWithMac: number;
    confidence: 'high' | 'medium' | 'low';
    explanationFa: string;
    explanationEn: string;
  };
  pathHops: PathHopInfo[];
  pathDiagram: string;
  graphNodes: any[];
  graphEdges: any[];
  switchesScannedCount: number;
  switchesActiveCount: number;
  durationMs: number;
  cached: boolean;
  timestamp: string;
}

export interface TrackerAuditHistoryItem {
  id: string;
  timestamp: string;
  userName: string;
  target: string;
  queryType: string;
  resolvedMac?: string;
  resolvedIp?: string;
  vendor?: string;
  finalPort?: string;
  finalSwitch?: string;
  status: 'success' | 'not_found' | 'error';
  durationMs?: number;
}

export interface MacIpTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  isEn: boolean;
  isLightMode: boolean;
  allDevices?: Device[];
  onOpenTerminal?: (device: Device) => void;
  onOpenPortInspector?: (device: Device, portId?: string) => void;
}

// Preset examples for quick click testing
const QUICK_PRESETS = [
  { label: 'VMware Workstation', value: '0050.56a1.2234', type: 'mac' },
  { label: 'Cisco Device', value: '00:00:0C:11:22:33', type: 'mac' },
  { label: 'MikroTik Router', value: '00:0C:42:AA:BB:CC', type: 'mac' },
  { label: 'Local Host IP', value: '192.168.1.100', type: 'ip' },
];

export const MacIpTrackerModal: React.FC<MacIpTrackerModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  isEn,
  isLightMode,
  allDevices = [],
  onOpenTerminal,
  onOpenPortInspector,
}) => {
  // Modal window state
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'tracker' | 'history'>('tracker');

  // Search input and options
  const [queryInput, setQueryInput] = useState<string>('');
  const [forceRefresh, setForceRefresh] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [trackerResult, setTrackerResult] = useState<TrackerResultPayload | null>(null);

  // History state
  const [historyItems, setHistoryItems] = useState<TrackerAuditHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [historyFilter, setHistoryFilter] = useState<string>('');

  // UI state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Copy helper
  const handleCopy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  }, []);

  // Real-time query detection
  const detectedQueryType = useMemo<'mac' | 'ipv4' | 'ipv6' | 'invalid' | 'empty'>(() => {
    const q = queryInput.trim();
    if (!q) return 'empty';
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^([0-9a-fA-F]{4}\.){2}[0-9a-fA-F]{4}$|^[0-9a-fA-F]{12}$/;
    if (macRegex.test(q)) return 'mac';
    const ipv4Regex = /^(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (ipv4Regex.test(q)) return 'ipv4';
    if (q.includes(':') && q.split(':').length > 2) return 'ipv6';
    return 'invalid';
  }, [queryInput]);

  // Execute Search
  const handleExecuteSearch = useCallback(
    async (overrideQuery?: string, overrideForce?: boolean) => {
      const q = (overrideQuery !== undefined ? overrideQuery : queryInput).trim();
      if (!q) {
        setSearchError(
          isEn
            ? 'Please enter a valid MAC address (e.g. 0050.56a1.2234) or IPv4 address'
            : 'لطفاً یک آدرس مک (مانند 0050.56a1.2234) یا آی‌پی معتبر وارد کنید'
        );
        return;
      }

      setIsSearching(true);
      setSearchError(null);

      try {
        const res = await fetch('/api/tools/mac-ip-tracker/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-operator-user': 'admin',
          },
          body: JSON.stringify({
            query: q,
            forceRefresh: overrideForce !== undefined ? overrideForce : forceRefresh,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || (isEn ? 'Search failed' : 'خطا در اجرای جستجو'));
        }

        setTrackerResult(data.result);
        setActiveTab('tracker');
      } catch (err: any) {
        setSearchError(err.message || (isEn ? 'Connection error' : 'خطای ارتباط با سرور'));
      } finally {
        setIsSearching(false);
      }
    },
    [queryInput, forceRefresh, isEn]
  );

  // Fetch History
  const fetchAuditHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch('/api/tools/mac-ip-tracker/history?limit=40');
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.history)) {
        setHistoryItems(data.history);
      }
    } catch (err) {
      console.error('Failed to fetch tracker history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Fetch history when tab opens
  useEffect(() => {
    if (activeTab === 'history') {
      fetchAuditHistory();
    }
  }, [activeTab, fetchAuditHistory]);

  // Quick paste from clipboard
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setQueryInput(text.trim());
      }
    } catch {
      // Ignore clipboard read permission failure
    }
  };

  // Resolve matching Device object from switch name or ID
  const resolveDevice = (switchId?: string, switchName?: string): Device | undefined => {
    if (!switchId && !switchName) return undefined;
    return allDevices.find(
      (d) =>
        (switchId && d.id === switchId) ||
        (switchName && d.name.toLowerCase() === switchName.toLowerCase()) ||
        (switchId && d.name.toLowerCase() === switchId.toLowerCase())
    );
  };

  if (!isOpen) return null;

  // Filtered history list
  const filteredHistory = historyItems.filter((item) => {
    if (!historyFilter.trim()) return true;
    const term = historyFilter.toLowerCase();
    return (
      item.target.toLowerCase().includes(term) ||
      (item.resolvedMac && item.resolvedMac.toLowerCase().includes(term)) ||
      (item.resolvedIp && item.resolvedIp.toLowerCase().includes(term)) ||
      (item.finalSwitch && item.finalSwitch.toLowerCase().includes(term)) ||
      (item.finalPort && item.finalPort.toLowerCase().includes(term)) ||
      (item.vendor && item.vendor.toLowerCase().includes(term))
    );
  });

  const modalContent = (
    <div
      id="mac-ip-tracker-modal-overlay"
      className={`fixed top-0 left-0 right-0 bottom-8 z-[999990] ${
        isMaximized
          ? 'p-0 flex flex-col bg-black/80 backdrop-blur-md'
          : 'flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in'
      }`}
    >
      <div
        id="mac-ip-tracker-modal-window"
        className={`flex flex-col transition-all duration-200 overflow-hidden ${
          isMaximized
            ? `w-full h-full max-w-none max-h-full rounded-none border-none ${
                isLightMode ? 'bg-white text-slate-900' : 'bg-slate-950 text-slate-100'
              }`
            : `w-full max-w-5xl max-h-[88vh] rounded-2xl shadow-2xl border ${
                isLightMode
                  ? 'bg-white text-slate-900 border-slate-200 shadow-slate-400/40'
                  : 'bg-slate-950 text-slate-100 border-slate-800 shadow-[0_20px_60px_rgba(0,0,0,0.85)]'
              }`
        }`}
      >
        {/* ================================================================= */}
        {/* Modal Header with 3 Mandatory Control Buttons                     */}
        {/* ================================================================= */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3 border-b shrink-0 ${
            isLightMode ? 'border-slate-100 bg-slate-50/95' : 'border-slate-800/80 bg-slate-900/90'
          } ${isMaximized ? 'rounded-none' : 'rounded-t-2xl'}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20 shrink-0">
              <LocateFixed className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold tracking-wide">
                  {isEn ? 'Global MAC & IP Address Tracker' : 'ردیاب سراسری مک و آی‌پی شبکه'}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
                  CAM & ARP
                </span>
              </div>
              <p className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Trace endpoint devices to physical edge switch ports, eliminate transit uplinks & view packet hop path'
                  : 'ردیابی بلادرنگ کلاینت به پورت فیزیکی اکسس سوئیچ، حذف آپلینک‌های ترانک و ترسیم مسیر هاپ‌های شبکه'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Header Tabs Toggle */}
            <div
              className={`hidden sm:flex items-center p-0.5 rounded-lg border mr-2 ${
                isLightMode ? 'bg-slate-200/70 border-slate-300' : 'bg-slate-800/60 border-slate-700/60'
              }`}
            >
              <button
                onClick={() => setActiveTab('tracker')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  activeTab === 'tracker'
                    ? isLightMode
                      ? 'bg-white text-cyan-600 shadow-sm'
                      : 'bg-cyan-600 text-white shadow-sm'
                    : isLightMode
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isEn ? 'Live Tracker & Edge Port' : 'جستجوی زنده و پورت اکسس'}
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  activeTab === 'history'
                    ? isLightMode
                      ? 'bg-white text-cyan-600 shadow-sm'
                      : 'bg-cyan-600 text-white shadow-sm'
                    : isLightMode
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isEn ? 'Audit History' : 'تاریخچه جستجوها'}
              </button>
            </div>

            {/* 1. Minimize button (dock tab preservation) */}
            <button
              onClick={onMinimize}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-300'
              }`}
              title={isEn ? 'Minimize to dock' : 'مینیمایز به نوار داک'}
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* 2. Fullscreen / Exit Fullscreen button */}
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-300'
              }`}
              title={
                isMaximized
                  ? isEn
                    ? 'Exit fullscreen'
                    : 'خروج از تمام‌صفحه'
                  : isEn
                  ? 'Fullscreen'
                  : 'تمام‌صفحه'
              }
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* 3. Close button */}
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-rose-100 text-slate-500 hover:text-rose-600'
                  : 'hover:bg-rose-950/40 text-slate-400 hover:text-rose-400'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Tab Selector */}
        <div
          className={`sm:hidden flex border-b px-4 py-2 gap-2 ${
            isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <button
            onClick={() => setActiveTab('tracker')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg text-center ${
              activeTab === 'tracker'
                ? isLightMode
                  ? 'bg-white text-cyan-600 shadow-sm'
                  : 'bg-cyan-600 text-white'
                : isLightMode
                ? 'text-slate-600'
                : 'text-slate-400'
            }`}
          >
            {isEn ? 'Live Tracker' : 'جستجوی زنده'}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg text-center ${
              activeTab === 'history'
                ? isLightMode
                  ? 'bg-white text-cyan-600 shadow-sm'
                  : 'bg-cyan-600 text-white'
                : isLightMode
                ? 'text-slate-600'
                : 'text-slate-400'
            }`}
          >
            {isEn ? 'Audit History' : 'تاریخچه جستجوها'}
          </button>
        </div>

        {/* ================================================================= */}
        {/* Modal Scrollable Body                                             */}
        {/* ================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {activeTab === 'tracker' ? (
            <>
              {/* ------------------------------------------------------------- */}
              {/* Search Control Card                                           */}
              {/* ------------------------------------------------------------- */}
              <div
                className={`p-4 sm:p-5 rounded-xl border transition-all ${
                  isLightMode ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-900/50 border-slate-800/80'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-semibold tracking-wide">
                      {isEn ? 'Target MAC Address or IPv4' : 'آدرس مک (MAC) یا آی‌پی (IPv4) هدف'}
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'MAC / IP Search Query' : 'شناسه جستجوی مک یا آی‌پی'}
                      infoWhatEn="Enter any MAC address format (Cisco 0050.56a1.2234, Colon 00:50:56:A1:22:34, Hyphen) or standard IPv4 address to trace its location in the switch topology."
                      infoWhatFa="آدرس مک را در هر قالبی (سیسکو، دونقطه، هایفن) یا آدرس آی‌پی IPv4 را وارد نمایید تا موقعیت دقیق آن در توپولوژی سوییچ‌ها شناسایی گردد."
                      infoWhyEn="CAM tables store MACs per switch port, while ARP tables bind IP to MAC. The engine dynamically queries both to locate client machines."
                      infoWhyFa="جدول CAM مک‌های متصل به هر پورت و جدول ARP ارتباط IP با MAC را نگهداری می‌کنند. موتور هر دو جدول را همگام استعلام می‌نماید."
                      infoExampleEn="0050.56a1.2234 or 192.168.1.100"
                      infoExampleFa="0050.56a1.2234 یا 192.168.1.100"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>

                  {/* Format auto-detection badge */}
                  <div className="flex items-center gap-2">
                    {detectedQueryType === 'mac' && (
                      <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        {isEn ? 'MAC Address Detected' : 'فرمت آدرس MAC شناسایی شد'}
                      </span>
                    )}
                    {detectedQueryType === 'ipv4' && (
                      <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {isEn ? 'IPv4 Address Detected (Will query ARP)' : 'آدرس IPv4 شناسایی شد (استعلام ARP)'}
                      </span>
                    )}
                    {detectedQueryType === 'invalid' && (
                      <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        {isEn ? 'Unrecognized Format' : 'فرمت نامعتبر یا ناقص'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Input row */}
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={queryInput}
                      onChange={(e) => setQueryInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleExecuteSearch();
                      }}
                      placeholder={
                        isEn
                          ? 'e.g. 0050.56a1.2234, 00:50:56:A1:22:34 or 192.168.1.100'
                          : 'مثال: 0050.56a1.2234 یا 00:50:56:A1:22:34 یا 192.168.1.100'
                      }
                      className={`w-full h-11 pl-4 pr-24 rounded-xl text-sm font-mono border transition-all outline-none ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'
                          : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'
                      }`}
                    />

                    {/* Inside-input Quick Actions */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {queryInput && (
                        <button
                          type="button"
                          onClick={() => setQueryInput('')}
                          className={`p-1 rounded-md text-xs cursor-pointer ${
                            isLightMode
                              ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                              : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
                          }`}
                          title={isEn ? 'Clear' : 'پاک کردن'}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handlePasteClipboard}
                        className={`p-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer transition-colors ${
                          isLightMode
                            ? 'text-slate-600 hover:text-cyan-600 hover:bg-slate-100'
                            : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800'
                        }`}
                        title={isEn ? 'Paste from clipboard' : 'چسباندن از کلیپ‌بورد'}
                      >
                        <ClipboardPaste className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Search Button */}
                  <button
                    type="button"
                    onClick={() => handleExecuteSearch()}
                    disabled={isSearching || !queryInput.trim()}
                    className={`h-11 px-5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                      isSearching || !queryInput.trim()
                        ? 'opacity-50 cursor-not-allowed bg-slate-700 text-slate-300'
                        : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-500/20 active:scale-[0.98]'
                    }`}
                  >
                    {isSearching ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>{isEn ? 'Tracing Network...' : 'در حال ردگیری...'}</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        <span>{isEn ? 'Trace Endpoint' : 'ردگیری پورت کلاینت'}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Live Force Toggle & Preset Chips */}
                <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-800/40">
                  {/* Preset Examples */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[11px] font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'Presets:' : 'نمونه‌های آماده:'}
                    </span>
                    {QUICK_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => {
                          setQueryInput(preset.value);
                          handleExecuteSearch(preset.value);
                        }}
                        className={`text-[11px] px-2 py-0.5 rounded-md font-mono transition-colors cursor-pointer border ${
                          isLightMode
                            ? 'bg-slate-100 hover:bg-cyan-50 text-slate-700 border-slate-200 hover:border-cyan-300'
                            : 'bg-slate-800/70 hover:bg-slate-800 text-slate-300 border-slate-700/60 hover:border-cyan-500/40'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Force live refresh checkbox */}
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
                      <input
                        type="checkbox"
                        checked={forceRefresh}
                        onChange={(e) => setForceRefresh(e.target.checked)}
                        className="rounded border-slate-700 text-cyan-600 focus:ring-cyan-500 h-3.5 w-3.5 cursor-pointer"
                      />
                      <span className={isLightMode ? 'text-slate-600' : 'text-slate-300'}>
                        {isEn ? 'Live Force Query (Bypass Cache)' : 'استعلام زنده مجدد از تجهیزات (دور زدن کش)'}
                      </span>
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'Live Force Refresh' : 'استعلام زنده مجدد'}
                      infoWhatEn="When unchecked, repeated queries within 60 seconds are served instantly from memory cache (< 20ms). Checking this forces real-time SSH polling on switches."
                      infoWhatFa="در صورت غیرفعال بودن، استعلام‌های مکرر در بازه ۶۰ ثانیه از کش پاسخ داده می‌شوند (زیر ۲۰ میلی‌ثانیه). با فعال‌سازی آن، دستور زنده SSH مستقیماً روی سوئیچ‌ها اجرا خواهد شد."
                      infoWhyEn="Ensures accurate real-time port status if an endpoint just moved or changed cables recently."
                      infoWhyFa="اگر دستگاه کلاینت به تازگی جابجا شده یا کابل آن تغییر کرده باشد، استعلام زنده آخرین وضعیت واقعی پورت را تضمین می‌کند."
                      infoExampleEn="Enable when troubleshooting an endpoint that was re-patched 10 seconds ago."
                      infoExampleFa="هنگامی که کابل دستگاه به تازگی به پورت دیگری وصل شده، این گزینه را فعال کنید."
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                </div>

                {/* Error Banner */}
                {searchError && (
                  <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                    <span>{searchError}</span>
                  </div>
                )}
              </div>

              {/* ------------------------------------------------------------- */}
              {/* Results Section                                               */}
              {/* ------------------------------------------------------------- */}
              {trackerResult && (
                <div className="space-y-5 animate-in fade-in duration-300">
                  {/* Results Header / Telemetry Bar */}
                  <div
                    className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border ${
                      isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1 font-mono font-medium">
                        <Activity className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{trackerResult.query}</span>
                      </span>
                      {trackerResult.normalizedMac && (
                        <span className={`text-[11px] font-mono ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          ({trackerResult.normalizedMac.standardUpper})
                        </span>
                      )}
                      {trackerResult.vendor && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {trackerResult.vendor.vendor}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-md ${
                          trackerResult.cached
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {trackerResult.cached
                          ? isEn
                            ? 'Memory Cached (<30ms)'
                            : 'پاسخ از کش سریع'
                          : isEn
                          ? 'Live Device Telemetry'
                          : 'استعلام زنده از تجهیزات'}
                      </span>
                      <span className={`text-[11px] font-mono ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {trackerResult.durationMs}ms
                      </span>
                      <span className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isEn
                          ? `${trackerResult.switchesScannedCount} switches examined`
                          : `${trackerResult.switchesScannedCount} سوئیچ بررسی شد`}
                      </span>
                    </div>
                  </div>

                  {/* --------------------------------------------------------- */}
                  {/* HERO EDGE PORT CARD: Final isolated physical client port  */}
                  {/* --------------------------------------------------------- */}
                  {trackerResult.finalEdgePort ? (
                    <div
                      className={`relative rounded-2xl p-5 border shadow-xl overflow-hidden transition-all ${
                        isLightMode
                          ? 'bg-gradient-to-br from-emerald-50/80 via-white to-cyan-50/50 border-emerald-300/80 shadow-emerald-500/5'
                          : 'bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/20 border-emerald-500/40 shadow-[0_10px_35px_rgba(16,185,129,0.12)]'
                      }`}
                    >
                      {/* Top Banner Tag */}
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase flex items-center gap-1.5 bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {isEn ? 'Final Physical Edge Port Isolated' : 'پورت نهایی فیزیکی کلاینت شناسایی شد'}
                          </span>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {isEn ? 'Verified Client Access' : 'اتصال مستقیم کابل کاربر'}
                          </span>
                        </div>

                        {/* Confidence score badge */}
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Correlation Confidence:' : 'درجه اطمینان همبستگی:'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                              trackerResult.edgeSummary.confidence === 'high'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-amber-500/20 text-amber-400'
                            }`}
                          >
                            {trackerResult.edgeSummary.confidence === 'high'
                              ? isEn
                                ? 'High (Edge Port Verified)'
                                : 'بالا (پورت اکسس تایید شده)'
                              : isEn
                              ? 'Medium (Probable Edge)'
                              : 'متوسط (پورت اکسس محتمل)'}
                          </span>
                        </div>
                      </div>

                      {/* Main Data Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        {/* 1. Target Switch Name & IP */}
                        <div
                          className={`p-3.5 rounded-xl border ${
                            isLightMode ? 'bg-white/80 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                          }`}
                        >
                          <span className={`text-[11px] block font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Access Switch Name' : 'نام سوئیچ اکسس'}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            <Server className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="text-sm font-bold tracking-tight truncate">
                              {trackerResult.finalEdgePort.switchName}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] font-mono text-slate-400">
                            <span>{trackerResult.finalEdgePort.switchIp}</span>
                            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-300">
                              {trackerResult.finalEdgePort.switchVendor}
                            </span>
                          </div>
                        </div>

                        {/* 2. Physical Port & VLAN */}
                        <div
                          className={`p-3.5 rounded-xl border ${
                            isLightMode ? 'bg-white/80 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                          }`}
                        >
                          <span className={`text-[11px] block font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Physical Switch Port' : 'پورت فیزیکی سوئیچ'}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            <Cable className="w-4 h-4 text-cyan-400 shrink-0" />
                            <span className="text-base font-extrabold text-cyan-400 font-mono">
                              {trackerResult.finalEdgePort.port}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">VLAN {trackerResult.finalEdgePort.vlan || '1'}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              LINK UP
                            </span>
                          </div>
                        </div>

                        {/* 3. Client MAC & Manufacturer */}
                        <div
                          className={`p-3.5 rounded-xl border ${
                            isLightMode ? 'bg-white/80 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                          }`}
                        >
                          <span className={`text-[11px] block font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Endpoint Hardware (OUI)' : 'سازنده کارت شبکه (OUI)'}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            <Cpu className="w-4 h-4 text-amber-400 shrink-0" />
                            <span className="text-xs font-bold text-amber-400 truncate">
                              {trackerResult.vendor.vendor}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] font-mono text-slate-400 truncate">
                            {trackerResult.normalizedMac?.standardUpper || trackerResult.resolvedMac || '-'}
                          </div>
                        </div>

                        {/* 4. Resolved IP / ARP Info */}
                        <div
                          className={`p-3.5 rounded-xl border ${
                            isLightMode ? 'bg-white/80 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                          }`}
                        >
                          <span className={`text-[11px] block font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isEn ? 'Resolved IP Address' : 'آدرس آی‌پی (از ARP)'}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="text-sm font-bold font-mono text-emerald-400 truncate">
                              {trackerResult.resolvedIp || (isEn ? 'ARP not cached' : 'در جدول ARP نیست')}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-slate-400 truncate">
                            {trackerResult.arpEntries.length > 0
                              ? isEn
                                ? `Bound via ${trackerResult.arpEntries[0].interface}`
                                : `ثبت شده روی ${trackerResult.arpEntries[0].interface}`
                              : isEn
                              ? 'Layer 2 CAM observation'
                              : 'مشاهده شده در لایه ۲'}
                          </div>
                        </div>
                      </div>

                      {/* Explanation & Filtered Uplinks Summary */}
                      <div
                        className={`p-3 rounded-xl mb-4 text-xs border ${
                          isLightMode ? 'bg-emerald-500/10 border-emerald-200 text-slate-700' : 'bg-emerald-950/20 border-emerald-500/20 text-emerald-200'
                        }`}
                      >
                        <p className="leading-relaxed">
                          {isEn ? trackerResult.edgeSummary.explanationEn : trackerResult.edgeSummary.explanationFa}
                        </p>
                        {trackerResult.edgeSummary.uplinksFilteredCount > 0 && (
                          <div className="mt-2 text-[11px] opacity-80 flex items-center gap-2">
                            <span className="font-semibold">
                              {isEn ? 'Transit Uplinks Filtered:' : 'پورتهای ترانک/آپلینک حذف‌شده:'}
                            </span>
                            <span>
                              {isEn
                                ? `${trackerResult.edgeSummary.uplinksFilteredCount} intermediate transit ports on upstream switches safely ignored.`
                                : `${trackerResult.edgeSummary.uplinksFilteredCount} پورت ترانک روی سوئیچ‌های بالادستی به طور هوشمند نادیده گرفته شدند.`}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Direct Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        {/* Terminal button */}
                        <button
                          type="button"
                          onClick={() => {
                            const dev = resolveDevice(
                              trackerResult.finalEdgePort?.switchId,
                              trackerResult.finalEdgePort?.switchName
                            );
                            if (dev && onOpenTerminal) {
                              onOpenTerminal(dev);
                            } else {
                              handleCopy(
                                `ssh admin@${trackerResult.finalEdgePort?.switchIp}`,
                                'ssh_cli'
                              );
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm cursor-pointer transition-colors"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                          <span>
                            {isEn
                              ? `Open Switch Terminal (${trackerResult.finalEdgePort.switchName})`
                              : `ترمینال سوئیچ (${trackerResult.finalEdgePort.switchName})`}
                          </span>
                        </button>

                        {/* Port Inspector Button */}
                        <button
                          type="button"
                          onClick={() => {
                            const dev = resolveDevice(
                              trackerResult.finalEdgePort?.switchId,
                              trackerResult.finalEdgePort?.switchName
                            );
                            if (dev && onOpenPortInspector) {
                              onOpenPortInspector(dev, trackerResult.finalEdgePort?.port);
                            } else {
                              handleCopy(
                                trackerResult.finalEdgePort?.port || '',
                                'port_copy'
                              );
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                            isLightMode
                              ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                          }`}
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                          <span>
                            {isEn
                              ? `Port Inspector (${trackerResult.finalEdgePort.port})`
                              : `بررسی جامع پورت (${trackerResult.finalEdgePort.port})`}
                          </span>
                        </button>

                        {/* Copy CLI Verification Command */}
                        <button
                          type="button"
                          onClick={() => {
                            const ciscoMac = trackerResult.normalizedMac?.cisco || trackerResult.query;
                            const cmd = `show mac address-table address ${ciscoMac}`;
                            handleCopy(cmd, 'cmd_copy');
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors cursor-pointer ${
                            isLightMode
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                          }`}
                        >
                          {copiedKey === 'cmd_copy' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">{isEn ? 'Copied CLI Command!' : 'دستور CLI کپی شد!'}</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span>{isEn ? 'Copy CLI Verification' : 'کپی دستور استعلام CLI'}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Not Found or No Edge Isolated Banner */
                    <div
                      className={`p-6 rounded-2xl border text-center ${
                        isLightMode
                          ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                          : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                      }`}
                    >
                      <ShieldAlert className="w-10 h-10 mx-auto text-amber-400 mb-2 opacity-80" />
                      <h4 className="text-sm font-bold">
                        {isEn ? 'No Active Edge Port Found in CAM/ARP Tables' : 'هیچ پورت اکسس فعالی برای این شناسه یافت نشد'}
                      </h4>
                      <p className="text-xs mt-1 max-w-lg mx-auto opacity-80">
                        {isEn
                          ? 'The MAC address or IP was not currently learned by any managed switches. Check if the device is turned on, link is UP, or send a ping to refresh ARP.'
                          : 'این مک‌آدرس یا آی‌پی در جدول MAC سوئیچ‌های متصل وجود ندارد. اطمینان حاصل کنید کابل کلاینت متصل و کارت شبکه روشن است، یا با ارسال پینگ جدول ARP را نوسازی کنید.'}
                      </p>
                    </div>
                  )}

                  {/* --------------------------------------------------------- */}
                  {/* SWITCH PATH HOP-BY-HOP DIAGRAM                            */}
                  {/* --------------------------------------------------------- */}
                  {trackerResult.pathHops && trackerResult.pathHops.length > 0 && (
                    <div
                      className={`p-5 rounded-2xl border ${
                        isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Network className="w-4 h-4 text-cyan-400" />
                          <h4 className="text-xs sm:text-sm font-bold tracking-wide">
                            {isEn ? 'Switch Path Hop-by-Hop Sequence' : 'مسیر هاپ‌به‌هاپ پکت در توپولوژی سوئیچ‌ها'}
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(trackerResult.pathDiagram, 'diagram_copy')}
                          className={`text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-colors border ${
                            isLightMode
                              ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-600'
                              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                          }`}
                        >
                          {copiedKey === 'diagram_copy' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">{isEn ? 'Copied' : 'کپی شد'}</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span>{isEn ? 'Copy Path' : 'کپی نمودار'}</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Visual Hop Pipeline */}
                      <div className="flex items-center gap-2 overflow-x-auto pb-3 pt-1">
                        {trackerResult.pathHops.map((hop, idx) => {
                          const isLastHop = idx === trackerResult.pathHops.length - 1;
                          return (
                            <React.Fragment key={hop.hopNumber}>
                              <div
                                className={`shrink-0 p-3 rounded-xl border flex flex-col min-w-[170px] max-w-[210px] transition-all ${
                                  hop.isEdge
                                    ? isLightMode
                                      ? 'bg-emerald-50 border-emerald-300 shadow-sm'
                                      : 'bg-emerald-950/30 border-emerald-500/50 shadow-md shadow-emerald-500/10'
                                    : isLightMode
                                    ? 'bg-white border-slate-200'
                                    : 'bg-slate-950 border-slate-800'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1 mb-1.5">
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-cyan-400">
                                    Hop #{hop.hopNumber}
                                  </span>
                                  {hop.isEdge ? (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                                      EDGE
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                      UPLINK
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <Server className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                  <span className="text-xs font-bold truncate">{hop.switchName}</span>
                                </div>

                                <div className="mt-1 flex items-center justify-between text-[11px] font-mono text-slate-400">
                                  <span className="text-cyan-400 font-semibold">{hop.port}</span>
                                  <span>VLAN {hop.vlan}</span>
                                </div>

                                {hop.switchRole && (
                                  <span className="mt-1 text-[10px] text-slate-500 truncate">
                                    {hop.switchRole}
                                  </span>
                                )}
                              </div>

                              {/* Arrow connector */}
                              {!isLastHop && (
                                <div className="shrink-0 flex items-center text-slate-600 px-1">
                                  <ArrowRight className="w-4 h-4 text-cyan-500" />
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}

                        {/* Final Endpoint Node */}
                        <div className="shrink-0 flex items-center text-slate-600 px-1">
                          <ArrowRight className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div
                          className={`shrink-0 p-3 rounded-xl border flex flex-col min-w-[170px] max-w-[210px] ${
                            isLightMode ? 'bg-emerald-50 border-emerald-300' : 'bg-emerald-950/40 border-emerald-500/60'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950">
                              ENDPOINT
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Laptop className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="text-xs font-bold truncate">
                              {trackerResult.vendor.vendor}
                            </span>
                          </div>
                          <span className="mt-1 text-[11px] font-mono text-slate-400 truncate">
                            {trackerResult.normalizedMac?.standardUpper || trackerResult.resolvedMac}
                          </span>
                        </div>
                      </div>

                      {/* Raw Diagram Line */}
                      <div
                        className={`mt-3 p-2.5 rounded-lg font-mono text-xs overflow-x-auto border ${
                          isLightMode ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-cyan-300'
                        }`}
                      >
                        {trackerResult.pathDiagram}
                      </div>
                    </div>
                  )}

                  {/* --------------------------------------------------------- */}
                  {/* DETAILED OBSERVATIONS TABLE (CAM & ARP)                   */}
                  {/* --------------------------------------------------------- */}
                  <div
                    className={`rounded-2xl border overflow-hidden ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    <div
                      className={`px-4 py-3 border-b flex items-center justify-between ${
                        isLightMode ? 'bg-slate-50 border-slate-100' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-cyan-400" />
                        <h4 className="text-xs sm:text-sm font-bold">
                          {isEn ? 'All CAM Table Observations Across Switches' : 'تمامی مشاهدات جدول مک (CAM) در شبکه'}
                        </h4>
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-slate-800 text-slate-300">
                          {trackerResult.camEntries.length}
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead
                          className={`border-b ${
                            isLightMode ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-slate-900 text-slate-400 border-slate-800'
                          }`}
                        >
                          <tr>
                            <th className="py-2.5 px-4 font-semibold">{isEn ? 'Switch' : 'سوئیچ'}</th>
                            <th className="py-2.5 px-4 font-semibold">{isEn ? 'Port' : 'پورت'}</th>
                            <th className="py-2.5 px-4 font-semibold">{isEn ? 'VLAN' : 'VLAN'}</th>
                            <th className="py-2.5 px-4 font-semibold">{isEn ? 'Type' : 'نوع'}</th>
                            <th className="py-2.5 px-4 font-semibold">{isEn ? 'Classification' : 'تحلیل پورت'}</th>
                            <th className="py-2.5 px-4 font-semibold">{isEn ? 'Details / Peer' : 'دستگاه متصل'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {trackerResult.camEntries.map((cam, idx) => (
                            <tr
                              key={`${cam.switchId}-${cam.port}-${idx}`}
                              className={`transition-colors ${
                                cam.isFinalEdgePort
                                  ? isLightMode
                                    ? 'bg-emerald-50/70 font-medium'
                                    : 'bg-emerald-950/20 font-medium'
                                  : isLightMode
                                  ? 'hover:bg-slate-50'
                                  : 'hover:bg-slate-900/40'
                              }`}
                            >
                              <td className="py-2.5 px-4">
                                <div className="font-semibold">{cam.switchName}</div>
                                <div className="text-[11px] font-mono text-slate-400">{cam.switchIp}</div>
                              </td>
                              <td className="py-2.5 px-4 font-mono font-bold text-cyan-400">
                                {cam.port}
                              </td>
                              <td className="py-2.5 px-4 font-mono">{cam.vlan}</td>
                              <td className="py-2.5 px-4 text-[11px] uppercase text-slate-400">{cam.type}</td>
                              <td className="py-2.5 px-4">
                                {cam.isFinalEdgePort ? (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    {isEn ? 'Access / Final Edge' : 'پورت نهایی اکسس'}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                    {isEn ? 'Transit Uplink' : 'آپلینک ترانک'}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-xs text-slate-400">
                                {cam.peerDeviceName ? (
                                  <span className="flex items-center gap-1 text-slate-300">
                                    <Server className="w-3 h-3 text-cyan-400" />
                                    <span>{cam.peerDeviceName} ({cam.peerPort || 'link'})</span>
                                  </span>
                                ) : cam.isFinalEdgePort ? (
                                  <span className="text-emerald-400 font-medium">
                                    {isEn ? 'Client Workstation / Server' : 'ورک‌استیشن یا سرور کاربر'}
                                  </span>
                                ) : (
                                  <span>{cam.uplinkReason || '-'}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* =============================================================== */
            /* AUDIT SEARCH HISTORY TAB                                        */
            /* =============================================================== */
            <div className="space-y-4 animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-cyan-400" />
                  <div>
                    <h4 className="text-sm font-bold">
                      {isEn ? 'Audit Search History (PostgreSQL)' : 'تاریخچه جستجوهای پرتال (ذخیره‌شده در PostgreSQL)'}
                    </h4>
                    <p className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn
                        ? 'Immutable security audit trail of all MAC & IP traces executed by portal administrators'
                        : 'لاگ امنیتی غیرقابل تغییر کلیه جستجوهای مک و آی‌پی اجراشده توسط اپراتورها در پرتال'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={historyFilter}
                    onChange={(e) => setHistoryFilter(e.target.value)}
                    placeholder={isEn ? 'Filter history records...' : 'فیلتر تاریخچه...'}
                    className={`h-9 px-3 rounded-lg text-xs border outline-none font-mono ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-cyan-500'
                        : 'bg-slate-900 border-slate-700 text-slate-100 focus:border-cyan-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={fetchAuditHistory}
                    disabled={isLoadingHistory}
                    className={`h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                      isLightMode
                        ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                    <span>{isEn ? 'Refresh' : 'تازه‌سازی'}</span>
                  </button>
                </div>
              </div>

              {/* History Table */}
              <div
                className={`rounded-2xl border overflow-hidden ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead
                      className={`border-b ${
                        isLightMode ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">{isEn ? 'Timestamp' : 'زمان'}</th>
                        <th className="py-2.5 px-4 font-semibold">{isEn ? 'Operator' : 'کاربر'}</th>
                        <th className="py-2.5 px-4 font-semibold">{isEn ? 'Query Target' : 'مقدار استعلام'}</th>
                        <th className="py-2.5 px-4 font-semibold">{isEn ? 'Resolved Port' : 'پورت کشف‌شده'}</th>
                        <th className="py-2.5 px-4 font-semibold">{isEn ? 'Vendor' : 'سازنده'}</th>
                        <th className="py-2.5 px-4 font-semibold">{isEn ? 'Status' : 'وضعیت'}</th>
                        <th className="py-2.5 px-4 text-right font-semibold">{isEn ? 'Action' : 'عملیات'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {filteredHistory.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500">
                            {isLoadingHistory
                              ? isEn
                                ? 'Loading audit records...'
                                : 'در حال بارگذاری سوابق...'
                              : isEn
                              ? 'No search history records found.'
                              : 'هیچ سابقه‌ای در لاگ ممیزی ثبت نشده است.'}
                          </td>
                        </tr>
                      ) : (
                        filteredHistory.map((item) => (
                          <tr
                            key={item.id}
                            className={`transition-colors ${
                              isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-900/40'
                            }`}
                          >
                            <td className="py-2.5 px-4 text-[11px] font-mono text-slate-400">
                              {new Date(item.timestamp).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-4 font-medium text-slate-300">
                              {item.userName}
                            </td>
                            <td className="py-2.5 px-4 font-mono font-bold text-cyan-400">
                              {item.target}
                            </td>
                            <td className="py-2.5 px-4 text-xs font-mono">
                              {item.finalPort ? (
                                <span className="text-emerald-400 font-semibold">{item.finalPort}</span>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-xs text-slate-400">
                              {item.vendor || '-'}
                            </td>
                            <td className="py-2.5 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  item.status === 'success'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                }`}
                              >
                                {item.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setQueryInput(item.target);
                                  handleExecuteSearch(item.target);
                                }}
                                className="px-2.5 py-1 rounded-md text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer transition-colors shadow-sm"
                              >
                                {isEn ? 'Trace Again' : 'ردگیری مجدد'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* Modal Footer (Maintains Universal bottom-8 clearance)              */}
        {/* ================================================================= */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-2.5 border-t shrink-0 text-xs ${
            isLightMode ? 'border-slate-100 bg-slate-50/90 text-slate-500' : 'border-slate-800/80 bg-slate-900/80 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>
              {isEn
                ? 'CAM/ARP Correlation Engine Active'
                : 'موتور همبستگی CAM و ARP آماده به کار'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span>
              {isEn
                ? 'Footer Clearance: 32px (bottom-8) Protected'
                : 'حفظ حریم فوتر تا ۳۲ پیکسل (bottom-8)'}
            </span>
            <button
              onClick={onClose}
              className={`px-3 py-1 rounded-lg font-medium cursor-pointer transition-colors ${
                isLightMode ? 'hover:bg-slate-200 text-slate-700' : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              {isEn ? 'Close' : 'بستن'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
