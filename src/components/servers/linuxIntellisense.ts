/**
 * Linux Terminal Intellisense & Authentic Bash Tab-Completion Engine
 * Bilingual support (English & Persian) with subcommands, flags, packages, services,
 * and a full POSIX-compliant Virtual File System (VFS) for directory and path autocompletion.
 */

export interface CommandSuggestion {
  command: string;
  syntax?: string;
  category: 'service' | 'docker' | 'network' | 'diagnostic' | 'file' | 'security' | 'package' | 'general';
  descEn: string;
  descFa: string;
  subcommands?: {
    name: string;
    descEn: string;
    descFa: string;
  }[];
  flags?: {
    flag: string;
    descEn: string;
    descFa: string;
  }[];
}

export const LINUX_COMMANDS_CATALOG: CommandSuggestion[] = [
  {
    command: 'cd',
    syntax: 'cd [directory]',
    category: 'file',
    descEn: 'Change the current working directory',
    descFa: 'تغییر دایرکتوری کاری جاری',
    subcommands: [
      { name: '~', descEn: 'Change to user home directory', descFa: 'تغییر به پوشه خانگی کاربر' },
      { name: '..', descEn: 'Move up one directory level', descFa: 'یک سطح به دایرکتوری والد رفتن' },
      { name: '-', descEn: 'Switch back to the previous directory', descFa: 'بازگشت به دایرکتوری قبلی' },
      { name: '/', descEn: 'Change to root filesystem directory', descFa: 'تغییر به ریشه سیستم‌فایل' },
      { name: '/etc', descEn: 'Change to system configuration directory', descFa: 'پوشه تنظیمات سیستمی' },
      { name: '/var/log', descEn: 'Change to system log directory', descFa: 'پوشه لاگ‌های سیستم' },
      { name: '/var/www', descEn: 'Change to web root directory', descFa: 'پوشه وب‌سرور' },
      { name: '/opt', descEn: 'Change to optional third-party software directory', descFa: 'پوشه نرم‌افزارهای اضافی' },
    ],
  },
  {
    command: 'pwd',
    syntax: 'pwd',
    category: 'file',
    descEn: 'Print name of current/working directory',
    descFa: 'نمایش مسیر کامل دایرکتوری کاری جاری',
  },
  {
    command: 'sudo',
    syntax: 'sudo [command]',
    category: 'security',
    descEn: 'Execute a command with superuser (root) privileges',
    descFa: 'اجرای دستور با دسترسی ریشه یا مدیر سیستم',
    flags: [
      { flag: '-i', descEn: 'Simulate initial root login shell', descFa: 'ورود به شل تعاملی ریشه' },
      { flag: '-u', descEn: 'Run command as specified user', descFa: 'اجرا تحت کاربری مشخص' },
    ],
  },
  {
    command: 'systemctl',
    syntax: 'systemctl [subcommand] [service_name]',
    category: 'service',
    descEn: 'Control systemd system and service manager',
    descFa: 'مدیریت و کنترل سرویس‌ها و ماژول‌های systemd',
    subcommands: [
      { name: 'status', descEn: 'Show current runtime status of a service', descFa: 'نمایش وضعیت کنونی و لاگ‌های سرویس' },
      { name: 'restart', descEn: 'Stop then start a unit immediately', descFa: 'راه‌اندازی مجدد و بلافاصله سرویس' },
      { name: 'start', descEn: 'Start (activate) one or more units', descFa: 'شروع و فعال‌سازی سرویس' },
      { name: 'stop', descEn: 'Stop (deactivate) one or more units', descFa: 'توقف و غیرفعال‌سازی سرویس' },
      { name: 'enable', descEn: 'Enable service to start automatically on boot', descFa: 'فعال‌سازی شروع خودکار در بوت سیستم' },
      { name: 'disable', descEn: 'Disable service auto-start on boot', descFa: 'غیرفعال‌سازی شروع خودکار در زمان بوت' },
      { name: 'reload', descEn: 'Reload configuration without dropping connections', descFa: 'بارگذاری مجدد تنظیمات بدون قطع اتصالات' },
      { name: 'daemon-reload', descEn: 'Reload systemd manager configuration and unit files', descFa: 'بارگذاری مجدد کلیه فایل‌های واحد systemd' },
      { name: 'list-units', descEn: 'List loaded and active system units', descFa: 'فهرست واحدهای فعال و بارگذاری‌شده' },
      { name: 'is-active', descEn: 'Check whether a unit is currently active', descFa: 'بررسی فعال بودن یک واحد' },
      { name: 'is-failed', descEn: 'Check whether a unit is in failed state', descFa: 'بررسی وضعیت خطا و fail شدن سرویس' },
    ],
  },
  {
    command: 'journalctl',
    syntax: 'journalctl [flags] [-u unit_name]',
    category: 'service',
    descEn: 'Query the systemd journal logs',
    descFa: 'مشاهده و تحلیل لاگ‌های جامع سیستم و ژورنال',
    flags: [
      { flag: '-u', descEn: 'Filter logs by specific systemd unit', descFa: 'فیلتر کردن لاگ‌ها بر اساس نام سرویس' },
      { flag: '-xe', descEn: 'Explain errors and jump to end of journal', descFa: 'توضیح کامل خطاها و پرش به انتهای لاگ' },
      { flag: '-f', descEn: 'Follow live incoming journal logs', descFa: 'مشاهده زنده و در لحظه لاگ‌ها' },
      { flag: '-n 50', descEn: 'Show recent 50 journal entries', descFa: 'نمایش ۵۰ سطر آخر لاگ' },
      { flag: '-b', descEn: 'Show logs only since the current boot', descFa: 'نمایش لاگ‌ها فقط از آخرین بوت سیستم' },
      { flag: '-p err', descEn: 'Filter by priority level (err, warning, info)', descFa: 'فیلتر بر اساس اولویت خطا' },
    ],
  },
  {
    command: 'docker',
    syntax: 'docker [subcommand] [arguments]',
    category: 'docker',
    descEn: 'Manage Docker containers, images, volumes, and networks',
    descFa: 'مدیریت کانتینرها، ایمیج‌ها و شبکه‌های داکر',
    subcommands: [
      { name: 'ps', descEn: 'List currently running containers', descFa: 'نمایش کانتینرهای فعال' },
      { name: 'ps -a', descEn: 'List all containers (running and stopped)', descFa: 'نمایش تمامی کانتینرها حتی خاموش' },
      { name: 'images', descEn: 'List local cached Docker images', descFa: 'فهرست ایمیج‌های داکر محلی' },
      { name: 'logs -f', descEn: 'Stream live container logs', descFa: 'مشاهده زنده لاگ‌های کانتینر' },
      { name: 'restart', descEn: 'Restart a running container', descFa: 'راه‌اندازی مجدد کانتینر' },
      { name: 'stop', descEn: 'Gracefully stop a running container', descFa: 'توقف آرام کانتینر' },
      { name: 'start', descEn: 'Start one or more stopped containers', descFa: 'استارت کانتینر متوقف‌شده' },
      { name: 'exec -it', descEn: 'Execute interactive bash shell inside container', descFa: 'اجرای ترمینال داخل کانتینر' },
      { name: 'compose up -d', descEn: 'Build and run compose stack in background', descFa: 'اجرای استک داکر کامپوز در پس‌زمینه' },
      { name: 'compose down', descEn: 'Stop and remove compose stack resources', descFa: 'توقف و حذف سرویس‌های کامپوز' },
      { name: 'network ls', descEn: 'List Docker virtual bridges and networks', descFa: 'فهرست شبکه‌های داکر' },
      { name: 'volume ls', descEn: 'List Docker persistent storage volumes', descFa: 'فهرست والیوم‌های داده داکر' },
      { name: 'system prune -a', descEn: 'Remove unused containers, networks, and images', descFa: 'پاک‌سازی موارد بلااستفاده داکر' },
    ],
  },
  {
    command: 'ip',
    syntax: 'ip [a | route | link | neigh] [arguments]',
    category: 'network',
    descEn: 'Modern Linux routing, network devices, interfaces, and tunnels',
    descFa: 'مدیریت و مشاهده کارت‌های شبکه، روت‌ها و آدرس‌های IP',
    subcommands: [
      { name: 'a', descEn: 'Show all IP addresses assigned to interfaces', descFa: 'نمایش آدرس‌های IP تمام اینترفیس‌ها' },
      { name: 'addr show', descEn: 'Detailed IP address information', descFa: 'اطلاعات تفصیلی آدرس‌های IP' },
      { name: '-br a', descEn: 'Brief single-line interface address summary', descFa: 'خلاصه تک‌خطی و تمیز اینترفیس‌ها' },
      { name: 'route show', descEn: 'Display Linux IP kernel routing table', descFa: 'نمایش جدول مسیریابی کرنل' },
      { name: 'link show', descEn: 'Display physical & virtual interface links and MACs', descFa: 'نمایش وضعیت لینک‌ها و آدرس‌های MAC' },
      { name: 'neigh show', descEn: 'Show ARP and neighbor cache table', descFa: 'نمایش جدول همسایگی و ARP کش' },
    ],
  },
  {
    command: 'ss',
    syntax: 'ss [flags]',
    category: 'network',
    descEn: 'Socket statistics utility (fast replacement for netstat)',
    descFa: 'آمار سوکت‌ها و پورت‌های باز (جایگزین پرسرعت netstat)',
    flags: [
      { flag: '-tulpn', descEn: 'Show listening TCP/UDP sockets with process PID and name', descFa: 'پورت‌های گوش‌به‌زنگ TCP/UDP همراه با نام فرآیند' },
      { flag: '-tlpn', descEn: 'Show listening TCP sockets only', descFa: 'نمایش پورت‌های باز TCP' },
      { flag: '-s', descEn: 'Summary statistics of open sockets', descFa: 'خلاصه آماری سوکت‌های باز' },
      { flag: '-ant', descEn: 'All TCP sockets (listening and established)', descFa: 'تمامی اتصالات فعال و در انتظار TCP' },
    ],
  },
  {
    command: 'netstat',
    syntax: 'netstat [flags]',
    category: 'network',
    descEn: 'Print network connections, routing tables, and interface stats',
    descFa: 'نمایش اتصالات شبکه، جدول روتینگ و وضعیت اینترفیس‌ها',
    flags: [
      { flag: '-tulpn', descEn: 'Show listening ports with PID & program name', descFa: 'پورت‌های باز همراه با شناسه برنامه' },
      { flag: '-rn', descEn: 'Display kernel routing table with numeric IPs', descFa: 'نمایش جدول مسیریابی کرنل با اعداد خام' },
      { flag: '-an', descEn: 'Show all active connections and ports numerically', descFa: 'نمایش عددی کلیه اتصالات شبکه' },
    ],
  },
  {
    command: 'curl',
    syntax: 'curl [flags] <url>',
    category: 'network',
    descEn: 'Transfer data from or to a server using supported protocols',
    descFa: 'ارسال و دریافت درخواست‌های HTTP/REST و بررسی پاسخ سرورها',
    flags: [
      { flag: '-I', descEn: 'Fetch HTTP headers only (HEAD request)', descFa: 'دریافت فقط هدرهای پاسخ HTTP' },
      { flag: '-s', descEn: 'Silent mode (don’t show progress meter or error messages)', descFa: 'حالت بی‌صدا بدون نوار پیشرفت' },
      { flag: '-k', descEn: 'Allow insecure server connections for self-signed SSL', descFa: 'چشم‌پوشی از گواهی SSL نامعتبر' },
      { flag: '-X GET', descEn: 'Specify custom HTTP GET request method', descFa: 'ارسال با متد GET' },
      { flag: '-X POST', descEn: 'Specify custom HTTP POST request method', descFa: 'ارسال با متد POST' },
      { flag: '-H "Content-Type: application/json"', descEn: 'Pass custom header', descFa: 'ارسال هدر سفارشی هدر JSON' },
    ],
  },
  {
    command: 'ping',
    syntax: 'ping [flags] <host_or_ip>',
    category: 'network',
    descEn: 'Send ICMP ECHO_REQUEST to network hosts',
    descFa: 'ارسال پکت‌های پینگ جهت بررسی پایداری و تأخیر شبکه',
    flags: [
      { flag: '-c 4', descEn: 'Stop after sending 4 ECHO_REQUEST packets', descFa: 'ارسال دقیقاً ۴ پکت و پایان تست' },
      { flag: '-i 0.2', descEn: 'Wait 0.2 seconds between sending each packet', descFa: 'فاصله ۲۰۰ میلی‌ثانیه بین پکت‌ها' },
      { flag: '-s 1400', descEn: 'Specify packet buffer size (MTU diagnostic)', descFa: 'اندازه بافر پکت برای تست MTU' },
    ],
  },
  {
    command: 'apt',
    syntax: 'apt [subcommand] [package_name]',
    category: 'package',
    descEn: 'High-level package manager for Debian / Ubuntu Linux',
    descFa: 'مدیریت نصب، ارتقا و بسته‌های نرم‌افزاری دبیان و اوبونتو',
    subcommands: [
      { name: 'update', descEn: 'Resynchronize the package index files from sources', descFa: 'به‌روزرسانی مخازن نرم‌افزاری' },
      { name: 'upgrade -y', descEn: 'Install the newest versions of all packages', descFa: 'ارتقای بسته‌های نصب‌شده به آخرین نسخه' },
      { name: 'install -y', descEn: 'Install one or more new packages automatically', descFa: 'نصب بسته‌های مشخص‌شده' },
      { name: 'remove', descEn: 'Remove packages but keep configuration files', descFa: 'حذف پکیج بدون پاک کردن کانفیگ‌ها' },
      { name: 'autoremove -y', descEn: 'Remove automatically installed unused dependency packages', descFa: 'پاک‌سازی وابستگی‌های بی‌استفاده' },
      { name: 'search', descEn: 'Search for available packages matching keyword', descFa: 'جستجوی پکیج در مخازن' },
      { name: 'show', descEn: 'Display detailed metadata and dependencies of package', descFa: 'مشاهده جزییات و متادیتا پکیج' },
    ],
  },
  {
    command: 'ufw',
    syntax: 'ufw [subcommand | status]',
    category: 'security',
    descEn: 'Uncomplicated Firewall - host-based security rules management',
    descFa: 'فایروال ساده و کارآمد لینوکس برای بستن یا باز کردن پورت‌ها',
    subcommands: [
      { name: 'status verbose', descEn: 'Show comprehensive firewall rules and port status', descFa: 'مشاهده کامل قوانین و پورت‌های باز' },
      { name: 'status numbered', descEn: 'Show rules with line numbers for deletion', descFa: 'نمایش قوانین با شماره ردیف جهت حذف' },
      { name: 'allow', descEn: 'Allow incoming traffic on port or protocol', descFa: 'مجاز کردن ترافیک ورودی روی پورت' },
      { name: 'deny', descEn: 'Block and drop incoming traffic on port or IP', descFa: 'مسدودسازی ترافیک روی پورت یا IP' },
      { name: 'enable', descEn: 'Activate firewall and start on boot', descFa: 'فعال‌سازی فایروال در سیستم' },
      { name: 'disable', descEn: 'Deactivate and disable firewall rules', descFa: 'غیرفعال‌سازی فایروال' },
      { name: 'reload', descEn: 'Reload active firewall rules', descFa: 'بارگذاری مجدد قوانین فایروال' },
    ],
  },
  {
    command: 'top',
    syntax: 'top',
    category: 'diagnostic',
    descEn: 'Display Linux processes and real-time CPU/RAM resource usage',
    descFa: 'نمایش فرآیندهای در حال اجرا و مصرف لحظه‌ای CPU و رم',
  },
  {
    command: 'htop',
    syntax: 'htop',
    category: 'diagnostic',
    descEn: 'Interactive real-time process viewer and system monitor',
    descFa: 'پایش تعاملی و پیشرفته گرافیکی منابع سیستم',
  },
  {
    command: 'df',
    syntax: 'df -h',
    category: 'diagnostic',
    descEn: 'Report filesystem disk space usage in human-readable format',
    descFa: 'نمایش فضای پر و خالی دیسک‌ها به فرمت خوانا',
    flags: [
      { flag: '-h', descEn: 'Print sizes in powers of 1024 (e.g., 1023M, 42G)', descFa: 'نمایش حجم به فرمت مگابایت و گیگابایت' },
      { flag: '-T', descEn: 'Print filesystem type (ext4, xfs, etc.)', descFa: 'نمایش نوع فایل‌سیستم' },
    ],
  },
  {
    command: 'free',
    syntax: 'free -m',
    category: 'diagnostic',
    descEn: 'Display amount of free and used physical memory in the system',
    descFa: 'نمایش حافظه رم اشغال‌شده، آزاد و کش‌شده سیستم',
    flags: [
      { flag: '-m', descEn: 'Display amount of memory in mebibytes', descFa: 'نمایش به مگابایت' },
      { flag: '-h', descEn: 'Show all output fields automatically scaled to shortest three-digit unit', descFa: 'نمایش با واحد متناسب و خوانا' },
    ],
  },
  {
    command: 'uname',
    syntax: 'uname -a',
    category: 'diagnostic',
    descEn: 'Print operating system name and kernel version information',
    descFa: 'نمایش نسخه دقیق هسته لینوکس و معماری سرور',
    flags: [
      { flag: '-a', descEn: 'Print all system architecture and release info', descFa: 'نمایش تمام جزییات معماری و نسخه کرنل' },
      { flag: '-r', descEn: 'Print the kernel release string', descFa: 'نمایش نسخه دقیق کرنل' },
    ],
  },
  {
    command: 'ps',
    syntax: 'ps aux',
    category: 'diagnostic',
    descEn: 'Report a snapshot of current running processes',
    descFa: 'عکس‌برداری و فهرست کلیه پردازش‌های جاری سرور',
    flags: [
      { flag: 'aux', descEn: 'Display processes for all users with BSD syntax', descFa: 'نمایش پردازش‌های کلیه کاربران با اطلاعات کامل' },
      { flag: '-ef', descEn: 'Standard full format listing of all processes', descFa: 'نمایش استاندارد با والد پردازش (PPID)' },
    ],
  },
  {
    command: 'tail',
    syntax: 'tail -f <file_path>',
    category: 'file',
    descEn: 'Output the last part of files and follow live updates',
    descFa: 'مشاهده خطوط پایانی فایل و پایش زنده تغییرات',
    flags: [
      { flag: '-f', descEn: 'Output appended data as the file grows', descFa: 'دنبال کردن زنده داده‌های جدید' },
      { flag: '-n 100', descEn: 'Output the last 100 lines instead of default 10', descFa: 'نمایش ۱۰۰ خط آخر فایل' },
    ],
  },
  {
    command: 'head',
    syntax: 'head -n 20 <file_path>',
    category: 'file',
    descEn: 'Output the first part of files',
    descFa: 'نمایش خطوط آغازین فایل',
    flags: [
      { flag: '-n 20', descEn: 'Print the first 20 lines of each file', descFa: 'نمایش ۲۰ خط اول فایل' },
    ],
  },
  {
    command: 'ls',
    syntax: 'ls -la [path]',
    category: 'file',
    descEn: 'List directory contents with permissions, owner, and size',
    descFa: 'فهرست فایل‌ها و پوشه‌ها با مجوزها، مالک و اندازه',
    flags: [
      { flag: '-la', descEn: 'Long listing format including hidden dotfiles', descFa: 'نمایش با جزییات کامل و فایل‌های مخفی' },
      { flag: '-lh', descEn: 'Long listing with human-readable file sizes', descFa: 'نمایش جزییات با حجم خوانا' },
    ],
  },
  {
    command: 'cat',
    syntax: 'cat <file_path>',
    category: 'file',
    descEn: 'Concatenate files and print on the standard output',
    descFa: 'نمایش محتویات متنی فایل روی ترمینال',
  },
  {
    command: 'nano',
    syntax: 'nano <file_path>',
    category: 'file',
    descEn: 'User-friendly terminal command-line text editor',
    descFa: 'ویرایشگر متنی ساده و محبوب در محیط ترمینال',
  },
  {
    command: 'vim',
    syntax: 'vim <file_path>',
    category: 'file',
    descEn: 'Highly configurable, powerful modal text editor',
    descFa: 'ویرایشگر متنی فوق‌پیشرفته و مدال ویم',
  },
  {
    command: 'mkdir',
    syntax: 'mkdir -p <directory>',
    category: 'file',
    descEn: 'Create directories if they do not already exist',
    descFa: 'ساخت دایرکتوری و پوشه جدید',
    flags: [
      { flag: '-p', descEn: 'No error if existing, make parent directories as needed', descFa: 'ایجاد پوشه‌های والد در صورت عدم وجود' },
    ],
  },
  {
    command: 'touch',
    syntax: 'touch <file_path>',
    category: 'file',
    descEn: 'Change file timestamps or create empty file if not existing',
    descFa: 'ایجاد فایل خالی یا به‌روزرسانی زمان فایل',
  },
  {
    command: 'rm',
    syntax: 'rm -rf <path>',
    category: 'file',
    descEn: 'Remove files or directories recursively',
    descFa: 'حذف فایل‌ها یا پوشه‌ها به صورت بازگشتی',
    flags: [
      { flag: '-rf', descEn: 'Recursively remove without prompting confirmation', descFa: 'حذف اجباری و بازگشتی بدون پرسش تأیید' },
      { flag: '-i', descEn: 'Prompt before every removal', descFa: 'پرسش تأیید قبل از هر حذف' },
    ],
  },
  {
    command: 'cp',
    syntax: 'cp -r <source> <dest>',
    category: 'file',
    descEn: 'Copy files and directories',
    descFa: 'کپی کردن فایل‌ها و پوشه‌ها',
    flags: [
      { flag: '-r', descEn: 'Copy directories recursively', descFa: 'کپی بازگشتی پوشه‌ها و محتویات' },
    ],
  },
  {
    command: 'mv',
    syntax: 'mv <source> <dest>',
    category: 'file',
    descEn: 'Move or rename files and directories',
    descFa: 'انتقال یا تغییر نام فایل‌ها و پوشه‌ها',
  },
  {
    command: 'chmod',
    syntax: 'chmod 755 <file_or_dir>',
    category: 'security',
    descEn: 'Change file mode bits (read/write/execute permissions)',
    descFa: 'تغییر سطوح دسترسی فایل و پوشه (مجوزها)',
    flags: [
      { flag: '755', descEn: 'Read/Write/Exec for owner, Read/Exec for others', descFa: 'دسترسی کامل برای مالک، خواندن و اجرا برای بقیه' },
      { flag: '644', descEn: 'Read/Write for owner, Read-only for others', descFa: 'دسترسی خواندن و نوشتن برای مالک، فقط خواندن برای سایرین' },
      { flag: '+x', descEn: 'Make file executable', descFa: 'قابل اجرا کردن فایل اسکریپت' },
    ],
  },
  {
    command: 'chown',
    syntax: 'chown -R user:group <path>',
    category: 'security',
    descEn: 'Change file owner and group',
    descFa: 'تغییر مالک و گروه فایل یا دایرکتوری',
    flags: [
      { flag: '-R', descEn: 'Operate on files and directories recursively', descFa: 'اعمال بازگشتی به تمامی زیرپوشه‌ها' },
    ],
  },
  {
    command: 'grep',
    syntax: 'grep -rn "keyword" <path>',
    category: 'file',
    descEn: 'Print lines matching a pattern recursively across files',
    descFa: 'جستجوی عبارات و الگوهای متنی در فایل‌ها و پوشه‌ها',
    flags: [
      { flag: '-rn', descEn: 'Recursive search with line numbers', descFa: 'جستجوی بازگشتی همراه با شماره خط' },
      { flag: '-i', descEn: 'Ignore case distinctions in patterns and input data', descFa: 'چشم‌پوشی از حروف کوچک و بزرگ' },
    ],
  },
  {
    command: 'tar',
    syntax: 'tar -czvf archive.tar.gz [path]',
    category: 'file',
    descEn: 'Archive files utility with gzip/bzip2 compression',
    descFa: 'فشرده‌سازی و آرشیو فایل‌ها و پوشه‌ها',
    flags: [
      { flag: '-czvf', descEn: 'Create gzip compressed tar archive with progress', descFa: 'ساخت فایل فشرده تار و زیپ با نمایش مراحل' },
      { flag: '-xzvf', descEn: 'Extract gzip compressed tar archive', descFa: 'استخراج و باز کردن فایل فشرده' },
    ],
  },
  {
    command: 'git',
    syntax: 'git [subcommand]',
    category: 'package',
    descEn: 'Fast, scalable, distributed revision control system',
    descFa: 'سیستم کنترل نسخه و مدیریت کدهای گیت',
    subcommands: [
      { name: 'status', descEn: 'Show the working tree status', descFa: 'نمایش وضعیت تغییرات مخزن' },
      { name: 'pull', descEn: 'Fetch from and integrate with another repository or a local branch', descFa: 'دریافت و ادغام تغییرات جدید' },
      { name: 'push', descEn: 'Update remote refs along with associated objects', descFa: 'ارسال تغییرات به سرور راه دور' },
      { name: 'commit -m', descEn: 'Record changes to the repository', descFa: 'ثبت تغییرات همراه با پیام' },
      { name: 'add .', descEn: 'Add file contents to the index', descFa: 'افزودن کلیه فایل‌ها به استیج' },
      { name: 'log --oneline', descEn: 'Show commit logs', descFa: 'مشاهده تاریخچه کامیت‌ها' },
      { name: 'branch', descEn: 'List, create, or delete branches', descFa: 'مدیریت شاخه‌ها' },
    ],
  },
  {
    command: 'whoami',
    syntax: 'whoami',
    category: 'security',
    descEn: 'Print effective userid of current logged in user',
    descFa: 'نمایش نام کاربری جاری فعال در شل',
  },
  {
    command: 'uptime',
    syntax: 'uptime -p',
    category: 'diagnostic',
    descEn: 'Tell how long the system has been running',
    descFa: 'نمایش مدت زمان روشن بودن و میانگین بار سرور',
  },
  {
    command: 'reboot',
    syntax: 'reboot',
    category: 'general',
    descEn: 'Reboot the server operating system',
    descFa: 'راه‌اندازی مجدد سرور',
  },
  {
    command: 'clear',
    syntax: 'clear',
    category: 'general',
    descEn: 'Clear terminal screen buffer',
    descFa: 'پاک‌سازی صفحه ترمینال',
  },
  {
    command: 'history',
    syntax: 'history',
    category: 'general',
    descEn: 'Display GNU bash command history list',
    descFa: 'نمایش تاریخچه دستورات اجرا شده در ترمینال',
  },
  {
    command: 'exit',
    syntax: 'exit',
    category: 'general',
    descEn: 'Exit the active terminal shell session',
    descFa: 'خروج و بستن نشست ترمینال',
  },
];

