import { RemoteServer } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { discoverNginxInstallation } from './nginxDiscovery';
import { discoverNginxConfigTopology } from './nginxConfigParser';
import { saveNginxConfigFileSafe } from './nginxSafeEditor';
import {
  NginxSecurityAuditReport,
  NginxSecurityAuditItem,
  NginxSecurityCategory,
  NginxSecuritySeverity,
  NginxSecurityApplyFixResult,
} from '../src/types';

/**
 * Shell script to inspect live runtime user, process hierarchy, and sensitive file permissions.
 */
const LIVE_SECURITY_INSPECTION_SCRIPT = `export LC_ALL=C
echo "===WORKER_USER==="
ps -eo user,comm,args 2>/dev/null | grep -E "nginx: worker" | grep -v grep | head -n 1 | awk '{print $1}' || echo "unknown"
echo "===MASTER_USER==="
ps -eo user,comm,args 2>/dev/null | grep -E "nginx: master" | grep -v grep | head -n 1 | awk '{print $1}' || echo "unknown"
echo "===CONF_PERMS==="
ls -ld /etc/nginx 2>/dev/null || true
ls -l /etc/nginx/nginx.conf 2>/dev/null || true
echo "===SSL_KEY_PERMS==="
find /etc/nginx /etc/ssl /etc/letsencrypt -type f \\( -name "*.key" -o -name "*privkey*.pem" \\) -exec ls -ld {} + 2>/dev/null | head -n 10 || true
echo "===END_LIVE_SEC==="
`;

/**
 * Strips comments from Nginx configuration text for precise directive parsing.
 */
function stripNginxComments(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('#');
      return idx >= 0 ? line.substring(0, idx) : line;
    })
    .join('\n');
}

/**
 * Performs a comprehensive security audit of the Nginx configuration and live environment.
 */
