import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  FileCode2,
  X,
  Minus,
  Maximize2,
  Minimize2,
  CheckCircle2,
  AlertTriangle,
  Play,
  Terminal,
  Copy,
  Check,
  Download,
  Server,
  Router as RouterIcon,
  ShieldAlert,
  ArrowRight,
  Info,
  RefreshCw,
  Cpu,
  Layers,
  Sparkles,
  RotateCcw,
  SplitSquareVertical,
  Eye,
  Search,
  AlertCircle,
  Hash,
  Network,
  MapPin,
  Sliders,
  ShieldCheck,
  AlertOctagon,
  WifiOff,
  CheckSquare,
  Square,
  Lock,
  Unlock,
  Activity,
  Flame,
  FastForward,
  Database,
  ScrollText,
  CheckCheck
} from 'lucide-react';
import { Device, ConfigTemplate, TemplateApplyResult, TemplateExecutionLog, AccessPolicy } from '../types';
import { fetchTemplates, applyTemplateToDevice } from '../services/api';
import { logDeviceCommand } from '../services/auditLogger';
import { useLanguage } from '../i18n/LanguageContext';
import { useModalDock } from '../context/ModalDockContext';
import { FieldInfoTooltip } from './common/FieldInfoTooltip';
import { isDeviceActionPermitted } from '../utils/rbac';

export interface ValidationResult {
  valid: boolean;
  errorEn?: string;
  errorFa?: string;
}

// 1. Strict IPv4 validator
export function validateStrictIPv4(val: string): ValidationResult {
  const trimmed = (val || '').trim();
  if (!trimmed) {
    return { valid: false, errorEn: 'IP address is required', errorFa: 'آدرس آی‌پی الزامی است' };
  }
  const parts = trimmed.split('.');
  if (parts.length !== 4) {
    return { valid: false, errorEn: 'Must have 4 octets separated by dots (e.g. 192.168.1.1)', errorFa: 'باید ۴ بخش عددی با نقطه باشد (مثال: ۱۹۲.۱۶۸.۱.۱)' };
  }
  for (let i = 0; i < 4; i++) {
    const p = parts[i];
    if (!/^\d+$/.test(p)) {
      return { valid: false, errorEn: `Octet ${i + 1} must be numeric`, errorFa: `بخش ${i + 1} باید عدد باشد` };
    }
    const num = parseInt(p, 10);
    if (num < 0 || num > 255) {
      return { valid: false, errorEn: `Octet ${i + 1} must be between 0 and 255`, errorFa: `بخش ${i + 1} باید بین ۰ تا ۲۵۵ باشد` };
    }
    if (p.length > 1 && p.startsWith('0')) {
      return { valid: false, errorEn: `Octet ${i + 1} cannot have leading zeroes`, errorFa: `بخش ${i + 1} نباید با صفر شروع شود` };
    }
  }
  const first = parseInt(parts[0], 10);
  if (first === 0 || first === 127) {
    return { valid: false, errorEn: `Prefix ${parts[0]}.0.0.0 is reserved / invalid host`, errorFa: `پیشوند ${parts[0]} رزرو شده است و برای هاست مجاز نیست` };
  }
  if (first >= 224 && first <= 239) {
    return { valid: false, errorEn: 'Multicast address range (224–239.x) cannot be assigned to host', errorFa: 'آدرس مالتی‌کست نمی‌تواند به عنوان آی‌پی هاست تنظیم گردد' };
  }
  if (first >= 240) {
    return { valid: false, errorEn: 'Class E / reserved address range', errorFa: 'آدرس رزرو کلاس E' };
  }
  return { valid: true };
}

// 2. Strict Subnet Mask validator
const VALID_SUBNET_MASKS = new Set([
  '255.0.0.0', '255.128.0.0', '255.192.0.0', '255.224.0.0', '255.240.0.0', '255.248.0.0', '255.252.0.0', '255.254.0.0',
  '255.255.0.0', '255.255.128.0', '255.255.192.0', '255.255.224.0', '255.255.240.0', '255.255.248.0', '255.255.252.0', '255.255.254.0',
  '255.255.255.0', '255.255.255.128', '255.255.255.192', '255.255.255.224', '255.255.255.240', '255.255.255.248', '255.255.255.252',
  '255.255.255.254', '255.255.255.255'
]);

export function validateStrictSubnetMask(val: string): ValidationResult {
  const trimmed = (val || '').trim();
  if (!trimmed) {
    return { valid: false, errorEn: 'Subnet mask is required', errorFa: 'ماسک زیرشبکه الزامی است' };
  }
  if (!VALID_SUBNET_MASKS.has(trimmed)) {
    return { valid: false, errorEn: 'Invalid subnet mask (must be contiguous e.g. 255.255.255.0)', errorFa: 'ماسک نامعتبر است (باید ماسک استاندارد مانند 255.255.255.0 باشد)' };
  }
  return { valid: true };
}

// 3. Strict CIDR prefix validator
export function validateStrictCIDR(val: string): ValidationResult {
  const clean = (val || '').replace('/', '').trim();
  if (!clean) {
    return { valid: false, errorEn: 'CIDR prefix is required', errorFa: 'طول پیشوند CIDR الزامی است' };
  }
  const num = parseInt(clean, 10);
  if (isNaN(num) || num < 1 || num > 32) {
    return { valid: false, errorEn: 'CIDR must be an integer between 1 and 32', errorFa: 'پیشوند CIDR باید عددی بین ۱ تا ۳۲ باشد' };
  }
  return { valid: true };
}

// 4. Strict VLAN ID validator (IEEE 802.1Q)
export function validateStrictVLAN(val: string): ValidationResult {
  const trimmed = (val || '').trim();
  if (!trimmed) {
    return { valid: false, errorEn: 'VLAN ID is required', errorFa: 'شناسه وی‌لن الزامی است' };
  }
  const num = parseInt(trimmed, 10);
  if (isNaN(num) || num < 1 || num > 4094) {
    return { valid: false, errorEn: 'VLAN ID must be an integer between 1 and 4094', errorFa: 'شناسه VLAN باید بین ۱ تا ۴۰۹۴ باشد' };
  }
  return { valid: true };
}

// 5. Strict Hostname validator (RFC 1123)
export function validateStrictHostname(val: string): ValidationResult {
  const trimmed = (val || '').trim();
  if (!trimmed) {
    return { valid: false, errorEn: 'Hostname is required', errorFa: 'نام هاست الزامی است' };
  }
  if (trimmed.length > 63) {
    return { valid: false, errorEn: 'Hostname must be 63 characters or less', errorFa: 'طول نام هاست نباید بیشتر از ۶۳ کاراکتر باشد' };
  }
  if (!/^[a-zA-Z0-9]([-a-zA-Z0-9_]*[a-zA-Z0-9])?$/.test(trimmed)) {
    return { valid: false, errorEn: 'Alphanumeric with hyphens/underscores only (no spaces)', errorFa: 'فقط حروف، اعداد، خط تیره یا آندرلاین بدون فاصله' };
  }
  return { valid: true };
}

// Universal Variable Validator
export function validateVariableField(name: string, value: string): ValidationResult {
  const upper = name.toUpperCase();
  if (upper === 'IP_ADDRESS' || upper === 'DEFAULT_GATEWAY' || upper.includes('IP') || upper.includes('GATEWAY') || upper.includes('DNS') || upper.includes('NTP')) {
    return validateStrictIPv4(value);
  }
  if (upper === 'SUBNET_MASK') {
    return validateStrictSubnetMask(value);
  }
  if (upper === 'SUBNET_CIDR' || upper === 'CIDR') {
    return validateStrictCIDR(value);
  }
  if (upper === 'MANAGEMENT_VLAN' || upper === 'VLAN_ID' || upper === 'VLAN') {
    return validateStrictVLAN(value);
  }
  if (upper === 'DEVICE_NAME' || upper === 'HOSTNAME') {
    return validateStrictHostname(value);
  }
  if (!value || value.trim().length === 0) {
    return { valid: false, errorEn: 'Field cannot be empty', errorFa: 'این مقدار نمی‌تواند خالی باشد' };
  }
  return { valid: true };
}

export function isVendorCompatible(device: Device, template: ConfigTemplate | null): boolean {
  if (!template) return true;
  const model = (device.model || '').toLowerCase();
  const platform = (device.platform || '').toLowerCase();
  const isCisco = model.includes('cisco') || model.includes('catalyst') || platform.includes('cisco') || model.includes('ios');
  const isMikroTik = model.includes('mikrotik') || model.includes('routerboard') || model.includes('crs') || model.includes('ccr') || model.includes('chr') || platform.includes('mikrotik');
  if (template.vendor === 'cisco') return isCisco;
  if (template.vendor === 'mikrotik') return isMikroTik;
  return true;
}

export function isManagementIpModified(oldIp: string, newIp: string): boolean {
  return (oldIp || '').trim() !== (newIp || '').trim();
}

export function assessOperationalRisk(params: {
  isIpChanged: boolean;
  hasVlanChange?: boolean;
  hasHostnameChange?: boolean;
}): 'high' | 'medium' | 'low' {
  if (params.isIpChanged) return 'high';
  if (params.hasVlanChange || params.hasHostnameChange) return 'medium';
  return 'low';
}

interface ApplyTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  targetDevice: Device | null;
  allDevices?: Device[];
  effectivePolicy?: AccessPolicy | null;
  templates?: ConfigTemplate[];
  preselectedTemplateId?: string;
  onApplied?: (updatedDevice: Device) => void;
  isLightMode?: boolean;
}

