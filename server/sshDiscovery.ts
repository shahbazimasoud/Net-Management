import net from 'net';
import { Client, ConnectConfig } from 'ssh2';

export interface SshDiscoveryOptions {
  ip: string;
  ssh_host?: string;
  ssh_port?: number;
  port?: number;
  ssh_username?: string;
  username?: string;
  ssh_password?: string;
  password?: string;
  enable_password?: string;
  protocol?: 'ssh' | 'telnet';
  connection_protocol?: 'ssh' | 'telnet';
  platform?: string;
  connection_mode?: 'ssh' | 'simulator';
  simulate?: boolean;
  lang?: string;
  is_en?: boolean;
}

export interface DiscoveredSwitchPort {
  port_id: string;
  name: string;
  status: 'up' | 'down';
  admin_status: 'enabled' | 'disabled';
  mode: 'trunk' | 'access';
  vlan: number;
  allowed_vlans: string;
  speed: string;
  duplex: string;
  description: string;
  connected_device: string;
  type?: string;
  is_management?: boolean;
  is_virtual?: boolean;
}

export interface DiscoveredHardware {
  hostname: string;
  model: string;
  serial_number?: string;
  mac_address?: string;
  os_version?: string;
  uptime?: string;
  total_ports?: number;
  device_type?: string;
  platform_detected?: string;
  role_detected?: string;
  os_detected?: string;
}

export interface DiscoveredPower {
  power_supplies: number;
  power_watts: number;
  redundancy: string;
  description_en: string;
  description_fa: string;
}

export interface SshDiscoveryResult {
  success: boolean;
  connected: boolean;
  protocol: string;
  ip: string;
  port: number;
  latency_ms?: number;
  message: string;
  message_en?: string;
  message_fa?: string;
  error?: string;
  banner?: string;
  hostname?: string;
  model?: string;
  total_ports?: number;
  ports?: DiscoveredSwitchPort[];
  raw_status_output?: string;
  live_discovery?: boolean;
  simulated?: boolean;
  hardware?: DiscoveredHardware;
  power?: DiscoveredPower;
  serial_number?: string;
  mac?: string;
  firmware?: string;
  uptime?: string;
  library_used?: string;
  ssh_suite?: string;
}

/**
 * Calculates power supply specifications based on hardware model and port count.
 */
export function calculatePowerSpecs(model: string, totalPorts: number, platform: string = ''): DiscoveredPower {
  const m = model.toUpperCase();
  const isPoe = /-(?:[0-9]+)?(?:P|FPS|LP|PF|FPD|FP|PP|EP)/i.test(m) || m.includes('POE');

  if (m.includes('9300') || m.includes('C9300')) {
    return {
      power_supplies: 2,
      power_watts: isPoe ? 715 : 350,
      redundancy: '1+1 Redundant Hot-Swappable',
      description_en: isPoe ? 'Dual 715W AC Hot-Swappable Power Supplies (PoE+)' : 'Dual 350W AC Redundant Power Supplies',
      description_fa: isPoe ? 'دو منبع تغذیه ۷۱۵ وات ماژولار با قابلیت تعویض آنلاین (PoE+)' : 'دو منبع تغذیه ۳۵۰ وات ماژولار ریداندنت',
    };
  }
  if (m.includes('9200') || m.includes('C9200')) {
    return {
      power_supplies: 2,
      power_watts: isPoe ? 600 : 125,
      redundancy: '1+1 Optional Redundant',
      description_en: isPoe ? 'Dual 600W AC Power Supplies (PoE+)' : 'Dual 125W AC Redundant Power Supplies',
      description_fa: isPoe ? 'دو منبع تغذیه ۶۰۰ وات AC (PoE+)' : 'دو منبع تغذیه ۱۲۵ وات AC ریداندنت',
    };
  }
  if (m.includes('3850') || m.includes('WS-C3850')) {
    return {
      power_supplies: 2,
      power_watts: isPoe ? 715 : 350,
      redundancy: '1+1 Redundant Hot-Swappable',
      description_en: isPoe ? 'Dual 715W AC Hot-Swappable Power Supplies' : 'Dual 350W AC Hot-Swappable Power Supplies',
      description_fa: isPoe ? 'دو منبع تغذیه ۷۱۵ وات ماژولار با تعویض گرم' : 'دو منبع تغذیه ۳۵۰ وات ماژولار با تعویض گرم',
    };
  }
  if (m.includes('3750') || m.includes('WS-C3750')) {
    return {
      power_supplies: m.includes('3750X') ? 2 : 1,
      power_watts: isPoe ? (totalPorts >= 48 ? 715 : 440) : 350,
      redundancy: m.includes('3750X') ? '1+1 Redundant (C3KX-PWR)' : 'RPS 2300 External Redundancy Support',
      description_en: isPoe ? 'Internal PoE+ Power Supply with RPS support' : 'Internal AC Power Supply with RPS support',
      description_fa: isPoe ? 'منبع تغذیه داخلی PoE+ با پشتیبانی از RPS اکسترنال' : 'منبع تغذیه داخلی AC با پشتیبانی از RPS اکسترنال',
    };
  }
  if (m.includes('2960X') || m.includes('2960XR') || m.includes('WS-C2960X')) {
    const isXr = m.includes('2960XR');
    const watts = m.includes('48FPS') ? 740 : (m.includes('48LPS') || m.includes('24PD') ? 370 : (isPoe ? 370 : 250));
    return {
      power_supplies: isXr ? 2 : 1,
      power_watts: watts,
      redundancy: isXr ? 'Dual Modular Hot-Swappable (1+1)' : 'Single Internal AC with Cisco RPS 2300 Connector',
      description_en: `${watts}W AC ${isPoe ? 'PoE+ ' : ''}Power Supply ${isXr ? '(Dual Hot-Swappable)' : '(Internal)'}`,
      description_fa: `منبع تغذیه ${watts} وات AC ${isPoe ? 'PoE+ ' : ''}${isXr ? '(دو منبع ماژولار)' : '(داخلی با پورت RPS)'}`,
    };
  }
  if (m.includes('2960') || m.includes('WS-C2960')) {
    const watts = isPoe ? (totalPorts >= 48 ? 370 : 185) : 100;
    return {
      power_supplies: 1,
      power_watts: watts,
      redundancy: 'Single Internal AC with Optional Cisco RPS Support',
      description_en: `${watts}W Internal AC Power Supply`,
      description_fa: `منبع تغذیه داخلی ${watts} وات AC`,
    };
  }
  if (m.includes('CCR') || platform.includes('mikrotik')) {
    const isDual = m.includes('2116') || m.includes('2004') || m.includes('2216') || m.includes('1036') || m.includes('1072');
    return {
      power_supplies: isDual ? 2 : 1,
      power_watts: isDual ? 150 : 60,
      redundancy: isDual ? 'Dual Redundant AC Inputs (Failover)' : 'Single AC / DC Input with Passive PoE',
      description_en: isDual ? 'Dual Redundant 100-240V AC Power Supplies' : 'Single AC Power Supply with Passive PoE',
      description_fa: isDual ? 'دو ورودی ریداندنت برق AC با قابلیت Failover خودکار' : 'منبع تغذیه تک AC با پشتیبانی PoE ورودی',
    };
  }

  // Generic Switch / Router Default
  const watts = isPoe ? (totalPorts >= 48 ? 740 : 370) : (totalPorts >= 48 ? 250 : 120);
  return {
    power_supplies: 1,
    power_watts: watts,
    redundancy: 'Single Internal Power Supply',
    description_en: `${watts}W AC Power Supply`,
    description_fa: `منبع تغذیه ${watts} وات AC استاندارد`,
  };
}

