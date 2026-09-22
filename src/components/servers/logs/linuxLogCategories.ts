import { LinuxLogCategoryDetail, LinuxLogCategory } from '../../../types';

export const LINUX_LOG_CATEGORIES: LinuxLogCategoryDetail[] = [
  {
    id: 'journal',
    name: 'ژورنال جامع سیستم (Systemd Journal)',
    name_en: 'Systemd Journal (journalctl)',
    shortDesc: 'پایگاه داده متمرکز وقایع سرویس‌ها، کرنل و بوت',
    shortDesc_en: 'Centralized database for service, kernel, and boot events',
    defaultPaths: ['systemd-journald', '/var/log/journal/'],
    whatSitsHere:
      'تمامی پیام‌های خروجی استاندارد (stdout/stderr) دیمون‌ها و سرویس‌های systemd، رویدادهای شروع/توقف واحدهای سیستمی (Units)، پیام‌های استارت‌آپ بوت، هشدارهای cgroup، خطاهای کرنل و کلیه گزارشات ارسالی به socket سیستم در این بخش ثبت و به صورت باینری با ایندکس زمانی ذخیره می‌شوند.',
    whatSitsHere_en:
      'All stdout/stderr streams from systemd services and daemons, unit start/stop lifecycle events, boot sequences, cgroup resource alerts, kernel message streams, and all structured logs routed to the systemd socket are indexed and stored here.',
    whyNeeded:
      'عیب‌یابی سریع کرش سرویس‌ها، بررسی توالی زمان‌بندی بوت، ردگیری تغییرات وضعیت سیستم با فیلترهای قدرتمند براساس سرویس (Unit)، اولویت (Priority) یا محدوده زمانی دقیق بدون نیاز به باز کردن چندین فایل متنی مجزا.',
    whyNeeded_en:
      'Rapid troubleshooting of service crashes, tracking boot sequencing, and filtering system telemetry by unit, severity, or exact timestamp without parsing multiple legacy flat text files.',
    practicalExamples: [
      'systemd[1]: Started OpenSSH server daemon.',
      'dockerd[1245]: level=error msg="failed to start container: port already in use"',
      'nginx[840]: [emerg] 840#840: bind() to 0.0.0.0:80 failed (98: Address already in use)',
    ],
    practicalExamples_en: [
      'systemd[1]: Started OpenSSH server daemon.',
      'dockerd[1245]: level=error msg="failed to start container: port already in use"',
      'nginx[840]: [emerg] 840#840: bind() to 0.0.0.0:80 failed (98: Address already in use)',
    ],
    commandsUsed: ['journalctl -n 200 --no-pager', 'journalctl -u <unit>', 'journalctl -p err'],
  },
  {
    id: 'auth',
    name: 'امنیت و اعتبارسنجی (Authentication & Auth)',
    name_en: 'Authentication & Security (auth.log / secure)',
    shortDesc: 'لاگین‌های SSH، تلاش‌های ناموفق، دستورات sudo و PAM',
    shortDesc_en: 'SSH logins, failed attempts, sudo commands, and PAM events',
    defaultPaths: ['/var/log/auth.log', '/var/log/secure'],
    whatSitsHere:
      'گزارش کلیه نشست‌های احراز هویت کاربری شامل لاگین‌های موفق و ناموفق SSH، حملات حدس رمز عبور (Brute-Force)، درخواست‌های ارتقای دسترسی ریشه با sudo، رویدادهای ماژول‌های امنیتی PAM، افزودن/حذف کاربران و تغییرات کلیدهای احراز هویت در این فایل می‌نشیند.',
    whatSitsHere_en:
      'All user authentication sessions including successful and rejected SSH logins, brute-force password guessing attempts, privilege escalation requests via sudo, PAM policy transactions, user creations, and authentication key checks.',
    whyNeeded:
      'شناسایی نفوذهای امنیتی، رصد آی‌پی‌های مشکوک مهاجم، حسابرسی رفتار ادمین‌ها در استفاده از دسترسی ریشه (Root Audit) و تأیید تطابق استانداردهای امنیتی سازمان.',
    whyNeeded_en:
      'Intrusion detection, tracking malicious source IPs, auditing administrative root escalations, and fulfilling security compliance requirements.',
    practicalExamples: [
      'sshd[19342]: Failed password for invalid user admin from 198.51.100.23 port 45210 ssh2',
      'sshd[19342]: Accepted publickey for root from 192.168.1.50 port 52311 ssh2: RSA SHA256:...',
      'sudo: sysadmin : TTY=pts/0 ; PWD=/home/sysadmin ; USER=root ; COMMAND=/bin/systemctl restart nginx',
    ],
    practicalExamples_en: [
      'sshd[19342]: Failed password for invalid user admin from 198.51.100.23 port 45210 ssh2',
      'sshd[19342]: Accepted publickey for root from 192.168.1.50 port 52311 ssh2: RSA SHA256:...',
      'sudo: sysadmin : TTY=pts/0 ; PWD=/home/sysadmin ; USER=root ; COMMAND=/bin/systemctl restart nginx',
    ],
    commandsUsed: ['tail -n 200 /var/log/auth.log', 'tail -n 200 /var/log/secure'],
  },
  {
    id: 'syslog',
    name: 'وقایع سراسری سیستم (System Log / Messages)',
    name_en: 'System Events (syslog / messages)',
    shortDesc: 'رویدادهای عمومی سیستم‌عامل، شبکه و سرویس‌های غیرامنیتی',
    shortDesc_en: 'General OS events, network stack, and non-security daemons',
    defaultPaths: ['/var/log/syslog', '/var/log/messages'],
    whatSitsHere:
      'پیام‌های کلی سیستم‌عامل لینوکس شامل وقایع مدیر شبکه (NetworkManager)، تغییرات کارت‌های شبکه (Link Up/Down)، رخدادهای زمان‌بند کرون (CRON)، هشدارهای فضای دیسک، گزارشات سرویس‌های پس‌زمینه (rsyslog, dbus, chrony) و خطاهای سیستمی که به فایل اختصاصی هدایت نشده‌اند در این قسمت قرار می‌گیرند.',
    whatSitsHere_en:
      'General Linux OS events including NetworkManager connection changes, Ethernet link state flaps, cron executions, disk capacity warnings, generic background daemon heartbeats (dbus, chrony), and uncategorized system events.',
    whyNeeded:
      'بررسی سلامت کلی سرور، کشف علت قطعی ارتباط شبکه، بررسی اجرای خودکار سرویس‌ها و نظارت بر هشدارهای منابع قبل از وقوع بحران.',
    whyNeeded_en:
      'Monitoring overall server health, diagnosing network interface disconnects, tracking automated task triggers, and detecting resource warnings before critical failure.',
    practicalExamples: [
      'NetworkManager[620]: <info> [1714523000] device (eth0): carrier: link connected',
      'CRON[23101]: (root) CMD (/usr/local/bin/backup-sync.sh > /dev/null 2>&1)',
      'systemd-resolved[512]: Using degraded feature set UDP instead of UDP+EDNS0 for DNS server 1.1.1.1',
    ],
    practicalExamples_en: [
      'NetworkManager[620]: <info> [1714523000] device (eth0): carrier: link connected',
      'CRON[23101]: (root) CMD (/usr/local/bin/backup-sync.sh > /dev/null 2>&1)',
      'systemd-resolved[512]: Using degraded feature set UDP instead of UDP+EDNS0 for DNS server 1.1.1.1',
    ],
    commandsUsed: ['tail -n 200 /var/log/syslog', 'tail -n 200 /var/log/messages'],
  },
  {
    id: 'dmesg',
    name: 'بافر حلقوی هسته (Kernel Ring Buffer & dmesg)',
    name_en: 'Kernel Ring Buffer (dmesg / kern.log)',
    shortDesc: 'راه‌انداز سخت‌افزار، رم، درایورها و خطاهای بحرانی کرنل',
    shortDesc_en: 'Hardware init, RAM, hardware drivers, and kernel panics',
    defaultPaths: ['dmesg -T', '/var/log/dmesg', '/var/log/kern.log'],
    whatSitsHere:
      'پیام‌های مستقیم هسته لینوکس از لحظه استارت CPU: شناسایی پردازنده و چیپست، شناسایی حافظه رم، هشدارهای دمای پردازنده (Thermal Throttling)، شناسایی دیسک‌های NVMe/SATA، خطاهای I/O و بدسکتور دیسک، کشنده‌ی کمبود حافظه (Out Of Memory - OOM Killer) و پیام‌های درایورهای سخت‌افزاری در این بافر می‌نشیند.',
    whatSitsHere_en:
      'Direct kernel ring buffer telemetry starting from CPU boot: CPU/chipset initialization, RAM allocation, thermal throttling warnings, NVMe/SATA drive handshakes, I/O errors and bad blocks, Out-Of-Memory (OOM) killer terminations, and kernel hardware driver faults.',
    whyNeeded:
      'تشخیص نقایص فیزیکی سخت‌افزار، کشف علت کشته شدن ناگهانی پردازش‌های سنگین به دلیل کمبود رم (OOM Killer) و عیب‌یابی درایورهای شبکه یا ذخیره‌سازی.',
    whyNeeded_en:
      'Diagnosing physical hardware degradation, investigating sudden process kills caused by RAM exhaustion (OOM Killer), and debugging storage/network driver anomalies.',
    practicalExamples: [
      '[Sun Sep 22 10:14:02 2026] Out of memory: Killed process 15234 (mysqld) total-vm:4231804kB, anon-rss:2150148kB',
      '[Sun Sep 22 10:14:05 2026] e1000e 0000:00:19.0 eth0: NIC Link is Up 1000 Mbps Full Duplex',
      '[Sun Sep 22 10:14:10 2026] EXT4-fs (sda1): re-mounted. Opts: errors=remount-ro',
    ],
    practicalExamples_en: [
      '[Sun Sep 22 10:14:02 2026] Out of memory: Killed process 15234 (mysqld) total-vm:4231804kB, anon-rss:2150148kB',
      '[Sun Sep 22 10:14:05 2026] e1000e 0000:00:19.0 eth0: NIC Link is Up 1000 Mbps Full Duplex',
      '[Sun Sep 22 10:14:10 2026] EXT4-fs (sda1): re-mounted. Opts: errors=remount-ro',
    ],
    commandsUsed: ['dmesg -T', 'cat /var/log/dmesg', 'tail -n 200 /var/log/kern.log'],
  },
  {
    id: 'nginx',
    name: 'وب‌سرور انجین‌ایکس (Nginx Access & Error)',
    name_en: 'Nginx Web Server (Access & Error Logs)',
    shortDesc: 'درخواست‌های HTTP/HTTPS، کدهای وضعیت 4xx/5xx و خطاهای پروکسی',
    shortDesc_en: 'HTTP/HTTPS requests, 4xx/5xx status codes, and upstream errors',
    defaultPaths: ['/var/log/nginx/error.log', '/var/log/nginx/access.log'],
    whatSitsHere:
      'گزارش ترافیک وب و پروکسی معکوس شامل IP کلاینت‌ها، مسیرهای URL درخواست‌شده، متدهای HTTP (GET/POST)، کدهای پاسخ وب‌سرور (200, 403, 404, 502, 504)، خطاهای کامپایل کانفیگ، قطعی ارتباط با بک‌اند (Upstream Timeout) و هشدارهای سرتیفیکیت SSL در این بخش می‌نشیند.',
    whatSitsHere_en:
      'Web traffic and reverse proxy telemetry including client remote IPs, requested URI endpoints, HTTP request methods, response status codes, configuration syntax faults, upstream backend timeout errors, and SSL certificate handshake warnings.',
    whyNeeded:
      'بررسی ترافیک ورودی وب‌سایت‌ها و وب‌سرویس‌ها، تحلیل خطاهای 502 Bad Gateway، ردگیری اسکنرهای آسیب‌پذیری و ارزیابی زمان پاسخ‌دهی به کاربران.',
    whyNeeded_en:
      'Auditing incoming web application traffic, debugging 502 Bad Gateway / 504 Gateway Timeout errors, identifying web vulnerability scanners, and evaluating backend latency.',
    practicalExamples: [
      '192.168.1.100 - - [22/Sep/2026:10:12:05 +0000] "GET /api/v1/health HTTP/1.1" 200 45 "-" "curl/7.88.1"',
      '2026/09/22 10:12:08 [error] 1102#1102: *45 connect() failed (111: Connection refused) while connecting to upstream, client: 198.51.100.12',
    ],
    practicalExamples_en: [
      '192.168.1.100 - - [22/Sep/2026:10:12:05 +0000] "GET /api/v1/health HTTP/1.1" 200 45 "-" "curl/7.88.1"',
      '2026/09/22 10:12:08 [error] 1102#1102: *45 connect() failed (111: Connection refused) while connecting to upstream, client: 198.51.100.12',
    ],
    commandsUsed: ['tail -n 200 /var/log/nginx/error.log', 'tail -n 200 /var/log/nginx/access.log'],
  },
  {
    id: 'apache',
    name: 'وب‌سرور آپاچی (Apache / HTTPD)',
    name_en: 'Apache Web Server (error_log & access_log)',
    shortDesc: 'خطاهای ماژول‌های وب، rewrite rules و نشست‌های وب',
    shortDesc_en: 'Web module errors, URL rewrite rules, and HTTP sessions',
    defaultPaths: ['/var/log/apache2/error.log', '/var/log/httpd/error_log'],
    whatSitsHere:
      'گزارشات اجرایی سرویس‌دهنده آپاچی شامل خطاهای پرمیشن فایل‌های وب (.htaccess)، هشدارهای اسکریپت‌های PHP/CGI، کدهای خطای دسترسی 403 Forbidden و گزارش عملکرد ماژول‌های فعال آپاچی در این لاگ ذخیره می‌گردد.',
    whatSitsHere_en:
      'Runtime logs for Apache/HTTPD including .htaccess permission denied errors, PHP/CGI script exceptions, 403 Forbidden blocks, and Apache module lifecycle alerts.',
    whyNeeded:
      'اشکال‌زدایی پرتال‌ها و سامانه‌های مبتنی بر Apache/PHP، بررسی تداخل در قوانین mod_rewrite و مانیتورینگ کارایی سرویس‌های میزبانی وب.',
    whyNeeded_en:
      'Troubleshooting Apache/PHP portals, diagnosing mod_rewrite rule collisions, and monitoring web hosting virtual host stability.',
    practicalExamples: [
      '[Sun Sep 22 10:05:12.124501 2026] [core:error] [pid 4210] [client 192.168.1.20:41250] AH00035: access to /var/www/html/secret denied',
      '[Sun Sep 22 10:06:01.002150 2026] [mpm_event:notice] [pid 4100] AH00489: Apache/2.4.58 (Ubuntu) configured -- resuming normal operations',
    ],
    practicalExamples_en: [
      '[Sun Sep 22 10:05:12.124501 2026] [core:error] [pid 4210] [client 192.168.1.20:41250] AH00035: access to /var/www/html/secret denied',
      '[Sun Sep 22 10:06:01.002150 2026] [mpm_event:notice] [pid 4100] AH00489: Apache/2.4.58 (Ubuntu) configured -- resuming normal operations',
    ],
    commandsUsed: ['tail -n 200 /var/log/apache2/error.log', 'tail -n 200 /var/log/httpd/error_log'],
  },
  {
    id: 'dpkg',
    name: 'مدیریت بسته‌ها و نرم‌افزارها (Package Manager / dpkg / DNF)',
    name_en: 'Package Management (dpkg / apt / DNF)',
    shortDesc: 'تاریخچه نصب، ارتقا، حذف بسته‌ها و پچ‌های امنیتی',
    shortDesc_en: 'History of installed, upgraded, and removed software packages',
    defaultPaths: ['/var/log/dpkg.log', '/var/log/apt/history.log', '/var/log/dnf.log'],
    whatSitsHere:
      'تاریخچه و جزئیات دقیق بسته‌های نرم‌افزاری نصب‌شده، آپدیت‌های سیستمی انجام‌شده، نسخه‌های قبلی و جدید، بسته‌های حذف‌شده، اسکریپت‌های pre-install/post-install و پچ‌های امنیتی هسته در این فایل لاگ ثبت می‌شوند.',
    whatSitsHere_en:
      'Complete audit trail of installed packages, kernel security patches, package upgrades, version transitions, software removals, and post-installation hook script outputs.',
    whyNeeded:
      'بررسی دقیق اینکه در چه تاریخی چه برنامه‌ای آپدیت شده، کشف علت ناسازگاری بعد از یک آپدیت ناخواسته و بازرسی تغییرات نسخه پکیج‌ها.',
    whyNeeded_en:
      'Pinpointing exact dates and versions of software modifications, diagnosing dependency regressions after unintended updates, and software asset auditing.',
    practicalExamples: [
      '2026-09-22 09:15:30 install libssl3:amd64 <none> 3.0.13-0ubuntu3.1',
      '2026-09-22 09:15:32 upgrade openssh-server:amd64 1:9.6p1-3ubuntu13 1:9.6p1-3ubuntu13.4',
      '2026-09-22 09:16:01 remove telnetd:amd64 0.17-44 <none>',
    ],
    practicalExamples_en: [
      '2026-09-22 09:15:30 install libssl3:amd64 <none> 3.0.13-0ubuntu3.1',
      '2026-09-22 09:15:32 upgrade openssh-server:amd64 1:9.6p1-3ubuntu13 1:9.6p1-3ubuntu13.4',
      '2026-09-22 09:16:01 remove telnetd:amd64 0.17-44 <none>',
    ],
    commandsUsed: ['tail -n 200 /var/log/dpkg.log', 'tail -n 200 /var/log/apt/history.log'],
  },
  {
    id: 'cron',
    name: 'وظایف زمان‌بندی‌شده (Cron & Scheduled Tasks)',
    name_en: 'Cron & Scheduled Tasks (cron / crond)',
    shortDesc: 'اجرای خودکار اسکریپت‌ها، بک‌آپ‌ها و کارهای دوره‌ای',
    shortDesc_en: 'Automated script runs, database backups, and scheduled routines',
    defaultPaths: ['/var/log/cron', 'journalctl -u cron', 'grep CRON /var/log/syslog'],
    whatSitsHere:
      'اطلاعات زمان شروع و پایان وظایف دوره‌ای (Cron Jobs)، اسکریپت‌های نگهداری سیستم، گرفتن نسخه‌های پشتیبان شبانه، فراخوانی دوره‌ای اسکریپت‌های مانیتورینگ و خطاهای عدم اجرای وظایف در این بخش ثبت می‌شود.',
    whatSitsHere_en:
      'Execution timestamps, trigger intervals, and dispatch logs for crontab entries, system maintenance cronjobs, nightly database backups, and periodic telemetry scripts.',
    whyNeeded:
      'اطمینان از اینکه آیا بک‌آپ دیتابیس در ساعت مقرر اجرا شده است یا خیر، بررسی خطاهای اسکریپت‌های خودکار و ردگیری وظایف پنهانی که ممکن است بار اضافی روی پردازنده بگذارند.',
    whyNeeded_en:
      'Verifying automated backup executions, diagnosing background script triggers, and detecting rogue cron tasks causing periodic CPU spikes.',
    practicalExamples: [
      'CRON[15024]: (root) CMD (/opt/scripts/database-backup.sh)',
      'CRON[15023]: (root) MAIL (mailed 24 bytes of output but got status 0x004b#012)',
      'CRON[16200]: (www-data) CMD (/usr/bin/php -f /var/www/artisan schedule:run)',
    ],
    practicalExamples_en: [
      'CRON[15024]: (root) CMD (/opt/scripts/database-backup.sh)',
      'CRON[15023]: (root) MAIL (mailed 24 bytes of output but got status 0x004b#012)',
      'CRON[16200]: (www-data) CMD (/usr/bin/php -f /var/www/artisan schedule:run)',
    ],
    commandsUsed: ['tail -n 200 /var/log/cron', 'journalctl -u cron -n 200'],
  },
  {
    id: 'fail2ban',
    name: 'سرویس مسدودسازی خودکار مهاجمان (Fail2ban)',
    name_en: 'Intrusion Defense & Bans (Fail2ban)',
    shortDesc: 'آی‌پی‌های بن شده، جیل‌های فعال، رفع مسدودی و حملات خنثی‌شده',
    shortDesc_en: 'Banned attacker IPs, active jails, unbans, and thwarted attacks',
    defaultPaths: ['/var/log/fail2ban.log'],
    whatSitsHere:
      'رویدادهای سیستم ضدنفوذ Fail2ban شامل فیلتر کردن لاگ‌های احراز هویت، شناسایی حملات brute force مداوم، مسدود کردن فوری IP مهاجم در فایروال (iptables/nftables) در جیل‌های فعال (sshd, nginx-http-auth و ...)، و زمان آزاد شدن خودکار (Unban) در این فایل ذخیره می‌شود.',
    whatSitsHere_en:
      'Security events from the Fail2ban intrusion prevention daemon: detecting sustained brute-force attacks, triggering firewall ban rules (iptables/nftables) for malicious IPs, jail events (sshd, nginx), and ban expiration events.',
    whyNeeded:
      'بررسی حملات دفع‌شده علیه سرور، اطلاع از اینکه کدام IPها هم‌اکنون به دلیل تلاش‌های ناموفق بن شده‌اند و عیب‌یابی مسدود شدن تصادفی کاربران مجاز.',
    whyNeeded_en:
      'Monitoring prevented intrusions, auditing active blacklist jail entries, and unbanning legitimate users locked out after mistaken password entries.',
    practicalExamples: [
      'fail2ban.actions[812]: NOTICE [sshd] Ban 198.51.100.89',
      'fail2ban.filter[812]: INFO [sshd] Found 198.51.100.89 - 2026-09-22 09:20:11',
      'fail2ban.actions[812]: NOTICE [sshd] Unban 198.51.100.89',
    ],
    practicalExamples_en: [
      'fail2ban.actions[812]: NOTICE [sshd] Ban 198.51.100.89',
      'fail2ban.filter[812]: INFO [sshd] Found 198.51.100.89 - 2026-09-22 09:20:11',
      'fail2ban.actions[812]: NOTICE [sshd] Unban 198.51.100.89',
    ],
    commandsUsed: ['tail -n 200 /var/log/fail2ban.log', 'fail2ban-client status'],
  },
  {
    id: 'boot',
    name: 'لاگ استارت‌آپ و بوت سرور (Boot Sequence)',
    name_en: 'Boot Sequence (boot.log / journalctl -b)',
    shortDesc: 'مراحل بوت، بررسی سلامت فایل‌سیستم‌ها و راه‌اندازی سرویس‌ها',
    shortDesc_en: 'Boot stages, filesystem integrity checks, and initial daemon startup',
    defaultPaths: ['/var/log/boot.log', 'journalctl -b 0'],
    whatSitsHere:
      'ثبت مراحل گام‌به‌گام راه‌اندازی سرور پس از روشن شدن یا ریبوت: بارگذاری درایورهای اولیه از initramfs، بررسی سلامت دیسک‌ها با fsck، مانت شدن پارتیشن‌های /etc/fstab و استارت موفق یا ناموفق تارگت‌های پایه‌ای لینوکس در این بخش می‌نشیند.',
    whatSitsHere_en:
      'Step-by-step startup records generated upon server power-on or reboot: initial ramdisk driver loads (initramfs), disk checks with fsck, /etc/fstab partition mounts, and systemd target executions.',
    whyNeeded:
      'کشف علت بالا نیامدن سرور، یافتن سرویس‌هایی که زمان بوت را طولانی می‌کنند (Boot Delay) و اطمینان از سلامت دیسک‌ها در هنگام بالا آمدن.',
    whyNeeded_en:
      'Diagnosing boot delays, identifying failed mount points or units halting the boot sequence, and verifying filesystem integrity checks upon boot.',
    practicalExamples: [
      '[  OK  ] Mounted /boot/efi.',
      '[  OK  ] Reached target Local File Systems.',
      '[FAILED] Failed to start Wait for Network to be Configured.',
    ],
    practicalExamples_en: [
      '[  OK  ] Mounted /boot/efi.',
      '[  OK  ] Reached target Local File Systems.',
      '[FAILED] Failed to start Wait for Network to be Configured.',
    ],
    commandsUsed: ['cat /var/log/boot.log', 'journalctl -b 0 -n 200 --no-pager'],
  },
  {
    id: 'custom',
    name: 'مسیر دلخواه لاگ (Custom Log Path)',
    name_en: 'Custom Log Path Reader',
    shortDesc: 'مطالعه مستقیم هر فایل لاگ در دایرکتوری /var/log/',
    shortDesc_en: 'Inspect any designated log file located within /var/log/',
    defaultPaths: ['/var/log/...'],
    whatSitsHere:
      'مشاهده و پایش اختصاصی هر فایل متنی لاگ دلخواه در سرور لینوکس (مانند لاگ‌های مای‌اس‌کیو‌ال، ردیس، سامبا، داکر، مانیتورینگ اختصاصی یا میل‌سرور Postfix) با فیلترگذاری و جستجوی بلادرنگ.',
    whatSitsHere_en:
      'Directly view and monitor any specific log file in the Linux /var/log/ hierarchy (e.g., MySQL, Redis, Samba, Docker daemon, mail.log, Postfix) with real-time text filtering and live tailing.',
    whyNeeded:
      'پوشش کامل تمام نرم‌افزارها و دیتابیس‌های خاص نصب‌شده روی سرور که ممکن است در دسته‌بندی‌های پیش‌فرض قرار نگرفته باشند.',
    whyNeeded_en:
      'Complete coverage for specialized applications, database engines, or custom services deployed on the server outside standard system categories.',
    practicalExamples: [
      '/var/log/mysql/error.log',
      '/var/log/redis/redis-server.log',
      '/var/log/mail.log',
      '/var/log/samba/log.smbd',
    ],
    practicalExamples_en: [
      '/var/log/mysql/error.log',
      '/var/log/redis/redis-server.log',
      '/var/log/mail.log',
      '/var/log/samba/log.smbd',
    ],
    commandsUsed: ['tail -n 200 <customPath>'],
  },
];
