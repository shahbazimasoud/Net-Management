import React, { useState } from 'react';
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
  Zap,
  ArrowUpDown,
  Shield,
  Radio,
} from 'lucide-react';
import { RemoteServer, LinuxNetworkInterfaceDetail } from '../../types';
import { configureLinuxServerNetwork } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface LinuxNetworkConfigModalProps {
  isOpen: boolean;
  server: RemoteServer;
  iface: LinuxNetworkInterfaceDetail | null;
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
  ephemeralPassword,
  onClose,
  onMinimize,
  onSuccess,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [state, setState] = useState<'UP' | 'DOWN'>(iface?.state === 'DOWN' ? 'DOWN' : 'UP');
  const [ipv4, setIpv4] = useState(iface?.ipv4 || '');
  const [cidr, setCidr] = useState<number>(iface?.cidr || 24);
  const [gateway, setGateway] = useState(iface?.gateway || '');
  const [mtu, setMtu] = useState<number>(iface?.mtu || 1500);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  if (!isOpen || !iface) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const res = await configureLinuxServerNetwork(
        server.id,
        iface.name,
        {
          state,
          ipv4: ipv4.trim() || undefined,
          cidr: cidr ? Number(cidr) : undefined,
          gateway: gateway.trim() || undefined,
          mtu: mtu ? Number(mtu) : undefined,
        },
        ephemeralPassword
      );

      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? 'Network interface updated successfully' : 'تنظیمات کارت شبکه با موفقیت تغییر کرد'),
          type: 'success',
        });
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      } else {
        setFeedback({
          message: res.message || res.error || (isEn ? 'Failed to update network interface' : 'خطا در تغییر تنظیمات کارت شبکه'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error configuring interface' : 'خطای ارتباط در پیکربندی کارت شبکه'),
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`fixed z-50 flex flex-col transition-all duration-300 ${
        isMaximized
          ? 'top-0 left-0 right-0 bottom-8 p-0 w-full h-auto rounded-none border-none'
          : 'inset-0 items-center justify-center p-4 bg-black/60 backdrop-blur-sm'
      }`}
    >
      <div
        className={`flex flex-col border shadow-2xl overflow-hidden ${
          isMaximized
            ? 'w-full h-full rounded-none border-none'
            : 'w-full max-w-lg rounded-2xl max-h-[90vh]'
        } ${isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'}`}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold">
                  {isEn ? `Configure Network Interface (${iface.name})` : `تغییر و پیکربندی کارت شبکه (${iface.name})`}
                </h3>
                <FieldInfoTooltip
                  title={isEn ? 'Network Interface Configuration' : 'پیکربندی کارت شبکه'}
                  infoWhatEn="Modifies IP address, CIDR subnet mask, default gateway, MTU, and administrative state (UP/DOWN) for the remote Linux interface."
                  infoWhatFa="تنظیم آدرس IP، ساب‌نت مسک CIDR، گیت‌وی پیش‌فرض، مقدار MTU و وضعیت کارت شبکه (روشن/خاموش) در لینوکس."
                  infoWhyEn="Required for static IP assignment, subnet renumbering, jumbo frames (MTU 9000), or temporary administrative shutdown."
                  infoWhyFa="ضروری برای اختصاص IP استاتیک، تغییر رنج شبکه، تنظیم فریم‌های بزرگ MTU یا غیرفعال‌سازی موقت اینترفیس."
                  infoExampleEn="Set 192.168.1.150 with CIDR /24 and MTU 1500."
                  infoExampleFa="تنظیم ۱۹۲.۱۶۸.۱.۱۵۰ با مسک /۲۴ و MTU استاندارد ۱۵۰۰."
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <span className="text-xs text-slate-400 font-mono">
                MAC: {iface.mac || 'N/A'} | Current: {iface.ipv4 ? `${iface.ipv4}/${iface.cidr || 24}` : (isEn ? 'Unassigned' : 'بدون IP')}
              </span>
            </div>
          </div>

          {/* Triad Header Buttons: Minimize, Maximize, Close */}
          <div className="flex items-center gap-1">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                title={isEn ? 'Minimize' : 'کوچک‌نمایی'}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
            )}

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
        <form onSubmit={handleSubmit} className="p-5 space-y-4 flex-1 overflow-y-auto">
          {feedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
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
              <span className="font-mono">{feedback.message}</span>
            </div>
          )}

          {/* Interface State Toggle */}
          <div>
            <label className="text-xs font-semibold block mb-1">
              {isEn ? 'Administrative Link State' : 'وضعیت فعال بودن اینترفیس'}
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

          {/* IPv4 Address & Prefix */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold block mb-1">
                {isEn ? 'IPv4 Address' : 'آدرس آی‌پی IPv4'}
              </label>
              <input
                type="text"
                placeholder="192.168.1.100"
                value={ipv4}
                onChange={(e) => setIpv4(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                  isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
                }`}
              />
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1">
                {isEn ? 'CIDR Prefix' : 'ساب‌نت (CIDR)'}
              </label>
              <input
                type="number"
                min={1}
                max={32}
                value={cidr}
                onChange={(e) => setCidr(Number(e.target.value))}
                className={`w-full px-3 py-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                  isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
                }`}
              />
            </div>
          </div>

          {/* Gateway */}
          <div>
            <label className="text-xs font-semibold block mb-1">
              {isEn ? 'Default Gateway (Optional)' : 'گیت‌وی پیش‌فرض (اختیاری)'}
            </label>
            <input
              type="text"
              placeholder="192.168.1.1"
              value={gateway}
              onChange={(e) => setGateway(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
              }`}
            />
          </div>

          {/* MTU */}
          <div>
            <label className="text-xs font-semibold block mb-1">
              {isEn ? 'Maximum Transmission Unit (MTU)' : 'مقدار MTU اینترفیس'}
            </label>
            <input
              type="number"
              min={576}
              max={9216}
              value={mtu}
              onChange={(e) => setMtu(Number(e.target.value))}
              className={`w-full px-3 py-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
              }`}
            />
            <span className="text-[10px] text-slate-400 block mt-1">
              {isEn ? 'Standard Ethernet MTU is 1500 (or 9000 for Jumbo Frames).' : 'مقدار پیش‌فرض اترنت ۱۵۰۰ یا ۹۰۰۰ برای فریم‌های غول‌پیکر است.'}
            </span>
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
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Check className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
              <span>{saving ? (isEn ? 'Applying...' : 'در حال اعمال...') : (isEn ? 'Apply Changes' : 'اعمال تغییرات کارت شبکه')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