/**
 * Standard Linux commands commonly found in PATH on Debian/Ubuntu/RHEL
 */
export const STANDARD_LINUX_COMMANDS: string[] = [
  'alias', 'apt', 'apt-cache', 'apt-get', 'arch', 'arp', 'awk',
  'base64', 'basename', 'bash', 'blkid', 'btop', 'bzip2',
  'cal', 'cat', 'cd', 'certbot', 'chgrp', 'chmod', 'chown', 'chroot', 'clear', 'cp', 'crontab', 'curl', 'cut',
  'date', 'dd', 'df', 'diff', 'dig', 'dirname', 'dmesg', 'docker', 'docker-compose', 'dpkg', 'du',
  'echo', 'egrep', 'env', 'ethtool', 'exit', 'export',
  'fail2ban-client', 'fdisk', 'fgrep', 'file', 'find', 'free',
  'gcc', 'g++', 'git', 'grep', 'groups', 'gunzip', 'gzip',
  'head', 'history', 'host', 'hostname', 'hostnamectl', 'htop',
  'id', 'ifconfig', 'init', 'insmod', 'iostat', 'ip', 'iperf', 'iperf3', 'iptables', 'iptables-save', 'iwconfig',
  'journalctl', 'jq',
  'kill', 'killall',
  'last', 'less', 'ln', 'localectl', 'locate', 'loginctl', 'ls', 'lsblk', 'lscpu', 'lshw', 'lsmod', 'lsof', 'lspci', 'lsusb',
  'make', 'man', 'md5sum', 'mkdir', 'modprobe', 'more', 'mount', 'mpstat', 'mtr', 'mv',
  'nano', 'nc', 'netcat', 'netstat', 'nft', 'nice', 'nmap', 'node', 'nohup', 'npm', 'nslookup',
  'openssl',
  'passwd', 'pgrep', 'ping', 'ping6', 'pkill', 'pnpm', 'poweroff', 'prlimit', 'ps', 'pstree', 'pwd', 'python', 'python3',
  'readlink', 'realpath', 'reboot', 'reset', 'resize2fs', 'rm', 'rmdir', 'route', 'rsync',
  'scp', 'screen', 'sed', 'service', 'sftp', 'sh', 'sha256sum', 'shutdown', 'sleep', 'sort', 'source', 'ss', 'ssh', 'ssh-copy-id', 'ssh-keygen', 'sshd', 'stat', 'strace', 'sudo', 'sync', 'sysctl', 'systemctl', 'systemd-analyze',
  'tac', 'tail', 'tar', 'tcpdump', 'tee', 'time', 'timedatectl', 'tmux', 'top', 'touch', 'tr', 'tracepath', 'traceroute',
  'ufw', 'umount', 'uname', 'unalias', 'uniq', 'unzip', 'uptime', 'useradd', 'userdel', 'usermod',
  'vi', 'vim', 'vmstat',
  'w', 'watch', 'wc', 'wget', 'whereis', 'which', 'who', 'whoami', 'whois',
  'xargs', 'xz',
  'yarn', 'yum',
  'zip', 'zsh',
];