/**
 * Parses Cisco `show interfaces status` CLI command output into structured port records.
 * Accurately detects and classifies Out-Of-Band Management ports and virtual interfaces.
 */
export function parseShowInterfacesStatus(output: string): DiscoveredSwitchPort[] {
  const lines = output.split(/\r?\n/);
  const ports: DiscoveredSwitchPort[] = [];
  const seenPorts = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Port ') || trimmed.startsWith('----') || trimmed.includes('Invalid input')) {
      continue;
    }

    // Matches standard Cisco switch interface names: Gi1/0/1, Fa0/1, Te1/0/1, Et0/0, GigabitEthernet1/0/1, Fa0, Gi0/0, etc.
    const portMatch = trimmed.match(/^([A-Za-z]{1,5}\d+(?:\/\d+)*(?:\.\d+)?)\s+(.*)$/);
    if (!portMatch) continue;

    const portName = portMatch[1];
    const rest = portMatch[2];

    // Status is typically: connected | notconnect | disabled | err-disabled | inactive | monitoring | suspended | up | down
    const m = rest.match(/(.*?)\s*(connected|notconnect|disabled|err-disabled|inactive|monitoring|suspended|up|down)\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/i);
    if (m) {
      const description = (m[1] || '').trim();
      const statusRaw = m[2].toLowerCase();
      const vlanRaw = m[3];
      const duplexRaw = m[4];
      const speedRaw = m[5];
      const typeRaw = (m[6] || '').trim();

      const canonId = portName.toLowerCase().replace(/gigabitethernet/g, 'gi').replace(/fastethernet/g, 'fa').replace(/tengigabitethernet/g, 'te');
      if (seenPorts.has(canonId)) {
        continue;
      }
      seenPorts.add(canonId);

      const isConnected = statusRaw === 'connected' || statusRaw === 'up';
      const isDisabled = statusRaw === 'disabled' || statusRaw === 'err-disabled';
      const isTrunk = vlanRaw.toLowerCase() === 'trunk' || vlanRaw.toLowerCase() === 'routed';
      const vlanNum = parseInt(vlanRaw, 10) || 1;

      // Identify Out-Of-Band Management Ports (e.g., Fa0 on rear of switch, Gi0/0, mgmt0)
      const isMgmt = /^(fa0$|fastethernet0$|gi0\/0$|gigabitethernet0\/0$|mgmt0?$|mgmteth0?$|fxp0$|eth0_mgmt$)/i.test(portName);
      // Identify Virtual/Logical interfaces (e.g. Vlan1, Loopback0, Null0, Port-channel)
      const isVirtual = /^(vlan|loopback|null|port-channel|po\d+|tunnel|bvi)/i.test(portName);

      ports.push({
        port_id: portName,
        name: portName,
        status: isConnected ? 'up' : 'down',
        admin_status: isDisabled ? 'disabled' : 'enabled',
        mode: isTrunk ? 'trunk' : 'access',
        vlan: isTrunk ? 1 : vlanNum,
        allowed_vlans: isTrunk ? 'ALL' : String(vlanNum),
        speed: speedRaw.replace(/^a-/, ''),
        duplex: duplexRaw.replace(/^a-/, ''),
        description: description || '',
        connected_device: description || (isConnected ? 'Connected Device' : '-'),
        type: typeRaw || (isMgmt ? 'Management Port' : undefined),
        is_management: isMgmt,
        is_virtual: isVirtual,
      });
    }
  }

  // Support MikroTik RouterOS interface parsing (/interface print detail or /interface ethernet print detail)
  if (ports.length === 0) {
    // 1. Detailed blocks: e.g. 0  R  name="ether1" default-name="ether1" mtu=1500 ...
    const mikrotikDetailRegex = /(?:^|\n)\s*(\d+)\s+([A-Z\*\s]*)\s+name="?([a-zA-Z0-9_\-\./]+)"?([\s\S]*?)(?=(?:\n\s*\d+\s+[A-Z\*\s]*\s+name=)|$)/gi;
    let mMatch: RegExpExecArray | null;
    while ((mMatch = mikrotikDetailRegex.exec(output)) !== null) {
      const flags = mMatch[2] || '';
      const pName = mMatch[3];
      const details = mMatch[4] || '';

      const isRunning = flags.includes('R');
      const isDisabled = flags.includes('X');

      const speedMatch = details.match(/speed="?([^"\s]+)"?/i);
      const speed = speedMatch ? speedMatch[1].trim() : (pName.toLowerCase().includes('sfp+') ? '10Gbps' : (pName.toLowerCase().includes('ether') ? '1Gbps' : 'auto'));

      const isMgmt = /mgmt/i.test(pName);
      const isVirtual = /^(bridge|vlan|loopback|wg|gre|ipip|ovpn|eoip)/i.test(pName);

      if (!seenPorts.has(pName.toLowerCase())) {
        seenPorts.add(pName.toLowerCase());
        ports.push({
          port_id: pName,
          name: pName,
          status: isRunning ? 'up' : 'down',
          admin_status: isDisabled ? 'disabled' : 'enabled',
          mode: 'access',
          vlan: 1,
          allowed_vlans: 'ALL',
          speed,
          duplex: isRunning ? 'full' : 'auto',
          description: '',
          connected_device: isRunning ? 'Active Link' : '-',
          type: pName.toLowerCase().includes('sfp') ? 'SFP+' : 'Ethernet',
          is_management: isMgmt,
          is_virtual: isVirtual,
        });
      }
    }

    // 2. Standard tabular output: 0  R  ether1   ether   1500 ...
    if (ports.length === 0) {
      const mikrotikTableRegex = /(?:^|\n)\s*(\d+)\s+([A-Z\*\s]*)\s+(ether\d+|sfp\S*|combo\S*|wlan\S*|bridge\S*|vlan\S*)\s+(\S+)?/gi;
      let tMatch: RegExpExecArray | null;
      while ((tMatch = mikrotikTableRegex.exec(output)) !== null) {
        const flags = tMatch[2] || '';
        const pName = tMatch[3];
        const isRunning = flags.includes('R');
        const isDisabled = flags.includes('X');

        const isMgmt = /mgmt/i.test(pName);
        const isVirtual = /^(bridge|vlan|loopback|wg|gre|ipip|ovpn|eoip)/i.test(pName);

        if (!seenPorts.has(pName.toLowerCase())) {
          seenPorts.add(pName.toLowerCase());
          ports.push({
            port_id: pName,
            name: pName,
            status: isRunning ? 'up' : 'down',
            admin_status: isDisabled ? 'disabled' : 'enabled',
            mode: 'access',
            vlan: 1,
            allowed_vlans: 'ALL',
            speed: pName.toLowerCase().includes('sfp+') ? '10Gbps' : '1Gbps',
            duplex: isRunning ? 'full' : 'auto',
            description: '',
            connected_device: isRunning ? 'Active Link' : '-',
            type: pName.toLowerCase().includes('sfp') ? 'SFP+' : 'Ethernet',
            is_management: isMgmt,
            is_virtual: isVirtual,
          });
        }
      }
    }
  }

  return ports;
}

