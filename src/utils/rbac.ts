import {
  AccessPolicy,
  ServerActionKey,
  ServerActionPermissions,
  NetworkDeviceActionKey,
  NetworkDeviceActionPermissions,
} from '../types';

export interface ServerActionDescriptor {
  key: ServerActionKey;
  labelEn: string;
  labelFa: string;
  shortLabelEn?: string;
  shortLabelFa?: string;
  descriptionEn: string;
  descriptionFa: string;
  category: 'remote' | 'management' | 'power' | 'config';
  danger?: boolean;
  tooltipWhatEn?: string;
  tooltipWhatFa?: string;
  tooltipWhyEn?: string;
  tooltipWhyFa?: string;
  tooltipExampleEn?: string;
  tooltipExampleFa?: string;
}

export interface NetworkDeviceActionDescriptor {
  key: NetworkDeviceActionKey;
  labelEn: string;
  labelFa: string;
  shortLabelEn?: string;
  shortLabelFa?: string;
  descriptionEn: string;
  descriptionFa: string;
  category: 'remote' | 'management' | 'config' | 'port' | 'danger';
  platform?: 'all' | 'cisco' | 'mikrotik';
  danger?: boolean;
  tooltipWhatEn?: string;
  tooltipWhatFa?: string;
  tooltipWhyEn?: string;
  tooltipWhyFa?: string;
  tooltipExampleEn?: string;
  tooltipExampleFa?: string;
}

