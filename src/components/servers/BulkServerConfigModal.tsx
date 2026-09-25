import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Sliders,
  Play,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Terminal,
  Shield,
  Key,
  RefreshCw,
  Trash2,
  Cpu,
  Users,
  Network,
  Activity,
  Lock,
  Copy,
  Check,
  Search,
  Download,
  Layers,
  HardDrive,
  Eye,
  EyeOff,
  Ban,
  ChevronRight,
  Database,
  HelpCircle,
  AlertCircle,
  FolderArchive,
  ShieldCheck,
  Wand2,
  FileText
} from 'lucide-react';
import { BulkServerReportsTab } from './BulkServerReportsTab';
import {
  RemoteServer,
  BulkServerTemplate,
  BulkServerPreviewItem,
  BulkServerJobStatus,
  BulkServerExecutionResult
} from '../../types';
import {
  fetchBulkServerTemplates,
  generateBulkServerPreview,
  startBulkServerJob,
  fetchBulkServerJobStatus,
  cancelBulkServerJob
} from '../../services/bulkServerConfigService';
import { InfoTooltipPopover } from '../bulk-config/InfoTooltipPopover';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import {
  getServerTemplateGuide,
  getServerParameterGuide
} from './serverTemplateInfoGuide';

export interface BulkServerConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  isEn: boolean;
  isLightMode: boolean;
  initialSelectedServers?: RemoteServer[];
  allServers: RemoteServer[];
  onServersUpdated?: () => void;
}

type ActiveStep = 'configure' | 'preview' | 'execution';