/**
 * Standard Linux Services for systemctl and journalctl autocomplete
 */
export const STANDARD_SERVICES: string[] = [
  'nginx',
  'docker',
  'ssh',
  'sshd',
  'mysql',
  'mariadb',
  'postgresql',
  'redis',
  'redis-server',
  'apache2',
  'ufw',
  'cron',
  'systemd-resolved',
  'systemd-journald',
  'networking',
  'fail2ban',
  'containerd',
];

/**
 * Standard Docker Container Names for docker autocomplete
 */
export const STANDARD_CONTAINERS: string[] = [
  'web-nginx',
  'api-server',
  'postgres-db',
  'redis-cache',
  'monitoring-prom',
  'grafana',
  'rabbitmq-queue',
];

/**
 * Common APT Packages
 */
export const STANDARD_PACKAGES: string[] = [
  'curl',
  'wget',
  'git',
  'htop',
  'nginx',
  'docker.io',
  'ufw',
  'net-tools',
  'build-essential',
  'python3',
  'python3-pip',
  'certbot',
  'tmux',
  'jq',
  'unzip',
  'vim',
  'zsh',
  'sudo',
  'rsync',
  'tcpdump',
  'fail2ban',
];

/**
 * Virtual Linux File System for authentic bash path autocomplete
 */
