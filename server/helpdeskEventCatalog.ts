/**
 * Bilingual Human-Readable Event Viewer Diagnostics Knowledge Base
 * Translates raw Windows Event IDs (System / Application) and Linux journald errors
 * into crystal-clear, plain-language explanations, likely root causes, and concrete HelpDesk actions.
 */

export type HelpdeskEventCategory =
  | 'power_crash'
  | 'hardware_disk'
  | 'network_dns'
  | 'group_policy'
  | 'service_os'
  | 'application'
  | 'security_auth'
  | 'printer'
  | 'resource_memory'
  | 'update_time'
  | 'general';

export interface HumanEventExplanation {
  category: HelpdeskEventCategory;
  categoryLabelEn: string;
  categoryLabelFa: string;
  humanTitleEn: string;
  humanTitleFa: string;
  humanReasonEn: string;
  humanReasonFa: string;
  likelyCauseEn: string;
  likelyCauseFa: string;
  recommendedActionEn: string;
  recommendedActionFa: string;
  isKnownCode: boolean;
}

interface CatalogRule {
  eventIds: number[];
  sourcePattern?: RegExp;
  category: HelpdeskEventCategory;
  humanTitleEn: string;
  humanTitleFa: string;
  humanReasonEn: string;
  humanReasonFa: string;
  likelyCauseEn: string;
  likelyCauseFa: string;
  recommendedActionEn: string;
  recommendedActionFa: string;
}

const CATEGORY_LABELS: Record<HelpdeskEventCategory, { en: string; fa: string }> = {
  power_crash: { en: 'Power / Crash / BSOD', fa: 'برق، خاموشی ناگهانی و صفحه آبی' },
  hardware_disk: { en: 'Disk / Hardware', fa: 'هارد، دیسک و سخت‌افزار' },
  network_dns: { en: 'Network / DNS / DHCP', fa: 'شبکه، DNS و DHCP' },
  group_policy: { en: 'Group Policy / AD', fa: 'گروپ پالیسی و دامین' },
  service_os: { en: 'Windows Service / OS', fa: 'سرویس‌های ویندوز و سیستم‌عامل' },
  application: { en: 'Application Crash / Hang', fa: 'کرش یا هنگ نرم‌افزار' },
  security_auth: { en: 'Security / Authentication', fa: 'امنیت و احراز هویت' },
  printer: { en: 'Printer / Spooler', fa: 'پرینتر و صف چاپ' },
  resource_memory: { en: 'RAM / Resource Exhaustion', fa: 'کمبود رم و منابع سیستم' },
  update_time: { en: 'Windows Update / Time', fa: 'آپدیت ویندوز و همگام‌سازی ساعت' },
  general: { en: 'System / General', fa: 'رویداد سیستمی' },
};

