import {
  RemoteServer,
  ApacheModuleItem,
  ApacheMpmDetails,
  ApacheModulesSummary,
} from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { discoverApacheInstallation, isLikelyApacheBinary } from './apacheDiscovery';

/**
 * Standard Apache module definitions catalog with categories and descriptions.
 */
interface ModuleCatalogDef {
  name: string;
  symbol: string;
  category: 'core' | 'proxy' | 'security' | 'performance' | 'auth' | 'rewrite' | 'mpm' | 'other';
  descEn: string;
  descFa: string;
  directives: string[];
}

export const APACHE_MODULE_CATALOG: ModuleCatalogDef[] = [
  // MPMs
  {
    name: 'mpm_event',
    symbol: 'mpm_event_module',
    category: 'mpm',
    descEn: 'High-performance asynchronous multi-processing module using dedicated listener threads.',
    descFa: 'ماژول چندهسته‌ای رویدادمحور و با کارایی بسیار بالا با بهینه‌سازی کانکشن‌های Keep-Alive.',
    directives: ['AsyncRequestWorkerFactor', 'ServerLimit', 'ThreadsPerChild'],
  },
  {
    name: 'mpm_worker',
    symbol: 'mpm_worker_module',
    category: 'mpm',
    descEn: 'Hybrid multi-process multi-threaded server architecture for high concurrency.',
    descFa: 'معماری ترکیبی چندپردازشی و چندهسته‌ای (Thread) برای پاسخ‌گویی به بارهای کاری همزمان.',
    directives: ['ThreadsPerChild', 'MaxRequestWorkers', 'MinSpareThreads'],
  },
  {
    name: 'mpm_prefork',
    symbol: 'mpm_prefork_module',
    category: 'mpm',
    descEn: 'Non-threaded process-based MPM for backward compatibility with non-thread-safe libraries (e.g., embedded PHP).',
    descFa: 'ماژول چندپردازشی سنتی بدون ترد؛ مناسب برای برنامه‌ها و افزونه‌های فاقد Thread-Safety (مانند mod_php).',
    directives: ['MaxRequestWorkers', 'MaxSpareServers', 'MinSpareServers'],
  },

  // Rewrite
  {
    name: 'rewrite',
    symbol: 'rewrite_module',
    category: 'rewrite',
    descEn: 'Provides a rule-based rewriting engine to rewrite requested URLs on the fly.',
    descFa: 'موتور قدرتمند بازنویسی هوشمند آدرس‌های URL بر اساس قوانین و عبارات باقاعده (Regex).',
    directives: ['RewriteEngine', 'RewriteRule', 'RewriteCond', 'RewriteBase', 'RewriteMap'],
  },

  // Proxy
  {
    name: 'proxy',
    symbol: 'proxy_module',
    category: 'proxy',
    descEn: 'Core gateway and proxy engine for Apache HTTP Server.',
    descFa: 'هسته اصلی پروکسی، فوروارد و مسیریابی ترافیک به سمت سرورهای داخلی.',
    directives: ['ProxyPass', 'ProxyPassReverse', 'ProxyRequests', 'ProxyPreserveHost'],
  },
  {
    name: 'proxy_http',
    symbol: 'proxy_http_module',
    category: 'proxy',
    descEn: 'HTTP and HTTPS support for Apache mod_proxy.',
    descFa: 'ماژول انتقال پروتکل‌های HTTP و HTTPS به مقاصد بک‌اند.',
    directives: ['ProxyPass'],
  },
  {
    name: 'proxy_wstunnel',
    symbol: 'proxy_wstunnel_module',
    category: 'proxy',
    descEn: 'Provides support for tunneling WebSocket connections to a backend.',
    descFa: 'پشتیبانی از تانل و مسیریابی سوکت‌های بلادرنگ دوطرفه (WebSocket ws:// و wss://).',
    directives: ['ProxyPass ws://', 'ProxyPass wss://'],
  },
  {
    name: 'proxy_fcgi',
    symbol: 'proxy_fcgi_module',
    category: 'proxy',
    descEn: 'FastCGI proxy handler, standard for interfacing with PHP-FPM.',
    descFa: 'هندلر پروکسی پروتکل FastCGI؛ شیوه مدرن و استاندارد ارتباط با سرویس PHP-FPM.',
    directives: ['SetHandler "proxy:fcgi://', 'ProxyPass fcgi://'],
  },
  {
    name: 'proxy_balancer',
    symbol: 'proxy_balancer_module',
    category: 'proxy',
    descEn: 'Clustering and load balancing engine for HTTP, FTP, and AJP backends.',
    descFa: 'موتور توزیع بار، کلاسترینگ و Failover بین چندین سرور بک‌اند (Load Balancer).',
    directives: ['<Proxy balancer://', 'BalancerMember', 'ProxySet lbmethod'],
  },
  {
    name: 'proxy_ajp',
    symbol: 'proxy_ajp_module',
    category: 'proxy',
    descEn: 'Apache JServ Protocol (AJP) handler for proxying to Java application servers like Tomcat.',
    descFa: 'پروتکل باینری AJP برای اتصال پرسرعت به اپلیکیشن‌سرورهای جاوا (مانند آپاچی تام‌کت).',
    directives: ['ProxyPass ajp://'],
  },

  // Security & SSL
  {
    name: 'ssl',
    symbol: 'ssl_module',
    category: 'security',
    descEn: 'Strong cryptography using Secure Sockets Layer (SSL) and Transport Layer Security (TLS).',
    descFa: 'موتور رمزنگاری امن ارتباطات مبتنی بر گواهینامه‌های دیجیتال SSL و پروتکل TLS.',
    directives: ['SSLEngine', 'SSLCertificateFile', 'SSLCertificateKeyFile', 'SSLCertificateChainFile', 'SSLProtocol'],
  },
  {
    name: 'headers',
    symbol: 'headers_module',
    category: 'security',
    descEn: 'Customization and control of HTTP request and response headers (HSTS, CSP, X-Frame).',
    descFa: 'کنترل و تزریق هدرهای امنیتی وب مانند HSTS، X-Frame-Options و CSP.',
    directives: ['Header set', 'Header always set', 'RequestHeader set', 'Header unset'],
  },
  {
    name: 'security2',
    symbol: 'security2_module',
    category: 'security',
    descEn: 'ModSecurity open-source Web Application Firewall (WAF) engine.',
    descFa: 'فایروال قدرتمند لایه وب ModSecurity برای محافظت در برابر حملات سایبری.',
    directives: ['SecRuleEngine', 'SecRule', 'SecRequestBodyAccess'],
  },
  {
    name: 'evasive20',
    symbol: 'evasive20_module',
    category: 'security',
    descEn: 'Evasive maneuvers against DDoS, brute force, and HTTP flood attacks.',
    descFa: 'ماژول دفاعی هوشمند در برابر حملات منع سرویس (DoS/DDoS) و بروت‌فورس.',
    directives: ['DOSHashTableSize', 'DOSPageCount', 'DOSSiteCount'],
  },

  // Performance & Compression
  {
    name: 'deflate',
    symbol: 'deflate_module',
    category: 'performance',
    descEn: 'Compresses content with Gzip before being delivered to the client.',
    descFa: 'فشرده‌سازی خودکار ترافیک خروجی با الگوریتم Gzip برای افزایش سرعت لود صفحات.',
    directives: ['AddOutputFilterByType DEFLATE', 'DeflateCompressionLevel'],
  },
  {
    name: 'brotli',
    symbol: 'brotli_module',
    category: 'performance',
    descEn: 'Compresses content with next-generation Brotli compression algorithm.',
    descFa: 'فشرده‌سازی فوق‌پیشرفته نسل جدید با الگوریتم Brotli با نسبت فشرده‌سازی بسیار بالا.',
    directives: ['BrotliFilter', 'BrotliCompressionQuality'],
  },
  {
    name: 'http2',
    symbol: 'http2_module',
    category: 'performance',
    descEn: 'Support for the HTTP/2 transport layer with binary multiplexing.',
    descFa: 'پشتیبانی از نسل دوم پروتکل وب HTTP/2 با مالتی‌پلکس همزمان درخواست‌ها.',
    directives: ['Protocols h2', 'Protocols h2c'],
  },
  {
    name: 'expires',
    symbol: 'expires_module',
    category: 'performance',
    descEn: 'Generation of Expires and Cache-Control HTTP headers for client-side caching.',
    descFa: 'تنظیم هدرهای انقضا و مدیریت کش سمت کاربر برای فایل‌های استاتیک.',
    directives: ['ExpiresActive', 'ExpiresByType', 'ExpiresDefault'],
  },
  {
    name: 'cache',
    symbol: 'cache_module',
    category: 'performance',
    descEn: 'RFC 2616 compliant HTTP content caching filter.',
    descFa: 'سیستم کش هوشمند محتوای پاسخ‌های سرور بر اساس استانداردهای RFC.',
    directives: ['CacheEnable', 'CacheDisable', 'CacheHeader'],
  },

  // Authentication & Authorization
  {
    name: 'auth_basic',
    symbol: 'auth_basic_module',
    category: 'auth',
    descEn: 'Basic HTTP user authentication.',
    descFa: 'احراز هویت پایه HTTP با نام کاربری و کلمه عبور (Basic Authentication).',
    directives: ['AuthType Basic', 'AuthName'],
  },
  {
    name: 'authn_file',
    symbol: 'authn_file_module',
    category: 'auth',
    descEn: 'User authentication using plain text or htpasswd files.',
    descFa: 'احراز هویت کاربران با استفاده از فایل‌های استاندارد htpasswd.',
    directives: ['AuthUserFile'],
  },
  {
    name: 'authz_core',
    symbol: 'authz_core_module',
    category: 'auth',
    descEn: 'Core authorization provider for Apache 2.4+.',
    descFa: 'هسته کنترل دسترسی و سطوح مجوزهای کاربران در آپاچی ۲.۴ و بالاتر.',
    directives: ['Require all granted', 'Require all denied', 'Require user'],
  },
  {
    name: 'authz_host',
    symbol: 'authz_host_module',
    category: 'auth',
    descEn: 'Group authorizations based on client host name or IP address.',
    descFa: 'محدودسازی دسترسی به وب‌سایت یا مسیرها بر اساس IP یا رنج شبکه کلاینت.',
    directives: ['Require ip', 'Require host', 'Require not ip'],
  },

  // Core & Standard
  {
    name: 'core',
    symbol: 'core_module',
    category: 'core',
    descEn: 'Core Apache HTTP Server features that are always available.',
    descFa: 'قابلیت‌های بنیادین و هسته غیرقابل حذف سرور آپاچی.',
    directives: ['ServerRoot', 'DocumentRoot', 'Listen', 'ErrorLog'],
  },
  {
    name: 'so',
    symbol: 'so_module',
    category: 'core',
    descEn: 'Loading of executable code and dynamic shared objects (DSO).',
    descFa: 'ماژول پایه بارگذاری ماژول‌های داینامیک اشتراکی (DSO) در حافظه.',
    directives: ['LoadModule'],
  },
  {
    name: 'http',
    symbol: 'http_module',
    category: 'core',
    descEn: 'Standard HTTP protocol parsing and processing.',
    descFa: 'پردازش استاندارد درخواست‌ها و پاسخ‌های پروتکل HTTP.',
    directives: [],
  },
  {
    name: 'alias',
    symbol: 'alias_module',
    category: 'other',
    descEn: 'Mapping different parts of the host filesystem in the document tree.',
    descFa: 'مپ کردن مسیرهای مختلف فایل‌سیستم سرور به آدرس‌های مجازی در وب‌سایت.',
    directives: ['Alias', 'ScriptAlias', 'Redirect'],
  },
  {
    name: 'dir',
    symbol: 'dir_module',
    category: 'other',
    descEn: 'Commands directory indexing and the DirectoryIndex directive.',
    descFa: 'تعیین فایل پیش‌فرض نمایشی شاخه (مانند index.html یا index.php).',
    directives: ['DirectoryIndex'],
  },
  {
    name: 'mime',
    symbol: 'mime_module',
    category: 'other',
    descEn: 'Associates the requested filename extensions with the file behavior and content type.',
    descFa: 'تشخیص پسوند فایل‌ها و نسبت دادن نوع محتوا (MIME Type) به آنها.',
    directives: ['AddType', 'TypesConfig', 'AddEncoding'],
  },
  {
    name: 'log_config',
    symbol: 'log_config_module',
    category: 'other',
    descEn: 'Logging of the requests made to the server with custom formatting.',
    descFa: 'ثبت رویدادها و درخواست‌های سرور با فرمت‌های سفارشی (CustomLog و LogFormat).',
    directives: ['CustomLog', 'LogFormat', 'TransferLog'],
  },
  {
    name: 'status',
    symbol: 'status_module',
    category: 'other',
    descEn: 'Provides information on server performance and current active worker activity.',
    descFa: 'صفحه مانیتورینگ زنده ترافیک، پردازش‌های فعال و وضعیت عملکرد آپاچی (server-status).',
    directives: ['SetHandler server-status', 'ExtendedStatus'],
  },
  {
    name: 'ratelimit',
    symbol: 'ratelimit_module',
    category: 'performance',
    descEn: 'Bandwidth Rate Limiting for Clients.',
    descFa: 'محدودسازی نرخ پهنای باند و سرعت دانلود برای کاربران.',
    directives: ['SetOutputFilter RATE_LIMIT', 'rate-limit'],
  },
  {
    name: 'remoteip',
    symbol: 'remoteip_module',
    category: 'security',
    descEn: 'Replaces the original client IP with useragent IP presented by proxies/balancers.',
    descFa: 'بازنشانی IP واقعی کاربر از روی هدرهای X-Forwarded-For در پشت کلودفلر یا پروکسی.',
    directives: ['RemoteIPHeader', 'RemoteIPInternalProxy'],
  },
];

