import {
  RemoteServer,
  ApacheVirtualHost,
  ApacheVirtualHostsSummary,
  CreateApacheVirtualHostParams,
} from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { discoverApacheInstallation, isLikelyApacheBinary } from './apacheDiscovery';
import { discoverApacheConfigTopology } from './apacheConfigParser';

/**
 * Python-based robust AST extractor for <VirtualHost> blocks across all Apache config files.
 * In addition to active included files from topology, also inspects sites-available directories
 * so disabled sites are accurately discovered and manageable.
 */
const PYTHON_VHOST_EXTRACTOR = (serverRoot: string) => `python3 - << 'PYEOF'
import sys, os, re, json, glob

server_root = "${serverRoot}"
vhosts = []
warnings = []

def find_all_candidate_files():
    candidates = set()
    
    # 1. Search ServerRoot for *.conf
    for root, dirs, files in os.walk(server_root):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for f in files:
            if f.endswith('.conf') or f.endswith('.conf.disabled'):
                candidates.add(os.path.join(root, f))
                
    # 2. Check standard distribution paths
    distro_paths = [
        "/etc/apache2/sites-available/*.conf",
        "/etc/apache2/sites-enabled/*.conf",
        "/etc/apache2/conf-available/*.conf",
        "/etc/apache2/conf-enabled/*.conf",
        "/etc/httpd/conf.d/*.conf",
        "/etc/httpd/conf.d/*.conf.disabled",
        "/etc/httpd/conf/httpd.conf",
        "/etc/apache2/apache2.conf"
    ]
    for p in distro_paths:
        for m in glob.glob(p):
            if os.path.isfile(m):
                candidates.add(m)
                
    return sorted(list(candidates))

def parse_vhost_blocks(content, filepath):
    # Regex to capture <VirtualHost ...> to </VirtualHost>
    pattern = re.compile(r'<VirtualHost\\s+([^>]+)>(.*?)</VirtualHost>', re.IGNORECASE | re.DOTALL)
    
    # Check if this file is enabled
    # On Debian/Ubuntu: if in sites-available, check if sites-enabled has matching symlink
    is_enabled = True
    basename = os.path.basename(filepath)
    sitename = re.sub(r'\\.conf(\\..*)?$', '', basename)
    
    if '/sites-available/' in filepath:
        enabled_link = filepath.replace('/sites-available/', '/sites-enabled/')
        is_enabled = os.path.islink(enabled_link) or os.path.exists(enabled_link)
    elif filepath.endswith('.disabled'):
        is_enabled = False
        
    lines = content.splitlines()
    
    for match in pattern.finditer(content):
        ip_port_raw = match.group(1).strip()
        body = match.group(2)
        
        # Calculate line numbers
        start_char = match.start()
        end_char = match.end()
        start_line = content[:start_char].count('\\n') + 1
        end_line = content[:end_char].count('\\n') + 1
        
        # Extract ServerName
        sname_m = re.search(r'\\bServerName\\s+([^\\s\\r\\n]+)', body, re.IGNORECASE)
        server_name = sname_m.group(1).strip() if sname_m else ""
        
        # Extract ServerAlias
        salias_m = re.findall(r'\\bServerAlias\\s+([^\\r\\n]+)', body, re.IGNORECASE)
        aliases = []
        for a_line in salias_m:
            for item in a_line.strip().split():
                if item and item not in aliases:
                    aliases.append(item)
                    
        # Fallback server_name if empty
        if not server_name:
            if aliases:
                server_name = aliases[0]
            elif sitename:
                server_name = sitename
            else:
                server_name = f"VirtualHost [{ip_port_raw}]"
                
        # Parse port from ip_port_raw (e.g. *:80, *:443, 127.0.0.1:8080)
        port_num = 80
        is_ssl = False
        port_m = re.search(r':(\\d+)', ip_port_raw)
        if port_m:
            try:
                port_num = int(port_m.group(1))
            except:
                port_num = 80
        elif "443" in ip_port_raw:
            port_num = 443
            
        # Check SSL
        if port_num == 443 or re.search(r'\\bSSLEngine\\s+on\\b|\\bSSLCertificateFile\\b', body, re.IGNORECASE):
            is_ssl = True
            
        # DocumentRoot
        doc_root_m = re.search(r'\\bDocumentRoot\\s+["\\']?([^"\\'\\r\\n]+)["\\']?', body, re.IGNORECASE)
        doc_root = doc_root_m.group(1).strip() if doc_root_m else None
        
        # ProxyPass targets
        proxies = []
        proxy_matches = re.finditer(r'\\bProxyPass\\s+([^\\s]+)\\s+([^\\s\\r\\n]+)', body, re.IGNORECASE)
        for pm in proxy_matches:
            p_path = pm.group(1).strip()
            p_target = pm.group(2).strip()
            # Ignore ! directives (e.g. ProxyPass /static !)
            if p_target != '!':
                proxies.append({"path": p_path, "target": p_target})
                
        # Logs
        clog_m = re.search(r'\\bCustomLog\\s+["\\']?([^"\\'\\s\\r\\n]+)["\\']?', body, re.IGNORECASE)
        custom_log = clog_m.group(1).strip() if clog_m else None
        
        elog_m = re.search(r'\\bErrorLog\\s+["\\']?([^"\\'\\s\\r\\n]+)["\\']?', body, re.IGNORECASE)
        error_log = elog_m.group(1).strip() if elog_m else None
        
        # ServerAdmin
        admin_m = re.search(r'\\bServerAdmin\\s+([^\\s\\r\\n]+)', body, re.IGNORECASE)
        server_admin = admin_m.group(1).strip() if admin_m else None
        
        # Snippet
        snippet = match.group(0).strip()
        if len(snippet) > 8000:
            snippet = snippet[:8000] + "\\n... [truncated]"
            
        vhost_id = f"vh-{abs(hash(filepath + ':' + str(start_line)))}"
        rel_path = os.path.relpath(filepath, server_root) if filepath.startswith(server_root) else filepath
        
        vhosts.append({
            "id": vhost_id,
            "serverName": server_name,
            "serverAliases": aliases,
            "ipPort": ip_port_raw,
            "port": port_num,
            "isSsl": is_ssl,
            "documentRoot": doc_root,
            "proxyPassTargets": proxies,
            "customLog": custom_log,
            "errorLog": error_log,
            "serverAdmin": server_admin,
            "definedInFile": filepath,
            "fileRelativePath": rel_path,
            "lineStart": start_line,
            "lineEnd": end_line,
            "isEnabled": is_enabled,
            "siteName": sitename,
            "rawBlockSnippet": snippet
        })

candidate_files = find_all_candidate_files()
for c_file in candidate_files:
    try:
        with open(c_file, 'r', encoding='utf-8', errors='replace') as fp:
            content = fp.read()
        if '<VirtualHost' in content or '<virtualhost' in content:
            parse_vhost_blocks(content, c_file)
    except Exception as e:
        warnings.append(f"Cannot read {c_file}: {str(e)}")

out_obj = {
    "totalVHosts": len(vhosts),
    "activeVHosts": sum(1 for v in vhosts if v["isEnabled"]),
    "disabledVHosts": sum(1 for v in vhosts if not v["isEnabled"]),
    "sslVHosts": sum(1 for v in vhosts if v["isSsl"]),
    "proxyVHosts": sum(1 for v in vhosts if len(v["proxyPassTargets"]) > 0),
    "staticVHosts": sum(1 for v in vhosts if v["documentRoot"] and len(v["proxyPassTargets"]) == 0),
    "vhosts": vhosts,
    "warnings": warnings
}

print("VHOST_JSON_START:::" + json.dumps(out_obj) + ":::VHOST_JSON_END")
PYEOF
`;

