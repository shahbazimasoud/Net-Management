import { Client, ConnectConfig } from 'ssh2';
import { getRemoteServerById, getAllRemoteServers } from './db';
import { addAuditLog } from './db';

export type LinuxDistroFamily = 'debian' | 'rhel' | 'arch' | 'alpine' | 'suse' | 'generic';

export function detectDistroFamily(distroStr?: string): LinuxDistroFamily {
  const d = (distroStr || '').toLowerCase();
  if (d.includes('ubuntu') || d.includes('debian') || d.includes('mint') || d.includes('pop') || d.includes('kali') || d.includes('raspbian')) {
    return 'debian';
  }
  if (d.includes('rhel') || d.includes('red hat') || d.includes('centos') || d.includes('rocky') || d.includes('alma') || d.includes('fedora') || d.includes('oracle') || d.includes('amazon')) {
    return 'rhel';
  }
  if (d.includes('arch') || d.includes('manjaro') || d.includes('endeavour')) {
    return 'arch';
  }
  if (d.includes('alpine')) {
    return 'alpine';
  }
  if (d.includes('suse') || d.includes('sles') || d.includes('opensuse')) {
    return 'suse';
  }
  return 'generic';
}

export interface BulkServerParameter {
  name: string;
  labelFa: string;
  labelEn: string;
  type: 'string' | 'number' | 'password' | 'select' | 'textarea' | 'boolean';
  required: boolean;
  placeholder?: string;
  default?: any;
  options?: Array<{ value: string; labelFa: string; labelEn: string }>;
  info_what_fa?: string;
  info_what_en?: string;
  info_why_fa?: string;
  info_why_en?: string;
  info_example_fa?: string;
  info_example_en?: string;
}

export interface BulkServerTemplate {
  id: string;
  category: 'maintenance' | 'security' | 'network' | 'users' | 'cron' | 'storage' | 'firewall' | 'services' | 'docker' | 'custom' | string;
  title: string;
  title_en: string;
  description: string;
  description_en: string;
  icon: string;
  parameters: BulkServerParameter[];
  is_dangerous: boolean;
  confirmation_keyword: string;
  default_timeout_sec: number;
  info_what_fa: string;
  info_what_en: string;
  info_why_fa: string;
  info_why_en: string;
  info_example_fa: string;
  info_example_en: string;
  distro_commands: {
    debian?: string | string[];
    rhel?: string | string[];
    arch?: string | string[];
    alpine?: string | string[];
    suse?: string | string[];
    generic: string | string[];
  };
}

export interface BulkServerPreviewStep {
  name: string;
  command: string;
  descriptionFa: string;
  descriptionEn: string;
  distro: string;
}

export interface BulkServerPreviewItem {
  serverId: string;
  serverName: string;
  serverIp: string;
  osType: string;
  osDistro: string;
  distroFamily: LinuxDistroFamily;
  steps: BulkServerPreviewStep[];
  isDangerous: boolean;
  confirmationKeyword: string;
  estimatedTimeoutSec: number;
}

export interface BulkServerStepDetail {
  stepIndex: number;
  stepName: string;
  command: string;
  descriptionFa: string;
  descriptionEn: string;
  status: 'running' | 'success' | 'failed' | 'skipped';
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  errorMessageFa?: string;
  errorMessageEn?: string;
}

export interface BulkServerExecutionResult {
  serverId: string;
  serverName: string;
  serverIp: string;
  osType: string;
  osDistro: string;
  distroFamily: LinuxDistroFamily;
  status: 'success' | 'failed' | 'partial' | 'skipped';
  stepsTotal: number;
  stepsCompleted: number;
  stepsDetail: BulkServerStepDetail[];
  rawOutput?: string;
  durationMs: number;
  executedAt: number;
  errorType?: string;
  errorMessageFa?: string;
  errorMessageEn?: string;
}

export interface BulkServerJobLog {
  timestamp: number;
  timeStr: string;
  level: 'info' | 'warning' | 'error' | 'success';
  messageFa: string;
  messageEn: string;
  serverId?: string;
}

export interface BulkServerJobStatus {
  jobId: string;
  templateId: string;
  templateTitle: string;
  templateTitleEn: string;
  parameters: Record<string, any>;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  totalServers: number;
  completedServers: number;
  percentage: number;
  currentServerIndex: number;
  currentServerName: string;
  currentStepName: string;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  options: {
    timeoutSec: number;
    delayMs: number;
    dangerConfirmation?: string;
  };
  results: Record<string, BulkServerExecutionResult>;
  logs: BulkServerJobLog[];
}