const WINDOWS_EVENT_CATALOG: CatalogRule[] = [
  // ---- Power, BSOD & Unexpected Shutdown ----
  {
    eventIds: [41],
    sourcePattern: /kernel-power/i,
    category: 'power_crash',
    humanTitleEn: 'Unexpected Power Loss or System Crash (Kernel-Power 41)',
    humanTitleFa: 'خاموشی ناگهانی سیستم یا قطع برق بدون Shutdown استاندارد',
    humanReasonEn: 'Windows rebooted without shutting down cleanly first. The system either lost electrical power, froze completely, or suffered a Blue Screen (BSOD).',
    humanReasonFa: 'سیستم بدون انجام خاموشی استاندارد مجدداً راه‌اندازی شده است؛ این اتفاق معمولاً به دلیل قطع ناگهانی برق، فشار دادن دکمه پاور هنگام هنگ کردن سیستم، یا وقوع صفحه آبی (BSOD) رخ می‌دهد.',
    likelyCauseEn: 'Power outage / faulty PSU or laptop battery, overheating, RAM/driver crash, or forced power button hold.',
    likelyCauseFa: 'قطع برق یا خرابی پاور/باتری، داغ شدن بیش از حد CPU، مشکل رم یا درایور سخت‌افزاری، یا نگه داشتن دکمه پاور توسط کاربر.',
    recommendedActionEn: 'Check if a BugCheck (Event ID 1001) occurred right before this event. Verify power cable/UPS/battery health and check CPU temperatures.',
    recommendedActionFa: 'بررسی کنید آیا بلافاصله قبل از این رویداد خطای صفحه آبی (کد 1001) ثبت شده یا خیر؛ سلامت کابل برق/UPS/باتری و دمای سیستم را چک کنید.',
  },
  {
    eventIds: [6008],
    sourcePattern: /eventlog/i,
    category: 'power_crash',
    humanTitleEn: 'Previous System Shutdown Was Unexpected',
    humanTitleFa: 'خاموش شدن غیرعادی و غیرمنتظره سیستم در نوبت قبل',
    humanReasonEn: 'Windows detected on startup that the previous session ended abruptly rather than through a normal Shut Down or Restart.',
    humanReasonFa: 'ویندوز هنگام بالا آمدن تشخیص داد که دفعه قبل به شکل ناگهانی خاموش شده و مراحل عادی Shutdown طی نشده است.',
    likelyCauseEn: 'Sudden power cut, forced reset button press, or an unrecovered system freeze.',
    likelyCauseFa: 'قطع ناگهانی برق، ریست سخت‌افزاری توسط کاربر یا قفل شدن کامل سیستم.',
    recommendedActionEn: 'Ask the user if the PC froze or lost power, and inspect preceding Error/Critical events within 5 minutes before this timestamp.',
    recommendedActionFa: 'از کاربر بپرسید آیا برق رفته یا سیستم هنگ کرده است؛ خطاهای ۵ دقیقه قبل از این زمان را برای یافتن علت اصلی بررسی کنید.',
  },
  {
    eventIds: [1001],
    sourcePattern: /bugcheck|wer-systemerrorreporting/i,
    category: 'power_crash',
    humanTitleEn: 'Blue Screen of Death (BSOD / Kernel BugCheck)',
    humanTitleFa: 'بروز خطای صفحه آبی ویندوز (BSOD / کرش هسته سیستم)',
    humanReasonEn: 'The Windows kernel encountered a fatal stop error and automatically restarted to protect data, writing a crash dump file.',
    humanReasonFa: 'هسته ویندوز با یک خطای بحرانی مواجه شد و برای جلوگیری از آسیب به داده‌ها، صفحه آبی نمایش داده و سیستم را ری‌استارت کرده است.',
    likelyCauseEn: 'Outdated or buggy hardware driver (GPU, Wi-Fi, Storage), failing RAM stick, or recent Windows Update conflict.',
    likelyCauseFa: 'خرابی یا ناسازگاری درایور سخت‌افزاری (کارت گرافیک، شبکه یا دیسک)، خرابی رم (RAM) یا تداخل آپدیت اخیر ویندوز.',
    recommendedActionEn: 'Note the Stop Code in the raw message (e.g. MEMORY_MANAGEMENT, DRIVER_IRQL), update drivers, and run Windows Memory Diagnostic if recurring.',
    recommendedActionFa: 'کد خطای داخل متن لاگ خام (مانند MEMORY_MANAGEMENT یا IRQL) را بررسی کرده، درایورها را آپدیت کنید و در صورت تکرار تست سلامت RAM بگیرید.',
  },
  {
    eventIds: [46, 49, 161, 162],
    sourcePattern: /volmgr/i,
    category: 'power_crash',
    humanTitleEn: 'Crash Dump Initialization / Writing Failed During BSOD (volmgr)',
    humanTitleFa: 'خطا در ایجاد یا ذخیره فایل Dump هنگام وقوع صفحه آبی (volmgr)',
    humanReasonEn: 'Windows attempted to save a memory crash dump during a Blue Screen (BSOD), but the volume manager (volmgr) failed to initialize or write the dump file.',
    humanReasonFa: 'هنگام وقوع صفحه آبی (BSOD)، ویندوز قصد ذخیره فایل حافظه (Crash Dump) را داشت اما سرویس volmgr نتوانست فایل را بنویسد؛ این خطا معمولاً نشان‌دهنده قطعی ناگهانی دیسک بوت (NVMe/SATA) یا پر بودن درایو C حین کرش است.',
    likelyCauseEn: 'NVMe/SSD controller dropout during crash, disabled/missing Pagefile on OS drive, full C: drive, or unstable storage driver.',
    likelyCauseFa: 'قطع ارتباط ناگهانی SSD/NVMe هنگام کرش، غیرفعال یا کم بودن Pagefile روی درایو C، پر بودن فضای درایو ویندوز یا باگ درایور کنترلر دیسک.',
    recommendedActionEn: 'Check C: drive free space, verify NVMe/SATA SSD health & firmware, and ensure System Managed Pagefile is enabled on C: so future minidumps are captured.',
    recommendedActionFa: 'فضای خالی درایو C و سلامت SSD/NVMe را بررسی کنید و مطمئن شوید Pagefile روی درایو C فعال است تا فایل‌های Minidump در کرش‌های بعدی ذخیره شوند.',
  },
  {
    eventIds: [1074],
    sourcePattern: /user32/i,
    category: 'power_crash',
    humanTitleEn: 'Planned System Shutdown or Restart Initiated (USER32 1074)',
    humanTitleFa: 'ثبت درخواست خاموشی یا ری‌استارت عادی سیستم (USER32 1074)',
    humanReasonEn: 'A user or OS service (such as Windows Update or an admin command) requested a planned restart or shutdown. Useful to distinguish intentional reboots from unexpected BSODs.',
    humanReasonFa: 'یک کاربر، سرویس سیستم (مثل Windows Update) یا دستور مدیریت، درخواست خاموشی یا ری‌استارت عادی را ثبت کرده است (برای تفکیک ری‌استارت عادی از کرش ناگهانی کاربردی است).',
    likelyCauseEn: 'User reboot, Windows Update restart schedule, or IT remote restart action.',
    likelyCauseFa: 'ری‌استارت توسط کاربر، نصب آپدیت ویندوز یا دستور ری‌استارت از راه دور.',
    recommendedActionEn: 'Compare this timestamp against Kernel-Power 41 / BugCheck 1001 events to confirm whether a reboot was clean or caused by a crash.',
    recommendedActionFa: 'زمان این رویداد را با رویدادهای Kernel-Power 41 و BugCheck 1001 مقایسه کنید تا مشخص شود ری‌استارت سیستم عادی بوده یا ناشی از صفحه آبی.',
  },

  // ---- Disk, Storage & Hardware ----
  {
    eventIds: [7],
    sourcePattern: /disk/i,
    category: 'hardware_disk',
    humanTitleEn: 'Physical Bad Sector / Bad Block Detected on Disk',
    humanTitleFa: 'شناسایی بدسکتور فیزیکی (Bad Block) روی هارد دیسک یا SSD',
    humanReasonEn: 'Windows tried to read or write a physical sector on the hard drive/SSD and the disk reported a hardware failure.',
    humanReasonFa: 'ویندوز هنگام خواندن یا نوشتن روی بخشی از هارد یا SSD با خطای سخت‌افزاری (بدسکتور) روبه‌رو شده است.',
    likelyCauseEn: 'Imminent hard drive or SSD hardware failure (physical media degradation).',
    likelyCauseFa: 'خرابی فیزیکی یا نزدیک شدن هارد دیسک / SSD به پایان عمر کاری.',
    recommendedActionEn: 'URGENT: Back up the user’s important files immediately, check disk SMART health, and schedule hardware disk replacement.',
    recommendedActionFa: 'فوری: همین الان از فایل‌های مهم کاربر نسخه پشتیبان بگیرید، سلامت SMART دیسک را بررسی کنید و هارد/SSD را تعویض نمایید.',
  },
  {
    eventIds: [9, 11, 129, 153],
    sourcePattern: /disk|storahci|stornvme|iaStor|nvme|atapi/i,
    category: 'hardware_disk',
    humanTitleEn: 'Storage Controller Timeout or Disk I/O Retry',
    humanTitleFa: 'تأخیر شدید یا خطای ارتباطی با هارد دیسک / کنترلر دیسک',
    humanReasonEn: 'The hard drive or SSD failed to respond in time to a read/write command, forcing Windows to reset the storage bus or retry the operation (causing heavy freezes).',
    humanReasonFa: 'هارد یا SSD به موقع به دستور خواندن/نوشتن پاسخ نداده و ویندوز مجبور به ریست کردن کنترلر یا تلاش مجدد شده است (عامل اصلی فریز و کندی شدید سیستم).',
    likelyCauseEn: 'Loose or damaged SATA cable, failing SSD/HDD controller, outdated chipset/NVMe driver, or disk overload.',
    likelyCauseFa: 'شل بودن یا خرابی کابل SATA، ضعف یا خرابی کنترلر SSD/هارد، قدیمی بودن درایور چیپ‌ست/NVMe یا اشغال ۱۰۰٪ دیسک.',
    recommendedActionEn: 'Check Disk Usage in the Health & Safe Process Control tab, inspect SATA/power cables on desktops, update storage/chipset drivers, and prepare a backup if errors repeat.',
    recommendedActionFa: 'در تب «سلامت سیستم و کنترل پروسس‌ها» وضعیت دیسک را چک کنید، کابل SATA/برق کیس را بررسی کرده، درایور چیپ‌ست را بروزرسانی کنید و در صورت تکرار بکاپ بگیرید.',
  },
  {
    eventIds: [50, 51, 55, 137],
    sourcePattern: /ntfs|disk/i,
    category: 'hardware_disk',
    humanTitleEn: 'NTFS File System Corruption or Delayed Write Failure',
    humanTitleFa: 'خرابی ساختار فایل‌سیستم NTFS یا شکست نوشتن اطلاعات روی دیسک',
    humanReasonEn: 'Windows encountered structural corruption in the NTFS file system or lost data waiting to be written to the drive.',
    humanReasonFa: 'ویندوز در ساختار فایل‌سیستم NTFS خرابی تشخیص داده یا نتوانسته داده‌های در صف ذخیره را روی درایو بنویسد.',
    likelyCauseEn: 'Sudden power outage during write, unsafe USB/drive removal, or developing disk sectors issue.',
    likelyCauseFa: 'قطع ناگهانی برق حین ذخیره فایل، جدا کردن غیرایمن حافظه یا شروع خرابی سکتورهای دیسک.',
    recommendedActionEn: 'Schedule a disk check (chkdsk /f on next reboot) and verify the user’s disk free space and hardware health.',
    recommendedActionFa: 'اجرای اسکن و تعمیر دیسک (chkdsk) در ری‌استارت بعدی و بررسی فضای خالی و سلامت فیزیکی هارد توصیه می‌شود.',
  },
  {
    eventIds: [157],
    sourcePattern: /disk/i,
    category: 'hardware_disk',
    humanTitleEn: 'Disk Surprise Removal (Drive Disconnected Suddenly)',
    humanTitleFa: 'قطع ناگهانی ارتباط یک دیسک یا فلش مموری (Surprise Removal)',
    humanReasonEn: 'A storage drive (USB flash drive, external HDD, or internal disk) disappeared unexpectedly without being safely ejected.',
    humanReasonFa: 'یک درایو ذخیره‌سازی (فلش USB، هارد اکسترنال یا حتی هارد داخلی) بدون Eject کردن ایمن به‌طور ناگهانی از سیستم جدا شده است.',
    likelyCauseEn: 'User unplugged a USB drive directly, faulty USB port/cable, or loose internal SATA/NVMe connection.',
    likelyCauseFa: 'کشیدن مستقیم فلش توسط کاربر، خرابی پورت/کابل USB یا لقی اتصال هارد داخلی.',
    recommendedActionEn: 'If it refers to an external USB drive, remind user to eject safely; if it is an internal drive, inspect cables/motherboard slot.',
    recommendedActionFa: 'اگر مربوط به فلش/هارد اکسترنال است عادی است؛ اما اگر مربوط به هارد داخلی باشد، کابل و اسلات مادربرد باید بررسی شود.',
  },
  {
    eventIds: [17, 18, 19, 20, 47],
    sourcePattern: /whea-logger/i,
    category: 'hardware_disk',
    humanTitleEn: 'CPU / Memory / PCIe Hardware Error (WHEA-Logger)',
    humanTitleFa: 'خطای سخت‌افزاری پردازنده، رم یا مادربرد (WHEA Hardware Error)',
    humanReasonEn: 'The hardware itself (CPU cache, RAM ECC/bus, or PCIe device) reported a corrected or fatal hardware error to Windows.',
    humanReasonFa: 'سخت‌افزار سیستم (پردازنده، رم یا کارت‌های PCIe روی مادربرد) یک خطای فیزیکی سخت‌افزاری را مستقیماً به ویندوز گزارش کرده است.',
    likelyCauseEn: 'Overheating CPU, unstable BIOS/power delivery, defective RAM module, or failing motherboard/GPU.',
    likelyCauseFa: 'داغ شدن بیش از حد CPU، نوسان ولتاژ پاور یا BIOS، خرابی ماژول RAM یا نقص مادربرد/گرافیک.',
    recommendedActionEn: 'Check cooling fan/temperatures, update BIOS, and run hardware diagnostics on RAM and CPU.',
    recommendedActionFa: 'فن و دمای سیستم را بررسی کنید، BIOS را بروزرسانی کرده و تست سخت‌افزاری RAM و CPU بگیرید.',
  },

  // ---- Application Crashes & Hangs ----
  {
    eventIds: [1000],
    sourcePattern: /application error/i,
    category: 'application',
    humanTitleEn: 'Application Crashed Unexpectedly (Event 1000)',
    humanTitleFa: 'بسته شدن ناگهانی و کرش کردن یک نرم‌افزار (Application Error)',
    humanReasonEn: 'A user program terminated abruptly due to an unhandled software fault, corrupt DLL/add-in, or memory access violation.',
    humanReasonFa: 'یک نرم‌افزار روی سیستم کاربر به دلیل خطای داخلی برنامه، خرابی افزونه (Add-in) یا فایل DLL به‌طور ناگهانی بسته شده است.',
    likelyCauseEn: 'Corrupted app cache/profile, faulty Office/browser plugin, outdated app version, or missing Visual C++/.NET update.',
    likelyCauseFa: 'خرابی کش یا پروفایل برنامه، افزونه ناسازگار (مثلاً در Outlook/Excel/Chrome)، نسخه قدیمی نرم‌افزار یا کمبود فایل‌های Runtime.',
    recommendedActionEn: 'Check the faulting application name in the raw log; clean Temp/cache in Temp Cleanup & GPUpdate, disable faulty add-ins, or repair/update the app.',
    recommendedActionFa: 'نام برنامه کرش‌کرده را در لاگ خام ببینید؛ پوشه Temp/کش برنامه را در تب «پاک‌سازی Temp و GPUpdate» پاک کنید، افزونه‌های معیوب را غیرفعال یا برنامه را Repair کنید.',
  },
  {
    eventIds: [1002],
    sourcePattern: /application hang/i,
    category: 'application',
    humanTitleEn: 'Application Froze / Stopped Responding (Application Hang)',
    humanTitleFa: 'هنگ کردن و پاسخ ندادن نرم‌افزار (Not Responding)',
    humanReasonEn: 'An application stopped responding to Windows input and froze on the user’s screen until closed or recovered.',
    humanReasonFa: 'یک نرم‌افزار روی صفحه کاربر قفل کرده (Not Responding) و به کلیک‌ها یا دستورات ویندوز پاسخ نداده است.',
    likelyCauseEn: 'High CPU/RAM saturation, waiting on a slow network share/printer, or a buggy add-in inside Office/browser.',
    likelyCauseFa: 'پر شدن CPU یا RAM سیستم، منتظر ماندن برنامه برای پاسخ از یک پوشه شبکه/پرینتر کند، یا باگ افزونه.',
    recommendedActionEn: 'Check top resource-consuming processes in Health & Safe Process Control, end the frozen user app if still stuck, and verify network/printer latency.',
    recommendedActionFa: 'در تب «سلامت سیستم و کنترل پروسس‌ها» پروسس‌های پرمصرف را بررسی کنید، در صورت قفل ماندن برنامه آن را با دکمه End Task ببندید و سرعت شبکه/پرینتر را تست کنید.',
  },
  {
    eventIds: [1026],
    sourcePattern: /\.net runtime/i,
    category: 'application',
    humanTitleEn: '.NET Application Unhandled Exception Crash',
    humanTitleFa: 'خطای داخلی و کرش نرم‌افزار تحت فریم‌ورک .NET',
    humanReasonEn: 'A .NET-based software application threw an unhandled exception and terminated.',
    humanReasonFa: 'یک نرم‌افزار نوشته‌شده با دات‌نت (.NET) دچار خطای پیش‌بینی‌نشده شده و بسته شده است.',
    likelyCauseEn: 'Application bug, missing/corrupt .NET Runtime version, or broken database/network connection expected by the app.',
    likelyCauseFa: 'باگ نرم‌افزار، نسخه ناسازگار یا خراب .NET Runtime، یا قطع دسترسی برنامه به سرور/دیتابیس خودش.',
    recommendedActionEn: 'Check the exception details in the raw log, verify network access to the app server in Network & Safe Reset, or repair .NET Framework.',
    recommendedActionFa: 'متن خطا را در لاگ خام چک کنید، دسترسی شبکه به سرور آن نرم‌افزار را در تب «عیب‌یابی شبکه و ریست امن» تست کنید یا .NET Runtime را تعمیر نمایید.',
  },

  // ---- Windows Services ----
  {
    eventIds: [7000, 7001],
    sourcePattern: /service control manager/i,
    category: 'service_os',
    humanTitleEn: 'Windows Service Failed to Start (or Missing Dependency)',
    humanTitleFa: 'عدم موفقیت در راه‌اندازی یک سرویس ویندوز (Service Start Failure)',
    humanReasonEn: 'A background Windows service could not start, either due to invalid credentials, missing executable, or a parent dependency service being stopped.',
    humanReasonFa: 'یک سرویس پس‌زمینه ویندوز نتوانسته استارت شود؛ این خطا معمولاً به دلیل منقضی شدن رمز سرویس، نبود فایل اجرایی یا خاموش بودن سرویس پیش‌نیاز رخ می‌دهد.',
    likelyCauseEn: 'Changed service account password, blocked/quarantined executable by antivirus, or disabled dependent service.',
    likelyCauseFa: 'تغییر رمز اکانت سرویس، قرنطینه شدن فایل توسط آنتی‌ویروس، یا غیرفعال شدن سرویس وابسته.',
    recommendedActionEn: 'Check the service name and reason in the raw message; verify dependencies and antivirus quarantine if needed.',
    recommendedActionFa: 'نام سرویس و دلیل دقیق را در لاگ خام ببینید؛ وضعیت سرویس‌های وابسته و قرنطینه آنتی‌ویروس را بررسی کنید.',
  },
  {
    eventIds: [7009],
    sourcePattern: /service control manager/i,
    category: 'service_os',
    humanTitleEn: 'Windows Service Timed Out While Starting',
    humanTitleFa: 'تأخیر بیش از حد (Timeout) در بالا آمدن یک سرویس ویندوز',
    humanReasonEn: 'A Windows service failed to respond within the allowed startup timeout (usually 30 seconds).',
    humanReasonFa: 'یک سرویس ویندوز در زمان مجاز (معمولاً ۳۰ ثانیه) پاسخ نداد و استارت آن با Timeout متوقف شد.',
    likelyCauseEn: 'Heavy disk/CPU bottleneck during boot, slow network dependency, or hung service binary.',
    likelyCauseFa: 'فشار شدید روی دیسک یا CPU هنگام بالا آمدن سیستم، کندی شبکه یا گیر کردن سرویس.',
    recommendedActionEn: 'Check CPU/Disk saturation in Health & Safe Process Control. If the service is Print Spooler, restart it from Printers & Spooler.',
    recommendedActionFa: 'فشار CPU و دیسک را در تب «سلامت سیستم و کنترل پروسس‌ها» بررسی کنید؛ اگر سرویس مربوط به Print Spooler است از تب «پرینترها و Spooler» آن را ری‌استارت نمایید.',
  },
  {
    eventIds: [7023, 7024, 7031, 7034],
    sourcePattern: /service control manager/i,
    category: 'service_os',
    humanTitleEn: 'Windows Background Service Terminated Unexpectedly',
    humanTitleFa: 'توقف ناگهانی و کرش یک سرویس پس‌زمینه ویندوز',
    humanReasonEn: 'A running Windows service crashed or stopped with a service-specific error code.',
    humanReasonFa: 'یکی از سرویس‌های در حال اجرای ویندوز به‌صورت غیرمنتظره متوقف شده یا با خطا بسته شده است.',
    likelyCauseEn: 'Corrupt service config/cache, software bug, memory exhaustion, or third-party agent crash.',
    likelyCauseFa: 'خرابی فایل تنظیمات/کش سرویس، کمبود رم، یا باگ در یک سرویس/ایجنت جانبی.',
    recommendedActionEn: 'Identify the service name in the raw log; if it is Print Spooler use Printers & Spooler to restart/clear the queue, otherwise check RAM and updates.',
    recommendedActionFa: 'نام سرویس را در لاگ خام چک کنید؛ اگر Print Spooler است از تب «پرینترها و Spooler» تعمیر کنید و در غیر این صورت مصرف رم و آپدیت برنامه را بررسی نمایید.',
  },

  // ---- Network, DNS & DHCP ----
  {
    eventIds: [1014],
    sourcePattern: /dns[\s-]client/i,
    category: 'network_dns',
    humanTitleEn: 'DNS Resolution Timeout (DNS Server Did Not Respond)',
    humanTitleFa: 'عدم پاسخگویی سرور DNS و خطای ترجمه نام دامنه (DNS Timeout)',
    humanReasonEn: 'The workstation tried to resolve a domain/hostname, but none of its configured DNS servers replied in time.',
    humanReasonFa: 'سیستم کاربر تلاش کرد یک نام دامنه یا سرور داخلی را ترجمه کند، اما هیچ‌یک از سرورهای DNS تنظیم‌شده در زمان مقرر پاسخ ندادند.',
    likelyCauseEn: 'Temporary Wi-Fi/LAN drop, wrong DNS server configured, VPN split-DNS conflict, or internal DNS server unreachable.',
    likelyCauseFa: 'قطعی لحظه‌ای شبکه/وای‌فای، تنظیم اشتباه DNS، تداخل VPN یا عدم دسترسی به سرور DNS داخلی سازمان.',
    recommendedActionEn: 'Open Network & Safe Reset: inspect configured DNS servers, run an endpoint DNS & Ping test, and click "Flush DNS Cache".',
    recommendedActionFa: 'به تب «عیب‌یابی شبکه و ریست امن» بروید: آدرس سرورهای DNS سیستم را چک کنید، تست DNS و پینگ بگیرید و دکمه Flush DNS را بزنید.',
  },
  {
    eventIds: [1001, 1002, 50036, 50037],
    sourcePattern: /dhcp/i,
    category: 'network_dns',
    humanTitleEn: 'DHCP IP Lease Failed or Renew Error',
    humanTitleFa: 'خطا در دریافت یا تمدید آدرس IP از سرور DHCP',
    humanReasonEn: 'The workstation could not obtain or renew an IP address from the DHCP server on the network.',
    humanReasonFa: 'سیستم کاربر نتوانست آدرس IP معتبر از سرور DHCP شبکه دریافت یا تمدید کند.',
    likelyCauseEn: 'DHCP scope pool exhausted, VLAN/port misconfiguration on switch, disconnected cable, or DHCP server unreachable.',
    likelyCauseFa: 'پر شدن رنج IP در سرور DHCP، تنظیم اشتباه VLAN پورت سوییچ، قطعی کابل/وای‌فای یا از دسترس خارج بودن سرور DHCP.',
    recommendedActionEn: 'Check active NIC IP in Network & Safe Reset and run "Renew DHCP IP". If it stays 169.254.x.x (APIPA), check switch port VLAN and DHCP pool.',
    recommendedActionFa: 'در تب «عیب‌یابی شبکه و ریست امن» وضعیت کارت شبکه را چک کرده و دکمه Renew DHCP IP را بزنید؛ اگر آدرس 169.254.x.x گرفت، VLAN پورت سوییچ و سرور DHCP را بررسی کنید.',
  },
  {
    eventIds: [4199, 4198],
    sourcePattern: /tcpip/i,
    category: 'network_dns',
    humanTitleEn: 'IP Address Conflict Detected on Network',
    humanTitleFa: 'تداخل آدرس IP روی شبکه (IP Address Conflict)',
    humanReasonEn: 'Another device on the same LAN/VLAN is using the exact same IP address as this workstation, causing intermittent disconnects.',
    humanReasonFa: 'یک دستگاه دیگر در همین شبکه دقیقاً از همان آدرس IP این سیستم استفاده می‌کند که باعث قطع و وصل شدن مداوم شبکه می‌شود.',
    likelyCauseEn: 'A manually configured static IP colliding with DHCP range or duplicate static IP assignment.',
    likelyCauseFa: 'ست کردن دستی IP تکراری روی یک دستگاه دیگر یا همپوشانی IP استاتیک با رنج DHCP.',
    recommendedActionEn: 'Run "Renew DHCP IP" in Network & Safe Reset and use the panel’s MAC/IP Tracker tool to locate the conflicting MAC address.',
    recommendedActionFa: 'در تب «عیب‌یابی شبکه و ریست امن» گزینه Renew DHCP IP را بزنید و با ابزار MAC/IP Tracker پنل دستگاه دارای IP تکراری را پیدا کنید.',
  },

  // ---- Group Policy & Active Directory ----
  {
    eventIds: [1030, 1053, 1055, 1058, 1085, 1129],
    sourcePattern: /grouppolicy/i,
    category: 'group_policy',
    humanTitleEn: 'Group Policy (GPO) Processing Failed',
    humanTitleFa: 'خطا در دریافت یا اعمال Group Policy از دامین (GPO Failure)',
    humanReasonEn: 'Windows could not contact the Domain Controller or read the SYSVOL policy files to apply corporate Group Policies.',
    humanReasonFa: 'ویندوز نتوانست به Domain Controller متصل شود یا فایل‌های پالیسی (SYSVOL) را جهت اعمال تنظیمات سازمانی دریافت کند.',
    likelyCauseEn: 'Workstation booted before network/VPN was ready, DNS pointing outside AD DNS, or broken domain trust/clock skew.',
    likelyCauseFa: 'بالا آمدن سیستم پیش از اتصال شبکه/VPN، تنظیم اشتباه DNS (عدم اشاره به DC)، یا اختلاف ساعت/قطع ارتباط با دامین.',
    recommendedActionEn: 'Verify internal AD DNS in Network & Safe Reset, then open Temp Cleanup & GPUpdate to inspect GPO status and click "Run gpupdate /force".',
    recommendedActionFa: 'در تب «عیب‌یابی شبکه و ریست امن» مطمئن شوید DNS روی سرور دامین تنظیم است، سپس در تب «پاک‌سازی Temp و GPUpdate» وضعیت GPO را بررسی کرده و دکمه gpupdate /force را اجرا کنید.',
  },
  {
    eventIds: [5719, 5722, 5723, 5805],
    sourcePattern: /netlogon/i,
    category: 'group_policy',
    humanTitleEn: 'Domain Controller Unreachable or Secure Channel Broken',
    humanTitleFa: 'قطع ارتباط با Domain Controller یا خرابی کانال امن دامین (Trust Broken)',
    humanReasonEn: 'The computer could not establish a secure authentication session with any Domain Controller in the domain.',
    humanReasonFa: 'این سیستم نتوانست با هیچ Domain Controller ارتباط امن برقرار کند (یا رابطه اعتماد سیستم با دامین خراب شده است).',
    likelyCauseEn: 'Offline/disconnected from corporate LAN/VPN, DNS issue, or computer account password out of sync with Active Directory.',
    likelyCauseFa: 'قطع بودن از شبکه شرکت/VPN، مشکل DNS، یا ناهماهنگی رمز اکانت کامپیوتر با Active Directory.',
    recommendedActionEn: 'Verify DNS & TCP port 389/88 reachability to the Domain Controller in Network & Safe Reset. If Trust is broken, rejoin domain or reset computer secure channel.',
    recommendedActionFa: 'در تب «عیب‌یابی شبکه و ریست امن» دسترسی DNS و پورت 389/88 به Domain Controller را تست کنید؛ در صورت خرابی Trust، کانال امن سیستم در دامین باید ترمیم شود.',
  },

  // ---- Security & Auth ----
  {
    eventIds: [1116, 1117, 5001, 5007],
    sourcePattern: /defender/i,
    category: 'security_auth',
    humanTitleEn: 'Windows Defender Threat Alert or Protection State Change',
    humanTitleFa: 'هشدار امنیتی Windows Defender یا تغییر وضعیت محافظت آنتی‌ویروس',
    humanReasonEn: 'Windows Defender detected potentially malicious software (1116/1117) or had its real-time protection/configuration changed (5001/5007).',
    humanReasonFa: 'آنتی‌ویروس ویندوز یک فایل مشکوک/بدافزار شناسایی کرده یا وضعیت محافظت لحظه‌ای (Real-Time Protection) آن تغییر کرده یا خاموش شده است.',
    likelyCauseEn: 'Downloaded malicious/unwanted file, false positive on internal tool, or unauthorized attempt to disable protection.',
    likelyCauseFa: 'دانلود فایل آلوده توسط کاربر، تشخیص اشتباه روی یک ابزار داخلی، یا غیرفعال شدن محافظت آنتی‌ویروس.',
    recommendedActionEn: 'Verify Defender Real-Time status in Health & Safe Process Control immediately and escalate to IT Security if malware detection (1116) is confirmed.',
    recommendedActionFa: 'فوراً وضعیت فعال بودن Defender را در تب «سلامت سیستم و کنترل پروسس‌ها» بررسی کرده و در صورت تایید هشدار بدافزار (کد 1116) به تیم امنیت اطلاع دهید.',
  },
  {
    eventIds: [36871, 36874, 36887, 36888],
    sourcePattern: /schannel/i,
    category: 'security_auth',
    humanTitleEn: 'TLS / SSL Secure Handshake Error (Schannel)',
    humanTitleFa: 'خطای برقراری اتصال امن TLS / SSL (Schannel Alert)',
    humanReasonEn: 'An encrypted HTTPS/TLS connection failed during certificate or cipher negotiation with a remote server.',
    humanReasonFa: 'برقراری یک ارتباط رمزنگاری‌شده HTTPS/TLS به دلیل ناسازگاری نسخه TLS، گواهینامه نامعتبر یا منقضی‌شده شکست خورده است.',
    likelyCauseEn: 'Expired SSL certificate on target server, legacy TLS 1.0/1.1 disabled, or mismatched system clock.',
    likelyCauseFa: 'انقضای گواهینامه SSL سرور مقصد، مسدود بودن TLS قدیمی یا تنظیم نبودن تاریخ و ساعت سیستم کاربر.',
    recommendedActionEn: 'Check workstation date/time and verify the target service SSL certificate in the panel’s SSL/TLS Certificates monitor.',
    recommendedActionFa: 'تاریخ و ساعت سیستم کاربر را چک کنید و اعتبار گواهینامه سرور مقصد را در بخش گواهینامه‌های SSL پنل بررسی نمایید.',
  },

  // ---- Memory / Resource Exhaustion ----
  {
    eventIds: [2004],
    sourcePattern: /resource-exhaustion/i,
    category: 'resource_memory',
    humanTitleEn: 'Low Virtual Memory / RAM Exhaustion Warning',
    humanTitleFa: 'هشدار پر شدن کامل حافظه RAM و حافظه مجازی سیستم',
    humanReasonEn: 'Windows ran dangerously low on virtual memory (RAM + Pagefile) and identified the top memory-consuming apps.',
    humanReasonFa: 'حافظه رم و حافظه مجازی (Pagefile) سیستم تقریباً به طور کامل پر شده است که باعث کندی شدید یا بسته شدن ناگهانی برنامه‌ها می‌شود.',
    likelyCauseEn: 'Too many browser tabs (Chrome/Edge), memory leak in an open app, or insufficient RAM/Pagefile size.',
    likelyCauseFa: 'باز بودن تب‌های زیاد در مرورگر (کروم/اج)، نشت حافظه (Memory Leak) در یک برنامه، یا کم بودن ظرفیت رم/فضای درایو C.',
    recommendedActionEn: 'Open Health & Safe Process Control to identify the top RAM process, safely close frozen heavy apps, and free up C: drive space via Temp Cleanup & GPUpdate.',
    recommendedActionFa: 'در تب «سلامت سیستم و کنترل پروسس‌ها» پروسس پرمصرف RAM را شناسایی کرده، برنامه‌های سنگین غیرضروری را ببندید و فضای درایو C را از تب «پاک‌سازی Temp و GPUpdate» آزاد کنید.',
  },

  // ---- Display / GPU ----
  {
    eventIds: [4101, 13, 14],
    sourcePattern: /display|nvlddmkm|amdkmdag|igfx/i,
    category: 'hardware_disk',
    humanTitleEn: 'Graphics Driver Stopped Responding and Recovered (GPU Reset)',
    humanTitleFa: 'توقف لحظه‌ای و ریست شدن درایور کارت گرافیک (سیاه شدن لحظه‌ای صفحه)',
    humanReasonEn: 'The display driver froze briefly and Windows automatically reset the GPU to recover the screen without rebooting.',
    humanReasonFa: 'درایور کارت گرافیک برای چند لحظه پاسخ نداده و ویندوز برای جلوگیری از قفل شدن سیستم، آن را ریست کرده است (معمولاً صفحه یک لحظه سیاه می‌شود).',
    likelyCauseEn: 'Outdated/buggy GPU driver, hardware acceleration glitch in Chrome/Teams/Office, or overheating GPU.',
    likelyCauseFa: 'قدیمی یا معیوب بودن درایور گرافیک، تداخل شتاب‌دهنده سخت‌افزاری مرورگر/تیمز یا داغ شدن کارت گرافیک.',
    recommendedActionEn: 'Update the graphics driver and consider disabling Hardware Acceleration in Chrome/Edge/Office if screens keep flickering.',
    recommendedActionFa: 'درایور کارت گرافیک را بروزرسانی کنید و در صورت تکرار، گزینه Hardware Acceleration در مرورگر یا آفیس را غیرفعال نمایید.',
  },

  // ---- Printers & Print Spooler ----
  {
    eventIds: [307, 372, 6161, 808],
    sourcePattern: /printservice|spooler/i,
    category: 'printer',
    humanTitleEn: 'Printer Driver or Print Spooler Job Failure',
    humanTitleFa: 'خطای پرینت، خرابی درایور پرینتر یا گیر کردن سند در صف چاپ',
    humanReasonEn: 'The Print Spooler failed to render or send a document to the printer (often due to a corrupt job, offline printer, or driver error).',
    humanReasonFa: 'سرویس Print Spooler نتوانست سند کاربر را پردازش یا به پرینتر ارسال کند (معمولاً به علت سند خراب، آفلاین بودن پرینتر یا خطای درایور).',
    likelyCauseEn: 'Stuck corrupted spool file, unreachable network printer IP, or incompatible printer driver.',
    likelyCauseFa: 'فایل گیرکرده و خراب در صف چاپ، قطع بودن ارتباط با IP پرینتر شبکه، یا ناسازگاری درایور پرینتر.',
    recommendedActionEn: 'Open Printers & Spooler: inspect the queue and click "Clear Stuck Queue & Restart Spooler".',
    recommendedActionFa: 'به تب «پرینترها و Spooler» بروید، صف پرینت را بررسی کرده و دکمه پاک‌سازی صف گیرکرده و ری‌استارت Spooler را اجرا کنید.',
  },

  // ---- DCOM Noise ----
  {
    eventIds: [10016, 10010],
    sourcePattern: /distributedcom/i,
    category: 'service_os',
    humanTitleEn: 'DCOM Component Permission or Timeout Notice (Mostly Benign)',
    humanTitleFa: 'خطای مجوز یا زمان‌بندی کامپوننت داخلی DCOM (معمولاً بی‌خطر)',
    humanReasonEn: 'A Windows background component attempted to access a COM server without explicit Local Activation permission or timed out. Microsoft documents 10016 as mostly harmless noise.',
    humanReasonFa: 'یکی از اجزای داخلی ویندوز هنگام فراخوانی یک سرویس COM با محدودیت مجوز یا Timeout مواجه شده است. طبق مستندات مایکروسافت کد 10016 معمولاً بی‌خطر است و عامل خرابی سیستم نیست.',
    likelyCauseEn: 'Built-in Windows AppX/RuntimeBroker default DCOM permissions (normal OS behavior).',
    likelyCauseFa: 'تنظیمات پیش‌فرض مجوزهای داخلی ویندوز (رفتار عادی سیستم‌عامل و معمولاً بی‌نیاز به اقدام).',
    recommendedActionEn: 'Usually safe to ignore unless paired with a specific broken application. Focus on Critical/Disk/Network/Crash errors instead.',
    recommendedActionFa: 'معمولاً نیازی به اقدام ندارد مگر همراه با اختلال در یک نرم‌افزار خاص باشد؛ تمرکز را روی خطاهای دیسک، کرش یا شبکه بگذارید.',
  },

  // ---- Windows Update & Time ----
  {
    eventIds: [20, 25, 31],
    sourcePattern: /windowsupdateclient/i,
    category: 'update_time',
    humanTitleEn: 'Windows Update Download or Installation Failed',
    humanTitleFa: 'شکست در دانلود یا نصب آپدیت ویندوز (Windows Update Failure)',
    humanReasonEn: 'Windows Update failed to download or apply an OS/security patch.',
    humanReasonFa: 'سرویس Windows Update نتوانست یک بسته بروزرسانی امنیتی یا سیستمی را دانلود یا نصب کند.',
    likelyCauseEn: 'Low free space on C: drive, proxy/WSUS connectivity issue, or pending reboot from an earlier update.',
    likelyCauseFa: 'کمبود فضای خالی درایو C، مشکل اتصال به اینترنت/WSUS/پراکسی، یا نیاز به ری‌استارت از آپدیت قبلی.',
    recommendedActionEn: 'Check C: drive free space in Health & Safe Process Control, clean Temp files in Temp Cleanup & GPUpdate, and verify proxy/network reachability in Network & Safe Reset.',
    recommendedActionFa: 'فضای خالی درایو C را در تب «سلامت سیستم و کنترل پروسس‌ها» بررسی کرده، پوشه Temp را در تب «پاک‌سازی Temp و GPUpdate» پاک‌سازی کنید و وضعیت Proxy/شبکه را در تب «عیب‌یابی شبکه و ریست امن» چک نمایید.',
  },
  {
    eventIds: [36, 47, 129, 134],
    sourcePattern: /time-service|w32time/i,
    category: 'update_time',
    humanTitleEn: 'System Clock / NTP Time Sync Failed',
    humanTitleFa: 'خطا در همگام‌سازی ساعت سیستم با سرور زمان (NTP / Domain Time)',
    humanReasonEn: 'Windows could not synchronize its system clock with the Domain Controller or NTP server. Severe clock drift breaks Kerberos login and HTTPS.',
    humanReasonFa: 'ویندوز نتوانست ساعت سیستم را با Domain Controller یا سرور NTP همگام کند. اختلاف ساعت بیش از ۵ دقیقه باعث خرابی لاگین دامین و خطای HTTPS می‌شود.',
    likelyCauseEn: 'UDP port 123 blocked, unreachable DC/NTP server, or depleted CMOS motherboard battery.',
    likelyCauseFa: 'بسته بودن پورت UDP 123، عدم دسترسی به DC یا سرور NTP، یا ضعیف شدن باتری CMOS مادربرد.',
    recommendedActionEn: 'Verify network connectivity to the Domain Controller in Network & Safe Reset and check if workstation time matches corporate DC time.',
    recommendedActionFa: 'دسترسی شبکه به Domain Controller را در تب «عیب‌یابی شبکه و ریست امن» تست کنید و مطمئن شوید ساعت سیستم با سرور دامین اختلاف ندارد.',
  },
];

