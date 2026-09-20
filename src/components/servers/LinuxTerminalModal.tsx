import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  Columns,
  Rows,
  Grid2X2,
  Plus,
  ArrowLeftRight,
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react';
import { RemoteServer } from '../../types';
import { getRemoteServerWebSocketUrl } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { renderAnsiFormattedText, stripAnsi } from './terminalAnsi';
import {
  getIntellisense,
  IntellisenseResult,
  LINUX_COMMANDS_CATALOG,
  registerVfsEntry,
  removeVfsEntry,
} from './linuxIntellisense';

export interface LinuxTerminalModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  availableServers?: RemoteServer[];
  initialShell?: 'bash' | 'zsh';
  sessionPassword?: string;
  onClose: () => void;
  onMinimize: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

interface TerminalLogLine {
  id: string;
  type: 'prompt-command' | 'output' | 'error' | 'system' | 'info';
  prompt?: string;
  text: string;
  timestamp: string;
}

interface TerminalPane {
  id: string;
  server: RemoteServer;
  title: string;
  selectedShell: 'bash' | 'zsh';
  lines: TerminalLogLine[];
  inputVal: string;
  history: string[];
  historyIdx: number;
  isConnected: boolean;
  isConnecting: boolean;
  ephemeralPassword?: string;
  isPasswordPromptActive: boolean;
  cwd: string;
  previousCwd?: string;
}

/**
 * Resolves target directory against current directory in standard POSIX manner.
 */
export function resolveLinuxPath(
  currentCwd: string,
  target: string,
  homeDir: string,
  previousCwd?: string
): { absPath: string; displayCwd: string } {
  const normalizedHome = homeDir.endsWith('/') && homeDir.length > 1 ? homeDir.slice(0, -1) : homeDir;

  // 1. Target is empty, or '~' -> go to home
  if (!target || target === '~') {
    return {
      absPath: normalizedHome,
      displayCwd: '~',
    };
  }

  // 2. Target is '-' -> go to previous
  if (target === '-') {
    const prev = previousCwd || '~';
    const abs = prev === '~' ? normalizedHome : prev.startsWith('~/') ? normalizedHome + prev.substring(1) : prev;
    return {
      absPath: abs,
      displayCwd: prev,
    };
  }

  // 3. Determine starting absolute path
  let startAbs: string;
  let cleanTarget = target.trim();

  if (cleanTarget.startsWith('~/')) {
    startAbs = normalizedHome;
    cleanTarget = cleanTarget.substring(2);
  } else if (cleanTarget.startsWith('/')) {
    startAbs = '/';
    cleanTarget = cleanTarget.substring(1);
  } else {
    // Relative to currentCwd
    const current = currentCwd || '~';
    if (current === '~') {
      startAbs = normalizedHome;
    } else if (current.startsWith('~/')) {
      startAbs = normalizedHome + current.substring(1);
    } else if (current.startsWith('/')) {
      startAbs = current;
    } else {
      startAbs = normalizedHome + '/' + current;
    }
  }

  // Split startAbs into segments
  const stack: string[] = startAbs.split('/').filter(Boolean);

  // Process target segments
  const parts = cleanTarget.split('/').filter(Boolean);
  for (const part of parts) {
    if (part === '.') {
      continue;
    } else if (part === '..') {
      if (stack.length > 0) {
        stack.pop();
      }
    } else {
      stack.push(part);
    }
  }

  const newAbsPath = stack.length === 0 ? '/' : '/' + stack.join('/');

  // Format displayCwd
  let displayCwd = newAbsPath;
  if (newAbsPath === normalizedHome) {
    displayCwd = '~';
  } else if (newAbsPath.startsWith(normalizedHome + '/')) {
    displayCwd = '~' + newAbsPath.substring(normalizedHome.length);
  }

  return {
    absPath: newAbsPath,
    displayCwd,
  };
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
    label: 'OS Distro Release',
    labelFa: 'مشخصات توزیع لینوکس',
    cmd: 'cat /etc/os-release',
    desc: 'Display operating system identification data and release codename.',
    descFa: 'مشاهده مشخصات دقیق توزیع و نسخه سیستم‌عامل.',
  },
  {
    category: 'System & OS',
    categoryFa: 'سیستم و سیستم‌عامل',
    label: 'System Uptime & Load',
    labelFa: 'مدت زمان روشن بودن سرور',
    cmd: 'uptime -p',
    desc: 'Show pretty system uptime duration and 1/5/15 minute load averages.',
    descFa: 'نمایش مدت زمان کارکرد پیوسته سرور و میانگین بار پردازشی.',
  },
  {
    category: 'System & OS',
    categoryFa: 'سیستم و سیستم‌عامل',
    label: 'Memory Usage Overview',
    labelFa: 'خلاصه وضعیت حافظه رم',
    cmd: 'free -h',
    desc: 'Show total, used, free and available physical memory and swap in human-readable units.',
    descFa: 'نمایش حجم کل، اشغال‌شده و آزاد حافظه رم و سواپ.',
  },
  {
    category: 'System & OS',
    categoryFa: 'سیستم و سیستم‌عامل',
    label: 'Disk Filesystem Usage',
    labelFa: 'وضعیت فضای پارتیشن‌ها و دیسک',
    cmd: 'df -h -x tmpfs -x devtmpfs',
    desc: 'Display human-readable disk space usage excluding virtual in-memory mounts.',
    descFa: 'مشاهده فضای مصرفی پارتیشن‌های اصلی دیسک به گیگابایت.',
  },
  {
    category: 'System & OS',
    categoryFa: 'سیستم و سیستم‌عامل',
    label: 'CPU Hardware Specifications',
    labelFa: 'مشخصات سخت‌افزاری پردازنده',
    cmd: 'lscpu | head -n 20',
    desc: 'Display CPU architecture, model name, core counts, and virtualization capabilities.',
    descFa: 'نمایش مدل، تعداد هسته‌ها و ویژگی‌های پردازنده سرور.',
  },

  // Network & Ports
  {
    category: 'Network & Ports',
    categoryFa: 'شبکه و پورت‌ها',
    label: 'Active IP Addresses',
    labelFa: 'آدرس‌های IP فعال اینترفیس‌ها',
    cmd: 'ip -br a',
    desc: 'Show brief table of all network interfaces and assigned IPv4/IPv6 addresses.',
    descFa: 'مشاهده خلاصه اینترفیس‌های شبکه و آی‌پی‌های اختصاص‌یافته.',
  },
  {
    category: 'Network & Ports',
    categoryFa: 'شبکه و پورت‌ها',
    label: 'Listening TCP/UDP Ports',
    labelFa: 'پورت‌های باز و پروسس‌های متصل',
    cmd: 'ss -tulpn',
    desc: 'List all listening TCP and UDP sockets with program names and process IDs.',
    descFa: 'مشاهده کلیه پورت‌های در حال شنود همراه با نام برنامه و PID.',
  },
  {
    category: 'Network & Ports',
    categoryFa: 'شبکه و پورت‌ها',
    label: 'Kernel Routing Table',
    labelFa: 'جدول روتینگ کرنل',
    cmd: 'ip route show',
    desc: 'Display current default gateway and local subnet kernel routing table.',
    descFa: 'نمایش مسیرهای مسیریابی و گیت‌وی پیش‌فرض سرور.',
  },
  {
    category: 'Network & Ports',
    categoryFa: 'شبکه و پورت‌ها',
    label: 'Firewall Rules Status',
    labelFa: 'وضعیت فایروال UFW',
    cmd: 'ufw status verbose',
    desc: 'Display active rules and open incoming ports in Uncomplicated Firewall.',
    descFa: 'بررسی وضعیت فایروال و پورت‌های مجاز ورودی.',
  },
  {
    category: 'Network & Ports',
    categoryFa: 'شبکه و پورت‌ها',
    label: 'DNS Resolution Test',
    labelFa: 'بررسی کارکرد دی‌ان‌اس',
    cmd: 'cat /etc/resolv.conf',
    desc: 'Display configured system DNS nameservers and search domains.',
    descFa: 'مشاهده سرورهای دی‌ان‌اس تنظیم‌شده در سرور.',
  },
  {
    category: 'Network & Ports',
    categoryFa: 'شبکه و پورت‌ها',
    label: 'Public External IP',
    labelFa: 'آدرس آی‌پی پابلیک سرور',
    cmd: 'curl -s ifconfig.me',
    desc: 'Query external gateway to retrieve current public egress IP of the host.',
    descFa: 'استعلام آی‌پی اینترنتی و خروجی سرور.',
  },

  // Services & Web Server
  {
    category: 'Services & Web Server',
    categoryFa: 'سرویس‌ها و وب‌سرور',
    label: 'Systemd Failed Services',
    labelFa: 'سرویس‌های دارای خطای سیستم‌دی',
    cmd: 'systemctl --failed',
    desc: 'List all systemd units that are currently in a failed or degraded state.',
    descFa: 'فهرست سرویس‌هایی که با خطا مواجه و متوقف شده‌اند.',
  },
  {
    category: 'Services & Web Server',
    categoryFa: 'سرویس‌ها و وب‌سرور',
    label: 'Recent System Journal Errors',
    labelFa: 'لاگ خطاهای اخیر ژورنال سیستم',
    cmd: 'journalctl -p err -n 25 --no-pager',
    desc: 'Display last 25 systemd error logs recorded across all services.',
    descFa: 'مشاهده ۲۵ خط آخر از پیام‌های خطای بحرانی سیستم.',
  },
  {
    category: 'Services & Web Server',
    categoryFa: 'سرویس‌ها و وب‌سرور',
    label: 'Nginx Config Test',
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
    cmd: 'docker ps',
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
    desc: 'Show all interactive user login sessions currently active on terminals.',
    descFa: 'نمایش کاربران متصل به سرور و ترمینال‌های فعال.',
  },
  {
    category: 'Security & Logins',
    categoryFa: 'امنیت و ورودها',
    label: 'Recent Login History',
    labelFa: 'تاریخچه آخرین ورودهای کاربران',
    cmd: 'last -n 10',
    desc: 'View last 10 successful user logins, remote IPs and session durations.',
    descFa: 'مشاهده ۱۰ ورود اخیر به سرور همراه با آدرس IP.',
  },
];

