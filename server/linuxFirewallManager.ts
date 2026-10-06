import {
  RemoteServer,
  LinuxFirewallBackend,
  LinuxFirewallStatus,
  LinuxFirewallInfo,
  LinuxFirewallRule,
  LinuxFirewallPolicies,
  LinuxFirewallCapabilities,
  LinuxFirewallRulePayload,
  LinuxListeningPortSummary,
} from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';

// Comprehensive dictionary of standard Linux network services to port mappings
export const WELL_KNOWN_SERVICES: Record<string, number[]> = {
  ssh: [22],
  openssh: [22],
  http: [80],
  www: [80],
  apache: [80],
  apache2: [80],
  nginx: [80, 443],
  https: [443],
  ssl: [443],
  dns: [53],
  domain: [53],
  dhcp: [67, 68],
  dhcpv6: [546, 547],
  'dhcpv6-client': [546],
  ntp: [123],
  snmp: [161, 162],
  ftp: [20, 21],
  ftps: [990],
  smtp: [25, 465, 587],
  smtps: [465],
  submission: [587],
  pop3: [110],
  pop3s: [995],
  imap: [143],
  imaps: [993],
  mysql: [3306],
  mariadb: [3306],
  postgres: [5432],
  postgresql: [5432],
  redis: [6379],
  mongodb: [27017],
  cockpit: [9090],
  wireguard: [51820],
  openvpn: [1194],
  rdp: [3389],
  vnc: [5900],
  telnet: [23],
  ldap: [389],
  ldaps: [636],
  kerberos: [88],
  samba: [445, 139],
  nfs: [2049],
  rsync: [873],
};

/**
 * Safely extracts a named section from the unified probe output
 */
export function extractSection(output: string, sectionName: string): string {
  if (!output) return '';
  const marker = `===${sectionName}===`;
  const start = output.indexOf(marker);
  if (start === -1) return '';
  const contentStart = start + marker.length;
  const nextSection = output.indexOf('===', contentStart);
  if (nextSection === -1) {
    return output.slice(contentStart).trim();
  }
  return output.slice(contentStart, nextSection).trim();
}

/**
 * Checks whether an address is purely internal/loopback
 */
export function isLoopbackAddress(addr: string): boolean {
  if (!addr) return false;
  const clean = addr.replace(/[\[\]]/g, '').trim().toLowerCase();
  return (
    clean === '127.0.0.1' ||
    clean === '::1' ||
    clean.startsWith('127.') ||
    clean === 'localhost' ||
    clean === 'fe80::1'
  );
}

export interface FirewallProvider {
  readonly backend: LinuxFirewallBackend;
  readonly displayName: string;
  readonly serviceName: string;
  readonly capabilities: LinuxFirewallCapabilities;

  parseStatus(rawOutput: string): {
    status: LinuxFirewallStatus;
    installed: boolean;
    enabled: boolean;
    active: boolean;
    version?: string;
    defaultPolicies: LinuxFirewallPolicies;
    rules: LinuxFirewallRule[];
    activeZone?: string;
  };

  buildAddRuleCommand(rule: LinuxFirewallRulePayload, activeZone?: string): string;
  buildDeleteRuleCommand(rule: LinuxFirewallRule, activeZone?: string): string;
  buildToggleCommand(enable: boolean): string;
  buildReloadCommand(): string;
  buildRestartCommand(): string;
  buildPolicyCommand(policy: { incoming?: string; outgoing?: string; forward?: string }): string;
}

// -------------------------------------------------------------
// PROVIDER 1: UFW (Ubuntu / Debian Uncomplicated Firewall)
// -------------------------------------------------------------
export class UfwFirewallProvider implements FirewallProvider {
  readonly backend: LinuxFirewallBackend = 'ufw';
  readonly displayName = 'UFW (Uncomplicated Firewall)';
  readonly serviceName = 'ufw.service';
  readonly capabilities: LinuxFirewallCapabilities = {
    supportsRuleOrdering: true,
    supportsComments: true,
    supportsZones: false,
    supportsIPv6: true,
    supportsLogging: true,
    supportsPortRanges: true,
    supportsInterfaces: true,
    supportsDefaultPolicies: true,
    supportsToggleState: true,
  };

  parseStatus(rawOutput: string): {
    status: LinuxFirewallStatus;
    installed: boolean;
    enabled: boolean;
    active: boolean;
    version?: string;
    defaultPolicies: LinuxFirewallPolicies;
    rules: LinuxFirewallRule[];
    activeZone?: string;
  } {
    const rawSection = extractSection(rawOutput, 'UFW_STATUS') || rawOutput;
    // Prefer numbered section if it exists and contains rules, otherwise use full output
    let section = rawSection;
    if (rawSection.includes('---UFW_NUM---')) {
      const parts = rawSection.split('---UFW_NUM---');
      if (/\[\s*\d+\]/.test(parts[1])) {
        section = parts[1];
      } else if (parts[0].toLowerCase().includes('status:')) {
        section = parts[0];
      }
    }

    const lines = section.split('\n');
    let installed = rawSection.includes('---UFW_NUM---') || rawSection.toLowerCase().includes('status:') || rawOutput.includes('ufw.service') || rawOutput.includes('ufw:');
    let active = false;
    let enabled = false;
    let status: LinuxFirewallStatus = 'not_installed';
    const defaultPolicies: LinuxFirewallPolicies = {
      incoming: 'DENY',
      outgoing: 'ALLOW',
      forward: 'DROP',
    };
    const rules: LinuxFirewallRule[] = [];

    // Parse status line and default policies (check whole rawSection to never miss default policies)
    const policyLines = rawSection.split('\n');
    for (const line of policyLines) {
      const lower = line.toLowerCase().trim();
      if (lower.startsWith('status: active')) {
        active = true;
        enabled = true;
        status = 'active';
      } else if (lower.startsWith('status: inactive')) {
        active = false;
        enabled = false;
        status = 'inactive';
      }

      if (lower.startsWith('default:')) {
        const incMatch = line.match(/([a-z]+)\s*\(incoming\)/i);
        if (incMatch) defaultPolicies.incoming = incMatch[1].toUpperCase();
        const outMatch = line.match(/([a-z]+)\s*\(outgoing\)/i);
        if (outMatch) defaultPolicies.outgoing = outMatch[1].toUpperCase();
        const fwdMatch = line.match(/([a-z]+)\s*\(routed\)/i);
        if (fwdMatch) defaultPolicies.forward = fwdMatch[1].toUpperCase();
      }
    }

    if (!installed) {
      return { status: 'not_installed', installed: false, enabled: false, active: false, defaultPolicies, rules };
    }

    // Parse rules from both numbered and unnumbered formats:
    // [ 1] 22/tcp                     ALLOW IN    Anywhere
    // [ 2] 8080/tcp                   ALLOW       Anywhere
    // 22/tcp                          ALLOW IN    Anywhere
    // 80/tcp                          ALLOW       Anywhere
    // 8080/tcp                        ALLOW IN    Anywhere                  # Web
    const seenRuleSignatures = new Set<string>();
    let fallbackRuleIndex = 1;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('---') || trimmed.startsWith('Status:') || trimmed.startsWith('Logging:') || trimmed.startsWith('Default:') || trimmed.startsWith('New profiles:')) {
        continue;
      }
      if (trimmed.startsWith('To ') || trimmed.startsWith('-- ') || trimmed.startsWith('To\t') || trimmed.startsWith('--\t')) {
        continue;
      }

      let ruleNumber: number | undefined = undefined;
      let toPart = '';
      let action: any = 'ALLOW';
      let direction: any = 'IN';
      let fromPart = '';
      let comment: string | undefined = undefined;

