import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Network,
  RefreshCw,
  Server,
  Layers,
  Shield,
  ShieldAlert,
  AlertTriangle,
  Compass,
  ArrowDownCircle,
  ArrowUpCircle,
  Edit3,
  Search,
  CheckCircle2,
  XCircle,
  Globe,
  Radio,
  Sliders,
  RotateCw,
  RotateCcw,
  Power,
  PowerOff,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Check,
} from 'lucide-react';
import {
  RemoteServer,
  LinuxNetworkInterfaceDetail,
  LinuxNetworkStackInfo,
  LinuxNetworkInterfaceType,
} from '../../types';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { restartLinuxNetworkService, setLinuxInterfaceState } from '../../services/api';

interface LinuxNetworkInterfacesTabProps {
  server: RemoteServer;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
  networkStackInfo: LinuxNetworkStackInfo | null;
  interfaces: LinuxNetworkInterfaceDetail[];
  loading: boolean;
  onRefresh: () => void;
  onConfigureInterface: (iface: LinuxNetworkInterfaceDetail) => void;
  onBringDownInterface?: (iface: LinuxNetworkInterfaceDetail) => void;
  onBringUpInterface?: (iface: LinuxNetworkInterfaceDetail) => void;
  onRestartNetworkService?: () => void;
}