export const DEVICE_ACTIONS_CATALOG: NetworkDeviceActionDescriptor[] = [
  {
    key: 'web_configs',
    labelEn: 'Web Consoles & GUI Management',
    labelFa: 'کنسول‌های وب و مدیریت (WebFig, iLO, Web GUI)',
    shortLabelEn: 'Web GUI',
    shortLabelFa: 'کنسول وب',
    descriptionEn: 'Access external and in-browser HTTP/HTTPS device web consoles and out-of-band management.',
    descriptionFa: 'دسترسی به کنسول‌ها و رابط‌های وب مدیریتی تجهیزات نظیر WebFig میکروتیک، iLO، ESXi و پنل وب سوییچ‌ها.',
    category: 'remote',
    platform: 'all',
    danger: false,
    tooltipWhatEn: 'Direct access to external and in-browser HTTP/HTTPS web configuration consoles (WebFig, Cisco Web GUI, iLO/iDRAC).',
    tooltipWhatFa: 'دسترسی به کنسول‌های وب و رابط‌های گرافیکی مدیریت تجهیزات نظیر WebFig میکروتیک، پنل وب سیسکو و کنسول‌های مدیریت iLO.',
    tooltipWhyEn: 'Enables browser-based administration without opening shell consoles; recommended for staff who do not need full CLI.',
    tooltipWhyFa: 'امکان مدیریت تجهیزات از طریق مرورگر را بدون نیاز به ورود به شل و خط فرمان تعاملی فراهم می‌کند.',
    tooltipExampleEn: 'Grant to Helpdesk to access WebFig dashboard on branch routers.',
    tooltipExampleFa: 'اعطا به پرسنل پشتیبانی جهت بررسی داشبورد WebFig روترهای شعب.',
  },
  {
    key: 'terminal',
    labelEn: 'SSH Direct Console (CLI Terminal)',
    labelFa: 'ترمینال شل تعاملی (کنسول مستقیم SSH)',
    shortLabelEn: 'Terminal',
    shortLabelFa: 'ترمینال',
    descriptionEn: 'Interactive direct SSH terminal console session into Cisco IOS, MikroTik, or network appliances.',
    descriptionFa: 'برقراری اتصال مستقیم و تعاملی خط فرمان (CLI Terminal) به تجهیز جهت مدیریت مستقیم و صدور دستورات.',
    category: 'remote',
    platform: 'all',
    danger: true,
    tooltipWhatEn: 'Direct interactive command-line access via SSH to the device operating system shell.',
    tooltipWhatFa: 'دسترسی مستقیم و تعاملی به خط فرمان و کنسول SSH سیستم‌عامل تجهیز شبکه.',
    tooltipWhyEn: 'High-privilege capability permitting execution of any system command; should be strictly restricted to certified engineers.',
    tooltipWhyFa: 'سطح دسترسی بالا برای اجرای دستورات سیستمی و تغییرات اساسی؛ باید منحصراً به مهندسان متخصص محدود شود.',
    tooltipExampleEn: 'Grant to Network Core Administrators; prohibit for Helpdesk and NOC observers.',
    tooltipExampleFa: 'اعطا به مدیران ارشد شبکه و مسدودسازی برای کارشناسان پایش NOC و هلپ‌دسک.',
  },
  {
    key: 'apply_template',
    labelEn: 'Apply Config Template',
    labelFa: 'اعمال تمپلیت و الگوی کانفیگ',
    shortLabelEn: 'Template',
    shortLabelFa: 'تمپلیت',
    descriptionEn: 'Deploy structured configuration templates with dynamic variable substitutions to the device.',
    descriptionFa: 'اجرا و اعمال الگوهای پیکربندی، جایگذاری متغیرها و استقرار خودکار دستورات بر روی تجهیز شبکه.',
    category: 'config',
    platform: 'all',
    danger: true,
    tooltipWhatEn: 'Deploy structured configuration templates with dynamic parameter substitutions directly to the device.',
    tooltipWhatFa: 'اجرا و اعمال الگوهای پیکربندی استاندارد همراه با جایگذاری متغیرهای پویا روی تجهیز.',
    tooltipWhyEn: 'Standardizes deployment parameters and eliminates syntax mistakes during routine interface or VLAN provisioning.',
    tooltipWhyFa: 'جلوگیری از خطاهای انسانی و استانداردسازی تنظیمات VLAN، اکسس‌لیست‌ها و اینترفیس در سطح شبکه.',
    tooltipExampleEn: 'Grant to Provisioning Engineers to configure standard access switches.',
    tooltipExampleFa: 'اعطا به کارشناسان استقرار برای پیاده‌سازی سریع سوییچ‌های جدید لایه دسترسی.',
  },
  {
    key: 'device_note',
    labelEn: 'Sticky Notes & Operational Memos',
    labelFa: 'یادداشت‌های چسبان و نکات عملیاتی',
    shortLabelEn: 'Notes',
    shortLabelFa: 'یادداشت',
    descriptionEn: 'Create, view, and modify persistent operational notes and handover comments attached to this device.',
    descriptionFa: 'ثبت، مشاهده و ویرایش یادداشت‌های چسبان و نکات فنی پیوست‌شده به این تجهیز در سیستم.',
    category: 'management',
    platform: 'all',
    danger: false,
    tooltipWhatEn: 'Create, view, and modify persistent operational notes, circuit IDs, and handover comments attached to this device.',
    tooltipWhatFa: 'ثبت، مشاهده و ویرایش یادداشت‌های چسبان، شماره مدارها و نکات تحویل شیفت متصل به تجهیز.',
    tooltipWhyEn: 'Maintains critical operational knowledge across shift teams without making any configuration change on the hardware.',
    tooltipWhyFa: 'مستندسازی وضعیت، تغییرات اخیر و هشدارهای نگهداری برای سایر همکاران بدون ریسک تغییر در کانفیگ.',
    tooltipExampleEn: 'Helpdesk records: Port 24 reserved for secondary WAN failover test.',
    tooltipExampleFa: 'ثبت یادداشت: پورت ۲۴ برای تست خط پشتیبان دوم رزرو شده است.',
  },
  {
    key: 'edit_properties',
    labelEn: 'Edit Device Properties',
    labelFa: 'ویرایش مشخصات و اطلاعات تجهیز',
    shortLabelEn: 'Edit Info',
    shortLabelFa: 'ویرایش مشخصات',
    descriptionEn: 'Update device hostname, management IP address, role, physical location, credentials, and tags.',
    descriptionFa: 'ویرایش نام میزبان، آدرس IP مدیریتی، نقش، مکان فیزیکی، اطلاعات کاربری اتصال و برچسب‌های دستگاه.',
    category: 'config',
    platform: 'all',
    danger: true,
    tooltipWhatEn: 'Update device inventory metadata including hostname, management IP, model, role, rack location, and credentials.',
    tooltipWhatFa: 'ویرایش نام میزبان، آدرس IP مدیریتی، نقش، مکان فیزیکی، اطلاعات کاربری اتصال و برچسب‌های دستگاه.',
    tooltipWhyEn: 'Protects fleet management integrity; altering IP addresses or credentials incorrectly causes management loss.',
    tooltipWhyFa: 'حفظ صحت اطلاعات ناوگان؛ تغییر اشتباه IP یا پسورد ارتباط سیستم مانیتورینگ را قطع می‌کند.',
    tooltipExampleEn: 'Restricted to Infrastructure Leads and Hardware Asset Managers.',
    tooltipExampleFa: 'محدود به مدیران زیرساخت شبکه برای جابجایی رک و تغییر اطلاعات اتصال.',
  },
  {
    key: 'ping_keepalive',
    labelEn: 'Ping & Keepalive Telemetry',
    labelFa: 'تست پینگ و تاخیر لحظه‌ای (ICMP)',
    shortLabelEn: 'Ping',
    shortLabelFa: 'تست پینگ',
    descriptionEn: 'Trigger real-time ICMP ping echo, round-trip latency measurement, and reachability validation.',
    descriptionFa: 'ارسال درخواست‌های تست پینگ ICMP، سنجش تاخیر رفت و برگشت (Latency) و پایش سلامت اتصال آنلاین تجهیز.',
    category: 'management',
    platform: 'all',
    danger: false,
    tooltipWhatEn: 'Trigger real-time ICMP ping echo packets, round-trip latency measurement, and reachability checks.',
    tooltipWhatFa: 'ارسال درخواست‌های تست پینگ ICMP، سنجش زمان تاخیر رفت و برگشت و پایش سلامت اتصال آنلاین.',
    tooltipWhyEn: 'Non-disruptive, safe telemetry check for diagnosing link quality without altering device state.',
    tooltipWhyFa: 'ابزار سنجش سلامت و عیب‌یابی ایمن که هیچ‌گونه تغییری در عملکرد تجهیز ایجاد نمی‌کند.',
    tooltipExampleEn: 'Enabled for all operator roles including NOC observers and Helpdesk staff.',
    tooltipExampleFa: 'فعال برای تمامی نقش‌ها از جمله اپراتورهای مرکز عملیات شبکه (NOC).',
  },
  {
    key: 'inspect_ports',
    labelEn: 'Inspect Interfaces & VLANs',
    labelFa: 'مشاهده وضعیت پورت‌ها و VLAN',
    shortLabelEn: 'Inspect Ports',
    shortLabelFa: 'پایش پورت‌ها',
    descriptionEn: 'Inspect port interface telemetry, operational link states, duplex, and assigned VLAN memberships.',
    descriptionFa: 'مشاهده و بررسی وضعیت پورت‌های فیزیکی، لینک‌های فعال، تخصیص VLAN و مشخصات تلمتری اینترفیس‌ها.',
    category: 'management',
    platform: 'all',
    danger: false,
    tooltipWhatEn: 'Inspect physical port interface telemetry, link status (Up/Down), speed, duplex, and VLAN memberships.',
    tooltipWhatFa: 'مشاهده و بررسی وضعیت پورت‌های فیزیکی، وضعیت لینک (Up/Down)، سرعت و VLANهای متصل.',
    tooltipWhyEn: 'Enables troubleshooting client connectivity and interface link issues without granting write/modify privileges.',
    tooltipWhyFa: 'امکان مشاهده اتصالات کاربران و لینک‌های ورودی/خروجی بدون ریسک دستکاری در تنظیمات پورت.',
    tooltipExampleEn: 'Granted to Helpdesk to check whether a user PC port is physically Up or Down.',
    tooltipExampleFa: 'اعطا به تیم پشتیبانی جهت بررسی بالا یا پایین بودن لینک کلاینت‌های اداری.',
  },
  {
    key: 'write_memory',
    labelEn: 'Save to NVRAM (Write Memory)',
    labelFa: 'ذخیره در حافظه پایدار (Write Memory)',
    shortLabelEn: 'Write Memory',
    shortLabelFa: 'ذخیره در حافظه',
    descriptionEn: 'Commit running configuration to non-volatile startup storage (copy running-config startup-config).',
    descriptionFa: 'ذخیره‌سازی و تثبیت پیکربندی جاری در حافظه پایدار تجهیز جهت حفظ تنظیمات پس از راه‌اندازی مجدد.',
    category: 'config',
    platform: 'all',
    danger: true,
    tooltipWhatEn: 'Commit current running configuration to non-volatile startup storage (Cisco copy run start / write memory).',
    tooltipWhatFa: 'ذخیره‌سازی و تثبیت پیکربندی جاری در حافظه پایدار (NVRAM) جهت پایداری پس از ریبوت.',
    tooltipWhyEn: 'Unsaved changes are lost on reboot, while saving flawed configs makes mistakes permanent across power cycles.',
    tooltipWhyFa: 'حفظ تنظیمات پس از خاموش و روشن شدن؛ ذخیره کانفیگ نادرست خطاهای شبکه را پایدار می‌کند.',
    tooltipExampleEn: 'Granted to Senior Network Engineers after completing change approvals.',
    tooltipExampleFa: 'منحصراً برای ادمین‌های باسابقه شبکه پس از اطمینان کامل از درستی تغییرات اعمال‌شده.',
  },
  {
    key: 'delete_device',
    labelEn: 'Delete Device from System',
    labelFa: 'حذف تجهیز از سیستم و شبکه',
    shortLabelEn: 'Delete',
    shortLabelFa: 'حذف تجهیز',
    descriptionEn: 'Permanently remove this device, linked port connections, and topology map references from the system.',
    descriptionFa: 'حذف کامل و دائمی این تجهیز، اتصالات پورت‌ها و رکوردهای پایگاه داده از کل پنل مدیریت شبکه.',
    category: 'danger',
    platform: 'all',
    danger: true,
    tooltipWhatEn: 'Permanently delete the device record, historical telemetry, and port connections from the database.',
    tooltipWhatFa: 'حذف کامل و دائمی این تجهیز، اتصالات پورت‌ها و رکوردهای پایگاه داده از کل سیستم.',
    tooltipWhyEn: 'Destructive operation affecting topology diagrams and telemetry archives; should be strictly constrained.',
    tooltipWhyFa: 'عملیات مخرب و غیرقابل بازگشت که منجر به از دست رفتن تاریخچه و ارتباطات توپولوژی می‌شود.',
    tooltipExampleEn: 'Strictly limited to Super Administrators during equipment decommissioning.',
    tooltipExampleFa: 'منحصراً مجاز برای سوپرادمین‌ها هنگام از رده خارج کردن نهایی سخت‌افزار.',
  },
  {
    key: 'export_devices',
    labelEn: 'Export Device & Inventory Data (JSON / CSV)',
    labelFa: 'خروجی گرفتن از اطلاعات و مشخصات تجهیزات (Export)',
    shortLabelEn: 'Export',
    shortLabelFa: 'خروجی اکسپورت',
    descriptionEn: 'Export device hardware configuration, IPs, VLANs, and inventory specifications to JSON or CSV.',
    descriptionFa: 'دریافت خروجی ساختاریافته (JSON و CSV) از مشخصات فنی، پورت‌ها، VLANها و شناسنامه تجهیزات.',
    category: 'management',
    platform: 'all',
    danger: false,
    tooltipWhatEn: 'Permits generating and downloading structured export files (JSON, CSV) for individual or batch network equipment.',
    tooltipWhatFa: 'مجوز استخراج و دانلود فایل‌های گزارش و داده‌های ساختاریافته (JSON و CSV) به صورت تکی یا دسته‌ای از تجهیزات.',
    tooltipWhyEn: 'Protects proprietary network addressing, topologies, and inventory data against unauthorized bulk extraction or exfiltration.',
    tooltipWhyFa: 'جلوگیری از درز اطلاعات حساس آدرس‌دهی، معماری شبکه و مشخصات محرمانه تجهیزات توسط کاربران فاقد صلاحیت.',
    tooltipExampleEn: 'Granted to Network Auditors and IT Asset Managers; restricted for regular Helpdesk staff.',
    tooltipExampleFa: 'اعطا به ممیزان شبکه و مدیران دارایی‌های IT؛ مسدود برای پرسنل پشتیبانی عمومی.',
  },
  {
    key: 'import_devices',
    labelEn: 'Import Network Equipment (Single & Batch)',
    labelFa: 'ورود و بارگذاری تجهیزات شبکه (Import تکی و دسته‌ای)',
    shortLabelEn: 'Import',
    shortLabelFa: 'ورود تجهیزات',
    descriptionEn: 'Import single or bulk network equipment records, hardware configurations, and IP specifications via JSON or CSV.',
    descriptionFa: 'ثبت و بارگذاری تکی یا دسته‌ای تجهیزات شبکه، شناسنامه سخت‌افزاری و مشخصات IP از طریق فایل یا متن JSON و CSV.',
    category: 'management',
    platform: 'all',
    danger: false,
    tooltipWhatEn: 'Permits importing single or bulk network equipment records into the inventory catalog via JSON or CSV files or raw text.',
    tooltipWhatFa: 'مجوز بارگذاری و ثبت مشخصات تجهیزات شبکه به صورت تکی یا دسته‌ای از طریق فایل‌های JSON یا CSV یا متن مستقیم.',
    tooltipWhyEn: 'Enforces strict change control so only authorized administrators can register or bulk-update network switches and routers.',
    tooltipWhyFa: 'اعمال کنترل دقیق تغییرات تا فقط مدیران مجاز بتوانند تجهیزات جدید را به صورت تکی یا گروهی وارد انبار شبکه کنند.',
    tooltipExampleEn: 'Granted to Network Engineers and Inventory Provisioners; strictly restricted for viewer and operator roles.',
    tooltipExampleFa: 'اعطا به مهندسین شبکه و مسئولین تامین تجهیزات؛ مسدود برای کاربران اپراتور عادی یا ناظر.',
  },
  {
    key: 'add_device',
    labelEn: 'Introduce New Device (Inventory Registration)',
    labelFa: 'معرفی و ثبت تجهیز جدید در انبار تجهیزات',
    shortLabelEn: 'Add Device',
    shortLabelFa: 'معرفی تجهیز',
    descriptionEn: 'Permits subject to click "Introduce New Device" to register and onboard network switches and routers into their inventory.',
    descriptionFa: 'مجوز کلیک روی دکمه «معرفی تجهیز جدید» جهت ثبت مستقل سوییچ‌ها و روترهای شبکه در پنل مدیریت تجهیزات.',
    category: 'management',
    platform: 'all',
    danger: false,
    tooltipWhatEn: 'Authority to use the "Introduce New Device" modal button to add and register new network equipment.',
    tooltipWhatFa: 'اختیار کلیک بر روی دکمه معرفی تجهیز جدید جهت ثبت و آنبوردینگ تجهیزات شبکه.',
    tooltipWhyEn: 'Allows delegated engineers to add new hardware for themselves without exposing global administrative settings.',
    tooltipWhyFa: 'امکان اضافه کردن تجهیزات شبکه توسط کاربر برای خود بدون نیاز به دسترسی‌های سطح بالای مدیریتی.',
    tooltipExampleEn: 'Granted to Site Provisioning Technicians and Network Engineers.',
    tooltipExampleFa: 'اعطا به تکنسین‌های راه‌اندازی و مهندسان شبکه جهت ثبت تجهیزات شعب.',
  },

  // -------------------------------------------------------------
  // Granular Port & Interface Operations (Cisco & MikroTik)
  // -------------------------------------------------------------
  {
    key: 'port_power',
    labelEn: 'Port Power (Shutdown / Enable)',
    labelFa: 'روشن/خاموش کردن پورت (Shutdown / Enable)',
    shortLabelEn: 'Power',
    shortLabelFa: 'روشن/خاموش',
    descriptionEn: 'Administratively enable or shutdown interfaces (Cisco shutdown / no shutdown, MikroTik disabled=yes/no).',
    descriptionFa: 'تغییر وضعیت اداری اینترفیس‌ها، خاموش کردن (Shutdown) یا فعال‌سازی (No Shutdown / Enable) پورت‌ها.',
    category: 'port',
    platform: 'all',
    danger: true,
    tooltipWhatEn: 'Toggles interface administrative state: Cisco shutdown / no shutdown and MikroTik /interface set disabled=yes/no.',
    tooltipWhatFa: 'تغییر وضعیت اداری پورت: دستورات shutdown/no shutdown در سیسکو و فعال/غیرفعال‌سازی در میکروتیک.',
    tooltipWhyEn: 'Shutting down an active port instantly severs traffic for connected clients, servers, or critical network uplinks.',
    tooltipWhyFa: 'خاموش کردن یک اینترفیس بلافاصله ارتباط کلاینت، سرور یا خطوط آپ‌لینک شبکه را قطع می‌کند.',
    tooltipExampleEn: 'Permit on Access switches for isolating hosts; strictly prohibit on Core and Distribution switches.',
    tooltipExampleFa: 'مجاز روی سوییچ‌های دسترسی برای قطع کلاینت‌های مشکوک؛ اکیداً ممنوع روی سوییچ‌های Core.',
  },
  {
    key: 'port_mode',
    labelEn: 'Switchport Mode (Trunk / Access)',
    labelFa: 'تغییر مود پورت سیسکو (Trunk / Access)',
    shortLabelEn: 'Trunk / Access',
    shortLabelFa: 'مد ترانک/اکسس',
    descriptionEn: 'Switch interface operation mode between Access port (untagged end-host) and 802.1Q Trunk.',
    descriptionFa: 'تغییر حالت کاری پورت سوئیچ سیسکو بین حالت دسترسی (Access) و ترانک (802.1Q Trunk).',
    category: 'port',
    platform: 'cisco',
    danger: true,
    tooltipWhatEn: 'Configures Cisco switchport operational mode between Access (untagged end-host) and Trunk (802.1Q tagged uplink).',
    tooltipWhatFa: 'تغییر مد پورت سیسکو بین حالت دسترسی میزبان (Access) و ترانک چند VLANای (Trunk).',
    tooltipWhyEn: 'Mismatched port modes break VLAN isolation or create Layer 2 loops and broadcast storms.',
    tooltipWhyFa: 'تنظیم اشتباه مد ترانک روی پورت کلاینت یا اکسس روی آپ‌لینک ارتباطات را مختل یا دچار لوپ می‌کند.',
    tooltipExampleEn: 'Restricted to Senior Network Engineers; deny for Helpdesk operators.',
    tooltipExampleFa: 'منحصراً برای مهندسان ارشد شبکه؛ مسدود برای پرسنل پشتیبانی عمومی.',
  },
  {
    key: 'port_vlan',
    labelEn: 'VLAN & Bridge PVID Assignment',
    labelFa: 'تخصیص و تغییر VLAN و PVID',
    shortLabelEn: 'VLAN / PVID',
    shortLabelFa: 'تغییر VLAN',
    descriptionEn: 'Assign access VLAN IDs, configure native VLANs, and update MikroTik bridge PVID memberships.',
    descriptionFa: 'تخصیص VLANهای دسترسی و تغییر شناسه‌های PVID در بریج میکروتیک و سوییچ‌های سیسکو.',
    category: 'port',
    platform: 'all',
    danger: true,
    tooltipWhatEn: 'Sets Cisco switchport access VLAN ID and modifies MikroTik bridge port PVID and frame tagging.',
    tooltipWhatFa: 'تنظیم شماره VLAN دسترسی در سیسکو و PVID پورت بریج در میکروتیک.',
    tooltipWhyEn: 'Determines which broadcast domain, IP subnet, and firewall security zone the connected device enters.',
    tooltipWhyFa: 'تعیین‌کننده ساب‌نت IP و محدوده دسترسی کاربر به منابع سازمانی و اینترنت است.',
    tooltipExampleEn: 'Permitted for Helpdesk on desktop access ports to move users between departmental VLANs.',
    tooltipExampleFa: 'مجاز برای کارشناسان پشتیبانی جهت تغییر VLAN کاربران اداری بین بخش‌های شرکت.',
  },
  {
    key: 'port_security',
    labelEn: 'Port Security (Cisco IOS)',
    labelFa: 'امنیت پورت سیسکو (Port Security)',
    shortLabelEn: 'Port Security',
    shortLabelFa: 'امنیت پورت',
    descriptionEn: 'Enable or disable MAC address limits, sticky MAC learning, and violation shutdown policies.',
    descriptionFa: 'فعال‌سازی یا غیرفعال‌سازی محدودیت آدرس‌های MAC، قابلیت Sticky MAC و پالیسی‌های مسدودسازی پورت در سیسکو.',
    category: 'port',
    platform: 'cisco',
    danger: false,
    tooltipWhatEn: 'Enable or disable MAC address limits, sticky MAC learning, and violation shutdown policies on Cisco IOS.',
    tooltipWhatFa: 'فعال‌سازی یا غیرفعال‌سازی محدودیت آدرس‌های MAC، یادگیری Sticky MAC و پالیسی‌های مسدودسازی سیسکو.',
    tooltipWhyEn: 'Prevents rogue switches, MAC flooding attacks, and unauthorized devices from connecting to wall ports.',
    tooltipWhyFa: 'جلوگیری از اتصال سوییچ‌های غیرمجاز و حملات جعل یا پر کردن جدول مک‌آدرس در لایه دسترسی.',
    tooltipExampleEn: 'Enabled on wall outlets in conference rooms, reception desks, and visitor areas.',
    tooltipExampleFa: 'فعال‌سازی روی پریزهای شبکه اتاق جلسات و فضاهای عمومی جهت جلوگیری از اتصال غیرمجاز.',
  },
  {
    key: 'port_description',
    labelEn: 'Port Description & Comments',
    labelFa: 'توضیحات و یادداشت پورت (Description / Comment)',
    shortLabelEn: 'Description',
    shortLabelFa: 'توضیحات',
    descriptionEn: 'Update descriptive interface labels, connected endpoint names, and RouterOS port comments.',
    descriptionFa: 'تنظیم توضیحات پورت (Cisco Description) و یادداشت‌های اینترفیس میکروتیک (RouterOS Comment).',
    category: 'port',
    platform: 'all',
    danger: false,
    tooltipWhatEn: 'Update descriptive interface labels on Cisco (description ...) and RouterOS interface comments.',
    tooltipWhatFa: 'تنظیم برچسب‌های متنی روی پورت سیسکو (Description) و کامنت‌های اینترفیس میکروتیک.',
    tooltipWhyEn: 'Maintains patch panel cross-connect mapping and documentation without disrupting packet forwarding.',
    tooltipWhyFa: 'مستندسازی شماره پریز، نام کلاینت و مسیر پچ‌پنل بدون کوچک‌ترین ریسک قطعی یا اختلال در شبکه.',
    tooltipExampleEn: 'Safe and recommended to grant to Helpdesk and Field Technicians.',
    tooltipExampleFa: 'ایمن و مناسب جهت اعطا به نیروهای پشتیبانی برای نام‌گذاری پورت‌های پچ‌شده جدید.',
  },
  {
    key: 'port_bridge',
    labelEn: 'Bridge Membership (MikroTik)',
    labelFa: 'عضویت در بریج میکروتیک (Bridge Port)',
    shortLabelEn: 'Bridge Port',
    shortLabelFa: 'بریج میکروتیک',
    descriptionEn: 'Add or remove Ethernet interfaces to/from RouterOS bridge domains (bridge port add/remove).',
    descriptionFa: 'افزودن یا خارج کردن پورت‌های اترنت از بریج میکروتیک (RouterOS Bridge Port).',
    category: 'port',
    platform: 'mikrotik',
    danger: true,
    tooltipWhatEn: 'Add or remove RouterOS Ethernet interfaces to/from software bridges (L2 switching domain).',
    tooltipWhatFa: 'افزودن اینترفیس به بریج لایه ۲ میکروتیک یا خارج کردن آن به عنوان پورت مستقل لایه ۳.',
    tooltipWhyEn: 'Removing a port from a bridge disconnects Layer 2 switching and DHCP forwarding for connected hosts.',
    tooltipWhyFa: 'خارج کردن پورت از بریج سوئیچینگ محلی و دریافت IP توسط کلاینت‌ها را متوقف می‌سازد.',
    tooltipExampleEn: 'Restricted to Certified MikroTik Network Administrators.',
    tooltipExampleFa: 'محدود به کارشناسان مسلط به روتروس میکروتیک جهت تغییرات ساختار بریج.',
  },
  {
    key: 'port_speed',
    labelEn: 'Speed, Duplex & Auto-Negotiation',
    labelFa: 'سرعت، دوبلکس و Auto-Negotiation',
    shortLabelEn: 'Speed / Duplex',
    shortLabelFa: 'سرعت/دوبلکس',
    descriptionEn: 'Configure interface transmission speed (100M, 1G, 10G), full/half duplex, or auto-negotiation.',
    descriptionFa: 'پیکربندی نرخ انتقال داده، حالت Full/Half Duplex و تطبیق خودکار (Auto-Negotiation) پورت.',
    category: 'port',
    platform: 'mikrotik',
    danger: true,
    tooltipWhatEn: 'Configure interface transmission speed (100M, 1G, 10G), full/half duplex, or auto-negotiation.',
    tooltipWhatFa: 'پیکربندی نرخ انتقال داده (100Mbps یا 1Gbps)، حالت Full/Half Duplex و تطبیق خودکار پورت.',
    tooltipWhyEn: 'Mismatched speed or duplex settings cause frame errors, high latency, and intermittent link flapping.',
    tooltipWhyFa: 'ناسازگاری سرعت یا دوبلکس باعث افت بسته‌ها، خطاهای CRC و قطع و وصل مداوم لینک می‌شود.',
    tooltipExampleEn: 'Used by engineers to lock speed on legacy industrial equipment or fiber transceivers.',
    tooltipExampleFa: 'استفاده توسط مهندسان برای تثبیت سرعت هنگام اتصال به تجهیزات قدیمی صنعتی یا ماژول‌های فیبر.',
  },
  {
    key: 'port_cable_test',
    labelEn: 'TDR Cable Diagnostic Test',
    labelFa: 'تست و عیب‌یابی کابل شبکه (TDR Test)',
    shortLabelEn: 'Cable Test',
    shortLabelFa: 'تست کابل',
    descriptionEn: 'Execute Time Domain Reflectometry (TDR) diagnostics to measure cable pair health, length, and faults.',
    descriptionFa: 'اجرای تست عیب‌یابی فیزیکی کابل شبکه (TDR) جهت سنجش طول کابل، سلامت زوج‌سیم‌ها و قطعی یا اتصال کوتاه.',
    category: 'port',
    platform: 'mikrotik',
    danger: false,
    tooltipWhatEn: 'Execute Time Domain Reflectometry (TDR) diagnostics to measure cable pair health, length, and faults.',
    tooltipWhatFa: 'اجرای تست عیب‌یابی فیزیکی کابل شبکه (TDR) جهت سنجش طول کابل، سلامت زوج‌سیم‌ها و قطعی یا اتصال کوتاه.',
    tooltipWhyEn: 'Safe, non-disruptive hardware diagnostics that identify broken twisted pairs without changing settings.',
    tooltipWhyFa: 'ابزار عیب‌یابی فیزیکی کاملاً ایمن که بدون ایجاد تغییر، قطعی یا خرابی کابل شبکه را مشخص می‌کند.',
    tooltipExampleEn: 'Safe to grant to all Helpdesk staff to verify patch cable integrity.',
    tooltipExampleFa: 'اعطای دسترسی به تمامی نیروهای پشتیبانی جهت اطمینان از سلامت پچ‌کورد پیش از تعویض سوئیچ.',
  },

  // -------------------------------------------------------------
  // MikroTik RouterOS Granular Capabilities & Core Services
  // -------------------------------------------------------------
  {
    key: 'mikrotik_safe_mode',
    labelEn: 'RouterOS Safe Mode Protection',
    labelFa: 'محافظت حالت امن روتروس (Safe Mode)',
    shortLabelEn: 'Safe Mode',
    shortLabelFa: 'سیف مد',
    descriptionEn: 'Permits or enforces RouterOS Safe Mode protection (<CTRL+X>) during live configuration edits.',
    descriptionFa: 'فعال‌سازی یا الزام استفاده از حالت امن Safe Mode میکروتیک برای بازگردانی خودکار تغییرات در صورت قطعی ارتباط.',
    category: 'config',
    platform: 'mikrotik',
    danger: true,
    tooltipWhatEn: 'Enforces or permits toggling RouterOS Safe Mode protection (<CTRL+X>) during live session configuration.',
    tooltipWhatFa: 'فعال‌سازی یا الزام استفاده از حالت امن Safe Mode میکروتیک برای بازگردانی خودکار تنظیمات در صورت قطعی ارتباط.',
    tooltipWhyEn: 'Prevents permanent remote lockouts when applying experimental firewall rules, routing modifications, or IP address changes.',
    tooltipWhyFa: 'جلوگیری از قفل شدن یا قطع دائمی دسترسی به روتر در صورت اشتباه در تنظیمات فایروال، روتینگ یا آدرس‌های IP.',
    tooltipExampleEn: 'Mandatory for junior network engineers; optional for core system administrators.',
    tooltipExampleFa: 'الزامی برای تکنسین‌های تازه‌کار جهت پیشگیری از خطای انسانی؛ اختیاری برای مدیران ارشد.',
  },
  {
    key: 'mikrotik_firewall',
    labelEn: 'Firewall Filter & NAT Rules',
    labelFa: 'مدیریت فایروال و رول‌های NAT میکروتیک',
    shortLabelEn: 'Firewall & NAT',
    shortLabelFa: 'فایروال و NAT',
    descriptionEn: 'Inspect, modify, create, and reorder RouterOS /ip/firewall filter, nat, raw, and mangle rules.',
    descriptionFa: 'مشاهده، ویرایش، افزودن و جابجایی رول‌های فیلتر پکت، جدول NAT و رول‌های منگل در فایروال میکروتیک.',
    category: 'config',
    platform: 'mikrotik',
    danger: true,
    tooltipWhatEn: 'Inspect, modify, create, and reorder RouterOS /ip/firewall filter, nat, raw, and mangle rules.',
    tooltipWhatFa: 'مشاهده، ویرایش، افزودن و جابجایی رول‌های فیلتر پکت، جدول NAT و رول‌های منگل در فایروال میکروتیک.',
    tooltipWhyEn: 'Perimeter security and destination port-forwarding control; flawed rules can expose LAN or block management traffic.',
    tooltipWhyFa: 'کنترل کامل ترافیک ورودی/خروجی و پورت‌فورواردینگ؛ تنظیم اشتباه می‌تواند باعث نفوذ امنیتی یا مسدودسازی دسترسی شود.',
    tooltipExampleEn: 'Restricted to Cybersecurity Engineers and Senior Network Administrators.',
    tooltipExampleFa: 'منحصراً برای کارشناسان امنیت شبکه و مدیران ارشد زیرساخت.',
  },
  {
    key: 'mikrotik_backup',
    labelEn: 'System Backup & Export (.rsc)',
    labelFa: 'پشتیبان‌گیری سیستم و خروجی اسکریپت (.rsc)',
    shortLabelEn: 'Backup & Export',
    shortLabelFa: 'بکاپ و اکسپورت',
    descriptionEn: 'Generate binary system backups (/system/backup save) and export plain-text configuration scripts (/export).',
    descriptionFa: 'تولید فایل‌های پشتیبان باینری سیستم (/system/backup) و استخراج اسکریپت‌های متنی تنظیمات (/export).',
    category: 'management',
    platform: 'mikrotik',
    danger: true,
    tooltipWhatEn: 'Generate binary system backups (/system/backup save) and export plain-text configuration scripts (/export).',
    tooltipWhatFa: 'تولید فایل‌های پشتیبان باینری سیستم (/system/backup) و استخراج اسکریپت‌های متنی تنظیمات (/export).',
    tooltipWhyEn: 'Protects proprietary routing logic and encrypted secrets from unauthorized exfiltration while enabling disaster recovery.',
    tooltipWhyFa: 'محافظت از تنظیمات و پسوردهای ذخیره‌شده روتر در برابر نشت اطلاعات و امکان بازیابی سریع پس از خرابی سخت‌افزاری.',
    tooltipExampleEn: 'Granted to System Administrators for automated scheduled configuration snapshots.',
    tooltipExampleFa: 'اعطا به مدیران شبکه جهت ایجاد پشتیبان‌های دوره‌ای از تنظیمات روترهای مرزی.',
  },
  {
    key: 'mikrotik_bridge_vlan',
    labelEn: 'Bridge VLAN Filtering & Ports',
    labelFa: 'فیلترینگ Bridge VLAN و مدیریت پورت‌ها',
    shortLabelEn: 'Bridge & VLAN',
    shortLabelFa: 'بریج و VLAN',
    descriptionEn: 'Configure RouterOS software bridges, hardware-offloaded bridge VLAN filtering, and trunk/access PVIDs.',
    descriptionFa: 'پیکربندی بریج‌های نرم‌افزاری روتروس، فعال‌سازی فیلترینگ VLAN با شتاب سخت‌افزاری و تنظیم PVID پورت‌ها.',
    category: 'config',
    platform: 'mikrotik',
    danger: true,
    tooltipWhatEn: 'Configure RouterOS software bridges, hardware-offloaded bridge VLAN filtering, and trunk/access PVIDs.',
    tooltipWhatFa: 'پیکربندی بریج‌های نرم‌افزاری روتروس، فعال‌سازی فیلترینگ VLAN با شتاب سخت‌افزاری و تنظیم PVID پورت‌ها.',
    tooltipWhyEn: 'Controls Layer 2 switching boundaries and tagged traffic separation on MikroTik CRS/CCR switches.',
    tooltipWhyFa: 'تفکیک لایه ۲ ترافیک دپارتمان‌ها و اعمال ایزولاسیون VLANها روی پورت‌های سوییچ‌های میکروتیک.',
    tooltipExampleEn: 'Granted to Network Provisioning Engineers for VLAN trunking and access port allocations.',
    tooltipExampleFa: 'اعطا به کارشناسان راه‌اندازی شبکه جهت ترانک کردن VLANها به سمت اکسس‌پوینت‌ها و سرورها.',
  },
  {
    key: 'mikrotik_toggle_interface',
    labelEn: 'Enable / Disable Interfaces',
    labelFa: 'فعال یا غیرفعال‌سازی اینترفیس‌ها',
    shortLabelEn: 'Interface Power',
    shortLabelFa: 'قطع/وصل پورت',
    descriptionEn: 'Administratively enable or disable RouterOS physical ethernet, SFP, bonding, and virtual tunnel interfaces.',
    descriptionFa: 'روشن یا خاموش کردن اداری اینترفیس‌های اترنت فیزیکی، ماژول‌های فیبر SFP و اینترفیس‌های تانل در میکروتیک.',
    category: 'port',
    platform: 'mikrotik',
    danger: true,
    tooltipWhatEn: 'Administratively enable or disable RouterOS physical ethernet, SFP, bonding, and virtual tunnel interfaces.',
    tooltipWhatFa: 'روشن یا خاموش کردن اداری اینترفیس‌های اترنت فیزیکی، ماژول‌های فیبر SFP و اینترفیس‌های تانل در میکروتیک.',
    tooltipWhyEn: 'Disabling a port instantly disconnects all downstream traffic, hosts, or uplink connections.',
    tooltipWhyFa: 'خاموش کردن یک اینترفیس مستقیماً موجب قطع اتصال تمام سیستم‌ها یا لینک ارتباطی آن اینترفیس می‌شود.',
    tooltipExampleEn: 'Permit on end-user edge interfaces; strictly protect on WAN and trunk uplinks.',
    tooltipExampleFa: 'مجاز برای ایزوله کردن کلاینت‌های آلوده؛ مسدود برای لینک‌های آپ‌لینک و اینترنت اصلی.',
  },
  {
    key: 'mikrotik_vpn',
    labelEn: 'MikroTik VPN Suite & Tunnels',
    labelFa: 'مدیریت تونل‌ها و سرویس‌های VPN میکروتیک',
    shortLabelEn: 'VPN Suite',
    shortLabelFa: 'سرویس VPN',
    descriptionEn: 'Create, inspect, configure, and delete WireGuard, L2TP/IPsec, SSTP, OpenVPN, and PPTP servers/clients.',
    descriptionFa: 'ایجاد، مشاهده، پیکربندی و حذف سرورها و کلاینت‌های WireGuard، L2TP/IPsec، SSTP، OpenVPN و PPTP در میکروتیک.',
    category: 'config',
    platform: 'mikrotik',
    danger: true,
    tooltipWhatEn: 'Create, inspect, configure, and delete WireGuard, L2TP/IPsec, SSTP, OpenVPN, and PPTP servers/clients.',
    tooltipWhatFa: 'ایجاد، مشاهده، پیکربندی و حذف سرورها و کلاینت‌های WireGuard، L2TP/IPsec، SSTP، OpenVPN و PPTP در میکروتیک.',
    tooltipWhyEn: 'VPN configurations govern secure remote access, cryptographic keys, tunnel routes, and WAN boundary access.',
    tooltipWhyFa: 'مدیریت دسترسی‌های ریموت امن کارکنان، کلیدهای رمزنگاری و تونل‌های بین دفاتر سازمان.',
    tooltipExampleEn: 'Granted to Remote Access Administrators to provision WireGuard profiles for teleworkers.',
    tooltipExampleFa: 'اعطا به مدیران دسترسی راه دور جهت ساخت پروفایل WireGuard برای دورکاران شرکت.',
  },
  {
    key: 'mikrotik_comment',
    labelEn: 'Modify Interface Comments',
    labelFa: 'ثبت و ویرایش کامنت و برچسب اینترفیس‌ها',
    shortLabelEn: 'Comments',
    shortLabelFa: 'کامنت پورت',
    descriptionEn: 'Attach or update descriptive operational comments and circuit notes on RouterOS interfaces.',
    descriptionFa: 'ثبت و ویرایش یادداشت‌ها، نام مشتری، شماره پورت و توضیحات فنی روی اینترفیس‌های میکروتیک.',
    category: 'management',
    platform: 'mikrotik',
    danger: false,
    tooltipWhatEn: 'Attach or update descriptive operational comments and circuit notes on RouterOS interfaces.',
    tooltipWhatFa: 'ثبت و ویرایش یادداشت‌ها، نام مشتری، شماره پورت و توضیحات فنی روی اینترفیس‌های میکروتیک.',
    tooltipWhyEn: 'Maintains live operational documentation without any risk of packet drop or link flapping.',
    tooltipWhyFa: 'مستندسازی و ثبت اطلاعات خطوط بدون کوچک‌ترین ریسک قطعی، ریبوت یا افت پکت در شبکه.',
    tooltipExampleEn: 'Safe and recommended to grant to Helpdesk operators and field technicians.',
    tooltipExampleFa: 'ایمن و مناسب جهت اعطا به نیروهای پشتیبانی و تکنسین‌های پسیو شبکه.',
  },
  {
    key: 'mikrotik_ip_pool',
    labelEn: 'Manage IP Pools & DHCP Ranges',
    labelFa: 'مدیریت استخرهای IP و رنج‌های DHCP',
    shortLabelEn: 'IP Pools & DHCP',
    shortLabelFa: 'استخر IP و DHCP',
    descriptionEn: 'Create and update /ip/pool dynamic address ranges, static leases, and DHCP server scope parameters.',
    descriptionFa: 'تعریف و ویرایش رنج‌های آدرس‌دهی داینامیک (/ip/pool)، رزروهای استاتیک و تنظیمات سرور DHCP میکروتیک.',
    category: 'config',
    platform: 'mikrotik',
    danger: true,
    tooltipWhatEn: 'Create and update /ip/pool dynamic address ranges, static leases, and DHCP server scope parameters.',
    tooltipWhatFa: 'تعریف و ویرایش رنج‌های آدرس‌دهی داینامیک (/ip/pool)، رزروهای استاتیک و تنظیمات سرور DHCP میکروتیک.',
    tooltipWhyEn: 'Misconfigured pools cause IP exhaustion, network address collisions, or gateway lease failure.',
    tooltipWhyFa: 'پیکربندی اشتباه استخر آی‌پی موجب تداخل آدرس‌ها، پر شدن ظرفیت ساب‌نت یا عدم دریافت گیت‌وی توسط کاربران می‌شود.',
    tooltipExampleEn: 'Granted to Network Engineers when expanding office subnets or assigning static leases.',
    tooltipExampleFa: 'اعطا به مهندسان شبکه هنگام توسعه ساب‌نت‌های اداری یا افزودن رزرو IP سرورها.',
  },

  // -------------------------------------------------------------
  // Cisco Switch Enterprise Configuration Suite
  // -------------------------------------------------------------
  {
    key: 'cisco_config_device',
    labelEn: 'Cisco Device Configuration Suite',
    labelFa: 'مجموعه ابزار پیکربندی سوئیچ سیسکو (Cisco Config)',
    shortLabelEn: 'Cisco Config',
    shortLabelFa: 'کانفیگ سیسکو',
    descriptionEn: 'Master authority to open and interact with the Cisco IOS Device Configuration suite and management tabs.',
    descriptionFa: 'اختیار کلان جهت بازگشایی و مدیریت پنجره جامع پیکربندی و تنظیمات سوئیچ‌های سیسکو.',
    category: 'config',
    platform: 'cisco',
    danger: true,
    tooltipWhatEn: 'Master authorization enabling the "Config Device" button in the 3-dot equipment menu for Cisco switches.',
    tooltipWhatFa: 'اختیار کلان فعال‌سازی دکمه «پیکربندی تجهیز» در منوی سه‌نقطه فهرست تجهیزات برای سوئیچ‌های سیسکو.',
    tooltipWhyEn: 'Controls overall entry into Cisco hardware provisioning; without this, all Cisco configuration tabs remain inaccessible.',
    tooltipWhyFa: 'کنترل‌کننده دسترسی اولیه به ماژول تنظیمات؛ بدون این دسترسی هیچ‌کدام از تب‌های کانفیگ سیسکو قابل بازگشایی نخواهند بود.',
    tooltipExampleEn: 'Grant to Certified Cisco Network Engineers (CCNA/CCNP); deny for Helpdesk and NOC observers.',
    tooltipExampleFa: 'اعطا به مهندسان شبکه سیسکو و مسدودسازی برای کارشناسان پایش NOC و پشتیبانی سطح یک.',
  },
  {
    key: 'cisco_config_vty_ssh',
    labelEn: 'Line VTY, SSH & Telnet Governance',
    labelFa: 'مدیریت خطوط VTY، پروتکل SSH و تل‌نت',
    shortLabelEn: 'SSH & VTY',
    shortLabelFa: 'لاین VTY و SSH',
    descriptionEn: 'Generate RSA encryption keys, enforce SSHv2, set timeouts, and configure line vty transport inputs.',
    descriptionFa: 'تولید کلیدهای رمزنگاری RSA، الزام نسخه SSHv2، تنظیم تایم‌اوت‌ها و پیکربندی پروتکل‌های ورودی لاین VTY.',
    category: 'config',
    platform: 'cisco',
    danger: true,
    tooltipWhatEn: 'Configures remote management access lines (line vty 0 15), crypto key generation, and SSH protocol parameters.',
    tooltipWhatFa: 'پیکربندی لاین‌های دسترسی ریموت، تولید کلید RSA با اندازه ۲۰۴۸/۴۰۹۶ بیت و پروتکل‌های مجاز ورودی.',
    tooltipWhyEn: 'Disabling Telnet and enforcing SSHv2 with strong modulus eliminates clear-text credential sniffing across the LAN.',
    tooltipWhyFa: 'حذف پروتکل ناامن تل‌نت و الزام SSHv2 مانع از استراق سمع پسوردهای مدیریتی در بستر شبکه می‌شود.',
    tooltipExampleEn: 'Used when hardening newly deployed access switches according to CIS Cisco IOS benchmarks.',
    tooltipExampleFa: 'استفاده در امن‌سازی و ایمن‌سازی سوئیچ‌های لایه اکسس بر اساس استانداردهای CIS.',
  },
  {
    key: 'cisco_config_ntp',
    labelEn: 'NTP, System Clock & Timezone',
    labelFa: 'سرویس زمان، سرورهای NTP و منطقه زمانی',
    shortLabelEn: 'NTP & Clock',
    shortLabelFa: 'ساعت و NTP',
    descriptionEn: 'Configure authoritative NTP servers, source-interface, daylight saving rules, and hardware clock synchronization.',
    descriptionFa: 'تعیین سرورهای معتبر NTP، اینترفیس مبدأ، ساعت تابستانی و همگام‌سازی ساعت سخت‌افزاری سوئیچ.',
    category: 'management',
    platform: 'cisco',
    danger: false,
    tooltipWhatEn: 'Sets up Network Time Protocol (NTP) synchronization peers and local system timezone offset.',
    tooltipWhatFa: 'تنظیم سرورهای همگام‌سازی زمان (NTP) و ساعت محلی سیستم‌عامل سیسکو.',
    tooltipWhyEn: 'Accurate switch clock synchronization is essential for forensic log correlation and certificate validity.',
    tooltipWhyFa: 'همگام‌بودن دقیق ساعت جهت اعتبارسنجی لاگ‌های امنیتی، سرتیفیکیت‌ها و خطایابی حوادث شبکه الزامی است.',
    tooltipExampleEn: 'Point switches to internal stratum-1/2 NTP servers (e.g., 10.0.0.123).',
    tooltipExampleFa: 'تنظیم آدرس سرورهای محلی NTP سازمان با اینترفیس مبدأ Loopback یا Vlan مدیریتی.',
  },
  {
    key: 'cisco_config_snmp',
    labelEn: 'SNMPv2c / SNMPv3 & Traps Architecture',
    labelFa: 'پیکربندی SNMPv2/v3، کامیونیتی و ترپ‌ها',
    shortLabelEn: 'SNMP Suite',
    shortLabelFa: 'سرویس SNMP',
    descriptionEn: 'Configure SNMP community strings with ACL filtering, SNMPv3 USM users with Auth/Priv, and Trap receivers.',
    descriptionFa: 'تعریف رشته‌های Community با محدودسازی ACL، کاربران SNMPv3 با رمزنگاری Auth/Priv و آدرس سرورهای ترپ.',
    category: 'management',
    platform: 'cisco',
    danger: false,
    tooltipWhatEn: 'Sets up SNMP monitoring strings, secure SNMPv3 users, and asynchronous trap destinations.',
    tooltipWhatFa: 'تنظیم رشته‌های شناسایی مانیتورینگ، کاربران امن SNMPv3 و آدرس مقاصد هشدارهای Trap.',
    tooltipWhyEn: 'Enables telemetry polling by Zabbix, PRTG, and SolarWinds while securing the MIB tree from unauthorized reads.',
    tooltipWhyFa: 'امکان پایش ترافیک و سلامت تجهیز توسط سامانه‌های مانیتورینگ با حفظ محرمانگی اطلاعات در لایه شبکه.',
    tooltipExampleEn: 'Create SNMPv3 user "noc-mon" with SHA authentication and AES-128 privacy.',
    tooltipExampleFa: 'ساخت کاربر SNMPv3 با احراز هویت SHA و رمزنگاری داده‌های AES-128.',
  },
  {
    key: 'cisco_config_users',
    labelEn: 'Local Users, Privilege Levels & Enable Secret',
    labelFa: 'مدیریت کاربران محلی، سطوح Privilege و رمز Enable',
    shortLabelEn: 'Users & AAA',
    shortLabelFa: 'کاربران و AAA',
    descriptionEn: 'Provision local administrative accounts, assign privilege levels (0-15), set scrypt/sha256 secrets, and update enable secret.',
    descriptionFa: 'ایجاد و حذف حساب‌های کاربری محلی، تخصیص سطوح دسترسی (۰ تا ۱۵)، الگوریتم‌های هش مدرن و رمز Enable دستگاه.',
    category: 'danger',
    platform: 'cisco',
    danger: true,
    tooltipWhatEn: 'Creates and manages local IOS username credentials, privilege levels (0 to 15), and the master enable secret.',
    tooltipWhatFa: 'ساخت و ویرایش اکانت‌های لاگین محلی سیسکو، سطوح اختیارات ۰ تا ۱۵ و کلمه عبور ارتقای دسترسی (Enable).',
    tooltipWhyEn: 'Critical administrative credentials; misuse or weak passwords grant full root-level control over network hardware.',
    tooltipWhyFa: 'بالاترین سطح دسترسی؛ استفاده از پسوردهای ضعیف یا دستکاری اشتباه می‌تواند منجر به نفوذ یا قطع دسترسی مدیران شود.',
    tooltipExampleEn: 'Restricted exclusively to Senior Network Security Administrators.',
    tooltipExampleFa: 'منحصراً برای مدیران ارشد امنیت زیرساخت و تعیین دسترسی اپراتورهای شبکه.',
  },
  {
    key: 'cisco_config_stp',
    labelEn: 'Spanning Tree Protocol (STP & Rapid-PVST)',
    labelFa: 'پروتکل درخت پوشا (STP، Rapid-PVST و جلوگیری از لوپ)',
    shortLabelEn: 'STP Suite',
    shortLabelFa: 'پروتکل STP',
    descriptionEn: 'Configure STP operational mode (PVST+, Rapid-PVST, MST), bridge priorities for Root election, and PortFast/BPDU Guard.',
    descriptionFa: 'انتخاب مد کاری STP، تنظیم اولویت Bridge Priority برای تعیین سوئیچ روت و فعال‌سازی PortFast و BPDU Guard.',
    category: 'config',
    platform: 'cisco',
    danger: true,
    tooltipWhatEn: 'Governs Layer 2 Spanning Tree topology calculation, root bridge priority values, and edge port protection.',
    tooltipWhatFa: 'مدیریت توپولوژی لایه ۲ شبکه، محاسبه درخت پوشا، اولویت سوئیچ روت و مکانیزم‌های محافظت پورت اکسس.',
    tooltipWhyEn: 'Incorrect bridge priorities or missing BPDU Guard cause catastrophic broadcast storms and spanning-tree reconvergence loops.',
    tooltipWhyFa: 'تنظیم اشتباه اولویت یا عدم فعال‌سازی BPDU Guard موجب لوپ‌های فاجعه‌بار لایه ۲ و توقف کامل ترافیک می‌شود.',
    tooltipExampleEn: 'Set Core Switch bridge priority to 4096 (Primary Root) and Distribution Switch to 8192 (Secondary Root).',
    tooltipExampleFa: 'تنظیم اولویت سوئیچ کور روی ۴۰۹۶ (Root Bridge اصلی) و فعال‌سازی PortFast روی پورت‌های متصل به سیستم‌ها.',
  },
  {
    key: 'cisco_config_vtp',
    labelEn: 'VLAN Trunking Protocol (VTP Suite)',
    labelFa: 'پروتکل ترانک و توزیع VLAN (سرویس VTP)',
    shortLabelEn: 'VTP Suite',
    shortLabelFa: 'پروتکل VTP',
    descriptionEn: 'Set VTP operating mode (Server, Client, Transparent, Off), VTP domain, protocol version (1/2/3), and MD5 password.',
    descriptionFa: 'تنظیم حالت کاری VTP (سرور، کلاینت، ترنسپرنت یا خاموش)، نام دامین، نسخه پروتکل و کلمه عبور اعتبارسنجی.',
    category: 'danger',
    platform: 'cisco',
    danger: true,
    tooltipWhatEn: 'Configures Cisco VLAN Trunking Protocol (VTP) domain name, operational mode, version, and password.',
    tooltipWhatFa: 'تنظیم دامین، مد کاری، نسخه و کلمه عبور پروتکل انتشار VLAN سیسکو (VTP).',
    tooltipWhyEn: 'Extremely high risk: Connecting an unverified switch with higher Configuration Revision can overwrite the entire VLAN database!',
    tooltipWhyFa: 'ریسک بسیار بالا: اتصال سوئیچ با Revision Number بالاتر می‌تواند کل دیتابیس VLAN شبکه سازمان را در لحظه پاک کند!',
    tooltipExampleEn: 'Set access switches to VTP Transparent or Off to prevent unintended propagation across trunks.',
    tooltipExampleFa: 'قرار دادن سوئیچ‌های اکسس در حالت VTP Transparent یا Off جهت جلوگیری از تغییر ناخواسته VLANها.',
  },
  {
    key: 'cisco_config_syslog',
    labelEn: 'Syslog & Remote Logging Facilities',
    labelFa: 'سرویس لاگینگ و ارسال رویدادها (Syslog)',
    shortLabelEn: 'Syslog',
    shortLabelFa: 'سیسلوگ',
    descriptionEn: 'Configure remote syslog collector hosts, severity trap thresholds (debugging to emergencies), and log timestamp formats.',
    descriptionFa: 'تنظیم سرورهای جمع‌آوری لاگ، فیلتر سطوح حساسیت (Severity) و قالب زمان‌بندی پیام‌های ثبت وقایع.',
    category: 'management',
    platform: 'cisco',
    danger: false,
    tooltipWhatEn: 'Designates remote syslog server destinations and event severity logging thresholds on Cisco IOS.',
    tooltipWhatFa: 'تعیین آدرس سرورهای دریافت لاگ (Syslog Server) و سطح حساسیت رویدادهای ارسالی.',
    tooltipWhyEn: 'Maintains centralized audit trails of configuration changes, link flaps, and security policy violations.',
    tooltipWhyFa: 'تضمین ثبت متمرکز کلیه رخدادها، قطع و وصل پورت‌ها و ورودهای غیرمجاز در سرور امنیتی SIEM/Syslog.',
    tooltipExampleEn: 'Forward informational and higher events (trap 6) to central SIEM collector (192.168.10.50).',
    tooltipExampleFa: 'ارسال هشدارهای سطح Warning و بالاتر به سرور مانیتورینگ لاگ سازمان.',
  },
  {
    key: 'cisco_config_vlans',
    labelEn: 'VLAN Database & Management SVI',
    labelFa: 'پایگاه داده VLAN و اینترفیس مدیریتی SVI',
    shortLabelEn: 'VLANs & SVI',
    shortLabelFa: 'VLAN و SVI',
    descriptionEn: 'Provision VLAN IDs, assign VLAN names, configure Switch Virtual Interfaces (SVI), and set default gateway.',
    descriptionFa: 'تعریف شناسه‌های VLAN، نام‌گذاری، تنظیم آدرس IP اینترفیس مجازی سوییچ (SVI) و گیت‌وی پیش‌فرض دستگاه.',
    category: 'config',
    platform: 'cisco',
    danger: true,
    tooltipWhatEn: 'Creates Layer 2 VLANs, names them, and configures the management Layer 3 SVI (e.g. interface Vlan10).',
    tooltipWhatFa: 'ساخت VLANهای شبکه، نام‌گذاری، و تنظیم IP/Subnet روی اینترفیس مجازی مدیریتی سوییچ (SVI).',
    tooltipWhyEn: 'Misconfiguring the management SVI IP address or default gateway cuts off network access to the switch.',
    tooltipWhyFa: 'تنظیم اشتباه آدرس IP سوییچ یا گیت‌وی پیش‌فرض باعث قطع کامل ارتباط با سوییچ خواهد شد.',
    tooltipExampleEn: 'Create VLAN 20 (Marketing) and configure interface Vlan20 with 10.20.0.2/24.',
    tooltipExampleFa: 'ایجاد VLAN 20 به نام Servers و تنظیم IP مدیریتی ۱۰.۲۰.۰.۲ روی اینترفیس Vlan20.',
  },
  {
    key: 'cisco_config_l2_security',
    labelEn: 'Layer 2 Security (DHCP Snooping & DAI)',
    labelFa: 'امنیت لایه ۲ (DHCP Snooping و ARP Inspection)',
    shortLabelEn: 'L2 Security',
    shortLabelFa: 'امنیت L2',
    descriptionEn: 'Enforce DHCP Snooping, Dynamic ARP Inspection (DAI), IP Source Guard, and errdisable auto-recovery timers.',
    descriptionFa: 'فعال‌سازی مقابله با روگ DHCP سرورها، بازرسی داینامیک ARP (DAI) و تایمرهای بازیابی پورت‌های Err-Disabled.',
    category: 'config',
    platform: 'cisco',
    danger: false,
    tooltipWhatEn: 'Activates DHCP Snooping and Dynamic ARP Inspection to protect access VLANs against spoofing and rogue servers.',
    tooltipWhatFa: 'فعال‌سازی مکانیزم‌های دفاعی لایه ۲ برای مقابله با جعل آدرس IP/MAC و توزیع IP توسط روترهای غیرمجاز.',
    tooltipWhyEn: 'Prevents man-in-the-middle attacks, rogue DHCP gateway hijacking, and ARP poisoning across switch ports.',
    tooltipWhyFa: 'جلوگیری از حملات سرقت ترافیک (MITM)، جعل گیت‌وی توسط روترهای متفرقه و مسموم‌سازی جدول ARP.',
    tooltipExampleEn: 'Enable DHCP snooping on VLANs 10,20 and trust uplink port GigabitEthernet0/24.',
    tooltipExampleFa: 'فعال‌سازی DHCP Snooping روی VLANهای کلاینت و تراست کردن پورت آپ‌لینک به روتر اصلی.',
  },
  {
    key: 'cisco_config_write_memory',
    labelEn: 'Save Configuration to NVRAM & Backup',
    labelFa: 'ذخیره دائمی کانفیگ در NVRAM و بکاپ',
    shortLabelEn: 'Save & NVRAM',
    shortLabelFa: 'ذخیره NVRAM',
    descriptionEn: 'Commit running configuration to non-volatile memory (write memory / copy run start) and export configuration backups.',
    descriptionFa: 'ذخیره و تثبیت تغییرات جاری در حافظه دائم سوئیچ (Write Memory) و دریافت فایل پشتیبان متنی کانفیگ.',
    category: 'management',
    platform: 'cisco',
    danger: false,
    tooltipWhatEn: 'Executes "write memory" or "copy running-config startup-config" to persist active changes across reboots.',
    tooltipWhatFa: 'اجرای دستور write memory جهت ذخیره‌سازی دائمی تغییرات بر روی حافظه NVRAM سوئیچ.',
    tooltipWhyEn: 'Without committing to NVRAM, all configuration changes are permanently wiped if the switch loses power.',
    tooltipWhyFa: 'بدون ذخیره در NVRAM، با قطعی برق یا ریست شدن سوئیچ، کلیه تنظیمات انجام شده از دست خواهد رفت.',
    tooltipExampleEn: 'Permitted for network operators authorized to finalize maintenance work.',
    tooltipExampleFa: 'مجاز برای مهندسان پس از اتمام موفقیت‌آمیز مراحل پیکربندی تجهیز.',
  },
];