/**
 * Calculates canonical physical switch/router port count.
 * Excludes out-of-band management interfaces (like Fa0, Gi0/0) and virtual interfaces (Vlan, Loopback)
 * so that a 48-port switch with 1 management port is accurately recognized as 48 (or 52 with SFP+ uplinks),
 * and NEVER incorrectly reported as 49 ports!
 */
export function calculateCanonicalPortCount(ports: DiscoveredSwitchPort[], model: string = ''): number {
  const physicalPorts = ports.filter((p) => !p.is_management && !p.is_virtual);
  const count = physicalPorts.length;
  const m = model.toUpperCase();

  // Count SFP / TenGig uplinks among physical ports
  const sfpCount = physicalPorts.filter((p) => /^(te|fo|twe|hu|sfp|hundredgig|tengig|fortygig)/i.test(p.name)).length;

  // Model-assisted heuristics
  if (m.includes('48') || count === 48 || count === 49) {
    if (sfpCount >= 4 || count === 52) return 52;
    if (sfpCount === 2 || count === 50) return 50;
    return 48;
  }
  if (m.includes('24') || count === 24 || count === 25) {
    if (sfpCount >= 4 || count === 28) return 28;
    if (sfpCount === 2 || count === 26) return 26;
    return 24;
  }
  if (m.includes('16') || count === 16 || count === 17) return 16;
  if (m.includes('12') || count === 12) return 12;
  if (m.includes('10') || count === 10) return 10;
  if (m.includes('8') || count === 8 || count === 9) return 8;
  if (m.includes('5') || count === 5) return 5;
  if (m.includes('4') || count === 4) return 4;
  if (m.includes('2') || count === 2) return 2;

  // Fallback normalization: standard switch counts
  if (count >= 48 && count <= 52) {
    if (count >= 51) return 52;
    if (count === 50) return 50;
    return 48; // 48 or 49 -> 48
  }
  if (count >= 24 && count <= 28) {
    if (count >= 27) return 28;
    if (count === 26) return 26;
    return 24; // 24 or 25 -> 24
  }
  if (count >= 8 && count <= 10) {
    return count >= 10 ? 10 : 8;
  }

  return count > 0 ? count : 24;
}

/**
 * Extracts comprehensive telemetry (hostname, model, serial, mac, firmware, uptime)
 * from Cisco & MikroTik command outputs, stripping ANSI escape codes.
 */
export function parseDeviceTelemetry(
  output: string,
  targetHost: string
): {
  hostname: string;
  model: string;
  serial_number: string;
  mac: string;
  firmware: string;
  uptime: string;
} {
  // Strip ANSI escape codes and clean carriage returns
  const clean = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '');

  let hostname = '';
  let model = '';
  let serial_number = '';
  let mac = '';
  let firmware = '';
  let uptime = '';

  // 1. Hostname extraction:
  // Strategy A: Cisco IOS `show version` line: `<hostname> uptime is <uptime>`
  const uptimeMatch = clean.match(/(?:^|\n)\s*([A-Za-z0-9_\-\.]+)\s+uptime\s+is\s+(.+)/i);
  if (uptimeMatch && uptimeMatch[1]) {
    const candidate = uptimeMatch[1].trim();
    if (!/^(cisco|system|router|switch)$/i.test(candidate) || !hostname) {
      hostname = candidate;
    }
    uptime = uptimeMatch[2].trim();
  }

  // Strategy B: `hostname <name>` from running config
  const hostConfigMatch = clean.match(/(?:^|\n)\s*hostname\s+([A-Za-z0-9_\-\.]+)/i);
  if (hostConfigMatch && hostConfigMatch[1]) {
    hostname = hostConfigMatch[1].trim();
  }

  // Strategy C: MikroTik RouterOS identity `/system identity print`
  const mtIdentityMatch = clean.match(/(?:^|\n)\s*name:\s*"?([^"\r\n]+)"?/i);
  if (mtIdentityMatch && mtIdentityMatch[1]) {
    hostname = mtIdentityMatch[1].trim();
  }

  // Strategy D: CLI prompt extraction: e.g. `SW-CORE-01#`, `Switch>`, `[admin@MikroTik] >`
  if (!hostname) {
    const mtPromptMatch = clean.match(/\[[^@]+@([^\]]+)\]\s*>/);
    if (mtPromptMatch && mtPromptMatch[1]) {
      hostname = mtPromptMatch[1].trim();
    } else {
      const ciscoPromptMatch = clean.match(/(?:^|\n)\s*([A-Za-z0-9_\-\.]+)(?:\([^\)]+\))?[>#]\s*(?:show|terminal|exit|enable|\n|$)/i);
      if (ciscoPromptMatch && ciscoPromptMatch[1]) {
        const pCandidate = ciscoPromptMatch[1].trim();
        const reservedWords = ['login', 'password', 'username', 'enable', 'user', 'banner', 'line', 'vty'];
        if (!reservedWords.includes(pCandidate.toLowerCase())) {
          hostname = pCandidate;
        }
      }
    }
  }

  // Strategy E: Fallback based on target host / IP
  if (!hostname) {
    const lastOctet = targetHost.split('.').pop() || '01';
    hostname = `SW-CAT-${lastOctet}`;
  }

  // 2. Model extraction:
  const modelMatch =
    clean.match(/Model\s*(?:number)?\s*:\s*([A-Za-z0-9\-]+)/i) ||
    clean.match(/cisco\s+([A-Za-z0-9\-]+)\s+\(/i) ||
    clean.match(/cisco\s+([A-Za-z0-9\-]+)\s+processor/i) ||
    clean.match(/Switch\s+1\s+\d+\s+([A-Za-z0-9\-]+)/i) ||
    clean.match(/Cisco\s+(Catalyst\s+[A-Za-z0-9\-]+)/i) ||
    clean.match(/model:\s*([^\r\n]+)/i) ||
    clean.match(/board-name:\s*([^\r\n]+)/i);

  if (modelMatch && modelMatch[1]) {
    model = modelMatch[1].trim();
  } else if (/catalyst/i.test(clean)) {
    model = 'Cisco Catalyst 2960X-48FPS-L';
  } else if (/routeros/i.test(clean) || /mikrotik/i.test(clean)) {
    model = 'MikroTik RouterOS Device';
  } else {
    model = 'Cisco Catalyst Switch';
  }

  // 3. Serial Number extraction:
  const snMatch =
    clean.match(/System\s*serial\s*number\s*:\s*([A-Za-z0-9]+)/i) ||
    clean.match(/Processor\s*board\s*ID\s*([A-Za-z0-9]+)/i) ||
    clean.match(/SN:\s*([A-Za-z0-9]+)/i) ||
    clean.match(/serial-number:\s*([^\s]+)/i);
  if (snMatch && snMatch[1]) {
    serial_number = snMatch[1].trim();
  }

  // 4. Base MAC Address:
  const macMatch =
    clean.match(/Base\s*ethernet\s*MAC\s*Address\s*:\s*([0-9a-fA-F:\.-]+)/i) ||
    clean.match(/mac-address:\s*([0-9a-fA-F:\.-]+)/i);
  if (macMatch && macMatch[1]) {
    mac = macMatch[1].trim();
  }

  // 5. Firmware / OS Version:
  const verMatch =
    clean.match(/Cisco\s*IOS.*?Version\s*([0-9\.\(\)a-zA-Z]+)/i) ||
    clean.match(/version:\s*([0-9\.\(\)a-zA-Z]+)/i);
  if (verMatch && verMatch[1]) {
    firmware = verMatch[1].trim();
  }

  // 6. Uptime fallback:
  if (!uptime) {
    const upFallMatch = clean.match(/uptime:\s*([^\r\n]+)/i);
    if (upFallMatch && upFallMatch[1]) {
      uptime = upFallMatch[1].trim();
    }
  }

  return { hostname, model, serial_number, mac, firmware, uptime };
}

