import crypto from 'crypto';
import http from 'http';
import { generateToken } from './auth';
import { getActiveVaultMasterSecret, getAllCandidateMasterSecrets } from './vaultCrypto';
import { ActionApprovalRequest, ApprovalExecutionMode } from '../src/types';

export interface SignedHttpExecutionDescriptor {
  method: string;
  path: string;
  body?: Record<string, any> | null;
  entityType: string;
  entityId: string;
  actionKey: string;
  requesterUsername: string;
  hmac: string;
}

const INTERACTIVE_JIT_ACTIONS = new Set([
  'terminal',
  'file_explorer',
  'web_configs',
  'inspect_ports',
]);

const STRUCTURED_AUTO_ACTIONS = new Set([
  'write_memory',
  'cisco_config_write_memory',
  'apply_template',
  'power_control',
  'bulk_power',
  'port_power',
  'port_mode',
  'port_vlan',
  'port_description',
  'port_security',
  'port_bridge',
  'port_speed',
  'port_cable_test',
  'ping_keepalive',
  'device_note',
  'delete_device',
  'delete_server',
  'mikrotik_backup',
  'mikrotik_safe_mode',
  'mikrotik_vpn',
  'mikrotik_firewall',
  'mikrotik_bridge_vlan',
  'mikrotik_ip_pool',
  'cisco_config_device',
  'server_management',
  'web_management',
  'database_management',
  'edit_properties',
]);

const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'passwd',
  'secret',
  'private_key',
  'privatekey',
  'ssh_key',
  'sudo_password',
  'root_password',
  'token',
  'api_key',
  'apikey',
];