export const FULL_CISCO_CONFIG_PERMISSIONS: Partial<NetworkDeviceActionPermissions> = {
  cisco_config_device: true,
  cisco_config_vty_ssh: true,
  cisco_config_ntp: true,
  cisco_config_snmp: true,
  cisco_config_users: true,
  cisco_config_stp: true,
  cisco_config_vtp: true,
  cisco_config_syslog: true,
  cisco_config_vlans: true,
  cisco_config_l2_security: true,
  cisco_config_write_memory: true,
};

export const EMPTY_CISCO_CONFIG_PERMISSIONS: Partial<NetworkDeviceActionPermissions> = {
  cisco_config_device: false,
  cisco_config_vty_ssh: false,
  cisco_config_ntp: false,
  cisco_config_snmp: false,
  cisco_config_users: false,
  cisco_config_stp: false,
  cisco_config_vtp: false,
  cisco_config_syslog: false,
  cisco_config_vlans: false,
  cisco_config_l2_security: false,
  cisco_config_write_memory: false,
};

export const FULL_MIKROTIK_PERMISSIONS: Partial<NetworkDeviceActionPermissions> = {
  mikrotik_safe_mode: true,
  mikrotik_firewall: true,
  mikrotik_backup: true,
  mikrotik_bridge_vlan: true,
  mikrotik_toggle_interface: true,
  mikrotik_vpn: true,
  mikrotik_comment: true,
  mikrotik_ip_pool: true,
};

