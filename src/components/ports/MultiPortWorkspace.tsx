import React, { useState } from 'react';
import {
  Columns,
  Maximize2,
  Minimize2,
  Minus,
  X,
  Plus,
  ArrowLeftRight,
  Grid2X2,
  Rows,
  Cable,
  RefreshCw,
  GripVertical,
  Layers,
  CheckCircle2,
  XCircle,
  Cpu,
} from 'lucide-react';
import { Device, isMikroTikDevice } from '../../types';
import { PortInspectorModal } from '../PortInspectorModal';
import { MikroTikDeviceManageModal } from '../MikroTikDeviceManageModal';
import { PortDeviceSelector } from './PortDeviceSelector';
import { useLanguage } from '../../i18n/LanguageContext';
import { syncDevicePorts } from '../../services/api';

export interface MultiPortWorkspaceProps {
  activePortDevices: (Device | null)[];
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  onDevicesChange: (devices: (Device | null)[]) => void;
  allDevices: Device[];
  onPortUpdated?: () => void;
  onConnectTerminal?: (device: Device, initialPort?: string) => void;
  onWriteMemory?: (deviceId: string) => void;
  onDeviceUpdated?: () => void;
  isLightMode?: boolean;
}

export const MultiPortWorkspace: React.FC<MultiPortWorkspaceProps> = ({
  activePortDevices,
  isOpen,
  onClose,
  onMinimize,
  onDevicesChange,
  allDevices,
  onPortUpdated,
  onConnectTerminal,
  onWriteMemory,
  onDeviceUpdated,
  isLightMode = false,
}) => {
  const { isEn } = useLanguage();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layoutOrientation, setLayoutOrientation] = useState<'columns' | 'grid'>('columns');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  if (!isOpen || activePortDevices.length === 0) {
    return null;
  }

  // If there is only 1 device and it's not a null placeholder, render as standard modal
  const isMultiPane = activePortDevices.length > 1 || activePortDevices.some((d) => d === null);

  // Split screen from single modal: adds a placeholder slot to transition into split view
  const handleSplitScreen = () => {
    if (activePortDevices.length < 4) {
      onDevicesChange([...activePortDevices, null]);
    }
  };

  const handleSwapPanes = (fromIdx: number, toIdx: number) => {
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= activePortDevices.length || toIdx >= activePortDevices.length) {
      return;
    }
    const next = [...activePortDevices];
    const temp = next[fromIdx];
    next[fromIdx] = next[toIdx];
    next[toIdx] = temp;
    onDevicesChange(next);
  };

  const handleSwapWithNext = (fromIdx: number) => {
    if (activePortDevices.length <= 1) return;
    const toIdx = (fromIdx + 1) % activePortDevices.length;
    handleSwapPanes(fromIdx, toIdx);
  };

  const handleQuickSwapLeftRight = () => {
    if (activePortDevices.length >= 2) {
      handleSwapPanes(0, 1);
    }
  };

  const handleClosePane = (index: number) => {
    const next = activePortDevices.filter((_, idx) => idx !== index);
    if (next.length === 0) {
      onClose();
    } else {
      onDevicesChange(next);
    }
  };

  const handleSelectDeviceForSlot = (index: number, device: Device) => {
    const next = [...activePortDevices];
    next[index] = device;
    onDevicesChange(next);
  };

  const handleChangeDeviceInSlot = (index: number) => {
    const next = [...activePortDevices];
    next[index] = null;
    onDevicesChange(next);
  };

  // Sync ports across all active devices in parallel
  const handleSyncAllActive = async () => {
    const validDevices = activePortDevices.filter((d): d is Device => d !== null);
    if (validDevices.length === 0 || isSyncingAll) return;
    setIsSyncingAll(true);
    try {
      await Promise.allSettled(validDevices.map((d) => syncDevicePorts(d.id)));
      if (onPortUpdated) {
        onPortUpdated();
      }
    } catch {}
    finally {
      setIsSyncingAll(false);
    }
  };

  // Render single port modal directly if only 1 device and not multi-pane
  if (!isMultiPane && activePortDevices[0]) {
    const singleDevice = activePortDevices[0];
    const isMikroTik = isMikroTikDevice(singleDevice);

    if (isMikroTik) {
      return (
        <MikroTikDeviceManageModal
          device={singleDevice}
          isOpen={true}
          onClose={onClose}
          onMinimize={onMinimize}
          onPortUpdated={onPortUpdated}
          onConnectTerminal={onConnectTerminal}
          onDeviceUpdated={onDeviceUpdated}
          isLightMode={isLightMode}
          onSplitScreen={handleSplitScreen}
        />
      );
    }

    return (
      <PortInspectorModal
        device={singleDevice}
        isOpen={true}
        onClose={onClose}
        onMinimize={onMinimize}
        onPortUpdated={onPortUpdated}
        onConnectTerminal={onConnectTerminal}
        onWriteMemory={onWriteMemory}
        onSplitScreen={handleSplitScreen}
      />
    );
  }

  // Grid layout classes based on pane count
  const paneCount = activePortDevices.length;
  let gridLayoutClass = 'grid-cols-1 lg:grid-cols-2';
  if (paneCount === 1) {
    gridLayoutClass = 'grid-cols-1';
  } else if (paneCount === 2) {
    gridLayoutClass = 'grid-cols-1 lg:grid-cols-2';
  } else if (paneCount === 3) {
    gridLayoutClass =
      layoutOrientation === 'grid'
        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        : 'grid-cols-1 lg:grid-cols-3';
  } else if (paneCount >= 4) {
    gridLayoutClass = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2';
  }

  return (
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[9999] flex flex-col ${
        isFullscreen ? 'p-0' : 'p-1 sm:p-2.5'
      } ${
        isLightMode
          ? 'bg-slate-200/90 text-slate-900'
          : 'bg-slate-950/90 text-slate-100'
      } backdrop-blur-md animate-in fade-in duration-200 overflow-hidden`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      {/* Global Multi-Port Top Navigation Bar */}
      <div
        className={`flex items-center justify-between px-3 py-2 border shrink-0 shadow-lg text-xs select-none ${
          isFullscreen ? 'rounded-none border-x-0 border-t-0 mb-0' : 'rounded-xl mb-2'
        } ${
          isLightMode
            ? 'bg-white border-slate-300 text-slate-800'
            : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
            <Cable className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-wide">
              {isEn
                ? 'Multi-Port Inspector Workspace'
                : 'میز کار مقایسه و مدیریت همزمان پورت‌ها (Port Split-Screen)'}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
              {activePortDevices.filter(Boolean).length} / {paneCount}{' '}
              {isEn ? 'Panes' : 'دیوایس'}
            </span>
          </div>

          {/* Drag & Drop Hint */}
          {paneCount > 1 && (
            <div
              className={`hidden xl:flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded border ${
                isLightMode
                  ? 'bg-slate-100 text-slate-600 border-slate-300'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/50'
              }`}
            >
              <GripVertical className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {isEn
                  ? 'Drag & drop panes to reorder/swap'
                  : 'قابلیت کشیدن و رها کردن (Drag & Drop) برای جابجایی پنجره‌ها'}
              </span>
            </div>
          )}
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-1.5">
          {/* Sync All Ports */}
          <button
            type="button"
            onClick={handleSyncAllActive}
            disabled={isSyncingAll}
            className={`px-2.5 py-1 rounded-lg border transition flex items-center gap-1.5 font-medium cursor-pointer text-xs disabled:opacity-50 ${
              isLightMode
                ? 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border-cyan-300'
                : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
            }`}
            title={
              isEn
                ? 'Sync ports across all open devices simultaneously'
                : 'همگام‌سازی وضعیت پورت‌ها در تمام دیوایس‌های باز به صورت همزمان'
            }
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isSyncingAll ? 'animate-spin' : ''}`} />
            <span>
              {isSyncingAll
                ? isEn
                  ? 'Syncing All...'
                  : 'در حال سینک همه...'
                : isEn
                ? 'Sync All Ports'
                : 'سینک تمام پورت‌ها'}
            </span>
          </button>

          {/* Quick Swap Panes Button */}
          {paneCount >= 2 && (
            <button
              type="button"
              onClick={handleQuickSwapLeftRight}
              className={`px-2.5 py-1 rounded-lg border transition flex items-center gap-1.5 font-medium cursor-pointer text-xs ${
                isLightMode
                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}
              title={isEn ? 'Swap Panes (Left & Right / Next)' : 'جابجایی موقعیت پنجره‌ها'}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>{isEn ? 'Swap Panes' : 'جابجایی پنجره‌ها'}</span>
            </button>
          )}

          {/* Add Another Port Pane (Up to 4) */}
          {paneCount < 4 && (
            <button
              type="button"
              onClick={handleSplitScreen}
              className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition flex items-center gap-1.5 cursor-pointer text-xs shadow-xs"
              title={isEn ? 'Add another port pane (Max 4)' : 'افزودن یک پنل پورت دیگر (حداکثر ۴)'}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isEn ? 'Add Pane' : 'افزودن پنل (+)'}</span>
            </button>
          )}

          {/* Layout Toggle for 3-4 panes */}
          {paneCount >= 3 && (
            <button
              type="button"
              onClick={() => setLayoutOrientation(layoutOrientation === 'columns' ? 'grid' : 'columns')}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title={isEn ? 'Toggle Layout (Grid/Columns)' : 'تغییر چینش (گرید / ستونی)'}
            >
              {layoutOrientation === 'columns' ? (
                <Grid2X2 className="w-3.5 h-3.5" />
              ) : (
                <Rows className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          <div className="w-px h-4 bg-slate-700 mx-1" />

          {/* Fullscreen / Windowed Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              isLightMode
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title={
              isFullscreen
                ? isEn
                  ? 'Exit Fullscreen'
                  : 'خروج از تمام صفحه'
                : isEn
                ? 'Fullscreen'
                : 'تمام صفحه'
            }
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Minimize Button */}
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title={isEn ? 'Minimize Workspace' : 'مینیمایز به نوار ابزار پایین'}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Close Entire Workspace */}
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              isLightMode
                ? 'bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-600 border-slate-300'
                : 'bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 border-slate-700'
            }`}
            title={isEn ? 'Close All Panes' : 'بستن کل میز کار'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Split Panes Container */}
      <div className={`flex-1 grid gap-2 overflow-hidden ${gridLayoutClass}`}>
        {activePortDevices.map((device, index) => {
          const isMikro = device ? isMikroTikDevice(device) : false;
          const isDraggingThis = draggedIndex === index;
          const isDragOverThis = dragOverIndex === index;

          return (
            <div
              key={device ? `port-pane-${device.id}-${index}` : `empty-slot-${index}`}
              className={`flex flex-col h-full overflow-hidden rounded-xl border transition-all ${
                isDraggingThis ? 'opacity-40 scale-[0.98]' : 'opacity-100'
              } ${
                isDragOverThis ? 'ring-2 ring-cyan-400 border-cyan-400' : ''
              } ${
                isLightMode
                  ? 'bg-white border-slate-300 shadow-md'
                  : 'bg-slate-900/90 border-slate-800 shadow-xl'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverIndex !== index) {
                  setDragOverIndex(index);
                }
              }}
              onDragLeave={() => {
                if (dragOverIndex === index) {
                  setDragOverIndex(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverIndex(null);
                if (draggedIndex !== null && draggedIndex !== index) {
                  handleSwapPanes(draggedIndex, index);
                }
                setDraggedIndex(null);
              }}
            >
              {/* If device is null, show PortDeviceSelector */}
              {!device ? (
                <div className="w-full h-full flex flex-col p-2">
                  <PortDeviceSelector
                    devices={allDevices}
                    onSelectDevice={(selectedDev) => handleSelectDeviceForSlot(index, selectedDev)}
                    isLightMode={isLightMode}
                    onCancel={() => handleClosePane(index)}
                  />
                </div>
              ) : (
                <>
                  {/* Pane Sub-Header */}
                  <div
                    draggable
                    onDragStart={(e) => {
                      setDraggedIndex(index);
                      e.dataTransfer.setData('text/plain', String(index));
                    }}
                    onDragEnd={() => {
                      setDraggedIndex(null);
                      setDragOverIndex(null);
                    }}
                    className={`flex items-center justify-between px-3 py-1.5 border-b select-none shrink-0 cursor-grab active:cursor-grabbing ${
                      isLightMode
                        ? 'bg-slate-100 border-slate-200'
                        : 'bg-slate-950/80 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <GripVertical className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <div
                        className={`p-1 rounded flex items-center justify-center shrink-0 ${
                          isMikro
                            ? 'bg-cyan-500/20 text-cyan-400'
                            : 'bg-indigo-500/20 text-indigo-400'
                        }`}
                      >
                        {isMikro ? <Cpu className="w-3.5 h-3.5" /> : <Cable className="w-3.5 h-3.5" />}
                      </div>
                      <span className="font-bold text-xs font-mono truncate text-white">
                        {device.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-800 text-slate-300 border border-slate-700/60" dir="ltr">
                        {device.ip}
                      </span>
                      {device.is_online ? (
                        <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 font-mono">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span className="hidden sm:inline">{isEn ? 'UP' : 'وصل'}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 text-[10px] text-slate-500 font-mono">
                          <XCircle className="w-2.5 h-2.5" />
                          <span className="hidden sm:inline">{isEn ? 'DOWN' : 'قطع'}</span>
                        </span>
                      )}
                    </div>

                    {/* Pane Controls */}
                    <div className="flex items-center gap-1">
                      {/* Swap with next pane */}
                      {paneCount > 1 && (
                        <button
                          type="button"
                          onClick={() => handleSwapWithNext(index)}
                          className="p-1 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition cursor-pointer"
                          title={isEn ? 'Swap with next pane' : 'جابجایی با پنل بعدی'}
                        >
                          <ArrowLeftRight className="w-3 h-3" />
                        </button>
                      )}

                      {/* Switch Device in this Slot */}
                      <button
                        type="button"
                        onClick={() => handleChangeDeviceInSlot(index)}
                        className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition cursor-pointer"
                        title={isEn ? 'Change device in this slot' : 'تغییر دیوایس در این پنل'}
                      >
                        <Layers className="w-3 h-3" />
                      </button>

                      {/* Close this Pane */}
                      <button
                        type="button"
                        onClick={() => handleClosePane(index)}
                        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                        title={isEn ? 'Close pane' : 'بستن این پنل'}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Pane Content */}
                  <div className="flex-1 overflow-hidden relative">
                    {isMikro ? (
                      <MikroTikDeviceManageModal
                        device={device}
                        isOpen={true}
                        isEmbedded={true}
                        onClose={() => handleClosePane(index)}
                        onPortUpdated={onPortUpdated}
                        onConnectTerminal={onConnectTerminal}
                        onDeviceUpdated={onDeviceUpdated}
                        isLightMode={isLightMode}
                      />
                    ) : (
                      <PortInspectorModal
                        device={device}
                        isOpen={true}
                        isEmbedded={true}
                        onClose={() => handleClosePane(index)}
                        onPortUpdated={onPortUpdated}
                        onConnectTerminal={onConnectTerminal}
                        onWriteMemory={onWriteMemory}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
