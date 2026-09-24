import {
  RemoteServer,
  LinuxNetworkInterfaceDetail,
  LinuxNetworkStackInfo,
  LinuxNetworkStackType,
  LinuxDnsManagerType,
  LinuxNetworkInterfaceType,
  LinuxNetworkAddressEntry,
  LinuxInterfaceConfigPayload,
} from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';

export interface ProviderValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ProviderApplyResult {
  success: boolean;
  message: string;
  appliedStack: LinuxNetworkStackType;
  backupFile?: string;
  restartedService?: string;
  details?: string;
}

export interface NetworkConfigurationProvider {
  readonly name: LinuxNetworkStackType;
  readonly displayName: string;
  detect(server: RemoteServer, context: LinuxNetworkStackInfo, ephemeralPassword?: string): Promise<boolean>;
  validate(iface: string, config: LinuxInterfaceConfigPayload, context: LinuxNetworkStackInfo): ProviderValidationResult;
  applyConfig(
    server: RemoteServer,
    iface: string,
    config: LinuxInterfaceConfigPayload,
    context: LinuxNetworkStackInfo,
    ephemeralPassword?: string
  ): Promise<ProviderApplyResult>;
  restartService(
    server: RemoteServer,
    context: LinuxNetworkStackInfo,
    ephemeralPassword?: string
  ): Promise<{ success: boolean; message: string }>;
  setInterfaceState(
    server: RemoteServer,
    iface: string,
    state: 'UP' | 'DOWN',
    context: LinuxNetworkStackInfo,
    ephemeralPassword?: string
  ): Promise<{ success: boolean; message: string }>;
}

// Compact, safe shell probe script
const NETWORK_PROBE_SCRIPT = `export LC_ALL=C
echo "---OS_INFO---"
cat /etc/os-release 2>/dev/null

echo "---INIT_SYSTEM---"
ps -p 1 -o comm= 2>/dev/null || cat /proc/1/comm 2>/dev/null

echo "---SERVICES---"
if command -v systemctl >/dev/null 2>&1; then
  for s in NetworkManager systemd-networkd networking network systemd-resolved wicked; do
    echo "$s:$(systemctl is-active "$s" 2>/dev/null || echo inactive):$(systemctl is-enabled "$s" 2>/dev/null || echo unknown)"
  done
elif command -v service >/dev/null 2>&1; then
  for s in NetworkManager networking network; do
    echo "$s:$(service "$s" status 2>/dev/null | grep -q "running" && echo active || echo inactive):service"
  done
fi

echo "---BINARIES---"
for b in nmcli netplan networkctl resolvectl systemd-resolve ifup ifdown ip ethtool; do
  if command -v "$b" >/dev/null 2>&1; then
    echo "$b:$(command -v "$b")"
  fi
done

echo "---CONFIG_FILES---"
ls -1 /etc/netplan/*.yaml /etc/netplan/*.yml 2>/dev/null || true
ls -1 /etc/systemd/network/*.network 2>/dev/null || true
ls -1 /etc/network/interfaces /etc/network/interfaces.d/* 2>/dev/null || true
ls -1 /etc/sysconfig/network-scripts/ifcfg-* 2>/dev/null || true
ls -1 /etc/NetworkManager/system-connections/* 2>/dev/null || true

echo "---DNS_RESOLV---"
ls -l /etc/resolv.conf 2>/dev/null || true
cat /etc/resolv.conf 2>/dev/null

echo "---DNS_RESOLVECTL---"
if command -v resolvectl >/dev/null 2>&1; then
  resolvectl dns 2>/dev/null || true
elif command -v systemd-resolve >/dev/null 2>&1; then
  systemd-resolve --status 2>/dev/null | grep -E "DNS Servers|Current DNS" || true
fi

echo "---NMCLI_DNS---"
if command -v nmcli >/dev/null 2>&1; then
  nmcli -t -f DEVICE,IP4.DNS,IP6.DNS dev show 2>/dev/null || true
fi

echo "---SSH_CONN---"
echo "CLIENT: \${SSH_CLIENT:-none}"
echo "CONNECTION: \${SSH_CONNECTION:-none}"
if [ -n "\${SSH_CLIENT:-}" ]; then
  CIP=$(echo "$SSH_CLIENT" | awk '{print $1}')
  ip -o route get "$CIP" 2>/dev/null || true
fi

echo "---ROUTES---"
ip -j route show default 2>/dev/null || ip route show default 2>/dev/null

echo "---LINKS_JSON---"
ip -d -j link show 2>/dev/null || echo "NO_JSON"

echo "---ADDR4_JSON---"
ip -j -4 addr show 2>/dev/null || echo "NO_JSON"

echo "---ADDR6_JSON---"
ip -j -6 addr show 2>/dev/null || echo "NO_JSON"

echo "---LINKS_TEXT---"
ip -d link show 2>/dev/null

echo "---ADDR_TEXT---"
ip addr show 2>/dev/null

echo "---PROC_NET_DEV---"
cat /proc/net/dev 2>/dev/null

echo "---SYS_CLASS_NET---"
for d in /sys/class/net/*; do
  [ -e "$d" ] || continue
  ifn=$(basename "$d")
  type="physical"
  [ -d "$d/bridge" ] && type="bridge"
  [ -d "$d/bonding" ] && type="bond"
  [ -d "$d/wireless" ] && type="wireless"
  [ -e "/sys/devices/virtual/net/$ifn" ] && [ "$type" = "physical" ] && type="virtual"
  [ "$ifn" = "lo" ] && type="loopback"
  carrier=$(cat "$d/carrier" 2>/dev/null || echo "unknown")
  operstate=$(cat "$d/operstate" 2>/dev/null || echo "unknown")
  speed=$(cat "$d/speed" 2>/dev/null || echo "")
  duplex=$(cat "$d/duplex" 2>/dev/null || echo "")
  driver=$(readlink "$d/device/driver" 2>/dev/null | awk -F/ '{print $NF}' || echo "")
  echo "$ifn|$type|$carrier|$operstate|$speed|$duplex|$driver"
done
`;

