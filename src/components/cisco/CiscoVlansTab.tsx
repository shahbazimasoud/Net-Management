import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  FileCode2,
  Server,
  Network,
  Globe,
  Radio,
} from 'lucide-react';
import { Device } from '../../types';
import { useLanguage } from '../../i18n';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { updateCiscoConfigTab } from '../../services/api';

export interface CiscoVlansTabProps {
  device: Device;
  initialConfig?: any;
  isPermitted: boolean;
  isLightMode?: boolean;
  onConfigApplied?: () => void;
}

interface VlanItem {
  id: number;
  name: string;
  status: string;
}

const COMMON_SUBNET_MASKS = [
  { mask: '255.255.255.0', cidr: '/24' },
  { mask: '255.255.255.128', cidr: '/25' },
  { mask: '255.255.255.192', cidr: '/26' },
  { mask: '255.255.255.224', cidr: '/27' },
  { mask: '255.255.255.240', cidr: '/28' },
  { mask: '255.255.0.0', cidr: '/16' },
];

export const CiscoVlansTab: React.FC<CiscoVlansTabProps> = ({
  device,
  initialConfig,
  isPermitted,
  isLightMode = false,
  onConfigApplied,
}) => {
  const { isEn } = useLanguage();

  const vlansData = Array.isArray(initialConfig?.vlans) ? initialConfig.vlans : [];
  const sviData = initialConfig?.svi || {};
  const defaultGw = initialConfig?.default_gateway || '';

  // Form States: VLANs list
  const [vlans, setVlans] = useState<VlanItem[]>(
    vlansData.length > 0
      ? vlansData
      : [
          { id: 1, name: 'default', status: 'active' },
          { id: 10, name: 'Management', status: 'active' },
          { id: 20, name: 'Users_LAN', status: 'active' },
        ]
  );
  const [newVlanId, setNewVlanId] = useState<number>(30);
  const [newVlanName, setNewVlanName] = useState<string>('Servers_DMZ');

  // Form States: Management SVI
  const [sviInterface, setSviInterface] = useState<string>(
    sviData.interface || 'Vlan1'
  );
  const [sviIp, setSviIp] = useState<string>(
    sviData.ip || device.ip || '192.168.1.2'
  );
  const [sviSubnet, setSviSubnet] = useState<string>(
    sviData.subnet || '255.255.255.0'
  );
  const [gateway, setGateway] = useState<string>(defaultGw || '192.168.1.1');

  // Execution state
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{
    success: boolean;
    output?: string;
    error?: string;
  } | null>(null);

  // Sync with initialConfig
  useEffect(() => {
    if (Array.isArray(initialConfig?.vlans) && initialConfig.vlans.length > 0) {
      setVlans(initialConfig.vlans);
    }
    if (sviData.interface) setSviInterface(sviData.interface);
    if (sviData.ip) setSviIp(sviData.ip);
    if (sviData.subnet) setSviSubnet(sviData.subnet);
    if (initialConfig?.default_gateway) setGateway(initialConfig.default_gateway);
  }, [initialConfig]);

  // Live generated CLI commands
  const generatedCli = useMemo(() => {
    const lines: string[] = ['configure terminal'];
    for (const v of vlans) {
      if (v.id > 1) {
        lines.push(`vlan ${v.id}`);
        if (v.name.trim()) lines.push(` name ${v.name.trim()}`);
        lines.push('exit');
      }
    }
    if (sviInterface.trim() && sviIp.trim() && sviSubnet.trim()) {
      lines.push(`interface ${sviInterface.trim()}`);
      lines.push(` ip address ${sviIp.trim()} ${sviSubnet.trim()}`);
      lines.push(' no shutdown');
      lines.push('exit');
    }
    if (gateway.trim()) {
      lines.push(`ip default-gateway ${gateway.trim()}`);
    }
    lines.push('end');
    return lines.join('\n');
  }, [vlans, sviInterface, sviIp, sviSubnet, gateway]);

  // Add VLAN
  const handleAddVlan = () => {
    if (!newVlanId || newVlanId < 2 || newVlanId > 4094) return;
    if (vlans.some((v) => v.id === newVlanId)) return;
    setVlans([...vlans, { id: newVlanId, name: newVlanName.trim() || `VLAN${newVlanId}`, status: 'active' }]);
    setNewVlanId(newVlanId + 10);
    setNewVlanName('');
  };

  // Remove VLAN
  const handleRemoveVlan = (id: number) => {
    if (id === 1) return; // VLAN 1 cannot be deleted
    setVlans(vlans.filter((v) => v.id !== id));
  };

  // Apply to Switch
  const handleApply = async () => {
    if (!isPermitted || isApplying) return;
    setIsApplying(true);
    setApplyResult(null);

    const payload = {
      vlans,
      svi: {
        interface: sviInterface.trim(),
        ip: sviIp.trim(),
        subnet: sviSubnet.trim(),
      },
      default_gateway: gateway.trim() || undefined,
    };

    try {
      const res = await updateCiscoConfigTab(device.id, 'vlans', payload);
      if (res.success) {
        setApplyResult({
          success: true,
          output: res.output || (isEn ? 'VLAN database and SVI interface configured successfully.' : 'دیتابیس ویلن‌ها و اینترفیس مدیریتی SVI با موفقیت روی سوئیچ ثبت و اعمال شدند.'),
        });
        if (onConfigApplied) onConfigApplied();
      } else {
        setApplyResult({
          success: false,
          error: res.error || (isEn ? 'Failed to apply VLAN configuration' : 'خطا در اعمال پیکربندی ویلن‌ها'),
        });
      }
    } catch (err: any) {
      setApplyResult({
        success: false,
        error: err?.message || (isEn ? 'Communication error during VLAN deployment' : 'خطای ارتباطی هنگام اعمال تنظیمات ویلن‌ها'),
      });
    } finally {
      setIsApplying(false);
    }
  };

  // Reset Form
  const handleReset = () => {
    if (Array.isArray(initialConfig?.vlans) && initialConfig.vlans.length > 0) {
      setVlans(initialConfig.vlans);
    } else {
      setVlans([
        { id: 1, name: 'default', status: 'active' },
        { id: 10, name: 'Management', status: 'active' },
      ]);
    }
    setSviInterface(sviData.interface || 'Vlan1');
    setSviIp(sviData.ip || device.ip || '192.168.1.2');
    setSviSubnet(sviData.subnet || '255.255.255.0');
    setGateway(defaultGw || '192.168.1.1');
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
          <div className="p-2 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-xs sm:text-sm">
              {isEn ? 'VLAN Database & In-Band Management SVI' : 'پایگاه داده ویلن‌ها و اینترفیس مدیریتی SVI'}
            </h4>
            <p className="text-xs opacity-75 mt-0.5">
              {isEn
                ? 'Create Layer 2 broadcast domains and assign Layer 3 in-band management IP addresses.'
                : 'تفکیک دامنه‌های برودکست لایه دو و تنظیم آدرس IP اینترفیس مجازی مدیریتی سوئیچ.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40">
            {vlans.length} {isEn ? 'VLANs Configured' : 'ویلن فعال'}
          </span>
        </div>
      </div>

      {/* Grid: Left (VLANs List) - Right (Management SVI & Gateway) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left Column: VLANs Database */}
        <div
          className={`p-5 rounded-2xl border space-y-4 shadow-xs ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-900/40 border-slate-800 text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-2.5">
            <h5 className="font-bold text-xs uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
              <Layers className="w-4 h-4" />
              <span>{isEn ? 'Layer 2 VLAN Entries' : 'ویلن‌های لایه دو (VLAN Database)'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'Layer 2 VLANs' : 'ویلن‌های لایه دو'}
              infoWhatEn="VLAN IDs range from 1 to 4094. VLAN 1 is the immutable default management VLAN. VLANs 2-1001 are standard range."
              infoWhatFa="شناسه‌های ویلن از ۱ تا ۴۰۹۴ قابل تعریف هستند. ویلن ۱ پیش‌فرض تغییرناپذیر بوده و ویلن‌های ۲ تا ۱۰۰۱ رنج استاندارد سازمانی هستند."
              infoWhyEn="Isolates broadcast domains and traffic flows between accounting, engineering, servers, and guest users."
              infoWhyFa="جداسازی ترافیک بخش‌های مختلف سازمان (مالی، مهندسی، سرورها و مهمان) جهت افزایش امنیت و بازدهی شبکه."
              infoExampleEn="vlan 20 -> name Corporate_LAN"
              infoExampleFa="vlan 20 -> name Corporate_LAN"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* Add VLAN Form */}
          <div className="grid grid-cols-12 gap-2">
            <input
              type="number"
              min="2"
              max="4094"
              value={newVlanId}
              onChange={(e) => setNewVlanId(parseInt(e.target.value, 10) || 2)}
              disabled={!isPermitted}
              placeholder="VLAN ID"
              className={`col-span-4 px-3 py-1.5 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              }`}
            />
            <input
              type="text"
              value={newVlanName}
              onChange={(e) => setNewVlanName(e.target.value)}
              disabled={!isPermitted}
              placeholder={isEn ? 'VLAN Name' : 'نام ویلن'}
              className={`col-span-6 px-3 py-1.5 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              }`}
            />
            <button
              type="button"
              onClick={handleAddVlan}
              disabled={!isPermitted || !newVlanId}
              className={`col-span-2 rounded-xl border flex items-center justify-center cursor-pointer transition disabled:opacity-40 ${
                isLightMode
                  ? 'bg-cyan-50 text-cyan-700 border-cyan-300 hover:bg-cyan-100'
                  : 'bg-cyan-950 text-cyan-300 border-cyan-700/60 hover:bg-cyan-900'
              }`}
              title={isEn ? 'Add VLAN' : 'افزودن ویلن'}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* VLANs List */}
          <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
            {vlans.map((v) => (
              <div
                key={v.id}
                className={`flex items-center justify-between p-2 rounded-xl border text-xs font-mono ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-200 text-slate-800'
                    : 'bg-slate-950/60 border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-12 px-1.5 py-0.5 rounded text-center font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    VID {v.id}
                  </span>
                  <span className="font-semibold">{v.name}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase">{v.status}</span>
                  {v.id > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveVlan(v.id)}
                      disabled={!isPermitted}
                      className="p-1 rounded text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
                      title={isEn ? 'Delete VLAN' : 'حذف'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Management SVI & Default Gateway */}
        <div
          className={`p-5 rounded-2xl border space-y-4 shadow-xs ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-900/40 border-slate-800 text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-2.5">
            <h5 className="font-bold text-xs uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
              <Server className="w-4 h-4" />
              <span>{isEn ? 'Switch Virtual Interface (SVI) & IP' : 'اینترفیس لایه سه SVI و آی‌پی مدیریتی'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'Management SVI & Default Gateway' : 'اینترفیس SVI و Default Gateway'}
              infoWhatEn="A Switch Virtual Interface (SVI) assigns an IP address to a VLAN, allowing in-band SSH/SNMP management. Default-gateway routes off-subnet traffic."
              infoWhatFa="اینترفیس مجازی SVI یک آدرس IP به ویلن اختصاص می‌دهد تا دسترسی از راه دور برقرار شود. Default Gateway ترافیک را به سمت روتر شبکه هدایت می‌کند."
              infoWhyEn="Without a functional SVI and default-gateway, the switch cannot be reached from different subnets or corporate WANs."
              infoWhyFa="بدون SVI و Gateway مناسب، سوئیچ از سایر ساب‌نت‌ها و دفاتر راه دور غیرقابل دسترس خواهد بود."
              infoExampleEn="interface Vlan1 -> ip address 192.168.1.2 255.255.255.0, ip default-gateway 192.168.1.1"
              infoExampleFa="interface Vlan1 -> ip address 192.168.1.2 255.255.255.0, ip default-gateway 192.168.1.1"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* SVI Interface Name */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              {isEn ? 'SVI Interface Name (e.g. Vlan1, Vlan10):' : 'نام اینترفیس مدیریتی SVI (مانند Vlan1 یا Vlan10):'}
            </label>
            <input
              type="text"
              value={sviInterface}
              onChange={(e) => setSviInterface(e.target.value)}
              disabled={!isPermitted}
              placeholder="Vlan1"
              className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              }`}
              dir="ltr"
            />
          </div>

          {/* SVI IP Address */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              {isEn ? 'Management IPv4 Address:' : 'آدرس آی‌پی مدیریتی سوئیچ (IPv4):'}
            </label>
            <input
              type="text"
              value={sviIp}
              onChange={(e) => setSviIp(e.target.value)}
              disabled={!isPermitted}
              placeholder="192.168.1.2"
              className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              }`}
              dir="ltr"
            />
          </div>

          {/* Subnet Mask with Presets */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              {isEn ? 'Subnet Mask:' : 'ساب‌نت ماسک شبکه:'}
            </label>
            <input
              type="text"
              value={sviSubnet}
              onChange={(e) => setSviSubnet(e.target.value)}
              disabled={!isPermitted}
              placeholder="255.255.255.0"
              className={`w-full px-3 py-2 rounded-xl text-xs border font-mono mb-1.5 ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              }`}
              dir="ltr"
            />
            <div className="flex flex-wrap gap-1.5">
              {COMMON_SUBNET_MASKS.map((sm, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSviSubnet(sm.mask)}
                  disabled={!isPermitted}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border transition cursor-pointer ${
                    sviSubnet === sm.mask
                      ? 'bg-cyan-600 text-white border-cyan-500'
                      : isLightMode
                      ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {sm.cidr}
                </button>
              ))}
            </div>
          </div>

          {/* Default Gateway */}
          <div className="pt-2 border-t border-slate-800">
            <label className="block text-xs font-semibold mb-1">
              {isEn ? 'Default Gateway (ip default-gateway):' : 'دروازه پیش‌فرض (ip default-gateway):'}
            </label>
            <input
              type="text"
              value={gateway}
              onChange={(e) => setGateway(e.target.value)}
              disabled={!isPermitted}
              placeholder="192.168.1.1"
              className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              }`}
              dir="ltr"
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
          <span className="text-[10px] font-mono text-slate-400">{'conf t -> vlan -> interface Vlan -> end'}</span>
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
                ? 'Deploying VLANs & SVI to Switch...'
                : 'در حال اعمال ویلن‌ها و اینترفیس SVI...'
              : isEn
              ? 'Apply Configuration to Switch'
              : 'اعمال پیکربندی روی سخت‌افزار سوئیچ'}
          </span>
        </button>
      </div>
    </div>
  );
};
