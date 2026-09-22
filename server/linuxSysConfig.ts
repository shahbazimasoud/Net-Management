import { RemoteServer, LinuxSshConfig, LinuxHostnameInfo, LinuxHostEntry, LinuxDnsConfig, LinuxFail2banStatus, LinuxFail2banJailInfo, LinuxTimeInfo } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { updateRemoteServer } from './db';

/**
 * =========================================================================
 * LINUX SSH CONFIGURATION & SECURITY (SSHD_CONFIG & PORT MANAGEMENT)
 * =========================================================================
 */

/**
 * Reads SSH configuration from the target server by querying sshd runtime (sshd -T)
 * and reading /etc/ssh/sshd_config plus any drop-in files under /etc/ssh/sshd_config.d/
 */
export async function fetchLinuxSshConfigSSH(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<LinuxSshConfig> {
  const script = `export LC_ALL=C
echo "===EFFECTIVE_SSHD==="
if command -v sshd >/dev/null 2>&1; then
  sudo sshd -T 2>/dev/null || sshd -T 2>/dev/null || true
fi
echo "===SSHD_CONFIG_FILE==="
cat /etc/ssh/sshd_config 2>/dev/null || true
echo "===SSHD_DROPIN_FILES==="
for f in /etc/ssh/sshd_config.d/*.conf; do
  if [ -f "$f" ]; then
    echo "---FILE:$f---"
    cat "$f" 2>/dev/null || true
  fi
done
echo "===UFW_STATUS==="
if command -v ufw >/dev/null 2>&1; then
  sudo ufw status numbered 2>/dev/null || true
fi
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 12000);

  let port: number = server.ssh_port || 22;
  let permitRootLogin: 'yes' | 'no' | 'prohibit-password' | 'without-password' = 'prohibit-password';
  let passwordAuthentication: 'yes' | 'no' = 'yes';
  let maxAuthTries: number = 5;
  let clientAliveInterval: number = 300;
  let clientAliveCountMax: number = 3;
  let x11Forwarding: 'yes' | 'no' = 'no';
  const allowedIps: string[] = [];

  const effectiveSection = output.split('===EFFECTIVE_SSHD===')[1]?.split('===SSHD_CONFIG_FILE===')[0] || '';
  const configFileSection = output.split('===SSHD_CONFIG_FILE===')[1]?.split('===SSHD_DROPIN_FILES===')[0] || '';
  const dropinSection = output.split('===SSHD_DROPIN_FILES===')[1]?.split('===UFW_STATUS===')[0] || '';
  const ufwSection = output.split('===UFW_STATUS===')[1] || '';

  // 1. Try parsing from sshd -T (authoritative active runtime configuration)
  if (effectiveSection.trim()) {
    const portMatch = effectiveSection.match(/^port\s+(\d+)/im);
    if (portMatch) port = parseInt(portMatch[1], 10);

    const rootMatch = effectiveSection.match(/^permitrootlogin\s+([^\s#]+)/im);
    if (rootMatch) {
      const val = rootMatch[1].toLowerCase();
      if (val === 'yes' || val === 'no' || val === 'prohibit-password' || val === 'without-password') {
        permitRootLogin = val as any;
      }
    }

    const passMatch = effectiveSection.match(/^passwordauthentication\s+(yes|no)/im);
    if (passMatch) passwordAuthentication = passMatch[1].toLowerCase() as any;

    const authTriesMatch = effectiveSection.match(/^maxauthtries\s+(\d+)/im);
    if (authTriesMatch) maxAuthTries = parseInt(authTriesMatch[1], 10);

    const keepaliveMatch = effectiveSection.match(/^clientaliveinterval\s+(\d+)/im);
    if (keepaliveMatch) clientAliveInterval = parseInt(keepaliveMatch[1], 10);

    const countMatch = effectiveSection.match(/^clientalivecountmax\s+(\d+)/im);
    if (countMatch) clientAliveCountMax = parseInt(countMatch[1], 10);

    const x11Match = effectiveSection.match(/^x11forwarding\s+(yes|no)/im);
    if (x11Match) x11Forwarding = x11Match[1].toLowerCase() as any;
  }

  // 2. Parse /etc/ssh/sshd_config and drop-in files for custom overrides if sshd -T was unavailable or commented
  const allConfigs = `${configFileSection}\n${dropinSection}`;
  if (!effectiveSection.trim()) {
    const portMatch = allConfigs.match(/^[ \t]*Port\s+(\d+)/im);
    if (portMatch) port = parseInt(portMatch[1], 10);

    const rootMatch = allConfigs.match(/^[ \t]*PermitRootLogin\s+([^\s#]+)/im);
    if (rootMatch) {
      const val = rootMatch[1].toLowerCase();
      if (val === 'yes' || val === 'no' || val === 'prohibit-password' || val === 'without-password') {
        permitRootLogin = val as any;
      }
    }

    const passMatch = allConfigs.match(/^[ \t]*PasswordAuthentication\s+(yes|no)/im);
    if (passMatch) passwordAuthentication = passMatch[1].toLowerCase() as any;

    const authTriesMatch = allConfigs.match(/^[ \t]*MaxAuthTries\s+(\d+)/im);
    if (authTriesMatch) maxAuthTries = parseInt(authTriesMatch[1], 10);

    const keepaliveMatch = allConfigs.match(/^[ \t]*ClientAliveInterval\s+(\d+)/im);
    if (keepaliveMatch) clientAliveInterval = parseInt(keepaliveMatch[1], 10);

    const countMatch = allConfigs.match(/^[ \t]*ClientAliveCountMax\s+(\d+)/im);
    if (countMatch) clientAliveCountMax = parseInt(countMatch[1], 10);

    const x11Match = allConfigs.match(/^[ \t]*X11Forwarding\s+(yes|no)/im);
    if (x11Match) x11Forwarding = x11Match[1].toLowerCase() as any;
  }

  // 3. Parse Allowed IPs from UFW or hosts.allow if available
  if (ufwSection.trim()) {
    const ufwLines = ufwSection.split('\n');
    for (const line of ufwLines) {
      // Example: "[ 1] 22/tcp  ALLOW IN  192.168.1.50"
      if (/ALLOW\s+IN/i.test(line) && (line.includes(`${port}`) || line.includes('22/tcp') || line.includes('OpenSSH'))) {
        const parts = line.split(/ALLOW\s+IN/i)[1]?.trim();
        if (parts) {
          const ipCandidate = parts.split(/\s+/)[0]?.trim();
          if (ipCandidate && ipCandidate.toLowerCase() !== 'anywhere' && !allowedIps.includes(ipCandidate)) {
            allowedIps.push(ipCandidate);
          }
        }
      }
    }
  }

  // If server database port is out of sync with actual detected port, update it quietly
  if (port && port !== server.ssh_port) {
    updateRemoteServer(server.id, { ssh_port: port }).catch(() => {});
  }

  return {
    port,
    permitRootLogin,
    passwordAuthentication,
    maxAuthTries,
    clientAliveInterval,
    clientAliveCountMax,
    x11Forwarding,
    allowedIps,
  };
}

/**
 * Updates SSH configuration in sshd_config or sshd_config.d, verifies syntax,
 * reloads daemon, and synchronizes the port in the local database.
 */
export async function updateLinuxSshConfigSSH(
  server: RemoteServer,
  config: LinuxSshConfig,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const targetPort = Math.floor(Number(config.port));
  if (isNaN(targetPort) || targetPort < 1 || targetPort > 65535) {
    throw new Error('Invalid SSH port. Must be an integer between 1 and 65535.');
  }

  const reservedPorts = [80, 443, 53, 25, 110, 143, 3306, 5432, 6379, 27017];
  if (reservedPorts.includes(targetPort)) {
    throw new Error(`Port ${targetPort} is reserved for standard network services. Please select an administrative SSH port (e.g. 2222, 22022).`);
  }

  const permitRoot = config.permitRootLogin || 'prohibit-password';
  const passAuth = config.passwordAuthentication || 'yes';
  const maxTries = Math.min(Math.max(Number(config.maxAuthTries) || 5, 1), 20);
  const keepalive = Math.max(Number(config.clientAliveInterval) || 300, 0);
  const countMax = Math.min(Math.max(Number(config.clientAliveCountMax) || 3, 1), 10);
  const x11 = config.x11Forwarding || 'no';
  const allowedIps = (config.allowedIps || []).map((ip) => ip.trim()).filter(Boolean);

  const script = `export LC_ALL=C
# Step 1: Pre-check existing sshd syntax
if command -v sshd >/dev/null 2>&1; then
  sudo sshd -t || { echo "PRECHECK_FAILED"; exit 1; }
fi

# Step 2: Backup existing config
BACKUP_FILE="/etc/ssh/sshd_config.bak.$(date +%s)"
sudo cp /etc/ssh/sshd_config "$BACKUP_FILE" 2>/dev/null || true

# Step 3: Write configuration
if [ -d /etc/ssh/sshd_config.d ]; then
  # Ensure sshd_config includes drop-in directory
  if ! grep -qE '^[ #]*Include /etc/ssh/sshd_config\.d/\*\.conf' /etc/ssh/sshd_config; then
    echo "Include /etc/ssh/sshd_config.d/*.conf" | sudo tee -a /etc/ssh/sshd_config >/dev/null
  fi

  sudo tee /etc/ssh/sshd_config.d/00-custom-port.conf >/dev/null << 'EOF'
Port ${targetPort}
EOF

  sudo tee /etc/ssh/sshd_config.d/01-security-hardening.conf >/dev/null << 'EOF'
PermitRootLogin ${permitRoot}
PasswordAuthentication ${passAuth}
MaxAuthTries ${maxTries}
ClientAliveInterval ${keepalive}
ClientAliveCountMax ${countMax}
X11Forwarding ${x11}
EOF
else
  # Apply directly to /etc/ssh/sshd_config
  apply_setting() {
    KEY="$1"
    VAL="$2"
    if grep -qE "^[ #]*\${KEY} " /etc/ssh/sshd_config; then
      sudo sed -i "s/^[ #]*\${KEY} .*/\${KEY} \${VAL}/" /etc/ssh/sshd_config
    else
      echo "\${KEY} \${VAL}" | sudo tee -a /etc/ssh/sshd_config >/dev/null
    fi
  }

  apply_setting "Port" "${targetPort}"
  apply_setting "PermitRootLogin" "${permitRoot}"
  apply_setting "PasswordAuthentication" "${passAuth}"
  apply_setting "MaxAuthTries" "${maxTries}"
  apply_setting "ClientAliveInterval" "${keepalive}"
  apply_setting "ClientAliveCountMax" "${countMax}"
  apply_setting "X11Forwarding" "${x11}"
fi

# Step 4: Validate syntax with sshd -t
if command -v sshd >/dev/null 2>&1; then
  if ! sudo sshd -t; then
    echo "SYNTAX_CHECK_FAILED"
    sudo rm -f /etc/ssh/sshd_config.d/00-custom-port.conf /etc/ssh/sshd_config.d/01-security-hardening.conf 2>/dev/null || true
    if [ -f "$BACKUP_FILE" ]; then
      sudo cp "$BACKUP_FILE" /etc/ssh/sshd_config
    fi
    exit 2
  fi
fi

# Step 5: Adjust Firewall to prevent lockout
# UFW
if command -v ufw >/dev/null 2>&1; then
  UFW_ACTIVE=$(sudo ufw status 2>/dev/null | grep -i "Status: active" || true)
  if [ -n "$UFW_ACTIVE" ]; then
    sudo ufw allow ${targetPort}/tcp comment "Administrative SSH Port" 2>/dev/null || true
  fi
fi
# Firewalld
if command -v firewall-cmd >/dev/null 2>&1; then
  if sudo systemctl is-active --quiet firewalld 2>/dev/null; then
    sudo firewall-cmd --add-port=${targetPort}/tcp --permanent 2>/dev/null || true
    sudo firewall-cmd --reload 2>/dev/null || true
  fi
fi

# Step 6: Safe daemon reload/restart
sudo systemctl try-reload-or-restart ssh.service 2>/dev/null || \\
sudo systemctl try-reload-or-restart sshd.service 2>/dev/null || \\
sudo systemctl restart ssh 2>/dev/null || \\
sudo systemctl restart sshd 2>/dev/null || \\
sudo service ssh restart 2>/dev/null || \\
sudo /etc/init.d/ssh restart 2>/dev/null || true

echo "SSHD_APPLY_SUCCESS"
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 18000);

  if (output.includes('PRECHECK_FAILED')) {
    throw new Error('Pre-check failed: The existing sshd configuration on the server has syntax errors. Cannot safely modify.');
  }

  if (output.includes('SYNTAX_CHECK_FAILED')) {
    throw new Error('Syntax validation failed: The requested SSH settings were rejected by sshd -t. Reverted to previous configuration to prevent lockout.');
  }

  // Update server ssh_port in database so future connections use the updated port
  await updateRemoteServer(server.id, { ssh_port: targetPort }).catch(() => {});

  return {
    success: true,
    message: `SSH configuration applied successfully. Listening port set to ${targetPort} and daemon reloaded.`,
  };
}