export const ApplyTemplateModal: React.FC<ApplyTemplateModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  targetDevice: initialTargetDevice,
  allDevices = [],
  effectivePolicy,
  templates: propTemplates,
  preselectedTemplateId,
  onApplied,
  isLightMode: propIsLightMode,
}) => {
  const { t, isEn } = useLanguage();
  const { dockModal, undockModal } = useModalDock();

  const isLightMode = propIsLightMode ?? (() => {
    try {
      if (typeof document === 'undefined') return false;
      return (
        document.querySelector('.theme-light') !== null ||
        document.documentElement.classList.contains('light') ||
        localStorage.getItem('panel_theme') === 'light' ||
        localStorage.getItem('theme_mode') === 'light'
      );
    } catch {
      return false;
    }
  })();

  const [selectedDevice, setSelectedDevice] = useState<Device | null>(
    initialTargetDevice || (allDevices.length > 0 ? allDevices[0] : null)
  );
  const [isMaximized, setIsMaximized] = useState(false);
  const [templates, setTemplates] = useState<ConfigTemplate[]>(propTemplates || []);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(preselectedTemplateId || '');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [activeStep, setActiveStep] = useState<'variables' | 'risk_gate' | 'preview' | 'executing' | 'done'>('variables');

  // Phase 3: Strict Safety Gate & Engineering Sign-Off State
  const [signOffVarsConfirmed, setSignOffVarsConfirmed] = useState(false);
  const [signOffRiskConfirmed, setSignOffRiskConfirmed] = useState(false);
  const [signOffIpConfirmed, setSignOffIpConfirmed] = useState(false);

  // Phase 2: Split View & Highlighting State
  const [splitViewMode, setSplitViewMode] = useState<'split' | 'form' | 'cli'>('split');
  const [highlightTokens, setHighlightTokens] = useState(true);
  const [cliSearchQuery, setCliSearchQuery] = useState('');

  // Interactive Variables State
  const [showAllDevices, setShowAllDevices] = useState(false);
  const prevDeviceRef = useRef<string | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [isIpConfirmed, setIsIpConfirmed] = useState<boolean>(true);
  const [copiedScript, setCopiedScript] = useState(false);

  // Execution state
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<TemplateApplyResult | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Phase 4: Live Execution Streaming & Terminal Console State
  const [streamedLogs, setStreamedLogs] = useState<TemplateExecutionLog[]>([]);
  const [currentStreamIndex, setCurrentStreamIndex] = useState<number>(0);
  const [isStreamingActive, setIsStreamingActive] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [logFilter, setLogFilter] = useState<'all' | 'errors' | 'warns'>('all');
  const [copiedTerminalLogs, setCopiedTerminalLogs] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const streamingTimerRef = useRef<any>(null);

  // Safe backdrop click dismissal control
  const [preventBackdropClose, setPreventBackdropClose] = useState<boolean>(true);
  const mouseDownOnBackdropRef = useRef<boolean>(false);

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      mouseDownOnBackdropRef.current = true;
    } else {
      mouseDownOnBackdropRef.current = false;
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if mousedown also initiated on the backdrop AND backdrop closing is explicitly unlocked AND not currently executing
    if (e.target === e.currentTarget && mouseDownOnBackdropRef.current && !preventBackdropClose && !isApplying) {
      handleClose();
    }
    mouseDownOnBackdropRef.current = false;
  };

  // Close handler with undock and streaming timer cleanup
  const handleClose = () => {
    if (streamingTimerRef.current) {
      clearInterval(streamingTimerRef.current);
      streamingTimerRef.current = null;
    }
    undockModal('apply-template-modal');
    onClose();
  };

  // Universal Minimize handler with ToolsDock registration
  const handleMinimize = () => {
    if (onMinimize) {
      onMinimize();
      return;
    }
    const currentTmpl = templates.find((t) => t.id === selectedTemplateId);
    const tmplName = currentTmpl?.name || (isEn ? 'Config Template' : 'الگوی کانفیگ');
    dockModal({
      id: 'apply-template-modal',
      labelEn: `Apply Template (${tmplName})`,
      labelFa: `اعمال الگو (${tmplName})`,
      badge: currentTmpl?.vendor === 'mikrotik' ? 'MikroTik' : currentTmpl?.vendor === 'cisco' ? 'Cisco' : 'CLI',
      category: 'config',
      onRestore: () => {
        // Handled by parent or dock
      },
      onClose: () => {
        undockModal('apply-template-modal');
        onClose();
      },
    });
    onClose();
  };

  // Keyboard Escape listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isApplying) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isApplying]);

  // Sync state whenever modal opens or initial target device changes
  useEffect(() => {
    if (isOpen) {
      if (preselectedTemplateId) {
        setSelectedTemplateId(preselectedTemplateId);
      }
      if (initialTargetDevice) {
        setSelectedDevice(initialTargetDevice);
      } else if (allDevices.length > 0) {
        // Pick device matching template if possible
        const tmpl = (propTemplates || templates).find((t) => t.id === (preselectedTemplateId || selectedTemplateId));
        if (tmpl) {
          const isMikroTikTmpl = tmpl.vendor === 'mikrotik';
          const isCiscoTmpl = tmpl.vendor === 'cisco';
          const matchedDev = allDevices.find((d) => {
            const isDevMikroTik = (d.model || '').toLowerCase().includes('mikrotik') || (d.model || '').toLowerCase().includes('routerboard') || (d.platform || '').toLowerCase().includes('mikrotik');
            const isDevCisco = (d.model || '').toLowerCase().includes('cisco') || (d.model || '').toLowerCase().includes('catalyst') || (d.platform || '').toLowerCase().includes('cisco');
            if (isMikroTikTmpl) return isDevMikroTik;
            if (isCiscoTmpl) return isDevCisco;
            return true;
          });
          setSelectedDevice(matchedDev || allDevices[0]);
        } else {
          setSelectedDevice(allDevices[0]);
        }
      }
      setActiveStep('variables');
      setApplyResult(null);
      setApplyError(null);
      setStreamedLogs([]);
      setCurrentStreamIndex(0);
      setIsStreamingActive(false);
      if (streamingTimerRef.current) {
        clearInterval(streamingTimerRef.current);
        streamingTimerRef.current = null;
      }
    }
  }, [isOpen, preselectedTemplateId, initialTargetDevice, allDevices]);

  // Sync templates if passed via props
  useEffect(() => {
    if (propTemplates && propTemplates.length > 0) {
      setTemplates(propTemplates);
    }
  }, [propTemplates]);

  // Sync preselected template
  useEffect(() => {
    if (preselectedTemplateId) {
      setSelectedTemplateId(preselectedTemplateId);
    }
  }, [preselectedTemplateId]);

  // Load available templates if not provided via props
  useEffect(() => {
    if (!isOpen) return;

    if (propTemplates && propTemplates.length > 0) {
      setTemplates(propTemplates);
      if (preselectedTemplateId) {
        setSelectedTemplateId(preselectedTemplateId);
      } else if (!selectedTemplateId && propTemplates.length > 0) {
        setSelectedTemplateId(propTemplates[0].id);
      }
      return;
    }

    setLoadingTemplates(true);
    fetchTemplates()
      .then((res) => {
        setTemplates(res.templates);
        if (preselectedTemplateId) {
          setSelectedTemplateId(preselectedTemplateId);
        } else if (res.templates.length > 0) {
          const dev = selectedDevice || (allDevices.length > 0 ? allDevices[0] : null);
          if (dev) {
            const isMikroTik = dev.model?.toLowerCase().includes('mikrotik') || dev.model?.toLowerCase().includes('routerboard') || dev.model?.toLowerCase().includes('crs');
            const matched = res.templates.find((t) => {
              const vendorMatch = isMikroTik ? t.vendor === 'mikrotik' : t.vendor === 'cisco';
              const typeMatch = t.target_type === dev.type || t.target_type === 'all';
              return vendorMatch && typeMatch;
            });
            setSelectedTemplateId(matched ? matched.id : res.templates[0].id);
          } else {
            setSelectedTemplateId(res.templates[0].id);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load templates:', err);
      })
      .finally(() => {
        setLoadingTemplates(false);
      });
  }, [isOpen, preselectedTemplateId, propTemplates]);

  const currentTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || null;
  }, [templates, selectedTemplateId]);

  // Vendor detection helpers
  const isDeviceCisco = (d: Device) => {
    const model = (d.model || '').toLowerCase();
    const platform = (d.platform || '').toLowerCase();
    return model.includes('cisco') || model.includes('catalyst') || platform.includes('cisco') || model.includes('ios');
  };

  const isDeviceMikroTik = (d: Device) => {
    const model = (d.model || '').toLowerCase();
    const platform = (d.platform || '').toLowerCase();
    return model.includes('mikrotik') || model.includes('routerboard') || model.includes('crs') || model.includes('ccr') || model.includes('chr') || platform.includes('mikrotik');
  };

  const isDeviceCompatibleWithTemplate = (device: Device, template: ConfigTemplate | null) => {
    if (!template) return true;
    if (template.vendor === 'cisco') return isDeviceCisco(device);
    if (template.vendor === 'mikrotik') return isDeviceMikroTik(device);
    return true;
  };

  // Check RBAC permission for applying template on specific device
  const isDevicePermittedForApply = (device: Device | null): boolean => {
    if (!device) return false;
    if (!effectivePolicy) return true;
    const isSuperAdmin =
      effectivePolicy.id === 'policy-super-admin' ||
      (effectivePolicy.targetScope === 'all' && (effectivePolicy.priority || 0) >= 100);
    if (isSuperAdmin) return true;
    if (effectivePolicy.canApplyTemplates === false) return false;
    return isDeviceActionPermitted(effectivePolicy, device.id, 'apply_template');
  };

  // Strictly filter devices to only those permitted by RBAC
  const rbacPermittedDevices = useMemo(() => {
    if (!effectivePolicy) return allDevices;
    const isSuperAdmin =
      effectivePolicy.id === 'policy-super-admin' ||
      (effectivePolicy.targetScope === 'all' && (effectivePolicy.priority || 0) >= 100);
    if (isSuperAdmin) return allDevices;
    if (effectivePolicy.canApplyTemplates === false) return [];
    return allDevices.filter((d) => isDevicePermittedForApply(d));
  }, [allDevices, effectivePolicy]);

  // Filter permitted devices by template vendor family
  const compatibleDevices = useMemo(() => {
    let list = rbacPermittedDevices;
    if (currentTemplate && currentTemplate.vendor !== 'generic') {
      list = list.filter((d) => isDeviceCompatibleWithTemplate(d, currentTemplate));
    }
    return list;
  }, [rbacPermittedDevices, currentTemplate]);

  // Selectable devices based on family filter toggle, strictly restricted to permitted devices
  const selectableDevices = useMemo(() => {
    if (showAllDevices) {
      return rbacPermittedDevices;
    }
    return compatibleDevices.length > 0 ? compatibleDevices : rbacPermittedDevices;
  }, [showAllDevices, compatibleDevices, rbacPermittedDevices]);

  // Auto-switch to compatible and permitted device when template or selectableDevices change
  useEffect(() => {
    if (selectableDevices.length > 0) {
      if (!selectedDevice || !selectableDevices.some((d) => d.id === selectedDevice.id)) {
        setSelectedDevice(selectableDevices[0]);
      }
    } else {
      setSelectedDevice(null);
    }
  }, [selectableDevices, selectedDevice]);

  // Discovered variables including {{PLACEHOLDER}} in commands
  const allDiscoveredVariables = useMemo(() => {
    if (!currentTemplate) return [];
    const varsMap = new Map<string, { name: string; label: string; description?: string; default_value?: string; type?: string }>();

    // Standard known fields
    const defaultLabels: Record<string, { labelEn: string; labelFa: string; descEn: string; descFa: string }> = {
      DEVICE_NAME: { labelEn: 'Device Hostname', labelFa: 'نام هاست و شناسه تجهیز', descEn: 'System hostname configured on the device', descFa: 'نام هاست تجهیز در شبکه' },
      IP_ADDRESS: { labelEn: 'Management IP Address', labelFa: 'آدرس آی‌پی مدیریتی', descEn: 'IPv4 address for management interface', descFa: 'آدرس آی‌پی اینترفیس مدیریتی' },
      SUBNET_MASK: { labelEn: 'Subnet Mask', labelFa: 'ماسک زیرشبکه', descEn: 'IPv4 dotted subnet mask', descFa: 'ماسک شبکه استاندارد (255.255.255.0)' },
      SUBNET_CIDR: { labelEn: 'Subnet CIDR Prefix', labelFa: 'طول پیشوند زیرشبکه (CIDR)', descEn: 'CIDR prefix length (e.g. 24)', descFa: 'پیشوند شبکه میکروتیک (مثلاً 24)' },
      DEFAULT_GATEWAY: { labelEn: 'Default Gateway', labelFa: 'دروازه پیش‌فرض (Gateway)', descEn: 'Next-hop default gateway IP', descFa: 'آدرس آی‌پی روتر پیش‌فرض' },
      MANAGEMENT_VLAN: { labelEn: 'Management VLAN ID', labelFa: 'شناسه وی‌لن مدیریتی (VLAN ID)', descEn: 'VLAN number for management', descFa: 'شماره وی‌لن پیش‌فرض مدیریت' },
      VLAN_ID: { labelEn: 'VLAN Identifier', labelFa: 'شناسه وی‌لن (VLAN ID)', descEn: 'Standard 802.1Q VLAN number (1-4094)', descFa: 'شماره وی‌لن استاندارد شبکه' },
      VLAN_NAME: { labelEn: 'VLAN Name', labelFa: 'نام وی‌لن', descEn: 'Administrative VLAN description name', descFa: 'عنوان تفکیک‌کننده شبکه وی‌لن' },
      BUILDING: { labelEn: 'Building Location', labelFa: 'نام ساختمان', descEn: 'Physical building name', descFa: 'ساختمان استقرار فیزیکی' },
      FLOOR: { labelEn: 'Floor Level', labelFa: 'طبقه استقرار', descEn: 'Floor location', descFa: 'طبقه محل نصب تجهیز' },
      UNIT: { labelEn: 'Room / Unit', labelFa: 'واحد / اتاق', descEn: 'Room or administrative unit', descFa: 'اتاق یا واحد اداری' },
      RACK: { labelEn: 'Rack Number', labelFa: 'شماره رک', descEn: 'Server/network rack identifier', descFa: 'شناسه رک تجهیزات' },
    };

    // 1. Template defined variables
    (currentTemplate.variables || []).forEach((v) => {
      const known = defaultLabels[v.name];
      varsMap.set(v.name, {
        ...v,
        label: isEn ? (known ? known.labelEn : v.label) : (known ? known.labelFa : v.label),
        description: isEn ? (known ? known.descEn : v.description) : (known ? known.descFa : v.description),
      });
    });

    // 2. Discover placeholders in commands matching {{VAR}}
    const matches = (currentTemplate.commands || '').matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g);
    for (const match of matches) {
      const varName = match[1];
      if (!varsMap.has(varName)) {
        const known = defaultLabels[varName];
        varsMap.set(varName, {
          name: varName,
          label: isEn ? (known ? known.labelEn : varName.replace(/_/g, ' ')) : (known ? known.labelFa : varName.replace(/_/g, ' ')),
          description: isEn ? (known ? known.descEn : '') : (known ? known.descFa : ''),
          default_value: '',
          type: 'text',
        });
      }
    }

    return Array.from(varsMap.values());
  }, [currentTemplate, isEn]);

  // Compute smart default for a variable from the device
  const getSmartDefault = (varName: string, dev: Device | null): string => {
    if (!dev) return '';
    switch (varName) {
      case 'DEVICE_NAME':
      case 'HOSTNAME':
        return dev.name || '';
      case 'IP_ADDRESS':
        return dev.ip || '';
      case 'BUILDING':
        return dev.building || '';
      case 'FLOOR':
        return dev.floor || '';
      case 'UNIT':
        return dev.unit || '';
      case 'RACK':
        return dev.rack || '';
      case 'DEFAULT_GATEWAY':
        if (dev.ip) {
          const parts = dev.ip.split('.');
          if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.${parts[2]}.254`;
          }
        }
        return '';
      case 'SUBNET_MASK':
        return '255.255.255.0';
      case 'SUBNET_CIDR':
        return '24';
      case 'MANAGEMENT_VLAN':
      case 'VLAN_ID':
        return '1';
      default:
        return '';
    }
  };

  // Pre-fill variable values based on current device and template
  useEffect(() => {
    if (!currentTemplate || !selectedDevice) return;

    setVariableValues((prev) => {
      const isNewDevice = prevDeviceRef.current !== selectedDevice.id;
      const initialVars: Record<string, string> = isNewDevice ? {} : { ...prev };

      allDiscoveredVariables.forEach((v) => {
        if (isNewDevice || initialVars[v.name] === undefined || initialVars[v.name] === '') {
          const smartVal = getSmartDefault(v.name, selectedDevice);
          initialVars[v.name] = smartVal || v.default_value || '';
        }
      });

      return initialVars;
    });

    prevDeviceRef.current = selectedDevice.id;
    setIsIpConfirmed(true);
  }, [currentTemplate, selectedDevice, allDiscoveredVariables]);

  // Phase 2: Real-time Strict Validation across all discovered variables
  const validationErrors = useMemo(() => {
    const errors: Record<string, ValidationResult> = {};
    allDiscoveredVariables.forEach((v) => {
      const val = variableValues[v.name] ?? '';
      const res = validateVariableField(v.name, val);
      if (!res.valid) {
        errors[v.name] = res;
      }
    });
    return errors;
  }, [allDiscoveredVariables, variableValues]);

  const isAllVariablesValid = useMemo(() => {
    return Object.keys(validationErrors).length === 0;
  }, [validationErrors]);

  // Phase 3: Dynamic Management IP Change Detection
  const isIpChanging = useMemo(() => {
    if (!selectedDevice) return false;
    const targetIp = (variableValues['IP_ADDRESS'] || '').trim();
    if (!targetIp) return false;
    return targetIp !== selectedDevice.ip.trim();
  }, [selectedDevice, variableValues]);

  // Phase 3: Vendor & OS Architecture Compatibility Guard
  const isVendorMismatch = useMemo(() => {
    if (!selectedDevice || !currentTemplate) return false;
    return !isDeviceCompatibleWithTemplate(selectedDevice, currentTemplate);
  }, [selectedDevice, currentTemplate]);

  // Phase 3: RBAC Clearance Status
  const isRbacCleared = useMemo(() => {
    if (!selectedDevice) return false;
    return isDevicePermittedForApply(selectedDevice);
  }, [selectedDevice, effectivePolicy]);

  // Phase 3: Dynamic Impact & Risk Assessment
  const riskAssessment = useMemo(() => {
    if (!currentTemplate || !selectedDevice) {
      return { level: 'low' as const, flags: [] as string[] };
    }
    const flags: string[] = [];
    const script = (currentTemplate.commands || '').toLowerCase();

    if (isIpChanging) {
      flags.push(isEn ? 'Management IP Address is being reconfigured' : 'آدرس آی‌پی مدیریتی در حال تغییر است');
    }
    if (
      script.includes('interface vlan 1') ||
      script.includes('vlan 1') ||
      script.includes('/interface bridge') ||
      script.includes('spanning-tree')
    ) {
      flags.push(isEn ? 'Core VLAN 1 or RouterOS Bridge infrastructure modified' : 'ساختار وی‌لن ۱ یا بریج مرکزی روتر در حال بازپیکربندی است');
    }
    if (
      script.includes('ip route') ||
      script.includes('/ip route') ||
      script.includes('default-gateway') ||
      (variableValues['DEFAULT_GATEWAY'] && variableValues['DEFAULT_GATEWAY'] !== selectedDevice.ip)
    ) {
      flags.push(isEn ? 'Default gateway / L3 routing table modified' : 'مسیریابی پیش‌فرض یا جدول روتینگ لایه سه تغییر می‌یابد');
    }
    if (
      script.includes('firewall') ||
      script.includes('access-list') ||
      script.includes('/ip firewall') ||
      script.includes('crypto')
    ) {
      flags.push(isEn ? 'Firewall filter or ACL security policies modified' : 'قوانین فایروال یا لیست‌های کنترل دسترسی (ACL) بازنویسی می‌شوند');
    }
    if (variableValues['DEVICE_NAME'] && variableValues['DEVICE_NAME'] !== selectedDevice.name) {
      flags.push(isEn ? 'System hostname is being renamed' : 'نام هاست و شناسه تجهیز تغییر خواهد کرد');
    }

    let level: 'high' | 'medium' | 'low' = 'low';
    if (
      isIpChanging ||
      flags.some((f) =>
        f.includes('VLAN 1') ||
        f.includes('Bridge') ||
        f.includes('routing') ||
        f.includes('Firewall') ||
        f.includes('فایروال') ||
        f.includes('بریج') ||
        f.includes('مسیریابی')
      )
    ) {
      level = 'high';
    } else if (flags.length > 0) {
      level = 'medium';
    }

    return { level, flags };
  }, [currentTemplate, selectedDevice, isIpChanging, variableValues, isEn]);

  // Phase 3: Strict Safety Gate Clearance Boolean
  const isSafetyGateCleared = useMemo(() => {
    if (!isAllVariablesValid) return false;
    if (isVendorMismatch) return false;
    if (!isRbacCleared) return false;
    if (!signOffVarsConfirmed) return false;
    if (!signOffRiskConfirmed) return false;
    if (isIpChanging && !signOffIpConfirmed) return false;
    return true;
  }, [
    isAllVariablesValid,
    isVendorMismatch,
    isRbacCleared,
    signOffVarsConfirmed,
    signOffRiskConfirmed,
    isIpChanging,
    signOffIpConfirmed,
  ]);

  // Render raw script with replaced variables
  const renderedScript = useMemo(() => {
    if (!currentTemplate) return '';
    let script = currentTemplate.commands || '';
    Object.entries(variableValues).forEach(([k, v]) => {
      script = script.split(`{{${k}}}`).join(v || `[${k}]`);
    });
    return script;
  }, [currentTemplate, variableValues]);

  // Copy raw script
  const handleCopyScript = () => {
    navigator.clipboard.writeText(renderedScript);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  // Download raw script
  const handleDownloadScript = () => {
    const ext = currentTemplate?.vendor === 'mikrotik' ? 'rsc' : 'cfg';
    const blob = new Blob([renderedScript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${variableValues['DEVICE_NAME'] || selectedDevice?.name || 'device-config'}.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Reset all variables to smart defaults
  const handleResetAllVariables = () => {
    if (!selectedDevice) return;
    const resetVars: Record<string, string> = {};
    allDiscoveredVariables.forEach((v) => {
      const smartVal = getSmartDefault(v.name, selectedDevice);
      resetVars[v.name] = smartVal || v.default_value || '';
    });
    setVariableValues(resetVars);
    setIsIpConfirmed(true);
  };

  // Reset single variable
  const handleResetSingleVariable = (varName: string) => {
    if (!selectedDevice) return;
    const smartVal = getSmartDefault(varName, selectedDevice);
    const tmplVar = allDiscoveredVariables.find((v) => v.name === varName);
    setVariableValues((prev) => ({
      ...prev,
      [varName]: smartVal || tmplVar?.default_value || '',
    }));
  };

  // Execute template deployment
  const handleExecuteApply = async () => {
    if (!selectedDevice || !currentTemplate) {
      setApplyError(isEn ? 'Please select a target device and template.' : 'لطفاً تجهیز هدف و الگوی کانفیگ را انتخاب فرمایید.');
      return;
    }

    if (!isDevicePermittedForApply(selectedDevice)) {
      setApplyError(
        isEn
          ? `Access Denied: You do not have permission to apply templates to "${selectedDevice.name}".`
          : `دسترسی غیرمجاز: بر اساس سطح دسترسی تعریف‌شده در سیستم RBAC، شما مجاز به اعمال تمپلیت روی تجهیز «${selectedDevice.name}» نمی‌باشید.`
      );
      return;
    }

    if (isVendorMismatch) {
      setApplyError(
        isEn
          ? 'Cannot apply: Vendor / OS architecture mismatch between template and target device.'
          : 'خطای بحرانی: عدم تطابق معماری سیستم‌عامل و برند تجهیز با قالب کانفیگ.'
      );
      return;
    }

    if (!isSafetyGateCleared) {
      setApplyError(
        isEn
          ? 'Safety Gate locked: Please complete the engineering sign-off checklist in the Safety Gate step.'
          : 'گیت ایمنی قفل است: لطفاً چک‌لیست تصدیق مهندسی را در مرحله سنجش ریسک و ایمنی تایید فرمایید.'
      );
      return;
    }

    setIsApplying(true);
    setActiveStep('executing');
    setApplyError(null);
    setStreamedLogs([]);
    setCurrentStreamIndex(0);
    setIsStreamingActive(true);

    try {
      const result = await applyTemplateToDevice({
        device_id: selectedDevice.id,
        template_id: currentTemplate.id,
        resolved_variables: variableValues,
        user_name: effectivePolicy?.name || 'Super Admin',
      });

      setApplyResult(result);

      // Start progressive line-by-line terminal stream with realistic execution pacing
      const allLogs = result.logs || [];
      if (allLogs.length === 0) {
        setIsStreamingActive(false);
        setActiveStep('done');
      } else {
        let index = 0;
        const streamInterval = 65; // Paced CLI stream
        if (streamingTimerRef.current) clearInterval(streamingTimerRef.current);
        streamingTimerRef.current = setInterval(() => {
          if (index < allLogs.length) {
            const nextLog = allLogs[index];
            setStreamedLogs((prev) => [...prev, nextLog]);
            setCurrentStreamIndex(index + 1);
            index++;
          } else {
            if (streamingTimerRef.current) clearInterval(streamingTimerRef.current);
            streamingTimerRef.current = null;
            setIsStreamingActive(false);
            setActiveStep('done');
          }
        }, streamInterval);
      }

      // Audit Log template application in client logger
      try {
        logDeviceCommand({
          deviceId: selectedDevice.id,
          deviceName: selectedDevice.name,
          deviceIp: selectedDevice.ip,
          deviceVendor: selectedDevice.model.toLowerCase().includes('mikrotik') ? 'mikrotik' : 'cisco',
          deviceModel: selectedDevice.model,
          deviceLocation: [selectedDevice.building, selectedDevice.floor, selectedDevice.unit, selectedDevice.rack ? `رک ${selectedDevice.rack}` : ''].filter(Boolean).join(' > '),
          channel: 'template_push',
          command: result.rendered_script || currentTemplate.commands,
          riskLevel: 'medium',
          status: 'success',
          outputSummary: result.message,
          notes: `اعمال موفقیت‌آمیز قالب «${currentTemplate.name}» (Audit ID: ${result.audit_id || 'audit-db'})`,
        });
      } catch (logErr) {
        console.warn('Failed to audit template execution:', logErr);
      }

      if (onApplied) {
        onApplied(result.device);
      }
    } catch (err: any) {
      if (streamingTimerRef.current) clearInterval(streamingTimerRef.current);
      streamingTimerRef.current = null;
      setIsStreamingActive(false);
      setApplyError(err.message || (isEn ? 'Error applying template to device.' : 'خطا در اعمال تمپلیت روی تجهیز'));
      setActiveStep('preview');
    } finally {
      setIsApplying(false);
    }
  };

  // Instant fast-forward stream skip animation
  const handleFastForwardStream = () => {
    if (streamingTimerRef.current) {
      clearInterval(streamingTimerRef.current);
      streamingTimerRef.current = null;
    }
    if (applyResult?.logs) {
      setStreamedLogs(applyResult.logs);
      setCurrentStreamIndex(applyResult.logs.length);
      setIsStreamingActive(false);
      setActiveStep('done');
    }
  };

  // Copy complete terminal output
  const handleCopyTerminalLogs = () => {
    const logsToFormat = streamedLogs.length > 0 ? streamedLogs : (applyResult?.logs || []);
    const formatted = logsToFormat
      .map((l) => `[${l.timestamp}] [${l.status.toUpperCase()}] ${l.prompt} ${l.command}${l.output ? '\n' + l.output : ''}`)
      .join('\n');
    navigator.clipboard.writeText(formatted);
    setCopiedTerminalLogs(true);
    setTimeout(() => setCopiedTerminalLogs(false), 2000);
  };

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamedLogs.length, autoScroll]);

  // Group discovered variables by category
  const categorizedVariables = useMemo(() => {
    const categories: {
      id: 'identity' | 'network' | 'vlan' | 'location' | 'custom';
      titleEn: string;
      titleFa: string;
      icon: any;
      vars: typeof allDiscoveredVariables;
    }[] = [
      {
        id: 'identity',
        titleEn: 'Identity & Host',
        titleFa: 'هویت و نام تجهیز',
        icon: Hash,
        vars: [],
      },
      {
        id: 'network',
        titleEn: 'L3 Network & Addressing',
        titleFa: 'آدرس‌دهی شبکه لایه سه',
        icon: Network,
        vars: [],
      },
      {
        id: 'vlan',
        titleEn: 'L2 Switching & VLANs',
        titleFa: 'سوئیچینگ لایه دو و وی‌لن‌ها',
        icon: Layers,
        vars: [],
      },
      {
        id: 'location',
        titleEn: 'Physical Placement & Rack',
        titleFa: 'استقرار فیزیکی و رک',
        icon: MapPin,
        vars: [],
      },
      {
        id: 'custom',
        titleEn: 'Additional Parameters',
        titleFa: 'سایر پارامترهای قالب کانفیگ',
        icon: Sliders,
        vars: [],
      },
    ];

    allDiscoveredVariables.forEach((v) => {
      const u = v.name.toUpperCase();
      if (u === 'DEVICE_NAME' || u === 'HOSTNAME' || u === 'DOMAIN_NAME') {
        categories[0].vars.push(v);
      } else if (u.includes('IP') || u.includes('SUBNET') || u.includes('GATEWAY') || u.includes('DNS') || u.includes('CIDR') || u.includes('NTP')) {
        categories[1].vars.push(v);
      } else if (u.includes('VLAN') || u.includes('PORT') || u.includes('TRUNK')) {
        categories[2].vars.push(v);
      } else if (u === 'BUILDING' || u === 'FLOOR' || u === 'UNIT' || u === 'RACK' || u.includes('ROOM')) {
        categories[3].vars.push(v);
      } else {
        categories[4].vars.push(v);
      }
    });

    return categories.filter((c) => c.vars.length > 0);
  }, [allDiscoveredVariables]);

  // Phase 2: Live Syntax & Diff Token Renderer for the Terminal
  const renderHighlightedCLILines = () => {
    if (!currentTemplate) return null;
    const raw = currentTemplate.commands || '';
    const lines = raw.split('\n');
    const query = cliSearchQuery.trim().toLowerCase();

    return lines.map((line, lineIdx) => {
      const isLineMatch = !query || line.toLowerCase().includes(query) || Object.entries(variableValues).some(([k, v]) => (v || '').toLowerCase().includes(query) && line.includes(`{{${k}}}`));

      if (query && !isLineMatch) return null;

      const parts = line.split(/(\{\{[A-Za-z0-9_]+\}\})/g);

      return (
        <div
          key={lineIdx}
          className={`flex items-start font-mono text-xs leading-relaxed group hover:bg-white/5 px-2 py-0.5 rounded transition ${
            !isLineMatch ? 'opacity-30' : ''
          }`}
        >
          <span className="w-8 shrink-0 text-right pr-2.5 text-slate-600 select-none text-[11px] font-mono">
            {lineIdx + 1}
          </span>
          <div className="flex-1 whitespace-pre-wrap break-all dir-ltr text-left">
            {parts.map((part, partIdx) => {
              const match = part.match(/^\{\{([A-Za-z0-9_]+)\}\}$/);
              if (match) {
                const varName = match[1];
                const val = variableValues[varName];
                const hasVal = val !== undefined && val !== '';
                const fieldError = validationErrors[varName];
                const isInvalid = Boolean(fieldError);

                if (!highlightTokens) {
                  return (
                    <span key={partIdx} className={hasVal ? 'text-cyan-300 font-semibold' : 'text-amber-400 font-bold'}>
                      {hasVal ? val : `{{${varName}}}`}
                    </span>
                  );
                }

                return (
                  <span
                    key={partIdx}
                    className={`inline-block px-1.5 py-0.2 mx-0.5 rounded font-mono font-bold text-[11px] transition-all shadow-xs ${
                      isInvalid
                        ? 'bg-rose-500/25 text-rose-300 border border-rose-500/60 ring-1 ring-rose-500/30'
                        : hasVal
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
                        : 'bg-amber-500/25 text-amber-300 border border-amber-500/50 animate-pulse'
                    }`}
                    title={`${varName}: ${hasVal ? val : (isEn ? '[EMPTY]' : '[خالی]')}${
                      isInvalid ? ` — ${isEn ? fieldError?.errorEn : fieldError?.errorFa}` : ''
                    }`}
                  >
                    {hasVal ? val : `[${varName}]`}
                  </span>
                );
              }

              // CLI command keyword highlighting
              const isComment = part.trim().startsWith('!') || part.trim().startsWith('#');
              const isSectionHeader = part.trim().startsWith('interface') || part.trim().startsWith('router') || part.trim().startsWith('/ip') || part.trim().startsWith('/interface');

              return (
                <span
                  key={partIdx}
                  className={
                    isComment
                      ? 'text-slate-500 italic'
                      : isSectionHeader
                      ? 'text-cyan-400 font-semibold'
                      : 'text-slate-200'
                  }
                >
                  {part}
                </span>
              );
            })}
          </div>
        </div>
      );
    });
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center ${
        isMaximized ? 'p-0' : 'p-2 sm:p-4'
      } modal-backdrop-blur animate-fadeIn overflow-y-auto`}
      data-modal-backdrop="true"
      dir={isEn ? 'ltr' : 'rtl'}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className={`w-full ${
        isMaximized
          ? 'h-full max-h-full max-w-none rounded-none border-none my-0'
          : 'max-w-7xl max-h-[calc(100vh-4rem)] my-auto rounded-2xl border'
      } flex flex-col overflow-hidden transition-all duration-200 ${
        isLightMode
          ? 'bg-white border-slate-200 text-slate-900 shadow-2xl shadow-slate-900/15'
          : 'bg-slate-900/95 border-white/10 text-slate-100 shadow-[0_0_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl'
      }`}>
        {/* Modal Header (Pinned) */}
        <div className={`flex items-center justify-between p-4 sm:p-5 border-b shrink-0 transition ${
          isLightMode ? 'border-slate-200 bg-slate-50/90' : 'border-white/10 bg-slate-950/60'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isLightMode
                ? 'bg-cyan-50 border-cyan-200 text-cyan-600 shadow-xs'
                : 'bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 text-cyan-400 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
            }`}>
              <FileCode2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`font-bold text-sm sm:text-base ${
                  isLightMode ? 'text-slate-900' : 'text-white glow-text-cyan'
                }`}>
                  {t('apply_modal_title')}
                </h3>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-bold transition-all shadow-sm ${
                    currentTemplate?.vendor === 'mikrotik'
                      ? 'vendor-badge-mikrotik'
                      : currentTemplate?.vendor === 'cisco'
                      ? 'vendor-badge-cisco'
                      : 'vendor-badge-generic'
                  }`}
                >
                  {currentTemplate?.vendor === 'mikrotik'
                    ? 'MikroTik RouterOS'
                    : currentTemplate?.vendor === 'cisco'
                    ? 'Cisco IOS-XE'
                    : 'Generic CLI'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-semibold">
                  Phase 2: Live Split-View & Diff
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {t('apply_modal_subtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Backdrop Dismiss Lock Toggle */}
            <button
              type="button"
              onClick={() => setPreventBackdropClose((prev) => !prev)}
              className={`p-1.5 rounded-xl transition cursor-pointer ${
                isLightMode ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200' : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
              title={
                preventBackdropClose
                  ? (isEn ? 'Backdrop dismiss is locked (Click to allow closing on outside click)' : 'بستن با کلیک روی بک‌دراپ قفل است (جهت فعال‌سازی کلیک کنید)')
                  : (isEn ? 'Backdrop dismiss is enabled (Click to lock and prevent accidental closing)' : 'بستن با کلیک روی بک‌دراپ فعال است (جهت قفل کردن کلیک کنید)')
              }
              aria-label={preventBackdropClose ? 'Unlock backdrop close' : 'Lock backdrop close'}
            >
              {preventBackdropClose ? (
                <Lock className="w-4 h-4 text-amber-400" />
              ) : (
                <Unlock className="w-4 h-4 text-slate-400" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              className={`p-1.5 rounded-xl transition cursor-pointer ${
                isLightMode ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200' : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
              title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از حالت تمام‌صفحه') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
              aria-label={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از حالت تمام‌صفحه') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
            >
              {isMaximized ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={handleMinimize}
              className={`p-1.5 rounded-xl transition cursor-pointer ${
                isLightMode ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200' : 'text-slate-400 hover:text-cyan-300 hover:bg-white/10'
              }`}
              title={isEn ? 'Minimize to ToolsDock' : 'مینیمایز به نوار پایین'}
              aria-label={isEn ? 'Minimize' : 'مینیمایز'}
            >
              <Minus className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className={`p-1.5 rounded-xl transition cursor-pointer ${
                isLightMode ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200' : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
              title={isEn ? 'Close' : 'بستن'}
              aria-label={t('action_close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Workflow Steps Indicator */}
        <div className={`flex items-center justify-between px-4 sm:px-6 py-2.5 border-b text-xs shrink-0 transition ${
          isLightMode ? 'bg-slate-100/90 border-slate-200' : 'bg-slate-950/40 border-white/5'
        }`}>
          <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto py-1">
            <button
              onClick={() => setActiveStep('variables')}
              disabled={isApplying}
              className={`flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-lg transition cursor-pointer ${
                activeStep === 'variables'
                  ? isLightMode
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-300 font-bold shadow-xs'
                    : 'bg-indigo-600/30 text-cyan-300 border border-cyan-500/40'
                  : isLightMode
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                isLightMode ? 'bg-indigo-200 text-indigo-800' : 'bg-cyan-500/20 border border-cyan-500/40'
              }`}>
                1
              </span>
              <span>{t('apply_step_variables')}</span>
            </button>

            <span className={isLightMode ? 'text-slate-400' : 'text-slate-600'}>→</span>

            <button
              onClick={() => setActiveStep('risk_gate')}
              disabled={isApplying || !isAllVariablesValid}
              className={`flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-lg transition cursor-pointer ${
                activeStep === 'risk_gate'
                  ? isLightMode
                    ? 'bg-amber-100 text-amber-800 border border-amber-300 font-bold shadow-xs'
                    : 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                  : isLightMode
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              } ${!isAllVariablesValid ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                isLightMode ? 'bg-amber-200 text-amber-900' : 'bg-amber-500/20 border border-amber-500/40'
              }`}>
                2
              </span>
              <span>{t('apply_step_risk_gate')}</span>
            </button>

            <span className={isLightMode ? 'text-slate-400' : 'text-slate-600'}>→</span>

            <button
              onClick={() => setActiveStep('preview')}
              disabled={isApplying || !isSafetyGateCleared}
              className={`flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-lg transition cursor-pointer ${
                activeStep === 'preview'
                  ? isLightMode
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-300 font-bold shadow-xs'
                    : 'bg-indigo-600/30 text-cyan-300 border border-cyan-500/40'
                  : isLightMode
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              } ${!isSafetyGateCleared ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                isLightMode ? 'bg-indigo-200 text-indigo-800' : 'bg-cyan-500/20 border border-cyan-500/40'
              }`}>
                3
              </span>
              <span>{t('apply_step_preview')}</span>
            </button>

            <span className={isLightMode ? 'text-slate-400' : 'text-slate-600'}>→</span>

            <div
              className={`flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-lg ${
                activeStep === 'executing' || activeStep === 'done'
                  ? isLightMode
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold'
                    : 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                  : isLightMode
                  ? 'text-slate-400'
                  : 'text-slate-500'
              }`}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                isLightMode ? 'bg-emerald-200 text-emerald-800' : 'bg-emerald-500/20 border border-emerald-500/40'
              }`}>
                4
              </span>
              <span>{t('apply_step_executing')}</span>
            </div>
          </div>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 ${isLightMode ? 'bg-white' : ''}`}>
          {/* Target Device & Template Selector Bar */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl border transition ${
            isLightMode ? 'bg-slate-50/90 border-slate-200' : 'bg-white/5 border-white/10'
          }`}>
            {/* Target Device Selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={`text-xs font-semibold flex items-center gap-1.5 ${
                  isLightMode ? 'text-slate-700' : 'text-slate-300'
                }`}>
                  <Server className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{t('apply_target_device')}</span>
                </label>
                <div className="flex items-center gap-2">
                  {allDevices.length > compatibleDevices.length && (
                    <button
                      type="button"
                      onClick={() => setShowAllDevices(!showAllDevices)}
                      className={`text-[10px] px-2 py-0.5 rounded-lg border font-mono transition cursor-pointer ${
                        showAllDevices
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          : isLightMode
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'
                          : 'bg-white/5 hover:bg-white/10 text-slate-400 border-white/10'
                      }`}
                      title={showAllDevices ? (isEn ? 'Filter to family devices' : 'محدودسازی به تجهیزات هم‌خانواده') : (isEn ? 'Show all devices in inventory' : 'نمایش تمام تجهیزات موجود')}
                    >
                      {showAllDevices
                        ? (isEn ? `Show All (${allDevices.length})` : `تمام تجهیزات (${allDevices.length})`)
                        : (isEn ? `Family Only (${compatibleDevices.length})` : `فقط هم‌خانواده (${compatibleDevices.length})`)}
                    </button>
                  )}
                  <FieldInfoTooltip
                    fieldName={isEn ? 'Target Device' : 'تجهیز هدف'}
                    infoWhatEn="Network equipment (Cisco or MikroTik) that will receive and execute this configuration template."
                    infoWhatFa="تجهیز شبکه (سیسکو یا میکروتیک) که این الگوی پیکربندی بر روی آن اعمال و پیاده‌سازی می‌گردد."
                    infoWhyEn="Ensures CLI commands are provisioned to the correct physical or virtual device of the matching family."
                    infoWhyFa="تضمین تزریق امن و دقیق دستورات خط فرمان بر روی تجهیزات هم‌خانواده و سازگار."
                    infoExampleEn="Core-Switch-01 (192.168.1.1)"
                    infoExampleFa="سوییچ لایه سه یا روتر میکروتیک (۱۹۲.۱۶۸.۱.۱)"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
              </div>

              {selectableDevices.length > 0 ? (
                <>
                  <select
                    value={selectedDevice?.id || ''}
                    onChange={(e) => {
                      const found = selectableDevices.find((d) => d.id === e.target.value);
                      if (found) setSelectedDevice(found);
                    }}
                    disabled={isApplying}
                    className={`w-full rounded-xl px-3 py-2 text-xs focus:outline-none font-mono transition ${
                      isLightMode
                        ? 'bg-white border border-slate-300 text-slate-900 focus:border-cyan-600 shadow-xs'
                        : 'bg-slate-950 border border-white/15 text-white focus:border-cyan-500'
                    }`}
                  >
                    {selectableDevices.map((d) => {
                      const isCisco = isDeviceCisco(d);
                      const isMikroTik = isDeviceMikroTik(d);
                      const vendorTag = isMikroTik ? 'MikroTik' : isCisco ? 'Cisco' : 'Generic';
                      return (
                        <option key={d.id} value={d.id}>
                          [{vendorTag}] {d.name} ({d.ip}) - {d.model} [{d.role}]
                        </option>
                      );
                    })}
                  </select>

                  {/* Family Compatibility Status Indicator */}
                  {selectedDevice && currentTemplate && (
                    <div className="mt-2 flex items-center justify-between text-[11px]">
                      {isDeviceCompatibleWithTemplate(selectedDevice, currentTemplate) ? (
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium ${
                          isLightMode ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span>
                            {isEn
                              ? `Compatible with ${currentTemplate.vendor === 'mikrotik' ? 'MikroTik RouterOS' : currentTemplate.vendor === 'cisco' ? 'Cisco IOS-XE' : 'Generic CLI'}`
                              : `سازگار با خانواده ${currentTemplate.vendor === 'mikrotik' ? 'میکروتیک (RouterOS)' : currentTemplate.vendor === 'cisco' ? 'سیسکو (IOS-XE)' : 'عمومی'}`}
                          </span>
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium ${
                          isLightMode ? 'bg-amber-50 text-amber-800 border border-amber-300' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}>
                          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                          <span>
                            {isEn
                              ? `Family Mismatch: Template is ${currentTemplate.vendor.toUpperCase()} but device is ${isDeviceMikroTik(selectedDevice) ? 'MikroTik' : isDeviceCisco(selectedDevice) ? 'Cisco' : 'Generic'}`
                              : `عدم تطابق خانواده: تمپلیت ${currentTemplate.vendor.toUpperCase()} است ولی تجهیز ${isDeviceMikroTik(selectedDevice) ? 'میکروتیک' : isDeviceCisco(selectedDevice) ? 'سیسکو' : 'عمومی'} می‌باشد`}
                          </span>
                        </span>
                      )}
                      <span className={`font-mono text-[10px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {selectedDevice.ip}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className={`mt-2 p-3 rounded-xl border flex items-center gap-2.5 text-xs font-semibold ${
                  isLightMode ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                }`}>
                  <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>
                    {isEn
                      ? 'No authorized devices available. Your assigned RBAC role does not permit applying templates to any matching network equipment.'
                      : 'هیچ تجهیز مجازی در دسترس نیست. طبق پالیسی کنترل دسترسی (RBAC)، شما مجوز اعمال تمپلیت بر روی تجهیزات شبکه را ندارید.'}
                  </span>
                </div>
              )}
            </div>

            {/* Template Selector */}
            <div>
              <label className={`block text-xs font-semibold mb-1.5 flex items-center justify-between ${
                isLightMode ? 'text-slate-700' : 'text-slate-300'
              }`}>
                <div className="flex items-center gap-1.5">
                  <FileCode2 className="w-3.5 h-3.5 text-cyan-500" />
                  <span>{t('apply_template_label')}</span>
                </div>
                <FieldInfoTooltip
                  fieldName={isEn ? 'Configuration Template' : 'الگوی پیکربندی'}
                  infoWhatEn="Standardized CLI commands template containing dynamic parameter placeholders."
                  infoWhatFa="الگو و قالب استاندارد دستورات خط فرمان حاوی متغیرهای پارامتریک جهت استقرار سریع."
                  infoWhyEn="Prevents human typing errors and automates identical provisioning across hardware fleet."
                  infoWhyFa="جلوگیری از خطای تایپی انسانی و استانداردسازی یکپارچه تنظیمات شبکه در ناوگان تجهیزات."
                  infoExampleEn="Cisco 2960 Base Setup or MikroTik RouterOS Initial Setup"
                  infoExampleFa="کانفیگ اولیه سیسکو یا راه‌اندازی روتر میکروتیک"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                disabled={isApplying || loadingTemplates}
                className={`w-full rounded-xl px-3 py-2 text-xs focus:outline-none transition ${
                  isLightMode
                    ? 'bg-white border border-slate-300 text-slate-900 focus:border-cyan-600 shadow-xs'
                    : 'bg-slate-950 border border-white/15 text-white focus:border-cyan-500'
                }`}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    [{t.vendor.toUpperCase()}] {t.name} ({t.target_type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Error Banner if any */}
          {applyError && (
            <div className="p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{applyError}</span>
            </div>
          )}

          {/* STEP 1: Live Variables & Split-View CLI Diff */}
          {activeStep === 'variables' && currentTemplate && (
            <div className="space-y-4 animate-fadeIn">
              {/* Toolbar: View Mode Selector + Validation Summary */}
              <div className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 transition ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-white/10'
              }`}>
                {/* View Mode Toggle */}
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/40 border border-white/5">
                  <button
                    type="button"
                    onClick={() => setSplitViewMode('split')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      splitViewMode === 'split'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title={isEn ? 'Dual Pane Split View' : 'نمای تفکیک‌شده دوپنلی'}
                  >
                    <SplitSquareVertical className="w-3.5 h-3.5" />
                    <span>{t('apply_view_mode_split')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitViewMode('form')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      splitViewMode === 'form'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title={isEn ? 'Variables Form Only' : 'فقط فرم متغیرها'}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{t('apply_view_mode_form')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitViewMode('cli')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      splitViewMode === 'cli'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title={isEn ? 'CLI Preview Only' : 'فقط پیش‌نمایش CLI'}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>{t('apply_view_mode_cli')}</span>
                  </button>
                </div>

                {/* Validation Status Pill & Stats */}
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
                    {t('apply_injected_stats')
                      .replace('{injected}', String(allDiscoveredVariables.filter((v) => Boolean(variableValues[v.name])).length))
                      .replace('{total}', String(allDiscoveredVariables.length))
                      .replace('{lines}', String((currentTemplate.commands || '').split('\n').filter((l) => l.trim()).length))}
                  </span>

                  {isAllVariablesValid ? (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                      isLightMode ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{t('apply_all_valid_badge')}</span>
                    </span>
                  ) : (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                      isLightMode ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                    }`}>
                      <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span>{t('apply_errors_count_badge').replace('{count}', String(Object.keys(validationErrors).length))}</span>
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={handleResetAllVariables}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer ${
                      isLightMode
                        ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-xs'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                    }`}
                    title={t('apply_reset_all_vars')}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span className="hidden md:inline">{t('apply_reset_all_vars')}</span>
                  </button>
                </div>
              </div>

              {/* Split Dual-Pane View Container */}
              <div className={`grid gap-5 ${
                splitViewMode === 'split' ? 'grid-cols-1 xl:grid-cols-12' : 'grid-cols-1'
              }`}>
                {/* LEFT PANE: Variables & Parameters Form */}
                {(splitViewMode === 'split' || splitViewMode === 'form') && (
                  <div className={`${splitViewMode === 'split' ? 'xl:col-span-6 space-y-4' : 'space-y-4'}`}>
                    {/* Management IP Confirmation Box */}
                    <div
                      className={`p-4 rounded-xl border transition-all ${
                        isIpConfirmed && !validationErrors['IP_ADDRESS']
                          ? isLightMode
                            ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-xs'
                            : 'bg-emerald-500/10 border-emerald-500/30'
                          : isLightMode
                          ? 'bg-amber-50/90 border-amber-300 text-amber-950 shadow-xs'
                          : 'bg-amber-500/15 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.15)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`p-2 rounded-xl mt-0.5 ${
                              isIpConfirmed && !validationErrors['IP_ADDRESS']
                                ? isLightMode ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-300'
                                : isLightMode ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-300 animate-pulse'
                            }`}
                          >
                            <ShieldAlert className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className={`text-sm font-bold flex items-center gap-2 ${
                              isLightMode ? 'text-slate-900' : 'text-white'
                            }`}>
                              <span>{t('apply_ip_check_title')}</span>
                              {!validationErrors['IP_ADDRESS'] ? (
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
                                  isLightMode ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                }`}>
                                  {t('apply_ip_valid')}
                                </span>
                              ) : (
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
                                  isLightMode ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                }`}>
                                  {t('apply_ip_invalid')}
                                </span>
                              )}
                            </h4>
                            <p className={`text-xs mt-1 ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                              {t('apply_ip_desc').replace('{ip}', selectedDevice?.ip || variableValues['IP_ADDRESS'] || '')}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setIsIpConfirmed(!isIpConfirmed)}
                          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition shadow-sm cursor-pointer ${
                            isIpConfirmed
                              ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-xs'
                              : 'bg-amber-600 text-white hover:bg-amber-500'
                          }`}
                        >
                          {isIpConfirmed ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>{t('apply_ip_confirmed_btn')}</span>
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>{t('apply_ip_unconfirmed_btn')}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Categorized Variable Sections */}
                    {categorizedVariables.map((category) => {
                      const IconComp = category.icon;
                      return (
                        <div
                          key={category.id}
                          className={`p-4 rounded-xl border space-y-3 transition ${
                            isLightMode ? 'bg-slate-50/80 border-slate-200 shadow-xs' : 'bg-slate-900/60 border-white/10'
                          }`}
                        >
                          <div className="flex items-center justify-between border-b pb-2 border-white/5">
                            <h4 className={`text-xs font-bold flex items-center gap-2 ${
                              isLightMode ? 'text-slate-800' : 'text-slate-200'
                            }`}>
                              <IconComp className="w-4 h-4 text-cyan-400" />
                              <span>{isEn ? category.titleEn : category.titleFa}</span>
                            </h4>
                            <span className="text-[10px] font-mono text-slate-500">
                              {category.vars.length} {isEn ? 'parameters' : 'متغیر'}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {category.vars.map((variable) => {
                              const val = variableValues[variable.name] ?? '';
                              const err = validationErrors[variable.name];
                              const isInvalid = Boolean(err);

                              return (
                                <div
                                  key={variable.name}
                                  className={`p-3 rounded-xl border transition ${
                                    isInvalid
                                      ? 'border-rose-500/50 bg-rose-500/5'
                                      : isLightMode
                                      ? 'bg-white border-slate-200 focus-within:border-cyan-600 shadow-xs'
                                      : 'bg-slate-950/70 border-white/10 focus-within:border-cyan-500/50'
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-1.5">
                                    <label className={`text-[11px] font-semibold truncate flex items-center gap-1 ${
                                      isLightMode ? 'text-slate-800' : 'text-slate-200'
                                    }`}>
                                      <span>{variable.label}</span>
                                    </label>
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                                        isLightMode
                                          ? 'text-cyan-700 bg-cyan-100/70 border-cyan-300'
                                          : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
                                      }`}>
                                        {`{{${variable.name}}}`}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleResetSingleVariable(variable.name)}
                                        className="p-1 rounded text-slate-400 hover:text-cyan-400 hover:bg-white/10 transition cursor-pointer"
                                        title={t('apply_reset_single_var')}
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                      </button>
                                      <FieldInfoTooltip
                                        fieldName={variable.label}
                                        infoWhatEn={variable.description || `Parameter placeholder for ${variable.name}.`}
                                        infoWhatFa={variable.description || `متغیر خط فرمان برای ${variable.name}.`}
                                        infoWhyEn="Replaces token dynamically during CLI execution on the target hardware."
                                        infoWhyFa="قبل از ارسال فرامین به تجهیز، این مقدار در دستورات جایگزین می‌گردد."
                                        infoExampleEn={variable.default_value || 'Custom Value'}
                                        infoExampleFa={variable.default_value || 'مقدار سفارشی'}
                                        isEn={isEn}
                                        isLightMode={isLightMode}
                                      />
                                    </div>
                                  </div>

                                  <input
                                    type={variable.type === 'password' ? 'password' : 'text'}
                                    value={val}
                                    onChange={(e) => {
                                      setVariableValues({
                                        ...variableValues,
                                        [variable.name]: e.target.value,
                                      });
                                      if (variable.name === 'IP_ADDRESS') {
                                        setIsIpConfirmed(false);
                                      }
                                    }}
                                    placeholder={variable.default_value || `{{${variable.name}}}`}
                                    className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono focus:outline-none transition ${
                                      isInvalid
                                        ? 'bg-rose-500/10 border border-rose-500 text-rose-200 focus:ring-1 focus:ring-rose-500'
                                        : isLightMode
                                        ? 'bg-slate-50 border border-slate-300 text-slate-900 focus:border-cyan-600'
                                        : 'bg-slate-900 border border-white/10 text-white focus:border-cyan-400'
                                    }`}
                                  />

                                  {/* Field-level error explanation */}
                                  {isInvalid ? (
                                    <div className="flex items-center gap-1 text-[10px] text-rose-400 mt-1 font-mono">
                                      <AlertTriangle className="w-3 h-3 shrink-0" />
                                      <span>{isEn ? err?.errorEn : err?.errorFa}</span>
                                    </div>
                                  ) : (
                                    variable.description && (
                                      <div className={`text-[10px] mt-1 truncate ${
                                        isLightMode ? 'text-slate-500' : 'text-slate-400'
                                      }`} title={variable.description}>
                                        {variable.description}
                                      </div>
                                    )
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* RIGHT PANE: Live Rendered CLI Diff Terminal */}
                {(splitViewMode === 'split' || splitViewMode === 'cli') && (
                  <div className={`${splitViewMode === 'split' ? 'xl:col-span-6 space-y-3' : 'space-y-3'}`}>
                    {/* Terminal Header Bar */}
                    <div className="p-3 rounded-xl bg-slate-950 border border-white/10 flex flex-wrap items-center justify-between gap-2.5">
                      {/* Left: Terminal Window Dots & Badge */}
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 mr-1">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                        </div>
                        <Terminal className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-mono font-bold text-slate-200">
                          {selectedDevice?.name || 'Device'}: CLI Live Diff
                        </span>
                      </div>

                      {/* Right: Controls & Search */}
                      <div className="flex items-center gap-2">
                        {/* Token Highlight Toggle */}
                        <button
                          type="button"
                          onClick={() => setHighlightTokens(!highlightTokens)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer border ${
                            highlightTokens
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs'
                              : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
                          }`}
                          title={highlightTokens ? t('apply_diff_highlight_mode') : t('apply_diff_plain_mode')}
                        >
                          <Sparkles className="w-3 h-3 text-emerald-400" />
                          <span className="hidden sm:inline">
                            {highlightTokens ? t('apply_diff_highlight_mode') : t('apply_diff_plain_mode')}
                          </span>
                        </button>

                        {/* Copy Script */}
                        <button
                          type="button"
                          onClick={handleCopyScript}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10 transition cursor-pointer"
                        >
                          {copiedScript ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span className="hidden sm:inline">{copiedScript ? t('apply_copied_script') : t('apply_copy_script')}</span>
                        </button>

                        {/* Download Script */}
                        <button
                          type="button"
                          onClick={handleDownloadScript}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10 transition cursor-pointer"
                          title={t('apply_download_script')}
                        >
                          <Download className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Terminal Search Filter Bar */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={cliSearchQuery}
                        onChange={(e) => setCliSearchQuery(e.target.value)}
                        placeholder={t('apply_search_cli_placeholder')}
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition font-mono"
                      />
                      {cliSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setCliSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Live Highlighted CLI Output Container */}
                    <div className="rounded-xl p-3 bg-slate-950 border border-cyan-500/25 max-h-[500px] xl:max-h-[580px] overflow-y-auto selection:bg-cyan-500/30 shadow-inner">
                      <div className="space-y-0.5">
                        {renderHighlightedCLILines()}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Step 1 Footer Action Bar */}
              <div className={`flex flex-wrap items-center justify-between gap-3 pt-4 border-t ${
                isLightMode ? 'border-slate-200' : 'border-white/10'
              }`}>
                <div className="text-xs">
                  {isAllVariablesValid && isIpConfirmed ? (
                    <span className={`flex items-center gap-1.5 font-medium ${
                      isLightMode ? 'text-emerald-700' : 'text-emerald-400'
                    }`}>
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span>{t('apply_ready_to_preview')}</span>
                    </span>
                  ) : (
                    <span className={`flex items-center gap-1.5 font-medium ${
                      isLightMode ? 'text-amber-700' : 'text-amber-400'
                    }`}>
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span>
                        {!isIpConfirmed
                          ? t('apply_need_ip_confirm')
                          : t('apply_validation_error_summary')}
                      </span>
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveStep('risk_gate')}
                  disabled={!selectedDevice || !isAllVariablesValid}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold shadow-md transition active:scale-95 ${
                    selectedDevice && isAllVariablesValid
                      ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                      : 'bg-slate-700/60 opacity-50 cursor-not-allowed border border-white/5 text-slate-400'
                  }`}
                  title={
                    !selectedDevice
                      ? (isEn ? 'Please select an authorized device' : 'لطفاً یک تجهیز مجاز را انتخاب نمایید')
                      : !isAllVariablesValid
                      ? (isEn ? 'Fix all validation errors before proceeding' : 'لطفاً ابتدا خطاهای اعتبارسنجی را برطرف فرمایید')
                      : undefined
                  }
                >
                  <span>{t('apply_btn_to_risk_gate')}</span>
                  <ArrowRight className={`w-4 h-4 ${isEn ? '' : 'rotate-180'}`} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Strict Safety Gate & Operational Impact Assessment */}
          {activeStep === 'risk_gate' && currentTemplate && selectedDevice && (
            <div className="space-y-4 animate-fadeIn">
              {/* Gate Header Banner */}
              <div
                className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 transition ${
                  isSafetyGateCleared
                    ? isLightMode
                      ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-xs'
                      : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                    : isLightMode
                    ? 'bg-amber-50/90 border-amber-300 text-amber-950 shadow-xs'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-xl ${
                      isSafetyGateCleared
                        ? isLightMode ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-300'
                        : isLightMode ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {isSafetyGateCleared ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
                  </div>
                  <div>
                    <h4 className={`text-sm font-bold flex items-center gap-2 ${
                      isLightMode ? 'text-slate-900' : 'text-white'
                    }`}>
                      <span>{t('apply_gate_title')}</span>
                    </h4>
                    <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                      {t('apply_gate_subtitle')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border transition ${
                      isSafetyGateCleared
                        ? isLightMode
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : isLightMode
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}
                  >
                    {isSafetyGateCleared ? (
                      <span className="flex items-center gap-1.5">
                        <Unlock className="w-3.5 h-3.5" />
                        <span>{isEn ? 'SAFETY GATE CLEARED' : 'گیت ایمنی باز شد'}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" />
                        <span>{isEn ? 'SAFETY GATE LOCKED' : 'گیت ایمنی قفل است'}</span>
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Grid: 2 Columns for Gate Checks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Vendor & OS Compatibility Card */}
                <div
                  className={`p-4 rounded-xl border transition ${
                    isVendorMismatch
                      ? 'bg-rose-500/10 border-rose-500/50 shadow-xs'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 shadow-xs'
                      : 'bg-slate-900/60 border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h5 className={`text-xs font-bold flex items-center gap-2 ${
                      isVendorMismatch ? 'text-rose-400' : isLightMode ? 'text-slate-900' : 'text-slate-200'
                    }`}>
                      {isVendorMismatch ? <AlertOctagon className="w-4 h-4 text-rose-500" /> : <Cpu className="w-4 h-4 text-cyan-400" />}
                      <span>{t('apply_gate_vendor_title')}</span>
                    </h5>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                        isVendorMismatch
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : isLightMode
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      {isVendorMismatch ? (isEn ? 'MISMATCH' : 'عدم تطابق') : (isEn ? 'MATCHED' : 'تطابق کامل')}
                    </span>
                  </div>

                  <p className={`text-xs leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                    {isVendorMismatch
                      ? t('apply_gate_vendor_mismatch_desc')
                          .replace('{templateVendor}', currentTemplate.vendor.toUpperCase())
                          .replace('{deviceVendor}', (selectedDevice.model || selectedDevice.platform || 'Other').toUpperCase())
                      : t('apply_gate_vendor_match_desc')}
                  </p>

                  <div className={`mt-3 p-2.5 rounded-lg text-[11px] font-mono flex items-center justify-between border ${
                    isLightMode ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-950 border-white/5 text-slate-300'
                  }`}>
                    <span>{isEn ? 'Template OS Architecture:' : 'معماری قالب:'} <b>{currentTemplate.vendor.toUpperCase()}</b></span>
                    <span>{isEn ? 'Target Device Platform:' : 'سیستم‌عامل تجهیز:'} <b>{(selectedDevice.model || selectedDevice.platform || 'Generic').toUpperCase()}</b></span>
                  </div>
                </div>

                {/* 2. RBAC Authoritative Security Card */}
                <div
                  className={`p-4 rounded-xl border transition ${
                    !isRbacCleared
                      ? 'bg-rose-500/10 border-rose-500/50 shadow-xs'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 shadow-xs'
                      : 'bg-slate-900/60 border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h5 className={`text-xs font-bold flex items-center gap-2 ${
                      !isRbacCleared ? 'text-rose-400' : isLightMode ? 'text-slate-900' : 'text-slate-200'
                    }`}>
                      <ShieldCheck className="w-4 h-4 text-indigo-400" />
                      <span>{t('apply_gate_rbac_title')}</span>
                    </h5>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                        isRbacCleared
                          ? isLightMode
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      {isRbacCleared ? t('apply_gate_rbac_approved') : t('apply_gate_rbac_denied')}
                    </span>
                  </div>

                  <p className={`text-xs leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                    {isRbacCleared
                      ? t('apply_gate_rbac_details')
                          .replace('{policy}', effectivePolicy?.name || 'Default Administrator')
                          .replace('{scope}', effectivePolicy?.targetScope || 'All Devices')
                      : t('apply_gate_rbac_denied_details').replace('{device}', selectedDevice.name)}
                  </p>

                  <div className={`mt-3 p-2.5 rounded-lg text-[11px] font-mono flex items-center justify-between border ${
                    isLightMode ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-950 border-white/5 text-slate-300'
                  }`}>
                    <span>{isEn ? 'Global apply_templates:' : 'مجوز سراسری تمپلیت:'} <b>{effectivePolicy?.canApplyTemplates !== false ? 'Granted' : 'Revoked'}</b></span>
                    <span>{isEn ? 'Device Target Clearance:' : 'صلاحیت دسترسی تجهیز:'} <b>{isRbacCleared ? 'Authorized' : 'Restricted'}</b></span>
                  </div>
                </div>

                {/* 3. Management IP Change & Session Continuity */}
                <div
                  className={`p-4 rounded-xl border transition md:col-span-2 ${
                    isIpChanging
                      ? isLightMode
                        ? 'bg-rose-50 border-rose-300 shadow-xs'
                        : 'bg-rose-500/10 border-rose-500/40 shadow-[0_0_20px_rgba(244,63,94,0.15)]'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 shadow-xs'
                      : 'bg-slate-900/60 border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h5 className={`text-xs font-bold flex items-center gap-2 ${
                      isIpChanging ? 'text-rose-500' : isLightMode ? 'text-slate-900' : 'text-slate-200'
                    }`}>
                      {isIpChanging ? <WifiOff className="w-4 h-4 text-rose-500" /> : <Network className="w-4 h-4 text-cyan-400" />}
                      <span>{t('apply_gate_ip_change_title')}</span>
                    </h5>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                        isIpChanging
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                          : isLightMode
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      {isIpChanging ? (isEn ? 'IP CHANGING' : 'تغییر آدرس آی‌پی') : (isEn ? 'IP UNCHANGED' : 'آی‌پی بدون تغییر')}
                    </span>
                  </div>

                  <p className={`text-xs leading-relaxed ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    {isIpChanging
                      ? t('apply_gate_ip_changed_desc')
                          .replace('{oldIp}', selectedDevice.ip)
                          .replace('{newIp}', variableValues['IP_ADDRESS'] || '')
                      : t('apply_gate_ip_preserved_desc').replace('{ip}', selectedDevice.ip)}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <div className={`p-3 rounded-lg border font-mono text-xs flex items-center justify-between ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-white/5 text-slate-300'
                    }`}>
                      <span className="text-[11px] text-slate-500">{isEn ? 'Current IP:' : 'آی‌پی فعلی تجهیز:'}</span>
                      <b className="text-cyan-500">{selectedDevice.ip}</b>
                    </div>
                    <div className={`p-3 rounded-lg border font-mono text-xs flex items-center justify-between ${
                      isIpChanging
                        ? isLightMode ? 'bg-rose-100 border-rose-300 text-rose-900' : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                        : isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-white/5 text-slate-300'
                    }`}>
                      <span className="text-[11px] text-slate-500">{isEn ? 'Target New IP:' : 'آی‌پی هدف جدید:'}</span>
                      <b className={isIpChanging ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                        {variableValues['IP_ADDRESS'] || selectedDevice.ip}
                      </b>
                    </div>
                  </div>
                </div>

                {/* 4. Operational Risk Classification Matrix */}
                <div className={`p-4 rounded-xl border md:col-span-2 transition ${
                  isLightMode ? 'bg-slate-50 border-slate-200 shadow-xs' : 'bg-slate-900/60 border-white/10'
                }`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h5 className={`text-xs font-bold flex items-center gap-2 ${
                      isLightMode ? 'text-slate-900' : 'text-slate-200'
                    }`}>
                      <Activity className="w-4 h-4 text-amber-400" />
                      <span>{t('apply_gate_risk_matrix_title')}</span>
                    </h5>
                    <span
                      className={`text-[10px] font-mono px-2.5 py-0.5 rounded-md font-bold border ${
                        riskAssessment.level === 'high'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : riskAssessment.level === 'medium'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      }`}
                    >
                      {riskAssessment.level === 'high'
                        ? t('apply_gate_risk_high')
                        : riskAssessment.level === 'medium'
                        ? t('apply_gate_risk_medium')
                        : t('apply_gate_risk_low')}
                    </span>
                  </div>

                  <p className={`text-xs leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                    {riskAssessment.level === 'high'
                      ? t('apply_gate_risk_high_desc')
                      : riskAssessment.level === 'medium'
                      ? t('apply_gate_risk_medium_desc')
                      : t('apply_gate_risk_low_desc')}
                  </p>

                  {riskAssessment.flags.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-400">
                        {isEn ? 'Detected Impact Triggers:' : 'عوامل تاثیرگذار شناسایی‌شده:'}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {riskAssessment.flags.map((flag, idx) => (
                          <span
                            key={idx}
                            className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1.5 ${
                              riskAssessment.level === 'high'
                                ? isLightMode ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                : isLightMode ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            <Flame className="w-3 h-3 shrink-0" />
                            <span>{flag}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 5. Mandatory Engineering Sign-Off Checklist */}
                <div className={`p-4 rounded-xl border md:col-span-2 space-y-3 transition ${
                  isLightMode ? 'bg-white border-slate-300 shadow-sm' : 'bg-slate-950/80 border-cyan-500/30 shadow-inner'
                }`}>
                  <div className="flex items-center justify-between border-b pb-2 border-white/5">
                    <h5 className={`text-xs font-bold flex items-center gap-2 ${
                      isLightMode ? 'text-slate-900' : 'text-white'
                    }`}>
                      <CheckSquare className="w-4 h-4 text-cyan-400" />
                      <span>{t('apply_gate_signoff_title')}</span>
                    </h5>
                    <span className="text-[10px] font-mono text-slate-500">
                      {isEn ? 'Required before execution' : 'الزامی جهت تایید نهایی'}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {/* Checkbox 1: Variables verified */}
                    <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer select-none ${
                      signOffVarsConfirmed
                        ? isLightMode ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                        : isLightMode ? 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                    }`}>
                      <input
                        type="checkbox"
                        checked={signOffVarsConfirmed}
                        onChange={(e) => setSignOffVarsConfirmed(e.target.checked)}
                        className="mt-0.5 rounded text-cyan-600 focus:ring-cyan-500"
                      />
                      <span className="text-xs font-medium leading-relaxed">
                        {t('apply_gate_signoff_vars')}
                      </span>
                    </label>

                    {/* Checkbox 2: Risk acknowledged */}
                    <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer select-none ${
                      signOffRiskConfirmed
                        ? isLightMode ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                        : isLightMode ? 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                    }`}>
                      <input
                        type="checkbox"
                        checked={signOffRiskConfirmed}
                        onChange={(e) => setSignOffRiskConfirmed(e.target.checked)}
                        className="mt-0.5 rounded text-cyan-600 focus:ring-cyan-500"
                      />
                      <span className="text-xs font-medium leading-relaxed">
                        {t('apply_gate_signoff_risk')}
                      </span>
                    </label>

                    {/* Checkbox 3: IP change double-confirmed (if IP changed) */}
                    {isIpChanging && (
                      <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer select-none ${
                        signOffIpConfirmed
                          ? isLightMode ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                          : isLightMode ? 'bg-rose-50 border-rose-300 text-rose-950 hover:bg-rose-100' : 'bg-rose-500/15 border-rose-500/40 text-rose-200 hover:bg-rose-500/20'
                      }`}>
                        <input
                          type="checkbox"
                          checked={signOffIpConfirmed}
                          onChange={(e) => setSignOffIpConfirmed(e.target.checked)}
                          className="mt-0.5 rounded text-rose-600 focus:ring-rose-500"
                        />
                        <span className="text-xs font-bold leading-relaxed">
                          {t('apply_gate_signoff_ip').replace('{newIp}', variableValues['IP_ADDRESS'] || '')}
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* Step 2 Footer Navigation Bar */}
              <div className={`flex flex-wrap items-center justify-between gap-3 pt-4 border-t ${
                isLightMode ? 'border-slate-200' : 'border-white/10'
              }`}>
                <button
                  type="button"
                  onClick={() => setActiveStep('variables')}
                  className={`px-4 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                    isLightMode
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                      : 'bg-white/10 hover:bg-white/15 text-slate-300'
                  }`}
                >
                  {isEn ? '← Back to Variables' : '← بازگشت به ویرایش متغیرها'}
                </button>

                <div className="flex items-center gap-3">
                  {!isSafetyGateCleared && (
                    <span className="text-xs text-amber-400 font-medium hidden sm:inline">
                      {t('apply_gate_blocked_summary')}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => setActiveStep('preview')}
                    disabled={!isSafetyGateCleared}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold shadow-md transition active:scale-95 ${
                      isSafetyGateCleared
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                        : 'bg-slate-700/60 opacity-50 cursor-not-allowed border border-white/5 text-slate-400'
                    }`}
                  >
                    <span>{t('apply_btn_proceed_to_preview')}</span>
                    <ArrowRight className={`w-4 h-4 ${isEn ? '' : 'rotate-180'}`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Pre-Flight Safety & Clean CLI Dry-Run */}
          {activeStep === 'preview' && currentTemplate && (
            <div className="space-y-4 animate-fadeIn">
              <div className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border text-xs transition ${
                isLightMode
                  ? 'bg-indigo-50/90 border-indigo-200 text-indigo-950 shadow-xs'
                  : 'bg-indigo-500/10 border-indigo-500/20 text-slate-200'
              }`}>
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-600" />
                  <span className={`font-medium ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                    {isEn ? 'Configuration commands ready for: ' : 'دستورات پیکربندی آماده اجرا روی '}
                    <b className={`font-mono ${isLightMode ? 'text-slate-950 font-bold' : 'text-white'}`}>
                      {variableValues['DEVICE_NAME'] || selectedDevice?.name}
                    </b>{' '}
                    ({isEn ? 'IP: ' : 'آدرس: '}
                    <b className={`font-mono ${isLightMode ? 'text-indigo-700 font-bold' : 'text-cyan-300'}`}>
                      {variableValues['IP_ADDRESS']}
                    </b>)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyScript}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                      isLightMode
                        ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 shadow-xs'
                        : 'bg-white/10 hover:bg-white/15 text-slate-200'
                    }`}
                  >
                    {copiedScript ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedScript ? t('apply_copied_script') : t('apply_copy_script')}</span>
                  </button>
                  <button
                    onClick={handleDownloadScript}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                      isLightMode
                        ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 shadow-xs'
                        : 'bg-white/10 hover:bg-white/15 text-slate-200'
                    }`}
                  >
                    <Download className="w-3 h-3" />
                    <span>{t('apply_download_script')}</span>
                  </button>
                </div>
              </div>

              {/* Terminal Code View */}
              <div className={`rounded-xl p-4 font-mono text-xs max-h-96 overflow-y-auto dir-ltr text-left selection:bg-cyan-500/30 border ${
                isLightMode
                  ? 'bg-slate-900 border-slate-700 text-slate-100 shadow-inner'
                  : 'bg-slate-950 border-white/15 text-slate-200'
              }`}>
                <pre className="whitespace-pre font-mono leading-relaxed">{renderedScript}</pre>
              </div>

              {/* Step 3 Actions */}
              <div className={`flex items-center justify-between pt-4 border-t ${
                isLightMode ? 'border-slate-200' : 'border-white/10'
              }`}>
                <button
                  type="button"
                  onClick={() => setActiveStep('risk_gate')}
                  className={`px-4 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                    isLightMode
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                      : 'bg-white/10 hover:bg-white/15 text-slate-300'
                  }`}
                >
                  {t('apply_btn_back_to_risk_gate')}
                </button>

                {(() => {
                  const isPermitted = isSafetyGateCleared;
                  return (
                    <button
                      type="button"
                      onClick={handleExecuteApply}
                      disabled={isApplying || !isPermitted}
                      className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-xs font-bold shadow-md transition active:scale-95 ${
                        isPermitted && !isApplying
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.35)]'
                          : 'bg-slate-700/60 opacity-50 cursor-not-allowed border border-white/5 text-slate-400'
                      }`}
                      title={
                        !selectedDevice
                          ? (isEn ? 'Please select a device' : 'لطفاً تجهیز مورد نظر را انتخاب فرمایید')
                          : !isPermitted
                          ? (isEn ? 'Safety Gate Locked: All checks and sign-offs required' : 'گیت ایمنی قفل است: تایید کلیه چک‌ها و تصدیق مهندسی الزامی است')
                          : undefined
                      }
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>{t('apply_btn_execute')}</span>
                    </button>
                  );
                })()}
              </div>
            </div>
          )}

          {/* STEP 4: Live Terminal Execution Stream & Database Sync */}
          {(activeStep === 'executing' || activeStep === 'done') && (() => {
            const activeLogList = streamedLogs.length > 0 ? streamedLogs : (applyResult?.logs || []);
            const totalLogsCount = applyResult?.logs?.length || activeLogList.length || 0;
            const progressPercent = totalLogsCount > 0 ? Math.min(100, Math.round((currentStreamIndex / totalLogsCount) * 100)) : 100;
            
            const okLogsCount = activeLogList.filter((l) => l.status === 'ok').length;
            const warnLogsCount = activeLogList.filter((l) => l.status === 'warn').length;
            const errorLogsCount = activeLogList.filter((l) => l.status === 'error').length;

            const filteredLogs = activeLogList.filter((l) => {
              if (logFilter === 'errors') return l.status === 'error';
              if (logFilter === 'warns') return l.status === 'warn';
              return true;
            });

            const currentExecutingCommand = isStreamingActive && applyResult?.logs && currentStreamIndex > 0
              ? applyResult.logs[currentStreamIndex - 1]?.command
              : '';

            return (
              <div className="space-y-4 animate-fadeIn">
                {/* Execution Status Header with Live Progress */}
                <div
                  className={`p-4 rounded-xl border transition ${
                    activeStep === 'done'
                      ? isLightMode
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                        : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                      : isLightMode
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-950'
                      : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {isStreamingActive ? (
                        <RefreshCw className="w-5 h-5 text-cyan-600 animate-spin flex-shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                      )}
                      <div>
                        <h4 className={`font-bold text-sm ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                          {isStreamingActive
                            ? t('apply_executing_title')
                            : t('apply_success_title')}
                        </h4>
                        <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                          {isEn ? 'Target Device: ' : 'تجهیز هدف: '}
                          <span className={`font-mono font-bold ${isLightMode ? 'text-slate-950' : 'text-white'}`}>
                            {selectedDevice?.name}
                          </span>
                          {' '}| {isEn ? 'IP Address: ' : 'آدرس آی‌پی: '}
                          <span className={`font-mono font-bold ${isLightMode ? 'text-indigo-700' : 'text-cyan-300'}`}>
                            {selectedDevice?.ip}
                          </span>
                          {' '}| {isEn ? 'Architecture: ' : 'معماری: '}
                          <span className="font-semibold uppercase">{currentTemplate?.vendor}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isStreamingActive && (
                        <button
                          type="button"
                          onClick={handleFastForwardStream}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                            isLightMode
                              ? 'bg-white hover:bg-slate-100 text-indigo-700 border-indigo-300 shadow-xs'
                              : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border-cyan-500/40'
                          }`}
                          title={isEn ? 'Skip line-by-line animation and show all commands' : 'رد کردن انیمیشن خط به خط و نمایش سریع همه دستورات'}
                        >
                          <FastForward className="w-3.5 h-3.5" />
                          <span>{t('apply_stream_fast_forward')}</span>
                        </button>
                      )}

                      {activeStep === 'done' && (
                        <span className={`px-3 py-1 rounded-lg border text-xs font-bold ${
                          isLightMode
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        }`}>
                          {t('apply_stream_nvram_verified')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progressive Execution Progress Bar */}
                  {isStreamingActive && (
                    <div className="mt-3.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className={isLightMode ? 'text-slate-700' : 'text-slate-300'}>
                          {t('apply_stream_executing_line')
                            .replace('{current}', String(currentStreamIndex))
                            .replace('{total}', String(totalLogsCount))
                            .replace('{percent}', String(progressPercent))}
                        </span>
                        {currentExecutingCommand && (
                          <span className={`truncate max-w-md ${isLightMode ? 'text-indigo-600' : 'text-cyan-400 font-bold'}`}>
                            {currentExecutingCommand}
                          </span>
                        )}
                      </div>
                      <div className={`w-full h-2 rounded-full overflow-hidden ${
                        isLightMode ? 'bg-slate-200' : 'bg-slate-800'
                      }`}>
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-500 transition-all duration-100 ease-out"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Completion Statistics Bar */}
                  {activeStep === 'done' && (
                    <div className={`mt-3 pt-3 border-t text-xs flex flex-wrap items-center justify-between gap-2 ${
                      isLightMode ? 'border-emerald-200 text-emerald-900' : 'border-emerald-500/30 text-emerald-200'
                    }`}>
                      <span>
                        {t('apply_stream_execution_stats')
                          .replace('{total}', String(totalLogsCount))
                          .replace('{success}', String(okLogsCount))
                          .replace('{warn}', String(warnLogsCount))
                          .replace('{errors}', String(errorLogsCount))}
                      </span>
                      <span className="font-mono text-[11px] opacity-80">
                        {isEn ? 'Execution finished at: ' : 'اتمام اجرا در زمان: '}
                        {new Date().toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Database Sync and Audit Log Confirmation Cards */}
                {activeStep === 'done' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Database Sync Status Card */}
                    <div className={`p-3.5 rounded-xl border flex items-start gap-3 transition ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-800'
                        : 'bg-white/5 border-white/10 text-slate-200'
                    }`}>
                      <div className="p-2 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 mt-0.5">
                        <Database className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h5 className="font-bold text-xs">{isEn ? 'Database Record Synchronized' : 'همگام‌سازی دیتابیس تجهیز'}</h5>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            {isEn ? 'SYNCED' : 'همگام شد'}
                          </span>
                        </div>
                        <p className={`text-[11px] mt-1 font-mono ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                          {applyResult?.synced_fields && applyResult.synced_fields.length > 0
                            ? t('apply_stream_db_synced').replace('{fields}', applyResult.synced_fields.join(', '))
                            : (isEn ? 'All device identity parameters synced in primary store.' : 'کلیه مشخصات هویتی تجهیز در دیتابیس اصلی ذخیره شد.')}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
                          <span>{isEn ? 'Name: ' : 'نام: '}<strong>{selectedDevice?.name}</strong></span>
                          <span>•</span>
                          <span>{isEn ? 'IP: ' : 'آی‌پی: '}<strong>{selectedDevice?.ip}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Server-Side PostgreSQL Audit Log Card */}
                    <div className={`p-3.5 rounded-xl border flex items-start gap-3 transition ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-800'
                        : 'bg-white/5 border-white/10 text-slate-200'
                    }`}>
                      <div className="p-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 mt-0.5">
                        <ScrollText className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h5 className="font-bold text-xs">{isEn ? 'PostgreSQL Security Audit Log' : 'ثبت لاگ ممیزی امنیتی سرور'}</h5>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                            {isEn ? 'AUDITED' : 'ثبت شد'}
                          </span>
                        </div>
                        <p className={`text-[11px] mt-1 font-mono ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                          {t('apply_stream_audit_logged').replace('{id}', applyResult?.audit_id || 'audit-srv')}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
                          <span>{isEn ? 'Operator: ' : 'کاربر: '}<strong>{effectivePolicy?.name || 'Super Admin'}</strong></span>
                          <span>•</span>
                          <span>{isEn ? 'Action: ' : 'عملیات: '}<strong>apply_config_template</strong></span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Virtual Terminal Console Controls Bar */}
                <div className={`flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border text-xs ${
                  isLightMode ? 'bg-slate-100 border-slate-300' : 'bg-slate-900 border-slate-800'
                }`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                      {isEn ? 'Console Filter:' : 'فیلتر خطوط:'}
                    </span>

                    <button
                      type="button"
                      onClick={() => setLogFilter('all')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                        logFilter === 'all'
                          ? isLightMode
                            ? 'bg-white text-indigo-700 font-bold shadow-xs border border-indigo-300'
                            : 'bg-indigo-600/30 text-cyan-300 border border-cyan-500/40'
                          : isLightMode
                          ? 'text-slate-600 hover:text-slate-900'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t('apply_stream_filter_all').replace('{count}', String(activeLogList.length))}
                    </button>

                    <button
                      type="button"
                      onClick={() => setLogFilter('errors')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                        logFilter === 'errors'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold'
                          : isLightMode
                          ? 'text-slate-600 hover:text-slate-900'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t('apply_stream_filter_errors').replace('{count}', String(errorLogsCount))}
                    </button>

                    <button
                      type="button"
                      onClick={() => setLogFilter('warns')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                        logFilter === 'warns'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                          : isLightMode
                          ? 'text-slate-600 hover:text-slate-900'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t('apply_stream_filter_warns').replace('{count}', String(warnLogsCount))}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Auto-scroll toggle */}
                    <button
                      type="button"
                      onClick={() => setAutoScroll((prev) => !prev)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                        autoScroll
                          ? isLightMode
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : isLightMode
                          ? 'bg-white text-slate-500 border-slate-300'
                          : 'bg-white/5 text-slate-400 border-white/10'
                      }`}
                    >
                      <span>{t('apply_stream_auto_scroll')}:</span>
                      <strong className="font-bold">{autoScroll ? 'ON' : 'OFF'}</strong>
                    </button>

                    {/* Copy Terminal Logs Button */}
                    <button
                      type="button"
                      onClick={handleCopyTerminalLogs}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                        copiedTerminalLogs
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : isLightMode
                          ? 'bg-white hover:bg-slate-200 text-slate-700 border-slate-300'
                          : 'bg-white/10 hover:bg-white/15 text-slate-200 border-white/10'
                      }`}
                    >
                      {copiedTerminalLogs ? (
                        <>
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{t('apply_stream_copied')}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>{t('apply_stream_copy_logs')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Virtual Terminal Console Stream Output */}
                <div className={`border rounded-xl p-4 font-mono text-xs max-h-96 overflow-y-auto dir-ltr text-left space-y-2 shadow-inner select-text ${
                  isLightMode
                    ? 'bg-slate-900 border-slate-700 text-slate-200'
                    : 'bg-slate-950 border-white/15 text-slate-300'
                }`}>
                  {filteredLogs.map((log: TemplateExecutionLog, idx: number) => {
                    const statusBadgeClass =
                      log.status === 'ok'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : log.status === 'warn'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : log.status === 'error'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';

                    const statusBadgeLabel =
                      log.status === 'ok'
                        ? t('apply_stream_badge_success')
                        : log.status === 'warn'
                        ? t('apply_stream_badge_warning')
                        : log.status === 'error'
                        ? t('apply_stream_badge_error')
                        : t('apply_stream_badge_info');

                    return (
                      <div key={idx} className="leading-snug transition-all">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-slate-500 select-none text-[10px] font-mono">
                            [{log.timestamp}]
                          </span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border select-none ${statusBadgeClass}`}>
                            {statusBadgeLabel}
                          </span>
                          <span className="text-cyan-400 font-bold select-none">
                            {log.prompt}
                          </span>
                          <span className="text-white font-medium">
                            {log.command}
                          </span>
                        </div>
                        {log.output && (
                          <div
                            className={`pl-4 mt-1 select-text whitespace-pre-wrap ${
                              log.status === 'error'
                                ? 'text-rose-400'
                                : log.status === 'warn'
                                ? 'text-amber-400'
                                : 'text-emerald-400/90'
                            }`}
                          >
                            {log.output}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Active cursor pulse when streaming is in flight */}
                  {isStreamingActive && (
                    <div className="flex items-center gap-2 pt-1 text-cyan-400">
                      <span className="text-[10px] text-slate-500">[{new Date().toLocaleTimeString()}]</span>
                      <span className="text-cyan-400 font-bold">
                        {selectedDevice?.model?.toLowerCase().includes('mikrotik') ? `[admin@${selectedDevice?.name}] >` : `${selectedDevice?.name}#`}
                      </span>
                      <span className="inline-block w-2.5 h-4 bg-cyan-400 animate-pulse" />
                    </div>
                  )}

                  <div ref={terminalEndRef} />
                </div>

                {/* Done Modal Actions */}
                {activeStep === 'done' && (
                  <div className={`flex items-center justify-between pt-4 border-t ${
                    isLightMode ? 'border-slate-200' : 'border-white/10'
                  }`}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDownloadScript}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                          isLightMode
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                            : 'bg-white/10 hover:bg-white/15 text-slate-200'
                        }`}
                      >
                        <Download className="w-4 h-4" />
                        <span>{t('apply_download_backup')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopyTerminalLogs}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                          copiedTerminalLogs
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : isLightMode
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                            : 'bg-white/10 hover:bg-white/15 text-slate-200'
                        }`}
                      >
                        {copiedTerminalLogs ? (
                          <>
                            <CheckCheck className="w-4 h-4 text-emerald-400" />
                            <span>{t('apply_stream_copied')}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>{t('apply_stream_copy_logs')}</span>
                          </>
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleClose}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-bold shadow-md transition active:scale-95 cursor-pointer"
                    >
                      <span>{t('apply_btn_finish')}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>,
    document.body
  );
};