/**
 * Produces a rich, plain-language bilingual human diagnosis for ANY Windows Event ID or Linux journal entry.
 */
export function explainEventCodeHuman(input: {
  eventId: number;
  source: string;
  channel: string;
  level: 'critical' | 'error' | 'warning' | 'info';
  message: string;
  osFamily?: 'windows' | 'linux';
}): HumanEventExplanation {
  const id = Number(input.eventId) || 0;
  const source = String(input.source || '').trim();
  const message = String(input.message || '').trim();
  const combined = `${source} ${message}`.toLowerCase();

  // 1. Exact catalog match (Event ID + matching provider pattern)
  for (const rule of WINDOWS_EVENT_CATALOG) {
    if (rule.eventIds.includes(id)) {
      if (!rule.sourcePattern || rule.sourcePattern.test(source) || rule.sourcePattern.test(message)) {
        const catLbl = CATEGORY_LABELS[rule.category];
        return {
          category: rule.category,
          categoryLabelEn: catLbl.en,
          categoryLabelFa: catLbl.fa,
          humanTitleEn: rule.humanTitleEn,
          humanTitleFa: rule.humanTitleFa,
          humanReasonEn: rule.humanReasonEn,
          humanReasonFa: rule.humanReasonFa,
          likelyCauseEn: rule.likelyCauseEn,
          likelyCauseFa: rule.likelyCauseFa,
          recommendedActionEn: rule.recommendedActionEn,
          recommendedActionFa: rule.recommendedActionFa,
          isKnownCode: true,
        };
      }
    }
  }

  // 2. Smart contextual classifier for Linux journald & uncataloged Windows Event IDs
  const classify = (
    category: HelpdeskEventCategory,
    humanTitleEn: string,
    humanTitleFa: string,
    humanReasonEn: string,
    humanReasonFa: string,
    likelyCauseEn: string,
    likelyCauseFa: string,
    recommendedActionEn: string,
    recommendedActionFa: string
  ): HumanEventExplanation => {
    const catLbl = CATEGORY_LABELS[category];
    return {
      category,
      categoryLabelEn: catLbl.en,
      categoryLabelFa: catLbl.fa,
      humanTitleEn,
      humanTitleFa,
      humanReasonEn,
      humanReasonFa,
      likelyCauseEn,
      likelyCauseFa,
      recommendedActionEn,
      recommendedActionFa,
      isKnownCode: false,
    };
  };

  if (/disk|nvme|sata|ntfs|ext4|i\/o error|bad block|sector|volume/.test(combined)) {
    return classify(
      'hardware_disk',
      `Storage / Disk Error (${source || `ID ${id}`})`,
      `خطای دیسک یا ذخیره‌سازی (${source || `کد ${id}`})`,
      'The operating system reported a read/write or file system issue on a storage drive.',
      'سیستم‌عامل هنگام خواندن، نوشتن یا بررسی ساختار یکی از درایوها با خطا مواجه شده است.',
      'Low disk space, file system inconsistency, loose cable, or aging HDD/SSD.',
      'پر شدن فضا، خرابی فایل‌سیستم، مشکل کابل یا فرسودگی هارد/SSD.',
      'Check free disk space in Health & Safe Process Control, run Temp Cleanup if C: is full, and monitor for recurring disk errors.',
      'فضای خالی دیسک را در تب «سلامت سیستم و کنترل پروسس‌ها» بررسی کنید، در صورت پر بودن درایو C از تب «پاک‌سازی Temp و GPUpdate» فایل‌های موقت را پاک کنید و در صورت تکرار سلامت هارد را چک نمایید.'
    );
  }

  if (/dns|dhcp|tcpip|network|wlan|wifi|ethernet|nic|socket|unreachable|timed out|timeout/.test(combined)) {
    return classify(
      'network_dns',
      `Network / Connectivity Issue (${source || `ID ${id}`})`,
      `اختلال شبکه یا ارتباطی (${source || `کد ${id}`})`,
      'A network interface, DNS query, or remote server connection failed or timed out on this workstation.',
      'کارت شبکه، استعلام DNS یا اتصال به یک سرویس تحت شبکه روی سیستم کاربر با خطا یا Timeout روبه‌رو شده است.',
      'Temporary LAN/Wi-Fi drop, incorrect DNS/Proxy settings, or firewall blocking the target port.',
      'قطعی لحظه‌ای شبکه/وای‌فای، تنظیم اشتباه DNS یا Proxy، یا مسدود شدن پورت توسط فایروال.',
      'Use Network & Safe Reset to run Ping/Port/DNS tests directly from this workstation and flush DNS if needed.',
      'در تب «عیب‌یابی شبکه و ریست امن» تست Ping، پورت و DNS را از داخل خود سیستم کاربر اجرا کنید و در صورت نیاز کش DNS را پاک نمایید.'
    );
  }

  if (/print|spooler|cups/.test(combined)) {
    return classify(
      'printer',
      `Printing / Spooler Error (${source || `ID ${id}`})`,
      `خطای پرینتر یا سرویس چاپ (${source || `کد ${id}`})`,
      'A print job, printer driver, or spooler service encountered an error on the user’s workstation.',
      'سند چاپی، درایور پرینتر یا سرویس Spooler روی سیستم کاربر دچار خطا شده است.',
      'Stuck print document, offline printer, or driver conflict.',
      'گیر کردن سند خراب در صف پرینت، آفلاین بودن پرینتر یا مشکل درایور.',
      'Open Printers & Spooler to inspect queued jobs and restart or clear the Print Spooler.',
      'در تب «پرینترها و Spooler» صف چاپ را بررسی کرده و در صورت گیر کردن اسناد، سرویس Spooler را ری‌استارت یا صف را پاک‌سازی کنید.'
    );
  }

  if (/group\s*policy|gpo|netlogon|kerberos|ldap|domain|active directory|sysvol/.test(combined)) {
    return classify(
      'group_policy',
      `Domain / Group Policy Issue (${source || `ID ${id}`})`,
      `خطای ارتباط با دامین یا Group Policy (${source || `کد ${id}`})`,
      'The workstation encountered an issue authenticating with Active Directory or refreshing domain Group Policy.',
      'سیستم کاربر در احراز هویت دامین یا دریافت و اعمال پالیسی‌های Active Directory دچار مشکل شده است.',
      'DNS not pointing to Domain Controller, VPN disconnected, or expired computer/user ticket.',
      'اشاره نکردن DNS به Domain Controller، قطع بودن VPN، یا ناهماهنگی تیکت/ساعت سیستم.',
      'Check DNS in Network & Safe Reset and run gpupdate /force from Temp Cleanup & GPUpdate once Domain Controller reachability is confirmed.',
      'در تب «عیب‌یابی شبکه و ریست امن» تنظیمات DNS و دسترسی به DC را چک کرده و سپس از تب «پاک‌سازی Temp و GPUpdate» دستور gpupdate /force را اجرا کنید.'
    );
  }

  if (/memory|out of memory|oom|pagefile|virtual memory|ram/.test(combined)) {
    return classify(
      'resource_memory',
      `Memory / Resource Pressure (${source || `ID ${id}`})`,
      `کمبود حافظه RAM یا منابع سیستم (${source || `کد ${id}`})`,
      'The workstation ran low on available RAM or virtual memory, impacting running applications.',
      'حافظه RAM یا حافظه مجازی سیستم به حد بحرانی رسیده و عملکرد برنامه‌ها را مختل کرده است.',
      'Heavy browser tabs, memory leak in an open app, or full C: drive preventing pagefile growth.',
      'مصرف بالای مرورگر یا یک برنامه، یا پر بودن درایو C.',
      'Inspect top RAM consumers in Health & Safe Process Control, close stuck heavy user apps, and clear Temp files in Temp Cleanup & GPUpdate.',
      'در تب «سلامت سیستم و کنترل پروسس‌ها» پروسس‌های پرمصرف رم را شناسایی کنید، برنامه‌های هنگ‌کرده را ببندید و پوشه Temp را پاک‌سازی کنید.'
    );
  }

  if (/denied|unauthorized|auth|logon|password|lockout|certificate|tls|ssl|defender|antivirus|firewall/.test(combined)) {
    return classify(
      'security_auth',
      `Security / Permission / Auth Event (${source || `ID ${id}`})`,
      `رویداد امنیتی، مجوز یا احراز هویت (${source || `کد ${id}`})`,
      'A security check, login attempt, certificate validation, or endpoint protection control reported an issue.',
      'یک بررسی امنیتی، تلاش ورود، اعتبارسنجی گواهینامه یا محافظت آنتی‌ویروس خطا یا هشدار ثبت کرده است.',
      'Invalid/expired credentials, locked user account, expired certificate, or blocked unsigned software.',
      'اشتباه بودن یا انقضای رمز عبور، قفل شدن اکانت، انقضای گواهینامه یا مسدودسازی توسط آنتی‌ویروس.',
      'Review the raw message for the exact account or resource name and verify Antivirus/Firewall status in Health & Safe Process Control.',
      'نام اکانت یا منبع خطا را در متن خام بررسی کرده و وضعیت آنتی‌ویروس و فایروال را در تب «سلامت سیستم و کنترل پروسس‌ها» کنترل نمایید.'
    );
  }

  if (/crash|faulting|exception|hang|stopped working|segfault|core dumped/.test(combined)) {
    return classify(
      'application',
      `Software Crash or Freeze (${source || `ID ${id}`})`,
      `کرش یا توقف ناگهانی نرم‌افزار (${source || `کد ${id}`})`,
      'An installed program crashed or stopped responding due to an internal software exception.',
      'یکی از برنامه‌های نصب‌شده روی سیستم کاربر به دلیل خطای داخلی متوقف شده یا هنگ کرده است.',
      'Corrupted temp/cache files, buggy plugin/add-in, or outdated application build.',
      'خرابی فایل‌های موقت و کش، افزونه ناسازگار یا نسخه قدیمی نرم‌افزار.',
      'Clean Temp folders in Temp Cleanup & GPUpdate, check RAM/CPU load in Health & Safe Process Control, and repair or update the affected software.',
      'پوشه Temp را در تب «پاک‌سازی Temp و GPUpdate» پاک‌سازی کنید، وضعیت رم/CPU را در تب «سلامت سیستم و کنترل پروسس‌ها» چک کنید و در صورت تکرار نرم‌افزار را Repair یا آپدیت نمایید.'
    );
  }

  if (/service|daemon|systemd|driver|kernel|boot/.test(combined)) {
    return classify(
      'service_os',
      `OS Service or Driver Event (${source || `ID ${id}`})`,
      `خطای سرویس سیستم‌عامل یا درایور (${source || `کد ${id}`})`,
      'A background operating system service or device driver reported an error or unexpected stop.',
      'یک سرویس پس‌زمینه سیستم‌عامل یا درایور سخت‌افزاری با خطا مواجه شده یا متوقف شده است.',
      'Service dependency delay, outdated driver, or missing configuration after an update.',
      'تأخیر سرویس پیش‌نیاز، قدیمی بودن درایور یا تداخل پس از آپدیت ویندوز.',
      'Expand the raw log message to see the exact service/driver name and check if the error repeats after a restart.',
      'متن خام لاگ را باز کنید تا نام دقیق سرویس/درایور مشخص شود و بررسی کنید آیا پس از ری‌استارت مجدداً تکرار می‌شود یا خیر.'
    );
  }

  const lvlEn = input.level === 'critical' ? 'Critical System Event' : input.level === 'error' ? 'System/App Error' : 'System Warning';
  const lvlFa = input.level === 'critical' ? 'رویداد بحرانی سیستم' : input.level === 'error' ? 'خطای سیستم یا نرم‌افزار' : 'هشدار سیستمی';
  return classify(
    'general',
    `${lvlEn} — ${source || `Event ${id}`}`,
    `${lvlFa} — ${source || `کد ${id}`}`,
    `Component "${source || 'OS'}" logged a ${input.level} event (Code ${id}) in the ${input.channel || 'System'} log.`,
    `بخش «${source || 'سیستم‌عامل'}» یک رویداد با سطح ${input.level === 'critical' ? 'بحرانی' : input.level === 'error' ? 'خطا' : 'هشدار'} (کد ${id}) در لاگ ${input.channel || 'System'} ثبت کرده است.`,
    'Component-specific operational warning or transient runtime failure.',
    'خطای عملیاتی اختصاصی همان نرم‌افزار/سرویس یا اختلال موقت زمان اجرا.',
    'Expand the raw event details below to inspect the exact message and check whether this Event ID repeats frequently.',
    'بخش «متن خام لاگ» را باز کنید تا جزئیات دقیق را ببینید و بررسی کنید آیا این کد خطا به‌صورت مکرر تکرار می‌شود یا موردی بوده است.'
  );
}

