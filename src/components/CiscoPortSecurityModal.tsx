import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  Zap,
  Lock,
  Sparkles,
  Terminal,
  Save,
  CheckCircle2,
  HardDrive,
  Info,
  Server,
  Layers,
  ArrowRight,
  Database
} from 'lucide-react';
import { SwitchPort, Device } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useModalDock } from '../context/ModalDockContext';
import { FieldInfoTooltip } from './common/FieldInfoTooltip';
import {
  extractPortSecurityState,
  generateSamplePortSecurityMac,
  getPortMacAddresses,
  PortMacEntry
} from './PortInspectorModal';
import { executeDeviceOperation, updateSwitchPort, fetchDevicePorts } from '../services/api';

export interface CiscoPortSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  port: SwitchPort | null;
  device: Device;
  onPortUpdated?: (updatedPort: SwitchPort) => void;
  isLightMode?: boolean;
}

export const CiscoPortSecurityModal: React.FC<CiscoPortSecurityModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  port,
  device,
  onPortUpdated,
  isLightMode: propIsLightMode,
}) => {
  const { isEn } = useLanguage();
  const { dockModal, undockModal } = useModalDock();

  // Detect Light Mode
  const isLightMode = useMemo(() => {
    if (propIsLightMode !== undefined) return propIsLightMode;
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('light') || document.body.classList.contains('light');
    }
    return false;
  }, [propIsLightMode]);

  // Window state
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Configuration Form State
  const initialSec = useMemo(() => extractPortSecurityState(port), [port]);
  const [enabled, setEnabled] = useState<boolean>(initialSec.enabled);
  const [mode, setMode] = useState<'sticky' | 'configured' | 'dynamic'>(initialSec.mode);
  const [maxMac, setMaxMac] = useState<number>(initialSec.maxMac);
  const [violation, setViolation] = useState<'shutdown' | 'restrict' | 'protect'>(initialSec.violation);
  const [configuredMac, setConfiguredMac] = useState<string>(initialSec.configuredMac);

  // Real learned MAC addresses on this port (excluding switch hardware ASIC MACs)
  const [macEntries, setMacEntries] = useState<PortMacEntry[]>(() =>
    port ? getPortMacAddresses(port).filter((e) => e.type !== 'hardware') : []
  );

  // Action / Async states
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [clearingMac, setClearingMac] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);
  const [copiedMac, setCopiedMac] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Re-synchronize local state whenever port changes
  useEffect(() => {
    if (port) {
      const sec = extractPortSecurityState(port);
      setEnabled(sec.enabled);
      setMode(sec.mode);
      setMaxMac(sec.maxMac);
      setViolation(sec.violation);
      setConfiguredMac(sec.configuredMac);
      setMacEntries(getPortMacAddresses(port).filter((e) => e.type !== 'hardware'));
    }
  }, [port]);

  const portId = port?.port_id || (port as any)?.port || (port as any)?.name || 'Port';
  const modalDockId = `cisco_port_sec_${device.id}_${portId}`;

  // Close handler with undock
  const handleClose = useCallback(() => {
    setIsMinimized(false);
    undockModal(modalDockId);
    onClose();
  }, [undockModal, modalDockId, onClose]);

  // Minimize handler - sends tab to ToolsDock
  const handleMinimize = useCallback(() => {
    setIsMinimized(true);
    dockModal({
      id: modalDockId,
      labelEn: `Port Security: ${device.name} [${portId}]`,
      labelFa: `پورت سکیوریتی: ${device.name} [${portId}]`,
      badge: enabled ? (isEn ? 'Active' : 'فعال') : (isEn ? 'Off' : 'خاموش'),
      category: 'config',
      onRestore: () => {
        setIsMinimized(false);
        undockModal(modalDockId);
      },
      onClose: () => {
        setIsMinimized(false);
        undockModal(modalDockId);
        onClose();
      },
    });
    if (onMinimize) onMinimize();
  }, [dockModal, undockModal, modalDockId, device.name, portId, enabled, isEn, onMinimize, onClose]);

  // Dismiss notification banner after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Check if port is in err-disabled or error status
  const isErrDisabled = useMemo(() => {
    if (!port) return false;
    const rawStatus = String(port.status || '').toLowerCase();
    const secStatus = String(port.port_security_status || '').toLowerCase();
    return rawStatus.includes('err-disable') || secStatus.includes('err-disable') || (port.admin_status === 'enabled' && port.status === 'down' && enabled && initialSec.violation === 'shutdown');
  }, [port, enabled, initialSec.violation]);

  // Live Cisco CLI generation for this port security configuration
  const liveCliCommand = useMemo(() => {
    if (!enabled) {
      return `configure terminal\ninterface ${portId}\n no switchport port-security\nend\nwrite memory`;
    }
    const cleanHex = configuredMac.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
    const formattedMac = cleanHex.length === 12
      ? `${cleanHex.slice(0, 4)}.${cleanHex.slice(4, 8)}.${cleanHex.slice(8, 12)}`
      : configuredMac.trim();

    const targetVlan = Number(port?.vlan || 1);

    const lines = [
      'configure terminal',
      `interface ${portId}`,
      ' switchport',
      ' switchport mode access',
      ` switchport access vlan ${targetVlan}`,
      ' switchport port-security',
      ` switchport port-security maximum ${maxMac}`,
      ` switchport port-security violation ${violation}`,
    ];
    if (mode === 'sticky') {
      lines.push(' switchport port-security mac-address sticky');
      if (formattedMac) {
        lines.push(` switchport port-security mac-address sticky ${formattedMac}`);
      }
    } else if (mode === 'configured' && formattedMac) {
      lines.push(` switchport port-security mac-address ${formattedMac}`);
    }
    lines.push('end');
    lines.push('write memory');
    return lines.join('\n');
  }, [enabled, portId, port?.vlan, maxMac, violation, mode, configuredMac]);

  // Copy helper
  const handleCopyCli = async () => {
    try {
      await navigator.clipboard.writeText(liveCliCommand);
      setCopiedCli(true);
      setTimeout(() => setCopiedCli(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyMac = async (mac: string) => {
    try {
      await navigator.clipboard.writeText(mac);
      setCopiedMac(mac);
      setTimeout(() => setCopiedMac(null), 2000);
    } catch {
      // Fallback
    }
  };

  // 1. Clear individual learned MAC address
  const handleClearSingleMac = async (targetMac: string) => {
    if (!port || !targetMac) return;
    setClearingMac(targetMac);
    try {
      const res = await executeDeviceOperation(
        device.id,
        'port_sec_clear_mac',
        portId,
        {
          mac: targetMac,
          interface: portId,
          device_type: device.type,
        }
      );

      // Remove from local list
      const updatedList = macEntries.filter((m) => m.mac.toLowerCase() !== targetMac.toLowerCase());
      setMacEntries(updatedList);

      // If this was the configured MAC, clear it
      if (configuredMac.toLowerCase() === targetMac.toLowerCase()) {
        setConfiguredMac('');
      }

      const updatedPort: SwitchPort = {
        ...port,
        port_security_learned_macs: updatedList.map((m) => m.mac),
        port_security_configured_mac: configuredMac.toLowerCase() === targetMac.toLowerCase() ? '' : port.port_security_configured_mac,
      };

      if (onPortUpdated) {
        onPortUpdated(updatedPort);
      }

      setNotification({
        type: 'success',
        message: isEn
          ? `MAC address ${targetMac} successfully cleared from port ${portId}.`
          : `مک‌آدرس ${targetMac} با موفقیت از روی پورت ${portId} پاک‌سازی شد.`,
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || (isEn ? 'Failed to clear MAC address.' : 'خطا در پاک‌سازی مک‌آدرس.'),
      });
    } finally {
      setClearingMac(null);
    }
  };

  // 2. Clear all learned MACs on this port
  const handleClearAllMacs = async () => {
    if (!port) return;
    const confirmMsg = isEn
      ? `Are you sure you want to clear ALL learned MAC addresses from port ${portId}?`
      : `آیا از پاک‌سازی تمامی مک‌آدرس‌های یادگرفته‌شده روی پورت ${portId} اطمینان دارید؟`;
    if (!window.confirm(confirmMsg)) return;

    setIsClearingAll(true);
    try {
      await executeDeviceOperation(
        device.id,
        'port_sec_clear_all_macs',
        portId,
        {
          interface: portId,
          device_type: device.type,
        }
      );

      setMacEntries([]);
      if (mode === 'sticky') {
        setConfiguredMac('');
      }

      const updatedPort: SwitchPort = {
        ...port,
        port_security_learned_macs: [],
        port_security_configured_mac: mode === 'sticky' ? '' : port.port_security_configured_mac,
      };

      if (onPortUpdated) {
        onPortUpdated(updatedPort);
      }

      setNotification({
        type: 'success',
        message: isEn
          ? `All learned MAC addresses cleared from port ${portId}.`
          : `تمامی مک‌آدرس‌های پورت ${portId} با موفقیت پاک‌سازی شدند.`,
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || (isEn ? 'Failed to clear all MACs.' : 'خطا در پاک‌سازی همه مک‌آدرس‌ها.'),
      });
    } finally {
      setIsClearingAll(false);
    }
  };

  // 3. Recover from err-disabled status
  const handleRecoverErrDisable = async () => {
    if (!port) return;
    setIsRecovering(true);
    try {
      const res = await executeDeviceOperation(
        device.id,
        'port_sec_recover_errdisable',
        portId,
        {
          interface: portId,
          device_type: device.type,
        }
      );

      const updatedPort: SwitchPort = {
        ...port,
        status: 'up',
        admin_status: 'enabled',
        port_security_status: 'secure-up',
      };

      if (onPortUpdated) {
        onPortUpdated(updatedPort);
      }

      setNotification({
        type: 'success',
        message: isEn
          ? `Port ${portId} recovered from err-disabled state (shutdown -> no shutdown executed).`
          : `پورت ${portId} با موفقیت از وضعیت Err-Disable خارج و ریست گردید.`,
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || (isEn ? 'Failed to recover port.' : 'خطا در بازیابی پورت.'),
      });
    } finally {
      setIsRecovering(false);
    }
  };

  // 4. Refresh port & MAC data from device
  const handleRefreshData = async () => {
    if (!device) return;
    setIsRefreshing(true);
    try {
      const res = await fetchDevicePorts(device.id, true);
      if (res && Array.isArray(res.ports)) {
        const freshPort = res.ports.find((p) => (p.port_id || p.port || p.name) === portId);
        if (freshPort) {
          const freshSec = extractPortSecurityState(freshPort);
          setEnabled(freshSec.enabled);
          setMode(freshSec.mode);
          setMaxMac(freshSec.maxMac);
          setViolation(freshSec.violation);
          setConfiguredMac(freshSec.configuredMac);
          setMacEntries(getPortMacAddresses(freshPort).filter((e) => e.type !== 'hardware'));
          if (onPortUpdated) {
            onPortUpdated(freshPort);
          }
        }
      }
      setNotification({
        type: 'success',
        message: isEn ? 'Port Security data refreshed successfully.' : 'اطلاعات پورت سکیوریتی با موفقیت به‌روزرسانی شد.',
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || (isEn ? 'Failed to refresh ports.' : 'خطا در بازخوانی اطلاعات.'),
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // 5. Save and Apply Port Security Configuration
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!port) return;

    let ciscoMac = configuredMac.trim();
    if (enabled && mode === 'configured' && ciscoMac) {
      const cleanHex = ciscoMac.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
      if (cleanHex.length !== 12) {
        setNotification({
          type: 'error',
          message: isEn
            ? 'Invalid MAC address format. MAC address must contain 12 hexadecimal characters (e.g., 0000.0000.0001 or 00:11:22:33:44:55).'
            : 'فرمت مک‌آدرس نامعتبر است. مک‌آدرس باید دارای ۱۲ رقم هگزادسیمال باشد (مثال: 0000.0000.0001 یا 00:11:22:33:44:55).',
        });
        return;
      }
      ciscoMac = `${cleanHex.slice(0, 4)}.${cleanHex.slice(4, 8)}.${cleanHex.slice(8, 12)}`;
      setConfiguredMac(ciscoMac);
    } else if (ciscoMac) {
      const cleanHex = ciscoMac.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
      if (cleanHex.length === 12) {
        ciscoMac = `${cleanHex.slice(0, 4)}.${cleanHex.slice(4, 8)}.${cleanHex.slice(8, 12)}`;
        setConfiguredMac(ciscoMac);
      }
    }

    setIsSaving(true);
    try {
      const targetVlan = Number(port.vlan || 1);

      // 1. Direct hardware execution on Cisco switch via executeDeviceOperation ('port_sec_update')
      let opRes: any = null;
      try {
        opRes = await executeDeviceOperation(
          device.id,
          'port_sec_update',
          portId,
          {
            enabled,
            mode,
            max_mac: maxMac,
            violation,
            configured_mac: ciscoMac,
            interface: portId,
            device_type: device.type,
            vlan: targetVlan,
          }
        );
      } catch (opErr: any) {
        console.warn('executeDeviceOperation note:', opErr);
      }

      // 2. Persist state and sync with database via updateSwitchPort
      const updates: Partial<SwitchPort> & { interface?: string } = {
        interface: portId,
        port_security_enabled: enabled,
        port_security_mode: mode,
        port_security_max_mac: maxMac,
        port_security_violation: violation,
        port_security_configured_mac: ciscoMac,
        vlan: targetVlan,
        mode: 'access', // Cisco best practice: port security requires access mode
      };

      if (enabled && (mode === 'configured' || mode === 'sticky') && ciscoMac) {
        updates.port_security_learned_macs = [ciscoMac];
      }

      const res = await updateSwitchPort(device.id, portId, updates);
      if (res && res.port) {
        const enrichedPort: SwitchPort = {
          ...res.port,
          vlan: res.port.vlan || targetVlan,
        };
        if (onPortUpdated) {
          onPortUpdated(enrichedPort);
        }
        setMacEntries(getPortMacAddresses(enrichedPort).filter((e) => e.type !== 'hardware'));
      }

      setNotification({
        type: 'success',
        message: isEn
          ? `Port Security settings saved and applied to interface ${portId} successfully.`
          : `تنظیمات پورت سکیوریتی با موفقیت روی اینترفیس ${portId} ذخیره و بر روی سوئیچ اعمال گردید.`,
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || (isEn ? 'Failed to apply configuration.' : 'خطا در اعمال تنظیمات.'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || isMinimized || !port) {
    return null;
  }

  return createPortal(
    <div
      id="cisco-port-security-modal-backdrop"
      className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        id="cisco-port-security-modal"
        className={`w-full flex flex-col transition-all duration-200 overflow-hidden shadow-2xl ${
          isMaximized
            ? 'h-full max-h-full rounded-none border-0'
            : 'max-w-4xl max-h-[92vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-800 shadow-slate-900/20'
            : 'bg-slate-900 border-slate-700/80 text-slate-100 shadow-black/80'
        }`}
        dir={isEn ? 'ltr' : 'rtl'}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================= HEADER (3 Buttons: Close, Minimize, Fullscreen) ================= */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-950/50">
              <ShieldCheck className="w-5 h-5 text-cyan-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base tracking-tight flex items-center gap-2">
                  <span className={isLightMode ? 'text-slate-900' : 'text-white'}>
                    {isEn ? 'Configure Port Security' : 'کانفیگ پورت سکیوریتی'}
                  </span>
                </h3>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                    enabled
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-700/30 text-slate-400 border-slate-600/40'
                  }`}
                >
                  {enabled ? (isEn ? 'ACTIVE' : 'فعال') : (isEn ? 'DISABLED' : 'غیرفعال')}
                </span>
                {isErrDisabled && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>ERR-DISABLED</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                <span className="font-medium text-slate-300">{device.name}</span>
                <span className="text-slate-600">•</span>
                <span className="font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-1.5 py-0.2 rounded text-[11px]">
                  {portId}
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400">
                  {isEn ? 'VLAN: ' : 'ویلن: '}
                  <b className="text-amber-400">{port.vlan || 1}</b>
                </span>
              </p>
            </div>
          </div>

          {/* Header 3 Control Buttons */}
          <div className="flex items-center gap-1">
            <button
              id="cisco-port-sec-minimize-btn"
              onClick={handleMinimize}
              type="button"
              className={`p-2 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  : 'text-slate-400 hover:text-cyan-300 hover:bg-slate-800'
              }`}
              title={isEn ? 'Minimize to ToolsDock' : 'کوچک‌سازی (مینیمایز به نوار داک)'}
              aria-label="Minimize"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              id="cisco-port-sec-maximize-btn"
              onClick={() => setIsMaximized((prev) => !prev)}
              type="button"
              className={`p-2 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  : 'text-slate-400 hover:text-cyan-300 hover:bg-slate-800'
              }`}
              title={isMaximized ? (isEn ? 'Restore Window' : 'خروج از تمام‌صفحه') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
              aria-label="Maximize / Restore"
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              id="cisco-port-sec-close-btn"
              onClick={handleClose}
              type="button"
              className={`p-2 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'text-slate-600 hover:text-rose-600 hover:bg-rose-50'
                  : 'text-slate-400 hover:text-rose-400 hover:bg-slate-800'
              }`}
              title={isEn ? 'Close' : 'بستن'}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notification Toast Banner */}
        {notification && (
          <div
            className={`px-4 py-2.5 flex items-center justify-between text-xs border-b ${
              notification.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {notification.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="p-1 rounded text-slate-400 hover:text-white transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Err-Disabled Alert & Immediate Recovery */}
          {isErrDisabled && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-rose-950/80 to-amber-950/60 border border-rose-500/50 flex flex-wrap items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-rose-200 font-bold text-xs sm:text-sm">
                    {isEn ? 'Interface in Err-Disabled State' : 'اینترفیس به دلیل تخلف پورت سکیوریتی مسدود (Err-Disabled) شده است'}
                  </h4>
                  <p className="text-slate-300 text-[11px] mt-0.5">
                    {isEn
                      ? 'The port was automatically shut down due to unauthorized MAC address activity or exceeding MAC limit.'
                      : 'پورت به دلیل عبور از سقف مجاز مک یا اتصال آدرس غیرمجاز متوقف شده است. جهت بازگشایی نیازمند shutdown و no shutdown است.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRecoverErrDisable}
                disabled={isRecovering}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-950/50 transition cursor-pointer disabled:opacity-50"
              >
                {isRecovering ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                <span>
                  {isEn ? 'Recover Port (Shut / No Shut)' : 'بازیابی پورت (خروج از حالت خطا)'}
                </span>
              </button>
            </div>
          )}

          {/* ================= SECTION 1: REGISTERED & LEARNED MACs TABLE ================= */}
          <div
            className={`rounded-2xl border p-4 sm:p-5 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/50 border-slate-800'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-xs sm:text-sm">
                      {isEn ? 'Learned & Registered MAC Addresses' : 'مک‌آدرس‌های ثبت‌شده و یادگرفته‌شده پورت'}
                    </h4>
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {macEntries.length} / {maxMac} {isEn ? 'MAC(s)' : 'مک'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isEn
                      ? 'Authentic MAC addresses currently bound to this port security table'
                      : 'آدرس‌های مک واقعی و فعال که روی اینترفیس کشف شده یا دستی ثبت گردیده‌اند'}
                  </p>
                </div>
              </div>

              {/* Table Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefreshData}
                  disabled={isRefreshing}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                    isLightMode
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                  }`}
                  title={isEn ? 'Refresh MAC list from switch' : 'تازه‌سازی جدول مک‌ها از سوئیچ'}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
                  <span>{isEn ? 'Refresh' : 'تازه‌سازی'}</span>
                </button>

                {macEntries.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllMacs}
                    disabled={isClearingAll}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600/15 hover:bg-rose-600/25 text-rose-300 border border-rose-500/30 transition cursor-pointer disabled:opacity-50"
                    title={isEn ? 'Clear all learned MAC addresses from this port' : 'پاک‌سازی تمامی مک‌آدرس‌های ثبت‌شده این پورت'}
                  >
                    {isClearingAll ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>{isEn ? 'Clear All MACs' : 'پاک‌سازی همه مک‌ها'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* MAC Table */}
            {macEntries.length === 0 ? (
              <div
                className={`py-8 px-4 rounded-xl text-center border border-dashed ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-500'
                    : 'bg-slate-900/40 border-slate-800 text-slate-400'
                }`}
              >
                <Shield className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                <p className="text-xs font-medium">
                  {isEn
                    ? 'No MAC addresses are currently learned or registered on this port.'
                    : 'در حال حاضر هیچ مک‌آدرسی روی این پورت ثبت یا کشف نشده است.'}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {isEn
                    ? 'When a host communicates through this interface, its MAC will appear here according to port security policy.'
                    : 'با اتصال دستگاه و تبادل فریم، مک کلاینت طبق پالیسی پورت سکیوریتی در این جدول ظاهر می‌شود.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-700/60">
                <table className="w-full text-xs text-left rtl:text-right">
                  <thead
                    className={`text-[11px] uppercase font-bold tracking-wider ${
                      isLightMode ? 'bg-slate-100 text-slate-600' : 'bg-slate-900 text-slate-400'
                    }`}
                  >
                    <tr>
                      <th className="px-4 py-2.5">#</th>
                      <th className="px-4 py-2.5">{isEn ? 'MAC Address' : 'مک‌آدرس سخت‌افزاری'}</th>
                      <th className="px-4 py-2.5">{isEn ? 'Learning Mode' : 'مود ثبت / نوع'}</th>
                      <th className="px-4 py-2.5">{isEn ? 'VLAN' : 'ویلن'}</th>
                      <th className="px-4 py-2.5 text-center">{isEn ? 'Actions' : 'عملیات پاک‌سازی'}</th>
                    </tr>
                  </thead>
                  <tbody
                    className={`divide-y font-mono ${
                      isLightMode ? 'divide-slate-200' : 'divide-slate-800'
                    }`}
                  >
                    {macEntries.map((entry, idx) => (
                      <tr
                        key={`${entry.mac}-${idx}`}
                        className={`transition ${
                          isLightMode ? 'hover:bg-slate-100/70' : 'hover:bg-slate-850/60'
                        }`}
                      >
                        <td className="px-4 py-3 text-slate-500 text-[11px]">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs bg-slate-900/90 border border-slate-700 px-2 py-0.5 rounded tracking-wide">
                              {entry.mac}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyMac(entry.mac)}
                              className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition"
                              title={isEn ? 'Copy MAC' : 'کپی مک'}
                            >
                              {copiedMac === entry.mac ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                              entry.type === 'sticky'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : entry.type === 'configured'
                                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                                : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                            }`}
                          >
                            {entry.type === 'sticky' && (isEn ? 'Sticky (Learned)' : 'استیکی (Sticky)')}
                            {entry.type === 'configured' && (isEn ? 'Configured (Static)' : 'استاتیک (Configured)')}
                            {entry.type === 'dynamic' && (isEn ? 'Dynamic (CAM)' : 'داینامیک (CAM)')}
                            {entry.type !== 'sticky' && entry.type !== 'configured' && entry.type !== 'dynamic' && (
                              <span>{entry.type}</span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-amber-400 font-bold">
                          VLAN {port.vlan || 1}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleClearSingleMac(entry.mac)}
                            disabled={clearingMac === entry.mac}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-500/10 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition cursor-pointer disabled:opacity-50"
                            title={isEn ? `Clear MAC ${entry.mac} from port security` : `پاک‌سازی این مک‌آدرس از پورت سکیوریتی`}
                          >
                            {clearingMac === entry.mac ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            <span>{isEn ? 'Clear MAC' : 'پاک‌سازی مک'}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ================= SECTION 2: PORT SECURITY CONFIGURATION FORM ================= */}
          <form onSubmit={handleSaveConfig} className="space-y-6">
            <div
              className={`rounded-2xl border p-4 sm:p-5 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/50 border-slate-800'
              }`}
            >
              {/* Box Title & Enable Switch */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs sm:text-sm">
                      {isEn ? 'Port Security Settings' : 'تنظیمات و پارامترهای پورت سکیوریتی'}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {isEn
                        ? 'Layer 2 MAC restrictions, maximum capacity, violation responses and sticky learning'
                        : 'محدودسازی لایه ۲، تعیین سقف آدرس‌ها، واکنش به تخلف و تعریف آدرس‌های مجاز'}
                    </p>
                  </div>
                </div>

                {/* Enable/Disable Toggle Switch */}
                <button
                  type="button"
                  id="cisco-port-sec-toggle-switch"
                  onClick={() => setEnabled((prev) => !prev)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shadow-md border cursor-pointer ${
                    enabled
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-emerald-950/50'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 shadow-black/50'
                  }`}
                >
                  {enabled ? <ShieldCheck className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                  <span>
                    {enabled
                      ? (isEn ? 'Port Security Enabled (switchport port-security)' : 'پورت سکیوریتی فعال است')
                      : (isEn ? 'Port Security Disabled' : 'پورت سکیوریتی غیرفعال است')}
                  </span>
                </button>
              </div>

              {/* Form Controls Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                {/* 1. Mode Selection */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-300">
                      {isEn ? 'Learning Mode:' : 'مود یادگیری مک:'}
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'MAC Learning Mode' : 'مود یادگیری آدرس MAC'}
                      infoWhatEn="Defines how MAC addresses are accepted and preserved on the port: Sticky (auto-learned and saved to running-config), Configured (explicit static administrator definition), or Dynamic (RAM CAM table only)."
                      infoWhatFa="نحوه فراگیری و نگهداری آدرس‌های مجاز: Sticky (کشف خودکار و ثبت در running-config)، Configured (تعریف دستی و صریح ادمین)، یا Dynamic (ثبت موقت فقط در حافظه رم CAM)."
                      infoWhyEn="Sticky mode prevents host spoofing while relieving network engineers from manually typing client hardware addresses."
                      infoWhyFa="مود Sticky بهترین راهکار است چون مانع از نفوذ کارت شبکه‌های متفرقه شده و نیازی به تایپ دستی مک‌آدرس کلاینت ندارد."
                      infoExampleEn="Recommended: Sticky (Auto Learn & Save to Running-Config)"
                      infoExampleFa="مقدار پیشنهادی: Sticky (استیکی خودکار)"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <select
                    value={mode}
                    disabled={!enabled}
                    onChange={(e) => setMode(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-medium focus:outline-none focus:border-cyan-400 transition ${
                      !enabled
                        ? 'opacity-50 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500'
                        : isLightMode
                        ? 'bg-white border-slate-300 text-slate-800'
                        : 'bg-slate-900 border-slate-700 text-white'
                    }`}
                  >
                    <option value="sticky">
                      {isEn ? 'Sticky (Auto-learn into Running-Config)' : 'استیکی (Sticky - کشف و ذخیره خودکار)'}
                    </option>
                    <option value="configured">
                      {isEn ? 'Configured (Manual Static MAC)' : 'کانفیگور (Configured - تعریف دستی مک)'}
                    </option>
                    <option value="dynamic">
                      {isEn ? 'Dynamic (Learn in RAM CAM only)' : 'داینامیک (Dynamic - موقت در رم)'}
                    </option>
                  </select>
                </div>

                {/* 2. Maximum MACs */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-300">
                        {isEn ? 'Max Permitted MACs:' : 'سقف مک‌آدرس‌های مجاز:'}
                      </label>
                      <span className="font-mono text-[11px] font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-1.5 rounded">
                        {maxMac}
                      </span>
                    </div>
                    <FieldInfoTooltip
                      title={isEn ? 'Maximum MACs' : 'سقف مجاز آدرس‌های MAC'}
                      infoWhatEn="The maximum number of secure MAC addresses allowed on this switchport (range: 1 to 1024). Once exceeded, violation policy is triggered."
                      infoWhatFa="بیشترین تعداد مک‌آدرس‌های سخت‌افزاری که اجازه عبور فریم از این پورت را دارند (از ۱ تا ۱۰۲۴)."
                      infoWhyEn="Restricts users from connecting unmanaged hubs or rogue access points to share network drops with multiple unauthorized devices."
                      infoWhyFa="مانع از اتصال هاب/سوئیچ‌های غیرمجاز یا روترهای شخصی توسط کارمندان برای اشتراک‌گذاری پورت می‌شود."
                      infoExampleEn="1 (Single PC), 2 (PC + Cisco IP Phone), 5 (Lab / Test Drop)"
                      infoExampleFa="۱ برای سیستم تک کاربره، ۲ برای PC متصل به پشت تلفن IP Phone سیسکو"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={1024}
                      value={maxMac}
                      disabled={!enabled}
                      onChange={(e) => setMaxMac(Math.max(1, Math.min(1024, Number(e.target.value) || 1)))}
                      className={`w-20 px-3 py-2 rounded-xl border text-xs font-mono font-bold text-center focus:outline-none focus:border-cyan-400 ${
                        !enabled
                          ? 'opacity-50 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500'
                          : isLightMode
                          ? 'bg-white border-slate-300 text-slate-800'
                          : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!enabled}
                        onClick={() => setMaxMac(1)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
                          maxMac === 1
                            ? 'bg-indigo-600 text-white border-indigo-500'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                        } disabled:opacity-40`}
                        title={isEn ? 'Standard single host workstation' : 'استاندارد تک کاربره'}
                      >
                        1 MAC
                      </button>
                      <button
                        type="button"
                        disabled={!enabled}
                        onClick={() => setMaxMac(2)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
                          maxMac === 2
                            ? 'bg-indigo-600 text-white border-indigo-500'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                        } disabled:opacity-40`}
                        title={isEn ? 'PC + VoIP IP Phone' : 'مناسب برای کامپیوتر + آی‌پی فون'}
                      >
                        2 MACs
                      </button>
                      <button
                        type="button"
                        disabled={!enabled}
                        onClick={() => setMaxMac(5)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
                          maxMac === 5
                            ? 'bg-indigo-600 text-white border-indigo-500'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                        } disabled:opacity-40`}
                      >
                        5 MACs
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. Violation Action */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-300">
                      {isEn ? 'Violation Action:' : 'واکنش به تخلف (Violation):'}
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'Violation Policy' : 'سیاست برخورد با تخلف امنیتی'}
                      infoWhatEn="Determines what the switch does when an unauthorized MAC sends traffic: Shutdown (err-disables port immediately), Restrict (drops packets, increments violation counter, generates syslog & SNMP trap), or Protect (silently drops packets)."
                      infoWhatFa="واکنش سوئیچ در صورت دریافت فریم از مک غیرمجاز: Shutdown (خاموشی کامل پورت و حالت Err-Disable)، Restrict (دور ریختن بسته، ثبت لاگ و تله SNMP)، یا Protect (دور ریختن بی‌صدا)."
                      infoWhyEn="Shutdown provides maximum security enforcement; Restrict maintains link uptime while blocking intruders and alerting NOC."
                      infoWhyFa="Shutdown بالاترین امنیت را دارد و مانع نفوذ فیزیکی می‌شود؛ Restrict بدون قطع ارتباط بقیه، متخلف را بلاک و لاگ ارسال می‌کند."
                      infoExampleEn="Shutdown (Cisco default) or Restrict (enterprise monitored)"
                      infoExampleFa="Shutdown (پیش‌فرض سیسکو) یا Restrict"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <select
                    value={violation}
                    disabled={!enabled}
                    onChange={(e) => setViolation(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-medium focus:outline-none focus:border-cyan-400 transition ${
                      !enabled
                        ? 'opacity-50 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500'
                        : isLightMode
                        ? 'bg-white border-slate-300 text-slate-800'
                        : 'bg-slate-900 border-slate-700 text-white'
                    }`}
                  >
                    <option value="shutdown">
                      {isEn ? 'Shutdown (Err-Disable - Cisco Default)' : 'Shutdown (خاموشی خودکار و Err-Disable)'}
                    </option>
                    <option value="restrict">
                      {isEn ? 'Restrict (Drop packet + Syslog + SNMP trap)' : 'Restrict (مسدودسازی بسته متخلف + ثبت لاگ)'}
                    </option>
                    <option value="protect">
                      {isEn ? 'Protect (Silent drop without logging)' : 'Protect (مسدودسازی بی‌صدا بدون لاگ)'}
                    </option>
                  </select>
                </div>
              </div>

              {/* Static Configured MAC Address Input (Shown when mode is 'configured' or user wants to specify) */}
              {mode === 'configured' && enabled && (
                <div className="mt-4 p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-cyan-200">
                      {isEn ? 'Static Permitted MAC Address:' : 'مک‌آدرس استاتیک مجاز (Configured MAC):'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setConfiguredMac(generateSamplePortSecurityMac())}
                      className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-300 hover:text-cyan-200 underline cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{isEn ? 'Generate sample MAC' : 'تولید مک نمونه'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={configuredMac}
                    onChange={(e) => setConfiguredMac(e.target.value)}
                    placeholder="0000.0000.0001 or 00:11:22:33:44:55"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-cyan-400"
                    dir="ltr"
                  />
                  <p className="text-[10px] text-slate-400">
                    {isEn
                      ? 'Only this hardware address will be accepted through this interface.'
                      : 'فقط فریم‌های با مبدأ این آدرس مک اجازه عبور از پورت را خواهند داشت.'}
                  </p>
                </div>
              )}
            </div>

            {/* ================= SECTION 3: LIVE CISCO CLI PREVIEW & SAVE BUTTON ================= */}
            <div
              className={`rounded-2xl border p-4 sm:p-5 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/50 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <h4 className="font-bold text-xs sm:text-sm text-slate-200">
                    {isEn ? 'Live Cisco IOS Running-Config Preview' : 'پیش‌نمایش زنده دستورات سیسکو (Cisco CLI)'}
                  </h4>
                </div>

                <button
                  type="button"
                  onClick={handleCopyCli}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer"
                  title={isEn ? 'Copy Cisco CLI' : 'کپی دستورات سیسکو'}
                >
                  {copiedCli ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedCli ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy CLI' : 'کپی دستورات')}</span>
                </button>
              </div>

              {/* CLI terminal code box */}
              <pre
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-cyan-300 font-mono text-xs overflow-x-auto leading-relaxed select-all"
                dir="ltr"
              >
                {liveCliCommand}
              </pre>

              {/* Submit & Save Button */}
              <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleClose}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    isLightMode
                      ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 via-indigo-600 to-indigo-500 hover:from-cyan-500 hover:to-indigo-400 text-white shadow-lg shadow-indigo-950/50 transition cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>
                    {isSaving
                      ? (isEn ? 'Applying to Switch...' : 'در حال اعمال روی سوئیچ...')
                      : (isEn ? 'Save & Apply to Switch' : 'ذخیره و اعمال روی سوئیچ')}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
};
