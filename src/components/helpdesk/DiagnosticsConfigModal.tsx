import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Stethoscope,
  Network,
  HardDrive,
  Cpu,
  CheckSquare,
  Square,
  Play,
  Loader2,
  Globe,
  Activity,
  Gauge,
  Route,
  Waypoints,
  Wifi,
  KeyRound,
  Trash2,
  FileCheck2,
  Download,
  CircuitBoard,
  Layers,
} from 'lucide-react';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { ALL_HELPDESK_DIAGNOSTIC_CHECKS, HelpdeskDiagnosticCheckId } from '../../services/api';

export interface DiagnosticCheckCatalogItem {
  id: HelpdeskDiagnosticCheckId;
  category: 'network' | 'system_storage' | 'hardware_perf';
  titleEn: string;
  titleFa: string;
  descEn: string;
  descFa: string;
  whatEn: string;
  whatFa: string;
  whyEn: string;
  whyFa: string;
  exampleEn: string;
  exampleFa: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const DIAGNOSTIC_CHECK_CATALOG: DiagnosticCheckCatalogItem[] = [
  {
    id: 'ip_dns',
    category: 'network',
    titleEn: 'IP Address, DHCP/Static & Live DNS',
    titleFa: 'آدرس IP سیستم، حالت DHCP یا دستی و DNS',
    descEn: 'Verifies active IPv4, DHCP vs Static mode, DNS servers, and live name resolution.',
    descFa: 'بررسی آدرس IP فعال، نوع دریافت (DHCP یا Manual)، سرورهای DNS و تست Resolve.',
    whatEn: 'Reads active IPv4 configuration, assignment method (DHCP vs Static), configured DNS servers, and runs a live DNS query.',
    whatFa: 'آدرس IPv4، نحوه تخصیص (اتوماتیک DHCP یا دستی Manual)، سرورهای DNS و صحت پاسخ‌دهی DNS را بررسی می‌کند.',
    whyEn: 'Instant detection of APIPA (169.254.x.x), missing gateway/DNS, or stalled DNS resolution.',
    whyFa: 'تشخیص سریع IP نامعتبر APIPA، نبود DNS یا از کار افتادن ترجمه دامنه‌ها روی سیستم کاربر.',
    exampleEn: '192.168.10.45 (DHCP) · DNS 192.168.10.10 · Resolved OK',
    exampleFa: '192.168.10.45 (DHCP) · DNS 192.168.10.10 · پاسخ موفق',
    icon: Network,
  },
  {
    id: 'gateway_ping',
    category: 'network',
    titleEn: 'Default Gateway Reachability (Ping)',
    titleFa: 'تست پینگ تا Default Gateway',
    descEn: 'Sends ICMP probes to configured gateway(s) and measures latency & packet loss.',
    descFa: 'ارسال بسته ICMP به گیت‌وی پیش‌فرض شبکه و اندازه‌گیری تأخیر (ms) و پکت‌لاس.',
    whatEn: 'Pings each active default gateway from inside the workstation.',
    whatFa: 'از داخل سیستم کاربر به آدرس Gateway شبکه پینگ می‌گیرد.',
    whyEn: 'Separates local LAN/switch issues from upstream WAN or DNS failures.',
    whyFa: 'تفکیک سریع قطعی کابل/سوئیچ محلی از مشکلات اینترنت یا روتر بالادست.',
    exampleEn: '192.168.10.1 → 0% loss · avg 1.2 ms',
    exampleFa: '192.168.10.1 → بدون افت بسته · میانگین 1.2 میلی‌ثانیه',
    icon: Activity,
  },
  {
    id: 'nic_link_speed',
    category: 'network',
    titleEn: 'Network Adapter Link Speed & State',
    titleFa: 'سرعت لینک بالا آمدن کارت شبکه (Link Speed)',
    descEn: 'Inspects negotiated link speed (1 Gbps vs 100/10 Mbps) & adapter up/down status.',
    descFa: 'بررسی سرعت اتصال کارت شبکه (1 Gbps در برابر 100/10 Mbps) و وضعیت لینک.',
    whatEn: 'Queries physical and virtual network interfaces for current operational status and negotiated speed.',
    whatFa: 'سرعت واقعی Negotiate شده کارت شبکه با سوئیچ یا اکسس‌پوینت را می‌خواند.',
    whyEn: 'Catches damaged Cat5e/Cat6 cables or bad switch ports stuck at 100 Mbps or 10 Mbps.',
    whyFa: 'کشف فوری خرابی کابل شبکه یا سوکت سوئیچ زمانی که لینک به جای 1 Gbps روی 100 Mbps می‌افتد.',
    exampleEn: 'Ethernet: Up @ 1 Gbps · Wi-Fi: 866 Mbps',
    exampleFa: 'Ethernet: متصل با سرعت 1 Gbps',
    icon: Gauge,
  },
  {
    id: 'routing_table',
    category: 'network',
    titleEn: 'IPv4 Routing Table & Default Routes',
    titleFa: 'جدول روت‌ها (Routing Table) سیستم',
    descEn: 'Checks default 0.0.0.0/0 gateways, route metrics, persistent routes, and conflicts.',
    descFa: 'بررسی روت‌های فعال سیستم، روت پیش‌فرض 0.0.0.0، متریک‌ها و تداخل گیت‌وی.',
    whatEn: 'Collects active and persistent IPv4 routes from the endpoint OS routing table.',
    whatFa: 'مسیرهای مسیریابی IPv4 فعال و ماندگار (-p) روی سیستم را استخراج می‌کند.',
    whyEn: 'Detects dual-NIC gateway conflicts (LAN + Wi-Fi + VPN) or missing subnet routes.',
    whyFa: 'شناسایی تداخل چند روت پیش‌فرض هم‌زمان یا نبود روت به سرورهای داخلی سازمان.',
    exampleEn: '0.0.0.0/0 → 192.168.10.1 (Metric 25)',
    exampleFa: '0.0.0.0/0 → 192.168.10.1 (متریک 25)',
    icon: Route,
  },
  {
    id: 'proxy_status',
    category: 'network',
    titleEn: 'Proxy Server State (WinINet & WinHTTP)',
    titleFa: 'وضعیت فعال یا غیرفعال بودن Proxy Server',
    descEn: 'Inspects user browser proxy, PAC script URL, bypass rules, and WinHTTP proxy.',
    descFa: 'بررسی پروکسی دستی کاربر، لینک PAC و پروکسی سرویس‌های ویندوز (WinHTTP).',
    whatEn: 'Reads Internet Settings proxy flags for the logged-in user and system WinHTTP configuration.',
    whatFa: 'تنظیمات Proxy مرورگر کاربر و سرویس‌های پس‌زمینه ویندوز را بررسی می‌کند.',
    whyEn: 'Stale or misconfigured proxies are a top cause of browser, Teams, and Windows Update failures.',
    whyFa: 'پروکسی‌های مانده از VPN یا تنظیمات قدیمی عامل رایج باز نشدن سایت‌ها و نرم‌افزارهاست.',
    exampleEn: 'Direct Connection (No Proxy) or 192.168.10.5:8080',
    exampleFa: 'اتصال مستقیم (بدون پروکسی) یا آدرس پروکسی فعال',
    icon: Waypoints,
  },
  {
    id: 'internet_connectivity',
    category: 'network',
    titleEn: 'Internet Connectivity & NCSI Status',
    titleFa: 'وضعیت واقعی ارتباط با اینترنت',
    descEn: 'Tests Windows NCSI connectivity profile, external TCP/443 HTTPS reachability, and ICMP.',
    descFa: 'تست ارتباط واقعی اینترنت (TCP پورت 443، پینگ خارجی و وضعیت NCSI ویندوز).',
    whatEn: 'Checks Windows NCSI internet status, external TCP port 443 handshake, and ICMP reachability.',
    whatFa: 'هم وضعیت آیکون شبکه ویندوز (NCSI) و هم تست عملی اتصال HTTPS و ICMP را انجام می‌دهد.',
    whyEn: 'Determines immediately whether the user has real external internet or only local LAN access.',
    whyFa: 'مشخص می‌کند آیا سیستم واقعاً به اینترنت راه دارد یا فقط دسترسی به شبکه داخلی برقرار است.',
    exampleEn: 'TCP/443 Connected (1.1.1.1) · NCSI: Internet',
    exampleFa: 'پورت ۴۴۳ اینترنت متصل · NCSI: Internet',
    icon: Globe,
  },
  {
    id: 'vpn_status',
    category: 'network',
    titleEn: 'VPN Connection Status',
    titleFa: 'وضعیت VPN (آیا VPN متصل است یا خیر)',
    descEn: 'Detects active Windows RAS VPN profiles and 3rd-party VPN tunnels/adapters.',
    descFa: 'بررسی کانکشن‌های VPN ویندوز و آداپترها/کلاینت‌های VPN (مثل AnyConnect/Forti/OpenVPN).',
    whatEn: 'Inspects Windows Get-VpnConnection profiles, virtual tunnel NICs, and running VPN clients.',
    whatFa: 'پروفایل‌های VPN ویندوز، کارت‌های شبکه تانل و سرویس‌های کلاینت VPN را چک می‌کند.',
    whyEn: 'Reveals if a disconnected VPN is needed for ERP access or if an active VPN blocks local routes.',
    whyFa: 'بررسی سریع وصل بودن یا نبودن VPN یا تداخل تانل VPN با اینترنت و شبکه داخلی.',
    exampleEn: 'Corp-IKEv2: Connected · or No Active VPN',
    exampleFa: 'متصل به VPN سازمانی یا عدم وجود تانل فعال',
    icon: KeyRound,
  },
  {
    id: 'os_drive_cleanup',
    category: 'system_storage',
    titleEn: 'OS Drive Space, Temp & Recycle Bin',
    titleFa: 'ظرفیت درایو ویندوز، فایل‌های Temp و Recycle Bin',
    descEn: 'Checks C: drive free space, Windows/User Temp, WU cache, and Recycle Bin size.',
    descFa: 'بررسی فضای پر و آزاد درایو ویندوز، حجم پوشه‌های Temp، کش آپدیت و سطل زباله (Recycle Bin).',
    whatEn: 'Measures OS drive capacity/free % plus reclaimable Temp files, WU downloads, and Recycle Bin items.',
    whatFa: 'ظرفیت آزاد درایو C، حجم فایل‌های موقت Temp و حجم و تعداد فایل‌های داخل Recycle Bin را محاسبه می‌کند.',
    whyEn: 'Full C: drives cause Windows crashes, Outlook OST errors, and failed updates.',
    whyFa: 'پر شدن درایو ویندوز باعث کندی شدید، خطای Outlook و شکست آپدیت‌ها می‌شود.',
    exampleEn: 'C: 68.4 GB Free (28%) · Temp: 1.4 GB · Recycle Bin: 820 MB',
    exampleFa: 'درایو C: ۶۸ گیگ آزاد (۲۸٪) · Recycle Bin: 820 MB',
    icon: Trash2,
  },
  {
    id: 'windows_integrity',
    category: 'system_storage',
    titleEn: 'Windows System File Corruption Check',
    titleFa: 'بررسی خرابی فایل‌های سیستمی ویندوز',
    descEn: 'Runs fast DISM /CheckHealth, CBS corruption scan, dirty volume bit & reboot flags.',
    descFa: 'بررسی سریع سلامت ایمیج ویندوز (DISM CheckHealth)، لاگ خرابی CBS و فلگ Dirty Disk.',
    whatEn: 'Checks DISM component store health state, CBS corruption indicators, and NTFS dirty bits.',
    whatFa: 'سلامت هسته ویندوز و مخزن CBS را بدون قفل کردن طولانی سیستم بررسی می‌کند.',
    whyEn: 'Finds OS corruption fast and links straight to DISM /RestoreHealth & SFC /scannow.',
    whyFa: 'تشخیص سریع خرابی فایل‌های سیستمی و هدایت مستقیم به بخش تعمیر SFC / DISM.',
    exampleEn: 'DISM CheckHealth: Healthy · 0 CBS corruption errors',
    exampleFa: 'سلامت ایمیج ویندوز: سالم · ۰ خطای خرابی',
    icon: FileCheck2,
  },
  {
    id: 'windows_update_last',
    category: 'system_storage',
    titleEn: 'Last Windows Update Date & WSUS Policy',
    titleFa: 'تاریخ آخرین آپدیت نصب‌شده ویندوز',
    descEn: 'Finds the most recent installed KB HotFix date, age in days, WSUS vs Internet & pending reboot.',
    descFa: 'نمایش آخرین KB و تاریخ نصب آن، فاصله زمانی تا امروز، وضعیت WSUS و نیاز به ری‌استارت.',
    whatEn: 'Reads Win32_QuickFixEngineering HotFix history, WU install timestamps, and WSUS GPO policy.',
    whatFa: 'تاریخچه آپدیت‌های نصب‌شده ویندوز، آخرین KB و منبع آپدیت (WSUS یا اینترنت) را می‌خواند.',
    whyEn: 'Quickly identifies unpatched endpoints or stuck pending-reboot updates.',
    whyFa: 'تشخیص سریع سیستم‌های آپدیت‌نشده یا آپدیت‌های معلق نیازمند ری‌استارت.',
    exampleEn: 'KB5044285 installed 2026-11-12 (12 days ago)',
    exampleFa: 'آخرین آپدیت: KB5044285 در تاریخ 2026-11-12 (۱۲ روز پیش)',
    icon: Download,
  },
  {
    id: 'drivers_status',
    category: 'hardware_perf',
    titleEn: 'Hardware & Device Driver Health',
    titleFa: 'وضعیت نصب و سلامت درایورها',
    descEn: 'Scans all Plug-and-Play devices for missing, disabled, or error-code drivers.',
    descFa: 'اسکن کامل Device Manager برای یافتن درایورهای نصب‌نشده یا دارای علامت خطا.',
    whatEn: 'Checks every Win32_PnPEntity device for non-zero ConfigManagerErrorCode (Code 10, 28, 43, etc.).',
    whatFa: 'تمام قطعات سخت‌افزاری سیستم را از نظر کد خطای درایور (مانند Code 10 / 28 / 43) بررسی می‌کند.',
    whyEn: 'Spots missing chipset, audio, USB, camera, or network drivers in seconds.',
    whyFa: 'کشف فوری درایورهای ناقص کارت صدا، گرافیک، شبکه یا تجهیزات جانبی.',
    exampleEn: '184 PnP Devices · 0 Driver Errors',
    exampleFa: '۱۸۴ دستگاه شناسایی شد · ۰ خطای درایور',
    icon: CircuitBoard,
  },
  {
    id: 'cpu_ram_usage',
    category: 'hardware_perf',
    titleEn: 'CPU & RAM Utilization',
    titleFa: 'میزان مصرف CPU و RAM',
    descEn: 'Measures live processor load %, cores/threads, and used/total/free memory.',
    descFa: 'نمایش دقیق درصد مصرف لحظه‌ای پردازنده و میزان حافظه RAM اشغال‌شده و آزاد.',
    whatEn: 'Samples current CPU utilization and physical RAM allocation.',
    whatFa: 'بار پردازشی فعلی CPU و ظرفیت مصرف‌شده/آزاد حافظه رم را اندازه‌گیری می‌کند.',
    whyEn: 'Confirms immediately if user slowness is caused by hardware resource exhaustion.',
    whyFa: 'تشخیص فوری اینکه کندی سیستم ناشی از پر شدن RAM یا بالا رفتن CPU است یا خیر.',
    exampleEn: 'CPU: 18% · RAM: 9.4 / 16.0 GB (58.7%)',
    exampleFa: 'CPU: 18% · RAM: 9.4 از 16 گیگابایت',
    icon: Cpu,
  },
  {
    id: 'top_resource_apps',
    category: 'hardware_perf',
    titleEn: 'Top Resource-Consuming Applications',
    titleFa: 'نرم‌افزارهای با بیشترین مصرف منابع',
    descEn: 'Lists the highest CPU and RAM consuming processes to pinpoint slowness culprits.',
    descFa: 'فهرست برنامه‌ها و پروسس‌هایی که بیشترین CPU یا RAM سیستم را اشغال کرده‌اند.',
    whatEn: 'Measures live CPU delta and working-set RAM per running process and ranks top consumers.',
    whatFa: 'پروسس‌های فعال را بر اساس بالاترین مصرف RAM و CPU رتبه‌بندی و نمایش می‌دهد.',
    whyEn: 'Identifies runaway browser tabs, Teams/Chrome leaks, or hung background updaters.',
    whyFa: 'شناسایی فوری برنامه‌های پرمصرف یا هنگ‌کرده جهت بستن از تب سلامت سیستم.',
    exampleEn: 'chrome.exe (2.8 GB RAM) · teams.exe (22% CPU)',
    exampleFa: 'chrome.exe (2.8 GB RAM) · teams.exe (22% CPU)',
    icon: Layers,
  },
];

interface DiagnosticsConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  isLightMode: boolean;
  isEn: boolean;
  targetIp: string;
  selectedChecks: HelpdeskDiagnosticCheckId[];
  onChangeSelectedChecks: (checks: HelpdeskDiagnosticCheckId[]) => void;
  onStartRun: (checks: HelpdeskDiagnosticCheckId[]) => void;
  running: boolean;
}