export interface VfsEntry {
  name: string;
  type: 'dir' | 'file' | 'executable';
}

export const LINUX_VFS: Record<string, VfsEntry[]> = {
  '/': [
    { name: 'bin', type: 'dir' },
    { name: 'boot', type: 'dir' },
    { name: 'dev', type: 'dir' },
    { name: 'etc', type: 'dir' },
    { name: 'home', type: 'dir' },
    { name: 'lib', type: 'dir' },
    { name: 'lib64', type: 'dir' },
    { name: 'media', type: 'dir' },
    { name: 'mnt', type: 'dir' },
    { name: 'opt', type: 'dir' },
    { name: 'proc', type: 'dir' },
    { name: 'root', type: 'dir' },
    { name: 'run', type: 'dir' },
    { name: 'sbin', type: 'dir' },
    { name: 'srv', type: 'dir' },
    { name: 'sys', type: 'dir' },
    { name: 'tmp', type: 'dir' },
    { name: 'usr', type: 'dir' },
    { name: 'var', type: 'dir' },
  ],
  '/etc': [
    { name: 'apt', type: 'dir' },
    { name: 'cron.d', type: 'dir' },
    { name: 'crontab', type: 'file' },
    { name: 'environment', type: 'file' },
    { name: 'fstab', type: 'file' },
    { name: 'group', type: 'file' },
    { name: 'hostname', type: 'file' },
    { name: 'hosts', type: 'file' },
    { name: 'init.d', type: 'dir' },
    { name: 'issue', type: 'file' },
    { name: 'modules', type: 'dir' },
    { name: 'network', type: 'dir' },
    { name: 'nginx', type: 'dir' },
    { name: 'os-release', type: 'file' },
    { name: 'passwd', type: 'file' },
    { name: 'resolv.conf', type: 'file' },
    { name: 'shadow', type: 'file' },
    { name: 'ssh', type: 'dir' },
    { name: 'ssl', type: 'dir' },
    { name: 'sudoers', type: 'file' },
    { name: 'systemd', type: 'dir' },
    { name: 'ufw', type: 'dir' },
  ],
  '/etc/nginx': [
    { name: 'conf.d', type: 'dir' },
    { name: 'fastcgi.conf', type: 'file' },
    { name: 'fastcgi_params', type: 'file' },
    { name: 'koi-utf', type: 'file' },
    { name: 'koi-win', type: 'file' },
    { name: 'mime.types', type: 'file' },
    { name: 'modules', type: 'dir' },
    { name: 'nginx.conf', type: 'file' },
    { name: 'proxy_params', type: 'file' },
    { name: 'scgi_params', type: 'file' },
    { name: 'sites-available', type: 'dir' },
    { name: 'sites-enabled', type: 'dir' },
    { name: 'snippets', type: 'dir' },
    { name: 'uwsgi_params', type: 'file' },
    { name: 'win-utf', type: 'file' },
  ],
  '/etc/nginx/conf.d': [
    { name: 'default.conf', type: 'file' },
    { name: 'ssl.conf', type: 'file' },
  ],
  '/etc/nginx/sites-available': [
    { name: 'default', type: 'file' },
    { name: 'api.conf', type: 'file' },
    { name: 'frontend.conf', type: 'file' },
  ],
  '/etc/nginx/sites-enabled': [
    { name: 'default', type: 'file' },
    { name: 'api.conf', type: 'file' },
  ],
  '/etc/ssh': [
    { name: 'ssh_config', type: 'file' },
    { name: 'sshd_config', type: 'file' },
    { name: 'ssh_host_rsa_key', type: 'file' },
    { name: 'ssh_host_rsa_key.pub', type: 'file' },
    { name: 'ssh_host_ed25519_key', type: 'file' },
  ],
  '/etc/systemd': [
    { name: 'journald.conf', type: 'file' },
    { name: 'logind.conf', type: 'file' },
    { name: 'resolved.conf', type: 'file' },
    { name: 'system', type: 'dir' },
  ],
  '/etc/systemd/system': [
    { name: 'docker.service', type: 'file' },
    { name: 'multi-user.target.wants', type: 'dir' },
    { name: 'nginx.service', type: 'file' },
    { name: 'app.service', type: 'file' },
  ],
  '/etc/apt': [
    { name: 'sources.list', type: 'file' },
    { name: 'sources.list.d', type: 'dir' },
    { name: 'trusted.gpg.d', type: 'dir' },
  ],
  '/var': [
    { name: 'backups', type: 'dir' },
    { name: 'cache', type: 'dir' },
    { name: 'crash', type: 'dir' },
    { name: 'lib', type: 'dir' },
    { name: 'local', type: 'dir' },
    { name: 'lock', type: 'dir' },
    { name: 'log', type: 'dir' },
    { name: 'mail', type: 'dir' },
    { name: 'opt', type: 'dir' },
    { name: 'run', type: 'dir' },
    { name: 'spool', type: 'dir' },
    { name: 'tmp', type: 'dir' },
    { name: 'www', type: 'dir' },
  ],
  '/var/log': [
    { name: 'alternatives.log', type: 'file' },
    { name: 'auth.log', type: 'file' },
    { name: 'boot.log', type: 'file' },
    { name: 'dpkg.log', type: 'file' },
    { name: 'journal', type: 'dir' },
    { name: 'lastlog', type: 'file' },
    { name: 'nginx', type: 'dir' },
    { name: 'syslog', type: 'file' },
    { name: 'ufw.log', type: 'file' },
    { name: 'wtmp', type: 'file' },
  ],
  '/var/log/nginx': [
    { name: 'access.log', type: 'file' },
    { name: 'error.log', type: 'file' },
  ],
  '/var/www': [
    { name: 'html', type: 'dir' },
    { name: 'app', type: 'dir' },
  ],
  '/var/www/html': [
    { name: 'app.js', type: 'file' },
    { name: 'index.html', type: 'file' },
    { name: 'robots.txt', type: 'file' },
    { name: 'style.css', type: 'file' },
  ],
  '/opt': [
    { name: 'containerd', type: 'dir' },
    { name: 'datadog-agent', type: 'dir' },
    { name: 'monitoring', type: 'dir' },
    { name: 'scripts', type: 'dir' },
  ],
  '/opt/scripts': [
    { name: 'backup.sh', type: 'executable' },
    { name: 'deploy.sh', type: 'executable' },
    { name: 'healthcheck.sh', type: 'executable' },
  ],
  '/tmp': [
    { name: 'backup.tar.gz', type: 'file' },
    { name: 'systemd-private-10293', type: 'dir' },
    { name: 'tmp.a83bfx', type: 'dir' },
  ],
  '/root': [
    { name: '.bash_history', type: 'file' },
    { name: '.bashrc', type: 'file' },
    { name: '.profile', type: 'file' },
    { name: '.ssh', type: 'dir' },
    { name: 'docker-compose.yml', type: 'file' },
    { name: 'projects', type: 'dir' },
    { name: 'README.md', type: 'file' },
    { name: 'scripts', type: 'dir' },
  ],
  '/root/.ssh': [
    { name: 'authorized_keys', type: 'file' },
    { name: 'config', type: 'file' },
    { name: 'id_rsa', type: 'file' },
    { name: 'id_rsa.pub', type: 'file' },
    { name: 'known_hosts', type: 'file' },
  ],
  '/root/projects': [
    { name: 'backend', type: 'dir' },
    { name: 'frontend', type: 'dir' },
    { name: 'microservices', type: 'dir' },
  ],
  '/root/scripts': [
    { name: 'backup.sh', type: 'executable' },
    { name: 'deploy.sh', type: 'executable' },
    { name: 'monitor.sh', type: 'executable' },
  ],
  '/home': [
    { name: 'user', type: 'dir' },
    { name: 'deploy', type: 'dir' },
  ],
  '/home/user': [
    { name: '.bash_history', type: 'file' },
    { name: '.bashrc', type: 'file' },
    { name: '.profile', type: 'file' },
    { name: '.ssh', type: 'dir' },
    { name: 'docker-compose.yml', type: 'file' },
    { name: 'projects', type: 'dir' },
    { name: 'README.md', type: 'file' },
    { name: 'scripts', type: 'dir' },
  ],
  '/home/user/.ssh': [
    { name: 'authorized_keys', type: 'file' },
    { name: 'config', type: 'file' },
    { name: 'id_rsa', type: 'file' },
    { name: 'id_rsa.pub', type: 'file' },
    { name: 'known_hosts', type: 'file' },
  ],
  '/usr': [
    { name: 'bin', type: 'dir' },
    { name: 'include', type: 'dir' },
    { name: 'lib', type: 'dir' },
    { name: 'local', type: 'dir' },
    { name: 'sbin', type: 'dir' },
    { name: 'share', type: 'dir' },
    { name: 'src', type: 'dir' },
  ],
  '/usr/local': [
    { name: 'bin', type: 'dir' },
    { name: 'etc', type: 'dir' },
    { name: 'games', type: 'dir' },
    { name: 'include', type: 'dir' },
    { name: 'lib', type: 'dir' },
    { name: 'sbin', type: 'dir' },
    { name: 'share', type: 'dir' },
    { name: 'src', type: 'dir' },
  ],
};