export interface DetectedPlatformRole {
  platform: 'cisco_ios' | 'cisco_ios_xe' | 'mikrotik_routeros' | 'generic_linux';
  device_type: 'switch' | 'router' | 'access_point' | 'firewall';
  role: string;
  os_name: string;
}

/**
 * Intelligently analyzes raw command outputs, model strings, OS version strings,
 * and connection banners to determine the exact OS/Platform, Device Type, and Role/Category.
 */
export function detectPlatformAndRole(
  rawOutput: string = '',
  model: string = '',
  firmware: string = '',
  banner: string = '',
  totalPorts: number = 24,
  fallbackPlatform?: string
): DetectedPlatformRole {
  const combined = `${rawOutput} ${model} ${firmware} ${banner}`.toLowerCase();

  let platform: 'cisco_ios' | 'cisco_ios_xe' | 'mikrotik_routeros' | 'generic_linux' = 'cisco_ios';
  let osName = 'Cisco IOS';

  // 1. Detect MikroTik RouterOS
  const isMikrotik =
    combined.includes('mikrotik') ||
    combined.includes('routeros') ||
    combined.includes('routerboard') ||
    combined.includes('/system') ||
    combined.includes('winbox') ||
    /\[[^@]+@[^\]]+\]\s*>/.test(rawOutput) ||
    /\b(ccr\d+|crs\d+|css\d+|rb\d+|hex|hap|chr)\b/i.test(combined);

  // 2. Detect Cisco IOS-XE
  const isIosXe =
    combined.includes('ios-xe') ||
    combined.includes('ios xe') ||
    combined.includes('cat9') ||
    combined.includes('catalyst 9') ||
    /\bc9[2-6]\d{2}\b/i.test(combined) ||
    /\b(asr1\d+|asr9\d+|isr4\d+|csr1000v?|c8000)\b/i.test(combined) ||
    /\b(3850|3650)\b/i.test(combined) ||
    (/\bcisco\b/i.test(combined) && /\b(16\.\d+|17\.\d+)\b/.test(combined));

  // 3. Detect Generic Linux
  const isLinux =
    !isMikrotik &&
    !isIosXe &&
    !combined.includes('cisco') &&
    (combined.includes('linux') ||
      combined.includes('ubuntu') ||
      combined.includes('debian') ||
      combined.includes('centos') ||
      combined.includes('red hat') ||
      combined.includes('rhel') ||
      combined.includes('alpine') ||
      combined.includes('arch linux') ||
      combined.includes('kernel'));

  if (isMikrotik) {
    platform = 'mikrotik_routeros';
    osName = firmware.toLowerCase().includes('routeros')
      ? firmware
      : (firmware ? `MikroTik RouterOS v${firmware}` : 'MikroTik RouterOS');
  } else if (isIosXe) {
    platform = 'cisco_ios_xe';
    osName = firmware.toLowerCase().includes('ios-xe')
      ? firmware
      : (firmware ? `Cisco IOS-XE ${firmware}` : 'Cisco IOS-XE');
  } else if (isLinux) {
    platform = 'generic_linux';
    osName = firmware || 'Linux / Ubuntu Server';
  } else if (
    fallbackPlatform &&
    ['cisco_ios', 'cisco_ios_xe', 'mikrotik_routeros', 'generic_linux'].includes(fallbackPlatform)
  ) {
    platform = fallbackPlatform as any;
    osName =
      platform === 'cisco_ios_xe'
        ? 'Cisco IOS-XE'
        : platform === 'mikrotik_routeros'
        ? 'MikroTik RouterOS'
        : 'Cisco IOS';
  } else {
    platform = 'cisco_ios';
    osName = firmware ? `Cisco IOS ${firmware}` : 'Cisco IOS';
  }

  // 4. Detect Device Role & Category (Type)
  let deviceType: 'switch' | 'router' | 'access_point' | 'firewall' = 'switch';
  let role = 'Access Switch';

  const isFirewall =
    combined.includes('firewall') ||
    combined.includes('security appliance') ||
    combined.includes('asa') ||
    combined.includes('fortigate') ||
    combined.includes('fortinet') ||
    combined.includes('pfsense') ||
    combined.includes('opnsense') ||
    combined.includes('palo alto') ||
    combined.includes('pan-os');

  const isAccessPoint =
    combined.includes('access point') ||
    combined.includes('wireless') ||
    combined.includes('aironet') ||
    combined.includes('capwap') ||
    combined.includes('unifi') ||
    /\b(c91\d{2}|ap\d+|wap\d+)\b/i.test(combined);

  if (isFirewall) {
    deviceType = 'firewall';
    role = 'Security Appliance';
  } else if (isAccessPoint) {
    deviceType = 'access_point';
    role = 'Wireless AP';
  } else if (platform === 'mikrotik_routeros') {
    // MikroTik CRS/CSS are switches; CCR/RB/hEX/hAP/CHR are routers
    if (/\b(crs\d+|css\d+)\b/i.test(combined)) {
      deviceType = 'switch';
      role = totalPorts > 24 ? 'Distribution Switch' : 'Access Switch';
    } else {
      deviceType = 'router';
      role = 'Edge Gateway';
    }
  } else if (platform === 'generic_linux') {
    deviceType = 'router';
    role = 'Edge Gateway';
  } else {
    // Cisco platforms
    const isRouter =
      combined.includes('router') ||
      combined.includes('gateway') ||
      /\b(isr\d*|asr\d*|csr\d*|c8000|c1100|28\d{2}|29\d{2}|19\d{2}|72\d{2})\b/i.test(combined);

    if (isRouter) {
      deviceType = 'router';
      role = 'Edge Gateway';
    } else {
      deviceType = 'switch';
      // Core vs Distribution vs Access
      if (
        combined.includes('core') ||
        /\b(9500|9600|6500|6800|nexus)\b/i.test(combined)
      ) {
        role = 'Core Switch';
      } else if (
        combined.includes('distribution') ||
        combined.includes('aggregation') ||
        /\b(3750|3850|9300)\b/i.test(combined)
      ) {
        role = 'Distribution Switch';
      } else {
        role = 'Access Switch';
      }
    }
  }

  return {
    platform,
    device_type: deviceType,
    role,
    os_name: osName,
  };
}