export const DiagnosticsConfigModal: React.FC<DiagnosticsConfigModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  isLightMode,
  isEn,
  targetIp,
  selectedChecks,
  onChangeSelectedChecks,
  onStartRun,
  running,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const selectedSet = new Set(selectedChecks);
  const totalCount = DIAGNOSTIC_CHECK_CATALOG.length;

  const surfaceBg = isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800';
  const textPrimary = isLightMode ? 'text-slate-900' : 'text-slate-100';
  const textMuted = isLightMode ? 'text-slate-600' : 'text-slate-400';

  const toggleCheck = (id: HelpdeskDiagnosticCheckId) => {
    if (selectedSet.has(id)) {
      onChangeSelectedChecks(selectedChecks.filter((c) => c !== id));
    } else {
      const next = new Set(selectedChecks);
      next.add(id);
      onChangeSelectedChecks(ALL_HELPDESK_DIAGNOSTIC_CHECKS.filter((c) => next.has(c)));
    }
  };

  const toggleCategory = (cat: 'network' | 'system_storage' | 'hardware_perf') => {
    const catIds = DIAGNOSTIC_CHECK_CATALOG.filter((i) => i.category === cat).map((i) => i.id);
    const allChecked = catIds.every((id) => selectedSet.has(id));
    const next = new Set(selectedChecks);
    for (const id of catIds) {
      if (allChecked) next.delete(id);
      else next.add(id);
    }
    onChangeSelectedChecks(ALL_HELPDESK_DIAGNOSTIC_CHECKS.filter((c) => next.has(c)));
  };

  const categories: Array<{
    id: 'network' | 'system_storage' | 'hardware_perf';
    titleEn: string;
    titleFa: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
  }> = [
    {
      id: 'network',
      titleEn: 'Network, Routing, Proxy, Internet & VPN',
      titleFa: 'شبکه، روتینگ، پروکسی، اینترنت و VPN',
      icon: Wifi,
      accent: 'text-sky-500',
    },
    {
      id: 'system_storage',
      titleEn: 'Storage, Recycle Bin, Windows Integrity & Updates',
      titleFa: 'فضای دیسک، سطل زباله، سلامت ویندوز و آپدیت‌ها',
      icon: HardDrive,
      accent: 'text-amber-500',
    },
    {
      id: 'hardware_perf',
      titleEn: 'Drivers, CPU/RAM & Top Resource Apps',
      titleFa: 'درایورها، CPU/RAM و برنامه‌های پرمصرف',
      icon: Cpu,
      accent: 'text-indigo-500',
    },
  ];

  const handleLaunch = () => {
    if (selectedChecks.length === 0 || running) return;
    onStartRun(selectedChecks);
  };

  const modalContent = (
    <div
      dir={isEn ? 'ltr' : 'rtl'}
      className={`fixed top-0 left-0 right-0 bottom-8 z-[9999] flex flex-col items-center justify-center transition-all duration-200 ${
        isMaximized ? 'p-0' : 'p-3 sm:p-6 bg-black/75 backdrop-blur-sm'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex flex-col overflow-hidden transition-all duration-200 ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-5xl max-h-[88vh] rounded-2xl border shadow-2xl'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-900'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between gap-3 px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`p-2 rounded-xl border shrink-0 ${
                isLightMode
                  ? 'bg-sky-50 border-sky-200 text-sky-600'
                  : 'bg-sky-500/15 border-sky-500/30 text-sky-400'
              }`}
            >
              <Stethoscope className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className={`text-sm font-bold truncate ${textPrimary}`}>
                  {isEn
                    ? 'Select Endpoint Diagnostic Checks'
                    : 'انتخاب موارد بررسی و عیب‌یابی سیستم کاربر (Diagnostics)'}
                </h3>
                <FieldInfoTooltip
                  title={isEn ? 'Endpoint Troubleshooting Suite' : 'پکیج عیب‌یابی هوشمند سیستم'}
                  whatIsIt={
                    isEn
                      ? 'Lets you choose which live health, network, storage, update, driver, and resource checks run on the endpoint right now.'
                      : 'امکان انتخاب دقیق بررسی‌های شبکه، اینترنت، پروکسی، VPN، دیسک/سطل زباله، سلامت فایل‌های ویندوز، آپدیت‌ها، درایورها و پروسس‌های پرمصرف را فراهم می‌کند.'
                  }
                  whyNeeded={
                    isEn
                      ? 'All checks are enabled by default for complete troubleshooting, or uncheck unnecessary modules for faster targeted diagnosis.'
                      : 'به‌صورت پیش‌فرض همه ۱۳ مورد تیک خورده‌اند تا عیب‌یابی کامل انجام شود؛ در صورت نیاز می‌توانید تیک برخی موارد را کم یا زیاد کنید تا گزارش سریع‌تر و متمرکزتر بگیرید.'
                  }
                  example={
                    isEn
                      ? 'Select all 13 checks for full audit, or pick only Network/Proxy/VPN for internet tickets'
                      : 'انتخاب هر ۱۳ مورد برای چکاپ کامل، یا انتخاب صرفاً شبکه/پروکسی/VPN برای تیکت قطعی اینترنت'
                  }
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>
              <p className={`text-[11px] truncate ${textMuted}`}>
                {isEn
                  ? `Target Endpoint: ${targetIp || 'Not specified'} · ${selectedChecks.length} of ${totalCount} checks selected`
                  : `سیستم مقصد: ${targetIp || 'نامشخص'} · ${selectedChecks.length} از ${totalCount} مورد انتخاب شده`}
              </p>
            </div>
          </div>

          <ModalHeaderControls
            onClose={onClose}
            onMinimize={onMinimize}
            onMaximizeToggle={() => setIsMaximized((v) => !v)}
            isMaximized={isMaximized}
            isLightMode={isLightMode}
            isEn={isEn}
          />
        </div>

        {/* Selection Toolbar */}
        <div
          className={`px-5 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 ${
            isLightMode ? 'bg-slate-100/80 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <span className={textMuted}>
            {isEn
              ? 'All troubleshooting checks are selected by default. Uncheck any items you want to skip during this run.'
              : 'همه موارد به‌صورت پیش‌فرض تیک خورده‌اند. در صورت تمایل تیک گزینه‌هایی را که الان نیاز ندارید بردارید.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChangeSelectedChecks([...ALL_HELPDESK_DIAGNOSTIC_CHECKS])}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
                  : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5 text-sky-500" />
              <span>{isEn ? 'Select All' : 'انتخاب همه'}</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeSelectedChecks([])}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Square className="w-3.5 h-3.5" />
              <span>{isEn ? 'Clear All' : 'لغو انتخاب همه'}</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {categories.map((cat) => {
            const CatIcon = cat.icon;
            const items = DIAGNOSTIC_CHECK_CATALOG.filter((i) => i.category === cat.id);
            const checkedInCat = items.filter((i) => selectedSet.has(i.id)).length;
            const allInCat = checkedInCat === items.length;
            return (
              <div key={cat.id} className={`rounded-xl border p-4 space-y-3 ${surfaceBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/70 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <CatIcon className={`w-4 h-4 ${cat.accent}`} />
                    <h4 className={`text-xs font-bold ${textPrimary}`}>
                      {isEn ? cat.titleEn : cat.titleFa}
                    </h4>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold ${
                        isLightMode
                          ? 'bg-slate-100 text-slate-700 border border-slate-200'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {checkedInCat}/{items.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    className={`text-[11px] font-semibold cursor-pointer ${
                      isLightMode ? 'text-sky-700 hover:text-sky-800' : 'text-sky-400 hover:text-sky-300'
                    }`}
                  >
                    {allInCat
                      ? isEn
                        ? 'Uncheck Group'
                        : 'برداشتن تیک گروه'
                      : isEn
                      ? 'Check All in Group'
                      : 'انتخاب کل گروه'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {items.map((item) => {
                    const checked = selectedSet.has(item.id);
                    const ItemIcon = item.icon;
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleCheck(item.id)}
                        role="checkbox"
                        aria-checked={checked}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            toggleCheck(item.id);
                          }
                        }}
                        className={`flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer select-none ${
                          checked
                            ? isLightMode
                              ? 'bg-sky-50/70 border-sky-300 text-slate-900'
                              : 'bg-sky-500/10 border-sky-500/40 text-slate-100'
                            : isLightMode
                            ? 'bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-slate-100'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-900'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCheck(item.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 rounded border-slate-400 text-sky-600 focus:ring-sky-500 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <ItemIcon
                                className={`w-3.5 h-3.5 shrink-0 ${checked ? 'text-sky-500' : textMuted}`}
                              />
                              <span className={`text-xs font-bold truncate ${checked ? textPrimary : textMuted}`}>
                                {isEn ? item.titleEn : item.titleFa}
                              </span>
                            </div>
                            <span onClick={(e) => e.stopPropagation()}>
                              <FieldInfoTooltip
                                title={isEn ? item.titleEn : item.titleFa}
                                whatIsIt={isEn ? item.whatEn : item.whatFa}
                                whyNeeded={isEn ? item.whyEn : item.whyFa}
                                example={isEn ? item.exampleEn : item.exampleFa}
                                isLightMode={isLightMode}
                                isEn={isEn}
                              />
                            </span>
                          </div>
                          <p className={`text-[11px] leading-relaxed ${textMuted}`}>
                            {isEn ? item.descEn : item.descFa}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className={`text-xs font-medium ${textMuted}`}>
            {selectedChecks.length === 0 ? (
              <span className="text-rose-500 font-semibold">
                {isEn ? 'Select at least 1 check to start.' : 'حداقل ۱ مورد را برای شروع عیب‌یابی انتخاب کنید.'}
              </span>
            ) : isEn ? (
              `${selectedChecks.length} check(s) ready to run on ${targetIp || 'endpoint'}`
            ) : (
              `${selectedChecks.length} مورد آماده بررسی زنده روی سیستم ${targetIp || 'مقصد'}`
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>
            <button
              type="button"
              disabled={selectedChecks.length === 0 || running}
              onClick={handleLaunch}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm cursor-pointer"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span>
                {running
                  ? isEn
                    ? 'Running Diagnostics...'
                    : 'در حال اجرا...'
                  : isEn
                  ? `Run Diagnostics (${selectedChecks.length})`
                  : `شروع عیب‌یابی (${selectedChecks.length} مورد)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