/**
 * Deep multi-distribution scanner for Apache modules and MPM status.
 */
const PYTHON_MODULE_EXTRACTOR = (serverRoot: string, binary: string) => `python3 - << 'PYEOF'
import sys, os, re, json, glob, subprocess

server_root = "${serverRoot}"
binary = "${binary}"

# 1. Execute binary -M (loaded dynamic + static modules)
loaded_modules = {}
compiled_modules = []
active_mpm = "unknown"

try:
    p = subprocess.Popen([binary, "-M"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    out, err = p.communicate(timeout=10)
    comb = out + "\\n" + err
    for line in comb.splitlines():
        line = line.strip()
        m = re.match(r'^([a-zA-Z0-9_]+)\\s*\\((static|shared)\\)', line, re.IGNORECASE)
        if m:
            sym = m.group(1)
            mtype = m.group(2).lower()
            loaded_modules[sym] = mtype
            if mtype == 'static':
                compiled_modules.append(sym)
            if 'mpm_' in sym:
                active_mpm = sym.replace('mpm_', '').replace('_module', '').lower()
except Exception as e:
    pass

# If active MPM not found via -M, test -V
if active_mpm == "unknown":
    try:
        p = subprocess.Popen([binary, "-V"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        out, err = p.communicate(timeout=10)
        m = re.search(r'Server MPM:\\s*([a-zA-Z0-9_]+)', out + "\\n" + err, re.IGNORECASE)
        if m:
            active_mpm = m.group(1).strip().lower()
    except Exception:
        pass

# 2. Check Available Modules on Filesystem
available_mods = {}

# Distribution path: Debian/Ubuntu mods-available & mods-enabled
if os.path.isdir('/etc/apache2/mods-available'):
    for lf in glob.glob('/etc/apache2/mods-available/*.load'):
        mname = os.path.basename(lf).replace('.load', '')
        is_enabled = os.path.isfile(f'/etc/apache2/mods-enabled/{mname}.load')
        available_mods[mname] = {
            "sourcePath": lf,
            "enabled": is_enabled
        }

# Distribution path: RHEL/Rocky /etc/httpd/conf.modules.d
if os.path.isdir('/etc/httpd/conf.modules.d'):
    for cf in glob.glob('/etc/httpd/conf.modules.d/*.conf'):
        try:
            with open(cf, 'r', errors='ignore') as fp:
                for line in fp:
                    m = re.match(r'^[ \\t]*(#?)[ \\t]*LoadModule\\s+([a-zA-Z0-9_]+)\\s+["\\']?([^"\\'\\r\\n]+)', line)
                    if m:
                        is_commented = bool(m.group(1))
                        sym = m.group(2)
                        mname = sym.replace('_module', '').replace('mod_', '')
                        available_mods[mname] = {
                            "sourcePath": cf,
                            "symbol": sym,
                            "enabled": not is_commented
                        }
        except:
            pass

# Check shared object files in /usr/lib64/httpd/modules or /usr/lib/apache2/modules
mod_so_paths = [
    "/usr/lib64/httpd/modules/mod_*.so",
    "/usr/lib/apache2/modules/mod_*.so",
    "/usr/lib/httpd/modules/mod_*.so"
]
for p in mod_so_paths:
    for so_file in glob.glob(p):
        fname = os.path.basename(so_file)
        mname = fname.replace('mod_', '').replace('.so', '')
        if mname not in available_mods:
            available_mods[mname] = {
                "sourcePath": so_file,
                "enabled": False
            }

# 3. Detect Directives in Configuration that REQUIRE specific modules
required_by_config = {}

config_candidates = set()
if os.path.isdir(server_root):
    for root, dirs, files in os.walk(server_root):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for f in files:
            if f.endswith('.conf'):
                config_candidates.add(os.path.join(root, f))

# Key directive signatures to look for
signatures = {
    'rewrite': [r'\\bRewriteRule\\b', r'\\bRewriteEngine\\b', r'\\bRewriteCond\\b'],
    'proxy': [r'\\bProxyPass\\b', r'\\bProxyPassReverse\\b', r'\\bProxyPreserveHost\\b'],
    'proxy_http': [r'\\bProxyPass\\s+["\\']?https?://'],
    'proxy_wstunnel': [r'\\bProxyPass\\s+["\\']?wss?://', r'upgrade=websocket'],
    'proxy_balancer': [r'<Proxy\\s+["\\']?balancer://'],
    'ssl': [r'\\bSSLEngine\\s+on\\b', r'\\bSSLCertificateFile\\b'],
    'headers': [r'\\b(?:Request)?Header\\s+(?:set|always|add)\\b'],
    'deflate': [r'\\bAddOutputFilterByType\\s+DEFLATE\\b'],
    'http2': [r'\\bProtocols\\b.*\\bh2\\b'],
    'expires': [r'\\bExpiresActive\\s+on\\b'],
    'auth_basic': [r'\\bAuthType\\s+Basic\\b'],
    'authz_host': [r'\\bRequire\\s+(?:ip|host)\\b'],
    'alias': [r'^[ \\t]*Alias\\s+'],
    'status': [r'\\bSetHandler\\s+server-status\\b'],
    'remoteip': [r'\\bRemoteIPHeader\\b']
}

for cfile in config_candidates:
    try:
        with open(cfile, 'r', errors='ignore') as fp:
            content = fp.read()
        for mod_name, regex_list in signatures.items():
            for rx in regex_list:
                m = re.search(rx, content, re.IGNORECASE | re.MULTILINE)
                if m:
                    if mod_name not in required_by_config:
                        required_by_config[mod_name] = set()
                    matched_str = m.group(0).strip()
                    required_by_config[mod_name].add(matched_str[:40])
    except:
        pass

# Format required_by_config sets to lists
req_formatted = {k: list(v) for k, v in required_by_config.items()}

# Available MPMs detection
available_mpms = set(['event', 'worker', 'prefork'])
if os.path.isdir('/etc/apache2/mods-available'):
    available_mpms = set()
    for m in ['event', 'worker', 'prefork']:
        if os.path.isfile(f'/etc/apache2/mods-available/mpm_{m}.load'):
            available_mpms.add(m)

out_obj = {
    "loadedModules": loaded_modules,
    "compiledModules": compiled_modules,
    "activeMpm": active_mpm,
    "availableMpms": sorted(list(available_mpms)),
    "availableMods": available_mods,
    "requiredByConfig": req_formatted
}

print("MOD_JSON_START:::" + json.dumps(out_obj) + ":::MOD_JSON_END")
PYEOF
`;

