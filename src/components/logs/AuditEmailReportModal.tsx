import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Mail,
  Send,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  Calendar,
  Layers,
  Filter,
  Eye,
  Code2,
  Sliders,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Terminal,
  Check,
  X,
  Plus,
  Trash2,
  ExternalLink,
  Sparkles,
  Info,
  Maximize2,
  Minimize2,
  Minus,
  FileSpreadsheet,
  Server,
  Monitor,
  Smartphone,
  Tv,
  MoreHorizontal,
  Search,
  CheckSquare,
  Square,
  Activity,
  HardDrive,
  Cpu,
  Flame,
  UserCheck,
  Boxes,
  Database,
  FolderTree
} from 'lucide-react';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { useLanguage } from '../../i18n/LanguageContext';
import { useModalDock } from '../../context/ModalDockContext';
import {
  AuditReportScheduleConfig,
  AuditLogCategory,
  AuditReportPreviewResult,
  AuditReportSendResult,
  PortalAuditLogEntry,
  DeviceCommandLogEntry,
  ServerCommandAuditLogEntry,
  RemoteServer
} from '../../types';
import {
  fetchAuditReportConfigApi,
  saveAuditReportConfigApi,
  saveAuditEmailReportApi,
  previewAuditReportApi,
  sendAuditReportNowApi,
  fetchEmailConfigApi,
  fetchRemoteServers
} from '../../services/api';

interface AuditEmailReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  portalLogs: PortalAuditLogEntry[];
  commandLogs: DeviceCommandLogEntry[];
  serverLogs?: ServerCommandAuditLogEntry[];
  isLightMode?: boolean;
  reportToEdit?: AuditReportScheduleConfig | null;
  onReportSaved?: (savedReport: AuditReportScheduleConfig) => void;
  initialMode?: 'config' | 'preview';
  initialSmtpStatus?: {
    configured: boolean;
    from: string;
    host: string;
    port: number;
    secure?: string;
  };
}

const ALL_PORTAL_CATEGORIES: { id: AuditLogCategory; labelEn: string; labelFa: string; color: string; descEn: string; descFa: string }[] = [
  {
    id: 'user_management',
    labelEn: 'User Management',
    labelFa: 'مدیریت کاربران و هویت',
    color: '#3b82f6',
    descEn: 'Account creation, role assignment, password resets, logins',
    descFa: 'ایجاد حساب کاربری، تخصیص نقش، بازنشانی رمز و ورود به سامانه'
  },
  {
    id: 'rbac_policy',
    labelEn: 'RBAC & Policies',
    labelFa: 'خط‌مشی‌ها و سطوح دسترسی',
    color: '#8b5cf6',
    descEn: 'Access control modifications, target scope definitions',
    descFa: 'تغییرات سطوح دسترسی و محدوده‌های تجهیزات مجاز'
  },
  {
    id: 'device_inventory',
    labelEn: 'Device Inventory',
    labelFa: 'تجهیزات و دارایی‌های شبکه',
    color: '#06b6d4',
    descEn: 'Adding, modifying, decommissioning network assets & switches',
    descFa: 'ثبت، ویرایش و اسقاط تجهیزات شبکه و سوئیچ‌ها'
  },
  {
    id: 'backup_recovery',
    labelEn: 'Backup & Recovery',
    labelFa: 'پشتیبان‌گیری و بازیابی',
    color: '#10b981',
    descEn: 'Automated disaster recovery backups, snapshots, exports',
    descFa: 'پشتیبان‌گیری اضطراری، استخراج پکیج و بازیابی'
  },
  {
    id: 'topology_network',
    labelEn: 'Topology & Network',
    labelFa: 'نقشه و توپولوژی شبکه',
    color: '#f59e0b',
    descEn: 'CDP/LLDP discovery changes, diagram node coordinate relocations',
    descFa: 'کشف همسایگی، تغییر موقعیت گره‌ها و لایه‌های شماتیک'
  },
  {
    id: 'port_interface',
    labelEn: 'Port & Interfaces',
    labelFa: 'پورت‌ها و اینترفیس‌ها',
    color: '#ec4899',
    descEn: 'VLAN membership reallocations, port enable/shutdown, PoE state',
    descFa: 'تغییر وضعیت پورت، ترانک، اکسس و تخصیص VLAN'
  },
  {
    id: 'system_auth',
    labelEn: 'System & Security',
    labelFa: 'امنیت و احراز هویت سیستم',
    color: '#6366f1',
    descEn: 'Security perimeter alerts, TLS certificate validations, Active Directory',
    descFa: 'هشدارهای امنیتی، اعتبارسنجی سرتیفیکیت و اکتیو دایرکتوری'
  },
];

const ALL_SERVER_CHANNELS: {
  id: string;
  labelEn: string;
  labelFa: string;
  color: string;
  descEn: string;
  descFa: string;
  iconType: 'terminal' | 'rdp' | 'vnc' | 'dots' | 'api';
}[] = [
  {
    id: 'SSH_SHELL',
    labelEn: 'SSH Interactive Terminal',
    labelFa: 'ترمینال تعاملی لینوکس (SSH)',
    color: '#10b981',
    descEn: 'Raw bash/sh command executions and root privilege escalation',
    descFa: 'اجرای دستورات ترمینال، شل تعاملی و سطوح دسترسی روت',
    iconType: 'terminal'
  },
  {
    id: 'REMOTE_DESKTOP_RDP',
    labelEn: 'Windows Remote Desktop (RDP)',
    labelFa: 'ریموت دسکتاپ گرافیکی ویندوز (RDP)',
    color: '#0ea5e9',
    descEn: 'GUI graphical sessions, remote connections, disconnects & locks',
    descFa: 'نشست‌های گرافیکی RDP، اتصال به دسکتاپ و ریموت سرورهای ویندوز',
    iconType: 'rdp'
  },
  {
    id: 'REMOTE_DESKTOP_VNC',
    labelEn: 'VNC Remote Desktop',
    labelFa: 'ریموت دسکتاپ گرافیکی VNC',
    color: '#8b5cf6',
    descEn: 'Linux/Unix VNC display sessions and graphical desktop actions',
    descFa: 'نشست‌های گرافیکی VNC روی توزیع‌های مختلف یونیکس و لینوکس',
    iconType: 'vnc'
  },
  {
    id: '3DOTS_ACTION',
    labelEn: '3-Dots Fleet Quick Actions',
    labelFa: 'اقدامات سریع منوی ۳ نقطه',
    color: '#f59e0b',
    descEn: 'Service control, power reboot, web server, DB and file managers',
    descFa: 'عملیات منوی ۳ نقطه: کنترل سرویس، ریبوت، وب‌سرور، پایگاه داده و فایل',
    iconType: 'dots'
  },
  {
    id: 'API_DISPATCH',
    labelEn: 'Backend API & Automations',
    labelFa: 'فراخوانی‌های خودکار و API',
    color: '#ec4899',
    descEn: 'Automated script dispatches, scheduled cron tasks and daemon jobs',
    descFa: 'دستورات زمان‌بندی‌شده، اسکریپت‌های سیستمی و فراخوانی‌های پس‌زمینه',
    iconType: 'api'
  }
];

const ALL_SERVER_MODULES: {
  id: string;
  labelEn: string;
  labelFa: string;
  color: string;
}[] = [
  { id: 'services', labelEn: 'Systemd Services', labelFa: 'سرویس‌های لینوکس', color: '#3b82f6' },
  { id: 'firewall', labelEn: 'Firewall & Ports', labelFa: 'فایروال و پورت‌ها', color: '#ef4444' },
  { id: 'crontab', labelEn: 'Cron Jobs & Schedules', labelFa: 'کرون‌جاب‌ها و زمان‌بندی', color: '#f59e0b' },
  { id: 'database', labelEn: 'Database Engines (PG/MySQL)', labelFa: 'موتورهای پایگاه داده', color: '#10b981' },
  { id: 'file_manager', labelEn: 'File Explorer & SFTP', labelFa: 'کاوشگر فایل و SFTP', color: '#06b6d4' },
  { id: 'process', labelEn: 'Process Management', labelFa: 'فرآیندها و Task Manager', color: '#8b5cf6' },
  { id: 'terminal', labelEn: 'CLI Terminal Shell', labelFa: 'ترمینال و شل تعاملی', color: '#64748b' },
  { id: 'security', labelEn: 'Security & Privileges', labelFa: 'امنیت و دسترسی‌های سودو', color: '#dc2626' },
  { id: 'users', labelEn: 'User & Group Accounts', labelFa: 'کاربران و گروه‌های سیستم', color: '#d97706' },
  { id: 'docker', labelEn: 'Containers & Docker', labelFa: 'داکر و کانتینرها', color: '#0284c7' },
  { id: 'power', labelEn: 'Power & System Reboots', labelFa: 'کنترل توان و ریبوت', color: '#e11d48' },
];