// ============================================================================
// BSOD MULTI-CAUSE DIAGNOSTICS & STOP CODE DECODER
// ============================================================================

export type BsodReasonCategory =
  | 'bugcheck'
  | 'kernel_power'
  | 'hardware_whea'
  | 'driver_gpu'
  | 'storage_dump'
  | 'memory_os';

export interface BsodStopCodeInfo {
  codeHex: string;
  symbolicName: string;
  category: BsodReasonCategory;
  summaryEn: string;
  summaryFa: string;
  actionEn: string;
  actionFa: string;
}

export interface BsodDumpFileInfo {
  name: string;
  path: string;
  sizeKb: number;
  createdAt: string;
}

export interface BsodCrashControlInfo {
  crashDumpEnabled: number | null;
  crashDumpModeLabel: string;
  autoReboot: boolean | null;
  dumpFile: string;
  minidumpDir: string;
}

export interface BsodReasonBucket {
  reason: BsodReasonCategory;
  titleEn: string;
  titleFa: string;
  descriptionEn: string;
  descriptionFa: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
  count: number;
  sampleEventIds: number[];
}

export interface BsodAnalysisResult {
  focusEnabled: boolean;
  bsodDetected: boolean;
  totalClueEvents: number;
  verdictTitleEn: string;
  verdictTitleFa: string;
  verdictSummaryEn: string;
  verdictSummaryFa: string;
  stopCodes: BsodStopCodeInfo[];
  suspectedDrivers: string[];
  reasonBuckets: BsodReasonBucket[];
  dumpFiles: BsodDumpFileInfo[];
  crashControl: BsodCrashControlInfo | null;
}