// ---------------------------------------------------------------------------
// Practical Linux Server Templates
// ---------------------------------------------------------------------------
export const LINUX_SERVER_TEMPLATES: BulkServerTemplate[] = [
  {
    id: 'linux_security_updates',
    category: 'maintenance',
    title: 'به‌روزرسانی امنیتی و پچ سیستم‌عامل (Security Patching)',
    title_en: 'OS Security Updates & Security Patching',
    description: 'به‌روزرسانی مخازن پکیج و نصب بسته‌های امنیتی بر اساس توزیع لینوکس (APT / DNF / Pacman / APK)',
    description_en: 'Update package repositories and install security patches adaptively per Linux distribution.',
    icon: 'RefreshCw',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 120,
    info_what_fa: 'اجرای دستورات رسمی ارتقای بسته‌ها و پچ‌های امنیتی هسته و سرویس‌ها متناسب با مدیر بسته توزیع هدف.',
    info_what_en: 'Executes official package upgrades and security patches targeting OS kernels and services per distro package manager.',
    info_why_fa: 'بستن آسیب‌پذیری‌های روز صفر (Zero-day) و محافظت از ناوگان سرورها در برابر نفوذ و بدافزارها.',
    info_why_en: 'Patches known CVE vulnerabilities and protects the server fleet against remote exploits.',
    info_example_fa: 'روی Ubuntu از apt-get update و روی Rocky Linux از dnf upgrade --security استفاده می‌شود.',
    info_example_en: 'Uses apt-get update on Debian/Ubuntu and dnf upgrade --security on Rocky/RHEL automatically.',
    parameters: [
      {
        name: 'only_security',
        labelFa: 'صرفاً بسته‌های امنیتی (Security Only)',
        labelEn: 'Security Patches Only',
        type: 'boolean',
        required: false,
        default: true,
        info_what_fa: 'محدود کردن به‌روزرسانی فقط به پچ‌های امنیتی جهت جلوگیری از شکست وابستگی نرم‌افزارهای تجاری.',
        info_what_en: 'Restricts updates strictly to security advisories, minimizing regression risks in production.',
        info_why_fa: 'سرعت بالاتر و حداقل تغییر در ساختار کتابخانه‌های فعال.',
        info_why_en: 'Faster deployment and lower disruption to active production dependencies.',
        info_example_fa: 'فعال (پیشنهادی برای سرورهای Production)',
        info_example_en: 'Enabled (recommended for production workloads)'
      }
    ],
    distro_commands: {
      debian: [
        'export DEBIAN_FRONTEND=noninteractive',
        'apt-get update -q',
        'apt-get -y --only-upgrade install $(apt-get -s dist-upgrade | grep "^Inst" | grep -i security | awk \'{print $2}\') || apt-get -y upgrade'
      ],
      rhel: [
        'dnf check-update --security || true',
        'dnf upgrade-minimal --security -y || yum update-minimal --security -y'
      ],
      arch: [
        'pacman -Sy --noconfirm',
        'pacman -Su --noconfirm'
      ],
      alpine: [
        'apk update',
        'apk upgrade'
      ],
      suse: [
        'zypper refresh',
        'zypper patch --category security -y || zypper update -y'
      ],
      generic: [
        'if command -v apt-get >/dev/null; then export DEBIAN_FRONTEND=noninteractive && apt-get update -q && apt-get -y upgrade; elif command -v dnf >/dev/null; then dnf upgrade -y; elif command -v yum >/dev/null; then yum update -y; elif command -v pacman >/dev/null; then pacman -Syu --noconfirm; elif command -v apk >/dev/null; then apk update && apk upgrade; else echo "Unsupported package manager"; exit 1; fi'
      ]
    }
  },
  {
    id: 'linux_clean_cache_disk',
    category: 'maintenance',
    title: 'پاک‌سازی کش بسته‌ها و آزادسازی فضای دیسک (Disk Cleanup)',
    title_en: 'Package Cache Cleanup & Disk Space Reclaim',
    description: 'حذف کش‌های قدیمی پکیج منیجرها و لاگ‌های قدیمی ژورنال لینوکس جهت آزادسازی فضای ذخیره‌سازی',
    description_en: 'Clean obsolete package cache, orphaned dependencies, and rotated systemd journal logs.',
    icon: 'Trash2',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 45,
    info_what_fa: 'حذف فایل‌های .deb یا .rpm ذخیره‌شده در کش و کوتاه کردن لاگ‌های Journald سیستم‌عامل.',
    info_what_en: 'Cleans cached packages (.deb / .rpm) and truncates rotated systemd journal logs to reclaim SSD/NVMe space.',
    info_why_fa: 'جلوگیری از پر شدن پارتیشن روت (/) و کرش کردن سرویس‌های حیاتی مانند دیتابیس یا وب سرور.',
    info_why_en: 'Prevents root partition exhaustion and service downtime caused by out-of-space errors.',
    info_example_fa: 'آزادسازی چندین گیگابایت فضای خالی با نگهداری ۷ روز اخیر لاگ‌ها.',
    info_example_en: 'Reclaims multiple gigabytes of disk space while safely preserving recent 7-day logs.',
    parameters: [
      {
        name: 'vacuum_days',
        labelFa: 'حفظ ژورنال لاگ تا چند روز قبل (روز)',
        labelEn: 'Retain Journal Logs (Days)',
        type: 'number',
        required: true,
        default: 7,
        info_what_fa: 'تعداد روزهایی که لاگ‌های سیستم حفظ می‌شوند؛ لاگ‌های قدیمی‌تر به طور کامل حذف می‌گردند.',
        info_what_en: 'Number of days to keep systemd logs; older logs will be purged.',
        info_why_fa: 'جلوگیری از انباشت لاگ‌های ماه‌ها قبل در دایرکتوری /var/log/journal.',
        info_why_en: 'Prevents years of accumulated logs from consuming gigabytes of disk capacity.',
        info_example_fa: 'مقدار استاندارد: 7 یا 14 روز',
        info_example_en: 'Standard value: 7 or 14 days'
      }
    ],
    distro_commands: {
      debian: [
        'apt-get autoremove -y',
        'apt-get clean',
        'journalctl --vacuum-time={{vacuum_days}}d 2>/dev/null || true',
        'df -h /'
      ],
      rhel: [
        'dnf autoremove -y || yum autoremove -y || true',
        'dnf clean all || yum clean all',
        'journalctl --vacuum-time={{vacuum_days}}d 2>/dev/null || true',
        'df -h /'
      ],
      arch: [
        'pacman -Sc --noconfirm',
        'journalctl --vacuum-time={{vacuum_days}}d 2>/dev/null || true',
        'df -h /'
      ],
      alpine: [
        'apk cache clean',
        'rm -rf /var/cache/apk/*',
        'df -h /'
      ],
      generic: [
        'if command -v apt-get >/dev/null; then apt-get clean && apt-get autoremove -y; elif command -v dnf >/dev/null; then dnf clean all; fi',
        'journalctl --vacuum-time={{vacuum_days}}d 2>/dev/null || true',
        'df -h /'
      ]
    }
  },
  {
    id: 'linux_deploy_ssh_key',
    category: 'security',
    title: 'تزریق و ثبت کلید عمومی SSH در سرورها (Deploy SSH Key)',
    title_en: 'Deploy / Append Authorized SSH Public Key',
    description: 'تزریق امن کلید عمومی SSH جدید به فایل authorized_keys کاربران هدف با رعایت کامل پرمیشن‌ها',
    description_en: 'Safely inject an authorized SSH public key to target user with proper 700/600 permissions.',
    icon: 'Key',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 30,
    info_what_fa: 'افزودن کلید عمومی کاربر یا اتوماسیون به فایل ~/.ssh/authorized_keys بدون رونویسی روی کلیدهای قبلی.',
    info_what_en: 'Appends a public SSH key to ~/.ssh/authorized_keys idempotently without overwriting existing keys.',
    info_why_fa: 'فعال‌سازی ورود بدون رمز (Passwordless Key Authentication) برای اپراتورهای شبکه و اتوماسیون Ansible.',
    info_why_en: 'Enables secure cryptographic passwordless login for network engineers and automation tools.',
    info_example_fa: 'کلید ssh-ed25519 یا ssh-rsa برای کاربر root یا sysadmin.',
    info_example_en: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5... admin@noc',
    parameters: [
      {
        name: 'target_user',
        labelFa: 'نام کاربر هدف در سرور',
        labelEn: 'Target System User',
        type: 'string',
        required: true,
        default: 'root',
        info_what_fa: 'نام کاربری در لینوکس که کلید SSH به اکانت او اضافه می‌شود.',
        info_what_en: 'The Linux username whose authorized_keys file will receive this key.',
        info_why_fa: 'تعیین محدوده دسترسی کاربر متناظر.',
        info_why_en: 'Specifies the access privilege boundary for the key.',
        info_example_fa: 'root یا sysadmin یا ansible',
        info_example_en: 'root, ubuntu, or sysadmin'
      },
      {
        name: 'public_key',
        labelFa: 'متن کلید عمومی SSH (Public Key)',
        labelEn: 'SSH Public Key Content',
        type: 'textarea',
        required: true,
        placeholder: 'ssh-ed25519 AAAAC3... user@workstation',
        info_what_fa: 'رشته کلید عمومی استخراج شده از id_ed25519.pub یا id_rsa.pub.',
        info_what_en: 'Raw public key string generated via ssh-keygen.',
        info_why_fa: 'احراز هویت رمزنگاری نامتقارن برای نشست‌های SSH.',
        info_why_en: 'Enables asymmetric cryptographic authentication for SSH.',
        info_example_fa: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5... devops-key',
        info_example_en: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5... devops-key'
      }
    ],
    distro_commands: {
      generic: [
        'USER_HOME=$(getent passwd "{{target_user}}" | cut -d: -f6)',
        '[ -z "$USER_HOME" ] && USER_HOME="/home/{{target_user}}"',
        '[ "{{target_user}}" = "root" ] && USER_HOME="/root"',
        'mkdir -p "$USER_HOME/.ssh"',
        'chmod 700 "$USER_HOME/.ssh"',
        'touch "$USER_HOME/.ssh/authorized_keys"',
        'grep -qxF "{{public_key}}" "$USER_HOME/.ssh/authorized_keys" || echo "{{public_key}}" >> "$USER_HOME/.ssh/authorized_keys"',
        'chmod 600 "$USER_HOME/.ssh/authorized_keys"',
        'chown -R {{target_user}}:{{target_user}} "$USER_HOME/.ssh" 2>/dev/null || true',
        'echo "SSH key deployed successfully for user {{target_user}}."'
      ]
    }
  },
  {
    id: 'linux_ssh_hardening',
    category: 'security',
    title: 'سخت‌سازی امنیتی سرویس SSH (SSH Daemon Hardening)',
    title_en: 'SSH Daemon Security Hardening & Port Config',
    description: 'غیرفعال‌سازی ورود با پسورد روت، اجبار به کلید و بازپیکربندی امن sshd با تست صحت کانفیگ',
    description_en: 'Disable root password login, enforce key auth, and safely test & reload sshd service.',
    icon: 'Shield',
    is_dangerous: true,
    confirmation_keyword: 'HARDEN-SSH',
    default_timeout_sec: 40,
    info_what_fa: 'تنظیم پارامترهای PermitRootLogin prohibit-password و PasswordAuthentication در sshd_config.',
    info_what_en: 'Configures PermitRootLogin and PasswordAuthentication flags in the SSH daemon configuration.',
    info_why_fa: 'مسدودسازی حملات Brute-Force به پورت ۲۲ و بستن درگاه‌های ورود با حدس کلمه عبور.',
    info_why_en: 'Stops automated brute-force attacks against port 22 and mandates cryptographic key authentication.',
    info_example_fa: 'تنظیم PermitRootLogin روی prohibit-password تا ورود روت فقط با کلید ممکن باشد.',
    info_example_en: 'Set PermitRootLogin to prohibit-password so root can only authenticate via authorized SSH keys.',
    parameters: [
      {
        name: 'permit_root_login',
        labelFa: 'دسترسی روت از طریق SSH (PermitRootLogin)',
        labelEn: 'PermitRootLogin Policy',
        type: 'select',
        required: true,
        default: 'prohibit-password',
        options: [
          { value: 'prohibit-password', labelFa: 'فقط با کلید SSH (prohibit-password)', labelEn: 'Key-Only (prohibit-password - Recommended)' },
          { value: 'no', labelFa: 'ممنوعیت کامل ورود روت (no)', labelEn: 'Completely Disabled (no)' },
          { value: 'yes', labelFa: 'مجاز بودن کامل (yes)', labelEn: 'Permit All (yes - Insecure)' }
        ],
        info_what_fa: 'سطح دسترسی کاربر ارشد root برای ورود مستقیم از طریق شبکه.',
        info_what_en: 'The access rule allowing or denying root login via SSH sessions.',
        info_why_fa: 'ورود مستقیم روت با رمز بالاترین هدف مهاجمان در اینترنت است.',
        info_why_en: 'Direct root login with password is the primary vector for credential spraying attacks.',
        info_example_fa: 'prohibit-password (پیشنهادی استانداردهای CIS و NIST)',
        info_example_en: 'prohibit-password (CIS Benchmark / NIST recommendation)'
      },
      {
        name: 'disable_password_auth',
        labelFa: 'غیرفعال‌سازی کامل احراز هویت با رمز عبور',
        labelEn: 'Disable Password Authentication Entirely',
        type: 'boolean',
        required: false,
        default: false,
        info_what_fa: 'اجبار به ورود صرفاً از طریق کلید SSH برای تمام کاربران سیستم.',
        info_what_en: 'Forces all SSH connections to use cryptographic keys instead of passwords.',
        info_why_fa: 'حذف کامل خطر نشت یا حدس پسوردهای ضعیف کارکنان.',
        info_why_en: 'Completely eliminates credential stuffing and weak password hazards.',
        info_example_fa: 'غیرفعال (مگر اینکه مطمئن باشید کلیدتان روی سرور ثبت شده است)',
        info_example_en: 'Disabled by default unless all engineers have verified SSH keys'
      }
    ],
    distro_commands: {
      generic: [
        'cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak_$(date +%Y%m%d_%H%M%S)',
        'sed -i "s/^#*PermitRootLogin .*/PermitRootLogin {{permit_root_login}}/" /etc/ssh/sshd_config',
        'grep -q "^PermitRootLogin" /etc/ssh/sshd_config || echo "PermitRootLogin {{permit_root_login}}" >> /etc/ssh/sshd_config',
        'if [ "{{disable_password_auth}}" = "true" ]; then sed -i "s/^#*PasswordAuthentication .*/PasswordAuthentication no/" /etc/ssh/sshd_config; grep -q "^PasswordAuthentication" /etc/ssh/sshd_config || echo "PasswordAuthentication no" >> /etc/ssh/sshd_config; fi',
        'sshd -t',
        'systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || service ssh reload 2>/dev/null || service sshd reload 2>/dev/null || true',
        'echo "SSH configuration verified and reloaded successfully."'
      ]
    }
  },
  {
    id: 'linux_firewall_whitelist_port',
    category: 'security',
    title: 'باز کردن پورت در فایروال محلی (Firewall Port Whitelist)',
    title_en: 'Open / Whitelist Port in Local Firewall',
    description: 'باز کردن پورت TCP یا UDP مورد نظر در فایروال فعال سرور (UFW یا Firewalld بر اساس توزیع)',
    description_en: 'Safely whitelist a TCP/UDP service port in the active host firewall (UFW / Firewalld).',
    icon: 'Lock',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 35,
    info_what_fa: 'ایجاد قانون مجازسازی ترافیک ورودی در فایروال توزیع لینوکس.',
    info_what_en: 'Creates an inbound traffic allow rule in the host firewall (UFW for Ubuntu/Debian, Firewalld for RHEL/Rocky).',
    info_why_fa: 'فراهم‌سازی دسترسی به سرویس‌های جدید شبکه مانند پورت وب (۸۰/۴۴۳)، پورت مانیتورینگ (۹۱۰۰) یا دیتابیس.',
    info_why_en: 'Allows external or internal network traffic to reach local daemon ports while keeping other ports shielded.',
    info_example_fa: 'باز کردن پورت 443 TCP برای HTTPS روی تمام سرورهای وب ناوگان.',
    info_example_en: 'Open port 443 TCP for secure HTTPS web traffic across the entire web fleet.',
    parameters: [
      {
        name: 'port',
        labelFa: 'شماره پورت (Port Number)',
        labelEn: 'Port Number',
        type: 'number',
        required: true,
        default: 443,
        info_what_fa: 'شماره پورت در رنج ۱ تا ۶۵۵۳۵.',
        info_what_en: 'TCP/UDP destination port number.',
        info_why_fa: 'شناسایی سوکت هدف سرویس شبکه.',
        info_why_en: 'Designates the service socket destination.',
        info_example_fa: '443 (HTTPS), 80 (HTTP), 9100 (Node Exporter)',
        info_example_en: '443 (HTTPS), 80 (HTTP), 9100 (Node Exporter)'
      },
      {
        name: 'protocol',
        labelFa: 'پروتکل لایه انتقال',
        labelEn: 'Transport Protocol',
        type: 'select',
        required: true,
        default: 'tcp',
        options: [
          { value: 'tcp', labelFa: 'TCP (پیشنهادی)', labelEn: 'TCP (Recommended)' },
          { value: 'udp', labelFa: 'UDP', labelEn: 'UDP' }
        ],
        info_what_fa: 'پروتکل لایه ۴ شبکه.',
        info_what_en: 'Layer 4 transport protocol.',
        info_why_fa: 'تعیین نوع کانکشن برای تطبیق قوانین فایروال.',
        info_why_en: 'Matches the socket connection type in firewall tables.',
        info_example_fa: 'TCP برای وب و دیتابیس؛ UDP برای DNS و SNMP.',
        info_example_en: 'TCP for web/DB; UDP for DNS/SNMP/WireGuard.'
      }
    ],
    distro_commands: {
      debian: [
        'if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow {{port}}/{{protocol}}; echo "UFW port {{port}}/{{protocol}} allowed."; elif command -v iptables >/dev/null; then iptables -I INPUT -p {{protocol}} --dport {{port}} -j ACCEPT && echo "iptables rule added for {{port}}/{{protocol}}"; fi'
      ],
      rhel: [
        'if systemctl is-active --quiet firewalld; then firewall-cmd --permanent --add-port={{port}}/{{protocol}} && firewall-cmd --reload && echo "Firewalld port {{port}}/{{protocol}} opened."; elif command -v iptables >/dev/null; then iptables -I INPUT -p {{protocol}} --dport {{port}} -j ACCEPT; fi'
      ],
      generic: [
        'if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow {{port}}/{{protocol}}; elif command -v firewall-cmd >/dev/null && systemctl is-active --quiet firewalld; then firewall-cmd --permanent --add-port={{port}}/{{protocol}} && firewall-cmd --reload; else iptables -I INPUT -p {{protocol}} --dport {{port}} -j ACCEPT 2>/dev/null || true; fi',
        'echo "Firewall rule configured for port {{port}}/{{protocol}}."'
      ]
    }
  },
  {
    id: 'linux_ntp_timezone_sync',
    category: 'network',
    title: 'همگام‌سازی ساعت و تایم‌زون شبکه (NTP / Chrony Sync)',
    title_en: 'Configure NTP Time Synchronization & Timezone',
    description: 'تنظیم منطقه زمانی رسمی سرورها و فعال‌سازی سرویس همگام‌سازی زمان Chrony / systemd-timesyncd',
    description_en: 'Set official system timezone and enable Chrony/systemd-timesyncd for accurate clock sync.',
    icon: 'Clock',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 40,
    info_what_fa: 'هماهنگ‌سازی زمان محلی سرور با ساعت جهانی و تنظیم سرورهای منبع NTP.',
    info_what_en: 'Synchronizes system hardware and kernel clock with external NTP time sources.',
    info_why_fa: 'دقت در ثبت لاگ‌ها، گواهی‌های SSL/TLS، توکن‌های JWT و خوشه‌های دیتابیس وابسته به زمان دقیق هستند.',
    info_why_en: 'Crucial for SSL/TLS cert validation, Kerberos/AD auth, distributed DB replication, and accurate audit logs.',
    info_example_fa: 'تنظیم تایم‌زون روی Asia/Tehran یا UTC و فعال‌سازی سرویس chrony.',
    info_example_en: 'Set timezone to UTC or Asia/Tehran and enable Chrony network time daemon.',
    parameters: [
      {
        name: 'timezone',
        labelFa: 'منطقه زمانی (Timezone)',
        labelEn: 'System Timezone',
        type: 'select',
        required: true,
        default: 'UTC',
        options: [
          { value: 'UTC', labelFa: 'UTC (زمان هماهنگ جهانی - پیشنهادی سرورها)', labelEn: 'UTC (Coordinated Universal Time - Standard)' },
          { value: 'Asia/Tehran', labelFa: 'ایران / تهران (Asia/Tehran)', labelEn: 'Iran / Tehran (Asia/Tehran)' },
          { value: 'Europe/London', labelFa: 'اروپا / لندن (Europe/London)', labelEn: 'Europe / London' },
          { value: 'Europe/Berlin', labelFa: 'اروپا / برلین (Europe/Berlin)', labelEn: 'Europe / Berlin' },
          { value: 'America/New_York', labelFa: 'آمریکا / نیویورک (America/New_York)', labelEn: 'America / New York' }
        ],
        info_what_fa: 'شناسه استاندارد منطقه زمانی در جدول IANA Timezone Database.',
        info_what_en: 'Standard IANA timezone identifier.',
        info_why_fa: 'تطابق زمان لاگ‌ها با استانداردهای گزارش‌دهی سازمان.',
        info_why_en: 'Aligns log timestamps with corporate standards.',
        info_example_fa: 'UTC برای سرورهای ابری و بین‌المللی',
        info_example_en: 'UTC for cloud and multi-region infrastructure'
      }
    ],
    distro_commands: {
      debian: [
        'timedatectl set-timezone "{{timezone}}"',
        'timedatectl set-ntp on 2>/dev/null || true',
        'timedatectl status'
      ],
      rhel: [
        'timedatectl set-timezone "{{timezone}}"',
        'if ! systemctl is-active --quiet chronyd; then systemctl enable --now chronyd 2>/dev/null || true; fi',
        'timedatectl status'
      ],
      generic: [
        'timedatectl set-timezone "{{timezone}}" 2>/dev/null || ln -sf /usr/share/zoneinfo/{{timezone}} /etc/localtime',
        'timedatectl set-ntp on 2>/dev/null || true',
        'date'
      ]
    }
  },
  {
    id: 'linux_dns_nameservers',
    category: 'network',
    title: 'تنظیم و به‌روزرسانی DNS سرورها (DNS Nameservers)',
    title_en: 'Configure DNS Resolvers & Fallbacks',
    description: 'پیکربندی آدرس‌های DNS اولیه و ثانویه در /etc/resolv.conf یا systemd-resolved به صورت یکپارچه',
    description_en: 'Configure primary and secondary DNS resolvers across the fleet via resolv.conf / systemd-resolved.',
    icon: 'Network',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 30,
    info_what_fa: 'تنظیم آدرس سرورهای ترجمه نام دامنه (Domain Name System) در تنظیمات شبکه لینوکس.',
    info_what_en: 'Configures upstream recursive DNS resolvers for outbound domain name resolution.',
    info_why_fa: 'تضمین پایداری در دانلود بسته‌ها، ارتباط با APIها و جلوگیری از قطعی اینترنت سرور در زمان اختلال DNS.',
    info_why_en: 'Ensures reliable domain resolution for API calls, package mirrors, and external integrations.',
    info_example_fa: 'تنظیم DNS اولیه ۱.۱.۱.۱ و ثانویه ۸.۸.۸.۸ برای پایداری بالا.',
    info_example_en: 'Primary: 1.1.1.1 (Cloudflare), Secondary: 8.8.8.8 (Google DNS)',
    parameters: [
      {
        name: 'primary_dns',
        labelFa: 'آدرس DNS اولیه (Primary DNS)',
        labelEn: 'Primary DNS Server IP',
        type: 'string',
        required: true,
        default: '1.1.1.1',
        placeholder: '1.1.1.1',
        info_what_fa: 'آدرس سرور DNS پیش‌فرض سیستم.',
        info_what_en: 'The preferred DNS resolver IP address.',
        info_why_fa: 'مسئول اصلی پاسخ به پرس‌وجوهای نام در سیستم.',
        info_why_en: 'First point of contact for domain lookups.',
        info_example_fa: '1.1.1.1 یا 8.8.8.8 یا IP سرور داخلی سازمان',
        info_example_en: '1.1.1.1 or internal enterprise DNS server'
      },
      {
        name: 'secondary_dns',
        labelFa: 'آدرس DNS ثانویه (Secondary DNS)',
        labelEn: 'Secondary DNS Server IP',
        type: 'string',
        required: false,
        default: '8.8.8.8',
        placeholder: '8.8.8.8',
        info_what_fa: 'آدرس سرور DNS رزرو جهت فالبک در صورت قطعی سرور اول.',
        info_what_en: 'Fallback DNS resolver if the primary resolver is unresponsive.',
        info_why_fa: 'تضمین دسترسی دائمی سرور به شبکه جهانی.',
        info_why_en: 'Guarantees continuous uptime during upstream DNS hiccups.',
        info_example_fa: '8.8.8.8 یا 9.9.9.9 (Quad9)',
        info_example_en: '8.8.8.8 or 9.9.9.9'
      }
    ],
    distro_commands: {
      generic: [
        'if systemctl is-active --quiet systemd-resolved; then resolvectl dns $(ip route show default | awk \'{print $5}\') {{primary_dns}} {{secondary_dns}} 2>/dev/null || true; fi',
        'cp /etc/resolv.conf /etc/resolv.conf.bak_$(date +%s) 2>/dev/null || true',
        'echo "# Generated by NetTopology Fleet Automation" > /tmp/resolv.conf.tmp',
        'echo "nameserver {{primary_dns}}" >> /tmp/resolv.conf.tmp',
        '[ -n "{{secondary_dns}}" ] && echo "nameserver {{secondary_dns}}" >> /tmp/resolv.conf.tmp',
        'echo "options timeout:2 attempts:2 rotate" >> /tmp/resolv.conf.tmp',
        'cat /tmp/resolv.conf.tmp > /etc/resolv.conf',
        'rm -f /tmp/resolv.conf.tmp',
        'cat /etc/resolv.conf'
      ]
    }
  },
  {
    id: 'linux_service_lifecycle',
    category: 'services',
    title: 'مدیریت سرویس‌های سیستمی (Systemd Service Lifecycle)',
    title_en: 'Systemd Service Management (Restart / Reload / Enable)',
    description: 'اجرای دستورات ری‌استارت، بارگذاری مجدد، استارت یا فعال‌سازی سرویس‌های لینوکسی (Nginx, Docker, etc.)',
    description_en: 'Manage service lifecycle state (restart, reload, start, stop, enable) across the fleet.',
    icon: 'Cpu',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 40,
    info_what_fa: 'کنترل وضعیت دیمن‌ها و سرویس‌های فعال لینوکس از طریق Systemd.',
    info_what_en: 'Controls background system services using systemd unit management.',
    info_why_fa: 'اعمال تغییرات کانفیگ وب‌سرور یا دیتابیس در تمام گره‌های کلاستر بدون نیاز به لاگین تک‌تک.',
    info_why_en: 'Applies config updates or reboots daemon services synchronously across all fleet nodes.',
    info_example_fa: 'ری‌استارت همزمان سرویس nginx یا docker روی ۲۰ سرور لینوکسی.',
    info_example_en: 'Graceful reload of nginx or restart of docker across 20 web servers.',
    parameters: [
      {
        name: 'service_name',
        labelFa: 'نام سرویس (Service Name)',
        labelEn: 'Service Name',
        type: 'string',
        required: true,
        placeholder: 'nginx, docker, sshd, chrony',
        info_what_fa: 'نام واحد سرویس لینوکس (systemd unit name بدون پسوند .service).',
        info_what_en: 'Systemd unit name to target (without .service suffix).',
        info_why_fa: 'شناسایی دیمن هدف.',
        info_why_en: 'Specifies which daemon unit to manipulate.',
        info_example_fa: 'nginx, docker, postgresql, redis, fail2ban',
        info_example_en: 'nginx, docker, postgresql, redis, fail2ban'
      },
      {
        name: 'action',
        labelFa: 'عملیات مورد نظر (Action)',
        labelEn: 'Lifecycle Action',
        type: 'select',
        required: true,
        default: 'restart',
        options: [
          { value: 'restart', labelFa: 'ری‌استارت مجدد (restart)', labelEn: 'Restart (restart)' },
          { value: 'reload', labelFa: 'بارگذاری مجدد کانفیگ بدون قطعی (reload)', labelEn: 'Graceful Reload (reload)' },
          { value: 'start', labelFa: 'روشن کردن سرویس (start)', labelEn: 'Start Service (start)' },
          { value: 'stop', labelFa: 'توقف سرویس (stop)', labelEn: 'Stop Service (stop)' },
          { value: 'enable --now', labelFa: 'فعال‌سازی در بوت و اجرا (enable --now)', labelEn: 'Enable on Boot & Start' },
          { value: 'status', labelFa: 'بررسی وضعیت بدون تغییر (status)', labelEn: 'Check Status Only' }
        ],
        info_what_fa: 'نوع دستور ارسالی به systemctl.',
        info_what_en: 'The action argument passed to systemctl.',
        info_why_fa: 'تعیین اینکه آیا سرویس باید ریست، متوقف یا مجدداً بارگذاری شود.',
        info_why_en: 'Determines whether the daemon is restarted, stopped, or smoothly reloaded.',
        info_example_fa: 'reload برای وب سرورها جهت جلوگیری از قطعی درخواست کاربران',
        info_example_en: 'reload for Nginx to avoid terminating active client connections'
      }
    ],
    distro_commands: {
      alpine: [
        'rc-service {{service_name}} {{action}} 2>/dev/null || rc-service {{service_name}} status'
      ],
      generic: [
        'systemctl {{action}} {{service_name}}',
        'systemctl status {{service_name}} --no-pager | head -n 12'
      ]
    }
  },
  {
    id: 'linux_system_health_audit',
    category: 'maintenance',
    title: 'ممیزی جامع سلامت و عملکرد سرور (System Health & Metric Audit)',
    title_en: 'Comprehensive System Health & Performance Audit',
    description: 'دریافت فوری گزارش سلامت: بار پردازنده، میزان مصرف رم، ظرفیت دیسک، آپ‌تایم و ۱۰ پروسس سنگین',
    description_en: 'Collect instant health telemetry: CPU load, RAM usage, storage capacity, and top consumers.',
    icon: 'Activity',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 30,
    info_what_fa: 'استخراج متغیرهای حیاتی عملکرد سرور شامل CPU, Memory, Disk Space, Load Average و Kernel.',
    info_what_en: 'Extracts real-time server vitals: CPU load, RAM, disk partitions, uptime, and top processes.',
    info_why_fa: 'تشخیص زودهنگام سرورهایی که با کمبود رم یا پر شدن هارد مواجه هستند قبل از بروز قطعی.',
    info_why_en: 'Enables proactive troubleshooting of memory leaks, CPU spikes, and disk exhaustion.',
    info_example_fa: 'بررسی سلامت تمام ناوگان پس از انتشار نسخه جدید نرم‌افزار.',
    info_example_en: 'Rapid fleet health verification after a major application rollout.',
    parameters: [],
    distro_commands: {
      generic: [
        'echo "=== [1] HOSTNAME & UPTIME ===" && uptime && uname -r',
        'echo "=== [2] CPU SPECIFICATION & LOAD ===" && (lscpu | grep "Model name\\|CPU(s):" || true)',
        'echo "=== [3] MEMORY USAGE (RAM) ===" && free -h',
        'echo "=== [4] DISK PARTITIONS & USAGE ===" && df -hT -x tmpfs -x devtmpfs 2>/dev/null || df -h',
        'echo "=== [5] TOP 8 HIGH CPU PROCESSES ===" && ps aux --sort=-%cpu | head -n 9 | awk \'{print $1, $2, $3, $4, $11}\'',
        'echo "=== [6] TOP 8 HIGH MEMORY PROCESSES ===" && ps aux --sort=-%mem | head -n 9 | awk \'{print $1, $2, $3, $4, $11}\''
      ]
    }
  },
  {
    id: 'linux_audit_listening_ports',
    category: 'network',
    title: 'ممیزی پورت‌ها و سوکت‌های در حال گوش (Audit Listening Ports)',
    title_en: 'Audit Open Listening Network Ports & Sockets',
    description: 'بررسی سوکت‌های TCP و UDP در حال انتظار در تمام سرورها برای کشف سرویس‌های ناخواسته',
    description_en: 'Audit open TCP/UDP sockets and bind addresses across the fleet to detect rogue services.',
    icon: 'Network',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 25,
    info_what_fa: 'استفاده از ابزار ss و netstat برای لیست کردن تمام پورت‌هایی که سرور روی آنها به شبکه گوش می‌دهد.',
    info_what_en: 'Executes socket inspection (ss -tulpn) to reveal every listening port and process PID.',
    info_why_fa: 'کشف پورت‌های ناامن بازمانده مانند پورت‌های دیتابیس روی 0.0.0.0 یا درگاه‌های تست توسعه‌دهندگان.',
    info_why_en: 'Detects unauthorized exposed ports (e.g. Redis or MySQL bound to 0.0.0.0 without authentication).',
    info_example_fa: 'کشف سریع پورت‌های باز روی ۵۰ سرور لینوکسی به صورت یکجا.',
    info_example_en: 'Security posture audit to verify that only ports 22 and 443 are publicly bound.',
    parameters: [],
    distro_commands: {
      generic: [
        'if command -v ss >/dev/null; then ss -tulwnp; elif command -v netstat >/dev/null; then netstat -tulnp; else lsof -i -P -n | grep LISTEN; fi'
      ]
    }
  },
  {
    id: 'linux_create_admin_user',
    category: 'users',
    title: 'ایجاد کاربر راهبر سیستم با دسترسی Sudo (Create Sudo User)',
    title_en: 'Create System Administrator with Sudo Privileges',
    description: 'ایجاد کاربر جدید، تخصیص شل استاندارد و اعطای دسترسی به گروه sudo یا wheel بر اساس توزیع',
    description_en: 'Create a new administrative user with home directory and distro-aware sudo/wheel group access.',
    icon: 'Users',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 35,
    info_what_fa: 'تعریف یک حساب کاربری مهندسی در لینوکس با دایرکتوری خانگی و عضویت در گروه مدیران سیستم.',
    info_what_en: 'Provisions an engineer account with home folder and grants sudo privileges via sudo (Debian) or wheel (RHEL).',
    info_why_fa: 'ایجاد اکانت اختصاصی برای کارشناسان جدید شبکه بدون نیاز به اشتراک‌گذاری رمز کاربر root.',
    info_why_en: 'Provides personalized audit-friendly access without sharing the root superuser credentials.',
    info_example_fa: 'ایجاد حساب کاربری masoud در تمام سرورهای لینوکس ناوگان.',
    info_example_en: 'Create user sysadmin on all fleet servers with bash shell and sudo access.',
    parameters: [
      {
        name: 'username',
        labelFa: 'نام کاربری جدید (Username)',
        labelEn: 'New Username',
        type: 'string',
        required: true,
        placeholder: 'sysadmin, masoud, opsuser',
        info_what_fa: 'نام کاربری بدون فاصله با حروف کوچک انگلیسی.',
        info_what_en: 'Alphanumeric lowercase username for the Linux system.',
        info_why_fa: 'شناسه لاگین کاربر در شل و فایل‌های سیستم.',
        info_why_en: 'Unique identifier for the user in /etc/passwd.',
        info_example_fa: 'opsadmin یا devops',
        info_example_en: 'opsadmin or devops'
      },
      {
        name: 'shell',
        labelFa: 'شل پیش‌فرض (Default Shell)',
        labelEn: 'Default Login Shell',
        type: 'select',
        required: true,
        default: '/bin/bash',
        options: [
          { value: '/bin/bash', labelFa: 'Bash (/bin/bash)', labelEn: 'Bash (/bin/bash - Recommended)' },
          { value: '/bin/zsh', labelFa: 'Zsh (/bin/zsh)', labelEn: 'Zsh (/bin/zsh)' },
          { value: '/bin/sh', labelFa: 'POSIX Sh (/bin/sh)', labelEn: 'POSIX Sh (/bin/sh)' }
        ],
        info_what_fa: 'محیط خط فرمانی که کاربر پس از ورود با آن کار خواهد کرد.',
        info_what_en: 'Login shell spawned when user connects via SSH.',
        info_why_fa: 'تطابق با شل مورد علاقه و فایل‌های پروفایل کاربر.',
        info_why_en: 'Ensures familiar environment and history navigation.',
        info_example_fa: '/bin/bash',
        info_example_en: '/bin/bash'
      },
      {
        name: 'ssh_pubkey',
        labelFa: 'کلید عمومی SSH کاربر (اختیاری)',
        labelEn: 'SSH Public Key (Optional)',
        type: 'textarea',
        required: false,
        placeholder: 'ssh-ed25519 AAAAC3... user@laptop',
        info_what_fa: 'کلید احراز هویت برای ورود فوری بدون پسورد.',
        info_what_en: 'Optional authorized public key for immediate key-based login.',
        info_why_fa: 'امکان لاگین آنی بدون نیاز به تنظیم اولیه گذرواژه.',
        info_why_en: 'Enables instant zero-password login from day one.',
        info_example_fa: 'ssh-ed25519 AAAAC3... ops-laptop',
        info_example_en: 'ssh-ed25519 AAAAC3... ops-laptop'
      }
    ],
    distro_commands: {
      debian: [
        'id "{{username}}" 2>/dev/null || useradd -m -s "{{shell}}" "{{username}}"',
        'usermod -aG sudo "{{username}}"',
        'if [ -n "{{ssh_pubkey}}" ]; then mkdir -p /home/{{username}}/.ssh && touch /home/{{username}}/.ssh/authorized_keys && echo "{{ssh_pubkey}}" >> /home/{{username}}/.ssh/authorized_keys && chmod 700 /home/{{username}}/.ssh && chmod 600 /home/{{username}}/.ssh/authorized_keys && chown -R {{username}}:{{username}} /home/{{username}}/.ssh; fi',
        'id "{{username}}"'
      ],
      rhel: [
        'id "{{username}}" 2>/dev/null || useradd -m -s "{{shell}}" "{{username}}"',
        'usermod -aG wheel "{{username}}"',
        'if [ -n "{{ssh_pubkey}}" ]; then mkdir -p /home/{{username}}/.ssh && touch /home/{{username}}/.ssh/authorized_keys && echo "{{ssh_pubkey}}" >> /home/{{username}}/.ssh/authorized_keys && chmod 700 /home/{{username}}/.ssh && chmod 600 /home/{{username}}/.ssh/authorized_keys && chown -R {{username}}:{{username}} /home/{{username}}/.ssh; fi',
        'id "{{username}}"'
      ],
      alpine: [
        'id "{{username}}" 2>/dev/null || adduser -D -s "{{shell}}" "{{username}}"',
        'addgroup "{{username}}" wheel 2>/dev/null || true',
        'id "{{username}}"'
      ],
      generic: [
        'id "{{username}}" 2>/dev/null || useradd -m -s "{{shell}}" "{{username}}"',
        'usermod -aG sudo "{{username}}" 2>/dev/null || usermod -aG wheel "{{username}}" 2>/dev/null || true',
        'if [ -n "{{ssh_pubkey}}" ]; then mkdir -p /home/{{username}}/.ssh && touch /home/{{username}}/.ssh/authorized_keys && echo "{{ssh_pubkey}}" >> /home/{{username}}/.ssh/authorized_keys && chmod 700 /home/{{username}}/.ssh && chmod 600 /home/{{username}}/.ssh/authorized_keys && chown -R {{username}}:{{username}} /home/{{username}}/.ssh; fi',
        'id "{{username}}"'
      ]
    }
  },
  {
    id: 'linux_custom_command',
    category: 'custom',
    title: 'اجرای دستور خط فرمان آزاد (Ad-Hoc Custom Shell Command)',
    title_en: 'Execute Custom Ad-Hoc Shell Script Across Fleet',
    description: 'اجرای دستور یا اسکریپت بش دلخواه در تمام سرورهای انتخاب شده با نمایش تفکیک‌شده خروجی و زمان اجرا',
    description_en: 'Execute any custom Bash command or automation script across selected servers with live output.',
    icon: 'Terminal',
    is_dangerous: true,
    confirmation_keyword: 'EXECUTE',
    default_timeout_sec: 60,
    info_what_fa: 'ارسال و اجرای مستقیم دستور تایپ شده توسط کاربر در محیط شل سیستم هدف.',
    info_what_en: 'Sends and executes raw Bash/shell commands directly on selected remote Linux servers.',
    info_why_fa: 'انجام عملیات اختصاصی یا اسکریپت‌های مقطعی که در قالب‌های آماده وجود ندارند.',
    info_why_en: 'Empowers network and DevOps engineers to run fleet-wide ad-hoc diagnostics or custom scripts.',
    info_example_fa: 'grep "error" /var/log/nginx/error.log | tail -n 20',
    info_example_en: 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"',
    parameters: [
      {
        name: 'command',
        labelFa: 'دستور یا اسکریپت بش (Bash Command / Script)',
        labelEn: 'Bash Command / Script',
        type: 'textarea',
        required: true,
        placeholder: 'uname -a; df -h',
        info_what_fa: 'دستور یا مجموعه‌ای از دستورات معتبر شل لینوکس.',
        info_what_en: 'Any valid Linux terminal command or chained bash script.',
        info_why_fa: 'دستور مستقیماً در شل کاربر اجرا و خروجی آن به پنل بازگردانده می‌شود.',
        info_why_en: 'Executes natively on remote host and captures stdout, stderr, and exit codes.',
        info_example_fa: 'systemctl restart app && systemctl status app',
        info_example_en: 'journalctl -u my-service -n 50 --no-pager'
      },
      {
        name: 'run_as_sudo',
        labelFa: 'اجرا با دسترسی sudo (در صورت نیاز)',
        labelEn: 'Execute with sudo (if non-root)',
        type: 'boolean',
        required: false,
        default: false,
        info_what_fa: 'پیشوند sudo برای اجرای دستورات با اختیارات مدیریتی.',
        info_what_en: 'Prepends sudo if connecting user is non-root.',
        info_why_fa: 'اجرای دستوراتی که نیاز به تغییر در فایل‌های روت دارند.',
        info_why_en: 'Required for privileged system operations by standard users.',
        info_example_fa: 'فعال برای دستورات سطح سیستم',
        info_example_en: 'Enabled for root-restricted operations'
      }
    ],
    distro_commands: {
      generic: [
        '{{command}}'
      ]
    }
  },

  // 13. User Groups Management (Add / Remove)
  {
    id: 'linux_user_groups_management',
    category: 'users',
    title: 'مدیریت عضویت در گروه‌های کاربری (User Groups Management)',
    title_en: 'User Groups Membership Management (Add or Remove)',
    description: 'افزودن کاربر به گروه‌های ثانویه (مانند docker, sudo, wheel) یا حذف کاربر از گروه‌ها در سطح ناوگان',
    description_en: 'Add or remove specific user accounts from secondary groups across fleet servers.',
    icon: 'Users',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 30,
    info_what_fa: 'تغییر گروه‌های فرعی یک حساب کاربری برای اعطای یا سلب دسترسی به امکاناتی مثل داکر، سودو یا وب‌سرور.',
    info_what_en: 'Modifies user secondary groups to grant or revoke system capabilities such as docker, sudo or web server access.',
    info_why_fa: 'مدیریت یکپارچه سطوح دسترسی کارشناسان در سراسر سرورها بدون نیاز به ورود مجزا به هر ماشین.',
    info_why_en: 'Centrally provisions team roles and permissions across fleet instances in a single action.',
    info_example_fa: 'افزودن کاربر masoud به گروه‌های docker و sudo در تمامی سرورهای لینوکس.',
    info_example_en: 'Add user devops to docker and developers groups.',
    parameters: [
      {
        name: 'username',
        labelFa: 'نام کاربری (Username)',
        labelEn: 'Username',
        type: 'string',
        required: true,
        placeholder: 'masoud, devops',
        info_what_fa: 'نام کاربری هدف در سیستم لینوکس.',
        info_what_en: 'Target user account on the remote system.',
        info_why_fa: 'شناسه کاربری که گروه‌های آن تغییر خواهد کرد.',
        info_why_en: 'Identifies the user account to modify.',
        info_example_fa: 'masoud',
        info_example_en: 'masoud'
      },
      {
        name: 'action',
        labelFa: 'نوع عملیات (Action)',
        labelEn: 'Action',
        type: 'select',
        required: true,
        default: 'add',
        options: [
          { value: 'add', labelFa: 'افزودن به گروه‌ها (Add to groups)', labelEn: 'Add to groups (usermod -aG)' },
          { value: 'remove', labelFa: 'حذف از گروه‌ها (Remove from groups)', labelEn: 'Remove from groups (gpasswd -d)' }
        ],
        info_what_fa: 'مشخص‌کننده اضافه کردن کاربر به گروه‌ها یا حذف وی از آنها.',
        info_what_en: 'Determines whether groups are appended or user is removed from them.',
        info_why_fa: 'انتخاب جهت تغییر دسترسی.',
        info_why_en: 'Defines the permission transition direction.',
        info_example_fa: 'افزودن به گروه‌ها',
        info_example_en: 'Add to groups'
      },
      {
        name: 'groups',
        labelFa: 'نام گروه‌ها - با کاما جدا کنید (Comma-separated Groups)',
        labelEn: 'Comma-separated Groups',
        type: 'string',
        required: true,
        placeholder: 'docker, sudo, www-data',
        info_what_fa: 'لیست گروه‌های مورد نظر که با کاما انگلیسی از هم جدا شده‌اند.',
        info_what_en: 'Comma-separated list of system group names.',
        info_why_fa: 'تعیین گروه‌هایی که باید عضویت کاربر در آنها تغییر کند.',
        info_why_en: 'Specifies which groups to assign or unassign.',
        info_example_fa: 'docker, sudo',
        info_example_en: 'docker, developers'
      },
      {
        name: 'create_missing_groups',
        labelFa: 'ایجاد گروه‌های ناموجود (Create group if not exists)',
        labelEn: 'Create Group if Not Exists',
        type: 'boolean',
        required: false,
        default: true,
        info_what_fa: 'در صورت عدم وجود گروه در سیستم، آن را با دستور groupadd می‌سازد.',
        info_what_en: 'Automatically runs groupadd if group is not found on host.',
        info_why_fa: 'جلوگیری از شکست عملیات در صورت عدم تعریف قبلی گروه.',
        info_why_en: 'Prevents errors if group has not yet been provisioned on target host.',
        info_example_fa: 'فعال',
        info_example_en: 'Enabled'
      }
    ],
    distro_commands: {
      generic: [
        'bash -c \'USERNAME="{{username}}"; ACTION="{{action}}"; GROUPS="{{groups}}"; CREATE="{{create_missing_groups}}"; if ! id "$USERNAME" >/dev/null 2>&1; then echo "ERROR: User $USERNAME does not exist" >&2; exit 1; fi; IFS="," read -ra GRP_ARRAY <<< "$GROUPS"; for g in "${GRP_ARRAY[@]}"; do g=$(echo "$g" | tr -d "[:space:]"); [ -z "$g" ] && continue; if [ "$ACTION" = "add" ]; then if ! getent group "$g" >/dev/null 2>&1; then if [ "$CREATE" = "true" ] || [ "$CREATE" = "1" ]; then groupadd "$g" && echo "Group $g created."; else echo "Warning: Group $g does not exist. Skipping." >&2; continue; fi; fi; usermod -aG "$g" "$USERNAME" && echo "User $USERNAME added to group $g."; elif [ "$ACTION" = "remove" ]; then if command -v gpasswd >/dev/null 2>&1; then gpasswd -d "$USERNAME" "$g" && echo "User $USERNAME removed from group $g." || true; else echo "Cannot remove group: gpasswd not available" >&2; fi; fi; done; id "$USERNAME"\''
      ]
    }
  },

  // 14. Lock / Unlock / Expire User Account
  {
    id: 'linux_user_lock_expire',
    category: 'users',
    title: 'قفل، بازگشایی و انقضای حساب کاربری (Lock / Unlock / Expire User)',
    title_en: 'Lock, Unlock & Expire User Account or Password',
    description: 'مسدودسازی ورود کاربر، بازگشایی دسترسی، اجبار به تعویض گذرواژه یا تنظیم تاریخ انقضای اکانت',
    description_en: 'Lock inactive users, unlock accounts, expire passwords immediately or schedule expiry dates.',
    icon: 'Lock',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 30,
    info_what_fa: 'ابزار کنترل چرخه حیات حساب کاربری (Account Lifecycle) در لینوکس با ابزارهای passwd، usermod و chage.',
    info_what_en: 'Manages user lifecycle: locking accounts, unlocking, forcing immediate password rotation, or setting account expiration.',
    info_why_fa: 'امن‌سازی سریع در زمان خروج پرسنل از سازمان یا ملزم کردن کاربران به تغییر دوره‌ای رمز عبور.',
    info_why_en: 'Critical for offboarding staff, incident response, or enforcing password rotation policies.',
    info_example_fa: 'قفل فوری کاربر موقت یا تنظیم تاریخ انقضا تا پایان ماه.',
    info_example_en: 'Lock contractor account or set expiry date to 2026-12-31.',
    parameters: [
      {
        name: 'username',
        labelFa: 'نام کاربری (Username)',
        labelEn: 'Username',
        type: 'string',
        required: true,
        placeholder: 'masoud, contractor1',
        info_what_fa: 'نام کاربری هدف در سیستم.',
        info_what_en: 'Target username on remote servers.',
        info_why_fa: 'شناسه کاربری مورد نظر.',
        info_why_en: 'Account to be locked, unlocked or expired.',
        info_example_fa: 'contractor1',
        info_example_en: 'contractor1'
      },
      {
        name: 'action',
        labelFa: 'نوع عملیات (Action)',
        labelEn: 'Operation Type',
        type: 'select',
        required: true,
        default: 'lock',
        options: [
          { value: 'lock', labelFa: 'قفل و غیرفعال‌سازی کاربر (Lock & Disable Login)', labelEn: 'Lock & Disable Login' },
          { value: 'unlock', labelFa: 'بازگشایی قفل کاربر (Unlock & Enable Login)', labelEn: 'Unlock & Enable Login' },
          { value: 'expire_password_now', labelFa: 'انقضای فوری رمز و الزام به تغییر در ورود بعدی (Expire Password)', labelEn: 'Expire Password (Force Change on Next Login)' },
          { value: 'set_account_expiry', labelFa: 'تنظیم تاریخ انقضای حساب کاربری (Set Account Expiration Date)', labelEn: 'Set Account Expiration Date' },
          { value: 'remove_expiry', labelFa: 'حذف انقضا و نامحدود کردن (Remove Expiration / Never Expire)', labelEn: 'Remove Expiration (Never Expire)' }
        ],
        info_what_fa: 'نوع وضعیتی که باید بر روی حساب کاربری اعمال شود.',
        info_what_en: 'State transition to apply to the target user account.',
        info_why_fa: 'کنترل دقیق وضعیت دسترسی کاربر.',
        info_why_en: 'Enables tailored credential access control.',
        info_example_fa: 'قفل و غیرفعال‌سازی',
        info_example_en: 'Lock & Disable Login'
      },
      {
        name: 'expiry_date',
        labelFa: 'تاریخ انقضا در صورت انتخاب گزینه مربوطه (YYYY-MM-DD)',
        labelEn: 'Expiry Date (YYYY-MM-DD)',
        type: 'string',
        required: false,
        placeholder: '2026-12-31',
        info_what_fa: 'تاریخ میلادی به فرمت سال-ماه-روز جهت غیرفعال شدن خودکار حساب کاربری.',
        info_what_en: 'Calendar date formatted as YYYY-MM-DD when the account will automatically be disabled.',
        info_why_fa: 'تنظیم زمان خاتمه دسترسی پروژه‌های مدت‌دار و پیمانکاران.',
        info_why_en: 'Enforces automated account termination for contractors and temp staff.',
        info_example_fa: '2026-12-31',
        info_example_en: '2026-12-31'
      }
    ],
    distro_commands: {
      generic: [
        'bash -c \'USERNAME="{{username}}"; ACTION="{{action}}"; EXP_DATE="{{expiry_date}}"; if ! id "$USERNAME" >/dev/null 2>&1; then echo "ERROR: User $USERNAME does not exist" >&2; exit 1; fi; case "$ACTION" in lock) passwd -l "$USERNAME" 2>/dev/null; usermod -L "$USERNAME" 2>/dev/null; echo "Account $USERNAME is now LOCKED." ;; unlock) usermod -U "$USERNAME" 2>/dev/null; passwd -u "$USERNAME" 2>/dev/null; echo "Account $USERNAME is now UNLOCKED." ;; expire_password_now) chage -d 0 "$USERNAME"; echo "Password for $USERNAME expired. User must change password upon next login." ;; set_account_expiry) if [ -z "$EXP_DATE" ]; then echo "ERROR: expiry_date is required for set_account_expiry" >&2; exit 1; fi; chage -E "$EXP_DATE" "$USERNAME"; echo "Account $USERNAME scheduled to expire on $EXP_DATE." ;; remove_expiry) chage -E -1 "$USERNAME"; echo "Account $USERNAME expiration removed. Account will never expire." ;; esac; chage -l "$USERNAME"\''
      ]
    }
  },

  // 15. Delete User Account
  {
    id: 'linux_delete_user',
    category: 'users',
    title: 'حذف حساب کاربری (Delete User Account)',
    title_en: 'Delete User Account Across Fleet',
    description: 'حذف کاربر از سیستم با امکان پاک‌سازی دایرکتوری خانگی و خاتمه پردازش‌های فعال کاربر',
    description_en: 'Remove user accounts from selected servers with optional home folder cleanup.',
    icon: 'Trash2',
    is_dangerous: true,
    confirmation_keyword: 'DELETE_USER',
    default_timeout_sec: 40,
    info_what_fa: 'حذف شناسه کاربر از پایگاه داده حساب‌های کاربری سیستم با دستور userdel.',
    info_what_en: 'Removes the user entry from /etc/passwd and /etc/shadow using native userdel.',
    info_why_fa: 'پاک‌سازی کامل اکانت‌های غیرضروری یا پرسنل جدا شده از سازمان.',
    info_why_en: 'Permanently terminates obsolete credentials across fleet hosts.',
    info_example_fa: 'حذف کاربر testuser به همراه پوشه /home/testuser.',
    info_example_en: 'Delete user tempuser and clean up /home directory.',
    parameters: [
      {
        name: 'username',
        labelFa: 'نام کاربری جهت حذف (Username to Delete)',
        labelEn: 'Username to Delete',
        type: 'string',
        required: true,
        placeholder: 'tempuser, olduser',
        info_what_fa: 'نام کاربری که باید از سیستم‌ها حذف شود.',
        info_what_en: 'Username targeted for removal.',
        info_why_fa: 'مشخص‌کننده حساب کاربری جهت حذف.',
        info_why_en: 'Identifies the user account to delete.',
        info_example_fa: 'tempuser',
        info_example_en: 'tempuser'
      },
      {
        name: 'remove_home',
        labelFa: 'حذف پوشه خانگی کاربر (/home/username)',
        labelEn: 'Remove User Home Directory (-r)',
        type: 'boolean',
        required: false,
        default: false,
        info_what_fa: 'افزودن سوئیچ -r به userdel جهت پاک کردن دایرکتوری خانگی و فایل‌های کاربر.',
        info_what_en: 'Appends -r to userdel to delete user home folder and mail spool.',
        info_why_fa: 'آزادسازی فضای دیسک و عدم باقی‌ماندن فایل‌های یتیم.',
        info_why_en: 'Frees disk space and avoids orphaned home directories.',
        info_example_fa: 'فعال',
        info_example_en: 'Enabled'
      },
      {
        name: 'kill_processes',
        labelFa: 'خاتمه پردازش‌های در حال اجرای کاربر قبل از حذف (Kill Active Processes)',
        labelEn: 'Terminate Active User Processes Before Deletion',
        type: 'boolean',
        required: false,
        default: true,
        info_what_fa: 'ارسال سیگنال خاتمه به تمام برنامه‌های در حال اجرای کاربر با pkill -u.',
        info_what_en: 'Runs pkill -u to terminate processes before userdel.',
        info_why_fa: 'جلوگیری از خطای "user is currently used by process".',
        info_why_en: 'Prevents "user is currently used by process" errors during deletion.',
        info_example_fa: 'فعال',
        info_example_en: 'Enabled'
      }
    ],
    distro_commands: {
      generic: [
        'bash -c \'USERNAME="{{username}}"; if ! id "$USERNAME" >/dev/null 2>&1; then echo "User $USERNAME does not exist. Nothing to delete."; exit 0; fi; if [ "{{kill_processes}}" = "true" ] || [ "{{kill_processes}}" = "1" ]; then pkill -u "$USERNAME" 2>/dev/null || true; sleep 1; pkill -9 -u "$USERNAME" 2>/dev/null || true; fi; DEL_FLAGS=""; if [ "{{remove_home}}" = "true" ] || [ "{{remove_home}}" = "1" ]; then DEL_FLAGS="-r"; fi; userdel $DEL_FLAGS "$USERNAME"; echo "User $USERNAME has been successfully deleted."\''
      ]
    }
  },

  // 16. Change User Login Shell
  {
    id: 'linux_change_user_shell',
    category: 'users',
    title: 'تغییر شل ورودی کاربر (Change User Login Shell)',
    title_en: 'Change Default User Login Shell',
    description: 'تغییر مفسر خط فرمان ورودی کاربر به bash، zsh، sh یا مسدودسازی ورود با nologin',
    description_en: 'Update user login shell across fleet servers or block shell login with nologin.',
    icon: 'Terminal',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 25,
    info_what_fa: 'تغییر فیلد آخر فایل /etc/passwd با دستور chsh برای تعیین شل ورود کاربر.',
    info_what_en: 'Modifies the login shell field in /etc/passwd using native chsh utility.',
    info_why_fa: 'تنظیم شل دلخواه یا مسدودسازی ورود کاربر به خط فرمان (سرویس‌های فقط sftp یا پروکسی).',
    info_why_en: 'Customizes shell environment or restricts terminal access using /usr/sbin/nologin.',
    info_example_fa: 'تنظیم شل /usr/sbin/nologin برای کاربر ftp_user.',
    info_example_en: 'Set login shell to /bin/bash or /usr/sbin/nologin.',
    parameters: [
      {
        name: 'username',
        labelFa: 'نام کاربری (Username)',
        labelEn: 'Username',
        type: 'string',
        required: true,
        placeholder: 'masoud',
        info_what_fa: 'نام کاربری هدف در سیستم.',
        info_what_en: 'Target username.',
        info_why_fa: 'شناسه کاربری که شل آن تغییر می‌کند.',
        info_why_en: 'Identifies the user to update.',
        info_example_fa: 'masoud',
        info_example_en: 'masoud'
      },
      {
        name: 'new_shell',
        labelFa: 'شل جدید (New Shell)',
        labelEn: 'New Shell',
        type: 'select',
        required: true,
        default: '/bin/bash',
        options: [
          { value: '/bin/bash', labelFa: 'Bash (/bin/bash)', labelEn: 'Bash (/bin/bash)' },
          { value: '/bin/zsh', labelFa: 'Zsh (/bin/zsh)', labelEn: 'Zsh (/bin/zsh)' },
          { value: '/bin/sh', labelFa: 'POSIX Sh (/bin/sh)', labelEn: 'POSIX Sh (/bin/sh)' },
          { value: '/usr/sbin/nologin', labelFa: 'غیرفعال‌سازی لاگین شل (/usr/sbin/nologin)', labelEn: 'Disable Shell Login (/usr/sbin/nologin)' },
          { value: '/bin/false', labelFa: 'مسدودسازی شل (/bin/false)', labelEn: 'Block Shell (/bin/false)' }
        ],
        info_what_fa: 'مسیر اجرایی شل مورد نظر در سیستم.',
        info_what_en: 'Path to executable login shell.',
        info_why_fa: 'تعیین محیط خط فرمانی که به کاربر تحویل داده می‌شود.',
        info_why_en: 'Determines the shell interactive environment.',
        info_example_fa: '/bin/bash',
        info_example_en: '/bin/bash'
      }
    ],
    distro_commands: {
      generic: [
        'bash -c \'USERNAME="{{username}}"; NEW_SHELL="{{new_shell}}"; if ! id "$USERNAME" >/dev/null 2>&1; then echo "ERROR: User $USERNAME does not exist" >&2; exit 1; fi; chsh -s "$NEW_SHELL" "$USERNAME"; echo "Login shell for $USERNAME changed to $NEW_SHELL."; getent passwd "$USERNAME"\''
      ]
    }
  },

  // 17. Add / Schedule Cron Job
  {
    id: 'linux_cron_add_job',
    category: 'cron',
    title: 'افزودن و زمان‌بندی کرون‌جاب (Schedule New Cron Job)',
    title_en: 'Schedule New Distro-Aware Cron Job',
    description: 'تعریف کرون‌جاب با پریودهای آماده و بسیار ساده (هر دقیقه، ساعتی، روزانه، هفتگی، ماهانه، بوت سیستم یا فرمت دلخواه)',
    description_en: 'Easily define cron tasks with human-readable presets (every minute, hourly, daily, reboot, or custom expression).',
    icon: 'Clock',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 35,
    info_what_fa: 'ابزار زمان‌بندی خودکار کارها در لینوکس (Cron Daemon) برای اجرای دوره‌ای دستورات و اسکریپت‌ها.',
    info_what_en: 'Automated periodic task scheduling via native Linux crontab service.',
    info_why_fa: 'اتوماسیون کارهای دوره‌ای مانند پشتیبان‌گیری، پاک‌سازی کش و لاگ، همگام‌سازی زمان و گزارش‌گیری خودکار.',
    info_why_en: 'Essential for fleet automation: scheduled backups, health checks, cache clearance, and sync scripts.',
    info_example_fa: 'اجرای اسکریپت پشتیبان‌گیری روزانه رأس ساعت ۰۳:۰۰ بامداد.',
    info_example_en: 'Run backup script daily at 03:00 AM on all fleet hosts.',
    parameters: [
      {
        name: 'cron_id',
        labelFa: 'شناسه وظیفه - بدون فاصله انگلیسی (Cron Job Identifier)',
        labelEn: 'Job Identifier (No spaces)',
        type: 'string',
        required: true,
        placeholder: 'daily_backup, sync_ntp, log_cleanup',
        info_what_fa: 'یک کلمه انگلیسی کوتاه به عنوان برچسب یکتای کار جهت جلوگیری از تکرار و سهولت در حذف.',
        info_what_en: 'Alphanumeric identifier tag used to prevent duplicate jobs and allow simple deletion.',
        info_why_fa: 'امکان مدیریت و پاک‌سازی مطمئن کار بدون تداخل با سایر کرون‌های سیستم.',
        info_why_en: 'Enables idempotent management without disturbing existing crontab jobs.',
        info_example_fa: 'daily_backup',
        info_example_en: 'daily_backup'
      },
      {
        name: 'schedule_preset',
        labelFa: 'برنامه زمانی آماده (Schedule Preset)',
        labelEn: 'Schedule Preset',
        type: 'select',
        required: true,
        default: 'daily_midnight',
        options: [
          { value: 'every_minute', labelFa: 'هر دقیقه (* * * * *)', labelEn: 'Every Minute (* * * * *)' },
          { value: 'every_5_minutes', labelFa: 'هر ۵ دقیقه (*/5 * * * *)', labelEn: 'Every 5 Minutes (*/5 * * * *)' },
          { value: 'every_15_minutes', labelFa: 'هر ۱۵ دقیقه (*/15 * * * *)', labelEn: 'Every 15 Minutes (*/15 * * * *)' },
          { value: 'every_30_minutes', labelFa: 'هر ۳۰ دقیقه (*/30 * * * *)', labelEn: 'Every 30 Minutes (*/30 * * * *)' },
          { value: 'every_hour', labelFa: 'هر ساعت رأس دقیقه صفر (0 * * * *)', labelEn: 'Every Hour (0 * * * *)' },
          { value: 'daily_midnight', labelFa: 'روزانه رأس ساعت ۰۰:۰۰ بامداد (0 0 * * *)', labelEn: 'Daily at Midnight (0 0 * * *)' },
          { value: 'daily_3am', labelFa: 'روزانه ساعت ۰۳:۰۰ بامداد (0 3 * * *)', labelEn: 'Daily at 03:00 AM (0 3 * * *)' },
          { value: 'weekly_sunday', labelFa: 'هفتگی یکشنبه‌ها رأس ساعت ۰۱:۰۰ (0 1 * * 0)', labelEn: 'Weekly on Sunday at 01:00 AM (0 1 * * 0)' },
          { value: 'monthly_first', labelFa: 'اول هر ماه رأس ساعت ۰۲:۰۰ (0 2 1 * *)', labelEn: 'Monthly on 1st at 02:00 AM (0 2 1 * *)' },
          { value: 'on_reboot', labelFa: 'هنگام بوت سیستم (@reboot)', labelEn: 'At System Reboot (@reboot)' },
          { value: 'custom', labelFa: 'فرمت سفارشی ۵ فیلدی استاندارد', labelEn: 'Custom 5-field Cron Expression' }
        ],
        info_what_fa: 'انتخاب آسان دوره تکرار کار بدون نیاز به حفظ ساختار پیچیده کرون.',
        info_what_en: 'Simplified schedule presets eliminating the need to memorize cron syntax.',
        info_why_fa: 'جلوگیری از خطاهای انسانی در تعریف زمان‌بندی.',
        info_why_en: 'Prevents syntax errors and simplifies setup.',
        info_example_fa: 'روزانه رأس ساعت ۰۰:۰۰ بامداد',
        info_example_en: 'Daily at Midnight'
      },
      {
        name: 'custom_expression',
        labelFa: 'عبارت سفارشی ۵ فیلدی (در صورت انتخاب گزینه سفارشی)',
        labelEn: 'Custom Expression (if Custom selected)',
        type: 'string',
        required: false,
        placeholder: '*/10 2-5 * * 1-5',
        info_what_fa: 'عبارت استاندارد خط فرمان کرون: دقیقه ساعت روز ماه روزهفته.',
        info_what_en: 'Standard 5-field cron syntax: min hour day month weekday.',
        info_why_fa: 'انعطاف کامل برای برنامه‌های زمانی خاص و پیچیده.',
        info_why_en: 'Provides complete flexibility for specialized scheduling.',
        info_example_fa: '0 4 * * 1-5',
        info_example_en: '0 4 * * 1-5'
      },
      {
        name: 'command',
        labelFa: 'دستور یا اسکریپت اجرایی (Command / Script to Execute)',
        labelEn: 'Command / Script to Execute',
        type: 'textarea',
        required: true,
        placeholder: '/usr/local/bin/backup.sh >> /var/log/backup.log 2>&1',
        info_what_fa: 'دستور خط فرمانی که در زمان مشخص‌شده توسط کرون اجرا خواهد شد.',
        info_what_en: 'Exact shell command or script invoked by cron daemon.',
        info_why_fa: 'انجام عملیات خودکار مورد نظر در سرور.',
        info_why_en: 'Defines the action performed when timer triggers.',
        info_example_fa: '/opt/scripts/sync.sh >> /var/log/sync.log 2>&1',
        info_example_en: '/opt/scripts/sync.sh >> /var/log/sync.log 2>&1'
      },
      {
        name: 'target_user',
        labelFa: 'کاربر اجراکننده کرون (Crontab Target User)',
        labelEn: 'Crontab Target User',
        type: 'string',
        required: true,
        default: 'root',
        placeholder: 'root, www-data',
        info_what_fa: 'کاربری که جدول کرون برای او ثبت می‌شود (معمولاً root).',
        info_what_en: 'System user account whose crontab is updated (default root).',
        info_why_fa: 'اجرا با اختیارات و متغیرهای محیطی متناسب با کاربر هدف.',
        info_why_en: 'Ensures execution with proper user context and permissions.',
        info_example_fa: 'root',
        info_example_en: 'root'
      }
    ],
    distro_commands: {
      generic: [
        'bash -c \'CRON_ID="{{cron_id}}"; PRESET="{{schedule_preset}}"; CUSTOM_EXPR="{{custom_expression}}"; CMD="{{command}}"; TARGET_USER="{{target_user}}"; EXPR=""; case "$PRESET" in every_minute) EXPR="* * * * *" ;; every_5_minutes) EXPR="*/5 * * * *" ;; every_15_minutes) EXPR="*/15 * * * *" ;; every_30_minutes) EXPR="*/30 * * * *" ;; every_hour) EXPR="0 * * * *" ;; daily_midnight) EXPR="0 0 * * *" ;; daily_3am) EXPR="0 3 * * *" ;; weekly_sunday) EXPR="0 1 * * 0" ;; monthly_first) EXPR="0 2 1 * *" ;; on_reboot) EXPR="@reboot" ;; custom) EXPR="$CUSTOM_EXPR" ;; *) EXPR="0 0 * * *" ;; esac; if [ -z "$EXPR" ]; then echo "ERROR: Cron expression is empty" >&2; exit 1; fi; TAG="# NETMGMT_JOB:$CRON_ID"; NEW_LINE="$EXPR $CMD $TAG"; EXISTING=$(crontab -u "$TARGET_USER" -l 2>/dev/null || true); CLEANED=$(echo "$EXISTING" | grep -v "$TAG" || true); TMP_FILE=$(mktemp); if [ -n "$CLEANED" ]; then echo "$CLEANED" > "$TMP_FILE"; echo "$NEW_LINE" >> "$TMP_FILE"; else echo "$NEW_LINE" > "$TMP_FILE"; fi; crontab -u "$TARGET_USER" "$TMP_FILE"; rm -f "$TMP_FILE"; echo "Cron job [$CRON_ID] successfully configured for user $TARGET_USER:"; crontab -u "$TARGET_USER" -l | grep "$TAG"\''
      ]
    }
  },

  // 18. Remove Scheduled Cron Job
  {
    id: 'linux_cron_remove_job',
    category: 'cron',
    title: 'حذف کرون‌جاب (Remove Scheduled Cron Job)',
    title_en: 'Remove Scheduled Cron Job from Fleet',
    description: 'حذف وظیفه زمان‌بندی‌شده از جدول crontab بر اساس شناسه کار یا الگوی دستور',
    description_en: 'Remove a specific scheduled cron job by its tag or command substring.',
    icon: 'Trash2',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 25,
    info_what_fa: 'حذف خط مربوط به وظیفه زمان‌بندی‌شده از جدول crontab کاربر هدف.',
    info_what_en: 'Deletes scheduled line from user crontab matching identifier or command substring.',
    info_why_fa: 'توقف کارهای منسوخ و جلوگیری از اجرای اسکریپت‌های حذف‌شده.',
    info_why_en: 'Decommissions obsolete jobs and cleans up cron execution queues.',
    info_example_fa: 'حذف وظیفه با شناسه daily_backup.',
    info_example_en: 'Remove job with identifier daily_backup.',
    parameters: [
      {
        name: 'cron_id_or_pattern',
        labelFa: 'شناسه وظیفه یا بخشی از دستور (Job Identifier or Command Match)',
        labelEn: 'Job Identifier or Command Match',
        type: 'string',
        required: true,
        placeholder: 'daily_backup, /usr/local/bin/backup.sh',
        info_what_fa: 'شناسه‌ای که هنگام تعریف کرون استفاده کردید، یا تکه‌ای از دستور مورد نظر.',
        info_what_en: 'The identifier tag assigned during creation or a unique substring of the command.',
        info_why_fa: 'پیدا کردن خط مورد نظر در جدول crontab.',
        info_why_en: 'Targets the exact cron line for safe removal.',
        info_example_fa: 'daily_backup',
        info_example_en: 'daily_backup'
      },
      {
        name: 'target_user',
        labelFa: 'کاربر صاحب کرون‌جاب (Crontab Target User)',
        labelEn: 'Crontab Target User',
        type: 'string',
        required: true,
        default: 'root',
        placeholder: 'root',
        info_what_fa: 'کاربری که کرون‌جاب برای او تعریف شده بود.',
        info_what_en: 'User account possessing the crontab table.',
        info_why_fa: 'مشخص‌کننده جدول کرون کاربر.',
        info_why_en: 'Specifies which crontab to modify.',
        info_example_fa: 'root',
        info_example_en: 'root'
      }
    ],
    distro_commands: {
      generic: [
        'bash -c \'MATCH="{{cron_id_or_pattern}}"; TARGET_USER="{{target_user}}"; EXISTING=$(crontab -u "$TARGET_USER" -l 2>/dev/null || true); if [ -z "$EXISTING" ]; then echo "No crontab entries found for user $TARGET_USER."; exit 0; fi; FILTERED=$(echo "$EXISTING" | grep -v "$MATCH" || true); TMP_FILE=$(mktemp); if [ -n "$FILTERED" ]; then echo "$FILTERED" > "$TMP_FILE"; crontab -u "$TARGET_USER" "$TMP_FILE"; else crontab -u "$TARGET_USER" -r 2>/dev/null || true; echo "All entries removed, crontab cleared."; fi; rm -f "$TMP_FILE"; echo "Matching cron entries removed successfully for $TARGET_USER."\''
      ]
    }
  },

  // 19. Audit Scheduled Cron Jobs
  {
    id: 'linux_cron_list_audit',
    category: 'cron',
    title: 'ممیزی و مشاهده تمام کرون‌جاب‌های فعال (Audit Scheduled Cron Jobs)',
    title_en: 'Audit All Active Scheduled Cron Jobs',
    description: 'فهرست‌گیری کامل کرون‌جاب‌های کاربران و دایرکتوری‌های سیستمی cron.d در سطح ناوگان',
    description_en: 'Inspect all scheduled cron jobs across system and active users.',
    icon: 'Clock',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 25,
    info_what_fa: 'استخراج کلیه وظایف زمان‌بندی‌شده کاربران و دایرکتوری‌های cron.d، cron.daily و /etc/crontab.',
    info_what_en: 'Discovers all scheduled cron jobs across system users and cron directories.',
    info_why_fa: 'کشف وظایف ناشناخته، بدافزارهای زمان‌بندی‌شده، یا مغایرت‌های اتوماسیون در سرورها.',
    info_why_en: 'Security audit and compliance verification to detect rogue or legacy cron jobs.',
    info_example_fa: 'مشاهده لیست تمام کرون‌های در حال کار در ناوگان سرورها.',
    info_example_en: 'View all active crontabs across fleet servers.',
    parameters: [],
    distro_commands: {
      generic: [
        'bash -c \'echo "=== Active User Crontabs ==="; for u in $(cut -f1 -d: /etc/passwd); do cr=$(crontab -u "$u" -l 2>/dev/null || true); if [ -n "$cr" ]; then echo "--- User: $u ---"; echo "$cr"; fi; done; echo ""; echo "=== System Cron Files (/etc/crontab, /etc/cron.d) ==="; [ -f /etc/crontab ] && cat /etc/crontab | grep -v "^#" | grep -v "^$"; ls -la /etc/cron.d /etc/cron.daily 2>/dev/null | head -n 30\''
      ]
    }
  },

  // 20. Mount Storage / Disk / NFS Share
  {
    id: 'linux_mount_storage',
    category: 'storage',
    title: 'مانت دیسک، پارتیشن یا اشتراک شبکه (Mount Storage / NFS / Disk)',
    title_en: 'Mount Block Device, Partition or Network Share (NFS/CIFS)',
    description: 'مانت کردن فضای ذخیره‌سازی، ساخت خودکار دایرکتوری و افزودن به /etc/fstab جهت پایداری بعد از ریبوت',
    description_en: 'Mount block storage, create mount point directory, and persist to /etc/fstab across reboots.',
    icon: 'HardDrive',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 45,
    info_what_fa: 'دستور mount در لینوکس برای متصل کردن دیسک‌های فیزیکی، پارتیشن‌های مجازی، یا اشتراک‌های NFS/Samba به سیستم فایل.',
    info_what_en: 'Linux mount command connecting block devices, cloud disks or network shares into the filesystem hierarchy.',
    info_why_fa: 'افزودن دیسک‌های جدید دیتابیس، فضای بکاپ، یا متصل کردن استوریج‌های NAS و SAN در سرورها.',
    info_why_en: 'Provisions external volumes, database mount points, and central storage across server clusters.',
    info_example_fa: 'مانت پارتیشن /dev/sdb1 بر روی /mnt/storage با فایل‌سیستم ext4 و پایداری در fstab.',
    info_example_en: 'Mount /dev/sdb1 to /mnt/data with ext4 and auto-fstab persistence.',
    parameters: [
      {
        name: 'device_or_source',
        labelFa: 'نام دیوایس یا آدرس اشتراک شبکه (Device / Network Share Source)',
        labelEn: 'Device / Network Share Source',
        type: 'string',
        required: true,
        placeholder: '/dev/sdb1, 192.168.1.100:/volume1/nfs, //nas/share',
        info_what_fa: 'مسیر دیسک در دایرکتوری /dev یا آدرس NFS/CIFS سرور مقصد.',
        info_what_en: 'Block device path (e.g. /dev/sdb1) or remote network share URL.',
        info_why_fa: 'مشخص‌کننده منبع فیزیکی یا شبکه‌ای ذخیره‌سازی.',
        info_why_en: 'Identifies the storage volume to connect.',
        info_example_fa: '/dev/sdb1',
        info_example_en: '/dev/sdb1'
      },
      {
        name: 'mount_point',
        labelFa: 'مسیر مانت‌پوینت در سیستم‌عامل (Target Mount Point Path)',
        labelEn: 'Target Mount Point Path',
        type: 'string',
        required: true,
        placeholder: '/mnt/storage, /data, /backup',
        info_what_fa: 'دایرکتوری مقصدی که محتویات دیسک در آن قابل دسترس خواهد بود.',
        info_what_en: 'Target folder in root filesystem where the storage will be mounted.',
        info_why_fa: 'نقطه دسترسی برنامه‌ها و سرویس‌ها به فایل‌های دیسک.',
        info_why_en: 'Entry path for application data access.',
        info_example_fa: '/mnt/storage',
        info_example_en: '/mnt/data'
      },
      {
        name: 'fs_type',
        labelFa: 'نوع فایل‌سیستم (Filesystem Type)',
        labelEn: 'Filesystem Type',
        type: 'select',
        required: true,
        default: 'auto',
        options: [
          { value: 'auto', labelFa: 'تشخیص خودکار (Auto Detect)', labelEn: 'Auto Detect (auto)' },
          { value: 'ext4', labelFa: 'ext4 (لینوکس استاندارد)', labelEn: 'ext4 (Standard Linux)' },
          { value: 'xfs', labelFa: 'XFS (توصیه شده در RHEL/CentOS)', labelEn: 'XFS (Recommended RHEL)' },
          { value: 'btrfs', labelFa: 'Btrfs', labelEn: 'Btrfs' },
          { value: 'nfs', labelFa: 'اشتراک شبکه NFS (Network File System)', labelEn: 'NFS (Network File System)' },
          { value: 'cifs', labelFa: 'اشتراک شبکه ویندوز / سامبا (CIFS/SMB)', labelEn: 'CIFS / SMB (Windows Share)' }
        ],
        info_what_fa: 'فرمت و پروتکل ساختار فایل‌سیستم پارتیشن هدف.',
        info_what_en: 'Filesystem format (ext4, xfs, nfs, etc.).',
        info_why_fa: 'تطابق با فرمت فرمت‌شده دیسک.',
        info_why_en: 'Ensures correct kernel driver selection.',
        info_example_fa: 'ext4',
        info_example_en: 'ext4'
      },
      {
        name: 'mount_options',
        labelFa: 'گزینه‌های مانت (Mount Options)',
        labelEn: 'Mount Options',
        type: 'string',
        required: false,
        default: 'defaults',
        placeholder: 'defaults,noatime,rw',
        info_what_fa: 'پارامترهای بهینه‌سازی دسترسی دیسک (مانند defaults، noatime، ro، rw).',
        info_what_en: 'Mount flags controlling caching, read-write access, and timestamps.',
        info_why_fa: 'افزایش سرعت یا ایجاد محدودیت دسترسی فقط‌خواندنی.',
        info_why_en: 'Optimizes disk I/O performance.',
        info_example_fa: 'defaults,noatime',
        info_example_en: 'defaults,noatime'
      },
      {
        name: 'persist_fstab',
        labelFa: 'ثبت در /etc/fstab جهت مانت خودکار پس از ریبوت (Persist in /etc/fstab)',
        labelEn: 'Persist in /etc/fstab Across Reboots',
        type: 'boolean',
        required: false,
        default: true,
        info_what_fa: 'افزودن خط متناظر به فایل /etc/fstab با بکاپ‌گیری خودکار از فایل فعلی.',
        info_what_en: 'Appends entry to /etc/fstab to re-mount automatically on host reboot.',
        info_why_fa: 'جلوگیری از قطع دسترسی سرویس‌ها پس از راه‌اندازی مجدد سرور.',
        info_why_en: 'Guarantees storage availability after system reboot.',
        info_example_fa: 'فعال',
        info_example_en: 'Enabled'
      },
      {
        name: 'auto_create_dir',
        labelFa: 'ساخت خودکار پوشه در صورت عدم وجود (Auto Create Mountpoint mkdir -p)',
        labelEn: 'Auto Create Mountpoint Directory',
        type: 'boolean',
        required: false,
        default: true,
        info_what_fa: 'اجرای دستور mkdir -p برای ایجاد مسیر مانت‌پوینت قبل از عملیات.',
        info_what_en: 'Creates destination folder if it does not yet exist.',
        info_why_fa: 'جلوگیری از خطای "mount point does not exist".',
        info_why_en: 'Prevents missing directory errors.',
        info_example_fa: 'فعال',
        info_example_en: 'Enabled'
      }
    ],
    distro_commands: {
      generic: [
        'bash -c \'SRC="{{device_or_source}}"; MPT="{{mount_point}}"; FSTYPE="{{fs_type}}"; OPTS="{{mount_options}}"; PERSIST="{{persist_fstab}}"; AUTO_MKDIR="{{auto_create_dir}}"; if [ "$AUTO_MKDIR" = "true" ] || [ "$AUTO_MKDIR" = "1" ]; then mkdir -p "$MPT"; fi; if [ "$FSTYPE" = "auto" ]; then mount -o "$OPTS" "$SRC" "$MPT"; else mount -t "$FSTYPE" -o "$OPTS" "$SRC" "$MPT"; fi; echo "Mount command executed."; if [ "$PERSIST" = "true" ] || [ "$PERSIST" = "1" ]; then if grep -qs "$MPT" /etc/fstab; then echo "Mount point $MPT is already present in /etc/fstab."; else cp /etc/fstab /etc/fstab.bak.$(date +%Y%m%d%H%M%S); echo "$SRC $MPT $FSTYPE $OPTS 0 0" >> /etc/fstab; echo "Added persistent entry to /etc/fstab."; fi; fi; df -hT "$MPT"\''
      ]
    }
  },

  // 21. Safely Unmount Storage
  {
    id: 'linux_unmount_storage',
    category: 'storage',
    title: 'آن‌مانت کردن فضای ذخیره‌سازی (Unmount Storage)',
    title_en: 'Safely Unmount Storage Point or Device',
    description: 'قطع اتصال ایمن پارتیشن یا مانت‌پوینت با امکان Force/Lazy و حذف از fstab',
    description_en: 'Safely unmount a target filesystem with optional force, lazy release and fstab cleanup.',
    icon: 'HardDrive',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 30,
    info_what_fa: 'دستور umount جهت آزادسازی و قطع اتصال دیسک یا پارتیشن مانت‌شده از سیستم‌عامل.',
    info_what_en: 'Executes native umount to cleanly disconnect a mounted filesystem.',
    info_why_fa: 'جداسازی امن قبل از خاموش کردن یا بازتنظیم استوریج‌ها.',
    info_why_en: 'Required prior to detaching disks or reconfiguring mount partitions.',
    info_example_fa: 'آن‌مانت کردن مسیر /mnt/storage.',
    info_example_en: 'Unmount /mnt/data cleanly.',
    parameters: [
      {
        name: 'target',
        labelFa: 'مسیر مانت‌پوینت یا نام دیوایس (Mountpoint Path or Device)',
        labelEn: 'Mountpoint Path or Device',
        type: 'string',
        required: true,
        placeholder: '/mnt/storage یا /dev/sdb1',
        info_what_fa: 'آدرس پوشه مانت‌شده یا نام دیوایس مربوطه.',
        info_what_en: 'Filesystem mount point path or device identifier to detach.',
        info_why_fa: 'هدف عملیات آن‌مانت.',
        info_why_en: 'Specifies which mount to release.',
        info_example_fa: '/mnt/storage',
        info_example_en: '/mnt/data'
      },
      {
        name: 'force',
        labelFa: 'اجبار در آن‌مانت (Force Unmount -f)',
        labelEn: 'Force Unmount (-f)',
        type: 'boolean',
        required: false,
        default: false,
        info_what_fa: 'اعمال پرچم -f در صورت پاسخ ندادن سرور NFS یا فایل‌سیستم.',
        info_what_en: 'Forces unmount in case of unreachable NFS share.',
        info_why_fa: 'حل مشکل فریز شدن ناشی از عدم پاسخ استوریج شبکه.',
        info_why_en: 'Resolves hung NFS mount scenarios.',
        info_example_fa: 'غیرفعال',
        info_example_en: 'Disabled'
      },
      {
        name: 'lazy',
        labelFa: 'آزادسازی تنبل پس از اتمام پردازش‌ها (Lazy Unmount -l)',
        labelEn: 'Lazy Unmount (-l)',
        type: 'boolean',
        required: false,
        default: false,
        info_what_fa: 'اعمال پرچم -l برای قطع فوری از درخت دایرکتوری و آزادسازی پس از اتمام کارهای دیسک.',
        info_what_en: 'Detaches filesystem immediately and cleans up references when busy processes complete.',
        info_why_fa: 'جلوگیری از خطای "device is busy".',
        info_why_en: 'Bypasses "device is busy" errors safely.',
        info_example_fa: 'غیرفعال',
        info_example_en: 'Disabled'
      },
      {
        name: 'remove_from_fstab',
        labelFa: 'حذف خط متناظر از /etc/fstab (Clean from /etc/fstab)',
        labelEn: 'Clean from /etc/fstab',
        type: 'boolean',
        required: false,
        default: false,
        info_what_fa: 'حذف خطوط حاوی نام این مسیر از فایل /etc/fstab جهت جلوگیری از مانت در بوت بعدی.',
        info_what_en: 'Removes entries matching target path from /etc/fstab.',
        info_why_fa: 'جلوگیری از توقف بوت سیستم در صورت قطع دائمی دیسک.',
        info_why_en: 'Prevents boot hangs caused by permanently detached disks.',
        info_example_fa: 'غیرفعال',
        info_example_en: 'Disabled'
      }
    ],
    distro_commands: {
      generic: [
        'bash -c \'TGT="{{target}}"; FLAGS=""; if [ "{{force}}" = "true" ] || [ "{{force}}" = "1" ]; then FLAGS="$FLAGS -f"; fi; if [ "{{lazy}}" = "true" ] || [ "{{lazy}}" = "1" ]; then FLAGS="$FLAGS -l"; fi; umount $FLAGS "$TGT" && echo "Successfully unmounted $TGT."; if [ "{{remove_from_fstab}}" = "true" ] || [ "{{remove_from_fstab}}" = "1" ]; then sed -i "\|$TGT|d" /etc/fstab && echo "Cleaned matching entries from /etc/fstab."; fi; df -h | head -n 15\''
      ]
    }
  },

  // 22. Audit Disk Usage & Partitions
  {
    id: 'linux_disk_usage_audit',
    category: 'storage',
    title: 'ممیزی جامع دیسک‌ها و ساختار پارتیشن‌ها (Disk & Partition Usage Audit)',
    title_en: 'Audit Filesystem Disk Usage, Inodes & Block Tree',
    description: 'مشاهده حجم مصرفی دیسک‌ها، وضعیت Inodeها و ساختار درختی دیوایس‌ها با lsblk در سطح ناوگان',
    description_en: 'Fleet-wide inspection of disk partitions, filesystem types, mount points, and free space.',
    icon: 'HardDrive',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 25,
    info_what_fa: 'اجرای همزمان df -hT، df -i و lsblk جهت مشاهده تمام فضای دیسک و سلامت پارتیشن‌ها.',
    info_what_en: 'Comprehensive telemetry on filesystem occupancy, inode health, and block devices.',
    info_why_fa: 'پیشگیری از خرابی سیستم ناشی از پر شدن دیسک یا پر شدن تعداد Inodeها.',
    info_why_en: 'Early detection of storage exhaustion and partition anomalies.',
    info_example_fa: 'بررسی وضعیت پارتیشن‌های root و دیتابیس در تمام سرورها.',
    info_example_en: 'Audit free disk space across all fleet hosts.',
    parameters: [],
    distro_commands: {
      generic: [
        'bash -c \'echo "=== Filesystem Free Space (df -hT) ==="; df -hT -x tmpfs -x devtmpfs -x squashfs; echo ""; echo "=== Inode Utilization (df -i) ==="; df -i -x tmpfs -x devtmpfs -x squashfs; echo ""; echo "=== Block Device Hierarchy (lsblk) ==="; lsblk -o NAME,SIZE,FSTYPE,TYPE,MOUNTPOINT 2>/dev/null || lsblk\''
      ]
    }
  },

  // 23. Firewall Port Management (Block / Allow / Restrict)
  {
    id: 'linux_firewall_manage_port',
    category: 'firewall',
    title: 'مدیریت پورت در فایروال: بستن یا باز کردن (Block / Allow / Restrict Port)',
    title_en: 'Firewall Port Management: Allow, Block or Restrict Port',
    description: 'بستن یا باز کردن پورت‌ها با تشخیص خودکار فایروال فعال (UFW / Firewalld / Iptables) و امکان فیلتر IP مبدا',
    description_en: 'Open, block or restrict ports automatically adapting to active firewall (UFW, Firewalld or Iptables).',
    icon: 'Shield',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 35,
    info_what_fa: 'پیکربندی هوشمند قوانین فایروال سیستم برای مجاز یا مسدود کردن ترافیک ورودی در پورت و پروتکل مشخص.',
    info_what_en: 'Configures incoming network packet filtering rules to allow or drop traffic on specified ports.',
    info_why_fa: 'حفاظت از سرویس‌ها و بستن پورت‌های آسیب‌پذیر یا ایجاد دسترسی کنترل‌شده برای سرویس‌های جدید.',
    info_why_en: 'Critical security hardening: blocks unauthorized ports and isolates management interfaces.',
    info_example_fa: 'بستن پورت 3306 یا باز کردن پورت 443 برای همه، یا باز کردن پورت 22 فقط برای ساب‌نت 192.168.10.0/24.',
    info_example_en: 'Block port 3306 or allow port 443 from any, or restrict port 22 to office subnet.',
    parameters: [
      {
        name: 'action',
        labelFa: 'نوع عملیات فایروال (Firewall Action)',
        labelEn: 'Firewall Action',
        type: 'select',
        required: true,
        default: 'deny',
        options: [
          { value: 'deny', labelFa: 'مسدودسازی و بستن پورت (Block / Deny Incoming Traffic)', labelEn: 'Block / Deny Incoming Traffic' },
          { value: 'allow', labelFa: 'باز کردن پورت (Allow Incoming Traffic)', labelEn: 'Allow Incoming Traffic' },
          { value: 'delete', labelFa: 'حذف قانون پورت (Delete Port Rule)', labelEn: 'Delete Port Rule' }
        ],
        info_what_fa: 'تعیین وضعیت ترافیک: پذیرش (Allow)، مسدودسازی (Deny) یا حذف رول قبلی (Delete).',
        info_what_en: 'Action to enforce on incoming packets: Allow, Drop/Deny, or Delete existing rule.',
        info_why_fa: 'مشخص‌کننده سیاست امنیتی پورت.',
        info_why_en: 'Defines the packet filter policy.',
        info_example_fa: 'مسدودسازی و بستن پورت',
        info_example_en: 'Block / Deny Incoming Traffic'
      },
      {
        name: 'port',
        labelFa: 'شماره پورت یا بازه پورت‌ها (Port Number or Range)',
        labelEn: 'Port Number or Range',
        type: 'string',
        required: true,
        placeholder: '80, 443, 3306, 8000:8080',
        info_what_fa: 'شماره پورت ورودی استاندارد یا بازه عددی با دونقطه.',
        info_what_en: 'TCP/UDP port number or range (e.g. 80, 443, 3000:3005).',
        info_why_fa: 'تعیین پورت شبکه سرویس مورد نظر.',
        info_why_en: 'Identifies the network service port.',
        info_example_fa: '3306',
        info_example_en: '443'
      },
      {
        name: 'protocol',
        labelFa: 'پروتکل شبکه (Transport Protocol)',
        labelEn: 'Transport Protocol',
        type: 'select',
        required: true,
        default: 'tcp',
        options: [
          { value: 'tcp', labelFa: 'TCP', labelEn: 'TCP' },
          { value: 'udp', labelFa: 'UDP', labelEn: 'UDP' },
          { value: 'both', labelFa: 'هر دو (TCP & UDP)', labelEn: 'Both (TCP & UDP)' }
        ],
        info_what_fa: 'پروتکل لایه ۴ شبکه (TCP یا UDP).',
        info_what_en: 'Layer 4 transport protocol.',
        info_why_fa: 'اعمال فیلترینگ دقیق بر روی پروتکل مربوطه.',
        info_why_en: 'Ensures rule binds to the right protocol stack.',
        info_example_fa: 'TCP',
        info_example_en: 'TCP'
      },
      {
        name: 'source_ip',
        labelFa: 'محدود به IP یا ساب‌نت مبدا (اختیاری - خالی برای همه)',
        labelEn: 'Source IP or Subnet CIDR (Optional - Empty for Any)',
        type: 'string',
        required: false,
        placeholder: '192.168.1.0/24 (خالی برای دسترسی سراسری / Empty for Any)',
        info_what_fa: 'آدرس IP مشخص یا پیشوند CIDR جهت محدود کردن رول فقط به مبداهای مطمئن.',
        info_what_en: 'CIDR subnet or specific IP address to restrict access strictly to trusted origins.',
        info_why_fa: 'افزایش چشمگیر امنیت از طریق ممانعت از دسترسی ترافیک عمومی اینترنت به پورت‌های حساس.',
        info_why_en: 'Enforces Zero Trust network isolation for sensitive ports.',
        info_example_fa: '192.168.10.0/24',
        info_example_en: '10.0.0.0/8'
      }
    ],
    distro_commands: {
      generic: [
        'bash -c \'ACTION="{{action}}"; PORT="{{port}}"; PROTO="{{protocol}}"; SRC="{{source_ip}}"; echo "Configuring firewall rule: $ACTION port $PORT ($PROTO) source=$SRC"; if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then echo "Detected active UFW firewall."; PROTO_LIST=(); if [ "$PROTO" = "both" ]; then PROTO_LIST=("tcp" "udp"); else PROTO_LIST=("$PROTO"); fi; for pr in "${PROTO_LIST[@]}"; do if [ "$ACTION" = "allow" ]; then if [ -n "$SRC" ]; then ufw allow from "$SRC" to any port "$PORT" proto "$pr"; else ufw allow "$PORT/$pr"; fi; elif [ "$ACTION" = "deny" ]; then if [ -n "$SRC" ]; then ufw deny from "$SRC" to any port "$PORT" proto "$pr"; else ufw deny "$PORT/$pr"; fi; elif [ "$ACTION" = "delete" ]; then if [ -n "$SRC" ]; then ufw delete allow from "$SRC" to any port "$PORT" proto "$pr" 2>/dev/null || ufw delete deny from "$SRC" to any port "$PORT" proto "$pr" 2>/dev/null || true; else ufw delete allow "$PORT/$pr" 2>/dev/null || ufw delete deny "$PORT/$pr" 2>/dev/null || true; fi; fi; done; ufw status numbered | head -n 30; elif command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then echo "Detected active Firewalld."; PROTO_LIST=(); if [ "$PROTO" = "both" ]; then PROTO_LIST=("tcp" "udp"); else PROTO_LIST=("$PROTO"); fi; for pr in "${PROTO_LIST[@]}"; do if [ "$ACTION" = "allow" ]; then if [ -n "$SRC" ]; then firewall-cmd --permanent --add-rich-rule="rule family=\"ipv4\" source address=\"$SRC\" port port=\"$PORT\" protocol=\"$pr\" accept"; else firewall-cmd --permanent --add-port="$PORT/$pr"; fi; elif [ "$ACTION" = "deny" ]; then if [ -n "$SRC" ]; then firewall-cmd --permanent --add-rich-rule="rule family=\"ipv4\" source address=\"$SRC\" port port=\"$PORT\" protocol=\"$pr\" drop"; else firewall-cmd --permanent --add-rich-rule="rule family=\"ipv4\" port port=\"$PORT\" protocol=\"$pr\" drop"; fi; elif [ "$ACTION" = "delete" ]; then firewall-cmd --permanent --remove-port="$PORT/$pr" 2>/dev/null || true; fi; done; firewall-cmd --reload; firewall-cmd --list-all; elif command -v iptables >/dev/null 2>&1; then echo "Fallback to Iptables."; PROTO_LIST=(); if [ "$PROTO" = "both" ]; then PROTO_LIST=("tcp" "udp"); else PROTO_LIST=("$PROTO"); fi; for pr in "${PROTO_LIST[@]}"; do IPT_SRC=""; if [ -n "$SRC" ]; then IPT_SRC="-s $SRC"; fi; if [ "$ACTION" = "allow" ]; then iptables -I INPUT -p "$pr" --dport "$PORT" $IPT_SRC -j ACCEPT; elif [ "$ACTION" = "deny" ]; then iptables -I INPUT -p "$pr" --dport "$PORT" $IPT_SRC -j DROP; elif [ "$ACTION" = "delete" ]; then iptables -D INPUT -p "$pr" --dport "$PORT" $IPT_SRC -j ACCEPT 2>/dev/null || iptables -D INPUT -p "$pr" --dport "$PORT" $IPT_SRC -j DROP 2>/dev/null || true; fi; done; iptables -L INPUT -n -v --line-numbers | head -n 30; else echo "ERROR: No supported firewall daemon (UFW, Firewalld, or Iptables) found active." >&2; exit 1; fi\''
      ]
    }
  },

  // 24. Audit Firewall Status & Rules
  {
    id: 'linux_firewall_status_audit',
    category: 'firewall',
    title: 'ممیزی وضعیت و رول‌های فعال فایروال (Audit Active Firewall Rules)',
    title_en: 'Audit Active Firewall Rules & Policies',
    description: 'گزارش کامل وضعیت فایروال فعال، رول‌های ورودی، پورت‌های مجاز و مسدودشده',
    description_en: 'Audit live firewall status across fleet servers (UFW / Firewalld / Iptables / nftables).',
    icon: 'Shield',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 25,
    info_what_fa: 'استعلام بی‌درنگ وضعیت فایروال لینوکس و رول‌های ورودی و خروجی فعال.',
    info_what_en: 'Live query of active Linux firewall daemon and enforced security policies.',
    info_why_fa: 'اطمینان از فعال بودن فایروال در تمام نودها و تطابق رول‌ها با استانداردهای امنیتی.',
    info_why_en: 'Ensures compliance and verifies that firewall shields are actively defending all nodes.',
    info_example_fa: 'بررسی وضعیت فایروال در تمامی سرورهای ناوگان.',
    info_example_en: 'Audit firewall policies across all servers.',
    parameters: [],
    distro_commands: {
      generic: [
        'bash -c \'echo "=== Firewall Daemon Status & Live Rules Audit ==="; if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status:"; then echo "--- UFW Status ---"; ufw status verbose; elif command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then echo "--- Firewalld Configuration ---"; firewall-cmd --list-all; elif command -v iptables >/dev/null 2>&1; then echo "--- Iptables Filter Table ---"; iptables -L -n -v --line-numbers | head -n 40; elif command -v nft >/dev/null 2>&1; then echo "--- nftables Ruleset ---"; nft list ruleset | head -n 40; else echo "No active firewall daemon found."; fi\''
      ]
    }
  },

  // 25. Docker Containers Fleet Management
  {
    id: 'linux_docker_fleet_manager',
    category: 'docker',
    title: 'مدیریت کانتینرهای داکر (Docker Containers Fleet Management)',
    title_en: 'Fleet Docker Containers & System Prune Management',
    description: 'مشاهده وضعیت کانتینرها، راه‌اندازی مجدد، اسنپ‌شات مصرف منابع یا پاک‌سازی عمیق داکر',
    description_en: 'Manage Docker containers across fleet: status, targeted restart, live stats snapshot, or prune unused caches.',
    icon: 'Layers',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 60,
    info_what_fa: 'دستورات کنترل و نگهداری موتور داکر و کانتینرهای در حال اجرا بر روی هاست‌های لینوکسی.',
    info_what_en: 'Central management of Docker daemon, running containers and image caching.',
    info_why_fa: 'نظارت بر کانتینرهای میکروسرویس‌ها، ری‌استارت سریع سرویس‌های فریز شده و بازیابی فضای دیسک با prune.',
    info_why_en: 'Maintains microservice health, restarts stuck containers, and recovers gigabytes of disk cache.',
    info_example_fa: 'مشاهده لیست کانتینرها در تمام سرورها یا پاک‌سازی ایمیج‌های بی‌استفاده داکر.',
    info_example_en: 'Inspect running containers or perform docker system prune.',
    parameters: [
      {
        name: 'action',
        labelFa: 'نوع عملیات داکر (Docker Action)',
        labelEn: 'Docker Action',
        type: 'select',
        required: true,
        default: 'status',
        options: [
          { value: 'status', labelFa: 'مشاهده همه کانتینرها (List Running & Stopped Containers)', labelEn: 'List Running & Stopped Containers' },
          { value: 'restart_containers', labelFa: 'راه‌اندازی مجدد کانتینرها بر اساس فیلتر نام (Restart Containers by Name/Filter)', labelEn: 'Restart Containers by Name/Filter' },
          { value: 'prune_system', labelFa: 'پاک‌سازی عمیق کش و ایمیج‌های بی‌استفاده (Docker System Prune -af)', labelEn: 'Docker System Prune (Deep Cache Cleanup)' },
          { value: 'stats_snapshot', labelFa: 'اسنپ‌شات زنده مصرف CPU و RAM کانتینرها (Docker Stats Snapshot)', labelEn: 'Live Docker Stats Snapshot (CPU/RAM)' }
        ],
        info_what_fa: 'اقدامی که باید توسط ابزار docker بر روی سرورها انجام شود.',
        info_what_en: 'Docker management operation to execute.',
        info_why_fa: 'انتخاب نوع نگهداری یا بررسی مورد نظر.',
        info_why_en: 'Determines administrative action.',
        info_example_fa: 'مشاهده همه کانتینرها',
        info_example_en: 'List Running & Stopped Containers'
      },
      {
        name: 'container_name_or_filter',
        labelFa: 'نام یا فیلتر کانتینر (برای ری‌استارت)',
        labelEn: 'Container Name Filter (for restart)',
        type: 'string',
        required: false,
        placeholder: 'nginx, api, redis',
        info_what_fa: 'نام کانتینر یا بخشی از آن جهت ری‌استارت هدفمند.',
        info_what_en: 'Container name or substring pattern for targeted restarts.',
        info_why_fa: 'جلوگیری از ری‌استارت ناخواسته تمام سرویس‌های هاست.',
        info_why_en: 'Prevents accidentally restarting non-targeted containers.',
        info_example_fa: 'nginx',
        info_example_en: 'api-gateway'
      }
    ],
    distro_commands: {
      generic: [
        'bash -c \'if ! command -v docker >/dev/null 2>&1; then echo "Docker is not installed on this server."; exit 0; fi; ACTION="{{action}}"; FILTER="{{container_name_or_filter}}"; case "$ACTION" in status) docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" ;; restart_containers) if [ -n "$FILTER" ]; then MATCHES=$(docker ps -aq -f "name=$FILTER"); if [ -n "$MATCHES" ]; then docker restart $MATCHES; echo "Matching containers restarted."; else echo "No containers found matching name: $FILTER"; fi; else echo "ERROR: Please specify container_name_or_filter to avoid restarting all containers unintentionally." >&2; exit 1; fi ;; prune_system) docker system prune -af --volumes; docker system df ;; stats_snapshot) docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}" ;; esac\''
      ]
    }
  },

  // 26. Audit Top CPU & Memory Consuming Processes
  {
    id: 'linux_performance_top_consumers',
    category: 'maintenance',
    title: 'گزارش پرمصرف‌ترین فرآیندهای CPU و RAM (Top Resource Consumers Audit)',
    title_en: 'Audit Top CPU & Memory Consuming System Processes',
    description: 'شناسایی فرآیندهایی که بیشترین بار پردازنده و رم را روی سرورها ایجاد کرده‌اند',
    description_en: 'Audit top resource-consuming processes and summary load across fleet servers.',
    icon: 'Cpu',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 25,
    info_what_fa: 'استخراج پرمصرف‌ترین برنامه‌ها از جدول پردازش‌های سیستم‌عامل با دستور ps aux.',
    info_what_en: 'Extracts the most resource-intensive processes sorted by CPU or RAM utilization.',
    info_why_fa: 'عیب‌یابی سریع کندی سرورها و شناسایی فرآیندهای مسدودکننده یا حافظه‌خوار.',
    info_why_en: 'Rapid root-cause analysis for performance degradation or memory spikes.',
    info_example_fa: 'مشاهده ۱۰ پردازش اول مصرف‌کننده RAM در سرورهای پایگاه‌داده.',
    info_example_en: 'Identify top 10 memory-consuming processes.',
    parameters: [
      {
        name: 'top_count',
        labelFa: 'تعداد پردازش‌های برتر (Top Count)',
        labelEn: 'Top Count',
        type: 'number',
        required: true,
        default: 10,
        placeholder: '10, 20',
        info_what_fa: 'تعداد ردیف‌های خروجی جهت نمایش.',
        info_what_en: 'Number of top processes to display.',
        info_why_fa: 'تنظیم جزئیات گزارش.',
        info_why_en: 'Limits output to desired size.',
        info_example_fa: '10',
        info_example_en: '10'
      },
      {
        name: 'sort_by',
        labelFa: 'مرتب‌سازی بر اساس (Sort By)',
        labelEn: 'Sort By',
        type: 'select',
        required: true,
        default: 'cpu',
        options: [
          { value: 'cpu', labelFa: 'بیشترین مصرف پردازنده (Highest CPU %)', labelEn: 'Highest CPU %' },
          { value: 'memory', labelFa: 'بیشترین مصرف حافظه رم (Highest Memory %)', labelEn: 'Highest Memory %' }
        ],
        info_what_fa: 'ملاک رتبه‌بندی برنامه‌ها (درصد CPU یا درصد RAM).',
        info_what_en: 'Sorting criterion: CPU percentage or RAM percentage.',
        info_why_fa: 'تمرکز بر گلوگاه اصلی سرور (پردازشی یا حافظه).',
        info_why_en: 'Targets the relevant system resource bottleneck.',
        info_example_fa: 'بیشترین مصرف پردازنده',
        info_example_en: 'Highest CPU %'
      }
    ],
    distro_commands: {
      generic: [
        'bash -c \'N="{{top_count}}"; [ -z "$N" ] && N=10; SORT_BY="{{sort_by}}"; echo "=== Top $N System Resource Consumers (Sorted by $SORT_BY) ==="; if [ "$SORT_BY" = "memory" ]; then ps aux --sort=-%mem | head -n $((N + 1)) | awk \'{printf "%-8s %-6s %-5s %-5s %-12s %s\\n", $1, $2, $3, $4, $10, $11}\'; else ps aux --sort=-%cpu | head -n $((N + 1)) | awk \'{printf "%-8s %-6s %-5s %-5s %-12s %s\\n", $1, $2, $3, $4, $10, $11}\'; fi; echo ""; echo "=== Host Load Average & Free Memory ==="; uptime; free -h\''
      ]
    }
  },

  // 27. Configure Kernel Static Route
  {
    id: 'linux_static_route_config',
    category: 'network',
    title: 'افزودن یا حذف مسیر استاتیک شبکه (Configure Static Route)',
    title_en: 'Configure Kernel Static Route (ip route add/del)',
    description: 'هدایت ترافیک ساب‌نت مشخص به گیت‌وی دلخواه از طریق دستور ip route در سطح ناوگان',
    description_en: 'Add or remove a persistent/live kernel static route via specific gateway.',
    icon: 'Network',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 25,
    info_what_fa: 'تعریف مسیر مسیریابی استاتیک در جدول مسیریابی کرنل لینوکس با دستور ip route.',
    info_what_en: 'Configures kernel routing table entries directing specific subnet traffic through designated gateways.',
    info_why_fa: 'هدایت ترافیک شعب، شبکه‌های VPN، یا ساب‌نت‌های اداری به روترهای واسط اختصاصی.',
    info_why_en: 'Routes branch networks, VPN tunnels or internal subnets through specialized gateways.',
    info_example_fa: 'افزودن روت برای 10.50.0.0/16 از طریق گیت‌وی 192.168.1.254.',
    info_example_en: 'Add route for 10.50.0.0/16 via 192.168.1.254.',
    parameters: [
      {
        name: 'action',
        labelFa: 'نوع عملیات مسیر (Action)',
        labelEn: 'Route Action',
        type: 'select',
        required: true,
        default: 'add',
        options: [
          { value: 'add', labelFa: 'افزودن یا جایگزینی مسیر (ip route replace)', labelEn: 'Add / Replace Route (ip route replace)' },
          { value: 'del', labelFa: 'حذف مسیر (ip route del)', labelEn: 'Delete Route (ip route del)' }
        ],
        info_what_fa: 'افزودن مسیر جدید به جدول یا پاک‌سازی مسیر قبلی.',
        info_what_en: 'Defines whether to apply or delete the static route.',
        info_why_fa: 'مدیریت روت‌های مسیریابی.',
        info_why_en: 'Controls route table state.',
        info_example_fa: 'افزودن یا جایگزینی مسیر',
        info_example_en: 'Add / Replace Route'
      },
      {
        name: 'network_cidr',
        labelFa: 'شبکه مقصد به فرمت CIDR (Target Subnet CIDR)',
        labelEn: 'Target Subnet CIDR',
        type: 'string',
        required: true,
        placeholder: '10.50.0.0/16, 172.20.0.0/24',
        info_what_fa: 'آدرس شبکه مقصد به همراه طول ماسک ساب‌نت.',
        info_what_en: 'Target destination network in CIDR format (e.g. 10.50.0.0/16).',
        info_why_fa: 'مشخص‌کننده مقصدی که باید مسیریابی شود.',
        info_why_en: 'Identifies destination network.',
        info_example_fa: '10.50.0.0/16',
        info_example_en: '172.20.0.0/24'
      },
      {
        name: 'gateway_ip',
        labelFa: 'آدرس IP گیت‌وی یا روتر واسط (Gateway IP)',
        labelEn: 'Gateway IP',
        type: 'string',
        required: true,
        placeholder: '192.168.1.1, 10.0.0.254',
        info_what_fa: 'آدرس دستگاه واسطه‌ای که بسته‌ها باید به آن تحویل داده شوند.',
        info_what_en: 'Next-hop router IP address responsible for forwarding packets.',
        info_why_fa: 'مشخص‌کننده Next Hop در شبکه.',
        info_why_en: 'Next hop routing gateway.',
        info_example_fa: '192.168.1.1',
        info_example_en: '192.168.1.1'
      },
      {
        name: 'interface',
        labelFa: 'نام کارت شبکه (اختیاری)',
        labelEn: 'Interface Name (Optional)',
        type: 'string',
        required: false,
        placeholder: 'eth0, ens192 (اختیاری)',
        info_what_fa: 'نام اینترفیس فیزیکی یا مجازی خروجی بسته.',
        info_what_en: 'Optional egress network interface name.',
        info_why_fa: 'هدایت اجباری از اینترفیس مورد نظر در سیستم‌های چندکارت‌شبکه‌ای.',
        info_why_en: 'Forces route out a specific NIC on multi-homed hosts.',
        info_example_fa: 'eth0',
        info_example_en: 'eth0'
      }
    ],
    distro_commands: {
      generic: [
        'bash -c \'ACTION="{{action}}"; NET="{{network_cidr}}"; GW="{{gateway_ip}}"; DEV="{{interface}}"; DEV_ARG=""; if [ -n "$DEV" ]; then DEV_ARG="dev $DEV"; fi; if [ "$ACTION" = "add" ]; then ip route replace "$NET" via "$GW" $DEV_ARG && echo "Route for $NET via $GW applied successfully."; elif [ "$ACTION" = "del" ]; then ip route del "$NET" via "$GW" $DEV_ARG 2>/dev/null || ip route del "$NET" 2>/dev/null || true; echo "Route for $NET removed."; fi; ip route show | grep "$NET" || true\''
      ]
    }
  },

  // 28. Audit Local SSL/TLS Certificates Expiration
  {
    id: 'linux_ssl_cert_audit',
    category: 'security',
    title: 'ممیزی تاریخ انقضای گواهینامه‌های SSL/TLS لوکال (SSL/TLS Certificate Expiry Audit)',
    title_en: 'Audit Local SSL/TLS Certificate Expiration Dates',
    description: 'جستجوی خودکار فایل‌های گواهی SSL در دایرکتوری‌های سرور و استخراج روزهای باقی‌مانده با OpenSSL',
    description_en: 'Locate local .crt and .pem files and audit their expiration dates with OpenSSL.',
    icon: 'Key',
    is_dangerous: false,
    confirmation_keyword: '',
    default_timeout_sec: 30,
    info_what_fa: 'اسکن دایرکتوری‌های کلید و گواهینامه و استخراج فیلد NotAfter با دستور openssl x509.',
    info_what_en: 'Scans system certificate directories and inspects expiration dates using OpenSSL.',
    info_why_fa: 'جلوگیری از قطع ناگهانی سرویس‌های وب و API به دلیل منقضی شدن پیش‌بینی‌نشده گواهینامه‌ها.',
    info_why_en: 'Prevents downtime caused by silent SSL certificate expirations.',
    info_example_fa: 'بررسی تاریخ انقضای گواهینامه‌های Let\'s Encrypt و Nginx در سرورها.',
    info_example_en: 'Audit Let\'s Encrypt and web server SSL certificates.',
    parameters: [
      {
        name: 'search_paths',
        labelFa: 'مسیرهای جستجوی گواهینامه‌ها (با کاما جدا کنید)',
        labelEn: 'Certificate Search Paths (Comma-separated)',
        type: 'string',
        required: false,
        default: '/etc/ssl, /etc/letsencrypt, /etc/nginx/ssl',
        placeholder: '/etc/ssl, /etc/letsencrypt, /etc/nginx/ssl',
        info_what_fa: 'دایرکتوری‌هایی که فایل‌های crt و pem در آنها قرار دارند.',
        info_what_en: 'Comma-separated directory paths containing certificate files.',
        info_why_fa: 'تنظیم مسیرهای اختصاصی وب‌سرورهای سازمان.',
        info_why_en: 'Directs OpenSSL scanner to custom cert paths.',
        info_example_fa: '/etc/ssl, /etc/letsencrypt',
        info_example_en: '/etc/ssl, /etc/letsencrypt'
      }
    ],
    distro_commands: {
      generic: [
        'bash -c \'PATHS="{{search_paths}}"; echo "=== Local SSL/TLS Certificate Expiration Audit ==="; IFS="," read -ra PATH_ARRAY <<< "$PATHS"; FOUND=0; for p in "${PATH_ARRAY[@]}"; do p=$(echo "$p" | tr -d "[:space:]"); [ ! -d "$p" ] && continue; for f in $(find "$p" -maxdepth 3 -type f \\( -name "*.crt" -o -name "*.pem" -o -name "fullchain.pem" \\) 2>/dev/null); do if openssl x509 -in "$f" -noout -enddate >/dev/null 2>&1; then FOUND=$((FOUND + 1)); SUBJ=$(openssl x509 -in "$f" -noout -subject 2>/dev/null | sed "s/subject=//"); EXP=$(openssl x509 -in "$f" -noout -enddate 2>/dev/null | sed "s/notAfter=//"); echo "[$f] -> Subject: $SUBJ | Expires: $EXP"; fi; done; done; if [ $FOUND -eq 0 ]; then echo "No readable x509 certificates found in specified directories."; fi\''
      ]
    }
  }
];

