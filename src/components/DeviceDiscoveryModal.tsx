import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Radar,
  Play,
  Square,
  Search,
  Filter,
  Layers,
  Copy,
  Check,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
  Sliders,
  Server,
  Router as RouterIcon,
  Shield,
  Radio,
  Globe,
  Terminal,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ArrowDown,
  Hash,
  ArrowUpDown,
  Lock,
  CheckSquare,
  SquareDashed,
  Cpu,
  Activity,
  HardDrive,
  Eye,
  EyeOff,
  KeyRound,
  Building2,
  Tag,
  MapPin,
  HelpCircle,
  Info,
  CheckCircle,
} from 'lucide-react';
import { ModalHeaderControls } from './common/ModalHeaderControls';
import { FieldInfoTooltip } from './common/FieldInfoTooltip';
import { VaultPasswordPickerModal } from './vault/VaultPasswordPickerModal';
import { useModalDock } from '../context/ModalDockContext';
import {
  DiscoveredNetworkDevice,
  DiscoveredNetworkPortDetail,
  DeviceType,
  DevicePlatform,
} from '../types';

export interface DeviceDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  onDeviceAdded?: () => void;
  onAddDevice?: (discovered: DiscoveredNetworkDevice) => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

const COMMON_SUBNET_PRESETS = [
  { label: '192.168.1.0/24 (LAN 1)', value: '192.168.1.0/24' },
  { label: '192.168.10.0/24 (Management)', value: '192.168.10.0/24' },
  { label: '10.0.0.0/24 (Core VLAN)', value: '10.0.0.0/24' },
  { label: '172.16.0.0/24 (Distribution)', value: '172.16.0.0/24' },
  { label: '127.0.0.1 (Localhost)', value: '127.0.0.1' },
];

interface StandardPortOption {
  port: number;
  name: string;
  descEn: string;
  descFa: string;
  color: string;
}

const STANDARD_PORTS: StandardPortOption[] = [
  {
    port: 22,
    name: 'SSH',
    descEn: 'Secure Shell (Standard for modern Cisco, MikroTik & Linux)',
    descFa: 'پوسته امن (استاندارد تجهیزات مدرن سیسکو، میکروتیک و سرورها)',
    color: 'emerald',
  },
  {
    port: 23,
    name: 'Telnet',
    descEn: 'Legacy management (Common on older Cisco switches/routers)',
    descFa: 'مدیریت ریموت لگسی (رایج در سوییچ‌ها و روترهای نسل قدیم سیسکو)',
    color: 'amber',
  },
  {
    port: 161,
    name: 'SNMP',
    descEn: 'Simple Network Management Protocol (Telemetry & MIBs)',
    descFa: 'پروتکل مدیریت شبکه (مانیتورینگ، تلمتری و خواندن اینترفیس‌ها)',
    color: 'purple',
  },
  {
    port: 80,
    name: 'HTTP',
    descEn: 'Web Management (Cisco CNA, MikroTik WebFig, Device GUI)',
    descFa: 'رابط وب مدیریت (Cisco CNA، میکروتیک وب‌فیگ و پنل تحت وب)',
    color: 'sky',
  },
  {
    port: 443,
    name: 'HTTPS',
    descEn: 'Secure Web GUI (Cisco SD-WAN, Device Manager, RouterOS SSL)',
    descFa: 'رابط وب امن SSL (مدیریت تحت وب رمزنگاری‌شده و سیسکو)',
    color: 'cyan',
  },
];

const NETWORK_ROLE_OPTIONS = [
  { value: 'Access', labelEn: 'Access Switch', labelFa: 'سوییچ دسترسی (Access)' },
  { value: 'Distribution', labelEn: 'Distribution Switch', labelFa: 'سوییچ توزیع (Distribution)' },
  { value: 'Core', labelEn: 'Core Switch / Backbone', labelFa: 'سوییچ مرکزی (Core)' },
  { value: 'Edge', labelEn: 'Edge Gateway / WAN', labelFa: 'گیت‌وی لبه شبکه (Edge WAN)' },
  { value: 'Spine / Leaf', labelEn: 'DataCenter Spine/Leaf', labelFa: 'دیتاسنتر اسپاین و لیف' },
  { value: 'Firewall', labelEn: 'Security Perimeter', labelFa: 'فایروال محیطی و امنیت' },
];

