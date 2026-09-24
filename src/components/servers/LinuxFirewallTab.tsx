import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Terminal,
  Activity,
  Layers,
  ChevronDown,
  ChevronUp,
  Cpu,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Search,
  Filter,
  ArrowRight,
  Info,
} from 'lucide-react';
import { RemoteServer, LinuxFirewallInfo, LinuxFirewallRule } from '../../types';
import { fetchLinuxFirewallInfo, deleteLinuxFirewallRule } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { LinuxAddFirewallRuleModal } from './LinuxAddFirewallRuleModal';

interface LinuxFirewallTabProps {
  server: RemoteServer;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const LinuxFirewallTab: React.FC<LinuxFirewallTabProps> = ({
  server,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
}) => {
  const [firewallInfo, setFirewallInfo] = useState<LinuxFirewallInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRawOutput, setShowRawOutput] = useState(false);

  // Modals & Actions
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<LinuxFirewallRule | null>(null);
  const [deletingRule, setDeletingRule] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Filter & Search
  const [ruleSearch, setRuleSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<'ALL' | 'ALLOW' | 'DENY' | 'REJECT'>('ALL');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLinuxFirewallInfo(server.id, ephemeralPassword);
      if (res.success && res.backend) {
        setFirewallInfo(res as LinuxFirewallInfo);
      } else {
        setError(res.error || (isEn ? 'Failed to probe firewall on server' : 'خطا در بررسی فایروال سرور'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error' : 'خطای ارتباط با سرور'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [server.id, ephemeralPassword]);

  // Filtered Rules
  const filteredRules = useMemo(() => {
    if (!firewallInfo?.rules) return [];
    return firewallInfo.rules.filter((rule) => {
      if (actionFilter !== 'ALL' && rule.action !== actionFilter) return false;
      if (!ruleSearch.trim()) return true;
      const q = ruleSearch.toLowerCase();
      return (
        (rule.port && rule.port.toLowerCase().includes(q)) ||
        (rule.protocol && rule.protocol.toLowerCase().includes(q)) ||
        (rule.source && rule.source.toLowerCase().includes(q)) ||
        (rule.comment && rule.comment.toLowerCase().includes(q)) ||
        (rule.direction && rule.direction.toLowerCase().includes(q))
      );
    });
  }, [firewallInfo?.rules, actionFilter, ruleSearch]);

  // Handle Rule Deletion
  const handleConfirmDelete = async () => {
    if (!ruleToDelete || !firewallInfo) return;
    setDeletingRule(true);
    setDeleteError(null);
    try {
      const res = await deleteLinuxFirewallRule(
        server.id,
        ruleToDelete,
        firewallInfo.activeZone,
        ephemeralPassword
      );
      if (res.success) {
        if (res.info) {
          setFirewallInfo(res.info);
        } else {
          loadData();
        }
        setRuleToDelete(null);
      } else {
        setDeleteError(res.error || (isEn ? 'Failed to delete rule' : 'خطا در حذف قانون'));
      }
    } catch (err: any) {
      setDeleteError(err?.message || (isEn ? 'Network error' : 'خطای ارتباط با سرور'));
    } finally {
      setDeletingRule(false);
    }
  };

  const getBackendBadgeColor = (backend: string) => {
    switch (backend) {
      case 'ufw':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'firewalld':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      case 'nftables':
        return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
      case 'iptables':
        return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
      default:
        return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
    }
  };

  const getStatusBadge = (status: string, active: boolean) => {
    if (active || status === 'active') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{isEn ? 'Active & Enforcing' : 'فعال و محافظت‌شده'}</span>
        </span>
      );
    }
    if (status === 'inactive') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>{isEn ? 'Inactive / Disabled' : 'غیرفعال / محافظت‌نشده'}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-500/15 text-slate-400 border border-slate-500/30">
        <Shield className="w-3.5 h-3.5" />
        <span>{isEn ? 'Not Installed' : 'نصب نشده'}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6" dir={isEn ? 'ltr' : 'rtl'}>
      {/* Header Bar */}
      <div
        className={`p-5 rounded-2xl border ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-purple-500/15 text-purple-400 border border-purple-500/20">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold">
                  {isEn ? 'Linux Firewall Engine & Security Rules' : 'موتور فایروال لینوکس و قوانین امنیتی'}
                </h3>
                {firewallInfo && (
                  <span
                    className={`text-xs font-mono px-2.5 py-0.5 rounded-full border font-semibold uppercase ${getBackendBadgeColor(
                      firewallInfo.backend
                    )}`}
                  >
                    {firewallInfo.backend.toUpperCase()}
                  </span>
                )}
                <FieldInfoTooltip
                  title={isEn ? 'Linux Firewall Engine' : 'موتور فایروال لینوکس'}
                  infoWhatEn="The authoritative packet-filtering subsystem running on the target server (UFW, firewalld, nftables, or iptables)."
                  infoWhatFa="زیرسیستم فیلتر بسته‌های شبکه روی سرور هدف (شامل UFW، firewalld، nftables یا iptables)."
                  infoWhyEn="Detects the real firewall daemon in real time to prevent accidental lockouts, syntax errors, or policy conflicts."
                  infoWhyFa="تشخیص هوشمند فایروال فعال مانع قطعی اتصال، خطاهای دستوری یا تداخل قوانین شبکه می‌شود."
                  infoExampleEn="Ubuntu (UFW), RHEL/Rocky (firewalld), Debian (nftables/iptables)."
                  infoExampleFa="اوبونتو (UFW)، ردحت و راکی (firewalld)، دبیان (nftables)."
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>

              <p className="text-xs text-slate-400 mt-1">
                {isEn
                  ? 'Real-time inspection and management of active packet filter rules, policies, and listening ports.'
                  : 'پایش و مدیریت بلادرنگ قوانین فیلترینگ، سیاست‌های پیش‌فرض و تطبیق با پورت‌های فعال سرور.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={loadData}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-2 disabled:opacity-50 ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{loading ? (isEn ? 'Probing...' : 'در حال بررسی...') : (isEn ? 'Refresh' : 'بروزرسانی')}</span>
            </button>

            {firewallInfo && firewallInfo.backend !== 'none' && (
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-500 hover:bg-purple-400 text-slate-950 transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isEn ? 'Add Rule' : 'افزودن قانون'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mt-4 p-3 rounded-xl border border-rose-500/30 bg-rose-500/15 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="font-mono">{error}</span>
          </div>
        )}
      </div>

      {/* Main Firewall Metrics & Policy Cards */}
      {firewallInfo && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Status Card */}
            <div
              className={`p-4 rounded-2xl border space-y-2 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-semibold">{isEn ? 'Status' : 'وضعیت سرویس'}</span>
                <Cpu className="w-4 h-4 text-slate-400" />
              </div>
              <div>{getStatusBadge(firewallInfo.status, firewallInfo.active)}</div>
              <div className="text-[11px] text-slate-500 font-mono">
                Daemon: {firewallInfo.serviceName || 'none'}
              </div>
            </div>

            {/* Backend & Zone */}
            <div
              className={`p-4 rounded-2xl border space-y-2 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-semibold">{isEn ? 'Technology & Zone' : 'فناوری و ناحیه'}</span>
                <Layers className="w-4 h-4 text-slate-400" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold font-mono text-slate-200">
                  {firewallInfo.backend.toUpperCase()}
                </span>
                {firewallInfo.activeZone && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                    {firewallInfo.activeZone}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                {firewallInfo.version ? `v${firewallInfo.version}` : isEn ? 'Native Kernel Driver' : 'درایور کرنل'}
              </div>
            </div>

            {/* Default Policies */}
            <div
              className={`p-4 rounded-2xl border space-y-2 sm:col-span-2 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-semibold">{isEn ? 'Default System Policies' : 'سیاست‌های پیش‌فرض'}</span>
                <Shield className="w-4 h-4 text-slate-400" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded-xl bg-slate-950/50 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">{isEn ? 'Incoming (IN)' : 'ورودی (IN)'}</span>
                  <span
                    className={`font-mono text-xs font-bold ${
                      firewallInfo.defaultPolicies.incoming.includes('DENY') ||
                      firewallInfo.defaultPolicies.incoming.includes('DROP')
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {firewallInfo.defaultPolicies.incoming}
                  </span>
                </div>

                <div className="p-2 rounded-xl bg-slate-950/50 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">{isEn ? 'Outgoing (OUT)' : 'خروجی (OUT)'}</span>
                  <span
                    className={`font-mono text-xs font-bold ${
                      firewallInfo.defaultPolicies.outgoing.includes('ALLOW') ||
                      firewallInfo.defaultPolicies.outgoing.includes('ACCEPT')
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {firewallInfo.defaultPolicies.outgoing}
                  </span>
                </div>

                <div className="p-2 rounded-xl bg-slate-950/50 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">{isEn ? 'Forward (FWD)' : 'هدایت (FWD)'}</span>
                  <span className="font-mono text-xs font-bold text-slate-300">
                    {firewallInfo.defaultPolicies.forward}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Listening Sockets Correlation Section */}
          {firewallInfo.listeningPortsSummary && firewallInfo.listeningPortsSummary.length > 0 && (
            <div
              className={`p-5 rounded-2xl border space-y-4 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs sm:text-sm font-bold">
                        {isEn ? 'Listening Sockets vs Firewall Access' : 'تطبیق سوکت‌های فعال با دسترسی فایروال'}
                      </h4>
                      <FieldInfoTooltip
                        title={isEn ? 'Listening Port Correlation' : 'تطبیق پورت‌های گوش‌دهنده'}
                        infoWhatEn="Cross-references active listening daemon ports (from ss/netstat) against the current firewall filter rules."
                        infoWhatFa="تطبیق پورت‌هایی که سرویس‌های سیستم روی آن گوش می‌دهند با قوانین فیلترینگ فایروال."
                        infoWhyEn="Immediately exposes if a daemon like SSH, PostgreSQL, or NGINX is blocked or open to the network."
                        infoWhyFa="مشخص می‌کند که آیا سرویس‌هایی مانند SSH، وب‌سرور یا دیتابیس توسط فایروال مجاز شده‌اند یا بسته‌اند."
                        infoExampleEn="Port 22 (SSH) - ALLOWED, Port 5432 (PostgreSQL) - BLOCKED."
                        infoExampleFa="پورت ۲۲ (SSH) مجاز، پورت ۵۴۳۲ (دیتابیس) مسدود."
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {isEn
                        ? 'Checks whether remote clients can reach services actively running on this server.'
                        : 'بررسی دسترسی کاربران شبکه به پورت‌های باز و سرویس‌های در حال اجرا.'}
                    </p>
                  </div>
                </div>

                <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                  {firewallInfo.listeningPortsSummary.length} {isEn ? 'Listening Sockets' : 'سوکت فعال'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {firewallInfo.listeningPortsSummary.map((item) => (
                  <div
                    key={`${item.proto}-${item.port}-${item.address}`}
                    className={`p-3 rounded-xl border flex items-center justify-between ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs text-slate-200">
                          {item.port}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-cyan-400">
                          {item.proto.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono truncate max-w-[140px]">
                        {item.process || (isEn ? 'Unknown daemon' : 'سرویس ناشناس')}
                      </div>
                    </div>

                    <div className="shrink-0">
                      {item.allowedInFirewall ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{isEn ? 'OPEN' : 'مجاز'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-500/15 text-rose-400 border border-rose-500/30">
                          <Lock className="w-3 h-3" />
                          <span>{isEn ? 'BLOCKED' : 'مسدود'}</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rules Section Header */}
          <div
            className={`p-5 rounded-2xl border space-y-4 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold">
                    {isEn ? 'Configured Packet Filter Rules' : 'قوانین فیلترینگ بسته‌های شبکه'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {isEn
                      ? `Authoritative active rules from ${firewallInfo.backend.toUpperCase()} daemon.`
                      : `قوانین فعال استخراج‌شده مستقیماً از دیمون ${firewallInfo.backend.toUpperCase()}.`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Search Box */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder={isEn ? 'Filter rules...' : 'جستجوی قوانین...'}
                    value={ruleSearch}
                    onChange={(e) => setRuleSearch(e.target.value)}
                    className={`pl-8 pr-3 py-1.5 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                      isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>

                {/* Action Filter */}
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                    isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                >
                  <option value="ALL">{isEn ? 'All Actions' : 'تمامی عملیات‌ها'}</option>
                  <option value="ALLOW">ALLOW</option>
                  <option value="DENY">DENY</option>
                  <option value="REJECT">REJECT</option>
                </select>

                <span className="text-xs font-mono px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
                  {filteredRules.length} / {firewallInfo.rules.length} {isEn ? 'Rules' : 'قانون'}
                </span>

                {firewallInfo.backend !== 'none' && (
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(true)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-purple-500 hover:bg-purple-400 text-slate-950 transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Add' : 'افزودن'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Rules Cards List */}
            {filteredRules.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-slate-700 text-center space-y-2">
                <Shield className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-xs font-semibold text-slate-400">
                  {firewallInfo.rules.length === 0
                    ? firewallInfo.active
                      ? isEn
                        ? 'No explicit rules defined. Default policies are enforcing.'
                        : 'قانون اختصاصی ثبت نشده است. سیاست‌های پیش‌فرض در حال اعمال هستند.'
                      : isEn
                      ? 'Firewall daemon is not active on this server.'
                      : 'سرویس فایروال روی این سرور فعال نیست.'
                    : isEn
                    ? 'No rules match your filter.'
                    : 'هیچ قانونی با عبارت جستجو مطابقت ندارد.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`p-3.5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800'
                    }`}
                  >
                    <div className="flex items-start md:items-center gap-3">
                      <div
                        className={`px-2.5 py-1 rounded-lg font-mono text-xs font-black ${
                          rule.action === 'ALLOW'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : rule.action === 'REJECT'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {rule.action}
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-200">
                            {rule.port ? `${rule.port} / ${rule.protocol.toUpperCase()}` : rule.protocol.toUpperCase()}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {rule.direction}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {rule.ipVersion.toUpperCase()}
                          </span>
                          {rule.ruleNumber && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              #{rule.ruleNumber}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-400 font-mono">
                          {isEn ? 'Source:' : 'مبدا:'}{' '}
                          <span className="text-cyan-400">{rule.source || 'Any'}</span>
                          {rule.destination && (
                            <>
                              {' '}&rarr; {isEn ? 'Dest:' : 'مقصد:'}{' '}
                              <span className="text-slate-300">{rule.destination}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end md:self-auto">
                      {rule.comment && (
                        <span className="text-xs text-slate-400 italic bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700 max-w-xs truncate">
                          {rule.comment}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => setRuleToDelete(rule)}
                        title={isEn ? 'Delete Rule' : 'حذف قانون'}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Raw Diagnostic Accordion */}
          <div
            className={`rounded-2xl border overflow-hidden ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={() => setShowRawOutput(!showRawOutput)}
              className="w-full p-4 text-left flex items-center justify-between cursor-pointer hover:bg-white/5 transition"
            >
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-slate-300">
                  {isEn ? 'Raw System Diagnostics & Probe Output' : 'خروجی متنی پروب و لاگ دیاگنوستیک سرور'}
                </span>
              </div>
              {showRawOutput ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {showRawOutput && (
              <div className="p-4 border-t border-slate-800 bg-slate-950/80">
                <pre className="text-[11px] font-mono text-emerald-400/90 whitespace-pre-wrap overflow-x-auto max-h-72 p-2">
                  {firewallInfo.rawStatusOutput || (isEn ? 'No raw output' : 'فاقد خروجی متنی')}
                </pre>
              </div>
            )}
          </div>
        </>
      )}

      {/* Add Rule Modal */}
      {firewallInfo && (
        <LinuxAddFirewallRuleModal
          isOpen={isAddModalOpen}
          server={server}
          backend={firewallInfo.backend}
          activeZone={firewallInfo.activeZone}
          existingRules={firewallInfo.rules}
          ephemeralPassword={ephemeralPassword}
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={(updatedInfo) => {
            if (updatedInfo) {
              setFirewallInfo(updatedInfo);
            } else {
              loadData();
            }
          }}
          isLightMode={isLightMode}
          isEn={isEn}
        />
      )}

      {/* Delete Rule Confirmation Modal */}
      {ruleToDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-md rounded-2xl border shadow-2xl p-5 space-y-4 ${
              isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
            }`}
          >
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/20">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold">
                {isEn ? 'Delete Firewall Rule' : 'تایید حذف قانون فایروال'}
              </h3>
            </div>

            <p className="text-xs text-slate-400">
              {isEn
                ? 'Are you sure you want to permanently remove this packet filter rule from the Linux firewall?'
                : 'آیا از حذف دائمی این قانون فیلترینگ از فایروال لینوکس اطمینان دارید؟'}
            </p>

            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{isEn ? 'Action / Direction:' : 'عملیات / جهت:'}</span>
                <span className="font-bold text-cyan-400">{ruleToDelete.action} ({ruleToDelete.direction})</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{isEn ? 'Port / Protocol:' : 'پورت / پروتکل:'}</span>
                <span className="text-slate-200">{ruleToDelete.port || 'Any'} / {ruleToDelete.protocol.toUpperCase()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{isEn ? 'Source:' : 'آدرس مبدا:'}</span>
                <span className="text-slate-300">{ruleToDelete.source || 'Any'}</span>
              </div>
            </div>

            {/* SSH Lockout Warning */}
            {ruleToDelete.port === '22' && (
              <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  {isEn
                    ? 'Caution: Deleting an SSH allow rule might immediately disconnect your active management session if the default policy is DROP/DENY!'
                    : 'توجه: حذف قانون دسترسی SSH ممکن است در صورت مسدود بودن سیاست پیش‌فرض، بلافاصله ارتباط مدیریتی فعلی شما را قطع کند!'}
                </span>
              </div>
            )}

            {deleteError && (
              <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setRuleToDelete(null);
                  setDeleteError(null);
                }}
                disabled={deletingRule}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-700 hover:bg-slate-800 text-slate-300 transition cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingRule}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className={`w-3.5 h-3.5 ${deletingRule ? 'animate-spin' : ''}`} />
                <span>{deletingRule ? (isEn ? 'Deleting...' : 'در حال حذف...') : (isEn ? 'Confirm Delete' : 'تایید و حذف قانون')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
