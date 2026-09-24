import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { RemoteServer, LinuxFirewallInfo } from '../../types';
import { fetchLinuxFirewallInfo } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

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
    <div className="space-y-6">
      {/* Top Header Card */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`p-3 rounded-2xl border ${
                firewallInfo?.active
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
              }`}
            >
              <Shield className="w-7 h-7" />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-100">
                  {isEn ? 'Linux Firewall & Network Security' : 'فایروال و امنیت شبکه لینوکس'}
                </h3>
                {firewallInfo && getStatusBadge(firewallInfo.status, firewallInfo.active)}
                {firewallInfo && (
                  <span
                    className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg border ${getBackendBadgeColor(
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
                  ? 'Real-time inspection of active packet filter rules, policies, and listening ports.'
                  : 'پایش بلادرنگ قوانین فیلترینگ، سیاست‌های پیش‌فرض و تطبیق با پورت‌های فعال سرور.'}
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
              <span>{loading ? (isEn ? 'Probing Server...' : 'در حال بررسی...') : (isEn ? 'Refresh Status' : 'بروزرسانی وضعیت')}</span>
            </button>
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

      {/* Loading Skeleton */}
      {loading && !firewallInfo && (
        <div
          className={`p-10 rounded-2xl border text-center space-y-3 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
          }`}
        >
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-300">
            {isEn ? 'Inspecting remote server firewall daemon and filtering tables...' : 'در حال کاوش دیمون فایروال و جداول فیلترینگ سرور...'}
          </p>
        </div>
      )}

      {/* Firewall Details Cards */}
      {firewallInfo && (
        <>
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Backend & Service */}
            <div
              className={`p-4 rounded-xl border space-y-2 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">{isEn ? 'Firewall Engine' : 'موتور فایروال'}</span>
                <Layers className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-lg font-black font-mono text-slate-100">
                {firewallInfo.backend === 'none' ? (isEn ? 'None Active' : 'غیرفعال') : firewallInfo.backend.toUpperCase()}
              </div>
              <div className="text-[11px] text-slate-400 font-mono truncate">
                {isEn ? 'Service:' : 'سرویس:'} {firewallInfo.serviceName || 'none'}
              </div>
            </div>

            {/* Default Incoming Policy */}
            <div
              className={`p-4 rounded-xl border space-y-2 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">{isEn ? 'Incoming Policy' : 'سیاست ورودی'}</span>
                {firewallInfo.defaultPolicies.incoming === 'DENY' || firewallInfo.defaultPolicies.incoming === 'DROP' ? (
                  <Lock className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Unlock className="w-4 h-4 text-amber-400" />
                )}
              </div>
              <div className="text-lg font-black font-mono">
                <span
                  className={
                    firewallInfo.defaultPolicies.incoming === 'DENY' || firewallInfo.defaultPolicies.incoming === 'DROP' || firewallInfo.defaultPolicies.incoming === 'REJECT'
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }
                >
                  {firewallInfo.defaultPolicies.incoming}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {firewallInfo.defaultPolicies.incoming === 'DENY' || firewallInfo.defaultPolicies.incoming === 'DROP'
                  ? isEn
                    ? 'Default Deny (Recommended)'
                    : 'مسدودسازی پیش‌فرض (پیشنهادی)'
                  : isEn
                  ? 'All Incoming Allowed (Open)'
                  : 'ورودی کاملاً باز (غیرامن)'}
              </div>
            </div>

            {/* Default Outgoing Policy */}
            <div
              className={`p-4 rounded-xl border space-y-2 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">{isEn ? 'Outgoing Policy' : 'سیاست خروجی'}</span>
                <Activity className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-lg font-black font-mono text-cyan-300">
                {firewallInfo.defaultPolicies.outgoing}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {isEn ? 'Forward Policy:' : 'سیاست هدایت:'} {firewallInfo.defaultPolicies.forward || 'DROP'}
              </div>
            </div>

            {/* Total Rules Count */}
            <div
              className={`p-4 rounded-xl border space-y-2 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">{isEn ? 'Active Rules' : 'قوانین فعال'}</span>
                <Cpu className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-lg font-black font-mono text-purple-300">
                {firewallInfo.rulesCount} {isEn ? 'Rules' : 'قانون'}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {firewallInfo.activeZone ? `${isEn ? 'Zone:' : 'منطقه:'} ${firewallInfo.activeZone}` : isEn ? 'Standard Table' : 'جدول استاندارد'}
              </div>
            </div>
          </div>

          {/* Listening Sockets & Firewall Protection Status */}
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
            <div className="flex items-center justify-between flex-wrap gap-2">
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

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                  {firewallInfo.rules.length} {isEn ? 'Total Rules' : 'قانون ثبت‌شده'}
                </span>
              </div>
            </div>

            {/* Rules Cards List */}
            {firewallInfo.rules.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-slate-700 text-center space-y-2">
                <Shield className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-xs font-semibold text-slate-400">
                  {firewallInfo.active
                    ? isEn
                      ? 'No explicit rules defined. Default policies are enforcing.'
                      : 'قانون اختصاصی ثبت نشده است. سیاست‌های پیش‌فرض در حال اعمال هستند.'
                    : isEn
                    ? 'Firewall daemon is not active on this server.'
                    : 'سرویس فایروال روی این سرور فعال نیست.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {firewallInfo.rules.map((rule) => (
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

                    <div className="flex items-center gap-2">
                      {rule.comment && (
                        <span className="text-xs text-slate-400 italic bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700 max-w-xs truncate">
                          {rule.comment}
                        </span>
                      )}
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
    </div>
  );
};
