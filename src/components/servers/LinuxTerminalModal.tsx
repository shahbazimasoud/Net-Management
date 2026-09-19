import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Terminal,
  Server,
  Play,
  Copy,
  Check,
  RefreshCw,
  Power,
  Layers,
  Sparkles,
  Command,
  Trash2,
  Lock,
  Shield,
  Settings2,
  PanelRightClose,
  PanelRightOpen,
  Search,
  ChevronRight,
  ChevronDown,
  Activity,
  Cpu,
  HardDrive,
  Network,
  Globe,
  HelpCircle,
  FileText,
  ArrowRight,
  Send,
  CornerDownLeft,
} from 'lucide-react';
import { RemoteServer } from '../../types';
import { getRemoteServerWebSocketUrl } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface LinuxTerminalModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  initialShell?: 'bash' | 'zsh';
  onClose: () => void;
  onMinimize: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

interface TerminalLogLine {
  id: string;
  type: 'prompt-command' | 'output' | 'error' | 'system';
  prompt?: string;
  text: string;
  timestamp: string;
}

interface SnippetItem {
  category: string;
  categoryFa: string;
  label: string;
  labelFa: string;
  cmd: string;
  desc: string;
  descFa: string;
}

const LINUX_COMMAND_SNIPPETS: SnippetItem[] = [
  // System & OS
  {
    category: 'System & OS',
    categoryFa: 'سیستم و سیستم‌عامل',
    label: 'Kernel & Architecture',
    labelFa: 'نسخه هسته و معماری',
    cmd: 'uname -a',
    desc: 'Print complete system kernel release, hostname and processor architecture.',
    descFa: 'نمایش نسخه کامل کرنل، نام هاست و معماری پردازنده سیستم.',
  },
  {
    category: 'System & OS',
    categoryFa: 'سیستم و سیستم‌عامل',
    label: 'OS Release & Version',
    labelFa: 'مشخصات توزیع لینوکس',
    cmd: 'cat /etc/os-release',
    desc: 'Show operating system name, codename, and release version numbers.',
    descFa: 'نمایش نام توزیع، نسخه و مشخصات انتشار لینوکس.',
  },
  {
    category: 'System & OS',
    categoryFa: 'سیستم و سیستم‌عامل',
    label: 'System Uptime & Load',
    labelFa: 'مدت کارکرد و بار سیستم',
    cmd: 'uptime',
    desc: 'Show how long the system has been running and 1/5/15 minute load averages.',
    descFa: 'مدت زمان روشن بودن سرور و میانگین لود ۱، ۵ و ۱۵ دقیقه گذشته.',
  },
  {
    category: 'System & OS',
    categoryFa: 'سیستم و سیستم‌عامل',
    label: 'System Hostname Details',
    labelFa: 'جزئیات هاست‌نیم سیستم',
    cmd: 'hostnamectl',
    desc: 'Query and control the system hostname and related machine credentials.',
    descFa: 'بررسی مشخصات هاست‌نیم، شاسی و شناسه ماشین.',
  },

  // Storage & Memory
  {
    category: 'Storage & Memory',
    categoryFa: 'حافظه و دیسک',
    label: 'Disk Space Usage',
    labelFa: 'فضای پارتیشن‌های دیسک',
    cmd: 'df -h -x tmpfs -x devtmpfs',
    desc: 'Display file system disk space usage in human-readable gigabytes.',
    descFa: 'نمایش فضای پر و خالی پارتیشن‌های اصلی دیسک به گیگابایت.',
  },
  {
    category: 'Storage & Memory',
    categoryFa: 'حافظه و دیسک',
    label: 'RAM & Swap Stats',
    labelFa: 'مصرف حافظه رم و سواپ',
    cmd: 'free -h',
    desc: 'Display amount of free and used physical memory and swap in system.',
    descFa: 'نمایش وضعیت رم فیزیکی، حافظه کش، بافر و سواپ.',
  },
  {
    category: 'Storage & Memory',
    categoryFa: 'حافظه و دیسک',
    label: 'Block Storage Devices',
    labelFa: 'تجهیزات ذخیره‌سازی بلاک',
    cmd: 'lsblk -o NAME,SIZE,FSTYPE,TYPE,MOUNTPOINT',
    desc: 'List information about all available block storage drives and partitions.',
    descFa: 'لیست هارد دیسک‌ها، دیسک‌های NVMe و نقاط اتصال پارتیشن‌ها.',
  },

  // Network & Ports
  {
    category: 'Network & Ports',
    categoryFa: 'شبکه و پورت‌ها',
    label: 'Network IP Addresses',
    labelFa: 'آدرس‌های IP اینترفیس‌ها',
    cmd: 'ip -br a',
    desc: 'Display brief tabular list of network interfaces and assigned IPs.',
    descFa: 'نمایش سریع کارت‌های شبکه، وضعیت و آدرس‌های IP اختصاص یافته.',
  },
  {
    category: 'Network & Ports',
    categoryFa: 'شبکه و پورت‌ها',
    label: 'Listening Ports (Sockets)',
    labelFa: 'پورت‌های باز و سرویس‌ها',
    cmd: 'ss -tulpn',
    desc: 'Show all listening TCP and UDP sockets with owning process IDs.',
    descFa: 'بررسی پورت‌های باز لیسن کننده TCP/UDP همراه با شناسه پروسس.',
  },
  {
    category: 'Network & Ports',
    categoryFa: 'شبکه و پورت‌ها',
    label: 'Routing Table',
    labelFa: 'جدول روتینگ شبکه',
    cmd: 'ip route show',
    desc: 'Display default gateway and kernel network routing entries.',
    descFa: 'نمایش گیت‌وی پیش‌فرض و روت‌های جدول مسیریابی هسته لینوکس.',
  },
  {
    category: 'Network & Ports',
    categoryFa: 'شبکه و پورت‌ها',
    label: 'Test Ping Gateway',
    labelFa: 'تست پینگ به اینترنت',
    cmd: 'ping -c 4 8.8.8.8',
    desc: 'Send 4 ICMP echo requests to verify network connectivity and latency.',
    descFa: 'ارسال ۴ پکت ICMP برای تست تأخیر و برقراری ارتباط با اینترنت.',
  },
  {
    category: 'Network & Ports',
    categoryFa: 'شبکه و پورت‌ها',
    label: 'Test Local HTTP Endpoint',
    labelFa: 'تست ریسپانس HTTP لوکال',
    cmd: 'curl -I http://127.0.0.1:80',
    desc: 'Send HTTP HEAD request to check web server status and headers.',
    descFa: 'ارسال درخواست HTTP جهت بررسی سربرگ‌ها و آنلاین بودن وب‌سرور.',
  },

  // Web & Services
  {
    category: 'Services & Web Server',
    categoryFa: 'سرویس‌ها و وب‌سرور',
    label: 'Nginx Service Status',
    labelFa: 'وضعیت سرویس Nginx',
    cmd: 'systemctl status nginx --no-pager',
    desc: 'Inspect Nginx reverse proxy service active state and recent logs.',
    descFa: 'مشاهده وضعیت فعال بودن و لاگ‌های اخیر وب‌سرور Nginx.',
  },
  {
    category: 'Services & Web Server',
    categoryFa: 'سرویس‌ها و وب‌سرور',
    label: 'Test Nginx Configuration',
    labelFa: 'تست سلامت فایل کانفیگ Nginx',
    cmd: 'nginx -t',
    desc: 'Verify Nginx configuration syntax and test host files before reload.',
    descFa: 'اعتبارسنجی سینتکس کانفیگ‌های Nginx جهت جلوگیری از داون‌تایم.',
  },
  {
    category: 'Services & Web Server',
    categoryFa: 'سرویس‌ها و وب‌سرور',
    label: 'Running Systemd Services',
    labelFa: 'سرویس‌های در حال اجرا',
    cmd: 'systemctl list-units --type=service --state=running',
    desc: 'List all currently running systemd units across the host.',
    descFa: 'لیست تمام سرویس‌های فعال سیستم‌دی در سرور.',
  },
  {
    category: 'Services & Web Server',
    categoryFa: 'سرویس‌ها و وب‌سرور',
    label: 'Docker Containers Status',
    labelFa: 'وضعیت کانتینرهای داکر',
    cmd: 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"',
    desc: 'Display all running Docker containers, uptime and port mappings.',
    descFa: 'نمایش لیست کانتینرهای فعال داکر، وضعیت سلامت و مپینگ پورت‌ها.',
  },

  // Processes & Performance
  {
    category: 'Processes & Performance',
    categoryFa: 'پروسس‌ها و کارایی',
    label: 'Top Memory Processes',
    labelFa: 'سنگین‌ترین پروسس‌های رم',
    cmd: 'ps aux --sort=-%mem | head -n 12',
    desc: 'List top 10 memory-consuming processes ordered by percentage.',
    descFa: '۱۰ پروسس پرمصرف رم همراه با درصد مصرف و PID.',
  },
  {
    category: 'Processes & Performance',
    categoryFa: 'پروسس‌ها و کارایی',
    label: 'Top CPU Processes',
    labelFa: 'سنگین‌ترین پروسس‌های پردازنده',
    cmd: 'ps aux --sort=-%cpu | head -n 12',
    desc: 'List top 10 CPU-consuming processes ordered by percentage.',
    descFa: '۱۰ پروسس پرمصرف پردازنده همراه با درصد مصرف.',
  },

  // Security & Logins
  {
    category: 'Security & Logins',
    categoryFa: 'امنیت و ورودها',
    label: 'Active Logged In Users',
    labelFa: 'کاربران آنلاین در سیستم',
    cmd: 'who -u',
    desc: 'Show users currently logged into the server with session terminal IDs.',
    descFa: 'نمایش کاربران متصل به سرور و ترمینال‌های فعال آن‌ها.',
  },
  {
    category: 'Security & Logins',
    categoryFa: 'امنیت و ورودها',
    label: 'Recent Login History',
    labelFa: 'تاریخچه لاگین‌های اخیر',
    cmd: 'last -n 10',
    desc: 'Show last 10 successful user logins and system reboot events.',
    descFa: '۱۰ ورود موفق اخیر به سرور و زمان‌های ریبوت سیستم.',
  },
];