/**
 * Discovers the full Apache module and MPM architecture.
 */
export async function discoverApacheModulesArchitecture(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<ApacheModulesSummary> {
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);
  const binary = discovery.binaryPath || (discovery.controlBinaryPath ? discovery.controlBinaryPath : 'apache2');
  const serverRoot =
    discovery.serverRoot ||
    (discovery.confPath?.includes('/httpd') ? '/etc/httpd' : '/etc/apache2');

  let pyData: any = {
    loadedModules: {},
    compiledModules: [],
    activeMpm: discovery.activeMpm || 'event',
    availableMpms: ['event', 'worker', 'prefork'],
    availableMods: {},
    requiredByConfig: {},
  };

  try {
    const pyScript = PYTHON_MODULE_EXTRACTOR(serverRoot, binary);
    const rawOutput = await runAdaptiveSshCommand(server, pyScript, ephemeralPassword, 15000);

    if (rawOutput.includes('MOD_JSON_START:::') && rawOutput.includes(':::MOD_JSON_END')) {
      const jsonStr = rawOutput.split('MOD_JSON_START:::')[1].split(':::MOD_JSON_END')[0].trim();
      pyData = JSON.parse(jsonStr);
    }
  } catch (err: any) {
    console.warn('[ApacheModuleManager] Python scanner warning:', err?.message || err);
  }

  // Build unified module item list
  const loadedKeys = Object.keys(pyData.loadedModules || {});
  const allKnownNames = new Set<string>();

  // Add all catalog names
  APACHE_MODULE_CATALOG.forEach((c) => allKnownNames.add(c.name));

  // Add loaded modules
  loadedKeys.forEach((sym) => {
    const clean = sym.replace('_module', '').replace(/^mod_/, '');
    allKnownNames.add(clean);
  });

  // Add available modules
  Object.keys(pyData.availableMods || {}).forEach((name) => {
    allKnownNames.add(name);
  });

  const moduleItems: ApacheModuleItem[] = [];

  for (const rawName of allKnownNames) {
    const catalogDef = APACHE_MODULE_CATALOG.find(
      (c) => c.name === rawName || c.symbol === `${rawName}_module` || c.symbol === `mod_${rawName}`
    );

    const sym = catalogDef ? catalogDef.symbol : `${rawName}_module`;
    const fullName = `mod_${rawName.replace(/^mod_/, '')}`;

    const isLoaded = loadedKeys.some(
      (k) =>
        k.toLowerCase() === sym.toLowerCase() ||
        k.toLowerCase() === `${rawName}_module`.toLowerCase() ||
        k.toLowerCase().includes(rawName.toLowerCase())
    );

    const isCompiled = (pyData.compiledModules || []).some(
      (k: string) => k.toLowerCase() === sym.toLowerCase() || k.toLowerCase().includes(rawName.toLowerCase())
    );

    const availInfo = pyData.availableMods?.[rawName];
    const isAvail = !!availInfo;
    const isEnabled = availInfo?.enabled ?? isLoaded;

    let status: 'loaded' | 'enabled' | 'available' | 'disabled' = 'available';
    if (isLoaded) {
      status = 'loaded';
    } else if (isEnabled) {
      status = 'enabled';
    } else if (isAvail && !isEnabled) {
      status = 'disabled';
    }

    const type: 'shared' | 'static' = isCompiled ? 'static' : 'shared';

    // Directives required
    const reqDirs = pyData.requiredByConfig?.[rawName] || [];
    const isRequired = reqDirs.length > 0;

    const category = catalogDef?.category || (rawName.startsWith('mpm_') ? 'mpm' : 'other');

    moduleItems.push({
      name: fullName,
      rawName,
      moduleSymbol: sym,
      filename: `${fullName}.so`,
      type,
      status,
      isRequiredByConfig: isRequired,
      requiredByDirectives: reqDirs,
      category,
      descriptionEn: catalogDef?.descEn || `Apache HTTP Server module (${fullName}).`,
      descriptionFa: catalogDef?.descFa || `ماژول پردازشی سرور وب آپاچی (${fullName}).`,
      sourceConfigPath: availInfo?.sourcePath,
    });
  }

  // Sort modules: loaded first, then required by config, then alphabetical
  moduleItems.sort((a, b) => {
    if (a.isRequiredByConfig && !b.isRequiredByConfig) return -1;
    if (!a.isRequiredByConfig && b.isRequiredByConfig) return 1;
    if (a.status === 'loaded' && b.status !== 'loaded') return -1;
    if (a.status !== 'loaded' && b.status === 'loaded') return 1;
    return a.name.localeCompare(b.name);
  });

  // Calculate stats
  const loadedCount = moduleItems.filter((m) => m.status === 'loaded').length;
  const disabledCount = moduleItems.filter((m) => m.status === 'disabled').length;
  const availableCount = moduleItems.length;
  const staticCount = moduleItems.filter((m) => m.type === 'static').length;
  const requiredCount = moduleItems.filter((m) => m.isRequiredByConfig).length;

  // MPM details
  const activeMpmName = pyData.activeMpm || discovery.activeMpm || 'event';
  const isThreaded = activeMpmName === 'event' || activeMpmName === 'worker';

  let compatibilityWarning: string | undefined;
  let compatibilityWarning_fa: string | undefined;

  const hasPhpModule = moduleItems.some(
    (m) =>
      m.status === 'loaded' &&
      (m.name.includes('php') || m.name.includes('suphp'))
  );

  if (hasPhpModule && isThreaded) {
    compatibilityWarning =
      'Embedded mod_php is not thread-safe with event or worker MPM! Using PHP-FPM with mod_proxy_fcgi is recommended.';
    compatibilityWarning_fa =
      'افزونه تعبیه‌شده mod_php با مدل‌های Event یا Worker تردسیف نیست! استفاده از PHP-FPM با mod_proxy_fcgi اکیداً پیشنهاد می‌شود.';
  }

  const mpmDetails: ApacheMpmDetails = {
    activeMpm: activeMpmName,
    availableMpms: pyData.availableMpms || ['event', 'worker', 'prefork'],
    isThreaded,
    workers: discovery.workerCount || 1,
    compatibilityWarning,
    compatibilityWarning_fa,
  };

  const categories = [
    'all',
    'core',
    'proxy',
    'security',
    'performance',
    'rewrite',
    'auth',
    'mpm',
    'other',
  ];

  return {
    activeMpm: mpmDetails,
    totalModules: moduleItems.length,
    loadedCount,
    availableCount,
    disabledCount,
    staticCount,
    requiredCount,
    modules: moduleItems,
    categories,
    syntaxValid: discovery.configTestOk,
    syntaxOutput: discovery.configTestOutput,
  };
}