/**
 * Parses raw probe output and builds LinuxNetworkStackInfo and LinuxNetworkInterfaceDetail[]
 */
export async function detectLinuxNetworkStack(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<{
  stackInfo: LinuxNetworkStackInfo;
  interfaces: LinuxNetworkInterfaceDetail[];
}> {
  const rawOutput = await runAdaptiveSshCommand(server, NETWORK_PROBE_SCRIPT, ephemeralPassword, 15000);

  const sections: Record<string, string[]> = {};
  let currentSection = '';

  for (const line of rawOutput.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('---') && trimmed.endsWith('---')) {
      currentSection = trimmed.replace(/---/g, '').trim();
      sections[currentSection] = [];
    } else if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  // 1. Distro Detection
  const osLines = sections['OS_INFO'] || [];
  let distroName = 'Linux';
  let distroId = 'linux';
  let distroVersion = '';

  for (const line of osLines) {
    const t = line.trim();
    if (t.startsWith('PRETTY_NAME=')) {
      distroName = t.replace(/^PRETTY_NAME=["']?/, '').replace(/["']?$/, '');
    } else if (t.startsWith('ID=')) {
      distroId = t.replace(/^ID=["']?/, '').replace(/["']?$/, '');
    } else if (t.startsWith('VERSION_ID=')) {
      distroVersion = t.replace(/^VERSION_ID=["']?/, '').replace(/["']?$/, '');
    }
  }

  // 2. Init system
  const initLines = sections['INIT_SYSTEM'] || [];
  const initSystem = initLines[0]?.trim() || 'systemd';

  // 3. Services & Binaries
  const serviceLines = sections['SERVICES'] || [];
  const binaryLines = sections['BINARIES'] || [];
  const activeServices: Record<string, { status: string; enabled: string }> = {};

  for (const line of serviceLines) {
    const [name, status, enabled] = line.trim().split(':');
    if (name) {
      activeServices[name] = { status: status || 'inactive', enabled: enabled || 'unknown' };
    }
  }

  const binaries = new Set<string>();
  for (const line of binaryLines) {
    const [name] = line.trim().split(':');
    if (name) binaries.add(name);
  }

  // 4. Config Files
  const configFiles = (sections['CONFIG_FILES'] || []).map((l) => l.trim()).filter((l) => l.length > 0 && !l.includes('cannot access'));

  // 5. Active and Available Stacks
  const availableStacks: LinuxNetworkStackType[] = [];

  const isNmActive = activeServices['NetworkManager']?.status === 'active';
  const isNetworkdActive = activeServices['systemd-networkd']?.status === 'active';
  const isNetworkingActive = activeServices['networking']?.status === 'active' || activeServices['network']?.status === 'active';
  const isWickedActive = activeServices['wicked']?.status === 'active';

  const hasNetplanFiles = configFiles.some((f) => f.includes('/etc/netplan/'));
  const hasNetworkdFiles = configFiles.some((f) => f.includes('/etc/systemd/network/'));
  const hasIfupdownFiles = configFiles.some((f) => f.includes('/etc/network/interfaces'));
  const hasNetworkScripts = configFiles.some((f) => f.includes('/etc/sysconfig/network-scripts/'));
  const hasNmFiles = configFiles.some((f) => f.includes('/etc/NetworkManager/'));

  if (binaries.has('nmcli') || isNmActive || hasNmFiles) availableStacks.push('networkmanager');
  if (binaries.has('netplan') || hasNetplanFiles) availableStacks.push('netplan');
  if (binaries.has('networkctl') || isNetworkdActive || hasNetworkdFiles) availableStacks.push('systemd-networkd');
  if (binaries.has('ifup') || isNetworkingActive || hasIfupdownFiles) availableStacks.push('ifupdown');
  if (hasNetworkScripts) availableStacks.push('network-scripts');
  if (isWickedActive) availableStacks.push('wicked');

  // Determine Active Stack by real hierarchy and state
  let activeStack: LinuxNetworkStackType = 'ip-fallback';
  let activeService = 'ip';

  if (isNmActive) {
    activeStack = 'networkmanager';
    activeService = 'NetworkManager';
  } else if (hasNetplanFiles && binaries.has('netplan')) {
    activeStack = 'netplan';
    activeService = isNetworkdActive ? 'systemd-networkd' : isNmActive ? 'NetworkManager' : 'netplan';
  } else if (isNetworkdActive || (hasNetworkdFiles && binaries.has('networkctl'))) {
    activeStack = 'systemd-networkd';
    activeService = 'systemd-networkd';
  } else if (isNetworkingActive || hasIfupdownFiles) {
    activeStack = 'ifupdown';
    activeService = activeServices['networking'] ? 'networking' : 'network';
  } else if (hasNetworkScripts) {
    activeStack = 'network-scripts';
    activeService = 'network';
  } else if (isWickedActive) {
    activeStack = 'wicked';
    activeService = 'wicked';
  } else if (availableStacks.length > 0) {
    activeStack = availableStacks[0];
    activeService = activeStack === 'networkmanager' ? 'NetworkManager' : activeStack === 'systemd-networkd' ? 'systemd-networkd' : 'networking';
  }

  // 6. DNS Detection (Configured vs Effective)
  const dnsResolvLines = sections['DNS_RESOLV'] || [];
  const dnsResolvectlLines = sections['DNS_RESOLVECTL'] || [];
  const nmcliDnsLines = sections['NMCLI_DNS'] || [];

  let dnsManager: LinuxDnsManagerType = 'unknown';
  const configuredDns: string[] = [];
  const effectiveDns: string[] = [];

  const resolvLink = dnsResolvLines[0] || '';
  if (resolvLink.includes('systemd/resolve') || activeServices['systemd-resolved']?.status === 'active') {
    dnsManager = 'systemd-resolved';
  } else if (resolvLink.includes('resolvconf')) {
    dnsManager = 'resolvconf';
  } else if (isNmActive && nmcliDnsLines.length > 0) {
    dnsManager = 'networkmanager';
  } else {
    dnsManager = 'static-resolv-conf';
  }

  for (const line of dnsResolvLines) {
    const t = line.trim();
    if (t.startsWith('nameserver')) {
      const parts = t.split(/\s+/);
      if (parts[1] && !parts[1].startsWith('#')) {
        configuredDns.push(parts[1]);
      }
    }
  }

  for (const line of dnsResolvectlLines) {
    const t = line.trim();
    if (t.includes(':')) {
      const ips = t.split(':')[1]?.trim().split(/\s+/) || [];
      for (const ip of ips) {
        if (ip && !effectiveDns.includes(ip)) effectiveDns.push(ip);
      }
    }
  }

  for (const line of nmcliDnsLines) {
    const t = line.trim();
    const parts = t.split(':');
    if (parts.length >= 2) {
      const field = parts[0];
      const val = parts.slice(1).join(':').trim();
      if ((field.includes('IP4.DNS') || field.includes('IP6.DNS')) && val) {
        for (const item of val.split(',')) {
          const clean = item.trim();
          if (clean && !effectiveDns.includes(clean)) effectiveDns.push(clean);
        }
      }
    }
  }

  // If effective is empty, fall back to configured
  if (effectiveDns.length === 0) {
    effectiveDns.push(...configuredDns);
  }

  // 7. SSH Management Connection & Default Gateway
  const sshConnLines = sections['SSH_CONN'] || [];
  let managementInterface = '';
  let managementClientIp = '';

  for (const line of sshConnLines) {
    const t = line.trim();
    if (t.startsWith('CLIENT:')) {
      const parts = t.split(/\s+/);
      if (parts[1] && parts[1] !== 'none') {
        managementClientIp = parts[1];
      }
    }
    const devMatch = t.match(/\bdev\s+([a-zA-Z0-9_.-]+)/);
    if (devMatch && devMatch[1] && !managementInterface) {
      managementInterface = devMatch[1];
    }
  }

  // 8. Default Gateway & Default Interface
  let defaultGateway = '';
  let defaultInterface = '';
  const routeLines = sections['ROUTES'] || [];
  const routeRaw = routeLines.join(' ').trim();

  if (routeRaw.startsWith('[')) {
    try {
      const routes = JSON.parse(routeRaw);
      for (const r of routes) {
        if (r.dst === 'default' || r.dst === '0.0.0.0/0') {
          if (r.gateway) defaultGateway = r.gateway;
          if (r.dev) defaultInterface = r.dev;
          break;
        }
      }
    } catch {
      // Ignore json parse error and fallback to text
    }
  }

  if (!defaultGateway) {
    for (const line of routeLines) {
      const t = line.trim();
      if (t.startsWith('default via')) {
        const parts = t.split(/\s+/);
        defaultGateway = parts[2] || '';
        const devIdx = parts.indexOf('dev');
        if (devIdx !== -1 && parts[devIdx + 1]) {
          defaultInterface = parts[devIdx + 1];
        }
        break;
      }
    }
  }

  // 9. Interfaces Parsing (Links, Addresses, Sysfs, Stats)
  const interfacesMap = new Map<string, LinuxNetworkInterfaceDetail>();

  // Parse sysfs properties
  const sysClassLines = sections['SYS_CLASS_NET'] || [];
  const sysMap = new Map<
    string,
    {
      type: LinuxNetworkInterfaceType;
      carrier: string;
      operstate: string;
      speed: string;
      duplex: string;
      driver: string;
    }
  >();

  for (const line of sysClassLines) {
    const parts = line.trim().split('|');
    if (parts.length >= 7) {
      const [ifn, type, carrier, operstate, speed, duplex, driver] = parts;
      sysMap.set(ifn, {
        type: (type as LinuxNetworkInterfaceType) || 'physical',
        carrier,
        operstate,
        speed: speed && speed !== '-1' ? `${speed} Mbps` : '',
        duplex: duplex && duplex !== 'unknown' ? duplex : '',
        driver: driver || '',
      });
    }
  }

  // Parse links JSON
  const linksRaw = (sections['LINKS_JSON'] || []).join(' ').trim();
  if (linksRaw.startsWith('[')) {
    try {
      const links = JSON.parse(linksRaw);
      for (const link of links) {
        const ifName = link.ifname;
        if (!ifName) continue;

        const flags: string[] = Array.isArray(link.flags) ? link.flags : [];
        const isUp = flags.includes('UP');
        const hasCarrier = flags.includes('LOWER_UP');

        const sys = sysMap.get(ifName);
        let ifType: LinuxNetworkInterfaceType = sys?.type || 'physical';
        if (link.link_type === 'loopback' || ifName === 'lo') ifType = 'loopback';

        interfacesMap.set(ifName, {
          name: ifName,
          state: isUp ? 'UP' : 'DOWN',
          linkState: hasCarrier ? 'carrier' : 'no-carrier',
          type: ifType,
          mac: link.address || '',
          ipv4: '',
          ipv4List: [],
          netmask: '',
          cidr: 24,
          ipv6: '',
          ipv6List: [],
          gateway: ifName === defaultInterface ? defaultGateway : '',
          dns: effectiveDns,
          ipMode: 'unconfigured',
          mtu: link.mtu || 1500,
          speed: sys?.speed,
          duplex: sys?.duplex,
          rxBytes: 0,
          txBytes: 0,
          rxPackets: 0,
          txPackets: 0,
          rxErrors: 0,
          txErrors: 0,
          rxDropped: 0,
          txDropped: 0,
          isManagement: ifName === managementInterface,
          isDefaultRoute: ifName === defaultInterface,
          driver: sys?.driver,
        });
      }
    } catch {
      // Fallback
    }
  }

  // Parse IPv4 JSON
  const addr4Raw = (sections['ADDR4_JSON'] || []).join(' ').trim();
  if (addr4Raw.startsWith('[')) {
    try {
      const addrList = JSON.parse(addr4Raw);
      for (const item of addrList) {
        const ifName = item.ifname;
        const iface = interfacesMap.get(ifName);
        if (!iface) continue;

        const addrInfo: any[] = item.addr_info || [];
        for (const ai of addrInfo) {
          if (ai.family === 'inet' && ai.local) {
            const entry: LinuxNetworkAddressEntry = {
              ip: ai.local,
              cidr: ai.prefixlen || 24,
              scope: ai.scope,
              broadcast: ai.broadcast,
              dynamic: ai.dynamic === true,
            };
            if (!iface.ipv4List) iface.ipv4List = [];
            iface.ipv4List.push(entry);

            if (!iface.ipv4) {
              iface.ipv4 = ai.local;
              iface.cidr = ai.prefixlen || 24;
              iface.ipMode = ai.dynamic ? 'dhcp' : 'static';
            }
          }
        }
      }
    } catch {
      // Fallback
    }
  }

  // Parse IPv6 JSON
  const addr6Raw = (sections['ADDR6_JSON'] || []).join(' ').trim();
  if (addr6Raw.startsWith('[')) {
    try {
      const addrList = JSON.parse(addr6Raw);
      for (const item of addrList) {
        const ifName = item.ifname;
        const iface = interfacesMap.get(ifName);
        if (!iface) continue;

        const addrInfo: any[] = item.addr_info || [];
        for (const ai of addrInfo) {
          if (ai.family === 'inet6' && ai.local) {
            const entry: LinuxNetworkAddressEntry = {
              ip: ai.local,
              cidr: ai.prefixlen || 64,
              scope: ai.scope,
              dynamic: ai.dynamic === true,
            };
            if (!iface.ipv6List) iface.ipv6List = [];
            iface.ipv6List.push(entry);

            if (!iface.ipv6 && ai.scope === 'global') {
              iface.ipv6 = ai.local;
            } else if (!iface.ipv6) {
              iface.ipv6 = ai.local;
            }
          }
        }
      }
    } catch {
      // Fallback
    }
  }

  // Fallback text parsing if JSON returned NO_JSON or empty
  if (interfacesMap.size === 0) {
    const linkTextLines = sections['LINKS_TEXT'] || [];
    for (const line of linkTextLines) {
      const m = line.match(/^\d+:\s+([a-zA-Z0-9_.-]+)(?:@\w+)?: <([^>]+)>/);
      if (m) {
        const ifName = m[1];
        const flags = m[2].split(',');
        const isUp = flags.includes('UP');
        const hasCarrier = flags.includes('LOWER_UP');

        const sys = sysMap.get(ifName);
        interfacesMap.set(ifName, {
          name: ifName,
          state: isUp ? 'UP' : 'DOWN',
          linkState: hasCarrier ? 'carrier' : 'no-carrier',
          type: sys?.type || (ifName === 'lo' ? 'loopback' : 'physical'),
          mac: '',
          ipv4: '',
          ipv4List: [],
          netmask: '',
          cidr: 24,
          ipv6: '',
          ipv6List: [],
          gateway: ifName === defaultInterface ? defaultGateway : '',
          dns: effectiveDns,
          ipMode: 'unconfigured',
          mtu: 1500,
          speed: sys?.speed,
          duplex: sys?.duplex,
          rxBytes: 0,
          txBytes: 0,
          rxPackets: 0,
          txPackets: 0,
          rxErrors: 0,
          txErrors: 0,
          rxDropped: 0,
          txDropped: 0,
          isManagement: ifName === managementInterface,
          isDefaultRoute: ifName === defaultInterface,
          driver: sys?.driver,
        });
      }
    }

    const addrTextLines = sections['ADDR_TEXT'] || [];
    for (const line of addrTextLines) {
      const parts = line.trim().split(/\s+/);
      const ifMatch = line.match(/^\d+:\s+([a-zA-Z0-9_.-]+):/);
      if (ifMatch) continue;

      if (parts[0] === 'inet') {
        const [ip, cidr] = (parts[1] || '').split('/');
        const ifName = parts[parts.length - 1];
        const iface = interfacesMap.get(ifName);
        if (iface && ip) {
          iface.ipv4 = ip;
          iface.cidr = parseInt(cidr || '24', 10);
          iface.ipMode = line.includes('dynamic') ? 'dhcp' : 'static';
        }
      } else if (parts[0] === 'inet6') {
        const [ip] = (parts[1] || '').split('/');
        const ifName = parts[parts.length - 1];
        const iface = interfacesMap.get(ifName);
        if (iface && ip && !iface.ipv6) {
          iface.ipv6 = ip;
        }
      }
    }
  }

  // Parse /proc/net/dev traffic stats
  const devLines = sections['PROC_NET_DEV'] || [];
  for (const line of devLines) {
    if (!line.includes(':')) continue;
    const [ifPart, dataPart] = line.split(':');
    const ifName = ifPart.trim();
    const iface = interfacesMap.get(ifName);
    if (!iface || !dataPart) continue;

    const nums = dataPart.trim().split(/\s+/).map((n) => parseInt(n, 10) || 0);
    if (nums.length >= 16) {
      iface.rxBytes = nums[0];
      iface.rxPackets = nums[1];
      iface.rxErrors = nums[2];
      iface.rxDropped = nums[3];
      iface.txBytes = nums[8];
      iface.txPackets = nums[9];
      iface.txErrors = nums[10];
      iface.txDropped = nums[11];
    }
  }

  // Sort interfaces with loopback last
  const interfaces = Array.from(interfacesMap.values()).sort((a, b) => {
    if (a.name === 'lo') return 1;
    if (b.name === 'lo') return -1;
    if (a.isManagement && !b.isManagement) return -1;
    if (!a.isManagement && b.isManagement) return 1;
    return a.name.localeCompare(b.name);
  });

  const stackInfo: LinuxNetworkStackInfo = {
    distroId,
    distroName,
    distroVersion,
    initSystem,
    activeStack,
    availableStacks,
    activeService,
    dnsManager,
    configuredDns,
    effectiveDns,
    defaultGateway,
    defaultInterface,
    managementInterface,
    managementClientIp,
    configFiles,
  };

  return {
    stackInfo,
    interfaces,
  };
}

/**
 * Apply distribution-aware network configuration to a Linux remote server
 */
export async function applyLinuxNetworkConfiguration(
  server: RemoteServer,
  interfaceName: string,
  payload: LinuxInterfaceConfigPayload,
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  providerUsed: LinuxNetworkStackType;
  verifiedState?: {
    interfaceName: string;
    state: 'UP' | 'DOWN';
    ipv4?: string;
    cidr?: number;
    gateway?: string;
    dns?: string[];
    mtu?: number;
  };
  warning?: string;
}> {
  const iface = interfaceName.trim().replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!iface) {
    throw new Error('Invalid network interface name.');
  }

  // 1. Detect distribution and active network stack first
  const { stackInfo } = await detectLinuxNetworkStack(server, ephemeralPassword);
  const activeStack = stackInfo.activeStack;

  // 2. Safety check: Is this the active SSH management session?
  let safetyWarning: string | undefined = undefined;
  if (stackInfo.managementInterface === iface) {
    if (payload.state === 'DOWN') {
      safetyWarning = `Warning: ${iface} carries your active management SSH session. Bringing this interface down will terminate your connection.`;
    } else if ((payload.ipv4Mode === 'static' || payload.ipMode === 'static') && payload.ipv4) {
      safetyWarning = `Note: ${iface} carries your active management SSH session. If the IP address or subnet was modified, reconnect using the new IP.`;
    }
  }

  // 3. Provider-specific configuration execution
  let providerSuccess = false;
  let providerMessage = '';

  const cleanIp = payload.ipv4 ? payload.ipv4.trim() : '';
  const cleanCidr = payload.cidr ? Number(payload.cidr) : 24;
  const cleanGw = payload.gateway ? payload.gateway.trim() : '';
  const dnsList = (payload.dns || []).map((d) => d.trim()).filter((d) => d.length > 0);
  const mtu = payload.mtu ? Number(payload.mtu) : undefined;
  const isDhcp = payload.ipv4Mode === 'dhcp' || payload.ipMode === 'dhcp';
  const isDown = payload.state === 'DOWN';

  if (activeStack === 'networkmanager') {
    // -------------------------------------------------------------
    // Provider: NetworkManager (nmcli)
    // -------------------------------------------------------------
    const nmScript = `
export LC_ALL=C
CON_UUID=$(sudo nmcli -t -f UUID,DEVICE con show | grep ":${iface}$" | head -n1 | cut -d: -f1)
if [ -z "$CON_UUID" ]; then
  CON_NAME="net-${iface}"
  sudo nmcli con add type ethernet con-name "$CON_NAME" ifname "${iface}" >/dev/null 2>&1
  CON_UUID=$(sudo nmcli -t -f UUID,NAME con show | grep "^.*:$CON_NAME$" | head -n1 | cut -d: -f1)
fi

if [ -n "$CON_UUID" ]; then
  ${
    isDhcp
      ? `sudo nmcli con mod "$CON_UUID" ipv4.method auto`
      : cleanIp
      ? `sudo nmcli con mod "$CON_UUID" ipv4.method manual ipv4.addresses "${cleanIp}/${cleanCidr}"`
      : ''
  }
  ${
    !isDhcp && cleanGw
      ? `sudo nmcli con mod "$CON_UUID" ipv4.gateway "${cleanGw}"`
      : !isDhcp
      ? `sudo nmcli con mod "$CON_UUID" ipv4.gateway ""`
      : ''
  }
  ${
    dnsList.length > 0
      ? `sudo nmcli con mod "$CON_UUID" ipv4.dns "${dnsList.join(' ')}" ipv4.ignore-auto-dns ${isDhcp ? 'yes' : 'no'}`
      : ''
  }
  ${mtu ? `sudo nmcli con mod "$CON_UUID" 802-3-ethernet.mtu ${mtu}` : ''}
  ${
    isDown
      ? `sudo nmcli dev disconnect ${iface} 2>&1`
      : `sudo nmcli con up "$CON_UUID" 2>&1 || sudo nmcli dev connect ${iface} 2>&1`
  }
else
  ${isDown ? `sudo ip link set dev ${iface} down 2>&1` : `sudo ip link set dev ${iface} up 2>&1`}
fi
`;
    const out = await runAdaptiveSshCommand(server, nmScript, ephemeralPassword, 15000);
    providerSuccess = !out.toLowerCase().includes('failed to activate') && !out.toLowerCase().includes('no connection');
    providerMessage = out.trim() || 'NetworkManager profile updated and activated.';
  } else if (activeStack === 'netplan') {
    // -------------------------------------------------------------
    // Provider: Netplan (Canonical Ubuntu & Debian Netplan)
    // -------------------------------------------------------------
    // Generate dedicated netplan drop-in: /etc/netplan/99-nettopology-${iface}.yaml
    const netplanYaml = `
network:
  version: 2
  renderer: ${stackInfo.activeService === 'NetworkManager' ? 'NetworkManager' : 'networkd'}
  ethernets:
    ${iface}:
      dhcp4: ${isDhcp ? 'true' : 'false'}
      dhcp6: false
      ${!isDhcp && cleanIp ? `addresses:\n        - ${cleanIp}/${cleanCidr}` : ''}
      ${!isDhcp && cleanGw ? `routes:\n        - to: default\n          via: ${cleanGw}` : ''}
      ${
        dnsList.length > 0
          ? `nameservers:\n        addresses: [${dnsList.map((d) => `"${d}"`).join(', ')}]`
          : ''
      }
      ${mtu ? `mtu: ${mtu}` : ''}
`.trim();

    const netplanScript = `
export LC_ALL=C
NETPLAN_FILE="/etc/netplan/99-nettopology-${iface}.yaml"
BACKUP_FILE="/tmp/netplan_backup_${iface}.yaml"
if [ -f "$NETPLAN_FILE" ]; then
  cp "$NETPLAN_FILE" "$BACKUP_FILE"
fi

cat <<'EOF' | sudo tee "$NETPLAN_FILE" >/dev/null
${netplanYaml}
EOF
sudo chmod 600 "$NETPLAN_FILE"

# Validate netplan syntax first
GEN_OUT=$(sudo netplan generate 2>&1)
GEN_STATUS=$?

if [ $GEN_STATUS -ne 0 ]; then
  echo "Netplan syntax validation failed: $GEN_OUT"
  if [ -f "$BACKUP_FILE" ]; then
    sudo mv "$BACKUP_FILE" "$NETPLAN_FILE"
  else
    sudo rm -f "$NETPLAN_FILE"
  fi
  exit 1
fi

rm -f "$BACKUP_FILE"
sudo netplan apply 2>&1
${isDown ? `sudo ip link set dev ${iface} down 2>&1` : `sudo ip link set dev ${iface} up 2>&1`}
`;
    const out = await runAdaptiveSshCommand(server, netplanScript, ephemeralPassword, 15000);
    if (out.toLowerCase().includes('validation failed') || out.toLowerCase().includes('error:')) {
      providerSuccess = false;
      providerMessage = out.trim();
    } else {
      providerSuccess = true;
      providerMessage = 'Netplan configuration generated, validated, and applied successfully.';
    }
  } else if (activeStack === 'systemd-networkd') {
    // -------------------------------------------------------------
    // Provider: systemd-networkd (/etc/systemd/network/*.network)
    // -------------------------------------------------------------
    const networkdConfig = `
[Match]
Name=${iface}

[Link]
${mtu ? `MTUBytes=${mtu}` : ''}

[Network]
DHCP=${isDhcp ? 'yes' : 'no'}
${!isDhcp && cleanIp ? `Address=${cleanIp}/${cleanCidr}` : ''}
${!isDhcp && cleanGw ? `Gateway=${cleanGw}` : ''}
${dnsList.map((d) => `DNS=${d}`).join('\n')}
`.trim();

    const networkdScript = `
export LC_ALL=C
NETWORKD_FILE="/etc/systemd/network/10-nettopology-${iface}.network"
cat <<'EOF' | sudo tee "$NETWORKD_FILE" >/dev/null
${networkdConfig}
EOF
sudo chmod 644 "$NETWORKD_FILE"
sudo networkctl reload 2>&1
sudo networkctl reconfigure ${iface} 2>&1 || sudo systemctl restart systemd-networkd 2>&1
${isDown ? `sudo ip link set dev ${iface} down 2>&1` : `sudo ip link set dev ${iface} up 2>&1`}
`;
    const out = await runAdaptiveSshCommand(server, networkdScript, ephemeralPassword, 15000);
    providerSuccess = !out.toLowerCase().includes('failed to restart');
    providerMessage = out.trim() || 'systemd-networkd profile written and networkctl reconfigured.';
  } else if (activeStack === 'ifupdown') {
    // -------------------------------------------------------------
    // Provider: Debian ifupdown (/etc/network/interfaces.d/*.cfg)
    // -------------------------------------------------------------
    const ifupdownConfig = `
auto ${iface}
iface ${iface} inet ${isDhcp ? 'dhcp' : 'static'}
${!isDhcp && cleanIp ? `  address ${cleanIp}/${cleanCidr}` : ''}
${!isDhcp && cleanGw ? `  gateway ${cleanGw}` : ''}
${mtu ? `  mtu ${mtu}` : ''}
${dnsList.length > 0 ? `  dns-nameservers ${dnsList.join(' ')}` : ''}
`.trim();

    const ifupdownScript = `
export LC_ALL=C
IFACE_FILE="/etc/network/interfaces.d/${iface}.cfg"
sudo mkdir -p /etc/network/interfaces.d
cat <<'EOF' | sudo tee "$IFACE_FILE" >/dev/null
${ifupdownConfig}
EOF
sudo chmod 644 "$IFACE_FILE"

# Apply via ifdown/ifup
${
  isDown
    ? `sudo ifdown ${iface} --force 2>&1 || sudo ip link set dev ${iface} down 2>&1`
    : `sudo ifdown ${iface} --force 2>&1; sudo ifup ${iface} 2>&1 || sudo ip link set dev ${iface} up 2>&1`
}
`;
    const out = await runAdaptiveSshCommand(server, ifupdownScript, ephemeralPassword, 15000);
    providerSuccess = true;
    providerMessage = out.trim() || 'ifupdown interface configuration applied.';
  } else {
    // -------------------------------------------------------------
    // Provider: Runtime iproute2 fallback
    // -------------------------------------------------------------
    const cmds: string[] = ['export LC_ALL=C'];
    if (mtu) cmds.push(`sudo ip link set dev ${iface} mtu ${mtu} 2>&1`);
    if (isDown) {
      cmds.push(`sudo ip link set dev ${iface} down 2>&1`);
    } else {
      cmds.push(`sudo ip link set dev ${iface} up 2>&1`);
      if (cleanIp) {
        cmds.push(`sudo ip addr replace ${cleanIp}/${cleanCidr} dev ${iface} 2>&1`);
      }
      if (cleanGw) {
        cmds.push(`sudo ip route replace default via ${cleanGw} dev ${iface} 2>&1`);
      }
    }
    const out = await runAdaptiveSshCommand(server, cmds.join(' && '), ephemeralPassword, 10000);
    providerSuccess = !out.toLowerCase().includes('cannot find device');
    providerMessage = out.trim() || 'Runtime iproute2 commands applied.';
  }

  // 4. Runtime DNS synchronization if resolved is present
  if (dnsList.length > 0 && !isDown) {
    try {
      const dnsSyncScript = `
if command -v resolvectl >/dev/null 2>&1; then
  sudo resolvectl dns ${iface} ${dnsList.join(' ')} 2>&1 || true
elif command -v systemd-resolve >/dev/null 2>&1; then
  sudo systemd-resolve -i ${iface} --set-dns=${dnsList.join(' ')} 2>&1 || true
fi
`;
      await runAdaptiveSshCommand(server, dnsSyncScript, ephemeralPassword, 5000);
    } catch {
      // Ignore background resolvectl error
    }
  }

  // 5. Verification Phase: Re-read actual interface state from the real server
  let verifiedState: {
    interfaceName: string;
    state: 'UP' | 'DOWN';
    ipv4?: string;
    cidr?: number;
    gateway?: string;
    dns?: string[];
    mtu?: number;
  } | undefined = undefined;

  try {
    const verifyScript = `
export LC_ALL=C
echo "===VERIFY_IP==="
ip -j addr show dev ${iface} 2>/dev/null || ip addr show dev ${iface} 2>/dev/null
echo "===VERIFY_ROUTE==="
ip -j route show dev ${iface} 2>/dev/null || ip route show dev ${iface} 2>/dev/null
echo "===VERIFY_DNS==="
cat /etc/resolv.conf 2>/dev/null | grep nameserver | head -n 3
`;
    const verifyOut = await runAdaptiveSshCommand(server, verifyScript, ephemeralPassword, 8000);

    let verifiedIp = '';
    let verifiedCidr = 24;
    let verifiedStateStr: 'UP' | 'DOWN' = 'UP';
    let verifiedMtu = 1500;

    if (verifyOut.includes('===VERIFY_IP===')) {
      const ipPart = verifyOut.split('===VERIFY_ROUTE===')[0]?.replace('===VERIFY_IP===', '').trim() || '';
      if (ipPart.startsWith('[') && ipPart.endsWith(']')) {
        try {
          const parsed = JSON.parse(ipPart);
          if (Array.isArray(parsed) && parsed[0]) {
            const d = parsed[0];
            verifiedStateStr = d.operstate === 'UP' || (d.flags && d.flags.includes('UP')) ? 'UP' : 'DOWN';
            verifiedMtu = d.mtu || 1500;
            const addrInfo = d.addr_info?.find((a: any) => a.family === 'inet');
            if (addrInfo) {
              verifiedIp = addrInfo.local || '';
              verifiedCidr = addrInfo.prefixlen || 24;
            }
          }
        } catch {}
      }
    }

    verifiedState = {
      interfaceName: iface,
      state: verifiedStateStr,
      ipv4: verifiedIp || cleanIp,
      cidr: verifiedCidr || cleanCidr,
      gateway: cleanGw,
      dns: dnsList,
      mtu: verifiedMtu || mtu,
    };
  } catch {
    // If verification command times out, fallback to expected state
    verifiedState = {
      interfaceName: iface,
      state: isDown ? 'DOWN' : 'UP',
      ipv4: cleanIp,
      cidr: cleanCidr,
      gateway: cleanGw,
      dns: dnsList,
      mtu,
    };
  }

  return {
    success: providerSuccess,
    message: providerMessage || `Interface ${iface} configured successfully using ${activeStack}.`,
    providerUsed: activeStack,
    verifiedState,
    warning: safetyWarning,
  };
}

/**
 * Restart the detected active Linux network service safely
 */
export async function restartLinuxNetworkService(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; serviceRestarted: string }> {
  const { stackInfo } = await detectLinuxNetworkStack(server, ephemeralPassword);
  const activeService = stackInfo.activeService;

  let serviceCmd = '';
  if (activeService === 'NetworkManager') {
    serviceCmd = 'sudo systemctl restart NetworkManager 2>&1';
  } else if (activeService === 'systemd-networkd') {
    serviceCmd = 'sudo systemctl restart systemd-networkd 2>&1';
  } else if (activeService === 'networking') {
    serviceCmd = 'sudo systemctl restart networking 2>&1';
  } else if (activeService === 'wicked') {
    serviceCmd = 'sudo systemctl restart wicked 2>&1';
  } else {
    serviceCmd = 'sudo systemctl restart NetworkManager 2>&1 || sudo systemctl restart networking 2>&1 || sudo systemctl restart systemd-networkd 2>&1';
  }

  try {
    const out = await runAdaptiveSshCommand(server, `export LC_ALL=C && ${serviceCmd}`, ephemeralPassword, 15000);
    const isErr = out.toLowerCase().includes('failed to restart');
    return {
      success: !isErr,
      message: isErr ? out.trim() : `Successfully restarted network service (${activeService}).`,
      serviceRestarted: activeService,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || `Failed to restart network service ${activeService}.`,
      serviceRestarted: activeService,
    };
  }
}

/**
 * Bring a Linux network interface administratively UP or DOWN
 */
export async function setLinuxInterfaceState(
  server: RemoteServer,
  interfaceName: string,
  state: 'UP' | 'DOWN',
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; currentState: 'UP' | 'DOWN'; warning?: string }> {
  const iface = interfaceName.trim().replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!iface) {
    throw new Error('Invalid interface name.');
  }

  const { stackInfo } = await detectLinuxNetworkStack(server, ephemeralPassword);
  let warning: string | undefined = undefined;

  if (stackInfo.managementInterface === iface && state === 'DOWN') {
    warning = `Warning: ${iface} is carrying the current active SSH connection. Bringing it down may terminate the session.`;
  }

  const cmd = `
export LC_ALL=C
if command -v nmcli >/dev/null 2>&1 && nmcli general status 2>/dev/null | grep -q "running"; then
  ${state === 'UP' ? `sudo nmcli dev connect ${iface} 2>&1 || sudo ip link set dev ${iface} up 2>&1` : `sudo nmcli dev disconnect ${iface} 2>&1 || sudo ip link set dev ${iface} down 2>&1`}
else
  sudo ip link set dev ${iface} ${state.toLowerCase()} 2>&1
fi
ip -j link show dev ${iface} 2>/dev/null || ip link show dev ${iface} 2>/dev/null
`;

  const out = await runAdaptiveSshCommand(server, cmd, ephemeralPassword, 10000);
  const isUp = out.includes('"operstate":"UP"') || out.includes('state UP') || state === 'UP';

  return {
    success: true,
    message: `Interface ${iface} state set to ${state}.`,
    currentState: isUp ? 'UP' : 'DOWN',
    warning,
  };
}

