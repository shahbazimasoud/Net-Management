import { RemoteServer } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { discoverApacheInstallation, isLikelyApacheBinary } from './apacheDiscovery';
import { discoverApacheConfigTopology } from './apacheConfigParser';
import { saveApacheConfigFileSafe, assertSafeApachePath } from './apacheSafeEditor';
import {
  ApacheSecurityAuditReport,
  ApacheSecurityAuditItem,
  ApacheSecurityCategory,
  ApacheSecuritySeverity,
  ApacheSecurityApplyFixResult,
  ApacheInstanceInfo,
} from '../src/types';

/**
 * Shell script to inspect live runtime user, process hierarchy, multi-instance processes,
 * and sensitive file permissions on the target Linux host.
 */
const LIVE_APACHE_SECURITY_SCRIPT = `export LC_ALL=C
echo "===WORKER_USER==="
ps -eo pid,comm,user,args 2>/dev/null | awk '$2 ~ /^(apache2|httpd)$/ && !/root/ {print $3; exit}' || echo "unknown"
echo "===MASTER_USER==="
ps -eo pid,comm,user,args 2>/dev/null | awk '$2 ~ /^(apache2|httpd)$/ && /root/ {print $3; exit}' || echo "root"
echo "===CONF_PERMS==="
ls -ld /etc/apache2 /etc/httpd 2>/dev/null || true
ls -l /etc/apache2/apache2.conf /etc/httpd/conf/httpd.conf 2>/dev/null || true
echo "===SSL_KEY_PERMS==="
find /etc/apache2 /etc/httpd /etc/ssl /etc/letsencrypt -type f \\( -name "*.key" -o -name "*privkey*.pem" \\) -exec ls -ld {} + 2>/dev/null | head -n 10 || true
echo "===RUNNING_PROCESSES==="
ps -eo pid,user,comm,args 2>/dev/null | grep -E 'apache2|httpd' | grep -v grep | head -n 12 || true
echo "===END_LIVE_APACHE_SEC==="
`;

/**
 * Strips comments from Apache configuration text for precise directive parsing.
 */
function stripApacheComments(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('#');
      return idx >= 0 ? line.substring(0, idx) : line;
    })
    .join('\n');
}

/**
 * Performs a comprehensive security audit of Apache configuration, live environment, and system permissions.
 */
