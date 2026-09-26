import { RemoteServer } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { discoverApacheInstallation } from './apacheDiscovery';
import { saveApacheConfigFileSafe, assertSafeApachePath } from './apacheSafeEditor';
import {
  ApacheHtaccessFile,
  ApacheRewriteRuleItem,
  ApacheBasicAuthProtectedArea,
  ApacheCustomErrorDoc,
  ApacheRewriteHtaccessSummary,
  ApacheDeployRewriteResult,
} from '../src/types';

/**
 * Shell script to discover .htaccess files, AllowOverride configurations,
 * ErrorDocuments, and Basic Auth protected locations.
 */
const HTACCESS_DISCOVERY_SCRIPT = `export LC_ALL=C
echo "===HTACCESS_FILES==="
find /var/www /srv/www /usr/share /home -maxdepth 4 -name ".htaccess" -type f 2>/dev/null | head -n 30 | while read -r f; do
  if [ -f "$f" ]; then
    STAT=$(stat -c "%s:%a:%U:%G" "$f" 2>/dev/null || ls -l "$f" | awk '{print $5 ":0644:" $3 ":" $4}')
    LINES=$(wc -l < "$f" 2>/dev/null || echo 0)
    echo "FILE:$f:$STAT:$LINES"
    echo "---CONTENT_START---"
    head -n 50 "$f" 2>/dev/null || true
    echo "---CONTENT_END---"
  fi
done

echo "===ALLOW_OVERRIDE==="
grep -rniE '^[[:space:]]*AllowOverride[[:space:]]+' /etc/apache2 /etc/httpd 2>/dev/null | head -n 30 || true

echo "===ERROR_DOCUMENTS==="
grep -rniE '^[[:space:]]*ErrorDocument[[:space:]]+' /etc/apache2 /etc/httpd /var/www 2>/dev/null | head -n 30 || true

echo "===AUTH_PROTECTED==="
grep -rniE '^[[:space:]]*AuthUserFile[[:space:]]+' /etc/apache2 /etc/httpd /var/www 2>/dev/null | head -n 30 || true

echo "===END_DISCOVERY==="
`;

/**
 * Discovers live .htaccess files, AllowOverride rules, rewrite status, and authentication areas.
 */