/**
 * =========================================================================
 * HOSTNAME & /ETC/HOSTS MANAGEMENT
 * =========================================================================
 */

/**
 * Fetches current live hostname, static hostname, FQDN, and system info via SSH.
 */
export async function fetchLinuxHostnameSSH(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<LinuxHostnameInfo> {
  const script = `export LC_ALL=C
echo "===HOSTNAMECTL==="
if command -v hostnamectl >/dev/null 2>&1; then
  hostnamectl status 2>/dev/null || true
fi
echo "===FQDN==="
hostname -f 2>/dev/null || hostname 2>/dev/null || true
echo "===ETC_HOSTNAME==="
cat /etc/hostname 2>/dev/null || true
echo "===CMD_HOSTNAME==="
hostname 2>/dev/null || true
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 10000);

  const hostnamectlSection = output.split('===HOSTNAMECTL===')[1]?.split('===FQDN===')[0] || '';
  const fqdnSection = output.split('===FQDN===')[1]?.split('===ETC_HOSTNAME===')[0] || '';
  const etcHostname = (output.split('===ETC_HOSTNAME===')[1]?.split('===CMD_HOSTNAME===')[0] || '').trim();
  const cmdHostname = (output.split('===CMD_HOSTNAME===')[1] || '').trim();

  let staticHostname = '';
  let transientHostname = '';
  let prettyHostname = '';
  let iconName = '';
  let chassis = '';
  let deployment = '';

  const staticMatch = hostnamectlSection.match(/Static hostname:\s*([^\n\r]+)/i);
  if (staticMatch) staticHostname = staticMatch[1].trim();

  const transientMatch = hostnamectlSection.match(/Transient hostname:\s*([^\n\r]+)/i);
  if (transientMatch) transientHostname = transientMatch[1].trim();

  const prettyMatch = hostnamectlSection.match(/Pretty hostname:\s*([^\n\r]+)/i);
  if (prettyMatch) prettyHostname = prettyMatch[1].trim();

  const iconMatch = hostnamectlSection.match(/Icon name:\s*([^\n\r]+)/i);
  if (iconMatch) iconName = iconMatch[1].trim();

  const chassisMatch = hostnamectlSection.match(/Chassis:\s*([^\n\r]+)/i);
  if (chassisMatch) chassis = chassisMatch[1].trim();

  const deployMatch = hostnamectlSection.match(/Deployment:\s*([^\n\r]+)/i);
  if (deployMatch) deployment = deployMatch[1].trim();

  const fqdn = fqdnSection.trim() || cmdHostname || staticHostname || etcHostname;
  const currentHostname = cmdHostname || etcHostname || staticHostname || transientHostname || server.hostname || server.name || 'linux-host';

  if (!staticHostname) {
    staticHostname = currentHostname;
  }

  // If server hostname was not populated in database, update it
  if (currentHostname && (!server.hostname || server.hostname === 'localhost')) {
    updateRemoteServer(server.id, { hostname: currentHostname }).catch(() => {});
  }

  return {
    currentHostname,
    staticHostname,
    transientHostname: transientHostname || undefined,
    fqdn: fqdn || currentHostname,
    prettyHostname: prettyHostname || undefined,
    iconName: iconName || undefined,
    chassis: chassis || undefined,
    deployment: deployment || undefined,
  };
}

/**
 * Updates hostname on remote Linux server and optionally syncs /etc/hosts
 */
export async function updateLinuxHostnameSSH(
  server: RemoteServer,
  newHostname: string,
  updateHosts: boolean = true,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const clean = (newHostname || '').trim();
  if (!clean) {
    throw new Error('Hostname cannot be empty.');
  }

  // RFC 1123 Hostname Validation
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/.test(clean)) {
    throw new Error('Invalid hostname format. Must conform to RFC 1123 (letters, numbers, hyphens, up to 63 chars per label).');
  }

  const script = `export LC_ALL=C
NEW_HOST="${clean}"
OLD_HOST=$(hostname 2>/dev/null || cat /etc/hostname 2>/dev/null || echo "")

# 1. Update using hostnamectl if available
if command -v hostnamectl >/dev/null 2>&1; then
  sudo hostnamectl set-hostname "$NEW_HOST" 2>/dev/null || true
fi

# 2. Update /etc/hostname
echo "$NEW_HOST" | sudo tee /etc/hostname >/dev/null 2>&1 || true

# 3. Apply active hostname command
sudo hostname "$NEW_HOST" 2>/dev/null || true

# 4. Update /etc/hosts if requested
if [ "${updateHosts ? '1' : '0'}" = "1" ]; then
  if [ -f /etc/hosts ]; then
    # Backup
    sudo cp /etc/hosts /etc/hosts.bak.$(date +%s) 2>/dev/null || true

    # If 127.0.1.1 exists (standard Debian/Ubuntu), replace the first hostname on that line
    if grep -qE '^127\.0\.1\.1[ \t]+' /etc/hosts; then
      sudo sed -i -E "s/^(127\.0\.1\.1[ \t]+)[^ \t\r\n#]+(.*)/\\1\${NEW_HOST}\\2/" /etc/hosts
    elif grep -qE '^127\.0\.0\.1[ \t]+.*localhost' /etc/hosts; then
      # Add 127.0.1.1 mapping
      echo "127.0.1.1 \${NEW_HOST}" | sudo tee -a /etc/hosts >/dev/null
    fi
  fi
fi

echo "HOSTNAME_UPDATE_SUCCESS"
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 12000);

  if (output.includes('HOSTNAME_UPDATE_SUCCESS') || !output.trim()) {
    // Update server record in DB
    await updateRemoteServer(server.id, { hostname: clean, name: clean }).catch(() => {});
    return {
      success: true,
      message: `System hostname successfully updated to "${clean}"${updateHosts ? ' and synchronized in /etc/hosts' : ''}.`,
    };
  }

  return {
    success: true,
    message: output.trim() || `Hostname changed to "${clean}".`,
  };
}

