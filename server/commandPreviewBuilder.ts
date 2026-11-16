import { Request } from 'express';
import { formatToCiscoMac, generatePortOperationCli } from './ciscoPortOperationHelper';

export interface CommandPreviewContext {
  device?: any;
  server?: any;
  action?: string | null;
  extraSummary?: string;
}

const SENSITIVE_KEY_RE =
  /(password|passwd|secret|token|private_key|privatekey|ssh_key|passphrase|api_key|apikey|credential|authorization)/i;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key);
}

export function sanitizeValueForPreview(key: string, value: any): any {
  if (isSensitiveKey(key)) return '***';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) =>
      item && typeof item === 'object' ? sanitizeObjectForPreview(item) : item
    );
  }
  if (typeof value === 'object') {
    return sanitizeObjectForPreview(value);
  }
  return value;
}

export function sanitizeObjectForPreview(obj: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === '_httpExecution' || k === 'approvalRequestId') continue;
    if (v === undefined || v === '') continue;
    sanitized[k] = sanitizeValueForPreview(k, v);
  }
  return sanitized;
}

function resolveDevicePlatformForPreview(device: any, ifaceHint?: string): string {
  const raw = String(device?.platform || '').trim().toLowerCase();
  const model = String(device?.model || '').trim().toLowerCase();
  const ifaceLower = String(ifaceHint || '').trim().toLowerCase();

  if (
    raw.includes('mikrotik') ||
    raw.includes('routeros') ||
    model.includes('mikrotik') ||
    model.includes('routerboard') ||
    model.includes('ccr') ||
    model.includes('crs')
  ) {
    return 'mikrotik_routeros';
  }
  if (raw.includes('cisco') || raw.includes('catalyst') || raw.includes('ios') || raw.includes('nxos')) {
    return raw;
  }
  if (
    ifaceLower.startsWith('ether') ||
    ifaceLower.startsWith('wlan') ||
    ifaceLower.startsWith('sfp-sfpplus') ||
    ifaceLower.startsWith('bridge')
  ) {
    return 'mikrotik_routeros';
  }
  return raw || 'cisco_ios_xe';
}

function buildDirectPortUpdateCli(platform: string, iface: string, updates: Record<string, any>): string {
  const isCisco =
    platform.toLowerCase().includes('cisco') ||
    platform.toLowerCase().includes('catalyst') ||
    platform.toLowerCase().includes('ios');

  if (isCisco) {
    const lines: string[] = ['configure terminal', `interface ${iface}`];
    let hasCommands = false;

    if ('admin_status' in updates) {
      hasCommands = true;
      lines.push(updates.admin_status === 'disabled' ? ' shutdown' : ' no shutdown');
    }
    if ('mode' in updates) {
      hasCommands = true;
      if (updates.mode === 'trunk') {
        lines.push(' switchport trunk encapsulation dot1q');
        lines.push(' switchport mode trunk');
      } else {
        lines.push(' switchport mode access');
      }
    }
    if ('vlan' in updates && updates.vlan !== undefined && updates.vlan !== '') {
      hasCommands = true;
      const vlanId = Number(updates.vlan || 1);
      if (updates.mode !== 'trunk') {
        lines.push(' switchport mode access');
      }
      lines.push(` switchport access vlan ${vlanId}`);
    }
    if ('allowed_vlans' in updates && updates.allowed_vlans) {
      hasCommands = true;
      lines.push(` switchport trunk allowed vlan ${String(updates.allowed_vlans).trim()}`);
    }
    if ('description' in updates) {
      hasCommands = true;
      const desc = String(updates.description || '').trim();
      lines.push(desc ? ` description ${desc}` : ' no description');
    }
    if ('speed' in updates && updates.speed) {
      hasCommands = true;
      lines.push(` speed ${updates.speed}`);
    }
    if ('duplex' in updates && updates.duplex) {
      hasCommands = true;
      lines.push(` duplex ${updates.duplex}`);
    }
    if ('port_security_enabled' in updates) {
      hasCommands = true;
      const rawMac = String(updates.port_security_configured_mac || '').trim();
      const formattedMac = formatToCiscoMac(rawMac);
      if (updates.port_security_enabled) {
        const maxMac = Number(updates.port_security_max_mac || 1);
        const violation = String(updates.port_security_violation || 'shutdown').toLowerCase();
        const mode = String(updates.port_security_mode || 'sticky').toLowerCase();
        if (updates.mode !== 'trunk') {
          lines.push(' switchport');
          lines.push(' switchport mode access');
        }
        lines.push(' switchport port-security');
        lines.push(` switchport port-security maximum ${maxMac}`);
        lines.push(` switchport port-security violation ${violation}`);
        if (mode === 'configured') {
          lines.push(' no switchport port-security mac-address sticky');
          if (formattedMac) lines.push(` switchport port-security mac-address ${formattedMac}`);
        } else if (mode === 'sticky') {
          lines.push(' switchport port-security mac-address sticky');
          if (formattedMac) lines.push(` switchport port-security mac-address sticky ${formattedMac}`);
        } else if (mode === 'dynamic') {
          lines.push(' no switchport port-security mac-address sticky');
        }
      } else {
        lines.push(' no switchport port-security mac-address sticky');
        if (formattedMac) lines.push(` no switchport port-security mac-address ${formattedMac}`);
        lines.push(' no switchport port-security');
      }
    }

    if (!hasCommands) return '';
    lines.push('end', 'write memory');
    return lines.join('\n');
  }

  // MikroTik RouterOS
  const lines: string[] = [];
  if ('admin_status' in updates) {
    lines.push(
      `/interface set [find name="${iface}"] disabled=${updates.admin_status === 'disabled' ? 'yes' : 'no'}`
    );
  }
  if ('description' in updates) {
    lines.push(`/interface set [find name="${iface}"] comment="${String(updates.description || '').trim()}"`);
  }
  if ('vlan' in updates && updates.vlan !== undefined && updates.vlan !== '') {
    lines.push(`/interface bridge port set [find interface="${iface}"] pvid=${Number(updates.vlan || 1)}`);
  }
  if ('mode' in updates && updates.mode === 'trunk') {
    lines.push(`/interface bridge port set [find interface="${iface}"] frame-types=admit-only-vlan-tagged`);
  }
  return lines.join('\n');
}