export const BulkServerConfigModal: React.FC<BulkServerConfigModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  isEn,
  isLightMode,
  initialSelectedServers = [],
  allServers = [],
  onServersUpdated
}) => {
  // Modal State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeStep, setActiveStep] = useState<ActiveStep>('configure');

  // Templates
  const [templates, setTemplates] = useState<BulkServerTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('linux_security_updates');
  const [templateSearch, setTemplateSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showTemplateGuideDetails, setShowTemplateGuideDetails] = useState(false);

  // Parameters
  const [parameters, setParameters] = useState<Record<string, any>>({});

  // Target Linux Servers Selection
  const [selectedServerIds, setSelectedServerIds] = useState<Set<string>>(new Set());
  const [serverSearch, setServerSearch] = useState('');
  const [distroFilter, setDistroFilter] = useState<string>('all');

  // Preview State
  const [previewItems, setPreviewItems] = useState<BulkServerPreviewItem[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Execution & Safety State
  const [dangerConfirmation, setDangerConfirmation] = useState('');
  const [timeoutSec, setTimeoutSec] = useState<number>(60);
  const [delayMs, setDelayMs] = useState<number>(500);
  const [runWithSudo, setRunWithSudo] = useState<boolean>(true);
  const [ephemeralPassword, setEphemeralPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Execution Job State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<BulkServerJobStatus | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [activeTabServerId, setActiveTabServerId] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'warning' | 'info' | 'success'>('all');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  const [mainTopTab, setMainTopTab] = useState<'config' | 'reports'>('config');

  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // Filter only Linux servers
  const linuxServers = useMemo(() => {
    return allServers.filter((s) => s.os_type === 'linux');
  }, [allServers]);

  // Distinct distributions for filter pills
  const availableDistros = useMemo(() => {
    const set = new Set<string>();
    linuxServers.forEach((s) => {
      if (s.os_distro) set.add(s.os_distro.trim());
    });
    return Array.from(set);
  }, [linuxServers]);

  // Load templates on modal open
  useEffect(() => {
    if (isOpen) {
      setLoadingTemplates(true);
      fetchBulkServerTemplates()
        .then((tpls) => {
          setTemplates(tpls);
          if (tpls.length > 0 && !selectedTemplateId) {
            setSelectedTemplateId(tpls[0].id);
          }
        })
        .catch((err) => {
          console.error('Failed to load templates:', err);
        })
        .finally(() => {
          setLoadingTemplates(false);
        });
    }
  }, [isOpen]);

  // Initialize selected servers from props
  useEffect(() => {
    if (isOpen && initialSelectedServers.length > 0) {
      const validLinuxIds = initialSelectedServers
        .filter((s) => s.os_type === 'linux')
        .map((s) => s.id);
      setSelectedServerIds(new Set(validLinuxIds));
    } else if (isOpen && selectedServerIds.size === 0 && linuxServers.length > 0) {
      // Default select all linux servers if none pre-selected
      setSelectedServerIds(new Set(linuxServers.map((s) => s.id)));
    }
  }, [isOpen, initialSelectedServers, linuxServers]);

  // Selected template object
  const activeTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || templates[0];
  }, [templates, selectedTemplateId]);

  // Initialize default parameter values when template changes
  useEffect(() => {
    if (activeTemplate) {
      const initialVals: Record<string, any> = {};
      activeTemplate.parameters.forEach((param) => {
        if (param.default !== undefined) {
          initialVals[param.name] = param.default;
        } else if (param.type === 'boolean') {
          initialVals[param.name] = false;
        } else if (param.type === 'number') {
          initialVals[param.name] = 0;
        } else {
          initialVals[param.name] = '';
        }
      });
      setParameters(initialVals);
      setTimeoutSec(activeTemplate.default_timeout_sec || 60);
      setDangerConfirmation('');
      setShowTemplateGuideDetails(false);
    }
  }, [activeTemplate]);

  // Categories list
  const categories = useMemo(() => {
    return [
      { id: 'all', labelFa: 'همه الگوها', labelEn: 'All Templates' },
      { id: 'users', labelFa: 'کاربران و دسترسی', labelEn: 'Users & Groups' },
      { id: 'cron', labelFa: 'کرون‌جاب و زمان‌بندی', labelEn: 'Cron Jobs' },
      { id: 'storage', labelFa: 'مانت و استوریج', labelEn: 'Mount & Storage' },
      { id: 'firewall', labelFa: 'فایروال و پورت‌ها', labelEn: 'Firewall & Ports' },
      { id: 'docker', labelFa: 'کانتینرهای داکر', labelEn: 'Docker Fleet' },
      { id: 'security', labelFa: 'امنیت و SSH', labelEn: 'Security & SSH' },
      { id: 'network', labelFa: 'شبکه و DNS', labelEn: 'Network & DNS' },
      { id: 'maintenance', labelFa: 'نگهداری و آپدیت', labelEn: 'Maintenance' },
      { id: 'services', labelFa: 'سرویس‌ها و کرنل', labelEn: 'Services & Kernel' },
      { id: 'custom', labelFa: 'اسکریپت سفارشی', labelEn: 'Custom Bash' }
    ];
  }, []);

  // Filtered templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      const matchesCategory = categoryFilter === 'all' || tpl.category === categoryFilter;
      const searchLower = templateSearch.toLowerCase();
      const matchesSearch =
        !searchLower ||
        tpl.title.toLowerCase().includes(searchLower) ||
        tpl.title_en.toLowerCase().includes(searchLower) ||
        tpl.description.toLowerCase().includes(searchLower) ||
        tpl.description_en.toLowerCase().includes(searchLower);
      return matchesCategory && matchesSearch;
    });
  }, [templates, categoryFilter, templateSearch]);

  // Filtered servers in Step 1
  const filteredServers = useMemo(() => {
    return linuxServers.filter((srv) => {
      const matchesDistro = distroFilter === 'all' || srv.os_distro === distroFilter;
      const searchLower = serverSearch.toLowerCase();
      const matchesSearch =
        !searchLower ||
        srv.name.toLowerCase().includes(searchLower) ||
        srv.ip.includes(searchLower) ||
        (srv.hostname && srv.hostname.toLowerCase().includes(searchLower)) ||
        (srv.os_distro && srv.os_distro.toLowerCase().includes(searchLower));
      return matchesDistro && matchesSearch;
    });
  }, [linuxServers, distroFilter, serverSearch]);

  // Form validity
  const isFormValid = useMemo(() => {
    if (!activeTemplate) return false;
    if (selectedServerIds.size === 0) return false;

    // Check required parameters
    for (const param of activeTemplate.parameters) {
      if (param.required) {
        const val = parameters[param.name];
        if (val === undefined || val === null || val === '') return false;
      }
    }

    // Check danger confirmation
    if (activeTemplate.is_dangerous && activeTemplate.confirmation_keyword) {
      if (dangerConfirmation.trim().toUpperCase() !== activeTemplate.confirmation_keyword.toUpperCase()) {
        return false;
      }
    }

    return true;
  }, [activeTemplate, parameters, selectedServerIds, dangerConfirmation]);

  // Server selection helpers
  const handleToggleServer = (id: string) => {
    setSelectedServerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedServerIds((prev) => {
      const next = new Set(prev);
      filteredServers.forEach((s) => next.add(s.id));
      return next;
    });
  };

  const handleClearServerSelection = () => {
    setSelectedServerIds(new Set());
  };

  // Generate Preview (Step 2)
  const handleGeneratePreview = async () => {
    if (!activeTemplate || selectedServerIds.size === 0) return;
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const items = await generateBulkServerPreview(
        activeTemplate.id,
        parameters,
        Array.from(selectedServerIds)
      );
      setPreviewItems(items);
      setActiveStep('preview');
    } catch (err: any) {
      setPreviewError(err.message || (isEn ? 'Failed to generate preview' : 'خطا در تولید پیش‌نمایش دستورات'));
    } finally {
      setLoadingPreview(false);
    }
  };

  // Start Fleet Execution (Step 3)
  const handleStartExecution = async () => {
    if (!activeTemplate || !isFormValid) return;

    setIsExecuting(true);
    setActiveStep('execution');

    try {
      const { jobId } = await startBulkServerJob({
        templateId: activeTemplate.id,
        parameters,
        serverIds: Array.from(selectedServerIds),
        timeoutSec,
        delayMs,
        dangerConfirmation,
        ephemeralPassword: ephemeralPassword || undefined
      });

      setActiveJobId(jobId);
      if (selectedServerIds.size > 0) {
        setActiveTabServerId(Array.from(selectedServerIds)[0]);
      }

      // Polling job status
      const interval = setInterval(async () => {
        try {
          const status = await fetchBulkServerJobStatus(jobId);
          setJobStatus(status);

          if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
            setIsExecuting(false);
            clearInterval(interval);
            if (onServersUpdated) onServersUpdated();
          }
        } catch (pollErr) {
          console.error('Job polling error:', pollErr);
        }
      }, 1000);

      setPollInterval(interval);
    } catch (err: any) {
      setIsExecuting(false);
      alert(err.message || (isEn ? 'Failed to start execution' : 'خطا در شروع عملیات اتوماسیون'));
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [pollInterval]);

  // Cancel Job
  const handleCancelJob = async () => {
    if (!activeJobId) return;
    try {
      await cancelBulkServerJob(activeJobId);
      if (pollInterval) clearInterval(pollInterval);
      const latest = await fetchBulkServerJobStatus(activeJobId);
      setJobStatus(latest);
      setIsExecuting(false);
    } catch (err) {
      console.error('Failed to cancel job:', err);
    }
  };

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Export summary
  const handleExportSummary = () => {
    if (!jobStatus) return;
    const summary = JSON.stringify(jobStatus, null, 2);
    const blob = new Blob([summary], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-server-config-${jobStatus.jobId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render Template Category Icon
  const renderTemplateIcon = (iconName: string, className = 'w-4 h-4') => {
    switch (iconName) {
      case 'RefreshCw':
        return <RefreshCw className={className} />;
      case 'Trash2':
        return <Trash2 className={className} />;
      case 'Key':
        return <Key className={className} />;
      case 'Shield':
        return <Shield className={className} />;
      case 'Lock':
        return <Lock className={className} />;
      case 'Clock':
        return <Clock className={className} />;
      case 'Network':
        return <Network className={className} />;
      case 'Cpu':
        return <Cpu className={className} />;
      case 'Activity':
        return <Activity className={className} />;
      case 'Users':
        return <Users className={className} />;
      case 'HardDrive':
        return <HardDrive className={className} />;
      case 'FolderArchive':
      case 'Archive':
        return <FolderArchive className={className} />;
      case 'Layers':
        return <Layers className={className} />;
      case 'Terminal':
      default:
        return <Terminal className={className} />;
    }
  };

  // Distro badge helper
  const getDistroBadge = (distro?: string) => {
    const d = (distro || '').toLowerCase();
    if (d.includes('ubuntu') || d.includes('debian')) {
      return {
        name: distro || 'Debian/Ubuntu',
        className: 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
      };
    }
    if (d.includes('rhel') || d.includes('rocky') || d.includes('alma') || d.includes('centos') || d.includes('fedora')) {
      return {
        name: distro || 'RHEL/Rocky',
        className: 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
      };
    }
    if (d.includes('alpine')) {
      return {
        name: distro || 'Alpine',
        className: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
      };
    }
    if (d.includes('arch')) {
      return {
        name: distro || 'Arch',
        className: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
      };
    }
    return {
      name: distro || 'Linux',
      className: 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
    };
  };

  // Quick Distro counts
  const distroCounts = useMemo(() => {
    let debianUbuntu = 0;
    let rhelRocky = 0;
    let other = 0;

    linuxServers.forEach((s) => {
      const d = (s.os_distro || '').toLowerCase();
      if (d.includes('ubuntu') || d.includes('debian')) debianUbuntu++;
      else if (d.includes('rhel') || d.includes('rocky') || d.includes('alma') || d.includes('centos')) rhelRocky++;
      else other++;
    });

    return { debianUbuntu, rhelRocky, other };
  }, [linuxServers]);

  if (!isOpen) return null;

  const isRtl = !isEn;

  // Render via createPortal to root document.body with z-[9999]
  // This guarantees it is never obscured by the application navbar
  return createPortal(
    <div
      className={`fixed z-[9999] flex flex-col items-center justify-center transition-all duration-200 ${
        isFullscreen
          ? 'top-0 left-0 right-0 bottom-8 p-0'
          : 'inset-0 p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md pb-10'
      }`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div
        className={`relative w-full ${
          isFullscreen
            ? 'h-full max-h-full rounded-none border-none'
            : 'max-w-6xl max-h-[92vh] rounded-2xl border'
        } flex flex-col shadow-2xl ${
          isLightMode
            ? 'bg-slate-50 border-slate-300 text-slate-900'
            : 'bg-slate-900/95 border-cyan-500/30 text-slate-100'
        } overflow-hidden backdrop-blur-xl transition-all duration-200`}
      >
        {/* ========================================================= */}
        {/* MODAL HEADER (Exact design of BulkDeviceConfigModal)      */}
        {/* ========================================================= */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${
            isLightMode ? 'border-slate-200 bg-slate-100/80' : 'border-white/10 bg-slate-950/60'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-500/40 text-cyan-300 shadow-md">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`font-bold text-base sm:text-lg font-mono tracking-tight ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                  {isEn ? 'Bulk Linux Server Configuration' : 'پیکربندی گروهی ناوگان سرورهای لینوکس'}
                </h3>
                <span className="px-2 py-0.5 text-[11px] font-mono font-semibold rounded-md bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  {isEn ? `${selectedServerIds.size} Servers` : `${selectedServerIds.size} سرور`}
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {isEn ? 'Real SSH Engine' : 'اتصال واقعی SSH'}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Multi-node idempotent configuration with adaptive distro command generation (APT / DNF / Pacman / APK)'
                  : 'پیکربندی همزمان چندین سرور با تولید خودکار دستورات بر اساس توزیع سیستم‌عامل (اوبونتو، ردهت، راکی، آلپاین)'}
              </p>
            </div>
          </div>

          <ModalHeaderControls
            onMinimize={onMinimize}
            onClose={onClose}
            onMaximizeToggle={() => setIsFullscreen((prev) => !prev)}
            isMaximized={isFullscreen}
            isLightMode={isLightMode}
            isEn={isEn}
            minimizeTooltip={isEn ? 'Minimize to bottom dock' : 'مینیمایز به نوار داک'}
            closeTooltip={isEn ? 'Close modal' : 'بستن پنجره'}
          />
        </div>

        {/* ========================================================= */}
        {/* TOP-LEVEL TABS (Configuration vs Reports & Audit Trail)   */}
        {/* ========================================================= */}
        <div
          className={`flex items-center gap-2 px-5 py-2 border-b shrink-0 ${
            isLightMode ? 'bg-slate-200/70 border-slate-300' : 'bg-slate-950/90 border-white/10'
          }`}
        >
          <button
            type="button"
            onClick={() => setMainTopTab('config')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
              mainTopTab === 'config'
                ? 'bg-gradient-to-r from-cyan-600/30 to-teal-600/30 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>{isEn ? 'Bulk Linux Server Configuration' : 'پیکربندی گروهی سرورهای لینوکس'}</span>
          </button>

          <button
            type="button"
            onClick={() => setMainTopTab('reports')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
              mainTopTab === 'reports'
                ? 'bg-gradient-to-r from-cyan-600/30 to-teal-600/30 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span>{isEn ? 'Execution Reports & Audit History' : 'گزارش‌ها و تاریخچه ممیزی اجرا'}</span>
          </button>
        </div>

        {mainTopTab === 'reports' ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            <BulkServerReportsTab
              isLightMode={isLightMode}
              isEn={isEn}
              onSelectTemplateToRerun={(tplId, params) => {
                setSelectedTemplateId(tplId);
                setParameters(params);
                setMainTopTab('config');
                setActiveStep('configure');
              }}
            />
          </div>
        ) : (
          <>
            {/* ========================================================= */}
            {/* MULTI-STEP NAVIGATION BAR (Configure -> Preview -> Exec)   */}
            {/* ========================================================= */}
        <div
          className={`flex items-center justify-between px-6 py-2.5 border-b text-xs font-mono shrink-0 ${
            isLightMode ? 'bg-slate-200/50 border-slate-300' : 'bg-slate-950/40 border-white/5'
          }`}
        >
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => setActiveStep('configure')}
              disabled={activeStep === 'execution' && isExecuting}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeStep === 'configure'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center bg-cyan-500/30 text-cyan-300 text-[10px]">
                1
              </span>
              <span>{isEn ? 'Template & Parameters' : 'قالب دستور و متغیرها'}</span>
            </button>

            <ChevronRight className={`w-3.5 h-3.5 text-slate-600 ${isRtl ? 'rotate-180' : ''}`} />

            <button
              onClick={() => {
                if (previewItems.length > 0) setActiveStep('preview');
                else handleGeneratePreview();
              }}
              disabled={selectedServerIds.size === 0 || (activeStep === 'execution' && isExecuting)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeStep === 'preview'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold shadow-sm'
                  : selectedServerIds.size > 0
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  : 'text-slate-600 cursor-not-allowed opacity-50'
              }`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center bg-white/10 text-[10px]">
                2
              </span>
              <span>{isEn ? 'Preview & Dry Run' : 'پیش‌نمایش و دستورات Shell'}</span>
            </button>

            <ChevronRight className={`w-3.5 h-3.5 text-slate-600 ${isRtl ? 'rotate-180' : ''}`} />

            <button
              onClick={() => {
                if (activeJobId) setActiveStep('execution');
              }}
              disabled={!activeJobId}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeStep === 'execution'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold shadow-sm'
                  : activeJobId
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  : 'text-slate-600 cursor-not-allowed opacity-50'
              }`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center bg-white/10 text-[10px]">
                3
              </span>
              <span>{isEn ? 'Execution & Monitoring' : 'اجرا و مانیتورینگ'}</span>
            </button>
          </div>

          {/* Quick Distro Breakdown Summary */}
          <div className="hidden md:flex items-center gap-3 text-[11px] text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              <span>
                Ubuntu/Debian:{' '}
                <strong className={isLightMode ? 'text-slate-800' : 'text-slate-200'}>
                  {distroCounts.debianUbuntu}
                </strong>
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span>
                RHEL/Rocky:{' '}
                <strong className={isLightMode ? 'text-slate-800' : 'text-slate-200'}>
                  {distroCounts.rhelRocky}
                </strong>
              </span>
            </span>
            {distroCounts.other > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>
                  Other:{' '}
                  <strong className={isLightMode ? 'text-slate-800' : 'text-slate-200'}>
                    {distroCounts.other}
                  </strong>
                </span>
              </span>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* MAIN BODY AREA (SCROLLABLE)                               */}
        {/* ========================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* STEP 1: CONFIGURE (TEMPLATES, PARAMS, SERVERS) */}
          {activeStep === 'configure' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Template Catalog & Categories (5 cols) */}
              <div className="lg:col-span-5 space-y-3">
                {/* Catalog Header & Search */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 text-cyan-400">
                      <Layers className="w-4 h-4" />
                      <span>{isEn ? 'Select Command Template' : 'انتخاب الگوی پیکربندی'}</span>
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {filteredTemplates.length} {isEn ? 'templates' : 'الگو'}
                    </span>
                  </div>

                  <div className="relative">
                    <Search className={`w-3.5 h-3.5 absolute ${isRtl ? 'right-3' : 'left-3'} top-2.5 text-slate-400`} />
                    <input
                      type="text"
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      placeholder={isEn ? 'Search templates (users, cron, mount, firewall, docker)...' : 'جستجوی الگو (کاربران، کرون، مانت، فایروال، داکر)...'}
                      className={`w-full ${isRtl ? 'pr-8 pl-3' : 'pl-8 pr-3'} py-1.5 text-xs rounded-xl border focus:outline-none transition ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900 focus:border-cyan-600'
                          : 'bg-slate-950/80 border-white/10 text-slate-200 focus:border-cyan-500'
                      }`}
                    />
                  </div>

                  {/* Category Filter Tabs */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategoryFilter(cat.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition cursor-pointer ${
                          categoryFilter === cat.id
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                            : isLightMode
                            ? 'bg-slate-200/80 text-slate-600 hover:bg-slate-300'
                            : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 border border-white/5'
                        }`}
                      >
                        {isEn ? cat.labelEn : cat.labelFa}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Template Cards List */}
                <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
                  {loadingTemplates ? (
                    <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                      <span className="text-xs font-mono">{isEn ? 'Loading templates...' : 'در حال بارگذاری الگوها...'}</span>
                    </div>
                  ) : filteredTemplates.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 border border-dashed border-white/10 rounded-xl text-xs">
                      {isEn ? 'No templates matched your query' : 'الگویی با این مشخصات یافت نشد'}
                    </div>
                  ) : (
                    filteredTemplates.map((tpl) => {
                      const isSelected = activeTemplate?.id === tpl.id;
                      const guide = getServerTemplateGuide(tpl.id, isEn, tpl);

                      return (
                        <div
                          key={tpl.id}
                          onClick={() => setSelectedTemplateId(tpl.id)}
                          className={`p-3.5 rounded-xl border transition-all text-xs cursor-pointer ${
                            isSelected
                              ? 'bg-gradient-to-r from-cyan-500/15 to-teal-500/10 border-cyan-500/50 shadow-md shadow-cyan-500/5'
                              : isLightMode
                              ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-800'
                              : 'bg-slate-950/60 hover:bg-white/5 border-white/5 text-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`p-2 rounded-lg ${
                                  isSelected
                                    ? 'bg-cyan-500/20 text-cyan-300'
                                    : 'bg-white/5 text-slate-400'
                                }`}
                              >
                                {renderTemplateIcon(tpl.icon, 'w-4 h-4')}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold font-mono text-[13px] text-white">
                                    {isEn ? tpl.title_en : tpl.title}
                                  </span>
                                  {tpl.is_dangerous && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                      {isEn ? 'CRITICAL' : 'حساس'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                                  {isEn ? tpl.description_en : tpl.description}
                                </p>
                              </div>
                            </div>

                            {/* 3-part educational popover */}
                            <div onClick={(e) => e.stopPropagation()}>
                              <InfoTooltipPopover
                                title={isEn ? tpl.title_en : tpl.title}
                                what={guide.what}
                                why={guide.why}
                                example={guide.example}
                                isEn={isEn}
                                size="sm"
                              />
                            </div>
                          </div>

                          <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-400 font-mono pt-2 border-t border-white/5">
                            <span className="text-cyan-400/80">
                              {tpl.supported_distros?.join(' / ') || 'Multi-Distro'}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {tpl.idempotent && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  {isEn ? 'Idempotent' : 'تکرارپذیر'}
                                </span>
                              )}
                              {tpl.requires_sudo && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  {isEn ? 'Sudo' : 'سودو'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: Parameters, Policies & Server Selection (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                {activeTemplate ? (
                  <>
                    {/* Active Template Header Card */}
                    <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-white font-mono flex items-center gap-2">
                            {renderTemplateIcon(activeTemplate.icon, 'w-4 h-4 text-cyan-400')}
                            <span>{isEn ? activeTemplate.title_en : activeTemplate.title}</span>
                          </h4>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 text-slate-400 border border-white/10">
                            {activeTemplate.id}
                          </span>
                        </div>

                        {/* Guide & Example toggle */}
                        <button
                          type="button"
                          onClick={() => setShowTemplateGuideDetails((prev) => !prev)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition cursor-pointer"
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Guide & Example' : 'توضیحات و مثال'}</span>
                        </button>
                      </div>

                      {/* 3-Part Expanded Educational Card */}
                      {showTemplateGuideDetails && (
                        <div className="p-3.5 rounded-xl bg-gradient-to-br from-cyan-950/40 to-slate-950 border border-cyan-500/30 space-y-2.5 animate-in fade-in text-xs font-mono">
                          {(() => {
                            const guide = getServerTemplateGuide(activeTemplate.id, isEn, activeTemplate);
                            return (
                              <>
                                <div>
                                  <div className="text-[11px] font-bold text-cyan-300 mb-0.5 flex items-center gap-1.5">
                                    <span>💡</span>
                                    <span>{isEn ? 'What is this?' : 'این چیست؟'}</span>
                                  </div>
                                  <p className="text-slate-300 text-[11px] leading-relaxed">{guide.what}</p>
                                </div>
                                <div>
                                  <div className="text-[11px] font-bold text-emerald-300 mb-0.5 flex items-center gap-1.5">
                                    <span>🎯</span>
                                    <span>{isEn ? 'Why is it needed?' : 'چرا لازم است؟'}</span>
                                  </div>
                                  <p className="text-slate-300 text-[11px] leading-relaxed">{guide.why}</p>
                                </div>
                                <div>
                                  <div className="text-[11px] font-bold text-amber-300 mb-0.5 flex items-center gap-1.5">
                                    <span>✅</span>
                                    <span>{isEn ? 'Practical Example / Value:' : 'مثال کاربردی / مقدار نمونه:'}</span>
                                  </div>
                                  <p className="text-slate-300 text-[11px] leading-relaxed bg-black/40 p-2 rounded-lg border border-white/5 font-mono">
                                    {guide.example}
                                  </p>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}

                      {/* Dangerous Warning Banner */}
                      {activeTemplate.is_dangerous && (
                        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">
                              {isEn ? 'Critical Operation Safeguard:' : 'عملیات حساس و بااهمیت:'}
                            </span>{' '}
                            <span>
                              {isEn
                                ? `This action may affect fleet availability. You must confirm by typing "${activeTemplate.confirmation_keyword}" below.`
                                : `این عملیات ممکن است در دسترس‌پذیری سرورها اثر بگذارد. تایید این عملیات نیازمند درج عبارت «${activeTemplate.confirmation_keyword}» است.`}
                            </span>
                          </div>
                        </div>
                      )}

                      <p className="text-xs text-slate-400">
                        {isEn ? activeTemplate.description_en : activeTemplate.description}
                      </p>
                    </div>

                    {/* Parameters Form Card */}
                    {activeTemplate.parameters.length > 0 && (
                      <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10 space-y-3.5">
                        <div className="text-xs font-bold text-slate-300 font-mono flex items-center gap-2">
                          <Terminal className="w-4 h-4 text-cyan-400" />
                          <span>{isEn ? 'Command Parameters' : 'متغیرهای تنظیمی الگو'}</span>
                        </div>

                        <div className="space-y-3">
                          {activeTemplate.parameters.map((param) => {
                            // Filter conditional parameters for directory lifecycle & backup template
                            if (activeTemplate.id === 'linux_directory_lifecycle_backup') {
                              const currentAction = parameters.action || 'backup';
                              const backupParams = [
                                'backup_format',
                                'backup_destination_path',
                                'backup_keep_source_files',
                                'backup_preserve_all',
                                'backup_max_count'
                              ];
                              const cleanupParams = ['retention_days', 'file_pattern'];
                              const sizeCapParams = ['size_cap_mb'];
                              const syncParams = ['sync_destination_path', 'sync_delete_extraneous'];

                              if (currentAction !== 'backup' && backupParams.includes(param.name)) {
                                return null;
                              }
                              if (currentAction !== 'cleanup' && cleanupParams.includes(param.name)) {
                                return null;
                              }
                              if (currentAction !== 'size_cap' && sizeCapParams.includes(param.name)) {
                                return null;
                              }
                              if (currentAction !== 'sync' && syncParams.includes(param.name)) {
                                return null;
                              }
                              if (param.name === 'backup_max_count' && parameters.backup_preserve_all !== false) {
                                return null;
                              }
                            }

                            const paramGuide = getServerParameterGuide(activeTemplate.id, param, isEn);

                            return (
                              <div key={param.name} className="space-y-1">
                                <div className="flex items-center justify-between text-xs text-slate-300">
                                  <label className="font-mono flex items-center gap-1.5">
                                    <span>{isEn ? param.labelEn : param.labelFa}</span>
                                    {param.required && <span className="text-rose-400">*</span>}
                                  </label>

                                  <InfoTooltipPopover
                                    title={isEn ? param.labelEn : param.labelFa}
                                    what={paramGuide.what}
                                    why={paramGuide.why}
                                    example={paramGuide.example}
                                    isEn={isEn}
                                    size="sm"
                                  />
                                </div>

                                {/* Param Input Controls */}
                                {param.type === 'boolean' ? (
                                  <label className="flex items-center gap-2 p-2 rounded-lg bg-black/40 border border-white/5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!parameters[param.name]}
                                      onChange={(e) =>
                                        setParameters((prev) => ({ ...prev, [param.name]: e.target.checked }))
                                      }
                                      className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-500 accent-cyan-500 shrink-0"
                                    />
                                    <span className="text-xs font-mono text-slate-300">
                                      {parameters[param.name] ? (isEn ? 'Enabled' : 'فعال') : (isEn ? 'Disabled' : 'غیرفعال')}
                                    </span>
                                  </label>
                                ) : param.type === 'select' ? (
                                  <select
                                    value={parameters[param.name] ?? ''}
                                    onChange={(e) =>
                                      setParameters((prev) => ({ ...prev, [param.name]: e.target.value }))
                                    }
                                    className="w-full px-3 py-2 text-xs font-mono bg-black/60 border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
                                  >
                                    {param.options?.map((opt) => (
                                      <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                                        {isEn ? opt.labelEn : opt.labelFa} ({opt.value})
                                      </option>
                                    ))}
                                  </select>
                                ) : param.type === 'textarea' ? (
                                  <textarea
                                    rows={3}
                                    value={parameters[param.name] ?? ''}
                                    onChange={(e) =>
                                      setParameters((prev) => ({ ...prev, [param.name]: e.target.value }))
                                    }
                                    placeholder={param.placeholder || ''}
                                    className="w-full px-3 py-2 text-xs font-mono bg-black/60 border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
                                  />
                                ) : param.type === 'password' ? (
                                  <div className="space-y-1.5">
                                    <div className="relative flex items-center">
                                      <input
                                        type={showPasswordMap[param.name] ? 'text' : 'password'}
                                        value={parameters[param.name] ?? ''}
                                        onChange={(e) =>
                                          setParameters((prev) => ({ ...prev, [param.name]: e.target.value }))
                                        }
                                        placeholder={param.placeholder || ''}
                                        className="w-full px-3 py-1.5 pr-10 text-xs font-mono bg-black/60 border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setShowPasswordMap((prev) => ({
                                            ...prev,
                                            [param.name]: !prev[param.name]
                                          }))
                                        }
                                        title={showPasswordMap[param.name] ? (isEn ? 'Hide Password' : 'مخفی‌سازی رمز') : (isEn ? 'Show Password' : 'نمایش رمز')}
                                        className="absolute right-2 p-1 text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded transition cursor-pointer"
                                      >
                                        {showPasswordMap[param.name] ? (
                                          <EyeOff className="w-3.5 h-3.5" />
                                        ) : (
                                          <Eye className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()_+';
                                          let pwd = '';
                                          for (let i = 0; i < 16; i++) {
                                            pwd += chars.charAt(Math.floor(Math.random() * chars.length));
                                          }
                                          setParameters((prev) => ({ ...prev, [param.name]: pwd }));
                                          setShowPasswordMap((prev) => ({ ...prev, [param.name]: true }));
                                        }}
                                        className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition cursor-pointer font-mono"
                                      >
                                        <Wand2 className="w-3 h-3" />
                                        <span>{isEn ? 'Generate Strong Password' : 'تولید خودکار گذرواژه امن'}</span>
                                      </button>
                                      {parameters[param.name] && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard?.writeText(String(parameters[param.name]));
                                            setCopiedText(param.name);
                                            setTimeout(() => setCopiedText(null), 1500);
                                          }}
                                          className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 transition font-mono cursor-pointer"
                                        >
                                          {copiedText === param.name ? (
                                            <>
                                              <Check className="w-3 h-3 text-emerald-400" />
                                              <span className="text-emerald-400">{isEn ? 'Copied' : 'کپی شد'}</span>
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="w-3 h-3" />
                                              <span>{isEn ? 'Copy' : 'کپی'}</span>
                                            </>
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <input
                                    type={param.type === 'number' ? 'number' : 'text'}
                                    value={parameters[param.name] ?? ''}
                                    onChange={(e) =>
                                      setParameters((prev) => ({
                                        ...prev,
                                        [param.name]: param.type === 'number' ? Number(e.target.value) : e.target.value
                                      }))
                                    }
                                    placeholder={param.placeholder || ''}
                                    className="w-full px-3 py-1.5 text-xs font-mono bg-black/60 border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
                                  />
                                )}

                                {/* Quick Presets for Cron */}
                                {activeTemplate.id === 'linux_cron_add_job' && param.name === 'schedule_preset' && (
                                  <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-mono">
                                    <span className="text-slate-400">{isEn ? 'Presets:' : 'آماده:'}</span>
                                    {[
                                      { id: 'every_minute', label: '* * * * * (1m)' },
                                      { id: 'every_5_minutes', label: '*/5 * * * * (5m)' },
                                      { id: 'hourly', label: '0 * * * * (1h)' },
                                      { id: 'daily', label: '0 0 * * * (daily)' },
                                      { id: 'weekly', label: '0 0 * * 0 (weekly)' },
                                      { id: 'reboot', label: '@reboot' }
                                    ].map((preset) => (
                                      <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => setParameters((prev) => ({ ...prev, schedule_preset: preset.id }))}
                                        className="px-2 py-0.5 rounded bg-white/5 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-white/5 cursor-pointer transition"
                                      >
                                        {preset.label}
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {/* Quick Presets for Mount Filesystem */}
                                {activeTemplate.id === 'linux_mount_storage' && param.name === 'fstype' && (
                                  <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-mono">
                                    <span className="text-slate-400">{isEn ? 'Filesystems:' : 'فرمت‌ها:'}</span>
                                    {['ext4', 'xfs', 'btrfs', 'nfs', 'cifs'].map((fs) => (
                                      <button
                                        key={fs}
                                        type="button"
                                        onClick={() => setParameters((prev) => ({ ...prev, fstype: fs }))}
                                        className="px-2 py-0.5 rounded bg-white/5 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-white/5 cursor-pointer transition"
                                      >
                                        {fs}
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {/* Quick Presets for Firewall Port */}
                                {activeTemplate.id === 'linux_firewall_rule' && param.name === 'port' && (
                                  <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-mono">
                                    <span className="text-slate-400">{isEn ? 'Common Ports:' : 'پورت‌ها:'}</span>
                                    {[
                                      { port: '22', name: 'SSH' },
                                      { port: '80', name: 'HTTP' },
                                      { port: '443', name: 'HTTPS' },
                                      { port: '53', name: 'DNS' },
                                      { port: '3306', name: 'MySQL' },
                                      { port: '5432', name: 'Postgres' }
                                    ].map((item) => (
                                      <button
                                        key={item.port}
                                        type="button"
                                        onClick={() => setParameters((prev) => ({ ...prev, port: item.port }))}
                                        className="px-2 py-0.5 rounded bg-white/5 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-white/5 cursor-pointer transition"
                                      >
                                        {item.name} ({item.port})
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {/* Directory Lifecycle Presets & Safe Mode Banner */}
                                {activeTemplate.id === 'linux_directory_lifecycle_backup' && param.name === 'backup_preserve_all' && (
                                  parameters.backup_preserve_all !== false ? (
                                    <div className="mt-2 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 flex items-start gap-2 text-[11px] text-emerald-300 font-mono">
                                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                      <div>
                                        <span className="font-bold">
                                          {isEn ? 'Safe Preservation Mode Active:' : 'حالت حفظ ایمن فعال است:'}
                                        </span>{' '}
                                        <span>
                                          {isEn
                                            ? 'All historical and previous backups are guaranteed safe. Archives are saved with non-colliding sequential timestamps so existing backups are never overwritten or deleted.'
                                            : 'تمام بکاپ‌های تاریخی و پیشین در دایرکتوری مقصد در امان هستند. آرشیوها با برچسب‌های زمانی نامکرر ذخیره شده و هیچ آرشیو قبلی بازنویسی یا حذف نمی‌گردد.'}
                                        </span>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="mt-2 p-2 rounded-lg bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-300 font-mono flex items-center gap-2">
                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                      <span>
                                        {isEn
                                          ? 'Auto-Rotation Active: Older archives exceeding max retained count will be pruned.'
                                          : 'چرخش خودکار فعال است: آرشیوهای قدیمی‌تر از سقف مجاز به صورت خودکار حذف می‌شوند.'}
                                      </span>
                                    </div>
                                  )
                                )}

                                {activeTemplate.id === 'linux_directory_lifecycle_backup' && param.name === 'target_path' && (
                                  <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-mono">
                                    <span className="text-slate-400">{isEn ? 'Common Paths:' : 'مسیرهای متداول:'}</span>
                                    {['/var/log', '/opt/data', '/var/backups', '/var/www'].map((p) => (
                                      <button
                                        key={p}
                                        type="button"
                                        onClick={() => setParameters((prev) => ({ ...prev, target_path: p }))}
                                        className="px-2 py-0.5 rounded bg-white/5 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-white/5 cursor-pointer transition"
                                      >
                                        {p}
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {activeTemplate.id === 'linux_directory_lifecycle_backup' && param.name === 'backup_destination_path' && (
                                  <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-mono">
                                    <span className="text-slate-400">{isEn ? 'Destinations:' : 'مسیرهای مقصد:'}</span>
                                    {['/backup/archives', '/var/backups/fleet', '/mnt/backup'].map((p) => (
                                      <button
                                        key={p}
                                        type="button"
                                        onClick={() => setParameters((prev) => ({ ...prev, backup_destination_path: p }))}
                                        className="px-2 py-0.5 rounded bg-white/5 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-white/5 cursor-pointer transition"
                                      >
                                        {p}
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {activeTemplate.id === 'linux_directory_lifecycle_backup' && param.name === 'retention_days' && (
                                  <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-mono">
                                    <span className="text-slate-400">{isEn ? 'Retention Thresholds:' : 'مهلت‌های زمانی:'}</span>
                                    {['7', '14', '30', '60', '90'].map((d) => (
                                      <button
                                        key={d}
                                        type="button"
                                        onClick={() => setParameters((prev) => ({ ...prev, retention_days: Number(d) }))}
                                        className="px-2 py-0.5 rounded bg-white/5 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-white/5 cursor-pointer transition"
                                      >
                                        {d} {isEn ? 'days' : 'روز'}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Dangerous Operation Confirmation Keyword */}
                    {activeTemplate.is_dangerous && activeTemplate.confirmation_keyword && (
                      <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 space-y-2">
                        <label className="block text-xs font-mono font-bold text-rose-300">
                          {isEn
                            ? `Type "${activeTemplate.confirmation_keyword}" to confirm execution:`
                            : `جهت تایید، عبارت «${activeTemplate.confirmation_keyword}» را وارد کنید:`}
                        </label>
                        <input
                          type="text"
                          value={dangerConfirmation}
                          onChange={(e) => setDangerConfirmation(e.target.value)}
                          placeholder={activeTemplate.confirmation_keyword}
                          className="w-full px-3 py-1.5 text-xs font-mono bg-black/60 border border-rose-500/40 rounded-lg text-rose-200 uppercase focus:outline-none focus:border-rose-400"
                        />
                      </div>
                    )}

                    {/* Execution Policies & Safety Card */}
                    <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300 font-mono flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{isEn ? 'Execution Policies & Safety' : 'سیاست‌های اجرایی و ایمنی'}</span>
                        </span>
                      </div>

                      {/* Sudo check */}
                      <label className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/5 text-xs cursor-pointer">
                        <div>
                          <div className="font-mono text-slate-200">
                            {isEn ? 'Superuser Elevation (sudo)' : 'اجرا با اختیارات ریشه (sudo)'}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {isEn ? 'Applies commands with root privileges when required' : 'اجرای دستورات تحت کاربری root'}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={runWithSudo}
                          onChange={(e) => setRunWithSudo(e.target.checked)}
                          className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-500 accent-cyan-500 shrink-0"
                        />
                      </label>

                      {/* Timeout & Delay */}
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                            <label>{isEn ? 'Per-Server Timeout (s)' : 'مهلت زمانی سرور (ثانیه)'}</label>
                            <InfoTooltipPopover
                              title={isEn ? 'Timeout' : 'مهلت زمانی'}
                              what={isEn ? 'Maximum wait time for SSH command execution per server.' : 'حداکثر زمان انتظار برای دریافت پاسخ از هر سرور.'}
                              why={isEn ? 'Prevents unresponsive or slow servers from freezing the batch.' : 'جلوگیری از قفل شدن فرآیند توسط سرورهای کند.'}
                              example="60s"
                              isEn={isEn}
                              size="sm"
                            />
                          </div>
                          <input
                            type="number"
                            min={10}
                            max={300}
                            value={timeoutSec}
                            onChange={(e) => setTimeoutSec(Number(e.target.value))}
                            className="w-full px-3 py-1.5 text-xs font-mono bg-black/60 border border-white/10 rounded-lg text-slate-200"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                            <label>{isEn ? 'Delay Between Servers (ms)' : 'وقفه بین سرورها (میلی‌ثانیه)'}</label>
                            <InfoTooltipPopover
                              title={isEn ? 'Inter-Server Delay' : 'تاخیر بین سرورها'}
                              what={isEn ? 'Cooldown pause between sequential server commands.' : 'مکث کوتاه پیش از اتصال به سرور بعدی.'}
                              why={isEn ? 'Mitigates network traffic spikes and concurrent connection limits.' : 'کنترل بار ترافیکی و جلوگیری از فشار همزمان.'}
                              example="500ms"
                              isEn={isEn}
                              size="sm"
                            />
                          </div>
                          <input
                            type="number"
                            min={0}
                            max={5000}
                            step={250}
                            value={delayMs}
                            onChange={(e) => setDelayMs(Number(e.target.value))}
                            className="w-full px-3 py-1.5 text-xs font-mono bg-black/60 border border-white/10 rounded-lg text-slate-200"
                          />
                        </div>
                      </div>

                      {/* Ephemeral Sudo Password (optional) */}
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                          <label>{isEn ? 'Ephemeral Sudo Password (optional)' : 'رمز عبور موقت سودو (اختیاری)'}</label>
                          <InfoTooltipPopover
                            title={isEn ? 'Sudo Password' : 'رمز عبور sudo'}
                            what={isEn ? 'Memory-only password for servers requiring sudo password authentication.' : 'رمز عبور در حافظه برای سرورهایی که sudo بدون پسورد ندارند.'}
                            why={isEn ? 'Never persisted to disk or database; purged immediately after job completion.' : 'به صورت امن و فقط در حافظه رم نگهداری و پس از پایان کار پاک می‌شود.'}
                            example="••••••••"
                            isEn={isEn}
                            size="sm"
                          />
                        </div>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={ephemeralPassword}
                            onChange={(e) => setEphemeralPassword(e.target.value)}
                            placeholder={isEn ? 'Leave empty if passwordless sudo or root is configured' : 'در صورت وجود sudo بدون رمز خالی بگذارید'}
                            className="w-full px-3 py-1.5 pr-8 text-xs font-mono bg-black/60 border border-white/10 rounded-lg text-slate-200"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200 cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Target Linux Servers Selection (In Step 1, exactly like BulkDeviceConfigModal) */}
                    <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300 font-mono">
                          {isEn ? 'Target Linux Servers Selection' : 'فهرست سرورهای لینوکس هدف'} (
                          {selectedServerIds.size} / {linuxServers.length})
                        </span>
                        <div className="flex items-center gap-2 text-[11px] font-mono">
                          <button
                            type="button"
                            onClick={handleSelectAllFiltered}
                            className="text-cyan-400 hover:underline cursor-pointer"
                          >
                            {isEn ? 'Select All' : 'انتخاب همه'}
                          </button>
                          <span>|</span>
                          <button
                            type="button"
                            onClick={handleClearServerSelection}
                            className="text-slate-400 hover:underline cursor-pointer"
                          >
                            {isEn ? 'Clear' : 'پاک کردن'}
                          </button>
                        </div>
                      </div>

                      {/* Distro quick filter chips */}
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => setDistroFilter('all')}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                            distroFilter === 'all'
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                              : 'bg-white/5 text-slate-400 hover:bg-white/10'
                          }`}
                        >
                          {isEn ? 'All Distros' : 'همه توزیع‌ها'}
                        </button>
                        {availableDistros.map((distro) => (
                          <button
                            key={distro}
                            type="button"
                            onClick={() => setDistroFilter(distro)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                              distroFilter === distro
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                : 'bg-white/5 text-slate-400 hover:bg-white/10'
                            }`}
                          >
                            {distro}
                          </button>
                        ))}
                      </div>

                      {/* Servers list */}
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {filteredServers.length === 0 ? (
                          <div className="p-4 text-center text-slate-500 text-xs font-mono">
                            {isEn ? 'No Linux servers found matching filter' : 'سرور لینوکسی مطابق فیلتر یافت نشد'}
                          </div>
                        ) : (
                          filteredServers.map((srv) => {
                            const isSelected = selectedServerIds.has(srv.id);
                            const badge = getDistroBadge(srv.os_distro);

                            return (
                              <div
                                key={srv.id}
                                onClick={() => handleToggleServer(srv.id)}
                                className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition ${
                                  isSelected
                                    ? 'bg-white/5 border-white/15 text-slate-200'
                                    : 'bg-black/20 border-white/5 text-slate-500 opacity-60'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    className="w-3.5 h-3.5 rounded text-cyan-500 accent-cyan-500 cursor-pointer"
                                  />
                                  <span className="font-bold font-mono">{srv.name}</span>
                                  <span className="text-[11px] font-mono text-slate-400">({srv.ip})</span>
                                </div>

                                <div className="flex items-center gap-2 text-[10px] font-mono">
                                  <span className={`px-1.5 py-0.5 rounded ${badge.className}`}>
                                    {badge.name}
                                  </span>
                                  {srv.hostname && <span className="text-slate-500">{srv.hostname}</span>}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-12 text-center text-slate-500 border border-dashed border-white/10 rounded-2xl">
                    {isEn ? 'Select a command template on the left to configure parameters' : 'لطفاً یک الگو را از ستون سمت چپ انتخاب کنید'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW & DRY-RUN */}
          {activeStep === 'preview' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-slate-950/60 border border-white/10">
                <div>
                  <h4 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                    <Eye className="w-4 h-4 text-cyan-400" />
                    <span>{isEn ? 'Configuration Preview & Shell Command Translation' : 'پیش‌نمایش فرامین Bash و ترجمه به تفکیک توزیع لینوکس'}</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    {isEn
                      ? 'Review the exact shell commands generated for each server distribution before initiating changes.'
                      : 'فرامین ترجمه‌شده بر اساس پکیج منیجر و توزیع هر سرور را پیش از اعمال قطعی بررسی کنید.'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGeneratePreview}
                    disabled={loadingPreview}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 text-xs font-mono transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingPreview ? 'animate-spin text-cyan-400' : ''}`} />
                    <span>{isEn ? 'Regenerate Preview' : 'بروزرسانی پیش‌نمایش'}</span>
                  </button>
                </div>
              </div>

              {previewError && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{previewError}</span>
                </div>
              )}

              {loadingPreview ? (
                <div className="p-16 text-center text-slate-400 flex flex-col items-center gap-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                  <span className="text-xs font-mono">{isEn ? 'Translating shell commands across server distros...' : 'در حال تولید فرامین متناسب با توزیع هر سرور...'}</span>
                </div>
              ) : previewItems.length === 0 ? (
                <div className="p-12 text-center text-slate-500 border border-dashed border-white/10 rounded-xl text-xs">
                  {isEn ? 'No preview generated yet. Click Regenerate Preview.' : 'پیش‌نمایشی ایجاد نشده است. دکمه بروزرسانی را بزنید.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {previewItems.map((item) => {
                    const badge = getDistroBadge(item.osDistro);

                    return (
                      <div
                        key={item.serverId}
                        className="rounded-xl border border-white/10 bg-slate-950/60 overflow-hidden shadow-md"
                      >
                        {/* Server Header */}
                        <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-900/80 border-b border-white/5 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white font-mono">{item.serverName}</span>
                            <span className="text-slate-400 font-mono">({item.serverIp})</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${badge.className}`}>
                              {badge.name}
                            </span>
                            {item.distroMapperName && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 text-slate-400">
                                {item.distroMapperName}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
                            <span>{item.steps.length} {isEn ? 'command steps' : 'مرحله دستور'}</span>
                            <span>•</span>
                            <span>~{item.estimatedTimeoutSec}s {isEn ? 'est.' : 'تخمینی'}</span>
                          </div>
                        </div>

                        {/* Commands Details */}
                        <div className="p-4 space-y-3 text-xs font-mono">
                          {/* Idempotency Pre-Check */}
                          {item.idempotencyCheck && (
                            <div>
                              <div className="text-[11px] text-cyan-400 font-semibold mb-1 flex items-center gap-1.5">
                                <Check className="w-3.5 h-3.5" />
                                <span>{isEn ? 'Step 0: Idempotency Check (Read-Only)' : 'مرحله صفر: بررسی تکراری نبودن (فقط‌خواندنی)'}</span>
                              </div>
                              <pre className="p-2.5 rounded-lg bg-black/60 border border-cyan-500/20 text-cyan-300 text-[11px] overflow-x-auto">
                                <code>{item.idempotencyCheck}</code>
                              </pre>
                            </div>
                          )}

                          {/* Execution Steps */}
                          <div>
                            <div className="text-[11px] text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
                              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                              <span>{isEn ? 'Execution Steps' : 'فرامین اجرایی'}</span>
                            </div>
                            <div className="space-y-1.5">
                              {item.steps.map((step, idx) => (
                                <div key={idx} className="p-2.5 rounded-lg bg-black/70 border border-white/10">
                                  <div className="text-[10px] text-slate-400 mb-1 flex items-center justify-between">
                                    <span>
                                      Step {idx + 1}: {isEn ? step.descriptionEn : step.descriptionFa}
                                    </span>
                                    <span className="text-slate-500 font-mono">
                                      {step.requiresSudo ? '[SUDO]' : '[USER]'}
                                    </span>
                                  </div>
                                  <pre className="text-slate-100 text-[11px] overflow-x-auto font-mono">
                                    <code>{step.command}</code>
                                  </pre>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Rollback / Verification Command */}
                          {item.rollbackCommand && (
                            <div>
                              <div className="text-[11px] text-amber-400 font-semibold mb-1 flex items-center gap-1.5">
                                <Lock className="w-3.5 h-3.5" />
                                <span>{isEn ? 'Safety Rollback / Verification' : 'دستور بازگردانی و راستی‌آزمایی'}</span>
                              </div>
                              <pre className="p-2.5 rounded-lg bg-black/60 border border-amber-500/20 text-amber-300 text-[11px] overflow-x-auto">
                                <code>{item.rollbackCommand}</code>
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: EXECUTION & REAL-TIME MONITORING */}
          {activeStep === 'execution' && (
            <div className="space-y-4">
              {jobStatus ? (
                <>
                  {/* Job Overview Status Banner */}
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white font-mono">
                            {isEn ? jobStatus.templateTitleEn : jobStatus.templateTitle}
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                              jobStatus.status === 'running'
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse'
                                : jobStatus.status === 'completed'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : jobStatus.status === 'failed'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : 'bg-slate-500/20 text-slate-300 border border-slate-500/40'
                            }`}
                          >
                            {jobStatus.status === 'running'
                              ? isEn ? 'Executing...' : 'در حال اجرا...'
                              : jobStatus.status === 'completed'
                              ? isEn ? 'Completed' : 'تکمیل شد'
                              : jobStatus.status === 'failed'
                              ? isEn ? 'Failed' : 'خطا در اجرا'
                              : jobStatus.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono mt-1">
                          Job ID: {jobStatus.jobId} • {isEn ? 'Started' : 'شروع'}: {new Date(jobStatus.createdAt * 1000).toLocaleTimeString()}
                        </div>
                      </div>

                      {/* Actions during execution */}
                      <div className="flex items-center gap-2">
                        {jobStatus.status === 'running' && (
                          <button
                            onClick={handleCancelJob}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-mono transition cursor-pointer"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>{isEn ? 'Stop Job' : 'توقف عملیات'}</span>
                          </button>
                        )}

                        {(jobStatus.status === 'completed' || jobStatus.status === 'failed' || jobStatus.status === 'cancelled') && (
                          <button
                            onClick={handleExportSummary}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 text-xs font-mono transition cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{isEn ? 'Export JSON' : 'خروجی گزارش'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar & Counters */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-300">
                          {jobStatus.status === 'running' && jobStatus.currentServerName ? (
                            <span className="flex items-center gap-1.5 text-cyan-300">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span>
                                {isEn ? 'Processing' : 'پردازش'}: {jobStatus.currentServerName} ({jobStatus.currentStepName || 'Executing...'})
                              </span>
                            </span>
                          ) : (
                            <span>{isEn ? 'Overall Progress' : 'پیشرفت کلی عملیات'}</span>
                          )}
                        </span>
                        <span className="font-bold text-white">{jobStatus.percentage}%</span>
                      </div>

                      {/* Bar */}
                      <div className="w-full h-2.5 bg-black/60 rounded-full overflow-hidden border border-white/10 p-0.5">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300"
                          style={{ width: `${jobStatus.percentage}%` }}
                        />
                      </div>

                      {/* Stat pills */}
                      <div className="flex items-center gap-4 text-xs font-mono pt-1 text-slate-400">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{isEn ? 'Success' : 'موفق'}: <strong className="text-white">{jobStatus.successCount}</strong></span>
                        </span>
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          <span>{isEn ? 'Partial' : 'ناقص'}: <strong className="text-white">{jobStatus.partialCount ?? jobStatus.skippedCount ?? 0}</strong></span>
                        </span>
                        <span className="flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5 text-rose-400" />
                          <span>{isEn ? 'Failed' : 'ناموفق'}: <strong className="text-white">{jobStatus.failedCount}</strong></span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{isEn ? 'Total' : 'کل'}: <strong className="text-white">{jobStatus.totalServers}</strong></span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Server-by-Server Execution Results Table */}
                  <div className="rounded-xl border border-white/10 bg-slate-950/60 overflow-hidden shadow-md">
                    <div className="px-4 py-2.5 bg-slate-900/80 border-b border-white/5 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-300 font-mono">
                        {isEn ? 'Server Execution Status' : 'وضعیت اجرای هر سرور'}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {jobStatus.completedServers} / {jobStatus.totalServers} {isEn ? 'completed' : 'انجام شد'}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left divide-y divide-white/5" dir={isRtl ? 'rtl' : 'ltr'}>
                        <thead className="bg-slate-950/80 text-slate-400 text-[11px] font-mono uppercase">
                          <tr>
                            <th className="p-3">{isEn ? 'Server' : 'سرور'}</th>
                            <th className="p-3">{isEn ? 'Distro' : 'توزیع'}</th>
                            <th className="p-3">{isEn ? 'Status' : 'وضعیت'}</th>
                            <th className="p-3">{isEn ? 'Steps' : 'مراحل'}</th>
                            <th className="p-3">{isEn ? 'Duration' : 'زمان'}</th>
                            <th className="p-3 text-center">{isEn ? 'Logs' : 'مشاهده لاگ'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-mono">
                          {Object.values(jobStatus.results).map((res) => {
                            const isRunning =
                              jobStatus.status === 'running' && jobStatus.currentServerName === res.serverName;

                            return (
                              <tr key={res.serverId} className="hover:bg-white/5 transition">
                                <td className="p-3">
                                  <div className="font-bold text-white">{res.serverName}</div>
                                  <div className="text-[10px] text-slate-400">{res.serverIp}</div>
                                </td>
                                <td className="p-3">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-slate-300">
                                    {res.osDistro || 'Linux'}
                                  </span>
                                </td>
                                <td className="p-3">
                                  {isRunning ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse">
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                      <span>{isEn ? 'Running' : 'در حال اجرا'}</span>
                                    </span>
                                  ) : res.status === 'success' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>{isEn ? 'Success' : 'موفق'}</span>
                                    </span>
                                  ) : res.status === 'failed' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                      <XCircle className="w-3 h-3" />
                                      <span>{isEn ? 'Failed' : 'خطا'}</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-500/20 text-slate-300 border border-slate-500/40">
                                      <Clock className="w-3 h-3" />
                                      <span>{isEn ? 'Pending' : 'در انتظار'}</span>
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-slate-400">
                                  {res.stepsCompleted} / {res.stepsTotal}
                                </td>
                                <td className="p-3 text-slate-400">
                                  {res.durationMs ? `${(res.durationMs / 1000).toFixed(1)}s` : '-'}
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setActiveTabServerId(res.serverId)}
                                    className={`px-2 py-1 rounded text-[10px] font-mono transition cursor-pointer ${
                                      activeTabServerId === res.serverId
                                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                        : 'bg-white/5 text-slate-400 hover:text-white'
                                    }`}
                                  >
                                    {isEn ? 'View Output' : 'خروجی'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Live Execution Logs Terminal */}
                  <div className="rounded-xl border border-white/10 bg-slate-950/80 overflow-hidden shadow-md">
                    <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-white/5 text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-cyan-400" />
                        <span className="font-bold text-slate-200">
                          {isEn ? 'Live Execution Logs' : 'لاگ‌های لحظه‌ای اجرا'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          ({jobStatus.logs.length} {isEn ? 'events' : 'رویداد'})
                        </span>
                      </div>

                      {/* Log Filters & Actions */}
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 text-[10px]">
                          {(['all', 'error', 'warning', 'info', 'success'] as const).map((lvl) => (
                            <button
                              key={lvl}
                              type="button"
                              onClick={() => setLogFilter(lvl)}
                              className={`px-2 py-0.5 rounded cursor-pointer transition ${
                                logFilter === lvl
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
                              }`}
                            >
                              {lvl.toUpperCase()}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const text = jobStatus.logs.map((l) => `[${l.timeStr}] [${l.level.toUpperCase()}] ${isEn ? l.messageEn : l.messageFa}`).join('\n');
                            handleCopy(text, 'all_logs');
                          }}
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] cursor-pointer"
                        >
                          {copiedText === 'all_logs' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{isEn ? 'Copy' : 'کپی'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-3.5 max-h-64 overflow-y-auto font-mono text-[11px] space-y-1 bg-black/80">
                      {jobStatus.logs.length === 0 ? (
                        <div className="text-slate-600 text-center py-6">
                          {isEn ? 'No logs yet...' : 'هنوز لاگی ثبت نشده است...'}
                        </div>
                      ) : (
                        jobStatus.logs
                          .filter((l) => logFilter === 'all' || l.level === logFilter)
                          .map((log, idx) => (
                            <div
                              key={idx}
                              className={`flex items-start gap-2 ${
                                log.level === 'error'
                                  ? 'text-rose-300'
                                  : log.level === 'warning'
                                  ? 'text-amber-300'
                                  : log.level === 'success'
                                  ? 'text-emerald-300'
                                  : 'text-slate-300'
                              }`}
                            >
                              <span className="text-slate-600 shrink-0">[{log.timeStr}]</span>
                              <span className="shrink-0 font-bold uppercase text-[9px] px-1 rounded bg-white/5">
                                {log.level}
                              </span>
                              <span>{isEn ? log.messageEn : log.messageFa}</span>
                            </div>
                          ))
                      )}
                      <div ref={logsEndRef} />
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-16 text-center text-slate-500 flex flex-col items-center gap-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                  <span className="text-xs font-mono">{isEn ? 'Connecting to job engine...' : 'در حال اتصال به موتور پردازش...'}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* MODAL FOOTER (Exact structure of BulkDeviceConfigModal)   */}
        {/* ========================================================= */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-t shrink-0 ${
            isLightMode ? 'border-slate-200 bg-slate-100/90' : 'border-white/10 bg-slate-950/80'
          }`}
        >
          <div className="text-xs text-slate-400 font-mono">
            {activeStep === 'configure' && (
              <span>
                {isEn ? 'Targeting:' : 'سرورهای هدف:'}{' '}
                <strong className={isLightMode ? 'text-slate-900' : 'text-white'}>{selectedServerIds.size}</strong>{' '}
                {isEn ? 'active Linux servers' : 'سرور فعال'}
              </span>
            )}
            {activeStep === 'preview' && (
              <span>
                {isEn ? 'Reviewing:' : 'تعداد سرورهای آماده:'}{' '}
                <strong className={isLightMode ? 'text-slate-900' : 'text-white'}>{previewItems.length}</strong>{' '}
                {isEn ? 'nodes ready for execution' : 'سرور آماده اجرا'}
              </span>
            )}
            {activeStep === 'execution' && (
              <span>
                {isEn ? 'Status:' : 'وضعیت:'}{' '}
                <strong className="text-cyan-300">{jobStatus?.status || (isEn ? 'Active' : 'فعال')}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeStep === 'preview' && (
              <button
                type="button"
                onClick={() => setActiveStep('configure')}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono transition cursor-pointer"
              >
                {isEn ? 'Back to Config' : 'بازگشت به تنظیمات'}
              </button>
            )}

            {activeStep === 'configure' && (
              <button
                type="button"
                onClick={handleGeneratePreview}
                disabled={!isFormValid || loadingPreview}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold font-mono transition active:scale-95 cursor-pointer ${
                  isFormValid && !loadingPreview
                    ? 'bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white shadow-lg shadow-cyan-500/20'
                    : 'bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed'
                }`}
              >
                <Eye className="w-4 h-4" />
                <span>{loadingPreview ? (isEn ? 'Generating...' : 'در حال پردازش...') : (isEn ? 'Preview & Dry-Run' : 'پیش‌نمایش دستورات')}</span>
              </button>
            )}

            {(activeStep === 'preview' || activeStep === 'configure') && (
              <button
                type="button"
                onClick={handleStartExecution}
                disabled={!isFormValid || isExecuting}
                className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold font-mono transition active:scale-95 cursor-pointer ${
                  isFormValid && !isExecuting
                    ? activeTemplate?.is_dangerous
                      ? 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-lg shadow-rose-500/25'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/25'
                    : 'bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed'
                }`}
              >
                <Play className="w-4 h-4" />
                <span>
                  {isExecuting
                    ? (isEn ? 'Executing...' : 'در حال اجرا...')
                    : (isEn ? 'Execute Fleet Automation' : 'اجرای اتوماسیون ناوگان')}
                </span>
              </button>
            )}

            {activeStep === 'execution' && (
              <button
                type="button"
                onClick={() => {
                  if (!isExecuting) onClose();
                }}
                disabled={isExecuting}
                className={`px-5 py-2 rounded-xl text-xs font-bold font-mono transition ${
                  !isExecuting
                    ? 'bg-white/10 hover:bg-white/15 text-white cursor-pointer'
                    : 'bg-white/5 text-slate-500 cursor-not-allowed'
                }`}
              >
                {isEn ? 'Close' : 'بستن'}
              </button>
            )}
          </div>
        </div>
      </>
    )}
  </div>
</div>,
    document.body
  );
};