export const EMPTY_MIKROTIK_PERMISSIONS: Partial<NetworkDeviceActionPermissions> = {
  mikrotik_safe_mode: false,
  mikrotik_firewall: false,
  mikrotik_backup: false,
  mikrotik_bridge_vlan: false,
  mikrotik_toggle_interface: false,
  mikrotik_vpn: false,
  mikrotik_comment: false,
  mikrotik_ip_pool: false,
};

export const FULL_PORT_PERMISSIONS: Partial<NetworkDeviceActionPermissions> = {
  port_power: true,
  port_mode: true,
  port_vlan: true,
  port_security: true,
  port_description: true,
  port_bridge: true,
  port_speed: true,
  port_cable_test: true,
};

export const EMPTY_PORT_PERMISSIONS: Partial<NetworkDeviceActionPermissions> = {
  port_power: false,
  port_mode: false,
  port_vlan: false,
  port_security: false,
  port_description: false,
  port_bridge: false,
  port_speed: false,
  port_cable_test: false,
};

export const FULL_EQUIPMENT_PERMISSIONS: Partial<NetworkDeviceActionPermissions> = {
  web_configs: true,
  terminal: true,
  apply_template: true,
  device_note: true,
  edit_properties: true,
  ping_keepalive: true,
  inspect_ports: true,
  write_memory: true,
  delete_device: true,
  export_devices: true,
  import_devices: true,
};