export const LinuxNetworkInterfacesTab: React.FC<LinuxNetworkInterfacesTabProps> = ({
  server,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
  networkStackInfo,
  interfaces,
  loading,
  onRefresh,
  onConfigureInterface,
}) => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  // Confirmation Modals State
  const [restartModalOpen, setRestartModalOpen] = useState(false);
  const [restartingService, setRestartingService] = useState(false);

  const [bringDownTarget, setBringDownTarget] = useState<LinuxNetworkInterfaceDetail | null>(null);
  const [bringingDown, setBringingDown] = useState(false);
  const [downRiskAcknowledged, setDownRiskAcknowledged] = useState(false);

  const [togglingUpName, setTogglingUpName] = useState<string | null>(null);
  const [actionNotification, setActionNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const filteredInterfaces = useMemo(() => {
    return interfaces.filter((iface) => {
      // Type filter
      if (filterType === 'up' && iface.state !== 'UP') return false;
      if (filterType === 'down' && iface.state !== 'DOWN') return false;
      if (filterType === 'physical' && iface.type !== 'physical') return false;
      if (filterType === 'virtual' && iface.type === 'physical') return false;

      // Text search
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        iface.name.toLowerCase().includes(q) ||
        (iface.ipv4 && iface.ipv4.includes(q)) ||
        (iface.ipv6 && iface.ipv6.toLowerCase().includes(q)) ||
        (iface.mac && iface.mac.toLowerCase().includes(q)) ||
        (iface.type && iface.type.toLowerCase().includes(q)) ||
        (iface.driver && iface.driver.toLowerCase().includes(q))
      );
    });
  }, [interfaces, search, filterType]);

  const getStackBadgeColor = (stack?: string) => {
    switch (stack) {
      case 'networkmanager':
        return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
      case 'netplan':
        return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
      case 'systemd-networkd':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'ifupdown':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'network-scripts':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      default:
        return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
    }
  };

  const getStackDisplayName = (stack?: string) => {
    switch (stack) {
      case 'networkmanager':
        return 'NetworkManager (nmcli)';
      case 'netplan':
        return 'Netplan (YAML)';
      case 'systemd-networkd':
        return 'systemd-networkd';
      case 'ifupdown':
        return 'Debian ifupdown (/etc/network/interfaces)';
      case 'network-scripts':
        return 'RHEL legacy network-scripts';
      case 'wicked':
        return 'SUSE Wicked';
      case 'ip-fallback':
        return 'Runtime iproute2 (Dynamic)';
      default:
        return stack || 'Standard Linux Networking';
    }
  };

  const getTypeIcon = (type?: LinuxNetworkInterfaceType) => {
    switch (type) {
      case 'physical':
        return <Server className="w-4 h-4 text-blue-400" />;
      case 'virtual':
        return <Layers className="w-4 h-4 text-indigo-400" />;
      case 'bridge':
        return <Network className="w-4 h-4 text-purple-400" />;
      case 'bond':
        return <Sliders className="w-4 h-4 text-violet-400" />;
      case 'loopback':
        return <RotateCw className="w-4 h-4 text-slate-400" />;
      default:
        return <Radio className="w-4 h-4 text-cyan-400" />;
    }
  };

  // Handler: Real Network Service Restart
  const handleExecuteRestartService = async () => {
    setRestartingService(true);
    setActionNotification(null);
    try {
      const res = await restartLinuxNetworkService(server.id, ephemeralPassword);
      if (res.success) {
        setActionNotification({
          type: 'success',
          message:
            res.message ||
            (isEn
              ? `Successfully restarted ${res.serviceRestarted || 'network service'}.`
              : `سرویس شبکه ${res.serviceRestarted || ''} با موفقیت راه‌اندازی مجدد شد.`),
        });
        setRestartModalOpen(false);
        onRefresh();
      } else {
        setActionNotification({
          type: 'error',
          message: res.message || res.error || (isEn ? 'Failed to restart network service' : 'خطا در ری‌استارت سرویس شبکه'),
        });
      }
    } catch (err: any) {
      setActionNotification({
        type: 'error',
        message: err.message || (isEn ? 'Network error during service restart' : 'خطای ارتباط در ری‌استارت سرویس شبکه'),
      });
    } finally {
      setRestartingService(false);
    }
  };

  // Handler: Bring Interface Down
  const handleExecuteBringDown = async () => {
    if (!bringDownTarget) return;
    setBringingDown(true);
    setActionNotification(null);
    try {
      const res = await setLinuxInterfaceState(server.id, bringDownTarget.name, 'DOWN', ephemeralPassword);
      if (res.success) {
        setActionNotification({
          type: 'success',
          message:
            res.message ||
            (isEn
              ? `Interface ${bringDownTarget.name} brought DOWN successfully.`
              : `کارت شبکه ${bringDownTarget.name} با موفقیت غیرفعال (DOWN) شد.`),
        });
        setBringDownTarget(null);
        setDownRiskAcknowledged(false);
        onRefresh();
      } else {
        setActionNotification({
          type: 'error',
          message: res.message || res.error || (isEn ? 'Failed to bring down interface' : 'خطا در غیرفعال‌سازی کارت شبکه'),
        });
      }
    } catch (err: any) {
      setActionNotification({
        type: 'error',
        message: err.message || (isEn ? 'Network error setting interface down' : 'خطای ارتباط در غیرفعال‌سازی اینترفیس'),
      });
    } finally {
      setBringingDown(false);
    }
  };

  // Handler: Bring Interface UP
  const handleExecuteBringUp = async (iface: LinuxNetworkInterfaceDetail) => {
    setTogglingUpName(iface.name);
    setActionNotification(null);
    try {
      const res = await setLinuxInterfaceState(server.id, iface.name, 'UP', ephemeralPassword);
      if (res.success) {
        setActionNotification({
          type: 'success',
          message:
            res.message ||
            (isEn
              ? `Interface ${iface.name} brought UP successfully.`
              : `کارت شبکه ${iface.name} با موفقیت فعال (UP) شد.`),
        });
        onRefresh();
      } else {
        setActionNotification({
          type: 'error',
          message: res.message || res.error || (isEn ? 'Failed to bring up interface' : 'خطا در فعال‌سازی کارت شبکه'),
        });
      }
    } catch (err: any) {
      setActionNotification({
        type: 'error',
        message: err.message || (isEn ? 'Network error setting interface up' : 'خطای ارتباط در فعال‌سازی اینترفیس'),
      });
    } finally {
      setTogglingUpName(null);
    }
  };

  return (
    <div className="space-y-4" dir={isEn ? 'ltr' : 'rtl'}>
      {/* Action Notification Toast */}
      {actionNotification && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            actionNotification.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionNotification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-mono">{actionNotification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotification(null)}
            className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Linux Distribution & Network Stack Overview Card */}
      {networkStackInfo && (
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isLightMode
              ? 'bg-gradient-to-r from-blue-50/50 via-slate-50 to-indigo-50/50 border-slate-200'
              : 'bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-950 border-slate-800'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold">
                    {networkStackInfo.distroName || 'Linux Server'}
                  </h3>
                  {networkStackInfo.distroVersion && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-500/15 text-slate-300 border border-slate-500/20">
                      v{networkStackInfo.distroVersion}
                    </span>
                  )}
                  <span
                    className={`text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-md border ${getStackBadgeColor(
                      networkStackInfo.activeStack
                    )}`}
                  >
                    {getStackDisplayName(networkStackInfo.activeStack)}
                  </span>
                  <FieldInfoTooltip
                    title={isEn ? 'Distribution Network Stack' : 'سیستم مدیریت شبکه لینوکس'}
                    infoWhatEn="Displays the detected Linux distribution and its active network manager (e.g. NetworkManager, Netplan, systemd-networkd, or ifupdown)."
                    infoWhatFa="نمایش توزیع شناسایی‌شده لینوکس و ابزار فعال مدیریت شبکه (مانند NetworkManager، Netplan، systemd-networkd یا ifupdown)."
                    infoWhyEn="Ensures configuration changes are written using the exact native syntax and service management of this specific Linux system without breaking network persistence."
                    infoWhyFa="اطمینان حاصل می‌کند که تغییرات دقیقا مطابق ساختار استاندارد این توزیع ثبت شوند تا پس از ریبوت پایدار بمانند."
                    infoExampleEn="Ubuntu 22.04 with Netplan, RHEL 9 with NetworkManager, or Debian 12 with ifupdown."
                    infoExampleFa="اوبونتو ۲۲.۰۴ با Netplan، رکی لینوکس با NetworkManager یا دبیان با ifupdown."
                  />
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                  <span>
                    {isEn ? 'Init System:' : 'سیستم Init:'}{' '}
                    <strong className="text-slate-300 font-mono">
                      {networkStackInfo.initSystem || 'systemd'}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    {isEn ? 'Active Service:' : 'سرویس فعال:'}{' '}
                    <strong className="text-cyan-400 font-mono">
                      {networkStackInfo.activeService}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    {isEn ? 'DNS Manager:' : 'مدیر DNS:'}{' '}
                    <strong className="text-purple-400 font-mono">
                      {networkStackInfo.dnsManager}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Quick overview of default gateway, DNS, and Restart Service button */}
            <div className="flex items-center gap-2 flex-wrap">
              {networkStackInfo.defaultGateway && (
                <div
                  className={`px-3 py-1.5 rounded-xl border text-xs font-mono flex items-center gap-1.5 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-slate-400">{isEn ? 'Gateway:' : 'گیت‌وی:'}</span>
                  <span className="font-bold text-slate-200">{networkStackInfo.defaultGateway}</span>
                  {networkStackInfo.defaultInterface && (
                    <span className="text-[10px] text-cyan-400">({networkStackInfo.defaultInterface})</span>
                  )}
                </div>
              )}

              {networkStackInfo.effectiveDns && networkStackInfo.effectiveDns.length > 0 && (
                <div
                  className={`px-3 py-1.5 rounded-xl border text-xs font-mono flex items-center gap-1.5 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-slate-400">{isEn ? 'DNS:' : 'دی‌ان‌اس:'}</span>
                  <span className="font-bold text-slate-200">
                    {networkStackInfo.effectiveDns.slice(0, 2).join(', ')}
                    {networkStackInfo.effectiveDns.length > 2 ? ` (+${networkStackInfo.effectiveDns.length - 2})` : ''}
                  </span>
                </div>
              )}

              {/* Restart Network Service Action Button */}
              <button
                type="button"
                onClick={() => setRestartModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                title={isEn ? 'Restart Network Service' : 'راه‌اندازی مجدد سرویس شبکه'}
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>{isEn ? 'Restart Network Service' : 'ری‌استارت سرویس شبکه'}</span>
              </button>
            </div>
          </div>

          {/* Management Interface Warning Banner */}
          {networkStackInfo.managementInterface && (
            <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-amber-300">
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  {isEn
                    ? `Current SSH management session is routed through interface ${networkStackInfo.managementInterface}${
                        networkStackInfo.managementClientIp ? ` from ${networkStackInfo.managementClientIp}` : ''
                      }. Changing IP or bringing down this interface will interrupt your active connection.`
                    : `نشست فعال SSH مدیریت سرور از طریق کارت شبکه ${networkStackInfo.managementInterface}${
                        networkStackInfo.managementClientIp ? ` از مبدا ${networkStackInfo.managementClientIp}` : ''
                      } برقرار است. تغییر IP یا غیرفعال‌سازی این اینترفیس نشست را قطع خواهد کرد.`}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold bg-amber-500/20 text-amber-300 shrink-0">
                {isEn ? 'Live SSH Path' : 'مسیر لایو SSH'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 2. Controls & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isEn ? 'Search interface, IP, MAC, driver...' : 'جستجوی اینترفیس، IP، مک، درایور...'}
              className={`pl-9 pr-3 py-1.5 text-xs rounded-xl border transition-colors outline-none w-64 ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                  : 'bg-slate-900/80 border-slate-800 text-white focus:border-cyan-500/50'
              }`}
            />
          </div>

          <div className="flex items-center gap-1 p-0.5 rounded-xl border border-slate-800 bg-slate-900/60 text-xs">
            {(['all', 'up', 'down', 'physical', 'virtual'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilterType(t)}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer capitalize ${
                  filterType === t
                    ? 'bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t === 'all'
                  ? isEn
                    ? 'All'
                    : 'همه'
                  : t === 'up'
                  ? 'UP'
                  : t === 'down'
                  ? 'DOWN'
                  : t === 'physical'
                  ? isEn
                    ? 'Physical'
                    : 'فیزیکی'
                  : isEn
                  ? 'Virtual'
                  : 'مجازی'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">
            {filteredInterfaces.length} {isEn ? 'Interfaces' : 'اینترفیس'}
          </span>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
              isLightMode
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{isEn ? 'Refresh' : 'تازه‌سازی'}</span>
          </button>
        </div>
      </div>

      {/* 3. Interface Cards Grid */}
      {filteredInterfaces.length === 0 ? (
        <div
          className={`p-10 rounded-2xl border text-center ${
            isLightMode ? 'bg-white border-slate-200 text-slate-500' : 'bg-slate-950 border-slate-800 text-slate-400'
          }`}
        >
          <Network className="w-10 h-10 mx-auto mb-2 text-slate-500 opacity-40" />
          <p className="text-sm font-bold">
            {isEn ? 'No network interfaces found matching your criteria.' : 'هیچ کارت شبکه‌ای مطابق با فیلتر یافت نشد.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredInterfaces.map((iface) => {
            const isUp = iface.state === 'UP';
            const hasCarrier = iface.linkState === 'carrier';
            const isMgmt = iface.isManagement || networkStackInfo?.managementInterface === iface.name;
            const isDefRoute = iface.isDefaultRoute || networkStackInfo?.defaultInterface === iface.name;
            const isTogglingUp = togglingUpName === iface.name;

            return (
              <div
                key={iface.name}
                className={`p-4 rounded-2xl border space-y-3 transition-all ${
                  isMgmt
                    ? isLightMode
                      ? 'bg-amber-50/30 border-amber-300 shadow-sm'
                      : 'bg-slate-900/80 border-amber-500/40 shadow-sm shadow-amber-500/5'
                    : isLightMode
                    ? 'bg-white border-slate-200 shadow-sm'
                    : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                {/* Interface Header */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
                      {getTypeIcon(iface.type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold font-mono">{iface.name}</span>
                        {isMgmt && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            <span>{isEn ? 'SSH Session' : 'نشست SSH'}</span>
                          </span>
                        )}
                        {isDefRoute && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                            <Compass className="w-3 h-3" />
                            <span>{isEn ? 'Default Route' : 'مسیر پیش‌فرض'}</span>
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono block">
                        MAC: {iface.mac || 'N/A'} {iface.driver ? `• Driver: ${iface.driver}` : ''}
                      </span>
                    </div>
                  </div>

                  {/* Status Badges & Action Buttons */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                        isUp
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {isUp ? 'UP' : 'DOWN'}
                    </span>

                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                        hasCarrier
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                      }`}
                    >
                      {hasCarrier ? (isEn ? 'CARRIER' : 'سیگنال وصل') : (isEn ? 'NO CARRIER' : 'بدون سیگنال')}
                    </span>

                    {/* Bring UP or DOWN Button */}
                    {isUp ? (
                      <button
                        type="button"
                        onClick={() => {
                          setBringDownTarget(iface);
                          setDownRiskAcknowledged(false);
                        }}
                        className="p-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-xs transition cursor-pointer flex items-center gap-1"
                        title={isEn ? 'Bring Interface DOWN' : 'غیرفعال‌سازی (DOWN)'}
                      >
                        <PowerOff className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline font-bold">DOWN</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleExecuteBringUp(iface)}
                        disabled={isTogglingUp}
                        className="p-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                        title={isEn ? 'Bring Interface UP' : 'فعال‌سازی (UP)'}
                      >
                        <Power className={`w-3.5 h-3.5 ${isTogglingUp ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline font-bold">{isEn ? 'UP' : 'فعال'}</span>
                      </button>
                    )}

                    {/* Configure Button */}
                    <button
                      type="button"
                      onClick={() => onConfigureInterface(iface)}
                      className="px-2.5 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/30 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Configure' : 'پیکربندی'}</span>
                    </button>
                  </div>
                </div>

                {/* Network IP & Properties Grid */}
                <div
                  className={`grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl border text-xs font-mono ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
                  }`}
                >
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">{isEn ? 'IPv4 Address' : 'آدرس IPv4'}</span>
                    <span className="font-bold text-slate-200 block truncate mt-0.5">
                      {iface.ipv4 ? `${iface.ipv4}/${iface.cidr || 24}` : isEn ? 'Unassigned' : 'بدون IP'}
                    </span>
                    <span
                      className={`text-[9px] font-mono px-1 rounded uppercase font-bold inline-block mt-0.5 ${
                        iface.ipMode === 'dhcp'
                          ? 'bg-cyan-500/20 text-cyan-400'
                          : iface.ipMode === 'static'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-slate-500/20 text-slate-400'
                      }`}
                    >
                      {iface.ipMode || 'unconfigured'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">{isEn ? 'Gateway' : 'گیت‌وی'}</span>
                    <span className="font-bold text-slate-200 block truncate mt-0.5">
                      {iface.gateway || '—'}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      MTU: <strong className="text-slate-300">{iface.mtu || 1500}</strong>
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">{isEn ? 'IPv6' : 'آدرس IPv6'}</span>
                    <span className="font-bold text-slate-200 block truncate mt-0.5" title={iface.ipv6 || 'None'}>
                      {iface.ipv6 ? iface.ipv6.slice(0, 16) + '...' : '—'}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {isEn ? 'Type:' : 'نوع:'} <strong className="text-slate-300 capitalize">{iface.type || 'net'}</strong>
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">{isEn ? 'Link Speed' : 'سرعت لینک'}</span>
                    <span className="font-bold text-slate-200 block truncate mt-0.5">
                      {iface.speed || (hasCarrier ? 'Auto' : 'Down')}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {iface.duplex ? `${iface.duplex} duplex` : '—'}
                    </span>
                  </div>
                </div>

                {/* Real Traffic Statistics from /proc/net/dev */}
                <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                  <div
                    className={`p-2.5 rounded-xl border ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span className="flex items-center gap-1 text-emerald-400 font-bold">
                        <ArrowDownCircle className="w-3 h-3" />
                        {isEn ? 'Received (RX)' : 'دریافتی (RX)'}
                      </span>
                      <span>{(iface.rxPackets || 0).toLocaleString()} pkts</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-emerald-400">{formatBytes(iface.rxBytes)}</span>
                      {(iface.rxErrors ?? 0) > 0 && (
                        <span className="text-[10px] font-bold text-rose-400 bg-rose-500/15 px-1.5 py-0.5 rounded">
                          {iface.rxErrors} errs
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    className={`p-2.5 rounded-xl border ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span className="flex items-center gap-1 text-cyan-400 font-bold">
                        <ArrowUpCircle className="w-3 h-3" />
                        {isEn ? 'Transmitted (TX)' : 'ارسالی (TX)'}
                      </span>
                      <span>{(iface.txPackets || 0).toLocaleString()} pkts</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-cyan-400">{formatBytes(iface.txBytes)}</span>
                      {(iface.txErrors ?? 0) > 0 && (
                        <span className="text-[10px] font-bold text-rose-400 bg-rose-500/15 px-1.5 py-0.5 rounded">
                          {iface.txErrors} errs
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CONFIRMATION MODAL 1: RESTART NETWORK SERVICE */}
      {restartModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            dir={isEn ? 'ltr' : 'rtl'}
          >
            <div
              className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
                isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            >
              {/* Header */}
              <div
                className={`flex items-center justify-between px-5 py-4 border-b ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20">
                    <RotateCcw className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">
                      {isEn ? 'Restart Network Service?' : 'راه‌اندازی مجدد سرویس شبکه؟'}
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      {networkStackInfo?.activeService ? `Service: ${networkStackInfo.activeService}` : 'Linux Networking'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRestartModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-3 text-xs">
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-amber-200/90 leading-relaxed">
                    <p className="font-bold text-amber-300">
                      {isEn
                        ? 'Restarting the network service may temporarily interrupt the connection to this server.'
                        : 'راه‌اندازی مجدد سرویس شبکه ممکن است ارتباط شما با این سرور را به طور موقت قطع کند.'}
                    </p>
                    <p className="text-[11px]">
                      {isEn
                        ? `The backend will execute a graceful restart of ${
                            networkStackInfo?.activeService || 'the active network daemon'
                          } on ${server.name || server.ip}.`
                        : `سامانه دستور ری‌استارت سرویس ${
                            networkStackInfo?.activeService || 'شبکه'
                          } را با در نظر گرفتن پایداری کانکشن اجرا خواهد نمود.`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setRestartModalOpen(false)}
                  disabled={restartingService}
                  className={`px-4 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    isLightMode ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="button"
                  onClick={handleExecuteRestartService}
                  disabled={restartingService}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <RotateCcw className={`w-4 h-4 ${restartingService ? 'animate-spin' : ''}`} />
                  <span>
                    {restartingService
                      ? isEn
                        ? 'Restarting...'
                        : 'در حال راه‌اندازی مجدد...'
                      : isEn
                      ? 'Confirm & Restart'
                      : 'تایید و ری‌استارت سرویس'}
                  </span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* CONFIRMATION MODAL 2: BRING INTERFACE DOWN */}
      {bringDownTarget &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            dir={isEn ? 'ltr' : 'rtl'}
          >
            <div
              className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
                isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            >
              {/* Header */}
              <div
                className={`flex items-center justify-between px-5 py-4 border-b ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/20">
                    <PowerOff className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">
                      {isEn
                        ? `Bring Interface DOWN (${bringDownTarget.name})?`
                        : `غیرفعال‌سازی کارت شبکه (${bringDownTarget.name})؟`}
                    </h3>
                    <span className="text-[11px] text-slate-400 font-mono">
                      MAC: {bringDownTarget.mac || 'N/A'} • IP:{' '}
                      {bringDownTarget.ipv4 ? `${bringDownTarget.ipv4}/${bringDownTarget.cidr || 24}` : 'None'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBringDownTarget(null);
                    setDownRiskAcknowledged(false);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-3 text-xs">
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-rose-200/90 leading-relaxed">
                    <p className="font-bold text-rose-300">
                      {isEn
                        ? 'Warning: Bringing this interface down may disconnect the server and terminate the current management connection.'
                        : 'هشدار: غیرفعال کردن این اینترفیس ممکن است اتصال سرور را قطع کرده و نشست مدیریت فعلی را لغو نماید.'}
                    </p>
                    <p className="text-[11px]">
                      {isEn
                        ? `Administrative shutdown of ${bringDownTarget.name} will drop all active traffic on this physical/virtual link.`
                        : `خاموش کردن ${bringDownTarget.name} کلیه ترافیک عبوری از این پورت را متوقف خواهد کرد.`}
                    </p>
                  </div>
                </div>

                {/* If Management Interface */}
                {(bringDownTarget.isManagement ||
                  networkStackInfo?.managementInterface === bringDownTarget.name) && (
                  <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/35 space-y-2">
                    <div className="flex items-center gap-2 text-amber-300 font-bold">
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                      <span>{isEn ? 'CRITICAL MANAGEMENT WARNING' : 'هشدار حیاتی مسیر مدیریت'}</span>
                    </div>
                    <p className="text-[11px] text-amber-200 leading-relaxed">
                      {isEn
                        ? `You are connected via ${bringDownTarget.name}. Bringing this interface DOWN WILL instantly terminate your SSH connection!`
                        : `شما دقیقا از طریق همین پورت ${bringDownTarget.name} متصل هستید. با غیرفعال‌سازی آن، نشست SSH شما بدون درنگ قطع خواهد شد!`}
                    </p>
                    <label className="flex items-center gap-2 pt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={downRiskAcknowledged}
                        onChange={(e) => setDownRiskAcknowledged(e.target.checked)}
                        className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 border-amber-400 bg-slate-900"
                      />
                      <span className="text-[11px] font-bold text-amber-300">
                        {isEn ? 'I accept the risk of SSH disconnection' : 'ریسک قطعی اتصال SSH را صراحتا می‌پذیرم'}
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => {
                    setBringDownTarget(null);
                    setDownRiskAcknowledged(false);
                  }}
                  disabled={bringingDown}
                  className={`px-4 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    isLightMode ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="button"
                  onClick={handleExecuteBringDown}
                  disabled={
                    bringingDown ||
                    ((bringDownTarget.isManagement ||
                      networkStackInfo?.managementInterface === bringDownTarget.name) &&
                      !downRiskAcknowledged)
                  }
                  className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold transition cursor-pointer flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <PowerOff className={`w-4 h-4 ${bringingDown ? 'animate-spin' : ''}`} />
                  <span>
                    {bringingDown
                      ? isEn
                        ? 'Shutting down...'
                        : 'در حال غیرفعال‌سازی...'
                      : isEn
                      ? 'Confirm Bring DOWN'
                      : 'تایید و خاموش کردن اینترفیس'}
                  </span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