/**
 * Discovers all Apache VirtualHosts defined on the remote Linux host.
 */
export async function discoverApacheVirtualHosts(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<ApacheVirtualHostsSummary> {
  // Resolve ServerRoot from discovery or topology
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);
  const serverRoot = discovery.serverRoot || (discovery.confPath?.includes('/httpd') ? '/etc/httpd' : '/etc/apache2');

  try {
    const pyScript = PYTHON_VHOST_EXTRACTOR(serverRoot);
    const rawOutput = await runAdaptiveSshCommand(server, pyScript, ephemeralPassword, 15000);

    if (rawOutput.includes('VHOST_JSON_START:::') && rawOutput.includes(':::VHOST_JSON_END')) {
      const jsonStr = rawOutput.split('VHOST_JSON_START:::')[1].split(':::VHOST_JSON_END')[0].trim();
      const parsed: ApacheVirtualHostsSummary = JSON.parse(jsonStr);
      return parsed;
    }
  } catch (err: any) {
    // If python failed or returned error
  }

  // Fallback if parsing returned empty
  return {
    totalVHosts: 0,
    activeVHosts: 0,
    disabledVHosts: 0,
    sslVHosts: 0,
    proxyVHosts: 0,
    staticVHosts: 0,
    vhosts: [],
    warnings: ['Could not extract VirtualHosts or no <VirtualHost> blocks found'],
  };
}

