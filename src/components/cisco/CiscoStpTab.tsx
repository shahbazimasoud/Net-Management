import React, { useState, useEffect, useMemo } from 'react';
import {
  GitBranch,
  Shield,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  FileCode2,
  Sliders,
  Zap,
  Info,
} from 'lucide-react';
import { Device } from '../../types';
import { useLanguage } from '../../i18n';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { updateCiscoConfigTab } from '../../services/api';

export interface CiscoStpTabProps {
  device: Device;
  initialConfig?: any;
  isPermitted: boolean;
  isLightMode?: boolean;
  onConfigApplied?: () => void;
}

const BRIDGE_PRIORITIES = [
  { val: 0, label: '0 (Root Primary / Highest Priority)', desc: 'Guarantees root bridge role' },
  { val: 4096, label: '4096 (Secondary Root)', desc: 'Backup root bridge' },
  { val: 8192, label: '8192', desc: 'High priority' },
  { val: 16384, label: '16384', desc: 'Elevated priority' },
  { val: 24576, label: '24576', desc: 'Pre-default priority' },
  { val: 32768, label: '32768 (Cisco Default)', desc: 'Standard factory default' },
  { val: 49152, label: '49152', desc: 'Low priority' },
  { val: 61440, label: '61440 (Lowest Priority)', desc: 'Never root' },
];