function formatKeyValuesReadable(
  obj: Record<string, any>,
  indent = '  ',
  maxDepth = 2,
  depth = 0
): string[] {
  const lines: string[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key === '_httpExecution' || key === 'approvalRequestId') continue;
    if (val === undefined || val === null || val === '') continue;

    if (isSensitiveKey(key)) {
      lines.push(`${indent}${key}: ***`);
      continue;
    }

    if (Array.isArray(val)) {
      if (val.length === 0) continue;
      if (val.every((x) => typeof x !== 'object' || x === null)) {
        const joined = val.join(', ');
        lines.push(
          `${indent}${key}: ${joined.length > 220 ? `${val.length} item(s) [${joined.slice(0, 180)}...]` : joined}`
        );
      } else {
        lines.push(`${indent}${key}: ${val.length} record(s)`);
      }
      continue;
    }

    if (typeof val === 'object') {
      if (depth >= maxDepth) {
        const subKeys = Object.keys(val);
        lines.push(`${indent}${key}: (${subKeys.join(', ')})`);
      } else {
        const nested = formatKeyValuesReadable(val, `${indent}  `, maxDepth, depth + 1);
        if (nested.length > 0) {
          lines.push(`${indent}${key}:`);
          lines.push(...nested);
        }
      }
      continue;
    }

    const strVal = String(val);
    lines.push(`${indent}${key}: ${strVal.length > 260 ? `${strVal.slice(0, 260)}...` : strVal}`);
  }
  return lines;
}