/**
 * Toggles a VirtualHost enabled or disabled state.
 * Uses a2ensite/a2dissite on Debian/Ubuntu or symlinks/file renaming on RHEL,
 * verifying configuration syntax before committing reload.
 */
export async function toggleApacheVirtualHost(
  server: RemoteServer,
  siteName: string,
  enable: boolean,
  filePath?: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; output?: string }> {
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);
  const binary = discovery.binaryPath || (discovery.controlBinaryPath ? discovery.controlBinaryPath : 'apache2');
  const serviceName = discovery.serviceName || 'apache2';

  if (!isLikelyApacheBinary(binary)) {
    throw new Error(`Untrusted or invalid Apache binary: ${binary}`);
  }

  const cleanSiteName = siteName.replace(/\.conf(\..*)?$/, '');

  // Script to toggle site and test syntax
  const script = `export LC_ALL=C
SITE="${cleanSiteName}"
ENABLE="${enable ? '1' : '0'}"
FILE_PATH="${filePath || ''}"

# 1. Debian/Ubuntu a2ensite / a2dissite
if command -v a2ensite >/dev/null 2>&1 && command -v a2dissite >/dev/null 2>&1; then
  if [ "$ENABLE" = "1" ]; then
    a2ensite "$SITE" 2>&1
  else
    a2dissite "$SITE" 2>&1
  fi
elif [ -n "$FILE_PATH" ] && [ -f "$FILE_PATH" ]; then
  # 2. Generic / RHEL symlink or rename
  if [ "$ENABLE" = "0" ]; then
    # Disable by renaming .conf to .conf.disabled
    if [[ "$FILE_PATH" == *.conf ]]; then
      mv "$FILE_PATH" "\${FILE_PATH}.disabled" 2>&1
    fi
  else
    # Enable by restoring .conf
    if [[ "$FILE_PATH" == *.conf.disabled ]]; then
      mv "$FILE_PATH" "\${FILE_PATH%.disabled}" 2>&1
    fi
  fi
fi

# 3. Safe configuration syntax check
${binary} -t 2>&1
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 12000);

  if (output.toLowerCase().includes('syntax ok')) {
    // Reload Apache service gracefully
    const reloadCmd = `systemctl reload ${serviceName} 2>/dev/null || apachectl -k graceful 2>/dev/null || true`;
    await runAdaptiveSshCommand(server, reloadCmd, ephemeralPassword, 8000);
    return {
      success: true,
      message: enable ? `VirtualHost '${siteName}' enabled successfully` : `VirtualHost '${siteName}' disabled successfully`,
      output,
    };
  } else {
    // Rollback toggle if syntax error occurred!
    const rollbackScript = `export LC_ALL=C
SITE="${cleanSiteName}"
if [ "${enable ? '1' : '0'}" = "1" ]; then
  a2dissite "$SITE" 2>/dev/null || true
  if [ -n "${filePath || ''}" ] && [ -f "${filePath || ''}" ]; then
    mv "${filePath}" "${filePath}.disabled" 2>/dev/null || true
  fi
else
  a2ensite "$SITE" 2>/dev/null || true
  if [ -n "${filePath || ''}" ] && [ -f "${filePath}.disabled" ]; then
    mv "${filePath}.disabled" "${filePath}" 2>/dev/null || true
  fi