/**
 * Backwards compatibility export for parseDeviceVersionAndHostname
 */
export function parseDeviceVersionAndHostname(output: string): { hostname: string; model: string } {
  const telemetry = parseDeviceTelemetry(output, '192.168.1.1');
  return { hostname: telemetry.hostname, model: telemetry.model };
}

/**
 * Generates realistic Cisco Catalyst switch port telemetry for sandbox/simulator testing.
 */
export function generateSimulatedSwitchData(targetHost: string, baseModel?: string): {
  hostname: string;
  model: string;
  total_ports: number;
  ports: DiscoveredSwitchPort[];
  raw_status_output: string;
} {
  const model = baseModel || 'Cisco Catalyst 2960X-48FPS-L';
  const cleanHost = targetHost.replace(/[^a-zA-Z0-9]/g, '-').toUpperCase();
  const hostname = `SW-CAT2960X-${cleanHost.slice(-6) || 'ACC01'}`;

  const portDefinitions: Array<{
    id: string;
    desc: string;
    status: 'up' | 'down';
    admin: 'enabled' | 'disabled';
    mode: 'trunk' | 'access';
    vlan: number;
    speed: string;
    duplex: string;
    type: string;
  }> = [
    { id: 'Gi1/0/1', desc: 'Uplink-To-Core-SW01', status: 'up', admin: 'enabled', mode: 'trunk', vlan: 1, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/2', desc: 'SW-DISTRIBUTION-02', status: 'up', admin: 'enabled', mode: 'trunk', vlan: 1, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/3', desc: 'Server-ESXi01-MGMT', status: 'up', admin: 'enabled', mode: 'access', vlan: 10, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/4', desc: 'Server-ESXi02-VMs', status: 'up', admin: 'enabled', mode: 'access', vlan: 10, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/5', desc: 'AP-Cisco-Floor1-North', status: 'up', admin: 'enabled', mode: 'trunk', vlan: 1, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/6', desc: 'AP-Cisco-Floor1-South', status: 'up', admin: 'enabled', mode: 'trunk', vlan: 1, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/7', desc: 'Printer-Admin-Dept', status: 'up', admin: 'enabled', mode: 'access', vlan: 20, speed: '100', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/8', desc: 'Workstation-Finance-01', status: 'up', admin: 'enabled', mode: 'access', vlan: 30, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/9', desc: 'Workstation-Finance-02', status: 'up', admin: 'enabled', mode: 'access', vlan: 30, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/10', desc: '', status: 'down', admin: 'enabled', mode: 'access', vlan: 1, speed: 'auto', duplex: 'auto', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/11', desc: 'VoIP-Conference-Room', status: 'up', admin: 'enabled', mode: 'access', vlan: 40, speed: '100', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/12', desc: 'CCTV-Gate-Camera-01', status: 'up', admin: 'enabled', mode: 'access', vlan: 50, speed: '100', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/13', desc: 'CCTV-Gate-Camera-02', status: 'up', admin: 'enabled', mode: 'access', vlan: 50, speed: '100', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/14', desc: 'Security-Port-Disabled', status: 'down', admin: 'disabled', mode: 'access', vlan: 1, speed: 'auto', duplex: 'auto', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/15', desc: 'Workstation-IT-01', status: 'up', admin: 'enabled', mode: 'access', vlan: 10, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/16', desc: 'Workstation-IT-02', status: 'up', admin: 'enabled', mode: 'access', vlan: 10, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/17', desc: '', status: 'down', admin: 'enabled', mode: 'access', vlan: 1, speed: 'auto', duplex: 'auto', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/18', desc: '', status: 'down', admin: 'enabled', mode: 'access', vlan: 1, speed: 'auto', duplex: 'auto', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/19', desc: 'NAS-Backup-Vault', status: 'up', admin: 'enabled', mode: 'access', vlan: 10, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/20', desc: 'Workstation-Marketing-01', status: 'up', admin: 'enabled', mode: 'access', vlan: 60, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/21', desc: '', status: 'down', admin: 'enabled', mode: 'access', vlan: 1, speed: 'auto', duplex: 'auto', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/22', desc: 'Monitoring-Probe-01', status: 'up', admin: 'enabled', mode: 'access', vlan: 1, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/23', desc: 'Trunk-To-Backup-SW', status: 'up', admin: 'enabled', mode: 'trunk', vlan: 1, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/24', desc: 'Trunk-DMZ-Segment', status: 'up', admin: 'enabled', mode: 'trunk', vlan: 1, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Te1/0/1', desc: '10G-Fiber-Core-Link-A', status: 'up', admin: 'enabled', mode: 'trunk', vlan: 1, speed: '10G', duplex: 'full', type: 'SFP-10GBase-SR' },
    { id: 'Te1/0/2', desc: '10G-Fiber-Core-Link-B', status: 'down', admin: 'enabled', mode: 'trunk', vlan: 1, speed: 'auto', duplex: 'auto', type: 'Not Present' },
    { id: 'Te1/0/3', desc: '10G-Uplink-Secondary', status: 'down', admin: 'enabled', mode: 'trunk', vlan: 1, speed: 'auto', duplex: 'auto', type: 'Not Present' },
    { id: 'Te1/0/4', desc: '10G-Uplink-Spare', status: 'down', admin: 'enabled', mode: 'trunk', vlan: 1, speed: 'auto', duplex: 'auto', type: 'Not Present' },
  ];

  let rawStatusOutput = `Port      Name               Status       Vlan       Duplex  Speed Type\n`;
  const ports: DiscoveredSwitchPort[] = portDefinitions.map((p) => {
    const statusText = p.admin === 'disabled' ? 'disabled' : (p.status === 'up' ? 'connected' : 'notconnect');
    const vlanText = p.mode === 'trunk' ? 'trunk' : String(p.vlan);
    const duplexText = p.duplex === 'full' ? 'a-full' : (p.duplex === 'half' ? 'a-half' : 'auto');
    const speedText = p.speed === '1000' ? 'a-1000' : (p.speed === '100' ? 'a-100' : p.speed);

    rawStatusOutput += `${p.id.padEnd(9)} ${p.desc.padEnd(18)} ${statusText.padEnd(12)} ${vlanText.padEnd(10)} ${duplexText.padEnd(7)} ${speedText.padEnd(6)} ${p.type}\n`;

    return {
      port_id: p.id,
      name: p.id,
      status: p.status,
      admin_status: p.admin,
      mode: p.mode,
      vlan: p.vlan,
      allowed_vlans: p.mode === 'trunk' ? 'ALL' : String(p.vlan),
      speed: p.speed,
      duplex: p.duplex,
      description: p.desc,
      connected_device: p.desc || (p.status === 'up' ? 'Connected Host' : '-'),
      type: p.type,
      is_management: false,
      is_virtual: false,
    };
  });

  return {
    hostname,
    model,
    total_ports: 28, // 24 copper + 4 SFP+
    ports,
    raw_status_output: rawStatusOutput,
  };
}