export async function discoverApacheRewriteAndHtaccess(
  server: RemoteServer,
  ephemeralPassword?: string,
  targetConfPath?: string
): Promise<ApacheRewriteHtaccessSummary> {
  const discovery = await discoverApacheInstallation(
    server,
    ephemeralPassword,
    targetConfPath ? { targetConfPath } : undefined
  );

  const isRewriteModuleLoaded =
    discovery.loadedModules.includes('mod_rewrite') || discovery.loadedModules.includes('rewrite');
  const isAuthBasicLoaded =
    discovery.loadedModules.includes('mod_auth_basic') ||
    discovery.loadedModules.includes('auth_basic') ||
    discovery.loadedModules.includes('mod_authn_core') ||
    discovery.loadedModules.includes('authn_core');

  let rawDiscoveryOut = '';
  try {
    rawDiscoveryOut = await runAdaptiveSshCommand(
      server,
      HTACCESS_DISCOVERY_SCRIPT,
      ephemeralPassword,
      12000
    );
  } catch (err: any) {
    console.warn('[Apache Rewrite Discovery SSH Error]:', err?.message || err);
  }

  const htaccessFiles: ApacheHtaccessFile[] = [];
  const configuredErrorDocs: ApacheCustomErrorDoc[] = [];
  const protectedAreas: ApacheBasicAuthProtectedArea[] = [];
  let globalAllowOverride = 'None';

  if (rawDiscoveryOut.includes('===HTACCESS_FILES===')) {
    const htSection = rawDiscoveryOut.split('===HTACCESS_FILES===')[1].split('===ALLOW_OVERRIDE===')[0];
    const fileBlocks = htSection.split('FILE:');

    for (const block of fileBlocks) {
      if (!block.trim()) continue;
      const firstLine = block.split('\n')[0];
      const parts = firstLine.split(':');
      if (parts.length >= 2) {
        const filePath = parts[0].trim();
        const sizeBytes = parseInt(parts[1], 10) || 0;
        const permissions = parts[2] || '0644';
        const owner = parts[3] || 'root';
        const lineCount = parseInt(parts[5], 10) || 0;

        let content = '';
        if (block.includes('---CONTENT_START---') && block.includes('---CONTENT_END---')) {
          content = block.split('---CONTENT_START---')[1].split('---CONTENT_END---')[0].trim();
        }

        const directory = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
        const hasRewriteEngine = /RewriteEngine\s+on/i.test(content);
        const hasAuthBasic = /AuthType\s+Basic/i.test(content);
        const hasErrorDocument = /ErrorDocument\s+\d+/i.test(content);
        const hasRequireDirectives = /Require\s+/i.test(content);

        htaccessFiles.push({
          filePath,
          directory,
          sizeBytes,
          lineCount,
          permissions,
          owner,
          isEffective: true,
          contentSnippet: content.slice(0, 500),
          fullContent: content,
          hasRewriteEngine,
          hasAuthBasic,
          hasErrorDocument,
          hasRequireDirectives,
        });
      }
    }
  }

  // Parse AllowOverride matches
  if (rawDiscoveryOut.includes('===ALLOW_OVERRIDE===')) {
    const aoSection = rawDiscoveryOut.split('===ALLOW_OVERRIDE===')[1].split('===ERROR_DOCUMENTS===')[0];
    const aoLines = aoSection.split('\n');
    for (const line of aoLines) {
      const match = /AllowOverride\s+([A-Za-z0-9\s]+)/i.exec(line);
      if (match) {
        const val = match[1].trim();
        if (val.toLowerCase().includes('all')) {
          globalAllowOverride = 'All';
        } else if (globalAllowOverride !== 'All') {
          globalAllowOverride = val;
        }
      }
    }
  }

  // Parse ErrorDocument directives
  if (rawDiscoveryOut.includes('===ERROR_DOCUMENTS===')) {
    const edSection = rawDiscoveryOut.split('===ERROR_DOCUMENTS===')[1].split('===AUTH_PROTECTED===')[0];
    const edLines = edSection.split('\n');
    for (const line of edLines) {
      const match = /ErrorDocument\s+(\d{3})\s+([^\r\n]+)/i.exec(line);
      if (match) {
        const statusCode = parseInt(match[1], 10);
        const rawTarget = match[2].trim();
        const actionType = rawTarget.startsWith('http://') || rawTarget.startsWith('https://')
          ? 'url'
          : rawTarget.startsWith('/')
          ? 'path'
          : 'message';

        const colonIdx = line.indexOf(':');
        const configuredInFile = colonIdx > 0 ? line.substring(0, colonIdx) : undefined;

        if (!configuredErrorDocs.some((d) => d.statusCode === statusCode && d.target === rawTarget)) {
          configuredErrorDocs.push({
            statusCode,
            reason: getHttpStatusReason(statusCode),
            actionType,
            target: rawTarget,
            configuredInFile,
          });
        }
      }
    }
  }

  // Parse AuthUserFile protected locations
  if (rawDiscoveryOut.includes('===AUTH_PROTECTED===')) {
    const authSection = rawDiscoveryOut.split('===AUTH_PROTECTED===')[1].split('===END_DISCOVERY===')[0];
    const authLines = authSection.split('\n');
    for (const line of authLines) {
      const match = /AuthUserFile\s+([^\r\n]+)/i.exec(line);
      if (match) {
        const authUserFile = match[1].trim();
        const colonIdx = line.indexOf(':');
        const configuredInFile = colonIdx > 0 ? line.substring(0, colonIdx) : '';
        const id = `auth-${configuredInFile.replace(/[^a-zA-Z0-9]/g, '_')}`;

        if (!protectedAreas.some((p) => p.authUserFile === authUserFile)) {
          protectedAreas.push({
            id,
            targetPath: configuredInFile.includes('.htaccess')
              ? configuredInFile.substring(0, configuredInFile.lastIndexOf('/')) || '/'
              : '/var/www',
            targetType: 'directory',
            authName: 'Restricted Administration Area',
            authType: 'Basic',
            authUserFile,
            requireDirective: 'valid-user',
            users: [],
            configuredInFile,
          });
        }
      }
    }
  }

  // Built-in production Rewrite Presets
  const defaultRewritePresets: ApacheRewriteRuleItem[] = [
    {
      id: 'force-https',
      name: 'Strict HTTPS Redirection',
      description: 'Redirects all unencrypted HTTP traffic to HTTPS with 301 Permanent status',
      category: 'https_redirect',
      enabled: true,
      conditions: ['%{HTTPS} off'],
      rule: '^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI}',
      flags: '[L,R=301,NE]',
      rawSnippet: `# Force HTTPS Redirection
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301,NE]`,
    },
    {
      id: 'canonical-non-www',
      name: 'Enforce Non-WWW Canonical Domain',
      description: 'Redirects www.example.com to example.com for SEO canonicalization',
      category: 'canonical_domain',
      enabled: true,
      conditions: ['%{HTTP_HOST} ^www\\.(.+) [NC]'],
      rule: '^(.*)$ https://%1%{REQUEST_URI}',
      flags: '[L,R=301]',
      rawSnippet: `# Canonical Domain (Enforce Non-WWW)
RewriteEngine On
RewriteCond %{HTTP_HOST} ^www\\.(.+) [NC]
RewriteRule ^(.*)$ https://%1%{REQUEST_URI} [L,R=301]`,
    },
    {
      id: 'spa-router',
      name: 'Single Page Application (SPA) HTML5 Fallback',
      description: 'Routes all non-existing static files and directories to index.html',
      category: 'spa_routing',
      enabled: true,
      conditions: ['%{REQUEST_FILENAME} !-f', '%{REQUEST_FILENAME} !-d'],
      rule: '^ index.html',
      flags: '[L]',
      rawSnippet: `# Single Page Application (SPA) HTML5 History Routing
RewriteEngine On
RewriteBase /
RewriteRule ^index\\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]`,
    },
    {
      id: 'hotlink-protection',
      name: 'Image & Asset Hotlink Protection',
      description: 'Prevents external third-party sites from stealing bandwidth by embedding your images',
      category: 'hotlink_protection',
      enabled: true,
      conditions: [
        '%{HTTP_REFERER} !^$',
        '%{HTTP_REFERER} !^https?://(www\\.)?%{HTTP_HOST} [NC]',
      ],
      rule: '\\.(jpg|jpeg|png|gif|webp|svg)$',
      flags: '[F,NC]',
      rawSnippet: `# Anti-Hotlinking Protection
RewriteEngine On
RewriteCond %{HTTP_REFERER} !^$
RewriteCond %{HTTP_REFERER} !^https?://(www\\.)?%{HTTP_HOST} [NC]
RewriteRule \\.(jpg|jpeg|png|gif|webp|svg)$ - [F,NC]`,
    },
    {
      id: 'block-bad-bots',
      name: 'Block Vulnerability Scanners & Bad Bots',
      description: 'Blocks automated scanners (Nikto, sqlmap, wpscan, masscan) using 403 Forbidden',
      category: 'bad_bot_block',
      enabled: true,
      conditions: [
        '%{HTTP_USER_AGENT} (sqlmap|nikto|wpscan|masscan|zgrab|acunetix|nessus) [NC]',
      ],
      rule: '.*',
      flags: '[F,L]',
      rawSnippet: `# Block Vulnerability Scanners & Aggressive Bots
RewriteEngine On
RewriteCond %{HTTP_USER_AGENT} (sqlmap|nikto|wpscan|masscan|zgrab|acunetix|nessus) [NC]
RewriteRule .* - [F,L]`,
    },
  ];

  return {
    testedAt: new Date().toISOString(),
    isRewriteModuleLoaded,
    isAuthBasicLoaded,
    globalAllowOverride,
    htaccessFiles,
    protectedAreas,
    configuredErrorDocs,
    defaultRewritePresets,
  };
}