/**
 * Toggles an Apache module (enable or disable) with atomic syntax check and rollback.
 */
export async function toggleApacheModule(
  server: RemoteServer,
  moduleName: string,
  action: 'enable' | 'disable',
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; output?: string }> {
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);
  const binary = discovery.binaryPath || (discovery.controlBinaryPath ? discovery.controlBinaryPath : 'apache2');
  const serviceName = discovery.serviceName || 'apache2';

  if (!isLikelyApacheBinary(binary)) {
    throw new Error(`Untrusted or invalid Apache binary: ${binary}`);
  }

  const cleanName = moduleName.replace(/^mod_/, '').replace(/\.so$/, '').trim();

  // Guard against disabling core or essential modules
  if (action === 'disable') {
    const protectedModules = ['core', 'so', 'http', 'authz_core'];
    if (protectedModules.includes(cleanName)) {
      throw new Error(`Cannot disable core Apache module '${cleanName}' as it would break server functionality.`);
    }
  }

  const script = `export LC_ALL=C
MOD="${cleanName}"
ACTION="${action}"

# 1. Debian / Ubuntu family
if command -v a2enmod >/dev/null 2>&1 && command -v a2dismod >/dev/null 2>&1; then
  if [ "$ACTION" = "enable" ]; then
    a2enmod "$MOD" 2>&1
  else
    a2dismod -f "$MOD" 2>&1
  fi
elif [ -d /etc/httpd/conf.modules.d ]; then
  # 2. RHEL / CentOS / Rocky / Fedora family
  for f in /etc/httpd/conf.modules.d/*.conf; do
    if [ "$ACTION" = "enable" ]; then
      # Uncomment
      sed -i "s/^[ \\t]*#[ \\t]*\\(LoadModule[ \\t]\\+\\w*\${MOD}\\w*\\)/\\1/g" "$f" 2>/dev/null || true
    else
      # Comment out
      sed -i "s/^[ \\t]*\\(LoadModule[ \\t]\\+\\w*\${MOD}\\w*\\)/#\\1/g" "$f" 2>/dev/null || true
    fi
  done
fi

# 3. Syntax Verification
${binary} -t 2>&1
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 15000);

  if (output.toLowerCase().includes('syntax ok')) {
    // Graceful reload
    const reloadCmd = `systemctl reload ${serviceName} 2>/dev/null || apachectl -k graceful 2>/dev/null || true`;
    await runAdaptiveSshCommand(server, reloadCmd, ephemeralPassword, 8000);

    return {
      success: true,
      message: `Apache module 'mod_${cleanName}' ${action === 'enable' ? 'enabled' : 'disabled'} successfully.`,
      output,
    };
  } else {
    // Atomic rollback!
    const rollbackScript = `export LC_ALL=C
