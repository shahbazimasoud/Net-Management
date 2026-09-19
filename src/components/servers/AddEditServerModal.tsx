import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Server,
  Terminal,
  Monitor,
  Shield,
  Key,
  Layers,
  Tags,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Cpu,
  Globe,
  Settings,
  Lock,
  Unlock
} from 'lucide-react';
import { RemoteServer } from '../../types';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface AddEditServerModalProps {
  isOpen: boolean;
  serverToEdit?: RemoteServer | null;
  onClose: () => void;
  onMinimize: () => void;
  onSave: (serverData: Partial<RemoteServer>) => Promise<void>;
  isLightMode?: boolean;
  isEn?: boolean;
}

const COMMON_TAG_SUGGESTIONS = [
  'k8s',
  'prod',
  'staging',
  'dev',
  'dmz',
  'database',
  'postgres',
  'mysql',
  'nginx',
  'docker',
  'redis',
  'monitoring',
  'prometheus',
  'active-directory',
  'domain-controller',
  'backup-target',
  'ci-runner',
  'web-tier',
  'api-gateway',
  'ansible-managed'
];

const SERVER_CATEGORIES = [
  'Infrastructure',
  'Database',
  'Kubernetes',
  'Web / App',
  'Monitoring',
  'Active Directory',
  'General'
];

const ENVIRONMENTS = ['Production', 'Staging', 'Development', 'DMZ'];

