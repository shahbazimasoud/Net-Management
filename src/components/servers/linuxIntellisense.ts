/**
 * Linux Terminal Intellisense & Tab-Completion Engine
 * Bilingual support (English & Persian) with subcommands and flags.
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
    command: 'ls',
    syntax: 'ls -la',
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
];

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

export interface IntellisenseResult {
  ghostSuggestion: string; // The suffix to preview in ghost text ahead of the cursor
  completedInput: string; // The new full input string if user presses Tab
  candidates: {
    label: string;
    detail: string;
    detailFa: string;
    insertText: string;
    category?: string;
  }[];
  exactMatch: boolean;
}

/**
 * Evaluates current input and generates Intellisense completion candidates
 */
export function getIntellisense(input: string): IntellisenseResult {
  const trimmedLeft = input.trimStart();
  if (!trimmedLeft) {
    return {
      ghostSuggestion: '',
      completedInput: input,
      candidates: LINUX_COMMANDS_CATALOG.slice(0, 10).map((c) => ({
        label: c.command,
        detail: c.descEn,
        detailFa: c.descFa,
        insertText: c.command,
        category: c.category,
      })),
      exactMatch: false,
    };
  }

  const parts = trimmedLeft.split(/\s+/);
  const leadingSpace = input.slice(0, input.length - trimmedLeft.length);

  // Case 1: Typing the main root command (1 word, no trailing space)
  if (parts.length === 1 && !input.endsWith(' ')) {
    const word = parts[0].toLowerCase();
    const matches = LINUX_COMMANDS_CATALOG.filter((c) => c.command.toLowerCase().startsWith(word));

    if (matches.length === 0) {
      return { ghostSuggestion: '', completedInput: input, candidates: [], exactMatch: false };
    }

    const commandNames = matches.map((m) => m.command);
    const lcp = getLongestCommonPrefix(commandNames);

    const candidates = matches.map((m) => ({
      label: m.command,
      detail: m.descEn,
      detailFa: m.descFa,
      insertText: m.command + ' ',
      category: m.category,
    }));

    if (matches.length === 1) {
      const best = matches[0].command;
      const ghost = best.slice(word.length) + ' ';
      return {
        ghostSuggestion: ghost,
        completedInput: `${leadingSpace}${best} `,
        candidates,
        exactMatch: true,
      };
    }

    const ghost = lcp.length > word.length ? lcp.slice(word.length) : '';
    return {
      ghostSuggestion: ghost,
      completedInput: `${leadingSpace}${lcp}`,
      candidates,
      exactMatch: false,
    };
  }

  // Case 2: Subcommand / Flag completion
  const mainCmd = parts[0].toLowerCase();
  const catalogEntry = LINUX_COMMANDS_CATALOG.find((c) => c.command.toLowerCase() === mainCmd);

  if (!catalogEntry) {
    return { ghostSuggestion: '', completedInput: input, candidates: [], exactMatch: false };
  }

  const currentToken = input.endsWith(' ') ? '' : (parts[parts.length - 1] || '');
  const prefixParts = input.endsWith(' ') ? parts : parts.slice(0, -1);
  const prefixStr = leadingSpace + prefixParts.join(' ') + (prefixParts.length > 0 ? ' ' : '');

  const availableOptions: { label: string; detail: string; detailFa: string; insertText: string }[] = [];

  if (catalogEntry.subcommands) {
    for (const sub of catalogEntry.subcommands) {
      availableOptions.push({
        label: sub.name,
        detail: sub.descEn,
        detailFa: sub.descFa,
        insertText: sub.name + ' ',
      });
    }
  }

  if (catalogEntry.flags) {
    for (const fl of catalogEntry.flags) {
      availableOptions.push({
        label: fl.flag,
        detail: fl.descEn,
        detailFa: fl.descFa,
        insertText: fl.flag + ' ',
      });
    }
  }

  const tokenLower = currentToken.toLowerCase();
  const filtered = availableOptions.filter((opt) => opt.label.toLowerCase().startsWith(tokenLower));

  if (filtered.length === 0) {
    return { ghostSuggestion: '', completedInput: input, candidates: [], exactMatch: false };
  }

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