      // 1. Try Numbered: [ 1] 22/tcp ALLOW IN Anywhere
      const numMatch = trimmed.match(/^\[\s*(\d+)\]\s+(.*?)\s+(ALLOW|DENY|REJECT|LIMIT)\b\s*(IN|OUT|FWD|FORWARD)?\s*(.*?)(?:#(.*))?$/i);
      if (numMatch) {
        ruleNumber = parseInt(numMatch[1], 10);
        toPart = numMatch[2].trim();
        action = numMatch[3].toUpperCase();
        direction = (numMatch[4] || 'IN').toUpperCase();
        fromPart = numMatch[5].trim();
        comment = numMatch[6]?.trim();
      } else {
        // 2. Try Unnumbered: 22/tcp ALLOW IN Anywhere
        const unnumMatch = trimmed.match(/^(.*?)\s+(ALLOW|DENY|REJECT|LIMIT)\b\s*(IN|OUT|FWD|FORWARD)?\s*(.*?)(?:#(.*))?$/i);
        if (unnumMatch) {
          toPart = unnumMatch[1].trim();
          action = unnumMatch[2].toUpperCase();
          direction = (unnumMatch[3] || 'IN').toUpperCase();
          fromPart = unnumMatch[4].trim();
          comment = unnumMatch[5]?.trim();
          ruleNumber = fallbackRuleIndex++;
        }
      }

      if (!toPart || !action) continue;

      let port: string | undefined = undefined;
      let protocol: any = 'any';
      let ipVersion: 'v4' | 'v6' | 'both' = 'v4';

      if (toPart.includes('(v6)') || fromPart.includes('(v6)')) {
        ipVersion = 'v6';
      }

      const cleanTo = toPart.replace(/\(v6\)/g, '').replace(/\s+on\s+[a-z0-9_-]+/i, '').trim();

      const protoMatch = cleanTo.match(/^([0-9,:-]+)\/([a-z]+)/i);
      if (protoMatch) {
        port = protoMatch[1];
        protocol = protoMatch[2].toLowerCase();
      } else if (/^\d+$/.test(cleanTo)) {
        port = cleanTo;
        protocol = 'tcp';
      } else if (cleanTo.includes('-') || cleanTo.includes(':') || cleanTo.includes(',')) {
        port = cleanTo;
        protocol = 'tcp';
      } else if (cleanTo.length > 0 && cleanTo.toLowerCase() !== 'anywhere') {
        const cleanLower = cleanTo.toLowerCase();
        const mapped = WELL_KNOWN_SERVICES[cleanLower];
        if (mapped && mapped.length > 0) {
          port = mapped.join(',');
          protocol = 'tcp';
        } else {
          port = cleanTo;
        }
      }

      const source = fromPart.replace(/\(v6\)/g, '').trim() || 'Any';
      const sig = `${action}:${direction}:${protocol}:${port || 'any'}:${source}:${ipVersion}`;
      if (seenRuleSignatures.has(sig)) continue;
      seenRuleSignatures.add(sig);

      rules.push({
        id: `ufw-${ruleNumber || fallbackRuleIndex++}`,
        ruleNumber: ruleNumber || fallbackRuleIndex,
        backend: 'ufw',
        action,
        direction: direction === 'FWD' ? 'FORWARD' : direction,
        protocol,
        port,
        source,
        ipVersion,
        enabled: true,
        comment: comment || (cleanTo.toLowerCase().includes('ssh') ? 'SSH Access' : undefined),
        rawRule: trimmed,
      });
    }

    return {
      status,
      installed: true,
      enabled,
      active,
      defaultPolicies,
      rules,
    };
  }

  buildAddRuleCommand(rule: LinuxFirewallRulePayload): string {
    const action = (rule.action || 'allow').toLowerCase();
    const proto = rule.protocol && rule.protocol !== 'any' && rule.protocol !== 'all' ? rule.protocol.toLowerCase() : '';
    const hasSource = rule.source && rule.source.trim().toLowerCase() !== 'any';
    const commentPart = rule.comment ? ` comment '${rule.comment.replace(/'/g, '')}'` : '';
    const ifacePart = rule.interface && rule.interface !== 'any' ? ` on ${rule.interface}` : '';

    if (hasSource || rule.interface || rule.direction === 'OUT') {
      const dir = rule.direction === 'OUT' ? 'out' : 'in';
      const srcPart = hasSource ? ` from ${rule.source!.trim()}` : '';
      const protoPart = proto ? ` proto ${proto}` : '';
      const portPart = rule.port ? ` to any port ${rule.port.trim()}` : '';
      return `sudo ufw ${action} ${dir}${ifacePart}${protoPart}${srcPart}${portPart}${commentPart}`;
    }

    // Standard simple UFW rule: sudo ufw allow 8080/tcp comment '...'
    if (rule.port) {
      const portSpec = proto ? `${rule.port.trim()}/${proto}` : rule.port.trim();
      return `sudo ufw ${action} ${portSpec}${commentPart}`;
    }

    return `sudo ufw ${action} proto ${proto || 'tcp'}${commentPart}`;
  }

  buildDeleteRuleCommand(rule: LinuxFirewallRule): string {
    if (rule.ruleNumber) {
      return `echo "y" | sudo ufw delete ${rule.ruleNumber}`;
    }
    // Fallback: delete by specification
    const action = rule.action.toLowerCase();
    const port = rule.port ? `${rule.port}/${rule.protocol || 'tcp'}` : '';
    return `echo "y" | sudo ufw delete ${action} ${port}`.trim();
  }

  buildToggleCommand(enable: boolean): string {
    return enable ? 'echo "y" | sudo ufw enable' : 'sudo ufw disable';
  }

  buildReloadCommand(): string {
    return 'sudo ufw reload';
  }

  buildRestartCommand(): string {
    return 'sudo systemctl restart ufw.service 2>/dev/null || sudo ufw reload';
  }

  buildPolicyCommand(policy: { incoming?: string; outgoing?: string; forward?: string }): string {
    const cmds: string[] = [];
    if (policy.incoming) cmds.push(`sudo ufw default ${policy.incoming.toLowerCase()} incoming`);
    if (policy.outgoing) cmds.push(`sudo ufw default ${policy.outgoing.toLowerCase()} outgoing`);
    if (policy.forward) cmds.push(`sudo ufw default ${policy.forward.toLowerCase()} routed`);
    return cmds.join(' && ');
  }
}

// -------------------------------------------------------------
// PROVIDER 2: FIREWALLD (RHEL, Rocky, AlmaLinux, CentOS, Fedora, openSUSE)
// -------------------------------------------------------------
export class FirewalldProvider implements FirewallProvider {
  readonly backend: LinuxFirewallBackend = 'firewalld';
  readonly displayName = 'firewalld (Dynamic Firewall Daemon)';
  readonly serviceName = 'firewalld.service';
  readonly capabilities: LinuxFirewallCapabilities = {
    supportsRuleOrdering: false,
    supportsComments: false,
    supportsZones: true,
    supportsIPv6: true,
    supportsLogging: true,
    supportsPortRanges: true,
    supportsInterfaces: true,
    supportsDefaultPolicies: true,
    supportsToggleState: true,
  };

  parseStatus(rawOutput: string): {
    status: LinuxFirewallStatus;
    installed: boolean;
    enabled: boolean;
    active: boolean;
    version?: string;
    defaultPolicies: LinuxFirewallPolicies;
    rules: LinuxFirewallRule[];
    activeZone?: string;
  } {
    const section = extractSection(rawOutput, 'FIREWALLD_STATUS') || rawOutput;
    const lines = section.split('\n');
    let installed = section.includes('firewall-cmd') || rawOutput.includes('firewalld.service');
    let active = false;
    let enabled = false;
    let status: LinuxFirewallStatus = 'not_installed';
    let activeZone = 'public';
    const defaultPolicies: LinuxFirewallPolicies = {
      incoming: 'REJECT',
      outgoing: 'ALLOW',
      forward: 'DROP',
    };
    const rules: LinuxFirewallRule[] = [];

    for (const line of lines) {
      const lower = line.toLowerCase().trim();
      if (lower === 'running') {
        active = true;
        enabled = true;
        status = 'active';
      } else if (lower === 'not running') {
        active = false;
        status = 'inactive';
      }
    }

    if (!active && rawOutput.includes('firewalld.service') && rawOutput.includes('active') && !rawOutput.includes('firewalld:inactive')) {
      active = true;
      enabled = true;
      status = 'active';
    }

    // Parse list-all output
    let currentZone = 'public';
    let ruleIndex = 1;

    for (const line of lines) {
      const zoneHeaderMatch = line.match(/^([a-zA-Z0-9_-]+)\s+\(active\)/);
      if (zoneHeaderMatch) {
        currentZone = zoneHeaderMatch[1];
        activeZone = currentZone;
      }

      const trimmed = line.trim();
      if (trimmed.startsWith('target:')) {
        const target = trimmed.split(':')[1]?.trim().toUpperCase();
        if (target === 'ACCEPT') defaultPolicies.incoming = 'ALLOW';
        else if (target === 'DROP') defaultPolicies.incoming = 'DROP';
        else if (target === 'REJECT' || target === 'DEFAULT') defaultPolicies.incoming = 'REJECT';
      }

      // Services: cockpit dhcpv6-client ssh
      if (trimmed.startsWith('services:')) {
        const srvs = trimmed.replace('services:', '').trim().split(/\s+/).filter(Boolean);
        for (const s of srvs) {
          const sLower = s.toLowerCase();
          const mapped = WELL_KNOWN_SERVICES[sLower];
          const portStr = mapped && mapped.length > 0 ? mapped.join(',') : (sLower === 'ssh' ? '22' : sLower === 'http' ? '80' : sLower === 'https' ? '443' : s);
          rules.push({
            id: `firewalld-svc-${s}`,
            ruleNumber: ruleIndex++,
            backend: 'firewalld',
            action: 'ALLOW',
            direction: 'IN',
            protocol: 'tcp',
            port: portStr,
            source: 'Any',
            ipVersion: 'both',
            enabled: true,
            comment: `Service: ${s} (Zone: ${currentZone})`,
            rawRule: `service ${s}`,
          });
        }
      }

      // Ports: 80/tcp 443/tcp
      if (trimmed.startsWith('ports:')) {
        const ports = trimmed.replace('ports:', '').trim().split(/\s+/).filter(Boolean);
        for (const p of ports) {
          const [pNum, pProto] = p.split('/');
          rules.push({
            id: `firewalld-port-${p}`,
            ruleNumber: ruleIndex++,
            backend: 'firewalld',
            action: 'ALLOW',
            direction: 'IN',
            protocol: (pProto?.toLowerCase() as any) || 'tcp',
            port: pNum,
            source: 'Any',
            ipVersion: 'both',
            enabled: true,
            comment: `Port: ${p} (Zone: ${currentZone})`,
            rawRule: `port ${p}`,
          });
        }
      }

      // Rich rules: rule family="ipv4" source address="192.168.1.0/24" port port="3306" protocol="tcp" accept
      if (trimmed.startsWith('rule ') || line.includes('rich-rules')) {
        const act = trimmed.includes('accept') ? 'ALLOW' : trimmed.includes('reject') ? 'REJECT' : 'DENY';
        const portM = trimmed.match(/port\s*=\s*"(\d+)"/);
        const protoM = trimmed.match(/protocol\s*=\s*"([a-z]+)"/i);
        const srcM = trimmed.match(/source\s*address\s*=\s*"([^"]+)"/);
        const familyM = trimmed.match(/family\s*=\s*"([^"]+)"/);

        rules.push({
          id: `firewalld-rich-${ruleIndex}`,
          ruleNumber: ruleIndex++,
          backend: 'firewalld',
          action: act as any,
          direction: 'IN',
          protocol: (protoM ? protoM[1].toLowerCase() : 'tcp') as any,
          port: portM ? portM[1] : undefined,
          source: srcM ? srcM[1] : 'Any',
          ipVersion: familyM && familyM[1].includes('6') ? 'v6' : familyM && familyM[1].includes('4') ? 'v4' : 'both',
          enabled: true,
          comment: 'Rich rule',
          rawRule: trimmed,
        });
      }
    }

    return {
      status: active ? 'active' : installed ? 'inactive' : 'not_installed',
      installed,
      enabled,
      active,
      defaultPolicies,
      rules,
      activeZone,
    };
  }