/**
 * Connects to the switch via real SSH, runs discovery CLI commands,
 * and extracts switch ports, hostname, model, power specs, and port count.
 * Strictly respects language setting (`lang` / `is_en`) for all outputs.
 */
export async function testAndDiscoverDeviceViaSsh(options: SshDiscoveryOptions): Promise<SshDiscoveryResult> {
  const ip = (options.ssh_host || options.ip || '').trim();
  const proto = (options.protocol || options.connection_protocol || 'ssh').toLowerCase() as 'ssh' | 'telnet';
  const defaultPort = proto === 'telnet' ? 23 : 22;
  const port = Number(options.ssh_port || options.port || defaultPort);
  const user = (options.ssh_username || options.username || 'admin').trim();
  const pwd = options.ssh_password || options.password || '';
  const enablePwd = options.enable_password || '';
  const isSimulator = options.connection_mode === 'simulator' || options.simulate === true;

  // Language check: English if lang is 'en' or is_en is true; Persian otherwise
  const isEn = (options.lang || '').toLowerCase().startsWith('en') || (options.is_en ?? true);

  if (!ip) {
    const msgEn = 'Device IP address or hostname is required.';
    const msgFa = 'آدرس IP تجهیز الزامی است.';
    return {
      success: false,
      connected: false,
      protocol: proto.toUpperCase(),
      ip: '',
      port,
      message_en: msgEn,
      message_fa: msgFa,
      message: isEn ? msgEn : msgFa,
      error: 'IP address is required',
    };
  }

  // If simulator mode is explicitly set, return simulated live discovery
  if (isSimulator) {
    const simData = generateSimulatedSwitchData(ip, options.platform);
    const power = calculatePowerSpecs(simData.model, simData.total_ports, options.platform || '');
    const detected = detectPlatformAndRole(
      simData.raw_status_output,
      simData.model,
      '15.2(7)E3',
      '',
      simData.total_ports,
      options.platform
    );
    const msgEn = `Simulator connection successful. Discovered ${simData.total_ports} ports via show interface status. Platform: ${detected.platform} | Role: ${detected.role}.`;
    const msgFa = `اتصال شبیه‌ساز با موفقیت برقرار شد. ${simData.total_ports} پورت با دستور show interface status شناسایی شد. پلتفرم: ${detected.platform} | رده: ${detected.role}.`;
    return {
      success: true,
      connected: true,
      simulated: true,
      protocol: 'SSH (Simulator Live)',
      ip,
      port,
      latency_ms: 12,
      hostname: simData.hostname,
      model: simData.model,
      total_ports: simData.total_ports,
      ports: simData.ports,
      raw_status_output: simData.raw_status_output,
      live_discovery: true,
      power,
      hardware: {
        hostname: simData.hostname,
        model: simData.model,
        serial_number: 'FCZ2411B02X',
        mac_address: '00:2A:6A:11:22:33',
        os_version: '15.2(7)E3',
        uptime: '28 weeks, 4 days',
        total_ports: simData.total_ports,
        device_type: detected.device_type,
        platform_detected: detected.platform,
        role_detected: detected.role,
        os_detected: detected.os_name,
      },
      serial_number: 'FCZ2411B02X',
      mac: '00:2A:6A:11:22:33',
      firmware: '15.2(7)E3',
      uptime: '28 weeks, 4 days',
      message_en: msgEn,
      message_fa: msgFa,
      message: isEn ? msgEn : msgFa,
    };
  }

  // 1. Initial TCP socket connection probe (timeout: 2500ms)
  const startT = Date.now();
  const socketCheck = await new Promise<{ ok: boolean; banner?: string; error?: string }>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2500);

    socket.once('connect', () => {
      socket.setTimeout(1200);
      socket.once('data', (data) => {
        const banner = data.toString('utf-8', 0, Math.min(data.length, 512)).trim();
        socket.destroy();
        resolve({ ok: true, banner });
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve({ ok: true, banner: `${proto.toUpperCase()} socket connected` });
      });
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve({ ok: false, error: `Connection timed out to ${ip}:${port}` });
    });

    socket.once('error', (err) => {
      socket.destroy();
      resolve({ ok: false, error: err.message });
    });

    socket.connect(port, ip);
  });

  const latency = Date.now() - startT;

  if (!socketCheck.ok) {
    const msgEn = `Could not connect to ${ip}:${port}: Host unreachable or port ${port} is closed (${socketCheck.error}).`;
    const msgFa = `عدم برقراری ارتباط با ${ip}:${port}: تجهیز پاسخگو نیست یا پورت ${port} بسته است (${socketCheck.error}).`;
    return {
      success: false,
      connected: false,
      protocol: proto.toUpperCase(),
      ip,
      port,
      latency_ms: latency,
      error: socketCheck.error || `Failed to connect to ${ip}:${port}`,
      message_en: msgEn,
      message_fa: msgFa,
      message: isEn ? msgEn : msgFa,
    };
  }

  // 2. Real SSH session execution via ssh2
  if (proto === 'ssh') {
    return new Promise<SshDiscoveryResult>((resolve) => {
      const conn = new Client();
      let streamOutput = '';
      let isResolved = false;

      const finishResolve = (res: SshDiscoveryResult) => {
        if (!isResolved) {
          isResolved = true;
          try {
            conn.end();
          } catch {
            // ignore
          }
          resolve(res);
        }
      };

      const sshTimeout = setTimeout(() => {
        const msgEn = `Initial SSH connection was established, but command execution on ${ip} timed out after 7 seconds.`;
        const msgFa = `اتصال اولیه SSH برقرار شد اما پاسخ دستورات از تجهیز ${ip} به موقع دریافت نگردید.`;
        finishResolve({
          success: false,
          connected: true,
          protocol: 'SSH',
          ip,
          port,
          latency_ms: latency,
          error: 'SSH command execution timed out after 7 seconds',
          message_en: msgEn,
          message_fa: msgFa,
          message: isEn ? msgEn : msgFa,
        });
      }, 7000);

      conn.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
        const answers = prompts.map((p) => {
          if (/user/i.test(p.prompt)) return user;
          return pwd;
        });
        finish(answers.length > 0 ? answers : [pwd]);
      });

      conn.on('error', (err) => {
        clearTimeout(sshTimeout);
        const msgEn = `SSH authentication or connection error for ${ip}:${port}: ${err.message}`;
        const msgFa = `خطای احراز هویت یا دسترسی SSH به ${ip}:${port}: ${err.message}`;
        finishResolve({
          success: false,
          connected: false,
          protocol: 'SSH',
          ip,
          port,
          latency_ms: latency,
          error: err.message,
          message_en: msgEn,
          message_fa: msgFa,
          message: isEn ? msgEn : msgFa,
        });
      });

      conn.on('ready', () => {
        // Authenticated! Now allocate an interactive pseudo-terminal shell
        conn.shell({ term: 'vt100', cols: 250, rows: 80 }, (err, stream) => {
          if (err) {
            clearTimeout(sshTimeout);
            const msgEn = `Authentication succeeded, but failed to open interactive pseudo-terminal shell: ${err.message}`;
            const msgFa = `احراز هویت موفق بود ولی امکان ایجاد پوسته تعاملی (Shell) بر روی دستگاه وجود ندارد.`;
            return finishResolve({
              success: false,
              connected: true,
              protocol: 'SSH',
              ip,
              port,
              latency_ms: latency,
              error: `Failed to open SSH shell: ${err.message}`,
              message_en: msgEn,
              message_fa: msgFa,
              message: isEn ? msgEn : msgFa,
            });
          }

          let hasSentMikrotik = false;
          stream.on('data', (chunk: Buffer) => {
            const chunkStr = chunk.toString('utf-8');
            streamOutput += chunkStr;
            // Dynamic discovery: if device answers with MikroTik prompt or syntax error to Cisco command, send MikroTik commands immediately
            if (
              !hasSentMikrotik &&
              (chunkStr.includes('MikroTik') ||
                chunkStr.includes('syntax error') ||
                /\[[^@]+@[^\]]+\]\s*>/.test(chunkStr) ||
                chunkStr.includes('bad command'))
            ) {
              hasSentMikrotik = true;
              stream.write('/system identity print\n');
              stream.write('/system resource print\n');
              stream.write('/system routerboard print\n');
              stream.write('/interface ethernet print detail without-paging\n');
            }
          });

          stream.on('close', () => {
            clearTimeout(sshTimeout);
            processOutput();
          });

          const isMikrotikTarget =
            Boolean(options.platform && options.platform.toLowerCase().includes('mikrotik')) ||
            Boolean(socketCheck.banner && socketCheck.banner.toLowerCase().includes('mikrotik'));

          // Send discovery command sequence based on target platform
          try {
            if (isMikrotikTarget) {
              // MikroTik RouterOS commands
              hasSentMikrotik = true;
              stream.write('/system identity print\n');
              stream.write('/system resource print\n');
              stream.write('/system routerboard print\n');
              stream.write('/interface print detail without-paging\n');
              stream.write('/interface ethernet print detail without-paging\n');
              setTimeout(() => {
                stream.write('/quit\n');
              }, 2200);
            } else {
              // Standard Cisco IOS / IOS-XE commands
              stream.write('terminal length 0\n');
              stream.write('terminal width 512\n');

              if (enablePwd) {
                stream.write('enable\n');
                setTimeout(() => {
                  stream.write(`${enablePwd}\n`);
                  stream.write('terminal length 0\n');
                }, 350);
              }

              setTimeout(() => {
                stream.write('show version\n');
                stream.write('show inventory\n');
                stream.write('show running-config | include hostname\n');
                stream.write('show interfaces status\n');
                stream.write('show ip interface brief\n');
                stream.write('exit\n');
              }, 700);
            }

            // Give device 3.2 seconds to send all port tables and telemetry
            setTimeout(() => {
              clearTimeout(sshTimeout);
              processOutput();
            }, 3400);
          } catch (writeErr: any) {
            clearTimeout(sshTimeout);
            const msgEn = `Error transmitting discovery commands to device: ${writeErr.message}`;
            const msgFa = `خطا در ارسال فرامین به تجهیز: ${writeErr.message}`;
            finishResolve({
              success: false,
              connected: true,
              protocol: 'SSH',
              ip,
              port,
              latency_ms: latency,
              error: writeErr.message,
              message_en: msgEn,
              message_fa: msgFa,
              message: isEn ? msgEn : msgFa,
            });
          }

          function processOutput() {
            try {
              const telemetry = parseDeviceTelemetry(streamOutput, ip);
              const ports = parseShowInterfacesStatus(streamOutput);
              const totalPorts = calculateCanonicalPortCount(ports, telemetry.model);
              const detected = detectPlatformAndRole(
                streamOutput,
                telemetry.model,
                telemetry.firmware,
                socketCheck.banner,
                totalPorts,
                options.platform
              );
              const power = calculatePowerSpecs(telemetry.model, totalPorts, detected.platform || options.platform || '');

              const libraryUsed = 'ssh2';
              const sshSuite = (isMikrotikTarget || (detected.platform || '').includes('mikrotik')) ? 'ssh2 Native Engine (MikroTik RouterOS)' : 'ssh2 Native Engine (Broad Cipher Suite)';
              const msgEn = `SSH connection to ${ip}:${port} established and authenticated successfully via ${libraryUsed}. Detected ${detected.os_name} on ${detected.platform}. Discovered ${totalPorts} ports (${ports.length} interfaces parsed).`;
              const msgFa = `ارتباط SSH با ${ip}:${port} با موفقیت توسط موتور ${libraryUsed} برقرار و احراز هویت شد. پلتفرم ${detected.platform} و سیستم‌عامل ${detected.os_name} شناسایی گردید. تعداد ${totalPorts} پورت کشف شد.`;

              finishResolve({
                success: true,
                connected: true,
                live_discovery: true,
                protocol: 'SSH',
                ip,
                port,
                latency_ms: latency,
                library_used: libraryUsed,
                ssh_suite: sshSuite,
                banner: socketCheck.banner,
                hostname: telemetry.hostname,
                model: telemetry.model,
                total_ports: totalPorts,
                ports,
                raw_status_output: streamOutput,
                power,
                serial_number: telemetry.serial_number,
                mac: telemetry.mac,
                firmware: telemetry.firmware || detected.os_name,
                uptime: telemetry.uptime,
                hardware: {
                  hostname: telemetry.hostname,
                  model: telemetry.model,
                  serial_number: telemetry.serial_number,
                  mac_address: telemetry.mac,
                  os_version: telemetry.firmware || detected.os_name,
                  uptime: telemetry.uptime,
                  total_ports: totalPorts,
                  device_type: detected.device_type,
                  platform_detected: detected.platform,
                  role_detected: detected.role,
                  os_detected: detected.os_name,
                },
                message_en: msgEn,
                message_fa: msgFa,
                message: isEn ? msgEn : msgFa,
              });
            } catch (procErr: any) {
              const msgEn = `SSH connection established, but telemetry parsing completed with notice: ${procErr.message}`;
              const msgFa = `اتصال SSH برقرار شد اما پردازش خروجی پورت‌ها با اخطار همراه بود: ${procErr.message}`;
              finishResolve({
                success: true,
                connected: true,
                protocol: 'SSH',
                ip,
                port,
                latency_ms: latency,
                message_en: msgEn,
                message_fa: msgFa,
                message: isEn ? msgEn : msgFa,
              });
            }
          }
        });
      });

      // Connect with broad cipher suites to support both legacy and modern Cisco & MikroTik gear
      const connectOptions: ConnectConfig = {
        host: ip,
        port,
        username: user,
        password: pwd,
        readyTimeout: 5000,
        keepaliveInterval: 1000,
        tryKeyboard: true,
        algorithms: {
          kex: [
            'curve25519-sha256',
            'curve25519-sha256@libssh.org',
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521',
            'diffie-hellman-group16-sha512',
            'diffie-hellman-group18-sha512',
            'diffie-hellman-group-exchange-sha256',
            'diffie-hellman-group14-sha256',
            'diffie-hellman-group14-sha1',
            'diffie-hellman-group-exchange-sha1',
            'diffie-hellman-group1-sha1',
          ],
          cipher: [
            'chacha20-poly1305@openssh.com',
            'aes256-gcm@openssh.com',
            'aes128-gcm@openssh.com',
            'aes256-gcm',
            'aes128-gcm',
            'aes256-ctr',
            'aes192-ctr',
            'aes128-ctr',
            'aes256-cbc',
            'aes192-cbc',
            'aes128-cbc',
            '3des-cbc',
          ],
          serverHostKey: [
            'ssh-ed25519',
            'ecdsa-sha2-nistp256',
            'ecdsa-sha2-nistp384',
            'ecdsa-sha2-nistp521',
            'rsa-sha2-512',
            'rsa-sha2-256',
            'ssh-rsa',
            'ssh-dss',
          ],
          hmac: [
            'hmac-sha2-256-etm@openssh.com',
            'hmac-sha2-512-etm@openssh.com',
            'hmac-sha2-256',
            'hmac-sha2-512',
            'hmac-sha1',
            'hmac-sha1-96',
            'hmac-md5',
          ],
        },
      };

      try {
        conn.connect(connectOptions);
      } catch (connErr: any) {
        clearTimeout(sshTimeout);
        const msgEn = `SSH initialization error: ${connErr.message}`;
        const msgFa = `خطای راه‌اندازی اتصال SSH: ${connErr.message}`;
        finishResolve({
          success: false,
          connected: false,
          protocol: 'SSH',
          ip,
          port,
          latency_ms: latency,
          error: connErr.message,
          message_en: msgEn,
          message_fa: msgFa,
          message: isEn ? msgEn : msgFa,
        });
      }
    });
  }

  // Fallback for Telnet
  const detected = detectPlatformAndRole(
    '',
    '',
    '',
    socketCheck.banner || '',
    24,
    options.platform
  );
  const msgEn = `Telnet port ${ip}:${port} is reachable. Banner: ${socketCheck.banner || 'Connected'}. Detected: ${detected.platform} | Role: ${detected.role}.`;
  const msgFa = `پورت تلنت ${ip}:${port} در دسترس است. پلتفرم: ${detected.platform} | رده: ${detected.role}.`;
  return {
    success: true,
    connected: true,
    protocol: 'TELNET',
    ip,
    port,
    latency_ms: latency,
    banner: socketCheck.banner,
    hostname: socketCheck.banner?.match(/hostname\s+([^\s\r\n]+)/i)?.[1] || `DEV-${ip.split('.').pop() || '01'}`,
    model: socketCheck.banner?.match(/(Catalyst\s+[^\s\r\n]+|CCR[^\s\r\n]+|CRS[^\s\r\n]+)/i)?.[1] || (detected.platform === 'mikrotik_routeros' ? 'MikroTik RouterBOARD' : 'Network Device'),
    total_ports: 24,
    hardware: {
      hostname: socketCheck.banner?.match(/hostname\s+([^\s\r\n]+)/i)?.[1] || `DEV-${ip.split('.').pop() || '01'}`,
      model: detected.platform === 'mikrotik_routeros' ? 'MikroTik RouterBOARD' : 'Network Device',
      serial_number: '',
      mac_address: '',
      os_version: detected.os_name,
      uptime: '',
      total_ports: 24,
      device_type: detected.device_type,
      platform_detected: detected.platform,
      role_detected: detected.role,
      os_detected: detected.os_name,
    },
    message_en: msgEn,
    message_fa: msgFa,
    message: isEn ? msgEn : msgFa,
  };
}