export function sanitizeActionParams(raw: any): Record<string, any> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === '_httpExecution') {
      clean[k] = v;
      continue;
    }
    const low = k.toLowerCase();
    if (SENSITIVE_KEY_FRAGMENTS.some((frag) => low.includes(frag))) {
      continue;
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      clean[k] = sanitizeActionParams(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

export function isInteractiveJitAction(actionKey?: string | null): boolean {
  const clean = (actionKey || '').trim().toLowerCase();
  if (!clean) return true;
  return INTERACTIVE_JIT_ACTIONS.has(clean);
}

function buildCanonicalExecutionString(descriptor: Omit<SignedHttpExecutionDescriptor, 'hmac'>): string {
  return JSON.stringify({
    method: descriptor.method.toUpperCase(),
    path: descriptor.path,
    body: descriptor.body || null,
    entityType: descriptor.entityType,
    entityId: descriptor.entityId,
    actionKey: descriptor.actionKey,
    requesterUsername: descriptor.requesterUsername.toLowerCase(),
  });
}

export function buildSignedHttpExecutionPayload(params: {
  method: string;
  originalUrl: string;
  body?: any;
  entityType: string;
  entityId: string;
  actionKey: string;
  requesterUsername: string;
}): SignedHttpExecutionDescriptor | null {
  const method = (params.method || 'POST').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;

  let normalizedPath = (params.originalUrl || '').trim();
  if (!normalizedPath) return null;
  if (!normalizedPath.startsWith('/api/')) {
    if (normalizedPath.startsWith('/')) {
      normalizedPath = `/api${normalizedPath}`;
    } else {
      normalizedPath = `/api/${normalizedPath}`;
    }
  }
  // Never sign an approval management endpoint recursively
  if (normalizedPath.startsWith('/api/approvals')) return null;

  const safeBody = sanitizeActionParams(params.body);
  const base: Omit<SignedHttpExecutionDescriptor, 'hmac'> = {
    method,
    path: normalizedPath,
    body: safeBody,
    entityType: String(params.entityType),
    entityId: String(params.entityId),
    actionKey: String(params.actionKey),
    requesterUsername: String(params.requesterUsername || '').trim().toLowerCase(),
  };

  const canonical = buildCanonicalExecutionString(base);
  const hmac = crypto
    .createHmac('sha256', getActiveVaultMasterSecret())
    .update(canonical)
    .digest('hex');

  return { ...base, hmac };
}

export function verifySignedHttpExecutionPayload(
  rawDescriptor: any,
  ticket: Pick<ActionApprovalRequest, 'targetEntityType' | 'targetEntityId' | 'actionKey' | 'requesterUsername'>
): SignedHttpExecutionDescriptor | null {
  if (!rawDescriptor || typeof rawDescriptor !== 'object') return null;
  const method = String(rawDescriptor.method || '').toUpperCase();
  const execPath = String(rawDescriptor.path || '').trim();
  const hmac = String(rawDescriptor.hmac || '').trim();

  if (!method || !execPath.startsWith('/api/') || execPath.startsWith('/api/approvals') || !hmac) {
    return null;
  }
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return null;
  }

  if (
    String(rawDescriptor.entityType || '') !== String(ticket.targetEntityType || '') ||
    String(rawDescriptor.entityId || '') !== String(ticket.targetEntityId || '') ||
    String(rawDescriptor.actionKey || '') !== String(ticket.actionKey || '')
  ) {
    return null;
  }

  const base: Omit<SignedHttpExecutionDescriptor, 'hmac'> = {
    method,
    path: execPath,
    body: rawDescriptor.body && typeof rawDescriptor.body === 'object' ? rawDescriptor.body : null,
    entityType: String(rawDescriptor.entityType),
    entityId: String(rawDescriptor.entityId),
    actionKey: String(rawDescriptor.actionKey),
    requesterUsername: String(rawDescriptor.requesterUsername || '').trim().toLowerCase(),
  };

  const canonical = buildCanonicalExecutionString(base);
  const candidates = getAllCandidateMasterSecrets();

  for (const secret of candidates) {
    try {
      const expected = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
      const bufA = Buffer.from(hmac, 'hex');
      const bufB = Buffer.from(expected, 'hex');
      if (bufA.length === bufB.length && bufA.length > 0 && crypto.timingSafeEqual(bufA, bufB)) {
        return { ...base, hmac };
      }
    } catch {}
  }

  return null;
}

export function resolveExecutionModeForAction(
  actionKey?: string | null,
  actionParams?: Record<string, any> | null
): {
  executionMode: ApprovalExecutionMode;
  supportsAutoExecute: boolean;
} {
  const cleanKey = (actionKey || '').trim().toLowerCase();
  if (isInteractiveJitAction(cleanKey)) {
    return { executionMode: 'jit_session', supportsAutoExecute: false };
  }

  if (actionParams && actionParams._httpExecution) {
    return { executionMode: 'auto_command', supportsAutoExecute: true };
  }

  if (cleanKey === 'write_memory' || cleanKey === 'cisco_config_write_memory' || cleanKey === 'ping_keepalive') {
    return { executionMode: 'auto_command', supportsAutoExecute: true };
  }

  if (cleanKey === 'power_control' || cleanKey === 'delete_device' || cleanKey === 'delete_server') {
    return { executionMode: 'auto_command', supportsAutoExecute: true };
  }

  if (
    cleanKey === 'apply_template' &&
    actionParams &&
    (actionParams.templateId || actionParams.template_id || actionParams.commands)
  ) {
    return { executionMode: 'auto_command', supportsAutoExecute: true };
  }

  if (
    cleanKey.startsWith('port_') &&
    actionParams &&
    (actionParams.portId || actionParams.port_id || actionParams.portName || actionParams.interface)
  ) {
    return { executionMode: 'auto_command', supportsAutoExecute: true };
  }

  if (STRUCTURED_AUTO_ACTIONS.has(cleanKey) || cleanKey.startsWith('cisco_config_') || cleanKey.startsWith('mikrotik_')) {
    return { executionMode: 'auto_command', supportsAutoExecute: false };
  }

  return { executionMode: 'jit_session', supportsAutoExecute: false };
}

function getInternalListeningPort(): number {
  if (process.env.APP_PORT) {
    const v = parseInt(process.env.APP_PORT, 10);
    if (!isNaN(v)) return v;
  }
  if (process.env.PORT && process.env.PORT !== '8080') {
    const v = parseInt(process.env.PORT, 10);
    if (!isNaN(v)) return v;
  }
  return 3000;
}

function resolveStructuredFallbackEndpoint(ticket: ActionApprovalRequest): {
  method: string;
  path: string;
  body?: Record<string, any> | null;
} | null {
  const key = (ticket.actionKey || '').trim().toLowerCase();
  const params = ticket.actionParams && typeof ticket.actionParams === 'object' ? ticket.actionParams : {};
  const entityId = encodeURIComponent(ticket.targetEntityId);

  if (ticket.targetEntityType === 'device') {
    if (key === 'write_memory' || key === 'cisco_config_write_memory') {
      return { method: 'POST', path: `/api/devices/${entityId}/write-memory`, body: {} };
    }
    if (key === 'ping_keepalive') {
      return { method: 'POST', path: `/api/devices/${entityId}/ping`, body: {} };
    }
    if (key === 'delete_device' && ticket.targetEntityId !== 'bulk') {
      return { method: 'DELETE', path: `/api/devices/${entityId}`, body: {} };
    }
    if (key === 'apply_template' && (params.templateId || params.template_id)) {
      return {
        method: 'POST',
        path: `/api/devices/${entityId}/apply-template`,
        body: {
          template_id: params.templateId || params.template_id,
          variables: params.variables || {},
        },
      };
    }
    if (key.startsWith('port_') && (params.portId || params.port_id || params.portName)) {
      const portRef = encodeURIComponent(String(params.portId || params.port_id || params.portName));
      return {
        method: 'PUT',
        path: `/api/devices/${entityId}/ports/${portRef}`,
        body: sanitizeActionParams(params) || {},
      };
    }
  }

  if (ticket.targetEntityType === 'server') {
    if (key === 'power_control' && ticket.targetEntityId !== 'bulk') {
      return {
        method: 'POST',
        path: `/api/remote-servers/${entityId}/restart`,
        body: {
          actionType: params.actionType || 'restart',
          delayMinutes: Number(params.delayMinutes) || 0,
          notifyUsers: Boolean(params.notifyUsers),
          message: params.message || undefined,
          force: params.force !== undefined ? Boolean(params.force) : true,
        },
      };
    }
    if ((key === 'bulk_power' || (key === 'power_control' && ticket.targetEntityId === 'bulk')) && Array.isArray(params.serverIds)) {
      return {
        method: 'POST',
        path: '/api/remote-servers/bulk-power',
        body: {
          serverIds: params.serverIds,
          actionType: params.actionType || 'restart',
          delayMinutes: Number(params.delayMinutes) || 0,
          notifyUsers: Boolean(params.notifyUsers),
          message: params.message || undefined,
          force: params.force !== undefined ? Boolean(params.force) : true,
        },
      };
    }
    if (key === 'delete_server' && ticket.targetEntityId !== 'bulk') {
      return { method: 'DELETE', path: `/api/remote-servers/${entityId}`, body: {} };
    }
  }

  return null;
}

function invokeInternalApi(params: {
  method: string;
  path: string;
  body?: Record<string, any> | null;
  bearerToken: string;
  approvalRequestId: string;
  operatorUsername: string;
  timeoutMs?: number;
}): Promise<{ statusCode: number; json: any; rawText: string }> {
  return new Promise((resolve, reject) => {
    const port = getInternalListeningPort();
    const payloadStr =
      params.body && params.method !== 'GET' && params.method !== 'DELETE'
        ? JSON.stringify(params.body)
        : params.body && Object.keys(params.body).length > 0 && params.method === 'DELETE'
        ? JSON.stringify(params.body)
        : '';

    const headers: Record<string, string> = {
      Authorization: `Bearer ${params.bearerToken}`,
      'X-Approval-Request-Id': params.approvalRequestId,
      'X-Internal-Approval-Exec': '1',
      'x-user-name': params.operatorUsername,
      'x-operator-user': params.operatorUsername,
      'Accept-Language': 'en',
    };
    if (payloadStr) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(payloadStr));
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: params.path,
        method: params.method,
        headers,
        timeout: params.timeoutMs || 45000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          const rawText = Buffer.concat(chunks).toString('utf-8');
          let json: any = null;
          try {
            json = JSON.parse(rawText);
          } catch {
            json = null;
          }
          resolve({
            statusCode: res.statusCode || 500,
            json,
            rawText,
          });
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy(new Error('Internal execution request timed out after 45s'));
    });

    if (payloadStr) {
      req.write(payloadStr);
    }
    req.end();
  });
}