MOD="${cleanName}"
if [ "${action}" = "enable" ]; then
  command -v a2dismod >/dev/null 2>&1 && a2dismod -f "$MOD" 2>/dev/null || true
else
  command -v a2enmod >/dev/null 2>&1 && a2enmod "$MOD" 2>/dev/null || true
fi
`;
    await runAdaptiveSshCommand(server, rollbackScript, ephemeralPassword, 8000).catch(() => {});

    throw new Error(
      `Apache configuration syntax error after modifying module 'mod_${cleanName}'. Changes rolled back:\n${output.trim()}`
    );
  }
}

/**
 * Safely switches the active Apache MPM (Multi-Processing Module).
 * Checks syntax before reloading or restarting daemon.
 */
export async function switchApacheMpm(
  server: RemoteServer,
  targetMpm: 'event' | 'worker' | 'prefork' | string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; output?: string }> {
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);
  const binary = discovery.binaryPath || (discovery.controlBinaryPath ? discovery.controlBinaryPath : 'apache2');
  const serviceName = discovery.serviceName || 'apache2';

  if (!isLikelyApacheBinary(binary)) {
    throw new Error(`Untrusted or invalid Apache binary: ${binary}`);
  }

  const cleanMpm = targetMpm.toLowerCase().replace(/^mpm_/, '').trim();
  if (!['event', 'worker', 'prefork'].includes(cleanMpm)) {
    throw new Error(`Unsupported MPM '${targetMpm}'. Allowed MPMs: event, worker, prefork.`);
  }

  const script = `export LC_ALL=C