/**
 * Calculates Longest Common Prefix (LCP) of an array of strings
 */
export function getLongestCommonPrefix(strings: string[]): string {
  if (!strings || strings.length === 0) return '';
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (strings[i].indexOf(prefix) !== 0) {
      prefix = prefix.substring(0, prefix.length - 1);
      if (!prefix) return '';
    }
  }
  return prefix;
}

export interface IntellisenseCandidate {
  label: string;
  detail: string;
  detailFa: string;
  insertText: string;
  category?: string;
  isDir?: boolean;
}

export interface IntellisenseResult {
  ghostSuggestion: string; // Suffix for ghost text preview ahead of cursor
  completedInput: string; // Full string if user presses Tab
  candidates: IntellisenseCandidate[];
  exactMatch: boolean;
}

/**
 * Normalizes and resolves a Linux path in the VFS
 */
function resolveVfsPath(baseCwd: string, targetPath: string, homeDir: string): string {
  const normHome = homeDir.endsWith('/') && homeDir.length > 1 ? homeDir.slice(0, -1) : homeDir;
  let abs = '';

  if (!targetPath || targetPath === '~') {
    abs = normHome;
  } else if (targetPath.startsWith('~/')) {
    abs = `${normHome}/${targetPath.slice(2)}`;
  } else if (targetPath.startsWith('/')) {
    abs = targetPath;
  } else {
    const effectiveBase = (!baseCwd || baseCwd === '~')
      ? normHome
      : baseCwd.startsWith('~/')
      ? `${normHome}${baseCwd.substring(1)}`
      : baseCwd.startsWith('/')
      ? baseCwd
      : `${normHome}/${baseCwd}`;
    abs = `${effectiveBase}/${targetPath}`;
  }

  // Normalize segments
  const segments = abs.split('/').filter(Boolean);
  const resolved: string[] = [];
  for (const seg of segments) {
    if (seg === '.') continue;
    if (seg === '..') {
      if (resolved.length > 0) resolved.pop();
    } else {
      resolved.push(seg);
    }
  }

  return '/' + resolved.join('/');
}