fi
`;
    await runAdaptiveSshCommand(server, rollbackScript, ephemeralPassword, 8000).catch(() => {});
    throw new Error(`Apache configuration syntax error detected. Changes rolled back:\n${output.trim()}`);
  }
}

/**
 * Creates a new Apache VirtualHost configuration file, validates syntax, and deploys it.
 */
export async function createApacheVirtualHost(
  server: RemoteServer,
  params: CreateApacheVirtualHostParams,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; filePath: string; output?: string }> {
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);
  const binary = discovery.binaryPath || 'apache2';
  const serviceName = discovery.serviceName || 'apache2';

  if (!isLikelyApacheBinary(binary)) {
    throw new Error(`Untrusted or invalid Apache binary: ${binary}`);
  }

  // Validate parameters
  const siteName = params.siteName.trim().replace(/[^a-zA-Z0-9_\-\.]/g, '');
  if (!siteName) throw new Error('Site name is required and must contain alphanumeric characters or hyphens');

  const serverName = params.serverName.trim();
  if (!serverName) throw new Error('ServerName (domain name) is required');

  const port = params.port || (params.enableSsl ? 443 : 80);
  const documentRoot = params.documentRoot ? params.documentRoot.trim() : `/var/www/${siteName}`;
  const proxyTarget = params.proxyTarget ? params.proxyTarget.trim() : 'http://127.0.0.1:3000';

  // Determine target directory: sites-available on Debian or conf.d on RHEL
  let targetDir = '/etc/apache2/sites-available';
  if (discovery.serverRoot?.includes('/httpd') || discovery.confPath?.includes('/httpd')) {
    targetDir = `${discovery.serverRoot || '/etc/httpd'}/conf.d`;
  }

  const targetFile = `${targetDir}/${siteName}.conf`;

  // Build VirtualHost configuration content
  let vhostContent = '';
  if (params.siteType === 'proxy') {
    vhostContent = `<VirtualHost *:${port}>
    ServerName ${serverName}
${params.serverAliases ? `    ServerAlias ${params.serverAliases.trim()}\n` : ''}${params.serverAdmin ? `    ServerAdmin ${params.serverAdmin.trim()}\n` : ''}
    ProxyPreserveHost On
    ProxyPass / ${proxyTarget}${proxyTarget.endsWith('/') ? '' : '/'}
    ProxyPassReverse / ${proxyTarget}${proxyTarget.endsWith('/') ? '' : '/'}
${params.enableSsl ? `
    SSLEngine on
    SSLCertificateFile ${params.sslCertFile || '/etc/ssl/certs/ssl-cert-snakeoil.pem'}
    SSLCertificateKeyFile ${params.sslKeyFile || '/etc/ssl/private/ssl-cert-snakeoil.key'}
` : ''}
    ErrorLog \${APACHE_LOG_DIR}/${siteName}_error.log
    CustomLog \${APACHE_LOG_DIR}/${siteName}_access.log combined
</VirtualHost>
`;
  } else {
    vhostContent = `<VirtualHost *:${port}>
    ServerName ${serverName}
${params.serverAliases ? `    ServerAlias ${params.serverAliases.trim()}\n` : ''}${params.serverAdmin ? `    ServerAdmin ${params.serverAdmin.trim()}\n` : ''}
    DocumentRoot ${documentRoot}

    <Directory ${documentRoot}>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
${params.enableSsl ? `
    SSLEngine on
    SSLCertificateFile ${params.sslCertFile || '/etc/ssl/certs/ssl-cert-snakeoil.pem'}
    SSLCertificateKeyFile ${params.sslKeyFile || '/etc/ssl/private/ssl-cert-snakeoil.key'}
` : ''}
    ErrorLog \${APACHE_LOG_DIR}/${siteName}_error.log
    CustomLog \${APACHE_LOG_DIR}/${siteName}_access.log combined
</VirtualHost>
`;
  }

  // Base64 encode configuration to safely transfer via SSH
  const b64Conf = Buffer.from(vhostContent).toString('base64');

  const deployScript = `export LC_ALL=C