export const AuditEmailReportModal: React.FC<AuditEmailReportModalProps> = ({
  isOpen,
  onClose,
  portalLogs,
  commandLogs,
  serverLogs = [],
  isLightMode = false,
  reportToEdit = null,
  onReportSaved,
  initialMode = 'config',
  initialSmtpStatus,
}) => {
  const { isEn, isRtl } = useLanguage();
  const { dockModal } = useModalDock();

  // Window states
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'preview'>(initialMode);
  const [configSubTab, setConfigSubTab] = useState<'schedule' | 'portal' | 'server_fleet'>('schedule');

  // Form Config state
  const [config, setConfig] = useState<AuditReportScheduleConfig>({
    enabled: false,
    recipients: [],
    frequency: 'daily',
    timeOfDay: '08:00',
    dayOfWeek: 1,
    dayOfMonth: 1,
    reportTitle: 'NetTopology Enterprise Audit & Activity Report',
    selectedCategories: [
      'user_management',
      'rbac_policy',
      'device_inventory',
      'backup_recovery',
      'topology_network',
      'port_interface',
      'system_auth',
    ],
    includeCommands: true,
    minSeverity: 'all',
    statusFilter: 'all',
    timeframeHours: 24,
    attachCsv: false,
    // Server Fleet Configuration
    includeServerCommands: true,
    selectedServerChannels: ['SSH_SHELL', 'REMOTE_DESKTOP_RDP', 'REMOTE_DESKTOP_VNC', '3DOTS_ACTION', 'API_DISPATCH'],
    selectedServerModules: ['services', 'firewall', 'crontab', 'database', 'file_manager', 'process', 'terminal', 'security', 'users', 'docker', 'power'],
    selectedServerIds: [],
    serverRiskFilter: 'all',
  });

  // Server Fleet Target selection state
  const [fleetServers, setFleetServers] = useState<RemoteServer[]>([]);
  const [isFleetLoading, setIsFleetLoading] = useState(false);
  const [serverSearchTerm, setServerSearchTerm] = useState('');
  const [serverTargetMode, setServerTargetMode] = useState<'all' | 'specific'>('all');

  // SMTP Status state
  const [smtpConfigured, setSmtpConfigured] = useState<boolean>(initialSmtpStatus?.configured ?? false);
  const [smtpFrom, setSmtpFrom] = useState<string>(initialSmtpStatus?.from ?? '');
  const [smtpHost, setSmtpHost] = useState<string>(initialSmtpStatus?.host ?? '');
  const [smtpPort, setSmtpPort] = useState<number>(initialSmtpStatus?.port ?? 587);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingNow, setIsSendingNow] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [recipientInput, setRecipientInput] = useState('');
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    details?: string;
  } | null>(null);

  // Preview state
  const [previewData, setPreviewData] = useState<AuditReportPreviewResult | null>(null);
  const [previewDeviceMode, setPreviewDeviceMode] = useState<'desktop' | 'mobile'>('desktop');

  // Fetch servers list for target server picker
  const loadFleetServers = async () => {
    setIsFleetLoading(true);
    try {
      const res = await fetchRemoteServers();
      if (res && Array.isArray(res.servers)) {
        setFleetServers(res.servers);
      }
    } catch (err) {
      console.warn('Failed to load fleet servers list for audit modal:', err);
    } finally {
      setIsFleetLoading(false);
    }
  };

  // Load config from backend
  const loadConfig = async () => {
    setIsLoading(true);
    setStatusFeedback(null);
    try {
      if (reportToEdit) {
        const hasCustomServers = Array.isArray(reportToEdit.selectedServerIds) && reportToEdit.selectedServerIds.length > 0;
        setServerTargetMode(hasCustomServers ? 'specific' : 'all');
        setConfig({
          ...reportToEdit,
          recipients: Array.isArray(reportToEdit.recipients) ? reportToEdit.recipients : [],
          selectedCategories: Array.isArray(reportToEdit.selectedCategories)
            ? reportToEdit.selectedCategories
            : [
                'user_management',
                'rbac_policy',
                'device_inventory',
                'backup_recovery',
                'topology_network',
                'port_interface',
                'system_auth',
              ],
          includeServerCommands: reportToEdit.includeServerCommands !== undefined ? reportToEdit.includeServerCommands : true,
          selectedServerChannels: Array.isArray(reportToEdit.selectedServerChannels) && reportToEdit.selectedServerChannels.length > 0
            ? reportToEdit.selectedServerChannels
            : ['SSH_SHELL', 'REMOTE_DESKTOP_RDP', 'REMOTE_DESKTOP_VNC', '3DOTS_ACTION', 'API_DISPATCH'],
          selectedServerModules: Array.isArray(reportToEdit.selectedServerModules) && reportToEdit.selectedServerModules.length > 0
            ? reportToEdit.selectedServerModules
            : ['services', 'firewall', 'crontab', 'database', 'file_manager', 'process', 'terminal', 'security', 'users', 'docker', 'power'],
          selectedServerIds: Array.isArray(reportToEdit.selectedServerIds) ? reportToEdit.selectedServerIds : [],
          serverRiskFilter: (reportToEdit.serverRiskFilter as any) || 'all',
        });
      } else {
        setServerTargetMode('all');
        setConfig({
          id: '',
          enabled: true,
          recipients: [],
          frequency: 'daily',
          timeOfDay: '08:00',
          dayOfWeek: 1,
          dayOfMonth: 1,
          reportTitle: isEn ? 'Enterprise Fleet & Network Audit Summary' : 'خلاصه ممیزی و امنیت سازمانی شبکه و سرورها',
          selectedCategories: [
            'user_management',
            'rbac_policy',
            'device_inventory',
            'backup_recovery',
            'topology_network',
            'port_interface',
            'system_auth',
          ],
          includeCommands: true,
          minSeverity: 'all',
          statusFilter: 'all',
          timeframeHours: 24,
          attachCsv: false,
          includeServerCommands: true,
          selectedServerChannels: ['SSH_SHELL', 'REMOTE_DESKTOP_RDP', 'REMOTE_DESKTOP_VNC', '3DOTS_ACTION', 'API_DISPATCH'],
          selectedServerModules: ['services', 'firewall', 'crontab', 'database', 'file_manager', 'process', 'terminal', 'security', 'users', 'docker', 'power'],
          selectedServerIds: [],
          serverRiskFilter: 'all',
        });
      }

      // Load SMTP status and live credentials from backend with fallback support
      try {
        const res = await fetchAuditReportConfigApi();
        if (res && res.smtpConfigured) {
          setSmtpConfigured(true);
          setSmtpFrom(res.smtpFrom || '');
          setSmtpHost(res.smtpHost || '');
          setSmtpPort(res.smtpPort || 587);
        } else {
          const emailRes = await fetchEmailConfigApi();
          if (emailRes?.config?.smtp_host && emailRes.config.smtp_host.trim().length > 0) {
            setSmtpConfigured(true);
            setSmtpHost(emailRes.config.smtp_host.trim());
            setSmtpPort(emailRes.config.smtp_port || 587);
            setSmtpFrom(emailRes.config.from_email || emailRes.config.smtp_user || '');
          } else if (res) {
            setSmtpConfigured(Boolean(res.smtpConfigured));
            setSmtpFrom(res.smtpFrom || '');
            setSmtpHost(res.smtpHost || '');
            setSmtpPort(res.smtpPort || 587);
          }
        }
      } catch (err: any) {
        console.warn('Audit report config fetch warning, checking email settings:', err);
        try {
          const emailRes = await fetchEmailConfigApi();
          if (emailRes?.config?.smtp_host && emailRes.config.smtp_host.trim().length > 0) {
            setSmtpConfigured(true);
            setSmtpHost(emailRes.config.smtp_host.trim());
            setSmtpPort(emailRes.config.smtp_port || 587);
            setSmtpFrom(emailRes.config.from_email || emailRes.config.smtp_user || '');
          }
        } catch (emailErr) {
          console.warn('Email settings fallback check failed:', emailErr);
        }
      }

      // Load registered servers list
      loadFleetServers();

      if (initialMode === 'preview') {
        setActiveTab('preview');
        setTimeout(() => {
          handleGeneratePreview();
        }, 150);
      } else {
        setActiveTab('config');
      }
    } catch (err: any) {
      console.warn('Failed to load audit report schedule configuration:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialSmtpStatus?.configured) {
        setSmtpConfigured(true);
        if (initialSmtpStatus.from) setSmtpFrom(initialSmtpStatus.from);
        if (initialSmtpStatus.host) setSmtpHost(initialSmtpStatus.host);
        if (initialSmtpStatus.port) setSmtpPort(initialSmtpStatus.port);
      }
      loadConfig();
    }
  }, [isOpen, reportToEdit, initialSmtpStatus?.configured, initialSmtpStatus?.host]);

  // Handle minimization to dock
  const handleMinimize = () => {
    dockModal({
      id: 'audit-email-report-modal',
      labelEn: 'Audit Email Reports',
      labelFa: 'گزارش‌گیری ایمیل ممیزی',
      category: 'system',
      onRestore: () => {},
      onClose,
    });
    onClose();
  };

  // Add recipient
  const handleAddRecipient = () => {
    const raw = recipientInput.trim();
    if (!raw) return;

    const parts = raw.split(/[\s,;]+/).map((p) => p.trim()).filter((p) => p.length > 3 && p.includes('@'));
    if (parts.length === 0) {
      setStatusFeedback({
        type: 'error',
        message: isEn ? 'Please enter a valid email address.' : 'لطفاً یک آدرس ایمیل معتبر وارد نمایید.',
      });
      return;
    }

    const current = config.recipients || [];
    const newRecipients = Array.from(new Set([...current, ...parts]));
    setConfig({ ...config, recipients: newRecipients });
    setRecipientInput('');
    setStatusFeedback(null);
  };

  // Remove recipient
  const handleRemoveRecipient = (emailToRemove: string) => {
    const updated = (config.recipients || []).filter((e) => e !== emailToRemove);
    setConfig({ ...config, recipients: updated });
  };

  // Toggle Portal Category
  const handleToggleCategory = (catId: AuditLogCategory) => {
    const current = config.selectedCategories || [];
    let updated: AuditLogCategory[];
    if (current.includes(catId)) {
      if (current.length === 1) {
        setStatusFeedback({
          type: 'error',
          message: isEn ? 'At least one portal category must be selected.' : 'حداقل یک دسته‌بندی پرتال باید انتخاب شده باشد.',
        });
        return;
      }
      updated = current.filter((c) => c !== catId);
    } else {
      updated = [...current, catId];
    }
    setConfig({ ...config, selectedCategories: updated });
    setStatusFeedback(null);
  };

  // Select all or clear portal categories
  const handleSelectAllCategories = () => {
    setConfig({
      ...config,
      selectedCategories: ALL_PORTAL_CATEGORIES.map((c) => c.id),
    });
  };

  // Toggle Server Channel
  const handleToggleServerChannel = (chId: string) => {
    const current = config.selectedServerChannels || [];
    let updated: string[];
    if (current.includes(chId)) {
      if (current.length === 1) {
        setStatusFeedback({
          type: 'error',
          message: isEn ? 'At least one server channel must remain active.' : 'حداقل یک کانال ارتباطی سرور باید فعال باقی بماند.',
        });
        return;
      }
      updated = current.filter((c) => c !== chId);
    } else {
      updated = [...current, chId];
    }
    setConfig({ ...config, selectedServerChannels: updated });
    setStatusFeedback(null);
  };

  const handleSelectAllChannels = () => {
    setConfig({
      ...config,
      selectedServerChannels: ALL_SERVER_CHANNELS.map((c) => c.id),
    });
  };

  // Toggle Server Module
  const handleToggleServerModule = (modId: string) => {
    const current = config.selectedServerModules || [];
    let updated: string[];
    if (current.includes(modId)) {
      if (current.length === 1) {
        setStatusFeedback({
          type: 'error',
          message: isEn ? 'At least one server module must be selected.' : 'حداقل یک ماژول سرور باید انتخاب شده باشد.',
        });
        return;
      }
      updated = current.filter((m) => m !== modId);
    } else {
      updated = [...current, modId];
    }
    setConfig({ ...config, selectedServerModules: updated });
    setStatusFeedback(null);
  };

  const handleSelectAllModules = () => {
    setConfig({
      ...config,
      selectedServerModules: ALL_SERVER_MODULES.map((m) => m.id),
    });
  };

  // Toggle Server ID for target selection
  const handleToggleServerId = (serverId: string) => {
    const current = config.selectedServerIds || [];
    let updated: string[];
    if (current.includes(serverId)) {
      updated = current.filter((id) => id !== serverId);
    } else {
      updated = [...current, serverId];
    }
    setConfig({ ...config, selectedServerIds: updated });
  };

  // Filtered servers list by search term
  const filteredServersList = useMemo(() => {
    if (!serverSearchTerm.trim()) return fleetServers;
    const term = serverSearchTerm.toLowerCase();
    return fleetServers.filter((srv) => {
      const name = (srv.name || '').toLowerCase();
      const host = (srv.hostname || '').toLowerCase();
      const ip = (srv.ip_address || srv.host || '').toLowerCase();
      const os = (srv.os_type || '').toLowerCase();
      return name.includes(term) || host.includes(term) || ip.includes(term) || os.includes(term);
    });
  }, [fleetServers, serverSearchTerm]);

  // Save Config
  const handleSaveConfig = async () => {
    setIsSaving(true);
    setStatusFeedback(null);
    try {
      const payloadToSave: AuditReportScheduleConfig = {
        ...config,
        selectedServerIds: serverTargetMode === 'all' ? [] : (config.selectedServerIds || []),
      };
      const res = await saveAuditEmailReportApi(payloadToSave);
      setConfig(res.report);
      onReportSaved?.(res.report);
      setStatusFeedback({
        type: 'success',
        message: isEn
          ? res.message || 'Audit report schedule and server filters saved successfully in database.'
          : res.message_fa || 'تنظیمات گزارش ایمیل و فیلترهای ناوگان با موفقیت در پایگاه داده ذخیره شد.',
      });
    } catch (err: any) {
      setStatusFeedback({
        type: 'error',
        message: err.message || (isEn ? 'Failed to save settings.' : 'خطا در ذخیره‌سازی تنظیمات.'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Generate Preview
  const handleGeneratePreview = async () => {
    setIsPreviewLoading(true);
    setStatusFeedback(null);
    try {
      const payloadConfig: AuditReportScheduleConfig = {
        ...config,
        selectedServerIds: serverTargetMode === 'all' ? [] : (config.selectedServerIds || []),
      };
      const res = await previewAuditReportApi({
        config: payloadConfig,
        portalLogs,
        commandLogs,
        serverCommandLogs: serverLogs,
        isEn,
      });
      setPreviewData(res);
      setActiveTab('preview');
    } catch (err: any) {
      setStatusFeedback({
        type: 'error',
        message: err.message || (isEn ? 'Failed to generate preview.' : 'خطا در تولید پیش‌نمایش گزارش.'),
      });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // Send Report Now (Immediate dispatch)
  const handleSendNow = async () => {
    if (!config.recipients || config.recipients.length === 0) {
      setStatusFeedback({
        type: 'error',
        message: isEn
          ? 'Please add at least one recipient email address before sending.'
          : 'لطفاً ابتدا حداقل یک آدرس ایمیل گیرنده اضافه نمایید.',
      });
      return;
    }

    if (!smtpConfigured) {
      setStatusFeedback({
        type: 'error',
        message: isEn
          ? 'SMTP connection parameters are not configured. Please configure them in Settings > Email.'
          : 'پارامترهای اتصال سرور SMTP تنظیم نشده است. لطفاً ابتدا در بخش تنظیمات > ایمیل، اطلاعات را ثبت کنید.',
      });
      return;
    }

    setIsSendingNow(true);
    setStatusFeedback({
      type: 'info',
      message: isEn
        ? `Dispatching live audit report to ${config.recipients.join(', ')} via SMTP...`
        : `در حال ارسال زنده گزارش ممیزی به ${config.recipients.join(', ')} از طریق سرور SMTP...`,
    });

    try {
      const payloadConfig: AuditReportScheduleConfig = {
        ...config,
        selectedServerIds: serverTargetMode === 'all' ? [] : (config.selectedServerIds || []),
      };
      const res: AuditReportSendResult = await sendAuditReportNowApi({
        config: payloadConfig,
        portalLogs,
        commandLogs,
        serverCommandLogs: serverLogs,
        isEn,
      });

      if (res.success) {
        setStatusFeedback({
          type: 'success',
          message: isEn
            ? `Report successfully sent to ${res.recipients.length} recipients in ${res.latencyMs}ms! (${res.totalLogs} total events included: ${res.portalLogsCount} portal, ${res.commandLogsCount} network, ${res.serverCommandLogsCount || 0} server fleet)`
            : `گزارش با موفقیت به ${res.recipients.length} گیرنده در ${res.latencyMs} میلی‌ثانیه ارسال شد! (${res.totalLogs} رویداد شامل: ${res.portalLogsCount} پرتال، ${res.commandLogsCount} شبکه، ${res.serverCommandLogsCount || 0} سرور)`,
          details: res.messageId ? `Message ID: ${res.messageId}` : undefined,
        });
        if (config.id && onReportSaved) {
          onReportSaved({
            ...config,
            lastSentAt: new Date().toISOString(),
            lastSendStatus: 'success',
          });
        }
      } else {
        setStatusFeedback({
          type: 'error',
          message: isEn ? (res.error || 'Failed to dispatch email') : (res.error_fa || res.error || 'خطا در ارسال ایمیل'),
        });
      }
    } catch (err: any) {
      setStatusFeedback({
        type: 'error',
        message: err.message || (isEn ? 'An unexpected network error occurred while sending.' : 'خطای شبکه در هنگام ارسال رخ داد.'),
      });
    } finally {
      setIsSendingNow(false);
    }
  };

  if (!isOpen) return null;

  const renderChannelIcon = (type: string) => {
    switch (type) {
      case 'terminal':
        return <Terminal className="w-4 h-4 text-emerald-400" />;
      case 'rdp':
        return <Monitor className="w-4 h-4 text-sky-400" />;
      case 'vnc':
        return <Tv className="w-4 h-4 text-purple-400" />;
      case 'dots':
        return <MoreHorizontal className="w-4 h-4 text-amber-400" />;
      case 'api':
      default:
        return <Code2 className="w-4 h-4 text-pink-400" />;
    }
  };

  const modalNode = (
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[999990] flex flex-col items-center justify-center transition-all duration-200 ${
        isMaximized ? 'p-0' : 'p-3 sm:p-6 bg-black/75 backdrop-blur-sm'
      }`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div
        className={`flex flex-col transition-all duration-200 overflow-hidden ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-5xl max-h-[92vh] rounded-2xl border shadow-2xl'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isLightMode
              ? 'bg-white border-slate-200'
              : 'bg-slate-900/90 border-slate-800/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">
                  {reportToEdit
                    ? isEn
                      ? `Edit Email Report: ${config.reportTitle || reportToEdit.id || ''}`
                      : `ویرایش گزارش ایمیل: ${config.reportTitle || reportToEdit.id || ''}`
                    : isEn
                    ? 'Audit Email Reports & Server Fleet Monitoring'
                    : 'گزارش‌گیری ایمیل ممیزی و ناوگان سرورها'}
                </h2>
                {config.enabled ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {isEn ? 'Schedule Active' : 'زمان‌بندی فعال'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
                    {isEn ? 'Manual Only' : 'ارسال دستی'}
                  </span>
                )}
                {config.includeServerCommands && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1">
                    <Server className="w-3 h-3" />
                    <span>{isEn ? 'Fleet Audit' : 'ممیزی ناوگان'}</span>
                  </span>
                )}
              </div>
              <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Autonomous scheduled reporting covering Portal RBAC, Switches, Linux/Windows Servers, SSH CLI & Remote Desktop'
                  : 'گزارش‌گیری زمان‌بندی‌شده خودکار شامل وقایع پرتال، سوئیچ‌ها، ناوگان لینوکس و ویندوز، نشست‌های SSH و ریموت دسکتاپ'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View Switcher Tabs */}
            <div className={`flex items-center p-1 rounded-lg border ${isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
              <button
                type="button"
                onClick={() => setActiveTab('config')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === 'config'
                    ? isLightMode
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'bg-indigo-600 text-white'
                    : isLightMode
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{isEn ? 'Schedule & Filters' : 'تنظیمات و فیلترها'}</span>
              </button>
              <button
                type="button"
                onClick={handleGeneratePreview}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === 'preview'
                    ? isLightMode
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'bg-indigo-600 text-white'
                    : isLightMode
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{isEn ? 'Email Preview' : 'پیش‌نمایش قالب ایمیل'}</span>
              </button>
            </div>

            {/* Universal Modal Header Controls */}
            <ModalHeaderControls
              onClose={onClose}
              onMinimize={handleMinimize}
              onMaximizeToggle={() => setIsMaximized(!isMaximized)}
              isMaximized={isMaximized}
              isLightMode={isLightMode}
              isEn={isEn}
            />
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* SMTP Status Banner */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
              smtpConfigured
                ? isLightMode
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                  : 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                : isLightMode
                ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                : 'bg-amber-950/20 border-amber-800/40 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  smtpConfigured
                    ? isLightMode ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-900/40 text-emerald-400'
                    : isLightMode ? 'bg-amber-100 text-amber-700' : 'bg-amber-900/40 text-amber-400'
                }`}
              >
                {smtpConfigured ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">
                    {smtpConfigured
                      ? isEn ? 'Corporate SMTP Gateway Connected' : 'درگاه ایمیل سازمانی SMTP متصل است'
                      : isEn ? 'SMTP Gateway Parameters Not Configured' : 'اطلاعات درگاه SMTP ثبت نشده است'}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-black/10">
                    {smtpConfigured ? `${smtpHost}:${smtpPort}` : isEn ? 'No Host' : 'بدون سرور'}
                  </span>
                </div>
                <p className="text-xs opacity-80 mt-0.5">
                  {smtpConfigured
                    ? isEn
                      ? `Dispatches originate from "${smtpFrom || 'configured sender'}". Live credentials from Settings > Email.`
                      : `گزارشات با فرستنده «${smtpFrom || 'فرستنده تعریف‌شده'}» ارسال خواهند شد. با مشخصات ثبت‌شده در تنظیمات > ایمیل.`
                    : isEn
                    ? 'Please configure your mail server settings in SMTP Connection & Account Parameters first to enable sending.'
                    : 'جهت امکان ارسال ایمیل، ابتدا مشخصات سرور را در بخش مشخصات سرور و حساب کاربری ایمیل تنظیم نمایید.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <div className="text-xs text-slate-400">
                <FieldInfoTooltip
                  title={isEn ? 'SMTP Connection Parameters' : 'مشخصات اتصال SMTP'}
                  whatIsIt={isEn ? 'Live SMTP relay credentials configured under Server Settings.' : 'اعتبارنامه‌های اتصال میل‌سرور که در بخش تنظیمات سرور ثبت شده است.'}
                  whyNeeded={isEn ? 'Required to transmit outbound alert and audit emails over encrypted TLS/SSL to mailboxes.' : 'برای ارسال ایمیل‌های امن گزارشات و هشدارها به میل‌باکس مدیران از طریق پروتکل TLS الزامی است.'}
                  example={isEn ? 'smtp.company.com:587 (TLS)' : 'mail.company.local:465 (SSL)'}
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
            </div>
          </div>

          {/* Feedback Toast Banner */}
          {statusFeedback && (
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
                statusFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : statusFeedback.type === 'error'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
              }`}
            >
              {statusFeedback.type === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />}
              {statusFeedback.type === 'error' && <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
              {statusFeedback.type === 'info' && <RefreshCw className="w-5 h-5 shrink-0 mt-0.5 animate-spin" />}
              <div className="flex-1 text-sm">
                <div className="font-semibold">{statusFeedback.message}</div>
                {statusFeedback.details && (
                  <div className="text-xs font-mono opacity-80 mt-1">{statusFeedback.details}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setStatusFeedback(null)}
                className="opacity-70 hover:opacity-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {activeTab === 'config' ? (
            /* ================= CONFIGURATION & SCHEDULE TAB ================= */
            <div className="space-y-5">
              {/* Scope Sub-Navigation Tabs */}
              <div className={`flex items-center gap-2 p-1.5 rounded-xl border ${
                isLightMode ? 'bg-slate-100/90 border-slate-200' : 'bg-slate-900/80 border-slate-800'
              }`}>
                <button
                  type="button"
                  onClick={() => setConfigSubTab('schedule')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    configSubTab === 'schedule'
                      ? isLightMode
                        ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                        : 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : isLightMode
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  <span>{isEn ? '1. Schedule & Recipients' : '۱. زمان‌بندی و گیرندگان'}</span>
                  {config.enabled && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setConfigSubTab('portal')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    configSubTab === 'portal'
                      ? isLightMode
                        ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                        : 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : isLightMode
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span>{isEn ? '2. Portal & Network Scope' : '۲. رویدادهای پرتال و شبکه'}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-black/20 font-mono">
                    {config.selectedCategories?.length || 0}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setConfigSubTab('server_fleet')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    configSubTab === 'server_fleet'
                      ? isLightMode
                        ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                        : 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-lg shadow-teal-600/30'
                      : isLightMode
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Server className="w-4 h-4 text-amber-400" />
                  <span>{isEn ? '3. Server Fleet & Remote Sessions' : '۳. ناوگان سرورها و ریموت دسکتاپ'}</span>
                  {config.includeServerCommands ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-teal-500/20 text-teal-300 font-mono">
                      {isEn ? 'Active' : 'فعال'}
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-500/20 text-slate-400 font-mono">
                      {isEn ? 'Off' : 'خاموش'}
                    </span>
                  )}
                </button>
              </div>

              {/* SUB-TAB 1: SCHEDULE & RECIPIENTS */}
              {configSubTab === 'schedule' && (
                <div
                  className={`p-5 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/40">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-indigo-400" />
                      <h3 className="font-bold text-base">
                        {isEn ? 'Automated Scheduling & Dispatch Frequency' : 'زمان‌بندی خودکار و تناوب ارسال گزارشات'}
                      </h3>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.enabled}
                          onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        <span className="ml-3 text-sm font-semibold select-none">
                          {config.enabled ? (isEn ? 'Enabled' : 'فعال') : (isEn ? 'Disabled' : 'غیرفعال')}
                        </span>
                      </label>

                      <FieldInfoTooltip
                        title={isEn ? 'Automated Scheduled Delivery' : 'ارسال خودکار زمان‌بندی‌شده'}
                        whatIsIt={isEn ? 'Autonomous background daemon that evaluates logs and delivers periodic email reports.' : 'سرویس پس‌زمینه خودکار که در سررسیدهای مقرر گزارشات را به ایمیل‌های مقصد ارسال می‌کند.'}
                        whyNeeded={isEn ? 'Keeps management and security auditors regularly updated without manual export effort.' : 'مدیران و ناظران امنیت شبکه را بدون نیاز به لاگین دستی در جریان وقایع قرار می‌دهد.'}
                        example={isEn ? 'Daily at 08:00 AM' : 'روزانه رأس ساعت ۰۸:۰۰ صبح'}
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                  </div>

                  {/* Title & Frequency Row */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
                    {/* Report Custom Title */}
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        {isEn ? 'Report Subject & Header Title' : 'عنوان گزارش و موضوع ایمیل'}
                      </label>
                      <input
                        type="text"
                        value={config.reportTitle || ''}
                        onChange={(e) => setConfig({ ...config, reportTitle: e.target.value })}
                        placeholder={isEn ? 'e.g. Enterprise Security Audit Report' : 'مثال: گزارش جامع امنیت و وقایع سرورها'}
                        className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-800'
                            : 'bg-slate-950 border-slate-800 text-slate-100'
                        }`}
                      />
                    </div>

                    {/* Frequency */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        {isEn ? 'Frequency' : 'تناوب تکرار'}
                      </label>
                      <select
                        value={config.frequency}
                        onChange={(e) => setConfig({ ...config, frequency: e.target.value as any })}
                        className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-800'
                            : 'bg-slate-950 border-slate-800 text-slate-100'
                        }`}
                      >
                        <option value="hourly">{isEn ? 'Hourly (Every 1 Hour)' : 'ساعتی (هر ۱ ساعت)'}</option>
                        <option value="daily">{isEn ? 'Daily (Once a Day)' : 'روزانه (یک‌بار در روز)'}</option>
                        <option value="weekly">{isEn ? 'Weekly (Once a Week)' : 'هفتگی (یک‌بار در هفته)'}</option>
                        <option value="monthly">{isEn ? 'Monthly (Once a Month)' : 'ماهانه (یک‌بار در ماه)'}</option>
                      </select>
                    </div>

                    {/* Execution Time */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        {isEn ? 'Dispatch Time (24h)' : 'ساعت ارسال (۲۴ ساعته)'}
                      </label>
                      <input
                        type="time"
                        value={config.timeOfDay}
                        onChange={(e) => setConfig({ ...config, timeOfDay: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-800'
                            : 'bg-slate-950 border-slate-800 text-slate-100'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Audit Timeframe Window */}
                  <div className="mb-5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      {isEn ? 'Audit Time Window (Lookback Scope)' : 'بازه زمانی پوشش وقایع'}
                    </label>
                    <select
                      value={config.timeframeHours}
                      onChange={(e) => setConfig({ ...config, timeframeHours: Number(e.target.value) })}
                      className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-800 text-slate-100'
                      }`}
                    >
                      <option value={1}>{isEn ? 'Last 1 Hour' : '۱ ساعت اخیر'}</option>
                      <option value={6}>{isEn ? 'Last 6 Hours' : '۶ ساعت اخیر'}</option>
                      <option value={12}>{isEn ? 'Last 12 Hours' : '۱۲ ساعت اخیر'}</option>
                      <option value={24}>{isEn ? 'Last 24 Hours (Recommended for Daily)' : '۲۴ ساعت گذشته (پیشنهادی روزانه)'}</option>
                      <option value={168}>{isEn ? 'Last 7 Days (Recommended for Weekly)' : '۷ روز گذشته (پیشنهادی هفتگی)'}</option>
                      <option value={720}>{isEn ? 'Last 30 Days (Recommended for Monthly)' : '۳۰ روز گذشته (پیشنهادی ماهانه)'}</option>
                      <option value={0}>{isEn ? 'All Historical Logs' : 'تمامی وقایع تاریخچه'}</option>
                    </select>
                  </div>

                  {/* Recipients Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {isEn ? 'Recipient Email Addresses' : 'ایمیل‌های دریافت‌کننده گزارش'}
                      </label>
                      <span className="text-xs text-slate-500">
                        {config.recipients?.length || 0} {isEn ? 'recipients added' : 'گیرنده افزوده شده'}
                      </span>
                    </div>

                    {/* Add Input */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="relative flex-1">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                        <input
                          type="text"
                          value={recipientInput}
                          onChange={(e) => setRecipientInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddRecipient();
                            }
                          }}
                          placeholder={
                            isEn
                              ? 'Enter email (e.g. security@company.com, admin@domain.org) and press Add'
                              : 'ایمیل را وارد کنید (مانند security@company.com) و دکمه افزودن را بزنید'
                          }
                          className={`w-full pl-9 pr-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                            isLightMode
                              ? 'bg-slate-50 border-slate-300 text-slate-800'
                              : 'bg-slate-950 border-slate-800 text-slate-100'
                          }`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddRecipient}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer transition-colors shadow-sm"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{isEn ? 'Add' : 'افزودن'}</span>
                      </button>
                    </div>

                    {/* Chips List */}
                    <div className="flex flex-wrap gap-2 min-h-[38px] p-2 rounded-lg border border-dashed border-slate-800/80 bg-slate-950/40">
                      {config.recipients && config.recipients.length > 0 ? (
                        config.recipients.map((email) => (
                          <span
                            key={email}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                          >
                            <span>{email}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveRecipient(email)}
                              className="hover:text-rose-400 cursor-pointer transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500 italic p-1">
                          {isEn
                            ? 'No recipient email configured yet. Type an email address above to add.'
                            : 'هنوز آدرس ایمیلی تعریف نشده است. آدرس گیرنده را در کادر بالا وارد نمایید.'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: PORTAL & NETWORK SCOPE */}
              {configSubTab === 'portal' && (
                <div
                  className={`p-5 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/40">
                    <div className="flex items-center gap-2">
                      <Layers className="w-5 h-5 text-cyan-400" />
                      <h3 className="font-bold text-base">
                        {isEn ? 'Portal Audit Scope & Category Inclusions' : 'دسته‌بندی‌های وقایع و محدوده پرتال و شبکه'}
                      </h3>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleSelectAllCategories}
                        className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer"
                      >
                        {isEn ? 'Select All Categories' : 'انتخاب همه دسته‌ها'}
                      </button>

                      <FieldInfoTooltip
                        title={isEn ? 'Portal Categories' : 'دسته‌بندی‌های وقایع پرتال'}
                        whatIsIt={isEn ? 'Structured portal modules generating administrative activity events.' : 'ماژول‌های ساختاریافته پرتال که رویدادهای مدیریتی را ثبت می‌کنند.'}
                        whyNeeded={isEn ? 'Enables filtering reports strictly to security, device modifications, or comprehensive audit trails.' : 'امکان فیلتر کردن گزارش‌ها بر اساس تغییرات تجهیزات، امنیت، یا رویدادهای جامع را فراهم می‌سازد.'}
                        example={isEn ? 'User Management + RBAC Policies' : 'مدیریت کاربران + خط‌مشی‌ها'}
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                  </div>

                  {/* Category Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
                    {ALL_PORTAL_CATEGORIES.map((cat) => {
                      const isSelected = (config.selectedCategories || []).includes(cat.id);
                      return (
                        <div
                          key={cat.id}
                          onClick={() => handleToggleCategory(cat.id)}
                          className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-3 select-none ${
                            isSelected
                              ? isLightMode
                                ? 'bg-indigo-50 border-indigo-300 text-slate-900'
                                : 'bg-indigo-950/20 border-indigo-500/40 text-slate-100'
                              : isLightMode
                              ? 'bg-slate-50 border-slate-200 opacity-60 hover:opacity-100'
                              : 'bg-slate-950/40 border-slate-800 opacity-60 hover:opacity-100'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 border ${
                              isSelected
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'border-slate-600'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: cat.color }}
                              />
                              <span className="font-semibold text-xs truncate">
                                {isEn ? cat.labelEn : cat.labelFa}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                              {isEn ? cat.descEn : cat.descFa}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Terminal Commands & Advanced Filters */}
                  <div className="pt-4 border-t border-slate-800/40 grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Include Switch / Network Commands */}
                    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950/40">
                      <div>
                        <div className="flex items-center gap-1.5 font-semibold text-xs">
                          <Terminal className="w-4 h-4 text-rose-400" />
                          <span>{isEn ? 'Switch CLI Commands' : 'دستورات کنسول سوئیچ‌ها'}</span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {isEn ? 'Include Cisco & MikroTik device commands' : 'شامل دستورات کنسول سیسکو و میکروتیک'}
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={config.includeCommands}
                        onChange={(e) => setConfig({ ...config, includeCommands: e.target.checked })}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 cursor-pointer"
                      />
                    </div>

                    {/* Minimum Severity */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        {isEn ? 'Minimum Severity Filter' : 'حداقل سطح شدت رویداد'}
                      </label>
                      <select
                        value={config.minSeverity}
                        onChange={(e) => setConfig({ ...config, minSeverity: e.target.value as any })}
                        className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-800'
                            : 'bg-slate-950 border-slate-800 text-slate-100'
                        }`}
                      >
                        <option value="all">{isEn ? 'All Severities (Info, Notice, Warning, Critical)' : 'تمام سطوح (عادی، اطلاع، هشدار، بحرانی)'}</option>
                        <option value="notice">{isEn ? 'Notice and Above (Exclude Info)' : 'اطلاع به بالا (حذف لاگ‌های عادی)'}</option>
                        <option value="warning">{isEn ? 'Warning & Critical Only' : 'فقط هشدار و بحرانی'}</option>
                        <option value="critical">{isEn ? 'Critical Security Events Only' : 'فقط رویدادهای بحرانی و امنیتی'}</option>
                      </select>
                    </div>

                    {/* Status Filter */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        {isEn ? 'Execution Status Filter' : 'فیلتر وضعیت اجرا'}
                      </label>
                      <select
                        value={config.statusFilter}
                        onChange={(e) => setConfig({ ...config, statusFilter: e.target.value as any })}
                        className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-800'
                            : 'bg-slate-950 border-slate-800 text-slate-100'
                        }`}
                      >
                        <option value="all">{isEn ? 'All Statuses (Success, Failed, Denied)' : 'تمام وضعیت‌ها (موفق، ناموفق، رد شده)'}</option>
                        <option value="failed_only">{isEn ? 'Failures & Denials Only' : 'فقط خطاها و عملیات ناموفق'}</option>
                        <option value="success_and_failed">{isEn ? 'Success & Failed' : 'عملیات موفق و ناموفق'}</option>
                      </select>
                    </div>
                  </div>

                  {/* CSV Attachment Option */}
                  <div className="mt-4 pt-3 border-t border-slate-800/40 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-semibold">
                        {isEn ? 'Attach Detailed CSV Spreadsheet File to Email' : 'پیوست فایل اکسل/CSV تفصیلی در ایمیل'}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {isEn ? '(Useful for cold storage and spreadsheet analysis)' : '(مناسب برای آرشیو و بررسی آفلاین)'}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.attachCsv}
                      onChange={(e) => setConfig({ ...config, attachCsv: e.target.checked })}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* SUB-TAB 3: SERVER FLEET & REMOTE SESSIONS AUDIT (PHASE 3 ENHANCEMENT) */}
              {configSubTab === 'server_fleet' && (
                <div
                  className={`p-5 rounded-xl border space-y-6 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  {/* Master Fleet Audit Toggle */}
                  <div className="flex items-center justify-between pb-4 border-b border-slate-800/40">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                        <Server className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base flex items-center gap-2">
                          <span>{isEn ? 'Include Server Fleet & Remote Sessions Audit' : 'شامل لاگ‌های ناوگان سرورها و نشست‌های ریموت'}</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
                            {isEn ? 'Linux & Windows' : 'لینوکس و ویندوز'}
                          </span>
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {isEn
                            ? 'Capture real-time SSH commands, RDP/VNC sessions, 3-dots actions, web/db operations, and automated scripts'
                            : 'ثبت جامع دستورات ترمینال لینوکس، نشست‌های ریموت دسکتاپ، تغییرات وب/دیتابیس و اقدامات منوی ۳ نقطه سرورها'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.includeServerCommands ?? true}
                          onChange={(e) => setConfig({ ...config, includeServerCommands: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                        <span className="ml-3 text-sm font-semibold select-none">
                          {config.includeServerCommands ? (isEn ? 'Included' : 'گنجانده شود') : (isEn ? 'Excluded' : 'حذف از ایمیل')}
                        </span>
                      </label>

                      <FieldInfoTooltip
                        title={isEn ? 'Server Fleet Audit Inclusions' : 'گنجاندن لاگ‌های ناوگان سرورها'}
                        whatIsIt={isEn ? 'Incorporates Linux/Windows server command execution logs, RDP/VNC sessions and 3-dots actions into reports.' : 'رویدادهای دستورات سرورهای لینوکسی و نشست‌های ریموت ویندوز را به ایمیل گزارش ممیزی اضافه می‌کند.'}
                        whyNeeded={isEn ? 'Provides complete end-to-end auditability across physical servers, cloud VMs, and network switches.' : 'دید کامل و یکپارچه‌ای از فعالیت‌های مهندسی شبکه و ادمین‌های سرور در یک گزارش واحد ایجاد می‌کند.'}
                        example={isEn ? 'SSH commands + RDP sessions + Service restarts' : 'دستورات SSH + نشست‌های RDP + ریستارت سرویس‌ها'}
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                  </div>

                  {config.includeServerCommands ? (
                    <>
                      {/* Section 1: Server Communication Channels */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-400" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                              {isEn ? '1. Monitored Server Channels & Access Protocols' : '۱. کانال‌های ارتباطی و پروتکل‌های تحت نظارت سرور'}
                            </h4>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleSelectAllChannels}
                              className="text-xs font-semibold text-teal-400 hover:text-teal-300 cursor-pointer"
                            >
                              {isEn ? 'Select All Channels' : 'انتخاب همه کانال‌ها'}
                            </button>
                            <FieldInfoTooltip
                              title={isEn ? 'Server Channels' : 'کانال‌های ارتباطی سرور'}
                              whatIsIt={isEn ? 'The pathway used by administrators to manage servers (SSH, RDP, VNC, 3-Dots actions).' : 'مجرای دسترسی مدیران به سرور شامل ترمینال SSH، ریموت دسکتاپ گرافیکی، منوی سه‌نقطه و API.'}
                              whyNeeded={isEn ? 'Allows focusing reports on graphical remote access vs raw CLI terminal commands.' : 'امکان تفکیک گزارش بین دسترسی‌های گرافیکی، خط‌فرمان مستقیم یا اقدامات سریع را فراهم می‌سازد.'}
                              example={isEn ? 'SSH Interactive Terminal + Windows RDP' : 'ترمینال تعاملی SSH + ریموت دسکتاپ ویندوز'}
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {ALL_SERVER_CHANNELS.map((ch) => {
                            const isSelected = (config.selectedServerChannels || []).includes(ch.id);
                            return (
                              <div
                                key={ch.id}
                                onClick={() => handleToggleServerChannel(ch.id)}
                                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                                  isSelected
                                    ? isLightMode
                                      ? 'bg-teal-50/80 border-teal-300 text-slate-900 shadow-sm'
                                      : 'bg-teal-950/20 border-teal-500/40 text-slate-100 shadow-sm'
                                    : isLightMode
                                    ? 'bg-slate-50 border-slate-200 opacity-60 hover:opacity-100'
                                    : 'bg-slate-950/40 border-slate-800 opacity-60 hover:opacity-100'
                                }`}
                              >
                                <div
                                  className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 border ${
                                    isSelected
                                      ? 'bg-teal-600 border-teal-600 text-white'
                                      : 'border-slate-600'
                                  }`}
                                >
                                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    {renderChannelIcon(ch.iconType)}
                                    <span className="font-bold text-xs truncate">
                                      {isEn ? ch.labelEn : ch.labelFa}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                                    {isEn ? ch.descEn : ch.descFa}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Section 2: Target Server Fleet Scope */}
                      <div className="pt-4 border-t border-slate-800/40">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Server className="w-4 h-4 text-cyan-400" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                              {isEn ? '2. Target Server Fleet Scope' : '۲. دامنه سرورهای تحت ممیزی'}
                            </h4>
                          </div>

                          <FieldInfoTooltip
                            title={isEn ? 'Target Server Scope' : 'محدوده سرورهای هدف'}
                            whatIsIt={isEn ? 'Choose between auditing the entire server fleet or focusing on specific mission-critical servers.' : 'امکان تعیین ممیزی کلیه سرورهای سازمان یا تمرکز اختصاصی بر سرورهای حساس و کلیدی.'}
                            whyNeeded={isEn ? 'Enables creating dedicated audit reports for sensitive production servers (e.g. database/finance).' : 'به شما امکان ساخت گزارش‌های مستقل برای سرورهای حساس مانند دیتابیس یا سیستم مالی را می‌دهد.'}
                            example={isEn ? 'All Registered Servers or Specific DB Nodes' : 'تمامی سرورها یا فقط نودهای دیتابیس'}
                            isEn={isEn}
                            isLightMode={isLightMode}
                          />
                        </div>

                        {/* Mode Selector Tabs */}
                        <div className="flex items-center gap-3 mb-3">
                          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                            <input
                              type="radio"
                              name="serverTargetMode"
                              value="all"
                              checked={serverTargetMode === 'all'}
                              onChange={() => {
                                setServerTargetMode('all');
                                setConfig({ ...config, selectedServerIds: [] });
                              }}
                              className="text-teal-600 focus:ring-teal-500 cursor-pointer"
                            />
                            <span>{isEn ? 'All Registered Servers in Fleet (Entire Infrastructure)' : 'تمامی سرورهای ثبت‌شده ناوگان (پوشش کامل زیرساخت)'}</span>
                            <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 font-mono">
                              {fleetServers.length} {isEn ? 'servers' : 'سرور'}
                            </span>
                          </label>

                          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                            <input
                              type="radio"
                              name="serverTargetMode"
                              value="specific"
                              checked={serverTargetMode === 'specific'}
                              onChange={() => setServerTargetMode('specific')}
                              className="text-teal-600 focus:ring-teal-500 cursor-pointer"
                            />
                            <span>{isEn ? 'Specific Target Servers Only' : 'فقط سرورهای منتخب'}</span>
                            {serverTargetMode === 'specific' && (
                              <span className="px-2 py-0.5 rounded text-[11px] bg-teal-500/20 text-teal-300 font-mono">
                                {config.selectedServerIds?.length || 0} {isEn ? 'selected' : 'انتخاب‌شده'}
                              </span>
                            )}
                          </label>
                        </div>

                        {/* Specific Servers Selection Box */}
                        {serverTargetMode === 'specific' && (
                          <div className={`p-3 rounded-xl border space-y-3 ${
                            isLightMode ? 'bg-slate-100/70 border-slate-300' : 'bg-slate-950/70 border-slate-800'
                          }`}>
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                              {/* Search */}
                              <div className="relative w-full sm:w-72">
                                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                                <input
                                  type="text"
                                  value={serverSearchTerm}
                                  onChange={(e) => setServerSearchTerm(e.target.value)}
                                  placeholder={isEn ? 'Filter servers by name, IP, OS...' : 'جستجو بر اساس نام، IP یا سیستم‌عامل...'}
                                  className={`w-full pl-8 pr-3 py-1.5 rounded-lg text-xs border focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                                    isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
                                  }`}
                                />
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-auto">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const allIds = filteredServersList.map((s) => s.id);
                                    setConfig({ ...config, selectedServerIds: Array.from(new Set([...(config.selectedServerIds || []), ...allIds])) });
                                  }}
                                  className="text-xs font-semibold text-teal-400 hover:text-teal-300 cursor-pointer"
                                >
                                  {isEn ? 'Select All Filtered' : 'انتخاب همه فیلترشده‌ها'}
                                </button>
                                <span className="text-slate-600">|</span>
                                <button
                                  type="button"
                                  onClick={() => setConfig({ ...config, selectedServerIds: [] })}
                                  className="text-xs font-semibold text-rose-400 hover:text-rose-300 cursor-pointer"
                                >
                                  {isEn ? 'Clear Selection' : 'پاک کردن انتخاب'}
                                </button>
                              </div>
                            </div>

                            {/* Servers Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                              {filteredServersList.length > 0 ? (
                                filteredServersList.map((srv) => {
                                  const isSelected = (config.selectedServerIds || []).includes(srv.id);
                                  const isWindows = String(srv.os_type || '').toLowerCase().includes('win');
                                  return (
                                    <div
                                      key={srv.id}
                                      onClick={() => handleToggleServerId(srv.id)}
                                      className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between gap-2 select-none ${
                                        isSelected
                                          ? isLightMode
                                            ? 'bg-teal-50 border-teal-400 text-slate-900'
                                            : 'bg-teal-950/30 border-teal-500/50 text-slate-100'
                                          : isLightMode
                                          ? 'bg-white border-slate-200 opacity-70 hover:opacity-100'
                                          : 'bg-slate-900/60 border-slate-800 opacity-70 hover:opacity-100'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <div
                                          className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                                            isSelected ? 'bg-teal-600 border-teal-600 text-white' : 'border-slate-600'
                                          }`}
                                        >
                                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                        </div>
                                        <div className="truncate">
                                          <div className="font-bold truncate">{srv.name || srv.hostname || srv.id}</div>
                                          <div className="text-[10px] text-slate-400 font-mono truncate">
                                            {srv.ip_address || srv.host || 'N/A'}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="shrink-0 flex items-center gap-1">
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                                          isWindows
                                            ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                        }`}>
                                          {isWindows ? 'WIN' : 'LINUX'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="col-span-full p-4 text-center text-xs text-slate-500">
                                  {isEn ? 'No servers match your search filter.' : 'هیچ سروری با عبارت جستجو مطابقت ندارد.'}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Section 3: Server Modules & Risk Filter */}
                      <div className="pt-4 border-t border-slate-800/40 grid grid-cols-1 md:grid-cols-3 gap-5">
                        {/* Modules Multi-Selection */}
                        <div className="md:col-span-2">
                          <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              {isEn ? '3. Management Modules Scope' : '۳. ماژول‌های مدیریتی تحت پوشش'}
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handleSelectAllModules}
                                className="text-xs font-semibold text-teal-400 hover:text-teal-300 cursor-pointer"
                              >
                                {isEn ? 'Select All' : 'انتخاب همه'}
                              </button>
                              <FieldInfoTooltip
                                title={isEn ? 'Management Modules' : 'ماژول‌های مدیریتی سرور'}
                                whatIsIt={isEn ? 'Subsystems affected by server commands (Firewall, Services, Crontab, Database, Files).' : 'بخش‌های اجرایی سرور که تحت تاثیر دستورات قرار می‌گیرند (فایروال، دیتابیس، کرون، فایل‌ها).'}
                                whyNeeded={isEn ? 'Filters reports strictly to database/firewall changes or full operations.' : 'امکان تمرکز گزارش صرفاً بر تغییرات فایروال یا دیتابیس را فراهم می‌سازد.'}
                                example={isEn ? 'Database + Firewall + System Services' : 'دیتابیس + فایروال + سرویس‌های سیستمی'}
                                isEn={isEn}
                                isLightMode={isLightMode}
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-slate-800 bg-slate-950/40">
                            {ALL_SERVER_MODULES.map((mod) => {
                              const isSelected = (config.selectedServerModules || []).includes(mod.id);
                              return (
                                <button
                                  key={mod.id}
                                  type="button"
                                  onClick={() => handleToggleServerModule(mod.id)}
                                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                                    isSelected
                                      ? 'bg-teal-600/25 text-teal-300 border border-teal-500/40 shadow-sm'
                                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: mod.color }}
                                  />
                                  <span>{isEn ? mod.labelEn : mod.labelFa}</span>
                                  {isSelected && <Check className="w-3 h-3 text-teal-400 stroke-[3]" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Server Risk Level Filter */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              {isEn ? '4. Server Risk Filter' : '۴. سطح ریسک دستورات سرور'}
                            </label>
                            <FieldInfoTooltip
                              title={isEn ? 'Server Risk Sensitivity' : 'حساسیت ریسک سرور'}
                              whatIsIt={isEn ? 'Threshold for command risk levels (High, Critical, Low).' : 'آستانه حساسیت امنیتی برای ثبت دستورات در ایمیل بر اساس میزان ریسک تخریبی یا تغییر سیستمی.'}
                              whyNeeded={isEn ? 'Suppresses routine read-only commands (e.g. ls, uptime) to highlight sensitive modifications.' : 'دستورات روزمره خواندنی را فیلتر کرده و تغییرات ساختاری را برجسته می‌کند.'}
                              example={isEn ? 'High & Critical Risk Only' : 'فقط ریسک بالا و بحرانی'}
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>

                          <select
                            value={config.serverRiskFilter || 'all'}
                            onChange={(e) => setConfig({ ...config, serverRiskFilter: e.target.value as any })}
                            className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                              isLightMode
                                ? 'bg-slate-50 border-slate-300 text-slate-800'
                                : 'bg-slate-950 border-slate-800 text-slate-100'
                            }`}
                          >
                            <option value="all">{isEn ? 'All Commands & Sessions (Low, Med, High, Critical)' : 'همه دستورات و نشست‌ها (عادی، متوسط، بالا، بحرانی)'}</option>
                            <option value="high_critical">{isEn ? 'High & Critical Risk Only (Recommended)' : 'فقط ریسک‌های بالا و بحرانی (پیشنهادی)'}</option>
                            <option value="critical_only">{isEn ? 'Critical Security Operations Only' : 'منحصراً اقدامات بحرانی امنیتی'}</option>
                          </select>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                      <Server className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                      <p className="text-sm font-semibold">{isEn ? 'Server Fleet & Remote Audit is Excluded' : 'لاگ‌های ناوگان سرورها در این گزارش گنجانده نمی‌شوند'}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {isEn ? 'Enable the master switch above to include SSH terminal logs, RDP sessions, and 3-dots actions in the email.' : 'کلید اصلی بالا را فعال کنید تا دستورات سرور، نشست‌های ریموت دسکتاپ و اقدامات منوی ۳ نقطه در گزارش ایمیل قرار گیرند.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ================= LIVE HTML PREVIEW TAB (PHASE 3 ENHANCEMENT) ================= */
            <div className="space-y-4">
              {/* Preview Toolbar */}
              <div
                className={`p-3 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 p-1 rounded-lg border border-slate-800 bg-slate-950/60 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setPreviewDeviceMode('desktop')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded cursor-pointer transition-colors ${
                        previewDeviceMode === 'desktop'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Desktop' : 'دسکتاپ'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDeviceMode('mobile')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded cursor-pointer transition-colors ${
                        previewDeviceMode === 'mobile'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Mobile' : 'موبایل'}</span>
                    </button>
                  </div>

                  {previewData?.summary && (
                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2.5 sm:border-l sm:border-slate-700 sm:pl-3">
                      <span>
                        {isEn ? 'Total Events:' : 'کل رویدادها:'}{' '}
                        <strong className="text-white font-mono">{previewData.summary.totalEvents}</strong>
                      </span>
                      {previewData.summary.serverCommandEvents !== undefined && (
                        <span className="text-teal-400">
                          {isEn ? 'Server Fleet:' : 'ناوگان سرور:'}{' '}
                          <strong className="font-mono">{previewData.summary.serverCommandEvents}</strong>
                        </span>
                      )}
                      <span>
                        {isEn ? 'Critical:' : 'بحرانی:'}{' '}
                        <strong className="text-rose-400 font-mono">{previewData.summary.criticalCount}</strong>
                      </span>
                      <span>
                        {isEn ? 'Warnings:' : 'هشدار:'}{' '}
                        <strong className="text-amber-400 font-mono">{previewData.summary.warningCount}</strong>
                      </span>
                      <span>
                        {isEn ? 'Failed:' : 'ناموفق:'}{' '}
                        <strong className="text-red-400 font-mono">{previewData.summary.failedCount}</strong>
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGeneratePreview}
                    disabled={isPreviewLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700 hover:bg-slate-800 cursor-pointer transition-colors shadow-sm"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPreviewLoading ? 'animate-spin text-cyan-400' : ''}`} />
                    <span>{isEn ? 'Refresh Live Preview' : 'تازه‌سازی پیش‌نمایش'}</span>
                  </button>
                </div>
              </div>

              {/* Subject Bar */}
              {previewData?.subject && (
                <div
                  className={`px-4 py-2.5 rounded-lg border text-xs font-mono flex items-center justify-between gap-2 ${
                    isLightMode ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-slate-500 shrink-0">{isEn ? 'Subject:' : 'موضوع ایمیل:'}</span>
                    <span className="text-indigo-400 font-bold truncate">{previewData.subject}</span>
                  </div>
                  {config.attachCsv && (
                    <span className="shrink-0 px-2 py-0.5 rounded text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <FileSpreadsheet className="w-3 h-3" />
                      <span>{isEn ? '+ CSV Attached' : '+ فایل CSV ضمیمه'}</span>
                    </span>
                  )}
                </div>
              )}

              {/* Rendered HTML Container */}
              <div
                className={`rounded-xl border overflow-hidden transition-all duration-200 mx-auto shadow-2xl ${
                  previewDeviceMode === 'mobile' ? 'max-w-[420px] border-indigo-500/30 ring-4 ring-black/40' : 'w-full'
                } ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'}`}
              >
                {isPreviewLoading ? (
                  <div className="p-20 flex flex-col items-center justify-center text-slate-400">
                    <RefreshCw className="w-9 h-9 animate-spin text-teal-400 mb-3" />
                    <span className="font-semibold">{isEn ? 'Aggregating server logs & compiling executive template...' : 'در حال تجمیع آمار سرورها و رندر قالب گزارش ایمیل...'}</span>
                  </div>
                ) : previewData?.html ? (
                  <iframe
                    title="Audit Report Preview"
                    srcDoc={previewData.html}
                    className="w-full h-[540px] border-0"
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <div className="p-20 text-center text-slate-500">
                    <Eye className="w-10 h-10 mx-auto mb-2 opacity-50 text-indigo-400" />
                    <span className="font-semibold">{isEn ? 'Click "Refresh Live Preview" to render email mockup' : 'جهت مشاهده، دکمه تازه‌سازی پیش‌نمایش را بزنید'}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-t shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span>{isEn ? 'Last Dispatched:' : 'آخرین ارسال:'}</span>
            <span className="font-mono text-slate-400">
              {config.lastSentAt
                ? new Date(config.lastSentAt).toLocaleString()
                : isEn ? 'Never' : 'هرگز'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Preview Button */}
            {activeTab === 'config' && (
              <button
                type="button"
                onClick={handleGeneratePreview}
                disabled={isPreviewLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer transition-colors ${
                  isLightMode
                    ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                    : 'border-slate-700 hover:bg-slate-800 text-slate-200'
                }`}
              >
                <Eye className="w-4 h-4 text-cyan-400" />
                <span>{isEn ? 'Preview Live Email' : 'پیش‌نمایش زنده قالب'}</span>
              </button>
            )}

            {/* Save Settings */}
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={isSaving}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer transition-colors ${
                isLightMode
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                  : 'border-indigo-600/50 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/60'
              }`}
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{isEn ? 'Save Schedule' : 'ذخیره تنظیمات'}</span>
            </button>

            {/* Send Report Now (Immediate Action) */}
            <button
              type="button"
              onClick={handleSendNow}
              disabled={isSendingNow || !smtpConfigured}
              title={
                !smtpConfigured
                  ? isEn ? 'SMTP credentials not configured in Email Settings' : 'مشخصات SMTP در تنظیمات ایمیل ست نشده است'
                  : undefined
              }
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white shadow-lg cursor-pointer transition-all ${
                !smtpConfigured
                  ? 'bg-slate-700 opacity-60 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:via-teal-500 hover:to-cyan-500 shadow-emerald-500/20 active:scale-95'
              }`}
            >
              {isSendingNow ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isEn ? 'Dispatching...' : 'در حال ارسال...'}</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{isEn ? 'Send Report Now' : 'ارسال آنی گزارش (Send Now)'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
};