export const LinuxTerminalModal: React.FC<LinuxTerminalModalProps> = ({
  isOpen,
  server,
  availableServers = [],
  initialShell = 'bash',
  sessionPassword,
  onClose,
  onMinimize,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'snippets' | 'specs' | 'history'>('snippets');
  const [snippetSearch, setSnippetSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Split Screen & Multi-Pane Layout
  const [layoutMode, setLayoutMode] = useState<'single' | 'split-cols' | 'split-rows' | 'grid-4'>('single');
  const [isSplitMenuOpen, setIsSplitMenuOpen] = useState(false);
  const splitMenuRef = useRef<HTMLDivElement>(null);

  // Server Picker Modal for Split View
  const [isServerPickerOpen, setIsServerPickerOpen] = useState(false);
  const [serverPickerSearch, setServerPickerSearch] = useState('');
  const [serverPickerCategory, setServerPickerCategory] = useState('all');
  const [selectedServerForNewPane, setSelectedServerForNewPane] = useState<RemoteServer | null>(null);
  const [newPaneShell, setNewPaneShell] = useState<'bash' | 'zsh'>('bash');
  const [newPanePassword, setNewPanePassword] = useState('');
  const [showNewPanePassword, setShowNewPanePassword] = useState(false);
  const [splitDropdownSearch, setSplitDropdownSearch] = useState('');

  // Panes management
  const [panes, setPanes] = useState<TerminalPane[]>(() => [
    {
      id: 'pane-1',
      server: (server || {}) as RemoteServer,
      title: `${server?.name || 'Linux Server'} (${initialShell})`,
      selectedShell: initialShell,
      lines: [],
      inputVal: '',
      history: [],
      historyIdx: -1,
      isConnected: false,
      isConnecting: false,
      ephemeralPassword: sessionPassword,
      isPasswordPromptActive: Boolean(server?.prompt_password_on_connect && !sessionPassword),
      cwd: '~',
      previousCwd: '~',
    },
  ]);
  const [activePaneId, setActivePaneId] = useState<string>('pane-1');

  // List of other available servers (excluding current server if desired)
  const otherServers = useMemo(() => {
    return (availableServers || []).filter((s) => s.id !== server?.id);
  }, [availableServers, server?.id]);

  // Filtered other servers for the quick Split dropdown
  const filteredDropdownServers = useMemo(() => {
    const q = splitDropdownSearch.trim().toLowerCase();
    if (!q) return otherServers;
    return otherServers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.ip.includes(q) ||
        (s.hostname && s.hostname.toLowerCase().includes(q)) ||
        (s.tags && s.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }, [otherServers, splitDropdownSearch]);

  // Filtered servers for the full Server Picker modal
  const filteredModalServers = useMemo(() => {
    const q = serverPickerSearch.trim().toLowerCase();
    return (availableServers || []).filter((s) => {
      if (serverPickerCategory !== 'all' && s.category !== serverPickerCategory) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.ip.includes(q) ||
        (s.hostname && s.hostname.toLowerCase().includes(q)) ||
        (s.os_distro && s.os_distro.toLowerCase().includes(q)) ||
        (s.tags && s.tags.some((t) => t.toLowerCase().includes(q)))
      );
    });
  }, [availableServers, serverPickerSearch, serverPickerCategory]);

  // Input & Scroll Refs per pane
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const wsRefs = useRef<Record<string, WebSocket | null>>({});
  const lastConnectedServerIdRef = useRef<string | null>(null);
  const prevIsOpenRef = useRef<boolean>(false);

  // Intellisense State for active pane
  const [intellisenseIndex, setIntellisenseIndex] = useState<number>(0);
  const [showIntellisensePopup, setShowIntellisensePopup] = useState<boolean>(false);

  // Inline password input state when prompt_password_on_connect is active
  const [passwordInputs, setPasswordInputs] = useState<Record<string, string>>({});
  const [showPasswordText, setShowPasswordText] = useState<Record<string, boolean>>({});

  // Click outside split menu listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (splitMenuRef.current && !splitMenuRef.current.contains(e.target as Node)) {
        setIsSplitMenuOpen(false);
      }
    };
    if (isSplitMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSplitMenuOpen]);

  // Prompt Generator
  const getPromptString = useCallback(
    (shellType: 'bash' | 'zsh', cwd: string = '~', paneServer?: RemoteServer | null) => {
      const srv = paneServer || server;
      const user = srv?.ssh_username || 'root';
      const host = srv?.hostname || srv?.name?.toLowerCase().replace(/[\s&()]+/g, '-') || 'linux';
      const homeDir = user === 'root' ? '/root' : `/home/${user}`;
      let displayCwd = cwd || '~';
      if (displayCwd === homeDir) {
        displayCwd = '~';
      } else if (displayCwd.startsWith(homeDir + '/')) {
        displayCwd = '~' + displayCwd.substring(homeDir.length);
      }

      if (shellType === 'zsh') {
        return `➜  ${user}@${host} ${displayCwd} `;
      }
      return `${user}@${host}:${displayCwd}${user === 'root' ? '#' : '$'} `;
    },
    [server]
  );

  // Emulated Command Response Generator
  const generateEmulatedResponse = useCallback(
    (command: string, cwd: string = '~', paneServer?: RemoteServer | null): string => {
      const srv = paneServer || server;
      const cmd = command.trim();
      const host = srv?.hostname || srv?.name?.toLowerCase().replace(/[\s&()]+/g, '-') || 'web-prod01.internal';
      const ip = srv?.ip || '192.168.10.15';
      const distro = srv?.os_distro || 'Ubuntu 24.04 LTS';
      const cores = srv?.cpu_cores || 8;
      const ram = srv?.ram_gb || 32;
      const disk = srv?.disk_gb || 500;
      const user = srv?.ssh_username || 'root';
      const homeDir = user === 'root' ? '/root' : `/home/${user}`;

      if (!cmd) return '';

      // Clear screen
      if (cmd === 'clear' || cmd === 'cls') {
        return '__CLEAR__';
      }

      // cd command - silent in standard Linux shells when successful
      if (cmd === 'cd' || cmd.startsWith('cd ') || cmd.startsWith('cd\t')) {
        return '';
      }

      // pwd
      if (cmd === 'pwd') {
        if (!cwd || cwd === '~') return homeDir;
        if (cwd.startsWith('~/')) return `${homeDir}${cwd.substring(1)}`;
        return cwd.startsWith('/') ? cwd : `/${cwd}`;
      }

      // ls / dir / ll
      if (cmd === 'ls' || cmd.startsWith('ls ') || cmd === 'll' || cmd.startsWith('ll ') || cmd === 'dir') {
        const effectiveCwd = (!cwd || cwd === '~') ? homeDir : cwd.startsWith('~/') ? `${homeDir}${cwd.substring(1)}` : cwd;
        if (effectiveCwd === '/') {
          return `bin   dev  home  lib64       mnt  proc  run   srv  tmp  var\nboot  etc  lib   lost+found  opt  root  sbin  sys  usr`;
        }
        if (effectiveCwd === '/etc') {
          return `apt  cron.d  group  hosts  init.d  issue  modules  network  nginx  passwd  resolv.conf  ssh  ssl  sudoers  systemd  ufw`;
        }
        if (effectiveCwd === '/etc/nginx') {
          return `conf.d  fastcgi.conf  fastcgi_params  koi-utf  koi-win  mime.types  modules  nginx.conf  proxy_params  scgi_params  sites-available  sites-enabled  snippets  uwsgi_params  win-utf`;
        }
        if (effectiveCwd === '/var/log') {
          return `alternatives.log  auth.log  boot.log  dpkg.log  journal  lastlog  nginx  syslog  ufw.log  wtmp`;
        }
        if (effectiveCwd === '/var/log/nginx') {
          return `access.log  error.log`;
        }
        if (effectiveCwd === '/var') {
          return `backups  cache  crash  lib  local  lock  log  mail  opt  run  spool  tmp  www`;
        }
        if (effectiveCwd === '/var/www') {
          return `html`;
        }
        if (effectiveCwd === '/var/www/html') {
          return `index.html  robots.txt  style.css`;
        }
        if (effectiveCwd === '/opt') {
          return `containerd  datadog-agent  monitoring`;
        }
        if (effectiveCwd === '/tmp') {
          return `systemd-private-10293  tmp.a83bfx`;
        }
        if (effectiveCwd === homeDir || effectiveCwd === '/root' || effectiveCwd.startsWith('/home')) {
          return `.bash_history  .bashrc  .profile  .ssh  docker-compose.yml  projects  scripts`;
        }
        return `drwxr-xr-x 2 ${user} ${user} 4096 Sep 20 01:00 .\ndrwxr-xr-x 3 root root 4096 Sep 20 00:55 ..`;
      }

      // Help
      if (cmd === 'help' || cmd === '--help') {
        return (
          `Linux System Emulator Runtime\n` +
          `Available built-in commands:\n` +
          `  uname, free, df, uptime, ip, ss, ufw, systemctl, journalctl, docker, ps, cat, ls, whoami, reboot, clear\n` +
          `Use the Snippets sidebar for instant executable commands.`
        );
      }

      // uname -a
      if (cmd.startsWith('uname')) {
        return `Linux ${host} 6.8.0-31-generic #31-Ubuntu SMP PREEMPT_DYNAMIC Sat Apr 20 00:40:06 UTC 2024 x86_64 x86_64 x86_64 GNU/Linux`;
      }

      // free -h / free -m
      if (cmd.startsWith('free')) {
        const usedRam = Math.round(ram * 0.38);
        const freeRam = ram - usedRam - 2;
        return (
          `               total        used        free      shared  buff/cache   available\n` +
          `Mem:           ${ram}Gi       ${usedRam}Gi       ${freeRam}Gi       320Mi       2.0Gi        ${freeRam + 1}Gi\n` +
          `Swap:          4.0Gi       128Mi       3.8Gi`
        );
      }

      // df -h
      if (cmd.startsWith('df')) {
        const usedDisk = Math.round(disk * 0.42);
        const availDisk = disk - usedDisk;
        return (
          `Filesystem      Size  Used Avail Use% Mounted on\n` +
          `/dev/nvme0n1p2  ${disk}G  ${usedDisk}G  ${availDisk}G  42% /\n` +
          `/dev/nvme0n1p1  511M  6.1M  505M   2% /boot/efi\n` +
          `/dev/nvme1n1    1.8T  412G  1.3T  25% /var/data`
        );
      }

      // uptime
      if (cmd.startsWith('uptime')) {
        return ` 14:28:10 up 45 days, 12:35,  2 users,  load average: 0.24, 0.31, 0.28`;
      }

      // ip a / ip -br a
      if (cmd.startsWith('ip')) {
        if (cmd.includes('-br')) {
          return (
            `lo               UNKNOWN        127.0.0.1/8 ::1/128\n` +
            `eth0             UP             ${ip}/24 fe80::216:3eff:fe45:b89/64\n` +
            `docker0          UP             172.17.0.1/16`
          );
        }
        return (
          `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000\n` +
          `    inet 127.0.0.1/8 scope host lo\n` +
          `2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000\n` +
          `    inet ${ip}/24 brd 192.168.10.255 scope global dynamic eth0\n` +
          `3: docker0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP group default\n` +
          `    inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0`
        );
      }

      // ss -tulpn
      if (cmd.startsWith('ss') || cmd.startsWith('netstat')) {
        return (
          `Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess\n` +
          `tcp   LISTEN 0      128          0.0.0.0:22         0.0.0.0:*    users:(("sshd",pid=842,fd=3))\n` +
          `tcp   LISTEN 0      511          0.0.0.0:80         0.0.0.0:*    users:(("nginx",pid=1120,fd=6))\n` +
          `tcp   LISTEN 0      511          0.0.0.0:443        0.0.0.0:*    users:(("nginx",pid=1120,fd=7))\n` +
          `tcp   LISTEN 0      128        127.0.0.1:5432       0.0.0.0:*    users:(("postgres",pid=915,fd=4))\n` +
          `tcp   LISTEN 0      128        127.0.0.1:6379       0.0.0.0:*    users:(("redis-server",pid=920,fd=6))`
        );
      }

      // ufw status
      if (cmd.startsWith('ufw')) {
        return (
          `Status: active\n` +
          `Logging: on (low)\n` +
          `Default: deny (incoming), allow (outgoing), disabled (routed)\n` +
          `New profiles: skip\n\n` +
          `To                         Action      From\n` +
          `--                         ------      ----\n` +
          `22/tcp (OpenSSH)           ALLOW IN    Anywhere\n` +
          `80/tcp (Nginx HTTP)        ALLOW IN    Anywhere\n` +
          `443/tcp (Nginx HTTPS)      ALLOW IN    Anywhere\n` +
          `22/tcp (OpenSSH (v6))      ALLOW IN    Anywhere (v6)`
        );
      }

      // systemctl
      if (cmd.startsWith('systemctl')) {
        if (cmd.includes('--failed')) {
          return `0 loaded units listed. Pass --all to see loaded but inactive units, too.\nUNIT LOAD ACTIVE SUB DESCRIPTION\n\n0 loaded units listed.`;
        }
        return (
          `  UNIT                     LOAD   ACTIVE SUB     DESCRIPTION\n` +
          `  docker.service           loaded active running Docker Application Container Engine\n` +
          `  nginx.service            loaded active running A high performance web server and reverse proxy\n` +
          `  postgresql.service       loaded active running PostgreSQL RDBMS Server\n` +
          `  ssh.service              loaded active running OpenBSD Secure Shell server\n` +
          `  systemd-journald.service loaded active running Journal Service`
        );
      }

      // journalctl
      if (cmd.startsWith('journalctl')) {
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        return (
          `${now} ${host} systemd[1]: Starting Daily apt download activities...\n` +
          `${now} ${host} systemd[1]: apt-daily.service: Deactivated successfully.\n` +
          `${now} ${host} sshd[842]: Server listening on 0.0.0.0 port 22.\n` +
          `${now} ${host} nginx[1120]: Configuration syntax ok, test successful.`
        );
      }

      // docker ps
      if (cmd.startsWith('docker')) {
        return (
          `CONTAINER ID   IMAGE                 COMMAND                  CREATED        STATUS        PORTS                                       NAMES\n` +
          `4a8b1c9d2e3f   nginx:alpine          "/docker-entrypoint.…"   3 days ago     Up 3 days     0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp    web-gateway\n` +
          `8f7e6d5c4b3a   postgres:16-alpine    "docker-entrypoint.s…"   12 days ago    Up 12 days    127.0.0.1:5432->5432/tcp                    db-primary\n` +
          `1b2c3d4e5f6a   redis:7-alpine        "docker-entrypoint.s…"   12 days ago    Up 12 days    127.0.0.1:6379->6379/tcp                    redis-cache`
        );
      }

      // whoami
      if (cmd === 'whoami') {
        return server?.ssh_username || 'root';
      }

      // nginx -t
      if (cmd.startsWith('nginx')) {
        return `nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful`;
      }

      // reboot
      if (cmd.startsWith('reboot')) {
        return `Broadcast message from root@${host} (pts/0):\n\nThe system is going down for reboot NOW!`;
      }

      // Generic command fallback
      return `Executed on ${host}: ${cmd}`;
    },
    [server]
  );

  // Connect WebSocket session for a specific pane
  const connectPaneSession = useCallback(
    (
      paneId: string,
      customShell?: 'bash' | 'zsh',
      suppliedPassword?: string,
      customServer?: RemoteServer
    ) => {
      const currentPane = panes.find((p) => p.id === paneId);
      const targetServer =
        customServer ||
        (paneId === 'pane-1' && server?.id ? server : null) ||
        (currentPane?.server && currentPane.server.id ? currentPane.server : null) ||
        server;

      if (!targetServer || !targetServer.id) {
        console.warn('[LinuxTerminal] Target server invalid or missing ID:', targetServer);
        return;
      }

      const targetShell = customShell || currentPane?.selectedShell || initialShell || 'bash';
      const targetPassword =
        suppliedPassword !== undefined
          ? suppliedPassword
          : currentPane?.ephemeralPassword !== undefined
          ? currentPane.ephemeralPassword
          : (targetServer.id === server?.id && sessionPassword)
          ? sessionPassword
          : targetServer.ssh_password;

      // Close existing socket for this pane
      if (wsRefs.current[paneId]) {
        try {
          wsRefs.current[paneId]?.close();
        } catch {}
        wsRefs.current[paneId] = null;
      }

      // Guard against connecting without password if prompt_password_on_connect is true
      if (targetServer.prompt_password_on_connect && !targetPassword) {
        setPanes((prev) =>
          prev.map((p) => (p.id === paneId ? { ...p, isPasswordPromptActive: true, isConnecting: false } : p))
        );
        return;
      }

      setPanes((prev) =>
        prev.map((p) => {
          if (p.id !== paneId) return p;
          return {
            ...p,
            server: targetServer,
            isConnecting: true,
            isConnected: false,
            selectedShell: targetShell,
            isPasswordPromptActive: false,
            lines: [
              ...p.lines,
              {
                id: Math.random().toString(),
                type: 'system',
                text: `[Connecting] Establishing ${targetShell.toUpperCase()} SSH session to ${targetServer.name} (${targetServer.ip}:${targetServer.ssh_port || 22})...`,
                timestamp: new Date().toLocaleTimeString(),
              },
            ],
          };
        })
      );

      const wsUrl = getRemoteServerWebSocketUrl(targetServer.id, targetShell, {
        ip: targetServer.ip,
        ssh_port: targetServer.ssh_port || 22,
        ssh_username: targetServer.ssh_username || 'root',
        ssh_password: targetServer.prompt_password_on_connect ? targetPassword || '' : targetPassword || targetServer.ssh_password,
      });

      try {
        const ws = new WebSocket(wsUrl);
        wsRefs.current[paneId] = ws;

        ws.onopen = () => {
          setPanes((prev) =>
            prev.map((p) => (p.id === paneId ? { ...p, isConnecting: true } : p))
          );
          inputRefs.current[paneId]?.focus();
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'data') {
              const rawData = msg.data || '';

              // Detect working directory from remote prompt or OSC 7 if present
              let detectedCwd: string | null = null;
              const osc7Match = rawData.match(/\x1b\]7;file:\/\/[^/]+([^\x07\x1b]+)(?:\x07|\x1b\\)/);
              if (osc7Match && osc7Match[1]) {
                try {
                  detectedCwd = decodeURIComponent(osc7Match[1]);
                } catch {
                  detectedCwd = osc7Match[1];
                }
              } else {
                const clean = rawData.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
                const promptMatch = clean.match(/(?:^|[\r\n])(?:\[?[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+(?:\s+|:)([^#$\]\r\n]+)[#$\]]|➜\s+[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+\s+([^ \r\n]+))\s*$/);
                if (promptMatch) {
                  detectedCwd = (promptMatch[1] || promptMatch[2] || '').trim();
                }
              }

              setPanes((prev) =>
                prev.map((p) => {
                  if (p.id !== paneId) return p;
                  return {
                    ...p,
                    cwd: detectedCwd || p.cwd,
                    lines: [
                      ...p.lines,
                      {
                        id: Math.random().toString(),
                        type: 'output',
                        text: rawData,
                        timestamp: new Date().toLocaleTimeString(),
                      },
                    ],
                  };
                })
              );
            } else if (msg.type === 'status') {
              if (msg.status === 'connected') {
                setPanes((prev) =>
                  prev.map((p) => {
                    if (p.id !== paneId) return p;
                    return {
                      ...p,
                      isConnected: true,
                      isConnecting: false,
                      lines: [
                        ...p.lines,
                        {
                          id: Math.random().toString(),
                          type: 'system',
                          text:
                            msg.message ||
                            `[Connected] Live SSH channel established with ${targetServer.ip} on /bin/${targetShell}.`,
                          timestamp: new Date().toLocaleTimeString(),
                        },
                      ],
                    };
                  })
                );
              } else if (msg.status === 'failed' || msg.status === 'disconnected') {
                setPanes((prev) =>
                  prev.map((p) => {
                    if (p.id !== paneId) return p;
                    return {
                      ...p,
                      isConnected: false,
                      isConnecting: false,
                      lines: [
                        ...p.lines,
                        {
                          id: Math.random().toString(),
                          type: 'system',
                          text:
                            msg.message ||
                            `[Notice] Remote host unreachable over direct socket bridge; switched seamlessly to server command emulator runtime.`,
                          timestamp: new Date().toLocaleTimeString(),
                        },
                      ],
                    };
                  })
                );
              }
            } else if (msg.type === 'error') {
              setPanes((prev) =>
                prev.map((p) => {
                  if (p.id !== paneId) return p;
                  return {
                    ...p,
                    isConnected: false,
                    isConnecting: false,
                    lines: [
                      ...p.lines,
                      {
                        id: Math.random().toString(),
                        type: 'error',
                        text: `[Error] ${msg.error || 'Connection failure'}`,
                        timestamp: new Date().toLocaleTimeString(),
                      },
                    ],
                  };
                })
              );
            }
          } catch {
            setPanes((prev) =>
              prev.map((p) => {
                if (p.id !== paneId) return p;
                return {
                  ...p,
                  lines: [
                    ...p.lines,
                    {
                      id: Math.random().toString(),
                      type: 'output',
                      text: String(event.data),
                      timestamp: new Date().toLocaleTimeString(),
                    },
                  ],
                };
              })
            );
          }
        };

        ws.onclose = () => {
          setPanes((prev) =>
            prev.map((p) => (p.id === paneId ? { ...p, isConnected: false, isConnecting: false } : p))
          );
        };

        ws.onerror = () => {
          setPanes((prev) =>
            prev.map((p) => {
              if (p.id !== paneId) return p;
              return {
                ...p,
                isConnected: false,
                isConnecting: false,
                lines: [
                  ...p.lines,
                  {
                    id: Math.random().toString(),
                    type: 'system',
                    text: `[Notice] Operating in high-fidelity local interactive emulation mode (${targetServer.ip} / ${targetShell}).`,
                    timestamp: new Date().toLocaleTimeString(),
                  },
                ],
              };
            })
          );
        };
      } catch {
        setPanes((prev) =>
          prev.map((p) => (p.id === paneId ? { ...p, isConnecting: false, isConnected: false } : p))
        );
      }
    },
    [server, panes, initialShell, sessionPassword]
  );

  // Lifecycle & Connection on modal open or server change
  useEffect(() => {
    if (isOpen && server && server.id) {
      const isNewServer = lastConnectedServerIdRef.current !== server.id;
      const isReopeningFromClosed = !prevIsOpenRef.current && !lastConnectedServerIdRef.current;

      if (isNewServer || isReopeningFromClosed) {
        lastConnectedServerIdRef.current = server.id;
        const freshPane: TerminalPane = {
          id: 'pane-1',
          server: server,
          title: `${server.name} (${initialShell})`,
          selectedShell: initialShell,
          lines: [],
          inputVal: '',
          history: [],
          historyIdx: -1,
          isConnected: false,
          isConnecting: true,
          ephemeralPassword: sessionPassword,
          isPasswordPromptActive: Boolean(server.prompt_password_on_connect && !sessionPassword),
          cwd: '~',
          previousCwd: '~',
        };
        setPanes([freshPane]);
        setActivePaneId('pane-1');
        setLayoutMode('single');

        connectPaneSession('pane-1', initialShell, sessionPassword, server);
      } else if (!prevIsOpenRef.current) {
        // Restoring from minimize: reconnect active sockets if disconnected
        panes.forEach((p) => {
          const paneServer = p.server?.id ? p.server : server;
          if (!wsRefs.current[p.id] || wsRefs.current[p.id]?.readyState !== WebSocket.OPEN) {
            connectPaneSession(p.id, p.selectedShell, p.ephemeralPassword, paneServer);
          }
        });
      }
      prevIsOpenRef.current = true;
    } else if (!isOpen) {
      prevIsOpenRef.current = false;
      // Cleanup all sockets when modal is hidden
      Object.values(wsRefs.current).forEach((ws) => {
        try {
          ws?.close();
        } catch {}
      });
      wsRefs.current = {};
    }

    return () => {
      Object.values(wsRefs.current).forEach((ws) => {
        try {
          ws?.close();
        } catch {}
      });
      wsRefs.current = {};
    };
  }, [isOpen, server, initialShell, sessionPassword]);

  // Auto-scroll each pane to bottom
  useEffect(() => {
    panes.forEach((p) => {
      const el = scrollRefs.current[p.id];
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, [panes]);

  // Execute Command on target pane
  const executeCommandOnPane = useCallback(
    (paneId: string, cmdToRun: string) => {
      const trimmed = cmdToRun.trim();
      if (!trimmed) return;

      const targetPane = panes.find((p) => p.id === paneId);
      if (!targetPane) return;

      const paneServer = targetPane.server || server;
      const currentCwd = targetPane.cwd || '~';
      const promptStr = getPromptString(targetPane.selectedShell, currentCwd, paneServer);

      const user = paneServer?.ssh_username || 'root';
      const homeDir = user === 'root' ? '/root' : `/home/${user}`;

      let newCwd = currentCwd;
      let newPreviousCwd = targetPane.previousCwd || '~';
      let directOutput: string | null = null;

      // Detect cd command (e.g., "cd", "cd /var/log", "cd ..", "cd -", "cd ~/projects")
      const cdMatch = trimmed.match(/^cd(?:\s+(.*?))?(?:;.*|&&.*)?$/);
      if (cdMatch) {
        let rawTarget = (cdMatch[1] || '').trim();
        rawTarget = rawTarget.replace(/[;&].*$/, '').trim();
        const cleanTarget = rawTarget.replace(/^['"](.*)['"]$/, '$1').trim();

        const resolved = resolveLinuxPath(currentCwd, cleanTarget, homeDir, targetPane.previousCwd);
        newPreviousCwd = currentCwd;
        newCwd = resolved.displayCwd;

        if (cleanTarget === '-') {
          // Standard bash outputs new directory when cd - is run
          directOutput = resolved.absPath;
        }
      }

      // Track created directories in VFS
      const mkdirMatch = trimmed.match(/^mkdir(?:\s+-[a-zA-Z]+)*\s+([^\s;&]+)/);
      if (mkdirMatch) {
        const rawDir = mkdirMatch[1].trim().replace(/^['"](.*)['"]$/, '$1');
        const resolved = resolveLinuxPath(currentCwd, rawDir, homeDir);
        const lastSlash = resolved.absPath.lastIndexOf('/');
        const parent = lastSlash <= 0 ? '/' : resolved.absPath.slice(0, lastSlash);
        const dirName = resolved.absPath.slice(lastSlash + 1);
        if (dirName) {
          registerVfsEntry(parent, dirName, 'dir');
        }
      }

      // Track created files in VFS
      const touchMatch = trimmed.match(/^(?:touch|nano|vim|vi)\s+([^\s;&]+)/);
      if (touchMatch) {
        const rawFile = touchMatch[1].trim().replace(/^['"](.*)['"]$/, '$1');
        const resolved = resolveLinuxPath(currentCwd, rawFile, homeDir);
        const lastSlash = resolved.absPath.lastIndexOf('/');
        const parent = lastSlash <= 0 ? '/' : resolved.absPath.slice(0, lastSlash);
        const fileName = resolved.absPath.slice(lastSlash + 1);
        if (fileName) {
          registerVfsEntry(parent, fileName, 'file');
        }
      }

      // Track removed files/directories in VFS
      const rmMatch = trimmed.match(/^rm(?:\s+-[a-zA-Z]+)*\s+([^\s;&]+)/);
      if (rmMatch) {
        const rawTarget = rmMatch[1].trim().replace(/^['"](.*)['"]$/, '$1');
        const resolved = resolveLinuxPath(currentCwd, rawTarget, homeDir);
        const lastSlash = resolved.absPath.lastIndexOf('/');
        const parent = lastSlash <= 0 ? '/' : resolved.absPath.slice(0, lastSlash);
        const targetName = resolved.absPath.slice(lastSlash + 1);
        if (targetName) {
          removeVfsEntry(parent, targetName);
        }
      }

      setPanes((prev) =>
        prev.map((p) => {
          if (p.id !== paneId) return p;
          const newLines: TerminalLogLine[] = [
            ...p.lines,
            {
              id: Math.random().toString(),
              type: 'prompt-command',
              prompt: promptStr,
              text: trimmed,
              timestamp: new Date().toLocaleTimeString(),
            },
          ];

          if (directOutput) {
            newLines.push({
              id: Math.random().toString(),
              type: 'output',
              text: directOutput,
              timestamp: new Date().toLocaleTimeString(),
            });
          }

          return {
            ...p,
            cwd: newCwd,
            previousCwd: newPreviousCwd,
            inputVal: '',
            historyIdx: -1,
            history: [...p.history, trimmed],
            lines: newLines,
          };
        })
      );

      // Check live websocket
      const ws = wsRefs.current[paneId];
      let handledByWs = false;
      if (ws && ws.readyState === WebSocket.OPEN && targetPane.isConnected) {
        try {
          ws.send(
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

      if (!handledByWs && !directOutput) {
        setTimeout(() => {
          const response = generateEmulatedResponse(trimmed, newCwd, paneServer);
          if (response === '__CLEAR__') {
            setPanes((prev) => prev.map((p) => (p.id === paneId ? { ...p, lines: [] } : p)));
            return;
          }

          if (response) {
            setPanes((prev) =>
              prev.map((p) => {
                if (p.id !== paneId) return p;
                return {
                  ...p,
                  lines: [
                    ...p.lines,
                    {
                      id: Math.random().toString(),
                      type: 'output',
                      text: response,
                      timestamp: new Date().toLocaleTimeString(),
                    },
                  ],
                };
              })
            );
          }
        }, 40);
      }

      setTimeout(() => {
        inputRefs.current[paneId]?.focus();
      }, 50);
    },
    [panes, getPromptString, generateEmulatedResponse, server]
  );

  // Active Pane Intellisense computation
  const activePane = useMemo(() => {
    return panes.find((p) => p.id === activePaneId) || panes[0];
  }, [panes, activePaneId]);

  const activeIntellisense = useMemo<IntellisenseResult>(() => {
    if (!activePane || activePane.isPasswordPromptActive) {
      return { ghostSuggestion: '', completedInput: '', candidates: [], exactMatch: false };
    }
    const currentCwd = activePane.cwd || '~';
    const srv = activePane?.server || server;
    const user = srv?.ssh_username || 'root';
    const homeDir = user === 'root' ? '/root' : `/home/${user}`;
    return getIntellisense(activePane.inputVal, currentCwd, homeDir);
  }, [activePane, server]);

  // Handle Tab key and command history on a pane
  const handleKeyDownOnPane = (
    e: React.KeyboardEvent<HTMLInputElement>,
    paneId: string,
    pane: TerminalPane
  ) => {
    const paneServer = pane.server || server;
    const user = paneServer?.ssh_username || 'root';
    const homeDir = user === 'root' ? '/root' : `/home/${user}`;

    // 1. Tab Key: Linux Intellisense Autocomplete
    if (e.key === 'Tab') {
      e.preventDefault();
      const currentCwd = pane.cwd || '~';
      const intellisense = getIntellisense(pane.inputVal, currentCwd, homeDir);

      if (intellisense.candidates.length > 0) {
        if (intellisense.exactMatch || intellisense.completedInput !== pane.inputVal) {
          // Fill completed command directly
          setPanes((prev) =>
            prev.map((p) => (p.id === paneId ? { ...p, inputVal: intellisense.completedInput } : p))
          );
          if (intellisense.candidates.length <= 1) {
            setShowIntellisensePopup(false);
          } else {
            setShowIntellisensePopup(true);
          }
        } else if (intellisense.candidates.length > 1) {
          // Multiple matches: display candidate list in terminal lines (authentic Linux terminal behavior!)
          const candidatesFormatted = intellisense.candidates
            .map((c) => {
              if (c.isDir) {
                return `\x1b[1;34m${c.label}\x1b[0m`;
              }
              if (c.category === 'executable' || c.label.endsWith('.sh')) {
                return `\x1b[1;32m${c.label}\x1b[0m`;
              }
              return c.label;
            })
            .join('    ');

          setPanes((prev) =>
            prev.map((p) => {
              if (p.id !== paneId) return p;
              return {
                ...p,
                lines: [
                  ...p.lines,
                  {
                    id: Math.random().toString(),
                    type: 'prompt-command',
                    prompt: getPromptString(p.selectedShell, p.cwd || '~', p.server),
                    text: p.inputVal,
                    timestamp: new Date().toLocaleTimeString(),
                  },
                  {
                    id: Math.random().toString(),
                    type: 'info',
                    text: candidatesFormatted,
                    timestamp: new Date().toLocaleTimeString(),
                  },
                ],
              };
            })
          );
          setShowIntellisensePopup(true);
        }
      }
      return;
    }

    // Right Arrow: Accept ghost autocompletion if cursor is at the end of input
    if (e.key === 'ArrowRight') {
      const inputEl = inputRefs.current[paneId];
      if (inputEl && inputEl.selectionStart === pane.inputVal.length) {
        const currentCwd = pane.cwd || '~';
        const intellisense = getIntellisense(pane.inputVal, currentCwd, homeDir);
        if (intellisense.ghostSuggestion && intellisense.completedInput !== pane.inputVal) {
          e.preventDefault();
          setPanes((prev) =>
            prev.map((p) => (p.id === paneId ? { ...p, inputVal: intellisense.completedInput } : p))
          );
          return;
        }
      }
    }

    // 2. Enter Key: Run command
    if (e.key === 'Enter') {
      e.preventDefault();
      setShowIntellisensePopup(false);
      executeCommandOnPane(paneId, pane.inputVal);
      return;
    }

    // 3. Arrow Up: History Back or Intellisense Popup Navigation
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (showIntellisensePopup && activeIntellisense.candidates.length > 0) {
        setIntellisenseIndex((prev) =>
          prev <= 0 ? activeIntellisense.candidates.length - 1 : prev - 1
        );
        return;
      }
      if (pane.history.length === 0) return;
      const nextIdx = pane.historyIdx === -1 ? pane.history.length - 1 : Math.max(0, pane.historyIdx - 1);
      setPanes((prev) =>
        prev.map((p) =>
          p.id === paneId ? { ...p, historyIdx: nextIdx, inputVal: p.history[nextIdx] || '' } : p
        )
      );
      return;
    }

    // 4. Arrow Down: History Forward or Intellisense Popup Navigation
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (showIntellisensePopup && activeIntellisense.candidates.length > 0) {
        setIntellisenseIndex((prev) =>
          prev >= activeIntellisense.candidates.length - 1 ? 0 : prev + 1
        );
        return;
      }
      if (pane.historyIdx === -1) return;
      const nextIdx = pane.historyIdx + 1;
      if (nextIdx >= pane.history.length) {
        setPanes((prev) =>
          prev.map((p) => (p.id === paneId ? { ...p, historyIdx: -1, inputVal: '' } : p))
        );
      } else {
        setPanes((prev) =>
          prev.map((p) =>
            p.id === paneId ? { ...p, historyIdx: nextIdx, inputVal: pane.history[nextIdx] || '' } : p
          )
        );
      }
      return;
    }

    // 5. Ctrl + C: Abort current line
    if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      setShowIntellisensePopup(false);
      setPanes((prev) =>
        prev.map((p) => {
          if (p.id !== paneId) return p;
          return {
            ...p,
            inputVal: '',
            lines: [
              ...p.lines,
              {
                id: Math.random().toString(),
                type: 'prompt-command',
                prompt: getPromptString(p.selectedShell, p.cwd || '~', p.server),
                text: `${p.inputVal}^C`,
                timestamp: new Date().toLocaleTimeString(),
              },
            ],
          };
        })
      );
      return;
    }

    // 6. Ctrl + L: Clear screen
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setPanes((prev) => prev.map((p) => (p.id === paneId ? { ...p, lines: [] } : p)));
      return;
    }

    // 7. Escape: close popup
    if (e.key === 'Escape') {
      setShowIntellisensePopup(false);
    }
  };

  // Add a new split pane (for current server or a chosen different server)
  const handleAddSplitPane = (
    shellToUse: 'bash' | 'zsh' = 'bash',
    targetServer?: RemoteServer,
    targetPassword?: string
  ) => {
    if (panes.length >= 4) return;
    const srv = targetServer || server;
    if (!srv) return;

    const newId = `pane-${Date.now().toString(36).substring(2, 7)}`;
    const effectivePwd =
      targetPassword !== undefined
        ? targetPassword
        : srv.id === server?.id
        ? sessionPassword
        : srv.ssh_password;
    const needsPassword = Boolean(srv.prompt_password_on_connect && !effectivePwd);

    const newPane: TerminalPane = {
      id: newId,
      server: srv,
      title: `${srv.name} (${shellToUse})`,
      selectedShell: shellToUse,
      lines: [],
      inputVal: '',
      history: [],
      historyIdx: -1,
      isConnected: false,
      isConnecting: false,
      ephemeralPassword: effectivePwd,
      isPasswordPromptActive: needsPassword,
      cwd: '~',
      previousCwd: '~',
    };

    setPanes((prev) => [...prev, newPane]);
    setActivePaneId(newId);

    // Auto-adjust layout
    if (panes.length === 1) {
      setLayoutMode('split-cols');
    } else if (panes.length === 2) {
      setLayoutMode('split-cols');
    } else {
      setLayoutMode('grid-4');
    }

    setIsSplitMenuOpen(false);
    setIsServerPickerOpen(false);
    setSelectedServerForNewPane(null);
    setNewPanePassword('');

    // Connect new pane session
    setTimeout(() => {
      connectPaneSession(newId, shellToUse, effectivePwd, srv);
      inputRefs.current[newId]?.focus();
    }, 100);
  };

  // Close a specific pane
  const handleClosePane = (paneId: string) => {
    if (panes.length <= 1) return;
    // Close socket
    if (wsRefs.current[paneId]) {
      try {
        wsRefs.current[paneId]?.close();
      } catch {}
      delete wsRefs.current[paneId];
    }

    const remaining = panes.filter((p) => p.id !== paneId);
    setPanes(remaining);
    if (activePaneId === paneId && remaining.length > 0) {
      setActivePaneId(remaining[0].id);
    }
    if (remaining.length === 1) {
      setLayoutMode('single');
    }
  };

  // Close handler: reset lastConnectedServerIdRef so reopening connects fresh
  const handleCloseModal = () => {
    lastConnectedServerIdRef.current = null;
    onClose();
  };

  // Shell switch for specific pane
  const handleSwitchShellOnPane = (paneId: string, newShell: 'bash' | 'zsh') => {
    setPanes((prev) =>
      prev.map((p) => (p.id === paneId ? { ...p, selectedShell: newShell } : p))
    );
    const targetPane = panes.find((p) => p.id === paneId);
    const paneServer = (paneId === 'pane-1' && server?.id ? server : targetPane?.server?.id ? targetPane.server : server);
    connectPaneSession(paneId, newShell, undefined, paneServer);
  };

  // Clear specific pane
  const handleClearPane = (paneId: string) => {
    setPanes((prev) => prev.map((p) => (p.id === paneId ? { ...p, lines: [] } : p)));
    inputRefs.current[paneId]?.focus();
  };

  // Copy Snippet
  const handleCopySnippet = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 1500);
  };

  // Insert Snippet to active pane
  const handleInsertSnippet = (cmd: string) => {
    setPanes((prev) =>
      prev.map((p) => (p.id === activePaneId ? { ...p, inputVal: cmd } : p))
    );
    inputRefs.current[activePaneId]?.focus();
  };

  // Submit Password for on-demand auth
  const handleSubmitPasswordForPane = (paneId: string) => {
    const pwd = passwordInputs[paneId] || '';
    if (!pwd) return;

    setPanes((prev) =>
      prev.map((p) =>
        p.id === paneId
          ? { ...p, ephemeralPassword: pwd, isPasswordPromptActive: false }
          : p
      )
    );
    const targetPane = panes.find((p) => p.id === paneId);
    const paneServer = (paneId === 'pane-1' && server?.id ? server : targetPane?.server?.id ? targetPane.server : server);
    connectPaneSession(paneId, undefined, pwd, paneServer);
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

  // Grid classes according to layout mode & panes count
  const getGridClasses = () => {
    if (panes.length === 1 || layoutMode === 'single') return 'grid-cols-1 grid-rows-1';
    if (layoutMode === 'split-rows') return 'grid-cols-1 grid-rows-2';
    if (layoutMode === 'grid-4' || panes.length >= 4) return 'grid-cols-1 md:grid-cols-2 grid-rows-2';
    // split-cols default
    if (panes.length === 2) return 'grid-cols-1 md:grid-cols-2 grid-rows-1';
    if (panes.length === 3) return 'grid-cols-1 md:grid-cols-3 grid-rows-1';
    return 'grid-cols-1 md:grid-cols-2 grid-rows-2';
  };

  return createPortal(
    <div
      className={`fixed z-[9999] flex flex-col items-center justify-center ${
        isMaximized ? 'top-0 left-0 right-0 bottom-8 p-0' : 'inset-0 p-2 sm:p-4 bg-black/80 backdrop-blur-sm'
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col overflow-hidden transition-all duration-200 shadow-2xl ${
          isMaximized ? 'w-full h-full rounded-none border-none' : 'w-full max-w-7xl h-[90vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-900 border-slate-700 text-slate-100 shadow-2xl'
            : 'bg-black border-slate-800 text-slate-100 shadow-2xl'
        }`}
      >
        {/* Main Header with Server Info, Split Controls, Fullscreen & Minimize */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 bg-slate-950 border-b border-slate-800 shrink-0 select-none">
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
                {server.prompt_password_on_connect && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    <KeyRound className="w-2.5 h-2.5" />
                    <span>{isEn ? 'Zero-Storage Auth' : 'احراز هویت زمان اتصال'}</span>
                  </span>
                )}
                <span className="text-[10px] text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  {panes.length} {panes.length === 1 ? (isEn ? 'Shell' : 'شل') : isEn ? 'Shells' : 'شل همزمان'}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                {server.os_distro || 'Linux'} • Port: {server.ssh_port || 22} • User: {server.ssh_username || 'root'}
              </p>
            </div>
          </div>

          {/* Right Header Controls: Split Screen Dropdown + Sidebar + Fullscreen + Minimize + Close */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Split Screen Control Dropdown (Cisco Terminal Style!) */}
            <div className="relative" ref={splitMenuRef}>
              <button
                type="button"
                onClick={() => setIsSplitMenuOpen(!isSplitMenuOpen)}
                title={isEn ? 'Split Screen / Multi-Shell Layout' : 'تقسیم صفحه و شل‌های همزمان'}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  panes.length > 1
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                    : 'text-indigo-400 hover:text-white hover:bg-indigo-600/20 border-indigo-500/30'
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isEn ? 'Split' : 'تقسیم صفحه'}</span>
                {panes.length > 1 && (
                  <span className="text-[10px] font-bold bg-indigo-950/80 px-1.5 py-0.2 rounded text-indigo-200">
                    {panes.length}
                  </span>
                )}
                <ChevronDown className="w-3 h-3 text-indigo-300" />
              </button>

              {/* Split Options Dropdown */}
              {isSplitMenuOpen && (
                <div
                  className={`absolute top-full mt-1.5 ${
                    isEn ? 'right-0' : 'left-0'
                  } w-56 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-1.5 z-50 space-y-1`}
                >
                  <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {isEn ? 'Terminal Panes Layout' : 'چیدمان ترمینال‌های همزمان'}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (panes.length > 1) {
                        setPanes([panes[0]]);
                      }
                      setLayoutMode('single');
                      setIsSplitMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                      panes.length === 1 && layoutMode === 'single'
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Single Shell (1 Pane)' : 'تک شل (تمام‌صفحه)'}</span>
                    </div>
                    {panes.length === 1 && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (panes.length === 1) handleAddSplitPane('bash');
                      setLayoutMode('split-cols');
                      setIsSplitMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                      panes.length === 2 && layoutMode === 'split-cols'
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Columns className="w-3.5 h-3.5" />
                      <span>{isEn ? '2 Shells Side-by-Side' : '۲ شل در کنار هم (ستون)'}</span>
                    </div>
                    {panes.length === 2 && layoutMode === 'split-cols' && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (panes.length === 1) handleAddSplitPane('bash');
                      setLayoutMode('split-rows');
                      setIsSplitMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                      layoutMode === 'split-rows'
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Rows className="w-3.5 h-3.5" />
                      <span>{isEn ? '2 Shells Stacked (Rows)' : '۲ شل روی هم (ردیفی)'}</span>
                    </div>
                    {layoutMode === 'split-rows' && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      while (panes.length < 4) {
                        handleAddSplitPane(panes.length % 2 === 0 ? 'bash' : 'zsh');
                      }
                      setLayoutMode('grid-4');
                      setIsSplitMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                      panes.length === 4 && layoutMode === 'grid-4'
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Grid2X2 className="w-3.5 h-3.5" />
                      <span>{isEn ? '4 Shells (2x2 Grid)' : '۴ شل همزمان (شبکه‌ای)'}</span>
                    </div>
                    {panes.length === 4 && layoutMode === 'grid-4' && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <div className="border-t border-slate-800 pt-1.5 space-y-1">
                    <button
                      type="button"
                      disabled={panes.length >= 4}
                      onClick={() => handleAddSplitPane('bash')}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Add Shell (Current Server)' : 'افزودن شل (سرور فعلی)'}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 truncate max-w-[80px]">
                        {server?.name}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={panes.length >= 4 || !availableServers || availableServers.length <= 1}
                      onClick={() => {
                        setIsSplitMenuOpen(false);
                        setSelectedServerForNewPane(otherServers[0] || null);
                        setNewPanePassword('');
                        setIsServerPickerOpen(true);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Server className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Choose Server from List...' : 'انتخاب سرور از لیست...'}</span>
                      </div>
                      {otherServers.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-bold">
                          {otherServers.length}
                        </span>
                      )}
                    </button>

                    {/* Quick list of other servers right in dropdown */}
                    {otherServers.length > 0 && (
                      <div className="pt-1.5 border-t border-slate-800/80">
                        <div className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                          {isEn ? 'Quick-Connect Other Servers' : 'اتصال سریع به سایر سرورها'}
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-0.5 pe-0.5">
                          {otherServers.slice(0, 4).map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              disabled={panes.length >= 4}
                              onClick={() => {
                                handleAddSplitPane('bash', s);
                                setIsSplitMenuOpen(false);
                              }}
                              className="w-full flex items-center justify-between px-2 py-1 rounded text-xs text-slate-300 hover:text-white hover:bg-slate-800/90 transition text-left cursor-pointer disabled:opacity-40"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    s.status === 'online' ? 'bg-emerald-400' : 'bg-slate-500'
                                  }`}
                                />
                                <span className="truncate">{s.name}</span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400 shrink-0 ms-2">
                                {s.ip}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

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
              onClick={handleCloseModal}
              title={isEn ? 'Close' : 'بستن'}
              className="p-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/50 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Workspace Body: Split Grid Terminal Panes + Collapsible Sidebar */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden relative">
          {/* Multi-Pane Terminal Grid */}
          <div className={`flex-1 grid gap-1.5 p-1.5 bg-black overflow-hidden ${getGridClasses()}`}>
            {panes.map((pane, index) => {
              const isActive = pane.id === activePaneId;
              const paneServer = pane.server || server;
              const user = paneServer?.ssh_username || 'root';
              const homeDir = user === 'root' ? '/root' : `/home/${user}`;
              const intellisense = isActive ? activeIntellisense : getIntellisense(pane.inputVal, pane.cwd || '~', homeDir);
              const ghostText = intellisense.ghostSuggestion;

              return (
                <div
                  key={pane.id}
                  onClick={() => setActivePaneId(pane.id)}
                  className={`flex flex-col overflow-hidden rounded-xl border transition-all ${
                    isActive
                      ? 'border-indigo-500/80 shadow-lg shadow-indigo-950/40 ring-1 ring-indigo-500/40'
                      : 'border-slate-800/80 opacity-95 hover:border-slate-700'
                  } bg-[#050811]`}
                >
                  {/* Pane Sub-Header */}
                  <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/90 border-b border-slate-800/80 shrink-0 select-none text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          pane.isConnected
                            ? 'bg-emerald-400 shadow-xs shadow-emerald-400'
                            : pane.isConnecting
                            ? 'bg-amber-400 animate-pulse'
                            : 'bg-cyan-400'
                        }`}
                      />
                      <span className="font-bold text-white truncate text-xs flex items-center gap-1.5">
                        <Server className="w-3 h-3 text-indigo-400 shrink-0" />
                        <span className="truncate">{paneServer?.name || pane.title}</span>
                        <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
                          ({paneServer?.ip})
                        </span>
                      </span>

                      {/* Shell Selector */}
                      <div className="flex items-center bg-slate-900 rounded-md p-0.5 border border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleSwitchShellOnPane(pane.id, 'bash')}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
                            pane.selectedShell === 'bash'
                              ? 'bg-emerald-500 text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          bash
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSwitchShellOnPane(pane.id, 'zsh')}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
                            pane.selectedShell === 'zsh'
                              ? 'bg-cyan-500 text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          zsh
                        </button>
                      </div>

                      {/* Connection status tag */}
                      <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                        {pane.isConnected ? '● LIVE' : pane.isConnecting ? '● CONNECTING' : '● EMULATOR'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Clear Pane */}
                      <button
                        type="button"
                        onClick={() => handleClearPane(pane.id)}
                        title={isEn ? 'Clear screen' : 'پاکسازی'}
                        className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>

                      {/* Reconnect Pane */}
                      <button
                        type="button"
                        onClick={() => connectPaneSession(pane.id, pane.selectedShell, undefined, paneServer)}
                        title={isEn ? 'Reconnect' : 'اتصال مجدد'}
                        className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${pane.isConnecting ? 'animate-spin text-emerald-400' : ''}`} />
                      </button>

                      {/* Close Pane (only if > 1 pane) */}
                      {panes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleClosePane(pane.id)}
                          title={isEn ? 'Close this shell' : 'بستن این شل'}
                          className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/50 transition cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Pane Terminal Body */}
                  {pane.isPasswordPromptActive ? (
                    /* On-Demand Password Prompt Screen (Zero-Storage Auth Guard) */
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none bg-slate-950/60">
                      <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-3">
                        <KeyRound className="w-8 h-8" />
                      </div>
                      <h4 className="text-sm font-bold text-white mb-1">
                        {isEn ? 'SSH Authentication Required' : 'احراز هویت SSH لازم است'}
                      </h4>
                      <p className="text-xs text-slate-400 max-w-sm mb-4">
                        {isEn
                          ? `This server requires interactive password authentication for ${paneServer?.ssh_username || 'root'}@${paneServer?.ip}. Your password will remain strictly ephemeral.`
                          : `این سرور نیازمند دریافت رمز عبور در لحظه اتصال برای کاربر ${paneServer?.ssh_username || 'root'}@${paneServer?.ip} است. پسورد ذخیره نخواهد شد.`}
                      </p>

                      <div className="w-full max-w-xs space-y-3">
                        <div className="relative">
                          <input
                            type={showPasswordText[pane.id] ? 'text' : 'password'}
                            value={passwordInputs[pane.id] || ''}
                            onChange={(e) =>
                              setPasswordInputs((prev) => ({ ...prev, [pane.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSubmitPasswordForPane(pane.id);
                            }}
                            placeholder={isEn ? 'Enter SSH password...' : 'رمز عبور سرور را وارد کنید...'}
                            className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 text-white outline-none focus:border-amber-500 font-mono"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowPasswordText((prev) => ({ ...prev, [pane.id]: !prev[pane.id] }))
                            }
                            className={`absolute top-1/2 -translate-y-1/2 ${
                              isEn ? 'right-2.5' : 'left-2.5'
                            } text-slate-400 hover:text-white cursor-pointer`}
                          >
                            {showPasswordText[pane.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSubmitPasswordForPane(pane.id)}
                          className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>{isEn ? 'Authenticate & Open Shell' : 'احراز هویت و ورود به شل'}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Interactive Console */
                    <div
                      ref={(el) => {
                        scrollRefs.current[pane.id] = el;
                      }}
                      onClick={() => inputRefs.current[pane.id]?.focus()}
                      className="flex-1 overflow-y-auto p-3.5 font-mono text-slate-200 select-text cursor-text relative flex flex-col min-h-0"
                    >
                      {/* MOTD Banner */}
                      {pane.lines.length === 0 && (
                        <div className="mb-3 pb-2.5 border-b border-slate-800/80 text-xs text-slate-400 select-none">
                          <div className="text-emerald-400 font-bold text-xs">
                            Welcome to {paneServer?.os_distro || 'Linux'} on {paneServer?.name} ({paneServer?.hostname || paneServer?.ip})
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            * System load: 0.24, 0.31, 0.28 • Memory: {paneServer?.ram_gb || 16} GB • Shell: /bin/{pane.selectedShell} • Path: {pane.cwd || '~'}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                            <span>Tab for Intellisense autocompletion</span>
                            <span className="text-emerald-500 font-bold">● READY</span>
                          </div>
                        </div>
                      )}

                      {/* Render Lines with Clean ANSI Color Formatter! */}
                      <div className="space-y-0.5 text-xs sm:text-[13px]">
                        {pane.lines.map((l) => {
                          if (l.type === 'system') {
                            return (
                              <div key={l.id} className="text-cyan-400/90 text-xs py-0.5 flex items-baseline gap-2">
                                <span className="text-cyan-600 shrink-0 select-none">[{l.timestamp}]</span>
                                <span>{stripAnsi(l.text)}</span>
                              </div>
                            );
                          }
                          if (l.type === 'error') {
                            return (
                              <div key={l.id} className="text-rose-400 text-xs py-0.5 flex items-baseline gap-2">
                                <span className="text-rose-600 shrink-0 select-none">[{l.timestamp}]</span>
                                <span>{stripAnsi(l.text)}</span>
                              </div>
                            );
                          }
                          if (l.type === 'info') {
                            return (
                              <div key={l.id} className="text-slate-300 text-xs py-0.5 font-mono leading-relaxed whitespace-pre-wrap">
                                {renderAnsiFormattedText(l.text, l.id)}
                              </div>
                            );
                          }
                          if (l.type === 'prompt-command') {
                            return (
                              <div key={l.id} className="text-emerald-300 font-bold py-0.5 flex items-baseline flex-wrap">
                                <span className="text-emerald-400 select-none me-1.5 font-mono">
                                  {l.prompt || getPromptString(pane.selectedShell, pane.cwd || '~', paneServer)}
                                </span>
                                <span className="text-white font-mono">{l.text}</span>
                              </div>
                            );
                          }
                          return (
                            <pre
                              key={l.id}
                              className="text-slate-200 whitespace-pre-wrap font-mono leading-relaxed break-all py-0.5 text-xs sm:text-[13px]"
                            >
                              {renderAnsiFormattedText(l.text, l.id)}
                            </pre>
                          );
                        })}
                      </div>

                      {/* Interactive Prompt & Input with Ghost Autocomplete! */}
                      <div className="flex items-center flex-wrap pt-1 mt-auto relative">
                        <span className="text-emerald-400 font-bold text-xs sm:text-sm select-none font-mono whitespace-nowrap me-1.5">
                          {getPromptString(pane.selectedShell, pane.cwd || '~', paneServer)}
                        </span>
                        <div className="flex-1 min-w-[200px] flex items-center relative">
                          <input
                            ref={(el) => {
                              inputRefs.current[pane.id] = el;
                            }}
                            type="text"
                            value={pane.inputVal}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPanes((prev) =>
                                prev.map((p) => (p.id === pane.id ? { ...p, inputVal: val } : p))
                              );
                              if (!showIntellisensePopup && val.trim().length > 0) {
                                setShowIntellisensePopup(true);
                              }
                            }}
                            onKeyDown={(e) => handleKeyDownOnPane(e, pane.id, pane)}
                            className="w-full bg-transparent text-white font-mono text-xs sm:text-sm outline-none border-none p-0 focus:ring-0 z-10"
                            autoFocus={isActive}
                            autoComplete="off"
                            autoCapitalize="off"
                            spellCheck="false"
                          />

                          {/* Inline Ghost Suggestion Text ahead of Cursor (Tab to complete!) */}
                          {ghostText && (
                            <span
                              className="absolute top-0 pointer-events-none font-mono text-xs sm:text-sm text-slate-500 whitespace-pre select-none"
                              style={{
                                left: `${pane.inputVal.length * 7.8}px`,
                              }}
                            >
                              {ghostText}
                              <span className="text-[10px] text-slate-600 bg-slate-900 border border-slate-800 rounded px-1 ml-2">
                                Tab ⇥
                              </span>
                            </span>
                          )}
                        </div>

                        {/* Floating Intellisense Candidate Dropdown */}
                        {isActive && showIntellisensePopup && intellisense.candidates.length > 0 && (
                          <div
                            className="absolute bottom-full mb-1 left-0 z-30 w-full max-w-md rounded-xl bg-slate-900/95 border border-slate-700 shadow-2xl p-1.5 backdrop-blur-md max-h-48 overflow-y-auto space-y-1"
                          >
                            <div className="flex items-center justify-between px-2 py-0.5 text-[10px] font-bold text-slate-400 border-b border-slate-800 select-none">
                              <span>{isEn ? 'Linux Intellisense (Press Tab to Fill)' : 'پیشنهادات هوشمند (Tab برای تکمیل)'}</span>
                              <span className="text-indigo-400 font-mono">{intellisense.candidates.length} options</span>
                            </div>

                            {intellisense.candidates.slice(0, 8).map((cand, cIdx) => (
                              <button
                                key={cIdx}
                                type="button"
                                onClick={() => {
                                  const chosen = cand.fullCompletedInput || cand.insertText;
                                  setPanes((prev) =>
                                    prev.map((p) => (p.id === pane.id ? { ...p, inputVal: chosen } : p))
                                  );
                                  setShowIntellisensePopup(false);
                                  inputRefs.current[pane.id]?.focus();
                                }}
                                className={`w-full text-left px-2 py-1 rounded-lg flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                                  cIdx === intellisenseIndex ? 'bg-indigo-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-800'
                                }`}
                              >
                                <span className="font-mono text-emerald-400 font-semibold">{cand.label}</span>
                                <span className="text-[11px] text-slate-400 truncate text-right">
                                  {isEn ? cand.detail : cand.detailFa}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Collapsible Sidebar (Snippets Guide, Host Specs, History) */}
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
                        sidebarTab === 'snippets' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Snippets' : 'اسنیپت‌ها'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSidebarTab('specs')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                        sidebarTab === 'specs' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Server className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Host Specs' : 'مشخصات'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSidebarTab('history')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                        sidebarTab === 'history' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Command className="w-3.5 h-3.5" />
                      <span>{isEn ? `History (${activePane.history.length})` : `تاریخچه (${activePane.history.length})`}</span>
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
                              title={isEn ? 'Insert command into active prompt' : 'درج در خط فرمان فعال'}
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

                            {/* Run Immediately in active pane */}
                            <button
                              type="button"
                              onClick={() => executeCommandOnPane(activePaneId, snip.cmd)}
                              title={isEn ? 'Execute in active shell' : 'اجرای فوری در شل فعال'}
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
                        <span className="font-mono text-cyan-400">
                          {server.ip}:{server.ssh_port || 22}
                        </span>
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
                        <span className="font-mono text-slate-200">
                          {server.cpu_cores || 8} vCPU • {server.ram_gb || 32} GB
                        </span>
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
                    {activePane.history.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-500">
                        {isEn ? 'No commands executed yet.' : 'هنوز دستوری اجرا نشده است.'}
                      </div>
                    ) : (
                      activePane.history.map((hCmd, idx) => (
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
                              onClick={() => executeCommandOnPane(activePaneId, hCmd)}
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
        {/* Server Picker Modal Dialog for Split View */}
        {isServerPickerOpen && (
          <div
            className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={() => setIsServerPickerOpen(false)}
          >
            <div
              className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-4 bg-slate-950 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                      <span>{isEn ? 'Open Terminal on Another Server' : 'اتصال ترمینال به سرور دیگر'}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-normal font-mono">
                        {filteredModalServers.length} {isEn ? 'available' : 'سرور در دسترس'}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {isEn
                        ? 'Select an available server to add as a new split pane in the terminal grid.'
                        : 'سرور مورد نظر را برای ایجاد یک پنجره و تب شل مجزا در ترمینال انتخاب کنید.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsServerPickerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search & Filter Bar */}
              <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 left-3 text-slate-400" />
                  <input
                    type="text"
                    value={serverPickerSearch}
                    onChange={(e) => setServerPickerSearch(e.target.value)}
                    placeholder={
                      isEn
                        ? 'Search by server name, IP, OS distro, or tag...'
                        : 'جستجو بر اساس نام سرور، آی‌پی، سیستم‌عامل یا برچسب...'
                    }
                    className="w-full ps-9 pe-8 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    autoFocus
                  />
                  {serverPickerSearch && (
                    <button
                      type="button"
                      onClick={() => setServerPickerSearch('')}
                      className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Server List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-48 max-h-96">
                {filteredModalServers.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-xs">
                    {isEn ? 'No matching servers found.' : 'سروری با این مشخصات یافت نشد.'}
                  </div>
                ) : (
                  filteredModalServers.map((s) => {
                    const isSelected = selectedServerForNewPane?.id === s.id;
                    const isCurrentServer = s.id === server?.id;
                    return (
                      <div
                        key={s.id}
                        onClick={() => setSelectedServerForNewPane(s)}
                        onDoubleClick={() => {
                          setSelectedServerForNewPane(s);
                          handleAddSplitPane(newPaneShell, s, newPanePassword);
                        }}
                        className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-cyan-500/10 border-cyan-500 shadow-md shadow-cyan-950/40 ring-1 ring-cyan-500/50'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                              isSelected
                                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                                : 'bg-slate-800/80 border-slate-700 text-slate-300'
                            }`}
                          >
                            <Server className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs sm:text-sm text-white truncate">
                                {s.name}
                              </span>
                              {isCurrentServer && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                  {isEn ? 'Current Server' : 'سرور فعلی'}
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                  s.status === 'online'
                                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                    : 'bg-slate-700/50 text-slate-300 border-slate-600'
                                }`}
                              >
                                {s.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5 flex-wrap">
                              <span className="text-cyan-400">{s.ip}:{s.ssh_port || 22}</span>
                              <span>•</span>
                              <span>{s.ssh_username || 'root'}</span>
                              <span>•</span>
                              <span>{s.os_distro || 'Linux'}</span>
                              {s.environment && (
                                <>
                                  <span>•</span>
                                  <span className="text-amber-300">{s.environment}</span>
                                </>
                              )}
                            </div>
                            {s.tags && s.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {s.tags.map((t) => (
                                  <span
                                    key={t}
                                    className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono"
                                  >
                                    #{t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center">
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center transition ${
                              isSelected
                                ? 'border-cyan-500 bg-cyan-500 text-slate-950'
                                : 'border-slate-700 bg-slate-900'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Config: Shell Type, Optional Ephemeral Password, & Submit Action */}
              <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3 shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Shell Choice */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{isEn ? 'Shell:' : 'محیط شل:'}</span>
                    <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setNewPaneShell('bash')}
                        className={`px-3 py-1 rounded text-xs font-mono font-bold transition cursor-pointer ${
                          newPaneShell === 'bash'
                            ? 'bg-emerald-500 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        bash
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewPaneShell('zsh')}
                        className={`px-3 py-1 rounded text-xs font-mono font-bold transition cursor-pointer ${
                          newPaneShell === 'zsh'
                            ? 'bg-cyan-500 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        zsh
                      </button>
                    </div>
                  </div>

                  {/* Selected Server info summary */}
                  {selectedServerForNewPane && (
                    <div className="text-xs text-slate-300 flex items-center gap-1.5 truncate">
                      <span className="text-slate-400">{isEn ? 'Target:' : 'مقصد:'}</span>
                      <span className="font-bold text-cyan-300 font-mono">
                        {selectedServerForNewPane.name} ({selectedServerForNewPane.ip})
                      </span>
                    </div>
                  )}
                </div>

                {/* Password field if target server requires prompt on connect */}
                {selectedServerForNewPane?.prompt_password_on_connect && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-amber-300 font-bold flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Ephemeral Password Required' : 'رمز عبور یکبارمصرف'}</span>
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {isEn ? 'Not saved permanently' : 'ذخیره دائمی نمی‌شود'}
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type={showNewPanePassword ? 'text' : 'password'}
                        value={newPanePassword}
                        onChange={(e) => setNewPanePassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && selectedServerForNewPane) {
                            handleAddSplitPane(newPaneShell, selectedServerForNewPane, newPanePassword);
                          }
                        }}
                        placeholder={isEn ? 'Enter SSH password for this server...' : 'رمز عبور سرور را وارد کنید...'}
                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white outline-none focus:border-amber-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPanePassword(!showNewPanePassword)}
                        className={`absolute top-1/2 -translate-y-1/2 ${
                          isEn ? 'right-2.5' : 'left-2.5'
                        } text-slate-400 hover:text-white cursor-pointer`}
                      >
                        {showNewPanePassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsServerPickerOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>
                  <button
                    type="button"
                    disabled={!selectedServerForNewPane || panes.length >= 4}
                    onClick={() => {
                      if (selectedServerForNewPane) {
                        handleAddSplitPane(newPaneShell, selectedServerForNewPane, newPanePassword);
                      }
                    }}
                    className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition flex items-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>
                      {isEn ? 'Open Shell in Split Pane' : 'باز کردن شل در پنجره جدید'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
