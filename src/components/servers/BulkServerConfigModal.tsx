import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Server,
  Sliders,
  X,
  Minus,
  Maximize2,
  Minimize2,
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
  ArrowRight,
  ArrowLeft,
  Download,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Layers,
  HardDrive,
  Sparkles,
  HelpCircle,
  AlertCircle
} from 'lucide-react';
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

interface BulkServerConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  isEn: boolean;
  isLightMode: boolean;
  initialSelectedServers?: RemoteServer[];
  allServers: RemoteServer[];
  onServersUpdated?: () => void;
}

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
  const [isMaximized, setIsMaximized] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Templates
  const [templates, setTemplates] = useState<BulkServerTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('linux_security_updates');
  const [templateSearch, setTemplateSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Parameters
  const [parameters, setParameters] = useState<Record<string, any>>({});

  // Target Servers Selection
  const [selectedServerIds, setSelectedServerIds] = useState<Set<string>>(new Set());
  const [serverSearch, setServerSearch] = useState('');
  const [distroFilter, setDistroFilter] = useState<string>('all');

  // Preview State
  const [previewItems, setPreviewItems] = useState<BulkServerPreviewItem[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [dangerConfirmation, setDangerConfirmation] = useState('');
  const [timeoutSec, setTimeoutSec] = useState<number>(60);
  const [delayMs, setDelayMs] = useState<number>(500);
  const [ephemeralPassword, setEphemeralPassword] = useState('');

  // Execution Job State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<BulkServerJobStatus | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [activeTabServerId, setActiveTabServerId] = useState<string | null>(null);
  const [expandedPreviewServerId, setExpandedPreviewServerId] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Filter only Linux servers for Phase 1
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
      // Default select all linux servers if none selected
      setSelectedServerIds(new Set(linuxServers.map((s) => s.id)));
    }
  }, [isOpen, initialSelectedServers, linuxServers]);

  // Selected template object
  const currentTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || templates[0];
  }, [templates, selectedTemplateId]);

  // Initialize default parameter values when template changes
  useEffect(() => {
    if (currentTemplate) {
      const initialVals: Record<string, any> = {};
      currentTemplate.parameters.forEach((param) => {
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
      setTimeoutSec(currentTemplate.default_timeout_sec || 60);
      setDangerConfirmation('');
    }
  }, [currentTemplate]);

  // Handle template selection
  const handleSelectTemplate = (tplId: string) => {
    setSelectedTemplateId(tplId);
  };

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

  // Filtered servers in Step 2
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

  const handleDeselectAllFiltered = () => {
    setSelectedServerIds((prev) => {
      const next = new Set(prev);
      filteredServers.forEach((s) => next.delete(s.id));
      return next;
    });
  };

  // Move to Step 3: Generate Preview
  const handleProceedToPreview = async () => {
    if (!currentTemplate || selectedServerIds.size === 0) return;
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const items = await generateBulkServerPreview(
        currentTemplate.id,
        parameters,
        Array.from(selectedServerIds)
      );
      setPreviewItems(items);
      if (items.length > 0) {
        setExpandedPreviewServerId(items[0].serverId);
      }
      setCurrentStep(3);
    } catch (err: any) {
      setPreviewError(err.message || 'Failed to generate preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  // Start Fleet Execution
  const handleStartExecution = async () => {
    if (!currentTemplate) return;

    if (currentTemplate.is_dangerous && currentTemplate.confirmation_keyword) {
      if (dangerConfirmation.trim().toUpperCase() !== currentTemplate.confirmation_keyword.toUpperCase()) {
        alert(
          isEn
            ? `Please type "${currentTemplate.confirmation_keyword}" to confirm dangerous operation.`
            : `لطفاً جهت تایید عبارت «${currentTemplate.confirmation_keyword}» را دقیقاً وارد نمایید.`
        );
        return;
      }
    }

    setIsExecuting(true);
    setCurrentStep(4);

    try {
      const { jobId } = await startBulkServerJob({
        templateId: currentTemplate.id,
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
      alert(err.message || 'Failed to start execution');
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

  // Copy to clipboard helper
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

  // Render Template Icon
  const renderTemplateIcon = (iconName: string, className = 'w-5 h-5') => {
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
      case 'Layers':
        return <Layers className={className} />;
      case 'Terminal':
      default:
        return <Terminal className={className} />;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={
        isMaximized
          ? 'fixed top-0 left-0 right-0 bottom-8 z-50 p-0 flex flex-col'
          : 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm pb-10'
      }
    >
      <div
        className={`flex flex-col overflow-hidden transition-all duration-200 ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-6xl max-h-[92vh] rounded-2xl border shadow-2xl'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* ========================================================= */}
        {/* MODAL HEADER WITH 3 CONTROL BUTTONS (Rule 7 Standard)     */}
        {/* ========================================================= */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl flex items-center justify-center ${
                isLightMode ? 'bg-cyan-100 text-cyan-700' : 'bg-cyan-950/80 text-cyan-400 border border-cyan-800/40'
              }`}
            >
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">
                  {isEn ? 'Bulk Linux Server Configuration' : 'پیکربندی گروهی ناوگان سرورهای لینوکس'}
                </h2>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    isLightMode
                      ? 'bg-cyan-100 text-cyan-800 border border-cyan-200'
                      : 'bg-cyan-950 text-cyan-300 border border-cyan-800/50'
                  }`}
                >
                  {isEn ? 'Linux Fleet Automation' : 'اتوماسیون ناوگان لینوکس'}
                </span>
              </div>
              <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Multi-node idempotent configuration with adaptive distro command generation (APT / DNF / Pacman / APK)'
                  : 'پیکربندی همزمان چندین سرور با تولید خودکار دستورات بر اساس توزیع سیستم‌عامل (اوبونتو، ردهت، راکی، آلپاین)'}
              </p>
            </div>
          </div>

          {/* Stepper Wizard Indicator */}
          <div className="hidden md:flex items-center gap-2">
            {[
              { num: 1, labelEn: 'Template', labelFa: 'انتخاب قالب' },
              { num: 2, labelEn: 'Servers', labelFa: 'انتخاب سرورها' },
              { num: 3, labelEn: 'Preview', labelFa: 'پیش‌نمایش دستورات' },
              { num: 4, labelEn: 'Execute', labelFa: 'اجرا و لاگ‌ها' }
            ].map((st, idx) => (
              <React.Fragment key={st.num}>
                {idx > 0 && (
                  <div
                    className={`w-6 h-0.5 ${
                      currentStep >= st.num
                        ? isLightMode
                          ? 'bg-cyan-500'
                          : 'bg-cyan-400'
                        : isLightMode
                        ? 'bg-slate-200'
                        : 'bg-slate-800'
                    }`}
                  />
                )}
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    currentStep === st.num
                      ? isLightMode
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'bg-cyan-500 text-slate-950 shadow-sm font-bold'
                      : currentStep > st.num
                      ? isLightMode
                        ? 'bg-cyan-100 text-cyan-800'
                        : 'bg-cyan-950 text-cyan-300'
                      : isLightMode
                      ? 'bg-slate-100 text-slate-400'
                      : 'bg-slate-900 text-slate-500'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] border border-current">
                    {st.num}
                  </span>
                  <span>{isEn ? st.labelEn : st.labelFa}</span>
                </div>
              </React.Fragment>
            ))}
          </div>

          {/* Header 3 Control Buttons (Standard Rule 7) */}
          <div className="flex items-center gap-1">
            {/* Minimize button */}
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                title={isEn ? 'Minimize to bottom dock' : 'مینیمایز به نوار ابزار پایین'}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isLightMode
                    ? 'hover:bg-slate-200 text-slate-600'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-300'
                }`}
              >
                <Minus className="w-4 h-4" />
              </button>
            )}

            {/* Fullscreen / Maximize button */}
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              title={
                isMaximized
                  ? isEn
                    ? 'Exit Fullscreen'
                    : 'خروج از حالت تمام صفحه'
                  : isEn
                  ? 'Fullscreen'
                  : 'تمام صفحه'
              }
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-600'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-300'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-rose-100 text-slate-600 hover:text-rose-700'
                  : 'hover:bg-rose-950/50 text-slate-400 hover:text-rose-400'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* MODAL BODY (STEP VIEWS)                                   */}
        {/* ========================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* STEP 1: TEMPLATE & PARAMETERS SELECTION */}
          {currentStep === 1 && (
            <div className="space-y-6">
              {/* Category Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                  {[
                    { id: 'all', labelEn: 'All Templates', labelFa: 'همه قالب‌ها' },
                    { id: 'users', labelEn: 'Users & Groups', labelFa: 'کاربران و دسترسی' },
                    { id: 'cron', labelEn: 'Cron Jobs & Schedules', labelFa: 'کرون‌جاب و زمان‌بندی' },
                    { id: 'storage', labelEn: 'Mount & Storage', labelFa: 'مانت و دیسک' },
                    { id: 'firewall', labelEn: 'Firewall & Ports', labelFa: 'فایروال و پورت‌ها' },
                    { id: 'docker', labelEn: 'Docker Fleet', labelFa: 'کانتینرهای داکر' },
                    { id: 'security', labelEn: 'Security & SSH', labelFa: 'امنیت و SSH' },
                    { id: 'network', labelEn: 'Network & Routing', labelFa: 'شبکه و مسیریابی' },
                    { id: 'maintenance', labelEn: 'Maintenance & OS', labelFa: 'نگهداری و سیستم‌عامل' },
                    { id: 'services', labelEn: 'Services & Systemd', labelFa: 'سرویس‌ها' },
                    { id: 'custom', labelEn: 'Ad-hoc Bash', labelFa: 'اسکریپت سفارشی' }
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                        categoryFilter === cat.id
                          ? isLightMode
                            ? 'bg-cyan-600 text-white shadow-sm'
                            : 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                          : isLightMode
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      {isEn ? cat.labelEn : cat.labelFa}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-72">
                  <Search
                    className={`w-4 h-4 absolute top-2.5 ${
                      isEn ? 'left-3' : 'right-3'
                    } ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}
                  />
                  <input
                    type="text"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder={isEn ? 'Search templates...' : 'جستجوی قالب‌ها...'}
                    className={`w-full text-xs rounded-xl py-2 ${
                      isEn ? 'pl-9 pr-3' : 'pr-9 pl-3'
                    } border outline-none transition-colors ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-cyan-500'
                        : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-cyan-500'
                    }`}
                  />
                </div>
              </div>

              {/* Template Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredTemplates.map((tpl) => {
                  const isSelected = tpl.id === selectedTemplateId;
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => handleSelectTemplate(tpl.id)}
                      className={`p-4 rounded-xl border text-start cursor-pointer transition-all relative flex flex-col justify-between ${
                        isSelected
                          ? isLightMode
                            ? 'bg-cyan-50/80 border-cyan-500 ring-2 ring-cyan-500/20 shadow-md'
                            : 'bg-cyan-950/30 border-cyan-500 ring-2 ring-cyan-500/20 shadow-lg'
                          : isLightMode
                          ? 'bg-white hover:bg-slate-50 border-slate-200'
                          : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div
                            className={`p-2 rounded-lg flex items-center justify-center ${
                              isSelected
                                ? isLightMode
                                  ? 'bg-cyan-600 text-white'
                                  : 'bg-cyan-500 text-slate-950'
                                : isLightMode
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-slate-800 text-cyan-400'
                            }`}
                          >
                            {renderTemplateIcon(tpl.icon, 'w-4 h-4')}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {tpl.is_dangerous && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-500 border border-rose-500/30">
                                {isEn ? 'Dangerous' : 'عملیات حساس'}
                              </span>
                            )}
                            {/* Standard 3-Part Field Info Tooltip (Rule 7) */}
                            <InfoTooltipPopover
                              title={isEn ? tpl.title_en : tpl.title}
                              what={isEn ? tpl.info_what_en : tpl.info_what_fa}
                              why={isEn ? tpl.info_why_en : tpl.info_why_fa}
                              example={isEn ? tpl.info_example_en : tpl.info_example_fa}
                              isEn={isEn}
                            />
                          </div>
                        </div>

                        <h3 className="text-sm font-bold mb-1 leading-snug">
                          {isEn ? tpl.title_en : tpl.title}
                        </h3>
                        <p
                          className={`text-xs line-clamp-2 leading-relaxed ${
                            isLightMode ? 'text-slate-600' : 'text-slate-400'
                          }`}
                        >
                          {isEn ? tpl.description_en : tpl.description}
                        </p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-dashed flex items-center justify-between text-[11px] border-inherit">
                        <span className={isLightMode ? 'text-slate-500' : 'text-slate-500'}>
                          {isEn
                            ? `${tpl.parameters.length} parameter${tpl.parameters.length === 1 ? '' : 's'}`
                            : `${tpl.parameters.length} پارامتر تنظیماتی`}
                        </span>
                        <span className="font-mono text-cyan-500 text-[10px]">
                          ~{tpl.default_timeout_sec}s timeout
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Template Parameters Configuration Form */}
              {currentTemplate && (
                <div
                  className={`p-5 rounded-xl border ${
                    isLightMode
                      ? 'bg-slate-50/80 border-slate-200'
                      : 'bg-slate-900/50 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-inherit">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-500" />
                      <h4 className="text-sm font-bold">
                        {isEn
                          ? `Parameters for: ${currentTemplate.title_en}`
                          : `تنظیم مقادیر و پارامترهای قالب: ${currentTemplate.title}`}
                      </h4>
                    </div>

                    <span className="text-xs text-cyan-500 font-mono">
                      ID: {currentTemplate.id}
                    </span>
                  </div>

                  {currentTemplate.parameters.length === 0 ? (
                    <div className="py-4 text-center text-xs text-slate-500">
                      {isEn
                        ? 'This template requires no additional parameters. It executes standard distro-specific commands automatically.'
                        : 'این قالب نیاز به پارامتر ورودی ندارد و دستورات استاندارد ممیزی سیستم را اجرا خواهد کرد.'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {currentTemplate.parameters.map((param) => {
                        const val = parameters[param.name];
                        return (
                          <div
                            key={param.name}
                            className={`space-y-1.5 ${
                              param.type === 'textarea' ? 'md:col-span-2' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold flex items-center gap-1.5">
                                <span>{isEn ? param.labelEn : param.labelFa}</span>
                                {param.required && <span className="text-rose-500 font-bold">*</span>}
                              </label>

                              {/* 3-Part Field Info Tooltip (Rule 7) */}
                              {(param.info_what_fa || param.info_what_en) && (
                                <InfoTooltipPopover
                                  title={isEn ? param.labelEn : param.labelFa}
                                  what={isEn ? param.info_what_en || '' : param.info_what_fa || ''}
                                  why={isEn ? param.info_why_en || '' : param.info_why_fa || ''}
                                  example={isEn ? param.info_example_en || '' : param.info_example_fa || ''}
                                  isEn={isEn}
                                />
                              )}
                            </div>

                            {/* Render Parameter Input Types */}
                            {param.type === 'boolean' ? (
                              <label className="flex items-center gap-2 text-xs cursor-pointer py-1.5">
                                <input
                                  type="checkbox"
                                  checked={Boolean(val)}
                                  onChange={(e) =>
                                    setParameters((prev) => ({
                                      ...prev,
                                      [param.name]: e.target.checked
                                    }))
                                  }
                                  className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 border-slate-300"
                                />
                                <span className={isLightMode ? 'text-slate-700' : 'text-slate-300'}>
                                  {isEn ? 'Enable / Active' : 'فعال‌سازی این گزینه'}
                                </span>
                              </label>
                            ) : param.type === 'select' ? (
                              <select
                                value={val || ''}
                                onChange={(e) =>
                                  setParameters((prev) => ({
                                    ...prev,
                                    [param.name]: e.target.value
                                  }))
                                }
                                className={`w-full text-xs rounded-xl px-3 py-2 border outline-none ${
                                  isLightMode
                                    ? 'bg-white border-slate-300 text-slate-800'
                                    : 'bg-slate-950 border-slate-800 text-slate-100'
                                }`}
                              >
                                {param.options?.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {isEn ? opt.labelEn : opt.labelFa}
                                  </option>
                                ))}
                              </select>
                            ) : param.type === 'textarea' ? (
                              <textarea
                                rows={3}
                                value={val || ''}
                                onChange={(e) =>
                                  setParameters((prev) => ({
                                    ...prev,
                                    [param.name]: e.target.value
                                  }))
                                }
                                placeholder={param.placeholder}
                                className={`w-full text-xs rounded-xl p-3 border outline-none font-mono ${
                                  isLightMode
                                    ? 'bg-white border-slate-300 text-slate-800'
                                    : 'bg-slate-950 border-slate-800 text-slate-100'
                                }`}
                              />
                            ) : (
                              <input
                                type={param.type === 'number' ? 'number' : 'text'}
                                value={val !== undefined ? val : ''}
                                onChange={(e) =>
                                  setParameters((prev) => ({
                                    ...prev,
                                    [param.name]:
                                      param.type === 'number' ? Number(e.target.value) : e.target.value
                                  }))
                                }
                                placeholder={param.placeholder}
                                className={`w-full text-xs rounded-xl px-3 py-2 border outline-none ${
                                  isLightMode
                                    ? 'bg-white border-slate-300 text-slate-800'
                                    : 'bg-slate-950 border-slate-800 text-slate-100'
                                }`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: TARGET LINUX SERVERS SELECTION */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold">
                    {isEn ? 'Select Target Linux Servers' : 'انتخاب سرورهای لینوکس هدف'}
                  </h3>
                  <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn
                      ? `Select which Linux servers should receive this configuration (${selectedServerIds.size} of ${linuxServers.length} selected)`
                      : `سرورهایی که این پیکربندی باید روی آنها اجرا شود را انتخاب کنید (${selectedServerIds.size} از ${linuxServers.length} سرور انتخاب شده)`}
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                        : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                    }`}
                  >
                    {isEn ? 'Select All' : 'انتخاب همه'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAllFiltered}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                        : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                    }`}
                  >
                    {isEn ? 'Deselect All' : 'لغو انتخاب'}
                  </button>
                </div>
              </div>

              {/* Distro Filters & Search */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                  <button
                    type="button"
                    onClick={() => setDistroFilter('all')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                      distroFilter === 'all'
                        ? 'bg-cyan-600 text-white'
                        : isLightMode
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-slate-900 text-slate-400'
                    }`}
                  >
                    {isEn ? 'All Distros' : 'همه توزیع‌ها'}
                  </button>
                  {availableDistros.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDistroFilter(d)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                        distroFilter === d
                          ? 'bg-cyan-600 text-white'
                          : isLightMode
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-slate-900 text-slate-400'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search
                    className={`w-3.5 h-3.5 absolute top-2.5 ${
                      isEn ? 'left-3' : 'right-3'
                    } text-slate-400`}
                  />
                  <input
                    type="text"
                    value={serverSearch}
                    onChange={(e) => setServerSearch(e.target.value)}
                    placeholder={isEn ? 'Filter servers...' : 'فیلتر سرورها...'}
                    className={`w-full text-xs rounded-xl py-1.5 ${
                      isEn ? 'pl-8 pr-3' : 'pr-8 pl-3'
                    } border outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-200 text-slate-900'
                        : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  />
                </div>
              </div>

              {/* Server Table / List */}
              <div
                className={`rounded-xl border overflow-hidden ${
                  isLightMode ? 'border-slate-200' : 'border-slate-800'
                }`}
              >
                <div
                  className={`grid grid-cols-12 px-4 py-2.5 text-xs font-bold border-b ${
                    isLightMode ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="col-span-1 flex items-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredServers.length > 0 &&
                        filteredServers.every((s) => selectedServerIds.has(s.id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) handleSelectAllFiltered();
                        else handleDeselectAllFiltered();
                      }}
                      className="w-4 h-4 rounded text-cyan-600"
                    />
                  </div>
                  <div className="col-span-4">{isEn ? 'Server Name & Hostname' : 'نام سرور و هاست‌نیم'}</div>
                  <div className="col-span-3">{isEn ? 'IP & SSH Port' : 'آدرس IP و پورت SSH'}</div>
                  <div className="col-span-2">{isEn ? 'Distribution' : 'توزیع لینوکس'}</div>
                  <div className="col-span-2 text-end">{isEn ? 'Status' : 'وضعیت'}</div>
                </div>

                <div className="divide-y divide-inherit max-h-80 overflow-y-auto">
                  {filteredServers.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      {isEn ? 'No Linux servers match your filter.' : 'هیچ سرور لینوکسی مطابق فیلتر یافت نشد.'}
                    </div>
                  ) : (
                    filteredServers.map((srv) => {
                      const isSelected = selectedServerIds.has(srv.id);
                      return (
                        <div
                          key={srv.id}
                          onClick={() => handleToggleServer(srv.id)}
                          className={`grid grid-cols-12 px-4 py-3 text-xs items-center cursor-pointer transition-colors ${
                            isSelected
                              ? isLightMode
                                ? 'bg-cyan-50/50 hover:bg-cyan-50'
                                : 'bg-cyan-950/20 hover:bg-cyan-950/30'
                              : isLightMode
                              ? 'hover:bg-slate-50'
                              : 'hover:bg-slate-900/50'
                          }`}
                        >
                          <div className="col-span-1 flex items-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="w-4 h-4 rounded text-cyan-600 cursor-pointer"
                            />
                          </div>

                          <div className="col-span-4 flex items-center gap-2">
                            <Server className="w-4 h-4 text-cyan-500 shrink-0" />
                            <div>
                              <div className="font-semibold">{srv.name}</div>
                              {srv.hostname && (
                                <div className="text-[11px] text-slate-500 font-mono">
                                  {srv.hostname}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="col-span-3 font-mono text-[11px]">
                            <span>{srv.ip}</span>
                            <span className="text-slate-400">:{srv.ssh_port || 22}</span>
                          </div>

                          <div className="col-span-2">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                (srv.os_distro || '').toLowerCase().includes('ubuntu')
                                  ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30'
                                  : (srv.os_distro || '').toLowerCase().includes('debian')
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                  : (srv.os_distro || '').toLowerCase().includes('rocky') ||
                                    (srv.os_distro || '').toLowerCase().includes('rhel')
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                              }`}
                            >
                              {srv.os_distro || 'Generic Linux'}
                            </span>
                          </div>

                          <div className="col-span-2 text-end">
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                srv.status === 'online'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-amber-500/10 text-amber-400'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  srv.status === 'online' ? 'bg-emerald-400' : 'bg-amber-400'
                                }`}
                              />
                              {srv.status || 'unknown'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: DISTRIBUTION-AWARE LIVE COMMAND PREVIEW */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold">
                    {isEn ? 'Distribution-Aware Command Preview' : 'پیش‌نمایش دستورات بر اساس توزیع سیستم‌عامل'}
                  </h3>
                  <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn
                      ? 'Review the exact commands that will execute on each remote server based on its Linux flavor.'
                      : 'دستورات دقیقی که متناسب با توزیع لینوکس روی هر سرور اجرا خواهد شد را بررسی کنید.'}
                  </p>
                </div>

                <div className="text-xs font-mono px-3 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {previewItems.length} {isEn ? 'Servers Ready' : 'سرور آماده اجرا'}
                </div>
              </div>

              {previewError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{previewError}</span>
                </div>
              )}

              {/* Per-Server Accordion List */}
              <div className="space-y-3">
                {previewItems.map((item) => {
                  const isExpanded = expandedPreviewServerId === item.serverId;
                  return (
                    <div
                      key={item.serverId}
                      className={`rounded-xl border transition-all ${
                        isLightMode
                          ? 'bg-slate-50/70 border-slate-200'
                          : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div
                        onClick={() =>
                          setExpandedPreviewServerId((prev) =>
                            prev === item.serverId ? null : item.serverId
                          )
                        }
                        className="flex items-center justify-between p-4 cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-3">
                          <Server className="w-4 h-4 text-cyan-500" />
                          <div>
                            <div className="text-xs font-bold">{item.serverName}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {item.serverIp} • {item.osDistro} ({item.distroFamily})
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-cyan-500">
                            {item.steps.length} {isEn ? 'Step(s)' : 'گام اجرایی'}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 space-y-2 border-t border-inherit">
                          {item.steps.map((st, sIdx) => (
                            <div
                              key={sIdx}
                              className={`p-3 rounded-lg border text-xs font-mono space-y-1.5 ${
                                isLightMode
                                  ? 'bg-white border-slate-200'
                                  : 'bg-slate-950 border-slate-800'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[11px] text-slate-400">
                                <span>
                                  {isEn ? st.descriptionEn : st.descriptionFa}
                                </span>
                                <span className="text-cyan-500 font-sans text-[10px]">
                                  {st.distro}
                                </span>
                              </div>
                              <div className="text-cyan-400 select-all font-mono break-all">
                                $ {st.command}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Execution Options & Safeguards */}
              <div
                className={`p-4 rounded-xl border space-y-4 ${
                  isLightMode
                    ? 'bg-slate-100/70 border-slate-200'
                    : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold block mb-1">
                      {isEn ? 'Per-Node Timeout (Sec)' : 'تایم‌اوت هر سرور (ثانیه)'}
                    </label>
                    <input
                      type="number"
                      value={timeoutSec}
                      onChange={(e) => setTimeoutSec(Number(e.target.value))}
                      className={`w-full text-xs rounded-xl px-3 py-2 border outline-none ${
                        isLightMode
                          ? 'bg-white border-slate-300'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold block mb-1">
                      {isEn ? 'Inter-Server Delay (ms)' : 'مکث بین سرورها (میلی‌ثانیه)'}
                    </label>
                    <input
                      type="number"
                      value={delayMs}
                      onChange={(e) => setDelayMs(Number(e.target.value))}
                      className={`w-full text-xs rounded-xl px-3 py-2 border outline-none ${
                        isLightMode
                          ? 'bg-white border-slate-300'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold block mb-1">
                      {isEn ? 'Ephemeral SSH Password (Optional)' : 'گذرواژه موقت SSH (اختیاری)'}
                    </label>
                    <input
                      type="password"
                      value={ephemeralPassword}
                      onChange={(e) => setEphemeralPassword(e.target.value)}
                      placeholder={isEn ? 'If prompt required' : 'در صورت نیاز به رمز عبور'}
                      className={`w-full text-xs rounded-xl px-3 py-2 border outline-none ${
                        isLightMode
                          ? 'bg-white border-slate-300'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    />
                  </div>
                </div>

                {/* Dangerous Confirmation */}
                {currentTemplate?.is_dangerous && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                    <div className="flex items-center gap-2 text-rose-500 font-bold text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>
                        {isEn
                          ? 'Dangerous Fleet Action: Confirmation Required'
                          : 'عملیات حساس در سطح ناوگان: تایید صریح الزامی است'}
                      </span>
                    </div>
                    <p className="text-[11px] text-rose-400">
                      {isEn
                        ? `Please type "${currentTemplate.confirmation_keyword}" below to enable execution.`
                        : `جهت فعال‌سازی دکمه اجرا، عبارت «${currentTemplate.confirmation_keyword}» را در کادر زیر تایپ نمایید.`}
                    </p>
                    <input
                      type="text"
                      value={dangerConfirmation}
                      onChange={(e) => setDangerConfirmation(e.target.value)}
                      placeholder={currentTemplate.confirmation_keyword}
                      className="w-full text-xs rounded-lg px-3 py-2 border border-rose-500/40 bg-slate-950 text-white font-mono uppercase"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: FLEET EXECUTION & LIVE TELEMETRY */}
          {currentStep === 4 && (
            <div className="space-y-5">
              {/* Progress Bar & KPI Cards */}
              <div
                className={`p-4 rounded-xl border ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    {isExecuting ? (
                      <RefreshCw className="w-4 h-4 text-cyan-500 animate-spin" />
                    ) : jobStatus?.status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                    )}
                    <span>
                      {isExecuting
                        ? isEn
                          ? `Executing: ${jobStatus?.currentStepName || 'Running...'}`
                          : `در حال اجرا: ${jobStatus?.currentStepName || 'در صف...'}`
                        : isEn
                        ? `Execution ${jobStatus?.status || 'Finished'}`
                        : `وضعیت عملیات: ${jobStatus?.status || 'پایان یافته'}`}
                    </span>
                  </div>

                  <span className="text-xs font-mono font-bold text-cyan-500">
                    {jobStatus?.percentage || 0}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden mb-4">
                  <div
                    className="h-full bg-cyan-500 transition-all duration-300"
                    style={{ width: `${jobStatus?.percentage || 0}%` }}
                  />
                </div>

                {/* Summary counters */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div
                    className={`p-2 rounded-lg border ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    <div className="text-slate-400 text-[10px]">{isEn ? 'Total' : 'کل'}</div>
                    <div className="font-bold text-sm">{jobStatus?.totalServers || selectedServerIds.size}</div>
                  </div>
                  <div
                    className={`p-2 rounded-lg border ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    <div className="text-emerald-400 text-[10px]">{isEn ? 'Success' : 'موفق'}</div>
                    <div className="font-bold text-sm text-emerald-400">{jobStatus?.successCount || 0}</div>
                  </div>
                  <div
                    className={`p-2 rounded-lg border ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    <div className="text-rose-400 text-[10px]">{isEn ? 'Failed' : 'ناموفق'}</div>
                    <div className="font-bold text-sm text-rose-400">{jobStatus?.failedCount || 0}</div>
                  </div>
                  <div
                    className={`p-2 rounded-lg border ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    <div className="text-cyan-400 text-[10px]">{isEn ? 'Completed' : 'تکمیل‌شده'}</div>
                    <div className="font-bold text-sm text-cyan-400">{jobStatus?.completedServers || 0}</div>
                  </div>
                </div>
              </div>

              {/* Server Results & Terminal Output Inspector */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Server Tabs Sidebar */}
                <div className="lg:col-span-4 space-y-1.5 max-h-96 overflow-y-auto pr-1">
                  {Object.values(jobStatus?.results || {}).map((res) => {
                    const isTabActive = activeTabServerId === res.serverId;
                    return (
                      <div
                        key={res.serverId}
                        onClick={() => setActiveTabServerId(res.serverId)}
                        className={`p-3 rounded-xl border text-xs cursor-pointer transition-colors flex items-center justify-between ${
                          isTabActive
                            ? isLightMode
                              ? 'bg-cyan-50 border-cyan-500'
                              : 'bg-cyan-950/40 border-cyan-500'
                            : isLightMode
                            ? 'bg-white hover:bg-slate-50 border-slate-200'
                            : 'bg-slate-900/50 hover:bg-slate-900 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {res.status === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : res.status === 'failed' ? (
                            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                          ) : (
                            <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
                          )}
                          <div>
                            <div className="font-bold">{res.serverName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {res.serverIp}
                            </div>
                          </div>
                        </div>

                        <span className="text-[10px] font-mono text-slate-400">
                          {res.durationMs ? `${res.durationMs}ms` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Active Server Terminal / Logs View */}
                <div className="lg:col-span-8 flex flex-col">
                  {(() => {
                    const activeResult = activeTabServerId
                      ? jobStatus?.results[activeTabServerId]
                      : null;

                    return (
                      <div
                        className={`flex-1 rounded-xl border flex flex-col overflow-hidden min-h-[320px] ${
                          isLightMode
                            ? 'bg-slate-950 border-slate-800 text-slate-100'
                            : 'bg-slate-950 border-slate-800 text-slate-100'
                        }`}
                      >
                        {/* Terminal Window Header */}
                        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/80 text-xs">
                          <div className="flex items-center gap-2 font-mono">
                            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                            <span>
                              {activeResult
                                ? `${activeResult.serverName} (${activeResult.serverIp})`
                                : isEn
                                ? 'Live Log Stream'
                                : 'جریان لاگ‌های زنده'}
                            </span>
                          </div>

                          {activeResult?.rawOutput && (
                            <button
                              type="button"
                              onClick={() => handleCopy(activeResult.rawOutput || '', activeResult.serverId)}
                              className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 cursor-pointer"
                            >
                              {copiedText === activeResult.serverId ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>{isEn ? 'Copied' : 'کپی شد'}</span>
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

                        {/* Terminal Body */}
                        <div className="p-4 font-mono text-xs overflow-y-auto max-h-80 space-y-2 select-text">
                          {activeResult?.rawOutput ? (
                            <pre className="whitespace-pre-wrap break-all text-slate-300 font-mono text-[11px] leading-relaxed">
                              {activeResult.rawOutput}
                            </pre>
                          ) : (
                            <div className="space-y-1.5 text-[11px]">
                              {jobStatus?.logs.map((lg, lIdx) => (
                                <div key={lIdx} className="flex items-start gap-2">
                                  <span className="text-slate-500 shrink-0">[{lg.timeStr}]</span>
                                  <span
                                    className={
                                      lg.level === 'error'
                                        ? 'text-rose-400'
                                        : lg.level === 'success'
                                        ? 'text-emerald-400'
                                        : lg.level === 'warning'
                                        ? 'text-amber-400'
                                        : 'text-cyan-300'
                                    }
                                  >
                                    {isEn ? lg.messageEn : lg.messageFa}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* MODAL FOOTER WITH NAVIGATION BUTTONS                      */}
        {/* ========================================================= */}
        <div
          className={`flex items-center justify-between px-6 py-3.5 border-t shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div>
            {currentStep > 1 && currentStep < 4 && (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => (prev > 1 ? ((prev - 1) as any) : 1))}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  isLightMode
                    ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                }`}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{isEn ? 'Back' : 'بازگشت'}</span>
              </button>
            )}

            {currentStep === 4 && jobStatus?.status === 'completed' && (
              <button
                type="button"
                onClick={handleExportSummary}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  isLightMode
                    ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isEn ? 'Export JSON Report' : 'دریافت خروجی گزارش'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentStep === 1 && (
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                disabled={!selectedTemplateId}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                <span>{isEn ? 'Next: Target Servers' : 'گام بعد: انتخاب سرورها'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {currentStep === 2 && (
              <button
                type="button"
                onClick={handleProceedToPreview}
                disabled={selectedServerIds.size === 0 || loadingPreview}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {loadingPreview ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <span>{isEn ? 'Next: Preview Commands' : 'گام بعد: پیش‌نمایش دستورات'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}

            {currentStep === 3 && (
              <button
                type="button"
                onClick={handleStartExecution}
                disabled={
                  previewItems.length === 0 ||
                  (currentTemplate?.is_dangerous &&
                    dangerConfirmation.trim().toUpperCase() !==
                      currentTemplate.confirmation_keyword.toUpperCase())
                }
                className={`flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer disabled:opacity-50 ${
                  currentTemplate?.is_dangerous
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-cyan-600 hover:bg-cyan-500'
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                <span>
                  {isEn
                    ? `Execute on ${previewItems.length} Server(s)`
                    : `اجرای پیکربندی روی ${previewItems.length} سرور`}
                </span>
              </button>
            )}

            {currentStep === 4 && (
              <>
                {isExecuting ? (
                  <button
                    type="button"
                    onClick={handleCancelJob}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Cancel Execution' : 'لغو عملیات'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Finish & Close' : 'تکمیل و بستن'}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