export async function performNginxSecurityAudit(
  server: RemoteServer,
  ephemeralPassword?: string,
  targetConfPath?: string
): Promise<NginxSecurityAuditReport> {
  const testedAt = new Date().toISOString();

  // 1. Discover basic installation topology
  const discovery = await discoverNginxInstallation(server, ephemeralPassword, { targetConfPath });

  // 2. Discover full configuration include topology
  const topology = await discoverNginxConfigTopology(
    server,
    ephemeralPassword,
    targetConfPath || discovery.confPath,
    discovery.prefixPath
  );

  // 3. Inspect live process permissions
  let liveWorkerUser = 'unknown';
  let liveMasterUser = 'root';
  let confPermsOutput = '';
  let sslKeysPermsOutput = '';

  try {
    const liveOut = await runAdaptiveSshCommand(server, LIVE_SECURITY_INSPECTION_SCRIPT, ephemeralPassword, 10000);
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
      sslKeysPermsOutput = liveOut.split('===SSL_KEY_PERMS===')[1].split('===END_LIVE_SEC===')[0].trim();
    }
  } catch (err: any) {
    console.warn('[Nginx Live Security Inspection SSH Error]:', err?.message || err);
  }

  // 4. Combine all configuration content for static AST/pattern auditing
  let combinedCleanContent = '';
  const fileContentMap = new Map<string, string>();

  for (const node of topology.files) {
    const rawContent = node.fullContent || node.contentSnippet || '';
    const clean = stripNginxComments(rawContent);
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

  const auditItems: NginxSecurityAuditItem[] = [];

  // =========================================================================
  // RULE 1: Server Tokens Information Leakage
  // =========================================================================
  const serverTokensOffMatch = /\bserver_tokens\s+off\s*;/i.test(combinedCleanContent);
  const serverTokensOnMatch = /\bserver_tokens\s+on\s*;/i.test(combinedCleanContent);
  const serverTokensPassed = serverTokensOffMatch;
  const serverTokensFiles = findMatchingFiles(/\bserver_tokens\s+/i);

  auditItems.push({
    id: 'sec-server-tokens',
    category: 'information_disclosure',
    title: 'پنهان‌سازی اطلاعات نسخه در هدر و صفحات خطا (server_tokens off)',
    title_en: 'Hide Server Version Banner (server_tokens off)',
    severity: 'warning',
    passed: serverTokensPassed,
    currentValue: serverTokensOffMatch ? 'server_tokens off;' : serverTokensOnMatch ? 'server_tokens on;' : 'Not defined (defaults to on)',
    recommendedValue: 'server_tokens off;',
    description: 'دایرکتیو server_tokens مشخص می‌کند که آیا نسخه دقیق Nginx در هدر Server پاسخ‌های HTTP و صفحات خطای پیش‌فرض نمایش داده شود یا خیر.',
    description_en: 'The server_tokens directive controls whether the exact Nginx version is broadcasted in HTTP response headers and default error pages.',
    impact: 'نمایش نسخه وب‌سرور به مهاجمان امکان می‌دهد آسیب‌پذیری‌های امنیتی شناخته‌شده (CVE) مربوط به آن نگارش را فوراً شناسایی و هدف قرار دهند.',
    impact_en: 'Broadcasting the exact Nginx version allows malicious actors to quickly target known version-specific Common Vulnerabilities and Exposures (CVEs).',
    remediationSnippet: 'server_tokens off;',
    affectedFiles: serverTokensFiles.length > 0 ? serverTokensFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 2: Clickjacking Protection (X-Frame-Options)
  // =========================================================================
  const xFrameMatch = /\badd_header\s+X-Frame-Options\s+["']?(DENY|SAMEORIGIN)["']?/i.test(combinedCleanContent);
  const xFrameFiles = findMatchingFiles(/\badd_header\s+X-Frame-Options\b/i);

  auditItems.push({
    id: 'sec-x-frame-options',
    category: 'headers',
    title: 'محافظت در برابر کلیک‌جکینگ (X-Frame-Options)',
    title_en: 'Clickjacking Protection (X-Frame-Options)',
    severity: 'warning',
    passed: xFrameMatch,
    currentValue: xFrameMatch ? 'Configured (DENY / SAMEORIGIN)' : 'Missing',
    recommendedValue: 'add_header X-Frame-Options "SAMEORIGIN" always;',
    description: 'هدر امنیتی X-Frame-Options مانع از بارگذاری صفحات وب‌سایت در داخل فریم‌ها و iframeهای وب‌سایت‌های دیگر می‌شود.',
    description_en: 'The X-Frame-Options HTTP response header indicates whether a browser should be allowed to render a page in a <frame>, <iframe>, <embed> or <object>.',
    impact: 'عدم وجود این هدر امکان حمله کلیک‌جکینگ (UI Redressing) را فراهم می‌کند که طی آن کاربر به طور ناخواسته فریب خورده و روی المان‌های حساس کلیک می‌کند.',
    impact_en: 'Without this header, malicious third-party sites can frame your application in invisible IFrames to execute UI redressing / clickjacking attacks.',
    remediationSnippet: 'add_header X-Frame-Options "SAMEORIGIN" always;',
    affectedFiles: xFrameFiles.length > 0 ? xFrameFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 3: MIME Type Confusion Defense (X-Content-Type-Options)
  // =========================================================================
  const xContentTypeMatch = /\badd_header\s+X-Content-Type-Options\s+["']?nosniff["']?/i.test(combinedCleanContent);
  const xContentTypeFiles = findMatchingFiles(/\badd_header\s+X-Content-Type-Options\b/i);

  auditItems.push({
    id: 'sec-x-content-type-options',
    category: 'headers',
    title: 'جلوگیری از تشخیص اشتباه نوع فایل (X-Content-Type-Options nosniff)',
    title_en: 'MIME Sniffing Prevention (X-Content-Type-Options nosniff)',
    severity: 'warning',
    passed: xContentTypeMatch,
    currentValue: xContentTypeMatch ? 'nosniff' : 'Missing',
    recommendedValue: 'add_header X-Content-Type-Options "nosniff" always;',
    description: 'این هدر مرورگرها را ملزم به پایبندی به MIME-type اعلام‌شده توسط سرور کرده و از حدس زدن و Sniff کردن نوع فایل ممانعت می‌کند.',
    description_en: 'Prevents browsers from MIME-sniffing a response away from the declared content-type, reducing drive-by download risks.',
    impact: 'مرورگر ممکن است فایلی مانند تصویر آپلودشده توسط کاربر را به عنوان اسکریپت جاوااسکریپت اجرا کند و حمله XSS رخ دهد.',
    impact_en: 'Browsers may interpret user-uploaded non-executable files (like images) as executable JavaScript, resulting in stored Cross-Site Scripting.',
    remediationSnippet: 'add_header X-Content-Type-Options "nosniff" always;',
    affectedFiles: xContentTypeFiles.length > 0 ? xContentTypeFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 4: Content Security Policy (CSP)
  // =========================================================================
  const cspMatch = /\badd_header\s+Content-Security-Policy\b/i.test(combinedCleanContent);
  const cspFiles = findMatchingFiles(/\badd_header\s+Content-Security-Policy\b/i);

  auditItems.push({
    id: 'sec-content-security-policy',
    category: 'headers',
    title: 'سیاست امنیت محتوا (Content-Security-Policy)',
    title_en: 'Content Security Policy (CSP)',
    severity: 'info',
    passed: cspMatch,
    currentValue: cspMatch ? 'Configured' : 'Missing',
    recommendedValue: `add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'; frame-ancestors 'self';" always;`,
    description: 'سیاست امنیت محتوا (CSP) یک لایه امنیتی قدرتمند برای شناسایی و خنثی‌سازی انواع خاصی از حملات از جمله تزریق کد (XSS) و داده است.',
    description_en: 'Content Security Policy (CSP) provides a powerful defensive layer that restricts which resources the browser is allowed to load for a given page.',
    impact: 'نبود CSP موجب می‌شود در صورت وجود کوچک‌ترین باگ در اپلیکیشن وب، اسکریپت‌های مهاجم به راحتی بارگذاری و اجرا شوند.',
    impact_en: 'Without CSP, any stored or reflected injection vulnerability in the web application can be freely exploited by malicious external scripts.',
    remediationSnippet: `add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'; frame-ancestors 'self';" always;`,
    affectedFiles: cspFiles.length > 0 ? cspFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 5: Legacy XSS Filter (X-XSS-Protection)
  // =========================================================================
  const xssFilterMatch = /\badd_header\s+X-XSS-Protection\b/i.test(combinedCleanContent);
  const xssFilterFiles = findMatchingFiles(/\badd_header\s+X-XSS-Protection\b/i);

  auditItems.push({
    id: 'sec-x-xss-protection',
    category: 'headers',
    title: 'فیلتر امنیتی مرورگرهای قدیمی (X-XSS-Protection)',
    title_en: 'Legacy Browser XSS Protection Filter',
    severity: 'info',
    passed: xssFilterMatch,
    currentValue: xssFilterMatch ? 'Configured' : 'Missing',
    recommendedValue: 'add_header X-XSS-Protection "1; mode=block" always;',
    description: 'فعال‌سازی فیلتر ضد XSS مرورگرهای قدیمی‌تر جهت مسدودسازی صفحات در صورت تشخیص تزریق اسکریپت انعکاسی.',
    description_en: 'Configures legacy browser XSS auditing filters to stop page rendering when reflected Cross-Site Scripting is detected.',
    impact: 'مرورگرهای قدیمی در برابر حملات XSS انعکاسی محافظت نخواهند شد.',
    impact_en: 'Legacy browser clients will lack baseline reflected XSS filtering defense.',
    remediationSnippet: 'add_header X-XSS-Protection "1; mode=block" always;',
    affectedFiles: xssFilterFiles.length > 0 ? xssFilterFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 6: Referrer Policy
  // =========================================================================
  const referrerMatch = /\badd_header\s+Referrer-Policy\b/i.test(combinedCleanContent);
  const referrerFiles = findMatchingFiles(/\badd_header\s+Referrer-Policy\b/i);

  auditItems.push({
    id: 'sec-referrer-policy',
    category: 'headers',
    title: 'سیاست کنترل هدر ارجاع‌دهنده (Referrer-Policy)',
    title_en: 'Referrer Policy Control',
    severity: 'info',
    passed: referrerMatch,
    currentValue: referrerMatch ? 'Configured' : 'Missing',
    recommendedValue: 'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
    description: 'تنظیم میزان اطلاعات ارجاعی (URL و کوئری استرینگ‌ها) که مرورگر هنگام کلیک روی لینک‌ها به سایت‌های دیگر ارسال می‌کند.',
    description_en: 'Specifies how much referrer information (like URL parameters and private tokens) is included with requests.',
    impact: 'لینک‌های خروجی ممکن است مسیرهای داخلی، شناسه‌های جلسه یا پارامترهای حساس را به دامنه‌های خارجی لو دهند.',
    impact_en: 'External links may leak sensitive internal URL paths, session IDs, or private query parameters to third-party domains.',
    remediationSnippet: 'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
    affectedFiles: referrerFiles.length > 0 ? referrerFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 7: HSTS (HTTP Strict Transport Security)
  // =========================================================================
  const hstsMatch = /\badd_header\s+Strict-Transport-Security\b/i.test(combinedCleanContent);
  const hasSslConfigured = /\bssl_certificate\b/i.test(combinedCleanContent) || /\blisten\s+[^\n;]*\bssl\b/i.test(combinedCleanContent);
  const hstsPassed = !hasSslConfigured || hstsMatch;
  const hstsFiles = findMatchingFiles(/\badd_header\s+Strict-Transport-Security\b/i);

  auditItems.push({
    id: 'sec-hsts',
    category: 'headers',
    title: 'اجبار اتصال دائم از طریق پروتکل امن (HSTS)',
    title_en: 'HTTP Strict Transport Security (HSTS)',
    severity: 'warning',
    passed: hstsPassed,
    currentValue: hstsMatch ? 'Configured' : hasSslConfigured ? 'Missing on SSL Hosts' : 'N/A (No SSL Hosts)',
    recommendedValue: 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;',
    description: 'هدر HSTS به مرورگرها اعلام می‌کند که ارتباط با این دامنه منحصراً باید از طریق HTTPS برقرار شود و نسخه‌های غیرامن HTTP مجاز نیستند.',
    description_en: 'HSTS instructs browsers to only interact with the website using HTTPS connections, preventing insecure HTTP fallbacks.',
    impact: 'کاربران در معرض حملات استراق سمع، مرد میانی (MitM) و تنزل پروتکل امن (SSL Stripping) قرار خواهند گرفت.',
    impact_en: 'Allows Man-in-the-Middle (MitM) attackers to perform SSL Stripping attacks, downgrading HTTPS traffic to unencrypted plaintext HTTP.',
    remediationSnippet: 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;',
    affectedFiles: hstsFiles.length > 0 ? hstsFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 8: Insecure SSL/TLS Protocols
  // =========================================================================
  const legacyProtocolsMatch = /\bssl_protocols\s+[^\n;]*(SSLv2|SSLv3|TLSv1\b|TLSv1\.0|TLSv1\.1)/i.test(combinedCleanContent);
  const sslProtocolsConfigured = /\bssl_protocols\s+/i.test(combinedCleanContent);
  const protocolsPassed = !legacyProtocolsMatch;
  const protoFiles = findMatchingFiles(/\bssl_protocols\b/i);

  auditItems.push({
    id: 'sec-ssl-protocols',
    category: 'ssl',
    title: 'غیرفعال‌سازی پروتکل‌های منسوخ و ناامن SSL/TLS',
    title_en: 'Disable Deprecated & Insecure SSL/TLS Protocols',
    severity: 'critical',
    passed: protocolsPassed,
    currentValue: legacyProtocolsMatch ? 'Legacy Protocols Enabled (SSLv3/TLSv1.0/TLSv1.1)' : sslProtocolsConfigured ? 'Modern Only (TLSv1.2 TLSv1.3)' : 'Default Nginx protocols',
    recommendedValue: 'ssl_protocols TLSv1.2 TLSv1.3;',
    description: 'پروتکل‌های SSLv2, SSLv3, TLS 1.0 و TLS 1.1 منسوخ شده و دارای ضعف‌های ساختاری اثبات‌شده هستند.',
    description_en: 'Legacy protocol versions (SSLv3, TLS 1.0, TLS 1.1) are deprecated and contain fatal cryptographic flaws (POODLE, BEAST).',
    impact: 'مهاجمان می‌توانند ترافیک رمزگذاری‌شده با این پروتکل‌ها را رمزگشایی و شنود نمایند.',
    impact_en: 'Attackers can exploit legacy cryptographic flaws to break encryption and eavesdrop on sensitive sessions.',
    remediationSnippet: 'ssl_protocols TLSv1.2 TLSv1.3;',
    affectedFiles: protoFiles.length > 0 ? protoFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 9: Deprecated / Insecure Ciphers
  // =========================================================================
  const weakCiphersMatch = /\bssl_ciphers\s+[^\n;]*(RC4|3DES|DES|MD5|aNULL|EXPORT)/i.test(combinedCleanContent);
  const ciphersPassed = !weakCiphersMatch;
  const cipherFiles = findMatchingFiles(/\bssl_ciphers\b/i);

  auditItems.push({
    id: 'sec-ssl-ciphers',
    category: 'ssl',
    title: 'سخت‌سازی الگوریتم‌های رمزنگاری (SSL Ciphers Suite)',
    title_en: 'Secure Cryptographic Cipher Suite',
    severity: 'critical',
    passed: ciphersPassed,
    currentValue: weakCiphersMatch ? 'Weak Ciphers Detected' : 'No weak legacy ciphers detected',
    recommendedValue: `ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';`,
    description: 'الگوریتم‌های رمزنگاری (Ciphers) باید از نوع مدرن با پشتیبانی از Forward Secrecy و بدون سایفرهای آسیب‌پذیر مانند RC4 و 3DES باشند.',
    description_en: 'Cipher suites must enforce forward secrecy and eliminate obsolete, breakable ciphers like RC4, 3DES, and MD5.',
    impact: 'استفاده از سایفرهای ضعیف امنیت ارتباط را به شدت مخدوش کرده و امکان بازکردن کلیدها توسط مهاجمان را فراهم می‌کند.',
    impact_en: 'Weak ciphers allow passive adversaries to decrypt captured traffic or compromise session keys.',
    remediationSnippet: `ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';\nssl_prefer_server_ciphers off;`,
    affectedFiles: cipherFiles.length > 0 ? cipherFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 10: OCSP Stapling
  // =========================================================================
  const ocspMatch = /\bssl_stapling\s+on\s*;/i.test(combinedCleanContent);
  const ocspPassed = !hasSslConfigured || ocspMatch;
  const ocspFiles = findMatchingFiles(/\bssl_stapling\b/i);

  auditItems.push({
    id: 'sec-ocsp-stapling',
    category: 'ssl',
    title: 'بهینه‌سازی و حفظ حریم خصوصی استعلام گواهینامه (OCSP Stapling)',
    title_en: 'OCSP Stapling & Certificate Revocation Optimization',
    severity: 'info',
    passed: ocspPassed,
    currentValue: ocspMatch ? 'ssl_stapling on;' : hasSslConfigured ? 'Disabled' : 'N/A (No SSL)',
    recommendedValue: 'ssl_stapling on;\nssl_stapling_verify on;\nresolver 1.1.1.1 8.8.8.8 valid=300s;\nresolver_timeout 5s;',
    description: 'مکانیسم OCSP Stapling به وب‌سرور امکان می‌دهد وضعیت اعتبارسنجی سرتیفیکیت را در حین Handshake به مرورگر تحویل دهد.',
    description_en: 'Delivers pre-validated certificate revocation status directly during TLS handshake, speeding up handshakes and protecting visitor privacy.',
    impact: 'عدم فعال‌سازی باعث کندی اتصال امن TLS و ارسال مستقیم استعلام کاربر به سرورهای CA می‌شود.',
    impact_en: 'Slows down SSL handshakes and forces client browsers to send direct DNS/HTTP queries to the CA, leaking visitor browsing history.',
    remediationSnippet: 'ssl_stapling on;\nssl_stapling_verify on;\nresolver 1.1.1.1 8.8.8.8 valid=300s;\nresolver_timeout 5s;',
    affectedFiles: ocspFiles.length > 0 ? ocspFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 11: Client Body Size Limit (Buffer & DoS Defense)
  // =========================================================================
  const bodySizeMatch = /\bclient_max_body_size\s+([0-9]+[kmg]?)\s*;/i.exec(combinedCleanContent);
  const bodySizeValue = bodySizeMatch ? bodySizeMatch[1] : undefined;
  const bodySizePassed = !!bodySizeValue && bodySizeValue !== '0';
  const bodySizeFiles = findMatchingFiles(/\bclient_max_body_size\b/i);

  auditItems.push({
    id: 'sec-client-body-size',
    category: 'dos_limits',
    title: 'تعیین سقف حجم بدنه درخواست (client_max_body_size)',
    title_en: 'Limit Maximum Request Body Size (client_max_body_size)',
    severity: 'warning',
    passed: bodySizePassed,
    currentValue: bodySizeValue ? `client_max_body_size ${bodySizeValue};` : 'Not explicitly set (defaults to 1m, or unlimited if 0)',
    recommendedValue: 'client_max_body_size 16M;',
    description: 'سقف حداکثر حجم مجاز برای بادی درخواست‌های کلاینت (مانند آپلود فایل یا ارسال داده‌های POST).',
    description_en: 'Sets the maximum allowed size of the client request body, specified in the Content-Length request header.',
    impact: 'نامحدود بودن یا سقف بسیار بزرگ، سرور را در برابر حملات سرریز بافر و پر شدن حافظه یا دیسک آسیب‌پذیر می‌کند.',
    impact_en: 'Unrestricted body sizes allow attackers to exhaust server disk buffer space and memory via volumetric file uploads.',
    remediationSnippet: 'client_max_body_size 16M;',
    affectedFiles: bodySizeFiles.length > 0 ? bodySizeFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 12: Slowloris Timeouts Hardening
  // =========================================================================
  const timeoutBodyMatch = /\bclient_body_timeout\b/i.test(combinedCleanContent);
  const timeoutHeaderMatch = /\bclient_header_timeout\b/i.test(combinedCleanContent);
  const timeoutsPassed = timeoutBodyMatch && timeoutHeaderMatch;
  const timeoutFiles = findMatchingFiles(/\b(client_body_timeout|client_header_timeout|keepalive_timeout)\b/i);

  auditItems.push({
    id: 'sec-timeouts-hardening',
    category: 'dos_limits',
    title: 'سخت‌سازی تایم‌اوت‌ها در برابر حملات اسلولوریس (Slowloris Defense)',
    title_en: 'Timeout Hardening Against Slowloris HTTP DoS',
    severity: 'warning',
    passed: timeoutsPassed,
    currentValue: timeoutsPassed ? 'Configured explicitly' : 'Default / Not hardened',
    recommendedValue: 'client_body_timeout 12s;\nclient_header_timeout 12s;\nkeepalive_timeout 15s;\nsend_timeout 10s;',
    description: 'تنظیم تایم‌اوت‌های سختگیرانه برای دریافت هدرها و بدنه درخواست جهت آزادسازی سریع سوکت‌های راکد.',
    description_en: 'Tightens client request header and body timeouts to promptly reclaim hanging sockets from slow clients.',
    impact: 'مهاجم با ارسال قطره‌چکانی بایت‌ها کانکشن‌های وب‌سرور را برای مدت طولانی اشغال کرده و کل سرویس را از کار می‌اندازد.',
    impact_en: 'Slowloris attackers can open hundreds of connections and send partial bytes very slowly, exhausting all Nginx worker connection slots.',
    remediationSnippet: 'client_body_timeout 12s;\nclient_header_timeout 12s;\nkeepalive_timeout 15s;\nsend_timeout 10s;',
    affectedFiles: timeoutFiles.length > 0 ? timeoutFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 13: Hidden & Sensitive Files Protection (.git, .env, .htaccess)
  // =========================================================================
  const hiddenFilesMatch = /location\s*~[^*]?\s*\/\\\.\(\?!well-known\)/i.test(combinedCleanContent) ||
    /location\s*~[^*]?\s*\/\\\./i.test(combinedCleanContent) ||
    /\bdeny\s+all\b/i.test(combinedCleanContent) && /\\\.git/i.test(combinedCleanContent);
  const hiddenFilesPassed = hiddenFilesMatch;
  const hiddenFilesList = findMatchingFiles(/location\s*~.*\/\\/i);

  auditItems.push({
    id: 'sec-hidden-files',
    category: 'access_control',
    title: 'مسدودسازی دسترسی به فایل‌ها و پوشه‌های مخفی (.git, .env)',
    title_en: 'Block Access to Hidden & Sensitive Files (.git, .env, etc.)',
    severity: 'critical',
    passed: hiddenFilesPassed,
    currentValue: hiddenFilesPassed ? 'Protected' : 'No general dotfile protection detected',
    recommendedValue: `location ~ /\\.(?!well-known).* {\n    deny all;\n    access_log off;\n    log_not_found off;\n}`,
    description: 'جلوگیری از دسترسی عمومی وب به فایل‌ها و پوشه‌هایی که با نقطه آغاز می‌شوند (مانند مخزن کدهای گیت .git یا متغیرهای محیطی .env).',
    description_en: 'Prevents web visitors from requesting hidden filesystem dotfiles such as version control repositories (.git) and secret files (.env).',
    impact: 'دانلود ناخواسته مخازن گیت یا فایل‌های .env منجر به افشای کامل سورس‌کد و کلمات عبور دیتابیس سامانه خواهد شد.',
    impact_en: 'Allows unauthorized downloads of entire Git repositories and environment files containing database passwords and secret API keys.',
    remediationSnippet: `location ~ /\\.(?!well-known).* {\n    deny all;\n    access_log off;\n    log_not_found off;\n}`,
    affectedFiles: hiddenFilesList.length > 0 ? hiddenFilesList : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 14: Backup, Source & Dump Files Leakage Protection
  // =========================================================================
  const backupFilesMatch = /location\s*~\*?\s*.*(?:bak|sql|swp|backup|old|conf~)/i.test(combinedCleanContent);
  const backupFilesPassed = backupFilesMatch;
  const backupMatches = findMatchingFiles(/location\s*~\*?.*(?:bak|sql|swp)/i);

  auditItems.push({
    id: 'sec-backup-files',
    category: 'access_control',
    title: 'مسدودسازی دانلود فایل‌های پشتیبان و دامپ دیتابیس (.sql, .bak, .swp)',
    title_en: 'Block Access to Database Dumps & Backup Files (.sql, .bak)',
    severity: 'warning',
    passed: backupFilesPassed,
    currentValue: backupFilesPassed ? 'Protected' : 'Not configured',
    recommendedValue: `location ~* (?:\\.(?:bak|conf|dist|fla|in[ci]|log|psd|sh|sql|sw[op])|~)$ {\n    deny all;\n    access_log off;\n    log_not_found off;\n}`,
    description: 'جلوگیری از دسترسی عمومی به پسوندهای فایل‌های پشتیبان، دامپ‌های پایگاه داده و فایل‌های موقت ادیتورها در دایرکتوری وب.',
    description_en: 'Blocks web requests matching dangerous backup, archive, database dump, and editor swap extensions.',
    impact: 'توسعه‌دهندگان گاهی فایل‌های backup.sql یا index.php.bak را در روت سرور باقی می‌گذارند که توسط اسکنرها دانلود می‌شود.',
    impact_en: 'Developers frequently leave temporary backups like database.sql or config.php.bak in document roots, leading to critical database compromise.',
    remediationSnippet: `location ~* (?:\\.(?:bak|conf|dist|fla|in[ci]|log|psd|sh|sql|sw[op])|~)$ {\n    deny all;\n    access_log off;\n    log_not_found off;\n}`,
    affectedFiles: backupMatches.length > 0 ? backupMatches : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 15: Rate Limiting & Concurrency Controls
  // =========================================================================
  const rateLimitMatch = /\blimit_req_zone\b/i.test(combinedCleanContent) || /\blimit_conn_zone\b/i.test(combinedCleanContent);
  const rateLimitFiles = findMatchingFiles(/\blimit_(req|conn)_zone\b/i);

  auditItems.push({
    id: 'sec-rate-limiting',
    category: 'dos_limits',
    title: 'کنترل نرخ درخواست‌ها و سقف کانکشن (Rate Limiting)',
    title_en: 'Request Velocity & Concurrency Throttling (Rate Limiting)',
    severity: 'info',
    passed: rateLimitMatch,
    currentValue: rateLimitMatch ? 'Zones Defined' : 'No rate limit zones defined',
    recommendedValue: `limit_req_zone $binary_remote_addr zone=req_limit_per_ip:10m rate=10r/s;\nlimit_conn_zone $binary_remote_addr zone=conn_limit_per_ip:10m;`,
    description: 'تعریف محدودیت تعداد درخواست و همزمانی کانکشن به ازای هر آدرس IP جهت مقابله با حملات بروت‌فورس و اسکرپینگ انبوه.',
    description_en: 'Defines shared memory zones to throttle incoming request bursts and limit concurrent connections per client IP address.',
    impact: 'بدون محدودیت نرخ، وب‌سایت در برابر حملات بروت‌فورس لاگین، اسکرپرهای تهاجمی و هجوم ربات‌ها بی‌دفاع خواهد بود.',
    impact_en: 'Without rate limiting, authentication endpoints are vulnerable to brute-force credential stuffing and abusive scraping bots.',
    remediationSnippet: `limit_req_zone $binary_remote_addr zone=req_limit_per_ip:10m rate=10r/s;\nlimit_conn_zone $binary_remote_addr zone=conn_limit_per_ip:10m;`,
    affectedFiles: rateLimitFiles.length > 0 ? rateLimitFiles : [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 16: Worker Process Unprivileged User Check
  // =========================================================================
  const isWorkerRoot = liveWorkerUser.toLowerCase() === 'root';
  const workerUserPassed = !isWorkerRoot;

  auditItems.push({
    id: 'sec-worker-user',
    category: 'permissions',
    title: 'اجرای ورکرها بدون دسترسی روت (Unprivileged Worker User)',
    title_en: 'Run Worker Processes as Non-Root User',
    severity: 'critical',
    passed: workerUserPassed,
    currentValue: `Master: ${liveMasterUser}, Worker: ${liveWorkerUser}`,
    recommendedValue: 'user nginx; # or www-data',
    description: 'پروسه‌های ورکر Nginx باید حتماً با یک کاربر بدون دسترسی ممتاز سیستمی (مانند nginx یا www-data) اجرا شوند.',
    description_en: 'Worker processes must run with an unprivileged system account (such as nginx or www-data), never as root.',
    impact: 'اجرای پروسه پردازش ترافیک با دسترسی روت، در صورت بروز هرگونه آسیب‌پذیری سرریز حافظه یا RCE منجر به تسخیر کامل سرور لینوکس می‌شود.',
    impact_en: 'If workers run as root, any remote code execution vulnerability in Nginx grants attackers immediate root-level takeover of the server.',
    remediationSnippet: 'user nginx; # or user www-data;',
    affectedFiles: [topology.mainConfigPath],
  });

  // =========================================================================
  // RULE 17: SSL Private Key Permissions
  // =========================================================================
  const worldReadableKey = /-[rwx-]{6}r[w-][x-]/i.test(sslKeysPermsOutput);
  const keyPermsPassed = !worldReadableKey;

  auditItems.push({
    id: 'sec-key-permissions',
    category: 'permissions',
    title: 'امنیت مجوزهای فایل کلید خصوصی گواهینامه (SSL Key Permissions)',
    title_en: 'SSL Private Key Filesystem Permissions',
    severity: 'critical',
    passed: keyPermsPassed,
    currentValue: sslKeysPermsOutput ? sslKeysPermsOutput.split('\n')[0] : 'No private keys found or permissions safe',
    recommendedValue: 'chmod 600 /etc/ssl/private/*.key',
    description: 'کلیدهای خصوصی گواهینامه‌های SSL باید منحصراً توسط کاربر روت یا Nginx قابل خواندن باشند و دسترسی خواندن برای سایرین (World-Readable) مسدود باشد.',
    description_en: 'SSL private keys must only be readable by root or the nginx process owner, with zero read permissions for other unprivileged system users.',
    impact: 'کلیدهای خصوصی با دسترسی باز می‌توانند توسط سایر کاربران سرور به سرقت رفته و امکان شنود و جعل هویت وب‌سایت را فراهم کنند.',
    impact_en: 'World-readable private keys allow any local user or compromised service on the server to steal the key and impersonate your domain.',
    remediationSnippet: 'chmod 600 /etc/ssl/private/*.key /etc/nginx/ssl/*.key',
    affectedFiles: [],
  });

  // =========================================================================
  // RULE 18: World-Writable Nginx Configuration Files
  // =========================================================================
  const worldWritableConf = /-[rwx-]{8}w/i.test(confPermsOutput);
  const confPermsPassed = !worldWritableConf;

  auditItems.push({
    id: 'sec-config-permissions',
    category: 'permissions',
    title: 'مسدودسازی دسترسی ویرایش همگانی کانفیگ (World-Writable Config)',
    title_en: 'Prevent World-Writable Nginx Configurations',
    severity: 'critical',
    passed: confPermsPassed,
    currentValue: confPermsOutput ? confPermsOutput.split('\n')[0] : 'Properly restricted (644 / 755)',
    recommendedValue: 'chmod 644 /etc/nginx/nginx.conf',
    description: 'فایل‌های پیکربندی Nginx نباید برای سایر کاربران سرور دسترسی نوشتن (Write) داشته باشند.',
    description_en: 'Nginx configuration files must strictly forbid write access to unprivileged world users.',
    impact: 'دسترسی نوشتن همگانی به مهاجمین یا بدافزارهای محلی اجازه می‌دهد فایل کانفیگ را دستکاری کرده و بدافزار بارگذاری نمایند.',
    impact_en: 'Allows any unprivileged local process to inject malicious reverse proxies or code execution directives into the web server.',
    remediationSnippet: 'chmod 644 /etc/nginx/nginx.conf && chown -R root:root /etc/nginx',
    affectedFiles: [topology.mainConfigPath],
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
        baseScore -= 20;
      } else if (item.severity === 'warning') {
        warningCount++;
        baseScore -= 8;
      } else if (item.severity === 'info') {
        infoCount++;
        baseScore -= 3;
      }
    }
  }

  const finalScore = Math.max(10, Math.min(100, Math.round(baseScore)));

  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
  if (finalScore >= 92) grade = 'A+';
  else if (finalScore >= 80) grade = 'A';
  else if (finalScore >= 70) grade = 'B';
  else if (finalScore >= 55) grade = 'C';
  else if (finalScore >= 40) grade = 'D';
  else grade = 'F';

  // Generate unified production-grade security-hardening.conf snippet
  const hardeningSnippet = `# ==============================================================================
# Production Security Hardening Configuration for Nginx
# Generated by NetTopology Nginx Management (v1.169.0)
# Target Server: ${server.name} (${(server as any).ip || (server as any).host || (server as any).ip_address || ''})
# Timestamp: ${testedAt}
# ==============================================================================

# 1. Information Disclosure Protection
server_tokens off;

# 2. Defensive HTTP Security Headers (Safe for global HTTP/HTTPS contexts)
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# 3. Request Body & Buffer Limits (DoS Mitigation)
client_max_body_size 16M;
client_body_buffer_size 128k;
client_header_buffer_size 1k;
large_client_header_buffers 4 8k;

# 4. Connection Timeouts Hardening (Slowloris Protection)
client_body_timeout 12s;
client_header_timeout 12s;
keepalive_timeout 15s;
send_timeout 10s;

# 5. Shared Memory Rate Limiting Zones (10MB zones = ~160,000 IP states)
limit_req_zone $binary_remote_addr zone=req_limit_per_ip:10m rate=10r/s;
limit_conn_zone $binary_remote_addr zone=conn_limit_per_ip:10m;

# 6. Modern TLS Protocols & Safe Ciphers (Applies to all SSL Server Blocks)
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;

# 7. OCSP Stapling (Fast TLS Handshakes & CA Privacy)
ssl_stapling on;
ssl_stapling_verify on;
resolver 1.1.1.1 8.8.8.8 valid=300s;
resolver_timeout 5s;
`;

  return {
    testedAt,
    overallScore: finalScore,
    grade,
    totalChecks: auditItems.length,
    passedChecks: passedCount,
    warningChecks: warningCount,
    criticalChecks: criticalCount,
    infoChecks: infoCount,
    serverUser: liveMasterUser,
    workerUser: liveWorkerUser,
    isWorkerRoot,
    targetConfPath: targetConfPath || discovery.confPath,
    items: auditItems,
    hardeningSnippet,
  };
}

/**
 * Safely applies the recommended security hardening configuration to the server.
 * Creates /etc/nginx/conf.d/security-hardening.conf (or target path), runs syntax verification,
 * and reloads Nginx safely with automatic rollback in case of error.
 */
export async function applyNginxSecurityHardening(
  server: RemoteServer,
  targetFilePath?: string,
  customContent?: string,
  ephemeralPassword?: string
): Promise<NginxSecurityApplyFixResult> {
  const discovery = await discoverNginxInstallation(server, ephemeralPassword);
  
  // Resolve optimal target location for the drop-in file
  const baseConfDir = discovery.prefixPath || '/etc/nginx';
  const defaultHardeningPath = `${baseConfDir}/conf.d/security-hardening.conf`;
  const resolvedPath = targetFilePath || defaultHardeningPath;

  // Generate default content if not provided
  let contentToWrite = customContent;
  if (!contentToWrite) {
    const report = await performNginxSecurityAudit(server, ephemeralPassword, discovery.confPath);
    contentToWrite = report.hardeningSnippet;
  }

  // Ensure target directory exists on remote server before writing
  try {
    const targetDir = resolvedPath.substring(0, resolvedPath.lastIndexOf('/'));
    if (targetDir) {
      await runAdaptiveSshCommand(server, `mkdir -p "${targetDir}"`, ephemeralPassword, 8000);
    }
  } catch (err: any) {
    console.warn('[Failed to ensure conf directory]:', err?.message || err);
  }

  // Use the safe editor atomic write & verification pipeline
  const result = await saveNginxConfigFileSafe(
    server,
    resolvedPath,
    contentToWrite,
    true, // auto-reload Nginx upon success
    ephemeralPassword
  );

  return {
    success: result.success,
    filePath: result.filePath,
    backupCreated: result.backupCreated,
    syntaxTestPassed: result.syntaxTestPassed,
    syntaxOutput: result.syntaxOutput,
    serviceReloaded: result.serviceReloaded,
    reloadOutput: result.reloadOutput,
    error: result.error,
  };
}