  buildAddRuleCommand(rule: LinuxFirewallRulePayload, activeZone = 'public'): string {
    const proto = rule.protocol || 'tcp';
    const zone = activeZone || 'public';
    // If specific source is specified, use rich-rule:
    if (rule.source && rule.source.toLowerCase() !== 'any') {
      const family = rule.ipVersion === 'v6' ? 'ipv6' : 'ipv4';
      const action = (rule.action || 'allow').toLowerCase() === 'allow' ? 'accept' : 'drop';
      const portPart = rule.port ? ` port port="${rule.port}" protocol="${proto}"` : '';
      return `sudo firewall-cmd --permanent --zone=${zone} --add-rich-rule='rule family="${family}" source address="${rule.source}"${portPart} ${action}' && sudo firewall-cmd --reload`;
    }

    // Standard port opening
    if (rule.port) {
      return `sudo firewall-cmd --permanent --zone=${zone} --add-port=${rule.port}/${proto} && sudo firewall-cmd --reload`;
    }

    return `sudo firewall-cmd --permanent --zone=${zone} --add-service=ssh && sudo firewall-cmd --reload`;
  }

  buildDeleteRuleCommand(rule: LinuxFirewallRule, activeZone = 'public'): string {
    const zone = activeZone || 'public';
    if (rule.rawRule?.startsWith('service ')) {
      const svc = rule.rawRule.replace('service ', '').trim();
      return `sudo firewall-cmd --permanent --zone=${zone} --remove-service=${svc} && sudo firewall-cmd --reload`;
    }
    if (rule.rawRule?.startsWith('rule ')) {
      return `sudo firewall-cmd --permanent --zone=${zone} --remove-rich-rule='${rule.rawRule}' && sudo firewall-cmd --reload`;
    }
    if (rule.port) {
      const proto = rule.protocol || 'tcp';
      return `sudo firewall-cmd --permanent --zone=${zone} --remove-port=${rule.port}/${proto} && sudo firewall-cmd --reload`;
    }
    return 'sudo firewall-cmd --reload';
  }

  buildToggleCommand(enable: boolean): string {
    return enable
      ? 'sudo systemctl enable --now firewalld.service'
      : 'sudo systemctl stop firewalld.service && sudo systemctl disable firewalld.service';
  }

  buildReloadCommand(): string {
    return 'sudo firewall-cmd --reload';
  }

  buildRestartCommand(): string {
    return 'sudo systemctl restart firewalld.service';
  }

  buildPolicyCommand(policy: { incoming?: string; outgoing?: string; forward?: string }): string {
    if (policy.incoming) {
      const target = policy.incoming === 'ALLOW' ? 'ACCEPT' : policy.incoming === 'DROP' ? 'DROP' : 'REJECT';
      return `sudo firewall-cmd --permanent --set-target=${target} && sudo firewall-cmd --reload`;
    }
    return 'sudo firewall-cmd --reload';
  }
}