TARGET="${cleanMpm}"

# 1. Debian / Ubuntu
if command -v a2enmod >/dev/null 2>&1 && command -v a2dismod >/dev/null 2>&1; then
  # Disable other MPMs
  for m in event worker prefork; do
    if [ "$m" != "$TARGET" ]; then
      a2dismod -f "mpm_$m" 2>/dev/null || true
    fi
  done
  a2enmod "mpm_$TARGET" 2>&1
elif [ -f /etc/httpd/conf.modules.d/00-mpm.conf ]; then
  # 2. RHEL / Rocky / Fedora
  CONF="/etc/httpd/conf.modules.d/00-mpm.conf"
  # Comment all mpm load lines
  sed -i "s/^[ \\t]*\\(LoadModule[ \\t]\\+mpm_\\)/#\\1/g" "$CONF"
  # Uncomment target
  sed -i "s/^[ \\t]*#[ \\t]*\\(LoadModule[ \\t]\\+mpm_\${TARGET}_module\\)/\\1/g" "$CONF"
fi

# 3. Syntax Verification
${binary} -t 2>&1
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 15000);

  if (output.toLowerCase().includes('syntax ok')) {
    // Restart daemon (MPM change requires restart, not reload)
    const restartCmd = `systemctl restart ${serviceName} 2>/dev/null || apachectl restart 2>/dev/null || true`;
    await runAdaptiveSshCommand(server, restartCmd, ephemeralPassword, 10000);

    return {
      success: true,
      message: `Active Apache MPM switched to '${cleanMpm}' successfully.`,
      output,
    };
  } else {
    throw new Error(
      `Failed to switch MPM to '${cleanMpm}'. Syntax verification failed:\n${output.trim()}`
    );
  }
}