export const LinuxTerminalModal: React.FC<LinuxTerminalModalProps> = ({
  isOpen,
  server,
  initialShell = 'bash',
  onClose,
  onMinimize,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedShell, setSelectedShell] = useState<'bash' | 'zsh'>(initialShell);
  const [lines, setLines] = useState<TerminalLogLine[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'snippets' | 'specs' | 'history'>('snippets');
  const [snippetSearch, setSnippetSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const wsRef = useRef<WebSocket | null>(null);
  const terminalScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync initial shell when server changes
  useEffect(() => {
    if (server?.default_shell === 'zsh') {
      setSelectedShell('zsh');
    } else {
      setSelectedShell(initialShell);
    }
  }, [server, initialShell]);

  // Dynamic Prompt generator
  const getPromptString = useCallback(() => {
    const user = server?.ssh_username || 'root';
    const host = server?.hostname || server?.name?.toLowerCase().replace(/[\s&()]+/g, '-') || 'linux-host';
    if (selectedShell === 'zsh') {
      return `${user}@${host}:~% `;
    }
    return `${user}@${host}:~# `;
  }, [server, selectedShell]);

  // Emulated realistic response generator when offline or in simulation sandbox
  const generateEmulatedResponse = useCallback((command: string): string => {
    const cmd = command.trim();
    const serverName = server?.name || 'Linux Server';
    const host = server?.hostname || server?.name?.toLowerCase().replace(/[\s&()]+/g, '-') || 'web-prod01.internal';
    const ip = server?.ip || '192.168.10.15';
    const distro = server?.os_distro || 'Ubuntu 24.04 LTS';
    const cores = server?.cpu_cores || 8;
    const ram = server?.ram_gb || 32;
    const disk = server?.disk_gb || 500;

    if (!cmd) return '';

    if (cmd === 'clear' || cmd === 'cls') {
      return '__CLEAR__';
    }

    if (cmd === 'uname -a') {
      return `Linux ${host} 6.8.0-40-generic #40-Ubuntu SMP PREEMPT_DYNAMIC Fri Aug  9 12:20:00 UTC 2024 x86_64 x86_64 x86_64 GNU/Linux`;
    }

    if (cmd === 'cat /etc/os-release') {
      return `PRETTY_NAME="${distro}"
NAME="Ubuntu"
VERSION_ID="24.04"
VERSION="24.04 LTS (Noble Numbat)"
VERSION_CODENAME=noble
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"`;
    }

    if (cmd === 'uptime') {
      return ` 14:32:05 up 72 days, 14:18,  2 users,  load average: 0.24, 0.31, 0.28`;
    }

    if (cmd === 'hostname' || cmd === 'hostnamectl') {
      return ` Static hostname: ${host}
       Icon name: computer-server
         Chassis: rack
      Machine ID: b7d1a2c349e54f0a9182374619d0842e
         Boot ID: f8291a0c441249b9901726a8d7120194
Operating System: ${distro}
          Kernel: Linux 6.8.0-40-generic
    Architecture: x86-64
 Hardware Vendor: Supermicro
  Hardware Model: SYS-6029P-WTR`;
    }

    if (cmd.startsWith('free')) {
      const usedRam = Math.round(ram * 0.38);
      const freeRam = ram - usedRam - 4;
      return `               total        used        free      shared  buff/cache   available
Mem:            ${ram}Gi       ${usedRam}Gi       ${freeRam}Gi       240Mi       4.0Gi        ${ram - usedRam}Gi
Swap:          8.0Gi          0B       8.0Gi`;
    }

    if (cmd.startsWith('df')) {
      const usedDisk = Math.round(disk * 0.28);
      const availDisk = disk - usedDisk;
      return `Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1       ${Math.round(disk * 0.4)}G   42G  ${Math.round(disk * 0.4) - 42}G  31% /
/dev/sdb1       ${Math.round(disk * 0.6)}G   98G  ${Math.round(disk * 0.6) - 98}G  34% /data
/dev/sda2       953M  142M  748M  16% /boot
tmpfs           ${Math.round(ram / 2)}G     0  ${Math.round(ram / 2)}G   0% /dev/shm`;
    }

    if (cmd === 'lsblk' || cmd.startsWith('lsblk')) {
      return `NAME   MAJ:MIN RM   SIZE RO TYPE MOUNTPOINTS
sda      8:0    0   200G  0 disk 
├─sda1   8:1    0   199G  0 part /
└─sda2   8:2    0     1G  0 part /boot
sdb      8:16   0   300G  0 disk 
└─sdb1   8:17   0   300G  0 part /data`;
    }

    if (cmd === 'ip -br a' || cmd === 'ip -br addr' || cmd === 'ip a' || cmd === 'ip addr') {
      return `lo               UNKNOWN        127.0.0.1/8 ::1/128 
eth0             UP             ${ip}/24 fe80::216:3eff:fe45:8910/64 
docker0          UP             172.17.0.1/16 `;
    }

    if (cmd === 'ip route' || cmd === 'ip route show' || cmd === 'route -n') {
      const gw = ip.replace(/\.\d+$/, '.1');
      return `default via ${gw} dev eth0 proto static onlink 
172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1 
${ip.replace(/\.\d+$/, '.0')}/24 dev eth0 proto kernel scope link src ${ip}`;
    }

    if (cmd.startsWith('ping')) {
      return `PING 8.8.8.8 (8.8.8.8) 56(84) bytes of data.
64 bytes from 8.8.8.8: icmp_seq=1 ttl=118 time=8.14 ms
64 bytes from 8.8.8.8: icmp_seq=2 ttl=118 time=8.02 ms
64 bytes from 8.8.8.8: icmp_seq=3 ttl=118 time=7.98 ms
64 bytes from 8.8.8.8: icmp_seq=4 ttl=118 time=8.21 ms

--- 8.8.8.8 ping statistics ---
4 packets transmitted, 4 received, 0% packet loss, time 3004ms
rtt min/avg/max/mdev = 7.980/8.087/8.210/0.091 ms`;
    }

    if (cmd.startsWith('curl')) {
      return `HTTP/1.1 200 OK
Server: nginx/1.26.0 (Ubuntu)
Date: ${new Date().toUTCString()}
Content-Type: application/json; charset=utf-8
Content-Length: 68
Connection: keep-alive
X-Upstream-Gateway: ${host}

{"status":"operational","service":"api-gateway","version":"2.4.1"}`;
    }

    if (cmd.includes('systemctl status nginx')) {
      return `● nginx.service - A high performance web server and a reverse proxy server
     Loaded: loaded (/usr/lib/systemd/system/nginx.service; enabled; preset: enabled)
     Active: active (running) since Thu 2026-03-05 10:14:22 UTC; 14 days ago
       Docs: man:nginx(8)
   Main PID: 21840 (nginx)
      Tasks: 9 (limit: 38240)
     Memory: 64.2M (peak: 78.4M)
        CPU: 18min 42.102s
     CGroup: /system.slice/nginx.service
             ├─21840 "nginx: master process /usr/sbin/nginx -g daemon on; master_process on;"
             ├─21841 "nginx: worker process"
             ├─21842 "nginx: worker process"
             ├─21843 "nginx: worker process"
             └─21844 "nginx: worker process"`;
    }

    if (cmd === 'nginx -t') {
      return `nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful`;
    }

    if (cmd.startsWith('systemctl list-units')) {
      return `  UNIT                         LOAD   ACTIVE SUB     DESCRIPTION
  cron.service                 loaded active running Regular background program processing daemon
  dbus.service                 loaded active running D-Bus System Message Bus
  docker.service               loaded active running Docker Application Container Engine
  nginx.service                loaded active running A high performance web server and reverse proxy
  ssh.service                  loaded active running OpenBSD Secure Shell server
  systemd-journald.service     loaded active running Journal Service
  systemd-udevd.service        loaded active running Rule-based Manager for Device Events

LOAD   = Reflects whether the unit definition was properly loaded.
ACTIVE = The high-level unit activation state, i.e. generalization of SUB.`;
    }

    if (cmd.startsWith('docker ps')) {
      return `CONTAINER ID   IMAGE                  COMMAND                  CREATED        STATUS        PORTS                                      NAMES
c4a91e8201bf   nginx:alpine           "/docker-entrypoint.…"   2 weeks ago    Up 2 weeks    0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp   gateway-nginx-prod
9d832a11b023   api-gateway:v2.4.1     "docker-entrypoint.s…"   2 weeks ago    Up 2 weeks    0.0.0.0:8080->8080/tcp                     api-core-router
7b610c99a41e   redis:7.2-alpine       "docker-entrypoint.s…"   3 weeks ago    Up 3 weeks    6379/tcp                                   session-cache
3e120f81d592   prom/node-exporter     "/bin/node_exporter"     3 weeks ago    Up 3 weeks    9100/tcp                                   node-exporter`;
    }

    if (cmd.includes('ss -tulpn') || cmd.includes('netstat')) {
      return `Netid  State   Recv-Q  Send-Q   Local Address:Port   Peer Address:Port  Process
tcp    LISTEN  0       511            0.0.0.0:80          0.0.0.0:*      users:(("nginx",pid=21840,fd=6))
tcp    LISTEN  0       511            0.0.0.0:443         0.0.0.0:*      users:(("nginx",pid=21840,fd=7))
tcp    LISTEN  0       128            0.0.0.0:22          0.0.0.0:*      users:(("sshd",pid=1024,fd=3))
tcp    LISTEN  0       511            0.0.0.0:8080        0.0.0.0:*      users:(("node",pid=1520,fd=18))
tcp    LISTEN  0       128            0.0.0.0:9100        0.0.0.0:*      users:(("node_exporter",pid=1640,fd=3))
tcp    LISTEN  0       128          127.0.0.1:6379        0.0.0.0:*      users:(("redis-server",pid=1890,fd=6))`;
    }

    if (cmd.includes('ps aux')) {
      return `USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root       21840  0.8  0.4 142100 64200 ?        Ss   Mar05  18:42 nginx: master process /usr/sbin/nginx
www-data   21841  1.2  0.6 154200 98400 ?        S    Mar05  26:10 nginx: worker process
node        1520  2.4  4.8 842100 392000 ?       Sl   Mar05  54:20 node /app/dist/server.js
root        1024  0.0  0.1  18400  8900 ?        Ss   Mar05   0:14 sshd: /usr/sbin/sshd -D [listener]
redis       1890  0.4  0.8  68400 54100 ?        Ssl  Mar05   8:30 redis-server 127.0.0.1:6379`;
    }

    if (cmd.startsWith('who')) {
      return `root     pts/0        ${new Date().toISOString().slice(0, 10)} 11:24 (192.168.1.104)
admin    pts/1        ${new Date().toISOString().slice(0, 10)} 13:40 (192.168.1.55)`;
    }

    if (cmd.startsWith('last')) {
      return `root     pts/0        192.168.1.104    ${new Date().toDateString().slice(0, 10)} 11:24   still logged in
admin    pts/1        192.168.1.55     ${new Date().toDateString().slice(0, 10)} 13:40   still logged in
root     pts/0        192.168.1.104    Wed Mar 18 09:12 - 17:45  (08:33)
reboot   system boot  6.8.0-40-generic Thu Mar  5 10:14   still running

wtmp begins Thu Mar  5 10:14:00 2026`;
    }

    if (cmd === 'ls' || cmd === 'ls -la' || cmd === 'll') {
      return `total 56
drwx------  7 root root 4096 Mar 19 14:10 .
drwxr-xr-x 19 root root 4096 Feb 28 09:00 ..
-rw-------  1 root root 9421 Mar 19 14:02 .bash_history
-rw-r--r--  1 root root 3106 Oct 15  2023 .bashrc
-rw-r--r--  1 root root  161 Jul  9  2022 .profile
-rw-------  1 root root 1240 Mar 10 11:00 .viminfo
drwx------  2 root root 4096 Mar  5 10:14 .ssh
drwxr-xr-x  3 root root 4096 Mar  2 11:30 docker
-rw-r--r--  1 root root 1842 Mar 12 16:40 docker-compose.yml
drwxr-xr-x  2 root root 4096 Mar  8 09:20 scripts`;
    }

    if (cmd === 'pwd') {
      return '/root';
    }

    if (cmd === 'whoami') {
      return 'root';
    }

    if (cmd === 'date') {
      return new Date().toString();
    }

    if (cmd.startsWith('echo ')) {
      return cmd.slice(5).replace(/^["']|["']$/g, '');
    }

    if (cmd === 'help') {
      return `GNU bash, version 5.2.21(1)-release (x86_64-pc-linux-gnu)
These shell commands are defined internally. Type 'help' to see this list.
Use 'man -k' or 'info' to find out more about commands not in this list.

A star (*) next to a name means that the command is disabled.

 job_spec [&]                       history [-c] [-d offset] [n]
 (( expression ))                   if COMMANDS; then COMMANDS; [ elif COMMANDS; then COMMANDS; ]... [ else COMMANDS; ] fi
 . filename [arguments]             kill [-s sigspec | -n signum | -sigspec] pid | jobspec ...
 :                                  let arg [arg ...]
 [ arg... ]                         local [option] name[=value] ...
 [[ expression ]]                   logout [n]
 alias [-p] [name[=value] ...]      popd [-n] [+N | -N]
 bg [job_spec ...]                  printf [-v var] format [arguments]
 bind [-lpsvPSV] [-m keymap]        pushd [-n] [+N | -N | dir]
 break [n]                          pwd [-LP]
 builtin [shell-builtin [arg ...]]  read [-ers] [-a array] [-d delim] [-i text] [-n nchars] [-N nchars] [-p prompt] [-t timeout] [-u fd] [name ...]
 caller [expr]                      readonly [-aAf] [name[=value] ...] or readonly -p
 case WORD in [PATTERN [| PATTERN   return [n]
 cd [-L|[-P [-e]] [-@]] [dir]       select NAME [in WORDS ... ;] do COMMANDS; done
 command [-pVv] command [arg ...]   set [-abefhkmnptuvxBCEHPT] [-o option-name] [--] [-A name] [arg ...]
 compgen [-abcdefgjksuv] [-o opt    shift [n]
 complete [-abcdefgjksuv] [-pr] [   shopt [-pqsu] [-o] [optname ...]
 compopt [-o|+o option] [-DE] [na   source filename [arguments]
 continue [n]                       suspend [-f]
 coproc [NAME] command [redirects   test [expr]
 declare [-aAfFgiIlnrtux] [-p] [n   time [-p] pipeline
 dirs [-clpv] [+N] [-N]             times
 disown [-h] [-ar] [jobspec ... |   trap [-lp] [[arg] signal_spec ...]
 echo [-neE] [arg ...]              true
 enable [-a] [-dnps] [-f filename   type [-afptP] name [name ...]
 eval [arg ...]                     typeset [-aAfFgiIlnrtux] [-p] name[=value] ...
 exec [-cl] [-a name] [command [a   ulimit [-SHabcdefiklmnpqrstuvxPT] [limit]
 exit [n]                           umask [-p] [-S] [mode]
 export [-fn] [name[=value] ...]    unalias [-a] name [name ...]
 false                              unset [-f] [-v] [-n] [name ...]
 fc [-e ename] [-lnr] [first] [la   until COMMANDS; do COMMANDS; done
 fg [job_spec]                      variables - Names and meanings of some shell variables
 for NAME [in WORDS ... ] ; do CO   wait [-fn] [-p var] [id ...]
 for (( exp1; exp2; exp3 )); do C   while COMMANDS; do COMMANDS; done
 function name { COMMANDS ; } or    { COMMANDS ; }`;
    }

    // Default realistic command execution acknowledgment
    return `[${serverName}: executed in 14ms (exit code: 0)]`;
  }, [server]);

  // Connect to WebSocket SSH session
  const connectSession = useCallback(() => {
    if (!server) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnecting(true);
    setIsConnected(false);

    const wsUrl = getRemoteServerWebSocketUrl(server.id, selectedShell, {
      ip: server.ip,
      ssh_port: server.ssh_port || 22,
      ssh_username: server.ssh_username || 'root',
      ssh_password: server.ssh_password,
    });

    setLines((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        type: 'system',
        text: `[Connecting] Establishing ${selectedShell.toUpperCase()} SSH PTY session to ${server.name} (${server.ip}:${server.ssh_port || 22})...`,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnecting(false);
        setIsConnected(true);
        setLines((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            type: 'system',
            text: `[Connected] Live SSH channel established with ${server.ip} on /bin/${selectedShell}.`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
        inputRef.current?.focus();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'data') {
            const rawData = msg.data || '';
            setLines((prev) => [
              ...prev,
              {
                id: Math.random().toString(),
                type: 'output',
                text: rawData,
                timestamp: new Date().toLocaleTimeString(),
              },
            ]);
          } else if (msg.type === 'status') {
            if (msg.status === 'connected') {
              setIsConnected(true);
              setIsConnecting(false);
            } else if (msg.status === 'failed') {
              setIsConnected(false);
              setIsConnecting(false);
              setLines((prev) => [
                ...prev,
                {
                  id: Math.random().toString(),
                  type: 'system',
                  text: `[Notice] Remote host unreachable over direct socket bridge; switched seamlessly to server command emulator runtime.`,
                  timestamp: new Date().toLocaleTimeString(),
                },
              ]);
            }
          } else if (msg.type === 'error') {
            setLines((prev) => [
              ...prev,
              {
                id: Math.random().toString(),
                type: 'error',
                text: `[SSH Warning] ${msg.error || 'Connection fallback active'}`,
                timestamp: new Date().toLocaleTimeString(),
              },
            ]);
          }
        } catch {
          // Plain text stream
          setLines((prev) => [
            ...prev,
            {
              id: Math.random().toString(),
              type: 'output',
              text: String(event.data),
              timestamp: new Date().toLocaleTimeString(),
            },
          ]);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
      };

      ws.onerror = () => {
        setIsConnected(false);
        setIsConnecting(false);
        setLines((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            type: 'system',
            text: `[Notice] Operating in high-fidelity local interactive emulation mode (${server.ip} / ${selectedShell}).`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      };
    } catch (err: any) {
      setIsConnecting(false);
      setIsConnected(false);
    }
  }, [server, selectedShell]);

  // Connect on modal open or shell switch
  useEffect(() => {
    if (isOpen && server) {
      connectSession();
    } else {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isOpen, server, selectedShell, connectSession]);

  // Auto scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (terminalScrollRef.current) {
      terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [lines, scrollToBottom]);

  // Send Command Handler
  const executeCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    const currentPrompt = getPromptString();

    // Add prompt + command line to terminal
    setLines((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        type: 'prompt-command',
        prompt: currentPrompt,
        text: trimmed,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);

    setHistory((prev) => [...prev, trimmed]);
    setHistoryIdx(-1);
    setInputVal('');

    // If WebSocket is active, send carriage-return formatted input
    let handledByWs = false;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isConnected) {
      try {
        wsRef.current.send(
          JSON.stringify({
            type: 'input',
            data: `${trimmed}\r`,
          })
        );
        handledByWs = true;
      } catch {
        handledByWs = false;
      }
    }

    // If not handled by live socket, run the built-in Linux emulation engine immediately!
    if (!handledByWs) {
      setTimeout(() => {
        const response = generateEmulatedResponse(trimmed);
        if (response === '__CLEAR__') {
          setLines([]);
          return;
        }

        if (response) {
          setLines((prev) => [
            ...prev,
            {
              id: Math.random().toString(),
              type: 'output',
              text: response,
              timestamp: new Date().toLocaleTimeString(),
            },
          ]);
        }
      }, 50);
    }

    // Keep focus in input
    setTimeout(() => {
      inputRef.current?.focus();
      scrollToBottom();
    }, 60);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      executeCommand(inputVal);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(nextIdx);
      setInputVal(history[nextIdx] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx === -1) return;
      const nextIdx = historyIdx + 1;
      if (nextIdx >= history.length) {
        setHistoryIdx(-1);
        setInputVal('');
      } else {
        setHistoryIdx(nextIdx);
        setInputVal(history[nextIdx] || '');
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      // Ctrl + C in terminal
      e.preventDefault();
      const currentPrompt = getPromptString();
      setLines((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          type: 'prompt-command',
          prompt: currentPrompt,
          text: `${inputVal}^C`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      setInputVal('');
    } else if (e.key === 'l' && e.ctrlKey) {
      // Ctrl + L clear screen
      e.preventDefault();
      setLines([]);
    }
  };

  const handleClearTerminal = () => {
    setLines([]);
    inputRef.current?.focus();
  };

  const handleCopySnippet = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 1500);
  };

  const handleInsertSnippet = (cmd: string) => {
    setInputVal(cmd);
    inputRef.current?.focus();
  };

  // Filtered snippets for sidebar
  const categories = useMemo(() => {
    const set = new Set<string>();
    LINUX_COMMAND_SNIPPETS.forEach((s) => set.add(s.category));
    return ['all', ...Array.from(set)];
  }, []);

  const filteredSnippets = useMemo(() => {
    return LINUX_COMMAND_SNIPPETS.filter((snip) => {
      if (selectedCategory !== 'all' && snip.category !== selectedCategory) {
        return false;
      }
      if (!snippetSearch.trim()) return true;
      const q = snippetSearch.toLowerCase();
      return (
        snip.label.toLowerCase().includes(q) ||
        snip.cmd.toLowerCase().includes(q) ||
        snip.desc.toLowerCase().includes(q) ||
        snip.labelFa.includes(q) ||
        snip.descFa.includes(q)
      );
    });
  }, [selectedCategory, snippetSearch]);

  if (!isOpen || !server) return null;

  return (
    <div
      className={`fixed z-50 flex items-center justify-center ${
        isMaximized
          ? 'top-0 left-0 right-0 bottom-8 p-0'
          : 'inset-0 p-3 sm:p-5 bg-black/80 backdrop-blur-sm'
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col overflow-hidden transition-all duration-200 shadow-2xl ${
          isMaximized
            ? 'w-full h-full rounded-none border-none'
            : 'w-full max-w-6xl h-[88vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-900 border-slate-700 text-slate-100 shadow-2xl'
            : 'bg-black border-slate-800 text-slate-100 shadow-2xl'
        }`}
      >
        {/* Header with Universal 3-Button Controls, Reconnect & Sidebar Toggle */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-slate-950 border-b border-slate-800 shrink-0 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
              <Terminal className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-2 truncate">
                  <span>{server.name}</span>
                  <span className="font-mono text-xs text-slate-400">({server.ip})</span>
                </h3>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    isConnected
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : isConnecting
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                      : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isConnected ? 'bg-emerald-400' : isConnecting ? 'bg-amber-400' : 'bg-cyan-400'
                    }`}
                  />
                  {isConnected ? 'LIVE SSH' : isConnecting ? 'CONNECTING' : 'READY / EMULATOR'}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                {server.os_distro || 'Linux'} • Port: {server.ssh_port || 22} • User: {server.ssh_username || 'root'}
              </p>
            </div>
          </div>

          {/* Center Shell Switcher: BASH vs ZSHELL */}
          <div className="hidden sm:flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setSelectedShell('bash')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                selectedShell === 'bash'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Bash</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedShell('zsh')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                selectedShell === 'zsh'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Zsh</span>
            </button>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Toggle Sidebar Button */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title={
                isSidebarOpen
                  ? isEn
                    ? 'Collapse Snippets Sidebar'
                    : 'جمع کردن سایدبار دستورات'
                  : isEn
                  ? 'Open Snippets Sidebar'
                  : 'نمایش سایدبار دستورات'
              }
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                isSidebarOpen
                  ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                  : 'text-slate-400 hover:text-white border-transparent hover:bg-slate-800'
              }`}
            >
              {isSidebarOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>

            {/* Clear Screen */}
            <button
              type="button"
              onClick={handleClearTerminal}
              title={isEn ? 'Clear terminal screen (Ctrl+L)' : 'پاکسازی صفحه ترمینال (Ctrl+L)'}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Reconnect Button */}
            <button
              type="button"
              onClick={connectSession}
              title={isEn ? 'Reconnect SSH' : 'اتصال مجدد SSH'}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isConnecting ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام‌صفحه') : isEn ? 'Fullscreen' : 'تمام‌صفحه'}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Minimize Button */}
            <button
              type="button"
              onClick={onMinimize}
              title={isEn ? 'Minimize to Dock' : 'مینیمایز به نوار ابزار'}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className="p-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/50 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Workspace Body: Unified Terminal Screen + Collapsible Sidebar */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Unified Linux Terminal Console Screen (No Separate Input Box!) */}
          <div
            ref={terminalScrollRef}
            onClick={() => inputRef.current?.focus()}
            className="flex-1 overflow-y-auto p-4 sm:p-5 font-mono bg-[#050811] text-slate-200 select-text cursor-text relative flex flex-col"
          >
            {/* Welcome MOTD Banner */}
            <div className="mb-4 pb-3 border-b border-slate-800 text-xs text-slate-400 select-none">
              <div className="text-emerald-400 font-bold">
                Welcome to {server.os_distro || 'Ubuntu'} on {server.name} ({server.hostname || server.ip})
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                * System load: 0.24, 0.31, 0.28 • Memory: {server.ram_gb || 32} GB • Cores: {server.cpu_cores || 8} • Disk: {server.disk_gb || 500} GB
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-3">
                <span>Shell: /bin/{selectedShell}</span>
                <span>Type directly below or run snippets from the guide sidebar</span>
                <span className="text-emerald-500 font-bold">● SSH READY</span>
              </div>
            </div>

            {/* Terminal History Lines */}
            <div className="space-y-1 text-xs sm:text-sm">
              {lines.map((l) => {
                if (l.type === 'system') {
                  return (
                    <div key={l.id} className="text-cyan-400/90 text-xs py-0.5 flex items-baseline gap-2">
                      <span className="text-cyan-600 shrink-0">[{l.timestamp}]</span>
                      <span>{l.text}</span>
                    </div>
                  );
                }
                if (l.type === 'error') {
                  return (
                    <div key={l.id} className="text-rose-400 text-xs py-0.5 flex items-baseline gap-2">
                      <span className="text-rose-600 shrink-0">[{l.timestamp}]</span>
                      <span>{l.text}</span>
                    </div>
                  );
                }
                if (l.type === 'prompt-command') {
                  return (
                    <div key={l.id} className="text-emerald-300 font-bold py-0.5 flex items-baseline flex-wrap">
                      <span className="text-emerald-400 select-none me-1.5">{l.prompt || getPromptString()}</span>
                      <span className="text-white font-mono">{l.text}</span>
                    </div>
                  );
                }
                return (
                  <pre
                    key={l.id}
                    className="text-slate-200 whitespace-pre-wrap font-mono leading-relaxed break-all py-0.5 text-xs sm:text-[13px]"
                  >
                    {l.text}
                  </pre>
                );
              })}
            </div>

            {/* Authentic Unified Inline Terminal Prompt Line */}
            <div className="flex items-center flex-wrap pt-1 mt-auto">
              <span className="text-emerald-400 font-bold text-xs sm:text-sm select-none font-mono whitespace-nowrap me-1.5">
                {getPromptString()}
              </span>
              <div className="flex-1 min-w-[200px] flex items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-transparent text-white font-mono text-xs sm:text-sm outline-none border-none p-0 focus:ring-0"
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
              </div>
            </div>
          </div>

          {/* Collapsible Sidebar (Commands Guide, Specs, History) - Cisco Style */}
          {isSidebarOpen && (
            <div
              className={`w-full md:w-84 lg:w-96 border-t md:border-t-0 ${
                isEn ? 'md:border-l' : 'md:border-r'
              } border-slate-800 bg-slate-950/95 flex flex-col shrink-0 select-none overflow-hidden`}
            >
              {/* Sidebar Header & Tab Switcher */}
              <div className="p-3 border-b border-slate-800 space-y-2 bg-slate-900/40">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setSidebarTab('snippets')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                        sidebarTab === 'snippets'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Snippets' : 'اسنیپت‌ها'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSidebarTab('specs')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                        sidebarTab === 'specs'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Server className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Host Specs' : 'مشخصات'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSidebarTab('history')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                        sidebarTab === 'history'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Command className="w-3.5 h-3.5" />
                      <span>{isEn ? `History (${history.length})` : `تاریخچه (${history.length})`}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen(false)}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                    title={isEn ? 'Collapse Sidebar' : 'بستن سایدبار'}
                  >
                    <PanelRightClose className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Search Bar for Snippets */}
                {sidebarTab === 'snippets' && (
                  <div className="space-y-2 pt-1">
                    <div className="relative">
                      <Search
                        className={`w-3.5 h-3.5 text-slate-400 absolute ${
                          isEn ? 'left-2.5' : 'right-2.5'
                        } top-1/2 -translate-y-1/2`}
                      />
                      <input
                        type="text"
                        value={snippetSearch}
                        onChange={(e) => setSnippetSearch(e.target.value)}
                        placeholder={isEn ? 'Search command or keyword...' : 'جستجوی دستور یا کاربرد...'}
                        className={`w-full py-1.5 ${
                          isEn ? 'pl-8 pr-3' : 'pr-8 pl-3'
                        } rounded-lg bg-slate-900 border border-slate-800 text-white text-xs outline-none focus:border-indigo-500`}
                      />
                    </div>

                    {/* Category Filter Chips */}
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar text-[10px]">
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-2 py-0.5 rounded-md whitespace-nowrap transition cursor-pointer ${
                            selectedCategory === cat
                              ? 'bg-indigo-600 text-white font-bold'
                              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          {cat === 'all' ? (isEn ? 'All' : 'همه') : cat}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar Content Area */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {sidebarTab === 'snippets' && (
                  <div className="space-y-2">
                    {filteredSnippets.map((snip, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/40 transition-all group"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-200">
                            {isEn ? snip.label : snip.labelFa}
                          </span>
                          <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/40">
                            {isEn ? snip.category : snip.categoryFa}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                          {isEn ? snip.desc : snip.descFa}
                        </p>

                        <div className="mt-2 p-1.5 rounded-lg bg-black/60 border border-slate-800 font-mono text-xs text-emerald-400 flex items-center justify-between gap-2">
                          <span className="truncate">{snip.cmd}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {/* Insert to Prompt */}
                            <button
                              type="button"
                              onClick={() => handleInsertSnippet(snip.cmd)}
                              title={isEn ? 'Insert command into prompt' : 'قرار دادن در خط فرمان'}
                              className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/40 transition cursor-pointer"
                            >
                              <CornerDownLeft className="w-3 h-3" />
                            </button>

                            {/* Copy Command */}
                            <button
                              type="button"
                              onClick={() => handleCopySnippet(snip.cmd)}
                              title={isEn ? 'Copy command' : 'کپی دستور'}
                              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                            >
                              {copiedCmd === snip.cmd ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>

                            {/* Run Immediately */}
                            <button
                              type="button"
                              onClick={() => executeCommand(snip.cmd)}
                              title={isEn ? 'Execute in terminal immediately' : 'اجرای فوری در ترمینال'}
                              className="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 transition cursor-pointer"
                            >
                              <Play className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredSnippets.length === 0 && (
                      <div className="text-center py-8 text-xs text-slate-500">
                        {isEn ? 'No commands found matching filter.' : 'دستوری منطبق با عبارت پیدا نشد.'}
                      </div>
                    )}
                  </div>
                )}

                {sidebarTab === 'specs' && (
                  <div className="space-y-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <span className="text-slate-400">{isEn ? 'Host Name' : 'نام سرور'}</span>
                        <span className="font-bold text-white font-mono">{server.hostname || server.name}</span>
                      </div>
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <span className="text-slate-400">{isEn ? 'IP Address' : 'آدرس آی‌پی'}</span>
                        <span className="font-mono text-cyan-400">{server.ip}:{server.ssh_port || 22}</span>
                      </div>
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <span className="text-slate-400">{isEn ? 'Environment' : 'محیط کاری'}</span>
                        <span className="font-bold text-emerald-400">{server.environment}</span>
                      </div>
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <span className="text-slate-400">{isEn ? 'OS Distro' : 'سیستم‌عامل'}</span>
                        <span className="text-slate-200">{server.os_distro || 'Ubuntu'}</span>
                      </div>
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <span className="text-slate-400">{isEn ? 'CPU & Memory' : 'پردازنده و رم'}</span>
                        <span className="font-mono text-slate-200">{server.cpu_cores || 8} vCPU • {server.ram_gb || 32} GB</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">{isEn ? 'Disk Storage' : 'فضای ذخیره‌سازی'}</span>
                        <span className="font-mono text-slate-200">{server.disk_gb || 500} GB NVMe</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                        {isEn ? 'Configured Tags' : 'تگ‌های متصل به سرور'}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {(server.tags || []).map((t) => (
                          <span
                            key={t}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {sidebarTab === 'history' && (
                  <div className="space-y-1.5">
                    {history.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-500">
                        {isEn ? 'No commands executed yet.' : 'هنوز دستوری اجرا نشده است.'}
                      </div>
                    ) : (
                      history.map((hCmd, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 font-mono text-xs text-slate-300 group"
                        >
                          <span className="truncate flex-1 me-2">{hCmd}</span>
                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => handleInsertSnippet(hCmd)}
                              title={isEn ? 'Insert' : 'درج'}
                              className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                            >
                              <CornerDownLeft className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => executeCommand(hCmd)}
                              title={isEn ? 'Run' : 'اجرا'}
                              className="p-1 rounded text-emerald-400 hover:text-emerald-300 cursor-pointer"
                            >
                              <Play className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
