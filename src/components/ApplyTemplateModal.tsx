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
  AlertOctagon,
  Play,
  Terminal,
  Copy,
  Check,
  Download,
  Server,
  Router as RouterIcon,
  ShieldAlert,
  ShieldCheck,
  Shield,
  ArrowRight,
  ArrowLeft,
  Info,
  RefreshCw,
  Cpu,
  Layers,
  Sparkles,
  Database,
  HardDriveDownload,
  Key,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Columns,
  Sliders,
  CheckSquare,
  Square,
  FileText,
  GitCompare,
  RotateCcw,
  Undo2,
  Activity,
  Wifi,
  WifiOff,
  Search,
  Clock,
  ListOrdered,
  FileCheck
} from 'lucide-react';
import {
  Device,
  ConfigTemplate,
  TemplateApplyResult,
  TemplateExecutionLog,
  AccessPolicy,
  DeviceConfigExtractRequest
} from '../types';
import {
  fetchTemplates,
  applyTemplateToDevice,
  extractConfigFromDevice,
  createTemplate,
  testDeviceConnection
} from '../services/api';
import { logDeviceCommand } from '../services/auditLogger';
import { useLanguage } from '../i18n/LanguageContext';
import { useModalDock } from '../context/ModalDockContext';
import { FieldInfoTooltip } from './common/FieldInfoTooltip';
import { isDeviceActionPermitted } from '../utils/rbac';
import { VaultPasswordPickerModal } from './vault/VaultPasswordPickerModal';

export interface DangerAnalysisItem {
  line: string;
  reasonEn: string;
  reasonFa: string;
  severity: 'warning' | 'critical';
}

export interface DangerAnalysis {
  riskLevel: 'safe' | 'medium' | 'high' | 'critical';
  dangerLines: DangerAnalysisItem[];
}

export function analyzeTemplateDanger(script: string, vendor: string): DangerAnalysis {
  const lines = script.split('\n');
  const dangerLines: DangerAnalysisItem[] = [];
  const v = (vendor || 'cisco').toLowerCase();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('!') || line.startsWith('#')) continue;

    // Critical Cisco commands
    if (v === 'cisco' || v === 'generic') {
      if (/^(write\s+erase|erase\s+startup-config|erase\s+nvram)/i.test(line)) {
        dangerLines.push({
          line,
          reasonEn: 'Wipes non-volatile configuration memory (NVRAM). All saved device configs will be erased.',
          reasonFa: 'پاک‌سازی کامل حافظه دائمی (NVRAM). تمام تنظیمات ذخیره‌شده تجهیز حذف خواهند شد.',
          severity: 'critical'
        });
      } else if (/^(reload|boot\s+system)/i.test(line)) {
        dangerLines.push({
          line,
          reasonEn: 'Device restart or reboot instruction. Will cause immediate network traffic outage.',
          reasonFa: 'دستور راه‌اندازی مجدد یا ری‌بوت تجهیز. باعث قطعی آنی ترافیک شبکه خواهد شد.',
          severity: 'critical'
        });
      } else if (/^no\s+ip\s+address/i.test(line)) {
        dangerLines.push({
          line,
          reasonEn: 'Removes IP address from interface. May cause management lockout if applied to uplink interface.',
          reasonFa: 'حذف آدرس آی‌پی از اینترفیس. در صورت اعمال روی پورت آپ‌لینک یا مدیریتی ارتباط قطع خواهد شد.',
          severity: 'warning'
        });
      } else if (/^shutdown/i.test(line)) {
        dangerLines.push({
          line,
          reasonEn: 'Administrative port shutdown command. Disables physical or logical link.',
          reasonFa: 'دستور غیرفعال‌سازی (Shutdown) اینترفیس شبکه و قطع لینک ارتباطی.',
          severity: 'warning'
        });
      } else if (/^default\s+interface/i.test(line)) {
        dangerLines.push({
          line,
          reasonEn: 'Resets interface configuration back to factory default state.',
          reasonFa: 'بازنشانی تنظیمات اینترفیس به حالت پیش‌فرض کارخانه‌ای.',
          severity: 'warning'
        });
      }
    }

    // Critical MikroTik commands
    if (v === 'mikrotik' || v === 'generic') {
      if (/system\s+reset-configuration/i.test(line)) {
        dangerLines.push({
          line,
          reasonEn: 'Factory resets RouterOS configuration and wipes all IP addresses, routing, and firewall rules.',
          reasonFa: 'ریست کارخانه‌ای سیستم RouterOS و پاک‌سازی کامل کلیه آدرس‌ها، روت‌ها و رول‌های فایروال.',
          severity: 'critical'
        });
      } else if (/system\s+reboot/i.test(line)) {
        dangerLines.push({
          line,
          reasonEn: 'Reboots RouterOS hardware. Will drop active sessions and interrupt traffic.',
          reasonFa: 'ری‌استارت سخت‌افزار روتر میکروتیک و قطع موقت نشست‌ها و ترافیک عبوری شبکه.',
          severity: 'critical'
        });
      } else if (/remove\s+\[\s*find/i.test(line)) {
        dangerLines.push({
          line,
          reasonEn: 'Bulk deletes multiple configuration entries or active firewall filters.',
          reasonFa: 'حذف دسته‌جمعی مدخل‌ها، رول‌های فایروال یا صف‌های ترافیکی در RouterOS.',
          severity: 'warning'
        });
      } else if (/interface\s+(ethernet|bridge|vlan)\s+disable/i.test(line)) {
        dangerLines.push({
          line,
          reasonEn: 'Disables network interface on MikroTik hardware.',
          reasonFa: 'غیرفعال‌سازی اینترفیس شبکه در سخت‌افزار میکروتیک.',
          severity: 'warning'
        });
      }
    }
  }

  const hasCritical = dangerLines.some((d) => d.severity === 'critical');
  const hasWarning = dangerLines.some((d) => d.severity === 'warning');

  let riskLevel: DangerAnalysis['riskLevel'] = 'safe';
  if (hasCritical) riskLevel = 'critical';
  else if (hasWarning) riskLevel = 'high';
  else if (dangerLines.length > 0) riskLevel = 'medium';

  return { riskLevel, dangerLines };
}

export interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  content: string;
  oldNum?: number;
  newNum?: number;
}

/**
 * Computes line-by-line difference between baseline running config and new rendered template commands
 */