function truncatePreview(text: string, maxLen = 1400): string {
  const clean = text.trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen)}\n... (truncated)`;
}

/**
 * Generates clean, human-readable CLI commands or structured operational summaries
 * for approval gate modals, audit logs, and approver queues — never raw HTTP/JSON dumps.
 */
export function buildSafeCommandPreview(
  req: Request,
  extraOrContext?: string | CommandPreviewContext
): string {
  const ctx: CommandPreviewContext =
    typeof extraOrContext === 'string'
      ? { extraSummary: extraOrContext }
      : extraOrContext || {};

  const method = (req.method || 'POST').toUpperCase();
  const rawUrl = req.originalUrl || req.url || '';
  const urlPath = rawUrl.split('?')[0].replace(/\/+$/, '');
  const lowerPath = urlPath.toLowerCase();
  const body: Record<string, any> =
    req.body && typeof req.body === 'object' ? req.body : {};

  // ---------------------------------------------------------------------------
  // 1. NETWORK EQUIPMENT OPERATIONS (/api/devices/...)
  // ---------------------------------------------------------------------------
  if (lowerPath.includes('/devices/') || lowerPath.includes('/network-equipment/') || lowerPath.endsWith('/devices')) {
    const devLabel = ctx.device?.name
      ? `${ctx.device.name}${ctx.device.ip ? ` (${ctx.device.ip})` : ''}`
      : ctx.device?.ip || ctx.device?.id || '';

    // 1a. Device port operation (/devices/:id/operations)
    if (lowerPath.endsWith('/operations')) {
      const op = String(body.operation || body.action || '').trim().toLowerCase();
      const params: Record<string, any> = {
        ...(body.params && typeof body.params === 'object' ? body.params : {}),
      };
      const iface = String(
        body.interface ||
          body.iface ||
          body.port_id ||
          body.port ||
          body.name ||
          params.interface ||
          params.iface ||
          params.port_id ||
          ''
      ).trim();

      const platform = resolveDevicePlatformForPreview(ctx.device, iface);
      const isCisco =
        platform.includes('cisco') || platform.includes('catalyst') || platform.includes('ios');

      if (op === 'ping' || op === 'keepalive') {
        const target = String(params.targetIp || params.ip || ctx.device?.ip || devLabel || 'target').trim();
        const count = params.count ? Number(params.count) : undefined;
        return isCisco
          ? `ping ${target}${count ? ` repeat ${count}` : ''}`
          : `/ping ${target}${count ? ` count=${count}` : ''}`;
      }

      if (iface || op) {
        const mergedParams = { ...body, ...params };
        const cli = generatePortOperationCli(platform, op || 'operation', iface || 'interface', mergedParams);
        if (cli && cli.trim()) {
          return truncatePreview(cli);
        }
      }
    }

    // 1b. Direct Single Port Config (PUT /devices/:id/ports/:portId)
    const singlePortMatch = urlPath.match(/\/devices\/[^/]+\/ports\/([^/]+)$/i);
    if (
      singlePortMatch &&
      !['sync', 'batch'].includes(singlePortMatch[1].toLowerCase())
    ) {
      const iface = decodeURIComponent(singlePortMatch[1]).trim() ||
        String(body.port_id || body.port || body.interface || body.name || 'interface').trim();
      const platform = resolveDevicePlatformForPreview(ctx.device, iface);
      const cli = buildDirectPortUpdateCli(platform, iface, body);
      if (cli) {
        return truncatePreview(cli);
      }
    }

    // 1c. Batch Port Config (PUT /devices/:id/ports/batch)
    if (lowerPath.endsWith('/ports/batch')) {
      const portIds: string[] = Array.isArray(body.port_ids) ? body.port_ids : [];
      const updates = body.updates && typeof body.updates === 'object' ? body.updates : body;
      const firstIface = portIds[0] || '';
      const platform = resolveDevicePlatformForPreview(ctx.device, firstIface);
      if (portIds.length > 0) {
        const ifaceLabel = portIds.length <= 4 ? portIds.join(', ') : `${portIds.slice(0, 3).join(', ')} (+${portIds.length - 3} more)`;
        const sampleCli = buildDirectPortUpdateCli(platform, ifaceLabel, updates);
        if (sampleCli) {
          return truncatePreview(
            `! Batch Port Update (${portIds.length} interface(s))\n${sampleCli}`
          );
        }
      }
    }

    // 1d. Write Memory / Save Running Config
    if (lowerPath.endsWith('/write-memory') || lowerPath.endsWith('/save-running')) {
      const platform = resolveDevicePlatformForPreview(ctx.device);
      const isMikrotik = platform.includes('mikrotik') || platform.includes('routeros');
      return isMikrotik
        ? `/system backup save name=manual_backup\n/export terse`
        : `write memory\n! Save running-config to startup-config (NVRAM)${devLabel ? ` on ${devLabel}` : ''}`;
    }

    // 1e. Config Template Application
    if (lowerPath.endsWith('/template') || lowerPath.endsWith('/apply-template')) {
      const rawScript =
        body.renderedScript || body.commands || body.script || body.cli || '';
      if (typeof rawScript === 'string' && rawScript.trim()) {
        return truncatePreview(rawScript.trim());
      }
      if (Array.isArray(body.commands) && body.commands.length > 0) {
        return truncatePreview(body.commands.join('\n'));
      }
      const tplName = body.templateName || body.name || body.templateId || 'Template';
      return `Apply Configuration Template "${tplName}"${devLabel ? ` on ${devLabel}` : ''}`;
    }

    // 1f. MikroTik VPN routes (/devices/:id/vpn/...)
    const vpnIdx = lowerPath.indexOf('/vpn');
    if (vpnIdx >= 0) {
      const vpnSub = urlPath.slice(vpnIdx + 4).replace(/^\/+/, '').replace(/\//g, ' ') || 'operation';
      const cleaned = sanitizeObjectForPreview(body);
      const kv = formatKeyValuesReadable(cleaned);
      const header = `/vpn ${vpnSub} (${method})${devLabel ? ` — ${devLabel}` : ''}`;
      return truncatePreview(kv.length > 0 ? `${header}\n${kv.join('\n')}` : header);
    }

    // 1g. Device Export / Import / Delete / Update
    if (lowerPath.endsWith('/devices/export')) {
      const format = String(body.format || 'json').toUpperCase();
      const count = Array.isArray(body.deviceIds) && body.deviceIds.length > 0
        ? body.deviceIds.length
        : 'All';
      return `Export Network Devices (${count} device(s), Format: ${format})${ctx.extraSummary ? `\n${ctx.extraSummary}` : ''}`;
    }
    if (lowerPath.endsWith('/import')) {
      const count = Array.isArray(body.devices) ? body.devices.length : body.csvData ? 'CSV package' : '1';
      return `Import Network Devices (${count}, Conflict mode: ${body.conflictMode || 'skip'})`;
    }
    if (lowerPath.endsWith('/devices/bulk-delete')) {
      const ids = Array.isArray(body.deviceIds) ? body.deviceIds : Array.isArray(body.ids) ? body.ids : [];
      return `Bulk Delete ${ids.length} Network Device(s)\nTargets: ${ids.join(', ')}`;
    }
    if (method === 'DELETE' && /\/devices\/[^/]+$/i.test(lowerPath)) {
      return `Delete Network Device: ${devLabel || 'Selected Device'}`;
    }
    if ((method === 'PUT' || method === 'PATCH') && /\/devices\/[^/]+$/i.test(lowerPath)) {
      const cleaned = sanitizeObjectForPreview(body);
      const kv = formatKeyValuesReadable(cleaned);
      return truncatePreview(
        `Update Device Properties${devLabel ? ` (${devLabel})` : ''}${kv.length ? `:\n${kv.join('\n')}` : ''}`
      );
    }
  }

  // Global templates apply route
  if (lowerPath.endsWith('/templates/apply')) {
    const rawScript = body.renderedScript || body.commands || body.script || '';
    if (typeof rawScript === 'string' && rawScript.trim()) {
      return truncatePreview(rawScript.trim());
    }
    const tplName = body.templateName || body.templateId || 'Template';
    const targetIds = Array.isArray(body.deviceIds) ? body.deviceIds : [];
    return `Apply Template "${tplName}"${targetIds.length ? ` to ${targetIds.length} device(s)` : ''}`;
  }

  // ---------------------------------------------------------------------------
  // 2. REMOTE SERVER OPERATIONS (/api/remote-servers/...)
  // ---------------------------------------------------------------------------
  if (lowerPath.includes('/remote-servers')) {
    const srvLabel = ctx.server?.name
      ? `${ctx.server.name}${ctx.server.ip ? ` (${ctx.server.ip})` : ''}`
      : ctx.server?.ip || ctx.server?.id || '';
    const isWindows = String(ctx.server?.os_type || '').toLowerCase().includes('win');

    // Power control
    if (lowerPath.endsWith('/restart')) {
      const actionType = String(body.actionType || body.action || 'restart').toLowerCase();
      const delayMin = Number(body.delayMinutes || 0);
      if (isWindows) {
        const flag = actionType === 'poweroff' || actionType === 'shutdown' ? '/s' : '/r';
        return `shutdown ${flag} /t ${Math.max(0, Math.round(delayMin * 60))}${body.force ? ' /f' : ''}`;
      }
      const flag = actionType === 'poweroff' || actionType === 'shutdown' ? '-h' : '-r';
      return `sudo shutdown ${flag} ${delayMin > 0 ? `+${delayMin}` : 'now'}`;
    }

    if (lowerPath.endsWith('/bulk-power')) {
      const actionType = String(body.actionType || 'restart').toUpperCase();
      const ids = Array.isArray(body.serverIds) ? body.serverIds : [];
      const delay = Number(body.delayMinutes || 0);
      return `Bulk Server Power Control: ${actionType} (${ids.length} server(s))${delay > 0 ? `, Delay: ${delay}m` : ''}\nTargets: ${ids.join(', ')}`;
    }

    // Service action
    if (lowerPath.endsWith('/service-action')) {
      const svc = body.service || body.serviceName || body.unit || '<service>';
      const act = body.action || 'restart';
      return isWindows
        ? `${String(act).charAt(0).toUpperCase() + String(act).slice(1)}-Service -Name "${svc}"`
        : `sudo systemctl ${act} ${svc}`;
    }

    // Process action
    if (lowerPath.endsWith('/process-action')) {
      const pid = body.pid || '<pid>';
      const sig = body.signal || (body.action === 'kill' ? 'KILL' : 'TERM');
      return isWindows
        ? `Stop-Process -Id ${pid}${sig === 'KILL' ? ' -Force' : ''}`
        : `sudo kill -${sig} ${pid}`;
    }

    // Network interface & restart
    if (lowerPath.endsWith('/interface-state')) {
      const iface = body.interface || body.iface || '<interface>';
      const state = body.state || body.action || 'up';
      return `sudo ip link set dev ${iface} ${state}`;
    }
    if (lowerPath.endsWith('/restart-network')) {
      return `sudo systemctl restart NetworkManager || sudo systemctl restart networking`;
    }
    if (lowerPath.endsWith('/ssh-port')) {
      return `Update /etc/ssh/sshd_config -> Port ${body.port || 22}\nsudo systemctl restart sshd`;
    }

    // Firewall rules
    if (lowerPath.includes('/firewall/rule')) {
      const subAction = lowerPath.endsWith('/delete') || method === 'DELETE'
        ? 'delete'
        : lowerPath.endsWith('/update')
        ? 'update'
        : 'add';
      const ruleAction = body.action || body.ruleAction || 'allow';
      const proto = body.protocol || 'tcp';
      const port = body.port || body.toPort || '';
      const src = body.source || body.from || 'any';
      return `Firewall Rule (${subAction}): ${ruleAction} ${port ? `${port}/${proto}` : proto} from ${src}`;
    }

    // Packages
    if (lowerPath.endsWith('/packages/update-all')) {
      return `sudo apt-get update && sudo apt-get upgrade -y  # (or dnf upgrade -y)`;
    }
    if (lowerPath.endsWith('/packages/update-selected')) {
      const pkgs = Array.isArray(body.packages) ? body.packages.join(' ') : '';
      return `sudo apt-get install --only-upgrade -y ${pkgs}`.trim();
    }
    if (lowerPath.endsWith('/packages/update-single')) {
      return `sudo apt-get install --only-upgrade -y ${body.package || body.name || '<package>'}`;
    }
    if (lowerPath.endsWith('/packages/repo-update')) {
      return `sudo apt-get update`;
    }
    if (lowerPath.endsWith('/packages/autoremove')) {
      return `sudo apt-get autoremove -y`;
    }

    // Filesystem
    if (lowerPath.endsWith('/fs/write')) {
      const len = typeof body.content === 'string' ? body.content.length : 0;
      return `Write file: ${body.path || '<path>'} (${len} bytes)`;
    }
    if (lowerPath.endsWith('/fs/mkdir')) {
      return `mkdir -p ${body.path || '<path>'}`;
    }
    if (lowerPath.endsWith('/fs/touch')) {
      return `touch ${body.path || '<path>'}`;
    }
    if (lowerPath.endsWith('/fs/rename')) {
      return `mv "${body.oldPath || body.from || ''}" "${body.newPath || body.to || ''}"`;
    }
    if (lowerPath.endsWith('/fs/paste')) {
      const cmd = body.mode === 'cut' ? 'mv' : 'cp -r';
      const srcs = Array.isArray(body.sources) ? body.sources.join(' ') : '';
      return `${cmd} ${srcs} -> ${body.destination || '<dest>'}`;
    }
    if (lowerPath.endsWith('/fs/delete')) {
      const paths = Array.isArray(body.paths) ? body.paths : [body.path];
      return `rm -rf ${paths.filter(Boolean).join(' ')}`;
    }
    if (lowerPath.endsWith('/fs/update-attributes')) {
      const ops: string[] = [];
      if (body.mode || body.permissions) ops.push(`chmod ${body.mode || body.permissions} ${body.path}`);
      if (body.owner || body.group) ops.push(`chown ${body.owner || ''}${body.group ? `:${body.group}` : ''} ${body.path}`);
      return ops.join('\n') || `Update attributes on ${body.path || '<path>'}`;
    }

    // Cron Jobs
    if (lowerPath.includes('/cron-jobs/')) {
      const act = urlPath.split('/').pop();
      const expr = [body.schedule, body.command || body.cmd].filter(Boolean).join(' ');
      return `crontab (${act})${body.user ? ` [user: ${body.user}]` : ''}: ${expr || body.id || ''}`.trim();
    }

    // PostgreSQL / MySQL SQL queries & ops
    if ((lowerPath.endsWith('/postgres/query') || lowerPath.endsWith('/mysql/query')) && (body.sql || body.query)) {
      const sql = String(body.sql || body.query).trim();
      const db = body.database || body.dbName || '';
      return truncatePreview(`${db ? `-- Database: ${db}\n` : ''}${sql}`);
    }

    // Export / Import / Server CRUD
    if (lowerPath.endsWith('/remote-servers/export')) {
      const format = String(body.format || 'json').toUpperCase();
      const count = Array.isArray(body.serverIds) && body.serverIds.length > 0 ? body.serverIds.length : 'All';
      return `Export Remote Servers (${count} server(s), Format: ${format})${ctx.extraSummary ? `\n${ctx.extraSummary}` : ''}`;
    }
    if (lowerPath.endsWith('/remote-servers/import')) {
      const count = Array.isArray(body.servers) ? body.servers.length : body.csvData ? 'CSV package' : '1';
      return `Import Remote Servers (${count}, Conflict mode: ${body.conflictMode || 'skip'})`;
    }
    if (method === 'DELETE' && /\/remote-servers\/[^/]+$/i.test(lowerPath)) {
      return `Delete Remote Server: ${srvLabel || 'Selected Server'}`;
    }
    if ((method === 'PUT' || method === 'PATCH') && /\/remote-servers\/[^/]+$/i.test(lowerPath)) {
      const cleaned = sanitizeObjectForPreview(body);
      const kv = formatKeyValuesReadable(cleaned);
      return truncatePreview(
        `Update Server Properties${srvLabel ? ` (${srvLabel})` : ''}${kv.length ? `:\n${kv.join('\n')}` : ''}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 3. CLEAN HUMANIZED FALLBACK (NEVER RAW "POST /api/... + JSON")
  // ---------------------------------------------------------------------------
  const readablePath = urlPath
    .replace(/^\/api\//i, '')
    .replace(/\/dev-[a-z0-9-]+/gi, '')
    .replace(/\/srv-[a-z0-9-]+/gi, '')
    .split('/')
    .filter(Boolean)
    .map((seg) => seg.replace(/[-_]+/g, ' '))
    .join(' / ');

  const targetName = ctx.device?.name || ctx.server?.name || ctx.device?.ip || ctx.server?.ip || '';
  const cleanedBody = sanitizeObjectForPreview(body);
  const kvLines = formatKeyValuesReadable(cleanedBody);

  const lines: string[] = [];
  if (ctx.action) {
    lines.push(`Action: ${ctx.action.replace(/_/g, ' ')}${targetName ? ` -> ${targetName}` : ''}`);
  } else {
    lines.push(`Action: ${readablePath || method}${targetName ? ` -> ${targetName}` : ''}`);
  }
  if (ctx.extraSummary) {
    lines.push(`Summary: ${ctx.extraSummary}`);
  }
  if (kvLines.length > 0) {
    lines.push('Parameters:');
    lines.push(...kvLines);
  }
  return truncatePreview(lines.join('\n'));
}