TARGET_DIR="${targetDir}"
TARGET_FILE="${targetFile}"
DOC_ROOT="${documentRoot}"
SITE_TYPE="${params.siteType}"
AUTO_ENABLE="${params.autoEnable ? '1' : '0'}"
SITE_NAME="${siteName}"

mkdir -p "$TARGET_DIR" 2>/dev/null || true

# If static site, create DocumentRoot if it does not exist
if [ "$SITE_TYPE" = "static" ] && [ ! -d "$DOC_ROOT" ]; then
  mkdir -p "$DOC_ROOT" 2>/dev/null || true
  cat << 'HTMLEOF' > "$DOC_ROOT/index.html"
<!DOCTYPE html>
<html>
<head><title>Welcome to ${serverName}</title></head>
<body><h1>${serverName}</h1><p>Managed by Apache Fleet Manager</p></body>
</html>
HTMLEOF
fi

# Write VirtualHost file
echo "${b64Conf}" | base64 -d > "$TARGET_FILE"

# Enable site if requested
if [ "$AUTO_ENABLE" = "1" ] && command -v a2ensite >/dev/null 2>&1; then
  a2ensite "$SITE_NAME" 2>&1 || true
fi

# Run syntax check
${binary} -t 2>&1
`;

  const output = await runAdaptiveSshCommand(server, deployScript, ephemeralPassword, 12000);

  if (output.toLowerCase().includes('syntax ok')) {
    // Reload Apache
    const reloadCmd = `systemctl reload ${serviceName} 2>/dev/null || apachectl -k graceful 2>/dev/null || true`;
    await runAdaptiveSshCommand(server, reloadCmd, ephemeralPassword, 8000);
    return {
      success: true,
      message: `VirtualHost for '${serverName}' created and deployed successfully!`,
      filePath: targetFile,
      output,
    };
  } else {
    // Revert created file on syntax error
    const rollback = `rm -f "${targetFile}" 2>/dev/null; a2dissite "${siteName}" 2>/dev/null || true`;
    await runAdaptiveSshCommand(server, rollback, ephemeralPassword, 8000).catch(() => {});
    throw new Error(`Apache configuration syntax error. VirtualHost not deployed:\n${output.trim()}`);
  }
}

/**
 * Deletes an Apache VirtualHost configuration file and reloads the server safely.
 */
export async function deleteApacheVirtualHost(
  server: RemoteServer,
  siteName: string,
  filePath: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);
  const binary = discovery.binaryPath || 'apache2';
  const serviceName = discovery.serviceName || 'apache2';

  if (!isLikelyApacheBinary(binary)) {
    throw new Error(`Untrusted or invalid Apache binary: ${binary}`);
  }

  // Backup file in temp first, then remove
  const script = `export LC_ALL=C
FILE="${filePath}"
SITE="${siteName.replace(/\.conf(\..*)?$/, '')}"

# Backup to /tmp
cp "$FILE" "/tmp/${siteName}.bak" 2>/dev/null || true

# Disable site first
if command -v a2dissite >/dev/null 2>&1; then
  a2dissite "$SITE" 2>/dev/null || true
fi

# Remove file and disabled variants
rm -f "$FILE" "\${FILE}.disabled" 2>/dev/null || true

# Check syntax
${binary} -t 2>&1
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 10000);

  if (output.toLowerCase().includes('syntax ok')) {
    // Reload service
    const reloadCmd = `systemctl reload ${serviceName} 2>/dev/null || apachectl -k graceful 2>/dev/null || true`;
    await runAdaptiveSshCommand(server, reloadCmd, ephemeralPassword, 8000);
    // Remove backup
    await runAdaptiveSshCommand(server, `rm -f "/tmp/${siteName}.bak" 2>/dev/null || true`, ephemeralPassword, 5000);
    return {
      success: true,
      message: `VirtualHost '${siteName}' removed successfully.`,
    };
  } else {
    // Restore backup
    await runAdaptiveSshCommand(server, `cp "/tmp/${siteName}.bak" "${filePath}" 2>/dev/null || true`, ephemeralPassword, 8000);
    throw new Error(`Cannot delete VirtualHost: Removing it caused configuration syntax errors:\n${output.trim()}`);
  }
}