function formatRealDeviceOutput(res: { statusCode: number; json: any; rawText: string }, endpoint: { method: string; path: string }): string {
  const lines: string[] = [`[${endpoint.method} ${endpoint.path}] HTTP ${res.statusCode}`];
  const j = res.json;
  if (j && typeof j === 'object') {
    if (j.cli_command) lines.push(`CLI: ${j.cli_command}`);
    if (j.command) lines.push(`Command: ${j.command}`);
    if (j.message) lines.push(`Message: ${j.message}`);
    if (j.error) lines.push(`Error: ${j.error}`);
    if (typeof j.output === 'string' && j.output.trim()) {
      lines.push('--- Device Output ---');
      lines.push(j.output.trim());
    } else if (typeof j.stdout === 'string' && j.stdout.trim()) {
      lines.push('--- Stdout ---');
      lines.push(j.stdout.trim());
    } else if (Array.isArray(j.results)) {
      lines.push(`--- Batch Results (${j.results.length}) ---`);
      lines.push(JSON.stringify(j.results, null, 2));
    } else if (!j.message && !j.error) {
      lines.push(JSON.stringify(j, null, 2));
    }
  } else if (res.rawText) {
    lines.push(res.rawText);
  }
  const combined = lines.join('\n');
  return combined.length > 16000 ? `${combined.slice(0, 16000)}\n...[truncated]` : combined;
}

