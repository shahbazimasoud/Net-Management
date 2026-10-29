import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  FileCode2,
  Shield,
  Server,
  MapPin,
  User,
  Radio,
} from 'lucide-react';
import { Device } from '../../types';
import { useLanguage } from '../../i18n';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { updateCiscoConfigTab } from '../../services/api';

export interface CiscoSnmpTabProps {
  device: Device;
  initialConfig?: any;
  isPermitted: boolean;
  isLightMode?: boolean;
  onConfigApplied?: () => void;
}

interface CommunityEntry {
  community: string;
  permission: 'RO' | 'RW';
  acl?: string;
}

interface TrapHostEntry {
  host: string;
  version: string;
  community: string;
}

export const CiscoSnmpTab: React.FC<CiscoSnmpTabProps> = ({
  device,
  initialConfig,
  isPermitted,
  isLightMode = false,
  onConfigApplied,
}) => {
  const { isEn } = useLanguage();

  const snmpData = initialConfig?.snmp || {};

  // Form States
  const [communities, setCommunities] = useState<CommunityEntry[]>(
    Array.isArray(snmpData.communities) && snmpData.communities.length > 0
      ? snmpData.communities
      : [
          { community: 'NetMonitor_RO', permission: 'RO' },
        ]
  );
  const [newCommunityName, setNewCommunityName] = useState('');
  const [newCommunityPerm, setNewCommunityPerm] = useState<'RO' | 'RW'>('RO');
  const [newCommunityAcl, setNewCommunityAcl] = useState('');

  const [trapsReceivers, setTrapsReceivers] = useState<TrapHostEntry[]>(
    Array.isArray(snmpData.traps_receivers) && snmpData.traps_receivers.length > 0
      ? snmpData.traps_receivers
      : [
          { host: '192.168.1.50', version: '2c', community: 'NetMonitor_RO' },
        ]
  );
  const [newTrapHost, setNewTrapHost] = useState('');
  const [newTrapVersion, setNewTrapVersion] = useState('2c');
  const [newTrapCommunity, setNewTrapCommunity] = useState('NetMonitor_RO');

  const [location, setLocation] = useState<string>(snmpData.location || device.building || 'Datacenter Rack A-01');
  const [contact, setContact] = useState<string>(snmpData.contact || 'noc@enterprise.local');
  const [chassisId, setChassisId] = useState<string>(snmpData.chassis_id || device.name || 'CoreSwitch-01');

  // Execution state
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{
    success: boolean;
    output?: string;
    error?: string;
  } | null>(null);

  // Sync with initialConfig
  useEffect(() => {
    if (Array.isArray(snmpData.communities) && snmpData.communities.length > 0) {
      setCommunities(snmpData.communities);
    }
    if (Array.isArray(snmpData.traps_receivers) && snmpData.traps_receivers.length > 0) {
      setTrapsReceivers(snmpData.traps_receivers);
    }
    if (snmpData.location) setLocation(snmpData.location);
    if (snmpData.contact) setContact(snmpData.contact);
    if (snmpData.chassis_id) setChassisId(snmpData.chassis_id);
  }, [initialConfig]);

  // Live generated CLI commands
  const generatedCli = useMemo(() => {
    const lines: string[] = ['configure terminal'];
    for (const c of communities) {
      if (c.community.trim()) {
        const aclPart = c.acl?.trim() ? ` ${c.acl.trim()}` : '';
        lines.push(`snmp-server community ${c.community.trim()} ${c.permission}${aclPart}`);
      }
    }
    for (const tr of trapsReceivers) {
      if (tr.host.trim()) {
        lines.push(`snmp-server host ${tr.host.trim()} version ${tr.version || '2c'} ${tr.community || 'public'}`);
      }
    }
    if (location.trim()) {
      lines.push(`snmp-server location ${location.trim()}`);
    }
    if (contact.trim()) {
      lines.push(`snmp-server contact ${contact.trim()}`);
    }
    if (chassisId.trim()) {
      lines.push(`snmp-server chassis-id ${chassisId.trim()}`);
    }
    lines.push('end');
    return lines.join('\n');
  }, [communities, trapsReceivers, location, contact, chassisId]);

  // Community handlers
  const handleAddCommunity = () => {
    const trimmed = newCommunityName.trim();
    if (!trimmed) return;
    if (communities.some((c) => c.community.toLowerCase() === trimmed.toLowerCase())) return;

    setCommunities([
      ...communities,
      { community: trimmed, permission: newCommunityPerm, acl: newCommunityAcl.trim() || undefined },
    ]);
    setNewCommunityName('');
    setNewCommunityAcl('');
  };

  const handleRemoveCommunity = (index: number) => {
    setCommunities(communities.filter((_, idx) => idx !== index));
  };

  // Trap receiver handlers
  const handleAddTrapHost = () => {
    const trimmed = newTrapHost.trim();
    if (!trimmed) return;
    if (trapsReceivers.some((t) => t.host.toLowerCase() === trimmed.toLowerCase())) return;

    setTrapsReceivers([
      ...trapsReceivers,
      { host: trimmed, version: newTrapVersion, community: newTrapCommunity.trim() || 'public' },
    ]);
    setNewTrapHost('');
  };

  const handleRemoveTrapHost = (index: number) => {
    setTrapsReceivers(trapsReceivers.filter((_, idx) => idx !== index));
  };

  // Apply to switch
  const handleApply = async () => {
    if (!isPermitted || isApplying) return;
    setIsApplying(true);
    setApplyResult(null);

    const payload = {
      communities: communities.filter((c) => c.community.trim()),
      traps_receivers: trapsReceivers.filter((tr) => tr.host.trim()),
      location: location.trim(),
      contact: contact.trim(),
      chassis_id: chassisId.trim(),
    };

    try {
      const res = await updateCiscoConfigTab(device.id, 'snmp', payload);
      if (res.success) {
        setApplyResult({
          success: true,
          output: res.output || (isEn ? 'SNMP communities and traps deployed successfully.' : 'کامیونیتی‌ها و تنظیمات SNMP با موفقیت روی سوئیچ اعمال شدند.'),
        });
        if (onConfigApplied) onConfigApplied();
      } else {
        setApplyResult({
          success: false,
          error: res.error || (isEn ? 'Failed to apply SNMP configuration' : 'خطا در اعمال پیکربندی SNMP'),
        });
      }
    } catch (err: any) {
      setApplyResult({
        success: false,
        error: err?.message || (isEn ? 'Communication error during SNMP deployment' : 'خطای ارتباطی هنگام اعمال تنظیمات SNMP'),
      });
    } finally {
      setIsApplying(false);
    }
  };

  // Reset
  const handleReset = () => {
    if (Array.isArray(snmpData.communities) && snmpData.communities.length > 0) {
      setCommunities(snmpData.communities);
    } else {
      setCommunities([{ community: 'NetMonitor_RO', permission: 'RO' }]);
    }
    if (Array.isArray(snmpData.traps_receivers) && snmpData.traps_receivers.length > 0) {
      setTrapsReceivers(snmpData.traps_receivers);
    } else {
      setTrapsReceivers([{ host: '192.168.1.50', version: '2c', community: 'NetMonitor_RO' }]);
    }
    setLocation(snmpData.location || device.building || 'Datacenter Rack A-01');
    setContact(snmpData.contact || 'noc@enterprise.local');
    setChassisId(snmpData.chassis_id || device.name || 'CoreSwitch-01');
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
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-xs sm:text-sm">
              {isEn ? 'SNMP Monitoring & Traps Suite' : 'پروتکل مانیتورینگ شبکه SNMP و ارسال Trap'}
            </h4>
            <p className="text-xs opacity-75 mt-0.5">
              {isEn
                ? 'Configure SNMP communities, ACL security restrictions, trap receivers, and physical location metadata.'
                : 'پیکربندی رشته‌های شناسایی (Community)، محدودیت‌های امنیتی ACL، سرورهای دریافت هشدار و اطلاعات مکانی.'}
            </p>
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
          SNMP v2c / v3
        </span>
      </div>

      {/* Grid: Left (Communities & Traps) - Right (System Info) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left Column: Communities */}
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
              <span>{isEn ? 'SNMP Communities (RO / RW)' : 'کامیونیتی‌های دسترسی (RO / RW)'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'SNMP Community Strings' : 'رشته‌های شناسایی Community'}
              infoWhatEn="Acts as a shared password for SNMP queries. RO grants read-only polling, while RW permits remote parameter modification."
              infoWhatFa="به عنوان گذرواژه مشترک در استعلام‌های SNMP عمل می‌کند. RO دسترسی فقط‌خواندنی و RW مجوز تغییر تنظیمات را صادر می‌کند."
              infoWhyEn="Hardening community strings with unique names and ACL numbers blocks unauthorized subnet querying."
              infoWhyFa="تغییر نام‌های پیش‌فرض مانند public و اعمال شماره ACL مانع از استعلام‌های غیرمجاز از ساب‌نت‌های دیگر می‌شود."
              infoExampleEn="snmp-server community NetMonitor_RO RO 10"
              infoExampleFa="snmp-server community NetMonitor_RO RO 10"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* Add Community Form */}
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2">
              <input
                type="text"
                value={newCommunityName}
                onChange={(e) => setNewCommunityName(e.target.value)}
                disabled={!isPermitted}
                placeholder={isEn ? 'Community name (e.g. CorpRO)' : 'نام کامیونیتی (مانند CorpRO)'}
                className={`col-span-6 px-3 py-1.5 rounded-xl text-xs border font-mono ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                    : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
                }`}
                dir="ltr"
              />
              <select
                value={newCommunityPerm}
                onChange={(e) => setNewCommunityPerm(e.target.value as any)}
                disabled={!isPermitted}
                className={`col-span-3 px-2 py-1.5 rounded-xl text-xs border font-mono ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900'
                    : 'bg-slate-950 border-slate-800 text-slate-100'
                }`}
              >
                <option value="RO">RO (Read Only)</option>
                <option value="RW">RW (Read/Write)</option>
              </select>
              <input
                type="text"
                value={newCommunityAcl}
                onChange={(e) => setNewCommunityAcl(e.target.value)}
                disabled={!isPermitted}
                placeholder={isEn ? 'ACL (opt)' : 'شماره ACL'}
                className={`col-span-2 px-2 py-1.5 rounded-xl text-xs border font-mono ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                    : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
                }`}
                dir="ltr"
              />
              <button
                type="button"
                onClick={handleAddCommunity}
                disabled={!isPermitted || !newCommunityName.trim()}
                className={`col-span-1 rounded-xl border flex items-center justify-center cursor-pointer transition disabled:opacity-40 ${
                  isLightMode
                    ? 'bg-cyan-50 text-cyan-700 border-cyan-300 hover:bg-cyan-100'
                    : 'bg-cyan-950 text-cyan-300 border-cyan-700/60 hover:bg-cyan-900'
                }`}
                title={isEn ? 'Add Community' : 'افزودن کامیونیتی'}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Communities List */}
          <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
            {communities.length === 0 ? (
              <div className="py-4 text-center text-xs opacity-60">
                {isEn ? 'No communities configured' : 'هیچ کامیونیتی ثبت نشده است'}
              </div>
            ) : (
              communities.map((c, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-2 rounded-xl border text-xs ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-800'
                      : 'bg-slate-950/60 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-bold">{c.community}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${
                        c.permission === 'RO'
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      {c.permission}
                    </span>
                    {c.acl && (
                      <span className="text-[10px] opacity-70">ACL: {c.acl}</span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveCommunity(idx)}
                    disabled={!isPermitted}
                    className="p-1 rounded-lg text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
                    title={isEn ? 'Remove Community' : 'حذف'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Traps Receivers Subsection */}
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-indigo-400" />
                <span>{isEn ? 'Trap Receivers (snmp-server host):' : 'مقاصد ارسال هشدار (Trap Hosts):'}</span>
              </label>
              <FieldInfoTooltip
                title={isEn ? 'SNMP Trap Receivers' : 'سرورهای دریافت‌کننده Trap'}
                infoWhatEn="Configures IP destinations that will immediately receive asynchronous push alerts (e.g. link-down, power failure)."
                infoWhatFa="آدرس سرورهای NMS که هشدارهای فوری سوئیچ (مانند قطع شدن لینک یا افت ولتاژ) را بدون تاخیر دریافت می‌کنند."
                infoWhyEn="Ensures network administrators are notified immediately without waiting for the next periodic polling cycle."
                infoWhyFa="اطلاع‌رسانی بلادرنگ به مدیران شبکه در لحظه وقوع حادثه بدون معطلی برای دور بعدی استعلام."
                infoExampleEn="snmp-server host 10.0.0.50 version 2c NetTraps"
                infoExampleFa="snmp-server host 10.0.0.50 version 2c NetTraps"
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTrapHost}
                onChange={(e) => setNewTrapHost(e.target.value)}
                disabled={!isPermitted}
                placeholder={isEn ? 'Receiver IP (e.g. 10.0.0.50)' : 'آدرس IP گیرنده Trap'}
                className={`flex-1 px-3 py-1.5 rounded-xl text-xs border font-mono ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                    : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
                }`}
                dir="ltr"
              />
              <button
                type="button"
                onClick={handleAddTrapHost}
                disabled={!isPermitted || !newTrapHost.trim()}
                className={`p-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-40 ${
                  isLightMode
                    ? 'bg-cyan-50 text-cyan-700 border-cyan-300 hover:bg-cyan-100'
                    : 'bg-cyan-950 text-cyan-300 border-cyan-700/60 hover:bg-cyan-900'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
              {trapsReceivers.map((tr, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-2 rounded-xl border text-xs font-mono ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Server className="w-3 h-3 text-indigo-400" />
                    <span>{tr.host}</span>
                    <span className="text-[10px] opacity-70">v{tr.version}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveTrapHost(idx)}
                    disabled={!isPermitted}
                    className="p-1 rounded text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Physical Metadata */}
        <div
          className={`p-5 rounded-2xl border space-y-4 shadow-xs ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-slate-900/40 border-slate-800 text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-2.5">
            <h5 className="font-bold text-xs uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              <span>{isEn ? 'Device Identification & Location' : 'اطلاعات هویتی و مکانی تجهیز'}</span>
            </h5>
            <FieldInfoTooltip
              title={isEn ? 'SNMP System Metadata' : 'فراداده‌های سیستمی SNMP'}
              infoWhatEn="Populates standard MIB-II sysLocation, sysContact, and chassis-id variables queried by NMS inventory tools."
              infoWhatFa="فیلدهای استاندارد موقعیت مکانی، مسئول نگهداری و شناسه شاسی سوئیچ را در پایگاه اطلاعات MIB-II تکمیل می‌کند."
              infoWhyEn="Enables automated network mapping tools to place the switch accurately into topology maps and rack diagrams."
              infoWhyFa="امکان جای‌گذاری خودکار سوئیچ در نقشه‌های توپولوژی و نرم‌افزارهای مانیتورینگ بدون نیاز به ورود دستی."
              infoExampleEn="snmp-server location Datacenter Rack A-01, snmp-server contact noc@domain.com"
              infoExampleFa="snmp-server location Datacenter Rack A-01, snmp-server contact noc@domain.com"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              {isEn ? 'Physical Location (snmp-server location):' : 'موقعیت فیزیکی سوئیچ (محل استقرار / رک):'}
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={!isPermitted}
              placeholder="e.g. Tehran DC, Floor 2, Rack B-04"
              className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              }`}
            />
          </div>

          {/* Contact */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              {isEn ? 'SysAdmin / NOC Contact (snmp-server contact):' : 'اطلاعات تماس ادمین / واحد NOC:'}
            </label>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              disabled={!isPermitted}
              placeholder="e.g. netops@enterprise.local"
              className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              }`}
            />
          </div>

          {/* Chassis ID */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              {isEn ? 'Chassis ID / Host ID (snmp-server chassis-id):' : 'شناسه شاسی تجهیز (Chassis ID):'}
            </label>
            <input
              type="text"
              value={chassisId}
              onChange={(e) => setChassisId(e.target.value)}
              disabled={!isPermitted}
              placeholder="e.g. WS-C2960X-48TS-L-SW01"
              className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500'
              }`}
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
          <span className="text-[10px] font-mono text-slate-400">{'conf t -> snmp-server -> end'}</span>
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
                ? 'Applying SNMP to Switch CLI...'
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