/**
 * Helper to get HTTP reason string
 */
function getHttpStatusReason(code: number): string {
  switch (code) {
    case 400: return 'Bad Request';
    case 401: return 'Unauthorized';
    case 403: return 'Forbidden';
    case 404: return 'Not Found';
    case 500: return 'Internal Server Error';
    case 502: return 'Bad Gateway';
    case 503: return 'Service Unavailable';
    case 504: return 'Gateway Timeout';
    default: return 'HTTP Error';
  }
}

/**
 * Enables mod_rewrite safely and gracefully reloads Apache
 */
export async function enableApacheRewriteModule(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<ApacheDeployRewriteResult> {
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);

  let script = '';
  if (discovery.osFamily === 'debian') {
    script = `if command -v a2enmod >/dev/null 2>&1; then
      a2enmod rewrite 2>&1 || true
      ${discovery.binaryPath || 'apachectl'} -t 2>&1
      if [ $? -eq 0 ]; then
        systemctl reload ${discovery.serviceName || 'apache2'} 2>&1 || true
        echo "SUCCESS"
      else
        echo "SYNTAX_ERROR"
      fi
    else
      echo "NO_A2ENMOD"
    fi`;
  } else {
    // RHEL / Rocky / Fedora: ensure LoadModule rewrite_module is present in httpd.conf
    script = `CONF="${discovery.confPath || '/etc/httpd/conf/httpd.conf'}"
    if [ -f "$CONF" ]; then
      if ! grep -q "rewrite_module" "$CONF"; then
        echo "LoadModule rewrite_module modules/mod_rewrite.so" >> "$CONF"
      fi
      ${discovery.binaryPath || 'httpd'} -t 2>&1
      if [ $? -eq 0 ]; then
        systemctl reload ${discovery.serviceName || 'httpd'} 2>&1 || true
        echo "SUCCESS"
      else
        echo "SYNTAX_ERROR"
      fi
    else
      echo "CONF_NOT_FOUND"
    fi`;
  }

  let output = '';
  try {
    output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 10000);
  } catch (err: any) {
    return {
      success: false,
      filePath: discovery.confPath || '',
      syntaxTestPassed: false,
      syntaxOutput: err?.message || 'SSH execution error',
      serviceReloaded: false,
      error: err?.message || 'Failed to enable mod_rewrite',
    };
  }

  const success = output.includes('SUCCESS');
  return {
    success,
    filePath: discovery.confPath || '',
    syntaxTestPassed: !output.includes('SYNTAX_ERROR'),
    syntaxOutput: output,
    serviceReloaded: success,
    error: success ? undefined : 'Failed to enable rewrite module or reload service',
  };
}

