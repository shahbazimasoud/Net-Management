import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Building2,
  Layers,
  Boxes,
  Server,
  Search,
  CheckCircle,
  Router,
  Wifi,
  HardDrive,
  Cpu,
  ArrowRight,
  Shield,
  Plus,
} from 'lucide-react';
import { TopologyNode } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { FieldInfoTooltip } from './common/FieldInfoTooltip';
import { useModalDock } from '../context/ModalDockContext';

export interface AssignPhysicalPlacementTarget {
  building: string;
  floor?: string;
  unit?: string;
  rack?: string;
}

export interface AssignPhysicalPlacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: AssignPhysicalPlacementTarget | null;
  availableFloors: string[];
  availableUnits: string[];
  availableRacks: string[];
  inventoryDevices: TopologyNode[];
  onAssign: (
    deviceId: string,
    building: string,
    floor: string,
    unit?: string,
    rack?: string
  ) => Promise<void>;
  isLightMode: boolean;
}

export const AssignPhysicalPlacementModal: React.FC<AssignPhysicalPlacementModalProps> = ({
  isOpen,
  onClose,
  target,
  availableFloors,
  availableUnits,
  availableRacks,
  inventoryDevices,
  onAssign,
  isLightMode,
}) => {
  const { isEn, t } = useLanguage();
  const { dockModal, undockModal } = useModalDock();
  const [isMaximized, setIsMaximized] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'unassigned' | 'placed'>('all');
  const [selectedFloor, setSelectedFloor] = useState<string>(
    target?.floor || (availableFloors.length > 0 ? availableFloors[0] : (isEn ? 'Floor 1' : 'طبقه ۱'))
  );
  const [selectedUnit, setSelectedUnit] = useState<string>(target?.unit || '');
  const [selectedRack, setSelectedRack] = useState<string>(target?.rack || '');
  const [isAssigningId, setIsAssigningId] = useState<string | null>(null);

  // Sync state if target changes
  React.useEffect(() => {
    if (target) {
      if (target.floor) setSelectedFloor(target.floor);
      else if (availableFloors.length > 0) setSelectedFloor(availableFloors[0]);
      else setSelectedFloor(isEn ? 'Floor 1' : 'طبقه ۱');

      setSelectedUnit(target.unit || '');
      setSelectedRack(target.rack || '');
    }
  }, [target, availableFloors, isEn]);

  // Clean up dock on modal close or unmount
  const modalDockId = 'assign-placement-modal';

  const handleMinimize = () => {
    if (!target) return;
    const destTitleEn = target.rack
      ? `Rack: ${target.rack}`
      : target.unit
      ? `Unit: ${target.unit}`
      : target.floor
      ? `Floor: ${target.floor}`
      : `Bldg: ${target.building}`;
    const destTitleFa = target.rack
      ? `رک: ${target.rack}`
      : target.unit
      ? `واحد: ${target.unit}`
      : target.floor
      ? `طبقه: ${target.floor}`
      : `ساختمان: ${target.building}`;

    dockModal({
      id: modalDockId,
      labelEn: `Assign Device (${destTitleEn})`,
      labelFa: `افزودن تجهیز (${destTitleFa})`,
      badge: target.building,
      category: 'device',
      onRestore: () => {
        // Will be restored
      },
      onClose: () => {
        undockModal(modalDockId);
        onClose();
      },
    });
    onClose();
  };

  // Filter devices from inventory
  const filteredDevices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (inventoryDevices || []).filter((dev) => {
      const isPlaced = Boolean(dev.building && dev.building.trim());
      if (filterType === 'unassigned' && isPlaced) return false;
      if (filterType === 'placed' && !isPlaced) return false;

      if (!q) return true;
      const matchName = dev.name?.toLowerCase().includes(q);
      const matchIp = dev.ip?.toLowerCase().includes(q);
      const matchModel = dev.model?.toLowerCase().includes(q);
      const matchRole = dev.role?.toLowerCase().includes(q);
      const matchType = dev.type?.toLowerCase().includes(q);
      return matchName || matchIp || matchModel || matchRole || matchType;
    });
  }, [inventoryDevices, searchQuery, filterType]);

  if (!isOpen || !target) return null;

  const handleDeviceSelect = async (dev: TopologyNode) => {
    if (!target.building || !selectedFloor) return;
    setIsAssigningId(dev.id);
    try {
      await onAssign(
        dev.id,
        target.building,
        selectedFloor,
        selectedUnit || undefined,
        selectedRack || undefined
      );
      onClose();
    } finally {
      setIsAssigningId(null);
    }
  };

  const getDeviceIcon = (dev: TopologyNode) => {
    const tLower = (dev.type || '').toLowerCase();
    if (tLower === 'router') return <Router className="w-4 h-4 text-emerald-400" />;
    if (tLower === 'access_point' || tLower.includes('ap')) return <Wifi className="w-4 h-4 text-amber-400" />;
    if (tLower === 'server') return <HardDrive className="w-4 h-4 text-purple-400" />;
    if (tLower === 'firewall') return <Shield className="w-4 h-4 text-rose-400" />;
    return <Cpu className="w-4 h-4 text-cyan-400" />;
  };

  const modalContent = (
    <div
      data-modal-backdrop="true"
      className={`fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center transition-all duration-200 ${
        isMaximized ? 'p-0' : 'p-3 sm:p-5 bg-black/75 backdrop-blur-sm'
      }`}
      onClick={onClose}
    >
      <div
        className={`flex flex-col transition-all duration-200 shadow-2xl overflow-hidden ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-3xl max-h-[85vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-900 border-cyan-500/30 text-slate-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode
              ? 'bg-slate-50 border-slate-200'
              : 'bg-slate-950/80 border-white/10'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl border ${
                isLightMode
                  ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                  : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
              }`}
            >
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className={`text-sm font-bold flex items-center gap-2 ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                <span>{t('topology_physical_assign_modal_title')}</span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    isLightMode
                      ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                      : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                  }`}
                >
                  {target.building}
                </span>
              </h3>
              <p className={`text-[11px] mt-0.5 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                {t('topology_physical_select_device_from_inv')}
              </p>
            </div>
          </div>

          {/* Header Controls (Close, Minimize, Fullscreen) */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleMinimize}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
              title={isEn ? 'Minimize' : 'کوچک‌سازی'}
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
              title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام‌صفحه') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4 text-amber-400" /> : <Maximize2 className="w-4 h-4 text-cyan-400" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50' : 'text-slate-400 hover:text-rose-400 hover:bg-white/10'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Target Destination Summary & Selector Bar */}
        <div
          className={`p-4 border-b flex items-center justify-between flex-wrap gap-3 shrink-0 ${
            isLightMode ? 'bg-indigo-50/50 border-indigo-100' : 'bg-slate-950/40 border-white/5'
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className={isLightMode ? 'text-slate-600' : 'text-slate-400'}>
                {t('topology_physical_destination')}
              </span>
              <FieldInfoTooltip
                title={isEn ? 'Target Placement' : 'موقعیت مقصد'}
                whatIsIt={isEn ? 'The specific building, floor, room, or server rack where the network device is installed.' : 'ساختمان، طبقه، واحد، یا رکی که تجهیز شبکه به صورت فیزیکی درون آن مستقر می‌شود.'}
                whyNeeded={isEn ? 'Enables accurate topological tracing and hardware mapping across your infrastructure.' : 'امکان ردیابی دقیق فیزیکی و مدیریت مکان‌های تجهیزات شبکه را در سازمان فراهم می‌سازد.'}
                example={isEn ? 'Building A > Floor 2 > Rack-01' : 'ساختمان مرکزی > طبقه ۲ > رک A01'}
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>

            {/* Building Badge */}
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
              isLightMode ? 'bg-white text-indigo-700 border-indigo-200 shadow-sm' : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
            }`}>
              <Building2 className="w-3 h-3 text-indigo-400" />
              <span>{target.building}</span>
            </span>

            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

            {/* Floor Badge / Selector */}
            {availableFloors.length > 1 && !target.floor ? (
              <select
                value={selectedFloor}
                onChange={(e) => setSelectedFloor(e.target.value)}
                className={`text-xs px-2.5 py-1 rounded-lg border font-medium cursor-pointer transition ${
                  isLightMode
                    ? 'bg-white text-slate-800 border-slate-300 focus:border-indigo-500'
                    : 'bg-slate-800 text-slate-100 border-white/10 focus:border-cyan-400'
                }`}
              >
                {availableFloors.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            ) : (
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                isLightMode ? 'bg-white text-sky-700 border-sky-200 shadow-sm' : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
              }`}>
                <Layers className="w-3 h-3 text-sky-400" />
                <span>{selectedFloor}</span>
              </span>
            )}

            {/* Unit Badge (if target has unit) */}
            {selectedUnit && (
              <>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                  isLightMode ? 'bg-white text-indigo-700 border-indigo-200 shadow-sm' : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                }`}>
                  <Boxes className="w-3 h-3 text-indigo-400" />
                  <span>{selectedUnit}</span>
                </span>
              </>
            )}

            {/* Rack Badge (if target has rack) */}
            {selectedRack && (
              <>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold font-mono border ${
                  isLightMode ? 'bg-white text-cyan-700 border-cyan-200 shadow-sm' : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                }`}>
                  <Server className="w-3 h-3 text-cyan-400" />
                  <span>{selectedRack}</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div
          className={`px-5 py-3 border-b flex items-center justify-between flex-wrap gap-2.5 shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/5'
          }`}
        >
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className={`w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
              isLightMode ? 'text-slate-400' : 'text-slate-500'
            }`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('topology_physical_search_devices_placeholder')}
              className={`w-full text-xs pl-3 pr-9 py-2 rounded-xl border outline-none transition ${
                isLightMode
                  ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white'
                  : 'bg-slate-950 border-white/10 text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:bg-slate-900'
              }`}
            />
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer border ${
                filterType === 'all'
                  ? isLightMode
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-cyan-500 text-slate-950 font-semibold border-cyan-400 shadow-sm'
                  : isLightMode
                  ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
              }`}
            >
              {isEn ? 'All Equipment' : 'تمامی تجهیزات'}
            </button>
            <button
              type="button"
              onClick={() => setFilterType('unassigned')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer border ${
                filterType === 'unassigned'
                  ? isLightMode
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-cyan-500 text-slate-950 font-semibold border-cyan-400 shadow-sm'
                  : isLightMode
                  ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
              }`}
            >
              {isEn ? 'Unassigned Only' : 'فقط فاقد مکان'}
            </button>
            <button
              type="button"
              onClick={() => setFilterType('placed')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer border ${
                filterType === 'placed'
                  ? isLightMode
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-cyan-500 text-slate-950 font-semibold border-cyan-400 shadow-sm'
                  : isLightMode
                  ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
              }`}
            >
              {isEn ? 'Already Placed' : 'مستقر در مکان'}
            </button>
          </div>
        </div>

        {/* Device List Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2.5 min-h-[220px]">
          {filteredDevices.length === 0 ? (
            <div
              className={`p-10 rounded-2xl border border-dashed text-center flex flex-col items-center justify-center gap-2 ${
                isLightMode ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-slate-950/40 border-white/10 text-slate-400'
              }`}
            >
              <Cpu className="w-8 h-8 opacity-40 text-cyan-400" />
              <span className="text-xs font-medium">
                {t('topology_physical_no_inventory_devices')}
              </span>
            </div>
          ) : (
            filteredDevices.map((dev) => {
              const hasPlacement = Boolean(dev.building && dev.building.trim());
              const isCurrentDestination =
                dev.building === target.building &&
                dev.floor === selectedFloor &&
                (selectedUnit ? dev.unit === selectedUnit : true) &&
                (selectedRack ? dev.rack === selectedRack : true);

              const isAssigningThis = isAssigningId === dev.id;

              return (
                <div
                  key={dev.id}
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                    isLightMode
                      ? 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md'
                      : 'bg-slate-950/60 border-white/10 hover:border-cyan-500/40 hover:bg-slate-950'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2.5 rounded-xl border shrink-0 ${
                        isLightMode
                          ? 'bg-slate-100 border-slate-200 text-indigo-600'
                          : 'bg-white/5 border-white/10 text-cyan-300'
                      }`}
                    >
                      {getDeviceIcon(dev)}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold truncate ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                          {dev.name}
                        </span>
                        {dev.ip && (
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                            isLightMode ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-slate-900 text-slate-300 border-white/10'
                          }`}>
                            {dev.ip}
                          </span>
                        )}
                        {dev.model && (
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border truncate max-w-[140px] ${
                            isLightMode ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                          }`}>
                            {dev.model}
                          </span>
                        )}
                      </div>

                      {/* Current Location Badge */}
                      <div className="flex items-center gap-2 mt-1 text-[11px]">
                        <span className={isLightMode ? 'text-slate-500' : 'text-slate-400'}>
                          {t('topology_physical_current_placement_label')}
                        </span>
                        {hasPlacement ? (
                          <span className={`font-medium ${isLightMode ? 'text-indigo-600' : 'text-indigo-300'}`}>
                            {dev.building} &gt; {dev.floor || (isEn ? 'Floor 1' : 'طبقه ۱')}
                            {dev.unit ? ` &gt; ${dev.unit}` : ''}
                            {dev.rack ? ` &gt; ${dev.rack}` : ''}
                          </span>
                        ) : (
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium border ${
                            isLightMode ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          }`}>
                            {t('topology_physical_status_unassigned')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Assign Action Button */}
                  <div className="shrink-0">
                    {isCurrentDestination ? (
                      <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                        isLightMode
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      }`}>
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{isEn ? 'Already Here' : 'مستقر در این مکان'}</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={isAssigningThis}
                        onClick={() => handleDeviceSelect(dev)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition shadow-sm active:scale-95 cursor-pointer disabled:opacity-50 ${
                          isLightMode
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
                            : 'bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-cyan-600/20'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isAssigningThis ? (isEn ? 'Adding...' : 'در حال افزودن...') : t('topology_physical_assign_action_btn')}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div
          className={`px-5 py-3 border-t flex items-center justify-between text-xs shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-950/80 border-white/10 text-slate-400'
          }`}
        >
          <span>
            {isEn
              ? `Total ${filteredDevices.length} network device(s) found in inventory`
              : `تعداد کل ${filteredDevices.length} تجهیز در موجودی شبکه`}
          </span>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl border text-xs font-medium transition cursor-pointer ${
              isLightMode
                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                : 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10'
            }`}
          >
            {t('topology_physical_cancel_btn')}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
