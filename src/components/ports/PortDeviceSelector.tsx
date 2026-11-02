import React, { useState, useMemo } from 'react';
import {
  Cable,
  Search,
  Router,
  Layers,
  Server,
  Filter,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Cpu,
  Shield,
  Activity,
  Zap,
} from 'lucide-react';
import { Device, isMikroTikDevice } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';

export interface PortDeviceSelectorProps {
  devices: Device[];
  onSelectDevice: (device: Device) => void;
  currentDeviceId?: string;
  isLightMode?: boolean;
  onCancel?: () => void;
}

export const PortDeviceSelector: React.FC<PortDeviceSelectorProps> = ({
  devices,
  onSelectDevice,
  currentDeviceId,
  isLightMode = false,
  onCancel,
}) => {
  const { isEn } = useLanguage();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'switch' | 'router' | 'cisco' | 'mikrotik'>('all');

  // Filter available network equipment with ports (switches, routers, firewalls)
  const portDevices = useMemo(() => {
    return devices.filter((d) => d.type === 'switch' || d.type === 'router' || d.type === 'firewall');
  }, [devices]);

  const filteredDevices = useMemo(() => {
    return portDevices.filter((dev) => {
      // Type filter
      if (filterType === 'switch' && dev.type !== 'switch') return false;
      if (filterType === 'router' && dev.type !== 'router') return false;
      if (filterType === 'mikrotik' && !isMikroTikDevice(dev)) return false;
      if (filterType === 'cisco' && isMikroTikDevice(dev)) return false;

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = (dev.name || '').toLowerCase().includes(q);
        const matchIp = (dev.ip || '').toLowerCase().includes(q);
        const matchModel = (dev.model || '').toLowerCase().includes(q);
        const matchRole = (dev.role || '').toLowerCase().includes(q);
        const matchPlatform = (dev.platform || '').toLowerCase().includes(q);
        return matchName || matchIp || matchModel || matchRole || matchPlatform;
      }
      return true;
    });
  }, [portDevices, filterType, search]);

  return (
    <div
      className={`w-full h-full flex flex-col p-4 overflow-y-auto select-none rounded-xl border ${
        isLightMode
          ? 'bg-slate-50 border-slate-300 text-slate-800'
          : 'bg-slate-950/95 border-slate-800/80 text-slate-100'
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between pb-3 border-b mb-3 ${
          isLightMode ? 'border-slate-200' : 'border-slate-800/80'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
            <Cable className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm">
              {isEn ? 'Select Device for Port Split View' : 'انتخاب دستگاه برای نمایش همزمان و مقایسه پورت‌ها'}
            </h3>
            <p className="text-[11px] text-slate-400">
              {isEn
                ? 'Choose another switch or router to inspect and compare ports side-by-side'
                : 'سوئیچ یا روتر مورد نظر خود را جهت مقایسه وضعیت، VLAN و پورت‌ها در کنار هم انتخاب کنید'}
            </p>
          </div>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
              isLightMode
                ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            {isEn ? 'Cancel' : 'انصراف / بستن پنل'}
          </button>
        )}
      </div>

      {/* Search & Category Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search
            className={`w-4 h-4 text-slate-400 absolute ${
              isEn ? 'right-3' : 'left-3'
            } top-2.5 pointer-events-none`}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              isEn
                ? 'Search devices by name, IP, model or role...'
                : 'جستجوی تجهیز بر اساس نام، آدرس IP، مدل یا نقش...'
            }
            className={`w-full ${
              isEn ? 'pr-9 pl-3' : 'pl-9 pr-3'
            } py-1.5 rounded-lg border text-xs focus:outline-none focus:border-cyan-500 transition ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                : 'bg-slate-900 border-slate-700/80 text-white placeholder-slate-500'
            }`}
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {(
            [
              { id: 'all', label: isEn ? 'All' : 'همه' },
              { id: 'switch', label: isEn ? 'Switches' : 'سوئیچ‌ها' },
              { id: 'router', label: isEn ? 'Routers' : 'روترها' },
              { id: 'cisco', label: isEn ? 'Cisco' : 'سیسکو' },
              { id: 'mikrotik', label: isEn ? 'MikroTik' : 'میکروتیک' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilterType(item.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                filterType === item.id
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : isLightMode
                  ? 'bg-slate-200/80 text-slate-700 hover:bg-slate-300'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Device Cards Grid */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {filteredDevices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-xs">
            <Cable className="w-8 h-8 text-slate-500 mb-2 opacity-50" />
            <p>{isEn ? 'No matching network devices found.' : 'هیچ دستگاه منطبقی یافت نشد.'}</p>
          </div>
        ) : (
          filteredDevices.map((dev) => {
            const isSelected = dev.id === currentDeviceId;
            const isMikro = isMikroTikDevice(dev);
            const portCount = dev.total_ports || (dev.ports ? dev.ports.length : 24);

            return (
              <div
                key={dev.id}
                onClick={() => onSelectDevice(dev)}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : isLightMode
                    ? 'border-slate-200 bg-white hover:border-cyan-400 hover:bg-cyan-50/50'
                    : 'border-slate-800/80 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-800/60'
                }`}
              >
                {/* Device Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isMikro
                        ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                        : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                    }`}
                  >
                    {isMikro ? <Cpu className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs truncate font-mono text-white">
                        {dev.name}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700/60" dir="ltr">
                        {dev.ip}
                      </span>
                      {dev.is_online ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{isEn ? 'Online' : 'آنلاین'}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                          <XCircle className="w-3 h-3" />
                          <span>{isEn ? 'Offline' : 'آفلاین'}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 font-mono">
                      <span>{dev.model || (dev.type === 'switch' ? 'Catalyst Switch' : 'Router')}</span>
                      <span>•</span>
                      <span className="text-cyan-400 font-medium">
                        {portCount} {isEn ? 'Ports' : 'پورت'}
                      </span>
                      {dev.role && (
                        <>
                          <span>•</span>
                          <span className="text-slate-400">{dev.role}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Select Button */}
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 transition ${
                    isLightMode
                      ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs'
                      : 'bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40'
                  }`}
                >
                  <span>{isEn ? 'Open Ports' : 'مشاهده پورت‌ها'}</span>
                  <ArrowRight className={`w-3.5 h-3.5 ${isEn ? '' : 'rotate-180'}`} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