/**
 * Fetches and parses entries from /etc/hosts
 */
export async function fetchLinuxHostsFileSSH(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<{ entries: LinuxHostEntry[]; rawContent: string }> {
  const script = `export LC_ALL=C
cat /etc/hosts 2>/dev/null || true
`;

  const rawContent = await runAdaptiveSshCommand(server, script, ephemeralPassword, 8000);
  const lines = rawContent.split('\n');
  const entries: LinuxHostEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith('#')) continue;

    // Line format: IP host1 host2 # comment
    const [beforeComment, ...commentParts] = rawLine.split('#');
    const comment = commentParts.join('#').trim();
    const parts = beforeComment.trim().split(/\s+/);
    if (parts.length >= 2) {
      const ip = parts[0];
      const hostnames = parts.slice(1);
      entries.push({
        id: `host-${i}-${ip}`,
        ip,
        hostname: hostnames[0],
        hostnames,
        comment: comment || undefined,
      });
    }
  }

  return { entries, rawContent };
}

/**
 * Updates or adds host entry in /etc/hosts
 */
export async function updateLinuxHostsFileSSH(
  server: RemoteServer,
  payload: any,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const action = payload.action || 'replace';
  const entry = payload.entry;

  if (action === 'add' && entry) {
    const ip = (entry.ip || '').trim();
    const hostnames = Array.isArray(entry.hostnames)
      ? entry.hostnames.join(' ')
      : (entry.hostname || '').trim();
    const comment = (entry.comment || '').trim();
    const oldIp = entry.oldIp;

    if (!ip || !hostnames) {
      throw new Error('Valid IP address and at least one hostname are required.');
    }

    const newLine = `${ip}\t${hostnames}${comment ? ` # ${comment}` : ''}`;

    const script = `export LC_ALL=C
sudo cp /etc/hosts /etc/hosts.bak.$(date +%s) 2>/dev/null || true

# If updating existing IP
if [ -n "${oldIp || ''}" ]; then
  sudo sed -i "/^[ \t]*${oldIp}[ \t]/d" /etc/hosts
fi

# Remove duplicate if exists and append
sudo sed -i "/^[ \t]*${ip}[ \t]/d" /etc/hosts
echo "${newLine}" | sudo tee -a /etc/hosts >/dev/null
echo "HOSTS_UPDATE_SUCCESS"
`;

    const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 10000);
    return {
      success: true,
      message: `Entry for ${ip} saved to /etc/hosts successfully.`,
    };
  }

  if (action === 'delete' && payload.ip) {
    const targetIp = payload.ip.trim();
    const script = `export LC_ALL=C
sudo cp /etc/hosts /etc/hosts.bak.$(date +%s) 2>/dev/null || true
sudo sed -i "/^[ \t]*${targetIp}[ \t]/d" /etc/hosts
echo "HOSTS_DELETE_SUCCESS"
`;
    await runAdaptiveSshCommand(server, script, ephemeralPassword, 8000);
    return {
      success: true,
      message: `Removed entry for ${targetIp} from /etc/hosts.`,
    };
  }

  throw new Error('Unsupported hosts file action.');
}