/**
 * Saves a .htaccess file directly in the target directory with backup and permissions
 */
export async function saveHtaccessFile(
  server: RemoteServer,
  targetDirectory: string,
  content: string,
  ephemeralPassword?: string
): Promise<ApacheDeployRewriteResult> {
  const cleanDir = targetDirectory.trim().replace(/\/+$/, '');
  const htaccessPath = `${cleanDir}/.htaccess`;
  const safeTarget = assertSafeApachePath(htaccessPath);

  // Use the safe editor which creates timestamped backups and checks path validity
  const saveRes = await saveApacheConfigFileSafe(
    server,
    safeTarget,
    content,
    true, // autoReload
    ephemeralPassword
  );

  return {
    success: saveRes.success,
    filePath: saveRes.filePath,
    backupCreated: saveRes.backupCreated,
    syntaxTestPassed: saveRes.syntaxTestPassed,
    syntaxOutput: saveRes.syntaxOutput,
    serviceReloaded: saveRes.serviceReloaded,
    error: saveRes.error,
  };
}

/**
 * Configures HTTP Basic Authentication (.htpasswd) on a target directory or location
 */
export async function setupApacheBasicAuth(
  server: RemoteServer,
  params: {
    targetDirectory: string;
    authName: string;
    username: string;
    password?: string;
    authUserFilePath?: string;
  },
  ephemeralPassword?: string
): Promise<ApacheDeployRewriteResult> {
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);
  const cleanDir = params.targetDirectory.trim().replace(/\/+$/, '');
  const htpasswdPath = params.authUserFilePath || (
    discovery.osFamily === 'debian'
      ? '/etc/apache2/.htpasswd'
      : '/etc/httpd/.htpasswd'
  );

  const username = params.username.trim();
  const password = params.password || 'SecureP@ss123!';
  const authName = params.authName.trim() || 'Restricted Area';

  // 1. Create or update user in .htpasswd using htpasswd command on remote server
  const htpasswdScript = `if command -v htpasswd >/dev/null 2>&1; then
    htpasswd -b -B -c "${htpasswdPath}" "${username}" "${password}" 2>&1 || htpasswd -b -c "${htpasswdPath}" "${username}" "${password}" 2>&1
  else
    # Fallback to python or openssl if htpasswd binary is missing
    HASH=$(openssl passwd -6 "${password}" 2>/dev/null || openssl passwd -1 "${password}" 2>/dev/null || echo "${password}")
    echo "${username}:$HASH" > "${htpasswdPath}"
  fi
  chmod 640 "${htpasswdPath}"
  chown root:www-data "${htpasswdPath}" 2>/dev/null || chown root:apache "${htpasswdPath}" 2>/dev/null || true
  echo "HTPASSWD_SUCCESS"
  `;

  try {
    const rawOut = await runAdaptiveSshCommand(server, htpasswdScript, ephemeralPassword, 8000);
    if (!rawOut.includes('HTPASSWD_SUCCESS')) {
      return {
        success: false,
        filePath: htpasswdPath,
        syntaxTestPassed: false,
        syntaxOutput: rawOut,
        serviceReloaded: false,
        error: 'Failed to create htpasswd credentials file on remote server',
      };
    }
  } catch (err: any) {
    return {
      success: false,
      filePath: htpasswdPath,
      syntaxTestPassed: false,
      syntaxOutput: err?.message || '',
      serviceReloaded: false,
      error: err?.message || 'SSH error during htpasswd generation',
    };
  }

  // 2. Write authentication protection directives to .htaccess in target directory
  const authDirectives = `# HTTP Basic Authentication Protection
AuthType Basic
AuthName "${authName}"
AuthUserFile "${htpasswdPath}"
Require valid-user
`;

  return saveHtaccessFile(server, cleanDir, authDirectives, ephemeralPassword);
}

