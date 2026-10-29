import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Sliders,
  Terminal,
  Clock,
  Shield,
  Users,
  GitBranch,
  Network,
  FileText,
  Layers,
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Cpu,
  Server,
  Activity,
  ArrowRight,
  Info,
  Radio,
  FileCode2,
} from 'lucide-react';
import { Device } from '../../types';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { useModalDock } from '../../context/ModalDockContext';
import { isDeviceActionPermitted } from '../../utils/rbac';
import { fetchCiscoConfig, saveCiscoConfigNvram } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { CiscoVtyTab } from './CiscoVtyTab';
import { CiscoNtpTab } from './CiscoNtpTab';
import { CiscoSnmpTab } from './CiscoSnmpTab';
import { CiscoUsersTab } from './CiscoUsersTab';
import { CiscoSyslogTab } from './CiscoSyslogTab';
import { CiscoStpTab } from './CiscoStpTab';
import { CiscoVtpTab } from './CiscoVtpTab';
import { CiscoVlansTab } from './CiscoVlansTab';
import { CiscoL2SecurityTab } from './CiscoL2SecurityTab';

export type CiscoConfigTabId =
  | 'vty'
  | 'ntp'
  | 'snmp'
  | 'users'
  | 'stp'
  | 'vtp'
  | 'syslog'
  | 'vlans'
  | 'l2_security'
  | 'write_memory';

export interface CiscoDeviceConfigModalProps {
  device: Device;
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  onRestore?: () => void;
  isLightMode?: boolean;
}

interface TabDefinition {
  id: CiscoConfigTabId;
  labelEn: string;
  labelFa: string;
  actionKey:
    | 'cisco_config_vty_ssh'
    | 'cisco_config_ntp'
    | 'cisco_config_snmp'
    | 'cisco_config_users'
    | 'cisco_config_stp'
    | 'cisco_config_vtp'
    | 'cisco_config_syslog'
    | 'cisco_config_vlans'
    | 'cisco_config_l2_security'
    | 'cisco_config_write_memory';
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  tooltip: {
    whatEn: string;
    whatFa: string;
    whyEn: string;
    whyFa: string;
    exampleEn: string;
    exampleFa: string;
  };
}