/**
 * =========================================================================
 * DNS CONFIGURATION (/ETC/RESOLV.CONF & SYSTEMD-RESOLVED)
 * =========================================================================
 */

export async function fetchLinuxDnsConfigSSH(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<LinuxDnsConfig> {
  const script = `export LC_ALL=C
echo "===RESOLV_CONF==="
cat /etc/resolv.conf 2>/dev/null || true
echo "===RESOLVECTL==="
if command -v resolvectl >/dev/null 2>&1; then
  resolvectl status 2>/dev/null || true
elif command -v systemd-resolve >/dev/null 2>&1; then
  systemd-resolve --status 2>/dev/null || true
fi
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 8000);
  const resolvSection = output.split('===RESOLV_CONF===')[1]?.split('===RESOLVECTL===')[0] || '';
  const resolvectlSection = output.split('===RESOLVECTL===')[1] || '';

  const nameservers: string[] = [];
  const searchDomains: string[] = [];
  let source = 'resolv.conf';

  // Parse /etc/resolv.conf
  const lines = resolvSection.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('nameserver ')) {
      const ns = trimmed.replace('nameserver ', '').trim();
      if (ns && !nameservers.includes(ns)) nameservers.push(ns);
    } else if (trimmed.startsWith('search ')) {
      const domains = trimmed.replace('search ', '').trim().split(/\s+/);
      for (const d of domains) {
        if (d && !searchDomains.includes(d)) searchDomains.push(d);
      }
    }
  }

  if (resolvectlSection.includes('DNS Servers:') || resolvectlSection.includes('Current DNS Server:')) {
    source = 'systemd-resolved';
  }

  return {
    nameservers: nameservers.length > 0 ? nameservers : ['8.8.8.8', '1.1.1.1'],
    searchDomains,
    source,
  };
}

export async function updateLinuxDnsConfigSSH(
  server: RemoteServer,
  config: LinuxDnsConfig,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const servers = (config.nameservers || []).map((s) => s.trim()).filter(Boolean);
  if (servers.length === 0) {
    throw new Error('At least one DNS nameserver is required.');
  }

  const script = `export LC_ALL=C
sudo cp /etc/resolv.conf /etc/resolv.conf.bak.$(date +%s) 2>/dev/null || true

# Check if resolv.conf is a symlink to systemd-resolved
if [ -L /etc/resolv.conf ] && command -v resolvectl >/dev/null 2>&1; then
  DEFAULT_IFACE=$(ip route show default 2>/dev/null | awk '{print $5}' | head -n 1)
  if [ -n "$DEFAULT_IFACE" ]; then
    sudo resolvectl dns "$DEFAULT_IFACE" ${servers.join(' ')} 2>/dev/null || true
  fi
fi

# Write directly to /etc/resolv.conf as well
sudo tee /etc/resolv.conf >/dev/null << 'EOF'
# Generated by Net-Management
${servers.map((s) => `nameserver ${s}`).join('\n')}
${(config.searchDomains || []).length > 0 ? `search ${(config.searchDomains || []).join(' ')}` : ''}
EOF

echo "DNS_UPDATE_SUCCESS"
`;

  await runAdaptiveSshCommand(server, script, ephemeralPassword, 10000);
  return {
    success: true,
    message: `DNS nameservers updated successfully to: ${servers.join(', ')}`,
  };
}

/**
 * =========================================================================
 * FAIL2BAN INTRUSION PREVENTION (STATUS, JAILS, BAN/UNBAN)
 * =========================================================================
 */

export async function fetchLinuxFail2banSSH(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<LinuxFail2banStatus> {
  const script = `export LC_ALL=C
if ! command -v fail2ban-client >/dev/null 2>&1; then
  echo "NOT_INSTALLED"
  exit 0
fi

echo "===F2B_VERSION==="
fail2ban-client --version 2>/dev/null || echo "installed"
echo "===F2B_STATUS==="
sudo fail2ban-client status 2>/dev/null || echo "NOT_RUNNING"
echo "===JAIL_DETAILS==="
JAILS=$(sudo fail2ban-client status 2>/dev/null | grep -i "Jail list:" | sed 's/.*Jail list://' | tr -d '\t' | tr ',' ' ' || true)
for j in $JAILS; do
  echo "---JAIL:$j---"
  sudo fail2ban-client status "$j" 2>/dev/null || true
done
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 12000);

  if (output.includes('NOT_INSTALLED')) {
    return {
      installed: false,
      running: false,
      active: false,
      jails: [],
    };
  }

  const isRunning = !output.includes('NOT_RUNNING') && output.includes('Number of jail');
  const version = output.split('===F2B_VERSION===')[1]?.split('===F2B_STATUS===')[0]?.trim() || 'active';

  const jails: LinuxFail2banJailInfo[] = [];
  const bannedIpsList: { jail: string; ip: string; timestamp?: string }[] = [];
  let totalBannedCount = 0;

  const jailBlocks = output.split('---JAIL:');
  for (let i = 1; i < jailBlocks.length; i++) {
    const block = jailBlocks[i];
    const jailName = block.split('---')[0]?.trim();
    const body = block.split('---').slice(1).join('---');

    const currentlyBannedMatch = body.match(/Currently banned:\s*(\d+)/i);
    const totalBannedMatch = body.match(/Total banned:\s*(\d+)/i);
    const currentlyFailedMatch = body.match(/Currently failed:\s*(\d+)/i);
    const bannedIpMatch = body.match(/Banned IP list:\s*([^\n\r]+)/i);

    const currentlyBanned = currentlyBannedMatch ? parseInt(currentlyBannedMatch[1], 10) : 0;
    const totalBanned = totalBannedMatch ? parseInt(totalBannedMatch[1], 10) : currentlyBanned;
    const currentlyFailed = currentlyFailedMatch ? parseInt(currentlyFailedMatch[1], 10) : 0;

    const ips: string[] = [];
    if (bannedIpMatch && bannedIpMatch[1]) {
      const rawIps = bannedIpMatch[1].trim().split(/\s+/);
      for (const ip of rawIps) {
        if (ip && ip !== 'None') {
          ips.push(ip);
          bannedIpsList.push({ jail: jailName, ip });
        }
      }
    }

    totalBannedCount += currentlyBanned;
    jails.push({
      name: jailName,
      currentlyBanned,
      totalBanned,
      currentlyFailed,
      bannedIps: ips,
    });
  }

  return {
    installed: true,
    running: isRunning,
    active: isRunning,
    version,
    jails,
    bannedIps: bannedIpsList,
    totalBanned: totalBannedCount,
  };
}