export async function executeApprovedPayloadOnBackend(
  ticket: ActionApprovalRequest
): Promise<{
  success: boolean;
  output: string;
  summaryEn: string;
  summaryFa: string;
  httpStatus?: number;
}> {
  if (isInteractiveJitAction(ticket.actionKey)) {
    return {
      success: false,
      output: 'Interactive session actions use a time-limited JIT Pass instead of headless command execution.',
      summaryEn: 'Interactive action requires launching the session directly using its active JIT Pass.',
      summaryFa: 'عملیات‌های تعاملی دارای گذرنامه موقت (JIT Pass) هستند و باید مستقیماً از طریق دکمه ورود باز شوند.',
    };
  }

  const rawHttpExec =
    ticket.actionParams && typeof ticket.actionParams === 'object'
      ? (ticket.actionParams as any)._httpExecution
      : null;

  let targetExec: { method: string; path: string; body?: Record<string, any> | null } | null = null;

  if (rawHttpExec) {
    const verified = verifySignedHttpExecutionPayload(rawHttpExec, {
      targetEntityType: ticket.targetEntityType,
      targetEntityId: ticket.targetEntityId,
      actionKey: ticket.actionKey || '',
      requesterUsername: ticket.requesterUsername,
    });
    if (!verified) {
      return {
        success: false,
        output: 'SECURITY_REJECTED: Signed execution descriptor failed cryptographic integrity verification.',
        summaryEn: 'Execution blocked: encrypted payload signature verification failed.',
        summaryFa: 'اجرا مسدود شد: امضای امنیتی پیلود دستور نامعتبر است.',
      };
    }
    targetExec = {
      method: verified.method,
      path: verified.path,
      body: verified.body || null,
    };
  } else {
    targetExec = resolveStructuredFallbackEndpoint(ticket);
  }

  if (!targetExec) {
    return {
      success: false,
      output:
        'No structured API execution payload is attached to this ticket. Trigger the operation from the device/server screen while this approval ticket is active.',
      summaryEn:
        'No structured command payload attached; run the action from the target menu using this active ticket.',
      summaryFa:
        'پیلود دستوری خودکار به این تیکت متصل نیست؛ عملیات را مستقیماً از منوی تجهیز یا سرور با همین تیکت اجرا کنید.',
    };
  }

  // Generate short-lived requester token so all RBAC scope & device drivers execute under the requester's exact identity
  const requesterToken = generateToken(
    {
      userId: ticket.requesterUserId,
      username: ticket.requesterUsername,
      fullName: ticket.requesterFullName || ticket.requesterUsername,
      email: '',
      role: ticket.requesterRole || 'Operator',
      userType: 'local',
    },
    false
  );

  try {
    const res = await invokeInternalApi({
      method: targetExec.method,
      path: targetExec.path,
      body: targetExec.body,
      bearerToken: requesterToken,
      approvalRequestId: ticket.id,
      operatorUsername: ticket.requesterUsername,
    });

    const formattedOutput = formatRealDeviceOutput(res, targetExec);
    const succeeded =
      res.statusCode >= 200 &&
      res.statusCode < 400 &&
      (!res.json || typeof res.json !== 'object' || res.json.success !== false);

    if (succeeded) {
      const msg =
        (res.json && (res.json.message || res.json.message_en)) ||
        `${targetExec.method} ${targetExec.path} completed cleanly (HTTP ${res.statusCode})`;
      return {
        success: true,
        output: formattedOutput,
        summaryEn: String(msg),
        summaryFa:
          (res.json && res.json.message_fa) ||
          `عملیات با موفقیت روی تجهیز/سرور اجرا شد (کد وضعیت ${res.statusCode}).`,
        httpStatus: res.statusCode,
      };
    }

    const errMsg =
      (res.json && (res.json.error || res.json.message)) ||
      `Execution failed with HTTP ${res.statusCode}`;
    return {
      success: false,
      output: formattedOutput,
      summaryEn: String(errMsg),
      summaryFa:
        (res.json && res.json.errorFa) ||
        `اجرای دستور روی دستگاه با خطا مواجه شد: ${errMsg}`,
      httpStatus: res.statusCode,
    };
  } catch (err: any) {
    const msg = err?.message || 'Failed to invoke target execution endpoint';
    return {
      success: false,
      output: `[Execution Error] ${msg}`,
      summaryEn: msg,
      summaryFa: `خطا در ارتباط اجرایی با سرویس هدف: ${msg}`,
    };
  }
}