export const DeviceDiscoveryModal: React.FC<DeviceDiscoveryModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  onDeviceAdded,
  onAddDevice,
  isLightMode = false,
  isEn = true,
}) => {
  // Modal window states
  const [isMaximized, setIsMaximized] = useState(false);

  // Scan input states
  const [ipRangeInput, setIpRangeInput] = useState('192.168.1.0/24');
  const [selectedStandardPorts, setSelectedStandardPorts] = useState<number[]>([22, 23, 161, 443]);
  const [customPorts, setCustomPorts] = useState<number[]>([]);
  const [customPortInput, setCustomPortInput] = useState('');
  const [timeoutMs, setTimeoutMs] = useState(800);
  const [concurrency, setConcurrency] = useState(300);

  // Execution states
  const [isScanning, setIsScanning] = useState(false);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [progressRequested, setProgressRequested] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressScanned, setProgressScanned] = useState(0);
  const [scanStartTime, setScanStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredNetworkDevice[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [validationBanner, setValidationBanner] = useState<{
    en: string;
    fa: string;
    requested?: number;
    limit?: number;
  } | null>(null);

  // Filtering & Selection states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlatform, setFilterPlatform] = useState<'all' | 'cisco' | 'mikrotik' | 'other'>('all');
  const [filterType, setFilterType] = useState<'all' | 'switch' | 'router' | 'firewall' | 'access_point'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'new_only' | 'in_inventory'>('all');
  const [selectedIps, setSelectedIps] = useState<Set<string>>(new Set());
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [isConfigCollapsed, setIsConfigCollapsed] = useState<boolean>(false);
  const modalBodyRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  // SSE EventSource reference & timer
  const eventSourceRef = useRef<EventSource | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ToolsDock context
  const { dockModal, undockModal } = useModalDock();

  // =========================================================================
  // Phase 3: Onboarding & Enrollment Modal States
  // =========================================================================
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [enrollTargets, setEnrollTargets] = useState<DiscoveredNetworkDevice[]>([]);
  const [enrollName, setEnrollName] = useState('');
  const [enrollType, setEnrollType] = useState<DeviceType>('switch');
  const [enrollRole, setEnrollRole] = useState('Access');
  const [enrollPlatform, setEnrollPlatform] = useState<DevicePlatform>('cisco_ios');
  const [enrollProtocol, setEnrollProtocol] = useState<'ssh' | 'telnet'>('ssh');
  const [enrollPort, setEnrollPort] = useState(22);
  const [enrollSshVersion, setEnrollSshVersion] = useState<'auto' | 'modern' | 'legacy'>('legacy');
  const [enrollUsername, setEnrollUsername] = useState('admin');
  const [enrollPassword, setEnrollPassword] = useState('');
  const [enrollShowPassword, setEnrollShowPassword] = useState(false);
  const [enrollSshVaultItemId, setEnrollSshVaultItemId] = useState<string | null>(null);
  const [enrollEnablePassword, setEnrollEnablePassword] = useState('');
  const [enrollShowEnablePassword, setEnrollShowEnablePassword] = useState(false);
  const [enrollEnableVaultItemId, setEnrollEnableVaultItemId] = useState<string | null>(null);
  const [enrollBuilding, setEnrollBuilding] = useState('Central Building');
  const [enrollFloor, setEnrollFloor] = useState('Server Room');
  const [enrollUnit, setEnrollUnit] = useState('IT Department');
  const [enrollRack, setEnrollRack] = useState('Rack-A1');
  const [enrollTags, setEnrollTags] = useState('discovered, cisco');
  const [isSubmittingEnroll, setIsSubmittingEnroll] = useState(false);
  const [enrollSuccessToast, setEnrollSuccessToast] = useState<string | null>(null);
  const [isVaultPickerOpen, setIsVaultPickerOpen] = useState(false);
  const [vaultPickerTarget, setVaultPickerTarget] = useState<'ssh' | 'enable'>('ssh');

  // Combined probe ports
  const allProbePorts = useMemo(() => {
    const set = new Set<number>([...selectedStandardPorts, ...customPorts]);
    return Array.from(set).sort((a, b) => a - b);
  }, [selectedStandardPorts, customPorts]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // Timer effect for elapsed scan time
  useEffect(() => {
    if (isScanning) {
      const start = Date.now();
      setScanStartTime(start);
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isScanning]);

  // Handle minimize to ToolsDock
  const handleMinimize = () => {
    dockModal({
      id: 'device_discovery',
      labelEn: 'Device Discovery',
      labelFa: 'کشف تجهیزات شبکه',
      category: 'device',
      badge: isScanning ? 'SCAN' : `${discoveredDevices.length}`,
      onRestore: () => {
        undockModal('device_discovery');
      },
      onClose: () => {
        handleAbortScan();
        undockModal('device_discovery');
        onClose();
      },
    });
    if (onMinimize) onMinimize();
  };

  // Toggle standard port
  const toggleStandardPort = (port: number) => {
    setSelectedStandardPorts((prev) =>
      prev.includes(port) ? prev.filter((p) => p !== port) : [...prev, port]
    );
  };

  // Add custom port
  const handleAddCustomPort = () => {
    const p = parseInt(customPortInput.trim(), 10);
    if (!isNaN(p) && p > 0 && p <= 65535) {
      if (!customPorts.includes(p) && !selectedStandardPorts.includes(p)) {
        setCustomPorts((prev) => [...prev, p].sort((a, b) => a - b));
      }
      setCustomPortInput('');
    }
  };

  // Remove custom port
  const handleRemoveCustomPort = (port: number) => {
    setCustomPorts((prev) => prev.filter((p) => p !== port));
  };

  // Start Discovery Scan via SSE
  const handleStartScan = () => {
    const cleanRange = ipRangeInput.trim();
    if (!cleanRange) {
      setScanError(isEn ? 'Please specify an IP address or CIDR range.' : 'لطفاً یک آدرس IP یا رنج CIDR مشخص کنید.');
      return;
    }

    if (allProbePorts.length === 0) {
      setScanError(isEn ? 'Please select at least one probe port.' : 'لطفاً حداقل یک پورت پویش انتخاب کنید.');
      return;
    }

    // Reset scan telemetry
    setScanError(null);
    setValidationBanner(null);
    setProgressScanned(0);
    setProgressTotal(0);
    setProgressRequested(0);
    setElapsedSeconds(0);
    setDiscoveredDevices([]);
    setSelectedIps(new Set());
    setIsScanning(true);

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const queryParams = new URLSearchParams({
      ipRange: cleanRange,
      ports: allProbePorts.join(','),
      timeoutMs: String(timeoutMs),
      concurrency: String(concurrency),
    });

    const sseUrl = `/api/devices/discover/stream?${queryParams.toString()}`;
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.addEventListener('start', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        setActiveScanId(data.scanId);
        setProgressRequested(data.requested || 0);
        setProgressTotal(data.total || 0);
      } catch {
        // ignore
      }
    });

    es.addEventListener('progress', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        setProgressScanned(data.scanned || 0);
        if (data.total) setProgressTotal(data.total);
      } catch {
        // ignore
      }
    });

    es.addEventListener('host', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        if (data && data.device) {
          const newDevice: DiscoveredNetworkDevice = data.device;
          setDiscoveredDevices((prev) => {
            const exists = prev.some((d) => d.ip === newDevice.ip);
            if (exists) return prev.map((d) => (d.ip === newDevice.ip ? newDevice : d));
            return [newDevice, ...prev];
          });
        }
      } catch {
        // ignore
      }
    });

    es.addEventListener('complete', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        setProgressScanned(data.scanned || data.total || 0);
        if (data.results && Array.isArray(data.results)) {
          setDiscoveredDevices(data.results);
        }
      } catch {
        // ignore
      }
      es.close();
      eventSourceRef.current = null;
      setIsScanning(false);
    });

    es.addEventListener('error', (e: any) => {
      try {
        if (e.data) {
          const errData = JSON.parse(e.data);
          const msgEn = errData.error || 'Discovery scan failed';
          const msgFa = errData.errorFa || errData.error || 'خطا در اجرای پویش کشف تجهیزات';
          setScanError(isEn ? msgEn : msgFa);
          if (errData.requested || errData.limit) {
            setValidationBanner({
              en: msgEn,
              fa: msgFa,
              requested: errData.requested,
              limit: errData.limit,
            });
          }
        } else {
          setScanError(
            isEn ? 'Connection to discovery stream was closed.' : 'اتصال به استریم پویش دیسکاوری قطع شد.'
          );
        }
      } catch {
        setScanError(
          isEn ? 'Stream error during network equipment discovery.' : 'خطای استریم در حین پویش تجهیزات شبکه.'
        );
      }
      es.close();
      eventSourceRef.current = null;
      setIsScanning(false);
    });

    es.onerror = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsScanning(false);
    };
  };

  // Abort Discovery Scan
  const handleAbortScan = async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (activeScanId) {
      try {
        await fetch('/api/devices/discover/abort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scanId: activeScanId }),
        });
      } catch {
        // ignore
      }
    }
    setIsScanning(false);
  };

  // Copy IP to clipboard
  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  // Toggle selection
  const handleToggleSelect = (ip: string) => {
    setSelectedIps((prev) => {
      const next = new Set(prev);
      if (next.has(ip)) next.delete(ip);
      else next.add(ip);
      return next;
    });
  };

  // Select all or deselect all new devices
  const handleSelectAllNew = () => {
    const newDevices = discoveredDevices.filter((d) => !d.alreadyInInventory);
    if (selectedIps.size === newDevices.length && newDevices.length > 0) {
      setSelectedIps(new Set());
    } else {
      setSelectedIps(new Set(newDevices.map((d) => d.ip)));
    }
  };

  // =========================================================================
  // Phase 3: Onboarding Dialog Handlers
  // =========================================================================

  // Open single target onboarding
  const handleOpenSingleEnroll = (dev: DiscoveredNetworkDevice) => {
    setEnrollTargets([dev]);
    const inferredName = dev.hostname
      ? dev.hostname.split('.')[0]
      : dev.platform.startsWith('cisco')
      ? `Cisco-${dev.ip.replace(/\./g, '-')}`
      : dev.platform === 'mikrotik_routeros'
      ? `MikroTik-${dev.ip.replace(/\./g, '-')}`
      : `Device-${dev.ip.replace(/\./g, '-')}`;

    setEnrollName(inferredName);
    setEnrollType(dev.deviceType || 'switch');
    setEnrollRole(dev.suggestedRole || 'Access');
    setEnrollPlatform(dev.platform || 'cisco_ios');
    const proto = dev.preferredProtocol === 'telnet' ? 'telnet' : 'ssh';
    setEnrollProtocol(proto);
    setEnrollPort(proto === 'telnet' ? 23 : 22);
    setEnrollSshVersion(dev.platform === 'cisco_ios_xe' ? 'modern' : 'legacy');
    setEnrollUsername('admin');
    setEnrollPassword('');
    setEnrollSshVaultItemId(null);
    setEnrollEnablePassword('');
    setEnrollEnableVaultItemId(null);
    setEnrollTags('discovered, ' + (dev.platform.startsWith('cisco') ? 'cisco' : 'mikrotik'));
    setEnrollModalOpen(true);
  };

  // Open bulk target onboarding
  const handleOpenBulkEnroll = () => {
    const targets = discoveredDevices.filter(
      (d) => selectedIps.has(d.ip) && !d.alreadyInInventory
    );
    if (targets.length === 0) return;

    setEnrollTargets(targets);
    setEnrollName(isEn ? 'Discovered Network Batch' : 'دسته تجهیزات کشف‌شده');

    // Default to most frequent type & platform
    const isMajorityCisco = targets.filter((t) => t.platform.startsWith('cisco')).length >= targets.length / 2;
    const isMajorityMikroTik = targets.filter((t) => t.platform === 'mikrotik_routeros').length >= targets.length / 2;
    setEnrollPlatform(
      isMajorityCisco ? 'cisco_ios' : isMajorityMikroTik ? 'mikrotik_routeros' : 'cisco_ios_xe'
    );
    setEnrollType(targets[0].deviceType || 'switch');
    setEnrollRole(targets[0].suggestedRole || 'Access');
    setEnrollProtocol('ssh');
    setEnrollPort(22);
    setEnrollSshVersion('legacy');
    setEnrollUsername('admin');
    setEnrollPassword('');
    setEnrollSshVaultItemId(null);
    setEnrollEnablePassword('');
    setEnrollEnableVaultItemId(null);
    setEnrollTags('discovered, batch');
    setEnrollModalOpen(true);
  };

  // Handle Vault Password Picked
  const handleVaultPasswordSelected = (password: string, username?: string, secret?: any) => {
    if (vaultPickerTarget === 'ssh') {
      setEnrollPassword(password);
      if (username) setEnrollUsername(username);
      if (secret && secret.id) setEnrollSshVaultItemId(secret.id);
    } else if (vaultPickerTarget === 'enable') {
      setEnrollEnablePassword(password);
      if (secret && secret.id) setEnrollEnableVaultItemId(secret.id);
    }
    setIsVaultPickerOpen(false);
  };

  // Submit Single or Bulk Enrollment to /api/devices/discover/bulk-add
  const handleConfirmEnroll = async () => {
    if (enrollTargets.length === 0) return;

    setIsSubmittingEnroll(true);
    try {
      const devicesToCreate = enrollTargets.map((target, idx) => {
        let name = enrollTargets.length === 1
          ? (enrollName.trim() || `Device-${target.ip}`)
          : (target.hostname
              ? target.hostname.split('.')[0]
              : `${enrollName.trim().replace(/\s+/g, '-')}-${idx + 1}`);

        return {
          name,
          ip: target.ip,
          type: enrollType,
          role: enrollRole,
          model: target.suggestedModel || (enrollPlatform === 'cisco_ios_xe' ? 'Cisco Catalyst 9000 Series' : enrollPlatform === 'cisco_ios' ? 'Cisco Catalyst 2960 / 3850' : 'Network Hardware'),
          platform: enrollPlatform,
          connection_mode: 'ssh',
          connection_protocol: enrollProtocol,
          ssh_host: target.ip,
          ssh_port: enrollPort,
          ssh_username: enrollUsername.trim() || 'admin',
          ssh_password: enrollPassword,
          ssh_vault_item_id: enrollSshVaultItemId || undefined,
          enable_password: enrollEnablePassword,
          enable_vault_item_id: enrollEnableVaultItemId || undefined,
          ssh_version: enrollSshVersion,
          latency_ms: target.latencyMs || 2,
          building: enrollBuilding.trim(),
          floor: enrollFloor.trim(),
          unit: enrollUnit.trim(),
          rack: enrollRack.trim(),
          tags: enrollTags.split(',').map((t) => t.trim()).filter(Boolean),
        };
      });

      const response = await fetch('/api/devices/discover/bulk-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devices: devicesToCreate }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.errorFa || result.error || 'Failed to enroll network equipment');
      }

      // Mark enrolled devices as already in inventory
      const enrolledIps = new Set(enrollTargets.map((t) => t.ip));
      setDiscoveredDevices((prev) =>
        prev.map((dev) =>
          enrolledIps.has(dev.ip)
            ? { ...dev, alreadyInInventory: true, existingDeviceName: enrollTargets.length === 1 ? enrollName : 'Enrolled Device' }
            : dev
        )
      );

      // Deselect enrolled IPs
      setSelectedIps((prev) => {
        const next = new Set(prev);
        enrolledIps.forEach((ip) => next.delete(ip));
        return next;
      });

      // Show success notification
      setEnrollSuccessToast(
        isEn
          ? `Successfully enrolled ${devicesToCreate.length} network device(s) into inventory!`
          : `با موفقیت ${devicesToCreate.length} تجهیز جدید به لیست موجودی شبکه افزوده شد!`
      );

      // Trigger list refresh
      if (onDeviceAdded) onDeviceAdded();

      setTimeout(() => {
        setEnrollSuccessToast(null);
        setEnrollModalOpen(false);
      }, 1500);
    } catch (err: any) {
      alert(err.message || 'Error onboarding network devices');
    } finally {
      setIsSubmittingEnroll(false);
    }
  };

  // Filtered devices list
  const filteredDevices = useMemo(() => {
    return discoveredDevices.filter((dev) => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchIp = dev.ip.toLowerCase().includes(q);
        const matchHost = (dev.hostname || '').toLowerCase().includes(q);
        const matchModel = (dev.suggestedModel || '').toLowerCase().includes(q);
        const matchRole = (dev.suggestedRole || '').toLowerCase().includes(q);
        const matchPlatform = (dev.platform || '').toLowerCase().includes(q);
        const matchPorts = dev.openPorts.some((p) => String(p).includes(q));
        if (!matchIp && !matchHost && !matchModel && !matchRole && !matchPlatform && !matchPorts) {
          return false;
        }
      }

      // Filter Platform
      if (filterPlatform === 'cisco') {
        if (!dev.platform.startsWith('cisco')) return false;
      } else if (filterPlatform === 'mikrotik') {
        if (dev.platform !== 'mikrotik_routeros') return false;
      } else if (filterPlatform === 'other') {
        if (dev.platform.startsWith('cisco') || dev.platform === 'mikrotik_routeros') return false;
      }

      // Filter Device Type
      if (filterType !== 'all') {
        if (dev.deviceType !== filterType) return false;
      }

      // Filter Status
      if (filterStatus === 'new_only' && dev.alreadyInInventory) return false;
      if (filterStatus === 'in_inventory' && !dev.alreadyInInventory) return false;

      return true;
    });
  }, [discoveredDevices, searchQuery, filterPlatform, filterType, filterStatus]);

  // Statistics calculation
  const stats = useMemo(() => {
    const percent = progressTotal > 0 ? Math.min(100, Math.round((progressScanned / progressTotal) * 100)) : 0;
    const newCount = discoveredDevices.filter((d) => !d.alreadyInInventory).length;
    const inventoryCount = discoveredDevices.filter((d) => d.alreadyInInventory).length;
    const ciscoCount = discoveredDevices.filter((d) => d.platform.startsWith('cisco')).length;
    const mikrotikCount = discoveredDevices.filter((d) => d.platform === 'mikrotik_routeros').length;
    const ratePerSec = elapsedSeconds > 0 ? Math.round(progressScanned / elapsedSeconds) : 0;
    return { percent, newCount, inventoryCount, ciscoCount, mikrotikCount, ratePerSec };
  }, [progressScanned, progressTotal, discoveredDevices, elapsedSeconds]);

  // Device type icon helper
  const getDeviceIcon = (type: DeviceType) => {
    switch (type) {
      case 'router':
        return <RouterIcon className="w-4 h-4 text-amber-400" />;
      case 'firewall':
        return <Shield className="w-4 h-4 text-rose-400" />;
      case 'access_point':
        return <Radio className="w-4 h-4 text-purple-400" />;
      case 'switch':
      default:
        return <Server className="w-4 h-4 text-cyan-400" />;
    }
  };

  // Platform badge helper
  const getPlatformBadge = (platform: DevicePlatform) => {
    if (platform === 'cisco_ios_xe') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-md bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
          <Cpu className="w-3 h-3" /> Cisco IOS-XE
        </span>
      );
    }
    if (platform === 'cisco_ios') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/30">
          <Cpu className="w-3 h-3" /> Cisco IOS
        </span>
      );
    }
    if (platform === 'mikrotik_routeros') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <Activity className="w-3 h-3" /> MikroTik RouterOS
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md bg-slate-500/15 text-slate-300 border border-slate-500/30">
        <Server className="w-3 h-3" /> Generic Network
      </span>
    );
  };

  // Latency badge helper
  const getLatencyBadge = (latencyMs: number) => {
    let colorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (latencyMs > 100) {
      colorClass = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    } else if (latencyMs > 30) {
      colorClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    }
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono rounded border ${colorClass}`}>
        <Zap className="w-2.5 h-2.5" />
        {latencyMs}ms
      </span>
    );
  };

  // Port detail badge helper
  const getPortBadge = (detail: DiscoveredNetworkPortDetail) => {
    let style = 'bg-slate-800 text-slate-300 border-slate-700';
    if (detail.port === 22) {
      style = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    } else if (detail.port === 23) {
      style = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    } else if (detail.port === 161) {
      style = 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    } else if (detail.port === 80 || detail.port === 443) {
      style = 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    }

    return (
      <span
        key={detail.port}
        title={detail.banner ? `${detail.service} (Port ${detail.port}): ${detail.banner}` : `${detail.service} (Port ${detail.port})`}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-mono rounded border ${style}`}
      >
        <span className="font-semibold">{detail.service}</span>
        <span className="opacity-75">:{detail.port}</span>
      </span>
    );
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      id="device-discovery-modal-overlay"
      className={`fixed top-0 left-0 right-0 bottom-8 z-[999990] flex flex-col items-center justify-center transition-all duration-200 ${
        isMaximized
          ? 'p-0'
          : 'p-2 sm:p-4 bg-black/80 backdrop-blur-md'
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        id="device-discovery-modal-window"
        className={`flex flex-col transition-all duration-200 overflow-hidden shadow-2xl ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-6xl h-[calc(100vh-5rem)] max-h-[880px] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-300 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b select-none shrink-0 ${
            isLightMode
              ? 'bg-white border-slate-200'
              : 'bg-slate-900/90 border-slate-800/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl flex items-center justify-center ${
                isScanning
                  ? 'bg-cyan-500/20 text-cyan-400 animate-pulse border border-cyan-500/40'
                  : isLightMode
                  ? 'bg-cyan-50 text-cyan-600 border border-cyan-200'
                  : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
              }`}
            >
              <Radar className={`w-5 h-5 ${isScanning ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">
                  {isEn ? 'Network Equipment Discovery' : 'کشف خودکار تجهیزات شبکه و سیسکو'}
                </h2>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    isScanning
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : isLightMode
                      ? 'bg-slate-200 text-slate-700'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isScanning
                    ? (isEn ? 'SCANNING ACTIVE' : 'در حال پویش')
                    : (isEn ? 'ADAPTIVE MULTI-PORT' : 'پویش تطبیقی چندپورت')}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">
                {isEn
                  ? 'High-speed CIDR scanner for Cisco switches, routers & network hardware with live telemetry'
                  : 'پویشگر سریع سابنت برای سوییچ‌ها، روترها و تجهیزات سیسکو همراه با تلمتری و تشخیص هویت'}
              </p>
            </div>
          </div>

          {/* Universal Header Controls */}
          <ModalHeaderControls
            onClose={onClose}
            onMinimize={handleMinimize}
            onMaximizeToggle={() => setIsMaximized(!isMaximized)}
            isMaximized={isMaximized}
            isLightMode={isLightMode}
            isEn={isEn}
          />
        </div>

        {/* Validation Banner (if any) */}
        {validationBanner && (
          <div className="px-4 py-2.5 bg-rose-500/15 border-b border-rose-500/30 flex items-center justify-between text-xs text-rose-300 shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{isEn ? validationBanner.en : validationBanner.fa}</span>
              {validationBanner.limit && (
                <span className="font-mono font-bold">
                  ({isEn ? 'Max limit' : 'سقف مجاز'}: {validationBanner.limit.toLocaleString()})
                </span>
              )}
            </div>
            <button
              onClick={() => setValidationBanner(null)}
              className="hover:text-white px-2 py-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Scan Error Message */}
        {scanError && !validationBanner && (
          <div className="px-4 py-2 bg-rose-500/15 border-b border-rose-500/30 flex items-center justify-between text-xs text-rose-300 shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{scanError}</span>
            </div>
            <button
              onClick={() => setScanError(null)}
              className="hover:text-white px-2 py-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Body Content - Single authoritative smooth scroll container */}
        <div ref={modalBodyRef} className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 custom-scrollbar">
          {/* Top Scan Configuration Panel */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              isLightMode
                ? 'bg-white border-slate-200 shadow-sm'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            {isConfigCollapsed ? (
              /* Compact Summary View when Collapsed */
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-bold flex items-center gap-1.5 text-cyan-400">
                    <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="font-mono text-sm">{ipRangeInput || '192.168.1.0/24'}</span>
                  </span>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    {allProbePorts.length} {isEn ? 'ports' : 'پورت'} [{allProbePorts.slice(0, 6).join(', ')}{allProbePorts.length > 6 ? '...' : ''}]
                  </span>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    {concurrency} socket / {timeoutMs}ms
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!isScanning ? (
                    <button
                      type="button"
                      onClick={handleStartScan}
                      className="px-3.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-white shadow-sm active:scale-95 transition-all"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{isEn ? 'Start Discovery' : 'شروع پویش'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAbortScan}
                      className="px-3.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-sm active:scale-95 transition-all animate-pulse"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>{isEn ? 'Abort Scan' : 'توقف پویش'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsConfigCollapsed(false)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-colors ${
                      isLightMode
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Edit Parameters' : 'تنظیمات پویش'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                  {/* Subnet / IP Input */}
                  <div className="flex-1 w-full">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-bold">
                        <span>{isEn ? 'Target IP / Subnet Range' : 'محدوده IP یا سابنت هدف'}</span>
                        <FieldInfoTooltip
                          title={isEn ? 'Target Subnet Range' : 'محدوده سابنت هدف'}
                          whatIsIt={
                            isEn
                              ? 'CIDR notation or single IP address to scan (e.g. 192.168.1.0/24 or 10.0.0.1).'
                              : 'نماد CIDR یا آدرس آی‌پی تکی جهت پویش پورت‌ها (مانند 192.168.1.0/24 یا 10.0.0.1).'
                          }
                          whyNeeded={
                            isEn
                              ? 'Defines the network segment containing network switches, routers, firewalls, and APs.'
                              : 'تعیین‌کننده بخش شبکه سازمانی شامل سوییچ‌ها، روترها، فایروال‌ها و اکسس‌پوینت‌ها.'
                          }
                          example={isEn ? '192.168.1.0/24, 10.0.0.0/24' : '192.168.1.0/24 یا 10.0.0.0/24'}
                          isLightMode={isLightMode}
                          isEn={isEn}
                        />
                      </label>

                      {/* Subnet Presets Dropdown & Collapse Button */}
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="hidden sm:inline">{isEn ? 'Presets:' : 'آماده:'}</span>
                        <div className="flex flex-wrap gap-1">
                          {COMMON_SUBNET_PRESETS.slice(0, 3).map((preset) => (
                            <button
                              key={preset.value}
                              type="button"
                              disabled={isScanning}
                              onClick={() => setIpRangeInput(preset.value)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                                ipRangeInput === preset.value
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                  : isLightMode
                                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {preset.value}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsConfigCollapsed(true)}
                          className={`ml-1 px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 cursor-pointer transition-colors border ${
                            isLightMode
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                              : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                          }`}
                          title={isEn ? 'Collapse settings to focus on results' : 'جمع‌کردن کادر تنظیمات'}
                        >
                          <ChevronUp className="w-3 h-3" />
                          <span>{isEn ? 'Collapse' : 'جمع‌کردن'}</span>
                        </button>
                      </div>
                    </div>

                <div className="relative">
                  <input
                    type="text"
                    disabled={isScanning}
                    value={ipRangeInput}
                    onChange={(e) => setIpRangeInput(e.target.value)}
                    placeholder={isEn ? 'e.g. 192.168.1.0/24' : 'مثال: 192.168.1.0/24'}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-mono tracking-wide border transition-all ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-cyan-500'
                        : 'bg-slate-950/80 border-slate-700/80 text-cyan-300 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500/30'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  />
                  <div className={`absolute ${isEn ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-slate-500`}>
                    <Globe className="w-4 h-4 opacity-70" />
                  </div>
                </div>
              </div>

              {/* Action Buttons: Start / Abort */}
              <div className="flex items-center gap-2 w-full lg:w-auto shrink-0 pt-2 lg:pt-5">
                {!isScanning ? (
                  <button
                    type="button"
                    onClick={handleStartScan}
                    className="w-full lg:w-auto px-5 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 shadow-lg bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-white shadow-cyan-500/20 hover:shadow-cyan-500/40 active:scale-[0.98]"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>{isEn ? 'Start Discovery' : 'شروع پویش شبکه'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleAbortScan}
                    className="w-full lg:w-auto px-5 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 shadow-lg bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-rose-600/30 active:scale-[0.98] animate-pulse"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span>{isEn ? 'Abort Scan' : 'توقف پویش'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Target Ports Selection Section */}
            <div className="mt-4 pt-3.5 border-t border-slate-800/60">
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-1.5 text-xs font-bold">
                  <span>{isEn ? 'Target Network Protocols & Ports' : 'پروتکل‌ها و پورت‌های هدف شبکه'}</span>
                  <FieldInfoTooltip
                    title={isEn ? 'Network Probe Ports' : 'پورت‌های پویش شبکه'}
                    whatIsIt={
                      isEn
                        ? 'TCP/UDP ports commonly used for Cisco and network device management.'
                        : 'پورت‌های TCP و UDP که برای ارتباط و مدیریت تجهیزات سیسکو و شبکه استفاده می‌شوند.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Multi-port probing allows identifying Cisco switches, routers, and RouterOS devices with fallback detection.'
                        : 'پویش همزمان چندپورت امکان شناسایی دقیق سوییچ‌ها، روترها و دستگاه‌های میکروتیک را فراهم می‌کند.'
                    }
                    example={isEn ? 'SSH (22), Telnet (23), SNMP (161), HTTPS (443)' : 'SSH (22)، تلنت (23)، SNMP (161)، وب (443)'}
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </label>
                <span className="text-[11px] text-slate-400 font-mono">
                  {isEn ? 'Active ports:' : 'پورت‌های فعال:'} [{allProbePorts.join(', ')}]
                </span>
              </div>

              {/* Standard Ports Checkboxes */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {STANDARD_PORTS.map((sp) => {
                  const isChecked = selectedStandardPorts.includes(sp.port);
                  return (
                    <label
                      key={sp.port}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                        isChecked
                          ? isLightMode
                            ? 'bg-cyan-50/80 border-cyan-300 text-cyan-900 shadow-sm'
                            : 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200'
                          : isLightMode
                          ? 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                          : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/60 text-slate-400'
                      } ${isScanning ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        disabled={isScanning}
                        checked={isChecked}
                        onChange={() => toggleStandardPort(sp.port)}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/30 cursor-pointer"
                      />
                      <div className="flex flex-col">
                        <span className="font-bold flex items-center gap-1">
                          {sp.name}
                          <span className="font-mono text-[10px] opacity-75">:{sp.port}</span>
                        </span>
                        <span className="text-[9px] text-slate-400 truncate max-w-[130px]">
                          {isEn ? sp.descEn.split('(')[0] : sp.descFa.split('(')[0]}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Custom Ports Tag Input */}
              <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
                <span className="text-slate-400 font-medium">
                  {isEn ? 'Custom Ports:' : 'پورت‌های سفارشی:'}
                </span>

                {/* Tags for added custom ports */}
                {customPorts.map((cp) => (
                  <span
                    key={cp}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30"
                  >
                    <span>:{cp}</span>
                    {!isScanning && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomPort(cp)}
                        className="hover:text-white px-0.5 cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </span>
                ))}

                {/* Custom Port Add Input */}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    disabled={isScanning}
                    min={1}
                    max={65535}
                    placeholder={isEn ? 'e.g. 8080' : 'پورت دلخواه'}
                    value={customPortInput}
                    onChange={(e) => setCustomPortInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomPort();
                      }
                    }}
                    className={`w-24 px-2 py-1 text-xs font-mono rounded-lg border ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-800'
                        : 'bg-slate-950 border-slate-700 text-slate-200'
                    }`}
                  />
                  <button
                    type="button"
                    disabled={isScanning || !customPortInput.trim()}
                    onClick={handleAddCustomPort}
                    className="px-2 py-1 text-xs rounded-lg font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Advanced Sliders: Timeout & Concurrency */}
                <div className="flex items-center gap-4 ml-auto">
                  {/* Timeout */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 text-[11px]">{isEn ? 'Timeout:' : 'تایم‌اوت:'}</span>
                    <input
                      type="range"
                      disabled={isScanning}
                      min={300}
                      max={3000}
                      step={100}
                      value={timeoutMs}
                      onChange={(e) => setTimeoutMs(Number(e.target.value))}
                      className="w-16 accent-cyan-400 cursor-pointer"
                    />
                    <span className="font-mono text-[11px] text-cyan-400 w-11">{timeoutMs}ms</span>
                    <FieldInfoTooltip
                      title={isEn ? 'Probe Timeout' : 'زمان تایم‌اوت پاسخ'}
                      whatIsIt={
                        isEn
                          ? 'Maximum duration to wait for a port connection response before moving to next target.'
                          : 'حداکثر مدت زمان انتظار برای دریافت پاسخ اتصال از هر پورت پیش از رفتن به هدف بعدی.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Balance between scan speed and reliability across high-latency WAN links.'
                          : 'ایجاد تعادل میان سرعت پویش و دقت شناسایی در شبکه‌های پرتاخیر یا WAN.'
                      }
                      example={isEn ? '800ms (balanced default)' : '800ms (مقدار استاندارد)'}
                      isLightMode={isLightMode}
                      isEn={isEn}
                    />
                  </div>

                  {/* Concurrency */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 text-[11px]">{isEn ? 'Speed:' : 'سرعت:'}</span>
                    <input
                      type="range"
                      disabled={isScanning}
                      min={50}
                      max={500}
                      step={25}
                      value={concurrency}
                      onChange={(e) => setConcurrency(Number(e.target.value))}
                      className="w-16 accent-cyan-400 cursor-pointer"
                    />
                    <span className="font-mono text-[11px] text-cyan-400 w-12">{concurrency} p</span>
                    <FieldInfoTooltip
                      title={isEn ? 'Scan Concurrency' : 'تعداد سوکت‌های همزمان'}
                      whatIsIt={
                        isEn
                          ? 'Number of simultaneous non-blocking TCP sockets opened in parallel.'
                          : 'تعداد سوکت‌های همزمان موازی باز شده در موتور پویشگر بک‌اند.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Higher concurrency scans entire /24 subnets in 10-15 seconds.'
                          : 'مقادیر بالاتر باعث اتمام اسکن یک سابنت ۲۴/ ظرف ۱۰ تا ۱۵ ثانیه می‌شود.'
                      }
                      example={isEn ? '300 (recommended)' : '300 (پیشنهادی)'}
                      isLightMode={isLightMode}
                      isEn={isEn}
                    />
                  </div>
                </div>
              </div>
            </div>
            </div>
            )}
          </div>

          {/* Live Telemetry & Progress Dashboard */}
          {(isScanning || progressTotal > 0) && (
            <div
              className={`p-3.5 rounded-xl border transition-all ${
                isLightMode
                  ? 'bg-white border-slate-200'
                  : 'bg-slate-900/50 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-bold flex items-center gap-1.5 text-cyan-400">
                    <Activity className={`w-4 h-4 ${isScanning ? 'animate-pulse' : ''}`} />
                    {isScanning
                      ? (isEn ? 'SCANNING SUBNET...' : 'در حال پویش سابنت...')
                      : (isEn ? 'SCAN COMPLETED' : 'پویش به پایان رسید')}
                  </span>
                  <span className="text-slate-400">
                    {progressScanned} / {progressTotal} {isEn ? 'IPs Scanned' : 'آی‌پی بررسی شد'}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>{elapsedSeconds}s</span>
                  </span>
                  {stats.ratePerSec > 0 && (
                    <span className="hidden sm:inline text-slate-500">
                      ({stats.ratePerSec} ips/sec)
                    </span>
                  )}
                  <span className="font-bold text-cyan-400">{stats.percent}%</span>
                </div>
              </div>

              {/* Animated Progress Bar */}
              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 transition-all duration-300 rounded-full"
                  style={{ width: `${stats.percent}%` }}
                />
              </div>

              {/* Quick Stat Counter Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-2 border-t border-slate-800/40 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <div>
                    <span className="text-slate-400 text-[10px] block">
                      {isEn ? 'Discovered Devices' : 'دستگاه‌های پاسخ‌داده'}
                    </span>
                    <span className="font-bold font-mono text-emerald-400">
                      {discoveredDevices.length}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-cyan-400" />
                  <div>
                    <span className="text-slate-400 text-[10px] block">
                      {isEn ? 'New to Onboard' : 'جدید قابل ثبت'}
                    </span>
                    <span className="font-bold font-mono text-cyan-400">
                      {stats.newCount}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-400" />
                  <div>
                    <span className="text-slate-400 text-[10px] block">
                      {isEn ? 'Cisco IOS / XE' : 'تجهیزات سیسکو'}
                    </span>
                    <span className="font-bold font-mono text-blue-400">
                      {stats.ciscoCount}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-400" />
                  <div>
                    <span className="text-slate-400 text-[10px] block">
                      {isEn ? 'Already in Inventory' : 'موجود در سیستم'}
                    </span>
                    <span className="font-bold font-mono text-purple-400">
                      {stats.inventoryCount}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Jump Action when Devices Discovered */}
              {discoveredDevices.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-slate-800/40 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-400 font-mono">
                    {isEn
                      ? `✓ ${discoveredDevices.length} network targets detected in live sweep`
                      : `✓ ${discoveredDevices.length} تجهیز شبکه در پویش زنده شناسایی شد`}
                  </span>
                  <button
                    type="button"
                    onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition-all cursor-pointer shadow-sm active:scale-95"
                    title={isEn ? 'Scroll down to discovered equipment list' : 'اسکرول به لیست تجهیزات کشف‌شده'}
                  >
                    <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
                    <span>{isEn ? `Jump to Discovered List (${discoveredDevices.length})` : `مشاهده لیست تجهیزات (${discoveredDevices.length})`}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Search, Filter Toolbar & Results Section */}
          <div ref={resultsRef} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2 items-center justify-between">
              {/* Search Bar */}
              <div className="relative w-full sm:w-72">
                <Search className={`w-4 h-4 absolute ${isEn ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-slate-500`} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isEn ? 'Search IP, Hostname, Port...' : 'جستجو بر اساس IP، پورت، برند...'}
                  className={`w-full ${isEn ? 'pl-9 pr-3' : 'pr-9 pl-3'} py-1.5 text-xs rounded-xl border transition-all ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-cyan-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-cyan-400'
                  }`}
                />
              </div>

              {/* Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto text-xs">
                {/* Platform Filter */}
                <select
                  value={filterPlatform}
                  onChange={(e: any) => setFilterPlatform(e.target.value)}
                  className={`px-2 py-1 text-xs rounded-lg border cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-700'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  <option value="all">{isEn ? 'All Platforms' : 'همه پلتفرم‌ها'}</option>
                  <option value="cisco">{isEn ? 'Cisco IOS / XE' : 'فقط سیسکو'}</option>
                  <option value="mikrotik">{isEn ? 'MikroTik RouterOS' : 'فقط میکروتیک'}</option>
                  <option value="other">{isEn ? 'Other Network' : 'سایر تجهیزات'}</option>
                </select>

                {/* Device Type Filter */}
                <select
                  value={filterType}
                  onChange={(e: any) => setFilterType(e.target.value)}
                  className={`px-2 py-1 text-xs rounded-lg border cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-700'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  <option value="all">{isEn ? 'All Types' : 'همه انواع'}</option>
                  <option value="switch">{isEn ? 'Switches' : 'سوییچ‌ها'}</option>
                  <option value="router">{isEn ? 'Routers' : 'روترها'}</option>
                  <option value="firewall">{isEn ? 'Firewalls' : 'فایروال‌ها'}</option>
                  <option value="access_point">{isEn ? 'Access Points' : 'اکسس‌پوینت‌ها'}</option>
                </select>

                {/* Status Filter */}
                <select
                  value={filterStatus}
                  onChange={(e: any) => setFilterStatus(e.target.value)}
                  className={`px-2 py-1 text-xs rounded-lg border cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-700'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  <option value="all">{isEn ? 'All Status' : 'همه وضعیت‌ها'}</option>
                  <option value="new_only">{isEn ? 'New Only' : 'فقط تجهیزات جدید'}</option>
                  <option value="in_inventory">{isEn ? 'In Inventory' : 'موجود در سیستم'}</option>
                </select>

                {/* View Mode Toggle: Cards / Table */}
                <div className="flex items-center rounded-lg border border-slate-800 overflow-hidden ml-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    title={isEn ? 'Card Grid View' : 'نمایش کارتی'}
                    className={`p-1.5 text-xs transition-colors cursor-pointer ${
                      viewMode === 'cards'
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    title={isEn ? 'Compact Table View' : 'نمایش جدولی'}
                    className={`p-1.5 text-xs transition-colors cursor-pointer ${
                      viewMode === 'table'
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Server className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Selection & Batch Action Bar */}
            {discoveredDevices.length > 0 && (
              <div
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs border ${
                  isLightMode
                    ? 'bg-slate-100 border-slate-200'
                    : 'bg-slate-900/40 border-slate-800/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSelectAllNew}
                    className="flex items-center gap-1.5 font-medium hover:text-cyan-400 cursor-pointer"
                  >
                    {selectedIps.size > 0 && selectedIps.size === stats.newCount ? (
                      <CheckSquare className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <SquareDashed className="w-4 h-4 text-slate-500" />
                    )}
                    <span>
                      {selectedIps.size > 0
                        ? (isEn ? `Selected (${selectedIps.size})` : `انتخاب‌شده (${selectedIps.size})`)
                        : (isEn ? 'Select All New Devices' : 'انتخاب همه تجهیزات جدید')}
                    </span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-[11px]">
                    {isEn ? `${filteredDevices.length} items shown` : `${filteredDevices.length} مورد یافت شد`}
                  </span>
                  {selectedIps.size > 0 && (
                    <button
                      type="button"
                      onClick={handleOpenBulkEnroll}
                      className="px-3.5 py-1.5 rounded-lg font-bold text-xs bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 flex items-center gap-1.5 cursor-pointer transition-all shadow-md active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>{isEn ? `Enroll Selected (${selectedIps.size})` : `افزودن دسته‌ای (${selectedIps.size})`}</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Empty State / Not Started */}
            {discoveredDevices.length === 0 && !isScanning && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-slate-800 rounded-2xl">
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 mb-3 text-cyan-400">
                  <Radar className="w-8 h-8 opacity-60" />
                </div>
                <h3 className="text-sm font-bold text-slate-300">
                  {isEn ? 'No Discovery Scan Active' : 'هیچ پویشی اجرا نشده است'}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mt-1 mb-4 leading-relaxed">
                  {isEn
                    ? 'Enter an IP range or CIDR subnet (e.g. 192.168.1.0/24), select the target management ports, and click "Start Discovery" to scan and identify network hardware.'
                    : 'آدرس سابنت یا آی‌پی هدف را وارد کنید، پورت‌های مدیریتی مورد نظر را مشخص نمایید و بر روی دکمه "شروع پویش شبکه" کلیک کنید تا تجهیزات به صورت بلادرنگ شناسایی شوند.'}
                </p>
                <button
                  type="button"
                  onClick={handleStartScan}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isEn ? 'Scan 192.168.1.0/24 Now' : 'پویش فوری سابنت 192.168.1.0/24'}</span>
                </button>
              </div>
            )}

            {/* Scanning Empty State */}
            {discoveredDevices.length === 0 && isScanning && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center border border-slate-800 rounded-2xl">
                <Radar className="w-10 h-10 text-cyan-400 animate-spin mb-3" />
                <h3 className="text-sm font-bold text-slate-200">
                  {isEn ? 'Probing Target Network Ports...' : 'در حال پویش پورت‌های تجهیزات در شبکه...'}
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  {progressScanned} / {progressTotal} IPs [{allProbePorts.join(', ')}]
                </p>
              </div>
            )}

            {/* Cards View Mode */}
            {viewMode === 'cards' && filteredDevices.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pr-1">
                {filteredDevices.map((dev) => {
                  const isSelected = selectedIps.has(dev.ip);
                  return (
                    <div
                      key={dev.ip}
                      className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                        isSelected
                          ? isLightMode
                            ? 'bg-cyan-50/60 border-cyan-400 shadow-sm'
                            : 'bg-cyan-950/20 border-cyan-500/50 shadow-lg shadow-cyan-500/5'
                          : isLightMode
                          ? 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                          : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700/80'
                      }`}
                    >
                      <div>
                        {/* Top Card Row */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            {!dev.alreadyInInventory && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelect(dev.ip)}
                                className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/30 cursor-pointer"
                              />
                            )}
                            <div className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center justify-center">
                              {getDeviceIcon(dev.deviceType)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-sm text-cyan-300">
                                  {dev.ip}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyIp(dev.ip)}
                                  className="text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer transition-colors"
                                  title={isEn ? 'Copy IP address' : 'کپی آدرس IP'}
                                >
                                  {copiedIp === dev.ip ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                              {dev.hostname ? (
                                <p className="text-[11px] text-slate-400 truncate max-w-[170px]" title={dev.hostname}>
                                  {dev.hostname}
                                </p>
                              ) : (
                                <p className="text-[10px] text-slate-500 font-mono italic">
                                  {isEn ? 'No PTR record' : 'بدون رکورد DNS'}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            {dev.alreadyInInventory ? (
                              <span
                                className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-purple-500/15 text-purple-300 border border-purple-500/30"
                                title={dev.existingDeviceName || ''}
                              >
                                {isEn ? 'In Inventory' : 'موجود'}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                {isEn ? 'New Device' : 'تجهیز جدید'}
                              </span>
                            )}
                            {getLatencyBadge(dev.latencyMs)}
                          </div>
                        </div>

                        {/* Platform & Role */}
                        <div className="flex flex-wrap items-center gap-1.5 my-2.5">
                          {getPlatformBadge(dev.platform)}
                          <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-slate-800 text-slate-300 border border-slate-700 capitalize">
                            {dev.suggestedRole}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {dev.suggestedModel}
                          </span>
                        </div>

                        {/* Open Ports Badges */}
                        <div className="my-2">
                          <span className="text-[10px] text-slate-500 block mb-1">
                            {isEn ? 'Open Management Ports:' : 'پورت‌های باز کشف‌شده:'}
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {dev.portDetails.map((detail) => getPortBadge(detail))}
                          </div>
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="pt-2.5 mt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
                        <span className="text-[10px] text-slate-500 font-mono">
                          {isEn ? `Preferred: ${dev.preferredProtocol.toUpperCase()}` : `پروتکل ارجح: ${dev.preferredProtocol.toUpperCase()}`}
                        </span>

                        {!dev.alreadyInInventory ? (
                          <button
                            type="button"
                            onClick={() => handleOpenSingleEnroll(dev)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition-colors flex items-center gap-1 cursor-pointer active:scale-95"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{isEn ? 'Add Device' : 'افزودن به تجهیزات'}</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            {dev.existingDeviceName || (isEn ? 'Registered' : 'ثبت شده')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Table View Mode */}
            {viewMode === 'table' && filteredDevices.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-800 custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse" dir={isEn ? 'ltr' : 'rtl'}>
                  <thead className={isLightMode ? 'bg-slate-100 text-slate-700' : 'bg-slate-900 text-slate-300'}>
                    <tr className="border-b border-slate-800">
                      <th className="p-2.5 w-8">
                        <input
                          type="checkbox"
                          checked={selectedIps.size > 0 && selectedIps.size === stats.newCount}
                          onChange={handleSelectAllNew}
                          className="rounded border-slate-700 text-cyan-500"
                        />
                      </th>
                      <th className="p-2.5">{isEn ? 'Target IP' : 'آدرس آی‌پی'}</th>
                      <th className="p-2.5">{isEn ? 'Hostname / PTR' : 'نام هاست'}</th>
                      <th className="p-2.5">{isEn ? 'Platform' : 'پلتفرم'}</th>
                      <th className="p-2.5">{isEn ? 'Type & Role' : 'نوع و نقش'}</th>
                      <th className="p-2.5">{isEn ? 'Open Ports' : 'پورت‌های باز'}</th>
                      <th className="p-2.5">{isEn ? 'Latency' : 'تاخیر'}</th>
                      <th className="p-2.5">{isEn ? 'Status' : 'وضعیت'}</th>
                      <th className="p-2.5 text-right">{isEn ? 'Action' : 'عملیات'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {filteredDevices.map((dev) => {
                      const isSelected = selectedIps.has(dev.ip);
                      return (
                        <tr
                          key={dev.ip}
                          className={`hover:bg-cyan-500/5 transition-colors ${
                            isSelected ? 'bg-cyan-500/10' : ''
                          }`}
                        >
                          <td className="p-2.5">
                            {!dev.alreadyInInventory && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelect(dev.ip)}
                                className="rounded border-slate-700 text-cyan-500 cursor-pointer"
                              />
                            )}
                          </td>
                          <td className="p-2.5 font-bold text-cyan-300 flex items-center gap-1.5">
                            <span>{dev.ip}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyIp(dev.ip)}
                              className="text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                            >
                              {copiedIp === dev.ip ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </td>
                          <td className="p-2.5 text-slate-400 font-sans truncate max-w-[150px]">
                            {dev.hostname || '-'}
                          </td>
                          <td className="p-2.5 font-sans">
                            {getPlatformBadge(dev.platform)}
                          </td>
                          <td className="p-2.5 font-sans capitalize">
                            <span className="flex items-center gap-1 text-slate-300">
                              {getDeviceIcon(dev.deviceType)}
                              <span>{dev.suggestedRole}</span>
                            </span>
                          </td>
                          <td className="p-2.5">
                            <div className="flex flex-wrap gap-1">
                              {dev.portDetails.map((detail) => getPortBadge(detail))}
                            </div>
                          </td>
                          <td className="p-2.5">
                            {getLatencyBadge(dev.latencyMs)}
                          </td>
                          <td className="p-2.5 font-sans">
                            {dev.alreadyInInventory ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                {isEn ? 'In Inventory' : 'موجود'}
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                {isEn ? 'New' : 'جدید'}
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right font-sans">
                            {!dev.alreadyInInventory ? (
                              <button
                                type="button"
                                onClick={() => handleOpenSingleEnroll(dev)}
                                className="px-2 py-0.5 text-xs font-semibold rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 cursor-pointer active:scale-95"
                              >
                                {isEn ? 'Add' : 'افزودن'}
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-500">
                                {dev.existingDeviceName || '—'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer info bar */}
        <div
          className={`px-4 py-2.5 border-t flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 shrink-0 ${
            isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>{isEn ? 'SSH (22)' : 'اس‌اس‌اچ (۲۲)'}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span>{isEn ? 'Telnet (23)' : 'تلنت (۲۳)'}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-400"></span>
              <span>{isEn ? 'SNMP (161)' : 'اس‌ان‌ام‌پی (۱۶۱)'}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span>{isEn ? 'Web GUI (80/443)' : 'وب (۸۰/۴۴۳)'}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1 sm:mt-0">
            <button
              type="button"
              onClick={handleMinimize}
              className="hover:text-cyan-400 cursor-pointer text-[11px]"
            >
              {isEn ? 'Minimize to dock' : 'کوچک‌سازی به نوار ابزار'}
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={onClose}
              className="hover:text-slate-200 cursor-pointer text-[11px]"
            >
              {isEn ? 'Close' : 'بستن'}
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Phase 3: Onboarding & Enrollment Sheet / Dialog (z-[999995])               */}
      {/* ========================================================================= */}
      {enrollModalOpen && (
        <div
          className="fixed top-0 left-0 right-0 bottom-8 z-[999995] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md"
          dir={isEn ? 'ltr' : 'rtl'}
        >
          <div
            className={`w-full max-w-2xl max-h-[calc(100vh-6rem)] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-800'
                : 'bg-slate-950 border-cyan-500/30 text-slate-100'
            }`}
          >
            {/* Enrollment Header */}
            <div
              className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
                isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">
                    {enrollTargets.length === 1
                      ? isEn
                        ? 'Enroll Discovered Equipment'
                        : 'افزودن تجهیز کشف‌شده به شبکه'
                      : isEn
                      ? `Bulk Enroll (${enrollTargets.length}) Network Devices`
                      : `افزودن دسته‌ای (${enrollTargets.length}) تجهیز کشف‌شده`}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isEn
                      ? 'Configure credentials, platform role, and physical metadata'
                      : 'پیکربندی اعتبارنامه، نقش توپولوژی و موقعیت فیزیکی'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnrollModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Success Toast inside Dialog */}
            {enrollSuccessToast && (
              <div className="px-4 py-2.5 bg-emerald-500/20 border-b border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold">{enrollSuccessToast}</span>
              </div>
            )}

            {/* Enrollment Body */}
            <div className="p-4 overflow-y-auto space-y-4 text-xs custom-scrollbar">
              {/* Target Summary Chips */}
              <div
                className={`p-3 rounded-xl border flex flex-col gap-1.5 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <span className="text-[11px] font-bold text-slate-400">
                  {isEn ? 'Target Network Equipment:' : 'تجهیزات هدف:'}
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {enrollTargets.map((tgt) => (
                    <span
                      key={tgt.ip}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[11px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/30"
                    >
                      <span className="font-bold">{tgt.ip}</span>
                      {tgt.suggestedModel && (
                        <span className="opacity-70 text-[10px]">({tgt.suggestedModel.split(' ')[0]})</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>

              {/* Section 1: Classification & Role */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-300 text-xs flex items-center gap-1.5 border-b border-slate-800 pb-1">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isEn ? '1. Equipment Identity & Role' : '۱. هویت و نقش تجهیز در شبکه'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Device Name */}
                  <div>
                    <label className="block font-semibold mb-1 text-[11px]">
                      {isEn ? 'Device Name / Hostname' : 'نام تجهیز / هاست‌نیم'}
                    </label>
                    <input
                      type="text"
                      value={enrollName}
                      onChange={(e) => setEnrollName(e.target.value)}
                      placeholder={isEn ? 'e.g. Core-SW-01' : 'مثال: Core-SW-01'}
                      className={`w-full px-3 py-1.5 rounded-lg border font-mono ${
                        isLightMode
                          ? 'bg-slate-50 text-slate-900 border-slate-300'
                          : 'bg-slate-900 text-slate-100 border-slate-700'
                      }`}
                    />
                  </div>

                  {/* Device Type */}
                  <div>
                    <label className="block font-semibold mb-1 text-[11px]">
                      {isEn ? 'Device Type' : 'نوع تجهیز'}
                    </label>
                    <select
                      value={enrollType}
                      onChange={(e: any) => setEnrollType(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border cursor-pointer ${
                        isLightMode
                          ? 'bg-slate-50 text-slate-900 border-slate-300'
                          : 'bg-slate-900 text-slate-100 border-slate-700'
                      }`}
                    >
                      <option value="switch">{isEn ? 'Switch (سوییچ)' : 'سوییچ (Switch)'}</option>
                      <option value="router">{isEn ? 'Router (روتر)' : 'روتر (Router)'}</option>
                      <option value="firewall">{isEn ? 'Firewall (فایروال)' : 'فایروال (Firewall)'}</option>
                      <option value="access_point">{isEn ? 'Access Point (اکسس‌پوینت)' : 'اکسس‌پوینت (AP)'}</option>
                    </select>
                  </div>

                  {/* Platform */}
                  <div>
                    <label className="block font-semibold mb-1 text-[11px]">
                      {isEn ? 'Manufacturer Platform' : 'پلتفرم و سیستم‌عامل'}
                    </label>
                    <select
                      value={enrollPlatform}
                      onChange={(e: any) => setEnrollPlatform(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border cursor-pointer ${
                        isLightMode
                          ? 'bg-slate-50 text-slate-900 border-slate-300'
                          : 'bg-slate-900 text-slate-100 border-slate-700'
                      }`}
                    >
                      <option value="cisco_ios">Cisco IOS (Catalyst 2960 / 3850)</option>
                      <option value="cisco_ios_xe">Cisco IOS-XE (Catalyst 9000 Series)</option>
                      <option value="mikrotik_routeros">MikroTik RouterOS</option>
                      <option value="generic_linux">Generic Network Equipment</option>
                    </select>
                  </div>

                  {/* Role */}
                  <div>
                    <label className="block font-semibold mb-1 text-[11px]">
                      {isEn ? 'Topology Role' : 'نقش در توپولوژی'}
                    </label>
                    <select
                      value={enrollRole}
                      onChange={(e) => setEnrollRole(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border cursor-pointer ${
                        isLightMode
                          ? 'bg-slate-50 text-slate-900 border-slate-300'
                          : 'bg-slate-900 text-slate-100 border-slate-700'
                      }`}
                    >
                      {NETWORK_ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {isEn ? opt.labelEn : opt.labelFa}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Connection & Credentials */}
              <div className="space-y-3 pt-1">
                <h4 className="font-bold text-slate-300 text-xs flex items-center gap-1.5 border-b border-slate-800 pb-1">
                  <Lock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isEn ? '2. Connection & Security Credentials' : '۲. ارتباط و اعتبارنامه‌های امنیتی'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Protocol */}
                  <div>
                    <label className="block font-semibold mb-1 text-[11px]">
                      {isEn ? 'Protocol' : 'پروتکل ارتباطی'}
                    </label>
                    <select
                      value={enrollProtocol}
                      onChange={(e: any) => {
                        const val = e.target.value;
                        setEnrollProtocol(val);
                        setEnrollPort(val === 'telnet' ? 23 : 22);
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-lg border cursor-pointer ${
                        isLightMode
                          ? 'bg-slate-50 text-slate-900 border-slate-300'
                          : 'bg-slate-900 text-slate-100 border-slate-700'
                      }`}
                    >
                      <option value="ssh">SSH (Encrypted)</option>
                      <option value="telnet">Telnet (Legacy)</option>
                    </select>
                  </div>

                  {/* Port */}
                  <div>
                    <label className="block font-semibold mb-1 text-[11px]">
                      {isEn ? 'Management Port' : 'پورت مدیریت'}
                    </label>
                    <input
                      type="number"
                      value={enrollPort}
                      onChange={(e) => setEnrollPort(Number(e.target.value))}
                      className={`w-full px-3 py-1.5 rounded-lg border font-mono ${
                        isLightMode
                          ? 'bg-slate-50 text-slate-900 border-slate-300'
                          : 'bg-slate-900 text-slate-100 border-slate-700'
                      }`}
                    />
                  </div>

                  {/* SSH Version Algorithm */}
                  <div>
                    <label className="block font-semibold mb-1 text-[11px]">
                      {isEn ? 'SSH Cipher Suite' : 'نسخه و الگوریتم SSH'}
                    </label>
                    <select
                      value={enrollSshVersion}
                      onChange={(e: any) => setEnrollSshVersion(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border cursor-pointer ${
                        isLightMode
                          ? 'bg-slate-50 text-slate-900 border-slate-300'
                          : 'bg-slate-900 text-slate-100 border-slate-700'
                      }`}
                    >
                      <option value="legacy">Legacy (ssh-rsa, 3DES, DH-group1)</option>
                      <option value="modern">Modern (Ed25519, AES-GCM)</option>
                      <option value="auto">Adaptive Auto-Negotiate</option>
                    </select>
                  </div>
                </div>

                {/* Username & Password */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1 text-[11px]">
                      {isEn ? 'SSH / Telnet Username' : 'نام کاربری SSH / Telnet'}
                    </label>
                    <input
                      type="text"
                      value={enrollUsername}
                      onChange={(e) => setEnrollUsername(e.target.value)}
                      placeholder="admin / cisco"
                      className={`w-full px-3 py-1.5 rounded-lg border font-mono ${
                        isLightMode
                          ? 'bg-slate-50 text-slate-900 border-slate-300'
                          : 'bg-slate-900 text-slate-100 border-slate-700'
                      }`}
                    />
                  </div>

                  {/* Password with Vault Picker */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-semibold text-[11px]">
                        {isEn ? 'SSH / Login Password' : 'کلمه عبور ورود (Password)'}
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setVaultPickerTarget('ssh');
                          setIsVaultPickerOpen(true);
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer"
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>{isEn ? 'Pick from Vault' : 'انتخاب از والت'}</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={enrollShowPassword ? 'text' : 'password'}
                        value={enrollPassword}
                        onChange={(e) => {
                          setEnrollPassword(e.target.value);
                          setEnrollSshVaultItemId(null);
                        }}
                        placeholder={isEn ? 'Enter device password...' : 'رمز عبور را وارد کنید...'}
                        className={`w-full pl-3 pr-8 py-1.5 rounded-lg border font-mono ${
                          isLightMode
                            ? 'bg-slate-50 text-slate-900 border-slate-300'
                            : 'bg-slate-900 text-slate-100 border-slate-700'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setEnrollShowPassword((p) => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                      >
                        {enrollShowPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {enrollSshVaultItemId && (
                      <span className="text-[10px] text-emerald-400 mt-0.5 block flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        {isEn ? 'Connected to Password Vault' : 'متصل به والت رمزها'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Cisco Enable Secret with Vault Picker */}
                {enrollPlatform.startsWith('cisco') && (
                  <div className="p-2.5 rounded-xl border border-cyan-500/20 bg-cyan-950/10">
                    <div className="flex items-center justify-between mb-1">
                      <label className="flex items-center gap-1 font-semibold text-[11px] text-cyan-300">
                        <Shield className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Cisco Enable Secret / Privilege Password' : 'رمز عبور سطح دسترسی (Enable Secret)'}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setVaultPickerTarget('enable');
                          setIsVaultPickerOpen(true);
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer"
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>{isEn ? 'Pick Enable Secret' : 'انتخاب رمز Enable از والت'}</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={enrollShowEnablePassword ? 'text' : 'password'}
                        value={enrollEnablePassword}
                        onChange={(e) => {
                          setEnrollEnablePassword(e.target.value);
                          setEnrollEnableVaultItemId(null);
                        }}
                        placeholder={isEn ? 'Leave blank if not configured on switch...' : 'در صورت عدم وجود خالی بگذارید...'}
                        className={`w-full pl-3 pr-8 py-1.5 rounded-lg border font-mono ${
                          isLightMode
                            ? 'bg-slate-50 text-slate-900 border-slate-300'
                            : 'bg-slate-900 text-slate-100 border-slate-700'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setEnrollShowEnablePassword((p) => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                      >
                        {enrollShowEnablePassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 3: Physical Placement & Metadata */}
              <div className="space-y-3 pt-1">
                <h4 className="font-bold text-slate-300 text-xs flex items-center gap-1.5 border-b border-slate-800 pb-1">
                  <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isEn ? '3. Physical Location & Tags' : '۳. موقعیت فیزیکی استقرار و برچسب‌ها'}</span>
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block font-semibold mb-1 text-[11px]">{isEn ? 'Building' : 'ساختمان'}</label>
                    <input
                      type="text"
                      value={enrollBuilding}
                      onChange={(e) => setEnrollBuilding(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border ${
                        isLightMode ? 'bg-slate-50 text-slate-900 border-slate-300' : 'bg-slate-900 text-slate-100 border-slate-700'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-[11px]">{isEn ? 'Floor / Room' : 'طبقه / اتاق'}</label>
                    <input
                      type="text"
                      value={enrollFloor}
                      onChange={(e) => setEnrollFloor(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border ${
                        isLightMode ? 'bg-slate-50 text-slate-900 border-slate-300' : 'bg-slate-900 text-slate-100 border-slate-700'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-[11px]">{isEn ? 'Unit' : 'واحد'}</label>
                    <input
                      type="text"
                      value={enrollUnit}
                      onChange={(e) => setEnrollUnit(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border ${
                        isLightMode ? 'bg-slate-50 text-slate-900 border-slate-300' : 'bg-slate-900 text-slate-100 border-slate-700'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-[11px]">{isEn ? 'Rack' : 'رک'}</label>
                    <input
                      type="text"
                      value={enrollRack}
                      onChange={(e) => setEnrollRack(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border ${
                        isLightMode ? 'bg-slate-50 text-slate-900 border-slate-300' : 'bg-slate-900 text-slate-100 border-slate-700'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-[11px]">{isEn ? 'Tags (comma separated)' : 'برچسب‌ها (با کاما تفکیک کنید)'}</label>
                  <input
                    type="text"
                    value={enrollTags}
                    onChange={(e) => setEnrollTags(e.target.value)}
                    placeholder="cisco, access, floor1"
                    className={`w-full px-3 py-1.5 rounded-lg border ${
                      isLightMode ? 'bg-slate-50 text-slate-900 border-slate-300' : 'bg-slate-900 text-slate-100 border-slate-700'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Enrollment Footer Buttons */}
            <div
              className={`px-4 py-3 border-t flex items-center justify-between shrink-0 ${
                isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <button
                type="button"
                onClick={() => setEnrollModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="button"
                disabled={isSubmittingEnroll}
                onClick={handleConfirmEnroll}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 flex items-center gap-2 cursor-pointer shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {isSubmittingEnroll ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{isEn ? 'Enrolling...' : 'در حال افزودن به موجودی...'}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>
                      {enrollTargets.length === 1
                        ? isEn
                          ? 'Confirm & Add to Inventory'
                          : 'تایید و افزودن به موجودی'
                        : isEn
                        ? `Add All (${enrollTargets.length}) Devices`
                        : `افزودن همه (${enrollTargets.length}) تجهیز`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Vault Password Picker Modal (z-[999999])                                  */}
      {/* ========================================================================= */}
      {isVaultPickerOpen && (
        <VaultPasswordPickerModal
          isOpen={isVaultPickerOpen}
          onClose={() => setIsVaultPickerOpen(false)}
          onSelectPassword={handleVaultPasswordSelected}
          targetHost={enrollTargets[0]?.ip || ''}
          isLightMode={isLightMode}
          isEn={isEn}
          zIndex={999999}
        />
      )}
    </div>,
    document.body
  );
};