export async function performApacheSecurityAudit(
  server: RemoteServer,
  ephemeralPassword?: string,
  targetConfPath?: string
): Promise<ApacheSecurityAuditReport> {
  const testedAt = new Date().toISOString();

  // 1. Discover basic installation and binary topology
  const discovery = await discoverApacheInstallation(
    server,
    ephemeralPassword,
    targetConfPath ? { targetConfPath } : undefined
  );

  // 2. Discover full configuration include topology
  const chosenConf = targetConfPath || discovery.confPath || '/etc/apache2/apache2.conf';
  const topology = await discoverApacheConfigTopology(
    server,
    ephemeralPassword,
    chosenConf,
    discovery.serverRoot
  );

  // 3. Inspect live process permissions & instances
  let liveWorkerUser = 'unknown';
  let liveMasterUser = 'root';
  let confPermsOutput = '';
  let sslKeysPermsOutput = '';
  let runningProcessesOutput = '';

  try {
    const liveOut = await runAdaptiveSshCommand(server, LIVE_APACHE_SECURITY_SCRIPT, ephemeralPassword, 10000);
    if (liveOut.includes('===WORKER_USER===')) {
      liveWorkerUser = liveOut.split('===WORKER_USER===')[1].split('===MASTER_USER===')[0].trim() || 'unknown';
    }
    if (liveOut.includes('===MASTER_USER===')) {
      liveMasterUser = liveOut.split('===MASTER_USER===')[1].split('===CONF_PERMS===')[0].trim() || 'root';
    }
    if (liveOut.includes('===CONF_PERMS===')) {
      confPermsOutput = liveOut.split('===CONF_PERMS===')[1].split('===SSL_KEY_PERMS===')[0].trim();
    }
    if (liveOut.includes('===SSL_KEY_PERMS===')) {
      sslKeysPermsOutput = liveOut.split('===SSL_KEY_PERMS===')[1].split('===RUNNING_PROCESSES===')[0].trim();
    }
    if (liveOut.includes('===RUNNING_PROCESSES===')) {
      runningProcessesOutput = liveOut.split('===RUNNING_PROCESSES===')[1].split('===END_LIVE_APACHE_SEC===')[0].trim();
    }
  } catch (err: any) {
    console.warn('[Apache Live Security Inspection SSH Error]:', err?.message || err);
  }

  // 4. Combine all configuration content for static AST/pattern auditing
  let combinedCleanContent = '';
  const fileContentMap = new Map<string, string>();

  for (const node of topology.files) {
    const rawContent = node.fullContent || node.contentSnippet || '';
    const clean = stripApacheComments(rawContent);
    fileContentMap.set(node.filePath, clean);
    combinedCleanContent += `\n# --- FILE: ${node.filePath} ---\n` + clean;
  }

  // Helper to find which files contain a given regex
  const findMatchingFiles = (regex: RegExp): string[] => {
    const matches: string[] = [];
    for (const [filePath, content] of fileContentMap.entries()) {
      if (regex.test(content)) {
        matches.push(filePath);
      }
    }
    return matches;
  };

  const auditItems: ApacheSecurityAuditItem[] = [];

  // =========================================================================
  // RULE 1: ServerTokens & ServerSignature Information Disclosure
  // =========================================================================
  const serverTokensProdMatch = /\bServerTokens\s+(Prod|ProductOnly)\b/i.test(combinedCleanContent);
  const serverSignatureOffMatch = /\bServerSignature\s+Off\b/i.test(combinedCleanContent);
  const infoDisclosurePassed = serverTokensProdMatch && serverSignatureOffMatch;
  const tokenFiles = findMatchingFiles(/\b(ServerTokens|ServerSignature)\b/i);

  auditItems.push({
    id: 'sec-apache-server-tokens',
    category: 'information_disclosure',
    title: 'پنهان‌سازی اطلاعات نسخه در هدر و فوتر صفحات خطا (ServerTokens & ServerSignature)',
    title_en: 'Hide Server Version & OS Banner (ServerTokens Prod & ServerSignature Off)',
    severity: 'warning',
    passed: infoDisclosurePassed,
    currentValue: `${serverTokensProdMatch ? 'ServerTokens Prod' : 'ServerTokens Full/OS/Default'}, ${
      serverSignatureOffMatch ? 'ServerSignature Off' : 'ServerSignature On/Default'
    }`,
    recommendedValue: 'ServerTokens Prod\nServerSignature Off',
    description: 'دایرکتیوهای ServerTokens و ServerSignature مشخص می‌کنند که آیا نسخه دقیق آپاچی، سیستم‌عامل و ماژول‌های فعال در هدر Server پاسخ‌های HTTP و فوتر صفحات خطای پیش‌فرض نمایش داده شوند یا خیر.',
    description_en: 'Directives ServerTokens and ServerSignature determine whether Apache broadcasts its precise version, operating system details, and installed modules in HTTP headers and error pages.',
    impact: 'نمایش نسخه دقیق آپاچی و ماژول‌ها به مهاجمان اجازه می‌دهد آسیب‌پذیری‌های امنیتی شناخته‌شده (CVE) مربوط به آن نگارش را فوراً شناسایی و هدف قرار دهند.',
    impact_en: 'Broadcasting the exact Apache version allows malicious actors to quickly target known version-specific Common Vulnerabilities and Exposures (CVEs).',
    remediationSnippet: 'ServerTokens Prod\nServerSignature Off',
    affectedFiles: tokenFiles.length > 0 ? tokenFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 2: Cross-Site Tracing (XST) Prevention (TraceEnable Off)
  // =========================================================================
  const traceEnableOffMatch = /\bTraceEnable\s+Off\b/i.test(combinedCleanContent);
  const traceFiles = findMatchingFiles(/\bTraceEnable\b/i);

  auditItems.push({
    id: 'sec-apache-trace-enable',
    category: 'information_disclosure',
    title: 'غیرفعال‌سازی متد ناامن TRACE و پیشگیری از سرقت کوکی (TraceEnable Off)',
    title_en: 'Disable Insecure HTTP TRACE Method (TraceEnable Off)',
    severity: 'critical',
    passed: traceEnableOffMatch,
    currentValue: traceEnableOffMatch ? 'TraceEnable Off' : 'TraceEnable On (Default)',
    recommendedValue: 'TraceEnable Off',
    description: 'متد HTTP TRACE به منظور عیب‌یابی تعبیه شده و درخواست کلاینت را دقیقاً بازمی‌گرداند. این ویژگی توسط مهاجمان برای حملات Cross-Site Tracing (XST) و سرقت کوکی‌های HttpOnly استفاده می‌شود.',
    description_en: 'HTTP TRACE method echoes the client request back. When active, it allows attackers to steal sensitive HttpOnly session cookies via Cross-Site Tracing (XST).',
    impact: 'به مهاجم امکان می‌دهد حتی در صورت وجود محافظت HttpOnly، کوکی‌ها و توکن‌های احراز هویت کاربر را از طریق اکسپلویت‌های مرورگر به سرقت ببرد.',
    impact_en: 'Permits attackers to bypass HttpOnly cookie security flags, exfiltrating session credentials through browser-based XST attacks.',
    remediationSnippet: 'TraceEnable Off',
    affectedFiles: traceFiles.length > 0 ? traceFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 3: Clickjacking Protection (X-Frame-Options)
  // =========================================================================
  const xFrameMatch = /\bHeader\s+(?:always\s+)?(?:set|append)\s+X-Frame-Options\s+["']?(DENY|SAMEORIGIN)["']?/i.test(combinedCleanContent);
  const xFrameFiles = findMatchingFiles(/X-Frame-Options/i);

  auditItems.push({
    id: 'sec-apache-x-frame-options',
    category: 'headers',
    title: 'محافظت در برابر کلیک‌جکینگ (X-Frame-Options)',
    title_en: 'Clickjacking Protection (X-Frame-Options)',
    severity: 'warning',
    passed: xFrameMatch,
    currentValue: xFrameMatch ? 'Configured (DENY / SAMEORIGIN)' : 'Missing',
    recommendedValue: 'Header always set X-Frame-Options "SAMEORIGIN"',
    description: 'هدر امنیتی X-Frame-Options مانع از بارگذاری صفحات وب‌سایت در داخل فریم‌ها و iframeهای وب‌سایت‌های مخرب ثالث می‌شود.',
    description_en: 'The X-Frame-Options HTTP response header controls whether a browser is permitted to render a page inside a <frame>, <iframe>, or <object>.',
    impact: 'عدم وجود این هدر امکان حمله کلیک‌جکینگ (UI Redressing) را فراهم می‌کند که طی آن کاربر به طور ناخواسته فریب خورده و روی المان‌های حساس کلیک می‌کند.',
    impact_en: 'Without this header, malicious third-party sites can frame your application in invisible IFrames to execute UI redressing / clickjacking attacks.',
    remediationSnippet: 'Header always set X-Frame-Options "SAMEORIGIN"',
    affectedFiles: xFrameFiles.length > 0 ? xFrameFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 4: MIME Type Sniffing Prevention (X-Content-Type-Options)
  // =========================================================================
  const xContentTypeMatch = /\bHeader\s+(?:always\s+)?(?:set|append)\s+X-Content-Type-Options\s+["']?nosniff["']?/i.test(combinedCleanContent);
  const xContentTypeFiles = findMatchingFiles(/X-Content-Type-Options/i);

  auditItems.push({
    id: 'sec-apache-x-content-type',
    category: 'headers',
    title: 'جلوگیری از تشخیص اشتباه نوع فایل (X-Content-Type-Options nosniff)',
    title_en: 'MIME Sniffing Prevention (X-Content-Type-Options nosniff)',
    severity: 'warning',
    passed: xContentTypeMatch,
    currentValue: xContentTypeMatch ? 'nosniff' : 'Missing',
    recommendedValue: 'Header always set X-Content-Type-Options "nosniff"',
    description: 'این هدر مرورگرها را ملزم به پایبندی به MIME-type اعلام‌شده توسط وب‌سرور کرده و از حدس زدن و Sniff کردن نوع فایل ممانعت می‌نماید.',
    description_en: 'Prevents browsers from MIME-sniffing a response away from the declared content-type, reducing drive-by download risks.',
    impact: 'مرورگر ممکن است فایلی مانند تصویر آپلودشده توسط کاربر را به عنوان اسکریپت جاوااسکریپت اجرا کند و حمله XSS رخ دهد.',
    impact_en: 'Browsers may interpret user-uploaded non-executable files (like images) as executable JavaScript, resulting in stored Cross-Site Scripting.',
    remediationSnippet: 'Header always set X-Content-Type-Options "nosniff"',
    affectedFiles: xContentTypeFiles.length > 0 ? xContentTypeFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 5: Content Security Policy (CSP)
  // =========================================================================
  const cspMatch = /\bHeader\s+(?:always\s+)?(?:set|append)\s+Content-Security-Policy\b/i.test(combinedCleanContent);
  const cspFiles = findMatchingFiles(/Content-Security-Policy/i);

  auditItems.push({
    id: 'sec-apache-csp',
    category: 'headers',
    title: 'سیاست امنیت محتوا (Content-Security-Policy)',
    title_en: 'Content Security Policy (CSP)',
    severity: 'info',
    passed: cspMatch,
    currentValue: cspMatch ? 'Configured' : 'Missing',
    recommendedValue: `Header always set Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'; frame-ancestors 'self';"`,
    description: 'سیاست امنیت محتوا (CSP) یک لایه امنیتی قدرتمند برای شناسایی و خنثی‌سازی انواع خاصی از حملات از جمله تزریق کد (XSS) و داده است.',
    description_en: 'Content Security Policy (CSP) provides a powerful defensive layer that restricts which resources the browser is allowed to load for a given page.',
    impact: 'نبود CSP موجب می‌شود در صورت وجود کوچک‌ترین باگ در اپلیکیشن وب، اسکریپت‌های مهاجم به راحتی بارگذاری و اجرا شوند.',
    impact_en: 'Without CSP, any stored or reflected injection vulnerability in the web application can be freely exploited by malicious external scripts.',
    remediationSnippet: `Header always set Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'; frame-ancestors 'self';"`,
    affectedFiles: cspFiles.length > 0 ? cspFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 6: Referrer Policy
  // =========================================================================
  const referrerMatch = /\bHeader\s+(?:always\s+)?(?:set|append)\s+Referrer-Policy\b/i.test(combinedCleanContent);
  const referrerFiles = findMatchingFiles(/Referrer-Policy/i);

  auditItems.push({
    id: 'sec-apache-referrer-policy',
    category: 'headers',
    title: 'سیاست کنترل هدر ارجاع‌دهنده (Referrer-Policy)',
    title_en: 'Referrer Policy Control',
    severity: 'info',
    passed: referrerMatch,
    currentValue: referrerMatch ? 'Configured' : 'Missing',
    recommendedValue: 'Header always set Referrer-Policy "strict-origin-when-cross-origin"',
    description: 'تنظیم میزان اطلاعات ارجاعی (URL و کوئری استرینگ‌ها) که مرورگر هنگام کلیک روی لینک‌ها به سایت‌های دیگر ارسال می‌کند.',
    description_en: 'Specifies how much referrer information (like URL parameters and private tokens) is included with requests.',
    impact: 'لینک‌های خروجی ممکن است مسیرهای داخلی، شناسه‌های جلسه یا پارامترهای حساس را به دامنه‌های خارجی لو دهند.',
    impact_en: 'External links may leak sensitive internal URL paths, session IDs, or private query parameters to third-party domains.',
    remediationSnippet: 'Header always set Referrer-Policy "strict-origin-when-cross-origin"',
    affectedFiles: referrerFiles.length > 0 ? referrerFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 7: HSTS (HTTP Strict Transport Security)
  // =========================================================================
  const hstsMatch = /\bHeader\s+(?:always\s+)?(?:set|append)\s+Strict-Transport-Security\b/i.test(combinedCleanContent);
  const hasSslConfigured = /\bSSLEngine\s+on\b/i.test(combinedCleanContent) || /<VirtualHost[^>]*:443>/i.test(combinedCleanContent);
  const hstsPassed = !hasSslConfigured || hstsMatch;
  const hstsFiles = findMatchingFiles(/Strict-Transport-Security/i);

  auditItems.push({
    id: 'sec-apache-hsts',
    category: 'headers',
    title: 'اجبار اتصال دائم از طریق پروتکل امن (HSTS)',
    title_en: 'HTTP Strict Transport Security (HSTS)',
    severity: 'warning',
    passed: hstsPassed,
    currentValue: hstsMatch ? 'Configured' : hasSslConfigured ? 'Missing on SSL Hosts' : 'N/A (No SSL Hosts)',
    recommendedValue: 'Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"',
    description: 'هدر HSTS به مرورگرها اعلام می‌کند که ارتباط با این دامنه منحصراً باید از طریق HTTPS برقرار شود و نسخه‌های غیرامن HTTP مجاز نیستند.',
    description_en: 'HSTS instructs browsers to only interact with the website using HTTPS connections, preventing insecure HTTP fallbacks.',
    impact: 'کاربران در معرض حملات استراق سمع، مرد میانی (MitM) و تنزل پروتکل امن (SSL Stripping) قرار خواهند گرفت.',
    impact_en: 'Allows Man-in-the-Middle (MitM) attackers to perform SSL Stripping attacks, downgrading HTTPS traffic to unencrypted plaintext HTTP.',
    remediationSnippet: 'Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"',
    affectedFiles: hstsFiles.length > 0 ? hstsFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 8: Insecure SSL/TLS Protocols
  // =========================================================================
  const legacyProtocolsMatch = /\bSSLProtocol\s+[^\n]*(SSLv2|SSLv3|TLSv1\b|TLSv1\.0|TLSv1\.1)/i.test(combinedCleanContent);
  const protocolsConfigured = /\bSSLProtocol\s+/i.test(combinedCleanContent);
  const protocolsPassed = !legacyProtocolsMatch;
  const protoFiles = findMatchingFiles(/\bSSLProtocol\b/i);

  auditItems.push({
    id: 'sec-apache-ssl-protocols',
    category: 'ssl',
    title: 'غیرفعال‌سازی پروتکل‌های منسوخ و ناامن SSL/TLS',
    title_en: 'Disable Deprecated & Insecure SSL/TLS Protocols',
    severity: 'critical',
    passed: protocolsPassed,
    currentValue: legacyProtocolsMatch ? 'Legacy Protocols Enabled (SSLv3/TLSv1.0/TLSv1.1)' : protocolsConfigured ? 'Modern Only (TLSv1.2 TLSv1.3)' : 'Default Apache Protocols',
    recommendedValue: 'SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1',
    description: 'پروتکل‌های SSLv2, SSLv3, TLS 1.0 و TLS 1.1 منسوخ شده و دارای ضعف‌های ساختاری اثبات‌شده هستند.',
    description_en: 'Legacy protocol versions (SSLv3, TLS 1.0, TLS 1.1) are deprecated and contain fatal cryptographic flaws (POODLE, BEAST).',
    impact: 'مهاجمان می‌توانند ترافیک رمزگذاری‌شده با این پروتکل‌ها را رمزگشایی و شنود نمایند.',
    impact_en: 'Attackers can exploit legacy cryptographic flaws to break encryption and eavesdrop on sensitive sessions.',
    remediationSnippet: 'SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1',
    affectedFiles: protoFiles.length > 0 ? protoFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 9: SSL Cryptographic Cipher Suite Hardening
  // =========================================================================
  const weakCiphersMatch = /\bSSLCipherSuite\s+[^\n]*(RC4|3DES|DES|MD5|aNULL|EXPORT)/i.test(combinedCleanContent);
  const ciphersPassed = !weakCiphersMatch;
  const cipherFiles = findMatchingFiles(/\bSSLCipherSuite\b/i);

  auditItems.push({
    id: 'sec-apache-ssl-ciphers',
    category: 'ssl',
    title: 'سخت‌سازی الگوریتم‌های رمزنگاری (SSL Cipher Suite)',
    title_en: 'Secure Cryptographic Cipher Suite',
    severity: 'critical',
    passed: ciphersPassed,
    currentValue: weakCiphersMatch ? 'Weak Ciphers Detected' : 'No weak legacy ciphers detected',
    recommendedValue: 'SSLCipherSuite ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384\nSSLHonorCipherOrder on',
    description: 'الگوریتم‌های رمزنگاری (Ciphers) باید از نوع مدرن با پشتیبانی از Forward Secrecy و بدون سایفرهای آسیب‌پذیر مانند RC4 و 3DES باشند.',
    description_en: 'Cipher suites must enforce forward secrecy and eliminate obsolete, breakable ciphers like RC4, 3DES, and MD5.',
    impact: 'استفاده از سایفرهای ضعیف امنیت ارتباط را به شدت مخدوش کرده و امکان بازکردن کلیدها توسط مهاجمان را فراهم می‌کند.',
    impact_en: 'Weak ciphers allow passive adversaries to decrypt captured traffic or compromise session keys.',
    remediationSnippet: 'SSLCipherSuite ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384\nSSLHonorCipherOrder on',
    affectedFiles: cipherFiles.length > 0 ? cipherFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 10: Root Directory Access Restriction (<Directory /> Require all denied)
  // =========================================================================
  const rootDirRestricted = /<Directory\s+["']?\/["']?>[\s\S]*?(Require\s+all\s+denied|Deny\s+from\s+all)[\s\S]*?<\/Directory>/i.test(combinedCleanContent);
  const rootDirFiles = findMatchingFiles(/<Directory\s+["']?\/["']?>/i);

  auditItems.push({
    id: 'sec-apache-root-directory',
    category: 'access_control',
    title: 'مسدودسازی دسترسی پیش‌فرض به ریشه فایل‌سیستم (<Directory />)',
    title_en: 'Default Deny on Filesystem Root (<Directory /> Require all denied)',
    severity: 'critical',
    passed: rootDirRestricted,
    currentValue: rootDirRestricted ? 'Properly Restricted (Require all denied)' : 'Open or not explicitly restricted',
    recommendedValue: '<Directory />\n    AllowOverride None\n    Require all denied\n</Directory>',
    description: 'دایرکتوری ریشه کل سیستم‌عامل (/) باید به صورت پیش‌فرض در وب‌سرور مسدود باشد تا خطاهای کانفیگ VirtualHostها منجر به نشت فایل‌های سیستم نگردد.',
    description_en: 'The operating system root filesystem (/) must be set to deny by default to avoid unintended exposures of system directories.',
    impact: 'کانفیگ‌های اشتباه یا سم‌لینک‌ها می‌توانند فایل‌های حساس لینوکس مانند /etc/passwd یا /var/log را در دسترس اینترنت قرار دهند.',
    impact_en: 'Configuration oversights or symlink tricks could allow visitors to traverse into sensitive OS directories and files.',
    remediationSnippet: '<Directory />\n    AllowOverride None\n    Require all denied\n</Directory>',
    affectedFiles: rootDirFiles.length > 0 ? rootDirFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 11: Hidden & Sensitive Dotfiles Protection (.git, .env, .htaccess)
  // =========================================================================
  const dotfilesProtected = /<FilesMatch\s+["']?\^\\\.["']?>[\s\S]*?(Require\s+all\s+denied|Deny\s+from\s+all)[\s\S]*?<\/FilesMatch>/i.test(combinedCleanContent) ||
    /<DirectoryMatch\s+["']?\^\\\.["']?>/i.test(combinedCleanContent) ||
    /<Files\s+["']?\.ht["']?>/i.test(combinedCleanContent);
  const dotfilesFiles = findMatchingFiles(/FilesMatch|Files\s+["']?\.ht/i);

  auditItems.push({
    id: 'sec-apache-hidden-files',
    category: 'access_control',
    title: 'مسدودسازی دسترسی به فایل‌ها و پوشه‌های مخفی (.git, .env, .htaccess)',
    title_en: 'Block Access to Hidden & Sensitive Files (.git, .env, etc.)',
    severity: 'critical',
    passed: dotfilesProtected,
    currentValue: dotfilesProtected ? 'Protected' : 'No comprehensive dotfile block rule found',
    recommendedValue: '<FilesMatch "^\\.">\n    Require all denied\n</FilesMatch>',
    description: 'جلوگیری از دسترسی عمومی وب به فایل‌ها و پوشه‌هایی که با نقطه آغاز می‌شوند (مانند مخزن کدهای گیت .git یا متغیرهای محیطی .env).',
    description_en: 'Prevents web visitors from requesting hidden filesystem dotfiles such as version control repositories (.git) and secret files (.env).',
    impact: 'دانلود ناخواسته مخازن گیت یا فایل‌های .env منجر به افشای کامل سورس‌کد و کلمات عبور دیتابیس سامانه خواهد شد.',
    impact_en: 'Allows unauthorized downloads of entire Git repositories and environment files containing database passwords and secret API keys.',
    remediationSnippet: '<FilesMatch "^\\.">\n    Require all denied\n</FilesMatch>',
    affectedFiles: dotfilesFiles.length > 0 ? dotfilesFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 12: Backup, Source & Database Dump Files Leakage Protection
  // =========================================================================
  const backupFilesProtected = /FilesMatch\s+["']?[^"']*(?:bak|sql|swp|backup|old|conf~)/i.test(combinedCleanContent);
  const backupFilesList = findMatchingFiles(/FilesMatch.*(?:bak|sql|swp)/i);

  auditItems.push({
    id: 'sec-apache-backup-files',
    category: 'access_control',
    title: 'مسدودسازی دانلود فایل‌های پشتیبان و دامپ دیتابیس (.sql, .bak, .swp)',
    title_en: 'Block Access to Database Dumps & Backup Files (.sql, .bak, .swp)',
    severity: 'warning',
    passed: backupFilesProtected,
    currentValue: backupFilesProtected ? 'Protected' : 'Not configured',
    recommendedValue: '<FilesMatch "(?i:\\.(bak|config|sql|fla|psd|ini|log|sh|inc|swp|dist)|~)$">\n    Require all denied\n</FilesMatch>',
    description: 'جلوگیری از دسترسی عمومی به پسوندهای فایل‌های پشتیبان، دامپ‌های پایگاه داده و فایل‌های موقت ادیتورها در دایرکتوری وب.',
    description_en: 'Blocks web requests matching dangerous backup, archive, database dump, and editor swap extensions.',
    impact: 'توسعه‌دهندگان گاهی فایل‌های backup.sql یا index.php.bak را در روت سرور باقی می‌گذارند که توسط اسکنرها دانلود می‌شود.',
    impact_en: 'Developers frequently leave temporary backups like database.sql or config.php.bak in document roots, leading to critical database compromise.',
    remediationSnippet: '<FilesMatch "(?i:\\.(bak|config|sql|fla|psd|ini|log|sh|inc|swp|dist)|~)$">\n    Require all denied\n</FilesMatch>',
    affectedFiles: backupFilesList.length > 0 ? backupFilesList : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 13: Global Directory Indexing Disablement (Options -Indexes)
  // =========================================================================
  const indexesDisabled = /\bOptions\s+[^\n]*-Indexes\b/i.test(combinedCleanContent);
  const indexesFiles = findMatchingFiles(/Options\s+[^\n]*Indexes/i);

  auditItems.push({
    id: 'sec-apache-directory-indexes',
    category: 'access_control',
    title: 'غیرفعال‌سازی نمایش لیست فایل‌های پوشه (Options -Indexes)',
    title_en: 'Disable Directory Browsing Listing (Options -Indexes)',
    severity: 'warning',
    passed: indexesDisabled,
    currentValue: indexesDisabled ? 'Options -Indexes (Disabled)' : 'Not globally disabled (May list directory contents)',
    recommendedValue: '<Directory /var/www/>\n    Options -Indexes +FollowSymLinks\n    AllowOverride None\n    Require all granted\n</Directory>',
    description: 'در صورت عدم وجود فایل index.html یا index.php در یک پوشه، وب‌سرور آپاچی ممکن است لیست تمامی فایل‌های داخل آن پوشه را به کاربران نمایش دهد.',
    description_en: 'Disables automatic directory indexing, ensuring visitors cannot browse filesystem trees when no default index file exists.',
    impact: 'افشای اسامی فایل‌ها، تصاویر محرمانه و سورس‌کدها به مهاجمان در جهت شناسایی آسیب‌پذیری‌های وب‌سایت کمک می‌کند.',
    impact_en: 'Information disclosure that enables attackers to discover unlinked assets, admin scripts, and confidential uploads.',
    remediationSnippet: 'Options -Indexes',
    affectedFiles: indexesFiles.length > 0 ? indexesFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 14: Slowloris Timeouts Hardening (Timeout & KeepAlive)
  // =========================================================================
  const timeoutMatch = /\bTimeout\s+([0-9]+)\b/i.exec(combinedCleanContent);
  const timeoutVal = timeoutMatch ? parseInt(timeoutMatch[1], 10) : 300;
  const timeoutHardened = timeoutVal <= 60;
  const timeoutFiles = findMatchingFiles(/\b(Timeout|KeepAliveTimeout)\b/i);

  auditItems.push({
    id: 'sec-apache-timeouts',
    category: 'dos_limits',
    title: 'سخت‌سازی تایم‌اوت‌ها در برابر حملات اسلولوریس (Slowloris Timeout Hardening)',
    title_en: 'Timeout Hardening Against Slowloris HTTP DoS',
    severity: 'warning',
    passed: timeoutHardened,
    currentValue: `Timeout ${timeoutVal}s (Standard default is 300s)`,
    recommendedValue: 'Timeout 60\nKeepAlive On\nKeepAliveTimeout 5\nMaxKeepAliveRequests 100',
    description: 'تنظیم تایم‌اوت‌های سختگیرانه برای دریافت درخواست‌ها جهت آزادسازی سریع سوکت‌های راکد و ممانعت از پر شدن ظرفیت ورکرها.',
    description_en: 'Tightens Apache socket timeouts to promptly reclaim hanging sockets from slow-sending clients.',
    impact: 'مهاجم با ارسال قطره‌چکانی بایت‌ها کانکشن‌های وب‌سرور را برای مدت طولانی اشغال کرده و کل سرویس را از کار می‌اندازد.',
    impact_en: 'Slowloris attackers can open hundreds of connections and send partial bytes very slowly, exhausting all Apache worker slots.',
    remediationSnippet: 'Timeout 60\nKeepAlive On\nKeepAliveTimeout 5\nMaxKeepAliveRequests 100',
    affectedFiles: timeoutFiles.length > 0 ? timeoutFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 15: Client Request Body Size Limit (LimitRequestBody)
  // =========================================================================
  const limitReqBodyMatch = /\bLimitRequestBody\s+([0-9]+)\b/i.exec(combinedCleanContent);
  const limitReqBodyPassed = !!limitReqBodyMatch && parseInt(limitReqBodyMatch[1], 10) > 0;
  const limitReqFiles = findMatchingFiles(/\bLimitRequestBody\b/i);

  auditItems.push({
    id: 'sec-apache-request-limits',
    category: 'dos_limits',
    title: 'تعیین سقف حجم بدنه درخواست (LimitRequestBody)',
    title_en: 'Limit Maximum Request Body Size (LimitRequestBody)',
    severity: 'warning',
    passed: limitReqBodyPassed,
    currentValue: limitReqBodyMatch ? `LimitRequestBody ${limitReqBodyMatch[1]} bytes` : 'Unlimited / Not explicitly restricted (Defaults to 0)',
    recommendedValue: 'LimitRequestBody 16777216 # 16 MB limit',
    description: 'تعیین حداکثر حجم مجاز برای بادی درخواست‌های کلاینت (مانند آپلود فایل یا داده‌های POST) جهت جلوگیری از سرریز بافر.',
    description_en: 'Restricts the maximum number of bytes allowed in an HTTP request message body.',
    impact: 'نامحدود بودن بادی درخواست به مهاجم امکان می‌دهد با ارسال فایل‌های عظیم دیسک یا حافظه سرور را پر کرده و موجب خرابی سرویس شود.',
    impact_en: 'Allows attackers to exhaust server disk buffer space and memory through oversized file uploads.',
    remediationSnippet: 'LimitRequestBody 16777216',
    affectedFiles: limitReqFiles.length > 0 ? limitReqFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 16: Worker Process Unprivileged User Check
  // =========================================================================
  const isWorkerRoot = liveWorkerUser.toLowerCase() === 'root';
  const workerUserPassed = !isWorkerRoot && liveWorkerUser !== 'unknown';

  auditItems.push({
    id: 'sec-apache-worker-user',
    category: 'permissions',
    title: 'اجرای ورکرها بدون دسترسی روت (Unprivileged Worker User)',
    title_en: 'Run Worker Processes as Non-Root User',
    severity: 'critical',
    passed: workerUserPassed,
    currentValue: `Master: ${liveMasterUser}, Worker: ${liveWorkerUser}`,
    recommendedValue: 'User www-data\nGroup www-data # or User apache / Group apache',
    description: 'پروسه‌های پردازش ترافیک آپاچی باید منحصراً با یک حساب بدون دسترسی ممتاز سیستمی (مانند www-data یا apache) اجرا شوند.',
    description_en: 'Worker child processes must execute under an unprivileged system account, never as root.',
    impact: 'اجرای پروسه ترافیک وب با دسترسی روت، در صورت بروز هرگونه باگ سرریز حافظه یا RCE منجر به تسخیر کامل سرور لینوکس می‌شود.',
    impact_en: 'If workers run as root, any remote code execution vulnerability in Apache grants attackers immediate root-level takeover of the server.',
    remediationSnippet: 'User ${APACHE_RUN_USER}\nGroup ${APACHE_RUN_GROUP}',
    affectedFiles: [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 17: SSL Private Key Permissions
  // =========================================================================
  const worldReadableKey = /-[rwx-]{6}r[w-][x-]/i.test(sslKeysPermsOutput);
  const keyPermsPassed = !worldReadableKey;

  auditItems.push({
    id: 'sec-apache-key-permissions',
    category: 'permissions',
    title: 'امنیت مجوزهای فایل کلید خصوصی گواهینامه (SSL Key Permissions)',
    title_en: 'SSL Private Key Filesystem Permissions',
    severity: 'critical',
    passed: keyPermsPassed,
    currentValue: sslKeysPermsOutput ? sslKeysPermsOutput.split('\n')[0] : 'No private keys found or permissions safe',
    recommendedValue: 'chmod 600 /etc/ssl/private/*.key',
    description: 'کلیدهای خصوصی گواهینامه‌های SSL باید منحصراً توسط کاربر روت یا آپاچی قابل خواندن باشند و دسترسی خواندن برای سایرین (World-Readable) مسدود باشد.',
    description_en: 'SSL private keys must only be readable by root or the apache process owner, with zero read permissions for other unprivileged system users.',
    impact: 'کلیدهای خصوصی با دسترسی باز می‌توانند توسط سایر کاربران یا سرویس‌های هک‌شده روی سرور به سرقت رفته و امکان شنود ترافیک را فراهم کنند.',
    impact_en: 'World-readable private keys allow any local user or compromised service on the server to steal the key and impersonate your domain.',
    remediationSnippet: 'chmod 600 /etc/ssl/private/*.key /etc/apache2/ssl/*.key',
    affectedFiles: [],
  });

  // =========================================================================
  // RULE 18: World-Writable Apache Configuration Files
  // =========================================================================
  const worldWritableConf = /-[rwx-]{8}w/i.test(confPermsOutput);
  const confPermsPassed = !worldWritableConf;

  auditItems.push({
    id: 'sec-apache-config-permissions',
    category: 'permissions',
    title: 'مسدودسازی دسترسی ویرایش همگانی کانفیگ (World-Writable Config)',
    title_en: 'Prevent World-Writable Apache Configurations',
    severity: 'critical',
    passed: confPermsPassed,
    currentValue: confPermsOutput ? confPermsOutput.split('\n')[0] : 'Properly restricted (644 / 755)',
    recommendedValue: 'chmod 644 /etc/apache2/apache2.conf',
    description: 'فایل‌های پیکربندی آپاچی نباید برای سایر کاربران عادی سرور دسترسی نوشتن (Write) داشته باشند.',
    description_en: 'Apache configuration files must strictly forbid write access to unprivileged world users.',
    impact: 'دسترسی نوشتن همگانی به مهاجمین یا بدافزارهای محلی اجازه می‌دهد فایل کانفیگ را دستکاری کرده و فرامین مخرب تزریق کنند.',
    impact_en: 'Allows any unprivileged local process to inject malicious reverse proxies or code execution directives into the web server.',
    remediationSnippet: 'chmod 644 /etc/apache2/apache2.conf && chown -R root:root /etc/apache2',
    affectedFiles: [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 19: SymLink Protection (SymLinksIfOwnerMatch)
  // =========================================================================
  const plainFollowSymLinks = /\bOptions\s+[^\n]*\+?FollowSymLinks\b/i.test(combinedCleanContent) && !/\bSymLinksIfOwnerMatch\b/i.test(combinedCleanContent);
  const symlinksPassed = !plainFollowSymLinks;
  const symlinkFiles = findMatchingFiles(/\bFollowSymLinks\b/i);

  auditItems.push({
    id: 'sec-apache-symlinks',
    category: 'access_control',
    title: 'امنیت پیوندهای نمادین (SymLinksIfOwnerMatch)',
    title_en: 'Symbolic Links Ownership Protection (SymLinksIfOwnerMatch)',
    severity: 'info',
    passed: symlinksPassed,
    currentValue: plainFollowSymLinks ? 'FollowSymLinks (Unrestricted)' : 'SymLinksIfOwnerMatch or Restricted',
    recommendedValue: 'Options -FollowSymLinks +SymLinksIfOwnerMatch',
    description: 'جلوگیری از دور زدن محدودیت‌های دایرکتوری وب توسط سم‌لینک‌هایی که مالک آنها با مالک فایل هدف متفاوت است.',
    description_en: 'Ensures Apache only follows symbolic links if the target file is owned by the same user as the link.',
    impact: 'کاربران می‌توانند با ساخت سم‌لینک در دایرکتوری وب خود به فایل‌های سایر کاربران یا فایل‌های سیستم‌عامل دسترسی پیدا کنند.',
    impact_en: 'Untrusted local users can link to sensitive external files to bypass document root restrictions.',
    remediationSnippet: 'Options -FollowSymLinks +SymLinksIfOwnerMatch',
    affectedFiles: symlinkFiles.length > 0 ? symlinkFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 20: Slowloris Request Read Timeout Module (mod_reqtimeout)
  // =========================================================================
  const reqTimeoutMatch = /\bRequestReadTimeout\b/i.test(combinedCleanContent);
  const reqTimeoutPassed = reqTimeoutMatch || discovery.loadedModules.includes('mod_reqtimeout') || discovery.loadedModules.includes('reqtimeout');
  const reqTimeoutFiles = findMatchingFiles(/\bRequestReadTimeout\b/i);

  auditItems.push({
    id: 'sec-apache-reqtimeout-module',
    category: 'dos_limits',
    title: 'ماژول مقابله با حملات ارسال قطره‌چکانی (mod_reqtimeout)',
    title_en: 'Slow Client Mitigation Module (mod_reqtimeout)',
    severity: 'warning',
    passed: reqTimeoutPassed,
    currentValue: reqTimeoutPassed ? 'Active / Configured' : 'Missing / Inactive',
    recommendedValue: 'RequestReadTimeout header=20-40,MinRate=500 body=20,MinRate=500',
    description: 'ماژول mod_reqtimeout مدت زمان خواندن هدر و بدنه درخواست از کلاینت‌های کند را به صورت خودکار پایش و کانکشن‌های مشکوک را قطع می‌کند.',
    description_en: 'Configures mod_reqtimeout to monitor and set minimum transfer rates for incoming request headers and bodies.',
    impact: 'بدون این ماژول، سرور در برابر ابزارهای DoS نظیر Slowloris و Slow HTTP POST آسیب‌پذیر باقی می‌ماند.',
    impact_en: 'Leaves the web server exposed to resource exhaustion from Slowloris and Slow HTTP POST attacks.',
    remediationSnippet: 'RequestReadTimeout header=20-40,MinRate=500 body=20,MinRate=500',
    affectedFiles: reqTimeoutFiles.length > 0 ? reqTimeoutFiles : [topology.mainConfigPath],
  });

  // Calculate Scores & Metrics
  let baseScore = 100;
  let passedCount = 0;
  let warningCount = 0;
  let criticalCount = 0;
  let infoCount = 0;

  for (const item of auditItems) {
    if (item.passed) {
      passedCount++;
    } else {
      if (item.severity === 'critical') {
        criticalCount++;
        baseScore -= 15;
      } else if (item.severity === 'warning') {
        warningCount++;
        baseScore -= 7;
      } else {
        infoCount++;
        baseScore -= 2;
      }
    }
  }

  const overallScore = Math.max(0, Math.min(100, Math.round(baseScore)));

  // Generate Suggested Production Hardening Snippet
  const suggestedHardeningSnippet = `# =========================================================================
# NetTopology Production Security Hardening Profile for Apache HTTP Server
# Aligned with CIS Apache Benchmark & OWASP Best Practices
# =========================================================================

# 1. Information Disclosure Protection
ServerTokens Prod
ServerSignature Off
TraceEnable Off

# 2. Global Security Headers (Requires mod_headers)
<IfModule mod_headers.c>
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    Header always set Permissions-Policy "geolocation=(), microphone=(), camera=()"
    Header always set Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'; frame-ancestors 'self';"
</IfModule>

# 3. Restrict Operating System Root Directory Traversal
<Directory />
    AllowOverride None
    Require all denied
</Directory>

# 4. Block Hidden & Version Control Files (.git, .env, .svn, .htaccess)
<FilesMatch "^\\.">
    Require all denied
</FilesMatch>

# 5. Block Sensitive Backup, Config & Database Dump Files
<FilesMatch "(?i:\\.(bak|config|sql|fla|psd|ini|log|sh|inc|swp|dist)|~)$">
    Require all denied
</FilesMatch>

# 6. Slowloris & Request Buffer DoS Defense
Timeout 60
KeepAlive On
KeepAliveTimeout 5
MaxKeepAliveRequests 100
LimitRequestBody 16777216

<IfModule mod_reqtimeout.c>
    RequestReadTimeout header=20-40,MinRate=500 body=20,MinRate=500
</IfModule>

# 7. Modern SSL/TLS Cryptographic Security (Requires mod_ssl)
<IfModule mod_ssl.c>
    SSLProtocol all -SSLv2 -SSLv3 -TLSv1 -TLSv1.1
    SSLCipherSuite ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384
    SSLHonorCipherOrder on
    SSLSessionTickets off
</IfModule>
`;

  return {
    testedAt,
    totalChecks: auditItems.length,
    passedCount,
    warningCount,
    criticalCount,
    infoCount,
    overallScore,
    runtimeWorkerUser: liveWorkerUser,
    runtimeMasterUser: liveMasterUser,
    discoveredInstances: discovery.instances || [],
    activeInstanceConf: chosenConf,
    items: auditItems,
    suggestedHardeningSnippet,
  };
}

/**
 * Safely applies Apache security hardening configuration file with backup,
 * syntax verification, and atomic rollback upon any errors.
 */
export async function applyApacheSecurityHardening(
  server: RemoteServer,
  targetFilePath?: string,
  customContent?: string,
  ephemeralPassword?: string
): Promise<ApacheSecurityApplyFixResult> {
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);

  // Determine standard hardening file path based on detected distribution
  let filePath = targetFilePath;
  if (!filePath) {
    if (discovery.osFamily === 'debian') {
      filePath = '/etc/apache2/conf-available/security-hardening.conf';
    } else if (discovery.osFamily === 'rhel' || discovery.osFamily === 'alpine') {
      filePath = '/etc/httpd/conf.d/security-hardening.conf';
    } else {
      filePath = discovery.confPath || '/etc/apache2/conf-available/security-hardening.conf';
    }
  }

  const safeTarget = assertSafeApachePath(filePath);

  // Content to apply
  let contentToSave = customContent;
  if (!contentToSave) {
    const auditReport = await performApacheSecurityAudit(server, ephemeralPassword, discovery.confPath);
    contentToSave = auditReport.suggestedHardeningSnippet;
  }

  // Save safely using our atomic safe editor
  const saveResult = await saveApacheConfigFileSafe(
    server,
    safeTarget,
    contentToSave,
    true, // autoReload
    ephemeralPassword
  );

  // On Debian/Ubuntu, if saved in conf-available, also enable via a2enconf if possible
  if (saveResult.success && safeTarget.includes('conf-available')) {
    try {
      const enableScript = `if command -v a2enconf >/dev/null 2>&1; then
        a2enconf security-hardening 2>&1 || true
        systemctl reload ${discovery.serviceName || 'apache2'} 2>&1 || true
      fi`;
      await runAdaptiveSshCommand(server, enableScript, ephemeralPassword, 8000);
    } catch {
      // Best effort
    }
  }

  return {
    success: saveResult.success,
    filePath: saveResult.filePath,
    backupCreated: saveResult.backupCreated,
    syntaxTestPassed: saveResult.syntaxTestPassed,
    syntaxOutput: saveResult.syntaxOutput,
    serviceReloaded: saveResult.serviceReloaded,
    reloadOutput: saveResult.reloadOutput,
    error: saveResult.error,
  };
}