/**
 * Generates path and filename completions against the Virtual File System (VFS)
 */
function getPathCompletions(
  token: string,
  cwd: string,
  homeDir: string,
  dirsOnly: boolean
): {
  candidates: IntellisenseCandidate[];
  bestToken: string;
  exactMatch: boolean;
} {
  const normHome = homeDir.endsWith('/') && homeDir.length > 1 ? homeDir.slice(0, -1) : homeDir;
  const effectiveCwd = (!cwd || cwd === '~')
    ? normHome
    : cwd.startsWith('~/')
    ? `${normHome}${cwd.substring(1)}`
    : cwd.startsWith('/')
    ? cwd
    : `${normHome}/${cwd}`;

  let parentPath = '';
  let namePrefix = '';
  let insertPrefix = '';

  if (token === '' || token === '.') {
    parentPath = effectiveCwd;
    namePrefix = token === '.' ? '.' : '';
    insertPrefix = token === '.' ? './' : '';
  } else if (token === '..') {
    parentPath = resolveVfsPath(effectiveCwd, '..', homeDir);
    namePrefix = '';
    insertPrefix = '../';
  } else if (token === '~') {
    parentPath = normHome;
    namePrefix = '';
    insertPrefix = '~/';
  } else if (token === '/') {
    parentPath = '/';
    namePrefix = '';
    insertPrefix = '/';
  } else if (token.startsWith('~/')) {
    const withoutTilde = token.substring(2);
    const lastSlash = withoutTilde.lastIndexOf('/');
    if (lastSlash === -1) {
      parentPath = normHome;
      namePrefix = withoutTilde;
      insertPrefix = '~/';
    } else {
      const subDir = withoutTilde.slice(0, lastSlash);
      parentPath = resolveVfsPath(normHome, subDir, homeDir);
      namePrefix = withoutTilde.slice(lastSlash + 1);
      insertPrefix = `~/${withoutTilde.slice(0, lastSlash + 1)}`;
    }
  } else if (token.startsWith('/')) {
    const lastSlash = token.lastIndexOf('/');
    if (lastSlash === 0) {
      parentPath = '/';
      namePrefix = token.slice(1);
      insertPrefix = '/';
    } else {
      parentPath = resolveVfsPath('/', token.slice(0, lastSlash), homeDir);
      namePrefix = token.slice(lastSlash + 1);
      insertPrefix = token.slice(0, lastSlash + 1);
    }
  } else {
    // Relative path (may or may not contain slashes, like "sites-a" or "../var/l")
    const lastSlash = token.lastIndexOf('/');
    if (lastSlash === -1) {
      parentPath = effectiveCwd;
      namePrefix = token;
      insertPrefix = '';
    } else {
      const relParent = token.slice(0, lastSlash);
      parentPath = resolveVfsPath(effectiveCwd, relParent, homeDir);
      namePrefix = token.slice(lastSlash + 1);
      insertPrefix = token.slice(0, lastSlash + 1);
    }
  }

  // Normalize parent path
  if (parentPath.length > 1 && parentPath.endsWith('/')) {
    parentPath = parentPath.slice(0, -1);
  }

  // Look up entries in VFS
  const entries = LINUX_VFS[parentPath] || [];
  const lowerPrefix = namePrefix.toLowerCase();

  const matched = entries.filter((entry) => {
    if (dirsOnly && entry.type !== 'dir') return false;
    // Hide hidden dotfiles unless user specifically typed a dot
    if (entry.name.startsWith('.') && !namePrefix.startsWith('.')) return false;
    return entry.name.toLowerCase().startsWith(lowerPrefix);
  });

  if (matched.length === 0) {
    return { candidates: [], bestToken: token, exactMatch: false };
  }

  const candidates: IntellisenseCandidate[] = matched.map((entry) => {
    const isDir = entry.type === 'dir';
    const label = isDir ? `${entry.name}/` : entry.name;
    const insertText = isDir ? `${insertPrefix}${entry.name}/` : `${insertPrefix}${entry.name} `;
    let detail = 'File';
    let detailFa = 'فایل معمولی';
    if (isDir) {
      detail = 'Directory';
      detailFa = 'پوشه / دایرکتوری';
    } else if (entry.type === 'executable') {
      detail = 'Executable script';
      detailFa = 'فایل اجرایی اسکریپت';
    }

    return {
      label,
      detail,
      detailFa,
      insertText,
      category: entry.type,
      isDir,
    };
  });

  if (matched.length === 1) {
    const single = candidates[0];
    return {
      candidates,
      bestToken: single.insertText,
      exactMatch: true,
    };
  }

  // Multiple candidates: calculate LCP across insertText values
  const insertTexts = candidates.map((c) => c.insertText);
  const lcp = getLongestCommonPrefix(insertTexts);
  const bestToken = lcp.length >= token.length ? lcp : token;

  return {
    candidates,
    bestToken,
    exactMatch: false,
  };
}

