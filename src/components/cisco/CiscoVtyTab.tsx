import React, { useState, useEffect, useMemo } from 'react';
import {
  Terminal,
  Shield,
  Key,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Sliders,
  FileCode2,
  Lock,
} from 'lucide-react';
import { Device } from '../../types';
import { useLanguage } from '../../i18n';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { updateCiscoConfigTab } from '../../services/api';

export interface CiscoVtyTabProps {
  device: Device;
  initialConfig?: any;
  isPermitted: boolean;
  isLightMode?: boolean;
  onConfigApplied?: () => void;
}

export const CiscoVtyTab: React.FC<CiscoVtyTabProps> = ({
  device,
  initialConfig,
  isPermitted,
  isLightMode = false,
  onConfigApplied,
}) => {
  const { isEn } = useLanguage();

  const vtyData = initialConfig?.vty || {};

  // Form State
  const [domainName, setDomainName] = useState<string>(
    initialConfig?.domain_name || 'corp.local'
  );
  const [rsaBits, setRsaBits] = useState<number>(vtyData.rsa_bits || 2048);
  const [sshVersion, setSshVersion] = useState<number>(vtyData.ssh_version || 2);
  const [sshTimeout, setSshTimeout] = useState<number>(vtyData.ssh_timeout || 60);
  const [sshRetries, setSshRetries] = useState<number>(vtyData.ssh_retries || 3);
  const [transportInput, setTransportInput] = useState<'ssh' | 'telnet' | 'all' | 'none'>(
    vtyData.transport_input || 'ssh'
  );
  const [execTimeoutMin, setExecTimeoutMin] = useState<number>(
    vtyData.exec_timeout_min !== undefined ? vtyData.exec_timeout_min : 10
  );
  const [execTimeoutSec, setExecTimeoutSec] = useState<number>(
    vtyData.exec_timeout_sec !== undefined ? vtyData.exec_timeout_sec : 0
  );

  // Execution state
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{
    success: boolean;
    output?: string;
    error?: string;
  } | null>(null);

  // Sync initialConfig changes
  useEffect(() => {
    if (initialConfig?.domain_name) setDomainName(initialConfig.domain_name);
    if (vtyData.rsa_bits) setRsaBits(vtyData.rsa_bits);
    if (vtyData.ssh_version) setSshVersion(vtyData.ssh_version);
    if (vtyData.ssh_timeout) setSshTimeout(vtyData.ssh_timeout);
    if (vtyData.ssh_retries) setSshRetries(vtyData.ssh_retries);
    if (vtyData.transport_input) setTransportInput(vtyData.transport_input);
    if (vtyData.exec_timeout_min !== undefined) setExecTimeoutMin(vtyData.exec_timeout_min);
    if (vtyData.exec_timeout_sec !== undefined) setExecTimeoutSec(vtyData.exec_timeout_sec);
  }, [initialConfig]);

  // Live generated CLI commands preview
  const generatedCli = useMemo(() => {
    const lines: string[] = ['configure terminal'];
    if (domainName.trim()) {
      lines.push(`ip domain-name ${domainName.trim()}`);
    }
    if (rsaBits) {
      lines.push(`crypto key generate rsa modulus ${rsaBits}`);
    }
    if (sshVersion) {
      lines.push(`ip ssh version ${sshVersion}`);
    }
    if (sshTimeout) {
      lines.push(`ip ssh time-out ${sshTimeout}`);
    }
    if (sshRetries) {
      lines.push(`ip ssh authentication-retries ${sshRetries}`);
    }
    lines.push('line vty 0 15');
    if (transportInput === 'ssh') lines.push(' transport input ssh');
    else if (transportInput === 'telnet') lines.push(' transport input telnet');
    else if (transportInput === 'all') lines.push(' transport input ssh telnet');
    else if (transportInput === 'none') lines.push(' transport input none');

    lines.push(` exec-timeout ${execTimeoutMin} ${execTimeoutSec}`);
    lines.push(' login local');
    lines.push('exit');
    lines.push('end');
    return lines.join('\n');
  }, [domainName, rsaBits, sshVersion, sshTimeout, sshRetries, transportInput, execTimeoutMin, execTimeoutSec]);

  // Handle Deploy CLI to switch
  const handleApply = async () => {
    if (!isPermitted || isApplying) return;
    setIsApplying(true);
    setApplyResult(null);

    const payload = {
      domain_name: domainName.trim(),
      rsa_bits: rsaBits,
      ssh_version: sshVersion,
      ssh_timeout: sshTimeout,
      ssh_retries: sshRetries,
      transport_input: transportInput,
      exec_timeout_min: execTimeoutMin,
      exec_timeout_sec: execTimeoutSec,
    };

    try {
      const res = await updateCiscoConfigTab(device.id, 'vty', payload);
      if (res.success) {
        setApplyResult({
          success: true,
          output: res.output || (isEn ? 'VTY lines & SSH parameters deployed successfully.' : 'خطوط VTY و پارامترهای SSH با موفقیت روی سوئیچ اعمال شدند.'),
        });
        if (onConfigApplied) onConfigApplied();
      } else {
        setApplyResult({
          success: false,
          error: res.error || (isEn ? 'Failed to apply VTY configuration' : 'خطا در اعمال پیکربندی VTY'),
        });
      }
    } catch (err: any) {
      setApplyResult({
        success: false,
        error: err?.message || (isEn ? 'Communication error during VTY deployment' : 'خطای ارتباطی هنگام اعمال تنظیمات VTY'),
      });
    } finally {
      setIsApplying(false);
    }
  };

  // Reset to hardware defaults
  const handleReset = () => {
    setDomainName(initialConfig?.domain_name || 'corp.local');
    setRsaBits(vtyData.rsa_bits || 2048);
    setSshVersion(vtyData.ssh_version || 2);
    setSshTimeout(vtyData.ssh_timeout || 60);
    setSshRetries(vtyData.ssh_retries || 3);
    setTransportInput(vtyData.transport_input || 'ssh');
    setExecTimeoutMin(vtyData.exec_timeout_min !== undefined ? vtyData.exec_timeout_min : 10);
    setExecTimeoutSec(vtyData.exec_timeout_sec !== undefined ? vtyData.exec_timeout_sec : 0);
    setApplyResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Status Overview */}
      <div
        className={`p-4 rounded-xl border flex items-center justify-between ${
          isLightMode
            ? 'bg-slate-100 border-slate-200 text-slate-800'
            : 'bg-slate-900/60 border-slate-800 text-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-xs sm:text-sm">
              {isEn ? 'Remote VTY Lines & SSH Management' : 'مدیریت خطوط راه دور VTY و پروتکل SSH'}
            </h4>
            <p className="text-xs opacity-75 mt-0.5">
              {isEn
                ? 'Enforce encrypted remote shell access and session timeouts on vty 0 to 15 lines.'
                : 'برقراری اتصال امن با پوسته رمزنگاری‌شده و تنظیم مهلت پایان نشست روی خطوط ۰ تا ۱۵.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold border ${
              transportInput === 'ssh'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            }`}
          >
            {transportInput.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Configuration Form Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left Column: Line & Transport Protocols */}
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
              <span>{isEn ? 'Transport & Access Protocol' : 'پروتکل دسترسی و انتقال'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'Transport Input Protocol' : 'پروتکل ورودی خطوط VTY'}
              infoWhatEn="Controls which protocol the switch accepts on incoming virtual terminal lines (SSH, Telnet, or none)."
              infoWhatFa="پروتکل‌های مجاز برای برقراری ارتباط با خطوط ترمینال مجازی سوئیچ (SSH، Telnet یا هیچ‌کدام) را مشخص می‌کند."
              infoWhyEn="Telnet transmits passwords in clear text. Enforcing SSH only prevents packet sniffing on local networks."
              infoWhyFa="تل‌نت رمزها را به صورت متنی و بدون رمزنگاری ارسال می‌کند. الزام به استفاده از SSH مانع شنود ترافیک می‌شود."
              infoExampleEn="transport input ssh"
              infoExampleFa="transport input ssh"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* Transport Input Selector */}
          <div>
            <label className="block text-xs font-semibold mb-2">
              {isEn ? 'Allowed Inbound Protocols (transport input):' : 'پروتکل‌های ورودی مجاز (transport input):'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'ssh', label: 'SSH Only (Recommended)', labelFa: 'فقط SSH (توصیه‌شده)', desc: 'Secure AES/RSA' },
                { id: 'all', label: 'SSH & Telnet', labelFa: 'هر دو (SSH و Telnet)', desc: 'Mixed Access' },
                { id: 'telnet', label: 'Telnet Only', labelFa: 'فقط Telnet', desc: 'Insecure Cleartext' },
                { id: 'none', label: 'None (Block All)', labelFa: 'مسدود (بدون دسترسی)', desc: 'Console Only' },
              ].map((proto) => (
                <button
                  key={proto.id}
                  type="button"
                  onClick={() => setTransportInput(proto.id as any)}
                  disabled={!isPermitted}
                  className={`p-2.5 rounded-xl border text-left rtl:text-right transition-all cursor-pointer ${
                    transportInput === proto.id
                      ? isLightMode
                        ? 'bg-cyan-50 border-cyan-500 text-cyan-900 shadow-xs'
                        : 'bg-cyan-950/60 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="font-bold text-xs">{isEn ? proto.label : proto.labelFa}</div>
                  <div className="text-[10px] opacity-70 font-mono mt-0.5">{proto.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Exec Timeout */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold">
                {isEn ? 'Session Idle Timeout (exec-timeout):' : 'مهلت زمان قطع خودکار نشست بیکار:'}
              </label>
              <FieldInfoTooltip
                title={isEn ? 'Session Idle Timeout' : 'تایم‌اوت عدم فعالیت نشست'}
                infoWhatEn="Closes idle administrative CLI sessions after specified minutes and seconds of no user keystrokes."
                infoWhatFa="در صورت عدم تایپ دستور توسط کاربر پس از دقایق و ثانیه‌های تعیین‌شده، نشست مدیریتی را خودکار قطع می‌کند."
                infoWhyEn="Mitigates unauthorized physical access if an engineer leaves their workstation unattended."
                infoWhyFa="جلوگیری از دسترسی افراد غیرمجاز در صورت ترک سیستم توسط کارشناس شبکه با نشست باز."
                infoExampleEn="exec-timeout 10 0 (10 minutes)"
                infoExampleFa="exec-timeout 10 0 (۱۰ دقیقه)"
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] opacity-70 block mb-1">{isEn ? 'Minutes (0-35791):' : 'دقیقه:'}</span>
                <input
                  type="number"
                  min="0"
                  max="35791"
                  value={execTimeoutMin}
                  onChange={(e) => setExecTimeoutMin(parseInt(e.target.value, 10) || 0)}
                  disabled={!isPermitted}
                  className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                      : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
                  }`}
                />
              </div>
              <div>
                <span className="text-[10px] opacity-70 block mb-1">{isEn ? 'Seconds (0-59):' : 'ثانیه:'}</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={execTimeoutSec}
                  onChange={(e) => setExecTimeoutSec(parseInt(e.target.value, 10) || 0)}
                  disabled={!isPermitted}
                  className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                      : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: SSH Cryptography & Parameters */}
        <div
          className={`p-5 rounded-2xl border space-y-4 shadow-xs ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-900/40 border-slate-800 text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-2.5">
            <h5 className="font-bold text-xs uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
              <Key className="w-4 h-4" />
              <span>{isEn ? 'Cryptographic & SSH Daemon' : 'رمزنگاری و دیمون SSH'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'IP Domain Name & RSA Key' : 'نام دامنه و کلید RSA'}
              infoWhatEn="A fully qualified domain name is required by Cisco IOS to generate RSA host keys for the SSH daemon."
              infoWhatFa="سیستم‌عامل سیسکو برای ساخت زوج کلید RSA جهت اجرای SSH به نام دامنه (Domain Name) نیاز دارد."
              infoWhyEn="Without a domain name and active RSA keys, the switch cannot activate SSH and falls back to Telnet."
              infoWhyFa="بدون نام دامنه و کلید فعال RSA، دیمون SSH سوئیچ فعال نشده و سوئیچ به تل‌نت ناامن برمی‌گردد."
              infoExampleEn="ip domain-name enterprise.local, crypto key generate rsa modulus 2048"
              infoExampleFa="ip domain-name enterprise.local, crypto key generate rsa modulus 2048"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* Domain Name */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              {isEn ? 'IP Domain Name (ip domain-name):' : 'نام دامنه سوئیچ (ip domain-name):'}
            </label>
            <input
              type="text"
              value={domainName}
              onChange={(e) => setDomainName(e.target.value)}
              disabled={!isPermitted}
              placeholder="e.g. enterprise.local"
              className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              }`}
              dir="ltr"
            />
          </div>

          {/* RSA Key Modulus */}
          <div>
            <label className="block text-xs font-semibold mb-1.5">
              {isEn ? 'RSA Key Modulus (crypto key generate rsa):' : 'اندازه کلید رمزنگاری RSA (بیت):'}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[1024, 2048, 3072, 4096].map((bits) => (
                <button
                  key={bits}
                  type="button"
                  onClick={() => setRsaBits(bits)}
                  disabled={!isPermitted}
                  className={`py-2 px-1 text-center rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                    rsaBits === bits
                      ? isLightMode
                        ? 'bg-cyan-600 text-white border-cyan-600 shadow-xs'
                        : 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {bits}
                </button>
              ))}
            </div>
          </div>

          {/* SSH Version & Retries */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div>
              <span className="text-[10px] opacity-75 block mb-1">{isEn ? 'SSH Version:' : 'نسخه SSH:'}</span>
              <select
                value={sshVersion}
                onChange={(e) => setSshVersion(parseInt(e.target.value, 10))}
                disabled={!isPermitted}
                className={`w-full px-2.5 py-1.5 rounded-xl text-xs border font-mono ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900'
                    : 'bg-slate-950 border-slate-800 text-slate-100'
                }`}
              >
                <option value={2}>Version 2 (Standard)</option>
                <option value={1}>Version 1 (Legacy)</option>
              </select>
            </div>

            <div>
              <span className="text-[10px] opacity-75 block mb-1">{isEn ? 'Timeout (sec):' : 'تایم‌اوت (ثانیه):'}</span>
              <input
                type="number"
                min="5"
                max="120"
                value={sshTimeout}
                onChange={(e) => setSshTimeout(parseInt(e.target.value, 10) || 60)}
                disabled={!isPermitted}
                className={`w-full px-2.5 py-1.5 rounded-xl text-xs border font-mono ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900'
                    : 'bg-slate-950 border-slate-800 text-slate-100'
                }`}
              />
            </div>

            <div>
              <span className="text-[10px] opacity-75 block mb-1">{isEn ? 'Auth Retries:' : 'تلاش مجدد:'}</span>
              <input
                type="number"
                min="1"
                max="5"
                value={sshRetries}
                onChange={(e) => setSshRetries(parseInt(e.target.value, 10) || 3)}
                disabled={!isPermitted}
                className={`w-full px-2.5 py-1.5 rounded-xl text-xs border font-mono ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900'
                    : 'bg-slate-950 border-slate-800 text-slate-100'
                }`}
              />
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
          <span className="text-[10px] font-mono text-slate-400">{'conf t -> line vty -> exit'}</span>
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
                ? 'Applying to Switch CLI...'
                : 'در حال ارسال دستورات به سوئیچ...'
              : isEn
              ? 'Apply Configuration to Switch'
              : 'اعمال پیکربندی روی سخت‌افزار سوئیچ'}
          </span>
        </button>
      </div>
    </div>
  );
};