export async function controlLinuxFail2banSSH(
  server: RemoteServer,
  action: 'start' | 'stop' | 'restart' | 'reload' | 'enable',
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const script = `export LC_ALL=C
if [ "${action}" = "enable" ]; then
  sudo systemctl enable --now fail2ban 2>/dev/null || true
else
  sudo systemctl ${action} fail2ban 2>/dev/null || sudo service fail2ban ${action} 2>/dev/null || sudo fail2ban-client ${action} 2>/dev/null || true
fi
echo "F2B_CONTROL_SUCCESS"
`;

  await runAdaptiveSshCommand(server, script, ephemeralPassword, 10000);
  return {
    success: true,
    message: `Fail2ban service ${action} action executed successfully.`,
  };
}

export async function ipActionLinuxFail2banSSH(
  server: RemoteServer,
  action: 'ban' | 'unban' | string,
  ip: string,
  jail: string = 'sshd',
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const cleanIp = (ip || '').trim();
  const cleanJail = (jail || 'sshd').trim();

  if (!cleanIp) throw new Error('IP address is required.');

  const cmd = action === 'unban' ? 'unbanip' : 'banip';
  const script = `export LC_ALL=C
sudo fail2ban-client set "${cleanJail}" ${cmd} "${cleanIp}"
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 8000);
  return {
    success: true,
    message: `IP ${cleanIp} ${action === 'unban' ? 'unbanned' : 'banned'} successfully in jail "${cleanJail}".`,
  };
}

export async function installLinuxFail2banSSH(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const script = `export LC_ALL=C
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -y && sudo apt-get install -y fail2ban
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y fail2ban
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y epel-release && sudo yum install -y fail2ban
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -Sy --noconfirm fail2ban
else
  echo "UNSUPPORTED_PKG_MGR"
  exit 1
fi

sudo systemctl enable --now fail2ban 2>/dev/null || true
echo "INSTALL_SUCCESS"
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 60000);
  if (output.includes('UNSUPPORTED_PKG_MGR')) {
    throw new Error('Unsupported package manager on target Linux distribution.');
  }

  return {
    success: true,
    message: 'Fail2ban installed and started successfully.',
  };
}