/**
 * Evaluates current input and generates authentic bash Tab-completion candidates and ghost text.
 */
export function getIntellisense(
  input: string,
  cwd: string = '~',
  homeDir: string = '/root'
): IntellisenseResult {
  const trimmedLeft = input.trimStart();
  if (!trimmedLeft) {
    return {
      ghostSuggestion: '',
      completedInput: input,
      candidates: LINUX_COMMANDS_CATALOG.slice(0, 8).map((c) => ({
        label: c.command,
        detail: c.descEn,
        detailFa: c.descFa,
        insertText: `${c.command} `,
        category: c.category,
      })),
      exactMatch: false,
    };
  }

  // Handle chained commands: |, &&, ||, ;
  // Find the active command segment being edited
  const pipelineRegex = /(?:&&|\|\||[|;])/g;
  let lastMatchIndex = -1;
  let match: RegExpExecArray | null;
  while ((match = pipelineRegex.exec(input)) !== null) {
    lastMatchIndex = match.index + match[0].length;
  }

  const prefixSegment = lastMatchIndex !== -1 ? input.slice(0, lastMatchIndex) : '';
  const activeSegment = lastMatchIndex !== -1 ? input.slice(lastMatchIndex) : input;
  const leadingSpace = activeSegment.slice(0, activeSegment.length - activeSegment.trimStart().length);
  const activeTrimmed = activeSegment.trimStart();

  // Support "sudo <cmd> <args>"
  const isSudo = activeTrimmed.startsWith('sudo ');
  const sudoPrefix = isSudo ? 'sudo ' : '';
  const commandLine = isSudo ? activeTrimmed.slice(5) : activeTrimmed;
  const parts = commandLine.trimStart().split(/\s+/);
  const hasTrailingSpace = commandLine.endsWith(' ');

  // Base prefix string to reconstruct the full input
  const fullPrefixBeforeActive = `${prefixSegment}${leadingSpace}${sudoPrefix}`;

  // =========================================================================
  // CASE 1: Typing Root Command (single word, no trailing space)
  // e.g. "sud", "dock", "apt", "nan", "sy", "vi"
  // =========================================================================
  if (parts.length === 1 && !hasTrailingSpace) {
    const word = parts[0].toLowerCase();

    // If starting with ./ or ../ or /, it's an executable path!
    if (word.startsWith('./') || word.startsWith('../') || word.startsWith('/')) {
      const pathResult = getPathCompletions(parts[0], cwd, homeDir, false);
      if (pathResult.candidates.length > 0) {
        const ghost = pathResult.bestToken.startsWith(parts[0])
          ? pathResult.bestToken.slice(parts[0].length)
          : '';
        return {
          ghostSuggestion: ghost,
          completedInput: `${fullPrefixBeforeActive}${pathResult.bestToken}`,
          candidates: pathResult.candidates,
          exactMatch: pathResult.exactMatch,
        };
      }
    }

    // Combine standard Linux binaries with our rich catalog
    const matchedCommands = Array.from(
      new Set([
        ...LINUX_COMMANDS_CATALOG.map((c) => c.command),
        ...STANDARD_LINUX_COMMANDS,
      ])
    ).filter((cmd) => cmd.toLowerCase().startsWith(word));

    if (matchedCommands.length === 0) {
      return { ghostSuggestion: '', completedInput: input, candidates: [], exactMatch: false };
    }

    const lcp = getLongestCommonPrefix(matchedCommands);

    const candidates: IntellisenseCandidate[] = matchedCommands.map((cmd) => {
      const catEntry = LINUX_COMMANDS_CATALOG.find((c) => c.command.toLowerCase() === cmd.toLowerCase());
      return {
        label: cmd,
        detail: catEntry?.descEn || 'Linux command utility',
        detailFa: catEntry?.descFa || 'دستور استاندارد لینوکس',
        insertText: `${cmd} `,
        category: catEntry?.category || 'general',
      };
    });

    if (matchedCommands.length === 1) {
      const best = matchedCommands[0];
      const ghost = best.slice(word.length) + ' ';
      return {
        ghostSuggestion: ghost,
        completedInput: `${fullPrefixBeforeActive}${best} `,
        candidates,
        exactMatch: true,
      };
    }

    const ghost = lcp.length > word.length ? lcp.slice(word.length) : '';
    return {
      ghostSuggestion: ghost,
      completedInput: `${fullPrefixBeforeActive}${lcp}`,
      candidates,
      exactMatch: false,
    };
  }

  // =========================================================================
  // CASE 2: Arguments, Subcommands, Services, Containers, Flags, Paths
  // e.g. "cd /etc/ng", "cat hosts", "systemctl status ng", "docker logs we"
  // =========================================================================
  const mainCmd = parts[0].toLowerCase();
  const currentToken = hasTrailingSpace ? '' : (parts[parts.length - 1] || '');
  const prefixParts = hasTrailingSpace ? parts : parts.slice(0, -1);
  const prefixStr = `${fullPrefixBeforeActive}${prefixParts.join(' ')}${prefixParts.length > 0 ? ' ' : ''}`;

  // 2.A: Special systemctl service autocompletion
  if (mainCmd === 'systemctl') {
    const subCmd = parts[1]?.toLowerCase();
    const serviceTargets = ['start', 'stop', 'restart', 'status', 'enable', 'disable', 'reload', 'is-active', 'is-failed'];
    if (subCmd && serviceTargets.includes(subCmd) && (parts.length > 2 || hasTrailingSpace)) {
      const tokenLower = currentToken.toLowerCase();
      const matchedServices = STANDARD_SERVICES.filter((s) => s.toLowerCase().startsWith(tokenLower));
      if (matchedServices.length > 0) {
        const lcp = getLongestCommonPrefix(matchedServices);
        const candidates: IntellisenseCandidate[] = matchedServices.map((srv) => ({
          label: srv,
          detail: `systemd service unit (${srv}.service)`,
          detailFa: `سرویس و واحد سیستمی ${srv}`,
          insertText: `${srv} `,
          category: 'service',
        }));

        if (matchedServices.length === 1) {
          const best = matchedServices[0];
          const ghost = best.slice(tokenLower.length) + ' ';
          return {
            ghostSuggestion: ghost,
            completedInput: `${prefixStr}${best} `,
            candidates,
            exactMatch: true,
          };
        }

        const ghost = lcp.length > tokenLower.length ? lcp.slice(tokenLower.length) : '';
        return {
          ghostSuggestion: ghost,
          completedInput: `${prefixStr}${lcp}`,
          candidates,
          exactMatch: false,
        };
      }
    }
  }

  // 2.B: Special journalctl -u service completion
  if (mainCmd === 'journalctl') {
    const prevToken = hasTrailingSpace ? parts[parts.length - 1] : parts[parts.length - 2];
    if (prevToken === '-u') {
      const tokenLower = currentToken.toLowerCase();
      const matchedServices = STANDARD_SERVICES.filter((s) => s.toLowerCase().startsWith(tokenLower));
      if (matchedServices.length > 0) {
        const lcp = getLongestCommonPrefix(matchedServices);
        const candidates: IntellisenseCandidate[] = matchedServices.map((srv) => ({
          label: srv,
          detail: `Journal unit logs for ${srv}`,
          detailFa: `لاگ‌های ژورنال سرویس ${srv}`,
          insertText: `${srv} `,
          category: 'service',
        }));

        if (matchedServices.length === 1) {
          const best = matchedServices[0];
          const ghost = best.slice(tokenLower.length) + ' ';
          return {
            ghostSuggestion: ghost,
            completedInput: `${prefixStr}${best} `,
            candidates,
            exactMatch: true,
          };
        }

        const ghost = lcp.length > tokenLower.length ? lcp.slice(tokenLower.length) : '';
        return {
          ghostSuggestion: ghost,
          completedInput: `${prefixStr}${lcp}`,
          candidates,
          exactMatch: false,
        };
      }
    }
  }

  // 2.C: Special docker container completion
  if (mainCmd === 'docker') {
    const subCmd = parts[1]?.toLowerCase();
    const containerTargets = ['logs', 'restart', 'stop', 'start', 'rm', 'inspect', 'exec'];
    if (subCmd && containerTargets.includes(subCmd) && (parts.length > 2 || hasTrailingSpace)) {
      const tokenLower = currentToken.toLowerCase();
      const matchedContainers = STANDARD_CONTAINERS.filter((c) => c.toLowerCase().startsWith(tokenLower));
      if (matchedContainers.length > 0) {
        const lcp = getLongestCommonPrefix(matchedContainers);
        const candidates: IntellisenseCandidate[] = matchedContainers.map((cnt) => ({
          label: cnt,
          detail: `Docker running container (${cnt})`,
          detailFa: `کانتینر فعال داکر ${cnt}`,
          insertText: `${cnt} `,
          category: 'docker',
        }));

        if (matchedContainers.length === 1) {
          const best = matchedContainers[0];
          const ghost = best.slice(tokenLower.length) + ' ';
          return {
            ghostSuggestion: ghost,
            completedInput: `${prefixStr}${best} `,
            candidates,
            exactMatch: true,
          };
        }

        const ghost = lcp.length > tokenLower.length ? lcp.slice(tokenLower.length) : '';
        return {
          ghostSuggestion: ghost,
          completedInput: `${prefixStr}${lcp}`,
          candidates,
          exactMatch: false,
        };
      }
    }
  }

  // 2.D: Special apt package installation completion
  if (mainCmd === 'apt' || mainCmd === 'apt-get') {
    const subCmd = parts[1]?.toLowerCase();
    if ((subCmd === 'install' || subCmd === 'remove' || subCmd === 'purge') && (parts.length > 2 || hasTrailingSpace)) {
      const tokenLower = currentToken.toLowerCase();
      const matchedPackages = STANDARD_PACKAGES.filter((p) => p.toLowerCase().startsWith(tokenLower));
      if (matchedPackages.length > 0) {
        const lcp = getLongestCommonPrefix(matchedPackages);
        const candidates: IntellisenseCandidate[] = matchedPackages.map((pkg) => ({
          label: pkg,
          detail: `APT software package: ${pkg}`,
          detailFa: `بسته نرم‌افزاری اوبونتو/دبیان: ${pkg}`,
          insertText: `${pkg} `,
          category: 'package',
        }));

        if (matchedPackages.length === 1) {
          const best = matchedPackages[0];
          const ghost = best.slice(tokenLower.length) + ' ';
          return {
            ghostSuggestion: ghost,
            completedInput: `${prefixStr}${best} `,
            candidates,
            exactMatch: true,
          };
        }

        const ghost = lcp.length > tokenLower.length ? lcp.slice(tokenLower.length) : '';
        return {
          ghostSuggestion: ghost,
          completedInput: `${prefixStr}${lcp}`,
          candidates,
          exactMatch: false,
        };
      }
    }
  }

  // 2.E: Catalog Subcommands and Flags completion (e.g. systemctl [status|restart], docker [ps|images], ss [-tulpn])
  const catalogEntry = LINUX_COMMANDS_CATALOG.find((c) => c.command.toLowerCase() === mainCmd);
  const availableOptions: { label: string; detail: string; detailFa: string; insertText: string }[] = [];

  if (catalogEntry) {
    if (catalogEntry.subcommands && (parts.length === 2 && !hasTrailingSpace)) {
      for (const sub of catalogEntry.subcommands) {
        availableOptions.push({
          label: sub.name,
          detail: sub.descEn,
          detailFa: sub.descFa,
          insertText: `${sub.name} `,
        });
      }
    }

    if (catalogEntry.flags && (currentToken.startsWith('-') || parts.length >= 2)) {
      for (const fl of catalogEntry.flags) {
        availableOptions.push({
          label: fl.flag,
          detail: fl.descEn,
          detailFa: fl.descFa,
          insertText: `${fl.flag} `,
        });
      }
    }
  }

  // Check if current token matches subcommands/flags
  if (availableOptions.length > 0 && !currentToken.includes('/') && !currentToken.startsWith('~')) {
    const tokenLower = currentToken.toLowerCase();
    const filtered = availableOptions.filter((opt) => opt.label.toLowerCase().startsWith(tokenLower));

    if (filtered.length > 0) {
      const optionLabels = filtered.map((f) => f.label);
      const lcp = getLongestCommonPrefix(optionLabels);

      if (filtered.length === 1) {
        const best = filtered[0].label;
        const ghost = best.slice(tokenLower.length) + ' ';
        return {
          ghostSuggestion: ghost,
          completedInput: `${prefixStr}${best} `,
          candidates: filtered,
          exactMatch: true,
        };
      }

      const ghost = lcp.length > tokenLower.length ? lcp.slice(tokenLower.length) : '';
      return {
        ghostSuggestion: ghost,
        completedInput: `${prefixStr}${lcp}`,
        candidates: filtered,
        exactMatch: false,
      };
    }
  }

  // 2.F: VFS Path Autocompletion (cd, ls, cat, nano, vim, vi, tail, head, grep, rm, cp, mv, touch, mkdir, chmod, chown, etc.)
  const isCd = mainCmd === 'cd' || mainCmd === 'rmdir';
  const pathResult = getPathCompletions(currentToken, cwd, homeDir, isCd);

  if (pathResult.candidates.length > 0) {
    const ghost = pathResult.bestToken.startsWith(currentToken)
      ? pathResult.bestToken.slice(currentToken.length)
      : '';

    return {
      ghostSuggestion: ghost,
      completedInput: `${prefixStr}${pathResult.bestToken}`,
      candidates: pathResult.candidates,
      exactMatch: pathResult.exactMatch,
    };
  }

  return { ghostSuggestion: '', completedInput: input, candidates: [], exactMatch: false };
}
