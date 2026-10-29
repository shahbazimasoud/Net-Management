import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  ShieldAlert,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  FileCode2,
  Sliders,
  Clock,
  Layers,
  Radio,
} from 'lucide-react';
import { Device } from '../../types';
import { useLanguage } from '../../i18n';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { updateCiscoConfigTab } from '../../services/api';

export interface CiscoL2SecurityTabProps {
  device: Device;
  initialConfig?: any;
  isPermitted: boolean;
  isLightMode?: boolean;
  onConfigApplied?: () => void;
}

export const CiscoL2SecurityTab: React.FC<CiscoL2SecurityTabProps> = ({
  device,
  initialConfig,
  isPermitted,
  isLightMode = false,
  onConfigApplied,
}) => {
  const { isEn } = useLanguage();

  const l2SecData = initialConfig?.l2_security || {};

  // Form States
  const [dhcpSnooping, setDhcpSnooping] = useState<boolean>(
    Boolean(l2SecData.dhcp_snooping)
  );
  const [dhcpVlans, setDhcpVlans] = useState<string>(
    l2SecData.dhcp_snooping_vlans || '1-100'
  );

  const [arpInspection, setArpInspection] = useState<boolean>(
    Boolean(l2SecData.arp_inspection)
  );
  const [arpVlans, setArpVlans] = useState<string>(
    l2SecData.arp_inspection_vlans || '10,20'
  );

  const [recoveryInterval, setRecoveryInterval] = useState<number>(
    l2SecData.errdisable_recovery_interval || 300
  );

  // Execution state
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{
    success: boolean;
    output?: string;
    error?: string;
  } | null>(null);

  // Sync with initialConfig
  useEffect(() => {
    if (l2SecData.dhcp_snooping !== undefined) setDhcpSnooping(l2SecData.dhcp_snooping);
    if (l2SecData.dhcp_snooping_vlans) setDhcpVlans(l2SecData.dhcp_snooping_vlans);
    if (l2SecData.arp_inspection !== undefined) setArpInspection(l2SecData.arp_inspection);
    if (l2SecData.arp_inspection_vlans) setArpVlans(l2SecData.arp_inspection_vlans);
    if (l2SecData.errdisable_recovery_interval) setRecoveryInterval(l2SecData.errdisable_recovery_interval);
  }, [initialConfig]);

  // Live generated CLI commands
  const generatedCli = useMemo(() => {
    const lines: string[] = ['configure terminal'];
    if (dhcpSnooping) {
      lines.push('ip dhcp snooping');
      if (dhcpVlans.trim()) {
        lines.push(`ip dhcp snooping vlan ${dhcpVlans.trim()}`);
      }
    } else {
      lines.push('no ip dhcp snooping');
    }

    if (arpInspection && arpVlans.trim()) {
      lines.push(`ip arp inspection vlan ${arpVlans.trim()}`);
    }

    if (recoveryInterval) {
      lines.push(`errdisable recovery interval ${recoveryInterval}`);
    }
    lines.push('end');
    return lines.join('\n');
  }, [dhcpSnooping, dhcpVlans, arpInspection, arpVlans, recoveryInterval]);

  // Apply to Switch
  const handleApply = async () => {
    if (!isPermitted || isApplying) return;
    setIsApplying(true);
    setApplyResult(null);

    const payload = {
      dhcp_snooping: dhcpSnooping,
      dhcp_snooping_vlans: dhcpSnooping ? dhcpVlans.trim() : undefined,
      arp_inspection: arpInspection,
      arp_inspection_vlans: arpInspection ? arpVlans.trim() : undefined,
      errdisable_recovery_interval: recoveryInterval,
    };

    try {
      const res = await updateCiscoConfigTab(device.id, 'l2_security', payload);
      if (res.success) {
        setApplyResult({
          success: true,
          output: res.output || (isEn ? 'Layer 2 security protections deployed successfully.' : 'تنظیمات امنیت لایه دو (DHCP Snooping و DAI) با موفقیت روی سوئیچ اعمال شدند.'),
        });
        if (onConfigApplied) onConfigApplied();
      } else {
        setApplyResult({
          success: false,
          error: res.error || (isEn ? 'Failed to apply Layer 2 security' : 'خطا در اعمال پیکربندی امنیت لایه دو'),
        });
      }
    } catch (err: any) {
      setApplyResult({
        success: false,
        error: err?.message || (isEn ? 'Communication error during security deployment' : 'خطای ارتباطی هنگام اعمال تنظیمات امنیتی'),
      });
    } finally {
      setIsApplying(false);
    }
  };

  // Reset Form
  const handleReset = () => {
    setDhcpSnooping(Boolean(l2SecData.dhcp_snooping));
    setDhcpVlans(l2SecData.dhcp_snooping_vlans || '1-100');
    setArpInspection(Boolean(l2SecData.arp_inspection));
    setArpVlans(l2SecData.arp_inspection_vlans || '10,20');
    setRecoveryInterval(l2SecData.errdisable_recovery_interval || 300);
    setApplyResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div
        className={`p-4 rounded-xl border flex items-center justify-between ${
          isLightMode
            ? 'bg-slate-100 border-slate-200 text-slate-800'
            : 'bg-slate-900/60 border-slate-800 text-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-xs sm:text-sm">
              {isEn ? 'Layer 2 Security Suite (DHCP Snooping & DAI)' : 'سوئیت امنیت لایه دو (DHCP Snooping و بازرسی ARP)'}
            </h4>
            <p className="text-xs opacity-75 mt-0.5">
              {isEn
                ? 'Neutralize rogue DHCP servers, ARP poisoning attacks, and configure auto-recovery intervals.'
                : 'مسدودسازی سرورهای نامعتبر DHCP، حملات جعل ARP و بازنشانی خودکار پورت‌های به وضعیت خطا رفته (Errdisable).'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold border ${
              dhcpSnooping
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            DHCP Snooping: {dhcpSnooping ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>

      {/* Grid: DHCP Snooping & DAI - Errdisable Recovery */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left Column: DHCP Snooping */}
        <div
          className={`p-5 rounded-2xl border space-y-4 shadow-xs ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-900/40 border-slate-800 text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-2.5">
            <h5 className="font-bold text-xs uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
              <Shield className="w-4 h-4" />
              <span>{isEn ? 'DHCP Snooping Hardening' : 'محافظت در برابر سرور DHCP جعلی'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'DHCP Snooping' : 'امنیت DHCP Snooping'}
              infoWhatEn="Builds a binding database mapping MAC, IP, lease time, and port. Untrusted ports are blocked from offering DHCP reply packets."
              infoWhatFa="جدول تطابق مک‌آدرس و آی‌پی معتبر ایجاد می‌کند. پورت‌های غیرقابل‌اعتماد دسترسی ارسال بسته‌های پاسخ DHCP به کاربران را نخواهند داشت."
              infoWhyEn="Stops rogue home Wi-Fi routers or attacker VMs from poisoning the default-gateway and intercepting user traffic."
              infoWhyFa="جلوگیری از اتصال روترهای متفرقه و حملات Man-in-the-Middle ناشی از پخش IP نامعتبر در شبکه."
              infoExampleEn="ip dhcp snooping, ip dhcp snooping vlan 1-100"
              infoExampleFa="ip dhcp snooping, ip dhcp snooping vlan 1-100"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* Global Toggle */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800'
            }`}
          >
            <div>
              <span className="text-xs font-bold block">
                {isEn ? 'Enable DHCP Snooping (ip dhcp snooping):' : 'فعال‌سازی DHCP Snooping:'}
              </span>
              <span className="text-[10px] opacity-70 font-mono">
                {isEn ? 'Filters rogue DHCP server packets' : 'مسدودسازی سرورهای متفرقه DHCP'}
              </span>
            </div>
            <input
              type="checkbox"
              checked={dhcpSnooping}
              onChange={(e) => setDhcpSnooping(e.target.checked)}
              disabled={!isPermitted}
              className="rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer w-4 h-4"
            />
          </div>

          {/* Active VLANs Input */}
          <div className="pt-2">
            <label className="block text-xs font-semibold mb-1">
              {isEn ? 'Protected VLANs (ip dhcp snooping vlan):' : 'ویلن‌های تحت پوشش محافظت DHCP:'}
            </label>
            <input
              type="text"
              value={dhcpVlans}
              onChange={(e) => setDhcpVlans(e.target.value)}
              disabled={!isPermitted || !dhcpSnooping}
              placeholder="e.g. 1-100 or 10,20,30"
              className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              } disabled:opacity-50`}
              dir="ltr"
            />
          </div>
        </div>

        {/* Right Column: Dynamic ARP Inspection & Errdisable Recovery */}
        <div
          className={`p-5 rounded-2xl border space-y-4 shadow-xs ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-900/40 border-slate-800 text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-2.5">
            <h5 className="font-bold text-xs uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
              <Zap className="w-4 h-4" />
              <span>{isEn ? 'Dynamic ARP Inspection (DAI) & Recovery' : 'بازرسی پویا ARP و بازیابی خودکار خطا'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'Dynamic ARP Inspection (DAI)' : 'بازرسی پویا ARP'}
              infoWhatEn="Intercepts all ARP requests and replies on untrusted ports, verifying valid IP-to-MAC bindings against the DHCP snooping table."
              infoWhatFa="تمام بسته‌های ARP را بررسی کرده و در صورت عدم تطابق با جدول DHCP Snooping آن‌ها را Drop می‌کند."
              infoWhyEn="Defeats ARP Poisoning and ARP Spoofing attacks that redirect traffic through an eavesdropper."
              infoWhyFa="جلوگیری کامل از حملات مسموم‌سازی کش ARP و سرقت اطلاعات کاربران."
              infoExampleEn="ip arp inspection vlan 10,20"
              infoExampleFa="ip arp inspection vlan 10,20"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* DAI Global Toggle */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800'
            }`}
          >
            <div>
              <span className="text-xs font-bold block">
                {isEn ? 'Enable Dynamic ARP Inspection (DAI):' : 'فعال‌سازی بازرسی پویا ARP (DAI):'}
              </span>
              <span className="text-[10px] opacity-70 font-mono">
                {isEn ? 'Validates ARP packets against snooping table' : 'اعتبارسنجی بسته‌های ARP'}
              </span>
            </div>
            <input
              type="checkbox"
              checked={arpInspection}
              onChange={(e) => setArpInspection(e.target.checked)}
              disabled={!isPermitted}
              className="rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer w-4 h-4"
            />
          </div>

          {/* DAI VLANs */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              {isEn ? 'DAI Active VLANs (ip arp inspection vlan):' : 'ویلن‌های فعال بازرسی ARP:'}
            </label>
            <input
              type="text"
              value={arpVlans}
              onChange={(e) => setArpVlans(e.target.value)}
              disabled={!isPermitted || !arpInspection}
              placeholder="e.g. 10,20"
              className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              } disabled:opacity-50`}
              dir="ltr"
            />
          </div>

          {/* Errdisable Recovery Interval */}
          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold">
                {isEn ? 'Errdisable Recovery Timer (seconds):' : 'مدت زمان بازیابی خودکار خطای Errdisable (ثانیه):'}
              </label>
              <FieldInfoTooltip
                title={isEn ? 'Errdisable Recovery' : 'بازیابی خودکار پورت Errdisable'}
                infoWhatEn="Automatically un-shuts ports suspended due to BPDU Guard or security violations after this interval."
                infoWhatFa="پورت‌هایی که به علت نقض امنیتی یا BPDU Guard غیرفعال شده‌اند را پس از این مدت مجدداً به صورت خودکار روشن می‌کند."
                infoWhyEn="Reduces manual support tickets when a user unplugs an offending rogue device."
                infoWhyFa="کاهش بار کاری پشتیبانی شبکه پس از برطرف شدن فیزیکی علت خطا توسط کاربر."
                infoExampleEn="errdisable recovery interval 300 (5 minutes)"
                infoExampleFa="errdisable recovery interval 300 (۵ دقیقه)"
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[60, 180, 300, 600].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setRecoveryInterval(sec)}
                  disabled={!isPermitted}
                  className={`py-1.5 px-1 text-center rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                    recoveryInterval === sec
                      ? isLightMode
                        ? 'bg-cyan-600 text-white border-cyan-600'
                        : 'bg-cyan-500 text-black border-cyan-400'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Live Generated Cisco CLI Preview */}
      <div
        className={`p-4 rounded-2xl border shadow-inner ${
          isLightMode
            ? 'bg-slate-900 text-slate-100 border-slate-700'
            : 'bg-black/80 text-emerald-400 border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
            <FileCode2 className="w-4 h-4 text-cyan-400" />
            <span>{isEn ? 'Generated Cisco IOS CLI Commands Preview:' : 'پیش‌نمایش زنده دستورات ارسالی به سوئیچ:'}</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">{'conf t -> ip dhcp snooping -> arp inspection -> end'}</span>
        </div>
        <pre className="text-xs font-mono p-3 rounded-xl bg-slate-950/70 border border-white/10 overflow-x-auto custom-scrollbar leading-relaxed" dir="ltr">
          {generatedCli}
        </pre>
      </div>

      {/* Execution Feedback Banner */}
      {applyResult && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
            applyResult.success
              ? isLightMode
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
              : isLightMode
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
          }`}
        >
          {applyResult.success ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <h5 className="font-bold text-xs">
              {applyResult.success
                ? isEn
                  ? 'Configuration Deployed to Switch Successfully'
                  : 'پیکربندی با موفقیت روی سخت‌افزار سوئیچ اعمال شد'
                : isEn
                ? 'Deployment Error'
                : 'خطا در اعمال پیکربندی'}
            </h5>
            <p className="text-xs mt-1 font-mono opacity-90 break-words" dir="ltr">
              {applyResult.output || applyResult.error}
            </p>
          </div>
        </div>
      )}

      {/* Action Footer Buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
        <button
          type="button"
          onClick={handleReset}
          disabled={isApplying}
          className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition cursor-pointer active:scale-95 ${
            isLightMode
              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{isEn ? 'Reset to Current' : 'بازنشانی به مقادیر جاری'}</span>
        </button>

        <button
          type="button"
          onClick={handleApply}
          disabled={!isPermitted || isApplying}
          className={`px-6 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
            isLightMode
              ? 'bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white shadow-cyan-600/30'
              : 'bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-black shadow-[0_0_20px_rgba(6,182,212,0.4)]'
          }`}
        >
          <Play className={`w-4 h-4 ${isApplying ? 'animate-spin' : ''}`} />
          <span>
            {isApplying
              ? isEn
                ? 'Applying Layer 2 Security to Switch...'
                : 'در حال اعمال تنظیمات امنیت L2...'
              : isEn
              ? 'Apply Configuration to Switch'
              : 'اعمال پیکربندی روی سخت‌افزار سوئیچ'}
          </span>
        </button>
      </div>
    </div>
  );
};
