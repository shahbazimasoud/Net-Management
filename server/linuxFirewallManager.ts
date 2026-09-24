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
    const lines = rawOutput.split('\n');
    let installed = rawOutput.includes('---UFW_NUM---') || rawOutput.toLowerCase().includes('status:');
    let active = false;
    let enabled = false;
    let status: LinuxFirewallStatus = 'not_installed';
    const defaultPolicies: LinuxFirewallPolicies = {
      incoming: 'DENY',
      outgoing: 'ALLOW',
      forward: 'DROP',
    };
    const rules: LinuxFirewallRule[] = [];

    // Parse status line
    for (const line of lines) {
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

      // Default: deny (incoming), allow (outgoing), disabled (routed)
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

    // Parse numbered rules section:
    // [ 1] 22/tcp                     ALLOW IN    Anywhere
    // [ 2] 80/tcp                     ALLOW IN    Anywhere                  # HTTP Web Server
    // [ 3] 22/tcp (v6)                ALLOW IN    Anywhere (v6)
    let inNumberedSection = false;
    for (const line of lines) {
      if (line.includes('---UFW_NUM---')) {
        inNumberedSection = true;
        continue;
      }
      if (!inNumberedSection) continue;

      const numMatch = line.match(/^\s*\[\s*(\d+)\]\s+(.*?)\s+(ALLOW|DENY|REJECT|LIMIT)\s+(IN|OUT|FWD|FORWARD)?\s*(.*?)(?:#(.*))?$/i);
      if (numMatch) {
        const ruleNumber = parseInt(numMatch[1], 10);
        const toPart = numMatch[2].trim();
        const action = numMatch[3].toUpperCase() as any;
        const direction = (numMatch[4] || 'IN').toUpperCase() as any;
        const fromPart = numMatch[5].trim();
        const comment = numMatch[6]?.trim();

        // Extract port & proto
        let port: string | undefined = undefined;
        let protocol: any = 'any';
        let ipVersion: 'v4' | 'v6' | 'both' = 'v4';

        if (toPart.includes('(v6)') || fromPart.includes('(v6)')) {
          ipVersion = 'v6';
        }

        const protoMatch = toPart.match(/^([0-9,:-]+)\/([a-z]+)/i);
        if (protoMatch) {
          port = protoMatch[1];
          protocol = protoMatch[2].toLowerCase() as any;
        } else {
          // Port name or any
          const cleanTo = toPart.replace(/\(v6\)/g, '').trim();
          if (/^\d+$/.test(cleanTo)) {
            port = cleanTo;
            protocol = 'tcp';
          } else if (cleanTo.length > 0 && cleanTo !== 'anywhere') {
            port = cleanTo;
          }
        }

        const source = fromPart.replace(/\(v6\)/g, '').trim() || 'Any';

        rules.push({
          id: `ufw-${ruleNumber}`,
          ruleNumber,
          backend: 'ufw',
          action,
          direction: direction === 'FWD' ? 'FORWARD' : direction,
          protocol,
          port,
          source,
          ipVersion,
          enabled: true,
          comment,
          rawRule: line.trim(),
        });
      }
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
    // sudo ufw [allow|deny|reject|limit] [in|out] [proto <tcp|udp>] from <source> to any port <port> comment '...'
    const action = (rule.action || 'allow').toLowerCase();
    const dir = rule.direction === 'OUT' ? 'out' : 'in';
    const proto = rule.protocol && rule.protocol !== 'any' && rule.protocol !== 'all' ? ` proto ${rule.protocol}` : '';
    const src = rule.source && rule.source.trim().toLowerCase() !== 'any' ? ` from ${rule.source.trim()}` : '';
    const port = rule.port ? ` to any port ${rule.port.trim()}` : '';
    const comment = rule.comment ? ` comment '${rule.comment.replace(/'/g, '')}'` : '';
    const iface = rule.interface && rule.interface !== 'any' ? ` on ${rule.interface}` : '';

    return `sudo ufw ${action} ${dir}${iface}${proto}${src}${port}${comment}`;
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
    const lines = rawOutput.split('\n');
    let installed = rawOutput.includes('===FIREWALLD_STATUS===') || rawOutput.includes('firewall-cmd');
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

    let isSection = false;
    for (const line of lines) {
      if (line.includes('===FIREWALLD_STATUS===')) {
        isSection = true;
        continue;
      }
      if (isSection && line.startsWith('===')) {
        isSection = false;
      }
      if (isSection) {
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
    }

    if (!active && rawOutput.includes('firewalld.service') && rawOutput.includes('active')) {
      active = true;
      enabled = true;
      status = 'active';
    }

    // Parse list-all output
    // public (active)
    //   target: default
    //   services: cockpit dhcpv6-client ssh
    //   ports: 80/tcp 443/tcp 2222/tcp
    //   sources: 192.168.1.0/24
    let currentZone = 'public';
    let ruleIndex = 1;

    for (const line of lines) {
      const zoneHeaderMatch = line.match(/^([a-zA-Z0-9_-]+)\s*(?:\(active\))?/);
      if (zoneHeaderMatch && !line.includes(':') && !line.startsWith(' ') && !line.startsWith('---')) {
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

      // Services: ssh http https
      if (trimmed.startsWith('services:')) {
        const srvs = trimmed.replace('services:', '').trim().split(/\s+/).filter(Boolean);
        for (const s of srvs) {
          rules.push({
            id: `firewalld-svc-${s}`,
            ruleNumber: ruleIndex++,
            backend: 'firewalld',
            action: 'ALLOW',
            direction: 'IN',
            protocol: 'tcp',
            port: s === 'ssh' ? '22' : s === 'http' ? '80' : s === 'https' ? '443' : s,
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
    const isInstalled = rawOutput.includes('===NFTABLES_STATUS===') || rawOutput.includes('nft list');
    const isActive = rawOutput.includes('table ') || (rawOutput.includes('nftables.service') && rawOutput.includes('active'));
    const defaultPolicies: LinuxFirewallPolicies = {
      incoming: 'DROP',
      outgoing: 'ALLOW',
      forward: 'DROP',
    };
    const rules: LinuxFirewallRule[] = [];

    let ruleIndex = 1;
    const lines = rawOutput.split('\n');
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

        rules.push({
          id: `nft-${ruleIndex}`,
          ruleNumber: ruleIndex++,
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
    const proto = rule.protocol || 'tcp';
    const port = rule.port || '22';
    const action = (rule.action || 'allow').toLowerCase() === 'allow' ? 'accept' : 'drop';
    const comment = rule.comment ? ` comment "${rule.comment.replace(/"/g, '')}"` : '';

    return `sudo nft add rule inet filter input ${proto} dport ${port} ${action}${comment}`;
  }

  buildDeleteRuleCommand(rule: LinuxFirewallRule): string {
    return 'sudo nft -a list table inet filter 2>/dev/null || true';
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
    const isInstalled = rawOutput.includes('===IPTABLES_STATUS===') || rawOutput.includes('iptables');
    let hasRules = false;
    const defaultPolicies: LinuxFirewallPolicies = {
      incoming: 'ACCEPT',
      outgoing: 'ACCEPT',
      forward: 'DROP',
    };
    const rules: LinuxFirewallRule[] = [];

    const lines = rawOutput.split('\n');
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
        const portMatch = trimmed.match(/--dport\s+([0-9,:-]+)/);
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
    const port = rule.port ? `--dport ${rule.port}` : '';
    const src = rule.source && rule.source.toLowerCase() !== 'any' ? `-s ${rule.source}` : '';
    const action = (rule.action || 'allow').toUpperCase() === 'ALLOW' ? 'ACCEPT' : 'DROP';
    const comment = rule.comment ? `-m comment --comment "${rule.comment.replace(/"/g, '')}"` : '';

    return `sudo iptables -I INPUT 1 -p ${proto} ${port} ${src} ${comment} -j ${action}`;
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
  sudo -n ufw status verbose 2>/dev/null || ufw status verbose 2>/dev/null || true
  echo "---UFW_NUM---"
  sudo -n ufw status numbered 2>/dev/null || ufw status numbered 2>/dev/null || true
fi

echo "===FIREWALLD_STATUS==="
if command -v firewall-cmd >/dev/null 2>&1; then
  sudo -n firewall-cmd --state 2>/dev/null || true
  echo "---FIREWALLD_ALL---"
  sudo -n firewall-cmd --list-all 2>/dev/null || true
  echo "---FIREWALLD_RICH---"
  sudo -n firewall-cmd --list-rich-rules 2>/dev/null || true
fi

echo "===NFTABLES_STATUS==="
if command -v nft >/dev/null 2>&1; then
  sudo -n nft list ruleset 2>/dev/null || true
fi

echo "===IPTABLES_STATUS==="
if command -v iptables >/dev/null 2>&1; then
  sudo -n iptables -S 2>/dev/null || sudo -n iptables -L -n -v 2>/dev/null || true
fi

echo "===LISTENING_PORTS==="
ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null || true
`;

// Helper: Parse Listening Ports from ss -tulpn / netstat -tulpn
function parseListeningPorts(output: string, rules: LinuxFirewallRule[], incomingPolicy: string): LinuxListeningPortSummary[] {
  const summaries: LinuxListeningPortSummary[] = [];
  const lines = output.split('\n');
  const seen = new Set<string>();

  for (const line of lines) {
    // ss format: tcp LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=1234,fd=3))
    const m = line.match(/(tcp|udp)\s+[A-Z_0-9-]+\s+[0-9]+\s+[0-9]+\s+([0-9a-zA-Z.:*]+):([0-9]+)\s+.*?users:\(\("([^"]+)",pid=([0-9]+)/i);
    if (m) {
      const proto = m[1].toLowerCase();
      const addr = m[2];
      const port = parseInt(m[3], 10);
      const proc = m[4];
      const pid = parseInt(m[5], 10);

      const key = `${proto}:${port}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Check if allowed
      let isAllowed = incomingPolicy === 'ALLOW';
      // Look for matching rule
      for (const r of rules) {
        if (r.action === 'ALLOW' && (r.protocol === proto || r.protocol === 'any' || r.protocol === 'all')) {
          if (r.port === String(port) || (r.port && r.port.includes(',') && r.port.split(',').includes(String(port)))) {
            isAllowed = true;
            break;
          }
        } else if ((r.action === 'DENY' || r.action === 'REJECT') && (r.protocol === proto || r.protocol === 'any')) {
          if (r.port === String(port)) {
            isAllowed = false;
            break;
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
      });
    }
  }

  return summaries;
}

/**
 * Main Detection Entry Point
 */
export async function detectLinuxFirewall(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<LinuxFirewallInfo> {
  const out = (await runAdaptiveSshCommand(server, FIREWALL_DETECTION_SCRIPT, ephemeralPassword)) || '';

  // Instantiate providers
  const ufwProvider = new UfwFirewallProvider();
  const firewalldProvider = new FirewalldProvider();
  const nftablesProvider = new NftablesFirewallProvider();
  const iptablesProvider = new IptablesFirewallProvider();
  const noFwProvider = new NoFirewallProvider();

  // Evaluate which provider is active
  // 1. Check UFW
  const ufwParsed = ufwProvider.parseStatus(out);
  if (ufwParsed.active) {
    const listening = parseListeningPorts(out, ufwParsed.rules, ufwParsed.defaultPolicies.incoming);
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
    };
  }

  // 2. Check firewalld
  const fwdParsed = firewalldProvider.parseStatus(out);
  if (fwdParsed.active) {
    const listening = parseListeningPorts(out, fwdParsed.rules, fwdParsed.defaultPolicies.incoming);
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
    };
  }

  // 3. Check nftables
  const nftParsed = nftablesProvider.parseStatus(out);
  if (nftParsed.active) {
    const listening = parseListeningPorts(out, nftParsed.rules, nftParsed.defaultPolicies.incoming);
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
    };
  }

  // 4. Check iptables
  const iptParsed = iptablesProvider.parseStatus(out);
  if (iptParsed.active) {
    const listening = parseListeningPorts(out, iptParsed.rules, iptParsed.defaultPolicies.incoming);
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
      rulesCount: 0,
      rules: [],
      capabilities: ufwProvider.capabilities,
      rawStatusOutput: out,
      listeningPortsSummary: parseListeningPorts(out, [], 'ALLOW'),
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
      rulesCount: 0,
      rules: [],
      capabilities: firewalldProvider.capabilities,
      rawStatusOutput: out,
      listeningPortsSummary: parseListeningPorts(out, [], 'ALLOW'),
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
    listeningPortsSummary: parseListeningPorts(out, [], 'ALLOW'),
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
