import React, { useMemo, useState } from 'react';
import {
  Waypoints,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Server,
  Cable,
  Network,
  ArrowRight,
  ArrowLeft,
  ShieldAlert,
  Terminal,
  ExternalLink,
  Copy,
  Check,
  Zap,
  Radar,
  HelpCircle,
} from 'lucide-react';
import { HelpdeskSwitchPortResult } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface SwitchPortTabProps {
  isLightMode: boolean;
  isEn: boolean;
  targetIp: string;
  hasCredentials: boolean;
  canRunDiagnostics: boolean;
  canViewDevicesModule: boolean;
  networkData: any | null;
  healthData: any | null;
  data: HelpdeskSwitchPortResult | null;
  loading: boolean;
  error: string | null;
  onTraceSwitchPort: (options: {
    endpointMac?: string;
    forceRefresh?: boolean;
    traceMode?: 'fast_hop' | 'full_parallel';
  }) => void;
  onNavigateToDevices?: () => void;
  onInspectSwitchPorts?: (switchId: string) => void;
  onConnectSwitchTerminal?: (switchId: string, port?: string) => void;
}

export const SwitchPortTab: React.FC<SwitchPortTabProps> = ({
  isLightMode,
  isEn,
  targetIp,
  hasCredentials,
  canRunDiagnostics,
  canViewDevicesModule,
  networkData,
  healthData,
  data,
  loading,
  error,
  onTraceSwitchPort,
  onNavigateToDevices,
  onInspectSwitchPorts,
  onConnectSwitchTerminal,
}) => {
  const [selectedMacOverride, setSelectedMacOverride] = useState<string>('auto');
  const [traceMode, setTraceMode] = useState<'fast_hop' | 'full_parallel'>('fast_hop');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const surfaceBg = isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800';
  const subSurfaceBg = isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800';
  const textPrimary = isLightMode ? 'text-slate-900' : 'text-slate-100';
  const textMuted = isLightMode ? 'text-slate-600' : 'text-slate-400';

  const copyValue = async (val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedText(val);
      setTimeout(() => setCopiedText(null), 1600);
    } catch {}
  };

  // Build deduplicated MAC choices from loaded Health/Network snapshots OR last SwitchPort probe
  const availableMacChoices = useMemo(() => {
    const map = new Map<string, { mac: string; label: string; ips: string[]; status: string }>();

    const addAdapter = (rawMac: string, name: string, ips: string[], status: string) => {
      const mac = String(rawMac || '').trim();
      if (!mac || /^00[:.-]00[:.-]00/.test(mac)) return;
      const key = mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
      if (!key || key.length !== 12 || map.has(key)) return;
      map.set(key, {
        mac,
        label: name ? `${name} (${mac})` : mac,
        ips: ips.filter(Boolean),
        status: status || 'Unknown',
      });
    };

    const adaptersFromNet: any[] = Array.isArray(networkData?.adapters) ? networkData.adapters : [];
    for (const ad of adaptersFromNet) {
      addAdapter(
        ad.macAddress,
        ad.name || ad.description || '',
        Array.isArray(ad.ipv4Addresses) ? ad.ipv4Addresses : [],
        ad.status || ''
      );
    }

    const adaptersFromResult = Array.isArray(data?.endpointAdapters) ? data.endpointAdapters : [];
    for (const ad of adaptersFromResult) {
      addAdapter(ad.macAddress, ad.name || ad.description || '', ad.ipv4Addresses || [], ad.status || '');
    }

    if (healthData?.macAddress) {
      addAdapter(
        healthData.macAddress,
        healthData.hostname ? `${healthData.hostname} (Primary)` : 'Primary NIC',
        healthData.primaryIp ? [healthData.primaryIp] : [],
        'Up'
      );
    }

    return Array.from(map.values());
  }, [networkData, healthData, data]);

  const effectivePreferredMac = useMemo(() => {
    if (selectedMacOverride !== 'auto') return selectedMacOverride;
    if (targetIp.trim()) {
      const exactMatch = availableMacChoices.find((c) => c.ips.includes(targetIp.trim()));
      if (exactMatch) return exactMatch.mac;
    }
    const upAdapter = availableMacChoices.find((c) => c.status.toLowerCase() === 'up');
    return upAdapter?.mac || availableMacChoices[0]?.mac || undefined;
  }, [selectedMacOverride, availableMacChoices, targetIp]);

  const handleTriggerTrace = (forceRefresh: boolean, modeOverride?: 'fast_hop' | 'full_parallel') => {
    const modeToUse = modeOverride || traceMode;
    onTraceSwitchPort({
      endpointMac: effectivePreferredMac,
      forceRefresh,
      traceMode: modeToUse,
    });
  };

  const tracker = data?.tracker;
  const reasonCode = tracker?.reasonCode;
  const finalEdge = tracker?.finalEdgePort;
  const pathHops = Array.isArray(tracker?.pathHops) ? tracker.pathHops : [];
  const camEntries = Array.isArray(tracker?.camEntries) ? tracker.camEntries : [];
  const arpEntries = Array.isArray(tracker?.arpEntries) ? tracker.arpEntries : [];
  const unreachableSwitches = Array.isArray(tracker?.unreachableSwitches) ? tracker.unreachableSwitches : [];

  const HopArrow = isEn ? ArrowRight : ArrowLeft;
  const trimmedTargetIp = targetIp.trim();
  const canStart = Boolean(trimmedTargetIp) && canRunDiagnostics && !loading;

  const isCenteredDiagnosticState =
    Boolean(data && tracker) &&
    (reasonCode === 'no_switches_in_inventory' ||
      reasonCode === 'no_switches_in_rbac_scope' ||
      reasonCode === 'all_switches_unreachable' ||
      reasonCode === 'mac_not_found' ||
      reasonCode === 'arp_unresolved');

  return (
    <div className="space-y-6">
      {/* Top Control & Trigger Banner (On-Demand — Never Auto-Stalls Connect & Inspect) */}
      <div className={`rounded-2xl border p-5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 ${surfaceBg}`}>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl border ${
                isLightMode
                  ? 'bg-teal-50 border-teal-200 text-teal-600'
                  : 'bg-teal-500/15 border-teal-500/30 text-teal-400'
              }`}
            >
              <Waypoints className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className={`text-base font-bold ${textPrimary}`}>
                  {isEn
                    ? 'Physical Switch Port & Network Path Locator'
                    : 'ردیاب پورت سوئیچ متصل و مسیر فیزیکی شبکه'}
                </h2>
                <FieldInfoTooltip
                  title={isEn ? 'Switch Port & Path Discovery' : 'کشف پورت سوئیچ و مسیر شبکه'}
                  whatIsIt={
                    isEn
                      ? 'Discovers which physical switch, access port, VLAN, and upstream trunk path serves this workstation by querying CAM/Bridge & ARP tables via SSH on switches/routers registered in Devices (no SNMP required).'
                      : 'با استفاده از مک‌آدرس کارت شبکه سیستم کاربر (یا جدول ARP) و استعلام مستقیم جداول CAM از سوئیچ‌ها و روترهای ثبت‌شده در بخش تجهیزات (بدون نیاز به SNMP و صرفاً از طریق SSH)، دقیقاً مشخص می‌کند سیستم به کدام پورت از کدام سوئیچ متصل است.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Eliminates manual switch-by-switch hunting when tracing cable faults, VLAN issues, or unauthorized port connections without slowing down other HelpDesk tabs.'
                      : 'بدون معطل شدن تب‌های دیگر هلپ‌دسک و بدون نیاز به بررسی دستی تک‌تک سوئیچ‌ها، محل فیزیکی پورت کلاینت، VLAN و مسیر آپلینک تا سوئیچ اکسس را به صورت آنی مشخص می‌کند.'
                  }
                  example={
                    isEn
                      ? 'Enter workstation IP above -> click "Discover Switch Port" -> trace Access switch & port (e.g. SW-Floor2 / Gi1/0/14).'
                      : 'آی‌پی سیستم کاربر را وارد کنید ← دکمه «بررسی و کشف پورت سوئیچ» را بزنید ← نام سوئیچ، پورت اکسس و VLAN را مشاهده کنید.'
                  }
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>
              <p className={`text-xs ${textMuted}`}>
                {isEn
                  ? 'On-demand SSH MAC/ARP lookup across Switches/Routers in Devices (isolated so other HelpDesk tabs never wait).'
                  : 'استعلام لحظه‌ای جدول MAC/ARP از سوئیچ‌های ثبت‌شده در تجهیزات از طریق SSH (کاملاً مجزا از اتصال اولیه جهت جلوگیری از تأخیر در سایر تب‌ها).'}
              </p>
            </div>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* MAC Selector when multiple NICs or cached MAC available */}
          {availableMacChoices.length > 0 && (
            <div className="flex items-center gap-1.5">
              <select
                value={selectedMacOverride}
                onChange={(e) => setSelectedMacOverride(e.target.value)}
                disabled={loading}
                className={`px-2.5 py-2 rounded-xl border text-xs font-mono outline-none ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-800'
                    : 'bg-slate-950 border-slate-700 text-slate-200'
                }`}
                dir="ltr"
              >
                <option value="auto">
                  {isEn ? 'Auto NIC MAC' : 'مک‌آدرس خودکار'} ({effectivePreferredMac || '-'})
                </option>
                {availableMacChoices.map((c) => (
                  <option key={c.mac} value={c.mac}>
                    {c.label}
                  </option>
                ))}
              </select>
              <FieldInfoTooltip
                title={isEn ? 'Endpoint MAC Source' : 'انتخاب کارت شبکه مقصد'}
                whatIsIt={
                  isEn
                    ? 'Selects which MAC address of the workstation to trace across network switches.'
                    : 'تعیین می‌کند کدام مک‌آدرس سیستم کاربر (در صورت داشتن چند کارت شبکه یا وای‌فای/لن) روی سوئیچ‌ها ردیابی شود.'
                }
                whyNeeded={
                  isEn
                    ? 'Providing the MAC directly skips L3 ARP discovery sweeps across routers and speeds up switch port lookup.'
                    : 'ارسال مستقیم MAC از سیستم باعث حذف مرحله استعلام ARP روی روترها و افزایش چشمگیر سرعت یافتن پورت می‌شود.'
                }
                example="Auto NIC MAC / 00:50:56:A1:22:34"
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>
          )}

          {/* Trace Strategy Toggle */}
          <div
            className={`inline-flex items-center p-1 rounded-xl border text-xs ${
              isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={() => setTraceMode('fast_hop')}
              disabled={loading}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                traceMode === 'fast_hop'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : textMuted
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isEn ? 'Fast Hop-by-Hop' : 'سریع (مسیر توپولوژی)'}</span>
            </button>
            <button
              type="button"
              onClick={() => setTraceMode('full_parallel')}
              disabled={loading}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                traceMode === 'full_parallel'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : textMuted
              }`}
            >
              <Radar className="w-3.5 h-3.5" />
              <span>{isEn ? 'All Switches' : 'اسکن همه سوئیچ‌ها'}</span>
            </button>
          </div>

          {/* Primary Refresh / Discover Action */}
          <button
            type="button"
            onClick={() => handleTriggerTrace(Boolean(data))}
            disabled={!canStart}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span>
              {loading
                ? isEn
                  ? 'Tracing Switches...'
                  : 'در حال ردیابی سوئیچ‌ها...'
                : data
                ? isEn
                  ? 'Refresh Live Data'
                  : 'بروزرسانی زنده'
                : isEn
                ? 'Discover Switch Port'
                : 'کشف پورت سوئیچ متصل'}
            </span>
          </button>
        </div>
      </div>

      {/* Explicit Error Alert */}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 flex items-start gap-3 text-xs text-rose-500">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0 flex-1">
            <div className="font-bold">
              {isEn ? 'Switch Port Discovery Failed' : 'خطا در اجرای ردیابی پورت سوئیچ'}
            </div>
            <div className={`break-words ${isLightMode ? 'text-rose-800' : 'text-rose-200'}`}>
              {error}
            </div>
          </div>
        </div>
      )}

      {/* State 1: Initial On-Demand Ready Prompt (Before First Click) */}
      {!data && !loading && (
        <div className={`rounded-2xl border p-10 text-center space-y-4 ${surfaceBg}`}>
          <div
            className={`w-14 h-14 mx-auto rounded-2xl border flex items-center justify-center ${
              isLightMode
                ? 'bg-teal-50 border-teal-200 text-teal-600'
                : 'bg-teal-500/15 border-teal-500/30 text-teal-400'
            }`}
          >
            <Waypoints className="w-7 h-7" />
          </div>

          <h3 className={`text-base font-bold ${textPrimary}`}>
            {isEn
              ? 'On-Demand Switch Port & Network Path Discovery'
              : 'آماده کشف پورت سوئیچ متصل به سیستم کاربر'}
          </h3>

          <p className={`text-xs max-w-2xl mx-auto leading-relaxed ${textMuted}`}>
            {isEn
              ? 'To avoid slowing down initial workstation diagnostics, switch SSH queries run only when you request them. Click the button below to extract the endpoint NIC MAC address (or resolve via L3 ARP) and trace which switch and physical port serve this host.'
              : 'برای جلوگیری از معطلی سایر تب‌های هلپ‌دسک، استعلام سوئیچ‌ها فقط با درخواست شما انجام می‌شود. با کلیک روی دکمه زیر، ابتدا مک‌آدرس کارت شبکه سیستم کاربر خوانده شده (یا از طریق جدول ARP استعلام می‌شود) و سپس از طریق SSH روی سوئیچ‌های تعریف‌شده در بخش «تجهیزات»، پورت فیزیکی و مسیر شبکه کشف می‌گردد.'}
          </p>

          {!trimmedTargetIp && (
            <div
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs ${
                isLightMode
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-amber-950/40 border-amber-500/35 text-amber-300'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {isEn
                  ? 'Enter Target Workstation IP in the connection bar above first.'
                  : 'ابتدا آدرس IP سیستم کاربر را در نوار اتصال بالای صفحه وارد کنید.'}
              </span>
            </div>
          )}

          {trimmedTargetIp && !hasCredentials && (
            <div
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs ${
                isLightMode
                  ? 'bg-sky-50 border-sky-200 text-sky-800'
                  : 'bg-sky-950/35 border-sky-500/30 text-sky-300'
              }`}
            >
              <HelpCircle className="w-4 h-4 shrink-0" />
              <span>
                {isEn
                  ? 'Tip: Endpoint credentials are optional here — if omitted, MAC will be resolved via L3 switch/router ARP tables.'
                  : 'نکته: وارد کردن یوزر و پسورد سیستم کاربر اختیاری است؛ در صورت نبود دسترسی به سیستم، مک‌آدرس از جدول ARP سوئیچ‌های لایه ۳ استخراج می‌شود.'}
              </span>
            </div>
          )}

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => handleTriggerTrace(true)}
              disabled={!canStart}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition cursor-pointer"
            >
              <Waypoints className="w-4 h-4" />
              <span>{isEn ? 'Discover Connected Switch Port' : 'کشف پورت سوئیچ متصل'}</span>
            </button>
          </div>
        </div>
      )}

      {/* State 2: Live Tracing Loading State */}
      {loading && (
        <div className={`rounded-2xl border p-12 text-center space-y-3 ${surfaceBg}`}>
          <Loader2 className="w-9 h-9 mx-auto text-teal-500 animate-spin" />
          <div className={`text-sm font-bold ${textPrimary}`}>
            {isEn
              ? `Tracing physical switch port for ${trimmedTargetIp}...`
              : `در حال ردیابی پورت سوئیچ متصل برای ${trimmedTargetIp}...`}
          </div>
          <p className={`text-xs max-w-lg mx-auto ${textMuted}`}>
            {isEn
              ? 'Resolving workstation MAC address and querying CAM/Bridge tables across authorized switches over SSH.'
              : 'در حال استخراج مک‌آدرس سیستم کاربر و استعلام جدول MAC (CAM) از سوئیچ‌های مجاز از طریق SSH...'}
          </p>
        </div>
      )}

      {/* State 3: Centered Clear Explanatory Empty / Diagnostic States */}
      {!loading && data && tracker && isCenteredDiagnosticState && (
        <div className={`rounded-2xl border p-8 sm:p-10 text-center space-y-5 ${surfaceBg}`}>
          <div
            className={`w-14 h-14 mx-auto rounded-2xl border flex items-center justify-center ${
              reasonCode === 'no_switches_in_rbac_scope'
                ? isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-600'
                  : 'bg-rose-500/15 border-rose-500/35 text-rose-400'
                : isLightMode
                ? 'bg-amber-50 border-amber-200 text-amber-600'
                : 'bg-amber-500/15 border-amber-500/35 text-amber-400'
            }`}
          >
            {reasonCode === 'no_switches_in_rbac_scope' ? (
              <ShieldAlert className="w-7 h-7" />
            ) : (
              <AlertTriangle className="w-7 h-7" />
            )}
          </div>

          <div className="space-y-2 max-w-2xl mx-auto">
            <h3 className={`text-base font-bold ${textPrimary}`}>
              {reasonCode === 'no_switches_in_inventory' &&
                (isEn
                  ? 'No Switches Registered in Devices Inventory'
                  : 'هیچ سوئیچی در بخش تجهیزات (Devices) تعریف نشده است')}
              {reasonCode === 'no_switches_in_rbac_scope' &&
                (isEn
                  ? 'No Switches Accessible Under Your RBAC Policy'
                  : 'سوئیچ‌های شبکه خارج از محدوده دسترسی (RBAC) شما هستند')}
              {reasonCode === 'all_switches_unreachable' &&
                (isEn
                  ? 'Unable to Reach Any Registered Switch Over SSH'
                  : 'امکان برقراری ارتباط SSH با سوئیچ‌های تعریف‌شده وجود ندارد')}
              {reasonCode === 'mac_not_found' &&
                (isEn
                  ? 'Endpoint MAC Not Found in Any Active Switch CAM Table'
                  : 'مک‌آدرس این سیستم در جدول MAC سوئیچ‌های فعال پیدا نشد')}
              {reasonCode === 'arp_unresolved' &&
                (isEn
                  ? 'Could Not Resolve Workstation MAC Address'
                  : 'مک‌آدرس سیستم کاربر استخراج نشد')}
            </h3>

            <p className={`text-xs leading-relaxed ${textMuted}`}>
              {reasonCode === 'no_switches_in_inventory' &&
                (isEn
                  ? 'Because switches in this environment are managed via SSH (without SNMP), switch port discovery requires your network switches or routers to be added in the Devices module. Currently 0 switches or routers exist in Devices, so port data cannot be retrieved.'
                  : 'از آنجا که سوئیچ‌های شبکه از طریق SSH مدیریت می‌شوند (بدون SNMP)، برای کشف پورت متصل باید سوئیچ‌ها یا روترهای شبکه از قبل در بخش «تجهیزات (Devices)» تعریف شده باشند. در حال حاضر هیچ سوئیچی در سیستم ثبت نشده است و به همین دلیل دیتای پورت نمایش داده نمی‌شود.')}

              {reasonCode === 'no_switches_in_rbac_scope' &&
                (isEn
                  ? `${tracker.switchesConfiguredCount ?? 0} network switch(es) exist in the system, but your account policy does not allow inspecting ports on them (or Device access is restricted).`
                  : `تعداد ${tracker.switchesConfiguredCount ?? 0} سوئیچ/روتر در سیستم تعریف شده است، اما پالیسی دسترسی (RBAC) حساب کاربری شما مجوز مشاهده تجهیزات یا بررسی پورت‌های این سوئیچ‌ها را ندارد.`)}

              {reasonCode === 'all_switches_unreachable' &&
                (isEn
                  ? `Scanned ${tracker.switchesScannedCount} registered switch(es), but 0 responded over SSH (port 22 timed out, unreachable, or authentication failed). Verify switch reachability and credentials in Devices.`
                  : `تعداد ${tracker.switchesScannedCount} سوئیچ بررسی شد اما هیچ‌کدام به اتصال SSH پاسخ ندادند (خطای Timeout، قطعی شبکه یا اطلاعات ورود نامعتبر). وضعیت دسترسی و رمز سوئیچ‌ها را در بخش تجهیزات بررسی کنید.`)}

              {reasonCode === 'mac_not_found' &&
                (isEn
                  ? `Successfully queried ${tracker.switchesActiveCount} of ${tracker.switchesScannedCount} active switch(es), but MAC ${tracker.resolvedMac || '-'} was absent from their live CAM tables. Common reasons: (1) The final access switch isn't registered in Devices yet; (2) The endpoint is behind an unmanaged switch, Wi-Fi AP, or VPN tunnel; (3) No recent Layer-2 traffic crossed the registered switches.`
                  : `تعداد ${tracker.switchesActiveCount} سوئیچ از ${tracker.switchesScannedCount} سوئیچ با موفقیت بررسی شدند، اما مک‌آدرس ${tracker.resolvedMac || '-'} در جدول CAM فعلی آن‌ها وجود نداشت. علل متداول: ۱) سوئیچ اکسس نهایی هنوز در بخش «تجهیزات» تعریف نشده است؛ ۲) سیستم پشت یک سوئیچ غیرمدیریتی (Unmanaged)، اکسس‌پوینت وای‌فای یا تونل VPN قرار دارد؛ ۳) اخیراً ترافیک لایه ۲ از سمت سیستم عبور نکرده است.`)}

              {reasonCode === 'arp_unresolved' &&
                (isEn
                  ? `Queried ${tracker.switchesActiveCount} switch(es), but could not obtain the endpoint's MAC address (neither from endpoint credentials nor from router/L3 switch ARP tables for IP ${trimmedTargetIp}). Enter workstation credentials above or ensure the Layer-3 gateway is registered in Devices.`
                  : `با وجود بررسی ${tracker.switchesActiveCount} سوئیچ، مک‌آدرس سیستم (${trimmedTargetIp}) نه به صورت مستقیم از خود ویندوز/لینوکس قابل دریافت بود و نه در جدول ARP روترها/سوئیچ‌های لایه ۳ یافت شد. برای رفع مشکل، مشخصات ورود سیستم کاربر را در نوار بالا وارد کنید یا گیت‌وی لایه ۳ شبکه را در بخش تجهیزات ثبت نمایید.`)}
            </p>
          </div>

          {/* Endpoint Identity Chip even when Switches didn't match */}
          {(tracker.resolvedMac || data.endpointHostname) && (
            <div
              className={`max-w-xl mx-auto rounded-xl border p-3.5 text-xs flex flex-wrap items-center justify-center gap-3 ${subSurfaceBg}`}
            >
              {data.endpointHostname && (
                <span className={`font-semibold ${textPrimary}`}>
                  {isEn ? 'Endpoint:' : 'نام سیستم:'}{' '}
                  <span className="font-mono">{data.endpointHostname}</span>
                </span>
              )}
              {tracker.resolvedMac && (
                <span className={`font-mono ${textPrimary}`} dir="ltr">
                  MAC: {tracker.resolvedMac}
                </span>
              )}
              {tracker.vendor?.vendor && (
                <span className={textMuted}>
                  {isEn ? 'NIC Vendor:' : 'سازنده کارت شبکه:'} {tracker.vendor.vendor}
                </span>
              )}
            </div>
          )}

          {data.endpointProbeWarning && (
            <div
              className={`max-w-xl mx-auto rounded-xl border px-3.5 py-2 text-[11px] ${
                isLightMode
                  ? 'bg-slate-100 border-slate-200 text-slate-700'
                  : 'bg-slate-950/80 border-slate-800 text-slate-300'
              }`}
            >
              {isEn ? 'Endpoint NIC Probe Note: ' : 'توضیح استعلام مستقیم از سیستم: '}
              {data.endpointProbeWarning}
            </div>
          )}

          {/* Switch SSH Failure Table when unreachableSwitches exist */}
          {unreachableSwitches.length > 0 && (
            <div className={`max-w-2xl mx-auto rounded-xl border p-3.5 text-left ${subSurfaceBg}`} dir={isEn ? 'ltr' : 'rtl'}>
              <div className={`text-xs font-bold mb-2 ${textPrimary}`}>
                {isEn
                  ? `Switch Connection Diagnostics (${unreachableSwitches.length})`
                  : `جزئیات خطای اتصال سوئیچ‌ها (${unreachableSwitches.length})`}
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto text-[11px]">
                {unreachableSwitches.map((sw) => (
                  <div
                    key={sw.switchId}
                    className={`flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <span className={`font-semibold font-mono ${textPrimary}`} dir="ltr">
                      {sw.switchName} ({sw.switchIp})
                    </span>
                    <span className="text-rose-500 font-mono truncate max-w-sm" dir="ltr" title={sw.error}>
                      {sw.error}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recovery Actions */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            {canViewDevicesModule && data.rbac.canOpenDevicesModule && onNavigateToDevices && (
              <button
                type="button"
                onClick={onNavigateToDevices}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition cursor-pointer"
              >
                <Server className="w-4 h-4" />
                <span>
                  {reasonCode === 'no_switches_in_inventory'
                    ? isEn
                      ? 'Go to Devices to Add Switches'
                      : 'رفتن به بخش تجهیزات برای تعریف سوئیچ'
                    : isEn
                    ? 'Open Network Devices'
                    : 'مشاهده تجهیزات شبکه'}
                </span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}

            {reasonCode === 'mac_not_found' && tracker.traceStrategyUsed === 'fast_hop' && (
              <button
                type="button"
                onClick={() => handleTriggerTrace(true, 'full_parallel')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
                  isLightMode
                    ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                <Radar className="w-4 h-4 text-teal-500" />
                <span>{isEn ? 'Force Full Scan Across All Switches' : 'اسکن کامل تمام سوئیچ‌ها'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleTriggerTrace(true)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                isLightMode
                  ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5 text-teal-500" />
              <span>{isEn ? 'Retry Discovery' : 'تلاش مجدد'}</span>
            </button>
          </div>
        </div>
      )}

      {/* State 4: Valid Discovery Result (Found or Uplink-Only Partial Discovery) */}
      {!loading && data && tracker && !isCenteredDiagnosticState && (
        <div className="space-y-6">
          {reasonCode === 'uplink_only' && (
            <div
              className={`rounded-xl border p-4 flex items-start gap-3 text-xs ${
                isLightMode
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-amber-950/35 border-amber-500/40 text-amber-200'
              }`}
            >
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold">
                  {isEn
                    ? 'Only Upstream Uplink / Trunk Port Observed'
                    : 'تنها پورت آپلینک / ترانک بالادستی مشاهده شد'}
                </div>
                <p>
                  {isEn
                    ? 'This MAC address appeared on a trunk/Port-Channel/uplink port, indicating an intermediate switch or unregistered downstream access switch sits between that port and the endpoint. Add the downstream access switch in Devices to see the exact edge wall-jack port.'
                    : 'این مک‌آدرس روی یک پورت ترانک یا Port-Channel (آپلینک بین‌سوئیچی) دیده شده است. این موضوع معمولاً نشان می‌دهد سوئیچ اکسس نهایی هنوز در بخش تجهیزات تعریف نشده یا خاموش است؛ با این حال نزدیک‌ترین سوئیچ بالادستی و مسیر در زیر نمایش داده شده است.'}
                </p>
              </div>
            </div>
          )}

          {/* Hero Card: Connected Switch & Physical Edge Port */}
          {finalEdge && (
            <div className={`rounded-2xl border p-5 space-y-4 ${surfaceBg}`}>
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div
                    className={`p-3 rounded-2xl border shrink-0 ${
                      finalEdge.isUplink
                        ? isLightMode
                          ? 'bg-amber-50 border-amber-200 text-amber-600'
                          : 'bg-amber-500/15 border-amber-500/35 text-amber-400'
                        : isLightMode
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                        : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                    }`}
                  >
                    <Cable className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                          finalEdge.isUplink
                            ? isLightMode
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-amber-500/20 text-amber-300'
                            : isLightMode
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {finalEdge.isUplink
                          ? isEn
                            ? 'Nearest Observed Uplink Switch'
                            : 'نزدیک‌ترین سوئیچ آپلینک مشاهده‌شده'
                          : isEn
                          ? 'Verified Physical Access Port'
                          : 'پورت فیزیکی متصل (Access Port)'}
                      </span>
                      <span className={`text-[11px] font-mono ${textMuted}`}>
                        {tracker.cached
                          ? isEn
                            ? 'Cached Lookup'
                            : 'نتیجه کش'
                          : isEn
                          ? 'Live SSH Scan'
                          : 'اسکن زنده SSH'}{' '}
                        · {tracker.durationMs} ms ·{' '}
                        {tracker.switchesActiveCount}/{tracker.switchesScannedCount}{' '}
                        {isEn ? 'switches active' : 'سوئیچ فعال'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-baseline gap-2.5">
                      <h3 className={`text-lg font-extrabold ${textPrimary}`}>
                        {finalEdge.switchName}
                      </h3>
                      <span className="font-mono text-xs text-teal-500 font-semibold" dir="ltr">
                        {finalEdge.switchIp}
                      </span>
                      {finalEdge.switchVendor && (
                        <span
                          className={`px-2 py-0.5 rounded border text-[11px] font-medium ${subSurfaceBg} ${textMuted}`}
                        >
                          {finalEdge.switchVendor}
                          {finalEdge.switchModel ? ` · ${finalEdge.switchModel}` : ''}
                        </span>
                      )}
                    </div>

                    <p className={`text-xs ${textMuted}`}>
                      {isEn ? tracker.edgeSummary.explanationEn : tracker.edgeSummary.explanationFa}
                    </p>
                  </div>
                </div>

                {/* Port Badge + RBAC Device Navigation Actions */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => copyValue(`${finalEdge.switchName} (${finalEdge.switchIp}) - Port ${finalEdge.port} - VLAN ${finalEdge.vlan}`)}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border font-mono text-sm font-extrabold transition cursor-pointer ${
                      isLightMode
                        ? 'bg-teal-50 border-teal-300 text-teal-800 hover:bg-teal-100'
                        : 'bg-teal-950/60 border-teal-500/45 text-teal-300 hover:bg-teal-900/50'
                    }`}
                    dir="ltr"
                  >
                    <span>{finalEdge.port}</span>
                    {copiedText?.includes(finalEdge.port) ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 opacity-70" />
                    )}
                  </button>

                  {data.rbac.canInspectMatchedSwitchPorts && onInspectSwitchPorts && (
                    <button
                      type="button"
                      onClick={() => onInspectSwitchPorts(finalEdge.switchId)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition cursor-pointer"
                    >
                      <Network className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Inspect Switch Ports' : 'مدیریت پورت‌های سوئیچ'}</span>
                    </button>
                  )}

                  {data.rbac.canOpenMatchedSwitchTerminal && onConnectSwitchTerminal && (
                    <button
                      type="button"
                      onClick={() => onConnectSwitchTerminal(finalEdge.switchId, finalEdge.port)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                        isLightMode
                          ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                      }`}
                    >
                      <Terminal className="w-3.5 h-3.5 text-teal-500" />
                      <span>{isEn ? 'Switch SSH' : 'ترمینال سوئیچ'}</span>
                    </button>
                  )}

                  {data.rbac.canOpenDevicesModule && onNavigateToDevices && (
                    <button
                      type="button"
                      onClick={onNavigateToDevices}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                        isLightMode
                          ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                          : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                    >
                      <Server className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Devices' : 'تجهیزات'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 4 Key Telemetry KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-1">
                <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
                  <div className={textMuted}>{isEn ? 'Physical Port & VLAN' : 'پورت فیزیکی و VLAN'}</div>
                  <div className={`mt-1 font-mono font-bold text-sm ${textPrimary}`} dir="ltr">
                    {finalEdge.port} · VLAN {finalEdge.vlan || '-'}
                  </div>
                  <div className={`mt-0.5 text-[11px] ${textMuted}`}>
                    {isEn ? 'Learning Type:' : 'نوع یادگیری:'} {finalEdge.type || 'DYNAMIC'}
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
                  <div className={textMuted}>{isEn ? 'Endpoint MAC Address' : 'مک‌آدرس سیستم کاربر'}</div>
                  <div className={`mt-1 font-mono font-bold text-sm ${textPrimary}`} dir="ltr">
                    {tracker.resolvedMac || '-'}
                  </div>
                  <div className={`mt-0.5 text-[11px] ${textMuted}`}>
                    {data.endpointMacSource === 'endpoint_live'
                      ? isEn
                        ? 'Read live from endpoint NIC'
                        : 'خوانده‌شده مستقیم از کارت شبکه سیستم'
                      : data.endpointMacSource === 'client_cached'
                      ? isEn
                        ? 'From inspected adapter inventory'
                        : 'از کارت شبکه شناسایی‌شده سیستم'
                      : isEn
                      ? 'Resolved via switch L3 ARP table'
                      : 'یافت‌شده از جدول ARP روتر/سوئیچ'}
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
                  <div className={textMuted}>{isEn ? 'NIC Manufacturer (OUI)' : 'سازنده کارت شبکه (OUI)'}</div>
                  <div className={`mt-1 font-bold text-sm truncate ${textPrimary}`} title={tracker.vendor?.vendor}>
                    {tracker.vendor?.vendor || (isEn ? 'Unknown Vendor' : 'نامشخص')}
                  </div>
                  <div className={`mt-0.5 text-[11px] font-mono ${textMuted}`} dir="ltr">
                    OUI {tracker.vendor?.prefix || '-'} · IP {tracker.resolvedIp || data.targetIp || '-'}
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
                  <div className={textMuted}>{isEn ? 'Trace Accuracy & Scope' : 'دقت تشخیص و وضعیت اسکن'}</div>
                  <div className={`mt-1 font-bold text-sm ${textPrimary}`}>
                    {tracker.edgeSummary.confidence === 'high'
                      ? isEn
                        ? 'High Confidence Edge Port'
                        : 'تطبیق قطعی پورت اکسس'
                      : tracker.edgeSummary.confidence === 'medium'
                      ? isEn
                        ? 'Medium (Uplink/Chain)'
                        : 'متوسط (احتمال آپلینک میانی)'
                      : isEn
                      ? 'Low Confidence'
                      : 'دقت پایین'}
                  </div>
                  <div className={`mt-0.5 text-[11px] ${textMuted}`}>
                    {tracker.traceStrategyUsed === 'fast_hop'
                      ? isEn
                        ? 'Fast Hop-by-Hop Trace'
                        : 'مسیر سریع هاپ‌به‌‌هاپ'
                      : isEn
                      ? 'Full Parallel Switch Scan'
                      : 'اسکن کامل هم‌زمان سوئیچ‌ها'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Hop-by-Hop Network Path Visualization */}
          {pathHops.length > 0 && (
            <div className={`rounded-2xl border p-5 space-y-4 ${surfaceBg}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Waypoints className="w-4 h-4 text-teal-500" />
                  <h4 className={`text-sm font-bold ${textPrimary}`}>
                    {isEn ? 'Hop-by-Hop Physical Network Path' : 'مسیر فیزیکی شبکه تا سیستم کاربر (Hop-by-Hop)'}
                  </h4>
                  <FieldInfoTooltip
                    title={isEn ? 'Hop-by-Hop Path' : 'مسیر هاپ‌به‌‌هاپ'}
                    whatIsIt={
                      isEn
                        ? 'Shows every switch from Core/Distribution down to the Access edge switch carrying this workstation MAC address, distinguishing inter-switch uplinks from the final endpoint port.'
                        : 'تمام سوئیچ‌هایی که مک‌آدرس سیستم کاربر در جدول آن‌ها مشاهده شده را به ترتیب لایه (Core تا Access) نمایش داده و پورت‌های ترانک میانی را از پورت نهایی کاربر تفکیک می‌کند.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Verifies whether traffic passes through intermediate switches cleanly and highlights missing topology devices if a hop ends on a trunk.'
                        : 'مشخص می‌کند ترافیک از چه سوئیچ‌هایی عبور کرده و اگر یک سوئیچ میانی در مسیر مشکل داشته باشد، دقیقاً در کدام هاپ قرار دارد.'
                    }
                    example="Core-SW (Te1/1/1) -> Access-SW (Gi1/0/14) -> Endpoint"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <span className={`text-[11px] font-mono ${textMuted}`}>
                  {pathHops.length} {isEn ? 'switch hop(s)' : 'هاپ سوئیچ'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {pathHops.map((hop, idx) => (
                  <React.Fragment key={`${hop.switchId}-${hop.hopNumber}`}>
                    <div
                      className={`min-w-[200px] flex-1 max-w-xs p-3.5 rounded-xl border space-y-1.5 ${
                        hop.isEdge && !hop.isUplink
                          ? isLightMode
                            ? 'bg-emerald-50/70 border-emerald-300'
                            : 'bg-emerald-950/30 border-emerald-500/45'
                          : subSurfaceBg
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-mono font-bold text-teal-500">
                          #{hop.hopNumber} · {hop.switchRole || 'Switch'}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded font-semibold ${
                            hop.isEdge && !hop.isUplink
                              ? 'bg-emerald-500/20 text-emerald-500'
                              : 'bg-amber-500/15 text-amber-500'
                          }`}
                        >
                          {hop.isUplink
                            ? isEn
                              ? 'Uplink'
                              : 'آپلینک'
                            : isEn
                            ? 'Edge Port'
                            : 'پورت اکسس'}
                        </span>
                      </div>
                      <div className={`text-xs font-bold truncate ${textPrimary}`}>
                        {hop.switchName}
                      </div>
                      <div className={`text-[11px] font-mono ${textMuted}`} dir="ltr">
                        {hop.switchIp} · <strong className={textPrimary}>{hop.port}</strong> · VLAN{' '}
                        {hop.vlan || '-'}
                      </div>
                      {hop.peerDeviceName && (
                        <div className={`text-[10px] ${textMuted}`}>
                          {isEn ? 'Peer:' : 'متصل به:'} {hop.peerDeviceName}
                          {hop.peerPort ? ` (${hop.peerPort})` : ''}
                        </div>
                      )}
                    </div>
                    {idx < pathHops.length - 1 && (
                      <HopArrow className={`w-4 h-4 shrink-0 ${textMuted}`} />
                    )}
                  </React.Fragment>
                ))}

                <HopArrow className={`w-4 h-4 shrink-0 text-teal-500`} />

                <div
                  className={`min-w-[190px] p-3.5 rounded-xl border space-y-1 ${
                    isLightMode
                      ? 'bg-sky-50 border-sky-300'
                      : 'bg-sky-950/35 border-sky-500/45'
                  }`}
                >
                  <div className="text-[11px] font-bold text-sky-500">
                    {isEn ? 'Target Workstation' : 'سیستم کاربر نهایی'}
                  </div>
                  <div className={`text-xs font-bold truncate ${textPrimary}`}>
                    {data.endpointHostname || tracker.resolvedIp || data.targetIp}
                  </div>
                  <div className={`text-[11px] font-mono ${textMuted}`} dir="ltr">
                    {tracker.resolvedIp || data.targetIp} · {tracker.resolvedMac || '-'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Detailed CAM Table Observations */}
          {camEntries.length > 0 && (
            <div className={`rounded-2xl border overflow-hidden ${surfaceBg}`}>
              <div className={`px-5 py-3.5 border-b flex items-center justify-between ${isLightMode ? 'border-slate-200' : 'border-slate-800'}`}>
                <div className="text-xs font-bold flex items-center gap-2">
                  <Network className="w-4 h-4 text-teal-500" />
                  <span className={textPrimary}>
                    {isEn
                      ? `Observed Switch CAM / Bridge Entries (${camEntries.length})`
                      : `رکوردهای جدول MAC سوئیچ‌ها (${camEntries.length})`}
                  </span>
                </div>
                {arpEntries.length > 0 && (
                  <span className={`text-[11px] font-mono ${textMuted}`}>
                    {arpEntries.length} {isEn ? 'L3 ARP match(es)' : 'رکورد ARP'}
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className={isLightMode ? 'bg-slate-50 text-slate-600' : 'bg-slate-950/60 text-slate-400'}>
                      <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Switch' : 'سوئیچ'}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Port' : 'پورت'}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">VLAN</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Role / Classification' : 'نوع و دسته‌بندی پورت'}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{isEn ? 'Neighbor / Link' : 'همسایه متصل'}</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/80'}`}>
                    {camEntries.map((entry, idx) => (
                      <tr key={`${entry.switchId}-${entry.port}-${idx}`}>
                        <td className="px-4 py-2.5">
                          <div className={`font-semibold ${textPrimary}`}>{entry.switchName}</div>
                          <div className={`text-[11px] font-mono ${textMuted}`} dir="ltr">
                            {entry.switchIp} · {entry.switchVendor}
                          </div>
                        </td>
                        <td className={`px-4 py-2.5 font-mono font-bold ${textPrimary}`} dir="ltr">
                          {entry.port}
                        </td>
                        <td className={`px-4 py-2.5 font-mono ${textPrimary}`} dir="ltr">
                          {entry.vlan || '-'}
                        </td>
                        <td className="px-4 py-2.5">
                          {entry.isFinalEdgePort && !entry.isUplink ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 font-semibold text-[11px]">
                              <CheckCircle2 className="w-3 h-3" />
                              {isEn ? 'Final Edge Port' : 'پورت نهایی کاربر'}
                            </span>
                          ) : entry.isUplink ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500 font-semibold text-[11px]">
                              {isEn ? 'Uplink / Trunk' : 'پورت آپلینک / ترانک'} ({entry.uplinkReason || 'trunk'})
                            </span>
                          ) : (
                            <span className={textMuted}>{entry.type}</span>
                          )}
                        </td>
                        <td className={`px-4 py-2.5 ${textMuted}`}>
                          {entry.peerDeviceName
                            ? `${entry.peerDeviceName}${entry.peerPort ? ` (${entry.peerPort})` : ''}`
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Partial Unreachable Switches Warning (Failure Transparency, Rule 8) */}
          {unreachableSwitches.length > 0 && (
            <div
              className={`rounded-xl border p-4 space-y-2 text-xs ${
                isLightMode
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : 'bg-slate-950/60 border-slate-800 text-slate-300'
              }`}
            >
              <div className="font-bold flex items-center gap-2 text-amber-500">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {isEn
                    ? `${unreachableSwitches.length} switch(es) did not respond during scan`
                    : `${unreachableSwitches.length} سوئیچ در این اسکن پاسخ ندادند`}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                {unreachableSwitches.map((sw) => (
                  <div
                    key={sw.switchId}
                    className={`px-3 py-1.5 rounded-lg border flex items-center justify-between gap-2 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <span className="font-mono font-semibold" dir="ltr">
                      {sw.switchName} ({sw.switchIp})
                    </span>
                    <span className="text-rose-500 font-mono truncate max-w-[220px]" dir="ltr" title={sw.error}>
                      {sw.error}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
