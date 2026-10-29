import React, { useState, useEffect, useMemo } from 'react';
import {
  Network,
  Shield,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  FileCode2,
  Lock,
  Eye,
  EyeOff,
  Activity,
  Sliders,
} from 'lucide-react';
import { Device } from '../../types';
import { useLanguage } from '../../i18n';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { updateCiscoConfigTab } from '../../services/api';

export interface CiscoVtpTabProps {
  device: Device;
  initialConfig?: any;
  isPermitted: boolean;
  isLightMode?: boolean;
  onConfigApplied?: () => void;
}

export const CiscoVtpTab: React.FC<CiscoVtpTabProps> = ({
  device,
  initialConfig,
  isPermitted,
  isLightMode = false,
  onConfigApplied,
}) => {
  const { isEn } = useLanguage();

  const vtpData = initialConfig?.vtp || {};

  // Form States
  const [mode, setMode] = useState<'server' | 'client' | 'transparent' | 'off'>(
    vtpData.mode || 'transparent'
  );
  const [domain, setDomain] = useState<string>(vtpData.domain || 'EnterpriseCore');
  const [version, setVersion] = useState<number>(vtpData.version || 2);
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [pruning, setPruning] = useState<boolean>(Boolean(vtpData.pruning));

  // Execution state
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{
    success: boolean;
    output?: string;
    error?: string;
  } | null>(null);

  // Sync with initialConfig
  useEffect(() => {
    if (vtpData.mode) setMode(vtpData.mode);
    if (vtpData.domain) setDomain(vtpData.domain);
    if (vtpData.version) setVersion(vtpData.version);
    if (vtpData.pruning !== undefined) setPruning(vtpData.pruning);
  }, [initialConfig]);

  // Live generated CLI commands
  const generatedCli = useMemo(() => {
    const lines: string[] = ['configure terminal'];
    if (domain.trim()) {
      lines.push(`vtp domain ${domain.trim()}`);
    }
    lines.push(`vtp mode ${mode}`);
    lines.push(`vtp version ${version}`);
    if (password.trim()) {
      lines.push(`vtp password ${password.trim()}`);
    }
    lines.push(pruning ? 'vtp pruning' : 'no vtp pruning');
    lines.push('end');
    return lines.join('\n');
  }, [domain, mode, version, password, pruning]);

  // Apply to Switch
  const handleApply = async () => {
    if (!isPermitted || isApplying) return;
    setIsApplying(true);
    setApplyResult(null);

    const payload = {
      domain: domain.trim(),
      mode,
      version,
      password: password.trim() || undefined,
      pruning,
    };

    try {
      const res = await updateCiscoConfigTab(device.id, 'vtp', payload);
      if (res.success) {
        setApplyResult({
          success: true,
          output: res.output || (isEn ? 'VTP domain and mode parameters applied successfully.' : 'دامنه، مد کاری و تنظیمات پروتکل VTP با موفقیت روی سوئیچ اعمال شدند.'),
        });
        if (onConfigApplied) onConfigApplied();
      } else {
        setApplyResult({
          success: false,
          error: res.error || (isEn ? 'Failed to apply VTP configuration' : 'خطا در اعمال پیکربندی VTP'),
        });
      }
    } catch (err: any) {
      setApplyResult({
        success: false,
        error: err?.message || (isEn ? 'Communication error during VTP deployment' : 'خطای ارتباطی هنگام اعمال تنظیمات VTP'),
      });
    } finally {
      setIsApplying(false);
    }
  };

  // Reset Form
  const handleReset = () => {
    setMode(vtpData.mode || 'transparent');
    setDomain(vtpData.domain || 'EnterpriseCore');
    setVersion(vtpData.version || 2);
    setPassword('');
    setPruning(Boolean(vtpData.pruning));
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
          <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-xs sm:text-sm">
              {isEn ? 'VLAN Trunking Protocol (VTP) Management' : 'مدیریت پروتکل همگام‌سازی ترانک ویلن (VTP)'}
            </h4>
            <p className="text-xs opacity-75 mt-0.5">
              {isEn
                ? 'Manage VLAN distribution modes (Transparent mode recommended to prevent accidental overwrites).'
                : 'تعیین حالت انتشار ویلن‌ها (حالت Transparent جهت پیشگیری قطعی از بازنویسی اشتباه دیتابیس ویلن توصیه می‌شود).'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 uppercase">
            Mode: {mode}
          </span>
          <span className="px-2.5 py-1 rounded-md text-xs font-mono text-slate-400 border border-slate-800">
            Rev: {vtpData.revision !== undefined ? vtpData.revision : 0}
          </span>
        </div>
      </div>

      {/* Grid: Mode & Domain - Security & Version */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left Column: VTP Mode & Domain */}
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
              <span>{isEn ? 'VTP Operating Mode & Domain' : 'حالت کاری و نام دامنه VTP'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'VTP Operating Mode' : 'حالت کاری VTP'}
              infoWhatEn="Server creates and propagates VLANs. Client synchronizes. Transparent passes advertisements without updating its local database. Off disables VTP entirely."
              infoWhatFa="حالت Server ویلن را در شبکه منتشر می‌کند. حالت Client همگام می‌شود. حالت Transparent ویلن‌ها را ایزوله و مستقل نگه می‌دارد. حالت Off پروتکل را خاموش می‌کند."
              infoWhyEn="Transparent mode eliminates catastrophic VLAN database erasure caused by introducing an old switch with a higher revision number."
              infoWhyFa="حالت Transparent مانع از پاک شدن کل ویلن‌های شبکه توسط اتصال یک سوئیچ قدیمی با Revision بالاتر می‌شود."
              infoExampleEn="vtp mode transparent (Campus Best Practice)"
              infoExampleFa="vtp mode transparent (توصیه اکید سیسکو در شبکه‌های سازمانی)"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* Mode Selector */}
          <div>
            <label className="block text-xs font-semibold mb-2">
              {isEn ? 'VTP Operating Mode (vtp mode):' : 'حالت کاری VTP (vtp mode):'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'transparent', label: 'Transparent (Best Practice)', labelFa: 'Transparent (توصیه‌شده)', desc: 'Isolated Local DB' },
                { id: 'server', label: 'Server Mode', labelFa: 'Server (مرکزی)', desc: 'Originates VLAN DB' },
                { id: 'client', label: 'Client Mode', labelFa: 'Client (پیرو)', desc: 'Listens to Server' },
                { id: 'off', label: 'VTP Off (Disabled)', labelFa: 'Off (غیرفعال)', desc: 'Completely Inactive' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id as any)}
                  disabled={!isPermitted}
                  className={`p-2.5 rounded-xl border text-left rtl:text-right transition-all cursor-pointer ${
                    mode === m.id
                      ? isLightMode
                        ? 'bg-cyan-50 border-cyan-500 text-cyan-900 shadow-xs'
                        : 'bg-cyan-950/60 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="font-bold text-xs">{isEn ? m.label : m.labelFa}</div>
                  <div className="text-[10px] opacity-70 font-mono mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* VTP Domain Name */}
          <div className="pt-2 border-t border-slate-800">
            <label className="block text-xs font-semibold mb-1">
              {isEn ? 'VTP Domain Name (vtp domain):' : 'نام دامنه VTP (vtp domain):'}
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              disabled={!isPermitted}
              placeholder="e.g. EnterpriseCore"
              className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              }`}
              dir="ltr"
            />
          </div>
        </div>

        {/* Right Column: Version, Password & Pruning */}
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
              <span>{isEn ? 'VTP Version & Domain Security' : 'نسخه و رمز امنیتی دامنه VTP'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'VTP Version & Password' : 'نسخه و پسورد VTP'}
              infoWhatEn="VTP version 2 supports Token Ring and unrecognized TLVs. VTP version 3 supports private VLANs and extended VLAN ranges (1006-4094)."
              infoWhatFa="نسخه ۲ از توکن‌رینگ و TLV ناشناخته پشتیبانی می‌کند. نسخه ۳ امکان پشتیبانی از Private VLAN و ویلن‌های گسترده (۱۰۰۶ تا ۴۰۹۴) را دارد."
              infoWhyEn="Setting a shared domain password prevents unauthorized switches from joining the trunk propagation tree."
              infoWhyFa="تعیین پسورد مانع از اتصال غیرمجاز سایر سوئیچ‌ها به دامنه VTP و دستکاری اطلاعات ویلن‌ها می‌شود."
              infoExampleEn="vtp version 2, vtp password SecretVTPPass"
              infoExampleFa="vtp version 2, vtp password SecretVTPPass"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* VTP Version Selector */}
          <div>
            <label className="block text-xs font-semibold mb-1.5">
              {isEn ? 'VTP Protocol Version (vtp version):' : 'نسخه پروتکل VTP (vtp version):'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVersion(v)}
                  disabled={!isPermitted}
                  className={`py-2 px-1 text-center rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                    version === v
                      ? isLightMode
                        ? 'bg-cyan-600 text-white border-cyan-600 shadow-xs'
                        : 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  Version {v}
                </button>
              ))}
            </div>
          </div>

          {/* VTP Password */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              {isEn ? 'VTP Domain Password (vtp password):' : 'رمز عبور دامنه VTP (اختیاری):'}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!isPermitted}
                placeholder={isEn ? 'Leave empty to preserve existing' : 'جهت حفظ رمز قبلی خالی بگذارید'}
                className={`w-full px-3 py-2 pr-10 rtl:pl-10 rtl:pr-3 rounded-xl text-xs border font-mono ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                    : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
                }`}
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 rtl:right-auto rtl:left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* VTP Pruning Toggle */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800'
            }`}
          >
            <div>
              <span className="text-xs font-bold block">
                {isEn ? 'VTP Trunk Pruning (vtp pruning):' : 'هرس کردن ترافیک ترانک (VTP Pruning):'}
              </span>
              <span className="text-[10px] opacity-70 font-mono">
                {isEn ? 'Prunes unnecessary broadcast traffic across trunk links' : 'جلوگیری از ارسال برودکست روی لینک‌های ترانک فاقد کاربر'}
              </span>
            </div>
            <input
              type="checkbox"
              checked={pruning}
              onChange={(e) => setPruning(e.target.checked)}
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
          <span className="text-[10px] font-mono text-slate-400">{'conf t -> vtp domain -> vtp mode -> end'}</span>
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
                ? 'Applying VTP to Switch...'
                : 'در حال اعمال تنظیمات VTP...'
              : isEn
              ? 'Apply Configuration to Switch'
              : 'اعمال پیکربندی روی سخت‌افزار سوئیچ'}
          </span>
        </button>
      </div>
    </div>
  );
};
