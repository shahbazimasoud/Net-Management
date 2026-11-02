/**
 * ciscoPortOperationHelper.ts
 *
 * Dedicated helper to generate 100% compliant Cisco IOS & MikroTik RouterOS CLI commands
 * for all port operations and parse live hardware port security responses.
 *
 * Designed to work seamlessly with DeviceSessionPool (persistent interactive SSH session pool)
 * so that all port modal actions (port security, MAC clearing, VLAN updates, shutdowns, queries)
 * execute over the active persistent SSH session without spawning new connections.
 */

export interface ParsedPortSecurityResult {
  port_id: string;
  name: string;
  status: 'up' | 'down';
  admin_status: 'enabled' | 'disabled';
  mode: 'access' | 'trunk';
  vlan: number;
  port_security_enabled: boolean;
  port_security_status: string;
  port_security_mode: 'sticky' | 'configured' | 'dynamic';
  port_security_max_mac: number;
  port_security_violation: string;
  port_security_configured_mac: string;
  port_security_sticky_mac?: string;
  port_security_learned_macs: string[];
  learned_macs: string[];
  connected_mac?: string;
}

/**
 * Standardizes MAC address into standard Cisco dotted hexadecimal notation (xxxx.xxxx.xxxx)
 */
export function formatToCiscoMac(rawMac: string): string {
  if (!rawMac) return '';
  const cleanHex = rawMac.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (cleanHex.length === 12) {
    return `${cleanHex.slice(0, 4)}.${cleanHex.slice(4, 8)}.${cleanHex.slice(8, 12)}`;
  }
  return rawMac.trim();
}

/**
 * Generates authoritative CLI commands for device port operations
 */