// -------------------------------------------------------------
// PROVIDER 3: NFTABLES (Modern Debian / Arch / Generic Linux)
// -------------------------------------------------------------
export class NftablesFirewallProvider implements FirewallProvider {
  readonly backend: LinuxFirewallBackend = 'nftables';
  readonly displayName = 'nftables (Netfilter Tables)';
  readonly serviceName = 'nftables.service';
  readonly capabilities: LinuxFirewallCapabilities = {
    supportsRuleOrdering: true,
    supportsComments: true,
    supportsZones: false,
    supportsIPv6: true,
    supportsLogging: true,
    supportsPortRanges: true,
    supportsInterfaces: true,
    supportsDefaultPolicies: true,
    supportsToggleState: true,
  };

  parseStatus(rawOutput: string): {
    status: LinuxFirewallStatus;
    installed: boolean;
    enabled: boolean;
    active: boolean;
    version?: string;
    defaultPolicies: LinuxFirewallPolicies;
    rules: LinuxFirewallRule[];
  } {
    const section = extractSection(rawOutput, 'NFTABLES_STATUS') || rawOutput;
    const isInstalled = section.includes('nft list') || rawOutput.includes('nftables.service');
    const isActive = section.includes('table ') || (rawOutput.includes('nftables.service') && rawOutput.includes('active') && !rawOutput.includes('nftables:inactive'));
    const defaultPolicies: LinuxFirewallPolicies = {
      incoming: 'DROP',
      outgoing: 'ALLOW',
      forward: 'DROP',
    };
    const rules: LinuxFirewallRule[] = [];

    let ruleIndex = 1;
    const lines = section.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // hook input ... policy drop
      if (trimmed.includes('type filter hook input') && trimmed.includes('policy')) {
        const polMatch = trimmed.match(/policy\s+([a-z]+)/i);
        if (polMatch) defaultPolicies.incoming = polMatch[1].toUpperCase() === 'ACCEPT' ? 'ALLOW' : polMatch[1].toUpperCase();
      }

      // dport 22 accept
      if (trimmed.includes('dport') || (trimmed.includes('accept') && (trimmed.includes('tcp') || trimmed.includes('udp')))) {
        const act = trimmed.includes('accept') ? 'ALLOW' : trimmed.includes('drop') ? 'DENY' : 'REJECT';
        const portMatch = trimmed.match(/dport\s+([0-9,:-]+|\{[^}]+\})/);
        const protoMatch = trimmed.match(/(tcp|udp)/);
        const commentMatch = trimmed.match(/comment\s+"([^"]+)"/);