export const CiscoStpTab: React.FC<CiscoStpTabProps> = ({
  device,
  initialConfig,
  isPermitted,
  isLightMode = false,
  onConfigApplied,
}) => {
  const { isEn } = useLanguage();

  const stpData = initialConfig?.stp || {};

  // Form States
  const [mode, setMode] = useState<'rapid-pvst' | 'pvst' | 'mst'>(
    stpData.mode || 'rapid-pvst'
  );
  const [targetVlan, setTargetVlan] = useState<number>(1);
  const [priority, setPriority] = useState<number>(
    stpData.bridge_priorities?.['1'] !== undefined ? stpData.bridge_priorities['1'] : 32768
  );
  const [portfastDefault, setPortfastDefault] = useState<boolean>(
    Boolean(stpData.portfast_default)
  );
  const [bpduguardDefault, setBpduguardDefault] = useState<boolean>(
    stpData.bpduguard_default !== undefined ? stpData.bpduguard_default : true
  );
  const [bpdufilterDefault, setBpdufilterDefault] = useState<boolean>(
    Boolean(stpData.bpdufilter_default)
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
    if (stpData.mode) setMode(stpData.mode);
    if (stpData.bridge_priorities?.['1'] !== undefined) {
      setPriority(stpData.bridge_priorities['1']);
    }
    if (stpData.portfast_default !== undefined) setPortfastDefault(stpData.portfast_default);
    if (stpData.bpduguard_default !== undefined) setBpduguardDefault(stpData.bpduguard_default);
    if (stpData.bpdufilter_default !== undefined) setBpdufilterDefault(stpData.bpdufilter_default);
  }, [initialConfig]);

  // Live generated CLI commands
  const generatedCli = useMemo(() => {
    const lines: string[] = ['configure terminal'];
    lines.push(`spanning-tree mode ${mode}`);
    lines.push(`spanning-tree vlan ${targetVlan} priority ${priority}`);
    lines.push(`spanning-tree portfast ${portfastDefault ? 'default' : 'no default'}`);
    lines.push(`spanning-tree portfast bpduguard ${bpduguardDefault ? 'default' : 'no default'}`);
    if (bpdufilterDefault) {
      lines.push('spanning-tree portfast bpdufilter default');
    }
    lines.push('end');
    return lines.join('\n');
  }, [mode, targetVlan, priority, portfastDefault, bpduguardDefault, bpdufilterDefault]);

  // Apply to Switch
  const handleApply = async () => {
    if (!isPermitted || isApplying) return;
    setIsApplying(true);
    setApplyResult(null);

    const payload = {
      mode,
      bridge_priorities: {
        [String(targetVlan)]: priority,
      },
      portfast_default: portfastDefault,
      bpduguard_default: bpduguardDefault,
      bpdufilter_default: bpdufilterDefault,
    };

    try {
      const res = await updateCiscoConfigTab(device.id, 'stp', payload);
      if (res.success) {
        setApplyResult({
          success: true,
          output: res.output || (isEn ? 'Spanning Tree parameters and protections deployed successfully.' : 'تنظیمات پروتکل Spanning Tree و محافظت‌های BPDU با موفقیت روی سوئیچ اعمال شدند.'),
        });
        if (onConfigApplied) onConfigApplied();
      } else {
        setApplyResult({
          success: false,
          error: res.error || (isEn ? 'Failed to apply STP configuration' : 'خطا در اعمال پیکربندی STP'),
        });
      }
    } catch (err: any) {
      setApplyResult({
        success: false,
        error: err?.message || (isEn ? 'Communication error during STP deployment' : 'خطای ارتباطی هنگام اعمال تنظیمات STP'),
      });
    } finally {
      setIsApplying(false);
    }
  };

  // Reset Form
  const handleReset = () => {
    setMode(stpData.mode || 'rapid-pvst');
    setTargetVlan(1);
    setPriority(stpData.bridge_priorities?.['1'] !== undefined ? stpData.bridge_priorities['1'] : 32768);
    setPortfastDefault(Boolean(stpData.portfast_default));
    setBpduguardDefault(stpData.bpduguard_default !== undefined ? stpData.bpduguard_default : true);
    setBpdufilterDefault(Boolean(stpData.bpdufilter_default));
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
          <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <GitBranch className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-xs sm:text-sm">
              {isEn ? 'Spanning Tree Protocol (STP) & Loop Shield' : 'پروتکل پیشگیری از لوپ Spanning Tree (STP)'}
            </h4>
            <p className="text-xs opacity-75 mt-0.5">
              {isEn
                ? 'Prevent Layer 2 broadcast storms, define root bridges, and harden edge ports with BPDU Guard.'
                : 'جلوگیری قطعی از طوفان برودکست، تعیین سوئیچ ریشه (Root Bridge) و ایمن‌سازی پورت‌های کاربر با BPDU Guard.'}
            </p>
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase">
          {mode}
        </span>
      </div>

      {/* Grid: Mode & Priority - Advanced Protections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left Column: STP Mode & Bridge Priority */}
        <div
          className={`p-5 rounded-2xl border space-y-4 shadow-xs ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-900/40 border-slate-800 text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-2.5">
            <h5 className="font-bold text-xs uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
              <Sliders className="w-4 h-4" />
              <span>{isEn ? 'STP Mode & Bridge Hierarchy' : 'حالت پروتکل و سلسله‌مراتب ریشه'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'STP Operating Mode' : 'حالت پروتکل STP'}
              infoWhatEn="Rapid-PVST (802.1w) provides sub-second convergence per VLAN. PVST is legacy 802.1D. MST groups multiple VLANs into instances."
              infoWhatFa="پروتکل Rapid-PVST همگرایی زیر ثانیه به ازای هر ویلن را فراهم می‌کند. PVST حالت قدیمی بوده و MST چند ویلن را در یک اینستنس ادغام می‌کند."
              infoWhyEn="Rapid-PVST eliminates the 30-50 second listening/learning delay of traditional spanning tree during topology changes."
              infoWhyFa="حالت Rapid-PVST تاخیر ۳۰ تا ۵۰ ثانیه‌ای حالت‌های گوش دادن و یادگیری را هنگام قطعی لینک از بین می‌برد."
              infoExampleEn="spanning-tree mode rapid-pvst"
              infoExampleFa="spanning-tree mode rapid-pvst"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* Mode Selector */}
          <div>
            <label className="block text-xs font-semibold mb-2">
              {isEn ? 'Spanning Tree Operating Mode (spanning-tree mode):' : 'حالت کاری Spanning Tree (spanning-tree mode):'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'rapid-pvst', label: 'Rapid-PVST+', desc: '802.1w Sub-second' },
                { id: 'mst', label: 'MST (Multiple)', desc: '802.1s Scalable' },
                { id: 'pvst', label: 'Classic PVST', desc: '802.1D Legacy' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id as any)}
                  disabled={!isPermitted}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    mode === m.id
                      ? isLightMode
                        ? 'bg-cyan-50 border-cyan-500 text-cyan-900 shadow-xs'
                        : 'bg-cyan-950/60 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="font-bold text-xs">{m.label}</div>
                  <div className="text-[10px] opacity-70 font-mono mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Target VLAN & Priority */}
          <div className="pt-2 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold">
                {isEn ? 'Bridge Priority (spanning-tree vlan priority):' : 'اولویت سوئیچ در ریشه (Bridge Priority):'}
              </label>
              <FieldInfoTooltip
                title={isEn ? 'Bridge Priority' : 'اولویت ریشه Bridge Priority'}
                infoWhatEn="Multiples of 4096 (0-61440). The switch with the lowest numerical priority becomes the STP Root Bridge."
                infoWhatFa="مضاربی از عدد ۴۰۹۶ (از ۰ تا ۶۱۴۴۰). سوئیچی که کمترین مقدار عددی را داشته باشد سوئیچ ریشه (Root Bridge) می‌شود."
                infoWhyEn="Ensures high-performance core switches maintain root status rather than unintended access switches."
                infoWhyFa="تضمین قرارگیری نقش ریشه در سوئیچ‌های پرقدرت هسته به جای سوئیچ‌های دسترسی حاشیه شبکه."
                infoExampleEn="spanning-tree vlan 1 priority 4096 (Primary Root)"
                infoExampleFa="spanning-tree vlan 1 priority 4096 (Primary Root)"
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <span className="text-[10px] opacity-75 block mb-1">{isEn ? 'VLAN ID:' : 'شماره ویلن:'}</span>
                <input
                  type="number"
                  min="1"
                  max="4094"
                  value={targetVlan}
                  onChange={(e) => setTargetVlan(parseInt(e.target.value, 10) || 1)}
                  disabled={!isPermitted}
                  className={`w-full px-2.5 py-2 rounded-xl text-xs border font-mono ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                      : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
                  }`}
                />
              </div>

              <div className="col-span-2">
                <span className="text-[10px] opacity-75 block mb-1">{isEn ? 'Priority Value:' : 'مقدار اولویت:'}</span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(parseInt(e.target.value, 10))}
                  disabled={!isPermitted}
                  className={`w-full px-2.5 py-2 rounded-xl text-xs border font-mono ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-900'
                      : 'bg-slate-950 border-slate-800 text-slate-100'
                  }`}
                >
                  {BRIDGE_PRIORITIES.map((bp) => (
                    <option key={bp.val} value={bp.val}>
                      {bp.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: STP Advanced Edge Protections */}
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
              <span>{isEn ? 'Loop Prevention & Edge Hardening' : 'محافظت‌های پورت و پیشگیری از اختلال'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'BPDU Guard & PortFast' : 'تکنولوژی‌های PortFast و BPDU Guard'}
              infoWhatEn="PortFast bypasses listening/learning for edge access ports. BPDU Guard error-disables any PortFast port receiving BPDUs."
              infoWhatFa="تکنیک PortFast پورت‌های کاربران را فوراً فوروارد می‌کند. BPDU Guard هر پورت کاربری که بسته STP دریافت کند را قطع می‌نماید."
              infoWhyEn="Prevents rogue switches or unauthorized home routers plugged in by users from hijacking root bridge status."
              infoWhyFa="جلوگیری قطعی از اتصال سوئیچ‌های سرکش یا روترهای متفرقه توسط کاربران و برهم خوردن توپولوژی شبکه."
              infoExampleEn="spanning-tree portfast bpduguard default"
              infoExampleFa="spanning-tree portfast bpduguard default"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* PortFast Default Toggle */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800'
            }`}
          >
            <div>
              <span className="text-xs font-bold block flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>{isEn ? 'Global PortFast on Access Ports:' : 'فعال‌سازی سراسری PortFast روی پورت‌های اکسس:'}</span>
              </span>
              <span className="text-[10px] opacity-70 font-mono">spanning-tree portfast default</span>
            </div>
            <input
              type="checkbox"
              checked={portfastDefault}
              onChange={(e) => setPortfastDefault(e.target.checked)}
              disabled={!isPermitted}
              className="rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer w-4 h-4"
            />
          </div>

          {/* BPDU Guard Default Toggle */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800'
            }`}
          >
            <div>
              <span className="text-xs font-bold block flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-rose-400" />
                <span>{isEn ? 'Global BPDU Guard on Edge Ports:' : 'فعال‌سازی سراسری BPDU Guard روی پورت‌های لبه:'}</span>
              </span>
              <span className="text-[10px] opacity-70 font-mono">spanning-tree portfast bpduguard default</span>
            </div>
            <input
              type="checkbox"
              checked={bpduguardDefault}
              onChange={(e) => setBpduguardDefault(e.target.checked)}
              disabled={!isPermitted}
              className="rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer w-4 h-4"
            />
          </div>

          {/* BPDU Filter Default Toggle */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800'
            }`}
          >
            <div>
              <span className="text-xs font-bold block">
                {isEn ? 'BPDU Filter on Edge Ports:' : 'فیلتر کردن BPDU روی پورت‌های لبه:'}
              </span>
              <span className="text-[10px] opacity-70 font-mono">spanning-tree portfast bpdufilter default</span>
            </div>
            <input
              type="checkbox"
              checked={bpdufilterDefault}
              onChange={(e) => setBpdufilterDefault(e.target.checked)}
              disabled={!isPermitted}
              className="rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer w-4 h-4"
            />
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
          <span className="text-[10px] font-mono text-slate-400">{'conf t -> spanning-tree -> end'}</span>
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
                ? 'Applying Spanning Tree to Switch...'
                : 'در حال اعمال تنظیمات STP...'
              : isEn
              ? 'Apply Configuration to Switch'
              : 'اعمال پیکربندی روی سخت‌افزار سوئیچ'}
          </span>
        </button>
      </div>
    </div>
  );
};