export function generatePortOperationCli(
  platform: string,
  op: string,
  iface: string,
  params: any = {}
): string {
  const normPlatform = (platform || '').toLowerCase();
  const isCisco = normPlatform.includes('cisco') || normPlatform.includes('catalyst') || normPlatform.includes('ios');
  const action = op.toLowerCase().trim();

  if (isCisco) {
    // -------------------------------------------------------------
    // CISCO IOS / XE PORT ACTIONS
    // -------------------------------------------------------------
    if (action === 'shutdown' || action === 'disable_interface') {
      return `configure terminal\ninterface ${iface}\n shutdown\nend\nwrite memory`;
    }

    if (action === 'no_shutdown' || action === 'enable_interface') {
      return `configure terminal\ninterface ${iface}\n no shutdown\nend\nwrite memory`;
    }

    if (action === 'mode_trunk') {
      return `configure terminal\ninterface ${iface}\n switchport trunk encapsulation dot1q\n switchport mode trunk\nend\nwrite memory`;
    }

    if (action === 'mode_access' || action === 'set_vlan' || action === 'change_vlan' || action === 'assign_vlan') {
      const vlan = Number(params.vlan || 1);
      return `configure terminal\ninterface ${iface}\n switchport mode access\n switchport access vlan ${vlan}\nend\nwrite memory`;
    }

    if (action === 'set_description' || action === 'description') {
      const desc = String(params.description || '').trim();
      if (desc) {
        return `configure terminal\ninterface ${iface}\n description ${desc}\nend\nwrite memory`;
      } else {
        return `configure terminal\ninterface ${iface}\n no description\nend\nwrite memory`;
      }
    }

    // 1. Clear individual learned MAC
    if (action === 'port_sec_clear_mac') {
      const rawMac = String(params.mac || '').trim();
      const formattedMac = formatToCiscoMac(rawMac);
      const cmds: string[] = ['configure terminal', `interface ${iface}`];
      if (formattedMac) {
        cmds.push(` no switchport port-security mac-address ${formattedMac}`);
      }
      cmds.push('exit');
      if (formattedMac) {
        cmds.push(`clear port-security dynamic address ${formattedMac}`);
      }
      cmds.push('end');
      cmds.push('write memory');
      return cmds.join('\n');
    }

    // 2. Clear all learned MACs
    if (action === 'port_sec_clear_all_macs') {
      return [
        `clear port-security dynamic interface ${iface}`,
        'configure terminal',
        `interface ${iface}`,
        ' no switchport port-security mac-address sticky',
        ' switchport port-security mac-address sticky',
        'end',
        'write memory',
      ].join('\n');
    }

    // 3. Recover from err-disabled status
    if (action === 'port_sec_recover_errdisable') {
      return [
        'configure terminal',
        `interface ${iface}`,
        ' shutdown',
        ' no shutdown',
        'end',
        'write memory',
      ].join('\n');
    }

    // 4. Live query for interface port security & learned MACs
    if (action === 'port_sec_query') {
      return [
        'terminal length 0',
        `show port-security interface ${iface}`,
        `show port-security address interface ${iface}`,
        `show running-config interface ${iface}`,
        `show mac address-table interface ${iface}`,
        `show mac-address-table interface ${iface}`,
        'show port-security address',
        `show interfaces ${iface} status`,
      ].join('\n');
    }

    // 5. Update / Apply Port Security Configuration
    if (action === 'port_sec_update' || action === 'port_sec_enable' || action === 'enable_port_security' || action === 'port_sec_disable' || action === 'disable_port_security') {
      const enabled = action.includes('disable') ? false : Boolean(params.enabled !== undefined ? params.enabled : true);

      if (!enabled) {
        const cmds: string[] = [
          `clear port-security dynamic interface ${iface}`,
          'configure terminal',
          `interface ${iface}`,
          ' no switchport port-security mac-address sticky',
        ];

        const allMacs = new Set<string>();
        for (const k of ['configured_mac', 'previous_mac', 'mac']) {
          const v = String(params[k] || '').trim();
          if (v) allMacs.add(v);
        }
        if (Array.isArray(params.mac_list)) {
          for (const m of params.mac_list) {
            if (m && typeof m === 'string') allMacs.add(m.trim());
          }
        }
        for (const m of allMacs) {
          const fmt = formatToCiscoMac(m);
          if (fmt) cmds.push(` no switchport port-security mac-address ${fmt}`);
        }
        cmds.push(' no switchport port-security');
        cmds.push('end');
        cmds.push('write memory');
        return cmds.join('\n');
      }

      // Enabled configuration
      const maxMac = Number(params.max_mac || params.maxMac || 1);
      const violation = String(params.violation || 'shutdown').toLowerCase();
      const mode = String(params.mode || 'sticky').toLowerCase();
      const rawMac = String(params.configured_mac || params.configuredMac || '').trim();
      const formattedMac = formatToCiscoMac(rawMac);

      const rawPrevMac = String(params.previous_mac || params.previousMac || '').trim();
      const formattedPrevMac = formatToCiscoMac(rawPrevMac);

      const cmds: string[] = [
        'configure terminal',
        `interface ${iface}`,
        ' switchport',
        ' switchport mode access',
      ];

      const vlanNum = Number(params.vlan);
      if (vlanNum > 0) {
        cmds.push(` switchport access vlan ${vlanNum}`);
      }

      cmds.push(' switchport port-security');
      cmds.push(` switchport port-security maximum ${maxMac}`);
      cmds.push(` switchport port-security violation ${violation}`);

      if (formattedPrevMac && formattedPrevMac !== formattedMac) {
        cmds.push(` no switchport port-security mac-address ${formattedPrevMac}`);
      }

      if (mode === 'sticky') {
        cmds.push(' switchport port-security mac-address sticky');
        if (formattedMac) {
          cmds.push(` switchport port-security mac-address sticky ${formattedMac}`);
        }
      } else if (mode === 'configured') {
        cmds.push(' no switchport port-security mac-address sticky');
        if (formattedMac) {
          cmds.push(` switchport port-security mac-address ${formattedMac}`);
        }
      } else if (mode === 'dynamic') {
        cmds.push(' no switchport port-security mac-address sticky');
      }

      cmds.push('end');
      cmds.push('write memory');
      return cmds.join('\n');
    }

    if (action === 'save_config' || action === 'write_memory' || action === 'write-memory') {
      return 'write memory';
    }

    return `configure terminal\ninterface ${iface}\nend\nwrite memory`;
  } else {
    // -------------------------------------------------------------
    // MIKROTIK ROUTEROS ACTIONS
    // -------------------------------------------------------------
    if (action === 'shutdown' || action === 'disable_interface') {
      return `/interface set [find name="${iface}"] disabled=yes`;
    }

    if (action === 'no_shutdown' || action === 'enable_interface') {
      return `/interface set [find name="${iface}"] disabled=no`;
    }

    if (action === 'set_description' || action === 'description') {
      const desc = String(params.description || '').trim();
      return `/interface set [find name="${iface}"] comment="${desc}"`;
    }

    if (action === 'set_vlan' || action === 'change_vlan' || action === 'assign_vlan') {
      const vlan = Number(params.vlan || 1);
      return `/interface bridge port set [find interface="${iface}"] pvid=${vlan}`;
    }

    if (action === 'mode_trunk') {
      return `/interface bridge port set [find interface="${iface}"] frame-types=admit-only-vlan-tagged`;
    }

    if (action === 'save_config' || action === 'write_memory' || action === 'write-memory') {
      return '/system backup save name=autobackup';
    }

    return `/interface print detail where name="${iface}"`;
  }
}

/**
 * Parses raw Cisco CLI outputs into authentic PortSecurity structured state
 */