// Helper: replace template variables {{var}}
function interpolateCommand(cmd: string, params: Record<string, any>): string {
  let result = cmd;
  for (const [key, value] of Object.entries(params)) {
    const valStr = value !== undefined && value !== null ? String(value) : '';
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, valStr);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Template & Preview Services
// ---------------------------------------------------------------------------
export function getBulkServerTemplates(): BulkServerTemplate[] {
  return LINUX_SERVER_TEMPLATES;
}

export function getBulkServerTemplateById(id: string): BulkServerTemplate | undefined {
  return LINUX_SERVER_TEMPLATES.find((t) => t.id === id);
}

export async function generateBulkServerPreview(
  templateId: string,
  params: Record<string, any>,
  serverIds: string[]
): Promise<BulkServerPreviewItem[]> {
  const template = getBulkServerTemplateById(templateId);
  if (!template) {
    throw new Error(`Template not found with ID: ${templateId}`);
  }

  const allServers = await getAllRemoteServers();
  const serverMap = new Map<string, any>();
  for (const s of allServers) {
    serverMap.set(s.id, s);
  }

  const previewItems: BulkServerPreviewItem[] = [];

  for (const sId of serverIds) {
    const server = serverMap.get(sId);
    if (!server) continue;

    // Filter only Linux servers for Phase 1
    if (server.os_type !== 'linux') continue;

    const distroStr = server.os_distro || 'Ubuntu 24.04 LTS';
    const distroFamily = detectDistroFamily(distroStr);

    // Resolve commands for this distro
    let cmdList: string[] = [];
    const dc = template.distro_commands;
    if (distroFamily === 'debian' && dc.debian) {
      cmdList = Array.isArray(dc.debian) ? dc.debian : [dc.debian];
    } else if (distroFamily === 'rhel' && dc.rhel) {
      cmdList = Array.isArray(dc.rhel) ? dc.rhel : [dc.rhel];
    } else if (distroFamily === 'arch' && dc.arch) {
      cmdList = Array.isArray(dc.arch) ? dc.arch : [dc.arch];
    } else if (distroFamily === 'alpine' && dc.alpine) {
      cmdList = Array.isArray(dc.alpine) ? dc.alpine : [dc.alpine];
    } else if (distroFamily === 'suse' && dc.suse) {
      cmdList = Array.isArray(dc.suse) ? dc.suse : [dc.suse];
    } else {
      cmdList = Array.isArray(dc.generic) ? dc.generic : [dc.generic];
    }

    const steps: BulkServerPreviewStep[] = cmdList.map((c, idx) => {
      let finalCmd = interpolateCommand(c, params);
      if (params.run_as_sudo && !finalCmd.startsWith('sudo ') && server.ssh_username !== 'root') {
        finalCmd = `sudo ${finalCmd}`;
      }

      return {
        name: `Step ${idx + 1}`,
        command: finalCmd,
        descriptionFa: `اجرای گام ${idx + 1} منطبق با توزیع ${distroStr}`,
        descriptionEn: `Execute Step ${idx + 1} tailored for ${distroStr}`,
        distro: distroStr
      };
    });

    previewItems.push({
      serverId: server.id,
      serverName: server.name || server.id,
      serverIp: server.ip || '127.0.0.1',
      osType: 'linux',
      osDistro: distroStr,
      distroFamily,
      steps,
      isDangerous: template.is_dangerous,
      confirmationKeyword: template.confirmation_keyword,
      estimatedTimeoutSec: template.default_timeout_sec
    });
  }

  return previewItems;
}

// ---------------------------------------------------------------------------
// Active Jobs Registry & Execution Engine
// ---------------------------------------------------------------------------
const activeJobs = new Map<string, BulkServerJobStatus>();

// Helper: Real SSH command execution with Modern/Legacy protocol fallback (Rule 12 & Rule 8)
async function executeSshCommand(
  server: any,
  command: string,
  timeoutMs: number,
  ephemeralPassword?: string
): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> {
  const host = server.ip || server.hostname;
  const port = server.ssh_port || 22;
  const username = server.ssh_username || 'root';
  const password = ephemeralPassword || server.ssh_password || '';

  const runWithConfig = (useLegacy: boolean): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const client = new Client();
      let timer: NodeJS.Timeout | null = null;
      let settled = false;

      const finish = (err?: Error, result?: any) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        try {
          client.end();
        } catch {}
        if (err) reject(err);
        else resolve(result);
      };

      timer = setTimeout(() => {
        finish(new Error(`SSH execution timed out after ${timeoutMs}ms on ${host}:${port}`));
      }, timeoutMs);

      client.on('error', (err) => {
        finish(err);
      });

      client.on('ready', () => {
        client.exec(command, (err, stream) => {
          if (err) {
            return finish(err);
          }

          let stdout = '';
          let stderr = '';

          stream.on('data', (d: Buffer) => {
            stdout += d.toString('utf-8');
          });

          stream.stderr.on('data', (d: Buffer) => {
            stderr += d.toString('utf-8');
          });

          stream.on('close', (code: number) => {
            const durationMs = Date.now() - startTime;
            finish(undefined, {
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: typeof code === 'number' ? code : 0,
              durationMs
            });
          });
        });
      });

      const connectConfig: ConnectConfig = {
        host,
        port,
        username,
        readyTimeout: Math.min(timeoutMs, 15000),
      };

      if (password) {
        connectConfig.password = password;
      }

      if (useLegacy) {
        connectConfig.algorithms = {
          kex: [
            'diffie-hellman-group1-sha1',
            'diffie-hellman-group14-sha1',
            'diffie-hellman-group-exchange-sha1',
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521'
          ],
          cipher: [
            'aes128-cbc',
            'aes192-cbc',
            'aes256-cbc',
            '3des-cbc',
            'aes128-ctr',
            'aes192-ctr',
            'aes256-ctr'
          ],
          serverHostKey: [
            'ssh-rsa',
            'ssh-dss',
            'ecdsa-sha2-nistp256',
            'ecdsa-sha2-nistp384',
            'ecdsa-sha2-nistp521',
            'ssh-ed25519'
          ]
        };
      }

      try {
        client.connect(connectConfig);
      } catch (connErr: any) {
        finish(connErr);
      }
    });
  };

  try {
    // Attempt 1: Modern standard algorithms
    return await runWithConfig(false);
  } catch (modernErr: any) {
    // Rule 12: Adaptive Protocol Negotiation - if modern handshake or cipher fails, fallback automatically to legacy
    const errMsg = (modernErr.message || '').toLowerCase();
    const isCryptoMismatch = errMsg.includes('handshake') || errMsg.includes('algorithm') || errMsg.includes('kex') || errMsg.includes('cipher') || errMsg.includes('key');
    if (isCryptoMismatch) {
      try {
        return await runWithConfig(true);
      } catch (legacyErr: any) {
        throw legacyErr;
      }
    }
    throw modernErr;
  }
}