const TABS: TabDefinition[] = [
  {
    id: 'vty',
    labelEn: 'SSH & VTY Lines',
    labelFa: 'خطوط VTY و پروتکل SSH',
    actionKey: 'cisco_config_vty_ssh',
    icon: Terminal,
    tooltip: {
      whatEn: 'Configures remote management access lines (vty 0 4, 5 15), transport input protocols (SSH/Telnet), and session timeouts.',
      whatFa: 'پیکربندی خطوط دسترسی مدیریتی راه دور (vty 0 4 و 5 15)، پروتکل‌های مجاز ورود (SSH/Telnet) و مدت زمان انقضای نشست.',
      whyEn: 'Restricts legacy insecure Telnet protocols to modern encrypted SSH and protects lines from idle session vulnerabilities.',
      whyFa: 'محدودسازی دسترسی به پروتکل امن SSH و جلوگیری از استفاده ناامن از تل‌نت و قطع خودکار نشست‌های رها شده.',
      exampleEn: 'line vty 0 4 -> transport input ssh, exec-timeout 10 0',
      exampleFa: 'line vty 0 4 -> transport input ssh, exec-timeout 10 0',
    },
  },
  {
    id: 'ntp',
    labelEn: 'NTP & System Clock',
    labelFa: 'زمان و سرورهای NTP',
    actionKey: 'cisco_config_ntp',
    icon: Clock,
    tooltip: {
      whatEn: 'Synchronizes Cisco switch hardware clock with authoritative stratum network time servers and sets timezone.',
      whatFa: 'همگام‌سازی ساعت سخت‌افزاری سوئیچ سیسکو با سرورهای زمانی معتبر شبکه (NTP) و تنظیم منطقه زمانی.',
      whyEn: 'Accurate time synchronization is vital for forensic syslog correlation, certificate verification, and audit trails.',
      whyFa: 'دقت ساعت سوئیچ برای بررسی رخدادهای امنیتی در لاگ‌ها، اعتبارسنجی سرتیفیکیت‌ها و حسابرسی ضروری است.',
      exampleEn: 'ntp server 192.168.1.10 prefer, clock timezone IRST 3 30',
      exampleFa: 'ntp server 192.168.1.10 prefer, clock timezone IRST 3 30',
    },
  },
  {
    id: 'snmp',
    labelEn: 'SNMP Management Suite',
    labelFa: 'پروتکل مانیتورینگ SNMP',
    actionKey: 'cisco_config_snmp',
    icon: Activity,
    tooltip: {
      whatEn: 'Configures SNMP v2c communities, v3 secure users/groups, ACL restrictions, and trap notification targets.',
      whatFa: 'پیکربندی کامیونیتی‌های SNMP نسخه 2c، کاربران و گروه‌های امن v3، محدودیت‌های ACL و مقاصد ارسال Trap.',
      whyEn: 'Enables network monitoring systems (NMS) to collect live switch metrics, bandwidth graphs, and link-down alerts.',
      whyFa: 'امکان جمع‌آوری تلمتری، وضعیت پورت‌ها و هشدارهای قطع لینک توسط سیستم‌های مانیتورینگ مرکزی شبکه.',
      exampleEn: 'snmp-server community NetPublic RO 10, snmp-server host 10.0.0.50 version 2c NetTraps',
      exampleFa: 'snmp-server community NetPublic RO 10, snmp-server host 10.0.0.50 version 2c NetTraps',
    },
  },
  {
    id: 'users',
    labelEn: 'Users & AAA Security',
    labelFa: 'کاربران محلی و سطوح دسترسی',
    actionKey: 'cisco_config_users',
    icon: Users,
    tooltip: {
      whatEn: 'Manages local user accounts, privilege levels (1-15), secure enable secret hashing (algorithm type 8/9/5).',
      whatFa: 'مدیریت حساب‌های کاربری محلی سوئیچ، تعیین سطح دسترسی (Privilege 1-15) و رمز ورود Enable Secret با الگوریتم‌های قوی.',
      whyEn: 'Guarantees emergency local administrative access if TACACS+/RADIUS authentication servers are unreachable.',
      whyFa: 'تضمین دسترسی اضطراری به سوئیچ در صورت در دسترس نبودن سرورهای احراز هویت متمرکز.',
      exampleEn: 'username netadmin privilege 15 secret C1sc0@2026!, enable secret P@ssw0rd99',
      exampleFa: 'username netadmin privilege 15 secret C1sc0@2026!, enable secret P@ssw0rd99',
    },
  },
  {
    id: 'stp',
    labelEn: 'Spanning Tree (STP)',
    labelFa: 'پروتکل پیشگیری از لوپ STP',
    actionKey: 'cisco_config_stp',
    icon: GitBranch,
    tooltip: {
      whatEn: 'Configures Spanning Tree Protocol mode (Rapid-PVST+, MST, PVST), Bridge Priority, PortFast, BPDU Guard, and Root Guard.',
      whatFa: 'تنظیم حالت پروتکل Spanning Tree (شامل Rapid-PVST و MST)، اولویت سوئیچ (Bridge Priority) و محافظ‌های BPDU Guard و Root Guard.',
      whyEn: 'Eliminates Ethernet broadcast storms and switching loops, stabilizing Layer 2 enterprise topologies.',
      whyFa: 'جلوگیری قطعی از ایجاد لوپ‌های لایه دو و طوفان برودکست در شبکه سوئیچینگ.',
      exampleEn: 'spanning-tree mode rapid-pvst, spanning-tree portfast bpduguard default',
      exampleFa: 'spanning-tree mode rapid-pvst, spanning-tree portfast bpduguard default',
    },
  },
  {
    id: 'vtp',
    labelEn: 'VTP Domain & Mode',
    labelFa: 'دامنه و پروتکل VTP',
    actionKey: 'cisco_config_vtp',
    icon: Network,
    tooltip: {
      whatEn: 'Controls VLAN Trunking Protocol (VTP) version, operating mode (Server, Client, Transparent, Off), domain name, and pruning.',
      whatFa: 'تنظیم نسخه پروتکل ترانک ویلن (VTP)، مد کاری (Server/Client/Transparent)، نام دامنه و هرس کردن ترافیک (Pruning).',
      whyEn: 'Prevents accidental VLAN database overrides from rogue or newly attached switches across trunk links.',
      whyFa: 'مدیریت هماهنگ ویلن‌ها و جلوگیری از پاک شدن ناخواسته دیتابیس ویلن توسط سوئیچ‌های جدید متصل‌شده.',
      exampleEn: 'vtp mode transparent, vtp domain EnterpriseCore, vtp version 2',
      exampleFa: 'vtp mode transparent, vtp domain EnterpriseCore, vtp version 2',
    },
  },
  {
    id: 'syslog',
    labelEn: 'Syslog & Event Logging',
    labelFa: 'ثبت وقایع و سرورهای Syslog',
    actionKey: 'cisco_config_syslog',
    icon: FileText,
    tooltip: {
      whatEn: 'Directs system log messages to remote SIEM/Syslog daemons with customizable severity levels (alerts, warnings, info).',
      whatFa: 'هدایت پیام‌ها و هشدارهای امنیتی سوئیچ به سرورهای مانیتورینگ و لاگ مرکزی (Syslog/SIEM) با فیلتر سطح اهمیت.',
      whyEn: 'Retains permanent audit trails of hardware failures, port flaps, authentication attempts, and topology shifts.',
      whyFa: 'ثبت دائمی لاگ‌های امنیتی، قطعی پورت‌ها و تلاش‌های ورود برای بازرسی و ریشه‌یابی خطاها.',
      exampleEn: 'logging host 10.0.0.40, logging trap warnings, service timestamps log datetime msec',
      exampleFa: 'logging host 10.0.0.40, logging trap warnings, service timestamps log datetime msec',
    },
  },
  {
    id: 'vlans',
    labelEn: 'VLANs & Management SVI',
    labelFa: 'ویلن‌ها و اینترفیس مدیریتی SVI',
    actionKey: 'cisco_config_vlans',
    icon: Layers,
    tooltip: {
      whatEn: 'Provisions Layer 2 VLAN IDs, human-readable names, and Layer 3 Switch Virtual Interfaces (SVI) with management IP & default-gateway.',
      whatFa: 'ساخت و نام‌گذاری ویلن‌های لایه دو و تنظیم اینترفیس لایه سه مدیریتی سوئیچ (SVI) به همراه آی‌پی و Default Gateway.',
      whyEn: 'Segments broadcast domains and ensures in-band IP manageability of the Cisco switch.',
      whyFa: 'جداسازی ترافیک بخش‌های مختلف و برقراری ارتباط پایدار برای مدیریت از راه دور سوئیچ.',
      exampleEn: 'vlan 20 -> name Corporate_LAN, interface Vlan1 -> ip address 192.168.1.2 255.255.255.0',
      exampleFa: 'vlan 20 -> name Corporate_LAN, interface Vlan1 -> ip address 192.168.1.2 255.255.255.0',
    },
  },
  {
    id: 'l2_security',
    labelEn: 'Layer 2 Security Suite',
    labelFa: 'امنیت لایه دو (DHCP Snooping & DAI)',
    actionKey: 'cisco_config_l2_security',
    icon: Shield,
    tooltip: {
      whatEn: 'Hardens switch against rogue DHCP servers (DHCP Snooping) and ARP spoofing attacks (Dynamic ARP Inspection).',
      whatFa: 'ایمن‌سازی لایه دو سوئیچ در برابر سرورهای نامعتبر DHCP (تکنیک DHCP Snooping) و حملات جعل ARP (تکنیک DAI).',
      whyEn: 'Protects enterprise workstations from man-in-the-middle (MitM) attacks, IP theft, and rogue gateway redirection.',
      whyFa: 'محافظت از ایستگاه‌های کاری در برابر حملات جعل هویت، کلاهبرداری ARP و سرقت ترافیک شبکه.',
      exampleEn: 'ip dhcp snooping, ip dhcp snooping vlan 1-100, ip arp inspection vlan 10,20',
      exampleFa: 'ip dhcp snooping, ip dhcp snooping vlan 1-100, ip arp inspection vlan 10,20',
    },
  },
  {
    id: 'write_memory',
    labelEn: 'NVRAM & Running-Config',
    labelFa: 'حافظه NVRAM و ذخیره استارتاپ',
    actionKey: 'cisco_config_write_memory',
    icon: Save,
    tooltip: {
      whatEn: 'Saves volatile RAM running-config into non-volatile NVRAM startup-config (write memory / copy run start).',
      whatFa: 'ذخیره دائمی تنظیمات حافظه RAM بر روی حافظه پایدار NVRAM (دستور write memory یا copy run start).',
      whyEn: 'Ensures changes survive planned or unplanned switch power cycles and hardware reboots.',
      whyFa: 'تضمین حفظ تمامی تغییرات اعمال شده پس از خاموش و روشن شدن یا ریبوت احتمالی سوئیچ.',
      exampleEn: 'copy running-config startup-config / write memory',
      exampleFa: 'copy running-config startup-config / write memory',
    },
  },
];