export const AddEditServerModal: React.FC<AddEditServerModalProps> = ({
  isOpen,
  serverToEdit,
  onClose,
  onMinimize,
  onSave,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [hostname, setHostname] = useState('');
  const [ip, setIp] = useState('');
  const [osType, setOsType] = useState<'linux' | 'windows'>('linux');
  const [osDistro, setOsDistro] = useState('Ubuntu 24.04 LTS');
  const [category, setCategory] = useState('Infrastructure');
  const [environment, setEnvironment] = useState('Production');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');

  // Linux-specific
  const [sshPort, setSshPort] = useState(22);
  const [sshUsername, setSshUsername] = useState('root');
  const [sshPassword, setSshPassword] = useState('');
  const [defaultShell, setDefaultShell] = useState<'bash' | 'zsh' | 'sh'>('bash');

  // Windows-specific
  const [winProtocol, setWinProtocol] = useState<'rdp' | 'powershell' | 'winrm' | 'ssh'>('rdp');
  const [winPort, setWinPort] = useState(3389);
  const [winDomain, setWinDomain] = useState('');
  const [winUsername, setWinUsername] = useState('Administrator');
  const [winPassword, setWinPassword] = useState('');

  useEffect(() => {
    if (serverToEdit) {
      setName(serverToEdit.name || '');
      setHostname(serverToEdit.hostname || '');
      setIp(serverToEdit.ip || '');
      setOsType(serverToEdit.os_type || 'linux');
      setOsDistro(serverToEdit.os_distro || (serverToEdit.os_type === 'windows' ? 'Windows Server 2022' : 'Ubuntu 24.04 LTS'));
      setCategory(serverToEdit.category || 'Infrastructure');
      setEnvironment(serverToEdit.environment || 'Production');
      setDescription(serverToEdit.description || '');
      setTags(Array.isArray(serverToEdit.tags) ? [...serverToEdit.tags] : []);
      setSshPort(serverToEdit.ssh_port || 22);
      setSshUsername(serverToEdit.ssh_username || 'root');
      setSshPassword(serverToEdit.ssh_password || '');
      setDefaultShell(serverToEdit.default_shell || 'bash');
      setWinProtocol(serverToEdit.win_protocol || 'rdp');
      setWinPort(serverToEdit.win_port || (serverToEdit.win_protocol === 'winrm' ? 5985 : 3389));
      setWinDomain(serverToEdit.win_domain || '');
      setWinUsername(serverToEdit.win_username || 'Administrator');
      setWinPassword(serverToEdit.win_password || '');
    } else {
      // Defaults for new
      setName('');
      setHostname('');
      setIp('');
      setOsType('linux');
      setOsDistro('Ubuntu 24.04 LTS');
      setCategory('Infrastructure');
      setEnvironment('Production');
      setDescription('');
      setTags(['prod']);
      setSshPort(22);
      setSshUsername('root');
      setSshPassword('');
      setDefaultShell('bash');
      setWinProtocol('rdp');
      setWinPort(3389);
      setWinDomain('');
      setWinUsername('Administrator');
      setWinPassword('');
    }
    setError(null);
  }, [serverToEdit, isOpen]);

  // Handle OS type switch defaults
  const handleOsChange = (type: 'linux' | 'windows') => {
    setOsType(type);
    if (type === 'windows') {
      if (!serverToEdit) {
        setOsDistro('Windows Server 2022');
        setWinPort(3389);
      }
    } else {
      if (!serverToEdit) {
        setOsDistro('Ubuntu 24.04 LTS');
        setSshPort(22);
      }
    }
  };

  const handleAddTag = (tagToAdd: string) => {
    const trimmed = tagToAdd.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    if (!trimmed || tags.includes(trimmed)) return;
    setTags([...tags, trimmed]);
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(isEn ? 'Server Name is required.' : 'نام سرور الزامی است.');
      return;
    }
    if (!ip.trim()) {
      setError(isEn ? 'IP Address or FQDN is required.' : 'آدرس IP یا FQDN الزامی است.');
      return;
    }

    setIsSaving(true);
    try {
      const payload: Partial<RemoteServer> = {
        id: serverToEdit?.id,
        name: name.trim(),
        hostname: hostname.trim() || undefined,
        ip: ip.trim(),
        os_type: osType,
        os_distro: osDistro.trim() || undefined,
        category,
        environment,
        description: description.trim() || undefined,
        notes: description.trim() || undefined,
        tags,
        status: serverToEdit?.status || 'online',
        ...(osType === 'linux'
          ? {
              ssh_port: Number(sshPort) || 22,
              ssh_username: sshUsername.trim() || 'root',
              ssh_password: sshPassword,
              default_shell: defaultShell,
            }
          : {
              win_protocol: winProtocol,
              win_port: Number(winPort) || (winProtocol === 'winrm' ? 5985 : 3389),
              win_domain: winDomain.trim() || undefined,
              win_username: winUsername.trim() || 'Administrator',
              win_password: winPassword,
            }),
      };

      await onSave(payload);
      onClose();
    } catch (err: any) {
      setError(err.message || (isEn ? 'Failed to save server.' : 'خطا در ذخیره سرور.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`fixed z-[9999] flex flex-col items-center justify-center ${
        isMaximized
          ? 'top-0 left-0 right-0 bottom-8 p-0'
          : 'inset-0 p-2 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto'
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLocked) {
          onClose();
        }
      }}
    >
      <div
        className={`flex flex-col overflow-hidden transition-all duration-200 shadow-2xl my-auto ${
          isMaximized
            ? 'w-full h-full rounded-none border-none'
            : 'w-full max-w-2xl max-h-[94vh] sm:max-h-[90vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-900 shadow-slate-900/20'
            : 'bg-slate-950 border-slate-800 text-slate-100 shadow-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Universal Triad Controls & Lock */}
        <div
          className={`flex items-center justify-between px-4 py-2.5 sm:px-5 sm:py-2.5 border-b shrink-0 ${
            isLightMode ? 'bg-slate-50/90 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`p-1.5 rounded-lg border ${
                osType === 'linux'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
              }`}
            >
              {osType === 'linux' ? <Terminal className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight">
                  {serverToEdit
                    ? isEn
                      ? `Edit Server: ${serverToEdit.name}`
                      : `ویرایش سرور ریموت: ${serverToEdit.name}`
                    : isEn
                    ? 'Register Remote Server'
                    : 'ثبت سرور ریموت جدید'}
                </h3>
                <span
                  className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold border ${
                    osType === 'linux'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                  }`}
                >
                  {osType.toUpperCase()}
                </span>
              </div>
              <p className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Configure remote node access, credentials, environment, and automation tags'
                  : 'پیکربندی آدرس دسترسی، احراز هویت، محیط استقرار و تگ‌های اتوماسیون'}
              </p>
            </div>
          </div>

          {/* Triad Control Buttons + Lock Toggle */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsLocked(!isLocked)}
              title={
                isLocked
                  ? isEn
                    ? 'Window locked (click to unlock background closing)'
                    : 'پنجره قفل است (کلیک برای بازگشایی)'
                  : isEn
                  ? 'Lock window (prevent accidental background close)'
                  : 'قفل پنجره (جلوگیری از بسته شدن اتفاقی)'
              }
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isLocked
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : isLightMode
                  ? 'border-slate-200 text-slate-500 hover:bg-slate-100'
                  : 'border-slate-800 text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
              }`}
            >
              {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={
                isMaximized
                  ? isEn
                    ? 'Exit Fullscreen'
                    : 'خروج از تمام‌صفحه'
                  : isEn
                  ? 'Fullscreen'
                  : 'تمام‌صفحه'
              }
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                  : 'border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={onMinimize}
              title={isEn ? 'Minimize to Dock' : 'مینیمایز به نوار ابزار'}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                  : 'border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 hover:bg-rose-100 text-rose-600'
                  : 'border-slate-800 hover:bg-rose-950/50 text-rose-400 hover:text-rose-300'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body - Compact & Sleek Layout */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* OS Selector Tabs - Compact segmented cards */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {isEn ? 'Architecture & Operating System' : 'معماری و سیستم‌عامل سرور'}
                </span>
                <FieldInfoTooltip
                  title={isEn ? 'Operating System' : 'سیستم عامل'}
                  whatIsIt={
                    isEn
                      ? 'Determines communication protocol, terminal shells (Bash/Zsh), and remote access features.'
                      : 'پروتکل ارتباطی، خط فرمان‌های لینوکسی (Bash/Zsh) و دسترسی ریموت را مشخص می‌کند.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Allows tailored automation triggers, SSH shell launchers for Linux and RDP/PowerShell workflows for Windows.'
                      : 'امکان اتصال به شل‌های لینوکسی و اتوماسیون‌های ویندوزی بر اساس سیستم‌عامل را فراهم می‌سازد.'
                  }
                  example={isEn ? 'Linux (Ubuntu/RHEL) or Windows Server' : 'لینوکس یا ویندوز سرور'}
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleOsChange('linux')}
                className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  osType === 'linux'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30 shadow-xs'
                    : isLightMode
                    ? 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 shrink-0">
                  <Terminal className="w-4 h-4" />
                </div>
                <div className="text-start">
                  <div className="font-bold">{isEn ? 'Linux Server' : 'سرور لینوکسی'}</div>
                  <div className="text-[10px] opacity-75 font-mono">SSH • Bash • Zsh</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleOsChange('windows')}
                className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  osType === 'windows'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/30 shadow-xs'
                    : isLightMode
                    ? 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                <div className="p-1.5 rounded-lg bg-blue-500/15 text-blue-400 shrink-0">
                  <Monitor className="w-4 h-4" />
                </div>
                <div className="text-start">
                  <div className="font-bold">{isEn ? 'Windows Server' : 'سرور ویندوزی'}</div>
                  <div className="text-[10px] opacity-75 font-mono">RDP • PowerShell • WinRM</div>
                </div>
              </button>
            </div>
          </div>

          {/* General Server Details Card */}
          <div
            className={`p-3 rounded-xl border space-y-2.5 ${
              isLightMode ? 'bg-slate-50/60 border-slate-200' : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <Server className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isEn ? 'General Host Information' : 'مشخصات اصلی میزبان'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {/* Server Name */}
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <label className="font-semibold text-slate-300">
                    {isEn ? 'Server Name *' : 'نام سرور *'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Server Display Name' : 'نام نمایشی سرور'}
                    whatIsIt={isEn ? 'Friendly descriptive label for the server in inventory.' : 'نام مشخص و قابل فهم سرور در فهرست موجودی.'}
                    whyNeeded={isEn ? 'Easily identify servers in dashboard, automation scripts, and logs.' : 'شناسایی آسان سرور در داشبورد، اتوماسیون و لاگ‌ها.'}
                    example={isEn ? 'K8s Master 01, DB-PostgreSQL-Prod, DC-Corp-01' : 'سرور دیتابیس، کنترلر کوبرنتیز'}
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isEn ? 'e.g. K8s-Control-Plane-01' : 'مثال: سرور مرکزی دیتابیس'}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none transition-all ${
                    isLightMode
                      ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                      : 'bg-slate-900 border-slate-700/80 text-slate-100 focus:border-cyan-500'
                  }`}
                  required
                />
              </div>

              {/* IP Address */}
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <label className="font-semibold text-slate-300">
                    {isEn ? 'IP Address / Hostname *' : 'آدرس IP یا FQDN *'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Management IP' : 'آدرس آی‌پی مدیریتی'}
                    whatIsIt={isEn ? 'IPv4, IPv6, or resolvable DNS name used for connectivity.' : 'آدرس IPv4 یا هاست‌نیم شبکه جهت برقراری اتصال ریموت.'}
                    whyNeeded={isEn ? 'Target address for remote connection and reachability probes.' : 'مقصد اتصال شل، ریموت دسکتاپ و پایش سلامت پورت.'}
                    example="192.168.10.50, 10.0.100.22, srv01.lan"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
                <input
                  type="text"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="192.168.10.50"
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none transition-all ${
                    isLightMode
                      ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                      : 'bg-slate-900 border-slate-700/80 text-slate-100 focus:border-cyan-500'
                  }`}
                  required
                />
              </div>

              {/* FQDN / Hostname */}
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <label className="font-semibold text-slate-300">
                    {isEn ? 'Internal Hostname (FQDN)' : 'نام هاست داخلی (FQDN)'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Hostname / FQDN' : 'نام هاست'}
                    whatIsIt={isEn ? 'Fully qualified domain name of the machine.' : 'نام کامل سیستم در شبکه و دامین داخلی.'}
                    whyNeeded={isEn ? 'Useful for Kerberos, SSL/TLS, and automated DNS targeting.' : 'کاربرد در احراز هویت کربروس و هدایت نام‌ها.'}
                    example="srv-k8s-cp01.prod.corp"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
                <input
                  type="text"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  placeholder="node-01.infra.local"
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none transition-all ${
                    isLightMode
                      ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                      : 'bg-slate-900 border-slate-700/80 text-slate-100 focus:border-cyan-500'
                  }`}
                />
              </div>

              {/* OS Distro */}
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <label className="font-semibold text-slate-300">
                    {isEn ? 'OS Distribution / Release' : 'نسخه و توزیع سیستم‌عامل'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'OS Distribution' : 'نسخه توزیع'}
                    whatIsIt={isEn ? 'Operating system distribution release name.' : 'نام دقیق توزیع لینوکس یا نسخه ویندوز.'}
                    whyNeeded={isEn ? 'Assists automation engines in selecting package managers (apt, yum, dnf, winget).' : 'کمک به موتورهای اتوماسیون در تشخیص پکیج منیجر.'}
                    example={osType === 'linux' ? 'Ubuntu 24.04 LTS, Debian 12, RHEL 9' : 'Windows Server 2022, Windows 11 Pro'}
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
                <input
                  type="text"
                  value={osDistro}
                  onChange={(e) => setOsDistro(e.target.value)}
                  placeholder={osType === 'linux' ? 'Ubuntu 24.04 LTS' : 'Windows Server 2022 Standard'}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none transition-all ${
                    isLightMode
                      ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                      : 'bg-slate-900 border-slate-700/80 text-slate-100 focus:border-cyan-500'
                  }`}
                />
              </div>

              {/* Category */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-300">
                  {isEn ? 'Category / Role' : 'دسته‌بندی سرور'}
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                      : 'bg-slate-900 border-slate-700/80 text-slate-100 focus:border-cyan-500'
                  }`}
                >
                  {SERVER_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Environment */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-300">
                  {isEn ? 'Deployment Environment' : 'محیط استقرار'}
                </label>
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                      : 'bg-slate-900 border-slate-700/80 text-slate-100 focus:border-cyan-500'
                  }`}
                >
                  {ENVIRONMENTS.map((env) => (
                    <option key={env} value={env}>
                      {env}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* OS-Specific Connection & Shell Credentials */}
          {osType === 'linux' ? (
            <div
              className={`p-3 rounded-xl border space-y-2.5 ${
                isLightMode ? 'bg-emerald-50/40 border-emerald-200/70' : 'bg-emerald-950/15 border-emerald-900/40'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                <Terminal className="w-3.5 h-3.5" />
                <span>{isEn ? 'Linux SSH & Terminal Credentials' : 'تنظیمات اتصال SSH و شل لینوکس'}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                {/* SSH Port */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-300">{isEn ? 'SSH Port' : 'پورت SSH'}</label>
                  <input
                    type="number"
                    value={sshPort}
                    onChange={(e) => setSshPort(Number(e.target.value) || 22)}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  />
                </div>

                {/* SSH Username */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-300">{isEn ? 'Username' : 'نام کاربری'}</label>
                  <input
                    type="text"
                    value={sshUsername}
                    onChange={(e) => setSshUsername(e.target.value)}
                    placeholder="root / ubuntu"
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  />
                </div>

                {/* Default Shell: Bash or Zshell */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-300">{isEn ? 'Default Shell' : 'شل پیش‌فرض'}</label>
                  <select
                    value={defaultShell}
                    onChange={(e) => setDefaultShell(e.target.value as any)}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none cursor-pointer ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  >
                    <option value="bash">Bash (/bin/bash)</option>
                    <option value="zsh">Zshell (/bin/zsh)</option>
                    <option value="sh">POSIX sh (/bin/sh)</option>
                  </select>
                </div>
              </div>

              {/* SSH Password / Auth Key */}
              <div className="space-y-1 text-xs">
                <label className="font-medium text-slate-300">
                  {isEn ? 'SSH Password / Private Key Passphrase' : 'رمز عبور SSH / کلید خصوصی'}
                </label>
                <input
                  type="password"
                  value={sshPassword}
                  onChange={(e) => setSshPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                    isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                  }`}
                />
              </div>
            </div>
          ) : (
            <div
              className={`p-3 rounded-xl border space-y-2.5 ${
                isLightMode ? 'bg-blue-50/40 border-blue-200/70' : 'bg-blue-950/15 border-blue-900/40'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-400 uppercase tracking-wider">
                <Monitor className="w-3.5 h-3.5" />
                <span>{isEn ? 'Windows Access & Remote Protocol' : 'تنظیمات دسترسی و پروتکل ریموت ویندوز'}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                {/* Protocol */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-300">{isEn ? 'Protocol' : 'پروتکل دسترسی'}</label>
                  <select
                    value={winProtocol}
                    onChange={(e) => {
                      const p = e.target.value as any;
                      setWinProtocol(p);
                      if (p === 'winrm') setWinPort(5985);
                      else if (p === 'rdp') setWinPort(3389);
                      else if (p === 'ssh') setSshPort(22);
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none cursor-pointer ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  >
                    <option value="rdp">RDP (Remote Desktop)</option>
                    <option value="powershell">PowerShell Remoting</option>
                    <option value="winrm">WinRM (HTTP / HTTPS)</option>
                    <option value="ssh">OpenSSH for Windows</option>
                  </select>
                </div>

                {/* Port */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-300">{isEn ? 'Port' : 'پورت ریموت'}</label>
                  <input
                    type="number"
                    value={winPort}
                    onChange={(e) => setWinPort(Number(e.target.value) || 3389)}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  />
                </div>

                {/* Domain (Optional) */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-300">{isEn ? 'Domain' : 'دامین (اختیاری)'}</label>
                  <input
                    type="text"
                    value={winDomain}
                    onChange={(e) => setWinDomain(e.target.value)}
                    placeholder="CORP / WORKGROUP"
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {/* Username */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-300">{isEn ? 'Windows Username' : 'نام کاربری ویندوز'}</label>
                  <input
                    type="text"
                    value={winUsername}
                    onChange={(e) => setWinUsername(e.target.value)}
                    placeholder="Administrator"
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  />
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-300">{isEn ? 'Windows Password' : 'رمز عبور ویندوز'}</label>
                  <input
                    type="password"
                    value={winPassword}
                    onChange={(e) => setWinPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Automation Tags Section - Compact */}
          <div
            className={`p-3 rounded-xl border space-y-2 text-xs ${
              isLightMode ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Tags className="w-3.5 h-3.5 text-purple-400" />
                <span className="font-bold uppercase tracking-wider text-slate-300">
                  {isEn ? 'Automation & Fleet Tags' : 'تگ‌های اتوماسیون و اجرای پلی‌بوک'}
                </span>
                <FieldInfoTooltip
                  title={isEn ? 'Automation Tags' : 'تگ‌های اتوماسیون'}
                  whatIsIt={
                    isEn
                      ? 'Labels attached to servers to match Ansible/Terraform playbooks, automated backup targets, or batch config routines.'
                      : 'برچسب‌های هدفمند برای اتصال به پلی‌بوک‌های انسیبل، پایپ‌لاین‌های CI/CD، اتوماسیون بکاپ یا مانیتورینگ.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Allows targeting fleets of servers simultaneously (e.g., run update on all servers tagged "k8s" or "database").'
                      : 'امکان انتخاب دسته‌ای سرورها برای کارهای خودکارسازی در آینده بر اساس تگ مشترک.'
                  }
                  example="k8s, prod, nginx, postgres, worker, dc-tehran"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                {tags.length} {isEn ? 'assigned' : 'تگ انتساب‌یافته'}
              </span>
            </div>

            {/* Current Tags Chips */}
            <div className="flex flex-wrap items-center gap-1 min-h-[28px]">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-rose-400 transition-colors cursor-pointer"
                    title={isEn ? 'Remove tag' : 'حذف تگ'}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}

              {tags.length === 0 && (
                <span className="text-[11px] text-slate-500 italic">
                  {isEn
                    ? 'No tags assigned. Add tags for automation targeting.'
                    : 'هیچ تگی ثبت نشده است. جهت اتوماسیون برچسب اضافه کنید.'}
                </span>
              )}
            </div>

            {/* Tag Input & Add Button */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag(newTagInput);
                  }
                }}
                placeholder={isEn ? 'Type tag and press Enter...' : 'نام تگ را بنویسید و اینتر بزنید...'}
                className={`flex-1 px-2.5 py-1 rounded-lg border text-xs font-mono outline-none transition-all ${
                  isLightMode
                    ? 'bg-white border-slate-200 text-slate-900 focus:border-purple-500'
                    : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-purple-500'
                }`}
              />
              <button
                type="button"
                onClick={() => handleAddTag(newTagInput)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer shadow-xs active:scale-95"
              >
                <Plus className="w-3 h-3" />
                <span>{isEn ? 'Add' : 'افزودن'}</span>
              </button>
            </div>

            {/* Quick Tag Suggestions */}
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <span className="text-[10px] text-slate-500 me-1 font-medium">
                {isEn ? 'Suggestions:' : 'پیشنهادات:'}
              </span>
              {COMMON_TAG_SUGGESTIONS.filter((s) => !tags.includes(s))
                .slice(0, 8)
                .map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => handleAddTag(sug)}
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                      isLightMode
                        ? 'border-slate-200 bg-white text-slate-600 hover:border-purple-400 hover:text-purple-600'
                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-purple-500/50 hover:text-purple-300'
                    }`}
                  >
                    +{sug}
                  </button>
                ))}
            </div>
          </div>

          {/* Optional Notes / Description */}
          <div className="space-y-1 text-xs">
            <label className="font-semibold text-slate-300">
              {isEn ? 'Notes / Role Description' : 'یادداشت‌ها و توضیحات نقش سرور'}
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                isEn
                  ? 'e.g. Primary control plane host running etcd and kube-apiserver. Managed via Ansible.'
                  : 'مثال: سرور مرکزی دیتابیس با پشتیبانی از کلاسترینگ و بکاپ ساعتی.'
              }
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none resize-none transition-all ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                  : 'bg-slate-900 border-slate-700/80 text-slate-100 focus:border-cyan-500'
              }`}
            />
          </div>

          {/* Form Actions Footer - Matches AddDeviceModal */}
          <div
            className={`flex items-center justify-between pt-3 border-t shrink-0 ${
              isLightMode ? 'border-slate-200' : 'border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              className={`px-3.5 py-1.5 rounded-xl border text-xs font-medium transition active:scale-95 cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'border-white/10 text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-md shadow-emerald-500/20 transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {isSaving
                  ? isEn
                    ? 'Saving...'
                    : 'در حال ذخیره...'
                  : serverToEdit
                  ? isEn
                    ? 'Save Changes'
                    : 'ذخیره تغییرات'
                  : isEn
                  ? 'Register Server'
                  : 'ثبت سرور'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