export function parseCiscoPortSecurityOutput(iface: string, output: string): ParsedPortSecurityResult {
  const normIface = iface.trim();
  const lines = output.split(/\r?\n/);

  let enabled = false;
  let statusRaw = 'disabled';
  let violation = 'shutdown';
  let maxMac = 1;
  let mode: 'sticky' | 'configured' | 'dynamic' = 'sticky';
  let configuredMac = '';
  let stickyMac = '';
  const learnedMacs = new Set<string>();
  let linkStatus: 'up' | 'down' = 'up';
  let adminStatus: 'enabled' | 'disabled' = 'enabled';
  let vlan = 1;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check Port Security enablement
    if (/Port\s+Security\s*:\s*Enabled/i.test(trimmed)) {
      enabled = true;
    } else if (/Port\s+Security\s*:\s*Disabled/i.test(trimmed)) {
      enabled = false;
    }

    // Check Port Status
    const statusMatch = trimmed.match(/Port\s+Status\s*:\s*([A-Za-z0-9\-]+)/i);
    if (statusMatch) {
      statusRaw = statusMatch[1].toLowerCase();
      if (statusRaw.includes('secure-up')) {
        linkStatus = 'up';
      } else if (statusRaw.includes('secure-down') || statusRaw.includes('secure-shutdown')) {
        linkStatus = 'down';
      }
    }

    // Violation Mode
    const violMatch = trimmed.match(/Violation\s+Mode\s*:\s*([A-Za-z]+)/i);
    if (violMatch) {
      violation = violMatch[1].toLowerCase();
    }

    // Maximum MAC Addresses
    const maxMatch = trimmed.match(/Maximum\s+MAC\s+Addresses\s*:\s*(\d+)/i);
    if (maxMatch) {
      maxMac = parseInt(maxMatch[1], 10) || 1;
    }

    // Check Running Config lines for interface
    if (/^\s*switchport\s+port-security\b/i.test(trimmed)) {
      enabled = true;
    }
    if (/switchport\s+port-security\s+mac-address\s+sticky\b/i.test(trimmed)) {
      mode = 'sticky';
      const stickyMatch = trimmed.match(/switchport\s+port-security\s+mac-address\s+sticky\s+([0-9a-fA-F\.]+)/i);
      if (stickyMatch) {
        stickyMac = stickyMatch[1].toLowerCase();
        configuredMac = stickyMac;
        learnedMacs.add(stickyMac);
      }
    } else if (/switchport\s+port-security\s+mac-address\s+([0-9a-fA-F\.]+)/i.test(trimmed)) {
      mode = 'configured';
      const cfgMatch = trimmed.match(/switchport\s+port-security\s+mac-address\s+([0-9a-fA-F\.]+)/i);
      if (cfgMatch) {
        configuredMac = cfgMatch[1].toLowerCase();
        learnedMacs.add(configuredMac);
      }
    }

    // Check Access VLAN in running config
    const vlanMatch = trimmed.match(/switchport\s+access\s+vlan\s+(\d+)/i);
    if (vlanMatch) {
      vlan = parseInt(vlanMatch[1], 10) || 1;
    }

    // Check shutdown in running config
    if (/^\s*shutdown\b/i.test(trimmed)) {
      adminStatus = 'disabled';
      linkStatus = 'down';
    }

    // Extract MACs from 'show port-security address' table
    // Example: 10   0050.56a1.03fe    SecureSticky            Gi1/0/3      -
    const tableMacMatch = trimmed.match(/\b([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4})\s+(Secure[A-Za-z]+|Sticky|Configured|Dynamic)\b/i);
    if (tableMacMatch) {
      const mac = tableMacMatch[1].toLowerCase();
      const type = tableMacMatch[2].toLowerCase();
      learnedMacs.add(mac);
      if (type.includes('sticky')) {
        mode = 'sticky';
        stickyMac = mac;
        configuredMac = mac;
      } else if (type.includes('configured')) {
        mode = 'configured';
        configuredMac = mac;
      }
    }

    // General MAC extraction from table lines matching this interface
    const generalMac = trimmed.match(/\b([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4})\b/i);
    if (generalMac && !trimmed.toLowerCase().includes('ffff.ffff.ffff') && !trimmed.toLowerCase().includes('0100.5e')) {
      learnedMacs.add(generalMac[1].toLowerCase());
    }

    // Check interfaces status line
    if (trimmed.toLowerCase().startsWith(normIface.toLowerCase())) {
      if (trimmed.includes('connected')) {
        linkStatus = 'up';
        adminStatus = 'enabled';
      } else if (trimmed.includes('disabled')) {
        adminStatus = 'disabled';
        linkStatus = 'down';
      } else if (trimmed.includes('err-disabled')) {
        adminStatus = 'disabled';
        linkStatus = 'down';
        statusRaw = 'err-disabled';
      }
    }
  }

  const learnedList = Array.from(learnedMacs);

  return {
    port_id: normIface,
    name: normIface,
    status: linkStatus,
    admin_status: adminStatus,
    mode: 'access',
    vlan,
    port_security_enabled: enabled,
    port_security_status: enabled ? (statusRaw !== 'disabled' ? statusRaw : 'secure-up') : 'disabled',
    port_security_mode: mode,
    port_security_max_mac: maxMac,
    port_security_violation: violation,
    port_security_configured_mac: configuredMac || stickyMac,
    port_security_sticky_mac: stickyMac,
    port_security_learned_macs: learnedList,
    learned_macs: learnedList,
    connected_mac: configuredMac || learnedList[0] || '',
  };
}