export const EMPTY_EQUIPMENT_PERMISSIONS: Partial<NetworkDeviceActionPermissions> = {
  web_configs: false,
  terminal: false,
  apply_template: false,
  device_note: false,
  edit_properties: false,
  ping_keepalive: false,
  inspect_ports: false,
  write_memory: false,
  delete_device: false,
  export_devices: false,
  import_devices: false,
};

export const FULL_DEVICE_PERMISSIONS: NetworkDeviceActionPermissions = {
  web_configs: true,
  terminal: true,
  apply_template: true,
  device_note: true,
  edit_properties: true,
  ping_keepalive: true,
  inspect_ports: true,
  write_memory: true,
  delete_device: true,
  export_devices: true,
  import_devices: true,
  add_device: true,
  port_power: true,
  port_mode: true,
  port_vlan: true,
  port_security: true,
  port_description: true,
  port_bridge: true,
  port_speed: true,
  port_cable_test: true,
  mikrotik_safe_mode: true,
  mikrotik_firewall: true,
  mikrotik_backup: true,
  mikrotik_bridge_vlan: true,
  mikrotik_toggle_interface: true,
  mikrotik_vpn: true,
  mikrotik_comment: true,
  mikrotik_ip_pool: true,
  cisco_config_device: true,
  cisco_config_vty_ssh: true,
  cisco_config_ntp: true,
  cisco_config_snmp: true,
  cisco_config_users: true,
  cisco_config_stp: true,
  cisco_config_vtp: true,
  cisco_config_syslog: true,
  cisco_config_vlans: true,
  cisco_config_l2_security: true,
  cisco_config_write_memory: true,
};