        const handleMatch = trimmed.match(/#\s+handle\s+(\d+)/);
        const ruleNum = handleMatch ? parseInt(handleMatch[1], 10) : ruleIndex++;

        rules.push({
          id: `nft-${ruleNum}`,
          ruleNumber: ruleNum,
          handle: handleMatch ? parseInt(handleMatch[1], 10) : undefined,
          backend: 'nftables',
          action: act as any,
          direction: 'IN',
          protocol: (protoMatch ? protoMatch[1].toLowerCase() : 'tcp') as any,
          port: portMatch ? portMatch[1].replace(/[{}]/g, '').trim() : undefined,
          source: 'Any',
          ipVersion: 'both',
          enabled: true,
          comment: commentMatch ? commentMatch[1] : undefined,
          rawRule: trimmed,
        });
      }
    }

    return {
      status: isActive ? 'active' : isInstalled ? 'inactive' : 'not_installed',
      installed: isInstalled,
      enabled: isActive,
      active: isActive,
      defaultPolicies,
      rules,
    };
  }

  buildAddRuleCommand(rule: LinuxFirewallRulePayload): string {
    const action = (rule.action || 'allow').toLowerCase() === 'allow' ? 'accept' : rule.action?.toLowerCase() === 'reject' ? 'reject' : 'drop';
    const proto = rule.protocol && rule.protocol !== 'any' && rule.protocol !== 'all' ? rule.protocol.toLowerCase() : '';

    let portPart = '';
    if (rule.port && rule.port.trim() && rule.port.trim().toLowerCase() !== 'any' && rule.port.trim() !== '*') {
      const p = rule.port.trim();
      if (p.includes(',')) {
        const ports = p.split(',').map((x) => x.trim()).filter(Boolean).join(', ');
        portPart = `dport { ${ports} }`;
      } else if (p.includes(':') || p.includes('-')) {
        portPart = `dport ${p.replace(':', '-')}`;
      } else {
        portPart = `dport ${p}`;
      }
    }

    let srcPart = '';
    if (rule.source && rule.source.trim().toLowerCase() !== 'any' && rule.source.trim() !== '*') {
      const isV6 = rule.source.includes(':') || rule.ipVersion === 'v6';
      srcPart = `${isV6 ? 'ip6' : 'ip'} saddr ${rule.source.trim()}`;
    }

    const protoPart = proto && proto !== 'icmp' ? `${proto} ` : proto === 'icmp' ? 'ip protocol icmp ' : '';
    const cleanComment = (rule.comment || '').replace(/["'\\]/g, '').trim();
    // In nftables, comments MUST be quoted strings. Using single quotes around double quotes preserves double quotes across bash:
    const commentPart = cleanComment ? ` comment '"${cleanComment}"'` : '';

    const ruleSpec = `${srcPart ? srcPart + ' ' : ''}${protoPart}${portPart ? portPart + ' ' : ''}${action}${commentPart}`.trim();

    return `sudo nft add table inet filter 2>/dev/null || true; sudo nft add chain inet filter input '{ type filter hook input priority 0; policy accept; }' 2>/dev/null || true; sudo nft add rule inet filter input ${ruleSpec}`;
  }

  buildDeleteRuleCommand(rule: LinuxFirewallRule): string {
    const handle = rule.handle || rule.ruleNumber;
    if (handle) {
      return `sudo nft delete rule inet filter input handle ${handle} 2>/dev/null || true`;
    }
    const port = rule.port || '';
    const proto = rule.protocol || 'tcp';
    return `H=$(sudo nft -a list table inet filter 2>/dev/null | grep -E "${proto}.*dport.*${port}" | grep -oE "handle [0-9]+" | awk '{print $2}' | head -n 1); [ -n "$H" ] && sudo nft delete rule inet filter input handle $H 2>/dev/null || true`;
  }

  buildToggleCommand(enable: boolean): string {
    return enable
      ? 'sudo systemctl enable --now nftables.service'
      : 'sudo systemctl stop nftables.service && sudo systemctl disable nftables.service';
  }

  buildReloadCommand(): string {
    return 'sudo systemctl reload nftables.service || sudo systemctl restart nftables.service';
  }

  buildRestartCommand(): string {
    return 'sudo systemctl restart nftables.service';
  }

  buildPolicyCommand(policy: { incoming?: string; outgoing?: string; forward?: string }): string {
    if (policy.incoming) {
      const p = policy.incoming.toLowerCase() === 'allow' ? 'accept' : 'drop';
      return `sudo nft chain inet filter input '{ policy ${p}; }'`;
    }
    return 'sudo systemctl reload nftables.service';
  }
}

// -------------------------------------------------------------
// PROVIDER 4: IPTABLES (Legacy Linux Kernel Netfilter)
// -------------------------------------------------------------
export class IptablesFirewallProvider implements FirewallProvider {
  readonly backend: LinuxFirewallBackend = 'iptables';
  readonly displayName = 'iptables (Netfilter IPv4/IPv6)';
  readonly serviceName = 'iptables.service';
  readonly capabilities: LinuxFirewallCapabilities = {
    supportsRuleOrdering: true,
    supportsComments: true,
    supportsZones: false,
    supportsIPv6: false,
    supportsLogging: true,
    supportsPortRanges: true,
    supportsInterfaces: true,
    supportsDefaultPolicies: true,
    supportsToggleState: false,
  };

  parseStatus(rawOutput: string): {
    status: LinuxFirewallStatus;
    installed: boolean;
    enabled: boolean;
    active: boolean;
    version?: string;
    defaultPolicies: LinuxFirewallPolicies;
    rules: LinuxFirewallRule[];
  } {
    const section = extractSection(rawOutput, 'IPTABLES_STATUS') || rawOutput;
    const isInstalled = section.includes('-P INPUT') || section.includes('iptables');
    let hasRules = false;
    const defaultPolicies: LinuxFirewallPolicies = {
      incoming: 'ACCEPT',
      outgoing: 'ACCEPT',
      forward: 'DROP',
    };
    const rules: LinuxFirewallRule[] = [];

    const lines = section.split('\n');
    let ruleIndex = 1;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-P INPUT')) {
        defaultPolicies.incoming = trimmed.includes('ACCEPT') ? 'ALLOW' : 'DROP';
      }
      if (trimmed.startsWith('-P OUTPUT')) {
        defaultPolicies.outgoing = trimmed.includes('ACCEPT') ? 'ALLOW' : 'DROP';
      }

      // -A INPUT -p tcp -m tcp --dport 22 -j ACCEPT
      if (trimmed.startsWith('-A INPUT')) {
        hasRules = true;
        const protoMatch = trimmed.match(/-p\s+([a-z]+)/i);
        const portMatch = trimmed.match(/--(?:dports?|dport)\s+([0-9,:-]+)/);
        const actMatch = trimmed.match(/-j\s+([A-Z]+)/);
        const srcMatch = trimmed.match(/-s\s+([0-9./]+)/);
        const commentMatch = trimmed.match(/--comment\s+"([^"]+)"/);

        const action = actMatch ? (actMatch[1] === 'ACCEPT' ? 'ALLOW' : actMatch[1] === 'DROP' ? 'DENY' : 'REJECT') : 'ALLOW';

        rules.push({
          id: `iptables-${ruleIndex}`,
          ruleNumber: ruleIndex++,
          backend: 'iptables',
          action: action as any,
          direction: 'IN',
          protocol: (protoMatch ? protoMatch[1].toLowerCase() : 'tcp') as any,
          port: portMatch ? portMatch[1] : undefined,
          source: srcMatch ? srcMatch[1] : 'Any',
          ipVersion: 'v4',
          enabled: true,
          comment: commentMatch ? commentMatch[1] : undefined,
          rawRule: trimmed,
        });
      }
    }

    const isActive = hasRules || defaultPolicies.incoming === 'DROP';

    return {
      status: isActive ? 'active' : isInstalled ? 'inactive' : 'not_installed',
      installed: isInstalled,
      enabled: isActive,
      active: isActive,
      defaultPolicies,
      rules,
    };
  }

  buildAddRuleCommand(rule: LinuxFirewallRulePayload): string {
    const proto = rule.protocol || 'tcp';
    let portPart = '';
    if (rule.port) {
      const p = rule.port.trim();
      if (p.includes(',')) {
        portPart = `-m multiport --dports ${p}`;
      } else {
        portPart = `--dport ${p}`;
      }
    }
    const src = rule.source && rule.source.toLowerCase() !== 'any' ? `-s ${rule.source}` : '';
    const action = (rule.action || 'allow').toUpperCase() === 'ALLOW' ? 'ACCEPT' : 'DROP';
    const cleanComment = (rule.comment || '').replace(/["'\\]/g, '').trim();
    const comment = cleanComment ? `-m comment --comment '"${cleanComment}"'` : '';

    return `sudo iptables -I INPUT 1 -p ${proto} ${portPart} ${src} ${comment} -j ${action}`.replace(/\s+/g, ' ').trim();
  }

  buildDeleteRuleCommand(rule: LinuxFirewallRule): string {
    if (rule.ruleNumber) {
      return `sudo iptables -D INPUT ${rule.ruleNumber}`;
    }
    return 'sudo iptables -L -n';
  }

  buildToggleCommand(enable: boolean): string {
    return enable
      ? 'sudo iptables -P INPUT DROP && sudo iptables -P FORWARD DROP && sudo iptables -P OUTPUT ACCEPT'
      : 'sudo iptables -P INPUT ACCEPT && sudo iptables -P FORWARD ACCEPT && sudo iptables -P OUTPUT ACCEPT';
  }

  buildReloadCommand(): string {
    return 'sudo iptables-save 2>/dev/null || true';
  }

  buildRestartCommand(): string {
    return 'sudo systemctl restart iptables.service 2>/dev/null || true';
  }

  buildPolicyCommand(policy: { incoming?: string; outgoing?: string; forward?: string }): string {
    const cmds: string[] = [];
    if (policy.incoming) cmds.push(`sudo iptables -P INPUT ${policy.incoming.toUpperCase() === 'ALLOW' ? 'ACCEPT' : 'DROP'}`);
    if (policy.outgoing) cmds.push(`sudo iptables -P OUTPUT ${policy.outgoing.toUpperCase() === 'ALLOW' ? 'ACCEPT' : 'DROP'}`);
    return cmds.join(' && ');
  }
}

// -------------------------------------------------------------
// PROVIDER 5: NO FIREWALL (Fallback when none active)
// -------------------------------------------------------------
export class NoFirewallProvider implements FirewallProvider {
  readonly backend: LinuxFirewallBackend = 'none';
  readonly displayName = 'No Active Firewall';
  readonly serviceName = 'none';
  readonly capabilities: LinuxFirewallCapabilities = {
    supportsRuleOrdering: false,
    supportsComments: false,
    supportsZones: false,
    supportsIPv6: false,
    supportsLogging: false,
    supportsPortRanges: false,
    supportsInterfaces: false,
    supportsDefaultPolicies: false,
    supportsToggleState: false,
  };

  parseStatus(): {
    status: LinuxFirewallStatus;
    installed: boolean;
    enabled: boolean;
    active: boolean;
    version?: string;
    defaultPolicies: LinuxFirewallPolicies;
    rules: LinuxFirewallRule[];
  } {
    return {
      status: 'not_installed',
      installed: false,
      enabled: false,
      active: false,
      defaultPolicies: {
        incoming: 'ALLOW (Open)',
        outgoing: 'ALLOW (Open)',
        forward: 'ALLOW',
      },
      rules: [],
    };
  }

  buildAddRuleCommand(): string {
    throw new Error('No supported active firewall backend found on this server.');
  }
  buildDeleteRuleCommand(): string {
    throw new Error('No supported active firewall backend found on this server.');
  }
  buildToggleCommand(): string {
    return 'echo "No firewall service to toggle"';
  }
  buildReloadCommand(): string {
    return 'echo "No firewall service to reload"';
  }
  buildRestartCommand(): string {
    return 'echo "No firewall service to restart"';
  }
  buildPolicyCommand(): string {
    return 'echo "No firewall default policy support"';
  }
}

// Compact, real-server detection probe script
const FIREWALL_DETECTION_SCRIPT = `export LC_ALL=C
echo "===DISTRO==="
cat /etc/os-release 2>/dev/null | grep -E '^(ID|VERSION_ID|PRETTY_NAME)=' || true

echo "===SERVICES==="
systemctl is-active ufw.service 2>/dev/null || echo "ufw:inactive"
echo "---"
systemctl is-active firewalld.service 2>/dev/null || echo "firewalld:inactive"
echo "---"
systemctl is-active nftables.service 2>/dev/null || echo "nftables:inactive"

echo "===UFW_STATUS==="
if command -v ufw >/dev/null 2>&1; then
  sudo ufw status verbose 2>/dev/null || ufw status verbose 2>/dev/null || true
  echo "---UFW_NUM---"
  sudo ufw status numbered 2>/dev/null || ufw status numbered 2>/dev/null || true
fi

echo "===FIREWALLD_STATUS==="
if command -v firewall-cmd >/dev/null 2>&1; then
  sudo firewall-cmd --state 2>/dev/null || firewall-cmd --state 2>/dev/null || true
  echo "---FIREWALLD_ALL---"
  sudo firewall-cmd --list-all 2>/dev/null || firewall-cmd --list-all 2>/dev/null || true
  echo "---FIREWALLD_RICH---"
  sudo firewall-cmd --list-rich-rules 2>/dev/null || firewall-cmd --list-rich-rules 2>/dev/null || true
fi

echo "===NFTABLES_STATUS==="
if command -v nft >/dev/null 2>&1; then
  sudo nft list ruleset 2>/dev/null || nft list ruleset 2>/dev/null || true
fi

echo "===IPTABLES_STATUS==="
if command -v iptables >/dev/null 2>&1; then
  sudo iptables -S 2>/dev/null || iptables -S 2>/dev/null || sudo iptables -L -n -v 2>/dev/null || iptables -L -n -v 2>/dev/null || true
fi

echo "===LISTENING_PORTS==="
ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null || true
`;

/**
 * Helper: Parse raw port string that may contain protocol suffix like "8080/tcp", "22/udp", "8000-8010/tcp"
 */
function parsePortProto(raw?: string): { port: string; proto?: string } {
  if (!raw) return { port: '', proto: undefined };
  let str = String(raw).trim();
  let proto: string | undefined = undefined;
  if (str.includes('/')) {
    const parts = str.split('/');
    str = parts[0].trim();
    proto = parts[1].trim().toLowerCase();
  }
  return { port: str, proto };
}

/**
 * Checks if a rule matches a given port, protocol, and direction
 */
function matchRuleToPort(rule: LinuxFirewallRule, targetPort: number, targetProto: string): boolean {
  let ruleProto = rule.protocol ? rule.protocol.toLowerCase() : undefined;
  let parsedPort = rule.port || '';

  // Handle composite port specifications like "8080/tcp" or "22/tcp"
  if (parsedPort) {
    const parsed = parsePortProto(parsedPort);
    parsedPort = parsed.port;
    if (parsed.proto && (!ruleProto || ruleProto === 'any' || ruleProto === 'all')) {
      ruleProto = parsed.proto;
    }
  }

  // Protocol check
  if (ruleProto && ruleProto !== 'any' && ruleProto !== 'all') {
    if (ruleProto.toLowerCase() !== targetProto.toLowerCase()) {
      return false;
    }
  }

  // Direction check: ignore OUT rules for incoming listening sockets
  if (rule.direction === 'OUT') {
    return false;
  }

  // If port is not specified or Any, it matches any port
  if (!parsedPort || parsedPort.toLowerCase() === 'any' || parsedPort === '*') {
    return true;
  }

  const rawPort = parsedPort.trim().toLowerCase();

  // 1. Direct number match
  if (rawPort === String(targetPort)) {
    return true;
  }

  // 2. Comma-separated list: 80,443,8080
  if (rawPort.includes(',')) {
    const parts = rawPort.split(',').map((p) => p.trim());
    if (parts.includes(String(targetPort))) {
      return true;
    }
  }

  // 3. Range: 8000-8010 or 8000:8010
  if (rawPort.includes('-') || rawPort.includes(':')) {
    const sep = rawPort.includes('-') ? '-' : ':';
    const [minStr, maxStr] = rawPort.split(sep);
    const min = parseInt(minStr, 10);
    const max = parseInt(maxStr, 10);
    if (!isNaN(min) && !isNaN(max) && targetPort >= min && targetPort <= max) {
      return true;
    }
  }

  // 4. Service name: e.g. OpenSSH, ssh, http, https, etc.
  const cleanService = rawPort.replace(/[^a-z0-9_-]/g, '');
  if (WELL_KNOWN_SERVICES[cleanService]?.includes(targetPort)) {
    return true;
  }

  return false;
}

/**
 * Helper: Parse Listening Ports from ss -tulpn / netstat -tulpn and cross-reference with firewall rules
 */
export function parseListeningPorts(
  output: string,
  rules: LinuxFirewallRule[],
  incomingPolicy: string,
  firewallActive: boolean = true,
  serverSshPort: number = 22
): LinuxListeningPortSummary[] {
  const summaries: LinuxListeningPortSummary[] = [];
  const lines = output.split('\n');
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Netid') || trimmed.startsWith('Active') || trimmed.startsWith('Proto')) continue;

    // 1. Try ss format:
    // tcp LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=1234,fd=3))
    // tcp LISTEN 0 128 *:22 *:* users:(("sshd",pid=1234,fd=3))
    // tcp LISTEN 0 128 [::]:22 [::]:*
    let proto = '';
    let addr = '';
    let port = 0;
    let proc: string | undefined = undefined;
    let pid: number | undefined = undefined;

    const ssMatch = trimmed.match(/^(tcp|udp)[46]?\s+[A-Z_0-9-]+\s+\d+\s+\d+\s+([^\s]+):(\d+)\s+[^\s]+(?:\s+users:\(\("([^"]+)",pid=(\d+))?/i);
    if (ssMatch) {
      proto = ssMatch[1].toLowerCase();
      addr = ssMatch[2];
      port = parseInt(ssMatch[3], 10);
      proc = ssMatch[4];
      pid = ssMatch[5] ? parseInt(ssMatch[5], 10) : undefined;
    } else {
      // 2. Try netstat format:
      // tcp 0 0 0.0.0.0:22 0.0.0.0:* LISTEN 1234/sshd
      const netstatMatch = trimmed.match(/^(tcp|udp)[46]?\s+\d+\s+\d+\s+([^\s]+):(\d+)\s+[^\s]+(?:\s+[A-Z]+)?(?:\s+(\d+)\/([^\s]+))?/i);
      if (netstatMatch) {
        proto = netstatMatch[1].toLowerCase();
        addr = netstatMatch[2];
        port = parseInt(netstatMatch[3], 10);
        pid = netstatMatch[4] ? parseInt(netstatMatch[4], 10) : undefined;
        proc = netstatMatch[5];
      }
    }

    if (!proto || isNaN(port) || port <= 0 || port > 65535) continue;

    const key = `${proto}:${port}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Evaluate firewall accessibility:
    let isAllowed = false;
    let isAnyRule = false;
    let matchingRule: LinuxFirewallRule | undefined = undefined;

    if (!firewallActive) {
      // If firewall is disabled or not running, all sockets are fully reachable
      isAllowed = true;
      isAnyRule = true;
    } else if (isLoopbackAddress(addr)) {
      // Localhost/loopback (127.0.0.1, ::1) is internal only and never blocked by firewall
      isAllowed = true;
    } else if (port === serverSshPort) {
      // The current management SSH connection is alive and verified open
      isAllowed = true;
      for (const r of rules) {
        if (matchRuleToPort(r, port, proto)) {
          matchingRule = r;
          break;
        }
      }
    } else {
      let matchedByExplicitRule = false;

      // Look for explicit matching firewall rules
      for (const r of rules) {
        if (matchRuleToPort(r, port, proto)) {
          matchingRule = r;
          matchedByExplicitRule = true;
          if (r.action === 'ALLOW') {
            isAllowed = true;
            if (!r.port || r.port.toLowerCase() === 'any' || r.port === '*' || r.port === 'all') {
              isAnyRule = true;
            }
          } else if (r.action === 'DENY' || r.action === 'REJECT') {
            isAllowed = false;
          }
          break;
        }
      }

      if (!matchedByExplicitRule) {
        if (incomingPolicy === 'ALLOW' || incomingPolicy === 'ACCEPT') {
          isAllowed = true;
          isAnyRule = true;
        } else {
          isAllowed = false;
        }
      }
    }

    summaries.push({
      port,
      proto,
      process: proc,
      pid,
      address: addr,
      allowedInFirewall: isAllowed,
      isOpenByAnyPolicy: isAllowed && isAnyRule,
      matchingRule,
    });
  }

  // 3. Integrate all explicit ALLOW firewall rules into the summary so that
  // any ports opened by the user appear immediately, even before a listening daemon starts
  for (const r of rules) {
    if (r.action !== 'ALLOW' || r.direction === 'OUT') continue;
    if (!r.port || r.port.toLowerCase() === 'any' || r.port === '*') continue;

    const portsToAdd: number[] = [];
    const parsed = parsePortProto(r.port);
    const rawPort = parsed.port.trim().toLowerCase();

    if (/^\d+$/.test(rawPort)) {
      portsToAdd.push(parseInt(rawPort, 10));
    } else if (rawPort.includes(',')) {
      for (const p of rawPort.split(',')) {
        const num = parseInt(p.trim(), 10);
        if (!isNaN(num) && num > 0 && num <= 65535) portsToAdd.push(num);
      }
    } else if (rawPort.includes('-') || rawPort.includes(':')) {
      const sep = rawPort.includes('-') ? '-' : ':';
      const [minStr, maxStr] = rawPort.split(sep);
      const min = parseInt(minStr, 10);
      const max = parseInt(maxStr, 10);
      if (!isNaN(min) && !isNaN(max) && min > 0 && max <= 65535 && (max - min) <= 50) {
        for (let p = min; p <= max; p++) portsToAdd.push(p);
      } else if (!isNaN(min)) {
        portsToAdd.push(min);
      }
    } else {
      const cleanService = rawPort.replace(/[^a-z0-9_-]/g, '');
      const srvPorts = WELL_KNOWN_SERVICES[cleanService];
      if (srvPorts) {
        portsToAdd.push(...srvPorts);
      }
    }

    const rProto = parsed.proto || ((r.protocol && r.protocol !== 'any' && r.protocol !== 'all') ? r.protocol.toLowerCase() : 'tcp');

    for (const p of portsToAdd) {
      const key = `${rProto}:${p}`;
      if (!seen.has(key)) {
        seen.add(key);
        summaries.push({
          port: p,
          proto: rProto,
          process: r.comment || (r.rawRule?.startsWith('service ') ? r.rawRule : undefined) || 'Firewall Open Port',
          address: r.source && r.source.toLowerCase() !== 'any' ? r.source : '0.0.0.0',
          allowedInFirewall: true,
          isOpenByAnyPolicy: false,
          matchingRule: r,
        });
      } else {
        // If it was already in summaries (from ss), ensure allowedInFirewall is set to true!
        const existing = summaries.find((s) => s.port === p && (s.proto === rProto || rProto === 'any'));
        if (existing) {
          existing.allowedInFirewall = true;
          if (!existing.matchingRule) {
            existing.matchingRule = r;
          }
        }
      }
    }
  }

  // Sort summaries numerically by port
  summaries.sort((a, b) => a.port - b.port);

  return summaries;
}

function checkIsAnyPortOpen(
  rules: LinuxFirewallRule[],
  defaultPolicies: LinuxFirewallPolicies,
  isFirewallActive: boolean
): { isAnyPortOpen: boolean; anyPortOpenReason?: string } {
  if (!isFirewallActive) {
    return {
      isAnyPortOpen: true,
      anyPortOpenReason: 'Firewall daemon is inactive or not running (all network ports are open).',
    };
  }
  const hasWildcardAllow = rules.some(
    (r) =>
      r.action === 'ALLOW' &&
      r.direction !== 'OUT' &&
      (!r.port || r.port.toLowerCase() === 'any' || r.port === '*' || r.port === 'all')
  );
  const isPolicyAllow =
    defaultPolicies.incoming === 'ALLOW' ||
    defaultPolicies.incoming === 'ACCEPT' ||
    String(defaultPolicies.incoming).includes('ALLOW');

  if (hasWildcardAllow) {
    return {
      isAnyPortOpen: true,
      anyPortOpenReason: 'Wildcard firewall rule (Any/All) allows incoming traffic without port restrictions.',
    };
  }
  if (isPolicyAllow) {
    return {
      isAnyPortOpen: true,
      anyPortOpenReason: 'Default incoming policy is set to ALLOW (all inbound ports unrestricted).',
    };
  }
  return { isAnyPortOpen: false };
}

/**
 * Main Detection Entry Point
 */
export async function detectLinuxFirewall(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<LinuxFirewallInfo> {
  const out = (await runAdaptiveSshCommand(server, FIREWALL_DETECTION_SCRIPT, ephemeralPassword)) || '';

  // Extract individual isolated sections
  const ufwSection = extractSection(out, 'UFW_STATUS');
  const firewalldSection = extractSection(out, 'FIREWALLD_STATUS');
  const nftablesSection = extractSection(out, 'NFTABLES_STATUS');
  const iptablesSection = extractSection(out, 'IPTABLES_STATUS');
  const listeningSection = extractSection(out, 'LISTENING_PORTS') || out;
  const serverSshPort = server.ssh_port || 22;

  // Instantiate providers
  const ufwProvider = new UfwFirewallProvider();
  const firewalldProvider = new FirewalldProvider();
  const nftablesProvider = new NftablesFirewallProvider();
  const iptablesProvider = new IptablesFirewallProvider();
  const noFwProvider = new NoFirewallProvider();

  // Evaluate which provider is active
  // 1. Check UFW
  const ufwParsed = ufwProvider.parseStatus(ufwSection || out);
  if (ufwParsed.active) {
    const listening = parseListeningPorts(listeningSection, ufwParsed.rules, ufwParsed.defaultPolicies.incoming, true, serverSshPort);
    return {
      backend: 'ufw',
      status: 'active',
      serviceName: ufwProvider.serviceName,
      installed: true,
      enabled: ufwParsed.enabled,
      active: true,
      defaultPolicies: ufwParsed.defaultPolicies,
      rulesCount: ufwParsed.rules.length,
      rules: ufwParsed.rules,
      capabilities: ufwProvider.capabilities,
      rawStatusOutput: out,
      listeningPortsSummary: listening,
      ...checkIsAnyPortOpen(ufwParsed.rules, ufwParsed.defaultPolicies, true),
    };
  }

  // 2. Check firewalld
  const fwdParsed = firewalldProvider.parseStatus(firewalldSection || out);
  if (fwdParsed.active) {
    const listening = parseListeningPorts(listeningSection, fwdParsed.rules, fwdParsed.defaultPolicies.incoming, true, serverSshPort);
    return {
      backend: 'firewalld',
      status: 'active',
      serviceName: firewalldProvider.serviceName,
      installed: true,
      enabled: fwdParsed.enabled,
      active: true,
      defaultPolicies: fwdParsed.defaultPolicies,
      rulesCount: fwdParsed.rules.length,
      rules: fwdParsed.rules,
      capabilities: firewalldProvider.capabilities,
      activeZone: fwdParsed.activeZone,
      rawStatusOutput: out,
      listeningPortsSummary: listening,
      ...checkIsAnyPortOpen(fwdParsed.rules, fwdParsed.defaultPolicies, true),
    };
  }

  // 3. Check nftables
  const nftParsed = nftablesProvider.parseStatus(nftablesSection || out);
  if (nftParsed.active) {
    const listening = parseListeningPorts(listeningSection, nftParsed.rules, nftParsed.defaultPolicies.incoming, true, serverSshPort);
    return {
      backend: 'nftables',
      status: 'active',
      serviceName: nftablesProvider.serviceName,
      installed: true,
      enabled: nftParsed.enabled,
      active: true,
      defaultPolicies: nftParsed.defaultPolicies,
      rulesCount: nftParsed.rules.length,
      rules: nftParsed.rules,
      capabilities: nftablesProvider.capabilities,
      rawStatusOutput: out,
      listeningPortsSummary: listening,
      ...checkIsAnyPortOpen(nftParsed.rules, nftParsed.defaultPolicies, true),
    };
  }

  // 4. Check iptables
  const iptParsed = iptablesProvider.parseStatus(iptablesSection || out);
  if (iptParsed.active) {
    const listening = parseListeningPorts(listeningSection, iptParsed.rules, iptParsed.defaultPolicies.incoming, true, serverSshPort);
    return {
      backend: 'iptables',
      status: 'active',
      serviceName: iptablesProvider.serviceName,
      installed: true,
      enabled: iptParsed.enabled,
      active: true,
      defaultPolicies: iptParsed.defaultPolicies,
      rulesCount: iptParsed.rules.length,
      rules: iptParsed.rules,
      capabilities: iptablesProvider.capabilities,
      rawStatusOutput: out,
      listeningPortsSummary: listening,
      ...checkIsAnyPortOpen(iptParsed.rules, iptParsed.defaultPolicies, true),
    };
  }

  // 5. If none active, check if any is installed (e.g. UFW installed on Ubuntu, firewalld installed on RHEL)
  if (ufwParsed.installed) {
    return {
      backend: 'ufw',
      status: ufwParsed.status,
      serviceName: ufwProvider.serviceName,
      installed: true,
      enabled: false,
      active: false,
      defaultPolicies: ufwParsed.defaultPolicies,
      rulesCount: ufwParsed.rules.length,
      rules: ufwParsed.rules,
      capabilities: ufwProvider.capabilities,
      rawStatusOutput: out,
      listeningPortsSummary: parseListeningPorts(listeningSection, ufwParsed.rules, 'ALLOW', false, serverSshPort),
      ...checkIsAnyPortOpen(ufwParsed.rules, ufwParsed.defaultPolicies, false),
    };
  }

  if (fwdParsed.installed) {
    return {
      backend: 'firewalld',
      status: fwdParsed.status,
      serviceName: firewalldProvider.serviceName,
      installed: true,
      enabled: false,
      active: false,
      defaultPolicies: fwdParsed.defaultPolicies,
      rulesCount: fwdParsed.rules.length,
      rules: fwdParsed.rules,
      capabilities: firewalldProvider.capabilities,
      rawStatusOutput: out,
      listeningPortsSummary: parseListeningPorts(listeningSection, fwdParsed.rules, 'ALLOW', false, serverSshPort),
      ...checkIsAnyPortOpen(fwdParsed.rules, fwdParsed.defaultPolicies, false),
    };
  }

  // 6. No firewall detected
  return {
    backend: 'none',
    status: 'not_installed',
    serviceName: 'none',
    installed: false,
    enabled: false,
    active: false,
    defaultPolicies: {
      incoming: 'ALLOW (Open)',
      outgoing: 'ALLOW (Open)',
      forward: 'ALLOW',
    },
    rulesCount: 0,
    rules: [],
    capabilities: noFwProvider.capabilities,
    rawStatusOutput: out,
    listeningPortsSummary: parseListeningPorts(listeningSection, [], 'ALLOW', false, serverSshPort),
    isAnyPortOpen: true,
    anyPortOpenReason: 'No firewall is active or installed on this system (all ports open).',
  };
}

/**
 * Get the appropriate provider instance for a backend
 */
export function getFirewallProvider(backend: LinuxFirewallBackend): FirewallProvider {
  switch (backend) {
    case 'ufw':
      return new UfwFirewallProvider();
    case 'firewalld':
      return new FirewalldProvider();
    case 'nftables':
      return new NftablesFirewallProvider();
    case 'iptables':
      return new IptablesFirewallProvider();
    default:
      return new NoFirewallProvider();
  }
}

/**
 * Add a firewall rule to the remote server using the detected provider
 */
export async function addFirewallRule(
  server: RemoteServer,
  rule: LinuxFirewallRulePayload,
  backend: LinuxFirewallBackend,
  activeZone?: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; info?: LinuxFirewallInfo; error?: string }> {
  // Input Validation
  if (rule.port && !/^[0-9,:-]+$/.test(rule.port.trim())) {
    return { success: false, message: 'Invalid port specification', error: 'Port must be numeric or a range (e.g. 80, 80,443, 1000-2000)' };
  }

  if (rule.source && rule.source.trim().toLowerCase() !== 'any') {
    const cleanSrc = rule.source.trim();
    if (!/^[0-9a-fA-F.:/]+$/.test(cleanSrc)) {
      return { success: false, message: 'Invalid source address', error: 'Source must be "Any" or a valid IP/CIDR (e.g. 192.168.1.0/24)' };
    }
  }

  const provider = getFirewallProvider(backend);
  if (provider.backend === 'none') {
    return { success: false, message: 'No active firewall daemon', error: 'No active firewall backend is available to add rules to' };
  }

  const cmd = provider.buildAddRuleCommand(rule, activeZone);
  const out = await runAdaptiveSshCommand(server, cmd, ephemeralPassword);

  // Check if command succeeded
  const lower = out.toLowerCase();
  if (lower.includes('error') || lower.includes('invalid') || lower.includes('failed') || lower.includes('command not found')) {
    return {
      success: false,
      message: 'Firewall command failed',
      error: out.trim() || 'Command returned an error state',
    };
  }

  // Re-detect live state to verify new rule
  const updatedInfo = await detectLinuxFirewall(server, ephemeralPassword);

  return {
    success: true,
    message: `Rule successfully applied to ${provider.displayName}`,
    info: updatedInfo,
  };
}

/**
 * Delete a firewall rule from the remote server
 */
export async function deleteFirewallRule(
  server: RemoteServer,
  rule: LinuxFirewallRule,
  activeZone?: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; info?: LinuxFirewallInfo; error?: string }> {
  const provider = getFirewallProvider(rule.backend);
  if (provider.backend === 'none') {
    return { success: false, message: 'No active firewall daemon', error: 'No active firewall backend is available' };
  }

  const cmd = provider.buildDeleteRuleCommand(rule, activeZone);
  const out = await runAdaptiveSshCommand(server, cmd, ephemeralPassword);

  const lower = out.toLowerCase();
  if (lower.includes('error') && !lower.includes('0 errors') && !lower.includes('error: rule does not exist')) {
    return {
      success: false,
      message: 'Failed to delete rule',
      error: out.trim(),
    };
  }

  // Re-detect live state to verify rule deletion
  const updatedInfo = await detectLinuxFirewall(server, ephemeralPassword);

  return {
    success: true,
    message: `Rule deleted from ${provider.displayName}`,
    info: updatedInfo,
  };
}