// ---------------------------------------------------------------------------
// Job Worker Execution
// ---------------------------------------------------------------------------
async function runJobWorker(jobId: string, ephemeralPassword?: string) {
  const job = activeJobs.get(jobId);
  if (!job) return;

  job.status = 'running';
  job.startedAt = Date.now();
  const startTime = Date.now();

  const template = getBulkServerTemplateById(job.templateId);
  if (!template) {
    job.status = 'failed';
    job.finishedAt = Date.now();
    return;
  }

  // Pre-generate preview items for all target servers
  const serverIds = Object.keys(job.results);
  const previewItems = await generateBulkServerPreview(job.templateId, job.parameters, serverIds);
  const previewMap = new Map<string, BulkServerPreviewItem>();
  for (const p of previewItems) {
    previewMap.set(p.serverId, p);
  }

  job.logs.push({
    timestamp: Date.now(),
    timeStr: new Date().toLocaleTimeString(),
    level: 'info',
    messageFa: `شروع اجرای پیکربندی گروهی «${template.title}» روی ${job.totalServers} سرور لینوکسی...`,
    messageEn: `Initiated bulk configuration job "${template.title_en}" across ${job.totalServers} Linux servers...`
  });

  const allServers = await getAllRemoteServers();
  const serverMap = new Map<string, any>();
  for (const s of allServers) {
    serverMap.set(s.id, s);
  }

  const isCancelled = (): boolean => (activeJobs.get(jobId)?.status as string) === 'cancelled';

  for (let idx = 0; idx < serverIds.length; idx++) {
    if (isCancelled()) {
      break;
    }

    const sId = serverIds[idx];
    const server = serverMap.get(sId);
    const preview = previewMap.get(sId);

    job.currentServerIndex = idx + 1;
    job.currentServerName = server ? server.name : sId;
    job.currentStepName = `Executing on ${job.currentServerName} (${idx + 1}/${serverIds.length})`;

    if (!server || !preview) {
      job.results[sId] = {
        serverId: sId,
        serverName: sId,
        serverIp: '',
        osType: 'linux',
        osDistro: 'unknown',
        distroFamily: 'generic',
        status: 'failed',
        stepsTotal: 0,
        stepsCompleted: 0,
        stepsDetail: [],
        durationMs: 0,
        executedAt: Date.now(),
        errorMessageFa: 'سرور در پایگاه داده یافت نشد.',
        errorMessageEn: 'Server not found in database.'
      };
      job.failedCount++;
      job.completedServers++;
      continue;
    }

    job.logs.push({
      timestamp: Date.now(),
      timeStr: new Date().toLocaleTimeString(),
      level: 'info',
      messageFa: `در حال اتصال SSH به «${server.name}» (${server.ip}:${server.ssh_port || 22})...`,
      messageEn: `Connecting via SSH to "${server.name}" (${server.ip}:${server.ssh_port || 22})...`,
      serverId: sId
    });

    const serverStartTime = Date.now();
    const stepsDetail: BulkServerStepDetail[] = [];
    let serverHasError = false;
    let fullOutput = '';

    // Execute each command step sequentially
    for (let sIdx = 0; sIdx < preview.steps.length; sIdx++) {
      if (isCancelled()) {
        break;
      }

      const step = preview.steps[sIdx];
      const stepDetail: BulkServerStepDetail = {
        stepIndex: sIdx + 1,
        stepName: step.name,
        command: step.command,
        descriptionFa: step.descriptionFa,
        descriptionEn: step.descriptionEn,
        status: 'running'
      };

      try {
        const timeoutMs = (job.options.timeoutSec || template.default_timeout_sec || 60) * 1000;
        const res = await executeSshCommand(server, step.command, timeoutMs, ephemeralPassword);

        stepDetail.stdout = res.stdout;
        stepDetail.stderr = res.stderr;
        stepDetail.exitCode = res.exitCode;
        stepDetail.durationMs = res.durationMs;

        fullOutput += `\n[$ ${step.command}]\n${res.stdout || ''}${res.stderr ? '\n[STDERR]: ' + res.stderr : ''}\n`;

        if (res.exitCode === 0) {
          stepDetail.status = 'success';
        } else {
          stepDetail.status = 'failed';
          stepDetail.errorMessageEn = res.stderr || `Command exited with status code ${res.exitCode}`;
          stepDetail.errorMessageFa = `دستور با کد خطای ${res.exitCode} خاتمه یافت: ${res.stderr || 'بدون لاگ خطای استاندارد'}`;
          serverHasError = true;
          stepsDetail.push(stepDetail);
          break; // Stop steps on this server if step fails
        }
      } catch (execErr: any) {
        serverHasError = true;
        stepDetail.status = 'failed';
        stepDetail.errorMessageEn = execErr.message || 'SSH execution error';
        stepDetail.errorMessageFa = `خطا در ارتباط SSH یا اجرای دستور: ${execErr.message || 'خطای نامشخص'}`;
        fullOutput += `\n[$ ${step.command}]\n[CONNECTION/EXEC ERROR]: ${execErr.message}\n`;
        stepsDetail.push(stepDetail);
        break;
      }

      stepsDetail.push(stepDetail);
    }

    const serverDurationMs = Date.now() - serverStartTime;
    const completedStepsCount = stepsDetail.filter((s) => s.status === 'success').length;

    let finalServerStatus: 'success' | 'failed' | 'partial' = 'success';
    if (serverHasError) {
      finalServerStatus = completedStepsCount > 0 ? 'partial' : 'failed';
      job.failedCount++;
      job.logs.push({
        timestamp: Date.now(),
        timeStr: new Date().toLocaleTimeString(),
        level: 'error',
        messageFa: `خطا در اجرای پیکربندی روی «${server.name}» (${server.ip}): ${stepsDetail[stepsDetail.length - 1]?.errorMessageFa || 'خطا در اجرا'}`,
        messageEn: `Execution failed on "${server.name}" (${server.ip}): ${stepsDetail[stepsDetail.length - 1]?.errorMessageEn || 'Failure'}`,
        serverId: sId
      });
    } else {
      job.successCount++;
      job.logs.push({
        timestamp: Date.now(),
        timeStr: new Date().toLocaleTimeString(),
        level: 'success',
        messageFa: `پیکربندی «${server.name}» با موفقیت در ${serverDurationMs}ms تکمیل گردید.`,
        messageEn: `Configuration on "${server.name}" completed successfully in ${serverDurationMs}ms.`,
        serverId: sId
      });
    }

    job.results[sId] = {
      serverId: sId,
      serverName: server.name,
      serverIp: server.ip,
      osType: 'linux',
      osDistro: preview.osDistro,
      distroFamily: preview.distroFamily,
      status: finalServerStatus,
      stepsTotal: preview.steps.length,
      stepsCompleted: completedStepsCount,
      stepsDetail,
      rawOutput: fullOutput.trim(),
      durationMs: serverDurationMs,
      executedAt: Date.now(),
      errorMessageFa: serverHasError ? stepsDetail[stepsDetail.length - 1]?.errorMessageFa : undefined,
      errorMessageEn: serverHasError ? stepsDetail[stepsDetail.length - 1]?.errorMessageEn : undefined
    };

    job.completedServers++;
    job.percentage = Math.round((job.completedServers / job.totalServers) * 100);

    // Optional delay between servers
    if (job.options.delayMs > 0 && idx < serverIds.length - 1 && !isCancelled()) {
      await new Promise((r) => setTimeout(r, job.options.delayMs));
    }
  }

  if (!isCancelled()) {
    job.status = job.failedCount === 0 ? 'completed' : (job.successCount > 0 ? 'completed' : 'failed');
  }
  job.finishedAt = Date.now();
  job.percentage = 100;
  job.currentStepName = 'Execution Finished';

  job.logs.push({
    timestamp: Date.now(),
    timeStr: new Date().toLocaleTimeString(),
    level: job.failedCount === 0 ? 'success' : 'warning',
    messageFa: `عملیات پایان یافت: ${job.successCount} سرور موفق، ${job.failedCount} سرور ناموفق در مجموع ${Date.now() - startTime}ms.`,
    messageEn: `Job completed: ${job.successCount} succeeded, ${job.failedCount} failed in ${Date.now() - startTime}ms.`
  });

  // Audit Log
  await addAuditLog({
    userName: 'Admin',
    action: 'Bulk Linux Server Configuration',
    category: 'system',
    target: `${template.title_en} (${serverIds.length} servers)`,
    status: job.failedCount === 0 ? 'success' : 'warning',
    details: `Executed ${template.id} across ${serverIds.length} Linux nodes: ${job.successCount} succeeded, ${job.failedCount} failed.`,
    ipAddress: '127.0.0.1',
    userAgent: 'BulkServerAutomationEngine/1.0'
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Public API Methods
// ---------------------------------------------------------------------------
export async function startBulkServerJob(payload: {
  templateId: string;
  parameters: Record<string, any>;
  serverIds: string[];
  timeoutSec?: number;
  delayMs?: number;
  dangerConfirmation?: string;
  ephemeralPassword?: string;
}): Promise<{ jobId: string }> {
  const template = getBulkServerTemplateById(payload.templateId);
  if (!template) {
    throw new Error(`Template not found: ${payload.templateId}`);
  }

  if (template.is_dangerous && template.confirmation_keyword) {
    if (payload.dangerConfirmation?.trim().toUpperCase() !== template.confirmation_keyword.toUpperCase()) {
      throw new Error(`Danger confirmation keyword mismatch. Expected: "${template.confirmation_keyword}"`);
    }
  }

  const allServers = await getAllRemoteServers();
  const validLinuxServers = allServers.filter(
    (s) => payload.serverIds.includes(s.id) && s.os_type === 'linux'
  );

  if (validLinuxServers.length === 0) {
    throw new Error('No valid Linux servers selected for bulk configuration.');
  }

  const jobId = `job-srv-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

  const initialResults: Record<string, BulkServerExecutionResult> = {};
  for (const s of validLinuxServers) {
    initialResults[s.id] = {
      serverId: s.id,
      serverName: s.name,
      serverIp: s.ip,
      osType: 'linux',
      osDistro: s.os_distro || 'Ubuntu',
      distroFamily: detectDistroFamily(s.os_distro),
      status: 'skipped',
      stepsTotal: 0,
      stepsCompleted: 0,
      stepsDetail: [],
      durationMs: 0,
      executedAt: Date.now()
    };
  }

  const job: BulkServerJobStatus = {
    jobId,
    templateId: template.id,
    templateTitle: template.title,
    templateTitleEn: template.title_en,
    parameters: payload.parameters || {},
    status: 'queued',
    createdAt: Date.now(),
    totalServers: validLinuxServers.length,
    completedServers: 0,
    percentage: 0,
    currentServerIndex: 0,
    currentServerName: '',
    currentStepName: 'Queued',
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    options: {
      timeoutSec: payload.timeoutSec || template.default_timeout_sec || 60,
      delayMs: payload.delayMs || 1000,
      dangerConfirmation: payload.dangerConfirmation
    },
    results: initialResults,
    logs: [
      {
        timestamp: Date.now(),
        timeStr: new Date().toLocaleTimeString(),
        level: 'info',
        messageFa: `عملیات در صف قرار گرفت برای ${validLinuxServers.length} سرور لینوکسی.`,
        messageEn: `Job queued for ${validLinuxServers.length} Linux servers.`
      }
    ]
  };

  activeJobs.set(jobId, job);

  // Run in background
  setImmediate(() => {
    runJobWorker(jobId, payload.ephemeralPassword).catch((err) => {
      console.error(`[BulkServerConfig] Worker error for job ${jobId}:`, err);
    });
  });

  return { jobId };
}

export function getBulkServerJobStatus(jobId: string): BulkServerJobStatus | undefined {
  return activeJobs.get(jobId);
}

export function cancelBulkServerJob(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  if (!job) return false;
  if (job.status === 'running' || job.status === 'queued') {
    job.status = 'cancelled';
    job.logs.push({
      timestamp: Date.now(),
      timeStr: new Date().toLocaleTimeString(),
      level: 'warning',
      messageFa: 'عملیات توسط کاربر لغو گردید.',
      messageEn: 'Job was cancelled by the user.'
    });
    return true;
  }
  return false;
}