export const RESTRICTED_DEVICE_PERMISSIONS: NetworkDeviceActionPermissions = {
  web_configs: true,
  terminal: false,
  apply_template: false,
  device_note: true,
  edit_properties: false,
  ping_keepalive: true,
  inspect_ports: true,
  write_memory: false,
  delete_device: false,
  export_devices: false,
  import_devices: false,
  add_device: false,
  port_power: false,
  port_mode: false,
  port_vlan: false,
  port_security: false,
  port_description: false,
  port_bridge: false,
  port_speed: false,
  port_cable_test: true,
  mikrotik_safe_mode: false,
  mikrotik_firewall: false,
  mikrotik_backup: false,
  mikrotik_bridge_vlan: false,
  mikrotik_toggle_interface: false,
  mikrotik_vpn: false,
  mikrotik_comment: false,
  mikrotik_ip_pool: false,
  cisco_config_device: false,
  cisco_config_vty_ssh: false,
  cisco_config_ntp: false,
  cisco_config_snmp: false,
  cisco_config_users: false,
  cisco_config_stp: false,
  cisco_config_vtp: false,
  cisco_config_syslog: false,
  cisco_config_vlans: false,
  cisco_config_l2_security: false,
  cisco_config_write_memory: false,
};

export const EMPTY_DEVICE_PERMISSIONS: NetworkDeviceActionPermissions = {
  web_configs: false,
  terminal: false,
  apply_template: false,
  device_note: false,
  edit_properties: false,
  ping_keepalive: false,
  inspect_ports: false,
  write_memory: false,
  delete_device: false,
  export_devices: false,
  import_devices: false,
  add_device: false,
  port_power: false,
  port_mode: false,
  port_vlan: false,
  port_security: false,
  port_description: false,
  port_bridge: false,
  port_speed: false,
  port_cable_test: false,
  mikrotik_safe_mode: false,
  mikrotik_firewall: false,
  mikrotik_backup: false,
  mikrotik_bridge_vlan: false,
  mikrotik_toggle_interface: false,
  mikrotik_vpn: false,
  mikrotik_comment: false,
  mikrotik_ip_pool: false,
  cisco_config_device: false,
  cisco_config_vty_ssh: false,
  cisco_config_ntp: false,
  cisco_config_snmp: false,
  cisco_config_users: false,
  cisco_config_stp: false,
  cisco_config_vtp: false,
  cisco_config_syslog: false,
  cisco_config_vlans: false,
  cisco_config_l2_security: false,
  cisco_config_write_memory: false,
};

