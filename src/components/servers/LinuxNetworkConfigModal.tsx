import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Network,
  Check,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Shield,
  ShieldAlert,
  ArrowRight,
  Plus,
  Trash2,
  Globe,
  Radio,
  Compass,
  Layers,
  Sparkles,
  RotateCcw,
  Eye,
  FileCode,
} from 'lucide-react';
import {
  RemoteServer,
  LinuxNetworkInterfaceDetail,
  LinuxNetworkStackInfo,
  LinuxInterfaceConfigPayload,
} from '../../types';
import { configureLinuxServerNetwork } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface LinuxNetworkConfigModalProps {
  isOpen: boolean;
  server: RemoteServer;
  iface: LinuxNetworkInterfaceDetail | null;
  networkStackInfo?: LinuxNetworkStackInfo | null;
  ephemeralPassword?: string;
  onClose: () => void;
  onMinimize?: () => void;
  onSuccess: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const LinuxNetworkConfigModal: React.FC<LinuxNetworkConfigModalProps> = ({
  isOpen,
  server,
  iface,
  networkStackInfo,
  ephemeralPassword,
  onClose,
  onMinimize,
  onSuccess,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [step, setStep] = useState<'edit' | 'preview' | 'result'>('edit');

  // Form State
  const [state, setState] = useState<'UP' | 'DOWN'>(iface?.state === 'DOWN' ? 'DOWN' : 'UP');
  const [ipv4Mode, setIpv4Mode] = useState<'dhcp' | 'static'>(
    iface?.ipMode === 'dhcp' ? 'dhcp' : 'static'
  );
  const [ipv4, setIpv4] = useState(iface?.ipv4 || '');
  const [cidr, setCidr] = useState<number>(iface?.cidr || 24);
  const [gateway, setGateway] = useState(iface?.gateway || '');
  const [mtu, setMtu] = useState<number>(iface?.mtu || 1500);

  // DNS State
  const [dnsList, setDnsList] = useState<string[]>(
    iface?.dns && iface.dns.length > 0
      ? iface.dns
      : networkStackInfo?.effectiveDns && networkStackInfo.effectiveDns.length > 0
      ? networkStackInfo.effectiveDns
      : ['8.8.8.8', '1.1.1.1']
  );
  const [newDns, setNewDns] = useState('');

  // Safety & Management detection
  const isManagementInterface =
    iface?.isManagement ||
    (networkStackInfo && networkStackInfo.managementInterface === iface?.name);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  // Submission & Result state
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    type: 'success' | 'error';
    providerUsed?: string;
  } | null>(null);
  const [verifiedResult, setVerifiedResult] = useState<any>(null);

  useEffect(() => {
    if (iface) {
      setState(iface.state === 'DOWN' ? 'DOWN' : 'UP');
      setIpv4Mode(iface.ipMode === 'dhcp' ? 'dhcp' : 'static');
      setIpv4(iface.ipv4 || '');
      setCidr(iface.cidr || 24);
      setGateway(iface.gateway || '');
      setMtu(iface.mtu || 1500);
      setDnsList(
        iface.dns && iface.dns.length > 0
          ? iface.dns
          : networkStackInfo?.effectiveDns && networkStackInfo.effectiveDns.length > 0
          ? networkStackInfo.effectiveDns
          : ['8.8.8.8', '1.1.1.1']
      );
      setFeedback(null);
      setVerifiedResult(null);
      setRiskAcknowledged(false);
      setStep('edit');
    }
  }, [iface, networkStackInfo]);

  if (!isOpen || !iface) return null;

  const isValidIp = (ip: string) => {
    const parts = ip.trim().split('.');
    if (parts.length !== 4) return false;
    return parts.every((p) => {
      const n = parseInt(p, 10);
      return !isNaN(n) && n >= 0 && n <= 255 && p === String(n);
    });
  };

  const handleAddDns = () => {
    const clean = newDns.trim();
    if (!clean) return;
    if (!isValidIp(clean)) {
      setFeedback({
        message: isEn ? 'Invalid DNS IP address format' : 'فرمت آدرس DNS نامعتبر است',
        type: 'error',
      });
      return;
    }
    if (!dnsList.includes(clean)) {
      setDnsList([...dnsList, clean]);
    }
    setNewDns('');
  };

  const handleRemoveDns = (index: number) => {
    setDnsList(dnsList.filter((_, i) => i !== index));
  };

  const handleApplyPresetDns = (servers: string[]) => {
    setDnsList(servers);
  };

  const handleProceedToPreview = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    // Validation
    if (ipv4Mode === 'static' && state === 'UP') {
      if (!ipv4.trim()) {
        setFeedback({
          message: isEn ? 'IPv4 address is required in Static mode' : 'در حالت استاتیک وارد کردن آدرس IPv4 الزامی است',
          type: 'error',
        });
        return;
      }
      if (!isValidIp(ipv4)) {
        setFeedback({
          message: isEn ? 'Invalid IPv4 address format' : 'فرمت آدرس IPv4 وارد شده صحیح نیست',
          type: 'error',
        });
        return;
      }
      if (gateway.trim() && !isValidIp(gateway)) {
        setFeedback({
          message: isEn ? 'Invalid Gateway IP address format' : 'فرمت آدرس گیت‌وی پیش‌فرض صحیح نیست',
          type: 'error',
        });
        return;
      }
    }

    setStep('preview');
  };

  const handleFinalSubmit = async () => {
    if (isManagementInterface && (state === 'DOWN' || (ipv4Mode === 'static' && ipv4 !== iface.ipv4))) {
      if (!riskAcknowledged) {
        setFeedback({
          message: isEn
            ? 'Please acknowledge the connection risk before applying changes to the SSH management interface'
            : 'لطفاً پیش از اعمال تغییرات روی اینترفیس مدیریت، تاییدیه پذیرش ریسک قطعی را فعال کنید',
          type: 'error',
        });
        return;
      }
    }

    setSaving(true);
    setFeedback(null);

    const payload: LinuxInterfaceConfigPayload = {
      state,
      ipv4Mode,
      ipv4: ipv4Mode === 'static' && ipv4.trim() ? ipv4.trim() : undefined,
      cidr: ipv4Mode === 'static' ? Number(cidr) : undefined,
      gateway: ipv4Mode === 'static' && gateway.trim() ? gateway.trim() : undefined,
      dns: dnsList.length > 0 ? dnsList : undefined,
      mtu: mtu ? Number(mtu) : undefined,
    };

    try {
      const res = await configureLinuxServerNetwork(server.id, iface.name, payload, ephemeralPassword);

      if (res.success) {
        setVerifiedResult(res);
        setStep('result');
        setFeedback({
          message:
            res.message ||
            (isEn
              ? `Network interface ${iface.name} configured successfully.`
              : `کارت شبکه ${iface.name} با موفقیت پیکربندی شد.`),
          type: 'success',
          providerUsed: res.providerUsed,
        });
      } else {
        setFeedback({
          message:
            res.message ||
            res.error ||
            (isEn ? 'Failed to update network interface.' : 'خطا در اعمال پیکربندی کارت شبکه.'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error during configuration.' : 'خطای ارتباطی در ارسال دستورات.'),
        type: 'error',
      });
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
            <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold">
                  {isEn ? `Configure Network Interface (${iface.name})` : `پیکربندی پیشرفته کارت شبکه (${iface.name})`}
                </h3>
                {networkStackInfo && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold">
                    Stack: {networkStackInfo.activeStack}
                  </span>
                )}
                <FieldInfoTooltip
                  title={isEn ? 'Distribution-Aware Network Setup' : 'پیکربندی سازگار با توزیع شبکه'}
                  infoWhatEn="Configures IPv4 mode (DHCP vs Static IP), CIDR subnet prefix, default gateway, DNS resolvers, and MTU using the server's native network manager."
                  infoWhatFa="تنظیم شیوه دریافت آدرس (DHCP یا Static)، ساب‌نت، گیت‌وی پیش‌فرض، سرورهای DNS و MTU با استفاده از مدیر شبکه اختصاصی سرور."
                  infoWhyEn="Ensures configuration persists reliably across system reboots without breaking distro-specific network stacks like Netplan, NetworkManager, or ifupdown."
                  infoWhyFa="اطمینان حاصل می‌کند که تغییرات پس از راه‌اندازی مجدد سرور پایدار مانده و به ساختار توزیع آسیب نمی‌زند."
                  infoExampleEn="Static: 192.168.1.100/24 with Gateway 192.168.1.1 and DNS 1.1.1.1, 8.8.8.8."
                  infoExampleFa="استاتیک: ۱۹۲.۱۶۸.۱.۱۰۰/۲۴ همراه با گیت‌وی ۱۹۲.۱۶۸.۱.۱ و دی‌ان‌اس‌های ۱.۱.۱.۱ و ۸.۸.۸.۸."
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <span className="text-xs text-slate-400 font-mono">
                MAC: {iface.mac || 'N/A'} • {isEn ? 'Current:' : 'فعلی:'}{' '}
                {iface.ipv4 ? `${iface.ipv4}/${iface.cidr || 24}` : isEn ? 'Unassigned' : 'بدون آی‌پی'}
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

        {/* Modal Navigation Breadcrumbs */}
        <div
          className={`flex items-center justify-between px-5 py-2.5 border-b text-xs font-semibold ${
            isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/40 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep('edit')}
              className={`flex items-center gap-1.5 transition cursor-pointer ${
                step === 'edit' ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px]">
                1
              </span>
              <span>{isEn ? 'Configuration Parameters' : 'تنظیمات اینترفیس'}</span>
            </button>

            <span className="text-slate-600">/</span>

            <button
              type="button"
              onClick={() => {
                if (step === 'result') setStep('preview');
              }}
              className={`flex items-center gap-1.5 transition ${
                step === 'preview' ? 'text-cyan-400 font-bold' : 'text-slate-400'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-slate-500/20 text-slate-400 flex items-center justify-center text-[10px]">
                2
              </span>
              <span>{isEn ? 'Configuration Preview' : 'پیش‌نمایش تغییرات'}</span>
            </button>

            {step === 'result' && (
              <>
                <span className="text-slate-600">/</span>
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px]">
                    3
                  </span>
                  <span>{isEn ? 'Verified Verification' : 'اعتبارسنجی زنده'}</span>
                </span>
              </>
            )}
          </div>

          {networkStackInfo?.activeService && (
            <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
              Target Service: <strong className="text-slate-300">{networkStackInfo.activeService}</strong>
            </span>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {feedback && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <div className="flex-1 font-mono text-[11px]">
                <span>{feedback.message}</span>
                {feedback.providerUsed && (
                  <span className="block text-[10px] text-emerald-400/80 mt-0.5">
                    Provider Used: {feedback.providerUsed}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* STEP 1: EDIT CONFIGURATION */}
          {step === 'edit' && (
            <form onSubmit={handleProceedToPreview} className="space-y-4">
              {/* Interface State Toggle */}
              <div>
                <label className="text-xs font-semibold block mb-1">
                  {isEn ? 'Administrative Link State' : 'وضعیت عملکردی اینترفیس (Link State)'}
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setState('UP')}
                    className={`px-4 py-2 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                      state === 'UP'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-500 shadow-sm'
                        : isLightMode
                        ? 'bg-slate-100 border-slate-300 text-slate-600'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${state === 'UP' ? 'bg-slate-950' : 'bg-emerald-400'}`} />
                    <span>UP ({isEn ? 'Enabled' : 'فعال'})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setState('DOWN')}
                    className={`px-4 py-2 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                      state === 'DOWN'
                        ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                        : isLightMode
                        ? 'bg-slate-100 border-slate-300 text-slate-600'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${state === 'DOWN' ? 'bg-white' : 'bg-rose-400'}`} />
                    <span>DOWN ({isEn ? 'Disabled' : 'غیرفعال'})</span>
                  </button>
                </div>
              </div>

              {/* IP Configuration Mode: DHCP vs Static */}
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold block">
                    {isEn ? 'IPv4 Address Configuration Mode' : 'نحوه تخصیص آدرس IPv4'}
                  </label>
                  <span className="text-[11px] font-mono text-cyan-400 font-semibold uppercase">
                    {ipv4Mode}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setIpv4Mode('dhcp')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      ipv4Mode === 'dhcp'
                        ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 shadow-sm'
                        : isLightMode
                        ? 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-bold text-xs">DHCP</span>
                      <Radio className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {isEn
                        ? 'Automatic IP & routing assignment from network DHCP server.'
                        : 'دریافت خودکار IP، ساب‌نت و گیت‌وی از سرور DHCP شبکه.'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIpv4Mode('static')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      ipv4Mode === 'static'
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-sm'
                        : isLightMode
                        ? 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-bold text-xs">{isEn ? 'Static IP' : 'آی‌پی استاتیک'}</span>
                      <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {isEn
                        ? 'Manual persistent assignment of static IP, prefix, and gateway.'
                        : 'تخصیص دستی و پایدار آدرس IP، ساب‌نت و گیت‌وی روی سرور.'}
                    </span>
                  </button>
                </div>

                {/* Static IP Fields */}
                {ipv4Mode === 'static' && (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <label className="text-xs font-semibold block mb-1">
                          {isEn ? 'Static IPv4 Address' : 'آدرس IPv4 استاتیک'} *
                        </label>
                        <input
                          type="text"
                          placeholder="192.168.1.100"
                          value={ipv4}
                          onChange={(e) => setIpv4(e.target.value)}
                          className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-900'
                              : 'bg-slate-950 border-slate-700 text-white'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold block mb-1">
                          {isEn ? 'CIDR Prefix' : 'ساب‌نت مسک (CIDR)'} *
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={32}
                          value={cidr}
                          onChange={(e) => setCidr(Number(e.target.value))}
                          className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-900'
                              : 'bg-slate-950 border-slate-700 text-white'
                          }`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold block mb-1">
                        {isEn ? 'Default Gateway (Optional)' : 'گیت‌وی پیش‌فرض (اختیاری)'}
                      </label>
                      <input
                        type="text"
                        placeholder="192.168.1.1"
                        value={gateway}
                        onChange={(e) => setGateway(e.target.value)}
                        className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-900'
                            : 'bg-slate-950 border-slate-700 text-white'
                        }`}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* DNS Configuration Section */}
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-purple-400" />
                    <label className="text-xs font-bold block">
                      {isEn ? 'DNS Configuration' : 'پیکربندی سرورهای DNS'}
                    </label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleApplyPresetDns(['1.1.1.1', '1.0.0.1'])}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 transition cursor-pointer"
                    >
                      Cloudflare
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPresetDns(['8.8.8.8', '8.8.4.4'])}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 transition cursor-pointer"
                    >
                      Google
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPresetDns(['9.9.9.9', '149.112.112.112'])}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition cursor-pointer"
                    >
                      Quad9
                    </button>
                  </div>
                </div>

                {/* DNS Servers List */}
                <div className="space-y-2">
                  {dnsList.map((dns, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs font-mono ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-sans">
                          {index === 0
                            ? isEn
                              ? 'Primary:'
                              : 'اولیه:'
                            : index === 1
                            ? isEn
                              ? 'Secondary:'
                              : 'ثانویه:'
                            : `#${index + 1}:`}
                        </span>
                        <span className="font-bold text-slate-200">{dns}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveDns(index)}
                        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                        title={isEn ? 'Remove DNS server' : 'حذف دی‌ان‌اس'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* Add New DNS Input */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="1.1.1.1"
                      value={newDns}
                      onChange={(e) => setNewDns(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddDns();
                        }
                      }}
                      className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                        isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleAddDns}
                      className="px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 text-xs font-bold transition cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Add DNS' : 'افزودن دی‌ان‌اس'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* MTU Section */}
              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className="text-xs font-semibold block mb-1">
                    {isEn ? 'MTU (Maximum Transmission Unit)' : 'مقدار MTU فریم شبکه'}
                  </label>
                  <input
                    type="number"
                    min={576}
                    max={9216}
                    value={mtu}
                    onChange={(e) => setMtu(Number(e.target.value))}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                      isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div className="flex items-center gap-1.5 pb-1">
                  <button
                    type="button"
                    onClick={() => setMtu(1500)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                  >
                    1500 (Standard)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMtu(9000)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                  >
                    9000 (Jumbo)
                  </button>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={onClose}
                  className={`px-4 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    isLightMode ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-2 shadow-sm"
                >
                  <Eye className="w-4 h-4" />
                  <span>{isEn ? 'Preview Changes' : 'پیش‌نمایش تغییرات'}</span>
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: CONFIGURATION PREVIEW & CONNECTION SAFETY */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300">
                <p className="font-semibold">
                  {isEn
                    ? 'Review the configuration diff before dispatching changes to the remote Linux networking stack.'
                    : 'پیش از ارسال دستورات به پشته شبکه لینوکس، تغییرات پارامترها را بررسی فرمایید.'}
                </p>
              </div>

              {/* Side-by-Side Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                {/* Current Settings */}
                <div
                  className={`p-4 rounded-xl border space-y-2 ${
                    isLightMode ? 'bg-slate-100 border-slate-300' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <span className="text-[11px] font-bold text-slate-400 block font-sans uppercase">
                    {isEn ? 'Current Configuration' : 'پیکربندی فعلی'}
                  </span>
                  <div className="space-y-1.5 pt-1">
                    <div>
                      <span className="text-slate-500 block text-[10px]">State:</span>
                      <span className="font-bold text-slate-300">{iface.state}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">IP Mode:</span>
                      <span className="font-bold text-slate-300 uppercase">{iface.ipMode || 'unconfigured'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">IPv4:</span>
                      <span className="font-bold text-slate-300">
                        {iface.ipv4 ? `${iface.ipv4}/${iface.cidr || 24}` : 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Gateway:</span>
                      <span className="font-bold text-slate-300">{iface.gateway || 'None'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">DNS:</span>
                      <span className="font-bold text-slate-300">
                        {iface.dns && iface.dns.length > 0 ? iface.dns.join(', ') : 'Default / Not set'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">MTU:</span>
                      <span className="font-bold text-slate-300">{iface.mtu || 1500}</span>
                    </div>
                  </div>
                </div>

                {/* Target Settings */}
                <div
                  className={`p-4 rounded-xl border space-y-2 ${
                    isLightMode ? 'bg-cyan-50/50 border-cyan-300' : 'bg-cyan-950/20 border-cyan-500/30'
                  }`}
                >
                  <span className="text-[11px] font-bold text-cyan-400 block font-sans uppercase">
                    {isEn ? 'New Target Configuration' : 'پیکربندی هدف جدید'}
                  </span>
                  <div className="space-y-1.5 pt-1">
                    <div>
                      <span className="text-slate-500 block text-[10px]">State:</span>
                      <span className={`font-bold ${state === 'UP' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {state}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">IP Mode:</span>
                      <span className="font-bold text-cyan-400 uppercase">{ipv4Mode}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">IPv4:</span>
                      <span className="font-bold text-slate-100">
                        {ipv4Mode === 'dhcp' ? 'Assigned by DHCP' : `${ipv4}/${cidr}`}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Gateway:</span>
                      <span className="font-bold text-slate-100">
                        {ipv4Mode === 'dhcp' ? 'Provided by DHCP' : gateway || 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">DNS:</span>
                      <span className="font-bold text-purple-300">
                        {dnsList.length > 0 ? dnsList.join(', ') : 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">MTU:</span>
                      <span className="font-bold text-slate-100">{mtu}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SSH Management Session Safety Warning Checkbox */}
              {isManagementInterface && (
                <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/30 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-300">
                        {isEn
                          ? 'Active Management Connection Warning'
                          : 'هشدار مهم: مسیر اتصال فعال نشست SSH'}
                      </h4>
                      <p className="text-[11px] text-amber-200/90 mt-1 leading-relaxed">
                        {isEn
                          ? `You are currently connected through ${iface.name}. Changing the IP address, prefix, or bringing this interface DOWN may disconnect your active SSH session immediately.`
                          : `شما در حال حاضر از طریق اینترفیس ${iface.name} به سرور متصل هستید. تغییر آدرس آی‌پی، ساب‌نت یا غیرفعال کردن (DOWN) این کارت ممکن است نشست SSH فعال شما را فورا قطع نماید.`}
                      </p>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={riskAcknowledged}
                      onChange={(e) => setRiskAcknowledged(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 border-amber-400 bg-slate-900"
                    />
                    <span className="text-xs font-bold text-amber-300">
                      {isEn
                        ? 'I understand the connection risk and wish to apply this configuration.'
                        : 'ریسک قطعی ارتباط را می‌پذیرم و مایل به اعمال این پیکربندی هستم.'}
                    </span>
                  </label>
                </div>
              )}

              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setStep('edit')}
                  disabled={saving}
                  className={`px-4 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    isLightMode ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {isEn ? 'Back to Edit' : 'بازگشت به ویرایش'}
                </button>

                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={saving || (isManagementInterface && !riskAcknowledged)}
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <Check className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
                  <span>
                    {saving
                      ? isEn
                        ? 'Applying Native Config...'
                        : 'در حال اعمال...'
                      : isEn
                      ? 'Apply Configuration'
                      : 'اعمال نهایی پیکربندی'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: RESULT & REAL-TIME VERIFICATION */}
          {step === 'result' && verifiedResult && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <h4 className="text-sm font-bold">
                    {isEn ? 'Configuration Verified Successfully' : 'پیکربندی با موفقیت اعمال و اعتبارسنجی شد'}
                  </h4>
                </div>
                <p className="text-xs text-slate-300">
                  {verifiedResult.message}
                </p>
                {verifiedResult.providerUsed && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-block">
                    Linux Network Provider: {verifiedResult.providerUsed}
                  </span>
                )}
              </div>

              {verifiedResult.verifiedState && (
                <div
                  className={`p-4 rounded-xl border space-y-3 text-xs font-mono ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <span className="text-[11px] font-bold text-slate-400 block font-sans uppercase">
                    {isEn ? 'Real Verified Linux Interface State' : 'وضعیت واقعی استخراج‌شده از کرنل لینوکس'}
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    <div>
                      <span className="text-slate-500 block text-[10px]">State:</span>
                      <span className="font-bold text-emerald-400">
                        {verifiedResult.verifiedState.state}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">IPv4:</span>
                      <span className="font-bold text-slate-200">
                        {verifiedResult.verifiedState.ipv4
                          ? `${verifiedResult.verifiedState.ipv4}/${verifiedResult.verifiedState.cidr || 24}`
                          : 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Gateway:</span>
                      <span className="font-bold text-slate-200">
                        {verifiedResult.verifiedState.gateway || 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">MTU:</span>
                      <span className="font-bold text-slate-200">
                        {verifiedResult.verifiedState.mtu || 1500}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Finish Actions */}
              <div className="flex items-center justify-end pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => {
                    onSuccess();
                    onClose();
                  }}
                  className="px-6 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-2 shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  <span>{isEn ? 'Done' : 'تکمیل و بازگشت'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