const BSOD_STOP_CODE_CATALOG: Record<string, BsodStopCodeInfo> = {
  '0x0000000A': {
    codeHex: '0x0000000A',
    symbolicName: 'IRQL_NOT_LESS_OR_EQUAL',
    category: 'driver_gpu',
    summaryEn: 'Kernel-mode driver or OS routine touched invalid/paged memory at too high an IRQL.',
    summaryFa: 'یک درایور سخت‌افزاری (شبکه، وای‌فای، گرافیک یا آنتی‌ویروس) یا هسته سیستم به آدرس نامعتبری از حافظه دسترسی پیدا کرده است.',
    actionEn: 'Update NIC/Wi-Fi, chipset, and GPU drivers; run Windows Memory Diagnostic if persistent.',
    actionFa: 'درایور کارت شبکه/وای‌فای، چیپ‌ست و گرافیک را بروزرسانی کنید و در صورت تکرار سلامت RAM را تست بگیرید.',
  },
  '0x0000001A': {
    codeHex: '0x0000001A',
    symbolicName: 'MEMORY_MANAGEMENT',
    category: 'memory_os',
    summaryEn: 'Severe memory management fault caused by failing RAM module, corrupted pagefile, or driver leak.',
    summaryFa: 'خطای جدی مدیریت حافظه؛ معمولاً ناشی از خرابی ماژول RAM، خرابی Pagefile یا نشت حافظه یک درایور.',
    actionEn: 'Run Windows Memory Diagnostic (mdsched) / MemTest86 and verify disk health on C:.',
    actionFa: 'تست سلامت RAM (mdsched یا MemTest86) و سلامت درایو ویندوز را انجام دهید و ماژول رم معیوب را بررسی کنید.',
  },
  '0x0000001E': {
    codeHex: '0x0000001E',
    symbolicName: 'KMODE_EXCEPTION_NOT_HANDLED',
    category: 'driver_gpu',
    summaryEn: 'A kernel-mode program or third-party driver generated an unhandled exception.',
    summaryFa: 'یک درایور سیستمی یا سرویس کرنل با خطای استثنای مدیریت‌نشده (Unhandled Exception) کرش کرده است.',
    actionEn: 'Inspect suspected .sys driver files, roll back recent drivers/updates, and run SFC / DISM.',
    actionFa: 'نام فایل درایور (.sys) داخل لاگ یا دامپ را بررسی کنید، درایور یا آپدیت اخیر را برگردانید و SFC / DISM اجرا کنید.',
  },
  '0x00000024': {
    codeHex: '0x00000024',
    symbolicName: 'NTFS_FILE_SYSTEM',
    category: 'storage_dump',
    summaryEn: 'Fatal fault inside ntfs.sys caused by file-system corruption or failing storage drive.',
    summaryFa: 'خطای بحرانی در فایل‌سیستم NTFS به دلیل خرابی ساختار دیسک یا نقص فیزیکی هارد/SSD.',
    actionEn: 'Back up user files and run chkdsk /f and SMART disk diagnostics.',
    actionFa: 'فوراً بکاپ بگیرید و سلامت دیسک و دستورات ترمیم فایل‌سیستم (chkdsk) را اجرا کنید.',
  },
  '0x0000003B': {
    codeHex: '0x0000003B',
    symbolicName: 'SYSTEM_SERVICE_EXCEPTION',
    category: 'driver_gpu',
    summaryEn: 'Exception occurred while transitioning from non-privileged code to privileged kernel/graphics code.',
    summaryFa: 'خطای سیستمی حین اجرای سرویس کرنل؛ بسیار رایج در درایور کارت گرافیک، آنتی‌ویروس یا نرم‌افزارهای مانیتورینگ.',
    actionEn: 'Update GPU and antivirus/EDR drivers and run SFC /scannow.',
    actionFa: 'درایور کارت گرافیک و نسخه آنتی‌ویروس را آپدیت کرده و SFC /scannow اجرا کنید.',
  },
  '0x00000050': {
    codeHex: '0x00000050',
    symbolicName: 'PAGE_FAULT_IN_NONPAGED_AREA',
    category: 'memory_os',
    summaryEn: 'Invalid system memory referenced — linked to faulty RAM, antivirus filter driver, or NTFS errors.',
    summaryFa: 'ارجاع به حافظه نامعتبر سیستمی؛ معمولاً ناشی از خرابی RAM، درایور فیلتر آنتی‌ویروس یا خرابی دیسک.',
    actionEn: 'Test RAM sticks, verify C: NTFS integrity, and check recently installed security agents or drivers.',
    actionFa: 'سلامت ماژول‌های RAM، فایل‌سیستم NTFS و درایورهای آنتی‌ویروس یا سخت‌افزاری جدید را بررسی کنید.',
  },
  '0x0000007B': {
    codeHex: '0x0000007B',
    symbolicName: 'INACCESSIBLE_BOOT_DEVICE',
    category: 'storage_dump',
    summaryEn: 'Windows lost access to the system boot partition (SATA/AHCI/RAID/NVMe mode mismatch or failing SSD).',
    summaryFa: 'ویندوز دسترسی خود به درایو بوت را از دست داده است (تغییر حالت AHCI/RAID در BIOS یا خرابی کنترلر SSD/NVMe).',
    actionEn: 'Verify BIOS SATA/NVMe controller mode (AHCI vs RAID/VMD) and check SSD firmware/cables.',
    actionFa: 'تنظیمات کنترلر دیسک (AHCI / RAID / VMD) در BIOS و سلامت فیزیکی کابل و SSD را بررسی کنید.',
  },
  '0x0000007E': {
    codeHex: '0x0000007E',
    symbolicName: 'SYSTEM_THREAD_EXCEPTION_NOT_HANDLED',
    category: 'driver_gpu',
    summaryEn: 'A system kernel thread threw an exception not caught by any error handler (common after driver/BIOS updates).',
    summaryFa: 'یک ترد هسته سیستم خطای بحرانی داد (اغلب بعد از نصب درایور یا آپدیت بایوس/ویندوز).',
    actionEn: 'Update or roll back GPU, Wi-Fi, and chipset drivers and review recent Windows Updates.',
    actionFa: 'درایور گرافیک، شبکه بی‌سیم و چیپ‌ست را بروزرسانی یا به نسخه قبل بازگردانی کنید.',
  },
  '0x1000007E': {
    codeHex: '0x1000007E',
    symbolicName: 'SYSTEM_THREAD_EXCEPTION_NOT_HANDLED_M',
    category: 'driver_gpu',
    summaryEn: 'Kernel thread exception (64-bit bugcheck variant), typically triggered by a graphics/audio/network driver.',
    summaryFa: 'خطای ترد هسته ویندوز (نسخه ۶۴ بیتی)، غالباً ناشی از باگ درایور گرافیک، صدا یا کارت شبکه.',
    actionEn: 'Update display and network drivers and check minidump for the named .sys file.',
    actionFa: 'درایور گرافیک و شبکه را آپدیت کنید و فایل .sys گزارش‌شده در دامپ را بررسی نمایید.',
  },
  '0x0000009F': {
    codeHex: '0x0000009F',
    symbolicName: 'DRIVER_POWER_STATE_FAILURE',
    category: 'driver_gpu',
    summaryEn: 'A device driver failed to transition cleanly during Sleep, Hibernate, or Shutdown power state changes.',
    summaryFa: 'یک درایور سخت‌افزاری هنگام رفتن سیستم به Sleep / Hibernate یا خاموشی پاسخ نداده و گیر کرده است.',
    actionEn: 'Update chipset, GPU, docking-station, and USB/PCIe drivers; disable Fast Startup if persistent.',
    actionFa: 'درایورهای چیپ‌ست، گرافیک، داک یا USB را آپدیت کنید و در صورت تداوم Fast Startup را غیرفعال نمایید.',
  },
  '0x000000D1': {
    codeHex: '0x000000D1',
    symbolicName: 'DRIVER_IRQL_NOT_LESS_OR_EQUAL',
    category: 'driver_gpu',
    summaryEn: 'Classic third-party driver bugcheck where a kernel driver accessed pageable memory at raised IRQL.',
    summaryFa: 'خطای کلاسیک درایورهای ویندوز؛ یک درایور (معمولاً کارت شبکه، VPN، آنتی‌ویروس یا گرافیک) به حافظه غیرمجاز دسترسی داشته است.',
    actionEn: 'Check suspected .sys driver name (e.g., ndis, tcpip, nvlddmkm, e1d) and update/reinstall that driver.',
    actionFa: 'فایل .sys مرتبط (مثل درایور شبکه، VPN یا گرافیک) را از لاگ بررسی کرده و درایور را بروزرسانی کنید.',
  },
  '0x000000ED': {
    codeHex: '0x000000ED',
    symbolicName: 'UNMOUNTABLE_BOOT_VOLUME',
    category: 'storage_dump',
    summaryEn: 'OS could not mount the boot volume due to severe file system damage or failing HDD/SSD.',
    summaryFa: 'سیستم نتوانست درایو ویندوز را Mount کند؛ ناشی از خرابی شدید فایل‌سیستم یا خرابی فیزیکی هارد/SSD.',
    actionEn: 'Inspect SMART disk health immediately, back up data, and run chkdsk /f.',
    actionFa: 'سریعاً وضعیت SMART دیسک را بررسی کنید، بکاپ بگیرید و تعمیر دیسک را انجام دهید.',
  },
  '0x000000EF': {
    codeHex: '0x000000EF',
    symbolicName: 'CRITICAL_PROCESS_DIED',
    category: 'memory_os',
    summaryEn: 'A critical Windows subsystem process (csrss, wininit, lsass, services) terminated unexpectedly.',
    summaryFa: 'یکی از پروسس‌های حیاتی ویندوز (مثل lsass، csrss یا services) ناگهان بسته شده و باعث صفحه آبی شده است.',
    actionEn: 'Run SFC /scannow + DISM RestoreHealth, verify SSD stability, and check recent software/AV updates.',
    actionFa: 'دستورات SFC /scannow و DISM RestoreHealth را از تب «سلامت دیسک و تعمیر ویندوز» اجرا کنید و ثبات SSD را چک نمایید.',
  },
  '0x000000F4': {
    codeHex: '0x000000F4',
    symbolicName: 'CRITICAL_OBJECT_TERMINATION',
    category: 'storage_dump',
    summaryEn: 'Critical OS process/thread ended abnormally — frequently caused by sudden SSD/NVMe drop.',
    summaryFa: 'توقف ناگهانی آبجکت حیاتی سیستم — اغلب در پی قطع ارتباط ناگهانی SSD یا کابل هارد رخ می‌دهد.',
    actionEn: 'Check SATA/NVMe connection, SSD firmware, and volmgr / disk errors in Event Viewer.',
    actionFa: 'اتصال و سلامت فیزیکی SSD/NVMe و خطاهای volmgr / disk را بررسی کنید.',
  },
  '0x00000116': {
    codeHex: '0x00000116',
    symbolicName: 'VIDEO_TDR_FAILURE',
    category: 'driver_gpu',
    summaryEn: 'Display driver failed to reset the graphics card cleanly within Windows Timeout Detection & Recovery (TDR).',
    summaryFa: 'درایور کارت گرافیک هنگ کرده و ریست سخت‌افزاری GPU (TDR) با شکست مواجه شده است.',
    actionEn: 'Clean-reinstall GPU driver, inspect GPU temperatures/fan, and check PSU power stability.',
    actionFa: 'درایور گرافیک را به نسخه استاندارد بروزرسانی یا نصب مجدد کنید و دما/برق کارت گرافیک را بررسی نمایید.',
  },
  '0x00000124': {
    codeHex: '0x00000124',
    symbolicName: 'WHEA_UNCORRECTABLE_ERROR',
    category: 'hardware_whea',
    summaryEn: 'Fatal hardware error reported by CPU, L2/L3 cache, RAM ECC, VRM voltage, or PCIe bus.',
    summaryFa: 'خطای سخت‌افزاری غیرقابل جبران (WHEA) از سمت پردازنده، کش CPU، ولتاژ تغذیه، رم یا اسلات PCIe.',
    actionEn: 'Check CPU/VRM temperatures, remove any overclock/XMP instability, update BIOS, and test hardware.',
    actionFa: 'دمای CPU، وضعیت پاور/باتری، بایوس مادربرد و سلامت فیزیکی RAM/CPU را فوراً بررسی کنید.',
  },
  '0x00000133': {
    codeHex: '0x00000133',
    symbolicName: 'DPC_WATCHDOG_VIOLATION',
    category: 'driver_gpu',
    summaryEn: 'A DPC/ISR driver routine held the CPU too long without yielding (often SSD/NVMe, Wi-Fi, or GPU driver).',
    summaryFa: 'یک درایور بیش از حد مجاز پردازنده را قفل نگه داشته است (معمولاً درایور NVMe/SSD، وای‌فای یا گرافیک).',
    actionEn: 'Update SSD firmware, storage controller (stornvme/iaStor), network, and GPU drivers.',
    actionFa: 'فیرم‌ور SSD و درایور کنترلر دیسک، وای‌فای و کارت گرافیک را بروزرسانی کنید.',
  },
  '0x00000139': {
    codeHex: '0x00000139',
    symbolicName: 'KERNEL_SECURITY_CHECK_FAILURE',
    category: 'memory_os',
    summaryEn: 'Windows kernel detected critical data-structure corruption (corrupt driver, bad RAM, or system files).',
    summaryFa: 'کرنل ویندوز دستکاری یا خرابی ساختار امنیتی حافظه را تشخیص داده (درایور معیوب، خرابی رم یا فایل‌های سیستمی).',
    actionEn: 'Run SFC / DISM integrity check, test RAM modules, and inspect recently updated drivers.',
    actionFa: 'اسکن SFC / DISM و تست RAM را اجرا کنید و درایورهای اخیر را بررسی نمایید.',
  },
};