export function computeLineDiff(originalText: string, newText: string): DiffLine[] {
  const origLines = originalText ? originalText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];

  if (origLines.length === 0 && newLines.length === 0) return [];
  if (origLines.length === 0) {
    return newLines.map((line, idx) => ({
      type: 'added',
      content: line,
      newNum: idx + 1,
    }));
  }
  if (newLines.length === 0) {
    return origLines.map((line, idx) => ({
      type: 'removed',
      content: line,
      oldNum: idx + 1,
    }));
  }

  if (originalText === newText) {
    return origLines.map((line, idx) => ({
      type: 'unchanged',
      content: line,
      oldNum: idx + 1,
      newNum: idx + 1,
    }));
  }

  const n = origLines.length;
  const m = newLines.length;

  // For very large configs, use fast linear diff to avoid quadratic memory explosion
  if (n * m > 1000000) {
    const result: DiffLine[] = [];
    const maxLen = Math.max(n, m);
    for (let i = 0; i < maxLen; i++) {
      const o = origLines[i];
      const nw = newLines[i];
      if (o === nw) {
        result.push({ type: 'unchanged', content: o, oldNum: i + 1, newNum: i + 1 });
      } else {
        if (o !== undefined) result.push({ type: 'removed', content: o, oldNum: i + 1 });
        if (nw !== undefined) result.push({ type: 'added', content: nw, newNum: i + 1 });
      }
    }
    return result;
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (origLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const diff: DiffLine[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === newLines[j - 1]) {
      diff.unshift({
        type: 'unchanged',
        content: origLines[i - 1],
        oldNum: i,
        newNum: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({
        type: 'added',
        content: newLines[j - 1],
        newNum: j,
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diff.unshift({
        type: 'removed',
        content: origLines[i - 1],
        oldNum: i,
      });
      i--;
    }
  }

  return diff;
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
  onBackupCreated?: (newTemplate: ConfigTemplate) => void;
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
  onBackupCreated,
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

  // Backdrop dismiss safety locks for Chromium event dispatching
  const mouseDownOnBackdropRef = useRef<boolean>(false);
  const [preventBackdropClose, setPreventBackdropClose] = useState<boolean>(true);

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      mouseDownOnBackdropRef.current = true;
    } else {
      mouseDownOnBackdropRef.current = false;
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (
      e.target === e.currentTarget &&
      mouseDownOnBackdropRef.current &&
      !preventBackdropClose &&
      !isApplying &&
      !isBackingUp
    ) {
      handleClose();
    }
    mouseDownOnBackdropRef.current = false;
  };

  const [selectedDevice, setSelectedDevice] = useState<Device | null>(
    initialTargetDevice || (allDevices.length > 0 ? allDevices[0] : null)
  );
  const [isMaximized, setIsMaximized] = useState(false);
  const [templates, setTemplates] = useState<ConfigTemplate[]>(propTemplates || []);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(preselectedTemplateId || '');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [activeStep, setActiveStep] = useState<'variables' | 'preview' | 'executing' | 'done'>('variables');

  // Preview display mode: split (variables + terminal) | full (terminal only) | diff (visual config diff)
  const [previewViewMode, setPreviewViewMode] = useState<'split' | 'full' | 'diff'>('split');
  const [diffLayout, setDiffLayout] = useState<'unified' | 'side-by-side'>('unified');

  // Interactive Variables State
  const [showAllDevices, setShowAllDevices] = useState(false);
  const prevDeviceRef = useRef<string | null>(null);
  const prevIsOpenRef = useRef(false);
  const prevTargetDeviceIdRef = useRef<string | null>(null);
  const prevPreselectedTemplateIdRef = useRef<string | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [isIpConfirmed, setIsIpConfirmed] = useState<boolean>(true);
  const [copiedScript, setCopiedScript] = useState(false);

  // Pre-Apply Live Device Backup Snapshot State (Engineering Safety Guard)
  const [enablePreBackup, setEnablePreBackup] = useState<boolean>(true);
  const [backupTemplateName, setBackupTemplateName] = useState<string>('');
  const [backupCredMode, setBackupCredMode] = useState<'device' | 'custom'>('device');
  const [customUsername, setCustomUsername] = useState<string>('admin');
  const [customPassword, setCustomPassword] = useState<string>('');
  const [customEnablePassword, setCustomEnablePassword] = useState<string>('');
  const [showCustomPassword, setShowCustomPassword] = useState(false);
  const [showCustomEnablePassword, setShowCustomEnablePassword] = useState(false);
  const [isVaultPickerOpen, setIsVaultPickerOpen] = useState(false);
  const [vaultPickerTarget, setVaultPickerTarget] = useState<'password' | 'enable'>('password');
  const [backupAutoParam, setBackupAutoParam] = useState<boolean>(true);
  const [backupSanitize, setBackupSanitize] = useState<boolean>(true);

  // Live Pre-Flight Device Connectivity & Health Probe State
  const [probeStatus, setProbeStatus] = useState<'idle' | 'probing' | 'online' | 'unreachable'>('idle');
  const [probeLatencyMs, setProbeLatencyMs] = useState<number | null>(null);
  const [probeMessage, setProbeMessage] = useState<string | null>(null);

  // Live Diff Baseline Config State
  const [liveBaselineConfig, setLiveBaselineConfig] = useState<string>('');
  const [fetchingBaseline, setFetchingBaseline] = useState<boolean>(false);
  const [baselineError, setBaselineError] = useState<string | null>(null);

  // Strict Confirmation Gate States
  const [confirmReviewChecked, setConfirmReviewChecked] = useState(false);
  const [confirmBackupChecked, setConfirmBackupChecked] = useState(false);
  const [confirmDangerChecked, setConfirmDangerChecked] = useState(false);
  const [confirmHostnameInput, setConfirmHostnameInput] = useState('');

  // Execution state
  const [isApplying, setIsApplying] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupStatusMessage, setBackupProgressMsg] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [createdBackupTemplate, setCreatedBackupTemplate] = useState<ConfigTemplate | null>(null);
  const [applyResult, setApplyResult] = useState<TemplateApplyResult | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [executionLogs, setExecutionLogs] = useState<TemplateExecutionLog[]>([]);

  // Step 3 Execution Dashboard & Metrics State (Phase 2)
  const [executionTab, setExecutionTab] = useState<'terminal' | 'metrics' | 'diff'>('terminal');
  const [logFilter, setLogFilter] = useState<'all' | 'commands' | 'errors'>('all');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [executionStartTime, setExecutionStartTime] = useState<number | null>(null);
  const [elapsedDurationMs, setElapsedDurationMs] = useState<number>(0);
  const [copiedTerminal, setCopiedTerminal] = useState(false);

  // Live Elapsed Timer Effect during execution
  useEffect(() => {
    let interval: any = null;
    if (activeStep === 'executing' && executionStartTime) {
      interval = setInterval(() => {
        setElapsedDurationMs(Date.now() - executionStartTime);
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeStep, executionStartTime]);

  // Close handler with undock
  const handleClose = () => {
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
      if (e.key === 'Escape' && !isApplying && !isBackingUp) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isApplying, isBackingUp]);

  // Sync state strictly on initial modal open or explicit target device/template change
  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      prevTargetDeviceIdRef.current = null;
      prevPreselectedTemplateIdRef.current = null;
      return;
    }

    const isFreshOpen = !prevIsOpenRef.current;
    const isTargetDeviceChanged = Boolean(
      initialTargetDevice?.id &&
      prevTargetDeviceIdRef.current &&
      initialTargetDevice.id !== prevTargetDeviceIdRef.current
    );
    const isTemplateExplicitlyChanged = Boolean(
      preselectedTemplateId &&
      prevPreselectedTemplateIdRef.current &&
      preselectedTemplateId !== prevPreselectedTemplateIdRef.current
    );

    if (isFreshOpen || isTargetDeviceChanged || isTemplateExplicitlyChanged) {
      prevIsOpenRef.current = true;
      prevTargetDeviceIdRef.current = initialTargetDevice?.id || null;
      prevPreselectedTemplateIdRef.current = preselectedTemplateId || null;

      if (preselectedTemplateId) {
        setSelectedTemplateId(preselectedTemplateId);
      }
      if (initialTargetDevice) {
        setSelectedDevice(initialTargetDevice);
      } else if (allDevices.length > 0 && isFreshOpen) {
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

      // Only on initial open or explicit new target device/template do we reset workflow step & confirmations
      setActiveStep('variables');
      setApplyResult(null);
      setApplyError(null);
      setBackupError(null);
      setCreatedBackupTemplate(null);
      setExecutionLogs([]);
      setConfirmReviewChecked(false);
      setConfirmBackupChecked(false);
      setConfirmDangerChecked(false);
      setConfirmHostnameInput('');
      setLiveBaselineConfig('');
      setBaselineError(null);
    }
  }, [isOpen, initialTargetDevice?.id, preselectedTemplateId]);

  // Trigger pre-flight connectivity probe when selected device changes
  const runDeviceProbe = async (device: Device | null) => {
    if (!device || !device.ip) {
      setProbeStatus('idle');
      setProbeLatencyMs(null);
      setProbeMessage(null);
      return;
    }

    setProbeStatus('probing');
    setProbeMessage(isEn ? 'Testing live TCP/SSH socket reachability...' : 'در حال تست دسترسی‌پذیری سوکت TCP/SSH...');

    try {
      const probeRes = await testDeviceConnection({
        ip: device.ip,
        port: Number(device.port) || 22,
        username: device.username || 'admin',
        password: device.password || '',
        connection_protocol: (device.protocol as 'ssh' | 'telnet') || 'ssh',
      });

      if (probeRes.success) {
        setProbeStatus('online');
        setProbeLatencyMs(probeRes.latency_ms || 2);
        setProbeMessage(probeRes.message || (isEn ? 'Device online and responsive' : 'تجهیز آنلاین و پاسخ‌گو می‌باشد'));
      } else {
        setProbeStatus('unreachable');
        setProbeLatencyMs(null);
        setProbeMessage(probeRes.error || probeRes.message || (isEn ? 'Device connection failed' : 'خطا در ارتباط با تجهیز'));
      }
    } catch (err: any) {
      setProbeStatus('unreachable');
      setProbeLatencyMs(null);
      setProbeMessage(err.message || (isEn ? 'Connection timeout' : 'عدم پاسخ‌گویی تجهیز (Timeout)'));
    }
  };

  useEffect(() => {
    if (isOpen && selectedDevice) {
      runDeviceProbe(selectedDevice);
    }
  }, [isOpen, selectedDevice?.id, selectedDevice?.ip]);

  // Fetch live running config to generate real-time visual diff
  const handleFetchBaselineConfig = async () => {
    if (!selectedDevice) return;
    setFetchingBaseline(true);
    setBaselineError(null);

    try {
      const username = backupCredMode === 'custom' && customUsername.trim()
        ? customUsername.trim()
        : (selectedDevice.username || 'admin');
      const password = backupCredMode === 'custom'
        ? customPassword
        : (selectedDevice.password || '');
      const enablePassword = backupCredMode === 'custom'
        ? customEnablePassword
        : '';

      const extractRequest: DeviceConfigExtractRequest = {
        device_id: selectedDevice.id,
        ip: selectedDevice.ip,
        port: Number(selectedDevice.port) || 22,
        protocol: selectedDevice.protocol || 'ssh',
        vendor: currentTemplate?.vendor === 'mikrotik' ? 'mikrotik' : 'cisco',
        target_type: selectedDevice.type || 'switch',
        username,
        password,
        enable_password: enablePassword,
        options: {
          auto_parameterize: false,
          sanitize_secrets: false,
          strip_ephemeral: true,
          mikrotik_compact: true,
        }
      };

      const res = await extractConfigFromDevice(extractRequest);
      setLiveBaselineConfig(res.raw_config || '');
    } catch (err: any) {
      console.warn('Failed to fetch baseline config for diff:', err);
      setBaselineError(err.message || (isEn ? 'Failed to fetch live baseline config from device.' : 'خطا در دریافت کانفیگ فعال تجهیز جهت مقایسه.'));
    } finally {
      setFetchingBaseline(false);
    }
  };

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

  // Automatically update default backup template name when target device changes
  useEffect(() => {
    if (selectedDevice) {
      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
      setBackupTemplateName(`[Backup Snapshot] ${selectedDevice.name} (${nowStr})`);
    }
  }, [selectedDevice]);

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
      DEVICE_NAME: { labelEn: 'Device Name (Hostname)', labelFa: 'نام هاست و شناسه تجهیز', descEn: 'System hostname configured on the device', descFa: 'نام هاست تجهیز در شبکه' },
      IP_ADDRESS: { labelEn: 'Management IP Address', labelFa: 'آدرس آی‌پی مدیریتی', descEn: 'IPv4 address for management interface', descFa: 'آدرس آی‌پی اینترفیس مدیریتی' },
      SUBNET_MASK: { labelEn: 'Subnet Mask', labelFa: 'ماسک زیرشبکه', descEn: 'IPv4 dotted subnet mask', descFa: 'ماسک شبکه استاندارد (255.255.255.0)' },
      SUBNET_CIDR: { labelEn: 'Subnet CIDR Prefix', labelFa: 'طول پیشوند زیرشبکه (CIDR)', descEn: 'CIDR prefix length (e.g. 24)', descFa: 'پیشوند شبکه میکروتیک (مثلاً 24)' },
      DEFAULT_GATEWAY: { labelEn: 'Default Gateway', labelFa: 'دروازه پیش‌فرض (Gateway)', descEn: 'Next-hop default gateway IP', descFa: 'آدرس آی‌پی روتر پیش‌فرض' },
      MANAGEMENT_VLAN: { labelEn: 'Management VLAN ID', labelFa: 'شناسه وی‌لن مدیریتی (VLAN ID)', descEn: 'VLAN number for management', descFa: 'شماره وی‌لن پیش‌فرض مدیریت' },
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

  // Pre-fill variable values based on current device and template
  useEffect(() => {
    if (!currentTemplate || !selectedDevice) return;

    setVariableValues((prev) => {
      const isNewDevice = prevDeviceRef.current !== selectedDevice.id;
      const initialVars: Record<string, string> = isNewDevice ? {} : { ...prev };

      allDiscoveredVariables.forEach((v) => {
        if (isNewDevice || initialVars[v.name] === undefined || initialVars[v.name] === '') {
          let val = v.default_value || '';

          switch (v.name) {
            case 'DEVICE_NAME':
              val = selectedDevice.name || val;
              break;
            case 'IP_ADDRESS':
              val = selectedDevice.ip || val;
              break;
            case 'BUILDING':
              val = selectedDevice.building || val;
              break;
            case 'FLOOR':
              val = selectedDevice.floor || val;
              break;
            case 'UNIT':
              val = selectedDevice.unit || val;
              break;
            case 'RACK':
              val = selectedDevice.rack || val;
              break;
            case 'DEFAULT_GATEWAY':
              if (selectedDevice.ip) {
                const parts = selectedDevice.ip.split('.');
                if (parts.length === 4) {
                  val = `${parts[0]}.${parts[1]}.${parts[2]}.254`;
                }
              }
              break;
            case 'SUBNET_MASK':
              val = '255.255.255.0';
              break;
            case 'SUBNET_CIDR':
              val = '24';
              break;
            case 'MANAGEMENT_VLAN':
              val = '1';
              break;
            default:
              break;
          }

          initialVars[v.name] = val;
        }
      });

      return initialVars;
    });

    prevDeviceRef.current = selectedDevice.id;
    setIsIpConfirmed(true);
  }, [currentTemplate, selectedDevice, allDiscoveredVariables]);

  // Render script preview reactively whenever template or variableValues change
  const renderedScript = useMemo(() => {
    if (!currentTemplate) return '';
    let script = currentTemplate.commands;
    Object.entries(variableValues).forEach(([k, v]) => {
      script = script.split(`{{${k}}}`).join(v || `[${k}]`);
    });
    return script;
  }, [currentTemplate, variableValues]);

  // Danger command scan analysis
  const dangerAnalysis = useMemo(() => {
    if (!currentTemplate || !renderedScript) {
      return { riskLevel: 'safe' as const, dangerLines: [] };
    }
    return analyzeTemplateDanger(renderedScript, currentTemplate.vendor);
  }, [renderedScript, currentTemplate]);

  // Computed line diff between live baseline running config and new rendered script
  const diffLines = useMemo(() => {
    return computeLineDiff(liveBaselineConfig, renderedScript);
  }, [liveBaselineConfig, renderedScript]);

  const diffCounts = useMemo(() => {
    let added = 0;
    let removed = 0;
    let unchanged = 0;
    for (const d of diffLines) {
      if (d.type === 'added') added++;
      else if (d.type === 'removed') removed++;
      else unchanged++;
    }
    return { added, removed, unchanged };
  }, [diffLines]);

  // Computed line diff between pre-apply backup snapshot and applied rendered script (Phase 2)
  const postApplyDiffLines = useMemo(() => {
    if (!createdBackupTemplate) return [];
    return computeLineDiff(createdBackupTemplate.commands, renderedScript);
  }, [createdBackupTemplate, renderedScript]);

  // Simple IPv4 format check
  const isIpValid = useMemo(() => {
    const ip = variableValues['IP_ADDRESS'];
    if (!ip) return false;
    const regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return regex.test(ip.trim());
  }, [variableValues]);

  // Check whether strict approval prerequisites are fully satisfied
  const isApprovalUnlocked = useMemo(() => {
    if (!selectedDevice || !currentTemplate) return false;
    if (!isIpConfirmed || !isIpValid) return false;
    if (!isDevicePermittedForApply(selectedDevice)) return false;

    // Checkbox 1: Mandatory review verification
    if (!confirmReviewChecked) return false;

    // Checkbox 2: If backup enabled, must be acknowledged
    if (enablePreBackup && !confirmBackupChecked) return false;

    // Checkbox 3: If danger commands exist, explicit risk acknowledgement required
    if (dangerAnalysis.dangerLines.length > 0 && !confirmDangerChecked) return false;

    // Hostname typing confirmation requirement (Strict Protection)
    const expectedName = (selectedDevice.name || '').trim().toLowerCase();
    const typedName = (confirmHostnameInput || '').trim().toLowerCase();
    if (expectedName && typedName !== expectedName) return false;

    return true;
  }, [
    selectedDevice,
    currentTemplate,
    isIpConfirmed,
    isIpValid,
    confirmReviewChecked,
    enablePreBackup,
    confirmBackupChecked,
    dangerAnalysis,
    confirmDangerChecked,
    confirmHostnameInput
  ]);

  const handleCopyScript = () => {
    navigator.clipboard.writeText(renderedScript);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleCopyTerminalOutput = () => {
    const text = executionLogs.map((l) => `[${l.timestamp}] [${l.prompt}] ${l.command}\n${l.output || ''}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedTerminal(true);
    setTimeout(() => setCopiedTerminal(false), 2000);
  };

  const handleExportAuditLog = () => {
    if (!selectedDevice || !currentTemplate) return;
    const nowIso = new Date().toISOString();
    const divider = '='.repeat(72);
    const subDivider = '-'.repeat(72);

    let content = `${divider}\n`;
    content += `NETTOPOLOGY NETWORK EQUIPMENT ORCHESTRATION ENGINE\n`;
    content += `PRODUCTION CONFIGURATION TEMPLATE DEPLOYMENT AUDIT LOG\n`;
    content += `${divider}\n`;
    content += `Generated At:        ${nowIso}\n`;
    content += `Target Hostname:     ${selectedDevice.name}\n`;
    content += `Target IP Address:   ${selectedDevice.ip}:${selectedDevice.port || 22} (${(selectedDevice.protocol || 'SSH').toUpperCase()})\n`;
    content += `Equipment Model:     ${selectedDevice.model || 'Unknown'} (${currentTemplate.vendor.toUpperCase()})\n`;
    content += `Physical Location:   ${[selectedDevice.building, selectedDevice.floor, selectedDevice.unit, selectedDevice.rack ? `Rack ${selectedDevice.rack}` : ''].filter(Boolean).join(' > ') || 'N/A'}\n`;
    content += `Template Name:       ${currentTemplate.name}\n`;
    content += `Template ID:         ${currentTemplate.id}\n`;
    content += `Execution Mode:      ${applyResult?.execution_mode || 'direct_applied'}\n`;
    content += `Pre-Apply Backup:    ${createdBackupTemplate ? `YES (ID: ${createdBackupTemplate.id}, Name: "${createdBackupTemplate.name}")` : 'NO / DISABLED'}\n`;
    content += `Total Duration:      ${elapsedDurationMs ? `${(elapsedDurationMs / 1000).toFixed(2)}s` : 'N/A'}\n`;
    content += `Risk Level:          ${dangerAnalysis.riskLevel.toUpperCase()} (${dangerAnalysis.dangerLines.length} dangerous commands flagged)\n`;
    content += `Commands Total:      ${applyResult?.command_summary?.total ?? executionLogs.length}\n`;
    content += `Commands Succeeded:  ${applyResult?.command_summary?.success ?? executionLogs.filter((l) => l.status === 'ok').length}\n`;
    content += `Commands Warnings:   ${applyResult?.command_summary?.warning ?? 0}\n`;
    content += `Commands Errors:     ${applyResult?.command_summary?.error ?? 0}\n`;
    content += `${subDivider}\n\n`;

    content += `RESOLVED DYNAMIC TEMPLATE VARIABLES:\n`;
    Object.entries(variableValues).forEach(([k, v]) => {
      content += `  - {{${k}}}: ${v}\n`;
    });
    content += `\n${subDivider}\n\n`;

    content += `DETAILED COMMAND EXECUTION TRACE & TERMINAL RESPONSES:\n`;
    executionLogs.forEach((log, idx) => {
      content += `[${idx + 1}] [${log.timestamp}] [${log.prompt}] ${log.command}\n`;
      if (log.output) {
        content += `     >>> ${log.output.replace(/\n/g, '\n     >>> ')}\n`;
      }
      content += `     Status: ${log.status.toUpperCase()}${log.duration_ms ? ` | Latency: ${log.duration_ms}ms` : ''}\n\n`;
    });

    content += `${divider}\n`;
    content += `END OF AUDIT LOG - SYSTEM INTEGRITY VERIFIED\n`;
    content += `${divider}\n`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanDevName = (selectedDevice.name || 'device').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.download = `audit-template-apply-${cleanDevName}-${Date.now()}.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadScript = () => {
    const ext = currentTemplate?.vendor === 'mikrotik' ? 'rsc' : 'cfg';
    const blob = new Blob([renderedScript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${variableValues['DEVICE_NAME'] || 'device-config'}.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Instant Rollback action: immediately arms the modal with the backup snapshot
  const handleInstantRollback = (backupTmpl: ConfigTemplate) => {
    setSelectedTemplateId(backupTmpl.id);
    setEnablePreBackup(false);
    setActiveStep('preview');
    setConfirmReviewChecked(false);
    setConfirmBackupChecked(false);
    setConfirmDangerChecked(false);
    setConfirmHostnameInput('');
    setApplyResult(null);
    setApplyError(null);
  };

  // Execute Pre-Apply Backup and Apply Pipeline with strict safety
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

    if (!isIpConfirmed || !isIpValid) {
      setApplyError(
        isEn
          ? 'Please review and confirm the validity of the IP address.'
          : 'لطفاً صحت آدرس آی‌پی (IP Address) را بررسی و تایید نمایید.'
      );
      return;
    }

    if (!isApprovalUnlocked) {
      setApplyError(
        isEn
          ? 'Strict approval requirements not met. Please complete all confirmation checkboxes and type the device hostname.'
          : 'شرایط تایید سخت‌گیرانه تکمیل نشده است. لطفاً چک‌باکس‌های تایید را علامت زده و نام هاست تجهیز را تایپ نمایید.'
      );
      return;
    }

    const startTime = Date.now();
    setExecutionStartTime(startTime);
    setElapsedDurationMs(0);
    setExecutionTab('terminal');
    setLogFilter('all');
    setLogSearchQuery('');

    setIsApplying(true);
    setActiveStep('executing');
    setApplyError(null);
    setBackupError(null);
    const initialLogs: TemplateExecutionLog[] = [];

    const nowLogTime = () => new Date().toTimeString().split(' ')[0];

    // ==========================================
    // STAGE 1: Pre-Apply Live Backup Snapshot
    // ==========================================
    if (enablePreBackup) {
      setIsBackingUp(true);
      const stage1Log: TemplateExecutionLog = {
        timestamp: nowLogTime(),
        prompt: '[STAGE 1: BACKUP]',
        command: `Extract live configuration from ${selectedDevice.name} (${selectedDevice.ip})...`,
        output: isEn
          ? `Initiating pre-apply backup snapshot over SSH/Telnet to safeguard running state before template execution.`
          : `شروع استخراج بکاپ زنده از تجهیز جهت تضمین امکان بازگردانی در صورت بروز خطا قبل از تزریق دستورات.`,
        status: 'info'
      };
      initialLogs.push(stage1Log);
      setExecutionLogs([...initialLogs]);
      setBackupProgressMsg(isEn ? 'Extracting running configuration from device...' : 'در حال دریافت کانفیگ فعال تجهیز...');

      try {
        const username = backupCredMode === 'custom' && customUsername.trim()
          ? customUsername.trim()
          : (selectedDevice.username || 'admin');
        const password = backupCredMode === 'custom'
          ? customPassword
          : (selectedDevice.password || '');
        const enablePassword = backupCredMode === 'custom'
          ? customEnablePassword
          : '';

        const extractRequest: DeviceConfigExtractRequest = {
          device_id: selectedDevice.id,
          ip: selectedDevice.ip,
          port: Number(selectedDevice.port) || 22,
          protocol: selectedDevice.protocol || 'ssh',
          vendor: currentTemplate.vendor === 'mikrotik' ? 'mikrotik' : 'cisco',
          target_type: selectedDevice.type || 'switch',
          username,
          password,
          enable_password: enablePassword,
          options: {
            auto_parameterize: backupAutoParam,
            sanitize_secrets: backupSanitize,
            strip_ephemeral: true,
            mikrotik_compact: true,
          }
        };

        const extractRes = await extractConfigFromDevice(extractRequest);

        initialLogs.push({
          timestamp: nowLogTime(),
          prompt: '[BACKUP EXTRACTED]',
          command: `Received ${(extractRes.raw_config || '').length} bytes of live configuration stream.`,
          output: isEn
            ? `Successfully captured configuration. Creating new backup template in library...`
            : `کانفیگ زنده تجهیز با موفقیت دریافت گردید. در حال ثبت تمپلیت بکاپ در کتابخانه الگوها...`,
          status: 'success'
        });
        setExecutionLogs([...initialLogs]);

        // Automatically store as a new ConfigTemplate in database
        const backupName = (backupTemplateName || `[Backup Snapshot] ${selectedDevice.name} - ${nowLogTime()}`).trim();
        const newTemplatePayload: Partial<ConfigTemplate> = {
          name: backupName,
          vendor: extractRes.vendor,
          target_type: extractRes.target_type,
          role: 'Backup Snapshot',
          description: isEn
            ? `Safety snapshot captured from "${selectedDevice.name}" (${selectedDevice.ip}) before applying template "${currentTemplate.name}".`
            : `نسخه پشتیبان ایمنی تهیه شده از تجهیز «${selectedDevice.name}» (${selectedDevice.ip}) قبل از اعمال الگوی «${currentTemplate.name}».`,
          default_cli_mode: currentTemplate.default_cli_mode || (extractRes.vendor === 'mikrotik' ? 'ROUTEROS' : 'GLOBAL_CONFIG'),
          commands: extractRes.parameterized_commands || extractRes.raw_config,
          variables: extractRes.detected_variables || [],
        };

        const createdRes = await createTemplate(newTemplatePayload);
        setCreatedBackupTemplate(createdRes.template);

        // Add to local templates state immediately
        setTemplates((prev) => [createdRes.template, ...prev]);

        // Notify parent views so templates list in TemplateManagementView immediately includes the backup!
        if (onBackupCreated) {
          onBackupCreated(createdRes.template);
        }

        initialLogs.push({
          timestamp: nowLogTime(),
          prompt: '[BACKUP STORED]',
          command: `Saved template "${createdRes.template.name}" (ID: ${createdRes.template.id})`,
          output: isEn
            ? `Backup snapshot template is now available in Network Equipment Config Templates library.`
            : `تمپلیت بکاپ با موفقیت در کتابخانه الگوهای کانفیگ ذخیره شد و در لیست تمپلیت‌ها قابل مشاهده و بازیابی است.`,
          status: 'success'
        });
        setExecutionLogs([...initialLogs]);
        setBackupProgressMsg(null);
      } catch (backupErr: any) {
        console.error('Pre-apply backup failed:', backupErr);
        const errMsg = backupErr.message || (isEn ? 'Failed to extract pre-apply backup snapshot.' : 'خطا در استخراج نسخه پشتیبان زنده.');
        setBackupError(errMsg);
        initialLogs.push({
          timestamp: nowLogTime(),
          prompt: '[BACKUP ERROR]',
          command: 'Pre-apply backup snapshot extraction failed.',
          output: errMsg,
          status: 'error'
        });
        setExecutionLogs([...initialLogs]);
        setApplyError(
          isEn
            ? `Safety Guard Alert: Pre-apply backup failed (${errMsg}). Execution halted to protect network device.`
            : `هشدار گارد ایمنی: تهیه نسخه پشتیبان با خطا مواجه شد (${errMsg}). جهت حفاظت از تجهیز، فرآیند اعمال متوقف گردید.`
        );
        setIsBackingUp(false);
        setIsApplying(false);
        setActiveStep('preview');
        return;
      } finally {
        setIsBackingUp(false);
      }
    }

    // ==========================================
    // STAGE 2: CLI Command Injection & Push
    // ==========================================
    try {
      initialLogs.push({
        timestamp: nowLogTime(),
        prompt: '[STAGE 2: APPLY]',
        command: `Pushing template "${currentTemplate.name}" to ${selectedDevice.name}...`,
        output: isEn
          ? `Deploying resolved configuration commands to target hardware.`
          : `در حال تزریق و اعمال فرامین پیکربندی به سخت‌افزار مقصد.`,
        status: 'info'
      });
      setExecutionLogs([...initialLogs]);

      const result = await applyTemplateToDevice({
        device_id: selectedDevice.id,
        template_id: currentTemplate.id,
        resolved_variables: variableValues,
        credentials: backupCredMode === 'custom' && customUsername.trim() ? {
          username: customUsername.trim(),
          password: customPassword,
          enable_password: customEnablePassword,
        } : undefined,
      });

      // Update accurate execution elapsed time
      if (result.total_duration_ms) {
        setElapsedDurationMs(result.total_duration_ms);
      } else if (startTime) {
        setElapsedDurationMs(Date.now() - startTime);
      }

      // Merge backend execution logs
      const combinedLogs = [...initialLogs, ...(result.logs || [])];
      setExecutionLogs(combinedLogs);
      setApplyResult(result);
      setActiveStep('done');

      // Audit Log template application with diff metrics and snapshot ref
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
          riskLevel: dangerAnalysis.riskLevel === 'critical' ? 'critical' : dangerAnalysis.riskLevel === 'high' ? 'high' : 'medium',
          status: 'success',
          outputSummary: `${result.message} [Diff: +${diffCounts.added} -${diffCounts.removed}]`,
          notes: `اعمال قالب «${currentTemplate.name}» (بکاپ زنده: ${enablePreBackup ? 'انجام شد' : 'غیرفعال'} | تمپلیت بکاپ: ${createdBackupTemplate?.id || 'none'})`,
        });
      } catch (logErr) {
        console.warn('Failed to audit template execution:', logErr);
      }

      if (onApplied) {
        onApplied(result.device);
      }
    } catch (err: any) {
      setApplyError(err.message || 'خطا در اعمال تمپلیت روی تجهیز');
      setActiveStep('preview');
    } finally {
      setIsApplying(false);
    }
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
          : 'max-w-5xl max-h-[calc(100vh-4rem)] my-auto rounded-2xl border'
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
                {enablePreBackup && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border flex items-center gap-1 ${
                    isLightMode
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  }`}>
                    <HardDriveDownload className="w-3 h-3" />
                    <span>{isEn ? 'Backup Guard' : 'گارد بکاپ'}</span>
                  </span>
                )}
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
              disabled={isApplying || isBackingUp}
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
              disabled={isApplying || isBackingUp}
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
              <span>{isEn ? '1. Variables & Backup Guard' : '۱. متغیرها و گارد بکاپ'}</span>
            </button>

            <span className={isLightMode ? 'text-slate-400' : 'text-slate-600'}>→</span>

            <button
              onClick={() => setActiveStep('preview')}
              disabled={isApplying || isBackingUp}
              className={`flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-lg transition cursor-pointer ${
                activeStep === 'preview'
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
                2
              </span>
              <span>{isEn ? '2. Live Diff & Strict Approval' : '۲. پیش‌نمایش، مقایسه Diff و تایید'}</span>
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
                3
              </span>
              <span>{isEn ? '3. Deployment & Rollback Point' : '۳. اعمال و نقطه بازگردانی'}</span>
            </div>
          </div>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 ${isLightMode ? 'bg-white' : ''}`}>
          {/* Target Device & Template Selector Bar */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl border transition ${
            isLightMode ? 'bg-slate-50/90 border-slate-200' : 'bg-white/5 border-white/10'
          }`}>
            {/* Target Device Selector & Live Pre-Flight Probe */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={`text-xs font-semibold flex items-center gap-1.5 ${
                  isLightMode ? 'text-slate-700' : 'text-slate-300'
                }`}>
                  <Server className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{t('apply_target_device')}</span>
                </label>
                <div className="flex items-center gap-2">
                  {/* Pre-Flight Probe Status Badge */}
                  {selectedDevice && (
                    <div className="flex items-center gap-1">
                      {probeStatus === 'probing' ? (
                        <span className={`text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 border ${
                          isLightMode ? 'bg-cyan-50 border-cyan-300 text-cyan-800' : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300'
                        }`}>
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                          <span>{isEn ? 'Probing...' : 'تست پینگ...'}</span>
                        </span>
                      ) : probeStatus === 'online' ? (
                        <span className={`text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 border font-semibold ${
                          isLightMode ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        }`} title={probeMessage || ''}>
                          <Wifi className="w-2.5 h-2.5" />
                          <span>{isEn ? `Online (${probeLatencyMs}ms)` : `آنلاین (${probeLatencyMs}ms)`}</span>
                        </span>
                      ) : probeStatus === 'unreachable' ? (
                        <span className={`text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 border font-semibold ${
                          isLightMode ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                        }`} title={probeMessage || ''}>
                          <WifiOff className="w-2.5 h-2.5" />
                          <span>{isEn ? 'Unreachable' : 'عدم پاسخ'}</span>
                        </span>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => runDeviceProbe(selectedDevice)}
                        className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer`}
                        title={isEn ? 'Re-run connectivity probe' : 'تست مجدد اتصال'}
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>
                  )}

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
                    fieldName={isEn ? 'Target Device & Probe' : 'تجهیز هدف و پروب شبکه'}
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
                    disabled={isApplying || isBackingUp}
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
                disabled={isApplying || isBackingUp || loadingTemplates}
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

          {/* STEP 1: Interactive Variables & Pre-Apply Live Backup Snapshot Guard */}
          {activeStep === 'variables' && currentTemplate && (
            <div className="space-y-6 animate-fadeIn">
              {/* Pre-Apply Live Device Config Backup Guard (Strict Engineering Requirement) */}
              <div
                className={`p-4 rounded-xl border transition-all ${
                  enablePreBackup
                    ? isLightMode
                      ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-xs'
                      : 'bg-emerald-500/10 border-emerald-500/30'
                    : isLightMode
                    ? 'bg-slate-50 border-slate-200 text-slate-800'
                    : 'bg-white/5 border-white/10 text-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-xl mt-0.5 ${
                        enablePreBackup
                          ? isLightMode
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-emerald-500/20 text-emerald-300'
                          : isLightMode
                          ? 'bg-slate-200 text-slate-600'
                          : 'bg-white/10 text-slate-400'
                      }`}
                    >
                      <HardDriveDownload className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className={`text-sm font-bold flex items-center gap-2 ${
                        isLightMode ? 'text-slate-900' : 'text-white'
                      }`}>
                        <span>{isEn ? 'Pre-Apply Live Config Backup Snapshot (Safety Guard)' : 'تهیه نسخه پشتیبان زنده از کانفیگ تجهیز پیش از اعمال (گارد ایمنی)'}</span>
                        <FieldInfoTooltip
                          fieldName={isEn ? 'Pre-Apply Backup Snapshot' : 'بکاپ خودکار پیش از اعمال'}
                          infoWhatEn="Extracts live running configuration directly from the device over SSH/Telnet and stores it as a new template in the library before applying any commands."
                          infoWhatFa="کانفیگ فعال فعلی تجهیز را مستقیماً از طریق SSH استخراج کرده و به عنوان یک تمپلیت جدید در لیست ذخیره می‌نماید تا امکان بازگردانی سریع فراهم باشد."
                          infoWhyEn="Critical safety safeguard in network engineering: ensures zero configuration loss if the new template causes service disruption."
                          infoWhyFa="استاندارد حیاتی مهندسی شبکه: تضمین عدم از دست رفتن تنظیمات و امکان بازگشت (Rollback) در صورت بروز اختلال."
                          infoExampleEn="[Backup Snapshot] SW-CORE-01 (2026-10-12 16:30)"
                          infoExampleFa="[Backup Snapshot] سوییچ کور ساختمان ۱"
                          isEn={isEn}
                          isLightMode={isLightMode}
                        />
                      </h4>
                      <p className={`text-xs mt-1 leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                        {isEn
                          ? 'Would you like to extract a full live backup snapshot from this device before applying the template? If enabled, it operates like Live Device Config Extractor and adds the snapshot directly to your Templates Library.'
                          : 'آیا تمایل دارید پیش از اعمال تمپلیت، از کانفیگ فعلی این تجهیز نسخه پشتیبان (Backup Snapshot) استخراج و ذخیره شود؟ در صورت فعال‌سازی، مشابه Live Device Config Extractor عمل کرده و نسخه پشتیبان را مستقیماً به همین لیست تمپلیت‌ها اضافه می‌کند.'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setEnablePreBackup(!enablePreBackup)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition shadow-sm cursor-pointer ${
                      enablePreBackup
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-xs'
                        : isLightMode
                        ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        : 'bg-white/10 text-slate-300 hover:bg-white/15'
                    }`}
                  >
                    {enablePreBackup ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Backup Enabled' : 'بکاپ فعال است'}</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>{isEn ? 'Backup Disabled (Risky)' : 'بکاپ غیرفعال (پرریسک)'}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Backup Settings Panel (if enabled) */}
                {enablePreBackup && (
                  <div className={`mt-4 pt-3 border-t space-y-3 ${isLightMode ? 'border-emerald-200' : 'border-white/10'}`}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={`block text-[11px] font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                          <span>{isEn ? 'Snapshot Template Name in Library:' : 'نام تمپلیت پشتیبان در کتابخانه الگوها:'}</span>
                        </label>
                        <input
                          type="text"
                          value={backupTemplateName}
                          onChange={(e) => setBackupTemplateName(e.target.value)}
                          placeholder="[Backup Snapshot] Device-Name"
                          className={`w-full px-3 py-1.5 rounded-xl text-xs font-mono focus:outline-none transition ${
                            isLightMode
                              ? 'bg-white border border-slate-300 text-slate-900 focus:border-cyan-600 shadow-xs'
                              : 'bg-slate-950 border border-white/15 text-white focus:border-cyan-500'
                          }`}
                        />
                      </div>

                      <div>
                        <label className={`block text-[11px] font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                          <span>{isEn ? 'SSH Credentials for Extraction:' : 'اطلاعات احراز هویت SSH جهت استخراج:'}</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setBackupCredMode('device')}
                            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-medium border transition cursor-pointer ${
                              backupCredMode === 'device'
                                ? isLightMode
                                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                                  : 'bg-indigo-600/30 border-cyan-500/40 text-cyan-300 font-bold'
                                : isLightMode
                                ? 'bg-white border-slate-300 text-slate-600'
                                : 'bg-slate-950 border-white/10 text-slate-400'
                            }`}
                          >
                            {isEn ? 'Use Stored Device Credentials' : 'استفاده از اطلاعات ذخیره‌شده تجهیز'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setBackupCredMode('custom')}
                            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-medium border transition cursor-pointer ${
                              backupCredMode === 'custom'
                                ? isLightMode
                                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                                  : 'bg-indigo-600/30 border-cyan-500/40 text-cyan-300 font-bold'
                                : isLightMode
                                ? 'bg-white border-slate-300 text-slate-600'
                                : 'bg-slate-950 border-white/10 text-slate-400'
                            }`}
                          >
                            {isEn ? 'Custom Credentials' : 'نام کاربری و رمز سفارشی'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Custom Credentials Inputs (if selected) */}
                    {backupCredMode === 'custom' && (
                      <div className={`p-3 rounded-xl border grid grid-cols-1 sm:grid-cols-3 gap-3 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-white/10'
                      }`}>
                        <div>
                          <label className={`block text-[10px] font-medium mb-1 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                            {isEn ? 'Username' : 'نام کاربری'}
                          </label>
                          <input
                            type="text"
                            value={customUsername}
                            onChange={(e) => setCustomUsername(e.target.value)}
                            className={`w-full px-2.5 py-1 rounded-lg text-xs font-mono focus:outline-none ${
                              isLightMode ? 'bg-slate-50 border border-slate-300' : 'bg-slate-900 border border-white/10'
                            }`}
                          />
                        </div>
                        <div>
                          <label className={`block text-[10px] font-medium mb-1 flex items-center justify-between ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                            <span>{isEn ? 'Password' : 'رمز عبور SSH'}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setVaultPickerTarget('password');
                                setIsVaultPickerOpen(true);
                              }}
                              className="text-[10px] text-cyan-500 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Key className="w-2.5 h-2.5" />
                              <span>{isEn ? 'Vault' : 'ولت'}</span>
                            </button>
                          </label>
                          <div className="relative">
                            <input
                              type={showCustomPassword ? 'text' : 'password'}
                              value={customPassword}
                              onChange={(e) => setCustomPassword(e.target.value)}
                              className={`w-full px-2.5 py-1 pr-7 rounded-lg text-xs font-mono focus:outline-none ${
                                isLightMode ? 'bg-slate-50 border border-slate-300' : 'bg-slate-900 border border-white/10'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowCustomPassword(!showCustomPassword)}
                              className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-200"
                            >
                              {showCustomPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className={`block text-[10px] font-medium mb-1 flex items-center justify-between ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                            <span>{isEn ? 'Enable Secret (Cisco)' : 'رمز Enable (سیسکو)'}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setVaultPickerTarget('enable');
                                setIsVaultPickerOpen(true);
                              }}
                              className="text-[10px] text-cyan-500 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Key className="w-2.5 h-2.5" />
                              <span>{isEn ? 'Vault' : 'ولت'}</span>
                            </button>
                          </label>
                          <div className="relative">
                            <input
                              type={showCustomEnablePassword ? 'text' : 'password'}
                              value={customEnablePassword}
                              onChange={(e) => setCustomEnablePassword(e.target.value)}
                              className={`w-full px-2.5 py-1 pr-7 rounded-lg text-xs font-mono focus:outline-none ${
                                isLightMode ? 'bg-slate-50 border border-slate-300' : 'bg-slate-900 border border-white/10'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowCustomEnablePassword(!showCustomEnablePassword)}
                              className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-200"
                            >
                              {showCustomEnablePassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-[11px] pt-1">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={backupAutoParam}
                          onChange={(e) => setBackupAutoParam(e.target.checked)}
                          className="rounded text-cyan-600"
                        />
                        <span>{isEn ? 'Auto-parameterize IP/Host to {{VARS}}' : 'پارامتریک‌سازی خودکار مقادیر هاست و آی‌پی'}</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={backupSanitize}
                          onChange={(e) => setBackupSanitize(e.target.checked)}
                          className="rounded text-cyan-600"
                        />
                        <span>{isEn ? 'Sanitize secret passwords' : 'پاک‌سازی امن رمزهای عبور (Sanitize)'}</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Interactive IP Confirmation Box */}
              <div
                className={`p-4 rounded-xl border transition-all ${
                  isIpConfirmed && isIpValid
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
                        isIpConfirmed && isIpValid
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
                        {isIpValid ? (
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

                {/* Direct Network & Host Parameter Overrides */}
                <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 pt-3 border-t ${
                  isLightMode ? 'border-slate-200' : 'border-white/10'
                }`}>
                  <div>
                    <label className={`block text-[11px] font-medium mb-1 flex items-center justify-between ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                      <span>{isEn ? 'Host Name (DEVICE_NAME)' : 'نام هاست و شناسه تجهیز'}</span>
                      <FieldInfoTooltip
                        fieldName={isEn ? 'Device Hostname' : 'نام هاست تجهیز'}
                        infoWhatEn="System identifier hostname to be set on the target hardware."
                        infoWhatFa="شناسه و نام سیستم تجهیز که در تنظیمات خط فرمان ست می‌شود."
                        infoWhyEn="Required for network discovery, DNS records, and inventory identification."
                        infoWhyFa="الزامی برای شناسایی تجهیز در شبکه، مانیتورینگ و لاگ‌های سیستمی."
                        infoExampleEn="SW-ACCESS-02"
                        infoExampleFa="SW-FLOOR1-CORE"
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </label>
                    <input
                      type="text"
                      value={variableValues['DEVICE_NAME'] || ''}
                      onChange={(e) =>
                        setVariableValues({ ...variableValues, DEVICE_NAME: e.target.value })
                      }
                      placeholder={selectedDevice?.name || 'Device-Hostname'}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-mono focus:outline-none transition ${
                        isLightMode
                          ? 'bg-white border border-slate-300 text-slate-900 focus:border-cyan-600 shadow-xs'
                          : 'bg-slate-950 border border-white/15 text-white focus:border-cyan-500'
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`block text-[11px] font-medium mb-1 flex items-center justify-between ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                      <span>{t('apply_ip_field')}</span>
                      <FieldInfoTooltip
                        fieldName={isEn ? 'Management IP' : 'آدرس آی‌پی مدیریتی'}
                        infoWhatEn="IPv4 management address to configure on the target network device."
                        infoWhatFa="آدرس آی‌پی مدیریتی نسخه ۴ که بر روی اینترفیس اصلی تجهیز تنظیم می‌شود."
                        infoWhyEn="Target device communication and remote access rely directly on this IP address."
                        infoWhyFa="تمام دسترسی‌های خط فرمان، SSH و مانیتورینگ از طریق این آدرس انجام خواهد شد."
                        infoExampleEn="192.168.10.15"
                        infoExampleFa="۱۹۲.۱۶۸.۱۰.۱۵"
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </label>
                    <input
                      type="text"
                      value={variableValues['IP_ADDRESS'] || ''}
                      onChange={(e) => {
                        setVariableValues({ ...variableValues, IP_ADDRESS: e.target.value });
                        setIsIpConfirmed(false);
                      }}
                      placeholder="192.168.1.1"
                      className={`w-full px-3 py-2 rounded-xl text-xs font-mono focus:outline-none transition ${
                        isLightMode
                          ? isIpValid
                            ? 'bg-white border border-slate-300 text-slate-900 focus:border-cyan-600 shadow-xs'
                            : 'bg-white border border-rose-400 text-slate-900 focus:border-rose-500'
                          : isIpValid
                          ? 'bg-slate-950 border border-white/15 text-white focus:border-cyan-500'
                          : 'bg-slate-950 border border-rose-500 text-white focus:border-rose-400'
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`block text-[11px] font-medium mb-1 flex items-center justify-between ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                      <span>{t('apply_subnet_field')}</span>
                      <FieldInfoTooltip
                        fieldName={isEn ? 'Subnet Mask / Prefix' : 'ماسک شبکه / پیشوند'}
                        infoWhatEn="Subnet mask or CIDR prefix length determining the broadcast domain."
                        infoWhatFa="ماسک زیرشبکه یا طول پیشوند شبکه که محدوده آدرس‌های معتبر را مشخص می‌کند."
                        infoWhyEn="Required for IP routing and correct subnet assignment on interface."
                        infoWhyFa="برای مسیریابی صحیح بسته‌ها در لایه ۳ شبکه ضروری است."
                        infoExampleEn="255.255.255.0 or 24"
                        infoExampleFa="255.255.255.0 یا 24"
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </label>
                    <input
                      type="text"
                      value={
                        currentTemplate.vendor === 'mikrotik'
                          ? variableValues['SUBNET_CIDR'] || '24'
                          : variableValues['SUBNET_MASK'] || '255.255.255.0'
                      }
                      onChange={(e) => {
                        if (currentTemplate.vendor === 'mikrotik') {
                          setVariableValues({ ...variableValues, SUBNET_CIDR: e.target.value });
                        } else {
                          setVariableValues({ ...variableValues, SUBNET_MASK: e.target.value });
                        }
                      }}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-mono focus:outline-none transition ${
                        isLightMode
                          ? 'bg-white border border-slate-300 text-slate-900 focus:border-cyan-600 shadow-xs'
                          : 'bg-slate-950 border border-white/15 text-white focus:border-cyan-500'
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`block text-[11px] font-medium mb-1 flex items-center justify-between ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                      <span>{t('apply_gateway_field')}</span>
                      <FieldInfoTooltip
                        fieldName={isEn ? 'Default Gateway' : 'گیت‌وی پیش‌فرض'}
                        infoWhatEn="Next-hop gateway router IP address for traffic exiting the local subnet."
                        infoWhatFa="آدرس آی‌پی روتر یا سوییچ لایه بالاتر برای خروج ترافیک از زیرشبکه."
                        infoWhyEn="Ensures the device can communicate beyond its immediate local segment."
                        infoWhyFa="امکان برقراری ارتباط تجهیز با سایر بخش‌های شبکه و اینترنت را فراهم می‌سازد."
                        infoExampleEn="192.168.1.254"
                        infoExampleFa="۱۹۲.۱۶۸.۱.۲۵۴"
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </label>
                    <input
                      type="text"
                      value={variableValues['DEFAULT_GATEWAY'] || ''}
                      onChange={(e) =>
                        setVariableValues({ ...variableValues, DEFAULT_GATEWAY: e.target.value })
                      }
                      placeholder="192.168.1.254"
                      className={`w-full px-3 py-2 rounded-xl text-xs font-mono focus:outline-none transition ${
                        isLightMode
                          ? 'bg-white border border-slate-300 text-slate-900 focus:border-cyan-600 shadow-xs'
                          : 'bg-slate-950 border border-white/15 text-white focus:border-cyan-500'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Other Template Variables Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className={`text-xs font-bold flex items-center gap-1.5 ${
                    isLightMode ? 'text-slate-800' : 'text-slate-300'
                  }`}>
                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{t('apply_other_params')}</span>
                  </h4>
                  <span className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {t('apply_other_params_desc')}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {allDiscoveredVariables
                    .filter((v) => !['DEVICE_NAME', 'IP_ADDRESS', 'SUBNET_MASK', 'SUBNET_CIDR', 'DEFAULT_GATEWAY'].includes(v.name))
                    .map((variable) => (
                      <div
                        key={variable.name}
                        className={`p-3 rounded-xl border transition ${
                          isLightMode
                            ? 'bg-slate-50/90 border-slate-200 focus-within:border-cyan-600/60 shadow-xs'
                            : 'bg-white/5 border-white/10 focus-within:border-cyan-500/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <label className={`text-[11px] font-medium truncate flex items-center gap-1 ${
                            isLightMode ? 'text-slate-800' : 'text-slate-200'
                          }`}>
                            <span>{variable.label}</span>
                          </label>
                          <div className="flex items-center gap-1">
                            <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                              isLightMode
                                ? 'text-cyan-700 bg-cyan-100/70 border-cyan-300'
                                : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
                            }`}>
                              {`{{${variable.name}}}`}
                            </span>
                            <FieldInfoTooltip
                              fieldName={variable.label}
                              infoWhatEn={`Template parameter placeholder for ${variable.name}.`}
                              infoWhatFa={`متغیر و پارامتر جایگزین در قالب دستورات برای ${variable.name}.`}
                              infoWhyEn="Replaces placeholder dynamically in CLI commands during execution."
                              infoWhyFa="این مقدار قبل از اجرای اسکریپت بر روی تجهیز، در متن فرامین جایگزین می‌گردد."
                              infoExampleEn={variable.default_value || 'Custom Value'}
                              infoExampleFa={variable.default_value || 'مقدار سفارشی'}
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                        </div>
                        <input
                          type={variable.type === 'password' ? 'password' : 'text'}
                          value={variableValues[variable.name] || ''}
                          onChange={(e) =>
                            setVariableValues({
                              ...variableValues,
                              [variable.name]: e.target.value,
                            })
                          }
                          placeholder={variable.default_value || ''}
                          className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono focus:outline-none transition ${
                            isLightMode
                              ? 'bg-white border border-slate-300 text-slate-900 focus:border-cyan-600 shadow-xs'
                              : 'bg-slate-950 border border-white/10 text-white focus:border-cyan-400'
                          }`}
                        />
                        {variable.description && (
                          <div className={`text-[10px] mt-1 truncate ${
                            isLightMode ? 'text-slate-500' : 'text-slate-400'
                          }`} title={variable.description}>
                            {variable.description}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* Step 1 Footer Action */}
              <div className={`flex items-center justify-between pt-4 border-t ${
                isLightMode ? 'border-slate-200' : 'border-white/10'
              }`}>
                <div className="text-xs">
                  {isIpConfirmed && isIpValid ? (
                    <span className={`flex items-center gap-1 font-medium ${
                      isLightMode ? 'text-emerald-700' : 'text-emerald-400'
                    }`}>
                      <Check className="w-3.5 h-3.5" />
                      {t('apply_ready_to_preview')}
                    </span>
                  ) : (
                    <span className={`flex items-center gap-1 font-medium ${
                      isLightMode ? 'text-amber-700' : 'text-amber-400'
                    }`}>
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {t('apply_need_ip_confirm')}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveStep('preview')}
                  disabled={!selectedDevice || !isDevicePermittedForApply(selectedDevice)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold shadow-md transition active:scale-95 ${
                    selectedDevice && isDevicePermittedForApply(selectedDevice)
                      ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white cursor-pointer'
                      : 'bg-slate-700/60 opacity-50 cursor-not-allowed border border-white/5 text-slate-400'
                  }`}
                  title={
                    !selectedDevice
                      ? (isEn ? 'Please select an authorized device' : 'لطفاً یک تجهیز مجاز را انتخاب نمایید')
                      : !isDevicePermittedForApply(selectedDevice)
                      ? (isEn ? 'Access Denied: You do not have permission to execute templates on this device' : 'عدم دسترسی: طبق سیستم RBAC شما مجاز به اعمال تمپلیت روی این تجهیز نیستید')
                      : undefined
                  }
                >
                  <span>{isEn ? 'Proceed to Live Diff & Preview' : 'مشاهده پیش‌نمایش، Diff و تایید'}</span>
                  <ArrowRight className={`w-4 h-4 ${isEn ? '' : 'rotate-180'}`} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Live Command Preview with Interactive Variables Editor, Visual Diff & Strict Approval Gate */}
          {activeStep === 'preview' && currentTemplate && (
            <div className="space-y-5 animate-fadeIn">
              {/* Header Bar: View Mode Switcher, Copy, Download */}
              <div className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border text-xs transition ${
                isLightMode
                  ? 'bg-indigo-50/90 border-indigo-200 text-indigo-950 shadow-xs'
                  : 'bg-indigo-500/10 border-indigo-500/20 text-slate-200'
              }`}>
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-600" />
                  <span className={`font-medium ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                    {isEn ? 'Target: ' : 'تجهیز هدف: '}
                    <b className={`font-mono ${isLightMode ? 'text-slate-950 font-bold' : 'text-white'}`}>
                      {variableValues['DEVICE_NAME'] || selectedDevice?.name}
                    </b>{' '}
                    ({isEn ? 'IP: ' : 'آی‌پی: '}
                    <b className={`font-mono ${isLightMode ? 'text-indigo-700 font-bold' : 'text-cyan-300'}`}>
                      {variableValues['IP_ADDRESS']}
                    </b>)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Triple View Mode Selector: Split | Full Script | Visual Diff */}
                  <div className={`flex items-center rounded-lg p-0.5 border ${
                    isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-white/10'
                  }`}>
                    <button
                      type="button"
                      onClick={() => setPreviewViewMode('split')}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                        previewViewMode === 'split'
                          ? 'bg-cyan-600 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                      title={isEn ? 'Split: Variables + Live Terminal' : 'نمای تفکیکی: ویرایشگر متغیرها + ترمینال'}
                    >
                      {isEn ? 'Vars + Script' : 'متغیرها + اسکریپت'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewViewMode('full')}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                        previewViewMode === 'full'
                          ? 'bg-cyan-600 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                      title={isEn ? 'Full Terminal Script' : 'فقط متن کامل اسکریپت'}
                    >
                      {isEn ? 'Full Script' : 'اسکریپت کامل'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewViewMode('diff');
                        if (!liveBaselineConfig) {
                          handleFetchBaselineConfig();
                        }
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                        previewViewMode === 'diff'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                      title={isEn ? 'Live Visual Diff (Device Config vs Template)' : 'مقایسه تصویری خط‌به‌خط (کانفیگ فعلی با الگو)'}
                    >
                      <GitCompare className="w-2.5 h-2.5" />
                      <span>{isEn ? 'Visual Diff' : 'مقایسه Diff'}</span>
                    </button>
                  </div>

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

              {/* Danger Commands Risk Analysis Banner */}
              {dangerAnalysis.dangerLines.length > 0 && (
                <div className={`p-4 rounded-xl border transition ${
                  dangerAnalysis.riskLevel === 'critical'
                    ? isLightMode
                      ? 'bg-rose-50 border-rose-300 text-rose-950'
                      : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                    : isLightMode
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-xl mt-0.5 ${
                      dangerAnalysis.riskLevel === 'critical'
                        ? isLightMode ? 'bg-rose-200 text-rose-800' : 'bg-rose-500/20 text-rose-300'
                        : isLightMode ? 'bg-amber-200 text-amber-800' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      <AlertOctagon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm">
                          {isEn
                            ? `High-Impact / Destructive Commands Detected (${dangerAnalysis.dangerLines.length} operations)`
                            : `فرامین با ریسک بالا یا مخرب شناسایی شدند (${dangerAnalysis.dangerLines.length} دستور)`}
                        </h4>
                        <span className={`text-[10px] uppercase font-bold font-mono px-2 py-0.5 rounded border ${
                          dangerAnalysis.riskLevel === 'critical'
                            ? 'bg-rose-600 text-white border-rose-700'
                            : 'bg-amber-600 text-white border-amber-700'
                        }`}>
                          {dangerAnalysis.riskLevel}
                        </span>
                      </div>
                      <p className="text-xs mt-1 leading-relaxed opacity-90">
                        {isEn
                          ? 'This template contains sensitive commands capable of resetting configurations, terminating interfaces, or rebooting network equipment. Review each line carefully.'
                          : 'این الگو شامل دستورات حساسی است که ممکن است باعث ریست، حذف تنظیمات، قطع اینترفیس یا راه‌اندازی مجدد سخت‌افزار شوند. خطوط زیر را به دقت بررسی کنید.'}
                      </p>

                      <div className="mt-3 space-y-1.5 max-h-36 overflow-y-auto">
                        {dangerAnalysis.dangerLines.map((d, i) => (
                          <div key={i} className={`p-2 rounded-lg text-xs font-mono flex items-start gap-2 border ${
                            isLightMode ? 'bg-white/80 border-slate-300' : 'bg-slate-950/80 border-white/10'
                          }`}>
                            <span className="font-bold text-rose-500 shrink-0">[{d.severity.toUpperCase()}]</span>
                            <span className="font-bold select-all text-cyan-400 shrink-0">{d.line}</span>
                            <span className="opacity-80 text-[11px] truncate">
                              — {isEn ? d.reasonEn : d.reasonFa}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW 1: Visual Diff View (Live Config vs New Template) */}
              {previewViewMode === 'diff' && (
                <div className={`p-4 rounded-xl border space-y-3 ${
                  isLightMode ? 'bg-slate-50/90 border-slate-200' : 'bg-white/5 border-white/10'
                }`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-white/10">
                    <div className="flex items-center gap-2">
                      <GitCompare className="w-4 h-4 text-indigo-500" />
                      <span className="text-xs font-bold">
                        {isEn ? 'Configuration Diff Analysis' : 'تحلیل و مقایسه تفکیکی فرامین (Diff)'}
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30">
                          +{diffCounts.added} {isEn ? 'added' : 'افزودن'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 font-bold border border-rose-500/30">
                          -{diffCounts.removed} {isEn ? 'removed' : 'حذف'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-500/15 text-slate-400 border border-slate-500/20">
                          {diffCounts.unchanged} {isEn ? 'matching' : 'یکسان'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleFetchBaselineConfig}
                        disabled={fetchingBaseline}
                        className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border font-medium transition cursor-pointer ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 shadow-xs'
                            : 'bg-white/10 border-white/10 text-slate-200 hover:bg-white/15'
                        }`}
                      >
                        <RefreshCw className={`w-3 h-3 ${fetchingBaseline ? 'animate-spin' : ''}`} />
                        <span>{fetchingBaseline ? (isEn ? 'Fetching Config...' : 'در حال دریافت...') : (isEn ? 'Refresh Live Baseline' : 'بروزرسانی کانفیگ جاری')}</span>
                      </button>
                    </div>
                  </div>

                  {baselineError && (
                    <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{baselineError}</span>
                    </div>
                  )}

                  {!liveBaselineConfig && !fetchingBaseline && (
                    <div className={`p-4 rounded-xl border text-center space-y-2 ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-950 border-white/10 text-slate-300'
                    }`}>
                      <p className="text-xs">
                        {isEn
                          ? 'No baseline running config captured yet. Fetch live configuration to see line-by-line additions and deletions.'
                          : 'کانفیگ پایه‌ای برای مقایسه استخراج نشده است. دکمه زیر را بزنید تا کانفیگ فعال تجهیز استخراج و به صورت خط‌به‌خط مقایسه شود.'}
                      </p>
                      <button
                        type="button"
                        onClick={handleFetchBaselineConfig}
                        className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 text-white text-xs font-semibold shadow-xs transition hover:opacity-90 cursor-pointer"
                      >
                        {isEn ? 'Fetch Live Running Config for Diff' : 'دریافت کانفیگ زنده تجهیز جهت نمایش Diff'}
                      </button>
                    </div>
                  )}

                  {/* Diff Lines Table */}
                  {diffLines.length > 0 && (
                    <div className={`rounded-xl border font-mono text-xs max-h-96 overflow-y-auto dir-ltr text-left ${
                      isLightMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-950 border-white/15 text-slate-200'
                    }`}>
                      {diffLines.map((line, idx) => (
                        <div
                          key={idx}
                          className={`flex items-start px-3 py-0.5 leading-relaxed ${
                            line.type === 'added'
                              ? 'bg-emerald-950/40 text-emerald-300 border-l-2 border-emerald-500'
                              : line.type === 'removed'
                              ? 'bg-rose-950/40 text-rose-300 border-l-2 border-rose-500 line-through opacity-75'
                              : 'text-slate-400 hover:bg-white/5'
                          }`}
                        >
                          <span className="w-10 select-none text-right pr-2 text-slate-600 text-[10px]">
                            {line.type === 'removed' ? line.oldNum : line.newNum || line.oldNum}
                          </span>
                          <span className="w-5 select-none font-bold text-center">
                            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                          </span>
                          <span className="whitespace-pre flex-1 select-text">
                            {line.content}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* VIEW 2 & 3: Split View or Full Script View */}
              {previewViewMode !== 'diff' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Interactive Variables Column (in Split View) */}
                  {previewViewMode === 'split' && (
                    <div className={`lg:col-span-4 p-4 rounded-xl border flex flex-col max-h-[28rem] overflow-y-auto space-y-3 ${
                      isLightMode ? 'bg-slate-50/90 border-slate-200' : 'bg-white/5 border-white/10'
                    }`}>
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-white/10">
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          <Sliders className="w-3.5 h-3.5 text-cyan-500" />
                          <span>{isEn ? 'Live Variables Editor' : 'ویرایشگر زنده متغیرها'}</span>
                        </div>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          isLightMode ? 'bg-cyan-100 text-cyan-800' : 'bg-cyan-500/20 text-cyan-300'
                        }`}>
                          {allDiscoveredVariables.length} {isEn ? 'Vars' : 'متغیر'}
                        </span>
                      </div>

                      <p className={`text-[11px] ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                        {isEn
                          ? 'Modify variable values below to immediately update rendered commands in the live preview.'
                          : 'مقادیر متغیرها را در این ستون تغییر دهید تا فرامین خروجی در پیش‌نمایش به صورت آنی به‌روزرسانی شوند.'}
                      </p>

                      <div className="space-y-2.5 flex-1 pr-1">
                        {allDiscoveredVariables.map((v) => (
                          <div key={v.name} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className={`text-[11px] font-medium truncate ${
                                isLightMode ? 'text-slate-800' : 'text-slate-200'
                              }`} title={v.name}>
                                {v.label}
                              </label>
                              <span className="text-[9px] font-mono opacity-60">
                                {`{{${v.name}}}`}
                              </span>
                            </div>
                            <input
                              type={v.type === 'password' ? 'password' : 'text'}
                              value={variableValues[v.name] || ''}
                              onChange={(e) =>
                                setVariableValues({
                                  ...variableValues,
                                  [v.name]: e.target.value,
                                })
                              }
                              placeholder={v.default_value || ''}
                              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono focus:outline-none transition ${
                                isLightMode
                                  ? 'bg-white border border-slate-300 text-slate-900 focus:border-cyan-600 shadow-xs'
                                  : 'bg-slate-950 border border-white/15 text-white focus:border-cyan-400'
                              }`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Terminal Code View Column */}
                  <div className={`${previewViewMode === 'split' ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
                    <div className={`rounded-xl p-4 font-mono text-xs max-h-[28rem] overflow-y-auto dir-ltr text-left selection:bg-cyan-500/30 border shadow-inner ${
                      isLightMode
                        ? 'bg-slate-900 border-slate-700 text-slate-100'
                        : 'bg-slate-950 border-white/15 text-slate-200'
                    }`}>
                      <pre className="whitespace-pre font-mono leading-relaxed">{renderedScript}</pre>
                    </div>
                  </div>
                </div>
              )}

              {/* Strict Multi-Factor Approval Gate (Engineering Strictness Requirement) */}
              <div className={`p-4 rounded-xl border space-y-3 transition ${
                isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950/80 border-white/15 text-slate-100'
              }`}>
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-white/10">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <h4 className="font-bold text-xs uppercase tracking-wider">
                    {isEn ? 'Strict Production Approval & Safety Gate' : 'گیت سخت‌گیرانه تایید و مجوز استقرار در محیط عملیاتی'}
                  </h4>
                </div>

                {probeStatus === 'unreachable' && (
                  <div className="p-2.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                    <WifiOff className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>
                      {isEn
                        ? `Pre-flight probe warning: Target device "${selectedDevice.name}" (${selectedDevice.ip}) did not answer live connection check. Deploying may time out.`
                        : `هشدار پروب پیش از اعمال: تجهیز «${selectedDevice.name}» (${selectedDevice.ip}) به تست دسترسی بلادرنگ پاسخ نداد. اعمال ممکن است با خطای Timeout مواجه شود.`}
                    </span>
                  </div>
                )}

                <div className="space-y-2 text-xs">
                  {/* Checkbox 1: Review confirmed */}
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmReviewChecked}
                      onChange={(e) => setConfirmReviewChecked(e.target.checked)}
                      className="mt-0.5 rounded text-cyan-600"
                    />
                    <span className={confirmReviewChecked ? 'font-semibold text-emerald-600 dark:text-emerald-400' : ''}>
                      {isEn
                        ? `I have thoroughly reviewed all rendered CLI commands and verified that destination equipment is "${selectedDevice.name}" (${selectedDevice.ip}).`
                        : `من فرامین کامپایل‌شده خط فرمان را به طور کامل بررسی نموده و تایید می‌کنم که تجهیز مقصد «${selectedDevice.name}» (${selectedDevice.ip}) می‌باشد.`}
                    </span>
                  </label>

                  {/* Checkbox 2: Backup confirmed (if enabled) */}
                  {enablePreBackup && (
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmBackupChecked}
                        onChange={(e) => setConfirmBackupChecked(e.target.checked)}
                        className="mt-0.5 rounded text-cyan-600"
                      />
                      <span className={confirmBackupChecked ? 'font-semibold text-emerald-600 dark:text-emerald-400' : ''}>
                        {isEn
                          ? `Pre-apply live backup snapshot is enabled and will be archived in the Templates Library prior to command execution.`
                          : `تهیه نسخه پشتیبان زنده پیش از اعمال فعال است و قبل از تزریق دستورات در کتابخانه الگوها آرشیو خواهد شد.`}
                      </span>
                    </label>
                  )}

                  {/* Checkbox 3: Danger confirmed (if danger commands exist) */}
                  {dangerAnalysis.dangerLines.length > 0 && (
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmDangerChecked}
                        onChange={(e) => setConfirmDangerChecked(e.target.checked)}
                        className="mt-0.5 rounded text-rose-600"
                      />
                      <span className={confirmDangerChecked ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-rose-500 font-medium'}>
                        {isEn
                          ? `I acknowledge the ${dangerAnalysis.dangerLines.length} high-impact/destructive commands detected above and assume full responsibility for network impact.`
                          : `من از ${dangerAnalysis.dangerLines.length} دستور پرریسک شناسایی‌شده در بالا آگاه بوده و مسئولیت فنی تاثیرات شبکه را می‌پذیرم.`}
                      </span>
                    </label>
                  )}
                </div>

                {/* Hostname Typing Confirmation Requirement */}
                <div className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/10'
                }`}>
                  <div className="text-xs">
                    <span className="font-semibold block">
                      {isEn ? 'Host Identity Unlock:' : 'قفل امنیتی نام هاست:'}
                    </span>
                    <span className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn
                        ? `Type the exact hostname `
                        : `جهت تایید نهایی، نام هاست `}
                      <b className="font-mono text-cyan-600 dark:text-cyan-400">"{selectedDevice.name}"</b>
                      {isEn ? ' to unlock the deployment button:' : ' را در کادر زیر تایپ فرمایید:'}
                    </span>
                  </div>

                  <input
                    type="text"
                    value={confirmHostnameInput}
                    onChange={(e) => setConfirmHostnameInput(e.target.value)}
                    placeholder={selectedDevice.name}
                    className={`w-full sm:w-56 px-3 py-1.5 rounded-lg text-xs font-mono font-bold focus:outline-none transition ${
                      confirmHostnameInput.trim().toLowerCase() === (selectedDevice.name || '').trim().toLowerCase()
                        ? isLightMode
                          ? 'bg-emerald-50 border border-emerald-400 text-emerald-800'
                          : 'bg-emerald-500/20 border border-emerald-500 text-emerald-300'
                        : isLightMode
                        ? 'bg-slate-50 border border-slate-300 text-slate-800 focus:border-cyan-600'
                        : 'bg-slate-950 border border-white/15 text-white focus:border-cyan-500'
                    }`}
                  />
                </div>
              </div>

              {/* Step 2 Actions */}
              <div className={`flex items-center justify-between pt-4 border-t ${
                isLightMode ? 'border-slate-200' : 'border-white/10'
              }`}>
                <button
                  type="button"
                  onClick={() => setActiveStep('variables')}
                  className={`px-4 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                    isLightMode
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                      : 'bg-white/10 hover:bg-white/15 text-slate-300'
                  }`}
                >
                  {isEn ? '← Back to Variables & Options' : '← بازگشت به تنظیمات و متغیرها'}
                </button>

                <button
                  type="button"
                  onClick={handleExecuteApply}
                  disabled={isApplying || isBackingUp || !isApprovalUnlocked}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-xs font-bold shadow-md transition active:scale-95 ${
                    isApprovalUnlocked && !isApplying && !isBackingUp
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 cursor-pointer shadow-emerald-500/25'
                      : 'bg-slate-700/60 opacity-50 cursor-not-allowed border border-white/5 text-slate-400'
                  }`}
                  title={
                    !isApprovalUnlocked
                      ? (isEn ? 'Please fulfill all strict approval checkboxes and type device hostname' : 'لطفاً تمام چک‌باکس‌های تایید را علامت زده و نام هاست را تایپ کنید')
                      : undefined
                  }
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>
                    {enablePreBackup
                      ? (isEn ? 'Backup & Apply Template to Device' : 'تهیه بکاپ و اعمال قطعی تمپلیت بر روی تجهیز')
                      : (isEn ? 'Apply Template (Without Backup)' : 'اعمال قطعی تمپلیت (بدون بکاپ)')}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Fallback if Step 2 is active but no template is selected */}
          {activeStep === 'preview' && !currentTemplate && (
            <div className={`p-8 text-center rounded-2xl border ${
              isLightMode ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-900/60 border-white/10 text-slate-300'
            }`}>
              <p className="text-sm font-medium">
                {isEn ? 'No template selected. Please return to Step 1 to select a template.' : 'هیچ الگویی انتخاب نشده است. لطفاً برای انتخاب الگو به مرحله ۱ بازگردید.'}
              </p>
              <button
                type="button"
                onClick={() => setActiveStep('variables')}
                className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer transition shadow-md"
              >
                {isEn ? '← Back to Variables & Options' : '← بازگشت به تنظیمات و متغیرها'}
              </button>
            </div>
          )}

          {/* STEP 3: Live Execution Pipeline Stream & Instant Rollback Gate */}
          {(activeStep === 'executing' || activeStep === 'done') && (
            <div className="space-y-4 animate-fadeIn">
              {/* Execution Status Header */}
              <div
                className={`p-4 rounded-xl border flex items-center justify-between transition ${
                  activeStep === 'done'
                    ? isLightMode
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                    : isLightMode
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-950'
                    : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  {activeStep === 'executing' ? (
                    <RefreshCw className="w-5 h-5 text-cyan-600 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  )}
                  <div>
                    <h4 className={`font-bold text-sm ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {activeStep === 'executing'
                        ? isBackingUp
                          ? (isEn ? 'Stage 1/2: Extracting Pre-Apply Backup Snapshot...' : 'مرحله ۱ از ۲: استخراج و آرشیو بکاپ زنده...')
                          : (isEn ? 'Stage 2/2: Deploying Configuration Template...' : 'مرحله ۲ از ۲: تزریق و اعمال فرامین تمپلیت...')
                        : (isEn ? 'Configuration Successfully Deployed and Synced' : 'فرامین تمپلیت با موفقیت اعمال و در NVRAM پایدار شد')}
                    </h4>
                    <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                      {isEn ? 'Device: ' : 'تجهیز: '}<span className={`font-mono font-bold ${isLightMode ? 'text-slate-950' : 'text-white'}`}>{selectedDevice?.name}</span> | {isEn ? 'IP: ' : 'آدرس: '}{' '}
                      <span className={`font-mono font-bold ${isLightMode ? 'text-indigo-700' : 'text-cyan-300'}`}>{selectedDevice?.ip}</span> | {isEn ? 'Audit: Recorded in PostgreSQL' : 'ممیزی: ثبت در دیتابیس PostgreSQL'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {createdBackupTemplate && (
                    <span className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 ${
                      isLightMode
                        ? 'bg-cyan-50 text-cyan-800 border-cyan-300'
                        : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                    }`}>
                      <HardDriveDownload className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Backup Created' : 'بکاپ ذخیره شد'}</span>
                    </span>
                  )}
                  {activeStep === 'done' && (
                    <span className={`px-3 py-1 rounded-lg border text-xs font-bold ${
                      isLightMode
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    }`}>
                      Running & Startup Synced
                    </span>
                  )}
                </div>
              </div>

              {/* Instant Rollback / Restore Card (if backup snapshot was extracted) */}
              {activeStep === 'done' && createdBackupTemplate && (
                <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isLightMode
                    ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950'
                    : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${
                      isLightMode ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-500/20 text-cyan-300'
                    }`}>
                      <RotateCcw className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="font-bold text-xs">
                        {isEn ? 'One-Click Rollback Point Available' : 'نقطه بازگردانی سریع (Rollback Point) در دسترس است'}
                      </h5>
                      <p className={`text-[11px] mt-0.5 ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                        {isEn
                          ? `Snapshot template "${createdBackupTemplate.name}" was saved. If needed, click to instantly revert this device.`
                          : `نسخه پشتیبان «${createdBackupTemplate.name}» ذخیره شد. در صورت بروز هرگونه اختلال، می‌توانید با یک کلیک تجهیز را به حالت قبل بازگردانید.`}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleInstantRollback(createdBackupTemplate)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer shrink-0"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Instant Rollback to Snapshot...' : 'بازگردانی فوری به نسخه پشتیبان...'}</span>
                  </button>
                </div>
              )}

              {/* Streaming Terminal Log Output */}
              <div className={`border rounded-xl p-4 font-mono text-xs max-h-96 overflow-y-auto dir-ltr text-left space-y-1.5 shadow-inner ${
                isLightMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-950 border-white/15 text-slate-300'
              }`}>
                {executionLogs.map((log: TemplateExecutionLog, idx: number) => (
                  <div key={idx} className="leading-snug">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 select-none text-[10px] font-mono">[{log.timestamp}]</span>
                      <span className={`font-bold select-none ${
                        log.prompt.includes('BACKUP') ? 'text-emerald-400' : 'text-cyan-400'
                      }`}>{log.prompt}</span>
                      <span className="text-white font-medium">{log.command}</span>
                    </div>
                    {log.output && (
                      <div
                        className={`pl-4 select-text whitespace-pre-wrap ${
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
                ))}
              </div>

              {/* Done Modal Actions */}
              {activeStep === 'done' && (
                <div className={`flex items-center justify-between pt-4 border-t ${
                  isLightMode ? 'border-slate-200' : 'border-white/10'
                }`}>
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
                    onClick={handleClose}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-bold shadow-md transition active:scale-95 cursor-pointer"
                  >
                    <span>{t('apply_btn_finish')}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Vault Password Picker Modal */}
      <VaultPasswordPickerModal
        isOpen={isVaultPickerOpen}
        onClose={() => setIsVaultPickerOpen(false)}
        onSelectSecret={(secret) => {
          if (vaultPickerTarget === 'password') {
            setCustomPassword(secret.password || '');
          } else {
            setCustomEnablePassword(secret.password || '');
          }
          setIsVaultPickerOpen(false);
        }}
      />
    </div>,
    document.body
  );
};