/**
 * =========================================================================
 * TIME, TIMEZONE & NTP SYNCHRONIZATION
 * =========================================================================
 */

export async function fetchLinuxTimeInfoSSH(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<LinuxTimeInfo> {
  const script = `export LC_ALL=C
echo "===TIMEDATECTL==="
if command -v timedatectl >/dev/null 2>&1; then
  timedatectl status 2>/dev/null || true
fi
echo "===DATE_UTC==="
date -u +"%Y-%m-%d %H:%M:%S UTC" 2>/dev/null || true
echo "===DATE_LOCAL==="
date +"%Y-%m-%d %H:%M:%S %Z" 2>/dev/null || true
echo "===TZ_CAT==="
cat /etc/timezone 2>/dev/null || readlink /etc/localtime 2>/dev/null || true
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 8000);

  const timedatectlSection = output.split('===TIMEDATECTL===')[1]?.split('===DATE_UTC===')[0] || '';
  const dateUtc = (output.split('===DATE_UTC===')[1]?.split('===DATE_LOCAL===')[0] || '').trim();
  const dateLocal = (output.split('===DATE_LOCAL===')[1]?.split('===TZ_CAT===')[0] || '').trim();
  const tzCat = (output.split('===TZ_CAT===')[1] || '').trim().replace(/^.*zoneinfo\//, '');

  let localTime = dateLocal;
  let utcTime = dateUtc;
  let timezone = tzCat || 'UTC';
  let ntpActive = false;
  let ntpSynchronized = false;

  if (timedatectlSection.trim()) {
    const localMatch = timedatectlSection.match(/Local time:\s*([^\n\r]+)/i);
    if (localMatch) localTime = localMatch[1].trim();

    const utcMatch = timedatectlSection.match(/Universal time:\s*([^\n\r]+)/i);
    if (utcMatch) utcTime = utcMatch[1].trim();

    const tzMatch = timedatectlSection.match(/Time zone:\s*([^\s(]+)/i);
    if (tzMatch) timezone = tzMatch[1].trim();

    const ntpMatch = timedatectlSection.match(/NTP service:\s*(active|yes)/i) || timedatectlSection.match(/Network time on:\s*yes/i);
    if (ntpMatch) ntpActive = true;

    const syncMatch = timedatectlSection.match(/System clock synchronized:\s*yes/i) || timedatectlSection.match(/NTP synchronized:\s*yes/i);
    if (syncMatch) ntpSynchronized = true;
  }

  return {
    localTime,
    utcTime,
    universalTime: utcTime,
    timezone,
    tzIdentifier: timezone,
    timeZone: timezone,
    ntpActive,
    ntpSynchronized,
    ntpEnabled: ntpActive,
  };
}

export async function updateLinuxTimezoneSSH(
  server: RemoteServer,
  timezone: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const cleanTz = (timezone || '').trim();
  if (!cleanTz) throw new Error('Timezone string is required (e.g. Asia/Tehran, UTC).');

  const script = `export LC_ALL=C
if command -v timedatectl >/dev/null 2>&1; then
  sudo timedatectl set-timezone "${cleanTz}"
else
  sudo ln -sf "/usr/share/zoneinfo/${cleanTz}" /etc/localtime
  echo "${cleanTz}" | sudo tee /etc/timezone >/dev/null
fi
echo "TZ_UPDATE_SUCCESS"
`;

  await runAdaptiveSshCommand(server, script, ephemeralPassword, 8000);
  return {
    success: true,
    message: `Timezone updated to ${cleanTz} successfully.`,
  };
}

export async function updateLinuxNtpSSH(
  server: RemoteServer,
  enabled: boolean,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const script = `export LC_ALL=C
if command -v timedatectl >/dev/null 2>&1; then
  sudo timedatectl set-ntp ${enabled ? 'true' : 'false'}
fi
echo "NTP_UPDATE_SUCCESS"
`;

  await runAdaptiveSshCommand(server, script, ephemeralPassword, 8000);
  return {
    success: true,
    message: `NTP synchronization ${enabled ? 'enabled' : 'disabled'} successfully.`,
  };
}

export async function updateLinuxTimeSSH(
  server: RemoteServer,
  datetime: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const cleanDt = (datetime || '').trim();
  if (!cleanDt) throw new Error('Valid date-time string is required (YYYY-MM-DD HH:MM:SS).');

  const script = `export LC_ALL=C
if command -v timedatectl >/dev/null 2>&1; then
  sudo timedatectl set-ntp false 2>/dev/null || true
  sudo timedatectl set-time "${cleanDt}"
else
  sudo date -s "${cleanDt}"
fi
echo "TIME_SET_SUCCESS"
`;

  await runAdaptiveSshCommand(server, script, ephemeralPassword, 8000);
  return {
    success: true,
    message: `System clock manually set to ${cleanDt}.`,
  };
}
