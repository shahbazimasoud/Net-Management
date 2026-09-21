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
  category: 'maintenance' | 'security' | 'network' | 'users' | 'services' | 'custom';
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