export const SERVER_ACTIONS_CATALOG: ServerActionDescriptor[] = [
  {
    key: 'terminal',
    labelEn: 'Interactive Terminal & Remote Desktop',
    labelFa: 'ترمینال تعاملی و ریموت دسکتاپ (SSH, RDP, VNC)',
    descriptionEn: 'Interactive command shell (SSH /bin/bash, PowerShell) and graphical desktop streams (HTML5 RDP, VNC).',
    descriptionFa: 'کنسول تعاملی خط فرمان (ترمینال لینوکس و پاورشل) و استریم دسکتاپ گرافیکی (ریموت دسکتاپ و VNC).',
    category: 'remote',
    danger: true,
  },
  {
    key: 'file_explorer',
    labelEn: 'File Explorer & SFTP Browser',
    labelFa: 'کاوشگر فایل و مرورگر SFTP',
    descriptionEn: 'Browse filesystem, upload/download files, edit configuration files, and manage directory permissions.',
    descriptionFa: 'مرور دایرکتوری‌ها، ویرایش فایل‌های متنی و کانفیگ، آپلود و دانلود فایل‌ها از طریق پروتکل امن SFTP.',
    category: 'remote',
  },
  {
    key: 'server_management',
    labelEn: 'System Telemetry & Service Management',
    labelFa: 'پایش سیستم و مدیریت سرویس‌ها',
    descriptionEn: 'System resource graphs, process lists, systemd services, cron jobs, log viewer, and packages.',
    descriptionFa: 'مشاهده شاخص‌های مصرف CPU/RAM، لیست پروسه‌ها، سرویس‌های سیستم، کران‌جاب‌ها، پکیج‌ها و لاگ‌ها.',
    category: 'management',
  },
  {
    key: 'web_management',
    labelEn: 'Web Servers (Nginx & Apache)',
    labelFa: 'مدیریت وب‌سرورها (Nginx و Apache)',
    descriptionEn: 'Inspect virtual hosts, reverse proxies, HTTP configurations, and web server service state.',
    descriptionFa: 'بررسی و مدیریت هاست‌های مجازی (VirtualHosts)، پروکسی معکوس، لاگ‌ها و وضعیت سرویس وب‌سرور.',
    category: 'management',
  },
  {
    key: 'database_management',
    labelEn: 'Databases (PostgreSQL & MySQL)',
    labelFa: 'مدیریت پایگاه داده (PostgreSQL و MySQL)',
    descriptionEn: 'Inspect database cluster status, connection pools, running queries, tables, and server telemetry.',
    descriptionFa: 'پایش کلاسترهای پایگاه داده، اتصالات فعال، کوئری‌های در حال اجرا و تلمتری دیتابیس.',
    category: 'management',
  },
  {
    key: 'power_control',
    labelEn: 'Power Control (Restart & Shutdown)',
    labelFa: 'کنترل توان (راه‌اندازی مجدد و خاموش کردن)',
    descriptionEn: 'Execute graceful or forced reboot and system shutdown operations on the target server.',
    descriptionFa: 'صدور دستور ری‌استارت (Reboot) یا خاموش‌سازی کامل سیستم (Shutdown / Power Off) روی سرور.',
    category: 'power',
    danger: true,
  },
  {
    key: 'edit_properties',
    labelEn: 'Edit Server Properties',
    labelFa: 'ویرایش مشخصات و اطلاعات سرور',
    descriptionEn: 'Update hostname, IP address, management ports, credentials, category, and automation tags.',
    descriptionFa: 'ویرایش نام میزبان، آدرس IP، پورت‌های مدیریتی، پسورد یا کلید SSH، دسته‌بندی و تگ‌های سرور.',
    category: 'config',
  },
  {
    key: 'delete_server',
    labelEn: 'Delete Server from Fleet',
    labelFa: 'حذف سرور از ناوگان تجهیزات',
    descriptionEn: 'Permanently remove the server record, credentials, and topology attachments from the fleet.',
    descriptionFa: 'حذف دائم رکورد سرور، اطلاعات اتصال و برچسب‌های اتوماسیون آن از پایگاه داده و پنل مدیریت.',
    category: 'config',
    danger: true,
  },
  {
    key: 'export_servers',
    labelEn: 'Export Server & Fleet Data (JSON / CSV)',
    labelFa: 'خروجی گرفتن از اطلاعات و مشخصات سرورها (Export)',
    descriptionEn: 'Export server specifications, hardware metrics, OS distro, services, and inventory configuration to JSON or CSV.',
    descriptionFa: 'دریافت خروجی ساختاریافته (JSON و CSV) از مشخصات فنی، سخت‌افزار، سیستم‌عامل، سرویس‌ها و شناسنامه سرورها.',
    category: 'management',
    danger: false,
  },
  {
    key: 'import_servers',
    labelEn: 'Import Server & Fleet Data (JSON / CSV)',
    labelFa: 'ورود اطلاعات و بارگذاری سرورها (Import)',
    shortLabelEn: 'Import',
    shortLabelFa: 'ورود سرورها',
    descriptionEn: 'Import single or bulk servers from JSON or CSV files into the fleet with conflict validation.',
    descriptionFa: 'بارگذاری و ورود تکی یا دسته‌ای مشخصات سرورها از طریق فایل‌های JSON و CSV به سیستم.',
    category: 'management',
    danger: true,
    tooltipWhatEn: 'Permits uploading server inventory packages in JSON or CSV format.',
    tooltipWhatFa: 'مجوز بارگذاری بسته‌های اطلاعات سرور با فرمت JSON یا CSV.',
    tooltipWhyEn: 'Batch importing creates new infrastructure records and credentials in the database.',
    tooltipWhyFa: 'ورود دسته‌ای رکوردها و اطلاعات اتصال سرورهای متعدد در دیتابیس را به همراه دارد.',
    tooltipExampleEn: 'Granted during mass data migrations by Infrastructure Architects.',
    tooltipExampleFa: 'مجاز هنگام مهاجرت داده و ایجاد اولیه سیستم توسط معماران زیرساخت.',
  },
  {
    key: 'add_server',
    labelEn: 'Add Remote Server & Deploy Compute Nodes',
    labelFa: 'ثبت و افزودن سرور به ناوگان (Add Remote Server)',
    shortLabelEn: 'Add Server',
    shortLabelFa: 'افزودن سرور',
    descriptionEn: 'Permit adding and registering new Linux, Windows, cloud instances, and standalone service nodes into the fleet.',
    descriptionFa: 'مجوز ثبت، اضافه کردن و استقرار سرورهای جدید لینوکس، ویندوز، ماشین‌های مجازی و سرویس‌های مستقل در ناوگان.',
    category: 'config',
    danger: false,
    tooltipWhatEn: 'Permits adding and registering new remote servers (Linux SSH, Windows RDP/VNC) or service nodes into the automation fleet.',
    tooltipWhatFa: 'مجوز ثبت سرورهای ریموت جدید (لینوکس، ویندوز، نودهای رایانشی) یا سرویس‌های مستقل در ناوگان اتوماسیون.',
    tooltipWhyEn: 'Governs who can expand the infrastructure fleet and deploy new monitored nodes into the management panel.',
    tooltipWhyFa: 'تعیین‌کننده اختیار کاربر در گسترش زیرساخت، ثبت هاست‌های جدید و اتصال سرورها به پنل مانیتورینگ.',
    tooltipExampleEn: 'Enabled for Infrastructure Administrators and DevOps leads; disabled for read-only NOC operators.',
    tooltipExampleFa: 'فعال برای مدیران زیرساخت و دواپس؛ غیرفعال برای اپراتورهای مانیتورینگ NOC و کلاینت‌ها.',
  },
];

export const FULL_SERVER_PERMISSIONS: ServerActionPermissions = {
  terminal: true,
  file_explorer: true,
  server_management: true,
  web_management: true,
  database_management: true,
  power_control: true,
  edit_properties: true,
  delete_server: true,
  export_servers: true,
  import_servers: true,
  add_server: true,
};

export const RESTRICTED_SERVER_PERMISSIONS: ServerActionPermissions = {
  terminal: false,
  file_explorer: false,
  server_management: true,
  web_management: false,
  database_management: false,
  power_control: false,
  edit_properties: false,
  delete_server: false,
  export_servers: false,
  import_servers: false,
  add_server: false,
};

/**
 * Universally evaluates whether a specific server action is permitted
 * under a database-authoritative AccessPolicy for a given server.
 */
export function isServerActionPermitted(
  policy: AccessPolicy | any | null | undefined,
  serverId: string,
  action: ServerActionKey
): boolean {
  // If no policy is provided (unauthenticated/standalone fallback), permit action
  if (!policy) return true;

  // 1. If user has no permission to view/manage servers at all
  if (policy.canViewServers === false) {
    return false;
  }

  // 1.1 Fleet-level Add Remote Server action
  if (action === 'add_server') {
    if (policy.defaultServerPermissions?.add_server !== undefined) {
      return Boolean(policy.defaultServerPermissions.add_server);
    }
    if (policy.canAddServer !== undefined) {
      return Boolean(policy.canAddServer);
    }
    return policy.canManageDevices !== false;
  }

  // 2. If policy targets specific groups/servers, ensure target server is in allowed fleet scope
  if (Array.isArray(policy.allowedServerIds) && serverId && !policy.allowedServerIds.includes(serverId)) {
    return false;
  }
  if (policy.targetScope === 'specific' && Array.isArray(policy.targetServerIds) && serverId && !policy.targetServerIds.includes(serverId)) {
    return false;
  }

  // 3. Highest Priority: Granular Per-Server Override Matrix
  if (policy.perServerPermissions && typeof policy.perServerPermissions === 'object') {
    const serverOverrides = policy.perServerPermissions[serverId];
    if (serverOverrides && typeof serverOverrides === 'object') {
      if (typeof serverOverrides[action] === 'boolean') {
        return serverOverrides[action];
      }
    }
  }

  // 4. Default Server Permissions defined in the policy
  if (policy.defaultServerPermissions && typeof policy.defaultServerPermissions === 'object') {
    if (typeof policy.defaultServerPermissions[action] === 'boolean') {
      return policy.defaultServerPermissions[action];
    }
  }

  // 5. Global Policy Scope Fallback (Super Administrator unconstrained access)
  const isSuperAdmin =
    policy.id === 'policy-super-admin' ||
    (policy.targetScope === 'all' && (policy.priority || 0) >= 100);
  if (isSuperAdmin) {
    return true;
  }

  // 6. Safe backward-compatible fallback mapping from general policy flags:
  if (action === 'export_servers') {
    if (policy.canExportServers === false) return false;
    return Boolean(policy.canExportServers || policy.canManageDevices || isSuperAdmin);
  }
  if (action === 'import_servers') {
    if (policy.canImportServers === false) return false;
    return Boolean(policy.canImportServers || policy.canManageDevices || isSuperAdmin);
  }

  // Safe defaults for non-superadmin policies without explicit grants:
  // Dangerous / sensitive actions are blocked by default
  if (
    action === 'delete_server' ||
    action === 'power_control' ||
    action === 'terminal' ||
    action === 'edit_properties'
  ) {
    return false;
  }

  // Safe monitoring & inspection actions default to true if the server is in scope
  return true;
}

/**
 * Universally evaluates whether a target remote server is in the authorized scope of an AccessPolicy.
 * Evaluates targetScope ('all' | 'groups' | 'specific'), targetGroupIds, targetServerIds, and allowedServerIds.
 */
export function canAccessServer(
  policy: AccessPolicy | any | null | undefined,
  serverId: string,
  deviceGroups?: Array<{ id: string; name?: string; serverIds?: string[]; server_ids?: string[] }>
): boolean {
  if (!policy) return true;
  if (policy.canViewServers === false) return false;
  if (isUserSuperAdmin(null, policy)) return true;

  // 1. Authoritative pre-computed allowedServerIds
  if (Array.isArray(policy.allowedServerIds)) {
    return policy.allowedServerIds.includes(serverId);
  }

  // 2. Unrestricted scope
  if (policy.targetScope === 'all') {
    return true;
  }

  // 3. Specific servers selection
  if (policy.targetScope === 'specific') {
    return Array.isArray(policy.targetServerIds) && policy.targetServerIds.includes(serverId);
  }

  // 4. Group-scoped fleet: check if server belongs to any of the policy's target groups
  if (policy.targetScope === 'groups') {
    if (!Array.isArray(deviceGroups) || deviceGroups.length === 0) {
      // If groups are not passed or empty, default to false under least-privilege
      return false;
    }
    const targetGroupSet = new Set(
      (policy.targetGroupIds || []).map((id: string) => (id || '').trim().toLowerCase())
    );
    for (const g of deviceGroups) {
      const gid = (g.id || '').trim().toLowerCase();
      const gname = (g.name || '').trim().toLowerCase();
      if (targetGroupSet.has(gid) || targetGroupSet.has(gname)) {
        const sIds = g.serverIds || g.server_ids || [];
        if (sIds.includes(serverId)) return true;
      }
    }
    return false;
  }

  return true;
}

/**
 * Client-side evaluation helper to test whether a given action is permitted on a target server.
 * Accepts either the RemoteServer object or its string ID, along with the action key and effective policy.
 */
export function isServerActionAllowed(
  server: { id: string } | string | null | undefined,
  actionKey: ServerActionKey,
  policy: AccessPolicy | any | null | undefined
): boolean {
  if (!server) return false;
  const serverId = typeof server === 'string' ? server : server.id;
  return isServerActionPermitted(policy, serverId, actionKey);
}

/**
 * Universally evaluates whether a specific network equipment action is permitted
 * under a database-authoritative AccessPolicy for a given network device.
 */