export const CiscoDeviceConfigModal: React.FC<CiscoDeviceConfigModalProps> = ({
  device,
  isOpen,
  onClose,
  onMinimize,
  onRestore,
  isLightMode = false,
}) => {
  const { t, isEn, isRtl } = useLanguage();
  const { effectivePolicy } = useAuth();
  const { dockModal, undockModal } = useModalDock();

  const [activeTab, setActiveTab] = useState<CiscoConfigTabId>('vty');
  const [isMaximized, setIsMaximized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configState, setConfigState] = useState<any>(null);
  const [isSavingNvram, setIsSavingNvram] = useState(false);
  const [nvramFeedback, setNvramFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Load authentic Cisco configuration state directly from hardware
  const loadHardwareConfig = useCallback(async () => {
    if (!device?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCiscoConfig(device.id);
      if (res.success && res.data) {
        setConfigState(res.data);
      } else {
        setError(res.error || (isEn ? 'Failed to communicate with Cisco switch' : 'برقراری ارتباط با سوئیچ سیسکو با خطا مواجه شد'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Hardware communication timeout or unreachable' : 'خطای اتصال به سخت‌افزار یا اتمام زمان مجاز ارتباط'));
    } finally {
      setLoading(false);
    }
  }, [device?.id, isEn]);

  useEffect(() => {
    if (isOpen) {
      loadHardwareConfig();
    }
  }, [isOpen, loadHardwareConfig]);

  // Handle Save to NVRAM
  const handleSaveToNvram = async () => {
    if (!device?.id) return;
    setIsSavingNvram(true);
    setNvramFeedback(null);
    try {
      const res = await saveCiscoConfigNvram(device.id);
      if (res.success) {
        setNvramFeedback({
          success: true,
          message: isEn ? 'Configuration committed to NVRAM successfully (Building configuration... [OK])' : 'پیکربندی با موفقیت در حافظه NVRAM ثبت شد (Building configuration... [OK])',
        });
      } else {
        setNvramFeedback({
          success: false,
          message: res.error || (isEn ? 'Failed to write memory' : 'خطا در ذخیره بر روی حافظه NVRAM'),
        });
      }
    } catch (e: any) {
      setNvramFeedback({
        success: false,
        message: e?.message || (isEn ? 'Hardware write memory error' : 'خطای ارتباط با سخت‌افزار هنگام ذخیره در NVRAM'),
      });
    } finally {
      setIsSavingNvram(false);
      setTimeout(() => setNvramFeedback(null), 6000);
    }
  };

  // Handle Minimize
  const handleInternalMinimize = () => {
    dockModal({
      id: `cisco-config-${device.id}`,
      labelEn: `Cisco Config: ${device.name || device.ip}`,
      labelFa: `پیکربندی سیسکو: ${device.name || device.ip}`,
      badge: device.ip,
      category: 'config',
      onRestore: () => {
        if (onRestore) onRestore();
      },
      onClose: () => {
        onClose();
      },
    });
    if (onMinimize) {
      onMinimize();
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  const currentTabDef = TABS.find((t) => t.id === activeTab) || TABS[0];
  const isTabPermitted = isDeviceActionPermitted(effectivePolicy, device.id, currentTabDef.actionKey);
  const canSaveNvram = isDeviceActionPermitted(effectivePolicy, device.id, 'cisco_config_write_memory');

  return createPortal(
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center bg-black/85 backdrop-blur-xs animate-in fade-in duration-200 select-none ${
        isMaximized ? 'p-0' : 'p-2 sm:p-4'
      }`}
    >
      <div
        className={`relative flex flex-col overflow-hidden transition-all duration-200 select-text ${
          isMaximized
            ? 'w-full h-full max-w-none rounded-none border-none max-h-full'
            : 'w-full max-w-6xl rounded-2xl border shadow-2xl max-h-[94vh]'
        } ${
          isLightMode
            ? 'bg-slate-50 border-cyan-500/40 shadow-cyan-900/20 text-slate-800'
            : 'bg-slate-950 border-cyan-500/30 shadow-cyan-950/60 text-slate-100'
        }`}
      >
        {/* Modal Top Header */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          {/* Left: Device Info and Badge */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 shadow-md ${
                isLightMode
                  ? 'bg-cyan-50 border-cyan-300 text-cyan-700 shadow-cyan-900/10'
                  : 'bg-cyan-950/80 border-cyan-500/50 text-cyan-400 shadow-cyan-950/50'
              }`}
            >
              <Sliders className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className={`text-base sm:text-lg font-bold tracking-tight truncate ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                  {device.name || (isEn ? 'Cisco Catalyst Switch' : 'سوئیچ کاتالیست سیسکو')}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border ${
                    isLightMode
                      ? 'bg-cyan-50 text-cyan-700 border-cyan-300'
                      : 'bg-cyan-950 text-cyan-300 border-cyan-700/60'
                  }`}
                  dir="ltr"
                >
                  {device.ip}
                </span>
                <span
                  className={`hidden sm:inline-flex px-2 py-0.5 rounded-md text-[10px] font-mono border uppercase ${
                    isLightMode
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-indigo-950/80 text-indigo-300 border-indigo-700/50'
                  }`}
                >
                  {device.model || device.platform || 'Cisco IOS'}
                </span>
              </div>
              <p className={`text-xs mt-0.5 truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn ? 'Enterprise Switch Configuration & Hardening Suite' : 'مجموعه جامع پیکربندی و امن‌سازی سوئیچ سازمانی'}
              </p>
            </div>
          </div>

          {/* Right: Actions, Fullscreen, Minimize, Close */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Refresh Live State */}
            <button
              type="button"
              onClick={loadHardwareConfig}
              disabled={loading}
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title={isEn ? 'Fetch latest configuration directly from switch' : 'دریافت آخرین تنظیمات جاری مستقیماً از سخت‌افزار'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
              <span className="hidden md:inline">{isEn ? 'Sync' : 'بروزرسانی'}</span>
            </button>

            {/* Save to NVRAM Button */}
            {canSaveNvram && (
              <button
                type="button"
                onClick={handleSaveToNvram}
                disabled={isSavingNvram || loading}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 ${
                  isLightMode
                    ? 'bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white border-emerald-300 shadow-emerald-100'
                    : 'bg-emerald-950/80 hover:bg-emerald-600 text-emerald-200 hover:text-white border-emerald-600/50'
                }`}
                title={isEn ? 'Save running-config into startup-config (write memory)' : 'ذخیره دائمی تنظیمات در حافظه NVRAM (دستور write memory)'}
              >
                <Save className={`w-3.5 h-3.5 ${isSavingNvram ? 'animate-pulse' : ''}`} />
                <span className="hidden sm:inline">{isSavingNvram ? (isEn ? 'Writing...' : 'در حال ذخیره...') : (isEn ? 'Write Mem' : 'ذخیره NVRAM')}</span>
              </button>
            )}

            <div className={`h-5 w-[1px] mx-1 ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`} />

            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'text-slate-400 hover:text-slate-800 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-cyan-300 hover:bg-slate-800'
              }`}
              title={
                isMaximized
                  ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام‌صفحه')
                  : (isEn ? 'Fullscreen' : 'تمام‌صفحه')
              }
              aria-label={isMaximized ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Minimize Button */}
            <button
              type="button"
              onClick={handleInternalMinimize}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'text-slate-400 hover:text-slate-800 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-cyan-300 hover:bg-slate-800'
              }`}
              title={isEn ? 'Minimize to ToolsDock' : 'مینیمایز به نوار داک پایین'}
              aria-label={isEn ? 'Minimize' : 'مینیمایز'}
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                  : 'text-slate-400 hover:text-rose-400 hover:bg-slate-800'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* NVRAM Feedback Notification Banner */}
        {nvramFeedback && (
          <div
            className={`px-4 py-2 text-xs flex items-center justify-between transition-all ${
              nvramFeedback.success
                ? isLightMode
                  ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
                  : 'bg-emerald-950/70 text-emerald-200 border-b border-emerald-800/60'
                : isLightMode
                ? 'bg-rose-50 text-rose-800 border-b border-rose-200'
                : 'bg-rose-950/70 text-rose-200 border-b border-rose-800/60'
            }`}
          >
            <div className="flex items-center gap-2">
              {nvramFeedback.success ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />}
              <span className="font-medium">{nvramFeedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setNvramFeedback(null)}
              className="text-xs opacity-60 hover:opacity-100 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Navigation Tabs Bar */}
        <div
          className={`flex items-center px-3 sm:px-6 border-b overflow-x-auto custom-scrollbar shrink-0 gap-1.5 ${
            isLightMode ? 'bg-slate-100/90 border-slate-200' : 'bg-slate-900/60 border-slate-800/80'
          }`}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isPermitted = isDeviceActionPermitted(effectivePolicy, device.id, tab.actionKey);

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-all border-b-2 cursor-pointer relative ${
                  isActive
                    ? isLightMode
                      ? 'border-cyan-600 text-cyan-800 bg-white shadow-xs rounded-t-lg'
                      : 'border-cyan-400 text-cyan-300 bg-cyan-950/40 rounded-t-lg shadow-[0_-2px_10px_rgba(6,182,212,0.15)]'
                    : isLightMode
                    ? 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-t-lg'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 rounded-t-lg'
                } ${!isPermitted ? 'opacity-65' : ''}`}
                title={isEn ? tab.labelEn : tab.labelFa}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? (isLightMode ? 'text-cyan-700' : 'text-cyan-400') : 'text-slate-400'}`} />
                <span>{isEn ? tab.labelEn : tab.labelFa}</span>
                {!isPermitted && (
                  <span title={isEn ? 'Restricted by RBAC Policy' : 'مسدود توسط پالیسی دسترسی'}>
                    <Lock className="w-3 h-3 text-amber-500 shrink-0" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Subheader / Info Bar */}
        <div
          className={`px-4 sm:px-6 py-2.5 border-b flex items-center justify-between text-xs shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-900/40 border-slate-800 text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold flex items-center gap-1.5 text-cyan-500">
              <currentTabDef.icon className="w-3.5 h-3.5" />
              <span>{isEn ? currentTabDef.labelEn : currentTabDef.labelFa}</span>
            </span>
            <span className="opacity-40">•</span>
            <span className="text-[11px] opacity-80 truncate hidden md:inline">
              {isEn ? currentTabDef.tooltip.whatEn : currentTabDef.tooltip.whatFa}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <FieldInfoTooltip
              title={isEn ? currentTabDef.labelEn : currentTabDef.labelFa}
              infoWhatEn={currentTabDef.tooltip.whatEn}
              infoWhatFa={currentTabDef.tooltip.whatFa}
              infoWhyEn={currentTabDef.tooltip.whyEn}
              infoWhyFa={currentTabDef.tooltip.whyFa}
              infoExampleEn={currentTabDef.tooltip.exampleEn}
              infoExampleFa={currentTabDef.tooltip.exampleFa}
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>
        </div>

        {/* Main Tab Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 min-h-[360px]">
          {/* RBAC Restricted Warning */}
          {!isTabPermitted && (
            <div
              className={`p-4 rounded-xl border mb-5 flex items-start gap-3 ${
                isLightMode
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
              }`}
            >
              <Lock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-xs">
                  {isEn ? 'Access Restricted by Role Policy' : 'دسترسی به این بخش توسط پالیسی امنیتی مسدود شده است'}
                </h4>
                <p className="text-xs mt-1 opacity-90 leading-relaxed">
                  {isEn
                    ? `You do not have permission (${currentTabDef.actionKey}) to modify this configuration domain on this device. Please consult your administrator or request an override in the Access Policy matrix.`
                    : `شما مجوز (${currentTabDef.actionKey}) جهت تغییر این بخش از پیکربندی روی این تجهیز را ندارید. لطفاً با راهبر سیستم تماس بگیرید یا در ماتریس استثنائات پالیسی دسترسی مجوز لازم را دریافت کنید.`}
                </p>
              </div>
            </div>
          )}

          {/* Authentic Loading State */}
          {loading && (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
                <Cpu className="w-5 h-5 text-cyan-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
              </div>
              <p className={`text-sm font-semibold mt-4 ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                {isEn ? 'Probing Authentic Cisco Hardware Telemetry...' : 'در حال خواندن وضعیت واقعی سخت‌افزار سوئیچ سیسکو...'}
              </p>
              <p className={`text-xs mt-1 font-mono ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn ? `Connecting over SSH to ${device.ip || device.name}...` : `در حال اتصال SSH به ${device.ip || device.name}...`}
              </p>
            </div>
          )}

          {/* Authentic Error State (Rule 8: Zero Fake Data!) */}
          {!loading && error && (
            <div
              className={`p-6 rounded-2xl border text-center max-w-xl mx-auto my-8 ${
                isLightMode
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              }`}
            >
              <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
              <h3 className="text-sm font-bold">
                {isEn ? 'Hardware Telemetry Unreachable' : 'عدم امکان دریافت وضعیت سخت‌افزار'}
              </h3>
              <p className="text-xs mt-2 font-mono leading-relaxed opacity-90 break-words" dir="ltr">
                {error}
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={loadHardwareConfig}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Retry Probe' : 'تلاش مجدد'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Authentic Loaded Content Shell */}
          {!loading && !error && (
            <div className="space-y-6">
              {activeTab === 'vty' && (
                <CiscoVtyTab
                  device={device}
                  initialConfig={configState}
                  isPermitted={isTabPermitted}
                  isLightMode={isLightMode}
                  onConfigApplied={loadHardwareConfig}
                />
              )}

              {activeTab === 'ntp' && (
                <CiscoNtpTab
                  device={device}
                  initialConfig={configState}
                  isPermitted={isTabPermitted}
                  isLightMode={isLightMode}
                  onConfigApplied={loadHardwareConfig}
                />
              )}

              {activeTab === 'snmp' && (
                <CiscoSnmpTab
                  device={device}
                  initialConfig={configState}
                  isPermitted={isTabPermitted}
                  isLightMode={isLightMode}
                  onConfigApplied={loadHardwareConfig}
                />
              )}

              {activeTab === 'users' && (
                <CiscoUsersTab
                  device={device}
                  initialConfig={configState}
                  isPermitted={isTabPermitted}
                  isLightMode={isLightMode}
                  onConfigApplied={loadHardwareConfig}
                />
              )}

              {activeTab === 'syslog' && (
                <CiscoSyslogTab
                  device={device}
                  initialConfig={configState}
                  isPermitted={isTabPermitted}
                  isLightMode={isLightMode}
                  onConfigApplied={loadHardwareConfig}
                />
              )}

              {activeTab === 'stp' && (
                <CiscoStpTab
                  device={device}
                  initialConfig={configState}
                  isPermitted={isTabPermitted}
                  isLightMode={isLightMode}
                  onConfigApplied={loadHardwareConfig}
                />
              )}

              {activeTab === 'vtp' && (
                <CiscoVtpTab
                  device={device}
                  initialConfig={configState}
                  isPermitted={isTabPermitted}
                  isLightMode={isLightMode}
                  onConfigApplied={loadHardwareConfig}
                />
              )}

              {activeTab === 'vlans' && (
                <CiscoVlansTab
                  device={device}
                  initialConfig={configState}
                  isPermitted={isTabPermitted}
                  isLightMode={isLightMode}
                  onConfigApplied={loadHardwareConfig}
                />
              )}

              {activeTab === 'l2_security' && (
                <CiscoL2SecurityTab
                  device={device}
                  initialConfig={configState}
                  isPermitted={isTabPermitted}
                  isLightMode={isLightMode}
                  onConfigApplied={loadHardwareConfig}
                />
              )}

              {activeTab === 'write_memory' && (
                <div
                  className={`p-5 rounded-2xl border shadow-sm ${
                    isLightMode
                      ? 'bg-white border-slate-200 text-slate-800'
                      : 'bg-slate-900/60 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`p-2 rounded-lg ${
                          isLightMode ? 'bg-amber-50 text-amber-700' : 'bg-amber-950/60 text-amber-400'
                        }`}
                      >
                        <Save className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold">
                          {isEn ? 'NVRAM Save & Startup-Config Persistence' : 'ذخیره‌سازی دائمی پیکربندی در NVRAM (Startup-Config)'}
                        </h3>
                        <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {isEn
                            ? 'Command: copy running-config startup-config (write memory) • Action: cisco_config_write_memory'
                            : 'دستور: copy running-config startup-config (write memory) • سطح دسترسی: cisco_config_write_memory'}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono border ${
                        canSaveNvram
                          ? isLightMode
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                          : isLightMode
                          ? 'bg-amber-50 text-amber-700 border-amber-300'
                          : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                      }`}
                    >
                      {canSaveNvram ? (isEn ? 'AUTHORIZED' : 'مجاز') : (isEn ? 'RESTRICTED' : 'محدود')}
                    </span>
                  </div>

                  {/* Warning and Architecture Box */}
                  <div
                    className={`p-4 rounded-xl border mb-5 text-xs leading-relaxed ${
                      isLightMode
                        ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                        : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold mb-1">
                          {isEn ? 'Cisco IOS Memory Hierarchy Alert' : 'هشدار معماری حافظه سیسکو (RAM در برابر NVRAM)'}
                        </p>
                        <p className="opacity-90">
                          {isEn
                            ? 'Cisco Catalyst switches maintain two independent configuration states: volatile RAM (running-config) and non-volatile flash memory (startup-config). All changes pushed through any of the tabs (SSH, NTP, SNMP, Users, Syslog, STP, VTP, VLANs, L2 Security) are live in running-config. If the switch reboots or loses power before executing write memory, all changes will be permanently discarded.'
                            : 'سوئیچ‌های سیسکو دارای دو حافظه مجزا هستند: حافظه موقت RAM (شامل running-config) و حافظه دائمی فلش NVRAM (شامل startup-config). تمامی تغییرات ارسال‌شده از تمام تب‌ها فوراً روی running-config فعالند، اما در صورت ریست یا قطع برق قبل از اجرای write memory، تمام تغییرات پاک خواهند شد.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* NVRAM Commit Action Card */}
                  <div
                    className={`p-5 rounded-xl border ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-xs font-bold flex items-center gap-2">
                          <Terminal className="w-3.5 h-3.5 text-cyan-500" />
                          <span>{isEn ? 'Transactional Hardware Commit' : 'تراکنش ذخیره‌سازی روی حافظه سخت‌افزاری'}</span>
                        </h4>
                        <p className={`text-[11px] mt-1 font-mono ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                          # copy running-config startup-config (or &quot;write memory&quot;)
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={loadHardwareConfig}
                          disabled={loading || !device.is_online}
                          className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer border ${
                            loading || !device.is_online
                              ? 'opacity-50 cursor-not-allowed border-slate-700/50'
                              : isLightMode
                              ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-xs'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                          }`}
                          title={isEn ? 'Re-probe Switch State' : 'استعلام مجدد وضعیت سخت‌افزار'}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
                          <span className="hidden sm:inline">{isEn ? 'Re-probe' : 'استعلام مجدد'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleSaveToNvram}
                          disabled={isSavingNvram || !canSaveNvram || !device.is_online}
                          className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-sm ${
                            isSavingNvram || !canSaveNvram || !device.is_online
                              ? 'bg-slate-700/50 text-slate-400 cursor-not-allowed border border-slate-600/30'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:shadow-emerald-600/30'
                          }`}
                        >
                          {isSavingNvram ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>{isEn ? 'Building Configuration...' : 'در حال ذخیره‌سازی...'}</span>
                            </>
                          ) : (
                            <>
                              <Save className="w-3.5 h-3.5" />
                              <span>{isEn ? 'Commit to NVRAM' : 'ذخیره دائم در NVRAM'}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {nvramFeedback && (
                      <div
                        className={`mt-4 p-3 rounded-lg border text-xs flex items-center gap-2 animate-in fade-in duration-200 ${
                          nvramFeedback.success
                            ? isLightMode
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                            : isLightMode
                            ? 'bg-rose-50 border-rose-300 text-rose-800'
                            : 'bg-rose-950/60 border-rose-700/60 text-rose-300'
                        }`}
                      >
                        {nvramFeedback.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                        )}
                        <span className="font-mono">{nvramFeedback.message}</span>
                      </div>
                    )}
                  </div>

                  {/* Summary of 10 configuration domains with Quick-Jump */}
                  <div className="mt-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[11px] font-bold ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                        {isEn ? 'Configuration Domain Quick Jump' : 'دسترسی سریع به ماژول‌های ده‌گانه پیکربندی'}
                      </span>
                      <span className="text-[10px] text-cyan-500 font-mono">10 Modules Synced</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                      {[
                        { name: 'SSH & VTY', tab: 'vty' },
                        { name: 'NTP Clock', tab: 'ntp' },
                        { name: 'SNMP Suite', tab: 'snmp' },
                        { name: 'Users & AAA', tab: 'users' },
                        { name: 'Syslog', tab: 'syslog' },
                        { name: 'Spanning-Tree', tab: 'stp' },
                        { name: 'VTP Domain', tab: 'vtp' },
                        { name: 'VLANs & SVI', tab: 'vlans' },
                        { name: 'L2 Security', tab: 'l2_security' },
                        { name: 'NVRAM Save', tab: 'write_memory' },
                      ].map((item, idx) => {
                        const isCurrent = activeTab === item.tab;
                        return (
                          <button
                            key={item.tab}
                            type="button"
                            onClick={() => setActiveTab(item.tab as CiscoConfigTabId)}
                            className={`p-2.5 rounded-lg border text-center font-mono text-[11px] transition cursor-pointer ${
                              isCurrent
                                ? isLightMode
                                  ? 'bg-cyan-50 border-cyan-400 text-cyan-800 font-bold shadow-xs'
                                  : 'bg-cyan-950/60 border-cyan-500 text-cyan-300 font-bold shadow-xs'
                                : isLightMode
                                ? 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-700'
                                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                            }`}
                          >
                            <span className="block font-bold opacity-60 text-[9px] mb-0.5">#{idx + 1}</span>
                            <span>{item.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Bottom Status Bar (Strict Universal Footer Clearance Above System Footer) */}
        <div
          className={`px-4 sm:px-6 py-2.5 border-t flex items-center justify-between text-xs shrink-0 ${
            isLightMode ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-slate-900/90 border-slate-800 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[11px]">
              {isEn ? `Cisco Config Suite v1.391.0 • ${device.name || device.ip}` : `سوئیت کانفیگ سیسکو نسخه 1.391.0 • ${device.name || device.ip}`}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleInternalMinimize}
              className="text-xs hover:text-cyan-400 transition cursor-pointer flex items-center gap-1"
            >
              <Minus className="w-3 h-3" />
              <span>{isEn ? 'Minimize' : 'مینیمایز'}</span>
            </button>
            <span className="opacity-30">|</span>
            <button
              type="button"
              onClick={onClose}
              className="text-xs hover:text-rose-400 transition cursor-pointer"
            >
              {isEn ? 'Close' : 'بستن'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