export function decodeBsodStopCode(rawInput: string | number): BsodStopCodeInfo | null {
  if (rawInput === null || rawInput === undefined) return null;
  const text = String(rawInput).trim();
  if (!text) return null;

  let hexKey = '';
  const hexMatch = text.match(/\b0x([0-9a-fA-F]{1,8})\b/);
  if (hexMatch) {
    hexKey = `0x${hexMatch[1].toUpperCase().padStart(8, '0')}`;
  } else {
    const bugParamMatch = text.match(/BugcheckCode\s*[:=]\s*(\d+)/i) || (/^\d+$/.test(text) ? [text, text] : null);
    if (bugParamMatch) {
      const dec = Number(bugParamMatch[1]);
      if (Number.isFinite(dec) && dec > 0) {
        hexKey = `0x${(dec >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
      }
    }
  }

  if (!hexKey || hexKey === '0x00000000') {
    for (const info of Object.values(BSOD_STOP_CODE_CATALOG)) {
      if (text.toUpperCase().includes(info.symbolicName)) {
        return info;
      }
    }
    return null;
  }

  if (BSOD_STOP_CODE_CATALOG[hexKey]) {
    return BSOD_STOP_CODE_CATALOG[hexKey];
  }

  return {
    codeHex: hexKey,
    symbolicName: `STOP_${hexKey}`,
    category: 'bugcheck',
    summaryEn: `Kernel BugCheck Stop Code ${hexKey} recorded before forced restart.`,
    summaryFa: `کد توقف کرنل ${hexKey} هنگام کرش صفحه آبی و پیش از ری‌استارت ثبت شده است.`,
    actionEn: 'Inspect the matching Minidump (.dmp) file and recently installed drivers/Windows updates around this timestamp.',
    actionFa: 'فایل Minidump متناظر و درایورها یا آپدیت‌های نصب‌شده حوالی این زمان را بررسی کنید.',
  };
}

export function classifyBsodEventReason(ev: {
  eventId: number;
  source: string;
  level: string;
  message: string;
}): BsodReasonCategory | null {
  const id = Number(ev.eventId) || 0;
  const src = String(ev.source || '').toLowerCase();
  const msg = String(ev.message || '').toLowerCase();
  const combined = `${src} ${msg}`;

  if (
    (id === 1001 && /bugcheck|wer-systemerrorreporting|rebooted from a bugcheck|memory\.dmp|minidump/i.test(combined)) ||
    /bugcheck|stop\s*code|blue\s*screen|bsod|kernel\s*panic|memory\.dmp|minidump/i.test(combined)
  ) {
    return 'bugcheck';
  }
  if (/whea-logger|whea_uncorrectable|machine check|mce|hardware error/i.test(combined)) {
    return 'hardware_whea';
  }
  if (
    (src.includes('kernel-power') && id === 41) ||
    (src.includes('eventlog') && id === 6008) ||
    (src.includes('user32') && id === 1074)
  ) {
    return 'kernel_power';
  }
  if (
    /volmgr/i.test(src) ||
    ((/disk|stornvme|storahci|iastor|nvme|ntfs|atapi|ext4|xfs/i.test(combined)) &&
      ([7, 9, 11, 46, 49, 50, 51, 55, 129, 137, 153, 157, 161, 162].includes(id) ||
        /bad\s*block|i\/o\s*error|reset to device|did not respond|dump\s*file|ntfs/i.test(combined)))
  ) {
    return 'storage_dump';
  }
  if (
    /display|nvlddmkm|amdkmdag|igfx|atikmdag|tdr|drm|gpu/i.test(combined) ||
    /\b[a-z0-9_-]{2,32}\.sys\b/i.test(combined) ||
    /driver_irql|kmode_exception|system_service_exception|system_thread_exception|watchdog/i.test(combined)
  ) {
    return 'driver_gpu';
  }
  if (
    /resource-exhaustion|out of memory|oom|pagefile|virtual memory|memory_management|critical_process_died|service control manager/i.test(combined) ||
    [2004, 7000, 7001, 7009, 7023, 7024, 7031, 7034].includes(id)
  ) {
    return 'memory_os';
  }
  return null;
}

const REASON_META: Record<
  BsodReasonCategory,
  { titleEn: string; titleFa: string; descEn: string; descFa: string; severity: 'critical' | 'high' | 'medium' | 'info' }
> = {
  bugcheck: {
    titleEn: 'Kernel BugCheck / Stop Code (Direct BSOD Record)',
    titleFa: 'ثبت مستقیم خطای صفحه آبی (BugCheck / Stop Code)',
    descEn: 'Confirmed Windows BugCheck crash records containing Stop Codes or dump paths.',
    descFa: 'رویداد قطعی وقوع BSOD که کد Stop Code یا مسیر ذخیره Dump را مشخص می‌کند.',
    severity: 'critical',
  },
  hardware_whea: {
    titleEn: 'WHEA Hardware Faults (CPU / RAM / PCIe / Thermal)',
    titleFa: 'خطاهای سخت‌افزاری WHEA (پردازنده، رم، ولتاژ یا مادربرد)',
    descEn: 'Hardware-level machine check exceptions reported directly by CPU, cache, RAM, or PCIe.',
    descFa: 'گزارش خطای سخت‌افزاری مستقیم از پردازنده، حافظه رم یا گذرگاه PCIe پیش یا حین کرش.',
    severity: 'critical',
  },
  driver_gpu: {
    titleEn: 'Graphics & Kernel Driver Faults (.sys / GPU TDR)',
    titleFa: 'خطای درایورهای کرنل یا کارت گرافیک (.sys / GPU Reset)',
    descEn: 'Unresponsive display drivers or faulty kernel .sys drivers that trigger BSODs.',
    descFa: 'توقف یا باگ درایور کارت گرافیک، شبکه، وای‌فای یا فایل‌های .sys که عامل رایج صفحه آبی هستند.',
    severity: 'high',
  },
  storage_dump: {
    titleEn: 'Boot Disk, NVMe & Crash Dump Write Failures (volmgr / Disk)',
    titleFa: 'اختلال هارد/SSD و شکست ذخیره Dump (volmgr / Disk / NTFS)',
    descEn: 'Disk I/O timeouts, controller resets, NTFS damage, or volmgr dump creation failures.',
    descFa: 'تأخیر یا قطع ارتباط SSD/NVMe، خرابی NTFS یا شکست volmgr در ذخیره فایل Minidump.',
    severity: 'high',
  },
  kernel_power: {
    titleEn: 'Unexpected Power Loss / Unclean Reboots (Kernel-Power 41 / 6008)',
    titleFa: 'ری‌استارت ناگهانی و خاموشی غیراستاندارد (Kernel-Power 41 / 6008)',
    descEn: 'Tracks unclean power/reboot transitions and whether Kernel-Power 41 carried a BugcheckCode.',
    descFa: 'بررسی خاموشی‌های ناگهانی و مقدار BugcheckCode ثبت‌شده در رویداد Kernel-Power 41.',
    severity: 'high',
  },
  memory_os: {
    titleEn: 'RAM Exhaustion, OS Core Services & Critical Processes',
    titleFa: 'کمبود رم، فشار حافظه مجازی و کرش سرویس‌های حیاتی سیستم',
    descEn: 'Virtual memory exhaustion (ID 2004) or unexpected service/process termination (SCM).',
    descFa: 'پر شدن کامل RAM/Pagefile (کد 2004) یا توقف غیرمنتظره سرویس‌های اصلی ویندوز.',
    severity: 'medium',
  },
};

export function buildBsodAnalysis(params: {
  focusEnabled: boolean;
  events: Array<{
    eventId: number;
    source: string;
    level: string;
    rawMessage: string;
    bsodReason?: BsodReasonCategory | null;
    bugcheckCodeRaw?: string | number;
  }>;
  dumpFiles?: BsodDumpFileInfo[];
  crashControl?: BsodCrashControlInfo | null;
}): BsodAnalysisResult {
  const bucketMap = new Map<BsodReasonCategory, BsodReasonBucket>();
  const stopCodeMap = new Map<string, BsodStopCodeInfo>();
  const driverSet = new Set<string>();

  for (const ev of params.events) {
    const reason = ev.bsodReason || classifyBsodEventReason({
      eventId: ev.eventId,
      source: ev.source,
      level: ev.level,
      message: ev.rawMessage,
    });
    if (reason) {
      const meta = REASON_META[reason];
      const existing = bucketMap.get(reason);
      if (existing) {
        existing.count += 1;
        if (!existing.sampleEventIds.includes(ev.eventId) && existing.sampleEventIds.length < 6) {
          existing.sampleEventIds.push(ev.eventId);
        }
      } else {
        bucketMap.set(reason, {
          reason,
          titleEn: meta.titleEn,
          titleFa: meta.titleFa,
          descriptionEn: meta.descEn,
          descriptionFa: meta.descFa,
          severity: meta.severity,
          count: 1,
          sampleEventIds: [ev.eventId],
        });
      }
    }

    const decodedFromRaw = ev.bugcheckCodeRaw ? decodeBsodStopCode(ev.bugcheckCodeRaw) : null;
    const decodedFromMsg = decodeBsodStopCode(ev.rawMessage);
    for (const sc of [decodedFromRaw, decodedFromMsg]) {
      if (sc && !stopCodeMap.has(sc.codeHex)) {
        stopCodeMap.set(sc.codeHex, sc);
      }
    }

    const sysMatches = String(ev.rawMessage || '').match(/\b[a-zA-Z0-9_-]{2,40}\.sys\b/gi) || [];
    for (const drv of sysMatches) {
      driverSet.add(drv);
      if (driverSet.size >= 12) break;
    }
  }

  const order: BsodReasonCategory[] = ['bugcheck', 'hardware_whea', 'driver_gpu', 'storage_dump', 'kernel_power', 'memory_os'];
  const reasonBuckets = order
    .map((r) => bucketMap.get(r))
    .filter((b): b is BsodReasonBucket => Boolean(b));

  const stopCodes = Array.from(stopCodeMap.values());
  const suspectedDrivers = Array.from(driverSet);
  const dumpFiles = Array.isArray(params.dumpFiles) ? params.dumpFiles : [];
  const totalClueEvents = reasonBuckets.reduce((acc, b) => acc + b.count, 0);
  const bsodDetected = Boolean(
    bucketMap.has('bugcheck') ||
    stopCodes.length > 0 ||
    dumpFiles.length > 0 ||
    bucketMap.has('hardware_whea') ||
    (bucketMap.has('kernel_power') && (bucketMap.get('kernel_power')!.count > 0))
  );

  let verdictTitleEn = 'No Blue Screen (BSOD) Indicators Detected';
  let verdictTitleFa = 'هیچ نشانه قطعی از صفحه آبی (BSOD) در بازه انتخابی یافت نشد';
  let verdictSummaryEn =
    'No BugCheck (1001), WHEA hardware faults, crash minidumps, or sudden power/storage failure clues appeared in the scanned window.';
  let verdictSummaryFa =
    'در بازه زمانی اسکن‌شده، رویداد BugCheck (1001)، خطای سخت‌افزاری WHEA، فایل Minidump یا کرش ناگهانی یافت نشد.';

  if (stopCodes.length > 0) {
    const primary = stopCodes[0];
    verdictTitleEn = `Stop Code Identified: ${primary.symbolicName} (${primary.codeHex})`;
    verdictTitleFa = `کد خطای صفحه آبی شناسایی شد: ${primary.symbolicName} (${primary.codeHex})`;
    verdictSummaryEn = `${primary.summaryEn} Recommended: ${primary.actionEn}`;
    verdictSummaryFa = `${primary.summaryFa} اقدام پیشنهادی: ${primary.actionFa}`;
  } else if (bucketMap.has('hardware_whea')) {
    verdictTitleEn = 'Likely Hardware Fault Triggering Crash / BSOD (WHEA-Logger)';
    verdictTitleFa = 'احتمال بالای نقص سخت‌افزاری (WHEA: پردازنده / رم / تغذیه یا دما)';
    verdictSummaryEn = 'WHEA-Logger reported hardware-level errors around the crash window. Check cooling, RAM health, BIOS, and power stability.';
    verdictSummaryFa = 'خطاهای سخت‌افزاری WHEA در سیستم ثبت شده‌اند؛ دما، سلامت RAM، بایوس و پایداری تغذیه سیستم باید بررسی شود.';
  } else if (bucketMap.has('storage_dump')) {
    verdictTitleEn = 'Storage Controller / Dump Creation Failure Around Crash (volmgr / Disk)';
    verdictTitleFa = 'احتمال قطعی/کندی SSD یا هارد و شکست ذخیره Dump هنگام کرش';
    verdictSummaryEn = 'Storage/volmgr events show disk timeouts or failure to write crash dumps (often causing sudden freezes or 0xF4/0x7B BSODs).';
    verdictSummaryFa = 'خطاهای volmgr یا کنترلر دیسک نشان می‌دهد هنگام کرش ارتباط با SSD/HDD دچار اختلال شده یا فضای درایو C کافی نبوده است.';
  } else if (bucketMap.has('driver_gpu')) {
    verdictTitleEn = 'Display / Kernel Driver Reset or Hang Clues Found';
    verdictTitleFa = 'شواهد کرش یا ریست درایور گرافیک / درایورهای کرنل یافت شد';
    verdictSummaryEn = 'Graphics or .sys driver resets/faults appeared in the log window — update GPU, chipset, and network drivers.';
    verdictSummaryFa = 'خطا یا ریست درایور گرافیک یا فایل‌های .sys در لاگ ثبت شده است — بروزرسانی درایورهای گرافیک و چیپ‌ست توصیه می‌شود.';
  } else if (bucketMap.has('kernel_power')) {
    verdictTitleEn = 'Unclean Shutdown / Reboot Recorded (Kernel-Power 41 / 6008)';
    verdictTitleFa = 'خاموشی یا ری‌استارت ناگهانی سیستم ثبت شده است (Kernel-Power 41 / 6008)';
    verdictSummaryEn =
      dumpFiles.length > 0
        ? `Kernel-Power events paired with ${dumpFiles.length} Minidump file(s) confirm an abrupt crash/reboot.`
        : 'System rebooted without clean shutdown and no BugcheckCode was written — check power supply/UPS/battery, thermal shutdown, or forced power-button reset.';
    verdictSummaryFa =
      dumpFiles.length > 0
        ? `رویداد Kernel-Power همراه با ${dumpFiles.length} فایل Minidump کرش ناگهانی را تایید می‌کند.`
        : 'سیستم بدون Shutdown استاندارد خاموش شده و BugcheckCode ثبت نشده است (معمولاً قطع ناگهانی برق، خرابی باتری/پاور یا خاموش کردن دستی با دکمه پاور).';
  }

  return {
    focusEnabled: params.focusEnabled,
    bsodDetected,
    totalClueEvents,
    verdictTitleEn,
    verdictTitleFa,
    verdictSummaryEn,
    verdictSummaryFa,
    stopCodes,
    suspectedDrivers,
    reasonBuckets,
    dumpFiles,
    crashControl: params.crashControl ?? null,
  };
}