/**
 * Deploys custom ErrorDocument configuration safely with syntax test
 */
export async function deployApacheCustomErrorDocs(
  server: RemoteServer,
  errorDocs: ApacheCustomErrorDoc[],
  ephemeralPassword?: string
): Promise<ApacheDeployRewriteResult> {
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);

  let targetPath = '';
  if (discovery.osFamily === 'debian') {
    targetPath = '/etc/apache2/conf-available/custom-errors.conf';
  } else if (discovery.osFamily === 'rhel' || discovery.osFamily === 'alpine') {
    targetPath = '/etc/httpd/conf.d/custom-errors.conf';
  } else {
    targetPath = '/etc/apache2/conf-available/custom-errors.conf';
  }

  let content = '# Custom Apache Error Documents\n';
  for (const doc of errorDocs) {
    const formattedTarget = doc.actionType === 'message' && !doc.target.startsWith('"')
      ? `"${doc.target}"`
      : doc.target;
    content += `ErrorDocument ${doc.statusCode} ${formattedTarget}\n`;
  }

  const safeTarget = assertSafeApachePath(targetPath);
  const saveRes = await saveApacheConfigFileSafe(
    server,
    safeTarget,
    content,
    true,
    ephemeralPassword
  );

  if (saveRes.success && safeTarget.includes('conf-available') && discovery.osFamily === 'debian') {
    try {
      const enableScript = `if command -v a2enconf >/dev/null 2>&1; then
        a2enconf custom-errors 2>&1 || true
        systemctl reload ${discovery.serviceName || 'apache2'} 2>&1 || true
      fi`;
      await runAdaptiveSshCommand(server, enableScript, ephemeralPassword, 8000);
    } catch {
      // Best effort
    }
  }

  return {
    success: saveRes.success,
    filePath: saveRes.filePath,
    backupCreated: saveRes.backupCreated,
    syntaxTestPassed: saveRes.syntaxTestPassed,
    syntaxOutput: saveRes.syntaxOutput,
    serviceReloaded: saveRes.serviceReloaded,
    error: saveRes.error,
  };
}
