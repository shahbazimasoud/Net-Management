import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Shield,
  Check,
  AlertTriangle,
  Zap,
  Terminal,
  Layers,
  FileText,
  Globe,
  Radio,
  Plus,
} from 'lucide-react';
import {
  RemoteServer,
  LinuxFirewallBackend,
  LinuxFirewallRule,
  LinuxFirewallAction,
  LinuxFirewallDirection,
  LinuxFirewallProtocol,
  LinuxFirewallRulePayload,
  LinuxFirewallInfo,
} from '../../types';
import { addLinuxFirewallRule } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface LinuxAddFirewallRuleModalProps {
  isOpen: boolean;
  server: RemoteServer;
  backend: LinuxFirewallBackend;
  activeZone?: string;
  existingRules: LinuxFirewallRule[];
  ephemeralPassword?: string;
  onClose: () => void;
  onMinimize?: () => void;
  onSuccess: (updatedInfo?: LinuxFirewallInfo) => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

interface CommonServicePreset {
  name: string;
  nameFa: string;
  port: string;
  protocol: LinuxFirewallProtocol;
  action: LinuxFirewallAction;
  direction: LinuxFirewallDirection;
  comment: string;
}

const COMMON_PRESETS: CommonServicePreset[] = [
  { name: 'SSH', nameFa: 'دسترسی امن SSH', port: '22', protocol: 'tcp', action: 'ALLOW', direction: 'IN', comment: 'Remote SSH Management' },
  { name: 'HTTP', nameFa: 'وب‌سرور HTTP', port: '80', protocol: 'tcp', action: 'ALLOW', direction: 'IN', comment: 'Standard HTTP Web Traffic' },
  { name: 'HTTPS', nameFa: 'وب‌سرور امن HTTPS', port: '443', protocol: 'tcp', action: 'ALLOW', direction: 'IN', comment: 'Encrypted HTTPS Traffic' },
  { name: 'DNS', nameFa: 'سرویس نام DNS', port: '53', protocol: 'udp', action: 'ALLOW', direction: 'IN', comment: 'Domain Name Resolution' },
  { name: 'MySQL / MariaDB', nameFa: 'دیتابیس MySQL', port: '3306', protocol: 'tcp', action: 'ALLOW', direction: 'IN', comment: 'MySQL Database Service' },
  { name: 'PostgreSQL', nameFa: 'دیتابیس PostgreSQL', port: '5432', protocol: 'tcp', action: 'ALLOW', direction: 'IN', comment: 'PostgreSQL Database Service' },
  { name: 'Redis', nameFa: 'کش سرور Redis', port: '6379', protocol: 'tcp', action: 'ALLOW', direction: 'IN', comment: 'Redis In-Memory Cache' },
  { name: 'WireGuard', nameFa: 'وی‌پی‌ان وایرگارد', port: '51820', protocol: 'udp', action: 'ALLOW', direction: 'IN', comment: 'WireGuard VPN Tunnel' },
];

export const LinuxAddFirewallRuleModal: React.FC<LinuxAddFirewallRuleModalProps> = ({
  isOpen,
  server,
  backend,
  activeZone,
  existingRules,
  ephemeralPassword,
  onClose,
  onMinimize,
  onSuccess,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  // Form State
  const [action, setAction] = useState<LinuxFirewallAction>('ALLOW');
  const [direction, setDirection] = useState<LinuxFirewallDirection>('IN');
  const [protocol, setProtocol] = useState<LinuxFirewallProtocol>('tcp');
  const [port, setPort] = useState('80');
  const [source, setSource] = useState('Any');
  const [ipVersion, setIpVersion] = useState<'v4' | 'v6' | 'both'>('both');
  const [comment, setComment] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Apply a preset
  const handleApplyPreset = (preset: CommonServicePreset) => {
    setPort(preset.port);
    setProtocol(preset.protocol);
    setAction(preset.action);
    setDirection(preset.direction);
    setComment(preset.comment);
    setError(null);
  };

  // Conflict detection
  const conflictInfo = useMemo(() => {
    if (!port || !port.trim()) return null;
    const cleanPort = port.trim();

    for (const r of existingRules) {
      if (r.port === cleanPort && (r.protocol === protocol || r.protocol === 'any' || protocol === 'any')) {
        if (r.action === action && r.direction === direction) {
          return {
            type: 'duplicate' as const,
            message: isEn
              ? `An existing rule already allows ${cleanPort}/${protocol.toUpperCase()} in direction ${direction}.`
              : `یک قانون مشابه برای پورت ${cleanPort}/${protocol.toUpperCase()} در جهت ${direction} از قبل ثبت شده است.`,
          };
        } else {
          return {
            type: 'opposing' as const,
            message: isEn
              ? `Warning: An existing rule has action ${r.action} for ${cleanPort}/${protocol.toUpperCase()}. Policy order matters.`
              : `هشدار: قانون متناقضی با وضعیت ${r.action} برای پورت ${cleanPort}/${protocol.toUpperCase()} وجود دارد.`,
          };
        }
      }
    }
    return null;
  }, [port, protocol, action, direction, existingRules, isEn]);

  // Live preview command
  const previewCommand = useMemo(() => {
    const act = action.toLowerCase();
    const dir = direction === 'OUT' ? 'out' : 'in';
    const protoStr = protocol !== 'any' ? ` proto ${protocol}` : '';
    const srcStr = source && source.trim().toLowerCase() !== 'any' ? ` from ${source.trim()}` : '';
    const portStr = port ? ` to any port ${port.trim()}` : '';
    const commentStr = comment ? ` comment '${comment.replace(/'/g, '')}'` : '';

    if (backend === 'ufw') {
      return `sudo ufw ${act} ${dir}${protoStr}${srcStr}${portStr}${commentStr}`;
    }
    if (backend === 'firewalld') {
      const zone = activeZone || 'public';
      if (source && source.trim().toLowerCase() !== 'any') {
        const fam = ipVersion === 'v6' ? 'ipv6' : 'ipv4';
        const a = act === 'allow' ? 'accept' : 'drop';
        const pPart = port ? ` port port="${port}" protocol="${protocol}"` : '';
        return `sudo firewall-cmd --permanent --zone=${zone} --add-rich-rule='rule family="${fam}" source address="${source}"${pPart} ${a}' && sudo firewall-cmd --reload`;
      }
      return `sudo firewall-cmd --permanent --zone=${zone} --add-port=${port}/${protocol} && sudo firewall-cmd --reload`;
    }
    if (backend === 'nftables') {
      const a = act === 'allow' ? 'accept' : 'drop';
      return `sudo nft add rule inet filter input ${protocol} dport ${port} ${a}`;
    }
    if (backend === 'iptables') {
      const a = act === 'allow' ? 'ACCEPT' : 'DROP';
      const s = source && source.toLowerCase() !== 'any' ? ` -s ${source}` : '';
      return `sudo iptables -I INPUT 1 -p ${protocol} --dport ${port}${s} -j ${a}`;
    }
    return 'sudo ...';
  }, [backend, action, direction, protocol, port, source, comment, activeZone, ipVersion]);

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!port && protocol !== 'icmp') {
      setError(isEn ? 'Port number or range is required' : 'شماره پورت یا محدوده پورت الزامی است');
      return;
    }

    if (port && !/^[0-9,:-]+$/.test(port.trim())) {
      setError(isEn ? 'Port must contain digits, commas, or ranges (e.g. 80, 80,443, 1000-2000)' : 'پورت باید شامل عدد، کاما یا محدوده باشد (مثال: ۸۰ یا ۸۰,۴۴۳)');
      return;
    }

    if (source && source.trim().toLowerCase() !== 'any') {
      if (!/^[0-9a-fA-F.:/]+$/.test(source.trim())) {
        setError(isEn ? 'Source must be "Any" or a valid IP/CIDR (e.g. 192.168.1.0/24)' : 'آدرس مبدا باید Any یا فرمت معتبر IP/CIDR باشد');
        return;
      }
    }

    const payload: LinuxFirewallRulePayload = {
      action,
      direction,
      protocol,
      port: port.trim() || undefined,
      source: source.trim() || 'Any',
      ipVersion,
      comment: comment.trim() || undefined,
    };

    setSaving(true);
    try {
      const res = await addLinuxFirewallRule(server.id, payload, backend, activeZone, ephemeralPassword);
      if (res.success) {
        onSuccess(res.info);
        onClose();
      } else {
        setError(res.error || (isEn ? 'Failed to apply firewall rule' : 'خطا در ثبت قانون فایروال'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error' : 'خطای ارتباط با سرور'));
    } finally {
      setSaving(false);
    }
  };

  const modalContent = (
    <div
      className={`fixed z-[70] flex flex-col transition-all duration-300 ${
        isMaximized
          ? 'top-0 left-0 right-0 bottom-8 p-0 w-full h-auto rounded-none border-none'
          : 'inset-0 items-center justify-center p-4 bg-black/60 backdrop-blur-sm'
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col border shadow-2xl overflow-hidden ${
          isMaximized
            ? 'w-full h-full rounded-none border-none'
            : 'w-full max-w-2xl rounded-2xl max-h-[92vh]'
        } ${isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'}`}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold">
                  {isEn ? 'Add Firewall Rule' : 'افزودن قانون فایروال'}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold uppercase">
                  {backend}
                </span>
                <FieldInfoTooltip
                  title={isEn ? 'Firewall Packet Filter Rule' : 'قانون فیلتر فایروال'}
                  infoWhatEn="Creates an explicit ingress or egress packet filter rule for port, protocol, and source address."
                  infoWhatFa="یک قانون فیلتر ورودی یا خروجی برای پورت، پروتکل و آدرس مبدا ایجاد می‌کند."
                  infoWhyEn="Controls network traffic allowed to communicate with server applications, databases, and admin services."
                  infoWhyFa="ترافیک مجاز شبکه را برای سرویس‌ها، دیتابیس‌ها و پورت‌های مدیریتی تعیین می‌کند."
                  infoExampleEn="Allow TCP 443 from Any (HTTPS Web), or Allow TCP 22 from 192.168.1.0/24 (SSH)."
                  infoExampleFa="مجاز کردن پورت ۴۴۳ برای کل شبکه، یا مجاز کردن پورت ۲۲ فقط برای رنج مشخص."
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {server.name || server.ip} • {backend.toUpperCase()} {activeZone ? `(${activeZone})` : ''}
              </span>
            </div>
          </div>

          {/* Triad Header Buttons: Minimize, Maximize, Close */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onMinimize || onClose}
              title={isEn ? 'Minimize' : 'کوچک‌نمایی'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? (isEn ? 'Restore' : 'بازگردانی') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Quick Presets Bar */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>{isEn ? 'Quick Service Presets' : 'الگوهای سریع سرویس‌های متداول'}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium border transition cursor-pointer flex items-center gap-1.5 ${
                    port === preset.port && protocol === preset.protocol
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                      : isLightMode
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                      : 'bg-slate-900/60 hover:bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  <span>{preset.name}</span>
                  <span className="text-[10px] text-slate-500">({preset.port})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Form Fields Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Action */}
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <label className="text-xs font-semibold">{isEn ? 'Action' : 'عملیات'}</label>
                <FieldInfoTooltip
                  title={isEn ? 'Firewall Action' : 'عملیات فیلترینگ'}
                  infoWhatEn="ALLOW permits traffic, DENY drops silently, REJECT notifies sender with ICMP port unreachable, LIMIT rate limits connections."
                  infoWhatFa="گزینه ALLOW ترافیک را عبور می‌دهد، DENY بدون پاسخ بسته‌ها را دور می‌ریزد و REJECT به فرستنده خطا می‌فرستد."
                  infoWhyEn="Enforces whether matching packets are permitted or barred."
                  infoWhyFa="تعیین سرنوشت بسته‌های منطبق با این قانون."
                  infoExampleEn="ALLOW for web servers, LIMIT for SSH, DENY for untrusted networks."
                  infoExampleFa="گزینه ALLOW برای وب‌سرور، LIMIT برای SSH."
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as LinuxFirewallAction)}
                className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                  isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                }`}
              >
                <option value="ALLOW">{isEn ? 'ALLOW (Permit Connection)' : 'ALLOW (مجاز کردن ارتباط)'}</option>
                <option value="DENY">{isEn ? 'DENY (Drop Silently)' : 'DENY (مسدودسازی بی‌صدا)'}</option>
                <option value="REJECT">{isEn ? 'REJECT (Reject with Error)' : 'REJECT (رد ارتباط با اعلان خطا)'}</option>
                <option value="LIMIT">{isEn ? 'LIMIT (Rate Limit Brute-Force)' : 'LIMIT (محدودسازی نرخ درخواست)'}</option>
              </select>
            </div>

            {/* Direction */}
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <label className="text-xs font-semibold">{isEn ? 'Direction' : 'جهت ترافیک'}</label>
                <FieldInfoTooltip
                  title={isEn ? 'Traffic Direction' : 'جهت ترافیک'}
                  infoWhatEn="IN (Ingress) filters incoming connections. OUT (Egress) filters outgoing packets from the server."
                  infoWhatFa="جهت IN برای ترافیک ورودی به سرور و OUT برای ترافیک خروجی از سرور است."
                  infoWhyEn="Most firewall rules govern IN (inbound) traffic to protect server listening ports."
                  infoWhyFa="اکثر قوانین جهت محافظت از پورت‌های ورودی سرور تنظیم می‌شوند."
                  infoExampleEn="IN for listening ports (Web, SSH), OUT for outbound proxy restrictions."
                  infoExampleFa="ورودی (IN) برای پورت‌های وب و SSH."
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as LinuxFirewallDirection)}
                className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                  isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                }`}
              >
                <option value="IN">{isEn ? 'IN (Ingress / Inbound)' : 'IN (ورودی به سرور)'}</option>
                <option value="OUT">{isEn ? 'OUT (Egress / Outbound)' : 'OUT (خروجی از سرور)'}</option>
                <option value="FORWARD">{isEn ? 'FORWARD (Routed Traffic)' : 'FORWARD (هدایت‌شده)'}</option>
              </select>
            </div>

            {/* Protocol */}
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <label className="text-xs font-semibold">{isEn ? 'Protocol' : 'پروتکل شبکه'}</label>
                <FieldInfoTooltip
                  title={isEn ? 'Transport Protocol' : 'پروتکل انتقال'}
                  infoWhatEn="L4 transport protocol: TCP for reliable streams, UDP for datagrams, ICMP for ping/traceroute, or Any."
                  infoWhatFa="پروتکل لایه چهارم: TCP برای ارتباط پایدار، UDP برای پکت‌ها، ICMP برای پینگ یا Any."
                  infoWhyEn="Restricting to the exact protocol prevents unnecessary exposure of unused protocol sockets."
                  infoWhyFa="تطبیق با پروتکل دقیق مانع باز ماندن پروتکل‌های بلااستفاده می‌شود."
                  infoExampleEn="TCP for Web/SSH, UDP for DNS/VPN."
                  infoExampleFa="پروتکل TCP برای وب و SSH، پروتکل UDP برای DNS."
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as LinuxFirewallProtocol)}
                className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                  isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                }`}
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="icmp">ICMP (Ping)</option>
                <option value="any">{isEn ? 'ANY Protocol' : 'تمامی پروتکل‌ها'}</option>
              </select>
            </div>

            {/* Port / Port Range */}
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <label className="text-xs font-semibold">{isEn ? 'Port / Range' : 'پورت یا محدوده پورت'}</label>
                <FieldInfoTooltip
                  title={isEn ? 'Port Specification' : 'شماره یا محدوده پورت'}
                  infoWhatEn="Single port (e.g. 80), comma-separated ports (80,443), or port range (1000:2000 or 1000-2000)."
                  infoWhatFa="پورت تکی (مانند ۸۰)، پورت‌های تفکیک‌شده با کاما (۸۰,۴۴۳) یا محدوده پورت (۱۰۰۰-۲۰۰۰)."
                  infoWhyEn="Defines which network socket destination this firewall rule attaches to."
                  infoWhyFa="پورت یا دامنه‌ای از پورت‌ها که این قانون روی آنها اعمال می‌شود."
                  infoExampleEn="80, 443, 8080:8090"
                  infoExampleFa="۸۰، ۴۴۳، ۸۰۸۰-۸۰۹۰"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <input
                type="text"
                placeholder={isEn ? 'e.g. 80 or 80,443 or 1000:2000' : 'مثال: 80 یا 80,443 یا 1000:2000'}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                disabled={protocol === 'icmp'}
                className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50 ${
                  isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                }`}
              />
            </div>

            {/* Source IP / CIDR */}
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <label className="text-xs font-semibold">{isEn ? 'Source IP / Subnet' : 'آدرس مبدا / ساب‌نت'}</label>
                <FieldInfoTooltip
                  title={isEn ? 'Source Address Restriction' : 'محدودسازی آدرس مبدا'}
                  infoWhatEn="'Any' to accept from all Internet/intranet clients, or a specific IP/CIDR to whitelist only trusted networks."
                  infoWhatFa="گزینه Any برای دسترسی آزاد از کل شبکه، یا آی‌پی/ساب‌نت مشخص برای محدود کردن به کلاینت‌های مطمئن."
                  infoWhyEn="Restricting access to admin ports (SSH, DB) prevents brute-force scans from the public Internet."
                  infoWhyFa="محدود کردن پورت‌های حساس به آی‌پی مشخص مانع اسکن و نفوذ هکرها می‌شود."
                  infoExampleEn="Any, 192.168.1.50, 10.0.0.0/24"
                  infoExampleFa="Any یا 192.168.1.0/24"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <input
                type="text"
                placeholder={isEn ? 'Any or e.g. 192.168.1.0/24' : 'Any یا مثال: 192.168.1.0/24'}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                  isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                }`}
              />
            </div>

            {/* IP Version */}
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <label className="text-xs font-semibold">{isEn ? 'IP Version' : 'نسخه پروتکل IP'}</label>
                <FieldInfoTooltip
                  title={isEn ? 'IP Family' : 'خانواده آدرس IP'}
                  infoWhatEn="Enforces rule for IPv4 only, IPv6 only, or both stacks simultaneously."
                  infoWhatFa="اعمال قانون روی IPv4، روی IPv6 یا هر دو نسخه به صورت همزمان."
                  infoWhyEn="Modern Linux distributions enable dual-stack networking by default."
                  infoWhyFa="توزیع‌های جدید لینوکس به طور پیش‌فرض از هر دو پشته v4 و v6 پشتیبانی می‌کنند."
                  infoExampleEn="Both (IPv4 & IPv6)"
                  infoExampleFa="هر دو (IPv4 و IPv6)"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <select
                value={ipVersion}
                onChange={(e) => setIpVersion(e.target.value as any)}
                className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                  isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                }`}
              >
                <option value="both">{isEn ? 'Both (IPv4 & IPv6)' : 'هر دو (IPv4 و IPv6)'}</option>
                <option value="v4">IPv4 Only</option>
                <option value="v6">IPv6 Only</option>
              </select>
            </div>
          </div>

          {/* Comment / Description */}
          <div className="space-y-1">
            <label className="text-xs font-semibold">{isEn ? 'Rule Comment / Description' : 'توضیحات و یادداشت قانون'}</label>
            <input
              type="text"
              placeholder={isEn ? 'e.g. Web production server access' : 'مثال: دسترسی وب‌سرور عملیاتی'}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
              }`}
            />
          </div>

          {/* Conflict Warning Notice */}
          {conflictInfo && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                conflictInfo.type === 'opposing'
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{conflictInfo.message}</span>
            </div>
          )}

          {/* Live Command Preview Box */}
          <div
            className={`p-3 rounded-xl border space-y-1.5 ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isEn ? 'Target System Command (Real Execution Preview):' : 'دستور اجرایی روی سیستم‌عامل سرور:'}</span>
            </div>
            <pre className="p-2 rounded-lg bg-slate-950 font-mono text-[11px] text-emerald-400 overflow-x-auto">
              {previewCommand}
            </pre>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/15 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span className="font-mono">{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                isLightMode ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
            >
              <Plus className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
              <span>{saving ? (isEn ? 'Applying Rule...' : 'در حال ثبت قانون...') : (isEn ? 'Add Firewall Rule' : 'ثبت قانون فایروال')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