export function isDeviceActionPermitted(
  policy: AccessPolicy | any | null | undefined,
  deviceId: string,
  action: NetworkDeviceActionKey
): boolean {
  // If no policy is provided (unauthenticated/standalone fallback), permit action
  if (!policy) return true;

  // 1. If user has no permission to view/manage devices at all
  if (policy.canViewDevices === false) {
    return false;
  }

  // 1.1 Inventory-level Add Network Device (Introduce New Device) action
  if (action === 'add_device') {
    if (policy.canAddDevice !== undefined) {
      return Boolean(policy.canAddDevice);
    }
    if (policy.defaultDevicePermissions?.add_device !== undefined) {
      return Boolean(policy.defaultDevicePermissions.add_device);
    }
    return policy.canManageDevices !== false && Boolean(policy.canManageDevices);
  }

  // 2. If policy targets specific groups or devices, ensure target device is in allowed scope
  if (Array.isArray(policy.allowedDeviceIds) && !policy.allowedDeviceIds.includes(deviceId)) {
    return false;
  }
  if (policy.targetScope === 'specific' && Array.isArray(policy.targetDeviceIds) && !policy.targetDeviceIds.includes(deviceId)) {
    return false;
  }

  // 3. Highest Priority: Granular Per-Device Override Matrix
  if (policy.perDevicePermissions && typeof policy.perDevicePermissions === 'object') {
    const deviceOverrides = policy.perDevicePermissions[deviceId];
    if (deviceOverrides && typeof deviceOverrides === 'object') {
      if (typeof deviceOverrides[action] === 'boolean') {
        return deviceOverrides[action];
      }
    }
  }

  // 4. Default Device Permissions defined in the policy
  if (policy.defaultDevicePermissions && typeof policy.defaultDevicePermissions === 'object') {
    if (typeof policy.defaultDevicePermissions[action] === 'boolean') {
      return policy.defaultDevicePermissions[action];
    }
  }

  // 5. Global Policy Scope Fallback (Super Administrator unconstrained access)
  const isSuperAdmin =
    policy.id === 'policy-super-admin' ||
    (policy.targetScope === 'all' && (policy.priority || 0) >= 100);
  if (isSuperAdmin) {
    return true;
  }

  // 6. Safe backward-compatible fallback mapping from general policy flags:
  if (action === 'terminal') {
    return policy.terminalAccess === 'full' || policy.terminalAccess === 'view_only';
  }
  if (action === 'apply_template') {
    return Boolean(policy.canApplyTemplates);
  }
  if (action === 'write_memory') {
    return Boolean(policy.canWriteMemory);
  }
  if (action === 'delete_device' || action === 'edit_properties') {
    return Boolean(policy.canManageDevices);
  }
  if (action === 'export_devices') {
    if (policy.canExportDevices === false) return false;
    return Boolean(policy.canExportDevices || policy.canManageDevices || isSuperAdmin);
  }
  if (action === 'import_devices') {
    if (policy.canImportDevices === false) return false;
    return Boolean(policy.canImportDevices || policy.canManageDevices || isSuperAdmin);
  }
  if (action === 'export_templates') {
    if (policy.canExportTemplates === false) return false;
    return Boolean(policy.canExportTemplates ?? true);
  }
  if (action === 'import_templates') {
    if (policy.canImportTemplates === false) return false;
    return Boolean(policy.canImportTemplates ?? (policy.canManageDevices !== false));
  }

  // Fallback mappings for granular port & interface capabilities:
  if (action === 'port_power') {
    return policy.canToggleAdminStatus !== false && policy.canMikrotikToggleInterface !== false;
  }
  if (action === 'port_mode') {
    return policy.canToggleAdminStatus !== false && policy.canChangeVlan !== false;
  }
  if (action === 'port_vlan') {
    return policy.canChangeVlan !== false && policy.canMikrotikBridgeVlan !== false;
  }
  if (action === 'port_security') {
    return Boolean(policy.canTogglePortSecurity);
  }
  if (action === 'port_description') {
    return policy.canEditDescription !== false && policy.canMikrotikComment !== false;
  }
  if (action === 'port_bridge') {
    return policy.canMikrotikBridgeVlan !== false;
  }
  if (action === 'port_speed') {
    return policy.canMikrotikToggleInterface !== false;
  }
  if (action === 'port_cable_test') {
    return policy.canGenericDiagnostics !== false;
  }

  // Fallback mappings for MikroTik RouterOS capabilities & core services:
  if (action === 'mikrotik_safe_mode') {
    return policy.canMikrotikSafeMode !== false;
  }
  if (action === 'mikrotik_firewall') {
    return policy.canMikrotikFirewall !== false;
  }
  if (action === 'mikrotik_backup') {
    return policy.canMikrotikBackup !== false;
  }
  if (action === 'mikrotik_bridge_vlan') {
    return policy.canMikrotikBridgeVlan !== false;
  }
  if (action === 'mikrotik_toggle_interface') {
    return policy.canMikrotikToggleInterface !== false && policy.canToggleAdminStatus !== false;
  }
  if (action === 'mikrotik_vpn') {
    return policy.canManageDevices !== false;
  }
  if (action === 'mikrotik_comment') {
    return policy.canMikrotikComment !== false && policy.canEditDescription !== false;
  }
  if (action === 'mikrotik_ip_pool') {
    return policy.canMikrotikIpPool !== false;
  }

  // Fallback mappings for Cisco Switch Enterprise Configuration Suite:
  if (action === 'cisco_config_device') {
    return Boolean(policy.canManageDevices || policy.canApplyTemplates || isSuperAdmin);
  }
  if (action === 'cisco_config_vty_ssh') {
    return Boolean(policy.canManageDevices || isSuperAdmin);
  }
  if (action === 'cisco_config_ntp') {
    return Boolean(policy.canManageDevices || policy.canApplyTemplates || isSuperAdmin);
  }
  if (action === 'cisco_config_snmp') {
    return Boolean(policy.canManageDevices || isSuperAdmin);
  }
  if (action === 'cisco_config_users') {
    return Boolean(policy.canManageDevices || isSuperAdmin);
  }
  if (action === 'cisco_config_stp') {
    return Boolean(policy.canManageDevices || isSuperAdmin);
  }
  if (action === 'cisco_config_vtp') {
    return Boolean(policy.canManageDevices || isSuperAdmin);
  }
  if (action === 'cisco_config_syslog') {
    return Boolean(policy.canManageDevices || policy.canApplyTemplates || isSuperAdmin);
  }
  if (action === 'cisco_config_vlans') {
    return policy.canChangeVlan !== false && Boolean(policy.canManageDevices || isSuperAdmin);
  }
  if (action === 'cisco_config_l2_security') {
    return Boolean(policy.canTogglePortSecurity ?? policy.canManageDevices ?? isSuperAdmin);
  }
  if (action === 'cisco_config_write_memory') {
    return Boolean(policy.canWriteMemory || isSuperAdmin);
  }

  // Operational telemetry and memos are enabled by default for authorized equipment
  return true;
}

/**
 * Universally evaluates whether a target network device is in the authorized scope of an AccessPolicy.
 * Evaluates targetScope ('all' | 'groups' | 'specific'), targetGroupIds, targetDeviceIds, and allowedDeviceIds.
 */
export function canAccessDevice(
  policy: AccessPolicy | any | null | undefined,
  deviceId: string,
  deviceGroups?: Array<{ id: string; name?: string; deviceIds?: string[]; device_ids?: string[] }>
): boolean {
  if (!policy) return true;
  if (policy.canViewDevices === false) return false;
  if (isUserSuperAdmin(null, policy)) return true;

  // 1. Authoritative pre-computed allowedDeviceIds
  if (Array.isArray(policy.allowedDeviceIds)) {
    return policy.allowedDeviceIds.includes(deviceId);
  }

  // 2. Unrestricted scope
  if (policy.targetScope === 'all') {
    return true;
  }

  // 3. Specific devices selection
  if (policy.targetScope === 'specific') {
    return Array.isArray(policy.targetDeviceIds) && policy.targetDeviceIds.includes(deviceId);
  }

  // 4. Group-scoped equipment: check if device belongs to any of the policy's target groups
  if (policy.targetScope === 'groups') {
    if (!Array.isArray(deviceGroups) || deviceGroups.length === 0) {
      // If groups are not passed or empty, default to false under least-privilege
      return false;
    }
    const targetGroupSet = new Set(
      (policy.targetGroupIds || []).map((id: string) => (id || '').trim().toLowerCase())
    );
    for (const g of deviceGroups) {
      const gid = (g.id || '').trim().toLowerCase();
      const gname = (g.name || '').trim().toLowerCase();
      if (targetGroupSet.has(gid) || targetGroupSet.has(gname)) {
        const dIds = g.deviceIds || g.device_ids || [];
        if (dIds.includes(deviceId)) return true;
      }
    }
    return false;
  }

  return true;
}

/**
 * Client-side evaluation helper to test whether a given action is permitted on a target network device.
 * Accepts either the device object or its string ID, along with the action key and effective policy.
 */
export function isDeviceActionAllowed(
  device: { id: string } | string | null | undefined,
  actionKey: NetworkDeviceActionKey,
  policy: AccessPolicy | any | null | undefined
): boolean {
  if (!device) return false;
  const deviceId = typeof device === 'string' ? device : device.id;
  return isDeviceActionPermitted(policy, deviceId, actionKey);
}

/**
 * Universally evaluates whether a user or active policy is authorized to perform a specific action on a network device.
 * Conforms to both (policy, deviceId, action) and (user, policy, deviceId, action) calling signatures.
 */
export function canUserPerformDeviceAction(
  policy: AccessPolicy | any | null | undefined,
  deviceId: string,
  action: NetworkDeviceActionKey
): boolean;
export function canUserPerformDeviceAction(
  user: any,
  policy: AccessPolicy | any | null | undefined,
  deviceId: string,
  action: NetworkDeviceActionKey
): boolean;
export function canUserPerformDeviceAction(
  arg1: any,
  arg2: any,
  arg3: any,
  arg4?: any
): boolean {
  if (arg4 !== undefined) {
    // Called as (user, policy, deviceId, action)
    const policy = arg2;
    const deviceId = arg3;
    const action = arg4 as NetworkDeviceActionKey;
    return isDeviceActionPermitted(policy, deviceId, action);
  } else {
    // Called as (policy, deviceId, action)
    const policy = arg1;
    const deviceId = arg2;
    const action = arg3 as NetworkDeviceActionKey;
    return isDeviceActionPermitted(policy, deviceId, action);
  }
}

/**
 * Checks whether at least one operational action is permitted on the target network equipment
 * under the active AccessPolicy. Used to determine visibility of the 3-dots actions menu.
 */
export function hasAnyDeviceActionPermitted(
  policy: AccessPolicy | any | null | undefined,
  device: { id: string } | string | null | undefined
): boolean {
  if (!device) return false;
  const deviceId = typeof device === 'string' ? device : device.id;
  const actions: NetworkDeviceActionKey[] = [
    'web_configs',
    'terminal',
    'apply_template',
    'device_note',
    'edit_properties',
    'ping_keepalive',
    'inspect_ports',
    'write_memory',
    'delete_device',
    'port_power',
    'port_mode',
    'port_vlan',
    'port_security',
    'port_description',
    'port_bridge',
    'port_speed',
    'port_cable_test',
  ];
  return actions.some((act) => isDeviceActionPermitted(policy, deviceId, act));
}

/**
 * Universally evaluates whether an active session user and/or effective AccessPolicy
 * corresponds to a Super Administrator with supreme system authority.
 */
export function isUserSuperAdmin(
  user?: { username?: string; role?: string } | null | undefined,
  policy?: AccessPolicy | any | null | undefined
): boolean {
  if (!user && !policy) return false;
  const username = (user?.username || '').toLowerCase().trim();
  const role = (user?.role || '').toLowerCase().trim();
  return (
    username === 'admin' ||
    role.includes('super admin') ||
    role.includes('administrator') ||
    policy?.id === 'policy-super-admin' ||
    ((policy?.priority || 0) >= 100 && policy?.targetScope === 'all')
  );
}

/**
 * Strict RBAC rule: ONLY Super Administrator profiles possess the authority to access
 * the Settings navigation menu and all configuration sub-menus.
 */
export function canUserAccessSettings(
  user?: { username?: string; role?: string } | null | undefined,
  policy?: AccessPolicy | any | null | undefined
): boolean {
  return isUserSuperAdmin(user, policy);
}

/**
 * Evaluates whether a user or active policy is authorized to check for software updates.
 * Strict RBAC rule: ONLY Super Administrator profiles possess the authority to check for software updates.
 * Access is authoritative and linked to the Super Admin policy in the database.
 */
export function canUserCheckUpdate(
  user?: { username?: string; role?: string } | null | undefined,
  policy?: AccessPolicy | any | null | undefined
): boolean {
  if (!user && !policy) return false;
  if (!isUserSuperAdmin(user, policy)) return false;
  return policy?.canCheckUpdate !== false;
}

/**
 * Evaluates whether a user or active policy is authorized to trigger software updates.
 * Strict RBAC rule: ONLY Super Administrator profiles possess the authority to execute system upgrades or rebuilds.
 * Access is authoritative and linked to the Super Admin policy in the database.
 */
export function canUserPerformUpdate(
  user?: { username?: string; role?: string } | null | undefined,
  policy?: AccessPolicy | any | null | undefined
): boolean {
  if (!user && !policy) return false;
  if (!isUserSuperAdmin(user, policy)) return false;
  return policy?.canPerformUpdate !== false;
}

/**
 * Evaluates whether a user or active policy is authorized to export configuration templates.
 */
export function isTemplateExportPermitted(policy?: AccessPolicy | null, isSuperAdmin: boolean = false): boolean {
  if (isSuperAdmin) return true;
  if (!policy) return true;
  if (policy.canExportTemplates === false) return false;
  return Boolean(policy.canExportTemplates ?? true);
}

/**
 * Evaluates whether a user or active policy is authorized to import configuration templates.
 */
export function isTemplateImportPermitted(policy?: AccessPolicy | null, isSuperAdmin: boolean = false): boolean {
  if (isSuperAdmin) return true;
  if (!policy) return true;
  if (policy.canImportTemplates === false) return false;
  return Boolean(policy.canImportTemplates ?? (policy.canManageDevices !== false));
}

/**
 * Evaluates whether a user or active policy is authorized to apply configuration templates to devices.
 * Strict RBAC rule: Returns true if user is super admin or if active policy permits applying templates (canApplyTemplates !== false).
 */
export function isTemplateApplyPermitted(
  policy?: AccessPolicy | null,
  isSuperAdmin: boolean = false
): boolean {
  if (isSuperAdmin) return true;
  if (!policy) return true;
  if (policy.canApplyTemplates === false) return false;
  return Boolean(policy.canApplyTemplates);
}
